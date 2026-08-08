import {data,runtime,nowISO} from './state.js';
import {putEncrypted,deleteRecord} from './database.js';
import {decryptJson} from './crypto.js';
import {toast} from './ui.js';

const VERSION='1.8.8';
const TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const BACKFILL_DATE='2026-06-01';
const BACKFILL_ISO='2026-06-01T03:00:00Z';
const SYNC_STATE_ID='meet_name_sync_state_v188';
const QUARANTINE_PREFIX='meet_name_quarantine_';
const RECORD_PREFIX='meet_name_rec_';
const PROCESSING_FOLDER_ID='1qBVrRpyYonIghnPTwkek1DnUkeGidJ_n';
const PROCESSING_FOLDER_URL=`https://drive.google.com/drive/folders/${PROCESSING_FOLDER_ID}`;
const POLL_MS=5*60*1000;
let accessToken='';
let expiresAt=0;
let syncing=false;
let pollTimer=null;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const localDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const localTime=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const minutes=(a,b)=>Math.abs(a.getTime()-b.getTime())/60000;
const appointmentStart=a=>new Date(`${a.date}T${a.time||'00:00'}:00-03:00`);
const tokenValid=()=>Boolean(accessToken&&expiresAt>Date.now()+60000);

function meetingStartFromTitle(title=''){
  const m=String(title).match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);
  if(!m)return null;
  const d=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(d.getTime())?null:d;
}
async function loadToken(){
  if(!runtime.key)return false;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw){accessToken='';expiresAt=0;return false}
  try{
    const value=await decryptJson(runtime.key,raw,'google-meet-token');
    if(value?.token&&Number(value.expiresAt)>Date.now()+60000){accessToken=value.token;expiresAt=Number(value.expiresAt);return true}
  }catch{}
  accessToken='';expiresAt=0;return false;
}
async function googleFetch(url,options={}){
  if(!tokenValid())throw new Error('A autorização do Google Workspace precisa ser renovada.');
  const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${accessToken}`,...(options.headers||{})}});
  if(r.status===401||r.status===403){accessToken='';expiresAt=0;throw new Error('A autorização do Google Workspace expirou ou não possui leitura do Drive. Renove a conexão.')}
  return r;
}
async function saveSetting(item){
  const value={...item,updatedAt:nowISO()},list=data.settings||(data.settings=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);await putEncrypted('settings',value,runtime.key);return value;
}
async function saveAppointment(item){
  const value={...item,updatedAt:nowISO()},list=data.appointments||(data.appointments=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);await putEncrypted('appointments',value,runtime.key);return value;
}
async function saveRecord(item){
  const value={...item,updatedAt:nowISO()},list=data.records||(data.records=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);await putEncrypted('records',value,runtime.key);return value;
}

async function listGeminiNotes(){
  const out=[];let pageToken='';
  do{
    const u=new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Anotações do Gemini'`);
    u.searchParams.set('pageSize','1000');u.searchParams.set('orderBy','createdTime asc');u.searchParams.set('spaces','drive');
    u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,parents,mimeType)');
    u.searchParams.set('supportsAllDrives','true');u.searchParams.set('includeItemsFromAllDrives','true');if(pageToken)u.searchParams.set('pageToken',pageToken);
    const r=await googleFetch(u.toString());if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);const p=await r.json();out.push(...arr(p.files));pageToken=p.nextPageToken||'';
  }while(pageToken);
  return out;
}
async function exportText(fileId){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const r=await googleFetch(url);if(!r.ok)throw new Error(`Não foi possível ler a anotação do Gemini (${r.status}).`);return r.text();
}

