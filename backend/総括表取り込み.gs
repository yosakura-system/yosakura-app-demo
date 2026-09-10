/**
 * 世桜アプリ｜総括表の自動取り込み（ドライブ → アプリ）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか（2026-08-26 作成／2026-09-10 全項目転記に拡張＝神田さんのご指示）
 *   各店の「総括表Ver.2.6_◯◯店（YYYYMM）」から、日ごとの記録をアプリの soukatsu 行として写す。
 *   ・【売上台帳】タブ＝現金売上・カード売上・小計（売上）・純売上・値引き・昼のみ売上・客数
 *   ・【日別タブ（1〜31）】＝口コミ（当日・累計）・フード/ドリンク金額・チップ（当日・累計）・
 *     仕入金額・労働時間・人件費額・月累計売上・国別の組数/人数（顧客情報）・感想などの文章欄
 *   記入されている項目だけを写す（空欄・0は写さない＝アプリ側は無い項目を「—」で出す）。
 *
 * ■ 決めごと
 *   ・★総括表は読むだけ。1文字も書き込まない（本部ツールGASと同じ約束）
 *   ・正はドライブの総括表。アプリは写し＝二重管理にしない
 *   ・同じ店×日付は「最新の行が正」（アプリの表示ルール）＝中身が変わった日だけ追記すれば上書きになる
 *   ・アプリから直接入力された日は、アプリ入力が優先（アプリ側 skClean の決めごと。取込は保険）
 *   ・売上0かつ客数0の日は取り込まない（未入力と休業を台帳では区別できないため）
 *   ・セルの位置は決め打ちしない。見出し・ラベルの文字で探す（店・月がずれても追える）
 *   ・日別タブは読むのに時間がかかるため、毎時の取り込みでは「直近3日分」だけ読む。
 *     月の途中からこの版に切り替えた場合など、過去日の項目まで埋めたいときは
 *     総括表_全期間を取り込む() を1回実行する（全日読む・同値スキップ＝二重にならない）
 *
 * ■ 設定（Script Properties）
 *   SOUKATSU_SOURCES ＝ 店舗とフォルダの対応（JSONの配列・1行で貼る）
 *     [{"store":"和牛世桜 広島店","folder":"フォルダID"}, …]
 *
 * ■ 使い方（順番に）
 *   1. Script Properties に SOUKATSU_SOURCES を入れる（設定済みなら不要）
 *   2. 総括表取り込み_下見() … 何件入るかだけ確認（書き込みなし）
 *   3. 総括表を取り込む()     … 取り込み実行
 *   4. ensureSoukatsuImportTrigger() … 1時間ごとの自動実行を設定（設定済みなら不要）
 */

var SK_SRC_TAG = 'drive';                 // 取り込んだ行に付ける印（note の src）
var SK_HEADERS = ['日付', '現金売上', '小計', '客数'];
var SK_DAILY_RECENT_DAYS = 3;             // 毎時の取り込みで日別タブを読む日数（今日から遡って）

function sk_設定_() {
  var raw = getSetting_('SOUKATSU_SOURCES', '');
  if (!raw) throw new Error('SOUKATSU_SOURCES がありません。Script Properties に店舗とフォルダの対応（JSON）を入れてください。');
  var list = JSON.parse(raw);
  if (!list.length) throw new Error('SOUKATSU_SOURCES が空です。');
  list.forEach(function (s) { if (!s.store || !s.folder) throw new Error('store と folder の両方が要ります：' + JSON.stringify(s)); });
  return list;
}

/* その店のフォルダから「対象月のブック」を探す（今月＋前月＝月初の締め入力を拾うため） */
function sk_対象ブック_(folderId) {
  var out = [];
  var now = new Date();
  var ym = [Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMM')];
  var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  ym.push(Utilities.formatDate(prev, 'Asia/Tokyo', 'yyyyMM'));
  var files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    ym.forEach(function (m) { if (name.indexOf('（' + m + '）') !== -1 || name.indexOf('(' + m + ')') !== -1) out.push({ id: f.getId(), name: name, ym: m }); });
  }
  return out;
}

