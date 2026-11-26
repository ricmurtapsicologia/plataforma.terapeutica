import {data,runtime,preferences,selectedPatient,nowISO} from './state.js';
import {encryptJson,decryptJson} from './crypto.js';
import {bulkPutEncryptedAtomic,deleteRecord,getDecryptedById} from './database.js';
import {toast,esc,modal,closeModal} from './ui.js';
import {normalizeIdentity,participantLabels,learnAliasesFromDocuments,identifyPatientFromDocument} from './gemini-identity-v270.mjs';

const VERSION='2.7.0';
const IDENTITY_RULE_VERSION='3.1-strict';
const TOKEN_STORAGE='rm.google.calendar.token.v1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const BACKFILL_ISO='2026-05-01T03:00:00Z';
const POLL_MS=5*60*1000;
const MIN_RETRY_MS=30000;
const PROMPT_VERSION='TCC-CFP-v2.7';
const CONCURRENCY=2;
const PROFESSIONAL_PROMPT=`Atue como apoio à documentação clínica de um psicólogo com referencial principal em Terapia Cognitivo-Comportamental. A partir exclusivamente do resumo e das anotações produzidas pelo Google Meet/Gemini, redija uma evolução de prontuário sintética, objetiva, cronológica e tecnicamente defensável. Registre somente elementos necessários ao acompanhamento: foco/demanda da sessão, evolução clínica observável, procedimentos técnico-científicos efetivamente descritos, resposta do paciente, decisões clínicas, tarefas e encaminhamentos. Não invente diagnóstico, hipótese, técnica, risco, sintoma, fala, resultado ou conduta ausente na fonte. Não copie a transcrição integral. Evite juízos morais, detalhes íntimos sem pertinência clínica e linguagem estigmatizante. Preserve a distinção entre relato do paciente e intervenção profissional. O texto final deve ser revisado pelo psicólogo antes da finalização.`;

let token='',expiresAt=0,tokenScope='',syncState='unknown',scanning=false,timer=null,lastRunAt=0;
let catalog=emptyCatalog();

const arr=value=>Array.isArray(value)?value.filter(Boolean):[];
const pad=n=>String(n).padStart(2,'0');
const clone=value=>globalThis.structuredClone?structuredClone(value):JSON.parse(JSON.stringify(value));
const activePatients=()=>arr(data.patients).filter(patient=>!['Encerrado','Arquivado'].includes(patient?.status||'')&&normalizeIdentity(patient?.name)!==normalizeIdentity(preferences.professionalName));
const patientById=id=>arr(data.patients).find(patient=>patient?.id===id)||null;
const recordByFileId=id=>arr(data.records).find(record=>record?.source?.fileId===id||record?.id===`gmrec_${id}`)||null;
const tokenValid=()=>Boolean(token&&expiresAt>Date.now()+60000&&tokenScope.split(/\s+/).includes(DRIVE_SCOPE));

function emptyCatalog(){return{version:7,identityRuleVersion:'',lastScanAt:'',lastError:'',filesSeen:0,aliases:{},manualLinks:{},items:[]}}
function emit(status,detail=''){document.dispatchEvent(new CustomEvent('rm:gemini-status',{detail:{status,detail,lastScanAt:catalog.lastScanAt,lastError:catalog.lastError,version:VERSION}}))}
function meetingIso(date,time){return`${date}T${time}:00-03:00`}
function addDays(date,days){const value=new Date(`${date}T12:00:00-03:00`);value.setDate(value.getDate()+days);return`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`}
function normalizeAgendaSlot(date,time){return{date,time,rawTime:time}}
function meetingInfo(file){const title=String(file?.name||'');let match=title.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{2}):(\d{2})/);if(match)return normalizeAgendaSlot(`${match[1]}-${match[2]}-${match[3]}`,`${match[4]}:${match[5]}`);match=title.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})\s+(\d{2}):(\d{2})/);if(match)return normalizeAgendaSlot(`${match[3]}-${match[2]}-${match[1]}`,`${match[4]}:${match[5]}`);return null}
function nextStamp(...values){const ms=Math.max(...values.map(value=>new Date(value||0).getTime()).filter(Number.isFinite),0)+1;return new Date(ms).toISOString()}

