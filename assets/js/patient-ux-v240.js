import {data,runtime,selectedPatient,patientById,todayISO,nowISO} from './state.js';
import {decryptJson,encryptJson} from './crypto.js';
import {putEncrypted,deleteRecord} from './database.js';
import {modal,closeModal,toast,esc,fmtDate} from './ui.js';
import {normalizeIdentity} from './gemini-identity-v270.mjs';
import {loadWorkspaceAuthorization,DRIVE_READONLY_SCOPE} from './google-workspace-token-v260.js';
import {reconcileGemini} from './clinical-reconcile-v270.js';

const UX_VERSION='3.2.0';
const POLICY_VERSION='2.8.0';
const MANIFEST_NAME='RM_CLINICAL_RECONCILIATION_POLICY_V1';
const CATALOG_STORAGE='rm.google.clinical.reconcile.v230';
const CATALOG_AAD='google-clinical-reconcile-v230';
const POLICY_STATE='rm.google.clinical.reconcile-policy.v280';
const MIME='application/vnd.google-apps.document';
const NAV=[['summary','Visão geral'],['timeline','Sessões'],['atendimento','Atendimento'],['records','Prontuário'],['plans','Tratamento'],['documents','Documentos'],['finance','Administrativo']];
const arr=v=>Array.isArray(v)?v.filter(Boolean):[];
let running=false;
let policyTimer=null;
let decorateTimer=null;

