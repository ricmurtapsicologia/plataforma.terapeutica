import {STORE_NAMES,runtime,setStore,APP_VERSION} from './state.js';
import {openDatabase,unlockVault,getAllDecrypted} from './database.js';
import {runMigrations} from './migrations.js';
import {tryBootstrapFromRemote,startSyncSession} from './secure-sync-v160.js';

const VERSION=APP_VERSION;
const app=document.getElementById('app');
let authenticating=false;
window.__rmBootErrors=[];
window.__rmDataReady=false;

function esc(value=''){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function loginMarkup(message='',kind=''){return `<main class="vault"><section class="vault-hero"><div><img class="brand-banner" src="assets/images/brand-banner.png" alt="Richelmy Murta, Psicólogo Clínico"><p class="hero-caption">Plataforma clínica pessoal para uso exclusivo do psicólogo.</p><div class="feature-list"><div class="feature"><span class="dot"></span><span>Dados clínicos cifrados antes do armazenamento.</span></div><div class="feature"><span class="dot"></span><span>Agenda, prontuário, plano, exercícios, materiais, documentos e WhatsApp.</span></div><div class="feature"><span class="dot"></span><span>Sincronização segura opcional entre os dispositivos autorizados.</span></div></div></div></section><section class="vault-panel"><div class="vault-card"><div class="brand-mini"><img src="assets/images/brand-symbol.svg" alt=""><div class="brand-copy"><strong>Richelmy Murta</strong><span>Psicólogo clínico</span></div></div><h1 class="mt-24">Acesso à plataforma</h1><p class="muted">Digite sua senha para abrir o cofre clínico.</p><div class="field"><label>Senha</label><div style="position:relative"><input id="access-password" class="input" type="password" autocomplete="current-password" spellcheck="false" style="color:transparent;caret-color:#20343d"><span id="access-mask" hidden aria-hidden="true" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);pointer-events:none;color:#48636d;font-size:.95rem">Senha inserida</span></div></div><button type="button" class="btn ghost w-full mt-8" data-access-action="toggle">Mostrar senha</button><button type="button" class="btn w-full mt-12" data-access-action="login">Entrar</button><button type="button" class="btn secondary w-full mt-8" data-access-action="theme">Alternar aparência</button><div id="access-status" class="${message?`notice ${kind==='error'?'warning':''} mt-12`:''}" role="status">${message?esc(message):''}</div><div class="tiny muted mt-16">Versão ${VERSION}. A senha não é publicada no código nem enviada ao GitHub.</div></div></section></main>`}
function showLogin(message='',kind=''){app.innerHTML=loginMarkup(message,kind);queueMicrotask(()=>document.getElementById('access-password')?.focus())}
function setStatus(message,kind=''){const box=document.getElementById('access-status');if(!box)return;box.className=`notice ${kind==='error'?'warning':''} mt-12`;box.textContent=message}
function withTimeout(promise,ms,label){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} excedeu ${Math.round(ms/1000)} segundos.`)),ms)})]).finally(()=>clearTimeout(timer))}
function dataBanner(message,kind='info'){
  let box=document.getElementById('rm-data-status');
  if(!box){box=document.createElement('div');box.id='rm-data-status';box.setAttribute('role','status');box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:9998;max-width:440px;padding:12px 16px;border-radius:12px;box-shadow:0 12px 34px rgba(27,55,66,.18);font:600 14px/1.4 system-ui,sans-serif;';document.body.appendChild(box)}
  box.style.background=kind==='error'?'#fff0f2':kind==='success'?'#eefaf6':'#eef8fb';
  box.style.color=kind==='error'?'#9d3243':kind==='success'?'#246b5c':'#285e70';
  box.style.border=`1px solid ${kind==='error'?'#edc4cb':kind==='success'?'#bfe3d7':'#c7e4ec'}`;
  box.textContent=message;
}
function removeDataBanner(delay=0){setTimeout(()=>document.getElementById('rm-data-status')?.remove(),delay)}
async function loadOptional(label,url){try{await withTimeout(import(url),10000,label);return true}catch(err){console.error(`Falha em ${label}`,err);window.__rmBootErrors.push(`${label}: ${err.message||err}`);return false}}
async function startAppShell(){
  const core=await withTimeout(import(`./app-core-v150.js?v=${VERSION}`),10000,'Núcleo da interface');
  if(typeof core.startCoreApp!=='function')throw new Error('Núcleo da interface indisponível.');
  core.startCoreApp();
  const results=await Promise.all([
    loadOptional('Módulo clínico',`./clinical-v136.js?v=${VERSION}`),
    loadOptional('Ações clínicas',`./actions-v150.js?v=${VERSION}`),
    loadOptional('Recursos premium',`./resources-premium.js?v=${VERSION}`),
    loadOptional('Runtime de UX',`./ux-runtime-v150.js?v=${VERSION}`)
  ]);
  window.__rmModules={core:true,clinical:results[0],actions:results[1],resources:results[2],ux:results[3],sync:true};
  window.__rmRender?.();window.__rmUpdateClock?.();document.dispatchEvent(new CustomEvent('rm:app-ready',{detail:window.__rmModules}));
}
async function loadStore(name,key){try{const rows=await withTimeout(getAllDecrypted(name,key),7000,`Leitura de ${name}`);setStore(name,rows);return{ok:true,name,count:rows.length}}catch(err){console.error('Falha ao carregar store',name,err);setStore(name,[]);window.__rmBootErrors.push(`${name}: ${err.message||err}`);return{ok:false,name,error:err}}}
async function prepareLocalData(v){
  try{
    dataBanner('Carregando pacientes e agenda…');
    const priority=['patients','appointments','records','tasks','payments','settings'].filter(n=>STORE_NAMES.includes(n));
    await Promise.all(priority.map(name=>loadStore(name,v.key)));window.__rmRender?.();window.__rmUpdateClock?.();
    dataBanner('Carregando informações complementares…');const rest=STORE_NAMES.filter(n=>!priority.includes(n));await Promise.all(rest.map(name=>loadStore(name,v.key)));window.__rmRender?.();
    try{await withTimeout(runMigrations(v.key),20000,'Atualização da estrutura local')}catch(err){console.warn('Migração não concluída',err);window.__rmBootErrors.push(`migração: ${err.message||err}`)}
    window.__rmDataReady=true;runtime.dataReady=true;window.__rmRender?.();window.__rmUpdateClock?.();
    document.dispatchEvent(new CustomEvent('rm:data-ready'));
    dataBanner(window.__rmBootErrors.length?'Plataforma aberta. Alguns módulos apresentaram avisos no diagnóstico.':'Dados carregados. Plataforma pronta.',window.__rmBootErrors.length?'info':'success');removeDataBanner(2200);
  }catch(err){console.error('Falha ao preparar dados locais',err);window.__rmBootErrors.push(`dados locais: ${err.message||err}`);runtime.dataReady=false;window.__rmDataReady=false;dataBanner(`A interface está disponível, mas os dados locais não puderam ser carregados: ${err.message||err}`,'error')}
}
async function authenticate(){
  if(authenticating)return;const input=document.getElementById('access-password'),pass=input?.value||'';if(!pass){setStatus('Digite a senha.','error');return}
  authenticating=true;const button=document.querySelector('[data-access-action="login"]');if(button){button.disabled=true;button.textContent='Entrando…'}
  try{
    setStatus('Validando o cofre clínico…');
    await withTimeout(tryBootstrapFromRemote(pass),30000,'Consulta da base sincronizada');
    await withTimeout(openDatabase(),8000,'Abertura do banco local');
    const v=await withTimeout(unlockVault(pass),30000,'Validação do cofre local');
    runtime.key=v.key;runtime.salt=v.salt;runtime.vaultKnown=true;runtime.locked=false;runtime.dataReady=false;
    try{await withTimeout(startSyncSession(pass),30000,'Preparação da sincronização')}catch(err){console.warn('Sincronização não preparada na abertura',err);window.__rmBootErrors.push(`sync: ${err.message||err}`)}
    const hash=location.hash.replace(/^#/,'');runtime.route=['today','agenda','patients','resources','financeiro','settings'].includes(hash)?hash:'today';
    setStatus('Cofre validado. Abrindo interface…');await startAppShell();void prepareLocalData(v);
  }catch(err){console.error('Falha no acesso',err);runtime.locked=true;runtime.key=null;runtime.salt=null;showLogin(err?.message||'Não foi possível abrir a plataforma.','error')}
  finally{authenticating=false;const current=document.querySelector('[data-access-action="login"]');if(current){current.disabled=false;current.textContent='Entrar'}}
}

document.addEventListener('click',e=>{const el=e.target.closest?.('[data-access-action]');if(!el)return;const action=el.dataset.accessAction;if(action==='login'){e.preventDefault();e.stopImmediatePropagation();authenticate();return}if(action==='toggle'){e.preventDefault();e.stopImmediatePropagation();const input=document.getElementById('access-password'),mask=document.getElementById('access-mask');if(!input)return;const showing=input.type==='text';input.type=showing?'password':'text';input.style.color=showing?'transparent':'';if(mask)mask.hidden=!input.value||!showing;el.textContent=showing?'Mostrar senha':'Ocultar senha';input.focus();return}if(action==='theme'){e.preventDefault();e.stopImmediatePropagation();document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'}},true);
document.addEventListener('input',e=>{if(e.target.id!=='access-password')return;const mask=document.getElementById('access-mask');if(mask)mask.hidden=!e.target.value||e.target.type==='text'},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='access-password'){e.preventDefault();authenticate()}},true);
window.addEventListener('error',e=>{window.__rmBootErrors.push(`erro: ${e.message||'erro desconhecido'}`)});window.addEventListener('unhandledrejection',e=>{window.__rmBootErrors.push(`promise: ${e.reason?.message||e.reason||'falha'}`)});
if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister().catch(()=>false)))).catch(()=>{});
showLogin();
