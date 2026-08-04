import {runtime} from './state.js';
import {encryptJson} from './crypto.js';
import {toast} from './ui.js';

const CLIENT_STORAGE='rm.google.calendar.clientId';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const SCOPE='https://www.googleapis.com/auth/calendar.events';
let active=false;

function loadGoogleIdentity(){
  if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let s=document.querySelector('script[data-rm-google-identity]');
    if(s){
      if(globalThis.google?.accounts?.oauth2)return resolve();
      s.addEventListener('load',()=>resolve(),{once:true});
      s.addEventListener('error',()=>reject(new Error('Falha ao carregar a autorização do Google.')),{once:true});
      return;
    }
    s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client';
    s.async=true;s.defer=true;s.dataset.rmGoogleIdentity='1';
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('Falha ao carregar a autorização do Google.'));
    document.head.appendChild(s);
  });
}

async function persistToken(response){
  if(!response?.access_token)throw new Error('O Google não retornou um token de acesso.');
  if(globalThis.google?.accounts?.oauth2?.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){
    throw new Error('A permissão para editar eventos do Google Agenda não foi concedida.');
  }
  if(!runtime.key)throw new Error('A sessão clínica precisa estar desbloqueada.');
  const expiresAt=Date.now()+Math.max(60,Number(response.expires_in||3600))*1000;
  const encrypted=await encryptJson(runtime.key,{token:response.access_token,expiresAt},'google-calendar-token');
  localStorage.setItem(TOKEN_STORAGE,JSON.stringify(encrypted));
}

async function connect(){
  if(active)return;
  const field=document.getElementById('rm-google-client-id');
  const id=(field?.value||localStorage.getItem(CLIENT_STORAGE)||'').trim();
  if(!id)throw new Error('Informe primeiro o Google OAuth Client ID.');
  if(!/\.apps\.googleusercontent\.com$/.test(id))throw new Error('O Google OAuth Client ID está incompleto.');
  localStorage.setItem(CLIENT_STORAGE,id);
  await loadGoogleIdentity();
  active=true;
  toast('Aguardando autorização do Google…','');
  const client=google.accounts.oauth2.initTokenClient({
    client_id:id,
    scope:SCOPE,
    include_granted_scopes:true,
    callback:async response=>{
      try{
        if(response?.error)throw new Error(response.error_description||response.error);
        await persistToken(response);
        toast('Google Agenda autorizado. Finalizando conexão…','success');
        setTimeout(()=>location.reload(),450);
      }catch(err){
        active=false;
        toast(err.message||'Não foi possível concluir a autorização do Google.','error');
      }
    },
    error_callback:error=>{
      active=false;
      const type=error?.type||'unknown';
      const message=type==='popup_failed_to_open'
        ?'O navegador bloqueou a janela do Google. Permita pop-ups para esta página e tente novamente.'
        :type==='popup_closed'
          ?'A janela do Google foi fechada antes da autorização ser concluída.'
          :'A autorização do Google foi interrompida antes de retornar à plataforma.';
      toast(message,'error');
    }
  });
  try{
    // Não força uma nova tela de consentimento. O Google reutiliza a autorização já concedida
    // e solicita consentimento somente quando necessário.
    client.requestAccessToken();
  }catch(err){
    active=false;
    throw err;
  }
}

document.addEventListener('click',async event=>{
  const el=event.target.closest?.('[data-action="google-calendar-connect"]');
  if(!el)return;
  // Este módulo é carregado antes da integração principal e assume somente o fluxo OAuth.
  // Assim evitamos dois clientes concorrentes tentando tratar o mesmo clique.
  event.preventDefault();
  event.stopImmediatePropagation();
  try{await connect()}catch(err){active=false;toast(err.message||'Não foi possível conectar o Google Agenda.','error')}
},true);
