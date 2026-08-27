document.body.classList.add('rm-booting');
window.__rmEntrypointVersion='3.6.0-main-v250';
window.__rmPreBootErrors=[];
let bootReady=false;
document.addEventListener('rm:boot-ready',()=>{bootReady=true},{once:true});
setTimeout(()=>{if(bootReady)return;const box=document.getElementById('rm-boot-fallback');if(box){box.innerHTML='<strong>O carregamento está demorando mais que o esperado.</strong><div class="small">Verifique a conexão e recarregue a página. Se persistir, abra o diagnóstico da plataforma após o acesso.</div>'}},12000);
const modules=[
  ['./platform-runtime-v300.js','Runtime consolidado v3'],
  ['./migration-router-v300.js','Roteador de migrações condicionais'],
  ['./google-workspace-oauth-v200.js','Google Workspace OAuth'],
  ['./google-workspace-auto-renew-v264.js','Renovação silenciosa do Google Workspace'],
  ['./patient-hygiene-v100.js','Higiene privada de pacientes e anamneses'],
  ['./clinical-private-reconciliation-v350.js','Conciliação clínica privada via Google Drive'],
  ['./clinical-intake-runtime-v310.js','Clinical Intake · Anamnese'],
  ['./clinical-intake-patient-ui-v312.js','Anamnese · área clínica do paciente'],
  ['./clinical-assessment-v360.js','Complementação estruturada da avaliação clínica'],
  ['./patient-status-v350.js','Status clínico Ativo/Inativo'],
  ['./patient-billing-profile-v360.js','Perfil financeiro avulso/pacote/mensal'],
  ['./calendar-adapter-v300.js','CalendarAdapter v3'],
  ['./clinical-whatsapp-bridge-v300.js','WhatsApp · confirmações clínicas T−6h'],
  ['./gemini-sharing-guard-v250.js','Gate de privacidade do Gemini'],
  ['./public-clinical-storage-guard-v251.js','Gate de storage clínico público'],
  ['./clinical-reconcile-v270.js','Google Meet/Gemini · pipeline único'],
  ['./gemini-auto-associate-v342.js','Associação automática Gemini por agenda'],
  ['./gemini-historical-identity-repair-v272.js','Reparo cifrado de identidades históricas Gemini'],
  ['./ai-record-review-v220.js','Revisão de prontuário assistido'],
  ['./agenda-mobile-v183.js','Agenda mobile'],
  ['./session-payment-visibility-v322.js','Pagamento visível e vinculado às sessões'],
  ['./agenda-controller-v330.js','Agenda Controller v3.3'],
  ['./portable-tools-v153.js','Ferramentas portáteis'],
  ['./sync-semantic-conflict-cleanup-v260.js','Limpeza de falsos conflitos equivalentes'],
  ['./patient-closure-v172.js','Encerramento de paciente'],
  ['./version-v170.js','Versão visual'],
  ['./material-share-v162.js','Compartilhamento de materiais'],
  ['./mobile-ux-v170.js','UX mobile'],
  ['./patient-ux-v240.js','Contexto individual do paciente'],
  ['./pdf-engine-v320.js','Gerador PDF nativo'],
  ['./record-persistence-v320.js','Persistência verificada de prontuários'],
  ['./treatment-plan-intelligence-v320.js','Plano terapêutico longitudinal'],
  ['./tcc-goal-editor-v360.js','Objetivos terapêuticos estruturados TCC'],
  ['./session-tcc-prep-v360.js','Preparação assistida de sessão TCC'],
  ['./therapeutic-exercises-v360.js','Exercícios terapêuticos rápido/guiado'],
  ['./audio-assets-v360.js','Áudios terapêuticos revisados'],
  ['./patient-delivery-finance-v320.js','Materiais, e-mail, WhatsApp e recibos PDF'],
  ['./finance-interactions-v360.js','Detalhamento financeiro mensal'],
  ['./patient-workspace-v320.js','Workspace do paciente mobile first'],
  ['./clinical-autofix-v331.js','Triagem clínica automática e reparo de vínculos'],
  ['./clinical-data-integrity-v340.js','Integridade clínica, pacotes, duplicidades e prontuários ausentes'],
  ['./gemini-placeholder-guard-v350.js','Proteção de prontuários Gemini esperados'],
  ['./clinical-orchestrator-v320.js','Orquestração automática do ecossistema clínico'],
  ['./clinical-health-engine-v360.js','Clinical Health Engine v3.6']
];
for(const [path,label] of modules){try{await import(`${path}?v=3.6.0&rev=patient-hygiene-20260827`)}catch(err){console.error(`Falha em ${label}`,err);window.__rmPreBootErrors.push(`${label}: ${err?.message||err}`)}}

let auditNormalizeTimer=null;
async function normalizeAuditedDrafts(){
  try{
    const [{data,runtime,nowISO},{putEncrypted}]=await Promise.all([import('./state.js?v=3.6.0&rev=patient-hygiene-20260827'),import('./database.js?v=3.6.0&rev=patient-hygiene-20260827')]);
    if(runtime.locked||!runtime.key||!runtime.dataReady)return;
    for(const record of Array.isArray(data.records)?data.records:[]){
      const audited=record?.source?.kind==='gemini-meet-notes'&&Boolean(record?.source?.sourceStartedAt);
      if(!audited||record.status==='Finalizado')continue;
      let changed=false,next={...record};
      if(!next.title){next.title='Evolução de sessão';changed=true}
      if(next.status==='Rascunho assistido'||!next.status){next.status='Rascunho IA';next.requiresReview=true;changed=true}
      if(!changed)continue;
      next.updatedAt=nowISO();Object.assign(record,next);await putEncrypted('records',next,runtime.key);
    }
    document.querySelectorAll('[data-action="gemini-ai-hub-v240"]').forEach(button=>{button.dataset.action='gemini-ai-hub-v270';button.textContent='Preparar/revisar rascunho'});
  }catch(err){console.warn('Normalização final da auditoria clínica não concluída.',err)}
}
function queueAuditNormalize(delay=0){clearTimeout(auditNormalizeTimer);auditNormalizeTimer=setTimeout(()=>void normalizeAuditedDrafts(),delay)}
document.addEventListener('rm:data-ready',()=>queueAuditNormalize(700));
document.addEventListener('rm:local-data-changed',event=>{if(['clinical-audit-v280','gemini-materialize-v270','gemini-regenerate-v270'].includes(event.detail?.kind))queueAuditNormalize(80)});
document.addEventListener('rm:rendered',()=>queueAuditNormalize(0));

try{await import('./bootstrap-v240.js?v=3.6.0&rev=patient-hygiene-20260827');if(Array.isArray(window.__rmBootErrors)&&window.__rmPreBootErrors.length)window.__rmBootErrors.push(...window.__rmPreBootErrors)}catch(err){console.error('Falha crítica no bootstrap',err);window.__rmPreBootErrors.push(`Bootstrap: ${err?.message||String(err)}`);const box=document.getElementById('rm-boot-fallback');if(box)box.innerHTML=`<strong>Não foi possível iniciar a plataforma.</strong><div class="small">${String(err?.message||err).replace(/[<>]/g,'')}</div>`;document.dispatchEvent(new CustomEvent('rm:boot-failed',{detail:{message:err?.message||String(err)}}))}