function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){const n=normalize(m[1]);if(n&&n.length<=80)found.add(n)}
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){const n=normalize(m[1]);if(n&&n.length<=80)found.add(n)}
  return [...found];
}
function patientAliases(p){
  const aliases=[];
  for(const v of [p?.name,p?.preferredName]){const n=normalize(v);if(n&&!aliases.includes(n))aliases.push(n)}
  return aliases;
}
function uniqueFirstName(patient){
  const first=normalize(String(patient?.preferredName||patient?.name||'').trim().split(/\s+/)[0]);
  if(first.length<4)return'';
  const same=arr(data.patients).filter(p=>normalize(String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0])===first);
  return same.length===1?first:'';
}
function identifyPatient(raw=''){
  const text=normalize(raw),labels=participantLabels(raw),ranked=[];
  for(const p of arr(data.patients)){
    let score=0,evidence='';
    for(const alias of patientAliases(p)){
      const words=alias.split(' ').filter(Boolean);
      if(words.length>=2&&labels.some(l=>l===alias||l.startsWith(alias+' ')||alias.startsWith(l+' '))){score=Math.max(score,120);evidence=`participante:${alias}`}
      else if(words.length>=2&&text.includes(alias)){score=Math.max(score,90);evidence=`texto:${alias}`}
    }
    const first=uniqueFirstName(p);
    if(first&&labels.some(l=>l===first||l.startsWith(first+' '))&&score<80){score=80;evidence=`participante:${first}`}
    if(score)ranked.push({patient:p,score,evidence});
  }
  ranked.sort((a,b)=>b.score-a.score);
  if(!ranked.length)return{patient:null,reason:'Nenhum paciente do cofre foi identificado nominalmente nas Anotações/Transcrição do Gemini.'};
  if(ranked.length>1&&ranked[0].score===ranked[1].score)return{patient:null,reason:'Mais de um paciente corresponde ao nome encontrado no Gemini; associação mantida em quarentena.'};
  return ranked[0];
}
function findAppointment(patientId,start){
  if(!patientId||!start)return null;
  const date=localDate(start),candidates=arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===date&&a?.time&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou');
  const ranked=candidates.map(a=>({a,delta:minutes(appointmentStart(a),start)})).filter(x=>x.delta<=60).sort((x,y)=>x.delta-y.delta);
  if(!ranked.length)return null;if(ranked.length>1&&ranked[1].delta-ranked[0].delta<10)return null;return ranked[0];
}
async function ensureAppointment(patient,start,file){
  const found=findAppointment(patient.id,start);if(found)return{appointment:found.a,delta:found.delta,created:false};
  const a={id:`meetnameappt_${file.id}`,patientId:patient.id,date:localDate(start),time:localTime(start),duration:50,status:'Realizada',modality:'On-line',recurrence:'Avulso',note:'Sessão histórica identificada pelo nome do paciente nas Anotações do Gemini.',createdAt:nowISO(),source:{type:'google-meet-name-backfill',fileId:file.id}};
  await saveAppointment(a);return{appointment:a,delta:0,created:true};
}
function section(text,startLabel,endLabels=[]){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim());const start=lines.findIndex(x=>normalize(x)===normalize(startLabel));if(start<0)return'';let end=lines.length;
  for(let i=start+1;i<lines.length;i++){if(endLabels.some(label=>normalize(lines[i])===normalize(label))){end=i;break}}
  return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function cleanSteps(v=''){return String(v).split(/\r?\n/).map(line=>line.replace(/^\*\s*/,'').replace(/^\[[^\]]+\]\s*/,'').trim()).filter(Boolean).map(x=>`• ${x}`).join('\n')}
