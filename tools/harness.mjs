// Minimal DOM shim harness to render the 世桜app views without a browser.
import fs from 'node:fs';
import vm from 'node:vm';

const APP = 'C:/Users/Watar/OneDrive/ドキュメント/Claude Code/世桜/09_世桜アプリ_デモ/app.js';
const code = fs.readFileSync(APP, 'utf8');

let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; } else { FAIL++; console.log('  ✗ ' + m); } };

// ---- element factory ----
function makeEl(tag = 'div') {
  const listeners = {};
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _html: '', textContent: '', value: '', checked: false,
    dataset: {}, style: {}, children: [],
    classList: { _s: new Set(),
      add(...c){ c.forEach(x=>this._s.add(x)); }, remove(...c){ c.forEach(x=>this._s.delete(x)); },
      toggle(c){ this._s.has(c)?this._s.delete(c):this._s.add(c); }, contains(c){ return this._s.has(c); } },
    get innerHTML(){ return this._html; }, set innerHTML(v){ this._html = String(v); },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    appendChild(c){ this.children.push(c); return c; }, removeChild(){}, remove(){},
    insertAdjacentHTML(){}, append(){}, prepend(){},
    addEventListener(t,h){ (listeners[t]=listeners[t]||[]).push(h); }, removeEventListener(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; },
    getContext(){ return { fillRect(){}, drawImage(){}, getImageData(){ return { data:[] }; }, putImageData(){}, fillText(){}, beginPath(){}, arc(){}, fill(){} }; },
    toDataURL(){ return 'data:,'; },
    focus(){}, click(){}, scrollIntoView(){},
    get firstElementChild(){ return makeEl('div'); },
    onclick:null, oninput:null, onchange:null
  };
  return el;
}

const registry = {};
const doc = {
  _byId(id){ return registry[id] || (registry[id] = makeEl('div')); },
  getElementById(id){ return this._byId(id); },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(tag){ return makeEl(tag); },
  createElementNS(){ return makeEl('svg'); },
  addEventListener(){}, removeEventListener(){},
  documentElement: makeEl('html'),
  body: makeEl('body'),
  head: makeEl('head'),
};

// localStorage
const store = new Map();
const localStorage = {
  getItem(k){ return store.has(k) ? store.get(k) : null; },
  setItem(k,v){ store.set(k, String(v)); },
  removeItem(k){ store.delete(k); },
  clear(){ store.clear(); }
};

const winHandlers = {};
let hashVal = '';
const location = { get hash(){ return hashVal; }, set hash(v){ hashVal = v; (winHandlers['hashchange']||[]).forEach(h=>h()); } };

// fetch: return seeded rows so distribute() populates local keys
let FETCH_ROWS = { ok:false };
const fetch = () => Promise.resolve({ json: () => Promise.resolve(FETCH_ROWS), text: () => Promise.resolve('') });

const navigator = { userAgent:'node', language:'ja' };
const windowObj = {
  addEventListener(t,h){ (winHandlers[t]=winHandlers[t]||[]).push(h); }, removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, addListener(){}, removeListener(){} }; },
  scrollTo(){}, requestAnimationFrame(cb){ return setTimeout(cb,0); }, cancelAnimationFrame(){},
  navigator, location, localStorage, fetch,
  setTimeout, clearTimeout, console,
};

const sandbox = {
  window: windowObj, document: doc, localStorage, navigator, location, fetch,
  console, setTimeout, clearTimeout, URLSearchParams, JSON, Math, Date, Object, Array, String, Number, Boolean,
  parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, RegExp, Promise, Set, Map, Blob: function(){},
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;

function run(setup){
  store.clear(); registry.app = makeEl('div'); Object.keys(registry).forEach(k=>{ if(k!=='app') delete registry[k]; });
  Object.keys(winHandlers).forEach(k=>delete winHandlers[k]);
  hashVal = '';
  setup();
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename:'app.js' });
  return registry.app;
}

const setLS = (role, storeSel, lang) => {
  localStorage.setItem('yosakura_demo_role', role);
  localStorage.setItem('yosakura_demo_store', storeSel);
  localStorage.setItem('yosakura_demo_lang', lang);
  localStorage.setItem('yosakura_tour_done', '1'); // suppress tour
  localStorage.setItem('yosakura_setup_done', '1'); // 初回の「はじめの設定」は出さない
};

// Render a given app view by role/store/lang, return innerHTML
function renderView(appId, role, storeSel, lang){
  let app;
  try {
    app = run(() => { setLS(role, storeSel, lang); });
    location.hash = '#/app/' + appId;   // triggers render()
  } catch (e) {
    FAIL++; console.log('  ✗ THREW ['+appId+'/'+role+'/'+lang+']: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,3).join('\n'));
    return '';
  }
  return app.innerHTML;
}

const S_HIROSHIMA = '和牛世桜 広島店';
console.log('== 緊急連絡先 (emergency) ==');
for (const lang of ['ja','en','vi']) {
  const staff = renderView('emergency','staff',S_HIROSHIMA,lang);
  ok(staff.length>200, `staff/${lang} rendered`);
  ok(!/emg_phone/.test(staff), `staff/${lang} is read-only (no edit inputs)`);
  const mgr = renderView('emergency','manager',S_HIROSHIMA,lang);
  ok(/emg_phone/.test(mgr) && /emgSave/.test(mgr), `manager/${lang} shows edit form + save`);
}
const hqAll = renderView('emergency','hq','all','ja');
ok(/店舗別の登録状況/.test(hqAll), 'hq/all shows per-store overview');
const hqStore = renderView('emergency','hq',S_HIROSHIMA,'ja');
ok(/emgSave/.test(hqStore), 'hq drilled to store can edit');

console.log('== 公益通報 (whistle) ==');
for (const lang of ['ja','en','vi']) {
  const staff = renderView('whistle','staff',S_HIROSHIMA,lang);
  ok(/whSubmit/.test(staff) && /data-seg="whcat"/.test(staff), `staff/${lang} shows report form`);
  ok(/wh_anon/.test(staff), `staff/${lang} has anonymous option`);
}
const hqW = renderView('whistle','hq','all','ja');
ok(/受け付けた通報/.test(hqW), 'hq sees received-reports list');

console.log('== sync distribute() で emg / whistle が復元される ==');
{
  const now = Date.now();
  FETCH_ROWS = { ok:true, reports:[
    { kind:'emg', store:S_HIROSHIMA, note: JSON.stringify({ slots:{ hospital:{vendor:'市民病院',phone:'082-000-0000',memo:'徒歩5分'} } }), t: now, id:'e1' },
    { kind:'whistle', store:'寿司世桜 心斎橋店', note: JSON.stringify({ cat:'hygiene', body:'冷蔵庫の温度管理が不十分', anon:true }), t: now, id:'w1' },
  ]};
  let app;
  try { app = run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ load threw: '+e.message); }
  // syncReports(true) runs on load; wait a microtask tick for the fetch promise chain
}
// distribute is async (fetch promise). Give it a tick then assert.
await new Promise(r=>setTimeout(r, 50));
{
  const emg = JSON.parse(localStorage.getItem('yosakura_demo_emg')||'{}');
  ok(emg[S_HIROSHIMA] && emg[S_HIROSHIMA].slots.hospital.phone==='082-000-0000', 'emg row distributed to local store map');
  const wh = JSON.parse(localStorage.getItem('yosakura_demo_whistle')||'[]');
  ok(wh.length===1 && wh[0].cat==='hygiene' && wh[0].anon===true, 'whistle row distributed to local list');
}
FETCH_ROWS = { ok:false };

console.log('== みんなの投稿 (community) ==');
{
  const staff = renderView('community','staff',S_HIROSHIMA,'ja');
  ok(/submitComm/.test(staff) && /data-seg="commcat"/.test(staff), 'staff sees post form');
  ok(!/data-commpub/.test(staff) && !/data-commhide/.test(staff), 'staff has no moderation buttons');
  const en = renderView('community','manager',S_HIROSHIMA,'en');
  ok(/Share a good story/.test(en), 'manager/en renders');
}
console.log('== community: distribute() で 投稿/公開状態/拍手 が復元される ==');
{
  const now = Date.now();
  const key = `${now}|寿司世桜 心斎橋店`;
  FETCH_ROWS = { ok:true, reports:[
    { kind:'community', store:'寿司世桜 心斎橋店', item:'guest', note: JSON.stringify({ body:'記念日のお祝いで喜ばれました', by:'スタッフ' }), t: now, id:'c1' },
    { kind:'commmod', store:'寿司世桜 心斎橋店', item:key, note: JSON.stringify({ state:'published' }), t: now+1, id:'m1' },
    { kind:'commlike', store:'寿司世桜 心斎橋店', item:key, t: now+2, id:'l1' },
    { kind:'commlike', store:'寿司世桜 心斎橋店', item:key, t: now+3, id:'l2' },
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ load threw: '+e.message); }
}
await new Promise(r=>setTimeout(r, 50));
{
  const comm = JSON.parse(localStorage.getItem('yosakura_demo_community')||'[]');
  ok(comm.length===1 && comm[0].body==='記念日のお祝いで喜ばれました', 'community post distributed to local list');
  const mod = JSON.parse(localStorage.getItem('yosakura_demo_commmod')||'{}');
  const k = Object.keys(mod)[0];
  ok(k && mod[k].state==='published', 'commmod published state distributed');
  const likes = JSON.parse(localStorage.getItem('yosakura_demo_commlike')||'{}');
  ok(Object.values(likes)[0]===2, 'commlike counted across devices (2)');
  location.hash = '#/app/community';
  const hq = registry.app.innerHTML;
  ok(/data-commhide/.test(hq), 'hq sees published post with take-down button');
}
FETCH_ROWS = { ok:false };

console.log('== 口コミQR は「その他」タブの導線から外れている（議事録12-4/23）==');
{
  let html = '';
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); location.hash = '#/home?tab=other'; html = registry.app.innerHTML; }
  catch(e){ FAIL++; console.log('  ✗ other-tab render threw: '+e.message); }
  ok(html.length > 100, 'その他タブが描画される');
  ok(!/口コミQR/.test(html), 'その他タブに口コミQRの導線が無い（hide）');
}

console.log('== 来店経路の記録は「報告」タブから外れている（議事録12-1・サーベイで回収）==');
{
  let html = '';
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); location.hash = '#/home?tab=genba'; html = registry.app.innerHTML; }
  catch(e){ FAIL++; console.log('  ✗ genba-tab render threw: '+e.message); }
  ok(html.length > 100, '報告タブが描画される');
  ok(!/来店経路の記録/.test(html), '報告タブに来店経路の記録カードが無い（hide）');
}

