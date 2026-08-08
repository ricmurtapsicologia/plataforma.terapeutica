import {data,runtime,preferences,selectedPatient} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {bulkPutEncrypted} from './database.js';
import {toast,esc} from './ui.js';

const VERSION='2.1.0';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const INBOX_STORAGE='rm.google.clinical.inbox.v210';
const INBOX_AAD='google-clinical-inbox-v210';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const BACKFILL_DATE='2026-06-01';
const BACKFILL_ISO='2026-06-01T03:00:00Z';
const POLL_MS=5*60*1000;
const MAX_MATCH_DELTA_MINUTES=90;

let accessToken='';
let expiresAt=0;
let tokenScope='';
let inbox={version:3,lastScanAt:'',lastError:'',filesSeen:0,items:[]};
let scanning=false;
let pollTimer=null;
let lastStatus='unknown';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const tokenValid=()=>Boolean(accessToken&&expiresAt>Date.now()+60000);
const driveGranted=()=>tokenScope.split(/\s+/).includes(DRIVE_SCOPE);
const sourceStamp=file=>String(file?.modifiedTime||file?.createdTime||new Date().toISOString());
const appointmentIdFor=fileId=>`gmappt_${fileId}`;
const recordIdFor=fileId=>`gmrec_${fileId}`;
const itemByFileId=id=>arr(inbox.items).find(x=>x?.fileId===id)||null;
const recordForFile=id=>arr(data.records).find(r=>r?.id===recordIdFor(id)||r?.source?.fileId===id)||null;
const appointmentForFile=id=>arr(data.appointments).find(a=>a?.id===appointmentIdFor(id)||a?.source?.fileId===id)||null;

function emitStatus(status,detail=''){
  lastStatus=status;
  document.dispatchEvent(new CustomEvent('rm:gemini-status',{detail:{status,detail,lastScanAt:inbox.lastScanAt,lastError:inbox.lastError}}));
}
function safeDate(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?null:d}
function newer(a,b){const da=safeDate(a),db=safeDate(b);return Boolean(da&&db&&da>db)}
function mergeData(store,values){
  const list=data[store]||(data[store]=[]);
  for(const value of values){const i=list.findIndex(x=>x?.id===value.id);if(i>=0)list[i]=value;else list.push(value)}
}

async function loadWorkspaceToken(){
  accessToken='';expiresAt=0;tokenScope='';
  if(!runtime.key)return false;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw)return false;
  try{
    const value=await decryptJson(runtime.key,raw,'google-calendar-token');
    if(value?.token&&Number(value.expiresAt)>Date.now()+60000){
      accessToken=value.token;expiresAt=Number(value.expiresAt);tokenScope=String(value.scope||'');return true;
    }
  }catch{}
  return false;
}
async function loadInbox(){
  inbox={version:3,lastScanAt:'',lastError:'',filesSeen:0,items:[]};
  if(!runtime.key)return inbox;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(INBOX_STORAGE)||'null')}catch{}
  if(!raw)return inbox;
  try{
    const value=await decryptJson(runtime.key,raw,INBOX_AAD);
    if(value&&Array.isArray(value.items))inbox={version:3,lastScanAt:value.lastScanAt||'',lastError:value.lastError||'',filesSeen:Number(value.filesSeen||0),items:value.items.slice(-400)};
  }catch{}
  return inbox;
}
async function saveInbox(){
  if(!runtime.key)return;
  inbox.version=3;inbox.items=arr(inbox.items).slice(-400);
  const encrypted=await encryptJson(runtime.key,inbox,INBOX_AAD);
  localStorage.setItem(INBOX_STORAGE,JSON.stringify(encrypted));
}

async function googleFetch(url){
  if(!tokenValid())throw new Error('Google Workspace precisa ser reconectado.');
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
  if(r.status===401)throw new Error('A autorização do Google Workspace expirou. Renove a conexão.');
  if(r.status===403){
    let message='';let reason='';
    try{const j=await r.clone().json();message=String(j?.error?.message||'');reason=String(j?.error?.errors?.[0]?.reason||'')}catch{}
    if(/accessnotconfigured|service_disabled|has not been used|disabled/i.test(`${reason} ${message}`)){
      const err=new Error('A autorização foi concedida, mas a Google Drive API ainda não está habilitada no projeto OAuth. Ative a Drive API uma única vez e confira novamente.');err.code='DRIVE_API_DISABLED';throw err;
    }
    if(/insufficient.*scope|insufficientpermissions/i.test(`${reason} ${message}`))throw new Error('A conexão atual não possui permissão de leitura do Drive. Renove o Google Workspace e autorize Agenda + Drive.');
    throw new Error(message?`Google Drive recusou a leitura: ${message}`:'O Google Drive recusou a leitura das Anotações do Gemini.');
  }
  return r;
}
async function listGeminiDocs(){
  const out=[];let pageToken='';
  do{
    const u=new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);
    u.searchParams.set('pageSize','1000');u.searchParams.set('orderBy','createdTime asc');u.searchParams.set('spaces','drive');
    u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,mimeType)');if(pageToken)u.searchParams.set('pageToken',pageToken);
    const r=await googleFetch(u.toString());if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);
    const payload=await r.json();out.push(...arr(payload.files));pageToken=payload.nextPageToken||'';
  }while(pageToken);
  return out.filter(f=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(f?.name||''));
}
async function exportDoc(fileId){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const r=await googleFetch(url);if(!r.ok)throw new Error(`Não foi possível ler uma anotação do Gemini (${r.status}).`);return r.text();
}

