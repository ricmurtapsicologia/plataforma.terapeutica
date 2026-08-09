import {STORE_NAMES,runtime,setStore} from './state.js';
import {exportRawDatabase,importRawDatabase,getAllDecrypted} from './database.js';
import {b64ToBytes,bytesToB64,randomBytes,encryptJson,decryptJson} from './crypto.js';
import {modal,closeModal,toast,esc} from './ui.js';

const OWNER='ricmurtapsicologia';
const REPO='plataforma.terapeutica';
const DATA_BRANCH='clinic-sync-data';
const VAULT_PATH='.clinic-sync/vault.json';
const API_ROOT=`https://api.github.com/repos/${OWNER}/${REPO}`;
const FORMAT='rm-clinic-sync-v2';
const TOKEN_STORAGE='rm.sync.githubToken.v1';
const TOKEN_HANDOFF='rm.sync.githubToken.handoff';
const SECRET_STORAGE='rm.sync.secret.v1';
const SECRET_HANDOFF='rm.sync.secret.handoff';
const BASELINE_STORAGE='rm.sync.baseline.v2';
const REVISION_STORAGE='rm.sync.remoteRevision';
const DIRTY_STORAGE='rm.sync.dirty';
const DEVICE_STORAGE='rm.sync.deviceId';
const HEARTBEAT_MS=90000;
const PUSH_DEBOUNCE_MS=1600;
const TAB_HEARTBEAT_MS=5000;
const TAB_STALE_MS=16000;
const CHANNEL_NAME='rm-clinic-sync-leader-v240';

const enc=new TextEncoder(),dec=new TextDecoder();
const parseJson=v=>{try{return JSON.parse(v)}catch{return null}};
const stamp=v=>String(v||'');
const iso=()=>new Date().toISOString();
const rowKey=(store,id)=>`${store}:${id}`;
const tombstoneKey=t=>`${t.storeName}:${t.id}`;

