import {APP_VERSION,STORE_NAMES,data,runtime,nowISO} from './state.js';
import {verifyActivityChain} from './audit.js';
import {backupStatus} from './backup.js';
import {modal,toast,esc} from './ui.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';
import {appointmentIsPerformed,paymentStateForAppointment} from './payment-status-v322.mjs';

const VERSION='3.6.0';
const PERIODIC_MS=300000;
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false,lastReport=null,timer=null;

function issue(code,severity,problem,evidence='',repair='',result=''){return{code,severity,problem,evidence,repair,result}}
function recordsFor(a){return arr(data.records).filter(r=>r?.patientId===a?.patientId&&(r?.appointmentId===a?.id||(a?.clinicalSessionId&&r?.clinicalSessionId===a.clinicalSessionId)||(r?.date===a?.date&&(!r?.time||!a?.time||r.time===a.time))))}
function placeholder(r){return r?.source?.type==='missing-record-placeholder'||String(r?.text||'').trim()==='Não há prontuário.'}
function patientById(id){return arr(data.patients).find(p=>p?.id===id)||null}
function duplicateGroups(){const m=new Map();for(const p of arr(data.patients).filter(p=>p?.status!=='Profissional')){const k=normalizeIdentity(p?.name||p?.preferredName||'');if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(p)}return[...m.values()].filter(x=>x.length>1)}
function syntheticCandidates(){return arr(data.patients).filter(p=>p?.syntheticCandidate===true)}
function activePatient(p){return !['Inativo','Encerrado','Arquivado'].includes(String(p?.status||''))}
function metricSummary(report){const rows=report?.issues||[];return{p0:rows.filter(x=>x.severity==='P0').length,error:rows.filter(x=>x.severity==='ERRO').length,attention:rows.filter(x=>x.severity==='ATENÇÃO'||x.severity==='P1').length,repaired:rows.filter(x=>x.severity==='REPARADO'||x.result==='REPARADO').length}}

