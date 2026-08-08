import {data,runtime,preferences,selectedPatient,nowISO} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {bulkPutEncrypted} from './database.js';
import {toast,esc,modal,closeModal} from './ui.js';

const VERSION='2.2.0';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const INBOX_STORAGE='rm.google.clinical.inbox.v210';
const INBOX_AAD='google-clinical-inbox-v210';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const BACKFILL_DATE='2026-06-01';
const BACKFILL_ISO='2026-06-01T03:00:00Z';
const POLL_MS=5*60*1000;
const MAX_MATCH_DELTA_MINUTES=90;
const STABLE_STATUSES=new Set(['imported','ready','quarantine','review','ignored']);

let accessToken='';
let expiresAt=0;
let tokenScope='';
let inbox={version:4,lastScanAt:'',lastError:'',filesSeen:0,items:[]};
let scanning=false;
let pollTimer=null;
let syncState='unknown';
let lastStatus='unknown';
let lastAutoScanAt=0;

const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const tokenValid=()=>Boolean(accessToken&&expiresAt>Date.now()+60000);
const driveGranted=()=>tokenScope.split(/\s+/).includes(DRIVE_SCOPE);
const itemByFileId=id=>arr(inbox.items).find(x=>x?.fileId===id)||null;
const recordByFileId=id=>arr(data.records).find(r=>r?.source?.fileId===id||r?.id===`gmrec_${id}`)||null;
const appointmentByFileId=id=>arr(data.appointments).find(a=>a?.source?.fileId===id||a?.gemini?.fileId===id||a?.id===`gmappt_${id}`)||null;
const patientById=id=>arr(data.patients).find(p=>p?.id===id)||null;

