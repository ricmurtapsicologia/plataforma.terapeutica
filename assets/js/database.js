import {STORE_NAMES,SCHEMA_VERSION} from './state.js';
import {encryptJson,decryptJson,bytesToB64,b64ToBytes,randomBytes,deriveKey,makeVerifier,verifyKey} from './crypto.js';

const DB_NAME='richelmy-plataforma-db-v2';
const DB_VERSION=4;
const NEW_VAULT_ITERATIONS=600000;
let dbPromise=null;

function notifyChange(storeName,id='',kind='put'){
  if(globalThis.__rmSyncApplying)return;
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName,id,kind,at:new Date().toISOString()}}));
}

export function resetDatabaseConnection(){dbPromise=null;}
export function openDatabase(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    let settled=false;
    const fail=err=>{if(settled)return;settled=true;dbPromise=null;reject(err)};
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
      for(const name of STORE_NAMES){
        if(!db.objectStoreNames.contains(name)){
          const store=db.createObjectStore(name,{keyPath:'id'});
          store.createIndex('patientId','patientId',{unique:false});
          store.createIndex('updatedAt','updatedAt',{unique:false});
        }
      }
    };
    req.onsuccess=()=>{
      if(settled){try{req.result.close()}catch{};return}
      settled=true;
      const db=req.result;
      db.onversionchange=()=>{try{db.close()}catch{};dbPromise=null};
      db.onclose=()=>{dbPromise=null};
      resolve(db);
    };
    req.onerror=()=>fail(req.error||new Error('Falha ao abrir os dados locais.'));
    req.onblocked=()=>fail(new Error('A atualização dos dados locais foi bloqueada por outra aba. Feche outras abas desta plataforma e tente novamente.'));
  });
  return dbPromise;
}
const requestAsPromise=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Falha na operação local.'))});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Falha na transação local.'));tx.onabort=()=>reject(tx.error||new Error('Transação interrompida.'))});

export async function getMeta(key){const db=await openDatabase(),tx=db.transaction('meta','readonly'),done=txDone(tx),value=await requestAsPromise(tx.objectStore('meta').get(key));await done;return value?.value}
export async function setMeta(key,value){const db=await openDatabase(),tx=db.transaction('meta','readwrite'),done=txDone(tx);tx.objectStore('meta').put({key,value});await done}
export async function getAllMeta(){const db=await openDatabase(),tx=db.transaction('meta','readonly'),done=txDone(tx),all=await requestAsPromise(tx.objectStore('meta').getAll());await done;return Object.fromEntries(all.map(x=>[x.key,x.value]))}

async function clearTombstone(storeName,id){
  if(!id)return;
  const current=await getMeta('syncTombstones');
  if(!Array.isArray(current)||!current.some(t=>t?.storeName===storeName&&t?.id===id))return;
  await setMeta('syncTombstones',current.filter(t=>!(t?.storeName===storeName&&t?.id===id)));
}
async function clearTombstones(entries){
  const pairs=entries.filter(x=>x?.storeName&&x?.id);
  if(!pairs.length)return;
  const current=await getMeta('syncTombstones');
  if(!Array.isArray(current)||!current.length)return;
  const keys=new Set(pairs.map(x=>`${x.storeName}:${x.id}`));
  const next=current.filter(t=>!keys.has(`${t?.storeName||''}:${t?.id||''}`));
  if(next.length!==current.length)await setMeta('syncTombstones',next);
}
async function recordTombstone(storeName,id){
  if(!id)return;
  const saved=await getMeta('syncTombstones'),current=Array.isArray(saved)?[...saved]:[];
  const deletedAt=new Date().toISOString(),filtered=current.filter(t=>!(t?.storeName===storeName&&t?.id===id));
  filtered.push({storeName,id,deletedAt});await setMeta('syncTombstones',filtered.slice(-10000));
}

