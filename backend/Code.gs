/**
 * 世桜アプリ 共有バックエンド（Google Apps Script）
 * スプレッドシートをデータベースにして、全端末で報告データを同期する。
 * このスクリプトは「スプレッドシートに紐づくスクリプト」として動かす前提（getActiveSpreadsheet を使用）。
 * デプロイ手順は同フォルダの「デプロイ手順.md」を参照。
 */
var SHEET_NAME = 'reports';
var HEADERS = ['id', 'ts', 'kind', 'store', 'item', 'level', 'note', 'photos'];

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); }
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

// 報告一覧を返す（新しい順）。?store=店舗名 で絞り込み可、?store=all は全件。
function doGet(e) {
  try {
    var sh = getSheet();
    var values = sh.getDataRange().getValues();
    var store = e && e.parameter ? e.parameter.store : '';
    var out = [];
    for (var i = values.length - 1; i >= 1; i--) {   // 1行目はヘッダー
      var r = values[i];
      if (!r[0]) continue;
      if (store && store !== 'all' && r[3] !== store) continue;
      out.push({
        id: r[0], t: Number(r[1]) || 0, kind: r[2], store: r[3],
        item: r[4], level: r[5], note: r[6], photos: parsePhotos(r[7])
      });
      if (out.length >= 300) break;
    }
    return json({ ok: true, reports: out });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 報告を1件追加する。body は JSON 文字列（Content-Type: text/plain で送る）。
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sh = getSheet();
    var id = Utilities.getUuid();
    var ts = data.t || Date.now();
    var photos = Array.isArray(data.photos) ? data.photos.slice(0, 3) : [];
    sh.appendRow([id, ts, data.kind || '', data.store || '', data.item || '', data.level || '', normNote(data.note), JSON.stringify(photos)]);
    return json({ ok: true, id: id });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function normNote(n) { if (n && typeof n === 'object') return n.ja || ''; return n || ''; }
function parsePhotos(s) { try { return s ? JSON.parse(s) : []; } catch (_) { return []; } }
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
