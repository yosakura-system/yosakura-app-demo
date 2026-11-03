/**
 * 世桜アプリ｜山盛さんの「世桜 FC Management」へ入れる月次実績CSVを書き出す（集約スプシ＋加盟店PL → Drive の CSV）
 * Code.gs・集約スプシ書き出し.gs・総括表_月次PL.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか（2026-10-20 山盛さん「自動で分かる数値は全部自動で」→ 2026-11-02 神田さん「正体は Web アプリ FC Management」）
 *   FC Management の本部入力にある「CSVインポート」の雛形と同じ列で、1店×1か月＝1行の CSV を Drive に出す。
 *   神田さんは月1回、本部入力 →「CSVを選択」でこのファイルを選ぶだけ（1クリック）。
 *
 * ■ 雛形の列（2026-11-03 アプリの「テンプレート」から確認。文字コード UTF-8・BOMなし・改行 LF）
 *   店舗名,店舗コード,対象月,売上,客数,食材原価,人件費,稼働人時,諸経費,売上予算,客数予算,食材原価予算,人件費予算,諸経費予算
 *   対象月＝「2026年9月」の形。空欄の列は取り込んでも更新されない＝分からない値は空欄のまま出す。
 *   ⚠️ 取り込んだ実績は「未照合」に戻る＝照合が済んだ月を出し直さないよう、既定は前月の1か月分だけ。
 *
 * ■ 数字の出どころ
 *   売上     ＝集約スプシ『月次PL』純売上(税抜)。空なら加盟店PLの店舗売上(税抜)
 *   客数     ＝『月次PL』客数
 *   食材原価 ＝『月次PL』期首棚卸＋当月仕入−期末棚卸（仕入が空なら売上原価の欄）。棚卸が0の店は仕入額のまま＝ログに△
 *   人件費   ＝★加盟店PL（★新 加盟店PL_<店>_<年>『年間収支』）の 人件費(社員)＋人件費(アルバイト)＋法定福利費（神田さん 2026-11-03「人件費はPLの数値を」）
 *             PLがまだ入っていない月（3つとも空か0）は総括表の人件費で代用＝ログに△
 *   諸経費   ＝加盟店PLの 販売管理費 − 人件費(社員＋アルバイト＋法定福利)【整理】家賃・ロイヤリティ等を含む。山盛さんの定義が違えばここを直す
 *   稼働人時 ＝『総括表_日別』総労働時間 の月合計（アプリの日報・総括表取込の勤怠欄）。1日も無い店は空欄
 *   各予算   ＝空欄（予算は本部の手入力）
 *   海外2店（ファンケビン・ホーチミン）＝データが無いので出さない
 *   国籍別   ＝別ファイル「FC Management_国籍別_YYYY-MM.csv」（店舗名,店舗コード,対象月,区分,組数,人数＝『総括表_国別内訳』の月合計）。
 *             ⚠️ FC Management の国籍別は現場入力のみで本部側に取込口が無い（2026-11-03 確認）＝取込口ができるまでは参考ファイル
 *
 * ■ 置き場所
 *   Script Properties FCM_FOLDER_ID のフォルダ。無ければ集約スプシと同じ場所に「世桜FC Management_取込CSV」を作って ID を控える。
 *   ファイル名「FC Management_実績_2026-09.csv」＝同じ月は同じ名前で置き換える（古いものはゴミ箱へ）。
 *   加盟店PLの場所＝題名「加盟店PL」＋店の言葉＋年で Drive を検索（★新 を優先）。固定したいときは Script Properties FCM_PL_IDS に {"牛カツ世桜 長堀橋店":"<ID>",…}
 *
 * ■ 手で動かす
 *   FCM_下見()                 … 前月分の中身をログに出すだけ（書き込みなし）
 *   FCM_CSV書き出し()           … 前月分の CSV を Drive に出す
 *   FCM_CSV書き出し_月指定()    … 中の ym を直して実行（例 '2026-09'）
 *   ensureFcmTrigger()         … 毎月5日 7時の自動実行を登録（関数名は fcmMonthlyExport）
 */
