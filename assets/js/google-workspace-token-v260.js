import {runtime} from './state.js';
import {decryptJson,encryptJson} from './crypto.js';

export const TOKEN_STORAGE='rm.google.calendar.token.v1';
export const TOKEN_HANDOFF='rm.google.workspace.token.handoff.v260';
export const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events';
export const DRIVE_READONLY_SCOPE='https://www.googleapis.com/auth/drive.readonly';
export const APPDATA_SCOPE='https://www.googleapis.com/auth/drive.appdata';
export const GMAIL_SEND_SCOPE='https://www.googleapis.com/auth/gmail.send';
export const WORKSPACE_REQUIRED_SCOPES=[CALENDAR_SCOPE,DRIVE_READONLY_SCOPE,APPDATA_SCOPE];
export const WORKSPACE_FULL_SCOPES=[...WORKSPACE_REQUIRED_SCOPES,GMAIL_SEND_SCOPE];

const parseJson=value=>{try{return JSON.parse(value)}catch{return null}};
const scopeSet=value=>new Set(String(value||'').split(/\s+/).filter(Boolean));

export async function loadWorkspaceAuthorization(requiredScopes=[]){
  if(!runtime.key)return{ok:false,reason:'vault-locked',token:'',expiresAt:0,scope:'',scopes:new Set(),missing:[...requiredScopes]};
  const raw=parseJson(localStorage.getItem(TOKEN_STORAGE)||'');
  if(!raw)return{ok:false,reason:'missing',token:'',expiresAt:0,scope:'',scopes:new Set(),missing:[...requiredScopes]};
  try{
    const value=await decryptJson(runtime.key,raw,'google-calendar-token');
    const token=String(value?.token||''),expiresAt=Number(value?.expiresAt||0),scope=String(value?.scope||'');
    const scopes=scopeSet(scope),missing=requiredScopes.filter(s=>!scopes.has(s));
    if(!token)return{ok:false,reason:'missing',token:'',expiresAt,scope,scopes,missing};
    if(expiresAt<=Date.now()+60000)return{ok:false,reason:'expired',token:'',expiresAt,scope,scopes,missing};
    if(missing.length)return{ok:false,reason:'scope',token,expiresAt,scope,scopes,missing};
    return{ok:true,reason:'ok',token,expiresAt,scope,scopes,missing:[]};
  }catch{
    return{ok:false,reason:'decrypt',token:'',expiresAt:0,scope:'',scopes:new Set(),missing:[...requiredScopes]};
  }
}

export async function preserveWorkspaceTokenForVaultAdoption(){
  const auth=await loadWorkspaceAuthorization([]);
  if(!auth.ok)return false;
  sessionStorage.setItem(TOKEN_HANDOFF,JSON.stringify({token:auth.token,expiresAt:auth.expiresAt,scope:auth.scope}));
  return true;
}

export async function recoverWorkspaceTokenAfterVaultAdoption(){
  if(!runtime.key)return false;
  const handoff=parseJson(sessionStorage.getItem(TOKEN_HANDOFF)||'');
  if(!handoff?.token)return false;
  if(Number(handoff.expiresAt||0)<=Date.now()+60000){sessionStorage.removeItem(TOKEN_HANDOFF);return false}
  const encrypted=await encryptJson(runtime.key,{token:String(handoff.token),expiresAt:Number(handoff.expiresAt),scope:String(handoff.scope||'')},'google-calendar-token');
  localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted));
  sessionStorage.removeItem(TOKEN_HANDOFF);
  return true;
}
