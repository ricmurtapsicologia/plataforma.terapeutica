import {data,runtime,patientById,nowISO} from './state.js';
import {putEncrypted} from './database.js';
import {encryptJson,decryptJson} from './crypto.js';
import {toast} from './ui.js';

const VERSION='1.8.5';
const BACKFILL_START='2026-06-01T00:00:00-03:00';
const BACKFILL_DATE='2026-06-01';
const CLIENT_STORAGE='rm.google.calendar.clientId';
const TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const CONSENT_STORAGE='rm.google.meet.drive.consent.v1';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events.readonly';
const SCOPES=`${DRIVE_SCOPE} ${CALENDAR_SCOPE}`;
const PROCESSING_FOLDER_ID='1qBVrRpyYonIghnPTwkek1DnUkeGidJ_n';
const PROCESSING_FOLDER_URL=`https://drive.google.com/drive/folders/${PROCESSING_FOLDER_ID}`;
const SYNC_STATE_ID='meet_sync_state_v1';
const QUARANTINE_PREFIX='meet_quarantine_';
const RECORD_PREFIX='meet_rec_';
const POLL_MS=5*60*1000;

let accessToken='';
let expiresAt=0;
let syncing=false;
let pollTimer=null;
let gisPromise=null;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const tokenValid=()=>Boolean(accessToken&&expiresAt>Date.now()+60000);
const clientId=()=>String(localStorage.getItem(CLIENT_STORAGE)||'').trim();
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const localDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const localTime=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minutes=(a,b)=>Math.abs(a.getTime()-b.getTime())/60000;
const appointmentStart=a=>new Date(`${a.date}T${a.time||'00:00'}:00-03:00`);
const meetingStartFromTitle=title=>{
  const m=String(title||'').match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/);
  if(!m)return null;
  const d=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(d.getTime())?null:d;
};

async function saveEncryptedSetting(item){
  const value={...item,updatedAt:nowISO()};
  const list=data.settings||(data.settings=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);
  await putEncrypted('settings',value,runtime.key);
  return value;
}
async function saveAppointment(item){
  const value={...item,updatedAt:nowISO()};
  const list=data.appointments||(data.appointments=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);
  await putEncrypted('appointments',value,runtime.key);
  return value;
}
async function saveRecord(item){
  const value={...item,updatedAt:nowISO()};
  const list=data.records||(data.records=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);
  await putEncrypted('records',value,runtime.key);
  return value;
}

async function saveToken(token,seconds,scope=''){
  accessToken=token||'';
  expiresAt=Date.now()+Math.max(60,Number(seconds||3600))*1000;
  if(!runtime.key)return;
  const encrypted=await encryptJson(runtime.key,{token:accessToken,expiresAt,scope},'google-meet-token');
  localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted));
}
async function loadStoredToken(){
  if(!runtime.key)return false;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw)return false;
  try{
    const value=await decryptJson(runtime.key,raw,'google-meet-token');
    if(value?.token&&Number(value.expiresAt)>Date.now()+60000){accessToken=value.token;expiresAt=Number(value.expiresAt);return true}
  }catch{}
  clearToken();return false;
}
function clearToken(){accessToken='';expiresAt=0;localStorage.removeItem(TOKEN_STORAGE)}

function loadGIS(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  if(gisPromise)return gisPromise;
  gisPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-rm-google-gis]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(new Error('Não foi possível carregar a autorização Google.')),{once:true});return}
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.rmGoogleGis='1';
    script.onload=()=>resolve();script.onerror=()=>reject(new Error('Não foi possível carregar a autorização Google.'));
    document.head.appendChild(script);
  });
  return gisPromise;
}
async function authorizeWorkspace(){
  if(!runtime.key)throw new Error('Abra o cofre antes de conectar o Google Meet.');
  const id=clientId();
  if(!id)throw new Error('Configure primeiro o Google OAuth Client ID na integração do Google Agenda.');
  await loadGIS();
  await new Promise((resolve,reject)=>{
    const client=google.accounts.oauth2.initTokenClient({
      client_id:id,scope:SCOPES,
      callback:async response=>{
        try{
          if(response?.error)throw new Error(response.error_description||response.error);
          if(!response?.access_token)throw new Error('O Google não retornou autorização para Meet/Drive.');
          await saveToken(response.access_token,response.expires_in,response.scope||SCOPES);
          localStorage.setItem(CONSENT_STORAGE,'1');resolve();
        }catch(err){reject(err)}
      },
      error_callback:error=>reject(new Error(error?.message||'A autorização Google foi interrompida.'))
    });
    client.requestAccessToken({prompt:localStorage.getItem(CONSENT_STORAGE)?'':'consent'});
  });
}

