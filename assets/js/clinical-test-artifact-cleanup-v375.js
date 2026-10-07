import {data,runtime,todayISO,nowISO} from './state.js';
import {deleteRecord,getDecryptedById} from './database.js';
import {toast} from './ui.js';
import {appointmentIsPerformed} from './payment-status-v322.mjs';
import {isPlaceholderRecord,isSubstantiveRecord,recordMatchesAppointment,isPlatformSession,isExplicitTestArtifact} from './clinical-documentation-policy-v374.mjs';

const VERSION='3.7.6';
const FLAG='rm.clinical.test-artifact-cleanup.v376';
const LINK_STORES=['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false;

function isSyntheticPatient(patient){return Boolean(patient?.id&&isExplicitTestArtifact(patient))}
function recordsForAppointment(appointment){return arr(data.records).filter(record=>recordMatchesAppointment(record,appointment))}
function hasSubstantiveRecord(appointment){return recordsForAppointment(appointment).some(isSubstantiveRecord)}
function isShortNoContentPlatformSession(appointment){
  if(!appointment||!isPlatformSession(appointment)||!isExplicitTestArtifact(appointment)||hasSubstantiveRecord(appointment))return false;
  if(appointment?.clinicalSessionState!=='Encerrada')return false;
  const minutes=Number(appointment?.actualDurationMinutes);
  return Number.isFinite(minutes)&&minutes>=0&&minutes<=3;
}
function isInvalidFuturePlatformSession(appointment){
  if(!appointment||!isPlatformSession(appointment)||!isExplicitTestArtifact(appointment)||hasSubstantiveRecord(appointment))return false;
  if(!appointment?.date||appointment.date<=todayISO())return false;
  return appointmentIsPerformed(appointment)||appointment?.clinicalSessionState==='Em atendimento';
}
function matchingAppointment(record){
  return arr(data.appointments).find(appointment=>recordMatchesAppointment(record,appointment))||null;
}
function stalePlaceholder(record){
  if(!isPlaceholderRecord(record))return false;
  const appointment=matchingAppointment(record);
  if(!isExplicitTestArtifact(record)&&!isExplicitTestArtifact(appointment))return false;
  if(!appointment)return true;
  if(!appointmentIsPerformed(appointment))return true;
  return isShortNoContentPlatformSession(appointment)||isInvalidFuturePlatformSession(appointment);
}
function scanCandidates(){
  const syntheticPatients=arr(data.patients).filter(isSyntheticPatient);
  const testSessions=arr(data.appointments).filter(appointment=>isShortNoContentPlatformSession(appointment)||isInvalidFuturePlatformSession(appointment));
  const placeholders=arr(data.records).filter(stalePlaceholder);
  return{
    version:VERSION,
    syntheticPatients:syntheticPatients.length,
    testSessions:testSessions.length,
    placeholders:placeholders.length,
    total:syntheticPatients.length+testSessions.length+placeholders.length,
    requiresConfirmation:true,
    at:nowISO()
  };
}
async function erase(storeName,row){
  if(!row?.id)return false;
  await deleteRecord(storeName,row.id);
  const readback=await getDecryptedById(storeName,row.id,runtime.key);
  if(readback)throw new Error(`Falha ao excluir artefato sintético confirmado: ${storeName}:${row.id}`);
  data[storeName]=arr(data[storeName]).filter(item=>item?.id!==row.id);
  return true;
}
async function purgeSyntheticPatients(){
  const targets=arr(data.patients).filter(isSyntheticPatient);let count=0;
  for(const patient of targets){
    for(const storeName of LINK_STORES){
      const linked=arr(data[storeName]).filter(row=>row?.patientId===patient.id);
      for(const row of linked)await erase(storeName,row);
    }
    await erase('patients',patient);
    if(runtime.selectedPatientId===patient.id)runtime.selectedPatientId='';
    count++;
  }
  return count;
}
async function purgeInvalidTestSessions(){
  const targets=arr(data.appointments).filter(appointment=>isShortNoContentPlatformSession(appointment)||isInvalidFuturePlatformSession(appointment));let count=0;
  for(const appointment of targets){
    if(hasSubstantiveRecord(appointment))continue;
    const linked=recordsForAppointment(appointment).filter(record=>!isSubstantiveRecord(record));
    for(const record of linked)await erase('records',record);
    await erase('appointments',appointment);
    count++;
  }
  return count;
}
async function purgeStalePlaceholders(){
  const targets=arr(data.records).filter(stalePlaceholder);let count=0;
  for(const record of targets)if(await erase('records',record))count++;
  return count;
}
async function runCleanup({notify=true,confirmed=false}={}){
  if(runtime.locked||!runtime.key||!runtime.dataReady)return null;
  const preview=scanCandidates();
  if(!confirmed){
    globalThis.__rmClinicalTestArtifactCleanupStatus=preview;
    return preview;
  }
  if(running)return null;
  running=true;
  try{
    const syntheticPatients=await purgeSyntheticPatients();
    const testSessions=await purgeInvalidTestSessions();
    const placeholders=await purgeStalePlaceholders();
    const changed=syntheticPatients+testSessions+placeholders;
    const status={version:VERSION,syntheticPatients,testSessions,placeholders,changed,requiresConfirmation:false,confirmed:true,at:nowISO()};
    localStorage.setItem(FLAG,JSON.stringify(status));
    globalThis.__rmClinicalTestArtifactCleanupStatus=status;
    if(changed){
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'clinical-test-artifact-cleanup-v376',count:changed,at:nowISO(),explicitSyntheticOnly:true}}));
      window.__rmRender?.();
      if(notify)toast(`Saneamento confirmado: ${changed} artefato(s) explicitamente sintético(s) removido(s).`,'success');
    }
    return status;
  }finally{running=false}
}

globalThis.__rmClinicalTestArtifactCleanup={version:VERSION,scan:scanCandidates,run:runCleanup,status:()=>globalThis.__rmClinicalTestArtifactCleanupStatus||scanCandidates()};
