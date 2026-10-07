/**
 * 世桜アプリ｜USENレジの数字を総括表へ書き戻す（集約データ → 各店の総括表）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る（USEN取込.gs・総括表取り込み.gs と同じ作法）。
 *
 * ■ なにをするか（2026-10-07 作成＝神田さん「総括表に、こちらからデータを送り直す仕組みを」・増田さん了承の3点）
 *   USENレジから取り込んだ日ごとの数字（src:'usen' の soukatsu 行）を、各店の総括表の【日別タブ（1〜31）】の
 *   入力セルへ書く。売上台帳・総括表はその日別タブを参照する式なので、書けば自動で反映される。
 *   書く項目＝現金売上・カード売上・電子マネー売上・純売上（税抜）・客数・値引き（USENで取れるものだけ）
 *
 * ■ 決めごと（増田さんと合意 2026-10-07）
 *   ・書くのは「USENで取れる項目」だけ。書く店は SKWB_STORES に入れた店だけ（まず長堀橋で試す）
 *   ・書いてよいのは「空欄」か「前回こちらが書いた値のまま」のセルだけ
 *   ・店の方が違う数字を打ち込んでいたら、上書きしない＝「ずれ」として記録する（黙って消さない）
 *   ・式が入っているセルには書かない
 *   ・セルの位置は決め打ちしない。日別タブのラベル（「現金売上」「客数」など）の文字で探す
 *   ・書いた記録は、このバックエンドの「_総括表書き戻し」シートに1セル1行で残す（前回こちらが書いた値の判定にも使う）
 *   ・★ずれたセルには「メモ」を付ける（2026-10-07 神田さん＝A案）。右上の小さな三角＝乗せると「USENレジでは○○」。
 *     値も書式も変えない・通知も飛ばない（コメントは使わない）。ずれが解消したら、こちらが付けたメモ（【USEN照合】で始まるもの）だけ消す。
 *     本部はアプリの「数字の要確認」（総括表とPOSが違う）で全店の一覧を見る＝C案（アプリ側で計算・GASは関わらない）
 *
 * ■ 設定（Script Properties）
 *   SKWB_STORES  ＝ 書き戻す店（JSONの配列）。無ければ ["牛カツ世桜 長堀橋店"]
 *   SKWB_ENABLED ＝ true にすると「USEN更新」の取り込みのあとに自動で書き戻す。既定は false（手で動かす）
 *   SKWB_DAYS    ＝ 自動のときに遡る日数（既定 7）
 *   総括表の場所は、総括表取り込み.gs と同じ SOUKATSU_SOURCES（店舗→フォルダ）を使う
 *
 * ■ 使い方（順番に）
 *   1. 総括表書き戻し_下見() … どのセルに何を書くかの一覧だけ（書き込みなし）
 *   2. 総括表に書き戻す()     … 書き込み実行
 *   3. うまくいったら SKWB_ENABLED=true（毎朝の「USEN更新」のあとに自動）
 *   ※ Claude Code からは POST {kind:'skwb', key:USEN_POST_KEY, write:false|true, days:N} でも動かせる
 */

var SKWB_LOG_SHEET = '_総括表書き戻し';
/* USEN の項目 → 日別タブのラベル（完全一致・空白と改行は無視） */
var SKWB_ITEMS = [
  ['cash',   '現金売上'],
  ['card',   'カード売上'],
  ['emoney', '電子マネー売上'],
  ['net',    '純売上（税抜）'],
  ['guests', '客数'],
  ['disc',   '値引き']
];
var SKWB_NOTE_TAG = '【USEN照合】';   // こちらが付けたメモの印。これで始まらないメモ（店や増田さんのメモ）には触らない
var SKWB_VALUE_OFFSET = 5;   // ラベルの5列右が当日の値（G14←B14／W13←R13）。違う形の総括表は「位置が違う」で止まる

function skwb_stores_() {
  var raw = getSetting_('SKWB_STORES', '');
  if (!raw) return ['牛カツ世桜 長堀橋店'];
  try { var a = JSON.parse(raw); return a.length ? a : ['牛カツ世桜 長堀橋店']; } catch (e) { return ['牛カツ世桜 長堀橋店']; }
}
function skwb_num_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/[,，\s円¥￥]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
function skwb_a1_(r, c) {   // 0始まり → A1
  var s = '', n = c + 1;
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s + (r + 1);
}

