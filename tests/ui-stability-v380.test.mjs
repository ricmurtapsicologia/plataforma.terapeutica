import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const platform=read('assets/js/platform-runtime-v300.js');
const workspace=read('assets/js/patient-workspace-v320.js');
const stability=read('assets/js/ui-stability-v380.js');
const closure=read('assets/js/patient-closure-v172.js');
const hardening=read('assets/css/hardening-v360.css');
const main=read('assets/js/main-v250.js');
const index=read('index.html');
const patientUx=read('assets/js/patient-ux-v240.js');
const version=read('assets/js/version.js').match(/APP_VERSION='([^']+)'/)?.[1];

assert.match(platform,/3\.0\.1-stability/,'platform runtime must expose stability patch version');
assert.ok(platform.includes('MUTATION_IGNORE_SELECTOR'),'global decorator must filter high-frequency mutations');
for(const token of ['#clock-chip','data-rm-session-header-timer-v371','.rm-unified-patient-nav-v320','.rm-canonical-patient-nav-v380'])assert.ok(platform.includes(token),`mutation filter missing ${token}`);
assert.ok(platform.includes('ignoredMutations'),'runtime must expose ignored mutation telemetry');
assert.ok(platform.includes('if(tabs.innerHTML!==tabsMarkup)'),'legacy tab decoration must be idempotent');
assert.ok(platform.includes('if(card.innerHTML!==markup)'),'settings health decoration must be idempotent');

assert.ok(patientUx.includes('rm-unified-patient-nav-v320'),'legacy patient UX owner remains identifiable');
assert.ok(workspace.includes('rm-canonical-patient-nav-v380'),'canonical patient navigation must use an isolated DOM owner');
assert.ok(workspace.includes('rm-unified-patient-nav-v320{display:none!important}'),'legacy competing navigation must be visually retired');
assert.ok(workspace.includes('if(nav.innerHTML!==markup)'),'canonical navigation updates must be idempotent');
assert.ok(workspace.includes("document.body.classList.toggle('rm-patient-focused',focused())"),'workspace must own focused-state visibility');

assert.ok(!closure.includes('organizePatientLists'),'patient closure must not own patient-list rendering');
assert.ok(!closure.includes('grid.replaceWith'),'patient closure must not replace the canonical patient grid');
assert.ok(!closure.includes("document.querySelectorAll('[data-patient-list]')"),'patient closure must not post-process patient-list visibility');
assert.ok(!stability.includes('__rmPatientWorkspace'),'stability timer must not reapply patient workspace after render');
assert.ok(stability.includes('3.8.1-intermittency-hotfix'),'intermittency hotfix version must be active');

assert.ok(hardening.includes('scrollbar-gutter:stable'),'vertical scrollbar geometry must remain stable');
assert.ok(hardening.includes('font-variant-numeric:tabular-nums'),'clock and timers must use tabular numerals');
assert.ok(hardening.includes('.vault-card .btn:not(.secondary):not(.ghost)'),'login contrast hardening must remain active');
assert.ok(stability.includes("PerformanceObserver.supportedEntryTypes?.includes('layout-shift')"),'CLS telemetry must be active when supported');
assert.ok(stability.includes('rm-ui-settling'),'render settle guard must be active');
assert.ok(main.includes('ui-stability-v380.js'),'stability runtime must boot canonically');
assert.ok(version,'APP_VERSION must be readable');
assert.ok(index.includes(`main-v250.js?v=${version}`),'index must cache-bust the current entrypoint release');
assert.ok(index.includes('rev=hardening-20260922'),'index must expose the hardening revision marker');

console.log('UI_STABILITY_V380_STATIC_PASS');
