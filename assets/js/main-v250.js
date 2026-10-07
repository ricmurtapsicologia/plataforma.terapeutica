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

function recordModuleError({phase='',label='',path='',error}={}){
  const message=`${label||path||'Módulo'}: ${error?.message||error||'falha desconhecida'}`;
  console.error(`Falha no runtime clínico [${phase||'unknown'}] ${label||path||''}`,error);
  window.__rmPreBootErrors.push(message);
}

try{
  const composition=await import('./core/clinical-runtime-manifest-v376.mjs?v=3.7.5&rev=clinical-runtime-v376');
  const result=await composition.loadClinicalRuntime({
    version:'3.7.5',
    revision:'clinical-runtime-v376',
    onError:recordModuleError
  });
  window.__rmRuntimeComposition={version:result.version,count:result.count,failed:result.results.filter(item=>!item.ok).map(item=>({phase:item.phase,path:item.path,label:item.label,error:item.error}))};
  await import('./bootstrap-v240.js?v=3.7.5&rev=clinical-runtime-v376');
  if(Array.isArray(window.__rmBootErrors)&&window.__rmPreBootErrors.length)window.__rmBootErrors.push(...window.__rmPreBootErrors);
}catch(err){
  console.error('Falha crítica no bootstrap',err);
  window.__rmPreBootErrors.push(`Bootstrap: ${err?.message||String(err)}`);
  const box=document.getElementById('rm-boot-fallback');
  if(box)box.innerHTML=`<strong>Não foi possível iniciar a plataforma.</strong><div class="small">${String(err?.message||err).replace(/[<>]/g,'')}</div>`;
  document.dispatchEvent(new CustomEvent('rm:boot-failed',{detail:{message:err?.message||String(err)}}));
}
