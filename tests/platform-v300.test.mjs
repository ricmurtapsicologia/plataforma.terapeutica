import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('assets/js/main-v250.js');
const bootstrap=read('assets/js/bootstrap-v240.js');
const manifest=read('assets/js/core/clinical-runtime-manifest-v376.mjs');
const platform=read('assets/js/platform-runtime-v300.js');
const calendar=read('assets/js/calendar-adapter-v300.js');
const migrations=read('assets/js/migration-router-v300.js');
const index=read('index.html');
const version=read('assets/js/version.js');
const match=version.match(/APP_VERSION='([^']+)'/);
assert.ok(match,'APP_VERSION must be declared');
const APP_VERSION=match[1];

assert.match(APP_VERSION,/^\d+\.\d+\.\d+$/,'APP_VERSION must use semver');
assert.ok(index.includes(`${APP_VERSION}-main-v250`),'index architecture marker must match APP_VERSION');
assert.ok(index.includes(`main-v250.js?v=${APP_VERSION}`),'index must load the current entrypoint cache');
assert.ok(main.includes(`__rmEntrypointVersion='${APP_VERSION}-main-v250'`),'entrypoint marker must match APP_VERSION');
assert.ok(main.includes('bootstrap-v240.js'),'main must boot the minimal authenticated bootstrap');
assert.ok(bootstrap.includes('clinical-runtime-manifest-v376.mjs'),'bootstrap must own the deferred canonical composition root');

for(const active of [
  'platform-runtime-v300.js',
  'migration-router-v300.js',
  'clinical-orchestrator-v320.js',
  'clinical-health-engine-v360.js',
  'clinical-data-integrity-v340.js',
  'record-persistence-v320.js',
  'treatment-plan-intelligence-v320.js',
  'patient-delivery-finance-v320.js',
  'session-payment-visibility-v322.js',
  'agenda-controller-v330.js',
  'clinical-session-runtime-v370.js',
  'calendar-adapter-v300.js',
  'clinical-reconcile-v270.js'
])assert.ok(manifest.includes(active),`${active} must be active through the canonical composition root`);

assert.ok(!manifest.includes('../agenda-actions-v240.js'),'legacy agenda action owner must not boot');

for(const retired of [
  'runtime-monitor-v240.js','legacy-sw-cleanup-v240.js','browser-fixes-v153.js','top-status-owner-v243.js','gemini-materialization-integrity-v273.js','workspace-status-v240.js','legacy-sync-cleanup-v262.js'
])assert.ok(!manifest.includes(`../${retired}`),`${retired} must not be a permanent boot module`);
assert.ok(migrations.includes("import('./legacy-sync-cleanup-v262.js')"),'legacy sync cleanup must remain conditionally reachable');

for(const retired of ['clinical-reconcile-v240.js','gemini-autodelivery-v264.js','gemini-alias-continuity-v263.js','gemini-name-token-repair-v245.js','gemini-migration-v240.js','gemini-attendance-repair-v249.js'])
  assert.ok(!manifest.includes(`../${retired}`),`${retired} must not be an active Gemini runtime`);

for(const internal of ['google-calendar-service-v240.js','calendar-integrity-v274.js','calendar-reverse-reconcile-v276.js'])
  assert.ok(!manifest.includes(`../${internal}`),`${internal} must be owned by CalendarAdapter, not the composition root`);
assert.ok(calendar.includes('google-calendar-service-v240.js')&&calendar.includes('calendar-integrity-v274.js')&&calendar.includes('calendar-reverse-reconcile-v276.js'),'CalendarAdapter must preserve service, integrity and reverse reconciliation');

assert.ok(platform.includes('clinicalSessionId'),'canonical clinical session identity must exist');
assert.ok(platform.includes("source:'existing-links-only'"),'canonical backfill must only use existing links');
assert.ok(platform.includes("label:'Principal'")&&platform.includes("label:'Sessões'")&&platform.includes("label:'Clínica'")&&platform.includes("label:'Tratamento'")&&platform.includes("label:'Recursos'")&&platform.includes("label:'Administração'"),'legacy functional groups remain available behind the simplified patient workspace');
assert.ok(platform.includes('GEMINI_INTEGRITY_KEY'),'one-shot Gemini integrity migration must be conditional');
assert.ok(platform.includes("await import('./gemini-materialization-integrity-v273.js')"),'pending one-shot migration must remain available');
assert.ok(platform.includes('Saúde da plataforma'),'platform observability card must exist');

console.log(`platform-v300.test.mjs: PASS (${APP_VERSION})`);
