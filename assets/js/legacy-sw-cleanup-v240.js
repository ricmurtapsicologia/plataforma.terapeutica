const KEY='rm.sw.legacy.cleanup.v240';
async function cleanup(){if(!('serviceWorker'in navigator)||sessionStorage.getItem(KEY)==='1')return;sessionStorage.setItem(KEY,'1');try{const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs){const url=reg.active?.scriptURL||reg.waiting?.scriptURL||reg.installing?.scriptURL||'';if(/\/sw\.js(?:\?|$)/.test(url))await reg.unregister()}}catch(err){console.warn('Service worker legado não pôde ser removido.',err)}}
void cleanup();
