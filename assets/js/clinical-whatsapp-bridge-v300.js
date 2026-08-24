import {data,runtime,patientById,nowISO} from './state.js';
import {putEncrypted} from './database.js';
import {loadWorkspaceAuthorization,CALENDAR_SCOPE} from './google-workspace-token-v260.js';
import {openWhatsApp} from './communications.js';
import {toast,fmtDate} from './ui.js';

const VERSION='3.0.1';
const CORE_URL='https://secretaria-digital-core.vercel.app/api/runtime';
const TIMEZONE='America/Sao_Paulo';
const POLL_MS=60_000;
const REGISTER_RETRY_MS=20_000;
const MIN_REGISTER_LEAD_MS=3*60_000;
const running=new Set();
let cycleTimer=null,pollTimer=null,lastCycleAt=0,lastState='idle',lastError='';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const digits=v=>String(v||'').replace(/\D+/g,'');
const firstName=p=>String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'';
const appointmentById=id=>arr(data.appointments).find(a=>a?.id===id)||null;
function whatsappNumber(phone){let n=digits(phone);if(n.length===10||n.length===11)n=`55${n}`;return n}
function randomNonce(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
function localStart(a){return new Date(`${a.date}T${a.time||'00:00'}:00-03:00`)}
function reminderAt(a){return new Date(localStart(a).getTime()-6*60*60*1000)}
function future(a){const d=localStart(a);return !Number.isNaN(d.getTime())&&d.getTime()>Date.now()}
function eligible(a){const p=patientById(a?.patientId);return Boolean(a?.id&&a?.date&&a?.time&&p?.phone&&future(a)&&!['Cancelada','Realizada','Confirmada'].includes(a.status)&&a.attendanceStatus!=='Desmarcou')}
function signature(a,p){return`${a.date}|${a.time}|${a.duration||50}|${whatsappNumber(p?.phone)}`}

async function sha256Hex(value){const bytes=new TextEncoder().encode(String(value||'')),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')}
async function eventIdFor(value){const bytes=new TextEncoder().encode(String(value||'')),hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),alphabet='0123456789abcdefghijklmnopqrstuv';let bits=0,buffer=0,out='rm';for(const b of hash){buffer=(buffer<<8)|b;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(buffer>>bits)&31]}}if(bits>0)out+=alphabet[(buffer<<(5-bits))&31];return out}

async function saveAppointment(a){a.updatedAt=nowISO();await putEncrypted('appointments',a,runtime.key);return a}
async function ensureNonce(a){if(/^[a-f0-9]{48,128}$/.test(String(a.whatsappBridgeNonce||'')))return false;a.whatsappBridgeNonce=randomNonce();a.whatsappBridgeCreatedAt=nowISO();await saveAppointment(a);return true}