function emitStatus(status,detail=''){
  lastStatus=status;
  document.dispatchEvent(new CustomEvent('rm:gemini-status',{detail:{status,detail,lastScanAt:inbox.lastScanAt,lastError:inbox.lastError}}));
}
function safeDate(value){const d=new Date(value||'');return Number.isNaN(d.getTime())?null:d}
function meetingInfo(file){
  const title=String(file?.name||'');let m=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);
  if(m)return{date:`${m[1]}-${m[2]}-${m[3]}`,time:`${m[4]}:${m[5]}`};
  m=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);
  if(m)return{date:`${m[3]}-${m[2]}-${m[1]}`,time:`${m[4]}:${m[5]}`};
  const d=safeDate(file?.createdTime);if(!d)return null;
  return{date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`};
}
function mergeData(store,values){const list=data[store]||(data[store]=[]);for(const value of values){const i=list.findIndex(x=>x?.id===value.id);if(i>=0)list[i]=value;else list.push(value)}}

async function loadWorkspaceToken(){
  accessToken='';expiresAt=0;tokenScope='';if(!runtime.key)return false;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}if(!raw)return false;
  try{const value=await decryptJson(runtime.key,raw,'google-calendar-token');if(value?.token&&Number(value.expiresAt)>Date.now()+60000){accessToken=value.token;expiresAt=Number(value.expiresAt);tokenScope=String(value.scope||'');return true}}catch{}
  return false;
}
async function loadInbox(){
  inbox={version:4,lastScanAt:'',lastError:'',filesSeen:0,items:[]};if(!runtime.key)return inbox;
  let raw=null;try{raw=JSON.parse(localStorage.getItem(INBOX_STORAGE)||'null')}catch{}if(!raw)return inbox;
  try{const value=await decryptJson(runtime.key,raw,INBOX_AAD);if(value&&Array.isArray(value.items))inbox={version:4,lastScanAt:value.lastScanAt||'',lastError:value.lastError||'',filesSeen:Number(value.filesSeen||0),items:value.items.slice(-500)}}catch{}
  return inbox;
}
async function saveInbox(){if(!runtime.key)return;inbox.version=4;inbox.items=arr(inbox.items).slice(-500);const encrypted=await encryptJson(runtime.key,inbox,INBOX_AAD);localStorage.setItem(INBOX_STORAGE,JSON.stringify(encrypted))}

async function googleFetch(url){
  if(!tokenValid())throw new Error('Google Workspace precisa ser reconectado.');
  const r=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`}});
  if(r.status===401)throw new Error('A autorização do Google Workspace expirou. Renove a conexão.');
  if(r.status===403){
    let message='';let reason='';try{const j=await r.clone().json();message=String(j?.error?.message||'');reason=String(j?.error?.errors?.[0]?.reason||'')}catch{}
    if(/accessnotconfigured|service_disabled|has not been used|disabled/i.test(`${reason} ${message}`))throw new Error('A Google Drive API ainda não está habilitada no projeto OAuth.');
    if(/insufficient.*scope|insufficientpermissions/i.test(`${reason} ${message}`))throw new Error('A conexão atual não possui permissão de leitura do Drive. Renove o Google Workspace.');
    throw new Error(message?`Google Drive recusou a leitura: ${message}`:'O Google Drive recusou a leitura das Anotações do Gemini.');
  }
  return r;
}
async function listGeminiDocs(){
  const out=[];let pageToken='';do{
    const u=new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);
    u.searchParams.set('pageSize','1000');u.searchParams.set('orderBy','createdTime asc');u.searchParams.set('spaces','drive');u.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,mimeType)');if(pageToken)u.searchParams.set('pageToken',pageToken);
    const r=await googleFetch(u.toString());if(!r.ok)throw new Error(`Google Drive respondeu ${r.status}.`);const payload=await r.json();out.push(...arr(payload.files));pageToken=payload.nextPageToken||'';
  }while(pageToken);
  return out.filter(f=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(f?.name||''));
}
async function exportDoc(fileId){const url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`;const r=await googleFetch(url);if(!r.ok)throw new Error(`Não foi possível ler uma anotação do Gemini (${r.status}).`);return r.text()}

function participantLabels(raw=''){
  const found=new Set();
  for(const m of String(raw).matchAll(/^\s*([^\n:]{2,90}):\s+/gm)){const n=normalize(m[1]);if(n&&n.length<=80)found.add(n)}
  for(const m of String(raw).matchAll(/\[([^\]\n]{2,90})\]/g)){const n=normalize(m[1]);if(n&&n.length<=80)found.add(n)}
  return [...found];
}
function aliasesForPatient(p){return [...new Set([p?.name,p?.preferredName].map(normalize).filter(Boolean))]}
function uniqueFirstName(p){const first=normalize(String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]);if(first.length<4)return'';const same=arr(data.patients).filter(x=>normalize(String(x?.preferredName||x?.name||'').trim().split(/\s+/)[0])===first);return same.length===1?first:''}
function appointmentNear(patientId,meeting){
  const candidates=arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===meeting.date&&a?.time);
  const ranked=candidates.map(a=>({appointment:a,delta:Math.abs(new Date(`${a.date}T${a.time}:00`)-new Date(`${meeting.date}T${meeting.time}:00`))/60000})).filter(x=>Number.isFinite(x.delta)&&x.delta<=MAX_MATCH_DELTA_MINUTES).sort((a,b)=>a.delta-b.delta);
  if(!ranked.length)return null;if(ranked.length>1&&ranked[1].delta-ranked[0].delta<10)return null;return ranked[0];
}
function identifyPatient(raw,meeting){
  const labels=participantLabels(raw),ranked=[];
  for(const p of arr(data.patients)){
    let score=0,evidence='';
    for(const alias of aliasesForPatient(p)){if(alias.split(' ').length>=2&&labels.some(l=>l===alias||l.startsWith(alias+' ')||alias.startsWith(l+' '))){score=150;evidence=`nome completo: ${alias}`}}
    const near=appointmentNear(p.id,meeting),first=uniqueFirstName(p);
    if(!score&&first&&labels.some(l=>l===first||l.startsWith(first+' '))){score=near?120:95;evidence=near?`primeiro nome único + sessão ${Math.round(near.delta)} min`:'primeiro nome único sem sessão histórica'}
    if(score>=150&&near)score+=20;
    if(score)ranked.push({patient:p,score,evidence,appointment:near?.appointment||null});
  }
  ranked.sort((a,b)=>b.score-a.score);
  if(!ranked.length)return{patient:null,reason:'Nenhum paciente do cofre foi identificado como participante nas Anotações do Gemini.'};
  if(ranked.length>1&&ranked[0].score-ranked[1].score<20)return{patient:null,reason:'Mais de um paciente pode corresponder ao participante encontrado no Gemini.'};
  if(ranked[0].score<110)return{patient:null,candidate:ranked[0].patient,reason:'Há um candidato nominal, mas falta confirmação suficiente. Revise antes de criar o prontuário.'};
  return ranked[0];
}

function section(raw,labels,endLabels=[]){const lines=String(raw||'').replace(/^\uFEFF/,'').split(/\r?\n/),starts=labels.map(normalize),ends=endLabels.map(normalize),start=lines.findIndex(x=>starts.includes(normalize(x)));if(start<0)return'';let end=lines.length;for(let i=start+1;i<lines.length;i++)if(ends.includes(normalize(lines[i]))){end=i;break}return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim()}
function cleanLine(value=''){return String(value).replace(/\s*\(\d{2}:\d{2}:\d{2}\)(?:\s*\(\d{2}:\d{2}:\d{2}\))*\s*/g,' ').replace(/^[-*•]\s*/,'').replace(/\s+/g,' ').trim()}
function cleanSteps(value=''){return String(value||'').split(/\r?\n/).map(cleanLine).filter(Boolean).map(x=>`• ${x}`).join('\n')}
function escapeRegExp(value=''){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function neutralizeNames(value,patient){let out=String(value||'');for(const name of [patient?.name,patient?.preferredName].filter(Boolean).sort((a,b)=>b.length-a.length))out=out.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`,'gi'),'Paciente');out=out.replace(/\bRichelmy\s+Murta\b/gi,'Profissional');return out}
function summaryFromRaw(raw=''){return section(String(raw).split(/📖\s*Transcri[cç][aã]o/i)[0],['Resumo','Summary'],['Próximas etapas','Proximas etapas','Next steps','Detalhes','Details'])}
function buildClinicalDraft(raw='',patient){
  const source=String(raw).split(/📖\s*Transcri[cç][aã]o/i)[0].trim();
  const summary=neutralizeNames(summaryFromRaw(source),patient);
  const details=section(source,['Detalhes','Details'],['Revise as anotações','Revise as anotacoes']);
  const detailLines=String(details||'').split(/\r?\n/).map(cleanLine).filter(Boolean);
  const procedureRx=/orient|psicoeduc|reestrutur|question|socr[aá]t|registro|exposi[cç]|ativa[cç][aã]o comport|planej|trein|habilidade|relax|respira|mindful|preven[cç][aã]o|discut|trabalh|interven|explor|identific|valida[cç]/i;
  const responseRx=/paciente|relat|referiu|percebeu|reconheceu|identificou|avaliou|decidiu|concordou|demonstrou|apresentou|melhora|dificuldade|redu[cç][aã]o|aumento/i;
  const procedures=detailLines.filter(x=>procedureRx.test(x)).slice(0,8).map(x=>`• ${neutralizeNames(x,patient)}`).join('\n');
  const responses=detailLines.filter(x=>responseRx.test(x)&&!procedureRx.test(x)).slice(0,6).map(x=>`• ${neutralizeNames(x,patient)}`).join('\n');
  const steps=neutralizeNames(cleanSteps(section(source,['Próximas etapas','Proximas etapas','Next steps'],['Detalhes','Details'])),patient);
  const fallback=neutralizeNames(source.replace(/^.*?\n/,'').trim().slice(0,4500),patient);
  const blocks=[
    `Foco clínico e evolução da sessão\n${summary||fallback||'Síntese automática indisponível; revisar o documento-fonte.'}`,
    procedures?`Procedimentos técnico-científicos adotados\n${procedures}`:'',
    responses?`Resposta do paciente e resultados observados\n${responses}`:'',
    steps?`Plano terapêutico, tarefas e encaminhamentos\n${steps}`:''
  ].filter(Boolean);
  return{text:blocks.join('\n\n'),followup:steps.replace(/^•\s*/gm,'').trim(),sourceSummary:summary||fallback||''};
}
function deriveDuration(raw=''){let max=0;for(const m of String(raw).matchAll(/\b(\d{2}):(\d{2}):(\d{2})\b/g)){const s=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);if(Number.isFinite(s))max=Math.max(max,s)}const minutes=Math.ceil(max/60);return minutes>=20&&minutes<=180?minutes:Number(preferences.defaultSessionMinutes||50)}
function upsertInboxItem(item){const i=arr(inbox.items).findIndex(x=>x?.fileId===item.fileId);if(i>=0)inbox.items[i]={...inbox.items[i],...item};else inbox.items.push(item)}
const importedItems=()=>arr(inbox.items).filter(x=>x?.status==='imported');
const readyItems=()=>arr(inbox.items).filter(x=>x?.status==='ready');
const quarantineItems=()=>arr(inbox.items).filter(x=>x?.status==='quarantine');
const reviewItems=()=>arr(inbox.items).filter(x=>x?.status==='review');
const pendingItems=()=>arr(inbox.items).filter(x=>['ready','quarantine','review'].includes(x?.status));

