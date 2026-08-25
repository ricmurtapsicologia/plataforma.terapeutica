import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};

const records=read('assets/js/record-persistence-v320.js');
const recordsUi=read('assets/js/modules/records.js');
assert(recordsUi.includes('record-session'),'Prontuário precisa estar vinculado à sessão.');
assert(records.includes('bulkPutEncryptedAtomic')&&records.includes('getDecryptedById'),'Salvamento deve gravar e reler o prontuário.');
assert(records.includes("if(!editor.text){if(autosave)return false"),'Autosave vazio não pode sobrescrever conteúdo.');
assert(records.includes("existing?.status==='Finalizado'"),'Registro finalizado não pode ser sobrescrito silenciosamente.');

const orchestrator=read('assets/js/clinical-orchestrator-v320.js');
for(const term of ['performSync','reconcileGemini','reconcileClinicalIntakes','rm:data-ready','rm:google-workspace-authorized'])assert(orchestrator.includes(term),`Orquestrador sem ${term}.`);

const plan=read('assets/js/treatment-plan-intelligence-v320.js');
for(const term of ["kind==='clinicalIntake'",'data.records','problemTargets','objectives','resources','nextActions','reviewRequired:true','autonomousDiagnosis:false'])assert(plan.includes(term),`Plano terapêutico sem ${term}.`);

const intake=read('assets/js/clinical-intake-patient-ui-v312.js');
for(const term of ['Principais achados para condução','Demanda atual','Recursos e apoio','Objetivos e expectativas'])assert(intake.includes(term),`Anamnese clínica sem ${term}.`);

const sessions=read('assets/js/modules/sessions.js');
assert(sessions.includes("['Preparação','Sessão','Registro','Plano e encaminhamentos','Continuidade']"),'Fluxo de atendimento deve possuir cinco etapas.');
assert(!sessions.includes("'Financeiro','Encerramento'"),'Financeiro/encerramento não devem integrar o stepper clínico.');

const pdf=read('assets/js/pdf-engine-v320.js');
assert(pdf.includes("%PDF-1.4"),'Saída deve ser PDF real.');
const delivery=read('assets/js/patient-delivery-finance-v320.js');
for(const term of ['gmail.send','application/pdf','Gerar recibo do mês','appointmentIds','WhatsApp + PDF','E-mail + PDF'])assert(delivery.includes(term),`Entrega/financeiro sem ${term}.`);
assert(delivery.includes('Este recibo possui finalidade administrativa/financeira'),'Recibo deve preservar a ressalva do modelo oficial.');
assert(!delivery.includes('084.906.407-42'),'CPF profissional não pode ser publicado no repositório.');

const oauth=read('assets/js/google-workspace-oauth-v200.js');
assert(oauth.includes('WORKSPACE_FULL_SCOPES'),'OAuth deve solicitar escopos completos quando o usuário autorizar.');

console.log('clinical-v320 invariants: PASS');
