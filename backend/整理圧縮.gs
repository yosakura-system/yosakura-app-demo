/** ============================================================
 * 整理圧縮.gs — reports の「上書きされて役目を終えた行」を圧縮する
 *
 * ■ なぜ要るか（2026-09-10）
 *   バックエンドは追記式＝同じ提出のやり直し・毎時取込の更新・チェックの操作が全部行として残る。
 *   アプリは「直近READ_TAIL行」しか読まないため、行数が窓を超えると古いデータが押し出されて
 *   「過去のサーベイが消えた」ように見える（実際に3回発生）。
 *   表示は常に「最新の行が正」なので、**古い方の行は消しても表示は1つも変わらない**。
 *
 * ■ 圧縮するもの（最新1行だけ残す）
 *   ・soukatsu（総括表）＝店舗×日付ごと。アプリ入力と取込は別々に最新を残す（アプリ優先の表示を壊さない）
 *   ・ckdone（チェックリスト実施）＝店舗×項目キーごと
 *   ・gsnap（Google口コミの日次記録）＝店舗×日付ごと
 *   それ以外の種類（写真提出・気づき・サーベイ・対応済み・お知らせ等）は一切触らない。
 *
 * ■ 使い方
 *   1. 整理圧縮_下見() … 何行減るかを見るだけ（書き込みなし）
 *   2. 整理圧縮を実行() … バックアップ（スプレッドシートの複製）を作ってから圧縮
 *   ※ 実行後、アプリは次の同期で自動的に追いつく（表示は変わらない・軽くなるだけ）
 * ============================================================ */

function 整理圧縮_下見() { return 圧縮_(false); }

function 整理圧縮を実行() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log('別の処理が実行中のため見送り'); return { 見送り: true }; }
  try { return 圧縮_(true); }
  finally { lock.releaseLock(); }
}

function 圧縮_(書き込む) {
  var sh = getSheet();
  var last = sh.getLastRow();
  if (last < 2) return { 行: 0 };
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();

  var keyOf = function (r, p) {
    var kind = String(r[2] || '');
    if (kind === 'soukatsu') {
      if (!p || !p.date) return null;
      var d = p.date;
      var ds = (d && d.getTime) ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') : String(d);
      return 'sk|' + r[3] + '|' + ds + '|' + (p.src ? 'drive' : 'app');
    }
    if (kind === 'ckdone') return 'ck|' + r[3] + '|' + String(r[4] || '');
    if (kind === 'gsnap') {
      var it = r[4];
      var ds2 = (it && it.getTime) ? Utilities.formatDate(it, 'Asia/Tokyo', 'yyyy-MM-dd') : String(it || '');
      return 'gs|' + r[3] + '|' + ds2;
    }
    return null; // 圧縮の対象外＝必ず残す
  };

  var best = {};           // key -> { i, t }  最新の行
  var drop = {};           // 消してよい行の添え字
  var 内訳 = { soukatsu: 0, ckdone: 0, gsnap: 0 };
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    var p = null; var note = String(r[6] || '');
    if (note.charAt(0) === '{') { try { p = JSON.parse(note); } catch (e) { p = null; } }
    var k = keyOf(r, p);
    if (!k) continue;
    var t = Number(r[1]) || 0;
    var cur = best[k];
    if (!cur) { best[k] = { i: i, t: t }; continue; }
    var kindName = String(r[2]);
    if (t >= cur.t) { drop[cur.i] = 1; best[k] = { i: i, t: t }; }
    else drop[i] = 1;
    内訳[kindName] = (内訳[kindName] || 0) + 1;
  }
  var dropCount = Object.keys(drop).length;
  var 結果 = {
    現在の行数: vals.length,
    減らせる行数: dropCount,
    圧縮後の行数: vals.length - dropCount,
    内訳: 内訳,
    読み窓: 'READ_TAIL=' + READ_TAIL,
    書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）'
  };
  if (書き込む && dropCount > 0) {
    // ① バックアップ＝スプレッドシートごと複製（万一の戻し先）
    var file = DriveApp.getFileById(getSS_().getId());
    var bk = file.makeCopy('世桜アプリ_本部データ_圧縮前バックアップ_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm'));
    結果.バックアップ = bk.getName();
    // ② 残す行だけを書き直す。
    //    ★clearContent は読んだ範囲だけ＝実行中に届いた新しい提出（この範囲の下に追記される）は消えない
    var keep = [];
    for (var i2 = 0; i2 < vals.length; i2++) { if (!drop[i2]) keep.push(vals[i2]); }
    sh.getRange(2, 1, vals.length, HEADERS.length).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, HEADERS.length).setValues(keep);
  }
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}
