(async()=>{
  const VERSION='1.2.9';
  const DB_NAME='richelmy-clinica-db';
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

  const deleteLocalDatabase=()=>new Promise((resolve,reject)=>{
    const req=indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess=()=>resolve();
    req.onerror=()=>reject(req.error||new Error('Não foi possível apagar o cofre local.'));
    req.onblocked=()=>reject(new Error('O cofre está aberto em outra aba. Feche todas as outras abas da plataforma e tente novamente.'));
  });

  const clearOldCaches=async()=>{
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
    if(start<0||end<0)throw new Error('Não foi possível localizar o bloco final do controlador para correção.');
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
`        const saved=$('#record-save-status');if(saved)saved.textContent='Rascunho salvo no cofre local.';\n`+
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

  const removePasswordDisclosure=(source)=>source.replace(/<div class="notice warning">Senha operacional configurada:[\s\S]*?<\/div>/,'');

  const absolutizeImports=(source)=>{
    const base=new URL('./',import.meta.url);
    return source.replace(/from\s+(['"])\.\/([^'\"]+)\1/g,(_m,_q,path)=>{
      const url=new URL(path,base);
      url.searchParams.set('v',VERSION);
      return `from '${url.href}'`;
    });
  };

  const enhanceVault=()=>{
    const warning=[...document.querySelectorAll('.notice.warning')].find(el=>el.textContent.includes('Senha operacional configurada'));
    if(warning)warning.remove();
    const input=document.getElementById('vault-password');
    if(!input)return;

    if(!document.getElementById('vault-password-toggle')){
      const button=document.createElement('button');
      button.id='vault-password-toggle';
      button.type='button';
      button.textContent='Mostrar senha';
      button.style.marginTop='8px';
      button.style.border='0';
      button.style.background='transparent';
      button.style.color='#2f748b';
      button.style.font='600 13px system-ui,sans-serif';
      button.style.cursor='pointer';
      button.addEventListener('click',()=>{
        const showing=input.type==='text';
        input.type=showing?'password':'text';
        button.textContent=showing?'Mostrar senha':'Ocultar senha';
        input.focus();
      });
      input.insertAdjacentElement('afterend',button);
    }

    const card=input.closest('.vault-card');
    if(card&&!document.getElementById('reset-local-vault')){
      const reset=document.createElement('button');
      reset.id='reset-local-vault';
      reset.type='button';
      reset.textContent='Reiniciar cofre local';
      reset.style.width='100%';
      reset.style.marginTop='10px';
      reset.style.padding='11px 14px';
      reset.style.border='1px solid #d7e7ec';
      reset.style.borderRadius='12px';
      reset.style.background='transparent';
      reset.style.color='#7a4b4b';
      reset.style.font='600 13px system-ui,sans-serif';
      reset.style.cursor='pointer';
      reset.addEventListener('click',()=>{
        const first=confirm('Reiniciar o cofre apagará os dados criptografados armazenados SOMENTE neste navegador. Se houver algo que deseja preservar, clique em Cancelar. Deseja continuar?');
        if(!first)return;
        const second=confirm('Confirma a exclusão do cofre local antigo? Depois será criado um novo cofre para usar a senha 213098.');
        if(!second)return;
        const url=new URL(location.href);
        url.search='';
        url.searchParams.set('reset-vault','1');
        location.href=url.href;
      });
      const version=[...card.querySelectorAll('.tiny')].find(el=>el.textContent.includes('Versão'));
      if(version)card.insertBefore(reset,version);else card.appendChild(reset);
    }
  };

  try{
    show('Carregando plataforma','Preparando o cofre clínico…');
    await clearOldCaches();

    const params=new URLSearchParams(location.search);
    if(params.get('reset-vault')==='1'){
      show('Reiniciando cofre local','Apagando apenas o cofre antigo deste navegador…');
      await deleteLocalDatabase();
      const clean=new URL(location.href);
      clean.search='';
      history.replaceState(null,'',clean.pathname+clean.hash);
    }

    const appUrl=new URL(`./app.js?v=${VERSION}`,import.meta.url);
    const response=await fetch(appUrl,{cache:'no-store'});
    if(!response.ok)throw new Error(`Não foi possível carregar app.js (HTTP ${response.status}).`);
    let source=await response.text();
    source=repairTail(source);
    source=removePasswordDisclosure(source);
    source=absolutizeImports(source);
    const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try{await import(blobUrl)}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),1500)}
    enhanceVault();
    new MutationObserver(enhanceVault).observe(app,{childList:true,subtree:true});
  }catch(err){
    console.error('Falha de inicialização da Plataforma Clínica Richelmy',err);
    const details=[err?.message,err?.stack].filter(Boolean).join('\n\n');
    show('Falha ao iniciar',details||'O navegador não conseguiu carregar os módulos da plataforma.');
  }
})();