async function scan({stage='scan'}={}){
  const issues=[];
  const build=String(document.querySelector('meta[name="rm-build"]')?.content||'');
  if(!build.startsWith(APP_VERSION))issues.push(issue('BUILD_VERSION','ERRO','Build e versão lógica divergentes.',`APP_VERSION=${APP_VERSION}; build=${build||'ausente'}`,'Recarregar arquivos versionados.','PENDENTE'));
  else issues.push(issue('BUILD_VERSION','OK','Versão/build coerentes.',build,'—','OK'));

  const missingStores=STORE_NAMES.filter(name=>!Array.isArray(data[name]));
  issues.push(missingStores.length?issue('STORES','ERRO','Stores clínicos indisponíveis.',missingStores.join(', '),'Reabrir cofre/migração.','PENDENTE'):issue('STORES','OK','Stores clínicos carregados.',`${STORE_NAMES.length} stores`,'—','OK'));

  try{const audit=await verifyActivityChain();issues.push(audit.ok?issue('AUDIT','OK','Trilha local íntegra.',`${audit.count} eventos`,'—','OK'):issue('AUDIT','ERRO','Trilha local inconsistente.',String(audit.id||'evento não identificado'),'Revisão manual obrigatória.','PENDENTE'))}catch(err){issues.push(issue('AUDIT','ATENÇÃO','Não foi possível verificar a trilha local.',String(err?.message||err),'Repetir verificação.','PENDENTE'))}
  try{const backup=await backupStatus();const days=Number(backup?.days);issues.push(Number.isFinite(days)&&days<=7?issue('BACKUP','OK','Backup recente.',`${days} dia(s)`,'—','OK'):issue('BACKUP','ATENÇÃO','Backup externo precisa ser renovado.',Number.isFinite(days)?`${days} dia(s)`:'sem data disponível','Gerar .rmvault no próximo acesso assistido.','PENDENTE'))}catch(err){issues.push(issue('BACKUP','ATENÇÃO','Status de backup indisponível.',String(err?.message||err),'Gerar backup manual.','PENDENTE'))}

  const duplicates=duplicateGroups();issues.push(duplicates.length?issue('DUPLICATES','ATENÇÃO','Cadastros com nome idêntico ainda existem.',`${duplicates.length} grupo(s)`,'Mesclar somente quando identidade for segura.','PENDENTE'):issue('DUPLICATES','OK','Sem duplicidade nominal exata.','','—','OK'));
  const synthetic=syntheticCandidates();issues.push(synthetic.length?issue('SYNTHETIC','REPARADO','Cadastros sintéticos isolados.',`${synthetic.length} cadastro(s) ocultados como inativos`,'Quarentena sem exclusão.','REPARADO'):issue('SYNTHETIC','OK','Sem cadastros sintéticos pendentes.','','—','OK'));

  const orphan=arr(data.appointments).filter(a=>a?.patientId&&!patientById(a.patientId));issues.push(orphan.length?issue('ORPHAN_APPOINTMENTS','P0','Sessões órfãs sem paciente.',`${orphan.length} sessão(ões)`,'Não reparar sem identidade inequívoca.','PENDENTE'):issue('ORPHAN_APPOINTMENTS','OK','Sem sessões órfãs.','','—','OK'));

  let missingRecord=0,placeholderCount=0,unpaid=0,reconciledOnly=0;
  for(const a of arr(data.appointments).filter(appointmentIsPerformed)){
    const rs=recordsFor(a);if(!rs.length)missingRecord++;else if(rs.some(placeholder))placeholderCount++;
    const pay=paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments});if(pay.code==='unpaid')unpaid++;if(pay.code==='paid'&&!pay.payment&&pay.source!=='payment')reconciledOnly++;
  }
  issues.push(missingRecord?issue('PRESENT_WITHOUT_RECORD','P0','Sessão realizada sem qualquer prontuário.',`${missingRecord} sessão(ões)`,'Criar placeholder editável.','PENDENTE'):issue('PRESENT_WITHOUT_RECORD','OK','Toda sessão realizada possui estado de prontuário.',placeholderCount?`${placeholderCount} ainda em AUSENTE/EDITÁVEL`:'todos materializados','—','OK'));
  if(placeholderCount)issues.push(issue('PLACEHOLDER_RECORDS','ATENÇÃO','Há prontuários ausentes explicitamente sinalizados.',`${placeholderCount} sessão(ões)`,'Manter editável até prontuário real/Gemini persistido.','PENDENTE'));
  issues.push(unpaid?issue('PERFORMED_UNPAID','P1','Há sessões realizadas ainda sem quitação conciliada.',`${unpaid} sessão(ões)`,'Conferir pagamento avulso/pacote/competência.','PENDENTE'):issue('PERFORMED_UNPAID','OK','Todas as sessões realizadas auditadas estão quitadas ou conciliadas.','','—','OK'));
  if(reconciledOnly)issues.push(issue('RECONCILED_WITHOUT_RECEIPT','ATENÇÃO','Sessões pagas por conciliação sem lançamento financeiro individual.',`${reconciledOnly} sessão(ões)`,'Financeiro deve exibir a origem conciliada.','PENDENTE'));

  const partialPackages=arr(data.payments).filter(p=>p?.status==='Pago'&&p?.allocationStatus==='partial');issues.push(partialPackages.length?issue('PARTIAL_PACKAGES','ATENÇÃO','Pacotes/mensalidades com saldo ainda não alocado.',`${partialPackages.length} pagamento(s)`,'Manter saldo de crédito e não atravessar competência sem regra explícita.','PENDENTE'):issue('PARTIAL_PACKAGES','OK','Sem pacote parcialmente alocado detectado.','','—','OK'));

  const active=arr(data.patients).filter(activePatient),inactive=arr(data.patients).filter(p=>!activePatient(p)&&p?.status!=='Profissional');
  issues.push(issue('PATIENT_STATUS','OK','Separação ativo/desativado disponível.',`${active.length} ativos · ${inactive.length} desativados`,'—','OK'));

  const withoutFormulation=active.filter(p=>!arr(data.formulations).some(f=>f?.patientId===p.id)).length;
  const withoutPlan=active.filter(p=>!arr(data.goals).some(g=>g?.patientId===p.id)&&!arr(data.notes).some(n=>n?.patientId===p.id&&n?.kind==='therapeuticActionPlan')).length;
  if(withoutFormulation)issues.push(issue('FORMULATION_COVERAGE','ATENÇÃO','Pacientes ativos sem Formulação TCC registrada.',`${withoutFormulation} paciente(s)`,'Gerar/editar hipótese de trabalho, sem finalização autônoma.','PENDENTE'));
  if(withoutPlan)issues.push(issue('PLAN_COVERAGE','ATENÇÃO','Pacientes ativos sem plano terapêutico estruturado.',`${withoutPlan} paciente(s)`,'Preparar rascunho assistido para revisão profissional.','PENDENTE'));

  const orchestrator=globalThis.__rmClinicalOrchestratorStatus;issues.push(orchestrator?.status==='ready'?issue('ECOSYSTEM','OK','Orquestrador do ecossistema íntegro.',orchestrator.detail||'','—','OK'):issue('ECOSYSTEM','ATENÇÃO','Orquestrador ainda não confirmou estado verde.',orchestrator?.detail||'aguardando execução','Executar ciclo integrado.','PENDENTE'));
  return{version:VERSION,appVersion:APP_VERSION,stage,at:nowISO(),issues,summary:metricSummary({issues})}
}

