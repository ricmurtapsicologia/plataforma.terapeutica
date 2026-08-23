import {data,runtime} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {modal,closeModal} from './ui.js';
import {APP_VERSION} from './version.js';

const RUNTIME_VERSION='3.0.0';
const SW_MIGRATION_KEY='rm.v3.migration.legacy-sw.done';
const GEMINI_INTEGRITY_KEY='rm.gemini.materialization-integrity.v273';
const CANONICAL_SESSION_MIGRATION='rm.v3.clinical-session-id.backfill.v1';

const metrics={bootAt:Date.now(),renders:0,syncRuns:0,syncErrors:0,calendarRuns:0,calendarErrors:0,geminiRuns:0,geminiErrors:0,routeChanges:0,lastError:'',lastUnhandled:'',lastSyncStatus:'',lastGeminiStatus:'',lastCalendarStatus:''};
let meetStatus='unknown';
let meetDetail='Estado do Google Meet/Gemini ainda não confirmado.';
let canonicalTimer=null;
let decorateQueued=false;
let observer=null;

const GROUPS=[
  {label:'Principal',tabs:[['summary','Principal']]},
  {label:'Sessões',tabs:[['timeline','Sessões'],['atendimento','Atendimento']]},
  {label:'Clínica',tabs:[['records','Prontuário'],['notes','Notas restritas'],['formulation','Conceitualização']]},
  {label:'Tratamento',tabs:[['plans','Plano'],['tasks','Tarefas']]},
  {label:'Recursos',tabs:[['materials','Materiais'],['documents','Documentos'],['consents','Consentimentos']]},
  {label:'Administração',tabs:[['communications','Comunicações'],['finance','Financeiro']]}
];

function exposeMetrics(){globalThis.__rmRuntimeMetrics={...metrics,platformRuntime:RUNTIME_VERSION,uptimeMs:Date.now()-metrics.bootAt}}
function noteError(value,key='lastError'){metrics[key]=String(value||'').slice(0,500);exposeMetrics()}
window.addEventListener('error',e=>noteError(e.message||'Erro de runtime'));
window.addEventListener('unhandledrejection',e=>noteError(e.reason?.message||e.reason||'Promise rejeitada','lastUnhandled'));
window.addEventListener('hashchange',()=>{metrics.routeChanges++;exposeMetrics()});

// Compatibilidade restrita de impressão/PDF. Mantém noopener/noreferrer fora de popups dimensionados.
const originalOpen=window.open.bind(window);
window.open=function(url='',target='_blank',features=''){
  const parts=String(features||'').split(',').map(x=>x.trim()).filter(Boolean);
  const isPrintPopup=parts.some(x=>/^width=/i.test(x))||parts.some(x=>/^height=/i.test(x));
  if(!isPrintPopup)return originalOpen(url,target,features);
  const compatible=parts.filter(x=>!/^noopener$/i.test(x)&&!/^noreferrer$/i.test(x)).join(',');
  const win=originalOpen(url,target,compatible);
  if(win)setTimeout(()=>{try{win.opener=null}catch{}},0);
  return win;
};

async function retireLegacyServiceWorker(){
  if(localStorage.getItem(SW_MIGRATION_KEY)==='done')return;
  if(!('serviceWorker' in navigator)){localStorage.setItem(SW_MIGRATION_KEY,'done');return}
  try{
    const regs=await navigator.serviceWorker.getRegistrations();
    for(const reg of regs){
      const url=reg.active?.scriptURL||reg.waiting?.scriptURL||reg.installing?.scriptURL||'';
      if(/\/sw\.js(?:\?|$)/.test(url))await reg.unregister();
    }
    localStorage.setItem(SW_MIGRATION_KEY,'done');
  }catch(err){console.warn('Migração do service worker legado não concluída.',err)}
}

async function loadPendingOneShotMigrations(){
  try{
    const state=JSON.parse(localStorage.getItem(GEMINI_INTEGRITY_KEY)||'null');
    if(state?.status!=='done')await import('./gemini-materialization-integrity-v273.js');
  }catch(err){console.warn('Migração condicional de integridade Gemini indisponível.',err)}
}

