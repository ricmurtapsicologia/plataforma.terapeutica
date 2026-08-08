import {runtime} from './state.js';
import {decryptJson,encryptJson} from './crypto.js';

const CALENDAR_TOKEN_STORAGE='rm.google.calendar.token.v1';
const MEET_TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const CALENDAR_AAD='google-calendar-token';
const MEET_AAD='google-meet-token';
const SCOPES='https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.readonly';
let running=false;

async function readEncrypted(storageKey,aad){
  if(!runtime.key)return null;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{}
  if(!raw)return null;
  try{return await decryptJson(runtime.key,raw,aad)}catch{return null}
}
function valid(v){return Boolean(v?.token&&Number(v.expiresAt)>Date.now()+60000)}

async function bridgeWorkspaceToken(){
  if(running||!runtime.key||!runtime.dataReady)return false;
  running=true;
  try{
    const meet=await readEncrypted(MEET_TOKEN_STORAGE,MEET_AAD);
    if(valid(meet)){
      localStorage.setItem('rm.google.meet.bridge.status','ready');
      return false;
    }
    const calendar=await readEncrypted(CALENDAR_TOKEN_STORAGE,CALENDAR_AAD);
    if(!valid(calendar)){
      localStorage.removeItem('rm.google.meet.bridge.status');
      return false;
    }
    const encrypted=await encryptJson(runtime.key,{token:calendar.token,expiresAt:Number(calendar.expiresAt),scope:SCOPES},MEET_AAD);
    localStorage.setItem(MEET_TOKEN_STORAGE,JSON.stringify(encrypted));
    localStorage.setItem('rm.google.meet.drive.consent.v1','1');
    localStorage.setItem('rm.google.meet.bridge.status','ready');
    window.dispatchEvent(new CustomEvent('rm:workspace-token-bridged'));
    return true;
  }finally{running=false}
}

async function onDataReady(){
  try{
    const changed=await bridgeWorkspaceToken();
    if(changed)queueMicrotask(()=>document.dispatchEvent(new CustomEvent('rm:data-ready',{detail:{workspaceBridge:true}})));
  }catch(err){console.warn('Não foi possível compartilhar a autorização Google com o Meet/Gemini.',err)}
}

document.addEventListener('rm:data-ready',()=>void onDataReady());
window.addEventListener('storage',e=>{if(e.key===CALENDAR_TOKEN_STORAGE)void onDataReady()});
