import {data,runtime,selectedPatient} from './state.js';
import {modal,esc,fmtDate,fmtDateTime} from './ui.js';

const VERSION='3.2.4';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let timer=null;

function currentRecords(){const p=selectedPatient();return p?arr(data.records).filter(r=>r?.patientId===p.id):[]}
function byId(id){return currentRecords().find(r=>r?.id===id)||null}
function followupText(r){return String(r?.followup||'').trim()}
function enhanceEditor(){const field=document.querySelector('#record-followup');if(!field)return;const label=field.closest('.field')?.querySelector('label');if(label)label.textContent='Para retomar na próxima sessão';field.style.minHeight='180px';field.placeholder='Pontos clínicos prioritários, hipóteses, perguntas de entrada e intervenções a retomar.'}
function enhanceHistory(){for(const stale of document.querySelectorAll('[data-rm-followup-preview]'))stale.remove()}
function apply(){if(runtime.route!=='patients'||runtime.patientTab!=='records'||!selectedPatient())return;enhanceEditor();enhanceHistory()}
function queue(delay=20){clearTimeout(timer);timer=setTimeout(apply,delay)}

document.addEventListener('rm:rendered',()=>queue());
document.addEventListener('rm:data-ready',()=>queue(60));
document.addEventListener('rm:data-patched',()=>queue(80));
document.addEventListener('rm:record-verified-save',()=>queue(100));
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-action="view-record"][data-id]');if(!button)return;const r=byId(button.dataset.id);if(!r)return;e.preventDefault();e.stopImmediatePropagation();const follow=followupText(r);modal(r.title||'Registro',`<div class="tiny muted">${fmtDate(r.date)}${r.time?` · ${esc(r.time)}`:''} · ${esc(r.status||'')}</div><p style="white-space:pre-wrap">${esc(r.text||'')}</p>${follow?`<hr><h3>Para retomar na próxima sessão</h3><p style="white-space:pre-wrap">${esc(follow)}</p>`:''}${arr(r.addenda).length?`<hr><h3>Adendos</h3>${r.addenda.map(ad=>`<div class="notice mt-8"><strong>${fmtDateTime(ad.at)}</strong><p>${esc(ad.reason||'')}</p><p>${esc(ad.text||'')}</p></div>`).join('')}`:''}`,`<button class="btn" data-action="close-modal">Fechar</button>`,true)},true);

globalThis.__rmRecordUi={version:VERSION,apply};
