/**
 * ============================================================================
 * SHIPMENT TRACKER — ระบบติดตามการขนส่งสินค้าจากผู้ขายต่างประเทศ (Ocean Freight)
 * Backend: Google Apps Script
 * ============================================================================
 *
 * โครงสร้างใหม่ในเวอร์ชันนี้:
 *  - แยกเก็บข้อมูลเป็น 3 ชีต ตามสายเรือ (โครงสร้างคอลัมน์เหมือนกันทุกชีต): ดูตัวแปร LINES
 *  - เพิ่มคอลัมน์ "Recorded By" (ผู้กรอกข้อมูล: Siam Tin / Amcor) ทุกแถว
 *  - คอลัมน์วันที่ทั้งหมด -> ใช้ Data Validation แบบ "Date" (คลิกแล้วเลือกจากปฏิทินได้ในชีต)
 *  - คอลัมน์ week ทั้งหมด -> ใช้ Data Validation แบบ list (Week 01 - Week 53)
 *  - มีชีต "Summary" ที่รวมยอด PO Quantity / Actual Qty Loaded จากทั้ง 3 สายเรือ
 *    โดยอัตโนมัติทุกครั้งที่มีการเพิ่ม/แก้ไขข้อมูล (ไม่ต้องกดอะไรเพิ่ม)
 *
 * วิธีติดตั้ง: ดูไฟล์ README.md ที่แนบมาด้วย
 *
 * ⚠️ ชื่อสายเรือที่ 2 ("Sheba - Evergreen") เป็นชื่อตัวอย่าง — แก้เป็นชื่อจริงได้ที่
 *    ตัวแปร LINES ด้านล่างนี้จุดเดียว ไม่ต้องแก้ที่อื่น
 * ============================================================================
 */

var LINES = ['Sheba - Maersk', 'Sheba - Evergreen', 'Sheba - OOCL'];
var SUMMARY_SHEET_NAME = 'Summary';
var ENTRANTS = ['Siam Tin', 'Amcor'];
var MAX_DATA_ROWS = 2000; // จำนวนแถวสูงสุดที่จะตั้ง Data Validation ไว้ล่วงหน้า