const sync={
  token:'',key:null,secretCode:'',remoteExists:false,
  remoteRevision:Number(localStorage.getItem(REVISION_STORAGE)||0),
  status:'offline',detail:'Sincronização não configurada',busy:false,conflicts:[],
  timer:null,pushTimer:null,lastCompletedAt:0,
  deviceId:localStorage.getItem(DEVICE_STORAGE)||'',
  tabId:crypto.randomUUID?.()||`${Date.now()}_${Math.random()}`,
  leader:true,peers:new Map(),channel:null
};
if(!sync.deviceId){sync.deviceId=crypto.randomUUID?.()||`dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;localStorage.setItem(DEVICE_STORAGE,sync.deviceId)}

const textToB64=text=>{const bytes=enc.encode(text);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)};
const b64ToText=value=>{const binary=atob(String(value||'').replace(/\s+/g,'')),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return dec.decode(bytes)};
const headers=token=>({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})});

function bytesToCode(bytes){return bytesToB64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function codeToBytes(code){let value=String(code||'').trim().replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');value+='='.repeat((4-value.length%4)%4);let bytes;try{bytes=b64ToBytes(value)}catch{throw new Error('Código de sincronização inválido.')}if(bytes.length!==32)throw new Error('Código de sincronização inválido.');return bytes}
async function importSyncKey(code){return crypto.subtle.importKey('raw',codeToBytes(code),{name:'AES-GCM'},false,['encrypt','decrypt'])}

function statusLabel(){
  if(sync.status==='synced')return['Dados ✓','success'];
  if(sync.status==='syncing')return['Dados ↻','info'];
  if(sync.status==='conflict'||sync.status==='error')return['Dados !','danger'];
  if(sync.status==='pending'||sync.status==='ready'||sync.status==='needs-init')return['Dados •','warning'];
  return['Dados •','muted'];
}
function setStatus(status,detail=''){
  sync.status=status;sync.detail=detail||status;
  paintStatus();paintSettings();
  document.dispatchEvent(new CustomEvent('rm:sync-status',{detail:{status,detail:sync.detail,revision:sync.remoteRevision,leader:sync.leader}}));
}
function paintStatus(){
  if(runtime.locked)return;const actions=document.querySelector('.top-actions');if(!actions)return;
  let chip=document.getElementById('rm-sync-chip');if(!chip){chip=document.createElement('button');chip.type='button';chip.id='rm-sync-chip';chip.dataset.action='sync-now';actions.insertBefore(chip,actions.firstChild)}
  const [label,kind]=statusLabel();chip.className=`sync-chip ${kind}`;chip.textContent=label;chip.title=sync.detail||label;chip.setAttribute('aria-label',sync.detail||label);
}
function injectStyles(){
  if(document.getElementById('rm-sync-style-v240'))return;const style=document.createElement('style');style.id='rm-sync-style-v240';style.textContent=`.sync-chip{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;min-height:36px;padding:6px 10px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:.72rem;font-weight:800;white-space:nowrap}.sync-chip.success{color:var(--green)}.sync-chip.info{color:var(--primary2)}.sync-chip.warning{color:#8a6417}.sync-chip.danger{color:var(--danger)}.sync-panel-list{display:grid;gap:8px;margin-top:12px}.sync-panel-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:8px 0}.sync-panel-row:last-child{border-bottom:0}.sync-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.sync-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;word-break:break-word;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface2);font-size:.86rem}@media(max-width:700px){.sync-chip{min-width:70px;padding:5px 8px;font-size:.68rem}}`;document.head.appendChild(style)
}

async function fetchRemote(token=sync.token){
  const url=`${API_ROOT}/contents/${VAULT_PATH}?ref=${encodeURIComponent(DATA_BRANCH)}`;
  const response=await fetch(url,{headers:headers(token),cache:'no-store'});if(response.status===404)return null;
  if(response.status===401||response.status===403)throw new Error('A autorização do GitHub não permite acessar o cofre de sincronização.');if(!response.ok)throw new Error(`GitHub respondeu ${response.status} ao consultar o cofre.`);
  const meta=await response.json();let text='';if(meta.content)text=b64ToText(meta.content);else if(meta.download_url){const raw=await fetch(`${meta.download_url}${meta.download_url.includes('?')?'&':'?'}rm=${Date.now()}`,{cache:'no-store'});if(!raw.ok)throw new Error('Não foi possível baixar o cofre criptografado.');text=await raw.text()}else throw new Error('O GitHub não retornou o conteúdo do cofre.');
  const envelope=parseJson(text);if(!envelope||envelope.format!==FORMAT||Number(envelope.version)!==2)throw new Error('O arquivo remoto não é um cofre clínico compatível.');return{sha:meta.sha,envelope}
}
async function putRemote(envelope,sha=''){
  if(!sync.token)throw new Error('Autorize este dispositivo no GitHub antes de sincronizar.');const url=`${API_ROOT}/contents/${VAULT_PATH}`;
  const body={message:`sync clínica r${envelope.revision}`,content:textToB64(JSON.stringify(envelope)),branch:DATA_BRANCH,...(sha?{sha}:{})};
  const response=await fetch(url,{method:'PUT',headers:{...headers(sync.token),'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(response.status===409||response.status===422){const err=new Error('O cofre remoto mudou durante a sincronização.');err.code='RETRY';throw err}
  if(response.status===401||response.status===403)throw new Error('A autorização do GitHub não possui permissão de gravação em Contents.');if(!response.ok)throw new Error(`GitHub respondeu ${response.status} ao gravar o cofre.`);return response.json()
}
function validateSnapshot(snapshot){if(!snapshot||!['rm-local-backup','rmvault-indexed'].includes(snapshot.format)||!snapshot.meta?.vault||!snapshot.stores)throw new Error('Conteúdo clínico remoto incompatível.');return snapshot}
async function decryptEnvelope(envelope,key=sync.key){if(!key)throw new Error('Informe o código de sincronização deste cofre.');try{return validateSnapshot(await decryptJson(key,{iv:envelope.crypto?.iv,data:envelope.payload},FORMAT))}catch{throw new Error('O código de sincronização não abre este cofre remoto.')}}
async function makeEnvelope(snapshot,revision){const encrypted=await encryptJson(sync.key,snapshot,FORMAT);return{format:FORMAT,version:2,revision,updatedAt:iso(),deviceId:sync.deviceId,crypto:{name:'AES-256-GCM',iv:encrypted.iv},payload:encrypted.data}}

function latestTombstones(snapshot){const map=new Map();for(const t of snapshot?.meta?.syncTombstones||[]){if(!t?.storeName||!t?.id)continue;const k=tombstoneKey(t),prior=map.get(k);if(!prior||stamp(t.deletedAt)>stamp(prior.deletedAt))map.set(k,t)}return map}
function entityState(snapshot,store,id){const row=(snapshot?.stores?.[store]||[]).find(x=>x?.id===id),tomb=latestTombstones(snapshot).get(rowKey(store,id)),rowStamp=stamp(row?.updatedAt),delStamp=stamp(tomb?.deletedAt);if(delStamp&&delStamp>=rowStamp)return{kind:'d',stamp:delStamp,row:null,tomb};if(row)return{kind:'r',stamp:rowStamp,row,tomb};return{kind:'n',stamp:'',row:null,tomb:null}}
function buildBaseline(snapshot){const out={};for(const store of STORE_NAMES){const ids=new Set((snapshot?.stores?.[store]||[]).map(x=>x?.id).filter(Boolean));for(const t of snapshot?.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const id of ids){const s=entityState(snapshot,store,id);out[rowKey(store,id)]=`${s.kind}|${s.stamp}`}}return out}
function loadBaseline(){return parseJson(localStorage.getItem(BASELINE_STORAGE)||'{}')||{}}
function saveBaseline(snapshot){localStorage.setItem(BASELINE_STORAGE,JSON.stringify(buildBaseline(snapshot)))}
function conflictKeys(local,remote){const base=loadBaseline(),conflicts=[];for(const store of STORE_NAMES){const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);for(const t of local.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const t of remote.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const id of ids){if(!id)continue;const l=entityState(local,store,id),r=entityState(remote,store,id),b=base[rowKey(store,id)]||'n|',ls=`${l.kind}|${l.stamp}`,rs=`${r.kind}|${r.stamp}`;if(ls!==rs&&ls!==b&&rs!==b&&b!=='n|')conflicts.push(rowKey(store,id))}}return conflicts}
function mergeSnapshots(local,remote){const merged={format:'rm-local-backup',version:Math.max(Number(local.version||0),Number(remote.version||0),4),exportedAt:iso(),meta:{...remote.meta,...local.meta},stores:{}};merged.meta.vault=remote.meta?.vault||local.meta?.vault;merged.meta.schemaVersion=Math.max(Number(local.meta?.schemaVersion||0),Number(remote.meta?.schemaVersion||0));const tombMap=new Map();for(const source of [remote,local])for(const t of source.meta?.syncTombstones||[]){const k=tombstoneKey(t),prior=tombMap.get(k);if(!prior||stamp(t.deletedAt)>stamp(prior.deletedAt))tombMap.set(k,t)}merged.meta.syncTombstones=[...tombMap.values()];for(const store of STORE_NAMES){const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);for(const t of merged.meta.syncTombstones)if(t.storeName===store)ids.add(t.id);const rows=[];for(const id of ids){if(!id)continue;const l=entityState(local,store,id),r=entityState(remote,store,id),winner=[l,r].sort((a,b)=>stamp(b.stamp).localeCompare(stamp(a.stamp)))[0];if(winner?.kind==='r'&&winner.row)rows.push(winner.row)}merged.stores[store]=rows}return merged}
function clocksEqual(a,b){const aa=buildBaseline(a),bb=buildBaseline(b),ka=Object.keys(aa).sort(),kb=Object.keys(bb).sort();if(ka.length!==kb.length)return false;return ka.every((k,i)=>k===kb[i]&&aa[k]===bb[k])}
function changedStoresBetween(a,b){const out=[];for(const store of STORE_NAMES){const x=JSON.stringify((a?.stores?.[store]||[]).map(v=>[v.id,v.updatedAt]).sort()),y=JSON.stringify((b?.stores?.[store]||[]).map(v=>[v.id,v.updatedAt]).sort());if(x!==y)out.push(store)}return out}
function meaningfulCount(snapshot){return ['patients','appointments','records','notes','formulations','goals','tasks','documents','payments','consents','communications'].reduce((n,s)=>n+(snapshot.stores?.[s]?.length||0),0)}
function vaultFingerprint(snapshot){const v=snapshot?.meta?.vault;return v?`${v.salt||''}:${v.iterations||''}:${v.version||''}`:''}

async function refreshMemory(){for(const name of STORE_NAMES)setStore(name,await getAllDecrypted(name,runtime.key));window.__rmRender?.();window.__rmUpdateClock?.()}
async function applySnapshot(snapshot,changedStores=[]){globalThis.__rmSyncApplying=true;try{await importRawDatabase(snapshot);await refreshMemory()}finally{globalThis.__rmSyncApplying=false}document.dispatchEvent(new CustomEvent('rm:data-patched',{detail:{stores:changedStores}}));sync.channel?.postMessage({type:'data-applied',tabId:sync.tabId,at:Date.now()})}
async function adoptRemoteVault(remoteSnapshot,revision){sessionStorage.setItem(TOKEN_HANDOFF,sync.token||'');sessionStorage.setItem(SECRET_HANDOFF,sync.secretCode||'');globalThis.__rmSyncApplying=true;try{await importRawDatabase(remoteSnapshot)}finally{globalThis.__rmSyncApplying=false}saveBaseline(remoteSnapshot);localStorage.setItem(DIRTY_STORAGE,'0');localStorage.setItem(REVISION_STORAGE,String(revision||0));setStatus('synced','Base remota recebida. Reabrindo o cofre local…');setTimeout(()=>location.reload(),700);return true}

async function loadStoredToken(){const saved=parseJson(localStorage.getItem(TOKEN_STORAGE)||'');if(saved&&runtime.key){try{const value=await decryptJson(runtime.key,saved,'github-sync-token');if(value?.token)return String(value.token)}catch{}}const handoff=sessionStorage.getItem(TOKEN_HANDOFF)||'';if(handoff&&runtime.key){await storeToken(handoff);sessionStorage.removeItem(TOKEN_HANDOFF);return handoff}return''}
async function storeToken(token){const payload=await encryptJson(runtime.key,{token},'github-sync-token');localStorage.setItem(TOKEN_STORAGE,JSON.stringify(payload));sync.token=token}
async function loadStoredSecret(){const saved=parseJson(localStorage.getItem(SECRET_STORAGE)||'');if(saved&&runtime.key){try{const value=await decryptJson(runtime.key,saved,'github-sync-secret');if(value?.code){sync.secretCode=String(value.code);sync.key=await importSyncKey(sync.secretCode);return true}}catch{}}const handoff=sessionStorage.getItem(SECRET_HANDOFF)||'';if(handoff&&runtime.key){await storeSecret(handoff);sessionStorage.removeItem(SECRET_HANDOFF);return true}return false}
async function storeSecret(code){const normalized=bytesToCode(codeToBytes(code)),key=await importSyncKey(normalized),payload=await encryptJson(runtime.key,{code:normalized},'github-sync-secret');localStorage.setItem(SECRET_STORAGE,JSON.stringify(payload));sync.secretCode=normalized;sync.key=key;return true}
async function testToken(token){const r=await fetch(API_ROOT,{headers:headers(token),cache:'no-store'});if(r.status===401||r.status===403)throw new Error('Token recusado pelo GitHub.');if(!r.ok)throw new Error(`Não foi possível validar o acesso ao repositório (${r.status}).`);return true}

function cleanupPeers(){const now=Date.now();for(const [id,at] of sync.peers)if(now-at>TAB_STALE_MS)sync.peers.delete(id);const ids=[sync.tabId,...sync.peers.keys()].sort();const was=sync.leader;sync.leader=ids[0]===sync.tabId;if(was!==sync.leader)document.dispatchEvent(new CustomEvent('rm:sync-leader',{detail:{leader:sync.leader}}))}
function initLeaderElection(){if(!('BroadcastChannel'in window))return;sync.channel=new BroadcastChannel(CHANNEL_NAME);sync.channel.onmessage=e=>{const msg=e.data||{};if(msg.tabId===sync.tabId)return;if(msg.type==='hello'||msg.type==='beat'){sync.peers.set(msg.tabId,Date.now());cleanupPeers()}if(msg.type==='dirty'&&sync.leader)schedulePush();if(msg.type==='data-applied'&&!sync.leader&&runtime.dataReady)setTimeout(()=>refreshMemory().catch(console.error),120)};sync.channel.postMessage({type:'hello',tabId:sync.tabId});setInterval(()=>{sync.channel?.postMessage({type:'beat',tabId:sync.tabId});cleanupPeers()},TAB_HEARTBEAT_MS)}

export async function performSync({manual=false}={}){
  if(sync.busy||runtime.locked||!runtime.dataReady)return false;if(!manual&&!sync.leader)return false;
  if(!sync.key){setStatus('pending','Informe o código de sincronização deste cofre.');return false}if(!sync.token){setStatus('pending','Autorize este dispositivo no GitHub.');return false}
  sync.busy=true;setStatus('syncing','Comparando dados locais e remotos…');
  try{
    for(let attempt=0;attempt<3;attempt++){
      const remote=await fetchRemote(sync.token);if(!remote){setStatus('needs-init','Cofre remoto ainda não inicializado.');return false}
      const remoteSnapshot=await decryptEnvelope(remote.envelope),localSnapshot=await exportRawDatabase(),localCount=meaningfulCount(localSnapshot),remoteCount=meaningfulCount(remoteSnapshot);
      if(vaultFingerprint(localSnapshot)!==vaultFingerprint(remoteSnapshot)){if(localCount===0&&remoteCount>0)return await adoptRemoteVault(remoteSnapshot,Number(remote.envelope.revision||0));throw new Error('Este dispositivo possui uma base local diferente da base remota. A sincronização foi bloqueada para impedir sobrescrita.')}
      const conflicts=conflictKeys(localSnapshot,remoteSnapshot);if(conflicts.length){sync.conflicts=conflicts;setStatus('conflict',`${conflicts.length} registro(s) foram alterados nos dois dispositivos. A sincronização automática foi pausada.`);return false}
      const merged=mergeSnapshots(localSnapshot,remoteSnapshot),localChanged=!clocksEqual(localSnapshot,merged),remoteChanged=!clocksEqual(remoteSnapshot,merged),dirty=localStorage.getItem(DIRTY_STORAGE)==='1',changedStores=changedStoresBetween(localSnapshot,merged);
      if(remoteChanged||dirty){const revision=Math.max(Number(remote.envelope.revision||0),sync.remoteRevision)+1,envelope=await makeEnvelope(merged,revision);try{await putRemote(envelope,remote.sha);sync.remoteRevision=revision}catch(err){if(err.code==='RETRY')continue;throw err}}else sync.remoteRevision=Number(remote.envelope.revision||0);
      if(localChanged)await applySnapshot(merged,changedStores);
      saveBaseline(merged);localStorage.setItem(DIRTY_STORAGE,'0');localStorage.setItem(REVISION_STORAGE,String(sync.remoteRevision));sync.conflicts=[];sync.lastCompletedAt=Date.now();setStatus('synced',`Sincronizado · revisão ${sync.remoteRevision} · ${new Date().toLocaleTimeString('pt-BR')}`);return true
    }
    throw new Error('Houve atualizações concorrentes repetidas. Tente sincronizar novamente.');
  }catch(err){console.error('Falha de sincronização',err);setStatus(navigator.onLine?'error':'pending',navigator.onLine?(err.message||'Falha de sincronização.'):'Sem internet. As alterações permanecem neste dispositivo.');if(manual)toast(err.message||'Não foi possível sincronizar.','error');return false}finally{sync.busy=false}
}

function schedulePush(){if(!sync.remoteExists||runtime.locked)return;clearTimeout(sync.pushTimer);sync.pushTimer=setTimeout(()=>performSync(),PUSH_DEBOUNCE_MS)}
function startHeartbeat(){clearInterval(sync.timer);sync.timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine&&sync.leader&&sync.token&&sync.key&&sync.remoteExists&&!sync.busy)performSync()},HEARTBEAT_MS)}

