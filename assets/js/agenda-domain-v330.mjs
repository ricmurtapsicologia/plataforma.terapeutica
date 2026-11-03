export const AGENDA_VERSION='3.3.1';
export const ATTENDANCE_VALUES=['','Presente','Faltou','Desmarcou'];

export function transitionAttendance(appointment,value,now=new Date().toISOString()){
  if(!appointment?.id)throw new Error('Sessão inválida.');
  if(!ATTENDANCE_VALUES.includes(value))throw new Error('Estado de presença inválido.');
  const next={...appointment,attendanceStatus:value,attendanceUpdatedAt:now,updatedAt:now};
  if(value==='Presente')next.status='Realizada';
  else if(value==='Desmarcou')next.status='Cancelada';
  else if(value==='Faltou'&&next.status==='Cancelada')next.status='Confirmada';
  return next;
}

export function attendanceLabel(appointment){
  return appointment?.attendanceStatus||appointment?.status||'Aguardando confirmação';
}

export function appointmentsConflict(appointments=[],candidate,ignoreId=''){
  if(!candidate?.date||!candidate?.time)return null;
  const start=new Date(`${candidate.date}T${candidate.time}:00`).getTime();
  const end=start+(Number(candidate.duration)||50)*60000;
  return (Array.isArray(appointments)?appointments:[]).find(other=>{
    if(!other?.id||other.id===ignoreId||other.status==='Cancelada'||other.date!==candidate.date||!other.time)return false;
    const otherStart=new Date(`${other.date}T${other.time}:00`).getTime();
    const otherEnd=otherStart+(Number(other.duration)||50)*60000;
    return start<otherEnd&&end>otherStart;
  })||null;
}

/** Horários locais da grade; não dependem de UTC nem de arredondamento por pixel. */
export function agendaSlotTime(index,startHour=6,endHour=23){
  if(!Number.isInteger(index)||index<0||index>=(endHour-startHour+1)*2)throw new Error('Intervalo da agenda inválido.');
  return `${String(startHour+Math.floor(index/2)).padStart(2,'0')}:${index%2?'30':'00'}`;
}
/** Uma série é planejada integralmente antes da transação de gravação. */
export function appointmentSeriesDates(date,recurrence='Avulso',count=1){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))throw new Error('Data de agendamento inválida.');
  const initial=new Date(`${date}T12:00:00Z`);
  if(Number.isNaN(initial.getTime())||initial.toISOString().slice(0,10)!==date)throw new Error('Data de agendamento inválida.');
  const step=recurrence==='Semanal'?7:recurrence==='Quinzenal'?14:0;
  const total=step?Number(count):1;
  if(!Number.isInteger(total)||total<1||total>52)throw new Error('Quantidade de sessões inválida.');
  return Array.from({length:total},(_,i)=>{const d=new Date(initial);d.setUTCDate(d.getUTCDate()+i*step);return d.toISOString().slice(0,10)});
}
export function patientCanSchedule(patient){
  return Boolean(patient?.id&&!['encerrado','inativo'].includes(String(patient?.status||'').trim().toLowerCase()));
}
