import {data,runtime,selectedPatient,todayISO,nowISO} from './state.js';
import {putEncrypted,deleteRecord} from './database.js';
import {modal,closeModal,toast,fmtDate} from './ui.js';
import {assert} from './validation.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const q=s=>document.querySelector(s);
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
let enforcingClosedSchedules=false;
let invariantTimer=null;

function patientIdFromCard(card){return card?.querySelector('[data-id]')?.dataset.id||''}
function patientForCard(card){const id=patientIdFromCard(card);return arr(data.patients).find(p=>p?.id===id)||null}
function patientByIdLocal(id){return arr(data.patients).find(p=>p?.id===id)||null}
function isClosed(p){return p?.status==='Encerrado'}
function datePart(value=''){const m=String(value||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?.[1]||''}
function closureDate(p){
  if(!isClosed(p))return'';
  if(ISO_DATE.test(p?.careEndedAt||''))return p.careEndedAt;
  return datePart(p?.careEndedRecordedAt)||datePart(p?.updatedAt)||todayISO();
}
function appointmentsFromClosure(patientId,endDate){return arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date&&a.date>=endDate)}

function updateClosureCount(){
  const p=selectedPatient(),date=q('#patient-end-date')?.value||todayISO(),box=q('#patient-end-count');
  if(!p||!box)return;
  const count=appointmentsFromClosure(p.id,date).length;
  box.textContent=count?`${count} sessão(ões) agendada(s) em ${fmtDate(date)} ou depois será(ão) removida(s) da agenda.`:`Não há sessões agendadas em ${fmtDate(date)} ou depois para remover.`;
}

function showClosureModal(){
  const p=selectedPatient();
  assert(p,'Selecione um paciente.');
  if(isClosed(p)){toast('Este atendimento já está encerrado.','info');return}
  modal('Encerrar atendimento',`<div class="notice warning">O paciente será movido para a listagem de encerrados. Cadastro, prontuário, histórico clínico, documentos e demais dados serão preservados. Todas as sessões agendadas na data do encerramento e em datas posteriores serão removidas automaticamente da agenda.</div><div class="field mt-16"><label>Data de encerramento</label><input id="patient-end-date" class="input" type="date" value="${todayISO()}"></div><div id="patient-end-count" class="small muted mt-12"></div>`,`<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="confirm-end-patient-care">Encerrar atendimento</button>`);
  updateClosureCount();
}

async function removeAppointmentsFromClosure(patientId,endDate){
  if(!patientId||!ISO_DATE.test(endDate||''))return 0;
  const appointments=[...appointmentsFromClosure(patientId,endDate)];
  for(const appointment of appointments){
    data.appointments=arr(data.appointments).filter(x=>x?.id!==appointment.id);
    await deleteRecord('appointments',appointment.id);
  }
  return appointments.length;
}

async function normalizeClosedPatient(p){
  if(!isClosed(p)||!runtime.key)return'';
  const endDate=closureDate(p);
  if(!ISO_DATE.test(endDate))return'';
  if(p.careEndedAt===endDate)return endDate;
  const updated={...p,careEndedAt:endDate,careEndedRecordedAt:p.careEndedRecordedAt||p.updatedAt||nowISO(),updatedAt:nowISO()};
  const i=Array.isArray(data.patients)?data.patients.findIndex(x=>x?.id===p.id):-1;
  if(i>=0)data.patients[i]=updated;
  await putEncrypted('patients',updated,runtime.key);
  return endDate;
}

async function enforceClosedPatientScheduleInvariant(){
  if(enforcingClosedSchedules||!runtime.key||runtime.locked)return 0;
  enforcingClosedSchedules=true;
  let removed=0;
  try{
    for(const original of [...arr(data.patients)]){
      if(!isClosed(original))continue;
      const endDate=await normalizeClosedPatient(original);
      if(!endDate)continue;
      removed+=await removeAppointmentsFromClosure(original.id,endDate);
    }
    if(removed)window.__rmRender?.();
    return removed;
  }finally{enforcingClosedSchedules=false}
}

