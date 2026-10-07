import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const exists=path=>fs.existsSync(path);
const index=read('index.html');
const main=read('assets/js/main-v250.js');
const bootstrap=read('assets/js/bootstrap-v240.js');
const state=read('assets/js/state.js');
const database=read('assets/js/database.js');
const crypto=read('assets/js/crypto.js');
const sync=read('assets/js/secure-sync-v260.js');
const drive=read('assets/js/drive-appdata-storage-v260.js');
const backup=read('assets/js/backup.js');
const policy=read('assets/js/clinical-documentation-policy-v374.mjs');
const cleanup=read('assets/js/clinical-test-artifact-cleanup-v375.js');
const health=read('assets/js/clinical-health-engine-v360.js');
const autofix=read('assets/js/clinical-autofix-v331.js');
const reconcile=read('assets/js/clinical-reconcile-v270.js');
const plan=read('assets/js/treatment-plan-intelligence-v320.js');
const calendar=read('assets/js/calendar-adapter-v300.js');
const agenda=read('assets/js/agenda-controller-v330.js');
const session=read('assets/js/clinical-session-runtime-v370.js');
const manifest=read('assets/js/core/clinical-runtime-manifest-v376.mjs');
const guard=read('security/public_repo_guard.py');
const refactor=read('REFATORACAO.md');
const cert=read('.github/workflows/clinical-certification.yml');
const staticCi=read('.github/workflows/static-integrity.yml');
const version=read('assets/js/version.js');
const removed=[
  "assets/js/agenda-sync-bridge-v161.js",
  "assets/js/app-core-v143.js",
  "assets/js/app.js",
  "assets/js/bootstrap-v142.js",
  "assets/js/bootstrap-v143.js",
  "assets/js/bootstrap-v150.js",
  "assets/js/bootstrap.js",
  "assets/js/browser-fixes-v153.js",
  "assets/js/calendar-reverse-reconcile-v275.js",
  "assets/js/calendar.js",
  "assets/js/clinical-reconcile-v240.js",
  "assets/js/gemini-alias-continuity-v263.js",
  "assets/js/gemini-attendance-repair-v249.js",
  "assets/js/gemini-autodelivery-v264.js",
  "assets/js/gemini-canonical-repair-v244.js",
  "assets/js/gemini-migration-v240.js",
  "assets/js/gemini-name-token-repair-v245.js",
  "assets/js/gemini-reclassify-v241.js",
  "assets/js/gemini-repair-v243.js",
  "assets/js/google-calendar-v162.js",
  "assets/js/google-calendar-v163.js",
  "assets/js/google-oauth-fix-v164.js",
  "assets/js/google-oauth-public-client-v361.js",
  "assets/js/google-oauth-silent-v167.js",
  "assets/js/google-workspace-oauth-v200.js",
  "assets/js/legacy-sw-cleanup-v240.js",
  "assets/js/main-v240.js",
  "assets/js/nav-router.js",
  "assets/js/patient-package.js",
  "assets/js/patient-ux-v137.js",
  "assets/js/runtime-monitor-v240.js",
  "assets/js/sync-conflict-recovery-v240.js",
  "assets/js/sync-conflict-recovery-v247.js",
  "assets/js/sync-semantic-conflict-cleanup-v248.js",
  "assets/js/top-status-dedupe-v242.js",
  "assets/js/top-status-owner-v243.js",
  "assets/js/version-v168.js",
  "assets/js/version-v169.js",
  "assets/js/workspace-status-v240.js"
];

const checks=[];
function check(name,condition){checks.push({name,pass:Boolean(condition)});}

