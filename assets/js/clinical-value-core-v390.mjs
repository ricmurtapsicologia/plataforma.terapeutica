// Funções puras: dados sintéticos nos testes; nenhuma informação de paciente no código público.
export const PROGRESS_KIND = 'clinicalProgressMeasurement';
export const REVIEWED_PLAN_KIND = 'clinicalPlanReviewedVersion';
const array = value => Array.isArray(value) ? value : [];
const clean = value => String(value ?? '').trim();
const byNewest = (a, b) => clean(b.createdAt || b.updatedAt).localeCompare(clean(a.createdAt || a.updatedAt));
const activeGoal = goal => !['Alcançado', 'Pausado'].includes(clean(goal.status));

export function resolvePlanReference(notes, patientId) {
  const versions = array(notes).filter(note => note.patientId === patientId && note.kind === REVIEWED_PLAN_KIND).sort(byNewest);
  const approved = versions.find(note => note.status === 'Validado pelo profissional' && note.reviewRequired !== true && clean(note.text));
  const assisted = array(notes).filter(note => note.patientId === patientId && note.kind === 'therapeuticActionPlan').sort((a,b) => clean(b.updatedAt).localeCompare(clean(a.updatedAt)))[0] || null;
  const newest = versions[0] || null;
  const newerDraft = Boolean(approved && newest && newest.id !== approved.id && clean(newest.createdAt || newest.updatedAt) > clean(approved.createdAt || approved.updatedAt));
  return {
    source: approved ? 'reviewed' : assisted ? 'assisted' : 'none',
    approved: approved || null,
    assisted,
    newerDraft,
    text: approved ? clean(approved.text) : '',
    reviewedAt: approved ? clean(approved.createdAt || approved.updatedAt) : '',
    version: approved ? Number(approved.versionNumber || 0) : null
  };
}

export function measurementKey(record) {
  return clean(record?.method) + '|' + clean(record?.orientation) + '|0-10';
}

const validDate = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(date))) return false;
  const check = new Date(date + 'T12:00:00Z');
  return Number.isFinite(check.getTime()) && check.toISOString().slice(0,10) === date;
};

export function makeProgressRecord(input) {
  const {id, patientId, goalId, goal, date, score, method, orientation, now, today, note = '', sessionId = '', supersedesId = '', previous = null} = input;
  if (!clean(id) || !clean(patientId) || !clean(goalId) || goal?.id !== goalId || goal?.patientId !== patientId) throw new Error('Objetivo e paciente não correspondem.');
  if (!validDate(date) || (today && date > today)) throw new Error('Informe uma data válida não futura.');
  const rating = Number(score);
  if (clean(score) === '' || !Number.isFinite(rating) || rating < 0 || rating > 10 || Math.round(rating * 10) !== rating * 10) throw new Error('Informe uma pontuação entre 0 e 10, com até uma casa decimal.');
  if (!['autorreferida','observacao'].includes(method)) throw new Error('A procedência da medida é obrigatória.');
  if (!['maior-melhor','maior-pior'].includes(orientation)) throw new Error('Informe o significado da pontuação.');
  if (!validDate(clean(now).slice(0,10))) throw new Error('Data de registro inválida.');
  if (clean(note).length > 1000) throw new Error('Observação acima do limite.');
  if (supersedesId && (!previous || previous.id !== supersedesId || previous.kind !== PROGRESS_KIND || previous.patientId !== patientId || previous.goalId !== goalId)) throw new Error('A correção deve referenciar uma medida válida do mesmo paciente e objetivo.');
  return {
    id, patientId, goalId, kind: PROGRESS_KIND, date, value: rating, minValue: 0, maxValue: 10,
    method, orientation, metricKey: method + '|' + orientation + '|0-10',
    sessionId: clean(sessionId), note: clean(note), supersedesId: clean(supersedesId),
    status: 'Validado pelo profissional', requiresReview: false, createdAt: now, updatedAt: now,
    source: {type:'manual-professional', version:'3.9.0'}, scaleDescription: 'Escala descritiva personalizada de 0 a 10; não é instrumento psicométrico.'
  };
}

