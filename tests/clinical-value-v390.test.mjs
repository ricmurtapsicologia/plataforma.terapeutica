import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROGRESS_KIND,resolvePlanReference,makeProgressRecord,progressSeries,
  clinicalValueSignals,progressDescription
} from '../assets/js/clinical-value-core-v390.mjs';

let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
const patient='SYNTH-P1',other='SYNTH-P2';
const goal={id:'synthetic-goal',patientId:patient,title:'Autonomia',status:'Em andamento',baseline:'3/10',target:'7/10',reviewDate:'2026-10-30'};
const approved={id:'approved-v1',patientId:patient,kind:'clinicalPlanReviewedVersion',status:'Validado pelo profissional',reviewRequired:false,versionNumber:1,createdAt:'2026-10-01T00:00:00Z',text:'Plano aprovado por revisão profissional.'};
const draft={id:'draft-v2',patientId:patient,kind:'clinicalPlanReviewedVersion',status:'Rascunho para revisão',reviewRequired:true,versionNumber:2,createdAt:'2026-10-12T00:00:00Z',text:'Texto em revisão.'};
const assisted={id:'assisted',patientId:patient,kind:'therapeuticActionPlan',plan:{},updatedAt:'2026-10-19T00:00:00Z'};
const notes=[approved,draft,assisted];
const base={patientId:patient,goalId:goal.id,goal,date:'2026-10-01',score:3,method:'autorreferida',orientation:'maior-melhor',today:'2026-11-04',now:'2026-11-04T12:00:00Z'};
const mk=(id,extra={})=>makeProgressRecord({...base,id,...extra});
test('approved version has precedence over newer draft and assistant',()=>{
  const x=resolvePlanReference(notes,patient);assert.equal(x.source,'reviewed');assert.equal(x.approved.id,'approved-v1');assert.equal(x.newerDraft,true);
});
test('approved source retains full text without interpretation',()=>assert.equal(resolvePlanReference(notes,patient).text,approved.text));
test('unreviewed plan cannot be approved',()=>assert.equal(resolvePlanReference([draft,assisted],patient).source,'assisted'));
test('assisted plan has explicit lower priority',()=>assert.equal(resolvePlanReference([assisted],patient).source,'assisted'));
test('missing plan does not fabricate one',()=>assert.equal(resolvePlanReference([],patient).source,'none'));
test('patient separation for plans',()=>assert.equal(resolvePlanReference(notes,other).approved,null));
test('reviewed plan with blank text is not selected',()=>assert.equal(resolvePlanReference([{...approved,text:' '}],patient).source,'none'));
test('reviewed plan with reviewRequired true is not selected',()=>assert.equal(resolvePlanReference([{...approved,reviewRequired:true}],patient).source,'none'));
test('new review supersedes old review',()=>assert.equal(resolvePlanReference([approved,{...approved,id:'v3',versionNumber:3,createdAt:'2026-11-02T00:00:00Z'}],patient).approved.id,'v3'));
test('date validated',()=>assert.throws(()=>mk('x',{date:'2026-02-30'})));
test('future date blocked',()=>assert.throws(()=>mk('x',{date:'2026-11-05'})));
test('score > 10 blocked',()=>assert.throws(()=>mk('x',{score:11})));
test('score < 0 blocked',()=>assert.throws(()=>mk('x',{score:-1})));
test('empty score blocked',()=>assert.throws(()=>mk('x',{score:''})));
test('fraction > 1 decimal blocked',()=>assert.throws(()=>mk('x',{score:5.55})));
test('score boundaries permitted',()=>{assert.equal(mk('x',{score:0}).value,0);assert.equal(mk('y',{score:10}).value,10)});
test('score decimal accepted',()=>assert.equal(mk('x',{score:5.5}).value,5.5));
test('cross-patient goal blocked',()=>assert.throws(()=>mk('x',{patientId:other})));
test('cross-goal mismatch blocked',()=>assert.throws(()=>mk('x',{goalId:'someone-else'})));
test('provenance mandatory',()=>assert.throws(()=>mk('x',{method:'unknown'})));
test('orientation mandatory',()=>assert.throws(()=>mk('x',{orientation:''})));
test('note length limited',()=>assert.throws(()=>mk('x',{note:'a'.repeat(1001)})));
test('new record is reviewed and clinical encrypted-store compatible',()=>{
 const x=mk('m1');assert.equal(x.kind,PROGRESS_KIND);assert.equal(x.status,'Validado pelo profissional');assert.equal(x.patientId,patient);assert.equal(x.source.type,'manual-professional');
});
test('correction requires a source record',()=>assert.throws(()=>mk('m2',{supersedesId:'x'})));
const m1=mk('m1'),m2=mk('m2',{date:'2026-10-08',score:5}),m3=mk('m3',{date:'2026-10-15',score:7});
test('correction cannot hijack other patient',()=>assert.throws(()=>mk('m4',{supersedesId:'m1',previous:{...m1,patientId:other}})));
test('correction cannot hijack other goal',()=>assert.throws(()=>mk('m4',{supersedesId:'m1',previous:{...m1,goalId:'different'}})));
const correction=mk('m2fixed',{date:'2026-10-08',score:6,supersedesId:m2.id,previous:m2});
test('correction preserves original trace',()=>assert.equal(correction.supersedesId,'m2'));
test('series excludes superseded values',()=>{
 const s=progressSeries([m1,m2,m3,correction],patient,goal.id);assert.deepEqual(s.records.map(r=>r.value),[3,6,7]);
});
test('series isolates other patient',()=>assert.equal(progressSeries([m1],other,goal.id).total,0));
test('series isolates other goal',()=>assert.equal(progressSeries([m1],patient,'another-goal').total,0));
const observed=mk('obs',{method:'observacao',score:8});
const inverted=mk('inverted',{orientation:'maior-pior',score:9});
test('series separates provenance',()=>{
 const s=progressSeries([m1,m3,observed],patient,goal.id);
 assert.equal(s.distinctMethods,2);assert.equal(s.records.length,2);
 const observedSeries=progressSeries([m1,m3,observed],patient,goal.id,'observacao|maior-melhor|0-10');
 assert.equal(observedSeries.records.length,1);
 const self=progressSeries([m1,m3,observed],patient,goal.id,'autorreferida|maior-melhor|0-10');
 assert.equal(self.records.length,2);
});
test('series separates orientation',()=>assert.equal(progressSeries([m1,m3,inverted],patient,goal.id).distinctMethods,2));
test('no history does not fabricate improvement',()=>assert.match(progressDescription(progressSeries([],patient,goal.id)),/Sem medidas/));
test('single reading is not labeled evolution',()=>assert.match(progressDescription(progressSeries([m1],patient,goal.id)),/Ainda não há trajetória/));
test('numeric variation not interpreted causally',()=>assert.match(progressDescription(progressSeries([m1,m3],patient,goal.id)),/Não demonstra causalidade/));
test('review due detected without changing anything',()=>{
 const s=clinicalValueSignals({patientId:patient,notes:[approved,m1],goals:[goal],tasks:[],today:'2026-11-04'});
 assert.equal(s.due.length,1);assert.equal(s.withoutMeasure.length,0);
});
test('unmeasured goal flagged as documentary gap',()=>{
 const s=clinicalValueSignals({patientId:patient,notes:[approved],goals:[goal],tasks:[],today:'2026-11-04'});
 assert.equal(s.withoutMeasure.length,1);
});
test('inactive or achieved goal not flagged as active',()=>{
 const s=clinicalValueSignals({patientId:patient,notes:[],goals:[{...goal,status:'Alcançado'}],tasks:[],today:'2026-11-04'});
 assert.equal(s.activeCount,0);
});
test('pending task is identifiable',()=>{
 const s=clinicalValueSignals({patientId:patient,notes:[],goals:[],tasks:[{patientId:patient,status:'Pendente'}],today:'2026-11-04'});
 assert.equal(s.pendingTasks.length,1);
});
test('code stores no identifying patient fixtures',()=>{
 const source=fs.readFileSync('assets/js/clinical-value-runtime-v390.js','utf8');
 assert(!source.includes('Wendell Hoover')&&!source.includes('Ronaldo')&&!source.includes('Michele'));
});
test('runtime keeps pilot gated and storage encrypted',()=>{
 const source=fs.readFileSync('assets/js/clinical-value-runtime-v390.js','utf8');
 assert(source.includes("localStorage.getItem(FLAG) === 'enabled'"));
 assert(source.includes('bulkPutEncryptedAtomic')&&source.includes('getDecryptedById'));
});
test('measurement writes also append an audit event',()=>{
 const source=fs.readFileSync('assets/js/clinical-value-runtime-v390.js','utf8');
 assert(source.includes("addActivity(row.supersedesId?")&&source.includes("entity:'notes'"));
});
test('session prep consults approved plan',()=>{
 const source=fs.readFileSync('assets/js/session-tcc-prep-v360.js','utf8');
 assert(source.includes('resolvePlanReference(data.notes,p.id)')&&source.includes('planReferenceBlock(model)'));
});
test('session prep prioritizes goal linked to the approved plan',()=>{
 const source=fs.readFileSync('assets/js/session-tcc-prep-v360.js','utf8');
 assert(source.includes('g.reviewedPlanId===approvedPlanId'));
});
test('goal editor validates explicit approved-plan linkage',()=>{
 const source=fs.readFileSync('assets/js/tcc-goal-editor-v360.js','utf8');
 assert(source.includes('reviewedPlanId')&&source.includes("n?.status==='Validado pelo profissional'"));
});
test('canonical manifest reaches runtime exactly once',()=>{
 const source=fs.readFileSync('assets/js/core/clinical-runtime-manifest-v376.mjs','utf8');
 assert.equal(source.split('clinical-value-runtime-v390.js').length-1,1);
});
test('record persistence still protects final records',()=>{
 const source=fs.readFileSync('assets/js/record-persistence-v320.js','utf8');
 assert(source.includes("existing?.status==='Finalizado'")&&source.includes('bulkPutEncryptedAtomic'));
});
console.log('Clinical value v390 tests: '+passed+' PASS');
