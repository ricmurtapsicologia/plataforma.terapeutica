import {data,runtime,nowISO,uid} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';

const VERSION='3.6.1';
const PATCH_PREFIX='RM Clinical Reconciliation Patch';
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false;

function norm(value=''){return normalizeIdentity(String(value||''))}
function namesOf(patient){return new Set([norm(patient?.name),norm(patient?.preferredName)].filter(Boolean))}
function candidates(names=[]){
  const wanted=new Set(arr(names).map(norm).filter(Boolean));
  return arr(data.patients).filter(patient=>{
    const own=namesOf(patient);
    return [...wanted].some(name=>own.has(name));
  });
}
function hasSession(patientId,date){return arr(data.appointments).some(a=>a?.patientId===patientId&&a?.date===date&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou')}
function statusFor(spec,patch){
  const wanted=new Set(arr(spec?.names).map(norm).filter(Boolean));
  return arr(patch?.statusUpdates).find(update=>arr(update?.names).map(norm).some(name=>wanted.has(name)))||null;
}
function buildPatient(spec,patch){
  const profile=spec?.profile&&typeof spec.profile==='object'?{...spec.profile}:{};
  const name=String(profile.name||arr(spec?.names)[0]||'').trim();
  if(!name)return null;
  const at=nowISO(),statusUpdate=statusFor(spec,patch);
  const patient={
    id:uid('pat'),
    name,
    preferredName:String(profile.preferredName||name.split(/\s+/)[0]||name).trim(),
    status:String(statusUpdate?.status||profile.status||'Ativo'),
    modality:String(profile.modality||'Online'),
    frequency:String(profile.frequency||''),
    createdAt:profile.createdAt||at,
    updatedAt:at,
    ...profile,
    name
  };
  if(['Inativo','Encerrado','Arquivado'].includes(patient.status)){
    patient.inactiveAt=statusUpdate?.effectiveDate||patient.inactiveAt||at.slice(0,10);
    patient.careEndedAt=patient.careEndedAt||patient.inactiveAt;
  }
  return patient;
}
function buildAppointment(patient,spec){
  const at=nowISO(),performed=spec?.performed!==false;
  return {
    id:uid('appt'),
    patientId:patient.id,
    date:String(spec?.date||''),
    time:String(spec?.time||''),
    duration:Number(spec?.duration||50),
    status:performed?'Realizada':'Agendada',
    attendanceStatus:performed?'Presente':'',
    modality:String(spec?.modality||patient?.modality||'Online'),
    note:String(spec?.note||'Sessão histórica conciliada a partir de documentação privada.'),
    geminiExpected:spec?.recordExpected===true,
    geminiExpectedAt:spec?.recordExpected===true?at:undefined,
    paymentReconciled:spec?.paid===true,
    paymentReconciledAt:spec?.paid===true?at:undefined,
    paymentReconciliationSource:spec?.paid===true?'private-drive-audit-v361':undefined,
    source:{type:'private-drive-audit-v361'},
    createdAt:spec?.createdAt||at,
    updatedAt:at
  };
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
async function run(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;
  running=true;
  try{
    const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);
    if(!auth?.ok)return null;
    const file=await latestPatch(auth.token);if(!file)return null;
    const patch=await readPatch(file,auth.token);if(!patch)return null;
    const newPatients=[],newAppointments=[];
    for(const spec of arr(patch.patients)){
      let patient=candidates(spec?.names)[0]||null;
      if(!patient&&spec?.createIfMissing===true){
        patient=buildPatient(spec,patch);
        if(patient){newPatients.push(patient);data.patients.push(patient)}
      }
      if(!patient)continue;
      for(const session of arr(spec?.sessions)){
        if(session?.createIfMissing!==true||!session?.date||hasSession(patient.id,session.date))continue;
        const appointment=buildAppointment(patient,session);
        newAppointments.push(appointment);data.appointments.push(appointment);
      }
    }
    const batches=[];
    if(newPatients.length)batches.push({storeName:'patients',values:newPatients});
    if(newAppointments.length)batches.push({storeName:'appointments',values:newAppointments});
    if(batches.length){
      await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'private-create-missing-v361',patients:newPatients.length,appointments:newAppointments.length,at:nowISO()}}));
      window.__rmRender?.();
    }
    globalThis.__rmPrivateCreateMissingStatus={version:VERSION,fileId:file.id,patients:newPatients.length,appointments:newAppointments.length,at:nowISO()};
    return globalThis.__rmPrivateCreateMissingStatus;
  }catch(error){
    console.warn('Criação clínica privada:',error);
    globalThis.__rmPrivateCreateMissingStatus={version:VERSION,error:String(error?.message||error),at:nowISO()};
    return null;
  }finally{running=false}
}

document.addEventListener('rm:data-ready',()=>setTimeout(()=>void run(),350));
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void run(),250));
globalThis.__rmPrivateCreateMissing={version:VERSION,run,status:()=>globalThis.__rmPrivateCreateMissingStatus||null};
