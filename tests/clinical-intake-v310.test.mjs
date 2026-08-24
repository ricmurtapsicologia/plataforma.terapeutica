import assert from 'node:assert/strict';
import {
  FIELD,REVIEW_STATUS,REQUIRED_HEADERS,
  parseCsv,rowsToObjects,normalizeIdentity,bindPatientExact,rowFingerprint,
  isExplicitNegative,reviewFlags,buildStructuredAnalysis,buildClinicalIntakeArtifact,sanitizedLedgerEntry
} from '../assets/js/clinical-intake-core-v310.mjs';

function baseRow(overrides={}){
  const row=Object.fromEntries(REQUIRED_HEADERS.map(h=>[h,'Resposta']));
  Object.assign(row,{
    [FIELD.timestamp]:'24/08/2026 16:40:00',
    [FIELD.name]:'Paciente Sintético',
    [FIELD.reason]:'Quero organizar melhor minhas dificuldades atuais.',
    [FIELD.currentDifficulty]:'Tenho enfrentado um período de sobrecarga.',
    [FIELD.impact]:'Moderado',
    [FIELD.impactAreas]:'Rotina',
    [FIELD.responsePattern]:'Fico mais retraído.',
    [FIELD.priorTherapy]:'Não',
    [FIELD.medication]:'Não',
    [FIELD.desiredChange]:'Quero lidar melhor com a rotina.',
    [FIELD.urgentSafety]:'Não'
  },overrides);
  return row;
}

function csvCell(value){return `"${String(value??'').replaceAll('"','""')}"`}

{
  const csv='A,B,C\n1,"texto, com vírgula","linha 1\nlinha 2"\n2,"aspas ""internas""",fim';
  const rows=parseCsv(csv);
  assert.equal(rows.length,3);
  assert.equal(rows[1][1],'texto, com vírgula');
  assert.equal(rows[1][2],'linha 1\nlinha 2');
  assert.equal(rows[2][1],'aspas "internas"');
}

{
  const row=baseRow();
  const header=REQUIRED_HEADERS.map(csvCell).join(',');
  const values=REQUIRED_HEADERS.map(h=>csvCell(row[h])).join(',');
  const objects=rowsToObjects(parseCsv(`${header}\n${values}`));
  assert.equal(objects.length,1);
  assert.equal(objects[0][FIELD.name],'Paciente Sintético');
}

assert.equal(normalizeIdentity('  João  D’Ávila '),'joao d avila');

{
  const row=baseRow();
  const exact=bindPatientExact(row,[{id:'p1',name:'Paciente Sintético'},{id:'p2',name:'Outra Pessoa'}]);
  assert.equal(exact.ok,true);
  assert.equal(exact.patient.id,'p1');
  const ambiguous=bindPatientExact(row,[{id:'p1',name:'Paciente Sintético'},{id:'p2',name:'Paciente Sintético'}]);
  assert.equal(ambiguous.ok,false);
  assert.equal(ambiguous.reason,'AMBIGUOUS_PATIENT_BINDING');
  const missing=bindPatientExact(row,[{id:'p2',name:'Outra Pessoa'}]);
  assert.equal(missing.reason,'PATIENT_NOT_FOUND');
}

assert.equal(isExplicitNegative('Não'),true);
assert.equal(isExplicitNegative('No momento não'),true);
assert.equal(isExplicitNegative('Sim, há uma situação que preciso conversar'),false);

{
  const safe=reviewFlags(baseRow({[FIELD.urgentSafety]:'Não'}));
  assert.equal(safe.some(x=>x.code==='PRIORITY_SAFETY_REVIEW'),false);
  const priority=reviewFlags(baseRow({[FIELD.urgentSafety]:'Sim, preciso conversar sobre isso.'}));
  assert.equal(priority.some(x=>x.code==='PRIORITY_SAFETY_REVIEW'),true);
}

{
  const row=baseRow({[FIELD.urgentSafety]:'Não'});
  const fingerprint=await rowFingerprint(row);
  assert.match(fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(fingerprint,await rowFingerprint({...row}));
  const artifact=buildClinicalIntakeArtifact({patient:{id:'p1',name:'Paciente Sintético'},row,fingerprint,now:'2026-08-24T19:50:00.000Z'});
  assert.equal(artifact.patientId,'p1');
  assert.equal(artifact.status,REVIEW_STATUS);
  assert.equal(artifact.reviewRequired,true);
  assert.equal(artifact.autonomousDiagnosis,false);
  assert.equal(artifact.originalPreserved,true);
  assert.equal(artifact.intake.inferenceGenerated,false);
  assert.equal(artifact.intake.factProvenance,'PATIENT_REPORTED');
  assert.match(artifact.text,/Não produz diagnóstico/i);
  assert.match(artifact.text,/sobrecarga/i);
  assert.equal(artifact.source.rowFingerprint,fingerprint);
}

{
  const analysis=buildStructuredAnalysis(baseRow({[FIELD.urgentSafety]:'Sim, há algo urgente.'}));
  assert.equal(analysis.priorityHumanReview,true);
  assert.equal(analysis.autonomousDiagnosis,false);
  assert.equal(analysis.inferenceGenerated,false);
}

{
  const ledger=sanitizedLedgerEntry('a'.repeat(64),'IMPORTED','2026-08-24T19:50:00.000Z');
  assert.deepEqual(Object.keys(ledger).sort(),['at','fingerprint','state']);
  assert.equal(JSON.stringify(ledger).includes('Paciente Sintético'),false);
}

console.log('Clinical Intake v3.1.0: PASS');
