/**
 * 世桜アプリ サーベイ取り込み（Google Apps Script／Code.gs への追加ファイル）
 *
 * 目的：各店のサーベイ転記スプレッドシートを定期的に読み込み、アプリの共有バックエンド
 *       （reports シート）へ survey 行として取り込む＝「ライブ連携」。
 *       これまでは手作業のスナップショットだったため、元シートが更新されても反映されなかった。
 *
 * 特徴
 *  ・Code.gs は変更しない（getSheet / getSetting_ / HEADERS を利用するだけ）
 *  ・スプレッドシートのIDはコードに書かない。Script Properties の SURVEY_SOURCES で管理する
 *  ・何度実行しても二重登録しない（店舗＋回答時刻で判定）
 *  ・列の位置は決め打ちせず、見出しの文字で探す（店舗ごとに列順が違っても動く）
 *  ・テスト投稿は国名に TEST_ を付けて取り込む＝アプリ側の集計から自動で外れる（行は残るので追跡できる）
 *
 * ―― 使い方（順番に） ――
 *  1. 各店のサーベイスプレッドシートを、このGASのアカウントへ「閲覧者」以上で共有する
 *  2. プロジェクトの設定 → スクリプト プロパティに SURVEY_SOURCES を追加（下の例を参照）
 *  3. surveyImportDryRun() を実行 → 「何件入るか」だけ確認（書き込みはしない）
 *  4. 問題なければ importSurveys() を実行 → 取り込み
 *  5. setupSurveyImportTrigger() を実行 → 1時間ごとの自動取り込みを設定
 *
 * ―― SURVEY_SOURCES の例（JSONの配列。1行で貼って構いません）――
 *  [
 *    {"store":"牛カツ世桜 長堀橋店","id":"スプレッドシートのID"},
 *    {"store":"日本料理世桜 心斎橋店","id":"スプレッドシートのID","sheet":"フォームの回答 1"}
 *  ]
 *  ・store ＝ アプリの店舗名と完全に一致させる（ここがずれると別店舗として集計される）
 *  ・id    ＝ スプレッドシートURLの /d/ と /edit の間の文字列
 *  ・sheet ＝ 省略可。省略すると1枚目のシートを読む
 */

var SURVEY_KIND = 'survey';
var SURVEY_READ_TAIL = 5000;   // 重複判定のために遡って読む行数（reports シート側）
var SURVEY_HEADER_SCAN = 6;    // 見出し行を探す範囲（上から何行目まで見るか）

/* 見出しの文字から列を探す。店舗ごとに列順・言語が違っても動くようにする。 */
var SURVEY_COL_PATTERNS = {
  ts:      [/タイムスタンプ/, /timestamp/i, /日時/, /送信日/],
  country: [/国名/, /^国$/, /country/i, /국가/, /國家/],
  rating:  [/評価/, /満足/, /rating/i, /score/i, /평가/, /評分/],
  route:   [/きっかけ/, /経路/, /route/i, /どこで/, /계기/, /契機/],
  comment: [/フィードバック/, /ご意見/, /コメント/, /feedback/i, /comment/i, /피드백/]
};

/* ---------- 設定の読み取り ---------- */
function surveySources_() {
  var raw = getSetting_('SURVEY_SOURCES', '');
  if (!raw) return [];
  try {
    var a = (typeof raw === 'string') ? JSON.parse(raw) : raw;
    if (!Array.isArray(a)) throw new Error('配列ではありません');
    return a.filter(function (x) { return x && x.store && x.id; });
  } catch (e) {
    throw new Error('SURVEY_SOURCES の形式が正しくありません。JSONの配列で入れてください。（' + e + '）');
  }
}

/* ---------- すでに取り込んだ回答を把握する（二重登録の防止）----------
   「店舗＋回答時刻」で判定する。元シートの1行が、必ず同じキーになるため。 */
function seenSurveyKeys_(sh) {
  var seen = {};
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return seen;
  var startRow = Math.max(2, lastRow - SURVEY_READ_TAIL + 1);
  var values = sh.getRange(startRow, 1, lastRow - startRow + 1, HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][2] !== SURVEY_KIND) continue;
    seen[String(values[i][3]) + '||' + Number(values[i][1] || 0)] = true;
  }
  return seen;
}

