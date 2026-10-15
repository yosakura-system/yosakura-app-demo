/**
 * 世桜アプリ｜USENレジ・アプリ日報の数字を総括表へ書き戻す（本部データ → 各店の総括表）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る（USEN取込.gs・総括表取り込み.gs と同じ作法）。
 *
 * ■ なにをするか（2026-10-07 作成＝神田さん「総括表に、こちらからデータを送り直す仕組みを」・増田さん了承の3点）
 *   本部データの日ごとの数字（soukatsu 行）を、各店の総括表の【日別タブ（1〜31）】の入力セルへ書く。
 *   売上台帳・総括表はその日別タブを参照する式なので、書けば自動で反映される。
 *   ★2026-10-15 増田さんの意向（神田さん経由）＝**アプリの日報で入力された数字も総括表へ**。
 *     本部の認識＝「アプリ入力・USENレジ・総括表の直接入力、3つとも最終的に総括表に入っている」に合わせる。
 *   書く項目：
 *     ・レジがある項目（現金売上・カード売上・電子マネー売上・掛売売上・純売上（税抜）・客数・値引き・過不足（現金）＝差異合計）
 *       → その日のUSEN行があればUSENの値（レジが正）。無ければアプリ日報の値
 *       ★2026-10-15 神田さん「レジから取れるデータは全て総括表に流し込む。レジで自動で入るものはアプリで入力しない」
 *         （アプリ側＝レジ店では売上まわりの欄を出さない。過不足はレジの締めが正しく入っている日だけ＝USEN取込.gs の closeng）
 *     ・アプリにしかない項目（本日の口コミ・フード金額・ドリンク金額・チップ・昼のみ売上・過不足の理由）
 *       → アプリ日報の値
 *     ・書けないもの＝仕入金額・人件費・労働時間（総括表側が内訳の合計の式）／国別・勤怠の個人別・仕入先内訳（アプリに無い）
 *
 * ■ 決めごと（増田さんと合意 2026-10-07／アプリ分は 2026-10-15）
 *   ・書く店は SKWB_STORES に入れた店だけ。★2026-10-13 増田さんの依頼で**全店**が既定
 *   ・書いてよいのは「空欄」か「前回こちらが書いた値のまま」のセルだけ
 *   ・店の方が違う数字を打ち込んでいたら、上書きしない＝「ずれ」として記録する（黙って消さない）
 *   ・式が入っているセルには書かない
 *   ・セルの位置は決め打ちしない。日別タブのラベル（「現金売上」「客数」など）の文字で探す
 *   ・書いた記録は、このバックエンドの「_総括表書き戻し」シートに1セル1行で残す（前回こちらが書いた値の判定にも使う）
 *   ・★ずれたセルには「メモ」を付ける（2026-10-07 神田さん＝A案）。右上の小さな三角＝乗せると「USENレジでは○○」「アプリの日報では○○」。
 *     値も書式も変えない・通知も飛ばない（コメントは使わない）。ずれが解消したら、こちらが付けたメモ（【USEN照合】【アプリ照合】で始まるもの）だけ消す。
 *     本部はアプリの「数字の要確認」（総括表とPOSが違う）で全店の一覧を見る＝C案（アプリ側で計算・GASは関わらない）
 *   ・値が0の項目は空欄のまま（0を書き込まない）
 *
 * ■ 設定（Script Properties）
 *   SKWB_STORES  ＝ 書き戻す店（JSONの配列）。無ければ全店（SOUKATSU_SOURCES の店すべて）。絞りたいときだけ入れる
 *   SKWB_ENABLED ＝ true にすると「USEN更新」の取り込みのあとに自動で書き戻す。既定は false（手で動かす）
 *   SKWB_DAYS    ＝ 自動のときに遡る日数（既定 7）
 *   SKWB_APP     ＝ false にするとアプリ日報の分は書かない（USENだけ＝2026-10-14 までの動き）。既定は true
 *   総括表の場所は、総括表取り込み.gs と同じ SOUKATSU_SOURCES（店舗→フォルダ）を使う
 *
 * ■ 使い方（順番に）
 *   1. 総括表書き戻し_下見() … どのセルに何を書くかの一覧だけ（書き込みなし）
 *   2. 総括表に書き戻す()     … 書き込み実行
 *   3. うまくいったら SKWB_ENABLED=true（毎朝の「USEN更新」のあとに自動）
 *   ※ Claude Code からは POST {kind:'skwb', key:USEN_POST_KEY, write:false|true, days:N, stores:[...]} でも動かせる
 *     stores を付けるとその店だけ（全店を1回で回すと6分の上限に当たるので、1店ずつ呼ぶ用）。
 *     {kind:'skwb', key, enable:true|false} で SKWB_ENABLED を書き換える（設定画面は保存が効かないことがあるためコードから）
 */

var SKWB_LOG_SHEET = '_総括表書き戻し';
/* 書く項目 → 日別タブのラベル（空白と改行は無視して比べる。文字列＝完全一致／RegExp＝一致）
   dr, dc ＝ ラベルのセルから見た「当日の値」のセルの位置（行・列のずれ）。総括表Ver.3.0 の日別タブで確認（2026-10-15 長堀橋 10月）
   usen  ＝ true：その日のUSEN行があればUSENの値を優先（レジが正）。false：アプリ日報の値だけ
   ctx   ＝ true：ラベルの上3行以内に「当日計」の見出しがある行だけ採る（「フード」「ドリンク」は仕入れ内訳にも同じ字があるため）
   text  ＝ true：文章の欄（数字でなく文字をそのまま書く。メモは付けない） */
