import {data,runtime,selectedPatient} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {toast,esc} from './ui.js';

const VERSION='2.0.0';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const INBOX_STORAGE='rm.google.clinical.inbox.v200';
const INBOX_AAD='google-clinical-inbox-v200';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const BACKFILL_DATE='2026-06-01';
const BACKFILL_ISO='2026-06-01T03:00:00Z';
const POLL_MS=5*60*1000;
const AUTO_PREFILL_STORAGE='rm.google.clinical.autoprefill.v200';

let accessToken='';
let expiresAt=0;
let tokenScope='';
let inbox={version:2,lastScanAt:'',items:[]};
let scanning=false;
let pollTimer=null;
let activeDraftId='';

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const localDate=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const localTime=d=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
const tokenValid=()=>Boolean(accessToken&&expiresAt>Date.now()+60000);
const driveGranted=()=>tokenScope.split(/\s+/).includes(DRIVE_SCOPE);
const itemByFileId=id=>arr(inbox.items).find(x=>x?.fileId===id)||null;

async function loadWorkspaceToken(){
  accessToken='';expiresAt=0;tokenScope='';
  if(!runtime.key)return false;
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}
  if(!raw)return false;
  try{
    const value=await decryptJson(runtime.key,raw,'google-calendar-token');
    if(value?.token&&Number(value.expiresAt)>Date.now()+60000){
      accessToken=value.token;
      expiresAt=Number(value.expiresAt);
      tokenScope=String(value.scope||'');
      return true;
    }
  }catch{}
  return false;
}
async function loadInbox(){
  inbox={version:2,lastScanAt:'',items:[]};
  if(!runtime.key)return inbox;
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(INBOX_STORAGE)||'null')}catch{}
  if(!raw)return inbox;
  try{
    const value=await decryptJson(runtime.key,raw,INBOX_AAD);
    if(value&&Array.isArray(value.items))inbox={version:2,lastScanAt:value.lastScanAt||'',items:value.items.slice(-250)};
  }catch{}
  return inbox;
}
async function saveInbox(){
  if(!runtime.key)return;
  inbox.version=2;
  inbox.items=arr(inbox.items).slice(-250);
  const encrypted=await encryptJson(runtime.key,inbox,INBOX_AAD);
  localStorage.setItem(INBOX_STORAGE,JSON.stringify(encrypted));
  document.dispatchEvent(new CustomEvent('rm:gemini-inbox-updated',{detail:{pending:pendingItems().length,quarantine:quarantineItems().length}}));
}

async function googleFetch(url){
  if(!tokenValid())throw new Error('Google Workspace precisa ser reconectado.');
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
  if(r.status===401||r.status===403)throw new Error('A autorização do Google Workspace expirou ou ainda não possui leitura do Drive. Renove a conexão.');
  return r;
}
async function listGeminiDocs(){
  const out=[];let pageToken='';
  do{
    const u=new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);
    u.searchParams.set('pageSize','1000');
    u.searchParams.set('orderBy','createdTime asc');
    u.searchParams.set('spaces','drive');
    u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,mimeType)');
    if(pageToken)u.searchParams.set('pageToken',pageToken);
    const r=await googleFetch(u.toString());
    if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);
    const payload=await r.json();
    out.push(...arr(payload.files));
    pageToken=payload.nextPageToken||'';
  }while(pageToken);
  return out.filter(f=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(f?.name||''));
}
async function exportDoc(fileId){
  const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  const r=await googleFetch(url);
  if(!r.ok)throw new Error(`Não foi possível ler uma anotação do Gemini (${r.status}).`);
  return r.text();
}

