export const AGENDA_VERSION='3.3.0';
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
