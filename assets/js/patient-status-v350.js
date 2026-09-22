const VERSION='3.5.1';
function ensureOption(select,value,label=value){if(!select||[...select.options].some(o=>o.value===value||o.textContent===label))return;const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option)}
function decorate(){const edit=document.getElementById('p-status');if(edit){ensureOption(edit,'Inativo');const card=document.querySelector('[data-patient-card][data-status="Inativo"]');if(edit.dataset.rmStatusInitialized!=='1'){edit.dataset.rmStatusInitialized='1';const current=document.getElementById('p-id')?.value||'';const activeCard=current?document.querySelector(`[data-patient-card] [data-action="edit-patient"][data-id="${CSS.escape(current)}"]`)?.closest('[data-patient-card]'):card;if(activeCard?.dataset.status==='Inativo')edit.value='Inativo'}}const filter=document.getElementById('patient-status-filter');if(filter)ensureOption(filter,'Inativo')}
const queue=()=>queueMicrotask(decorate);
document.addEventListener('rm:rendered',queue);
document.addEventListener('rm:data-ready',queue);
document.addEventListener('rm:modal-opened',queue);
document.addEventListener('rm:app-ready',queue,{once:true});
setTimeout(queue,250);
globalThis.__rmPatientStatus={version:VERSION,decorate};
