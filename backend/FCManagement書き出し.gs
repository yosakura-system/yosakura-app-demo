/**
 * 世桜アプリ｜山盛さんの「世桜 FC Management」へ入れる月次実績CSVを書き出す（集約スプシ → Drive の CSV）
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
 * ■ 数字の出どころ（すべて集約スプシ「世桜アプリ_集約データ」＝毎朝6:00〜6:20に自動更新）
 *   売上     ＝『月次PL』純売上(税抜)。空なら出さない（売上計は税込なので代用しない）
 *   客数     ＝『月次PL』客数
 *   食材原価 ＝『月次PL』期首棚卸＋当月仕入−期末棚卸（仕入が空なら売上原価の欄）。棚卸が0の店は仕入額のまま＝ログに△
 *   人件費   ＝『月次PL』人件費（総括表の人件費）
 *             【整理】加盟店PLの人件費（社員＋アルバイト＋法定福利）にするかは山盛さんに確認中。決まるまで総括表の値
 *   稼働人時 ＝『総括表_日別』総労働時間 の月合計（アプリの日報・総括表取込の勤怠欄）。1日も無い店は空欄
 *   諸経費・各予算＝空欄（自動で分かる出どころが無い＝加盟店PL・予算は手入力）
 *   海外2店（ファンケビン・ホーチミン）＝データが無いので出さない
 *
 * ■ 置き場所
 *   Script Properties FCM_FOLDER_ID のフォルダ。無ければ集約スプシと同じ場所に「世桜FC Management_取込CSV」を作って ID を控える。
 *   ファイル名「FC Management_実績_2026-09.csv」＝同じ月は同じ名前で置き換える（古いものはゴミ箱へ）。
 *
 * ■ 手で動かす
 *   FCM_下見()                 … 前月分の中身をログに出すだけ（書き込みなし）
 *   FCM_CSV書き出し()           … 前月分の CSV を Drive に出す
 *   FCM_CSV書き出し_月指定()    … 中の ym を直して実行（例 '2026-09'）
 *   ensureFcmTrigger()         … 毎月5日 7時の自動実行を登録（関数名は fcmMonthlyExport）
 */
var FCM_FOLDER_PROP = 'FCM_FOLDER_ID';
var FCM_FOLDER_NAME = '世桜FC Management_取込CSV';
var FCM_HEADER = ['店舗名', '店舗コード', '対象月', '売上', '客数', '食材原価', '人件費', '稼働人時', '諸経費', '売上予算', '客数予算', '食材原価予算', '人件費予算', '諸経費予算'];
/* アプリの店舗名 → FC Management の店舗名・店舗コード（2026-11-03 雛形の並び） */
var FCM_STORES = [
  ['日本料理世桜本店',      '日本料理世桜',          'ST001'],
  ['牛カツ世桜 長堀橋店',   '牛カツ世桜 長堀橋店',   'ST002'],
  ['寿司世桜 心斎橋店',     '寿司世桜 心斎橋店',     'ST003'],
  ['日本鰻世桜 長堀橋店',   '日本鰻世桜 長堀橋店',   'ST004'],
  ['手巻き寿司世桜 難波店', '手巻き寿司世桜 難波店', 'ST005'],
  ['牛カツ世桜 富士山店',   '牛カツ世桜 富士山店',   'ST006'],
  ['日本鰻世桜 富士山店',   '日本鰻世桜 富士山店',   'ST007'],
  ['日本鰻世桜 京都祇園店', '日本鰻世桜 京都祇園店', 'ST008'],
  ['日本鰻世桜 浅草橋店',   '日本鰻世桜 浅草橋店',   'ST009'],
  ['和牛世桜 広島店',       '和牛世桜 広島店',       'ST010']
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

/* ---------- 本体 ---------- */
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

function fcm_実行_(書き込む, ym) {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('ym は 2026-09 の形で：' + ym);
  var ss = aggSs_();
  // --- 『月次PL』＝売上・客数・原価・人件費 ---
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
  // --- 行を組む ---
  var rows = [], notes = [];
  FCM_STORES.forEach(function (s) {
    var app = s[0], name = s[1], code = s[2]; var r = byStore[app]; var w = [];
    var net = null, guests = null, cogs = null, labor = null;
    if (r) {
      net = fcm_num_(r[ph['純売上(税抜)']]); guests = fcm_num_(r[ph['客数']]); labor = fcm_num_(r[ph['人件費']]);
      var i0 = fcm_num_(r[ph['期首棚卸']]), buy = fcm_num_(r[ph['当月仕入']]), i1 = fcm_num_(r[ph['期末棚卸']]);
      if (buy != null) { cogs = (i0 || 0) + buy - (i1 || 0); if (!(i0 || 0) && !(i1 || 0)) w.push('棚卸0＝原価は仕入額のまま'); }
      else cogs = fcm_num_(r[ph['売上原価']]);
      if (net == null) w.push('純売上が空（古い版）');
      if (labor == null) w.push('人件費が空');
    } else w.push('月次PLにこの月の行が無い');
    var hh = hours[app] != null ? Math.round(hours[app] * 10) / 10 : null;
    if (hh == null) w.push('総労働時間なし'); else if (hdays[app] < 20) w.push('総労働時間は' + hdays[app] + '日分だけ');
    var v = function (x) { return x == null ? '' : String(Math.round(x)); };
    rows.push([name, code, fcm_月表記_(ym), v(net), v(guests), v(cogs), v(labor), hh == null ? '' : String(hh), '', '', '', '', '', '']);
    notes.push((w.length ? '△ ' : '○ ') + name + '：売上 ' + v(net) + '／客数 ' + v(guests) + '／原価 ' + v(cogs) + '／人件費 ' + v(labor) + '／人時 ' + (hh == null ? '' : hh) + (w.length ? '　' + w.join('・') : ''));
  });
  var csv = [FCM_HEADER].concat(rows).map(function (r) { return r.join(','); }).join('\n') + '\n';
  Logger.log('対象月 ' + ym + '（' + fcm_月表記_(ym) + '）' + rows.length + '店\n' + notes.join('\n'));
  if (!書き込む) { Logger.log('書き込みはしていません（下見）'); return csv; }
  // --- Drive へ（同じ名前は置き換え） ---
  var folder = fcm_フォルダ_(ss); var fname = 'FC Management_実績_' + ym + '.csv';
  var old = folder.getFilesByName(fname); while (old.hasNext()) old.next().setTrashed(true);
  var blob = Utilities.newBlob(csv, 'text/csv', fname);   // UTF-8・BOMなし（雛形と同じ）
  var f = folder.createFile(blob);
  Logger.log('書き出し：' + fname + '\n' + f.getUrl() + '\n→ FC Management の 本部入力 →「CSVを選択」でこのファイルを選ぶ');
  return f.getUrl();
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
