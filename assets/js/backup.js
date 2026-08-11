import {exportRawDatabase,importRawDatabase,rawStoreCounts,getMeta,setMeta} from './database.js';
import {STORE_NAMES} from './state.js';
import {safeJson,assert} from './validation.js';

const requestAsPromise=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Falha na operação de teste.'))});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Falha na transação de teste.'));tx.onabort=()=>reject(tx.error||new Error('Transação de teste interrompida.'))});
const stable=value=>{
  if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
};
const canonicalRows=rows=>stable([...(Array.isArray(rows)?rows:[])].sort((a,b)=>String(a?.id||'').localeCompare(String(b?.id||''))));

function openIsolatedDatabase(name){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      db.createObjectStore('meta',{keyPath:'key'});
      for(const storeName of STORE_NAMES){
        const store=db.createObjectStore(storeName,{keyPath:'id'});
        store.createIndex('patientId','patientId',{unique:false});
        store.createIndex('updatedAt','updatedAt',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Não foi possível criar o banco isolado de teste.'));
    req.onblocked=()=>reject(new Error('O teste de restore foi bloqueado pelo navegador.'));
  });
}
function deleteIsolatedDatabase(name){
  return new Promise(resolve=>{
    const req=indexedDB.deleteDatabase(name);
    req.onsuccess=()=>resolve();
    req.onerror=()=>resolve();
    req.onblocked=()=>resolve();
  });
}
async function isolatedRestoreTest(payload){
  assert(typeof indexedDB!=='undefined','Este navegador não oferece IndexedDB para testar a restauração.');
  const suffix=crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const dbName=`rm-p0-restore-test-${suffix}`;
  let db=null;
  try{
    db=await openIsolatedDatabase(dbName);
    const names=['meta',...STORE_NAMES],tx=db.transaction(names,'readwrite'),done=txDone(tx);
    const meta=tx.objectStore('meta');
    for(const [key,value] of Object.entries(payload.meta||{}))meta.put({key,value});
    for(const storeName of STORE_NAMES){
      const store=tx.objectStore(storeName);
      for(const row of payload.stores?.[storeName]||[])store.put(row);
    }
    await done;

    const counts={};
    const metaTx=db.transaction('meta','readonly'),metaDone=txDone(metaTx),vaultRow=await requestAsPromise(metaTx.objectStore('meta').get('vault'));await metaDone;
    assert(vaultRow&&stable(vaultRow.value)===stable(payload.meta.vault),'O cofre restaurado não preservou os metadados do vault.');

    for(const storeName of STORE_NAMES){
      const readTx=db.transaction(storeName,'readonly'),readDone=txDone(readTx),rows=await requestAsPromise(readTx.objectStore(storeName).getAll());await readDone;
      const expected=payload.stores?.[storeName]||[];
      counts[storeName]=rows.length;
      assert(rows.length===expected.length,`Restore divergente em ${storeName}: esperado ${expected.length}, obtido ${rows.length}.`);
      assert(canonicalRows(rows)===canonicalRows(expected),`Restore divergente no conteúdo de ${storeName}.`);
    }
    return{ok:true,counts,testedAt:new Date().toISOString()};
  }finally{
    try{db?.close()}catch{}
    await deleteIsolatedDatabase(dbName);
  }
}

export function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
export async function createBackup(){const payload=await exportRawDatabase(),text=JSON.stringify(payload),blob=new Blob([text],{type:'application/json'}),date=new Date().toISOString().slice(0,10);downloadBlob(blob,`richelmy-clinica-${date}.rmvault`);await setMeta('lastBackupAt',new Date().toISOString());return{size:blob.size,payload}}
export async function verifyBackupFile(file){
  assert(file&&file.size>0,'Selecione um arquivo de backup.');
  assert(file.size<100_000_000,'O arquivo excede 100 MB.');
  const payload=safeJson(await file.text(),100_000_000);
  assert(['rm-local-backup','rmvault-indexed'].includes(payload.format),'Formato de backup incompatível.');
  assert(payload.meta?.vault,'O backup não contém metadados locais válidos.');
  assert(payload.stores&&typeof payload.stores==='object','O backup não contém as áreas de dados.');
  const restoreTest=await isolatedRestoreTest(payload);
  const result={payload,size:file.size,exportedAt:payload.exportedAt,counts:Object.fromEntries(STORE_NAMES.map(k=>[k,Array.isArray(payload.stores[k])?payload.stores[k].length:0])),restoreTest};
  localStorage.setItem('rm.p0.restoreTest.v1',JSON.stringify({ok:true,testedAt:restoreTest.testedAt,exportedAt:payload.exportedAt||null,size:file.size,counts:restoreTest.counts}));
  document.dispatchEvent(new CustomEvent('rm:backup-restore-test',{detail:{ok:true,testedAt:restoreTest.testedAt,counts:restoreTest.counts}}));
  return result;
}
export async function restoreBackup(file){const checked=await verifyBackupFile(file);await importRawDatabase(checked.payload);return checked}
export async function backupStatus(){const lastBackupAt=await getMeta('lastBackupAt'),counts=await rawStoreCounts();const days=lastBackupAt?Math.floor((Date.now()-Date.parse(lastBackupAt))/86400000):null;return{lastBackupAt,days,counts}}