function meetingInfo(file){
  const title=String(file?.name||'');
  let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);
  if(m)return{date:`${m[1]}-${m[2]}-${m[3]}`,time:`${m[4]}:${m[5]}`,instant:new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`)};
  m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);
  if(m)return{date:`${m[3]}-${m[2]}-${m[1]}`,time:`${m[4]}:${m[5]}`,instant:new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`)};
  const d=safeDate(file?.createdTime);if(!d)return null;
  return{date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`,instant:d};
}
function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){const n=normalize(m[1]);if(n&&n.length<=80)found.add(n)}
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){const n=normalize(m[1]);if(n&&n.length<=80)found.add(n)}
  return [...found];
}
function aliasesForPatient(p){const result=[];for(const value of [p?.name,p?.preferredName]){const n=normalize(value);if(n&&!result.includes(n))result.push(n)}return result}
function uniqueFirstName(p){
  const first=normalize(String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]);if(first.length<4)return'';
  const same=arr(data.patients).filter(x=>normalize(String(x?.preferredName||x?.name||'').trim().split(/\s+/)[0])===first);return same.length===1?first:'';
}
function appointmentNear(patientId,meeting){
  const candidates=arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===meeting.date&&a?.time);
  const ranked=candidates.map(a=>({appointment:a,delta:Math.abs(new Date(`${a.date}T${a.time}:00`)-new Date(`${meeting.date}T${meeting.time}:00`))/60000})).filter(x=>Number.isFinite(x.delta)&&x.delta<=MAX_MATCH_DELTA_MINUTES).sort((a,b)=>a.delta-b.delta);
  if(!ranked.length)return null;if(ranked.length>1&&ranked[1].delta-ranked[0].delta<10)return null;return ranked[0];
}
function identifyPatient(raw,meeting){
  const labels=participantLabels(raw),ranked=[];
  for(const p of arr(data.patients)){
    let score=0,evidence='';
    for(const alias of aliasesForPatient(p)){
      const words=alias.split(' ').filter(Boolean);
      if(words.length>=2&&labels.some(l=>l===alias||l.startsWith(alias+' ')||alias.startsWith(l+' '))){score=Math.max(score,150);evidence=`participante:${alias}`}
    }
    const near=appointmentNear(p.id,meeting),first=uniqueFirstName(p);
    if(first&&near&&labels.some(l=>l===first||l.startsWith(first+' '))&&score<110){score=110;evidence=`participante:${first}|sessao:${Math.round(near.delta)}min`}
    if(score&&near&&score>=140){score+=Math.max(5,25-Math.min(20,near.delta/4));evidence+=`|sessao:${Math.round(near.delta)}min`}
    if(score)ranked.push({patient:p,score,evidence,appointment:near?.appointment||null,delta:near?.delta??null});
  }
  ranked.sort((a,b)=>b.score-a.score);
  if(!ranked.length)return{patient:null,reason:'Nenhum paciente do cofre foi identificado como participante nas Anotações/Transcrição do Gemini.'};
  if(ranked[0].score<110)return{patient:null,reason:'O nome encontrado no Gemini não atingiu confiança suficiente para associação automática.'};
  if(ranked.length>1&&ranked[0].score-ranked[1].score<20)return{patient:null,reason:'Mais de um paciente pode corresponder ao participante encontrado no Gemini.'};
  return ranked[0];
}
function deriveDuration(raw=''){
  let maxSeconds=0;
  for(const m of String(raw).matchAll(/\b(\d{2}):(\d{2}):(\d{2})\b/g)){const s=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);if(Number.isFinite(s))maxSeconds=Math.max(maxSeconds,s)}
  const minutes=Math.ceil(maxSeconds/60);return minutes>=20&&minutes<=180?minutes:Number(preferences.defaultSessionMinutes||50);
}
function section(raw,labels,endLabels=[]){
  const lines=String(raw||'').replace(/^\uFEFF/,'').split(/\r?\n/),starts=labels.map(normalize),ends=endLabels.map(normalize),start=lines.findIndex(x=>starts.includes(normalize(x)));if(start<0)return'';
  let end=lines.length;for(let i=start+1;i<lines.length;i++)if(ends.includes(normalize(lines[i]))){end=i;break}return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function cleanSteps(value=''){return String(value||'').split(/\r?\n/).map(x=>x.replace(/^\*\s*/,'').replace(/^[-•]\s*/,'').replace(/^\[[^\]]+\]\s*/,'').trim()).filter(Boolean).map(x=>`• ${x}`).join('\n')}
function escapeRegExp(value=''){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function neutralizeNames(value,patient){
  let out=String(value||'');
  for(const name of [patient?.name,patient?.preferredName].filter(Boolean).sort((a,b)=>b.length-a.length))out=out.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`,'gi'),'Paciente');
  out=out.replace(/\bRichelmy\s+Murta\b/gi,'Profissional');return out;
}
function buildClinicalDraft(raw='',patient){
  const source=String(raw).split(/📖\s*Transcri[cç][aã]o/i)[0].trim();
  const summary=neutralizeNames(section(source,['Resumo','Summary'],['Próximas etapas','Proximas etapas','Next steps','Detalhes','Details']),patient);
  const detailsRaw=section(source,['Detalhes','Details'],['Revise as anotações','Revise as anotacoes']);
  const detailLines=String(detailsRaw||'').split(/\r?\n/).map(x=>x.replace(/^\*\s*/,'').trim()).filter(Boolean);
  const clinicalDetails=detailLines.filter(x=>/richelmy murta|profissional|orient|suger|refor|explic|discut|trabalh|estrat[eé]g|t[eé]cnic|interven/i.test(normalize(x))).slice(0,7).map(x=>`• ${neutralizeNames(x.replace(/\s*\(\d{2}:\d{2}:\d{2}\)(?:\s*\(\d{2}:\d{2}:\d{2}\))*\s*/g,' ').trim(),patient)}`).join('\n');
  const steps=neutralizeNames(cleanSteps(section(source,['Próximas etapas','Proximas etapas','Next steps'],['Detalhes','Details'])),patient);
  const fallback=neutralizeNames(source.replace(/^.*?\n/,'').trim().slice(0,5000),patient);
  const blocks=[
    `Foco e evolução da sessão\n${summary||fallback||'Síntese automática indisponível.'}`,
    clinicalDetails?`Intervenções e conteúdos trabalhados\n${clinicalDetails}`:'',
    steps?`Orientações, tarefas ou encaminhamentos\n${steps}`:''
  ].filter(Boolean);
  return{text:blocks.join('\n\n'),followup:steps.replace(/^•\s*/gm,'').trim()};
}
function upsertInboxItem(item){const i=arr(inbox.items).findIndex(x=>x?.fileId===item.fileId);if(i>=0)inbox.items[i]={...inbox.items[i],...item};else inbox.items.push(item)}
function importedItems(){return arr(inbox.items).filter(x=>x?.status==='imported')}
function quarantineItems(){return arr(inbox.items).filter(x=>x?.status==='quarantine')}
function reviewItems(){return arr(inbox.items).filter(x=>x?.status==='review')}