/* ---------- 見出し行と列位置を探す ---------- */
function findSurveyCols_(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var scan = Math.min(SURVEY_HEADER_SCAN, Math.max(1, sheet.getLastRow()));
  var head = sheet.getRange(1, 1, scan, lastCol).getValues();
  for (var r = 0; r < head.length; r++) {
    var idx = {}, hit = 0;
    Object.keys(SURVEY_COL_PATTERNS).forEach(function (key) {
      idx[key] = -1;
      for (var c = 0; c < head[r].length; c++) {
        var h = String(head[r][c] || '').trim();
        if (!h) continue;
        var match = SURVEY_COL_PATTERNS[key].some(function (re) { return re.test(h); });
        if (match) { idx[key] = c; hit++; break; }
      }
    });
    // タイムスタンプと評価が見つかった行を見出し行とみなす（この2つが無いと取り込めない）
    if (idx.ts >= 0 && idx.rating >= 0) { idx._headerRow = r + 1; idx._hit = hit; return idx; }
  }
  return null;
}

/* ---------- テスト投稿の判定 ----------
   本番の回答に紛れたテストを、集計から外すため。行は消さずに国名へ TEST_ を付ける。 */
function isTestSurveyRow_(comment) {
  return /テスト|ﾃｽﾄ|\btest\b/i.test(String(comment || ''));
}

/* ---------- 1店舗ぶんを読む ---------- */
function readSurveySource_(src) {
  var out = { store: src.store, rows: [], note: '' };
  var ss;
  try { ss = SpreadsheetApp.openById(String(src.id)); }
  catch (e) {
    out.note = 'シートを開けません（共有されていない可能性があります）';
    return out;
  }
  var sheet = src.sheet ? ss.getSheetByName(String(src.sheet)) : ss.getSheets()[0];
  if (!sheet) { out.note = 'シート「' + src.sheet + '」が見つかりません'; return out; }

  var cols = findSurveyCols_(sheet);
  if (!cols) { out.note = '見出し（タイムスタンプ・評価）が見つかりません'; return out; }

  var lastRow = sheet.getLastRow();
  if (lastRow <= cols._headerRow) { out.note = '回答がまだありません'; return out; }

  var lastCol = Math.max(1, sheet.getLastColumn());
  var values = sheet.getRange(cols._headerRow + 1, 1, lastRow - cols._headerRow, lastCol).getValues();

  values.forEach(function (row) {
    var rawTs = row[cols.ts];
    var t = (rawTs instanceof Date) ? rawTs.getTime() : Date.parse(String(rawTs || ''));
    if (!t || isNaN(t)) return;                       // 日付として読めない行は飛ばす（集計欄など）
    var rating = Number(row[cols.rating]);
    if (!rating || isNaN(rating)) return;             // 評価が無い行は回答ではない
    var country = cols.country >= 0 ? String(row[cols.country] || '').trim() : '';
    var route   = cols.route   >= 0 ? String(row[cols.route]   || '').trim() : '';
    var comment = cols.comment >= 0 ? String(row[cols.comment] || '').trim() : '';
    var isTest  = isTestSurveyRow_(comment);
    out.rows.push({
      t: t, rating: rating, route: route, comment: comment,
      country: isTest ? ('TEST_' + (country || 'unknown')) : country,
      isTest: isTest
    });
  });
  return out;
}

/* ---------- 本体：取り込み ----------
   dryRun = true のときは書き込まず、件数だけ返す。 */
