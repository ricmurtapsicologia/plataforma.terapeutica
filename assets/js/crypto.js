const enc=new TextEncoder(),dec=new TextDecoder();
export function isCryptoKey(value){
  if(!value)return false;
  if(typeof CryptoKey!=='undefined'&&value instanceof CryptoKey)return true;
  return Object.prototype.toString.call(value)==='[object CryptoKey]';
}
function requireCryptoKey(key){
  if(!isCryptoKey(key))throw new Error('O cofre está bloqueado ou a chave de criptografia não está disponível. Desbloqueie o cofre e tente novamente.');
}
export const bytesToB64=bytes=>{let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s)};
export const b64ToBytes=value=>{const s=atob(value),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out};
export const randomBytes=n=>crypto.getRandomValues(new Uint8Array(n));
export async function deriveKey(password,salt,iterations=310000){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
export async function encryptJson(key,value,aad=''){requireCryptoKey(key);const iv=randomBytes(12);const additionalData=aad?enc.encode(aad):undefined;const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,enc.encode(JSON.stringify(value)));return{iv:bytesToB64(iv),data:bytesToB64(cipher)}}
export async function decryptJson(key,payload,aad=''){requireCryptoKey(key);const additionalData=aad?enc.encode(aad):undefined;const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(payload.iv),additionalData},key,b64ToBytes(payload.data));return JSON.parse(dec.decode(plain))}
export async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',enc.encode(typeof value==='string'?value:JSON.stringify(value)));return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function makeVerifier(key){return encryptJson(key,{ok:true,product:'rm-clinica'},'vault-verifier')}
export async function verifyKey(key,verifier){const v=await decryptJson(key,verifier,'vault-verifier');return v?.ok===true&&v.product==='rm-clinica'}
export async function encryptWithPin(value,pin){const salt=randomBytes(16),key=await deriveKey(pin,salt,220000),payload=await encryptJson(key,value,'rm-protected-export');return{format:'rm-pin-aesgcm',version:1,salt:bytesToB64(salt),iterations:220000,...payload}}
export async function decryptWithPin(payload,pin){const key=await deriveKey(pin,b64ToBytes(payload.salt),payload.iterations||220000);return decryptJson(key,payload,'rm-protected-export')}
