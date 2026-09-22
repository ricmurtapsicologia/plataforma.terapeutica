import {data,runtime,selectedPatient} from './state.js';
import {modal,esc,fmtDate,fmtDateTime} from './ui.js';

const VERSION='3.2.3';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let timer=null;

function currentRecords(){const p=selectedPatient();return p?arr(data.records).filter(r=>r?.patientId===p.id):[]}
function byId(id){return currentRecords().find(r=>r?.id===id)||null}
function followupText(r){return String(r?.followup||r?.sessionSummary||'').trim()}
function enhanceEditor(){const field=document.querySelector('#record-followup');if(!field)return;const label=field.closest('.field')?.querySelector('label');if(label)label.textContent='Para retomar na próxima sessão';field.style.minHeight='180px';field.placeholder='Pontos clínicos prioritários, hipóteses, perguntas de entrada e intervenções a retomar.'}
function enhanceHistory(){for(const view of document.querySelectorAll('[data-action="view-record"][data-id]')){const r=byId(view.dataset.id);if(!r)continue;const item=view.closest('.timeline-item');const actions=view.parentElement;if(!item||!actions)continue;const follow=followupText(r);if(follow&&!item.querySelector(`[data-rm-followup-preview="${CSS.escape(r.id)}"]`)){const box=document.createElement('div');box.className='notice mt-8';box.dataset.rmFollowupPreview=r.id;const strong=document.createElement('strong');strong.textContent='Para retomar na próxima sessão';const p=document.createElement('p');p.className='small';p.style.whiteSpace='pre-wrap';p.textContent=follow.length>360?`${follow.slice(0,360)}…`:follow;box.append(strong,p);actions.insertAdjacentElement('beforebegin',box)}if(r.status!=='Finalizado'&&!actions.querySelector(`[data-rm-relink-record="${CSS.escape(r.id)}"]`)){const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.rmRelinkRecord=r.id;button.textContent='Vincular à sessão selecionada';actions.appendChild(button)}}}
function apply(){if(runtime.route!=='patients'||runtime.patientTab!=='records'||!selectedPatient())return;enhanceEditor();enhanceHistory()}
function queue(delay=20){clearTimeout(timer);timer=setTimeout(apply,delay)}

document.addEventListener('rm:rendered',()=>queue());
document.addEventListener('rm:data-ready',()=>queue(60));
document.addEventListener('rm:data-patched',()=>queue(80));
document.addEventListener('rm:record-verified-save',()=>queue(100));
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-action="view-record"][data-id]');if(!button)return;const r=byId(button.dataset.id);if(!r)return;e.preventDefault();e.stopImmediatePropagation();const follow=followupText(r);modal(r.title||'Registro',`<div class="tiny muted">${fmtDate(r.date)}${r.time?` · ${esc(r.time)}`:''} · ${esc(r.status||'')}</div><p style="white-space:pre-wrap">${esc(r.text||'')}</p>${follow?`<hr><h3>Para retomar na próxima sessão</h3><p style="white-space:pre-wrap">${esc(follow)}</p>`:''}${arr(r.addenda).length?`<hr><h3>Adendos</h3>${r.addenda.map(ad=>`<div class="notice mt-8"><strong>${fmtDateTime(ad.at)}</strong><p>${esc(ad.reason||'')}</p><p>${esc(ad.text||'')}</p></div>`).join('')}`:''}`,`<button class="btn" data-action="close-modal">Fechar</button>`,true)},true);

globalThis.__rmRecordUi={version:VERSION,apply};