var FCM_FOLDER_PROP = 'FCM_FOLDER_ID';
var FCM_PL_PROP = 'FCM_PL_IDS';
var FCM_FOLDER_NAME = '世桜FC Management_取込CSV';
var FCM_HEADER = ['店舗名', '店舗コード', '対象月', '売上', '客数', '食材原価', '人件費', '稼働人時', '諸経費', '売上予算', '客数予算', '食材原価予算', '人件費予算', '諸経費予算'];
var FCM_CTY_HEADER = ['店舗名', '店舗コード', '対象月', '区分', '組数', '人数'];
/* アプリの店舗名 → FC Management の店舗名・店舗コード（2026-11-03 雛形の並び）・加盟店PLの題名に含まれる言葉 */
var FCM_STORES = [
  ['日本料理世桜本店',      '日本料理世桜',          'ST001', ['日本料理', '本店']],
  ['牛カツ世桜 長堀橋店',   '牛カツ世桜 長堀橋店',   'ST002', ['牛カツ', '長堀橋']],
  ['寿司世桜 心斎橋店',     '寿司世桜 心斎橋店',     'ST003', ['心斎橋']],
  ['日本鰻世桜 長堀橋店',   '日本鰻世桜 長堀橋店',   'ST004', ['鰻', '長堀橋']],
  ['手巻き寿司世桜 難波店', '手巻き寿司世桜 難波店', 'ST005', ['難波']],
  ['牛カツ世桜 富士山店',   '牛カツ世桜 富士山店',   'ST006', ['牛カツ', '富士山']],
  ['日本鰻世桜 富士山店',   '日本鰻世桜 富士山店',   'ST007', ['鰻', '富士山']],
  ['日本鰻世桜 京都祇園店', '日本鰻世桜 京都祇園店', 'ST008', ['祇園']],
  ['日本鰻世桜 浅草橋店',   '日本鰻世桜 浅草橋店',   'ST009', ['浅草橋']],
  ['和牛世桜 広島店',       '和牛世桜 広島店',       'ST010', ['広島']]
];

/* ---------- 入口 ---------- */
function FCM_下見() { return fcm_実行_(false, fcm_前月_()); }
function FCM_CSV書き出し() { return fcm_実行_(true, fcm_前月_()); }
function FCM_CSV書き出し_月指定() { var ym = '2026-09'; return fcm_実行_(true, ym); }   // ← ここを直して実行
function fcmMonthlyExport() { return fcm_実行_(true, fcm_前月_()); }                   // トリガー用（ローマ字名）
function ensureFcmTrigger() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'fcmMonthlyExport'; });
  if (!has) ScriptApp.newTrigger('fcmMonthlyExport').timeBased().onMonthDay(5).atHour(7).create();
  Logger.log('毎月5日 7時に fcmMonthlyExport を実行' + (has ? '（登録済み）' : '（登録した）'));
}

/* ---------- 小道具 ---------- */
function fcm_前月_() {
  var now = new Date(); var d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM');
}
function fcm_ym_(v) {   // セルの年月（Date でも文字でも）→ 'yyyy-MM'
  if (v && v.getTime) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM');
  var m = String(v || '').match(/^(\d{4})[-/年]?(\d{1,2})/); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
}
function fcm_num_(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(/[,¥￥\s]/g, '')); return isNaN(n) ? null : n; }
function fcm_月表記_(ym) { return Number(ym.slice(0, 4)) + '年' + Number(ym.slice(5, 7)) + '月'; }
function fcm_str_(v) { return String(v == null ? '' : v).replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')'); }

/* ---------- 加盟店PL（年間収支タブ）を読む：店×年 → {name, labor[12], other[12], sales[12]}（月は 0 始まり） ---------- */
function fcm_PLファイル_(st, year) {
  var fixed = {}; try { fixed = JSON.parse(getSetting_(FCM_PL_PROP, '{}') || '{}'); } catch (e) { fixed = {}; }
  if (fixed[st[0]]) { try { return DriveApp.getFileById(fixed[st[0]]); } catch (e) { Logger.log('FCM_PL_IDS の ID が開けない：' + st[0]); } }
  var it = DriveApp.searchFiles("title contains '加盟店PL' and title contains '" + year + "' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  var cands = [];
  while (it.hasNext()) {
    var f = it.next(); var t = f.getName();
    if (!st[3].every(function (k) { return t.indexOf(k) !== -1; })) continue;
    if (/検証|旧|修正版|コピー/.test(t)) continue;
    var rank = t.indexOf('★新') === 0 ? 2 : t.indexOf('【新】') === 0 ? 1 : 0;
    cands.push({ f: f, rank: rank, m: f.getLastUpdated().getTime() });
  }
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.rank - a.rank || b.m - a.m; });
  return cands[0].f;
}
function fcm_PL_(st, year) {
  var f = fcm_PLファイル_(st, year); if (!f) return { name: null, labor: [], other: [], sales: [] };
  var ss = SpreadsheetApp.openById(f.getId());
  var sh = null;
  ss.getSheets().forEach(function (s) { var n = s.getName(); if (!sh && n.indexOf('年間収支') !== -1 && n.indexOf('率') === -1) sh = s; });
  if (!sh) return { name: f.getName() + '（年間収支タブなし）', labor: [], other: [], sales: [] };
  var v = sh.getRange(1, 1, Math.min(sh.getLastRow(), 80), Math.min(sh.getLastColumn(), 20)).getValues();
  // 月の見出し行＝「1月」〜「12月」が並ぶ行
  var mcol = {}, hdr = -1;
  for (var i = 0; i < v.length && hdr < 0; i++) {
    var cols = {}; var n = 0;
    for (var j = 0; j < v[i].length; j++) { var m = fcm_str_(v[i][j]).match(/^(\d{1,2})月$/); if (m) { cols[Number(m[1]) - 1] = j; n++; } }
    if (n >= 10) { mcol = cols; hdr = i; }
  }
  if (hdr < 0) return { name: f.getName() + '（月の見出しなし）', labor: [], other: [], sales: [] };
  var row = function (re) { for (var i = hdr + 1; i < v.length; i++) for (var j = 0; j < 4; j++) if (re.test(fcm_str_(v[i][j]))) return v[i]; return null; };
  var rEmp = row(/^人件費\(社員\)$/), rPart = row(/^人件費\(アルバイト\)$/), rWel = row(/^法定福利費$/), rSga = row(/^販売管理費$/), rSales = row(/^店舗売上\(税抜\)$/);
  var out = { name: f.getName(), labor: [], other: [], sales: [] };
  for (var mo = 0; mo < 12; mo++) {
    var c = mcol[mo]; if (c == null) continue;
    var g = function (r) { return r ? fcm_num_(r[c]) : null; };
    var e = g(rEmp), p = g(rPart), w = g(rWel), sga = g(rSga), s = g(rSales);
    var lab = (e == null && p == null && w == null) ? null : (e || 0) + (p || 0) + (w || 0);
    out.labor[mo] = lab; out.sales[mo] = s;
    out.other[mo] = (sga != null && sga !== 0) ? sga - (lab || 0) : null;
  }
  return out;
}