async function scan({quiet=true,force=false}={}){
  if(scanning||runtime.locked||!runtime.key||!runtime.dataReady||globalThis.__rmSyncApplying)return;
  if(syncState!=='synced'){emitStatus('paused',syncState==='conflict'?'Gemini pausado: há conflito em Dados.':'Aguardando Dados ✓.');if(!quiet)toast('A integração do Gemini aguarda Dados ✓.','');return}
  if(!force&&Date.now()-lastAutoScanAt<30000)return;
  await loadWorkspaceToken();if(!tokenValid()){emitStatus('disconnected','Google Workspace não conectado.');return}if(!driveGranted()){emitStatus('error','A conexão precisa incluir leitura do Drive.');return}
  scanning=true;lastAutoScanAt=Date.now();inbox.lastError='';emitStatus('scanning','Conferindo somente arquivos novos ou modificados.');decorate();
  try{
    const files=await listGeminiDocs();inbox.filesSeen=files.length;
    for(const file of files){
      const previous=itemByFileId(file.id),existingRecord=recordByFileId(file.id),existingAppt=appointmentByFileId(file.id);
      if(existingRecord||existingAppt){upsertInboxItem({...previous,fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',patientId:existingRecord?.patientId||existingAppt?.patientId||previous?.patientId||'',recordId:existingRecord?.id||previous?.recordId||'',appointmentId:existingAppt?.id||previous?.appointmentId||'',status:'imported',version:VERSION});continue}
      if(previous&&previous.modifiedTime===file.modifiedTime&&STABLE_STATUSES.has(previous.status))continue;
      const meeting=meetingInfo(file);if(!meeting){upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',status:'quarantine',reason:'Data/hora da reunião não pôde ser determinada.',version:VERSION});continue}
      const raw=await exportDoc(file.id),match=identifyPatient(raw,meeting);
      if(!match.patient){const candidate=match.candidate;upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||'',modifiedTime:file.modifiedTime||'',patientId:candidate?.id||'',meetingDate:meeting.date,meetingTime:meeting.time,status:'quarantine',reason:match.reason,sourceSummary:neutralizeNames(summaryFromRaw(raw),candidate),version:VERSION});continue}
      const draft=buildClinicalDraft(raw,match.patient);
      upsertInboxItem({fileId:file.id,name:file.name,url:file.webViewLink||`https://docs.google.com/document/d/${file.id}`,modifiedTime:file.modifiedTime||'',patientId:match.patient.id,meetingDate:meeting.date,meetingTime:meeting.time,status:'ready',reason:'Associação nominal segura. Aguardando revisão/criação do prontuário.',matchEvidence:match.evidence||'',draftText:draft.text,followup:draft.followup,sourceSummary:draft.sourceSummary,version:VERSION});
    }
    inbox.lastScanAt=nowISO();inbox.lastError='';await saveInbox();
  }catch(err){inbox.lastError=String(err?.message||err);await saveInbox().catch(()=>{});scanning=false;emitStatus('error',inbox.lastError);decorate();if(!quiet)toast(inbox.lastError,'error');return}
  scanning=false;emitStatus('connected',`${inbox.filesSeen} arquivo(s) catalogado(s); ${pendingItems().length} pendência(s).`);decorate();decoratePatientInbox();if(!quiet)toast(`Gemini conferido. ${readyItems().length} pronto(s) para prontuário e ${quarantineItems().length} em revisão manual.`,'success');
}

function patientName(id){const p=patientById(id);return p?.preferredName||p?.name||''}
function queueRows(limit=6){return pendingItems().sort((a,b)=>`${b.meetingDate||''} ${b.meetingTime||''}`.localeCompare(`${a.meetingDate||''} ${a.meetingTime||''}`)).slice(0,limit).map(item=>`<div class="gemini-queue-row"><div class="gemini-queue-main"><strong>${esc(item.meetingDate?item.meetingDate.split('-').reverse().join('/'):'Data não definida')} ${esc(item.meetingTime||'')}</strong><div class="small">${item.patientId?esc(patientName(item.patientId)||'Paciente sugerido'):'Paciente não confirmado'}</div><div class="tiny muted">${esc(item.reason||'Aguardando revisão.')}</div></div><div class="gemini-queue-actions"><button class="btn ghost" data-action="gemini-review-item" data-id="${esc(item.fileId)}">Revisar</button>${item.patientId?`<button class="btn" data-action="gemini-create-record" data-id="${esc(item.fileId)}">Criar prontuário</button>`:''}</div></div>`).join('')}
function settingsMarkup(){
  const connected=tokenValid()&&driveGranted(),last=inbox.lastScanAt?new Date(inbox.lastScanAt).toLocaleString('pt-BR'):'Ainda não executado',waiting=syncState!=='synced';
  return`<section id="rm-gemini-clinical" class="card mt-16" ${scanning?'aria-busy="true"':''}><div class="card-title"><div><div class="eyebrow">Integração clínica automática</div><h3 class="mb-0">Google Meet · Gemini</h3></div><span class="badge">${waiting?'Pausado':scanning?'Conferindo':connected?'Conectado':'Reconectar'}</span></div><p class="muted">Novos resumos são recebidos em um <strong>inbox local cifrado</strong>, associados pelo nome do participante e exibidos no prontuário do paciente. A varredura <strong>não altera o cofre sincronizado</strong>; a gravação ocorre somente ao usar <strong>Criar prontuário</strong> ou ao revisar um registro já existente.</p><div class="gemini-metrics"><span><strong>${importedItems().length}</strong> prontuários</span><span><strong>${readyItems().length}</strong> prontos</span><span><strong>${quarantineItems().length+reviewItems().length}</strong> revisar</span><span><strong>${Number(inbox.filesSeen||0)}</strong> arquivos</span></div><div class="small muted mt-12">Backfill desde ${BACKFILL_DATE.split('-').reverse().join('/')} · Última conferência: ${esc(last)}.</div>${waiting?`<div class="notice warning mt-12"><strong>Proteção:</strong> Gemini pausado até a sincronização ficar em Dados ✓. Nenhuma pendência será reprocessada durante conflito.</div>`:''}<div class="flex gap-8 wrap mt-16"><button class="btn" data-action="gemini-scan-now" ${connected&&!waiting?'':'disabled'}>Conferir novos resumos</button><button class="btn secondary" data-action="gemini-review-queue" ${pendingItems().length?'':'disabled'}>Revisar pendências</button><button class="btn secondary" data-action="workspace-connect">${connected?'Renovar Google Workspace':'Conectar Google Workspace'}</button></div>${pendingItems().length?`<div class="gemini-queue mt-16"><h4>Pendências Gemini</h4>${queueRows(6)}${pendingItems().length>6?`<button class="btn ghost mt-8" data-action="gemini-review-queue">Ver todas (${pendingItems().length})</button>`:''}</div>`:''}<div class="notice mt-12"><strong>Prontuário:</strong> o rascunho é sintético, orientado por TCC e estruturado para registrar evolução, procedimentos e encaminhamentos. Nenhum diagnóstico, técnica ou resultado é inferido quando não consta no resumo-fonte.</div></section>`;
}
function decorate(){if(runtime.locked||runtime.route!=='settings')return;const main=document.getElementById('main-content');if(!main)return;const old=document.getElementById('rm-gemini-clinical'),wrap=document.createElement('div');wrap.innerHTML=settingsMarkup();if(old)old.replaceWith(wrap.firstElementChild);else main.appendChild(wrap.firstElementChild)}

function patientOptions(selected=''){return arr(data.patients).filter(p=>p?.status!=='Arquivado').sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR')).map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name||p.preferredName||'Paciente')}</option>`).join('')}
function reviewModal(item){
  if(!item)return;const draft=item.draftText||item.sourceSummary||'O conteúdo resumido será carregado ao confirmar a associação.';
  modal('Revisar resumo do Gemini',`<div class="notice"><strong>${esc(item.meetingDate?item.meetingDate.split('-').reverse().join('/'):'Data não definida')} ${esc(item.meetingTime||'')}</strong><br>${esc(item.reason||'')}</div><div class="field mt-16"><label>Paciente</label><select id="gemini-review-patient" class="input"><option value="">Selecione…</option>${patientOptions(item.patientId||'')}</select></div><div class="field mt-12"><label>Rascunho / síntese do Gemini</label><textarea class="textarea" readonly style="min-height:280px">${esc(draft)}</textarea></div><p class="small muted mt-12">A transcrição integral não é copiada para o prontuário. Revise o rascunho antes de finalizar o registro clínico.</p>`,`<button class="btn ghost" data-action="gemini-open-source" data-id="${esc(item.fileId)}">Abrir original</button><button class="btn secondary" data-action="gemini-save-association" data-id="${esc(item.fileId)}">Salvar associação</button><button class="btn" data-action="gemini-create-record" data-id="${esc(item.fileId)}" data-from-modal="1">Criar prontuário</button>`,true);
}
function queueModal(){const items=pendingItems().sort((a,b)=>`${b.meetingDate||''} ${b.meetingTime||''}`.localeCompare(`${a.meetingDate||''} ${a.meetingTime||''}`));modal('Pendências do Google Meet · Gemini',items.length?`<div class="gemini-queue">${items.map(item=>`<div class="gemini-queue-row"><div class="gemini-queue-main"><strong>${esc(item.meetingDate?item.meetingDate.split('-').reverse().join('/'):'—')} ${esc(item.meetingTime||'')}</strong><div class="small">${item.patientId?esc(patientName(item.patientId)||'Paciente sugerido'):'Paciente não confirmado'}</div><div class="tiny muted">${esc(item.reason||'')}</div></div><div class="gemini-queue-actions"><button class="btn ghost" data-action="gemini-review-item" data-id="${esc(item.fileId)}">Revisar</button>${item.patientId?`<button class="btn" data-action="gemini-create-record" data-id="${esc(item.fileId)}">Criar prontuário</button>`:''}</div></div>`).join('')}</div>`:'<div class="notice success">Não há pendências do Gemini.</div>',`<button class="btn" data-action="close-modal">Fechar</button>`,true)}

async function prepareItemForPatient(item,patientId){
  if(!item||!patientId)throw new Error('Selecione o paciente.');const patient=patientById(patientId);if(!patient)throw new Error('Paciente não localizado no cofre.');await loadWorkspaceToken();if(!tokenValid()||!driveGranted())throw new Error('Renove o Google Workspace para ler o resumo.');const raw=await exportDoc(item.fileId),draft=buildClinicalDraft(raw,patient);item.patientId=patient.id;item.status='ready';item.reason='Associação confirmada manualmente. Pronto para criação do prontuário.';item.draftText=draft.text;item.followup=draft.followup;item.sourceSummary=draft.sourceSummary;item.updatedAt=nowISO();await saveInbox();return{item,patient,raw,draft};
}
async function createClinicalRecord(item,patientId=''){
  if(syncState!=='synced')throw new Error('Resolva primeiro a sincronização de Dados. O prontuário não será alterado durante conflito.');
  const patient=patientById(patientId||item?.patientId);if(!item||!patient)throw new Error('Selecione o paciente antes de criar o prontuário.');
  const existingRecord=recordByFileId(item.fileId);if(existingRecord){item.status='imported';item.recordId=existingRecord.id;await saveInbox();toast('Este resumo já possui prontuário.','');return existingRecord}
  await loadWorkspaceToken();if(!tokenValid()||!driveGranted())throw new Error('Renove o Google Workspace para ler o resumo.');
  const raw=await exportDoc(item.fileId),meeting={date:item.meetingDate,time:item.meetingTime};if(!meeting.date||!meeting.time)throw new Error('Data e horário do Meet não estão disponíveis.');const draft=buildClinicalDraft(raw,patient);
  let appointment=appointmentNear(patient.id,meeting)?.appointment||appointmentByFileId(item.fileId);const now=nowISO();
  if(appointment&&(appointment.status==='Cancelada'||appointment.attendanceStatus==='Desmarcou'))throw new Error('Existe sessão cancelada/desmarcada neste horário. Revise a agenda antes de criar o prontuário.');
  if(appointment){appointment={...appointment,status:'Realizada',attendanceStatus:'Presente',updatedAt:now,gemini:{fileId:item.fileId,url:item.url||'',meetingDate:meeting.date,meetingTime:meeting.time}}}
  else appointment={id:`gmappt_${item.fileId}`,patientId:patient.id,date:meeting.date,time:meeting.time,duration:deriveDuration(raw),status:'Realizada',attendanceStatus:'Presente',modality:'On-line',recurrence:'Avulso',note:'Sessão confirmada a partir das Anotações do Google Meet/Gemini.',createdAt:now,updatedAt:now,source:{type:'google-meet-gemini',fileId:item.fileId,url:item.url||''}};
  const sameSession=arr(data.records).find(r=>r?.patientId===patient.id&&r?.appointmentId===appointment.id&&!r?.source?.fileId);if(sameSession)throw new Error('Já existe um registro clínico manual ligado a esta sessão. Abra o prontuário e revise antes de criar outro.');
  const record={id:`gmrec_${item.fileId}`,patientId:patient.id,appointmentId:appointment.id,title:'Evolução de sessão',date:meeting.date,status:'Rascunho IA',text:draft.text,followup:draft.followup,requiresReview:true,createdAt:now,updatedAt:now,addenda:[],source:{type:'google-meet-gemini',fileId:item.fileId,url:item.url||'',title:item.name||'',modifiedTime:item.modifiedTime||'',version:VERSION,clinicalTemplate:'CFP-001-2009-TCC-v1'}};
  const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;try{await bulkPutEncrypted('appointments',[appointment],runtime.key);await bulkPutEncrypted('records',[record],runtime.key)}finally{globalThis.__rmSyncApplying=previous}
  mergeData('appointments',[appointment]);mergeData('records',[record]);item.status='imported';item.patientId=patient.id;item.appointmentId=appointment.id;item.recordId=record.id;item.reason='Prontuário criado; aguardando revisão profissional.';item.draftText=draft.text;item.followup=draft.followup;await saveInbox();document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',id:record.id,kind:'gemini-approved',at:now,source:'gemini-manual-create'}}));document.dispatchEvent(new CustomEvent('rm:gemini-record-created',{detail:{recordId:record.id,patientId:patient.id}}));window.__rmRender?.();toast('Rascunho de prontuário criado. Revise e finalize.','success');return record;
}

function decoratePatientInbox(){
  if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='records')return;const patient=selectedPatient();if(!patient)return;const items=readyItems().filter(x=>x.patientId===patient.id);const main=document.getElementById('main-content');if(!main)return;let panel=document.getElementById('rm-gemini-patient-inbox');if(!items.length){panel?.remove();return}if(!panel){panel=document.createElement('section');panel.id='rm-gemini-patient-inbox';panel.className='card mb-16';const grid=main.querySelector('.grid');if(grid)grid.insertAdjacentElement('beforebegin',panel);else main.prepend(panel)}panel.innerHTML=`<div class="card-title"><div><div class="eyebrow">Google Meet · Gemini</div><h3 class="mb-0">${items.length} resumo(s) aguardando prontuário</h3></div><span class="badge warning">Revisar</span></div><p class="small muted">O resumo já foi associado a este paciente, mas ainda não alterou o cofre clínico.</p><div class="gemini-queue">${items.map(item=>`<div class="gemini-queue-row"><div><strong>${esc(item.meetingDate?.split('-').reverse().join('/')||'—')} ${esc(item.meetingTime||'')}</strong><div class="tiny muted">Rascunho clínico TCC disponível.</div></div><div class="gemini-queue-actions"><button class="btn ghost" data-action="gemini-review-item" data-id="${esc(item.fileId)}">Revisar</button><button class="btn" data-action="gemini-create-record" data-id="${esc(item.fileId)}">Criar prontuário</button></div></div>`).join('')}</div>`}

async function activate(){await Promise.all([loadInbox(),loadWorkspaceToken()]);if(tokenValid()&&driveGranted()){emitStatus(syncState==='synced'?'connected':'paused',syncState==='synced'?'Google Workspace conectado.':'Aguardando Dados ✓.')}else emitStatus('disconnected','Google Workspace precisa ser conectado.');decorate();decoratePatientInbox();clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine&&syncState==='synced'&&Date.now()-lastAutoScanAt>=POLL_MS)void scan({quiet:true})},POLL_MS)}

