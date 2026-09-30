/**
 * 世桜アプリ｜USENレジの売上を取り込む（レジクローズ情報CSV → アプリの日報）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る（総括表取り込み.gs と同じ作法）。
 *
 * ■ なにをするか（2026-09-30 作成＝神田さん「レジからアプリに自動で集約したい」）
 *   USENレジ FOOD オーナー画面 → 帳票管理 → レジクローズ情報 → 店舗ALL・当月 → CSV で落としたファイルを読み、
 *   店舗×営業日ごとに、アプリの soukatsu 行（日報）へ写す。印は src:'usen'。
 *   写す項目＝売上（税込）→sales／純売上（税抜）→net／客数→guests／現金→cash／クレジット→card／
 *             電子マネー→emoney／ポイント→point／値割引→disc／差異合計→err
 *
 * ■ 読む場所（どちらでもよい・両方でもよい）
 *   A. ドライブのフォルダ（Script Properties: USEN_FOLDER_ID）に置かれた CSV（Shift_JIS／UTF-8 どちらも可）
 *      ＝本部が1日1回、レジクローズ情報のCSVをこのフォルダに入れるだけ。同じ日を何度入れても二重にならない
 *   B. このバックエンドのスプレッドシートに「USEN貼付」というシートを作り、画面の表をそのまま貼る
 *      ＝CSVが落ちないときの逃げ道。1行目が見出し（店舗コード・店舗名・営業日 …）であること
 *
 * ■ 決めごと
 *   ・TOTAL行・売上0かつ客数0の日・未来の日付は取り込まない
 *   ・同じ店×日付は「最新の行が正」（アプリの表示ルール）＝中身が変わった日だけ追記すれば上書きになる
 *   ・アプリから直接入力された日（src無し）があっても、USENの行は足す（売上側はレジが正＝2026-09-30 の方針）。
 *     アプリ側で src:'usen' を「POS取込」として扱う（v314〜）。それより前の版のアプリでは通常の行と同じに見える
 *   ・店舗コード→アプリの店舗名は USEN_STORE_MAP（Script Properties の USEN_STORE_MAP で上書き可・JSON）
 *
 * ■ 使い方（順番に）
 *   1. Script Properties に USEN_FOLDER_ID（CSVを置くフォルダのID）を入れる。貼付方式なら不要
 *   2. USEN取込_下見()      … 何件入るかだけ確認（書き込みなし）
 *   3. USENを取り込む()     … 取り込み実行
 *   4. ensureUsenImportTrigger() … 1時間ごとの自動実行を設定
 */

var USEN_SRC_TAG = 'usen';
var USEN_STORE_MAP_DEFAULT = {
  '001': '牛カツ世桜 長堀橋店',
  '002': '牛カツ世桜 富士山店',
  '003': '手巻き寿司世桜 難波店',
  '004': '寿司世桜 心斎橋店',
  '005': '日本鰻世桜 京都祇園店',
  '006': '日本鰻世桜 浅草橋店',
  '007': '和牛世桜 広島店'
};
/* 見出し → アプリの項目（見出しの文字で探す＝列の順番が変わっても追える） */
var USEN_COLS = [
  ['sales',  ['売上(税込)', '売上（税込）', '売上']],
  ['net',    ['純売上']],
  ['guests', ['客数']],
  ['cash',   ['現金']],
  ['card',   ['クレジット']],
  ['emoney', ['電子マネー']],
  ['point',  ['ポイント']],
  ['disc',   ['値割引']],
  ['err',    ['差異合計']]
];
var USEN_PASTE_SHEET = 'USEN貼付';

function usen_storeMap_() {
  var raw = getSetting_('USEN_STORE_MAP', '');
  if (!raw) return USEN_STORE_MAP_DEFAULT;
  try { var m = JSON.parse(raw); return Object.keys(m).length ? m : USEN_STORE_MAP_DEFAULT; } catch (e) { return USEN_STORE_MAP_DEFAULT; }
}
function usen_num_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/[,，\s円¥￥]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var n = Number(s); return isFinite(n) ? n : null;
}
/* 「2026/09/01(火)」「2026/9/1」「20260901」→ 2026-09-01 */
function usen_date_(v) {
  if (v && typeof v.getDate === 'function') return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var s = String(v || '');
  var m = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}
