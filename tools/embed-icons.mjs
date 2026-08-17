/* ===================================================================
   embed-icons.mjs — ロゴ・アイコンをアプリ本体へ埋め込む
   -------------------------------------------------------------------
   なぜ要るか（2026-08-13 神田さんのご要望）：
     作業フォルダはOneDriveにあり、**画像は定期的に削除する運用**にしている。
     ところがアプリは `icons/*.png` を読みに行くため、消すと
     ①手元で開いたときにロゴが出ない ②その状態で撮ったスクショが資料に載る、
     ということが起きていた（2026-08-13 に実際に発生）。

     そこで、**画面に出る画像は app.js と index.html の中へ文字として埋め込む**。
     埋め込んだあとは、手元の `icons/` を消しても画面はこれまでどおり出る。

   ★元データはgitから取り出す（作業ツリーに実体が無くても動く）。
     icons/ には skip-worktree が立っており、実体だけ消えていることがあるため。

   使い方： node tools/embed-icons.mjs
   　　　　 node tools/embed-icons.mjs --check   ← 埋め込み済みか確かめるだけ

   ※ manifest.webmanifest と apple-touch-icon は**ファイルのまま**にしている。
     ホーム画面に追加したときのアイコンは、端末によっては data: を受け付けないため。
     これらは画面の表示には関係しないので、消えていても見た目は変わらない。
=================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

// gitが持っている中身を正とする（作業ツリーに実体が無くても取り出せる）
const readIcon = (rel) => {
  try {
    const buf = execSync(`git show HEAD:${rel}`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    if (buf.length) return buf;
  } catch (_) { /* gitに無ければ作業ツリーを見る */ }
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p) || !fs.statSync(p).size) throw new Error(`${rel} が見つかりません（gitにも作業ツリーにも実体がありません）`);
  return fs.readFileSync(p);
};
const dataUri = (rel) => `data:image/png;base64,${readIcon(rel).toString('base64')}`;

const LOGO = dataUri('icons/logo-full.png');   // 起動画面・見出しの大きいロゴ
const ICON = dataUri('icons/icon-192.png');    // 画面上部の小さいアイコン
const FAVI = dataUri('icons/favicon-32.png');  // ブラウザのタブ

/* 印（マーカー）の間だけを書き換える。手で書いた説明は残す。 */
const between = (src, tag, body) => {
  const re = new RegExp(`(/\\* <${tag}> \\*/)[\\s\\S]*?(/\\* </${tag}> \\*/)`);
  if (!re.test(src)) throw new Error(`印 <${tag}> が見つかりません`);
  return src.replace(re, `$1\n${body}\n  $2`);
};

const appPath = path.join(ROOT, 'app.js');
const htmlPath = path.join(ROOT, 'index.html');
let app = fs.readFileSync(appPath, 'utf8');
let html = fs.readFileSync(htmlPath, 'utf8');

if (CHECK_ONLY) {
  const okApp = app.includes(`const IMG_LOGO = '${LOGO}'`) && app.includes(`const IMG_ICON = '${ICON}'`);
  const okHtml = html.includes(LOGO) && html.includes(FAVI);
  const usesFile = /(?:src|href)="icons\//.test(app);
  console.log(`app.js　　　：${okApp ? '埋め込み済み' : '★書き換えが必要'}`);
  console.log(`index.html　：${okHtml ? '埋め込み済み' : '★書き換えが必要'}`);
  console.log(`app.js が画像ファイルを読みに行く箇所：${usesFile ? '★あり' : 'なし'}`);
  process.exit(okApp && okHtml && !usesFile ? 0 : 1);
}

app = between(app, 'embed-icons', `  const IMG_LOGO = '${LOGO}';\n  const IMG_ICON = '${ICON}';`);
fs.writeFileSync(appPath, app);

html = html
  .replace(/<link rel="icon" href="[^"]*" sizes="32x32">/, `<link rel="icon" href="${FAVI}" sizes="32x32">`)
  .replace(/(<img )src="[^"]*"( alt="[^"]*" class="splash__logo">)/, `$1src="${LOGO}"$2`);
fs.writeFileSync(htmlPath, html);

const kb = (s) => `${Math.round(s.length / 1024)}KB`;
console.log('埋め込みました：');
console.log(`　・大きいロゴ（起動画面・見出し）　${kb(LOGO)}`);
console.log(`　・小さいアイコン（画面上部）　　　${kb(ICON)}`);
console.log(`　・タブのアイコン　　　　　　　　　${kb(FAVI)}`);
console.log('※ これ以降、手元の icons/ を消しても画面の見た目は変わりません。');
