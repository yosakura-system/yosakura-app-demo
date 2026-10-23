/**
 * 世桜アプリ｜ログイン（認証）モジュール
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ 仕組み（2026-08-25 設計）
 *   ・利用者は _users シートで管理（1人1行。店舗iPadは「店舗アカウント」として1行）
 *   ・仮パスワードは神田が発行（簡単なものでよい＝神田さんのご指示）→ 本部が一覧を保管
 *   ・各自が初回ログインで自分のパスワードへ変更（変更した時点で仮パスワードは無効）
 *   ・パスワードは平文で保存しない（SHA-256のハッシュのみ。発行一覧は本部の紙/メモが正）
 *
 * ■ 眠らせたまま入れられる
 *   Script Properties の ENABLE_AUTH が 'true' になるまで、読み書きの挙動は一切変わらない。
 *   （登録・ログインAPIだけ先に動く＝アプリ側の準備と並行できる）
 *
 * ■ 神田の操作（GASエディタから）
 *   認証_利用者を登録('uid', '名前', '役割', '店舗1／店舗2', '仮パスワード')
 *     役割 = staff / manager / owner / hq（staffは店舗iPad用の共用アカウント）
 *     既存uidに実行すると上書き＝パスワード再発行を兼ねる（忘れたときはこれ）
 *   認証_共有パスワードを設定('uid', 'パスワード')
 *     店舗の共有ID（店舗iPad＋スタッフのスマホで使い回す）用。初回変更の強制なし＝本部が決めたパスワードをそのまま全員で使う。
 *     実行すると全端末が強制ログアウト＝月1回の定期リセット・退職者が出た当日のリセットはこれ（2026-09-18 神田さん）
 *   認証_月次リセットの予約()   … 毎月1日 9時に「店舗iPadのID（ipad-*）だけ」を自動リセットする予約を入れる（1回実行すればよい）
 *   認証_店舗IDを月次リセット() … 予約から自動で走る本体。個人名義（店長・オーナー・本部）は触らない。新パスワードは本部のメールへ
 *   認証_一覧()   … 登録状況をログに出す（ハッシュは出さない）
 *   認証_削除('uid')
 *
 * ■ アプリからのAPI（doPost経由・JSONの action で分岐）
 *   {action:'login', uid, pw}            → {ok, auth:{token, uid, name, role, stores, mustChange}}
 *   {action:'chpw', token, oldPw, newPw} → {ok}（初回変更もこれ。成功で mustChange が消える）
 *   {action:'authping', token}           → {ok, auth:{…, enabled}}（起動時の状態確認）
 */

