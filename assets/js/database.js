import {STORE_NAMES,SCHEMA_VERSION} from './state.js';
import {encryptJson,decryptJson,bytesToB64,b64ToBytes,randomBytes,deriveKey,makeVerifier,verifyKey} from './crypto.js';

const DB_NAME='richelmy-plataforma-db-v2';
const DB_VERSION=4;
const ACCESS_PIN_SHA256='bd15594e672a0eba1bf38436c9752c5456bcb2bd42c4bed91d8eb6911e0af1ca';
let dbPromise=null;

async function sha256Hex(value=''){
  const bytes=new TextEncoder().encode(String(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function assertOperationalPin(password){if(await sha256Hex(password)!==ACCESS_PIN_SHA256)throw new Error('Senha incorreta.');}

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

export async function vaultExists(){return Boolean(await getMeta('vault'))}
export async function createVault(password){await assertOperationalPin(password);const salt=randomBytes(16),key=await deriveKey(password,salt),verifier=await makeVerifier(key);await setMeta('vault',{format:'rm-local-data',version:2,salt:bytesToB64(salt),iterations:310000,verifier,createdAt:new Date().toISOString()});await setMeta('schemaVersion',SCHEMA_VERSION);return{key,salt}}
export async function unlockVault(password){await assertOperationalPin(password);const vault=await getMeta('vault');if(!vault)return createVault(password);const salt=b64ToBytes(vault.salt),key=await deriveKey(password,salt,vault.iterations||310000);try{if(!await verifyKey(key,vault.verifier))throw new Error()}catch{throw new Error('Não foi possível abrir os dados locais com esta senha.')}return{key,salt}}

export async function putEncrypted(storeName,value,key){if(!STORE_NAMES.includes(storeName))throw new Error('Área de dados inválida.');if(!value?.id)throw new Error('Registro sem identificador.');const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx),aad=`${storeName}:${value.id}`,encrypted=await encryptJson(key,value,aad);tx.objectStore(storeName).put({id:value.id,patientId:value.patientId||'',updatedAt:value.updatedAt||new Date().toISOString(),encrypted});await done;return value}
export async function bulkPutEncrypted(storeName,values,key){const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx),store=tx.objectStore(storeName);for(const value of values){const aad=`${storeName}:${value.id}`,encrypted=await encryptJson(key,value,aad);store.put({id:value.id,patientId:value.patientId||'',updatedAt:value.updatedAt||new Date().toISOString(),encrypted})}await done}
export async function getAllDecrypted(storeName,key){
  const db=await openDatabase();
  if(!db.objectStoreNames.contains(storeName))return[];
  const tx=db.transaction(storeName,'readonly'),done=txDone(tx),rows=await requestAsPromise(tx.objectStore(storeName).getAll());
  await done;
  const decoded=await Promise.all(rows.map(async row=>{try{return await decryptJson(key,row.encrypted,`${storeName}:${row.id}`)}catch(err){console.error('Registro não pôde ser lido',storeName,row.id,err);return null}}));
  return decoded.filter(Boolean);
}
export async function deleteRecord(storeName,id){const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx);tx.objectStore(storeName).delete(id);await done}
export async function clearStore(storeName){const db=await openDatabase(),tx=db.transaction(storeName,'readwrite'),done=txDone(tx);tx.objectStore(storeName).clear();await done}
export async function clearAll(){const db=await openDatabase(),tx=db.transaction(['meta',...STORE_NAMES],'readwrite'),done=txDone(tx);tx.objectStore('meta').clear();for(const s of STORE_NAMES)tx.objectStore(s).clear();await done}

export async function exportRawDatabase(){const db=await openDatabase(),stores={};for(const name of STORE_NAMES){if(!db.objectStoreNames.contains(name)){stores[name]=[];continue}const tx=db.transaction(name,'readonly'),done=txDone(tx);stores[name]=await requestAsPromise(tx.objectStore(name).getAll());await done}return{format:'rm-local-backup',version:3,exportedAt:new Date().toISOString(),meta:await getAllMeta(),stores}}
export async function importRawDatabase(payload){if(!['rm-local-backup','rmvault-indexed'].includes(payload?.format)||!payload.meta?.vault||!payload.stores)throw new Error('Backup incompatível.');const db=await openDatabase(),names=['meta',...STORE_NAMES].filter(n=>n==='meta'||db.objectStoreNames.contains(n)),tx=db.transaction(names,'readwrite'),done=txDone(tx);tx.objectStore('meta').clear();for(const [key,value] of Object.entries(payload.meta))tx.objectStore('meta').put({key,value});for(const name of STORE_NAMES){if(!db.objectStoreNames.contains(name))continue;const store=tx.objectStore(name);store.clear();for(const row of payload.stores[name]||[])store.put(row)}await done}
export async function rawStoreCounts(){const db=await openDatabase(),out={};for(const name of STORE_NAMES){if(!db.objectStoreNames.contains(name)){out[name]=0;continue}const tx=db.transaction(name,'readonly'),done=txDone(tx);out[name]=await requestAsPromise(tx.objectStore(name).count());await done}return out}
export async function dumpDecrypted(key){const out={};for(const name of STORE_NAMES)out[name]=await getAllDecrypted(name,key);return out}
export async function deleteDatabase(){const db=await openDatabase();try{db.close()}catch{}dbPromise=null;return new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase(DB_NAME);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Feche outras abas antes de excluir os dados locais.'))})}
