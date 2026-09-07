import fs from 'node:fs';
import assert from 'node:assert/strict';

const manifest=JSON.parse(fs.readFileSync('rastreios/pipeline/instruments.manifest.json','utf8'));
const experience=JSON.parse(fs.readFileSync('rastreios/pipeline/public-experience-v2.json','utf8'));
const adapters=JSON.parse(fs.readFileSync('rastreios/pipeline/screening-adapters-v2.json','utf8'));
const code=fs.readFileSync('rastreios/pipeline/apps-script/Code.gs','utf8');
const contract=fs.readFileSync('rastreios/pipeline/forms-contract.md','utf8');
const seed=fs.readFileSync('rastreios/pipeline/RastreiosConfig.seed.tsv','utf8');
const ui=fs.readFileSync('assets/js/clinical-screenings-v400.js','utf8');
const runtime=fs.readFileSync('assets/js/screening-system-v2.js','utf8');
const css=fs.readFileSync('assets/css/screening-system-v2.css','utf8');
const compatibility=fs.readFileSync('assets/js/screening-uniformity-v1.js','utf8');

assert.doesNotThrow(()=>new Function(code),'Apps Script source must remain syntactically valid JavaScript');
assert.doesNotThrow(()=>new Function(ui),'screenings UI source must remain syntactically valid JavaScript');
assert.doesNotThrow(()=>new Function(runtime),'v2 screening runtime must remain syntactically valid JavaScript');
assert.doesNotThrow(()=>new Function(compatibility),'compatibility loader must remain syntactically valid JavaScript');

