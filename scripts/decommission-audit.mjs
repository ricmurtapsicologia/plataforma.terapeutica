import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const candidates=[
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
  "assets/js/clinical-icaps-core-v400.test.mjs",
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
const candidateSet=new Set(candidates);
const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const textExt=new Set(['.js','.mjs','.cjs','.html','.md','.yml','.yaml','.json','.css','.py','.txt','.webmanifest']);
const inspect=tracked.filter(file=>!candidateSet.has(file)&&textExt.has(path.extname(file).toLowerCase())&&fs.existsSync(file));

function references(candidate){
  const base=path.basename(candidate),refs=[];
  for(const file of inspect){
    const source=fs.readFileSync(file,'utf8');
    if(source.includes(candidate)||source.includes(base))refs.push(file);
  }
  return refs;
}

const rows=candidates.map(file=>{
  const refs=references(file);
  const codeRefs=refs.filter(ref=>/\.(?:js|mjs|cjs|html|ya?ml)$/.test(ref));
  const docsRefs=refs.filter(ref=>!codeRefs.includes(ref));
  return{
    file,
    exists:fs.existsSync(file),
    testArtifact:/\.test\.mjs$/.test(file),
    codeRefs,
    docsRefs,
    eligible:fs.existsSync(file)&&!/\.test\.mjs$/.test(file)&&codeRefs.length===0
  };
});
const eligible=rows.filter(row=>row.eligible).map(row=>row.file);
const blocked=rows.filter(row=>row.exists&&!row.testArtifact&&!row.eligible);
console.log(JSON.stringify({candidateCount:rows.length,eligibleCount:eligible.length,eligible,blocked},null,2));
