const arr=value=>Array.isArray(value)?value.filter(Boolean):[];

export function cancelled(appointment){
  return appointment?.status==='Cancelada'||appointment?.attendanceStatus==='Desmarcou';
}

export function completed(appointment){
  return Boolean(appointment?.sessionEndedAt)||appointment?.clinicalSessionState==='Encerrada'||appointment?.status==='Realizada'||['Presente','Compareceu'].includes(appointment?.attendanceStatus);
}

export function sessionPhase(appointment){
  if(!appointment)return'none';
  if(cancelled(appointment))return'cancelled';
  if(appointment.sessionStartedAt&&!appointment.sessionEndedAt&&appointment.clinicalSessionState!=='Encerrada')return'in_progress';
  if(completed(appointment))return'ended';
  return'scheduled';
}

export function appointmentStartMs(appointment){
  if(!appointment?.date||!appointment?.time)return Number.POSITIVE_INFINITY;
  const ms=new Date(`${appointment.date}T${appointment.time}:00`).getTime();
  return Number.isFinite(ms)?ms:Number.POSITIVE_INFINITY;
}

export function selectPatientSession(appointments,patientId,today,nowMs=Date.now()){
  const list=arr(appointments).filter(a=>a?.patientId===patientId&&!cancelled(a));
  const running=list.filter(a=>sessionPhase(a)==='in_progress').sort((a,b)=>appointmentStartMs(a)-appointmentStartMs(b));
  if(running.length)return running[0];
  const todayOpen=list.filter(a=>a?.date===today&&!completed(a)).sort((a,b)=>Math.abs(appointmentStartMs(a)-nowMs)-Math.abs(appointmentStartMs(b)-nowMs));
  if(todayOpen.length)return todayOpen[0];
  return list.filter(a=>!completed(a)&&appointmentStartMs(a)>=nowMs).sort((a,b)=>appointmentStartMs(a)-appointmentStartMs(b))[0]||null;
}

export function elapsedSeconds(appointment,nowMs=Date.now()){
  const started=new Date(appointment?.sessionStartedAt||'').getTime();
  if(!Number.isFinite(started))return 0;
  const ended=new Date(appointment?.sessionEndedAt||'').getTime();
  const stop=Number.isFinite(ended)?ended:nowMs;
  return Math.max(0,Math.floor((stop-started)/1000));
}

export function formatElapsed(totalSeconds){
  const seconds=Math.max(0,Math.floor(Number(totalSeconds)||0));
  const h=String(Math.floor(seconds/3600)).padStart(2,'0');
  const m=String(Math.floor((seconds%3600)/60)).padStart(2,'0');
  const s=String(seconds%60).padStart(2,'0');
  return`${h}:${m}:${s}`;
}

export function finalDurationMinutes(startedAt,endedAt){
  const start=new Date(startedAt||'').getTime(),end=new Date(endedAt||'').getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 1;
  return Math.max(1,Math.min(720,Math.round((end-start)/60000)));
}

export function meetUrlFromEvent(event){
  const direct=String(event?.hangoutLink||'').trim();
  if(direct)return direct;
  const entry=arr(event?.conferenceData?.entryPoints).find(item=>item?.entryPointType==='video'&&item?.uri);
  return String(entry?.uri||'').trim();
}
