// v1.8.0 — registra o service worker mínimo usado para compatibilidade OAuth no GitHub Pages.
// O worker não armazena dados clínicos nem faz cache da aplicação.

const RELOAD_KEY='rm.oauth.coop.reload.v180';
let reloading=false;

async function installOAuthBridge(){
  if(!('serviceWorker' in navigator)) return;
  try{
    const registration=await navigator.serviceWorker.register('./sw.js?v=1.8.0',{
      scope:'./',
      updateViaCache:'none'
    });
    try{await registration.update()}catch{}

    if(registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

    if(navigator.serviceWorker.controller){
      sessionStorage.removeItem(RELOAD_KEY);
      return;
    }

    const reloadOnce=()=>{
      if(reloading || sessionStorage.getItem(RELOAD_KEY)==='1') return;
      reloading=true;
      sessionStorage.setItem(RELOAD_KEY,'1');
      location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange',reloadOnce,{once:true});
    await navigator.serviceWorker.ready;

    setTimeout(()=>{
      if(navigator.serviceWorker.controller) reloadOnce();
    },500);
  }catch(err){
    console.warn('Compatibilidade OAuth via service worker não pôde ser ativada.',err);
  }
}

installOAuthBridge();