/* 見出し行から列番号を引く。見出しは「完全一致 → 前方一致」の順で探す */
function usen_colIndex_(header, names) {
  var h = header.map(function (x) { return String(x || '').replace(/\s/g, ''); });
  for (var i = 0; i < names.length; i++) {
    var n = names[i].replace(/\s/g, '');
    var exact = h.indexOf(n); if (exact >= 0) return exact;
  }
  for (var j = 0; j < names.length; j++) {
    var n2 = names[j].replace(/\s/g, '');
    for (var c = 0; c < h.length; c++) if (h[c].indexOf(n2) === 0) return c;
  }
  return -1;
}
/* 2次元配列（見出し行を含む）→ 取込レコードの配列 */
function usen_parseTable_(table, label) {
  var out = [];
  if (!table || !table.length) return out;
  var hi = -1;
  for (var r = 0; r < Math.min(table.length, 10); r++) {
    var line = table[r].map(function (x) { return String(x || ''); }).join('|');
    if (line.indexOf('店舗') !== -1 && line.indexOf('営業日') !== -1) { hi = r; break; }
  }
  if (hi < 0) throw new Error('見出し（店舗・営業日）が見つかりません：' + label);
  var header = table[hi];
  var cCode = usen_colIndex_(header, ['店舗コード']), cName = usen_colIndex_(header, ['店舗名']), cDate = usen_colIndex_(header, ['営業日']);
  if (cDate < 0) throw new Error('営業日の列が見つかりません：' + label);
  var cols = USEN_COLS.map(function (k) { return [k[0], usen_colIndex_(header, k[1])]; });
  var map = usen_storeMap_();
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  for (var i = hi + 1; i < table.length; i++) {
    var row = table[i];
    var date = usen_date_(row[cDate]);
    if (!date || date > today) continue;                                  // TOTAL行・未来日は飛ばす
    var code = cCode >= 0 ? String(row[cCode] || '').replace(/^0*(\d)/, '$1') : '';
    code = code ? ('00' + code).slice(-3) : '';
    var store = map[code] || (cName >= 0 ? map[String(row[cName] || '').trim()] : '') || '';
    if (!store) { out.push({ skip: '店舗の対応が無い：' + code + ' ' + (cName >= 0 ? row[cName] : '') }); continue; }
    var d = { date: date, src: USEN_SRC_TAG, usenCode: code };
    /* ★差異合計（レジ誤差）は既定で取り込まない（2026-09-30 9月分で確認＝長堀橋・手巻きは締めで「入力現金」に釣銭準備金しか入れておらず、
       差異＝−現金売上になっている日が大半。レジ誤差として日報に入れると全店の要確認が誤差で埋まる）。
       締めの運用が整った店から Script Properties USEN_IMPORT_ERR=true で有効にする */
    var importErr = getSetting_('USEN_IMPORT_ERR', false) === true;
    cols.forEach(function (c) { if (c[1] < 0) return; if (c[0] === 'err' && !importErr) return; var n = usen_num_(row[c[1]]); if (n != null && n !== 0) d[c[0]] = n; });
    if (!d.sales && !d.guests) continue;                                   // 休業・未入力
    out.push({ store: store, date: date, p: d });
  }
  return out;
}
function usen_canon_(p) {
  var o = {}; ['date', 'sales', 'net', 'guests', 'cash', 'card', 'emoney', 'point', 'disc', 'err'].forEach(function (k) { if (p && p[k] != null && p[k] !== '') o[k] = p[k]; });
  return JSON.stringify(o);
}
/* いまアプリに入っている「店×日付→最新の soukatsu 行」 */
function usen_既存_() {
  var sh = getSheet(); var last = sh.getLastRow(); var map = {};
  if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][2]) !== 'soukatsu') continue;
    var t = Number(vals[i][1]) || 0; var p; try { p = JSON.parse(vals[i][6] || '{}'); } catch (e) { continue; }
    if (!p.date) continue;
    var k = String(vals[i][3]) + '|' + p.date;
    if (!map[k] || t >= map[k].t) map[k] = { t: t, src: p.src || '', canon: usen_canon_(p), p: p };
  }
  return map;
}
/* A. フォルダのCSVを全部読む（新しい順）。Shift_JIS → だめなら UTF-8 */
function usen_readFolder_() {
  var id = getSetting_('USEN_FOLDER_ID', '');
  if (!id) return [];
  var files = DriveApp.getFolderById(String(id)).getFiles(); var out = [];
  while (files.hasNext()) {
    var f = files.next(); var name = f.getName();
    if (!/\.csv$/i.test(name)) continue;
    var blob = f.getBlob(); var txt = '';
    try { txt = blob.getDataAsString('Shift_JIS'); } catch (e) { txt = ''; }
    if (txt.indexOf('営業日') === -1) { try { txt = blob.getDataAsString('UTF-8'); } catch (e2) { txt = ''; } }
    if (txt.indexOf('営業日') === -1) { out.push({ label: name, error: '見出しが読めません（文字コード）' }); continue; }
    out.push({ label: name, table: Utilities.parseCsv(txt.replace(/^﻿/, '')), updated: f.getLastUpdated().getTime() });
  }
  out.sort(function (a, b) { return (a.updated || 0) - (b.updated || 0); });   // 古い→新しい（新しい方が最後に勝つ）
  return out;
}
/* B. 「USEN貼付」シート（画面の表を貼ったもの）。空白区切りでもタブ区切りでもよい */
function usen_readPaste_() {
  var ss; try { ss = getSheet().getParent(); } catch (e) { return []; }
  var sh = ss.getSheetByName(USEN_PASTE_SHEET); if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(1, 1, sh.getLastRow(), Math.max(sh.getLastColumn(), 1)).getValues();
  if (sh.getLastColumn() === 1) {                                          // 1列に貼られた＝空白区切りの行
    vals = vals.map(function (r) {
      var t = String(r[0] || '').trim().split(/\s+/); if (t.length < 19) return t;
      var code = t[0], tail = t.slice(-17), name = t.slice(1, -17).join(' ');
      return [code, name].concat(tail);
    });
  }
  return [{ label: USEN_PASTE_SHEET, table: vals, updated: Date.now() }];
}
function usen_実行_(書き込む) {
  var 開始 = Date.now();
  var sources = usen_readFolder_().concat(usen_readPaste_());
  var 既存 = usen_既存_();
  var sh = 書き込む ? getSheet() : null;
  var 結果 = { 読んだ: [], 新規: 0, 更新: 0, 変わらず: 0, 飛ばした: [], 店舗: {}, 書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）' };
  if (!sources.length) { 結果.注意 = 'CSVのフォルダ（USEN_FOLDER_ID）にファイルが無く、「USEN貼付」シートも空です'; Logger.log(JSON.stringify(結果, null, 2)); return 結果; }
  var 追記 = [];
  sources.forEach(function (s) {
    if (s.error) { 結果.読んだ.push(s.label + '：' + s.error); return; }
    var recs; try { recs = usen_parseTable_(s.table, s.label); } catch (e) { 結果.読んだ.push(s.label + '：' + String(e.message || e)); return; }
    var n = 0;
    recs.forEach(function (r) {
      if (r.skip) { if (結果.飛ばした.indexOf(r.skip) === -1) 結果.飛ばした.push(r.skip); return; }
      n++;
      var k = r.store + '|' + r.date; var cur = 既存[k]; var canon = usen_canon_(r.p);
      var st = 結果.店舗[r.store] || (結果.店舗[r.store] = { 新規: 0, 更新: 0, 変わらず: 0 });
      if (cur && cur.src === USEN_SRC_TAG && cur.canon === canon) { st.変わらず++; 結果.変わらず++; return; }
      if (cur) { st.更新++; 結果.更新++; } else { st.新規++; 結果.新規++; }
      if (書き込む) { 追記.push([Utilities.getUuid(), Date.now(), 'soukatsu', r.store, '', '', JSON.stringify(r.p), '[]']); }
      既存[k] = { t: Date.now(), src: USEN_SRC_TAG, canon: canon, p: r.p };
    });
    結果.読んだ.push(s.label + '：' + n + '日分');
  });
  if (書き込む && 追記.length) { var 次行 = sh.getLastRow() + 1; sh.getRange(次行, 1, 追記.length, 追記[0].length).setValues(追記); }
  結果.所要秒 = Math.round((Date.now() - 開始) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}
/* ① 下見（書き込みなし） */
function USEN取込_下見() { return usen_実行_(false); }
/* ② 取り込み実行（トリガーもこれを呼ぶ） */
function USENを取り込む() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('別の取り込みが実行中のため見送り'); return { 見送り: true }; }
  try { return usen_実行_(true); } finally { lock.releaseLock(); }
}
/* トリガー用の英字名（日本語名をトリガーに指定すると不明なエラーになることがある） */
function importUsen() { return USENを取り込む(); }
/* ③ 1時間ごとの自動実行を設定（重複は作らない） */
function ensureUsenImportTrigger() {
  var exists = ScriptApp.getProjectTriggers().filter(function (t) { var f = t.getHandlerFunction(); return f === 'importUsen' || f === 'USENを取り込む'; });
  if (exists.length) { Logger.log('既に設定済み'); return { 結果: '既に設定済み' }; }
  ScriptApp.newTrigger('importUsen').timeBased().everyHours(1).create();
  Logger.log('設定しました（1時間ごと）'); return { 結果: '設定しました（1時間ごと）' };
}
