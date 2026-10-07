export const RUNTIME_MANIFEST_VERSION='3.7.6';

export const RUNTIME_PHASES=[
  {
    id:'platform',
    modules:[
      ['../platform-runtime-v300.js','Runtime consolidado v3'],
      ['../migration-router-v300.js','Roteador de migrações condicionais'],
      ['../google-workspace-oauth-v201.js','Google Workspace OAuth'],
      ['../google-workspace-auto-renew-v264.js','Renovação silenciosa do Google Workspace']
    ]
  },
  {
    id:'private-clinical-data',
    modules:[
      ['../patient-hygiene-v100.js','Higiene privada de pacientes e anamneses'],
      ['../clinical-private-create-missing-v351.js','Criação clínica privada de registros ausentes'],
      ['../clinical-private-reconciliation-v350.js','Conciliação clínica privada via Google Drive'],
      ['../clinical-private-source-reassignment-v352.js','Reatribuição clínica privada por fonte canônica'],
      ['../clinical-private-record-import-v353.js','Importação privada de prontuários']
    ]
  },
  {
    id:'clinical-inputs',
    modules:[
      ['../clinical-intake-runtime-v310.js','Clinical Intake · Anamnese'],
      ['../clinical-intake-patient-ui-v312.js','Anamnese · área clínica do paciente'],
      ['../clinical-icaps-runtime-v400.js','Integração de rastreio clínico'],
      ['../clinical-assessment-v360.js','Complementação estruturada da avaliação clínica'],
      ['../patient-status-v350.js','Status clínico Ativo/Inativo'],
      ['../patient-billing-profile-v360.js','Perfil financeiro avulso/pacote/mensal']
    ]
  },
  {
    id:'integrations',
    modules:[
      ['../calendar-adapter-v300.js','CalendarAdapter v3'],
      ['../clinical-whatsapp-bridge-v300.js','WhatsApp · confirmações administrativas T−6h'],
      ['../gemini-sharing-guard-v250.js','Gate de privacidade do Gemini'],
      ['../public-clinical-storage-guard-v251.js','Gate de storage clínico público'],
      ['../clinical-reconcile-v270.js','Google Meet/Gemini · pipeline único'],
      ['../gemini-auto-associate-v342.js','Associação automática Gemini por agenda'],
      ['../gemini-historical-identity-repair-v272.js','Reparo cifrado de identidades históricas Gemini'],
      ['../ai-record-review-v220.js','Revisão de prontuário assistido'],
      ['../gemini-review-context-v341.js','Contexto de revisão Gemini']
    ]
  },
  {
    id:'agenda-session',
    modules:[
      ['../agenda-mobile-v183.js','Agenda mobile'],
      ['../session-payment-visibility-v322.js','Pagamento visível e vinculado às sessões'],
      ['../agenda-controller-v330.js','Agenda Controller v3.3'],
      ['../clinical-session-runtime-v370.js','Sessão clínica · iniciar Meet, cronometrar e encerrar'],
      ['../clinical-session-header-v371.js','Cabeçalho de sessão clínica'],
      ['../clinical-documentation-guard-v374.js','Gate de documentação clínica'],
      ['../clinical-test-artifact-cleanup-v375.js','Saneamento explícito de artefatos sintéticos']
    ]
  },
  {
    id:'patient-treatment',
    modules:[
      ['../portable-tools-v153.js','Ferramentas portáteis'],
      ['../sync-semantic-conflict-cleanup-v260.js','Limpeza de falsos conflitos equivalentes'],
      ['../patient-closure-v172.js','Encerramento de paciente'],
      ['../version-v170.js','Versão visual'],
      ['../material-share-v162.js','Compartilhamento de materiais'],
      ['../mobile-ux-v170.js','UX mobile'],
      ['../patient-ux-v240.js','Contexto individual do paciente'],
      ['../pdf-engine-v320.js','Gerador PDF nativo'],
      ['../record-persistence-v320.js','Persistência verificada de prontuários'],
      ['./clinical-record-normalization-v376.js','Normalização governada de rascunhos clínicos'],
      ['../treatment-plan-intelligence-v320.js','Plano terapêutico longitudinal'],
      ['../tcc-goal-editor-v360.js','Objetivos terapêuticos estruturados TCC'],
      ['../session-tcc-prep-v360.js','Preparação assistida de sessão TCC'],
      ['../therapeutic-exercises-v360.js','Exercícios terapêuticos rápido/guiado'],
      ['../audio-assets-v360.js','Áudios terapêuticos revisados'],
      ['../patient-delivery-finance-v320.js','Materiais, e-mail, WhatsApp e recibos PDF'],
      ['../finance-interactions-v360.js','Detalhamento financeiro mensal'],
      ['../patient-workspace-v320.js','Workspace do paciente mobile first']
    ]
  },
  {
    id:'governance',
    modules:[
      ['../clinical-autofix-v331.js','Triagem clínica assistida'],
      ['../clinical-data-integrity-v340.js','Integridade clínica e consistência estrutural'],
      ['../gemini-placeholder-guard-v350.js','Proteção de prontuários Gemini esperados'],
      ['../clinical-orchestrator-v320.js','Orquestração do ecossistema clínico'],
      ['../clinical-health-engine-v360.js','Diagnóstico da plataforma']
    ]
  }
];

export const RUNTIME_MODULE_COUNT=RUNTIME_PHASES.reduce((total,phase)=>total+phase.modules.length,0);

export async function loadClinicalRuntime({version='3.7.5',revision='clinical-runtime-v376',onError=()=>{}}={}){
  const results=[];
  for(const phase of RUNTIME_PHASES){
    for(const [path,label] of phase.modules){
      try{
        await import(`${path}?v=${encodeURIComponent(version)}&rev=${encodeURIComponent(revision)}`);
        results.push({phase:phase.id,path,label,ok:true});
      }catch(error){
        onError({phase:phase.id,path,label,error});
        results.push({phase:phase.id,path,label,ok:false,error:String(error?.message||error)});
      }
    }
  }
  return{version:RUNTIME_MANIFEST_VERSION,count:RUNTIME_MODULE_COUNT,results};
}
