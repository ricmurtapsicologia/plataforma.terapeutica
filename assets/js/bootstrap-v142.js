import {STORE_NAMES,runtime,setStore} from './state.js';
import {openDatabase,unlockVault,getAllDecrypted} from './database.js';
import {runMigrations} from './migrations.js';

const VERSION='1.4.2';
const ACCESS_HASH='bd15594e672a0eba1bf38436c9752c5456bcb2bd42c4bed91d8eb6911e0af1ca';
const DELEGATED_ACTIONS=[
  'save-patient','save-appointment','schedule-selected-patient','quick-schedule-patient',
  'agenda-prev-week','agenda-next-week','agenda-today','appointment-whatsapp',
  'patient-whatsapp','patient-email','document-email','clear-patient-local-data',
  'delete-appointment','delete-appointment-series','register-session-from-agenda','clear-patient-draft'
];
const app=document.getElementById('app');
let appStarted=false;
let authenticating=false;

function esc(value=''){
  return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function loginMarkup(message='',kind=''){
  return `<main class="vault">
    <section class="vault-hero">
      <div>
        <img class="brand-banner" src="assets/images/brand-banner.png" alt="Richelmy Murta, Psicólogo Clínico">
        <p class="hero-caption">Plataforma clínica pessoal para uso exclusivo do psicólogo.</p>
        <div class="feature-list">
          <div class="feature"><span class="dot"></span><span>Dados clínicos protegidos e armazenados localmente.</span></div>
          <div class="feature"><span class="dot"></span><span>Agenda, prontuário, plano, exercícios, materiais, documentos e WhatsApp.</span></div>
          <div class="feature"><span class="dot"></span><span>Aplicação estática e local-first, sem portal do paciente.</span></div>
        </div>
      </div>
    </section>
    <section class="vault-panel">
      <div class="vault-card">
        <div class="brand-mini">
          <img src="assets/images/brand-symbol.svg" alt="">
          <div class="brand-copy"><strong>Richelmy Murta</strong><span>Psicólogo clínico</span></div>
        </div>
        <h1 class="mt-24">Acesso à plataforma</h1>
        <p class="muted">Digite sua senha para continuar.</p>
        <div class="field">
          <label>Senha</label>
          <div style="position:relative">
            <input id="access-password" class="input" type="password" autocomplete="current-password" spellcheck="false" style="color:transparent;caret-color:#20343d">
            <span id="access-mask" hidden aria-hidden="true" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);pointer-events:none;color:#48636d;font-size:.95rem">Senha inserida</span>
          </div>
        </div>
        <button type="button" class="btn ghost w-full mt-8" data-access-action="toggle">Mostrar senha</button>
        <button type="button" class="btn w-full mt-12" data-access-action="login">Entrar</button>
        <button type="button" class="btn secondary w-full mt-8" data-access-action="theme">Alternar aparência</button>
        <div id="access-status" class="${message?`notice ${kind==='error'?'warning':''} mt-12`:''}" role="status">${message?esc(message):''}</div>
        <div class="tiny muted mt-16">Acesso local. Os dados clínicos não são publicados no GitHub.</div>
      </div>
    </section>
  </main>`;
}

function showLogin(message='',kind=''){
  if(!app)return;
  app.innerHTML=loginMarkup(message,kind);
  queueMicrotask(()=>document.getElementById('access-password')?.focus());
}

function setStatus(message,kind=''){
  const box=document.getElementById('access-status');
  if(!box)return;
  box.className=`notice ${kind==='error'?'warning':''} mt-12`;
  box.textContent=message;
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function hydrateData(){
  for(const name of STORE_NAMES){
    try{setStore(name,await getAllDecrypted(name,runtime.key))}
    catch(err){console.error('Falha ao carregar área local',name,err);setStore(name,[])}
  }
  try{await runMigrations(runtime.key)}catch(err){console.warn('Migração não aplicada',err)}
}

function repairTail(source){
  const start=source.indexOf("document.addEventListener('click',handleClick);");
  const end=source.indexOf("window.addEventListener('hashchange'",start);
  if(start<0||end<0)throw new Error('Controlador principal não localizado.');
  const replacement=`document.addEventListener('click',handleClick);\n`+
`document.addEventListener('input',e=>{\n`+
` resetIdle();\n`+
` if(e.target.id==='global-search'&&e.target.value.trim().length>=2)globalSearch(e.target.value);\n`+
` if(e.target.id==='search-modal')globalSearch(e.target.value);\n`+
` if(e.target.id==='patient-search'){const q=e.target.value.toLowerCase();$$('[data-patient-card]').forEach(card=>card.hidden=!card.dataset.name.includes(q));}\n`+
` if(e.target.id==='patient-status-filter'){const q=e.target.value;$$('[data-patient-card]').forEach(card=>card.hidden=q&&card.dataset.status!==q);}\n`+
` if(e.target.id==='comm-message'){const c=$('#comm-count');if(c)c.textContent=e.target.value.length+' caracteres';}\n`+
` if(e.target.dataset.action==='record-autosave'){clearTimeout(autosaveTimer);const status=$('#record-save-status');if(status)status.textContent='Salvando…';autosaveTimer=setTimeout(async()=>{try{const p=selectedRequired();const draft={id:'draft_record_'+p.id,patientId:p.id,title:sanitizeText($('#record-title').value),date:$('#record-date').value,text:sanitizeText($('#record-text').value),followup:sanitizeText($('#record-followup').value),updatedAt:nowISO()};await saveEntity('settings',draft);const saved=$('#record-save-status');if(saved)saved.textContent='Rascunho salvo localmente.'}catch(err){const failed=$('#record-save-status');if(failed)failed.textContent='Falha ao salvar rascunho.';console.error(err)}},700);}\n`+
`});\n`+
`document.addEventListener('keydown',e=>{resetIdle();const typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);if(e.key==='Escape')closeModal();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch('')}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!runtime.locked){e.preventDefault();$('#save-record-draft')?.click()}if(!typing&&e.key.toLowerCase()==='n'){if(runtime.route==='patients')showPatientForm();if(runtime.route==='agenda')showAppointment()}});\n`+
`const fileInput=$('#file-input');\n`+
`fileInput?.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(pendingFileAction==='verify-backup'){const x=await verifyBackupFile(file);modal('Backup verificado','<p><strong>Exportado em:</strong> '+esc(x.exportedAt||'—')+'</p><p><strong>Tamanho:</strong> '+(x.size/1024).toFixed(1)+' KB</p><pre>'+esc(JSON.stringify(x.counts,null,2))+'</pre>','<button class="btn" data-action="close-modal">Fechar</button>')}else if(pendingFileAction==='restore-backup'){assert(confirm('Restaurar este backup e substituir os dados locais atuais?'),'Operação cancelada.');await restoreBackup(file);resetRuntime();runtime.vaultKnown=true;closeModal();render();toast('Backup restaurado. Entre novamente para continuar.','success')}}catch(err){toast(err.message||'Falha ao processar o arquivo.','error')}finally{pendingFileAction=null;e.target.value=''}});\n`;
  return source.slice(0,start)+replacement+source.slice(end);
}

function patchAccessView(source){
  const start=source.indexOf('function vaultView(){');
  const end=source.indexOf('function shell(',start);
  if(start<0||end<0)throw new Error('Tela de acesso interna não localizada.');
  const safeMarkup=JSON.stringify(loginMarkup()).replace(/<\/script/gi,'<\\/script');
  source=source.slice(0,start)+`function vaultView(){return ${safeMarkup}}\n`+source.slice(end);
  source=source.replace('Dados locais criptografados','Dados locais protegidos');
  source=source.replace('data-action="lock-vault"><span>${ICON.lock}</span>Bloquear','data-action="lock-vault"><span>${ICON.lock}</span>Sair');
  source=source.replaceAll('Cofre bloqueado por inatividade. Formulários abertos foram fechados por segurança.','Sessão encerrada por inatividade. Formulários abertos foram fechados por segurança.');
  source=source.replaceAll('Cofre bloqueado.','Sessão encerrada.');
  source=source.replaceAll('O cofre foi bloqueado enquanto esta janela estava aberta. Feche a janela, desbloqueie o cofre e tente novamente.','A sessão foi encerrada enquanto esta janela estava aberta. Entre novamente e tente novamente.');
  return source;
}

function patchDelegatedActions(source){
  const needle='const a=el.dataset.action;try{';
  if(!source.includes(needle))throw new Error('Controlador de ações não localizado.');
  const guard=`const a=el.dataset.action;try{if(${JSON.stringify(DELEGATED_ACTIONS)}.includes(a))return;`;
  return source.replace(needle,guard);
}

function absolutizeImports(source){
  const base=new URL('./',import.meta.url);
  const versioned=new Set(['modules/dashboard.js','modules/appointments.js','modules/patients.js','modules/materials.js','modules/documents.js']);
  return source.replace(/from\s+(['"])\.\/([^'\"]+)\1/g,(_m,_q,path)=>{
    const url=new URL(path,base);
    if(versioned.has(path))url.searchParams.set('v',VERSION);
    return `from '${url.href}'`;
  });
}

function exposeRuntimeHooks(source){
  return source+`\nwindow.__rmNavigate=(route)=>setRoute(route);window.__rmRender=()=>render();window.__rmUpdateClock=()=>updateClockChip();\n`;
}

async function startApp(){
  if(appStarted){
    if(typeof window.__rmNavigate==='function')window.__rmNavigate(runtime.route||'today');
    return;
  }
  setStatus('Abrindo plataforma…');
  const appUrl=new URL(`./app.js?v=${VERSION}`,import.meta.url);
  const response=await fetch(appUrl,{cache:'no-store'});
  if(!response.ok)throw new Error(`Não foi possível carregar a aplicação (HTTP ${response.status}).`);
  let source=await response.text();
  source=repairTail(source);
  source=patchAccessView(source);
  source=patchDelegatedActions(source);
  source=absolutizeImports(source);
  source=exposeRuntimeHooks(source);
  const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  try{await import(blobUrl);appStarted=true}
  finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),2500)}
  await Promise.allSettled([
    import(`./clinical-v136.js?v=${VERSION}`),
    import(`./resources-premium.js?v=${VERSION}`)
  ]);
  if(typeof window.__rmNavigate==='function')window.__rmNavigate(runtime.route||'today');
  window.__rmUpdateClock?.();
  window.dispatchEvent(new CustomEvent('rm:app-ready'));
}

