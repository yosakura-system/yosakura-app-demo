/**
 * 世桜アプリ｜総括表の「月次PL」を集約スプシへ書き出す（ドライブ → 集約データ）　v2（2026-09-22）
 * 総括表取り込み.gs・集約スプシ書き出し.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか
 *   各店フォルダの「総括表Ver.2.x_◯◯店（YYYYMM）」を全期間ぶん開き、【総括表】タブの月の締め数字を
 *   1店×1か月＝1行にして、集約スプシ「世桜アプリ_集約データ」のタブ『月次PL』へ書く。
 *   ⚠️ 日別タブは読まない（毎時の取込がやっている）。ここは「月の締め」だけ。
 *
 * ■ 決めごと
 *   ・★総括表は読むだけ。1文字も書き込まない
 *   ・セルの位置は決め打ちしない。「当月実績」の見出し列と、行のラベル文字で探す
 *   ・★ラベルが複数ある項目（人件費・計）は「ブロックの並び順」で特定する
 *     （現金売上 → カード売上 → 計 → 純売上 → 売上原価 → 人件費 → 計 → 管理可能利益 の順で上から並ぶ）
 *   ・一度読んだファイルは更新日時を控え、変わっていなければ読み直さない（6分の上限を避ける）
 *   ・棚卸が0のままの月は「原価率」でなく「仕入率」の意味＝列を分けて出す
 *   ・書いたあとは 総括表_月次PL_点検() で恒等式（売上＝現金＋カード など）を全行検算する
 *
 * ■ 使い方（順番に）
 *   1. 総括表_月次PL_下見()   … 何店×何か月あるかをログに出す（書き込みなし）
 *   2. 総括表_月次PLを書く()   … 『月次PL』タブへ書く（初回は数分。時間切れならもう1回）
 *   3. 総括表_月次PL_点検()   … 恒等式で検算。「不一致 0件」になるまで見る
 *   4. ensurePlTrigger()      … 毎朝6:20の自動実行（importMonthlyPl で登録）
 */
var PL_TAB = '月次PL';
var PL_CACHE = 'PL_CACHE_V3';   // ★読み方を変えたら末尾の番号を上げる（控えを捨てて全部読み直す）
var PL_HEADER = ['店舗', '年月', '現金売上', 'カード売上', '売上計', '純売上(税抜)', '客数', '客単価',
  '売上原価', '原価率(棚卸込み)%', '仕入率%', '人件費', '人件費率%', '管理可能利益', '管理可能利益率%',
  '期首棚卸', '当月仕入', '期末棚卸', '昼のみ売上', '口コミ件数(月間)', 'チップ総額', '鰻尾数', '月総日数', '稼働日数', '総括表の版', 'ファイル', '読んだ日時'];
var PL_PCT_COLS = [10, 11, 13, 15];                  // 1始まり：% の列
var PL_YEN_COLS = [3, 4, 5, 6, 8, 9, 12, 14, 16, 17, 18, 19, 21];   // ¥ の列（aggWrite_ の自動判定を上書き）

function 総括表_月次PL_下見() {
  var list = sk_設定_(); var n = 0;
  list.forEach(function (s) {
    var books = pl_重複を除く_(sk_対象ブック_全期間_(s.folder));
    Logger.log(s.store + '：' + books.list.length + 'か月（' + books.list.map(function (b) { return b.ym; }).join(' ') + '）'
      + (books.dup.length ? '　⚠️同じ月のファイルが複数：' + books.dup.join(' / ') : ''));
    n += books.list.length;
  });
  Logger.log('合計 ' + n + ' ファイル。書き込みはしていません');
}

