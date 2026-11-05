import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shouldDecorateAfterMutations} from '../assets/js/ui-mutation-gate-v392.mjs';

let passed=0;
function check(name,run){run();passed++;console.log('PASS '+name)}
function fakeNode(selector,{parent=null,nodeType=1,descendant=''}={}){
  const node={nodeType,parentElement:parent,
    matches:query=>query.split(',').some(q=>q.trim()===selector),
    closest:query=>{
      let n=node;
      while(n){if(n.matches?.(query))return n;n=n.parentElement}
      return null;
    },
    querySelector:query=>descendant&&query.split(',').some(q=>q.trim()===descendant)?{nodeType:1}:null
  };
  return node;
}
const mutation=(target,{added=[],removed=[]}={})=>({type:'childList',target,addedNodes:added,removedNodes:removed});
check('clock strong text replacement cannot trigger global decoration',()=>{
 const clock=fakeNode('#clock-chip'),strong=fakeNode('strong',{parent:clock});
 assert.equal(shouldDecorateAfterMutations([mutation(strong)]),false);
});
check('clock parent subtree replacement is also ignored',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('#clock-chip'))]),false));
for(const id of ['#rm-v3-platform-health','#rm-gemini-clinical','#rm-secure-sync-panel','#rm-agenda-health-v330','#rm-clinical-value-settings-v390','#rm-clinical-value-v390']){
 check('owned status subtree '+id+' is ignored',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('.badge',{parent:fakeNode(id)}))]),false));
}
check('root app replacement remains observed',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('#app'))]),true));
check('new topbar status control remains observed',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('.top-actions'))]),true));
check('patient workspace changes remain observed',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('#patient-workspace'))]),true));
check('patient tab changes remain observed',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('#patient-tab-content'))]),true));
check('unified tab navigation remains observed',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('.tabs'))]),true));
check('delayed injected patient workspace remains observed',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('#main-content'),{added:[fakeNode('section',{descendant:'#patient-workspace'})]})]),true));
check('unrelated content updates do not rebuild navigation',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('.ordinary-text'))]),false));
check('characterData text-only changes are not structural',()=>assert.equal(shouldDecorateAfterMutations([{type:'characterData',target:fakeNode('.top-actions')}]),false));
check('mixed batches still respond to structural changes',()=>assert.equal(shouldDecorateAfterMutations([mutation(fakeNode('#clock-chip')),mutation(fakeNode('.top-actions'))]),true));
check('no DOM records do nothing',()=>assert.equal(shouldDecorateAfterMutations([]),false));
check('clock updates the text node without new markup on every tick',()=>{
 const s=fs.readFileSync('assets/js/app-core-v150.js','utf8');
 const i=s.indexOf('function updateClock(){'),j=s.indexOf('function startClock(){',i);
 assert(i>0&&j>i);const code=s.slice(i,j);
 assert(code.includes('chip.querySelectorAll')&&code.includes('firstChild.nodeValue=value'));
 assert(code.includes('if(labels.length===2)'));
});
check('platform DOM observer filters nonstructural changes',()=>{
 const s=fs.readFileSync('assets/js/platform-runtime-v300.js','utf8');
 assert(s.includes('new MutationObserver(records=>')&&s.includes('shouldDecorateAfterMutations(records)'));
 assert(s.includes('metrics.ignoredMutationBatches++')&&s.includes('metrics.decorations++'));
});
check('status and agenda cards preserve DOM nodes when unchanged',()=>{
 const s=fs.readFileSync('assets/js/platform-runtime-v300.js','utf8');
 const gemini=fs.readFileSync('assets/js/clinical-reconcile-v270.js','utf8');
 const agenda=fs.readFileSync('assets/js/agenda-controller-v330.js','utf8');
 const sync=fs.readFileSync('assets/js/secure-sync-v260.js','utf8');
 assert(s.includes("card.__rmHealthMarkup!==healthMarkup"));
 assert(gemini.includes("old?.__rmGeminiMarkup===html"));
 assert(agenda.includes("card.__rmAgendaHealthMarkup!==markup"));
 assert(sync.includes("section.__rmSyncMarkup!==html"));
});
check('unified patient nav avoids destructive unchanged rerender',()=>{
 const s=fs.readFileSync('assets/js/patient-workspace-v320.js','utf8');
 assert(s.includes('nav.__rmPatientNavMarkup!==markup'));
});
console.log('UI_STABILITY_V392_PASS '+passed+' checks');