function meetingStart(file){
  const title=String(file?.name||'');
  let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);
  if(m){const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]));if(!Number.isNaN(d.getTime()))return d}
  m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);
  if(m){const d=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]));if(!Number.isNaN(d.getTime()))return d}
  const created=new Date(file?.createdTime||'');
  return Number.isNaN(created.getTime())?null:created;
}
function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){
    const n=normalize(m[1]);if(n&&n.length<=80)found.add(n);
  }
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){
    const n=normalize(m[1]);if(n&&n.length<=80)found.add(n);
  }
  return [...found];
}
function aliasesForPatient(p){
  const result=[];
  for(const value of [p?.name,p?.preferredName]){
    const n=normalize(value);if(n&&!result.includes(n))result.push(n);
  }
  return result;
}
function uniqueFirstName(p){
  const first=normalize(String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]);
  if(first.length<4)return'';
  const same=arr(data.patients).filter(x=>normalize(String(x?.preferredName||x?.name||'').trim().split(/\s+/)[0])===first);
  return same.length===1?first:'';
}
function appointmentFor(patientId,start){
  if(!patientId||!start)return null;
  const date=localDate(start);
  const candidates=arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===date&&a?.time&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou');
  const ranked=candidates.map(a=>{
    const d=new Date(`${a.date}T${a.time}:00`);
    return{appointment:a,delta:Math.abs(d-start)/60000};
  }).filter(x=>Number.isFinite(x.delta)&&x.delta<=240).sort((a,b)=>a.delta-b.delta);
  if(!ranked.length)return null;
  if(ranked.length>1&&ranked[1].delta-ranked[0].delta<10)return null;
  return ranked[0];
}
function identifyPatient(raw,start){
  const text=normalize(raw),labels=participantLabels(raw),ranked=[];
  for(const p of arr(data.patients)){
    let score=0,evidence='';
    for(const alias of aliasesForPatient(p)){
      const words=alias.split(' ').filter(Boolean);
      if(words.length>=2&&labels.some(l=>l===alias||l.startsWith(alias+' ')||alias.startsWith(l+' '))){score=Math.max(score,140);evidence=`participante:${alias}`}
      else if(words.length>=2&&text.includes(alias)){score=Math.max(score,105);evidence=`texto:${alias}`}
    }
    const first=uniqueFirstName(p);
    if(first&&labels.some(l=>l===first||l.startsWith(first+' '))&&score<90){score=90;evidence=`participante:${first}`}
    const appt=appointmentFor(p.id,start);
    if(appt&&score){score+=Math.max(10,45-Math.min(35,appt.delta/5));evidence+=`|sessao:${Math.round(appt.delta)}min`}
    if(score)ranked.push({patient:p,score,evidence,appointment:appt?.appointment||null,delta:appt?.delta??null});
  }
  ranked.sort((a,b)=>b.score-a.score);
  if(!ranked.length)return{patient:null,reason:'Nenhum paciente do cofre foi identificado nominalmente nas Anotações/Transcrição do Gemini.'};
  if(ranked[0].score<90)return{patient:null,reason:'O nome encontrado no Gemini não atingiu confiança suficiente para associação automática.'};
  if(ranked.length>1&&ranked[0].score-ranked[1].score<18)return{patient:null,reason:'Mais de um paciente pode corresponder ao nome encontrado no Gemini.'};
  return ranked[0];
}
function section(raw,labels,endLabels=[]){
  const lines=String(raw||'').replace(/^\uFEFF/,'').split(/\r?\n/);
  const normLabels=labels.map(normalize),normEnds=endLabels.map(normalize);
  const start=lines.findIndex(x=>normLabels.includes(normalize(x)));
  if(start<0)return'';
  let end=lines.length;
  for(let i=start+1;i<lines.length;i++)if(normEnds.includes(normalize(lines[i]))){end=i;break}
  return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function cleanSteps(value=''){
  return String(value||'').split(/\r?\n/).map(x=>x.replace(/^\*\s*/,'').replace(/^[-•]\s*/,'').replace(/^\[[^\]]+\]\s*/,'').trim()).filter(Boolean).map(x=>`• ${x}`).join('\n');
}
function buildClinicalDraft(raw=''){
  const source=String(raw).split(/📖\s*Transcri[cç][aã]o/i)[0].trim();
  const summary=section(source,['Resumo','Summary'],['Próximas etapas','Proximas etapas','Next steps','Detalhes','Details']);
  const steps=cleanSteps(section(source,['Próximas etapas','Proximas etapas','Next steps'],['Detalhes','Details']));
  const fallback=source.replace(/^.*?\n/,'').trim().slice(0,6000);
  const body=summary||fallback||'O Gemini não apresentou uma síntese estruturada desta sessão.';
  const text=[
    'Foco e evolução da sessão',
    body,
    steps?'Orientações, tarefas ou encaminhamentos\n'+steps:'',
  ].filter(Boolean).join('\n\n');
  return{text,followup:steps.replace(/^•\s*/gm,'').trim()};
}
function upsertInboxItem(item){
  const i=arr(inbox.items).findIndex(x=>x?.fileId===item.fileId);
  if(i>=0)inbox.items[i]={...inbox.items[i],...item};else inbox.items.push(item);
}
function pendingItems(){return arr(inbox.items).filter(x=>x?.status==='pending')}
function quarantineItems(){return arr(inbox.items).filter(x=>x?.status==='quarantine')}
function importedItems(){return arr(inbox.items).filter(x=>x?.status==='imported')}

