import {data,runtime,nowISO} from './state.js';
import {bulkPutEncryptedAtomic,deleteRecord} from './database.js';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {normalizeIdentity,parseCsv} from './clinical-intake-core-v310.mjs';

const VERSION='1.0.0';
const MANIFEST_NAME='RM_PATIENT_DATA_REPAIR_V2';
const APPLIED_KEY='rm.patient.data.repair.v2.applied';
const LINK_STORES=['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications'];
const FIELD_DENY=new Set(['id','createdAt','updatedAt','status']);
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false,timer=null;

function norm(v=''){return normalizeIdentity(String(v||''))}
function digits(v=''){return String(v||'').replace(/\D/g,'')}
function linkedCount(patientId){return LINK_STORES.reduce((sum,store)=>sum+arr(data[store]).filter(row=>row?.patientId===patientId).length,0)}
function upsertLocal(store,row){const list=data[store]||(data[store]=[]),i=list.findIndex(x=>x?.id===row.id);if(i>=0)list[i]=row;else list.push(row)}

function patientCandidates(spec){
  const patients=arr(data.patients).filter(p=>p?.id&&p.status!=='Profissional'),type=String(spec?.type||''),value=String(spec?.value||'').trim();
  if(!value)return[];
  if(type==='id')return patients.filter(p=>p.id===value);
  if(type==='code')return patients.filter(p=>String(p.code||'').trim()===value);
  if(type==='exactName'){const wanted=norm(value);return patients.filter(p=>norm(p.name)===wanted||norm(p.preferredName)===wanted)}
  if(type==='uniqueFirstName'){const wanted=norm(value).split(' ')[0];return patients.filter(p=>norm(p.name||p.preferredName).split(' ')[0]===wanted)}
  return[];
}
function resolvePatient(spec){const matches=patientCandidates(spec);return matches.length===1?matches[0]:null}

async function mergePatients(op){
  const primary=resolvePatient(op?.primaryMatch),secondary=resolvePatient(op?.secondaryMatch);
  if(!primary||!secondary||primary.id===secondary.id)return 0;
  const batches=[];
  for(const store of LINK_STORES){
    const changed=arr(data[store]).filter(row=>row?.patientId===secondary.id).map(row=>({...row,patientId:primary.id,updatedAt:nowISO()}));
    if(changed.length)batches.push({storeName:store,values:changed});
  }
  const merged={...primary};
  for(const[key,value]of Object.entries(secondary||{})){
    if(['id','createdAt','updatedAt','status'].includes(key))continue;
    const empty=merged[key]===undefined||merged[key]===null||merged[key]===''||(Array.isArray(merged[key])&&!merged[key].length);
    if(empty&&value!==undefined&&value!==null&&value!=='')merged[key]=value;
  }
  merged.updatedAt=nowISO();merged.mergedDuplicateAt=nowISO();
  batches.push({storeName:'patients',values:[merged]});
  await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true});
  for(const batch of batches)for(const row of batch.values)upsertLocal(batch.storeName,row);
  await deleteRecord('patients',secondary.id);
  data.patients=arr(data.patients).filter(p=>p?.id!==secondary.id);
  if(runtime.selectedPatientId===secondary.id)runtime.selectedPatientId=primary.id;
  return 1;
}

async function updatePatientFields(op){
  const patient=resolvePatient(op?.patientMatch);if(!patient||!op?.fields||typeof op.fields!=='object')return 0;
  const next={...patient};let changed=false;
  for(const[key,value]of Object.entries(op.fields)){
    if(FIELD_DENY.has(key))continue;
    if(JSON.stringify(next[key])!==JSON.stringify(value)){next[key]=value;changed=true}
  }
  if(!changed)return 0;
  next.updatedAt=nowISO();
  await bulkPutEncryptedAtomic([{storeName:'patients',values:[next]}],runtime.key,{verify:true});Object.assign(patient,next);return 1;
}

