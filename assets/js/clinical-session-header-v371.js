import {data,runtime,selectedPatient,todayISO,nowISO,uid,preferences} from './state.js';
import {putEncrypted,getDecryptedById,deleteRecord} from './database.js';
import {toast} from './ui.js';
import {sessionPhase,selectPatientSession,elapsedSeconds,formatElapsed,cancelled} from './clinical-session-domain-v370.mjs';

const VERSION='3.7.2-flex-start';
const FLEX_ACTION='clinical-session-start-flex-v372';
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let timer=null;
let creating=false;

function addStyles(){
  if(document.getElementById('rm-clinical-session-header-v371-style'))return;
  const style=document.createElement('style');
  style.id='rm-clinical-session-header-v371-style';
  style.textContent=`.rm-session-header-v371{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rm-session-header-live-v371,.rm-session-header-state-v372{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:0 12px;border-radius:999px;border:1px solid #b9dfd6;background:#eefaf6;color:#246b5c;font-weight:800;font-size:.86rem}.rm-session-header-state-v372{border-color:var(--border,#d8dee6);background:var(--surface,#fff);color:var(--muted,#647780);font-weight:700}.rm-session-header-v371 button[disabled]{opacity:.62;cursor:not-allowed}@media(max-width:700px){.rm-session-header-v371{width:100%}.rm-session-header-v371>.btn,.rm-session-header-live-v371,.rm-session-header-state-v372{flex:1 1 100%;justify-content:center}}`;
  document.head.appendChild(style);
}

function patientAppointments(patientId){
  return arr(data.appointments).filter(a=>a?.patientId===patientId&&!cancelled(a));
}

function todayAppointment(patientId){
  const today=todayISO(),list=patientAppointments(patientId);
  const running=list.find(a=>sessionPhase(a)==='in_progress');
  if(running)return running;
  const open=list.filter(a=>a?.date===today&&sessionPhase(a)==='scheduled');
  if(open.length)return selectPatientSession(open,patientId,today);
  return list.filter(a=>a?.date===today&&sessionPhase(a)==='ended').sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')))[0]||null;
}