async function googleRequest(auth,url,options={}){const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json',...(options.headers||{})}});if(response.status===401)throw new Error('Autorização Google expirada.');return response}
async function getEvent(auth,eventId){const base='https://www.googleapis.com/calendar/v3/calendars/primary/events';const response=await googleRequest(auth,`${base}/${encodeURIComponent(eventId)}`);if(response.status===404)return null;if(!response.ok)throw new Error(`Google Agenda respondeu ${response.status}.`);return response.json()}
async function patchEvent(auth,eventId,body){const base='https://www.googleapis.com/calendar/v3/calendars/primary/events';const response=await googleRequest(auth,`${base}/${encodeURIComponent(eventId)}?sendUpdates=none`,{method:'PATCH',body:JSON.stringify(body)});if(!response.ok)throw new Error(`Google Agenda respondeu ${response.status}.`);return response.json()}

async function ensureBridgeProperties(a,p,auth){
  const eventId=await eventIdFor(a.id),event=await getEvent(auth,eventId);
  if(!event)throw new Error('Aguardando a sessão ser refletida na Google Agenda.');
  const phone=whatsappNumber(p.phone),phoneHash=await sha256Hex(phone),existing=event?.extendedProperties?.private||{};
  const privateProps={...existing,rmSource:'plataforma-terapeutica',rmAppointmentId:a.id,rmClinicalBridgeNonce:a.whatsappBridgeNonce,rmPatientPhoneSha256:phoneHash};
  if(a.whatsappConfirmationStatus==='Confirmada')privateProps.rmWhatsAppConfirmation='CONFIRMED';
  if(a.whatsappConfirmationStatus==='Desmarcada')privateProps.rmWhatsAppConfirmation='CANCELLED';
  const changed=existing.rmClinicalBridgeNonce!==a.whatsappBridgeNonce||existing.rmPatientPhoneSha256!==phoneHash||existing.rmAppointmentId!==a.id||existing.rmSource!=='plataforma-terapeutica'||(a.whatsappConfirmationStatus==='Confirmada'&&existing.rmWhatsAppConfirmation!=='CONFIRMED')||(a.whatsappConfirmationStatus==='Desmarcada'&&existing.rmWhatsAppConfirmation!=='CANCELLED');
  return{eventId,event:changed?await patchEvent(auth,eventId,{extendedProperties:{private:privateProps}}):event};
}

function reminderText(a,p){return`Olá, ${firstName(p)}. Lembrete do seu atendimento em ${a.date.slice(8,10)}/${a.date.slice(5,7)}, às ${a.time}. Você confirma sua presença? Responda CONFIRMAR ou DESMARCAR.`}
async function registerReminder(a,auth,{manual=false}={}){
  if(running.has(a.id))return false;
  const p=patientById(a.patientId);if(!p?.phone)return false;
  running.add(a.id);
  try{
    await ensureNonce(a);
    const when=reminderAt(a),sig=signature(a,p);
    if(when.getTime()<=Date.now()+MIN_REGISTER_LEAD_MS){
      if(a.whatsappReminderState!=='WINDOW_PASSED'||a.whatsappReminderSignature!==sig){a.whatsappReminderState='WINDOW_PASSED';a.whatsappReminderSignature=sig;a.whatsappReminderSchedule=when.toISOString();await saveAppointment(a)}
      if(manual)toast('O marco de 6 horas desta sessão já passou. O WhatsApp manual continua disponível.','warning');
      return false;
    }
    if(a.whatsappReminderCommandId&&a.whatsappReminderSignature===sig&&a.whatsappReminderSchedule===when.toISOString()&&['QUEUED','REGISTERED'].includes(a.whatsappReminderState))return true;
    const {eventId}=await ensureBridgeProperties(a,p,auth),nonce=a.whatsappBridgeNonce,approvalId=`rm-clinical:${eventId}:${nonce}:${a.id}`;
    const response=await fetch(CORE_URL,{method:'POST',headers:{Authorization:`Bearer rm-clinical.${eventId}.${nonce}`,'Content-Type':'application/json'},body:JSON.stringify({channel:'whatsapp',action:'send_text',classification:'ADMINISTRATIVE',approved:true,approval_id:approvalId,to:whatsappNumber(p.phone),text:reminderText(a,p),scheduled_for:when.toISOString()})});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok||!body?.ok)throw new Error(body?.detail||body?.error||`Secretary Core respondeu ${response.status}.`);
    a.whatsappReminderCommandId=String(body.command_id||'');a.whatsappReminderState=body.queued?'QUEUED':'REGISTERED';a.whatsappReminderSignature=sig;a.whatsappReminderSchedule=when.toISOString();a.whatsappReminderRegisteredAt=nowISO();a.whatsappReminderLastError='';await saveAppointment(a);
    if(manual)toast(`WhatsApp conectado ao Core. Confirmação automática programada para ${when.toLocaleString('pt-BR',{timeZone:TIMEZONE,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}.`,'success');
    return true;
  }catch(err){
    a.whatsappReminderState='ERROR';a.whatsappReminderLastError=String(err?.message||err).slice(0,240);a.whatsappReminderLastAttemptAt=nowISO();try{await saveAppointment(a)}catch{}
    if(manual)toast(a.whatsappReminderLastError||'Não foi possível conectar este agendamento ao WhatsApp.','error');
    return false;
  }finally{running.delete(a.id)}
}

async function applyRemoteConfirmation(a,event){
  const remote=String(event?.extendedProperties?.private?.rmWhatsAppConfirmation||'').toUpperCase();
  if(!['CONFIRMED','CANCELLED'].includes(remote))return false;
  if(remote==='CONFIRMED'){
    if(a.status==='Confirmada'&&a.whatsappConfirmationStatus==='Confirmada')return false;
    a.status='Confirmada';a.whatsappConfirmationStatus='Confirmada';a.whatsappConfirmationAt=String(event?.extendedProperties?.private?.rmWhatsAppConfirmationAt||nowISO());
  }else{
    if(a.status==='Cancelada'&&a.attendanceStatus==='Desmarcou'&&a.whatsappConfirmationStatus==='Desmarcada')return false;
    a.status='Cancelada';a.attendanceStatus='Desmarcou';a.attendanceUpdatedAt=nowISO();a.whatsappConfirmationStatus='Desmarcada';a.whatsappConfirmationAt=String(event?.extendedProperties?.private?.rmWhatsAppConfirmationAt||nowISO());
  }
  await saveAppointment(a);window.__rmRender?.();return true;
}

