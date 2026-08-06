import {data,runtime,patientById,todayISO,nowISO} from './state.js';
import {putEncrypted} from './database.js';
import {openWhatsApp} from './communications.js';
import {esc,fmtDate,toast} from './ui.js';

/* v1.8.1 — otimização controlada de UX sem alterar o modelo de dados */
const WEEK_START_HOUR=6;
const WEEK_END_HOUR=23;
const SLOT_MINUTES=30;
const ACTIONS=[
  {
    selector:'.week-wa',
    label:'Confirmar sessão pelo WhatsApp',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"/><path d="M9.2 8.8c.5 2.3 1.8 3.7 4.1 4.7"/><path d="m13.2 13.5 1.5-1.1 1.8.8-.2 1.8c-.3.5-1 .8-1.6.7-4.5-.7-6.9-3.1-7.6-7.6-.1-.6.2-1.3.7-1.6l1.8-.2.8 1.8-1.2 1.5"/></svg>'
  },
  {
    selector:'.week-manage',
    label:'Gerenciar sessão',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3.5 6 1 1 2-2"/><path d="m3.5 12 1 1 2-2"/><path d="m3.5 18 1 1 2-2"/></svg>'
  },
  {
    selector:'.week-delete',
    label:'Excluir agendamento',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6 18 21H6L5 6"/><path d="M10 10v7"/><path d="M14 10v7"/></svg>'
  }
];
const WHATSAPP_ACTIONS=new Set(['appointment-whatsapp','appointment-whatsapp-6h','session-reminder-whatsapp']);
const PATIENT_GROUPS=[
  {id:'overview',label:'Visão geral',tabs:['summary']},
  {id:'clinical',label:'Clínica',tabs:['atendimento','timeline','records','notes','formulation','plans']},
  {id:'interventions',label:'Intervenções',tabs:['tasks','materials']},
  {id:'documents',label:'Documentos',tabs:['documents']},
  {id:'admin',label:'Administrativo',tabs:['communications','consents','finance']}
];
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const datePart=value=>String(value||'').match(/^(\d{4}-\d{2}-\d{2})/)?.[1]||'';
function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
function isoDate(date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function mondayOf(value){const d=new Date(`${value}T12:00:00`),shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d}
function appointmentById(id){return arr(data.appointments).find(a=>a?.id===id)||null}
function patientForAppointment(a){return a?patientById(a.patientId):null}
function firstName(p){return String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'Olá'}
function validForPatient(a){const p=patientForAppointment(a);if(!p||p.status!=='Encerrado')return true;const end=datePart(p.careEndedAt)||datePart(p.careEndedRecordedAt)||datePart(p.updatedAt);return !end||!a?.date||a.date<end}
function sessionState(a){return a?.attendanceStatus||a?.status||'Aguardando confirmação'}
function naturalDate(value){const d=new Date(`${value}T12:00:00`),now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),target=new Date(d.getFullYear(),d.getMonth(),d.getDate()),diff=Math.round((target-today)/86400000),date=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});if(diff===0)return`hoje, ${date}`;if(diff===1)return`amanhã, ${date}`;const wd=d.toLocaleDateString('pt-BR',{weekday:'long'});return`${wd.charAt(0).toUpperCase()+wd.slice(1)}, ${date}`}
function naturalTime(value=''){const [h='00',m='00']=String(value).split(':');return m==='00'?`${Number(h)}h`:`${h}:${m}`}
function confirmationMessage(a,p){return`Olá, ${firstName(p)}!\n\nSua sessão está agendada para:\n${naturalDate(a.date)}, às ${naturalTime(a.time)}.\n\nPara confirmar sua presença, responda: *Confirmo*.\n\nRichelmy Murta — Psicólogo Clínico`}
function sendSessionConfirmation(id){const a=appointmentById(id),p=patientForAppointment(a);if(!a||!p?.phone)throw new Error('Paciente ou telefone não localizado.');openWhatsApp(p.phone,confirmationMessage(a,p));a.reminderPreparedAt=nowISO();a.confirmationPreparedAt=a.reminderPreparedAt;if(runtime.key)putEncrypted('appointments',a,runtime.key).catch(console.error)}
function triggerCoreAction(action,id=''){const button=document.createElement('button');button.type='button';button.dataset.action=action;if(id)button.dataset.id=id;button.hidden=true;document.body.appendChild(button);button.click();button.remove()}
function setField(selector,value){const el=document.querySelector(selector);if(!el||value===undefined||value===null)return;el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}))}
function openAppointmentAt(date,time=''){triggerCoreAction('new-appointment');const fill=()=>{setField('#a-date',date);if(time)setField('#a-time',time)};setTimeout(fill,0);setTimeout(fill,90)}
function slotFromWeekClick(column,event){const rect=column.getBoundingClientRect(),y=Math.max(0,Math.min(rect.height-1,event.clientY-rect.top));let minutes=WEEK_START_HOUR*60+Math.round(y/SLOT_MINUTES)*SLOT_MINUTES;minutes=Math.max(WEEK_START_HOUR*60,Math.min(WEEK_END_HOUR*60,minutes));return`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`}