var SKWB_ITEMS = [
  { k: 'cash',     label: '現金売上',               dr: 0, dc: 5, usen: true,  unit: '円' },
  { k: 'card',     label: 'カード売上',             dr: 0, dc: 5, usen: true,  unit: '円' },
  { k: 'emoney',   label: '電子マネー売上',         dr: 0, dc: 5, usen: true,  unit: '円' },
  { k: 'net',      label: '純売上（税抜）',          dr: 0, dc: 5, usen: true,  unit: '円' },
  { k: 'guests',   label: '客数',                   dr: 0, dc: 5, usen: true,  unit: '人' },
  { k: 'disc',     label: '値引き',                 dr: 0, dc: 5, usen: true,  unit: '円' },
  { k: 'kake',     label: '掛売売上',               dr: 0, dc: 5, usen: true,  unit: '円' },
  { k: 'err',      label: /^過不足[（(]現金[)）]$/,  dr: 0, dc: 4, usen: true,  unit: '円', appFallback: true },   // レジの差異合計。締め未統一（closeng）の日はアプリの値
  { k: 'rvt',      label: /^本日の口コミ獲得/,       dr: 0, dc: 6, usen: false, unit: '件', gs: true },   // 2026-10-15 Googleの口コミ件数（毎晩の取得 gsnap）が主。無い日だけアプリ
  { k: 'foodamt',  label: 'フード',                 dr: 0, dc: 5, usen: true,  unit: '円', ctx: true, appFallback: true },   // 2026-10-15 レジ（伝票明細のカテゴリ）が主
  { k: 'drinkamt', label: 'ドリンク',               dr: 0, dc: 5, usen: true,  unit: '円', ctx: true, appFallback: true },
  { k: 'tipt',     label: 'チップ',                 dr: 0, dc: 5, usen: false, unit: '円', ctx: true },
  { k: 'lunch',    label: '昼のみ売上',             dr: 1, dc: 4, usen: false, unit: '円' },
  { k: 'errnote',  label: /過不足理由記載/,          dr: 1, dc: 0, usen: false, text: true }
];
var SKWB_NOTE_TAGS = { usen: '【USEN照合】', app: '【アプリ照合】', gs: '【Google照合】' };   // こちらが付けたメモの印。これで始まらないメモ（店や増田さんのメモ）には触らない
var SKWB_SRC_NAME = { usen: 'USENレジ', app: 'アプリ日報', gs: 'Google口コミ' };

function skwb_stores_(only) {
  if (only && only.length) return only;                                  // POST の stores（1店ずつ回す用）
  var raw = getSetting_('SKWB_STORES', '');
  var all = sk_設定_().map(function (s) { return s.store; });            // ★2026-10-13 既定＝全店（増田さんの依頼）
  if (!raw || raw === 'all') return all;
  try { var a = JSON.parse(raw); return a.length ? a : all; } catch (e) { return all; }
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
function skwb_isOurNote_(note) {
  var s = String(note || '');
  return Object.keys(SKWB_NOTE_TAGS).some(function (k) { return s.indexOf(SKWB_NOTE_TAGS[k]) === 0; });
}

/* 本部データから、店×日付ごとの「最新の USEN 行」と「最新のアプリ日報の行」。{store|date: {store, date, usen: p|null, app: p|null}}
   総括表から取り込んだ行（src が usen 以外で入っているもの）は元が総括表なので書き戻さない */
function skwb_rows_(stores, fromDate, withApp) {
  var sh = getSheet(); var last = sh.getLastRow(); var map = {};
  if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    var kindRow = String(vals[i][2]);
    /* ★Googleの口コミ件数（毎晩の取得・kind:'gsnap'・item＝日付・note {src:'places', gained}）＝「本日の口コミ獲得」の出どころ（2026-10-15） */
    if (kindRow === 'gsnap') {
      var gStore = String(vals[i][3]); if (stores.indexOf(gStore) === -1) continue;
      var gRaw = vals[i][4]; var gDate = (gRaw && gRaw.getTime) ? Utilities.formatDate(gRaw, 'Asia/Tokyo', 'yyyy-MM-dd') : String(gRaw || '').slice(0, 10);   // item の日付はシートが Date に変えていることがある
      if (!/^\d{4}-\d{2}-\d{2}$/.test(gDate) || gDate < fromDate) continue;
      var gp; try { gp = JSON.parse(vals[i][6] || '{}'); } catch (e2) { continue; }
      if (!gp || gp.src !== 'places' || typeof gp.gained !== 'number') continue;
      var gt = Number(vals[i][1]) || 0; var gk = gStore + '|' + gDate;
      var ge = map[gk] || (map[gk] = { store: gStore, date: gDate, usen: null, app: null, tUsen: -1, tApp: -1, usenBase: null, usenX: null, tUsenX: -1, gs: null, tGs: -1 });
      if (gt >= ge.tGs) { ge.gs = gp.gained; ge.tGs = gt; }
      continue;
    }
    if (kindRow !== 'soukatsu') continue;
    var store = String(vals[i][3]); if (stores.indexOf(store) === -1) continue;
    var p; try { p = JSON.parse(vals[i][6] || '{}'); } catch (e) { continue; }
    if (!p.date || p.date < fromDate) continue;
    var kind = p.src === 'usen' ? 'usen' : !p.src ? 'app' : null;   // null＝総括表取込の行
    if (!kind || (kind === 'app' && !withApp)) continue;
    var t = Number(vals[i][1]) || 0; var k = store + '|' + p.date;
    var e = map[k] || (map[k] = { store: store, date: p.date, usen: null, app: null, tUsen: -1, tApp: -1, usenBase: null, usenX: null, tUsenX: -1, gs: null, tGs: -1 });
    /* ★USEN行は2種類＝レジクローズ（sales あり）と伝票明細の集計（pcty・foodamt…）。sales のある最新行を土台に、集計の最新行の項目を重ねる（2026-10-15） */
    if (kind === 'usen') {
      if (p.sales != null && t >= e.tUsen) { e.usenBase = p; e.tUsen = t; }
      if ((p.pcty != null || p.foodamt != null || p.drinkamt != null) && t >= e.tUsenX) { e.usenX = p; e.tUsenX = t; }
    }
    if (kind === 'app' && t >= e.tApp) { e.app = p; e.tApp = t; }
  }
  Object.keys(map).forEach(function (k2) {
    var e2 = map[k2]; if (!e2.usenBase && !e2.usenX) return;
    var m = {}; var src = [e2.usenBase, e2.usenX];
    src.forEach(function (q) { if (q) Object.keys(q).forEach(function (x) { m[x] = q[x]; }); });   // 集計の項目は集計行の値、
    if (e2.usenBase) ['sales', 'net', 'guests', 'cash', 'card', 'emoney', 'point', 'kake', 'disc', 'err', 'closeng'].forEach(function (x) { if (e2.usenBase[x] != null) m[x] = e2.usenBase[x]; else delete m[x]; });   // レジの項目は土台の値
    e2.usen = m;
  });
  return map;
}

