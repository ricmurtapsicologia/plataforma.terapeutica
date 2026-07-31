import {data,runtime,uid,nowISO,APP_VERSION} from './state.js';
import {sha256} from './crypto.js';
import {putEncrypted} from './database.js';
export async function addActivity(action,{entity='',patientId='',entityId='',result='ok',details=''}={}){if(!runtime.key)return;const previous=data.audit.at(-1)?.hash||'';const event={id:uid('act'),at:nowISO(),action,entity,patientId,entityId,result,details,appVersion:APP_VERSION,previousHash:previous};event.hash=await sha256({...event,hash:undefined});data.audit.push(event);await putEncrypted('audit',event,runtime.key);return event}
export async function verifyActivityChain(){let prev='';for(const e of data.audit){const expected=await sha256({...e,hash:undefined});if(e.previousHash!==prev||e.hash!==expected)return{ok:false,id:e.id};prev=e.hash}return{ok:true,count:data.audit.length}}
