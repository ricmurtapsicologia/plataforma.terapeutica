import {data,runtime,selectedPatient,nowISO} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {esc,toast} from './ui.js';
import {FIELD} from './clinical-intake-core-v310.mjs';

const VERSION='3.4.0';
const KIND='therapeuticActionPlan';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const pending=new Map();let worker=null;
function clean(v=''){return String(v||'').replace(/\r/g,'').replace(/\s+/g,' ').trim()}
function uniq(values){const seen=new Set(),out=[];for(const raw of values){const v=clean(raw);const k=v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(!v||seen.has(k))continue;seen.add(k);out.push(v)}return out}
function intakeFacts(note){const map=new Map();for(const section of arr(note?.intake?.sections))for(const item of arr(section.items)){const field=String(item?.field||''),value=clean(item?.patientReportedFact||'');if(field&&value){if(!map.has(field))map.set(field,[]);map.get(field).push(value)}}return map}
function facts(map,...fields){return uniq(fields.flatMap(field=>map.get(field)||[]))}
function recordSummary(r){return clean(r?.sessionSummary||r?.text||'').slice(0,900)}
function formulationFromFacts(map){
  const predisposing=facts(map,FIELD.childhood,FIELD.caregivers,FIELD.emotionalResponse,FIELD.feelingsSpace,FIELD.earlyMaturity,FIELD.formativeExperience);
  const precipitating=facts(map,FIELD.reason,FIELD.currentDifficulty,FIELD.triggers);
  const maintaining=facts(map,FIELD.responsePattern,FIELD.coping,FIELD.selfTalk,FIELD.repeatedPatterns,FIELD.relationalDifficulty);
  const protective=facts(map,FIELD.strengths,FIELD.priorResources,FIELD.support,FIELD.helps);
  const automaticThoughts=facts(map,FIELD.selfTalk);
  const behaviors=facts(map,FIELD.responsePattern,FIELD.coping);
  const hypotheses=[];
  if(maintaining.length)hypotheses.push('Verificar clinicamente se os padrões de resposta e enfrentamento relatados contribuem para a manutenção das dificuldades atuais.');
  if(predisposing.length&&precipitating.length)hypotheses.push('Explorar a relação entre experiências relevantes da história de desenvolvimento e a forma atual de interpretar/responder aos gatilhos descritos, sem assumir causalidade antes da avaliação.');
  return{predisposing,precipitating,maintaining,protective,automaticThoughts,behaviors,hypotheses};
}
function buildPlan(patientId){
  const intakes=arr(data.notes).filter(n=>n?.patientId===patientId&&n?.kind==='clinicalIntake').sort((a,b)=>String(b?.source?.submittedAt||b.createdAt||'').localeCompare(String(a?.source?.submittedAt||a.createdAt||'')));
  const latest=intakes[0]||null,map=intakeFacts(latest);
  const records=arr(data.records).filter(r=>r?.patientId===patientId&&clean(r.text||r.sessionSummary)&&r?.source?.type!=='missing-record-placeholder').sort((a,b)=>`${b.date||''}${b.time||''}`.localeCompare(`${a.date||''}${a.time||''}`)).slice(0,12);
  const existingGoals=arr(data.goals).filter(g=>g?.patientId===patientId&&g.status!=='Alcançado').sort((a,b)=>Number(a.priority||99)-Number(b.priority||99));
  const problemTargets=facts(map,FIELD.reason,FIELD.currentDifficulty,FIELD.impactAreas,FIELD.repeatedPatterns,FIELD.relationalDifficulty);
  const objectives=uniq([...facts(map,FIELD.desiredChange,FIELD.expectations),...existingGoals.map(g=>g.title)]);
  const resources=facts(map,FIELD.strengths,FIELD.priorResources,FIELD.support,FIELD.helps);
  const barriers=facts(map,FIELD.triggers,FIELD.responsePattern,FIELD.coping,FIELD.selfTalk);
  const nextActions=uniq(records.flatMap(r=>String(r.followup||'').split(/\n|•|;/)).filter(Boolean)).slice(0,10);
  const evolution=records.slice(0,6).map(r=>({date:r.date||'',time:r.time||'',summary:recordSummary(r),followup:clean(r.followup||'')}));
  const interventions=uniq(existingGoals.map(g=>g.intervention).filter(Boolean));
  const indicators=uniq(existingGoals.map(g=>g.indicators).filter(Boolean));
  const formulation=formulationFromFacts(map);
  if(!problemTargets.length&&!objectives.length&&!resources.length&&!records.length&&!formulation.predisposing.length)return null;
  const sourceSignature=JSON.stringify({intakes:intakes.map(n=>[n.id,n.updatedAt||n?.source?.submittedAt||'',n?.intake?.sourceHash||'']),records:records.map(r=>[r.id,r.updatedAt||'',r.status||'']),goals:existingGoals.map(g=>[g.id,g.updatedAt||'',g.status||'',clean(g.title),clean(g.intervention),clean(g.indicators)])});
  return{version:VERSION,generatedAt:nowISO(),basedOn:{intakes:intakes.map(n=>n.id),records:records.map(r=>r.id),goals:existingGoals.map(g=>g.id)},sourceSignature,problemTargets:problemTargets.slice(0,10),objectives:objectives.slice(0,10),resources:resources.slice(0,10),barriers:barriers.slice(0,10),formulation,interventions:interventions.slice(0,10),indicators:indicators.slice(0,10),nextActions,evolution,reviewRequired:true,autonomousDiagnosis:false};
}
function textPlan(plan){
  const out=['PLANO TERAPÊUTICO — RASCUNHO ASSISTIDO','Referencial principal: Terapia Cognitivo-Comportamental','Status: revisão profissional necessária',''];
  const add=(title,list)=>{if(!list?.length)return;out.push(title);for(const x of list)out.push(`• ${x}`);out.push('')};
  add('1. DEMANDAS E PROBLEMAS-ALVO',plan.problemTargets);
  add('2. OBJETIVOS TERAPÊUTICOS',plan.objectives);
  add('3. RECURSOS E FATORES PROTETIVOS',plan.resources);
  add('4. BARREIRAS E PADRÕES RELEVANTES',plan.barriers);
  add('5. FORMULAÇÃO TCC — FATORES PREDISPONENTES',plan.formulation?.predisposing);
  add('6. FORMULAÇÃO TCC — FATORES PRECIPITANTES',plan.formulation?.precipitating);
  add('7. FORMULAÇÃO TCC — FATORES DE MANUTENÇÃO',plan.formulation?.maintaining);
  add('8. FORMULAÇÃO TCC — FATORES PROTETIVOS',plan.formulation?.protective);
  add('9. HIPÓTESES DE TRABALHO A TESTAR',plan.formulation?.hypotheses);
  add('10. INTERVENÇÕES JÁ REGISTRADAS/PLANEJADAS',plan.interventions);
  add('11. INDICADORES DE ACOMPANHAMENTO',plan.indicators);
  add('12. PRÓXIMOS PASSOS EXTRAÍDOS DOS PRONTUÁRIOS',plan.nextActions);
  if(plan.evolution.length){out.push('13. EVOLUÇÃO RECENTE');for(const e of plan.evolution)out.push(`• ${e.date||'Sessão'}${e.time?` ${e.time}`:''}: ${e.summary}${e.followup?` | Retomar: ${e.followup}`:''}`);out.push('')}
  out.push('Revisão clínica: confirmar prioridades, transformar objetivos em metas observáveis quando possível, definir intervenções e indicadores coerentes com a formulação, e atualizar hipóteses conforme novos dados.');
  out.push('Este documento organiza dados existentes. Não cria diagnóstico nem substitui decisão clínica profissional.');
  return out.join('\n');
}
function seedFormulationObject(patientId,plan){
  const existing=arr(data.formulations).find(f=>f?.patientId===patientId);if(existing&&!existing.autoSeeded)return null;
  const fields={...(existing?.fields||{})};const put=(key,values)=>{if(!clean(fields[key])&&values?.length)fields[key]=values.map(x=>`• ${x}`).join('\n')};
  put('demand',plan.problemTargets);put('targets',plan.problemTargets);put('predisposing',plan.formulation?.predisposing);put('precipitating',plan.formulation?.precipitating);put('maintaining',plan.formulation?.maintaining);put('protective',plan.formulation?.protective);put('resources',plan.resources);put('automaticThoughts',plan.formulation?.automaticThoughts);put('behaviors',plan.formulation?.behaviors);put('hypotheses',plan.formulation?.hypotheses);
  const interventions=plan.interventions||[];put('interventions',interventions);const cycle={...(existing?.cycle||{})};if(!clean(cycle[0])&&plan.formulation?.precipitating?.length)cycle[0]=plan.formulation.precipitating.join('\n');if(!clean(cycle[1])&&plan.formulation?.automaticThoughts?.length)cycle[1]=plan.formulation.automaticThoughts.join('\n');if(!clean(cycle[4])&&plan.formulation?.behaviors?.length)cycle[4]=plan.formulation.behaviors.join('\n');if(!clean(cycle[7])&&plan.formulation?.maintaining?.length)cycle[7]=plan.formulation.maintaining.join('\n');
  return{...(existing||{}),id:existing?.id||`form_assisted_${patientId}`,patientId,fields,cycle,version:Number(existing?.version||0)+1,autoSeeded:true,requiresReview:true,createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};
}
async function refreshPatient(patientId,{render=true}={}){
  if(runtime.locked||!runtime.key||!runtime.dataReady||!patientId)return null;const plan=buildPlan(patientId);if(!plan)return null;
  const id=`treatment_plan_assisted_${patientId}`,old=arr(data.notes).find(n=>n?.id===id),text=textPlan(plan),writes=[];
  let row=old;
  if(!(old?.sourceSignature===plan.sourceSignature&&old?.text===text)){row={...(old||{}),id,patientId,kind:KIND,title:'Plano terapêutico TCC — assistido',status:'Rascunho assistido',reviewRequired:true,autonomousDiagnosis:false,plan,text,sourceSignature:plan.sourceSignature,createdAt:old?.createdAt||nowISO(),updatedAt:nowISO()};writes.push({storeName:'notes',values:[row]})}
  const formulation=seedFormulationObject(patientId,plan);if(formulation)writes.push({storeName:'formulations',values:[formulation]});
  if(writes.length)await bulkPutEncryptedAtomic(writes,runtime.key,{verify:true});
  if(row&&row!==old){const i=data.notes.findIndex(n=>n.id===id);if(i>=0)data.notes[i]=row;else data.notes.push(row)}
  if(formulation){const i=data.formulations.findIndex(f=>f.patientId===patientId);if(i>=0)data.formulations[i]=formulation;else data.formulations.push(formulation)}
  if(writes.length)document.dispatchEvent(new CustomEvent('rm:treatment-plan-updated',{detail:{patientId,id,at:nowISO()}}));if(render)window.__rmRender?.();return row||old;
}
function currentPlan(patientId){return arr(data.notes).find(n=>n?.patientId===patientId&&n?.kind===KIND)||null}
function listBlock(title,items){if(!items?.length)return'';return`<div class="mt-16"><strong>${esc(title)}</strong><ul class="mt-8">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`}
function decoratePlans(){if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='plans')return;const p=selectedPatient(),host=document.getElementById('patient-tab-content');if(!p||!host)return;host.querySelector('#rm-treatment-plan-v320')?.remove();const note=currentPlan(p.id),plan=note?.plan;if(!plan)return;const card=document.createElement('section');card.id='rm-treatment-plan-v320';card.className='card mb-16';card.innerHTML=`<div class="card-title"><div><div class="eyebrow">Plano longitudinal · TCC</div><h3 class="mb-0">Plano terapêutico</h3></div><span class="badge">Rascunho assistido</span></div><p class="small muted mt-12">Estrutura atualizada a partir da Anamnese, Formulação TCC, objetivos cadastrados e prontuários. Revise prioridades, metas, intervenções e indicadores antes de adotar como plano clínico.</p>${listBlock('Demandas e problemas-alvo',plan.problemTargets)}${listBlock('Objetivos terapêuticos',plan.objectives)}${listBlock('Recursos e fatores protetivos',plan.resources)}${listBlock('Fatores de manutenção',plan.formulation?.maintaining)}${listBlock('Hipóteses de trabalho a testar',plan.formulation?.hypotheses)}${listBlock('Intervenções registradas/planejadas',plan.interventions)}${listBlock('Indicadores de acompanhamento',plan.indicators)}${listBlock('Próximos passos',plan.nextActions)}<div class="flex gap-8 wrap mt-16"><button class="btn secondary" data-rm-plan-refresh="1">Atualizar agora</button><button class="btn secondary" data-action="patient-tab" data-tab="formulation">Abrir Formulação TCC</button></div>`;host.prepend(card)}
async function drain(){if(worker)return worker;worker=(async()=>{while(pending.size){const [patientId,render]=pending.entries().next().value;pending.delete(patientId);try{await refreshPatient(patientId,{render:false})}catch(err){console.warn('Plano terapêutico assistido:',err)}if(render)decoratePlans()}})().finally(()=>{worker=null});return worker}
function schedule(patientId='',delay=250,{render=false}={}){const id=patientId||runtime.selectedPatientId||'';if(!id)return;pending.set(id,Boolean(render)||Boolean(pending.get(id)));setTimeout(()=>void drain(),delay)}
async function refreshAll(){for(const p of arr(data.patients))if(p?.id&&p.status!=='Profissional')pending.set(p.id,false);await drain();decoratePlans()}

