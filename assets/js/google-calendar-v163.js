import {data,runtime,patientById} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {toast} from './ui.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const PENDING_STORAGE='rm.google.calendar.pending.v2';
const LEGACY_PENDING_STORAGE='rm.google.calendar.pending.v1';
const MIRROR_STORAGE='rm.google.calendar.mirror.v1';
const SIGNATURE_STORAGE='rm.google.calendar.signature.v1';
const TIMEZONE=Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo';
const SCOPE='https://www.googleapis.com/auth/calendar.events';
let accessToken='';
let expiresAt=0;
let tokenClient=null;
let flushing=false;
let reconciling=false;
let reconcileTimer=null;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;
const getJson=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'null');return v??fallback}catch{return fallback}};
const setJson=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const getPending=()=>{
  const current=getJson(PENDING_STORAGE,null);
  if(Array.isArray(current))return current.filter(Boolean);
  const legacy=getJson(LEGACY_PENDING_STORAGE,[]);
  if(Array.isArray(legacy)&&legacy.length){setJson(PENDING_STORAGE,legacy);localStorage.removeItem(LEGACY_PENDING_STORAGE);return legacy.filter(Boolean)}
  return[];
};
const setPending=list=>setJson(PENDING_STORAGE,[...new Set(arr(list))].slice(-1000));
const getMirror=()=>new Set(arr(getJson(MIRROR_STORAGE,[])));
const saveMirror=set=>setJson(MIRROR_STORAGE,[...set].slice(-2000));
function mirrorAdd(id){if(!id)return;const set=getMirror();set.add(id);saveMirror(set)}
function mirrorDelete(id){if(!id)return;const set=getMirror();set.delete(id);saveMirror(set)}
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
      try{
        await saveToken(response.access_token,response.expires_in);
        toast('Google Agenda conectado. A sincronização automática está ativa.','success');
        paintSettings();
        await flushPending();
        await reconcileAutomatic({force:true,quiet:true});
        resolve(true);
      }catch(err){reject(err)}
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
  return {summary:`Sessão clínica · ${code}`,description:'Sessão registrada na Plataforma Clínica. Nenhum conteúdo clínico é enviado ao Google Agenda.',start:{dateTime:localDateTime(a.date,a.time),timeZone:TIMEZONE},end:{dateTime:addMinutes(a.date,a.time,a.duration),timeZone:TIMEZONE},visibility:'private',transparency:'opaque',reminders:{useDefault:false,overrides:[{method:'popup',minutes:30}]},extendedProperties:{private:{rmAppointmentId:a.id,rmSource:'plataforma-terapeutica'}}};
}
async function googleFetch(url,options={}){
  if(!tokenValid())throw new Error('Google Agenda precisa ser reconectado.');
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(response.status===401){clearToken();throw new Error('A autorização do Google Agenda expirou. Reconecte em Configurações.')}
  return response;
}
async function deleteGoogleEventByAppointmentId(id){
  if(!id)return;
  const eventId=await eventIdFor(id),base='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const response=await googleFetch(`${base}/${encodeURIComponent(eventId)}?sendUpdates=none`,{method:'DELETE'});
  if(!response.ok&&response.status!==404)throw new Error(`Google Agenda respondeu ${response.status}.`);
  mirrorDelete(id);removePending(id);
}
async function upsertAppointment(a){
  if(!a?.id||!a.date||!a.time)return;
  if(a.status==='Cancelada'||a.attendanceStatus==='Desmarcou'){await deleteGoogleEventByAppointmentId(a.id);return}
  const id=await eventIdFor(a.id),base='https://www.googleapis.com/calendar/v3/calendars/primary/events',payload={id,...eventPayload(a)};
  let response=await googleFetch(`${base}?sendUpdates=none`,{method:'POST',body:JSON.stringify(payload)});
  if(response.status===409)response=await googleFetch(`${base}/${encodeURIComponent(id)}?sendUpdates=none`,{method:'PUT',body:JSON.stringify(eventPayload(a))});
  if(!response.ok)throw new Error(`Google Agenda respondeu ${response.status}.`);
  mirrorAdd(a.id);removePending(a.id);
}
async function syncOne(id,{quiet=false}={}){
  if(!id)return;
  const a=appointmentById(id);
  if(!tokenValid()){addPending(id);if(!quiet)toast('Agendamento salvo. O Google Agenda será atualizado assim que a conta for reconectada.','');return}
  try{
    if(a)await upsertAppointment(a);else await deleteGoogleEventByAppointmentId(id);
    if(!quiet)toast('Google Agenda atualizado automaticamente com aviso de 30 minutos.','success');
  }catch(err){addPending(id);if(!quiet)toast(err.message||'Não foi possível atualizar o Google Agenda.','error')}
}
async function flushPending(){
  if(flushing||!tokenValid())return;flushing=true;
  try{for(const id of getPending())await syncOne(id,{quiet:true})}
  finally{flushing=false;paintSettings()}
}

