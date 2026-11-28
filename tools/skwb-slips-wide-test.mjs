import fs from 'node:fs'; import vm from 'node:vm';
// 仕入の内訳の書き戻し＝広島店の広げた決まり（2026-11-27）。11月・広島店の日別タブの実物の並び（行40〜58・B／L列、金額は G／R列）
const SRC = fs.readFileSync(new URL('../backend/総括表書き戻し.gs', import.meta.url), 'utf8');
const mk = () => {
  const ctx = vm.createContext({ getSetting_: (k, d) => d, Logger: { log() {} }, Utilities: { formatDate: () => '11/28' }, console });
  vm.runInContext(SRC, ctx);
  const R = 100, C = 34; const vals = Array.from({ length: R }, () => Array(C).fill('')); const fmls = Array.from({ length: R }, () => Array(C).fill('')); const notes = Array.from({ length: R }, () => Array(C).fill(''));
  vals[38][1] = '＜仕入れ内訳＞';
  const food = ['フード', '西原(フード)', 'うすなが牧場', 'マツレン', '梶野茶業', 'オノウエ', '', '世桜', '', 'Amazon', '', '', '', 'フレッシュ', 'アスクル', '(予備)', '送料10%', '現金', '合計'];
  food.forEach((l, i) => { vals[39 + i][1] = l; if (i > 0 && i < food.length - 1) fmls[39 + i][1] = "='仕入台帳'!D6"; });   // 行の名前は式（仕入台帳の見出しを引く）
  fmls[39 + 18][6] = '=SUM(G41:J57)';
  const drink = ['ドリンク', '●●（酒10％）', '●●（酒以外8％）', 'ZEST（世桜梅酒10％）', '現金（酒10％）', '現金（酒以外8％）', '(予備)10％', '合計'];
  drink.forEach((l, i) => { vals[39 + i][11] = l; });
  fmls[39 + 7][17] = '=SUM(R41:T46)';
  return { ctx, vals, fmls, notes };
};
const S = '和牛世桜 広島店';
const slips = [
  { v: '西原商会', a8: '3294' }, { v: 'フレッシュ青果', a8: '572' }, { v: 'オノウエ水産（いくら）', a8: '32220' }, { v: '大和屋', a8: '745', a10: '3333' },
  { v: 'Amazon', a8: '1783' }, { v: 'ローソン', a10: '750' }, { v: 'その他', a8: '500' }, { v: '本部', a8: '9000' } ];
const run = (date, store, pre) => {
  const { ctx, vals, fmls, notes } = mk(); if (pre) pre(vals);
  const 結果 = { 書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [] };
  ctx.skwb_slips_({ store, date, app: { slips } }, vals, fmls, notes, null, { name: 'book' }, Number(date.slice(8)), store, {}, 結果, [], false);
  return { got: Object.fromEntries(結果.一覧.map(r => [r.項目, r.結果.split('（')[0] + ':' + r.書く値 + '@' + r.セル.split('!')[1]])), 止めた: 結果.止めた };
};
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
// ① 開始日以降の広島店＝全部の行が決まる
{ const { got, 止めた } = run('2026-11-28', S);
  const want = { '仕入 西原商会': '書く:3294@G41', '仕入 フレッシュ青果': '書く:572@G53', '仕入 オノウエ水産（いくら）': '書く:32220@G45', '仕入 大和屋（酒10%）': '書く:3333@R41', '仕入 大和屋（酒以外8%）': '書く:745@R42', '仕入 Amazon': '書く:1783@G49', '仕入 その他（まとめ）': '書く:1250@G55' };
  for (const k of Object.keys(want)) ok(got[k] === want[k], `広島 11/28 ${k} 期待 ${want[k]} 結果 ${got[k]}`);
  ok(Object.keys(got).length === Object.keys(want).length, '広島 11/28 余計な行に書かない（' + Object.keys(got).join('・') + '）');
  ok(止めた.length === 1 && /本部請求は仕入れ内訳に行が無い/.test(止めた[0]), '広島 11/28 止めたのは本部請求だけ（' + 止めた.join(' / ') + '）'); }