/* ===== 設定 ===== */
var AUTH_SHEET = '_users';
var AUTH_HEADERS = ['uid', 'name', 'role', 'stores', 'hash', 'must_change', 'tokens', 'updated', 'pw_at'];   // pw_at＝パスワードを最後に変えた日（2026-10-02・月初の変更の目印）
function auth_pwYm_(rec) { try { var d = rec && rec.pw_at ? new Date(rec.pw_at) : null; return (d && !isNaN(d.getTime())) ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM') : ''; } catch (e) { return ''; } }
/* ★1つのIDで同時にログインしていられる端末数。超えると古い端末から順に外れる。
   2026-09-03＝5→10へ（神田さんの実機で「急にログイン画面になった」＝
   検証で同じIDを複数の端末・ブラウザで使い、上限を超えて古い端末が押し出されていた）。
   ⚠️ 上限を無くさない＝退職者の端末が残り続けないようにするための歯止め。 */
var AUTH_TOKEN_MAX = 20;         // 1アカウントで同時に有効なトークン数（店舗iPad＋スタッフのスマホ）。2026-09-18＝10→20（店舗IDをスタッフのスマホでも共有する運用のため）
var AUTH_ROLES = ['staff', 'manager', 'owner', 'hq'];

/* 全員に配る性質のkind（店舗で絞らない）。
   news はアプリ側が target で出し分ける／community は「全店に公開」が仕様 */
var AUTH_PUBLIC_KINDS = ['community', 'commlike', 'commmod', 'commroll', 'commtry', 'commcmt',
                         'news', 'study', 'linkset', 'faqset', 'submaster', 'subholiday'];
/* 本部だけが読めるkind（★公益通報は店舗端末に返さない＝通報者を守る） */
var AUTH_HQ_READ_KINDS = ['whistle', 'appfb', 'hqtask', 'svcheck', 'svstd'];   // svcheck＝巡回チェック（本部の評価＝店舗端末には返さない）   // hqtask＝本部の個人タスク（試行）。さらに本人のuidにしか返さない（auth_row_ok_）
/* 本部だけが書けるkind（設定・判定・配信もの） */
var AUTH_HQ_WRITE_KINDS = ['submaster', 'substat', 'subholiday', 'news', 'linkset', 'faqset', 'study', 'commmod', 'commroll', 'hqtask', 'svcheck', 'svstd',
                           'hqack', 'gsnap'];   // ★2026-10-12 hqack（本部の対応済み・コメント）と gsnap（口コミの控え）は店舗の端末から書けない
/* 店舗の端末が店舗名なし（store=''）で書いてよいkind＝公益通報（匿名）と、数字の要確認の確認済み（まとめ送り）だけ。'*' は本部のみ（2026-10-12） */
var AUTH_NOSTORE_OK_KINDS = ['whistle', 'numack'];
/* ログインの総当たり対策（2026-10-12）＝同じIDで15分に10回失敗したら、15分のあいだ受けない */
var AUTH_LOCK_FAILS = 10; var AUTH_LOCK_SEC = 900;
function auth_cache_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }

function authOn_() { return getSetting_('ENABLE_AUTH', false) === true; }

/* ===== シート ===== */
function auth_sheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(AUTH_SHEET);
  if (!sh) { sh = ss.insertSheet(AUTH_SHEET); sh.appendRow(AUTH_HEADERS); }
  if (sh.getLastRow() === 0) sh.appendRow(AUTH_HEADERS);
  // 列を足したとき（pw_at・2026-10-02）＝見出しだけ補う。既存の行は空のまま＝「未変更」扱い
  try { if (String(sh.getRange(1, AUTH_HEADERS.length).getValue() || '') === '') sh.getRange(1, AUTH_HEADERS.length).setValue(AUTH_HEADERS[AUTH_HEADERS.length - 1]); } catch (e) {}
  return sh;
}
function auth_rows_() {
  var sh = auth_sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, AUTH_HEADERS.length).getValues().map(function (r, i) {
    var rec = {}; AUTH_HEADERS.forEach(function (h, c) { rec[h] = r[c]; });
    rec._row = i + 2; return rec;
  });
}
function auth_find_(uid) {
  var u = String(uid || '').trim();
  if (!u) return null;
  var hit = null;
  auth_rows_().forEach(function (rec) { if (String(rec.uid) === u) hit = rec; });
  return hit;
}
function auth_write_(rec) {
  var sh = auth_sheet_();
  var row = AUTH_HEADERS.map(function (h) { return rec[h] === undefined ? '' : rec[h]; });
  if (rec._row) sh.getRange(rec._row, 1, 1, AUTH_HEADERS.length).setValues([row]);
  else sh.appendRow(row);
}

/* ===== ハッシュ（平文は保存しない） ===== */
/* ★2026-10-12 Script Properties の AUTH_PEPPER（秘密の文字列）があれば HMAC にする＝_users が流出してもコードだけでは照合できない。
   無ければ従来どおり。従来のハッシュの行は、次に正しいパスワードで入ったときに新しい形へ置き換わる（auth_pw_ok_） */
