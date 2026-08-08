import {STORE_NAMES,runtime} from './state.js';
import {exportRawDatabase,importRawDatabase} from './database.js';
import {b64ToBytes,decryptJson} from './crypto.js';
import {toast} from './ui.js';

const OWNER='ricmurtapsicologia',REPO='plataforma.terapeutica',DATA_BRANCH='clinic-sync-data',VAULT_PATH='.clinic-sync/vault.json';
const FORMAT='rm-clinic-sync-v2',TOKEN_STORAGE='rm.sync.githubToken.v1',SECRET_STORAGE='rm.sync.secret.v1',BASELINE_STORAGE='rm.sync.baseline.v2',REVISION_STORAGE='rm.sync.remoteRevision',DIRTY_STORAGE='rm.sync.dirty';
let lastStatus='';
const dec=new TextDecoder();
const parseJson=v=>{try{return JSON.parse(v)}catch{return null}};
const stamp=v=>String(v||'');
const rowKey=(store,id)=>`${store}:${id}`;
const tombstoneKey=t=>`${t.storeName}:${t.id}`;
function b64ToText(value){const binary=atob(String(value||'').replace(/\s+/g,'')),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return dec.decode(bytes)}
function codeToBytes(code){let value=String(code||'').trim().replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');value+='='.repeat((4-value.length%4)%4);const bytes=b64ToBytes(value);if(bytes.length!==32)throw new Error('Código de sincronização inválido.');return bytes}
async function importSyncKey(code){return crypto.subtle.importKey('raw',codeToBytes(code),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function credentials(){
  if(!runtime.key)throw new Error('Abra o cofre primeiro.');
  const tokenSaved=parseJson(localStorage.getItem(TOKEN_STORAGE)||''),secretSaved=parseJson(localStorage.getItem(SECRET_STORAGE)||'');
  if(!tokenSaved||!secretSaved)throw new Error('A autorização/chave de sincronização não está configurada neste dispositivo.');
  const token=await decryptJson(runtime.key,tokenSaved,'github-sync-token'),secret=await decryptJson(runtime.key,secretSaved,'github-sync-secret');
  if(!token?.token||!secret?.code)throw new Error('Não foi possível abrir as credenciais locais de sincronização.');
  return{token:String(token.token),key:await importSyncKey(String(secret.code))};
}
async function fetchRemote(token){
  const url=`https://api.github.com/repos/${OWNER}/${REPO}/contents/${VAULT_PATH}?ref=${encodeURIComponent(DATA_BRANCH)}`;
  const r=await fetch(url,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`},cache:'no-store'});if(!r.ok)throw new Error(`GitHub respondeu ${r.status} ao consultar o cofre.`);
  const meta=await r.json();let text='';if(meta.content)text=b64ToText(meta.content);else if(meta.download_url){const raw=await fetch(`${meta.download_url}${meta.download_url.includes('?')?'&':'?'}rm=${Date.now()}`,{cache:'no-store'});if(!raw.ok)throw new Error('Não foi possível baixar o cofre remoto.');text=await raw.text()}const envelope=parseJson(text);if(!envelope||envelope.format!==FORMAT)throw new Error('Cofre remoto incompatível.');return envelope;
}
async function decryptEnvelope(envelope,key){const snapshot=await decryptJson(key,{iv:envelope.crypto?.iv,data:envelope.payload},FORMAT);if(!snapshot?.stores||!snapshot?.meta?.vault)throw new Error('Conteúdo remoto incompatível.');return snapshot}
function latestTombstones(snapshot){const map=new Map();for(const t of snapshot?.meta?.syncTombstones||[]){if(!t?.storeName||!t?.id)continue;const k=tombstoneKey(t),p=map.get(k);if(!p||stamp(t.deletedAt)>stamp(p.deletedAt))map.set(k,t)}return map}
function entityState(snapshot,store,id){const row=(snapshot?.stores?.[store]||[]).find(x=>x?.id===id),tomb=latestTombstones(snapshot).get(rowKey(store,id)),rs=stamp(row?.updatedAt),ds=stamp(tomb?.deletedAt);if(ds&&ds>=rs)return{kind:'d',stamp:ds,row:null,tomb};if(row)return{kind:'r',stamp:rs,row,tomb};return{kind:'n',stamp:'',row:null,tomb:null}}
function buildBaseline(snapshot){const out={};for(const store of STORE_NAMES){const ids=new Set((snapshot?.stores?.[store]||[]).map(x=>x?.id).filter(Boolean));for(const t of snapshot?.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const id of ids){const s=entityState(snapshot,store,id);out[rowKey(store,id)]=`${s.kind}|${s.stamp}`}}return out}
function loadBaseline(){return parseJson(localStorage.getItem(BASELINE_STORAGE)||'{}')||{}}
function conflictKeys(local,remote){const base=loadBaseline(),out=[];for(const store of STORE_NAMES){const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);for(const t of local.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const t of remote.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const id of ids){if(!id)continue;const l=entityState(local,store,id),r=entityState(remote,store,id),b=base[rowKey(store,id)]||'n|',ls=`${l.kind}|${l.stamp}`,rs=`${r.kind}|${r.stamp}`;if(ls!==rs&&ls!==b&&rs!==b&&b!=='n|')out.push(rowKey(store,id))}}return out}
function mergeSnapshots(local,remote){
  const merged={format:'rm-local-backup',version:Math.max(Number(local.version||0),Number(remote.version||0),4),exportedAt:new Date().toISOString(),meta:{...remote.meta,...local.meta},stores:{}};merged.meta.vault=remote.meta?.vault||local.meta?.vault;merged.meta.schemaVersion=Math.max(Number(local.meta?.schemaVersion||0),Number(remote.meta?.schemaVersion||0));
  const tombMap=new Map();for(const source of [remote,local])for(const t of source.meta?.syncTombstones||[]){const k=tombstoneKey(t),p=tombMap.get(k);if(!p||stamp(t.deletedAt)>stamp(p.deletedAt))tombMap.set(k,t)}merged.meta.syncTombstones=[...tombMap.values()];
  for(const store of STORE_NAMES){const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);for(const t of merged.meta.syncTombstones)if(t.storeName===store)ids.add(t.id);const rows=[];for(const id of ids){if(!id)continue;const l=entityState(local,store,id),r=entityState(remote,store,id),winner=[l,r].sort((a,b)=>stamp(b.stamp).localeCompare(stamp(a.stamp)))[0];if(winner?.kind==='r'&&winner.row)rows.push(winner.row)}merged.stores[store]=rows}return merged;
}
function forceRemote(merged,remote,key){const sep=key.indexOf(':'),store=key.slice(0,sep),id=key.slice(sep+1);if(!STORE_NAMES.includes(store)||!id)return;merged.stores[store]=(merged.stores[store]||[]).filter(x=>x?.id!==id);merged.meta.syncTombstones=(merged.meta.syncTombstones||[]).filter(t=>!(t.storeName===store&&t.id===id));const state=entityState(remote,store,id);if(state.kind==='r'&&state.row)merged.stores[store].push(state.row);else if(state.kind==='d'&&state.tomb)merged.meta.syncTombstones.push(state.tomb)}
function clocksEqual(a,b){const aa=buildBaseline(a),bb=buildBaseline(b),ka=Object.keys(aa).sort(),kb=Object.keys(bb).sort();return ka.length===kb.length&&ka.every((k,i)=>k===kb[i]&&aa[k]===bb[k])}
async function resolveWithRemote(){
  if(!confirm('Usar a versão do cofre remoto nos registros em conflito? Use esta opção no celular somente quando o notebook estiver correto e sincronizado. Alterações locais que não estão em conflito serão preservadas.'))return;
  const {token,key}=await credentials(),envelope=await fetchRemote(token),remote=await decryptEnvelope(envelope,key),local=await exportRawDatabase(),conflicts=conflictKeys(local,remote);if(!conflicts.length){toast('Nenhum conflito atual foi encontrado.','');location.reload();return}
  const merged=mergeSnapshots(local,remote);for(const keyName of conflicts)forceRemote(merged,remote,keyName);
  window.__rmSyncApplying=true;try{await importRawDatabase(merged)}finally{window.__rmSyncApplying=false}
  localStorage.setItem(BASELINE_STORAGE,JSON.stringify(buildBaseline(remote)));localStorage.setItem(REVISION_STORAGE,String(Number(envelope.revision||0)));localStorage.setItem(DIRTY_STORAGE,clocksEqual(merged,remote)?'0':'1');toast(`${conflicts.length} conflito(s) resolvido(s) com a versão remota. Reabrindo o cofre…`,'success');setTimeout(()=>location.reload(),900);
}
function injectButton(){if(lastStatus!=='conflict'||runtime.locked||runtime.route!=='settings')return;const panel=document.querySelector('#rm-secure-sync-panel')||document.querySelector('#rm-portable-tools .card:last-child');if(!panel||panel.querySelector('[data-action="sync-resolve-remote-conflicts"]'))return;const actions=panel.querySelector('.sync-actions');if(!actions)return;const b=document.createElement('button');b.type='button';b.className='btn danger';b.dataset.action='sync-resolve-remote-conflicts';b.textContent='Usar cofre remoto nos conflitos';actions.appendChild(b);const note=document.createElement('div');note.className='notice warning mt-12';note.innerHTML='<strong>Celular em conflito?</strong> Se o notebook estiver correto e sincronizado, esta ação substitui somente os registros conflitantes pela versão remota e preserva alterações locais não conflitantes.';actions.insertAdjacentElement('afterend',note)}
document.addEventListener('rm:sync-status',e=>{lastStatus=e.detail?.status||lastStatus;setTimeout(injectButton,80)});document.addEventListener('rm:rendered',()=>setTimeout(injectButton,100));setInterval(injectButton,3000);
document.addEventListener('click',e=>{const el=e.target.closest?.('[data-action="sync-resolve-remote-conflicts"]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();resolveWithRemote().catch(err=>toast(err.message||'Não foi possível resolver o conflito.','error'))},true);