assert.equal(manifest.schemaVersion,'2.1.0','canonical manifest must use v2.1 schema');
assert.equal(manifest.instruments.length,15,'canonical screening inventory must contain 15 instruments');
const ids=manifest.instruments.map(x=>x.id);
assert.equal(new Set(ids).size,15,'instrument ids must be unique');
for(const id of ['geral','tdah','bipolar','borderline','narcisismo','impulsividade','esquemas','modos','necessidades','codependencia','icaps','risco','humor','ansiedade','autoestima'])assert.ok(ids.includes(id),`missing canonical instrument: ${id}`);
for(const item of manifest.instruments){
  assert.ok(item.publicName?.trim(),`${item.id} must have a patient-facing neutral name`);
  assert.match(item.publicUrl||'',/^https:\/\//,`${item.id} publicUrl must be absolute https`);
  assert.doesNotMatch(item.publicUrl||'',/docs\.google\.com\/forms/i,`${item.id} must never expose Forms as publicUrl`);
  assert.equal(item.productionReady,false,`${item.id} must fail closed until full certification`);
  assert.ok(item.scorerState,`${item.id} must expose scorer validation state`);
  assert.ok(item.contractState,`${item.id} must expose integration contract state`);
}
assert.equal(manifest.instruments.filter(x=>x.formState==='ACTIVE').length,3,'only three existing monitoring Forms are currently active collectors');
assert.equal(manifest.instruments.filter(x=>x.formState==='CREATE_REQUIRED').length,12,'twelve exact Forms still require creation');
assert.match(manifest.storagePolicy,/browser storage/i,'clinical answers must be prohibited from browser persistence');
assert.match(manifest.deliveryPolicy,/only to the configured professional email/i,'clinical report delivery must be email-only');
assert.match(manifest.deliveryPolicy,/No clinical result is sent by WhatsApp/i,'WhatsApp clinical-result prohibition missing');
assert.match(manifest.deliveryPolicy,/Trello and ChatGPT/i,'post-delivery operational notification contract missing');
assert.match(manifest.experiencePolicy,/screening_canonical/i,'screening identity profile missing from manifest policy');
assert.match(manifest.experiencePolicy,/monitoring_longitudinal/i,'monitoring identity profile missing from manifest policy');
assert.deepEqual(manifest.identityProfiles?.screening_canonical?.required,['Nome completo','Data de nascimento','Data de aplicação do rastreio'],'canonical screening identity contract missing');
assert.deepEqual(manifest.identityProfiles?.monitoring_longitudinal?.required,['Nome completo'],'longitudinal monitoring identity contract missing');

const monitoringIds=new Set(['humor','ansiedade','autoestima']);
for(const item of manifest.instruments){
  const expected=monitoringIds.has(item.id)?'monitoring_longitudinal':'screening_canonical';
  assert.equal(item.identityProfile,expected,`${item.id} identity profile drift`);
  assert.equal(adapters.instruments[item.id]?.identityProfile,expected,`${item.id} adapter identity profile drift`);
}

const risk=manifest.instruments.find(x=>x.id==='risco');
assert.equal(risk?.criticality,'CRITICAL','suicide-risk screening must remain critical');
assert.equal(risk?.requiresDedicatedSafetyFlow,true,'suicide-risk screening must require dedicated safety flow');
assert.equal(risk?.productionReady,false,'suicide-risk flow must remain blocked');
assert.equal(adapters.instruments.risco?.submissionSupported,false,'suicide-risk submission must remain disabled');
const icaps=manifest.instruments.find(x=>x.id==='icaps');
assert.equal(icaps?.instrumentVersion,'2.0.0','ICAPS instrument version drift');
assert.equal(icaps?.scoringVersion,'2.1.0','ICAPS scoring version drift');
assert.equal(icaps?.scorerState,'DESCRIPTIVE_NON_PSYCHOMETRIC','ICAPS scoring must not be mislabeled as psychometric cutoffs');
assert.equal(icaps?.contractState,'BACKEND_ROUTE_INTEGRATED_UPSTREAM_REQUIRED','ICAPS must remain blocked until the persistent upstream is configured and certified');
const needs=manifest.instruments.find(x=>x.id==='necessidades');
assert.equal(needs?.contractState,'SANITIZED_REVALIDATION_REQUIRED','needs-screening source sanitization must remain traceable until recertified');

assert.equal(experience.schemaVersion,'2.1.0','public experience must use v2.1 schema');
assert.equal(experience.designSystem,'RM Clinical Screening System v2','v2 design system reference missing');
const codependencia=manifest.instruments.find(x=>x.id==='codependencia');
assert.equal(codependencia?.contractState,'COLLECTOR_SPEC_PREPARED_DEPLOYMENT_REQUIRED','Codependência collector spec must remain deployment-blocked');
assert.equal(experience.instruments.icaps?.collectorReady,false,'ICAPS collector must remain unavailable until the upstream persistence path is ready');
assert.equal(experience.instruments.icaps?.scorerValidated,false,'ICAPS descriptive scoring must not be labeled psychometrically validated');
assert.equal(experience.technicalLabelsInternalOnly,true,'technical labels must remain internal-only');
assert.equal(experience.patientResultPolicy,'NO_SCORES_OR_DIAGNOSTIC_INTERPRETATION','patient result suppression policy missing');
assert.equal(experience.identity?.defaultProfile,'screening_canonical','default identity profile drift');
assert.deepEqual(experience.identity?.profiles?.screening_canonical?.required,['Nome completo','Data de nascimento','Data de aplicação do rastreio'],'screening identity fields must remain canonical');
assert.deepEqual(experience.identity?.profiles?.monitoring_longitudinal?.required,['Nome completo'],'monitoring identity must not invent non-persistent fields');
assert.match(JSON.stringify(experience.identity?.profiles?.monitoring_longitudinal||{}),/Data de nascimento enquanto o coletor ativo não possuir campo persistente explícito/i,'monitoring birth-date non-collection policy missing');
assert.match(experience.completion?.title||'',/concluído com sucesso/i,'success title missing');
assert.match(experience.completion?.message||'',/análise clínica do psicólogo responsável/i,'success copy missing');
assert.equal(Object.keys(experience.instruments||{}).length,15,'public experience must cover all 15 instruments');
for(const id of ids){
  const item=experience.instruments[id];
  assert.ok(item,`public experience missing: ${id}`);
  for(const key of ['publicName','eyebrow','story','intro'])assert.ok(String(item[key]||'').trim(),`${id}.${key} missing`);
  assert.equal(item.onboarding?.length,3,`${id} onboarding must have exactly three steps`);
  assert.equal(item.productionReady,false,`${id} public experience must fail closed before certification`);
  const expected=monitoringIds.has(id)?'monitoring_longitudinal':'screening_canonical';
  assert.equal(item.identityProfile,expected,`${id} public experience identity profile drift`);
}
assert.doesNotMatch(JSON.stringify(experience.instruments),/technicalLabel/i,'technical labels must not be patient-facing config fields');

assert.match(runtime,/productionReady===true/,'only certified instruments may submit');
assert.match(runtime,/addEventListener\('submit'/,'submit capture fail-closed guard missing');
assert.match(runtime,/Data de nascimento/,'birth date field missing from v2 runtime');
assert.match(runtime,/Data de aplicação do rastreio/,'application date field missing from v2 runtime');
assert.match(runtime,/Rastreio concluído com sucesso/,'confirmed success UI missing');
assert.match(runtime,/confirmDelivery/,'delivery confirmation API missing');
assert.match(runtime,/removeSplash/,'splash removal missing');
assert.match(runtime,/removeWhatsApp/,'WhatsApp removal missing');
assert.match(runtime,/TECH_LABEL/,'patient technical-label neutralization missing');
assert.doesNotMatch(runtime,/localStorage|sessionStorage|indexedDB/i,'v2 runtime must not persist patient data in browser storage');
assert.match(runtime,/identityProfile==='monitoring_longitudinal'/,'monitoring identity branch missing');
assert.match(runtime,/if\(!monitoring&&mount\.form\)/,'synthetic transport must be forbidden for monitorings');
assert.match(runtime,/rm_full_name/,'canonical identity transport field missing');
assert.match(runtime,/rm_birth_date/,'canonical birth transport field missing');
assert.match(runtime,/rm_application_date/,'canonical application-date transport field missing');
assert.match(compatibility,/screening-system-v2\.js/,'legacy runtime must route to v2');

assert.match(css,/min-height:44px/,'interactive controls must retain touch-friendly targets');
assert.match(css,/prefers-reduced-motion:reduce/,'reduced-motion support missing');
assert.match(css,/--rm-primary:/,'central brand token missing');
assert.match(css,/\.rm-screening-hero/,'canonical hero missing');
assert.match(css,/\.rm-onboarding/,'canonical onboarding missing');
assert.match(css,/\.rm-identity-grid/,'canonical identity layout missing');
assert.match(css,/\.rm-completion/,'canonical completion state missing');

assert.match(ui,/MANIFEST_URL='rastreios\/pipeline\/instruments\.manifest\.json/,'platform UI must load canonical manifest');
assert.doesNotMatch(ui,/docs\.google\.com\/forms/i,'platform UI source must not contain public Forms endpoints');
assert.match(ui,/Motor de coleta exposto como URL pública/,'platform UI must fail closed if publicUrl regresses to Forms');

assert.ok(code.includes("REPORT_SUBJECT = 'Novo relatório de rastreio clínico'"),'email subject must remain generic');
assert.ok(code.includes("getProperty('REPORT_RECIPIENT')"),'report recipient must come from Script Properties');
assert.ok(code.includes("if (currentStatus === 'SENT') return"),'sent-report duplicate guard missing');
assert.ok(code.includes("currentStatus === 'SENDING'"),'ambiguous-delivery guard missing');
assert.ok(code.includes('AMBIGUOUS_DELIVERY_STATE_MANUAL_REVIEW_REQUIRED'),'ambiguous delivery must fail closed');
assert.match(code,/__report_status\s*:\s*'SENDING'/,'status must be persisted before email dispatch');
assert.ok(code.includes('SpreadsheetApp.flush()'),'pre-send state must be flushed before email dispatch');
assert.ok(code.includes('LockService.getDocumentLock()'),'document lock missing');
assert.match(code,/state\s*:\s*'SCORER_PENDING'/,'unvalidated scorers must fail safe');
assert.ok(code.includes('DUPLICATE_QUESTION_HEADER'),'ambiguous duplicate source headers must fail closed');
assert.ok(code.includes('Este relatório organiza dados de rastreio e não estabelece diagnóstico.'),'non-diagnostic report disclaimer missing');
assert.match(code,/birthDate\s*:/,'HTML report must capture birth date when present');
assert.match(code,/applicationDate\s*:/,'HTML report must capture application date or timestamp');
assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(code),'Apps Script must not publish a recipient email address');
assert.ok(!/console\.(log|debug)\(/.test(code),'Apps Script must not log clinical payloads');

assert.ok(contract.includes('ATIVO → ESPELHADO → VALIDADO → REDIRECIONADO → ARQUIVADO → EXCLUÍVEL'),'migration state contract missing');
assert.ok(contract.includes('GitHub nunca persiste respostas clínicas'),'public-repo clinical storage rule missing');
assert.match(contract,/publicUrl` nunca pode apontar para `docs\.google\.com\/forms/,'public-interface anti-regression contract missing');
assert.match(contract,/iframe` visível/,'visible iframe prohibition missing');
assert.match(contract,/screening_canonical/,'forms contract missing screening identity profile');
assert.match(contract,/monitoring_longitudinal/,'forms contract missing monitoring identity profile');
assert.match(contract,/não é solicitada nem sintetizada/,'forms contract must prohibit synthetic monitoring birth date');

const seedLines=seed.split(/\r?\n/).filter(Boolean);
assert.equal(seedLines.length,16,'config seed must contain one header plus 15 instruments');
const seedRows=seedLines.slice(1).map(line=>line.split('\t'));
assert.equal(seedRows.filter(row=>row[6]==='TRUE').length,3,'only three legacy collectors may remain active in current seed');
assert.equal(seedRows.filter(row=>row[6]==='FALSE').length,12,'all twelve non-monitoring instruments must remain inactive');
const impulseSeed=seedRows.find(row=>row[1]==='impulsividade');
assert.equal(impulseSeed?.[5],'blocked_scoring_defect','impulsivity seed must preserve the confirmed scoring blocker');
const icapsSeed=seedRows.find(row=>row[1]==='icaps');
assert.equal(icapsSeed?.[2],'2.0.0','ICAPS seed must use the instrument version, not the scoring version');
assert.equal(icapsSeed?.[5],'descriptive_non_psychometric','ICAPS seed must preserve descriptive non-psychometric scoring status');
const riskSeed=seedRows.find(row=>row[1]==='risco');
assert.equal(riskSeed?.[6],'FALSE','risk flow must stay inactive');
assert.equal(riskSeed?.[7],'TRUE','risk flow must retain dedicated safety flag');

console.log('SCREENINGS_PIPELINE_V520_PASS');
