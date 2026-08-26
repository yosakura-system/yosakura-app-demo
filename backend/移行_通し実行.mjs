/**
 * 世桜アプリ｜移行.gs の通し実行（Googleに接続せずに確かめる）
 *
 * 使い方： node 移行_通し実行.mjs
 *
 * ★狙い＝「一度きりの移行」で失敗しないこと。
 *   GAS の SpreadsheetApp / DriveApp / PropertiesService を「記録だけ取る偽物」に差し替え、
 *   移行.gs を実際に走らせて、次のことを確かめる。
 *     ・旧シートの行が正しく新シートへ入るか（列の並びが違っても壊れないか）
 *     ・二重に実行しても行が増えないか
 *     ・写真の旧ID→新IDが全部付け替わるか（★ここが失敗すると過去の写真が開けなくなる）
 *     ・途中で時間切れになっても、再実行で続きから終わるか
 *     ・旧と新を取り違えたら、実行前に止まるか
 *     ・共有設定が禁止されている組織で、それに気づけるか
 *   さらに「わざと不具合を入れたら、この通し実行が落ちること」も確認する（検査が効いている証拠）。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const 移行GS = fs.readFileSync(path.join(ここ, '移行.gs'), 'utf8');

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
function 偽環境を作る(設定 = {}) {
  const { 共有を禁止する = false } = 設定;

  /* --- スプレッドシート --- */
  class 偽シート {
    constructor(名前, data) { this.名前 = 名前; this.data = data; }
    getName() { return this.名前; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
    appendRow(行) { this.data.push(行.slice()); }
    getRange(row, col, numRows = 1, numCols = 1) {
      const sh = this;
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const 元 = sh.data[row - 1 + r] || [];
            const 行 = [];
            for (let c = 0; c < numCols; c++) 行.push(元[col - 1 + c] === undefined ? '' : 元[col - 1 + c]);
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
        setValue(v) { this.setValues([[v]]); }
      };
    }
  }
  class 偽スプレッドシート {
    constructor(id, シート群) { this.id = id; this.シート群 = シート群; }
    getId() { return this.id; }
    getSheetByName(n) { return this.シート群[n] || null; }
    insertSheet(n) { this.シート群[n] = new 偽シート(n, []); return this.シート群[n]; }
  }

  /* --- Drive --- */
  const ファイル = new Map();
  const フォルダ = new Map();
  let 連番 = 0;
  class 偽フォルダ {
    constructor(id, 名前) { this.id = id; this.名前 = 名前; }
    getId() { return this.id; }
    getName() { return this.名前; }
    getFiles() { return 反復(([...ファイル.values()]).filter(f => f.親 === this.id).map(f => new 偽ファイル(f))); }
  }
  class 偽ファイル {
    constructor(生) { this.生 = 生; }
    getId() { return this.生.id; }
    getName() { return this.生.名前; }
    getSharingAccess() { return this.生.共有; }
    setSharing(access) {
      if (共有を禁止する && access === 'ANYONE_WITH_LINK') throw new Error('この組織では「リンクを知っている全員」との共有が許可されていません');
      this.生.共有 = access;
    }
    getParents() { return 反復([new 偽フォルダ(this.生.親, フォルダ.get(this.生.親)?.名前 || '')]); }
    makeCopy(名前, 先) {
      const id = `新_${++連番}_${this.生.id}`;
      const 生 = { id, 名前, 親: 先.getId(), 共有: 'PRIVATE' };
      ファイル.set(id, 生);
      return new 偽ファイル(生);
    }
  }
  function 反復(配列) { let i = 0; return { hasNext: () => i < 配列.length, next: () => 配列[i++] }; }

  const プロパティ = new Map();

  const ctx = {
    Logger: { log: () => {} },
    console,
    JSON, Date, Object, String, Number, Array, Math, Error,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (プロパティ.has(k) ? プロパティ.get(k) : null),
        setProperty: (k, v) => プロパティ.set(k, String(v))
      })
    },
    SpreadsheetApp: {
      openById: id => {
        const ss = 台帳.シート.get(id);
        if (!ss) throw new Error(`スプレッドシートを開けません: ${id}`);
        return ss;
      },
      getActiveSpreadsheet: () => null
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK', PRIVATE: 'PRIVATE' },
      Permission: { VIEW: 'VIEW' },
      getFileById: id => {
        const 生 = ファイル.get(id);
        if (!生) throw new Error(`ファイルが見つかりません: ${id}`);
        return new 偽ファイル(生);
      },
      getFolderById: id => {
        const f = フォルダ.get(id);
        if (!f) throw new Error(`フォルダが見つかりません: ${id}`);
        return new 偽フォルダ(id, f.名前);
      }
    }
  };

  const 台帳 = {
    シート: new Map(),
    ctx,
    プロパティ,
    ファイル,
    フォルダ,
    シートを作る(id, 定義) {
      const シート群 = {};
      Object.keys(定義).forEach(n => { シート群[n] = new 偽シート(n, 定義[n].map(r => r.slice())); });
      const ss = new 偽スプレッドシート(id, シート群);
      this.シート.set(id, ss);
      return ss;
    },
    フォルダを作る(id, 名前) { フォルダ.set(id, { id, 名前 }); return new 偽フォルダ(id, 名前); },
    ファイルを作る(id, 名前, 親, 共有 = 'ANYONE_WITH_LINK') { ファイル.set(id, { id, 名前, 親, 共有 }); return id; }
  };

  return 台帳;
}

