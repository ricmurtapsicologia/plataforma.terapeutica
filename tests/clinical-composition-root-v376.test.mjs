import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../assets/js/main-v250.js',import.meta.url),'utf8');
const manifestSource=fs.readFileSync(new URL('../assets/js/core/clinical-runtime-manifest-v376.mjs',import.meta.url),'utf8');
const manifest=await import('../assets/js/core/clinical-runtime-manifest-v376.mjs');

const moduleRoots=[...index.matchAll(/<script\s+type="module"[^>]+src="([^"]+)"/g)].map(m=>m[1]);
assert.equal(moduleRoots.length,1,'index.html must expose exactly one module entrypoint.');
assert.match(moduleRoots[0],/assets\/js\/main-v250\.js/);
assert.match(main,/clinical-runtime-manifest-v376\.mjs/);
assert.doesNotMatch(main,/const modules=\[/,'Domain module composition must not live in main-v250.js.');

const modules=manifest.RUNTIME_PHASES.flatMap(phase=>phase.modules.map(([path,label])=>({phase:phase.id,path,label})));
assert.equal(modules.length,manifest.RUNTIME_MODULE_COUNT);
assert.equal(new Set(modules.map(item=>item.path)).size,modules.length,'Runtime manifest must not duplicate modules.');
assert.ok(modules.length>=50,'Composition root unexpectedly lost runtime capabilities.');

for(const moved of [
  '../clinical-private-record-import-v353.js',
  '../clinical-session-header-v371.js',
  '../clinical-documentation-guard-v374.js',
  '../clinical-test-artifact-cleanup-v375.js',
  '../gemini-review-context-v341.js'
])assert.ok(modules.some(item=>item.path===moved),`Moved module missing from canonical manifest: ${moved}`);

for(const forbidden of [
  'runtime-monitor-v240.js',
  'legacy-sw-cleanup-v240.js',
  'browser-fixes-v153.js',
  'top-status-owner-v243.js',
  'workspace-status-v240.js',
  'clinical-reconcile-v240.js',
  'agenda-actions-v240.js'
])assert.ok(!manifestSource.includes(`../${forbidden}`),`Retired module returned to canonical composition: ${forbidden}`);

console.log('CLINICAL_COMPOSITION_ROOT_PASS');