function parseJson(v,fallback=null){try{return JSON.parse(v)}catch{return fallback}}
function firstName(p){return String(p?.preferredName||p?.name||'').trim().split(/\s+/)[0]||'Paciente'}
function applyFocusClass(){document.body.classList.toggle('rm-patient-focused',runtime.route==='patients'&&Boolean(selectedPatient()))}
function emptyCatalog(){return{version:8,aliases:{},manualLinks:{},items:{},exclusions:{},merges:{},updatedAt:''}}
async function loadCatalog(){
  if(!runtime.key)return emptyCatalog();
  const raw=parseJson(localStorage.getItem(CATALOG_STORAGE)||'');
  if(!raw)return emptyCatalog();
  try{
    const value=await decryptJson(runtime.key,raw,CATALOG_AAD);
    return{...emptyCatalog(),...(value||{}),aliases:{...(value?.aliases||{})},manualLinks:{...(value?.manualLinks||{})},items:{...(value?.items||{})},exclusions:{...(value?.exclusions||{})},merges:{...(value?.merges||{})}};
  }catch{return emptyCatalog()}
}
async function saveCatalog(catalog){
  if(!runtime.key)return;
  catalog.version=8;catalog.updatedAt=nowISO();
  const enc=await encryptJson(runtime.key,catalog,CATALOG_AAD);
  localStorage.setItem(CATALOG_STORAGE,JSON.stringify(enc));
}
function allPatients(){return arr(data.patients).filter(p=>p?.id&&p.status!=='Profissional')}
function patientByRule(rule){
  const spec=rule?.patientMatch||{};
  const wanted=normalizeIdentity(spec.value||'');
  if(!wanted)return null;
  const patients=allPatients();
  if(spec.type==='uniqueFirstName'){
    const first=wanted.split(' ')[0];
    const matches=patients.filter(p=>normalizeIdentity(p.name||p.preferredName||'').split(' ')[0]===first);
    return matches.length===1?matches[0]:null;
  }
  return patients.find(p=>normalizeIdentity(p.name||'')===wanted||normalizeIdentity(p.preferredName||'')===wanted)||null;
}
function patientByLocalId(id){return allPatients().find(p=>p.id===id)||null}
function minutes(time='00:00'){const m=String(time).match(/^(\d{1,2}):(\d{2})/);return m?(Number(m[1])*60+Number(m[2])):0}
function sourceStartedAt(rule){return rule?.date&&rule?.sourceTime?`${rule.date}T${rule.sourceTime}:00-03:00`:''}
function findAppointment(patientId,date,time){
  const target=minutes(time);
  return arr(data.appointments).filter(a=>a?.patientId===patientId&&a?.date===date&&a?.status!=='Cancelada'&&a?.attendanceStatus!=='Desmarcou').map(a=>({a,d:Math.abs(minutes(a.time)-target)})).filter(x=>x.d<=90).sort((a,b)=>a.d-b.d)[0]?.a||null;
}
function sourceFileId(row){return row?.source?.fileId||row?.gemini?.fileId||''}
function upsertLocal(store,row){const list=data[store]||(data[store]=[]),i=list.findIndex(x=>x?.id===row.id);if(i>=0)list[i]=row;else list.push(row)}
async function saveLocal(store,row){upsertLocal(store,row);await putEncrypted(store,row,runtime.key)}
async function removeLocal(store,id){data[store]=arr(data[store]).filter(x=>x?.id!==id);await deleteRecord(store,id)}
function sanitizeText(raw=''){return String(raw||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()}
function section(raw,startLabels,endLabels=[]){
  const text=String(raw||'');
  let start=-1,label='';
  for(const candidate of startLabels){const i=text.search(new RegExp(`(?:^|\\n)${candidate}\\s*(?:\\n|$)`,`i`));if(i>=0&&(start<0||i<start)){start=i;label=candidate}}
  if(start<0)return'';
  const after=text.slice(start).replace(new RegExp(`^(?:\\n)?${label}\\s*\\n?`,`i`),'');
  let end=after.length;
  for(const candidate of endLabels){const i=after.search(new RegExp(`(?:^|\\n)${candidate}\\s*(?:\\n|$)`,`i`));if(i>=0&&i<end)end=i}
  return sanitizeText(after.slice(0,end));
}
function buildDraft(raw){
  const summary=section(raw,['Resumo'],['Próximas etapas','Detalhes','Transcrição','Revise as anotações']);
  const next=section(raw,['Próximas etapas'],['Detalhes','Transcrição','Revise as anotações']);
  const details=section(raw,['Detalhes'],['Transcrição','Revise as anotações']);
  const compact=sanitizeText([summary&&`Resumo\n${summary}`,details&&`Detalhes\n${details}`].filter(Boolean).join('\n\n')).slice(0,12000);
  return{summary:summary.slice(0,3500),followup:next.slice(0,3500),text:compact||sanitizeText(raw).slice(0,12000)};
}
async function driveJson(token,path){const res=await fetch(`https://www.googleapis.com/drive/v3/${path}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!res.ok)throw new Error(`Drive ${res.status}`);return res.json()}
async function driveText(token,url){const res=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});if(!res.ok)throw new Error(`Drive ${res.status}`);return res.text()}
async function findManifest(token){
  const q=`name = '${MANIFEST_NAME}' and mimeType = '${MIME}' and trashed = false`;
  const result=await driveJson(token,`files?q=${encodeURIComponent(q)}&pageSize=10&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime)`);
  return arr(result.files)[0]||null;
}
async function loadManifest(){
  const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);
  if(!auth.ok)throw new Error('Google Drive clínico não autorizado.');
  const file=await findManifest(auth.token);if(!file)return null;
  const raw=await driveText(auth.token,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`);
  const parsed=parseJson(raw);if(!parsed?.version)throw new Error('Manifesto clínico privado inválido.');
  return{...parsed,_file:file,_token:auth.token};
}
async function fileMeta(token,fileId){return driveJson(token,`files/${encodeURIComponent(fileId)}?fields=id,name,modifiedTime,createdTime,mimeType`)}
async function exportDoc(token,fileId){return driveText(token,`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('text/plain')}`)}
async function purgeExclusion(fileId){
  const records=arr(data.records).filter(r=>sourceFileId(r)===fileId||r?.id===`gmrec_${fileId}`);
  for(const record of records){if(record?.status==='Finalizado'&&!String(record?.id||'').startsWith('gmrec_'))continue;await removeLocal('records',record.id)}
  const appointments=arr(data.appointments).filter(a=>sourceFileId(a)===fileId||a?.id===`gmappt_${fileId}`);
  for(const appointment of appointments){
    if(appointment?.id===`gmappt_${fileId}`){await removeLocal('appointments',appointment.id);continue}
    const cleaned={...appointment,source:appointment.source?.fileId===fileId?undefined:appointment.source,gemini:appointment.gemini?.fileId===fileId?undefined:appointment.gemini,updatedAt:nowISO()};
    await saveLocal('appointments',cleaned);
  }
}
async function purgeMergedSource(fileId){
  for(const record of arr(data.records).filter(r=>sourceFileId(r)===fileId||r?.id===`gmrec_${fileId}`)){
    if(record?.status==='Finalizado'&&!String(record?.id||'').startsWith('gmrec_'))continue;
    await removeLocal('records',record.id);
  }
  const generated=arr(data.appointments).find(a=>a?.id===`gmappt_${fileId}`);if(generated)await removeLocal('appointments',generated.id);
}
async function materializeRule(rule,catalog,token,{patientIdOverride=''}={}){
  const patient=patientIdOverride?patientByLocalId(patientIdOverride):patientByRule(rule);
  if(!patient){
    catalog.items[rule.fileId]={...(catalog.items[rule.fileId]||{}),fileId:rule.fileId,status:'review',reason:rule.conditional?'Pessoa não localizada como paciente/ex-paciente no catálogo local.':'Paciente não localizado com segurança.',meetingDate:rule.date||'',meetingTime:rule.scheduledTime||'',rawTime:rule.sourceTime||'',updatedAt:nowISO()};
    return{ok:false,reason:'patient'};
  }
  const [meta,raw]=await Promise.all([fileMeta(token,rule.fileId),exportDoc(token,rule.fileId)]);
  const draft=buildDraft(raw);
  let appointment=findAppointment(patient.id,rule.date,rule.scheduledTime||rule.sourceTime);
  if(!appointment)appointment={id:`gmappt_${rule.fileId}`,patientId:patient.id,date:rule.date,time:rule.scheduledTime||rule.sourceTime,duration:50,status:'Realizada',attendanceStatus:'Compareceu',modality:patient.modality||'On-line',note:'Sessão conciliada com fonte Gemini.',createdAt:nowISO()};
  appointment={...appointment,patientId:patient.id,clinicalSessionId:appointment.clinicalSessionId||appointment.id,status:appointment.status==='Cancelada'?appointment.status:'Realizada',attendanceStatus:appointment.attendanceStatus||'Compareceu',source:{provider:'google-drive',kind:'gemini-meet-notes',fileId:rule.fileId,fileName:meta.name||'',modifiedTime:meta.modifiedTime||'',sourceStartedAt:sourceStartedAt(rule),sourceTime:rule.sourceTime||''},gemini:{fileId:rule.fileId,fileName:meta.name||'',sourceStartedAt:sourceStartedAt(rule),reviewed:true},updatedAt:nowISO()};
  await saveLocal('appointments',appointment);
  const existing=arr(data.records).find(r=>sourceFileId(r)===rule.fileId)||arr(data.records).find(r=>r?.appointmentId===appointment.id)||null;
  if(!(existing?.status==='Finalizado')){
    const record={...(existing||{}),id:existing?.id||`gmrec_${rule.fileId}`,patientId:patient.id,appointmentId:appointment.id,clinicalSessionId:appointment.clinicalSessionId||appointment.id,date:appointment.date,time:appointment.time,status:existing?.status||'Rascunho assistido',text:existing?.text||draft.text,sessionSummary:existing?.sessionSummary||draft.summary,followup:existing?.followup||draft.followup,source:{provider:'google-drive',kind:'gemini-meet-notes',fileId:rule.fileId,fileName:meta.name||'',modifiedTime:meta.modifiedTime||'',sourceStartedAt:sourceStartedAt(rule),sourceTime:rule.sourceTime||''},updatedAt:nowISO(),createdAt:existing?.createdAt||nowISO()};
    await saveLocal('records',record);
  }
  catalog.manualLinks[rule.fileId]=patient.id;
  catalog.items[rule.fileId]={...(catalog.items[rule.fileId]||{}),fileId:rule.fileId,name:meta.name||'',modifiedTime:meta.modifiedTime||'',meetingDate:rule.date,meetingTime:rule.scheduledTime||rule.sourceTime,rawTime:rule.sourceTime||'',sourceStartedAt:sourceStartedAt(rule),status:'ready',patientId:patient.id,reason:rule.conditional?'Vínculo condicional confirmado pelo catálogo local.':'Vínculo confirmado por auditoria privada.',updatedAt:nowISO()};
  delete catalog.exclusions[rule.fileId];
  return{ok:true,patientId:patient.id,appointmentId:appointment.id};
}
function prepareMergeCatalog(merge,catalog){
  catalog.exclusions[merge.sourceFileId]={kind:'merged',reason:merge.reason||'same-session-reconnect',mergedInto:merge.intoFileId,at:nowISO()};
  delete catalog.manualLinks[merge.sourceFileId];catalog.merges[merge.sourceFileId]=merge.intoFileId;
  catalog.items[merge.sourceFileId]={...(catalog.items[merge.sourceFileId]||{}),fileId:merge.sourceFileId,status:'merged',mergedInto:merge.intoFileId,reason:'Reconexão consolidada na mesma sessão.',meetingDate:merge.date||'',meetingTime:merge.scheduledTime||'',updatedAt:nowISO()};
}
async function attachMerge(merge){
  const primaryAppointment=arr(data.appointments).find(a=>sourceFileId(a)===merge.intoFileId||a?.id===`gmappt_${merge.intoFileId}`);
  if(primaryAppointment){const source={...(primaryAppointment.source||{}),supplementalFileIds:[...new Set([...(primaryAppointment.source?.supplementalFileIds||[]),merge.sourceFileId])]};await saveLocal('appointments',{...primaryAppointment,source,updatedAt:nowISO()})}
  const primaryRecord=arr(data.records).find(r=>sourceFileId(r)===merge.intoFileId||r?.id===`gmrec_${merge.intoFileId}`);
  if(primaryRecord&&primaryRecord.status!=='Finalizado'){const source={...(primaryRecord.source||{}),supplementalFileIds:[...new Set([...(primaryRecord.source?.supplementalFileIds||[]),merge.sourceFileId])]};await saveLocal('records',{...primaryRecord,source,updatedAt:nowISO()})}
}
function parseGmraw(name=''){const m=String(name).match(/GMRAW_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/i);return m?{date:`${m[1]}-${m[2]}-${m[3]}`,time:`${m[4]}:${m[5]}`}:null}
function patchCatalogSourceTimes(catalog){for(const item of Object.values(catalog.items||{})){const parsed=parseGmraw(item?.name||'');if(parsed){item.meetingDate=item.meetingDate||parsed.date;item.rawTime=item.rawTime||parsed.time;item.meetingTime=item.meetingTime||parsed.time}}}
async function runPolicy({quiet=true}={}){
  if(running||runtime.locked||!runtime.key||!runtime.dataReady)return null;
  running=true;
  try{
    const manifest=await loadManifest();if(!manifest)return null;
    const catalog=await loadCatalog();patchCatalogSourceTimes(catalog);
    for(const exclusion of arr(manifest.exclusions)){
      await purgeExclusion(exclusion.fileId);delete catalog.manualLinks[exclusion.fileId];catalog.exclusions[exclusion.fileId]={kind:'nonclinical',reason:exclusion.reason||'nonclinical',at:nowISO()};catalog.items[exclusion.fileId]={...(catalog.items[exclusion.fileId]||{}),fileId:exclusion.fileId,status:'dismissed',reason:'Retirado do domínio clínico por auditoria.',updatedAt:nowISO()};
    }
    for(const merge of arr(manifest.merges)){await purgeMergedSource(merge.sourceFileId);prepareMergeCatalog(merge,catalog)}
    let linked=0,review=0;
    for(const rule of arr(manifest.associations)){const result=await materializeRule(rule,catalog,manifest._token);if(result.ok)linked++;else review++}
    for(const merge of arr(manifest.merges))await attachMerge(merge);
    await saveCatalog(catalog);
    localStorage.setItem(POLICY_STATE,JSON.stringify({version:POLICY_VERSION,manifestId:manifest._file.id,manifestModifiedTime:manifest._file.modifiedTime||'',appliedAt:nowISO(),linked,review,excluded:arr(manifest.exclusions).length,merged:arr(manifest.merges).length}));
    document.dispatchEvent(new CustomEvent('rm:local-data-changed',{detail:{kind:'clinical-audit-v280',at:nowISO(),verified:true}}));window.__rmRender?.();
    if(!quiet)toast(`Auditoria clínica aplicada: ${linked} vínculo(s), ${arr(manifest.exclusions).length} exclusão(ões), ${arr(manifest.merges).length} consolidação(ões).${review?` ${review} item(ns) ainda exigem confirmação.`:''}`,'success');
    return{linked,review,excluded:arr(manifest.exclusions).length,merged:arr(manifest.merges).length};
  }catch(err){console.error('Falha na política privada de reconciliação clínica.',err);if(!quiet)toast(err?.message||'Não foi possível aplicar a auditoria clínica.','error');return null}finally{running=false}
}
function queuePolicy(delay=350,opts={}){clearTimeout(policyTimer);policyTimer=setTimeout(()=>void runPolicy(opts),delay)}
function statusLabel(p){return p?.status||'Ativo'}
function reviewItems(catalog){return Object.values(catalog.items||{}).filter(i=>['review','error'].includes(i?.status)).sort((a,b)=>`${b.meetingDate||''}${b.rawTime||b.meetingTime||''}`.localeCompare(`${a.meetingDate||''}${a.rawTime||a.meetingTime||''}`))}
async function openReviewHub(){
  const catalog=await loadCatalog();patchCatalogSourceTimes(catalog);const items=reviewItems(catalog);
  const body=items.length?items.map(item=>`<div class="list-item"><div><strong>${esc(item.meetingDate?fmtDate(item.meetingDate):'Data não identificada')} · ${esc(item.rawTime||item.meetingTime||'—')}</strong><div class="tiny muted">${esc(item.reason||'Revisão necessária.')}</div></div><div class="flex gap-8 wrap"><button class="btn secondary" data-action="rm-policy-link" data-file-id="${esc(item.fileId)}">Associar paciente</button><button class="btn ghost" data-action="rm-policy-dismiss" data-file-id="${esc(item.fileId)}">Não clínico</button></div></div>`).join(''):'<div class="notice success">Não há identidades pendentes de revisão.</div>';
  modal('Revisar identidades Gemini',`<div class="notice">Somente sessões que não puderam ser vinculadas com segurança aparecem aqui. A decisão fica cifrada no catálogo clínico local.</div><div class="list mt-16">${body}</div>`,`<button class="btn secondary" data-action="close-modal">Fechar</button>`,true);
}
async function openPatientPicker(fileId){
  const patients=allPatients().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  const body=patients.length?patients.map(p=>`<button class="list-item" style="width:100%;text-align:left" data-action="rm-policy-save-link" data-file-id="${esc(fileId)}" data-patient-id="${esc(p.id)}"><span><strong>${esc(p.name||p.preferredName||'Paciente')}</strong><span class="tiny muted"> · ${esc(statusLabel(p))}</span></span></button>`).join(''):'<div class="notice warning">Nenhum paciente disponível no catálogo local.</div>';
  modal('Associar paciente',`<div class="small muted">Pacientes ativos, encerrados e arquivados podem ser vinculados.</div><div class="list mt-12">${body}</div>`,`<button class="btn secondary" data-action="gemini-review-hub-v270">Voltar</button>`,true);
}
async function saveManualLink(fileId,patientId){
  const catalog=await loadCatalog();patchCatalogSourceTimes(catalog);const item=catalog.items?.[fileId]||{};const patient=patientByLocalId(patientId);if(!patient)throw new Error('Paciente não localizado.');
  const auth=await loadWorkspaceAuthorization([DRIVE_READONLY_SCOPE]);if(!auth.ok)throw new Error('Google Drive clínico não autorizado.');const parsed=parseGmraw(item.name||'');
  const rule={fileId,patientMatch:{type:'exact',value:patient.name||patient.preferredName},date:item.meetingDate||parsed?.date||'',scheduledTime:item.meetingTime||parsed?.time||'',sourceTime:item.rawTime||parsed?.time||item.meetingTime||''};if(!rule.date||!rule.sourceTime)throw new Error('Data/hora da sessão não pôde ser determinada.');
  await materializeRule(rule,catalog,auth.token,{patientIdOverride:patientId});await saveCatalog(catalog);closeModal();window.__rmRender?.();toast('Sessão associada ao prontuário.','success');
}
async function dismissManual(fileId){const catalog=await loadCatalog();await purgeExclusion(fileId);delete catalog.manualLinks[fileId];catalog.exclusions[fileId]={kind:'manual-nonclinical',reason:'manual-review',at:nowISO()};catalog.items[fileId]={...(catalog.items[fileId]||{}),fileId,status:'dismissed',reason:'Retirado manualmente do domínio clínico.',updatedAt:nowISO()};await saveCatalog(catalog);closeModal();window.__rmRender?.();toast('Item retirado da plataforma clínica.','success')}

