/**
 * 世桜アプリ 共有バックエンド（Google Apps Script）＋写真はGoogle Drive保存版
 * スプレッドシート＝報告データ、Google Drive＝写真本体（シートには写真のファイルIDのみ保存）。
 * 「スプレッドシートに紐づくスクリプト」として動かす前提。デプロイ手順は「デプロイ手順.md」参照。
 *
 * ★スケール対策（2026-07-25 追加）：
 *   ① doGet は「直近ぶんだけ」読むため、シートが巨大化しても速度が落ちない（READ_TAIL）。
 *   ② purgeOldPhotos() を1日1回のトリガーで回すと、古い写真を自動でゴミ箱へ（Drive容量対策）。
 *      設定：GASエディタ左の「トリガー(時計アイコン)」→ 関数=purgeOldPhotos / 種類=時間主導型 / 日タイマー。
 */
var SHEET_NAME = 'reports';
var HEADERS = ['id', 'ts', 'kind', 'store', 'item', 'level', 'note', 'photos'];
var PHOTO_FOLDER = '世桜アプリ_写真';
var READ_TAIL = 2000;        // doGetで読む「直近の行数」の上限（シート全体は読まない＝高速）
var RETURN_MAX = 800;        // 返す最新レコード数の上限
var PHOTO_TTL_DAYS = 90;     // 写真をDriveに保持する日数（これより古い写真は自動でゴミ箱へ）

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); }
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function getPhotoFolder() {
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

// base64のdataURLを受け取りDriveへ保存してファイルIDを返す。既にID/URLならそのまま返す。
function savePhoto(p) {
  var m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(String(p || ''));
  if (!m) return p; // dataURLでなければ（既存のID等）そのまま
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'photo.jpg');
  var file = getPhotoFolder().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getId();
}

// 報告一覧を返す（新しい順）。?store=店舗名 で絞り込み可、?store=all は全件。
// ★シート末尾の直近 READ_TAIL 行だけを読むので、行数が増えても速度が一定。
function doGet(e) {
  try {
    var sh = getSheet();
    var lastRow = sh.getLastRow();
    var store = e && e.parameter ? e.parameter.store : '';
    var out = [];
    if (lastRow >= 2) {
      var startRow = Math.max(2, lastRow - READ_TAIL + 1);
      var numRows = lastRow - startRow + 1;
      var values = sh.getRange(startRow, 1, numRows, HEADERS.length).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        var r = values[i];
        if (!r[0]) continue;
        if (store && store !== 'all' && r[3] !== store) continue;
        out.push({
          id: r[0], t: Number(r[1]) || 0, kind: r[2], store: r[3],
          item: r[4], level: r[5], note: r[6], photos: parsePhotos(r[7])
        });
        if (out.length >= RETURN_MAX) break;
      }
    }
    return json({ ok: true, reports: out });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// 報告を1件追加。写真はDriveへ保存しIDをシートに記録。
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sh = getSheet();
    var id = Utilities.getUuid();
    var ts = data.t || Date.now();
    var input = Array.isArray(data.photos) ? data.photos.slice(0, 6) : [];
    var photoIds = input.map(savePhoto);
    sh.appendRow([id, ts, data.kind || '', data.store || '', data.item || '', data.level || '', normNote(data.note), JSON.stringify(photoIds)]);
    return json({ ok: true, id: id });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * 古い写真を自動でゴミ箱へ（Drive容量対策）。1日1回のトリガーで実行する。
 * ※ゴミ箱の写真は約30日後に自動で完全削除され、容量が解放されます（すぐ空けたい時は手動でゴミ箱を空に）。
 */
function purgeOldPhotos() {
  var folder = getPhotoFolder();
  var cutoff = new Date(Date.now() - PHOTO_TTL_DAYS * 24 * 60 * 60 * 1000);
  var files = folder.getFiles();
  var removed = 0;
  while (files.hasNext()) {
    var f = files.next();
    try { if (f.getDateCreated() < cutoff) { f.setTrashed(true); removed++; } } catch (_) {}
  }
  Logger.log('purgeOldPhotos: trashed ' + removed + ' file(s) older than ' + PHOTO_TTL_DAYS + ' days');
  return removed;
}

function normNote(n) { if (n && typeof n === 'object') return n.ja || ''; return n || ''; }
function parsePhotos(s) { try { return s ? JSON.parse(s) : []; } catch (_) { return []; } }
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
