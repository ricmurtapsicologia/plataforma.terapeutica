const CODEPENDENCIA_RECEIPT_SHEET = '_RECEIPTS_Codependencia';
const CODEPENDENCIA_GATEWAY_SECRET_PROPERTY = 'CODEPENDENCIA_GATEWAY_SECRET';
const CODEPENDENCIA_WEBAPP_CONTRACT_VERSION = '1.0';
const CODEPENDENCIA_RECEIPT_HEADERS = [
  'submission_id',
  'status',
  'form_response_id',
  'received_at',
  'form_submitted_at',
  'email_sent_at',
  'error'
];

/**
 * Web App clínico de bastidor para a Codependência.
 *
 * O navegador NUNCA chama este endpoint diretamente. O proxy Vercel envia o
 * segredo privado em gatewaySecret e recebe apenas um recibo operacional.
 * Respostas clínicas ficam restritas ao Google Form/Sheet e ao relatório por e-mail.
 */
function doPost(e) {
  try {
    const payload = parseCodependenciaWebPayload_(e);
    authorizeCodependenciaGateway_(payload.gatewaySecret);
    delete payload.gatewaySecret;
    validateCodependenciaWebPayload_(payload);
    const receipt = processCodependenciaSubmissionV1_(payload);
    return codependenciaJson_(receipt);
  } catch (error) {
    return codependenciaJson_({
      ok: false,
      persisted: false,
      reportSent: false,
      error: String(error && error.message || 'INTERNAL_ERROR').slice(0, 160)
    });
  }
}

function doGet() {
  const props = PropertiesService.getScriptProperties();
  const ready = Boolean(
    String(props.getProperty(CODEPENDENCIA_FORM_PROPERTY) || '').trim() &&
    String(props.getProperty(CODEPENDENCIA_GATEWAY_SECRET_PROPERTY) || '').trim() &&
    String(props.getProperty('REPORT_RECIPIENT') || '').trim()
  );
  return codependenciaJson_({ok: true, service: 'codependencia-webapp', ready: ready});
}

function parseCodependenciaWebPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('REQUEST_BODY_REQUIRED');
  let payload;
  try {
    payload = JSON.parse(String(e.postData.contents));
  } catch (error) {
    throw new Error('INVALID_JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_PAYLOAD');
  return payload;
}

function authorizeCodependenciaGateway_(provided) {
  const expected = String(PropertiesService.getScriptProperties().getProperty(CODEPENDENCIA_GATEWAY_SECRET_PROPERTY) || '');
  if (!expected) throw new Error('GATEWAY_SECRET_NOT_CONFIGURED');
  const a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(provided || ''), Utilities.Charset.UTF_8);
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected, Utilities.Charset.UTF_8);
  if (a.length !== b.length) throw new Error('UNAUTHORIZED');
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= (a[i] ^ b[i]);
  if (mismatch !== 0) throw new Error('UNAUTHORIZED');
}

function validateCodependenciaWebPayload_(payload) {
  if (payload.instrumentId !== 'codependencia') throw new Error('INSTRUMENT_ID_MISMATCH');
  if (String(payload.contractVersion || '') !== CODEPENDENCIA_WEBAPP_CONTRACT_VERSION) throw new Error('CONTRACT_VERSION_MISMATCH');
  if (!/^[A-Za-z0-9_-]{16,96}$/.test(String(payload.submissionId || ''))) throw new Error('INVALID_SUBMISSION_ID');
  const identity = payload.identity;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new Error('INVALID_IDENTITY');
  const identityKeys = Object.keys(identity).sort();
  if (JSON.stringify(identityKeys) !== JSON.stringify(['applicationDate','birthDate','name'])) throw new Error('INVALID_IDENTITY_SET');
  const name = String(identity.name || '').trim();
  if (name.length < 2 || name.length > 120) throw new Error('INVALID_NAME');
  validateCodependenciaIsoDate_(identity.birthDate, 'BIRTH_DATE');
  validateCodependenciaIsoDate_(identity.applicationDate, 'APPLICATION_DATE');
  if (String(identity.birthDate) > String(identity.applicationDate)) throw new Error('BIRTH_DATE_AFTER_APPLICATION');

  const answers = payload.answers;
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('INVALID_RESPONSE_SET');
  const keys = Object.keys(answers).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const expected = Array.from({length: 40}, (_, i) => 'q' + (i + 1));
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error('INVALID_RESPONSE_SET');
  expected.forEach(key => {
    if (!['1','2','3','4','5'].includes(String(answers[key]))) throw new Error('INVALID_RESPONSE:' + key);
  });
}

function validateCodependenciaIsoDate_(value, field) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('INVALID_' + field);
  const parsed = new Date(text + 'T12:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error('INVALID_' + field);
}

