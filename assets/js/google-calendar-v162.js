import {data,runtime,patientById} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {toast} from './ui.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const PENDING_STORAGE='rm.google.calendar.pending.v1';
const TIMEZONE=Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo';
const SCOPE='https://www.googleapis.com/auth/calendar.events';
let accessToken='';
let expiresAt=0;
let tokenClient=null;
let flushing=false;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;
const getPending=()=>{try{return JSON.parse(localStorage.getItem(PENDING_STORAGE)||'[]')}catch{return[]}};
const setPending=list=>localStorage.setItem(PENDING_STORAGE,JSON.stringify([...new Set(list.filter(Boolean))].slice(-500)));
function addPending(id){if(!id)return;const list=getPending();if(!list.includes(id)){list.push(id);setPending(list)}paintSettings()}
function removePending(id){setPending(getPending().filter(x=>x!==id));paintSettings()}
function tokenValid(){return Boolean(accessToken&&expiresAt>Date.now()+60000)}
function clientId(){return (localStorage.getItem(CLIENT_STORAGE)||'').trim()}

async function saveToken(token,seconds){
  accessToken=token;expiresAt=Date.now()+Math.max(60,Number(seconds||3600))*1000;
  if(runtime.key){const encrypted=await encryptJson(runtime.key,{token:accessToken,expiresAt},'google-calendar-token');localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted))}
}
async function loadStoredToken(){
  if(!runtime.key)return false;let raw;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw)return false;try{const value=await decryptJson(runtime.key,raw,'google-calendar-token');if(value?.token&&Number(value.expiresAt)>Date.now()+60000){accessToken=value.token;expiresAt=Number(value.expiresAt);return true}}catch{}
  localStorage.removeItem(TOKEN_STORAGE);accessToken='';expiresAt=0;return false;
}
function clearToken(){accessToken='';expiresAt=0;tokenClient=null;localStorage.removeItem(TOKEN_STORAGE);paintSettings()}

function loadGoogleIdentity(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let s=document.querySelector('script[data-rm-google-identity]');
    if(s){s.addEventListener('load',()=>resolve(),{once:true});s.addEventListener('error',()=>reject(new Error('Falha ao carregar autorização do Google.')),{once:true});return}
    s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.dataset.rmGoogleIdentity='1';s.onload=()=>resolve();s.onerror=()=>reject(new Error('Falha ao carregar autorização do Google.'));document.head.appendChild(s);
  });
}
async function connectGoogle(){
  const id=clientId();if(!id)throw new Error('Informe primeiro o Google OAuth Client ID.');
  await loadGoogleIdentity();
  return new Promise((resolve,reject)=>{
    tokenClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:async response=>{
      if(response?.error){reject(new Error(response.error_description||response.error));return}
      try{await saveToken(response.access_token,response.expires_in);toast('Google Agenda conectado.','success');paintSettings();await flushPending();resolve(true)}catch(err){reject(err)}
    }});
    tokenClient.requestAccessToken({prompt:'consent'});
  });
}