/* 本部データから、店×日付ごとの「最新の USEN 行」 */
function skwb_usen_(stores, fromDate) {
  var sh = getSheet(); var last = sh.getLastRow(); var map = {};
  if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][2]) !== 'soukatsu') continue;
    var store = String(vals[i][3]); if (stores.indexOf(store) === -1) continue;
    var p; try { p = JSON.parse(vals[i][6] || '{}'); } catch (e) { continue; }
    if (p.src !== 'usen' || !p.date || p.date < fromDate) continue;
    var t = Number(vals[i][1]) || 0; var k = store + '|' + p.date;
    if (!map[k] || t >= map[k].t) map[k] = { t: t, store: store, date: p.date, p: p };
  }
  return map;
}

/* 「前回こちらが書いた値」＝記録シートの最後の書き込み（ファイル×タブ×セルごと） */
function skwb_logSheet_() {
  var ss = getSheet().getParent();
  var sh = ss.getSheetByName(SKWB_LOG_SHEET);
  if (!sh) { sh = ss.insertSheet(SKWB_LOG_SHEET); sh.appendRow(['日時', '店舗', '日付', '項目', 'ファイル', 'タブ', 'セル', '前の値', 'USENの値', '結果']); }
  return sh;
}
function skwb_lastWritten_(sh) {
  var map = {}; var last = sh.getLastRow(); if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, 10).getValues();
  vals.forEach(function (r) { if (r[9] === '書いた' || r[9] === '書き直した') map[r[4] + '|' + r[5] + '|' + r[6]] = skwb_num_(r[8]); });
  return map;
}

/* 日別タブで、ラベルの位置から当日の値のセルを探す。{item: {r, c}} */
function skwb_cells_(vals) {
  var norm = function (v) { return String(v == null ? '' : v).replace(/[\s　]/g, ''); };
  var out = {};
  SKWB_ITEMS.forEach(function (it) {
    for (var r = 8; r < Math.min(vals.length, 40); r++) {
      for (var c = 0; c < Math.min(vals[r].length, 30); c++) {
        if (norm(vals[r][c]) === it[1]) { out[it[0]] = { r: r, c: c + SKWB_VALUE_OFFSET }; return; }
      }
    }
  });
  return out;
}

