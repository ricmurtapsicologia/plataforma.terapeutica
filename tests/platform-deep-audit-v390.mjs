import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const walk=(dir,out=[])=>{for(const name of fs.readdirSync(path.join(ROOT,dir))){const rel=path.posix.join(dir,name);const full=path.join(ROOT,rel);const st=fs.statSync(full);if(st.isDirectory())walk(rel,out);else out.push(rel)}return out};
const js=walk('assets/js').filter(p=>/\.m?js$/.test(p));
const tests=[...walk('tests').filter(p=>/\.test\.mjs$/.test(p)),...js.filter(p=>/\.test\.mjs$/.test(p))];
const workflows=walk('.github/workflows').filter(p=>/\.ya?ml$/.test(p));
const findings=[];
const add=(severity,id,area,message,evidence={})=>findings.push({severity,id,area,message,evidence});

const index=read('index.html');
const main=read('assets/js/main-v250.js');
const bootstrap=read('assets/js/bootstrap-v240.js');
const database=read('assets/js/database.js');
const version=read('assets/js/version.js');

const importRe=/(?:from\s*|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g;
const imports=new Map();
for(const file of js){
  const src=read(file),deps=[];
  for(const m of src.matchAll(importRe)){
    const spec=m[1].split('?')[0].split('#')[0];
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec));
    if(fs.existsSync(path.join(ROOT,target)))deps.push(target);
  }
  imports.set(file,deps);
}
const indexRoots=[...index.matchAll(/<script[^>]+(?:type="module"[^>]+)?src="([^"]+\.js)(?:\?[^\"]*)?"/g)].map(m=>m[1]).filter(p=>p.startsWith('assets/js/'));
const mainDynamic=[...main.matchAll(/\['\.\/(.+?\.js)'\s*,/g)].map(m=>`assets/js/${m[1]}`);
const roots=[...new Set([...indexRoots,...mainDynamic])];
const reachable=new Set();
const visit=f=>{if(reachable.has(f)||!imports.has(f))return;reachable.add(f);for(const d of imports.get(f)||[])visit(d)};
roots.forEach(visit);
const orphanJs=js.filter(p=>!reachable.has(p)&&!p.endsWith('.test.mjs'));

// Main loads each listed module with ?v=...&rev=..., while static imports elsewhere use
// the queryless URL. In browsers those are different ES-module identities.
for(const target of mainDynamic){
  const owners=[...reachable].filter(file=>file!=='assets/js/main-v250.js'&&file!==target&&(imports.get(file)||[]).includes(target));
  if(owners.length)add('MAIOR','MOD-QUERY-DUP','Arquitetura/runtime',`${target} é carregado pelo entrypoint com query string e também importado sem query por módulo(s) alcançável(is), criando instâncias ES-module distintas.`,{target,owners});
}

const active=[...reachable];
const patternCounts=re=>active.flatMap(file=>{const src=read(file);const n=[...src.matchAll(re)].length;return n?[{file,count:n}]:[]});
const observers=patternCounts(/new\s+MutationObserver\s*\(/g);
const intervals=patternCounts(/setInterval\s*\(/g);
const rendered=patternCounts(/addEventListener\(\s*['"]rm:rendered['"]/g);
const immediate=patternCounts(/stopImmediatePropagation\s*\(/g);
if(observers.length>2)add('MAIOR','DOM-OWNERS','Runtime/UI',`Há ${observers.reduce((a,x)=>a+x.count,0)} MutationObserver(s) em módulos alcançáveis; múltiplos proprietários de DOM elevam risco de loops e tremor.`,{observers});
if(intervals.length>3)add('MENOR','TIMER-DENSITY','Runtime/performance',`Há ${intervals.reduce((a,x)=>a+x.count,0)} setInterval(s) em módulos alcançáveis.`,{intervals});
if(rendered.length>5)add('MAIOR','RENDER-FANOUT','Runtime/performance',`O evento rm:rendered possui ${rendered.reduce((a,x)=>a+x.count,0)} listeners em módulos alcançáveis, aumentando trabalho após cada renderização.`,{rendered});
if(immediate.length)add('MENOR','EVENT-STOP-IMMEDIATE','Runtime/eventos','Há stopImmediatePropagation em módulos alcançáveis; isso pode mascarar handlers concorrentes e tornar a ordem de importação relevante.',{immediate});

for(const wf of workflows){
  const src=read(wf);
  for(const html of walk('tests').filter(p=>p.endsWith('.html'))){
    const h=read(html);
    for(const m of src.matchAll(/grep\s+-q\s+['"]([^'"]*PASS[^'"]*)['"]/g)){
      if(h.includes(m[1])&&src.includes(path.posix.basename(html)))add('MAIOR','TEST-FALSE-POSITIVE','QA/E2E',`${wf} procura o marcador ${m[1]} em ${html}, mas o próprio código-fonte da página contém esse texto; o gate pode aprovar sem a execução ter passado.`,{workflow:wf,html,marker:m[1]});
    }
  }
}

const workflowText=workflows.map(read).join('\n');
const uncovered=tests.filter(t=>!workflowText.includes(t));
if(uncovered.length)add('MAIOR','TEST-COVERAGE','QA','Existem testes versionados que não são executados explicitamente por nenhum workflow canônico de regressão.',{uncovered});

if(/http-equiv="Content-Security-Policy"/i.test(index)&&/frame-ancestors/i.test(index))add('MAIOR','CSP-FRAME-ANCESTORS','Segurança','frame-ancestors é declarado em CSP via <meta>; navegadores ignoram essa diretiva quando entregue por meta.');
if(/style-src[^;]*'unsafe-inline'/i.test(index))add('MENOR','CSP-STYLE-INLINE','Segurança','CSP permite estilos inline (unsafe-inline), ampliando a superfície de injeção de estilo.');
if(/connect-src[^;]*api\.github\.com[^;]*raw\.githubusercontent\.com/i.test(index))add('MENOR','CSP-GITHUB-CONNECT','Segurança/privacidade','A CSP permite conexões do front-end clínico com GitHub API/raw; revisar necessidade e reduzir allowlist.');

if(/catch\(err\)\{console\.error\('Registro não pôde ser lido'[\s\S]*?return null\}/.test(database)&&/decoded\.filter\(Boolean\)/.test(database))add('MAIOR','DATA-SILENT-DROP','Persistência','getAllDecrypted omite registros que falham na descriptografia e retorna os demais como se o conjunto estivesse completo.');
if(/setStore\(name,\[\]\)/.test(bootstrap))add('MAIOR','STORE-FAIL-EMPTY','Persistência/boot','Falha de leitura de uma store é convertida em store vazia durante o boot.');
if(/for\(const \[path,label\] of modules\)[\s\S]*?catch\(err\)[\s\S]*?__rmPreBootErrors/.test(main))add('MAIOR','BOOT-PARTIAL-MODULES','Boot/runtime','Falhas de módulos do entrypoint são registradas e o boot continua; módulos essenciais podem falhar sem impedir a abertura da plataforma.');
if(/delete\(id\);await done;await recordTombstone/.test(database))add('MAIOR','DELETE-TOMBSTONE-NONATOMIC','Persistência/sync','Exclusão local e gravação do tombstone ocorrem em transações separadas.');
if(/await done;\s*await clearTombstone/.test(database)||/await done;\s*await clearTombstones/.test(database))add('MAIOR','WRITE-TOMBSTONE-NONATOMIC','Persistência/sync','Gravação/ressurreição e remoção do tombstone ocorrem em transações separadas.');
if(/\.clear\(\);await done;for\(const row of rows\)await recordTombstone/.test(database))add('MAIOR','CLEAR-TOMBSTONE-NONATOMIC','Persistência/sync','clearStore limpa a store antes de registrar tombstones individualmente.');

const buildDate=version.match(/BUILD_DATE='([^']+)'/)?.[1]||'';
if(buildDate&&buildDate<'2026-09-22')add('MENOR','BUILD-DATE-STALE','Release/governança',`BUILD_DATE=${buildDate} não acompanha os hotfixes atuais de 2026-09-22.`);
const cssRefs=[...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m=>m[1]);
if(cssRefs.length>8)add('MENOR','CSS-CHAIN','Performance',`index.html bloqueia renderização com ${cssRefs.length} folhas CSS separadas.`,{count:cssRefs.length});
if(mainDynamic.length>30)add('MAIOR','BOOT-MODULE-CHAIN','Performance/arquitetura',`O entrypoint importa sequencialmente ${mainDynamic.length} módulos antes do bootstrap.`,{count:mainDynamic.length});
if(/document\.addEventListener\('rm:rendered',\(\)=>queueAuditNormalize\(0\)\)/.test(main))add('MAIOR','DB-SCAN-ON-RENDER','Performance/persistência','Cada rm:rendered agenda normalizeAuditedDrafts(), acoplando renderização a varredura/gravação potencial no IndexedDB.');
if(orphanJs.length>25)add('MENOR','LEGACY-SURFACE','Manutenibilidade',`Há ${orphanJs.length} módulos JavaScript não alcançáveis pelo entrypoint atual.`,{sample:orphanJs.slice(0,40),count:orphanJs.length});

const severityOrder={CRITICO:0,MAIOR:1,MENOR:2,OPORTUNIDADE:3};
findings.sort((a,b)=>(severityOrder[a.severity]??9)-(severityOrder[b.severity]??9)||a.id.localeCompare(b.id));
const counts=Object.fromEntries(['CRITICO','MAIOR','MENOR','OPORTUNIDADE'].map(s=>[s,findings.filter(f=>f.severity===s).length]));
const report={audit:'platform-deep-audit-v390',at:new Date().toISOString(),inventory:{javascript:js.length,reachableJavascript:reachable.size,orphanJavascript:orphanJs.length,tests:tests.length,workflows:workflows.length,indexCss:cssRefs.length,mainDynamicModules:mainDynamic.length},runtimeOwners:{observers,intervals,rendered,stopImmediatePropagation:immediate},counts,findings};
fs.writeFileSync('/tmp/platform-deep-static.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
console.log(`DEEP_STATIC_AUDIT_COMPLETE critical=${counts.CRITICO} major=${counts.MAIOR} minor=${counts.MENOR}`);
