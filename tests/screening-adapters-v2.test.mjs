import fs from 'node:fs/promises';

const OWNER='ricmurtapsicologia';
const EXPECTED=['geral','tdah','bipolar','borderline','narcisismo','impulsividade','esquemas','modos','necessidades','codependencia','icaps','risco','humor','ansiedade','autoestima'];
const LEGACY=new Set(['bipolar','narcisismo','esquemas']);
const contract=JSON.parse(await fs.readFile('rastreios/pipeline/screening-adapters-v2.json','utf8'));
const runtime=await fs.readFile('assets/js/screening-system-v2.js','utf8');
const failures=[];
const ok=(condition,message)=>{if(!condition)failures.push(message)};

ok(contract?.contract?.noHeuristicFormSelection===true,'contract.noHeuristicFormSelection deve ser true');
const ids=Object.keys(contract.instruments||{}).sort();
ok(JSON.stringify(ids)===JSON.stringify([...EXPECTED].sort()),`IDs de adapters divergentes: ${ids.join(',')}`);
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
  const cls=selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`\\bclass\\s*=\\s*["'][^"']*(?:^|\\s)${cls}(?:\\s|$)[^"']*["']`,'im').test(text);
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
async function raw(repo,path){
  const url=`https://raw.githubusercontent.com/${OWNER}/${repo}/main/${path}`;
  const response=await fetch(url,{headers:{'user-agent':'rm-screening-adapters-v2-test'}});
  if(!response.ok)throw new Error(`${repo}/${path}: HTTP ${response.status}`);
  return response.text();
}

for(const id of EXPECTED){
  const a=contract.instruments[id];
  ok(a&&typeof a.repo==='string'&&typeof a.sourcePath==='string',`${id}: repo/sourcePath ausentes`);
  ok(a?.mode==='form'||a?.mode==='legacyContainer',`${id}: mode inválido`);
  ok(a?.identity&&typeof a.identity.name==='string',`${id}: seletor explícito de nome ausente`);
  for(const [field,selector] of Object.entries(a?.identity||{})){
    ok(selector===null||typeof selector==='string',`${id}: identity.${field} inválido`);
    ok(selector===null||!selector.includes(','),`${id}: identity.${field} contém fallback múltiplo`);
  }
  if(LEGACY.has(id)){
    ok(a.mode==='legacyContainer',`${id}: deveria ser legacyContainer`);
    ok(a.submissionSupported===false,`${id}: legacy sem form não pode suportar submissão`);
    ok(typeof a.containerSelector==='string',`${id}: containerSelector ausente`);
    ok(typeof a.identityAnchorSelector==='string',`${id}: identityAnchorSelector ausente`);
    ok(!a.formSelector,`${id}: legacy não deve declarar formSelector`);
  }else{
    ok(a.mode==='form',`${id}: deveria resolver form explicitamente`);
    ok(typeof a.formSelector==='string'&&a.formSelector.startsWith('#'),`${id}: formSelector explícito ausente`);
    ok(a.submissionSupported===true,`${id}: fluxo com form deve declarar suporte estrutural`);
  }
  let source='';
  try{source=await raw(a.repo,a.sourcePath)}catch(error){failures.push(`${id}: ${error.message}`);continue}
  if(a.formSelector)ok(evidence(source,a.formSelector),`${id}: formSelector ${a.formSelector} não encontrado na fonte`);
  if(a.containerSelector)ok(evidence(source,a.containerSelector),`${id}: containerSelector ${a.containerSelector} não encontrado na fonte`);
  if(a.identityAnchorSelector)ok(evidence(source,a.identityAnchorSelector),`${id}: identityAnchorSelector ${a.identityAnchorSelector} não encontrado na fonte`);
  if(a.identityBlockSelector)ok(evidence(source,a.identityBlockSelector),`${id}: identityBlockSelector ${a.identityBlockSelector} não encontrado na fonte`);
  for(const [field,selector] of Object.entries(a.identity||{}))if(selector)ok(evidence(source,selector),`${id}: identity.${field} ${selector} não encontrado na fonte`);
}

ok(contract.instruments.icaps.identity.birth==='#birth-date','ICAPS deve manter nascimento nativo explícito');
ok(contract.instruments.humor.formSelector==='#clinical-form','Humor deve resolver #clinical-form');
ok(contract.instruments.ansiedade.formSelector==='#clinical-form','Ansiedade deve resolver #clinical-form');
ok(contract.instruments.autoestima.formSelector==='#clinical-form','Autoestima deve resolver #clinical-form');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',instruments:EXPECTED.length,legacyContainers:[...LEGACY],heuristicFormSelection:false},null,2));
console.log('SCREENING_ADAPTERS_V2_PASS');
