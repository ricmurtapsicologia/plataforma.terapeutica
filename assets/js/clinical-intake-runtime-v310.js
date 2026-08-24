import {data,runtime,selectedPatient} from './state.js';
import {bulkPutEncryptedAtomic,getMeta,setMeta} from './database.js';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {toast,modal,closeModal,esc} from './ui.js';
import {
  RESPONSE_SHEET_ID,
  REVIEW_STATUS,
  parseCsv,
  rowsToObjects,
  submissionRows,
  bindPatientExact,
  rowFingerprint,
  buildClinicalIntakeArtifact,
  sanitizedLedgerEntry,
  sanitizedQueueEntry
} from './clinical-intake-core-v310.mjs';

const META_LEDGER='clinicalIntakeLedger.v310';
const META_QUEUE='clinicalIntakeQueue.v311';
const POLL_MS=120000;
const RETRY_MIN_MS=30000;
const MAX_LEDGER=1200;
const MAX_QUEUE=1600;
let timer=null;
let running=false;
let lastRunAt=0;
let lastToastKey='';
let lastToastAt=0;
let status={state:'idle',imported:0,unbound:0,ambiguous:0,pendingReview:0,priority:0,pendingQueue:0,bindingRequired:0,sourceLive:0,processedTotal:0,lastRunAt:'',detail:'Aguardando abertura do cofre.'};

function pendingIntakes(){return (Array.isArray(data.notes)?data.notes:[]).filter(x=>x?.kind==='clinicalIntake'&&x?.status===REVIEW_STATUS)}
function publishStatus(patch={}){
  const pending=pendingIntakes();
  status={...status,...patch,pendingReview:pending.length,priority:pending.filter(x=>x?.intake?.priorityHumanReview).length};
  globalThis.__rmClinicalIntakeStatus={...status};
  document.dispatchEvent(new CustomEvent('rm:clinical-intake-status',{detail:{...status}}));
  decorateStatusChip();
}

function safeToast(message,kind='info',key=message){const now=Date.now();if(lastToastKey===key&&now-lastToastAt<120000)return;lastToastKey=key;lastToastAt=now;toast(message,kind)}
function schedule(delay=POLL_MS){clearTimeout(timer);timer=setTimeout(()=>void reconcileClinicalIntakes({reason:'timer'}),delay)}

async function readLedger(){const raw=await getMeta(META_LEDGER);return Array.isArray(raw)?raw.filter(x=>x?.fingerprint&&x?.state):[]}
async function writeLedger(entries){const unique=new Map();for(const item of entries)if(item?.fingerprint)unique.set(item.fingerprint,item);await setMeta(META_LEDGER,[...unique.values()].slice(-MAX_LEDGER))}
async function readQueue(){const raw=await getMeta(META_QUEUE);return Array.isArray(raw)?raw.filter(x=>x?.fingerprint&&x?.state):[]}
async function writeQueue(entries){const unique=new Map();for(const item of entries)if(item?.fingerprint)unique.set(item.fingerprint,item);await setMeta(META_QUEUE,[...unique.values()].slice(-MAX_QUEUE))}

