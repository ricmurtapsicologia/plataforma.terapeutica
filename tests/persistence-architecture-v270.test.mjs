import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../assets/js/database.js',import.meta.url),'utf8');
function body(name,next){
  const start=src.indexOf(`export async function ${name}`);
  assert.ok(start>=0,`${name} deve existir`);
  const end=next?src.indexOf(`export async function ${next}`,start+1):src.length;
  return src.slice(start,end<0?src.length:end);
}
const put=body('putEncrypted','bulkPutEncrypted');
assert.ok(put.indexOf('prepareEncryptedRow')<put.indexOf("db.transaction([storeName,'meta'],'readwrite')"),'putEncrypted deve criptografar antes de abrir a transação');
assert.ok(put.includes('clearTombstonesInTransaction'),'putEncrypted deve remover tombstone na mesma transação');
const bulk=body('bulkPutEncrypted','getDecryptedById');
assert.ok(bulk.indexOf('prepareBatch')<bulk.indexOf("db.transaction([storeName,'meta'],'readwrite')"),'bulkPutEncrypted deve criptografar o lote antes de abrir a transação');
assert.ok(bulk.includes('clearTombstonesInTransaction'),'bulkPutEncrypted deve remover tombstones na mesma transação');
const atomic=body('bulkPutEncryptedAtomic','getAllDecrypted');
assert.ok(atomic.indexOf('prepareBatch')<atomic.indexOf("db.transaction(names,'readwrite')"),'bulkPutEncryptedAtomic deve preparar todos os lotes antes da transação multi-store');
assert.ok(atomic.includes("names=['meta',...stores]"),'gravação atômica multi-store deve incluir meta/tombstones');
const txSegment=atomic.slice(atomic.indexOf("db.transaction(names,'readwrite')"),atomic.indexOf('await done;'));
assert.equal(/await\s+(?:encryptJson|prepareBatch|prepareEncryptedRow)/.test(txSegment),false,'não pode haver WebCrypto await dentro da janela transacional');
assert.ok(atomic.includes('getDecryptedById')&&atomic.includes('Falha de verificação após gravação'),'gravação atômica deve suportar read-back verificável');
const all=body('getAllDecrypted','deleteRecord');
assert.ok(all.includes('RM_STORE_DECRYPTION_FAILURE')&&!all.includes('return decoded.filter(Boolean)'),'falha de descriptografia não pode ser silenciosamente descartada');
const del=body('deleteRecord','clearStore');
assert.ok(del.includes("db.transaction([storeName,'meta'],'readwrite')")&&del.includes('recordTombstonesInTransaction'),'deleteRecord e tombstone devem ser atômicos');
const clear=body('clearStore','clearAll');
assert.ok(clear.includes("db.transaction([storeName,'meta'],'readwrite')")&&clear.includes('recordTombstonesInTransaction'),'clearStore e tombstones devem ser atômicos');
console.log('persistence-architecture-v270: 10 assertions passed');
