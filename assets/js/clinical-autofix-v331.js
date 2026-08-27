import {data,runtime,preferences,nowISO} from './state.js';
import {bulkPutEncryptedAtomic} from './database.js';
import {encryptJson,decryptJson} from './crypto.js';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {
  FIELD,RESPONSE_SHEET_ID,parseCsv,rowsToObjects,submissionRows,rowFingerprint,normalizeIdentity
} from './clinical-intake-core-v310.mjs';
import {participantLabels,learnAliasesFromDocuments,identifyPatientFromDocument} from './gemini-identity-v270.mjs';
import {reconcileClinicalIntakes} from './clinical-intake-runtime-v310.js';
import {reconcileGemini} from './clinical-reconcile-v270.js';

const VERSION='3.3.1';
const TOKEN_SCOPES=[DRIVE_READONLY_SCOPE];
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const BACKFILL_ISO='2026-05-01T03:00:00Z';
const HUMAN_FLAGS={
  PRIORITY_SAFETY_REVIEW:'Revisar a resposta informada no campo de segurança antes de concluir a avaliação inicial.',
  EXPLORE_PRIOR_THERAPY:'Conversar sobre a experiência anterior com psicoterapia e o que foi útil ou difícil.',
  CONFIRM_MEDICATION_DETAILS:'Confirmar as informações sobre o medicamento informado, incluindo nome e uso atual.'
};
const NON_CLINICAL_PATTERNS=[
  [/trabalho de conclus[aã]o|\btcc\b|cgepp|artigo cient[ií]fico|banca/, 'atividade acadêmica'],
  [/aut[oó]psia psicol[oó]gica|curso de aut[oó]psia|capacita[cç][aã]o|treinamento|aula|palestra/, 'curso ou formação'],
  [/\breuni[aã]o\b|comiss[aã]o|planejamento|projeto|edital|of[ií]cio|miss[aã]o/, 'reunião de trabalho'],
  [/\bcbmmg\b|\bdai\b|\bgto\b|\bcats\b|ito\s*30|sejusp/, 'atividade institucional']
];
const CLINICAL_RX=/\bsess[aã]o\b|\bterapia\b|psicoterapia|paciente|atendimento cl[ií]nico|terap[eê]ut|interven[cç][aã]o cl[ií]nica|plano terap[eê]utico/i;
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const clone=v=>globalThis.structuredClone?structuredClone(v):JSON.parse(JSON.stringify(v));
const pad=n=>String(n).padStart(2,'0');

function emit(status,detail,extra={}){
  const payload={status,detail,version:VERSION,at:nowISO(),...extra};
  globalThis.__rmClinicalAutofixStatus=payload;
  document.dispatchEvent(new CustomEvent('rm:clinical-autofix-status',{detail:payload}));
  return payload;
}
function meetingIso(date,time){return`${date}T${time}:00-03:00`}
function addDays(date,days){const value=new Date(`${date}T12:00:00-03:00`);value.setDate(value.getDate()+days);return`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`}
function meetingInfo(file){const title=String(file?.name||'');let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(!m){m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);if(!m)return null;m=[m[0],m[3],m[2],m[1],m[4],m[5]]}let date=`${m[1]}-${m[2]}-${m[3]}`,h=Number(m[4]),min=Number(m[5]);if(min>=30){h++;if(h>=24){h=0;date=addDays(date,1)}}return{date,time:`${pad(h)}:00`,rawTime:`${m[4]}:${m[5]}`}}
function patientById(id){return arr(data.patients).find(p=>p?.id===id)||null}
function candidatePatients(){return arr(data.patients).filter(p=>normalizeIdentity(p?.name)!==normalizeIdentity(preferences.professionalName))}
function exactPatients(name){const key=normalizeIdentity(name);return candidatePatients().filter(p=>normalizeIdentity(p?.name)===key)}

