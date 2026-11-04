import {data,runtime,selectedPatient,uid,nowISO,todayISO} from './state.js';
import {bulkPutEncryptedAtomic,getDecryptedById} from './database.js';
import {backupStatus} from './backup.js';
import {addActivity} from './audit.js';
import {modal,closeModal,toast,esc} from './ui.js';
import {PROGRESS_KIND,makeProgressRecord,progressSeries,progressDescription,clinicalValueSignals,resolvePlanReference,assessBackupGate} from './clinical-value-core-v390.mjs';

// Piloto opt-in; nenhuma gravação ou nova visualização clínica antes do aceite local.
const FLAG = 'rm.clinicalValuePilot.v390';
const enabled = () => localStorage.getItem(FLAG) === 'enabled';
const arr = v => Array.isArray(v) ? v : [];
const restoreProof = () => {try{return JSON.parse(localStorage.getItem('rm.p0.restoreTest.v1')||'null')}catch{return null}};
async function showPilotPrerequisites(){
  const node=document.getElementById('rm-pilot-check-v390');if(!node)return;
  try{const state=assessBackupGate(await backupStatus(),restoreProof());if(!node.isConnected)return;
    node.textContent=state.ok?'Backup e restauração isolada verificados neste cofre. Confirme também a sincronização entre dispositivos.':state.message;
  }catch{if(node.isConnected)node.textContent='Não foi possível conferir o backup. Execute o diagnóstico e tente novamente.'}
}
let editingPatientId = '';
let saving = false;
let syncConflict = false;
let selectedSeriesKey = new Map();

