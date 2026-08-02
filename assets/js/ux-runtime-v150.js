import {runtime,preferences} from './state.js';

let idleTimer=null;
function resetIdle(){runtime.lastActive=Date.now()}
function filterPatients(){
  const search=document.getElementById('patient-search');
  const status=document.getElementById('patient-status-filter');
  const term=(search?.value||'').trim().toLowerCase();
  const wanted=status?.value||'';
  document.querySelectorAll('[data-patient-card]').forEach(card=>{
    const matchesText=!term||String(card.dataset.name||'').includes(term);
    const matchesStatus=!wanted||card.dataset.status===wanted;
    card.hidden=!(matchesText&&matchesStatus);
  });
}
function applyPrivacyCover(){
  if(!preferences.lockOnBlur||runtime.locked)return;
  if(document.getElementById('privacy-cover'))return;
  const cover=document.createElement('div');
  cover.id='privacy-cover';
  cover.className='privacy-cover';
  cover.innerHTML='<div><img src="assets/images/brand-symbol.svg" alt=""><h2>Informações protegidas</h2><p class="muted">Retorne à aba para continuar.</p></div>';
  document.body.appendChild(cover);
}
function removePrivacyCover(){document.getElementById('privacy-cover')?.remove()}
function checkIdle(){
  if(runtime.locked)return;
  const minutes=Math.max(2,Number(preferences.idleMinutes)||15);
  if(Date.now()-runtime.lastActive>minutes*60000){location.reload()}
}
function startIdle(){if(idleTimer)clearInterval(idleTimer);idleTimer=setInterval(checkIdle,15000)}

document.addEventListener('pointerdown',resetIdle,true);
document.addEventListener('keydown',resetIdle,true);
document.addEventListener('input',e=>{resetIdle();if(e.target.id==='patient-search')filterPatients()},true);
document.addEventListener('change',e=>{resetIdle();if(e.target.id==='patient-status-filter')filterPatients()},true);
document.addEventListener('rm:rendered',()=>{filterPatients();removePrivacyCover()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)applyPrivacyCover();else{removePrivacyCover();resetIdle();window.__rmUpdateClock?.()}});
window.addEventListener('focus',()=>{removePrivacyCover();resetIdle();window.__rmUpdateClock?.()});
resetIdle();
startIdle();