function 総括表_月次PLを書く() {
  var list = sk_設定_();
  var cache = pl_cache_(); var rows = []; var t0 = Date.now(); var read = 0, skipped = 0, left = 0;
  list.forEach(function (s) {
    pl_重複を除く_(sk_対象ブック_全期間_(s.folder)).list.forEach(function (b) {
      var f = DriveApp.getFileById(b.id); var m = f.getLastUpdated().getTime();
      var c = cache[b.id];
      if (c && c.m === m && c.row) { rows.push(c.row); skipped++; return; }
      if (Date.now() - t0 > 4.5 * 60 * 1000) { left++; if (c && c.row) rows.push(c.row); return; }
      var row = pl_1冊を読む_(s.store, b);
      if (row) { rows.push(row); cache[b.id] = { m: m, row: row }; read++; }
    });
  });
  pl_cacheSave_(cache);
  rows.sort(function (a, b) { return a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1); });
  var ss = aggSs_();
  aggWrite_(ss, PL_TAB, PL_HEADER, rows);
  var shPL = ss.getSheetByName(PL_TAB);
  if (rows.length) shPL.getRange(2, 2, rows.length, 1).setNumberFormat('@').setValues(rows.map(function (r) { return [String(r[1])]; }));   // ★年月を文字のまま（日付に化けさせない）
  pl_書式_(shPL, rows.length);
  Logger.log('月次PL：' + rows.length + '行（新規に読んだ ' + read + '／控えを使った ' + skipped + '／時間切れで次回 ' + left + '）'
    + (left ? '　→ もう1回「総括表_月次PLを書く」を実行してください' : ''));
}

/* ¥と%の書式を明示する（aggWrite_ は列名の言葉で判定するため「仕入率%」まで¥になる） */
function pl_書式_(sh, n) {
  if (!sh || n < 1) return;
  PL_PCT_COLS.forEach(function (c) { sh.getRange(2, c, n, 1).setNumberFormat('0.0"%"'); });
  PL_YEN_COLS.forEach(function (c) { sh.getRange(2, c, n, 1).setNumberFormat('¥#,##0'); });
  sh.getRange(2, 7, n, 1).setNumberFormat('#,##0');        // 客数
  sh.getRange(2, 20, n, 1).setNumberFormat('#,##0');       // 口コミ
  sh.getRange(2, 22, n, 1).setNumberFormat('#,##0');       // 鰻尾数
}

/* ★トリガー用のローマ字の別名。日本語の関数名でトリガーを作ると「不明なエラー」になることがある */
function importMonthlyPl() { return 総括表_月次PLを書く(); }
function ensurePlTrigger() {
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    var fn = t.getHandlerFunction(); return fn === 'importMonthlyPl' || fn === '総括表_月次PLを書く';
  });
  if (!has) ScriptApp.newTrigger('importMonthlyPl').timeBased().everyDays(1).atHour(6).nearMinute(20).create();
  Logger.log(has ? '設定済み' : '毎朝6:20に設定しました（importMonthlyPl）');
}

/* 同じ（YYYYMM）のファイルが複数あるときは、更新日時がいちばん新しい1冊だけ残す */
function pl_重複を除く_(books) {
  var byYm = {}, dup = [];
  books.forEach(function (b) {
    var cur = byYm[b.ym];
    if (!cur) { byYm[b.ym] = b; return; }
    if (dup.indexOf(b.ym) < 0) dup.push(b.ym);
    var t = function (x) { try { return DriveApp.getFileById(x.id).getLastUpdated().getTime(); } catch (e) { return 0; } };
    if (t(b) > t(cur)) byYm[b.ym] = b;
  });
  return { list: Object.keys(byYm).sort().map(function (k) { return byYm[k]; }), dup: dup };
}
function pl_cache_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(PL_CACHE) || '{}'); } catch (e) { return {}; } }
function pl_cacheSave_(c) {
  var s = JSON.stringify(c);
  if (s.length > 400000) { s = '{}'; }
  PropertiesService.getScriptProperties().setProperty(PL_CACHE, s);
}
/* 数字にする。sk_num_ に加えて「675名」「25尾」「59件」も拾う。％は拾わない（率の列を値と取り違えないため） */
function pl_num_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v);
  if (/[%％]/.test(s)) return null;
  return sk_num_(s.replace(/[名人件尾回]/g, ''));
}