// ลำดับ FIELD_DEFS ตรงกับคอลัมน์ตามไฟล์ต้นฉบับของผู้ใช้ (มีชื่อ "Actual Vessel name"
// ซ้ำกัน 3 ครั้งตามจริง จึงตั้ง key ให้ไม่ซ้ำกันด้วย _1 / _2 / _3)
// owner = 'siamtin' หรือ 'amcor' กำหนดว่าใครมีสิทธิ์แก้คอลัมน์นั้นในฟอร์มเว็บ
// type  = 'text' | 'number' | 'date' | 'week' กำหนดชนิดของ input และ data validation
var FIELD_DEFS = [
  { key: 'po_no',                    label: "PO no.",                          owner: 'siamtin', type: 'text'   },
  { key: 'etd_required_week',        label: 'ETD Required week',               owner: 'siamtin', type: 'week'   },
  { key: 'po_quantity',              label: 'PO Quantity',                     owner: 'siamtin', type: 'number' },
  { key: 'shipment',                 label: 'Shipment',                        owner: 'amcor',   type: 'text'   },
  { key: 'booking_no',               label: 'Booking no.',                     owner: 'amcor',   type: 'text'   },
  { key: 'booking_date',             label: 'Booking date',                    owner: 'amcor',   type: 'date'   },
  { key: 'container_no',             label: 'Container no.',                   owner: 'amcor',   type: 'text'   },
  { key: 'actual_qty_loaded',        label: "Actual Q'ty Loaded",              owner: 'amcor',   type: 'number' },
  { key: 'loading_date',             label: 'Loading date',                    owner: 'amcor',   type: 'date'   },
  { key: 'loading_week',             label: 'Loading Week',                    owner: 'amcor',   type: 'week'   },
  { key: 'service',                  label: 'Service',                         owner: 'amcor',   type: 'text'   },
  { key: 'transition_port',          label: 'Transition Port',                 owner: 'amcor',   type: 'text'   },
  { key: 'original_vessel_name',     label: 'Original Vessel name',            owner: 'amcor',   type: 'text'   },
  { key: 'original_etd_rotterdam',   label: 'Original ETD Rotterdam Port',     owner: 'amcor',   type: 'date'   },
  { key: 'rev1_vessel_name',         label: 'Rev.l Vessel name (if any)',      owner: 'amcor',   type: 'text'   },
  { key: 'rev1_etd_rotterdam',       label: 'Rev. I ETD Rotterdam Port',       owner: 'amcor',   type: 'date'   },
  { key: 'rev2_vessel_name',         label: 'Rev.II Vessel name (if any)',     owner: 'amcor',   type: 'text'   },
  { key: 'rev2_etd_rotterdam',       label: 'Rev. II ETD Rotterdam Port',      owner: 'amcor',   type: 'date'   },
  { key: 'reason_reschedule',        label: 'Reason of Re-Schedules (if any)', owner: 'amcor',   type: 'text'   },
  { key: 'original_eta_songkhla',    label: 'Original ETA Songkhla',           owner: 'amcor',   type: 'date'   },
  { key: 'rev1_eta_songkhla',        label: 'Rev.I ETA Songkhla',              owner: 'amcor',   type: 'date'   },
  { key: 'rev2_eta_songkhla',        label: 'Rev.II ETA Songkhla',             owner: 'amcor',   type: 'date'   },
  { key: 'actual_vessel_name_1',     label: 'Actual Vessel name',              owner: 'siamtin', type: 'text'   },
  { key: 'atd_rotterdam',            label: 'ATD Rotterdam Port',              owner: 'siamtin', type: 'date'   },
  { key: 'atd_week',                 label: 'ATD week',                        owner: 'siamtin', type: 'week'   },
  { key: 'eta_port_klang',           label: 'ETA Port Klang',                  owner: 'siamtin', type: 'date'   },
  { key: 'ata_port_klang',           label: 'ATA Port Klang',                  owner: 'siamtin', type: 'date'   },
  { key: 'etd_port_klang',           label: 'ETD Port Klang',                  owner: 'siamtin', type: 'date'   },
  { key: 'actual_vessel_name_2',     label: 'Actual Vessel name',              owner: 'siamtin', type: 'text'   },
  { key: 'atd_port_klang',           label: 'ATD Port Klang',                  owner: 'siamtin', type: 'date'   },
  { key: 'eta_singapore',            label: 'ETA Singapore',                   owner: 'siamtin', type: 'date'   },
  { key: 'ata_singapore',            label: 'ATA Singapore',                   owner: 'siamtin', type: 'date'   },
  { key: 'plan_vessel_name',         label: 'Plan Vessel name',                owner: 'siamtin', type: 'text'   },
  { key: 'etd_singapore',            label: 'ETD Singapore',                   owner: 'siamtin', type: 'date'   },
  { key: 'actual_vessel_name_3',     label: 'Actual Vessel name',              owner: 'siamtin', type: 'text'   },
  { key: 'atd_singapore',            label: 'ATD Singapore',                   owner: 'siamtin', type: 'date'   },
  { key: 'eta_songkhla',             label: 'ETA Songkhla',                    owner: 'siamtin', type: 'date'   },
  { key: 'ata_songkhla',             label: 'ATA Songkhla',                    owner: 'siamtin', type: 'date'   },
  { key: 'ata_week',                 label: 'ATA Week',                        owner: 'siamtin', type: 'week'   },
  { key: 'notes',                    label: 'Notes',                           owner: 'siamtin', type: 'text'   }
];
var COL_COUNT = FIELD_DEFS.length; // 40
var HEADERS = FIELD_DEFS.map(function (f) { return f.label; });

// ตำแหน่งคอลัมน์คงที่ในชีต: 1=ID, 2=Recorded By, 3..42 = FIELD_DEFS[0..39]
var COL_ID = 1;
var COL_RECORDED_BY = 2;
var COL_FIELD_OFFSET = 3; // FIELD_DEFS[i] -> sheet column (i + COL_FIELD_OFFSET)

var IDX_PO_NO = fieldIndexByKey_('po_no');
var IDX_PO_QTY = fieldIndexByKey_('po_quantity');
var IDX_ACTUAL_QTY = fieldIndexByKey_('actual_qty_loaded');

var WEEK_OPTIONS = buildWeekOptions_();

function fieldIndexByKey_(key) {
  for (var i = 0; i < FIELD_DEFS.length; i++) {
    if (FIELD_DEFS[i].key === key) return i;
  }
  throw new Error('unknown field key: ' + key);
}