async function loadToken(){token='';expiresAt=0;tokenScope='';if(!runtime.key)return false;let raw=null;try{raw=JSON.parse(localStorage.getItem(TOKEN_STORAGE)||'null')}catch{}if(!raw)return false;try{const value=await decryptJson(runtime.key,raw,'google-calendar-token');if(value?.token&&Number(value.expiresAt)>Date.now()+60000){token=value.token;expiresAt=Number(value.expiresAt);tokenScope=String(value.scope||'');return true}}catch{}return false}
async function loadCatalog(){catalog=emptyCatalog();if(!runtime.key)return;let raw=null;try{raw=JSON.parse(localStorage.getItem(CATALOG_STORAGE)||'null')}catch{}if(!raw)return;try{const value=await decryptJson(runtime.key,raw,CATALOG_AAD);if(value&&Array.isArray(value.items))catalog={...emptyCatalog(),...value,aliases:value.aliases&&typeof value.aliases==='object'?value.aliases:{},manualLinks:value.manualLinks&&typeof value.manualLinks==='object'?value.manualLinks:{},items:value.items.slice(-700)}}catch{}}
async function saveCatalog(){if(!runtime.key)return;const encrypted=await encryptJson(runtime.key,{...catalog,version:7,items:arr(catalog.items).slice(-700)},CATALOG_AAD);localStorage.setItem(CATALOG_STORAGE,JSON.stringify(encrypted))}
function itemById(id){return arr(catalog.items).find(item=>item?.fileId===id)||null}
function upsertItem(item){const index=arr(catalog.items).findIndex(current=>current?.fileId===item.fileId);if(index>=0)catalog.items[index]={...catalog.items[index],...item};else catalog.items.push(item)}

