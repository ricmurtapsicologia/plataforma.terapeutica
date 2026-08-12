import {data,runtime,preferences,nowISO} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';

const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const RUN_COOLDOWN_MS=60*1000;
const MAX_SAFE_HISTORY=60;
let running=false,lastRunAt=0,retryTimer=null;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const professionalLabel=()=>normalize(preferences.professionalName);

function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){const n=normalize(m[1]);if(n)found.add(n)}
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){const n=normalize(m[1]);if(n)found.add(n)}
  return[...found].filter(x=>x&&x!==professionalLabel());
}
function meetingMs(date,time){const [h,m]=String(time||'00:00').split(':').map(Number);return new Date(`${date}T${pad(Number.isFinite(h)?h:0)}:${pad(Number.isFinite(m)?m:0)}:00-03:00`).getTime()}
function uniqueScheduledPatient(item){
  if(!item?.meetingDate)return null;
  const rawTime=item.rawTime||item.meetingTime||'00:00',target=meetingMs(item.meetingDate,rawTime);
  const candidates=arr(data.appointments).filter(a=>a?.date===item.meetingDate&&a?.patientId&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou'&&a?.source?.type!=='google-meet-gemini').map(a=>({a,d:Math.abs(meetingMs(a.date,a.time||'00:00')-target)})).filter(x=>x.d<=45*60000).sort((a,b)=>a.d-b.d);
  const ids=[...new Set(candidates.map(x=>x.a.patientId))];
  if(ids.length!==1)return null;
  return arr(data.patients).some(p=>p?.id===ids[0]&&!['Encerrado','Arquivado'].includes(p?.status||''))?ids[0]:null;
}
async function loadToken(){
  if(!runtime.key)return null;let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}if(!raw)return null;
  try{const v=await decryptJson(runtime.key,raw,'google-calendar-token'),scopes=String(v?.scope||'').split(/\s+/);if(v?.token&&Number(v.expiresAt)>Date.now()+60000&&scopes.includes(DRIVE_SCOPE))return v.token}catch{}return null;
}
async function loadCatalog(){
  if(!runtime.key)return null;let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}if(!raw)return null;
  try{const v=await decryptJson(runtime.key,raw,CATALOG_AAD);return v&&Array.isArray(v.items)?v:null}catch{return null}
}
async function saveCatalog(catalog){const encrypted=await encryptJson(runtime.key,{...catalog,aliasContinuityVersion:'2.6.3',aliasContinuityAt:nowISO(),items:arr(catalog.items).slice(-700)},CATALOG_AAD);localStorage.setItem(CATALOG_STORAGE,JSON.stringify(encrypted))}
async function exportDoc(fileId,token){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Drive ${r.status}`);return r.text()}
function triggerReconcile(){
  const b=document.createElement('button');b.type='button';b.hidden=true;b.dataset.action='gemini-reconcile-v240';document.body.appendChild(b);b.click();b.remove();
}
async function run(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine||Date.now()-lastRunAt<RUN_COOLDOWN_MS)return;
  running=true;lastRunAt=Date.now();
  try{
    const [token,catalog]=await Promise.all([loadToken(),loadCatalog()]);if(!token||!catalog)return;
    const items=arr(catalog.items),reviews=items.filter(x=>x?.status==='review'&&x?.fileId&&x?.meetingDate);if(!reviews.length)return;
    const safe=items.filter(x=>x?.patientId&&x?.fileId&&['materialized','covered','ready'].includes(x?.status)).sort((a,b)=>String(b?.meetingDate||'').localeCompare(String(a?.meetingDate||''))).slice(0,MAX_SAFE_HISTORY);
    const aliasPatients=new Map();
    for(const item of safe){
      let raw='';try{raw=await exportDoc(item.fileId,token)}catch{continue}
      for(const label of participantLabels(raw)){if(!aliasPatients.has(label))aliasPatients.set(label,new Set());aliasPatients.get(label).add(item.patientId)}
    }
    const aliases={...(catalog.aliases||{})};let changed=0;
    for(const item of reviews){
      let raw='';try{raw=await exportDoc(item.fileId,token)}catch{continue}
      const labels=participantLabels(raw);let patientId=null,evidence='';
      const historical=[...new Set(labels.flatMap(label=>{const ids=aliasPatients.get(label);return ids&&ids.size===1?[...ids]:[]}))];
      if(historical.length===1){patientId=historical[0];evidence='continuidade de identificador do Meet em sessão clínica previamente vinculada'}
      if(!patientId){patientId=uniqueScheduledPatient(item);if(patientId)evidence='único atendimento clínico agendado no mesmo intervalo'}
      if(!patientId)continue;
      for(const label of labels){const prior=aliases[label];if(!prior||prior===patientId){if(prior!==patientId){aliases[label]=patientId;changed++}}}
      item.reason=evidence||item.reason;
    }
    if(!changed)return;
    catalog.aliases=aliases;await saveCatalog(catalog);
    document.dispatchEvent(new CustomEvent('rm:gemini-alias-continuity',{detail:{updated:changed,at:nowISO()}}));
    setTimeout(triggerReconcile,350);
  }catch(err){console.warn('Gemini alias continuity v2.6.3',err)}finally{running=false}
}
function schedule(delay=700){clearTimeout(retryTimer);retryTimer=setTimeout(()=>void run(),delay)}
document.addEventListener('rm:gemini-status',e=>{if(['connected','error'].includes(e.detail?.status))schedule(900)});
document.addEventListener('rm:sync-status',e=>{if(e.detail?.status==='synced')schedule(1200)});
document.addEventListener('rm:local-data-changed',e=>{if(e.detail?.storeName==='appointments')schedule(1500)});
document.addEventListener('rm:data-ready',()=>schedule(1800));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(500)});
window.addEventListener('online',()=>schedule(500));
