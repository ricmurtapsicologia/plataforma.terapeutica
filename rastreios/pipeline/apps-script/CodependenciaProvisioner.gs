const CODEPENDENCIA_CONTRACT_URL = 'https://raw.githubusercontent.com/ricmurtapsicologia/Escala-de-Co-Depenpencia-Emocional/main/contracts/collector-v1.json';
const CODEPENDENCIA_RESPONSE_SHEET = 'FORM_Codependencia';
const CODEPENDENCIA_MAP_SHEET = '_CONTRACT_Codependencia';
const CODEPENDENCIA_FORM_PROPERTY = 'CODEPENDENCIA_FORM_ID';

/**
 * Provisiona o Google Form correspondente à Codependência a partir do contrato 40/40.
 *
 * Segurança:
 * - o Form nasce FECHADO para respostas;
 * - nenhum ponto de corte clínico é criado;
 * - o scorer permanece raw_only até validação psicométrica específica;
 * - o Form é coletor de bastidor, não interface pública do paciente.
 *
 * Executar no mesmo projeto Apps Script vinculado à planilha central do pipeline.
 */
function provisionCodependenciaFormV1() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('ACTIVE_SPREADSHEET_REQUIRED');

  const props = PropertiesService.getScriptProperties();
  const existingId = String(props.getProperty(CODEPENDENCIA_FORM_PROPERTY) || '').trim();
  if (existingId) throw new Error('CODEPENDENCIA_FORM_ALREADY_PROVISIONED:' + existingId);

  const contract = loadCodependenciaContractV1_();
  validateCodependenciaContractV1_(contract);

  const form = FormApp.create('Limites e equilíbrio nos vínculos');
  form.setDescription('Coletor clínico de bastidor. A interpretação é realizada pelo psicólogo responsável e não é exibida por este formulário.');
  form.setCollectEmail(false);
  form.setProgressBar(false);
  form.setShuffleQuestions(false);
  form.setConfirmationMessage('Rastreio concluído com sucesso. Suas respostas foram registradas e encaminhadas para análise clínica do psicólogo responsável.');
  form.setAcceptingResponses(false);

  const mapRows = [];

  contract.identity.forEach(field => {
    let item;
    if (field.type === 'date') {
      item = form.addDateItem().setTitle(field.label).setRequired(Boolean(field.required)).setIncludesYear(true);
    } else {
      item = form.addTextItem().setTitle(field.label).setRequired(Boolean(field.required));
    }
    mapRows.push([
      field.key,
      'identity',
      field.label,
      String(item.getId()),
      field.type,
      '',
      '',
      JSON.stringify([])
    ]);
  });

  contract.items.forEach(itemContract => {
    if (itemContract.responseType !== 'single_choice') throw new Error('UNSUPPORTED_RESPONSE_TYPE:' + itemContract.key);
    const optionLabels = itemContract.options.map(option => String(option.label));
    const item = form.addMultipleChoiceItem()
      .setTitle(itemContract.label)
      .setChoiceValues(optionLabels)
      .setRequired(Boolean(itemContract.required));

    mapRows.push([
      itemContract.key,
      itemContract.section,
      itemContract.label,
      String(item.getId()),
      itemContract.responseType,
      String(Math.min.apply(null, itemContract.options.map(option => Number(option.value)))),
      String(Math.max.apply(null, itemContract.options.map(option => Number(option.value)))),
      JSON.stringify(itemContract.options)
    ]);
  });

  const beforeSheetIds = new Set(ss.getSheets().map(sheet => sheet.getSheetId()));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  const responseSheet = waitForNewResponseSheet_(ss, beforeSheetIds);
  if (responseSheet.getName() !== CODEPENDENCIA_RESPONSE_SHEET) {
    const collision = ss.getSheetByName(CODEPENDENCIA_RESPONSE_SHEET);
    if (collision) throw new Error('RESPONSE_SHEET_NAME_COLLISION:' + CODEPENDENCIA_RESPONSE_SHEET);
    responseSheet.setName(CODEPENDENCIA_RESPONSE_SHEET);
  }

  writeCodependenciaContractMap_(ss, mapRows);
  upsertCodependenciaConfig_(ss);

  props.setProperties({
    [CODEPENDENCIA_FORM_PROPERTY]: form.getId(),
    CODEPENDENCIA_FORM_EDIT_URL: form.getEditUrl(),
    CODEPENDENCIA_FORM_PUBLISHED_URL: form.getPublishedUrl(),
    CODEPENDENCIA_RESPONSE_SHEET: CODEPENDENCIA_RESPONSE_SHEET,
    CODEPENDENCIA_CONTRACT_SCHEMA: String(contract.schemaVersion || ''),
    CODEPENDENCIA_CONTRACT_SOURCE_SHA256: String(contract.source && contract.source.sha256 || '')
  }, true);

  return {
    instrumentId: 'codependencia',
    formId: form.getId(),
    editUrl: form.getEditUrl(),
    publishedUrl: form.getPublishedUrl(),
    acceptingResponses: form.isAcceptingResponses(),
    responseSheet: responseSheet.getName(),
    identityCount: contract.identity.length,
    itemCount: contract.items.length,
    scorer: 'raw_only',
    active: false,
    deploymentState: 'PROVISIONED_CLOSED_AWAITING_SMOKE_TEST'
  };
}

