import {data,runtime,selectedPatient} from './state.js';

const VERSION='3.2.4';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let timer=null;

function selectedMeta(){
  const select=document.querySelector('#record-session');
  const option=select?.selectedOptions?.[0];
  return {
    select,
    key:String(select?.value||''),
    appointmentId:String(option?.dataset?.appointmentId||''),
    date:String(option?.dataset?.date||''),
    time:String(option?.dataset?.time||'')
  };
}

function selectedRecord(patientId,meta){
  if(!patientId||!meta?.key)return null;
  return arr(data.records)
    .filter(r=>r?.patientId===patientId&&(r?.clinicalSessionId===meta.key||(meta.appointmentId&&r?.appointmentId===meta.appointmentId)))
    .sort((a,b)=>String(b?.updatedAt||b?.createdAt||'').localeCompare(String(a?.updatedAt||a?.createdAt||'')))[0]||null;
}

function enforce(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='records')return;
  const patient=selectedPatient();
  if(!patient)return;
  const meta=selectedMeta();
  if(!meta.select||!meta.key)return;
  const date=document.querySelector('#record-date');
  const time=document.querySelector('#record-time');
  if(date&&meta.date&&date.value!==meta.date)date.value=meta.date;
  if(time&&time.value!==meta.time)time.value=meta.time;

  const record=selectedRecord(patient.id,meta);
  const follow=document.querySelector('#record-followup');
  if(follow&&record&&!String(record.followup||'').trim()){
    const legacy=String(record.sessionSummary||'').trim();
    if(legacy&&follow.value.trim()===legacy)follow.value='';
  }
}

function queue(delay=50){clearTimeout(timer);timer=setTimeout(enforce,delay)}

document.addEventListener('rm:rendered',()=>queue(80));
document.addEventListener('rm:data-ready',()=>queue(120));
document.addEventListener('rm:data-patched',()=>queue(120));
document.addEventListener('rm:record-verified-save',()=>queue(120));
document.addEventListener('change',e=>{if(e.target?.id!=='record-session')return;queue(0);setTimeout(enforce,80);setTimeout(enforce,180)},true);

globalThis.__rmRecordSessionBinding={version:VERSION,enforce};
