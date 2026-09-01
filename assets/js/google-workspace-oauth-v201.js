import {runtime} from './state.js';
import {encryptJson} from './crypto.js';
import {toast} from './ui.js';
import {WORKSPACE_FULL_SCOPES} from './google-workspace-token-v260.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const STATE_STORAGE='rm.google.workspace.oauth.state.v200';
const PENDING_STORAGE='rm.google.workspace.oauth.pending.v200';
const RESULT_STORAGE='rm.google.workspace.oauth.result.v200';
const REDIRECT_URI='https://ricmurtapsicologia.github.io/plataforma.terapeutica/';
const REQUIRED_SCOPES=[...WORKSPACE_FULL_SCOPES];
const SCOPE=REQUIRED_SCOPES.join(' ');
let importing=false;

function secureRandom(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
function cleanHash(){history.replaceState(null,'',`${location.pathname}${location.search}#settings`)}
function captureRedirect(){
  const raw=location.hash.replace(/^#/,'');
  if(!raw||(!raw.includes('access_token=')&&!raw.includes('error=')))return false;
  const params=new URLSearchParams(raw),returned=params.get('state')||'',expected=sessionStorage.getItem(STATE_STORAGE)||'';
  if(!returned.startsWith('rmws2.'))return false;
  try{
    if(!expected||returned!==expected)throw new Error('A resposta do Google não corresponde à conexão iniciada neste navegador.');
    if(params.get('error'))throw new Error(params.get('error_description')||params.get('error'));
    const token=params.get('access_token')||'',seconds=Math.max(60,Number(params.get('expires_in')||3600)),scope=params.get('scope')||'';
    if(!token)throw new Error('O Google não retornou um token de acesso.');
    const granted=new Set(scope.split(/\s+/).filter(Boolean)),missing=REQUIRED_SCOPES.filter(s=>!granted.has(s));
    if(scope&&missing.length)throw new Error('As permissões de Agenda, Drive privado, Meet/Anamnese e envio de e-mail não foram concedidas integralmente.');
    sessionStorage.setItem(PENDING_STORAGE,JSON.stringify({token,expiresAt:Date.now()+seconds*1000,scope:scope||SCOPE}));
    sessionStorage.setItem(RESULT_STORAGE,'ok');
  }catch(err){sessionStorage.removeItem(PENDING_STORAGE);sessionStorage.setItem(RESULT_STORAGE,`error:${err?.message||err}`)}finally{sessionStorage.removeItem(STATE_STORAGE);cleanHash()}
  return true;
}
captureRedirect();

async function resolvedClientId(){
  let id=String(document.getElementById('rm-google-client-id')?.value||localStorage.getItem(CLIENT_STORAGE)||'').trim();
  if(!id&&window.__rmGoogleClientIdReady){
    try{id=String(await window.__rmGoogleClientIdReady||'').trim()}catch{}
  }
  if(!id)id=String(localStorage.getItem(CLIENT_STORAGE)||'').trim();
  return id;
}

async function beginAuthorization(){
  if(!runtime.key)throw new Error('Abra o cofre antes de conectar o Google Workspace.');
  const id=await resolvedClientId();
  if(!id)throw new Error('Não foi possível carregar o Google OAuth Client ID. Recarregue a plataforma e tente novamente.');
  if(!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id))throw new Error('O Google OAuth Client ID está incompleto.');
  localStorage.setItem(CLIENT_STORAGE,id);
  const input=document.getElementById('rm-google-client-id');if(input)input.value=id;
  const state=`rmws2.${secureRandom()}`;sessionStorage.setItem(STATE_STORAGE,state);
  const params=new URLSearchParams({client_id:id,redirect_uri:REDIRECT_URI,response_type:'token',scope:SCOPE,include_granted_scopes:'true',state,prompt:'consent'});
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function persistPending(){
  if(importing||!runtime.key)return false;
  let pending=null;try{pending=JSON.parse(sessionStorage.getItem(PENDING_STORAGE)||'null')}catch{}
  if(!pending?.token)return false;
  importing=true;
  try{
    if(Number(pending.expiresAt)<=Date.now()+60000)throw new Error('A autorização do Google expirou antes de ser salva. Conecte novamente.');
    const encrypted=await encryptJson(runtime.key,{token:pending.token,expiresAt:Number(pending.expiresAt),scope:pending.scope||SCOPE},'google-calendar-token');
    localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted));
    sessionStorage.removeItem(PENDING_STORAGE);sessionStorage.removeItem(RESULT_STORAGE);
    document.dispatchEvent(new CustomEvent('rm:google-workspace-authorized',{detail:{scopes:REQUIRED_SCOPES}}));
    return true;
  }finally{importing=false}
}

function isWorkspaceAction(action){return action==='google-calendar-connect'||action==='workspace-connect'}
document.addEventListener('click',e=>{const el=e.target.closest?.('[data-action]');if(!el||!isWorkspaceAction(el.dataset.action))return;e.preventDefault();e.stopImmediatePropagation();void(async()=>{try{await beginAuthorization()}catch(err){toast(err?.message||'Não foi possível iniciar a conexão com o Google Workspace.','error')}})()},true);
document.addEventListener('rm:data-ready',e=>{
  const hasPending=Boolean(sessionStorage.getItem(PENDING_STORAGE));
  if(!hasPending){const result=sessionStorage.getItem(RESULT_STORAGE)||'';if(result.startsWith('error:')){sessionStorage.removeItem(RESULT_STORAGE);queueMicrotask(()=>toast(result.slice(6),'error'))}return}
  e.stopImmediatePropagation();
  void(async()=>{try{const imported=await persistPending();if(imported)toast('Google Workspace conectado. Agenda, Meet/Drive, cofre privado e envio de e-mail foram autorizados neste dispositivo.','success')}catch(err){sessionStorage.removeItem(PENDING_STORAGE);toast(err?.message||'Não foi possível salvar a autorização do Google Workspace.','error')}queueMicrotask(()=>document.dispatchEvent(new CustomEvent('rm:data-ready')))})();
},true);
