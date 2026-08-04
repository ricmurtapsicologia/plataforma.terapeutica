// Compatibilidade de impressão/PDF — v1.6.0
// Não enfraquece noopener/noreferrer em links externos. A exceção é aplicada
// somente às janelas auxiliares com dimensões explícitas usadas pelos PDFs.
const originalOpen=window.open.bind(window);
window.open=function(url='',target='_blank',features=''){
  const parts=String(features||'').split(',').map(x=>x.trim()).filter(Boolean);
  const isPrintPopup=parts.some(x=>/^width=/i.test(x))||parts.some(x=>/^height=/i.test(x));
  if(!isPrintPopup)return originalOpen(url,target,features);
  const compatible=parts.filter(x=>!/^noopener$/i.test(x)&&!/^noreferrer$/i.test(x)).join(',');
  const win=originalOpen(url,target,compatible);
  if(win)setTimeout(()=>{try{win.opener=null}catch{}},0);
  return win;
};