function buildWeekOptions_() {
  var out = [];
  for (var w = 1; w <= 53; w++) {
    out.push('Week ' + (w < 10 ? '0' + w : w));
  }
  return out;
}

// ============================================================================
// WEB APP ENTRY POINT
// ============================================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบติดตามการจัดส่งสินค้า')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================================
// เมนูใน Google Sheet (เปิดไฟล์ชีตแล้วจะเห็นเมนู "Shipment Tracker")
// ============================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Shipment Tracker')
    .addItem('ตั้งค่า/สร้างชีตทั้งหมด (ครั้งแรก)', 'setupAllSheets')
    .addItem('รีเฟรชสรุปยอด (Summary)', 'rebuildSummary')
    .addToUi();
}

/** เรียกครั้งแรกหลังติดตั้ง (หรือรันจากเมนู) เพื่อสร้างชีตทั้ง 3 สายเรือ + Summary ให้ครบ */
function setupAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  LINES.forEach(function (line) { ensureLineSheet_(ss, line); });
  ensureSummarySheet_(ss);
  rebuildSummary();
  return { status: 'ok' };
}

// ============================================================================
// FUNCTIONS เรียกจากหน้าเว็บ (google.script.run)
// ============================================================================

/** ข้อมูลตั้งต้นที่หน้าเว็บใช้สร้างฟอร์มแบบไดนามิก */
function getBootstrapData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  LINES.forEach(function (line) { ensureLineSheet_(ss, line); });
  ensureSummarySheet_(ss);
  return {
    lines: LINES,
    entrants: ENTRANTS,
    weekOptions: WEEK_OPTIONS,
    fields: FIELD_DEFS
  };
}

/** รายการ PO ทั้งหมดของสายเรือที่เลือก พร้อมสถานะรวม */
function getPOList(line) {
  var sheet = ensureLineSheet_(SpreadsheetApp.getActiveSpreadsheet(), line);
  var lastRow = sheet.getLastRow();
  var out = [];
  if (lastRow > 2) {
    var data = sheet.getRange(3, 1, lastRow - 2, COL_FIELD_OFFSET + COL_COUNT - 1).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var id = row[COL_ID - 1];
      if (!id) continue;
      var fieldValues = extractFieldValues_(row);
      out.push({
        id: id,
        poNo: fieldValues.po_no_raw,
        shipment: fieldValues.shipment || '',
        status: deriveStatus_(fieldValues)
      });
    }
  }
  return out;
}

/** ข้อมูลทั้งหมดของ PO หนึ่งแถว (สำหรับเติมฟอร์ม) */
function getPOData(line, id) {
  var sheet = ensureLineSheet_(SpreadsheetApp.getActiveSpreadsheet(), line);
  var rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) return null;
  var row = sheet.getRange(rowIndex, 1, 1, COL_FIELD_OFFSET + COL_COUNT - 1).getValues()[0];
  var out = { id: id, recorded_by: row[COL_RECORDED_BY - 1] || '' };
  var poSplit = splitPoNoDate_(row[COL_FIELD_OFFSET - 1 + IDX_PO_NO]);
  out.po_no = poSplit.poNo;
  out.po_date = poSplit.poDate;
  FIELD_DEFS.forEach(function (f, i) {
    if (i === IDX_PO_NO) return; // จัดการแยกไว้แล้วข้างบน (po_no/po_date)
    var v = row[COL_FIELD_OFFSET - 1 + i];
    out[f.key] = formatCellForForm_(v, f.type);
  });
  return out;
}

