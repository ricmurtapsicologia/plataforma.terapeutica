document.body.classList.add('rm-booting');
window.__rmEntrypointVersion='3.7.5-main-v250';
window.__rmPreBootErrors=[];
let bootReady=false;
document.addEventListener('rm:boot-ready',()=>{bootReady=true},{once:true});
setTimeout(()=>{
  if(bootReady)return;
  const box=document.getElementById('rm-boot-fallback');
  if(box)box.innerHTML='<strong>O carregamento está demorando mais que o esperado.</strong><div class="small">Verifique a conexão e recarregue a página. Se persistir, abra o diagnóstico da plataforma após o acesso.</div>';
},12000);

try{
  await import('./bootstrap-v240.js?v=3.7.5&rev=clinical-runtime-v376');
}catch(err){
  console.error('Falha crítica no bootstrap',err);
  window.__rmPreBootErrors.push(`Bootstrap: ${err?.message||String(err)}`);
  const box=document.getElementById('rm-boot-fallback');
  if(box)box.innerHTML=`<strong>Não foi possível iniciar a plataforma.</strong><div class="small">${String(err?.message||err).replace(/[<>]/g,'')}</div>`;
  document.dispatchEvent(new CustomEvent('rm:boot-failed',{detail:{message:err?.message||String(err)}}));
}