function auth_pepper_() { try { return PropertiesService.getScriptProperties().getProperty('AUTH_PEPPER') || ''; } catch (e) { return ''; } }
function auth_hash_legacy_(uid, pw) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(uid) + '|' + String(pw), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
}
function auth_hash_(uid, pw) {
  var pep = auth_pepper_();
  if (!pep) return auth_hash_legacy_(uid, pw);
  var d = Utilities.computeHmacSha256Signature(String(uid) + '|' + String(pw), pep, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
}
/* 照合＝新しい形→従来の形の順。従来の形で合ったら新しい形に書き換えて保存する（rec は呼び出し側が auth_write_ する） */
function auth_pw_ok_(rec, uid, pw) {
  if (!rec) return false;
  if (rec.hash === auth_hash_(uid, pw)) return true;
  if (auth_pepper_() && rec.hash === auth_hash_legacy_(uid, pw)) { rec.hash = auth_hash_(uid, pw); return true; }
  return false;
}

/* ===== 神田の操作 ===== */
/* ★2026-10-12 スクリプト プロパティの画面が上限で足せないとき用＝コードから AUTH_PEPPER を1回だけ作る（既にあれば何もしない）。
   エディタでこの関数を実行。画面の上限は「表示の行数」なので、コードからなら入ることが多い。それでも入らなければ省略でよい（任意の強化） */
function 認証_ペッパーを設定() {
  var sp = PropertiesService.getScriptProperties();
  if (sp.getProperty('AUTH_PEPPER')) { Logger.log('AUTH_PEPPER は既にあります（変えない）'); return '既にあり'; }
  var pep = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  sp.setProperty('AUTH_PEPPER', pep);
  var n = Object.keys(sp.getProperties()).length;
  Logger.log('AUTH_PEPPER を設定しました（プロパティ数 ' + n + '）。値は表示しません。以後ログインした人から順に新しい形のハッシュに置き換わります');
  return 'OK（プロパティ数 ' + n + '）';
}
function 認証_利用者を登録(uid, name, role, storesSlash, tempPw) {
  uid = String(uid || '').trim();
  if (!uid) throw new Error('uid が空です');
  if (AUTH_ROLES.indexOf(role) === -1) throw new Error('役割は staff / manager / owner / hq のどれかにしてください：' + role);
  if (!tempPw || String(tempPw).length < 4) throw new Error('仮パスワードは4文字以上にしてください');
  var stores = String(storesSlash || '').split('／').map(function (s) { return s.trim(); }).filter(String);
  if (role !== 'hq' && !stores.length) throw new Error('本部以外は店舗を1つ以上入れてください（区切りは「／」）');
  var rec = auth_find_(uid) || {};
  rec.uid = uid; rec.name = String(name || ''); rec.role = role;
  rec.stores = stores.join('／');
  rec.hash = auth_hash_(uid, tempPw);
  rec.must_change = 'true';        // 仮パスワード＝初回に必ず変更してもらう
  rec.tokens = '[]';               // 再発行時は全端末からログアウト
  rec.updated = new Date(); rec.pw_at = new Date();
  auth_write_(rec);
  var out = { 結果: (rec._row ? '上書き（再発行）' : '新規登録'), uid: uid, 名前: rec.name, 役割: role, 店舗: rec.stores };
  Logger.log(JSON.stringify(out)); return out;
}
/* ★2026-09-18 店舗IDをスタッフのスマホでも共有する運用（神田さん）。
   認証_利用者を登録 は「仮パスワード＋初回に変更を強制」＝共有IDだと最初の1人が変えて他が入れなくなる。
   共有IDは本部が決めたパスワードをそのまま使う（must_change=false）。
   実行のたびに全端末が強制ログアウト＝新しいパスワードを知っている人だけがまた入れる（退職者はここで外れる）。
   例：認証_共有パスワードを設定('ipad-gyukatsu', 'gk2026-10') */
/* ★2026-10-22 神田さん「永井さん・秋定さん・ユンさんは本部でも現場に近い。いま使っているIDを店舗用（本店／牛カツ長堀橋／手巻き難波）にしてほしい。他の加盟店の情報は要らない」
   ＝そのIDを「店長・3店」に変える。パスワードはそのまま（hash・must_change・pw_at は触らない）。
   全端末のトークンを外す＝次に開いたときログイン画面になり、入り直すと新しい役割・店舗で動く（アプリは役割と店舗一覧をログイン時に覚えるため）。
   使い方（Apps Script の画面で関数を選んで実行）：
     認証_店舗用IDにする('nagai',   '日本料理世桜本店／牛カツ世桜 長堀橋店／手巻き寿司世桜 難波店')
     認証_店舗用IDにする('akisada', '日本料理世桜本店／牛カツ世桜 長堀橋店／手巻き寿司世桜 難波店')
     認証_店舗用IDにする('yun',     '日本料理世桜本店／牛カツ世桜 長堀橋店／手巻き寿司世桜 難波店')
   または 認証_3人を店舗用IDにする() で3人まとめて。デプロイは不要（実行だけ）。営業時間を避けて実行（その場でログアウトになるため） */
function 認証_店舗用IDにする(uid, storesSlash) {
  var rec = auth_find_(uid);
  if (!rec) throw new Error('見つかりません: ' + uid);
  var stores = String(storesSlash || '').split('／').map(function (s) { return s.trim(); }).filter(String);
  if (!stores.length) throw new Error('店舗を1つ以上入れてください（区切りは「／」）');
  var before = { 役割: rec.role, 店舗: rec.stores };
  rec.role = 'manager';
  rec.stores = stores.join('／');
  rec.tokens = '[]';               // 全端末からログアウト＝入り直すと店長・3店で動く
  rec.updated = new Date();
  auth_write_(rec);
  var out = { uid: uid, 名前: rec.name, 変更前: before, 変更後: { 役割: rec.role, 店舗: rec.stores }, パスワード: '変更していません（そのまま使えます）', 端末: '全端末ログアウト＝入り直し' };
  Logger.log(JSON.stringify(out)); return out;
}
function 認証_3人を店舗用IDにする() {
  var st = '日本料理世桜本店／牛カツ世桜 長堀橋店／手巻き寿司世桜 難波店';
  var out = ['nagai', 'akisada', 'yun'].map(function (u) { return 認証_店舗用IDにする(u, st); });
  Logger.log(JSON.stringify(out)); return out;
}

function 認証_共有パスワードを設定(uid, pw) {
  uid = String(uid || '').trim();
  var rec = auth_find_(uid);
  if (!rec) throw new Error('見つかりません: ' + uid + '（先に 認証_利用者を登録 で作ってください）');
  if (!pw || String(pw).length < 6) throw new Error('共有パスワードは6文字以上にしてください');
  rec.hash = auth_hash_(uid, pw);
  rec.must_change = 'false';       // 共有ID＝初回変更を強制しない
  rec.tokens = '[]';               // 全端末からログアウト（新パスワードで入り直す）
  rec.updated = new Date(); rec.pw_at = new Date();
  auth_write_(rec);
  var out = { 結果: '共有パスワードを設定・全端末ログアウト', uid: uid, 名前: rec.name, 役割: rec.role, 店舗: rec.stores, 同時ログイン上限: AUTH_TOKEN_MAX };
  Logger.log(JSON.stringify(out)); return out;
}
/* ★2026-09-18 神田さん「個人名義のIDは除外して、店舗iPadのIDだけ月1回リセット」
   対象＝uid が 'ipad-' で始まり、役割が staff のものだけ。店長・オーナー・本部の個人IDは一切触らない。
   新しいパスワードは「店舗の略称-年月-数字4桁」（例 gyukatsu-2610-4821）で自動生成し、
   シートには保存せず（ハッシュのみ）、本部のメール（Script Properties の AUTH_RESET_MAIL、無ければこのスクリプトの持ち主）へ送る。
   実行のたびに対象IDの全端末が強制ログアウト＝店舗iPadも含めて新パスワードで入り直し。 */
function 認証_店舗IDを月次リセット() {
  var now = new Date(); var ym = Utilities.formatDate(now, 'Asia/Tokyo', 'yyMM');
  var rows = auth_rows_().filter(function (r) { return String(r.uid).indexOf('ipad-') === 0 && String(r.role) === 'staff'; });
  var lines = [], done = [];
  rows.forEach(function (rec) {
    var pw = String(rec.uid).replace(/^ipad-/, '') + '-' + ym + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);   // ★2026-10-12 4桁の数字→英数8桁（総当たり対策）
    rec.hash = auth_hash_(rec.uid, pw); rec.must_change = 'false'; rec.tokens = '[]'; rec.updated = now; rec.pw_at = now;
    auth_write_(rec);
    lines.push(rec.stores + '　ID: ' + rec.uid + '　新パスワード: ' + pw);
    done.push({ uid: rec.uid, 店舗: rec.stores });
  });
  var to = getSetting_('AUTH_RESET_MAIL', '') || Session.getEffectiveUser().getEmail();
  if (done.length) {
    MailApp.sendEmail({ to: to, subject: '【世桜アプリ】店舗IDのパスワードを更新しました（' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy/MM/dd') + '）',
      body: '店舗iPadのID（スタッフのスマホと共有）のパスワードを月次で更新しました。\n店長へ新しいパスワードを伝えてください（iPadも入り直しが必要です）。\n個人名義のID（店長・オーナー・本部）は変更していません。\n\n' + lines.join('\n') + '\n\n※このメールは自動送信です。パスワードはシートには保存されていません（このメールが控えです）。' });
  }
  var out = { 結果: '店舗IDを月次リセット', 件数: done.length, 対象: done, 通知先: to, 個人名義: '変更なし' };
  Logger.log(JSON.stringify(out)); return out;
}
/* 予約＝毎月1日の9時（日本時間）。既に予約があれば増やさない。 */
function 認証_月次リセットの予約() {
  var exists = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === '認証_店舗IDを月次リセット'; });
  if (exists.length) { Logger.log('予約済み（' + exists.length + '件）'); return { 結果: '予約済み' }; }
  ScriptApp.newTrigger('認証_店舗IDを月次リセット').timeBased().onMonthDay(1).atHour(9).inTimezone('Asia/Tokyo').create();
  Logger.log('予約しました：毎月1日 9時に店舗iPadのID（ipad-*）だけをリセット');
  return { 結果: '予約しました', いつ: '毎月1日 9時', 対象: 'ipad-* のみ（個人名義は対象外）' };
}
function 認証_月次リセットの予約を解除() {
  var n = 0; ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === '認証_店舗IDを月次リセット') { ScriptApp.deleteTrigger(t); n++; } });
  Logger.log('解除: ' + n + '件'); return { 結果: '解除', 件数: n };
}
function 認証_一覧() {
  var out = auth_rows_().map(function (r) {
    return { uid: r.uid, 名前: r.name, 役割: r.role, 店舗: r.stores, 初回変更待ち: String(r.must_change) === 'true' };
  });
  Logger.log(JSON.stringify({ 件数: out.length, 一覧: out }, null, 2)); return out;
}
/* ★2026-08-29 神田さんのご要望＝担当店舗をあとから増減できるようにする。
   認証_利用者を登録 で登録し直すとパスワードが仮に戻ってしまうため、店舗だけを書き換える。
   例：認証_店舗を変更('nagai-ten', '日本料理世桜本店／手巻き寿司世桜 難波店')
   　　認証_店舗を変更('yun', '日本料理世桜本店')   ← 減らすときも同じ（残す店舗だけを書く） */
