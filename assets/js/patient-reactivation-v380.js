import {data,runtime,patientById,selectedPatient,nowISO} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {addActivity} from './audit.js';
import {modal,closeModal,toast,esc} from './ui.js';

// Interface apenas; nomes e dados clínicos permanecem no cofre cifrado.
const VERSION='3.9.3-reactivation-v380';
const ACTION='rm-reactivate-patient-v380';
const CONFIRM='rm-confirm-reactivation-v380';
let busy=false;
const isInactive=p=>p?.status==='Inativo';

function actionButton(id,kind='secondary'){
  const b=document.createElement('button');
  b.type='button';b.className=`btn ${kind}`;b.dataset.action=ACTION;
  b.dataset.id=id;b.textContent='Reativar paciente';
  b.setAttribute('aria-label','Reativar cadastro deste paciente');
  return b;
}

function decorateCards(){
  if(runtime.locked||runtime.route!=='patients')return;
  document.querySelectorAll('#inactive-patients [data-patient-card][data-status="Inativo"]').forEach(card=>{
    const id=card.querySelector('[data-action="select-patient"]')?.dataset.id||'';
    if(!id||!isInactive(patientById(id)))return;
    const actions=card.querySelector('.flex.gap-8.wrap');
    if(!actions)return;
    actions.querySelector('[data-action="quick-schedule-patient"]')?.remove();
    if(!actions.querySelector(`[data-action="${ACTION}"]`))actions.appendChild(actionButton(id));
  });
}

function decorateSelected(){
  const p=selectedPatient(),context=document.querySelector('#patient-workspace .patient-context');
  const old=document.getElementById('rm-reactivation-selected-v380');
  if(runtime.locked||runtime.route!=='patients'||!context||!isInactive(p)){old?.remove();return;}
  if(old?.dataset.id===p.id)return;
  old?.remove();
  const wrap=document.createElement('div');
  wrap.id='rm-reactivation-selected-v380';wrap.dataset.id=p.id;
  wrap.className='notice mt-12 rm-reactivation-notice';
  const hint=document.createElement('span');
  hint.textContent='Cadastro inativo. Reative para retomar o acompanhamento e agendar novas sessões.';
  wrap.append(hint,actionButton(p.id));
  context.insertAdjacentElement('afterend',wrap);
}

function decorateActionMenu(){
  const root=document.getElementById('modal-root'),p=selectedPatient();
  if(!root||!isInactive(p)||runtime.locked)return;
  const title=root.querySelector('#modal-title');
  if(title?.textContent?.trim()!=='Ação rápida')return;
  const grid=root.querySelector('.modal-body .grid');
  if(!grid||grid.querySelector(`[data-action="${ACTION}"]`))return;
  grid.appendChild(actionButton(p.id));
  const schedule=grid.querySelector('[data-action="schedule-selected-patient"]');
  if(schedule){schedule.disabled=true;schedule.title='Reative o cadastro para agendar uma sessão.';}
}

function decorate(){decorateCards();decorateSelected();decorateActionMenu();}

function promptReactivation(id){
  const p=patientById(id);
  if(!p)throw new Error('Paciente não localizado no cofre.');
  if(!isInactive(p))throw new Error('Somente pacientes com status Inativo podem ser reativados por esta ação.');
  if(!runtime.key||runtime.locked||!runtime.dataReady||runtime.integrityBlocked)throw new Error('Cofre clínico indisponível. Desbloqueie e verifique a integridade dos dados.');
  modal('Reativar paciente',
    `<p>Reativar o cadastro de <strong data-sensitive>${esc(p.name||'Paciente')}</strong>?</p>`+
    '<p class="small muted">O status será alterado de Inativo para Ativo. Prontuários, sessões anteriores, plano terapêutico e registros financeiros permanecerão preservados. Nenhuma sessão será criada automaticamente.</p>',
    `<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="${CONFIRM}" data-id="${esc(p.id)}">Confirmar reativação</button>`
  );
}

async function reactivate(id){
  if(busy)return;
  if(!runtime.key||runtime.locked||!runtime.dataReady||runtime.integrityBlocked)throw new Error('Cofre clínico bloqueado ou ainda não carregado.');
  const p=patientById(id);
  if(!p||!isInactive(p))throw new Error('Este paciente não está mais inativo. Atualize a página para conferir o status.');
  busy=true;
  const button=document.querySelector(`[data-action="${CONFIRM}"]`);
  if(button){button.disabled=true;button.textContent='Verificando gravação…';}
  try{
    const next={...p,status:'Ativo',reactivatedAt:nowISO(),updatedAt:nowISO()};
    await bulkPutEncryptedAtomic([{storeName:'patients',values:[next]}],runtime.key,{verify:true});
    const index=data.patients.findIndex(item=>item?.id===id);
    if(index<0)throw new Error('Cadastro não encontrado na memória após gravação.');
    data.patients[index]=next;
    let audited=true;
    try{await addActivity('Paciente reativado',{entity:'patients',patientId:id,entityId:id,details:'Alteração manual de status Inativo para Ativo.'});}
    catch(error){audited=false;console.error('Falha ao registrar auditoria da reativação',error);}
    runtime.selectedPatientId=id;
    runtime.patientTab='summary';
    closeModal();
    window.__rmRender?.();
    toast(audited?'Paciente reativado. Histórico preservado.':'Paciente reativado. Verifique o registro de auditoria.','success');
  }finally{
    busy=false;
    if(button?.isConnected){button.disabled=false;button.textContent='Confirmar reativação';}
  }
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-action]');
  if(!button)return;
  const action=button.dataset.action;
  if(action!==ACTION&&action!==CONFIRM)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(action===CONFIRM)void reactivate(button.dataset.id||'').catch(error=>{console.error(error);toast(error.message||'Falha na reativação.','error');});
  else{try{promptReactivation(button.dataset.id||'');}catch(error){toast(error.message||'Não foi possível reativar.','error');}}
},true);

document.addEventListener('rm:rendered',decorate);
document.addEventListener('rm:data-ready',decorate);
const root=document.getElementById('modal-root');
if(root)new MutationObserver(decorateActionMenu).observe(root,{childList:true,subtree:true});
if(!runtime.locked)queueMicrotask(decorate);
globalThis.__rmPatientReactivation={version:VERSION,decorate};
