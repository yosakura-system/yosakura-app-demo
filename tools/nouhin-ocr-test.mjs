// 納品書OCR（backend/納品書OCR.gs の nouhin_parse_）の回帰テスト
// 正解＝写真を目で見た値（2026-10-15 長堀橋の実物）。読み取り文字は本部データの下書き（raw）からそのまま。
//   node tools/nouhin-ocr-test.mjs            … 固定の検査
//   node tools/nouhin-ocr-test.mjs <raw.json> … 下書きの raw をすべて読み直して一覧（照合用）
import fs from 'node:fs';
import vm from 'node:vm';
const SRC = fs.readFileSync(new URL('../backend/納品書OCR.gs', import.meta.url), 'utf8');
const ctx = vm.createContext({ getSetting_: (k, d) => d, Logger: { log() {} }, console });
vm.runInContext(SRC, ctx, { filename: '納品書OCR.gs' });
const parse = (t) => ctx.nouhin_parse_(t);

let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) PASS++; else { FAIL++; console.log('  ✗ ' + m); } };
const T = (name, text, want) => {
  const p = parse(text) || {};
  const got = { v: p.v, a8: p.a8 || 0, a10: p.a10 || 0, total: p.total || 0, conf: p.conf };
  const good = got.v === want.v && got.a8 === (want.a8 || 0) && got.a10 === (want.a10 || 0) && got.total === want.total && (!want.conf || got.conf === want.conf);
  ok(good, `${name}: 期待 ${JSON.stringify(want)} ／ 結果 ${JSON.stringify(got)}`);
};

const FIX = JSON.parse(fs.readFileSync(new URL('./nouhin-ocr-fixtures.json', import.meta.url), 'utf8'));
for (const f of FIX) {
  if (f.multi) { const ps = ctx.nouhin_parse_all_(f.raw) || []; ok(ps.length === f.multi.length && f.multi.every((w, i) => ps[i] && ps[i].v === w.v && ps[i].total === w.total), `${f.name}: 期待 ${JSON.stringify(f.multi)} ／ 結果 ${JSON.stringify(ps.map(p => ({ v: p.v, total: p.total, conf: p.conf })))}`); continue; }
  T(f.name, f.raw, f.want);
}

if (process.argv[2]) {
  const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (const r of rows) {
    if (!r.raw) continue;
    const ps = ctx.nouhin_parse_all_(r.raw) || [];
    console.log(`${r.date} ${String(r.photo).slice(0, 7)} ${r.v}: 旧 ${r.a8 || 0}/${r.a10 || 0}=${r.total} (${r.conf}) → 新 ` + ps.map(p => `${p.v} ${p.a8 || 0}/${p.a10 || 0}=${p.total} (${p.conf})`).join(' ＋ '));
  }
}
{ const p0 = parse(FIX[0].raw) || {}, p1 = parse(FIX[0].raw + '\n返品伝票') || {}, p2 = parse(FIX[0].raw.replace('納品書', '赤伝')) || {};
  ok(!p0.ret && p1.ret === true && p2.ret === true && p1.v === '名畑', '「返品」「赤伝」の文字がある伝票は ret:true（仕入から引く・2026-10-15）'); }
console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
