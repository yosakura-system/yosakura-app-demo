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
/* ★2026-08-27 引き上げ（800→6000）＝過去分の遡り取り込みで古い行が窓から押し出され、
   アプリがほぼ空に見えた不具合の再発防止。
   ★2026-09-10 再発（6000→9000へ引き上げ）＝総括表の全項目転記の全期間取り込みで行数が6,440行になり、
   7月のサーベイ回答などが窓の外へ。同じ形の3回目を防ぐため、①窓を広げる ②validateに
   「行数が窓に近い」の検知を追加 ③重複行の圧縮（整理圧縮.gs）で行数自体を減らす、の3点セットにする。 */
var READ_TAIL = 9000;        // doGetで読む「直近の行数」の上限（シート全体は読まない＝高速）
var RETURN_MAX = 9000;       // 返す最新レコード数の上限（READ_TAILと揃える＝窓から押し出さない）

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
   ★2026-08-13 追加＝ckitem（店舗が足したチェック項目）・ckhide（店舗が外した共通項目）。
     店舗ごとに作り替えた点検表そのものなので、保存期間で消えると各店の設定が失われる。
   ★2026-08-25 追加＝emg（店舗の緊急連絡先）・linkset（本部が登録した資料リンク一覧）・
     faqset（よくある質問）・study（勉強会の録画）・news（本部のお知らせ）。
     ⚠️ 自動削除は「このリスト以外を全部消す」作りのため、設定系のkindを足したら必ずここにも足す。
        仕様（2026-07-31確定）で消してよいのは「写真・動画・提出データ」だけ。設定・登録情報は対象外。
        例＝linkset は最新1行が全リンク一覧なので、本部が90日リンクを触らないだけで全部消えるところだった。 */
/* ★2026-08-27 追加＝soukatsu（総括表の日次）。
   日報一本化（2026-08-26 構築MTG決定）でアプリが入力の正本・月次出力（紙保管）の元データになった。
   90日で消すと過去月の月次出力も店舗比較も出せなくなる。写真を持たない軽量な行なので容量負担も小さい。 */
/* ★2026-08-30 追加＝phsample（見本写真＋店舗ごとの注意書き。長田さんのご提案）。
   店舗の「正しい撮り方」の見本＝設定情報。行だけでなく、参照している写真の実体も
   purgeOldPhotos 側で削除対象から外す（samplePhotoIds_）。行が守られても写真が消えたら意味がない。 */
/* ★2026-09-01 追加＝monthly（月次数値＋棚卸の品目内訳 closeDetail）。
   90日で消すと過去月の原価率の推移・前年比較が出せなくなる。soukatsu と同じ理由で守る。 */
/* ★2026-09-07 追加＝gsnap（Google口コミの毎晩スナップショット＝総数・星・獲得数・代表口コミ）。
   90日で消すと「Google口コミ集計」の推移が3か月で切れる。1日10行ほどの軽量な行なので恒久保存（神田さんのご指示）。 */
/* ★2026-09-08 追加＝newslike/newsread/newscmt（お知らせへのいいね・確認・コメント）。
   お知らせ本体（news）が恒久保存のため、反応だけ90日で消えると「誰が確認したか」の記録に穴があく。 */
