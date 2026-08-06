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

/* ---------- 日時の解釈 ----------
   シートに「2026/08/05 15:47:18」と表示されていれば、それを日本時間の 15:47:18 として扱う。
   ★ getValue() が返す Date は、元シート側のタイムゾーン設定に影響される
     （元シートが GMT+7 だと、同じ表示でも2時間ずれた時刻として読まれる）。
     そのため「画面に表示されている文字列」を優先して解釈する。 */
function parseSheetDateTime_(disp, raw) {
  var s = String(disp || '').trim();
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
                    Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  }
  if (raw instanceof Date) return raw.getTime();          // 表示が読めないときだけ元の値を使う
  var p = Date.parse(s);
  return isNaN(p) ? 0 : p;
}

/* ---------- タイムゾーンの点検（変更しません）----------
   取り込んだ時刻がずれる場合に、どこでずれているかを確かめる。 */
function checkSurveyTimeZone() {
  var srcs;
  try { srcs = surveySources_(); } catch (e) { return logSurvey_({ ok: false, error: String(e.message || e) }); }
  var out = srcs.map(function (src) {
    var row = { 店舗: src.store };
    var ss;
    try { ss = SpreadsheetApp.openById(String(src.id)); } catch (e) { row.備考 = '開けません'; return row; }
    row.シートのタイムゾーン = ss.getSpreadsheetTimeZone();
    var sheet = src.sheet ? ss.getSheetByName(String(src.sheet)) : ss.getSheets()[0];
    if (!sheet) { row.備考 = 'シートなし'; return row; }
    var cols = findSurveyCols_(sheet);
    if (!cols) { row.備考 = '見出しなし'; return row; }
    if (sheet.getLastRow() <= cols._headerRow) { row.備考 = '回答なし'; return row; }
    var r = cols._headerRow + 1;
    var cell = sheet.getRange(r, cols.ts + 1);
    var raw = cell.getValue();
    row.画面に表示されている値 = cell.getDisplayValue();
    row.読み取った値 = (raw instanceof Date) ? Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss') : String(raw);
    row.型 = (raw instanceof Date) ? 'Date' : typeof raw;
    row.取り込む時刻 = Utilities.formatDate(new Date(parseSheetDateTime_(row.画面に表示されている値, raw)), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
    return row;
  });
  return logSurvey_({
    ok: true,
    スクリプトのタイムゾーン: Session.getScriptTimeZone(),
    各シート: out,
    見方: '「画面に表示されている値」と「取り込む時刻」が一致していれば正しく取り込めます。「読み取った値」だけずれている場合は、元シート側のタイムゾーンが原因です。'
  });
}

/* ---------- テスト投稿の判定 ----------
   本番の回答に紛れたテストを、集計から外すため。行は消さずに国名へ TEST_ を付ける。
   ★感想欄だけでなく「来店きっかけ」も見る。
     実際に、感想は普通なのにきっかけが「その他（テスト）」という回答があったため。 */
function isTestSurveyRow_(comment, route) {
  return /テスト|ﾃｽﾄ|\btest\b/i.test(String(comment || '') + ' ' + String(route || ''));
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
  var range = sheet.getRange(cols._headerRow + 1, 1, lastRow - cols._headerRow, lastCol);
  var values = range.getValues();
  var disps  = range.getDisplayValues();   // 画面に表示されている文字列（タイムゾーンの影響を受けない）

  values.forEach(function (row, ri) {
    // 時刻は「シートに表示されているまま」を採用する（元シート側のTZ設定でずれないように）
    var t = parseSheetDateTime_(disps[ri][cols.ts], row[cols.ts]);
    if (!t || isNaN(t)) return;                       // 日付として読めない行は飛ばす（集計欄など）
    var rating = Number(row[cols.rating]);
    if (!rating || isNaN(rating)) return;             // 評価が無い行は回答ではない
    var country = cols.country >= 0 ? String(row[cols.country] || '').trim() : '';
    var route   = cols.route   >= 0 ? String(row[cols.route]   || '').trim() : '';
    var comment = cols.comment >= 0 ? String(row[cols.comment] || '').trim() : '';
    var isTest  = isTestSurveyRow_(comment, route);
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

/* ================================================================
   重複の調査と掃除
   （2026-08-05に手作業で取り込んだぶんと、今回の自動取り込みが
     二重に入ってしまった場合に使う。まず調べてから消す。）
   ================================================================ */

/* ---------- ① 調べる（何も変更しません）----------
   survey 行がどう入っているかを一覧で返す。
   ・同じ回答が2回入っているか
   ・入っているとしたら、どの行に固まっているか
   を確認してから、②で消す。 */
function surveyRowsReport() {
  var sh = getSheet();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return logSurvey_({ ok: true, 件数: 0 });
  var values = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][2] !== SURVEY_KIND) continue;
    rows.push({ row: i + 2, ts: Number(values[i][1]) || 0, store: String(values[i][3] || ''), item: String(values[i][4] || ''), note: String(values[i][6] || '') });
  }
  if (!rows.length) return logSurvey_({ ok: true, 件数: 0, 備考: 'survey の行がありません' });

  // 店舗別の件数
  var byStore = {};
  rows.forEach(function (r) { byStore[r.store] = (byStore[r.store] || 0) + 1; });

  // 同じ「店舗＋回答時刻」が複数あるか＝きれいに重複しているか
  var keyCount = {};
  rows.forEach(function (r) { var k = r.store + '||' + r.ts; keyCount[k] = (keyCount[k] || 0) + 1; });
  var dupByTs = Object.keys(keyCount).filter(function (k) { return keyCount[k] > 1; }).length;

  // 同じ「店舗＋本文」が複数あるか＝回答時刻がずれていても中身で重複していないか
  var noteCount = {};
  rows.forEach(function (r) { if (!r.note) return; var k = r.store + '||' + r.note; noteCount[k] = (noteCount[k] || 0) + 1; });
  var dupByNote = Object.keys(noteCount).filter(function (k) { return noteCount[k] > 1; }).length;

  // 連続したかたまり（行番号が飛ぶところで区切る）＝いつ取り込まれた集まりかが分かる
  var blocks = [];
  var cur = null;
  rows.forEach(function (r) {
    if (cur && r.row === cur.終わり + 1) { cur.終わり = r.row; cur.件数++; return; }
    if (cur) blocks.push(cur);
    cur = { 始まり: r.row, 終わり: r.row, 件数: 1 };
  });
  if (cur) blocks.push(cur);

  var sample = rows.slice(0, 3).concat(rows.slice(-3)).map(function (r) {
    return { 行: r.row, 回答時刻: new Date(r.ts).toLocaleString('ja-JP'), 店舗: r.store, きっかけ: r.item, 本文: r.note.slice(0, 40) };
  });

  return logSurvey_({
    ok: true,
    survey行の総数: rows.length,
    店舗別: byStore,
    同じ店舗と回答時刻が重複: dupByTs + '件',
    同じ店舗と本文が重複: dupByNote + '件',
    連続したかたまり: blocks,
    サンプル: sample,
    次の手順: '「連続したかたまり」を見て、古い方のかたまり（先に入ったぶん）の行範囲を deleteSurveyRows(始まり, 終わり) に渡してください。'
  });
}

/* ---------- ② 消す（行範囲を指定して削除）----------
   使い方：GASエディタで下の from / to を書き換えてから runDeleteSurveyRows を実行する。
   ・survey 以外の行が含まれていたら、安全のため何も削除せず中止します
   ・削除の前に、消す対象の件数と中身をログに出します */
function deleteSurveyRows(from, to) {
  if (!from || !to || to < from) return logSurvey_({ ok: false, error: '行範囲が正しくありません（from, to を指定してください）' });
  var sh = getSheet();
  var n = to - from + 1;
  var values = sh.getRange(from, 1, n, HEADERS.length).getValues();

  // 安全確認：指定範囲がすべて survey 行であること
  var notSurvey = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][2] !== SURVEY_KIND) notSurvey.push({ 行: from + i, kind: values[i][2], 店舗: values[i][3] });
  }
  if (notSurvey.length) {
    return logSurvey_({
      ok: false,
      error: '指定範囲に survey 以外の行が含まれているため、何も削除していません',
      該当: notSurvey.slice(0, 10)
    });
  }

  sh.deleteRows(from, n);
  return logSurvey_({ ok: true, 削除しました: n + '行', 範囲: from + '〜' + to, 備考: 'アプリを再読み込みすると件数が減ります' });
}

