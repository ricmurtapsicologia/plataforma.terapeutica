import {data,runtime,uid,nowISO,todayISO,selectedPatient,patientById} from './state.js';
import {putEncrypted} from './database.js';
import {sanitizeText} from './validation.js';
import {closeModal,toast} from './ui.js';
import {paymentStateForAppointment,inferAppointmentIdForPayment} from './payment-status-v322.mjs';

const VERSION='3.2.2';
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const q=selector=>document.querySelector(selector);
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;
let pendingAppointmentId='';
let pendingUntil=0;
let backfillRunning=false;

function clearPending(){pendingAppointmentId='';pendingUntil=0}
function setPending(id){pendingAppointmentId=id||'';pendingUntil=Date.now()+120000}
function pendingId(){return pendingAppointmentId&&Date.now()<pendingUntil?pendingAppointmentId:''}
function stateFor(a){return paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments})}
function datePart(value=''){return String(value||'').match(/^(\d{4}-\d{2}-\d{2})/)?.[1]||''}
function validForPatient(a){const p=patientById(a?.patientId);if(!p||p.status!=='Encerrado')return true;const end=datePart(p.careEndedAt)||datePart(p.careEndedRecordedAt)||datePart(p.updatedAt);return !end||!a?.date||a.date<end}

function upsertBadge(host,className,state,attribute='data-rm-payment-badge'){
  if(!host)return null;
  let badge=host.querySelector(`[${attribute}]`);
  if(!badge){badge=document.createElement('span');badge.setAttribute(attribute,'1');host.appendChild(badge)}
  badge.className=`${className} ${state.code}`;
  badge.textContent=`${state.symbol} ${state.label}`;
  badge.title=`Pagamento: ${state.label}`;
  return badge;
}

function decoratePatientTimeline(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='timeline')return;
  document.querySelectorAll('.patient-session-row').forEach(row=>{
    const id=row.querySelector('[data-action="appointment-manage"][data-id]')?.dataset.id,a=appointmentById(id);
    if(!a)return;
    const state=stateFor(a),host=row.querySelector('.patient-session-statuses');
    row.dataset.paymentState=state.code;
    upsertBadge(host,'patient-session-payment',state);
  });
}

function decorateAgenda(){
  if(runtime.locked||runtime.route!=='agenda')return;
  document.querySelectorAll('.week-event[data-id]').forEach(card=>{
    const a=appointmentById(card.dataset.id);if(!a)return;
    const state=stateFor(a);
    card.dataset.paymentState=state.code;
    card.classList.remove('payment-paid','payment-unpaid','payment-pending','payment-none');
    card.classList.add(`payment-${state.code}`);
    let pill=card.querySelector('[data-rm-week-payment]');
    if(!pill){pill=document.createElement('span');pill.dataset.rmWeekPayment='1';pill.className='week-payment-pill';card.appendChild(pill)}
    pill.className=`week-payment-pill ${state.code}`;
    pill.textContent=state.code==='none'?'—':state.label;
    pill.title=`Pagamento: ${state.label}`;
    const base=card.dataset.rmPaymentBaseTitle||card.getAttribute('title')||'';
    if(!card.dataset.rmPaymentBaseTitle)card.dataset.rmPaymentBaseTitle=base;
    card.title=`${base}${base?' · ':''}Pagamento: ${state.label}`;
    const manage=card.querySelector('[data-action="appointment-manage"]');
    if(manage){manage.dataset.paymentState=state.code;manage.title=`Gerenciar sessão · Pagamento: ${state.label}`}
  });
}

function decorateDashboard(){
  if(runtime.locked||runtime.route!=='today')return;
  const card=[...document.querySelectorAll('#main-content .card')].find(node=>node.querySelector('h3')?.textContent?.trim()==='Agenda próxima');
  if(!card)return;
  const today=todayISO(),upcoming=arr(data.appointments).filter(a=>a?.date>=today&&a?.status!=='Cancelada'&&validForPatient(a)).sort((a,b)=>(String(a.date||'')+String(a.time||'')).localeCompare(String(b.date||'')+String(b.time||''))).slice(0,6);
  const rows=[...card.querySelectorAll('.list > .list-item')];
  rows.forEach((row,index)=>{
    const a=upcoming[index];if(!a)return;
    const host=row.lastElementChild,state=stateFor(a);
    row.dataset.paymentState=state.code;
    upsertBadge(host,'dashboard-payment-badge',state,'data-rm-dashboard-payment');
  });
}

function currentAppointment(patientId){
  const today=todayISO();
  return arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date&&a.date<=today&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou').sort((a,b)=>`${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`))[0]||null;
}

function decorateSessionFlow(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='atendimento')return;
  const p=selectedPatient(),a=p?currentAppointment(p.id):null;if(!a)return;
  const stepper=q('#patient-tab-content .rm-session-flow-v320'),card=stepper?.nextElementSibling?.querySelector('.card');if(!card)return;
  const state=stateFor(a);
  let badge=card.querySelector('[data-rm-focus-payment]');
  if(!badge){badge=document.createElement('span');badge.dataset.rmFocusPayment='1';const title=card.querySelector('h3');title?.insertAdjacentElement('afterend',badge)}
  badge.className=`session-focus-payment ${state.code}`;
  badge.textContent=`Pagamento: ${state.label}`;
}