// ② 開始日より前の広島店＝今までどおり（西原・フレッシュ・Amazon だけ。ほかは止める）
{ const { got, 止めた } = run('2026-11-27', S);
  ok(got['仕入 西原商会'] === '書く:3294@G41' && got['仕入 フレッシュ青果'] === '書く:572@G53' && got['仕入 Amazon'] === '書く:1783@G49' && Object.keys(got).length === 3, '広島 11/27（開始日より前）＝今までどおり3行だけ（' + Object.keys(got).join('・') + '）');
  ok(止めた.some(x => /オノウエ水産/.test(x)) && 止めた.some(x => /大和屋/.test(x)) && 止めた.some(x => /その他/.test(x)), '広島 11/27 行の無い仕入先は止める（遡って(予備)へ書かない＝二重に数えない）'); }
// ③ ほかの店＝開始日以降でも今までどおり
{ const { got } = run('2026-11-28', '牛カツ世桜 長堀橋店');
  ok(Object.keys(got).length === 3 && !got['仕入 その他（まとめ）'] && !got['仕入 大和屋（酒10%）'], 'ほかの店は広げない（' + Object.keys(got).join('・') + '）'); }
// ④ (予備)の行に店が別の数字を入れている＝上書きしない（止める）
{ const { got, 止めた } = run('2026-11-28', S, (vals) => { vals[39 + 15][6] = 9999; });
  ok(!got['仕入 その他（まとめ）'] && 止めた.some(x => /その他（まとめ）/.test(x)), '(予備)の行に店の数字があれば書かない'); }
// ⑤ ●●の行に店が別の数字を入れている＝ずれ（上書きしない）
{ const { got } = run('2026-11-28', S, (vals) => { vals[39 + 1][17] = 5000; });
  ok(/^ずれ:3333@R41/.test(got['仕入 大和屋（酒10%）'] || ''), 'お酒の行に店の数字があれば「ずれ」で残す（' + got['仕入 大和屋（酒10%）'] + '）'); }
// ⑥ 浅草橋（2026-11-28）＝11月の日別タブの実物の並び。カクヤス・フレッシュエージェントは行が無い＝まとめて(予備)へ・11月の頭から
{ const A = '日本鰻世桜 浅草橋店';
  const go = (date) => { const { ctx, vals, fmls, notes } = mk();
    ['西原(フード)', 'ヤスイ', 'ナオト水産', 'Utec 鰻', 'オノウエ', 'Aﾌﾟﾗｲｽ', 'メイヨウ', '魚伸', 'Amazon', '玉出', 'ガッツ橋本', '(予備)', '(予備)', '(予備)', '(予備)', '送料10%', '現金'].forEach((l, i) => { vals[40 + i][1] = l; });
    ['名畑（酒10％）', '名畑（酒以外8％）', 'ZEST（世桜梅酒10％）', '現金（酒10％）', '現金（酒以外8％）', '(予備)10％'].forEach((l, i) => { vals[40 + i][11] = l; });
    const 結果 = { 書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [] };
    const sl = [{ v: '西原商会', a8: '1000' }, { v: 'フレッシュエージェント', a8: '500' }, { v: 'オノウエ', a8: '3024' }, { v: 'カクヤス', a8: '145', a10: '4950' }, { v: '送料', a10: '1980' },
      { v: '本部（鰻・タレ）', a8: '239760' }, { v: '本部（鰻・タレ）', a8: '6804' }, { v: '本部（和牛）', a8: '145217' }, { v: '本部（梅酒）', a10: '29370' }, { v: '本部', a8: '1000' }];
    ctx.skwb_slips_({ store: A, date, app: { slips: sl } }, vals, fmls, notes, null, { name: 'book' }, Number(date.slice(8)), A, {}, 結果, [], false);
    return { got: Object.fromEntries(結果.一覧.map(r => [r.項目, r.結果.split('（')[0] + ':' + r.書く値 + '@' + r.セル.split('!')[1]])), 止めた: 結果.止めた }; };
  const a = go('2026-11-05');
  ok(a.got['仕入 西原商会'] === '書く:1000@G41' && a.got['仕入 オノウエ'] === '書く:3024@G45' && a.got['仕入 その他（まとめ）'] === '書く:6595@G52' && a.got['仕入 送料'] === '書く:1980@G56' && a.got['仕入 Utec'] === '書く:246564@G44' && a.got['仕入 銘洋'] === '書く:145217@G47' && a.got['仕入 ZEST（酒10%）'] === '書く:29370@R43' && Object.keys(a.got).length === 7 && a.止めた.length === 0, '浅草橋 11/5＝西原・オノウエは名前の行、カクヤス＋フレッシュエージェントは(予備)へまとめる・落とさない（' + JSON.stringify(a.got) + ' / ' + a.止めた.join('／') + '）');
  const b = go('2026-10-31');
  ok(Object.keys(b.got).length === 3 && b.got['仕入 送料'] === '書く:1980@G56' && !b.got['仕入 その他（まとめ）'] && !b.got['仕入 Utec'] && b.止めた.some(x => /本部請求は仕入れ内訳に行が無い/.test(x)), '浅草橋 10/31（開始日より前）＝今までどおり（' + Object.keys(b.got).join('・') + '）'); }