async function googleFetch(url,options={}){
  if(!tokenValid())throw new Error('Google Meet precisa ser reconectado para ler Drive e Agenda.');
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${accessToken}`,...(options.headers||{})}});
  if(response.status===401||response.status===403){clearToken();throw new Error('A autorização do Google Meet expirou ou não possui as permissões necessárias. Reconecte em Configurações.')}
  return response;
}
async function listSmartNotes(){
  const out=[];let pageToken='';
  do{
    const u=new URL('https://www.googleapis.com/drive/v3/files');
    const q=`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '2026-06-01T03:00:00Z' and name contains 'Anotações do Gemini'`;
    u.searchParams.set('q',q);u.searchParams.set('pageSize','1000');u.searchParams.set('orderBy','createdTime asc');u.searchParams.set('spaces','drive');
    u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,parents,mimeType)');
    u.searchParams.set('supportsAllDrives','true');u.searchParams.set('includeItemsFromAllDrives','true');if(pageToken)u.searchParams.set('pageToken',pageToken);
    const r=await googleFetch(u.toString());if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);const payload=await r.json();out.push(...arr(payload.files));pageToken=payload.nextPageToken||'';
  }while(pageToken);
  return out.filter(f=>meetingStartFromTitle(f.name));
}
async function listTherapyCalendarEvents(){
  const out=[];let pageToken='';
  do{
    const u=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    u.searchParams.set('timeMin',BACKFILL_START);u.searchParams.set('timeMax',new Date(Date.now()+86400000).toISOString());u.searchParams.set('singleEvents','true');u.searchParams.set('orderBy','startTime');u.searchParams.set('maxResults','2500');
    u.searchParams.set('fields','nextPageToken,items(id,summary,status,start,end,extendedProperties)');if(pageToken)u.searchParams.set('pageToken',pageToken);
    const r=await googleFetch(u.toString());if(!r.ok)throw new Error(`Google Agenda respondeu ${r.status}.`);const payload=await r.json();out.push(...arr(payload.items));pageToken=payload.nextPageToken||'';
  }while(pageToken);
  return out.filter(e=>e?.status!=='cancelled'&&(/^(Terapia\s+)/i.test(e?.summary||'')||/^Sessão clínica\s*·/i.test(e?.summary||''))&&e?.start?.dateTime);
}
async function exportSmartNoteText(fileId){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const r=await googleFetch(url);if(!r.ok)throw new Error(`Não foi possível ler as anotações do Meet (${r.status}).`);return r.text();
}

function patientFromCalendarEvent(event){
  const summary=String(event?.summary||'').trim();
  const coded=summary.match(/^Sessão clínica\s*·\s*(.+)$/i);
  if(coded){const code=normalize(coded[1]);const matches=arr(data.patients).filter(p=>normalize(p?.code)===code);return matches.length===1?matches[0]:null}
  const legacy=summary.match(/^Terapia\s+(.+)$/i);if(!legacy)return null;
  const target=normalize(legacy[1]);if(!target)return null;
  const matches=arr(data.patients).filter(p=>{
    const names=[p?.preferredName,p?.name].map(normalize).filter(Boolean);
    return names.some(n=>n===target||n.split(' ')[0]===target);
  });
  return matches.length===1?matches[0]:null;
}
function chooseNearest(candidates,getDate,meetingStart,maxDelta=35){
  const ranked=arr(candidates).map(item=>({item,delta:minutes(getDate(item),meetingStart)})).filter(x=>Number.isFinite(x.delta)&&x.delta<=maxDelta).sort((a,b)=>a.delta-b.delta);
  if(!ranked.length)return null;
  if(ranked.length>1&&ranked[1].delta-ranked[0].delta<10)return null;
  return ranked[0];
}
function localAppointmentMatch(meetingStart){
  const date=localDate(meetingStart);
  const candidates=arr(data.appointments).filter(a=>a?.date===date&&a?.time&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou');
  const byPatient=new Map();
  for(const a of candidates){const d=minutes(appointmentStart(a),meetingStart),current=byPatient.get(a.patientId);if(d<=35&&(!current||d<current.delta))byPatient.set(a.patientId,{item:a,delta:d})}
  const ranked=[...byPatient.values()].sort((a,b)=>a.delta-b.delta);
  if(!ranked.length)return null;if(ranked.length>1&&ranked[1].delta-ranked[0].delta<10)return null;return ranked[0];
}
function calendarEventMatch(meetingStart,events){
  return chooseNearest(events,e=>new Date(e.start.dateTime),meetingStart,35);
}
function durationFromEvent(event){
  const start=new Date(event.start.dateTime),end=new Date(event.end?.dateTime||start.getTime()+50*60000);const d=Math.round((end-start)/60000);return Number.isFinite(d)&&d>=20&&d<=180?d:50;
}
async function resolveAppointment(file,calendarEvents){
  const meetingStart=meetingStartFromTitle(file.name);if(!meetingStart)return{appointment:null,delta:null,reason:'Horário da reunião não identificado.'};
  const local=localAppointmentMatch(meetingStart);if(local)return{appointment:local.item,delta:local.delta,method:'local-date-time'};
  const cal=calendarEventMatch(meetingStart,calendarEvents);if(!cal)return{appointment:null,delta:null,reason:'Nenhuma sessão clínica correspondente na Agenda.'};
  const patient=patientFromCalendarEvent(cal.item);if(!patient)return{appointment:null,delta:cal.delta,reason:'Evento clínico localizado, mas paciente não pôde ser identificado com segurança.'};
  const eventStart=new Date(cal.item.start.dateTime),same=arr(data.appointments).filter(a=>a?.patientId===patient.id&&a?.date===localDate(eventStart)&&a?.time).sort((a,b)=>minutes(appointmentStart(a),eventStart)-minutes(appointmentStart(b),eventStart))[0];
  if(same&&minutes(appointmentStart(same),eventStart)<=35)return{appointment:same,delta:minutes(eventStart,meetingStart),method:'calendar-patient'};
  const created={id:`meetappt_${file.id}`,patientId:patient.id,date:localDate(eventStart),time:localTime(eventStart),duration:durationFromEvent(cal.item),status:'Realizada',modality:'On-line',recurrence:'Avulso',note:'Sessão histórica vinculada automaticamente a partir do Google Meet e Google Agenda.',createdAt:nowISO(),source:{type:'google-meet-calendar-backfill',calendarEventId:cal.item.id}};
  await saveAppointment(created);return{appointment:created,delta:minutes(eventStart,meetingStart),method:'calendar-backfill'};
}

function section(text,startLabel,endLabels=[]){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim());
  const start=lines.findIndex(x=>normalize(x)===normalize(startLabel));if(start<0)return'';
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++){if(endLabels.some(label=>normalize(lines[i])===normalize(label))){end=i;break}}
  return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function cleanNextSteps(value=''){
  return String(value||'').split(/\r?\n/).map(line=>line.replace(/^\*\s*/,'').replace(/^\[[^\]]+\]\s*/,'').trim()).filter(Boolean).map(x=>`• ${x}`).join('\n');
}
function buildClinicalDraft(raw){
  const source=String(raw||'').split(/📖\s*Transcrição/i)[0].trim();
  const summary=section(source,'Resumo',['Próximas etapas','Detalhes']);
  const next=cleanNextSteps(section(source,'Próximas etapas',['Detalhes']));
  const text=[
    'SÍNTESE DA SESSÃO',
    summary||'As anotações automáticas não apresentaram uma seção de resumo estruturada.',
    next?'\nORIENTAÇÕES, TAREFAS OU ENCAMINHAMENTOS REGISTRADOS\n'+next:'',
    '\n[Registro organizado automaticamente a partir das Anotações do Google Meet/Gemini. Rascunho para revisão profissional; nenhuma informação adicional foi inferida.]'
  ].filter(Boolean).join('\n\n');
  return{text,followup:next.replace(/^•\s*/gm,'').trim()};
}
function smartNoteMeta(file,delta,method){
  const start=meetingStartFromTitle(file.name);
  return{fileId:file.id,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,title:file.name,meetingStartedAt:start?.toISOString()||'',modifiedTime:file.modifiedTime||'',linkedAt:nowISO(),matchMethod:method||'date-time',matchDeltaMinutes:Math.round(Number(delta||0))};
}
async function upsertMeetDraft(appointment,primary){
  const id=`${RECORD_PREFIX}${appointment.id}`;
  const existing=arr(data.records).find(r=>r?.id===id);
  if(existing?.status==='Finalizado'||existing?.validatedAt)return existing;
  if(existing?.source?.fileId===primary.file.id&&existing?.source?.modifiedTime===primary.file.modifiedTime)return existing;
  const raw=await exportSmartNoteText(primary.file.id),draft=buildClinicalDraft(raw);
  return saveRecord({...(existing||{}),id,patientId:appointment.patientId,appointmentId:appointment.id,title:'Evolução de sessão · Gemini',date:appointment.date,status:'Rascunho IA',text:draft.text,followup:draft.followup,requiresReview:true,createdAt:existing?.createdAt||nowISO(),addenda:arr(existing?.addenda),source:{type:'google-meet-gemini',fileId:primary.file.id,url:primary.file.webViewLink||`https://docs.google.com/document/d/${primary.file.id}`,title:primary.file.name,modifiedTime:primary.file.modifiedTime||'',version:VERSION}});
}
async function saveQuarantine(file,reason){
  return saveEncryptedSetting({id:`${QUARANTINE_PREFIX}${file.id}`,kind:'meet-quarantine',fileId:file.id,title:file.name,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,meetingStartedAt:meetingStartFromTitle(file.name)?.toISOString()||'',reason,status:'Pendente',createdAt:nowISO()});
}
async function clearQuarantine(fileId){
  const item=arr(data.settings).find(x=>x?.id===`${QUARANTINE_PREFIX}${fileId}`);if(!item)return;
  item.status='Resolvido automaticamente';item.resolvedAt=nowISO();await saveEncryptedSetting(item);
}

