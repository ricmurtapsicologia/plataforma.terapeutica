import {data,runtime,nowISO} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';

const VERSION='3.5.3';
const PATCH_PREFIX='RM Clinical Reconciliation Patch';
const APPLIED_KEY='rm.private.records.patch.applied.v353';
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false;

function norm(value=''){return normalizeIdentity(String(value||''))}
function safeId(value=''){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,180)}
function namesOf(patient){return new Set([norm(patient?.name),norm(patient?.preferredName)].filter(Boolean))}
function candidates(names=[]){const wanted=new Set(arr(names).map(norm).filter(Boolean));return arr(data.patients).filter(patient=>{const own=namesOf(patient);return [...wanted].some(name=>own.has(name))})}
function choosePatient(names=[]){return candidates(names).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')))[0]||null}
function sessionKey(appointment){return appointment?.clinicalSessionId||appointment?.id||''}
function selectAppointment(patientId,spec={}){
  const all=arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===spec.date&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou');
  if(spec.time){const exact=all.filter(a=>String(a.time||'').slice(0,5)===String(spec.time||'').slice(0,5));if(exact.length===1)return exact[0];if(exact.length>1)return exact.sort((a,b)=>String(a.id||'').localeCompare(String(b.id||'')))[0]}
  if(all.length===1)return all[0];
  const done=all.filter(a=>a.status==='Realizada'||['Presente','Compareceu'].includes(a.attendanceStatus));
  if(done.length===1)return done[0];
  return null;
}
function linkedTo(record,appointment){const key=sessionKey(appointment);return Boolean(record&&(record.appointmentId===appointment?.id||record.clinicalSessionId===key))}
function existingFor(patientId,spec,appointment){
  const exact=arr(data.records).filter(r=>r?.patientId===patientId&&r?.date===spec.date&&(!spec.time||!r.time||String(r.time).slice(0,5)===String(spec.time).slice(0,5))&&linkedTo(r,appointment)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0];
  if(exact)return exact;
  return arr(data.records).filter(r=>r?.patientId===patientId&&r?.status!=='Finalizado'&&r?.date===spec.date&&(!spec.time||!r.time||String(r.time).slice(0,5)===String(spec.time).slice(0,5))&&!r.appointmentId&&!r.clinicalSessionId).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null;
}
function stableRecordId(patient,appointment,spec){return `record_private_${safeId(patient.id)}_${safeId(sessionKey(appointment)||`${spec.date}_${spec.time||''}`)}`}
async function gfetch(url,token){const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!response.ok)throw new Error(`Google Drive respondeu ${response.status}.`);return response}
async function latestPatch(token){const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and name contains '${PATCH_PREFIX}'`);url.searchParams.set('orderBy','modifiedTime desc');url.searchParams.set('pageSize','10');url.searchParams.set('fields','files(id,name,modifiedTime)');const json=await(await gfetch(url,token)).json();return arr(json.files)[0]||null}
async function readPatch(file,token){const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`;const text=await(await gfetch(url,token)).text(),start=text.indexOf('{'),end=text.lastIndexOf('}');if(start<0||end<=start)throw new Error('Patch clínico privado sem JSON válido.');const patch=JSON.parse(text.slice(start,end+1));if(patch?.schema!=='rm-clinical-reconciliation-patch-v1')throw new Error('Patch clínico privado incompatível.');return patch}

async function applyPatch(patch,file){
  const writes=new Map();let imported=0,repairs=0,skippedFinal=0,missingPatient=0,missingSession=0;
  for(const patientSpec of arr(patch?.patients)){
    if(!arr(patientSpec?.records).length)continue;
    const patient=choosePatient(patientSpec.names);
    if(!patient){missingPatient+=arr(patientSpec.records).length;continue}
    for(const spec of arr(patientSpec.records)){
      if(!spec?.date||!String(spec?.text||'').trim())continue;
      const appointment=selectAppointment(patient.id,spec);
      if(!appointment){missingSession++;continue}
      const key=sessionKey(appointment),at=nowISO();
      for(const stale of arr(data.records).filter(r=>r?.patientId===patient.id&&linkedTo(r,appointment)&&r?.date&&r.date!==spec.date)){
        const repaired={...stale,appointmentId:'',clinicalSessionId:'',updatedAt:at,source:{...(stale.source||{}),linkRepair:{kind:'private-record-import-v353',detachedFrom:appointment.id,at}}};
        writes.set(repaired.id,repaired);repairs++;
      }
      const existing=existingFor(patient.id,spec,appointment);
      if(existing?.status==='Finalizado'){skippedFinal++;continue}
      const status=String(spec.status||'Finalizado')==='Rascunho'?'Rascunho':'Finalizado';
      const row={
        ...(existing||{}),
        id:existing?.id||stableRecordId(patient,appointment,spec),
        patientId:patient.id,
        appointmentId:appointment.id,
        clinicalSessionId:key,
        date:spec.date,
        time:String(spec.time||appointment.time||'').slice(0,5),
        title:String(spec.title||'Evolução de sessão'),
        text:String(spec.text||'').trim(),
        followup:String(spec.followup||'').trim(),
        status,
        requiresReview:status!=='Finalizado',
        createdAt:existing?.createdAt||spec.createdAt||at,
        updatedAt:at,
        source:{...(existing?.source||{}),kind:'private-drive-record-import-v353',patchFileId:file.id,importedAt:at}
      };
      writes.set(row.id,row);imported++;
    }
  }
  if(writes.size){
    await bulkPutEncryptedAtomic([{storeName:'records',values:[...writes.values()]}],runtime.key,{verify:true});
    for(const row of writes.values()){const i=arr(data.records).findIndex(r=>r?.id===row.id);if(i>=0)data.records[i]=row;else data.records.push(row)}
    document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'private-record-import-v353',records:imported,linkRepairs:repairs,at:nowISO()}}));
    window.__rmRender?.();
  }
  return{imported,repairs,skippedFinal,missingPatient,missingSession};
}

async function run(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;
  running=true;
  try{
    const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);if(!auth?.ok)return null;
    const file=await latestPatch(auth.token);if(!file)return null;
    const marker=`${file.id}:${file.modifiedTime||''}`;
    if(localStorage.getItem(APPLIED_KEY)===marker)return{alreadyApplied:true};
    const patch=await readPatch(file,auth.token),result=await applyPatch(patch,file);
    localStorage.setItem(APPLIED_KEY,marker);
    globalThis.__rmPrivateRecordImportStatus={version:VERSION,fileId:file.id,fileName:file.name,...result,at:nowISO()};
    return globalThis.__rmPrivateRecordImportStatus;
  }catch(error){
    console.warn('Importação privada de prontuário:',error);
    globalThis.__rmPrivateRecordImportStatus={version:VERSION,error:String(error?.message||error),at:nowISO()};
    return null;
  }finally{running=false}
}

document.addEventListener('rm:data-ready',()=>setTimeout(()=>void run(),900));
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void run(),600));
globalThis.__rmPrivateRecordImport={version:VERSION,run,status:()=>globalThis.__rmPrivateRecordImportStatus||null};