function queueInvariant(delay=0){
  clearTimeout(invariantTimer);
  invariantTimer=setTimeout(()=>enforceClosedPatientScheduleInvariant().catch(console.error),delay);
}

async function endPatientCare(){
  const p=selectedPatient();
  assert(p,'Selecione um paciente.');
  assert(runtime.key,'Sessão encerrada. Entre novamente.');
  if(isClosed(p)){closeModal();queueInvariant(0);return}
  const endDate=q('#patient-end-date')?.value||todayISO();
  assert(ISO_DATE.test(endDate),'Informe uma data de encerramento válida.');
  const updated={...p,status:'Encerrado',careEndedAt:endDate,careEndedRecordedAt:nowISO(),updatedAt:nowISO()};
  const i=Array.isArray(data.patients)?data.patients.findIndex(x=>x?.id===p.id):-1;
  if(i>=0)data.patients[i]=updated;
  await putEncrypted('patients',updated,runtime.key);
  const removed=await removeAppointmentsFromClosure(p.id,endDate);
  closeModal();
  runtime.patientTab='summary';
  window.__rmRender?.();
  toast(removed?`Atendimento encerrado. ${removed} sessão(ões) a partir de ${fmtDate(endDate)} removida(s) da agenda.`:'Atendimento encerrado. Não havia sessões futuras para remover.','success');
}

function closedMeta(p){const d=closureDate(p);return d?`Encerrado em ${fmtDate(d)}`:'Atendimento encerrado'}

function decorateClosedCard(card,p){
  card.querySelector('[data-action="quick-schedule-patient"]')?.remove();
  if(card.querySelector('[data-closure-meta]'))return;
  const actions=card.querySelector('.flex.gap-8.wrap:last-child');
  const meta=document.createElement('div');
  meta.dataset.closureMeta='true';
  meta.className='tiny muted mt-8';
  meta.textContent=closedMeta(p);
  actions?.before(meta);
}

function buildPatientSection(title,subtitle,cards,kind){
  const section=document.createElement('section');
  section.className=kind==='closed'?'patient-list-section mt-24':'patient-list-section';
  section.dataset.patientList=kind;
  const head=document.createElement('div');
  head.className='flex justify-between items-center wrap';
  head.innerHTML=`<div><h2 style="margin:0">${title}</h2><div class="small muted mt-4">${subtitle}</div></div><span class="badge">${cards.length}</span>`;
  const list=document.createElement('div');
  list.className='grid grid-3 mt-12';
  if(cards.length)cards.forEach(card=>list.appendChild(card));
  else list.innerHTML=`<div class="card"><strong>${kind==='closed'?'Nenhum atendimento encerrado':'Nenhum paciente em acompanhamento'}</strong></div>`;
  section.append(head,list);
  return section;
}

function organizePatientLists(){
  const grid=q('#patient-grid');
  if(!grid||q('#patient-lists'))return;
  const cards=[...grid.querySelectorAll('[data-patient-card]')];
  const active=[],closed=[];
  for(const card of cards){
    const p=patientForCard(card);
    if(isClosed(p)){decorateClosedCard(card,p);closed.push(card)}else active.push(card);
  }
  const wrap=document.createElement('div');
  wrap.id='patient-lists';
  wrap.append(
    buildPatientSection('Em acompanhamento','Pacientes ativos ou aguardando retorno.',active,'active'),
    buildPatientSection('Encerrados','Cadastros e históricos preservados após o término do atendimento.',closed,'closed')
  );
  grid.replaceWith(wrap);
  refreshListVisibility();
}

function decorateSelectedPatient(){
  const p=selectedPatient(),context=q('.patient-context');
  if(!p||!context)return;
  const actions=context.querySelector('.flex.gap-8.wrap');
  if(!actions)return;
  if(isClosed(p)){
    q('#patient-workspace')?.querySelectorAll('[data-action="schedule-selected-patient"]').forEach(b=>b.remove());
    if(!actions.querySelector('[data-care-ended-label]')){
      const label=document.createElement('span');
      label.className='badge';
      label.dataset.careEndedLabel='true';
      label.textContent=closedMeta(p);
      actions.prepend(label);
    }
    return;
  }
  if(!actions.querySelector('[data-action="end-patient-care"]')){
    const button=document.createElement('button');
    button.type='button';
    button.className='btn secondary';
    button.dataset.action='end-patient-care';
    button.textContent='Encerrar atendimento';
    actions.appendChild(button);
  }
}

