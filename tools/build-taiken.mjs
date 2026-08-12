/* ===================================================================
   build-taiken.mjs — 体験版（加盟店の皆さまへお配りする版）を組み立てる
   -------------------------------------------------------------------
   なぜ要るか（2026-08-12 勉強会デモMTGの決定）：
     いまのプレビューURLは、知っている人が開けば「本当に送信できてしまう」。
     勉強会の参加者へそのまま配ると、練習の入力が本物の履歴として溜まる。
     そこで、**どこを押しても本物の記録に届かない版**を別に用意して配る。

   体験版が通常版と違うのは3点だけ：
     1) app.js の API_URL_DEFAULT = ''  ← これだけで「体験版」になる
        ・アプリ側が TAIKEN を見て、体験版の帯を出し、接続先の設定画面を隠す
        ・端末に接続先が残っていても無視する（app.js の getApiUrl）
        ・保存先が無いので、見本データ（seed）が入った状態で始まる
     2) sw.js の CACHE 名 = 'yosakura-taiken-vN'（通常版と食い合わないように）
     3) app.js の APP_BUILD = 'yosakura-taiken-vN'（画面下に出る版）

   使い方：
     node tools/build-taiken.mjs            → _taiken/ に組み立てるだけ（公開しない）
     node tools/build-taiken.mjs --check    → 組み立てずに、いまの版で問題が起きないかだけ見る

   ★公開（GitHub Pages へ push）はこのスクリプトでは行わない。
     配る先が決まってから、置き場所を決めて公開する。
=================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_taiken');
const CHECK_ONLY = process.argv.includes('--check');

const LF = (s) => s.replace(/\r\n/g, '\n');
const rd = (p) => LF(fs.readFileSync(p, 'utf8'));

// ── 1) app.js：接続先を空にする（体験版になる唯一の条件）────────────
let app = rd(path.join(ROOT, 'app.js'));
const urlLine = app.match(/ {2}const API_URL_DEFAULT = '[^']*';/);
if (!urlLine) throw new Error('app.js の API_URL_DEFAULT の行が見つかりません');
if (!urlLine[0].includes('https')) throw new Error('app.js の API_URL_DEFAULT が既に空です（通常版から作ってください）');
app = app.replace(urlLine[0], "  const API_URL_DEFAULT = ''; // 体験版＝保存先を持たない（build-taiken.mjs が入れる）");

/* 念のための二重確認：組み立てた中に、実際に届いてしまう保存先が残っていないこと。
   ※ 設定画面の入力例（.../exec というプレースホルダー）は本物ではないので数えない。
     本物かどうかは「長い識別子が入っているか」で見分ける。 */
const leaks = (app.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}[^\s'"]*/g) || []);
if (leaks.length) throw new Error('体験版に本物の保存先が残っています：\n' + leaks.join('\n'));

// ── 2) 版の番号を1つ進める ──────────────────────────────────
let sw = rd(path.join(ROOT, 'sw.js'));
const swm = sw.match(/const CACHE = '([a-z-]+)-v(\d+)';/);
if (!swm) throw new Error('sw.js の CACHE 行が見つかりません');
const prev = fs.existsSync(path.join(OUT, 'sw.js'))
  ? (rd(path.join(OUT, 'sw.js')).match(/const CACHE = 'yosakura-taiken-v(\d+)';/) || [null, '0'])[1]
  : '0';
const nextN = Number(prev) + 1;
const TAG = `yosakura-taiken-v${nextN}`;
sw = sw.replace(swm[0], `const CACHE = '${TAG}';`);

const buildLine = app.match(/ {2}const APP_BUILD = '[^']*';/);
if (!buildLine) throw new Error('app.js の APP_BUILD の行が見つかりません');
app = app.replace(buildLine[0], `  const APP_BUILD = '${TAG}';`);

if (CHECK_ONLY) {
  console.log('確認しました。体験版として組み立てられます。');
  console.log(`　・保存先＝空（外部のURLは0件）`);
  console.log(`　・次の版＝${TAG}`);
  process.exit(0);
}

// ── 3) 書き出す ────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'app.js'), app);
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);
for (const f of ['index.html', 'styles.css', 'manifest.webmanifest']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}
fs.cpSync(path.join(ROOT, 'icons'), path.join(OUT, 'icons'), { recursive: true });

// 配る相手が最初に読むもの（開いた人が不安にならないように）
fs.writeFileSync(path.join(OUT, 'README.md'), `# 世桜アプリ　体験版

この版は、**自由に触っていただくためのもの**です。

- どこを押していただいても大丈夫です。
- 入力した内容は**お使いの端末の中だけに残ります**。お店の記録には送られません。
- 表示されている数字・お客様の声は**見本**です。実際のお店のものではありません。
- 触った内容を消したいときは、ブラウザの履歴（サイトデータ）を消してください。

版：${TAG}
`);

console.log(`体験版を組み立てました： ${OUT}`);
console.log(`版：${TAG}`);
console.log('※ まだ公開はしていません。置き場所が決まってから公開します。');