/* ===================== 試験用のデータ ===================== */
// ★旧シートは列の並びをわざと変えてある（列名で読めているかを確かめるため）
const 旧ヘッダー = ['id', 'kind', 'ts', 'store', 'photos', 'item', 'level', 'note'];
function 旧データ() {
  return [
    旧ヘッダー,
    ['r1', 'subrec', '2026-08-01T09:00:00Z', '日本料理世桜本店', JSON.stringify(['p1', 'p2']), 'open', '', 'オープン写真'],
    ['r2', 'kizuki', '2026-08-02T10:00:00Z', '牛カツ世桜 長堀橋店', JSON.stringify(['p3']), '', '', '気づき'],
    ['r3', 'submaster', '2026-08-03T11:00:00Z', '', '', 'open', '', '提出物マスタ'],
    ['r4', 'soukatsu', '2026-08-04T12:00:00Z', '手巻き寿司世桜 難波店', 'p4,p5', '', '', 'カンマ区切りの写真'],
    ['r5', 'subrec', '2026-08-05T13:00:00Z', '日本料理世桜本店', JSON.stringify(['p6']), 'open', '', '2枚目']
  ];
}
const 新ヘッダー = ['id', 'ts', 'kind', 'store', 'item', 'level', 'note', 'photos'];
const 写真一覧 = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function 一式を用意する(設定 = {}) {
  const 台帳 = 偽環境を作る(設定);
  台帳.シートを作る('OLD_SHEET', { reports: 旧データ() });
  台帳.シートを作る('NEW_SHEET', { reports: [新ヘッダー.slice()] });
  台帳.フォルダを作る('OLD_FOLDER', '世桜アプリ_写真');
  台帳.フォルダを作る('NEW_FOLDER', '世桜アプリ_写真');
  写真一覧.forEach((id, i) => 台帳.ファイルを作る(id, `photo_${i + 1}.jpg`, 'OLD_FOLDER'));
  台帳.プロパティ.set('SPREADSHEET_ID', 'NEW_SHEET');
  台帳.プロパティ.set('PHOTO_FOLDER_ID', 'NEW_FOLDER');
  台帳.プロパティ.set('ENABLE_AUTO_PURGE', 'false');
  return 台帳;
}

function 移行を読み込む(台帳, コード = 移行GS) {
  vm.createContext(台帳.ctx);
  vm.runInContext(コード, 台帳.ctx);
  台帳.ctx.MIG_OLD_SHEET_ID = 'OLD_SHEET';
  台帳.ctx.MIG_OLD_FOLDER_ID = 'OLD_FOLDER';
  return (式) => vm.runInContext(式, 台帳.ctx);
}
const 新の行 = 台帳 => 台帳.シート.get('NEW_SHEET').getSheetByName('reports').data;
const 写真列 = 行 => 行.slice(1).map(r => String(r[新ヘッダー.indexOf('photos')] || ''));

