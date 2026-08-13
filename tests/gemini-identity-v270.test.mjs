import assert from 'node:assert/strict';
import {learnAliasesFromDocuments,identifyPatientFromDocument,participantLabels} from '../assets/js/gemini-identity-v270.mjs';

const patients=[
  {id:'p1',name:'Ana Beatriz',preferredName:'Ana'},
  {id:'p2',name:'Bruno Costa',preferredName:'Bruno'}
];
const historical=`Detalhes\n* O participante Profissional e o participante LOJA AZUL (Ana) discutiram a agenda.\n📖 Transcrição\nProfissional: Boa noite.\nLOJA AZUL: Boa noite.`;
const current=`Resumo\nA sessão ocorreu normalmente.\nPróximas etapas\n* [LOJA AZUL] Executar tarefa.\n📖 Transcrição\nProfissional: Como foi a semana?\nLOJA AZUL: Foi melhor.`;
const learned=learnAliasesFromDocuments({raws:[historical,current],patients,professionalName:'Profissional'});
assert.equal(learned['loja azul'],'p1','deve aprender somente o label participante imediatamente associado ao nome entre parênteses');
assert.equal(Object.keys(learned).some(key=>key.includes('participante profissional')),false,'não deve aprender a frase inteira antes dos parênteses');
const identified=identifyPatientFromDocument({raw:current,patients,professionalName:'Profissional',learnedAliases:learned});
assert.equal(identified.patient?.id,'p1','alias histórico explícito deve identificar a paciente em sessão posterior');
assert.ok(identified.confidence>=.95,'associação automática precisa carregar confiança mínima de 0,95');
assert.deepEqual(participantLabels(current).sort(),['loja azul','profissional']);

const firstOnly=identifyPatientFromDocument({raw:'Ana: Olá',patients,professionalName:'Profissional',learnedAliases:{}});
assert.equal(firstOnly.patient?.id,'p1','primeiro nome único e exato pode resolver identidade');
assert.ok(firstOnly.confidence>=.95);

const misleadingSurname=identifyPatientFromDocument({raw:'Ana Rodrigues: Olá',patients,professionalName:'Profissional',learnedAliases:{}});
assert.equal(misleadingSurname.patient,null,'primeiro nome seguido de sobrenome não reconhecido não pode ser associado por aproximação');

const ambiguousPatients=[{id:'a',name:'Maria Silva',preferredName:'Maria'},{id:'b',name:'Maria Souza',preferredName:'Maria'}];
const ambiguous=identifyPatientFromDocument({raw:'Maria: Olá',patients:ambiguousPatients,professionalName:'Profissional',learnedAliases:{}});
assert.equal(ambiguous.patient,null,'primeiro nome duplicado não pode resolver identidade automaticamente');

const conflictingAlias=identifyPatientFromDocument({raw:'Bruno Costa: Olá',patients,professionalName:'Profissional',learnedAliases:{'bruno costa':'p1'}});
assert.equal(conflictingAlias.patient?.id,'p2','nome completo explícito deve prevalecer sobre alias histórico conflitante');
assert.equal(conflictingAlias.confidence,1);

console.log('gemini-identity-v270: security regression assertions passed');