function validateWrite(storeName,value){
  if(!STORE_NAMES.includes(storeName))throw new Error('Área de dados inválida.');
  if(!value?.id)throw new Error('Registro sem identificador.');
}
async function prepareEncryptedRow(storeName,value,key){
  validateWrite(storeName,value);
  const aad=`${storeName}:${value.id}`;
  const encrypted=await encryptJson(key,value,aad);
  return{storeName,id:value.id,value,row:{id:value.id,patientId:value.patientId||'',updatedAt:value.updatedAt||new Date().toISOString(),encrypted}};
}
async function prepareBatch(storeName,values,key){
  if(!Array.isArray(values))throw new Error('Lote de gravação inválido.');
  const ids=new Set();
  for(const value of values){validateWrite(storeName,value);if(ids.has(value.id))throw new Error(`Registro duplicado no lote: ${storeName}:${value.id}`);ids.add(value.id)}
  return Promise.all(values.map(value=>prepareEncryptedRow(storeName,value,key)));
}
function stable(value){
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function vaultExists(){return Boolean(await getMeta('vault'))}
export async function createVault(password){
  if(!password)throw new Error('Digite a senha.');
  const salt=randomBytes(16),key=await deriveKey(password,salt,NEW_VAULT_ITERATIONS),verifier=await makeVerifier(key);
  await setMeta('vault',{format:'rm-local-data',version:3,salt:bytesToB64(salt),iterations:NEW_VAULT_ITERATIONS,verifier,createdAt:new Date().toISOString()});
  await setMeta('schemaVersion',SCHEMA_VERSION);return{key,salt};
}
export async function unlockVault(password){
  if(!password)throw new Error('Digite a senha.');
  const vault=await getMeta('vault');if(!vault)return createVault(password);
  const salt=b64ToBytes(vault.salt),key=await deriveKey(password,salt,vault.iterations||310000);
  try{if(!await verifyKey(key,vault.verifier))throw new Error()}catch{throw new Error('Senha incorreta ou cofre local incompatível.')}
  return{key,salt};
}

export async function putEncrypted(storeName,value,key){
  const prepared=await prepareEncryptedRow(storeName,value,key);
  const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx);
  tx.objectStore(storeName).put(prepared.row);
  await done;
  await clearTombstone(storeName,value.id);
  notifyChange(storeName,value.id,'put');
  return value;
}
export async function bulkPutEncrypted(storeName,values,key){
  const prepared=await prepareBatch(storeName,values,key);
  if(!prepared.length)return;
  const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx),store=tx.objectStore(storeName);
  for(const item of prepared)store.put(item.row);
  await done;
  await clearTombstones(prepared);
  notifyChange(storeName,'','bulk');
}
export async function getDecryptedById(storeName,id,key){
  if(!STORE_NAMES.includes(storeName))throw new Error('Área de dados inválida.');
  if(!id)return null;
  const db=await openDatabase(),tx=db.transaction(storeName,'readonly'),done=txDone(tx),row=await requestAsPromise(tx.objectStore(storeName).get(id));
  await done;
  if(!row)return null;
  return decryptJson(key,row.encrypted,`${storeName}:${id}`);
}
export async function bulkPutEncryptedAtomic(batches,key,{verify=false}={}){
  const source=Array.isArray(batches)?batches:[];
  const normalized=[];
  const stores=new Set();
  for(const batch of source){
    const storeName=batch?.storeName,values=Array.isArray(batch?.values)?batch.values:[];
    if(!values.length)continue;
    const items=await prepareBatch(storeName,values,key);
    normalized.push(...items);stores.add(storeName);
  }
  if(!normalized.length)return{counts:{},verified:true};
  const db=await openDatabase(),names=[...stores],tx=db.transaction(names,'readwrite'),done=txDone(tx);
  for(const item of normalized)tx.objectStore(item.storeName).put(item.row);
  await done;
  await clearTombstones(normalized);
  const counts={};for(const item of normalized)counts[item.storeName]=(counts[item.storeName]||0)+1;
  if(verify){
    for(const item of normalized){
      const readback=await getDecryptedById(item.storeName,item.id,key);
      if(!readback||stable(readback)!==stable(item.value))throw new Error(`Falha de verificação após gravação: ${item.storeName}:${item.id}`);
    }
  }
  for(const storeName of stores)notifyChange(storeName,'','bulk');
  return{counts,verified:true};
}
export async function getAllDecrypted(storeName,key){
  const db=await openDatabase();if(!db.objectStoreNames.contains(storeName))return[];
  const tx=db.transaction(storeName,'readonly'),done=txDone(tx),rows=await requestAsPromise(tx.objectStore(storeName).getAll());await done;
  const decoded=await Promise.all(rows.map(async row=>{try{return await decryptJson(key,row.encrypted,`${storeName}:${row.id}`)}catch(err){console.error('Registro não pôde ser lido',storeName,row.id,err);return null}}));return decoded.filter(Boolean);
}
export async function deleteRecord(storeName,id){const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx);tx.objectStore(storeName).delete(id);await done;await recordTombstone(storeName,id);notifyChange(storeName,id,'delete')}
export async function clearStore(storeName){
  const db=await openDatabase(),readTx=db.transaction(storeName,'readonly'),readDone=txDone(readTx),rows=await requestAsPromise(readTx.objectStore(storeName).getAll());await readDone;
  const tx=db.transaction(storeName,'readwrite'),done=txDone(tx);tx.objectStore(storeName).clear();await done;for(const row of rows)await recordTombstone(storeName,row.id);notifyChange(storeName,'','clear');
}
export async function clearAll(){const db=await openDatabase(),tx=db.transaction(['meta',...STORE_NAMES],'readwrite'),done=txDone(tx);tx.objectStore('meta').clear();for(const s of STORE_NAMES)tx.objectStore(s).clear();await done;if(!globalThis.__rmSyncApplying)document.dispatchEvent(new CustomEvent('rm:local-data-cleared'))}

