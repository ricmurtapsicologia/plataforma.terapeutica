import {data,runtime,nowISO} from './state.js';
import {putEncrypted,deleteRecord} from './database.js';
import {decryptJson} from './crypto.js';

const TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const TOKEN_AAD='google-meet-token';
const QUARANTINE_PREFIX='meet_quarantine_';
const RECORD_PREFIX='meet_rec_';
let timer=null;
let running=false;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

async function accessToken(){
  if(!runtime.key)return'';
  let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw)return'';
  try{const value=await decryptJson(runtime.key,raw,TOKEN_AAD);return value?.token&&Number(value.expiresAt)>Date.now()+30000?value.token:''}catch{return''}
}
function patientAppears(patient,raw){
  const hay=normalize(raw);if(!hay)return false;
  const full=normalize(patient?.name),preferred=normalize(patient?.preferredName);
  if(full&&full.split(' ').length>1&&hay.includes(full))return true;
  if(preferred&&preferred.split(' ').length>1&&hay.includes(preferred))return true;
  const first=normalize(String(patient?.preferredName||patient?.name||'').trim().split(/\s+/)[0]);
  if(first.length<4)return false;
  const sameFirst=arr(data.patients).filter(p=>normalize(String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0])===first);
  return sameFirst.length===1&&(` ${hay} `).includes(` ${first} `);
}
async function exportText(fileId,token){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)return'';return r.text();
}
async function saveSetting(item){
  const value={...item,updatedAt:nowISO()},list=data.settings||(data.settings=[]),i=list.findIndex(x=>x?.id===value.id);
  if(i>=0)list[i]=value;else list.push(value);await putEncrypted('settings',value,runtime.key);
}
async function rejectBinding(appointment,note,reason){
  appointment.meet=null;appointment.updatedAt=nowISO();await putEncrypted('appointments',appointment,runtime.key);
  const recId=`${RECORD_PREFIX}${appointment.id}`,record=arr(data.records).find(r=>r?.id===recId);
  if(record&&record.status!=='Finalizado'&&!record.validatedAt){data.records=data.records.filter(r=>r?.id!==recId);await deleteRecord('records',recId)}
  await saveSetting({id:`${QUARANTINE_PREFIX}${note.fileId}`,kind:'meet-quarantine',fileId:note.fileId,title:note.title||'',url:note.url||'',meetingStartedAt:note.meetingStartedAt||'',reason,status:'Pendente',createdAt:nowISO(),guard:'identity-v1'});
}
async function verifyRiskyBindings(){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return;
  const token=await accessToken();if(!token)return;
  running=true;
  try{
    let changed=false;
    for(const appointment of arr(data.appointments)){
      const notes=arr(appointment?.meet?.smartNotes),risky=notes.find(n=>n?.matchMethod==='local-date-time');if(!risky)continue;
      if(appointment.meet?.identityVerifiedAt)continue;
      const patient=arr(data.patients).find(p=>p?.id===appointment.patientId);if(!patient){await rejectBinding(appointment,risky,'Vínculo por horário rejeitado: paciente não localizado no cofre.');changed=true;continue}
      const raw=await exportText(risky.fileId,token);
      if(!raw||!patientAppears(patient,raw)){await rejectBinding(appointment,risky,'Vínculo por horário rejeitado pela validação de identidade do participante.');changed=true;continue}
      appointment.meet.identityVerifiedAt=nowISO();appointment.meet.identityVerification='participant-text';appointment.updatedAt=nowISO();await putEncrypted('appointments',appointment,runtime.key);
    }
    if(changed)window.__rmRender?.();
  }catch(err){console.warn('Validação adicional do Google Meet não concluída',err)}finally{running=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>verifyRiskyBindings(),2200)}
document.addEventListener('rm:data-ready',schedule);
document.addEventListener('rm:local-data-changed',e=>{if(e.detail?.storeName==='appointments')schedule()});
document.addEventListener('rm:rendered',()=>{if(runtime.dataReady)schedule()});
