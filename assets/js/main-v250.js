document.body.classList.add('rm-booting');
window.__rmEntrypointVersion='2.7.1-main-v250';
window.__rmPreBootErrors=[];
let bootReady=false;
document.addEventListener('rm:boot-ready',()=>{bootReady=true},{once:true});
setTimeout(()=>{if(bootReady)return;const box=document.getElementById('rm-boot-fallback');if(box){box.innerHTML='<strong>O carregamento está demorando mais que o esperado.</strong><div class="small">Verifique a conexão e recarregue a página. Se persistir, abra o diagnóstico da plataforma após o acesso.</div>'}},12000);
const modules=[
  ['./runtime-monitor-v240.js','Monitor de runtime'],
  ['./legacy-sw-cleanup-v240.js','Limpeza do service worker legado'],
  ['./browser-fixes-v153.js','Compatibilidade de navegador'],
  ['./google-workspace-oauth-v200.js','Google Workspace OAuth'],
  ['./google-workspace-auto-renew-v264.js','Renovação silenciosa do Google Workspace'],
  ['./google-calendar-service-v240.js','Google Agenda'],
  ['./calendar-integrity-v274.js','Integridade Google Agenda'],
  ['./top-status-owner-v243.js','Proprietário único dos indicadores do topo'],
  ['./gemini-sharing-guard-v250.js','Gate de privacidade do Gemini'],
  ['./public-clinical-storage-guard-v251.js','Gate de storage clínico público'],
  ['./clinical-reconcile-v270.js','Google Meet/Gemini · pipeline único'],
  ['./gemini-historical-identity-repair-v272.js','Reparo cifrado de identidades históricas Gemini'],
  ['./gemini-materialization-integrity-v273.js','Reparo único de integridade da materialização Gemini'],
  ['./ai-record-review-v220.js','Revisão de prontuário IA'],
  ['./agenda-mobile-v183.js','Agenda mobile'],
  ['./agenda-actions-v240.js','Ações da Agenda'],
  ['./portable-tools-v153.js','Ferramentas portáteis'],
  ['./sync-semantic-conflict-cleanup-v260.js','Limpeza de falsos conflitos equivalentes'],
  ['./legacy-sync-cleanup-v262.js','Limpeza de conflito legado do Meet'],
  ['./patient-closure-v172.js','Encerramento de paciente'],
  ['./version-v170.js','Versão visual'],
  ['./material-share-v162.js','Compartilhamento de materiais'],
  ['./mobile-ux-v170.js','UX mobile'],
  ['./patient-ux-v240.js','Contexto individual do paciente'],
  ['./workspace-status-v240.js','Indicador Meet']
];
for(const [path,label] of modules){try{await import(`${path}?v=2.7.1-integrity1`)}catch(err){console.error(`Falha em ${label}`,err);window.__rmPreBootErrors.push(`${label}: ${err?.message||err}`)}}
try{await import('./bootstrap-v240.js?v=2.7.1-integrity1');if(Array.isArray(window.__rmBootErrors)&&window.__rmPreBootErrors.length)window.__rmBootErrors.push(...window.__rmPreBootErrors)}catch(err){console.error('Falha crítica no bootstrap',err);window.__rmPreBootErrors.push(`Bootstrap: ${err?.message||err}`);const box=document.getElementById('rm-boot-fallback');if(box)box.innerHTML=`<strong>Não foi possível iniciar a plataforma.</strong><div class="small">${String(err?.message||err).replace(/[<>]/g,'')}</div>`;document.dispatchEvent(new CustomEvent('rm:boot-failed',{detail:{message:err?.message||String(err)}}))}