async function fetchResponseRows(){
  const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);
  if(!auth.ok)return{ok:false,reason:`workspace-${auth.reason}`,rows:[]};
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(RESPONSE_SHEET_ID)}/export?mimeType=${encodeURIComponent('text/csv')}`;
  const response=await fetch(url,{method:'GET',headers:{Authorization:`Bearer ${auth.token}`,Accept:'text/csv'},cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)return{ok:false,reason:`drive-export-${response.status}`,rows:[]};
  const csv=await response.text();
  return{ok:true,reason:'ok',rows:rowsToObjects(parseCsv(csv))};
}

function upsertLocalNote(note){const list=data.notes||(data.notes=[]),index=list.findIndex(x=>x?.id===note.id);if(index>=0)list[index]=note;else list.push(note)}
function existingIntakeByFingerprint(fingerprint){return (Array.isArray(data.notes)?data.notes:[]).find(x=>x?.kind==='clinicalIntake'&&x?.source?.rowFingerprint===fingerprint)}
function queueStats(entries){
  const list=Array.isArray(entries)?entries:[];
  const pending=list.filter(x=>['RECEIVED','PROCESSING','PATIENT_BINDING_REQUIRED'].includes(x?.state));
  return{
    pendingQueue:pending.length,
    bindingRequired:list.filter(x=>x?.state==='PATIENT_BINDING_REQUIRED').length,
    processedTotal:list.filter(x=>x?.state==='PROCESSED').length
  };
}

export async function reconcileClinicalIntakes({reason='manual',force=false}={}){
  if(running)return{ok:false,reason:'already-running',...status};
  if(runtime.locked||!runtime.key||!runtime.dataReady){publishStatus({state:'waiting-vault',detail:'Cofre clínico fechado; o backfill será obrigatório na próxima abertura.'});schedule();return{ok:false,reason:'vault-locked',...status}}
  if(!force&&Date.now()-lastRunAt<RETRY_MIN_MS){schedule();return{ok:true,reason:'throttled',...status}}
  running=true;lastRunAt=Date.now();
  publishStatus({state:'scanning',lastRunAt:new Date().toISOString(),detail:'Reconciliando todas as submissões de produção.'});
  try{
    const source=await fetchResponseRows();
    if(!source.ok){
      const waiting=source.reason.startsWith('workspace-');
      publishStatus({state:waiting?'waiting-google':'error',detail:waiting?'Google Workspace precisa estar conectado para importar anamneses.':'Não foi possível consultar a origem da anamnese.'});
      schedule(waiting?POLL_MS:60000);
      return{ok:false,reason:source.reason,...status};
    }

    const rows=submissionRows(source.rows);
    const ledger=await readLedger();
    const importedHashes=new Set(ledger.filter(x=>x.state==='IMPORTED').map(x=>x.fingerprint));
    const newLedger=[...ledger];
    const queueMap=new Map((await readQueue()).map(x=>[x.fingerprint,x]));
    const artifacts=[];
    let unbound=0,ambiguous=0,already=0;

    for(const row of rows){
      const fingerprint=await rowFingerprint(row);
      if(importedHashes.has(fingerprint)){
        queueMap.set(fingerprint,sanitizedQueueEntry(fingerprint,'PROCESSED'));
        already++;
        continue;
      }

      queueMap.set(fingerprint,sanitizedQueueEntry(fingerprint,'RECEIVED'));
      if(existingIntakeByFingerprint(fingerprint)){
        newLedger.push(sanitizedLedgerEntry(fingerprint,'IMPORTED'));
        importedHashes.add(fingerprint);
        queueMap.set(fingerprint,sanitizedQueueEntry(fingerprint,'PROCESSED'));
        already++;
        continue;
      }

      const binding=bindPatientExact(row,data.patients);
      if(!binding.ok){
        if(binding.reason==='AMBIGUOUS_PATIENT_BINDING')ambiguous++;else unbound++;
        queueMap.set(fingerprint,sanitizedQueueEntry(fingerprint,'PATIENT_BINDING_REQUIRED',binding.reason));
        continue;
      }

      queueMap.set(fingerprint,sanitizedQueueEntry(fingerprint,'PROCESSING'));
      const artifact=buildClinicalIntakeArtifact({patient:binding.patient,row,fingerprint});
      artifacts.push({artifact,fingerprint});
    }

    await writeQueue([...queueMap.values()]);

    if(artifacts.length){
      await bulkPutEncryptedAtomic([{storeName:'notes',values:artifacts.map(x=>x.artifact)}],runtime.key,{verify:true});
      for(const item of artifacts){
        upsertLocalNote(item.artifact);
        newLedger.push(sanitizedLedgerEntry(item.fingerprint,'IMPORTED'));
        importedHashes.add(item.fingerprint);
        queueMap.set(item.fingerprint,sanitizedQueueEntry(item.fingerprint,'PROCESSED'));
      }
      await writeLedger(newLedger);
      await writeQueue([...queueMap.values()]);
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'notes',kind:'clinical-intake-v311',at:new Date().toISOString(),verified:true,count:artifacts.length}}));
      window.__rmRender?.();
    }else if(newLedger.length!==ledger.length){
      await writeLedger(newLedger);
      await writeQueue([...queueMap.values()]);
    }

    const stats=queueStats([...queueMap.values()]);
    const priorityNew=artifacts.filter(x=>x.artifact?.intake?.priorityHumanReview).length;
    const detail=artifacts.length
      ?`${artifacts.length} anamnese(s) importada(s), verificadas e aguardando revisão.`
      :stats.pendingQueue
        ?`${stats.pendingQueue} submissão(ões) permanecem pendentes de conclusão.`
        :'Todas as submissões de produção estão reconciliadas.';
    publishStatus({state:stats.pendingQueue?'attention':'ready',imported:artifacts.length,unbound,ambiguous,sourceLive:rows.length,...stats,detail,lastRunAt:new Date().toISOString()});
    if(artifacts.length)safeToast(priorityNew?'Nova anamnese importada com revisão prioritária.':'Nova anamnese processada e aguardando sua revisão.',priorityNew?'error':'success',`import:${artifacts.length}:${priorityNew}`);
    else if((unbound||ambiguous)&&reason!=='timer')safeToast(`${unbound+ambiguous} anamnese(s) requerem vínculo exato com um paciente antes da importação.`,'info',`binding:${unbound}:${ambiguous}`);
    schedule();
    return{ok:true,reason:'ok',imported:artifacts.length,already,unbound,ambiguous,sourceLive:rows.length,...stats,...status};
  }catch(err){
    const code=String(err?.message||'CLINICAL_INTAKE_ERROR').split(':')[0].slice(0,80);
    publishStatus({state:'error',detail:`Falha controlada no processamento (${code}).`,lastRunAt:new Date().toISOString()});
    console.error('Clinical intake reconciliation failed:',code);
    schedule(60000);
    return{ok:false,reason:code,...status};
  }finally{running=false}
}

async function markReviewed(id){
  const note=(Array.isArray(data.notes)?data.notes:[]).find(x=>x?.id===id&&x?.kind==='clinicalIntake');
  if(!note)throw new Error('INTAKE_NOT_FOUND');
  if(note.status!=='REVIEWED'){
    const updated={...note,status:'REVIEWED',reviewRequired:false,reviewedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),title:'Anamnese — revisada'};
    await bulkPutEncryptedAtomic([{storeName:'notes',values:[updated]}],runtime.key,{verify:true});
    upsertLocalNote(updated);
    document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'notes',kind:'clinical-intake-reviewed-v311',at:new Date().toISOString(),verified:true}}));
  }
  publishStatus({detail:'Revisão da anamnese registrada.'});
  window.__rmRender?.();
  toast('Anamnese marcada como revisada.','success');
}

function openIntake(id){
  const note=(Array.isArray(data.notes)?data.notes:[]).find(x=>x?.id===id&&x?.kind==='clinicalIntake');
  if(!note)return;
  modal(note.title||'Anamnese',`<div class="notice ${note?.intake?.priorityHumanReview?'danger':'warning'}">${note?.intake?.priorityHumanReview?'Revisão prioritária indicada por resposta explícita no campo de segurança.':'Conteúdo organizado automaticamente. A conclusão clínica permanece exclusivamente humana.'}</div><pre style="white-space:pre-wrap;word-break:break-word;font:inherit;line-height:1.55;margin-top:16px">${esc(note.text||'')}</pre>`,`<button class="btn secondary" data-action="close-modal">Fechar</button>${note.status===REVIEW_STATUS?`<button class="btn" data-clinical-intake-review="${esc(note.id)}">Marcar como revisada</button>`:''}`,true);
}

function selectIntakePatient(patientId){
  if(!patientId)return;
  runtime.selectedPatientId=patientId;runtime.route='patients';runtime.patientTab='notes';
  if(location.hash!=='#patients')location.hash='#patients';
  window.__rmRender?.();
}

function openPendingHub(){
  const list=pendingIntakes();
  if(!list.length){
    if(status.pendingQueue)toast(`${status.pendingQueue} submissão(ões) ainda aguardam conclusão do processamento.`,'info');
    else toast('Não há anamneses aguardando revisão.','info');
    return;
  }
  if(list.length===1){selectIntakePatient(list[0].patientId);setTimeout(()=>openIntake(list[0].id),80);return}
  const patients=new Map((Array.isArray(data.patients)?data.patients:[]).map(p=>[p.id,p]));
  modal('Anamneses aguardando revisão',`<div class="list">${list.map(n=>{const p=patients.get(n.patientId);return`<div class="list-item"><div><strong>${esc(p?.preferredName||p?.name||'Paciente')}</strong><div class="small muted">${n?.intake?.priorityHumanReview?'Revisão prioritária':'Aguardando revisão'}</div></div><button class="btn secondary" data-clinical-intake-open="${esc(n.id)}">Abrir</button></div>`}).join('')}</div>`,`<button class="btn secondary" data-action="close-modal">Fechar</button>`,true);
}

function decorateStatusChip(){
  if(runtime.locked)return;
  const host=document.querySelector('.top-actions');if(!host)return;
  let chip=document.getElementById('rm-clinical-intake-status-v310');
  if(!chip){chip=document.createElement('button');chip.type='button';chip.id='rm-clinical-intake-status-v310';chip.dataset.clinicalIntakeHub='1';host.insertBefore(chip,host.firstChild)}
  const pending=pendingIntakes(),priority=pending.filter(x=>x?.intake?.priorityHumanReview).length;
  chip.className=`rm-status-chip ${status.state==='error'?'error':priority||status.unbound||status.ambiguous||status.pendingQueue?'warn':status.state==='ready'?'ok':''}`;
  chip.textContent=pending.length?`Anamnese ${pending.length}${priority?' !':''}`:status.pendingQueue?`Anamnese ↻ ${status.pendingQueue}`:'Anamnese ✓';
  chip.title=status.detail||'Clinical Intake';
}

function decorateNotes(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='notes')return;
  const patient=selectedPatient();const host=document.getElementById('patient-tab-content');if(!patient||!host)return;
  host.querySelector('#rm-clinical-intake-review-card-v310')?.remove();
  const list=(Array.isArray(data.notes)?data.notes:[]).filter(n=>n?.patientId===patient.id&&n?.kind==='clinicalIntake').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  if(!list.length)return;
  const card=document.createElement('section');card.id='rm-clinical-intake-review-card-v310';card.className='card mb-16';
  card.innerHTML=`<div class="card-title"><div><div class="eyebrow">Clinical Intake</div><h3 class="mb-0">Anamnese</h3></div><span class="badge">${list.filter(x=>x.status===REVIEW_STATUS).length} aguardando</span></div><div class="list mt-12">${list.map(n=>`<div class="list-item"><div><strong>${esc(n.title||'Anamnese')}</strong><div class="small muted">${n.status===REVIEW_STATUS?'Aguardando revisão profissional':'Revisada'}${n?.intake?.priorityHumanReview?' · prioridade':''}</div></div><button class="btn secondary" data-clinical-intake-open="${esc(n.id)}">Abrir</button></div>`).join('')}</div>`;
  host.prepend(card);
}

document.addEventListener('click',event=>{
  const hub=event.target.closest?.('[data-clinical-intake-hub]');if(hub){event.preventDefault();openPendingHub();return}
  const open=event.target.closest?.('[data-clinical-intake-open]');if(open){event.preventDefault();openIntake(open.dataset.clinicalIntakeOpen);return}
  const review=event.target.closest?.('[data-clinical-intake-review]');if(review){event.preventDefault();const id=review.dataset.clinicalIntakeReview;closeModal();void markReviewed(id).catch(()=>safeToast('Não foi possível registrar a revisão da anamnese.','error','review-error'));return}
},true);

document.addEventListener('rm:data-ready',()=>{publishStatus({state:'ready',detail:'Clinical Intake pronto; iniciando backfill obrigatório.'});setTimeout(()=>void reconcileClinicalIntakes({reason:'data-ready',force:true}),900)});
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void reconcileClinicalIntakes({reason:'workspace-authorized',force:true}),700));
document.addEventListener('rm:rendered',()=>{decorateStatusChip();decorateNotes()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void reconcileClinicalIntakes({reason:'visibility'})});
window.addEventListener('online',()=>void reconcileClinicalIntakes({reason:'online'}));
window.addEventListener('focus',()=>void reconcileClinicalIntakes({reason:'focus'}));
window.addEventListener('pageshow',()=>void reconcileClinicalIntakes({reason:'pageshow'}));
window.addEventListener('beforeunload',()=>clearTimeout(timer));

publishStatus();
