import {STORE_NAMES,runtime} from './state.js';
import {exportRawDatabase} from './database.js';
import {b64ToBytes,decryptJson} from './crypto.js';
import {toast} from './ui.js';

const OWNER='ricmurtapsicologia';
const REPO='plataforma.terapeutica';
const DATA_BRANCH='clinic-sync-data';
const VAULT_PATH='.clinic-sync/vault.json';
const FORMAT='rm-clinic-sync-v2';
const TOKEN_STORAGE='rm.sync.githubToken.v1';
const SECRET_STORAGE='rm.sync.secret.v1';
const BASELINE_STORAGE='rm.sync.baseline.v2';

const dec=new TextDecoder();
const parseJson=v=>{try{return JSON.parse(v)}catch{return null}};
const stamp=v=>String(v||'');
const rowKey=(store,id)=>`${store}:${id}`;
const tombstoneKey=t=>`${t.storeName}:${t.id}`;
let running=false;

function b64ToText(value){
  const binary=atob(String(value||'').replace(/\s+/g,''));
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return dec.decode(bytes);
}
function codeToBytes(code){
  let value=String(code||'').trim().replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  value+='='.repeat((4-value.length%4)%4);
  const bytes=b64ToBytes(value);
  if(bytes.length!==32)throw new Error('Código de sincronização inválido.');
  return bytes;
}
async function credentials(){
  if(!runtime.key)throw new Error('Abra o cofre primeiro.');
  const tokenSaved=parseJson(localStorage.getItem(TOKEN_STORAGE)||'');
  const secretSaved=parseJson(localStorage.getItem(SECRET_STORAGE)||'');
  if(!tokenSaved||!secretSaved)throw new Error('Sincronização não configurada neste dispositivo.');
  const token=await decryptJson(runtime.key,tokenSaved,'github-sync-token');
  const secret=await decryptJson(runtime.key,secretSaved,'github-sync-secret');
  if(!token?.token||!secret?.code)throw new Error('Credenciais de sincronização indisponíveis.');
  const key=await crypto.subtle.importKey('raw',codeToBytes(String(secret.code)),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return{token:String(token.token),key};
}
async function fetchRemote(token){
  const url=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${VAULT_PATH}?ref=${encodeURIComponent(DATA_BRANCH)}`;
  const response=await fetch(url,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok)throw new Error(`GitHub respondeu ${response.status} ao consultar o cofre.`);
  const meta=await response.json();
  let text='';
  if(meta.content)text=b64ToText(meta.content);
  else if(meta.download_url){
    const raw=await fetch(`${meta.download_url}${meta.download_url.includes('?')?'&':'?'}rm=${Date.now()}`,{cache:'no-store'});
    if(!raw.ok)throw new Error('Não foi possível baixar o cofre remoto.');
    text=await raw.text();
  }
  const envelope=parseJson(text);
  if(!envelope||envelope.format!==FORMAT)throw new Error('Cofre remoto incompatível.');
  return envelope;
}
async function decryptEnvelope(envelope,key){
  const snapshot=await decryptJson(key,{iv:envelope.crypto?.iv,data:envelope.payload},FORMAT);
  if(!snapshot?.stores||!snapshot?.meta?.vault)throw new Error('Conteúdo remoto incompatível.');
  return snapshot;
}
function latestTombstones(snapshot){
  const map=new Map();
  for(const t of snapshot?.meta?.syncTombstones||[]){
    if(!t?.storeName||!t?.id)continue;
    const k=tombstoneKey(t),prior=map.get(k);
    if(!prior||stamp(t.deletedAt)>stamp(prior.deletedAt))map.set(k,t);
  }
  return map;
}
function entityState(snapshot,store,id){
  const row=(snapshot?.stores?.[store]||[]).find(x=>x?.id===id);
  const tomb=latestTombstones(snapshot).get(rowKey(store,id));
  const rowStamp=stamp(row?.updatedAt),delStamp=stamp(tomb?.deletedAt);
  if(delStamp&&delStamp>=rowStamp)return{kind:'d',stamp:delStamp,row:null,tomb};
  if(row)return{kind:'r',stamp:rowStamp,row,tomb};
  return{kind:'n',stamp:'',row:null,tomb:null};
}
function stateClock(state){return`${state.kind}|${state.stamp}`}
function loadBaseline(){return parseJson(localStorage.getItem(BASELINE_STORAGE)||'{}')||{}}
function conflictKeys(local,remote){
  const base=loadBaseline(),out=[];
  for(const store of STORE_NAMES){
    const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);
    for(const t of local.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);
    for(const t of remote.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);
    for(const id of ids){
      if(!id)continue;
      const l=entityState(local,store,id),r=entityState(remote,store,id),b=base[rowKey(store,id)]||'n|';
      const ls=stateClock(l),rs=stateClock(r);
      if(ls!==rs&&ls!==b&&rs!==b&&b!=='n|')out.push(rowKey(store,id));
    }
  }
  return out;
}
function parseKey(key){
  const sep=String(key||'').indexOf(':');
  return sep<1?null:{store:key.slice(0,sep),id:key.slice(sep+1)};
}
function deterministicGemini(key){
  const p=parseKey(key);
  return Boolean(p&&((p.store==='appointments'&&p.id.startsWith('gmappt_'))||(p.store==='records'&&p.id.startsWith('gmrec_'))));
}
const VOLATILE=new Set(['updatedAt','createdAt','sourceModifiedAt','importedAt','lastSyncedAt','syncUpdatedAt','googleEventId','googleCalendarEventId']);
function prune(value,key=''){
  if(VOLATILE.has(key))return undefined;
  if(Array.isArray(value))return value.map(v=>prune(v)).filter(v=>v!==undefined);
  if(value&&typeof value==='object'){
    const out={};
    for(const k of Object.keys(value).sort()){
      if(key==='source'&&k==='modifiedAt')continue;
      const v=prune(value[k],k);
      if(v!==undefined)out[k]=v;
    }
    return out;
  }
  return value;
}
function equivalentConflict(local,remote,key){
  const p=parseKey(key);
  if(!p)return false;
  const l=entityState(local,p.store,p.id),r=entityState(remote,p.store,p.id);
  if(l.kind==='d'&&r.kind==='d')return true;
  if(deterministicGemini(key))return false;
  if(l.kind==='r'&&r.kind==='r'&&l.row&&r.row){
    return JSON.stringify(prune(l.row))===JSON.stringify(prune(r.row));
  }
  return false;
}
async function cleanupEquivalentConflicts(){
  if(running||runtime.locked||!runtime.dataReady)return;
  running=true;
  try{
    const {token,key}=await credentials();
    const envelope=await fetchRemote(token);
    const remote=await decryptEnvelope(envelope,key);
    const local=await exportRawDatabase();
    const keys=conflictKeys(local,remote);
    const equivalent=keys.filter(k=>equivalentConflict(local,remote,k));
    if(!equivalent.length)return;
    const base=loadBaseline();
    for(const k of equivalent){
      const p=parseKey(k),l=entityState(local,p.store,p.id),r=entityState(remote,p.store,p.id);
      const winner=stamp(l.stamp)>=stamp(r.stamp)?l:r;
      base[k]=stateClock(winner);
    }
    localStorage.setItem(BASELINE_STORAGE,JSON.stringify(base));
    toast(`${equivalent.length} conflito(s) semanticamente idêntico(s) removido(s) da revisão. Nenhum dado clínico foi alterado.`,'success');
    setTimeout(()=>location.reload(),700);
  }catch(err){
    console.warn('Não foi possível limpar conflitos semanticamente idênticos',err);
  }finally{
    running=false;
  }
}

document.addEventListener('rm:sync-status',e=>{
  if(e.detail?.status==='conflict')setTimeout(()=>void cleanupEquivalentConflicts(),60);
});