async function run({repair=true,show=false,reason='automatic'}={}){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;running=true;
  try{
    const before=await scan({stage:'before'});let repairResult=null;
    if(repair&&globalThis.__rmClinicalDataIntegrity?.run)repairResult=await globalThis.__rmClinicalDataIntegrity.run({render:false});
    if(repair&&globalThis.__rmPrivateClinicalReconciliation?.run)try{await globalThis.__rmPrivateClinicalReconciliation.run()}catch{}
    const after=await scan({stage:'after'});lastReport={version:VERSION,reason,at:nowISO(),before,repairResult,after};globalThis.__rmClinicalHealthReport=lastReport;
    document.dispatchEvent(new CustomEvent('rm:clinical-health',{detail:lastReport}));
    if(show)showReport(lastReport);return lastReport
  }finally{running=false}
}

function statusBadge(row){const s=row.severity;return`<span class="badge">${esc(s)}</span>`}
function rowsHtml(report){return arr(report?.after?.issues).map(row=>`<tr><td>${statusBadge(row)}</td><td><strong>${esc(row.problem)}</strong><div class="tiny muted">${esc(row.code)}</div></td><td>${esc(row.evidence||'—')}</td><td>${esc(row.repair||'—')}</td><td>${esc(row.result||'—')}</td></tr>`).join('')}
function showReport(report){const s=report?.after?.summary||{};modal('Autodiagnóstico clínico 3.6',`<section class="grid grid-4"><div class="card"><div class="tiny muted">P0</div><strong>${s.p0||0}</strong></div><div class="card"><div class="tiny muted">Erros</div><strong>${s.error||0}</strong></div><div class="card"><div class="tiny muted">Atenções</div><strong>${s.attention||0}</strong></div><div class="card"><div class="tiny muted">Reparados</div><strong>${s.repaired||0}</strong></div></section><div class="notice mt-12">Autorreparo atua apenas em integridade estrutural/administrativa. Conteúdo clínico interpretativo permanece sob revisão profissional.</div><div class="table-wrap mt-16"><table class="table"><thead><tr><th>Status</th><th>Problema</th><th>Evidência</th><th>Reparo</th><th>Resultado</th></tr></thead><tbody>${rowsHtml(report)}</tbody></table></div>`,`<button class="btn secondary" data-action="close-modal">Fechar</button>`,true)}

function queue(delay=1200){clearTimeout(timer);timer=setTimeout(()=>void run({repair:true,show:false,reason:'maintenance'}).catch(err=>console.warn('ClinicalHealthEngine',err)),delay)}
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-action="run-diagnostics"]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();void run({repair:true,show:true,reason:'manual'}).then(report=>{if(report)toast(report.after.summary.p0?`Diagnóstico concluído com ${report.after.summary.p0} falha(s) P0.`:'Diagnóstico concluído sem falhas P0.',report?.after?.summary?.p0?'error':'success')})},true);
document.addEventListener('rm:data-ready',()=>queue(1700));
document.addEventListener('rm:local-data-changed',event=>{if(String(event.detail?.kind||'').startsWith('clinical-health'))return;queue(2200)});
setInterval(()=>{if(document.visibilityState==='visible'&&runtime.dataReady&&!runtime.locked)queue(0)},PERIODIC_MS);

globalThis.__rmClinicalHealthEngine={version:VERSION,run,scan,status:()=>lastReport,show:()=>lastReport&&showReport(lastReport)};
