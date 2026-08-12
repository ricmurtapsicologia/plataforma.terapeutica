import {runtime} from './state.js';
import {encryptJson} from './crypto.js';
import {TOKEN_STORAGE,WORKSPACE_REQUIRED_SCOPES,loadWorkspaceAuthorization} from './google-workspace-token-v260.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const SCOPE=WORKSPACE_REQUIRED_SCOPES.join(' ');
const RENEW_BEFORE_MS=10*60*1000;
const ATTEMPT_COOLDOWN_MS=5*60*1000;
const CHECK_MS=5*60*1000;
let active=false,lastAttemptAt=0,timer=null,interval=null,lastInteractionNoticeAt=0;

function emit(status,detail=''){
  document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew',{detail:{status,detail,at:new Date().toISOString()}}));
}

function loadGoogleIdentity(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-rm-google-identity]');
    if(script){
      if(globalThis.google?.accounts?.oauth2)return resolve();
      script.addEventListener('load',()=>resolve(),{once:true});
      script.addEventListener('error',()=>reject(new Error('Falha ao carregar a autorização do Google.')),{once:true});
      return;
    }
    script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';
    script.async=true;
    script.defer=true;
    script.dataset.rmGoogleIdentity='1';
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error('Falha ao carregar a autorização do Google.'));
    document.head.appendChild(script);
  });
}

async function persistToken(response){
  if(!response?.access_token)throw new Error('O Google não retornou um token de acesso.');
  if(!runtime.key)throw new Error('O cofre precisa estar desbloqueado.');
  const grantedScope=String(response.scope||SCOPE);
  const granted=new Set(grantedScope.split(/\s+/).filter(Boolean));
  const missing=WORKSPACE_REQUIRED_SCOPES.filter(scope=>!granted.has(scope));
  if(response.scope&&missing.length)throw new Error('O Google não devolveu todas as permissões necessárias do Workspace.');
  const expiresAt=Date.now()+Math.max(60,Number(response.expires_in||3600))*1000;
  const encrypted=await encryptJson(runtime.key,{token:response.access_token,expiresAt,scope:grantedScope},'google-calendar-token');
  localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted));
  document.dispatchEvent(new CustomEvent('rm:google-workspace-authorized',{detail:{scopes:WORKSPACE_REQUIRED_SCOPES,renewed:true,expiresAt}}));
}

function interactionRequired(detail){
  emit('interaction-required',detail);
  if(Date.now()-lastInteractionNoticeAt>30*60*1000){
    lastInteractionNoticeAt=Date.now();
    document.dispatchEvent(new CustomEvent('rm:workspace-reconnect-required',{detail:{reason:detail,at:new Date().toISOString()}}));
  }
}

async function renewSilently({force=false}={}){
  if(active||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return false;
  if(!force&&Date.now()-lastAttemptAt<ATTEMPT_COOLDOWN_MS)return false;
  const clientId=String(localStorage.getItem(CLIENT_STORAGE)||'').trim();
  if(!/\.apps\.googleusercontent\.com$/.test(clientId)){emit('unconfigured','Google OAuth Client ID não configurado.');return false}
  const auth=await loadWorkspaceAuthorization(WORKSPACE_REQUIRED_SCOPES);
  if(!force&&auth.ok&&auth.expiresAt-Date.now()>RENEW_BEFORE_MS){emit('ok','Autorização Google Workspace vigente.');return true}
  await loadGoogleIdentity();
  active=true;
  lastAttemptAt=Date.now();
  emit('renewing','Renovando autorização do Google Workspace em modo silencioso.');
  try{
    return await new Promise(resolve=>{
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;resolve(value)};
      const client=google.accounts.oauth2.initTokenClient({
        client_id:clientId,
        scope:SCOPE,
        include_granted_scopes:true,
        callback:response=>void(async()=>{
          try{
            if(response?.error){
              const code=String(response.error||'');
              if(['interaction_required','login_required','consent_required'].includes(code)){
                interactionRequired('O Google exige nova interação para renovar o Workspace.');
                return finish(false);
              }
              emit('error',response.error_description||code||'Falha ao renovar o Google Workspace.');
              return finish(false);
            }
            await persistToken(response);
            emit('renewed','Google Workspace renovado silenciosamente.');
            finish(true);
          }catch(err){emit('error',err?.message||String(err));finish(false)}
        })
      });
      try{client.requestAccessToken({prompt:'none'})}catch(err){emit('error',err?.message||String(err));finish(false)}
    });
  }finally{active=false}
}

function schedule(delay=500,force=false){
  clearTimeout(timer);
  timer=setTimeout(()=>void renewSilently({force}),delay);
}
function startInterval(){
  clearInterval(interval);
  interval=setInterval(()=>{if(!document.hidden&&navigator.onLine)schedule(50,false)},CHECK_MS);
}

document.addEventListener('rm:data-ready',()=>{schedule(900,false);startInterval()});
document.addEventListener('rm:workspace-auto-renew-request',e=>schedule(60,Boolean(e.detail?.force)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(250,false)});
window.addEventListener('online',()=>schedule(250,false));
