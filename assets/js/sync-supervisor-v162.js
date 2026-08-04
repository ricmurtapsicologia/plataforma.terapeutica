// Supervisor de sincronização durável — v1.6.2
// Usa o evento emitido pelo banco somente após a conclusão da gravação no IndexedDB.
// Mantém uma geração pendente para que alterações ocorridas durante um ciclo de sync
// sejam reconciliadas imediatamente quando o ciclo atual terminar.

let mutationGeneration=0;
let activeGeneration=0;
let settledGeneration=0;
let retryTimer=null;
let lastStatus='';
let lastReason='';

function syncButton(){
  return document.getElementById('rm-sync-chip')||document.querySelector('[data-action="sync-now"]');
}
function schedule(delay=180,reason='mutation'){
  lastReason=reason;
  clearTimeout(retryTimer);
  retryTimer=setTimeout(run,delay);
}
function run(){
  if(globalThis.__rmSyncApplying||!globalThis.__rmDataReady){schedule(500,'data-not-ready');return}
  if(lastStatus==='syncing'){return}
  if(lastStatus==='conflict'||lastStatus==='error'){return}
  if(mutationGeneration<=settledGeneration&&lastReason!=='focus'&&lastReason!=='online')return;
  const button=syncButton();
  if(!button||button.disabled){schedule(700,'sync-control-unavailable');return}
  activeGeneration=mutationGeneration;
  button.click();
}
function rerenderAgenda(){
  try{
    const hash=location.hash.replace(/^#/,'');
    if(hash==='agenda')setTimeout(()=>window.__rmRender?.(),80);
  }catch{}
}

document.addEventListener('rm:local-data-changed',event=>{
  if(globalThis.__rmSyncApplying)return;
  mutationGeneration++;
  const priority=event.detail?.storeName==='appointments';
  schedule(priority?100:350,priority?'appointment-committed':'record-committed');
});

document.addEventListener('rm:sync-status',event=>{
  const status=event.detail?.status||'';
  lastStatus=status;
  if(status==='syncing'){
    activeGeneration=Math.max(activeGeneration,mutationGeneration);
    return;
  }
  if(status==='synced'){
    settledGeneration=Math.max(settledGeneration,activeGeneration);
    rerenderAgenda();
    if(mutationGeneration>settledGeneration)schedule(120,'queued-after-sync');
    return;
  }
  if(status==='ready'&&mutationGeneration>settledGeneration)schedule(180,'ready-with-pending');
});

window.addEventListener('focus',()=>{if(globalThis.__rmDataReady)schedule(220,'focus')});
window.addEventListener('online',()=>{if(globalThis.__rmDataReady)schedule(150,'online')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&globalThis.__rmDataReady)schedule(220,'visible')});
