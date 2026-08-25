import {runtime} from './state.js';
import {performSync} from './secure-sync-v260.js';
import {reconcileGemini} from './clinical-reconcile-v270.js';
import {reconcileClinicalIntakes} from './clinical-intake-runtime-v310.js';
import {loadWorkspaceAuthorization,WORKSPACE_REQUIRED_SCOPES} from './google-workspace-token-v260.js';

const VERSION='3.2.0';
const MIN_INTERVAL=45000;
let busy=false,lastAt=0,timer=null;
let state={status:'idle',detail:'Aguardando abertura do cofre.',lastRunAt:'',steps:{}};
function emit(status,detail,steps=state.steps){state={status,detail,lastRunAt:new Date().toISOString(),steps};globalThis.__rmClinicalOrchestratorStatus={...state,version:VERSION};document.dispatchEvent(new CustomEvent('rm:clinical-orchestrator-status',{detail:globalThis.__rmClinicalOrchestratorStatus}));paint()}
function step(steps,name,status,detail=''){steps[name]={status,detail,at:new Date().toISOString()};emit('syncing','Atualizando ecossistema clínico…',steps)}
function paint(){if(runtime.locked)return;const top=document.querySelector('.top-actions');if(!top)return;let chip=document.getElementById('rm-orchestrator-v320');if(!chip){chip=document.createElement('button');chip.id='rm-orchestrator-v320';chip.type='button';chip.dataset.route='settings';top.insertBefore(chip,top.firstChild)}const needs=state.status==='attention'||state.status==='error';chip.className=`rm-status-chip ${state.status==='ready'?'ok':needs?'warn':''}`;chip.textContent=state.status==='ready'?'Ecossistema ✓':needs?'Ecossistema !':'Ecossistema ↻';chip.title=state.detail}
async function run({force=false,reason='automatic'}={}){if(busy||runtime.locked||!runtime.key||!runtime.dataReady||!navigator.onLine)return false;if(!force&&Date.now()-lastAt<MIN_INTERVAL)return false;busy=true;lastAt=Date.now();const steps={};emit('syncing',`Atualização automática iniciada (${reason}).`,steps);try{
  const auth=await loadWorkspaceAuthorization(WORKSPACE_REQUIRED_SCOPES);step(steps,'workspace',auth.ok?'ok':'attention',auth.ok?'Google Workspace autorizado.':`Autorização pendente: ${auth.reason}.`);
  if(auth.ok){
    try{const ok=await performSync({manual:true});step(steps,'data',ok?'ok':'attention',ok?'Cofre privado reconciliado.':'Sincronização privada requer configuração ou revisão.')}catch(err){step(steps,'data','error',err?.message||'Falha na sincronização privada.')}
    try{const intake=await reconcileClinicalIntakes({reason:'orchestrator',force:true});step(steps,'intake',intake?.ok?'ok':'attention',intake?.ok?'Anamneses conferidas.':String(intake?.reason||'Anamnese pendente.'))}catch(err){step(steps,'intake','error',err?.message||'Falha na anamnese.')}
    try{const gemini=await reconcileGemini({force:true,quiet:true,reason:'orchestrator'});step(steps,'meet',gemini!==false?'ok':'attention','Meet/Gemini reconciliado.')}catch(err){step(steps,'meet','error',err?.message||'Falha no Meet/Gemini.')}
    try{if(globalThis.__rmClinicalAuditPolicy?.run){await globalThis.__rmClinicalAuditPolicy.run({quiet:true});step(steps,'identity','ok','Associações clínicas auditadas.')}}catch(err){step(steps,'identity','error',err?.message||'Falha na política clínica.')}
    try{if(globalThis.__rmClinicalWhatsAppBridge?.cycle){await globalThis.__rmClinicalWhatsAppBridge.cycle();step(steps,'whatsapp','ok','WhatsApp clínico conferido.')}}catch(err){step(steps,'whatsapp','error',err?.message||'Falha no WhatsApp.')}
  }
  const bad=Object.values(steps).filter(x=>x.status==='error').length,attention=Object.values(steps).filter(x=>x.status==='attention').length;emit(bad?'error':attention?'attention':'ready',bad?`${bad} integração(ões) exigem correção.`:attention?`${attention} integração(ões) exigem configuração/revisão.`:'Workspace, dados, Meet/Gemini, Anamnese e WhatsApp conferidos automaticamente.',steps);return !bad&&!attention
}catch(err){emit('error',err?.message||'Falha na atualização automática.',steps);return false}finally{busy=false}}
function queue(delay=700,force=false,reason='automatic'){clearTimeout(timer);timer=setTimeout(()=>void run({force,reason}),delay)}
function mobileStyles(){if(document.getElementById('rm-mobile-first-v320'))return;const s=document.createElement('style');s.id='rm-mobile-first-v320';s.textContent=`@media(max-width:700px){.content{padding:12px!important}.card{border-radius:16px!important;padding:14px!important}.modal,.modal-panel{max-width:calc(100vw - 16px)!important;max-height:calc(100dvh - 16px)!important}.grid.grid-2,.grid.grid-3,.grid.grid-4{grid-template-columns:1fr!important}.topbar{padding-inline:10px!important}.top-actions .rm-status-chip:not(#rm-orchestrator-v320){display:none!important}#rm-orchestrator-v320{font-size:.68rem!important;min-height:34px!important}.rm-unified-patient-nav-v320{scroll-snap-type:x proximity}.rm-unified-patient-nav-v320 .tab{scroll-snap-align:start;min-height:44px}.btn,.tab,.icon-btn{min-height:44px}textarea.textarea{min-height:160px}.input-row{grid-template-columns:1fr!important}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}}`;document.head.appendChild(s)}

document.addEventListener('rm:data-ready',()=>queue(1100,true,'entrada'));
document.addEventListener('rm:google-workspace-authorized',()=>queue(900,true,'workspace-autorizado'));
document.addEventListener('rm:data-patched',()=>queue(1200,false,'dados-atualizados'));
document.addEventListener('rm:rendered',()=>{mobileStyles();paint()});
window.addEventListener('online',()=>queue(500,true,'online'));
window.addEventListener('focus',()=>queue(500,false,'foco'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue(550,false,'visibilidade')});
mobileStyles();
globalThis.__rmClinicalOrchestrator={version:VERSION,run:()=>run({force:true,reason:'manual'}),status:()=>({...state})};
