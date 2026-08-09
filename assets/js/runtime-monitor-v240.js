const metrics={bootAt:Date.now(),renders:0,syncRuns:0,syncErrors:0,calendarRuns:0,calendarErrors:0,geminiRuns:0,geminiErrors:0,routeChanges:0,lastError:'',lastUnhandled:'',lastSyncStatus:'',lastGeminiStatus:'',lastCalendarStatus:''};
function expose(){globalThis.__rmRuntimeMetrics={...metrics,uptimeMs:Date.now()-metrics.bootAt}}
function noteError(value,key='lastError'){metrics[key]=String(value||'').slice(0,500);expose()}
window.addEventListener('error',e=>noteError(e.message||'Erro de runtime'));
window.addEventListener('unhandledrejection',e=>noteError(e.reason?.message||e.reason||'Promise rejeitada','lastUnhandled'));
document.addEventListener('rm:rendered',()=>{metrics.renders++;expose()});
document.addEventListener('rm:sync-status',e=>{metrics.lastSyncStatus=e.detail?.status||'';if(e.detail?.status==='syncing')metrics.syncRuns++;if(e.detail?.status==='error')metrics.syncErrors++;expose()});
document.addEventListener('rm:gemini-status',e=>{metrics.lastGeminiStatus=e.detail?.status||'';if(e.detail?.status==='scanning')metrics.geminiRuns++;if(e.detail?.status==='error')metrics.geminiErrors++;expose()});
document.addEventListener('rm:calendar-status',e=>{metrics.lastCalendarStatus=e.detail?.status||'';if(e.detail?.status==='syncing')metrics.calendarRuns++;if(e.detail?.status==='error')metrics.calendarErrors++;expose()});
window.addEventListener('hashchange',()=>{metrics.routeChanges++;expose()});
expose();
