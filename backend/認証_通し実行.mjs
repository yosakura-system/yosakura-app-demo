/**
 * 世桜アプリ｜認証（ログイン）の通し実行 — Googleに接続せずに確かめる
 *
 *   node 認証_通し実行.mjs
 *
 * 確かめること
 *   ① ENABLE_AUTH が false（既定）のあいだは、読み書きの挙動が一切変わらない
 *   ② 登録：パスワードの平文がシートに残らない／仮パスワードは初回変更フラグ付き
 *   ③ ログイン：正しいときだけトークンが出る。失敗の理由は細かく返さない
 *   ④ パスワード変更：旧が合うときだけ／変更後は旧パスワードで入れない／初回フラグが消える
 *   ⑤ 読みの絞り込み：店舗の端末には自店＋全体のものだけ。公益通報・ご意見は返さない。本部は全部
 *   ⑥ 書きの門番：他店への提出・本部専用kindへの書き込みを弾く
 *   ⑦ 再発行（同じuidで登録し直し）＝全端末のトークンが無効になる
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(ここ, f), 'utf8');
const コード = rd('Code.gs') + '\n' + rd('認証.gs');

let 通過 = 0; const 失敗 = [];
function 確認(名前, 条件, 詳細) {
  if (条件) { 通過++; console.log(`  PASS  ${名前}`); }
  else { 失敗.push({ 名前, 詳細 }); console.log(`  FAIL  ${名前}${詳細 !== undefined ? `  → ${JSON.stringify(詳細)}` : ''}`); }
}

/* ===== 偽のGAS ===== */
function 偽環境を作る({ プロパティ初期値 = {} } = {}) {
  class 偽シート {
    constructor(名前) { this.名前 = 名前; this.data = []; }
    getName() { return this.名前; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 1); }
    appendRow(row) { this.data.push(row.slice()); }
    deleteRow(n) { this.data.splice(n - 1, 1); }
    deleteRows(s, c) { this.data.splice(s - 1, c); }
    getRange(row, col, nR = 1, nC = 1) {
      const sh = this;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < nR; r++) {
            const 元 = sh.data[row - 1 + r] || []; const 行 = [];
            for (let c = 0; c < nC; c++) 行.push(元[col - 1 + c] === undefined ? '' : 元[col - 1 + c]);
            out.push(行);
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((行, r) => {
            const y = row - 1 + r;
            while (sh.data.length <= y) sh.data.push([]);
            行.forEach((v, c) => { sh.data[y][col - 1 + c] = v; });
          });
        },
        getValue() { return this.getValues()[0][0]; },
        setValue(v) { this.setValues([[v]]); }
      };
    }
  }
  const シート群 = {};
  const ss = {
    getName: () => '偽スプレッドシート', getId: () => 'FAKE_SS',
    getSheetByName: (n) => シート群[n] || null,
    insertSheet: (n) => { シート群[n] = new 偽シート(n); return シート群[n]; }
  };
  const プロパティ = new Map(Object.entries(プロパティ初期値).map(([k, v]) => [k, String(v)]));
  let uuid = 0;
  const ctx = {
    Logger: { log: () => {} }, console, JSON, Date, Object, String, Number, Array, Math, Error, RegExp,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (プロパティ.has(k) ? プロパティ.get(k) : null),
      setProperty: (k, v) => プロパティ.set(k, String(v)) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      getUuid: () => `uuid-${++uuid}`
    },
    ContentService: { MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) },
    ScriptApp: { getProjectTriggers: () => [] },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'yosakura.fc@gmail.com' }) },
    DriveApp: { getFolderById: () => { throw new Error('通し実行ではDriveを使わない'); },
                getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => { throw new Error('通し実行ではDriveを使わない'); } }
  };
  vm.createContext(ctx);
  vm.runInContext(コード, ctx, { filename: 'Code+認証.gs' });
  return { ctx, シート群, プロパティ };
}
const 実行 = (env, 式) => vm.runInContext(式, env.ctx);
const GET = (env, params = {}) => JSON.parse(実行(env, `doGet(${JSON.stringify({ parameter: params })}).getContent()`));
const POST = (env, body) => JSON.parse(実行(env, `doPost({ postData: { contents: ${JSON.stringify(JSON.stringify(body))} } }).getContent()`));

