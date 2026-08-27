import {data,runtime,patientById,nowISO,todayISO} from './state.js';
import {putEncrypted,getDecryptedById,deleteRecord} from './database.js';
import {openWhatsApp} from './communications.js';
import {modal,closeModal,toast,esc,fmtDate,money} from './ui.js';
import {paymentStateForAppointment} from './payment-status-v322.mjs';
import {AGENDA_VERSION,transitionAttendance,appointmentsConflict} from './agenda-domain-v330.mjs';

const OWNER='agenda-controller-v330';
const ACTIONS=new Set([
  'appointment-open',
  'agenda-attendance-v330',
  'agenda-reschedule-v330',
  'agenda-reschedule-save-v330',
  'agenda-payment-v330',
  'agenda-whatsapp-v330',
  'agenda-session-v330',
  'agenda-delete-request-v330',
  'agenda-delete-confirm-v330'
]);
const diagnostics={version:AGENDA_VERSION,owner:OWNER,listenerCount:1,lastError:'',lastPersistedAt:'',lastAction:'',lastActionAt:''};

const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const q=selector=>document.querySelector(selector);
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;
const patientName=p=>String(p?.preferredName||p?.name||'Paciente').trim()||'Paciente';
const firstName=p=>patientName(p).split(/\s+/)[0]||'Paciente';

function noteAction(action,error=''){
  diagnostics.lastAction=action||'';
  diagnostics.lastActionAt=new Date().toISOString();
  if(error)diagnostics.lastError=String(error?.message||error).slice(0,500);
  globalThis.__rmAgendaDiagnostics={...diagnostics};
}

function paymentFor(a){return paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments})}
function attendanceButton(id,value,current,label,kind='secondary'){
  const selected=current===value;
  return `<button class="btn ${kind} agenda-attendance-choice ${selected?'is-selected':''}" type="button" data-action="agenda-attendance-v330" data-id="${esc(id)}" data-status="${esc(value)}" aria-pressed="${selected?'true':'false'}">${esc(label)}</button>`;
}
function paymentMethodOptions(selected='Pix'){
  return ['Pix','Transferência','Dinheiro','Cartão','Outro'].map(value=>`<option ${selected===value?'selected':''}>${value}</option>`).join('');
}

function showManage(id){
  const a=appointmentById(id);if(!a)throw new Error('Sessão não localizada.');
  const p=patientById(a.patientId),payment=paymentFor(a),attendance=a.attendanceStatus||'';
  const paymentLabel=payment.label||'Não informado';
  const paymentAction=payment.payment?'Abrir lançamento financeiro':'Registrar pagamento';
  modal(`Sessão — ${patientName(p)}`,
    `<div class="agenda-session-summary">
      <div><span>Data</span><strong>${esc(fmtDate(a.date))}</strong></div>
      <div><span>Horário</span><strong>${esc(a.time||'—')}</strong></div>
      <div><span>Modalidade</span><strong>${esc(a.modality||'—')}</strong></div>
      <div><span>Status</span><strong>${esc(a.status||'—')}</strong></div>
      <div><span>Presença</span><strong>${esc(attendance||'Não marcada')}</strong></div>
      <div><span>Pagamento</span><strong class="agenda-payment-value ${esc(payment.code)}">${esc(paymentLabel)}</strong></div>
    </div>
    <section class="agenda-action-section"><div class="section-label">Presença</div><div class="agenda-attendance-grid">
      ${attendanceButton(a.id,'Presente',attendance,'Presente','')}
      ${attendanceButton(a.id,'Faltou',attendance,'Faltou','secondary')}
      ${attendanceButton(a.id,'Desmarcou',attendance,'Desmarcou','secondary')}
    </div></section>
    <section class="agenda-action-section"><div class="section-label">Agenda</div><div class="flex gap-8 wrap">
      <button class="btn secondary" type="button" data-action="agenda-reschedule-v330" data-id="${esc(a.id)}">Remarcar sessão</button>
    </div></section>
    ${p?.phone?`<section class="agenda-action-section"><div class="section-label">Comunicação</div><div class="flex gap-8 wrap"><button class="btn secondary" type="button" data-action="agenda-whatsapp-v330" data-id="${esc(a.id)}">Lembrete no WhatsApp</button></div></section>`:''}
    <section class="agenda-action-section"><div class="section-label">Clínica</div><div class="flex gap-8 wrap">
      <button class="btn secondary" type="button" data-action="agenda-session-v330" data-id="${esc(a.id)}">Abrir atendimento</button>
    </div></section>
    <section class="agenda-action-section"><div class="section-label">Financeiro</div><div class="flex gap-8 wrap">
      <button class="btn secondary" type="button" data-action="agenda-payment-v330" data-id="${esc(a.id)}">${esc(paymentAction)} · ${esc(paymentLabel)}</button>
    </div><div class="small muted mt-8">Valor de referência: ${esc(money(p?.value||0))}</div></section>
    <section class="agenda-action-section agenda-danger-zone"><div class="section-label">Área destrutiva</div><div class="flex gap-8 wrap">
      <button class="btn danger" type="button" data-action="agenda-delete-request-v330" data-id="${esc(a.id)}">Excluir agendamento</button>
    </div></section>`,
    `<button class="btn secondary" type="button" data-action="close-modal">Fechar</button>`,true);
}

