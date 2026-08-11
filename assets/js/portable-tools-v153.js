import {data,runtime} from './state.js';
import {downloadBlob} from './backup.js';
import {modal,toast,esc} from './ui.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const q=s=>document.querySelector(s);
const VERSION='1.5.4';

function scalar(v){
  if(v===null||v===undefined)return'';
  if(typeof v==='object')return JSON.stringify(v);
  return String(v);
}
function xmlEsc(v=''){return String(v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function section(title,rows){
  if(!rows.length)return`<tr><td colspan="2" class="section">${xmlEsc(title)}</td></tr><tr><td colspan="2">Sem registros</td></tr>`;
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r||{})).filter(k=>k!=='photo'&&k!=='encrypted'))];
  return`<tr><td colspan="${Math.max(1,keys.length)}" class="section">${xmlEsc(title)}</td></tr><tr>${keys.map(k=>`<th>${xmlEsc(k)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${keys.map(k=>`<td>${xmlEsc(scalar(r?.[k]))}</td>`).join('')}</tr>`).join('')}`;
}
function exportExcel(){
  if(runtime.locked)throw new Error('Entre novamente na plataforma.');
  const stores=[
    ['Pacientes',arr(data.patients)],['Agenda',arr(data.appointments)],['Prontuários',arr(data.records)],
    ['Notas',arr(data.notes)],['Conceitualizações',arr(data.formulations)],['Objetivos',arr(data.goals)],
    ['Tarefas',arr(data.tasks)],['Materiais',arr(data.materials)],['Documentos',arr(data.documents)],
    ['Financeiro',arr(data.payments)],['Consentimentos',arr(data.consents)],['Comunicações',arr(data.communications)]
  ];
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;font-size:10pt}th,td{border:1px solid #cbdce2;padding:6px 8px;vertical-align:top}th{background:#eaf5f8;color:#275f73}.section{background:#4ba4c1;color:#fff;font-size:13pt;font-weight:700;padding:10px}tr{mso-height-source:auto}</style></head><body><table>${stores.map(([n,r])=>section(n,r)).join('<tr><td style="height:18px;border:0"></td></tr>')}</table></body></html>`;
  const bom='\ufeff';
  const blob=new Blob([bom,html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const date=new Date().toISOString().slice(0,10);
  downloadBlob(blob,`richelmy-clinica-${date}.xls`);
  toast('Exportação Excel criada. O arquivo é legível e não é criptografado.','success');
}

function syncCard(){
  return`<section id="rm-portable-tools" class="grid grid-2 mt-16"><div class="card"><h3>Exportação organizada</h3><p class="muted">Gera um arquivo Excel legível com os dados organizados por áreas. Fotografias não são incorporadas para evitar arquivos excessivamente grandes.</p><button class="btn" data-action="export-readable-excel">Exportar Excel</button><div class="notice warning mt-16"><strong>Atenção:</strong> o Excel é legível e não criptografado. Para restauração integral e preservação da criptografia, mantenha também o backup seguro <code>.rmvault</code>.</div></div><div class="card"><h3>Sincronização entre notebook e celular</h3><div class="list"><div class="list-item"><span>Aplicativo GitHub Pages</span><strong>Atualiza o código</strong></div><div class="list-item"><span>Dados clínicos entre dispositivos</span><strong>Sincronização automática</strong></div><div class="list-item"><span>Storage clínico</span><strong>Google Drive privado</strong></div></div><p class="muted mt-16">Depois da configuração inicial, alterações locais são sincronizadas automaticamente com o cofre privado no Google Drive. O GitHub público permanece somente como superfície de código e não recebe novas gravações clínicas.</p><button class="btn secondary" data-action="sync-requirements">Como funciona a sincronização</button></div></section>`;
}
function paint(){
  if(runtime.locked||runtime.route!=='settings')return;
  const main=q('#main-content');
  if(!main||q('#rm-portable-tools'))return;
  main.insertAdjacentHTML('beforeend',syncCard());
}
function showSyncRequirements(){
  modal('Sincronização automática entre dispositivos',`<div class="notice"><strong>O Google Drive privado é o storage clínico remoto.</strong></div><p class="mt-16">Depois que o dispositivo é autorizado e recebe o código de sincronização do cofre, as alterações são reconciliadas automaticamente. O botão “Sincronizar agora” permanece apenas para contingência e diagnóstico.</p><div class="section-label mt-16">Gatilhos automáticos</div><ol><li>Alterações locais após pequeno debounce.</li><li>Retorno da conexão após período offline.</li><li>Retorno à aba da plataforma.</li><li>Heartbeat periódico de segurança.</li></ol><p>O GitHub Pages atualiza apenas o código da aplicação. Dados clínicos permanecem cifrados localmente e no storage privado do Google Drive.</p>`,`<button class="btn" data-action="close-modal">Fechar</button>`,true);
}

document.addEventListener('click',e=>{const el=e.target.closest?.('[data-action]');if(!el)return;try{if(el.dataset.action==='export-readable-excel'){e.preventDefault();e.stopImmediatePropagation();exportExcel()}else if(el.dataset.action==='sync-requirements'){e.preventDefault();e.stopImmediatePropagation();showSyncRequirements()}}catch(err){toast(err.message||'Não foi possível concluir a ação.','error')}},true);
document.addEventListener('rm:rendered',()=>setTimeout(paint,0));
setTimeout(paint,100);
