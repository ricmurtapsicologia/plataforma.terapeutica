import {runtime} from './state.js';
import {performSync} from './secure-sync-v260.js';
import {reconcileGemini} from './clinical-reconcile-v270.js';
import {reconcileClinicalIntakes} from './clinical-intake-runtime-v310.js';
import {loadWorkspaceAuthorization,WORKSPACE_REQUIRED_SCOPES} from './google-workspace-token-v260.js';

const VERSION='3.2.0-autosync.1';
const MIN_INTERVAL=45000;
const WORKSPACE_WAIT_MS=10000;
const CALENDAR_WAIT_MS=9000;
let busy=false,lastAt=0,timer=null;
let state={status:'idle',detail:'Aguardando abertura do cofre.',lastRunAt:'',steps:{}};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function emit(status,detail,steps=state.steps){
  state={status,detail,lastRunAt:new Date().toISOString(),steps};
  globalThis.__rmClinicalOrchestratorStatus={...state,version:VERSION};
  document.dispatchEvent(new CustomEvent('rm:clinical-orchestrator-status',{detail:globalThis.__rmClinicalOrchestratorStatus}));
  paint();
}
function step(steps,name,status,detail=''){
  steps[name]={status,detail,at:new Date().toISOString()};
  emit('syncing','Atualizando ecossistema clínico…',steps);
}
function paint(){
  if(runtime.locked)return;
  const top=document.querySelector('.top-actions');
  if(!top)return;
  let chip=document.getElementById('rm-orchestrator-v320');
  if(!chip){
    chip=document.createElement('button');
    chip.id='rm-orchestrator-v320';
    chip.type='button';
    chip.dataset.route='settings';
    top.insertBefore(chip,top.firstChild);
  }
  const needs=state.status==='attention'||state.status==='error';
  chip.className=`rm-status-chip ${state.status==='ready'?'ok':needs?'warn':''}`;
  chip.textContent=state.status==='ready'?'Ecossistema ✓':needs?'Ecossistema !':'Ecossistema ↻';
  chip.title=state.detail;
}

function waitWorkspaceSignal(timeout=WORKSPACE_WAIT_MS){
  return new Promise(resolve=>{
    let settled=false;
    const finish=detail=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeoutId);
      document.removeEventListener('rm:google-workspace-authorized',authorized);
      document.removeEventListener('rm:workspace-auto-renew',renewed);
      resolve(detail||{status:'timeout'});
    };
    const authorized=event=>finish({status:'authorized',detail:event.detail||{}});
    const renewed=event=>{
      const status=String(event.detail?.status||'');
      if(['ok','renewed','interaction-required','unconfigured','error'].includes(status))finish({status,detail:event.detail||{}});
    };
    document.addEventListener('rm:google-workspace-authorized',authorized);
    document.addEventListener('rm:workspace-auto-renew',renewed);
    const timeoutId=setTimeout(()=>finish({status:'timeout'}),timeout);
  });
}

async function ensureWorkspaceAuthorization(){
  let auth=await loadWorkspaceAuthorization(WORKSPACE_REQUIRED_SCOPES);
  if(auth.ok)return auth;

  const signal=waitWorkspaceSignal();
  document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{
    detail:{force:true,reason:'clinical-orchestrator-entry',at:new Date().toISOString()}
  }));
  await signal;

  auth=await loadWorkspaceAuthorization(WORKSPACE_REQUIRED_SCOPES);
  return auth;
}

function workspaceDetail(auth){
  if(auth?.ok)return'Google Workspace autorizado.';
  const reason=String(auth?.reason||'unknown');
  if(reason==='missing')return'Google Workspace ainda não foi conectado neste dispositivo.';
  if(reason==='expired')return'A autorização do Google expirou e não pôde ser renovada silenciosamente.';
  if(reason==='scope')return'As permissões necessárias do Google Workspace precisam ser renovadas.';
  if(reason==='decrypt')return'O token local do Google Workspace não pôde ser aberto pelo cofre atual.';
  if(reason==='vault-locked')return'O cofre clínico precisa estar aberto.';
  return`Google Workspace pendente (${reason}).`;
}

function requestCalendarRefresh(){
  return new Promise(resolve=>{
    let settled=false;
    const finish=result=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeoutId);
      document.removeEventListener('rm:calendar-status',handler);
      resolve(result);
    };
    const handler=event=>{
      const status=String(event.detail?.status||'');
      if(['connected','error','disconnected'].includes(status)){
        finish({status,detail:String(event.detail?.detail||'')});
      }
    };
    document.addEventListener('rm:calendar-status',handler);
    document.dispatchEvent(new CustomEvent('rm:data-patched',{
      detail:{stores:['appointments'],source:'clinical-orchestrator-entry',at:new Date().toISOString()}
    }));
    const timeoutId=setTimeout(()=>finish({status:'attention',detail:'Agenda acionada; confirmação não recebida dentro do tempo esperado.'}),CALENDAR_WAIT_MS);
  });
}