function settingsMarkup(){const [label]=statusLabel(),rev=sync.remoteRevision||'—';return`<h3>Sincronização segura notebook ↔ celular</h3><div class="sync-panel-list"><div class="sync-panel-row"><span>Estado</span><strong>${esc(label)}</strong></div><div class="sync-panel-row"><span>Cofre remoto</span><strong>${sync.remoteExists?'Inicializado':'Ainda não inicializado'}</strong></div><div class="sync-panel-row"><span>GitHub autorizado</span><strong>${sync.token?'Sim':'Não'}</strong></div><div class="sync-panel-row"><span>Chave de sincronização</span><strong>${sync.key?'Configurada':'Não configurada'}</strong></div><div class="sync-panel-row"><span>Revisão remota</span><strong>${esc(rev)}</strong></div><div class="sync-panel-row"><span>Aba líder</span><strong>${sync.leader?'Esta aba':'Outra aba'}</strong></div></div><p class="muted mt-12">A sincronização é orientada por eventos. Alterações locais são enviadas após debounce; retorno à aba, reconexão e um heartbeat de segurança fazem conferência remota sem reconstruir a interface quando nada mudou.</p><div class="sync-actions"><button class="btn secondary" data-action="sync-config-token">${sync.token?'Trocar autorização GitHub':'Autorizar este dispositivo'}</button>${sync.remoteExists?(sync.key?'<button class="btn secondary" data-action="sync-secret-show">Mostrar código</button>':'<button class="btn" data-action="sync-secret-config">Informar código de sincronização</button>'):''}${!sync.remoteExists?'<button class="btn" data-action="sync-initialize">Inicializar com os dados deste notebook</button>':sync.key&&sync.token?'<button class="btn" data-action="sync-now">Sincronizar agora</button>':''}${sync.token?'<button class="btn ghost" data-action="sync-disconnect">Remover autorização local</button>':''}${sync.conflicts.length?'<button class="btn danger" data-action="sync-conflicts">Ver conflitos</button>':''}</div><div class="notice mt-16">${esc(sync.detail)}</div>`}
function paintSettings(){if(runtime.locked||runtime.route!=='settings')return;setTimeout(()=>{let section=document.getElementById('rm-secure-sync-panel');if(!section){section=document.createElement('section');section.id='rm-secure-sync-panel';section.className='card mt-16';document.getElementById('main-content')?.appendChild(section)}if(section)section.innerHTML=settingsMarkup()},20)}
function tokenModal(){modal('Autorizar sincronização neste dispositivo',`<div class="notice"><strong>O token fica somente neste dispositivo</strong> e é armazenado criptografado com a chave local da plataforma.</div><div class="field mt-16"><label>GitHub Fine-grained Personal Access Token</label><input id="rm-sync-token-input" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></div><div class="small muted mt-12">Restrinja o token ao repositório ${OWNER}/${REPO} com Contents: Read and write.</div>`,`<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="sync-save-token">Autorizar dispositivo</button>`,true)}
function secretModal(){modal('Código de sincronização',`<div class="notice"><strong>Este código não é sua senha.</strong> Informe a chave aleatória do cofre remoto apenas neste dispositivo.</div><div class="field mt-16"><label>Código de sincronização</label><input id="rm-sync-secret-input" class="input" type="password" autocomplete="off" spellcheck="false"></div>`,`<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="sync-secret-save">Salvar neste dispositivo</button>`,true)}
function showRecoveryCode(){modal('Código de sincronização',`<div class="notice"><strong>Guarde este código fora da plataforma.</strong></div><div class="sync-code mt-16">${esc(sync.secretCode)}</div>`,`<button class="btn" data-action="close-modal">Fechar</button>`,true)}
async function initializeRemote(){if(sync.busy)return;sync.busy=true;setStatus('syncing','Preparando primeira cópia criptografada…');try{if(!sync.token)throw new Error('Autorize este notebook no GitHub primeiro.');const existing=await fetchRemote(sync.token);if(existing)throw new Error('Já existe um cofre remoto. Use Sincronizar agora.');const local=await exportRawDatabase(),count=meaningfulCount(local);if(count===0)throw new Error('Este dispositivo está sem dados clínicos.');if(!sync.key)await storeSecret(bytesToCode(randomBytes(32)));const revision=1,envelope=await makeEnvelope(local,revision);await putRemote(envelope);sync.remoteExists=true;sync.remoteRevision=revision;saveBaseline(local);localStorage.setItem(DIRTY_STORAGE,'0');localStorage.setItem(REVISION_STORAGE,'1');setStatus('synced',`Base inicial protegida e sincronizada · ${count} registro(s).`);showRecoveryCode()}catch(err){setStatus('error',err.message||'Não foi possível inicializar.');toast(err.message||'Não foi possível inicializar.','error')}finally{sync.busy=false}}