async function gfetch(url){if(!tokenValid())throw new Error('Renove o Google Workspace para permitir leitura do Drive.');const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(response.status===401)throw new Error('A autorização do Google Workspace expirou.');if(response.status===403)throw new Error('A conexão Google não possui permissão de leitura do Drive.');return response}
async function listDocs(){const output=[];let pageToken='';do{const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',`mimeType='application/vnd.google-apps.document' and trashed=false and createdTime >= '${BACKFILL_ISO}' and name contains 'Gemini'`);url.searchParams.set('pageSize','1000');url.searchParams.set('orderBy','createdTime asc');url.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,webViewLink,mimeType)');if(pageToken)url.searchParams.set('pageToken',pageToken);const response=await gfetch(url);if(!response.ok)throw new Error(`Google Drive respondeu ${response.status}.`);const json=await response.json();output.push(...arr(json.files));pageToken=json.nextPageToken||''}while(pageToken);return output.filter(file=>/anota[cç][oõ]es.*gemini|gemini.*anota[cç][oõ]es|notes.*gemini|gemini.*notes/i.test(file?.name||''))}
async function exportDoc(id){const response=await gfetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('text/plain')}`);if(!response.ok)throw new Error(`Não foi possível ler a anotação ${id}.`);return response.text()}
async function mapLimit(list,limit,fn){const output=new Array(list.length);let cursor=0;async function worker(){while(cursor<list.length){const index=cursor++;output[index]=await fn(list[index],index)}}await Promise.all(Array.from({length:Math.min(limit,list.length)},worker));return output}

function section(raw,labels,endLabels=[]){const lines=String(raw||'').replace(/^\uFEFF/,'').split(/\r?\n/),starts=labels.map(normalizeIdentity),ends=endLabels.map(normalizeIdentity),start=lines.findIndex(line=>starts.includes(normalizeIdentity(line)));if(start<0)return'';let end=lines.length;for(let index=start+1;index<lines.length;index++)if(ends.includes(normalizeIdentity(lines[index]))){end=index;break}return lines.slice(start+1,end).join('\n').replace(/\n{3,}/g,'\n\n').trim()}
function cleanLine(value=''){return String(value).replace(/\s*\(\d{2}:\d{2}:\d{2}\)(?:\s*\(\d{2}:\d{2}:\d{2}\))*\s*/g,' ').replace(/^[-*•]\s*/,'').replace(/\s+/g,' ').trim()}
function escapeRx(value=''){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function neutralize(value,patient){let output=String(value||'');for(const name of [patient?.name,patient?.preferredName].filter(Boolean).sort((a,b)=>b.length-a.length))output=output.replace(new RegExp(`\\b${escapeRx(name)}\\b`,'gi'),'Paciente');output=output.replace(new RegExp(`\\b${escapeRx(preferences.professionalName)}\\b`,'gi'),'Profissional');return output}
function buildClinicalDraft(raw,patient){const source=String(raw).split(/📖\s*Transcri[cç][aã]o/i)[0].trim();const summary=neutralize(section(source,['Resumo','Summary'],['Próximas etapas','Proximas etapas','Next steps','Detalhes','Details']),patient);const details=section(source,['Detalhes','Details'],['Revise as anotações','Revise as anotacoes']);const lines=String(details).split(/\r?\n/).map(cleanLine).filter(Boolean);const procedureRx=/orient|psicoeduc|reestrutur|question|socr[aá]t|registro|exposi[cç]|ativa[cç][aã]o comport|planej|trein|habilidade|relax|respira|mindful|preven[cç][aã]o|discut|trabalh|interven|explor|identific|valida[cç]|modelo|matriz|t[eé]cnica/i;const responseRx=/relat|referiu|percebeu|reconheceu|identificou|avaliou|decidiu|concordou|demonstrou|apresentou|melhora|dificuldade|redu[cç][aã]o|aumento|mant[eé]m|descreveu/i;const procedures=lines.filter(line=>procedureRx.test(line)).slice(0,6).map(line=>`• ${neutralize(line,patient)}`).join('\n');const responses=lines.filter(line=>responseRx.test(line)&&!procedureRx.test(line)).slice(0,5).map(line=>`• ${neutralize(line,patient)}`).join('\n');const steps=section(source,['Próximas etapas','Proximas etapas','Next steps'],['Detalhes','Details']).split(/\r?\n/).map(cleanLine).filter(Boolean).map(line=>`• ${neutralize(line,patient)}`).join('\n');const fallback=neutralize(source.slice(0,3500),patient);return{title:'Evolução de sessão',text:[`Foco clínico e evolução da sessão\n${summary||fallback||'Síntese automática indisponível.'}`,procedures?`Procedimentos técnico-científicos adotados\n${procedures}`:'',responses?`Resposta do paciente e resultados observados\n${responses}`:'',steps?`Plano terapêutico, tarefas e encaminhamentos\n${steps}`:''].filter(Boolean).join('\n\n'),followup:steps.replace(/^•\s*/gm,'').trim()}}
function deriveDuration(raw=''){let max=0;for(const match of String(raw).matchAll(/\b(\d{2}):(\d{2}):(\d{2})\b/g)){const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);if(Number.isFinite(seconds))max=Math.max(max,seconds)}const minutes=Math.ceil(max/60);return minutes>=20&&minutes<=180?minutes:Number(preferences.defaultSessionMinutes||50)}

function findAppointment(patientId,meeting,fileId,appointments){const direct=appointments.find(appointment=>appointment?.source?.fileId===fileId||appointment?.gemini?.fileId===fileId||appointment?.id===`gmappt_${fileId}`);if(direct)return direct;const target=new Date(meetingIso(meeting.date,meeting.time)).getTime();const candidates=appointments.filter(appointment=>appointment?.patientId===patientId&&appointment?.date===meeting.date&&appointment?.status!=='Cancelada').map(appointment=>({appointment,distance:Math.abs(new Date(meetingIso(appointment.date,appointment.time||'00:00')).getTime()-target)})).filter(item=>item.distance<=90*60000).sort((a,b)=>a.distance-b.distance);return candidates[0]?.appointment||null}
function exclusionKey(fileId){return 'gemini-source-exclusion-v1:'+fileId}
function excluded(fileId){return arr(data.settings).some(x=>x.id===exclusionKey(fileId))}
function existingRealAppointment(patientId,entry,appointments){
  const source=new Date(meetingIso(entry.meetingDate,entry.rawTime||entry.meetingTime)).getTime();
  const candidates=appointments.filter(a=>{
    if(a.patientId!==patientId||a.date!==entry.meetingDate||a.status==='Cancelada'||a.attendanceStatus==='Desmarcou')return false;
    const independentlyPerformed=Boolean(a.sessionEndedAt)||a.clinicalSessionState==='Encerrada'||(a.status==='Realizada'&&!a.gemini?.fileId&&a.source?.type!=='google-meet-gemini');
    const start=new Date(a.sessionStartedAt||meetingIso(a.date,a.time)).getTime();
    return independentlyPerformed&&Number.isFinite(start)&&Math.abs(start-source)<=45*60000;
  });
  return candidates.length===1?candidates[0]:null;
}
function prepareMaterialization(entry,raw,appointments,records){
  if(excluded(entry.fileId))return null;
  const patient=patientById(entry.patientId);if(!patient)return null;
  const appointment=existingRealAppointment(patient.id,entry,appointments);
  if(!appointment){entry.status='review';entry.reason='Atendimento real correspondente não confirmado na agenda clínica.';return null}
  const sameSource=records.find(r=>r.source?.fileId===entry.fileId||r.id==='gmrec_'+entry.fileId);
  if(sameSource&&sameSource.patientId!==patient.id){entry.status='review';entry.reason='Fonte já vinculada a outra identidade; revisão obrigatória.';return null}
  const existing=sameSource||records.find(r=>r.patientId===patient.id&&(r.appointmentId===appointment.id||r.clinicalSessionId===(appointment.clinicalSessionId||appointment.id)||r.date===appointment.date));
  if(existing){entry.status='covered';entry.recordId=existing.id;entry.appointmentId=appointment.id;return{appointment,record:existing,appointmentChanged:false,recordChanged:false}}
  const draft=buildClinicalDraft(raw,patient),at=nowISO();
  const record={id:'gmrec_'+entry.fileId,patientId:patient.id,appointmentId:appointment.id,clinicalSessionId:appointment.clinicalSessionId||appointment.id,title:draft.title,date:entry.meetingDate,time:entry.rawTime||entry.meetingTime,status:'Rascunho IA',text:draft.text,followup:draft.followup,requiresReview:true,createdAt:at,updatedAt:at,addenda:[],source:{type:'google-meet-gemini',fileId:entry.fileId,url:entry.url||'',title:entry.name||'',sourceModifiedAt:entry.modifiedTime,rawTime:entry.rawTime||entry.meetingTime,version:VERSION,clinicalPromptVersion:PROMPT_VERSION,aiSource:'Google Meet/Gemini'}};
  entry.status='materialized';entry.recordId=record.id;entry.appointmentId=appointment.id;
  return{appointment,record,appointmentChanged:false,recordChanged:true};
}
function forcedPatient(fileId){const id=catalog.verifiedLinks?.[fileId];return id?patientById(id):null}
async function applyPrivateSourceExclusions(){
  if(runtime.integrityBlocked||shouldPauseForConflict())throw Error('Correção bloqueada por integridade/sincronização.');
  const url=new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q',"trashed=false and 'me' in owners and name = 'RM Clinical Source Exclusion v1' and mimeType = 'application/vnd.google-apps.document'");
  url.searchParams.set('fields','files(id),nextPageToken');url.searchParams.set('pageSize','10');
  const response=await gfetch(url);if(!response.ok)throw Error('Não foi possível conferir exclusões privadas.');
  const docs=await response.json();if(docs.nextPageToken||arr(docs.files).length>1)throw Error('Instrução de exclusão privada ambígua.');
  if(!arr(docs.files).length)return;
  const patch=JSON.parse((await exportDoc(docs.files[0].id)).trim());
  if(patch.schema!=='rm-clinical-source-exclusion-v1')throw Error('Instrução de exclusão inválida.');
  for(const spec of arr(patch.exclusions)){
    if(spec.action!=='revoke-nonclinical-draft'||!spec.fileId||!spec.date||!spec.time)continue;
    const key=exclusionKey(spec.fileId),prior=arr(data.settings).find(s=>s.id===key);
    const found=arr(data.records).filter(r=>r.source?.fileId===spec.fileId||r.id==='gmrec_'+spec.fileId);
    const linked=arr(data.appointments).filter(a=>a.gemini?.fileId===spec.fileId||a.source?.fileId===spec.fileId||a.id==='gmappt_'+spec.fileId);
    if(found.length>1||linked.length>1)throw Error('Exclusão requer revisão: vínculo não único.');
    const record=found[0],appt=linked[0];
    if(record&&(record.status!=='Rascunho IA'||record.source?.type!=='google-meet-gemini'||record.date!==spec.date))throw Error('Exclusão bloqueada: registro não é rascunho Gemini da data confirmada.');
    if(appt&&(appt.date!==spec.date||appt.time!==spec.time||appt.sessionStartedAt||appt.sessionEndedAt||appt.clinicalSessionState==='Encerrada'||appt.clinicalSessionState==='Em atendimento'))throw Error('Exclusão bloqueada: sessão real ou data/horário divergente.');
    if(record&&appt&&(record.appointmentId!==appt.id||record.patientId!==appt.patientId))throw Error('Exclusão bloqueada: vínculo clínico divergente.');
    if(appt&&arr(data.records).some(r=>r.id!==record?.id&&(r.appointmentId===appt.id||r.clinicalSessionId===(appt.clinicalSessionId||appt.id))))throw Error('Exclusão bloqueada: outro prontuário vinculado.');
    const at=nowISO(),backup=prior||{id:key,kind:'gemini-source-exclusion-v1',sourceFileId:spec.fileId,date:spec.date,time:spec.time,reason:String(spec.reason||''),previousRecord:record||null,previousAppointment:appt||null,createdAt:at,updatedAt:at};
    if(!prior){await bulkPutEncryptedAtomic([{storeName:'settings',values:[backup]}],runtime.key,{verify:true});data.settings=[...arr(data.settings),backup]}
    if(appt){
      if(appt.id==='gmappt_'+spec.fileId&&appt.source?.type==='google-meet-gemini'){
        if(arr(data.payments).some(p=>p.appointmentId===appt.id||arr(p.appointmentIds).includes(appt.id)))throw Error('Exclusão bloqueada: sessão possui pagamento vinculado.');
        await deleteRecord('appointments',appt.id);if(await getDecryptedById('appointments',appt.id,runtime.key))throw Error('Falha na remoção da sessão artificial.');data.appointments=arr(data.appointments).filter(a=>a.id!==appt.id);
      }else{
        const restored={...appt,status:'Confirmada',attendanceStatus:'',updatedAt:at};delete restored.gemini;
        await bulkPutEncryptedAtomic([{storeName:'appointments',values:[restored]}],runtime.key,{verify:true});data.appointments=arr(data.appointments).map(a=>a.id===restored.id?restored:a);
      }
    }
    if(record){await deleteRecord('records',record.id);if(await getDecryptedById('records',record.id,runtime.key))throw Error('Falha na remoção do rascunho.');data.records=arr(data.records).filter(r=>r.id!==record.id)}
    delete catalog.manualLinks[spec.fileId];if(catalog.verifiedLinks)delete catalog.verifiedLinks[spec.fileId];
    upsertItem({fileId:spec.fileId,status:'excluded',patientId:'',recordId:'',appointmentId:'',reason:'Fonte não clínica excluída por confirmação profissional.'});
    await saveCatalog();
    if(record||appt){document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'gemini-source-exclusion-v1',at,verified:true}}));window.__rmRender?.()}
  }
}

function shouldPauseForConflict(){return syncState==='conflict'}
function scheduleReconcile(reason,delay=700){setTimeout(()=>void reconcileGemini({quiet:true,reason}),delay)}

export async function reconcileGemini({quiet=true,force=false,reason='automatic'}={}){
  if(scanning||runtime.locked||!runtime.key||!runtime.dataReady||globalThis.__rmSyncApplying)return false;
  if(shouldPauseForConflict()){emit('paused','Gemini pausado: resolva o conflito real de Dados.');return false}
  if(!navigator.onLine){emit('paused','Sem conexão; rascunhos já locais permanecem preservados.');return false}
  if(!force&&Date.now()-lastRunAt<MIN_RETRY_MS)return false;
  await loadToken();
  if(!tokenValid()){
    emit('disconnected','Renove o Google Workspace para Agenda + Drive.');
    document.dispatchEvent(new CustomEvent('rm:workspace-auto-renew-request',{detail:{reason:'gemini-reconcile-v270'}}));
    return false;
  }
  scanning=true;lastRunAt=Date.now();emit('scanning',`Conferindo Anotações do Gemini · ${reason}.`);
  const catalogBefore=clone(catalog);
  try{
    await applyPrivateSourceExclusions();
    const files=await listDocs();catalog.filesSeen=files.length;
    const identityRebuild=catalog.identityRuleVersion!==IDENTITY_RULE_VERSION;
    if(identityRebuild)catalog.aliases={};
    const candidates=files.filter(file=>{const previous=itemById(file.id);return !excluded(file.id)&&(identityRebuild||force||!previous||previous.modifiedTime!==file.modifiedTime||['review','write_failed','ready'].includes(previous.status))});
    const fetched=await mapLimit(candidates,CONCURRENCY,async file=>{const meeting=meetingInfo(file);if(!meeting)return{file,meeting:null,raw:''};return{file,meeting,raw:await exportDoc(file.id)}});
    catalog.aliases=learnAliasesFromDocuments({raws:fetched.map(item=>item.raw).filter(Boolean),patients:activePatients(),professionalName:preferences.professionalName,existingAliases:catalog.aliases});
    catalog.identityRuleVersion=IDENTITY_RULE_VERSION;

    const appointments=[...arr(data.appointments)],records=[...arr(data.records)],appointmentWrites=new Map(),recordWrites=new Map();
    for(const item of fetched){
      if(!item.meeting){upsertItem({fileId:item.file.id,name:item.file.name,url:item.file.webViewLink||'',modifiedTime:item.file.modifiedTime||'',status:'review',reason:'Data/hora não identificada no título.',version:VERSION});continue}
      const forced=forcedPatient(item.file.id);
      const match=forced?{patient:forced,evidence:'associação clínica confirmada manualmente'}:identifyPatientFromDocument({raw:item.raw,patients:activePatients(),professionalName:preferences.professionalName,learnedAliases:catalog.aliases});
      if(!match.patient){upsertItem({fileId:item.file.id,name:item.file.name,url:item.file.webViewLink||'',modifiedTime:item.file.modifiedTime||'',meetingDate:item.meeting.date,meetingTime:item.meeting.time,rawTime:item.meeting.rawTime||item.meeting.time,status:'review',reason:match.reason||'Paciente não identificado com segurança.',version:VERSION});continue}
      const entry={fileId:item.file.id,name:item.file.name,url:item.file.webViewLink||`https://docs.google.com/document/d/${item.file.id}`,modifiedTime:item.file.modifiedTime||'',patientId:match.patient.id,meetingDate:item.meeting.date,meetingTime:item.meeting.time,rawTime:item.meeting.rawTime||item.meeting.time,status:'ready',reason:match.evidence||'',version:VERSION};
      const prepared=prepareMaterialization(entry,item.raw,appointments,records);
      if(!prepared){upsertItem(entry);continue}
      if(prepared.appointmentChanged){appointmentWrites.set(prepared.appointment.id,prepared.appointment);const index=appointments.findIndex(current=>current.id===prepared.appointment.id);if(index>=0)appointments[index]=prepared.appointment;else appointments.push(prepared.appointment)}
      if(prepared.recordChanged){recordWrites.set(prepared.record.id,prepared.record);const index=records.findIndex(current=>current.id===prepared.record.id);if(index>=0)records[index]=prepared.record;else records.push(prepared.record)}
      upsertItem(entry);
    }
    for(const file of files){if(candidates.some(candidate=>candidate.id===file.id))continue;const previous=itemById(file.id);if(previous)upsertItem({...previous,name:file.name,url:file.webViewLink||previous.url||'',modifiedTime:file.modifiedTime||previous.modifiedTime||''})}

    if(appointmentWrites.size||recordWrites.size){
      const batches=[];
      if(appointmentWrites.size)batches.push({storeName:'appointments',values:[...appointmentWrites.values()]});
      if(recordWrites.size)batches.push({storeName:'records',values:[...recordWrites.values()]});
      const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;
      try{await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true})}finally{globalThis.__rmSyncApplying=previous}
      if(appointmentWrites.size)data.appointments=appointments;
      if(recordWrites.size)data.records=records;
      document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',kind:'gemini-materialize-v270',at:nowISO(),appointments:appointmentWrites.size,records:recordWrites.size,verified:true}}));
      window.__rmRender?.();
    }

    catalog.lastScanAt=nowISO();catalog.lastError='';await saveCatalog();emit('connected',`${files.length} arquivo(s) catalogado(s); ${candidates.length} processado(s); gravação verificada.`);decorateAll();if(!quiet)toast(`Gemini conciliado. ${recordWrites.size} prontuário(s) IA gravado(s) e verificado(s).`,'success');return true;
  }catch(error){
    const message=String(error?.message||error);
    catalog=catalogBefore;catalog.lastError=message;catalog.lastScanAt=nowISO();await saveCatalog().catch(()=>{});emit('error',message);if(!quiet)toast(message,'error');return false;
  }finally{scanning=false;decorateAll()}
}