function 認証_店舗を変更(uid, storesSlash) {
  var rec = auth_find_(uid);
  if (!rec) throw new Error('見つかりません: ' + uid);
  var stores = String(storesSlash || '').split('／').map(function (s) { return s.trim(); }).filter(String);
  if (rec.role !== 'hq' && !stores.length) throw new Error('本部以外は店舗を1つ以上入れてください（区切りは「／」）');
  var before = rec.stores;
  rec.stores = stores.join('／');
  rec.updated = new Date();
  auth_write_(rec);
  var out = { uid: uid, 変更前: before, 変更後: rec.stores, パスワード: '変更していません（そのまま使えます）' };
  Logger.log(JSON.stringify(out)); return out;
}

/* ★2026-10-23 原さん（心斎橋）「名前の漢字を 原 和宏 に直して」＝名前だけ書き換える（パスワード・役割・店舗は触らない）。
   認証_利用者を登録 を使うと仮パスワードに戻って全端末ログアウトになるので、名前だけはこちら。
   使い方＝ 認証_名前を変更('hara', '原 和宏')。端末に残っている名前は本人が右上から直す（次のログインからはこの名前が入る） */
function 認証_名前を変更(uid, name) {
  var rec = auth_find_(uid);
  if (!rec) throw new Error('見つかりません: ' + uid);
  var before = rec.name;
  rec.name = String(name || '').trim();
  if (!rec.name) throw new Error('名前を入れてください');
  rec.updated = new Date();
  auth_write_(rec);
  var out = { uid: uid, 変更前: before, 変更後: rec.name, パスワード: '変更していません（そのまま使えます）' };
  Logger.log(JSON.stringify(out)); return out;
}