function processCodependenciaSubmissionV1_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActive();
    if (!ss) throw new Error('ACTIVE_SPREADSHEET_REQUIRED');
    const receiptSheet = getCodependenciaReceiptSheet_(ss);
    const existing = findCodependenciaReceipt_(receiptSheet, payload.submissionId);
    if (existing) {
      if (existing.status === 'EMAIL_SENT') {
        return {
          ok: true,
          persisted: true,
          reportSent: true,
          submissionId: payload.submissionId,
          receiptState: 'EMAIL_SENT'
        };
      }
      throw new Error('AMBIGUOUS_EXISTING_SUBMISSION:' + existing.status);
    }

    const row = appendCodependenciaReceipt_(receiptSheet, payload.submissionId);
    const props = PropertiesService.getScriptProperties();
    const formId = String(props.getProperty(CODEPENDENCIA_FORM_PROPERTY) || '').trim();
    if (!formId) {
      updateCodependenciaReceipt_(receiptSheet, row, 'CONFIG_ERROR', '', '', '', 'FORM_NOT_PROVISIONED');
      throw new Error('CODEPENDENCIA_FORM_NOT_PROVISIONED');
    }
    const recipient = String(props.getProperty('REPORT_RECIPIENT') || '').trim();
    if (!recipient) {
      updateCodependenciaReceipt_(receiptSheet, row, 'CONFIG_ERROR', '', '', '', 'REPORT_RECIPIENT_NOT_CONFIGURED');
      throw new Error('REPORT_RECIPIENT_NOT_CONFIGURED');
    }

    const contract = loadCodependenciaContractV1_();
    validateCodependenciaContractV1_(contract);
    const form = FormApp.openById(formId);
    validateProvisionedCodependenciaForm_(form, contract);

    updateCodependenciaReceipt_(receiptSheet, row, 'FORM_SUBMITTING', '', '', '', '');
    let submitted;
    try {
      submitted = buildCodependenciaFormResponse_(ss, form, contract, payload).submit();
    } catch (error) {
      updateCodependenciaReceipt_(receiptSheet, row, 'FORM_AMBIGUOUS', '', '', '', String(error && error.message || error).slice(0, 160));
      throw new Error('FORM_SUBMISSION_AMBIGUOUS_MANUAL_REVIEW_REQUIRED');
    }
    const responseId = String(submitted && submitted.getId && submitted.getId() || '');
    const formSubmittedAt = new Date();
    updateCodependenciaReceipt_(receiptSheet, row, 'FORM_SUBMITTED', responseId, formSubmittedAt, '', '');

    const report = buildCodependenciaRawReport_(payload, contract, responseId, formSubmittedAt);
    updateCodependenciaReceipt_(receiptSheet, row, 'EMAIL_SENDING', responseId, formSubmittedAt, '', '');
    try {
      MailApp.sendEmail({
        to: recipient,
        subject: REPORT_SUBJECT,
        body: buildPlainText_(report),
        htmlBody: buildReportHtml_(report),
        name: 'Richelmy Murta | Clínica'
      });
    } catch (error) {
      updateCodependenciaReceipt_(receiptSheet, row, 'EMAIL_AMBIGUOUS', responseId, formSubmittedAt, '', String(error && error.message || error).slice(0, 160));
      throw new Error('EMAIL_DELIVERY_AMBIGUOUS_MANUAL_REVIEW_REQUIRED');
    }
    const emailSentAt = new Date();
    updateCodependenciaReceipt_(receiptSheet, row, 'EMAIL_SENT', responseId, formSubmittedAt, emailSentAt, '');
    return {
      ok: true,
      persisted: true,
      reportSent: true,
      submissionId: payload.submissionId,
      receiptState: 'EMAIL_SENT'
    };
  } finally {
    lock.releaseLock();
  }
}

