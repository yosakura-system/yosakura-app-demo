/**
 * 世桜アプリ｜写真フォルダの決め方（Code.gs）の通し実行
 *
 *   node 写真フォルダ_通し実行.mjs
 *
 * なぜ要るか（2026-08-25）
 *   バックエンド移行の直前に、Code.gs の getPhotoFolder() に2つの穴が見つかった。
 *     ①「DriveApp.createFolder(名前)」は【マイドライブのルート】に作る＝「01.本番」の中に入らない
 *     ②「DriveApp.getFoldersByName(名前)」は【共有されたフォルダも含めて】横断検索する
 *        ＝旧アカウントから同名フォルダを共有した直後は、同じ名前が2つ見えて取り違える
 *   どちらも Google に繋がないと気づけない類いなので、ここで機械的に固定する。
 *
 * Googleには接続しない。DriveApp / PropertiesService / Session を「記録だけ取る偽物」に差し替えて動かす。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const コード = fs.readFileSync(path.join(ここ, 'Code.gs'), 'utf8');

/* ===================== 検査の道具 ===================== */
let 通過 = 0;
const 失敗 = [];
function 確認(名前, 条件, 詳細) {
  if (条件) { 通過++; console.log(`  PASS  ${名前}`); }
  else { 失敗.push({ 名前, 詳細 }); console.log(`  FAIL  ${名前}${詳細 !== undefined ? `  → ${JSON.stringify(詳細)}` : ''}`); }
}
function 例外になる(名前, fn, 含む) {
  try { fn(); 確認(名前, false, '例外にならなかった'); }
  catch (e) { 確認(名前, String(e.message || e).includes(含む), String(e.message || e)); }
}

/* ===================== 偽のGAS ===================== */
/**
 * フォルダ一覧 = [{ id, 名前, 親, 所有者 }]
 * 親が 'ROOT' のものは「マイドライブ直下」を表す。
 */
