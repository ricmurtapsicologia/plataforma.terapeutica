import {STORE_NAMES,runtime,setStore} from './state.js';
import {exportRawDatabase,importRawDatabase,getAllDecrypted,vaultExists} from './database.js';
import {deriveKey,b64ToBytes,bytesToB64,randomBytes,encryptJson,decryptJson} from './crypto.js';
import {modal,closeModal,toast,esc} from './ui.js';

const OWNER='ricmurtapsicologia';
const REPO='plataforma.terapeutica';
const DATA_BRANCH='clinic-sync-data';
const VAULT_PATH='.clinic-sync/vault.json';
const API_ROOT=`https://api.github.com/repos/${OWNER}/${REPO}`;
const KDF_ITERATIONS=600000;
const POLL_MS=15000;
const PUSH_DEBOUNCE_MS=1800;
const FORMAT='rm-clinic-sync-v1';
const TOKEN_STORAGE='rm.sync.githubToken.v1';
const BASELINE_STORAGE='rm.sync.baseline.v1';
const REVISION_STORAGE='rm.sync.remoteRevision';
const DIRTY_STORAGE='rm.sync.dirty';
const DEVICE_STORAGE='rm.sync.deviceId';

const sync={
  token:'', key:null, salt:null, remoteExists:false, remoteRevision:Number(localStorage.getItem(REVISION_STORAGE)||0),
  status:'offline', detail:'Sincronização não configurada', busy:false, timer:null, pushTimer:null, conflicts:[],
  deviceId:localStorage.getItem(DEVICE_STORAGE)||''
};
if(!sync.deviceId){sync.deviceId=crypto.randomUUID?.()||`dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;localStorage.setItem(DEVICE_STORAGE,sync.deviceId)}

const enc=new TextEncoder(),dec=new TextDecoder();
const iso=()=>new Date().toISOString();
const parseJson=value=>{try{return JSON.parse(value)}catch{return null}};
const textToB64=text=>{const bytes=enc.encode(text);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)};
const b64ToText=value=>{const binary=atob(String(value||'').replace(/\s+/g,'')),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return dec.decode(bytes)};
const headers=token=>({Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{})});
const tombstoneKey=t=>`${t.storeName}:${t.id}`;
const rowKey=(store,id)=>`${store}:${id}`;
const stamp=v=>String(v||'');

function setStatus(status,detail=''){
  sync.status=status;sync.detail=detail||status;paintStatus();paintSettings();
  document.dispatchEvent(new CustomEvent('rm:sync-status',{detail:{status,detail:sync.detail,revision:sync.remoteRevision}}));
}
function statusLabel(){
  if(sync.status==='synced')return['Sincronizado','success'];
  if(sync.status==='syncing')return['Sincronizando…','info'];
  if(sync.status==='conflict')return['Conflito','danger'];
  if(sync.status==='pending')return['Pendente','warning'];
  if(sync.status==='needs-init')return['Inicialização pendente','warning'];
  if(sync.status==='error')return['Falha de sincronização','danger'];
  if(sync.status==='ready')return['Pronto para sincronizar','success'];
  return['Não configurado','muted'];
}
function paintStatus(){
  if(runtime.locked)return;
  const actions=document.querySelector('.top-actions');if(!actions)return;
  let chip=document.getElementById('rm-sync-chip');
  if(!chip){chip=document.createElement('button');chip.type='button';chip.id='rm-sync-chip';chip.className='sync-chip';chip.dataset.action='sync-now';actions.insertBefore(chip,actions.firstChild)}
  const [label,kind]=statusLabel();chip.className=`sync-chip ${kind}`;chip.innerHTML=`<span class="sync-dot"></span><span>${esc(label)}</span>`;chip.title=sync.detail||label;
}
function injectStyles(){if(document.getElementById('rm-sync-style'))return;const style=document.createElement('style');style.id='rm-sync-style';style.textContent=`.sync-chip{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;min-height:36px;padding:6px 10px;display:flex;align-items:center;gap:7px;font-size:.72rem;font-weight:800}.sync-dot{width:8px;height:8px;border-radius:50%;background:currentColor}.sync-chip.success{color:var(--green)}.sync-chip.info{color:var(--primary2)}.sync-chip.warning{color:#8a6417}.sync-chip.danger{color:var(--danger)}.sync-panel-list{display:grid;gap:8px;margin-top:12px}.sync-panel-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:8px 0}.sync-panel-row:last-child{border-bottom:0}.sync-security-note{font-size:.78rem;line-height:1.55}.sync-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}`;document.head.appendChild(style)}

async function fetchRemote(token=sync.token){
  const url=`${API_ROOT}/contents/${encodeURIComponent(VAULT_PATH).replace(/%2F/g,'/')}?ref=${encodeURIComponent(DATA_BRANCH)}`;
  const response=await fetch(url,{headers:headers(token),cache:'no-store'});
  if(response.status===404)return null;
  if(response.status===401||response.status===403)throw new Error('A autorização do GitHub não permite acessar o cofre de sincronização.');
  if(!response.ok)throw new Error(`GitHub respondeu ${response.status} ao consultar o cofre.`);
  const meta=await response.json();let text='';
  if(meta.content)text=b64ToText(meta.content);
  else if(meta.download_url){const raw=await fetch(`${meta.download_url}${meta.download_url.includes('?')?'&':'?'}rm=${Date.now()}`,{cache:'no-store'});if(!raw.ok)throw new Error('Não foi possível baixar o cofre criptografado.');text=await raw.text()}
  else throw new Error('O GitHub não retornou o conteúdo do cofre.');
  const envelope=parseJson(text);if(!envelope||envelope.format!==FORMAT)throw new Error('O arquivo remoto não é um cofre clínico compatível.');
  return{sha:meta.sha,envelope};
}
async function putRemote(envelope,sha=''){
  if(!sync.token)throw new Error('Autorize este dispositivo no GitHub antes de sincronizar.');
  const url=`${API_ROOT}/contents/${encodeURIComponent(VAULT_PATH).replace(/%2F/g,'/')}`;
  const body={message:`sync clínica r${envelope.revision}`,content:textToB64(JSON.stringify(envelope)),branch:DATA_BRANCH,...(sha?{sha}:{})};
  const response=await fetch(url,{method:'PUT',headers:{...headers(sync.token),'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(response.status===409||response.status===422){const err=new Error('O cofre remoto mudou durante a sincronização.');err.code='RETRY';throw err}
  if(response.status===401||response.status===403)throw new Error('A autorização do GitHub não possui permissão de gravação em Contents.');
  if(!response.ok)throw new Error(`GitHub respondeu ${response.status} ao gravar o cofre.`);
  return response.json();
}
function validateSnapshot(snapshot){
  if(!snapshot||!['rm-local-backup','rmvault-indexed'].includes(snapshot.format)||!snapshot.meta?.vault||!snapshot.stores)throw new Error('Conteúdo clínico remoto incompatível.');
  return snapshot;
}
async function deriveSyncKey(password,salt,iterations=KDF_ITERATIONS){return deriveKey(password,salt,iterations)}
async function decryptEnvelope(envelope,key=sync.key){
  if(!key)throw new Error('Chave de sincronização indisponível. Entre novamente na plataforma.');
  try{return validateSnapshot(await decryptJson(key,{iv:envelope.crypto?.iv,data:envelope.payload},FORMAT))}catch{throw new Error('Não foi possível abrir o cofre remoto com a senha desta plataforma.')}
}
async function makeEnvelope(snapshot,revision){
  if(!sync.key||!sync.salt)throw new Error('Chave de sincronização indisponível.');
  const encrypted=await encryptJson(sync.key,snapshot,FORMAT);
  return{format:FORMAT,version:1,revision,updatedAt:iso(),deviceId:sync.deviceId,kdf:{name:'PBKDF2-SHA256',iterations:KDF_ITERATIONS,salt:bytesToB64(sync.salt)},crypto:{name:'AES-256-GCM',iv:encrypted.iv},payload:encrypted.data};
}
function latestTombstones(snapshot){const map=new Map();for(const t of snapshot?.meta?.syncTombstones||[]){if(!t?.storeName||!t?.id)continue;const k=tombstoneKey(t),prior=map.get(k);if(!prior||stamp(t.deletedAt)>stamp(prior.deletedAt))map.set(k,t)}return map}
function entityState(snapshot,store,id){
  const row=(snapshot?.stores?.[store]||[]).find(x=>x?.id===id);const tomb=latestTombstones(snapshot).get(rowKey(store,id));
  const rowStamp=stamp(row?.updatedAt),delStamp=stamp(tomb?.deletedAt);
  if(delStamp&&delStamp>=rowStamp)return{kind:'d',stamp:delStamp,row:null,tomb};
  if(row)return{kind:'r',stamp:rowStamp,row,tomb};
  return{kind:'n',stamp:'',row:null,tomb:null};
}
function buildBaseline(snapshot){
  const out={};for(const store of STORE_NAMES){const ids=new Set((snapshot?.stores?.[store]||[]).map(x=>x?.id).filter(Boolean));for(const t of snapshot?.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const id of ids){const s=entityState(snapshot,store,id);out[rowKey(store,id)]=`${s.kind}|${s.stamp}`}}
  return out;
}
function loadBaseline(){return parseJson(localStorage.getItem(BASELINE_STORAGE)||'{}')||{}}
function saveBaseline(snapshot){localStorage.setItem(BASELINE_STORAGE,JSON.stringify(buildBaseline(snapshot)))}
function conflictKeys(local,remote){
  const base=loadBaseline(),conflicts=[];
  for(const store of STORE_NAMES){const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);for(const t of local.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);for(const t of remote.meta?.syncTombstones||[])if(t.storeName===store)ids.add(t.id);
    for(const id of ids){if(!id)continue;const l=entityState(local,store,id),r=entityState(remote,store,id),b=base[rowKey(store,id)]||'n|';const ls=`${l.kind}|${l.stamp}`,rs=`${r.kind}|${r.stamp}`;if(ls!==rs&&ls!==b&&rs!==b&&b!=='n|')conflicts.push(rowKey(store,id));}
  }
  return conflicts;
}
function mergeSnapshots(local,remote){
  const merged={format:'rm-local-backup',version:Math.max(Number(local.version||0),Number(remote.version||0),3),exportedAt:iso(),meta:{...remote.meta,...local.meta},stores:{}};
  merged.meta.vault=remote.meta?.vault||local.meta?.vault;merged.meta.schemaVersion=Math.max(Number(local.meta?.schemaVersion||0),Number(remote.meta?.schemaVersion||0));
  const tombMap=new Map();for(const source of [remote,local])for(const t of source.meta?.syncTombstones||[]){const k=tombstoneKey(t),prior=tombMap.get(k);if(!prior||stamp(t.deletedAt)>stamp(prior.deletedAt))tombMap.set(k,t)}merged.meta.syncTombstones=[...tombMap.values()];
  for(const store of STORE_NAMES){const ids=new Set([...(local.stores?.[store]||[]).map(x=>x?.id),...(remote.stores?.[store]||[]).map(x=>x?.id)]);for(const t of merged.meta.syncTombstones)if(t.storeName===store)ids.add(t.id);const rows=[];for(const id of ids){if(!id)continue;const l=entityState(local,store,id),r=entityState(remote,store,id);const candidates=[l,r].sort((a,b)=>stamp(b.stamp).localeCompare(stamp(a.stamp)));const winner=candidates[0];if(winner?.kind==='r'&&winner.row)rows.push(winner.row)}merged.stores[store]=rows}
  return merged;
}
function clocksEqual(a,b){const aa=buildBaseline(a),bb=buildBaseline(b),ka=Object.keys(aa).sort(),kb=Object.keys(bb).sort();if(ka.length!==kb.length)return false;return ka.every((k,i)=>k===kb[i]&&aa[k]===bb[k])}
async function refreshMemory(){for(const name of STORE_NAMES)setStore(name,await getAllDecrypted(name,runtime.key));window.__rmRender?.();window.__rmUpdateClock?.()}
async function applySnapshot(snapshot){window.__rmSyncApplying=true;try{await importRawDatabase(snapshot);await refreshMemory()}finally{window.__rmSyncApplying=false}}
function meaningfulCount(snapshot){return ['patients','appointments','records','notes','formulations','goals','tasks','documents','payments','consents','communications'].reduce((n,s)=>n+(snapshot.stores?.[s]?.length||0),0)}

export async function tryBootstrapFromRemote(password){
  if(await vaultExists())return false;
  let remote;try{remote=await fetchRemote('')}catch(err){console.warn('Consulta inicial do cofre remoto falhou',err);return false}
  if(!remote)return false;
  const salt=b64ToBytes(remote.envelope.kdf?.salt||'');const key=await deriveSyncKey(password,salt,Number(remote.envelope.kdf?.iterations)||KDF_ITERATIONS);const snapshot=await decryptEnvelope(remote.envelope,key);
  window.__rmSyncApplying=true;try{await importRawDatabase(snapshot)}finally{window.__rmSyncApplying=false}
  localStorage.setItem(REVISION_STORAGE,String(remote.envelope.revision||0));saveBaseline(snapshot);localStorage.setItem(DIRTY_STORAGE,'0');return true;
}
async function loadStoredToken(){
  const saved=parseJson(localStorage.getItem(TOKEN_STORAGE)||'');if(!saved||!runtime.key)return'';
  try{const value=await decryptJson(runtime.key,saved,'github-sync-token');return String(value?.token||'')}catch{return''}
}
async function storeToken(token){const payload=await encryptJson(runtime.key,{token},'github-sync-token');localStorage.setItem(TOKEN_STORAGE,JSON.stringify(payload));sync.token=token}
async function testToken(token){const r=await fetch(API_ROOT,{headers:headers(token),cache:'no-store'});if(r.status===401||r.status===403)throw new Error('Token recusado pelo GitHub.');if(!r.ok)throw new Error(`Não foi possível validar o acesso ao repositório (${r.status}).`);return true}

export async function startSyncSession(password){
  let remote=null;try{remote=await fetchRemote('')}catch(err){console.warn('Cofre remoto não consultado na abertura',err)}
  if(remote){sync.remoteExists=true;sync.remoteRevision=Number(remote.envelope.revision||0);localStorage.setItem(REVISION_STORAGE,String(sync.remoteRevision));sync.salt=b64ToBytes(remote.envelope.kdf?.salt||'');sync.key=await deriveSyncKey(password,sync.salt,Number(remote.envelope.kdf?.iterations)||KDF_ITERATIONS)}
  else{sync.remoteExists=false;sync.salt=randomBytes(16);sync.key=await deriveSyncKey(password,sync.salt,KDF_ITERATIONS)}
  sync.token=await loadStoredToken();
  if(sync.remoteExists)setStatus(sync.token?'ready':'pending',sync.token?'Cofre remoto localizado.':'Cofre remoto localizado; autorize este dispositivo para sincronização automática.');
  else setStatus(sync.token?'needs-init':'pending',sync.token?'Cofre remoto ainda não inicializado. Use os dados deste notebook como base inicial.':'Autorize este dispositivo e depois inicialize o cofre a partir do notebook.');
}
async function performSync({manual=false}={}){
  if(sync.busy||runtime.locked||!runtime.dataReady)return false;if(!sync.token){setStatus('pending','Autorize este dispositivo no GitHub.');return false}
  sync.busy=true;setStatus('syncing','Comparando dados locais e remotos…');
  try{
    for(let attempt=0;attempt<3;attempt++){
      const remote=await fetchRemote(sync.token);
      if(!remote){sync.remoteExists=false;setStatus('needs-init','O cofre remoto ainda não foi inicializado.');return false}
      sync.remoteExists=true;
      const saltString=remote.envelope.kdf?.salt||'';if(bytesToB64(sync.salt)!==saltString){setStatus('error','A chave remota mudou. Saia e entre novamente na plataforma.');return false}
      const remoteSnapshot=await decryptEnvelope(remote.envelope),localSnapshot=await exportRawDatabase();
      const conflicts=conflictKeys(localSnapshot,remoteSnapshot);if(conflicts.length){sync.conflicts=conflicts;setStatus('conflict',`${conflicts.length} registro(s) foram alterados nos dois dispositivos. A sincronização automática foi pausada.`);return false}
      const merged=mergeSnapshots(localSnapshot,remoteSnapshot),localChanged=!clocksEqual(localSnapshot,merged),remoteChanged=!clocksEqual(remoteSnapshot,merged),dirty=localStorage.getItem(DIRTY_STORAGE)==='1';
      if(remoteChanged||dirty){
        const revision=Math.max(Number(remote.envelope.revision||0),sync.remoteRevision)+1,envelope=await makeEnvelope(merged,revision);
        try{await putRemote(envelope,remote.sha);sync.remoteRevision=revision}catch(err){if(err.code==='RETRY')continue;throw err}
      }else sync.remoteRevision=Number(remote.envelope.revision||0);
      if(localChanged)await applySnapshot(merged);
      saveBaseline(merged);localStorage.setItem(DIRTY_STORAGE,'0');localStorage.setItem(REVISION_STORAGE,String(sync.remoteRevision));sync.conflicts=[];setStatus('synced',`Sincronizado · revisão ${sync.remoteRevision} · ${new Date().toLocaleTimeString('pt-BR')}`);return true;
    }
    throw new Error('Houve atualizações concorrentes repetidas. Tente sincronizar novamente.');
  }catch(err){console.error('Falha de sincronização',err);setStatus(navigator.onLine?'error':'pending',navigator.onLine?(err.message||'Falha de sincronização.'):'Sem internet. As alterações permanecem neste dispositivo.');if(manual)toast(err.message||'Não foi possível sincronizar.','error');return false}
  finally{sync.busy=false}
}
async function initializeRemote(){
  if(sync.busy)return;sync.busy=true;setStatus('syncing','Preparando primeira cópia criptografada…');
  try{
    if(!sync.token)throw new Error('Autorize este dispositivo no GitHub primeiro.');const existing=await fetchRemote(sync.token);if(existing)throw new Error('Já existe um cofre remoto. Use Sincronizar agora em vez de inicializar.');
    const local=await exportRawDatabase(),count=meaningfulCount(local);if(count===0)throw new Error('Este dispositivo está sem dados clínicos. A inicialização remota foi bloqueada para evitar uma base vazia.');
    const revision=1,envelope=await makeEnvelope(local,revision);await putRemote(envelope);sync.remoteExists=true;sync.remoteRevision=revision;saveBaseline(local);localStorage.setItem(DIRTY_STORAGE,'0');localStorage.setItem(REVISION_STORAGE,'1');setStatus('synced',`Base inicial protegida e sincronizada · ${count} registro(s).`);toast('Cofre remoto inicializado com os dados deste notebook.','success');
  }catch(err){setStatus('error',err.message||'Não foi possível inicializar.');toast(err.message||'Não foi possível inicializar a sincronização.','error')}
  finally{sync.busy=false}
}
function schedulePush(){if(!sync.token||!sync.remoteExists||runtime.locked)return;clearTimeout(sync.pushTimer);sync.pushTimer=setTimeout(()=>performSync(),PUSH_DEBOUNCE_MS)}
function startPolling(){if(sync.timer)clearInterval(sync.timer);sync.timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)performSync()},POLL_MS)}

function tokenModal(){modal('Autorizar sincronização neste dispositivo',`<div class="notice"><strong>O token fica somente neste dispositivo</strong> e é armazenado criptografado com a chave local da plataforma. Ele não é enviado ao repositório nem incluído nos backups clínicos.</div><div class="field mt-16"><label>GitHub Fine-grained Personal Access Token</label><input id="rm-sync-token-input" class="input" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></div><div class="small muted mt-12">Use um token restrito ao repositório <strong>${OWNER}/${REPO}</strong>, com permissão de leitura e gravação em <strong>Contents</strong>. Configure o mesmo tipo de autorização separadamente no notebook e no celular.</div>`,`<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="sync-save-token">Autorizar dispositivo</button>`,true)}
async function saveTokenFromModal(){const token=document.getElementById('rm-sync-token-input')?.value.trim();if(!token)throw new Error('Cole o token do GitHub.');await testToken(token);await storeToken(token);closeModal();setStatus(sync.remoteExists?'ready':'needs-init',sync.remoteExists?'Dispositivo autorizado.':'Dispositivo autorizado. Inicialize o cofre usando este notebook.');paintSettings();if(sync.remoteExists)await performSync({manual:true})}
function disconnectToken(){if(!confirm('Remover a autorização do GitHub apenas deste dispositivo? Os dados clínicos locais não serão apagados.'))return;localStorage.removeItem(TOKEN_STORAGE);sync.token='';setStatus('pending','Autorização removida deste dispositivo.');paintSettings()}
function showConflicts(){modal('Conflito de sincronização',`<div class="notice warning">A plataforma não sobrescreveu silenciosamente registros que foram modificados nos dois dispositivos desde a última sincronização.</div><p class="mt-16">Registros em conflito:</p><div class="list">${sync.conflicts.map(x=>`<div class="list-item"><span>${esc(x)}</span><span class="badge warning">Revisar</span></div>`).join('')}</div><p class="small muted mt-16">Para preservar a segurança clínica, mantenha apenas um dispositivo editando o mesmo registro por vez. Feche esta janela, escolha o dispositivo cuja versão deseja preservar e faça nova sincronização após revisar o registro.</p>`,`<button class="btn" data-action="close-modal">Fechar</button>`,true)}
function settingsMarkup(){const [label]=statusLabel(),rev=sync.remoteRevision||'—';return`<h3>Sincronização segura notebook ↔ celular</h3><div class="sync-panel-list"><div class="sync-panel-row"><span>Estado</span><strong>${esc(label)}</strong></div><div class="sync-panel-row"><span>Cofre remoto</span><strong>${sync.remoteExists?'Inicializado':'Ainda não inicializado'}</strong></div><div class="sync-panel-row"><span>Dispositivo autorizado</span><strong>${sync.token?'Sim':'Não'}</strong></div><div class="sync-panel-row"><span>Revisão remota</span><strong>${esc(rev)}</strong></div><div class="sync-panel-row"><span>Armazenamento remoto</span><strong>GitHub · branch ${DATA_BRANCH}</strong></div></div><p class="muted sync-security-note mt-12">Todos os dados clínicos — inclusive nome, CPF, RG, endereço, fotos, agenda e prontuário — são enviados somente dentro de um cofre integralmente cifrado com AES-256-GCM. Nenhum token ou senha é gravado no repositório.</p><div class="sync-actions"><button class="btn secondary" data-action="sync-config-token">${sync.token?'Trocar autorização':'Autorizar este dispositivo'}</button>${!sync.remoteExists?'<button class="btn" data-action="sync-initialize">Inicializar com os dados deste notebook</button>':'<button class="btn" data-action="sync-now">Sincronizar agora</button>'}${sync.token?'<button class="btn ghost" data-action="sync-disconnect">Remover autorização local</button>':''}${sync.conflicts.length?'<button class="btn danger" data-action="sync-conflicts">Ver conflitos</button>':''}</div><div class="notice mt-16">${esc(sync.detail)}</div>`}
function paintSettings(){if(runtime.locked||runtime.route!=='settings')return;setTimeout(()=>{let card=document.querySelector('#rm-portable-tools .card:last-child');if(!card){const main=document.getElementById('main-content');if(!main)return;let section=document.getElementById('rm-secure-sync-panel');if(!section){section=document.createElement('section');section.id='rm-secure-sync-panel';section.className='card mt-16';main.appendChild(section)}card=section}card.innerHTML=settingsMarkup()},25)}

export function activateSyncRuntime(){injectStyles();paintStatus();paintSettings();startPolling();if(sync.token&&sync.remoteExists)performSync();else if(!sync.remoteExists)setStatus(sync.token?'needs-init':'pending',sync.token?'Inicialize o cofre remoto a partir deste notebook.':'Autorize este dispositivo para configurar a sincronização.')}

document.addEventListener('rm:data-ready',()=>activateSyncRuntime());
document.addEventListener('rm:rendered',()=>{paintStatus();paintSettings()});
document.addEventListener('rm:local-data-changed',()=>{if(window.__rmSyncApplying)return;localStorage.setItem(DIRTY_STORAGE,'1');if(sync.remoteExists){setStatus('pending','Alteração local aguardando sincronização.');schedulePush()}});
window.addEventListener('online',()=>{if(sync.token&&sync.remoteExists)performSync()});
window.addEventListener('focus',()=>{if(sync.token&&sync.remoteExists&&runtime.dataReady)performSync()});
document.addEventListener('click',async e=>{const el=e.target.closest?.('[data-action]');if(!el)return;const a=el.dataset.action;if(!['sync-config-token','sync-save-token','sync-initialize','sync-now','sync-disconnect','sync-conflicts'].includes(a))return;e.preventDefault();e.stopImmediatePropagation();try{if(a==='sync-config-token')tokenModal();else if(a==='sync-save-token')await saveTokenFromModal();else if(a==='sync-initialize')await initializeRemote();else if(a==='sync-now')await performSync({manual:true});else if(a==='sync-disconnect')disconnectToken();else if(a==='sync-conflicts')showConflicts()}catch(err){toast(err.message||'Não foi possível concluir a ação.','error')}},true);
