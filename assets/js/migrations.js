import {SCHEMA_VERSION,data,uid,nowISO} from './state.js';
import {getMeta,setMeta,putEncrypted,bulkPutEncrypted} from './database.js';
import {deriveKey,b64ToBytes,decryptJson} from './crypto.js';

export async function runMigrations(key){
  let version=Number(await getMeta('schemaVersion')||1);
  if(version<2){
    for(const p of Array.isArray(data.patients)?data.patients:[]){p.communicationPreferences??={channel:'WhatsApp',whatsappConsent:false,emailConsent:false,silentStart:'20:00',silentEnd:'08:00'};await putEncrypted('patients',p,key)}
    version=2;await setMeta('schemaVersion',version);
  }
  if(version<3){
    for(const r of Array.isArray(data.records)?data.records:[]){r.addenda??=[];await putEncrypted('records',r,key)}
    version=3;await setMeta('schemaVersion',version);
  }
  if(version<4){
    for(const p of Array.isArray(data.patients)?data.patients:[]){p.address??={};p.sessionRecurrence||='Avulso';p.photo||='';await putEncrypted('patients',p,key)}
    for(const a of Array.isArray(data.appointments)?data.appointments:[]){a.recurrence||='Avulso';a.seriesId||='';await putEncrypted('appointments',a,key)}
    version=4;await setMeta('schemaVersion',version);
  }
  if(version<5){version=5;await setMeta('schemaVersion',version)}
  if(version<SCHEMA_VERSION){version=SCHEMA_VERSION;await setMeta('schemaVersion',version)}
  return version;
}

export function legacyVaultAvailable(){return Boolean(localStorage.getItem('richelmyMurtaClinicalVault.v2'))}
export async function importLegacyVault(password,newKey){const raw=localStorage.getItem('richelmyMurtaClinicalVault.v2');if(!raw)throw new Error('Nenhum cofre antigo foi encontrado.');let payload;try{payload=JSON.parse(raw)}catch{throw new Error('O cofre antigo está corrompido.')}const oldKey=await deriveKey(password,b64ToBytes(payload.salt),250000);let oldState;try{oldState=await decryptJson(oldKey,{iv:payload.iv,data:payload.ciphertext})}catch{throw new Error('Senha do cofre antigo incorreta.')}const mapping={patients:'patients',appointments:'appointments',records:'records',goals:'goals',tasks:'tasks',materials:'materials',documents:'documents',payments:'payments',consents:'consents',communications:'communications'};for(const [oldName,newName] of Object.entries(mapping)){const items=Array.isArray(oldState[oldName])?oldState[oldName]:[];for(const item of items){item.id||=uid(newName.slice(0,3));item.updatedAt||=nowISO()}if(items.length)await bulkPutEncrypted(newName,items,newKey)}localStorage.setItem('rm.legacy.importedAt',nowISO());return true}