function localDateTime(date,time){return `${date}T${time||'00:00'}:00`}
function addMinutes(date,time,minutes){const d=new Date(localDateTime(date,time));d.setMinutes(d.getMinutes()+Number(minutes||50));const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'),h=String(d.getHours()).padStart(2,'0'),min=String(d.getMinutes()).padStart(2,'0');return`${y}-${m}-${day}T${h}:${min}:00`}
async function eventIdFor(value){
  const bytes=new TextEncoder().encode(String(value||'')),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),alphabet='0123456789abcdefghijklmnopqrstuv';let bits=0,buffer=0,out='rm';
  for(const b of hash){buffer=(buffer<<8)|b;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(buffer>>bits)&31]}}
  if(bits>0)out+=alphabet[(buffer<<(5-bits))&31];return out;
}
function eventPayload(a){
  const p=patientById(a.patientId),code=p?.code||'Paciente';
  return {summary:`Sessão clínica · ${code}`,description:'Sessão registrada na Plataforma Clínica. Nenhum conteúdo clínico é enviado ao Google Agenda.',start:{dateTime:localDateTime(a.date,a.time),timeZone:TIMEZONE},end:{dateTime:addMinutes(a.date,a.time,a.duration),timeZone:TIMEZONE},visibility:'private',transparency:'opaque',reminders:{useDefault:false,overrides:[{method:'popup',minutes:30}]},extendedProperties:{private:{rmAppointmentId:a.id}}};
}
async function googleFetch(url,options={}){
  if(!tokenValid())throw new Error('Google Agenda precisa ser reconectado.');
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(response.status===401){clearToken();throw new Error('A autorização do Google Agenda expirou. Reconecte em Configurações.')}
  return response;
}
async function upsertAppointment(a){
  if(!a?.id||!a.date||!a.time)return;const id=await eventIdFor(a.id),base='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  if(a.status==='Cancelada'||a.attendanceStatus==='Desmarcou'){
    const del=await googleFetch(`${base}/${encodeURIComponent(id)}?sendUpdates=none`,{method:'DELETE'});if(del.ok||del.status===404){removePending(a.id);return}throw new Error(`Google Agenda respondeu ${del.status}.`)
  }
  const payload={id,...eventPayload(a)};
  let response=await googleFetch(`${base}?sendUpdates=none`,{method:'POST',body:JSON.stringify(payload)});
  if(response.status===409){response=await googleFetch(`${base}/${encodeURIComponent(id)}?sendUpdates=none`,{method:'PUT',body:JSON.stringify(eventPayload(a))})}
  if(!response.ok)throw new Error(`Google Agenda respondeu ${response.status}.`);removePending(a.id);
}
async function syncOne(id,{quiet=false}={}){
  const a=appointmentById(id);if(!a){removePending(id);return}
  if(!tokenValid()){addPending(id);if(!quiet)toast('Agendamento salvo. Conecte o Google Agenda para criar o lembrete de 30 minutos.','');return}
  try{await upsertAppointment(a);if(!quiet)toast('Google Agenda atualizado com lembrete de 30 minutos.','success')}catch(err){addPending(id);if(!quiet)toast(err.message||'Não foi possível atualizar o Google Agenda.','error')}
}
async function flushPending(){
  if(flushing||!tokenValid())return;flushing=true;try{for(const id of getPending())await syncOne(id,{quiet:true})}finally{flushing=false;paintSettings()}
}
async function reconcileUpcoming(){
  if(!tokenValid())throw new Error('Conecte o Google Agenda primeiro.');const today=new Date();today.setHours(0,0,0,0);const list=arr(data.appointments).filter(a=>a?.date&&new Date(`${a.date}T23:59:59`).getTime()>=today.getTime()).slice(0,150);for(const a of list)await upsertAppointment(a);toast(`${list.length} compromisso(s) conferido(s) no Google Agenda.`,'success');paintSettings();
}