document.addEventListener('click',e=>{if(!e.target.closest?.('[data-rm-plan-refresh]'))return;e.preventDefault();const p=selectedPatient();if(!p)return;void refreshPatient(p.id).then(()=>toast('Plano terapêutico e Formulação TCC atualizados para revisão.','success')).catch(err=>toast(err.message||'Não foi possível atualizar o plano.','error'))},true);
document.addEventListener('rm:data-ready',()=>setTimeout(()=>void refreshAll(),900));
document.addEventListener('rm:data-patched',()=>setTimeout(()=>void refreshAll(),650));
document.addEventListener('rm:local-data-changed',e=>{if(!['records','notes','goals'].includes(e.detail?.storeName)&&!String(e.detail?.kind||'').startsWith('clinical-intake')&&!String(e.detail?.kind||'').startsWith('clinical-data-integrity'))return;const p=selectedPatient();if(p)schedule(p.id,300,{render:true});else setTimeout(()=>void refreshAll(),450)});
document.addEventListener('rm:record-verified-save',e=>schedule(e.detail?.patientId||'',220,{render:true}));
document.addEventListener('rm:rendered',()=>decoratePlans());

globalThis.__rmTreatmentPlan={version:VERSION,refresh:refreshPatient,refreshAll,current:currentPlan};
