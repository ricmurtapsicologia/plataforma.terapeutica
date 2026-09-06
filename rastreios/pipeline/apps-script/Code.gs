const CONFIG_SHEET = 'RastreiosConfig';
const REPORT_SUBJECT = 'Novo relatório de rastreio clínico';
const DERIVED_HEADERS = [
  '__submission_id',
  '__instrument_id',
  '__instrument_version',
  '__score_total',
  '__dimension_scores',
  '__interpretation',
  '__attention_points',
  '__next_step',
  '__report_status',
  '__report_sent_at',
  '__report_error'
];

/**
 * Instala um único gatilho no arquivo de respostas.
 * Executar manualmente uma vez após vincular os Forms ao Google Sheets.
 */
function installScreeningPipeline() {
  const spreadsheet = SpreadsheetApp.getActive();
  const existing = ScriptApp.getProjectTriggers().some(trigger =>
    trigger.getHandlerFunction() === 'onScreeningFormSubmit'
  );
  if (!existing) {
    ScriptApp.newTrigger('onScreeningFormSubmit')
      .forSpreadsheet(spreadsheet)
      .onFormSubmit()
      .create();
  }
}

/**
 * Evento principal. Não publica dados fora do Google Workspace e do e-mail
 * definido em Script Properties.
 */
function onScreeningFormSubmit(event) {
  if (!event || !event.range) throw new Error('FORM_SUBMIT_EVENT_REQUIRED');

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const sheet = event.range.getSheet();
    const row = event.range.getRow();
    const config = loadInstrumentConfig_(sheet.getName());
    if (!config || !config.active) return;

    const recipient = PropertiesService.getScriptProperties().getProperty('REPORT_RECIPIENT');
    if (!recipient) throw new Error('REPORT_RECIPIENT_NOT_CONFIGURED');

    const headerMap = ensureDerivedHeaders_(sheet);
    const currentStatus = String(sheet.getRange(row, headerMap.__report_status).getValue() || '');
    if (currentStatus === 'SENT') return;

    const submissionId = String(sheet.getRange(row, headerMap.__submission_id).getValue() || '') || Utilities.getUuid();
    const answers = readAnswerMap_(sheet, row, headerMap);
    const scoring = scoreSubmission_(config, answers);

    const report = {
      submissionId,
      instrumentId: config.instrumentId,
      instrumentVersion: config.version,
      publicName: config.publicName,
      technicalName: config.technicalName,
      responseSheet: sheet.getName(),
      submittedAt: findAnswer_(answers, ['Carimbo de data/hora', 'Timestamp', 'Data/hora']) || new Date(),
      respondentName: findAnswer_(answers, ['Nome completo', 'Nome', 'Respondente']) || 'Não informado',
      origin: findAnswer_(answers, ['Origem do acesso', 'Como chegou a este rastreio?']) || 'Não informada',
      scoring,
      answers,
      spreadsheetUrl: SpreadsheetApp.getActive().getUrl(),
      safetyFlow: config.safetyFlow
    };

    writeDerived_(sheet, row, headerMap, report);

    try {
      MailApp.sendEmail({
        to: recipient,
        subject: REPORT_SUBJECT,
        body: buildPlainText_(report),
        htmlBody: buildReportHtml_(report),
        name: 'Richelmy Murta | Clínica'
      });
      sheet.getRange(row, headerMap.__report_status).setValue('SENT');
      sheet.getRange(row, headerMap.__report_sent_at).setValue(new Date());
      sheet.getRange(row, headerMap.__report_error).clearContent();
    } catch (mailError) {
      sheet.getRange(row, headerMap.__report_status).setValue('ERROR');
      sheet.getRange(row, headerMap.__report_error).setValue(String(mailError && mailError.message || mailError));
      throw mailError;
    }
  } finally {
    lock.releaseLock();
  }
}

