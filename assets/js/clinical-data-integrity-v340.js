import {data,runtime,nowISO} from './state.js';
import {bulkPutEncryptedAtomic,deleteRecord,getDecryptedById} from './database.js';
import {addActivity} from './audit.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';
import {appointmentIsPerformed,paymentStateForAppointment,sessionReferenceValue} from './payment-status-v322.mjs';

const VERSION='3.6.0';
const LINK_STORES=['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
const SUBSTANTIVE_STORES=['appointments','records','payments','communications','consents'];
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false,queued=false;

function monthKey(value=''){return String(value||'').slice(0,7)}
function digits(value=''){return String(value||'').replace(/\D/g,'')}
function lower(value=''){return String(value||'').trim().toLowerCase()}
function identitySnapshot(patient){return{cpf:digits(patient?.cpf),email:lower(patient?.email),phone:digits(patient?.phone)}}
function strongIdentityMatch(a,b){const x=identitySnapshot(a),y=identitySnapshot(b);return Boolean((x.cpf&&y.cpf&&x.cpf===y.cpf)||(x.email&&y.email&&x.email===y.email)||(x.phone.length>=10&&y.phone.length>=10&&x.phone===y.phone))}
function conflictingIdentity(a,b){const x=identitySnapshot(a),y=identitySnapshot(b);return Boolean((x.cpf&&y.cpf&&x.cpf!==y.cpf)||(x.email&&y.email&&x.email!==y.email)||(x.phone.length>=10&&y.phone.length>=10&&x.phone!==y.phone))}
function linkedCount(patientId){return LINK_STORES.reduce((sum,store)=>sum+arr(data[store]).filter(row=>row?.patientId===patientId).length,0)}
function substantiveCount(patientId){return SUBSTANTIVE_STORES.reduce((sum,store)=>sum+arr(data[store]).filter(row=>row?.patientId===patientId).length,0)}
function completeness(patient){return['code','cpf','email','phone','preferredName','occupation','summary'].reduce((n,key)=>n+(String(patient?.[key]||'').trim()?1:0),0)+linkedCount(patient?.id)*4}
function mergeFields(primary,secondary){const next={...primary};for(const[key,value]of Object.entries(secondary||{})){if(['id','createdAt','updatedAt'].includes(key))continue;if((next[key]===undefined||next[key]===null||next[key]===''||(Array.isArray(next[key])&&!next[key].length))&&value!==undefined&&value!==null&&value!=='')next[key]=value}next.updatedAt=nowISO();next.mergedDuplicateAt=nowISO();return next}
function placeholderRecord(record){return record?.source?.type==='missing-record-placeholder'||String(record?.id||'').startsWith('missing_record_')||String(record?.text||'').trim()==='Não há prontuário.'}
function recordMatchesAppointment(record,a){if(record?.patientId!==a?.patientId)return false;if(record?.appointmentId===a?.id)return true;if(a?.clinicalSessionId&&record?.clinicalSessionId===a.clinicalSessionId)return true;return record?.date===a?.date&&(!record?.time||!a?.time||record.time===a.time)}
function recordsForAppointment(a){return arr(data.records).filter(r=>recordMatchesAppointment(r,a)).sort((x,y)=>String(y.updatedAt||y.createdAt||'').localeCompare(String(x.updatedAt||x.createdAt||'')))}

async function ensureCheckpoint(){
  const id='clinical_health_checkpoint_v360_latest',old=arr(data.settings).find(x=>x?.id===id);
  if(old?.build==='3.6.0')return old;
  const row={id,kind:'clinicalHealthRollback',build:'3.6.0',createdAt:nowISO(),updatedAt:nowISO(),snapshot:{patients:structuredClone(arr(data.patients)),appointments:structuredClone(arr(data.appointments)),records:structuredClone(arr(data.records)),payments:structuredClone(arr(data.payments))}};
  await bulkPutEncryptedAtomic([{storeName:'settings',values:[row]}],runtime.key,{verify:true});const i=arr(data.settings).findIndex(x=>x?.id===id);if(i>=0)data.settings[i]=row;else data.settings.push(row);await addActivity('Checkpoint automático antes do hardening 3.6',{entity:'maintenance',entityId:id});return row
}

function duplicatePairs(){
  const patients=arr(data.patients).filter(p=>p?.id&&p.status!=='Profissional'),pairs=[];
  for(let i=0;i<patients.length;i++)for(let j=i+1;j<patients.length;j++){
    const a=patients[i],b=patients[j];if(conflictingIdentity(a,b))continue;
    const sameName=normalizeIdentity(a.name||a.preferredName||'')&&normalizeIdentity(a.name||a.preferredName||'')===normalizeIdentity(b.name||b.preferredName||'');
    if(strongIdentityMatch(a,b)||sameName)pairs.push([a,b]);
  }
  return pairs;
}
async function mergeSafeDuplicates(){
  let merged=0;
  for(const[left,right]of duplicatePairs()){
    if(!arr(data.patients).some(p=>p?.id===left.id)||!arr(data.patients).some(p=>p?.id===right.id))continue;
    const primary=completeness(left)>=completeness(right)?left:right,secondary=primary.id===left.id?right:left,writes=[];
    for(const store of LINK_STORES){const changed=[];for(const row of arr(data[store]))if(row?.patientId===secondary.id){row.patientId=primary.id;row.updatedAt=nowISO();changed.push({...row})}if(changed.length)writes.push({storeName:store,values:changed})}
    const mergedPatient=mergeFields(primary,secondary);Object.assign(primary,mergedPatient);writes.push({storeName:'patients',values:[mergedPatient]});
    await bulkPutEncryptedAtomic(writes,runtime.key,{verify:true});await deleteRecord('patients',secondary.id);data.patients=arr(data.patients).filter(p=>p?.id!==secondary.id);if(runtime.selectedPatientId===secondary.id)runtime.selectedPatientId=primary.id;merged++;await addActivity('Cadastro duplicado consolidado com verificação de identidade',{entity:'patients',patientId:primary.id,entityId:secondary.id})
  }
  return merged
}

function looksSyntheticName(value=''){
  const raw=String(value||'').trim();if(!raw||/\s/.test(raw)||raw.length<5||raw.length>28||raw!==raw.toLowerCase())return false;
  const token=normalizeIdentity(raw).replace(/\s/g,'');if(!token)return false;const ratio=new Set(token).size/token.length;return ratio<=0.48||/(..).*\1/.test(token)||/(.)\1{2,}/.test(token)
}
function isSyntheticCandidate(patient){if(!patient?.id||patient.status==='Profissional')return false;if(String(patient.code||'').trim()||digits(patient.cpf)||String(patient.email||'').trim()||digits(patient.phone))return false;if(substantiveCount(patient.id)>0)return false;return looksSyntheticName(patient.name||patient.preferredName||'')}
async function quarantineSyntheticPatients(){
  const bad=arr(data.patients).filter(isSyntheticCandidate),writes=[];
  for(const patient of bad){if(patient.status==='Inativo'&&patient.syntheticCandidate)continue;const next={...patient,status:'Inativo',syntheticCandidate:true,syntheticFlaggedAt:nowISO(),inactiveAt:patient.inactiveAt||nowISO().slice(0,10),updatedAt:nowISO()};Object.assign(patient,next);writes.push(next)}
  if(writes.length){await bulkPutEncryptedAtomic([{storeName:'patients',values:writes}],runtime.key,{verify:true});await addActivity('Cadastros sintéticos sem atividade foram isolados, sem exclusão',{entity:'patients',count:writes.length})}return writes.length
}

async function purgeVerifiedSupersededPlaceholders(){
  const obsolete=[];
  for(const placeholder of arr(data.records).filter(placeholderRecord)){
    const replacement=arr(data.records).find(r=>r?.id!==placeholder.id&&!placeholderRecord(r)&&recordMatchesAppointment(r,{id:placeholder.appointmentId,clinicalSessionId:placeholder.clinicalSessionId,patientId:placeholder.patientId,date:placeholder.date,time:placeholder.time}));
    if(!replacement)continue;const readback=await getDecryptedById('records',replacement.id,runtime.key);if(readback&&!placeholderRecord(readback))obsolete.push(placeholder)
  }
  for(const row of obsolete)await deleteRecord('records',row.id);if(obsolete.length){const ids=new Set(obsolete.map(r=>r.id));data.records=arr(data.records).filter(r=>!ids.has(r.id));await addActivity('Placeholder de prontuário removido somente após persistência verificada do substituto',{entity:'records',count:obsolete.length})}return obsolete.length
}
async function ensureMissingRecordPlaceholders(){
  const rows=[];
  for(const a of arr(data.appointments).filter(appointmentIsPerformed)){
    if(recordsForAppointment(a).length)continue;
    rows.push({id:`missing_record_${a.id}`,patientId:a.patientId,appointmentId:a.id,clinicalSessionId:a.clinicalSessionId||a.id,title:'Evolução de sessão — registro pendente',date:a.date,time:a.time||'',status:'Rascunho',recordState:'AUSENTE_EDITAVEL',text:'Não há prontuário.',followup:'',requiresReview:true,editable:true,source:{type:'missing-record-placeholder',fileId:`missing:${a.id}`,appointmentId:a.id},createdAt:nowISO(),updatedAt:nowISO()})
  }
  if(rows.length){await bulkPutEncryptedAtomic([{storeName:'records',values:rows}],runtime.key,{verify:true});for(const row of rows){const i=arr(data.records).findIndex(r=>r?.id===row.id);if(i>=0)data.records[i]=row;else data.records.push(row)}await addActivity('Prontuários ausentes materializados como rascunho editável',{entity:'records',count:rows.length})}return rows.length
}

function explicitIds(payment){return[...new Set([payment?.appointmentId,...arr(payment?.appointmentIds),payment?.clinicalSessionId].filter(Boolean))]}
function billingUnits(payment,patient){const n=Number(payment?.sessionUnits||patient?.packageSize||0);if(n>0)return Math.max(1,Math.min(12,n));const value=Number(payment?.value||0),reference=Number(patient?.sessionValue??patient?.value??0);if(patient?.billingModel==='mensal'&&reference>0)return Math.max(1,Math.round(value/reference));if(reference>0){const ratio=value/reference,rounded=Math.round(ratio);if(rounded>=2&&rounded<=8&&Math.abs(ratio-rounded)<=.20)return rounded}return 1}
function performedSessions(patientId){return arr(data.appointments).filter(a=>a?.patientId===patientId&&appointmentIsPerformed(a)).sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`))}
function competenceFor(payment){return String(payment?.competence||monthKey(payment?.date)||'').slice(0,7)}
function candidateSessionsForPayment(payment,patient,sessions,claimed){
  const competence=competenceFor(payment),units=billingUnits(payment,patient),free=sessions.filter(a=>!claimed.has(a.id));
  if(units<=1){const sameDate=free.filter(a=>a.date===payment.date);if(sameDate.length===1)return sameDate;const sameMonth=free.filter(a=>monthKey(a.date)===competence);return sameMonth.length===1?sameMonth:[]}
  const sameCompetence=free.filter(a=>monthKey(a.date)===competence);
  if(sameCompetence.length>=units)return sameCompetence.slice(0,units);
  if(payment?.allowCrossCompetence===true){const ordered=[...sameCompetence,...free.filter(a=>monthKey(a.date)!==competence)];return ordered.slice(0,units)}
  return sameCompetence
}
async function allocatePaymentsByCompetence(){
  const paymentWrites=[],appointmentWrites=new Map();let linked=0,partial=0;
  for(const patient of arr(data.patients).filter(p=>p?.id&&p.status!=='Profissional')){
    const sessions=performedSessions(patient.id),payments=arr(data.payments).filter(p=>p?.patientId===patient.id&&p?.status==='Pago').sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))),claimed=new Set();
    for(const payment of payments)for(const id of explicitIds(payment))if(sessions.some(a=>a.id===id))claimed.add(id);
    for(const payment of payments){if(explicitIds(payment).length)continue;const selected=candidateSessionsForPayment(payment,patient,sessions,claimed);if(!selected.length)continue;const units=billingUnits(payment,patient);payment.appointmentIds=selected.map(a=>a.id);if(selected.length===1)payment.appointmentId=selected[0].id;payment.sessionUnits=units;payment.allocatedSessionUnits=selected.length;payment.allocationSource=units>1?'competence-package-v360':'competence-single-v360';payment.allocationStatus=selected.length===units?'complete':'partial';payment.updatedAt=nowISO();paymentWrites.push({...payment});if(selected.length<units)partial++;
      for(const a of selected){claimed.add(a.id);if(!a.paymentReconciled){const next={...a,paymentReconciled:true,paymentReconciledAt:nowISO(),paymentReconciliationSource:'competence-package-v360',updatedAt:nowISO()};Object.assign(a,next);appointmentWrites.set(next.id,next)}linked++}
    }
  }
  const batches=[];if(paymentWrites.length)batches.push({storeName:'payments',values:paymentWrites});if(appointmentWrites.size)batches.push({storeName:'appointments',values:[...appointmentWrites.values()]});if(batches.length){await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});await addActivity('Pagamentos alocados por competência/ciclo',{entity:'payments',count:paymentWrites.length,linkedSessions:linked,partial})}return{linked,partial,payments:paymentWrites.length}
}

function scanP0(){
  const problems=[];
  for(const a of arr(data.appointments).filter(appointmentIsPerformed)){
    const records=recordsForAppointment(a),state=paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments});
    if(!records.length)problems.push({severity:'P0',code:'PERFORMED_WITHOUT_RECORD',appointmentId:a.id,patientId:a.patientId,date:a.date});
    if(state.code==='unpaid')problems.push({severity:'P1',code:'PERFORMED_UNPAID',appointmentId:a.id,patientId:a.patientId,date:a.date,value:sessionReferenceValue(a,arr(data.patients).find(p=>p.id===a.patientId))})
  }
  return problems
}

async function runIntegrity({render=true}={}){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;running=true;
  try{
    await ensureCheckpoint();
    const before=scanP0();
    const merged=await mergeSafeDuplicates();
    const quarantined=await quarantineSyntheticPatients();
    const allocations=await allocatePaymentsByCompetence();
    const superseded=await purgeVerifiedSupersededPlaceholders();
    const placeholders=await ensureMissingRecordPlaceholders();
    const after=scanP0();
    const changed=merged+quarantined+allocations.linked+superseded+placeholders;
    globalThis.__rmClinicalDataIntegrityStatus={version:VERSION,before,after,merged,quarantined,paymentLinks:allocations.linked,partialPackages:allocations.partial,superseded,placeholders,at:nowISO()};
    if(changed){document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'clinical-data-integrity-v360',count:changed,at:nowISO()}}));if(render)window.__rmRender?.()}
    return globalThis.__rmClinicalDataIntegrityStatus
  }finally{running=false;if(queued){queued=false;setTimeout(()=>void runIntegrity(),250)}}
}
function schedule(delay=500){if(running){queued=true;return}setTimeout(()=>void runIntegrity().catch(error=>console.warn('Integridade clínica v3.6:',error)),delay)}

document.addEventListener('rm:data-ready',()=>{schedule(900);schedule(2600)});
document.addEventListener('rm:data-patched',()=>schedule(700));
document.addEventListener('rm:calendar-reverse-reconciled',()=>schedule(400));
document.addEventListener('rm:local-data-changed',event=>{const kind=String(event.detail?.kind||'');if(['gemini-materialize-v270','gemini-regenerate-v270','calendar-reconcile','clinical-autofix-form-patients','private-clinical-reconciliation-v360'].includes(kind))schedule(550)});

globalThis.__rmClinicalDataIntegrity={version:VERSION,run:runIntegrity,status:()=>globalThis.__rmClinicalDataIntegrityStatus||null};
