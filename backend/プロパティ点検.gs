/** ============================================================
 * プロパティ点検.gs — Script Properties を「値を見せずに」点検する（2026-10-12）
 *
 * ■ なぜ要るか（神田さん「削除したプロパティが復活している。この現象がよく起きる。なぜ？」）
 *   GASの「プロジェクトの設定 → スクリプト プロパティ」の画面は、開いた時点の一覧を持っていて、
 *   「保存」を押すと その一覧をまるごと書き戻す。別のタブで消したものや、コードが途中で書き換えた値は、
 *   古い画面で保存した瞬間に元へ戻る（＝消したものが復活し、作り直した合言葉が古い値に戻る）。
 *   → 画面は1つだけ開き、編集の直前に必ず再読み込み（F5）してから直す。直したら この関数で確かめる。
 *
 * ■ 使い方：GASエディタで プロパティ_点検 を実行 → 実行ログに「名前・長さ・指紋（先頭8桁）」が出る。値そのものは出さない。
 *   手元の `_設定/USEN_POST_KEY.txt` の指紋と比べれば、一致しているかが分かる。
 * ============================================================ */

/* コードが自分で書き直すもの（消しても次の実行で戻る＝正常。消す必要も無い） */
var PROP_WRITTEN_BY_CODE = ['MIMAMORI_LAST_TS', 'MIMAMORI_TOKEN_SNAPSHOT', 'PL_CACHE_V3', 'PHOTO_PRIVATE_CURSOR', 'REVIEW_LAST', 'SK_ZENKIKAN_DONE', 'PHOTO_FOLDER_ID', 'WHISTLE_LOG_ID', 'AGG_SHEET_ID'];
/* 無いとアプリが止まる・危ないもの */
var PROP_REQUIRED = ['AUTH_PEPPER', 'USEN_POST_KEY', 'PHOTO_FOLDER_ID'];
/* 今のコードが読まないもの（残っていても害は無いが、消しても画面の古い保存で戻る） */
var PROP_UNUSED = ['READ_TAIL', 'RETURN_MAX', 'PL_CACHE_V1', 'PL_CACHE_V2'];

function prop_fp_(v) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(v), Utilities.Charset.UTF_8);
  return d.slice(0, 4).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function プロパティ_点検() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(all).sort();
  var lines = ['プロパティ ' + keys.length + ' 個（値は出しません）'];
  keys.forEach(function (k) {
    var v = String(all[k] == null ? '' : all[k]);
    var tag = PROP_REQUIRED.indexOf(k) >= 0 ? '【必須】' : PROP_WRITTEN_BY_CODE.indexOf(k) >= 0 ? '（コードが書く）' : PROP_UNUSED.indexOf(k) >= 0 ? '（未使用）' : '';
    var warn = (v !== v.trim()) ? ' ★前後に空白か改行' : '';
    lines.push('・' + k + '　長さ=' + v.length + '　指紋=' + prop_fp_(v) + '　' + tag + warn);
  });
  PROP_REQUIRED.forEach(function (k) { if (!all[k]) lines.push('★★ 無い: ' + k + (k === 'AUTH_PEPPER' ? '（消えると、ログインし直した人が入れなくなる。認証_ペッパーを設定 を実行）' : '')); });
  var out = lines.join('\n');
  Logger.log(out);
  return out;
}

/* ★2026-10-12 神田さん「編集して保存を押しても新しい値に変更されない」＝設定画面の保存が効かないとき用。
   画面を通さず、コードから合言葉を作り直す。実行ログに1回だけ値を出す → それを手元の `_設定/USEN_POST_KEY.txt` に
   そのまま貼る（メモ帳で全選択→貼り付け→保存。前後に空白・改行を入れない）。ログは本人しか見られない。
   作る値＝英字＋数字32文字。先頭は必ず g〜z の英字（数字だけ・1e5 のような形にならない＝getSetting_ が数に変えない） */
function USEN_合言葉を作り直す() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var head = 'ghjkmnpqrstuvwxyz';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  var s = '';
  for (var i = 0; i < 32; i++) s += abc.charAt(((bytes[i % bytes.length] + 256) % 256 + i * 7) % abc.length);
  s = head.charAt((bytes[0] + 256) % 256 % head.length) + s.slice(1);
  PropertiesService.getScriptProperties().setProperty('USEN_POST_KEY', s);
  var back = PropertiesService.getScriptProperties().getProperty('USEN_POST_KEY');
  Logger.log('USEN_POST_KEY を作り直しました（長さ=' + back.length + ' 指紋=' + prop_fp_(back) + '）。\n次の1行を _設定/USEN_POST_KEY.txt に貼ってください（この1行だけ・前後に空白なし）:\n' + back);
  return '作り直し済み（値は実行ログ）';
}

/* 今のコードが読まないプロパティを、画面を通さずに消す（画面の保存が効かないとき用）。コードが書くもの・必須のものは触らない */
function プロパティ_未使用を消す() {
  var sp = PropertiesService.getScriptProperties(); var done = [];
  PROP_UNUSED.forEach(function (k) { if (sp.getProperty(k) !== null) { sp.deleteProperty(k); done.push(k); } });
  Logger.log(done.length ? '消しました: ' + done.join(', ') : '消すものはありません');
  return done;
}
