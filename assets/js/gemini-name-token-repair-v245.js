import {data,runtime,preferences,nowISO} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {bulkPutEncrypted,deleteRecord} from './database.js';
import {toast} from './ui.js';

const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const BACKFILL_ISO='2026-05-01T03:00:00Z';
const DONE_KEY='rm.google.clinical.name-token-repair.v245.done';
const VERSION='2.4.5';
const PROMPT_VERSION='TCC-CFP-v2.4';
const CONCURRENCY=2;
let running=false,syncState='unknown';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const activePatients=()=>arr(data.patients).filter(p=>!['Encerrado','Arquivado'].includes(p?.status||'')&&normalize(p?.name)!==normalize(preferences.professionalName));
const aliasesOf=p=>[...new Set([p?.name,p?.preferredName].map(normalize).filter(Boolean))];
const nameTokens=p=>[...new Set(normalize(p?.name).split(' ').concat(normalize(p?.preferredName).split(' ')).filter(x=>x.length>=4))];

function uniquePatientByNameValue(value,patients){
  const key=normalize(value);if(!key)return null;
  const direct=patients.filter(p=>aliasesOf(p).some(a=>a===key||a.startsWith(key+' ')||key.startsWith(a+' ')));
  if(direct.length===1)return direct[0];
  if(key.includes(' '))return null;
  const hits=patients.filter(p=>nameTokens(p).includes(key));
  return hits.length===1?hits[0]:null;
}
function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){const n=normalize(m[1]);if(n)found.add(n)}
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){const n=normalize(m[1]);if(n)found.add(n)}
  return[...found];
}
function learnAliases(raws){
  const patients=activePatients(),professional=normalize(preferences.professionalName),labels=[...new Set(raws.flatMap(participantLabels))].filter(l=>l&&l!==professional),learned={};
  for(const raw of raws){
    const text=String(raw||'');
    for(const m of text.matchAll(/\(([^)\n]{2,90})\)/g)){
      const patient=uniquePatientByNameValue(m[1],patients);if(!patient)continue;
      const before=normalize(text.slice(Math.max(0,m.index-220),m.index));
      const candidates=labels.filter(l=>before.lastIndexOf(l)>=0).sort((a,b)=>before.lastIndexOf(b)-before.lastIndexOf(a)||b.length-a.length);
      const alias=candidates[0];
      if(alias&&alias.length>=3)learned[alias]=patient.id;
    }
  }
  return learned;
}
function identifyPatient(raw,learned){
  const patients=activePatients(),professional=normalize(preferences.professionalName),labels=participantLabels(raw).filter(l=>l!==professional),rank=[];
  for(const p of patients){let score=0,evidence='';
    for(const alias of aliasesOf(p)){if(alias.split(' ').length>=2&&labels.some(l=>l===alias||l.startsWith(alias+' ')||alias.startsWith(l+' '))){score=200;evidence='nome completo do paciente no Gemini';break}}
    if(!score){for(const l of labels){if(learned[l]===p.id){score=195;evidence='identificador do Meet associado por nome único no Gemini';break}}}
    if(score)rank.push({patient:p,score,evidence});
  }
  rank.sort((a,b)=>b.score-a.score);
  if(!rank.length)return{patient:null,reason:'Documento sem paciente ativo identificado com segurança.'};
  if(rank.length>1&&rank[0].score-rank[1].score<20)return{patient:null,reason:'Associação ambígua entre pacientes.'};
  return rank[0];
}
function addDays(date,days){const d=new Date(`${date}T12:00:00-03:00`);d.setDate(d.getDate()+days);return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function normalizeSlot(date,time){let[h,m]=String(time||'00:00').split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return{date,time};if(m>=30){h++;if(h>=24){h=0;date=addDays(date,1)}}return{date,time:`${pad(h)}:00`,rawTime:time}}
function meetingInfo(file){const title=String(file?.name||'');let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(m)return normalizeSlot(`${m[1]}-${m[2]}-${m[3]}`,`${m[4]}:${m[5]}`);m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);return m?normalizeSlot(`${m[3]}-${m[2]}-${m[1]}`,`${m[4]}:${m[5]}`):null}
const meetingIso=(date,time)=>`${date}T${time}:00-03:00`;
function deriveDuration(raw=''){let max=0;for(const m of String(raw).matchAll(/\b(\d{2}):(\d{2}):(\d{2})\b/g)){const sec=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);if(Number.isFinite(sec))max=Math.max(max,sec)}const min=Math.ceil(max/60);return min>=20&&min<=180?min:Number(preferences.defaultSessionMinutes||50)}
function section(raw,labels,endLabels=[]){const lines=String(raw||'').replace(/^\uFEFF/,'').split(/\r?\n/),starts=labels.map(normalize),ends=endLabels.map(normalize),start=lines.findIndex(x=>starts.includes(normalize(x)));if(start<0)return'';let end=lines.length;for(let i=start+1;i<lines.length;i++)if(ends.includes(normalize(lines[i]))){end=i;break}return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim()}
function cleanLine(v=''){return String(v).replace(/\s*\(\d{2}:\d{2}:\d{2}\)(?:\s*\(\d{2}:\d{2}:\d{2}\))*\s*/g,' ').replace(/^[-*•]\s*/,'').replace(/\s+/g,' ').trim()}
function escapeRx(v=''){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function neutralize(v,patient){let out=String(v||'');for(const name of [patient?.name,patient?.preferredName].filter(Boolean).sort((a,b)=>b.length-a.length))out=out.replace(new RegExp(`\\b${escapeRx(name)}\\b`,'gi'),'Paciente');out=out.replace(new RegExp(`\\b${escapeRx(preferences.professionalName)}\\b`,'gi'),'Profissional');return out}
function buildClinicalDraft(raw,patient){
  const source=String(raw).split(/📖\s*Transcri[cç][aã]o/i)[0].trim();
  const summary=neutralize(section(source,['Resumo','Summary'],['Próximas etapas','Proximas etapas','Next steps','Detalhes','Details']),patient);
  const details=section(source,['Detalhes','Details'],['Revise as anotações','Revise as anotacoes']);
  const lines=String(details).split(/\r?\n/).map(cleanLine).filter(Boolean);
  const procedureRx=/orient|psicoeduc|reestrutur|question|socr[aá]t|registro|exposi[cç]|ativa[cç][aã]o comport|planej|trein|habilidade|relax|respira|mindful|preven[cç][aã]o|discut|trabalh|interven|explor|identific|valida[cç]|modelo|matriz|t[eé]cnica/i;
  const responseRx=/relat|referiu|percebeu|reconheceu|identificou|avaliou|decidiu|concordou|demonstrou|apresentou|melhora|dificuldade|redu[cç][aã]o|aumento|mant[eé]m|descreveu/i;
  const procedures=lines.filter(x=>procedureRx.test(x)).slice(0,6).map(x=>`• ${neutralize(x,patient)}`).join('\n');
  const responses=lines.filter(x=>responseRx.test(x)&&!procedureRx.test(x)).slice(0,5).map(x=>`• ${neutralize(x,patient)}`).join('\n');
  const steps=section(source,['Próximas etapas','Proximas etapas','Next steps'],['Detalhes','Details']).split(/\r?\n/).map(cleanLine).filter(Boolean).map(x=>`• ${neutralize(x,patient)}`).join('\n');
  const fallback=neutralize(source.slice(0,3500),patient);
  return{title:'Evolução de sessão',text:[`Foco clínico e evolução da sessão\n${summary||fallback||'Síntese automática indisponível.'}`,procedures?`Procedimentos técnico-científicos adotados\n${procedures}`:'',responses?`Resposta do paciente e resultados observados\n${responses}`:'',steps?`Plano terapêutico, tarefas e encaminhamentos\n${steps}`:''].filter(Boolean).join('\n\n'),followup:steps.replace(/^•\s*/gm,'').trim()};
}
function existingAppointment(fileId){return arr(data.appointments).find(a=>a?.id===`gmappt_${fileId}`||a?.source?.fileId===fileId||a?.gemini?.fileId===fileId)||null}
function existingRecord(fileId){return arr(data.records).find(r=>r?.id===`gmrec_${fileId}`||r?.source?.fileId===fileId)||null}
function isAutoAppointment(a,fileId){return Boolean(a&&(a.id===`gmappt_${fileId}`||a?.source?.type==='google-meet-gemini'||a?.gemini?.fileId===fileId))}
function isAutoRecord(r,fileId){return Boolean(r&&(r.id===`gmrec_${fileId}`||r?.source?.type==='google-meet-gemini'))}
async function mapLimit(list,limit,fn){const out=new Array(list.length);let cursor=0;async function worker(){while(cursor<list.length){const i=cursor++;out[i]=await fn(list[i],i)}}await Promise.all(Array.from({length:Math.min(limit,list.length)},worker));return out}
async function loadToken(){if(!runtime.key)return null;let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}if(!raw)return null;try{const v=await decryptJson(runtime.key,raw,'google-calendar-token'),scopes=String(v?.scope||'').split(/\s+/);if(v?.token&&Number(v.expiresAt)>Date.now()+60000&&scopes.includes(DRIVE_SCOPE))return v}catch{}return null}
async function gfetch(url,token){const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(r.status===401||r.status===403)throw new Error('Renove a conexão do Google Workspace.');return r}
async function listDocs(token){const out=[];let pageToken='';do{const u=new URL('https://www.googleapis.com/drive/v3/files');u.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);u.searchParams.set('pageSize','1000');u.searchParams.set('orderBy','createdTime asc');u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,mimeType)');if(pageToken)u.searchParams.set('pageToken',pageToken);const r=await gfetch(u,token);if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);const j=await r.json();out.push(...arr(j.files));pageToken=j.nextPageToken||''}while(pageToken);return out.filter(f=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(f?.name||''))}
async function exportDoc(id,token){const r=await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('text/plain')}`,token);if(!r.ok)throw new Error(`Não foi possível ler a anotação ${id}.`);return r.text()}
async function loadCatalog(){let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}if(!raw)return{version:5,lastScanAt:'',lastError:'',filesSeen:0,aliases:{},items:[]};try{const v=await decryptJson(runtime.key,raw,CATALOG_AAD);return v&&Array.isArray(v.items)?{...v,items:v.items}:{version:5,lastScanAt:'',lastError:'',filesSeen:0,aliases:{},items:[]}}catch{return{version:5,lastScanAt:'',lastError:'',filesSeen:0,aliases:{},items:[]}}}
async function saveCatalog(catalog){const encrypted=await encryptJson(runtime.key,{...catalog,version:6,aliasRuleVersion:'2.4.5',items:arr(catalog.items).slice(-700)},CATALOG_AAD);localStorage.setItem(CATALOG_STORAGE,JSON.stringify(encrypted))}
function upsertCatalog(catalog,item){const i=arr(catalog.items).findIndex(x=>x?.fileId===item.fileId);if(i>=0)catalog.items[i]={...catalog.items[i],...item};else catalog.items.push(item)}

async function repair(){
  if(running||localStorage.getItem(DONE_KEY)==='1'||syncState!=='synced'||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return;
  running=true;
  try{
    const auth=await loadToken();if(!auth)return;
    const files=await listDocs(auth.token),fetched=await mapLimit(files,CONCURRENCY,async file=>({file,meeting:meetingInfo(file),raw:await exportDoc(file.id,auth.token)}));
    const catalog=await loadCatalog(),learned=learnAliases(fetched.map(x=>x.raw));
    catalog.aliases={...(catalog.aliases||{}),...learned};catalog.aliasRuleVersion='2.4.5';catalog.aliasesBootstrappedAt=nowISO();catalog.filesSeen=files.length;
    const appointmentWrites=new Map(),recordWrites=new Map(),appointmentDeletes=new Set(),recordDeletes=new Set();
    let createdAppointments=0,createdRecords=0,removed=0,corrected=0;
    for(const d of fetched){
      const match=d.meeting?identifyPatient(d.raw,catalog.aliases):{patient:null,reason:'Data/hora não identificada no título.'};
      const oldA=existingAppointment(d.file.id),oldR=existingRecord(d.file.id);
      if(!match.patient||!d.meeting){
        if(isAutoRecord(oldR,d.file.id)&&oldR?.status!=='Finalizado'){recordDeletes.add(oldR.id);removed++}
        if(isAutoAppointment(oldA,d.file.id)){appointmentDeletes.add(oldA.id);removed++}
        upsertCatalog(catalog,{fileId:d.file.id,name:d.file.name,url:d.file.webViewLink||'',modifiedTime:d.file.modifiedTime||'',meetingDate:d.meeting?.date||'',meetingTime:d.meeting?.time||'',patientId:null,status:'review',reason:match.reason||'Documento sem paciente ativo.',version:VERSION});
        continue;
      }
      const patient=match.patient,sourceModifiedAt=d.file.modifiedTime||meetingIso(d.meeting.date,d.meeting.time),createdAt=meetingIso(d.meeting.date,d.meeting.time),draft=buildClinicalDraft(d.raw,patient);
      let appointment=oldA;
      if(!appointment){appointment={id:`gmappt_${d.file.id}`,patientId:patient.id,date:d.meeting.date,time:d.meeting.time,duration:deriveDuration(d.raw),status:'Realizada',attendanceStatus:'Presente',modality:'On-line',recurrence:'Avulso',note:'Sessão confirmada pelas Anotações do Google Meet/Gemini.',createdAt,updatedAt:nowISO(),source:{type:'google-meet-gemini',fileId:d.file.id,url:d.file.webViewLink||'',sourceModifiedAt}};createdAppointments++}
      else{const before=`${appointment.patientId}|${appointment.date}|${appointment.time}|${appointment.status}|${appointment.attendanceStatus}`;appointment={...appointment,patientId:patient.id,date:d.meeting.date,time:d.meeting.time,status:'Realizada',attendanceStatus:'Presente',updatedAt:nowISO(),source:{...(appointment.source||{}),type:'google-meet-gemini',fileId:d.file.id,url:d.file.webViewLink||appointment.source?.url||'',sourceModifiedAt},gemini:{...(appointment.gemini||{}),fileId:d.file.id,url:d.file.webViewLink||'',meetingDate:d.meeting.date,meetingTime:d.meeting.time,rawTime:d.meeting.rawTime||d.meeting.time,sourceModifiedAt}};if(before!==`${appointment.patientId}|${appointment.date}|${appointment.time}|${appointment.status}|${appointment.attendanceStatus}`)corrected++}
      appointmentWrites.set(appointment.id,appointment);
      let record=oldR;
      if(record?.status!=='Finalizado'){
        if(!record)createdRecords++;
        record={...(record||{}),id:record?.id||`gmrec_${d.file.id}`,patientId:patient.id,appointmentId:appointment.id,title:draft.title,date:d.meeting.date,status:'Rascunho IA',text:draft.text,followup:draft.followup,requiresReview:true,createdAt:record?.createdAt||createdAt,updatedAt:nowISO(),addenda:record?.addenda||[],source:{...(record?.source||{}),type:'google-meet-gemini',fileId:d.file.id,url:d.file.webViewLink||'',title:d.file.name||'',sourceModifiedAt,version:VERSION,clinicalPromptVersion:PROMPT_VERSION,aiSource:'Google Meet/Gemini'}};
        recordWrites.set(record.id,record);
      }
      upsertCatalog(catalog,{fileId:d.file.id,name:d.file.name,url:d.file.webViewLink||`https://docs.google.com/document/d/${d.file.id}`,modifiedTime:d.file.modifiedTime||'',patientId:patient.id,meetingDate:d.meeting.date,meetingTime:d.meeting.time,rawTime:d.meeting.rawTime||d.meeting.time,status:'materialized',reason:match.evidence,appointmentId:appointment.id,recordId:record?.id||'',version:VERSION});
    }
    const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;
    try{for(const id of recordDeletes)await deleteRecord('records',id);for(const id of appointmentDeletes)await deleteRecord('appointments',id);if(appointmentWrites.size)await bulkPutEncrypted('appointments',[...appointmentWrites.values()],runtime.key);if(recordWrites.size)await bulkPutEncrypted('records',[...recordWrites.values()],runtime.key)}finally{globalThis.__rmSyncApplying=previous}
    if(recordDeletes.size)data.records=data.records.filter(r=>!recordDeletes.has(r.id));if(appointmentDeletes.size)data.appointments=data.appointments.filter(a=>!appointmentDeletes.has(a.id));
    for(const value of appointmentWrites.values()){const i=data.appointments.findIndex(x=>x.id===value.id);if(i>=0)data.appointments[i]=value;else data.appointments.push(value)}
    for(const value of recordWrites.values()){const i=data.records.findIndex(x=>x.id===value.id);if(i>=0)data.records[i]=value;else data.records.push(value)}
    catalog.lastScanAt=nowISO();catalog.lastError='';await saveCatalog(catalog);localStorage.setItem(DONE_KEY,'1');
    const changed=appointmentWrites.size+recordWrites.size+appointmentDeletes.size+recordDeletes.size;if(changed)document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',kind:'gemini-name-token-repair-v245',at:nowISO(),changed}}));
    window.__rmRender?.();toast(`Gemini corrigido: ${createdAppointments} sessão(ões) criada(s), ${createdRecords} prontuário(s) criado(s), ${corrected} vínculo(s) corrigido(s) e ${removed} materialização(ões) removida(s).`,'success');
  }catch(err){console.error('Falha no reparo por nome único Gemini v2.4.5',err);toast(err?.message||'Não foi possível corrigir o histórico do Gemini.','error')}finally{running=false}
}

document.addEventListener('rm:sync-status',e=>{syncState=e.detail?.status||syncState;if(syncState==='synced')setTimeout(()=>void repair(),900)});
document.addEventListener('rm:data-ready',()=>setTimeout(()=>void repair(),1300));
