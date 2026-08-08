import {runtime} from './state.js';
import {encryptJson} from './crypto.js';
import {toast} from './ui.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const CALENDAR_TOKEN_STORAGE='rm.google.calendar.token.v1';
const MEET_TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const STATE_STORAGE='rm.google.workspace.oauth.state.v187';
const PENDING_STORAGE='rm.google.workspace.oauth.pending.v187';
const RESULT_STORAGE='rm.google.workspace.oauth.result.v187';
const REDIRECT_URI='https://ricmurtapsicologia.github.io/plataforma.terapeutica/';
const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const SCOPES=`${CALENDAR_SCOPE} ${DRIVE_SCOPE}`;
let importing=false;

function secureRandom(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
function cleanHash(){history.replaceState(null,'',`${location.pathname}${location.search}#settings`)}
function captureRedirect(){
  const raw=location.hash.replace(/^#/,'');
  if(!raw||(!raw.includes('access_token=')&&!raw.includes('error=')))return false;
  const params=new URLSearchParams(raw),returned=params.get('state')||'',expected=sessionStorage.getItem(STATE_STORAGE)||'';
  if(!returned.startsWith('rmunified.'))return false;
  try{
    if(!expected||returned!==expected)throw new Error('A resposta do Google não corresponde à conexão iniciada neste navegador.');
    if(params.get('error'))throw new Error(params.get('error_description')||params.get('error'));
    const token=params.get('access_token')||'',seconds=Math.max(60,Number(params.get('expires_in')||3600)),scope=params.get('scope')||'';
    if(!token)throw new Error('O Google não retornou um token de acesso.');
    const granted=new Set(scope.split(/\s+/).filter(Boolean));
    if(scope&&!granted.has(CALENDAR_SCOPE))throw new Error('A permissão do Google Agenda não foi concedida.');
    if(scope&&!granted.has(DRIVE_SCOPE))throw new Error('A permissão de leitura do Google Drive não foi concedida.');
    sessionStorage.setItem(PENDING_STORAGE,JSON.stringify({token,expiresAt:Date.now()+seconds*1000,scope:scope||SCOPES}));
    sessionStorage.setItem(RESULT_STORAGE,'ok');
  }catch(err){
    sessionStorage.removeItem(PENDING_STORAGE);
    sessionStorage.setItem(RESULT_STORAGE,`error:${err?.message||err}`);
  }finally{
    sessionStorage.removeItem(STATE_STORAGE);
    cleanHash();
  }
  return true;
}
captureRedirect();

function beginAuthorization(){
  if(!runtime.key)throw new Error('Abra o cofre antes de conectar o Google Workspace.');
  const clientId=String(document.getElementById('rm-google-client-id')?.value||localStorage.getItem(CLIENT_STORAGE)||'').trim();
  if(!clientId)throw new Error('Informe primeiro o Google OAuth Client ID.');
  if(!/\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('O Google OAuth Client ID está incompleto.');
  localStorage.setItem(CLIENT_STORAGE,clientId);
  const state=`rmunified.${secureRandom()}`;sessionStorage.setItem(STATE_STORAGE,state);
  const params=new URLSearchParams({client_id:clientId,redirect_uri:REDIRECT_URI,response_type:'token',scope:SCOPES,include_granted_scopes:'true',state,prompt:'consent'});
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function persistPending(){
  if(importing||!runtime.key)return false;
  let pending=null;try{pending=JSON.parse(sessionStorage.getItem(PENDING_STORAGE)||'null')}catch{}
  if(!pending?.token)return false;
  importing=true;
  try{
    if(Number(pending.expiresAt)<=Date.now()+60000)throw new Error('A autorização do Google expirou antes de ser salva. Conecte novamente.');
    const expiresAt=Number(pending.expiresAt),scope=pending.scope||SCOPES;
    const calendarEncrypted=await encryptJson(runtime.key,{token:pending.token,expiresAt},'google-calendar-token');
    const meetEncrypted=await encryptJson(runtime.key,{token:pending.token,expiresAt,scope},'google-meet-token');
    localStorage.setItem(CALENDAR_TOKEN_STORAGE,JSON.stringify(calendarEncrypted));
    localStorage.setItem(MEET_TOKEN_STORAGE,JSON.stringify(meetEncrypted));
    localStorage.setItem('rm.google.meet.drive.consent.v1','1');
    sessionStorage.removeItem(PENDING_STORAGE);
    sessionStorage.removeItem(RESULT_STORAGE);
    return true;
  }finally{importing=false}
}

function unifiedAction(action){return action==='google-calendar-connect'||action==='meet-connect'}
document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-action]');if(!el||!unifiedAction(el.dataset.action))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{beginAuthorization()}catch(err){toast(err?.message||'Não foi possível iniciar a conexão com o Google.','error')}
},true);

document.addEventListener('rm:data-ready',e=>{
  const hasPending=Boolean(sessionStorage.getItem(PENDING_STORAGE));
  if(!hasPending){
    const result=sessionStorage.getItem(RESULT_STORAGE)||'';
    if(result.startsWith('error:')){sessionStorage.removeItem(RESULT_STORAGE);queueMicrotask(()=>toast(result.slice(6),'error'))}
    return;
  }
  e.stopImmediatePropagation();
  void (async()=>{
    try{
      const imported=await persistPending();
      if(imported)toast('Google Workspace conectado. Agenda e Meet foram autorizados neste dispositivo.','success');
    }catch(err){sessionStorage.removeItem(PENDING_STORAGE);toast(err?.message||'Não foi possível salvar a autorização do Google.','error')}
    queueMicrotask(()=>document.dispatchEvent(new CustomEvent('rm:data-ready')));
  })();
},true);