function decorateManage(id){
  const a=appointmentById(id);if(!a)return;
  const modal=q('#modal-root .modal'),summary=modal?.querySelector('.appointment-action-summary');if(!summary)return;
  const state=stateFor(a);
  let box=summary.querySelector('[data-rm-payment-summary]');
  if(!box){box=document.createElement('div');box.dataset.rmPaymentSummary='1';const label=document.createElement('span'),strong=document.createElement('strong');label.textContent='Pagamento';box.append(label,strong);summary.appendChild(box)}
  const strong=box.querySelector('strong');if(strong){strong.className=`appointment-payment-value ${state.code}`;strong.textContent=state.label}
  const button=modal.querySelector(`[data-action="appointment-payment-v240"][data-id="${CSS.escape(String(id))}"]`);
  if(button){button.classList.remove('payment-action-paid','payment-action-unpaid','payment-action-pending');button.classList.add(`payment-action-${state.code}`);button.textContent=state.code==='paid'?'Pagamento: Pago':state.code==='pending'?'Pagamento: Pendente':'Registrar pagamento'}
}

function decoratePaymentForm(){
  const form=q('#pay-id')?.closest('.modal-body');if(!form)return;
  const id=q('#pay-id')?.value||'',prior=arr(data.payments).find(p=>p?.id===id),linkId=pendingId()||prior?.appointmentId||'',a=appointmentById(linkId);
  let note=form.querySelector('[data-rm-payment-link-note]');
  if(!a){note?.remove();return}
  if(!note){note=document.createElement('div');note.dataset.rmPaymentLinkNote='1';note.className='notice success mt-12';const patientField=q('#pay-patient')?.closest('.field');patientField?.insertAdjacentElement('afterend',note)}
  note.textContent=`Vinculado à sessão de ${a.date?.split('-').reverse().join('/')||'—'} às ${a.time||'—'}.`;
}

async function savePaymentOverride(){
  if(!runtime.key)throw new Error('Sessão encerrada. Entre novamente.');
  const id=q('#pay-id')?.value||uid('pay'),patientId=q('#pay-patient')?.value||'';
  if(!patientId)throw new Error('Selecione explicitamente o paciente.');
  const prior=arr(data.payments).find(p=>p?.id===id)||null,date=q('#pay-date')?.value||'',note=sanitizeText(q('#pay-note')?.value),pending=pendingId(),pendingAppointment=appointmentById(pending);
  const explicitLink=pendingAppointment?.patientId===patientId?pending:(prior?.appointmentId||'');
  const appointmentId=inferAppointmentIdForPayment({...(prior||{}),patientId,date,note,appointmentId:explicitLink},data.appointments);
  const obj={...(prior||{}),id,patientId,date,value:Number(q('#pay-value')?.value)||0,status:q('#pay-status')?.value||'Pago',method:q('#pay-method')?.value||'Pix',note,createdAt:prior?.createdAt||nowISO()};
  if(appointmentId)obj.appointmentId=appointmentId;else delete obj.appointmentId;
  obj.updatedAt=nowISO();
  const list=data.payments||(data.payments=[]),index=list.findIndex(item=>item?.id===id);if(index>=0)list[index]=obj;else list.push(obj);
  await putEncrypted('payments',obj,runtime.key);
  clearPending();closeModal();window.__rmRender?.();
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'payments',id:obj.id,kind:'payment-save-v322',at:obj.updatedAt}}));
  toast(appointmentId?'Lançamento salvo e vinculado à sessão.':'Lançamento salvo.','success');
}

async function backfillPaymentLinks(){
  if(backfillRunning||runtime.locked||!runtime.key||!runtime.dataReady)return;
  backfillRunning=true;let changed=0;
  try{
    for(const payment of arr(data.payments)){
      if(payment?.appointmentId||arr(payment?.appointmentIds).length||payment?.clinicalSessionId)continue;
      const appointmentId=inferAppointmentIdForPayment(payment,data.appointments);if(!appointmentId)continue;
      payment.appointmentId=appointmentId;payment.paymentLinkSource='appointment-auto-v322';payment.updatedAt=nowISO();
      await putEncrypted('payments',payment,runtime.key);changed++;
    }
    if(changed){document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'payments',kind:'payment-backfill-v322',count:changed,at:nowISO()}}));window.__rmRender?.()}
  }catch(error){console.warn('Associação histórica de pagamentos não concluída.',error)}finally{backfillRunning=false}
}

function decorateAll(){decoratePatientTimeline();decorateAgenda();decorateDashboard();decorateSessionFlow()}

document.addEventListener('rm:rendered',()=>queueMicrotask(decorateAll));
document.addEventListener('rm:data-ready',()=>{setTimeout(()=>void backfillPaymentLinks(),250);setTimeout(decorateAll,0)});
document.addEventListener('click',event=>{
  const element=event.target.closest?.('[data-action]');if(!element)return;
  const action=element.dataset.action;
  if(action==='appointment-payment-v240'){
    setPending(element.dataset.id||'');
    setTimeout(decoratePaymentForm,0);setTimeout(decoratePaymentForm,90);
    return;
  }
  if(action==='appointment-manage'){
    const id=element.dataset.id||'';setTimeout(()=>decorateManage(id),0);setTimeout(()=>decorateManage(id),80);return;
  }
  if(action==='new-payment'){
    if(!pendingId())clearPending();setTimeout(decoratePaymentForm,0);setTimeout(decoratePaymentForm,80);return;
  }
  if(action==='edit-payment'){
    clearPending();setTimeout(decoratePaymentForm,0);setTimeout(decoratePaymentForm,80);return;
  }
  if(action==='close-modal'){
    if(q('#pay-id'))clearPending();return;
  }
  if(action==='save-payment'){
    event.preventDefault();event.stopImmediatePropagation();
    void savePaymentOverride().catch(error=>toast(error.message||'Não foi possível salvar o pagamento.','error'));
  }
},true);

window.__rmSessionPayments={version:VERSION,stateForAppointment:id=>{const a=appointmentById(id);return a?stateFor(a):null},backfill:backfillPaymentLinks};
