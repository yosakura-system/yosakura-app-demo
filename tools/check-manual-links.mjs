/* 本部マニュアルのリンク健全性チェック
   ─────────────────────────────────────────────────────────────
   何をするか＝app.js に登録した本部マニュアル（全115件）のURLを、
   ログインしていない状態で1件ずつ叩いて、いまどうなっているかを見る。

   ★これは「マニュアル更新（最新化）／月次」と「マニュアル内容確認／3か月ごと」を
     人が目で追わずに済ませるためのもの。

   判定の意味
     消えている(404)  … ★本当のリンク切れ。資料が削除・移動された＝要対応
     ログインが要る    … 正常。本部の資料として妥当な状態
     誰でも開ける(200) … ⚠️ サインインなしで本文が読める＝公開範囲の確認が要る

   使い方
     node tools/check-manual-links.mjs            … 結果を画面に出す
     node tools/check-manual-links.mjs --md out.md … 一覧をMarkdownで書き出す
   ───────────────────────────────────────────────────────────── */
import fs from 'fs';

const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const seed = (src.match(/function seedMaterials\(\)[\s\S]*?\n {2}\}/) || [''])[0];

const rows = seed.split('\n').map(l => {
  const t = l.match(/title:'([^']*)'/), m = l.match(/mcat:'([a-z]+)'/);
  const u = l.match(/url:'([^']*)'/),   i = l.match(/id:'(mn\d+)'/);
  return (t && m && u && i) ? { id:i[1], title:t[1], mcat:m[1], url:u[1] } : null;
}).filter(Boolean);

if (!rows.length) { console.error('資料が1件も取れませんでした。app.js の seedMaterials を確認してください。'); process.exit(1); }

/* 分類IDを本部の目次の名前に戻す（画面と同じ言い方で出す） */
const cat = (src.match(/const MANUAL_CATALOG = \[[\s\S]*?\n {2}\];/) || [''])[0];
const NAME = {};
for (const m of cat.matchAll(/gid:'([a-z]+)'[^}]*?t:\{ja:'([^']*)'/g)) NAME[m[1]] = m[2];

/* 判定 ─ リダイレクトは追わない。Googleは未ログインだとログイン画面へ飛ばすため、
   そこを追いかけると全部200に見えてしまう。 */
async function probe(url) {
  try {
    const r = await fetch(url, { method:'GET', redirect:'manual' });
    const loc = r.headers.get('location') || '';
    if (r.status === 404) return { code:r.status, verdict:'消えている' };
    if (r.status === 401 || r.status === 403) return { code:r.status, verdict:'ログインが要る' };
    if (r.status >= 300 && r.status < 400) {
      return /accounts\.google\.com|ServiceLogin/.test(loc)
        ? { code:r.status, verdict:'ログインが要る' }
        : { code:r.status, verdict:'転送されている', note:loc.slice(0, 80) };
    }
    if (r.status === 200) return { code:r.status, verdict:'誰でも開ける' };
    return { code:r.status, verdict:'不明' };
  } catch (e) {
    return { code:0, verdict:'つながらない', note:String(e.message).slice(0, 60) };
  }
}

const LIMIT = 8;                       // 同時に叩く数（相手に負担をかけない）
const out = [];
for (let i = 0; i < rows.length; i += LIMIT) {
  const chunk = rows.slice(i, i + LIMIT);
  const got = await Promise.all(chunk.map(async r => ({ ...r, ...(await probe(r.url)) })));
  out.push(...got);
  process.stderr.write(`\r確認中 ${out.length}/${rows.length}`);
}
process.stderr.write('\n');

const order = ['消えている','つながらない','転送されている','不明','誰でも開ける','ログインが要る'];
const by = v => out.filter(r => r.verdict === v);

console.log('\n本部マニュアルのリンク健全性チェック');
console.log('確認日 ' + new Date().toISOString().slice(0, 10) + ' ／ 対象 ' + out.length + ' 件（ログインしていない状態で確認）\n');
for (const v of order) {
  const n = by(v).length;
  if (n) console.log(`  ${v.padEnd(8, '　')} ${String(n).padStart(3)} 件`);
}

const bad = [...by('消えている'), ...by('つながらない'), ...by('不明')];
if (bad.length) {
  console.log('\n★ 要対応（資料が開けない）');
  for (const r of bad) console.log(`  [${NAME[r.mcat] || r.mcat}] ${r.title}  → ${r.verdict}（${r.code}）`);
} else {
  console.log('\n★ 開けない資料はありません');
}

const open = by('誰でも開ける');
if (open.length) {
  console.log('\n⚠️ サインインなしで開ける（公開範囲の確認が要る）');
  for (const r of open) console.log(`  [${NAME[r.mcat] || r.mcat}] ${r.title}`);
}

const mdArg = process.argv.indexOf('--md');
if (mdArg > -1 && process.argv[mdArg + 1]) {
  const f = process.argv[mdArg + 1];
  const esc = s => String(s).replace(/\|/g, '\\|');
  const lines = [
    '# 本部マニュアル リンク確認',
    '',
    `確認日：${new Date().toISOString().slice(0, 10)} ／ 対象 ${out.length} 件`,
    '',
    'ログインしていない状態で1件ずつ開いて確認しています。',
    '「ログインが要る」は正常な状態です。',
    '',
    '| 分類 | 資料 | 状態 |',
    '|---|---|---|',
    ...order.flatMap(v => by(v).map(r => `| ${esc(NAME[r.mcat] || r.mcat)} | ${esc(r.title)} | ${v} |`))
  ];
  fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8');
  console.log(`\n一覧を書き出しました：${f}`);
}

process.exit(bad.length ? 1 : 0);