function patientItems(){const patient=selectedPatient();return patient?arr(catalog.items).filter(item=>item.patientId===patient.id&&['materialized','covered','ready'].includes(item.status)).sort((a,b)=>`${b.meetingDate||''}${b.meetingTime||''}`.localeCompare(`${a.meetingDate||''}${a.meetingTime||''}`)):[]}
function stats(){const items=arr(catalog.items),safe=items.filter(item=>item.patientId),review=items.filter(item=>item.status==='review'),records=safe.filter(item=>recordByFileId(item.fileId));return{safe,review,records}}
function syncLabel(){if(syncState==='synced')return'Dados ✓';if(syncState==='conflict')return'Dados !';if(syncState==='syncing')return'Dados ↻';return'Dados •'}
function settingsMarkup(){const current=stats(),last=catalog.lastScanAt?new Date(catalog.lastScanAt).toLocaleString('pt-BR'):'Ainda não executado';return`<section id="rm-gemini-clinical" class="card mt-16"><div class="card-title"><div><div class="eyebrow">Integração clínica · v${VERSION}</div><h3 class="mb-0">Google Meet · Gemini</h3></div><span class="badge">${scanning?'Conferindo':tokenValid()?'Conectado':'Reconectar'}</span></div><p class="muted">Conciliação estrita: exige identidade e atendimento real correspondente, preserva a agenda e não sobrescreve prontuários existentes. A sincronização remota é posterior e não condiciona a gravação local.</p><div class="gemini-metrics"><span><strong>${current.safe.length}</strong> sessões identificadas</span><span><strong>${current.records.length}</strong> prontuários</span><span><strong>${current.review.length}</strong> revisar</span><span><strong>${catalog.filesSeen}</strong> arquivos</span></div><div class="small muted mt-12">Backfill desde 01/05/2026 · ${syncLabel()} · Última conciliação: ${esc(last)}.</div><div class="flex gap-8 wrap mt-16"><button class="btn" data-action="gemini-reconcile-v270" ${scanning?'disabled':''}>Conciliar agora</button>${current.review.length?'<button class="btn secondary" data-action="gemini-review-hub-v270">Revisar identidades</button>':''}<button class="btn secondary" data-action="workspace-connect">Renovar Google Workspace</button></div><div class="notice mt-12"><strong>Prontuário:</strong> cada sessão associada com segurança gera Rascunho IA. Registros finalizados não são sobrescritos; ambiguidades permanecem para decisão profissional.</div></section>`}
function decorateSettings(){if(runtime.locked||runtime.route!=='settings')return;const main=document.getElementById('main-content');if(!main)return;const old=document.getElementById('rm-gemini-clinical'),html=settingsMarkup();if(old?.__rmGeminiMarkup===html)return;const wrap=document.createElement('div');wrap.innerHTML=html;const next=wrap.firstElementChild;next.__rmGeminiMarkup=html;if(old)old.replaceWith(next);else main.appendChild(next)}
function decorateRecords(){if(runtime.locked||runtime.route!=='patients'||runtime.patientTab!=='records')return;const patient=selectedPatient();if(!patient)return;const main=document.getElementById('main-content');if(!main)return;let bar=document.getElementById('rm-ai-record-toolbar');if(!bar){bar=document.createElement('div');bar.id='rm-ai-record-toolbar';bar.className='card mb-16';const grid=main.querySelector('.grid');if(grid)grid.insertAdjacentElement('beforebegin',bar);else main.prepend(bar)}const items=patientItems(),missing=items.filter(item=>!recordByFileId(item.fileId));bar.innerHTML=`<div class="card-title"><div><div class="eyebrow">Prontuário assistido por IA</div><h3 class="mb-0">${items.length} sessão(ões) do Gemini</h3></div><span class="badge">${missing.length?`${missing.length} pendente(s)`:'Atualizado'}</span></div><p class="small muted">O draft utiliza o resumo Gemini e o prompt clínico ${PROMPT_VERSION}; a gravação é confirmada por read-back antes de aparecer como concluída.</p><div class="flex gap-8 wrap"><button class="btn" data-action="gemini-ai-hub-v270">Gerar/revisar prontuário IA</button><button class="btn secondary" data-action="gemini-reconcile-v270">Conciliar sessões</button></div>`}
function aiHub(){const items=patientItems();modal('Gerar prontuário por IA',items.length?`<div class="notice"><strong>Prompt ${PROMPT_VERSION}</strong><br>${esc(PROFESSIONAL_PROMPT)}</div><div class="gemini-queue mt-16">${items.map(item=>{const record=recordByFileId(item.fileId);return`<div class="gemini-queue-row"><div><strong>${esc(item.meetingDate?.split('-').reverse().join('/')||'—')} · ${esc(item.meetingTime||'')}</strong><div class="tiny muted">${record?esc(record.status||'Prontuário existente'):'Prontuário pendente'}</div></div><button class="btn ${record?'secondary':''}" data-action="gemini-ai-generate-v270" data-id="${esc(item.fileId)}">${record?'Regenerar rascunho IA':'Gerar prontuário por IA'}</button></div>`}).join('')}</div>`:'<div class="notice">Nenhuma sessão Gemini associada a este paciente. Use Conciliar agora.</div>',`<button class="btn secondary" data-action="close-modal">Fechar</button>`,true)}
function reviewHub(){const review=arr(catalog.items).filter(item=>item.status==='review');modal('Revisar identidades Gemini',review.length?`<div class="notice">Somente sessões que não puderam ser vinculadas com segurança aparecem aqui. A escolha fica cifrada no catálogo clínico local.</div><div class="gemini-queue mt-16">${review.map(item=>`<div class="gemini-queue-row"><div><strong>${esc(item.meetingDate?.split('-').reverse().join('/')||'Data não identificada')} · ${esc(item.meetingTime||'')}</strong><div class="tiny muted">${esc(item.reason||'Identidade pendente')}</div></div><button class="btn secondary" data-action="gemini-review-link-v270" data-id="${esc(item.fileId)}">Associar paciente</button></div>`).join('')}</div>`:'<div class="notice">Nenhuma identidade pendente.</div>',`<button class="btn secondary" data-action="close-modal">Fechar</button>`,true)}
function reviewLink(fileId){const item=itemById(fileId),patients=activePatients();if(!item)throw new Error('Sessão não localizada.');modal('Associar sessão ao paciente',`<div class="notice warning">Confirme somente se você reconhecer a sessão. A associação fica cifrada no cofre local e poderá ensinar o alias do Meet para sessões futuras.</div><div class="field mt-16"><label>Paciente</label><select id="rm-gemini-review-patient" class="select"><option value="">Selecione</option>${patients.map(patient=>`<option value="${esc(patient.id)}">${esc(patient.preferredName||patient.name||'Paciente')}</option>`).join('')}</select></div><input id="rm-gemini-review-file" type="hidden" value="${esc(fileId)}">`,`<button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn" data-action="gemini-review-save-v270">Salvar associação</button>`,true)}
async function saveReviewLink(){const fileId=String(document.getElementById('rm-gemini-review-file')?.value||''),patientId=String(document.getElementById('rm-gemini-review-patient')?.value||'');if(!fileId||!patientId||!patientById(patientId))throw new Error('Selecione um paciente válido.');await loadToken();if(!tokenValid())throw new Error('Renove o Google Workspace.');const raw=await exportDoc(fileId),professional=normalizeIdentity(preferences.professionalName),labels=participantLabels(raw).filter(label=>label&&label!==professional);catalog.manualLinks={...(catalog.manualLinks||{}),[fileId]:patientId};catalog.verifiedLinks={...(catalog.verifiedLinks||{}),[fileId]:patientId};if(labels.length===1)catalog.aliases={...(catalog.aliases||{}),[labels[0]]:patientId};await saveCatalog();closeModal();await reconcileGemini({quiet:false,force:true,reason:'identidade confirmada'})}
async function regenerate(fileId){if(shouldPauseForConflict())throw new Error('Resolva o conflito real de Dados antes de gerar novo rascunho.');const item=itemById(fileId);if(!item?.patientId)throw new Error('Sessão Gemini não localizada.');const existing=recordByFileId(fileId);if(existing)throw new Error('Já existe prontuário para esta fonte. Use a revisão do registro existente.');if(excluded(fileId))throw new Error('Fonte não clínica excluída.');await loadToken();if(!tokenValid())throw new Error('Renove o Google Workspace.');const raw=await exportDoc(fileId),prepared=prepareMaterialization({...item},raw,[...arr(data.appointments)],[...arr(data.records)],{force:true}),batches=[];if(!prepared||!prepared.recordChanged)throw new Error('Atendimento real não confirmado ou prontuário já existente.');if(prepared.appointmentChanged)batches.push({storeName:'appointments',values:[prepared.appointment]});if(prepared.recordChanged)batches.push({storeName:'records',values:[prepared.record]});const previous=globalThis.__rmSyncApplying;globalThis.__rmSyncApplying=true;try{await bulkPutEncryptedAtomic(batches,runtime.key,{verify:true})}finally{globalThis.__rmSyncApplying=previous}if(prepared.appointmentChanged){const index=data.appointments.findIndex(current=>current.id===prepared.appointment.id);if(index>=0)data.appointments[index]=prepared.appointment;else data.appointments.push(prepared.appointment)}if(prepared.recordChanged){const index=data.records.findIndex(current=>current.id===prepared.record.id);if(index>=0)data.records[index]=prepared.record;else data.records.push(prepared.record)}document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{storeName:'records',id:prepared.record?.id||'',kind:'gemini-regenerate-v270',at:nowISO(),verified:true}}));closeModal();runtime.patientTab='records';window.__rmRender?.();toast('Rascunho IA gravado e verificado. Revise antes de finalizar.','success')}
function decorateAll(){decorateSettings();decorateRecords()}
async function activate(){await Promise.all([loadCatalog(),loadToken()]);emit(tokenValid()?'connected':'disconnected',tokenValid()?'Google Meet/Gemini pronto.':'Google Workspace precisa ser renovado.');decorateAll();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&navigator.onLine&&!shouldPauseForConflict()&&Date.now()-lastRunAt>=POLL_MS)void reconcileGemini({quiet:true,reason:'poll'})},POLL_MS);if(navigator.onLine&&!shouldPauseForConflict())scheduleReconcile('abertura da plataforma',1200)}