function relevantAppointments(){
  const start=Date.now()-24*60*60*1000;
  const end=Date.now()+366*24*60*60*1000;
  return arr(data.appointments).filter(a=>{
    if(!a?.id||!a?.date||!a?.time)return false;
    const ms=new Date(`${a.date}T${a.time}:00`).getTime();
    return Number.isFinite(ms)&&ms>=start&&ms<=end;
  }).slice(0,400);
}
function scheduleSignature(list){
  return list.map(a=>[a.id,a.updatedAt||'',a.date||'',a.time||'',a.duration||'',a.status||'',a.attendanceStatus||'',a.patientId||''].join('|')).sort().join('\n');
}
async function reconcileAutomatic({force=false,quiet=true}={}){
  if(reconciling||!tokenValid())return;
  const list=relevantAppointments(),signature=scheduleSignature(list);
  if(!force&&signature===localStorage.getItem(SIGNATURE_STORAGE))return;
  reconciling=true;
  try{
    const allIds=new Set(arr(data.appointments).map(a=>a?.id).filter(Boolean));
    for(const a of list)await upsertAppointment(a);
    for(const id of getMirror())if(!allIds.has(id))await deleteGoogleEventByAppointmentId(id);
    localStorage.setItem(SIGNATURE_STORAGE,signature);
    if(!quiet)toast(`${list.length} compromisso(s) conferido(s) no Google Agenda.`,'success');
  }finally{reconciling=false;paintSettings()}
}
function queueReconcile({force=false,quiet=true,delay=450}={}){
  clearTimeout(reconcileTimer);
  reconcileTimer=setTimeout(()=>reconcileAutomatic({force,quiet}).catch(err=>{if(!quiet)toast(err.message||'Não foi possível reconciliar o Google Agenda.','error')}),delay);
}

function settingsMarkup(){
  const id=clientId(),pending=getPending().length,connected=tokenValid();
  return `<section id="rm-google-calendar" class="card mt-16"><div class="card-title"><div><div class="eyebrow">Integração automática</div><h3 class="mb-0">Google Agenda</h3></div><span class="badge">${connected?'Conectado':'Não conectado'}</span></div><p class="muted">Depois de conectado, todo agendamento criado, remarcado ou cancelado na plataforma é refletido automaticamente no seu Google Agenda. Alterações recebidas do outro dispositivo também são reconciliadas. O evento é privado, usa o código interno do paciente e gera aviso 30 minutos antes.</p><div class="field"><label>Google OAuth Client ID</label><input id="rm-google-client-id" class="input" value="${id.replace(/"/g,'&quot;')}" placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"></div><div class="small muted mt-8">Use um OAuth Client ID de aplicativo Web no Google Cloud e autorize a origem <strong>https://ricmurtapsicologia.github.io</strong>. O Client ID é público; o token de acesso fica cifrado somente neste dispositivo e expira periodicamente.</div><div class="flex gap-8 wrap mt-16"><button class="btn secondary" data-action="google-calendar-save-client">Salvar Client ID</button><button class="btn" data-action="google-calendar-connect">${connected?'Renovar conexão':'Conectar Google Agenda'}</button><button class="btn secondary" data-action="google-calendar-reconcile" ${connected?'':'disabled'}>Conferir agora</button>${connected?'<button class="btn ghost" data-action="google-calendar-disconnect">Desconectar</button>':''}</div>${pending?`<div class="notice warning mt-12"><strong>${pending}</strong> alteração(ões) aguardando conexão com o Google Agenda.</div>`:''}<div class="small muted mt-12">A sincronização é automática enquanto a autorização Google estiver válida. Se expirar, as alterações ficam em fila e são enviadas após a reconexão.</div></section>`;
}
function paintSettings(){
  if(runtime.locked||runtime.route!=='settings')return;const main=document.getElementById('main-content');if(!main)return;const old=document.getElementById('rm-google-calendar'),wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();const fresh=wrap.firstElementChild;if(old)old.replaceWith(fresh);else main.appendChild(fresh);
}
function addAgendaButtons(){
  if(runtime.locked||runtime.route!=='agenda')return;
  document.querySelectorAll('.week-event[data-id]').forEach(card=>{const actions=card.querySelector('.week-event-actions');if(!actions||actions.querySelector('[data-action="appointment-google-calendar"]'))return;const b=document.createElement('button');b.type='button';b.className='week-mini';b.dataset.action='appointment-google-calendar';b.dataset.id=card.dataset.id;b.title='Conferir no Google Agenda';b.textContent='G';actions.appendChild(b)});
  document.querySelectorAll('.agenda-item').forEach(item=>{const edit=item.querySelector('[data-action="edit-appointment"][data-id]'),box=edit?.parentElement;if(!edit||!box||box.querySelector('[data-action="appointment-google-calendar"]'))return;const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.action='appointment-google-calendar';b.dataset.id=edit.dataset.id;b.textContent='Conferir Google';box.appendChild(b)});
}

