// Ponte de sincronização da agenda — v1.6.1
// Reforça a sincronização após mutações de agendamento sem alterar o fluxo clínico existente.
// Não lê nem transmite dados clínicos; apenas solicita ao mecanismo de sync já autenticado
// que reconcilie o IndexedDB local com o cofre remoto.

const AGENDA_MUTATIONS=new Set([
  'save-appointment',
  'delete-appointment',
  'delete-appointment-series',
  'appointment-attendance'
]);

let generation=0;

function requestSync(reason='agenda'){
  if(globalThis.__rmSyncApplying)return;
  document.dispatchEvent(new CustomEvent('rm:local-data-changed',{
    detail:{storeName:'appointments',kind:`agenda-${reason}`,at:new Date().toISOString()}
  }));

  const current=++generation;
  const force=()=>{
    if(current!==generation||globalThis.__rmSyncApplying||!globalThis.__rmDataReady)return;
    const button=document.getElementById('rm-sync-chip')||document.querySelector('[data-action="sync-now"]');
    if(button&&!button.disabled)button.click();
  };

  // O primeiro disparo aguarda o salvamento/recorrência terminar. O segundo cobre
  // eventual concorrência com um ciclo de sincronização que já estivesse em andamento.
  setTimeout(force,2500);
  setTimeout(force,6500);
}

document.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-action]');
  if(!el||!AGENDA_MUTATIONS.has(el.dataset.action))return;
  const action=el.dataset.action;
  // Captura a intenção antes que os demais módulos fechem/re-renderizem o modal.
  // A reconciliação efetiva só ocorre após o fluxo normal de persistência local.
  setTimeout(()=>requestSync(action),700);
},true);

// Ao retornar à aba após uma edição de agenda, solicita uma reconciliação extra.
window.addEventListener('focus',()=>{
  if(globalThis.__rmDataReady)setTimeout(()=>requestSync('focus'),900);
});
