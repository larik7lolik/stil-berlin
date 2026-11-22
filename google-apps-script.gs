/**
 * СТИЛЬ — приём заявок в Google Таблицу.
 *
 * ВАЖНО после изменения кода: Развёртывание → Управление развёртываниями
 * → выбрать развёртывание → Изменить → Версия: Новая версия → Развернуть.
 * URL при этом остаётся прежним.
 */

// Если скрипт создан отдельно (не через Расширения в таблице),
// вставьте сюда ID таблицы из её адреса: /spreadsheets/d/ID/edit
const SPREADSHEET_ID = '';

const SCRIPT_VERSION = 'v5-2026-11-22';
const SHEET_NAME = 'Заявки';
const LOG_SHEET_NAME = 'Ошибки';
const HEADERS = [
  'Дата и время',
  'Имя',
  'Фамилия',
  'WhatsApp',
  'Услуга и цена',
  'Город',
  'Источник',
  'Согласие DSGVO'
];

/** Запустите в редакторе Apps Script: в логе будет видна версия активного кода. */
function checkVersion() {
  Logger.log('VERSION: ' + SCRIPT_VERSION);
  return SCRIPT_VERSION;
}

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Таблица не найдена: укажите SPREADSHEET_ID или создайте скрипт через Расширения вашей таблицы.');
  }
  return spreadsheet;
}

function getTargetSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 190);
  }

  // Формат текстом на ВСЕЙ колонке, а не только при создании листа.
  // Иначе старые листы продолжают читать "+49..." как формулу.
  const phoneColumn = sheet.getRange(2, 4, Math.max(sheet.getMaxRows() - 1, 1), 1);
  phoneColumn.setNumberFormat('@');

  return sheet;
}

/**
 * Невидимый пробел перед "+" гарантирует, что ячейка не будет разобрана как формула.
 * Сам апостроф в Apps Script иногда сохраняется как обычный символ и не защищает.
 */
function textCellValue(value) {
  const str = String(value == null ? '' : value);
  if (!str) return '';
  return /^[+=\-@]/.test(str) ? '\u200B' + str : str;
}

/** Добавляет строку через setValues: формат колонки применён заранее. */
function appendLead(values) {
  const sheet = getTargetSheet();
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 4, 1, 1).setNumberFormat('@');
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function doPost(e) {
  try {
    const raw = getRawPayload(e);
    const data = JSON.parse(raw);

    appendLead([
      data.createdAt || new Date().toISOString(),
      data.firstName || '',
      data.lastName || '',
      textCellValue(data.whatsapp),
      data.service || '',
      data.city || '',
      data.source || '',
      data.consent ? 'Да' : 'Нет'
    ]);

    return respond({ status: 'ok' });
  } catch (error) {
    logError(error, e);
    return respond({ status: 'error', message: String(error) });
  }
}

/**
 * Диагностика: откройте URL веб-приложения с ?test=1
 * Например: https://script.google.com/macros/s/.../exec?test=1
 * В таблице должна появиться тестовая строка.
 */
function doGet(e) {
  const param = (e && e.parameter) || {};

  // Проверка, что развёрнута именно эта версия скрипта.
  if (param.version) {
    return ContentService.createTextOutput('VERSION: ' + SCRIPT_VERSION);
  }

  if (param.test) {
    try {
      appendLead([
        new Date().toISOString(),
        'ТЕСТ',
        'ТЕСТ',
        textCellValue('+49 170 0000000'),
        'Проверка подключения ' + SCRIPT_VERSION,
        'Берлин',
        'doGet ?test=1',
        'Да'
      ]);
      return ContentService.createTextOutput('TEST ROW ADDED ' + SCRIPT_VERSION);
    } catch (error) {
      logError(error, e);
      return ContentService.createTextOutput('ERROR: ' + String(error));
    }
  }
  return ContentService.createTextOutput('OK');
}

function getRawPayload(e) {
  if (e && e.parameter && e.parameter.data) return e.parameter.data;
  if (e && e.postData && e.postData.contents) return e.postData.contents;
  return '';
}

function logError(error, e) {
  try {
    const spreadsheet = getSpreadsheet();
    let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
      sheet.appendRow(['Дата и время', 'Ошибка', 'Payload']);
    }
    sheet.appendRow([
      new Date().toISOString(),
      String(error),
      String(getRawPayload(e)).slice(0, 1000)
    ]);
  } catch (ignored) {
    // Если не удалось записать лог, основная ошибка всё равно возвращается ответом.
  }
}

/**
 * Разовая починка уже записанных номеров. Если ячейка уже показывает #ERROR!,
 * исходный номер восстановить нельзя — такую строку нужно удалить и отправить заявку заново.
 */
function fixPhoneColumn() {
  const sheet = getTargetSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 'Нет строк для исправления';

  const range = sheet.getRange(2, 4, lastRow - 1, 1);
  range.setNumberFormat('@');

  const values = range.getValues();
  let fixed = 0;

  values.forEach((row, index) => {
    let str = String(row[0] || '');
    if (!str) return;
    if (str.charAt(0) === "'") str = str.slice(1);
    if (str.charAt(0) === '\u200B') return; // уже защищено
    if (/^[+=\-@]/.test(str)) {
      values[index][0] = '\u200B' + str;
      fixed++;
    }
  });

  if (fixed) range.setValues(values);
  return 'Исправлено ячеек: ' + fixed;
}

function respond(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