async function run({force=false,reason='automatic'}={}){
  if(busy||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return false;
  if(!force&&Date.now()-lastAt<MIN_INTERVAL)return false;
  busy=true;
  lastAt=Date.now();
  const steps={};
  emit('syncing',`Atualização automática iniciada (${reason}).`,steps);
  try{
    const auth=await ensureWorkspaceAuthorization();
    step(steps,'workspace',auth.ok?'ok':'attention',workspaceDetail(auth));

    if(auth.ok){
      try{
        const ok=await performSync({manual:true});
        step(steps,'data',ok?'ok':'attention',ok?'Cofre privado reconciliado.':'Sincronização privada requer configuração ou revisão.');
      }catch(err){
        step(steps,'data','error',err?.message||'Falha na sincronização privada.');
      }

      try{
        await sleep(250);
        const calendar=await requestCalendarRefresh();
        const status=calendar.status==='connected'?'ok':calendar.status==='error'?'error':'attention';
        step(steps,'agenda',status,calendar.detail||'Agenda Google conferida.');
      }catch(err){
        step(steps,'agenda','error',err?.message||'Falha na Agenda Google.');
      }

      try{
        const intake=await reconcileClinicalIntakes({reason:'orchestrator',force:true});
        step(steps,'intake',intake?.ok?'ok':'attention',intake?.ok?'Anamneses conferidas.':String(intake?.reason||'Anamnese pendente.'));
      }catch(err){
        step(steps,'intake','error',err?.message||'Falha na anamnese.');
      }

      try{
        const gemini=await reconcileGemini({force:true,quiet:true,reason:'orchestrator'});
        step(steps,'meet',gemini!==false?'ok':'attention','Meet/Gemini reconciliado.');
      }catch(err){
        step(steps,'meet','error',err?.message||'Falha no Meet/Gemini.');
      }

      try{
        if(globalThis.__rmClinicalAuditPolicy?.run){
          await globalThis.__rmClinicalAuditPolicy.run({quiet:true});
          step(steps,'identity','ok','Associações clínicas auditadas.');
        }
      }catch(err){
        step(steps,'identity','error',err?.message||'Falha na política clínica.');
      }

      try{
        if(globalThis.__rmClinicalWhatsAppBridge?.cycle){
          await globalThis.__rmClinicalWhatsAppBridge.cycle();
          step(steps,'whatsapp','ok','WhatsApp clínico conferido.');
        }
      }catch(err){
        step(steps,'whatsapp','error',err?.message||'Falha no WhatsApp.');
      }
    }

    const bad=Object.values(steps).filter(x=>x.status==='error').length;
    const attention=Object.values(steps).filter(x=>x.status==='attention').length;
    emit(
      bad?'error':attention?'attention':'ready',
      bad?`${bad} integração(ões) exigem correção.`:
      attention?`${attention} integração(ões) exigem configuração/revisão.`:
      'Dados, Agenda, Meet/Gemini, Anamnese e WhatsApp conferidos automaticamente.',
      steps
    );
    return !bad&&!attention;
  }catch(err){
    emit('error',err?.message||'Falha na atualização automática.',steps);
    return false;
  }finally{
    busy=false;
  }
}

function queue(delay=700,force=false,reason='automatic'){
  clearTimeout(timer);
  timer=setTimeout(()=>void run({force,reason}),delay);
}
function mobileStyles(){
  if(document.getElementById('rm-mobile-first-v320'))return;
  const s=document.createElement('style');
  s.id='rm-mobile-first-v320';
  s.textContent=`@media(max-width:700px){.content{padding:12px!important}.card{border-radius:16px!important;padding:14px!important}.modal,.modal-panel{max-width:calc(100vw - 16px)!important;max-height:calc(100dvh - 16px)!important}.grid.grid-2,.grid.grid-3,.grid.grid-4{grid-template-columns:1fr!important}.topbar{padding-inline:10px!important}.top-actions .rm-status-chip:not(#rm-orchestrator-v320){display:none!important}#rm-orchestrator-v320{font-size:.68rem!important;min-height:34px!important}.rm-unified-patient-nav-v320{scroll-snap-type:x proximity}.rm-unified-patient-nav-v320 .tab{scroll-snap-align:start;min-height:44px}.btn,.tab,.icon-btn{min-height:44px}textarea.textarea{min-height:160px}.input-row{grid-template-columns:1fr!important}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}}`;
  document.head.appendChild(s);
}

document.addEventListener('rm:data-ready',()=>queue(450,true,'entrada'));
document.addEventListener('rm:app-ready',()=>{if(runtime.dataReady)queue(350,true,'app-pronto')});
document.addEventListener('rm:google-workspace-authorized',()=>queue(650,true,'workspace-autorizado'));
document.addEventListener('rm:data-patched',event=>{
  if(event.detail?.source==='clinical-orchestrator-entry')return;
  queue(900,false,'dados-atualizados');
});
document.addEventListener('rm:rendered',()=>{mobileStyles();paint()});
window.addEventListener('pageshow',()=>{if(runtime.dataReady)queue(300,true,'entrada-na-plataforma')});
window.addEventListener('online',()=>queue(300,true,'online'));
window.addEventListener('focus',()=>{if(runtime.dataReady)queue(350,true,'retorno-à-plataforma')});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&runtime.dataReady)queue(350,true,'retorno-à-plataforma');
});

mobileStyles();
if(runtime.dataReady&&!runtime.locked)queue(250,true,'módulo-carregado');
globalThis.__rmClinicalOrchestrator={
  version:VERSION,
  run:()=>run({force:true,reason:'manual'}),
  status:()=>({...state})
};
