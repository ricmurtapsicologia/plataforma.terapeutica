const REPAIR_KEY='rm.gemini.materialization-integrity.v273';
const MAX_ATTEMPTS=3;
const FORCE_ACTION='gemini-reconcile-v270';
let armed=false;
let pending=false;
let attempts=0;
let retryTimer=null;

function repairCompleted(){
  try{
    const value=JSON.parse(localStorage.getItem(REPAIR_KEY)||'null');
    return value?.status==='done';
  }catch{return false}
}

function markCompleted(){
  localStorage.setItem(REPAIR_KEY,JSON.stringify({status:'done',completedAt:new Date().toISOString()}));
  pending=false;
  clearTimeout(retryTimer);
}

function schedule(delay=400){
  if(!armed||repairCompleted()||pending||attempts>=MAX_ATTEMPTS)return;
  setTimeout(triggerForcedReconcile,delay);
}

function triggerForcedReconcile(){
  if(!armed||repairCompleted()||pending||attempts>=MAX_ATTEMPTS||document.hidden||!navigator.onLine)return;
  const host=document.body||document.documentElement;
  if(!host)return;
  const button=document.createElement('button');
  button.type='button';
  button.hidden=true;
  button.setAttribute('aria-hidden','true');
  button.dataset.action=FORCE_ACTION;
  button.dataset.integrityRepair='v273';
  host.appendChild(button);
  attempts+=1;
  pending=true;
  button.click();
  button.remove();
  clearTimeout(retryTimer);
  retryTimer=setTimeout(()=>{
    if(!pending||repairCompleted())return;
    pending=false;
    schedule(1400);
  },12000);
}

function requestWorkspaceRenewal(){
  document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{detail:{reason:'gemini-materialization-integrity-v273'}}));
}

document.addEventListener('rm:data-ready',()=>{
  if(repairCompleted())return;
  armed=true;
});

document.addEventListener('rm:gemini-status',event=>{
  if(!armed||repairCompleted())return;
  const status=String(event.detail?.status||'');
  const detail=String(event.detail?.detail||'');
  if(status==='disconnected'){
    requestWorkspaceRenewal();
    return;
  }
  if(status==='error'){
    if(pending)pending=false;
    schedule(1800);
    return;
  }
  if(status!=='connected'||!/grava[cç][aã]o verificada/i.test(detail))return;
  if(pending){
    markCompleted();
    return;
  }
  schedule(300);
});

document.addEventListener('rm:workspace-auto-renew',event=>{
  if(event.detail?.status==='renewed')schedule(650);
});

document.addEventListener('rm:google-workspace-authorized',()=>schedule(650));
window.addEventListener('online',()=>schedule(650));
