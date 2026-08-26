/**
 * 世桜アプリ｜総括表取り込みの通し実行 — Googleに接続せずに確かめる
 *
 *   node 総括表取り込み_通し実行.mjs
 *
 * 偽の売上台帳は、本物（和牛世桜 広島店 202608）の配置を写している：
 *   見出しが2行（7〜8行目）に分かれ、「日付」「現金売上」…が上段、「客数」が下段にある。
 *
 * 確かめること
 *   ① 下見は1行も書き込まない
 *   ② 新規の日が入る（date/sales/guests が台帳どおり・src='drive'）
 *   ③ もう一度実行しても増えない（変わらず）
 *   ④ 台帳の値が直された日だけ追記される（最新が正＝上書き扱い）
 *   ⑤ 売上0かつ客数0の日・未来日は入れない
 *   ⑥ 8/5の一括取り込みと同じ値が既にある日は、二重に入らない
 *   ⑦ 見出しが見つからないブックは、その店だけエラーとして報告し、他の店は続ける
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ここ = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(ここ, f), 'utf8');
const コード = rd('Code.gs') + '\n' + rd('総括表取り込み.gs');

let 通過 = 0; const 失敗 = [];
function 確認(名前, 条件, 詳細) {
  if (条件) { 通過++; console.log(`  PASS  ${名前}`); }
  else { 失敗.push({ 名前, 詳細 }); console.log(`  FAIL  ${名前}${詳細 !== undefined ? `  → ${JSON.stringify(詳細)}` : ''}`); }
}

/* ===== 偽の売上台帳（本物の配置を写す） ===== */
function 台帳シート(rows) {
  // rows = [[day, 現金, カード, 小計, 客数], ...]
  const data = [];
  for (let i = 0; i < 4; i++) data.push([]);
  data.push(['', '売上台帳｜', '', '2026年', '8月度']);                       // 5行目
  data.push([]);
  data.push(['日別シートへ', '日付', '曜日', '現金売上', 'カード売上', '小計', '純売上（税抜）', '値引き', '合計', '累計', '昼のみ売上', '当日分析']); // 7行目（上段見出し）
  data.push(['', '', '', '', '', '', '', '', '', '', '', '客数', '', '', '回転数']); // 8行目（下段見出し）
  rows.forEach(r => {
    const line = ['ð', r[0], '土', r[1], r[2], r[3], 0, 0, 0, 0, '', r[4]];
    data.push(line);
  });
  return data;
}

function 偽環境を作る({ ブック群 = {}, フォルダ群 = {}, 既存行 = [] } = {}) {
  class 偽シート {
    constructor(名前, data) { this.名前 = 名前; this.data = data || []; }
    getName() { return this.名前; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 1); }
    appendRow(row) { this.data.push(row.slice()); }
    getRange(row, col, nR = 1, nC = 1) {
      const sh = this;
      return { getValues() {
        const out = [];
        for (let r = 0; r < nR; r++) { const 元 = sh.data[row - 1 + r] || []; const 行 = [];
          for (let c = 0; c < nC; c++) 行.push(元[col - 1 + c] === undefined ? '' : 元[col - 1 + c]);
          out.push(行); }
        return out;
      }, setValues(vals) { vals.forEach((行, r) => { const y = row - 1 + r; while (sh.data.length <= y) sh.data.push([]); 行.forEach((v, c) => { sh.data[y][col - 1 + c] = v; }); }); } };
    }
  }
  const reports = new 偽シート('reports', [['id','ts','kind','store','item','level','note','photos'], ...既存行]);
  const アプリSS = { getName: () => 'アプリ', getId: () => 'APP', getSheetByName: (n) => n === 'reports' ? reports : null, insertSheet: (n) => reports };
  const プロパティ = new Map([['SOUKATSU_SOURCES', JSON.stringify(Object.keys(フォルダ群).map(store => ({ store, folder: 'F_' + store })))]]);
  let uuid = 0;
  const ctx = {
    Logger: { log: () => {} }, console, JSON, Date, Object, String, Number, Array, Math, Error, RegExp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (プロパティ.has(k) ? プロパティ.get(k) : null), setProperty: (k, v) => プロパティ.set(k, String(v)) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => アプリSS,
      openById: (id) => { const b = ブック群[id]; if (!b) throw new Error('開けません: ' + id);
        return { getName: () => id, getSheets: () => b.map(s => new 偽シート(s.name, s.data)) }; } },
    DriveApp: { getFolderById: (fid) => ({ getFiles: () => { const files = (フォルダ群[fid.replace(/^F_/, '')] || []);
        let i = 0; return { hasNext: () => i < files.length, next: () => { const f = files[i++]; return { getId: () => f.id, getName: () => f.name }; } }; } }) },
    Utilities: { getUuid: () => `uuid-${++uuid}`,
      formatDate: (d, tz, fmt) => { const p = n => ('0' + n).slice(-2);
        if (fmt === 'yyyyMM') return `${d.getFullYear()}${p(d.getMonth() + 1)}`;
        if (fmt === 'yyyy-MM-dd') return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        return String(d); } },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'x' }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }) }
  };
  vm.createContext(ctx);
  vm.runInContext(コード, ctx, { filename: 'Code+取り込み.gs' });
  return { ctx, reports };
}
const 実行 = (env, 式) => vm.runInContext(式, env.ctx);
const 行数 = (env) => env.reports.data.length - 1;
const 取り込まれた = (env) => env.reports.data.slice(1).map(r => ({ store: r[3], ...JSON.parse(r[6]) }));

