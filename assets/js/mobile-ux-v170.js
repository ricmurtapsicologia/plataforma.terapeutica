import {data,runtime,todayISO,patientById} from './state.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let dataStatus='unknown';
let dataSyncedAt='';
let googleStatus='unknown';

function fmtTime(d=new Date()){return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function fmtShortDate(value){if(!value)return'';const d=new Date(`${value}T12:00:00`);return d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.','')}
function nextAppointmentFor(patientId){
  const now=new Date();
  return arr(data.appointments)
    .filter(a=>a?.patientId===patientId&&a?.date&&a?.time&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou')
    .filter(a=>new Date(`${a.date}T${a.time}:00`)>=now)
    .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null;
}
function ensureMobileStatus(){
  const top=document.querySelector('.top-actions');if(!top)return null;
  let box=document.getElementById('rm-mobile-status');
  if(!box){box=document.createElement('div');box.id='rm-mobile-status';box.className='rm-mobile-status';top.insertBefore(box,top.firstChild)}
  return box;
}
function statusClass(status){return status==='ok'?'ok':status==='error'?'error':'warn'}
function paintMobileStatus(){
  const box=ensureMobileStatus();if(!box)return;
  const ds=dataStatus==='synced'?'ok':dataStatus==='error'||dataStatus==='conflict'?'error':'warn';
  const dLabel=dataStatus==='synced'?'Dados ✓':dataStatus==='syncing'?'Dados ↻':dataStatus==='error'||dataStatus==='conflict'?'Dados !':'Dados •';
  const gs=googleStatus==='connected'?'ok':googleStatus==='disconnected'?'warn':'warn';
  const gLabel=googleStatus==='connected'?'G ✓':googleStatus==='disconnected'?'G !':'G •';
  box.innerHTML=`<span class="rm-status-chip ${statusClass(ds)}" title="${dataSyncedAt?`Dados sincronizados às ${dataSyncedAt}`:'Estado da sincronização de dados'}">${dLabel}</span><span class="rm-status-chip ${statusClass(gs)}" title="Google Agenda">${gLabel}</span>`;
}
function observeSyncChip(){
  const chip=document.getElementById('rm-sync-chip');if(!chip)return;
  const text=(chip.textContent||'').toLowerCase();
  if(text.includes('sincronizado')){dataStatus='synced';if(!dataSyncedAt)dataSyncedAt=fmtTime()}
  else if(text.includes('sincronizando'))dataStatus='syncing';
  else if(text.includes('conflito'))dataStatus='conflict';
  else if(text.includes('erro'))dataStatus='error';
  paintMobileStatus();
}
function decorateGoogleSettings(){
  const card=document.getElementById('rm-google-calendar');if(!card)return;
  const badge=card.querySelector('.card-title .badge');
  if(badge){googleStatus=/^conectado$/i.test((badge.textContent||'').trim())?'connected':'disconnected';paintMobileStatus()}
  if(card.querySelector('.rm-technical-details'))return;
  const field=[...card.querySelectorAll('.field')].find(x=>/Google OAuth Client ID/i.test(x.querySelector('label')?.textContent||''));
  if(!field)return;
  const origin=field.nextElementSibling;
  const notice=origin?.nextElementSibling;
  const details=document.createElement('details');details.className='rm-technical-details';
  const summary=document.createElement('summary');summary.textContent='Detalhes técnicos';
  const body=document.createElement('div');body.className='rm-technical-details-body';
  details.append(summary,body);
  field.parentNode.insertBefore(details,field);
  body.appendChild(field);
  if(origin&&origin.classList.contains('small'))body.appendChild(origin);
  if(notice&&notice.classList.contains('notice')){notice.querySelectorAll('code').forEach(x=>x.classList.add('rm-break-anywhere'));body.appendChild(notice)}
}
function decoratePatientCards(){
  document.querySelectorAll('[data-patient-card]').forEach(card=>{
    const button=card.querySelector('[data-action="select-patient"][data-id]');
    const id=button?.dataset.id;if(!id)return;
    const p=patientById(id),next=nextAppointmentFor(id);
    const old=card.querySelector('p.small.muted.mt-12');
    if(!old)return;
    old.className='rm-next-session';
    old.innerHTML=next?`<strong>Próxima sessão:</strong> ${fmtShortDate(next.date)} · ${next.time}`:'Sem próxima sessão agendada';
    old.title=p?.summary?'Há síntese clínica cadastrada; consulte o prontuário do paciente.':'';
  });
}
function decorateDashboard(){
  if(runtime.route!=='today')return;
  const metric=[...document.querySelectorAll('.metric')].find(x=>/Próximas sessões/i.test(x.querySelector('.metric-label')?.textContent||''));
  if(!metric)return;
  const today=todayISO();
  const count=arr(data.appointments).filter(a=>a?.date===today&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou').length;
  const label=metric.querySelector('.metric-label'),value=metric.querySelector('.metric-value');
  if(label)label.textContent='Sessões hoje';if(value)value.textContent=String(count);
}
function setAgendaMode(calendar,mode){
  if(!calendar)return;
  calendar.classList.remove('rm-mobile-day','rm-mobile-three','rm-mobile-week');
  calendar.classList.add(mode==='three'?'rm-mobile-three':mode==='week'?'rm-mobile-week':'rm-mobile-day');
  const heads=[...calendar.querySelectorAll('.week-head:not(.week-time-head)')];
  const days=[...calendar.querySelectorAll('.week-day-column')];
  const todayIndex=Math.max(0,heads.findIndex(h=>h.classList.contains('today')));
  let visible=[];
  if(mode==='week')visible=heads.map((_,i)=>i);
  else if(mode==='three'){
    const start=Math.min(todayIndex,Math.max(0,heads.length-3));visible=[start,start+1,start+2].filter(i=>i<heads.length);
  }else visible=[todayIndex];
  heads.forEach((el,i)=>el.hidden=!visible.includes(i));days.forEach((el,i)=>el.hidden=!visible.includes(i));
  const wrap=calendar.closest('.week-calendar-wrap');if(wrap)wrap.style.overflowX=mode==='week'?'auto':'hidden';
  document.querySelectorAll('.rm-mobile-agenda-view [data-mobile-agenda-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mobileAgendaMode===mode));
  try{sessionStorage.setItem('rm.mobile.agenda.mode',mode)}catch{}
}
function decorateAgenda(){
  if(runtime.route!=='agenda')return;
  const toolbar=document.querySelector('.agenda-toolbar'),calendar=document.querySelector('.week-calendar');if(!toolbar||!calendar)return;
  let switcher=toolbar.querySelector('.rm-mobile-agenda-view');
  if(!switcher){
    switcher=document.createElement('div');switcher.className='rm-mobile-agenda-view';switcher.setAttribute('aria-label','Visualização da agenda no celular');
    switcher.innerHTML='<button type="button" class="btn secondary" data-mobile-agenda-mode="day">Hoje</button><button type="button" class="btn secondary" data-mobile-agenda-mode="three">3 dias</button><button type="button" class="btn secondary" data-mobile-agenda-mode="week">Semana</button>';
    toolbar.appendChild(switcher);
  }
  if(matchMedia('(max-width:700px)').matches){let mode='day';try{mode=sessionStorage.getItem('rm.mobile.agenda.mode')||'day'}catch{}setAgendaMode(calendar,mode)}
}
function decorate(){
  if(runtime.locked)return;
  ensureMobileStatus();observeSyncChip();decorateGoogleSettings();decoratePatientCards();decorateDashboard();decorateAgenda();paintMobileStatus();
}

document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-mobile-agenda-mode]');if(!b)return;
  e.preventDefault();const calendar=document.querySelector('.week-calendar');setAgendaMode(calendar,b.dataset.mobileAgendaMode||'day');
});
document.addEventListener('rm:rendered',()=>setTimeout(decorate,0));
document.addEventListener('rm:data-ready',()=>setTimeout(decorate,60));
document.addEventListener('rm:sync-status',e=>{
  const s=e.detail?.status||'';dataStatus=s||dataStatus;if(s==='synced')dataSyncedAt=fmtTime();paintMobileStatus();
});
const toastObserver=new MutationObserver(()=>{
  document.querySelectorAll('#toast-region .toast').forEach(t=>{
    const tx=(t.textContent||'').toLowerCase();
    if(tx.includes('google agenda conectado')||tx.includes('google agenda atualizado'))googleStatus='connected';
    if(tx.includes('google agenda precisa ser reconectado')||tx.includes('autorização do google agenda expirou'))googleStatus='disconnected';
  });paintMobileStatus();
});
const toastRoot=document.getElementById('toast-region');if(toastRoot)toastObserver.observe(toastRoot,{childList:true,subtree:true});
window.addEventListener('resize',()=>{if(runtime.route==='agenda')setTimeout(decorateAgenda,40)});
setTimeout(decorate,250);
