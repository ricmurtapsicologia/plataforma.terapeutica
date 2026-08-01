import {runtime,selectedPatient} from './state.js';

function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function address(p){const a=p?.address||{};const street=[a.street,a.number].filter(Boolean).join(', ');return[street,a.complement,a.neighborhood,a.city,a.state,a.zip].filter(Boolean).join(' · ')||'Não informado'}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}

function enhance(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='summary')return;
  const p=selectedPatient(),box=document.querySelector('#patient-tab-content');if(!p||!box)return;
  if(box.querySelector('.patient-registration-card'))return;
  const card=document.createElement('section');card.className='card mt-16 patient-registration-card';
  card.innerHTML=`<div class="card-title"><div><h3 class="mb-0">Cadastro e organização das sessões</h3><div class="small muted">Dados administrativos de consulta rápida.</div></div><button class="btn" data-action="schedule-selected-patient">Agendar sessão</button></div><div class="patient-details"><div><span>CPF</span><strong data-sensitive>${esc(p.cpf||'Não informado')}</strong></div><div><span>RG</span><strong data-sensitive>${esc(p.rg||'Não informado')}</strong></div><div class="span-all"><span>Endereço completo</span><strong data-sensitive>${esc(address(p))}</strong></div><div><span>Frequência usual</span><strong>${esc(p.sessionRecurrence||'Avulso')}</strong></div><div><span>Valor de referência</span><strong>${money(p.value)}</strong></div><div><span>Telefone</span><strong data-sensitive>${esc(p.phone||'Não informado')}</strong></div><div><span>E-mail</span><strong data-sensitive>${esc(p.email||'Não informado')}</strong></div></div>`;
  const first=box.querySelector('section');if(first?.nextSibling)box.insertBefore(card,first.nextSibling);else box.append(card);
  const context=document.querySelector('.patient-context .flex.gap-8.wrap');if(context&&!context.querySelector('[data-action="schedule-selected-patient"]')){const b=document.createElement('button');b.className='btn';b.dataset.action='schedule-selected-patient';b.textContent='Agendar sessão';context.prepend(b)}
}

const observer=new MutationObserver(()=>requestAnimationFrame(enhance));observer.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('hashchange',()=>setTimeout(enhance,0));setTimeout(enhance,200);
