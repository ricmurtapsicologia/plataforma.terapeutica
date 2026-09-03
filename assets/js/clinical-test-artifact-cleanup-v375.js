import {data,runtime,todayISO,nowISO} from './state.js';
import {deleteRecord,getDecryptedById} from './database.js';
import {toast} from './ui.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';
import {appointmentIsPerformed} from './payment-status-v322.mjs';
import {isPlaceholderRecord,isSubstantiveRecord,recordMatchesAppointment,isPlatformSession} from './clinical-documentation-policy-v374.mjs';

const VERSION='3.7.5';
const FLAG='rm.clinical.test-artifact-cleanup.v375';
const LINK_STORES=['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
const KNOWN_SYNTHETIC_NAMES=new Set(['agageg','gegwegwe','hrehhrh','hwwhwh','wafwafwgwg']);
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false;
let scheduled=null;

function compactName(value=''){return normalizeIdentity(String(value||'')).replace(/\s/g,'')}
function rawName(patient){return String(patient?.name||patient?.preferredName||'').trim().toLowerCase()}
function hasIdentity(patient){return Boolean(String(patient?.code||'').trim()||String(patient?.cpf||'').replace(/\D/g,'')||String(patient?.email||'').trim()||String(patient?.phone||'').replace(/\D/g,''))}
function looksSyntheticName(value=''){
  const raw=String(value||'').trim().toLowerCase();
  if(!raw||/\s/.test(raw)||raw.length<5||raw.length>28)return false;
  const token=compactName(raw);if(!token)return false;
  const ratio=new Set(token).size/token.length;
  return KNOWN_SYNTHETIC_NAMES.has(raw)||ratio<=0.48||/(..).*\1/.test(token)||/(.)\1{2,}/.test(token);
}
function isSyntheticPatient(patient){return Boolean(patient?.id&&!hasIdentity(patient)&&looksSyntheticName(rawName(patient)))}
function recordsForAppointment(appointment){return arr(data.records).filter(record=>recordMatchesAppointment(record,appointment))}
function hasSubstantiveRecord(appointment){return recordsForAppointment(appointment).some(isSubstantiveRecord)}
function isShortNoContentPlatformSession(appointment){
  if(!appointment||!isPlatformSession(appointment)||hasSubstantiveRecord(appointment))return false;
  if(appointment?.clinicalSessionState!=='Encerrada')return false;
  const minutes=Number(appointment?.actualDurationMinutes);
  return Number.isFinite(minutes)&&minutes>=0&&minutes<=3;
}
function isInvalidFuturePlatformSession(appointment){
  if(!appointment||!isPlatformSession(appointment)||hasSubstantiveRecord(appointment))return false;
  if(!appointment?.date||appointment.date<=todayISO())return false;
  return appointmentIsPerformed(appointment)||appointment?.clinicalSessionState==='Em atendimento';
}
function matchingAppointment(record){
  return arr(data.appointments).find(appointment=>recordMatchesAppointment(record,appointment))||null;
}
function stalePlaceholder(record){
  if(!isPlaceholderRecord(record))return false;
  const appointment=matchingAppointment(record);
  if(!appointment)return true;
  if(!appointmentIsPerformed(appointment))return true;
  return isShortNoContentPlatformSession(appointment)||isInvalidFuturePlatformSession(appointment);
}

async function erase(storeName,row){
  if(!row?.id)return false;
  await deleteRecord(storeName,row.id);
  const readback=await getDecryptedById(storeName,row.id,runtime.key);
  if(readback)throw new Error(`Falha ao excluir artefato de teste: ${storeName}:${row.id}`);
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
  for(const record of targets){if(await erase('records',record))count++}
  return count;
}

async function runCleanup({notify=true}={}){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;
  running=true;
  try{
    const syntheticPatients=await purgeSyntheticPatients();
    const testSessions=await purgeInvalidTestSessions();
    const placeholders=await purgeStalePlaceholders();
    const changed=syntheticPatients+testSessions+placeholders;
    localStorage.setItem(FLAG,JSON.stringify({at:nowISO(),syntheticPatients,testSessions,placeholders}));
    globalThis.__rmClinicalTestArtifactCleanupStatus={version:VERSION,syntheticPatients,testSessions,placeholders,changed,at:nowISO()};
    if(changed){
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'clinical-test-artifact-cleanup-v375',count:changed,at:nowISO()}}));
      window.__rmRender?.();
      if(notify)toast(`Saneamento concluído: ${syntheticPatients} cadastro(s) de teste, ${testSessions} sessão(ões) de teste e ${placeholders} rascunho(s) vazio(s) removidos.`,'success');
    }
    return globalThis.__rmClinicalTestArtifactCleanupStatus;
  }finally{running=false}
}

function schedule(delay=120,{notify=false}={}){
  if(scheduled)clearTimeout(scheduled);
  scheduled=setTimeout(()=>{scheduled=null;void runCleanup({notify}).catch(error=>console.warn('Saneamento de artefatos de teste v3.7.5:',error))},delay);
}

document.addEventListener('rm:data-ready',()=>schedule(140,{notify:true}));
document.addEventListener('rm:app-ready',()=>schedule(220,{notify:false}));
document.addEventListener('rm:data-patched',()=>schedule(180,{notify:false}));
document.addEventListener('rm:local-data-changed',event=>{
  if(String(event.detail?.kind||'')==='clinical-data-integrity-v360')schedule(80,{notify:false});
});
if(runtime.dataReady&&!runtime.locked)schedule(40,{notify:true});

globalThis.__rmClinicalTestArtifactCleanup={version:VERSION,run:runCleanup,status:()=>globalThis.__rmClinicalTestArtifactCleanupStatus||null};
