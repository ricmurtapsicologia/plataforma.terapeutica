import {data,runtime,selectedPatient} from './state.js';

const VERSION='3.2.5';
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let timer=null;

function selectedMeta(patientId){
  const select=document.querySelector('#record-session');
  const key=String(select?.value||'');
  const appointment=key?arr(data.appointments).find(a=>a?.patientId===patientId&&(a?.clinicalSessionId===key||a?.id===key))||null:null;
  return {
    select,
    key:appointment?key:'',
    valid:!key||Boolean(appointment),
    appointmentId:String(appointment?.id||''),
    date:String(appointment?.date||''),
    time:String(appointment?.time||'')
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
  const meta=selectedMeta(patient.id);
  if(!meta.select)return;
  if(!meta.valid){
    meta.select.value='';
    const status=document.querySelector('#record-save-status');
    if(status){status.className='tiny danger';status.textContent='A sessão selecionada não pertence ao paciente atual.'}
    return;
  }
  if(!meta.key)return;
  const date=document.querySelector('#record-date');
  const time=document.querySelector('#record-time');
  if(date&&meta.date&&date.value!==meta.date)date.value=meta.date;
  if(time&&time.value!==meta.time)time.value=meta.time;

  const record=selectedRecord(patient.id,meta);
  const follow=document.querySelector('#record-followup');
  if(follow&&record&&!String(record.followup||'').trim()&&follow.value.trim())follow.value='';
}

function queue(delay=50){clearTimeout(timer);timer=setTimeout(enforce,delay)}

document.addEventListener('rm:rendered',()=>queue(80));
document.addEventListener('rm:data-ready',()=>queue(120));
document.addEventListener('rm:data-patched',()=>queue(120));
document.addEventListener('rm:record-verified-save',()=>queue(120));
document.addEventListener('change',e=>{if(e.target?.id!=='record-session')return;queue(0)},true);

globalThis.__rmRecordSessionBinding={version:VERSION,enforce};
