import {data,patientById,todayISO} from '../state.js';
import {pageHead,badge,empty,esc,fmtDate} from '../ui.js';

const DAY_NAMES=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const START_HOUR=7;
const END_HOUR=21;

function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
function isoDate(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`}
function mondayOf(value){const d=new Date(`${value}T12:00:00`),shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d}
function minutesFromStart(time='00:00'){const [h,m]=time.split(':').map(Number);return(h-START_HOUR)*60+m}
function eventClass(status=''){return status==='Confirmada'?'confirmed':status==='Realizada'?'done':status==='Cancelada'?'cancelled':'pending'}

export function renderAppointments(){
  const offset=Number(localStorage.getItem('rm.agenda.weekOffset')||0);
  const monday=addDays(mondayOf(todayISO()),offset*7);
  const days=Array.from({length:7},(_,i)=>addDays(monday,i));
  const first=isoDate(days[0]),last=isoDate(days[6]);
  const list=[...(data.appointments||[])].filter(a=>a.date>=first&&a.date<=last).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const hours=Array.from({length:END_HOUR-START_HOUR+1},(_,i)=>START_HOUR+i);

  const grid=`<div class="week-calendar-wrap"><div class="week-calendar">
    <div class="week-head week-time-head">Horário</div>
    ${days.map((d,i)=>`<div class="week-head ${isoDate(d)===todayISO()?'today':''}"><strong>${DAY_NAMES[i]}</strong><span>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</span></div>`).join('')}
    <div class="week-time-column">${hours.map(h=>`<div class="week-hour">${String(h).padStart(2,'0')}:00</div>`).join('')}</div>
    ${days.map(d=>{const date=isoDate(d),items=list.filter(a=>a.date===date);return`<div class="week-day-column ${date===todayISO()?'today':''}">${items.map(a=>{const p=patientById(a.patientId),top=Math.max(0,minutesFromStart(a.time)),height=Math.max(34,Math.min(Number(a.duration)||50,180));return`<article class="week-event ${eventClass(a.status)}" style="top:${top}px;height:${height}px" data-action="edit-appointment" data-id="${a.id}" title="${esc(p?.name||'Compromisso')} · ${esc(a.time)}"><div class="week-event-time">${esc(a.time)}</div><strong data-sensitive>${esc(p?.preferredName||p?.name||a.title||'Compromisso')}</strong><div class="week-event-meta">${esc(a.modality||'')} · ${esc(a.status||'')}</div><div class="week-event-actions">${p?.phone&&a.status!=='Cancelada'?`<button class="week-mini week-wa" type="button" data-action="appointment-whatsapp" data-id="${a.id}" title="Lembrar no WhatsApp">WA</button>`:''}<button class="week-mini week-delete" type="button" data-action="delete-appointment" data-id="${a.id}" title="Excluir agendamento">×</button></div></article>`}).join('')}</div>`}).join('')}
  </div></div>`;

  return pageHead('Agenda',`Semana de ${fmtDate(first)} a ${fmtDate(last)}`,`<button class="btn" data-action="new-appointment">Nova sessão</button>`)+
  `<section class="agenda-toolbar card"><div class="flex gap-8 wrap"><button class="btn secondary" data-action="agenda-prev-week">← Semana anterior</button><button class="btn secondary" data-action="agenda-today">Semana atual</button><button class="btn secondary" data-action="agenda-next-week">Próxima semana →</button></div><div class="small muted"><strong>${list.length}</strong> compromisso(s) nesta semana</div></section>`+
  grid+
  `<section class="card mt-16"><div class="card-title"><div><h3 class="mb-0">Sessões da semana</h3><div class="small muted">Edição, comunicação e exclusão sem sair da agenda.</div></div></div>${list.length?`<div class="list">${list.map(a=>{const p=patientById(a.patientId);return`<div class="agenda-item"><div class="agenda-time">${fmtDate(a.date)}<br>${esc(a.time)}</div><div><strong data-sensitive>${esc(p?.name||a.title||'Compromisso')}</strong><div class="small muted">${esc(a.modality||'')} · ${a.recurrence&&a.recurrence!=='Avulso'&&a.recurrence!=='Nenhuma'?esc(a.recurrence):'Avulso'}</div></div><div class="flex gap-8 wrap items-center">${badge(a.status)}<button class="btn ghost" data-action="edit-appointment" data-id="${a.id}">Editar</button>${p?.phone?`<button class="btn ghost" data-action="appointment-whatsapp" data-id="${a.id}">WhatsApp</button>`:''}<button class="btn ghost danger-text" data-action="delete-appointment" data-id="${a.id}">Excluir</button>${a.seriesId?`<button class="btn ghost danger-text" data-action="delete-appointment-series" data-series="${a.seriesId}">Excluir série</button>`:''}</div></div>`}).join('')}</div>`:empty('Semana livre','Nenhuma sessão cadastrada nesta semana.',`<button class="btn mt-12" data-action="new-appointment">Agendar sessão</button>`)}</section>`;
}
