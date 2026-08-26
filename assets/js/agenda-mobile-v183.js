import {data,runtime,patientById,todayISO} from './state.js';
import {esc} from './ui.js';
import {paymentStateForAppointment} from './payment-status-v322.mjs';

const START_HOUR=6;
const END_HOUR=23;
const PX_PER_HOUR=60;
const TIMELINE_HOURS=(END_HOUR-START_HOUR)+1;
const DAY_NAMES=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];

function addDays(date,days){const d=new Date(date);d.setDate(d.getDate()+days);return d}
function isoDate(date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function mondayOf(value){const d=new Date(`${value}T12:00:00`),shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d}
function datePart(value=''){return String(value||'').match(/^(\d{4}-\d{2}-\d{2})/)?.[1]||''}
function capitalize(value=''){return value?value.charAt(0).toUpperCase()+value.slice(1):''}
function firstName(p,fallback='Compromisso'){const raw=String(p?.preferredName||p?.name||fallback||'Compromisso').trim();return raw.split(/\s+/)[0]||fallback}
function patientDisplayName(p,fallback='Compromisso'){return String(p?.preferredName||p?.name||fallback||'Compromisso').trim()||fallback}
function validForPatient(a){const p=patientById(a?.patientId);if(!p||p.status!=='Encerrado')return true;const end=datePart(p.careEndedAt)||datePart(p.careEndedRecordedAt)||datePart(p.updatedAt);return !end||!a?.date||a.date<end}
function eventClass(a){const attendance=String(a?.attendanceStatus||'').toLowerCase(),status=String(a?.status||'').toLowerCase();if(attendance.includes('presente')||status.includes('realizada'))return'done';if(attendance.includes('falt')||attendance.includes('ausente'))return'missed';if(attendance.includes('cancel')||attendance.includes('desmar')||status.includes('cancel'))return'cancelled';if(status.includes('confirm'))return'confirmed';return'pending'}
function agendaWeek(){const offset=Number(localStorage.getItem('rm.agenda.weekOffset')||0),monday=addDays(mondayOf(todayISO()),offset*7);return Array.from({length:7},(_,i)=>addDays(monday,i))}
function selectedDay(days){const first=isoDate(days[0]),last=isoDate(days[6]),saved=localStorage.getItem('rm.agenda.mobileDay')||'',today=todayISO();if(saved>=first&&saved<=last)return saved;if(today>=first&&today<=last)return today;return first}
function minutesFromStart(time='00:00'){const [h,m]=String(time||'00:00').split(':').map(Number);return((Number.isFinite(h)?h:START_HOUR)-START_HOUR)*60+(Number.isFinite(m)?m:0)}
function monthTitle(days){const first=days[0],last=days[6],m1=capitalize(first.toLocaleDateString('pt-BR',{month:'long'})),m2=capitalize(last.toLocaleDateString('pt-BR',{month:'long'})),year=last.getFullYear();return m1===m2?`${m1} ${year}`:`${m1} / ${m2} ${year}`}
function dayLong(value){const d=new Date(`${value}T12:00:00`);return capitalize(d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'}))}
function allHoursMarkup(){const rows=[];for(let h=START_HOUR;h<=END_HOUR;h++){const top=(h-START_HOUR)*PX_PER_HOUR;rows.push(`<div class="rm-cal-hour" style="top:${top}px"></div>`);rows.push(`<div class="rm-cal-hour-label" style="top:${top}px">${String(h).padStart(2,'0')}:00</div>`);rows.push(`<div class="rm-cal-half" style="top:${top+PX_PER_HOUR/2}px"></div>`)}return rows.join('')}
function nowMarkup(selected){if(selected!==todayISO())return'';const now=new Date(),minutes=(now.getHours()-START_HOUR)*60+now.getMinutes();if(minutes<0||minutes>TIMELINE_HOURS*60)return'';return`<div class="rm-cal-now" style="top:${minutes}px" aria-label="Horário atual"></div>`}
function eventMarkup(a){const p=patientById(a.patientId),top=Math.max(0,Math.min(TIMELINE_HOURS*60-1,minutesFromStart(a.time))),duration=Math.max(30,Math.min(Number(a.duration)||50,180)),maxHeight=Math.max(30,TIMELINE_HOURS*60-top),height=Math.min(duration,maxHeight),displayName=patientDisplayName(p,a.title||'Compromisso'),compactName=firstName(p,a.title||'Compromisso'),state=String(a.attendanceStatus||a.status||'Aguardando confirmação').trim(),payment=paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments}),meta=[state,payment.label].filter(Boolean).join(' · ');return`<button class="rm-cal-event ${eventClass(a)} payment-${esc(payment.code)}" type="button" style="top:${top}px;height:${height}px" data-action="appointment-open" data-id="${esc(a.id)}" aria-label="Abrir sessão de ${esc(displayName)} às ${esc(a.time||'')} · ${esc(meta)}"><span class="rm-cal-event-time">${esc(a.time||'')}</span><span class="rm-cal-event-name" data-sensitive>${esc(compactName)}</span>${height>=58?`<span class="rm-cal-event-meta">${esc(meta)}</span>`:''}<span class="rm-cal-mobile-payment ${esc(payment.code)}">${esc(payment.label)}</span></button>`}

function render(){
  const mobile=matchMedia('(max-width:700px)').matches;
  if(runtime.locked||runtime.route!=='agenda'||!mobile){document.body.classList.remove('rm-agenda-v183');return}
  const content=document.getElementById('main-content');if(!content)return;document.body.classList.add('rm-agenda-v183');
  const days=agendaWeek(),selected=selectedDay(days),items=arr(data.appointments).filter(a=>a?.date===selected&&a.status!=='Cancelada'&&validForPatient(a)).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
  let root=document.getElementById('rm-mobile-timeline-v183');if(!root){root=document.createElement('section');root.id='rm-mobile-timeline-v183';root.setAttribute('aria-label','Agenda diária');content.prepend(root)}
  root.innerHTML=`<div class="rm-cal-top"><div class="rm-cal-toolbar"><button class="rm-cal-navbtn" type="button" data-rm-v183-week="-1" aria-label="Semana anterior">‹</button><div class="rm-cal-month">${esc(monthTitle(days))}</div><div class="rm-cal-actions"><button class="rm-cal-today" type="button" data-rm-v183-today>Hoje</button><button class="rm-cal-viewbtn" type="button" data-rm-v183-week="1" aria-label="Próxima semana">›</button></div></div><div class="rm-cal-week" role="list" aria-label="Dias da semana">${days.map((d,i)=>{const iso=isoDate(d),selectedClass=iso===selected?' is-selected':'',todayClass=iso===todayISO()?' is-today':'';return`<button class="rm-cal-day${selectedClass}${todayClass}" type="button" data-rm-v183-day="${iso}" role="listitem" aria-pressed="${iso===selected?'true':'false'}"><span class="rm-cal-day-name">${DAY_NAMES[i]}</span><span class="rm-cal-day-number">${d.getDate()}</span></button>`}).join('')}</div></div><div class="rm-cal-all-day"><span>Dia todo</span></div><div class="rm-cal-day-title"><strong>${esc(dayLong(selected))}</strong><span>${items.length} ${items.length===1?'compromisso':'compromissos'}</span></div><div class="rm-cal-timeline" aria-label="Horários de 06:00 a 23:00"><div class="rm-cal-axis"></div>${allHoursMarkup()}${items.length?items.map(eventMarkup).join(''):'<div class="rm-cal-empty-note">Sem sessões neste dia.</div>'}${nowMarkup(selected)}</div><button class="rm-cal-add" type="button" data-action="new-appointment" aria-label="Nova sessão">+</button>`;
}
function clickHiddenCore(action){const source=document.querySelector(`[data-action="${action}"]`);if(source){source.click();return true}return false}

document.addEventListener('click',event=>{const day=event.target.closest?.('[data-rm-v183-day]');if(day){event.preventDefault();event.stopPropagation();localStorage.setItem('rm.agenda.mobileDay',day.dataset.rmV183Day);render();return}const week=event.target.closest?.('[data-rm-v183-week]');if(week){event.preventDefault();event.stopPropagation();const delta=Number(week.dataset.rmV183Week||0);clickHiddenCore(delta<0?'agenda-prev-week':'agenda-next-week');setTimeout(render,0);return}const today=event.target.closest?.('[data-rm-v183-today]');if(today){event.preventDefault();event.stopPropagation();localStorage.setItem('rm.agenda.mobileDay',todayISO());clickHiddenCore('agenda-today');setTimeout(render,0);return}},true);
window.addEventListener('resize',render,{passive:true});
window.addEventListener('hashchange',()=>setTimeout(render,0));
document.addEventListener('rm:rendered',()=>setTimeout(render,0));
document.addEventListener('rm:app-ready',()=>setTimeout(render,0));
document.addEventListener('rm:local-data-changed',()=>setTimeout(render,0));
setTimeout(render,120);