/* 「前回こちらが書いた値」＝記録シートの最後の書き込み（ファイル×タブ×セルごと） */
function skwb_logSheet_() {
  var ss = getSheet().getParent();
  var sh = ss.getSheetByName(SKWB_LOG_SHEET);
  if (!sh) { sh = ss.insertSheet(SKWB_LOG_SHEET); sh.appendRow(['日時', '店舗', '日付', '項目', 'ファイル', 'タブ', 'セル', '前の値', '書く値', '結果', '出どころ']); }
  else if (sh.getRange(1, 11).getValue() === '') sh.getRange(1, 11).setValue('出どころ');   // 2026-10-15 列を足した（古い記録は空欄＝USEN）
  return sh;
}
function skwb_lastWritten_(sh) {
  var map = {}; var last = sh.getLastRow(); if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, 10).getValues();
  vals.forEach(function (r) { if (r[9] === '書いた' || r[9] === '書き直した') map[r[4] + '|' + r[5] + '|' + r[6]] = r[8]; });
  return map;
}

/* 日別タブで、ラベルの位置から当日の値のセルを探す。{item: {r, c}} */
function skwb_cells_(vals) {
  var norm = function (v) { return String(v == null ? '' : v).replace(/[\s　]/g, ''); };
  var hit = function (v, label) { var s = norm(v); return label instanceof RegExp ? label.test(s) : s === label; };
  var hasCtx = function (r) {   // 上3行以内に「当日計」の見出しがある
    for (var up = 1; up <= 3; up++) { var rr = r - up; if (rr < 0) break;
      for (var c = 0; c < vals[rr].length; c++) if (norm(vals[rr][c]).indexOf('当日計') !== -1) return true; }
    return false;
  };
  var out = {};
  SKWB_ITEMS.forEach(function (it) {
    for (var r = 8; r < Math.min(vals.length, 40); r++) {
      for (var c = 0; c < Math.min(vals[r].length, 30); c++) {
        if (!hit(vals[r][c], it.label)) continue;
        if (it.ctx && !hasCtx(r)) continue;
        var rr = r + it.dr, cc = c + it.dc;
        if (rr < vals.length && cc < vals[rr].length) out[it.k] = { r: rr, c: cc };
        return;
      }
    }
  });
  return out;
}

/* その日の項目の「書く値」と「出どころ」。無ければ null */
function skwb_want_(it, e) {
  var pick = function (p) {
    if (!p) return null;
    var v = p[it.k];
    if (it.text) { v = String(v == null ? '' : v).trim(); return v ? v : null; }
    v = skwb_num_(v); return v == null || v === 0 ? null : v;
  };
  if (it.gs && e.gs != null && e.gs > 0) return { v: e.gs, src: 'gs', zero: false };   // Googleの件数（前日比がプラスの日だけ）。無い日はアプリの値へ
  if (it.usen && e.usen) {
    var u = pick(e.usen);
    if (u != null) return { v: u, src: 'usen', zero: false };
    if (!it.appFallback && e.usen.sales != null) return { v: 0, src: 'usen', zero: true };     // USENが0＝空欄のまま（同じ（0））。sales の無い行（集計だけ）は0と見なさない
  }
  var a = pick(e.app);
  if (a == null) return null;
  return { v: a, src: 'app', zero: false };
}