export function progressSeries(notes, patientId, goalId, selectedKey = '') {
  const all = array(notes).filter(note =>
    note.kind === PROGRESS_KIND && note.patientId === patientId && note.goalId === goalId &&
    note.status === 'Validado pelo profissional' && validDate(note.date) &&
    Number.isFinite(Number(note.value)) && Number(note.value) >= 0 && Number(note.value) <= 10 &&
    ['autorreferida','observacao'].includes(note.method) && ['maior-melhor','maior-pior'].includes(note.orientation)
  );
  const superseded = new Set(all.map(note => note.supersedesId).filter(Boolean));
  const current = all.filter(note => !superseded.has(note.id)).sort((a,b) =>
    clean(a.date).localeCompare(clean(b.date)) || clean(a.createdAt).localeCompare(clean(b.createdAt))
  );
  const groups = [...new Set(current.map(measurementKey))];
  const defaultKey = current.length ? measurementKey(current[current.length-1]) : '';
  const key = groups.includes(selectedKey) ? selectedKey : defaultKey;
  return {key, records: current.filter(note => measurementKey(note) === key), total:current.length, groups, distinctMethods:groups.length};
}

export function clinicalValueSignals({patientId, notes, goals, tasks, today}) {
  const plan = resolvePlanReference(notes, patientId);
  const active = array(goals).filter(goal => goal.patientId === patientId && activeGoal(goal));
  const due = active.filter(goal => goal.reviewDate && validDate(goal.reviewDate) && goal.reviewDate < today);
  const withoutMeasure = active.filter(goal => progressSeries(notes, patientId, goal.id).total === 0);
  const withoutBaseline = active.filter(goal => !clean(goal.baseline));
  const pendingTasks = array(tasks).filter(task => task.patientId === patientId && !['Concluída','Respondida','Cancelada'].includes(clean(task.status)));
  return {plan, activeCount:active.length, due, withoutMeasure, withoutBaseline, pendingTasks};
}

export function progressDescription(series) {
  const records = series?.records || [];
  if (!records.length) return 'Sem medidas comparáveis registradas.';
  const first = records[0], last = records[records.length - 1];
  if (records.length === 1) return 'Uma medida registrada. Ainda não há trajetória comparável.';
  const diff = Math.round((Number(last.value) - Number(first.value)) * 10) / 10;
  const trend = diff === 0 ? 'sem alteração numérica' : diff > 0 ? 'aumento de ' + diff : 'redução de ' + Math.abs(diff);
  return 'Variação descritiva: ' + trend + ' ponto(s), entre ' + first.date + ' e ' + last.date + '. Não demonstra causalidade nem substitui interpretação clínica.';
}


/** Confere a prova local de que o MESMO backup, do MESMO cofre, foi testado. */
export function assessBackupGate(backup, validation, nowMs=Date.now()) {
  const stamp=v=>typeof v==='string'&&v?Date.parse(v):NaN;
  if(!backup?.lastBackupAt || !backup?.lastBackupDigest || !backup?.vaultDigest || !backup?.lastBackupExportedAt)
    return {ok:false,code:'BACKUP_REQUIRED',message:'Gere um novo backup .rmvault neste navegador.'};
  if(validation?.ok!==true || !validation.backupDigest || !validation.vaultDigest)
    return {ok:false,code:'RESTORE_REQUIRED',message:'Teste a restauração isolada do backup recém-gerado.'};
  if(backup.lastBackupDigest!==validation.backupDigest || backup.vaultDigest!==validation.vaultDigest || backup.lastBackupExportedAt!==validation.exportedAt)
    return {ok:false,code:'BACKUP_MISMATCH',message:'O arquivo testado não corresponde ao backup mais recente deste cofre. Selecione o arquivo recém-gerado.'};
  const backupAt=stamp(backup.lastBackupAt),testAt=stamp(validation.testedAt);
  if(!Number.isFinite(backupAt)||!Number.isFinite(testAt)||!Number.isFinite(nowMs)||
     backupAt>nowMs+60000 || testAt>nowMs+60000 || testAt+60000<backupAt ||
     nowMs-backupAt>7*86400000 || nowMs-testAt>7*86400000 ||
     backup.days===null || !Number.isFinite(backup.days) || backup.days>7)
    return {ok:false,code:'BACKUP_STALE',message:'Backup e teste de restauração devem ser recentes e cronologicamente válidos.'};
  return {ok:true,code:'READY',message:'Backup e restauração isolada deste cofre comprovados.'};
}