/* ===================== ① 通しで1回 ===================== */
console.log('\n===== ① 移行を最初から最後まで通す =====');
{
  const 台帳 = 一式を用意する();
  const 実行 = 移行を読み込む(台帳);

  const 下見 = 実行('移行_0_下見()');
  確認('下見：旧シートの行数が5', 下見.旧シートの行数 === 5, 下見.旧シートの行数);
  確認('下見：新シートは空', 下見.新シートの行数 === 0, 下見.新シートの行数);
  確認('下見：写真は6枚（カンマ区切りも数える）', 下見.写真の枚数_シート上 === 6, 下見.写真の枚数_シート上);
  確認('下見：旧フォルダも6枚', 下見.写真の枚数_旧フォルダ === 6, 下見.写真の枚数_旧フォルダ);
  確認('下見：書き込んでいない', 新の行(台帳).length === 1, 新の行(台帳).length);

  const コピー = 実行('移行_1_行をコピー()');
  確認('行コピー：5行入った', コピー.コピーした行 === 5, コピー);
  const 行 = 新の行(台帳);
  確認('行コピー：列の並びが違っても id が正しい', 行[1][0] === 'r1' && 行[5][0] === 'r5', 行.map(r => r[0]));
  確認('行コピー：kind が3列目に入っている', 行[1][2] === 'subrec' && 行[2][2] === 'kizuki', [行[1][2], 行[2][2]]);
  確認('行コピー：note が7列目に入っている', 行[1][6] === 'オープン写真', 行[1][6]);
  確認('行コピー：photos が8列目に入っている', String(行[1][7]).includes('p1'), 行[1][7]);

  const 写真 = 実行('移行_2_写真を移す()');
  確認('写真：6枚移した', 写真.今回移した枚数 === 6, 写真);
  確認('写真：残りゼロ', 写真.まだ残っている枚数 === 0, 写真.まだ残っている枚数);
  確認('写真：共有の失敗なし', 写真.共有設定を付けられなかった枚数 === 0, 写真);
  確認('写真：新フォルダに6枚できた', [...台帳.ファイル.values()].filter(f => f.親 === 'NEW_FOLDER').length === 6);
  確認('写真：旧フォルダは減っていない（読むだけ）', [...台帳.ファイル.values()].filter(f => f.親 === 'OLD_FOLDER').length === 6);

  const 付替 = 実行('移行_3_写真IDを付替()');
  確認('付替：4行を書き換えた', 付替.書き換えた行 === 4, 付替);
  確認('付替：6枚とも付け替えた', 付替.付け替えた写真 === 6, 付替);
  確認('付替：対応表に無い写真ゼロ', 付替.対応表に無かった写真.length === 0, 付替.対応表に無かった写真);
  const 列 = 写真列(新の行(台帳));
  確認('付替：旧IDが1つも残っていない', !列.some(v => /"p\d"|(^|,)p\d(,|$)/.test(v)), 列);
  確認('付替：カンマ区切りもJSON配列になった', 列[3].startsWith('[') && 列[3].includes('新_'), 列[3]);
  確認('付替：写真の無い行は空のまま', 列[2] === '', 列[2]);

  const 点検 = 実行('移行_4_点検()');
  確認('点検：★OK', 点検.判定 === '★OK', 点検);
  確認('点検：6枚とも開ける', 点検.開ける === 6 && 点検.開けない.length === 0, 点検);
  確認('点検：全部が新フォルダの中', 点検['新フォルダの外にある'] === 0, 点検);
  確認('点検：共有設定が全部付いている', 点検['共有設定が付いていない'] === 0, 点検);
}

/* ===================== ② 二重に実行しても壊れない ===================== */
console.log('\n===== ② 同じ関数をもう一度実行しても壊れない =====');
{
  const 台帳 = 一式を用意する();
  const 実行 = 移行を読み込む(台帳);
  実行('移行_1_行をコピー()'); 実行('移行_2_写真を移す()'); 実行('移行_3_写真IDを付替()');
  const 初回の列 = JSON.stringify(写真列(新の行(台帳)));

  const 再コピー = 実行('移行_1_行をコピー()');
  確認('再実行：行は増えない', 再コピー.コピーした行 === 0 && 再コピー.既にあって飛ばした行 === 5, 再コピー);
  確認('再実行：新シートは6行のまま（見出し含む）', 新の行(台帳).length === 6, 新の行(台帳).length);

  const 再写真 = 実行('移行_2_写真を移す()');
  確認('再実行：写真は増えない', 再写真.今回移した枚数 === 0, 再写真);
  確認('再実行：新フォルダは6枚のまま', [...台帳.ファイル.values()].filter(f => f.親 === 'NEW_FOLDER').length === 6);

  const 再付替 = 実行('移行_3_写真IDを付替()');
  確認('再実行：書き換えゼロ', 再付替.書き換えた行 === 0, 再付替);
  確認('再実行：「対応表に無い」と誤検知しない', 再付替.対応表に無かった写真.length === 0, 再付替.対応表に無かった写真);
  確認('再実行：写真列が変わっていない', JSON.stringify(写真列(新の行(台帳))) === 初回の列);
  確認('再実行：点検は★OKのまま', 実行('移行_4_点検()').判定 === '★OK');
}

