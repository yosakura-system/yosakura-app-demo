import fs from 'node:fs'; import vm from 'node:vm';
// 仕入の内訳の書き戻し（総括表書き戻し.gs の skwb_slips_）の回帰＝10月・長堀橋「10」タブの実物の並び（2026-10-15）
const SRC = fs.readFileSync(new URL('../backend/総括表書き戻し.gs', import.meta.url), 'utf8');
const ctx = vm.createContext({ getSetting_: (k, d) => d, Logger: { log() {} }, Utilities: { formatDate: () => '10/15' }, console });
vm.runInContext(SRC, ctx);
const R = 100, C = 34; const vals = Array.from({ length: R }, () => Array(C).fill('')); const fmls = Array.from({ length: R }, () => Array(C).fill('')); const notes = Array.from({ length: R }, () => Array(C).fill(''));
// 10月・長堀橋「10」タブの実物（行39〜57・B〜S。0始まり＝行38〜56）
vals[37][1] = '＜仕入れ内訳＞';
const food = [['フード',''],['西原(フード)',4900],['フレッシュ',4104],['AEON',1720],['鰻',''],['オノウエ',''],['Aﾌﾟﾗｲｽ',''],['メイヨウ',''],['魚伸',''],['Amazon',''],['',''],['ODA',''],['ローソン',447],['(予備)',''],['(予備)',''],['(予備)',''],['送料10%',''],['現金',''],['合計',11171]];
food.forEach(([l, v], i) => { vals[38 + i][1] = l; vals[38 + i][6] = v; });
fmls[38 + 18][6] = '=SUM()';
const drink = [['ドリンク',''],['名畑（酒10％）',5880],['名畑（酒以外8％）',''],['ZEST（世桜梅酒10％）',''],['現金（酒10％）',''],['現金（酒以外8％）',''],['(予備)10％',''],['合計',5880]];
drink.forEach(([l, v], i) => { vals[38 + i][11] = l; vals[38 + i][17] = v; });
const e = { store: '牛カツ世桜 長堀橋店', date: '2026-10-10', app: { slips: [
  { v: 'ローソン', a8: '447' }, { v: 'イオン', a8: '1720' }, { v: 'フレッシュ青果', a8: '1944' }, { v: 'フレッシュ青果', a8: '2160' },
  { v: '本部', a10: '169' }, { v: '西原商会', a8: '4900' }, { v: '名畑', a10: '5880' }, { v: 'ナオト水産', a8: '5400' },
  { v: 'ナオト水産', a8: '1400', ret: 1 }, { v: 'Amazon', a8: '300', ret: 1 } ] } };   // ★返品＝ナオト 5400-1400=4000・Amazon は返品だけ＝-300（2026-10-15）
const 結果 = { 書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [] };
ctx.skwb_slips_(e, vals, fmls, notes, null, { name: 'book' }, 10, e.store, {}, 結果, [], false);
const got = Object.fromEntries(結果.一覧.map(r => [r.項目, r.結果.split('（')[0] + ':' + r.書く値]));
const want = { '仕入 ローソン': '同じ:447', '仕入 イオン': '同じ:1720', '仕入 フレッシュ青果': '同じ:4104', '仕入 西原商会': '同じ:4900', '仕入 名畑（酒10%）': '同じ:5880', '仕入 ナオト水産': '書く:4000', '仕入 Amazon': '書く:-300' };
let fail = 0; for (const k of Object.keys(want)) if (got[k] !== want[k]) { fail++; console.log('  ✗', k, '期待', want[k], '結果', got[k]); }
if (!結果.止めた.some(x => /本部請求は仕入れ内訳に行が無い/.test(x))) { fail++; console.log('  ✗ 本部請求を書かない'); }
console.log(`RESULT: ${Object.keys(want).length + 1 - fail} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