var PURGE_KEEP_KINDS  = ['submaster', 'subholiday', 'appfb', 'ckitem', 'ckhide', 'zaikomaster', 'staffm',   // staffm＝勤怠の名簿（総括表「勤怠表」から・2026-10-15）   // zaikomaster＝在庫の品目・基準在庫（2026-09-18）
                         'emg', 'linkset', 'faqset', 'study', 'news', 'soukatsu', 'phsample', 'monthly', 'gsnap',
                         'newslike', 'newsread', 'newscmt',
                         /* ★2026-09-15 神田さん判断＝みんなの投稿・いいね・コメントは90日で消さない
                            （「1店舗への指摘が全店舗の教育になる」9/14決定＝古い投稿も教材として残す） */
                         'community', 'commlike', 'commcmt',
                         /* ★2026-10-24 公開・横展開・お試しの指定も守る＝投稿（community）は恒久なのに、指定だけ90日で消えると
                            公開済みの投稿が「確認待ち」に戻り、店から見えなくなる（app.js commState の既定は pending） */
                         'commmod', 'commroll', 'commtry',
                         'hqtask',    // 本部の個人タスク（試行・2026-09-15）＝消えると困るもの
                         'svcheck',   // 巡回チェック（本部・2026-09-16）＝巡回の記録は消さない
                         'svstd',     // 巡回チェックの基準（あるべき姿・スクショ）＝恒久
                         'whistle'];  // 公益通報（カスハラ含む・2026-09-24 神田さん）＝法律上の記録。90日で消さない（閲覧は本部のみ）

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
  // ★所有者が自分でないフォルダを掴んでいたら止める。
  //   移行時、旧アカウントから共有された同名フォルダを掴むと写真を保存できない（閲覧者のため）。
  var owner = '', me = '';
  try { owner = folder.getOwner() ? folder.getOwner().getEmail() : ''; } catch (e) {}
  try { me = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (owner && me && owner !== me) {
    throw new Error('★写真フォルダの所有者が違います（所有者: ' + owner + ' ／ 実行者: ' + me + '）。'
      + '旧アカウントから共有された同名フォルダを掴んでいる可能性があります。'
      + '新しい写真フォルダを作り、そのIDを Script Properties の PHOTO_FOLDER_ID に設定してください。');
  }
  return { name: folder.getName(), id: folder.getId(), url: folder.getUrl(), owner: owner };
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
  /* ★2026-09-10 追加＝行数が読み窓（READ_TAIL）に近づいたら知らせる。
     窓を超えると古い行が黙って押し出され「過去のデータが消えた」ように見える（3回発生）。
     8割を超えたら、整理圧縮.gs で重複行を圧縮するか、READ_TAIL を引き上げる */
  if (sh) {
    var 行 = sh.getLastRow() - 1;
    ck('行数が読み窓（READ_TAIL=' + READ_TAIL + '）に収まっている', 行 <= READ_TAIL * 0.8,
       '行数 ' + 行 + ' / 窓 ' + READ_TAIL + (行 > READ_TAIL * 0.8 ? '（★8割超え＝圧縮または窓の引き上げを）' : ''));
  }
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
  /* 日計OCR（長堀橋トライアル）＝任意機能なので ok は常に true。貼付状態は detail で分かる
     ＝外から ?action=validate で「貼り替えが済んだか」を確認できる */
  ck('日計OCR（写真の自動読み取り・長堀橋トライアル）', true,
     (typeof nikkei_ocr_hook_ === 'function') ? '貼付済み' : '未貼付（任意：backend/日計OCR.gs を追加すると有効）');
  ck('納品書OCR（納品書写真→仕入の下書き）', true,
     (typeof nouhin_ocr_hook_ === 'function') ? '貼付済み' : '未貼付（任意：backend/納品書OCR.gs を追加すると有効）');
  /* ★2026-09-03 の貼り替えぶん＝外から ?action=validate で「済んだか」を確認できるようにする */
  ck('提出の重複防止（findSameReport_）', typeof findSameReport_ === 'function',
     (typeof findSameReport_ === 'function') ? '貼付済み＝送り直しで同じ提出が増えない' : '未貼付：Code.gs を貼り替えてください');
  var tokenMax = 0; try { tokenMax = AUTH_TOKEN_MAX; } catch (e) {}
  ck('同時ログイン端末の上限', tokenMax >= 10, 'AUTH_TOKEN_MAX=' + tokenMax + (tokenMax >= 10 ? '' : '（認証.gs を貼り替えると10になります）'));
  ck('90日削除から守るkindにmonthlyがある', PURGE_KEEP_KINDS.indexOf('monthly') !== -1, PURGE_KEEP_KINDS.join(','));
  /* ★2026-09-07 の貼り替えぶん＝外から ?action=validate で「済んだか」を確認できるようにする */
  ck('90日削除から守るkindにgsnap（Google口コミ記録）がある', PURGE_KEEP_KINDS.indexOf('gsnap') !== -1,
     PURGE_KEEP_KINDS.indexOf('gsnap') !== -1 ? '口コミ推移は恒久保存' : '未貼付：Code.gs を貼り替えてください');

  /* ★2026-09-15 の貼り替えぶん＝みんなの投稿のコメント（v228）が全店に届くか。
     認証.gs を貼り替えて『デプロイを管理→既存の編集→新バージョン』まで済んだかを、外から ?action=validate で確かめられる。
     ここがNGだと、店舗からのコメントが自店と本部にしか届かない（中途半端に動く＝一番危ない状態） */
  var pubKinds = []; try { pubKinds = AUTH_PUBLIC_KINDS; } catch (e) {}
  ck('コメント（commcmt）が全店公開のkindに入っている', pubKinds.indexOf('commcmt') !== -1,
     pubKinds.indexOf('commcmt') !== -1 ? '貼付済み＝他店のコメントも全店に届く'
       : '未貼付：認証.gs を貼り替えたあと「デプロイを管理→既存の編集→新バージョン」まで行ってください');
  ck('みんなの投稿・コメントが90日削除から守られている', PURGE_KEEP_KINDS.indexOf('community') !== -1 && PURGE_KEEP_KINDS.indexOf('commcmt') !== -1,
     (PURGE_KEEP_KINDS.indexOf('commcmt') !== -1) ? '貼付済み＝投稿とコメントは恒久保存' : '未貼付：Code.gs を貼り替えてください（投稿が90日で消えます）');

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
  var sp = PropertiesService.getScriptProperties();
  var id = sp.getProperty('PHOTO_FOLDER_ID');
  // ★IDが入っていれば必ずそれを使う（名前で探し直さない）。
  //   置き場所を「01.本番」の中など任意の場所に決められる＝ルート直下に作られない。
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      throw new Error('★PHOTO_FOLDER_ID のフォルダを開けません（' + id + '）。'
        + 'IDが正しいか、このアカウントに権限があるかを確認してください。');
    }
  }
  // IDが未設定のときだけ名前で探す。
  // ⚠️ getFoldersByName は「共有されたフォルダ」も含めて横断検索する。
  //    旧アカウントから同名フォルダを共有されていると取り違えるため、複数見つかったら選ばずに止める。
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  var found = [];
  while (it.hasNext()) found.push(it.next());
  if (found.length > 1) {
    throw new Error('★「' + PHOTO_FOLDER + '」が' + found.length + '個見つかりました（'
      + found.map(function (f) { return f.getId(); }).join(' / ') + '）。'
      + 'どれを使うかを Script Properties の PHOTO_FOLDER_ID に設定してください。');
  }
  var folder = found.length ? found[0] : DriveApp.createFolder(PHOTO_FOLDER);
  sp.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

