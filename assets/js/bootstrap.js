(async()=>{
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
    card.style.maxWidth='680px';
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
    const p=document.createElement('p');
    p.textContent=message;
    p.style.margin='0';
    p.style.color='#48636d';
    p.style.font='16px/1.55 system-ui,sans-serif';
    card.append(h,p);main.append(card);app.append(main);
  };
  const replacement=`$('#file-input').addEventListener('change',async e=>{\n  const file=e.target.files[0];\n  if(!file)return;\n  try{\n    if(pendingFileAction==='verify-backup'){\n      const x=await verifyBackupFile(file);\n      modal('Backup verificado',\`<p><strong>Exportado em:</strong> \${esc(x.exportedAt||'—')}</p><p><strong>Tamanho:</strong> \${(x.size/1024).toFixed(1)} KB</p><pre>\${esc(JSON.stringify(x.counts,null,2))}</pre>\`,\`<button class="btn" data-action="close-modal">Fechar</button>\`);\n    }else if(pendingFileAction==='restore-backup'){\n      assert(confirm('Restaurar este backup e substituir o banco local atual?'),'Operação cancelada.');\n      await restoreBackup(file);\n      resetRuntime();runtime.vaultKnown=true;closeModal();render();\n      toast('Backup restaurado. Desbloqueie com a senha original.','success');\n    }\n  }catch(err){\n    if(err.message!=='Operação cancelada.')toast(err.message||'Falha ao processar o arquivo.','error');\n  }finally{\n    pendingFileAction=null;\n    e.target.value='';\n  }\n});`;
  try{
    show('Carregando plataforma','Preparando o cofre clínico local…');
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
    }
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith('rm-clinica-')).map(k=>caches.delete(k)));
    }
    const appUrl=new URL('./app.js?v=1.2.2',import.meta.url);
    const response=await fetch(appUrl,{cache:'no-store'});
    if(!response.ok)throw new Error(`Não foi possível carregar app.js (HTTP ${response.status}).`);
    let source=await response.text();
    const start=source.indexOf("$('#file-input').addEventListener('change'");
    const end=source.indexOf("window.addEventListener('hashchange'",start);
    if(start<0||end<0)throw new Error('Não foi possível localizar o trecho de inicialização a corrigir.');
    source=source.slice(0,start)+replacement+'\n'+source.slice(end);
    const moduleBase=new URL('./',appUrl);
    source=source.replace(/from\s+(['"])\.\/([^'"]+)\1/g,(match,quote,path)=>`from ${quote}${new URL(path,moduleBase).href}${quote}`);
    const blobUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try{await import(blobUrl)}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),1000)}
  }catch(err){
    console.error('Falha de inicialização da Plataforma Clínica Richelmy',err);
    show('Falha ao iniciar',err?.message||'O navegador não conseguiu carregar os módulos da plataforma. Atualize a página e tente novamente.');
  }
})();