/* 1冊（1店×1か月）を読んで1行にする。見つからない項目は空。読めない冊は null */
function pl_1冊を読む_(store, b) {
  var ss; try { ss = SpreadsheetApp.openById(b.id); } catch (e) { Logger.log('開けない：' + b.name); return null; }
  var ym = b.ym.slice(0, 4) + '-' + b.ym.slice(4, 6);
  var verM = b.name.match(/Ver\.?\s*([\d.]+)/i); var ver = verM ? verM[1] : '';
  var str = function (v) { return String(v == null ? '' : v).replace(/\s/g, ''); };
  var num = pl_num_;
  // --- 【総括表】タブ＝上6行に《総括表》がある最初のシート ---
  var sv = null;
  ss.getSheets().some(function (sh) {
    var r = Math.min(sh.getLastRow(), 80), c = Math.min(sh.getLastColumn(), 26); if (r < 5 || c < 5) return false;
    var v = sh.getRange(1, 1, r, c).getValues();
    for (var i = 0; i < Math.min(r, 6); i++) for (var j = 0; j < c; j++) if (str(v[i][j]).indexOf('《総括表》') !== -1) { sv = v; return true; }
    return false;
  });
  if (!sv) { Logger.log('《総括表》タブなし：' + b.name); return null; }
  var R = sv.length, C = sv[0].length;
  // ラベル探し：fromRow 以降・toRow 未満で最初に一致する行
  var findRow = function (re, fromRow, toRow) {
    for (var i = fromRow || 0; i < (toRow == null ? R : toRow); i++) for (var j = 0; j < C; j++) if (re.test(str(sv[i][j]))) return { r: i, c: j };
    return null;
  };
  var right = function (p) { if (!p) return null; for (var j = p.c + 1; j < C; j++) { var x = num(sv[p.r][j]); if (x != null) return x; } return null; };
  var last = function (p) { if (!p) return null; var out = null; for (var j = p.c + 1; j < C; j++) { var x = num(sv[p.r][j]); if (x != null) out = x; } return out; };
  var below = function (p, dr) { if (!p) return null; for (var i = p.r + 1; i <= Math.min(R - 1, p.r + (dr || 3)); i++) for (var j = p.c; j < Math.min(C, p.c + 3); j++) { var x = num(sv[i][j]); if (x != null) return x; } return null; };
  // 「当月実績」の見出し列（無い版は「実績」で探す）
  var hdr = findRow(/^当月実績$/) || findRow(/実績/); var col実績 = hdr ? hdr.c : -1;
  var at = function (p) { if (!p) return null; if (col実績 >= 0) { var x = num(sv[p.r][col実績]); if (x != null) return x; } return right(p); };
  // ★ブロックの並び順で特定（上から：現金売上 → カード売上 → 計 → 純売上 → 売上原価 → 人件費 → 計 → 管理可能利益）
  var pCash = findRow(/^現金売上$/);
  var pCard = findRow(/^カード売上$/, pCash ? pCash.r : 0);
  var pSum = findRow(/^計$/, pCard ? pCard.r + 1 : 0);
  var pNet = findRow(/^純売上/, pSum ? pSum.r : 0);
  var pCogs = findRow(/^売上原価$/, pNet ? pNet.r : 0);
  var pProfit = findRow(/^管理可能利益$/, pCogs ? pCogs.r : 0);
  var pLabor = findRow(/^人件費$/, pCogs ? pCogs.r + 1 : 0, pProfit ? pProfit.r : null);   // ★原価と利益の間にある「人件費」だけ
  var o = {};
  o.cash = at(pCash); o.card = at(pCard); o.sales = at(pSum); o.net = at(pNet);
  o.cogs = at(pCogs); o.labor = at(pLabor); o.profit = at(pProfit);
  if (o.sales == null && o.cash != null) o.sales = (o.cash || 0) + (o.card || 0);
  o.guests = right(findRow(/^客数[:：]?$/)); o.unit = right(findRow(/^客単価[:：]?$/));
  // ★棚卸・仕入の行＝見出し行（フード｜ドリンク｜合計）の列位置で読む。合計が空ならフード＋ドリンクを足す
  var sumRow = function (p) {
    if (!p) return null;
    var cF = -1, cD = -1, cT = -1;
    for (var up = 1; up <= 6 && p.r - up >= 0; up++) {
      var hr = sv[p.r - up]; var f = -1, d = -1, t = -1;
      for (var j = 0; j < C; j++) { var h = str(hr[j]); if (h === 'フード') f = j; else if (h === 'ドリンク') d = j; else if (h === '合計') t = j; }
      if (f >= 0 && d >= 0) { cF = f; cD = d; cT = t; break; }
    }
    var tot = cT >= 0 ? num(sv[p.r][cT]) : null; if (tot != null) return tot;
    if (cF >= 0) { var a = num(sv[p.r][cF]), b2 = num(sv[p.r][cD]); if (a != null || b2 != null) return (a || 0) + (b2 || 0); }
    return last(p);
  };
  o.inv0 = sumRow(findRow(/^期首棚卸高$/)); o.buy = sumRow(findRow(/^当月仕入高$/)); o.inv1 = sumRow(findRow(/^期末棚卸高$/));
  o.review = below(findRow(/累計口コミ獲得数/), 4); o.tip = below(findRow(/^◎チップ$/), 3); o.eel = below(findRow(/鰻使用尾数/), 4);
  // --- 【売上台帳】タブ＝昼のみ売上の合計・月総日数・稼働日数 ---
  ss.getSheets().some(function (sh) {
    var r = Math.min(sh.getLastRow(), 50), c = Math.min(sh.getLastColumn(), 30); if (r < 5 || c < 5) return false;
    var v = sh.getRange(1, 1, r, c).getValues(); var isLedger = false, c昼 = -1, rTot = -1;
    for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) {
      var s = str(v[i][j]);
      if (s.indexOf('売上台帳') === 0) isLedger = true;
      if (s === '昼のみ売上') c昼 = j;
      if (s === '合計' && j <= 1 && rTot < 0) rTot = i;
      if (s === '月総日数' && i + 1 < r) { o.days = num(v[i + 1][j]); if (j + 1 < c) o.open = num(v[i + 1][j + 1]); }
    }
    if (!isLedger) return false;
    if (c昼 >= 0 && rTot >= 0) o.lunch = num(v[rTot][c昼]);
    return true;
  });
  var pct = function (a, b) { return (a != null && b) ? Math.round(a / b * 1000) / 10 : ''; };
  var cogsInv = (o.buy != null) ? (o.inv0 || 0) + o.buy - (o.inv1 || 0) : null;
  var v = function (x) { return x == null ? '' : x; };
  return [store, ym, v(o.cash), v(o.card), v(o.sales), v(o.net), v(o.guests), v(o.unit),
    v(o.cogs), pct(cogsInv, o.sales), pct(o.buy, o.sales), v(o.labor), pct(o.labor, o.sales), v(o.profit), pct(o.profit, o.sales),
    v(o.inv0), v(o.buy), v(o.inv1), v(o.lunch), v(o.review), v(o.tip), v(o.eel), v(o.days), v(o.open), ver, b.name,
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')];
}

