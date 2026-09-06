import fs from 'node:fs';
import assert from 'node:assert/strict';

const manifest=JSON.parse(fs.readFileSync('rastreios/pipeline/instruments.manifest.json','utf8'));
const code=fs.readFileSync('rastreios/pipeline/apps-script/Code.gs','utf8');
const contract=fs.readFileSync('rastreios/pipeline/forms-contract.md','utf8');
const seed=fs.readFileSync('rastreios/pipeline/RastreiosConfig.seed.tsv','utf8');

assert.equal(manifest.instruments.length,15,'canonical screening inventory must contain 15 instruments');
const ids=manifest.instruments.map(x=>x.id);
assert.equal(new Set(ids).size,15,'instrument ids must be unique');
for(const id of ['geral','tdah','bipolar','borderline','narcisismo','impulsividade','esquemas','modos','necessidades','codependencia','icaps','risco','humor','ansiedade','autoestima'])assert.ok(ids.includes(id),`missing canonical instrument: ${id}`);
assert.equal(manifest.instruments.filter(x=>x.formState==='ACTIVE').length,3,'only the three existing monitoring Forms may be marked active before migration');
assert.equal(manifest.instruments.filter(x=>x.formState==='CREATE_REQUIRED').length,12,'twelve Forms must remain explicitly pending creation');
const risk=manifest.instruments.find(x=>x.id==='risco');
assert.equal(risk?.criticality,'CRITICAL','suicide-risk screening must remain critical');
assert.equal(risk?.requiresDedicatedSafetyFlow,true,'suicide-risk screening must require dedicated safety flow');
assert.match(manifest.storagePolicy,/No clinical response data/i,'manifest must prohibit clinical response storage in GitHub');

assert.ok(code.includes("REPORT_SUBJECT = 'Novo relatório de rastreio clínico'"),'email subject must remain generic and minimally sensitive');
assert.ok(code.includes("getProperty('REPORT_RECIPIENT')"),'report recipient must come from Script Properties');
assert.ok(code.includes("if (currentStatus === 'SENT') return"),'duplicate email guard missing');
assert.ok(code.includes('LockService.getDocumentLock()'),'document lock missing');
assert.ok(code.includes("state: 'SCORER_PENDING'"),'unvalidated scorers must fail safe');
assert.ok(code.includes("DUPLICATE_QUESTION_HEADER"),'ambiguous duplicate Form headers must fail closed');
assert.ok(code.includes('Este relatório organiza dados de rastreio e não estabelece diagnóstico.'),'non-diagnostic report disclaimer missing');
assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(code),'Apps Script must not publish a recipient email address');
assert.ok(!/console\.(log|debug)\(/.test(code),'Apps Script must not log response payloads');

assert.ok(contract.includes('ATIVO → ESPELHADO → VALIDADO → REDIRECIONADO → ARQUIVADO → EXCLUÍVEL'),'migration state contract missing');
assert.ok(contract.includes('GitHub nunca persiste respostas clínicas'),'public-repo clinical storage rule missing');
assert.ok(contract.includes('títulos de perguntas devem ser únicos'),'unique Form header contract missing');
assert.ok(contract.includes('permanecer inativo até'),'unvalidated activation rule missing');

const seedLines=seed.split(/\r?\n/).filter(Boolean);
assert.equal(seedLines.length,16,'config seed must contain one header plus 15 instruments');
const seedRows=seedLines.slice(1).map(line=>line.split('\t'));
assert.equal(seedRows.filter(row=>row[6]==='TRUE').length,3,'only three existing Forms may be active in config seed');
assert.equal(seedRows.filter(row=>row[5]==='pending'&&row[6]==='FALSE').length,12,'all pending scorers must remain inactive');

console.log('SCREENINGS_PIPELINE_V410_PASS');