check('01 single module root',[...index.matchAll(/<script\s+type="module"/g)].length===1&&index.includes('main-v250.js'));
check('02 canonical APP_VERSION',/APP_VERSION='\d+\.\d+\.\d+'/.test(version));
check('03 minimal main boot',main.includes('bootstrap-v240.js')&&!main.includes('const modules=['));
check('04 deferred composition',bootstrap.includes('clinical-runtime-manifest-v376.mjs')&&bootstrap.includes('deferredUntilAuthentication:true'));
check('05 authenticated CSS deferred',bootstrap.includes('AUTHENTICATED_STYLES')&&!index.includes('clinical-ui-v180.css'));
check('06 database lazy after auth',bootstrap.includes("import('./database.js")&&!bootstrap.includes("from './database.js'"));
check('07 sync lazy after auth',bootstrap.includes("import('./secure-sync-v260.js")&&!bootstrap.includes("from './secure-sync-v260.js'"));
check('08 integrity runtime state',state.includes('integrityBlocked:false')&&state.includes('integrityErrors:[]'));
check('09 critical clinical stores',database.includes("CRITICAL_CLINICAL_STORES")&&database.includes("'records'")&&database.includes("'formulations'"));
check('10 decrypt fail closed',database.includes("CLINICAL_DATA_INTEGRITY")&&!database.includes('decoded.filter(Boolean)'));
check('11 mutations blocked on integrity',database.includes('assertMutationAllowed()'));
check('12 explicit synthetic marker',policy.includes('isExplicitTestArtifact'));
check('13 cleanup requires confirmation',cleanup.includes('confirmed=false')&&cleanup.includes('requiresConfirmation:true'));
check('14 no heuristic name deletion',!cleanup.includes('KNOWN_SYNTHETIC_NAMES')&&!cleanup.includes('looksSyntheticName'));
check('15 diagnostics read only',health.includes("mode:'READ_ONLY'")&&!health.includes('repair:true'));
check('16 no automatic patient reactivation',autofix.includes('Reativação e vínculo exigem confirmação profissional')&&!autofix.includes('reactivatedReason'));
check('17 public secret guard',guard.includes('password-like numeric value'));
check('18 historical password value absent',!/senha\s+padr[aã]o\s*[:=]?\s*\d{4,12}/i.test(refactor));
check('19 Drive appDataFolder',drive.includes("spaces:'appDataFolder'")&&drive.includes("parents:['appDataFolder']"));
check('20 AES-GCM 256',crypto.includes("name:'AES-GCM'")&&crypto.includes('length:256'));
check('21 PBKDF2 hardening',crypto.includes("name:'PBKDF2'")&&database.includes('NEW_VAULT_ITERATIONS=600000'));
check('22 sync leader election',sync.includes('BroadcastChannel')&&sync.includes('HEARTBEAT_MS=90000'));
check('23 real conflict detection',sync.includes('conflictKeys')&&sync.includes("setStatus('conflict'"));
check('24 isolated backup restore',backup.includes('isolatedRestoreTest')&&backup.includes('IndexedDB'));
check('25 final record protected',reconcile.includes("status==='Finalizado'")&&reconcile.includes('não pode ser sobrescrito'));
check('26 treatment human review',plan.includes('reviewRequired:true')&&plan.includes('autonomousDiagnosis:false'));
check('27 Calendar adapter ownership',calendar.includes('google-calendar-service-v240.js')&&calendar.includes('calendar-reverse-reconcile-v276.js'));
check('28 Agenda/session canonical owners',agenda.includes("const OWNER='agenda-controller-v330'")&&session.includes('getDecryptedById')&&session.includes('sessionStartedAt'));
check('29 legacy cutoff complete',removed.every(path=>!exists(path))&&exists('assets/js/clinical-icaps-core-v400.test.mjs'));
check('30 certification gates',cert.includes('Clinical smoke and E2E')&&cert.includes('lighthouse@12.2.1')&&cert.includes('result.performance<0.90')&&cert.includes('result.accessibility<0.95')&&cert.includes('result.bestPractices<0.95')&&staticCi.includes('clinical-audit-30.mjs'));

for(const item of checks)console.log(`${item.pass?'PASS':'FAIL'} · ${item.name}`);
const failed=checks.filter(item=>!item.pass);
console.log(`AUDIT_RESULT ${checks.length-failed.length}/30`);
if(failed.length)process.exit(1);
console.log('CLINICAL_AUDIT_30_30_PASS');
