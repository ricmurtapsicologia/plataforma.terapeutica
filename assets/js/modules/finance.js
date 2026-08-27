import {data,selectedPatient,todayISO} from '../state.js';
import {empty,esc,badge,fmtDate,money,metric} from '../ui.js';
import {appointmentIsPerformed,appointmentValidForPatient,paymentStateForAppointment,sessionReferenceValue,paymentsForAppointment} from '../payment-status-v322.mjs';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function inScope(item,global,patientId){return global||item?.patientId===patientId}
function monthKey(value=''){return String(value||'').slice(0,7)}
function patientFor(id){return arr(data.patients).find(p=>p?.id===id)||null}
function compactMoney(value){const n=Number(value||0);if(n>=1000000)return`R$ ${(n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`;if(n>=1000)return`R$ ${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`;return money(n)}
function validAppointment(a){const p=patientFor(a?.patientId);return Boolean(a?.date)&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou'&&appointmentValidForPatient(a,p)}

function financialModel(global,patientId){
  const year=new Date().getFullYear(),rows=MONTHS.map((label,month)=>({label,month,received:0,produced:0,open:0,forecast:0,sessions:0,paidSessions:0,reconciledOnly:0}));
  const payments=arr(data.payments).filter(p=>inScope(p,global,patientId)&&p?.status==='Pago'&&p?.date&&Number(String(p.date).slice(0,4))===year);
  for(const payment of payments){const month=Number(String(payment.date).slice(5,7))-1;if(rows[month])rows[month].received+=Number(payment.value||0)}
  const appointments=arr(data.appointments).filter(a=>inScope(a,global,patientId)&&validAppointment(a)&&Number(String(a.date).slice(0,4))===year);
  for(const appointment of appointments){
    const p=patientFor(appointment.patientId),month=Number(String(appointment.date).slice(5,7))-1,row=rows[month];if(!row)continue;
    const value=sessionReferenceValue(appointment,p),pay=paymentStateForAppointment(appointment,{payments:data.payments,appointments:data.appointments});
    if(appointmentIsPerformed(appointment)){
      row.produced+=value;row.sessions++;
      if(pay.code==='paid'){
        row.paidSessions++;
        const linkedPaid=paymentsForAppointment(appointment,{payments:data.payments,appointments:data.appointments}).some(x=>x?.status==='Pago');
        if(!linkedPaid&&appointment.paymentReconciled===true)row.reconciledOnly+=value;
      }else row.open+=value;
    }else if(appointment.date>todayISO())row.forecast+=value;
  }
  const totals=rows.reduce((o,r)=>({received:o.received+r.received,produced:o.produced+r.produced,open:o.open+r.open,forecast:o.forecast+r.forecast,sessions:o.sessions+r.sessions,reconciledOnly:o.reconciledOnly+r.reconciledOnly}),{received:0,produced:0,open:0,forecast:0,sessions:0,reconciledOnly:0});
  totals.ticket=totals.sessions?totals.produced/totals.sessions:0;
  return{year,rows,totals}
}

function flowChart(model){
  const max=Math.max(1,...model.rows.flatMap(x=>[x.received,x.produced,x.open])),currentMonth=new Date().getMonth();
  const aria=model.rows.map(x=>`${x.label}: produzido ${money(x.produced)}, recebido ${money(x.received)}, em aberto ${money(x.open)}`).join('; ');
  return`<section class="card mt-16 finance-chart-card"><div class="card-title"><div><h3 class="mb-0">Produzido × recebido × em aberto — ${model.year}</h3><div class="small muted">Produzido considera somente sessões realizadas. Recebido é fluxo de caixa efetivamente lançado. Em aberto usa o estado canônico da sessão, portanto uma sessão conciliada como paga não volta a aparecer como dívida.</div></div><div class="finance-legend" aria-hidden="true"><span><i class="finance-legend-dot produced"></i>Produzido</span><span><i class="finance-legend-dot received"></i>Recebido</span><span><i class="finance-legend-dot open"></i>Em aberto</span></div></div><div class="finance-chart-scroll"><div class="finance-column-chart" role="img" aria-label="${esc(aria)}"><div class="finance-scale"><span>${esc(compactMoney(max))}</span><span>${esc(compactMoney(max/2))}</span><span>R$ 0</span></div><div class="finance-plot">${model.rows.map((x,i)=>{const ph=x.produced>0?Math.max(3,(x.produced/max)*100):0,rh=x.received>0?Math.max(3,(x.received/max)*100):0,oh=x.open>0?Math.max(3,(x.open/max)*100):0;return`<button type="button" class="finance-month ${i===currentMonth?'current':''}" data-finance-month="${model.year}-${String(i+1).padStart(2,'0')}" title="Abrir detalhes de ${x.label}/${model.year}"><div class="finance-bars"><span class="finance-bar produced" style="height:${ph}%"></span><span class="finance-bar received" style="height:${rh}%"></span><span class="finance-bar open" style="height:${oh}%"></span></div><div class="finance-month-label">${x.label}</div></button>`}).join('')}</div></div></div></section>`
}
function forecast30_60_90(global,patientId){const today=new Date(`${todayISO()}T12:00:00`),limits=[30,60,90];return limits.map(days=>{const end=new Date(today.getTime()+days*86400000),endIso=`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;let value=0,sessions=0;for(const a of arr(data.appointments).filter(x=>inScope(x,global,patientId)&&validAppointment(x)&&x.date>todayISO()&&x.date<=endIso)){value+=sessionReferenceValue(a,patientFor(a.patientId));sessions++}return{days,value,sessions}})}
function forecastChart(global,patientId){const rows=forecast30_60_90(global,patientId),max=Math.max(1,...rows.map(x=>x.value));return`<section class="card mt-16"><div class="card-title"><div><h3 class="mb-0">Previsão de receita — 30 / 60 / 90 dias</h3><div class="small muted">Somente sessões futuras, não canceladas e válidas para pacientes ativos no período.</div></div></div><div class="finance-forecast-grid mt-16">${rows.map(x=>`<div class="finance-forecast-card"><div class="tiny muted">Próximos ${x.days} dias</div><strong>${money(x.value)}</strong><div class="small muted">${x.sessions} sessão(ões)</div><div class="finance-forecast-track"><span style="width:${(x.value/max)*100}%"></span></div></div>`).join('')}</div></section>`}

export function renderFinance({global=false}={}){
  const p=selectedPatient();if(!global&&!p)return empty('Paciente não selecionado','Selecione um paciente.');const patientId=p?.id||'',list=arr(data.payments).filter(x=>inScope(x,global,patientId)),model=financialModel(global,patientId),tot=model.totals;
  const warning=tot.reconciledOnly?`<div class="notice warning mt-12"><strong>${money(tot.reconciledOnly)}</strong> em sessões está quitado por conciliação documental, mas ainda não está ligado a uma linha bancária individual. Essas sessões não entram em “Em aberto”; “Recebido” permanece sendo fluxo de caixa para evitar dupla contagem.</div>`:'';
  return`<section class="grid grid-3 finance-metrics">${metric('Recebido',money(tot.received),'Fluxo de caixa pago')}${metric('Produzido',money(tot.produced),`${tot.sessions} sessão(ões) realizadas`)}${metric('Em aberto',money(tot.open))}${metric('Previsto',money(tot.forecast),'Sessões futuras válidas no ano')}${metric('Sessões realizadas',String(tot.sessions))}${metric('Ticket médio',money(tot.ticket))}</section>${warning}${flowChart(model)}${forecastChart(global,patientId)}<section class="card mt-16"><div class="card-title"><div><h3 class="mb-0">Lançamentos</h3><div class="small muted">Fluxo de caixa e conciliações administrativas. Pacotes mostram competência e sessões alocadas quando disponíveis.</div></div><button class="btn" data-action="new-payment" ${!global&&!p?'disabled':''}>Novo lançamento</button></div>${list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Paciente</th><th>Valor</th><th>Status</th><th>Competência</th><th>Sessões</th><th>Forma</th><th></th></tr></thead><tbody>${[...list].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr><td>${fmtDate(x.date)}</td><td data-sensitive>${esc(patientFor(x.patientId)?.name||'—')}</td><td class="money">${money(x.value)}</td><td>${badge(x.status)}</td><td>${esc(x.competence||monthKey(x.date)||'—')}</td><td>${arr(x.appointmentIds).length||x.appointmentId?`<span class="badge">${arr(x.appointmentIds).length||1}</span>`:'—'}</td><td>${esc(x.method||'')}</td><td><button class="btn ghost" data-action="edit-payment" data-id="${x.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum lançamento','Registre pagamentos e pendências.')}</section>`
}
