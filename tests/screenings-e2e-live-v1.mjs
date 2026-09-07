import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const manifest=JSON.parse(await fs.readFile('rastreios/pipeline/instruments.manifest.json','utf8'));
const adapters=JSON.parse(await fs.readFile('rastreios/pipeline/screening-adapters-v2.json','utf8'));
const instruments=manifest.instruments;
const viewports=[
  {name:'desktop',width:1440,height:900},
  {name:'mobile',width:390,height:844}
];
const failures=[];
const results=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function openWithRetry(page,url){
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      if(response?.ok()) return response;
      last=new Error(`HTTP ${response?.status() ?? 'NO_RESPONSE'}`);
    }catch(error){last=error}
    await sleep(attempt*1500);
  }
  throw last;
}

const browser=await chromium.launch({headless:true});
try{
  for(const instrument of instruments){
    const adapter=adapters.instruments[instrument.id];
    if(!adapter){failures.push({id:instrument.id,rule:'ADAPTER_MISSING'});continue}
    for(const viewport of viewports){
      const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},locale:'pt-BR'});
      const page=await context.newPage();
      const runtimeErrors=[];
      page.on('pageerror',error=>runtimeErrors.push(String(error.message||error)));
      let status='PASS';
      const localFailures=[];
      try{
        const response=await openWithRetry(page,instrument.publicUrl);
        await page.waitForTimeout(2500);
        const snapshot=await page.evaluate(({profile})=>{
          const visible=el=>!!(el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none');
          const shell=document.querySelector('.rm-screening-shell');
          const identity=document.querySelector('.rm-identity');
          const name=identity?.querySelector('[data-rm="name"]');
          const birth=identity?.querySelector('[data-rm="birth"]');
          const application=identity?.querySelector('[data-rm="application"]');
          const visibleFormLeaks=[...document.querySelectorAll('iframe,a')].filter(el=>visible(el)&&/(docs\.google\.com\/forms|forms\.gle)/i.test(el.src||el.href||''));
          const failBox=document.querySelector('.rm-unavailable');
          return {
            title:document.title,
            bodyText:(document.body?.innerText||'').trim().length,
            shell:visible(shell),
            identity:visible(identity),
            name:visible(name),
            birth:visible(birth),
            application:visible(application),
            visibleFormLeaks:visibleFormLeaks.length,
            failBox:visible(failBox),
            overflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
            profile
          };
        },{profile:adapter.identityProfile});

        if(!response.ok()) localFailures.push(`HTTP_${response.status()}`);
        if(snapshot.bodyText<80) localFailures.push('EMPTY_OR_TOO_SHORT_BODY');
        if(!snapshot.shell) localFailures.push('CANONICAL_SHELL_NOT_VISIBLE');
        if(!snapshot.identity) localFailures.push('IDENTITY_NOT_VISIBLE');
        if(!snapshot.name) localFailures.push('NAME_NOT_VISIBLE');
        if(adapter.identityProfile==='screening_canonical'){
          if(!snapshot.birth) localFailures.push('CANONICAL_BIRTH_NOT_VISIBLE');
          if(!snapshot.application) localFailures.push('CANONICAL_APPLICATION_NOT_VISIBLE');
        }else if(adapter.identityProfile==='monitoring_longitudinal'){
          if(snapshot.birth) localFailures.push('SYNTHETIC_MONITORING_BIRTH_VISIBLE');
          const expectsApplication=Boolean(adapter.identity?.application);
          if(expectsApplication!==snapshot.application) localFailures.push('MONITORING_APPLICATION_PROFILE_MISMATCH');
        }
        if(snapshot.visibleFormLeaks) localFailures.push('VISIBLE_GOOGLE_FORMS');
        if(snapshot.failBox) localFailures.push('FAIL_SAFE_BOX_VISIBLE_ON_INITIAL_LOAD');
        if(snapshot.overflow>8) localFailures.push(`HORIZONTAL_OVERFLOW_${snapshot.overflow}px`);
        if(runtimeErrors.length) localFailures.push(`PAGEERROR:${runtimeErrors.slice(0,3).join(' | ')}`);
      }catch(error){
        localFailures.push(`NAVIGATION:${String(error.message||error)}`);
      }
      if(localFailures.length){
        status='FAIL';
        failures.push({id:instrument.id,viewport:viewport.name,url:instrument.publicUrl,failures:localFailures});
      }
      results.push({id:instrument.id,viewport:viewport.name,status});
      await context.close();
    }
  }
}finally{
  await browser.close();
}

const summary={generatedAt:new Date().toISOString(),cases:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:failures.length,failures,results};
console.log(JSON.stringify(summary,null,2));
console.log(`SCREENINGS_E2E_LIVE cases=${summary.cases} passed=${summary.passed} failed=${summary.failed}`);
if(failures.length) process.exitCode=1;
