// v1.6.5 — registra um service worker mínimo para que a navegação da plataforma
// receba Cross-Origin-Opener-Policy: same-origin-allow-popups mesmo em GitHub Pages.
// O worker não armazena dados clínicos e não faz cache da aplicação.

const RELOAD_KEY='rm.oauth.coop.reload.v165';
let reloading=false;

async function installOAuthBridge(){
  if(!('serviceWorker' in navigator)) return;
  try{
    // O bootstrap legado remove registros antigos para evitar cache obsoleto.
    // Atrasamos brevemente este registro para que a limpeza termine primeiro.
    await new Promise(resolve=>setTimeout(resolve,700));
    const alreadyControlled=Boolean(navigator.serviceWorker.controller);
    const registration=await navigator.serviceWorker.register('./sw.js?v=1.6.5',{
      scope:'./',
      updateViaCache:'none'
    });
    try{await registration.update()}catch{}

    if(alreadyControlled || navigator.serviceWorker.controller){
      sessionStorage.removeItem(RELOAD_KEY);
      return;
    }

    const reloadOnce=()=>{
      if(reloading) return;
      if(sessionStorage.getItem(RELOAD_KEY)==='1') return;
      reloading=true;
      sessionStorage.setItem(RELOAD_KEY,'1');
      location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange',reloadOnce,{once:true});
    if(registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

    // clients.claim() normalmente dispara controllerchange. Este fallback cobre navegadores
    // em que o controle só se torna observável após pequena espera.
    setTimeout(()=>{
      if(navigator.serviceWorker.controller) reloadOnce();
    },1800);
  }catch(err){
    console.warn('Compatibilidade OAuth via service worker não pôde ser ativada.',err);
  }
}

installOAuthBridge();