async function setPatientStatus(op){
  const patient=resolvePatient(op?.patientMatch),status=String(op?.status||'').trim();if(!patient||!status)return 0;
  const next={...patient};let changed=next.status!==status;
  next.status=status;
  if(['Inativo','Encerrado','Arquivado'].includes(status)){
    const date=String(op?.effectiveDate||next.inactiveAt||next.careEndedAt||nowISO().slice(0,10)).slice(0,10);
    if(next.inactiveAt!==date){next.inactiveAt=date;changed=true}
    if(next.careEndedAt!==date){next.careEndedAt=date;changed=true}
  }
  if(!changed)return 0;
  next.updatedAt=nowISO();
  await bulkPutEncryptedAtomic([{storeName:'patients',values:[next]}],runtime.key,{verify:true});Object.assign(patient,next);return 1;
}

function looksSyntheticName(value=''){
  const raw=String(value||'').trim();if(!raw||/\s/.test(raw)||raw.length<5||raw.length>28||raw!==raw.toLowerCase())return false;
  const token=norm(raw).replace(/\s/g,'');if(!token)return false;
  const ratio=new Set(token).size/token.length;
  return ratio<=0.50||/(..).*\1/.test(token)||/(.)\1{2,}/.test(token);
}
function syntheticCandidate(patient){
  if(!patient?.id||patient.status==='Profissional')return false;
  if(String(patient.code||'').trim()||digits(patient.cpf)||String(patient.email||'').trim()||digits(patient.phone))return false;
  if(linkedCount(patient.id)>0)return false;
  return looksSyntheticName(patient.name||patient.preferredName||'');
}
async function purgeSyntheticCandidates(){
  const rows=arr(data.patients).filter(syntheticCandidate);if(!rows.length)return 0;
  for(const patient of rows)await deleteRecord('patients',patient.id);
  const ids=new Set(rows.map(p=>p.id));data.patients=arr(data.patients).filter(p=>!ids.has(p.id));
  if(ids.has(runtime.selectedPatientId))runtime.selectedPatientId=null;
  return rows.length;
}

async function googleText(auth,url,accept='text/plain'){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${auth.token}`,Accept:accept},cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error(`Google respondeu ${response.status}.`);
  return response.text();
}
async function loadManifest(auth){
  const url=new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q',`name='${MANIFEST_NAME}' and mimeType='application/vnd.google-apps.document' and trashed=false`);
  url.searchParams.set('pageSize','5');url.searchParams.set('orderBy','modifiedTime desc');url.searchParams.set('fields','files(id,name,modifiedTime)');
  const files=JSON.parse(await googleText(auth,url.toString(),'application/json'))?.files||[];const file=files[0];if(!file)return null;
  const raw=await googleText(auth,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`);
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start<0||end<=start)throw new Error('Manifesto privado inválido.');
  return{file,manifest:JSON.parse(raw.slice(start,end+1))};
}
function legacyIso(value=''){
  const raw=String(value||'').trim();
  let m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${String(m[4]||'0').padStart(2,'0')}:${String(m[5]||'0').padStart(2,'0')}:${String(m[6]||'0').padStart(2,'0')}-03:00`;
  return raw;
}
async function importLegacyIntake(op,auth){
  const patient=resolvePatient(op?.patientMatch),spreadsheetId=String(op?.spreadsheetId||''),rowNumber=Number(op?.rowNumber||0);if(!patient||!spreadsheetId||rowNumber<2)return 0;
  const csv=await googleText(auth,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/export?mimeType=${encodeURIComponent('text/csv')}`,'text/csv');
  const rows=parseCsv(csv);if(rows.length<rowNumber)return 0;const headers=rows[0].map(x=>String(x||'').trim()),values=rows[rowNumber-1]||[];
  if(op?.matchColumn&&op?.matchValue){const i=headers.indexOf(String(op.matchColumn));if(i<0||norm(values[i])!==norm(op.matchValue))return 0}
  const items=headers.map((field,i)=>({field,patientReportedFact:String(values[i]??'').trim()})).filter(x=>x.field&&x.patientReportedFact);
  if(!items.length)return 0;
  const submittedIndex=headers.indexOf(String(op?.submittedAtColumn||headers[0]||'')),rawSubmitted=submittedIndex>=0?String(values[submittedIndex]||'').trim():'',submittedAt=legacyIso(rawSubmitted)||nowISO();
  const id=`legacy_intake_${spreadsheetId.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,28)}_${rowNumber}`;
  const existing=arr(data.notes).find(n=>n?.id===id);if(existing&&existing.patientId===patient.id)return 0;
  const text=['ANAMNESE CLÍNICA — REGISTRO LEGADO',op?.sourceLabel?`Origem: ${String(op.sourceLabel)}`:'','',...items.flatMap(item=>[item.field,item.patientReportedFact,''])].filter((v,i,a)=>v!==''||a[i-1]!=='').join('\n').trim();
  const note={id,patientId:patient.id,kind:'clinicalIntake',title:String(op?.title||'Anamnese — legado'),text,status:'REVIEWED',reviewRequired:false,autonomousDiagnosis:false,originalPreserved:true,source:{type:'google-form-response-legacy',spreadsheetId,rowNumber,submittedAt,sourceSubmittedAt:rawSubmitted},intake:{generatedBy:'legacy-form-backfill-v1',autonomousDiagnosis:false,inferenceGenerated:false,factProvenance:'PATIENT_REPORTED',reviewRequired:false,priorityHumanReview:false,flags:[],sections:[{title:'Anamnese legada',items}]},createdAt:submittedAt,updatedAt:nowISO()};
  await bulkPutEncryptedAtomic([{storeName:'notes',values:[note]}],runtime.key,{verify:true});upsertLocal('notes',note);return 1;
}