console.log('== サーベイ集計が見つかる（0件でも表示・報告タブに配置）==');
{
  const hq = renderView('survey','hq','all','ja'); // 回答0件（バックエンド既定でseed無し）
  ok(/サーベイ集計/.test(hq), 'hq/0件でも「サーベイ集計」の空状態が出る');
  const staff = renderView('survey','staff',S_HIROSHIMA,'ja');
  ok(!/サーベイ集計/.test(staff), 'スタッフには集計を出さない（入口のみ）');
  let tab = '';
  try { run(()=> setLS('hq','all','ja')); location.hash = '#/home?tab=genba'; tab = registry.app.innerHTML; }
  catch(e){ FAIL++; console.log('  ✗ genba-tab(hq) threw: '+e.message); }
  ok(/サーベイ・集計/.test(tab), '報告タブに「サーベイ・集計」が並ぶ');
}

console.log('== ホームに「みんなの投稿」カードが出る ==');
for (const role of ['staff','manager','hq']) {
  let html = '';
  try { run(()=> setLS(role, role==='hq'?'all':S_HIROSHIMA, 'ja')); location.hash = '#/home'; html = registry.app.innerHTML; }
  catch(e){ FAIL++; console.log(`  ✗ home/${role} threw: `+e.message); }
  ok(html.length > 500, `home/${role} rendered`);
  ok(/みんなの投稿/.test(html) && /data-open="community"/.test(html), `home/${role} has community card`);
  ok(/data-open="kyou"/.test(html) && /data-open="shukan"/.test(html) && /data-open="getsuji"/.test(html), `home/${role} に日次/週次/月次の窓口が出る`);
  ok(/id="pinEdit"/.test(html), `home/${role} によく使う追加ボタンが出る`);
  // 古い画面のまま動いていないか、誰でも自分で確かめて直せるように
  ok(/id="appUpdate"/.test(html), `home/${role} の画面下に「最新にする」が出る`);
  // 右上から、いつでも役割・店舗・お名前を変えられる
  ok(/id="roleBtn"/.test(html), `home/${role} の右上に役割・店舗の切替が出る`);
}
{
  const wk = renderView('shukan','staff',S_HIROSHIMA,'ja');
  ok(/今週出すもの/.test(wk), '週次業務ビュー（shukan）が描画される');
}

console.log('== 提出物マスタ基盤：週次/四半期の頻度・業態の出し分け ==');
{
  const M = [
    { id:'wpop',  name:{ja:'卓上POP交換_週',en:'W-POP',vi:'W'}, oblig:'required', freq:'weekly',    due:'23:59', target:'gyotai_in', gyotai:['gyukatsu'], hqReview:'none', detect:'none', linkApp:'' },
    { id:'compl', name:{ja:'コンプラチェック',  en:'Compl',vi:'C'}, oblig:'required', freq:'quarterly', due:'23:59', target:'all',                            hqReview:'each', detect:'none', linkApp:'' },
    { id:'mpop',  name:{ja:'卓上POP交換_月',en:'M-POP',vi:'M'}, oblig:'required', freq:'monthly',   due:'23:59', target:'gyotai_ex', gyotai:['gyukatsu'], hqReview:'none', detect:'none', linkApp:'' }
  ];
  const S_GYUKATSU = '牛カツ世桜 富士山店';
  const renderWith = (appId, role, storeSel) => {
    let html = '';
    try {
      run(() => { setLS(role, storeSel, 'ja'); localStorage.setItem('yosakura_sub_master_v2', JSON.stringify(M)); });
      location.hash = '#/app/' + appId; html = registry.app.innerHTML;
    } catch (e) { FAIL++; console.log(`  ✗ ${appId}/${role} threw: ` + e.message); }
    return html;
  };
  // 牛カツ店：週次POPは「今週(shukan)」に出る／今日(kyou)・四半期には出ない
  const gk_kyou = renderWith('kyou', 'manager', S_GYUKATSU);
  ok(!/卓上POP交換_週/.test(gk_kyou), '牛カツ/今日：週次POPは今日に出ない（週次へ）');
  ok(!/コンプラチェック/.test(gk_kyou), '牛カツ/今日：四半期は今日に出ない');
  const gk_shukan = renderWith('shukan', 'manager', S_GYUKATSU);
  ok(/卓上POP交換_週/.test(gk_shukan), '牛カツ/週次：週次POPが「今週出すもの」に出る');
  // 牛カツ店：月次=四半期が出る／牛カツ以外POP(mpop)は出ない
  const gk_get = renderWith('getsuji', 'manager', S_GYUKATSU);
  ok(/コンプラチェック/.test(gk_get), '牛カツ/月次：四半期コンプラが出る');
  ok(!/卓上POP交換_月/.test(gk_get), '牛カツ/月次：牛カツ以外POP(gyotai_ex)は出ない');
  // 和牛店（牛カツ以外）：今日に週次POP(gyukatsu)は出ない／月次に牛カツ以外POPが出る
  const wg_kyou = renderWith('kyou', 'manager', S_HIROSHIMA);
  ok(!/卓上POP交換_週/.test(wg_kyou), '和牛/今日：牛カツ限定の週次POPは出ない（gyotai_in）');
  const wg_get = renderWith('getsuji', 'manager', S_HIROSHIMA);
  ok(/卓上POP交換_月/.test(wg_get), '和牛/月次：牛カツ以外POPが出る（gyotai_ex）');
}