function skwb_実行_(書き込む, days) {
  var 開始 = Date.now();
  var stores = skwb_stores_();
  var srcs = sk_設定_();                                           // 総括表取り込み.gs と同じ店舗→フォルダ
  var from = new Date(); from.setDate(from.getDate() - (days || 40));
  var fromDate = Utilities.formatDate(from, 'Asia/Tokyo', 'yyyy-MM-dd');
  var usen = skwb_usen_(stores, fromDate);
  var logSh = skwb_logSheet_(); var 前回 = skwb_lastWritten_(logSh);
  var 結果 = { 書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）', 店舗: stores, 対象: fromDate + '〜',
               書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [] };
  var 記録 = [];
  stores.forEach(function (store) {
    var src = srcs.filter(function (s) { return s.store === store; })[0];
    if (!src) { 結果.止めた.push(store + '：SOUKATSU_SOURCES に無い'); return; }
    var books = sk_対象ブック_全期間_(src.folder);
    var keys = Object.keys(usen).filter(function (k) { return usen[k].store === store; }).sort();
    var ssCache = {};
    keys.forEach(function (k) {
      var u = usen[k]; var ym = u.date.slice(0, 4) + u.date.slice(5, 7); var day = Number(u.date.slice(8, 10));
      var book = books.filter(function (b) { return b.ym === ym; }).pop();
      if (!book) { 結果.止めた.push(store + ' ' + u.date + '：' + ym + ' の総括表が無い'); return; }
      var ss = ssCache[book.id] || (ssCache[book.id] = SpreadsheetApp.openById(book.id));
      var sh = ss.getSheetByName(String(day));
      if (!sh) { 結果.止めた.push(store + ' ' + u.date + '：タブ「' + day + '」が無い'); return; }
      var rng = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 40), Math.min(sh.getMaxColumns(), 34));
      var vals = rng.getValues(), fmls = rng.getFormulas(), notes = rng.getNotes();
      var cells = skwb_cells_(vals);
      SKWB_ITEMS.forEach(function (it) {
        var want = u.p[it[0]]; if (want == null || want === '') want = 0;
        var pos = cells[it[0]];
        if (!pos) { 結果.止めた.push(store + ' ' + u.date + '：「' + it[1] + '」のラベルが見つからない'); return; }
        var a1 = skwb_a1_(pos.r, pos.c); var cur = vals[pos.r][pos.c]; var curN = skwb_num_(cur);
        var key = book.name + '|' + day + '|' + a1;
        var cell = function () { return sh.getRange(pos.r + 1, pos.c + 1); };
        var ourNote = String(notes[pos.r][pos.c] || '').indexOf(SKWB_NOTE_TAG) === 0;
        var clearNote = function () { if (書き込む && ourNote) cell().setNote(''); };   // ずれが解消した＝こちらのメモだけ消す
        var row = { 店舗: store, 日付: u.date, 項目: it[1], セル: day + '!' + a1, いま: cur === '' ? '（空欄）' : cur, USEN: want };
        if (fmls[pos.r][pos.c]) { row.結果 = '式なので書かない'; 結果.止めた.push(store + ' ' + u.date + ' ' + it[1] + '：' + a1 + ' は式'); 結果.一覧.push(row); return; }
        if (cur === '' || cur == null) {
          if (want === 0) { row.結果 = '同じ（0）'; 結果.同じ++; 結果.一覧.push(row); clearNote(); return; }   // USENが0の項目は空欄のまま
          row.結果 = '書く'; 結果.書く++;
        } else if (curN === want) { row.結果 = '同じ'; 結果.同じ++; 結果.一覧.push(row); clearNote(); return; }
        else if (前回[key] != null && 前回[key] === curN) { row.結果 = '書き直す'; 結果.書き直す++; }
        else { row.結果 = 'ずれ（上書きしない）'; 結果.ずれ++; }
        結果.一覧.push(row);
        var 済 = row.結果 === '書く' ? '書いた' : row.結果 === '書き直す' ? '書き直した' : 'ずれ';
        if (書き込む && 済 !== 'ずれ') { cell().setValue(want); clearNote(); }
        if (書き込む && 済 === 'ずれ') {
          var 今日 = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d');
          var 単位 = it[0] === 'guests' ? '人' : '円';
          var txt = SKWB_NOTE_TAG + 'USENレジでは ' + Number(want).toLocaleString() + 単位 + ' です（' + 今日 + ' 自動確認）。\nどちらが正しいか、ご確認ください。総括表の数字が正しければ、このままで大丈夫です。';
          if (String(notes[pos.r][pos.c] || '') !== txt) cell().setNote(txt);
        }
        if (書き込む) 記録.push([new Date(), store, u.date, it[1], book.name, String(day), a1, cur, want, 済]);
      });
    });
  });
  if (記録.length) logSh.getRange(logSh.getLastRow() + 1, 1, 記録.length, 記録[0].length).setValues(記録);
  結果.所要秒 = Math.round((Date.now() - 開始) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}

/* ① 下見（書き込みなし）＝今月と前月ぶん */
function 総括表書き戻し_下見() { return skwb_実行_(false, 40); }
/* ② 書き込み実行 */
function 総括表に書き戻す() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log('別の処理が実行中のため見送り'); return { 見送り: true }; }
  try { return skwb_実行_(true, 40); } finally { lock.releaseLock(); }
}
/* 「USEN更新」の取り込みのあとに呼ぶ（SKWB_ENABLED=true のときだけ）。ロックは呼び出し側が持っている */
function skwb_afterUsen_() {
  if (getSetting_('SKWB_ENABLED', false) !== true) return null;
  try { return skwb_実行_(true, Number(getSetting_('SKWB_DAYS', 7)) || 7); } catch (e) { return { error: String(e.message || e) }; }
}
/* Claude Code（神田さんのPC）から動かす入口。USEN取込.gs の usen_api_ の先頭から呼ばれる */
function skwb_api_(data) {
  var key = String(getSetting_('USEN_POST_KEY', '') || '');
  if (!key || String(data.key || '') !== key) return { ok: false, error: 'USEN_KEY' };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return { ok: true, result: skwb_実行_(data.write === true, Number(data.days) || 40) }; }
  finally { lock.releaseLock(); }
}