function proposedAppointment(file,patient,meeting,raw,existing){
  const stamp=sourceStamp(file),duration=deriveDuration(raw);
  if(existing){
    if(existing.status==='Cancelada'||existing.attendanceStatus==='Desmarcou')return{error:'Há uma sessão cancelada/desmarcada no mesmo horário. O Gemini não a alterou automaticamente.'};
    const updatedAt=newer(existing.updatedAt,stamp)?existing.updatedAt:stamp;
    return{value:{...existing,status:'Realizada',attendanceStatus:'Presente',updatedAt,gemini:{fileId:file.id,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,meetingDate:meeting.date,meetingTime:meeting.time,sourceModifiedAt:stamp},source:existing.source||{type:'google-meet-gemini-linked'}}};
  }
  const prior=appointmentForFile(file.id);if(prior)return{value:prior};
  return{value:{id:appointmentIdFor(file.id),patientId:patient.id,date:meeting.date,time:meeting.time,duration,status:'Realizada',attendanceStatus:'Presente',modality:'On-line',recurrence:'Avulso',note:'Sessão confirmada automaticamente a partir das Anotações do Google Meet/Gemini.',createdAt:String(file.createdTime||stamp),updatedAt:stamp,source:{type:'google-meet-gemini',fileId:file.id,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,sourceModifiedAt:stamp}}};
}
function proposedRecord(file,patient,appointment,draft,meeting){
  const stamp=sourceStamp(file),existing=recordForFile(file.id);
  if(existing?.status==='Finalizado')return{value:null,kept:existing};
  if(existing&&newer(existing.updatedAt,stamp)&&existing?.source?.modifiedTime!==stamp)return{value:null,review:existing};
  return{value:{...(existing||{}),id:existing?.id||recordIdFor(file.id),patientId:patient.id,appointmentId:appointment.id,title:'Evolução de sessão',date:appointment.date||meeting.date,status:'Rascunho IA',text:draft.text,followup:draft.followup,requiresReview:true,createdAt:existing?.createdAt||String(file.createdTime||stamp),updatedAt:stamp,addenda:arr(existing?.addenda),source:{type:'google-meet-gemini',fileId:file.id,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,title:file.name,modifiedTime:stamp,version:VERSION}}};
}