export async function startSyncSession(){let remote=null;try{remote=await fetchRemote('')}catch(err){console.warn('Cofre remoto não consultado na abertura',err)}sync.remoteExists=Boolean(remote);if(remote){sync.remoteRevision=Number(remote.envelope.revision||0);localStorage.setItem(REVISION_STORAGE,String(sync.remoteRevision))}sync.token=await loadStoredToken();await loadStoredSecret();if(sync.remoteExists){if(!sync.key)setStatus('pending','Cofre remoto localizado. Informe o código de sincronização neste dispositivo.');else if(!sync.token)setStatus('pending','Cofre remoto localizado. Autorize este dispositivo no GitHub.');else setStatus('ready','Credenciais locais prontas. A sincronização ocorrerá após o carregamento dos dados.')}else setStatus(sync.token?'needs-init':'pending',sync.token?'Inicialize o cofre remoto a partir deste notebook.':'Autorize este notebook para configurar a sincronização.');return true}

export function activateSyncRuntime(){injectStyles();paintStatus();paintSettings();startHeartbeat();if(sync.token&&sync.key&&sync.remoteExists&&sync.leader)performSync();else if(!sync.remoteExists)setStatus(sync.token?'needs-init':'pending',sync.token?'Inicialize o cofre remoto a partir deste notebook.':'Autorize este notebook para configurar a primeira sincronização.')}

