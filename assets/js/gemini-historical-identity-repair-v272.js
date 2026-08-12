import {data,runtime,preferences,nowISO} from './state.js';
import {decryptJson,encryptJson} from './crypto.js';
import {normalizeIdentity,participantLabels,learnAliasesFromDocuments,identifyPatientFromDocument} from './gemini-identity-v270.mjs';
import {reconcileGemini} from './clinical-reconcile-v270.js';

const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const SESSION_KEY='rm.google.clinical.identity-repair.v272.last';
const MIN_INTERVAL_MS=5*60*1000;
let running=false,timer=null;

const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const patientsForIdentity=()=>arr(data.patients).filter(patient=>normalizeIdentity(patient?.name)!==normalizeIdentity(preferences.professionalName));
const validPatientIds=()=>new Set(patientsForIdentity().map(patient=>patient?.id).filter(Boolean));
const firstName=patient=>normalizeIdentity(String(patient?.preferredName||patient?.name||'').trim().split(/\s+/)[0]);

async function loadToken(){
  if(!runtime.key)return null;
  let encrypted=null;try{encrypted=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!encrypted)return null;
  try{
    const value=await decryptJson(runtime.key,encrypted,'google-calendar-token');
    const scopes=String(value?.scope||'').split(/\s+/);
    if(value?.token&&Number(value.expiresAt)>Date.now()+60000&&scopes.includes(DRIVE_SCOPE))return value.token;
  }catch{}
  return null;
}

async function loadCatalog(){
  let encrypted=null;try{encrypted=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}
  if(!encrypted)return{version:7,aliases:{},manualLinks:{},items:[]};
  try{
    const value=await decryptJson(runtime.key,encrypted,CATALOG_AAD);
    return value&&Array.isArray(value.items)?{...value,aliases:value.aliases||{},manualLinks:value.manualLinks||{},items:value.items}:{version:7,aliases:{},manualLinks:{},items:[]};
  }catch{return{version:7,aliases:{},manualLinks:{},items:[]}}
}

async function saveCatalog(catalog){
  const payload={...catalog,version:7,identityRepairVersion:'2.7.2',identityRepairAt:nowISO(),items:arr(catalog.items).slice(-700)};
  const encrypted=await encryptJson(runtime.key,payload,CATALOG_AAD);
  localStorage.setItem(CATALOG_STORAGE,JSON.stringify(encrypted));
}

async function exportDoc(fileId,token){
  const response=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`,{headers:{Authorization:`Bearer ${token}`}});
  if(response.status===401||response.status===403)throw new Error('Renove o Google Workspace para reparar identidades históricas.');
  if(!response.ok)throw new Error(`Não foi possível ler a anotação ${fileId}.`);
  return response.text();
}

function candidateFileIds(catalog){
  const ids=new Set(),valid=validPatientIds();
  for(const record of arr(data.records)){
    if(record?.source?.type!=='google-meet-gemini'||!record?.source?.fileId)continue;
    if(!record.patientId||!valid.has(record.patientId))ids.add(record.source.fileId);
  }
  for(const item of arr(catalog.items))if(item?.status==='review'&&item?.fileId)ids.add(item.fileId);
  return[...ids];
}

function strongEnough(match,raw,patients){
  if(!match?.patient)return false;
  if(Number(match.score||0)>=195)return true;
  if(Number(match.score||0)<150)return false;
  const professional=normalizeIdentity(preferences.professionalName);
  const labels=participantLabels(raw).filter(label=>label&&label!==professional);
  if(labels.length!==1)return false;
  const first=firstName(match.patient);
  if(!first||first.length<4)return false;
  const sameFirst=patients.filter(patient=>firstName(patient)===first);
  return sameFirst.length===1&&(labels[0]===first||labels[0].startsWith(`${first} `));
}

async function repair(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return false;
  const last=Number(sessionStorage.getItem(SESSION_KEY)||0);if(Date.now()-last<MIN_INTERVAL_MS)return false;
  running=true;sessionStorage.setItem(SESSION_KEY,String(Date.now()));
  try{
    const [catalog,token]=await Promise.all([loadCatalog(),loadToken()]);
    if(!token)return false;
    const fileIds=candidateFileIds(catalog);if(!fileIds.length)return true;
    const patients=patientsForIdentity();if(!patients.length)return false;
    const fetched=[];
    for(const fileId of fileIds){try{fetched.push({fileId,raw:await exportDoc(fileId,token)})}catch(err){console.warn('Falha ao ler Gemini para reparo de identidade',fileId,err)}}
    if(!fetched.length)return false;
    const learned=learnAliasesFromDocuments({raws:fetched.map(item=>item.raw),patients,professionalName:preferences.professionalName,existingAliases:catalog.aliases||{}});
    catalog.aliases={...(catalog.aliases||{}),...learned};
    let linked=0;
    for(const item of fetched){
      const match=identifyPatientFromDocument({raw:item.raw,patients,professionalName:preferences.professionalName,learnedAliases:catalog.aliases});
      if(!strongEnough(match,item.raw,patients))continue;
      if(catalog.manualLinks?.[item.fileId]===match.patient.id)continue;
      catalog.manualLinks={...(catalog.manualLinks||{}),[item.fileId]:match.patient.id};
      const professional=normalizeIdentity(preferences.professionalName),labels=participantLabels(item.raw).filter(label=>label&&label!==professional);
      if(labels.length===1)catalog.aliases={...(catalog.aliases||{}),[labels[0]]:match.patient.id};
      linked++;
    }
    if(!linked)return false;
    await saveCatalog(catalog);
    await reconcileGemini({quiet:true,force:true,reason:'reparo histórico de identidade v2.7.2'});
    document.dispatchEvent(new CustomEvent('rm:gemini-identity-repair',{detail:{linked,at:nowISO(),version:'2.7.2'}}));
    return true;
  }catch(err){console.error('Falha no reparo histórico de identidades Gemini v2.7.2',err);return false}finally{running=false}
}

function schedule(delay=1800){clearTimeout(timer);timer=setTimeout(()=>void repair(),delay)}
document.addEventListener('rm:data-ready',()=>schedule(2200));
document.addEventListener('rm:google-workspace-authorized',()=>schedule(1200));
window.addEventListener('online',()=>schedule(1600));
