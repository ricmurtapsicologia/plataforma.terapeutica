import {runtime,data,selectedPatient,DEFAULT_TASK_TEMPLATES,DEFAULT_MATERIALS} from './state.js';
import {renderDashboard} from './modules/dashboard.js';
import {renderAppointments} from './modules/appointments.js';
import {renderPatients,renderPatientSummary,renderTimeline,patientTabs,renderPatientContext} from './modules/patients.js';
import {renderSessionFlow} from './modules/sessions.js';
import {renderRecords,renderNotes} from './modules/records.js';
import {renderFormulation} from './modules/formulation.js';
import {renderPlans} from './modules/plans.js';
import {renderTasks} from './modules/tasks.js';
import {renderMaterials} from './modules/materials.js';
import {renderDocuments} from './modules/documents.js';
import {renderConsents} from './modules/consents.js';
import {renderFinance} from './modules/finance.js';
import {renderSettings} from './modules/settings.js';
import {pageHead,esc,empty,fmtDateTime,badge} from './ui.js';

const VALID_ROUTES=new Set(['today','agenda','patients','resources','financeiro','settings']);
let clockTimer=null;

function activateRoute(route){
  document.querySelectorAll('.nav-link[data-route]').forEach(btn=>{
    const active=btn.dataset.route===route;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-current',active?'page':'false');
    btn.type='button';
    btn.disabled=false;
    btn.style.pointerEvents='auto';
  });
}

function renderCommunicationsFallback(){
  const p=selectedPatient();
  if(!p)return empty('Paciente não selecionado','Selecione um paciente.');
  const list=Array.isArray(data.communications)?data.communications.filter(c=>c?.patientId===p.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))):[];
  return `<section class="grid grid-2"><div class="card"><h3>Comunicação</h3><p class="muted">Use o telefone e o e-mail cadastrados para preparar comunicações administrativas.</p><div class="flex gap-8 wrap"><button class="btn" data-action="patient-whatsapp">WhatsApp</button><button class="btn secondary" data-action="patient-email">E-mail</button></div></div><div class="card"><h3>Histórico local</h3>${list.length?`<div class="list">${list.map(c=>`<div class="list-item"><div><strong>${esc(c.purpose||'Comunicação')}</strong><div class="small muted">${fmtDateTime(c.createdAt)} · ${esc(c.channel||'')}</div></div>${badge(c.status||'Preparado')}</div>`).join('')}</div>`:empty('Sem comunicações registradas','As comunicações preparadas aparecerão aqui.')}</div></section>`;
}

function renderPatientTabFallback(){
  const p=selectedPatient();
  if(!p)return '';
  switch(runtime.patientTab){
    case 'summary': return renderPatientSummary(p);
    case 'atendimento': return renderSessionFlow();
    case 'timeline': return renderTimeline(p);
    case 'records': return renderRecords();
    case 'notes': return renderNotes();
    case 'formulation': return renderFormulation();
    case 'plans': return renderPlans();
    case 'tasks': return renderTasks();
    case 'materials': return renderMaterials();
    case 'documents': return renderDocuments();
    case 'communications': return renderCommunicationsFallback();
    case 'consents': return renderConsents();
    case 'finance': return renderFinance();
    default: return renderPatientSummary(p);
  }
}

function resourcesFallback(){
  return pageHead('Recursos','Materiais, exercícios e ferramentas para uso clínico.')+
  `<section class="grid grid-2"><div class="card"><h3>Modelos de tarefas</h3><div class="list">${DEFAULT_TASK_TEMPLATES.map((t,i)=>`<div class="list-item"><div><strong>${esc(t.title)}</strong><div class="small muted">${esc(t.category||'')} · ${esc(t.objective||'')}</div></div><button class="btn secondary" data-action="new-task" data-template="${i}">Usar</button></div>`).join('')}</div></div><div class="card"><h3>Materiais psicoeducativos</h3><div class="list">${DEFAULT_MATERIALS.map(m=>`<div class="list-item"><div><strong>${esc(m.title)}</strong><div class="small muted">${esc(m.category||'')}</div></div><button class="btn secondary" data-action="preview-default-material" data-id="${esc(m.id)}">Abrir</button></div>`).join('')}</div></div></section>`;
}