function appointmentById(id){return (Array.isArray(data.appointments)?data.appointments:[]).find(x=>x?.id===id)||null}
function appointmentBySourceFile(fileId){if(!fileId)return null;return (Array.isArray(data.appointments)?data.appointments:[]).find(x=>x?.source?.fileId===fileId||x?.gemini?.fileId===fileId)||null}

async function ensureCanonicalSessionIds(){
  if(runtime.locked||!runtime.key||!runtime.dataReady)return;
  const appointments=Array.isArray(data.appointments)?data.appointments:[];
  const records=Array.isArray(data.records)?data.records:[];
  const appointmentChanges=[];
  const recordChanges=[];

  for(let i=0;i<appointments.length;i++){
    const current=appointments[i];
    if(!current?.id||current.clinicalSessionId)continue;
    appointmentChanges.push({index:i,row:{...current,clinicalSessionId:current.id}});
  }

  const proposedSessionId=new Map(appointments.filter(x=>x?.id).map(x=>[x.id,x.clinicalSessionId||x.id]));
  for(let i=0;i<records.length;i++){
    const current=records[i];
    if(!current?.id||current.clinicalSessionId)continue;
    const linked=appointmentById(current.appointmentId)||appointmentBySourceFile(current?.source?.fileId);
    const sessionId=linked?.clinicalSessionId||proposedSessionId.get(linked?.id)||'';
    if(!sessionId)continue;
    recordChanges.push({index:i,row:{...current,clinicalSessionId:sessionId}});
  }

  if(!appointmentChanges.length&&!recordChanges.length)return;
  try{
    const batches=[];
    if(appointmentChanges.length)batches.push({storeName:'appointments',values:appointmentChanges.map(x=>x.row)});
    if(recordChanges.length)batches.push({storeName:'records',values:recordChanges.map(x=>x.row)});
    await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});
    for(const change of appointmentChanges)appointments[change.index]=change.row;
    for(const change of recordChanges)records[change.index]=change.row;
    localStorage.setItem(CANONICAL_SESSION_MIGRATION,JSON.stringify({status:'done',at:new Date().toISOString(),appointments:appointmentChanges.length,records:recordChanges.length}));
    if(appointmentChanges.length)document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'appointments',kind:'clinical-session-id-v300',at:new Date().toISOString(),verified:true}}));
    if(recordChanges.length)document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',kind:'clinical-session-id-v300',at:new Date().toISOString(),verified:true}}));
    document.dispatchEvent(new CustomEvent('rm:clinical-session-id',{detail:{appointments:appointmentChanges.length,records:recordChanges.length,source:'existing-links-only'}}));
  }catch(err){console.warn('Não foi possível completar a identidade canônica de sessões.',err)}
}
function scheduleCanonicalSessionIds(delay=220){clearTimeout(canonicalTimer);canonicalTimer=setTimeout(()=>void ensureCanonicalSessionIds(),delay)}

function groupFor(tab){return GROUPS.find(group=>group.tabs.some(([id])=>id===tab))||GROUPS[0]}
function decoratePatientNavigation(){
  if(runtime.locked||runtime.route!=='patients')return;
  const workspace=document.getElementById('patient-workspace');
  const tabs=workspace?.querySelector('.tabs');
  const content=document.getElementById('patient-tab-content');
  if(!workspace||!tabs||!content)return;
  const current=runtime.patientTab||'summary';
  const activeGroup=groupFor(current);
  tabs.innerHTML=GROUPS.map(group=>{
    const active=group===activeGroup;
    const target=active&&group.tabs.some(([id])=>id===current)?current:group.tabs[0][0];
    return `<button class="tab ${active?'active':''}" data-action="patient-tab" data-tab="${target}" title="${group.tabs.map(([,label])=>label).join(' · ')}">${group.label}</button>`;
  }).join('');

  document.getElementById('rm-v3-context-nav')?.remove();
  if(activeGroup.tabs.length>1){
    const nav=document.createElement('div');
    nav.id='rm-v3-context-nav';
    nav.className='toolbar';
    nav.style.marginBottom='12px';
    nav.innerHTML=`<div class="small muted"><strong>${activeGroup.label}</strong></div><div class="flex gap-8 wrap">${activeGroup.tabs.map(([id,label])=>`<button class="btn ${id===current?'':'secondary'}" data-action="patient-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
    content.insertAdjacentElement('beforebegin',nav);
  }

  const scheduleButtons=[...workspace.querySelectorAll('[data-action="schedule-selected-patient"]')];
  scheduleButtons.slice(1).forEach(button=>{button.hidden=true});
  const duplicatePrivacy=workspace.querySelector('[data-action="privacy-mask"]');
  if(duplicatePrivacy)duplicatePrivacy.hidden=true;

  const actionsHost=workspace.querySelector('.patient-context .flex.gap-8.wrap');
  if(actionsHost&&!actionsHost.querySelector('[data-v3-action-menu]')){
    const button=document.createElement('button');
    button.type='button';
    button.className='btn secondary';
    button.dataset.v3ActionMenu='1';
    button.textContent='+ Ação';
    actionsHost.appendChild(button);
  }
}