/**
 * Abre o coletor somente após conferir a estrutura provisionada.
 * Não altera o estado público no GitHub; a promoção do manifesto deve ocorrer
 * apenas depois do teste real de persistência e relatório.
 */
function activateCodependenciaCollectorAfterSmokeTestV1() {
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  const formId = String(props.getProperty(CODEPENDENCIA_FORM_PROPERTY) || '').trim();
  if (!formId) throw new Error('CODEPENDENCIA_FORM_NOT_PROVISIONED');

  const form = FormApp.openById(formId);
  const contract = loadCodependenciaContractV1_();
  validateProvisionedCodependenciaForm_(form, contract);
  setCodependenciaConfigActive_(ss, true);
  form.setAcceptingResponses(true);

  return {
    instrumentId: 'codependencia',
    formId: formId,
    acceptingResponses: form.isAcceptingResponses(),
    configActive: true,
    note: 'O manifesto público ainda deve permanecer bloqueado até teste real de transporte, persistência, relatório e recibo.'
  };
}

function deactivateCodependenciaCollectorV1() {
  const ss = SpreadsheetApp.getActive();
  const formId = String(PropertiesService.getScriptProperties().getProperty(CODEPENDENCIA_FORM_PROPERTY) || '').trim();
  if (formId) FormApp.openById(formId).setAcceptingResponses(false);
  setCodependenciaConfigActive_(ss, false);
  return {instrumentId:'codependencia', acceptingResponses:false, configActive:false};
}

function loadCodependenciaContractV1_() {
  const response = UrlFetchApp.fetch(CODEPENDENCIA_CONTRACT_URL, {
    method: 'get',
    muteHttpExceptions: true,
    headers: {'Cache-Control': 'no-cache'}
  });
  if (response.getResponseCode() !== 200) throw new Error('CODEPENDENCIA_CONTRACT_FETCH_FAILED:' + response.getResponseCode());
  return JSON.parse(response.getContentText('UTF-8'));
}