/** สร้าง PO ใหม่ (ทำได้จากฝั่ง Siam Tin เท่านั้น) */
function createPO(line, data) {
  var sheet = ensureLineSheet_(SpreadsheetApp.getActiveSpreadsheet(), line);
  var poNo = (data.po_no || '').toString().trim();
  if (!poNo) throw new Error('กรุณากรอก PO No.');

  var lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    var existing = sheet.getRange(3, COL_FIELD_OFFSET + IDX_PO_NO, lastRow - 2, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      var raw = splitPoNoDate_(existing[i][0]).poNo;
      if (raw && raw.toLowerCase() === poNo.toLowerCase()) {
        throw new Error('PO No. "' + poNo + '" มีอยู่แล้วในสายเรือนี้ กรุณาใช้เลขอื่น หรือแก้ไขรายการเดิม');
      }
    }
  }

  var id = Utilities.getUuid();
  var rowValues = new Array(COL_COUNT).fill('');
  rowValues[IDX_PO_NO] = combinePoNoDate_(poNo, data.po_date);
  rowValues[IDX_PO_QTY] = data.po_quantity || '';
  var etdIdx = fieldIndexByKey_('etd_required_week');
  rowValues[etdIdx] = data.etd_required_week || '';

  var fullRow = [id, data.recorded_by || ''].concat(rowValues.map(function (v, i) {
    return coerceForSheet_(v, FIELD_DEFS[i].type);
  }));
  sheet.appendRow(fullRow);
  rebuildSummary();
  return { status: 'ok', id: id };
}

/** อัปเดตข้อมูลฝั่ง Siam Tin เท่านั้น (ไม่แตะคอลัมน์ของ Amcor) */
function updateSiamTinFields(line, id, data) {
  return updateOwnedFields_(line, id, data, 'siamtin');
}

/** อัปเดตข้อมูลฝั่ง Amcor เท่านั้น (ไม่แตะคอลัมน์ของ Siam Tin) */
function updateAmcorFields(line, id, data) {
  return updateOwnedFields_(line, id, data, 'amcor');
}

function updateOwnedFields_(line, id, data, owner) {
  var sheet = ensureLineSheet_(SpreadsheetApp.getActiveSpreadsheet(), line);
  var rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) throw new Error('ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)');

  if (data.recorded_by) {
    sheet.getRange(rowIndex, COL_RECORDED_BY).setValue(data.recorded_by);
  }

  FIELD_DEFS.forEach(function (f, i) {
    if (f.owner !== owner) return;
    if (i === IDX_PO_NO) {
      // PO No. แก้ไม่ได้หลังสร้างแล้ว แต่ PO Date แก้ได้ (siamtin เท่านั้น)
      if (owner === 'siamtin' && data.po_date !== undefined) {
        var cell = sheet.getRange(rowIndex, COL_FIELD_OFFSET + i);
        var current = splitPoNoDate_(cell.getValue()).poNo;
        cell.setValue(combinePoNoDate_(current, data.po_date));
      }
      return;
    }
    if (data[f.key] === undefined) return;
    sheet.getRange(rowIndex, COL_FIELD_OFFSET + i).setValue(coerceForSheet_(data[f.key], f.type));
  });

  rebuildSummary();
  return { status: 'ok' };
}

// ============================================================================
// SUMMARY SHEET — รวมยอดจากทั้ง 3 สายเรือ แยกตาม PO Number โดยอัตโนมัติ
// ============================================================================

function rebuildSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summary = ensureSummarySheet_(ss);

  // key = PO No. (PO date) แบบข้อความล้วน, value = ยอดรวมและสถานะ
  var totals = {}; // { poKey: { poQty, byLine: {line: actualQty}, status per line list } }
  var order = [];

  LINES.forEach(function (line) {
    var sheet = ensureLineSheet_(ss, line);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 2) return;
    var data = sheet.getRange(3, 1, lastRow - 2, COL_FIELD_OFFSET + COL_COUNT - 1).getValues();
    data.forEach(function (row) {
      var id = row[COL_ID - 1];
      if (!id) return;
      var poRaw = row[COL_FIELD_OFFSET - 1 + IDX_PO_NO];
      var poKey = (splitPoNoDate_(poRaw).poNo || '').trim();
      if (!poKey) return;
      var displayLabel = poRaw; // เก็บ label เต็ม "PO_NO (dd/mm/yyyy)" ไว้แสดงผล
      if (!totals[poKey]) {
        totals[poKey] = { label: displayLabel, poQty: 0, byLine: {} };
        order.push(poKey);
      }
      var poQty = Number(row[COL_FIELD_OFFSET - 1 + IDX_PO_QTY]) || 0;
      var actualQty = Number(row[COL_FIELD_OFFSET - 1 + IDX_ACTUAL_QTY]) || 0;
      // ใช้ PO Quantity ค่าล่าสุดที่เจอ (ควรเท่ากันทุกแถวของ PO เดียวกัน)
      if (poQty) totals[poKey].poQty = poQty;
      totals[poKey].byLine[line] = (totals[poKey].byLine[line] || 0) + actualQty;
    });
  });

  var headerRow1 = ['PO No. (PO Date)', 'PO Quantity'].concat(
    LINES.map(function (l) { return 'Actual Qty Loaded - ' + l; })
  ).concat(['Total Actual Qty Loaded', 'Remaining to Ship']);

  var rows = order.map(function (poKey) {
    var t = totals[poKey];
    var lineQtys = LINES.map(function (l) { return t.byLine[l] || 0; });
    var totalActual = lineQtys.reduce(function (a, b) { return a + b; }, 0);
    var remaining = t.poQty ? (t.poQty - totalActual) : '';
    return [t.label, t.poQty].concat(lineQtys).concat([totalActual, remaining]);
  });

  summary.clearContents();
  summary.getRange(1, 1, 1, headerRow1.length).setValues([headerRow1])
    .setFontWeight('bold').setBackground('#e5e7eb');
  summary.setFrozenRows(1);
  if (rows.length) {
    summary.getRange(2, 1, rows.length, headerRow1.length).setValues(rows);
  }
  for (var c = 1; c <= headerRow1.length; c++) summary.autoResizeColumn(c);
}