async function syncMeet({quiet=false}={}){
  if(syncing||runtime.locked||!runtime.key||!runtime.dataReady)return;
  if(!tokenValid()){paintSettings();return}
  syncing=true;paintSettings(true);
  try{
    const [files,calendarEvents]=await Promise.all([listSmartNotes(),listTherapyCalendarEvents()]);
    const groups=new Map();let quarantined=0,createdAppointments=0;
    for(const file of files){
      const resolved=await resolveAppointment(file,calendarEvents);
      if(!resolved.appointment){await saveQuarantine(file,resolved.reason||'Associação não segura.');quarantined++;continue}
      if(resolved.method==='calendar-backfill')createdAppointments++;
      await clearQuarantine(file.id);
      const key=resolved.appointment.id,items=groups.get(key)||[];items.push({file,appointment:resolved.appointment,delta:resolved.delta||0,method:resolved.method});groups.set(key,items);
    }
    let linked=0,drafts=0;
    for(const items of groups.values()){
      items.sort((a,b)=>a.delta-b.delta||String(a.file.createdTime||'').localeCompare(String(b.file.createdTime||'')));
      const primary=items[0],appointment=primary.appointment;
      appointment.meet={source:'google-meet-gemini',syncedAt:nowISO(),primaryFileId:primary.file.id,processingFolderId:PROCESSING_FOLDER_ID,smartNotes:items.map(x=>smartNoteMeta(x.file,x.delta,x.method))};
      await saveAppointment(appointment);linked++;
      const before=arr(data.records).find(r=>r?.id===`${RECORD_PREFIX}${appointment.id}`);
      await upsertMeetDraft(appointment,primary);if(!before)drafts++;
    }
    const state=await saveEncryptedSetting({id:SYNC_STATE_ID,kind:'meet-sync-state',backfillStart:BACKFILL_DATE,lastScanAt:nowISO(),linkedSessions:linked,smartNotesFound:files.length,quarantineCount:quarantined,createdAppointments,processingFolderId:PROCESSING_FOLDER_ID,status:'OK'});
    paintSettings();decorateSessions();window.__rmRender?.();
    if(!quiet)toast(`Meet atualizado: ${state.linkedSessions} sessão(ões) vinculada(s), ${drafts} novo(s) rascunho(s) e ${quarantined} item(ns) em quarentena.`,'success');
  }catch(err){
    console.error('Falha na sincronização do Google Meet',err);
    await saveEncryptedSetting({id:SYNC_STATE_ID,kind:'meet-sync-state',backfillStart:BACKFILL_DATE,lastScanAt:nowISO(),status:'Erro',error:String(err?.message||err),processingFolderId:PROCESSING_FOLDER_ID}).catch(()=>{});
    paintSettings();if(!quiet)toast(err.message||'Não foi possível sincronizar o Google Meet.','error');
  }finally{syncing=false;paintSettings()}
}

