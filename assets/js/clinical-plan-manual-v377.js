import {data,runtime,selectedPatient,nowISO,uid} from './state.js';
import {bulkPutEncryptedAtomic,getDecryptedById} from './database.js';
import {modal,closeModal,toast,esc} from './ui.js';

// Private patient-specific text is entered only after vault unlock and encrypted locally.
// The public source contains no patient names, drafts, or clinical content.
const KIND='clinicalPlanReviewedVersion';
const TEXT_LIMIT=25000;
let editingPatientId='';
let saving=false;
const rowsFor=patientId=>(Array.isArray(data.notes)?data.notes:[])
  .filter(n=>n?.patientId===patientId&&n?.kind===KIND)
  .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
const currentFor=patientId=>rowsFor(patientId)[0]||null;
const formatDate=value=>{const d=new Date(value||'');return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR');};

function render(){
  if(runtime.locked||!runtime.dataReady||runtime.route!=='patients'||runtime.patientTab!=='plans')return;
  const patient=selectedPatient(),host=document.getElementById('patient-tab-content');
  if(!patient||!host)return;
  host.querySelector('#rm-private-plan-v377')?.remove();
  const versions=rowsFor(patient.id),latest=versions[0];
  const section=document.createElement('section');
  section.id='rm-private-plan-v377';
  section.className='card mb-16';
  section.innerHTML=`<div class="card-title"><div><div class="eyebrow">Plano individualizado · cofre clínico</div><h3 class="mb-0">Revisão clínica do plano</h3></div><button type="button" class="btn secondary" data-clinical-plan-edit-v377="1">${latest?'Nova versão':'Inserir plano'}</button></div>
  <p class="small muted mt-12">Versões individuais são criptografadas e preservadas. O plano assistido e os objetivos estruturados abaixo não são sobrescritos por esta revisão.</p>
  ${latest?`<div class="small mt-12"><strong>Versão ${Number(latest.versionNumber)||versions.length} · ${esc(latest.status||'Rascunho para revisão')}</strong><div class="tiny muted">Salva em ${esc(formatDate(latest.createdAt))}</div></div><div class="mt-12" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(latest.text||'')}</div>`:'<p class="small muted mt-12">Nenhuma revisão individualizada foi gravada neste cofre. Use “Inserir plano” após conferir o paciente e as fontes.</p>'}
  ${versions.length>1?`<details class="mt-16"><summary>Histórico de versões (${versions.length})</summary><ul>${versions.slice(1,15).map(v=>`<li>Versão ${Number(v.versionNumber)||'—'} · ${esc(v.status||'Rascunho')} · ${esc(formatDate(v.createdAt))}</li>`).join('')}</ul></details>`:''}`;
  host.prepend(section);
}

function openEditor(){
  if(runtime.locked||!runtime.key||!runtime.dataReady||runtime.integrityBlocked)throw new Error('Abra um cofre íntegro antes de editar o plano.');
  const patient=selectedPatient();if(!patient)throw new Error('Selecione o paciente.');
  editingPatientId=patient.id;
  const previous=currentFor(patient.id);
  modal('Plano clínico individualizado',`<p class="small">Paciente: <strong>${esc(patient.name||patient.fullName||'Selecionado')}</strong></p>
    <p class="small muted">Cole o plano revisado. Cada salvamento cria nova versão; não substitui objetivos, formulação TCC ou prontuários anteriores.</p>
    <div class="field mt-12"><label for="rm-plan-text-v377">Conteúdo do plano</label><textarea id="rm-plan-text-v377" class="textarea" rows="18" maxlength="${TEXT_LIMIT}" spellcheck="true" placeholder="Formulação, objetivos, técnicas, tarefas, indicadores, próximos passos…">${esc(previous?.text||'')}</textarea></div>
    <div class="field mt-12"><label for="rm-plan-source-v377">Fontes clínicas conferidas (opcional)</label><textarea id="rm-plan-source-v377" class="textarea" rows="2" maxlength="1500">${esc(previous?.sourceNote||'')}</textarea></div>
    <label class="mt-12"><input id="rm-plan-reviewed-v377" type="checkbox"> Revisei as fontes, o paciente e o conteúdo; considero esta versão clinicamente validada.</label>
    <div class="notice mt-12">Sem essa confirmação, será salvo como rascunho para revisão. Nenhum conteúdo será enviado ao GitHub.</div>`,
    `<button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button type="button" class="btn" data-clinical-plan-save-v377="1">Salvar nova versão cifrada</button>`,true);
}

async function save(){
  if(saving)return;
  if(runtime.locked||!runtime.key||!runtime.dataReady||runtime.integrityBlocked)throw new Error('Cofre bloqueado ou com integridade pendente.');
  const patient=selectedPatient();if(!patient||patient.id!==editingPatientId)throw new Error('O paciente selecionado mudou. Abra novamente o editor.');
  const content=document.getElementById('rm-plan-text-v377')?.value?.trim()||'';
  if(content.length<20||content.length>TEXT_LIMIT)throw new Error('Informe um plano de 20 a 25.000 caracteres.');
  const sourceNote=(document.getElementById('rm-plan-source-v377')?.value||'').trim();
  const reviewed=Boolean(document.getElementById('rm-plan-reviewed-v377')?.checked);
  const existing=rowsFor(patient.id),createdAt=nowISO();
  const row={id:uid('planversion'),patientId:patient.id,kind:KIND,versionNumber:Math.max(0,...existing.map(x=>Number(x.versionNumber)||0))+1,
    status:reviewed?'Validado pelo profissional':'Rascunho para revisão',reviewRequired:!reviewed,autonomousDiagnosis:false,
    title:'Revisão individualizada do plano terapêutico',text:content,sourceNote,createdAt,updatedAt:createdAt};
  saving=true;
  try{
    await bulkPutEncryptedAtomic([{storeName:'notes',values:[row]}],runtime.key,{verify:true});
    const confirmed=await getDecryptedById('notes',row.id,runtime.key);
    if(!confirmed||confirmed.patientId!==patient.id||confirmed.text!==content)throw new Error('A gravação não passou na verificação de leitura.');
    data.notes.push(row);
    editingPatientId='';closeModal();window.__rmRender?.();
    toast('Nova versão clínica gravada e verificada no cofre.','success');
  }finally{saving=false;}
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-clinical-plan-edit-v377],[data-clinical-plan-save-v377]');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.dataset.clinicalPlanEditV377!==undefined){try{openEditor()}catch{toast('Não foi possível abrir a revisão do plano.','error')}return;}
  void save().catch(()=>toast('Não foi possível gravar o plano. Verifique o cofre e tente novamente.','error'));
},true);
document.addEventListener('rm:rendered',()=>queueMicrotask(render));
document.addEventListener('rm:data-ready',()=>queueMicrotask(render));
globalThis.__rmClinicalPlanVersions={version:'3.7.7',current:patientId=>currentFor(patientId),count:patientId=>rowsFor(patientId).length};