function openActionMenu(){
  modal('Ação rápida',`<div class="grid grid-2">
    <button class="btn" data-v3-menu-action data-action="schedule-selected-patient">Agendar sessão</button>
    <button class="btn secondary" data-v3-menu-action data-action="patient-tab" data-tab="atendimento">Abrir atendimento</button>
    <button class="btn secondary" data-v3-menu-action data-action="patient-tab" data-tab="records">Prontuário</button>
    <button class="btn secondary" data-v3-menu-action data-action="patient-tab" data-tab="tasks">Tarefa</button>
    <button class="btn secondary" data-v3-menu-action data-action="patient-tab" data-tab="materials">Material</button>
    <button class="btn secondary" data-v3-menu-action data-action="patient-tab" data-tab="communications">Comunicação</button>
    <button class="btn secondary" data-v3-menu-action data-action="patient-tab" data-tab="finance">Financeiro</button>
  </div>`,`<button class="btn secondary" data-action="close-modal">Fechar</button>`,true);
}

function relabelAssistedDocumentation(){
  document.querySelectorAll('[data-action="gemini-ai-hub-v270"]').forEach(button=>button.textContent='Preparar/revisar rascunho');
  document.querySelectorAll('[data-action="gemini-ai-generate-v270"]').forEach(button=>{button.textContent=/regenerar/i.test(button.textContent||'')?'Refazer rascunho':'Preparar rascunho'});
  document.querySelectorAll('.badge,.tiny,.small').forEach(node=>{if(String(node.textContent||'').trim()==='Rascunho IA')node.textContent='Rascunho assistido'});
}

function meetTone(){return meetStatus==='connected'?'ok':meetStatus==='error'||meetStatus==='disconnected'?'error':'warn'}
function meetLabel(){return meetStatus==='connected'?'Meet ✓':meetStatus==='scanning'?'Meet ↻':meetStatus==='paused'?'Meet •':meetStatus==='error'||meetStatus==='disconnected'?'Meet !':'Meet •'}
function sanitizeTopStatuses(){
  const top=document.querySelector('.top-actions');if(!top)return;
  const officialAgenda=top.querySelector('#rm-calendar-status-v240');
  for(const node of [...top.querySelectorAll('button,[class*="chip"],[class*="status"]')]){
    if(node===officialAgenda||node.id==='rm-meet-status-v240')continue;
    const text=String(node.textContent||'').replace(/\s+/g,' ').trim();
    if(/^Agenda(?:\s|$)/i.test(text))node.remove();
  }
  let chip=document.getElementById('rm-meet-status-v240');
  if(!chip){chip=document.createElement('button');chip.type='button';chip.id='rm-meet-status-v240';chip.dataset.route='settings';top.insertBefore(chip,document.getElementById('clock-chip')||top.firstChild)}
  chip.className=`rm-status-chip ${meetTone()}`;
  chip.textContent=meetLabel();
  chip.title=meetDetail;
  chip.setAttribute('aria-label',meetDetail);
}