function clinicalDraft(raw=''){
  const source=String(raw).split(/📖\s*Transcrição/i)[0].trim(),summary=section(source,'Resumo',['Próximas etapas','Detalhes']),next=cleanSteps(section(source,'Próximas etapas',['Detalhes']));
  return{
    text:['SÍNTESE DA SESSÃO',summary||'O Gemini não apresentou uma seção de resumo estruturada.',next?`\nORIENTAÇÕES, TAREFAS OU ENCAMINHAMENTOS REGISTRADOS\n${next}`:'','\n[Texto organizado automaticamente a partir das Anotações do Gemini. Rascunho para revisão profissional; nenhuma informação ausente foi inferida.]'].filter(Boolean).join('\n\n'),
    followup:next.replace(/^•\s*/gm,'').trim()
  };
}
async function detachFileFromWrongAppointments(fileId,correctAppointmentId){
  for(const a of arr(data.appointments)){
    if(a?.id===correctAppointmentId)continue;
    const notes=arr(a?.meet?.smartNotes);if(!notes.some(n=>n?.fileId===fileId))continue;
    a.meet.smartNotes=notes.filter(n=>n?.fileId!==fileId);
    if(!a.meet.smartNotes.length)a.meet=null;else if(a.meet.primaryFileId===fileId)a.meet.primaryFileId=a.meet.smartNotes[0]?.fileId||'';
    await saveAppointment(a);
    const wrong=arr(data.records).find(r=>r?.source?.fileId===fileId&&r?.appointmentId===a.id);
    if(wrong&&wrong.status!=='Finalizado'&&!wrong.validatedAt){data.records=data.records.filter(r=>r?.id!==wrong.id);await deleteRecord('records',wrong.id)}
  }
}
async function attach(file,raw,patient,start,evidence){
  const ensured=await ensureAppointment(patient,start,file),a=ensured.appointment;
  await detachFileFromWrongAppointments(file.id,a.id);
  const meta={fileId:file.id,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,title:file.name,meetingStartedAt:start.toISOString(),modifiedTime:file.modifiedTime||'',linkedAt:nowISO(),matchMethod:'gemini-patient-name',matchEvidence:evidence||'nome',matchDeltaMinutes:Math.round(ensured.delta||0)};
  const prior=arr(a?.meet?.smartNotes).filter(n=>n?.fileId!==file.id);
  a.meet={source:'google-meet-gemini-name',syncedAt:nowISO(),primaryFileId:file.id,processingFolderId:PROCESSING_FOLDER_ID,patientIdentitySource:'Gemini participant name',smartNotes:[meta,...prior]};
  await saveAppointment(a);
  const d=clinicalDraft(raw),existing=arr(data.records).find(r=>r?.source?.fileId===file.id&&r?.patientId===patient.id);
  if(!existing||(!existing.validatedAt&&existing.status!=='Finalizado')){
    await saveRecord({...(existing||{}),id:existing?.id||`${RECORD_PREFIX}${file.id}`,patientId:patient.id,appointmentId:a.id,title:'Evolução de sessão · Gemini',date:a.date,status:'Rascunho IA',text:d.text,followup:d.followup,requiresReview:true,createdAt:existing?.createdAt||nowISO(),addenda:arr(existing?.addenda),source:{type:'google-meet-gemini',fileId:file.id,url:meta.url,title:file.name,modifiedTime:file.modifiedTime||'',identityMethod:'gemini-patient-name',version:VERSION}});
  }
  const q=arr(data.settings).find(x=>x?.id===`${QUARANTINE_PREFIX}${file.id}`);if(q){q.status='Resolvido automaticamente';q.resolvedAt=nowISO();await saveSetting(q)}
  return ensured.created;
}
async function quarantine(file,reason){
  return saveSetting({id:`${QUARANTINE_PREFIX}${file.id}`,kind:'meet-name-quarantine',fileId:file.id,title:file.name,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,meetingStartedAt:meetingStartFromTitle(file.name)?.toISOString()||'',reason,status:'Pendente',createdAt:nowISO()});
}

