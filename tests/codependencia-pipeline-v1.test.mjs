import assert from 'node:assert/strict';
import fs from 'node:fs';

const provisioner = fs.readFileSync('rastreios/pipeline/apps-script/CodependenciaProvisioner.gs','utf8');
const webapp = fs.readFileSync('rastreios/pipeline/apps-script/CodependenciaWebApp.gs','utf8');
const core = fs.readFileSync('rastreios/pipeline/apps-script/Code.gs','utf8');

assert.match(provisioner,/function\s+provisionCodependenciaFormV1\s*\(/);
assert.match(provisioner,/form\.setAcceptingResponses\(false\)/);
assert.match(provisioner,/scorer:\s*'raw_only'/);
assert.match(provisioner,/active:\s*false/);
assert.match(provisioner,/CODEPENDENCIA_FORM_ID/);
assert.match(provisioner,/_CONTRACT_Codependencia/);

assert.match(webapp,/function\s+doPost\s*\(/);
assert.match(webapp,/CODEPENDENCIA_GATEWAY_SECRET/);
assert.match(webapp,/authorizeCodependenciaGateway_/);
assert.match(webapp,/buildCodependenciaFormResponse_\([\s\S]*?\)\.submit\(\)/);
assert.doesNotMatch(webapp,/onScreeningFormSubmit\s*\(/);
for (const state of ['RECEIVED','FORM_SUBMITTING','FORM_SUBMITTED','EMAIL_SENDING','EMAIL_SENT','FORM_AMBIGUOUS','EMAIL_AMBIGUOUS']) {
  assert.ok(webapp.includes(`'${state}'`) || webapp.includes(`"${state}"`), `missing state ${state}`);
}
assert.match(webapp,/MailApp\.sendEmail/);
assert.match(webapp,/reportSent:\s*true/);
assert.match(webapp,/persisted:\s*true/);
assert.match(webapp,/scoreRawOnly_/);
assert.doesNotMatch(webapp,/score\s*<=\s*(?:39|59|79)/i);
assert.doesNotMatch(webapp,/whatsapp|wa\.me/i);
assert.doesNotMatch(webapp,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

assert.match(core,/const\s+REPORT_SUBJECT\s*=\s*'Novo relatório de rastreio clínico'/);
assert.match(core,/PropertiesService\.getScriptProperties\(\)\.getProperty\('REPORT_RECIPIENT'\)/);

console.log('CODEPENDENCIA_PIPELINE_V1_PASS');