/* 点検＝『月次PL』の全行に恒等式を当てる。列を読み違えていれば必ずどれかが崩れる（書き込みなし） */
function 総括表_月次PL_点検() {
  var sh = aggSs_().getSheetByName(PL_TAB); if (!sh) { Logger.log('『月次PL』タブがありません'); return; }
  var vals = sh.getDataRange().getValues(); var H = vals[0]; var ix = {}; H.forEach(function (h, i) { ix[h] = i; });
  var g = function (row, name) { var x = row[ix[name]]; return (x === '' || x == null) ? null : Number(x); };
  var bad = 0, warn = 0, tot = 0;
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i]; tot++;
    var ymv = r[ix['年月']]; if (ymv && ymv.getTime) ymv = Utilities.formatDate(ymv, 'Asia/Tokyo', 'yyyy-MM');
    var tag = r[ix['店舗']] + ' ' + ymv + '（' + r[ix['総括表の版']] + '）';
    var sales = g(r, '売上計'), cash = g(r, '現金売上'), card = g(r, 'カード売上'), cogs = g(r, '売上原価'), labor = g(r, '人件費');
    var profit = g(r, '管理可能利益'), guests = g(r, '客数'), unit = g(r, '客単価'), i0 = g(r, '期首棚卸'), buy = g(r, '当月仕入'), i1 = g(r, '期末棚卸');
    var ng = [], wn = [];
    if (sales != null && cash != null && card != null && Math.abs(sales - (cash + card)) > 1) ng.push('売上≠現金＋カード');
    if (cogs != null && buy != null && Math.abs(cogs - ((i0 || 0) + buy - (i1 || 0))) > 1) {
      if (Math.abs(cogs - ((i0 || 0) + buy)) <= 1) wn.push('シートの売上原価が期末棚卸を引いていない（この版の計算式。原価率(棚卸込み)%の列を使う）');
      else ng.push('原価≠期首＋仕入−期末');
    }
    if (profit != null && sales != null && cogs != null && labor != null && Math.abs(profit - (sales - cogs - labor)) > 1) ng.push('利益≠売上−原価−人件費');
    if (unit != null && sales != null && guests && unit > 0 && Math.abs(unit - sales / guests) > 1) {
      var implied = Math.round(sales / unit);   // 客単価から逆算した客数
      if (Math.abs(implied - guests) / guests <= 0.1) wn.push('シート内で客数と客単価が食い違う（客単価から逆算すると客数 ' + implied + '人）');
      else ng.push('客単価≠売上÷客数');
    }
    if (!sales) wn.push('売上0（未記入の月）');
    if ((i0 || 0) === 0 && (i1 || 0) > 0) wn.push('期首棚卸が0で期末だけ入っている（原価が小さく出る）');
    if (labor == null) wn.push('人件費が空');
    if (g(r, '純売上(税抜)') == null) wn.push('純売上が空（古い版）');
    if (ng.length) { bad++; Logger.log('✖ ' + tag + '：' + ng.join('／')); }
    else if (wn.length) { warn++; Logger.log('△ ' + tag + '：' + wn.join('／')); }
  }
  Logger.log('点検 ' + tot + '行：不一致（読み違いの疑い）' + bad + '件／注意（データ側）' + warn + '件');
}