function loadInstrumentConfig_(responseSheetName) {
  const ss = SpreadsheetApp.getActive();
  const configSheet = ss.getSheetByName(CONFIG_SHEET);
  if (!configSheet) throw new Error('CONFIG_SHEET_NOT_FOUND');

  const values = configSheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headers = values[0].map(String);
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const required = ['response_sheet', 'instrument_id', 'version', 'public_name', 'technical_name', 'scorer', 'active', 'safety_flow'];
  required.forEach(header => {
    if (!(header in index)) throw new Error('CONFIG_HEADER_MISSING:' + header);
  });

  const row = values.slice(1).find(item => String(item[index.response_sheet]) === responseSheetName);
  if (!row) return null;

  return {
    responseSheet: responseSheetName,
    instrumentId: String(row[index.instrument_id] || ''),
    version: String(row[index.version] || ''),
    publicName: String(row[index.public_name] || ''),
    technicalName: String(row[index.technical_name] || ''),
    scorer: String(row[index.scorer] || 'pending'),
    active: normalizeBoolean_(row[index.active]),
    safetyFlow: normalizeBoolean_(row[index.safety_flow])
  };
}

function ensureDerivedHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const missing = DERIVED_HEADERS.filter(header => !current.includes(header));
  if (missing.length) {
    sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  return Object.fromEntries(finalHeaders.map((header, i) => [header, i + 1]));
}

function readAnswerMap_(sheet, row, headerMap) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];
  const answers = {};
  headers.forEach((header, i) => {
    if (!header || header.startsWith('__')) return;
    answers[header] = values[i];
  });
  return answers;
}

function scoreSubmission_(config, answers) {
  const registry = {
    pending: scorePending_,
    raw_only: scoreRawOnly_
  };
  const scorer = registry[config.scorer];
  if (!scorer) {
    return {
      state: 'SCORER_PENDING',
      total: '',
      dimensions: {},
      interpretation: 'Correção específica ainda não configurada para esta versão do instrumento.',
      attentionPoints: [],
      nextStep: 'Revisar respostas e integrar o resultado à entrevista clínica.'
    };
  }
  return scorer(answers, config);
}

function scorePending_() {
  return {
    state: 'SCORER_PENDING',
    total: '',
    dimensions: {},
    interpretation: 'Correção específica ainda não configurada para esta versão do instrumento.',
    attentionPoints: [],
    nextStep: 'Revisar respostas e integrar o resultado à entrevista clínica.'
  };
}

function scoreRawOnly_() {
  return {
    state: 'RAW_REVIEW',
    total: '',
    dimensions: {},
    interpretation: 'Resposta registrada para acompanhamento clínico. A interpretação depende da integração com o contexto e de eventual comparação longitudinal.',
    attentionPoints: [],
    nextStep: 'Comparar com aplicações anteriores quando clinicamente pertinente.'
  };
}

function writeDerived_(sheet, row, headerMap, report) {
  const scoring = report.scoring;
  const values = {
    __submission_id: report.submissionId,
    __instrument_id: report.instrumentId,
    __instrument_version: report.instrumentVersion,
    __score_total: scoring.total,
    __dimension_scores: JSON.stringify(scoring.dimensions || {}),
    __interpretation: scoring.interpretation || '',
    __attention_points: JSON.stringify(scoring.attentionPoints || []),
    __next_step: scoring.nextStep || '',
    __report_status: 'PROCESSING',
    __report_sent_at: '',
    __report_error: ''
  };
  Object.keys(values).forEach(header => sheet.getRange(row, headerMap[header]).setValue(values[header]));
}

