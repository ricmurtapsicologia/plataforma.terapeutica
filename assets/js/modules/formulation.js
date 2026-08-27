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
  ['automaticThoughts','Pensamentos automáticos recorrentes'],
  ['emotions','Emoções predominantes'],
  ['physiology','Respostas fisiológicas relevantes'],
  ['behaviors','Padrões comportamentais relevantes'],
  ['compensatory','Estratégias compensatórias / comportamentos de segurança'],
  ['hypotheses','Hipóteses de formulação TCC a testar'],
  ['evidenceFor','Evidências favoráveis às hipóteses atuais'],
  ['evidenceAgainst','Evidências contrárias / dados que desafiam as hipóteses'],
  ['hypothesisConfidence','Grau de confiança clínica e justificativa'],
  ['toVerify','Dados pendentes de verificação clínica'],
  ['hypothesisSessions','Sessões/evidências que modificaram a formulação'],
  ['interventions','Intervenções planejadas ou já utilizadas'],
  ['schemas','Esquemas / padrões amplos, quando clinicamente pertinente'],
  ['modes','Modos predominantes, quando clinicamente pertinente'],
  ['needs','Necessidades psicológicas/emocionais relevantes, quando utilizadas']
];
export const CYCLE=['Situação / gatilho','Pensamento ou interpretação','Emoção','Resposta fisiológica','Comportamento / estratégia','Consequência imediata','Consequência de médio/longo prazo','Como o ciclo mantém o problema'];

function fieldGroup(title,ids,f,description=''){const fields=FORM_FIELDS.filter(([id])=>ids.includes(id));return`<section class="card mb-16"><div class="eyebrow">${esc(title)}</div>${description?`<p class="small muted mt-8">${esc(description)}</p>`:''}<div class="grid grid-2 mt-12">${fields.map(([id,label])=>`<div class="field"><label>${esc(label)}</label><textarea class="textarea formulation-field" data-field="${id}" placeholder="Registrar fatos, observações e hipóteses com linguagem probabilística e revisável.">${esc(f.fields?.[id]||'')}</textarea></div>`).join('')}</div></section>`}

export function renderFormulation(){
  const p=selectedPatient();if(!p)return empty('Paciente não selecionado','Selecione um paciente para abrir a formulação de caso.');
  const f=data.formulations.find(x=>x.patientId===p.id)||{fields:{},cycle:{}};
  const left=`<div>
    <section class="card mb-16"><div class="card-title"><div><div class="eyebrow">Terapia Cognitivo-Comportamental</div><h3 class="mb-0">Formulação de caso</h3></div><span class="badge">Hipótese de trabalho</span></div><p class="small muted mt-12">Organize os dados como hipóteses revisáveis. Separe relato do paciente, observação clínica e inferência. Diagnóstico, crenças nucleares e mecanismos de manutenção exigem evidência clínica suficiente e revisão profissional.</p></section>
    ${fieldGroup('1. Problemas e contexto',['demand','targets','history'],f,'Defina os problemas de forma operacional e conecte-os ao contexto atual e à história relevante.')}
    ${fieldGroup('2. Formulação longitudinal — 5 Ps',['predisposing','precipitating','maintaining','protective','resources'],f,'Organize vulnerabilidades, gatilhos, mecanismos de manutenção e fatores protetivos sem assumir causalidade não demonstrada.')}
    ${fieldGroup('3. Núcleo cognitivo-comportamental',['coreBeliefs','intermediateBeliefs','automaticThoughts','emotions','physiology','behaviors','compensatory'],f,'Relacione cognições, emoções, respostas corporais e comportamentos ao ciclo de manutenção observado.')}
    ${fieldGroup('4. Hipóteses e teste clínico',['hypotheses','evidenceFor','evidenceAgainst','hypothesisConfidence','toVerify','hypothesisSessions'],f,'Toda hipótese deve poder ser fortalecida, enfraquecida ou reformulada à luz de dados de sessão e experimentos clínicos.')}
    ${fieldGroup('5. Intervenções',['interventions'],f,'Registre somente intervenções coerentes com os problemas-alvo e mecanismos de manutenção identificados.')}
    ${fieldGroup('Integrações clínicas — opcional',['schemas','modes','needs'],f,'Use estes constructos apenas quando acrescentarem valor à formulação; eles não substituem o núcleo TCC acima.')}
    <button class="btn" data-action="save-formulation">Salvar nova versão</button>
  </div>`;
  const right=`<div class="card"><div class="card-title"><div><div class="eyebrow">Formulação transversal</div><h3 class="mb-0">Ciclo de manutenção TCC</h3></div></div><p class="small muted mt-12">Use um episódio representativo. A sequência deve explicar como interpretações, emoções, respostas corporais e estratégias produzem consequências que reforçam ou mantêm o problema.</p><div class="cycle mt-16">${CYCLE.map((label,i)=>`<div class="cycle-card"><label class="small"><strong>${esc(label)}</strong></label><textarea class="textarea cycle-field" data-cycle="${i}" style="min-height:88px">${esc(f.cycle?.[i]||'')}</textarea></div>${i<CYCLE.length-1?'<div class="cycle-arrow">↓</div>':''}`).join('')}</div><button class="btn secondary mt-16" data-action="print">Imprimir mapa</button></div>`;
  return`<section class="grid grid-2">${left}${right}</section>`;
}