function state(){return arr(data.settings).find(x=>x?.id===SYNC_STATE_ID)||null}
function settingsMarkup(){
  const s=state(),connected=tokenValid(),last=s?.lastScanAt?new Date(s.lastScanAt).toLocaleString('pt-BR'):'Ainda não executado';
  return`<section id="rm-google-meet-sync" class="card mt-16"><div class="card-title"><div><div class="eyebrow">Integração clínica</div><h3 class="mb-0">Google Meet · Anotações do Gemini</h3></div><span class="badge">${connected?'Conectado':'Reconectar'}</span></div><p class="muted">Vincula automaticamente Anotações do Gemini às sessões do cofre por data/hora e identificadores clínicos. O backfill começa em 01/06/2026. Resumos ambíguos não entram em prontuário.</p><div class="meet-sync-metrics"><span><strong>${Number(s?.linkedSessions||0)}</strong> vinculadas</span><span><strong>${Number(s?.smartNotesFound||0)}</strong> notas localizadas</span><span><strong>${Number(s?.quarantineCount||0)}</strong> quarentena</span></div><div class="small muted mt-8">Última conferência: ${last}. O texto clínico permanece cifrado no cofre local; o repositório público recebe apenas o código da integração.</div><div class="flex gap-8 wrap mt-16">${connected?'<button class="btn" data-action="meet-sync-now">Conferir Meet agora</button>':'<button class="btn" data-action="meet-connect">Conectar Google Meet</button>'}<a class="btn secondary" href="${PROCESSING_FOLDER_URL}" target="_blank" rel="noopener noreferrer">Pasta de processamento</a>${connected?'<button class="btn ghost" data-action="meet-disconnect">Desconectar Meet</button>':''}</div><div class="notice mt-12"><strong>Segurança:</strong> a autorização deste módulo é somente leitura para Drive e Agenda. O resumo convertido entra no prontuário como <em>Rascunho IA</em> e não é finalizado automaticamente.</div></section>`;
}
function paintSettings(force=false){
  if(runtime.locked||runtime.route!=='settings')return;
  const main=document.getElementById('main-content');if(!main)return;
  const old=document.getElementById('rm-google-meet-sync'),wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();const fresh=wrap.firstElementChild;
  if(force)fresh?.setAttribute('aria-busy','true');if(old)old.replaceWith(fresh);else main.appendChild(fresh);
}
function decorateSessions(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='timeline')return;
  document.querySelectorAll('.patient-session-card').forEach(card=>{
    if(card.querySelector('.patient-meet-summary'))return;
    const button=card.querySelector('[data-action="appointment-manage"][data-id]')||card.querySelector('[data-action="edit-appointment"][data-id]');const id=button?.dataset.id;if(!id)return;
    const a=arr(data.appointments).find(x=>x?.id===id),notes=arr(a?.meet?.smartNotes);if(!notes.length)return;
    const rec=arr(data.records).find(r=>r?.appointmentId===id&&r?.source?.type==='google-meet-gemini');
    const box=document.createElement('div');box.className='patient-meet-summary';box.innerHTML=`<div><strong>Google Meet · Gemini ✓</strong><div class="small muted">${notes.length} anotação(ões) vinculada(s)${rec?` · ${rec.status||'Rascunho IA'}`:''}</div></div><div class="flex gap-8 wrap"><button class="btn ghost" data-action="meet-open-summary" data-url="${String(notes[0].url||'').replace(/"/g,'&quot;')}">Ver resumo</button>${rec?'<button class="btn ghost" data-action="meet-open-records">Abrir prontuário</button>':''}</div>`;card.appendChild(box);
  });
}

