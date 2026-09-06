import fs from 'node:fs';
import assert from 'node:assert/strict';

const manifest=JSON.parse(fs.readFileSync('rastreios/pipeline/instruments.manifest.json','utf8'));
const experience=JSON.parse(fs.readFileSync('rastreios/pipeline/public-experience.json','utf8'));
const code=fs.readFileSync('rastreios/pipeline/apps-script/Code.gs','utf8');
const contract=fs.readFileSync('rastreios/pipeline/forms-contract.md','utf8');
const seed=fs.readFileSync('rastreios/pipeline/RastreiosConfig.seed.tsv','utf8');
const ui=fs.readFileSync('assets/js/clinical-screenings-v400.js','utf8');
const css=fs.readFileSync('assets/css/clinical-screenings-v400.css','utf8');
const uniformity=fs.readFileSync('assets/js/screening-uniformity-v1.js','utf8');
const uniformityCss=fs.readFileSync('assets/css/screening-uniformity-v1.css','utf8');

assert.doesNotThrow(()=>new Function(code),'Apps Script source must remain syntactically valid JavaScript');
assert.doesNotThrow(()=>new Function(ui),'screenings UI source must remain syntactically valid JavaScript');
assert.doesNotThrow(()=>new Function(uniformity),'uniformity runtime must remain syntactically valid JavaScript');
assert.equal(manifest.instruments.length,15,'canonical screening inventory must contain 15 instruments');
const ids=manifest.instruments.map(x=>x.id);
assert.equal(new Set(ids).size,15,'instrument ids must be unique');
for(const id of ['geral','tdah','bipolar','borderline','narcisismo','impulsividade','esquemas','modos','necessidades','codependencia','icaps','risco','humor','ansiedade','autoestima'])assert.ok(ids.includes(id),`missing canonical instrument: ${id}`);
for(const item of manifest.instruments){
  assert.ok(item.description?.trim(),`${item.id} must have a canonical public description`);
  assert.match(item.publicUrl||'',/^https:\/\//,`${item.id} publicUrl must be absolute https`);
  assert.doesNotMatch(item.publicUrl||'',/docs\.google\.com\/forms/i,`${item.id} must never expose a Forms URL as publicUrl`);
}
assert.equal(manifest.instruments.filter(x=>x.formState==='ACTIVE').length,3,'only the three existing monitoring collectors may be marked active before migration');
assert.equal(manifest.instruments.filter(x=>x.formState==='CREATE_REQUIRED').length,12,'twelve collectors must remain explicitly pending creation');
assert.equal(manifest.instruments.filter(x=>x.presentationMode==='BRANDED_HOST_PAGE').length,3,'three catalog screenings must use branded host pages');
for(const id of ['humor','ansiedade','autoestima']){
  const item=manifest.instruments.find(x=>x.id===id);
  assert.equal(item?.presentationMode,'BRANDED_HOST_PAGE',`${id} must use the branded host page`);
  assert.match(item?.publicUrl||'',/Inicio-de-Jornada-Terapeutica\/monitoramento\.html\?instrument=/,`${id} public URL must resolve to branded Jornada host`);
  assert.equal(item?.hostPage,item?.publicUrl,`${id} hostPage and publicUrl must remain aligned`);
  assert.match(item?.formUrl||'',/docs\.google\.com\/forms/i,`${id} internal collector metadata must remain traceable`);
}
assert.equal(manifest.supportInterfaces?.length,1,'the non-screening control collector must be tracked as a support interface');
assert.equal(manifest.supportInterfaces?.[0]?.id,'controle-atendimento','control support interface missing');
assert.equal(manifest.supportInterfaces?.[0]?.catalogScope,'SUPPORT_NOT_SCREENING','control support interface must not inflate the 15-screening inventory');
assert.equal(manifest.supportInterfaces?.[0]?.presentationMode,'BRANDED_HOST_PAGE','control support interface must use branded host UI');
assert.doesNotMatch(manifest.supportInterfaces?.[0]?.publicUrl||'',/docs\.google\.com\/forms/i,'control public URL must not expose Forms');
assert.match(manifest.presentationPolicy,/native interface, branding and direct response URLs must never be the patient-facing experience/i,'branded-host presentation policy missing');
assert.match(manifest.experiencePolicy,/ICAPS-derived design system/i,'ICAPS-derived experience policy missing');
assert.match(manifest.experiencePolicy,/Nome completo, Data de nascimento and Data de aplicação do rastreio/i,'mandatory identity contract missing');
const risk=manifest.instruments.find(x=>x.id==='risco');
assert.equal(risk?.criticality,'CRITICAL','suicide-risk screening must remain critical');
assert.equal(risk?.requiresDedicatedSafetyFlow,true,'suicide-risk screening must require dedicated safety flow');
assert.match(manifest.storagePolicy,/No clinical response data/i,'manifest must prohibit clinical response storage in GitHub');

assert.equal(experience.designReference,'ICAPS','public experience must explicitly derive from ICAPS');
assert.equal(Object.keys(experience.instruments||{}).length,15,'public experience must cover all 15 instruments');
assert.deepEqual(experience.rules?.requiredIdentityFields,['Nome completo','Data de nascimento','Data de aplicação do rastreio'],'identity fields must remain canonical');
assert.match(experience.rules?.successMessage||'',/concluído com sucesso/i,'success copy missing');
assert.match(experience.rules?.successMessage||'',/enviadas? ao psicólogo/i,'success copy must confirm professional delivery only after real confirmation');
for(const id of ids){
  const item=experience.instruments[id];
  assert.ok(item,`public experience missing: ${id}`);
  for(const key of ['publicName','technicalLabel','eyebrow','story','intro','image'])assert.ok(String(item[key]||'').trim(),`${id}.${key} missing`);
  assert.equal(item.onboarding?.length,3,`${id} onboarding must have exactly three steps`);
  assert.ok(experience.images[item.image]?.url,`${id} image key must resolve`);
}
assert.equal(experience.rules?.doNotChangeItems,true,'question mutation guard must remain explicit');
assert.equal(experience.rules?.doNotChangeResponseLogic,true,'response-logic mutation guard must remain explicit');

assert.match(ui,/MANIFEST_URL='rastreios\/pipeline\/instruments\.manifest\.json/, 'UI must load canonical manifest');
assert.doesNotMatch(ui,/const\s+SCREENINGS\s*=\s*\[/,'UI must not duplicate the canonical screening catalog');
assert.doesNotMatch(ui,/docs\.google\.com\/forms/i,'UI source must not contain public Forms endpoints');
assert.doesNotMatch(ui,/Google Forms|Forms ativo|Com Forms|Forms\/Sheets/i,'UI copy must not expose collection-engine terminology');
assert.match(ui,/Motor de coleta exposto como URL pública/,'runtime must fail closed if publicUrl regresses to Forms');
assert.match(ui,/screening-result-status/,'filter results must be announced accessibly');
assert.match(ui,/Abrir rastreio/,'primary action must be explicit');
assert.match(ui,/Compartilhar/,'secondary share action must remain available');

assert.match(css,/min-height:44px/,'interactive screening controls must retain touch-friendly targets');
assert.match(css,/font-size:\.8rem/,'screening chips must not regress to undersized text');
assert.match(css,/prefers-reduced-motion:reduce/,'reduced-motion support missing');
assert.match(css,/screening-chip\.ok::before/,'semantic state must not depend on low-contrast text color alone');
assert.match(uniformity,/public-experience\.json/,'uniformity runtime must consume canonical public-experience config');
assert.match(uniformity,/rm-full-name/,'full name field missing from uniformity runtime');
assert.match(uniformity,/rm-birth-date/,'birth date field missing from uniformity runtime');
assert.match(uniformity,/rm-application-date/,'application date field missing from uniformity runtime');
assert.match(uniformity,/rm:screening-delivery-confirmed/,'delivery confirmation must be event-driven');
assert.doesNotMatch(uniformity,/localStorage|sessionStorage|indexedDB/i,'uniformity layer must not persist patient metadata in browser storage');
assert.match(uniformityCss,/min-height:44px/,'uniformity interactive fields must be touch friendly');
assert.match(uniformityCss,/prefers-reduced-motion:reduce/,'uniformity CSS must respect reduced motion');
assert.match(uniformityCss,/grid-template-columns:1\.4fr 1fr 1fr/,'desktop identity grid missing');
assert.match(uniformityCss,/\.rm-standard-banner/,'canonical banner styling missing');

assert.ok(code.includes("REPORT_SUBJECT = 'Novo relatório de rastreio clínico'"),'email subject must remain generic and minimally sensitive');
assert.ok(code.includes("getProperty('REPORT_RECIPIENT')"),'report recipient must come from Script Properties');
assert.ok(code.includes("if (currentStatus === 'SENT') return"),'sent-report duplicate guard missing');
assert.ok(code.includes("currentStatus === 'SENDING'"),'ambiguous-delivery guard missing');
assert.ok(code.includes('AMBIGUOUS_DELIVERY_STATE_MANUAL_REVIEW_REQUIRED'),'ambiguous delivery must fail closed');
assert.ok(code.includes("__report_status: 'SENDING'"),'status must be persisted before email dispatch');
assert.ok(code.includes('SpreadsheetApp.flush()'),'pre-send state must be flushed before email dispatch');
assert.ok(code.includes('LockService.getDocumentLock()'),'document lock missing');
assert.ok(code.includes("state: 'SCORER_PENDING'"),'unvalidated scorers must fail safe');
assert.ok(code.includes("DUPLICATE_QUESTION_HEADER"),'ambiguous duplicate source headers must fail closed');
assert.ok(code.includes('Este relatório organiza dados de rastreio e não estabelece diagnóstico.'),'non-diagnostic report disclaimer missing');
assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(code),'Apps Script must not publish a recipient email address');
assert.ok(!/console\.(log|debug)\(/.test(code),'Apps Script must not log response payloads');

assert.ok(contract.includes('ATIVO → ESPELHADO → VALIDADO → REDIRECIONADO → ARQUIVADO → EXCLUÍVEL'),'migration state contract missing');
assert.ok(contract.includes('GitHub nunca persiste respostas clínicas'),'public-repo clinical storage rule missing');
assert.ok(contract.includes('títulos de perguntas devem ser únicos'),'unique source header contract missing');
assert.ok(contract.includes('permanecer inativo até'),'unvalidated activation rule missing');
assert.match(contract,/publicUrl` nunca pode apontar para `docs\.google\.com\/forms/,'public-interface anti-regression contract missing');
assert.match(contract,/iframe` visível/,'visible iframe prohibition missing');

const seedLines=seed.split(/\r?\n/).filter(Boolean);
assert.equal(seedLines.length,16,'config seed must contain one header plus 15 instruments');
const seedRows=seedLines.slice(1).map(line=>line.split('\t'));
assert.equal(seedRows.filter(row=>row[6]==='TRUE').length,3,'only three existing collectors may be active in config seed');
assert.equal(seedRows.filter(row=>row[5]==='pending'&&row[6]==='FALSE').length,12,'all pending scorers must remain inactive');
assert.doesNotMatch(seed,/Google Forms/,'operational config must use neutral technical terminology');
const riskSeed=seedRows.find(row=>row[1]==='risco');
assert.equal(riskSeed?.[6],'FALSE','risk flow must stay inactive until dedicated validation');
assert.equal(riskSeed?.[7],'TRUE','risk flow must retain dedicated safety flag');

console.log('SCREENINGS_PIPELINE_V430_PASS');
