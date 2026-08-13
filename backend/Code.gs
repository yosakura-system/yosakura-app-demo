/**
 * 世桜アプリ 共有バックエンド（Google Apps Script）＋写真はGoogle Drive保存版
 * スプレッドシート＝報告データ、Google Drive＝写真本体（シートには写真のファイルIDのみ保存）。
 * 「スプレッドシートに紐づくスクリプト」として動かす前提。デプロイ手順は「デプロイ手順.md」参照。
 *
 * ★スケール対策（2026-07-25 追加）：
 *   ① doGet は「直近ぶんだけ」読むため、シートが巨大化しても速度が落ちない（READ_TAIL）。
 *   ② purgeOldData() を1日1回のトリガーで回すと、90日を過ぎた写真・動画・提出データを自動削除。
 *      設定：GASエディタ左の「トリガー(時計アイコン)」→ 関数=purgeOldData / 種類=時間主導型 / 日タイマー。
 */
var SHEET_NAME = 'reports';
var HEADERS = ['id', 'ts', 'kind', 'store', 'item', 'level', 'note', 'photos'];
var PHOTO_FOLDER = '世桜アプリ_写真';
var READ_TAIL = 2000;        // doGetで読む「直近の行数」の上限（シート全体は読まない＝高速）
var RETURN_MAX = 800;        // 返す最新レコード数の上限

/* ★保存期間・自動削除の設定（2026-07-31 仕様確定：90日）
 * 写真・動画・提出データを「90日」で自動削除する。
 * ・削除の起算日＝そのデータが作られた日時（写真＝Driveの作成日、提出＝行のts）
 * ・1日1回のトリガーで purgeOldData() を回す（写真＋提出データの両方を削除）
 * ・★設定（提出物マスタ・定休日）は消さない（消すとアプリの設定が失われるため）
 * ・削除の前に listPurgeTargets() で「消える予定」を確認できる（確認だけで削除はしない）*/
/* ★設定は「使うときに読む」（読み込み時に読むと、初回の承認前に不明なエラーになることがあるため） */
function ttlDays_()        { return Number(getSetting_('PHOTO_TTL_DAYS', 90)) || 90; }  // 保持日数
function autoPurgeOn_()    { return getSetting_('ENABLE_AUTO_PURGE', true) === true; }  // 自動削除の有効/無効
/* 削除しないkind（アプリの設定情報。消すと提出物マスタや定休日が失われる）
   ★2026-08-14 追加＝ckitem（店舗が足したチェック項目）・ckhide（店舗が外した共通項目）。
     店舗ごとに作り替えた点検表そのものなので、保存期間で消えると各店の設定が失われる。 */
var PURGE_KEEP_KINDS  = ['submaster', 'subholiday', 'appfb', 'ckitem', 'ckhide'];

// スクリプトプロパティから設定を読む（無ければ既定値）。管理画面や手動で変更できる。
function getSetting_(key, def) {
  try {
    var v = PropertiesService.getScriptProperties().getProperty(key);
    if (v === null || v === undefined || v === '') return def;
    if (v === 'true') return true; if (v === 'false') return false;
    var n = Number(v); return isNaN(n) ? v : n;
  } catch (e) { return def; }
}

/* スプレッドシートの取得（3段構え）
   ① Script Properties の SPREADSHEET_ID があればそれを開く（スクリプトを単独作成した場合はこれ）
   ② 無ければ「このスクリプトが紐づくシート」（拡張機能→Apps Scriptで作った場合）
   ③ どちらも無ければ、何をすればよいかを日本語で知らせる
   ※ IDはコードに直接書かず、Script Properties で管理する（公開リポジトリに残さないため） */
function getSS_() {
  var id = getSetting_('SPREADSHEET_ID', '');
  if (id) {
    try { return SpreadsheetApp.openById(String(id)); }
    catch (e) { throw new Error('SPREADSHEET_ID のシートを開けません。IDが正しいか、このアカウントに編集権限があるかご確認ください。（' + e + '）'); }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('スプレッドシートに接続できません。次のどちらかで解決します：'
      + '(A) プロジェクトの設定 →「スクリプト プロパティ」に SPREADSHEET_ID を追加し、対象シートのIDを入れる。'
      + '(B) 対象のスプレッドシートを開き「拡張機能 → Apps Script」から作り直す。');
  }
  return ss;
}

function getSheet() {
  var ss = getSS_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); }
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

/* ★削除トリガー（毎日実行）を設定する。エディタが不安定でも、これを1回実行すれば設定できる。
   既に同じトリガーがあれば作らない（重複防止）。 */
