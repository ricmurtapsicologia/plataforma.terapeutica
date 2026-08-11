import {STORE_NAMES,data,runtime,preferences,uid,todayISO,nowISO,selectedPatient,patientById,DEFAULT_MATERIALS} from './state.js';
import {putEncrypted,deleteRecord} from './database.js';
import {assert,sanitizeText} from './validation.js';
import {openWhatsApp} from './communications.js';
import {modal,closeModal,toast,esc,fmtDate,fmtDateTime} from './ui.js';
import {createBackup,verifyBackupFile,restoreBackup,backupStatus,downloadBlob} from './backup.js';
import {verifyActivityChain} from './audit.js';
import {requestNotificationPermission,showLocalNotification} from './notifications.js';
import {encryptWithPin} from './crypto.js';

const q=s=>document.querySelector(s);
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let autosaveTimer=null;
let pendingFileAction=null;

async function saveEntity(store,item){assert(runtime.key,'Sessão encerrada. Entre novamente.');item.updatedAt=nowISO();const list=data[store]||(data[store]=[]),i=list.findIndex(x=>x?.id===item.id);if(i>=0)list[i]=item;else list.push(item);await putEncrypted(store,item,runtime.key);return item}
async function removeEntity(store,id){data[store]=arr(data[store]).filter(x=>x?.id!==id);await deleteRecord(store,id)}
function selectedRequired(){const p=selectedPatient();assert(p,'Selecione um paciente.');return p}
function firstName(p){return String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||''}
function rerender(){window.__rmRender?.()}
function nl2br(v=''){return esc(String(v||'')).replace(/\n/g,'<br>')}

// Branch intentionally not merged. Main remains unchanged.