/* ↓ ここを書き換えてから実行する（surveyRowsReport の結果を見て決める） */
function runDeleteSurveyRows() {
  var from = 0;   // ← 消したいかたまりの「始まり」
  var to   = 0;   // ← 消したいかたまりの「終わり」
  if (!from || !to) return logSurvey_({ ok: false, error: 'from と to を書き換えてから実行してください（surveyRowsReport の結果を参照）' });
  return deleteSurveyRows(from, to);
}

/* ================================================================
   2026-08-07 の掃除用（この3つは今回限り。片付いたら消して構いません）
   ★必ず この順番（下の行から先）に実行すること。
     先に小さい行を消すと、あとの行番号がずれます。
   ================================================================ */
function 掃除1_今日の取り込み分を消す()   { return deleteSurveyRows(334, 389); } // 時刻がずれて入ったぶん
function 掃除2_8月5日の手動取り込みを消す() { return deleteSurveyRows(11, 64); }  // 二重になっていたぶん
function 掃除3_接続テストの行を消す()     { return deleteSurveyRows(7, 7); }    // TEST_KOREA の1行

/* ---------- テスト投稿の取りこぼしを直す ----------
   感想欄は普通なのに「来店きっかけ」が“その他（テスト）”という回答が、
   テスト扱いにならず集計へ混ざっていた。該当行を消してから importSurveys を
   実行すると、正しく TEST_ 付きで入り直す（アプリの集計から自動で外れる）。
   ※ この関数は「消すだけ」。続けて importSurveys を実行してください。 */