function 認証_削除(uid) {
  var rec = auth_find_(uid);
  if (!rec) { Logger.log('見つかりません: ' + uid); return { 結果: '見つかりません' }; }
  auth_sheet_().deleteRow(rec._row);
  Logger.log('削除しました: ' + uid); return { 結果: '削除しました', uid: uid };
}

/* ===== トークン ===== */
function auth_verify_(token) {
  var t = String(token || '').trim();
  if (!t) return null;
  var hit = null;
  auth_rows_().forEach(function (rec) {
    var list = []; try { list = JSON.parse(rec.tokens || '[]'); } catch (e) {}
    if (list.indexOf(t) !== -1) hit = rec;
  });
  if (!hit) return null;
  return { uid: hit.uid, name: hit.name, role: hit.role,
           stores: String(hit.stores || '').split('／').map(function (s) { return s.trim(); }).filter(String),
           mustChange: String(hit.must_change) === 'true', pwYm: auth_pwYm_(hit) };
}

/* ===== API（doPost から呼ばれる。該当しなければ null を返して通常の提出処理へ） ===== */
/* ★2026-09-20 同じIDで2台が同時にログインすると、トークン一覧の「読んで→足して→書く」が重なり、
   後から書いた方が先の分を消していた（長堀橋のiPad2台＝片方しか入れない）。ロックで1件ずつ処理する */
