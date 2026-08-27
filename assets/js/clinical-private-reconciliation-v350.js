import {data,runtime,nowISO} from './state.js';
import {decryptJson,encryptJson} from './crypto.js';
import {bulkPutEncryptedAtomic,deleteRecord} from './database.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';

const VERSION='3.5.0';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const PATCH_PREFIX='RM Clinical Reconciliation Patch';
const APPLIED_KEY='rm.private.clinical.patch.applied.v1';
const LINK_STORES=['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false;

function norm(v=''){return normalizeIdentity(String(v||''));}
function minuteOf(v=''){const m=String(v||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null}
function linkedCount(id){return LINK_STORES.reduce((n,s)=>n+arr(data[s]).filter(x=>x?.patientId===id).length,0)}
function identity(p){return{cpf:String(p?.cpf||'').replace(/\D/g,''),email:String(p?.email||'').trim().toLowerCase(),phone:String(p?.phone||'').replace(/\D/g,'')}}
function conflict(a,b){const x=identity(a),y=identity(b);return Boolean((x.cpf&&y.cpf&&x.cpf!==y.cpf)||(x.email&&y.email&&x.email!==y.email)||(x.phone.length>=10&&y.phone.length>=10&&x.phone!==y.phone))}
function namesOf(p){return new Set([norm(p?.name),norm(p?.preferredName)].filter(Boolean))}
function candidates(names=[]){const wanted=new Set(arr(names).map(norm).filter(Boolean));return arr(data.patients).filter(p=>{const own=namesOf(p);return[...wanted].some(n=>own.has(n))})}
function choosePrimary(list=[]){return [...list].sort((a,b)=>linkedCount(b.id)-linkedCount(a.id)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')))[0]||null}
function performed(a){return Boolean(a&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou'&&(a.status==='Realizada'||['Presente','Compareceu'].includes(a.attendanceStatus)))}
function recordSameDay(patientId,date){return arr(data.records).find(r=>r?.patientId===patientId&&r?.date===date)||null}
function placeholderRecord(r){return r?.source?.type==='missing-record-placeholder'||String(r?.text||'').trim()==='Não há prontuário.'}
function selectAppointment(patientId,date){const all=arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===date&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou');if(all.length===1)return all[0];const done=all.filter(performed);if(done.length===1)return done[0];return [...all].sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')))[0]||null}

async function loadToken(){if(!runtime.key)return null;let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}if(!raw)return null;try{const t=await decryptJson(runtime.key,raw,'google-calendar-token');const scopes=String(t?.scope||'').split(/\s+/);if(t?.token&&Number(t.expiresAt)>Date.now()+60000&&scopes.includes(DRIVE_SCOPE))return t.token}catch{}return null}
async function gfetch(url,token){const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);return r}
async function latestPatch(token){const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and name contains '${PATCH_PREFIX}'`);url.searchParams.set('orderBy','modifiedTime desc');url.searchParams.set('pageSize','10');url.searchParams.set('fields','files(id,name,modifiedTime,webViewLink)');const json=await (await gfetch(url,token)).json();return arr(json.files)[0]||null}
async function readPatch(file,token){const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`;const text=await (await gfetch(url,token)).text();const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<=start)throw new Error('Patch clínico privado sem JSON válido.');const patch=JSON.parse(text.slice(start,end+1));if(patch?.schema!=='rm-clinical-reconciliation-patch-v1')throw new Error('Patch clínico privado incompatível.');return patch}

async function mergeExplicitDuplicates(patientSpec){const list=candidates(patientSpec?.names);if(!patientSpec?.mergeDuplicates||list.length<2)return choosePrimary(list);const primary=choosePrimary(list);if(!primary)return null;for(const secondary of list.filter(p=>p.id!==primary.id)){if(conflict(primary,secondary))continue;const batches=[];for(const store of LINK_STORES){const changed=[];for(const row of arr(data[store]))if(row?.patientId===secondary.id){row.patientId=primary.id;row.updatedAt=nowISO();changed.push({...row})}if(changed.length)batches.push({storeName:store,values:changed})}for(const [k,v] of Object.entries(secondary)){if(['id','createdAt','updatedAt'].includes(k))continue;if((primary[k]===undefined||primary[k]===null||primary[k]===''||(Array.isArray(primary[k])&&!primary[k].length))&&v!==undefined&&v!==null&&v!=='')primary[k]=v}primary.updatedAt=nowISO();batches.push({storeName:'patients',values:[{...primary}]});await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});await deleteRecord('patients',secondary.id);data.patients=arr(data.patients).filter(p=>p?.id!==secondary.id);if(runtime.selectedPatientId===secondary.id)runtime.selectedPatientId=primary.id}return primary}

async function loadCatalog(){let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}if(!raw)return null;try{return await decryptJson(runtime.key,raw,CATALOG_AAD)}catch{return null}}
async function saveCatalog(catalog){const enc=await encryptJson(runtime.key,catalog,CATALOG_AAD);localStorage.setItem(CATALOG_STORAGE,JSON.stringify(enc))}
function catalogItems(catalog){if(Array.isArray(catalog?.items))return catalog.items;if(catalog?.items&&typeof catalog.items==='object')return Object.values(catalog.items);return[]}
function scoreItemToAppointment(item,a){const t=minuteOf(item?.rawTime||item?.meetingTime),s=minuteOf(a?.time);if(t===null||s===null)return Infinity;const d=Math.max(30,Math.min(Number(a.duration)||50,120));return Math.min(Math.abs(t-s),Math.abs(t-(s+d)))}

