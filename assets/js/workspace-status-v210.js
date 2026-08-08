import {runtime} from './state.js';

let status='unknown';
let detail='Estado do Google Meet/Gemini ainda não confirmado.';
let observer=null;

function tone(){return status==='connected'?'ok':status==='scanning'?'warn':status==='error'||status==='disconnected'?'error':'warn'}
function label(){return status==='connected'?'Meet ✓':status==='scanning'?'Meet ↻':status==='error'||status==='disconnected'?'Meet !':'Meet •'}
function title(){return detail||'Estado da integração Google Meet/Gemini.'}
function buttonMarkup(extra=''){return`<button type="button" class="rm-status-chip ${tone()} ${extra}" data-route="settings" title="${String(title()).replace(/"/g,'&quot;')}" aria-label="${String(title()).replace(/"/g,'&quot;')}">${label()}</button>`}

function ensureDesktop(){
  if(runtime.locked)return;
  const top=document.querySelector('.top-actions');if(!top)return;
  let chip=document.getElementById('rm-meet-status-desktop');
  if(!chip){const wrap=document.createElement('div');wrap.innerHTML=buttonMarkup('rm-meet-status-desktop');chip=wrap.firstElementChild;chip.id='rm-meet-status-desktop';const clock=top.querySelector('#clock-chip');top.insertBefore(chip,clock||top.firstChild)}
  chip.className=`rm-status-chip ${tone()} rm-meet-status-desktop`;chip.textContent=label();chip.title=title();chip.setAttribute('aria-label',title());
}
function ensureMobile(){
  const box=document.getElementById('rm-mobile-status');if(!box)return;
  let chip=box.querySelector('.rm-meet-status-mobile');
  if(!chip){const wrap=document.createElement('div');wrap.innerHTML=buttonMarkup('rm-meet-status-mobile');chip=wrap.firstElementChild;box.appendChild(chip)}
  chip.className=`rm-status-chip ${tone()} rm-meet-status-mobile`;chip.textContent=label();chip.title=title();chip.setAttribute('aria-label',title());
}
function decorate(){if(runtime.locked)return;ensureDesktop();ensureMobile();const box=document.getElementById('rm-mobile-status');if(box&&!observer){observer=new MutationObserver(()=>queueMicrotask(ensureMobile));observer.observe(box,{childList:true})}}

document.addEventListener('rm:gemini-status',e=>{status=e.detail?.status||status;detail=e.detail?.detail||detail;decorate()});
document.addEventListener('rm:rendered',()=>setTimeout(decorate,0));
document.addEventListener('rm:data-ready',()=>setTimeout(decorate,80));
setInterval(()=>{if(!runtime.locked)decorate()},15000);
setTimeout(decorate,300);
