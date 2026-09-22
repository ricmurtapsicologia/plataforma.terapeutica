const VERSION='3.8.1-intermittency-hotfix';
const metrics={cls:0,layoutShifts:0,settles:0,lastSettleAt:'',supported:typeof PerformanceObserver!=='undefined'};
let settleTimer=null;

function expose(){globalThis.__rmUiStability={version:VERSION,metrics:{...metrics}}}
function settle(delay=90){
  document.body.classList.add('rm-ui-settling');
  clearTimeout(settleTimer);
  settleTimer=setTimeout(()=>{
    document.body.classList.remove('rm-ui-settling');
    metrics.settles++;
    metrics.lastSettleAt=new Date().toISOString();
    expose();
  },delay);
}

try{
  if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('layout-shift')){
    const observer=new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
        if(entry.hadRecentInput)continue;
        metrics.cls+=Number(entry.value||0);
        metrics.layoutShifts++;
      }
      expose();
    });
    observer.observe({type:'layout-shift',buffered:true});
  }
}catch{}

document.addEventListener('rm:rendered',()=>settle(90));
document.addEventListener('rm:data-patched',()=>settle(70));
document.addEventListener('rm:record-link-repaired',()=>settle(70));
window.addEventListener('resize',()=>settle(80),{passive:true});
expose();

globalThis.__rmUiStabilityApi={version:VERSION,settle,metrics:()=>({...metrics})};
