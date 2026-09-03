const arr=value=>Array.isArray(value)?value.filter(Boolean):[];

export const TODAY_TEST_CLEANUP_DATE='2026-09-02';
export const LIVE_TEST_MAX_MINUTES=3;
export const TODAY_CLEANUP_MAX_MINUTES=10;

export function isPlaceholderRecord(record){
  return record?.source?.type==='missing-record-placeholder'||String(record?.id||'').startsWith('missing_record_')||String(record?.text||'').trim()==='Não há prontuário.';
}

export function recordMatchesAppointment(record,appointment){
  if(!record||!appointment||record?.patientId!==appointment?.patientId)return false;
  if(record?.appointmentId===appointment?.id)return true;
  if(appointment?.clinicalSessionId&&record?.clinicalSessionId===appointment.clinicalSessionId)return true;
  return record?.date===appointment?.date&&(!record?.time||!appointment?.time||record.time===appointment.time);
}

export function isSubstantiveRecord(record){
  if(!record||isPlaceholderRecord(record))return false;
  if(record?.status==='Finalizado')return true;
  const text=String(record?.text||'').replace(/\s+/g,' ').trim();
  if(!text)return false;
  const automatic=record?.source?.type==='google-meet-gemini'||record?.status==='Rascunho IA';
  if(!automatic)return text.length>=20;
  if(/Síntese automática indisponível\.?/i.test(text))return false;
  const stripped=text
    .replace(/Foco clínico e evolução da sessão/gi,'')
    .replace(/Procedimentos técnico-científicos adotados/gi,'')
    .replace(/Resposta do paciente e resultados observados/gi,'')
    .replace(/Plano terapêutico, tarefas e encaminhamentos/gi,'')
    .replace(/Não há prontuário\.?/gi,'')
    .replace(/\s+/g,' ').trim();
  return stripped.length>=80;
}

export function linkedRecords(records,appointment){
  return arr(records).filter(record=>recordMatchesAppointment(record,appointment));
}

export function hasSubstantiveRecord(records,appointment){
  return linkedRecords(records,appointment).some(isSubstantiveRecord);
}

export function elapsedMinutes(appointment,nowMs=Date.now()){
  const explicit=Number(appointment?.actualDurationMinutes);
  if(Number.isFinite(explicit)&&explicit>=0)return explicit;
  const started=new Date(appointment?.sessionStartedAt||0).getTime();
  if(!Number.isFinite(started)||started<=0)return Infinity;
  const ended=new Date(appointment?.sessionEndedAt||0).getTime();
  const end=Number.isFinite(ended)&&ended>started?ended:nowMs;
  return Math.max(0,(end-started)/60000);
}

export function isPlatformSession(appointment){
  return appointment?.sessionStartSource==='platform-one-click'||appointment?.sessionOrigin==='manual-flex-start';
}

export function isShortTestCandidate(appointment,{date,maxMinutes=LIVE_TEST_MAX_MINUTES,includeRunning=true,nowMs=Date.now()}={}){
  if(!appointment||!isPlatformSession(appointment))return false;
  if(date&&appointment?.date!==date)return false;
  const running=appointment?.clinicalSessionState==='Em atendimento'&&Boolean(appointment?.sessionStartedAt)&&!appointment?.sessionEndedAt;
  if(running&&!includeRunning)return false;
  return elapsedMinutes(appointment,nowMs)<=maxMinutes;
}

export function resetScheduledTestSession(appointment,at=''){
  return {
    ...appointment,
    status:appointment?.sessionPreviousStatus||'Confirmada',
    attendanceStatus:appointment?.sessionPreviousAttendanceStatus||'',
    sessionStartedAt:'',
    sessionEndedAt:'',
    clinicalSessionState:'',
    actualDurationMinutes:null,
    sessionStartSource:'',
    sessionEndSource:'',
    sessionPreviousStatus:'',
    sessionPreviousAttendanceStatus:'',
    testSessionDiscardedAt:at||'',
    updatedAt:at||appointment?.updatedAt||''
  };
}

export function shouldDeleteAdHocTest(appointment){
  return appointment?.sessionOrigin==='manual-flex-start';
}
