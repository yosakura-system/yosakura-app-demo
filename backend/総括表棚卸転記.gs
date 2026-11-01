/**
 * 世桜アプリ｜月末棚卸の結果を総括表の「期末棚卸高」へ転記（本部データ → 各店の総括表）
 * Code.gs・総括表書き戻し.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか（2026-11-01 増田さん「アプリから総括表に結果を転記してほしい」＝神田さん経由。長田さん「総括表に反映されますか？」がきっかけ）
 *   アプリの月末棚卸（kind:'monthly' の closeDetail＝品目ごとの税抜金額）を、フード（t:'f'）とドリンク（t:'d'）に分けて足し、
 *   その月の総括表【総括表】タブの「期末棚卸高」の行（フード列・ドリンク列）へ書く。合計列は式（=SUM）のまま。
 *   翌月の総括表の「期首棚卸高（前月末在庫高）」は、Ver.3.0 では前月ファイルのURL（E6）から IMPORTRANGE で自動で入る＝式のまま触らない。
 *   式でなく空欄のときだけ（URL未設定・旧版）同じ値を書く。
 *
 * ■ 総括表Ver.3.0 の作り（2026-11-01 牛カツ富士山・牛カツ長堀橋の202610で確認）
 *   総括表!E31（フード）・F31（ドリンク）＝ =E68 / =F68 → 68行目＝「◎棚卸内訳」の合計 → 棚卸表紙 → 棚卸表（品目を手で打つ）。
 *   アプリで棚卸する店は棚卸表タブを使わないので、この式は 0 のまま＝期末棚卸高 0・原価率が仕入率のまま。
 *   ★神田さん決定（11/1）「総括表に記入することは今後ない＝アプリから反映」＝期末棚卸高のフード・ドリンクの2セルは、式（0のまま）をアプリの値で置き換える。
 *     総括表書き戻し.gs の決めごと「式には書かない」の例外＝この2セルだけ。置き換えたセルにはメモ【アプリ棚卸】を付けて分かるようにする。
 *   ・店が棚卸表タブに入力していて式が 0 でない月は上書きしない＝「ずれ」としてメモだけ（黙って消さない）
 *   ・店が手で数字を打っていて違う値なら上書きしない＝「ずれ」（前回こちらが書いた値のままなら書き直す）
 *   ・セルの位置は決め打ちしない。「期末棚卸高」「期首棚卸高」のラベルと、その上の「フード」「ドリンク」の見出しで探す
 *   ・書いた記録は「_総括表書き戻し」シートに残す（タブ＝「総括表」・日付＝月末）
 *
 * ■ 自動（2026-11-01 神田さん「今日明日も他の店舗も、アプリに入力されたら総括表に反映するように」）
 *   毎時の総括表取り込み（importSoukatsu）の最後に sktn_自動_() を呼ぶ。
 *   前回処理した時刻（Script Properties SKTN_LAST_TS）より新しく保存された棚卸だけを対象にする＝店がアプリで保存すると、1時間以内に総括表へ入る。
 *   対象は先月と今月の分だけ（古い月は手で 棚卸_総括表へ_書込_月指定）。
 *
 * ■ 手で動かす
 *   棚卸_総括表へ_下見()   … 書く予定の一覧だけ（書き込みなし）。対象＝今月と先月の全店
 *   棚卸_総括表へ_書込()   … 書き込み実行（今月と先月の全店）
 *   棚卸_総括表へ_書込_月指定('202610') … 月を指定
 */

var SKTN_TAG = '【アプリ棚卸】';
var SKTN_SRC = 'アプリ棚卸';
var SKTN_LAST_KEY = 'SKTN_LAST_TS';

/* 本部データの monthly 行から、店舗×月ごとの「最新の棚卸（closeDetail あり）」 {store|YYYY-MM: {store, ym, food, drink, close, by, ts, n}} */
function sktn_monthly_() {
  var sh = getSheet(); var last = sh.getLastRow(); var map = {};
  if (last < 2) return map;
  var vals = (typeof 数字_全値_ === 'function') ? 数字_全値_() : sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][2]) !== 'monthly') continue;
    var store = String(vals[i][3] || ''); var p = null;
    try { p = JSON.parse(vals[i][6] || '{}'); } catch (e) { continue; }
    if (!p || !p.ym || !Array.isArray(p.closeDetail) || !p.closeDetail.length) continue;
    var ts = Number(vals[i][1]) || 0; var k = store + '|' + p.ym;
    if (map[k] && map[k].ts > ts) continue;
    var food = 0, drink = 0;
    p.closeDetail.forEach(function (d) { var a = Number(d && d.a) || 0; if (d && d.t === 'd') drink += a; else food += a; });
    map[k] = { store: store, ym: p.ym, food: Math.round(food), drink: Math.round(drink), close: Math.round(food + drink), by: String(p.by || ''), ts: ts, n: p.closeDetail.length };
  }
  return map;
}