// base64のdataURLを受け取りDriveへ保存してファイルIDを返す。既にID/URLならそのまま返す。
/* ★2026-10-12 お金の写真（日計レポート・納品書）は「リンクを知っている全員」にしない＝ログイン済みの自店か本部にだけ返す（photoAction_）。
   他の写真（オープン写真・見本など）は従来どおりリンクで表示する。 */
function isPrivatePhotoRow_(kind, item) {
  if (String(kind || '') !== 'subrec') return false;
  var mid = String(item || '').split('|')[0];
  if (mid === 'nouhin') return true;
  try { if (typeof NIKKEI_TARGETS !== 'undefined' && NIKKEI_TARGETS[mid]) return true; } catch (e) {}
  return false;
}
function savePhoto(p, meta) {
  var m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(String(p || ''));
  if (!m) return p; // dataURLでなければ（既存のID等）そのまま
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'photo.jpg');
  var file = getPhotoFolder().createFile(blob);
  var priv = !!(meta && isPrivatePhotoRow_(meta.kind, meta.item));
  if (!priv) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  try { file.setDescription(JSON.stringify({ store: String((meta && meta.store) || ''), kind: String((meta && meta.kind) || ''), item: String((meta && meta.item) || '') })); } catch (e) {}
  return file.getId();
}
/* 神田の操作（エディタから1回）＝これまでに提出された お金の写真（日計・納品書）の公開リンクを外し、店舗名を控える。
   アプリは「p:」付きのIDをログイン経由で取りにくるので、表示は変わらない。
   ★2026-10-12 1回で6分の上限に当たった（写真が多い）＝途中の位置をプロパティに控え、4分半で区切って、
     終わっていなければ1分後の自分のトリガーを作って続ける。全部終わると控えとトリガーを消す。進み具合は実行ログで分かる */
