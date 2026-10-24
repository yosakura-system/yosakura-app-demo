/** ============================================================
 * 整理圧縮.gs — reports の「上書きされて役目を終えた行」を圧縮する
 *
 * ■ なぜ要るか（2026-09-10）
 *   バックエンドは追記式＝同じ提出のやり直し・毎時取込の更新・チェックの操作が全部行として残る。
 *   アプリは「直近READ_TAIL行」しか読まないため、行数が窓を超えると古いデータが押し出されて
 *   「過去のサーベイが消えた」ように見える（実際に3回発生）。
 *   表示は常に「最新の行が正」なので、**古い方の行は消しても表示は1つも変わらない**。
 *
 * ■ 圧縮するもの（最新1行だけ残す）。鍵はアプリの distribute() の「最新が正」と同じにする
 *   ・soukatsu（総括表）＝店舗×日付×出どころ（アプリ入力／総括表取込／USENレジ）ごとに最新を残す（表示の勝ち負けを壊さない）
 *   ・ckdone（チェックリスト実施）＝店舗×項目キーごと
 *   ・gsnap（Google口コミの日次記録）＝店舗×日付ごと
 *   ・svcheck（SVチェック）＝item（店舗|日付|No）ごと。写真も最新の行の分しか使わない（app.js distribute）  ★2026-10-24
 *   ・hqtask（本部の個人タスク）＝item（uid）ごと。1行が一覧まるごと＝1行30KB                              ★2026-10-24
 *   ・linkset（資料リンク一覧）＝全体で1つ。1行が一覧まるごと＝1行20KB                                    ★2026-10-24
 *   ・svstd（SVチェックの基準）＝item（項目No）ごと                                                     ★2026-10-24
 *   それ以外の種類（写真提出・気づき・サーベイ・対応済み・お知らせ・月次等）は一切触らない。
 *   ※ monthly は総括表取込の行（src:'drive'）を「全部の値」で比べる作りのため対象にしない（app.js monthlyDV）
 *
 * ■ 外に出すもの（消さずに「_控え」タブへ移す）★2026-10-24
 *   ・apperr（画面エラー・ログインの記録）＝アプリは表示に使わない。見守り.gs が直近の分だけ読む
 *     → 4日より前の分を「_控え」へ。10/20〜23 は1日38行＝増える行の4分の1がこれだった
 *
 * ■ 消した行はすべて「_控え」タブに残す（★2026-10-24〜）＝いつでも戻せる。毎月1日だけスプレッドシートの複製も作る
 *
 * ■ 行の消し方（★2026-10-24 修正）
 *   以前は「全部消して残す行を書き直す」方式だった。提出の受付（doPost）はこのロックを取らないため、
 *   消してから書き直すまでの間に届いた提出が、書き直しで上書きされるおそれがあった。
 *   → 下の行から、まとまりごとに deleteRows する（新しい提出は一番下に足されるので、ずれも上書きも起きない）
 *
 * ■ 使い方
 *   1. 整理圧縮_下見() … 何行減るかを見るだけ（書き込みなし）
 *   2. 整理圧縮を実行() … 控えに移してから圧縮（1日なら複製も）
 *   3. 整理圧縮_毎晩の予約() … 毎晩2時台に自動（以前の月1回の予約は外す）
 *   ※ 実行後、アプリは次の同期で自動的に追いつく（表示は変わらない・軽くなるだけ）
 * ============================================================ */

var 圧縮_エラー残す日数 = 4;     // 見守り.gs は直近3日まで読む
var 圧縮_控えタブ = '_控え';

function 整理圧縮_下見() { return 圧縮_(false); }

function 整理圧縮を実行() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log('別の処理が実行中のため見送り'); return { 見送り: true }; }
  try { return 圧縮_(true); }
  finally { lock.releaseLock(); }
}

