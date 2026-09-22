import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const executablePath=process.env.CHROME_PATH||process.env.BROWSER;
if(!executablePath)throw new Error('CHROME_PATH/BROWSER missing');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:8765';
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const report={at:new Date().toISOString(),smoke:null,e2e:{},networkDuplicates:[],console:[]};

async function freshPage(){
  const page=await browser.newPage();
  page.on('console',msg=>report.console.push({type:msg.type(),text:msg.text()}));
  page.on('pageerror',err=>report.console.push({type:'pageerror',text:String(err?.message||err)}));
  return page;
}

async function smoke(){
  const page=await freshPage();
  const requests=[];page.on('request',r=>requests.push(r.url()));
  await page.goto(`${base}/index.html`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#access-password',{timeout:20000});
  await new Promise(r=>setTimeout(r,700));
  const state=await page.evaluate(()=>({
    booting:document.body.classList.contains('rm-booting'),
    login:Boolean(document.querySelector('#access-password')&&document.querySelector('[data-access-action="login"]')),
    criticalText:document.body.innerText.includes('Não foi possível iniciar a plataforma'),
    preBootErrors:Array.isArray(window.__rmPreBootErrors)?[...window.__rmPreBootErrors]:[],
    bootErrors:Array.isArray(window.__rmBootErrors)?[...window.__rmBootErrors]:[],
    entrypoint:window.__rmEntrypointVersion||'',
  }));
  const byPath=new Map();
  for(const u of requests){try{const x=new URL(u);if(x.origin!==base)continue;const list=byPath.get(x.pathname)||new Set();list.add(x.search||'(no-query)');byPath.set(x.pathname,list)}catch{}}
  report.networkDuplicates=[...byPath.entries()].filter(([,qs])=>qs.size>1).map(([pathname,qs])=>({pathname,variants:[...qs]}));
  report.smoke={...state,pass:state.login&&!state.booting&&!state.criticalText&&state.preBootErrors.length===0};
  await page.close();
}

async function runResult(name,path,{pending=['PENDING','RUNNING'],pass}={}){
  const page=await freshPage();
  const started=Date.now();
  let value='';let timedOut=false;
  try{
    await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(pending=>{const el=document.querySelector('#result');if(!el)return false;return !pending.includes((el.textContent||'').trim())},{timeout:30000},pending);
    value=await page.$eval('#result',el=>(el.textContent||'').trim());
  }catch(err){
    timedOut=true;
    value=await page.$eval('#result',el=>(el.textContent||'').trim()).catch(()=>`NO_RESULT: ${err?.message||err}`);
  }
  const ok=typeof pass==='function'?Boolean(pass(value)):false;
  report.e2e[name]={pass:ok,value,timedOut,durationMs:Date.now()-started};
  await page.close();
}

try{
  await smoke();
  await runResult('persistence','/tests/browser-persistence-v271.html',{pass:v=>v==='P0_BROWSER_PERSISTENCE_PASS'});
  await runResult('agenda','/tests/agenda-browser-v330.html',{pass:v=>v==='AGENDA_V330_BROWSER_PASS'});
  await runResult('recordIsolation','/tests/record-session-isolation-v400.html',{pass:v=>v==='RECORD_SESSION_ISOLATION_PASS'});
  await runResult('uiStability','/tests/ui-stability-v380.html',{pass:v=>v.startsWith('OK_V380')});
}finally{
  await browser.close();
}

fs.writeFileSync('/tmp/deep-browser-e2e.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
const failures=[];
if(!report.smoke?.pass)failures.push('smoke');
for(const [name,x] of Object.entries(report.e2e))if(!x.pass)failures.push(name);
if(report.networkDuplicates.length)failures.push(`duplicate-modules:${report.networkDuplicates.length}`);
console.log(`DEEP_BROWSER_E2E_COMPLETE failures=${failures.length?failures.join(','):'none'}`);
if(failures.length)process.exitCode=1;
