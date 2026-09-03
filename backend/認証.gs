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
var AUTH_TOKEN_MAX = 10;         // 1アカウントで同時に有効なトークン数（店舗iPad＋スマホ等）
var AUTH_ROLES = ['staff', 'manager', 'owner', 'hq'];

/* 全員に配る性質のkind（店舗で絞らない）。
   news はアプリ側が target で出し分ける／community は「全店に公開」が仕様 */
var AUTH_PUBLIC_KINDS = ['community', 'commlike', 'commmod', 'commroll', 'commtry',
                         'news', 'study', 'linkset', 'faqset', 'submaster', 'subholiday'];
/* 本部だけが読めるkind（★公益通報は店舗端末に返さない＝通報者を守る） */
var AUTH_HQ_READ_KINDS = ['whistle', 'appfb'];
/* 本部だけが書けるkind（設定・判定・配信もの） */
var AUTH_HQ_WRITE_KINDS = ['submaster', 'substat', 'subholiday', 'news', 'linkset', 'faqset', 'study', 'commmod', 'commroll'];

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
  if (u.role !== 'hq') {
    if (AUTH_HQ_WRITE_KINDS.indexOf(kind) !== -1) return { ok: false, error: 'HQ_ONLY' };
    var store = String(data.store || '');
    if (store && store !== '*' && u.stores.indexOf(store) === -1) return { ok: false, error: 'STORE_NOT_ALLOWED' };
  }
  return { ok: true, u: u };
}