async function persistClinicalBatch(appointments,records){
  const appts=[...appointments.values()],recs=[...records.values()];if(!appts.length&&!recs.length)return;
  if(globalThis.__rmSyncApplying)throw new Error('A sincronização do cofre está aplicando dados. A importação do Gemini será tentada novamente.');
  const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;
  try{
    if(appts.length)await bulkPutEncrypted('appointments',appts,runtime.key);
    if(recs.length)await bulkPutEncrypted('records',recs,runtime.key);
  }finally{globalThis.__rmSyncApplying=previous}
  mergeData('appointments',appts);mergeData('records',recs);
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',id:'',kind:'bulk',at:new Date().toISOString(),source:'gemini-backfill'}}));
  document.dispatchEvent(new CustomEvent('rm:gemini-backfill-complete',{detail:{appointments:appts.map(x=>x.id),records:recs.map(x=>x.id)}}));
}

async function scan({quiet=true}={}){
  if(scanning||runtime.locked||!runtime.key||!runtime.dataReady||globalThis.__rmSyncApplying)return;
  await loadWorkspaceToken();
  if(!tokenValid()){emitStatus('disconnected','Google Workspace não conectado.');decorate();return}
  if(!driveGranted()){emitStatus('error','A conexão precisa incluir leitura do Drive.');decorate();return}
  scanning=true;inbox.lastError='';emitStatus('scanning','Conferindo Anotações do Gemini.');decorate(true);
  const appointmentWrites=new Map(),recordWrites=new Map();let files=[];
  try{
    files=await listGeminiDocs();inbox.filesSeen=files.length;
    for(const file of files){
      const previous=itemByFileId(file.id),existingRecord=recordForFile(file.id),existingAppt=appointmentForFile(file.id);
      if(previous?.status==='imported'&&previous?.modifiedTime===file.modifiedTime&&(existingRecord||existingAppt))continue;
      const meeting=meetingInfo(file);
      if(!meeting){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',status:'quarantine',reason:'Data/hora da reunião não pôde ser determinada.'});continue}
      const raw=await exportDoc(file.id),match=identifyPatient(raw,meeting);
      if(!match.patient){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',meetingDate:meeting.date,meetingTime:meeting.time,status:'quarantine',reason:match.reason});continue}
      const apptPlan=proposedAppointment(file,match.patient,meeting,raw,match.appointment||existingAppt);
      if(apptPlan.error){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',patientId:match.patient.id,meetingDate:meeting.date,meetingTime:meeting.time,status:'review',reason:apptPlan.error});continue}
      const appointment=apptPlan.value,draft=buildClinicalDraft(raw,match.patient),recordPlan=proposedRecord(file,match.patient,appointment,draft,meeting);
      if(recordPlan.review){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',patientId:match.patient.id,appointmentId:appointment.id,recordId:recordPlan.review.id,meetingDate:meeting.date,meetingTime:meeting.time,status:'review',reason:'O rascunho foi editado depois da versão do Gemini e não foi sobrescrito.'});continue}
      if(!match.appointment&&!existingAppt)appointmentWrites.set(appointment.id,appointment);else if(JSON.stringify(match.appointment||existingAppt)!==JSON.stringify(appointment))appointmentWrites.set(appointment.id,appointment);
      if(recordPlan.value)recordWrites.set(recordPlan.value.id,recordPlan.value);
      upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,modifiedTime:file.modifiedTime||'',patientId:match.patient.id,appointmentId:appointment.id,recordId:recordPlan.value?.id||recordPlan.kept?.id||'',meetingDate:meeting.date,meetingTime:meeting.time,status:'imported',matchEvidence:match.evidence||'',source:'Google Meet · Gemini',version:VERSION});
    }
    await persistClinicalBatch(appointmentWrites,recordWrites);
    inbox.lastScanAt=new Date().toISOString();inbox.lastError='';await saveInbox();emitStatus('connected',`${files.length} arquivo(s) conferido(s).`);decorate();
    if(appointmentWrites.size||recordWrites.size)window.__rmRender?.();
    if(!quiet)toast(`Gemini atualizado: ${recordWrites.size} prontuário(s) e ${appointmentWrites.size} sessão(ões) atualizados; ${reviewItems().length+quarantineItems().length} item(ns) exigem revisão.`,'success');
  }catch(err){
    inbox.lastError=String(err?.message||err);await saveInbox().catch(()=>{});emitStatus('error',inbox.lastError);decorate();if(!quiet)toast(inbox.lastError,'error');
  }finally{scanning=false;decorate()}
}

function cloudProjectNumber(){const id=String(localStorage.getItem('rm.google.calendar.clientId')||'');return id.match(/^(\d+)-/)?.[1]||''}
function settingsMarkup(){
  const connected=tokenValid()&&driveGranted(),last=inbox.lastScanAt?new Date(inbox.lastScanAt).toLocaleString('pt-BR'):'Ainda não executado',error=inbox.lastError,project=cloudProjectNumber();
  const disabled=/Drive API ainda não está habilitada/i.test(error);
  return`<section id="rm-gemini-clinical" class="card mt-16" ${scanning?'aria-busy="true"':''}><div class="card-title"><div><div class="eyebrow">Integração clínica automática</div><h3 class="mb-0">Google Meet · Gemini</h3></div><span class="badge">${connected?(lastStatus==='error'?'Atenção':scanning?'Conferindo':'Conectado'):'Reconectar'}</span></div><p class="muted">Cada Anotação do Gemini é associada pelo <strong>nome do participante</strong>. Data e horário confirmam a sessão. Quando a associação é única, a sessão é marcada como realizada/presente e o prontuário recebe automaticamente um <strong>Rascunho IA</strong>.</p><div class="gemini-metrics"><span><strong>${importedItems().length}</strong> importados</span><span><strong>${reviewItems().length}</strong> revisar</span><span><strong>${quarantineItems().length}</strong> quarentena</span><span><strong>${Number(inbox.filesSeen||0)}</strong> arquivos</span></div><div class="small muted mt-12">Backfill desde ${BACKFILL_DATE.split('-').reverse().join('/')} · Última conferência: ${esc(last)}.</div>${error?`<div class="notice warning mt-12"><strong>Integração:</strong> ${esc(error)}${disabled?`<div class="mt-8"><a class="btn secondary" target="_blank" rel="noopener noreferrer" href="https://console.cloud.google.com/apis/library/drive.googleapis.com${project?`?project=${encodeURIComponent(project)}`:''}">Ativar Google Drive API</a></div>`:''}</div>`:''}<div class="flex gap-8 wrap mt-16"><button class="btn" data-action="gemini-scan-now" ${connected?'':'disabled'}>Conferir e importar agora</button><button class="btn secondary" data-action="workspace-connect">${connected?'Renovar Google Workspace':'Conectar Google Workspace'}</button></div><div class="notice mt-12"><strong>Segurança:</strong> nomes e conteúdo clínico não entram no GitHub público. Registros usam IDs determinísticos do arquivo Gemini para evitar duplicação. A importação histórica não cria novos eventos no Google Agenda.</div></section>`;
}
function decorate(){
  if(runtime.locked)return;
  if(runtime.route==='settings'){
    const main=document.getElementById('main-content');if(main){const old=document.getElementById('rm-gemini-clinical'),wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();if(old)old.replaceWith(wrap.firstElementChild);else main.appendChild(wrap.firstElementChild)}
  }
}
async function activate(){
  await Promise.all([loadInbox(),loadWorkspaceToken()]);
  if(tokenValid()&&driveGranted()){emitStatus('connected','Google Workspace autorizado.');void scan({quiet:true})}else emitStatus('disconnected','Google Workspace precisa ser conectado.');
  decorate();clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void scan({quiet:true})},POLL_MS);
}

document.addEventListener('click',e=>{const el=e.target.closest?.('[data-action="gemini-scan-now"]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();void scan({quiet:false})},true);
document.addEventListener('rm:data-ready',()=>void activate());
document.addEventListener('rm:rendered',()=>decorate());
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void activate(),80));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)void scan({quiet:true})});
window.addEventListener('online',()=>void scan({quiet:true}));