/* 全期間版＝フォルダにある（YYYYMM）のブックを全部拾う */
function sk_対象ブック_全期間_(folderId) {
  var out = [];
  var files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    var m = name.match(/[（(](\d{6})[）)]/);
    if (m) out.push({ id: f.getId(), name: name, ym: m[1] });
  }
  out.sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });
  return out;
}

/* 数字にする（カンマ・空白・円を除く）。数字でなければ null */
function sk_num_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = String(v).replace(/[,，\s円¥]/g, '');
  if (!/\d/.test(s)) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/* ブックの中から【売上台帳】のシートを見出しで探し、日ごとの基本項目を返す
   （現金売上・カード売上・小計＝売上・純売上・値引き・昼のみ売上・客数） */
function sk_台帳を読む_(ss, ym) {
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    var rows = Math.min(sh.getLastRow(), 60), cols = Math.min(sh.getLastColumn(), 30);
    if (rows < 5 || cols < 5) continue;
    var vals = sh.getRange(1, 1, rows, cols).getValues();
    for (var r = 0; r < Math.min(rows, 12); r++) {
      var line = vals[r].map(String).concat((vals[r + 1] || []).map(String));
      var okAll = SK_HEADERS.every(function (h) { return line.some(function (v) { return v.indexOf(h) !== -1; }); });
      if (!okAll) continue;
      var col = function (h) {
        for (var c = 0; c < cols; c++) {
          if (String(vals[r][c]).indexOf(h) !== -1) return c;
          if (vals[r + 1] && String(vals[r + 1][c]).indexOf(h) !== -1) return c;
        }
        return -1;
      };
      var c日付 = col('日付'), c小計 = col('小計'), c客数 = col('客数');
      if (c日付 < 0 || c小計 < 0 || c客数 < 0) continue;
      // ★2026-09-10 追加＝記入されている列は全部写す（無い列・空欄は写さない）
      var c現金 = col('現金売上'), cカード = col('カード売上'), c純 = col('純売上'), c値引 = col('値引'), c昼 = col('昼のみ');
      var out = [];
      var 年 = Number(ym.slice(0, 4)), 月 = Number(ym.slice(4, 6));
      var 今日 = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      for (var i = r + 1; i < rows; i++) {
        var 生 = vals[i][c日付];
        var day = (生 && typeof 生.getDate === 'function') ? 生.getDate() : Number(生);
        if (!day || day < 1 || day > 31 || day !== Math.floor(day)) continue;
        var sales = sk_num_(vals[i][c小計]) || 0;
        var guests = sk_num_(vals[i][c客数]) || 0;
        if (sales <= 0 && guests <= 0) continue;
        var date = 年 + '-' + ('0' + 月).slice(-2) + '-' + ('0' + day).slice(-2);
        if (date > 今日) continue;
        var d = { date: date, day: day, sales: sales, guests: guests };
        var put = function (key, c) { if (c < 0) return; var n = sk_num_(vals[i][c]); if (n != null && n !== 0) d[key] = n; };
        put('cash', c現金); put('card', cカード); put('net', c純); put('disc', c値引); put('lunch', c昼);
        out.push(d);
      }
      return out;
    }
  }
  throw new Error('売上台帳の見出し（日付・現金売上・小計・客数）が見つかりません：' + ss.getName());
}

/* 日別タブ（'1'〜'31'）から、その日の詳細項目を読む。無ければ {}。
   ラベルの文字で行を探し、値はその上の「当日計／累計」見出しの列から取る（セル位置の決め打ちをしない） */