function auth_api_(data) {
  if (!data || !data.action) return null;
  if (data.action !== 'login' && data.action !== 'chpw' && data.action !== 'authping') return null;
  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return { ok: false, error: 'BUSY', retry: true }; }
  try { return auth_api_locked_(data); } finally { lock.releaseLock(); }
}
function auth_api_locked_(data) {
  if (data.action === 'login') {
    var rec = auth_find_(data.uid);
    /* ★2026-10-12 総当たり対策＝同じIDで失敗が続いたら、しばらく受けない（成功で解除） */
    var cache = auth_cache_(); var lk = 'lf:' + String(data.uid || '').trim().toLowerCase();
    var fails = 0; try { fails = Number((cache && cache.get(lk)) || 0); } catch (e) {}
    if (fails >= AUTH_LOCK_FAILS) return { ok: false, error: 'LOGIN_LOCKED', retryMin: Math.ceil(AUTH_LOCK_SEC / 60) };
    if (!rec || !auth_pw_ok_(rec, data.uid, data.pw)) {
      try { if (cache) cache.put(lk, String(fails + 1), AUTH_LOCK_SEC); } catch (e) {}
      return { ok: false, error: 'LOGIN_FAILED' };   // uidが無いのかパスワード違いかは区別して返さない
    }
    try { if (cache) cache.remove(lk); } catch (e) {}
    var list = []; try { list = JSON.parse(rec.tokens || '[]'); } catch (e) {}
    var token = Utilities.getUuid();
    list.push(token); while (list.length > AUTH_TOKEN_MAX) list.shift();
    rec.tokens = JSON.stringify(list); rec.updated = new Date();
    auth_write_(rec);
    return { ok: true, auth: { token: token, uid: rec.uid, name: rec.name, role: rec.role,
             stores: String(rec.stores || '').split('／').filter(String), mustChange: String(rec.must_change) === 'true', pwYm: auth_pwYm_(rec), api: 2 } };   // api:2＝読みもPOSTで受ける版（2026-10-12）
  }
  if (data.action === 'chpw') {
    var u = auth_verify_(data.token);
    if (!u) return { ok: false, error: 'AUTH_REQUIRED', needLogin: true };
    var rec2 = auth_find_(u.uid);
    if (!auth_pw_ok_(rec2, u.uid, data.oldPw)) return { ok: false, error: 'OLDPW_WRONG' };
    if (!data.newPw || String(data.newPw).length < 6) return { ok: false, error: 'NEWPW_TOO_SHORT' };  // 自分で決める方は6文字以上
    rec2.hash = auth_hash_(u.uid, data.newPw);
    rec2.must_change = 'false'; rec2.updated = new Date(); rec2.pw_at = new Date();
    /* ★2026-10-02 神田さん＝責任者が店舗iPadでパスワードを変えたら、その時点でほかの端末（スタッフのスマホ・別のiPad）は
       ログインできなくなる。変えた端末だけは残す（入り直し不要）。新しいパスワードは責任者が在籍スタッフへ */
    if (data.kickOthers) rec2.tokens = JSON.stringify([String(data.token)]);
    auth_write_(rec2);
    return { ok: true, pwYm: auth_pwYm_(rec2), kicked: !!data.kickOthers };
  }
  if (data.action === 'authping') {
    var u2 = auth_verify_(data.token);
    return { ok: true, auth: u2 ? { uid: u2.uid, name: u2.name, role: u2.role, stores: u2.stores,
             mustChange: u2.mustChange, pwYm: u2.pwYm, enabled: authOn_(), api: 2 } : { enabled: authOn_(), api: 2 } };
  }
  return null;
}

/* ★2026-10-09 増田さんの実機＝有効なトークンなのに、提出の返事1回だけ「見つからない」が出た（12:37 AUTHKEEP×2。
   直後の authping では有効）。読み直しで戻る揺れとみて、見つからなければ少し待って読み直す。
   それでも無ければ AUTHMISS として本部データへ残す（uidは分からないのでトークン末尾と件数だけ） */
function auth_verify_retry_(token, why) {
  var u = auth_verify_(token);
  if (u) return u;
  var t = String(token || '').trim();
  if (!t) return null;
  Utilities.sleep(250);
  try { SpreadsheetApp.flush(); } catch (e) {}
  u = auth_verify_(token);
  if (u) { auth_logMiss_('AUTHRETRY', t, why); return u; }   // 読み直しで見つかった＝揺れ
  auth_logMiss_('AUTHMISS', t, why);                           // 2回とも無い＝本当に無効
  return null;
}
function auth_logMiss_(code, token, why) {
  try {
    if (typeof getSheet !== 'function') return;
    /* ★2026-10-12 偽トークンを連打されても行が増え続けないように、同じ末尾4桁は1時間に1回だけ記録する */
    var c = auth_cache_(); var ck = 'miss:' + code + ':' + String(token || '').slice(-4);
    try { if (c && c.get(ck)) return; if (c) c.put(ck, '1', 3600); } catch (e) {}
    var rows = 0; try { rows = auth_rows_().length; } catch (e) {}
    var note = JSON.stringify({ code: code, why: String(why || ''), tok: String(token).slice(-4), users: rows, t: Date.now() });
    getSheet().appendRow([Utilities.getUuid(), Date.now(), 'apperr', '本部', code, '', note, '[]']);
  } catch (e) {}
}

