import {data,runtime} from './state.js';

const MEET_TOKEN_STORAGE='rm.google.meet.drive.token.v1';
const CALENDAR_TOKEN_STORAGE='rm.google.calendar.token.v1';
const STATE_ID='meet_name_sync_state_v188';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
function meetState(){return arr(data.settings).find(x=>x?.id===STATE_ID)||null}
function statusInfo(){
  const token=Boolean(localStorage.getItem(MEET_TOKEN_STORAGE)||localStorage.getItem(CALENDAR_TOKEN_STORAGE));
  const s=meetState();
  if(s?.status==='OK'&&token)return{cls:'ok',label:'Meet ✓',title:`Google Meet/Gemini conectado. ${Number(s.smartNotesFound||0)} anotação(ões) localizada(s).`};
  if(s?.status==='Erro')return{cls:'error',label:'Meet !',title:`Falha na leitura do Google Meet/Gemini${s.error?`: ${s.error}`:''}`};
  if(token)return{cls:'warn',label:'Meet ↻',title:'Google Workspace autorizado. Aguardando conferência do Meet/Gemini.'};
  return{cls:'error',label:'Meet !',title:'Google Meet/Gemini ainda não autorizado neste dispositivo.'};
}
function paint(){
  if(runtime.locked)return;
  const box=document.getElementById('rm-mobile-status');if(!box)return;
  let chip=document.getElementById('rm-meet-status-chip');
  if(!chip){chip=document.createElement('button');chip.type='button';chip.id='rm-meet-status-chip';chip.className='rm-status-chip';chip.dataset.route='settings';box.appendChild(chip)}
  const st=statusInfo();chip.className=`rm-status-chip ${st.cls}`;chip.textContent=st.label;chip.title=st.title;chip.setAttribute('aria-label',st.title);
}

document.addEventListener('rm:rendered',()=>setTimeout(paint,0));
document.addEventListener('rm:data-ready',()=>setTimeout(paint,80));
document.addEventListener('rm:local-data-changed',()=>setTimeout(paint,0));
window.addEventListener('rm:workspace-token-bridged',()=>setTimeout(paint,0));
window.addEventListener('storage',e=>{if([MEET_TOKEN_STORAGE,CALENDAR_TOKEN_STORAGE].includes(e.key))paint()});
setInterval(()=>{if(!runtime.locked)paint()},15000);
setTimeout(paint,500);