function enhanceWeekActions(){
  document.getElementById('agenda-action-legend')?.remove();
  document.querySelectorAll('.week-event-actions .week-register').forEach(button=>{button.hidden=true;button.setAttribute('aria-hidden','true');button.tabIndex=-1});
  ACTIONS.forEach(action=>document.querySelectorAll(action.selector).forEach(button=>{button.innerHTML=action.icon;button.setAttribute('aria-label',action.label);button.setAttribute('title',action.label)}));
  document.querySelectorAll('.week-event').forEach(card=>card.setAttribute('title','Abrir ou remarcar sessão'));
  const summary=document.querySelector('.agenda-toolbar>.small');if(summary){const count=String(summary.querySelector('strong')?.textContent||'0').trim();summary.innerHTML=`<strong>${esc(count)}</strong> ${count==='1'?'compromisso agendado':'compromissos agendados'} nesta semana · horários das 06:00 às 23:00.`}
}

function agendaWeekBounds(){const offset=Number(localStorage.getItem('rm.agenda.weekOffset')||0),monday=addDays(mondayOf(todayISO()),offset*7);return{first:isoDate(monday),last:isoDate(addDays(monday,6))}}
function selectedAgendaDay(){const {first,last}=agendaWeekBounds(),saved=localStorage.getItem('rm.agenda.mobileDay')||'',today=todayISO();if(saved>=first&&saved<=last)return saved;if(today>=first&&today<=last)return today;return first}
function dayTitle(value){const d=new Date(`${value}T12:00:00`);const weekday=d.toLocaleDateString('pt-BR',{weekday:'long'}),date=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});return`${weekday.charAt(0).toUpperCase()+weekday.slice(1)} · ${date}`}
function renderDayAgenda(){
  if(runtime.route!=='agenda')return;
  const wrap=document.querySelector('.week-calendar-wrap');if(!wrap)return;
  let day=document.getElementById('rm-day-agenda');if(!day){day=document.createElement('section');day.id='rm-day-agenda';day.className='rm-day-agenda';wrap.insertAdjacentElement('beforebegin',day)}
  const selected=selectedAgendaDay(),{first,last}=agendaWeekBounds();
  const list=arr(data.appointments).filter(a=>a?.date===selected&&a.status!=='Cancelada'&&validForPatient(a)).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
  day.innerHTML=`<div class="rm-day-nav"><button class="icon-btn" type="button" data-rm-day-shift="-1" ${selected<=first?'disabled':''} aria-label="Dia anterior">←</button><div class="rm-day-date">${esc(dayTitle(selected))}</div><button class="icon-btn" type="button" data-rm-day-shift="1" ${selected>=last?'disabled':''} aria-label="Próximo dia">→</button></div><div class="rm-day-list">${list.length?list.map(a=>{const p=patientForAppointment(a),name=firstName(p)||'Compromisso';return`<article class="rm-day-card"><div class="rm-day-card-main"><div class="rm-day-time">${esc(a.time||'—')}</div><div><div class="rm-day-name" data-sensitive>${esc(name)}</div><div class="rm-day-meta">${esc(sessionState(a))} · ${esc(a.modality||'')}</div></div></div><div class="rm-day-actions">${p?.phone?`<button class="btn secondary" type="button" data-action="appointment-whatsapp" data-id="${esc(a.id)}">Confirmar</button>`:''}<button class="btn" type="button" data-action="appointment-manage" data-id="${esc(a.id)}">Gerenciar</button></div></article>`}).join(''):`<div class="rm-day-empty"><strong>Sem sessões neste dia.</strong><div class="small">A agenda semanal permanece disponível das 06:00 às 23:00.</div></div>`}</div><button class="btn rm-day-new" type="button" data-rm-day-new="${esc(selected)}">Nova sessão neste dia</button>`;
}
function ensureAgendaMode(){
  if(runtime.route!=='agenda'){document.body.classList.remove('rm-agenda-day','rm-agenda-week');return}
  const toolbar=document.querySelector('.agenda-toolbar');if(!toolbar)return;
  let controls=document.querySelector('.agenda-mobile-controls');if(!controls){controls=document.createElement('div');controls.className='agenda-mobile-controls';controls.setAttribute('aria-label','Visualização da agenda');controls.innerHTML='<button type="button" data-rm-agenda-view="day">Dia</button><button type="button" data-rm-agenda-view="week">Semana</button>';toolbar.insertAdjacentElement('afterend',controls)}
  const mode=localStorage.getItem('rm.agenda.mobileMode')||'day';document.body.classList.toggle('rm-agenda-day',mode==='day');document.body.classList.toggle('rm-agenda-week',mode==='week');controls.querySelectorAll('[data-rm-agenda-view]').forEach(b=>b.classList.toggle('active',b.dataset.rmAgendaView===mode));renderDayAgenda()
}

