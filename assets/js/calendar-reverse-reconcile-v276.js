import {data,runtime,uid,nowISO} from './state.js';
import {bulkPutEncrypted} from './database.js';
import {decryptJson} from './crypto.js';

const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events';
const SCAN_STORAGE='rm.google.calendar.reverse-scan.v276';
const TIMEZONE=Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo';
const LOOKBACK_MONTHS=18;
const SCAN_COOLDOWN_MS=6*60*60*1000;
let running=false;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalized=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const firstName=p=>String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'';

async function loadToken(){
  if(!runtime.key)return null;
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw)return null;
  try{
    const value=await decryptJson(runtime.key,raw,'google-calendar-token');
    const scopes=String(value?.scope||CALENDAR_SCOPE).split(/\s+/);
    if(!value?.token||Number(value.expiresAt)<=Date.now()+60000||!scopes.includes(CALENDAR_SCOPE))return null;
    return String(value.token);
  }catch{return null}
}

function scanWindow(){
  const start=new Date();
  start.setMonth(start.getMonth()-LOOKBACK_MONTHS);
  start.setHours(0,0,0,0);
  const end=new Date();
  end.setDate(end.getDate()+2);
  end.setHours(23,59,59,999);
  return{timeMin:start.toISOString(),timeMax:end.toISOString()};
}

function eventPatientToken(event){
  const summary=String(event?.summary||'').trim();
  const match=summary.match(/^T\s*[–—-]\s*(.+)$/i);
  if(!match)return'';
  const description=normalized(event?.description||'');
  const managed=event?.extendedProperties?.private?.rmSource==='plataforma-terapeutica';
  const recognized=description.includes('sessao realizada')||description.includes('sessao registrada na plataforma clinica');
  if(!managed&&!recognized)return'';
  return normalized(match[1]);
}

function uniquePatient(token){
  if(!token)return null;
  const matches=arr(data.patients).filter(patient=>normalized(firstName(patient))===token);
  return matches.length===1?matches[0]:null;
}

function localParts(event){
  const startText=String(event?.start?.dateTime||'');
  if(!startText)return null;
  const start=new Date(startText);
  if(Number.isNaN(start.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(start).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  const time=`${parts.hour}:${parts.minute}`;
  const endText=String(event?.end?.dateTime||'');
  const end=endText?new Date(endText):null;
  const rawDuration=end&&!Number.isNaN(end.getTime())?Math.round((end-start)/60000):50;
  const duration=rawDuration>=20&&rawDuration<=180?rawDuration:50;
  return{date,time,duration};
}

async function listCalendarEvents(token){
  const base='https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const {timeMin,timeMax}=scanWindow();
  let pageToken='',out=[];
  do{
    const params=new URLSearchParams({singleEvents:'true',showDeleted:'false',maxResults:'2500',timeMin,timeMax,timeZone:TIMEZONE,q:'Sessão'});
    if(pageToken)params.set('pageToken',pageToken);
    const response=await fetch(`${base}?${params}`,{headers:{Authorization:`Bearer ${token}`}});
    if(response.status===401)return[];
    if(!response.ok)throw new Error(`Google Agenda respondeu ${response.status} durante a conciliação de datas.`);
    const body=await response.json();
    out.push(...arr(body?.items));
    pageToken=String(body?.nextPageToken||'');
  }while(pageToken);
  return out;
}

function applyCalendarSlot(appointment,eventId,parts){
  let changed=false;
  if(String(appointment.calendarEventId||'')!==String(eventId)){
    appointment.calendarEventId=String(eventId);
    appointment.calendarImportedAt=nowISO();
    changed=true;
  }
  if(appointment.date!==parts.date){appointment.date=parts.date;changed=true}
  if(appointment.time!==parts.time){appointment.time=parts.time;changed=true}
  if(Number(appointment.duration||50)!==Number(parts.duration)){appointment.duration=parts.duration;changed=true}
  if(changed){
    appointment.calendarReconciledAt=nowISO();
    appointment.updatedAt=nowISO();
  }
  return changed;
}

function stableLinkedAppointment(event){
  const appointmentId=String(event?.extendedProperties?.private?.rmAppointmentId||'').trim();
  if(appointmentId){
    const byAppointmentId=arr(data.appointments).find(a=>String(a?.id||'')===appointmentId);
    if(byAppointmentId)return byAppointmentId;
  }
  return arr(data.appointments).find(a=>String(a?.calendarEventId||'')===String(event?.id||''))||null;
}

async function reconcileCalendarDates({force=false}={}){
  if(running||runtime.locked||!runtime.dataReady||!runtime.key||!navigator.onLine)return{created:0,linked:0,rescheduled:0};
  const last=Number(localStorage.getItem(SCAN_STORAGE)||0);
  if(!force&&last&&Date.now()-last<SCAN_COOLDOWN_MS)return{created:0,linked:0,rescheduled:0};
  const token=await loadToken();
  if(!token)return{created:0,linked:0,rescheduled:0};
  running=true;
  try{
    const events=await listCalendarEvents(token),changes=[];
    let created=0,linked=0,rescheduled=0;
    for(const event of events){
      const patient=uniquePatient(eventPatientToken(event)),parts=localParts(event);
      if(!patient||!parts||!event?.id)continue;

      // Canonical chat-reschedule path. Calendar events created by the clinical
      // platform carry rmAppointmentId; event ids also survive date/time edits.
      // Resolve by either stable identifier before any date-based fallback so a
      // move performed from ChatGPT updates the same encrypted appointment.
      const stable=stableLinkedAppointment(event);
      if(stable){
        if(applyCalendarSlot(stable,event.id,parts)){
          changes.push(stable);
          rescheduled+=1;
        }
        continue;
      }

      const existing=arr(data.appointments).find(a=>a?.patientId===patient.id&&a?.date===parts.date&&a?.status!=='Cancelada');
      if(existing){
        if(applyCalendarSlot(existing,event.id,parts)){
          changes.push(existing);
          linked+=1;
        }
        continue;
      }

      const timestamp=nowISO();
      const appointment={
        id:uid('appt'),
        patientId:patient.id,
        date:parts.date,
        time:parts.time,
        duration:parts.duration,
        status:'Realizada',
        attendanceStatus:'Presente',
        modality:'On-line',
        calendarEventId:String(event.id),
        calendarImportedAt:timestamp,
        createdAt:timestamp,
        updatedAt:timestamp
      };
      data.appointments.push(appointment);
      changes.push(appointment);
      created+=1;
    }
    if(changes.length){
      globalThis.__rmSyncApplying=true;
      try{await bulkPutEncrypted('appointments',changes,runtime.key)}finally{globalThis.__rmSyncApplying=false}
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'appointments',id:'',kind:'calendar-reconcile',at:nowISO()}}));
      window.__rmRender?.();
    }
    localStorage.setItem(SCAN_STORAGE,String(Date.now()));
    document.dispatchEvent(new CustomEvent('rm:calendar-reverse-reconciled',{detail:{created,linked,rescheduled,checked:events.length}}));
    return{created,linked,rescheduled};
  }finally{running=false}
}

function schedule(force=false,delay=900){setTimeout(()=>void reconcileCalendarDates({force}).catch(err=>console.error('Falha na conciliação Calendar → plataforma',err)),delay)}

document.addEventListener('rm:data-ready',()=>schedule(false,1100));
document.addEventListener('rm:google-workspace-authorized',()=>schedule(true,500));
window.addEventListener('online',()=>schedule(false,600));
window.addEventListener('focus',()=>schedule(false,800));

export {reconcileCalendarDates};
