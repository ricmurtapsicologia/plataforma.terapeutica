import {data,runtime,preferences,uid,nowISO,patientById,selectedPatient} from './state.js';
import {putEncrypted,deleteRecord} from './database.js';
import {validatePatient,sanitizeText,assert} from './validation.js';
import {openWhatsApp,openEmail,renderTemplate,DEFAULT_MESSAGES} from './communications.js';
import {closeModal,toast,fmtDate} from './ui.js';
import {renderAppointments as renderAppointments136} from './modules/appointments.js?v=1.3.6';

const customActions=new Set(['save-patient','save-appointment','schedule-selected-patient','agenda-prev-week','agenda-next-week','agenda-today','appointment-whatsapp','patient-whatsapp','patient-email','document-email','clear-patient-local-data']);

function rerender(route=runtime.route){runtime.route=route;window.dispatchEvent(new Event('hashchange'))}
async function saveEntity(store,item){assert(runtime.key,'Sessão bloqueada. Entre novamente.');item.updatedAt=nowISO();const list=data[store]||(data[store]=[]),i=list.findIndex(x=>x.id===item.id);if(i>=0)list[i]=item;else list.push(item);await putEncrypted(store,item,runtime.key);return item}
async function removeEntity(store,id){data[store]=(data[store]||[]).filter(x=>x.id!==id);await deleteRecord(store,id)}
function firstName(p){return sanitizeText((p?.preferredName||p?.name||'').split(/\s+/)[0]||'')}
function q(s){return document.querySelector(s)}

