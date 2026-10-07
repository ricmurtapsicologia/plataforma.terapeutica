import {data,runtime,nowISO} from '../state.js';
import {putEncrypted} from '../database.js';

const VERSION='3.7.6';
let timer=null;

async function normalizeAuditedDrafts(){
  if(runtime.locked||!runtime.key||!runtime.dataReady||runtime.integrityBlocked)return;
  try{
    for(const record of Array.isArray(data.records)?data.records:[]){
      const audited=record?.source?.kind==='gemini-meet-notes'&&Boolean(record?.source?.sourceStartedAt);
      if(!audited||record.status==='Finalizado')continue;
      let changed=false,next={...record};
      if(!next.title){next.title='Evolução de sessão';changed=true}
      if(next.status==='Rascunho assistido'||!next.status){next.status='Rascunho IA';next.requiresReview=true;changed=true}
      if(!changed)continue;
      next.updatedAt=nowISO();
      Object.assign(record,next);
      await putEncrypted('records',next,runtime.key);
    }
    document.querySelectorAll('[data-action="gemini-ai-hub-v240"]').forEach(button=>{
      button.dataset.action='gemini-ai-hub-v270';
      button.textContent='Preparar/revisar rascunho';
    });
  }catch(error){
    console.warn('Normalização governada de rascunhos não concluída.',error);
  }
}
function queue(delay=0){
  clearTimeout(timer);
  timer=setTimeout(()=>void normalizeAuditedDrafts(),delay);
}
document.addEventListener('rm:data-ready',()=>queue(700));
document.addEventListener('rm:local-data-changed',event=>{
  if(['clinical-audit-v280','gemini-materialize-v270','gemini-regenerate-v270'].includes(event.detail?.kind))queue(80);
});
document.addEventListener('rm:rendered',()=>queue(0));

globalThis.__rmClinicalRecordNormalization={version:VERSION,run:normalizeAuditedDrafts};