function skwb_実行_(書き込む, days, only) {
  var 開始 = Date.now();
  var stores = skwb_stores_(only);
  var srcs = sk_設定_();                                           // 総括表取り込み.gs と同じ店舗→フォルダ
  var withApp = getSetting_('SKWB_APP', true) !== false;
  var from = new Date(); from.setDate(from.getDate() - (days || 40));
  var fromDate = Utilities.formatDate(from, 'Asia/Tokyo', 'yyyy-MM-dd');
  var rows = skwb_rows_(stores, fromDate, withApp);
  var logSh = skwb_logSheet_(); var 前回 = skwb_lastWritten_(logSh);
  var 結果 = { 書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）', 店舗: stores, 対象: fromDate + '〜', アプリ分: withApp ? '含む' : '含まない（SKWB_APP=false）',
               書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [] };
  var 記録 = []; var 見つからない = {};
  stores.forEach(function (store) {
    var src = srcs.filter(function (s) { return s.store === store; })[0];
    if (!src) { 結果.止めた.push(store + '：SOUKATSU_SOURCES に無い'); return; }
    var books = sk_対象ブック_全期間_(src.folder);
    var keys = Object.keys(rows).filter(function (k) { return rows[k].store === store; }).sort();
    var ssCache = {};
    keys.forEach(function (k) {
      var e = rows[k]; var ym = e.date.slice(0, 4) + e.date.slice(5, 7); var day = Number(e.date.slice(8, 10));
      var book = books.filter(function (b) { return b.ym === ym; }).pop();
      if (!book) { 結果.止めた.push(store + ' ' + e.date + '：' + ym + ' の総括表が無い'); return; }
      var ss = ssCache[book.id] || (ssCache[book.id] = SpreadsheetApp.openById(book.id));
      var sh = ss.getSheetByName(String(day));
      if (!sh) { 結果.止めた.push(store + ' ' + e.date + '：タブ「' + day + '」が無い'); return; }
      var rng = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 100), Math.min(sh.getMaxColumns(), 34));   // 100行＝勤怠の行（77〜89）まで
      var vals = rng.getValues(), fmls = rng.getFormulas(), notes = rng.getNotes();
      var cells = skwb_cells_(vals);
      /* アプリに売上合計だけあって現金・カードの内訳が無い日＝売上合計は式なので書けない（1日1回だけ知らせる） */
      if (!e.usen && e.app && skwb_num_(e.app.sales) && !skwb_num_(e.app.cash) && !skwb_num_(e.app.card) && !skwb_num_(e.app.emoney)) {
        結果.止めた.push(store + ' ' + e.date + '：アプリの日報に売上合計だけで現金・カードの内訳が無い（売上合計は式のため書けない）');
      }
      SKWB_ITEMS.forEach(function (it) {
        var w = skwb_want_(it, e); if (!w) return;                   // その日にこの項目の値が無い＝触らない
        var pos = cells[it.k];
        var labelName = it.label instanceof RegExp ? String(it.label).replace(/^\/\^?|\$?\/$/g, '') : it.label;
        if (!pos) {   // ラベルが無い＝総括表の形が違う。店×ファイル×項目で1回だけ知らせる
          var nk = store + '|' + book.name + '|' + it.k;
          if (!見つからない[nk]) { 見つからない[nk] = 1; 結果.止めた.push(store + ' ' + book.name + '：「' + labelName + '」のラベルが見つからない'); }
          return;
        }
        var a1 = skwb_a1_(pos.r, pos.c); var cur = vals[pos.r][pos.c];
        var want = w.v; var srcName = SKWB_SRC_NAME[w.src];
        var same = it.text ? String(cur == null ? '' : cur).trim() === String(want) : skwb_num_(cur) === want;
        var prevSame = it.text ? String(前回[book.name + '|' + day + '|' + a1] == null ? '' : 前回[book.name + '|' + day + '|' + a1]) === String(cur == null ? '' : cur).trim()
                               : (前回[book.name + '|' + day + '|' + a1] != null && skwb_num_(前回[book.name + '|' + day + '|' + a1]) === skwb_num_(cur));
        var cell = function () { return sh.getRange(pos.r + 1, pos.c + 1); };
        var ourNote = skwb_isOurNote_(notes[pos.r][pos.c]);
        var clearNote = function () { if (書き込む && ourNote) cell().setNote(''); };   // ずれが解消した＝こちらのメモだけ消す
        var row = { 店舗: store, 日付: e.date, 項目: labelName, セル: day + '!' + a1, いま: cur === '' ? '（空欄）' : cur, 書く値: want, 出どころ: srcName };
        if (fmls[pos.r][pos.c]) { row.結果 = '式なので書かない'; 結果.止めた.push(store + ' ' + e.date + ' ' + labelName + '：' + a1 + ' は式'); 結果.一覧.push(row); return; }
        if (cur === '' || cur == null) {
          if (w.zero) { row.結果 = '同じ（0）'; 結果.同じ++; 結果.一覧.push(row); clearNote(); return; }   // USENが0の項目は空欄のまま
          row.結果 = '書く'; 結果.書く++;
        } else if (same) { row.結果 = '同じ'; 結果.同じ++; 結果.一覧.push(row); clearNote(); return; }
        else if (prevSame) { row.結果 = '書き直す'; 結果.書き直す++; }
        else { row.結果 = 'ずれ（上書きしない）'; 結果.ずれ++; }
        結果.一覧.push(row);
        var 済 = row.結果 === '書く' ? '書いた' : row.結果 === '書き直す' ? '書き直した' : 'ずれ';
        if (書き込む && 済 !== 'ずれ') { cell().setValue(want); clearNote(); }
        if (書き込む && 済 === 'ずれ' && !it.text) {
          var 今日 = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d');
          var txt = SKWB_NOTE_TAGS[w.src] + srcName + 'では ' + Number(want).toLocaleString() + (it.unit || '') + ' です（' + 今日 + ' 自動確認）。\nどちらが正しいか、ご確認ください。総括表の数字が正しければ、このままで大丈夫です。';
          if (String(notes[pos.r][pos.c] || '') !== txt) cell().setNote(txt);
        }
        if (書き込む) 記録.push([new Date(), store, e.date, labelName, book.name, String(day), a1, cur, want, 済, srcName]);
      });
      /* ★勤怠（アプリの日報・任意）＝総括表の勤怠の行へ（氏名・出勤の時/分・退勤の時/分。合計・外時間・金額は式）2026-10-15 */
      if (e.app && Array.isArray(e.app.kintai) && e.app.kintai.length) skwb_kintai_(e, vals, fmls, sh, book, day, store, 前回, 結果, 記録, 書き込む);
      /* ★国別（レジの客層「国籍」＝伝票明細の集計 pcty）→ 顧客情報の「国」の行の下の組数・人数へ（2026-10-15 神田さん「レジ客層が主・転記するだけ」） */
      if (e.usen && e.usen.pcty) skwb_cty_(e, vals, fmls, sh, book, day, store, 前回, 結果, 記録, 書き込む);
      /* ★仕入の内訳（アプリ日報の納品書 slips）→ 仕入れ内訳の仕入先の行へ（2026-10-15） */
      if (e.app && Array.isArray(e.app.slips) && e.app.slips.length && e.date >= String(getSetting_('SKWB_SLIPS_SINCE', '2026-10-16'))) skwb_slips_(e, vals, fmls, notes, sh, book, day, store, 前回, 結果, 記録, 書き込む);
    });
  });
  if (記録.length) logSh.getRange(logSh.getLastRow() + 1, 1, 記録.length, 記録[0].length).setValues(記録);
  結果.所要秒 = Math.round((Date.now() - 開始) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}

