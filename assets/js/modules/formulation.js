import {data,selectedPatient} from '../state.js';
import {empty,esc} from '../ui.js';

export const FORM_FIELDS=[
  ['demand','Demanda principal e contexto atual'],
  ['targets','Problemas-alvo priorizados'],
  ['history','História relevante para o problema atual'],
  ['predisposing','Fatores predisponentes'],
  ['precipitating','Fatores precipitantes'],
  ['maintaining','Fatores de manutenção'],
  ['protective','Fatores protetivos'],
  ['resources','Recursos pessoais e ambientais'],
  ['coreBeliefs','Crenças centrais / temas nucleares'],
  ['intermediateBeliefs','Regras, pressupostos e crenças intermediárias'],
  ['compensatory','Estratégias compensatórias e de enfrentamento'],
  ['automaticThoughts','Pensamentos automáticos recorrentes'],
  ['emotions','Emoções predominantes'],
  ['behaviors','Padrões comportamentais relevantes'],
  ['schemas','Esquemas / padrões amplos a investigar'],
  ['modes','Modos predominantes, quando clinicamente pertinente'],
  ['needs','Necessidades psicológicas/emocionais relevantes'],
  ['hypotheses','Hipóteses de formulação TCC a testar'],
  ['interventions','Intervenções planejadas ou já utilizadas'],
  ['toVerify','Dados pendentes de verificação clínica']
];
export const CYCLE=['Situação / gatilho','Pensamento ou interpretação','Emoção','Resposta fisiológica','Comportamento / estratégia','Consequência imediata','Consequência de médio/longo prazo','Como o ciclo mantém o problema'];

function fieldGroup(title,ids,f){const fields=FORM_FIELDS.filter(([id])=>ids.includes(id));return`<section class="card mb-16"><div class="eyebrow">${esc(title)}</div><div class="grid grid-2 mt-12">${fields.map(([id,label])=>`<div class="field"><label>${esc(label)}</label><textarea class="textarea formulation-field" data-field="${id}" placeholder="Registrar somente hipóteses sustentadas por dados clínicos e itens a verificar.">${esc(f.fields?.[id]||'')}</textarea></div>`).join('')}</div></section>`}

export function renderFormulation(){
  const p=selectedPatient();if(!p)return empty('Paciente não selecionado','Selecione um paciente para abrir a formulação de caso.');
  const f=data.formulations.find(x=>x.patientId===p.id)||{fields:{},cycle:{}};
  const left=`<div>
    <section class="card mb-16"><div class="card-title"><div><div class="eyebrow">Terapia Cognitivo-Comportamental</div><h3 class="mb-0">Formulação de caso</h3></div><span class="badge">Editável</span></div><p class="small muted mt-12">Organize os dados em hipóteses de trabalho. Diferencie fatos relatados, padrões observados e inferências clínicas. Diagnósticos e hipóteses não devem ser tratados como conclusões sem avaliação suficiente.</p></section>
    ${fieldGroup('1. Problemas e contexto',['demand','targets','history'],f)}
    ${fieldGroup('2. Formulação longitudinal — 5 Ps',['predisposing','precipitating','maintaining','protective','resources'],f)}
    ${fieldGroup('3. Estruturas cognitivas e estratégias',['coreBeliefs','intermediateBeliefs','automaticThoughts','emotions','behaviors','compensatory'],f)}
    ${fieldGroup('4. Integração e planejamento',['schemas','modes','needs','hypotheses','interventions','toVerify'],f)}
    <button class="btn" data-action="save-formulation">Salvar nova versão</button>
  </div>`;
  const right=`<div class="card"><div class="card-title"><div><div class="eyebrow">Formulação transversal</div><h3 class="mb-0">Ciclo de manutenção TCC</h3></div></div><p class="small muted mt-12">Use um episódio representativo e descreva a sequência que liga situação, cognição, emoção, resposta corporal e comportamento às consequências que mantêm o padrão.</p><div class="cycle mt-16">${CYCLE.map((label,i)=>`<div class="cycle-card"><label class="small"><strong>${esc(label)}</strong></label><textarea class="textarea cycle-field" data-cycle="${i}" style="min-height:88px">${esc(f.cycle?.[i]||'')}</textarea></div>${i<CYCLE.length-1?'<div class="cycle-arrow">↓</div>':''}`).join('')}</div><button class="btn secondary mt-16" data-action="print">Imprimir mapa</button></div>`;
  return`<section class="grid grid-2">${left}${right}</section>`;
}
