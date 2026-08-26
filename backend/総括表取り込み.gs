/**
 * 世桜アプリ｜総括表の自動取り込み（ドライブ → アプリ）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか（2026-08-26 作成）
 *   各店の「総括表Ver.2.6_◯◯店（YYYYMM）」の【売上台帳】タブから、
 *   日ごとの 売上（小計＝現金＋カード）と 客数 を読み、アプリの soukatsu 行として写す。
 *   1時間ごとのトリガーで回すと、アプリの店舗比較・個店カルテが常に最新になる。
 *
 * ■ 決めごと
 *   ・★総括表は読むだけ。1文字も書き込まない（本部ツールGASと同じ約束）
 *   ・正はドライブの総括表。アプリは写し＝二重管理にしない
 *   ・売上＝「小計」列（現金＋カード）。月次集計面の「計」はこの合計＝定義が揃う。
 *     客数＝「客数」列。**8/5の一括取り込みと同じ定義**（実データで突き合わせ済み）
 *   ・同じ店×日付は「最新の行が正」（アプリの表示ルール）＝値が変わった日だけ追記すれば上書きになる
 *   ・売上0かつ客数0の日は取り込まない（未入力と休業を台帳では区別できないため）
 *   ・セルの位置は決め打ちしない。「日付・現金売上・小計・客数」の見出しで列を探す
 *
 * ■ 設定（Script Properties）
 *   SOUKATSU_SOURCES ＝ 店舗とフォルダの対応（JSONの配列・1行で貼る）
 *     [{"store":"和牛世桜 広島店","folder":"フォルダID"}, …]
 *     フォルダ＝その店の総括表が月ごとに入っている場所。**ファイルIDでなくフォルダID**にするのは、
 *     毎月新しいブック（YYYYMM）が作られるため。フォルダなら月が替わっても自動で追える。
 *     ※ IDをコードに書かないのは公開リポジトリに残さないため（Code.gs と同じ方針）
 *
 * ■ 使い方（順番に）
 *   1. Script Properties に SOUKATSU_SOURCES を入れる
 *   2. 総括表取り込み_下見() … 何件入るかだけ確認（書き込みなし）
 *   3. 総括表を取り込む()     … 取り込み実行
 *   4. ensureSoukatsuImportTrigger() … 1時間ごとの自動実行を設定
 *
 * ■ リリース前の過去分を入れる（一回きり・比較素材）
 *   総括表取り込み_全期間_下見() → 件数を確認 → 総括表_全期間を取り込む()
 *   フォルダにある（YYYYMM）のブックを全部読む。同値はスキップ＝2回実行しても二重には入らない。
 *   ★全店ぶんは1回で終わらないことがある（GASの上限6分）。上限の前に自分から止まって
 *     「未処理の店舗」を報告するので、**「時間切れ」が出なくなるまで同じ関数を繰り返し実行する**。
 *     入った分は二重にならない。途中で DEADLINE_EXCEEDED が出ても壊れない（再実行で続きから）。
 */

var SK_SRC_TAG = 'drive';                 // 取り込んだ行に付ける印（note の src）
var SK_HEADERS = ['日付', '現金売上', '小計', '客数'];

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

/* 全期間版＝フォルダにある（YYYYMM）のブックを全部拾う。
   リリース前の過去分をアプリへ入れて、前月比・前年比の比較素材にするための一回きりの遡り取り込み用。
   毎時のトリガーはこれを使わない（今月＋前月だけ＝実行時間を短く保つ）。 */
function sk_対象ブック_全期間_(folderId) {
  var out = [];
  var files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext()) {
    var f = files.next();
    var name = f.getName();
    var m = name.match(/[（(](\d{6})[）)]/);
    if (m) out.push({ id: f.getId(), name: name, ym: m[1] });
  }
  out.sort(function (a, b) { return a.ym < b.ym ? -1 : 1; });   // 古い月から順に＝ログが読みやすい
  return out;
}