function ensurePatientGroupNav(){
  if(runtime.route!=='patients')return;const tabs=document.querySelector('.tabs');if(!tabs)return;
  const active=tabs.querySelector('.tab.active')?.dataset.tab||'summary';const currentGroup=PATIENT_GROUPS.find(g=>g.tabs.includes(active))||PATIENT_GROUPS[0];
  let nav=document.querySelector('.patient-nav-groups');if(!nav){nav=document.createElement('nav');nav.className='patient-nav-groups';nav.setAttribute('aria-label','Áreas do paciente');tabs.insertAdjacentElement('beforebegin',nav)}
  nav.innerHTML=PATIENT_GROUPS.map(g=>`<button type="button" class="patient-nav-group ${g.id===currentGroup.id?'active':''}" data-rm-patient-group="${g.id}">${esc(g.label)}</button>`).join('');
  tabs.querySelectorAll('.tab').forEach(tab=>{tab.hidden=!currentGroup.tabs.includes(tab.dataset.tab)});
}

function ensureNextAppointment(){
  if(runtime.route!=='today')return;const main=document.getElementById('main-content'),head=main?.querySelector('.page-head');if(!main||!head||document.getElementById('rm-next-appointment'))return;
  const today=todayISO(),upcoming=arr(data.appointments).filter(a=>a?.date>=today&&a.status!=='Cancelada'&&validForPatient(a)).sort((a,b)=>(String(a.date)+String(a.time||'')).localeCompare(String(b.date)+String(b.time||''))),a=upcoming[0];if(!a)return;
  const p=patientForAppointment(a),card=document.createElement('section');card.id='rm-next-appointment';card.className='card rm-next-appointment';card.innerHTML=`<div><div class="eyebrow">Próxima sessão</div><div class="rm-next-time">${esc(a.time||'—')}</div><div class="rm-next-name" data-sensitive>${esc(firstName(p)||'Paciente')}</div><div class="small muted">${esc(fmtDate(a.date))} · ${esc(a.modality||'')}</div></div><div class="rm-next-actions">${p?.phone?`<button class="btn secondary" data-action="appointment-whatsapp" data-id="${esc(a.id)}">Confirmar</button>`:''}<button class="btn" data-action="appointment-manage" data-id="${esc(a.id)}">Gerenciar sessão</button></div>`;head.insertAdjacentElement('afterend',card)
}

function optimize(){if(runtime.locked)return;if(runtime.route==='agenda'){enhanceWeekActions();ensureAgendaMode()}else document.body.classList.remove('rm-agenda-day','rm-agenda-week');ensurePatientGroupNav();ensureNextAppointment()}

document.addEventListener('click',e=>{
  const weekColumn=runtime.route==='agenda'?e.target.closest?.('.week-day-column[data-agenda-date]'):null;
  if(weekColumn&&!e.target.closest('.week-event')&&!e.target.closest('button')){e.preventDefault();e.stopImmediatePropagation();openAppointmentAt(weekColumn.dataset.agendaDate,slotFromWeekClick(weekColumn,e));return}
  const wa=e.target.closest?.('[data-action]');if(wa&&WHATSAPP_ACTIONS.has(wa.dataset.action)){
    e.preventDefault();e.stopImmediatePropagation();try{sendSessionConfirmation(wa.dataset.id)}catch(err){toast(err.message||'Não foi possível preparar a confirmação.','error');console.error(err)}return
  }
  const view=e.target.closest?.('[data-rm-agenda-view]');if(view){e.preventDefault();localStorage.setItem('rm.agenda.mobileMode',view.dataset.rmAgendaView);ensureAgendaMode();return}
  const shift=e.target.closest?.('[data-rm-day-shift]');if(shift&&!shift.disabled){e.preventDefault();const current=selectedAgendaDay(),next=isoDate(addDays(new Date(`${current}T12:00:00`),Number(shift.dataset.rmDayShift||0)));localStorage.setItem('rm.agenda.mobileDay',next);renderDayAgenda();return}
  const add=e.target.closest?.('[data-rm-day-new]');if(add){e.preventDefault();openAppointmentAt(add.dataset.rmDayNew);return}
  const group=e.target.closest?.('[data-rm-patient-group]');if(group){e.preventDefault();const target=PATIENT_GROUPS.find(g=>g.id===group.dataset.rmPatientGroup);if(!target)return;const tabs=document.querySelector('.tabs'),active=tabs?.querySelector('.tab.active')?.dataset.tab;if(target.tabs.includes(active)){ensurePatientGroupNav();return}tabs?.querySelector(`.tab[data-tab="${target.tabs[0]}"]`)?.click();return}
},true);

document.addEventListener('rm:rendered',()=>queueMicrotask(optimize));
document.addEventListener('rm:app-ready',()=>setTimeout(optimize,80));
document.addEventListener('rm:data-ready',()=>setTimeout(optimize,80));
window.addEventListener('resize',()=>{if(runtime.route==='agenda')ensureAgendaMode()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(optimize,120));else setTimeout(optimize,120);
