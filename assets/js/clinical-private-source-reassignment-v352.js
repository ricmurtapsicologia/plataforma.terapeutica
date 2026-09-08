import {data,runtime,nowISO} from './state.js';
import {bulkPutEncryptedAtomic,deleteRecord} from './database.js';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';

const VERSION='3.6.2';
const PATCH_PREFIX='RM Clinical Reconciliation Patch';
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false;
let retryCount=0;

function norm(value=''){return normalizeIdentity(String(value||''))}
function namesOf(patient){return new Set([norm(patient?.name),norm(patient?.preferredName)].filter(Boolean))}
function candidate(names=[]){
  const wanted=new Set(arr(names).map(norm).filter(Boolean));
  return arr(data.patients).find(patient=>{
    const own=namesOf(patient);
    return [...wanted].some(name=>own.has(name));
  })||null;
}
function sourceFileId(row){return String(row?.source?.fileId||row?.gemini?.fileId||'')}
function sourceMatch(row,fileId,kind){
  if(!row||!fileId)return false;
  if(sourceFileId(row)===fileId)return true;
  const deterministic=kind==='appointment'?`gmappt_${fileId}`:`gmrec_${fileId}`;
  return row?.id===deterministic;
}
async function gfetch(url,token){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok)throw new Error(`Google Drive respondeu ${response.status}.`);
  return response;
}
async function latestPatch(token){
  const url=new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and name contains '${PATCH_PREFIX}'`);
  url.searchParams.set('orderBy','modifiedTime desc');
  url.searchParams.set('pageSize','10');
  url.searchParams.set('fields','files(id,name,modifiedTime)');
  const json=await(await gfetch(url,token)).json();
  return arr(json.files)[0]||null;
}
async function readPatch(file,token){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const text=await(await gfetch(url,token)).text(),start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start<0||end<=start)return null;
  const patch=JSON.parse(text.slice(start,end+1));
  return patch?.schema==='rm-clinical-reconciliation-patch-v1'?patch:null;
}
function withCanonicalMetadata(row,spec,target){
  const next={...row,patientId:target.id,updatedAt:nowISO(),privateReconciledAt:nowISO(),privateReconciliationSource:'private-source-reassignment-v362'};
  if(spec?.date)next.date=String(spec.date);
  if(spec?.time)next.time=String(spec.time);
  if(spec?.encounterType)next.encounterType=String(spec.encounterType);
  if(spec?.interlocutor)next.interlocutor=String(spec.interlocutor);
  if(spec?.fileId){
    next.source={...(next.source||{}),fileId:spec.fileId};
    if(next.gemini&&typeof next.gemini==='object')next.gemini={...next.gemini,fileId:spec.fileId};
  }
  return next;
}
function safeGeneratedDuplicate(a,target,spec,sourceRow){
  if(!a||!target||!spec?.date||a.id===sourceRow?.id)return false;
  if(a.patientId!==target.id||a.date!==spec.date)return false;
  if(spec.time&&a.time&&a.time!==spec.time)return false;
  if(sourceFileId(a))return false;
  return a?.source?.type==='private-drive-audit-v361'||String(a?.note||'').includes('Sessão histórica conciliada a partir de documentação privada');
}
async function run(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;
  running=true;
  try{
    const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);
    if(!auth?.ok)return null;
    const file=await latestPatch(auth.token);if(!file)return null;
    const patch=await readPatch(file,auth.token);if(!patch)return null;
    const specs=arr(patch.sourceReassignments);
    if(!specs.length)return null;
    const appointmentWrites=new Map(),recordWrites=new Map(),deleteAppointmentIds=new Set();
    let movedAppointments=0,movedRecords=0,normalized=0,missingTargets=0;
    for(const spec of specs){
      const target=candidate(spec?.targetNames||spec?.names);
      if(!target){missingTargets++;continue}
      const appointments=arr(data.appointments).filter(row=>sourceMatch(row,spec.fileId,'appointment'));
      const records=arr(data.records).filter(row=>sourceMatch(row,spec.fileId,'record'));
      for(const row of appointments){
        const changed=row.patientId!==target.id||Boolean(spec.date&&row.date!==spec.date)||Boolean(spec.time&&row.time!==spec.time)||Boolean(spec.encounterType&&row.encounterType!==spec.encounterType)||Boolean(spec.interlocutor&&row.interlocutor!==spec.interlocutor);
        const next=withCanonicalMetadata(row,spec,target);
        appointmentWrites.set(next.id,next);
        if(row.patientId!==target.id)movedAppointments++;
        else if(changed)normalized++;
        for(const other of arr(data.appointments))if(safeGeneratedDuplicate(other,target,spec,row))deleteAppointmentIds.add(other.id);
      }
      for(const row of records){
        const changed=row.patientId!==target.id||Boolean(spec.date&&row.date!==spec.date)||Boolean(spec.time&&row.time!==spec.time)||Boolean(spec.encounterType&&row.encounterType!==spec.encounterType)||Boolean(spec.interlocutor&&row.interlocutor!==spec.interlocutor);
        const next=withCanonicalMetadata(row,spec,target);
        recordWrites.set(next.id,next);
        if(row.patientId!==target.id)movedRecords++;
        else if(changed)normalized++;
      }
    }
    const batches=[];
    if(appointmentWrites.size)batches.push({storeName:'appointments',values:[...appointmentWrites.values()]});
    if(recordWrites.size)batches.push({storeName:'records',values:[...recordWrites.values()]});
    if(batches.length)await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});
    for(const next of appointmentWrites.values()){
      const i=arr(data.appointments).findIndex(row=>row?.id===next.id);
      if(i>=0)data.appointments[i]=next;
    }
    for(const next of recordWrites.values()){
      const i=arr(data.records).findIndex(row=>row?.id===next.id);
      if(i>=0)data.records[i]=next;
    }
    for(const id of deleteAppointmentIds){
      if(appointmentWrites.has(id))continue;
      await deleteRecord('appointments',id);
      data.appointments=arr(data.appointments).filter(row=>row?.id!==id);
    }
    if(batches.length||deleteAppointmentIds.size){
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'private-source-reassignment-v362',movedAppointments,movedRecords,normalized,deduplicated:deleteAppointmentIds.size,at:nowISO()}}));
      window.__rmRender?.();
    }
    globalThis.__rmPrivateSourceReassignmentStatus={version:VERSION,fileId:file.id,movedAppointments,movedRecords,normalized,deduplicated:deleteAppointmentIds.size,missingTargets,at:nowISO()};
    if(missingTargets&&retryCount<1){retryCount++;setTimeout(()=>void run(),1800)}
    return globalThis.__rmPrivateSourceReassignmentStatus;
  }catch(error){
    console.warn('Reatribuição clínica privada:',error);
    globalThis.__rmPrivateSourceReassignmentStatus={version:VERSION,error:String(error?.message||error),at:nowISO()};
    return null;
  }finally{running=false}
}

document.addEventListener('rm:data-ready',()=>setTimeout(()=>void run(),1000));
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void run(),900));
globalThis.__rmPrivateSourceReassignment={version:VERSION,run,status:()=>globalThis.__rmPrivateSourceReassignmentStatus||null};
