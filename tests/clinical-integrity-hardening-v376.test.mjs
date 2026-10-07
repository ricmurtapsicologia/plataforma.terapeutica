import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy=await import('../assets/js/clinical-documentation-policy-v374.mjs');

const realShort={
  id:'appt_real',
  sessionStartSource:'platform-one-click',
  date:'2026-10-07',
  clinicalSessionState:'Encerrada',
  actualDurationMinutes:2
};
assert.equal(policy.isShortTestCandidate(realShort,{date:'2026-10-07'}),false,'Real short sessions must never be inferred as tests.');

const syntheticShort={...realShort,id:'appt_synth',synthetic:true};
assert.equal(policy.isShortTestCandidate(syntheticShort,{date:'2026-10-07'}),true,'Explicit synthetic marker should allow diagnostic cleanup.');

const flexReal={...realShort,sessionStartSource:'',sessionOrigin:'manual-flex-start'};
assert.equal(policy.shouldDeleteAdHocTest(flexReal),false,'Manual flex sessions are not tests by default.');
assert.equal(policy.shouldDeleteAdHocTest({...flexReal,source:{synthetic:true}}),true,'Only explicit synthetic flex sessions may be deleted as tests.');

const database=fs.readFileSync(new URL('../assets/js/database.js',import.meta.url),'utf8');
assert.match(database,/CRITICAL_CLINICAL_STORES/);
assert.match(database,/CLINICAL_DATA_INTEGRITY/);
assert.match(database,/runtime\.integrityBlocked=true/);
assert.match(database,/assertMutationAllowed\(\)/);
assert.doesNotMatch(database,/decoded\.filter\(Boolean\)/,'Critical reads must not silently filter failed decryptions.');

const bootstrap=fs.readFileSync(new URL('../assets/js/bootstrap-v240.js',import.meta.url),'utf8');
assert.match(bootstrap,/if\(err\?\.code==='CLINICAL_DATA_INTEGRITY'\)throw err/);
assert.match(bootstrap,/A plataforma não fará novas gravações até recuperação segura/);

const cleanup=fs.readFileSync(new URL('../assets/js/clinical-test-artifact-cleanup-v375.js',import.meta.url),'utf8');
assert.match(cleanup,/isExplicitTestArtifact/);
assert.match(cleanup,/confirmed=false/);
assert.doesNotMatch(cleanup,/KNOWN_SYNTHETIC_NAMES|looksSyntheticName/);
assert.doesNotMatch(cleanup,/addEventListener\('rm:data-ready'/,'Cleanup must not mutate automatically at boot.');

const health=fs.readFileSync(new URL('../assets/js/clinical-health-engine-v360.js',import.meta.url),'utf8');
assert.match(health,/mode:'READ_ONLY'/);
assert.match(health,/Diagnóstico da plataforma/);
assert.doesNotMatch(health,/repair:true/,'Health diagnostics must not invoke repair automatically or manually.');

const autofix=fs.readFileSync(new URL('../assets/js/clinical-autofix-v331.js',import.meta.url),'utf8');
assert.match(autofix,/Reativação e vínculo exigem confirmação profissional/);
assert.doesNotMatch(autofix,/reactivatedReason/,'Gemini triage must not reactivate patients automatically.');

const historical=fs.readFileSync(new URL('../REFATORACAO.md',import.meta.url),'utf8');
assert.doesNotMatch(historical,/senha\s+padr[aã]o\s+\d{4,12}/i);

const guard=fs.readFileSync(new URL('../security/public_repo_guard.py',import.meta.url),'utf8');
assert.match(guard,/password-like numeric value/);

console.log('CLINICAL_INTEGRITY_HARDENING_PASS');
