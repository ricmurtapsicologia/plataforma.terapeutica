/* Agenda — ações mais intuitivas e acessíveis v1.7.7 */
const ACTIONS=[
  {
    selector:'.week-wa',
    label:'Enviar lembrete pelo WhatsApp',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"/><path d="M9.2 8.8c.5 2.3 1.8 3.7 4.1 4.7"/><path d="m13.2 13.5 1.5-1.1 1.8.8-.2 1.8c-.3.5-1 .8-1.6.7-4.5-.7-6.9-3.1-7.6-7.6-.1-.6.2-1.3.7-1.6l1.8-.2.8 1.8-1.2 1.5"/></svg>'
  },
  {
    selector:'.week-register',
    label:'Registrar sessão',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h6"/><path d="M9 3h6v4H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="m8 14 2.2 2.2L16 10.5"/></svg>'
  },
  {
    selector:'.week-manage',
    label:'Presença e pagamento',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="m3.5 6 1 1 2-2"/><path d="m3.5 12 1 1 2-2"/><path d="m3.5 18 1 1 2-2"/></svg>'
  },
  {
    selector:'.week-delete',
    label:'Excluir agendamento',
    icon:'<svg class="week-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6 18 21H6L5 6"/><path d="M10 10v7"/><path d="M14 10v7"/></svg>'
  }
];

function enhanceActionButtons(root=document){
  ACTIONS.forEach(action=>{
    root.querySelectorAll(action.selector).forEach(button=>{
      button.innerHTML=action.icon;
      button.setAttribute('aria-label',action.label);
      button.setAttribute('title',action.label);
      button.dataset.actionLabel=action.label;
    });
  });
}

function legendMarkup(){
  return `<div class="agenda-action-legend" id="agenda-action-legend" aria-label="Legenda das ações da agenda"><span class="agenda-action-legend-title">Ações:</span>${ACTIONS.map(action=>`<span class="agenda-action-key ${action.selector.slice(1)}">${action.icon}<span>${action.label}</span></span>`).join('')}</div>`;
}

function ensureLegend(){
  if(!document.querySelector('.week-calendar-wrap')||document.getElementById('agenda-action-legend'))return;
  const toolbar=document.querySelector('.agenda-toolbar');
  if(toolbar)toolbar.insertAdjacentHTML('afterend',legendMarkup());
}

function enhanceAgenda(){
  if(!document.querySelector('.week-calendar-wrap'))return;
  enhanceActionButtons();
  ensureLegend();
}

document.addEventListener('rm:rendered',()=>queueMicrotask(enhanceAgenda));
document.addEventListener('rm:app-ready',()=>setTimeout(enhanceAgenda,80));
document.addEventListener('rm:data-ready',()=>setTimeout(enhanceAgenda,80));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(enhanceAgenda,120));
else setTimeout(enhanceAgenda,120);
