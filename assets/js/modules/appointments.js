import {data,patientById,todayISO} from '../state.js';
import {pageHead,esc,fmtDate} from '../ui.js';
import {paymentStateForAppointment} from '../payment-status-v322.mjs';

const DAY_NAMES=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const START_HOUR=6;
const END_HOUR=23;
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
function isoDate(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return`${y}-${m}-${d}`}
function mondayOf(value){const d=new Date(`${value}T12:00:00`),shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d}
function minutesFromStart(time='00:00'){const [h,m]=String(time||'00:00').split(':').map(Number);return(h-START_HOUR)*60+m}
function eventClass(a){if(a?.attendanceStatus==='Faltou')return'missed';if(a?.attendanceStatus==='Desmarcou')return'cancelled';if(a?.attendanceStatus==='Presente')return'done';const status=a?.status||'';return status==='Confirmada'?'confirmed':status==='Realizada'?'done':status==='Cancelada'?'cancelled':'pending'}
function sessionState(a){return a?.attendanceStatus||a?.status||'Aguardando confirmação'}
function patientDisplayName(p,fallback='Compromisso'){return String(p?.preferredName||p?.name||fallback||'Compromisso').trim()||fallback}
function agendaDisplayName(p,fallback='Compromisso'){const preferred=String(p?.preferredName||'').trim();if(preferred)return preferred;const full=String(p?.name||fallback||'Compromisso').trim();const parts=full.split(/\s+/).filter(Boolean);return parts.length>2?`${parts[0]} ${parts.at(-1)}`:full}
function datePart(value=''){const m=String(value||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?.[1]||''}
function validForPatient(a){const p=patientById(a?.patientId);if(!p||!['Encerrado','Inativo'].includes(p.status))return true;const end=datePart(p.careEndedAt)||datePart(p.careEndedRecordedAt)||datePart(p.updatedAt);return !end||!a?.date||a.date<end}
function paymentState(a){return paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments})}

export function renderAppointments(){
  const offset=Number(localStorage.getItem('rm.agenda.weekOffset')||0);
  const monday=addDays(mondayOf(todayISO()),offset*7);
  const days=Array.from({length:7},(_,i)=>addDays(monday,i));
  const first=isoDate(days[0]),last=isoDate(days[6]);
  const list=arr(data.appointments).filter(a=>a?.date&&a.date>=first&&a.date<=last&&validForPatient(a)).sort((a,b)=>(String(a.date)+String(a.time||'')).localeCompare(String(b.date)+String(b.time||'')));
  const hours=Array.from({length:END_HOUR-START_HOUR+1},(_,i)=>START_HOUR+i);
  const grid=`<div class="week-calendar-wrap"><div class="week-calendar"><div class="week-head week-time-head">Horário</div>${days.map((d,i)=>`<div class="week-head ${isoDate(d)===todayISO()?'today':''}"><strong>${DAY_NAMES[i]}</strong><span>${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}</span></div>`).join('')}<div class="week-time-column">${hours.map(h=>`<div class="week-hour">${String(h).padStart(2,'0')}:00</div>`).join('')}</div>${days.map(d=>{const date=isoDate(d),items=list.filter(a=>a?.date===date);return`<div class="week-day-column ${date===todayISO()?'today':''}" data-agenda-date="${date}" title="Clique em um horário vazio para agendar">${items.map(a=>{const p=patientById(a.patientId),top=Math.max(0,minutesFromStart(a.time)),height=Math.max(48,Math.min(Number(a.duration)||50,180)),fullName=patientDisplayName(p,a.title||'Compromisso'),displayName=agendaDisplayName(p,a.title||'Compromisso'),eventLabel=`T – ${displayName}`,state=sessionState(a),payment=paymentState(a);return`<button class="week-event ${eventClass(a)} payment-${esc(payment.code)}" type="button" style="top:${top}px;height:${height}px" data-action="appointment-open" data-id="${esc(a.id)}" aria-label="Abrir sessão de ${esc(fullName)} às ${esc(a.time||'')} · ${esc(state)} · pagamento ${esc(payment.label)}" title="${esc(fullName)} · ${esc(a.time||'')} · ${esc(state)} · ${esc(payment.label)}"><strong data-sensitive>${esc(eventLabel)}</strong><span class="week-event-time">${esc(a.time||'')}</span>${height>=48?`<span class="week-event-state">${esc(state)}</span>`:''}<span class="week-payment-pill ${esc(payment.code)}">${esc(payment.label)}</span></button>`}).join('')}</div>`}).join('')}</div></div>`;
  return pageHead('Agenda',`Semana de ${fmtDate(first)} a ${fmtDate(last)}`,`<button class="btn" data-action="new-appointment">Nova sessão</button>`)+`<section class="agenda-toolbar card"><div class="flex gap-8 wrap"><button class="btn secondary" data-action="agenda-prev-week">← Semana anterior</button><button class="btn secondary" data-action="agenda-today">Semana atual</button><button class="btn secondary" data-action="agenda-next-week">Próxima semana →</button></div><div class="small muted"><strong>${list.length}</strong> compromisso(s) nesta semana · clique na sessão para presença, agenda, clínica e financeiro</div></section>${grid}`;
}
