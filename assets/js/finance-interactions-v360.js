import {data} from './state.js';
import {modal,esc,fmtDate,money} from './ui.js';
import {appointmentIsPerformed,paymentStateForAppointment,sessionReferenceValue} from './payment-status-v322.mjs';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
function patient(id){return arr(data.patients).find(p=>p?.id===id)||null}
function showMonth(month){
  const sessions=arr(data.appointments).filter(a=>String(a?.date||'').startsWith(month)&&appointmentIsPerformed(a)).sort((a,b)=>`${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`));
  const payments=arr(data.payments).filter(p=>String(p?.date||'').startsWith(month)&&p?.status==='Pago').sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const sessionRows=sessions.map(a=>{const p=patient(a.patientId),pay=paymentStateForAppointment(a,{payments:data.payments,appointments:data.appointments});return`<tr><td>${fmtDate(a.date)} ${esc(a.time||'')}</td><td data-sensitive>${esc(p?.name||'—')}</td><td>${money(sessionReferenceValue(a,p))}</td><td>${esc(pay.label)}</td><td>${esc(pay.source||'—')}</td></tr>`}).join('');
  const paymentRows=payments.map(p=>`<tr><td>${fmtDate(p.date)}</td><td data-sensitive>${esc(patient(p.patientId)?.name||'—')}</td><td>${money(p.value)}</td><td>${esc(p.competence||String(p.date||'').slice(0,7)||'—')}</td><td>${arr(p.appointmentIds).length||p.appointmentId?String(arr(p.appointmentIds).length||1):'—'}</td></tr>`).join('');
  modal(`Financeiro · ${month.slice(5,7)}/${month.slice(0,4)}`,`<div class="grid grid-2"><section><h3>Sessões realizadas</h3>${sessionRows?`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Paciente</th><th>Produzido</th><th>Pagamento</th><th>Origem</th></tr></thead><tbody>${sessionRows}</tbody></table></div>`:'<p class="muted">Nenhuma sessão realizada.</p>'}</section><section><h3>Recebimentos</h3>${paymentRows?`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Paciente</th><th>Valor</th><th>Competência</th><th>Sessões</th></tr></thead><tbody>${paymentRows}</tbody></table></div>`:'<p class="muted">Nenhum recebimento registrado.</p>'}</section></div>`,`<button class="btn" data-action="close-modal">Fechar</button>`,true)
}
document.addEventListener('click',event=>{const el=event.target.closest?.('[data-finance-month]');if(!el)return;event.preventDefault();event.stopImmediatePropagation();showMonth(el.dataset.financeMonth||'')},true);
globalThis.__rmFinance360={showMonth};