function showReschedule(id){
  const a=appointmentById(id);if(!a)throw new Error('Sessão não localizada.');
  const p=patientById(a.patientId);
  modal(`Remarcar — ${patientName(p)}`,
    `<input id="agenda-v330-reschedule-id" type="hidden" value="${esc(a.id)}">
     <div class="input-row"><div class="field"><label>Nova data</label><input id="agenda-v330-reschedule-date" class="input" type="date" value="${esc(a.date||'')}"></div><div class="field"><label>Novo horário</label><input id="agenda-v330-reschedule-time" class="input" type="time" value="${esc(a.time||'')}"></div></div>`,
    `<button class="btn secondary" type="button" data-action="appointment-open" data-id="${esc(a.id)}">Cancelar</button><button class="btn" type="button" data-action="agenda-reschedule-save-v330">Salvar nova data</button>`,true);
}

async function persistAppointment(next){
  if(!runtime.key)throw new Error('Sessão encerrada. Entre novamente.');
  const candidate={...next,updatedAt:next.updatedAt||nowISO()};
  await putEncrypted('appointments',candidate,runtime.key);
  const stored=await getDecryptedById('appointments',candidate.id,runtime.key);
  if(!stored||stored.id!==candidate.id||stored.updatedAt!==candidate.updatedAt)throw new Error('A alteração não pôde ser verificada após a gravação.');
  const list=data.appointments||(data.appointments=[]),index=list.findIndex(x=>x?.id===candidate.id);
  if(index>=0)list[index]=stored;else list.push(stored);
  diagnostics.lastPersistedAt=new Date().toISOString();
  globalThis.__rmAgendaDiagnostics={...diagnostics};
  window.__rmRender?.();
  return stored;
}

async function setAttendance(id,value){
  const current=appointmentById(id);if(!current)throw new Error('Sessão não localizada.');
  const next=transitionAttendance(current,value,nowISO());
  const stored=await persistAppointment(next);
  toast(`Presença atualizada: ${value}.`,'success');
  showManage(stored.id);
}

async function saveReschedule(){
  const id=q('#agenda-v330-reschedule-id')?.value||'',current=appointmentById(id);
  if(!current)throw new Error('Sessão não localizada.');
  const date=q('#agenda-v330-reschedule-date')?.value||'',time=q('#agenda-v330-reschedule-time')?.value||'';
  if(!date||!time)throw new Error('Informe data e horário.');
  const next={...current,date,time,rescheduledAt:nowISO(),updatedAt:nowISO()};
  const conflict=appointmentsConflict(data.appointments,next,id);
  if(conflict){const p=patientById(conflict.patientId);throw new Error(`Conflito de horário com ${patientName(p)}.`)}
  const stored=await persistAppointment(next);
  toast(`Sessão remarcada para ${fmtDate(date)} às ${time}.`,'success');
  showManage(stored.id);
}

function openPayment(id){
  const a=appointmentById(id);if(!a)throw new Error('Sessão não localizada.');
  const p=patientById(a.patientId);if(!p)throw new Error('Paciente não localizado.');
  const state=paymentFor(a),payment=state.payment||null;
  const payId=payment?.id||'';
  const payDate=payment?.date||todayISO();
  const payValue=payment?.value??p?.value??0;
  const payStatus=payment?.status||'Pago';
  const payMethod=payment?.method||'Pix';

  globalThis.__rmSessionPayments?.prepareAppointment?.(a.id);

  modal(payment?'Editar pagamento':'Registrar pagamento',
    `<input id="pay-id" type="hidden" value="${esc(payId)}">
     <input id="pay-patient" type="hidden" value="${esc(a.patientId)}">
     <div class="agenda-session-summary">
       <div><span>Paciente</span><strong>${esc(patientName(p))}</strong></div>
       <div><span>Sessão</span><strong>${esc(fmtDate(a.date))} · ${esc(a.time||'—')}</strong></div>
       <div><span>Situação atual</span><strong class="agenda-payment-value ${esc(state.code)}">${esc(state.label||'Não informado')}</strong></div>
       <div><span>Referência</span><strong>${esc(money(p?.value||0))}</strong></div>
     </div>
     <div class="notice success mt-12" data-rm-payment-link-note="1">Este lançamento será vinculado diretamente a esta sessão.</div>
     <div class="input-row mt-12">
       <div class="field"><label>Data do pagamento</label><input id="pay-date" class="input" type="date" value="${esc(payDate)}"></div>
       <div class="field"><label>Valor</label><input id="pay-value" class="input" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(payValue)}"></div>
     </div>
     <div class="input-row mt-12">
       <div class="field"><label>Status</label><select id="pay-status" class="select"><option ${payStatus==='Pago'?'selected':''}>Pago</option><option ${payStatus==='Pendente'?'selected':''}>Pendente</option></select></div>
       <div class="field"><label>Forma</label><select id="pay-method" class="select">${paymentMethodOptions(payMethod)}</select></div>
     </div>
     <div class="field mt-12"><label>Observação administrativa</label><textarea id="pay-note" class="textarea">${esc(payment?.note||'')}</textarea></div>`,
    `<button class="btn secondary" type="button" data-action="appointment-open" data-id="${esc(a.id)}">Voltar</button><button class="btn" type="button" data-action="save-payment">${payment?'Salvar alteração':'Registrar pagamento'}</button>`,true);
}