/* ブックの中から【売上台帳】のシートを見出しで探し、日ごとの {date, sales, guests} を返す */
function sk_台帳を読む_(fileId, ym) {
  var ss = SpreadsheetApp.openById(fileId);
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    var rows = Math.min(sh.getLastRow(), 60), cols = Math.min(sh.getLastColumn(), 30);
    if (rows < 5 || cols < 5) continue;
    var vals = sh.getRange(1, 1, rows, cols).getValues();
    // 見出し行を探す（「日付」「現金売上」「小計」「客数」が同じ行〜2行内に揃っているか）
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
      // データ行＝見出しの下から「日付が1〜31の数字」の行
      var out = [];
      var 年 = Number(ym.slice(0, 4)), 月 = Number(ym.slice(4, 6));
      var 今日 = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
      for (var i = r + 1; i < rows; i++) {
        /* ★日付セルは「1」という数字のことも「日付型（Dateオブジェクト）」のこともある。
           実機で全店0件になった原因（2026-08-26）＝日付書式のセルは getValues() が Date で返すため、
           Number(Date) が巨大な数になり全行スキップされていた。両方を受ける。 */
        var 生 = vals[i][c日付];
        var day = (生 && typeof 生.getDate === 'function') ? 生.getDate() : Number(生);
        if (!day || day < 1 || day > 31 || day !== Math.floor(day)) continue;
        var sales = Number(String(vals[i][c小計]).replace(/[,，\s]/g, '')) || 0;
        var guests = Number(String(vals[i][c客数]).replace(/[,，\s]/g, '')) || 0;
        if (sales <= 0 && guests <= 0) continue;              // 未入力／休業は台帳では区別できない＝入れない
        var date = 年 + '-' + ('0' + 月).slice(-2) + '-' + ('0' + day).slice(-2);
        if (date > 今日) continue;                             // 未来日は入れない
        out.push({ date: date, sales: sales, guests: guests });
      }
      return out;
    }
  }
  throw new Error('売上台帳の見出し（日付・現金売上・小計・客数）が見つかりません：' + ss.getName());
}

/* いまアプリに入っている「店×日付→最新の値」を作る（アプリの表示ルールと同じ＝tが新しい行が正） */
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
    if (!map[k] || t >= map[k].t) map[k] = { t: t, sales: Number(p.sales) || 0, guests: Number(p.guests) || 0 };
  }
  return map;
}

/* ★実行時間の予算（既定4分半）。GASは1回の実行が6分で強制終了（DEADLINE_EXCEEDED）になるため、
   その前に自分から止まり「どこまで入れたか・残りはどの店か」を報告する。
   ★書き込んだ分は同値スキップされるので、もう一度実行すれば続きから入る（＝何度実行しても二重にならない）。
   2026-08-27 全期間の取り込みで実際に6分超になった（1行ずつのappendRowも遅かった＝一括書きに変更）。 */
var SK_TIME_BUDGET_MS = 4.5 * 60 * 1000;

/* 全期間の書き込みで「済んだ店」を覚えておく置き場（Script Properties）。
   ★なぜ要るか＝再実行のたびに済んだ店の台帳を全部読み直すと、読むだけで数分かかり、
   時間予算をまた使い切って残りの店へ届かないことがある。済んだ店は次の実行で飛ばす。
   全店が済んだら自動で消す（＝次回また最初から確かめられる）。 */
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
        sk_台帳を読む_(b.id, b.ym).forEach(function (d) {
          var k = src.store + '|' + d.date;
          var cur = 既存[k];
          if (cur && cur.sales === d.sales && cur.guests === d.guests) { stat.変わらず++; return; }
          if (cur) stat.更新++; else stat.新規++;
          if (書き込む) {
            追記.push([Utilities.getUuid(), Date.now(), 'soukatsu', src.store, '', '',
              JSON.stringify({ date: d.date, sales: d.sales, guests: d.guests, src: SK_SRC_TAG }), '[]']);
            既存[k] = { t: Date.now(), sales: d.sales, guests: d.guests };   // 同じ実行内での二重追記を防ぐ
          }
        });
      });
      /* ★店舗ごとに一括で書く（1行ずつのappendRowは1回ごとに保存が走り、数百行で分単位かかる）。
         店舗単位で書き切るので、途中で時間切れになっても「書きかけの店」は残らない。 */
      if (書き込む && 追記.length) {
        var 次行 = sh.getLastRow() + 1;
        sh.getRange(次行, 1, 追記.length, 追記[0].length).setValues(追記);
      }
      // 全期間の書き込み＝この店は書き切った。次の実行では飛ばす
      if (全期間 && 書き込む) { 済み.push(src.store); props.setProperty(SK_DONE_KEY, JSON.stringify(済み)); }
    } catch (e) {
      結果.エラー.push({ 店舗: src.store, 理由: String(e.message || e) });
    }
    結果.新規 += stat.新規; 結果.更新 += stat.更新; 結果.変わらず += stat.変わらず;
    if (結果.店舗[src.store] === undefined) 結果.店舗[src.store] = stat;
  }
  // 全店が済んだら覚え書きを消す＝次に全期間を実行すると、また最初から全店を確かめられる
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

/* ①-b 全期間の下見／実行＝リリース前の過去分を一度だけ遡って入れる（比較素材）。
   同値スキップは通常と同じ＝2回実行しても二重には入らない。実行後は毎時トリガーに任せる */
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

/* トリガー用の英字名（★日本語の関数名を時間トリガーに指定すると「不明なエラー」になることがある＝
   2026-08-26 実機で発生。トリガーはこの英字関数を指し、中身は同じ） */
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
