import {STORE_NAMES,runtime,setStore} from './state.js';
import {openDatabase,unlockVault,getAllDecrypted} from './database.js';
import {runMigrations} from './migrations.js';

const VERSION='1.5.0';
const ACCESS_HASH='bd15594e672a0eba1bf38436c9752c5456bcb2bd42c4bed91d8eb6911e0af1ca';
const app=document.getElementById('app');
let authenticating=false;
window.__rmBootErrors=[];

function esc(value=''){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function loginMarkup(message='',kind=''){return `<main class="vault"><section class="vault-hero"><div><img class="brand-banner" src="assets/images/brand-banner.png" alt="Richelmy Murta, Psicólogo Clínico"><p class="hero-caption">Plataforma clínica pessoal para uso exclusivo do psicólogo.</p><div class="feature-list"><div class="feature"><span class="dot"></span><span>Dados clínicos protegidos e armazenados localmente.</span></div><div class="feature"><span class="dot"></span><span>Agenda, prontuário, plano, exercícios, materiais, documentos e WhatsApp.</span></div><div class="feature"><span class="dot"></span><span>Aplicação estática e local-first, sem portal do paciente.</span></div></div></div></section><section class="vault-panel"><div class="vault-card"><div class="brand-mini"><img src="assets/images/brand-symbol.svg" alt=""><div class="brand-copy"><strong>Richelmy Murta</strong><span>Psicólogo clínico</span></div></div><h1 class="mt-24">Acesso à plataforma</h1><p class="muted">Digite sua senha para continuar.</p><div class="field"><label>Senha</label><div style="position:relative"><input id="access-password" class="input" type="password" autocomplete="current-password" spellcheck="false" style="color:transparent;caret-color:#20343d"><span id="access-mask" hidden aria-hidden="true" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);pointer-events:none;color:#48636d;font-size:.95rem">Senha inserida</span></div></div><button type="button" class="btn ghost w-full mt-8" data-access-action="toggle">Mostrar senha</button><button type="button" class="btn w-full mt-12" data-access-action="login">Entrar</button><button type="button" class="btn secondary w-full mt-8" data-access-action="theme">Alternar aparência</button><div id="access-status" class="${message?`notice ${kind==='error'?'warning':''} mt-12`:''}" role="status">${message?esc(message):''}</div><div class="tiny muted mt-16">Versão ${VERSION}. Dados clínicos não são publicados no GitHub.</div></div></section></main>`}
function showLogin(message='',kind=''){app.innerHTML=loginMarkup(message,kind);queueMicrotask(()=>document.getElementById('access-password')?.focus())}
function setStatus(message,kind=''){const box=document.getElementById('access-status');if(!box)return;box.className=`notice ${kind==='error'?'warning':''} mt-12`;box.textContent=message}
async function sha256Hex(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function withTimeout(promise,ms,label){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} excedeu ${Math.round(ms/1000)} segundos.`)),ms))])}
async function hydrateData(){for(const name of STORE_NAMES){try{setStore(name,await getAllDecrypted(name,runtime.key))}catch(err){console.error('Falha ao carregar store',name,err);setStore(name,[]);window.__rmBootErrors.push(`${name}: ${err.message||err}`)}}try{await runMigrations(runtime.key)}catch(err){console.warn('Migração não aplicada',err);window.__rmBootErrors.push(`migração: ${err.message||err}`)}}
async function loadOptional(label,url){try{await withTimeout(import(url),10000,label);return true}catch(err){console.error(`Falha em ${label}`,err);window.__rmBootErrors.push(`${label}: ${err.message||err}`);return false}}
async function startApp(){
  const core=await withTimeout(import(`./app-core-v150.js?v=${VERSION}`),10000,'Núcleo da interface');
  if(typeof core.startCoreApp!=='function')throw new Error('Núcleo da interface indisponível.');
  core.startCoreApp();
  const results=await Promise.all([
    loadOptional('Módulo clínico',`./clinical-v136.js?v=${VERSION}`),
    loadOptional('Ações clínicas',`./actions-v150.js?v=${VERSION}`),
    loadOptional('Recursos premium',`./resources-premium.js?v=${VERSION}`),
    loadOptional('Runtime de UX',`./ux-runtime-v150.js?v=${VERSION}`)
  ]);
  window.__rmModules={core:true,clinical:results[0],actions:results[1],resources:results[2],ux:results[3]};
  window.__rmRender?.();
  window.__rmUpdateClock?.();
  document.dispatchEvent(new CustomEvent('rm:app-ready',{detail:window.__rmModules}));
}
async function authenticate(){if(authenticating)return;const input=document.getElementById('access-password'),pass=input?.value||'';if(!pass){setStatus('Digite a senha.','error');return}authenticating=true;const button=document.querySelector('[data-access-action="login"]');if(button){button.disabled=true;button.textContent='Entrando…'}try{if(await sha256Hex(pass)!==ACCESS_HASH)throw new Error('Senha incorreta.');setStatus('Senha validada. Carregando dados locais…');await withTimeout(openDatabase(),10000,'Abertura do banco local');const v=await withTimeout(unlockVault(pass),10000,'Validação dos dados locais');runtime.key=v.key;runtime.salt=v.salt;runtime.locked=false;runtime.vaultKnown=true;const hash=location.hash.replace(/^#/,'');runtime.route=['today','agenda','patients','resources','financeiro','settings'].includes(hash)?hash:'today';await withTimeout(hydrateData(),15000,'Leitura dos dados clínicos');await startApp()}catch(err){console.error('Falha no acesso',err);showLogin(err?.message||'Não foi possível abrir a plataforma.','error')}finally{authenticating=false;const current=document.querySelector('[data-access-action="login"]');if(current){current.disabled=false;current.textContent='Entrar'}}}

document.addEventListener('click',e=>{const el=e.target.closest?.('[data-access-action]');if(!el)return;const action=el.dataset.accessAction;if(action==='login'){e.preventDefault();e.stopImmediatePropagation();authenticate();return}if(action==='toggle'){e.preventDefault();e.stopImmediatePropagation();const input=document.getElementById('access-password'),mask=document.getElementById('access-mask');if(!input)return;const showing=input.type==='text';input.type=showing?'password':'text';input.style.color=showing?'transparent':'';if(mask)mask.hidden=!input.value||!showing;el.textContent=showing?'Mostrar senha':'Ocultar senha';input.focus();return}if(action==='theme'){e.preventDefault();e.stopImmediatePropagation();document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'}},true);
document.addEventListener('input',e=>{if(e.target.id!=='access-password')return;const mask=document.getElementById('access-mask');if(mask)mask.hidden=!e.target.value||e.target.type==='text'},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='access-password'){e.preventDefault();authenticate()}},true);
window.addEventListener('error',e=>{window.__rmBootErrors.push(`erro: ${e.message||'erro desconhecido'}`)});
window.addEventListener('unhandledrejection',e=>{window.__rmBootErrors.push(`promise: ${e.reason?.message||e.reason||'falha'}`)});
if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister().catch(()=>false)))).catch(()=>{});
showLogin();
