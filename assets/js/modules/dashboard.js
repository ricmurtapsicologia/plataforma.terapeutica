import {data,todayISO,patientById} from '../state.js';
import {pageHead,metric,fmtDate,badge,empty,money,barChart,esc} from '../ui.js';

function datePart(value=''){const m=String(value||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?.[1]||''}
function validForPatient(a){const p=patientById(a?.patientId);if(!p||p.status!=='Encerrado')return true;const end=datePart(p.careEndedAt)||datePart(p.careEndedRecordedAt)||datePart(p.updatedAt);return !end||!a?.date||a.date<end}

export function renderDashboard(){
  const today=todayISO();
  const appointments=Array.isArray(data.appointments)?data.appointments:[];
  const records=Array.isArray(data.records)?data.records:[];
  const tasks=Array.isArray(data.tasks)?data.tasks:[];
  const payments=Array.isArray(data.payments)?data.payments:[];
  const consents=Array.isArray(data.consents)?data.consents:[];
  const patients=Array.isArray(data.patients)?data.patients:[];
  const responses=Array.isArray(data.responses)?data.responses:[];

  const upcoming=appointments
    .filter(a=>a.date>=today&&a.status!=='Cancelada'&&validForPatient(a))
    .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const sessionsToday=upcoming.filter(a=>a.date===today);
  const pendingRecords=records.filter(r=>r.status==='Rascunho').length;
  const pendingTasks=tasks.filter(t=>!['Concluída','Respondida'].includes(t.status)).length;
  const pendingPayments=payments.filter(p=>p.status==='Pendente');
  const pendingConsents=consents.filter(c=>c.status==='Pendente').length;
  const pendingResponses=responses.filter(r=>r.status==='Importada').length;
  const week=[0,0,0,0,0,0,0];

  for(const a of upcoming){
    const diff=Math.floor((Date.parse(`${a.date}T12:00:00`)-Date.parse(`${today}T12:00:00`))/86400000);
    if(diff>=0&&diff<7)week[diff]++;
  }

  return pageHead('Hoje','Prioridades clínicas e administrativas do dia.',`<button class="btn" data-action="new-appointment">Nova sessão</button><button class="btn secondary" data-action="new-patient">Novo paciente</button>`)+
  `<section class="grid grid-4">${metric('Sessões hoje',sessionsToday.length)}${metric('Registros pendentes',pendingRecords)}${metric('Tarefas abertas',pendingTasks)}${metric('Pagamentos pendentes',pendingPayments.length)}</section>
  <section class="grid grid-2 mt-16">
    <div class="card"><div class="card-title"><h3 class="mb-0">Agenda próxima</h3><button class="btn ghost" data-route="agenda">Abrir agenda</button></div>${upcoming.length?`<div class="list">${upcoming.slice(0,6).map(a=>{const p=patientById(a.patientId);return`<div class="list-item"><div><strong data-sensitive>${esc(p?.name||a.title||'Compromisso')}</strong><div class="small muted">${fmtDate(a.date)} · ${esc(a.time)} · ${esc(a.modality||'')}</div></div><div class="flex gap-8 items-center">${badge(a.status)}${p?`<button class="btn ghost" data-action="select-patient" data-id="${p.id}" data-target="atendimento">Preparar</button>`:''}</div></div>`}).join('')}</div>`:empty('Agenda livre','Nenhuma sessão futura cadastrada.')}</div>
    <div class="card"><div class="card-title"><h3 class="mb-0">Sessões nos próximos 7 dias</h3></div>${barChart(week,['Hoje','D+1','D+2','D+3','D+4','D+5','D+6'])}</div>
  </section>
  <section class="grid grid-2 mt-16">
    <div class="card"><h3>Pendências de acompanhamento</h3><div class="list"><div class="list-item"><span>Consentimentos pendentes</span>${badge(String(pendingConsents))}</div><div class="list-item"><span>Respostas importadas para revisão</span>${badge(String(pendingResponses))}</div><div class="list-item"><span>Pacientes sem próximo horário</span>${badge(String(patients.filter(p=>p.status==='Ativo'&&!upcoming.some(a=>a.patientId===p.id)).length))}</div></div></div>
    <div class="card"><h3>Financeiro registrado</h3><div class="metric-value money">${money(payments.filter(p=>p.status==='Pago').reduce((s,p)=>s+Number(p.value||0),0))}</div><div class="small muted">Total marcado como pago.</div><button class="btn secondary mt-16" data-route="financeiro">Abrir financeiro</button></div>
  </section>`;
}