import {runtime} from './state.js';

const RECONCILE_ACTION='gemini-reconcile-v240';
const LAST_RUN_KEY='rm.gemini.autodelivery.v264.last';
const COOLDOWN_MS=8*60*1000;
const HEARTBEAT_MS=5*60*1000;
let timer=null,running=false;

function emit(status,detail=''){
  document.dispatchEvent(new CustomEvent('rm:gemini-autodelivery',{detail:{status,detail,at:new Date().toISOString()}}));
}
function triggerReconcile(){
  const button=document.createElement('button');
  button.type='button';
  button.hidden=true;
  button.dataset.action=RECONCILE_ACTION;
  document.body.appendChild(button);
  button.click();
  button.remove();
}
function lastRun(){return Number(sessionStorage.getItem(LAST_RUN_KEY)||0)}
function run(reason='sync'){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return false;
  if(Date.now()-lastRun()<COOLDOWN_MS)return false;
  running=true;
  sessionStorage.setItem(LAST_RUN_KEY,String(Date.now()));
  try{
    emit('running',`Conciliação automática iniciada: ${reason}.`);
    triggerReconcile();
    emit('triggered','Gemini encaminhado automaticamente para conciliação e prontuário.');
    return true;
  }finally{setTimeout(()=>{running=false},1800)}
}
function schedule(reason,delay=700){clearTimeout(timer);timer=setTimeout(()=>run(reason),delay)}

document.addEventListener('rm:data-ready',()=>{
  document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{detail:{reason:'gemini-autodelivery'}}));
  schedule('dados clínicos prontos',900);
});
document.addEventListener('rm:sync-status',e=>{if(e.detail?.status==='synced')schedule('dados sincronizados',650)});
document.addEventListener('rm:gemini-status',e=>{
  if(e.detail?.status==='disconnected')document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{detail:{force:true,reason:'gemini-token'}}));
});
document.addEventListener('rm:workspace-auto-renew',e=>{
  if(e.detail?.status==='renewed'){
    emit('workspace-ready','Workspace renovado; prontuários serão conciliados automaticamente.');
    schedule('workspace renovado',650);
  }
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule('retorno à plataforma',800)});
window.addEventListener('online',()=>{
  document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{detail:{reason:'online'}}));
  schedule('conectividade restaurada',1000);
});
setInterval(()=>run('verificação periódica'),HEARTBEAT_MS);