var PHOTO_PRIVATE_CURSOR = 'PHOTO_PRIVATE_CURSOR';
function 写真_金銭系を非公開にする() {
  var sp = PropertiesService.getScriptProperties();
  var started = Date.now(); var BUDGET = 270 * 1000;   // 4分30秒で区切る（上限6分）
  var cur = Number(sp.getProperty(PHOTO_PRIVATE_CURSOR) || 0);   // 次に見る行番号（0＝最初から）
  var sh = getSheet(); var last = sh.getLastRow();
  var done = 0, skip = 0, miss = 0, seen = 0;
  if (last >= 2) {
    var from = Math.max(2, cur || 2);
    var vals = sh.getRange(from, 1, last - from + 1, HEADERS.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (isPrivatePhotoRow_(r[2], r[4])) {
        var ids = parsePhotos(r[7]);
        for (var j = 0; j < ids.length; j++) {
          var id = String(ids[j] || ''); if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) continue;
          seen++;
          try {
            var f = DriveApp.getFileById(id);
            if (f.getSharingAccess() !== DriveApp.Access.PRIVATE) { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); done++; } else skip++;
            try { if (!f.getDescription()) f.setDescription(JSON.stringify({ store: String(r[3] || ''), kind: String(r[2] || ''), item: String(r[4] || '') })); } catch (e) {}
          } catch (e) { miss++; }
        }
      }
      if (Date.now() - started > BUDGET) {
        var next = from + i + 1;
        sp.setProperty(PHOTO_PRIVATE_CURSOR, String(next));
        photoPrivate_trigger_(true);
        var mid = { 結果: '途中（時間で区切った・1分後に自動で続きを回す）', 次の行: next, 全行: last, この回: { 見た: seen, 非公開にした: done, 既に非公開: skip, 見つからない: miss } };
        Logger.log(JSON.stringify(mid)); return mid;
      }
    }
  }
  sp.deleteProperty(PHOTO_PRIVATE_CURSOR);
  photoPrivate_trigger_(false);
  var out = { 結果: '完了＝お金の写真の公開リンクを外した（最後まで見た）', 全行: last, この回: { 見た: seen, 非公開にした: done, 既に非公開: skip, 見つからない: miss } };
  Logger.log(JSON.stringify(out)); return out;
}
function photoPrivate_trigger_(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === '写真_金銭系を非公開にする') ScriptApp.deleteTrigger(t); });
  if (on) ScriptApp.newTrigger('写真_金銭系を非公開にする').timeBased().after(60 * 1000).create();
}
/* 進み具合を見る（変更しない） */
function 写真_非公開の進み具合() {
  var sp = PropertiesService.getScriptProperties(); var cur = sp.getProperty(PHOTO_PRIVATE_CURSOR);
  var trig = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === '写真_金銭系を非公開にする'; }).length;
  var out = { 次の行: cur ? Number(cur) : '（控えなし＝未実行か完了）', 全行: getSheet().getLastRow(), 続きのトリガー: trig };
  Logger.log(JSON.stringify(out)); return out;
}

/* ★2026-10-12 外向きのエラーは番号だけ（フォルダIDや設定名を返さない）。中身は実行ログに残す */
function serverError_(err) {
  var ref = Utilities.getUuid().slice(0, 8);
  try { Logger.log('[' + ref + '] ' + String(err && err.stack ? err.stack : err)); } catch (e) {}
  return { ok: false, error: 'SERVER_ERROR', ref: ref };
}

// 報告一覧を返す（新しい順）。?store=店舗名 で絞り込み可、?store=all は全件。
// ★シート末尾の直近 READ_TAIL 行だけを読むので、行数が増えても速度が一定。
function doGet(e) {
  try {
    /* ★2026-10-12 まず門番。保守用の action も門番のあと（本部だけ）に移した＝ログインなしで構成情報を読まれない・トリガーを作られない */
    var gate = (typeof auth_gate_get_ === 'function') ? auth_gate_get_(e) : { ok: true, u: null };
    if (!gate.ok) return json({ ok: false, error: 'AUTH_REQUIRED', needLogin: true });
    return json(apiRead_((e && e.parameter) || {}, gate.u));
  } catch (err) {
    return json(serverError_(err));
  }
}