async function sync({quiet=false}={}){
  if(syncing||runtime.locked||!runtime.key||!runtime.dataReady)return;
  await loadToken();if(!tokenValid()){paint();return}
  syncing=true;paint(true);
  try{
    const files=await listGeminiNotes();let linked=0,quarantined=0,created=0;
    for(const file of files){
      const start=meetingStartFromTitle(file.name);if(!start){await quarantine(file,'Data/hora da reunião não pôde ser obtida do nome do documento.');quarantined++;continue}
      const raw=await exportText(file.id),id=identifyPatient(raw);
      if(!id.patient){await quarantine(file,id.reason);quarantined++;continue}
      if(await attach(file,raw,id.patient,start,id.evidence))created++;
      linked++;
    }
    await saveSetting({id:SYNC_STATE_ID,kind:'meet-name-sync-state',backfillStart:BACKFILL_DATE,lastScanAt:nowISO(),linkedSessions:linked,smartNotesFound:files.length,quarantineCount:quarantined,createdAppointments:created,status:'OK',identityRule:'Nome do paciente no Gemini'});
    paint();window.__rmRender?.();
    if(!quiet)toast(`Gemini conferido: ${linked} resumo(s) vinculado(s) pelo nome do paciente e ${quarantined} em quarentena.`,'success');
  }catch(err){
    await saveSetting({id:SYNC_STATE_ID,kind:'meet-name-sync-state',backfillStart:BACKFILL_DATE,lastScanAt:nowISO(),status:'Erro',error:String(err?.message||err),identityRule:'Nome do paciente no Gemini'}).catch(()=>{});
    paint();if(!quiet)toast(err?.message||'Não foi possível conferir as Anotações do Gemini.','error');
  }finally{syncing=false;paint()}
}
function syncState(){return arr(data.settings).find(x=>x?.id===SYNC_STATE_ID)||null}
function markup(){
  const s=syncState(),connected=tokenValid(),last=s?.lastScanAt?new Date(s.lastScanAt).toLocaleString('pt-BR'):'Ainda não executado';
  return`<section id="rm-google-meet-sync" class="card mt-16"><div class="card-title"><div><div class="eyebrow">Integração clínica</div><h3 class="mb-0">Google Meet · Anotações do Gemini</h3></div><span class="badge">${connected?'Conectado':'Não conectado'}</span></div><p class="muted">A plataforma procura o <strong>nome do paciente nas próprias Anotações/Transcrição do Gemini</strong> e só depois confirma a sessão pela data e pelo horário. O código interno do paciente não é usado para identificar o resumo.</p><div class="meet-sync-metrics"><span><strong>${Number(s?.linkedSessions||0)}</strong> vinculadas</span><span><strong>${Number(s?.smartNotesFound||0)}</strong> notas localizadas</span><span><strong>${Number(s?.quarantineCount||0)}</strong> quarentena</span></div><div class="small muted mt-8">Backfill desde 01/06/2026 · Última conferência: ${last}.</div><div class="flex gap-8 wrap mt-16">${connected?'<button class="btn" data-action="meet-name-sync-now">Conferir Gemini agora</button>':'<button class="btn" data-action="meet-connect">Conectar Google Workspace</button>'}<a class="btn secondary" href="${PROCESSING_FOLDER_URL}" target="_blank" rel="noopener noreferrer">Pasta de processamento</a></div><div class="notice mt-12"><strong>Regra de segurança:</strong> se o nome não puder ser identificado de forma única no Gemini, o documento não entra no prontuário e permanece em quarentena. A evolução é criada como <em>Rascunho IA</em> para revisão profissional.</div></section>`;
}
function paint(force=false){
  if(runtime.locked||runtime.route!=='settings')return;const main=document.getElementById('main-content');if(!main)return;const old=document.getElementById('rm-google-meet-sync'),wrap=document.createElement('div');wrap.innerHTML=markup();const fresh=wrap.firstElementChild;if(force)fresh?.setAttribute('aria-busy','true');if(old)old.replaceWith(fresh);else main.appendChild(fresh)
}
function decorateSessions(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='timeline')return;
  document.querySelectorAll('.patient-session-card').forEach(card=>{
    if(card.querySelector('.patient-meet-summary'))return;
    const b=card.querySelector('[data-action="appointment-manage"][data-id]')||card.querySelector('[data-action="edit-appointment"][data-id]');const a=arr(data.appointments).find(x=>x?.id===b?.dataset.id),notes=arr(a?.meet?.smartNotes);if(!notes.length)return;
    const rec=arr(data.records).find(r=>r?.appointmentId===a.id&&r?.source?.type==='google-meet-gemini');const box=document.createElement('div');box.className='patient-meet-summary';box.innerHTML=`<div><strong>Google Meet · Gemini ✓</strong><div class="small muted">Identificado pelo nome no Gemini · ${rec?.status||'resumo vinculado'}</div></div><div class="flex gap-8 wrap"><button class="btn ghost" data-action="meet-name-open-summary" data-url="${String(notes[0].url||'').replace(/"/g,'&quot;')}">Ver resumo</button>${rec?'<button class="btn ghost" data-action="meet-name-open-records">Abrir prontuário</button>':''}</div>`;card.appendChild(box)
  })
}
async function activate(){await loadToken();paint();decorateSessions();if(tokenValid())sync({quiet:true});if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)sync({quiet:true})},POLL_MS)}
document.addEventListener('click',e=>{const el=e.target.closest?.('[data-action]');if(!el)return;const a=el.dataset.action;if(!['meet-name-sync-now','meet-name-open-summary','meet-name-open-records'].includes(a))return;e.preventDefault();e.stopImmediatePropagation();if(a==='meet-name-sync-now'){void sync({quiet:false});return}if(a==='meet-name-open-summary'){if(el.dataset.url)window.open(el.dataset.url,'_blank','noopener,noreferrer');return}if(a==='meet-name-open-records'){runtime.patientTab='records';window.__rmRender?.()}},true);
document.addEventListener('rm:data-ready',()=>void activate());
document.addEventListener('rm:rendered',()=>{paint();decorateSessions()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync({quiet:true})});
window.addEventListener('online',()=>void sync({quiet:true}));
