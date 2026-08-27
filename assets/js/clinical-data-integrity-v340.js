import {data,runtime,nowISO} from './state.js';
import {bulkPutEncryptedAtomic,deleteRecord} from './database.js';
import {normalizeIdentity} from './clinical-intake-core-v310.mjs';

const VERSION='3.4.2';
const LINK_STORES=['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
const CLINICAL_STORES=['appointments','records','notes','formulations','goals','tasks'];
const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
let running=false;
let queued=false;

function dateMs(value=''){const d=new Date(`${String(value||'').slice(0,10)}T12:00:00-03:00`);return Number.isNaN(d.getTime())?0:d.getTime()}
function linkedCount(patientId){return LINK_STORES.reduce((sum,store)=>sum+arr(data[store]).filter(row=>row?.patientId===patientId).length,0)}
function clinicalCount(patientId){return CLINICAL_STORES.reduce((sum,store)=>sum+arr(data[store]).filter(row=>row?.patientId===patientId).length,0)}
function digits(value=''){return String(value||'').replace(/\D/g,'')}
function lower(value=''){return String(value||'').trim().toLowerCase()}
function identitySnapshot(patient){return{cpf:digits(patient?.cpf),email:lower(patient?.email),phone:digits(patient?.phone)}}
function strongIdentityMatch(a,b){const x=identitySnapshot(a),y=identitySnapshot(b);return Boolean((x.cpf&&y.cpf&&x.cpf===y.cpf)||(x.email&&y.email&&x.email===y.email)||(x.phone.length>=10&&y.phone.length>=10&&x.phone===y.phone))}
function conflictingIdentity(a,b){const x=identitySnapshot(a),y=identitySnapshot(b);return Boolean((x.cpf&&y.cpf&&x.cpf!==y.cpf)||(x.email&&y.email&&x.email!==y.email)||(x.phone.length>=10&&y.phone.length>=10&&x.phone!==y.phone))}
function completeness(patient){return['code','cpf','email','phone','preferredName','occupation','summary'].reduce((n,key)=>n+(String(patient?.[key]||'').trim()?1:0),0)+clinicalCount(patient?.id)*4+linkedCount(patient?.id)}
function mergeFields(primary,secondary){const next={...primary};for(const [key,value] of Object.entries(secondary||{})){if(['id','createdAt','updatedAt'].includes(key))continue;if((next[key]===undefined||next[key]===null||next[key]===''||(Array.isArray(next[key])&&!next[key].length))&&value!==undefined&&value!==null&&value!=='')next[key]=value}next.updatedAt=nowISO();next.mergedDuplicateAt=nowISO();return next}

function duplicatePairs(){
  const patients=arr(data.patients).filter(p=>p?.id&&p.status!=='Profissional');
  const pairs=[];
  for(let i=0;i<patients.length;i++)for(let j=i+1;j<patients.length;j++){
    const a=patients[i],b=patients[j],aName=normalizeIdentity(a.name||a.preferredName||''),bName=normalizeIdentity(b.name||b.preferredName||''),sameName=aName&&aName===bName;
    if(conflictingIdentity(a,b))continue;
    const strong=strongIdentityMatch(a,b),aLinks=linkedCount(a.id),bLinks=linkedCount(b.id),emptyShell=(aLinks===0||bLinks===0);
    if(strong||(sameName&&emptyShell))pairs.push([a,b]);
  }
  return pairs;
}

async function mergeDuplicatePatients(){
  let merged=0;
  for(const [left,right] of duplicatePairs()){
    if(!arr(data.patients).some(p=>p?.id===left.id)||!arr(data.patients).some(p=>p?.id===right.id))continue;
    const primary=completeness(left)>=completeness(right)?left:right,secondary=primary.id===left.id?right:left;
    const writes=[];
    for(const store of LINK_STORES){
      const changed=[];
      for(const row of arr(data[store]))if(row?.patientId===secondary.id){row.patientId=primary.id;row.updatedAt=nowISO();changed.push({...row})}
      if(changed.length)writes.push({storeName:store,values:changed});
    }
    const mergedPatient=mergeFields(primary,secondary);Object.assign(primary,mergedPatient);writes.push({storeName:'patients',values:[mergedPatient]});
    if(writes.length)await bulkPutEncryptedAtomic(writes,runtime.key,{verify:true});
    await deleteRecord('patients',secondary.id);data.patients=arr(data.patients).filter(p=>p?.id!==secondary.id);
    if(runtime.selectedPatientId===secondary.id)runtime.selectedPatientId=primary.id;
    merged++;
  }
  return merged;
}

function looksSyntheticName(value=''){
  const raw=String(value||'').trim();if(!raw||/\s/.test(raw)||raw.length<5||raw.length>28)return false;
  if(raw!==raw.toLowerCase())return false;
  const token=normalizeIdentity(raw).replace(/\s/g,'');if(!token)return false;
  const unique=new Set(token).size,ratio=unique/token.length;
  const repeatedPair=/(..).*\1/.test(token),triple=/(.)\1{2,}/.test(token);
  return ratio<=0.48||repeatedPair||triple;
}
function isOrphanPlaceholder(patient){
  if(!patient?.id||patient.status==='Profissional')return false;
  if(String(patient.code||'').trim()||digits(patient.cpf)||String(patient.email||'').trim()||digits(patient.phone))return false;
  if(linkedCount(patient.id)>0)return false;
  if(!['Aguardando retorno',''].includes(String(patient.status||'')))return false;
  return looksSyntheticName(patient.name||patient.preferredName||'');
}
async function removeOrphanPlaceholders(){
  const bad=arr(data.patients).filter(isOrphanPlaceholder);if(!bad.length)return 0;
  for(const patient of bad)await deleteRecord('patients',patient.id);
  const ids=new Set(bad.map(p=>p.id));data.patients=arr(data.patients).filter(p=>!ids.has(p.id));
  if(ids.has(runtime.selectedPatientId))runtime.selectedPatientId='';
  return bad.length;
}

function appointmentPerformed(a){return Boolean(a&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou'&&(a.status==='Realizada'||['Presente','Compareceu'].includes(a.attendanceStatus)))}
function isPlaceholderRecord(record){return record?.source?.type==='missing-record-placeholder'||String(record?.id||'').startsWith('missing_record_')}
function recordForAppointment(a){return arr(data.records).find(r=>!isPlaceholderRecord(r)&&(r?.appointmentId===a.id||(a.clinicalSessionId&&r?.clinicalSessionId===a.clinicalSessionId)||(r?.patientId===a.patientId&&r?.date===a.date&&(!r?.time||!a?.time||r.time===a.time))))||arr(data.records).find(r=>isPlaceholderRecord(r)&&r?.appointmentId===a.id)||null}
async function purgeSupersededPlaceholders(){
  const obsolete=arr(data.records).filter(isPlaceholderRecord).filter(placeholder=>arr(data.records).some(record=>record?.id!==placeholder.id&&!isPlaceholderRecord(record)&&(record?.appointmentId===placeholder.appointmentId||(record?.patientId===placeholder.patientId&&record?.date===placeholder.date&&(!record?.time||!placeholder?.time||record.time===placeholder.time)))));
  if(!obsolete.length)return 0;
  for(const row of obsolete)await deleteRecord('records',row.id);
  const ids=new Set(obsolete.map(r=>r.id));data.records=arr(data.records).filter(r=>!ids.has(r.id));return obsolete.length;
}
async function ensureMissingRecordPlaceholders(){
  const rows=[];
  for(const a of arr(data.appointments).filter(appointmentPerformed)){
    if(recordForAppointment(a))continue;
    rows.push({id:`missing_record_${a.id}`,patientId:a.patientId,appointmentId:a.id,clinicalSessionId:a.clinicalSessionId||a.id,title:'Evolução de sessão — pendente',date:a.date,time:a.time||'',status:'Rascunho',text:'Não há prontuário.',followup:'',requiresReview:true,editable:true,source:{type:'missing-record-placeholder',fileId:`missing:${a.id}`,appointmentId:a.id},createdAt:nowISO(),updatedAt:nowISO()});
  }
  if(!rows.length)return 0;
  await bulkPutEncryptedAtomic([{storeName:'records',values:rows}],runtime.key,{verify:true});
  for(const row of rows){const i=arr(data.records).findIndex(r=>r?.id===row.id);if(i>=0)data.records[i]=row;else data.records.push(row)}
  return rows.length;
}

function explicitAppointmentIds(payment){return[...new Set([payment?.appointmentId,...arr(payment?.appointmentIds),payment?.clinicalSessionId].filter(Boolean))]}
function paymentUnits(payment,patient){
  const note=String(payment?.note||'');const explicit=note.match(/(?:cobre|referente|pacote|mensal(?:idade)?)\D{0,12}(\d{1,2})\s*sess/i)||note.match(/(\d{1,2})\s*sess/i);if(explicit)return Math.max(1,Math.min(12,Number(explicit[1])||1));
  if(/mensal/i.test(note))return 4;
  const value=Number(payment?.value||0),reference=Number(patient?.value||0);if(!(value>0&&reference>0))return 1;
  const ratio=value/reference;if(ratio>=3.2&&ratio<=4.8)return 4;
  const rounded=Math.round(ratio);if(rounded>=2&&rounded<=8&&Math.abs(ratio-rounded)<=0.30)return rounded;
  return 1;
}
function eligibleSessions(patientId){return arr(data.appointments).filter(a=>a?.patientId===patientId&&appointmentPerformed(a)).sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`))}
function nearestCandidates(sessions,paymentDate,count,claimed){
  const base=dateMs(paymentDate);const free=sessions.filter(a=>!claimed.has(a.id));
  return free.map(a=>{const delta=base?Math.round((dateMs(a.date)-base)/86400000):0;const abs=Math.abs(delta);const windowPenalty=abs<=45?0:abs<=75?40:180;const beforePenalty=delta<0?2:0;return{a,score:abs+windowPenalty+beforePenalty}}).sort((x,y)=>x.score-y.score||String(x.a.date).localeCompare(String(y.a.date))).slice(0,count).map(x=>x.a).sort((a,b)=>`${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`));
}
async function allocatePackagePayments(){
  const writes=[];let linked=0;
  for(const patient of arr(data.patients).filter(p=>p?.id&&p.status!=='Profissional')){
    const sessions=eligibleSessions(patient.id),payments=arr(data.payments).filter(p=>p?.patientId===patient.id&&p?.status==='Pago').sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))),claimed=new Set();
    for(const payment of payments)for(const id of explicitAppointmentIds(payment))if(sessions.some(a=>a.id===id))claimed.add(id);
    for(const payment of payments){
      if(payment?.appointmentId||arr(payment?.appointmentIds).length||payment?.clinicalSessionId)continue;
      const units=paymentUnits(payment,patient);let selected=[];
      if(units===1){selected=nearestCandidates(sessions,payment.date,1,claimed);if(selected[0]&&Math.abs((dateMs(selected[0].date)-dateMs(payment.date))/86400000)>12)selected=[]}
      else selected=nearestCandidates(sessions,payment.date,units,claimed);
      if(!selected.length)continue;
      payment.appointmentIds=selected.map(a=>a.id);if(selected.length===1)payment.appointmentId=selected[0].id;
      payment.allocationSource=units>1?'package-auto-v340':'nearest-session-auto-v340';payment.sessionUnits=selected.length;payment.updatedAt=nowISO();
      selected.forEach(a=>claimed.add(a.id));writes.push({...payment});linked+=selected.length;
    }
  }
  if(writes.length)await bulkPutEncryptedAtomic([{storeName:'payments',values:writes}],runtime.key,{verify:true});
  return linked;
}

async function runIntegrity({render=true}={}){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;running=true;
  try{
    const merged=await mergeDuplicatePatients();
    const removed=await removeOrphanPlaceholders();
    const paymentLinks=await allocatePackagePayments();
    const superseded=await purgeSupersededPlaceholders();
    const placeholders=await ensureMissingRecordPlaceholders();
    const changed=merged+removed+paymentLinks+superseded+placeholders;
    globalThis.__rmClinicalDataIntegrityStatus={version:VERSION,merged,removed,paymentLinks,superseded,placeholders,at:nowISO()};
    if(changed){document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'clinical-data-integrity-v340',count:changed,at:nowISO()}}));if(render)window.__rmRender?.()}
    return globalThis.__rmClinicalDataIntegrityStatus;
  }finally{running=false;if(queued){queued=false;setTimeout(()=>void runIntegrity(),250)}}
}
function schedule(delay=500){if(running){queued=true;return}setTimeout(()=>void runIntegrity().catch(error=>console.warn('Integridade clínica v3.4:',error)),delay)}

document.addEventListener('rm:data-ready',()=>{schedule(900);schedule(2400)});
document.addEventListener('rm:data-patched',()=>schedule(700));
document.addEventListener('rm:calendar-reverse-reconciled',()=>schedule(400));
document.addEventListener('rm:local-data-changed',event=>{const kind=String(event.detail?.kind||'');if(['gemini-materialize-v270','gemini-regenerate-v270','calendar-reconcile','clinical-autofix-form-patients'].includes(kind))schedule(550)});

globalThis.__rmClinicalDataIntegrity={version:VERSION,run:runIntegrity,status:()=>globalThis.__rmClinicalDataIntegrityStatus||null};