function openSession(id){
  const a=appointmentById(id);if(!a)throw new Error('Sessão não localizada.');
  runtime.selectedPatientId=a.patientId;runtime.patientTab='atendimento';closeModal();
  if(typeof globalThis.__rmNavigate==='function')globalThis.__rmNavigate('patients');
  else{runtime.route='patients';window.__rmRender?.()}
}

function sendWhatsApp(id){
  const a=appointmentById(id),p=patientById(a?.patientId);if(!a||!p?.phone)throw new Error('Paciente ou telefone não localizado.');
  openWhatsApp(p.phone,`Olá, ${firstName(p)}. Passando para lembrar nossa sessão em ${fmtDate(a.date)}, às ${a.time}. Caso precise ajustar o horário, me avise por aqui.\n\nRichelmy Murta — Psicólogo Clínico.`);
}

function requestDelete(id){
  const a=appointmentById(id);if(!a)throw new Error('Sessão não localizada.');const p=patientById(a.patientId);
  modal('Confirmar exclusão',`<div class="notice danger"><strong>Esta ação remove o agendamento da base local e será propagada pela sincronização.</strong></div><p class="mt-16">Excluir a sessão de <strong>${esc(patientName(p))}</strong>, em ${esc(fmtDate(a.date))} às ${esc(a.time||'—')}?</p>`,
    `<button class="btn secondary" type="button" data-action="appointment-open" data-id="${esc(a.id)}">Cancelar</button><button class="btn danger" type="button" data-action="agenda-delete-confirm-v330" data-id="${esc(a.id)}">Excluir definitivamente</button>`,true);
}

async function confirmDelete(id){
  const a=appointmentById(id);if(!a)throw new Error('Sessão não localizada.');
  await deleteRecord('appointments',id);
  const list=data.appointments||(data.appointments=[]),index=list.findIndex(x=>x?.id===id);if(index>=0)list.splice(index,1);
  diagnostics.lastPersistedAt=new Date().toISOString();closeModal();window.__rmRender?.();toast('Agendamento excluído.','success');
}

async function dispatch(action,element){
  noteAction(action);
  const id=element?.dataset?.id||'';
  if(action==='appointment-open')return showManage(id);
  if(action==='agenda-attendance-v330')return setAttendance(id,element.dataset.status||'');
  if(action==='agenda-reschedule-v330')return showReschedule(id);
  if(action==='agenda-reschedule-save-v330')return saveReschedule();
  if(action==='agenda-payment-v330')return openPayment(id);
  if(action==='agenda-whatsapp-v330')return sendWhatsApp(id);
  if(action==='agenda-session-v330')return openSession(id);
  if(action==='agenda-delete-request-v330')return requestDelete(id);
  if(action==='agenda-delete-confirm-v330')return confirmDelete(id);
}

async function onClick(event){
  const element=event.target.closest?.('[data-action]');if(!element)return;
  const action=element.dataset.action;if(!ACTIONS.has(action))return;
  event.preventDefault();
  try{await dispatch(action,element)}catch(error){noteAction(action,error);toast(error?.message||'Não foi possível concluir a ação.','error')}
}

document.addEventListener('click',onClick);

function paintHealth(){
  if(runtime.locked||runtime.route!=='settings')return;
  const main=document.getElementById('main-content');if(!main)return;
  let card=document.getElementById('rm-agenda-health-v330');
  if(!card){card=document.createElement('section');card.id='rm-agenda-health-v330';card.className='card mt-16';main.appendChild(card)}
  card.innerHTML=`<div class="card-title"><div><div class="eyebrow">Agenda ${esc(AGENDA_VERSION)}</div><h3 class="mb-0">Controlador da Agenda</h3></div><span class="badge success">1 proprietário</span></div><div class="grid grid-3"><div><div class="tiny muted">Proprietário</div><strong>${esc(OWNER)}</strong></div><div><div class="tiny muted">Última persistência</div><strong>${esc(diagnostics.lastPersistedAt||'Ainda não nesta sessão')}</strong></div><div><div class="tiny muted">Última ação</div><strong>${esc(diagnostics.lastAction||'—')}</strong></div></div><div class="small muted mt-12">Último erro: ${esc(diagnostics.lastError||'Nenhum erro registrado nesta sessão.')}</div>`;
}
document.addEventListener('rm:rendered',()=>queueMicrotask(paintHealth));

globalThis.__rmAgendaController={version:AGENDA_VERSION,owner:OWNER,listenerCount:1,open:showManage,dispatch,status:()=>({...diagnostics})};
globalThis.__rmAgendaDiagnostics={...diagnostics};