/* いま（実行時点）の月＝202608 を前提にした偽データ。月が替わっても動くよう ym は動的に作る */
const now = new Date();
const p2 = n => ('0' + n).slice(-2);
const YM = `${now.getFullYear()}${p2(now.getMonth() + 1)}`;
const D = (day) => `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(day)}`;
const 今日の日 = now.getDate();
const 昨日 = Math.max(1, 今日の日 - 1);
const 一昨日 = Math.max(1, 今日の日 - 2);

console.log('\n===== 総括表取り込み =====\n');
{
  const ブック群 = {
    BK1: [ { name: '集計', data: [['x']] },
           { name: '売上台帳', data: 台帳シート([
             [1, 33100, 22900, '56,000', 9],
             [一昨日, 10000, 5000, '15,000', 3],
             [昨日, 0, 0, 0, 0],                 // 売上0かつ客数0＝入れない
             [Math.min(31, 今日の日 + 1), 99999, 0, '99,999', 9] // 未来日＝入れない（月末の日は今日+1が32になるためminで丸め）
           ]) } ]
  };
  const フォルダ群 = { '和牛世桜 広島店': [{ id: 'BK1', name: `総括表Ver.2.6_和牛世桜_広島店（${YM}）` }] };
  // 8/5の一括取り込みで day1 は既に入っている（同じ値）
  const 既存行 = [['old1', 1000, 'soukatsu', '和牛世桜 広島店', '', '', JSON.stringify({ date: D(1), sales: 56000, guests: 9, src: 'sou0805' }), '[]']];

  const env = 偽環境を作る({ ブック群, フォルダ群, 既存行 });

  const 下見 = 実行(env, '総括表取り込み_下見()');
  確認('① 下見は1行も書き込まない', 行数(env) === 1, 行数(env));
  確認('下見でも件数は分かる', 下見.新規 === 1 && 下見.変わらず === 1, 下見);

  const r1 = 実行(env, '総括表を取り込む()');
  確認('② 新規の日が入る', 行数(env) === 2, 行数(env));
  const rows = 取り込まれた(env);
  const 新 = rows.find(r => r.src === 'drive');
  確認('date/sales/guests が台帳どおり', 新 && 新.date === D(一昨日) && 新.sales === 15000 && 新.guests === 3, 新);
  確認('⑥ 8/5取り込みと同じ値の日は二重に入らない', r1.変わらず === 1 && rows.filter(r => r.date === D(1)).length === 1, r1);
  確認('⑤ 売上0かつ客数0の日は入らない', !rows.some(r => r.date === D(昨日) && r.sales === 0), rows.map(r=>r.date));
  if (今日の日 < 31) 確認('⑤ 未来日は入らない', !rows.some(r => r.sales === 99999), rows.map(r=>r.date));

  const r2 = 実行(env, '総括表を取り込む()');
  確認('③ もう一度実行しても増えない', 行数(env) === 2 && r2.新規 === 0 && r2.変わらず === 2, r2);

  // ④ 台帳の値が直された（一昨日の売上が訂正された）
  env.ctx.SpreadsheetApp.openById = (id) => ({ getName: () => id, getSheets: () => [
    { name: '売上台帳', data: 台帳シート([[1, 33100, 22900, '56,000', 9], [一昨日, 10000, 8000, '18,000', 4]]) }
  ].map(s => s) .map(s => ({ getName: () => s.name, getLastRow: () => s.data.length, getLastColumn: () => s.data.reduce((m, r) => Math.max(m, r.length), 1),
      getRange: (row, col, nR = 1, nC = 1) => ({ getValues() { const out = []; for (let r = 0; r < nR; r++) { const 元 = s.data[row - 1 + r] || []; const 行 = []; for (let c = 0; c < nC; c++) 行.push(元[col - 1 + c] === undefined ? '' : 元[col - 1 + c]); out.push(行); } return out; } }) })) });
  const r3 = 実行(env, '総括表を取り込む()');
  確認('④ 直された日だけ追記される（上書き扱い）', r3.更新 === 1 && r3.新規 === 0, r3);
  const 最新 = 取り込まれた(env).filter(r => r.date === D(一昨日)).pop();
  確認('追記された行が新しい値', 最新 && 最新.sales === 18000 && 最新.guests === 4, 最新);
}

