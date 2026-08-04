// v1.6.6 — registra o service worker mínimo usado para compatibilidade OAuth no GitHub Pages.
// O worker não armazena dados clínicos nem faz cache da aplicação.

const RELOAD_KEY='rm.oauth.coop.reload.v166';
let reloading=false;

async function installOAuthBridge(){
  if(!('serviceWorker' in navigator)) return;
  try{
    const registration=await navigator.serviceWorker.register('./sw.js?v=1.6.6',{
      scope:'./',
      updateViaCache:'none'
    });
    try{await registration.update()}catch{}

    if(registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

    // Se esta navegação já está sob controle, o cabeçalho COOP já foi aplicado pelo worker.
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

    // clients.claim() deve gerar controllerchange; este fallback cobre navegadores que
    // só expõem o controller depois que o worker fica completamente ativo.
    setTimeout(()=>{
      if(navigator.serviceWorker.controller) reloadOnce();
    },500);
  }catch(err){
    console.warn('Compatibilidade OAuth via service worker não pôde ser ativada.',err);
  }
}

installOAuthBridge();
