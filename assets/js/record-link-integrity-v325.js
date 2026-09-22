import {data,runtime,nowISO} from './state.js';
import {bulkPutEncryptedAtomic,getDecryptedById} from './database.js';

const VERSION='3.2.5';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false,timer=null;

function keyFor(a){return String(a?.clinicalSessionId||a?.id||'')}
function appointmentById(id){return id?arr(data.appointments).find(a=>a?.id===id)||null:null}
function appointmentBySession(key){return key?arr(data.appointments).find(a=>keyFor(a)===key)||null:null}
function eligibleAppointments(patientId,date){return arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===date&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou')}
function linkMismatch(r){
  if(!r?.patientId||!r?.date||(!r?.appointmentId&&!r?.clinicalSessionId))return false;
  const byId=appointmentById(r.appointmentId);
  const bySession=appointmentBySession(r.clinicalSessionId);
  if(byId&&byId.date!==r.date)return true;
  if(bySession&&bySession.date!==r.date)return true;
  if(byId&&bySession&&byId.id!==bySession.id)return true;
  return false;
}
function targetFor(r){
  const candidates=eligibleAppointments(r.patientId,r.date);
  if(!candidates.length)return null;
  const exactTime=r.time?candidates.find(a=>a.time===r.time):null;
  if(exactTime)return exactTime;
  if(candidates.length===1)return candidates[0];
  const currentById=appointmentById(r.appointmentId);
  if(currentById&&candidates.some(a=>a.id===currentById.id))return currentById;
  return null;
}
function occupied(target,recordId){
  if(!target)return false;
  const key=keyFor(target);
  return arr(data.records).some(r=>r?.id!==recordId&&r?.patientId===target.patientId&&r?.date===target.date&&(r?.appointmentId===target.id||r?.clinicalSessionId===key));
}
function repairedRow(r){
  const target=targetFor(r);
  const previous={appointmentId:r.appointmentId||'',clinicalSessionId:r.clinicalSessionId||''};
  const nextTarget=target&&!occupied(target,r.id)?target:null;
  return {
    ...r,
    appointmentId:nextTarget?.id||'',
    clinicalSessionId:nextTarget?keyFor(nextTarget):'',
    source:{
      ...(r.source||{}),
      linkageRepair:{kind:'record-link-integrity-v325',at:nowISO(),previous,target:nextTarget?{appointmentId:nextTarget.id,clinicalSessionId:keyFor(nextTarget),date:nextTarget.date,time:nextTarget.time||''}:null}
    }
  };
}
async function repair(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return 0;
  const stale=arr(data.records).filter(linkMismatch);
  if(!stale.length)return 0;
  running=true;
  try{
    const repaired=stale.map(repairedRow);
    await bulkPutEncryptedAtomic([{storeName:'records',values:repaired}],runtime.key,{verify:true});
    for(const expected of repaired){
      const check=await getDecryptedById('records',expected.id,runtime.key);
      if(!check||check.patientId!==expected.patientId||check.date!==expected.date||String(check.text||'')!==String(expected.text||'')||String(check.followup||'')!==String(expected.followup||'')||check.status!==expected.status)throw new Error(`Falha ao verificar reparo de vínculo do prontuário ${expected.id}.`);
      const i=arr(data.records).findIndex(r=>r?.id===check.id);
      if(i>=0)data.records[i]=check;
    }
    document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',kind:'record-link-integrity-v325',count:repaired.length,verified:true,at:nowISO()}}));
    document.dispatchEvent(new CustomEvent('rm:record-link-repaired',{detail:{count:repaired.length,at:nowISO()}}));
    setTimeout(()=>window.__rmRender?.(),60);
    return repaired.length;
  }finally{running=false}
}
function queue(delay=80){clearTimeout(timer);timer=setTimeout(()=>void repair().catch(err=>console.error('Falha no reparo técnico de vínculo de prontuário.',err)),delay)}

document.addEventListener('rm:data-ready',()=>queue(120));
document.addEventListener('rm:data-patched',()=>queue(180));
document.addEventListener('rm:rendered',()=>queue(250));

globalThis.__rmRecordLinkIntegrity={version:VERSION,repair};
