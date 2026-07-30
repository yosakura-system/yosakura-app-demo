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

/* ★保存期間・自動削除の設定（2026-07-31 安全化）
 * MTGでは「保存2ヶ月」で整理中だが、削除対象・起算日が未確定のため、
 * 自動削除は初期OFF。確定後に ENABLE_AUTO_PURGE を true にし、PHOTO_TTL_DAYS を60日等へ変更する。
 * まずは listPurgeTargets() で「削除される予定の写真」を確認できる（削除はしない）。*/
var PHOTO_TTL_DAYS   = getSetting_('PHOTO_TTL_DAYS', 90);      // 保持日数（設定値で変更可）
var ENABLE_AUTO_PURGE = getSetting_('ENABLE_AUTO_PURGE', false); // 自動削除の有効/無効（初期OFF）

// スクリプトプロパティから設定を読む（無ければ既定値）。管理画面や手動で変更できる。
function getSetting_(key, def) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(key);
    if (v === null || v === undefined || v === '') return def;
    if (v === 'true') return true; if (v === 'false') return false;
    var n = Number(v); return isNaN(n) ? v : n;
  } catch (e) { return def; }
}

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
    // 保存期間の確認用：?action=purgeTargets は「削除される予定」を返すだけ（削除しない）
    if (e && e.parameter && e.parameter.action === 'purgeTargets') {
      return json({ ok: true, purge: listPurgeTargets() });
    }
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
 * 古い写真を自動でゴミ箱へ（Drive容量対策）。1日1回のトリガーで実行する想定。
 * ★安全化（2026-07-31）：ENABLE_AUTO_PURGE が false の間は「何も削除しない」。
 *   保存期間（PHOTO_TTL_DAYS）と有効化（ENABLE_AUTO_PURGE）が確定するまで削除を止める。
 *   削除される予定の写真は listPurgeTargets() で事前に確認できる。
 */
function purgeOldPhotos() {
  if (!ENABLE_AUTO_PURGE) {
    Logger.log('purgeOldPhotos: DISABLED (ENABLE_AUTO_PURGE=false). No files were trashed.');
    return { enabled: false, trashed: 0, note: '自動削除は無効です。ScriptプロパティでENABLE_AUTO_PURGE=trueにすると有効化されます。' };
  }
  var folder = getPhotoFolder();
  var cutoff = new Date(Date.now() - PHOTO_TTL_DAYS * 24 * 60 * 60 * 1000);
  var files = folder.getFiles();
  var removed = 0;
  while (files.hasNext()) {
    var f = files.next();
    try { if (f.getDateCreated() < cutoff) { f.setTrashed(true); removed++; } } catch (_) {}
  }
  Logger.log('purgeOldPhotos: trashed ' + removed + ' file(s) older than ' + PHOTO_TTL_DAYS + ' days');
  return { enabled: true, trashed: removed, ttlDays: PHOTO_TTL_DAYS };
}

/**
 * 削除予定の写真の一覧を返す（★削除はしない）。保存期間の確定前に、影響範囲を確認するために使う。
 * doGet(?action=purgeTargets) でも呼べる。
 */
function listPurgeTargets() {
  var folder = getPhotoFolder();
  var cutoff = new Date(Date.now() - PHOTO_TTL_DAYS * 24 * 60 * 60 * 1000);
  var files = folder.getFiles();
  var targets = [], total = 0;
  while (files.hasNext()) {
    var f = files.next(); total++;
    var created = f.getDateCreated();
    if (created < cutoff) targets.push({ id: f.getId(), name: f.getName(), created: created.toISOString() });
  }
  return { ttlDays: PHOTO_TTL_DAYS, autoPurgeEnabled: ENABLE_AUTO_PURGE, totalPhotos: total, wouldTrash: targets.length, sample: targets.slice(0, 50) };
}

function normNote(n) { if (n && typeof n === 'object') return n.ja || ''; return n || ''; }
function parsePhotos(s) { try { return s ? JSON.parse(s) : []; } catch (_) { return []; } }
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
