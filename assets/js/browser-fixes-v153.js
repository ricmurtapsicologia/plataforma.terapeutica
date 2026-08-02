// Correções cirúrgicas de compatibilidade do navegador — v1.5.3
// Mantém window.open utilizável pelos geradores de PDF/ impressão sem deixar
// referência permanente à janela de origem.
const originalOpen=window.open.bind(window);
window.open=function(url='',target='_blank',features=''){
  const safeFeatures=String(features||'')
    .split(',')
    .map(x=>x.trim())
    .filter(x=>x&&!/^noopener$/i.test(x)&&!/^noreferrer$/i.test(x))
    .join(',');
  const win=originalOpen(url,target,safeFeatures);
  if(win){setTimeout(()=>{try{win.opener=null}catch{}},0)}
  return win;
};