function maskPhone(input){let n=input.value.replace(/\D/g,'').slice(0,11);if(n.length>10)input.value=`(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;else if(n.length>6)input.value=`(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;else if(n.length>2)input.value=`(${n.slice(0,2)}) ${n.slice(2)}`;else input.value=n}
function maskCpf(input){let n=input.value.replace(/\D/g,'').slice(0,11);input.value=n.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1-$2')}
function maskCep(input){let n=input.value.replace(/\D/g,'').slice(0,8);input.value=n.length>5?`${n.slice(0,5)}-${n.slice(5)}`:n}

function enhancePatientModal(){
  const body=q('.modal-body'),id=q('#p-id');if(!body||!id||q('#p-cpf'))return;
  const p=patientById(id.value)||{},a=p.address||{};
  const firstRow=body.querySelector('.input-row');
  firstRow?.insertAdjacentHTML('afterend',`<div class="input-row mt-12"><div class="field"><label>CPF</label><input id="p-cpf" class="input" inputmode="numeric" placeholder="000.000.000-00" value="${p.cpf||''}"></div><div class="field"><label>RG</label><input id="p-rg" class="input" value="${p.rg||''}"></div></div>`);
  const summary=q('#p-summary')?.closest('.field');
  summary?.insertAdjacentHTML('beforebegin',`<div class="section-label mt-16">Endereço</div><div class="input-row"><div class="field"><label>CEP</label><input id="p-zip" class="input" inputmode="numeric" placeholder="00000-000" value="${a.zip||''}"></div><div class="field"><label>Logradouro</label><input id="p-street" class="input" value="${a.street||''}"></div></div><div class="input-row mt-12"><div class="field"><label>Número</label><input id="p-number" class="input" value="${a.number||''}"></div><div class="field"><label>Complemento</label><input id="p-complement" class="input" value="${a.complement||''}"></div></div><div class="input-row mt-12"><div class="field"><label>Bairro</label><input id="p-neighborhood" class="input" value="${a.neighborhood||''}"></div><div class="field"><label>Cidade</label><input id="p-city" class="input" value="${a.city||''}"></div></div><div class="input-row mt-12"><div class="field"><label>UF</label><input id="p-state" class="input" maxlength="2" value="${a.state||''}"></div><div></div></div>`);
  const phone=q('#p-phone');if(phone){phone.placeholder='(00) 00000-0000';phone.closest('.field').querySelector('label').textContent='Telefone';maskPhone(phone)}
  const value=q('#p-value');if(value&&!value.closest('.currency-field')){const wrap=document.createElement('div');wrap.className='currency-field';const span=document.createElement('span');span.textContent='R$';value.parentNode.insertBefore(wrap,value);wrap.append(span,value)}
}
function enhanceAppointmentModal(){
  const body=q('.modal-body'),id=q('#a-id');if(!body||!id||id.value||q('#a-recurrence'))return;
  const note=q('#a-note')?.closest('.field');
  note?.insertAdjacentHTML('beforebegin',`<div class="section-label mt-16">Recorrência</div><div class="input-row"><div class="field"><label>Repetir</label><select id="a-recurrence" class="select"><option>Nenhuma</option><option>Semanal</option><option>Quinzenal</option></select></div><div class="field"><label>Número de sessões</label><input id="a-recurrence-count" class="input" type="number" min="1" max="52" value="1"></div></div><div class="tiny muted mt-8">Cria sessões futuras no mesmo dia da semana e horário.</div>`);
}

async function savePatient(){
  const id=q('#p-id').value||uid('pat'),prior=patientById(id),obj={...(prior||{}),id,name:sanitizeText(q('#p-name').value),preferredName:sanitizeText(q('#p-preferred').value),cpf:sanitizeText(q('#p-cpf')?.value),rg:sanitizeText(q('#p-rg')?.value),code:sanitizeText(q('#p-code').value)||`PAC-${String((data.patients||[]).length+1).padStart(3,'0')}`,status:q('#p-status').value,birthDate:q('#p-birth').value,phone:sanitizeText(q('#p-phone').value),email:sanitizeText(q('#p-email').value),modality:q('#p-modality').value,value:Number(q('#p-value').value)||0,address:{zip:sanitizeText(q('#p-zip')?.value),street:sanitizeText(q('#p-street')?.value),number:sanitizeText(q('#p-number')?.value),complement:sanitizeText(q('#p-complement')?.value),neighborhood:sanitizeText(q('#p-neighborhood')?.value),city:sanitizeText(q('#p-city')?.value),state:sanitizeText(q('#p-state')?.value)},summary:sanitizeText(q('#p-summary').value),communicationPreferences:{...(prior?.communicationPreferences||{}),channel:q('#p-channel').value,whatsappConsent:q('#p-wa-consent').checked,emailConsent:q('#p-email-consent').checked,silentStart:prior?.communicationPreferences?.silentStart||'20:00',silentEnd:prior?.communicationPreferences?.silentEnd||'08:00'},createdAt:prior?.createdAt||nowISO()};
  validatePatient(obj);await saveEntity('patients',obj);runtime.selectedPatientId=id;closeModal();rerender('patients');toast('Cadastro salvo.','success')
}
function conflict(base,date,ignore=''){const start=new Date(`${date}T${base.time}:00`).getTime(),end=start+base.duration*60000;return(data.appointments||[]).find(x=>x.id!==ignore&&x.status!=='Cancelada'&&x.date===date&&(()=>{const s=new Date(`${x.date}T${x.time}:00`).getTime(),e=s+(Number(x.duration)||50)*60000;return start<e&&end>s})())}
async function saveAppointment(){
  const id=q('#a-id').value,patientId=q('#a-patient').value;assert(patientId,'Selecione explicitamente o paciente.');
  const base={patientId,date:q('#a-date').value,time:q('#a-time').value,duration:Number(q('#a-duration').value)||50,status:q('#a-status').value,modality:q('#a-modality').value,location:sanitizeText(q('#a-location').value),note:sanitizeText(q('#a-note').value)};
  if(id){const c=conflict(base,base.date,id);assert(!c,`Conflito de horário com ${patientById(c.patientId)?.name||'outro compromisso'}.`);const old=(data.appointments||[]).find(x=>x.id===id)||{};await saveEntity('appointments',{...old,...base,id,createdAt:old.createdAt||nowISO()});closeModal();rerender();toast('Horário salvo.','success');return}
  const recurrence=q('#a-recurrence')?.value||'Nenhuma',count=Math.max(1,Math.min(52,Number(q('#a-recurrence-count')?.value)||1)),step=recurrence==='Semanal'?7:recurrence==='Quinzenal'?14:0,total=step?count:1,seriesId=total>1?uid('series'):'',dates=[];
  for(let i=0;i<total;i++){const d=new Date(`${base.date}T12:00:00`);d.setDate(d.getDate()+i*step);const iso=d.toISOString().slice(0,10),c=conflict(base,iso);assert(!c,`Conflito de horário em ${new Intl.DateTimeFormat('pt-BR').format(d)} com ${patientById(c.patientId)?.name||'outro compromisso'}.`);dates.push(iso)}
  for(let i=0;i<dates.length;i++)await saveEntity('appointments',{...base,id:uid('apt'),date:dates[i],recurrence,seriesId,occurrenceIndex:i+1,occurrenceCount:dates.length,createdAt:nowISO()});
  closeModal();rerender();toast(dates.length>1?`${dates.length} sessões agendadas.`:'Horário salvo.','success')
}

document.addEventListener('input',e=>{if(e.target.id==='p-phone')maskPhone(e.target);if(e.target.id==='p-cpf')maskCpf(e.target);if(e.target.id==='p-zip')maskCep(e.target);if(e.target.id==='p-state')e.target.value=e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2)},true);

document.addEventListener('click',e=>{const a=e.target.closest('[data-action]')?.dataset.action;if(a==='new-patient'||a==='edit-patient')setTimeout(enhancePatientModal,0);if(a==='new-appointment'||a==='edit-appointment')setTimeout(enhanceAppointmentModal,0)},false);

document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el||!customActions.has(el.dataset.action))return;e.preventDefault();e.stopImmediatePropagation();const a=el.dataset.action;
  try{
    if(a==='save-patient')return await savePatient();
    if(a==='save-appointment')return await saveAppointment();
    if(a==='schedule-selected-patient'){assert(selectedPatient(),'Selecione um paciente.');const b=document.createElement('button');b.dataset.action='new-appointment';b.hidden=true;document.body.append(b);b.click();b.remove();setTimeout(enhanceAppointmentModal,0);return}
    if(a==='agenda-prev-week'){localStorage.setItem('rm.agenda.weekOffset',String(Number(localStorage.getItem('rm.agenda.weekOffset')||0)-1));return rerender('agenda')}
    if(a==='agenda-next-week'){localStorage.setItem('rm.agenda.weekOffset',String(Number(localStorage.getItem('rm.agenda.weekOffset')||0)+1));return rerender('agenda')}
    if(a==='agenda-today'){localStorage.setItem('rm.agenda.weekOffset','0');return rerender('agenda')}
    if(a==='appointment-whatsapp'){const x=(data.appointments||[]).find(v=>v.id===el.dataset.id),p=patientById(x?.patientId);assert(x&&p?.phone,'Sessão ou telefone não localizado.');openWhatsApp(p.phone,renderTemplate(DEFAULT_MESSAGES.sessionReminder,{primeiro_nome:firstName(p),data_sessao:fmtDate(x.date),hora_sessao:x.time,nome_profissional:preferences.professionalName,titulo_profissional:preferences.professionalTitle}));return}
    if(a==='patient-whatsapp'){const p=selectedPatient();assert(p?.phone,'Cadastre o telefone do paciente.');openWhatsApp(p.phone,`Olá, ${firstName(p)}. ${preferences.professionalName} — ${preferences.professionalTitle}.`);return}
    if(a==='patient-email'){const p=selectedPatient();assert(p?.email,'Cadastre o e-mail do paciente.');openEmail({to:p.email,subject:'Comunicação de acompanhamento',body:`Olá, ${firstName(p)}.\n\n${preferences.professionalName} — ${preferences.professionalTitle}.`});return}
    if(a==='document-email'){const d=(data.documents||[]).find(x=>x.id===el.dataset.id),p=selectedPatient();assert(d&&p?.email,'Documento ou e-mail não localizado.');openEmail({to:p.email,subject:'Documento disponível',body:`Olá, ${firstName(p)}. O documento “${d.type}” foi preparado. Anexe o PDF antes do envio.\n\n${preferences.professionalName} — ${preferences.professionalTitle}.`});return}
    if(a==='clear-patient-local-data'){const p=selectedPatient();assert(p,'Selecione um paciente.');if(!confirm(`Excluir todos os dados locais vinculados a ${p.name}? Os demais pacientes serão preservados.`)||!confirm('Confirmação final: esta ação remove somente os dados deste paciente.'))return;for(const store of ['appointments','records','notes','formulations','goals','tasks','materials','documents','payments','consents','communications','settings'])for(const item of [...(data[store]||[]).filter(x=>x.patientId===p.id)])await removeEntity(store,item.id);await removeEntity('patients',p.id);runtime.selectedPatientId=null;runtime.patientTab='summary';rerender('patients');toast('Dados deste paciente excluídos.','success');return}
  }catch(err){toast(err.message||'Não foi possível concluir a ação.','error');console.error(err)}
},true);

function refreshAgenda(){if(runtime.locked||runtime.route!=='agenda')return;const main=q('#main-content');if(!main||main.dataset.agendaUx==='136')return;main.innerHTML=renderAppointments136();main.dataset.agendaUx='136'}
const observer=new MutationObserver(refreshAgenda);observer.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('hashchange',()=>setTimeout(refreshAgenda,0));setTimeout(refreshAgenda,250);