async function googleText(auth,url,accept='text/plain'){
  const response=await fetch(url,{headers:{Authorization:`Bearer ${auth.token}`,Accept:accept},cache:'no-store',referrerPolicy:'no-referrer'});
  if(response.status===401||response.status===403)throw new Error('A autorização do Google Workspace precisa ser renovada.');
  if(!response.ok)throw new Error(`Google respondeu ${response.status}.`);
  return response.text();
}
async function formRows(auth){const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(RESPONSE_SHEET_ID)}/export?mimeType=${encodeURIComponent('text/csv')}`;return submissionRows(rowsToObjects(parseCsv(await googleText(auth,url,'text/csv'))))}
async function ensureFormPatients(auth){
  const rows=await formRows(auth),writes=new Map(),created=[];
  for(const row of rows){
    const matches=exactPatients(row?.[FIELD.name]);
    if(matches.length>1)continue;
    let p=matches[0]||null;
    if(!p){const fp=await rowFingerprint(row);p={id:`pt_form_${fp.slice(0,24)}`,name:String(row?.[FIELD.name]||'').trim(),preferredName:String(row?.[FIELD.preferred]||'').trim(),status:'Aguardando retorno',modality:'On-line',occupation:String(row?.[FIELD.occupation]||'').trim(),createdAt:nowISO(),updatedAt:nowISO(),source:{type:'google-form-intake',rowFingerprint:fp}};data.patients.push(p);writes.set(p.id,p);created.push(p.id);continue}
    const next={...p};let changed=false;
    if(!next.preferredName&&row?.[FIELD.preferred]){next.preferredName=String(row[FIELD.preferred]).trim();changed=true}
    if(!next.occupation&&row?.[FIELD.occupation]){next.occupation=String(row[FIELD.occupation]).trim();changed=true}
    if(['Encerrado','Arquivado'].includes(next.status||'')){next.status='Aguardando retorno';next.reopenedAt=nowISO();next.reopenedReason='Nova anamnese recebida pelo formulário clínico.';changed=true}
    if(changed){next.updatedAt=nowISO();Object.assign(p,next);writes.set(next.id,next)}
  }
  if(writes.size){await bulkPutEncryptedAtomic([{storeName:'patients',values:[...writes.values()]}],runtime.key,{verify:true});document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'patients',kind:'clinical-autofix-form-patients',count:writes.size,at:nowISO(),verified:true}}))}
  return{rows:rows.length,writes:writes.size,created:created.length}
}

async function loadCatalog(){let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}if(!raw)return{version:7,identityRuleVersion:'3.0',lastScanAt:'',lastError:'',filesSeen:0,aliases:{},manualLinks:{},items:[]};try{const v=await decryptJson(runtime.key,raw,CATALOG_AAD);return{version:7,identityRuleVersion:v?.identityRuleVersion||'3.0',lastScanAt:v?.lastScanAt||'',lastError:v?.lastError||'',filesSeen:Number(v?.filesSeen||0),aliases:v?.aliases||{},manualLinks:v?.manualLinks||{},items:arr(v?.items)}}catch{return{version:7,identityRuleVersion:'3.0',lastScanAt:'',lastError:'',filesSeen:0,aliases:{},manualLinks:{},items:[]}}}
async function saveCatalog(catalog){const encrypted=await encryptJson(runtime.key,{...catalog,version:7,items:arr(catalog.items).slice(-700)},CATALOG_AAD);localStorage.setItem(CATALOG_STORAGE,JSON.stringify(encrypted))}
function upsertCatalog(catalog,item){const i=arr(catalog.items).findIndex(x=>x?.fileId===item.fileId);if(i>=0)catalog.items[i]={...catalog.items[i],...item};else catalog.items.push(item)}
async function listGeminiDocs(auth){let token='',out=[];do{const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);url.searchParams.set('pageSize','1000');url.searchParams.set('orderBy','createdTime asc');url.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink)');if(token)url.searchParams.set('pageToken',token);const body=JSON.parse(await googleText(auth,url.toString(),'application/json'));out.push(...arr(body.files));token=String(body.nextPageToken||'')}while(token);return out.filter(f=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(f?.name||''))}
async function readGemini(auth,id){return googleText(auth,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('text/plain')}`)}
function appointmentMatch(meeting){if(!meeting)return null;const target=new Date(meetingIso(meeting.date,meeting.time)).getTime();const matches=arr(data.appointments).filter(a=>a?.patientId&&a?.date===meeting.date&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou').map(a=>({a,d:Math.abs(new Date(meetingIso(a.date,a.time||'00:00')).getTime()-target)})).filter(x=>x.d<=20*60000).sort((a,b)=>a.d-b.d);if(!matches.length)return null;if(matches.length>1&&matches[0].d===matches[1].d)return null;return patientById(matches[0].a.patientId)}
function strongIdentity(raw,patients,aliases){const match=identifyPatientFromDocument({raw,patients,professionalName:preferences.professionalName,learnedAliases:aliases});if(!match?.patient)return null;if(Number(match.score||0)>=195)return match.patient;const professional=normalizeIdentity(preferences.professionalName),labels=participantLabels(raw).filter(x=>x&&x!==professional);if(labels.length!==1)return null;const p=match.patient,full=normalizeIdentity(p.name),preferred=normalizeIdentity(p.preferredName),first=normalizeIdentity(String(p.preferredName||p.name||'').split(/\s+/)[0]);return labels[0]===full||labels[0]===preferred||labels[0]===first?match.patient:null}
function nonClinicalReason(raw){const text=normalizeIdentity(String(raw||'').slice(0,16000));let hits=[];for(const[rx,label]of NON_CLINICAL_PATTERNS)if(rx.test(text))hits.push(label);const clinical=CLINICAL_RX.test(text);if(hits.length>=2&&!clinical)return[...new Set(hits)].join(' + ');if(hits.includes('atividade acadêmica')&&hits.length>=1&&!/sessao|terapia|psicoterapia|paciente/.test(text))return'atividade acadêmica';if(hits.includes('curso ou formação')&&hits.length>=1&&!/sessao|terapia|psicoterapia|paciente/.test(text))return'curso ou formação';return''}
async function triageGemini(auth){
  const catalog=await loadCatalog(),files=await listGeminiDocs(auth),index=new Map(arr(catalog.items).map(x=>[x.fileId,x]));
  const candidates=files.filter(f=>{const item=index.get(f.id);return !item||item.status==='review'||item.status==='ready'||item.status==='write_failed'});
  const fetched=[];for(const file of candidates){try{fetched.push({file,raw:await readGemini(auth,file.id)})}catch{}}
  const patients=candidatePatients();catalog.aliases=learnAliasesFromDocuments({raws:fetched.map(x=>x.raw),patients,professionalName:preferences.professionalName,existingAliases:catalog.aliases||{}});
  const patientWrites=new Map();let linked=0,ignored=0,review=0;
  for(const item of fetched){
    const meeting=meetingInfo(item.file),scheduled=appointmentMatch(meeting),identified=scheduled||strongIdentity(item.raw,patients,catalog.aliases||{});
    if(identified){catalog.manualLinks={...(catalog.manualLinks||{}),[item.file.id]:identified.id};const professional=normalizeIdentity(preferences.professionalName),labels=participantLabels(item.raw).filter(x=>x&&x!==professional);if(labels.length===1)catalog.aliases={...(catalog.aliases||{}),[labels[0]]:identified.id};if(['Encerrado','Arquivado'].includes(identified.status||'')){const next={...identified,status:'Ativo',reactivatedAt:nowISO(),reactivatedReason:'Novo atendimento identificado nas anotações do Google Meet/Gemini.',updatedAt:nowISO()};Object.assign(identified,next);patientWrites.set(next.id,next)}upsertCatalog(catalog,{fileId:item.file.id,name:item.file.name,url:item.file.webViewLink||'',modifiedTime:item.file.modifiedTime||'',meetingDate:meeting?.date||'',meetingTime:meeting?.time||'',rawTime:meeting?.rawTime||'',status:'review',reason:'Atendimento clínico identificado automaticamente; associação preparada.',version:'2.7.0'});linked++;continue}
    const reason=nonClinicalReason(item.raw);if(reason){delete catalog.manualLinks?.[item.file.id];upsertCatalog(catalog,{fileId:item.file.id,name:item.file.name,url:item.file.webViewLink||'',modifiedTime:item.file.modifiedTime||'',meetingDate:meeting?.date||'',meetingTime:meeting?.time||'',rawTime:meeting?.rawTime||'',status:'ignored',reason:`Ignorado automaticamente: ${reason}; não é atendimento clínico.`,version:'2.7.0'});ignored++;continue}
    upsertCatalog(catalog,{fileId:item.file.id,name:item.file.name,url:item.file.webViewLink||'',modifiedTime:item.file.modifiedTime||'',meetingDate:meeting?.date||'',meetingTime:meeting?.time||'',rawTime:meeting?.rawTime||'',status:'review',reason:'Não foi possível confirmar automaticamente se este arquivo é atendimento clínico. Revise apenas se reconhecer a sessão.',version:'2.7.0'});review++
  }
  if(patientWrites.size)await bulkPutEncryptedAtomic([{storeName:'patients',values:[...patientWrites.values()]}],runtime.key,{verify:true});
  catalog.filesSeen=files.length;catalog.lastScanAt=nowISO();catalog.lastError='';await saveCatalog(catalog);
  if(patientWrites.size)document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'patients',kind:'clinical-autofix-reactivation',count:patientWrites.size,at:nowISO(),verified:true}}));
  return{files:files.length,linked,ignored,review,reactivated:patientWrites.size}
}
async function humanizeIntakes(){const writes=[];for(const note of arr(data.notes)){if(note?.kind!=='clinicalIntake'||!note.text)continue;let text=String(note.text),changed=false;for(const[code,label]of Object.entries(HUMAN_FLAGS)){if(text.includes(code)){text=text.replaceAll(code,label);changed=true}}if(changed){const next={...note,text,updatedAt:nowISO()};Object.assign(note,next);writes.push(next)}}if(writes.length){await bulkPutEncryptedAtomic([{storeName:'notes',values:writes}],runtime.key,{verify:true});document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'notes',kind:'clinical-autofix-human-labels',count:writes.length,at:nowISO(),verified:true}}))}return writes.length}

