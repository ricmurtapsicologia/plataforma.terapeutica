import {data,runtime,patientById,nowISO} from './state.js';
import {decryptJson,encryptJson} from './crypto.js';

const VERSION='3.4.2';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false;
let timer=null;
let lastRunAt=0;

function minuteOf(value=''){
  const m=String(value||'').match(/^(\d{1,2}):(\d{2})/);
  return m?Number(m[1])*60+Number(m[2]):null;
}
function validAppointment(a){
  if(!a?.patientId||!a?.date||!a?.time)return false;
  if(a.status==='Cancelada'||a.attendanceStatus==='Desmarcou')return false;
  return Boolean(patientById(a.patientId));
}
function scoreAppointment(item,a){
  const source=minuteOf(item?.rawTime||item?.meetingTime),start=minuteOf(a?.time);
  if(source===null||start===null)return Infinity;
  const duration=Math.max(30,Math.min(Number(a.duration)||50,120));
  const end=start+duration;
  return Math.min(Math.abs(source-start),Math.abs(source-end));
}
function bestAgendaMatch(item){
  const candidates=arr(data.appointments)
    .filter(a=>validAppointment(a)&&a.date===item?.meetingDate)
    .map(a=>({a,score:scoreAppointment(item,a)}))
    .filter(x=>Number.isFinite(x.score))
    .sort((x,y)=>x.score-y.score||String(x.a.time).localeCompare(String(y.a.time)));
  if(!candidates.length)return null;
  const best=candidates[0],second=candidates[1];
  if(best.score>20)return null;
  if(second&&second.score<=25&&second.score-best.score<15)return null;
  return best;
}
async function loadCatalog(){
  if(!runtime.key)return null;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}
  if(!raw)return null;
  try{return await decryptJson(runtime.key,raw,CATALOG_AAD)}catch{return null}
}
async function saveCatalog(catalog){
  const enc=await encryptJson(runtime.key,catalog,CATALOG_AAD);
  localStorage.setItem(CATALOG_STORAGE,JSON.stringify(enc));
}
function asArray(catalog){
  if(Array.isArray(catalog?.items))return catalog.items;
  if(catalog?.items&&typeof catalog.items==='object')return Object.values(catalog.items);
  return[];
}
function setItems(catalog,items){
  if(Array.isArray(catalog?.items))catalog.items=items;
  else catalog.items=Object.fromEntries(items.filter(x=>x?.fileId).map(x=>[x.fileId,x]));
}
async function autoAssociate({reconcile=true}={}){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;
  running=true;
  try{
    const catalog=await loadCatalog();if(!catalog)return null;
    const items=asArray(catalog),review=items.filter(x=>x?.status==='review'&&x?.fileId&&x?.meetingDate&&(x?.rawTime||x?.meetingTime));
    if(!review.length)return{linked:0,merged:0,remaining:0};
    catalog.manualLinks={...(catalog.manualLinks||{})};
    const proposed=[];
    for(const item of review){
      if(catalog.manualLinks[item.fileId])continue;
      const best=bestAgendaMatch(item);if(!best)continue;
      proposed.push({item,best});
    }
    const byAppointment=new Map();
    for(const row of proposed){
      const id=row.best.a.id;if(!byAppointment.has(id))byAppointment.set(id,[]);byAppointment.get(id).push(row);
    }
    let linked=0,merged=0;
    for(const rows of byAppointment.values()){
      rows.sort((x,y)=>x.best.score-y.best.score||String(x.item.modifiedTime||'').localeCompare(String(y.item.modifiedTime||'')));
      const primary=rows[0];
      catalog.manualLinks[primary.item.fileId]=primary.best.a.patientId;
      primary.item.reason=`Associação automática de alta confiança pela Agenda: sessão ${primary.best.a.time}, diferença ${primary.best.score} min do início/fim esperado.`;
      primary.item.autoLinkedAt=nowISO();primary.item.autoLinkVersion=VERSION;linked++;
      const primaryRaw=String(primary.item.rawTime||primary.item.meetingTime||'');
      for(const duplicate of rows.slice(1)){
        const duplicateRaw=String(duplicate.item.rawTime||duplicate.item.meetingTime||'');
        if(primaryRaw&&duplicateRaw&&primaryRaw===duplicateRaw){
          duplicate.item.status='merged';duplicate.item.mergedInto=primary.item.fileId;duplicate.item.reason='Duplicata/reconexão Gemini com o mesmo horário-fonte e a mesma sessão da Agenda; consolidada automaticamente.';duplicate.item.autoMergedAt=nowISO();duplicate.item.autoLinkVersion=VERSION;delete catalog.manualLinks[duplicate.item.fileId];merged++;
        }else{
          catalog.manualLinks[duplicate.item.fileId]=duplicate.best.a.patientId;
          duplicate.item.reason=`Associação automática de alta confiança pela Agenda: sessão ${duplicate.best.a.time}, diferença ${duplicate.best.score} min do início/fim esperado.`;
          duplicate.item.autoLinkedAt=nowISO();duplicate.item.autoLinkVersion=VERSION;linked++;
        }
      }
    }
    if(!linked&&!merged)return{linked:0,merged:0,remaining:review.length};
    setItems(catalog,items);catalog.updatedAt=nowISO();await saveCatalog(catalog);
    lastRunAt=Date.now();
    globalThis.__rmGeminiAutoAssociateStatus={version:VERSION,linked,merged,remaining:Math.max(0,review.length-linked-merged),at:nowISO()};
    document.dispatchEvent(new CustomEvent('rm:gemini-auto-associated',{detail:globalThis.__rmGeminiAutoAssociateStatus}));
    if(reconcile&&linked){
      setTimeout(async()=>{
        try{const mod=await import('./clinical-reconcile-v270.js');await mod.reconcileGemini?.({quiet:true,force:true,reason:'associação automática de alta confiança'})}catch(error){console.warn('Reprocessamento Gemini após associação automática:',error)}
      },350);
    }
    return globalThis.__rmGeminiAutoAssociateStatus;
  }finally{running=false}
}
function schedule(delay=400){clearTimeout(timer);timer=setTimeout(()=>void autoAssociate().catch(error=>console.warn('Associação automática Gemini:',error)),delay)}

document.addEventListener('rm:data-ready',()=>schedule(2200));
document.addEventListener('rm:gemini-status',event=>{if(event.detail?.status==='connected'&&Date.now()-lastRunAt>1200)schedule(450)});
document.addEventListener('rm:calendar-reverse-reconciled',()=>schedule(500));

globalThis.__rmGeminiAutoAssociate={version:VERSION,run:autoAssociate,status:()=>globalThis.__rmGeminiAutoAssociateStatus||null};
