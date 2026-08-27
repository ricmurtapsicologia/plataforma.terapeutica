import {data,runtime,selectedPatient} from './state.js';
import {esc} from './ui.js';

const REVIEW_STATUS='AWAITING_PSYCHOLOGIST_REVIEW';
function arr(v){return Array.isArray(v)?v.filter(Boolean):[]}
function patientIntakes(patientId){return arr(data.notes).filter(n=>n?.patientId===patientId&&n?.kind==='clinicalIntake').sort((a,b)=>String(b?.source?.submittedAt||b?.createdAt||'').localeCompare(String(a?.source?.submittedAt||a?.createdAt||'')))}
function section(note,title){return arr(note?.intake?.sections).find(s=>String(s?.title||'').toLowerCase()===String(title).toLowerCase())||null}
function sectionItems(note,title,max=20){return arr(section(note,title)?.items).map(x=>({field:String(x?.field||'').trim(),value:String(x?.patientReportedFact||'').trim()})).filter(x=>x.value).slice(0,max)}
function compactList(note,title,max=5){return sectionItems(note,title,max).map(x=>x.value)}
function list(title,items){return items.length?`<div><div class="tiny muted">${esc(title)}</div><ul class="small mt-8">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
function detailedSection(note,title,subtitle=''){const items=sectionItems(note,title);if(!items.length)return'';return`<section class="card mt-16"><div class="card-title"><div><div class="eyebrow">Anamnese estruturada</div><h3 class="mb-0">${esc(title)}</h3>${subtitle?`<div class="small muted mt-4">${esc(subtitle)}</div>`:''}</div></div><div class="list mt-12">${items.map(item=>`<div class="list-item" style="align-items:flex-start"><div><div class="tiny muted">${esc(item.field)}</div><div class="small mt-4" data-sensitive>${esc(item.value)}</div></div></div>`).join('')}</div></section>`}
function ensureClinicalIntakeTab(){if(runtime.locked||runtime.route!=='patients'||!selectedPatient())return;const tabs=document.querySelector('#patient-workspace .tabs');if(!tabs)return;let button=tabs.querySelector('[data-clinical-intake-tab]');if(!button){button=document.createElement('button');button.type='button';button.className='tab';button.dataset.clinicalIntakeTab='1';button.textContent='Anamnese';tabs.appendChild(button)}button.classList.toggle('active',runtime.patientTab==='intake')}
function renderClinicalIntakeArea(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='intake')return;
  const patient=selectedPatient(),host=document.getElementById('patient-tab-content');if(!patient||!host)return;
  const listItems=patientIntakes(patient.id),pending=listItems.filter(n=>n?.status===REVIEW_STATUS).length,priority=listItems.filter(n=>n?.intake?.priorityHumanReview&&n?.status===REVIEW_STATUS).length,latest=listItems[0]||null;
  const header=`<section class="card"><div class="card-title"><div><div class="eyebrow">Avaliação inicial e atualização longitudinal</div><h3 class="mb-0">Anamnese clínica</h3></div><span class="badge">${pending} aguardando revisão</span></div><p class="small muted mt-12">As informações abaixo reproduzem o relato do paciente e são organizadas para facilitar avaliação clínica, formulação TCC e planejamento terapêutico. Elas não equivalem, isoladamente, a diagnóstico ou conclusão clínica.</p>${priority?`<div class="notice danger mt-12">${priority} anamnese(s) contém(êm) informação que exige revisão prioritária do profissional.</div>`:''}</section>`;
  const synthesis=latest?`<section class="card mt-16"><div class="card-title"><div><div class="eyebrow">Leitura clínica inicial</div><h3 class="mb-0">Síntese para revisão</h3></div><span class="badge">Relato do paciente</span></div><div class="grid grid-2 mt-12">${list('Demanda e impacto',compactList(latest,'Demanda atual',6))}${list('História e desenvolvimento',compactList(latest,'História e desenvolvimento',6))}${list('Padrões cognitivos, comportamentais e relacionais',compactList(latest,'Padrões, relações e autoavaliação',6))}${list('Recursos e fatores protetivos',compactList(latest,'Recursos e apoio',6))}${list('Terapia, saúde e medicação',compactList(latest,'Terapia e saúde',6))}${list('Objetivos e expectativas',compactList(latest,'Objetivos e expectativas',6))}</div><div class="notice mt-12">Use esta síntese como ponto de partida para a Formulação TCC. Mantenha separados: fatos relatados, observações clínicas e hipóteses a testar.</div></section>`:'';
  const details=latest?[
    detailedSection(latest,'Contexto inicial','Identificação funcional e contexto de vida atual.'),
    detailedSection(latest,'Demanda atual','Queixa, impacto, gatilhos, respostas habituais e estratégias de enfrentamento.'),
    detailedSection(latest,'História e desenvolvimento','Experiências relevantes de infância/adolescência e ambiente de desenvolvimento.'),
    detailedSection(latest,'Padrões, relações e autoavaliação','Padrões repetitivos, diálogo interno e dificuldades relacionais.'),
    detailedSection(latest,'Recursos e apoio','Forças, estratégias já eficazes e rede de apoio.'),
    detailedSection(latest,'Terapia e saúde','Histórico terapêutico, saúde e informações sobre medicação.'),
    detailedSection(latest,'Objetivos e expectativas','Mudanças desejadas, expectativas e condições de segurança/vínculo terapêutico.'),
    detailedSection(latest,'Segurança e informações adicionais','Informações que demandam atenção ou contextualização adicional.')
  ].join(''):'';
  const history=listItems.length?`<section class="card mt-16"><h3>Histórico de anamneses</h3><p class="small muted">Mantém versões anteriores para acompanhamento longitudinal e auditoria clínica.</p><div class="list mt-12">${listItems.map(n=>`<div class="list-item"><div><strong>${esc(n.title||'Anamnese')}</strong><div class="small muted">${esc(n?.source?.submittedAt||String(n.createdAt||'').slice(0,16).replace('T',' '))} · ${n.status===REVIEW_STATUS?'Aguardando revisão profissional':'Revisada'}${n?.intake?.priorityHumanReview?' · prioridade':''}</div></div><button class="btn secondary" data-clinical-intake-open="${esc(n.id)}">Abrir</button></div>`).join('')}</div></section>`:`<section class="card mt-16"><h3>Nenhuma anamnese registrada</h3><p class="small muted">Quando uma resposta for vinculada e processada, ela ficará registrada nesta área.</p></section>`;
  host.innerHTML=header+synthesis+details+history;
}
function refresh(){ensureClinicalIntakeTab();renderClinicalIntakeArea()}
document.addEventListener('click',event=>{const tab=event.target.closest?.('[data-clinical-intake-tab]');if(!tab)return;event.preventDefault();event.stopPropagation();runtime.patientTab='intake';window.__rmRender?.()},true);
document.addEventListener('rm:rendered',refresh);document.addEventListener('rm:data-ready',()=>setTimeout(refresh,0));document.addEventListener('rm:local-data-changed',event=>{if(event?.detail?.kind?.startsWith?.('clinical-intake'))setTimeout(refresh,0)});
