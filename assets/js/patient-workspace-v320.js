import {runtime,selectedPatient} from './state.js';
import {esc} from './ui.js';

const VERSION='3.6.1-ux';
const PRIMARY_NAV=[
  ['summary','Visão geral'],
  ['timeline','Sessões'],
  ['atendimento','Atendimento'],
  ['records','Prontuário'],
  ['plans','Plano'],
  ['finance','Financeiro'],
];
const MORE_NAV=[
  ['intake','Anamnese'],
  ['notes','Notas restritas'],
  ['formulation','Formulação TCC'],
  ['tasks','Tarefas'],
  ['materials','Materiais'],
  ['documents','Documentos'],
  ['communications','Comunicações'],
  ['consents','Consentimentos'],
];
let timer=null;

function simplifyHeader(){
  if(runtime.route!=='patients'||!selectedPatient())return;
  const host=document.querySelector('.patient-context .flex.gap-8.wrap,.patient-context .flex');
  if(!host)return;
  for(const b of [...host.querySelectorAll('button')]){
    const a=b.dataset.action||'';
    const keep=a==='schedule-selected-patient'||a==='choose-patient'||Boolean(b.dataset.v3ActionMenu);
    if(!keep)b.hidden=true;
  }
  const schedule=host.querySelector('[data-action="schedule-selected-patient"]');
  if(schedule)schedule.textContent='Agendar sessão';
  const choose=host.querySelector('[data-action="choose-patient"]');
  if(choose)choose.textContent='Trocar paciente';
}

function tabButton(id,label,current){
  return `<button type="button" class="tab ${id===current?'active':''}" data-action="patient-tab" data-tab="${id}">${esc(label)}</button>`;
}

function unifyNavigation(){
  if(runtime.route!=='patients'||!selectedPatient())return;
  const workspace=document.getElementById('patient-workspace');
  if(!workspace)return;
  let nav=workspace.querySelector('.rm-unified-patient-nav-v320');
  if(!nav){
    nav=document.createElement('nav');
    nav.className='rm-unified-patient-nav-v320';
    nav.setAttribute('aria-label','Áreas do paciente');
    const target=workspace.querySelector(':scope > .tabs')||workspace.firstElementChild;
    target?.insertAdjacentElement('beforebegin',nav);
  }
  if(!nav)return;
  const current=runtime.patientTab||'summary';
  const currentMore=MORE_NAV.find(([id])=>id===current);
  const moreLabel=currentMore?`Mais · ${currentMore[1]}`:'Mais';
  nav.innerHTML=`<div class="rm-patient-primary-nav">${PRIMARY_NAV.map(([id,label])=>tabButton(id,label,current)).join('')}</div><details class="rm-patient-more ${currentMore?'active':''}"><summary class="tab" aria-label="Outras áreas do paciente">${esc(moreLabel)}</summary><div class="rm-patient-more-menu">${MORE_NAV.map(([id,label])=>tabButton(id,label,current)).join('')}</div></details>`;
}

function addStyles(){
  if(document.getElementById('rm-patient-workspace-v320-style'))return;
  const s=document.createElement('style');
  s.id='rm-patient-workspace-v320-style';
  s.textContent=`body.rm-patient-focused #patient-workspace>.tabs,body.rm-patient-focused #rm-v3-context-nav{display:none!important}.rm-unified-patient-nav-v320{display:flex;align-items:flex-start;gap:8px;padding:4px 0 12px;position:relative}.rm-patient-primary-nav{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;min-width:0}.rm-unified-patient-nav-v320 .tab{white-space:nowrap;flex:0 0 auto}.rm-patient-more{position:relative;flex:0 0 auto}.rm-patient-more>summary{list-style:none;cursor:pointer}.rm-patient-more>summary::-webkit-details-marker{display:none}.rm-patient-more.active>summary{font-weight:700}.rm-patient-more-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:min(340px,calc(100vw - 32px));padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid var(--border,#d8dee6);border-radius:12px;background:var(--surface,#fff);box-shadow:0 12px 32px rgba(0,0,0,.14)}.rm-patient-more-menu .tab{width:100%;text-align:left}.patient-context button[hidden]{display:none!important}@media(max-width:700px){.patient-context{padding:12px!important}.patient-context .flex{gap:6px!important}.patient-context .flex .btn{flex:1 1 44%;min-width:0}.rm-unified-patient-nav-v320{margin-inline:-4px;padding-inline:4px}.rm-patient-primary-nav{gap:6px}.rm-unified-patient-nav-v320 .tab{min-height:44px}.rm-patient-more-menu{position:fixed;left:16px;right:16px;top:auto;width:auto;max-height:55vh;overflow:auto;grid-template-columns:1fr;z-index:80}}`;
  document.head.appendChild(s);
}

function apply(){addStyles();simplifyHeader();unifyNavigation()}
function queue(){clearTimeout(timer);timer=setTimeout(apply,30)}
document.addEventListener('rm:rendered',queue);
document.addEventListener('rm:data-ready',queue);
addStyles();

globalThis.__rmPatientWorkspace={version:VERSION,apply,primary:PRIMARY_NAV.map(([id])=>id),more:MORE_NAV.map(([id])=>id)};