async function activate(){
  await loadStoredToken();
  paintSettings();addAgendaButtons();
  if(tokenValid()){await flushPending();queueReconcile({force:false,quiet:true,delay:250})}
}
document.addEventListener('rm:data-ready',()=>activate());
document.addEventListener('rm:rendered',()=>{paintSettings();setTimeout(addAgendaButtons,0)});
document.addEventListener('rm:sync-status',e=>{
  if(e.detail?.status==='synced'){
    setTimeout(addAgendaButtons,80);
    if(tokenValid()){flushPending();queueReconcile({force:false,quiet:true,delay:350})}
  }
});
document.addEventListener('rm:local-data-changed',e=>{
  if(globalThis.__rmSyncApplying||e.detail?.storeName!=='appointments')return;
  const id=e.detail?.id,kind=e.detail?.kind||'put';
  if(id)setTimeout(()=>syncOne(id,{quiet:true}),250);
  else if(kind==='bulk'||kind==='clear')queueReconcile({force:true,quiet:true,delay:300});
});
window.addEventListener('focus',()=>{if(tokenValid()&&globalThis.__rmDataReady)queueReconcile({force:false,quiet:true,delay:500})});
window.addEventListener('online',()=>{if(tokenValid()&&globalThis.__rmDataReady){flushPending();queueReconcile({force:false,quiet:true,delay:400})}});

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action]');if(!el)return;const a=el.dataset.action;if(!['google-calendar-save-client','google-calendar-connect','google-calendar-reconcile','google-calendar-disconnect','appointment-google-calendar'].includes(a))return;e.preventDefault();e.stopImmediatePropagation();try{
    if(a==='google-calendar-save-client'){const value=document.getElementById('rm-google-client-id')?.value.trim();if(!value)throw new Error('Informe o Client ID.');localStorage.setItem(CLIENT_STORAGE,value);tokenClient=null;toast('Client ID salvo neste dispositivo.','success');paintSettings();return}
    if(a==='google-calendar-connect'){const value=document.getElementById('rm-google-client-id')?.value.trim();if(value)localStorage.setItem(CLIENT_STORAGE,value);await connectGoogle();return}
    if(a==='google-calendar-reconcile'){if(!tokenValid())throw new Error('Conecte o Google Agenda em Configurações.');await flushPending();await reconcileAutomatic({force:true,quiet:false});return}
    if(a==='google-calendar-disconnect'){clearToken();toast('Google Agenda desconectado deste dispositivo.','success');return}
    if(a==='appointment-google-calendar'){if(!tokenValid())throw new Error('Conecte o Google Agenda em Configurações.');await syncOne(el.dataset.id);return}
  }catch(err){toast(err.message||'Não foi possível concluir a integração com o Google Agenda.','error')}
},true);

setTimeout(()=>{if(globalThis.__rmDataReady)activate()},700);
