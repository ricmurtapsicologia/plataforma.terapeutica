const OFFICIAL_ID='rm-calendar-status-v240';
let queued=false;
function sanitize(){queued=false;const top=document.querySelector('.top-actions');if(!top)return;const official=top.querySelector(`#${OFFICIAL_ID}`);const candidates=[...top.querySelectorAll('button,[class*="chip"],[class*="status"]')];for(const node of candidates){if(node===official)continue;const text=String(node.textContent||'').replace(/\s+/g,' ').trim();if(/^Agenda(?:\s|$)/i.test(text))node.remove()}}
function schedule(){if(queued)return;queued=true;queueMicrotask(sanitize)}
const observer=new MutationObserver(schedule);
function bind(){const app=document.getElementById('app');if(app){observer.disconnect();observer.observe(app,{childList:true,subtree:true})}schedule()}
document.addEventListener('rm:rendered',bind);
document.addEventListener('rm:calendar-status',schedule);
document.addEventListener('rm:data-ready',()=>setTimeout(bind,80));
setTimeout(bind,300);
