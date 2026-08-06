/* ===================================================================
   sync-preview.mjs — デモ(このリポジトリ) → 本部プレビュー への同期ツール
   -------------------------------------------------------------------
   本部が見るのは「プレビュー環境」= https://yosakura-system.github.io/yosakura-app-preview/
   （別リポジトリ yosakura-app-preview・専用バックエンド接続）。
   デモ(yosakura-app-demo)を"源泉"として、プレビューはデモに【3点だけ】差し替えたコピー：
     1) app.js の API_URL_DEFAULT = 専用バックエンドURL（yosakura.system）
     2) app.js のアプリカードのバッジ = 非live/非soonに「運用中/In use」を表示
     3) sw.js の CACHE 名 = 'yosakura-hq-vN'（デモは 'yosakura-demo-vN'）。実行のたび N を+1
   styles.css / index.html はデモとプレビューで同一。

   使い方（demoのfeatureブランチで実装・commit・push した後に）：
     1) gh auth switch --user yosakura-system   ← push権限
     2) node tools/sync-preview.mjs             ← プレビューへ同期＋push（SWキャッシュを+1）
   ※ 公開デモ(yosakura-app-demo)の main は無傷を維持。開発は feature ブランチに積む。
=================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // = リポジトリ直下
const WORK = path.join(os.tmpdir(), 'yosakura-app-preview-sync');
const PREVIEW_REPO = 'https://github.com/yosakura-system/yosakura-app-preview.git';
const PV_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxfBr3H4toq5AdeQ5zb-5DcmcYpjaRybGC5EAyfHIVYzVE3-bCBGq2bgIbgpls3Kq7_/exec'; // 世桜専用（yosakura.system）

const LF = (s) => s.replace(/\r\n/g, '\n');
const rd = (p) => LF(fs.readFileSync(p, 'utf8'));
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe' }).toString();

// 1) プレビューを毎回まっさらに clone（現状 main を取得）
fs.rmSync(WORK, { recursive: true, force: true });
sh(`git clone --depth 1 ${PREVIEW_REPO} "${WORK}"`);

// 2) app.js：デモ本体に「専用URL」「運用中バッジ」の2点だけ差し替え
let app = rd(path.join(DEMO, 'app.js'));
const demoUrlLine = `  const API_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbzS-tvfTQwJjgYn2ASHWidU-qBWZzF85bqt25T4mAXcM-P6-75zFqzUSlgiPFDTe7KQRQ/exec';`;
const pvUrlLine = `  const API_URL_DEFAULT = '${PV_BACKEND_URL}'; // 世桜専用（yosakura.system）`;
if (!app.includes(demoUrlLine)) throw new Error('demo API_URL_DEFAULT 行が見つかりません（app.js の該当行を確認）');
app = app.replace(demoUrlLine, pvUrlLine);

const demoBadge = `: (a.live ? '<span class="live">● LIVE</span>' : '')}`;
const pvBadge = ": (a.live ? '<span class=\"live\">● LIVE</span>' : `<span class=\"live\" style=\"background:#4e7d5a\">${L({ja:'運用中',en:'In use',vi:'Đang dùng'})}</span>`)}";
if (!app.includes(demoBadge)) throw new Error('demo バッジ行が見つかりません（app.js の該当行を確認）');
app = app.replace(demoBadge, pvBadge);
const newStyles = rd(path.join(DEMO, 'styles.css'));

// 次の版番号（この番号を app.js にも焼き込み、画面下に「いま動いている版」として出す）
const prevSw = rd(path.join(WORK, 'sw.js'));
const pm = prevSw.match(/const CACHE = 'yosakura-hq-v(\d+)';/);
if (!pm) throw new Error('プレビュー sw.js の CACHE 行が見つかりません');
const next = Number(pm[1]) + 1;

// 3) app.js：いま動いている版を焼き込む
//    ※ これが無いと、端末が古い app.js のままでも画面には最新の番号が出てしまい、
//      「更新が届いていない」ことに誰も気づけない（2026-08-07 実際に起きた）
const demoBuildLine = `  const APP_BUILD = 'dev';`;
if (!app.includes(demoBuildLine)) throw new Error('demo APP_BUILD 行が見つかりません（app.js の該当行を確認）');
const stamp = (s, tag) => s.replace(/ {2}const APP_BUILD = '[^']*';/, `  const APP_BUILD = '${tag}';`);

// 実質変更（改行コード差・版の焼き込みは無視）が無ければ、SWキャッシュの無駄な+1を避けて終了
const bare = (s) => stamp(s, 'dev');
const same = bare(rd(path.join(WORK, 'app.js'))) === bare(app) && rd(path.join(WORK, 'styles.css')) === newStyles;
if (same) { console.log('変更なし（プレビューは最新）'); fs.rmSync(WORK, { recursive: true, force: true }); process.exit(0); }
fs.writeFileSync(path.join(WORK, 'app.js'), stamp(app, `yosakura-hq-v${next}`), 'utf8');
fs.writeFileSync(path.join(WORK, 'styles.css'), newStyles, 'utf8');

// 4) sw.js：デモ本体をコピーし、CACHE 名をプレビュー用に置換＋バージョン+1（更新配信のため必須）
let sw = rd(path.join(DEMO, 'sw.js'));
const dm = sw.match(/const CACHE = '[^']+';/);
if (!dm) throw new Error('デモ sw.js の CACHE 行が見つかりません');
sw = sw.replace(dm[0], `const CACHE = 'yosakura-hq-v${next}';`);
fs.writeFileSync(path.join(WORK, 'sw.js'), sw, 'utf8');

// 5) commit & push
const msg = process.argv.slice(2).join(' ') || 'デモから同期（プレビュー反映）';
sh('git add app.js styles.css sw.js', WORK);
sh(`git -c user.name="yosakura-system" -c user.email="yosakura.system@gmail.com" commit -m "${msg}\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`, WORK);
sh('git push origin HEAD', WORK);
console.log(`OK: プレビューへ同期・push 完了（SWキャッシュ → yosakura-hq-v${next}）`);
console.log('本部は https://yosakura-system.github.io/yosakura-app-preview/ をハードリロードで最新化');
