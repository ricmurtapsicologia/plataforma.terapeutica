import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sessionPhase,selectPatientSession,elapsedSeconds,formatElapsed,finalDurationMinutes,meetUrlFromEvent} from '../assets/js/clinical-session-domain-v370.mjs';

const today='2026-09-02';
const now=new Date('2026-09-02T20:05:00-03:00').getTime();
const scheduled={id:'a1',patientId:'p1',date:today,time:'20:00',status:'Confirmada'};
const future={id:'a2',patientId:'p1',date:'2026-09-03',time:'08:00',status:'Confirmada'};
const completed={id:'a3',patientId:'p1',date:today,time:'18:00',status:'Realizada',attendanceStatus:'Presente'};
const running={id:'a4',patientId:'p1',date:today,time:'19:00',status:'Confirmada',sessionStartedAt:'2026-09-02T19:55:00-03:00',clinicalSessionState:'Em atendimento'};

assert.equal(sessionPhase(scheduled),'scheduled');
assert.equal(sessionPhase(completed),'ended');
assert.equal(sessionPhase(running),'in_progress');
assert.equal(selectPatientSession([scheduled,future,completed],'p1',today,now).id,'a1');
assert.equal(selectPatientSession([scheduled,future,running],'p1',today,now).id,'a4');
assert.equal(elapsedSeconds(running,new Date('2026-09-02T20:05:00-03:00').getTime()),600);
assert.equal(formatElapsed(600),'00:10:00');
assert.equal(finalDurationMinutes('2026-09-02T19:55:00-03:00','2026-09-02T20:45:30-03:00'),51);
assert.equal(meetUrlFromEvent({hangoutLink:'https://meet.google.com/abc-defg-hij'}),'https://meet.google.com/abc-defg-hij');
assert.equal(meetUrlFromEvent({conferenceData:{entryPoints:[{entryPointType:'phone',uri:'tel:+1'},{entryPointType:'video',uri:'https://meet.google.com/xyz-abcd-efg'}]}}),'https://meet.google.com/xyz-abcd-efg');

const calendar=fs.readFileSync('assets/js/google-calendar-service-v240.js','utf8');
const runtime=fs.readFileSync('assets/js/clinical-session-runtime-v370.js','utf8');
const header=fs.readFileSync('assets/js/clinical-session-header-v371.js','utf8');
const main=fs.readFileSync('assets/js/main-v250.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const adapter=fs.readFileSync('assets/js/calendar-adapter-v300.js','utf8');
const version=fs.readFileSync('assets/js/version.js','utf8');
const versionMatch=version.match(/APP_VERSION='([^']+)'/);
assert.ok(versionMatch,'APP_VERSION must be declared');
const APP_VERSION=versionMatch[1];

for(const needle of ['conferenceDataVersion=1',"conferenceSolutionKey:{type:'hangoutsMeet'}",'ensureMeetForAppointment','meetUrlFromEvent'])assert.ok(calendar.includes(needle),`Calendar missing ${needle}`);
assert.ok(calendar.includes("method:'PATCH'"),'Calendar updates must use PATCH so existing Meet data is preserved');
for(const needle of ['sessionStartedAt','sessionEndedAt','actualDurationMinutes','getDecryptedById','clinical-session-start-v370','clinical-session-end-v370',"window.open('about:blank'",'clinical-session-start-flex-v372','createAdHocAppointment','manual-flex-start','rollbackAdHoc','startFlexibleSession','meetWindows','meetWindowMonitors','trackMeetWindow','autoEndFromMeetClose','meet-window-closed','clinical-session-auto-end-v373'])assert.ok(runtime.includes(needle),`Session runtime missing ${needle}`);
assert.ok(!runtime.includes("window.open(url,'_blank','noopener,noreferrer')"),'Meet reopening must retain a trackable WindowProxy so closing the tab can stop the timer');
for(const needle of ['clinical-session-start-flex-v372','Sem sessão aberta hoje','Iniciar nova sessão'])assert.ok(header.includes(needle),`Flexible session header missing ${needle}`);
assert.ok(!header.includes('data-v3-action-menu'),'Patient header must not expose generic action-menu marker that can intercept session clicks');
assert.ok(!header.includes('disabled title="Sem sessão agendada para hoje"'),'No-schedule state must not disable session start');
assert.ok(index.includes(`clinical-session-header-v371.js?v=${APP_VERSION}&rev=session-flex-runtime-20260903`),'Index must cache-bust flexible session header with canonical version');
assert.ok(index.includes(`main-v250.js?v=${APP_VERSION}&rev=icaps-v400-20260902`),'Index must cache-bust canonical runtime loader with canonical version');
assert.ok(main.includes('icaps-v400-20260902'),'Canonical runtime imports must use current cache key');
assert.ok(main.includes('clinical-session-runtime-v370.js'),'Canonical main must boot clinical session runtime');
assert.ok(!main.includes('calendar-reverse-reconcile-v276.js'),'Reverse reconciliation must not be double-booted by main');
assert.ok(adapter.includes('calendar-reverse-reconcile-v276.js'),'Calendar adapter must own v276 reconciliation');

console.log('CLINICAL_SESSION_V370_PASS');