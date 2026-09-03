import {data,runtime,todayISO,nowISO} from './state.js';
import {putEncrypted,getDecryptedById,deleteRecord} from './database.js';
import {toast} from './ui.js';
import {
  TODAY_TEST_CLEANUP_DATE,
  LIVE_TEST_MAX_MINUTES,
  TODAY_CLEANUP_MAX_MINUTES,
  linkedRecords,
  hasSubstantiveRecord,
  isSubstantiveRecord,
  isShortTestCandidate,
  resetScheduledTestSession,
  shouldDeleteAdHocTest
} from './clinical-documentation-policy-v374.mjs';

const VERSION='3.7.4';
const CLEANUP_FLAG='rm.clinical.test-session-cleanup.20260902.v374';
const END_KINDS=new Set(['clinical-session-end-v370','clinical-session-auto-end-v373']);
let busy=false;

function emitAppointment(id,kind){
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'appointments',id,kind,at:nowISO()}}));
}

function appointmentById(id){return (data.appointments||[]).find(a=>a?.id===id)||null}

async function removeNonSubstantiveRecords(appointment){
  const rows=linkedRecords(data.records,appointment).filter(record=>!isSubstantiveRecord(record));
  if(!rows.length)return 0;
  for(const record of rows)await deleteRecord('records',record.id);
  const ids=new Set(rows.map(record=>record.id));
  data.records=(data.records||[]).filter(record=>!ids.has(record?.id));
  return rows.length;
}

async function persistReset(appointment,kind){
  const at=nowISO(),next=resetScheduledTestSession(appointment,at);
  await putEncrypted('appointments',next,runtime.key);
  const stored=await getDecryptedById('appointments',next.id,runtime.key);
  if(!stored||stored.id!==next.id||stored.sessionStartedAt||stored.clinicalSessionState)throw new Error('A limpeza da sessão teste não passou no readback.');
  const index=(data.appointments||[]).findIndex(a=>a?.id===stored.id);
  if(index>=0)data.appointments[index]=stored;
  emitAppointment(stored.id,kind);
  return stored;
}

async function deleteAdHoc(appointment,kind){
  await deleteRecord('appointments',appointment.id);
  data.appointments=(data.appointments||[]).filter(a=>a?.id!==appointment.id);
  emitAppointment(appointment.id,kind);
}

async function discardTestSession(appointment,{kind='clinical-test-session-discard-v374'}={}){
  if(!appointment||hasSubstantiveRecord(data.records,appointment))return false;
  await removeNonSubstantiveRecords(appointment);
  if(shouldDeleteAdHocTest(appointment))await deleteAdHoc(appointment,kind);
  else await persistReset(appointment,kind);
  window.__rmRender?.();
  return true;
}

async function handleShortEnd(id){
  if(busy||runtime.locked||!runtime.key||!runtime.dataReady)return false;
  const appointment=appointmentById(id);if(!appointment)return false;
  if(!isShortTestCandidate(appointment,{date:todayISO(),maxMinutes:LIVE_TEST_MAX_MINUTES,includeRunning:false}))return false;
  if(hasSubstantiveRecord(data.records,appointment))return false;
  busy=true;
  try{
    const discarded=await discardTestSession(appointment,{kind:'clinical-short-no-content-discard-v374'});
    if(discarded)toast('Sessão muito curta e sem conteúdo clínico: descartada como teste. Nenhum prontuário foi criado.','success');
    return discarded;
  }finally{busy=false}
}

async function cleanupTodayTests(){
  if(busy||runtime.locked||!runtime.key||!runtime.dataReady)return 0;
  if(todayISO()!==TODAY_TEST_CLEANUP_DATE||localStorage.getItem(CLEANUP_FLAG)==='done')return 0;
  busy=true;let count=0;
  try{
    const candidates=[...(data.appointments||[])].filter(appointment=>
      isShortTestCandidate(appointment,{date:TODAY_TEST_CLEANUP_DATE,maxMinutes:TODAY_CLEANUP_MAX_MINUTES,includeRunning:true})&&
      !hasSubstantiveRecord(data.records,appointment)
    );
    for(const appointment of candidates)if(await discardTestSession(appointment,{kind:'clinical-test-cleanup-20260902-v374'}))count+=1;
    localStorage.setItem(CLEANUP_FLAG,'done');
    if(count)toast(`${count} atendimento(s) de teste de hoje removido(s). Nenhum prontuário clínico foi mantido.`, 'success');
    return count;
  }finally{busy=false}
}

function scheduleCleanup(delay=80){setTimeout(()=>void cleanupTodayTests().catch(error=>console.warn('Limpeza de sessões teste:',error)),delay)}

document.addEventListener('rm:data-ready',()=>scheduleCleanup(120));
document.addEventListener('rm:app-ready',()=>scheduleCleanup(220));
document.addEventListener('rm:local-data-changed',event=>{
  const kind=String(event.detail?.kind||''),id=String(event.detail?.id||'');
  if(END_KINDS.has(kind)&&id)setTimeout(()=>void handleShortEnd(id).catch(error=>console.warn('Descarte de sessão curta:',error)),0);
});

if(runtime.dataReady&&!runtime.locked)scheduleCleanup(40);

globalThis.__rmClinicalDocumentationGuard={version:VERSION,cleanupTodayTests,handleShortEnd,discardTestSession};
