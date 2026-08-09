import {data,runtime,preferences,nowISO} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {bulkPutEncrypted,deleteRecord} from './database.js';
import {toast} from './ui.js';

const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const DONE_KEY='rm.google.clinical.reclassify.v241.done';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const BACKFILL_ISO='2026-05-01T03:00:00Z';
const CONCURRENCY=2;
let running=false;
let syncState='unknown';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const activePatients=()=>arr(data.patients).filter(p=>!['Encerrado','Arquivado'].includes(p?.status||'')&&normalize(p?.name)!==normalize(preferences.professionalName));
const patientById=id=>arr(data.patients).find(p=>p?.id===id)||null;
const patientAliases=p=>[...new Set([p?.name,p?.preferredName].map(normalize).filter(Boolean))];
const firstName=p=>normalize(String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]);

function uniqueFirstPatient(name,patients){const key=normalize(name).split(' ')[0];if(key.length<4)return null;const hits=patients.filter(p=>firstName(p)===key);return hits.length===1?hits[0]:null}
function participantLabels(raw=''){const found=new Set();for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){const n=normalize(m[1]);if(n)found.add(n)}for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){const n=normalize(m[1]);if(n)found.add(n)}return[...found]}
function addDays(date,days){const d=new Date(`${date}T12:00:00-03:00`);d.setDate(d.getDate()+days);return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function normalizeSlot(date,time){let[h,m]=String(time||'00:00').split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return{date,time};if(m>=30){h++;if(h>=24){h=0;date=addDays(date,1)}}return{date,time:`${pad(h)}:00`,rawTime:time}}
function meetingInfo(file){const title=String(file?.name||'');let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(m)return normalizeSlot(`${m[1]}-${m[2]}-${m[3]}`,`${m[4]}:${m[5]}`);m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);return m?normalizeSlot(`${m[3]}-${m[2]}-${m[1]}`,`${m[4]}:${m[5]}`):null}
function identifyPatient(raw,learned){const labels=participantLabels(raw).filter(l=>l!==normalize(preferences.professionalName)),patients=activePatients(),rank=[];for(const p of patients){let score=0,evidence='';for(const alias of patientAliases(p)){if(alias.split(' ').length>=2&&labels.some(l=>l===alias||l.startsWith(alias+' ')||alias.startsWith(l+' '))){score=180;evidence='nome completo no Gemini';break}}if(!score){for(const l of labels){if(learned[l]===p.id){score=170;evidence='identificador aprendido no Gemini';break}}}if(!score){const first=firstName(p);if(first.length>=4&&patients.filter(x=>firstName(x)===first).length===1&&labels.some(l=>l===first||l.startsWith(first+' '))){score=135;evidence='primeiro nome único no cofre'}}if(score)rank.push({patient:p,score,evidence})}rank.sort((a,b)=>b.score-a.score);if(!rank.length)return{patient:null,reason:'Paciente não identificado com segurança.'};if(rank.length>1&&rank[0].score-rank[1].score<20)return{patient:null,reason:'Associação ambígua entre pacientes.'};return rank[0]}
function learnAliases(raws,seed={}){const patients=activePatients(),learned={...seed};for(const raw of raws){for(const m of String(raw||'').matchAll(/([^\n:()]{2,80})\s*\(([^)\n]{2,60})\)/g)){const outer=normalize(m[1]),inner=normalize(m[2]);if(!outer||!inner)continue;const p=patients.find(x=>patientAliases(x).some(a=>a===inner||a.startsWith(inner+' ')||inner.startsWith(a+' ')))||uniqueFirstPatient(inner,patients);if(p)learned[outer]=p.id}}return learned}
async function mapLimit(list,limit,fn){const out=new Array(list.length);let cursor=0;async function worker(){while(cursor<list.length){const i=cursor++;out[i]=await fn(list[i],i)}}await Promise.all(Array.from({length:Math.min(limit,list.length)},worker));return out}
async function loadToken(){if(!runtime.key)return null;let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}if(!raw)return null;try{const v=await decryptJson(runtime.key,raw,'google-calendar-token');const scopes=String(v?.scope||'').split(/\s+/);if(v?.token&&Number(v.expiresAt)>Date.now()+60000&&scopes.includes(DRIVE_SCOPE))return v}catch{}return null}
async function gfetch(url,token){const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(r.status===401||r.status===403)throw new Error('Renove a conexão do Google Workspace.');return r}
async function listDocs(token){const out=[];let pageToken='';do{const u=new URL('https://www.googleapis.com/drive/v3/files');u.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);u.searchParams.set('pageSize','1000');u.searchParams.set('orderBy','createdTime asc');u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,mimeType)');if(pageToken)u.searchParams.set('pageToken',pageToken);const r=await gfetch(u,token);if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);const j=await r.json();out.push(...arr(j.files));pageToken=j.nextPageToken||''}while(pageToken);return out.filter(f=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(f?.name||''))}
async function exportDoc(id,token){const r=await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('text/plain')}`,token);if(!r.ok)throw new Error(`Não foi possível ler a anotação ${id}.`);return r.text()}
async function loadCatalog(){let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}if(!raw)return{version:2,lastScanAt:'',lastError:'',filesSeen:0,aliases:{},aliasesBootstrappedAt:'',items:[]};try{const v=await decryptJson(runtime.key,raw,CATALOG_AAD);return v&&Array.isArray(v.items)?{...v,aliases:v.aliases&&typeof v.aliases==='object'?v.aliases:{},items:v.items}: {version:2,lastScanAt:'',lastError:'',filesSeen:0,aliases:{},aliasesBootstrappedAt:'',items:[]}}catch{return{version:2,lastScanAt:'',lastError:'',filesSeen:0,aliases:{},aliasesBootstrappedAt:'',items:[]}}}
async function saveCatalog(catalog){const encrypted=await encryptJson(runtime.key,{...catalog,version:3,items:arr(catalog.items).slice(-700)},CATALOG_AAD);localStorage.setItem(CATALOG_STORAGE,JSON.stringify(encrypted))}
function upsertItem(catalog,item){const i=arr(catalog.items).findIndex(x=>x?.fileId===item.fileId);if(i>=0)catalog.items[i]={...catalog.items[i],...item};else catalog.items.push(item)}
function generatedAppointmentFor(fileId){return arr(data.appointments).find(a=>a?.id===`gmappt_${fileId}`||a?.source?.fileId===fileId||a?.gemini?.fileId===fileId)||null}
function generatedRecordFor(fileId){return arr(data.records).find(r=>r?.id===`gmrec_${fileId}`||r?.source?.fileId===fileId)||null}
function isAutoAppointment(a,fileId){return Boolean(a&&(a.id===`gmappt_${fileId}`||a?.source?.type==='google-meet-gemini'))}
function isAutoRecord(r,fileId){return Boolean(r&&(r.id===`gmrec_${fileId}`||r?.source?.type==='google-meet-gemini'))}

async function runCorrection(){
  if(running||localStorage.getItem(DONE_KEY)==='1'||syncState!=='synced'||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return;
  running=true;
  try{
    const auth=await loadToken();if(!auth)return;
    const files=await listDocs(auth.token);
    const fetched=await mapLimit(files,CONCURRENCY,async file=>({file,meeting:meetingInfo(file),raw:await exportDoc(file.id,auth.token)}));
    const catalog=await loadCatalog(),learned=learnAliases(fetched.map(x=>x.raw),catalog.aliases||{});
    catalog.aliases=learned;catalog.aliasesBootstrappedAt=nowISO();catalog.filesSeen=files.length;
    const appointmentWrites=new Map(),recordWrites=new Map(),appointmentDeletes=new Set(),recordDeletes=new Set();
    for(const d of fetched){
      const match=d.meeting?identifyPatient(d.raw,learned):{patient:null,reason:'Data/hora não identificada no título.'};
      const existingA=generatedAppointmentFor(d.file.id),existingR=generatedRecordFor(d.file.id);
      if(match.patient&&d.meeting){
        const base={fileId:d.file.id,name:d.file.name,url:d.file.webViewLink||`https://docs.google.com/document/d/${d.file.id}`,modifiedTime:d.file.modifiedTime||'',patientId:match.patient.id,meetingDate:d.meeting.date,meetingTime:d.meeting.time,rawTime:d.meeting.rawTime||d.meeting.time,status:'review',reason:match.evidence,version:'2.4.1'};
        upsertItem(catalog,base);
        if(existingA){const corrected={...existingA,patientId:match.patient.id,date:d.meeting.date,time:d.meeting.time,status:'Realizada',attendanceStatus:'Presente',updatedAt:nowISO()};if(existingA?.gemini?.fileId===d.file.id)corrected.gemini={...existingA.gemini,meetingDate:d.meeting.date,meetingTime:d.meeting.time,rawTime:d.meeting.rawTime||d.meeting.time,sourceModifiedAt:d.file.modifiedTime||existingA.gemini.sourceModifiedAt||''};appointmentWrites.set(corrected.id,corrected)}
        if(existingR){recordWrites.set(existingR.id,{...existingR,patientId:match.patient.id,appointmentId:existingA?.id||existingR.appointmentId,date:d.meeting.date,updatedAt:nowISO(),source:{...(existingR.source||{}),sourceModifiedAt:d.file.modifiedTime||existingR?.source?.sourceModifiedAt||'',version:'2.4.1'}})}
      }else{
        upsertItem(catalog,{fileId:d.file.id,name:d.file.name,url:d.file.webViewLink||'',modifiedTime:d.file.modifiedTime||'',meetingDate:d.meeting?.date||'',meetingTime:d.meeting?.time||'',rawTime:d.meeting?.rawTime||'',patientId:null,status:'review',reason:match.reason||'Documento não associado a paciente ativo.',version:'2.4.1'});
        if(isAutoAppointment(existingA,d.file.id))appointmentDeletes.add(existingA.id);
        if(isAutoRecord(existingR,d.file.id))recordDeletes.add(existingR.id);
      }
    }
    const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;
    try{
      for(const id of recordDeletes)await deleteRecord('records',id);
      for(const id of appointmentDeletes)await deleteRecord('appointments',id);
      if(appointmentWrites.size)await bulkPutEncrypted('appointments',[...appointmentWrites.values()],runtime.key);
      if(recordWrites.size)await bulkPutEncrypted('records',[...recordWrites.values()],runtime.key);
    }finally{globalThis.__rmSyncApplying=previous}
    if(recordDeletes.size)data.records=data.records.filter(r=>!recordDeletes.has(r.id));
    if(appointmentDeletes.size)data.appointments=data.appointments.filter(a=>!appointmentDeletes.has(a.id));
    for(const value of appointmentWrites.values()){const i=data.appointments.findIndex(a=>a.id===value.id);if(i>=0)data.appointments[i]=value;else data.appointments.push(value)}
    for(const value of recordWrites.values()){const i=data.records.findIndex(r=>r.id===value.id);if(i>=0)data.records[i]=value;else data.records.push(value)}
    catalog.lastScanAt=nowISO();catalog.lastError='';await saveCatalog(catalog);localStorage.setItem(DONE_KEY,'1');
    const changed=appointmentDeletes.size+recordDeletes.size+appointmentWrites.size+recordWrites.size;
    if(changed)document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',kind:'gemini-reclassify-v241',at:nowISO(),changed}}));
    toast('Classificação histórica do Gemini atualizada. Reabrindo a plataforma para concluir a conciliação.','success');
    setTimeout(()=>location.reload(),900);
  }catch(err){console.error('Falha na reclassificação Gemini v2.4.1',err);toast(err?.message||'Não foi possível reclassificar as Anotações do Gemini.','error')}
  finally{running=false}
}

document.addEventListener('rm:sync-status',e=>{syncState=e.detail?.status||syncState;if(syncState==='synced')setTimeout(()=>void runCorrection(),1200)});
document.addEventListener('rm:data-ready',()=>setTimeout(()=>void runCorrection(),1500));