/* 読み（doGet のクエリ／doPost の action:'list'|'photo' の両方から来る）。u＝ログイン済みの利用者（認証OFFのときは null） */
function apiRead_(p, u) {
  var action = String((p && p.action) || '');
  /* ★写真をbase64で返す（巡回チェックのレポート用・2026-09-16／お金の写真の表示用・2026-10-12）。
     本部は写真フォルダの全部、店舗は自店の写真（保存時に控えた店舗名が一致するもの）だけ */
  if (action === 'photo') return photoAction_(p, u);
  if (action) {
    if (u && u.role !== 'hq') return { ok: false, error: 'HQ_ONLY' };
    if (action === 'purgeTargets') return { ok: true, purge: listPurgeTargets() };   // 削除される予定を返すだけ（削除しない）
    if (action === 'storage') return { ok: true, storage: storageReport() };          // 使用量・増加ペース
    if (action === 'validate') return { ok: true, validate: validateBackendConfiguration() };   // 構成の点検（変更しません）
    if (action === 'triggers') return { ok: true, triggers: listTriggers() };
    if (action === 'setupTrigger') return { ok: true, setup: ensureDailyPurgeTrigger() };   // 毎日の自動削除を有効化（重複は作らない）
    return { ok: false, error: 'UNKNOWN_ACTION' };
  }
  var sh = getSheet();
  var lastRow = sh.getLastRow();
  var store = p ? p.store : '';
  var out = [];
  var readIds = {};   // 今回読んだ窓の id（数字台帳から重ねて返さないため）
  if (lastRow >= 2) {
    var startRow = Math.max(2, lastRow - READ_TAIL + 1);
    var numRows = lastRow - startRow + 1;
    var values = sh.getRange(startRow, 1, numRows, HEADERS.length).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      var r = values[i];
      if (!r[0]) continue;
      readIds[String(r[0])] = 1;
      if (store && store !== 'all' && r[3] !== store) continue;
      if (u && typeof auth_row_ok_ === 'function' && !auth_row_ok_(u, String(r[2] || ''), String(r[3] || ''), String(r[4] || ''))) continue; // ★自店の分だけ返す（hqackはitem内の店舗名で判定）
      var photos = parsePhotos(r[7]);
      /* ★お金の写真はIDに「p:」を付けて返す＝アプリはリンクでなくログイン経由（action:'photo'）で取りにくる */
      if (isPrivatePhotoRow_(r[2], r[4])) photos = photos.map(function (x) { return /^[a-zA-Z0-9_-]{10,}$/.test(String(x || '')) ? 'p:' + x : x; });
      out.push({
        id: r[0], t: Number(r[1]) || 0, kind: r[2], store: r[3],
        item: r[4], level: r[5], note: r[6], photos: photos
      });
      if (out.length >= RETURN_MAX) break;
    }
  }
  /* ★2026-10-24 数字台帳（数字台帳.gs）＝窓に無い数字の行（前月より前・窓から押し出された分）を台帳から足す。
     同じ門番（店で絞る・本部だけの種類）を通す。台帳が無い・読めないときは従来どおり reports だけ */
  var fromLedger = 0;
  if (typeof 数字_履歴_ === 'function') {
    try { var hist = 数字_履歴_(u, store, readIds); fromLedger = hist.length; if (hist.length) out = out.concat(hist); } catch (le) {}
  }
  return { ok: true, reports: out, fromLedger: fromLedger };
}

function photoAction_(p, u) {
  try {
    var id = String((p && p.id) || '').replace(/^p:/, '');
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return { ok: false, error: 'NOT_PHOTO' };
    var pf = DriveApp.getFileById(id);
    var inPhoto = false; var parents = pf.getParents(); var photoFolderId = getPhotoFolder().getId();
    while (parents.hasNext()) { if (parents.next().getId() === photoFolderId) inPhoto = true; }
    if (!inPhoto) return { ok: false, error: 'NOT_PHOTO' };
    if (u && u.role !== 'hq') {
      var ds = ''; try { ds = String(JSON.parse(pf.getDescription() || '{}').store || ''); } catch (e) {}
      if (!ds || u.stores.indexOf(ds) === -1) return { ok: false, error: 'NOT_YOURS' };   // 店舗名の控えが無い古い写真は店舗には返さない
    }
    var pb = pf.getBlob();
    return { ok: true, mime: pb.getContentType(), data: Utilities.base64Encode(pb.getBytes()) };
  } catch (perr) { return serverError_(perr); }
}

/* 直近の行に「同じ提出」があれば、その行のidを返す（無ければ空文字）。
   直近600行だけ見る＝1回の追加が遅くならないように（提出は新しい行に足されるため、
   送り直しは必ず直近に見つかる）。t（提出時刻）はミリ秒なので、別々の提出が偶然そろうことはない。 */