async function activate(){
  try{await loadStoredToken();paintSettings();decorateSessions();if(tokenValid())syncMeet({quiet:true});startPolling()}catch(err){console.warn('Google Meet não pôde ser ativado',err);paintSettings()}
}
function startPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine&&tokenValid())syncMeet({quiet:true})},POLL_MS)}

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action^="meet-"]');if(!el)return;
  const action=el.dataset.action;
  if(!['meet-connect','meet-sync-now','meet-disconnect','meet-open-summary','meet-open-records'].includes(action))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
    if(action==='meet-connect'){await authorizeWorkspace();paintSettings();await syncMeet({quiet:false});return}
    if(action==='meet-sync-now'){await syncMeet({quiet:false});return}
    if(action==='meet-disconnect'){clearToken();paintSettings();toast('Google Meet desconectado deste dispositivo.','');return}
    if(action==='meet-open-summary'){const url=el.dataset.url;if(url)window.open(url,'_blank','noopener,noreferrer');return}
    if(action==='meet-open-records'){runtime.patientTab='records';window.__rmRender?.();return}
  }catch(err){toast(err.message||'Falha na integração com Google Meet.','error')}
},true);
document.addEventListener('rm:data-ready',()=>activate());
document.addEventListener('rm:rendered',()=>{paintSettings();decorateSessions()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&tokenValid())syncMeet({quiet:true})});
window.addEventListener('online',()=>{if(tokenValid())syncMeet({quiet:true})});