function ensureDailyPurgeTrigger() {
  var exists = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'purgeOldData'; });
  if (exists.length) {
    var out0 = { 結果: '既に設定済み', 件数: exists.length };
    Logger.log(JSON.stringify(out0)); return out0;
  }
  ScriptApp.newTrigger('purgeOldData').timeBased().atHour(3).everyDays(1).create();
  var out = { 結果: '設定しました', 内容: '毎日 午前3時台に purgeOldData を実行' };
  Logger.log(JSON.stringify(out)); return out;
}

/* 現在のトリガー一覧を確認する（変更しません） */
function listTriggers() {
  var ts = ScriptApp.getProjectTriggers().map(function (t) { return { 関数: t.getHandlerFunction(), 種類: String(t.getEventType()) }; });
  var out = { 件数: ts.length, 一覧: ts };
  Logger.log(JSON.stringify(out, null, 2)); return out;
}

/* ★まずこれを実行して動作を確認する（何も変更しません）
   ここで承認画面が出たら「詳細」→「（安全ではないページ）に移動」→「許可」。
   これが成功すれば、スクリプト自体は正常に動いています。 */
function hello() {
  var msg = 'OK: スクリプトは動作しています / ' + new Date();
  Logger.log(msg);
  return msg;
}

/* ★接続先の確認（承認後に実行）。どのシートに繋がるかを表示します（変更しません）。 */
function whichSheet() {
  var id = getSetting_('SPREADSHEET_ID', '');
  var out = { SPREADSHEET_IDの設定: id ? 'あり' : 'なし（このスクリプトに紐づくシートを使います）' };
  try {
    var ss = getSS_();
    out.接続できたシート名 = ss.getName();
    out.シートID = ss.getId();
    out.結果 = 'OK';
  } catch (e) {
    out.結果 = 'NG';
    out.エラー = String(e.message || e);
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   初期セットアップ（世桜システム管理アカウントで一度だけ実行）
   ★ 既存のシート・データは削除も上書きもしません。不足分だけ追加します。
   使い方：GASエディタで関数 setupYosakuraBackend を選び「実行」。
   ============================================================ */
function setupYosakuraBackend() {
  var result = { sheets: createRequiredSheets(), properties: initScriptProperties_(), drive: ensurePhotoFolder_() };
  result.validation = validateBackendConfiguration();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

// 必要なシートとヘッダーを作る（既存があれば触らず、不足ヘッダーのみ追記）
function createRequiredSheets() {
  var ss = getSS_();
  var plan = [
    { name: SHEET_NAME, headers: HEADERS, note: 'アプリの全データ（1行＝1件）。kindで種類を判別' },
    { name: '_readme',  headers: ['項目', '説明'], note: 'この保存先の説明' }
  ];
  var out = [];
  plan.forEach(function (p) {
    var sh = ss.getSheetByName(p.name);
    var created = false;
    if (!sh) { sh = ss.insertSheet(p.name); created = true; }
    if (sh.getLastRow() === 0) sh.appendRow(p.headers);
    else {
      // 既存ヘッダーに不足があれば右側へ追加（既存列は動かさない）
      var cur = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
      p.headers.forEach(function (h) { if (cur.indexOf(h) === -1) sh.getRange(1, sh.getLastColumn() + 1).setValue(h); });
    }
    out.push({ sheet: p.name, created: created, note: p.note });
  });
  // _readme に説明を入れる（空のときだけ）
  var rm = ss.getSheetByName('_readme');
  if (rm && rm.getLastRow() <= 1) {
    rm.appendRow(['用途', '世桜アプリの本番データ保存先（提出・判定・設定・写真ID）']);
    rm.appendRow(['注意', 'reportsシートを直接編集・削除しないでください（アプリの表示に影響します）']);
    rm.appendRow(['写真', 'Googleドライブの「世桜アプリ_写真」フォルダに保存されます']);
    rm.appendRow(['自動削除', '90日で自動削除（写真・動画・提出データ）。設定（提出物マスタ・定休日・ご意見）は削除しません']);
    rm.appendRow(['kindの例', 'a/b=食べ残し, kizuki=気づき, soukatsu=総括表, video=店内動画, survey, route, open, svfb']);
    rm.appendRow(['提出管理', 'submaster=提出物マスタ, substat=判定/本部確認, subholiday=定休日, subrec=提出実績, appfb=ご意見']);
  }
  return out;
}

// Script Properties の初期値（既に値があれば上書きしない）
function initScriptProperties_() {
  var sp = PropertiesService.getScriptProperties();
  var defaults = {
    ENABLE_AUTO_PURGE: 'true',   // 自動削除（写真・動画・提出データ）
    PHOTO_TTL_DAYS: '90',        // 保存期間＝90日（写真・動画・提出データ共通）
    ENV: 'pilot',                // pilot（本部直営店の試験運用）→ prod
    READ_TAIL: String(READ_TAIL),
    RETURN_MAX: String(RETURN_MAX)
  };
  var applied = {};
  Object.keys(defaults).forEach(function (k) {
    var cur = sp.getProperty(k);
    if (cur === null || cur === '') { sp.setProperty(k, defaults[k]); applied[k] = defaults[k] + '（新規設定）'; }
    else applied[k] = cur + '（既存のまま）';
  });
  return applied;
}

// 写真フォルダを用意し、そのIDをプロパティに記録
function ensurePhotoFolder_() {
  var folder = getPhotoFolder();
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER_ID', folder.getId());
  return { name: folder.getName(), id: folder.getId(), url: folder.getUrl() };
}

/* 構成が正しいかを点検する（実行して結果をログで確認）。データは変更しません。 */
function validateBackendConfiguration() {
  var ss = getSS_();
  var sp = PropertiesService.getScriptProperties();
  var sh = ss.getSheetByName(SHEET_NAME);
  var checks = [];
  function ck(name, ok, detail) { checks.push({ check: name, ok: !!ok, detail: detail || '' }); }

  ck('スプレッドシートに接続できる', !!ss, ss ? ss.getName() : '');
  ck('reportsシートがある', !!sh, sh ? ('行数: ' + sh.getLastRow()) : '未作成');
  if (sh) {
    var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    var missing = HEADERS.filter(function (h) { return head.indexOf(h) === -1; });
    ck('ヘッダーが揃っている', missing.length === 0, missing.length ? ('不足: ' + missing.join(',')) : head.join(','));
  }
  var folderOk = false, folderInfo = '';
  try { var f = getPhotoFolder(); folderOk = true; folderInfo = f.getName() + ' / ' + f.getId(); } catch (e) { folderInfo = String(e); }
  ck('写真フォルダにアクセスできる', folderOk, folderInfo);
  ck('自動削除が有効になっている（90日仕様）', String(sp.getProperty('ENABLE_AUTO_PURGE')) === 'true', 'ENABLE_AUTO_PURGE=' + sp.getProperty('ENABLE_AUTO_PURGE'));
  ck('保存期間が90日である', String(sp.getProperty('PHOTO_TTL_DAYS')) === '90', 'PHOTO_TTL_DAYS=' + sp.getProperty('PHOTO_TTL_DAYS'));
  var hasTrigger = false;
  try { hasTrigger = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'purgeOldData'; }); } catch (e) {}
  ck('削除トリガー(purgeOldData)が設定されている', hasTrigger, hasTrigger ? '毎日実行されます' : '未設定：GASの時計アイコン→日タイマーで purgeOldData を追加してください');
  ck('環境が設定されている', !!sp.getProperty('ENV'), 'ENV=' + sp.getProperty('ENV'));

  var ng = checks.filter(function (c) { return !c.ok; });
  var out = { allOk: ng.length === 0, ngCount: ng.length, checks: checks };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* 接続テスト用：1件書いて読み、そのテスト行を削除する（本番データに残しません） */
function selfTestReadWrite() {
  var sh = getSheet();
  var id = 'selftest-' + Utilities.getUuid();
  sh.appendRow([id, Date.now(), '_selftest', '_test', 'ping', '', '接続テスト', '[]']);
  var lastRow = sh.getLastRow();
  var wrote = sh.getRange(lastRow, 1).getValue() === id;
  if (wrote) sh.deleteRow(lastRow); // テスト行は残さない
  var out = { wrote: wrote, cleaned: wrote };
  Logger.log(JSON.stringify(out));
  return out;
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
    // 容量の確認：?action=storage で使用量・増加ペース・90日/60日の見込みを返す
    if (e && e.parameter && e.parameter.action === 'storage') {
      return json({ ok: true, storage: storageReport() });
    }
    // 構成の点検：?action=validate（変更しません）
    if (e && e.parameter && e.parameter.action === 'validate') {
      return json({ ok: true, validate: validateBackendConfiguration() });
    }
    // トリガーの確認：?action=triggers（変更しません）
    if (e && e.parameter && e.parameter.action === 'triggers') {
      return json({ ok: true, triggers: listTriggers() });
    }
    // トリガーの設定：?action=setupTrigger（毎日の自動削除を有効化。重複は作りません）
    if (e && e.parameter && e.parameter.action === 'setupTrigger') {
      return json({ ok: true, setup: ensureDailyPurgeTrigger() });
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
 * ★安全化（2026-07-31）：autoPurgeOn_() が false の間は「何も削除しない」。
 *   保存期間（ttlDays_()）と有効化（autoPurgeOn_()）が確定するまで削除を止める。
 *   削除される予定の写真は listPurgeTargets() で事前に確認できる。
 */
function purgeOldPhotos() {
  if (!autoPurgeOn_()) {
    Logger.log('purgeOldPhotos: DISABLED (ENABLE_AUTO_PURGE=false). No files were trashed.');
    return { enabled: false, trashed: 0, note: '自動削除は無効です。スクリプト プロパティで ENABLE_AUTO_PURGE=true にすると有効化されます。' };
  }
  var folder = getPhotoFolder();
  var cutoff = new Date(Date.now() - ttlDays_() * 24 * 60 * 60 * 1000);
  var files = folder.getFiles();
  var removed = 0;
  while (files.hasNext()) {
    var f = files.next();
    try { if (f.getDateCreated() < cutoff) { f.setTrashed(true); removed++; } } catch (_) {}
  }
  Logger.log('purgeOldPhotos: trashed ' + removed + ' file(s) older than ' + ttlDays_() + ' days');
  return { enabled: true, trashed: removed, ttlDays: ttlDays_() };
}

/**
 * 提出データ（reportsシートの行）を保存期間で自動削除する。
 * ★設定（PURGE_KEEP_KINDS＝提出物マスタ・定休日・ご意見）は消さない。
 * 行は下から消して行番号のズレを防ぐ。処理が途中で止まっても壊れない（消えた分だけ減る）。
 */
function purgeOldRows() {
  if (!autoPurgeOn_()) {
    Logger.log('purgeOldRows: DISABLED (ENABLE_AUTO_PURGE=false).');
    return { enabled: false, deleted: 0 };
  }
  var sh = getSheet();
  var last = sh.getLastRow();
  if (last < 2) return { enabled: true, deleted: 0 };
  var cutoff = Date.now() - ttlDays_() * 24 * 60 * 60 * 1000;
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues(); // 2行目以降（1行目はヘッダー）
  var rowsToDelete = [];
  for (var i = 0; i < values.length; i++) {
    var ts = Number(values[i][1]) || 0;      // ts列
    var kind = String(values[i][2] || '');   // kind列
    if (!ts) continue;                        // 日時が無い行は触らない（安全側）
    if (PURGE_KEEP_KINDS.indexOf(kind) !== -1) continue; // 設定は残す
    if (ts < cutoff) rowsToDelete.push(i + 2); // 実際の行番号
  }
  // 連続した行はまとめて削除（API呼び出しを減らす）。必ず下から。
  var deleted = 0;
  for (var j = rowsToDelete.length - 1; j >= 0; ) {
    var end = rowsToDelete[j], start = end, k = j;
    while (k > 0 && rowsToDelete[k - 1] === rowsToDelete[k] - 1) { k--; start = rowsToDelete[k]; }
    sh.deleteRows(start, end - start + 1);
    deleted += (end - start + 1);
    j = k - 1;
  }
  logPurge_('rows', deleted, ttlDays_());
  Logger.log('purgeOldRows: deleted ' + deleted + ' row(s) older than ' + ttlDays_() + ' days');
  return { enabled: true, deleted: deleted, ttlDays: ttlDays_() };
}

/**
 * ★1日1回のトリガーはこの関数を指定する（写真・動画＋提出データをまとめて削除）。
 * 設定：GASエディタ左の「トリガー(時計アイコン)」→ 関数=purgeOldData / 時間主導型 / 日タイマー（深夜帯推奨）
 */
function purgeOldData() {
  var photos = purgeOldPhotos();
  var rows = purgeOldRows();
  var out = { ttlDays: ttlDays_(), enabled: autoPurgeOn_(), photos: photos, rows: rows };
  Logger.log(JSON.stringify(out));
  return out;
}

// 削除の記録を _purgelog シートへ残す（いつ・何を・何件消したか）
function logPurge_(target, count, ttl) {
  try {
    var ss = getSS_();
    var sh = ss.getSheetByName('_purgelog');
    if (!sh) { sh = ss.insertSheet('_purgelog'); sh.appendRow(['実行日時', '対象', '削除件数', '保存日数']); }
    sh.appendRow([new Date(), target, count, ttl]);
  } catch (e) {}
}

/**
 * ★容量レポート：写真の使用量・増加ペース・このまま90日運用した場合の見込みを返す。
 * 「90日のままで足りるか／60日に短縮すべきか／別アカウントへ移すべきか」の判断に使う。
 * 実行方法：関数 storageReport を選んで実行 → ログを見る（データは変更しません）。
 */
function storageReport() {
  var folder = getPhotoFolder();
  var files = folder.getFiles();
  var total = 0, bytes = 0, oldest = null, newest = null;
  var byMonth = {};
  while (files.hasNext()) {
    var f = files.next();
    var size = 0; try { size = f.getSize(); } catch (e) {}
    var created = f.getDateCreated();
    total++; bytes += size;
    if (!oldest || created < oldest) oldest = created;
    if (!newest || created > newest) newest = created;
    var key = Utilities.formatDate(created, 'Asia/Tokyo', 'yyyy-MM');
    if (!byMonth[key]) byMonth[key] = { count: 0, bytes: 0 };
    byMonth[key].count++; byMonth[key].bytes += size;
  }
  var mb = function (b) { return Math.round(b / 1024 / 1024 * 10) / 10; };
  // 増加ペース（実績日数から1日あたりを算出）
  var days = (oldest && newest) ? Math.max(1, Math.round((newest - oldest) / 86400000) + 1) : 1;
  var perDayBytes = bytes / days;
  var projected90 = perDayBytes * 90;   // 90日運用時に常時保持される見込み
  var projected60 = perDayBytes * 60;   // 60日に短縮した場合
  // Driveの空き容量（取得できる場合のみ）
  var quota = null;
  try { quota = { 使用中GB: Math.round(DriveApp.getStorageUsed() / 1073741824 * 100) / 100, 上限GB: Math.round(DriveApp.getStorageLimit() / 1073741824 * 100) / 100 }; } catch (e) {}

  var out = {
    保存日数の設定: ttlDays_(),
    自動削除: autoPurgeOn_() ? '有効' : '無効',
    写真枚数: total,
    写真の合計MB: mb(bytes),
    実績日数: days,
    '1日あたりMB': mb(perDayBytes),
    '90日運用時の見込みMB': mb(projected90),
    '60日運用時の見込みMB': mb(projected60),
    月別: Object.keys(byMonth).sort().reduce(function (o, k) { o[k] = byMonth[k].count + '枚 / ' + mb(byMonth[k].bytes) + 'MB'; return o; }, {}),
    ドライブ容量: quota,
    判断の目安: '「90日運用時の見込みMB」が空き容量に対して大きい場合は、スクリプト プロパティの PHOTO_TTL_DAYS を 60 に変更するか、容量の大きいアカウントへ移行を検討'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * 削除予定の一覧を返す（★削除はしない）。実行前に影響範囲を確認するために使う。
 * doGet(?action=purgeTargets) でも呼べる。
 */
function listPurgeTargets() {
  var cutoffMs = Date.now() - ttlDays_() * 24 * 60 * 60 * 1000;
  var cutoff = new Date(cutoffMs);
  // 写真
  var folder = getPhotoFolder();
  var files = folder.getFiles();
  var photoTargets = [], photoTotal = 0;
  while (files.hasNext()) {
    var f = files.next(); photoTotal++;
    var created = f.getDateCreated();
    if (created < cutoff) photoTargets.push({ id: f.getId(), name: f.getName(), created: created.toISOString() });
  }
  // 提出データ（行）
  var sh = getSheet(); var last = sh.getLastRow();
  var rowTotal = 0, rowTargets = 0, keepCount = 0, byKind = {};
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    rowTotal = values.length;
    for (var i = 0; i < values.length; i++) {
      var ts = Number(values[i][1]) || 0, kind = String(values[i][2] || '');
      if (PURGE_KEEP_KINDS.indexOf(kind) !== -1) { keepCount++; continue; }
      if (ts && ts < cutoffMs) { rowTargets++; byKind[kind] = (byKind[kind] || 0) + 1; }
    }
  }
  return {
    ttlDays: ttlDays_(),
    autoPurgeEnabled: autoPurgeOn_(),
    cutoff: cutoff.toISOString(),
    keepKinds: PURGE_KEEP_KINDS,
    photos: { total: photoTotal, wouldTrash: photoTargets.length, sample: photoTargets.slice(0, 20) },
    rows: { total: rowTotal, wouldDelete: rowTargets, keptAsConfig: keepCount, byKind: byKind }
  };
}

function normNote(n) { if (n && typeof n === 'object') return n.ja || ''; return n || ''; }
function parsePhotos(s) { try { return s ? JSON.parse(s) : []; } catch (_) { return []; } }
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
