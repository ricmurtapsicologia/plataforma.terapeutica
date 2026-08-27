import {data,runtime,patientById} from './state.js';
import {decryptJson} from './crypto.js';

const VERSION='3.4.1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const minutes=value=>{const m=String(value||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null};

async function loadCatalog(){
  if(!runtime.key)return[];
  let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}
  if(!raw)return[];
  try{
    const value=await decryptJson(runtime.key,raw,CATALOG_AAD);
    if(Array.isArray(value?.items))return value.items;
    if(value?.items&&typeof value.items==='object')return Object.values(value.items);
  }catch{}
  return[];
}

function appointmentCandidates(item){
  const date=item?.meetingDate||'';
  const sourceTime=item?.rawTime||item?.meetingTime||'';
  const target=minutes(sourceTime);
  if(!date||target===null)return[];
  return arr(data.appointments)
    .filter(a=>a?.date===date&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou'&&a?.patientId)
    .map(a=>{const t=minutes(a.time);return t===null?null:{a,diff:Math.abs(t-target),signed:t-target,p:patientById(a.patientId)}})
    .filter(Boolean)
    .sort((x,y)=>x.diff-y.diff)
    .slice(0,3);
}

function confidence(diff){
  if(diff<=20)return['forte','badge success'];
  if(diff<=60)return['possível','badge'];
  return['fraca','badge warning'];
}

function contextMarkup(item){
  const candidates=appointmentCandidates(item);
  const source=item?.name||'Anotação Gemini';
  const url=item?.url||'';
  const suggestions=candidates.length?candidates.map(({a,diff,p})=>{
    const [label,cls]=confidence(diff);
    const name=String(p?.preferredName||p?.name||'Paciente não localizado');
    return `<div class="rm-gemini-candidate"><span class="${cls}">${esc(label)}</span><strong>${esc(name)}</strong><span>${esc(a.time||'—')} · diferença ${diff} min</span></div>`;
  }).join(''):'<div class="small muted">Nenhuma sessão clínica próxima encontrada na Agenda neste dia.</div>';
  return `<div class="rm-gemini-review-context" data-rm-gemini-review-context>
    <div class="small"><strong>Fonte Gemini:</strong> ${esc(source)}</div>
    <div class="rm-gemini-candidate-list">${suggestions}</div>
    <div class="flex gap-8 wrap mt-8">${url?`<a class="btn secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir anotação original</a>`:''}<span class="tiny muted">Compare o conteúdo da anotação com o paciente sugerido antes de associar.</span></div>
  </div>`;
}

async function decorate(){
  const modal=document.getElementById('modal-root');
  if(!modal||!modal.textContent?.includes('Revisar identidades Gemini'))return;
  const items=await loadCatalog();
  const map=new Map(items.map(x=>[x?.fileId,x]));
  for(const button of modal.querySelectorAll('[data-action="gemini-review-link-v270"]')){
    const row=button.closest('.gemini-queue-row')||button.parentElement?.parentElement;
    if(!row||row.querySelector('[data-rm-gemini-review-context]'))continue;
    const item=map.get(button.dataset.id);
    if(!item)continue;
    const first=row.firstElementChild;
    if(first)first.insertAdjacentHTML('beforeend',contextMarkup(item));
  }
}

function addStyles(){
  if(document.getElementById('rm-gemini-review-context-style'))return;
  const style=document.createElement('style');
  style.id='rm-gemini-review-context-style';
  style.textContent=`.rm-gemini-review-context{margin-top:10px;padding:10px 12px;border:1px solid var(--border,#cfe1e7);border-radius:12px;background:rgba(238,248,251,.7)}.rm-gemini-candidate-list{display:grid;gap:6px;margin-top:8px}.rm-gemini-candidate{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.88rem}.rm-gemini-review-context a.btn{text-decoration:none}.gemini-queue-row{align-items:flex-start!important}@media(max-width:700px){.gemini-queue-row{grid-template-columns:1fr!important}.rm-gemini-review-context{margin-right:0}}`;
  document.head.appendChild(style);
}

const observer=new MutationObserver(()=>queueMicrotask(decorate));
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('rm:rendered',()=>queueMicrotask(decorate));
document.addEventListener('rm:data-ready',()=>queueMicrotask(decorate));
addStyles();
globalThis.__rmGeminiReviewContext={version:VERSION,decorate};