// ⑦ 前の金額を0に戻す（2026-11-28 Codex）＝全額返品・仕入先の選び直し・店が手で直した値には触らない
{ const A = '日本鰻世桜 浅草橋店';
  const go2 = (sl, pre, prev) => { const { ctx, vals, fmls, notes } = mk();
    ['西原(フード)', 'ヤスイ', 'ナオト水産', 'Utec　鰻', 'オノウエ', 'Aﾌﾟﾗｲｽ', 'メイヨウ', '魚伸', 'Amazon', '玉出', 'ガッツ橋本', '(予備)', '(予備)', '(予備)', '(予備)', '送料10%', '現金'].forEach((l, i) => { vals[40 + i][1] = l; });
    ['名畑（酒10％）', '名畑（酒以外8％）', 'ZEST（世桜梅酒10％）', '現金（酒10％）', '現金（酒以外8％）', '(予備)10％'].forEach((l, i) => { vals[40 + i][11] = l; });
    pre(vals); const 結果 = { 書く: 0, 書き直す: 0, 同じ: 0, ずれ: 0, 止めた: [], 一覧: [] };
    ctx.skwb_slips_({ store: A, date: '2026-11-30', app: { slips: sl } }, vals, fmls, notes, null, { name: 'book' }, 30, A, prev, 結果, [], false);
    return Object.fromEntries(結果.一覧.map(r => [r.セル.split('!')[1], r.結果.split('（')[0] + ':' + r.書く値])); };
  // 全額返品＝前に書いた 1,000 が Utec の行（G44）に残っている → 0 に戻す
  const r1 = go2([{ v: '本部（鰻・タレ）', a8: '1000' }, { v: '本部（鰻・タレ）', a8: '1000', ret: true }], v => { v[43][6] = 1000; }, { 'book|30|G44': 1000 });
  ok(r1.G44 === '書き直す:0' && Object.keys(r1).length === 1, '全額返品＝前回こちらが書いた金額を0に戻す（' + JSON.stringify(r1) + '）');
  // 仕入先を「本部」→「本部（和牛）」に選び直した＝(予備)の行（G52）に残った 1,000 を0に・メイヨウ（G47）へ書く
  const r2 = go2([{ v: '本部（和牛）', a8: '1000' }], v => { v[51][6] = 1000; }, { 'book|30|G52': 1000 });
  ok(r2.G47 === '書く:1000' && r2.G52 === '書き直す:0' && Object.keys(r2).length === 2, '仕入先の選び直し＝前の行を0に戻して二重にしない（' + JSON.stringify(r2) + '）');
  // 店が手で直した値（前回こちらが書いた値と違う）・こちらが書いた記録の無いセルには触らない
  const r3 = go2([{ v: '本部（和牛）', a8: '1000' }], v => { v[51][6] = 1500; v[40][6] = 3000; }, { 'book|30|G52': 1000 });
  ok(r3.G47 === '書く:1000' && !r3.G52 && !r3.G41 && Object.keys(r3).length === 1, '店が手で入れた値・記録の無いセルは0にしない（' + JSON.stringify(r3) + '）');
  // 直接「銘洋」と「本部（和牛）」は同じ行に合算・梅酒の8%は(予備)へ
  const r4 = go2([{ v: '本部（和牛）', a8: '1000' }, { v: '銘洋', a8: '500' }, { v: '本部（梅酒）', a8: '300', a10: '29370' }], v => {}, {});
  ok(r4.G47 === '書く:1500' && r4.R43 === '書く:29370' && r4.G52 === '書く:300' && Object.keys(r4).length === 3, '銘洋との合算・梅酒の8%は(予備)へ（' + JSON.stringify(r4) + '）'); }
console.log(`RESULT: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