/* 勤怠の行＝「氏名」の見出し（同じ行に「勤務時間」）の下、最大13行。列＝C 氏名／G 出勤の時／I 出勤の分／L 退勤の時／N 退勤の分（総括表Ver.3.0 で確認）。
   1行を1単位で扱う＝氏名が空なら書く・同じ氏名で時刻も同じなら同じ・前回こちらが書いた氏名なら書き直す・それ以外はずれ（上書きしない） */
function skwb_kintai_(e, vals, fmls, sh, book, day, store, 前回, 結果, 記録, 書き込む) {
  var norm = function (v) { return String(v == null ? '' : v).replace(/[\s　]/g, ''); };
  var hdr = -1;
  for (var r = 40; r < vals.length; r++) if (norm(vals[r][1]) === '氏名' && vals[r].some(function (x) { return norm(x).indexOf('勤務時間') !== -1; })) { hdr = r; break; }
  if (hdr < 0) { 結果.止めた.push(store + ' ' + book.name + '：勤怠の「氏名」の見出しが見つからない'); return; }
  var rows = [];
  for (var r2 = hdr + 1; r2 < vals.length && rows.length < 13; r2++) { if (norm(vals[r2][1]) === '当日計' || norm(vals[r2][6]) === '時間計') break; rows.push(r2); }
  var C = { n: 2, sh: 6, sm: 8, eh: 11, em: 13 };
  var hm = function (x) { var m = String(x || '').match(/^(\d{1,2}):(\d{2})$/); return m ? [Number(m[1]), Number(m[2])] : null; };
  e.app.kintai.slice(0, rows.length).forEach(function (k, i) {
    var rr = rows[i]; var name = String(k.n || '').trim(); if (!name) return;
    var st = hm(k.s), en = hm(k.e);
    if (st && en && (en[0] < st[0] || (en[0] === st[0] && en[1] < st[1]))) en[0] += 24;   // 日をまたぐ退勤＝24を足す（総括表の選択肢は27時まで）
    var want = { sh: st ? st[0] : null, sm: st ? st[1] : null, eh: en ? en[0] : null, em: en ? en[1] : null };
    var a1 = skwb_a1_(rr, C.n); var key = book.name + '|' + day + '|' + a1;
    var curName = String(vals[rr][C.n] == null ? '' : vals[rr][C.n]).trim();
    var cur = curName === '' ? '（空欄）' : curName + ' ' + vals[rr][C.sh] + ':' + vals[rr][C.sm] + '〜' + vals[rr][C.eh] + ':' + vals[rr][C.em];
    var row = { 店舗: store, 日付: e.date, 項目: '勤怠' + (i + 1), セル: day + '!' + a1, いま: cur, 書く値: name + ' ' + (k.s || '') + '〜' + (k.e || ''), 出どころ: 'アプリ日報' };
    if (fmls[rr][C.n]) { row.結果 = '式なので書かない'; 結果.一覧.push(row); return; }
    var sameTimes = ['sh', 'sm', 'eh', 'em'].every(function (f) { var cv = vals[rr][C[f]]; return want[f] == null ? (cv === '' || cv == null) : skwb_num_(cv) === want[f]; });
    if (curName === '') { row.結果 = '書く'; 結果.書く++; }
    else if (curName === name && sameTimes) { row.結果 = '同じ'; 結果.同じ++; 結果.一覧.push(row); return; }
    else if (前回[key] != null && String(前回[key]) === curName) { row.結果 = '書き直す'; 結果.書き直す++; }
    else { row.結果 = 'ずれ（上書きしない）'; 結果.ずれ++; }
    結果.一覧.push(row);
    var 済 = row.結果 === '書く' ? '書いた' : row.結果 === '書き直す' ? '書き直した' : 'ずれ';
    if (書き込む && 済 !== 'ずれ') {
      sh.getRange(rr + 1, C.n + 1).setValue(name);
      ['sh', 'sm', 'eh', 'em'].forEach(function (f) { if (fmls[rr][C[f]]) return; sh.getRange(rr + 1, C[f] + 1).setValue(want[f] == null ? '' : want[f]); });
    }
    if (書き込む) 記録.push([new Date(), store, e.date, '勤怠' + (i + 1), book.name, String(day), a1, curName, name, 済, 'アプリ日報']);
  });
}
/* 国別＝「国」のラベル行（B列）の右に国名、その下の行が「組数」「人数」。国名は半角カナ混じりなので NFKC でそろえて比べる。
   レジの客層の区分（例：欧米）が総括表の国の列に無いときは書かず、止めたに1回だけ出す（増田さんに区分の対応を決めてもらう） */