document.addEventListener('rm:data-ready',()=>void activate());
document.addEventListener('rm:rendered',()=>setTimeout(decorateAll,0));
document.addEventListener('rm:google-workspace-authorized',()=>setTimeout(()=>void(async()=>{await loadToken();scheduleReconcile('Workspace autorizado',250)})(),120));
document.addEventListener('rm:workspace-auto-renew',event=>{if(event.detail?.status==='renewed')setTimeout(()=>void(async()=>{await loadToken();scheduleReconcile('Workspace renovado',200)})(),80)});
document.addEventListener('rm:sync-status',event=>{const previous=syncState;syncState=event.detail?.status||syncState;if(syncState==='conflict')emit('paused','Gemini pausado: resolva o conflito real de Dados.');else if(previous==='conflict'&&syncState!=='conflict')scheduleReconcile('conflito resolvido',500);decorateAll()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine&&!shouldPauseForConflict()&&Date.now()-lastRunAt>=POLL_MS)void reconcileGemini({quiet:true,reason:'retorno à aba'})});
window.addEventListener('online',()=>{if(!shouldPauseForConflict())scheduleReconcile('conexão restabelecida',450)});
document.addEventListener('click',event=>{const element=event.target.closest?.('[data-action]');if(!element)return;const action=element.dataset.action;if(!['gemini-reconcile-v270','gemini-ai-hub-v270','gemini-ai-generate-v270','gemini-review-hub-v270','gemini-review-link-v270','gemini-review-save-v270'].includes(action))return;event.preventDefault();event.stopImmediatePropagation();if(action==='gemini-reconcile-v270'){void reconcileGemini({quiet:false,force:true,reason:'comando manual'});return}if(action==='gemini-ai-hub-v270'){runtime.patientTab='records';window.__rmRender?.();setTimeout(aiHub,80);return}if(action==='gemini-ai-generate-v270'){void regenerate(element.dataset.id).catch(error=>toast(error.message||'Não foi possível gerar o prontuário.','error'));return}if(action==='gemini-review-hub-v270'){reviewHub();return}if(action==='gemini-review-link-v270'){try{reviewLink(element.dataset.id)}catch(error){toast(error.message||'Não foi possível abrir a revisão.','error')}return}if(action==='gemini-review-save-v270')void saveReviewLink().catch(error=>toast(error.message||'Não foi possível salvar a associação.','error'))},true);