function fallbackRender(route){
  const main=document.querySelector('#main-content');
  if(!main||runtime.locked)return false;
  runtime.route=route;
  let html='';
  try{
    if(route==='today')html=renderDashboard();
    else if(route==='agenda')html=renderAppointments();
    else if(route==='patients')html=renderPatients();
    else if(route==='resources')html=resourcesFallback();
    else if(route==='financeiro')html=pageHead('Financeiro','Visão administrativa consolidada.',`<button class="btn" data-action="new-payment">Novo lançamento</button>`)+renderFinance({global:true});
    else if(route==='settings')html=renderSettings({backup:{lastBackupAt:null,days:null,counts:{}},legacy:false});
    main.innerHTML=html;
    if(route==='patients'&&selectedPatient()){
      const box=document.querySelector('#patient-tab-content');
      if(box)box.innerHTML=renderPatientTabFallback();
    }
    activateRoute(route);
    updateClock();
    return true;
  }catch(err){
    console.error('Falha no fallback de navegação',route,err);
    return false;
  }
}

function navigate(route){
  if(!VALID_ROUTES.has(route))return;
  runtime.route=route;
  activateRoute(route);
  if(location.hash!==`#${route}`)history.pushState(null,'',`#${route}`);
  if(typeof window.__rmNavigate==='function'){
    try{
      window.__rmNavigate(route);
      queueMicrotask(updateClock);
      return;
    }catch(err){
      console.warn('Roteador principal indisponível; usando fallback.',err);
    }
  }
  fallbackRender(route);
}

function updateClock(){
  const chip=document.querySelector('#clock-chip');
  if(!chip)return;
  const now=new Date();
  const date=now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  const time=now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  chip.innerHTML=`<div><small>Data</small><strong>${date}</strong></div><div><small>Hora</small><strong>${time}</strong></div>`;
}

function startClock(){
  if(clockTimer)clearInterval(clockTimer);
  updateClock();
  clockTimer=setInterval(updateClock,1000);
}

document.addEventListener('click',event=>{
  const nav=event.target.closest?.('[data-route]');
  if(!nav||!VALID_ROUTES.has(nav.dataset.route))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  navigate(nav.dataset.route);
},true);

document.addEventListener('keydown',event=>{
  const nav=event.target.closest?.('[data-route]');
  if(!nav||!VALID_ROUTES.has(nav.dataset.route)||!['Enter',' '].includes(event.key))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  navigate(nav.dataset.route);
},true);

document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-action="patient-tab"]');
  if(!tab||runtime.route!=='patients')return;
  window.setTimeout(()=>{
    const box=document.querySelector('#patient-tab-content');
    if(box&&selectedPatient()){
      runtime.patientTab=tab.dataset.tab||'summary';
      box.innerHTML=renderPatientTabFallback();
      document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===runtime.patientTab));
    }
  },0);
},false);

const observer=new MutationObserver(()=>{
  document.querySelectorAll('.nav-link[data-route]').forEach(btn=>{
    btn.type='button';
    btn.disabled=false;
    btn.style.pointerEvents='auto';
  });
  const current=location.hash.replace(/^#/,'')||runtime.route||'today';
  if(VALID_ROUTES.has(current))activateRoute(current);
  updateClock();
});
observer.observe(document.documentElement,{subtree:true,childList:true});

window.addEventListener('hashchange',()=>{
  const route=location.hash.replace(/^#/,'')||'today';
  if(VALID_ROUTES.has(route)){
    runtime.route=route;
    activateRoute(route);
    if(typeof window.__rmNavigate!=='function')fallbackRender(route);
  }
  updateClock();
});

window.addEventListener('focus',updateClock);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateClock()});
startClock();