async function run({auth=null}={}){
  if(runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return{ok:false,reason:'indisponível'};
  emit('syncing','Organizando pacientes, anamneses e sessões automaticamente.');
  try{
    const authorization=auth?.ok?auth:await loadWorkspaceAuthorization(TOKEN_SCOPES);if(!authorization.ok)return{ok:false,reason:'Google Workspace precisa ser renovado.'};
    const forms=await ensureFormPatients(authorization);
    const gemini=await triageGemini(authorization);
    const intake=await reconcileClinicalIntakes({reason:'autofix',force:true});
    const humanized=await humanizeIntakes();
    const reconciled=await reconcileGemini({quiet:true,force:false,reason:'autofix-triage'});
    window.__rmRender?.();
    emit('ready',`Triagem automática concluída: ${gemini.ignored} reunião(ões) não clínica(s) ignorada(s), ${gemini.linked} atendimento(s) associado(s).`,{forms,gemini,humanized});
    return{ok:Boolean(intake?.ok)&&reconciled!==false,forms,gemini,humanized};
  }catch(error){emit('error',error?.message||'Falha na triagem automática.');return{ok:false,reason:error?.message||'Falha na triagem automática.'}}
}

globalThis.__rmClinicalAutofix={version:VERSION,run,status:()=>clone(globalThis.__rmClinicalAutofixStatus||{})};
