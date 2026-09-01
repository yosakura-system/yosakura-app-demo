/**
 * 世桜アプリ｜日計OCRの通し実行 — Googleに接続せずに確かめる
 *
 *   node 日計OCR_通し実行.mjs
 *
 * OCRテキストは、本物の日計レポート（牛カツ長堀橋店 2026-08-28 取引別）の文言を写している。
 *
 * 確かめること
 *   ① 実物どおりの文言から6欄（組数・客数・現金・クレジット・電子マネー・売上）が読める
 *   ② 「総売上点数」「純売上」「現金在高」「お預かり現金」を誤って拾わない
 *   ③ 読めなかった欄は入れない（0で埋めない）
 *   ④ 内訳の合計が売上と大きく食い違うときは内訳を捨てる（誤読の合図）
 *   ⑤ フックは日計レポートの提出だけに反応し、下書きを正しい種類で保存する
 *   ⑥ OCRが失敗しても提出処理を壊さない
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

/* ===== 偽のGAS環境 ===== */
const 追記された行 = [];
let OCRテキスト = {};              // fileId → 返すテキスト
let OCR失敗させる = false;
const ctx = {
  Logger: { log() {} },
  Utilities: { getUuid: () => 'test-uuid' },
  Date,
  JSON,
  Number, String, Array, Object, Math, isNaN, encodeURIComponent, RegExp,
  ScriptApp: { getOAuthToken: () => 'token' },
  UrlFetchApp: {
    fetch(url, opt) {
      if (OCR失敗させる) throw new Error('OCR down');
      if (url.includes('/copy')) return { getContentText: () => JSON.stringify({ id: 'doc1' }) };
      if (url.includes('/export')) {
        const src = Object.keys(OCRテキスト)[0];
        return { getContentText: () => OCRテキスト[src] || '' };
      }
      return { getContentText: () => '' };
    }
  },
  getSheet: () => ({ appendRow: (r) => 追記された行.push(r) })
};
vm.createContext(ctx);
vm.runInContext(rd('日計OCR.gs'), ctx, { filename: '日計OCR.gs' });

/* ===== 実物（2026-08-28 取引別レポート）の文言 ===== */
const 実物テキスト = `日計レポート 取引別
店舗名:牛カツ世桜 長堀橋店
営業日付:2026年8月28日
担当者:店長
POS:全て
組数 15組
客数 26客
男性 11客
女性 17客
選択なし 0客
客単価（税込） ¥5,136
客単価（税抜） ¥4,669
総売上点数 45点
売上 ¥143,800
税率 10% ¥143,800
(内消費税)
消費税 ¥13,078
純売上 ¥130,722
控除後純売上 ¥130,722
＊支払情報＊
現金 4件 ¥44,700
クレジット 12件 ¥99,100
ポイント 0件 ¥0
電子マネー 0件 ¥0
お預かり現金 ¥44,700
おつり ¥0
＊入出金情報＊
レジオープン時現金 1件 ¥50,000
入金 0件 ¥0
出金 0件 ¥0
現金在高 ¥94,700
2026/08/28 22:23`;

console.log('== ① 実物の文言から6欄が読める ==');
{
  const p = ctx.nikkei_parse_(実物テキスト);
  確認('組数=15', p.kumi === 15, p);
  確認('客数=26', p.kyaku === 26, p);
  確認('売上=143800', p.total === 143800, p);
  確認('現金=44700', p.cash === 44700, p);
  確認('クレジット=99100', p.card === 99100, p);
  確認('電子マネー=0', p.emoney === 0, p);
}

console.log('== ①-2 OCRが行を割っても読める（「現金 4件 ¥44,700」が3行になる等） ==');
{
  const p = ctx.nikkei_parse_('組数\n15組\n客数\n26客\n男性 11客\n売上\n¥143,800\n現金\n4件\n¥44,700\nクレジット\n12件\n¥99,100\n電子マネー\n0件\n¥0');
  確認('割れた組数=15・客数=26（男性11に釣られない）', p.kumi === 15 && p.kyaku === 26, p);
  確認('割れた現金=44700（件数の4を金額と取り違えない）', p.cash === 44700, p);
  確認('割れたクレジット=99100・売上=143800・電子マネー=0', p.card === 99100 && p.total === 143800 && p.emoney === 0, p);
}