/* 総括表タブで「ラベルの行」と「フード／ドリンクの列」を探す。{r, cF, cD} か null */
function sktn_find_(vals, labelRe) {
  var R = vals.length, C = vals[0] ? vals[0].length : 0, hit = null;
  for (var r = 0; r < R && !hit; r++) for (var c = 0; c < Math.min(C, 5); c++) if (labelRe.test(String(vals[r][c] || '').trim())) { hit = { r: r, c: c }; break; }
  if (!hit) return null;
  for (var up = 1; up <= 6 && hit.r - up >= 0; up++) {
    var hr = vals[hit.r - up], f = -1, d = -1;
    for (var j = hit.c + 1; j < C; j++) { var h = String(hr[j] || '').trim(); if (h === 'フード') f = j; else if (h === 'ドリンク') d = j; }
    if (f >= 0 && d >= 0) return { r: hit.r, cF: f, cD: d };
  }
  return null;
}

function sktn_ymNext_(ym) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)); var d = new Date(y, m, 1); return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMM'); }
function sktn_recentMonths_() { var now = new Date(); var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); return [Utilities.formatDate(prev, 'Asia/Tokyo', 'yyyyMM'), Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMM')]; }

/* 本体。
   書き込む … false＝下見（書き込みなし）
   ymArg   … 'YYYYMM' を渡すとその月だけ。無ければ先月と今月
   sinceTs … 渡すと「この時刻より後にアプリで保存された棚卸」だけを対象にする（自動用） */
function sktn_実行_(書き込む, ymArg, sinceTs) {
  var 開始 = Date.now();
  var months = ymArg ? [String(ymArg)] : sktn_recentMonths_();
  var srcs = sk_設定_();
  var recs = sktn_monthly_();
  var logSh = skwb_logSheet_(); var 前回 = skwb_lastWritten_(logSh);
  var 今日 = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d');
  var 結果 = { 書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）', 対象月: months, 新しい分だけ: sinceTs != null, 書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [], 処理した: [], 最後のts: 0 };
  var 記録 = [];
  srcs.forEach(function (src) {
    var books = null;
    months.forEach(function (ym) {
      var rec = recs[src.store + '|' + ym.slice(0, 4) + '-' + ym.slice(4, 6)];
      if (!rec) return;                                                   // アプリの棚卸が無い月＝触らない
      if (sinceTs != null && !(rec.ts > sinceTs)) return;                 // 自動＝前回より新しい保存だけ
      if (!books) books = sk_対象ブック_全期間_(src.folder);
      var targets = [
        { ym: ym, label: '期末棚卸高', re: /^期末棚卸高/, allowFormulaZero: true },
        { ym: sktn_ymNext_(ym), label: '期首棚卸高', re: /^期首棚卸高/, allowFormulaZero: false }
      ];
      var ok = true;
      targets.forEach(function (tg) {
        var book = books.filter(function (b) { return b.ym === tg.ym; }).pop();
        if (!book) { 結果.止めた.push(src.store + ' ' + tg.ym + '：総括表が無い（' + tg.label + '）'); if (tg.label === '期末棚卸高') ok = false; return; }
        var ss = SpreadsheetApp.openById(book.id);
        var sh = ss.getSheetByName('総括表') || ss.getSheets()[0];
        var rng = sh.getRange(1, 1, Math.min(sh.getMaxRows(), 60), Math.min(sh.getMaxColumns(), 12));
        var vals = rng.getValues(), fmls = rng.getFormulas(), notes = rng.getNotes();
        var pos = sktn_find_(vals, tg.re);
        if (!pos) { 結果.止めた.push(src.store + ' ' + book.name + '：「' + tg.label + '」の行かフード／ドリンクの見出しが見つからない'); if (tg.label === '期末棚卸高') ok = false; return; }
        [['フード', pos.cF, rec.food], ['ドリンク', pos.cD, rec.drink]].forEach(function (x) {
          var colName = x[0], c = x[1], want = x[2];
          var a1 = skwb_a1_(pos.r, c); var cur = vals[pos.r][c]; var fml = fmls[pos.r][c];
          var key = book.name + '|総括表|' + a1;
          var row = { 店舗: src.store, 月: tg.ym, 項目: tg.label + '・' + colName, セル: '総括表!' + a1, いま: fml ? ('式 ' + fml + '（' + (cur === '' ? '空欄' : cur) + '）') : (cur === '' ? '（空欄）' : cur), 書く値: want, 出どころ: SKTN_SRC + '（' + rec.ym + '・' + rec.n + '品目・' + rec.by + '）' };
          var same = !fml && skwb_num_(cur) === want;
          var prevSame = 前回[key] != null && skwb_num_(前回[key]) === skwb_num_(cur) && !fml;
          var 済;
          if (fml) {
            /* 期首棚卸高＝総括表Ver.3.0 は =IF($E$6="",0,IMPORTRANGE($E$6,"総括表!E31")) で前月ファイル（E6のURL）から自動で入る＝式のままにする（11/1 下見で確認） */
            if (tg.label === '期首棚卸高') { row.結果 = '式（前月ファイルから自動で入る）＝触らない'; 結果.一覧.push(row); return; }
            if (tg.allowFormulaZero && (skwb_num_(cur) || 0) === 0) { row.結果 = '書く（0の式を置き換える）'; 結果.書く++; 済 = '書いた'; }
            else { row.結果 = 'ずれ（式が0でない＝棚卸表タブに入力あり・上書きしない）'; 結果.ずれ++; 済 = 'ずれ'; }
          } else if (cur === '' || cur == null || (tg.label === '期首棚卸高' && (skwb_num_(cur) || 0) === 0)) { row.結果 = '書く'; 結果.書く++; 済 = '書いた'; }
          else if (same) { row.結果 = '同じ'; 結果.同じ++; 結果.一覧.push(row); return; }
          else if (prevSame) { row.結果 = '書き直す'; 結果.書き直す++; 済 = '書き直した'; }
          else { row.結果 = 'ずれ（店の数字と違う・上書きしない）'; 結果.ずれ++; 済 = 'ずれ'; }
          結果.一覧.push(row);
          if (!書き込む) return;
          var cell = sh.getRange(pos.r + 1, c + 1);
          if (済 === 'ずれ') {
            var txt = SKTN_TAG + 'アプリの月末棚卸（' + rec.ym + '）では ' + colName + ' ' + want.toLocaleString() + '円（税抜）です（' + 今日 + ' 自動確認）。\nどちらが正しいか、ご確認ください。';
            if (String(notes[pos.r][c] || '') === txt) return;            // 同じメモが付いている＝前に知らせた分。記録は増やさない
            cell.setNote(txt);
          } else {
            cell.setValue(want);
            cell.setNote(SKTN_TAG + 'アプリの月末棚卸（' + rec.ym + '・' + rec.n + '品目・保存 ' + rec.by + '）の' + colName + '合計（税抜）。棚卸表タブは使っていません（' + 今日 + '）');
          }
          記録.push([new Date(), src.store, rec.ym + '-末', tg.label + '・' + colName, book.name, '総括表', a1, fml ? fml : cur, want, 済, SKTN_SRC]);
        });
      });
      if (ok) { 結果.処理した.push(src.store + ' ' + rec.ym); if (rec.ts > 結果.最後のts) 結果.最後のts = rec.ts; }
    });
  });
  if (記録.length) logSh.getRange(logSh.getLastRow() + 1, 1, 記録.length, 記録[0].length).setValues(記録);
  結果.所要秒 = Math.round((Date.now() - 開始) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}

/* 自動＝毎時の総括表取り込み（importSoukatsu）の最後から呼ばれる。前回より新しく保存された棚卸だけを総括表へ書き、処理した時刻を覚える */
function sktn_自動_() {
  var sp = PropertiesService.getScriptProperties();
  var last = Number(sp.getProperty(SKTN_LAST_KEY) || 0);
  var r = sktn_実行_(true, null, last);
  if (r && r.最後のts > last) sp.setProperty(SKTN_LAST_KEY, String(r.最後のts));
  return r;
}

function 棚卸_総括表へ_下見() { return sktn_実行_(false); }
function 棚卸_総括表へ_書込() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log('別の処理が実行中のため見送り'); return { 見送り: true }; }
  try { return sktn_実行_(true); } finally { lock.releaseLock(); }
}
function 棚卸_総括表へ_書込_月指定(ym) { return sktn_実行_(true, ym); }
