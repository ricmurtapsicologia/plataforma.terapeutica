import {data,runtime,selectedPatient,todayISO,nowISO} from './state.js';
import {putEncrypted,getDecryptedById} from './database.js';
import {toast,modal,closeModal,esc,fmtDate} from './ui.js';
import {sessionPhase,selectPatientSession,elapsedSeconds,formatElapsed,finalDurationMinutes} from './clinical-session-domain-v370.mjs';

const VERSION='3.7.0';
const ACTIONS=new Set(['clinical-session-start-v370','clinical-session-open-meet-v370','clinical-session-end-v370','clinical-session-end-confirm-v370','clinical-session-undo-v370']);
const busy=new Set();
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;

function addStyles(){
  if(document.getElementById('rm-clinical-session-v370-style'))return;
  const style=document.createElement('style');
  style.id='rm-clinical-session-v370-style';
  style.textContent=`.rm-session-live-v370{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 12px;border-radius:999px;border:1px solid #b9dfd6;background:#eefaf6;color:#246b5c;font-weight:800;font-size:.86rem}.rm-session-live-v370 .dot{font-size:.72rem}.rm-session-starting-v370{opacity:.72;pointer-events:none}.rm-session-end-summary-v370{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rm-session-end-summary-v370>div{padding:12px;border:1px solid var(--border,#d8dee6);border-radius:12px}.rm-session-end-summary-v370 span{display:block;font-size:.75rem;color:var(--muted,#647780);margin-bottom:4px}@media(max-width:700px){.rm-session-live-v370{width:100%;justify-content:center}.rm-session-end-summary-v370{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function calendarApi(){
  const api=globalThis.__rmGoogleCalendar;
  if(!api?.ensureMeetForAppointment)throw new Error('Integração Google Agenda/Meet ainda não está pronta. Abra Configurações e renove o Google Workspace.');
  return api;
}

function emitChanged(id,kind){
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'appointments',id,kind,at:nowISO()}}));
}

async function persistAppointment(next,kind){
  if(!runtime.key)throw new Error('Sessão encerrada. Entre novamente na plataforma.');
  const candidate={...next,updatedAt:nowISO()};
  await putEncrypted('appointments',candidate,runtime.key);
  const stored=await getDecryptedById('appointments',candidate.id,runtime.key);
  if(!stored||stored.id!==candidate.id||stored.updatedAt!==candidate.updatedAt)throw new Error('A alteração da sessão não passou na verificação de gravação.');
  const list=data.appointments||(data.appointments=[]),index=list.findIndex(a=>a?.id===candidate.id);
  if(index>=0)list[index]=stored;else list.push(stored);
  emitChanged(stored.id,kind);
  window.__rmRender?.();
  return stored;
}

function preopenMeet(){
  const popup=window.open('about:blank','_blank');
  if(popup){try{popup.opener=null;popup.document.title='Abrindo Google Meet…';popup.document.body.innerHTML='<p style="font:600 16px system-ui;padding:24px">Preparando Google Meet…</p>'}catch{}}
  return popup;
}

function sendPopup(popup,url){
  if(popup&&!popup.closed){try{popup.location.replace(url);return true}catch{}}
  const opened=window.open(url,'_blank','noopener,noreferrer');
  return Boolean(opened);
}

function closePopup(popup){try{if(popup&&!popup.closed)popup.close()}catch{}}

async function ensureMeet(appointment){
  const result=await calendarApi().ensureMeetForAppointment(appointment);
  const url=String(result?.url||'').trim();
  if(!/^https:\/\/meet\.google\.com\//i.test(url))throw new Error('O Google Agenda não retornou um link válido do Meet.');
  return{url,eventId:String(result?.eventId||appointment.calendarEventId||'')};
}

async function startSession(id,sourceElement){
  const current=appointmentById(id);if(!current)throw new Error('Sessão não localizada.');
  if(current.status==='Cancelada'||current.attendanceStatus==='Desmarcou')throw new Error('Sessão cancelada não pode ser iniciada.');
  if(sessionPhase(current)==='ended')throw new Error('Esta sessão já está encerrada.');
  if(sessionPhase(current)==='in_progress')return openMeet(id);
  if(current.date!==todayISO())throw new Error('O botão Iniciar sessão é habilitado apenas para a sessão do dia.');
  if(busy.has(id))return;
  busy.add(id);sourceElement?.classList.add('rm-session-starting-v370');sourceElement&&(sourceElement.disabled=true);
  const popup=preopenMeet();
  try{
    const meet=await ensureMeet(current),startedAt=nowISO();
    const stored=await persistAppointment({...current,calendarEventId:meet.eventId||current.calendarEventId||'',meetUrl:meet.url,sessionStartedAt:current.sessionStartedAt||startedAt,sessionEndedAt:'',clinicalSessionState:'Em atendimento',sessionPreviousStatus:current.sessionPreviousStatus??current.status??'',sessionPreviousAttendanceStatus:current.sessionPreviousAttendanceStatus??current.attendanceStatus??'',sessionStartSource:'platform-one-click'},'clinical-session-start-v370');
    sendPopup(popup,meet.url);
    toast('Sessão iniciada. Google Meet aberto e cronômetro registrado.','success');
    decorate();
    return stored;
  }catch(error){closePopup(popup);throw error}finally{busy.delete(id);sourceElement?.classList.remove('rm-session-starting-v370');if(sourceElement)sourceElement.disabled=false}
}

async function openMeet(id){
  const current=appointmentById(id);if(!current)throw new Error('Sessão não localizada.');
  let url=String(current.meetUrl||'').trim();
  if(!url){
    const meet=await ensureMeet(current);url=meet.url;
    await persistAppointment({...current,calendarEventId:meet.eventId||current.calendarEventId||'',meetUrl:url},'clinical-session-meet-link-v370');
  }
  const opened=window.open(url,'_blank','noopener,noreferrer');
  if(!opened)throw new Error('O navegador bloqueou a nova aba. Permita pop-ups para abrir o Google Meet.');
}

function endModal(id){
  const current=appointmentById(id);if(!current)throw new Error('Sessão não localizada.');
  if(sessionPhase(current)!=='in_progress')throw new Error('Não há sessão em andamento para encerrar.');
  const elapsed=formatElapsed(elapsedSeconds(current));
  modal('Encerrar sessão',`<div class="notice success"><strong>Sessão em andamento.</strong> O encerramento marcará presença e registrará a duração real.</div><div class="rm-session-end-summary-v370 mt-16"><div><span>Data</span><strong>${esc(fmtDate(current.date))}</strong></div><div><span>Início</span><strong>${esc(new Date(current.sessionStartedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))}</strong></div><div><span>Decorrido</span><strong data-rm-session-timer="${esc(current.id)}">${esc(elapsed)}</strong></div></div><p class="small muted mt-16">Se o início foi acionado por engano, use “Desfazer início”. O Meet criado é preservado para evitar duplicações.</p>`,`<button class="btn secondary" type="button" data-action="close-modal">Continuar sessão</button><button class="btn secondary" type="button" data-action="clinical-session-undo-v370" data-id="${esc(current.id)}">Desfazer início</button><button class="btn" type="button" data-action="clinical-session-end-confirm-v370" data-id="${esc(current.id)}">Encerrar e abrir prontuário</button>`,true);
}

async function confirmEnd(id){
  const current=appointmentById(id);if(!current)throw new Error('Sessão não localizada.');
  if(sessionPhase(current)!=='in_progress')throw new Error('A sessão não está mais em andamento.');
  if(busy.has(id))return;busy.add(id);
  try{
    const endedAt=nowISO(),minutes=finalDurationMinutes(current.sessionStartedAt,endedAt);
    const stored=await persistAppointment({...current,sessionEndedAt:endedAt,clinicalSessionState:'Encerrada',actualDurationMinutes:minutes,status:'Realizada',attendanceStatus:'Presente',sessionEndSource:'platform-one-click'},'clinical-session-end-v370');
    closeModal();
    runtime.selectedPatientId=stored.patientId;runtime.patientTab='records';
    if(typeof globalThis.__rmNavigate==='function')globalThis.__rmNavigate('patients');else{runtime.route='patients';window.__rmRender?.()}
    toast(`Sessão encerrada. Duração registrada: ${minutes} min.`,'success');
  }finally{busy.delete(id)}
}

async function undoStart(id){
  const current=appointmentById(id);if(!current)throw new Error('Sessão não localizada.');
  if(sessionPhase(current)!=='in_progress')throw new Error('A sessão não está em andamento.');
  const restored={...current,status:current.sessionPreviousStatus||'Confirmada',attendanceStatus:current.sessionPreviousAttendanceStatus||'',sessionStartedAt:'',sessionEndedAt:'',clinicalSessionState:'',actualDurationMinutes:null,sessionStartSource:'',sessionEndSource:'',sessionPreviousStatus:'',sessionPreviousAttendanceStatus:''};
  await persistAppointment(restored,'clinical-session-undo-v370');
  closeModal();toast('Início desfeito. O link do Meet foi preservado.','success');decorate();
}

function removeLiveUi(container){
  container?.querySelectorAll?.('[data-rm-session-live-v370],[data-rm-session-end-button-v370]').forEach(el=>el.remove());
}

function applySessionButton(button,appointment){
  if(!button||!appointment)return;
  const phase=sessionPhase(appointment),parent=button.parentElement;
  removeLiveUi(parent);
  if(phase==='in_progress'){
    const live=document.createElement('span');live.className='rm-session-live-v370';live.dataset.rmSessionLiveV370='1';live.innerHTML=`<span class="dot">●</span> Em atendimento · <span data-rm-session-timer="${esc(appointment.id)}">${esc(formatElapsed(elapsedSeconds(appointment)))}</span>`;
    parent?.insertBefore(live,button);
    button.dataset.action='clinical-session-open-meet-v370';button.dataset.id=appointment.id;button.textContent='Abrir Meet';button.classList.remove('secondary');button.classList.add('btn');
    const end=document.createElement('button');end.type='button';end.className='btn secondary';end.dataset.action='clinical-session-end-v370';end.dataset.id=appointment.id;end.dataset.rmSessionEndButtonV370='1';end.textContent='Encerrar sessão';button.insertAdjacentElement('afterend',end);
    return;
  }
  if(phase==='scheduled'&&appointment.date===todayISO()){
    button.dataset.action='clinical-session-start-v370';button.dataset.id=appointment.id;button.textContent='Iniciar sessão';button.classList.remove('secondary');button.classList.add('btn');
  }
}

function decoratePatientSummary(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='summary')return;
  const patient=selectedPatient();if(!patient)return;
  const appointment=selectPatientSession(data.appointments,patient.id,todayISO());
  const button=document.querySelector('#patient-tab-content [data-action="patient-tab"][data-tab="atendimento"],#patient-tab-content [data-action="clinical-session-start-v370"],#patient-tab-content [data-action="clinical-session-open-meet-v370"]');
  if(!button)return;
  const parent=button.parentElement;removeLiveUi(parent);
  if(!appointment||appointment.date!==todayISO()&&sessionPhase(appointment)!=='in_progress'){
    button.dataset.action='patient-tab';button.dataset.tab='atendimento';button.removeAttribute('data-id');button.textContent='Abrir atendimento';button.classList.add('secondary');return;
  }
  applySessionButton(button,appointment);
}

function decorateAgendaModal(){
  const root=document.getElementById('modal-root');if(!root)return;
  const button=root.querySelector('[data-action="agenda-session-v330"],[data-action="clinical-session-start-v370"],[data-action="clinical-session-open-meet-v370"]');
  if(!button)return;
  const id=button.dataset.id||'',appointment=appointmentById(id);if(!appointment)return;
  if(appointment.date===todayISO()||sessionPhase(appointment)==='in_progress')applySessionButton(button,appointment);
}

function updateTimers(){
  document.querySelectorAll('[data-rm-session-timer]').forEach(node=>{const appointment=appointmentById(node.dataset.rmSessionTimer||'');if(appointment)node.textContent=formatElapsed(elapsedSeconds(appointment))});
}

function decorate(){addStyles();decoratePatientSummary();decorateAgendaModal();updateTimers()}
function queueDecorate(delay=20){setTimeout(decorate,delay)}

async function dispatch(action,element){
  const id=element?.dataset?.id||'';
  if(action==='clinical-session-start-v370')return startSession(id,element);
  if(action==='clinical-session-open-meet-v370')return openMeet(id);
  if(action==='clinical-session-end-v370')return endModal(id);
  if(action==='clinical-session-end-confirm-v370')return confirmEnd(id);
  if(action==='clinical-session-undo-v370')return undoStart(id);
}

document.addEventListener('click',event=>{const element=event.target.closest?.('[data-action]');if(!element||!ACTIONS.has(element.dataset.action))return;event.preventDefault();event.stopImmediatePropagation();void dispatch(element.dataset.action,element).catch(error=>{toast(error?.message||'Não foi possível concluir a ação da sessão.','error');decorate()})},true);
document.addEventListener('rm:rendered',()=>queueDecorate());
document.addEventListener('rm:data-ready',()=>queueDecorate(80));
document.addEventListener('rm:data-patched',()=>queueDecorate(50));
document.addEventListener('rm:local-data-changed',event=>{if(event.detail?.storeName==='appointments')queueDecorate(40)});
const modalRoot=document.getElementById('modal-root');if(modalRoot)new MutationObserver(()=>queueDecorate(0)).observe(modalRoot,{childList:true,subtree:true});
setInterval(updateTimers,1000);
addStyles();

globalThis.__rmClinicalSession={version:VERSION,start:startSession,openMeet,end:endModal,phase:sessionPhase,decorate};