/* テストデータ：2店舗ぶんの提出＋全体設定＋公益通報 */
function データを入れる(env) {
  実行(env, `getSheet()`);
  const sh = env.シート群['reports'];
  const t = Date.now();
  sh.appendRow(['r1', t, 'subrec', '和牛世桜 広島店', 'openphoto', '', '', '[]']);
  sh.appendRow(['r2', t, 'subrec', '寿司世桜 心斎橋店', 'openphoto', '', '', '[]']);
  sh.appendRow(['r3', t, 'soukatsu', '和牛世桜 広島店', '', '', '{}', '[]']);
  sh.appendRow(['r4', t, 'linkset', '', '', '', '[]', '[]']);
  sh.appendRow(['r5', t, 'community', '寿司世桜 心斎橋店', 'clean', '', '{}', '[]']);
  sh.appendRow(['r6', t, 'whistle', '和牛世桜 広島店', '', '', '{}', '[]']);
  sh.appendRow(['r7', t, 'emg', '和牛世桜 広島店', '', '', '{}', '[]']);
}

console.log('\n===== ① フラグOFF（既定）＝挙動が変わらない =====\n');
{
  const env = 偽環境を作る({});
  データを入れる(env);
  const d = GET(env, {});
  確認('トークン無しで全行が返る（従来どおり）', d.ok && d.reports.length === 7, d.reports && d.reports.length);
  const p = POST(env, { kind: 'kizuki', store: '和牛世桜 広島店', item: 'x', note: '', photos: [], t: Date.now() });
  確認('トークン無しで提出できる（従来どおり）', p.ok === true, p);
  確認('ENABLE_AUTH は未設定＝既定でOFF', 実行(env, 'authOn_()') === false);
}

console.log('\n===== ② 登録＝平文を残さない =====\n');
{
  const env = 偽環境を作る({});
  実行(env, `認証_利用者を登録('hiroshima-ipad', '和牛世桜 広島店 iPad', 'staff', '和牛世桜 広島店', 'sakura01')`);
  const 生 = JSON.stringify(env.シート群['_users'].data);
  確認('_users シートに行ができる', env.シート群['_users'].data.length === 2);
  確認('★仮パスワードの平文がシートに無い', !生.includes('sakura01'), 生.slice(0, 120));
  確認('初回変更フラグが立っている', 生.includes('true'));
  let err = '';
  try { 実行(env, `認証_利用者を登録('x', 'x', 'tencho', '店', 'sakura01')`); } catch (e) { err = String(e.message); }
  確認('役割の書き間違いは登録できない', err.includes('staff / manager / owner / hq'), err);
}

console.log('\n===== ③④ ログインとパスワード変更 =====\n');
{
  const env = 偽環境を作る({});
  実行(env, `認証_利用者を登録('hara', '原さん', 'manager', '寿司世桜 心斎橋店', 'sakura02')`);
  const ng = POST(env, { action: 'login', uid: 'hara', pw: 'machigai' });
  確認('間違ったパスワードでは入れない', ng.ok === false && ng.error === 'LOGIN_FAILED', ng);
  const ng2 = POST(env, { action: 'login', uid: 'inai', pw: 'sakura02' });
  確認('存在しないIDでも同じ返答（uidの有無を教えない）', ng2.ok === false && ng2.error === 'LOGIN_FAILED', ng2);
  const okA = POST(env, { action: 'login', uid: 'hara', pw: 'sakura02' });
  確認('正しいときだけトークンが出る', okA.ok && !!okA.auth.token, okA);
  確認('役割と店舗が返る（アプリ側で固定に使う）', okA.auth.role === 'manager' && okA.auth.stores[0] === '寿司世桜 心斎橋店', okA.auth);
  確認('仮パスワード＝初回変更が必要と返る', okA.auth.mustChange === true, okA.auth);

  const ch1 = POST(env, { action: 'chpw', token: okA.auth.token, oldPw: 'machigai', newPw: 'watashi-no-pw' });
  確認('旧パスワードが違うと変更できない', ch1.ok === false && ch1.error === 'OLDPW_WRONG', ch1);
  const ch2 = POST(env, { action: 'chpw', token: okA.auth.token, oldPw: 'sakura02', newPw: 'abc' });
  確認('新パスワードが短すぎると弾く（6文字以上）', ch2.ok === false && ch2.error === 'NEWPW_TOO_SHORT', ch2);
  const ch3 = POST(env, { action: 'chpw', token: okA.auth.token, oldPw: 'sakura02', newPw: 'watashi-no-pw' });
  確認('正しく変更できる', ch3.ok === true, ch3);
  const old = POST(env, { action: 'login', uid: 'hara', pw: 'sakura02' });
  確認('★変更後は仮パスワードで入れない', old.ok === false, old);
  const now = POST(env, { action: 'login', uid: 'hara', pw: 'watashi-no-pw' });
  確認('新しいパスワードで入れる／初回変更は済み', now.ok && now.auth.mustChange === false, now.auth);
}

