import {data,runtime,todayISO,nowISO} from './state.js';
import {bulkPutEncrypted} from './database.js';

let syncState='unknown',running=false;
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const pad=n=>String(n).padStart(2,'0');
const meetingIso=(date,time)=>`${date}T${time}:00-03:00`;

function addDays(date,days){const d=new Date(`${date}T12:00:00-03:00`);d.setDate(d.getDate()+days);return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function normalizeSlot(date,time){let[h,m]=String(time||'00:00').split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return{date,time};if(m>=30){h++;if(h>=24){h=0;date=addDays(date,1)}}return{date,time:`${pad(h)}:00`}}
function meetingFromRecord(record){const title=String(record?.source?.title||'');let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(m)return normalizeSlot(`${m[1]}-${m[2]}-${m[3]}`,`${m[4]}:${m[5]}`);m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);if(m)return normalizeSlot(`${m[3]}-${m[2]}-${m[1]}`,`${m[4]}:${m[5]}`);const date=record?.date||record?.source?.meetingDate||'';const time=record?.source?.meetingTime||record?.source?.rawTime||'';return date&&time?normalizeSlot(date,time):date?{date,time:''}:null}
function nextStamp(...values){const ms=Math.max(...values.map(v=>new Date(v||0).getTime()).filter(Number.isFinite),Date.now())+1;return new Date(ms).toISOString()}
function sameFile(a,fileId){return Boolean(fileId&&(a?.source?.fileId===fileId||a?.gemini?.fileId===fileId||a?.id===`gmappt_${fileId}`))}
function nearestAppointment(record,slot){const fileId=record?.source?.fileId||'';let a=arr(data.appointments).find(x=>x?.id===record?.appointmentId)||arr(data.appointments).find(x=>sameFile(x,fileId));if(a)return a;const candidates=arr(data.appointments).filter(x=>x?.patientId===record?.patientId&&x?.date===slot?.date).map(x=>{const t1=slot?.time?new Date(meetingIso(slot.date,slot.time)).getTime():NaN,t2=x?.time?new Date(meetingIso(x.date,x.time)).getTime():NaN;return{x,d:Number.isFinite(t1)&&Number.isFinite(t2)?Math.abs(t1-t2):0}}).sort((u,v)=>u.d-v.d);return candidates.find(x=>x.d<=90*60000)?.x||null}

async function repair(){
  if(running||syncState!=='synced'||runtime.locked||!runtime.key||!runtime.dataReady)return;
  running=true;
  try{
    const today=todayISO(),appointments=[...arr(data.appointments)],updates=new Map(),creates=new Map();
    for(const record of arr(data.records)){
      if(record?.source?.type!=='google-meet-gemini'||!record?.patientId)continue;
      const slot=meetingFromRecord(record);if(!slot?.date||slot.date>today)continue;
      let appointment=nearestAppointment(record,slot);
      if(appointment&&(appointment.status==='Cancelada'||appointment.attendanceStatus==='Desmarcou'))continue;
      if(!appointment){
        const fileId=record?.source?.fileId||record.id;
        appointment={id:`gmappt_${fileId}`,patientId:record.patientId,date:slot.date,time:slot.time||'00:00',duration:50,status:'Realizada',attendanceStatus:'Presente',modality:'On-line',recurrence:'Avulso',note:'Sessão confirmada por registro do Google Meet/Gemini.',createdAt:record.createdAt||nowISO(),updatedAt:nextStamp(record.updatedAt),source:{type:'google-meet-gemini',fileId:record?.source?.fileId||'',url:record?.source?.url||'',sourceModifiedAt:record?.source?.sourceModifiedAt||record.updatedAt||''}};
        creates.set(appointment.id,appointment);appointments.push(appointment);continue;
      }
      const date=slot.date||appointment.date,time=slot.time||appointment.time||'00:00';
      if(appointment.status==='Realizada'&&appointment.attendanceStatus==='Presente'&&appointment.date===date&&appointment.time===time)continue;
      const updated={...appointment,date,time,status:'Realizada',attendanceStatus:'Presente',updatedAt:nextStamp(appointment.updatedAt,record.updatedAt,record?.source?.sourceModifiedAt),gemini:{...(appointment.gemini||{}),fileId:record?.source?.fileId||appointment?.gemini?.fileId||'',url:record?.source?.url||appointment?.gemini?.url||'',meetingDate:date,meetingTime:time,sourceModifiedAt:record?.source?.sourceModifiedAt||record.updatedAt||''}};
      updates.set(updated.id,updated);
      const i=appointments.findIndex(x=>x?.id===updated.id);if(i>=0)appointments[i]=updated;
    }
    const writes=[...creates.values(),...updates.values()];if(!writes.length)return;
    const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;
    try{await bulkPutEncrypted('appointments',writes,runtime.key)}finally{globalThis.__rmSyncApplying=previous}
    data.appointments=appointments;
    document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'appointments',kind:'gemini-attendance-repair-v249',at:nowISO(),count:writes.length}}));
    window.__rmRender?.();
  }finally{running=false}
}

document.addEventListener('rm:sync-status',e=>{syncState=e.detail?.status||syncState;if(syncState==='synced')setTimeout(()=>void repair(),1300)});
document.addEventListener('rm:data-ready',()=>setTimeout(()=>void repair(),1700));
document.addEventListener('rm:app-ready',()=>setTimeout(()=>void repair(),2100));
