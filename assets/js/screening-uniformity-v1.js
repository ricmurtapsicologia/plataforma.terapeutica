(()=>{
'use strict';
const SRC='https://ricmurtapsicologia.github.io/plataforma.terapeutica/assets/js/screening-system-v2.js?v=2.2.1';
window.__RM_PENDING_DELIVERY=window.__RM_PENDING_DELIVERY||[];
if(!window.RMScreeningUI){
  window.RMScreeningUI={
    version:'2.2.1-loading',
    confirmDelivery(detail={}){window.__RM_PENDING_DELIVERY.push(detail)},
    getIdentity(){return {}}
  };
}
if(!document.querySelector('script[data-rm-screening-v2]')){
  const s=document.createElement('script');
  s.src=SRC;
  s.defer=true;
  s.dataset.rmScreeningV2='true';
  document.head.appendChild(s);
}
})();
