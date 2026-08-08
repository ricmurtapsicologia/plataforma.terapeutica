import {runtime} from './state.js';
import {encryptJson} from './crypto.js';
import {toast} from './ui.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const STATE_STORAGE='rm.google.meet.oauth.state.v186';
const PENDING_STORAGE='rm.google.meet.oauth.pending.v186';
const RESULT_STORAGE='rm.google.meet.oauth.result.v186';
const REDIRECT_URI='https://ricmurtapsicologia.github.io/plataforma.terapeutica/';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events.readonly';
const SCOPES=`${DRIVE_SCOPE} ${CALENDAR_SCOPE}`;
let importing=false;

function secureRandom(){
  const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
function cleanHash(){history.replaceState(null,'',`${location.pathname}${location.search}#settings`)}

function captureMeetRedirect(){
  const raw=location.hash.replace(/^#/,'');
  if(!raw||(!raw.includes('access_token=')&&!raw.includes('error=')))return false;
  const params=new URLSearchParams(raw),returned=params.get('state')||'',expected=sessionStorage.getItem(STATE_STORAGE)||'';
  if(!returned.startsWith('rmmeet.'))return false;
  try{
    if(!expected||returned!==expected)throw new Error('A resposta do Google não corresponde à conexão do Meet iniciada neste navegador.');
    if(params.get('error'))throw new Error(params.get('error_description')||params.get('error'));
    const token=params.get('access_token')||'',seconds=Math.max(60,Number(params.get('expires_in')||3600)),scope=params.get('scope')||'';
    if(!token)throw new Error('O Google não retornou um token de acesso para o Meet.');
    const granted=new Set(scope.split(/\s+/).filter(Boolean));
    if(scope&&(!granted.has(DRIVE_SCOPE)||!granted.has(CALENDAR_SCOPE)))throw new Error('As permissões de leitura do Drive e da Agenda não foram concedidas.');
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
captureMeetRedirect();

function beginMeetRedirect(){
  if(!runtime.key)throw new Error('Abra o cofre antes de conectar o Google Meet.');
  const clientId=String(localStorage.getItem(CLIENT_STORAGE)||'').trim();
  if(!clientId)throw new Error('Configure primeiro o Google OAuth Client ID na integração do Google Agenda.');
  if(!/\.apps\.googleusercontent\.com$/.test(clientId))throw new Error('O Google OAuth Client ID está incompleto.');
  const state=`rmmeet.${secureRandom()}`;sessionStorage.setItem(STATE_STORAGE,state);
  const params=new URLSearchParams({client_id:clientId,redirect_uri:REDIRECT_URI,response_type:'token',scope:SCOPES,include_granted_scopes:'true',state});
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function persistPendingToken(){
  if(importing||!runtime.key)return false;
  let pending=null;try{pending=JSON.parse(sessionStorage.getItem(PENDING_STORAGE)||'null')}catch{}
  if(!pending?.token)return false;
  importing=true;
  try{
    if(Number(pending.expiresAt)<=Date.now()+60000)throw new Error('A autorização do Google expirou antes de ser salva. Conecte novamente.');
    const encrypted=await encryptJson(runtime.key,{token:pending.token,expiresAt:Number(pending.expiresAt),scope:pending.scope||SCOPES},'google-meet-token');
    localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted));
    sessionStorage.removeItem(PENDING_STORAGE);
    sessionStorage.removeItem(RESULT_STORAGE);
    return true;
  }finally{importing=false}
}

document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-action="meet-connect"]');if(!el)return;
  e.preventDefault();e.stopImmediatePropagation();
  try{beginMeetRedirect()}catch(err){toast(err?.message||'Não foi possível iniciar a conexão com o Google Meet.','error')}
},true);

document.addEventListener('rm:data-ready',e=>{
  if(importing||!sessionStorage.getItem(PENDING_STORAGE)){
    const result=sessionStorage.getItem(RESULT_STORAGE)||'';
    if(result.startsWith('error:')){sessionStorage.removeItem(RESULT_STORAGE);queueMicrotask(()=>toast(result.slice(6),'error'))}
    return;
  }
  e.stopImmediatePropagation();
  void (async()=>{
    try{
      const imported=await persistPendingToken();
      if(imported)toast('Google Meet conectado. Iniciando a conferência das anotações do Gemini.','success');
    }catch(err){sessionStorage.removeItem(PENDING_STORAGE);toast(err?.message||'Não foi possível salvar a autorização do Google Meet.','error')}
    queueMicrotask(()=>document.dispatchEvent(new CustomEvent('rm:data-ready')));
  })();
},true);
