import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('assets/js/main-v250.js');
const platform=read('assets/js/platform-runtime-v300.js');
const calendar=read('assets/js/calendar-adapter-v300.js');
const index=read('index.html');
const version=read('assets/js/version.js');

assert.match(version,/APP_VERSION='3\.0\.0'/,'APP_VERSION must be 3.0.0');
assert.ok(index.includes('3.0.0-main-v250'),'index build marker must be v3');
assert.ok(index.includes('main-v250.js?v=3.0.0'),'index must load one v3 entrypoint');
assert.ok(main.includes('platform-runtime-v300.js'),'consolidated platform runtime must be active');

for(const retired of [
  'runtime-monitor-v240.js',
  'legacy-sw-cleanup-v240.js',
  'browser-fixes-v153.js',
  'top-status-owner-v243.js',
  'gemini-materialization-integrity-v273.js',
  'workspace-status-v240.js'
])assert.ok(!main.includes(retired),`${retired} must not be a permanent boot module`);

for(const retired of [
  'clinical-reconcile-v240.js',
  'gemini-autodelivery-v264.js',
  'gemini-alias-continuity-v263.js',
  'gemini-name-token-repair-v245.js',
  'gemini-migration-v240.js',
  'gemini-attendance-repair-v249.js'
])assert.ok(!main.includes(retired),`${retired} must not be an active Gemini runtime`);

assert.ok(main.includes('calendar-adapter-v300.js'),'single Calendar adapter must be active');
for(const internal of ['google-calendar-service-v240.js','calendar-integrity-v274.js','calendar-reverse-reconcile-v275.js'])assert.ok(!main.includes(internal),`${internal} must be owned by CalendarAdapter, not main`);
assert.ok(calendar.includes('google-calendar-service-v240.js')&&calendar.includes('calendar-integrity-v274.js')&&calendar.includes('calendar-reverse-reconcile-v275.js'),'CalendarAdapter must preserve service, integrity and reverse reconciliation');
assert.ok(main.includes('clinical-reconcile-v270.js'),'single Gemini reconciler must remain active');
assert.ok(platform.includes('clinicalSessionId'),'canonical clinical session identity must exist');
assert.ok(platform.includes("source:'existing-links-only'"),'canonical backfill must only use existing links');
assert.ok(platform.includes("label:'Principal'")&&platform.includes("label:'Sessões'")&&platform.includes("label:'Clínica'")&&platform.includes("label:'Tratamento'")&&platform.includes("label:'Recursos'")&&platform.includes("label:'Administração'"),'patient workspace must expose six functional groups');
assert.ok(platform.includes('GEMINI_INTEGRITY_KEY'),'one-shot Gemini integrity migration must be conditional');
assert.ok(platform.includes("await import('./gemini-materialization-integrity-v273.js')"),'pending one-shot migration must remain available');
assert.ok(platform.includes('Saúde da plataforma'),'platform observability card must exist');

console.log('platform-v300.test.mjs: PASS');