function settingsMarkup(){
  const id=clientId(),pending=getPending().length,connected=tokenValid();
  return `<section id="rm-google-calendar" class="card mt-16"><div class="card-title"><div><div class="eyebrow">Integração</div><h3 class="mb-0">Google Agenda</h3></div><span class="badge">${connected?'Conectado':'Não conectado'}</span></div><p class="muted">Ao salvar ou remarcar uma sessão, a plataforma pode criar/atualizar um evento privado no seu Google Agenda com aviso 30 minutos antes. Para reduzir exposição, o título usa o código interno do paciente, não o nome.</p><div class="field"><label>Google OAuth Client ID</label><input id="rm-google-client-id" class="input" value="${id.replace(/"/g,'&quot;')}" placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"></div><div class="small muted mt-8">Use um OAuth Client ID de aplicativo Web no Google Cloud e autorize a origem <strong>https://ricmurtapsicologia.github.io</strong>. O Client ID é público; o token de acesso fica cifrado somente neste dispositivo e expira periodicamente.</div><div class="flex gap-8 wrap mt-16"><button class="btn secondary" data-action="google-calendar-save-client">Salvar Client ID</button><button class="btn" data-action="google-calendar-connect">${connected?'Renovar conexão':'Conectar Google Agenda'}</button><button class="btn secondary" data-action="google-calendar-reconcile" ${connected?'':'disabled'}>Sincronizar próximas sessões</button>${connected?'<button class="btn ghost" data-action="google-calendar-disconnect">Desconectar</button>':''}</div>${pending?`<div class="notice warning mt-12"><strong>${pending}</strong> alteração(ões) aguardando conexão com o Google Agenda.</div>`:''}<div class="small muted mt-12">O aviso no celular depende de as notificações do aplicativo Google Agenda estarem habilitadas no Android/iOS.</div></section>`;
}
function paintSettings(){
  if(runtime.locked||runtime.route!=='settings')return;const main=document.getElementById('main-content');if(!main)return;const old=document.getElementById('rm-google-calendar'),wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();const fresh=wrap.firstElementChild;if(old)old.replaceWith(fresh);else main.appendChild(fresh);
}
function addAgendaButtons(){
  if(runtime.locked||runtime.route!=='agenda')return;
  document.querySelectorAll('.week-event[data-id]').forEach(card=>{const actions=card.querySelector('.week-event-actions');if(!actions||actions.querySelector('[data-action="appointment-google-calendar"]'))return;const b=document.createElement('button');b.type='button';b.className='week-mini';b.dataset.action='appointment-google-calendar';b.dataset.id=card.dataset.id;b.title='Atualizar no Google Agenda';b.textContent='G';actions.appendChild(b)});
  document.querySelectorAll('.agenda-item').forEach(item=>{const edit=item.querySelector('[data-action="edit-appointment"][data-id]'),box=edit?.parentElement;if(!edit||!box||box.querySelector('[data-action="appointment-google-calendar"]'))return;const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.action='appointment-google-calendar';b.dataset.id=edit.dataset.id;b.textContent='Google Agenda';box.appendChild(b)});
}

async function activate(){await loadStoredToken();paintSettings();addAgendaButtons();if(tokenValid())flushPending()}
document.addEventListener('rm:data-ready',()=>activate());
document.addEventListener('rm:rendered',()=>{paintSettings();setTimeout(addAgendaButtons,0)});
document.addEventListener('rm:sync-status',e=>{if(e.detail?.status==='synced'){setTimeout(addAgendaButtons,80);if(tokenValid())flushPending()}});
document.addEventListener('rm:local-data-changed',e=>{if(globalThis.__rmSyncApplying||e.detail?.storeName!=='appointments')return;const id=e.detail?.id;if(id)setTimeout(()=>syncOne(id,{quiet:true}),500)});

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action]');if(!el)return;const a=el.dataset.action;if(!['google-calendar-save-client','google-calendar-connect','google-calendar-reconcile','google-calendar-disconnect','appointment-google-calendar'].includes(a))return;e.preventDefault();e.stopImmediatePropagation();try{
    if(a==='google-calendar-save-client'){const value=document.getElementById('rm-google-client-id')?.value.trim();if(!value)throw new Error('Informe o Client ID.');localStorage.setItem(CLIENT_STORAGE,value);tokenClient=null;toast('Client ID salvo neste dispositivo.','success');paintSettings();return}
    if(a==='google-calendar-connect'){const value=document.getElementById('rm-google-client-id')?.value.trim();if(value)localStorage.setItem(CLIENT_STORAGE,value);await connectGoogle();return}
    if(a==='google-calendar-reconcile'){await reconcileUpcoming();return}
    if(a==='google-calendar-disconnect'){clearToken();toast('Google Agenda desconectado deste dispositivo.','success');return}
    if(a==='appointment-google-calendar'){if(!tokenValid())throw new Error('Conecte o Google Agenda em Configurações.');await syncOne(el.dataset.id);return}
  }catch(err){toast(err.message||'Não foi possível concluir a integração com o Google Agenda.','error')}
},true);

setTimeout(()=>{if(globalThis.__rmDataReady)activate()},700);
