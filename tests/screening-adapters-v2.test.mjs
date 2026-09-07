import fs from 'node:fs/promises';

const OWNER='ricmurtapsicologia';
const EXPECTED=['geral','tdah','bipolar','borderline','narcisismo','impulsividade','esquemas','modos','necessidades','codependencia','icaps','risco','humor','ansiedade','autoestima'];
const LEGACY=new Set([]);
const contract=JSON.parse(await fs.readFile('rastreios/pipeline/screening-adapters-v2.json','utf8'));
const manifest=JSON.parse(await fs.readFile('rastreios/pipeline/instruments.manifest.json','utf8'));
const runtime=await fs.readFile('assets/js/screening-system-v2.js','utf8');
const manifestById=Object.fromEntries((manifest.instruments||[]).map(item=>[item.id,item]));
const DELIVERY_READY=new Set((manifest.instruments||[]).filter(item=>item.formState==='ACTIVE').map(item=>item.id));
const NO_DELIVERY=new Set(EXPECTED.filter(id=>!DELIVERY_READY.has(id)));
const failures=[];
const ok=(condition,message)=>{if(!condition)failures.push(message)};

ok(contract?.contract?.noHeuristicFormSelection===true,'contract.noHeuristicFormSelection deve ser true');
ok(typeof contract?.contract?.formWithoutSubmissionPolicy==='string','contract.formWithoutSubmissionPolicy ausente');
ok(contract?.contract?.defaultVisualProfile==='canonical_shell','perfil visual padrão deve ser canonical_shell');
const ids=Object.keys(contract.instruments||{}).sort();
ok(JSON.stringify(ids)===JSON.stringify([...EXPECTED].sort()),`IDs de adapters divergentes: ${ids.join(',')}`);
ok(JSON.stringify([...DELIVERY_READY].sort())===JSON.stringify(['ansiedade','autoestima','humor']),`formState ACTIVE inesperado: ${[...DELIVERY_READY].sort().join(',')}`);
ok(!runtime.includes('const ADAPTERS='),'runtime ainda contém tabela ADAPTERS embutida');
ok(!runtime.includes("document.querySelector('form')"),'runtime ainda seleciona o primeiro form genericamente');
ok(!runtime.includes('document.querySelector("form")'),'runtime ainda seleciona o primeiro form genericamente');
ok(!runtime.includes("document.querySelectorAll('form')"),'runtime ainda opera sobre todos os forms genericamente');
ok(!runtime.includes('document.querySelectorAll("form")'),'runtime ainda opera sobre todos os forms genericamente');
ok(runtime.includes('screening-adapters-v2.json'),'runtime não carrega screening-adapters-v2.json');
ok(runtime.includes('resolveTarget()'),'runtime não possui resolução dirigida por adapter');
ok(runtime.includes('mountIdentityWhenReady()'),'runtime não trata alvo explícito criado dinamicamente');
ok(runtime.includes('submissionSupported'),'runtime ignora bloqueio estrutural de submissão');
try{new Function(runtime)}catch(error){failures.push(`screening-system-v2.js inválido: ${error.message}`)}