async function scan({quiet=true}={}){
  if(scanning||runtime.locked||!runtime.key||!runtime.dataReady)return;
  await loadWorkspaceToken();
  if(!tokenValid()||!driveGranted()){decorate();return}
  scanning=true;decorate(true);
  try{
    const files=await listGeminiDocs();
    for(const file of files){
      const previous=itemByFileId(file.id);
      if(previous?.status==='imported'&&previous?.modifiedTime===file.modifiedTime)continue;
      if(previous?.status==='pending'&&previous?.modifiedTime===file.modifiedTime)continue;
      const start=meetingStart(file);
      if(!start){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',status:'quarantine',reason:'Data/hora da reunião não pôde ser determinada.'});continue}
      const raw=await exportDoc(file.id);
      const match=identifyPatient(raw,start);
      if(!match.patient){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',createdTime:file.createdTime||'',meetingAt:start.toISOString(),status:'quarantine',reason:match.reason});continue}
      const draft=buildClinicalDraft(raw);
      upsertInboxItem({
        fileId:file.id,
        name:file.name,
        url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,
        modifiedTime:file.modifiedTime||'',
        createdTime:file.createdTime||'',
        meetingAt:start.toISOString(),
        meetingDate:localDate(start),
        meetingTime:localTime(start),
        patientId:match.patient.id,
        appointmentId:match.appointment?.id||'',
        matchEvidence:match.evidence||'',
        matchDeltaMinutes:match.delta==null?null:Math.round(match.delta),
        status:previous?.status==='imported'?'imported':'pending',
        draftText:draft.text,
        followup:draft.followup,
        source:'Google Meet · Gemini',
        version:VERSION
      });
    }
    inbox.lastScanAt=new Date().toISOString();
    await saveInbox();
    decorate();
    if(!quiet)toast(`Gemini conferido: ${pendingItems().length} rascunho(s) disponível(is) e ${quarantineItems().length} item(ns) para revisão.`,'success');
  }catch(err){
    if(!quiet)toast(err?.message||'Não foi possível conferir as Anotações do Gemini.','error');
  }finally{
    scanning=false;decorate();
  }
}

function workspaceStatus(){
  if(!tokenValid())return{label:'Não conectado',tone:'warn',detail:'Conecte o Google Workspace.'};
  if(!driveGranted())return{label:'Ativar Gemini',tone:'warn',detail:'A Agenda está autorizada, mas é necessário renovar a conexão uma vez para liberar leitura do Drive.'};
  return{label:'Pronto',tone:'ok',detail:'Agenda e leitura das Anotações do Gemini autorizadas.'};
}
function settingsMarkup(){
  const s=workspaceStatus(),last=inbox.lastScanAt?new Date(inbox.lastScanAt).toLocaleString('pt-BR'):'Ainda não executado';
  return`<section id="rm-gemini-clinical" class="card mt-16"><div class="card-title"><div><div class="eyebrow">IA clínica</div><h3 class="mb-0">Google Meet · Gemini</h3></div><span class="badge">${esc(s.label)}</span></div><p class="muted">Recebe as Anotações do Gemini, procura o <strong>nome do paciente no próprio resumo/transcrição</strong>, confirma a sessão pela data e horário e prepara o prontuário para revisão.</p><div class="gemini-metrics"><span><strong>${pendingItems().length}</strong> prontos</span><span><strong>${quarantineItems().length}</strong> revisar</span><span><strong>${importedItems().length}</strong> usados</span></div><div class="small muted mt-8">${esc(s.detail)} Backfill desde ${BACKFILL_DATE.split('-').reverse().join('/')} · Última conferência: ${esc(last)}.</div><div class="flex gap-8 wrap mt-16">${driveGranted()?'<button class="btn" data-action="gemini-scan-now">Conferir Gemini agora</button>':'<button class="btn" data-action="workspace-connect">Ativar Google Workspace</button>'}</div><div class="notice mt-12"><strong>Segurança:</strong> os resumos ficam em um inbox local cifrado. A integração não cria nem altera registros do cofre sincronizado. O prontuário só é gravado quando você salva ou finaliza o registro após revisão.</div></section>`;
}
function decorateGoogleCard(){
  const card=document.getElementById('rm-google-calendar');if(!card)return;
  const title=card.querySelector('.card-title h3');if(title)title.textContent='Google Workspace';
  const eyebrow=card.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='Integrações';
  const p=card.querySelector(':scope > p.muted');if(p)p.textContent='Uma única conexão Google atende a Agenda e, quando autorizado, permite a leitura das Anotações do Gemini.';
  const connect=card.querySelector('[data-action="google-calendar-connect"]');if(connect)connect.textContent='Renovar Google Workspace';
  const reconcile=card.querySelector('[data-action="google-calendar-reconcile"]');if(reconcile)reconcile.textContent='Conferir Agenda';
  if(card.querySelector('.rm-technical-details'))return;
  const field=[...card.querySelectorAll('.field')].find(x=>/Google OAuth Client ID/i.test(x.querySelector('label')?.textContent||''));
  if(!field)return;
  const origin=field.nextElementSibling,notice=origin?.nextElementSibling;
  const details=document.createElement('details');details.className='rm-technical-details';
  const summary=document.createElement('summary');summary.textContent='Configuração técnica do Google';
  const body=document.createElement('div');body.className='rm-technical-details-body';
  details.append(summary,body);
  field.parentNode.insertBefore(details,field);
  body.appendChild(field);
  if(origin&&origin.classList.contains('small'))body.appendChild(origin);
  if(notice&&notice.classList.contains('notice'))body.appendChild(notice);
}
function paintSettings(){
  if(runtime.locked||runtime.route!=='settings')return;
  decorateGoogleCard();
  const main=document.getElementById('main-content');if(!main)return;
  const old=document.getElementById('rm-gemini-clinical'),wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();const fresh=wrap.firstElementChild;
  if(old)old.replaceWith(fresh);else{
    const google=document.getElementById('rm-google-calendar');
    if(google)google.insertAdjacentElement('afterend',fresh);else main.appendChild(fresh);
  }
}
function draftForPatient(patientId){
  return pendingItems().filter(x=>x.patientId===patientId).sort((a,b)=>String(b.meetingAt||'').localeCompare(String(a.meetingAt||'')));
}
function prefill(item,{automatic=false}={}){
  if(!item)return;
  const title=document.getElementById('record-title'),date=document.getElementById('record-date'),text=document.getElementById('record-text'),follow=document.getElementById('record-followup');
  if(!title||!date||!text)return;
  title.value='Evolução de sessão';
  date.value=item.meetingDate||date.value;
  text.value=item.draftText||'';
  if(follow)follow.value=item.followup||'';
  activeDraftId=item.fileId;
  sessionStorage.setItem(AUTO_PREFILL_STORAGE,item.fileId);
  const status=document.getElementById('record-save-status');
  if(status)status.textContent='Rascunho preenchido a partir do Google Meet/Gemini. Revise antes de salvar.';
  if(!automatic)toast('Prontuário preenchido com o rascunho do Gemini. Revise antes de salvar.','success');
}
function decorateRecords(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='records')return;
  const p=selectedPatient();if(!p)return;
  const drafts=draftForPatient(p.id);if(!drafts.length)return;
  const root=document.getElementById('patient-tab-content');if(!root)return;
  let card=document.getElementById('rm-gemini-patient-drafts');
  const list=drafts.map(item=>`<div class="gemini-draft-row"><div><strong>${esc(item.meetingDate||'Sessão')} · ${esc(item.meetingTime||'')}</strong><div class="small muted">${item.appointmentId?'Sessão localizada na agenda':'Sem agendamento correspondente · confirme a data'}</div></div><div class="flex gap-8 wrap"><button class="btn secondary" data-action="gemini-use-draft" data-id="${esc(item.fileId)}">Preencher prontuário</button>${item.url?`<button class="btn ghost" data-action="gemini-open-source" data-url="${esc(item.url)}">Abrir original</button>`:''}</div></div>`).join('');
  const html=`<div class="notice gemini-patient-notice"><strong>Gemini encontrou ${drafts.length} rascunho(s) para este paciente.</strong><div class="small muted mt-4">O conteúdo ainda não integra o prontuário. Revise e salve apenas o que for clinicamente necessário.</div><div class="gemini-draft-list mt-12">${list}</div></div>`;
  if(card)card.innerHTML=html;else{
    card=document.createElement('div');card.id='rm-gemini-patient-drafts';card.innerHTML=html;
    const firstCard=root.querySelector('.grid.grid-2 > .card:first-child')||root.firstElementChild;
    if(firstCard)firstCard.insertAdjacentElement('afterbegin',card);else root.prepend(card);
  }
  const remembered=sessionStorage.getItem(AUTO_PREFILL_STORAGE)||'';
  const recordText=document.getElementById('record-text');
  if(drafts.length===1&&recordText&&!recordText.value.trim()&&remembered!==drafts[0].fileId)prefill(drafts[0],{automatic:true});
}
function decorate(force=false){
  if(runtime.locked)return;
  paintSettings();decorateRecords();
  if(force){const card=document.getElementById('rm-gemini-clinical');if(card)card.setAttribute('aria-busy','true')}
}
async function markImported(fileId){
  const item=itemByFileId(fileId);if(!item)return;
  item.status='imported';item.importedAt=new Date().toISOString();
  await saveInbox();
  activeDraftId='';sessionStorage.removeItem(AUTO_PREFILL_STORAGE);decorate();
}
async function activate(){
  await loadInbox();
  await loadWorkspaceToken();
  decorate();
  if(tokenValid()&&driveGranted())void scan({quiet:true});
  if(pollTimer)clearInterval(pollTimer);
  pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)void scan({quiet:true})},POLL_MS);
}

document.addEventListener('click',e=>{
  const el=e.target.closest?.('[data-action]');if(!el)return;
  const action=el.dataset.action;
  if(!['gemini-scan-now','gemini-use-draft','gemini-open-source'].includes(action))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(action==='gemini-scan-now'){void scan({quiet:false});return}
  if(action==='gemini-use-draft'){prefill(itemByFileId(el.dataset.id));return}
  if(action==='gemini-open-source'&&el.dataset.url)window.open(el.dataset.url,'_blank','noopener,noreferrer');
},true);
document.addEventListener('rm:data-ready',()=>void activate());
document.addEventListener('rm:rendered',()=>decorate());
document.addEventListener('rm:google-workspace-authorized',()=>{void loadWorkspaceToken().then(()=>scan({quiet:true}))});
document.addEventListener('rm:local-data-changed',e=>{
  if(e.detail?.storeName==='records'&&activeDraftId)void markImported(activeDraftId);
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)void scan({quiet:true})});
window.addEventListener('online',()=>void scan({quiet:true}));