function goalsFor(patientId) {
  return arr(data.goals).filter(g => g.patientId === patientId && !['Alcançado','Pausado'].includes(g.status));
}
function pointsMarkup(series) {
  const points = series.records;
  if (!points.length) return '<p class="small muted">Sem medidas comparáveis registradas.</p>';
  const coords = points.map((r,i) => ({
    x: points.length === 1 ? 178 : 40 + i*275/(points.length-1),
    y: 122 - Number(r.value)*9.7,
    value:Number(r.value)
  }));
  const path = coords.map(p => p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const circles = coords.map(p=>'<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="4.5" fill="currentColor"/>').join('');
  const svg = '<svg viewBox="0 0 360 148" role="img" aria-label="Evolução descritiva de '+esc(String(points.length))+' medida(s) numa escala de zero a dez" style="width:100%;max-width:460px;height:auto;color:var(--primary2,#27647c)"><path d="M40 25V122H324" fill="none" stroke="currentColor" opacity=".4"/><path d="M40 74H324" fill="none" stroke="currentColor" opacity=".15"/><text x="10" y="28" font-size="11" fill="currentColor">10</text><text x="16" y="123" font-size="11" fill="currentColor">0</text><polyline points="'+path+'" fill="none" stroke="currentColor" stroke-width="2.5"/>'+circles+'</svg>';
  const rows = points.slice(-5).map(p=>'<tr><td>'+esc(p.date)+'</td><td>'+esc(String(p.value))+'/10</td><td><button type="button" class="btn ghost" data-clinical-value-correct="'+esc(p.id)+'">Corrigir</button></td></tr>').join('');
  return svg+'<p class="small muted">'+esc(progressDescription(series))+'</p><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Medida</th><th>Ação</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function signalsMarkup(patientId) {
  const signals = clinicalValueSignals({patientId,notes:data.notes,goals:data.goals,tasks:data.tasks,today:todayISO()});
  const lines = [];
  if (!signals.plan.approved) lines.push('Plano individualizado ainda sem validação profissional.');
  if (signals.plan.newerDraft) lines.push('Uma versão posterior do plano aguarda revisão.');
  if (signals.due.length) lines.push(signals.due.length+' objetivo(s) com data de revisão ultrapassada.');
  if (signals.withoutMeasure.length) lines.push(signals.withoutMeasure.length+' objetivo(s) ativo(s) sem medida longitudinal.');
  if (signals.withoutBaseline.length) lines.push(signals.withoutBaseline.length+' objetivo(s) sem referência inicial descritiva.');
  if (signals.pendingTasks.length) lines.push(signals.pendingTasks.length+' tarefa(s) ainda em aberto.');
  if (!lines.length) return '<p class="small muted">Nenhuma pendência de continuidade identificada pelos critérios configurados.</p>';
  return '<ul>'+lines.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>';
}
function goalCard(goal) {
  const pid=goal.patientId, requested=selectedSeriesKey.get(pid+'|'+goal.id)||'';
  const series=progressSeries(data.notes,pid,goal.id,requested);
  const label = key => key.startsWith('autorreferida')?'Autorrelato':key.startsWith('observacao')?'Observação profissional':key;
  const options=series.groups.map(key=>'<option value="'+esc(key)+'" '+(series.key===key?'selected':'')+'>'+esc(label(key)+' · '+(key.includes('maior-melhor')?'maior = melhor':'maior = maior dificuldade'))+'</option>').join('');
  return '<section class="card mt-12"><div class="card-title"><div><strong>'+esc(goal.title||'Objetivo')+'</strong><div class="small muted">Situação: '+esc(goal.status||'Não definida')+' · Próxima revisão: '+esc(goal.reviewDate||'não definida')+'</div></div><button type="button" class="btn secondary" data-clinical-value-new="'+esc(goal.id)+'">Registrar medida</button></div>'+
    (series.distinctMethods>1?'<div class="field mt-8"><label>Série comparável</label><select class="select" data-clinical-value-series="'+esc(goal.id)+'">'+options+'</select></div>':'')+
    '<div class="mt-12">'+pointsMarkup(series)+'</div><p class="tiny muted">Medida descritiva de 0 a 10, não diagnóstica. Métodos e sentidos diferentes nunca são agregados.</p></section>';
}
function decoratePatient() {
  const host=document.getElementById('patient-tab-content');
  if (!enabled()||runtime.locked||!runtime.dataReady||runtime.route!=='patients') {host?.querySelector('#rm-clinical-value-v390')?.remove();return;}
  const p=selectedPatient();
  if (!p||!host) return;
  host.querySelector('#rm-clinical-value-v390')?.remove();
  if (runtime.patientTab==='plans') {
    const card=document.createElement('section');card.id='rm-clinical-value-v390';card.className='card mb-16';
    const goals=goalsFor(p.id);
    card.innerHTML='<div class="card-title"><div><div class="eyebrow">Acompanhamento longitudinal · Revisão profissional</div><h3 class="mb-0">Evolução dos objetivos</h3></div></div>'+
      '<p class="small muted">As medidas são registradas manualmente pelo psicólogo. Evolução numérica não demonstra eficácia causal.</p>'+
      (goals.length?goals.map(goalCard).join(''):'<p class="small muted">Cadastre um objetivo terapêutico antes de registrar medidas.</p>');
    host.prepend(card);
  } else if (runtime.patientTab==='summary') {
    const card=document.createElement('section');card.id='rm-clinical-value-v390';card.className='card mb-16';
    card.innerHTML='<h3>Continuidade terapêutica</h3>'+signalsMarkup(p.id)+
      '<button type="button" class="btn secondary" data-action="patient-tab" data-tab="plans">Abrir plano e evolução</button>';
    host.prepend(card);
  }
}
function decorateSettings(){
  if (runtime.locked||!runtime.dataReady||runtime.route!=='settings') return;
  const host=document.querySelector('#settings-content')||document.querySelector('.content');
  if (!host) return;
  host.querySelector('#rm-clinical-value-settings-v390')?.remove();
  const card=document.createElement('section');card.id='rm-clinical-value-settings-v390';card.className='card mt-16';
  card.innerHTML='<div class="card-title"><h3>Piloto de valor clínico</h3><span class="badge">'+(enabled()?'Ativo neste navegador':'Desativado')+'</span></div>'+
   '<p class="small">Integra plano validado, preparação da sessão e medidas longitudinais. A ativação exige backup real testado e validação entre dispositivos; não substitui o aceite clínico.</p>'+
   (enabled()?'':'<div id="rm-pilot-check-v390" role="status" class="notice mt-12">Conferindo o backup deste cofre…</div><div class="flex gap-8 wrap mt-12"><button type="button" class="btn secondary" data-action="export-backup">1. Gerar backup .rmvault</button><button type="button" class="btn secondary" data-action="verify-backup">2. Testar restore isolado</button></div>')+
   '<button type="button" class="btn secondary mt-12" data-clinical-value-toggle="1">'+(enabled()?'Desativar piloto':'Validar requisitos e ativar piloto')+'</button>';
  host.appendChild(card);
  void showPilotPrerequisites();
}
function decorate(){decoratePatient();decorateSettings()}
function modalField(label,html){return '<div class="field mt-12"><label>'+label+'</label>'+html+'</div>'}
function openMeasureEditor(goalId,previousId=''){
  if(!enabled()||runtime.locked||!runtime.key||!runtime.dataReady||runtime.integrityBlocked)throw new Error('Piloto indisponível ou cofre não íntegro.');
  if(syncConflict)throw new Error('Conflito de sincronização pendente; resolva antes de registrar medidas.');
  const patient=selectedPatient(),goal=goalsFor(patient?.id).find(x=>x.id===goalId);
  if(!patient||!goal)throw new Error('Paciente e objetivo devem estar ativos.');
  const previous=previousId?arr(data.notes).find(n=>n.id===previousId&&n.kind===PROGRESS_KIND&&n.patientId===patient.id&&n.goalId===goalId):null;
  if(previousId&&!previous)throw new Error('Medida original não localizada.');
  editingPatientId=patient.id;
  const sessions=arr(data.appointments).filter(a=>a.patientId===patient.id&&a.date&&a.date<=todayISO()).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,30);
  const options='<option value="">Sem vínculo específico</option>'+sessions.map(a=>'<option value="'+esc(a.clinicalSessionId||a.id)+'" '+(previous?.sessionId===(a.clinicalSessionId||a.id)?'selected':'')+'>'+esc(a.date+' · '+(a.time||'')+' · '+(a.status||''))+'</option>').join('');
  const origin=previous?.method||'autorreferida',orientation=previous?.orientation||'maior-melhor';
  const html='<p class="small">Objetivo: <strong>'+esc(goal.title)+'</strong>. Registre apenas medidas que tenham sido realmente obtidas, com participação ou revisão profissional.</p>'+
    '<input id="value-original-id-v390" type="hidden" value="'+esc(previous?.id||'')+'">'+
    modalField('Data','<input id="value-date-v390" class="input" type="date" max="'+todayISO()+'" value="'+esc(previous?.date||todayISO())+'">')+
    modalField('Pontuação de 0 a 10','<input id="value-score-v390" class="input" type="number" min="0" max="10" step="0.1" value="'+esc(previous?String(previous.value):'')+'">')+
    modalField('Procedência','<select id="value-method-v390" class="select"><option value="autorreferida" '+(origin==='autorreferida'?'selected':'')+'>Autorrelato / avaliação do paciente</option><option value="observacao" '+(origin==='observacao'?'selected':'')+'>Observação do profissional</option></select>')+
    modalField('Interpretação da escala','<select id="value-orientation-v390" class="select"><option value="maior-melhor" '+(orientation==='maior-melhor'?'selected':'')+'>Maior pontuação = melhor situação</option><option value="maior-pior" '+(orientation==='maior-pior'?'selected':'')+'>Maior pontuação = maior dificuldade</option></select>')+
    modalField('Sessão vinculada (opcional)','<select id="value-session-v390" class="select">'+options+'</select>')+
    modalField('Contexto clínico (opcional)','<textarea id="value-note-v390" class="textarea" maxlength="1000">'+esc(previous?.note||'')+'</textarea>')+
    '<label class="mt-12"><input type="checkbox" id="value-confirm-v390"> Conferi paciente, objetivo, procedência e pontuação; valido este registro.</label>'+
    '<div class="notice mt-12">Uma correção cria nova versão, preservando o registro original e sua rastreabilidade. Não há envio para serviços públicos.</div>';
  modal(previous?'Corrigir medida de evolução':'Registrar medida de evolução',html,
    '<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-clinical-value-save="1">Validar e salvar</button>',true);
  const field=document.getElementById('value-goal-hidden-v390');
  if(field)field.value=goalId;
  editingGoalId=goalId;
}
let editingGoalId='';
async function saveMeasure(){
  if(saving) return;
  if(!enabled()||runtime.locked||!runtime.key||!runtime.dataReady||runtime.integrityBlocked)throw new Error('Cofre indisponível.');
  if(syncConflict)throw new Error('Conflito de sincronização pendente; gravação bloqueada.');
  const patient=selectedPatient(),goal=goalsFor(patient?.id).find(g=>g.id===editingGoalId);
  if(!patient||patient.id!==editingPatientId||!goal)throw new Error('O paciente ou objetivo selecionado mudou.');
  if(!document.querySelector('#value-confirm-v390')?.checked)throw new Error('É necessária a validação profissional antes de salvar.');
  const supersedesId=document.getElementById('value-original-id-v390')?.value||'';
  const previous=supersedesId?arr(data.notes).find(n=>n.id===supersedesId):null;
  const input={id:uid('measure'),patientId:patient.id,goalId:goal.id,goal,
    date:document.getElementById('value-date-v390')?.value||'',
    score:document.getElementById('value-score-v390')?.value||'',
    method:document.getElementById('value-method-v390')?.value||'',
    orientation:document.getElementById('value-orientation-v390')?.value||'',
    sessionId:document.getElementById('value-session-v390')?.value||'',
    note:document.getElementById('value-note-v390')?.value||'',
    supersedesId,previous,now:nowISO(),today:todayISO()};
  const row=makeProgressRecord(input);
  if(row.sessionId&&!arr(data.appointments).some(a=>a.patientId===patient.id&&(a.clinicalSessionId||a.id)===row.sessionId))throw new Error('Sessão não corresponde ao paciente.');
  if(!supersedesId&&arr(data.notes).some(n=>n.kind===PROGRESS_KIND&&n.patientId===patient.id&&n.goalId===goal.id&&n.date===row.date&&n.metricKey===row.metricKey&&!arr(data.notes).some(x=>x.supersedesId===n.id)))throw new Error('Já há uma medida com esta data e série. Use Corrigir para alterar.');
  saving=true;
  try{
    await bulkPutEncryptedAtomic([{storeName:'notes',values:[row]}],runtime.key,{verify:true});
    const check=await getDecryptedById('notes',row.id,runtime.key);
    if(!check||check.patientId!==row.patientId||check.goalId!==row.goalId||check.value!==row.value||check.status!==row.status)throw new Error('Gravação não verificada.');
    data.notes.push(check);
    try{await addActivity(row.supersedesId?'Correção de medida de evolução':'Medida de evolução validada',{entity:'notes',patientId:row.patientId,entityId:row.id,details:row.supersedesId?'correcao-aditiva':'registro-original'})}catch{toast('Medida salva, mas a trilha de auditoria precisa ser verificada.','warning')}
    editingGoalId='';editingPatientId='';closeModal();window.__rmRender?.();
    toast('Medida registrada e verificada no cofre clínico.','success');
  }finally{saving=false}
}
async function togglePilot(){
  if(enabled()){if(!confirm('Desativar as visualizações do piloto neste navegador? Os registros clínicos serão preservados.'))return;localStorage.removeItem(FLAG);window.__rmRender?.();decorate();return;}
  if(runtime.locked||runtime.integrityBlocked)throw new Error('É necessário abrir um cofre íntegro.');
  const result=assessBackupGate(await backupStatus(),restoreProof());
  if(!result.ok)throw new Error(result.message);
  if(syncConflict)throw new Error('Há conflito de sincronização pendente; resolva antes de ativar.');
  if(!confirm('Confirma que comprovou sincronização bidirecional notebook ↔ celular, sem duplicidades nem conflitos pendentes, e revisou o backup?'))return;
  localStorage.setItem(FLAG,'enabled');window.__rmRender?.();decorate();toast('Piloto ativado neste navegador.','success');
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-clinical-value-new],[data-clinical-value-correct],[data-clinical-value-save],[data-clinical-value-toggle]');
  if(!button)return;
  event.preventDefault();
  try{
    if(button.dataset.clinicalValueToggle!==undefined){void togglePilot().catch(e=>toast(e.message,'error'));return}
    if(button.dataset.clinicalValueSave!==undefined){void saveMeasure().catch(e=>toast(e.message,'error'));return}
    const p=selectedPatient();
    if(button.dataset.clinicalValueNew!==undefined)openMeasureEditor(button.dataset.clinicalValueNew);
    else if(button.dataset.clinicalValueCorrect!==undefined){
      const row=arr(data.notes).find(x=>x.id===button.dataset.clinicalValueCorrect&&x.patientId===p?.id&&x.kind===PROGRESS_KIND);
      if(!row)throw new Error('Medida não localizada para este paciente.');
      openMeasureEditor(row.goalId,row.id);
    }
  }catch(e){toast(e.message||'Ação indisponível.','error')}
});
document.addEventListener('change',event=>{
  const target=event.target.closest?.('[data-clinical-value-series]');
  if(!target||!enabled())return;
  const p=selectedPatient();if(!p)return;
  selectedSeriesKey.set(p.id+'|'+target.dataset.clinicalValueSeries,target.value);
  decoratePatient();
});
document.addEventListener('rm:rendered',()=>queueMicrotask(decorate));
document.addEventListener('rm:data-ready',()=>queueMicrotask(decorate));
document.addEventListener('rm:backup-restore-test',()=>void showPilotPrerequisites());
document.addEventListener('rm:sync-status',event=>{const status=event.detail?.status;if(status==='conflict')syncConflict=true;else if(status==='synced')syncConflict=false;});
document.addEventListener('rm:vault-locked',()=>{editingPatientId='';editingGoalId='';selectedSeriesKey.clear()});
globalThis.__rmClinicalValue={version:'3.9.0',enabled,render:decorate,resolvePlan:patientId=>resolvePlanReference(data.notes,patientId)};