function idEvidence(text,selector){
  const id=selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`\\bid\\s*=\\s*["']${id}["']`,'i').test(text);
}
function classEvidence(text,selector){
  const wanted=selector.slice(1);
  for(const match of text.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)){
    if(match[1].split(/\s+/).includes(wanted))return true;
  }
  return false;
}
function evidence(text,selector){
  if(!selector)return true;
  if(/^#[A-Za-z0-9_-]+$/.test(selector))return idEvidence(text,selector);
  if(/^\.[A-Za-z0-9_-]+$/.test(selector))return classEvidence(text,selector);
  const entry=selector.match(/entry\.(\d+)/)?.[1];
  if(entry)return text.includes(entry)&&text.includes('entry.${field.entry}');
  if(selector==='section.card')return /<section\b[^>]*class\s*=\s*["'][^"']*\bcard\b/i.test(text);
  return text.includes(selector.replace(/^#/,''));
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function raw(repo,path,attempt=0){
  const nonce=`${Date.now()}-${attempt}`;
  const url=`https://raw.githubusercontent.com/${OWNER}/${repo}/main/${path}?rm_adapter_check=${nonce}`;
  const response=await fetch(url,{
    cache:'no-store',
    headers:{
      'user-agent':'rm-screening-adapters-v2-test',
      'cache-control':'no-cache, no-store, max-age=0',
      'pragma':'no-cache'
    }
  });
  if(!response.ok)throw new Error(`${repo}/${path}: HTTP ${response.status}`);
  return response.text();
}

function requiredSelectors(a){
  return [
    a.formSelector,
    a.containerSelector,
    a.identityAnchorSelector,
    a.identityBlockSelector,
    ...Object.values(a.identity||{})
  ].filter(Boolean);
}

async function sourceAfterConvergence(a){
  const selectors=requiredSelectors(a);
  let source='';
  let lastError=null;
  for(let attempt=0;attempt<4;attempt++){
    try{
      source=await raw(a.repo,a.sourcePath,attempt);
      lastError=null;
      if(selectors.every(selector=>evidence(source,selector)))return source;
    }catch(error){
      lastError=error;
    }
    if(attempt<3)await sleep(1500*(attempt+1));
  }
  if(lastError)throw lastError;
  return source;
}

for(const id of EXPECTED){
  const a=contract.instruments[id];
  const m=manifestById[id];
  ok(a&&typeof a.repo==='string'&&typeof a.sourcePath==='string',`${id}: repo/sourcePath ausentes`);
  ok(m&&typeof m.formState==='string',`${id}: ausente do manifesto canônico`);
  ok(a?.mode==='form'||a?.mode==='legacyContainer',`${id}: mode inválido`);
  ok(a?.identity&&typeof a.identity.name==='string',`${id}: seletor explícito de nome ausente`);
  for(const [field,selector] of Object.entries(a?.identity||{})){
    ok(selector===null||typeof selector==='string',`${id}: identity.${field} inválido`);
    ok(selector===null||!selector.includes(','),`${id}: identity.${field} contém fallback múltiplo`);
  }
  ok(a?.submissionSupported===DELIVERY_READY.has(id),`${id}: submissionSupported diverge de formState=${m?.formState}`);
  const visualProfile=a?.visualProfile||contract?.contract?.defaultVisualProfile;
  ok(['canonical_shell','native_icaps'].includes(visualProfile),`${id}: visualProfile inválido`);
  ok(id==='icaps'?visualProfile==='native_icaps':visualProfile==='canonical_shell',`${id}: exceção visual inesperada`);
  if(LEGACY.has(id)){
    ok(a.mode==='legacyContainer',`${id}: deveria ser legacyContainer`);
    ok(typeof a.containerSelector==='string',`${id}: containerSelector ausente`);
    ok(typeof a.identityAnchorSelector==='string',`${id}: identityAnchorSelector ausente`);
    ok(!a.formSelector,`${id}: legacy não deve declarar formSelector`);
  }else{
    ok(a.mode==='form',`${id}: deveria resolver form explicitamente`);
    ok(typeof a.formSelector==='string'&&a.formSelector.startsWith('#'),`${id}: formSelector explícito ausente`);
    ok(!a.containerSelector,`${id}: form nativo não deve depender de containerSelector`);
  }
  let source='';
  try{source=await sourceAfterConvergence(a)}catch(error){failures.push(`${id}: ${error.message}`);continue}
  if(a.formSelector)ok(evidence(source,a.formSelector),`${id}: formSelector ${a.formSelector} não encontrado na fonte após retentativas`);
  if(a.containerSelector)ok(evidence(source,a.containerSelector),`${id}: containerSelector ${a.containerSelector} não encontrado na fonte após retentativas`);
  if(a.identityAnchorSelector)ok(evidence(source,a.identityAnchorSelector),`${id}: identityAnchorSelector ${a.identityAnchorSelector} não encontrado na fonte após retentativas`);
  if(a.identityBlockSelector)ok(evidence(source,a.identityBlockSelector),`${id}: identityBlockSelector ${a.identityBlockSelector} não encontrado na fonte após retentativas`);
  for(const [field,selector] of Object.entries(a.identity||{}))if(selector)ok(evidence(source,selector),`${id}: identity.${field} ${selector} não encontrado na fonte após retentativas`);
}

ok(LEGACY.size===0,'Nenhum rastreio deve permanecer em legacyContainer após a migração estrutural');
ok(contract.instruments.bipolar.mode==='form','Bipolaridade deve usar form nativo');
ok(contract.instruments.bipolar.submissionSupported===false,'Bipolaridade não pode habilitar entrega nesta fase');
ok(contract.instruments.narcisismo.mode==='form','Narcisismo deve usar form nativo');
ok(contract.instruments.narcisismo.submissionSupported===false,'Narcisismo não pode habilitar entrega nesta fase');
ok(contract.instruments.esquemas.mode==='form','Esquemas deve usar form nativo');
ok(contract.instruments.esquemas.formSelector==='#screeningForm','Esquemas deve resolver #screeningForm');
ok(contract.instruments.esquemas.submissionSupported===false,'Esquemas não pode habilitar entrega nesta fase');
ok(contract.instruments.risco.submissionSupported===false,'Risco não pode habilitar entrega antes da validação dedicada');
ok(manifestById.risco?.requiresDedicatedSafetyFlow===true,'Risco deve exigir fluxo dedicado de segurança');
ok(contract.instruments.icaps.submissionSupported===false,'ICAPS não pode habilitar entrega com backend ausente');
ok(contract.instruments.icaps.identity.birth==='#birth-date','ICAPS deve manter nascimento nativo explícito');
ok(contract.instruments.icaps.visualProfile==='native_icaps','ICAPS deve preservar seu visual nativo');
ok(contract.instruments.humor.submissionSupported===true,'Humor ACTIVE deve manter transporte estrutural');
ok(contract.instruments.ansiedade.submissionSupported===true,'Ansiedade ACTIVE deve manter transporte estrutural');
ok(contract.instruments.autoestima.submissionSupported===true,'Autoestima ACTIVE deve manter transporte estrutural');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',instruments:EXPECTED.length,legacyContainers:[...LEGACY],deliveryReady:[...DELIVERY_READY].sort(),deliveryBlocked:[...NO_DELIVERY].sort(),heuristicFormSelection:false,liveSourceRetry:true,manifestDrivenDelivery:true},null,2));
console.log('SCREENING_ADAPTERS_V2_PASS');
