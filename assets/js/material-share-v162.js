import {data,runtime} from './state.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
function enhanceModal(){
  if(runtime.locked)return;
  const root=document.getElementById('modal-root');if(!root)return;
  const footer=root.querySelector('.modal-foot,.modal-footer');if(!footer)return;
  footer.querySelector('[data-action="material-share-whatsapp"]')?.remove();
  const associated=footer.querySelector('[data-action="material-pdf"][data-id]');
  if(!associated)return;
  const id=associated.dataset.id||'';
  if(!id||!arr(data.materials).some(m=>m?.id===id||m?.sourceId===id))return;
  let wa=footer.querySelector(`[data-rm-modal-material-wa="${CSS.escape(id)}"]`);
  if(!wa){wa=document.createElement('button');wa.type='button';wa.className='btn';wa.dataset.action='material-whatsapp';wa.dataset.id=id;wa.dataset.rmModalMaterialWa=id;wa.textContent='WhatsApp + PDF';footer.insertBefore(wa,footer.querySelector('[data-action="close-modal"]')||null)}
  let email=footer.querySelector(`[data-rm-email-material="${CSS.escape(id)}"]`);
  if(!email){email=document.createElement('button');email.type='button';email.className='btn secondary';email.dataset.rmEmailMaterial=id;email.textContent='E-mail + PDF';footer.insertBefore(email,wa)}
  associated.textContent='Baixar PDF';
}
const observer=new MutationObserver(()=>enhanceModal());
const start=()=>{const root=document.getElementById('modal-root');if(root)observer.observe(root,{childList:true,subtree:true});enhanceModal()};
document.addEventListener('rm:app-ready',start,{once:true});
document.addEventListener('rm:rendered',()=>setTimeout(enhanceModal,0));
setTimeout(start,400);
