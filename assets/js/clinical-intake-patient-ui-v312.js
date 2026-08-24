import {data,runtime,selectedPatient} from './state.js';
import {esc} from './ui.js';

const REVIEW_STATUS='AWAITING_PSYCHOLOGIST_REVIEW';

function patientIntakes(patientId){
  return (Array.isArray(data.notes)?data.notes:[])
    .filter(n=>n?.patientId===patientId&&n?.kind==='clinicalIntake')
    .sort((a,b)=>String(b?.source?.submittedAt||b?.createdAt||'').localeCompare(String(a?.source?.submittedAt||a?.createdAt||'')));
}

function ensureClinicalIntakeTab(){
  if(runtime.locked||runtime.route!=='patients'||!selectedPatient())return;
  const tabs=document.querySelector('#patient-workspace .tabs');
  if(!tabs)return;
  let button=tabs.querySelector('[data-clinical-intake-tab]');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.className='tab';
    button.dataset.clinicalIntakeTab='1';
    button.textContent='Anamnese';
    const records=tabs.querySelector('[data-tab="records"]');
    if(records?.nextSibling)tabs.insertBefore(button,records.nextSibling);else if(records)tabs.appendChild(button);else tabs.appendChild(button);
  }
  button.classList.toggle('active',runtime.patientTab==='intake');
}

function renderClinicalIntakeArea(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='intake')return;
  const patient=selectedPatient();
  const host=document.getElementById('patient-tab-content');
  if(!patient||!host)return;
  const list=patientIntakes(patient.id);
  const pending=list.filter(n=>n?.status===REVIEW_STATUS).length;
  const priority=list.filter(n=>n?.intake?.priorityHumanReview&&n?.status===REVIEW_STATUS).length;
  const header=`<section class="card"><div class="card-title"><div><div class="eyebrow">Parte clínica do paciente</div><h3 class="mb-0">Anamnese</h3></div><span class="badge">${pending} aguardando revisão</span></div><p class="small muted mt-12">Respostas de anamnese vinculadas a este paciente e organizadas pelo Clinical Intake. A conclusão clínica permanece sob revisão profissional.</p>${priority?`<div class="notice danger mt-12">${priority} anamnese(s) com revisão prioritária indicada pelo campo de segurança.</div>`:''}</section>`;
  const body=list.length
    ?`<section class="card mt-16"><h3>Histórico de anamneses</h3><div class="list mt-12">${list.map(n=>`<div class="list-item"><div><strong>${esc(n.title||'Anamnese')}</strong><div class="small muted">${esc(n?.source?.submittedAt||String(n.createdAt||'').slice(0,16).replace('T',' '))} · ${n.status===REVIEW_STATUS?'Aguardando revisão profissional':'Revisada'}${n?.intake?.priorityHumanReview?' · prioridade':''}</div></div><button class="btn secondary" data-clinical-intake-open="${esc(n.id)}">Abrir</button></div>`).join('')}</div></section>`
    :`<section class="card mt-16"><h3>Nenhuma anamnese registrada</h3><p class="small muted">Quando uma resposta for vinculada e processada, ela ficará registrada permanentemente nesta área clínica do paciente.</p></section>`;
  host.innerHTML=header+body;
}

function refresh(){ensureClinicalIntakeTab();renderClinicalIntakeArea()}

document.addEventListener('click',event=>{
  const tab=event.target.closest?.('[data-clinical-intake-tab]');
  if(!tab)return;
  event.preventDefault();
  event.stopPropagation();
  runtime.patientTab='intake';
  window.__rmRender?.();
},true);

document.addEventListener('rm:rendered',refresh);
document.addEventListener('rm:data-ready',()=>setTimeout(refresh,0));
document.addEventListener('rm:local-data-changed',event=>{if(event?.detail?.kind?.startsWith?.('clinical-intake'))setTimeout(refresh,0)});
