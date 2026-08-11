import {STORE_NAMES,runtime} from './state.js';
import {exportRawDatabase} from './database.js';
import {b64ToBytes,decryptJson} from './crypto.js';
import {toast} from './ui.js';
import {readPrivateVault} from './drive-appdata-storage-v260.js';
import {conflictKeys,entityState,parseConflictKey,stamp} from './sync-merge-v260.mjs';

const FORMAT='rm-clinic-sync-v2';
const SECRET_STORAGE='rm.sync.secret.v1';
const BASELINE_STORAGE='rm.sync.drive.baseline.v260';
const parseJson=v=>{try{return JSON.parse(v)}catch{return null}};
let running=false;

function codeToBytes(code){let value=String(code||'').trim().replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');value+='='.repeat((4-value.length%4)%4);const bytes=b64ToBytes(value);if(bytes.length!==32)throw new Error('Código de sincronização inválido.');return bytes}
async function syncKey(){if(!runtime.key)throw new Error('Abra o cofre primeiro.');const saved=parseJson(localStorage.getItem(SECRET_STORAGE)||'');if(!saved)throw new Error('Chave de sincronização não configurada.');const secret=await decryptJson(runtime.key,saved,'github-sync-secret');if(!secret?.code)throw new Error('Chave de sincronização indisponível.');return crypto.subtle.importKey('raw',codeToBytes(String(secret.code)),{name:'AES-GCM'},false,['encrypt','decrypt'])}
async function decryptEnvelope(envelope,key){if(!envelope||envelope.format!==FORMAT)throw new Error('Cofre privado incompatível.');const snapshot=await decryptJson(key,{iv:envelope.crypto?.iv,data:envelope.payload},FORMAT);if(!snapshot?.stores||!snapshot?.meta?.vault)throw new Error('Conteúdo remoto incompatível.');return snapshot}
function loadBaseline(){return parseJson(localStorage.getItem(BASELINE_STORAGE)||'{}')||{}}
function deterministicGemini(key){const p=parseConflictKey(key);return Boolean(p&&((p.store==='appointments'&&p.id.startsWith('gmappt_'))||(p.store==='records'&&p.id.startsWith('gmrec_'))))}
const VOLATILE=new Set(['updatedAt','createdAt','sourceModifiedAt','importedAt','lastSyncedAt','syncUpdatedAt','googleEventId','googleCalendarEventId']);
function prune(value,key=''){if(VOLATILE.has(key))return undefined;if(Array.isArray(value))return value.map(v=>prune(v)).filter(v=>v!==undefined);if(value&&typeof value==='object'){const out={};for(const k of Object.keys(value).sort()){if(key==='source'&&k==='modifiedAt')continue;const v=prune(value[k],k);if(v!==undefined)out[k]=v}return out}return value}
function equivalentConflict(local,remote,key){const p=parseConflictKey(key);if(!p)return false;const l=entityState(local,p.store,p.id),r=entityState(remote,p.store,p.id);if(l.kind==='d'&&r.kind==='d')return true;if(deterministicGemini(key))return false;if(l.kind==='r'&&r.kind==='r'&&l.row&&r.row)return JSON.stringify(prune(l.row))===JSON.stringify(prune(r.row));return false}
async function cleanupEquivalentConflicts(){if(running||runtime.locked||!runtime.dataReady)return;running=true;try{const key=await syncKey(),remoteMeta=await readPrivateVault();if(!remoteMeta)return;const remote=await decryptEnvelope(remoteMeta.envelope,key),local=await exportRawDatabase(),base=loadBaseline(),keys=conflictKeys(local,remote,base,STORE_NAMES),equivalent=keys.filter(k=>equivalentConflict(local,remote,k));if(!equivalent.length)return;for(const k of equivalent){const p=parseConflictKey(k),l=entityState(local,p.store,p.id),r=entityState(remote,p.store,p.id),winner=stamp(l.stamp)>=stamp(r.stamp)?l:r;base[k]=`${winner.kind}|${winner.stamp}`}localStorage.setItem(BASELINE_STORAGE,JSON.stringify(base));toast(`${equivalent.length} conflito(s) semanticamente idêntico(s) removido(s) da revisão. Nenhum dado clínico foi alterado.`,'success');setTimeout(()=>location.reload(),700)}catch(err){console.warn('Não foi possível limpar conflitos semanticamente idênticos no storage privado',err)}finally{running=false}}

document.addEventListener('rm:sync-status',e=>{if(e.detail?.status==='conflict')setTimeout(()=>void cleanupEquivalentConflicts(),60)});