function buildReportHtml_(report) {
  const scoring = report.scoring;
  const safetyBanner = report.safetyFlow
    ? '<div style="padding:14px 16px;border:1px solid #e6b8c0;background:#fff3f5;border-radius:14px;margin:18px 0"><strong style="color:#8b3040">Fluxo de segurança</strong><div style="margin-top:5px;color:#5b3d43">Este instrumento requer revisão clínica prioritária. A interpretação não deve depender apenas de escore global.</div></div>'
    : '';

  const dimensions = Object.entries(scoring.dimensions || {});
  const dimensionRows = dimensions.length
    ? dimensions.map(([name, value]) => '<tr><td style="padding:8px;border-bottom:1px solid #e5edf0">' + escapeHtml_(name) + '</td><td style="padding:8px;border-bottom:1px solid #e5edf0;text-align:right;font-weight:700">' + escapeHtml_(value) + '</td></tr>').join('')
    : '<tr><td colspan="2" style="padding:10px;color:#6b7e86">Sem dimensões automatizadas nesta versão.</td></tr>';

  const answers = Object.entries(report.answers || {}).map(([question, value]) =>
    '<div style="padding:11px 0;border-bottom:1px solid #edf2f4"><div style="font-size:12px;color:#6b7e86;margin-bottom:3px">' + escapeHtml_(question) + '</div><div style="color:#20343d">' + escapeHtml_(formatValue_(value)) + '</div></div>'
  ).join('');

  return '<!doctype html><html><body style="margin:0;background:#f3f7f9;font-family:Arial,sans-serif;color:#20343d">' +
    '<div style="max-width:760px;margin:0 auto;padding:24px">' +
      '<div style="background:#2f748b;color:#fff;border-radius:18px 18px 0 0;padding:22px 24px">' +
        '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">Richelmy Murta | Clínica</div>' +
        '<h1 style="font-size:24px;margin:7px 0 0">Relatório de rastreio</h1>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #dce9ed;border-top:0;border-radius:0 0 18px 18px;padding:24px">' +
        '<h2 style="margin:0 0 4px;font-size:20px">' + escapeHtml_(report.publicName) + '</h2>' +
        '<div style="color:#6b7e86;font-size:13px">' + escapeHtml_(report.technicalName) + ' · versão ' + escapeHtml_(report.instrumentVersion) + '</div>' +
        safetyBanner +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:18px 0">' +
          infoChip_('Respondente', report.respondentName) + infoChip_('Origem', report.origin) + infoChip_('ID', report.submissionId) +
        '</div>' +
        '<div style="padding:16px;background:#eef6f8;border-radius:14px;margin:18px 0">' +
          '<div style="font-size:12px;color:#627983;text-transform:uppercase;letter-spacing:.08em">Leitura automática</div>' +
          '<div style="margin-top:7px;line-height:1.55">' + escapeHtml_(scoring.interpretation || '') + '</div>' +
        '</div>' +
        '<h3 style="font-size:16px;margin:24px 0 8px">Perfil dimensional</h3>' +
        '<table style="width:100%;border-collapse:collapse">' + dimensionRows + '</table>' +
        '<h3 style="font-size:16px;margin:24px 0 8px">Próximo passo</h3>' +
        '<div style="line-height:1.55">' + escapeHtml_(scoring.nextStep || 'Integrar à entrevista clínica.') + '</div>' +
        '<h3 style="font-size:16px;margin:24px 0 8px">Respostas registradas</h3>' + answers +
        '<div style="margin-top:22px;padding-top:14px;border-top:1px solid #e5edf0;color:#6b7e86;font-size:12px;line-height:1.5">' +
          'Este relatório organiza dados de rastreio e não estabelece diagnóstico. Submission ID: ' + escapeHtml_(report.submissionId) + '.' +
        '</div>' +
      '</div>' +
    '</div></body></html>';
}

function buildPlainText_(report) {
  return [
    'RELATÓRIO DE RASTREIO',
    report.publicName + ' — ' + report.technicalName,
    'Versão: ' + report.instrumentVersion,
    'Respondente: ' + report.respondentName,
    'Origem: ' + report.origin,
    'Submission ID: ' + report.submissionId,
    '',
    'Leitura automática:',
    report.scoring.interpretation || '',
    '',
    'Próximo passo:',
    report.scoring.nextStep || 'Integrar à entrevista clínica.',
    '',
    'Este relatório organiza dados de rastreio e não estabelece diagnóstico.'
  ].join('\n');
}

function infoChip_(label, value) {
  return '<div style="border:1px solid #dce9ed;border-radius:12px;padding:9px 11px;min-width:140px">' +
    '<div style="font-size:11px;color:#6b7e86">' + escapeHtml_(label) + '</div>' +
    '<div style="font-weight:700;margin-top:2px">' + escapeHtml_(formatValue_(value)) + '</div></div>';
}

function findAnswer_(answers, candidates) {
  for (const candidate of candidates) {
    if (Object.prototype.hasOwnProperty.call(answers, candidate) && String(answers[candidate]).trim()) return answers[candidate];
  }
  return '';
}

function normalizeBoolean_(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toLowerCase();
  return ['true', 'sim', '1', 'yes', 'ativo'].includes(text);
}

function formatValue_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  if (Array.isArray(value)) return value.join(', ');
  return String(value == null ? '' : value);
}

function escapeHtml_(value) {
  return formatValue_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
