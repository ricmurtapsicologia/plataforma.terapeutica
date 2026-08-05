import {data,runtime,patientById,nowISO} from './state.js';
import {putEncrypted} from './database.js';
import {openWhatsApp} from './communications.js';
import {fmtDate,toast} from './ui.js';

/* Agenda — ergonomia, clareza e ações mobile-first v1.7.9 */
const ACTIONS=[
  {
    selector:'.week-wa',
    label:'Confirmar sessão pelo WhatsApp',
    short:'WhatsApp',
    detail:'Confirmar sessão',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"/><path d="M9.2 8.8c.5 2.3 1.8 3.7 4.1 4.7"/><path d="m13.2 13.5 1.5-1.1 1.8.8-.2 1.8c-.3.5-1 .8-1.6.7-4.5-.7-6.9-3.1-7.6-7.6-.1-.6.2-1.3.7-1.6l1.8-.2.8 1.8-1.2 1.5"/></svg>'
  },
  {
    selector:'.week-manage',
    label:'Gerenciar sessão: remarcar, presença, pagamento e registro',
    short:'Gerenciar',
    detail:'Remarcar e administrar',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3.5 6 1 1 2-2"/><path d="m3.5 12 1 1 2-2"/><path d="m3.5 18 1 1 2-2"/></svg>'
  },
  {
    selector:'.week-delete',
    label:'Excluir agendamento',
    short:'Excluir',
    detail:'Remover horário',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6 18 21H6L5 6"/><path d="M10 10v7"/><path d="M14 10v7"/></svg>'
  }
];

const WHATSAPP_ACTIONS=new Set(['appointment-whatsapp','appointment-whatsapp-6h','session-reminder-whatsapp']);
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];

function appointmentById(id){return arr(data.appointments).find(a=>a?.id===id)||null}
function patientForAppointment(a){return a?patientById(a.patientId):null}
function firstName(p){return String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'Olá'}

function confirmationMessage(a,p){
  return `Olá, ${firstName(p)}. Confirmando nossa sessão marcada para ${fmtDate(a.date)}, às ${a.time}. Nosso horário está reservado.\n\nPor gentileza, confirme o recebimento desta mensagem.\n\nRichelmy Murta — Psicólogo Clínico.`;
}

function sendSessionConfirmation(id){
  const a=appointmentById(id),p=patientForAppointment(a);
  if(!a||!p?.phone)throw new Error('Paciente ou telefone não localizado.');
  openWhatsApp(p.phone,confirmationMessage(a,p));
  a.reminderPreparedAt=nowISO();
  a.confirmationPreparedAt=a.reminderPreparedAt;
  if(runtime.key)putEncrypted('appointments',a,runtime.key).catch(console.error);
}

function cleanActionButtons(root=document){
  root.querySelectorAll('.week-event-actions .week-register').forEach(button=>{
    button.hidden=true;
    button.setAttribute('aria-hidden','true');
    button.tabIndex=-1;
  });
  root.querySelectorAll('.week-event-actions .week-mini').forEach(button=>{
    const visible=ACTIONS.some(action=>button.matches(action.selector));
    if(!visible&&!button.classList.contains('week-register')){
      button.hidden=true;
      button.setAttribute('aria-hidden','true');
      button.tabIndex=-1;
    }
  });
}

function enhanceActionButtons(root=document){
  ACTIONS.forEach(action=>{
    root.querySelectorAll(action.selector).forEach(button=>{
      button.innerHTML=action.icon;
      button.setAttribute('aria-label',action.label);
      button.setAttribute('title',action.label);
      button.dataset.actionLabel=action.label;
    });
  });
}

function legendMarkup(){
  return `<section class="agenda-action-legend" id="agenda-action-legend" aria-label="Ações disponíveis nos horários"><div class="agenda-action-legend-head"><strong>Ações do horário</strong><span>Use os ícones do cartão para confirmar, gerenciar ou excluir. Para remarcar, abra Gerenciar ou toque no cartão.</span></div><div class="agenda-action-list">${ACTIONS.map(action=>`<div class="agenda-action-key ${action.selector.slice(1)}"><span class="agenda-action-icon">${action.icon}</span><span class="agenda-action-copy"><strong>${action.short}</strong><span>${action.detail}</span></span></div>`).join('')}</div></section>`;
}

function ensureLegend(){
  if(!document.querySelector('.week-calendar-wrap')||document.getElementById('agenda-action-legend'))return;
  const toolbar=document.querySelector('.agenda-toolbar');
  if(toolbar)toolbar.insertAdjacentHTML('afterend',legendMarkup());
}

function improveAgendaCopy(){
  const summary=document.querySelector('.agenda-toolbar>.small');
  if(!summary)return;
  const count=String(summary.querySelector('strong')?.textContent||'0').trim();
  const singular=count==='1';
  summary.innerHTML=`<strong>${count}</strong> ${singular?'compromisso agendado':'compromissos agendados'} nesta semana. Toque em um horário vazio para criar uma nova sessão.`;
}

function improveConfirmationCopy(){
  document.querySelectorAll('[data-action="session-reminder-whatsapp"]:not(.week-mini)').forEach(button=>{
    button.textContent='Confirmar sessão';
    button.setAttribute('title','Confirmar sessão pelo WhatsApp');
  });
  document.querySelectorAll('.smart-alert-item.session-soon .small.muted').forEach(text=>{
    text.textContent=text.textContent.replace(/lembrete disponível para envio\.?/i,'confirmação disponível para envio.');
  });
}

function enhanceInterface(){
  improveConfirmationCopy();
  if(!document.querySelector('.week-calendar-wrap'))return;
  cleanActionButtons();
  enhanceActionButtons();
  ensureLegend();
  improveAgendaCopy();
}

document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-action]');
  if(!el||!WHATSAPP_ACTIONS.has(el.dataset.action))return;
  e.preventDefault();
  e.stopImmediatePropagation();
  try{
    sendSessionConfirmation(el.dataset.id);
  }catch(err){
    toast(err.message||'Não foi possível preparar a confirmação.','error');
    console.error(err);
  }
},true);

document.addEventListener('rm:rendered',()=>queueMicrotask(enhanceInterface));
document.addEventListener('rm:app-ready',()=>setTimeout(enhanceInterface,80));
document.addEventListener('rm:data-ready',()=>setTimeout(enhanceInterface,80));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(enhanceInterface,120));
else setTimeout(enhanceInterface,120);