document.addEventListener('click',async e=>{
  const el=e.target.closest?.('[data-action]');if(!el)return;const action=el.dataset.action;
  if(!['gemini-scan-now','gemini-review-queue','gemini-review-item','gemini-open-source','gemini-save-association','gemini-create-record'].includes(action))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
    if(action==='gemini-scan-now'){await scan({quiet:false,force:true});return}
    if(action==='gemini-review-queue'){queueModal();return}
    const item=itemByFileId(el.dataset.id);if(!item)return toast('Resumo do Gemini não localizado.','error');
    if(action==='gemini-review-item'){reviewModal(item);return}
    if(action==='gemini-open-source'){if(item.url)window.open(item.url,'_blank','noopener,noreferrer');return}
    if(action==='gemini-save-association'){const patientId=document.getElementById('gemini-review-patient')?.value||item.patientId;await prepareItemForPatient(item,patientId);closeModal();decorate();decoratePatientInbox();toast('Associação salva. O resumo está pronto para criação do prontuário.','success');return}
    if(action==='gemini-create-record'){const patientId=el.dataset.fromModal==='1'?(document.getElementById('gemini-review-patient')?.value||item.patientId):item.patientId;await createClinicalRecord(item,patientId);closeModal();decorate();decoratePatientInbox();return}
  }catch(err){toast(err.message||'Não foi possível concluir a ação do Gemini.','error')}
},true);

document.addEventListener('rm:data-ready',()=>void activate());
document.addEventListener('rm:rendered',()=>{decorate();decoratePatientInbox()});
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void activate(),100));
document.addEventListener('rm:sync-status',e=>{const previous=syncState;syncState=e.detail?.status||syncState;if(syncState==='conflict'){emitStatus('paused','Gemini pausado enquanto Dados estiver em conflito.');decorate()}else if(syncState==='synced'&&previous!=='synced'){emitStatus('connected','Dados sincronizados.');setTimeout(()=>void scan({quiet:true}),350)}else if(syncState!=='synced')emitStatus('paused','Aguardando Dados ✓.');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine&&syncState==='synced'&&Date.now()-lastAutoScanAt>=POLL_MS)void scan({quiet:true})});
window.addEventListener('online',()=>{if(syncState==='synced'&&Date.now()-lastAutoScanAt>=POLL_MS)void scan({quiet:true})});