var SK_CTY_MAP = [
  ['日本', 'jp'], ['韓国', 'kr'], ['中国', 'cn'], ['香港', 'hk'], ['台湾', 'tw'],
  ['東南', 'sea'], ['ヨーロッパ', 'eu'], ['ﾖｰﾛｯﾊﾟ', 'eu'], ['オーストラリア', 'au'], ['ｵｰｽﾄﾗﾘｱ', 'au'],
  ['アメリカ', 'us'], ['ｱﾒﾘｶ', 'us'], ['カナダ', 'ca'], ['ｶﾅﾀﾞ', 'ca'], ['メキシコ', 'mx'], ['ﾒｷｼｺ', 'mx'],
  ['ブラジル', 'br'], ['中南米', 'latam'], ['南アジア', 'sasia'], ['中央アジア', 'casia'],
  ['中東', 'me'], ['アフリカ', 'af'], ['新規', 'new'], ['リピート', 'rep'], ['ﾘﾋﾟｰﾄ', 'rep']
];
var SK_TEXT_LABELS = [
  '客足', 'ランチ：', 'ディナー：', 'ウェイト対応', '客層', '運営面',
  '良かった点', 'すぐ改善できるもの', 'キッチン伝達', '食器の破損報告', 'その他', '本日の口コミレビュー'
];
function sk_日別を読む_(ss, day) {
  var sh = ss.getSheetByName(String(day));
  if (!sh) return {};
  var rows = Math.min(sh.getLastRow() || 0, 130), cols = Math.min(sh.getLastColumn() || 0, 32);
  if (rows < 10 || cols < 5) return {};
  var vals = sh.getRange(1, 1, rows, cols).getValues();
  var disp = null; // getDisplayValues は必要になったときだけ読む（時間の節約）
  var out = {};
  var str = function (v) { return String(v == null ? '' : v).trim(); };

  // ラベルの行を探す（左6列の中）
  var findRow = function (re) {
    for (var r = 0; r < rows; r++) for (var c = 0; c < Math.min(cols, 6); c++) {
      if (re.test(str(vals[r][c]))) return { r: r, c: c };
    }
    return null;
  };
  // その行の上3行以内にある「当日計」「累計」見出しの列を探す
  var ctxCols = function (r) {
    for (var up = 1; up <= 3; up++) {
      var rr = r - up; if (rr < 0) break;
      var c当 = -1, c累 = -1;
      for (var c = 0; c < cols; c++) {
        var v = str(vals[rr][c]);
        if (c当 < 0 && v.indexOf('当日') !== -1) c当 = c;
        if (v.indexOf('累計') !== -1) c累 = c;
      }
      if (c当 >= 0 || c累 >= 0) return { 当: c当, 累: c累 };
    }
    return { 当: -1, 累: -1 };
  };
  var takeAt = function (r, c) { return c >= 0 ? sk_num_(vals[r][c]) : null; };
  var put = function (key, n) { if (n != null && n !== 0) out[key] = n; };

  /* 口コミ＝当日だけ写す。★シートの「累計の口コミ」は月間の累計、アプリの「口コミ 累計」は
     月をまたぐ通算＝定義が違うため写さない（混ぜると累計欄が壊れる） */
  var pv = findRow(/本日の口コミ獲得/);
  if (pv) {
    for (var c = pv.c + 1; c < cols; c++) { var n = sk_num_(vals[pv.r][c]); if (n != null) { put('rvt', n); break; } }
  }
  // 当日計／累計の型の行（フード・ドリンク・チップ・仕入・売上合計の累計＝月累計売上）
  var rowVal = function (re, dayKey, cumKey) {
    var p = findRow(re); if (!p) return;
    var cc = ctxCols(p.r);
    if (dayKey) put(dayKey, takeAt(p.r, cc.当));
    if (cumKey) put(cumKey, takeAt(p.r, cc.累));
  };
  rowVal(/^フード$/, 'foodamt', null);
  rowVal(/^ドリンク$/, 'drinkamt', null);
  rowVal(/^チップ$/, 'tipt', 'tipa');
  rowVal(/^仕入金額$/, 'buy', null);
  rowVal(/^売上合計$/, null, 'mtd');   // 売上合計の累計＝月累計売上（アプリと同じ定義＝Σ小計）

  // 勤怠（時間計＝総労働時間・金額計＝人件費額）。時間は「34:24:00」の表示文字から時間数に直す
  var pk = findRow(/^当日計$/);
  if (pk) {
    var cc2 = (function () {
      var rr = pk.r - 1, c時 = -1, c金 = -1;
      if (rr >= 0) for (var c = 0; c < cols; c++) {
        var v = str(vals[rr][c]);
        if (v.indexOf('時間計') !== -1) c時 = c;
        if (v.indexOf('金額計') !== -1) c金 = c;
      }
      return { 時: c時, 金: c金 };
    })();
    if (cc2.金 >= 0) put('laborcost', takeAt(pk.r, cc2.金));
    if (cc2.時 >= 0) {
      if (!disp) disp = sh.getRange(1, 1, rows, cols).getDisplayValues();
      var m = String(disp[pk.r][cc2.時] || '').match(/(\d+):(\d{2})/);
      if (m) { var h = Number(m[1]) + Number(m[2]) / 60; if (h > 0) out.hours = Math.round(h * 10) / 10; }
    }
  }

  // 顧客情報（国別の組数・人数）＝「国」の行の下に「組数」「人数」の行が続く型
  var cty = {};
  for (var r = 0; r < rows - 2; r++) {
    if (str(vals[r][1]) !== '国' && str(vals[r][0]) !== '国') continue;
    var r組 = r + 1, r人 = r + 2;
    var ok組 = /組数/.test(str(vals[r組][1]) + str(vals[r組][0]));
    var ok人 = /人数/.test(str(vals[r人][1]) + str(vals[r人][0]));
    if (!ok組 || !ok人) continue;
    for (var c4 = 2; c4 < cols; c4++) {
      var name = str(vals[r][c4]);
      if (!name) continue;
      var key = null;
      for (var mi = 0; mi < SK_CTY_MAP.length; mi++) { if (name.indexOf(SK_CTY_MAP[mi][0]) !== -1) { key = SK_CTY_MAP[mi][1]; break; } }
      if (!key) continue;
      var g = sk_num_(vals[r組][c4]) || 0, p2 = sk_num_(vals[r人][c4]) || 0;
      if (g > 0 || p2 > 0) cty[key] = { g: g, p: p2 };
    }
  }
  if (Object.keys(cty).length) out.cty = cty;

  // 文章欄（感想・伝達など）＝ラベルの右・下にある文字を拾い、「ラベル：内容」で1つにまとめる
  var lines = [];
  var isLabel = function (v) {
    if (!v) return false;
    if (/^◎/.test(v)) return true;
    return SK_TEXT_LABELS.some(function (L) { return v.indexOf(L) !== -1 && v.length <= L.length + 4; });
  };
  for (var li = 0; li < SK_TEXT_LABELS.length; li++) {
    var lb = SK_TEXT_LABELS[li];
    var p3 = null;
    for (var r2 = 0; r2 < rows && !p3; r2++) for (var c5 = 0; c5 < Math.min(cols, 6); c5++) {
      if (str(vals[r2][c5]).indexOf(lb) !== -1) { p3 = { r: r2, c: c5 }; break; }
    }
    if (!p3) continue;
    var buf = [];
    // 同じ行のラベルより右の文字
    for (var c6 = p3.c + 1; c6 < cols; c6++) {
      var v2 = str(vals[p3.r][c6]);
      if (v2 && sk_num_(v2) == null && !isLabel(v2)) buf.push(v2);
    }
    // 下の行（次のラベルまで・最大3行）の文字
    for (var r3 = p3.r + 1; r3 <= Math.min(p3.r + 3, rows - 1); r3++) {
      var stop = false;
      for (var c7 = 0; c7 < Math.min(cols, 6); c7++) { if (isLabel(str(vals[r3][c7]))) { stop = true; break; } }
      if (stop) break;
      for (var c8 = p3.c; c8 < cols; c8++) {
        var v3 = str(vals[r3][c8]);
        if (v3 && sk_num_(v3) == null && !isLabel(v3)) buf.push(v3);
      }
    }
    if (buf.length) lines.push(lb.replace(/[：:]+$/, '') + '：' + buf.join(' '));
  }
  if (lines.length) out.note = lines.join('\n');

  return out;
}

