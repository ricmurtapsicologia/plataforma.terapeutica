import {data,runtime,selectedPatient,nowISO} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {esc,toast} from './ui.js';
import {FIELD} from './clinical-intake-core-v310.mjs';

const VERSION='3.2.0';
const KIND='therapeuticActionPlan';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let timer=null,running=false;
function clean(v=''){return String(v||'').replace(/\r/g,'').replace(/\s+/g,' ').trim()}
function uniq(values){const seen=new Set(),out=[];for(const raw of values){const v=clean(raw);const k=v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!v||seen.has(k))continue;seen.add(k);out.push(v)}return out}
function intakeFacts(note){const map=new Map();for(const section of arr(note?.intake?.sections))for(const item of arr(section.items)){const field=String(item?.field||''),value=clean(item?.patientReportedFact||'');if(field&&value){if(!map.has(field))map.set(field,[]);map.get(field).push(value)}}return map}
function facts(map,...fields){return uniq(fields.flatMap(field=>map.get(field)||[]))}
function recordSummary(r){return clean(r?.sessionSummary||r?.text||'').slice(0,900)}
function buildPlan(patientId){
  const intakes=arr(data.notes).filter(n=>n?.patientId===patientId&&n?.kind==='clinicalIntake').sort((a,b)=>String(b?.source?.submittedAt||b.createdAt||'').localeCompare(String(a?.source?.submittedAt||a.createdAt||'')));
  const latest=intakes[0]||null,map=intakeFacts(latest);
  const records=arr(data.records).filter(r=>r?.patientId===patientId&&clean(r.text||r.sessionSummary)).sort((a,b)=>`${b.date||''}${b.time||''}`.localeCompare(`${a.date||''}${a.time||''}`)).slice(0,10);
  const existingGoals=arr(data.goals).filter(g=>g?.patientId===patientId&&g.status!=='Alcançado').sort((a,b)=>Number(a.priority||99)-Number(b.priority||99));
  const problemTargets=facts(map,FIELD.reason,FIELD.currentDifficulty,FIELD.impactAreas,FIELD.repeatedPatterns,FIELD.relationalDifficulty);
  const objectives=uniq([...facts(map,FIELD.desiredChange,FIELD.expectations),...existingGoals.map(g=>g.title)]);
  const resources=facts(map,FIELD.strengths,FIELD.priorResources,FIELD.support,FIELD.helps);
  const barriers=facts(map,FIELD.triggers,FIELD.responsePattern,FIELD.coping,FIELD.selfTalk);
  const nextActions=uniq(records.flatMap(r=>String(r.followup||'').split(/\n|•|;/)).filter(Boolean)).slice(0,8);
  const evolution=records.slice(0,5).map(r=>({date:r.date||'',time:r.time||'',summary:recordSummary(r),followup:clean(r.followup||'')}));
  const interventions=uniq(existingGoals.map(g=>g.intervention).filter(Boolean));
  const indicators=uniq(existingGoals.map(g=>g.indicators).filter(Boolean));
  if(!problemTargets.length&&!objectives.length&&!resources.length&&!records.length)return null;
  return{version:VERSION,generatedAt:nowISO(),basedOn:{intakes:intakes.map(n=>n.id),records:records.map(r=>r.id),goals:existingGoals.map(g=>g.id)},problemTargets:problemTargets.slice(0,8),objectives:objectives.slice(0,8),resources:resources.slice(0,8),barriers:barriers.slice(0,8),interventions:interventions.slice(0,8),indicators:indicators.slice(0,8),nextActions,evolution,reviewRequired:true,autonomousDiagnosis:false};
}
function textPlan(plan){const out=['PLANO DE AÇÃO TERAPÊUTICO — RASCUNHO ASSISTIDO','Status: revisão profissional necessária',''];const add=(title,list)=>{if(!list?.length)return;out.push(title);for(const x of list)out.push(`• ${x}`);out.push('')};add('PROBLEMAS/FOCOS RELATADOS',plan.problemTargets);add('OBJETIVOS TERAPÊUTICOS',plan.objectives);add('RECURSOS E FATORES PROTETIVOS',plan.resources);add('BARREIRAS/PADRÕES A EXPLORAR',plan.barriers);add('INTERVENÇÕES JÁ REGISTRADAS',plan.interventions);add('INDICADORES JÁ REGISTRADOS',plan.indicators);add('PRÓXIMOS PASSOS EXTRAÍDOS DOS PRONTUÁRIOS',plan.nextActions);if(plan.evolution.length){out.push('EVOLUÇÃO RECENTE');for(const e of plan.evolution)out.push(`• ${e.date||'Sessão'}${e.time?` ${e.time}`:''}: ${e.summary}${e.followup?` | Retomar: ${e.followup}`:''}`)}out.push('','Este plano organiza Anamnese, objetivos e prontuários. Não cria diagnóstico nem substitui decisão clínica profissional.');return out.join('\n')}
async function refreshPatient(patientId,{render=true}={}){if(running||runtime.locked||!runtime.key||!runtime.dataReady||!patientId)return null;running=true;try{const plan=buildPlan(patientId);if(!plan)return null;const id=`treatment_plan_assisted_${patientId}`,old=arr(data.notes).find(n=>n?.id===id);const sourceSignature=JSON.stringify(plan.basedOn);if(old?.sourceSignature===sourceSignature&&old?.text===textPlan(plan))return old;const row={...(old||{}),id,patientId,kind:KIND,title:'Plano de ação terapêutico — assistido',status:'Rascunho assistido',reviewRequired:true,autonomousDiagnosis:false,plan,text:textPlan(plan),sourceSignature,createdAt:old?.createdAt||nowISO(),updatedAt:nowISO()};await bulkPutEncryptedAtomic([{storeName:'notes',values:[row]}],runtime.key,{verify:true});const i=data.notes.findIndex(n=>n.id===id);if(i>=0)data.notes[i]=row;else data.notes.push(row);document.dispatchEvent(new CustomEvent('rm:treatment-plan-updated',{detail:{patientId,id,at:row.updatedAt}}));if(render)window.__rmRender?.();return row}finally{running=false}}
function currentPlan(patientId){return arr(data.notes).find(n=>n?.patientId===patientId&&n?.kind===KIND)||null}
function listBlock(title,items){if(!items?.length)return'';return`<div class="mt-16"><strong>${esc(title)}</strong><ul class="mt-8">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`}
function decoratePlans(){if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='plans')return;const p=selectedPatient(),host=document.getElementById('patient-tab-content');if(!p||!host)return;host.querySelector('#rm-treatment-plan-v320')?.remove();const note=currentPlan(p.id),plan=note?.plan;if(!plan)return;const card=document.createElement('section');card.id='rm-treatment-plan-v320';card.className='card mb-16';card.innerHTML=`<div class="card-title"><div><div class="eyebrow">Integração longitudinal</div><h3 class="mb-0">Plano de ação terapêutico</h3></div><span class="badge">Rascunho assistido</span></div><p class="small muted mt-12">Atualizado automaticamente a partir da Anamnese, objetivos cadastrados e prontuários. Revise antes de transformar sugestões em conduta profissional.</p>${listBlock('Focos atuais',plan.problemTargets)}${listBlock('Objetivos',plan.objectives)}${listBlock('Recursos e fatores protetivos',plan.resources)}${listBlock('Barreiras/padrões a explorar',plan.barriers)}${listBlock('Intervenções registradas',plan.interventions)}${listBlock('Indicadores registrados',plan.indicators)}${listBlock('Próximos passos',plan.nextActions)}<div class="flex gap-8 wrap mt-16"><button class="btn secondary" data-rm-plan-refresh="1">Atualizar agora</button></div>`;host.prepend(card)}
function schedule(patientId='',delay=250){clearTimeout(timer);timer=setTimeout(()=>{const id=patientId||runtime.selectedPatientId||'';if(id)void refreshPatient(id,{render:false}).then(()=>decoratePlans()).catch(console.warn)},delay)}

document.addEventListener('click',e=>{if(!e.target.closest?.('[data-rm-plan-refresh]'))return;e.preventDefault();const p=selectedPatient();if(!p)return;void refreshPatient(p.id).then(()=>toast('Plano terapêutico assistido atualizado.','success')).catch(err=>toast(err.message||'Não foi possível atualizar o plano.','error'))},true);
document.addEventListener('rm:data-ready',()=>{for(const p of arr(data.patients))schedule(p.id,400+Math.random()*800)});
document.addEventListener('rm:local-data-changed',e=>{if(!['records','notes','goals'].includes(e.detail?.storeName)&&!String(e.detail?.kind||'').startsWith('clinical-intake'))return;const p=selectedPatient();if(p)schedule(p.id,300)});
document.addEventListener('rm:record-verified-save',e=>schedule(e.detail?.patientId||'',180));
document.addEventListener('rm:rendered',()=>decoratePlans());

globalThis.__rmTreatmentPlan={version:VERSION,refresh:refreshPatient,current:currentPlan};
