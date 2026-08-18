import {runtime} from './state.js';
import {toast} from './ui.js';

const PENDING_STORAGE='rm.google.calendar.pending.v240';
const NOTICE_COOLDOWN_MS=10*60*1000;
let lastNoticeAt=0,lastStatus='unknown';

function pendingCount(){
  try{
    const value=JSON.parse(localStorage.getItem(PENDING_STORAGE)||'[]');
    return Array.isArray(value)?value.filter(Boolean).length:0;
  }catch{return 0}
}

function repaint(){
  const chip=document.getElementById('rm-calendar-status-v240');
  if(!chip)return;
  const pending=pendingCount();
  if(pending>0){
    chip.textContent=`Agenda ! · ${pending}`;
    chip.classList.remove('ok');
    chip.classList.add('error');
    chip.title=`${pending} alteração(ões) da agenda aguardando confirmação no Google Agenda.`;
  }
}

function requestRecovery(reason='pending'){
  if(runtime.locked||!runtime.dataReady||!navigator.onLine||pendingCount()===0)return;
  document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{detail:{force:false,reason}}));
  setTimeout(repaint,50);
}

function notifyIfNeeded(){
  const pending=pendingCount();
  if(!pending||!['error','disconnected'].includes(lastStatus))return;
  if(Date.now()-lastNoticeAt<NOTICE_COOLDOWN_MS)return;
  lastNoticeAt=Date.now();
  toast(`Google Agenda pendente: ${pending} alteração(ões) salvas com segurança aguardam reconciliação. Reconecte o Google Workspace se o indicador “Agenda !” persistir.`,'warning');
}

document.addEventListener('rm:calendar-status',event=>{
  lastStatus=String(event.detail?.status||'unknown');
  setTimeout(()=>{repaint();notifyIfNeeded()},0);
});

document.addEventListener('rm:local-data-changed',event=>{
  if(event.detail?.storeName!=='appointments'||globalThis.__rmSyncApplying)return;
  setTimeout(()=>requestRecovery('appointment-change'),180);
  setTimeout(repaint,250);
});

document.addEventListener('rm:google-workspace-authorized',()=>{
  setTimeout(repaint,1400);
});

document.addEventListener('rm:data-ready',()=>{
  setTimeout(()=>requestRecovery('data-ready'),1200);
  setTimeout(repaint,1500);
});

window.addEventListener('focus',()=>setTimeout(()=>requestRecovery('focus'),250));
window.addEventListener('online',()=>setTimeout(()=>requestRecovery('online'),250));