/* 取り込み1行ぶんの中身を、いつも同じ並びで JSON にする（同値スキップの比較用） */
var SK_PAYLOAD_KEYS = ['date', 'sales', 'guests', 'cash', 'card', 'net', 'disc', 'lunch', 'mtd',
  'rvt', 'rva', 'tipt', 'tipa', 'foodamt', 'drinkamt', 'buy', 'hours', 'laborcost', 'note', 'cty', 'src'];
function sk_payload_(d) {
  var o = {};
  SK_PAYLOAD_KEYS.forEach(function (k) { if (d[k] != null && d[k] !== '' && d[k] !== 0 || k === 'date' || k === 'src') { if (d[k] != null) o[k] = d[k]; } });
  o.src = SK_SRC_TAG;
  return o;
}
function sk_canon_(p) {
  var o = {};
  SK_PAYLOAD_KEYS.forEach(function (k) { if (p && p[k] != null && p[k] !== '') o[k] = p[k]; });
  return JSON.stringify(o);
}

/* いまアプリに入っている「店×日付→最新の取込内容」を作る（p＝中身も持つ＝詳細の引き継ぎに使う） */
function sk_既存の値_() {
  var sh = getSheet();
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][2]) !== 'soukatsu') continue;
    var t = Number(vals[i][1]) || 0;
    var p; try { p = JSON.parse(vals[i][6] || '{}'); } catch (e) { continue; }
    if (!p.date) continue;
    var k = String(vals[i][3]) + '|' + p.date;
    if (!map[k] || t >= map[k].t) map[k] = { t: t, canon: sk_canon_(p), src: p.src || '', p: p };
  }
  return map;
}

