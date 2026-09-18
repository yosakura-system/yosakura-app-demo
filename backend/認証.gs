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
var AUTH_HEADERS = ['uid', 'name', 'role', 'stores', 'hash', 'must_change', 'tokens', 'updated'];
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
var AUTH_HQ_WRITE_KINDS = ['submaster', 'substat', 'subholiday', 'news', 'linkset', 'faqset', 'study', 'commmod', 'commroll', 'hqtask', 'svcheck', 'svstd'];

function authOn_() { return getSetting_('ENABLE_AUTH', false) === true; }

/* ===== シート ===== */
function auth_sheet_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(AUTH_SHEET);
  if (!sh) { sh = ss.insertSheet(AUTH_SHEET); sh.appendRow(AUTH_HEADERS); }
  if (sh.getLastRow() === 0) sh.appendRow(AUTH_HEADERS);
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
function auth_hash_(uid, pw) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(uid) + '|' + String(pw), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
}

/* ===== 神田の操作 ===== */
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
  rec.updated = new Date();
  auth_write_(rec);
  var out = { 結果: (rec._row ? '上書き（再発行）' : '新規登録'), uid: uid, 名前: rec.name, 役割: role, 店舗: rec.stores };
  Logger.log(JSON.stringify(out)); return out;
}
/* ★2026-09-18 店舗IDをスタッフのスマホでも共有する運用（神田さん）。
   認証_利用者を登録 は「仮パスワード＋初回に変更を強制」＝共有IDだと最初の1人が変えて他が入れなくなる。
   共有IDは本部が決めたパスワードをそのまま使う（must_change=false）。
   実行のたびに全端末が強制ログアウト＝新しいパスワードを知っている人だけがまた入れる（退職者はここで外れる）。
   例：認証_共有パスワードを設定('ipad-gyukatsu', 'gk2026-10') */
function 認証_共有パスワードを設定(uid, pw) {
  uid = String(uid || '').trim();
  var rec = auth_find_(uid);
  if (!rec) throw new Error('見つかりません: ' + uid + '（先に 認証_利用者を登録 で作ってください）');
  if (!pw || String(pw).length < 6) throw new Error('共有パスワードは6文字以上にしてください');
  rec.hash = auth_hash_(uid, pw);
  rec.must_change = 'false';       // 共有ID＝初回変更を強制しない
  rec.tokens = '[]';               // 全端末からログアウト（新パスワードで入り直す）
  rec.updated = new Date();
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
    var pw = String(rec.uid).replace(/^ipad-/, '') + '-' + ym + '-' + String(Math.floor(1000 + Math.random() * 9000));
    rec.hash = auth_hash_(rec.uid, pw); rec.must_change = 'false'; rec.tokens = '[]'; rec.updated = now;
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
           mustChange: String(hit.must_change) === 'true' };
}

/* ===== API（doPost から呼ばれる。該当しなければ null を返して通常の提出処理へ） ===== */
function auth_api_(data) {
  if (!data || !data.action) return null;
  if (data.action === 'login') {
    var rec = auth_find_(data.uid);
    if (!rec || rec.hash !== auth_hash_(data.uid, data.pw)) {
      return { ok: false, error: 'LOGIN_FAILED' };   // uidが無いのかパスワード違いかは区別して返さない
    }
    var list = []; try { list = JSON.parse(rec.tokens || '[]'); } catch (e) {}
    var token = Utilities.getUuid();
    list.push(token); while (list.length > AUTH_TOKEN_MAX) list.shift();
    rec.tokens = JSON.stringify(list); rec.updated = new Date();
    auth_write_(rec);
    return { ok: true, auth: { token: token, uid: rec.uid, name: rec.name, role: rec.role,
             stores: String(rec.stores || '').split('／').filter(String), mustChange: String(rec.must_change) === 'true' } };
  }
  if (data.action === 'chpw') {
    var u = auth_verify_(data.token);
    if (!u) return { ok: false, error: 'AUTH_REQUIRED', needLogin: true };
    var rec2 = auth_find_(u.uid);
    if (rec2.hash !== auth_hash_(u.uid, data.oldPw)) return { ok: false, error: 'OLDPW_WRONG' };
    if (!data.newPw || String(data.newPw).length < 6) return { ok: false, error: 'NEWPW_TOO_SHORT' };  // 自分で決める方は6文字以上
    rec2.hash = auth_hash_(u.uid, data.newPw);
    rec2.must_change = 'false'; rec2.updated = new Date();
    auth_write_(rec2);
    return { ok: true };
  }
  if (data.action === 'authping') {
    var u2 = auth_verify_(data.token);
    return { ok: true, auth: u2 ? { uid: u2.uid, name: u2.name, role: u2.role, stores: u2.stores,
             mustChange: u2.mustChange, enabled: authOn_() } : { enabled: authOn_() } };
  }
  return null;
}

/* ===== 読み（doGet）の門番 ===== */
function auth_gate_get_(e) {
  if (!authOn_()) return { ok: true, u: null };      // ★フラグOFF＝従来どおり素通し
  var u = auth_verify_(e && e.parameter && e.parameter.token);
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
  var u = auth_verify_(data && data.token);
  if (!u) return { ok: false, error: 'AUTH_REQUIRED' };
  var kind = String(data.kind || '');
  /* ★個人タスクは本人（item=自分のuid）しか書けない。本部でも他人のぶんは書けない */
  if (kind === 'hqtask' && (u.role !== 'hq' || String(data.item || '') !== String(u.uid || ''))) return { ok: false, error: 'HQ_ONLY' };
  if (u.role !== 'hq') {
    if (AUTH_HQ_WRITE_KINDS.indexOf(kind) !== -1) return { ok: false, error: 'HQ_ONLY' };
    var store = String(data.store || '');
    if (store && store !== '*' && u.stores.indexOf(store) === -1) return { ok: false, error: 'STORE_NOT_ALLOWED' };
  }
  return { ok: true, u: u };
}