function buildCodependenciaFormResponse_(ss, form, contract, payload) {
  const map = loadCodependenciaFormItemMap_(ss);
  const itemsById = {};
  form.getItems().forEach(item => { itemsById[String(item.getId())] = item; });
  const response = form.createResponse();
  contract.identity.forEach(field => {
    const item = itemsById[map[field.key] && map[field.key].itemId];
    if (!item) throw new Error('FORM_ITEM_NOT_FOUND:' + field.key);
    const value = field.key === 'name' ? payload.identity.name : (field.key === 'birth' ? payload.identity.birthDate : payload.identity.applicationDate);
    if (item.getType() === FormApp.ItemType.TEXT) {
      response.withItemResponse(item.asTextItem().createResponse(String(value)));
    } else if (item.getType() === FormApp.ItemType.DATE) {
      response.withItemResponse(item.asDateItem().createResponse(new Date(String(value) + 'T12:00:00Z')));
    } else {
      throw new Error('IDENTITY_ITEM_TYPE_MISMATCH:' + field.key);
    }
  });
  contract.items.forEach(itemContract => {
    const mapped = map[itemContract.key];
    const item = itemsById[mapped && mapped.itemId];
    if (!item || item.getType() !== FormApp.ItemType.MULTIPLE_CHOICE) throw new Error('FORM_ITEM_TYPE_MISMATCH:' + itemContract.key);
    const selected = itemContract.options.find(option => String(option.value) === String(payload.answers[itemContract.key]));
    if (!selected) throw new Error('FORM_OPTION_NOT_FOUND:' + itemContract.key);
    response.withItemResponse(item.asMultipleChoiceItem().createResponse(String(selected.label)));
  });
  return response;
}

function loadCodependenciaFormItemMap_(ss) {
  const sheet = ss.getSheetByName(CODEPENDENCIA_MAP_SHEET);
  if (!sheet) throw new Error('CODEPENDENCIA_CONTRACT_MAP_NOT_FOUND');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('CODEPENDENCIA_CONTRACT_MAP_EMPTY');
  const headers = values[0].map(String);
  const keyCol = headers.indexOf('key');
  const itemCol = headers.indexOf('form_item_id');
  if (keyCol < 0 || itemCol < 0) throw new Error('CODEPENDENCIA_CONTRACT_MAP_INVALID');
  const out = {};
  values.slice(1).forEach(row => {
    const key = String(row[keyCol] || '');
    if (key) out[key] = {itemId: String(row[itemCol] || '')};
  });
  return out;
}

function buildCodependenciaRawReport_(payload, contract, responseId, submittedAt) {
  const answers = {
    'Nome completo': payload.identity.name,
    'Data de nascimento': payload.identity.birthDate,
    'Data de aplicação do rastreio': payload.identity.applicationDate
  };
  contract.items.forEach(item => {
    const selected = item.options.find(option => String(option.value) === String(payload.answers[item.key]));
    answers[item.label] = selected ? selected.label : '';
  });
  return {
    submissionId: payload.submissionId,
    instrumentId: 'codependencia',
    instrumentVersion: '1.0',
    publicName: 'Autonomia, limites e cuidado nas relações',
    technicalName: 'Rastreio de Dependência e Codependência Emocional',
    responseSheet: CODEPENDENCIA_RESPONSE_SHEET,
    submittedAt: submittedAt,
    respondentName: payload.identity.name,
    birthDate: payload.identity.birthDate,
    applicationDate: payload.identity.applicationDate,
    origin: 'Plataforma Terapêutica Richelmy Murta',
    scoring: scoreRawOnly_(answers, {instrumentId:'codependencia', version:'1.0'}),
    answers: answers,
    spreadsheetUrl: SpreadsheetApp.getActive().getUrl(),
    safetyFlow: false,
    formResponseId: responseId
  };
}

function getCodependenciaReceiptSheet_(ss) {
  let sheet = ss.getSheetByName(CODEPENDENCIA_RECEIPT_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CODEPENDENCIA_RECEIPT_SHEET);
    sheet.getRange(1, 1, 1, CODEPENDENCIA_RECEIPT_HEADERS.length).setValues([CODEPENDENCIA_RECEIPT_HEADERS]);
    sheet.hideSheet();
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  if (JSON.stringify(headers) !== JSON.stringify(CODEPENDENCIA_RECEIPT_HEADERS)) throw new Error('CODEPENDENCIA_RECEIPT_SCHEMA_MISMATCH');
  return sheet;
}

function findCodependenciaReceipt_(sheet, submissionId) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, CODEPENDENCIA_RECEIPT_HEADERS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(submissionId)) return {row: i + 2, status: String(rows[i][1] || '')};
  }
  return null;
}

function appendCodependenciaReceipt_(sheet, submissionId) {
  const row = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(row, 1, 1, CODEPENDENCIA_RECEIPT_HEADERS.length).setValues([[
    submissionId, 'RECEIVED', '', new Date(), '', '', ''
  ]]);
  SpreadsheetApp.flush();
  return row;
}

function updateCodependenciaReceipt_(sheet, row, status, formResponseId, formSubmittedAt, emailSentAt, error) {
  sheet.getRange(row, 2, 1, 6).setValues([[
    status,
    formResponseId || '',
    sheet.getRange(row, 4).getValue() || new Date(),
    formSubmittedAt || '',
    emailSentAt || '',
    error || ''
  ]]);
  SpreadsheetApp.flush();
}

function codependenciaJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