function ensureStyles(){
  if(document.getElementById('rm-patient-ux-v240-style'))return;
  const s=document.createElement('style');s.id='rm-patient-ux-v240-style';s.textContent=`body.rm-patient-focused #patient-grid,body.rm-patient-focused #main-content>.toolbar{display:none!important}body.rm-patient-focused #patient-workspace{margin-top:0!important}body.rm-patient-focused #patient-workspace>.tabs{display:none!important}body.rm-patient-focused .patient-nav-groups-v240,body.rm-patient-focused #rm-v3-context-nav{display:none!important}.rm-unified-patient-nav-v320{display:flex;gap:8px;overflow-x:auto;padding:4px 0 12px;scrollbar-width:thin}.rm-unified-patient-nav-v320 .tab{white-space:nowrap;flex:0 0 auto}.patient-context [data-action="patient-tab"][data-tab="records"]{display:none!important}.rm-next-appointment-v240{display:flex;justify-content:space-between;gap:16px;align-items:center}@media(max-width:700px){.rm-next-appointment-v240{align-items:flex-start;flex-direction:column}.patient-context .flex{width:100%}.patient-context .flex .btn{flex:1 1 auto}.rm-unified-patient-nav-v320{padding-bottom:10px}}`;document.head.appendChild(s)
}
function ensurePatientActions(){
  if(runtime.route!=='patients')return;const p=selectedPatient();if(!p)return;const actions=document.querySelector('.patient-context .flex');if(!actions)return;
  actions.querySelectorAll('[data-action="patient-tab"][data-tab="records"]').forEach(b=>b.remove());
  if(!actions.querySelector('[data-action="gemini-ai-hub-v240"]')){const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.action='gemini-ai-hub-v240';b.textContent='Preparar/revisar rascunho';actions.prepend(b)}
}
function ensureUnifiedNav(){
  if(runtime.route!=='patients'||!selectedPatient())return;const workspace=document.getElementById('patient-workspace'),tabs=workspace?.querySelector(':scope > .tabs');if(!workspace||!tabs)return;
  let nav=workspace.querySelector(':scope > .rm-unified-patient-nav-v320');if(!nav){nav=document.createElement('nav');nav.className='rm-unified-patient-nav-v320';nav.setAttribute('aria-label','Áreas do paciente');tabs.insertAdjacentElement('beforebegin',nav)}
  const current=runtime.patientTab||'summary';nav.innerHTML=NAV.map(([id,label])=>`<button type="button" class="tab ${id===current?'active':''}" data-action="patient-tab" data-tab="${id}">${esc(label)}</button>`).join('');
}
function ensureNextAppointment(){
  if(runtime.route!=='today')return;const main=document.getElementById('main-content'),head=main?.querySelector('.page-head');if(!main||!head||document.getElementById('rm-next-appointment-v240'))return;
  const upcoming=arr(data.appointments).filter(a=>a?.date>=todayISO()&&a.status!=='Cancelada'&&a.attendanceStatus!=='Desmarcou').sort((a,b)=>(String(a.date)+String(a.time||'')).localeCompare(String(b.date)+String(b.time||''))),a=upcoming[0];if(!a)return;
  const p=patientById(a.patientId),card=document.createElement('section');card.id='rm-next-appointment-v240';card.className='card rm-next-appointment-v240';card.innerHTML=`<div><div class="eyebrow">Próxima sessão</div><h3 class="mb-0" data-sensitive>${esc(firstName(p))} · ${esc(a.time||'—')}</h3><div class="small muted">${esc(fmtDate(a.date))} · ${esc(a.modality||'')}</div></div><button class="btn" data-action="appointment-manage" data-id="${esc(a.id)}">Gerenciar sessão</button>`;head.insertAdjacentElement('afterend',card)
}
function simplifySessionFlow(){
  if(runtime.route!=='patients'||runtime.patientTab!=='atendimento')return;const content=document.getElementById('patient-tab-content');if(!content)return;
  const stepper=content.querySelector('.stepper');if(stepper&&!stepper.dataset.rmSimplified){stepper.dataset.rmSimplified='1';const flow=[['Preparação','atendimento'],['Sessão','atendimento'],['Registro','records'],['Plano e encaminhamentos','plans'],['Continuidade','timeline']];stepper.innerHTML=flow.map(([label,tab],i)=>`<button class="step ${i===0?'active':''}" data-action="patient-tab" data-tab="${tab}">${i+1}. ${esc(label)}</button>`).join('')}
  const p=selectedPatient();const priority=content.querySelector('#session-professional-agenda');if(p&&priority&&!priority.value.trim()){priority.value=arr(data.goals).filter(g=>g?.patientId===p.id&&g.status!=='Alcançado').slice(0,4).map(g=>g.title).filter(Boolean).join('\n')}
  const conclusion=[...content.querySelectorAll('h3')].find(h=>/Conclusão do fluxo/i.test(h.textContent||''));if(conclusion)conclusion.textContent='Continuidade';content.querySelectorAll('[data-action="patient-tab"][data-tab="finance"]').forEach(b=>b.remove())
}
function decorate(){clearTimeout(decorateTimer);ensureStyles();applyFocusClass();ensurePatientActions();ensureUnifiedNav();ensureNextAppointment();simplifySessionFlow()}
function scheduleDecorate(delay=0){clearTimeout(decorateTimer);decorateTimer=setTimeout(decorate,delay)}

