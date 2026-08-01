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
    await import('./app.js?v=1.2.1');
  }catch(err){
    console.error('Falha de inicialização da Plataforma Clínica Richelmy',err);
    show('Falha ao iniciar',err?.message||'O navegador não conseguiu carregar os módulos da plataforma. Atualize a página e tente novamente.');
  }
})();
