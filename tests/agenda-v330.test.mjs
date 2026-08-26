import fs from 'node:fs';
import assert from 'node:assert/strict';
import {transitionAttendance,appointmentsConflict,AGENDA_VERSION} from '../assets/js/agenda-domain-v330.mjs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const main=read('assets/js/main-v250.js');
const controller=read('assets/js/agenda-controller-v330.js');
const desktop=read('assets/js/modules/appointments.js');
const mobile=read('assets/js/agenda-mobile-v183.js');
const payments=read('assets/js/session-payment-visibility-v322.js');
const css=read('assets/css/agenda-v330.css');

assert.equal(AGENDA_VERSION,'3.3.0');
assert.ok(main.includes('agenda-controller-v330.js'),'canonical agenda controller must boot');
assert.ok(!main.includes('agenda-actions-v240.js'),'legacy agenda action owner must not boot');
assert.ok(desktop.includes('data-action="appointment-open"'),'desktop session card must open canonical controller');
assert.ok(mobile.includes('data-action="appointment-open"'),'mobile session card must open canonical controller');
assert.ok(!desktop.includes('week-mini')&&!desktop.includes('week-event-actions'),'desktop must not render unlabeled micro-actions');
assert.ok(!mobile.includes('appointment-manage'),'mobile must not use legacy appointment-manage');
assert.ok(controller.includes("const OWNER='agenda-controller-v330'"));
assert.equal((controller.match(/document\.addEventListener\('click'/g)||[]).length,1,'agenda controller must register one click dispatcher');
assert.ok(!controller.includes('stopImmediatePropagation'),'agenda controller must not coordinate through stopImmediatePropagation');
assert.ok(controller.includes("putEncrypted('appointments'")&&controller.includes("getDecryptedById('appointments'"),'appointment changes must be persisted and verified');
assert.ok(controller.includes("deleteRecord('appointments'"),'appointment deletion must use canonical tombstone-aware persistence');
assert.ok(controller.includes('agenda-delete-request-v330')&&controller.includes('agenda-delete-confirm-v330'),'deletion must require an explicit confirmation step');
assert.ok(controller.includes('prepareAppointment?.(a.id)'),'new payment must be explicitly linked to the appointment');
assert.ok(!payments.includes("action==='appointment-manage'")&&!payments.includes("action==='appointment-payment-v240'"),'payment module must not own agenda appointment actions');
assert.ok(payments.includes('prepareAppointment:id=>setPending(id)'),'payment module must expose a service API to agenda controller');
assert.ok(!css.includes('font-size:0'),'canonical agenda CSS must never hide action text by zeroing font size');
assert.ok(css.includes('.week-event-actions,.week-mini')&&css.includes('display:none!important'),'legacy micro-action visuals must be neutralized');

const base={id:'a1',status:'Confirmada',attendanceStatus:'',date:'2026-08-26',time:'20:00',duration:50};
const present=transitionAttendance(base,'Presente','2026-08-26T20:50:00.000Z');
assert.equal(present.attendanceStatus,'Presente');assert.equal(present.status,'Realizada');
const missed=transitionAttendance({...base,status:'Cancelada'},'Faltou','2026-08-26T20:50:00.000Z');
assert.equal(missed.attendanceStatus,'Faltou');assert.equal(missed.status,'Confirmada');
const cancelled=transitionAttendance(base,'Desmarcou','2026-08-26T20:50:00.000Z');
assert.equal(cancelled.attendanceStatus,'Desmarcou');assert.equal(cancelled.status,'Cancelada');
assert.throws(()=>transitionAttendance(base,'Talvez'),/inválido/i);

const conflict=appointmentsConflict([{id:'b',date:'2026-08-26',time:'20:20',duration:50,status:'Confirmada'}],base,'a1');
assert.equal(conflict?.id,'b');
const noConflict=appointmentsConflict([{id:'b',date:'2026-08-26',time:'21:00',duration:50,status:'Confirmada'}],base,'a1');
assert.equal(noConflict,null);

console.log('agenda-v330.test.mjs: PASS');
