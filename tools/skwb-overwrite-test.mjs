import fs from 'node:fs'; import vm from 'node:vm';
// 総括表書き戻し＝11/1以降はレジが正（2026-10-25 増田さん）。10月分はメモだけ・11月分はレジで上書きして前の数字をメモに
const SRC = fs.readFileSync(new URL('../backend/総括表書き戻し.gs', import.meta.url), 'utf8');
const cellsWritten = []; const notesWritten = [];
const mkSheet = () => {
  const vals = Array.from({ length: 100 }, () => Array(34).fill('')); const blank = () => Array.from({ length: 100 }, () => Array(34).fill(''));
  vals[10][1] = '現金売上'; vals[10][6] = 11600;   // 店が打った数字（打ち間違い）
  vals[11][1] = '客数'; vals[11][6] = 32;
  return { getRange: (r, c, nr, nc) => nr ? { getValues: () => vals, getFormulas: blank, getNotes: blank, getMergedRanges: () => [] }
             : { setValue: v => cellsWritten.push([r, c, v]), setNote: n => notesWritten.push([r, c, n]) },
           getMaxRows: () => 100, getMaxColumns: () => 34 };
};
const ctx = vm.createContext({ getSetting_: (k, d) => d, Logger: { log() {} }, console,
  Utilities: { formatDate: (d, z, f) => f === 'yyyy-MM-dd' ? '2026-10-01' : '11/2' },
  SpreadsheetApp: { openById: () => ({ getSheetByName: () => mkSheet() }) },
  getSheet: () => ({ getParent: () => ({ getSheetByName: () => ({ getLastRow: () => 1, getRange: () => ({ setValues() {}, getValue: () => 'x' }) }) }) }) });
vm.runInContext(SRC, ctx);
ctx.sk_設定_ = () => [{ store: 'S', folder: 'f' }];
ctx.sk_対象ブック_全期間_ = () => [{ ym: '202610', id: 'a', name: '10月' }, { ym: '202611', id: 'b', name: '11月' }];
ctx.skwb_rows_ = () => ({
  'S|2026-10-22': { store: 'S', date: '2026-10-22', usen: { sales: 1, cash: 116000, guests: 16 } },
  'S|2026-11-01': { store: 'S', date: '2026-11-01', usen: { sales: 1, cash: 116000, guests: 16 } } });
const r = ctx.skwb_実行_(true, 40);
const got = r.一覧.map(x => x.日付 + ' ' + x.項目 + '=' + x.結果).join(' / ');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('  ✗', m, '\n   ', got); } };
ok(/2026-10-22 現金売上=ずれ（上書きしない）/.test(got) && /2026-10-22 客数=ずれ（上書きしない）/.test(got), '10月分は上書きしない');
ok(/2026-11-01 現金売上=レジで上書き/.test(got) && /2026-11-01 客数=レジで上書き/.test(got), '11月分はレジで上書き');
ok(cellsWritten.length === 2 && cellsWritten.every(x => x[2] === 116000 || x[2] === 16), 'セルに書くのは11月分の2つだけ');
ok(notesWritten.some(x => /^【レジで上書き】店で打った数字は 11,600円 でした/.test(x[2])), '前の数字をメモに残す');
ok(r.レジで上書き === 2 && r.ずれ === 2, '件数');
console.log(`RESULT: ${5 - fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