function 掃除4_テスト投稿の取りこぼしを消す() {
  var sh = getSheet();
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return logSurvey_({ ok: true, 削除: 0 });
  var values = sh.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();

  var targets = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][2] !== SURVEY_KIND) continue;
    var item = String(values[i][4] || '');
    var note = String(values[i][6] || '');
    var country = '';
    try { country = String((JSON.parse(note) || {}).c || ''); } catch (e) {}
    // すでに TEST_ が付いているものは対象外。きっかけ／本文にテストの語があるものだけ
    if (/^TEST_/.test(country)) continue;
    if (!/テスト|ﾃｽﾄ|\btest\b/i.test(item + ' ' + note)) continue;
    targets.push({ 行: i + 2, 店舗: values[i][3], きっかけ: item });
  }
  if (!targets.length) return logSurvey_({ ok: true, 削除: 0, 備考: '取りこぼしはありませんでした' });

  // 下の行から消す（行番号がずれないように）
  targets.slice().reverse().forEach(function (t) { sh.deleteRows(t.行, 1); });
  return logSurvey_({
    ok: true, 削除: targets.length + '行', 対象: targets,
    次の手順: '続けて importSurveys を実行してください。TEST_ 付きで入り直し、集計から外れます。'
  });
}

/* 実行結果をログに出しつつ、そのまま返す（GASエディタの実行ログで読めるように） */
function logSurvey_(o) {
  try { Logger.log(JSON.stringify(o, null, 2)); } catch (e) { Logger.log(String(o)); }
  return o;
}