var SKWB_CTY_ALIAS = { '米国': 'アメリカ', 'USA': 'アメリカ', '欧州': 'ヨーロッパ', 'イタリア': 'ヨーロッパ', 'フランス': 'ヨーロッパ', 'イギリス': 'ヨーロッパ', 'ドイツ': 'ヨーロッパ', 'スペイン': 'ヨーロッパ', '豪州': 'オーストラリア', 'ベトナム': '東南アジア', 'タイ': '東南アジア', 'フィリピン': '東南アジア', 'インドネシア': '東南アジア', 'マレーシア': '東南アジア', 'シンガポール': '東南アジア', 'インド': '南アジア' };
function skwb_cty_(e, vals, fmls, sh, book, day, store, 前回, 結果, 記録, 書き込む) {
  var norm = function (v) { return String(v == null ? '' : v).normalize('NFKC').replace(/[\s　]/g, ''); };
  var cols = {};   // 国名（正規化）→ { c, rG, rP }
  for (var r = 40; r < vals.length - 2; r++) {
    if (norm(vals[r][1]) !== '国' && norm(vals[r][0]) !== '国') continue;
    if (!/組数/.test(norm(vals[r + 1][1]) + norm(vals[r + 1][0])) || !/人数/.test(norm(vals[r + 2][1]) + norm(vals[r + 2][0]))) continue;
    for (var c = 2; c < vals[r].length; c++) { var h = norm(vals[r][c]); if (h && !cols[h]) cols[h] = { c: c, rG: r + 1, rP: r + 2 }; }
  }
  if (!Object.keys(cols).length) { 結果.止めた.push(store + ' ' + book.name + '：顧客情報の「国」の行が見つからない'); return; }
  Object.keys(e.usen.pcty).forEach(function (label) {
    var v = e.usen.pcty[label] || {}; var g = skwb_num_(v.g) || 0, pn = skwb_num_(v.p) || 0; if (!g && !pn) return;
    var key = norm(label); var col = cols[key] || cols[SKWB_CTY_ALIAS[key] || ''];
    if (!col) { var why = store + ' ' + e.date + '：レジの客層「' + label + '」は総括表の国の列に無い（組' + g + '・人' + pn + '）'; if (結果.止めた.indexOf(why) === -1) 結果.止めた.push(why); return; }
    [['組数', col.rG, g, '組'], ['人数', col.rP, pn, '人']].forEach(function (x) {
      var want = x[2]; if (!want) return;
      var rr = x[1], cc = col.c; var a1 = skwb_a1_(rr, cc); var cur = vals[rr][cc]; var k2 = book.name + '|' + day + '|' + a1;
      var row = { 店舗: store, 日付: e.date, 項目: '国別 ' + label + ' ' + x[0], セル: day + '!' + a1, いま: cur === '' ? '（空欄）' : cur, 書く値: want, 出どころ: 'USENレジ' };
      if (fmls[rr][cc]) { row.結果 = '式なので書かない'; 結果.一覧.push(row); return; }
      if (cur === '' || cur == null) { row.結果 = '書く'; 結果.書く++; }
      else if (skwb_num_(cur) === want) { row.結果 = '同じ'; 結果.同じ++; 結果.一覧.push(row); return; }
      else if (前回[k2] != null && skwb_num_(前回[k2]) === skwb_num_(cur)) { row.結果 = '書き直す'; 結果.書き直す++; }
      else { row.結果 = 'ずれ（上書きしない）'; 結果.ずれ++; }
      結果.一覧.push(row);
      var 済 = row.結果 === '書く' ? '書いた' : row.結果 === '書き直す' ? '書き直した' : 'ずれ';
      if (書き込む && 済 !== 'ずれ') sh.getRange(rr + 1, cc + 1).setValue(want);
      if (書き込む) 記録.push([new Date(), store, e.date, row.項目, book.name, String(day), a1, cur, want, 済, 'USENレジ']);
    });
  });
}
/* ★書くのは SKWB_SLIPS_SINCE（既定 2026-10-16）以降の日だけ＝それより前の日報の納品書は、読み取りを直す前（2026-10-15）の誤読のまま提出されている（イオン2,026・西原5,292など）。
   古い値で「写真では○○円」のメモを付けないため */