console.log('\n===== ⑤ 読みの絞り込み（フラグON） =====\n');
{
  const env = 偽環境を作る({ プロパティ初期値: { ENABLE_AUTH: 'true' } });
  データを入れる(env);
  実行(env, `認証_利用者を登録('hiroshima-ipad', '広島 iPad', 'staff', '和牛世桜 広島店', 'sakura01')`);
  実行(env, `認証_利用者を登録('honbu', '本部', 'hq', '', 'sakura99')`);
  const 拒否 = GET(env, {});
  確認('★トークン無しでは何も返さない', 拒否.ok === false && 拒否.needLogin === true, 拒否);
  const st = POST(env, { action: 'login', uid: 'hiroshima-ipad', pw: 'sakura01' }).auth.token;
  const hq = POST(env, { action: 'login', uid: 'honbu', pw: 'sakura99' }).auth.token;
  const 店 = GET(env, { token: st });
  const ids = 店.reports.map(r => r.id).sort();
  確認('店舗端末＝自店の提出・全体設定・みんなの投稿だけが返る', JSON.stringify(ids) === JSON.stringify(['r1', 'r3', 'r4', 'r5', 'r7']), ids);
  確認('★他店の提出（r2）は返らない', !ids.includes('r2'), ids);
  確認('★公益通報（r6）は自店のぶんでも返らない＝通報者を守る', !ids.includes('r6'), ids);
  const 本 = GET(env, { token: hq });
  確認('本部＝全部返る（公益通報も含む）', 本.reports.length === 7, 本.reports.length);
  const 偽t = GET(env, { token: 'uuid-nise' });
  確認('でたらめなトークンは弾く', 偽t.ok === false && 偽t.needLogin === true, 偽t);
}

console.log('\n===== ⑥ 書きの門番（フラグON） =====\n');
{
  const env = 偽環境を作る({ プロパティ初期値: { ENABLE_AUTH: 'true' } });
  実行(env, `認証_利用者を登録('hiroshima-ipad', '広島 iPad', 'staff', '和牛世桜 広島店', 'sakura01')`);
  実行(env, `認証_利用者を登録('honbu', '本部', 'hq', '', 'sakura99')`);
  const st = POST(env, { action: 'login', uid: 'hiroshima-ipad', pw: 'sakura01' }).auth.token;
  const hq = POST(env, { action: 'login', uid: 'honbu', pw: 'sakura99' }).auth.token;
  const 無 = POST(env, { kind: 'kizuki', store: '和牛世桜 広島店', item: 'x', note: '', photos: [], t: Date.now() });
  確認('トークン無しの提出は弾く', 無.ok === false && 無.needLogin === true, 無);
  const 自 = POST(env, { token: st, kind: 'kizuki', store: '和牛世桜 広島店', item: 'x', note: '', photos: [], t: Date.now() });
  確認('自店への提出は通る', 自.ok === true, 自);
  const 他 = POST(env, { token: st, kind: 'kizuki', store: '寿司世桜 心斎橋店', item: 'x', note: '', photos: [], t: Date.now() });
  確認('★他店への提出は弾く', 他.ok === false && 他.error === 'STORE_NOT_ALLOWED', 他);
  const 配 = POST(env, { token: st, kind: 'linkset', store: '', item: '', note: '[]', photos: [], t: Date.now() });
  確認('★店舗端末から本部専用kind（資料リンク等）へは書けない', 配.ok === false && 配.error === 'HQ_ONLY', 配);
  const 本 = POST(env, { token: hq, kind: 'linkset', store: '', item: '', note: '[]', photos: [], t: Date.now() });
  確認('本部は書ける', 本.ok === true, 本);
}

console.log('\n===== ⑦ 再発行＝全端末からログアウト =====\n');
{
  const env = 偽環境を作る({ プロパティ初期値: { ENABLE_AUTH: 'true' } });
  実行(env, `認証_利用者を登録('hara', '原さん', 'manager', '寿司世桜 心斎橋店', 'sakura02')`);
  const t1 = POST(env, { action: 'login', uid: 'hara', pw: 'sakura02' }).auth.token;
  確認('ログイン中はトークンが有効', GET(env, { token: t1 }).ok === true);
  実行(env, `認証_利用者を登録('hara', '原さん', 'manager', '寿司世桜 心斎橋店', 'saihakko03')`);   // パスワードを忘れた→再発行
  確認('★再発行すると古いトークンは無効（全端末からログアウト）', GET(env, { token: t1 }).ok === false);
  const re = POST(env, { action: 'login', uid: 'hara', pw: 'saihakko03' });
  確認('新しい仮パスワードで入り直せる／初回変更が再び必要', re.ok && re.auth.mustChange === true, re.auth);
}

console.log(`\n----- ${通過} 項目 PASS ／ ${失敗.length} 項目 FAIL -----`);
if (失敗.length) { 失敗.forEach(f => console.log(`  - ${f.名前}  → ${JSON.stringify(f.詳細)}`)); process.exit(1); }
console.log('★すべて通過。フラグOFFのままなら挙動は変わらず、ONにすると読み書きとも門番が立つ。');
