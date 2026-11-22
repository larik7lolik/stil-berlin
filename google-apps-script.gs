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
    // Номер начинается с "+", иначе Таблицы считают его формулой и показывают #ERROR!
    sheet.getRange(2, 4, 1000, 1).setNumberFormat('@');
  }
  return sheet;
}

/** Знак ' перед значением заставляет Таблицы хранить его текстом, а не формулой. */
function textCellValue(value) {
  const str = String(value == null ? '' : value);
  if (!str) return '';
  return /^[+=\-@]/.test(str) ? "'" + str : str;
}

/** Добавляет строку и принудительно хранит WhatsApp текстом. */
function appendLead(values) {
  const sheet = getTargetSheet();
  sheet.getRange(sheet.getLastRow() + 1, 4, 1, 1).setNumberFormat('@');
  sheet.appendRow(values);
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
  if (e && e.parameter && e.parameter.test) {
    try {
      appendLead([
        new Date().toISOString(),
        'ТЕСТ',
        'ТЕСТ',
        textCellValue('+49 170 0000000'),
        'Проверка подключения',
        'Берлин',
        'doGet ?test=1',
        'Да'
      ]);
      return ContentService.createTextOutput('TEST ROW ADDED');
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
    const str = String(row[0] || '');
    if (str && str.charAt(0) !== "'" && /^[+=\-@]/.test(str)) {
      values[index][0] = "'" + str;
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
