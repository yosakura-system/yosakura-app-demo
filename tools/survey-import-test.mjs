// SurveyImport.gs の「シートを読む」部分だけを、長堀橋の実データで検証する。
// GASのAPI（SpreadsheetApp等）はモックし、列検出・日付解釈・テスト判定・重複防止だけを見る。
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = 'C:/Users/Watar/OneDrive/ドキュメント/Claude Code/世桜/09_世桜アプリ_デモ/backend/SurveyImport.gs';
const code = fs.readFileSync(SRC, 'utf8');

let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) PASS++; else { FAIL++; console.log('  ✗ ' + m); } };

// ---- 実データ（牛カツ世桜長堀橋サーベイ(St2) から代表行を抜粋・原文のまま）----
const HEADER = ['タイムスタンプ', '国名', '評価', '来店きっかけ', 'フィードバック'];
const ROWS = [
  ['2026/07/09 11:40:59', 'Korea', 5, '구글', '【특별한 문제는 없었어요】'],
  ['2026/07/09 20:55:38', 'Thailand', 5, 'Instagram', '【No particular issue】'],
  ['2026/07/11 14:23:57', 'Vietnam', 5, 'đi thẳng vào', '【Không có vấn đề gì đặc biệt】 A rat ngon va phuc vu tot. Cam on'],
  ['2026/07/15 18:59:55', 'Taiwan', 5, '現場候位', '【沒有特別的問題】 おいしい'],
  ['2026/07/15 20:27:20', 'Hong Kong', 5, '其他（YouTube）', '【沒有特別的問題】 Very good service'],
  ['2026/07/16 22:13:29', 'Japan', 5, 'グーグル', '【特に問題は無かった】'],
  ['2026/07/26 20:15:07', 'Japan', 5, 'グーグル', '【料理がおいしくない、料理提供が遅い】 さっきの韓国とこの日本はテストです'], // ← テスト投稿
  ['2026/07/27 21:26:45', 'Other（Argentina）', 5, 'Walk in', '【No particular issue】 We loved the place'],
  ['2026/07/29 12:32:56', 'Korea', 5, '예약 없이', '【특별한 문제는 없었어요】 모든 서비스가 너무 좋아서'],
  ['2026/08/03 19:22:46', 'Korea', 5, '구글', ''],
  ['', '', '', '', ''],                    // 空行（集計欄の前）
  ['アンケート総数', 5, '', '平均評価', 5], // 集計欄＝取り込まれてはいけない
];

// ---- GAS API のモック ----
const sheetMock = {
  getName: () => 'フォームの回答 1',
  getLastRow: () => ROWS.length + 1,
  getLastColumn: () => HEADER.length,
  getRange(row, col, numRows, numCols) {
    const all = [HEADER, ...ROWS];
    const slice = all.slice(row - 1, row - 1 + numRows).map(r => {
      const out = [];
      for (let i = 0; i < numCols; i++) out.push(r[col - 1 + i] === undefined ? '' : r[col - 1 + i]);
      return out;
    });
    // getValue/getDisplayValue は「元シートのタイムゾーンが GMT+7」の状況を再現する。
    // ＝ 画面には 11:40:59 と出ているのに、読み取ると 13:40:59 の Date が返る。
    const shifted = slice.map(r => r.map(v => {
      const m = typeof v === 'string' && v.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
      return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4] + 2, +m[5], +m[6]) : v;
    }));
    return {
      getValues: () => shifted,
      getDisplayValues: () => slice.map(r => r.map(v => String(v))),
      getValue: () => shifted[0][0],
      getDisplayValue: () => String(slice[0][0])
    };
  }
};
let appended = [];
const reportsSheet = {
  getLastRow: () => 1 + appended.length,
  getRange(row, col, numRows, numCols) {
    return {
      getValues: () => appended.slice(row - 2, row - 2 + numRows),
      setValues: (v) => { appended = appended.concat(v); }
    };
  }
};

const sandbox = {
  console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, isNaN,
  SpreadsheetApp: { openById: (id) => (id === 'BAD' ? (() => { throw new Error('no access'); })() : { getSheets: () => [sheetMock], getSheetByName: () => sheetMock }) },
  Utilities: { getUuid: () => 'uuid-' + Math.random().toString(36).slice(2) },
  Logger: { log: () => {} },
  PropertiesService: null,
  // Code.gs 側の関数を差し替え
  HEADERS: ['id', 'ts', 'kind', 'store', 'item', 'level', 'note', 'photos'],
  getSheet: () => reportsSheet,
  getSetting_: (k) => (k === 'SURVEY_SOURCES'
    ? JSON.stringify([{ store: '牛カツ世桜 長堀橋店', id: 'OK_ID' }]) : ''),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'SurveyImport.gs' });

// ---- 検証 ----
console.log('== 列の検出 ==');
const cols = sandbox.findSurveyCols_(sheetMock);
ok(cols && cols._headerRow === 1, '見出し行を1行目と判定する');
ok(cols && cols.ts === 0 && cols.rating === 2, 'タイムスタンプ・評価の列を見つける');
ok(cols && cols.country === 1 && cols.route === 3 && cols.comment === 4, '国名・きっかけ・感想の列を見つける');

console.log('== 1店舗ぶんの読み取り ==');
const r = sandbox.readSurveySource_({ store: '牛カツ世桜 長堀橋店', id: 'OK_ID' });
ok(r.rows.length === 10, `回答だけを読む（集計欄・空行を除く）／実際=${r.rows.length}`);
ok(r.rows[0].t === new Date('2026/07/09 11:40:59').getTime(),
   '元シートのタイムゾーンがずれていても、画面に表示されている時刻のまま取り込む');
ok(r.rows[0].route === '구글', '来店きっかけは原文のまま保つ（寄せるのはアプリ側）');

console.log('== テスト投稿の扱い ==');
const test = r.rows.filter(x => x.isTest);
ok(test.length === 1, `テスト投稿を1件だけ拾う／実際=${test.length}`);
ok(test[0] && test[0].country === 'TEST_Japan', '国名に TEST_ が付く（アプリの集計から自動で外れる）');
ok(r.rows.filter(x => !x.isTest).every(x => !/^TEST_/.test(x.country)), '通常の回答には TEST_ が付かない');

console.log('== 取り込み（重複しないこと）==');
const first = sandbox.importSurveys(false);
ok(first.追加件数 === 10, `初回は10件追加／実際=${first.追加件数}`);
const second = sandbox.importSurveys(false);
ok(second.追加件数 === 0, `2回目は追加0件＝何度実行しても二重登録されない／実際=${second.追加件数}`);
ok(appended.length === 10, 'シートに残るのは10行のまま');

console.log('== 書き込む形がアプリの読み取り形式と合っている ==');
const row = appended[0];
ok(row[2] === 'survey', 'kind は survey');
ok(row[3] === '牛カツ世桜 長堀橋店', 'store は設定した店舗名');
const note = JSON.parse(row[6]);
ok('c' in note && 'f' in note, 'note は {c:国名, f:感想} の形（アプリの distribute がこの形を読む）');
ok(Number(row[5]) === 5, 'level に評価が入る');

console.log('== シートを開けないとき ==');
const bad = sandbox.readSurveySource_({ store: 'x', id: 'BAD' });
ok(bad.rows.length === 0 && /共有/.test(bad.note), '開けない場合は止まらず、理由を返す');

console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