function validateCodependenciaContractV1_(contract) {
  if (!contract || contract.instrumentId !== 'codependencia') throw new Error('INVALID_CODEPENDENCIA_CONTRACT_ID');
  if (contract.identityProfile !== 'screening_canonical') throw new Error('INVALID_IDENTITY_PROFILE');
  if (!Array.isArray(contract.identity) || contract.identity.length !== 3) throw new Error('INVALID_IDENTITY_COUNT');
  if (!Array.isArray(contract.items) || contract.items.length !== 40) throw new Error('INVALID_ITEM_COUNT');
  const expectedIdentity = ['Nome completo','Data de nascimento','Data de aplicação do rastreio'];
  expectedIdentity.forEach(label => {
    if (!contract.identity.some(field => field.label === label && field.required === true)) throw new Error('IDENTITY_FIELD_MISSING:' + label);
  });
  contract.items.forEach((item, index) => {
    if (item.key !== 'q' + (index + 1)) throw new Error('ITEM_ORDER_MISMATCH:' + (index + 1));
    if (item.required !== true) throw new Error('ITEM_NOT_REQUIRED:' + item.key);
    if (item.responseType !== 'single_choice') throw new Error('ITEM_TYPE_MISMATCH:' + item.key);
    const values = item.options.map(option => String(option.value));
    if (JSON.stringify(values) !== JSON.stringify(['1','2','3','4','5'])) throw new Error('OPTION_VALUES_MISMATCH:' + item.key);
  });
}

function validateProvisionedCodependenciaForm_(form, contract) {
  const items = form.getItems();
  const expected = contract.identity.length + contract.items.length;
  if (items.length !== expected) throw new Error('PROVISIONED_FORM_ITEM_COUNT_MISMATCH:' + items.length + ':' + expected);
  const expectedTitles = contract.identity.map(field => field.label).concat(contract.items.map(item => item.label));
  items.forEach((item, index) => {
    if (String(item.getTitle()) !== String(expectedTitles[index])) throw new Error('PROVISIONED_FORM_TITLE_MISMATCH:' + index);
  });
}

function waitForNewResponseSheet_(ss, beforeSheetIds) {
  for (let attempt = 0; attempt < 12; attempt++) {
    SpreadsheetApp.flush();
    const created = ss.getSheets().find(sheet => !beforeSheetIds.has(sheet.getSheetId()));
    if (created) return created;
    Utilities.sleep(500);
  }
  throw new Error('FORM_RESPONSE_SHEET_NOT_CREATED');
}

function writeCodependenciaContractMap_(ss, rows) {
  let sheet = ss.getSheetByName(CODEPENDENCIA_MAP_SHEET);
  if (!sheet) sheet = ss.insertSheet(CODEPENDENCIA_MAP_SHEET);
  sheet.clearContents();
  const headers = ['key','section','question_title','form_item_id','response_type','min_value','max_value','options_json'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.hideSheet();
}

function upsertCodependenciaConfig_(ss) {
  let sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET);
    sheet.getRange(1,1,1,8).setValues([['response_sheet','instrument_id','version','public_name','technical_name','scorer','active','safety_flow']]);
  }
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const required = ['response_sheet','instrument_id','version','public_name','technical_name','scorer','active','safety_flow'];
  required.forEach(header => { if (!headers.includes(header)) throw new Error('CONFIG_HEADER_MISSING:' + header); });
  const rowValues = {
    response_sheet: CODEPENDENCIA_RESPONSE_SHEET,
    instrument_id: 'codependencia',
    version: '1.0',
    public_name: 'Limites, dependência e equilíbrio nos vínculos',
    technical_name: 'Rastreio de Dependência e Codependência Emocional',
    scorer: 'raw_only',
    active: false,
    safety_flow: false
  };
  const rowIndex = values.slice(1).findIndex(row => String(row[headers.indexOf('instrument_id')]) === 'codependencia');
  const targetRow = rowIndex >= 0 ? rowIndex + 2 : Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map(header => Object.prototype.hasOwnProperty.call(rowValues, header) ? rowValues[header] : '')]);
}

function setCodependenciaConfigActive_(ss, active) {
  const sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) throw new Error('CONFIG_SHEET_NOT_FOUND');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idCol = headers.indexOf('instrument_id');
  const activeCol = headers.indexOf('active');
  if (idCol < 0 || activeCol < 0) throw new Error('CONFIG_COLUMNS_MISSING');
  const rowIndex = values.slice(1).findIndex(row => String(row[idCol]) === 'codependencia');
  if (rowIndex < 0) throw new Error('CODEPENDENCIA_CONFIG_NOT_FOUND');
  sheet.getRange(rowIndex + 2, activeCol + 1).setValue(Boolean(active));
}