async function applyPatch(patch){const appointmentWrites=new Map(),patientWrites=new Map(),recordWrites=new Map(),patientSpecs=[];let removedPlaceholders=0,paid=0,status=0,merged=0;
  for(const spec of arr(patch?.patients)){
    const before=candidates(spec.names);const patient=await mergeExplicitDuplicates(spec);if(before.length>1&&patient&&candidates(spec.names).length<before.length)merged+=before.length-candidates(spec.names).length;if(!patient)continue;patientSpecs.push({spec,patient});
    for(const s of arr(spec.sessions)){
      const a=selectAppointment(patient.id,s.date);if(!a)continue;let next={...a};
      if(next.status!=='Realizada'||!['Presente','Compareceu'].includes(next.attendanceStatus)){next.status='Realizada';next.attendanceStatus='Presente'}
      if(s.paid===true){next.paymentReconciled=true;next.paymentReconciledAt=nowISO();next.paymentReconciliationSource='private-drive-audit-v350';paid++}
      if(s.recordExpected===true){next.geminiExpected=true;next.geminiExpectedAt=nowISO();const r=recordSameDay(patient.id,s.date);if(r&&placeholderRecord(r)){await deleteRecord('records',r.id);data.records=arr(data.records).filter(x=>x?.id!==r.id);removedPlaceholders++}}
      next.updatedAt=nowISO();appointmentWrites.set(next.id,next);
    }
  }
  for(const update of arr(patch?.statusUpdates)){
    const patient=choosePrimary(candidates(update.names));if(!patient||!update.status)continue;patient.status=String(update.status);patient.updatedAt=nowISO();patientWrites.set(patient.id,{...patient});status++
  }
  const batches=[];if(appointmentWrites.size)batches.push({storeName:'appointments',values:[...appointmentWrites.values()]});if(patientWrites.size)batches.push({storeName:'patients',values:[...patientWrites.values()]});if(recordWrites.size)batches.push({storeName:'records',values:[...recordWrites.values()]});if(batches.length)await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});
  if(appointmentWrites.size){for(const next of appointmentWrites.values()){const i=arr(data.appointments).findIndex(x=>x?.id===next.id);if(i>=0)data.appointments[i]=next}}
  if(patientWrites.size){for(const next of patientWrites.values()){const i=arr(data.patients).findIndex(x=>x?.id===next.id);if(i>=0)data.patients[i]=next}}

  const catalog=await loadCatalog();let hints=0;if(catalog){catalog.manualLinks={...(catalog.manualLinks||{})};const items=catalogItems(catalog);for(const item of items.filter(x=>x?.status==='review'&&x?.fileId&&x?.meetingDate)){
      const possibilities=[];for(const {spec,patient} of patientSpecs){if(!arr(spec.sessions).some(s=>s.date===item.meetingDate&&s.recordExpected===true))continue;const a=selectAppointment(patient.id,item.meetingDate);if(!a)continue;possibilities.push({patient,a,score:scoreItemToAppointment(item,a)})}
      possibilities.sort((x,y)=>x.score-y.score);const best=possibilities[0],second=possibilities[1];if(!best||best.score>30||(second&&second.score-best.score<12))continue;catalog.manualLinks[item.fileId]=best.patient.id;item.reason=`Associação privada de alta confiança: sessão ${best.a.time||'—'}, diferença ${best.score} min.`;hints++
    }if(hints){catalog.updatedAt=nowISO();await saveCatalog(catalog)}}
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'private-clinical-reconciliation-v350',paid,status,merged,hints,removedPlaceholders,at:nowISO()}}));window.__rmRender?.();return{paid,status,merged,hints,removedPlaceholders}
}

async function run(){if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;running=true;try{const token=await loadToken();if(!token)return null;const file=await latestPatch(token);if(!file)return null;const marker=`${file.id}:${file.modifiedTime||''}`;if(localStorage.getItem(APPLIED_KEY)===marker)return{alreadyApplied:true};const patch=await readPatch(file,token);const result=await applyPatch(patch);localStorage.setItem(APPLIED_KEY,marker);globalThis.__rmPrivateClinicalReconciliationStatus={version:VERSION,fileId:file.id,fileName:file.name,...result,at:nowISO()};setTimeout(()=>location.reload(),900);return globalThis.__rmPrivateClinicalReconciliationStatus}catch(error){console.warn('Conciliação clínica privada:',error);globalThis.__rmPrivateClinicalReconciliationStatus={version:VERSION,error:String(error?.message||error),at:nowISO()};return null}finally{running=false}}

document.addEventListener('rm:data-ready',()=>setTimeout(()=>void run(),700));
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void run(),500));
globalThis.__rmPrivateClinicalReconciliation={version:VERSION,run,status:()=>globalThis.__rmPrivateClinicalReconciliationStatus||null};