function healthState(status){return ['connected','synced','ok','ready'].includes(status)?'OK':status==='error'||status==='disconnected'||status==='conflict'?'Atenção':'Observando'}
function decorateSettingsHealth(){
  if(runtime.locked||runtime.route!=='settings')return;
  const main=document.getElementById('main-content');if(!main)return;
  let card=document.getElementById('rm-v3-platform-health');
  if(!card){card=document.createElement('section');card.id='rm-v3-platform-health';card.className='card mt-16';main.appendChild(card)}
  const lastError=metrics.lastUnhandled||metrics.lastError||'Nenhum erro não tratado registrado nesta sessão.';
  card.innerHTML=`<div class="card-title"><div><div class="eyebrow">Plataforma ${APP_VERSION}</div><h3 class="mb-0">Saúde da plataforma</h3></div><span class="badge">Runtime v${RUNTIME_VERSION}</span></div>
  <div class="grid grid-3 mt-12">
    <div><div class="tiny muted">Sincronização</div><strong>${healthState(metrics.lastSyncStatus)}</strong></div>
    <div><div class="tiny muted">Google Agenda</div><strong>${healthState(metrics.lastCalendarStatus)}</strong></div>
    <div><div class="tiny muted">Meet/Gemini</div><strong>${healthState(metrics.lastGeminiStatus||meetStatus)}</strong></div>
  </div>
  <div class="small muted mt-12">Erros nesta sessão — sync: ${metrics.syncErrors}; agenda: ${metrics.calendarErrors}; Gemini: ${metrics.geminiErrors}.</div>
  <div class="small muted mt-8">${String(lastError).replace(/[<>]/g,'')}</div>
  <div class="flex gap-8 wrap mt-16"><button class="btn secondary" data-action="run-diagnostics">Executar diagnóstico</button></div>`;
}

function decorateAll(){
  decorateQueued=false;
  const app=document.getElementById('app');
  observer?.disconnect();
  try{
    decoratePatientNavigation();
    relabelAssistedDocumentation();
    sanitizeTopStatuses();
    decorateSettingsHealth();
  }finally{
    if(app&&observer)observer.observe(app,{childList:true,subtree:true});
  }
}
function scheduleDecorate(){if(decorateQueued)return;decorateQueued=true;queueMicrotask(decorateAll)}

observer=new MutationObserver(scheduleDecorate);
const app=document.getElementById('app');if(app)observer.observe(app,{childList:true,subtree:true});

document.addEventListener('click',event=>{
  const menu=event.target.closest?.('[data-v3-action-menu]');
  if(menu){event.preventDefault();event.stopImmediatePropagation();openActionMenu();return}
  if(event.target.closest?.('[data-v3-menu-action]'))closeModal();
},true);

document.addEventListener('rm:rendered',()=>{metrics.renders++;exposeMetrics();scheduleDecorate();scheduleCanonicalSessionIds()});
document.addEventListener('rm:data-ready',()=>{setTimeout(scheduleDecorate,80);scheduleCanonicalSessionIds(400)});
document.addEventListener('rm:sync-status',event=>{metrics.lastSyncStatus=event.detail?.status||'';if(event.detail?.status==='syncing')metrics.syncRuns++;if(event.detail?.status==='error')metrics.syncErrors++;exposeMetrics();scheduleDecorate()});
document.addEventListener('rm:gemini-status',event=>{meetStatus=event.detail?.status||meetStatus;meetDetail=event.detail?.detail||meetDetail;metrics.lastGeminiStatus=meetStatus;if(meetStatus==='scanning')metrics.geminiRuns++;if(meetStatus==='error')metrics.geminiErrors++;exposeMetrics();scheduleDecorate()});
document.addEventListener('rm:calendar-status',event=>{metrics.lastCalendarStatus=event.detail?.status||'';if(event.detail?.status==='syncing')metrics.calendarRuns++;if(event.detail?.status==='error')metrics.calendarErrors++;exposeMetrics();scheduleDecorate()});

void retireLegacyServiceWorker();
void loadPendingOneShotMigrations();
exposeMetrics();