console.log('\n===== ⑧ 日付セルが「日付型」でも読める（実機で全店0件になった不具合の再発防止） =====\n');
{
  /* ★2026-08-26 実機で発生＝日付列のセルが Date オブジェクトで返り、Number(Date) が巨大な数になって
     全行スキップ→「エラーゼロなのに全店0件」。数字と日付型の両方を受けることを固定する。 */
  const 日付型 = (day) => ({ getDate: () => day });   // GASのDateと同じく getDate() を持つ
  const data = 台帳シート([[日付型(1), 100, 200, '300', 5], [日付型(2), 0, 0, 0, 0]]);
  const ブック群 = { BKD: [{ name: '売上台帳', data }] };
  const フォルダ群 = { '和牛世桜 広島店': [{ id: 'BKD', name: `総括表Ver.2.6_和牛世桜_広島店（${YM}）` }] };
  const env = 偽環境を作る({ ブック群, フォルダ群 });
  const r = 実行(env, '総括表を取り込む()');
  確認('★日付型のセルでも日が取れる', r.新規 === 1, r);
  const row = 取り込まれた(env)[0];
  確認('日付・売上・客数が正しい', row && row.date === D(1) && row.sales === 300 && row.guests === 5, row);
  確認('日付型でも0円0名は入れない', !取り込まれた(env).some(x => x.date === D(2)), 取り込まれた(env).map(x=>x.date));
}

console.log('\n===== ⑦ 一部の店が壊れていても、他の店は続ける =====\n');
{
  const ブック群 = {
    OK: [{ name: '売上台帳', data: 台帳シート([[1, 100, 0, '100', 1]]) }],
    NG: [{ name: 'へんなシート', data: [['見出しがない']] }]
  };
  const フォルダ群 = {
    '寿司世桜 心斎橋店': [{ id: 'OK', name: `総括表Ver.2.6_寿司世桜_心斎橋店（${YM}）` }],
    '和牛世桜 広島店': [{ id: 'NG', name: `総括表Ver.2.6_和牛世桜_広島店（${YM}）` }]
  };
  const env = 偽環境を作る({ ブック群, フォルダ群 });
  const r = 実行(env, '総括表を取り込む()');
  確認('壊れた店はエラーとして名前が出る', r.エラー.length === 1 && r.エラー[0].店舗 === '和牛世桜 広島店', r.エラー);
  確認('他の店は取り込まれる', r.新規 === 1 && 行数(env) === 1, r);
}

console.log('\n===== ⑨ 全期間の遡り取り込み（リリース前の過去分＝比較素材） =====\n');
{
  /* 毎時の取り込みは今月＋前月しか見ない。過去月のブックは「全期間」だけが拾うこと、
     全期間でも同値スキップが効いて二重に入らないことを固定する。 */
  const ブック群 = {
    B04: [{ name: '売上台帳', data: 台帳シート([[1, 100, 0, '100', 2], [15, 200, 100, '300', 4]]) }],
    B05: [{ name: '売上台帳', data: 台帳シート([[3, 500, 0, '500', 5]]) }],
    BNOW: [{ name: '売上台帳', data: 台帳シート([[1, 900, 0, '900', 9]]) }]
  };
  const フォルダ群 = { '寿司世桜 心斎橋店': [
    { id: 'B04', name: '総括表Ver.2.6_寿司世桜_心斎橋店（202604）' },
    { id: 'B05', name: '総括表Ver.2.6_寿司世桜_心斎橋店(202605)' },   // 半角括弧でも拾える
    { id: 'BNOW', name: `総括表Ver.2.6_寿司世桜_心斎橋店（${YM}）` }
  ] };
  const env = 偽環境を作る({ ブック群, フォルダ群 });

  const 通常 = 実行(env, '総括表を取り込む()');
  確認('毎時の取り込みは過去月のブックを見ない', 通常.新規 === 1 && 行数(env) === 1, 通常);

  const 下見 = 実行(env, '総括表取り込み_全期間_下見()');
  確認('全期間の下見は書き込まない', 行数(env) === 1, 行数(env));
  確認('全期間の下見で過去月ぶんが見える（半角括弧の月も）', 下見.新規 === 3 && 下見.変わらず === 1, 下見);

  const r = 実行(env, '総括表_全期間を取り込む()');
  確認('過去月の日が入る', r.新規 === 3 && 行数(env) === 4, r);
  const rows = 取り込まれた(env);
  確認('過去月の日付が正しい', rows.some(x => x.date === '2026-04-15' && x.sales === 300 && x.guests === 4)
    && rows.some(x => x.date === '2026-05-03' && x.sales === 500), rows.map(x => x.date));

  const r2 = 実行(env, '総括表_全期間を取り込む()');
  確認('もう一度実行しても二重に入らない', r2.新規 === 0 && r2.変わらず === 4 && 行数(env) === 4, r2);
}

console.log(`\n----- ${通過} 項目 PASS ／ ${失敗.length} 項目 FAIL -----`);
if (失敗.length) { 失敗.forEach(f => console.log(`  - ${f.名前}  → ${JSON.stringify(f.詳細)}`)); process.exit(1); }
console.log('★すべて通過。読むだけ・二重に入れない・訂正は上書き扱い、が機械検査で固定された。');
