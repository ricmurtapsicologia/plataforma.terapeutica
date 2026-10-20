// Remove apenas o service worker legado desta plataforma; nunca apaga dados locais.
const KEY='rm.sw.legacy.cleanup.v376';
const scope=new URL('../../',import.meta.url).href;
const legacyScript=new URL('sw.js',scope).href;
async function cleanup(){
  if(!('serviceWorker' in navigator)||sessionStorage.getItem(KEY)==='1')return;
  try{
    const registrations=await navigator.serviceWorker.getRegistrations();
    for(const registration of registrations){
      const scripts=[registration.active?.scriptURL,registration.waiting?.scriptURL,registration.installing?.scriptURL];
      if(registration.scope===scope&&scripts.some(url=>url&&new URL(url).href===legacyScript)){
        await registration.unregister();
      }
    }
    sessionStorage.setItem(KEY,'1');
  }catch(err){console.warn('Não foi possível remover o service worker legado da plataforma clínica.',err)}
}
void cleanup();
