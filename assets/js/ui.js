import {escapeHtml} from './validation.js';
export const $=(sel,root=document)=>root.querySelector(sel);
export const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
export const esc=escapeHtml;
export function fmtDate(value){if(!value)return'—';const d=new Date(`${value}T12:00:00`);return new Intl.DateTimeFormat('pt-BR').format(d)}
export function fmtDateTime(value){if(!value)return'—';return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}
export const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0));
export const initials=name=>String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
export function badge(status){const s=String(status||''),cls=/pago|ativo|confirmad|conclu|aceito|alcançado/i.test(s)?'success':/pendente|rascunho|aguardando|proposto|preparado/i.test(s)?'warning':/cancel|recus|revog|atrasado/i.test(s)?'danger':'';return`<span class="badge ${cls}">${esc(s||'—')}</span>`}
export function metric(label,value,note=''){return`<div class="metric"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div>${note?`<div class="metric-note">${esc(note)}</div>`:''}</div>`}
export function empty(title,text,action=''){return`<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`}
export function pageHead(title,subtitle='',actions=''){return`<header class="page-head"><div><div class="eyebrow">Plataforma clínica</div><h1>${esc(title)}</h1>${subtitle?`<p class="muted">${esc(subtitle)}</p>`:''}</div><div class="page-actions">${actions}</div></header>`}
export function toast(message,type=''){const region=$('#toast-region'),el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;region.append(el);setTimeout(()=>el.remove(),4500)}
export function modal(title,body,footer='',wide=false){const root=$('#modal-root');root.innerHTML=`<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><div><h2 id="modal-title" class="mb-0">${esc(title)}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-foot">${footer}</footer>`:''}</section></div>`;setTimeout(()=>root.querySelector('input,textarea,select,button')?.focus(),20)}
export function closeModal(){const root=$('#modal-root');root.innerHTML=''}
export function downloadText(text,filename,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000)}
export function barChart(values,labels){const max=Math.max(1,...values);return`<div class="bar-chart" role="img" aria-label="${esc(labels.map((l,i)=>`${l}: ${values[i]}`).join(', '))}">${values.map((v,i)=>`<div class="bar-col" title="${esc(labels[i])}: ${v}"><div class="bar" style="height:${Math.max(3,(v/max)*145)}px"></div><div class="bar-label">${esc(labels[i])}</div></div>`).join('')}</div>`}
