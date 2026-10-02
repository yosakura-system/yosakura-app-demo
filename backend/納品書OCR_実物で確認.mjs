/**
 * 世桜アプリ｜納品書OCRを「実物のOCR文字」で確かめる（2026-10-02）
 *
 *   node 納品書OCR_実物で確認.mjs [samples.json]
 *
 * 本部データの納品書写真をGoogleの文字起こしにかけた文字（scratchpad の nouhin_ocr_samples.json）を
 * nouhin_parse_ に通し、仕入先・8%・10%・税込/税抜の判定が期待どおりかを1枚ずつ出す。
 * 期待値（expect）は伝票の実物を目で読んで置いたもの。読み取りルールを直すときは、ここが落ちないことを見る。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const samplesPath = process.argv[2] || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude', 'C--Users-Watar-OneDrive--------Claude-Code---', '062da501-597d-4078-b993-b613e5732ee7', 'scratchpad', 'nouhin_ocr_samples.json');
const samples = JSON.parse(fs.readFileSync(samplesPath, 'utf8'));

const ctx = { Logger: { log() {} }, Utilities: { getUuid: () => 'u' }, Date, JSON, Number, String, Array, Object, Math, isNaN, RegExp, encodeURIComponent,
  getSheet: () => ({ appendRow() {} }), getSetting_: () => '', HEADERS: [] };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ここ, '納品書OCR.gs'), 'utf8'), ctx);

let ok = 0, ng = 0;
for (const s of samples) {
  const p = ctx.nouhin_parse_(s.text);
  const e = s.expect || {};
  const got = p ? { v: p.v, a8: p.a8, a10: p.a10, total: p.total, conf: p.conf } : null;
  const problems = [];
  if (!p) problems.push('読めない');
  else {
    if (e.v && p.v !== e.v) problems.push(`仕入先 ${p.v || '（なし）'}≠${e.v}`);
    if (e.a8 != null && p.a8 !== e.a8) problems.push(`8% ${p.a8}≠${e.a8}`);
    if (e.a10 != null && (p.a10 || 0) !== e.a10) problems.push(`10% ${p.a10 || 0}≠${e.a10}`);
    if (e.total_excl != null && p.total !== e.total_excl && p.a8 !== Math.floor(e.total_excl * 1.08)) problems.push(`合計 ${p.total}（税抜${e.total_excl}）`);
  }
  if (problems.length) { ng++; console.log(`  FAIL ${s.id.slice(0, 8)}  ${JSON.stringify(got)}  ← ${problems.join('／')}${e.note ? '  ※' + e.note : ''}`); }
  else { ok++; console.log(`  PASS ${s.id.slice(0, 8)}  ${JSON.stringify(got)}`); }
}
console.log(`\n実物 ${samples.length}枚：合格 ${ok}／不合格 ${ng}`);