async function reconcileRemote(auth){
  let changed=0;
  for(const a of arr(data.appointments).filter(x=>x?.id&&x?.date&&x?.time&&localStart(x).getTime()>Date.now()-24*60*60*1000&&x.status!=='Realizada')){
    try{const eventId=await eventIdFor(a.id),event=await getEvent(auth,eventId);if(event&&await applyRemoteConfirmation(a,event))changed+=1}catch{}
  }
  return changed;
}

function updateStatus(state,error=''){lastState=state;lastError=error;document.dispatchEvent(new CustomEvent('rm:whatsapp-clinical-status',{detail:{state,error,version:VERSION}}));paintStatus()}
function paintStatus(){
  if(runtime.locked)return;
  const top=document.querySelector('.top-actions');if(!top)return;
  let chip=document.getElementById('rm-whatsapp-clinical-status');if(!chip){chip=document.createElement('button');chip.id='rm-whatsapp-clinical-status';chip.type='button';chip.dataset.route='settings';top.insertBefore(chip,document.getElementById('clock-chip')||top.firstChild)}
  const futureList=arr(data.appointments).filter(eligible),errors=futureList.filter(a=>a.whatsappReminderState==='ERROR').length,queued=futureList.filter(a=>['QUEUED','REGISTERED'].includes(a.whatsappReminderState)).length;
  const ok=lastState==='connected'&&!errors;chip.className=`rm-status-chip ${ok?'ok':errors||lastState==='error'?'error':'warn'}`;chip.textContent=ok?'WhatsApp ✓':errors||lastState==='error'?'WhatsApp !':'WhatsApp •';chip.title=ok?`${queued} confirmação(ões) futura(s) ligadas ao Core`:lastError||'Integração de confirmação WhatsApp';
}

async function cycle({force=false}={}){
  if(runtime.locked||!runtime.dataReady||!runtime.key||!navigator.onLine)return;
  if(!force&&Date.now()-lastCycleAt<15_000)return;lastCycleAt=Date.now();
  const auth=await loadWorkspaceAuthorization([CALENDAR_SCOPE]);if(!auth.ok){updateStatus('waiting-google','Conecte ou renove o Google Workspace.');return}
  updateStatus('syncing');
  try{
    await reconcileRemote(auth);
    const list=arr(data.appointments).filter(eligible).sort((a,b)=>localStart(a)-localStart(b));
    for(const a of list)await registerReminder(a,auth);
    updateStatus('connected');
  }catch(err){updateStatus('error',String(err?.message||err).slice(0,180))}
}
function schedule(force=false,delay=1200){clearTimeout(cycleTimer);cycleTimer=setTimeout(()=>void cycle({force}),delay)}
function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(()=>void cycle({force:true}),POLL_MS)}

async function manualWhatsApp(id){
  const a=appointmentById(id),p=patientById(a?.patientId);if(!a||!p?.phone)throw new Error('Paciente ou telefone não localizado.');
  const auth=await loadWorkspaceAuthorization([CALENDAR_SCOPE]);if(auth.ok&&eligible(a))await registerReminder(a,auth,{manual:true});
  openWhatsApp(p.phone,`Olá, ${firstName(p)}. Passando para lembrar nosso atendimento em ${fmtDate(a.date)}, às ${a.time}. Caso precise ajustar o horário, me avise por aqui.`);
}

document.addEventListener('click',e=>{const el=e.target.closest?.('[data-action]');if(!el||!['appointment-whatsapp','appointment-reminder-v240'].includes(el.dataset.action))return;e.preventDefault();e.stopImmediatePropagation();void manualWhatsApp(el.dataset.id).catch(err=>toast(err?.message||'Não foi possível abrir o WhatsApp.','error'))},true);
document.addEventListener('rm:data-ready',()=>{schedule(true,1800);startPolling()});
document.addEventListener('rm:google-workspace-authorized',()=>schedule(true,1800));
document.addEventListener('rm:rendered',()=>paintStatus());
document.addEventListener('rm:local-data-changed',e=>{if(e.detail?.storeName==='appointments')schedule(false,2200)});
window.addEventListener('online',()=>schedule(true,800));
window.addEventListener('focus',()=>schedule(true,700));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(true,700)});

globalThis.__rmClinicalWhatsAppBridge={version:VERSION,core:CORE_URL,cycle:()=>cycle({force:true})};
