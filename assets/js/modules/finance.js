import {data,selectedPatient} from '../state.js';
import {empty,esc,badge,fmtDate,money,metric} from '../ui.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function validAppointment(a){return Boolean(a?.date)&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou'}
function patientValue(patientId,appointment){const p=arr(data.patients).find(x=>x?.id===patientId);return Number(appointment?.value??p?.value??0)||0}
function inScope(item,global,patientId){return global||item?.patientId===patientId}
function monthKey(value=''){return String(value||'').slice(0,7)}
function currentMonthKey(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function compactMoney(value){const n=Number(value||0);if(n>=1000000)return`R$ ${(n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`;if(n>=1000)return`R$ ${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`;return money(n)}

function monthlyFinance(global,patientId){
  const year=new Date().getFullYear(),rows=MONTHS.map((label,month)=>({label,month,received:0,estimated:0,sessions:0}));
  for(const payment of arr(data.payments)){
    if(!inScope(payment,global,patientId)||payment.status!=='Pago'||!payment.date||Number(String(payment.date).slice(0,4))!==year)continue;
    const month=Number(String(payment.date).slice(5,7))-1;
    if(rows[month])rows[month].received+=Number(payment.value||0);
  }
  for(const appointment of arr(data.appointments)){
    if(!inScope(appointment,global,patientId)||!validAppointment(appointment)||Number(String(appointment.date).slice(0,4))!==year)continue;
    const patient=arr(data.patients).find(p=>p?.id===appointment.patientId);
    if(patient?.status==='Encerrado'&&patient?.careEndedAt&&appointment.date>=patient.careEndedAt)continue;
    const month=Number(String(appointment.date).slice(5,7))-1;
    if(!rows[month])continue;
    rows[month].estimated+=patientValue(appointment.patientId,appointment);
    rows[month].sessions++;
  }
  return{year,rows};
}

function financeChart(model){
  const max=Math.max(1,...model.rows.flatMap(x=>[x.received,x.estimated])),currentMonth=new Date().getMonth();
  const aria=model.rows.map(x=>`${x.label}: recebido ${money(x.received)}, estimado ${money(x.estimated)}`).join('; ');
  return`<section class="card mt-16 finance-chart-card"><div class="card-title"><div><h3 class="mb-0">Recebido × estimado por mês — ${model.year}</h3><div class="small muted">Estimado = sessões não canceladas da agenda × valor de referência cadastrado para cada paciente.</div></div><div class="finance-legend" aria-hidden="true"><span><i class="finance-legend-dot received"></i>Recebido</span><span><i class="finance-legend-dot estimated"></i>Estimado</span></div></div><div class="finance-chart-scroll"><div class="finance-column-chart" role="img" aria-label="${esc(aria)}"><div class="finance-scale"><span>${esc(compactMoney(max))}</span><span>${esc(compactMoney(max/2))}</span><span>R$ 0</span></div><div class="finance-plot">${model.rows.map((x,i)=>{const rh=x.received>0?Math.max(3,(x.received/max)*100):0,eh=x.estimated>0?Math.max(3,(x.estimated/max)*100):0;return`<div class="finance-month ${i===currentMonth?'current':''}" title="${esc(`${x.label}/${model.year} — Recebido: ${money(x.received)} · Estimado: ${money(x.estimated)} · ${x.sessions} sessão(ões)`)}"><div class="finance-bars"><div class="finance-bar received" style="height:${rh}%"><span>${x.received?esc(compactMoney(x.received)):''}</span></div><div class="finance-bar estimated" style="height:${eh}%"><span>${x.estimated?esc(compactMoney(x.estimated)):''}</span></div></div><div class="finance-month-label">${x.label}</div></div>`}).join('')}</div></div></div></section>`;
}

export function renderFinance({global=false}={}){
  const p=selectedPatient();
  if(!global&&!p)return empty('Paciente não selecionado','Selecione um paciente.');
  const patientId=p?.id||'',list=arr(data.payments).filter(x=>inScope(x,global,patientId));
  const paid=list.filter(x=>x.status==='Pago').reduce((s,x)=>s+Number(x.value||0),0),pending=list.filter(x=>x.status==='Pendente').reduce((s,x)=>s+Number(x.value||0),0),model=monthlyFinance(global,patientId),month=currentMonthKey(),current=model.rows[new Date().getMonth()]||{estimated:0,sessions:0},monthPayments=list.filter(x=>monthKey(x.date)===month).length;
  return`<section class="grid grid-4">${metric('Recebido total',money(paid))}${metric('Pendente',money(pending))}${metric('Estimado no mês',money(current.estimated),`${current.sessions} sessão(ões) previstas em ${MONTHS[new Date().getMonth()]}/${model.year}`)}${metric('Lançamentos no mês',String(monthPayments))}</section>${financeChart(model)}<section class="card mt-16"><div class="card-title"><div><h3 class="mb-0">Lançamentos</h3><div class="small muted">Registro administrativo local.</div></div><button class="btn" data-action="new-payment" ${!global&&!p?'disabled':''}>Novo lançamento</button></div>${list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Paciente</th><th>Valor</th><th>Status</th><th>Forma</th><th></th></tr></thead><tbody>${[...list].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr><td>${fmtDate(x.date)}</td><td data-sensitive>${esc(arr(data.patients).find(p=>p.id===x.patientId)?.name||'—')}</td><td class="money">${money(x.value)}</td><td>${badge(x.status)}</td><td>${esc(x.method||'')}</td><td><button class="btn ghost" data-action="edit-payment" data-id="${x.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum lançamento','Registre pagamentos e pendências.')}</section>`;
}
