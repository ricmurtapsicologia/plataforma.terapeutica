import assert from 'node:assert/strict';
import {
  TODAY_TEST_CLEANUP_DATE,
  LIVE_TEST_MAX_MINUTES,
  TODAY_CLEANUP_MAX_MINUTES,
  isPlaceholderRecord,
  isSubstantiveRecord,
  hasSubstantiveRecord,
  isShortTestCandidate,
  isTodayCleanupCandidate,
  resetScheduledTestSession,
  shouldDeleteAdHocTest
} from '../assets/js/clinical-documentation-policy-v374.mjs';

assert.equal(TODAY_TEST_CLEANUP_DATE,'2026-09-02');
assert.equal(LIVE_TEST_MAX_MINUTES,3);
assert.equal(TODAY_CLEANUP_MAX_MINUTES,10);

const scheduled={
  id:'a1',patientId:'p1',date:'2026-09-02',time:'20:00',status:'Realizada',attendanceStatus:'Presente',
  sessionStartedAt:'2026-09-02T23:00:00.000Z',sessionEndedAt:'2026-09-02T23:01:00.000Z',actualDurationMinutes:1,
  clinicalSessionState:'Encerrada',sessionStartSource:'platform-one-click',sessionEndSource:'platform-one-click',
  sessionPreviousStatus:'Confirmada',sessionPreviousAttendanceStatus:''
};
const adHoc={...scheduled,id:'a2',sessionOrigin:'manual-flex-start'};
const runningLong={
  ...scheduled,id:'a3',status:'Confirmada',attendanceStatus:'',actualDurationMinutes:null,
  sessionStartedAt:'2026-09-02T22:00:00.000Z',sessionEndedAt:'',clinicalSessionState:'Em atendimento'
};
const realRecord={id:'r1',patientId:'p1',appointmentId:'a1',text:'Paciente relatou eventos relevantes da semana, pensamentos automáticos, emoções associadas e foram discutidas estratégias de enfrentamento e tarefa terapêutica para o período seguinte.',status:'Rascunho'};
const placeholder={id:'missing_record_a1',patientId:'p1',appointmentId:'a1',text:'Não há prontuário.',source:{type:'missing-record-placeholder'}};

assert.equal(isPlaceholderRecord(placeholder),true);
assert.equal(isSubstantiveRecord(placeholder),false);
assert.equal(isSubstantiveRecord(realRecord),true);
assert.equal(hasSubstantiveRecord([placeholder],scheduled),false);
assert.equal(hasSubstantiveRecord([placeholder,realRecord],scheduled),true);
assert.equal(isShortTestCandidate(scheduled,{date:'2026-09-02',maxMinutes:3,includeRunning:false}),true);
assert.equal(isTodayCleanupCandidate(runningLong,{date:'2026-09-02',nowMs:new Date('2026-09-03T00:45:00.000Z').getTime()}),true);
assert.equal(shouldDeleteAdHocTest(adHoc),true);

const reset=resetScheduledTestSession(scheduled,'2026-09-03T00:00:00.000Z');
assert.equal(reset.status,'Confirmada');
assert.equal(reset.attendanceStatus,'');
assert.equal(reset.sessionStartedAt,'');
assert.equal(reset.sessionEndedAt,'');
assert.equal(reset.clinicalSessionState,'');
assert.equal(reset.actualDurationMinutes,null);
assert.equal(reset.testSessionDiscardedAt,'2026-09-03T00:00:00.000Z');

console.log('CLINICAL_DOCUMENTATION_POLICY_V374_PASS');