console.log('== ② 紛らわしい行を誤って拾わない ==');
{
  const p = ctx.nikkei_parse_('総売上点数 45点\n純売上 ¥130,722\n現金在高 ¥94,700\nお預かり現金 ¥44,700\nレジオープン時現金 1件 ¥50,000');
  確認('売上・現金とも拾わない（該当行なし）', p.total === undefined && p.cash === undefined, p);
}

console.log('== ③ 読めなかった欄は入れない ==');
{
  const p = ctx.nikkei_parse_('売上 ¥88,000\nなにか別の行');
  確認('売上だけが入り、他の欄は無い', p.total === 88000 && p.cash === undefined && p.kyaku === undefined, p);
  確認('まったく読めなければ空', Object.keys(ctx.nikkei_parse_('ぼやけて読めない')).length === 0);
}

console.log('== ④ 内訳が売上と食い違うときは内訳を捨てる ==');
{
  const p = ctx.nikkei_parse_('売上 ¥143,800\n現金 4件 ¥14,700\nクレジット 12件 ¥99,100\n電子マネー 0件 ¥0');
  確認('売上は残る', p.total === 143800, p);
  確認('内訳（現金・カード・電子マネー）は捨てる', p.cash === undefined && p.card === undefined && p.emoney === undefined, p);
}

console.log('== ⑤ フックの反応と下書きの保存 ==');
{
  追記された行.length = 0;
  OCRテキスト = { photo1: 実物テキスト };
  ctx.nikkei_ocr_hook_({ kind: 'subrec', store: '牛カツ世桜 長堀橋店', item: 'nikkei_idle|2026-09-01' }, ['photo1-abcdefgh']);
  確認('アイドル分は chukandraft で保存', 追記された行.length === 1 && 追記された行[0][2] === 'chukandraft', 追記された行);
  確認('対象日と店舗が入る', 追記された行[0][4] === '2026-09-01' && 追記された行[0][3] === '牛カツ世桜 長堀橋店');
  const note = JSON.parse(追記された行[0][6]);
  確認('数字とsrc=ocrが入る', note.total === 143800 && note.kumi === 15 && note.src === 'ocr', note);

  追記された行.length = 0;
  ctx.nikkei_ocr_hook_({ kind: 'subrec', store: '牛カツ世桜 長堀橋店', item: 'nikkei_close|2026-09-01' }, ['photo1-abcdefgh']);
  確認('クローズ分は skdraft で保存', 追記された行.length === 1 && 追記された行[0][2] === 'skdraft', 追記された行);

  追記された行.length = 0;
  ctx.nikkei_ocr_hook_({ kind: 'subrec', store: '牛カツ世桜 長堀橋店', item: 'nouhin|2026-09-01' }, ['photo1-abcdefgh']);
  ctx.nikkei_ocr_hook_({ kind: 'kizuki', store: '牛カツ世桜 長堀橋店', item: 'nikkei_idle|2026-09-01' }, ['photo1-abcdefgh']);
  ctx.nikkei_ocr_hook_({ kind: 'subrec', store: '牛カツ世桜 長堀橋店', item: 'nikkei_idle|2026-09-01' }, []);
  確認('納品書・他kind・写真なしには反応しない', 追記された行.length === 0, 追記された行);
}

console.log('== ⑥ OCRが失敗しても提出処理を壊さない ==');
{
  追記された行.length = 0;
  OCR失敗させる = true;
  let 例外 = null;
  try { ctx.nikkei_ocr_hook_({ kind: 'subrec', store: '牛カツ世桜 長堀橋店', item: 'nikkei_idle|2026-09-01' }, ['photo1-abcdefgh']); }
  catch (e) { 例外 = e; }
  確認('例外を外に出さない・下書きも作らない', 例外 === null && 追記された行.length === 0);
  OCR失敗させる = false;
}

console.log('== Code.gs 側のフックの確認（ソース） ==');
{
  const code = rd('Code.gs');
  確認('doPostにフックがある', /typeof nikkei_ocr_hook_ === 'function'/.test(code));
  確認('フックはtry/catchで守られている', /try \{ nikkei_ocr_hook_\(data, photoIds\); \} catch/.test(code));
}

console.log(`\n結果: ${通過} PASS / ${失敗.length} FAIL`);
process.exit(失敗.length ? 1 : 0);
