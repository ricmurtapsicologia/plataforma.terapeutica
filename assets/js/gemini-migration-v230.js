import {data,runtime} from './state.js';
import {bulkPutEncrypted} from './database.js';

let syncState='unknown';
let running=false;
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const pad=n=>String(n).padStart(2,'0');
function addDays(date,days){const d=new Date(`${date}T12:00:00-03:00`);d.setDate(d.getDate()+days);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function normalizeSlot(date,time){let[h,m]=String(time||'00:00').split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return{date,time};if(m>=30){h++;if(h>=24){h=0;date=addDays(date,1)}}return{date,time:`${pad(h)}:00`}}
function meetingFromTitle(title=''){let m=String(title).match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(m)return normalizeSlot(`${m[1]}-${m[2]}-${m[3]}`,`${m[4]}:${m[5]}`);m=String(title).match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);return m?normalizeSlot(`${m[3]}-${m[2]}-${m[1]}`,`${m[4]}:${m[5]}`):null}
async function migrate(){if(running||syncState!=='synced'||runtime.locked||!runtime.key||!runtime.dataReady)return;running=true;try{const updates=[];for(const record of arr(data.records)){if(record?.source?.type!=='google-meet-gemini'||!record?.source?.title||!record?.appointmentId)continue;const appointment=arr(data.appointments).find(a=>a?.id===record.appointmentId);if(!appointment||appointment.status==='Cancelada'||appointment.attendanceStatus==='Desmarcou')continue;const slot=meetingFromTitle(record.source.title);if(!slot||(appointment.date===slot.date&&appointment.time===slot.time&&appointment.attendanceStatus==='Presente'))continue;const updated={...appointment,date:slot.date,time:slot.time,status:'Realizada',attendanceStatus:'Presente',updatedAt:record.source.modifiedTime||record.updatedAt||appointment.updatedAt,gemini:{...(appointment.gemini||{}),fileId:record.source.fileId||'',url:record.source.url||'',meetingDate:slot.date,meetingTime:slot.time}};updates.push(updated)}if(!updates.length)return;await bulkPutEncrypted('appointments',updates,runtime.key);for(const u of updates){const i=data.appointments.findIndex(a=>a?.id===u.id);if(i>=0)data.appointments[i]=u}document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'appointments',kind:'gemini-v230-migration',at:new Date().toISOString()}}));window.__rmRender?.()}finally{running=false}}
document.addEventListener('rm:sync-status',e=>{syncState=e.detail?.status||syncState;if(syncState==='synced')setTimeout(()=>void migrate(),900)});
document.addEventListener('rm:data-ready',()=>setTimeout(()=>void migrate(),1200));
