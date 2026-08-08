import {data,runtime,nowISO,selectedPatient} from './state.js';
import {putEncrypted} from './database.js';
import {sanitizeText} from './validation.js';
import {toast} from './ui.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const q=s=>document.querySelector(s);
function recordById(id){return arr(data.records).find(r=>r?.id===id)||null}
async function saveRecord(record){record.updatedAt=nowISO();const list=data.records||(data.records=[]),i=list.findIndex(x=>x?.id===record.id);if(i>=0)list[i]=record;else list.push(record);await putEncrypted('records',record,runtime.key);return record}
function fillEditor(record){
  if(!record)return;runtime.aiReviewRecordId=record.id;
  const title=q('#record-title'),date=q('#record-date'),text=q('#record-text'),follow=q('#record-followup');
  if(title)title.value=record.title||'Evolução de sessão';if(date)date.value=record.date||'';if(text)text.value=record.text||'';if(follow)follow.value=record.followup||'';
  let notice=q('#rm-ai-reviewing');if(!notice&&text){notice=document.createElement('div');notice.id='rm-ai-reviewing';notice.className='notice mt-12';notice.innerHTML='<strong>Rascunho Gemini em revisão profissional.</strong> O texto foi sintetizado a partir das anotações da sessão. Confirme fidelidade, necessidade e linguagem antes de finalizar. O prontuário deve permanecer sintético e permitir identificar evolução, procedimentos e encaminhamentos.';text.parentElement?.insertAdjacentElement('beforebegin',notice)}
  text?.focus({preventScroll:true});text?.scrollIntoView({behavior:'smooth',block:'center'});
}
function decorateHistory(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='records')return;
  document.querySelectorAll('[data-action="view-record"][data-id]').forEach(view=>{
    const r=recordById(view.dataset.id);if(!r||r.status!=='Rascunho IA')return;const box=view.parentElement;if(!box||box.querySelector(`[data-action="review-ai-record"][data-id="${CSS.escape(r.id)}"]`))return;
    const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.action='review-ai-record';b.dataset.id=r.id;b.textContent='Revisar prontuário';box.insertBefore(b,view);
  });
}
function autoloadRecord(recordId){if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='records')return;const record=recordById(recordId),patient=selectedPatient();if(record?.patientId===patient?.id)setTimeout(()=>fillEditor(record),80)}

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action]');if(!el)return;const action=el.dataset.action;
  if(action==='review-ai-record'){e.preventDefault();e.stopImmediatePropagation();const r=recordById(el.dataset.id);if(!r)return toast('Rascunho do Gemini não localizado.','error');fillEditor(r);return}
  if(!runtime.aiReviewRecordId||!['save-record-draft','finalize-record'].includes(action))return;
  e.preventDefault();e.stopImmediatePropagation();const r=recordById(runtime.aiReviewRecordId),p=selectedPatient();if(!r||!p){runtime.aiReviewRecordId='';return toast('O rascunho não está mais disponível.','error')}
  const text=sanitizeText(q('#record-text')?.value),title=sanitizeText(q('#record-title')?.value)||'Evolução de sessão',date=q('#record-date')?.value||r.date,followup=sanitizeText(q('#record-followup')?.value);if(!text)return toast('Digite o registro.','error');
  if(action==='save-record-draft'){await saveRecord({...r,title,date,text,followup,status:'Rascunho IA',requiresReview:true,source:{...(r.source||{}),professionalReviewStartedAt:r.source?.professionalReviewStartedAt||nowISO()}});toast('Rascunho clínico salvo.','success');return}
  if(!confirm(`Finalizar o registro de ${p.name}? Após finalizado, alterações posteriores deverão ser feitas por adendo.`))return;
  await saveRecord({...r,title,date,text,followup,status:'Finalizado',requiresReview:false,validatedAt:nowISO(),source:{...(r.source||{}),reviewedByProfessional:true,reviewedAt:nowISO()}});runtime.aiReviewRecordId='';window.__rmRender?.();toast('Prontuário revisado e finalizado.','success');
},true);

document.addEventListener('rm:rendered',()=>setTimeout(decorateHistory,0));
document.addEventListener('rm:gemini-record-created',e=>autoloadRecord(e.detail?.recordId));
