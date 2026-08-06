import {data,runtime,todayISO,patientById} from './state.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const GOOGLE_TOKEN_STORAGE='rm.google.calendar.token.v1';
const GOOGLE_CLIENT_STORAGE='rm.google.calendar.clientId';
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
  if(!box){box=document.createElement('div');box.id='rm-mobile-status';box.className='rm-mobile-status';box.setAttribute('aria-label','Estado de sincronização');top.insertBefore(box,top.firstChild)}
  return box;
}
function statusClass(status){return status==='ok'?'ok':status==='error'?'error':'warn'}
function inferGoogleStatus(){
  if(localStorage.getItem(GOOGLE_TOKEN_STORAGE)){googleStatus='connected';return}
  if(localStorage.getItem(GOOGLE_CLIENT_STORAGE)){googleStatus='disconnected';return}
  if(googleStatus!=='connected')googleStatus='unknown';
}
function paintMobileStatus(){
  inferGoogleStatus();
  const box=ensureMobileStatus();if(!box)return;
  const ds=dataStatus==='synced'?'ok':dataStatus==='error'||dataStatus==='conflict'?'error':'warn';
  const dLabel=dataStatus==='synced'?'Dados ✓':dataStatus==='syncing'?'Dados ↻':dataStatus==='error'||dataStatus==='conflict'?'Dados !':'Dados •';
  const gs=googleStatus==='connected'?'ok':googleStatus==='disconnected'?'error':'warn';
  const gLabel=googleStatus==='connected'?'Agenda ✓':googleStatus==='disconnected'?'Agenda !':'Agenda •';
  const dTitle=dataSyncedAt?`Dados sincronizados às ${dataSyncedAt}. Toque para sincronizar agora.`:'Estado da sincronização dos dados. Toque para sincronizar agora.';
  const gTitle=googleStatus==='connected'?'Google Agenda conectado. Toque para abrir Configurações.':googleStatus==='disconnected'?'Google Agenda precisa ser conectado neste dispositivo.':'Estado do Google Agenda ainda não confirmado.';
  box.innerHTML=`<button type="button" class="rm-status-chip ${statusClass(ds)}" data-action="sync-now" title="${dTitle}" aria-label="${dTitle}">${dLabel}</button><button type="button" class="rm-status-chip ${statusClass(gs)}" data-route="settings" title="${gTitle}" aria-label="${gTitle}">${gLabel}</button>`;
}
function privacyIcon(masked){
  if(masked)return '<svg class="rm-topbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 4.3A10.8 10.8 0 0 1 12 4c5.5 0 9 5 9 5a15.4 15.4 0 0 1-2.1 2.6"/><path d="M6.6 6.6C4.4 8.1 3 10 3 10s3.5 5 9 5c1 0 1.9-.2 2.8-.5"/></svg>';
  return '<svg class="rm-topbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
}
function decorateTopbar(){
  const privacy=document.querySelector('.top-actions [data-action="privacy-mask"]');
  if(privacy){
    const masked=Boolean(runtime.privacyMask);
    privacy.innerHTML=privacyIcon(masked);
    privacy.setAttribute('aria-label',masked?'Mostrar informações sensíveis':'Ocultar informações sensíveis');
    privacy.title=masked?'Mostrar informações sensíveis':'Ocultar informações sensíveis';
  }
  const menu=document.querySelector('.mobile-menu');
  if(menu){menu.setAttribute('aria-label','Abrir menu principal');menu.title='Menu principal'}
}
function observeSyncChip(){
  const chip=document.getElementById('rm-sync-chip');if(!chip)return;
  const text=(chip.textContent||'').toLowerCase();
  if(text.includes('sincronizado')){dataStatus='synced';if(!dataSyncedAt)dataSyncedAt=fmtTime()}
  else if(text.includes('sincronizando'))dataStatus='syncing';
  else if(text.includes('conflito'))dataStatus='conflict';
  else if(text.includes('falha')||text.includes('erro'))dataStatus='error';
  else if(text.includes('pendente'))dataStatus='pending';
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
function decorate(){
  if(runtime.locked)return;
  ensureMobileStatus();observeSyncChip();decorateGoogleSettings();decoratePatientCards();decorateDashboard();paintMobileStatus();decorateTopbar();
}

document.addEventListener('rm:rendered',()=>setTimeout(decorate,0));
document.addEventListener('rm:data-ready',()=>{setTimeout(decorate,60);setTimeout(()=>{inferGoogleStatus();paintMobileStatus()},500)});
document.addEventListener('rm:sync-status',e=>{
  const s=e.detail?.status||'';dataStatus=s||dataStatus;if(s==='synced')dataSyncedAt=fmtTime();paintMobileStatus();decorateTopbar();
});
const toastObserver=new MutationObserver(()=>{
  document.querySelectorAll('#toast-region .toast').forEach(t=>{
    const tx=(t.textContent||'').toLowerCase();
    if(tx.includes('google agenda conectado')||tx.includes('google agenda atualizado')||tx.includes('compromisso(s) conferido(s) no google agenda'))googleStatus='connected';
    if(tx.includes('google agenda precisa ser reconectado')||tx.includes('autorização do google agenda expirou')||tx.includes('reconecte em configurações'))googleStatus='disconnected';
  });paintMobileStatus();decorateTopbar();
});
const toastRoot=document.getElementById('toast-region');if(toastRoot)toastObserver.observe(toastRoot,{childList:true,subtree:true});
window.addEventListener('storage',e=>{if([GOOGLE_TOKEN_STORAGE,GOOGLE_CLIENT_STORAGE].includes(e.key)){inferGoogleStatus();paintMobileStatus()}});
setInterval(()=>{if(!runtime.locked){inferGoogleStatus();paintMobileStatus()}},30000);
setTimeout(decorate,250);