function findSameReport_(sh, data) {
  try {
    var t = Number(data.t) || 0;
    if (!t) return '';
    var last = sh.getLastRow();
    if (last < 2) return '';
    var start = Math.max(2, last - 600 + 1);
    var vals = sh.getRange(start, 1, last - start + 1, 5).getValues(); // id, ts, kind, store, item
    var kind = String(data.kind || ''), store = String(data.store || ''), item = String(data.item || '');
    for (var i = vals.length - 1; i >= 0; i--) {
      if (Number(vals[i][1]) === t && String(vals[i][2]) === kind
          && String(vals[i][3]) === store && String(vals[i][4]) === item) return String(vals[i][0]);
    }
  } catch (err) {}
  return '';
}

// 報告を1件追加。写真はDriveへ保存しIDをシートに記録。
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    /* ★USENレジの表を受け取る入口（USEN取込.gs・合言葉つき・2026-09-30）。貼っていないプロジェクトでも壊れない */
    if (typeof usen_api_ === 'function') { var ur = usen_api_(data); if (ur) return json(ur); }
    /* ★ログインなどの認証API（2026-08-25 追加）。該当しなければ null が返り、通常の提出処理へ進む */
    if (typeof auth_api_ === 'function') {
      var ar = auth_api_(data);
      if (ar) return json(ar);
    }
    /* ★2026-10-12 読みもPOSTで受ける（トークンをURLに載せない＝ログやキャッシュに残さない）。doGet と同じ門番・同じ中身 */
    if (data && (data.action === 'list' || data.action === 'photo')) {
      var g2 = (typeof auth_gate_get_ === 'function') ? auth_gate_get_({ parameter: { token: data.token } }) : { ok: true, u: null };
      if (!g2.ok) return json({ ok: false, error: 'AUTH_REQUIRED', needLogin: true });
      return json(apiRead_({ action: data.action === 'list' ? '' : 'photo', id: data.id, store: data.store }, g2.u));
    }
    /* ★書き込みの門番。ENABLE_AUTH=false のあいだは素通し＝挙動不変 */
    if (typeof auth_gate_post_ === 'function') {
      var gp = auth_gate_post_(data);
      /* ★2026-10-09 needLogin（端末をログイン画面へ戻す合図）は「トークンが無効」のときだけ。
         権限の不足（HQ_ONLY・STORE_NOT_ALLOWED）はログインし直しても変わらないので、合図にしない */
      if (!gp.ok) { var ge = gp.error || 'AUTH_REQUIRED'; return json({ ok: false, error: ge, needLogin: ge === 'AUTH_REQUIRED' }); }
    }
    var sh = getSheet();
    /* ★同じ提出を二重に足さない（2026-09-03 実機で発覚）。
       返事が端末に届かないと端末は「まだ送れていない」と判断して送り直す。
       日計レポートの写真は文字の読み取りを行うぶん返事が遅く、返事だけが失われた結果、
       同じ写真の行が朝のあいだに8行まで増えていた（長堀橋店）。
       種類・店舗・項目・提出時刻が同じ行が直近にあれば、足さずに成功を返す。
       ※写真は送り直しのたびに保存し直されるため、目印には使わない。 */
    var dup = findSameReport_(sh, data);
    if (dup) return json({ ok: true, id: dup, duplicate: true });
    var id = Utilities.getUuid();
    var ts = data.t || Date.now();
    /* ★SVチェックの写真＝「写真を最後に変えた端末」の分を正にする（2026-10-27 長堀橋で2台同時入力＝○×を押した端末の保存が後勝ちで3枚→1枚）。
       note.pt＝写真を変えた時刻。届いた行の pt が、同じ項目の直近の行より古ければ、写真は直近の行のまま足す（届いた写真は保存しない） */
    if (String(data.kind || '') === 'svcheck') { var kp = svcheck_keepPhotos_(sh, data); if (kp) { data.photos = []; data._keepPhotoIds = kp.ids; data.note = kp.note; } }
    var input = Array.isArray(data.photos) ? data.photos.slice(0, 6) : [];
    var photoIds = input.map(function (x) { return savePhoto(x, data); });   // ★お金の写真は公開リンクにしない（2026-10-12）
    if (data._keepPhotoIds) photoIds = data._keepPhotoIds;
    sh.appendRow([id, ts, data.kind || '', data.store || '', data.item || '', data.level || '', normNote(data.note), JSON.stringify(photoIds)]);
    // ★公益通報は本部へメールで知らせる（通報通知.gs・通知先はスクリプト プロパティ WHISTLE_MAIL_TO。未設定なら何もしない・2026-09-24）
    try { if (typeof notifyWhistle_ === 'function' && String(data.kind || '') === 'whistle') notifyWhistle_(data, id); } catch (e) {}
    /* ★日計レポート写真の自動読み取り（日計OCR.gs・長堀橋トライアル 2026-09-01）。
       ファイルを貼っていないプロジェクトでも壊れないよう、関数の有無を見てから呼ぶ。
       読み取りに失敗しても提出は成功のまま（下書きが作られないだけ） */
    if (typeof nikkei_ocr_hook_ === 'function') { try { nikkei_ocr_hook_(data, photoIds); } catch (ocrErr) {} }
    /* ★納品書写真の自動読み取り（納品書OCR.gs・2026-10-01）＝仕入先・8%／10%の税込額を下書きに。失敗しても提出は成功のまま */
    if (typeof nouhin_ocr_hook_ === 'function') { try { nouhin_ocr_hook_(data, photoIds); } catch (ocrErr2) {} }
    return json({ ok: true, id: id });
  } catch (err) {
    return json(serverError_(err));
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
  var keep = samplePhotoIds_();   // ★見本写真は消さない（2026-08-30）
  var files = folder.getFiles();
  var removed = 0, protectedCount = 0;
  while (files.hasNext()) {
    var f = files.next();
    try {
      if (f.getDateCreated() >= cutoff) continue;
      if (keep[f.getId()]) { protectedCount++; continue; } // 見本に指定された写真＝期限を過ぎても残す
      f.setTrashed(true); removed++;
    } catch (_) {}
  }
  Logger.log('purgeOldPhotos: trashed ' + removed + ' file(s) older than ' + ttlDays_() + ' days (protected as sample: ' + protectedCount + ')');
  return { enabled: true, trashed: removed, protectedAsSample: protectedCount, ttlDays: ttlDays_() };
}