/* ===== 読み（doGet）の門番 ===== */
function auth_gate_get_(e) {
  if (!authOn_()) return { ok: true, u: null };      // ★フラグOFF＝従来どおり素通し
  var u = auth_verify_retry_(e && e.parameter && e.parameter.token, 'get');
  return u ? { ok: true, u: u } : { ok: false };
}
/* その行を、この利用者に返してよいか */
function auth_row_ok_(u, kind, store, item) {
  /* ★本部の個人タスク（試行・2026-09-15 神田さんのご要望）＝item に持ち主のuid。本人にしか返さない
     （本部の他の方にも出さない＝一元管理表との二重管理にならない範囲で本人が試す） */
  if (kind === 'hqtask') return !!u && u.role === 'hq' && String(item || '') === String(u.uid || '');
  if (!u || u.role === 'hq') return true;
  if (AUTH_HQ_READ_KINDS.indexOf(kind) !== -1) return false;      // ★公益通報・ご意見は本部のみ
  if (AUTH_PUBLIC_KINDS.indexOf(kind) !== -1) return true;
  /* ★hqack（受信箱の対応済み＋本部コメント）は、対象の報告の店舗にだけ返す（2026-08-31）。
     行のstore列は初期の記録が「all」のため、キー（item＝種類|時刻|店舗名）の3要素目で判定する。
     こうすると過去に付けたコメントも、その店舗の端末に正しく届く。 */
  if (kind === 'hqack') {
    var ks = String(item || '').split('|');
    var st = ks.length >= 3 ? ks.slice(2).join('|') : '';
    return !st || u.stores.indexOf(st) !== -1;
  }
  if (!store || store === '*') return true;                        // 全体設定
  return u.stores.indexOf(String(store)) !== -1;                   // 自店（オーナーは所有店すべて）
}

/* ===== 書き（doPost）の門番 ===== */
function auth_gate_post_(data) {
  if (!authOn_()) return { ok: true, u: null };      // ★フラグOFF＝従来どおり素通し
  var kind = String(data.kind || '');
  /* ★2026-10-09 画面エラーの控え（apperr）だけはトークンが無効でも受ける＝ログインが外れた瞬間の記録（AUTHDROP）を残すため。
     中身は端末の状態の文字列だけ（写真なし・他の種類には適用しない） */
  if (kind === 'apperr') {
    /* ★2026-10-12 ログインなしで受けるぶん、中身を絞る＝写真は受けない・本文は1500字まで（本部Driveに置かせない・行を膨らませない） */
    if (Array.isArray(data.photos) && data.photos.length) return { ok: false, error: 'NO_PHOTO' };
    data.photos = []; data.note = String(data.note || '').slice(0, 1500);
    return { ok: true, u: null };
  }
  var u = auth_verify_retry_(data && data.token, 'post:' + kind);
  if (!u) return { ok: false, error: 'AUTH_REQUIRED' };
  /* ★2026-10-12 仮パスワードのまま（初回変更がまだ）では提出できない。先にパスワードを変える（アプリは変更画面を出す） */
  if (u.mustChange) return { ok: false, error: 'PW_CHANGE_REQUIRED' };
  /* ★個人タスクは本人（item=自分のuid）しか書けない。本部でも他人のぶんは書けない */
  if (kind === 'hqtask' && (u.role !== 'hq' || String(data.item || '') !== String(u.uid || ''))) return { ok: false, error: 'HQ_ONLY' };
  if (u.role !== 'hq') {
    if (AUTH_HQ_WRITE_KINDS.indexOf(kind) !== -1) return { ok: false, error: 'HQ_ONLY' };
    var store = String(data.store || '');
    /* ★2026-10-12 店舗の端末は「自店」だけ。'*'（全店）は本部のみ、空は公益通報（匿名）と numack のまとめ送りだけ */
    if (store === '*') return { ok: false, error: 'STORE_NOT_ALLOWED' };
    if (!store) { if (AUTH_NOSTORE_OK_KINDS.indexOf(kind) === -1) return { ok: false, error: 'STORE_NOT_ALLOWED' }; }
    else if (u.stores.indexOf(store) === -1) return { ok: false, error: 'STORE_NOT_ALLOWED' };
    /* ★2026-10-12 「レジ取込（usen）」「総括表取込（drive）」の印は本部の仕組みだけが付ける。店舗の端末からの印は外す */
    try {
      var n = (typeof data.note === 'string') ? JSON.parse(data.note) : data.note;
      if (n && typeof n === 'object' && !Array.isArray(n) && (n.src === 'usen' || n.src === 'drive')) { delete n.src; data.note = JSON.stringify(n); }
    } catch (e) {}
  }
  return { ok: true, u: u };
}

