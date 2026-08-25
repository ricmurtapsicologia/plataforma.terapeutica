const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const clean=value=>String(value??'').replace(/\s+/g,' ').trim().toLowerCase();

export function appointmentIsCancelled(appointment){
  return appointment?.status==='Cancelada'||appointment?.attendanceStatus==='Desmarcou';
}

function brDate(iso=''){
  const value=String(iso||'');
  return /^\d{4}-\d{2}-\d{2}/.test(value)?`${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}`:'';
}

function samePatient(payment,appointment){
  return Boolean(payment?.patientId&&appointment?.patientId&&payment.patientId===appointment.patientId);
}

function sameClinicalSession(payment,appointment){
  const sessionId=appointment?.clinicalSessionId||appointment?.id||'';
  return Boolean(payment?.clinicalSessionId&&sessionId&&payment.clinicalSessionId===sessionId);
}

function noteMatchesAppointment(note,appointment){
  const text=clean(note),date=brDate(appointment?.date),time=String(appointment?.time||'').slice(0,5);
  if(!text||!date)return false;
  if(!text.includes(date))return false;
  return time?text.includes(time):true;
}

function linkedExplicitly(payment,appointment){
  if(payment?.appointmentId&&payment.appointmentId===appointment?.id)return true;
  if(arr(payment?.appointmentIds).includes(appointment?.id))return true;
  return sameClinicalSession(payment,appointment);
}

export function inferAppointmentIdForPayment(payment,appointments=[]){
  const all=arr(appointments),patientId=payment?.patientId||'';
  if(!patientId)return'';

  if(payment?.appointmentId){
    const explicit=all.find(a=>a?.id===payment.appointmentId&&a?.patientId===patientId);
    if(explicit)return explicit.id;
  }

  if(payment?.clinicalSessionId){
    const bySession=all.find(a=>a?.patientId===patientId&&(a?.clinicalSessionId||a?.id)===payment.clinicalSessionId);
    if(bySession)return bySession.id;
  }

  const noteMatches=all.filter(a=>a?.patientId===patientId&&noteMatchesAppointment(payment?.note,a));
  if(noteMatches.length===1)return noteMatches[0].id;

  const sameDate=all.filter(a=>a?.patientId===patientId&&a?.date===payment?.date&&!appointmentIsCancelled(a));
  if(sameDate.length===1)return sameDate[0].id;

  return'';
}

export function paymentMatchesAppointment(payment,appointment,appointments=[]){
  if(!samePatient(payment,appointment))return false;
  if(linkedExplicitly(payment,appointment))return true;
  return inferAppointmentIdForPayment(payment,appointments)===appointment?.id;
}

export function paymentStateForAppointment(appointment,{payments=[],appointments=[]}={}){
  const matched=arr(payments).filter(payment=>paymentMatchesAppointment(payment,appointment,appointments));
  const paid=matched.find(payment=>payment?.status==='Pago');
  if(paid)return{code:'paid',label:'Pago',symbol:'✓',payment:paid,matched};
  const pending=matched.find(payment=>payment?.status==='Pendente');
  if(pending)return{code:'pending',label:'Pendente',symbol:'•',payment:pending,matched};
  if(appointmentIsCancelled(appointment))return{code:'none',label:'Sem cobrança',symbol:'—',payment:null,matched};
  return{code:'unpaid',label:'Não pago',symbol:'$',payment:null,matched};
}
