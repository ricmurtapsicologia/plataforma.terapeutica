import {data,runtime,selectedPatient,todayISO} from './state.js';
import {sessionPhase,selectPatientSession,elapsedSeconds,formatElapsed,cancelled} from './clinical-session-domain-v370.mjs';

const VERSION='3.7.1-header';
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let timer=null;

function addStyles(){
  if(document.getElementById('rm-clinical-session-header-v371-style'))return;
  const style=document.createElement('style');
  style.id='rm-clinical-session-header-v371-style';
  style.textContent=`.rm-session-header-v371{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rm-session-header-live-v371{display:inline-flex;align-items:center;gap:6px;min-height:42px;padding:0 12px;border-radius:999px;border:1px solid #b9dfd6;background:#eefaf6;color:#246b5c;font-weight:800;font-size:.86rem}.rm-session-header-v371 button[disabled]{opacity:.62;cursor:not-allowed}@media(max-width:700px){.rm-session-header-v371{width:100%}.rm-session-header-v371>.btn,.rm-session-header-live-v371{flex:1 1 100%;justify-content:center}}`;
  document.head.appendChild(style);
}

function todayAppointment(patientId){
  const today=todayISO();
  const list=arr(data.appointments).filter(a=>a?.patientId===patientId&&!cancelled(a));
  const running=list.find(a=>sessionPhase(a)==='in_progress');
  if(running)return running;
  const open=list.filter(a=>a?.date===today&&sessionPhase(a)==='scheduled');
  if(open.length)return selectPatientSession(open,patientId,today);
  return list.filter(a=>a?.date===today&&sessionPhase(a)==='ended').sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')))[0]||null;
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

function actionButton(action,id,label,secondary=false){
  return `<button class="btn ${secondary?'secondary':''}" type="button" data-v3-action-menu="session" data-action="${action}" data-id="${id}">${label}</button>`;
}

function renderHeader(){
  if(runtime.locked||runtime.route!=='patients')return;
  const patient=selectedPatient();if(!patient)return;
  const host=document.querySelector('.patient-context .flex.gap-8.wrap,.patient-context .flex');
  if(!host)return;
  const slot=slotFor(host),appointment=todayAppointment(patient.id),phase=sessionPhase(appointment);
  const schedule=host.querySelector('[data-action="schedule-selected-patient"]');

  if(!appointment){
    slot.innerHTML='<button class="btn secondary" type="button" data-v3-action-menu="session" disabled title="Sem sessão agendada para hoje">Iniciar sessão</button>';
    schedule?.classList.remove('secondary');
    return;
  }
  if(phase==='ended'){
    slot.innerHTML='<button class="btn secondary" type="button" data-v3-action-menu="session" disabled title="A sessão de hoje já foi encerrada">Sessão encerrada</button>';
    schedule?.classList.remove('secondary');
    return;
  }
  schedule?.classList.add('secondary');
  if(phase==='in_progress'){
    slot.innerHTML=`<span class="rm-session-header-live-v371">● Em atendimento · <span data-rm-session-header-timer-v371="${appointment.id}">${formatElapsed(elapsedSeconds(appointment))}</span></span>${actionButton('clinical-session-open-meet-v370',appointment.id,'Abrir Meet')}${actionButton('clinical-session-end-v370',appointment.id,'Encerrar sessão',true)}`;
    return;
  }
  slot.innerHTML=actionButton('clinical-session-start-v370',appointment.id,'Iniciar sessão');
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
document.addEventListener('rm:rendered',()=>queue());
document.addEventListener('rm:data-ready',()=>queue(100));
document.addEventListener('rm:data-patched',()=>queue(70));
document.addEventListener('rm:local-data-changed',event=>{if(event.detail?.storeName==='appointments')queue(70)});
setInterval(updateTimer,1000);
queue(0);

globalThis.__rmClinicalSessionHeader={version:VERSION,render:renderHeader};
