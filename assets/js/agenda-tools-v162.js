import {data,runtime,patientById,nowISO} from './state.js';
import {putEncrypted} from './database.js';
import {openWhatsApp} from './communications.js';
import {modal,closeModal,toast,esc,fmtDate} from './ui.js';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const q=s=>document.querySelector(s);
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;
const firstName=p=>String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'Paciente';

function conflict(base,date,ignore=''){
  const start=new Date(`${date}T${base.time}:00`).getTime();
  const end=start+(Number(base.duration)||50)*60000;
  return arr(data.appointments).find(x=>x?.id!==ignore&&x?.status!=='Cancelada'&&x?.date===date&&(()=>{
    const s=new Date(`${x.date}T${x.time||'00:00'}:00`).getTime();
    const e=s+(Number(x.duration)||50)*60000;
    return start<e&&end>s;
  })());
}
function showReschedule(id){
  const a=appointmentById(id);if(!a)throw new Error('Agendamento não localizado.');
  const p=patientById(a.patientId);
  modal(`Remarcar — ${esc(p?.preferredName||p?.name||'Paciente')}`,
    `<input id="rm-reschedule-id" type="hidden" value="${esc(a.id)}">
     <div class="notice">Altere a data e/ou o horário desta sessão. Em séries recorrentes, somente esta ocorrência será modificada.</div>
     <div class="input-row mt-16">
       <div class="field"><label>Nova data</label><input id="rm-reschedule-date" class="input" type="date" value="${esc(a.date||'')}"></div>
       <div class="field"><label>Novo horário</label><input id="rm-reschedule-time" class="input" type="time" value="${esc(a.time||'')}"></div>
     </div>
     <div class="small muted mt-12">Duração: ${Number(a.duration)||50} min · ${esc(a.modality||'')}</div>`,
    `<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="save-reschedule">Salvar nova data</button>`,true);
}
async function saveReschedule(){
  const id=q('#rm-reschedule-id')?.value,a=appointmentById(id);if(!a)throw new Error('Agendamento não localizado.');
  const date=q('#rm-reschedule-date')?.value,time=q('#rm-reschedule-time')?.value;
  if(!date||!time)throw new Error('Informe data e horário.');
  const c=conflict({...a,time},date,id);
  if(c){const cp=patientById(c.patientId);throw new Error(`Conflito de horário com ${cp?.preferredName||cp?.name||'outro compromisso'}.`)}
  a.date=date;a.time=time;a.rescheduledAt=nowISO();a.updatedAt=nowISO();
  await putEncrypted('appointments',a,runtime.key);
  closeModal();window.__rmRender?.();toast(`Sessão remarcada para ${fmtDate(date)} às ${time}.`,'success');
}
function withinSixHours(a){
  if(!a?.date||!a?.time||a.status==='Cancelada'||a.attendanceStatus==='Desmarcou')return false;
  const ms=new Date(`${a.date}T${a.time}:00`).getTime()-Date.now();return ms>0&&ms<=6*60*60*1000;
}
function sendSixHourReminder(id){
  const a=appointmentById(id),p=patientById(a?.patientId);if(!a||!p?.phone)throw new Error('Paciente ou telefone não localizado.');
  const msg=`Olá, ${firstName(p)}. Passando para lembrar nossa sessão de hoje, às ${a.time}. Caso precise ajustar o horário, me avise por aqui.\n\nRichelmy Murta — Psicólogo Clínico.`;
  openWhatsApp(p.phone,msg);
}
function enhanceAgenda(){
  if(runtime.locked||runtime.route!=='agenda')return;
  document.querySelectorAll('.week-event[data-id]').forEach(card=>{
    const id=card.dataset.id,a=appointmentById(id),actions=card.querySelector('.week-event-actions');
    if(actions&&!actions.querySelector('[data-action="appointment-reschedule"]')){
      const b=document.createElement('button');b.type='button';b.className='week-mini';b.dataset.action='appointment-reschedule';b.dataset.id=id;b.title='Remarcar data/horário';b.setAttribute('aria-label','Remarcar data e horário');b.textContent='↔';actions.insertBefore(b,actions.firstChild);
    }
    if(actions&&a&&withinSixHours(a)&&patientById(a.patientId)?.phone&&!actions.querySelector('[data-action="appointment-whatsapp-6h"]')){
      const b=document.createElement('button');b.type='button';b.className='week-mini week-wa';b.dataset.action='appointment-whatsapp-6h';b.dataset.id=id;b.title='Enviar lembrete da sessão (janela de 6 horas)';b.textContent='6h';actions.insertBefore(b,actions.firstChild);
    }
  });
  document.querySelectorAll('.agenda-item').forEach(item=>{
    const edit=item.querySelector('[data-action="edit-appointment"][data-id]');if(!edit)return;const id=edit.dataset.id,a=appointmentById(id),box=edit.parentElement;
    if(box&&!box.querySelector('[data-action="appointment-reschedule"]')){
      const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.action='appointment-reschedule';b.dataset.id=id;b.textContent='Remarcar';edit.insertAdjacentElement('afterend',b);
    }
    if(box&&a&&withinSixHours(a)&&patientById(a.patientId)?.phone&&!box.querySelector('[data-action="appointment-whatsapp-6h"]')){
      const b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.action='appointment-whatsapp-6h';b.dataset.id=id;b.textContent='WhatsApp 6h';box.appendChild(b);
    }
  });
}

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action]');if(!el)return;
  const action=el.dataset.action;
  if(!['appointment-reschedule','save-reschedule','appointment-whatsapp-6h'].includes(action))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
    if(action==='appointment-reschedule')return showReschedule(el.dataset.id);
    if(action==='save-reschedule')return await saveReschedule();
    if(action==='appointment-whatsapp-6h')return sendSixHourReminder(el.dataset.id);
  }catch(err){toast(err.message||'Não foi possível concluir a ação.','error')}
},true);

document.addEventListener('rm:rendered',()=>setTimeout(enhanceAgenda,0));
document.addEventListener('rm:sync-status',e=>{if(e.detail?.status==='synced')setTimeout(enhanceAgenda,120)});
setInterval(()=>{if(runtime.route==='agenda'&&!runtime.locked)enhanceAgenda()},60000);