/* ===================== ③ 途中で時間切れ → 再実行で続く ===================== */
console.log('\n===== ③ 6分制限で途中終了しても、再実行で続きから終わる =====');
{
  const 台帳 = 一式を用意する();
  const 実行 = 移行を読み込む(台帳);
  実行('移行_1_行をコピー()');

  台帳.ctx.MIG_TIME_LIMIT_MS = -1;          // 1枚も処理せずに抜ける状態を作る
  const 空振り = 実行('移行_2_写真を移す()');
  確認('時間切れ：0枚で止まる', 空振り.今回移した枚数 === 0, 空振り);
  確認('時間切れ：残り6枚と分かる', 空振り.まだ残っている枚数 === 6, 空振り);
  確認('時間切れ：次にすることが案内される', String(空振り.次にすること).includes('もう一度'), 空振り.次にすること);

  台帳.ctx.MIG_TIME_LIMIT_MS = 4.5 * 60 * 1000;
  const 続き = 実行('移行_2_写真を移す()');
  確認('再開：残り6枚を移した', 続き.今回移した枚数 === 6 && 続き.まだ残っている枚数 === 0, 続き);
  実行('移行_3_写真IDを付替()');
  確認('再開：最後まで通って★OK', 実行('移行_4_点検()').判定 === '★OK');
  確認('再開：写真が二重にできていない', [...台帳.ファイル.values()].filter(f => f.親 === 'NEW_FOLDER').length === 6);
}

/* ===================== ④ 取り違えたら実行前に止まる ===================== */
console.log('\n===== ④ 旧と新を取り違えたら、実行前に止まる =====');
{
  const 台帳 = 一式を用意する();
  const 実行 = 移行を読み込む(台帳);
  台帳.ctx.MIG_OLD_SHEET_ID = 'NEW_SHEET';
  例外になる('旧＝新のスプレッドシートで止まる', () => 実行('移行_1_行をコピー()'), '旧と新が同じスプレッドシート');

  台帳.ctx.MIG_OLD_SHEET_ID = 'OLD_SHEET';
  台帳.ctx.MIG_OLD_FOLDER_ID = 'NEW_FOLDER';
  例外になる('旧＝新の写真フォルダで止まる', () => 実行('移行_2_写真を移す()'), '旧と新が同じ写真フォルダ');

  台帳.ctx.MIG_OLD_FOLDER_ID = 'OLD_FOLDER';
  台帳.ctx.MIG_OLD_SHEET_ID = '';
  例外になる('IDが空なら止まる', () => 実行('移行_1_行をコピー()'), 'MIG_OLD_SHEET_ID が空');

  const 台帳2 = 一式を用意する();
  const 実行2 = 移行を読み込む(台帳2);
  台帳2.プロパティ.delete('PHOTO_FOLDER_ID');
  例外になる('setup前なら止まる', () => 実行2('移行_1_行をコピー()'), 'PHOTO_FOLDER_ID');
  確認('止まったときは1行も書いていない', 新の行(台帳2).length === 1, 新の行(台帳2).length);
}