initLeaderElection();
document.addEventListener('rm:data-ready',()=>activateSyncRuntime());
document.addEventListener('rm:rendered',()=>{paintStatus();paintSettings()});
document.addEventListener('rm:local-data-changed',()=>{if(globalThis.__rmSyncApplying)return;localStorage.setItem(DIRTY_STORAGE,'1');sync.channel?.postMessage({type:'dirty',tabId:sync.tabId});if(sync.remoteExists){setStatus('pending','Alteração local aguardando sincronização.');if(sync.leader)schedulePush()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&runtime.dataReady&&navigator.onLine&&sync.leader&&Date.now()-sync.lastCompletedAt>30000)performSync()});
window.addEventListener('online',()=>{if(runtime.dataReady&&sync.leader&&sync.token&&sync.key&&sync.remoteExists)performSync()});
document.addEventListener('click',async e=>{const el=e.target.closest?.('[data-action]');if(!el)return;const action=el.dataset.action;if(!['sync-now','sync-config-token','sync-save-token','sync-secret-config','sync-secret-save','sync-secret-show','sync-initialize','sync-disconnect','sync-conflicts'].includes(action))return;e.preventDefault();e.stopImmediatePropagation();try{if(action==='sync-now'){await performSync({manual:true});return}if(action==='sync-config-token'){tokenModal();return}if(action==='sync-save-token'){const value=document.getElementById('rm-sync-token-input')?.value.trim();if(!value)throw new Error('Cole o token do GitHub.');await testToken(value);await storeToken(value);closeModal();setStatus(sync.remoteExists?(sync.key?'ready':'pending'):'needs-init','Dispositivo autorizado.');if(sync.remoteExists&&sync.key)await performSync({manual:true});return}if(action==='sync-secret-config'){secretModal();return}if(action==='sync-secret-save'){await storeSecret(document.getElementById('rm-sync-secret-input')?.value||'');closeModal();setStatus(sync.token?'ready':'pending','Código configurado.');if(sync.remoteExists&&sync.token)await performSync({manual:true});return}if(action==='sync-secret-show'){showRecoveryCode();return}if(action==='sync-initialize'){await initializeRemote();return}if(action==='sync-disconnect'){localStorage.removeItem(TOKEN_STORAGE);sync.token='';setStatus('pending','Autorização GitHub removida deste dispositivo.');paintSettings();return}if(action==='sync-conflicts'){modal('Conflitos de sincronização',`<div class="notice warning"><strong>${sync.conflicts.length}</strong> registro(s) alterado(s) nos dois dispositivos.</div><div class="sync-code mt-12">${sync.conflicts.map(esc).join('<br>')}</div>`,`<button class="btn" data-action="close-modal">Fechar</button>`,true);return}}catch(err){toast(err.message||'Não foi possível concluir a sincronização.','error')}},true);