/* ★見本写真（kind: phsample）が参照している写真IDの一覧（2026-08-30 追加）。
   見本は店舗の「正しい撮り方」として長く使うため、90日を過ぎても削除しない。
   行は PURGE_KEEP_KINDS で守られるが、Driveの写真本体もここで守らないと
   「見本の枠だけ残って画像が表示されない」事故になる。 */
function samplePhotoIds_() {
  var keep = {};
  try {
    var sh = getSheet();
    var last = sh.getLastRow();
    if (last < 2) return keep;
    var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][2] || '') !== 'phsample') continue;
      var ids = parsePhotos(values[i][7]);
      for (var j = 0; j < ids.length; j++) { if (ids[j]) keep[String(ids[j])] = true; }
    }
  } catch (e) {}
  return keep;
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
  // ★エディタから直接実行してもログで見えるようにする（2026-08-25 移行時、実行しても何も出ず戸惑ったため）
  var out = listPurgeTargets_();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
function listPurgeTargets_() {
  var cutoffMs = Date.now() - ttlDays_() * 24 * 60 * 60 * 1000;
  var cutoff = new Date(cutoffMs);
  // 写真（★見本に指定された写真は削除予定に入れない＝2026-08-30）
  var folder = getPhotoFolder();
  var keep = samplePhotoIds_();
  var files = folder.getFiles();
  var photoTargets = [], photoTotal = 0, photoProtected = 0;
  while (files.hasNext()) {
    var f = files.next(); photoTotal++;
    var created = f.getDateCreated();
    if (created < cutoff) {
      if (keep[f.getId()]) { photoProtected++; continue; }
      photoTargets.push({ id: f.getId(), name: f.getName(), created: created.toISOString() });
    }
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
    photos: { total: photoTotal, wouldTrash: photoTargets.length, protectedAsSample: photoProtected, sample: photoTargets.slice(0, 20) },
    rows: { total: rowTotal, wouldDelete: rowTargets, keptAsConfig: keepCount, byKind: byKind }
  };
}

function normNote(n) { if (n && typeof n === 'object') return n.ja || ''; return n || ''; }
function parsePhotos(s) { try { return s ? JSON.parse(s) : []; } catch (_) { return []; } }
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ★2026-10-23 原さん（寿司世桜 心斎橋店）「名前の漢字を 原 和宏 に」＝提出の記録に残っている提出者名を直す
   ・reports の note（JSONの文字列）に入っている「原 和弘」を「原 和宏」に置き換える（それ以外の文字は触らない）
   ・集約スプシ（世桜アプリ_集約データ）は毎朝6時の aggRebuild が reports から作り直すので、reports を直せば翌朝そろう
   ・_users の名前は別途直した（認証_名前を変更 でも可）
   使い方＝ 提出者名を訂正('原 和弘', '原 和宏')  → 実行ログに何行直したかが出る。下見は 提出者名を訂正_下見('原 和弘')
   貼る場所＝「世桜アプリ_本部データ」の Apps Script にこのファイルを足す。デプロイは不要（エディタから実行するだけ） */