function 偽環境を作る({ フォルダ一覧 = [], プロパティ初期値 = {}, 自分 = 'yosakura.fc@gmail.com' } = {}) {
  const フォルダ = new Map(フォルダ一覧.map(f => [f.id, { ...f }]));
  const プロパティ = new Map(Object.entries(プロパティ初期値).map(([k, v]) => [k, String(v)]));
  const 作られたもの = [];
  let 連番 = 0;

  function 反復(配列) { let i = 0; return { hasNext: () => i < 配列.length, next: () => 配列[i++] }; }

  class 偽フォルダ {
    constructor(生) { this.生 = 生; }
    getId() { return this.生.id; }
    getName() { return this.生.名前; }
    getUrl() { return `https://drive.google.com/drive/folders/${this.生.id}`; }
    getOwner() { return this.生.所有者 ? { getEmail: () => this.生.所有者 } : null; }
  }

  const ctx = {
    Logger: { log: () => {} },
    console, JSON, Date, Object, String, Number, Array, Math, Error, RegExp, Utilities: {},
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (プロパティ.has(k) ? プロパティ.get(k) : null),
        setProperty: (k, v) => プロパティ.set(k, String(v))
      })
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => 自分 }) },
    DriveApp: {
      getFolderById: id => {
        const 生 = フォルダ.get(id);
        if (!生) throw new Error(`フォルダが見つかりません: ${id}`);
        return new 偽フォルダ(生);
      },
      // ★本物と同じく「共有されたフォルダも含めて」名前で横断検索する
      getFoldersByName: 名前 => 反復([...フォルダ.values()].filter(f => f.名前 === 名前).map(f => new 偽フォルダ(f))),
      // ★本物と同じく「マイドライブのルート」に作る（場所を指定できない）
      createFolder: 名前 => {
        const 生 = { id: `新規_${++連番}`, 名前, 親: 'ROOT', 所有者: 自分 };
        フォルダ.set(生.id, 生);
        作られたもの.push(生);
        return new 偽フォルダ(生);
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(コード, ctx, { filename: 'Code.gs' });
  return { ctx, プロパティ, フォルダ, 作られたもの };
}

const 実行 = (env, 式) => vm.runInContext(式, env.ctx);

/* ===================== 検査 ===================== */
console.log('\n===== 写真フォルダの決め方 =====\n');

// --- 1. IDが入っていれば、それを使う（名前で探し直さない） ---
{
  const env = 偽環境を作る({
    フォルダ一覧: [
      { id: '本番の写真', 名前: '世桜アプリ_写真', 親: '01本番', 所有者: 'yosakura.fc@gmail.com' },
      { id: '旧の写真', 名前: '世桜アプリ_写真', 親: 'ROOT', 所有者: 'yosakura.system@gmail.com' }
    ],
    プロパティ初期値: { PHOTO_FOLDER_ID: '本番の写真' }
  });
  const f = 実行(env, 'getPhotoFolder()');
  確認('IDが入っていれば、そのフォルダを返す', f.getId() === '本番の写真', f.getId());
  確認('IDがあるときは新しく作らない', env.作られたもの.length === 0, env.作られたもの.length);
  確認('★同名が他にあってもIDが優先される（01.本番の中を指し続ける）', f.getId() !== '旧の写真', f.getId());
}

// --- 2. IDのフォルダが開けないときは、分かる言葉で止まる ---
{
  const env = 偽環境を作る({ プロパティ初期値: { PHOTO_FOLDER_ID: '存在しないID' } });
  例外になる('IDのフォルダを開けないときは止まる', () => 実行(env, 'getPhotoFolder()'), 'PHOTO_FOLDER_ID のフォルダを開けません');
  例外になる('そのときIDを本文に出す（原因を追える）', () => 実行(env, 'getPhotoFolder()'), '存在しないID');
}

// --- 3. ★同名が2つあると、選ばずに止まる（移行直後に起きる状況） ---
{
  const env = 偽環境を作る({
    フォルダ一覧: [
      { id: '新の写真', 名前: '世桜アプリ_写真', 親: 'ROOT', 所有者: 'yosakura.fc@gmail.com' },
      { id: '旧の写真', 名前: '世桜アプリ_写真', 親: 'ROOT', 所有者: 'yosakura.system@gmail.com' }
    ]
  });
  例外になる('★同名フォルダが2つあると、選ばずに止まる', () => 実行(env, 'getPhotoFolder()'), '2個見つかりました');
  例外になる('そのとき候補のIDを両方出す', () => 実行(env, 'getPhotoFolder()'), '旧の写真');
  確認('迷ったときは新しく作ってごまかさない', env.作られたもの.length === 0, env.作られたもの.length);
}

// --- 4. 同名が1つだけなら、それを使い、IDを記録する ---
{
  const env = 偽環境を作る({
    フォルダ一覧: [{ id: '唯一の写真', 名前: '世桜アプリ_写真', 親: 'ROOT', 所有者: 'yosakura.fc@gmail.com' }]
  });
  const f = 実行(env, 'getPhotoFolder()');
  確認('同名が1つなら、それを使う', f.getId() === '唯一の写真', f.getId());
  確認('使ったIDを記録する（次回から探し直さない）', env.プロパティ.get('PHOTO_FOLDER_ID') === '唯一の写真', env.プロパティ.get('PHOTO_FOLDER_ID'));
}

// --- 5. 1つも無ければ作る（従来どおり動く＝新規構築を壊していない） ---
{
  const env = 偽環境を作る({});
  const f = 実行(env, 'getPhotoFolder()');
  確認('1つも無ければ作る', env.作られたもの.length === 1, env.作られたもの.length);
  確認('作ったIDを記録する', env.プロパティ.get('PHOTO_FOLDER_ID') === f.getId(), env.プロパティ.get('PHOTO_FOLDER_ID'));
  確認('⚠️作られる場所はマイドライブ直下（だからIDを先に入れる運用にした）', env.作られたもの[0].親 === 'ROOT', env.作られたもの[0].親);
}

// --- 6. ★所有者が自分でないフォルダを掴んだら、setup が止まる ---
{
  const env = 偽環境を作る({
    フォルダ一覧: [{ id: '旧の写真', 名前: '世桜アプリ_写真', 親: 'ROOT', 所有者: 'yosakura.system@gmail.com' }]
  });
  例外になる('★旧アカウント所有のフォルダを掴んだら止まる', () => 実行(env, 'ensurePhotoFolder_()'), '所有者が違います');
  例外になる('そのとき所有者と実行者の両方を出す', () => 実行(env, 'ensurePhotoFolder_()'), 'yosakura.system@gmail.com');
}

// --- 7. 所有者が自分なら通る ---
{
  const env = 偽環境を作る({
    フォルダ一覧: [{ id: '本番の写真', 名前: '世桜アプリ_写真', 親: '01本番', 所有者: 'yosakura.fc@gmail.com' }],
    プロパティ初期値: { PHOTO_FOLDER_ID: '本番の写真' }
  });
  const r = 実行(env, 'ensurePhotoFolder_()');
  確認('所有者が自分なら通る', r.id === '本番の写真', r);
  確認('所有者を結果に返す（画面で確かめられる）', r.owner === 'yosakura.fc@gmail.com', r.owner);
}

// --- 8. ★回帰：移行当日そのままの状況で、黙って進まない ---
{
  // 旧の写真フォルダを yosakura.fc へ共有した直後＝同名が2つ見える。IDはまだ入れていない。
  const env = 偽環境を作る({
    フォルダ一覧: [
      { id: '旧の写真', 名前: '世桜アプリ_写真', 親: 'ROOT', 所有者: 'yosakura.system@gmail.com' },
      { id: '新の写真', 名前: '世桜アプリ_写真', 親: '01本番', 所有者: 'yosakura.fc@gmail.com' }
    ]
  });
  例外になる('★移行当日の状況（同名2つ）で setup が黙って進まない', () => 実行(env, 'ensurePhotoFolder_()'), '2個見つかりました');
  確認('★勝手にどちらかを選んで記録しない', env.プロパティ.get('PHOTO_FOLDER_ID') === undefined || env.プロパティ.get('PHOTO_FOLDER_ID') === null, env.プロパティ.get('PHOTO_FOLDER_ID'));
}

/* ===================== 自動削除の保護リスト ===================== */
console.log('\n===== 自動削除が「設定」を消さない =====\n');
{
  /* ★なぜここで見るか（2026-08-25 リリース前点検で発見）
     自動削除（purgeOldRows）は「PURGE_KEEP_KINDS 以外の行を90日で全部消す」作り。
     後から足した設定系の kind（緊急連絡先・資料リンク・よくある質問・勉強会の録画・お知らせ）が
     リストに入っておらず、90日後に黙って消えるところだった。
     例＝linkset は最新1行が全リンク一覧＝本部が90日リンクを触らないだけで、アプリ中の資料リンクが全部消える。 */
  const env = 偽環境を作る({});
  const keep = 実行(env, 'PURGE_KEEP_KINDS');
  ['submaster', 'subholiday', 'appfb', 'ckitem', 'ckhide',
   'emg', 'linkset', 'faqset', 'study', 'news'].forEach(k => {
    確認(`保護リストに ${k} がある`, Array.isArray(keep) && keep.indexOf(k) !== -1, keep);
  });
  確認('★特に：緊急連絡先（emg）と資料リンク（linkset）は絶対に消さない',
       keep.indexOf('emg') !== -1 && keep.indexOf('linkset') !== -1, keep);
}

/* ===================== 結果 ===================== */
console.log(`\n----- ${通過} 項目 PASS ／ ${失敗.length} 項目 FAIL -----`);
if (失敗.length) {
  console.log('\n★FAIL の内訳');
  失敗.forEach(f => console.log(`  - ${f.名前}  → ${JSON.stringify(f.詳細)}`));
  process.exit(1);
}
console.log('★すべて通過。写真フォルダの決め方は、移行の状況でも取り違えない。');
