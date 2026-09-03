import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTION_HEADERS,DIMENSIONS,scoreRow,bindPatientExact,FIELD,INSTRUMENT_VERSION,SCORING_VERSION,INTERPRETATION_VERSION} from './clinical-icaps-core-v400.mjs';
function row(v=3){return Object.fromEntries(QUESTION_HEADERS.map(h=>[h,String(v)]))}
test('canonical 60 headers and 6 dimensions',()=>{assert.equal(QUESTION_HEADERS.length,60);assert.equal(new Set(QUESTION_HEADERS).size,60);assert.equal(DIMENSIONS.length,6)});
test('sanitized versions are explicit',()=>{assert.equal(INSTRUMENT_VERSION,'2.0.0');assert.equal(SCORING_VERSION,'2.1.0');assert.equal(INTERPRETATION_VERSION,'2.1.0')});
test('Q10 sanitized positive',()=>assert.match(QUESTION_HEADERS[9],/conseguimos enfrentá-los com parceria e diálogo/i));
test('all 1 => zero construct score',()=>scoreRow(row(1)).dimensions.forEach(d=>assert.equal(d.score,0)));
test('all neutral 3 => fifty and intermediate semantics',()=>{const scored=scoreRow(row(3));scored.dimensions.forEach(d=>{assert.equal(d.score,50);assert.match(d.band.label,/Intermedi|Faixa intermediária/i)});assert.equal(scored.interpretationVersion,'2.1.0')});
test('all 5 => one hundred',()=>scoreRow(row(5)).dimensions.forEach(d=>assert.equal(d.score,100)));
test('risk protective score inverted',()=>{const d=scoreRow(row(5)).dimensions.find(x=>x.id==='D2');assert.equal(d.protectiveScore,0)});
test('invalid response rejected',()=>{const r=row(3);r[QUESTION_HEADERS[20]]='6';assert.throws(()=>scoreRow(r),/ICAPS_INVALID_RESPONSE/)});
test('patient binds exact code before name',()=>{const r={[FIELD.code]:'P-2',[FIELD.name]:'Outro'};const b=bindPatientExact(r,[{id:'1',code:'P-1',name:'Outro'},{id:'2',code:'P-2',name:'Pessoa'}]);assert.equal(b.ok,true);assert.equal(b.patient.id,'2')});
test('code-only identity can be bound',()=>{const r={[FIELD.code]:'P-9',[FIELD.name]:''};const b=bindPatientExact(r,[{id:'9',code:'P-9',name:'Pessoa'}]);assert.equal(b.ok,true);assert.equal(b.patient.id,'9')});
