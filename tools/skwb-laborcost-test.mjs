import fs from 'node:fs'; import vm from 'node:vm';
// 総括表書き戻し＝アプリ日報の「人件費（当日・円）」を勤怠の「当日計・金額計」へ（2026-10-28 増田さん＝勤怠欄は使う店だけ・1日の人件費が分かればよい）
const SRC = fs.readFileSync(new URL('../backend/総括表書き戻し.gs', import.meta.url), 'utf8');
let cellsWritten = [], notesWritten = [];
const mkSheet = (opt) => {
  const vals = Array.from({ length: 100 }, () => Array(34).fill('')); const fmls = Array.from({ length: 100 }, () => Array(34).fill(''));
  const blank = () => Array.from({ length: 100 }, () => Array(34).fill(''));
  vals[75][1] = '氏名'; vals[75][6] = '勤務時間';           // 76行目＝見出し
  vals[90][6] = '時間計'; vals[90][8] = '金額計';             // 91行目＝見出し
  vals[91][1] = '当日計'; vals[91][8] = opt.cur == null ? '' : opt.cur; fmls[91][8] = opt.fml || '';   // 92行目＝当日計（I92）
  if (opt.name) vals[76][2] = opt.name;                       // 勤怠1行目の氏名（C77）
  return { getRange: (r, c, nr, nc) => nr ? { getValues: () => vals, getFormulas: () => fmls, getNotes: blank, getMergedRanges: () => [] }
             : { setValue: v => cellsWritten.push([r, c, v]), setNote: n => notesWritten.push([r, c, n]) },
           getMaxRows: () => 100, getMaxColumns: () => 34 };
};
const run = (opt, lc) => {
  cellsWritten = []; notesWritten = [];
  const ctx = vm.createContext({ getSetting_: (k, d) => d, Logger: { log() {} }, console,
    Utilities: { formatDate: (d, z, f) => f === 'yyyy-MM-dd' ? '2026-10-01' : '10/28' },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => mkSheet(opt) }), flush() {} },
    getSheet: () => ({ getParent: () => ({ getSheetByName: () => ({ getLastRow: () => 1, getRange: () => ({ setValues() {}, getValue: () => 'x' }) }) }) }) });
  vm.runInContext(SRC, ctx);
  ctx.sk_設定_ = () => [{ store: 'S', folder: 'f' }];
  ctx.sk_対象ブック_全期間_ = () => [{ ym: '202610', id: 'a', name: '10月' }];
  ctx.skwb_rows_ = () => ({ 'S|2026-10-26': { store: 'S', date: '2026-10-26', app: { laborcost: lc } } });
  const r = ctx.skwb_実行_(true, 40);
  return { r, got: r.一覧.map(x => x.項目 + '=' + x.結果).join(' / ') };
};
let fail = 0; const ok = (c, m, g) => { if (!c) { fail++; console.log('  ✗', m, '\n   ', g); } };
// ① 既定＝金額計が SUM の式・勤怠は空 → 式を金額で置き換える
let t = run({ fml: '=SUM(T77:U89)' }, 58400);
ok(/人件費（当日）=書く/.test(t.got) && cellsWritten.length === 1 && cellsWritten[0][0] === 92 && cellsWritten[0][1] === 9 && cellsWritten[0][2] === 58400, '勤怠が空ならI92の式を人件費の金額で置き換える', t.got + ' ' + JSON.stringify(cellsWritten));
// ② 勤怠の氏名が入っている日は書かない（止めた）
t = run({ fml: '=SUM(T77:U89)', name: '橋本' }, 58400);
ok(cellsWritten.length === 0 && t.r.止めた.some(x => /勤怠の行に氏名が 1 人/.test(x)), '勤怠の行が埋まっている日は人件費を書かず止めたに', t.got + ' ' + JSON.stringify(t.r.止めた));
// ③ 店が手で入れた金額と違う → ずれ（上書きしない・メモ）
t = run({ cur: 50000 }, 58400);
ok(/人件費（当日）=ずれ/.test(t.got) && cellsWritten.length === 0 && notesWritten.some(x => /アプリ日報では人件費 58,400円/.test(x[2])), '手入力と違えばずれ（メモだけ）', t.got);
// ④ 同じ金額なら同じ
t = run({ cur: 58400 }, 58400);
ok(/人件費（当日）=同じ/.test(t.got) && cellsWritten.length === 0, '同じ金額は書かない', t.got);
// ⑤ 人件費が空なら何もしない
t = run({ fml: '=SUM(T77:U89)' }, '');
ok(!/人件費/.test(t.got) && cellsWritten.length === 0, '人件費が空の日は触らない', t.got);
console.log(`RESULT: ${5 - fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