/* ---------- 本体 ---------- */
function fcm_実行_(書き込む, ym) {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('ym は 2026-09 の形で：' + ym);
  var year = ym.slice(0, 4), mo = Number(ym.slice(5, 7)) - 1;
  var ss = aggSs_();
  // --- 『月次PL』＝売上・客数・原価（・人件費の代用） ---
  var pl = ss.getSheetByName(PL_TAB); if (!pl) throw new Error('集約スプシに『' + PL_TAB + '』タブがありません（総括表_月次PLを書く を先に）');
  var pv = pl.getDataRange().getValues(); var ph = {}; pv[0].forEach(function (h, i) { ph[h] = i; });
  var need = ['店舗', '年月', '純売上(税抜)', '客数', '売上原価', '人件費', '期首棚卸', '当月仕入', '期末棚卸'];
  need.forEach(function (h) { if (ph[h] == null) throw new Error('『月次PL』に列がありません：' + h); });
  var byStore = {};
  for (var i = 1; i < pv.length; i++) { var r = pv[i]; if (fcm_ym_(r[ph['年月']]) === ym) byStore[String(r[ph['店舗']])] = r; }
  // --- 『総括表_日別』＝総労働時間の月合計 ---
  var hours = {}, hdays = {};
  var dsh = ss.getSheetByName('総括表_日別');
  if (dsh) {
    var dv = dsh.getDataRange().getValues(); var dh = {}; dv[0].forEach(function (h, i) { dh[h] = i; });
    if (dh['総労働時間'] != null) {
      for (var j = 1; j < dv.length; j++) {
        var d = dv[j]; if (fcm_ym_(d[dh['日付']]) !== ym) continue;
        var hv = fcm_num_(d[dh['総労働時間']]); if (hv == null) continue;
        var st = String(d[dh['店舗']]); hours[st] = (hours[st] || 0) + hv; hdays[st] = (hdays[st] || 0) + 1;
      }
    }
  }
  // --- 『総括表_国別内訳』＝国籍別の月合計（組数・人数） ---
  var cty = {};   // store -> 区分 -> {g, p}
  var csh = ss.getSheetByName('総括表_国別内訳');
  if (csh) {
    var cv = csh.getDataRange().getValues(); var ch = {}; cv[0].forEach(function (h, i) { ch[h] = i; });
    for (var k = 1; k < cv.length; k++) {
      var c = cv[k]; if (fcm_ym_(c[ch['日付']]) !== ym) continue;
      var cs = String(c[ch['店舗']]), kb = String(c[ch['区分']] || ''); if (!kb) continue;
      cty[cs] = cty[cs] || {}; cty[cs][kb] = cty[cs][kb] || { g: 0, p: 0 };
      cty[cs][kb].g += fcm_num_(c[ch['組数']]) || 0; cty[cs][kb].p += fcm_num_(c[ch['人数']]) || 0;
    }
  }
  // --- 行を組む ---
  var rows = [], ctyRows = [], notes = [];
  var v = function (x) { return x == null ? '' : String(Math.round(x)); };
  FCM_STORES.forEach(function (s) {
    var app = s[0], name = s[1], code = s[2]; var r = byStore[app]; var w = [];
    var net = null, guests = null, cogs = null, laborSk = null;
    if (r) {
      net = fcm_num_(r[ph['純売上(税抜)']]); guests = fcm_num_(r[ph['客数']]); laborSk = fcm_num_(r[ph['人件費']]);
      var i0 = fcm_num_(r[ph['期首棚卸']]), buy = fcm_num_(r[ph['当月仕入']]), i1 = fcm_num_(r[ph['期末棚卸']]);
      if (buy != null) { cogs = (i0 || 0) + buy - (i1 || 0); if (!(i0 || 0) && !(i1 || 0)) w.push('棚卸0＝原価は仕入額のまま'); }
      else cogs = fcm_num_(r[ph['売上原価']]);
    } else w.push('月次PLにこの月の行が無い');
    // 加盟店PL＝人件費・諸経費（・売上の代用）
    var plv = fcm_PL_(s, year); var labor = null, other = null;
    if (!plv.name) w.push('加盟店PLが見つからない');
    else if (!plv.labor.length) w.push(plv.name);
    else {
      labor = plv.labor[mo]; other = plv.other[mo];
      if (net == null && plv.sales[mo]) { net = plv.sales[mo]; w.push('売上は加盟店PL'); }
    }
    if (labor == null || labor === 0) { if (laborSk != null) { labor = laborSk; w.push('加盟店PLの人件費が未入力→総括表'); } else { labor = null; w.push('人件費なし'); } }
    if (net == null) w.push('売上なし');
    var hh = hours[app] != null ? Math.round(hours[app] * 10) / 10 : null;
    if (hh == null) w.push('総労働時間なし'); else if (hdays[app] < 20) w.push('総労働時間は' + hdays[app] + '日分だけ');
    rows.push([name, code, fcm_月表記_(ym), v(net), v(guests), v(cogs), v(labor), hh == null ? '' : String(hh), v(other), '', '', '', '', '']);
    notes.push((w.length ? '△ ' : '○ ') + name + '：売上 ' + v(net) + '／客数 ' + v(guests) + '／原価 ' + v(cogs) + '／人件費 ' + v(labor) + '／人時 ' + (hh == null ? '' : hh) + '／諸経費 ' + v(other) + (w.length ? '　' + w.join('・') : '') + (plv.name ? '　PL=' + plv.name : ''));
    var cm = cty[app] || {};
    Object.keys(cm).sort().forEach(function (kb) { ctyRows.push([name, code, fcm_月表記_(ym), (typeof AGG_CTY === 'object' && AGG_CTY[kb]) || kb, String(cm[kb].g), String(cm[kb].p)]); });
  });
  var csv = [FCM_HEADER].concat(rows).map(function (r) { return r.join(','); }).join('\n') + '\n';
  var csvCty = [FCM_CTY_HEADER].concat(ctyRows).map(function (r) { return r.join(','); }).join('\n') + '\n';
  Logger.log('対象月 ' + ym + '（' + fcm_月表記_(ym) + '）' + rows.length + '店・国籍別 ' + ctyRows.length + '行\n' + notes.join('\n'));
  Logger.log('----- 実績CSV -----\n' + csv);
  if (!書き込む) { Logger.log('書き込みはしていません（下見）'); return csv; }
  // --- Drive へ（同じ名前は置き換え） ---
  var folder = fcm_フォルダ_(ss);
  var put = function (fname, text) {
    var old = folder.getFilesByName(fname); while (old.hasNext()) old.next().setTrashed(true);
    return folder.createFile(Utilities.newBlob(text, 'text/csv', fname));   // UTF-8・BOMなし（雛形と同じ）
  };
  var f1 = put('FC Management_実績_' + ym + '.csv', csv);
  var f2 = put('FC Management_国籍別_' + ym + '.csv', csvCty);
  Logger.log('書き出し：' + f1.getName() + '\n' + f1.getUrl() + '\n→ FC Management の 本部入力 →「CSVを選択」でこのファイルを選ぶ\n国籍別（参考）：' + f2.getUrl());
  return f1.getUrl();
}

function fcm_フォルダ_(ss) {
  var sp = PropertiesService.getScriptProperties(); var id = sp.getProperty(FCM_FOLDER_PROP);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 消されていたら作り直す */ } }
  var parent = null; try { var ps = DriveApp.getFileById(ss.getId()).getParents(); if (ps.hasNext()) parent = ps.next(); } catch (e) { }
  var folder = parent ? parent.createFolder(FCM_FOLDER_NAME) : DriveApp.createFolder(FCM_FOLDER_NAME);
  sp.setProperty(FCM_FOLDER_PROP, folder.getId());
  Logger.log('フォルダを作成：' + FCM_FOLDER_NAME + '（' + (parent ? '集約スプシと同じ場所' : 'マイドライブ直下') + '）');
  return folder;
}