/* ✖が出た1冊の中身を覗く（書き込みなし）。例： 総括表_月次PL_レイアウト('寿司世桜 心斎橋店', '202603')
   【総括表】タブのうち、点検に使う項目のラベル行を「行番号：セルの並び」で全部ログに出す */
function 総括表_月次PL_レイアウト(store, ym) {
  var src = sk_設定_().filter(function (s) { return s.store === store; })[0]; if (!src) { Logger.log('店が設定にない：' + store); return; }
  var b = sk_対象ブック_全期間_(src.folder).filter(function (x) { return x.ym === ym; })[0]; if (!b) { Logger.log('その月のファイルがない：' + ym); return; }
  var ss = SpreadsheetApp.openById(b.id); Logger.log(b.name);
  var str = function (v) { return String(v == null ? '' : v).replace(/\s/g, ''); };
  ss.getSheets().forEach(function (sh) {
    var r = Math.min(sh.getLastRow(), 80), c = Math.min(sh.getLastColumn(), 26); if (r < 5 || c < 5) return;
    var v = sh.getRange(1, 1, r, c).getDisplayValues(); var hit = false;
    for (var i = 0; i < Math.min(r, 6) && !hit; i++) for (var j = 0; j < c; j++) if (str(v[i][j]).indexOf('《総括表》') !== -1) hit = true;
    if (!hit) return;
    Logger.log('--- 【総括表】タブ ' + sh.getName() + '（' + r + '行×' + c + '列）---');
    var want = /^(予算|当月実績|現金売上|カード売上|計|純売上|売上原価|人件費|管理可能利益|期首棚卸高|当月仕入高|期末棚卸高|客数[:：]?|客単価[:：]?)/;
    for (var i2 = 0; i2 < r; i2++) {
      var lab = v[i2].map(str).filter(function (x) { return want.test(x); });
      if (!lab.length) continue;
      Logger.log((i2 + 1) + '行目： ' + v[i2].map(function (x, j) { return x === '' ? '' : String.fromCharCode(65 + j) + '=' + x; }).filter(Boolean).join('  '));
    }
  });
}

/* エディタの「実行」は引数を渡せないため、✖が出た2冊ぶんを固定した入口 */
function 総括表_月次PL_レイアウト_心斎橋3月() { 総括表_月次PL_レイアウト('寿司世桜 心斎橋店', '202603'); }
function 総括表_月次PL_レイアウト_長堀橋7月() { 総括表_月次PL_レイアウト('牛カツ世桜 長堀橋店', '202607'); }