function ensureSummarySheet_(ss) {
  var sheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET_NAME);
  }
  return sheet;
}

// ============================================================================
// สร้างชีตของแต่ละสายเรือ พร้อม Data Validation (วันที่ / week / ผู้กรอกข้อมูล)
// ============================================================================

function ensureLineSheet_(ss, line) {
  if (LINES.indexOf(line) === -1) throw new Error('ไม่รู้จักสายเรือ: ' + line);
  var sheet = ss.getSheetByName(line);
  if (!sheet) {
    sheet = ss.insertSheet(line);
    buildLineSheetHeaders_(sheet);
  }
  return sheet;
}

function buildLineSheetHeaders_(sheet) {
  var ownerRow = ['', ''];
  var labelRow = ['ID', 'Recorded By'];
  FIELD_DEFS.forEach(function (f) {
    ownerRow.push(f.owner === 'siamtin' ? 'Siam Tin' : 'Amcor');
    labelRow.push(f.label);
  });

  var totalCols = labelRow.length;
  sheet.getRange(1, 1, 1, totalCols).setValues([ownerRow])
    .setFontWeight('bold').setBackground('#fef08a').setFontSize(9);
  sheet.getRange(2, 1, 1, totalCols).setValues([labelRow])
    .setFontWeight('bold').setBackground('#e5e7eb');
  sheet.setFrozenRows(2);
  sheet.setFrozenColumns(2);

  // ID + Recorded By: เก็บเป็นข้อความล้วน, Recorded By มี dropdown
  sheet.getRange(3, COL_ID, MAX_DATA_ROWS, 1).setNumberFormat('@');
  sheet.getRange(3, COL_RECORDED_BY, MAX_DATA_ROWS, 1).setNumberFormat('@');
  var entrantRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ENTRANTS, true).setAllowInvalid(false).build();
  sheet.getRange(3, COL_RECORDED_BY, MAX_DATA_ROWS, 1).setDataValidation(entrantRule);

  FIELD_DEFS.forEach(function (f, i) {
    var col = COL_FIELD_OFFSET + i;
    var range = sheet.getRange(3, col, MAX_DATA_ROWS, 1);
    if (f.type === 'date') {
      range.setNumberFormat('dd/mm/yyyy');
      var dateRule = SpreadsheetApp.newDataValidation()
        .requireDate().setAllowInvalid(true)
        .setHelpText('คลิกเพื่อเลือกวันที่จากปฏิทิน').build();
      range.setDataValidation(dateRule);
    } else if (f.type === 'week') {
      range.setNumberFormat('@');
      var weekRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(WEEK_OPTIONS, true).setAllowInvalid(true).build();
      range.setDataValidation(weekRule);
    } else {
      range.setNumberFormat('@');
    }
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return -1;
  var ids = sheet.getRange(3, COL_ID, lastRow - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 3;
  }
  return -1;
}

/** ดึงค่าฟิลด์ที่ใช้บ่อย (สำหรับ getPOList/สถานะ) จาก 1 แถวดิบของชีต */
function extractFieldValues_(row) {
  var out = {};
  FIELD_DEFS.forEach(function (f, i) {
    out[f.key] = row[COL_FIELD_OFFSET - 1 + i];
  });
  out.po_no_raw = splitPoNoDate_(row[COL_FIELD_OFFSET - 1 + IDX_PO_NO]).poNo;
  return out;
}

/** สถานะรวม: New PO -> Booked -> Loaded -> In Transit -> Arrived */
function deriveStatus_(f) {
  if (f.ata_songkhla) return 'Arrived';
  if (f.atd_singapore || f.eta_songkhla || f.atd_port_klang || f.atd_rotterdam) return 'In Transit';
  if (f.actual_qty_loaded || f.loading_date) return 'Loaded';
  if (f.booking_no) return 'Booked';
  return 'New PO';
}

/** รวม PO No. + PO Date (yyyy-mm-dd จากฟอร์ม) ให้เป็นข้อความเดียวแบบ "1234/5678 (dd/mm/yyyy)" */
function combinePoNoDate_(poNo, poDateIso) {
  poNo = (poNo || '').toString().trim();
  if (!poDateIso) return poNo;
  var parts = poDateIso.split('-'); // yyyy-mm-dd
  if (parts.length !== 3) return poNo;
  var display = parts[2] + '/' + parts[1] + '/' + parts[0];
  return poNo + ' (' + display + ')';
}

/** แยก "1234/5678 (dd/mm/yyyy)" กลับเป็น {poNo, poDate(yyyy-mm-dd)} */
function splitPoNoDate_(value) {
  value = (value || '').toString().trim();
  var m = value.match(/^(.*)\s\((\d{2})\/(\d{2})\/(\d{4})\)$/);
  if (!m) return { poNo: value, poDate: '' };
  return { poNo: m[1].trim(), poDate: m[4] + '-' + m[3] + '-' + m[2] };
}

/** แปลงค่าจากฟอร์มเว็บให้พร้อมเซฟลงชีต (date string -> Date object, ฯลฯ) */
function coerceForSheet_(value, type) {
  if (value === undefined || value === null || value === '') return '';
  if (type === 'date') {
    var d = new Date(value + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : d;
  }
  if (type === 'number') {
    var n = Number(value);
    return isNaN(n) ? '' : n;
  }
  return value;
}

/** แปลงค่าจากชีตให้พร้อมแสดงในฟอร์มเว็บ (Date object -> yyyy-mm-dd สำหรับ <input type=date>) */
function formatCellForForm_(value, type) {
  if (value === '' || value === null || value === undefined) return '';
  if (type === 'date') {
    if (value instanceof Date) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return '';
  }
  return value;
}

// ============================================================================
// แจ้งเตือนอีเมลรายสัปดาห์ (ทางเลือก — ตั้ง Time-driven trigger เอง ดู README)
// ============================================================================

var AMCOR_EMAIL = 'amcor@example.com';   // แก้เป็นอีเมลจริง
var SIAMTIN_EMAIL = 'siamtin@example.com'; // แก้เป็นอีเมลจริง

function sendWeeklyReminder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var url = ScriptApp.getService().getUrl();
  var lines = [];
  LINES.forEach(function (line) {
    var sheet = ensureLineSheet_(ss, line);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 2) return;
    var data = sheet.getRange(3, 1, lastRow - 2, COL_FIELD_OFFSET + COL_COUNT - 1).getValues();
    data.forEach(function (row) {
      var id = row[COL_ID - 1];
      if (!id) return;
      var f = extractFieldValues_(row);
      if (!f.ata_songkhla) {
        lines.push('[' + line + '] PO ' + f.po_no_raw + ' — สถานะ: ' + deriveStatus_(f));
      }
    });
  });
  if (!lines.length) return;
  var body = 'รายการ PO ที่ยังไม่ถึงปลายทาง (Songkhla):\n\n' + lines.join('\n') +
    '\n\nกรอก/อัปเดตข้อมูลได้ที่: ' + url;
  MailApp.sendEmail(AMCOR_EMAIL, 'สรุป PO ที่ยังไม่ถึงปลายทาง (รายสัปดาห์)', body);
  MailApp.sendEmail(SIAMTIN_EMAIL, 'สรุป PO ที่ยังไม่ถึงปลายทาง (รายสัปดาห์)', body);
}