document.addEventListener('click',event=>{
  const select=event.target.closest?.('[data-action="select-patient"]');if(select){document.body.classList.add('rm-patient-focused');return}
  const choose=event.target.closest?.('[data-action="choose-patient"]');if(choose){document.body.classList.remove('rm-patient-focused');return}
});
window.addEventListener('click',event=>{
  const el=event.target.closest?.('[data-action]');if(!el)return;const action=el.dataset.action;
  if(action==='gemini-review-hub-v270'){event.preventDefault();event.stopImmediatePropagation();void openReviewHub();return}
  if(action==='gemini-review-link-v270'||action==='rm-policy-link'){event.preventDefault();event.stopImmediatePropagation();void openPatientPicker(el.dataset.fileId||'');return}
  if(action==='rm-policy-save-link'){event.preventDefault();event.stopImmediatePropagation();void saveManualLink(el.dataset.fileId||'',el.dataset.patientId||'').catch(err=>toast(err.message,'error'));return}
  if(action==='rm-policy-dismiss'){event.preventDefault();event.stopImmediatePropagation();void dismissManual(el.dataset.fileId||'').catch(err=>toast(err.message,'error'));return}
  if(action==='gemini-reconcile-v270'){event.preventDefault();event.stopImmediatePropagation();void(async()=>{await reconcileGemini({force:true,quiet:true,reason:'manual-v280'});await runPolicy({quiet:false})})()}
},true);
document.addEventListener('rm:rendered',()=>scheduleDecorate());
document.addEventListener('rm:app-ready',()=>scheduleDecorate(80));
document.addEventListener('rm:data-ready',()=>{scheduleDecorate(80);queuePolicy(500,{quiet:true})});
document.addEventListener('rm:sync-status',e=>{if(['synced','connected','ok'].includes(e.detail?.status))queuePolicy(900,{quiet:true})});
document.addEventListener('rm:local-data-changed',e=>{if(e.detail?.kind==='gemini-materialize-v270')queuePolicy(120,{quiet:true})});
ensureStyles();if(runtime.dataReady&&!runtime.locked)queuePolicy(500,{quiet:true});

window.__rmClinicalAuditPolicy={version:POLICY_VERSION,run:runPolicy,uxVersion:UX_VERSION};
