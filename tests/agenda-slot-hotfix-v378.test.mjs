import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  agendaSlotTime,appointmentSeriesDates,patientCanSchedule,appointmentsConflict
} from '../assets/js/agenda-domain-v330.mjs';

test('grade de 30 minutos cobre 06:00 a 23:30 sem lacunas',()=>{
  const slots=Array.from({length:36},(_,i)=>agendaSlotTime(i));
  assert.equal(slots[0],'06:00');
  assert.equal(slots[1],'06:30');
  assert.equal(slots[8],'10:00');
  assert.equal(slots[35],'23:30');
  assert.equal(new Set(slots).size,36);
  assert.throws(()=>agendaSlotTime(-1));
  assert.throws(()=>agendaSlotTime(36));
});

test('recorrência semanal, quinzenal, avulsa e virada de ano',()=>{
  assert.deepEqual(appointmentSeriesDates('2026-11-03','Semanal',3),['2026-11-03','2026-11-10','2026-11-17']);
  assert.deepEqual(appointmentSeriesDates('2026-12-25','Quinzenal',2),['2026-12-25','2027-01-08']);
  assert.deepEqual(appointmentSeriesDates('2026-11-03','Avulso',52),['2026-11-03']);
  assert.throws(()=>appointmentSeriesDates('2026-02-30'));
  assert.throws(()=>appointmentSeriesDates('2026-11-03','Semanal',53));
});

test('pacientes encerrados/inativos ficam inelegíveis',()=>{
  assert.equal(patientCanSchedule({id:'p1',status:'Ativo'}),true);
  assert.equal(patientCanSchedule({id:'p1',status:'Aguardando retorno'}),true);
  assert.equal(patientCanSchedule({id:'p1',status:'Encerrado'}),false);
  assert.equal(patientCanSchedule({id:'p1',status:'Inativo'}),false);
  assert.equal(patientCanSchedule(null),false);
});

test('conflitos incluem sobreposição, excluem adjacência e cancelamento',()=>{
  const a={id:'s1',date:'2026-11-04',time:'10:00',duration:50,status:'Confirmada'};
  const candidate={id:'s2',date:'2026-11-04',time:'10:30',duration:50};
  assert.equal(appointmentsConflict([a],candidate)?.id,'s1');
  assert.equal(appointmentsConflict([a],{...candidate,time:'10:50'}),null);
  assert.equal(appointmentsConflict([{...a,status:'Cancelada'}],candidate),null);
  assert.equal(appointmentsConflict([a],candidate,'s1'),null);
});

test('grade, mobile e formulário compartilham ação de agendamento',()=>{
  const grid=readFileSync(new URL('../assets/js/modules/appointments.js',import.meta.url),'utf8');
  const mobile=readFileSync(new URL('../assets/js/agenda-mobile-v183.js',import.meta.url),'utf8');
  const core=readFileSync(new URL('../assets/js/app-core-v150.js',import.meta.url),'utf8');
  const clinical=readFileSync(new URL('../assets/js/clinical-v136.js',import.meta.url),'utf8');
  assert.match(grid,/data-action="agenda-slot-open"/);
  assert.match(mobile,/data-action="agenda-slot-open"/);
  assert.match(core,/a==='agenda-slot-open'/);
  assert.match(core,/patientOptions\(selectedForForm\)/);
  assert.match(clinical,/patientId=q\('#a-patient'\)\?\.value\|\|''/);
  assert.match(clinical,/bulkPutEncryptedAtomic\(/);
  assert.match(clinical,/verify:true/);
});

test('versão do entrypoint e do runtime alinhadas',()=>{
  const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const entry=readFileSync(new URL('../assets/js/main-v250.js',import.meta.url),'utf8');
  const version=readFileSync(new URL('../assets/js/version.js',import.meta.url),'utf8');
  assert.match(index,/main-v250\.js\?v=3\.7\.8/);
  assert.match(entry,/3\.7\.8-main-v250/);
  assert.match(version,/APP_VERSION='3\.7\.8'/);
});
