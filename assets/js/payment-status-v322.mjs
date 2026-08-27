const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const clean=value=>String(value??'').replace(/\s+/g,' ').trim().toLowerCase();

export function appointmentIsCancelled(appointment){
  return appointment?.status==='Cancelada'||appointment?.attendanceStatus==='Desmarcou';
}

export function appointmentIsPerformed(appointment){
  if(!appointment||appointmentIsCancelled(appointment))return false;
  return appointment?.status==='Realizada'||['Presente','Compareceu'].includes(appointment?.attendanceStatus);
}

export function sessionReferenceValue(appointment,patient){
  return Number(appointment?.value??patient?.sessionValue??patient?.value??0)||0;
}

export function patientCareEndDate(patient){
  return String(patient?.careEndedAt||patient?.careEndedRecordedAt||patient?.inactiveAt||patient?.inactivatedAt||'').slice(0,10);
}

export function appointmentValidForPatient(appointment,patient){
  if(!appointment||!patient)return true;
  if(!['Encerrado','Inativo','Arquivado'].includes(String(patient.status||'')))return true;
  const end=patientCareEndDate(patient);
  return !end||!appointment?.date||String(appointment.date)<end;
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
  if(!text||!date||!text.includes(date))return false;
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
  if(payment?.appointmentId){const explicit=all.find(a=>a?.id===payment.appointmentId&&a?.patientId===patientId);if(explicit)return explicit.id}
  if(payment?.clinicalSessionId){const bySession=all.find(a=>a?.patientId===patientId&&(a?.clinicalSessionId||a?.id)===payment.clinicalSessionId);if(bySession)return bySession.id}
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

export function paymentsForAppointment(appointment,{payments=[],appointments=[]}={}){
  return arr(payments).filter(payment=>paymentMatchesAppointment(payment,appointment,appointments));
}

export function paymentStateForAppointment(appointment,{payments=[],appointments=[]}={}){
  const matched=paymentsForAppointment(appointment,{payments,appointments});
  const paid=matched.find(payment=>payment?.status==='Pago');
  if(paid)return{code:'paid',label:'Pago',symbol:'✓',payment:paid,matched,source:paid?.allocationSource||'payment'};
  if(appointment?.paymentReconciled===true)return{code:'paid',label:'Pago',symbol:'✓',payment:null,matched,source:appointment?.paymentReconciliationSource||'reconciled'};
  const pending=matched.find(payment=>payment?.status==='Pendente');
  if(pending)return{code:'pending',label:'Pendente',symbol:'•',payment:pending,matched,source:'payment'};
  if(appointmentIsCancelled(appointment))return{code:'none',label:'Sem cobrança',symbol:'—',payment:null,matched,source:'cancelled'};
  return{code:'unpaid',label:'Não pago',symbol:'$',payment:null,matched,source:'none'};
}

export function appointmentFinanceFact(appointment,{payments=[],appointments=[],patient=null}={}){
  const state=paymentStateForAppointment(appointment,{payments,appointments});
  const value=sessionReferenceValue(appointment,patient);
  return{appointment,state,value,performed:appointmentIsPerformed(appointment),cancelled:appointmentIsCancelled(appointment),valid:appointmentValidForPatient(appointment,patient)};
}