var SK_TIME_BUDGET_MS = 4.5 * 60 * 1000;
var SK_DONE_KEY = 'SK_ZENKIKAN_DONE';
function sk_済み_() { try { return JSON.parse(getSetting_(SK_DONE_KEY, '[]')) || []; } catch (e) { return []; } }

function sk_実行_(書き込む, 全期間, 予算ms) {
  var 開始 = Date.now();
  var 予算 = 予算ms || SK_TIME_BUDGET_MS;
  var list = sk_設定_();
  var 既存 = sk_既存の値_();
  var sh = 書き込む ? getSheet() : null;
  var 結果 = { 新規: 0, 更新: 0, 変わらず: 0, 店舗: {}, エラー: [] };
  var 済み = (全期間 && 書き込む) ? sk_済み_() : [];
  var props = PropertiesService.getScriptProperties();
  var 今日ms = Date.now();
  for (var li = 0; li < list.length; li++) {
    var src = list[li];
    if (済み.indexOf(src.store) !== -1) { 結果.店舗[src.store] = '前回までに完了（飛ばした）'; continue; }
    if (Date.now() - 開始 > 予算) {
      結果.時間切れ = '実行時間の上限が近いため、ここで止めました。もう一度実行すると続きから入ります（入った分は二重になりません）';
      結果.未処理の店舗 = list.slice(li).map(function (s) { return s.store; }).filter(function (s) { return 済み.indexOf(s) === -1; });
      break;
    }
    var stat = { 新規: 0, 更新: 0, 変わらず: 0 };
    var 追記 = [];
    try {
      var books = 全期間 ? sk_対象ブック_全期間_(src.folder) : sk_対象ブック_(src.folder);
      if (!books.length) throw new Error((全期間 ? '（YYYYMM）の付いたブック' : '今月・前月のブック') + 'が見つかりません（フォルダ内の命名＝（YYYYMM）を確認）');
      books.forEach(function (b) {
        var ss = SpreadsheetApp.openById(b.id);
        sk_台帳を読む_(ss, b.ym).forEach(function (d) {
          /* ★日別タブの詳細は「直近3日」だけ毎時読む（31タブ×全店を毎時読むと時間切れになるため）。
             全期間の取り込みでは全日読む＝過去日の項目もこの1回で埋まる */
          var 経過日 = Math.floor((今日ms - new Date(d.date + 'T00:00:00+09:00').getTime()) / 864e5);
          var k = src.store + '|' + d.date;
          var cur = 既存[k];
          if (全期間 || (経過日 >= 0 && 経過日 < SK_DAILY_RECENT_DAYS)) {
            var extra = sk_日別を読む_(ss, d.day);
            Object.keys(extra).forEach(function (kk) { if (d[kk] == null) d[kk] = extra[kk]; });
          } else if (cur && cur.src && cur.p) {
            /* ★日別タブを読まなかった日は、既存の取込行が持つ詳細（口コミ・チップ・国別・感想など）を
               引き継ぐ。これが無いと、台帳だけの軽い行が毎時「最新」として詳細を上書きして剥がしてしまう
               （2026-09-10 実データで発症を確認＝全期間で入れた9/7の詳細が同日の毎時実行で消えた） */
            SK_PAYLOAD_KEYS.forEach(function (kk) {
              if (kk === 'date' || kk === 'src') return;
              if (d[kk] == null && cur.p[kk] != null) d[kk] = cur.p[kk];
            });
          }
          delete d.day;
          var payload = sk_payload_(d);
          var canon = sk_canon_(payload);
          /* 同値スキップ＝全項目で比較。ただし既存がアプリ入力（src無し）の日は、
             アプリが正なので取込行は足さない（足しても負けるだけ＝行数の無駄） */
          if (cur && !cur.src) { stat.変わらず++; return; }
          if (cur && cur.canon === canon) { stat.変わらず++; return; }
          if (cur) stat.更新++; else stat.新規++;
          if (書き込む) {
            追記.push([Utilities.getUuid(), Date.now(), 'soukatsu', src.store, '', '', JSON.stringify(payload), '[]']);
            既存[k] = { t: Date.now(), canon: canon, src: SK_SRC_TAG, p: payload };
          }
        });
      });
      if (書き込む && 追記.length) {
        var 次行 = sh.getLastRow() + 1;
        sh.getRange(次行, 1, 追記.length, 追記[0].length).setValues(追記);
      }
      if (全期間 && 書き込む) { 済み.push(src.store); props.setProperty(SK_DONE_KEY, JSON.stringify(済み)); }
    } catch (e) {
      結果.エラー.push({ 店舗: src.store, 理由: String(e.message || e) });
    }
    結果.新規 += stat.新規; 結果.更新 += stat.更新; 結果.変わらず += stat.変わらず;
    if (結果.店舗[src.store] === undefined) 結果.店舗[src.store] = stat;
  }
  if (全期間 && 書き込む && !結果.時間切れ) {
    var 全部済み = list.every(function (s) { return 済み.indexOf(s.store) !== -1; });
    var エラー店 = 結果.エラー.length;
    if (全部済み && !エラー店) { props.deleteProperty(SK_DONE_KEY); 結果.完了 = '★全店ぶん入りました（覚え書きは消しました）'; }
    else if (エラー店) 結果.完了 = 'エラーの店だけ残っています。直してからもう一度実行してください';
  }
  結果.書き込み = 書き込む ? '実行した' : '★下見のみ（書き込みなし）';
  結果.所要秒 = Math.round((Date.now() - 開始) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}

/* ① 下見（書き込みなし）＝何件入るかを見るだけ */
function 総括表取り込み_下見() { return sk_実行_(false); }

/* ①-b 全期間の下見／実行。同値スキップは通常と同じ＝2回実行しても二重には入らない */
function 総括表取り込み_全期間_下見() { return sk_実行_(false, true); }
function 総括表_全期間を取り込む() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('別の取り込みが実行中のため見送り'); return { 見送り: true }; }
  try { return sk_実行_(true, true); }
  finally { lock.releaseLock(); }
}

/* ② 取り込み実行（トリガーもこれを呼ぶ）。多重実行はロックで防ぐ */
function 総括表を取り込む() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log('別の取り込みが実行中のため見送り'); return { 見送り: true }; }
  try { return sk_実行_(true); }
  finally { lock.releaseLock(); }
}

/* トリガー用の英字名（日本語の関数名を時間トリガーに指定すると不明なエラーになることがある） */
function importSoukatsu() { return 総括表を取り込む(); }

/* ③ 1時間ごとの自動実行を設定（重複は作らない） */
function ensureSoukatsuImportTrigger() {
  var exists = ScriptApp.getProjectTriggers().filter(function (t) {
    var f = t.getHandlerFunction();
    return f === 'importSoukatsu' || f === '総括表を取り込む';
  });
  if (exists.length) { Logger.log('既に設定済み'); return { 結果: '既に設定済み' }; }
  ScriptApp.newTrigger('importSoukatsu').timeBased().everyHours(1).create();
  Logger.log('設定しました（1時間ごと）'); return { 結果: '設定しました（1時間ごと）' };
}