async function applyManifest(manifest,auth){
  let changed=0;
  for(const op of arr(manifest?.operations)){
    if(op?.type==='mergePatients')changed+=await mergePatients(op);
    else if(op?.type==='updatePatientFields')changed+=await updatePatientFields(op);
    else if(op?.type==='setStatus')changed+=await setPatientStatus(op);
    else if(op?.type==='purgeSyntheticCandidates')changed+=await purgeSyntheticCandidates();
    else if(op?.type==='importLegacyIntake')changed+=await importLegacyIntake(op,auth);
  }
  return changed;
}

async function forceCurrentIntake(){try{const mod=await import('./clinical-intake-runtime-v310.js');await mod.reconcileClinicalIntakes?.({reason:'patient-hygiene-v100',force:true})}catch(error){console.warn('Reconciliação de anamnese após higiene:',error?.message||error)}}
async function run(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;running=true;
  try{
    let changed=await purgeSyntheticCandidates(),manifestApplied=false,manifestId='';
    const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);
    if(auth.ok){
      const loaded=await loadManifest(auth);if(loaded){manifestId=loaded.file.id;const marker=`${loaded.file.id}:${loaded.file.modifiedTime||''}`;
        if(localStorage.getItem(APPLIED_KEY)!==marker){changed+=await applyManifest(loaded.manifest,auth);localStorage.setItem(APPLIED_KEY,marker);manifestApplied=true}
      }
    }
    if(changed){document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'patient-hygiene-v100',count:changed,at:nowISO()}}));window.__rmRender?.();setTimeout(()=>void forceCurrentIntake(),100)}
    globalThis.__rmPatientHygieneStatus={version:VERSION,changed,manifestApplied,manifestId,at:nowISO()};return globalThis.__rmPatientHygieneStatus;
  }catch(error){console.warn('Higiene privada de pacientes:',error?.message||error);globalThis.__rmPatientHygieneStatus={version:VERSION,error:String(error?.message||error),at:nowISO()};return null}
  finally{running=false}
}
function schedule(delay=250){clearTimeout(timer);timer=setTimeout(()=>void run(),delay)}
document.addEventListener('rm:data-ready',()=>schedule(250));
document.addEventListener('rm:google-workspace-authorized',()=>schedule(150));
globalThis.__rmPatientHygiene={version:VERSION,run,status:()=>globalThis.__rmPatientHygieneStatus||null};
