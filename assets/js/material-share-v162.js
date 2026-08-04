import {data,runtime,patientById,selectedPatient,preferences} from './state.js';
import {openWhatsApp} from './communications.js';
import {toast} from './ui.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const firstName=p=>String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'Paciente';

function selectedForModal(){
  const premiumId=document.getElementById('premium-patient')?.value;
  return patientById(premiumId)||selectedPatient();
}
function materialFromButton(button){
  const id=button?.dataset?.id;
  if(!id)return null;
  return arr(data.materials).find(m=>m?.id===id)||null;
}
function modalText(){
  const premium=document.querySelector('#modal-root .premium-reading');
  if(premium)return premium.innerText.trim();
  const body=document.querySelector('#modal-root .modal-body');
  if(!body)return'';
  const clone=body.cloneNode(true);clone.querySelectorAll('button,select,input,label,.premium-patient-picker').forEach(n=>n.remove());return clone.innerText.trim();
}
function modalTitle(){return document.querySelector('#modal-root .modal-card h2,#modal-root .modal h2,#modal-root h2')?.textContent?.trim()||'Material psicoeducativo'}
function buildMessage(p,title,content){
  const normalized=String(content||'').replace(/\n{3,}/g,'\n\n').trim();
  const body=normalized.length>5200?normalized.slice(0,5190)+'…':normalized;
  return `Olá, ${firstName(p)}. Separei este material para apoiar nosso acompanhamento.\n\n*${title}*\n\n${body}\n\nSe surgir alguma dúvida, podemos trabalhar isso em sessão.\n\n${preferences.professionalName} — ${preferences.professionalTitle}.`;
}
function sendDirect(button){
  const p=selectedForModal();if(!p?.phone)throw new Error('Selecione um paciente com WhatsApp cadastrado.');
  const m=materialFromButton(button),title=m?.title||modalTitle(),content=m?.content||m?.summary||modalText();
  if(!content)throw new Error('Conteúdo do material não localizado.');openWhatsApp(p.phone,buildMessage(p,title,content));
}
function enhanceModal(){
  if(runtime.locked)return;
  const root=document.getElementById('modal-root');if(!root)return;
  const footer=root.querySelector('.modal-foot,.modal-footer');if(!footer)return;
  if(footer.querySelector('[data-action="material-share-whatsapp"]'))return;
  const associated=footer.querySelector('[data-action="material-pdf"][data-id]');
  const premium=footer.querySelector('[data-action="premium-pdf"][data-id]');
  if(!associated&&!premium)return;
  const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.action='material-share-whatsapp';b.dataset.id=(associated||premium).dataset.id;b.textContent='Enviar conteúdo no WhatsApp';
  const close=footer.querySelector('[data-action="close-modal"]');if(close)footer.insertBefore(b,close);else footer.appendChild(b);
}

document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-action="material-share-whatsapp"]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();try{sendDirect(el)}catch(err){toast(err.message||'Não foi possível preparar o WhatsApp.','error')}
},true);

const observer=new MutationObserver(()=>enhanceModal());
const start=()=>{const root=document.getElementById('modal-root');if(root)observer.observe(root,{childList:true,subtree:true});enhanceModal()};
document.addEventListener('rm:app-ready',start,{once:true});
document.addEventListener('rm:rendered',()=>setTimeout(enhanceModal,0));
setTimeout(start,400);