function currentTime(){
  const d=new Date();
  return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function persistNewAppointment(appointment){
  if(!runtime.key)throw new Error('Sessão encerrada. Entre novamente na plataforma.');
  await putEncrypted('appointments',appointment,runtime.key);
  const stored=await getDecryptedById('appointments',appointment.id,runtime.key);
  if(!stored||stored.id!==appointment.id||stored.updatedAt!==appointment.updatedAt)throw new Error('A sessão avulsa não passou na verificação de gravação.');
  const list=data.appointments||(data.appointments=[]);
  const index=list.findIndex(a=>a?.id===stored.id);
  if(index>=0)list[index]=stored;else list.push(stored);
  return stored;
}

async function rollbackAppointment(id){
  try{await deleteRecord('appointments',id)}catch{}
  const list=data.appointments||(data.appointments=[]),index=list.findIndex(a=>a?.id===id);
  if(index>=0)list.splice(index,1);
}

async function createAdHocAppointment(patient){
  const stamp=nowISO();
  const appointment={
    id:uid('appt'),
    patientId:patient.id,
    date:todayISO(),
    time:currentTime(),
    duration:Number(preferences.defaultSessionMinutes)||50,
    status:'Confirmada',
    attendanceStatus:'',
    modality:patient.modality||'On-line',
    recurrence:'Avulso',
    note:'Sessão avulsa iniciada manualmente pela plataforma.',
    sessionOrigin:'manual-flex-start',
    createdAt:stamp,
    updatedAt:stamp
  };
  return persistNewAppointment(appointment);
}

async function flexibleStart(element){
  if(creating)return;
  const patient=selectedPatient();
  if(!patient)throw new Error('Selecione um paciente antes de iniciar a sessão.');
  const running=patientAppointments(patient.id).find(a=>sessionPhase(a)==='in_progress');
  if(running){
    if(!globalThis.__rmClinicalSession?.openMeet)throw new Error('Módulo de sessão ainda não está pronto.');
    return globalThis.__rmClinicalSession.openMeet(running.id);
  }
  const openToday=patientAppointments(patient.id).filter(a=>a?.date===todayISO()&&sessionPhase(a)==='scheduled');
  let appointment=openToday.length?selectPatientSession(openToday,patient.id,todayISO()):null;
  let created=false;
  creating=true;
  element.disabled=true;
  try{
    if(!appointment){appointment=await createAdHocAppointment(patient);created=true}
    if(!globalThis.__rmClinicalSession?.start)throw new Error('Módulo de sessão ainda não está pronto.');
    await globalThis.__rmClinicalSession.start(appointment.id,element);
    if(created)toast('Sessão avulsa criada para agora e iniciada.','success');
  }catch(error){
    if(created&&appointment?.id)await rollbackAppointment(appointment.id);
    throw error;
  }finally{
    creating=false;
    element.disabled=false;
    queue(20);
  }
}

function slotFor(host){
  let slot=host.querySelector(':scope > [data-rm-session-header-v371]');
  if(slot)return slot;
  slot=document.createElement('div');
  slot.className='rm-session-header-v371';
  slot.dataset.rmSessionHeaderV371='1';
  host.prepend(slot);
  return slot;
}

function actionButton(action,id,label,secondary=false,title=''){
  return `<button class="btn ${secondary?'secondary':''}" type="button" data-v3-action-menu="session" data-action="${action}" ${id?`data-id="${id}"`:''} ${title?`title="${title}"`:''}>${label}</button>`;
}

function renderHeader(){
  if(runtime.locked||runtime.route!=='patients')return;
  const patient=selectedPatient();if(!patient)return;
  const host=document.querySelector('.patient-context .flex.gap-8.wrap,.patient-context .flex');
  if(!host)return;
  const slot=slotFor(host),appointment=todayAppointment(patient.id),phase=sessionPhase(appointment);
  const schedule=host.querySelector('[data-action="schedule-selected-patient"]');
  schedule?.classList.add('secondary');

  if(phase==='in_progress'){
    slot.innerHTML=`<span class="rm-session-header-live-v371">● Em atendimento · <span data-rm-session-header-timer-v371="${appointment.id}">${formatElapsed(elapsedSeconds(appointment))}</span></span>${actionButton('clinical-session-open-meet-v370',appointment.id,'Abrir Meet')}${actionButton('clinical-session-end-v370',appointment.id,'Encerrar sessão',true)}`;
    return;
  }
  if(phase==='scheduled'){
    slot.innerHTML=actionButton('clinical-session-start-v370',appointment.id,'Iniciar sessão',false,'Iniciar a sessão agendada para hoje');
    return;
  }
  if(phase==='ended'){
    slot.innerHTML=`<span class="rm-session-header-state-v372">Sessão anterior encerrada</span>${actionButton(FLEX_ACTION,'','Iniciar nova sessão',false,'Cria uma nova sessão avulsa para agora')}`;
    return;
  }
  slot.innerHTML=`<span class="rm-session-header-state-v372">Sem sessão aberta hoje</span>${actionButton(FLEX_ACTION,'','Iniciar sessão',false,'Cria uma sessão avulsa para agora')}`;
}

function updateTimer(){
  document.querySelectorAll('[data-rm-session-header-timer-v371]').forEach(node=>{
    const id=node.dataset.rmSessionHeaderTimerV371||'';
    const appointment=arr(data.appointments).find(a=>a?.id===id);
    if(appointment)node.textContent=formatElapsed(elapsedSeconds(appointment));
  });
}

function queue(delay=55){clearTimeout(timer);timer=setTimeout(()=>{renderHeader();updateTimer()},delay)}

addStyles();
document.addEventListener('click',event=>{
  const element=event.target.closest?.(`[data-action="${FLEX_ACTION}"]`);
  if(!element)return;
  event.preventDefault();event.stopImmediatePropagation();
  void flexibleStart(element).catch(error=>toast(error?.message||'Não foi possível iniciar a sessão.','error'));
},true);
document.addEventListener('rm:rendered',()=>queue());
document.addEventListener('rm:data-ready',()=>queue(100));
document.addEventListener('rm:data-patched',()=>queue(70));
document.addEventListener('rm:local-data-changed',event=>{if(event.detail?.storeName==='appointments')queue(70)});
setInterval(updateTimer,1000);
queue(0);

globalThis.__rmClinicalSessionHeader={version:VERSION,render:renderHeader,flexibleStart};