export async function exportRawDatabase(){const db=await openDatabase(),stores={};for(const name of STORE_NAMES){if(!db.objectStoreNames.contains(name)){stores[name]=[];continue}const tx=db.transaction(name,'readonly'),done=txDone(tx);stores[name]=await requestAsPromise(tx.objectStore(name).getAll());await done}return{format:'rm-local-backup',version:4,exportedAt:new Date().toISOString(),meta:await getAllMeta(),stores}}
export async function importRawDatabase(payload){
  if(!['rm-local-backup','rmvault-indexed'].includes(payload?.format)||!payload.meta?.vault||!payload.stores)throw new Error('Backup incompatível.');
  const db=await openDatabase(),names=['meta',...STORE_NAMES].filter(n=>n==='meta'||db.objectStoreNames.contains(n)),tx=db.transaction(names,'readwrite'),done=txDone(tx);tx.objectStore('meta').clear();for(const [key,value] of Object.entries(payload.meta))tx.objectStore('meta').put({key,value});for(const name of STORE_NAMES){if(!db.objectStoreNames.contains(name))continue;const store=tx.objectStore(name);store.clear();for(const row of payload.stores[name]||[])store.put(row)}await done;
}
export async function rawStoreCounts(){const db=await openDatabase(),out={};for(const name of STORE_NAMES){if(!db.objectStoreNames.contains(name)){out[name]=0;continue}const tx=db.transaction(name,'readonly'),done=txDone(tx);out[name]=await requestAsPromise(tx.objectStore(name).count());await done}return out}
export async function dumpDecrypted(key){const out={};for(const name of STORE_NAMES)out[name]=await getAllDecrypted(name,key);return out}
export async function deleteDatabase(){const db=await openDatabase();try{db.close()}catch{}dbPromise=null;return new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(DB_NAME);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Feche outras abas antes de excluir os dados locais.'))})}
