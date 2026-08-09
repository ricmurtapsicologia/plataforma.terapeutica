import {runtime} from './state.js';
let status='unknown',detail='Estado do Google Meet/Gemini ainda não confirmado.';
function tone(){return status==='connected'?'ok':status==='error'||status==='disconnected'?'error':'warn'}
function label(){return status==='connected'?'Meet ✓':status==='scanning'?'Meet ↻':status==='paused'?'Meet •':status==='error'||status==='disconnected'?'Meet !':'Meet •'}
function decorate(){if(runtime.locked)return;const top=document.querySelector('.top-actions');if(!top)return;let chip=document.getElementById('rm-meet-status-v240');if(!chip){chip=document.createElement('button');chip.type='button';chip.id='rm-meet-status-v240';chip.dataset.route='settings';top.insertBefore(chip,document.getElementById('clock-chip')||top.firstChild)}chip.className=`rm-status-chip ${tone()}`;chip.textContent=label();chip.title=detail;chip.setAttribute('aria-label',detail)}
document.addEventListener('rm:gemini-status',e=>{status=e.detail?.status||status;detail=e.detail?.detail||detail;decorate()});
document.addEventListener('rm:rendered',()=>queueMicrotask(decorate));
document.addEventListener('rm:data-ready',()=>setTimeout(decorate,80));