function 圧縮_(書き込む) {
  var t0 = Date.now();
  var sh = getSheet();
  var last = sh.getLastRow();
  if (last < 2) return { 行: 0 };
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var errCut = Date.now() - 圧縮_エラー残す日数 * 86400000;

  var keyOf = function (r, p) {
    var kind = String(r[2] || '');
    if (kind === 'soukatsu') {
      if (!p || !p.date) return null;
      var d = p.date;
      var ds = (d && d.getTime) ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') : String(d);
      /* ★出どころごとに最新1行を残す（2026-09-30）。以前は src の有無だけで分けていたため、
         USENレジの行（src:'usen'）と総括表の行（src:'drive'）が同じ鍵になり、片方が消えてしまう */
      return 'sk|' + r[3] + '|' + ds + '|' + (p.src ? String(p.src) : 'app');
    }
    if (kind === 'ckdone') return 'ck|' + r[3] + '|' + String(r[4] || '');
    if (kind === 'gsnap') {
      var it = r[4];
      var ds2 = (it && it.getTime) ? Utilities.formatDate(it, 'Asia/Tokyo', 'yyyy-MM-dd') : String(it || '');
      return 'gs|' + r[3] + '|' + ds2;
    }
    if (kind === 'svcheck' || kind === 'svstd' || kind === 'hqtask') return r[4] ? kind + '|' + String(r[4]) : null;   // app.js と同じ＝item ごと
    if (kind === 'linkset') return 'linkset';
    return null; // 圧縮の対象外＝必ず残す
  };

  var best = {};           // key -> { i, t }  最新の行
  var drop = {};           // 消してよい行の添え字 -> 理由
  var 内訳 = { soukatsu: 0, ckdone: 0, gsnap: 0, svcheck: 0, hqtask: 0, linkset: 0, svstd: 0, apperr: 0 };
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    var kindName = String(r[2]);
    var t = Number(r[1]) || 0;
    if (kindName === 'apperr') { if (t && t < errCut) { drop[i] = 'apperr'; 内訳.apperr++; } continue; }
    var p = null; var note = String(r[6] || '');
    if (note.charAt(0) === '{') { try { p = JSON.parse(note); } catch (e) { p = null; } }
    var k = keyOf(r, p);
    if (!k) continue;
    var cur = best[k];
    if (!cur) { best[k] = { i: i, t: t }; continue; }
    if (t >= cur.t) { drop[cur.i] = kindName; best[k] = { i: i, t: t }; }
    else drop[i] = kindName;
    内訳[kindName] = (内訳[kindName] || 0) + 1;
  }
  var idx = Object.keys(drop).map(Number).sort(function (a, b) { return a - b; });
  var 結果 = {
    現在の行数: vals.length,
    減らせる行数: idx.length,
    圧縮後の行数: vals.length - idx.length,
    内訳: 内訳,
    読み窓: 'READ_TAIL=' + READ_TAIL,
    書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）'
  };
  if (書き込む && idx.length > 0) {
    var now = new Date();
    // ① 毎月1日（と手で実行したとき）はスプレッドシートごと複製
    if (now.getDate() === 1 || !圧縮_自動中_) {
      var file = DriveApp.getFileById(getSS_().getId());
      var bk = file.makeCopy('世桜アプリ_本部データ_圧縮前バックアップ_' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmm'));
      結果.バックアップ = bk.getName();
    }
    // ② 消す行を「_控え」タブへ写す（移した日時と理由を前に足す）
    var ss = getSS_();
    var ar = ss.getSheetByName(圧縮_控えタブ);
    if (!ar) { ar = ss.insertSheet(圧縮_控えタブ); ar.appendRow(['移した日時', '理由'].concat(HEADERS)); }
    var stamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    var copy = idx.map(function (j) { return [stamp, drop[j] === 'apperr' ? 'エラー記録（4日より前）' : '上書き済みの古い版'].concat(vals[j]); });
    ar.getRange(ar.getLastRow() + 1, 1, copy.length, copy[0].length).setValues(copy);
    結果.控えに移した = copy.length;
    // ③ 下の行から、つながった塊ごとに消す（シート上の行番号＝添え字+2）。新しい提出は一番下に足されるので影響しない
    var deleted = 0, k2 = idx.length - 1;
    while (k2 >= 0) {
      if (Date.now() - t0 > 300000) { 結果.時間切れ = '残り ' + (k2 + 1) + ' 行は次回（控えには写し済み）'; break; }
      var end = idx[k2], start = end;
      while (k2 - 1 >= 0 && idx[k2 - 1] === start - 1) { k2--; start = idx[k2]; }
      sh.deleteRows(start + 2, end - start + 1);
      deleted += end - start + 1; k2--;
    }
    結果.消した行 = deleted;
    結果.圧縮後の行数 = sh.getLastRow() - 1;
  }
  結果.秒 = Math.round((Date.now() - t0) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}

/* ■ 自動実行（2026-10-24 神田さん「まずは1をお願いします」→ 同日「毎晩」に変更）
 *   ★トリガーは英字の別名で登録する（日本語名の関数は「設定済み」と出ても毎回静かに失敗する）
 *   予約＝ 整理圧縮_毎晩の予約() を1回実行／解除＝ 整理圧縮_予約をすべて解除() */
var 圧縮_自動中_ = false;
function compactNightly() { 圧縮_自動中_ = true; try { return 整理圧縮を実行(); } finally { 圧縮_自動中_ = false; } }
function compactMonthly() { return compactNightly(); }   // 10/24 に入れた月1回の予約が残っていても動くように

function 整理圧縮_毎晩の予約() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'compactMonthly' || h === 'compactNightly') { ScriptApp.deleteTrigger(t); n++; }
  });
  ScriptApp.newTrigger('compactNightly').timeBased().everyDays(1).atHour(2).inTimezone('Asia/Tokyo').create();
  Logger.log('予約しました：毎晩2時台に整理圧縮（消した行は「_控え」タブへ・毎月1日は複製も）。外した古い予約 ' + n + '件');
  return { 結果: '予約しました', いつ: '毎晩2時台', 外した古い予約: n };
}

function 整理圧縮_予約をすべて解除() {
  var n = 0; ScriptApp.getProjectTriggers().forEach(function (t) { var h = t.getHandlerFunction(); if (h === 'compactMonthly' || h === 'compactNightly') { ScriptApp.deleteTrigger(t); n++; } });
  Logger.log('解除：' + n + '件'); return { 解除: n };
}