/* ===================== ⑤ 組織が共有を禁止していたら気づける ===================== */
console.log('\n===== ⑤ 「組織外との共有」が禁止でも、気づいて復旧できる =====');
{
  const 台帳 = 一式を用意する({ 共有を禁止する: true });
  const 実行 = 移行を読み込む(台帳);
  実行('移行_1_行をコピー()');
  const 写真 = 実行('移行_2_写真を移す()');
  確認('禁止時：写真そのものは移せる', 写真.今回移した枚数 === 6, 写真);
  確認('禁止時：共有できなかった枚数を数える', 写真['共有設定を付けられなかった枚数'] === 6, 写真);
  確認('禁止時：警告が出る', String(写真.警告 || '').includes('組織外との共有'), 写真.警告);

  実行('移行_3_写真IDを付替()');
  const 点検 = 実行('移行_4_点検()');
  確認('禁止時：点検が★要対応になる', 点検.判定 === '★要対応', 点検);
  確認('禁止時：共有なしを6枚と数える', 点検['共有設定が付いていない'] === 6, 点検);

  台帳.ctx.__共有を許可 = true;   // 管理コンソールで許可した想定
  [...台帳.ファイル.values()].forEach(() => {});
  台帳.ctx.DriveApp.getFileById = (id => {
    const 元 = 台帳.ファイル.get(id);
    if (!元) throw new Error(`ファイルが見つかりません: ${id}`);
    return {
      getId: () => 元.id,
      getName: () => 元.名前,
      getSharingAccess: () => 元.共有,
      setSharing: (a) => { 元.共有 = a; },
      getParents: () => { let i = 0; const a = [{ getId: () => 元.親 }]; return { hasNext: () => i < a.length, next: () => a[i++] }; }
    };
  });
  const 復旧 = 実行('移行_5_共有を付け直す()');
  確認('復旧：6枚に共有を付け直した', 復旧.付けた枚数 === 6, 復旧);
  確認('復旧：点検が★OKになる', 実行('移行_4_点検()').判定 === '★OK');
}

/* ===================== ⑥ わざと壊して、この検査が落ちることを確かめる ===================== */
console.log('\n===== ⑥ わざと不具合を入れたら、この通し実行は落ちるか =====');
{
  // 不具合A：写真IDの付け替えをしない（＝過去の写真が全部開けなくなる、最悪の事故）
  const 壊したA = 移行GS.replace('if (map[id]) { 変わった = true; 付替++; return map[id]; }', 'if (false) { return id; }');
  const 台帳A = 一式を用意する();
  const 実行A = 移行を読み込む(台帳A, 壊したA);
  実行A('移行_1_行をコピー()'); 実行A('移行_2_写真を移す()'); 実行A('移行_3_写真IDを付替()');
  const 点検A = 実行A('移行_4_点検()');
  確認('不具合A（IDを付け替えない）を点検が捕まえる', 点検A.判定 === '★要対応' && 点検A['新フォルダの外にある'] > 0, 点検A);

  // 不具合B：既にある行を飛ばさない（＝再実行のたびに行が二重に増える）
  const 壊したB = 移行GS.replace('if (r.id && 既存[String(r.id)]) { 飛ばした++; return; }', '');
  const 台帳B = 一式を用意する();
  const 実行B = 移行を読み込む(台帳B, 壊したB);
  実行B('移行_1_行をコピー()');
  const 二重 = 実行B('移行_1_行をコピー()');
  確認('不具合B（行が二重に増える）を検査が捕まえる', 二重.コピーした行 !== 0 || 新の行(台帳B).length !== 6, { 二重, 行数: 新の行(台帳B).length });

  // 不具合C：旧＝新のガードを外す（＝旧データを壊しかねない）
  const 壊したC = 移行GS.replace("throw new Error('★旧と新が同じスプレッドシートです。新しいアカウント側のプロジェクトで実行してください。');", '');
  const 台帳C = 一式を用意する();
  const 実行C = 移行を読み込む(台帳C, 壊したC);
  台帳C.ctx.MIG_OLD_SHEET_ID = 'NEW_SHEET';
  let 止まった = false;
  try { 実行C('移行_1_行をコピー()'); } catch (e) { 止まった = true; }
  確認('不具合C（取り違えガードを外す）を検査が捕まえる', !止まった, '止まってしまった＝この検査が効いていない');
}

/* ===================== 結果 ===================== */
console.log('\n==========================================');
console.log(`結果：${通過} / ${通過 + 失敗.length} 項目 PASS`);
if (失敗.length) {
  console.log('\n落ちた項目：');
  失敗.forEach(f => console.log(`  - ${f.名前}  ${f.詳細 !== undefined ? JSON.stringify(f.詳細) : ''}`));
  process.exit(1);
}
console.log('★すべて通過。移行.gs は Google に接続する前の段階で問題なし。');
console.log('⚠️ ただし「本番で動いた」ことにはならない。実機では 移行_0_下見 から順に、毎回ログを見ながら進めること。');