/* ★2026-10-20 案Bの全店リリース（ベトナム2店以外の10店）で、店舗IDとパスワードをそろえて配る（神田さん決定）。
   ・IDが無い5店＝新しく作る／IDがある5店＝新しいパスワードに変える（その5店の端末は一度ログアウト＝新しいパスワードで入り直し）
   ・共有ID（初回変更なし）。店舗iPadでもスタッフのスマホでも同じIDで入れる
   ・パスワードはシートに残らない（ハッシュのみ）。実行ログから写して、店ごとに個別のLINEで伝える
   ・店長・オーナー・本部の個人IDは触らない
   貼る場所＝「世桜アプリ_本部データ」のApps Script の 認証.gs の末尾。実行＝関数「認証_全店の店舗IDを配る」 */
function 認証_全店の店舗IDを配る() {
  var list = [
    ['ipad-honten',            '日本料理世桜本店'],
    ['ipad-unagi-nagahoribashi', '日本鰻世桜 長堀橋店'],
    ['ipad-gyukatsu',          '牛カツ世桜 長堀橋店'],
    ['ipad-namba',             '手巻き寿司世桜 難波店'],
    ['ipad-shinsaibashi',      '寿司世桜 心斎橋店'],
    ['ipad-gion',              '日本鰻世桜 京都祇園店'],
    ['ipad-asakusabashi',      '日本鰻世桜 浅草橋店'],
    ['ipad-hiroshima',         '和牛世桜 広島店'],
    ['ipad-fuji-gyukatsu',     '牛カツ世桜 富士山店'],
    ['ipad-fuji-unagi',        '日本鰻世桜 富士山店']
  ];
  var ym = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyMM');
  var out = [];
  list.forEach(function (x) {
    var uid = x[0], store = x[1];
    var pw = String(100000 + Math.floor(Math.random() * 900000));   // ★10/20 神田さん「もっと簡単に」＝6桁の数字（IDから推測できない・総当たりは15分10回で止まる・毎月変わる）
    var had = !!auth_find_(uid);
    if (!had) 認証_利用者を登録(uid, '店舗iPad（' + store + '）', 'staff', store, pw);
    認証_共有パスワードを設定(uid, pw);
    out.push(store + '｜' + (had ? '変更' : '新規') + '｜ID：' + uid + '｜パスワード：' + pw);
  });
  Logger.log('\n' + out.join('\n'));
  return out;
}

/* ★2026-10-20 神田さん「全体LINEで送るので、そのあと必ずパスワードを変えるよう促して」
   ＝店舗ID（ipad-*）の pw_at（最後に変えた日）を空にする→ログイン後の全画面に「今月のパスワードが未変更です。責任者の方はここを押して変更」の帯が出る。
   責任者が変えると pw_at が入り、帯は消える。パスワード・ログイン中の端末は触らない */
function 認証_店舗IDの変更を促す() {
  var out = [];
  auth_rows_().filter(function (r) { return String(r.uid).indexOf('ipad-') === 0 && String(r.role) === 'staff'; }).forEach(function (rec) {
    rec.pw_at = ''; auth_write_(rec); out.push(rec.uid);
  });
  Logger.log('帯を出す：' + out.join(' / '));
  return out;
}

/* ★2026-10-20 店舗責任者の個人ID（案Bの全店リリース）。神田さん「オーナー・店長で分けず店舗責任者で」
   ＝1店舗だけを見る人は役割 manager（アプリ上の表示は「店長」）。長田さん（富士山2店）はオーナーのまま触らない。
   すでにあるIDは飛ばす。仮パスワード（6桁）＝最初のログインで本人が自分のパスワードに変える */
function 認証_店舗責任者を発行() {
  var list = [
    ['hara',     '原 和宏',   '寿司世桜 心斎橋店'],
    ['ishimoto', '石本 正道', '日本鰻世桜 京都祇園店'],
    ['kuratani', '倉谷 勇光', '和牛世桜 広島店'],
    ['ido',      '井戸',      '日本鰻世桜 長堀橋店'],
    ['dobashi',  '土橋 健太', '日本鰻世桜 浅草橋店']
  ];
  var out = [];
  list.forEach(function (x) {
    if (auth_find_(x[0])) { out.push(x[2] + '｜' + x[1] + '｜ID：' + x[0] + '｜すでにあるので飛ばした'); return; }
    var pw = String(100000 + Math.floor(Math.random() * 900000));
    認証_利用者を登録(x[0], x[1], 'manager', x[2], pw);
    out.push(x[2] + '｜' + x[1] + '｜ID：' + x[0] + '｜仮パスワード：' + pw);
  });
  Logger.log(out.join(' ／ '));
  return out;
}