function protectPatientStatusModal(){
  const select=q('#p-status');
  if(!select)return;
  const id=q('#p-id')?.value||'',p=id?patientByIdLocal(id):null;
  const closedOption=[...select.options].find(option=>option.value==='Encerrado');
  if(isClosed(p)){
    select.value='Encerrado';
    select.disabled=true;
    if(!select.closest('.field')?.querySelector('[data-closure-status-note]')){
      const note=document.createElement('div');
      note.className='tiny muted mt-8';
      note.dataset.closureStatusNote='true';
      note.textContent='Status definido pelo fluxo de encerramento do atendimento.';
      select.insertAdjacentElement('afterend',note);
    }
  }else closedOption?.remove();
}

function restrictClosedPatientsInAppointmentModal(){
  const select=q('#a-patient');
  if(!select)return;
  const appointmentId=q('#a-id')?.value||'',current=select.value;
  [...select.options].forEach(option=>{
    if(!option.value)return;
    const p=patientByIdLocal(option.value);
    if(isClosed(p)&&!(appointmentId&&option.value===current))option.remove();
  });
  if(!appointmentId&&isClosed(patientByIdLocal(select.value)))select.value='';
}

function enhanceTransientModals(){protectPatientStatusModal();restrictClosedPatientsInAppointmentModal()}

function refreshListVisibility(){
  const term=(q('#patient-search')?.value||'').trim();
  const status=q('#patient-status-filter')?.value||'';
  document.querySelectorAll('[data-patient-list]').forEach(section=>{
    if(!term&&!status){section.hidden=false;return}
    const visible=[...section.querySelectorAll('[data-patient-card]')].some(card=>!card.hidden);
    section.hidden=!visible;
  });
}

function applyPatientClosureUi(){organizePatientLists();decorateSelectedPatient();enhanceTransientModals();setTimeout(refreshListVisibility,0)}

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action]');
  if(!el)return;
  if(['new-patient','edit-patient','new-appointment','edit-appointment'].includes(el.dataset.action)){
    setTimeout(enhanceTransientModals,0);
    setTimeout(enhanceTransientModals,120);
  }
  if(el.dataset.action==='end-patient-care'){
    e.preventDefault();e.stopImmediatePropagation();
    try{showClosureModal()}catch(err){toast(err.message||'Não foi possível abrir o encerramento.','error')}
    return;
  }
  if(el.dataset.action==='confirm-end-patient-care'){
    e.preventDefault();e.stopImmediatePropagation();
    try{await endPatientCare()}catch(err){toast(err.message||'Não foi possível encerrar o atendimento.','error');console.error(err)}
  }
},true);

document.addEventListener('change',e=>{if(e.target.id==='patient-end-date')updateClosureCount();if(e.target.id==='patient-status-filter')setTimeout(refreshListVisibility,0)},true);
document.addEventListener('input',e=>{if(e.target.id==='patient-search')setTimeout(refreshListVisibility,0)},true);
document.addEventListener('rm:rendered',applyPatientClosureUi);
document.addEventListener('rm:data-ready',()=>queueInvariant(0));
document.addEventListener('rm:app-ready',()=>setTimeout(applyPatientClosureUi,0));
document.addEventListener('rm:sync-status',e=>{if(e.detail?.status==='synced')queueInvariant(80)});
document.addEventListener('rm:local-data-changed',e=>{
  if(globalThis.__rmSyncApplying)return;
  const store=e.detail?.storeName;
  if(store==='patients'||store==='appointments')queueInvariant(40);
});
const modalRoot=document.getElementById('modal-root');
if(modalRoot)new MutationObserver(()=>setTimeout(enhanceTransientModals,0)).observe(modalRoot,{childList:true,subtree:true});
setTimeout(applyPatientClosureUi,100);
