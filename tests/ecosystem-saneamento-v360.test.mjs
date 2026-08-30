import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(path,'utf8');
const version=read('assets/js/version.js').match(/APP_VERSION='([^']+)'/)?.[1];
assert.equal(version,'3.6.0','APP_VERSION must remain the canonical 3.6.0 release during sanitation');

const index=read('index.html');
const main=read('assets/js/main-v250.js');
const readme=read('README.md');
const workspace=read('assets/js/patient-workspace-v320.js');
const token=read('assets/js/google-workspace-token-v260.js');
const whatsapp=read('assets/js/clinical-whatsapp-bridge-v300.js');

assert.ok(index.includes(`content="${version}-main-v250"`),'index build marker must match APP_VERSION');
assert.ok(main.includes(`__rmEntrypointVersion='${version}-main-v250'`),'main entrypoint must match APP_VERSION');
assert.ok(readme.includes(`— v${version}`),'README title must match APP_VERSION');
assert.ok(readme.includes(`build \`${version}-main-v250\``),'README build must match APP_VERSION');
assert.ok(!readme.includes('build `2.5.2`'),'README must not retain stale build markers');
assert.ok(readme.includes('clinical-reconcile-v270.js'),'README must name the canonical Gemini reconciliation runtime');

const primaryBlock=workspace.match(/const PRIMARY_NAV=\[([\s\S]*?)\];/)?.[1]||'';
const moreBlock=workspace.match(/const MORE_NAV=\[([\s\S]*?)\];/)?.[1]||'';
const primaryCount=(primaryBlock.match(/\['/g)||[]).length;
assert.ok(primaryCount>0&&primaryCount<=6,`patient workspace must expose at most six primary areas, found ${primaryCount}`);
for(const id of ['summary','timeline','atendimento','records','plans','finance'])assert.ok(primaryBlock.includes(`['${id}'`),`primary patient area missing: ${id}`);
for(const id of ['intake','notes','formulation','tasks','materials','documents','communications','consents'])assert.ok(moreBlock.includes(`['${id}'`),`secondary patient area missing: ${id}`);
assert.ok(workspace.includes('Mais ·'),'secondary navigation must expose active context through Mais');

for(const scope of [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
])assert.ok(token.includes(scope),`required Workspace scope missing: ${scope}`);
assert.ok(token.includes('WORKSPACE_FULL_SCOPES'),'optional Gmail send scope must remain separated from required scopes');

for(const invariant of [
  "classification:'ADMINISTRATIVE'",
  'approved:true',
  'approval_id:approvalId',
  'rmPatientPhoneSha256:phoneHash',
  'rmClinicalBridgeNonce:a.whatsappBridgeNonce',
])assert.ok(whatsapp.includes(invariant),`clinical WhatsApp invariant missing: ${invariant}`);
assert.ok(!/console\.(log|debug)\([^\n]*(phone|recipient|text|patient)/i.test(whatsapp),'clinical WhatsApp bridge must not log patient/recipient/message payloads');
assert.ok(index.includes('https://secretaria-digital-core.vercel.app'),'CSP must explicitly allow the governed Secretary Core origin');
assert.ok(!index.includes("connect-src *"),'CSP connect-src must not use a wildcard');

console.log('ECOSYSTEM_SANEAMENTO_V360_PASS');
