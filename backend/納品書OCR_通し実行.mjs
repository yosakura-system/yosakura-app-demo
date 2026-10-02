/**
 * 世桜アプリ｜納品書OCRの通し実行 — Googleに接続せずに確かめる
 *
 *   node 納品書OCR_通し実行.mjs
 *
 * 確かめること
 *   ① 税抜の納品書（西原商会：8%対象＋消費税＋合計）→ 仕入先・8%税込・合計が読める
 *   ② 内税のレシート（イオン：8%対象／10%対象が税込）→ 8%・10%がそのまま入る
 *   ③ 名畑（酒10%＋飲料8%・税抜）→ 両方の税率を税込に直す
 *   ④ 税率の行が無い伝票＝合計だけ（a8/a10は入れない・conf:'low'）
 *   ⑤ 金額が読めない写真＝下書きを作らない
 *   ⑥ フックは納品書の提出だけに反応し、写真1枚＝1行で保存する。OCRが落ちても提出を壊さない
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(ここ, f), 'utf8');
let 通過 = 0; const 失敗 = [];
function 確認(名前, 条件, 詳細) {
  if (条件) { 通過++; console.log(`  PASS  ${名前}`); }
  else { 失敗.push({ 名前, 詳細 }); console.log(`  FAIL  ${名前}${詳細 !== undefined ? `  → ${JSON.stringify(詳細)}` : ''}`); }
}

const 追記された行 = [];
let OCRテキスト = {};
let OCR失敗させる = false;
const ctx = {
  Logger: { log() {} }, Utilities: { getUuid: () => 'test-uuid' }, Date, JSON, Number, String, Array, Object, Math, isNaN, encodeURIComponent, RegExp,
  ScriptApp: { getOAuthToken: () => 'token' },
  UrlFetchApp: { fetch(url) {
    if (OCR失敗させる) throw new Error('OCR down');
    if (url.includes('/copy')) { const id = decodeURIComponent(url.split('/files/')[1].split('/copy')[0]); return { getContentText: () => JSON.stringify({ id: 'doc:' + id }) }; }
    if (url.includes('/export')) { const id = decodeURIComponent(url.split('/files/')[1].split('/export')[0]).replace(/^doc:/, ''); return { getContentText: () => OCRテキスト[id] || '' }; }
    return { getContentText: () => '' };
  } },
  getSheet: () => ({ appendRow: (r) => 追記された行.push(r) }),
  getSetting_: () => ''
};
vm.createContext(ctx);
vm.runInContext(rd('日計OCR.gs'), ctx, { filename: '日計OCR.gs' });
vm.runInContext(rd('納品書OCR.gs'), ctx, { filename: '納品書OCR.gs' });
const parse = (t) => vm.runInContext('nouhin_parse_', ctx)(t);

console.log('== ① 税抜の納品書（西原商会）==');
let p = parse('株式会社 西原商会\n御納品書\n2026/09/15\n白だし 1本 1,945\n米 8kg 6,825\n8%対象 8,770\n消費税 701\n合計 ¥9,471\n');
確認('仕入先＝西原商会', p && p.v === '西原商会', p);
確認('8%税込＝8,770+701=9,471', p && p.a8 === 9471, p);
確認('合計 9,471・確信あり', p && p.total === 9471 && p.conf === 'high', p);
確認('10%は入れない', p && p.a10 === undefined, p);

console.log('== ② 内税のレシート（イオン）==');
p = parse('イオン 難波店\nレシート\nキャベツ ¥450\nビール ¥1,100\n小計 ¥1,550\n(8%対象 ¥450)\n(10%対象 ¥1,100)\n(内消費税 ¥133)\n合計 ¥1,550\nお預り ¥2,000\n');
確認('仕入先＝イオン', p && p.v === 'イオン', p);
確認('8%＝450（税込のまま）', p && p.a8 === 450, p);
確認('10%＝1,100（税込のまま）', p && p.a10 === 1100, p);
確認('確信あり（合計と一致）', p && p.conf === 'high' && p.total === 1550, p);

console.log('== ③ 名畑（酒10%＋飲料8%・税抜）==');
p = parse('名畑酒店\n納品書\nビール 30本 6,030\nコーラ 24本 2,928\n10%対象 6,030\n消費税 603\n8%対象 2,928\n消費税 234\n合計 9,795\n');
確認('仕入先＝名畑', p && p.v === '名畑', p);
確認('10%税込＝6,633', p && p.a10 === 6633, p);
確認('8%税込＝3,162', p && p.a8 === 3162, p);

console.log('== ④ 税率の行が無い伝票 ==');
p = parse('フレッシュ青果\nキャベツ 2 900\nミニトマト 3 1,194\n合計 2,094\n');
確認('合計だけ＝仕入先の既定で8%に（フレッシュは税込のまま）・仕入先が分かるので要確認にしない', p && p.total === 2094 && p.a8 === 2094 && p.a10 === undefined && p.conf === 'high' && p.v === 'フレッシュ青果', p);
p = parse('白だし 1本 1,945\n合計 2,094\n');
確認('仕入先が分からない合計だけ＝a8/a10なし・要確認', p && p.total === 2094 && p.a8 === undefined && p.a10 === undefined && p.conf === 'low' && !p.v, p);

console.log('== ⑤ 読めない ==');
確認('金額が無い＝null', parse('ありがとうございました\nまたお越しください') === null);
確認('空＝null', parse('') === null);

console.log('== ⑥ フック ==');
const hook = vm.runInContext('nouhin_ocr_hook_', ctx);
OCRテキスト = { AAAAAAAAAAAA1: '西原商会\n8%対象 1,000\n消費税 80\n合計 1,080', BBBBBBBBBBBB2: 'ありがとう', CCCCCCCCCCCC3: '名畑\n10%対象 ¥2,000\n消費税 ¥200\n合計 ¥2,200' };
hook({ kind: 'subrec', store: '牛カツ世桜 長堀橋店', item: 'nouhin|2026-10-01', note: { by: '店舗iPad' } }, ['AAAAAAAAAAAA1', 'BBBBBBBBBBBB2', 'CCCCCCCCCCCC3']);
確認('読めた写真だけ下書き＝2行', 追記された行.length === 2, 追記された行.length);
確認('種類 nouhindraft・店舗・日付（先頭アポストロフィ）', 追記された行[0][2] === 'nouhindraft' && 追記された行[0][3] === '牛カツ世桜 長堀橋店' && 追記された行[0][4] === "'2026-10-01", 追記された行[0]);
const n1 = JSON.parse(追記された行[0][6]), n2 = JSON.parse(追記された行[1][6]);
確認('1枚目＝西原 8%税込1,080・写真IDつき・src ocr', n1.v === '西原商会' && n1.a8 === 1080 && n1.photo === 'AAAAAAAAAAAA1' && n1.src === 'ocr', n1);
確認('3枚目＝名畑 10%税込2,200', n2.v === '名畑' && n2.a10 === 2200 && n2.photo === 'CCCCCCCCCCCC3', n2);
追記された行.length = 0;
hook({ kind: 'subrec', store: 'S', item: 'openphoto|2026-10-01' }, ['AAAAAAAAAAAA1']);
確認('納品書以外の提出には反応しない', 追記された行.length === 0);
OCR失敗させる = true; let threw = false;
try { hook({ kind: 'subrec', store: 'S', item: 'nouhin|2026-10-01' }, ['AAAAAAAAAAAA1']); } catch (e) { threw = true; }
確認('OCRが落ちても例外を外に出さない・行も増えない', !threw && 追記された行.length === 0);

console.log(`\nRESULT: ${通過} passed, ${失敗.length} failed`);
if (失敗.length) process.exit(1);
