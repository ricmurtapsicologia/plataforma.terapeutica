// Supervisor de sincronização durável — v1.8.2
// Usa o evento emitido pelo banco somente após a conclusão da gravação no IndexedDB.
// Mantém uma geração pendente para que alterações ocorridas durante um ciclo de sync
// sejam reconciliadas imediatamente quando o ciclo atual terminar.
// Inclui watchdog para recuperar automaticamente sincronizações que ficarem paradas.

const WATCHDOG_MS=10000;
const STALE_AFTER_MS=22000;
const MAX_ERROR_RETRY_MS=30000;

let mutationGeneration=0;
let activeGeneration=0;
let settledGeneration=0;
let retryTimer=null;
let watchdogTimer=null;
let lastStatus='';
let lastReason='';
let lastCompletedAt=0;
let errorRetries=0;

const forceReasons=new Set(['focus','online','visible','watchdog','error-retry']);

function syncButton(){
  return document.getElementById('rm-sync-chip')||document.querySelector('[data-action="sync-now"]');
}
function schedule(delay=180,reason='mutation'){
  lastReason=reason;
  clearTimeout(retryTimer);
  retryTimer=setTimeout(run,delay);
}
function canWatchdogRun(){
  if(!globalThis.__rmDataReady||globalThis.__rmSyncApplying)return false;
  if(document.visibilityState!=='visible'||!navigator.onLine)return false;
  if(lastStatus==='conflict')return false;
  return ['ready','synced','error','syncing',''].includes(lastStatus);
}
function run(){
  if(globalThis.__rmSyncApplying||!globalThis.__rmDataReady){schedule(500,'data-not-ready');return}
  if(document.visibilityState!=='visible'||!navigator.onLine)return;
  if(lastStatus==='syncing')return;
  if(lastStatus==='conflict')return;
  const forced=forceReasons.has(lastReason);
  if(mutationGeneration<=settledGeneration&&!forced)return;
  const button=syncButton();
  if(!button||button.disabled){schedule(1200,'sync-control-unavailable');return}
  button.click();
}
function rerenderAgenda(){
  try{
    const hash=location.hash.replace(/^#/,'');
    if(hash==='agenda')setTimeout(()=>window.__rmRender?.(),80);
  }catch{}
}
function startWatchdog(){
  if(watchdogTimer)clearInterval(watchdogTimer);
  watchdogTimer=setInterval(()=>{
    if(!canWatchdogRun())return;
    if(lastStatus==='syncing')return;
    const stale=!lastCompletedAt||(Date.now()-lastCompletedAt)>=STALE_AFTER_MS;
    if(stale)schedule(0,'watchdog');
  },WATCHDOG_MS);
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
    activeGeneration=mutationGeneration;
    return;
  }
  if(status==='synced'){
    lastCompletedAt=Date.now();
    errorRetries=0;
    settledGeneration=Math.max(settledGeneration,activeGeneration);
    rerenderAgenda();
    if(mutationGeneration>settledGeneration)schedule(120,'queued-after-sync');
    return;
  }
  if(status==='ready'){
    if(!lastCompletedAt)lastCompletedAt=Date.now();
    if(mutationGeneration>settledGeneration)schedule(180,'ready-with-pending');
    return;
  }
  if(status==='error'&&navigator.onLine){
    errorRetries=Math.min(errorRetries+1,6);
    const delay=Math.min(MAX_ERROR_RETRY_MS,2500*(2**(errorRetries-1)));
    schedule(delay,'error-retry');
  }
});

window.addEventListener('focus',()=>{if(globalThis.__rmDataReady)schedule(120,'focus')});
window.addEventListener('online',()=>{if(globalThis.__rmDataReady)schedule(80,'online')});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&globalThis.__rmDataReady)schedule(120,'visible')});
document.addEventListener('rm:data-ready',()=>{lastCompletedAt=0;startWatchdog();schedule(180,'visible')});

startWatchdog();