function importSurveys(dryRun) {
  var srcs;
  try { srcs = surveySources_(); }
  catch (e) { return logSurvey_({ ok: false, error: String(e.message || e) }); }
  if (!srcs.length) {
    return logSurvey_({ ok: false, error: 'SURVEY_SOURCES が未設定です。スクリプト プロパティに追加してください。' });
  }

  var sh = getSheet();
  var seen = seenSurveyKeys_(sh);
  var toAdd = [], detail = [];

  srcs.forEach(function (src) {
    var r = readSurveySource_(src);
    var added = 0, dup = 0, test = 0;
    r.rows.forEach(function (row) {
      var key = src.store + '||' + row.t;
      if (seen[key]) { dup++; return; }
      seen[key] = true;                                // 同じ実行内での重複も防ぐ
      if (row.isTest) test++;
      toAdd.push([
        Utilities.getUuid(), row.t, SURVEY_KIND, src.store,
        row.route, row.rating,
        JSON.stringify({ c: row.country, f: row.comment }),
        '[]'
      ]);
      added++;
    });
    detail.push({
      店舗: src.store, 読み込み: r.rows.length, 新規: added,
      取り込み済み: dup, テスト扱い: test, 備考: r.note || ''
    });
  });

  if (!dryRun && toAdd.length) {
    // 時刻順に並べてから追記する（あとから見たときに追いやすい）
    toAdd.sort(function (a, b) { return a[1] - b[1]; });
    sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, HEADERS.length).setValues(toAdd);
  }

  return logSurvey_({
    ok: true,
    実行: dryRun ? '確認のみ（書き込みなし）' : '取り込み',
    追加件数: toAdd.length,
    店舗別: detail,
    実行日時: new Date().toLocaleString('ja-JP')
  });
}

/* 取り込まずに件数だけ確認する（安全。まずこれを実行してください） */
function surveyImportDryRun() { return importSurveys(true); }

/* ---------- 自動取り込みのトリガー（1時間ごと）---------- */
function setupSurveyImportTrigger() {
  var exists = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'importSurveys';
  });
  if (exists.length) {
    return logSurvey_({ ok: true, 結果: '既に設定済み', 件数: exists.length });
  }
  ScriptApp.newTrigger('importSurveys').timeBased().everyHours(1).create();
  return logSurvey_({ ok: true, 結果: '設定しました', 内容: '1時間ごとに importSurveys を実行' });
}

/* 自動取り込みを止める（設定はそのまま残ります） */
function removeSurveyImportTrigger() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'importSurveys') { ScriptApp.deleteTrigger(t); n++; }
  });
  return logSurvey_({ ok: true, 結果: '解除しました', 件数: n });
}

/* ---------- 設定の点検（変更しません）----------
   どのシートが開けて、どの列が見つかり、何件あるかを一覧で返す。 */
function validateSurveySources() {
  var srcs;
  try { srcs = surveySources_(); }
  catch (e) { return logSurvey_({ ok: false, error: String(e.message || e) }); }
  if (!srcs.length) return logSurvey_({ ok: false, error: 'SURVEY_SOURCES が未設定です' });

  var out = srcs.map(function (src) {
    var row = { 店舗: src.store, 開ける: false, 見出し: '', 回答数: 0, 備考: '' };
    var ss;
    try { ss = SpreadsheetApp.openById(String(src.id)); row.開ける = true; }
    catch (e) { row.備考 = '開けません（このアカウントへ共有されていない可能性があります）'; return row; }
    var sheet = src.sheet ? ss.getSheetByName(String(src.sheet)) : ss.getSheets()[0];
    if (!sheet) { row.備考 = 'シートが見つかりません'; return row; }
    row.シート名 = sheet.getName();
    var cols = findSurveyCols_(sheet);
    if (!cols) { row.備考 = '見出し（タイムスタンプ・評価）が見つかりません'; return row; }
    row.見出し = '行' + cols._headerRow
      + '／タイムスタンプ=' + (cols.ts + 1)
      + '・評価=' + (cols.rating + 1)
      + '・国名=' + (cols.country >= 0 ? (cols.country + 1) : 'なし')
      + '・きっかけ=' + (cols.route >= 0 ? (cols.route + 1) : 'なし')
      + '・感想=' + (cols.comment >= 0 ? (cols.comment + 1) : 'なし');
    row.回答数 = readSurveySource_(src).rows.length;
    return row;
  });
  return logSurvey_({ ok: true, 点検結果: out });
}

/* 実行結果をログに出しつつ、そのまま返す（GASエディタの実行ログで読めるように） */
function logSurvey_(o) {
  try { Logger.log(JSON.stringify(o, null, 2)); } catch (e) { Logger.log(String(o)); }
  return o;
}