console.log('== サーベイ集計：来店国を表示（note JSON {c,f} を復元）==');
{
  const now = Date.now();
  FETCH_ROWS = { ok:true, reports:[
    { kind:'survey', store:'牛カツ世桜 長堀橋店', level:'5', item:'google',    note: JSON.stringify({ c:'Korea', f:'【問題なし】good' }), t: now,      id:'s1' },
    { kind:'survey', store:'牛カツ世桜 長堀橋店', level:'4', item:'instagram', note: JSON.stringify({ c:'Japan', f:'' }),                t: now-1000, id:'s2' },
    { kind:'survey', store:'牛カツ世桜 長堀橋店', level:'5', item:'google',    note: JSON.stringify({ c:'TEST_KOREA', f:'テスト', src:'imptest' }), t: now-2000, id:'s3' },
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ survey load threw: '+e.message); }
}
await new Promise(r=>setTimeout(r, 50));
{
  const sv = JSON.parse(localStorage.getItem('yosakura_demo_survey')||'[]');
  ok(sv.length===2 && sv.some(r=>r.country==='Korea') && sv.some(r=>r.country==='Japan'), 'survey country restored from note JSON');
  ok(!sv.some(r=>String(r.country).startsWith('TEST_')), 'TEST_ 接頭辞のサーベイ行は集計から除外');
  ok(sv.some(r=>String(r.note).includes('good')), 'survey feedback restored from note.f');
  location.hash = '#/app/survey';
  const hq = registry.app.innerHTML;
  ok(/来店国/.test(hq) && /Korea/.test(hq), 'hq survey agg shows 来店国 (Korea)');
}
FETCH_ROWS = { ok:false };

console.log('== 資料リンクの管理（materials）：本部専用・同期 ==');
{
  const hqForm = renderView('materials','hq','all','ja');
  ok(/matAdd/.test(hqForm) && /mat_url/.test(hqForm), 'hq に追加フォームが出る');
  const staffV = renderView('materials','staff',S_HIROSHIMA,'ja');
  ok(!/matAdd/.test(staffV), 'スタッフは資料リンク管理を開けない（本部専用）');
  // 同期：linkset（配列丸ごと）が distribute で復元される
  FETCH_ROWS = { ok:true, reports:[
    { kind:'linkset', store:'', note: JSON.stringify([
      { id:'a1', title:'世桜の理念', url:'https://docs.google.com/presentation/d/EXAMPLE/edit', mcat:'philosophy', desc:'' },
      { id:'a2', title:'スタッフの基本', url:'https://docs.google.com/document/d/EXAMPLE/edit', mcat:'sevendays', desc:'' },
    ]), t: Date.now(), id:'ls1' },
  ]};
  try { run(()=> setLS('hq', 'all', 'ja')); } catch(e){ FAIL++; console.log('  ✗ linkset load threw: '+e.message); }
}
await new Promise(r=>setTimeout(r, 50));
{
  const lk = JSON.parse(localStorage.getItem('yosakura_demo_links')||'[]');
  ok(lk.length===2 && lk.some(x=>x.title==='世桜の理念'), 'linkset distributed to local list');
  location.hash = '#/app/materials';
  const html = registry.app.innerHTML;
  ok(/data-openurl=/.test(html) && /matAdd/.test(html), '本部の管理画面に一覧と追加フォームが出る');
  ok(/data-matcat=/.test(html), '各資料に大項目プルダウンが出る');
}
FETCH_ROWS = { ok:false };

console.log('== マニュアル：対応資料をタップで開く（linksetと連携）==');
{
  FETCH_ROWS = { ok:true, reports:[
    { kind:'linkset', store:'', note: JSON.stringify([
      { id:'lk_w2', mcat:'philosophy', title:'世桜とは',     url:'https://docs.google.com/presentation/d/EX/edit',  desc:'スライド' },
      { id:'lk_s1', mcat:'sevendays',  title:'ハウスルール', url:'https://docs.google.com/spreadsheets/d/EX/edit', desc:'スプレッドシート' },
    ]), t: Date.now(), id:'ls2' },
  ]};
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ manual linkset load threw: '+e.message); }
}
await new Promise(r=>setTimeout(r, 50));
{
  location.hash = '#/app/manual';   // スタッフで表示
  const html = registry.app.innerHTML;
  ok(/data-openurl=/.test(html), 'マニュアルに資料のタップ開くリンクが出る');
  ok(/世桜とは/.test(html) && /ハウスルール/.test(html), '理念/7DAYSに対応資料が紐づく');
  ok(/\/preview/.test(html) && !/\/edit/.test(html), 'スタッフは読み取り専用(/preview)で開く（編集防止）');
}
console.log('== マニュアル：本部は編集リンクで開く ==');
{
  FETCH_ROWS = { ok:true, reports:[
    { kind:'linkset', store:'', note: JSON.stringify([
      { id:'lk_w2', mcat:'philosophy', title:'世桜とは', url:'https://docs.google.com/presentation/d/EX/edit', desc:'スライド' },
    ]), t: Date.now(), id:'ls3' },
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ manual hq load threw: '+e.message); }
}
await new Promise(r=>setTimeout(r, 50));
{
  location.hash = '#/app/manual';
  const html = registry.app.innerHTML;
  ok(/\/edit/.test(html), '本部は編集リンク(/edit)で開く');
}
FETCH_ROWS = { ok:false };

console.log('== 総括表：店舗比較グラフ（本部・全店）==');
{
  const S_NAGA = '牛カツ世桜 長堀橋店';
  const ym = new Date().toISOString().slice(0,7);
  const d = (n) => ym + '-' + String(n).padStart(2,'0');
  const sk = (store, day, sales, guests, extra) => ({ kind:'soukatsu', store, note: JSON.stringify(Object.assign({ date:d(day), sales, guests }, extra||{})), t: Date.now()-day*3600e3, id:'sk'+store+day });
  FETCH_ROWS = { ok:true, reports:[
    sk(S_HIROSHIMA, 1, 120000, 20), sk(S_HIROSHIMA, 2, 180000, 30), sk(S_HIROSHIMA, 3, 90000, 15),
    sk(S_NAGA, 1, 60000, 12), sk(S_NAGA, 2, 75000, 15,
      { net:50000, err:'0', mtd:135000, goal:3000000, foodct:'29', drinkct:'14', rvt:'2', rva:'70', hear:'9', disc:'0', food:'36.5', labor:'23.6', tipt:'21000', tipa:'84541', cancel:'31700', closer:'田中', note:'厨房の床を清掃', order:'豆乳6／お米' }),
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ compare load threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/soukatsu';
  const html = registry.app.innerHTML;
  ok(/店舗比較（総括表より）/.test(html), '本部の総括表に店舗比較カードが出る');
  ok(/class="colchart"/.test(html), '日別カラムチャートが描画される');
  ok(/class="spark"/.test(html), '店舗行にスパークライン（推移）が出る');
  ok(/data-storelink="和牛世桜 広島店"/.test(html), '店舗行が個店カルテへのタップ導線を持つ');
  ok(/data-skday=/.test(html), '棒・日報行から「その日の日報」を開ける');
  ok(/data-go="\/app\/soukatsu\?p=prev/.test(html) && /m=guests/.test(html), '期間（今月/先月/直近30日）と指標（売上/客数/客単価）の切替がある');
  ok(html.indexOf('cmp-rank">1<') < html.indexOf('cmp-rank">2<'), 'ランキング順に並ぶ');
  ok(/全店 売上合計/.test(html), '全店合計のKPIが出る（増田さんご要望①）');

  location.hash = '#/app/soukatsu?m=guests';
  ok(/class="chip on"[^>]*>客数</.test(registry.app.innerHTML), '指標を客数に切り替えられる');

  console.log('== 個店カルテ（#/store）==');
  location.hash = '#/store?s=' + encodeURIComponent(S_NAGA);
  const st = registry.app.innerHTML;
  ok(/長堀橋店/.test(st), '個店カルテが開く');
  ok(/曜日別の平均売上/.test(st), '曜日別の平均売上が出る');
  ok(/最新の日報（全項目）/.test(st) && /レジ締め担当/.test(st) && /田中/.test(st), '売上・客数以外の全項目（口コミ・原価率・締め担当等）が表示される');
  ok(/厨房の床を清掃/.test(st) && /豆乳6/.test(st), '特記事項・翌日発注も表示される');
  ok(/入力済みの項目/.test(st) && /18<\/b>/.test(st), '入力済み項目数（アップされた分だけ表示）が分かる');
  ok(/目標到達/.test(st), '月間目標への到達度が出る');
  ok(/この店舗の他のデータ/.test(st), 'サーベイ・原価率など他データも同じ画面に出る');
  ok(/dcell off/.test(st), '未入力の項目は「—」で分かる');

  console.log('== 個店カルテ：権限（自店以外は開けない）==');
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ store detail role threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent(S_NAGA);
  const mg = registry.app.innerHTML;
  ok(/広島店/.test(mg) && !/長堀橋店/.test(mg), '店長が他店を指定しても自店にフォールバックする');
  location.hash = '#/app/soukatsu';
  ok(/この店舗の詳細/.test(registry.app.innerHTML), '単店ロールには個店カルテへのボタンが出る');

  for (const lang of ['en','vi']) {
    try { run(()=> setLS('hq','all',lang)); } catch(e){ FAIL++; console.log('  ✗ compare '+lang+' threw: '+e.message); }
    await new Promise(r=>setTimeout(r, 50));
    location.hash = '#/app/soukatsu';
    ok(/class="colchart"/.test(registry.app.innerHTML), '['+lang+'] 比較グラフが多言語でも描画される');
    location.hash = '#/store?s=' + encodeURIComponent(S_HIROSHIMA);
    ok(registry.app.innerHTML.length > 500, '['+lang+'] 個店カルテが多言語でも描画される');
  }
}
FETCH_ROWS = { ok:false };

console.log('== 総括表の正規化（未来日付・二重提出・取消）==');
{
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  const future = ymd(new Date(Date.now() + 6 * 864e5));
  const yest = ymd(new Date(Date.now() - 864e5));
  const two = ymd(new Date(Date.now() - 2 * 864e5));
  const sk = (day, sales, guests, t, id) => ({ kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: day, sales, guests }), t, id });
  FETCH_ROWS = { ok:true, reports:[
    sk(future, 1, 0, Date.now() + 6 * 864e5, 'f1'),          // 未来日付＝無効
    sk(yest, 111111, 11, 1000, 'd1'),                        // 同じ日の古い提出
    sk(yest, 222222, 22, 2000, 'd2'),                        // 同じ日の新しい提出＝こちらが正
    sk(two, 99999, 9, 1000, 'c1'),                           // 誤り
    sk(two, 0, 0, 2000, 'c2'),                               // 売上0＝取消
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ skClean load threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent(S_HIROSHIMA);
  const html = registry.app.innerHTML;
  ok(!/¥1 ・/.test(html) && !html.includes('"' + future + '"'), '未来日付の日報は表示・集計に出ない');
  ok(/222,222/.test(html) && !/111,111/.test(html), '同じ店舗×日付は最新の提出が正（二重に並ばない）');
  ok(!/99,999/.test(html), '売上0で出し直すと取消になる（追記式バックエンドでも訂正できる）');
  const one = renderView('soukatsu','manager',S_HIROSHIMA,'ja');
  ok(/id="sk_date"[^>]*max=/.test(one), '総括表の日付は未来を選べない（max付き）');
}
FETCH_ROWS = { ok:false };

console.log('== 日報＝前日分を翌日12時まで（本部の実運用に合わせる）==');
{
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const yest = ymd(new Date(Date.now() - 864e5));
  const today = ymd(new Date());
  FETCH_ROWS = { ok:true, reports:[
    // 前日分の日報を「今朝」提出した想定＝提出時刻は今日でも、前日分として提出済みになる
    { kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: yest, sales: 123456, guests: 20 }), t: Date.now(), id:'n1' },
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ nippou load threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/kyou';
  const html = registry.app.innerHTML;
  ok(/前日分/.test(html), '「今日出すもの」の日報は前日分として表示される');
  ok(new RegExp('前日分[^<]*' + yest.slice(5)).test(html), '対象日（前日の日付）が明示される');
  const rowOf = (h, name) => { const i = h.indexOf(name); return i < 0 ? '' : h.slice(Math.max(0, i - 220), i + 220); };
  ok(/提出済/.test(rowOf(html, '日報')), '翌朝に提出した前日分の日報が「提出済」と判定される');

  FETCH_ROWS = { ok:true, reports:[
    { kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: today, sales: 99999, guests: 9 }), t: Date.now(), id:'n2' },
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ nippou2 threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/kyou';
  const h2 = registry.app.innerHTML;
  ok(/未提出/.test(rowOf(h2, '日報')), '当日分だけ出しても、前日分の日報は未提出のまま残る');
}
FETCH_ROWS = { ok:false };

console.log('== 提出者名の記録（本部決定A-4：後から誰が出したか分かるように）==');
{
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  FETCH_ROWS = { ok:true, reports:[
    { kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: today, sales: 250000, guests: 40, by:'店長（山田）' }), t: Date.now(), id:'b1' },
    { kind:'subrec', store:S_HIROSHIMA, item:'openphoto|' + today, note: JSON.stringify({ by:'店舗iPad（佐藤）', role:'staff' }), photos:[], t: Date.now(), id:'b2' },
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ submitter load threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent(S_HIROSHIMA);
  const st = registry.app.innerHTML;
  ok(/提出者/.test(st) && /店長（山田）/.test(st), '日報の全項目に提出者が表示される');
  ok(/18<\/b>/.test(st), '提出者は日報の入力項目数（分母）に混ぜない');

  location.hash = '#/app/history';
  const hist = registry.app.innerHTML;
  ok(/提出者/.test(hist) && /佐藤/.test(hist), '提出履歴にその日の提出者が出る');
  // distribute() に受け皿が無いと、バックエンドに届いている提出が同期のたびにローカルから消える
  ok(/オープン写真✓/.test(hist), '同期で戻ってきたオープン写真の提出が「提出済」のまま残る');

  location.hash = '#/app/openphoto';
  const op = registry.app.innerHTML;
  ok(/佐藤/.test(op), 'オープン写真の一覧に提出者が出る');

  // 名前が未登録でも提出は妨げない（役割だけが残る）
  FETCH_ROWS = { ok:true, reports:[
    { kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: today, sales: 250000, guests: 40, by:'店長' }), t: Date.now(), id:'b3' },
  ]};
  const st2 = renderView('soukatsu','manager',S_HIROSHIMA,'ja');
  ok(st2.length > 500, '提出者名が未登録でも画面は壊れない');
}
FETCH_ROWS = { ok:false };

console.log('== 月間目標の設定（個店カルテの「目標到達」に入力口を与える）==');
{
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  const ym = today.slice(0, 7);
  const pl = renderView('pl','manager',S_HIROSHIMA,'ja');
  ok(/id="pl_goal"/.test(pl), '「数値・原価率」に売上目標の入力欄がある');

  FETCH_ROWS = { ok:true, reports:[
    { kind:'monthly', store:S_HIROSHIMA, note: JSON.stringify({ ym, sales: 0, purchase: 0, open: 0, close: 0, goal: 1000000, by:'本部（増田）' }), t: Date.now(), id:'g1' },
    { kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: today, sales: 250000, guests: 40 }), t: Date.now(), id:'g2' },
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ goal load threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent(S_HIROSHIMA);
  const st = registry.app.innerHTML;
  ok(/25%/.test(st), '本部が設定した月間目標から到達度が計算される');
  ok(/月間目標/.test(st) && /fillbar/.test(st), '目標に対する進捗バーが出る');

  // 日報側の目標しか無い場合は従来どおりそちらを使う（後方互換）
  FETCH_ROWS = { ok:true, reports:[
    { kind:'soukatsu', store:S_HIROSHIMA, note: JSON.stringify({ date: today, sales: 250000, guests: 40, goal: 500000 }), t: Date.now(), id:'g3' },
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ goal fallback threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent(S_HIROSHIMA);
  ok(/50%/.test(registry.app.innerHTML), '本部の設定が無ければ日報に入力された目標を使う');
}
FETCH_ROWS = { ok:false };

console.log('== サーベイの来店きっかけ：各国語の回答をアプリの区分へ寄せて集計する ==');
{
  const sv = (route, id) => ({ kind:'survey', store:S_HIROSHIMA, level:'5', item:route, note: JSON.stringify({ c:'Korea', f:'' }), t: Date.now(), id });
  FETCH_ROWS = { ok:true, reports:[
    sv('구글','r1'), sv('グーグル','r2'), sv('Google','r3'),          // → Google
    sv('Instagram','r4'), sv('인스타그램','r5'),                      // → Instagram
    sv('Walk in','r6'), sv('現場候位','r7'), sv('예약 없이','r8'), sv('đi thẳng vào','r9'), // → 通りがかり
    sv('其他（YouTube）','r10'),                                      // → その他（内訳に生の値が残る）
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ route normalize threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/survey';
  const html = registry.app.innerHTML;
  const barOf = (label) => { const i = html.indexOf('>'+label+'<'); return i < 0 ? '' : html.slice(i, i + 200); };
  ok(/<b>3<\/b>/.test(barOf('Google（マップ/検索）')), '구글・グーグル・Google が Google に寄る');
  ok(/<b>2<\/b>/.test(barOf('Instagram')), 'Instagram・인스타그램 が Instagram に寄る');
  ok(/<b>4<\/b>/.test(barOf('通りがかり')), 'Walk in・現場候位・예약 없이・đi thẳng vào が通りがかりに寄る');
  ok(/その他」の内訳/.test(html) && /YouTube/.test(html), '寄せられなかった回答は「その他」の内訳に生の値で残る');
}
FETCH_ROWS = { ok:false };

console.log('== サーベイの改善点：多言語の【…】を区分へ寄せて集計する ==');
{
  const sv = (sat, note, id, country) => ({ kind:'survey', store:S_HIROSHIMA, level:String(sat), item:'구글', note: JSON.stringify({ c:country||'Korea', f:note }), t: Date.now(), id });
  FETCH_ROWS = { ok:true, reports:[
    sv(5, '【특별한 문제는 없었어요】', 'i1'),                       // 指摘なし（韓）
    sv(5, '【No particular issue】 Everything is perfect', 'i2'),   // 指摘なし（英）＋自由記述
    sv(5, '【Không có vấn đề gì đặc biệt】 Ngon', 'i3'),            // 指摘なし（越）
    sv(5, '【沒有特別的問題】 おいしい', 'i4'),                       // 指摘なし（中）
    sv(4, '【Food came out slowly】 veryごおd', 'i5'),               // 提供時間
    sv(2, '【料理がおいしくない、料理提供が遅い】 改善希望', 'i6'),      // 料理＋提供時間（複数）
    sv(5, '【그 외 문제】 가격이 조금 부담되었습니다', 'i7'),            // その他
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ issue parse threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/survey';
  const html = registry.app.innerHTML;
  const barOf = (label) => { const i = html.indexOf('>'+label+'<'); return i < 0 ? '' : html.slice(i, i + 200); };
  ok(/いただいたご指摘/.test(html), '「いただいたご指摘」の集計が出る');
  ok(/<b>2<\/b>/.test(barOf('提供時間')), '各国語の「提供が遅い」が提供時間に寄る（英語＋日本語で2件）');
  ok(/<b>1<\/b>/.test(barOf('料理・味')), '1件で複数の指摘があっても、それぞれ数える');
  ok(/<b>1<\/b>/.test(barOf('料理・味')), '「Food came out slowly」は提供時間だけに数える（料理・味に混ぜない）');
  ok(/特にご指摘なし/.test(html) && /<span class="amt">4<\/span>/.test(html), '「特に問題なし」は4か国語ぶんまとめて4件になる');
  ok(/お客様の声/.test(html), '自由記述の一覧が出る');
  ok(/改善希望/.test(html) && html.indexOf('改善希望') < html.indexOf('Everything is perfect'), '評価の低い声を先に並べる');
  ok(!/【/.test(html.slice(html.indexOf('お客様の声'))), '自由記述の表示から【…】のタグを取り除く');
}
FETCH_ROWS = { ok:false };

console.log('== 実データにあった回答で、分類の取りこぼしが無いこと ==');
{
  // 日本料理世桜 心斎橋（おまかせ）／牛カツ長堀橋の実際の回答から採取
  const sv = (sat, note, route, id) => ({ kind:'survey', store:S_HIROSHIMA, level:String(sat), item:route||'구글', note: JSON.stringify({ c:'China', f:note }), t: Date.now(), id });
  FETCH_ROWS = { ok:true, reports:[
    sv(4, '【上菜速度慢、菜品不好吃、饮品上得慢】', '谷歌', 'j1'),              // 中：提供が遅い＋料理
    sv(3, '【음식이 맛없었어요、서비스가 좋지 않았어요】', 'NAVER 블로그', 'j2'), // 韓：料理＋接客
    sv(4, '【それ以外の問題】', 'ネイバーブログ', 'j3'),                        // その他
    sv(4, '【没有特别的问题】', '谷歌', 'j4'),                                  // 簡体字の「問題なし」
    sv(5, '【No particular issue】 amazing', 'Other（friend recommendation）', 'j5'), // 紹介
    sv(4, '', '酒店', 'j6'),                                                    // ホテル紹介
  ]};
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ real data threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/survey';
  const html = registry.app.innerHTML;
  // 「その他」は来店経路のバーにもあるため、セクションを分けて探す
  const routeSec = html.slice(html.indexOf('来店経路'), html.indexOf('いただいたご指摘'));
  const issueSec = html.slice(html.indexOf('いただいたご指摘'));
  const barIn = (sec, label) => { const i = sec.indexOf('>'+label+'<'); return i < 0 ? '' : sec.slice(i, i + 200); };
  ok(/<b>1<\/b>/.test(barIn(issueSec, '提供時間')), '中国語「上菜速度慢／饮品上得慢」を提供時間として数える');
  ok(/<b>2<\/b>/.test(barIn(issueSec, '料理・味')), '中国語「菜品不好吃」と韓国語「음식이 맛없었어요」を料理・味として数える');
  ok(/<b>1<\/b>/.test(barIn(issueSec, '接客')), '韓国語「서비스가 좋지 않았어요」を接客として数える');
  ok(/<b>1<\/b>/.test(barIn(issueSec, 'その他')), '「それ以外の問題」をその他として数える');
  ok(/特にご指摘なし/.test(html) && /<span class="amt">2<\/span>/.test(html), '簡体字「没有特别的问题」も「特に問題なし」として数える');
  ok(/<b>2<\/b>/.test(barIn(routeSec, '紹介・口コミ')), '「friend recommendation」「酒店（ホテル）」を紹介として数える');
  ok(/その他」の内訳/.test(html) && /NAVER|ネイバー/.test(html), 'ブログ経由は「その他」の内訳に残り、分類の抜けに気づける');
}
FETCH_ROWS = { ok:false };

console.log('== 店舗別：どの店で何が起きているかが分かる／未回収の店舗が目立つ ==');
{
  const sv = (store, sat, note, id) => ({ kind:'survey', store, level:String(sat), item:'구글', note: JSON.stringify({ c:'Korea', f:note }), t: Date.now(), id });
  FETCH_ROWS = { ok:true, reports:[
    sv(S_HIROSHIMA, 2, '【料理提供が遅い】', 'p1'),
    sv(S_HIROSHIMA, 3, '【提供が遅い】', 'p2'),
    sv(S_HIROSHIMA, 5, '【特に問題は無かった】', 'p3'),
    sv('寿司世桜 心斎橋店', 5, '【特に問題は無かった】', 'p4'),
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ by-store threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/survey';
  const html = registry.app.innerHTML;
  const cardOf = (name) => { const i = html.indexOf(name); return i < 0 ? '' : html.slice(i, i + 400); };
  ok(/主なご指摘/.test(html), '店舗ごとに「主なご指摘」が出る');
  ok(/主なご指摘：提供時間 2/.test(cardOf('和牛世桜 広島店')), 'その店で多い指摘が件数つきで分かる');
  ok(/まだ回答がありません/.test(html), '回答が無い店舗はそれと分かる');
  ok(/回答がまだ無い店舗が\d+店あります/.test(html), '未回収の店舗数をまとめて知らせる（現場で案内が回っていない可能性に気づける）');
  ok(!/主なご指摘/.test(cardOf('寿司世桜 心斎橋店')), '指摘が無い店舗には「主なご指摘」を出さない');
}
FETCH_ROWS = { ok:false };

console.log('== 来店経路（本部）の注記が実態と合っている ==');
{
  // この画面は議事録12-1でメニューから外している（hide）ため、注記はソース上で検証する
  ok(!/共有同期の設定が必要/.test(code), '「集約には共有同期の設定が必要」という古い注記が消えている');
  ok(/記録された内容は全端末で共有され/.test(code), '実態どおり「全端末で共有され自動で集約される」と説明している');
}

console.log('== 8/7 増田さんご要望：入口の整理 ==');
{
  // 開局（レジ準備金）は不要 → どのタブにも出ない
  for (const role of ['manager','owner','hq']) {
    const h = renderView('home', role, S_HIROSHIMA, 'ja');
    ok(!/開局/.test(h), `[${role}] ホームに開局が出ない`);
  }
  const genba = run(()=> setLS('manager', S_HIROSHIMA, 'ja')) && (location.hash = '#/home?tab=genba', registry.app.innerHTML);
  ok(!/開局/.test(genba), '「報告する」タブにも開局が出ない');

  // 総括表は日次業務へ集約＝タブ一覧には出さないが、機能としては開ける
  ok(!/総括表の入力/.test(genba), '「報告する」タブから総括表が消えている（日次業務へ集約）');
  const sk = renderView('soukatsu','manager',S_HIROSHIMA,'ja');
  ok(/id="submitSk"|総括表/.test(sk), '総括表そのものは開ける（今日出すものから入る）');

  // 店舗側は「今日やること」が先、本部はお知らせが先
  const staffHome = renderView('home','staff',S_HIROSHIMA,'ja');
  ok(staffHome.indexOf('提出・業務') < staffHome.indexOf('本部からのお知らせ'),
     '店舗iPadは「提出・業務」がお知らせより上にある（Zの法則）');
  const hqHome = renderView('home','hq','all','ja');
  ok(hqHome.indexOf('本部からのお知らせ') < hqHome.indexOf('提出・業務'),
     '本部は従来どおりお知らせが先');

  // 接客スクリプトからマニュアルへ飛べる
  const talk = renderView('talk','staff',S_HIROSHIMA,'ja');
  ok(/data-open="manual"/.test(talk), '接客スクリプトからマニュアルへ飛べる');

  // 「学ぶ」タブの中身を固定する（お知らせはホームのカードへ統合済み）
  for (const role of ['staff','manager','hq']) {
    run(()=> setLS(role, role==='hq' ? 'all' : S_HIROSHIMA, 'ja'));
    location.hash = '#/home?tab=learn';
    const learn = registry.app.innerHTML;
    ok(!/お知らせ/.test(learn), `[${role}] 学ぶタブに「お知らせ」が出ない`);
    ok(/マニュアル/.test(learn) && /接客スクリプト/.test(learn), `[${role}] 学ぶタブにマニュアルと接客スクリプトは残っている`);
  }
  // お知らせ機能そのものは生きている（ホームのカードから開く）
  const home = renderView('home','staff',S_HIROSHIMA,'ja');
  ok(/data-open="news"/.test(home), 'ホームのお知らせカードからは開ける');
  const newsView = renderView('news','staff',S_HIROSHIMA,'ja');
  ok(newsView.length > 200, 'お知らせ画面そのものは開ける');
}

console.log('== オープン/クローズの実施状況を、オーナー・本部から見られる ==');
{
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  FETCH_ROWS = { ok:true, reports:[
    { kind:'ckdone', store:S_HIROSHIMA, item:`open||${today}`,
      note: JSON.stringify({ done:{ 'open-c-0-0':true, 'open-c-0-1':true }, by:'店長（山田）' }), t: Date.now(), id:'c1' },
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ ckdone threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/checklist';
  const html = registry.app.innerHTML;
  ok(/各店の本日の点検状況/.test(html), '本部（全店）では店舗別の実施状況が出る');
  ok(/店長（山田）/.test(html), 'どなたが実施したかが分かる');
  ok(/2\//.test(html), '実施した項目数が出る');
  ok(/未実施/.test(html), 'まだ実施していない店舗・モードは「未実施」と分かる');

  // 単店（店長）では従来どおりチェックを付ける画面
  const one = renderView('checklist','manager',S_HIROSHIMA,'ja');
  ok(/data-ck=/.test(one) && !/各店の本日の点検状況/.test(one), '店舗の画面は従来どおりチェックを付ける画面');
}
FETCH_ROWS = { ok:false };

console.log('== 勉強会（8/7 増田さんご要望：日程・録画・資料）==');
{
  FETCH_ROWS = { ok:true, reports:[
    { kind:'study', store:'', item:'st1',
      note: JSON.stringify({ id:'st1', title:'2026年6月 勉強会', date:'2026-06-20',
        video:'https://drive.google.com/file/d/xxx/view',
        docs:[{title:'アジェンダスライド',url:'https://docs.google.com/presentation/d/aaa/edit'},
              {title:'テーマスライド',url:'https://docs.google.com/presentation/d/bbb/edit'}],
        note:'6月のテーマ' }), t: 1000, id:'r1' },
    { kind:'study', store:'', item:'st2',
      note: JSON.stringify({ id:'st2', title:'2026年7月 勉強会', date:'2026-07-18',
        video:'https://drive.google.com/file/d/yyy/view',
        docs:[{title:'アジェンダスライド',url:'https://docs.google.com/presentation/d/ccc/edit'}] }), t: 2000, id:'r2' },
  ]};
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ study threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/study';
  const html = registry.app.innerHTML;
  ok(/2026年7月 勉強会/.test(html) && /2026年6月 勉強会/.test(html), '登録された勉強会が一覧に出る');
  ok(html.indexOf('2026年7月') < html.indexOf('2026年6月'), '新しい回が上に来る');
  ok(/録画を見る/.test(html), '録画を開ける');
  ok(/アジェンダスライド/.test(html) && /テーマスライド/.test(html), '資料が名前つきで並ぶ（1回に複数可）');
  ok(!/studyAdd/.test(html), 'スタッフには登録フォームを出さない');
  ok(!/data-studydel/.test(html), 'スタッフには削除ボタンを出さない');

  run(()=> setLS('hq','all','ja'));
  await new Promise(r=>setTimeout(r, 50));   // 同期でデータが入るのを待ってから描画する
  location.hash = '#/app/study';
  const hq = registry.app.innerHTML;
  ok(/studyAdd/.test(hq), '本部には登録フォームが出る');
  ok(/data-studyedit/.test(hq) && /data-studydel/.test(hq), '本部には編集・削除ボタンが出る');
  ok(/編集する/.test(hq) && /削除する/.test(hq), 'ボタンの文言が「編集する」「削除する」になっている');

  // 学ぶタブから開ける
  run(()=> setLS('staff', S_HIROSHIMA, 'ja'));
  location.hash = '#/home?tab=learn';
  ok(/勉強会/.test(registry.app.innerHTML), '学ぶタブに勉強会が並ぶ');

  // 削除は deleted の行で表す（追記式のバックエンドでも消せる）
  FETCH_ROWS = { ok:true, reports:[
    { kind:'study', store:'', item:'st1', note: JSON.stringify({ id:'st1', title:'消す前' }), t: 1000, id:'r3' },
    { kind:'study', store:'', item:'st1', note: JSON.stringify({ id:'st1', deleted:true }), t: 2000, id:'r4' },
  ]};
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ study del threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/study';
  ok(!/消す前/.test(registry.app.innerHTML), '削除した回は表示されない');

  // 編集：フォームに既存の内容が入り、同じIDで上書きされる
  FETCH_ROWS = { ok:true, reports:[
    { kind:'study', store:'', item:'st9',
      note: JSON.stringify({ id:'st9', title:'編集前のタイトル', date:'2026-06-20',
        video:'https://drive.google.com/file/d/zzz/view',
        docs:[{title:'アジェンダ',url:'https://docs.google.com/presentation/d/ddd/edit'}], note:'メモです' }), t: 1000, id:'r5' },
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ study edit threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  localStorage.setItem('yosakura_study_edit', 'st9');
  location.hash = '#/app/study';
  const eh = registry.app.innerHTML;
  ok(/勉強会を編集/.test(eh), '編集中はフォームの見出しが「編集」に変わる');
  ok(/value="編集前のタイトル"/.test(eh), 'タイトルがフォームに読み込まれる');
  ok(/value="2026-06-20"/.test(eh), '開催日が読み込まれる');
  ok(/value="アジェンダ"/.test(eh), '資料の名前が読み込まれる');
  ok(/メモです<\/textarea>/.test(eh), 'メモが読み込まれる');
  ok(/studyCancel/.test(eh), '「編集をやめる」が出る');
  ok(/保存する/.test(eh), 'ボタンが「保存する」に変わる');
  localStorage.removeItem('yosakura_study_edit');
}
FETCH_ROWS = { ok:false };

console.log('== 店舗名を本部の正式名称に合わせる（過去のデータも同じ店舗として扱う）==');
{
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  // 旧い表記で入っている総括表・サーベイが、正式名称の店舗として集計されること
  FETCH_ROWS = { ok:true, reports:[
    { kind:'soukatsu', store:'日本料理世桜 心斎橋（おまかせ）',
      note: JSON.stringify({ date: today, sales: 250000, guests: 40 }), t: Date.now(), id:'o1' },
    { kind:'survey', store:'日本料理世桜 心斎橋（おまかせ）', level:'5', item:'구글',
      note: JSON.stringify({ c:'Korea', f:'【특별한 문제는 없었어요】' }), t: Date.now(), id:'o2' },
  ]};
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ store alias threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent('日本料理世桜本店');
  const st = registry.app.innerHTML;
  ok(/250,000|25万/.test(st), '旧表記で入っている総括表が、正式名称の店舗として集計される');

  location.hash = '#/app/survey';
  const sv = registry.app.innerHTML;
  ok(/日本料理世桜本店|本店/.test(sv), 'サーベイも正式名称の店舗に寄る');

  // 一覧に正式名称が並ぶ
  const home = renderView('home','hq','all','ja');
  ok(!/心斎橋（おまかせ）/.test(home), '旧表記「心斎橋（おまかせ）」は画面に出ない');

  // 画面では地名だけを出す
  const sk = renderView('soukatsu','manager','日本料理世桜本店','ja');
  ok(/本店/.test(sk), '「日本料理世桜本店」は画面上「本店」と表示される');
  const naga = renderView('soukatsu','manager','牛カツ世桜 長堀橋店','ja');
  ok(/長堀橋店/.test(naga), '「牛カツ世桜 長堀橋店」は画面上「長堀橋店」と表示される');

  // ベトナムの2店も正式名称
  const hq2 = renderView('home','hq','all','ja');
  ok(!/ハノイ|ホーチミン1号/.test(hq2), '旧表記（ハノイ店・ホーチミン1号店）は使わない');
}
FETCH_ROWS = { ok:false };

console.log('== 提出物を本部の「提出物・実行項目一覧」に合わせる（全17項目・出す順）==');
{
  const S_GYU = '牛カツ世桜 長堀橋店';
  const kyou = renderView('kyou','manager',S_GYU,'ja');
  // 出す順＝開店前 → 営業中 → 閉店後
  const order = ['オープン写真','オープンチェックリスト','アイドルタイムチェックリスト','桜チェックリスト','クローズチェックリスト','日報'];
  let prev = -1, ordered = true;
  order.forEach(name => { const i = kyou.indexOf(name); if (i < 0 || i < prev) ordered = false; prev = i; });
  ok(ordered, '日次の提出物が「出す順」に並ぶ（開店前→営業中→閉店後）');
  ok(/桜チェックリスト/.test(kyou), '桜チェックリスト（トイレ）が日次に入っている');
  ok(/定期衛生管理/.test(kyou), '定期衛生管理が日次に入っている');

  /* アプリ内リマインド：ホームの「締切を過ぎている提出があります」は、
     「今日出すもの」の締切超過と必ず一致する（時刻に関係なく、ズレないこと自体を見る）*/
  let homeHtml = '';
  try { run(()=> setLS('manager', S_GYU, 'ja')); location.hash = '#/home'; homeHtml = registry.app.innerHTML; }
  catch (e) { FAIL++; console.log('  ✗ home overdue threw: ' + e.message); }
  ok(/締切超過/.test(kyou) === /締切を過ぎている提出があります/.test(homeHtml),
     'ホームの締切超過のお知らせが「今日出すもの」の状態と一致する');

  // 業態の出し分け：卓上POPは牛カツが週次、それ以外は月次
  const wkGyu = renderView('shukan','manager',S_GYU,'ja');
  ok(/卓上POP/.test(wkGyu), '牛カツでは卓上POPの交換が「今週出すもの」に出る');
  const wkUnagi = renderView('shukan','manager','日本鰻世桜 浅草橋店','ja');
  ok(!/卓上POP/.test(wkUnagi), '牛カツ以外では週次に卓上POPが出ない');
  const mtUnagi = renderView('getsuji','manager','日本鰻世桜 浅草橋店','ja');
  ok(/卓上POP/.test(mtUnagi), '牛カツ以外では月次に卓上POPが出る');

  // 月次・四半期
  ok(/PL/.test(mtUnagi) && /店舗内・外の動画/.test(mtUnagi), '月次にPL・店舗内外動画が入っている');
  ok(/コンプラチェック/.test(mtUnagi), '四半期のコンプラチェックが月次の画面に出る');

  /* 以前から使っている端末に、古い既定マスタ（6項目・日次3件）が残っている場合。
     かつては端末に保存した既定をそのまま使っていたため、こちらで17項目にしても
     旧端末には届かず「日次業務が3項目しかない」状態になった（2026-08-07 渉さんの端末で発覚）。*/
  const OLD_MASTER = [
    { id:'firstphoto', name:{ja:'一食目写真',en:'First',vi:'F'},   oblig:'off',      freq:'daily',   due:'23:59', target:'all', hqReview:'exception', detect:'fp' },
    { id:'nippou',     name:{ja:'日報（総括表）',en:'Daily',vi:'D'}, oblig:'required', freq:'daily',   due:'12:00', target:'all', hqReview:'each',      detect:'sk' },
    { id:'openphoto',  name:{ja:'オープン写真',en:'Open',vi:'O'},   oblig:'store',    freq:'daily',   due:'11:00', target:'all', hqReview:'none',      detect:'subrec' },
    { id:'cleaning',   name:{ja:'清掃チェック',en:'Clean',vi:'C'},  oblig:'store',    freq:'daily',   due:'23:59', target:'all', hqReview:'none',      detect:'none' }
  ];
  let oldDev = '';
  try {
    run(() => {
      setLS('manager', S_GYU, 'ja');
      localStorage.setItem('yosakura_sub_master_v1', JSON.stringify(OLD_MASTER)); // 旧キーに残った古い既定
    });
    location.hash = '#/app/kyou'; oldDev = registry.app.innerHTML;
  } catch (e) { FAIL++; console.log('  ✗ 旧端末マスタ threw: ' + e.message); }
  ok(/定期衛生管理/.test(oldDev) && /桜チェックリスト/.test(oldDev),
     '以前から使っている端末でも、増えた提出物（定期衛生・桜）がちゃんと出る');
  ok(!/清掃チェック/.test(oldDev), '端末に残っていた古い項目（清掃チェック）はもう出ない');

  // チェックリストを実施すると「提出済み」になる
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  FETCH_ROWS = { ok:true, reports:[
    { kind:'ckdone', store:S_GYU, item:`sakura||${today}`,
      note: JSON.stringify({ done:{ 'sakura-c-0-0':true }, by:'店長（山田）' }), t: Date.now(), id:'k1' },
  ]};
  try { run(()=> setLS('manager', S_GYU, 'ja')); } catch(e){ FAIL++; console.log('  ✗ ckdone detect threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/kyou';
  const html = registry.app.innerHTML;
  const rowOf = (h, name) => { const i = h.indexOf(name); return i < 0 ? '' : h.slice(Math.max(0, i - 240), i + 240); };
  ok(/提出済/.test(rowOf(html, '桜チェックリスト')), 'アプリでチェックすると、その項目が「提出済」になる');
  ok(/未提出/.test(rowOf(html, 'クローズチェックリスト')), 'まだ実施していないチェックリストは「未提出」のまま');
}
FETCH_ROWS = { ok:false };

console.log('== チェックリストが4種類（オープン・アイドル・クローズ・桜）==');
{
  const S_GK = '牛カツ世桜 長堀橋店';
  const ck = renderView('checklist','manager',S_GK,'ja');
  ok(/オープン/.test(ck) && /アイドル/.test(ck) && /クローズ/.test(ck) && /桜/.test(ck), '4つのモードが選べる');
  // モードは run() の中で設定する（run が localStorage を初期化するため）
  const inMode = (mode) => { run(()=> { setLS('manager', S_GK, 'ja'); localStorage.setItem('yosakura_ckmode', mode); }); location.hash = '#/app/checklist'; return registry.app.innerHTML; };
  const sakura = inMode('sakura');
  ok(/便器/.test(sakura) && /ドアノブ/.test(sakura), '桜チェックは本部のシートどおりの項目が並ぶ');
  ok(/清掃具と鏡用の布は、他と分けて/.test(sakura), '取り違えやすい注意（清掃具を分ける）が出る');
  const idle = inMode('idle');
  ok(/バッシング/.test(idle) && /夜の開店準備/.test(idle), 'アイドルは「昼の締め→夜の開店準備」の順に並ぶ');
  ok(idle.indexOf('昼の締め') < idle.indexOf('夜の開店準備'), '昼を締めてから夜を開ける順序になっている');
  // 本部のシートの細目が、各項目の下に説明として出る
  const open = inMode('open');
  ok(/タイムカード打刻/.test(open) && /ガラスクリーナー/.test(open), 'シートの細目が説明として表示される');
  ok(/【?ホール|ホール/.test(open) && /キッチン/.test(open), 'ホールとキッチンの2系統に分かれている');
  const close = inMode('close');
  ok(/日計レポート/.test(close) && /キーボックス/.test(close), 'クローズも本部のシートどおりの内容');

  // 定期衛生＝曜日ごとに清掃箇所が変わる（1週間で店全体を1周）
  const td = new Date().toLocaleDateString('en-CA'); // 曜日の選択は「その日だけ」有効
  const hygOf = (day) => { run(()=> { setLS('manager', S_GK, 'ja'); localStorage.setItem('yosakura_ckmode','hygiene'); localStorage.setItem('yosakura_hygday', `${td}|${day}`); }); location.hash = '#/app/checklist'; return registry.app.innerHTML; };
  const mon = hygOf(1), thu = hygOf(4);
  ok(/冷蔵庫（内部・外部）/.test(mon), '月曜は冷蔵庫まわりが出る');
  ok(/グリストラップ/.test(thu), '木曜はグリストラップが出る');
  ok(!/グリストラップ/.test(mon), '曜日が違えば別の箇所が出る');
  ok(/曜日ごとに決められた箇所/.test(mon), '1週間で店全体を1周する運用が説明されている');
  ok(/data-hygday="4"/.test(mon), '他の曜日へ切り替えられる（手が空いたら先にやってよい運用）');
  ok(/柄杓で浮いた油/.test(thu), '清掃方法まで表示される（シートを開かずに実施できる）');

  /* 何も選んでいないときは「今日」の箇所が開く。
     以前は未選択が0と読まれ、何曜日でも必ず日曜の箇所が開いていた（2026-08-07 発覚）。*/
  run(()=> { setLS('manager', S_GK, 'ja'); localStorage.setItem('yosakura_ckmode','hygiene'); localStorage.removeItem('yosakura_hygday'); });
  location.hash = '#/app/checklist';
  const hygToday = registry.app.innerHTML;
  ok(new RegExp(`data-hygday="${new Date().getDay()}" class="on"`).test(hygToday),
     '曜日を選んでいなければ、今日の箇所が開く');
  // 前の日に選んだ曜日は持ち越さない（今日の箇所を見落とさないように）
  run(()=> { setLS('manager', S_GK, 'ja'); localStorage.setItem('yosakura_ckmode','hygiene'); localStorage.setItem('yosakura_hygday', '2020-01-01|3'); });
  location.hash = '#/app/checklist';
  ok(new RegExp(`data-hygday="${new Date().getDay()}" class="on"`).test(registry.app.innerHTML),
     '前日以前に選んだ曜日は持ち越さず、今日へ戻る');
}

console.log('== 総点検：全画面 × 全ロール × 全言語 で例外が出ない ==');
{
  const ids = [...new Set([...code.matchAll(/id:'([a-zA-Z_]+)',\s*group:'/g)].map(m => m[1]))];
  const stores = ['和牛世桜 広島店', '日本料理世桜本店', '牛カツ世桜 長堀橋店'];
  let ng = 0, n = 0;
  for (const id of ids) {
    for (const role of ['staff','manager','owner','hq']) {
      for (const lang of ['ja','en','vi']) {
        const store = role === 'hq' ? 'all' : (role === 'owner' ? 'owned' : stores[0]);
        n++;
        if (renderView(id, role, store, lang) === '') ng++;
      }
    }
  }
  ok(ng === 0, `全画面が例外なく描画される（${ids.length}画面 × 4ロール × 3言語 = ${n}通り）`);

  // 店舗を変えても壊れない（13店舗すべて）
  let ng2 = 0;
  const allStores = [...new Set([...code.matchAll(/'((?:日本料理|寿司|牛カツ|日本鰻|手巻き寿司|和牛)世桜[^']*)'/g)].map(m => m[1]))];
  for (const s of allStores) {
    for (const id of ['kyou','shukan','getsuji','checklist','soukatsu','pl','survey','history']) {
      if (renderView(id, 'manager', s, 'ja') === '') ng2++;
    }
  }
  ok(ng2 === 0, `全店舗で主要画面が描画される（${allStores.length}店舗）`);

  // チェックリストは5モード＋曜日7通りすべて描画できる
  let ng3 = 0;
  for (const mode of ['open','idle','close','sakura','hygiene']) {
    for (let d = 0; d < 7; d++) {
      try {
        run(()=> { setLS('manager','牛カツ世桜 長堀橋店','ja'); localStorage.setItem('yosakura_ckmode', mode); localStorage.setItem('yosakura_hygday', String(d)); });
        location.hash = '#/app/checklist';
        if (!registry.app.innerHTML || registry.app.innerHTML.length < 200) ng3++;
      } catch (e) { ng3++; console.log('  ✗ checklist threw: ' + mode + '/' + d + ' ' + e.message); }
    }
  }
  ok(ng3 === 0, 'チェックリストの5モード × 曜日7通りがすべて描画される');
}

console.log('== 総点検：設定の整合（IDの重複・リンク先の存在）==');
{
  // 提出物マスタのIDが重複していないか（重複すると提出判定が混ざる）
  const mids = [...code.matchAll(/\{\s*id:'([a-z_]+)',\s*name:\{ja:/g)].map(m => m[1]);
  const dupM = mids.filter((x, i) => mids.indexOf(x) !== i);
  ok(dupM.length === 0, `提出物マスタのIDが重複していない${dupM.length ? '（重複: ' + dupM.join(',') + '）' : ''}`);

  // linkApp の飛び先がアプリとして存在するか（存在しないとタップしてもホームに戻る）
  const appIds = new Set([...code.matchAll(/id:'([a-zA-Z_]+)',\s*group:'/g)].map(m => m[1]));
  const links = [...new Set([...code.matchAll(/linkApp:'([a-zA-Z_]+)'/g)].map(m => m[1]))];
  const missing = links.filter(x => !appIds.has(x));
  ok(missing.length === 0, `提出物のリンク先がすべて存在する${missing.length ? '（無い: ' + missing.join(',') + '）' : ''}`);

  // アプリで出せない提出物には、どこへどう出すかが書いてある（現場が迷わないように）
  const mt = renderView('getsuji','manager','日本鰻世桜 浅草橋店','ja');
  ok(/写真共有の箇所は毎月本部より指定/.test(mt), '月次の定期衛生に提出方法が書いてある');
  ok(/並べて写真を撮って店舗×本部GLINEへ/.test(mt), 'メニューブックの確認に提出方法が書いてある');
  ok(/本部がシートを用意し/.test(mt), 'コンプラチェックに実施方法が書いてある');
  // 誤ったリンク先が残っていないこと（コンプラ→公益通報など、意味の違う画面へ飛ばさない）
  ok(!/linkApp:'whistle'/.test(code), 'コンプラチェックを公益通報の画面へ飛ばしていない');

  // 店舗マスタと別名表の整合（別名の行き先が実在する店舗か）
  const aliasTargets = [...code.matchAll(/'[^']+':\s*'((?:日本料理|寿司|牛カツ|日本鰻|手巻き寿司|和牛)世桜[^']*)'/g)].map(m => m[1]);
  const storeSet = new Set([...code.matchAll(/'((?:日本料理|寿司|牛カツ|日本鰻|手巻き寿司|和牛)世桜[^']*)'/g)].map(m => m[1]));
  const badAlias = aliasTargets.filter(x => !storeSet.has(x));
  ok(badAlias.length === 0, `旧表記の読み替え先がすべて実在する店舗${badAlias.length ? '（不正: ' + badAlias.join(',') + '）' : ''}`);
}

console.log('== 旧表記のサーベイが、件数として落ちずに合算される ==');
{
  const mk = (store, i) => ({ kind:'survey', store, level:'5', item:'구글',
    note: JSON.stringify({ c:'Korea', f:'' }), t: Date.now() - i * 1000, id: 'x' + store + i });
  const reports = [];
  for (let i = 0; i < 14; i++) reports.push(mk('日本料理世桜 心斎橋（おまかせ）', i)); // 旧表記
  for (let i = 0; i < 41; i++) reports.push(mk('牛カツ世桜 長堀橋店', i));            // 現行表記
  FETCH_ROWS = { ok:true, reports };
  try { run(()=> setLS('hq','all','ja')); } catch(e){ FAIL++; console.log('  ✗ threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/survey';
  const html = registry.app.innerHTML;
  const m = html.match(/<div class="n">(\d+)<\/div><div class="k">回答数/);
  const shown = m ? Number(m[1]) : -1;
  ok(shown === 55, `旧表記14件＋現行41件＝55件として集計される（実際に画面へ出た数=${shown}）`);
}
FETCH_ROWS = { ok:false };

console.log('== 端末に旧表記が残っていても、起動時に正式名称へ直る ==');
{
  // 同期は「バックエンドの中身が前回と同じなら作り直さない」ため、
  // 店舗名を変えても端末には旧表記が残る。この状態を再現して、起動時に直ることを確かめる。
  const old = [];
  for (let i = 0; i < 14; i++) old.push({ store:'日本料理世桜 心斎橋（おまかせ）', sat:5, route:'google', note:'', country:'Korea', t: Date.now() - i * 1000 });
  for (let i = 0; i < 41; i++) old.push({ store:'牛カツ世桜 長堀橋店', sat:5, route:'google', note:'', country:'Korea', t: Date.now() - i * 1000 });
  FETCH_ROWS = { ok:false }; // 同期は走らせない（＝作り直しが起きない状況を再現）
  try {
    run(()=> {
      setLS('hq','all','ja');
      localStorage.setItem('yosakura_demo_survey', JSON.stringify(old));
      localStorage.setItem('yosakura_demo_raw', '[]'); // 前回の同期結果は入っている状態
    });
  } catch(e){ FAIL++; console.log('  ✗ migrate threw: '+e.message); }
  location.hash = '#/app/survey';
  const html = registry.app.innerHTML;
  const m = html.match(/<div class="n">(\d+)<\/div><div class="k">回答数/);
  const shown2 = m ? Number(m[1]) : -1;
  ok(shown2 === 55, `端末に残った旧表記も集計に入る（実際に画面へ出た数=${shown2}）`);
  const saved = JSON.parse(localStorage.getItem('yosakura_demo_survey') || '[]');
  ok(saved.every(r => r.store !== '日本料理世桜 心斎橋（おまかせ）'), '保存されているデータ自体が正式名称へ書き換わる');
  ok(saved.filter(r => r.store === '日本料理世桜本店').length === 14, '書き換え後も件数が変わらない（14件のまま）');
}

console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
