(async()=>{
  const VERSION='1.3.4';
  const ACCESS_HASH='bd15594e672a0eba1bf38436c9752c5456bcb2bd42c4bed91d8eb6911e0af1ca';
  const app=document.getElementById('app');

  function show(title,message){
    if(!app)return;
    app.innerHTML='';
    const main=document.createElement('main');
    main.style.cssText='min-height:100vh;display:grid;place-items:center;padding:24px';
    const card=document.createElement('section');
    card.style.cssText='max-width:720px;width:100%;background:#fff;border:1px solid #d7e7ec;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(33,70,82,.08)';
    const h=document.createElement('h1');
    h.textContent=title;
    h.style.cssText='margin:0 0 10px;color:#2f748b;font:700 26px system-ui,sans-serif';
    const p=document.createElement('pre');
    p.textContent=message;
    p.style.cssText='margin:0;white-space:pre-wrap;word-break:break-word;color:#48636d;font:14px/1.55 system-ui,sans-serif';
    card.append(h,p);main.append(card);app.append(main);
  }

  function repairTail(source){
    const start=source.indexOf("document.addEventListener('click',handleClick);");
    const end=source.indexOf("window.addEventListener('hashchange'",start);
    if(start<0||end<0)throw new Error('Não foi possível localizar o controlador de eventos.');
    const replacement=`document.addEventListener('click',handleClick);\n`+
`document.addEventListener('input',e=>{\n`+
`  resetIdle();\n`+
`  if(e.target.id==='vault-password'){const mask=document.getElementById('access-mask');if(mask){mask.hidden=!e.target.value||e.target.type==='text';}}\n`+
`  if(e.target.id==='global-search'&&e.target.value.trim().length>=2)globalSearch(e.target.value);\n`+
`  if(e.target.id==='search-modal')globalSearch(e.target.value);\n`+
`  if(e.target.id==='patient-search'){const q=e.target.value.toLowerCase();$$('[data-patient-card]').forEach(card=>card.hidden=!card.dataset.name.includes(q));}\n`+
`  if(e.target.id==='patient-status-filter'){const q=e.target.value;$$('[data-patient-card]').forEach(card=>card.hidden=q&&card.dataset.status!==q);}\n`+
`  if(e.target.id==='comm-message'){const counter=$('#comm-count');if(counter)counter.textContent=e.target.value.length+' caracteres';}\n`+
`  if(e.target.dataset.action==='record-autosave'){clearTimeout(autosaveTimer);const status=$('#record-save-status');if(status)status.textContent='Salvando…';autosaveTimer=setTimeout(async()=>{try{const p=selectedRequired();const draft={id:'draft_record_'+p.id,patientId:p.id,title:sanitizeText($('#record-title').value),date:$('#record-date').value,text:sanitizeText($('#record-text').value),followup:sanitizeText($('#record-followup').value),updatedAt:nowISO()};await saveEntity('settings',draft);const saved=$('#record-save-status');if(saved)saved.textContent='Rascunho salvo localmente.';}catch(err){const failed=$('#record-save-status');if(failed)failed.textContent='Falha ao salvar rascunho.';console.error(err);}},700);}\n`+
`});\n`+
`document.addEventListener('keydown',e=>{\n`+
`  resetIdle();\n`+
`  const typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);\n`+
`  if(e.key==='Escape')closeModal();\n`+
`  if(e.key==='Enter'&&e.target.id==='vault-password'){e.preventDefault();document.querySelector('[data-action="unlock-vault"]')?.click();}\n`+
`  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch('');}\n`+
`  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!runtime.locked){e.preventDefault();$('#save-record-draft')?.click();}\n`+
`  if(!typing&&e.key.toLowerCase()==='n'){if(runtime.route==='patients')showPatientForm();if(runtime.route==='agenda')showAppointment();}\n`+
`});\n`;
    return source.slice(0,start)+replacement+source.slice(end);
  }

  function simplifyAccess(source){
    const start=source.indexOf('function vaultView(){');
    const end=source.indexOf('function shell(',start);
    if(start<0||end<0)throw new Error('Não foi possível localizar a tela de acesso.');

    const replacement=`function vaultView(){return\`<main class="vault"><section class="vault-hero"><div><img class="brand-banner" src="assets/images/brand-banner.png" alt="Richelmy Murta, Psicólogo Clínico"><p class="hero-caption">Plataforma clínica pessoal para uso exclusivo do psicólogo.</p><div class="feature-list"><div class="feature"><span class="dot"></span><span>Dados clínicos protegidos e armazenados localmente.</span></div><div class="feature"><span class="dot"></span><span>Agenda, prontuário, plano, exercícios, materiais, documentos e WhatsApp.</span></div><div class="feature"><span class="dot"></span><span>Aplicação estática e local-first, sem portal do paciente.</span></div></div></div></section><section class="vault-panel"><div class="vault-card"><div class="brand-mini"><img src="assets/images/brand-symbol.svg" alt=""><div class="brand-copy"><strong>Richelmy Murta</strong><span>Psicólogo clínico</span></div></div><h1 class="mt-24">Acesso à plataforma</h1><p class="muted">Digite sua senha para continuar.</p><div class="field"><label>Senha</label><div style="position:relative"><input id="vault-password" class="input" type="password" autocomplete="off" spellcheck="false" style="color:transparent;caret-color:#20343d"><span id="access-mask" hidden aria-hidden="true" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);pointer-events:none;color:#48636d;font-size:.95rem">Senha inserida</span></div></div><button type="button" class="btn ghost w-full mt-8" data-action="toggle-access-password">Mostrar senha</button><button type="button" class="btn w-full mt-12" data-action="unlock-vault">Entrar</button><button type="button" class="btn secondary w-full mt-8" data-action="toggle-public-theme">Alternar aparência</button><div class="tiny muted mt-16">Acesso local. Os dados clínicos não são publicados no GitHub.</div></div></section></main>\`}\n`;
    source=source.slice(0,start)+replacement+source.slice(end);

    const needle="const a=el.dataset.action;try{";
    if(!source.includes(needle))throw new Error('Não foi possível preparar os controles da tela de acesso.');

    const accessHandler=`const a=el.dataset.action;try{\n`+
`  if(a==='toggle-access-password'){const input=$('#vault-password');const mask=document.getElementById('access-mask');if(!input)return;const visible=input.type==='text';input.type=visible?'password':'text';input.style.color=visible?'transparent':'';if(mask)mask.hidden=visible?!input.value:true;el.textContent=visible?'Mostrar senha':'Ocultar senha';input.focus();return}\n`+
`  if(a==='unlock-vault'){\n`+
`    const pass=$('#vault-password')?.value||'';\n`+
`    assert(pass,'Digite a senha.');\n`+
`    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pass));\n`+
`    const hex=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');\n`+
`    if(hex!=='${ACCESS_HASH}')throw new Error('Senha incorreta.');\n`+
`    const v=runtime.vaultKnown?await unlockVault(pass):await createVault(pass);\n`+
`    runtime.key=v.key;runtime.salt=v.salt;runtime.locked=false;runtime.vaultKnown=true;runtime.route='today';\n`+
`    await loadAll();\n`+
`    location.hash='today';\n`+
`    app.innerHTML=shell(renderDashboard());\n`+
`    updateClockChip();\n`+
`    toast('Acesso autorizado.','success');\n`+
`    return;\n`+
`  }\n`;
    source=source.replace(needle,accessHandler);

    source=source.replaceAll('Cofre bloqueado','Sessão encerrada');
    source=source.replaceAll('Cofre criado','Acesso configurado');
    source=source.replaceAll('Cofre desbloqueado','Acesso autorizado');
    source=source.replaceAll('cofre clínico','armazenamento local');
    source=source.replaceAll('cofre local','armazenamento local');
    return source;
  }

  function absolutizeImports(source){
    const base=new URL('./',import.meta.url);
    return source.replace(/from\s+(['"])\.\/([^'\"]+)\1/g,(_m,_q,path)=>{
      const url=new URL(path,base);
      return `from '${url.href}'`;
    });
  }

  try{
    show('Carregando plataforma','Preparando a aplicação…');
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
    }
    const appUrl=new URL(`./app.js?v=${VERSION}`,import.meta.url);
    const response=await fetch(appUrl,{cache:'no-store'});
    if(!response.ok)throw new Error(`Não foi possível carregar app.js (HTTP ${response.status}).`);
    let source=await response.text();
    source=repairTail(source);
    source=simplifyAccess(source);
    source=absolutizeImports(source);
    const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try{await import(blobUrl)}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),1500)}
  }catch(err){
    console.error('Falha de inicialização da Plataforma Clínica Richelmy',err);
    const details=[err?.message,err?.stack].filter(Boolean).join('\n\n');
    show('Falha ao iniciar',details||'O navegador não conseguiu carregar a plataforma.');
  }
})();
