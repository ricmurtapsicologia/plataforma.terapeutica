(async()=>{
  const VERSION='1.3.0';
  const app=document.getElementById('app');

  const show=(title,message)=>{
    if(!app)return;
    app.innerHTML='';
    const main=document.createElement('main');
    main.style.minHeight='100vh';
    main.style.display='grid';
    main.style.placeItems='center';
    main.style.padding='24px';
    const card=document.createElement('section');
    card.style.maxWidth='720px';
    card.style.width='100%';
    card.style.background='#fff';
    card.style.border='1px solid #d7e7ec';
    card.style.borderRadius='18px';
    card.style.padding='28px';
    card.style.boxShadow='0 18px 50px rgba(33,70,82,.08)';
    const h=document.createElement('h1');
    h.textContent=title;
    h.style.margin='0 0 10px';
    h.style.color='#2f748b';
    h.style.font='700 26px system-ui,sans-serif';
    const p=document.createElement('pre');
    p.textContent=message;
    p.style.margin='0';
    p.style.whiteSpace='pre-wrap';
    p.style.wordBreak='break-word';
    p.style.color='#48636d';
    p.style.font='14px/1.55 system-ui,sans-serif';
    card.append(h,p);main.append(card);app.append(main);
  };

  const clearLegacyCaches=async()=>{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
    }
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith('rm-clinica-')).map(k=>caches.delete(k)));
    }
  };

  const repairTail=(source)=>{
    const start=source.indexOf("document.addEventListener('click',handleClick);");
    const end=source.indexOf("window.addEventListener('hashchange'",start);
    if(start<0||end<0)throw new Error('Não foi possível localizar o bloco final do controlador.');
    const replacement=`document.addEventListener('click',handleClick);\n`+
`document.addEventListener('input',e=>{\n`+
`  resetIdle();\n`+
`  if(e.target.id==='global-search'&&e.target.value.trim().length>=2)globalSearch(e.target.value);\n`+
`  if(e.target.id==='search-modal')globalSearch(e.target.value);\n`+
`  if(e.target.id==='patient-search'){const q=e.target.value.toLowerCase();$$('[data-patient-card]').forEach(card=>card.hidden=!card.dataset.name.includes(q));}\n`+
`  if(e.target.id==='patient-status-filter'){const q=e.target.value;$$('[data-patient-card]').forEach(card=>card.hidden=q&&card.dataset.status!==q);}\n`+
`  if(e.target.id==='comm-message')$('#comm-count').textContent=e.target.value.length+' caracteres';\n`+
`  if(e.target.dataset.action==='record-autosave'){\n`+
`    clearTimeout(autosaveTimer);\n`+
`    const status=$('#record-save-status');if(status)status.textContent='Salvando…';\n`+
`    autosaveTimer=setTimeout(async()=>{\n`+
`      try{\n`+
`        const p=selectedRequired();\n`+
`        const draft={id:'draft_record_'+p.id,patientId:p.id,title:sanitizeText($('#record-title').value),date:$('#record-date').value,text:sanitizeText($('#record-text').value),followup:sanitizeText($('#record-followup').value),updatedAt:nowISO()};\n`+
`        await saveEntity('settings',draft);\n`+
`        const saved=$('#record-save-status');if(saved)saved.textContent='Rascunho salvo localmente.';\n`+
`      }catch(err){const failed=$('#record-save-status');if(failed)failed.textContent='Falha ao salvar rascunho.';console.error(err);}\n`+
`    },700);\n`+
`  }\n`+
`});\n`+
`document.addEventListener('keydown',e=>{\n`+
`  resetIdle();\n`+
`  const typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);\n`+
`  if(e.key==='Escape')closeModal();\n`+
`  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();globalSearch('');}\n`+
`  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!runtime.locked){e.preventDefault();$('#save-record-draft')?.click();}\n`+
`  if(!typing&&e.key.toLowerCase()==='n'){if(runtime.route==='patients')showPatientForm();if(runtime.route==='agenda')showAppointment();}\n`+
`});\n`;
    return source.slice(0,start)+replacement+source.slice(end);
  };

  const simplifyAccess=(source)=>{
    const start=source.indexOf('function vaultView(){');
    const end=source.indexOf('function shell(',start);
    if(start<0||end<0)throw new Error('Não foi possível localizar a tela de acesso.');
    const replacement=`function vaultView(){return\`<main class="vault"><section class="vault-hero"><div><img class="brand-banner" src="assets/images/brand-banner.png" alt="Richelmy Murta, Psicólogo Clínico"><p class="hero-caption">Plataforma clínica pessoal para uso exclusivo do psicólogo.</p><div class="feature-list"><div class="feature"><span class="dot"></span><span>Dados clínicos protegidos e armazenados localmente.</span></div><div class="feature"><span class="dot"></span><span>Agenda, prontuário, plano, exercícios, materiais, documentos e WhatsApp.</span></div><div class="feature"><span class="dot"></span><span>Aplicação estática e local-first, sem portal do paciente.</span></div></div></div></section><section class="vault-panel"><div class="vault-card"><div class="brand-mini"><img src="assets/images/brand-symbol.svg" alt=""><div class="brand-copy"><strong>Richelmy Murta</strong><span>Psicólogo clínico</span></div></div><h1 class="mt-24">Acesso à plataforma</h1><p class="muted">Digite sua senha para continuar.</p><div class="field"><label>Senha</label><input id="vault-password" class="input" type="password" inputmode="numeric" autocomplete="current-password" maxlength="6"></div><button type="button" class="btn ghost w-full mt-8" data-action="toggle-access-password">Mostrar senha</button><button class="btn w-full mt-12" data-action="access-platform">Entrar</button><button class="btn secondary w-full mt-8" data-action="toggle-public-theme">Alternar aparência</button><div class="tiny muted mt-16">Acesso local. Não há sincronização automática dos dados clínicos com o GitHub.</div></div></section></main>\`}\n`;
    source=source.slice(0,start)+replacement+source.slice(end);
    const needle="const a=el.dataset.action;try{";
    const injected=`const a=el.dataset.action;try{\n  if(a==='access-platform'){const pass=$('#vault-password').value;assert(pass,'Digite a senha.');let v;if(runtime.vaultKnown){v=await unlockVault(pass)}else{v=await createVault(pass);runtime.vaultKnown=true}runtime.key=v.key;runtime.salt=v.salt;runtime.locked=false;await loadAll();render();return}\n  if(a==='toggle-access-password'){const input=$('#vault-password');if(!input)return;const show=input.type==='password';input.type=show?'text':'password';el.textContent=show?'Ocultar senha':'Mostrar senha';input.focus();return}\n`;
    if(!source.includes(needle))throw new Error('Não foi possível preparar o acesso por senha.');
    source=source.replace(needle,injected);
    source=source.replaceAll('Cofre bloqueado','Sessão encerrada');
    source=source.replaceAll('Cofre criado','Acesso configurado');
    source=source.replaceAll('Cofre desbloqueado','Acesso autorizado');
    source=source.replaceAll('cofre clínico','armazenamento local');
    source=source.replaceAll('cofre local','armazenamento local');
    return source;
  };

  const absolutizeImports=(source)=>{
    const base=new URL('./',import.meta.url);
    return source.replace(/from\s+(['"])\.\/([^'\"]+)\1/g,(_m,_q,path)=>{
      const url=new URL(path,base);
      url.searchParams.set('v',VERSION);
      return `from '${url.href}'`;
    });
  };

  try{
    show('Carregando plataforma','Preparando a aplicação…');
    await clearLegacyCaches();
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
    show('Falha ao iniciar',details||'O navegador não conseguiu carregar os módulos da plataforma.');
  }
})();