/* 仕入の内訳＝日別タブの「＜仕入れ内訳＞」の下。左＝フード（B列に仕入先名・金額は同じブロックの「合計」行の金額の列）、右＝ドリンク（L列に「名畑（酒10％）」など）。
   総括表の決まり＝仕入れはすべて税込で入力（仕入れ台帳で税抜に換算）＝納品書の税込額をそのまま入れる。
   仕入先ごとに合計して入れる（同じ日に同じ仕入先の伝票が2枚なら足す）。
   ・名畑＝8%（お酒以外）と10%（お酒）を右のドリンクの2行へ分ける
   ・それ以外＝伝票の合計（8%＋10%）を左のフードの、名前が合う行へ
   ・名前の合う行が無い仕入先＝空いている「(予備)」の行に、仕入先名と金額を入れる（店が(予備)を書き換えて使っている型に合わせる）
   ・本部請求＝総括表の内訳に行が無い（本部の請求書で月にまとめて計上）＝書かない
   決めごとはほかの項目と同じ＝空欄だけ書く・同じなら何もしない・前回こちらが書いた値なら書き直す・違えば上書きせずメモ */
var SKWB_SLIP_ROWS = [
  { v: '西原商会',     re: /西原/ },
  { v: 'フレッシュ青果', re: /フレッシュ/ },
  { v: 'イオン',       re: /AEON|イオン/i },
  { v: 'オーディエー', re: /ODA|オーディエー/i },
  { v: 'ローソン',     re: /ローソン|LAWSON/i },
  { v: '銘洋',         re: /メイヨウ|銘洋/ },
  { v: '魚伸',         re: /魚伸/ },
  { v: 'リカーマウンテン', re: /リカー|リカマン/ },
  { v: '日本食研',     re: /日本食研/ }
];
function skwb_slips_(e, vals, fmls, notes, sh, book, day, store, 前回, 結果, 記録, 書き込む) {
  var norm = function (v) { return String(v == null ? '' : v).normalize('NFKC').replace(/[\s　]/g, ''); };
  /* ブロックを探す＝「仕入れ内訳」の見出しの行のあと、「フード」（左）と「ドリンク」（右）の見出しの行 */
  var hr = -1;
  for (var r = 30; r < Math.min(vals.length, 70); r++) if (vals[r].some(function (x) { return /仕入れ内訳|仕入内訳/.test(norm(x)); })) { hr = r; break; }
  if (hr < 0) { 結果.止めた.push(store + ' ' + book.name + '：「仕入れ内訳」の見出しが見つからない'); return; }
  var blocks = [];
  for (var r2 = hr + 1; r2 < Math.min(vals.length, hr + 4); r2++) {
    for (var c = 0; c < vals[r2].length; c++) {
      var h = norm(vals[r2][c]);
      if (h !== 'フード' && h !== 'ドリンク') continue;
      var rows = [], amtCol = -1;
      for (var r3 = r2 + 1; r3 < Math.min(vals.length, r2 + 25); r3++) {
        var lab = norm(vals[r3][c]);
        if (lab === '合計') { for (var c2 = c + 1; c2 < Math.min(vals[r3].length, c + 10); c2++) if (fmls[r3][c2] || vals[r3][c2] !== '') { amtCol = c2; break; } break; }
        rows.push(r3);
      }
      if (amtCol >= 0) blocks.push({ kind: h, col: c, amt: amtCol, rows: rows });
    }
    if (blocks.length) break;
  }
  var food = blocks.filter(function (b) { return b.kind === 'フード'; })[0], drink = blocks.filter(function (b) { return b.kind === 'ドリンク'; })[0];
  if (!food) { 結果.止めた.push(store + ' ' + book.name + '：仕入れ内訳の「フード」の欄が見つからない'); return; }
  /* 仕入先ごとに合計（名畑だけ 8%／10% を分ける） */
  var sum = {}; var order = [];
  var add = function (k, v) { if (!v) return; if (sum[k] == null) { sum[k] = 0; order.push(k); } sum[k] += v; };
  e.app.slips.forEach(function (x) {
    var v = String(x.v || '').trim(); var a8 = skwb_num_(x.a8) || 0, a10 = skwb_num_(x.a10) || 0;
    if (!v || (!a8 && !a10)) return;
    if (/^本部/.test(v)) { var why = store + ' ' + e.date + '：本部請求は仕入れ内訳に行が無いので書かない（' + (a8 + a10) + '円）'; if (結果.止めた.indexOf(why) === -1) 結果.止めた.push(why); return; }
    if (/名畑/.test(v)) { add('名畑|10', a10); add('名畑|8', a8); return; }
    add(v, a8 + a10);
  });
  var used = {};
  order.forEach(function (k) {
    var want = Math.round(sum[k]); if (!want) return;
    var rr = -1, cc = -1, labelFix = null, blk = food;
    if (/^名畑\|/.test(k)) {
      if (!drink) { 結果.止めた.push(store + ' ' + book.name + '：仕入れ内訳の「ドリンク」の欄が見つからない'); return; }
      blk = drink; var ten = /\|10$/.test(k);
      drink.rows.forEach(function (r4) { if (rr >= 0) return; var lab = norm(vals[r4][drink.col]); if (/名畑/.test(lab) && (ten ? /酒10/.test(lab) : /(酒以外|8)/.test(lab))) rr = r4; });
    } else {
      var m = SKWB_SLIP_ROWS.filter(function (x) { return x.v === k; })[0];
      var reK = m ? m.re : new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      food.rows.forEach(function (r4) { if (rr >= 0 || used[r4]) return; if (reK.test(norm(vals[r4][food.col]))) rr = r4; });
      if (rr < 0) {   // 名前の合う行が無い＝空いている(予備)の行
        food.rows.forEach(function (r4) { if (rr >= 0 || used[r4]) return; var lab = norm(vals[r4][food.col]); if (/^\(予備\)$/.test(lab) && (vals[r4][food.amt] === '' || vals[r4][food.amt] == null) && !fmls[r4][food.col]) { rr = r4; labelFix = k; } });
      }
    }
    if (rr < 0) { var why2 = store + ' ' + e.date + '：仕入れ内訳に「' + k.replace('|', ' ') + '」の行も空いている(予備)の行も無い（' + want + '円）'; if (結果.止めた.indexOf(why2) === -1) 結果.止めた.push(why2); return; }
    used[rr] = 1; cc = blk.amt;
    var a1 = skwb_a1_(rr, cc); var cur = vals[rr][cc]; var key = book.name + '|' + day + '|' + a1;
    var itemName = '仕入 ' + k.replace('|10', '（酒10%）').replace('|8', '（酒以外8%）');
    var row = { 店舗: store, 日付: e.date, 項目: itemName, セル: day + '!' + a1, いま: cur === '' ? '（空欄）' : cur, 書く値: want, 出どころ: 'アプリ日報（納品書）' };
    if (fmls[rr][cc]) { row.結果 = '式なので書かない'; 結果.一覧.push(row); return; }
    if (cur === '' || cur == null) { row.結果 = '書く'; 結果.書く++; }
    else if (skwb_num_(cur) === want) { row.結果 = '同じ'; 結果.同じ++; 結果.一覧.push(row); return; }
    else if (前回[key] != null && skwb_num_(前回[key]) === skwb_num_(cur)) { row.結果 = '書き直す'; 結果.書き直す++; }
    else { row.結果 = 'ずれ（上書きしない）'; 結果.ずれ++; }
    結果.一覧.push(row);
    var 済 = row.結果 === '書く' ? '書いた' : row.結果 === '書き直す' ? '書き直した' : 'ずれ';
    if (書き込む && 済 !== 'ずれ') { if (labelFix) sh.getRange(rr + 1, blk.col + 1).setValue(labelFix); sh.getRange(rr + 1, cc + 1).setValue(want); }
    if (書き込む && 済 === 'ずれ') {
      var txt = SKWB_NOTE_TAGS.app + '納品書の写真（アプリ）では ' + Number(want).toLocaleString() + '円です（' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d') + ' 自動確認）。\nどちらが正しいか、ご確認ください。総括表の数字が正しければ、このままで大丈夫です。';
      if (String(notes[rr][cc] || '') !== txt) sh.getRange(rr + 1, cc + 1).setNote(txt);
    }
    if (書き込む) 記録.push([new Date(), store, e.date, itemName, book.name, String(day), a1, cur, want, 済, 'アプリ日報（納品書）']);
  });
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
  if (data.enable === true || data.enable === false) {                   // 自動の入／切をコードから（設定画面を使わない）
    PropertiesService.getScriptProperties().setProperty('SKWB_ENABLED', data.enable ? 'true' : 'false');
    return { ok: true, SKWB_ENABLED: getSetting_('SKWB_ENABLED', false) };
  }
  if (data.app === true || data.app === false) {                         // アプリ分の入／切
    PropertiesService.getScriptProperties().setProperty('SKWB_APP', data.app ? 'true' : 'false');
    return { ok: true, SKWB_APP: getSetting_('SKWB_APP', true) };
  }
  var only = Array.isArray(data.stores) ? data.stores.map(String) : null;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return { ok: true, result: skwb_実行_(data.write === true, Number(data.days) || 40, only) }; }
  finally { lock.releaseLock(); }
}