function 提出者名を訂正_下見(before) {
  return 提出者名を訂正_(before, null, false);
}
function 提出者名を訂正(before, after) {
  return 提出者名を訂正_(before, after, true);
}
function 提出者名を訂正_(before, after, write) {
  before = String(before || ''); after = String(after || '');
  if (!before) throw new Error('直す前の名前を入れてください');
  if (write && !after) throw new Error('直した後の名前を入れてください');
  var sh = getSheet();
  var last = sh.getLastRow(); if (last < 2) return { 行: 0 };
  var noteCol = HEADERS.indexOf('note') + 1;
  var vals = sh.getRange(2, noteCol, last - 1, 1).getValues();
  var hit = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] == null ? '' : vals[i][0]);
    if (v.indexOf(before) !== -1) hit.push({ row: i + 2, kind: String(sh.getRange(i + 2, HEADERS.indexOf('kind') + 1).getValue()), v: v });
  }
  if (write) {
    hit.forEach(function (h) { sh.getRange(h.row, noteCol).setValue(h.v.split(before).join(after)); });
  }
  var out = { 書き込み: write ? '実行した' : '下見のみ', 直す前: before, 直した後: after, 行: hit.length, 行番号: hit.map(function (h) { return h.row + '(' + h.kind + ')'; }) };
  Logger.log(JSON.stringify(out)); return out;
}
/* エディタの「実行」は引数を渡せないので、原さんの分は名前入りの入口を用意（下見→本番の順に実行） */
function 提出者名を訂正_原さん_下見() { return 提出者名を訂正_('原 和弘', '原 和宏', false); }
function 提出者名を訂正_原さん() { return 提出者名を訂正_('原 和弘', '原 和宏', true); }

/* ★2026-10-26 日本鰻世桜 富士山店の Airレジ を同じ入口（usen_import）で取り込む＝店舗コード102。設定値 USEN_STORE_MAP に足す（1回だけ実行・デプロイ不要・airregi_import.py） */
function USEN店舗表に鰻富士山を足す() {
  var m = JSON.parse(JSON.stringify(usen_storeMap_()));
  m['102'] = '日本鰻世桜 富士山店';
  PropertiesService.getScriptProperties().setProperty('USEN_STORE_MAP', JSON.stringify(m));
  Logger.log('USEN_STORE_MAP = ' + JSON.stringify(usen_storeMap_()));
  return usen_storeMap_();
}

/* ★SVチェック（kind=svcheck）＝同じ項目（店舗|日付|No）の直近の行を直近600行から探し、写真を変えた時刻（note.pt）を比べる。
   直近の行のほうが新しければ { ids: その行の写真ID, note: pt と nph を直近の行に合わせた note } を返す。それ以外は null（届いた行のまま） */
function svcheck_keepPhotos_(sh, data) {
  try {
    var item = String(data.item || ''); if (!item) return null;
    var inNote = {}; try { inNote = JSON.parse(data.note || '{}') || {}; } catch (e) { inNote = {}; }
    var inPt = Number(inNote.pt) || 0;
    var last = sh.getLastRow(); if (last < 2) return null;
    var start = Math.max(2, last - 600 + 1);
    var vals = sh.getRange(start, 1, last - start + 1, 8).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][2]) !== 'svcheck' || String(vals[i][4]) !== item) continue;
      var n = {}; try { n = JSON.parse(vals[i][6] || '{}') || {}; } catch (e) { n = {}; }
      var pt = Number(n.pt) || Number(vals[i][1]) || 0;   // pt の無い古い行は、行の時刻
      if (pt <= inPt) return null;
      var ids = []; try { ids = JSON.parse(vals[i][7] || '[]') || []; } catch (e) { ids = []; }
      inNote.pt = pt; inNote.nph = ids.length;
      return { ids: ids, note: JSON.stringify(inNote) };
    }
  } catch (err) {}
  return null;
}