async function authenticate(){
  if(authenticating)return;
  const input=document.getElementById('access-password');
  const pass=input?.value||'';
  if(!pass){setStatus('Digite a senha.','error');return}
  authenticating=true;
  const button=document.querySelector('[data-access-action="login"]');
  if(button){button.disabled=true;button.textContent='Entrando…'}
  try{
    if(await sha256Hex(pass)!==ACCESS_HASH)throw new Error('Senha incorreta.');
    setStatus('Senha validada. Carregando seus dados…');
    await openDatabase();
    const v=await unlockVault(pass);
    runtime.key=v.key;
    runtime.salt=v.salt;
    runtime.locked=false;
    runtime.vaultKnown=true;
    const hash=location.hash.replace(/^#/,'');
    runtime.route=['today','agenda','patients','resources','financeiro','settings'].includes(hash)?hash:'today';
    await hydrateData();
    await startApp();
  }catch(err){
    console.error('Falha no acesso',err);
    showLogin(err?.message||'Não foi possível abrir a plataforma.','error');
  }finally{
    authenticating=false;
    const current=document.querySelector('[data-access-action="login"]');
    if(current){current.disabled=false;current.textContent='Entrar'}
  }
}

document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-access-action]');
  if(!el)return;
  const action=el.dataset.accessAction;
  if(action==='login'){e.preventDefault();e.stopImmediatePropagation();authenticate();return}
  if(action==='toggle'){
    e.preventDefault();e.stopImmediatePropagation();
    const input=document.getElementById('access-password');
    const mask=document.getElementById('access-mask');
    if(!input)return;
    const showing=input.type==='text';
    input.type=showing?'password':'text';
    input.style.color=showing?'transparent':'';
    if(mask)mask.hidden=!input.value||!showing;
    el.textContent=showing?'Mostrar senha':'Ocultar senha';
    input.focus();
    return;
  }
  if(action==='theme'){
    e.preventDefault();e.stopImmediatePropagation();
    document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
  }
},true);

document.addEventListener('input',e=>{
  if(e.target.id!=='access-password')return;
  const mask=document.getElementById('access-mask');
  if(mask)mask.hidden=!e.target.value||e.target.type==='text';
},true);

document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.id==='access-password'){e.preventDefault();authenticate()}
},true);

if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.map(r=>r.unregister().catch(()=>false)))).catch(()=>{});
}
showLogin();
