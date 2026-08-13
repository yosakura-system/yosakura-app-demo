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
    sk('牛カツ世桜 長堀橋店', 1, 60000, 12), sk('牛カツ世桜 長堀橋店', 2, 75000, 15,
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
  location.hash = '#/store?s=' + encodeURIComponent('牛カツ世桜 長堀橋店');
  const st = registry.app.innerHTML;
  ok(/長堀橋店/.test(st), '個店カルテが開く');
  ok(/曜日別の平均売上/.test(st), '曜日別の平均売上が出る');
  ok(/最新の日報（全項目）/.test(st) && /レジ締め担当/.test(st) && /田中/.test(st), '売上・客数以外の全項目（口コミ・原価率・締め担当等）が表示される');
  ok(/厨房の床を清掃/.test(st) && /豆乳6/.test(st), '特記事項・翌日発注も表示される');
  ok(/入力済みの項目/.test(st) && /<b>18 \/ \d+<\/b>/.test(st), '入力済み項目数（アップされた分だけ表示）が分かる');
  ok(/目標到達/.test(st), '月間目標への到達度が出る');
  ok(/この店舗の他のデータ/.test(st), 'サーベイ・原価率など他データも同じ画面に出る');
  ok(/dcell off/.test(st), '未入力の項目は「—」で分かる');

  console.log('== 個店カルテ：権限（自店以外は開けない）==');
  try { run(()=> setLS('manager', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ store detail role threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent('牛カツ世桜 長堀橋店');
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
  // 入力したのは売上と客数の2つだけ。提出者はここに数えない（項目ではなく記録のため）
  ok(/<b>2 \/ \d+<\/b>/.test(st), '提出者は日報の入力項目数に混ぜない');

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
     旧端末には届かず「日次業務が3項目しかない」状態になった（2026-08-07 神田さんの端末で発覚）。*/
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

  /* チェックリストを「最後まで」実施すると「提出済み」になる。
     ★2026-08-12 修正：以前は1つでもチェックすれば提出済みになっていた（神田さんのご指摘）。
       途中で「今日出すもの」から消えると、やり残しに気づけないため、全部終わるまで残す。 */
  const ymd = (d) => d.toLocaleDateString('en-CA');
  const today = ymd(new Date());
  const rowOf = (h, name) => { const i = h.indexOf(name); return i < 0 ? '' : h.slice(Math.max(0, i - 240), i + 240); };

  // 途中まで（1項目だけ）＝まだ提出済みにしない
  FETCH_ROWS = { ok:true, reports:[
    { kind:'ckdone', store:S_GYU, item:`sakura||${today}`,
      note: JSON.stringify({ done:{ 'sakura-c-0-0':true }, by:'店長（山田）' }), t: Date.now(), id:'k1' },
  ]};
  try { run(()=> setLS('manager', S_GYU, 'ja')); } catch(e){ FAIL++; console.log('  ✗ ckdone detect threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/kyou';
  ok(!/提出済/.test(rowOf(registry.app.innerHTML, '桜チェックリスト')),
     '1項目だけ終えた段階では、まだ「提出済」にしない');

  // 全項目を終えた＝提出済みになる（項目のIDは画面と同じ作り方で並べる）
  {
    const app = run(()=> setLS('manager', S_GYU, 'ja'));
    location.hash = '#/app/checklist';
    localStorage.setItem('yosakura_ckmode', 'sakura');
    location.hash = '#/home'; location.hash = '#/app/checklist';
    const ids = [...registry.app.innerHTML.matchAll(/data-ck="([^"]+)"/g)].map(m => m[1]);
    ok(ids.length > 1, `桜チェックリストの項目が読み取れる（${ids.length}件）`);
    const allDone = {}; ids.forEach(id => allDone[id] = true);
    FETCH_ROWS = { ok:true, reports:[
      { kind:'ckdone', store:S_GYU, item:`sakura||${today}`,
        note: JSON.stringify({ done: allDone, by:'店長（山田）' }), t: Date.now(), id:'k2' },
    ]};
    try { run(()=> setLS('manager', S_GYU, 'ja')); } catch(e){ FAIL++; console.log('  ✗ ckdone all threw: '+e.message); }
    await new Promise(r=>setTimeout(r, 50));
    location.hash = '#/app/kyou';
    ok(/提出済/.test(rowOf(registry.app.innerHTML, '桜チェックリスト')),
       '最後まで終えると「提出済」になる');
  }
  ok(/未提出/.test(rowOf(registry.app.innerHTML, 'クローズチェックリスト')), 'まだ実施していないチェックリストは「未提出」のまま');
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

console.log('== 手元の画像を消しても、画面のロゴが出る（2026-08-13 神田さんのご要望）==');
{
  /* 作業フォルダはOneDriveにあり、画像は定期的に削除する運用。
     アプリが `icons/*.png` を読みに行くと、消した瞬間に画面のロゴが消え、
     その状態で撮ったスクショが資料に載ってしまう（2026-08-13 に実際に発生）。
     → 画面に出す画像は app.js と index.html の中へ文字として埋め込む。 */
  ok(!/(?:src|href)="icons\//.test(code), 'app.js は画像ファイルを読みに行かない');
  ok(/const IMG_LOGO = 'data:image\/png;base64,[A-Za-z0-9+/=]{500,}'/.test(code)
     && /const IMG_ICON = 'data:image\/png;base64,[A-Za-z0-9+/=]{500,}'/.test(code),
     'ロゴとアイコンが、アプリの中に文字として入っている');
  const html = fs.readFileSync(APP.replace(/app\.js$/, 'index.html'), 'utf8');
  ok(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]{500,}" alt="[^"]*" class="splash__logo">/.test(html),
     '起動画面のロゴも埋め込まれている（アプリが動く前に出るため）');
  ok(/<link rel="icon" href="data:image\/png;base64,/.test(html), 'タブのアイコンも埋め込まれている');
  // 画面に実際に出ていること（埋め込んだだけで使われていない、を防ぐ）
  ok(/src="data:image\/png;base64,/.test(renderView('home', 'manager', '牛カツ世桜 長堀橋店', 'ja')
      + registry.app.innerHTML + (registry.hdr ? registry.hdr.innerHTML : '')),
     '画面の中でも、埋め込んだ画像が使われている');
}

console.log('== 定期衛生管理を、店舗ごと・曜日ごとに作り替えられる（2026-08-13 上原さんのご要望）==');
{
  /* 上原さん：業態ごとの参考シートはあるが、実際は各店でカスタマイズして使っている。
     → 全店共通を出発点として置き、各店の店長・オーナーが外す／足せるようにする。 */
  const S = '牛カツ世桜 長堀橋店';
  const td = new Date().toLocaleDateString('en-CA');
  const openHyg = (day, seed) => {
    run(() => {
      setLS('manager', S, 'ja');
      localStorage.setItem('yosakura_ckmode', 'hygiene');
      localStorage.setItem('yosakura_hygday', `${td}|${day}`);
      if (seed) seed();
    });
    location.hash = '#/app/checklist';
    return registry.app.innerHTML;
  };
  const totalOf = (h) => Number((/\/(\d+)<\/span>/.exec(h) || [])[1] || 0);
  const hideSeed = (key, ids) => () => localStorage.setItem('yosakura_demo_ckhide', JSON.stringify({ [key]: ids }));

  // ① 使わない共通項目を、その店舗だけ外せる
  const before = openHyg(1);
  ok(/data-ckhide="hygiene-1-c-0-0"/.test(before), '共通項目に「この店舗では使わない」ボタンが出る');
  const after = openHyg(1, hideSeed(`${S}||hygiene-1`, ['hygiene-1-c-0-0']));
  ok(!/data-ck="hygiene-1-c-0-0"/.test(after), '外した項目はチェック欄から消える');
  ok(totalOf(before) > 0 && totalOf(after) === totalOf(before) - 1, '外した項目は件数（分母）からも除かれる');
  ok(/この店舗では使わない項目/.test(after) && /data-ckshow="hygiene-1-c-0-0"/.test(after),
     '外した項目は残しておき、その場で戻せる（設備が変わっても元に戻せる）');

  // ② 外す設定は曜日ごとに別々（月曜で外しても木曜には効かない）
  ok(!/この店舗では使わない項目/.test(openHyg(4, hideSeed(`${S}||hygiene-1`, ['hygiene-1-c-0-0']))),
     '月曜で外しても、別の曜日はそのまま');

  // ③ 追加項目も曜日ごとに分かれる。以前に足した項目は消えない
  const seedItems = () => localStorage.setItem('yosakura_demo_ckitem', JSON.stringify({
    [`${S}||hygiene-1`]: [{ id:'hygiene-1-x-a1', label:'月曜だけの追加項目' }],
    [`${S}||hygiene`]:   [{ id:'hygiene-x-old',  label:'曜日を分ける前の追加項目' }]
  }));
  const mon2 = openHyg(1, seedItems), thu2 = openHyg(4, seedItems);
  ok(/月曜だけの追加項目/.test(mon2) && !/月曜だけの追加項目/.test(thu2), '足した項目は、その曜日にだけ出る');
  ok(/曜日を分ける前の追加項目/.test(mon2) && /曜日を分ける前の追加項目/.test(thu2),
     '曜日で分ける前に足した項目は、どの曜日でも出続ける（画面から消えない）');
  ok(/この店舗の追加項目（月/.test(mon2), 'どの曜日へ足すのかが見出しに出る');

  // ④ 外せるのは定期衛生だけ（オープン等は本部共通のまま）
  run(() => { setLS('manager', S, 'ja'); localStorage.setItem('yosakura_ckmode', 'open'); });
  location.hash = '#/app/checklist';
  ok(!/data-ckhide=/.test(registry.app.innerHTML), 'オープンの共通項目は、店舗側から外せない');

  // ⑤ スタッフは見るだけ（外す・足すは店長／オーナーのみ）
  const staff = openHyg(1, () => localStorage.setItem('yosakura_demo_role', 'staff'));
  ok(!/data-ckhide=/.test(staff) && !/id="ckAdd"/.test(staff), 'スタッフには外す・足すの操作が出ない');

  // ⑥ 外した項目を除いて全部終えれば、提出済みになる（分母が画面と一致している）
  {
    const day = new Date().getDay();
    run(() => {
      setLS('manager', S, 'ja');
      localStorage.setItem('yosakura_ckmode', 'hygiene');
      localStorage.setItem('yosakura_demo_ckhide', JSON.stringify({ [`${S}||hygiene-${day}`]: [`hygiene-${day}-c-0-0`] }));
    });
    location.hash = '#/app/checklist';
    const shown = [...registry.app.innerHTML.matchAll(/data-ck="([^"]+)"/g)].map(m => m[1]);
    const done = {}; shown.forEach(id => done[id] = true);
    localStorage.setItem('yosakura_demo_ckdone', JSON.stringify({ [`${S}||hygiene||${td}`]: done }));
    location.hash = '#/home'; location.hash = '#/app/kyou';
    const h = registry.app.innerHTML, i = h.indexOf('定期衛生管理');
    ok(shown.length > 0 && /提出済/.test(i < 0 ? '' : h.slice(Math.max(0, i - 240), i + 240)),
       '外した項目を除いて全部終えれば、提出済みになる');
  }

  // ⑦ 店舗ごとの設定は全端末で共有され、同期でも保存期間でも消えない
  ok(/case 'ckhide'/.test(code), '外した項目も全端末へ共有される（同期の受け皿がある）');
  ok(/mergeMap\('yosakura_demo_ckitem', ckitem\); mergeMap\('yosakura_demo_ckhide', ckhide\);/.test(code),
     '同期は「届いたぶんだけ」差し替える＝店舗が足した項目が同期で消えない');
  const gs = fs.readFileSync(APP.replace(/app\.js$/, 'backend/Code.gs'), 'utf8');
  ok(/PURGE_KEEP_KINDS[^\n]*'ckitem'[^\n]*'ckhide'/.test(gs),
     '保存期間の掃除で、店舗ごとに作り替えた点検表を消さない');
}

console.log('== 日報を総括表 Ver.2.6 に合わせる（現金/カード・国別の組数人数など）==');
{
  const S_UNAGI = '日本鰻世桜 浅草橋店';
  const sk = renderView('soukatsu', 'manager', '牛カツ世桜 長堀橋店', 'ja');
  ok(/現金売上/.test(sk) && /カード売上/.test(sk), '現金・カードの内訳が入力できる');
  ok(/昼のみ売上/.test(sk) && /消耗品金額/.test(sk) && /仕入金額（当日）/.test(sk), '昼のみ売上・消耗品・当日仕入が入力できる');
  ok(/過不足（現金）の理由/.test(sk), '過不足の理由が書ける（金額だけでは後から分からないため）');
  ok(/お客様の内訳（国別・組数／人数）/.test(sk) && /sk_cty_jp_g/.test(sk) && /sk_cty_af_p/.test(sk),
     '国別の組数・人数が総括表と同じ区分で並ぶ');
  ok(/sk_cty_new_g/.test(sk) && /sk_cty_rep_g/.test(sk), '新規・リピートも入力できる');
  ok(!/鰻の使用尾数/.test(sk), '鰻を扱わない店舗には、鰻の使用尾数を出さない');
  ok(/鰻の使用尾数/.test(renderView('soukatsu', 'manager', S_UNAGI, 'ja')), '鰻の店舗にだけ、使用尾数が出る');

  // 保存された国別の内訳が、日報の全項目に出る
  const today = new Date().toLocaleDateString('en-CA');
  FETCH_ROWS = { ok:true, reports:[
    { kind:'soukatsu', store:'牛カツ世桜 長堀橋店', t:Date.now(), id:'c1',
      note: JSON.stringify({ date: today, sales: 348500, guests: 66,
        cash: 96800, card: 251700, errnote: '両替の戻し忘れ',
        cty: { jp:{g:5,p:11}, kr:{g:2,p:4}, new:{g:6,p:13} } }) }
  ]};
  try { run(()=> setLS('manager', '牛カツ世桜 長堀橋店', 'ja')); } catch (e) { FAIL++; console.log('  ✗ cty threw: ' + e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/store?s=' + encodeURIComponent('牛カツ世桜 長堀橋店');
  const det = registry.app.innerHTML;
  ok(/お客様の内訳（国別）/.test(det), '日報の全項目に、国別の内訳が出る');
  ok(/7組/.test(det) && /15名/.test(det), '国別の合計が正しい（新規・リピートは二重に数えない）');
  ok(/両替の戻し忘れ/.test(det), '過不足の理由も残る');
}
FETCH_ROWS = { ok:false };

console.log('== 使い方が役割ごとに変わる（紙のガイドと同じ中身）==');
{
  const g = (role, store) => renderView('guide', role, store, 'ja');
  const staff = g('staff', S_HIROSHIMA), mgr = g('manager', S_HIROSHIMA);
  const own = g('owner', 'owned'), hq = g('hq', 'all');
  ok(/この端末での使い方/.test(staff), '使い方の画面が出る');
  ok(/お名前を登録/.test(staff) && /開いて提出/.test(staff), '店舗＝出すことだけが書いてある');
  ok(!/本部ダッシュボード/.test(staff) && !/資料をマニュアルにひも付/.test(staff),
     '店舗に、本部だけの話は出さない');
  ok(/日報（総括表）を出す/.test(mgr) && /実施状況を確認/.test(mgr), '店長＝出す＋確かめるまで');
  ok(/所有店舗すべて|見る店舗を切り替え/.test(own), 'オーナー＝複数店の見方が書いてある');
  ok(/加盟店・提出物管理/.test(hq) && /お知らせを配る/.test(hq) && /勉強会を登録/.test(hq),
     '本部＝全店の管理・配信・登録が書いてある');
  ['staff', 'manager', 'owner', 'hq'].forEach(r => {
    const h = g(r, r === 'hq' ? 'all' : r === 'owner' ? 'owned' : S_HIROSHIMA);
    ok(/最新にする/.test(h), `${r}：画面が違って見えるときの直し方が必ず載っている`);
  });
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

  /* 月次の提出物は、アプリで出せるものは出せる形に、出せないものは出し方が書いてある。
     ★2026-08-12：月次の衛生写真とメニューブックの確認は、以前はグループLINEへ送る運用のままだった。
       写真を出すという中身はオープン写真と同じなので、アプリで受けるようにした（神田さんのご指摘）。 */
  const mt = renderView('getsuji','manager','日本鰻世桜 浅草橋店','ja');
  ok(/data-tsubphoto="hygiene_m"/.test(mt), '月次の定期衛生を、アプリから写真で提出できる');
  ok(/data-tsubphoto="menubook"/.test(mt), 'メニューブックの確認を、アプリから写真で提出できる');
  ok(!/GLINEへ/.test(mt), '月次の提出物に「GLINEへ送る」案内が残っていない');
  /* コンプラチェック＝案②（2026-08-12 神田さんのご判断）。
     四半期に1回のためにアプリ内へ回答画面を作らず、本部が用意されたシートへの入口だけを置く。 */
  ok(/本部が用意したシートに記入してください/.test(mt), 'コンプラチェックに、どうすればよいかが書いてある');
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

console.log('== よくある質問（8/10 構築MTG A-04：ルールを後から確認できる場所）==');
{
  FETCH_ROWS = { ok:true, reports:[
    { kind:'faqset', store:'', note: JSON.stringify([
      { id:'fq1', cat:'store', q:'制服が破れたときは？', a:'店長へご連絡ください。' }
    ]), t: 3000, id:'f1' },
  ]};
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ faq threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/faq';
  const html = registry.app.innerHTML;
  ok(/2〜3週間/.test(html), '販促物の納期ルール（D-03）が出る');
  ok(/原則としてお断り/.test(html), 'ワイン持ち込みのルール（D-10）が出る');
  ok(/構築MTGでの決定事項/.test(html), '会議で決まったルールには出典が付く');
  ok(/制服が破れたときは/.test(html), '本部が追加した項目が全端末へ同期される');
  ok(!/faqAdd/.test(html), 'スタッフには追加フォームを出さない');
  ok(!/data-faqdel/.test(html), 'スタッフには削除ボタンを出さない');

  run(()=> setLS('hq','all','ja'));
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/faq';
  const hq = registry.app.innerHTML;
  ok(/faqAdd/.test(hq), '本部には追加フォームが出る');
  ok(/data-faqdel="fq1"/.test(hq), '本部は追加した項目を削除できる');
  ok(/data-faqedit="fq1"/.test(hq), '本部は追加した項目を編集できる');
  ok(/data-faqedit="fx_promo"/.test(hq) && /data-faqdel="fx_promo"/.test(hq), '会議で決まったルールも本部が編集・削除できる');

  // 会議で決まったルールを本部が書き換える → 上書きが表示に反映され、出典は残る
  FETCH_ROWS = { ok:true, reports:[
    { kind:'faqset', store:'', note: JSON.stringify([
      { id:'fx_promo', cat:'promo', q:'販促物の依頼はいつまで？', a:'3週間前までにお願いします。' },
      { id:'fx_drink', deleted:true }
    ]), t: 3100, id:'f2' },
  ]};
  run(()=> setLS('staff', S_HIROSHIMA, 'ja'));
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/faq';
  const ed = registry.app.innerHTML;
  ok(/3週間前までにお願いします/.test(ed), '本部が書き換えた内容が全端末に反映される');
  ok(!/2〜3週間/.test(ed), '元の文面は残らない（二重に出ない）');
  ok(/構築MTGでの決定事項/.test(ed) && /本部が修正/.test(ed), '書き換えても出典は残り、修正済みと分かる');
  ok(!/原則としてお断り/.test(ed), '本部が削除したルールは表示されない');

  // faqset が含まれない同期で、端末に入っている項目が消えないこと（linksetと同じ考え方）
  FETCH_ROWS = { ok:true, reports:[ { kind:'kizuki', store:S_HIROSHIMA, item:'その他', note:'x', t:4000, id:'k1' } ] };
  run(()=> { setLS('hq','all','ja'); localStorage.setItem('yosakura_demo_faq', JSON.stringify([{ id:'fq9', cat:'other', q:'残るか', a:'残る' }])); });
  await new Promise(r=>setTimeout(r, 50));
  ok(JSON.parse(localStorage.getItem('yosakura_demo_faq') || '[]').length === 1, 'faqsetが無い同期でも既存の項目を保持する');
}

console.log('== ポジティブシャワー（8/10 構築MTG A-05：良かったことを横展開する）==');
{
  const KEY = '5000|' + S_HIROSHIMA;
  FETCH_ROWS = { ok:true, reports:[
    { kind:'community', store:S_HIROSHIMA, item:'guest', note: JSON.stringify({ body:'お誕生日に一言添えたら喜ばれました', by:'倉谷' }), t:5000, id:'c1' },
    { kind:'commmod', store:S_HIROSHIMA, item:KEY, note: JSON.stringify({ state:'published' }), t:5001, id:'c2' },
    { kind:'commroll', store:S_HIROSHIMA, item:KEY, note: JSON.stringify({ on:true }), t:5002, id:'c3' },
    { kind:'commtry', store:'手巻き寿司世桜 難波店', item:KEY, t:5003, id:'c4' },
  ]};
  try { run(()=> setLS('staff', S_HIROSHIMA, 'ja')); } catch(e){ FAIL++; console.log('  ✗ shower threw: '+e.message); }
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/community';
  const html = registry.app.innerHTML;
  ok(/ポジティブシャワー（横展開）/.test(html), '横展開のまとめが専用のかたまりで出る');
  ok(html.indexOf('ポジティブシャワー') < html.indexOf('<h3>みんなの投稿</h3>'), '横展開が通常のフィードより上に来る');
  ok(/取り入れた店舗/.test(html), '取り入れた店舗が見える（共感で終わらせない）');
  ok(/data-commtry/.test(html), '店舗は「うちでもやってみます」を押せる');
  ok(!/data-commroll/.test(html), 'スタッフには横展開の指定ボタンを出さない');

  run(()=> setLS('hq','all','ja'));
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/community';
  const hq = registry.app.innerHTML;
  ok(/data-commroll/.test(hq), '本部は横展開を指定できる');
  ok(/横展開中（解除）/.test(hq), '指定済みは解除できる状態で出る');
  ok(!/data-commtry/.test(hq), '本部には「うちでもやってみます」を出さない');

  // 実際の投稿に「見本」の札を付けない。
  // ※ 見本データはバックエンドに繋がっていないとき（撮影用のデモ）だけ入るため、ここでは到達しない。
  //   ここで守りたいのは「本物の投稿が見本と誤って表示されないこと」。
  ok(!/見本/.test(html), '本部から同期された実際の投稿には「見本」の札を付けない');

  // 公開前の投稿は横展開に出さない
  FETCH_ROWS = { ok:true, reports:[
    { kind:'community', store:S_HIROSHIMA, item:'guest', note: JSON.stringify({ body:'未承認の投稿' }), t:6000, id:'d1' },
    { kind:'commroll', store:S_HIROSHIMA, item:'6000|' + S_HIROSHIMA, note: JSON.stringify({ on:true }), t:6001, id:'d2' },
  ]};
  run(()=> setLS('staff', S_HIROSHIMA, 'ja'));
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/community';
  ok(!/未承認の投稿/.test(registry.app.innerHTML), '本部承認前の投稿は横展開にも出ない');
}

console.log('== 公開待ちの投稿を、本部の受信箱でも拾える ==');
{
  const PK = '7000|' + S_HIROSHIMA;
  FETCH_ROWS = { ok:true, reports:[
    { kind:'community', store:S_HIROSHIMA, item:'guest', note: JSON.stringify({ body:'承認前のエピソードです', by:'倉谷' }), t:7000, id:'p1' },
    { kind:'community', store:S_HIROSHIMA, item:'play',  note: JSON.stringify({ body:'こちらは公開済み' }), t:7100, id:'p2' },
    { kind:'commmod', store:S_HIROSHIMA, item:'7100|' + S_HIROSHIMA, note: JSON.stringify({ state:'published' }), t:7101, id:'p3' },
  ]};
  run(()=> setLS('hq','all','ja'));
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/inbox';
  const hq = registry.app.innerHTML;
  ok(/公開待ちの投稿/.test(hq), '受信箱に「公開待ちの投稿」が出る');
  ok(/承認前のエピソードです/.test(hq), '未公開の投稿の中身が受信箱で読める');
  ok(!/こちらは公開済み/.test(hq), '公開済みの投稿は受信箱に出ない（対応が要らないため）');
  ok(new RegExp('data-commpub="' + PK.replace('|','\\|') + '"').test(hq), '受信箱からそのまま公開できる');
  ok(/data-commhide/.test(hq), '受信箱から「公開しない」も選べる');
  ok(!new RegExp('data-ackdone="[^"]*commpend').test(hq), '「対応済み」では消せない（未公開のまま埋もれないように）');

  // 店長は受信箱に入れない（画面ごと開けない）
  run(()=> setLS('manager', S_HIROSHIMA, 'ja'));
  await new Promise(r=>setTimeout(r, 50));
  location.hash = '#/app/inbox';
  const mg = registry.app.innerHTML;
  ok(!/承認前のエピソードです/.test(mg), '店長には未公開の投稿が見えない');
  ok(!/data-commpub/.test(mg), '店長には公開ボタンが出ない');
}

console.log('== どの画面にも左上に「ホームへ戻る」がある ==');
{
  FETCH_ROWS = { ok:true, reports:[] };
  for (const [role, store] of [['staff', S_HIROSHIMA], ['manager', S_HIROSHIMA], ['owner', S_HIROSHIMA], ['hq', 'all']]) {
    run(()=> setLS(role, store, 'ja'));
    await new Promise(r=>setTimeout(r, 30));
    // タブ一覧の画面（報告・学ぶ・その他・本部）
    const tabs = role === 'hq' ? ['genba','learn','other','hq'] : ['genba','learn','other'];
    for (const t of tabs) {
      location.hash = '#/home?tab=' + t;
      ok(/id="backBtn"/.test(registry.app.innerHTML), `${role}：${t}タブに「ホーム」がある`);
    }
    // ホームだけは出さない（そこがホームのため）
    location.hash = '#/home';
    ok(!/id="backBtn"/.test(registry.app.innerHTML), `${role}：ホームには出さない`);
    // 機能の画面（従来から出ている）
    location.hash = '#/app/faq';
    ok(/id="backBtn"/.test(registry.app.innerHTML), `${role}：機能の画面にも引き続きある`);
  }
}

console.log('== チェックリスト：最後まで終えたときだけ提出済みになる（2026-08-12 の3件）==');
{
  /* 神田さんのご指摘3件
     ①「開いて提出」を押すと、前に見ていた種類（アイドル）が開いてしまう
     ② 1項目チェックするたびに画面の先頭へ戻る
     ③ 途中までしか終わっていないのに提出済みになる  */
  const S = S_HIROSHIMA;

  // ① 5種類それぞれに「どれを開くか」が付いている
  run(() => setLS('manager', S, 'ja'));
  location.hash = '#/app/kyou';
  const html = registry.app.innerHTML;
  for (const [name, mode] of [['オープン','open'], ['アイドル','idle'], ['クローズ','close'], ['桜','sakura'], ['定期衛生','hygiene']]) {
    ok(new RegExp(`data-tsubmode="${mode}"`).test(html), `${name}の提出ボタンが、開く種類（${mode}）を持っている`);
  }
  ok(/localStorage\.setItem\('yosakura_ckmode', t\.dataset\.tsubmode\)/.test(code),
     '押したときに、その種類へ切り替えてから画面を開く');

  // ② チェックしても画面の先頭へ戻らない（読んでいた位置を保つ）
  ok(/render\(true\);\s*\n\s*postReport\(\{ kind:'ckdone'/.test(code),
     'チェックのたびに先頭へ戻らない（位置を保って描き直す）');

  // ③ 全部終わるまで提出済みにしない
  const app3 = run(() => {
    setLS('manager', S, 'ja');
    // オープンの1項目だけチェックした状態を作る
    const today = new Date().toLocaleDateString('en-CA');
    localStorage.setItem('yosakura_demo_ckdone', JSON.stringify({ [`${S}||open||${today}`]: { 'open-c-0-0': true } }));
  });
  location.hash = '#/app/kyou';
  ok(/オープンチェックリスト/.test(registry.app.innerHTML), '途中までのオープンチェックリストは「今日出すもの」に残る');
  ok(/data-tsubmode="open"/.test(registry.app.innerHTML), '残っているので、続きを開くボタンも出ている');

  // 数え方が画面と判定で同じであること（消した独自項目や別の曜日が混ざらない）
  ok(/const ckTotalOf = \(store, mode\) => ckIdsOf\(store, mode\)\.length;/.test(code),
     '件数の数え方が1か所（ckIdsOf）に集約されている');
  ok(/if \(m\.detect === 'ckdone'\) return ckAllDoneOf\(/.test(code),
     '提出済みの判定は「全部終わったか」を見ている');

  // ④ 定期衛生：画面で別の曜日を見ていても、提出済みの判定は「今日の曜日」で行う
  {
    const today = new Date().toLocaleDateString('en-CA');
    const other = (new Date().getDay() + 3) % 7;           // 今日とは違う曜日
    const app = run(() => {
      setLS('manager', S, 'ja');
      localStorage.setItem('yosakura_ckmode', 'hygiene');
      localStorage.setItem('yosakura_hygday', `${today}|${other}`); // 別の曜日を選んだ状態
    });
    location.hash = '#/app/checklist';
    // 表示中（＝別の曜日）の項目を全部チェックした状態を作る
    const shown = [...registry.app.innerHTML.matchAll(/data-ck="([^"]+)"/g)].map(m => m[1]);
    ok(shown.length > 0 && shown.every(id => id.startsWith(`hygiene-${other}`)),
       `画面には選んだ曜日（${other}）の項目が出る`);
    const done = {}; shown.forEach(id => done[id] = true);
    localStorage.setItem('yosakura_demo_ckdone', JSON.stringify({ [`${S}||hygiene||${today}`]: done }));
    location.hash = '#/home'; location.hash = '#/app/kyou';
    const row = (h, name) => { const i = h.indexOf(name); return i < 0 ? '' : h.slice(Math.max(0, i - 240), i + 240); };
    ok(!/提出済/.test(row(registry.app.innerHTML, '定期衛生管理')),
       '別の曜日を終えても、今日の分は提出済みにならない');
  }
}

console.log('== 気づきの報告を、日報から切り離して1日の最後に置く（2026-08-12）==');
{
  /* 神田さんのご指摘：日報の中に「清掃・特記事項」があり、気づきの報告と同じことを
     2か所へ書く形になっていた。日報側を外し、気づきの報告へ一本化する。 */
  const S5 = '日本鰻世桜 浅草橋店';

  // 日報から自由入力の欄が消えている
  const sk = renderView('soukatsu', 'manager', S5, 'ja');
  ok(!/清掃・特記事項/.test(sk), '日報から「清掃・特記事項」の欄を外した');
  ok(!/id="sk_note"/.test(sk), '入力欄そのものが無い');
  ok(/翌日の食材発注/.test(sk), '他の欄（翌日の食材発注など）はそのまま残っている');
  ok(!/v\('sk_note'\)/.test(code), '保存するときも、無くなった欄を読みにいかない');

  // 気づきの報告が、日次業務のいちばん最後に並ぶ
  run(() => setLS('manager', S5, 'ja'));
  location.hash = '#/app/kyou';
  const kyouHtml = registry.app.innerHTML;
  ok(/気づきの報告/.test(kyouHtml), '日次業務に「気づきの報告」が出る');
  const iNippou = kyouHtml.indexOf('日報');
  const iKizuki = kyouHtml.indexOf('気づきの報告');
  ok(iKizuki > iNippou && iNippou >= 0, '日報より後ろ＝1日の最後に並んでいる');

  // 出したら提出済みになる
  FETCH_ROWS = { ok:true, reports:[
    { kind:'kizuki', store:S5, item:'other', note:'閉店後の気づきです', photos:[], t: Date.now(), id:'kz1' },
  ]};
  try { run(() => setLS('manager', S5, 'ja')); } catch (e) { FAIL++; console.log('  ✗ kizuki detect threw: ' + e.message); }
  await new Promise(r => setTimeout(r, 50));
  location.hash = '#/app/kyou';
  const h5 = registry.app.innerHTML;
  const j = h5.indexOf('気づきの報告');
  ok(/提出済/.test(h5.slice(Math.max(0, j - 260), j + 260)), 'その日に1件出せば提出済みになる');
  FETCH_ROWS = { ok:false };
}

console.log('== 「報告する」タブに、日次・週次・月次と同じものを並べない（2026-08-12）==');
{
  /* 神田さんのご指摘：報告するタブに、日次業務で出てくる項目がそのまま並んでいて二重に見えた。
     ★消すだけだと、提出が済んだあとに開けなくなる。先に「提出済みでも開ける」ようにしてから外す。 */
  const S4 = '日本鰻世桜 浅草橋店';
  run(() => setLS('manager', S4, 'ja'));
  location.hash = '#/home?tab=genba';
  const tab = registry.app.innerHTML;
  ok(!/data-open="checklist"/.test(tab), 'チェックリストは報告タブに並べない（日次業務から開く）');
  ok(!/data-open="openphoto"/.test(tab), '写真の提出も報告タブに並べない（日次・月次業務から開く）');

  /* ★重複を機械的に検査する（2026-08-12）。
     これから提出物が増えても、タブに同じものを並べてしまったら自動で気づけるようにする。
     一つずつ目で確かめると、今回のように見落とす。 */
  const opened = new Set();
  for (const v of ['kyou', 'shukan', 'getsuji']) {
    run(() => setLS('manager', S4, 'ja'));
    location.hash = '#/app/' + v;
    [...registry.app.innerHTML.matchAll(/data-tsub="([a-zA-Z_]+)"/g)].forEach(m => opened.add(m[1]));
  }
  ok(opened.size >= 3, `日次・週次・月次から開く画面を拾えている（${[...opened].join(',')}）`);
  run(() => setLS('manager', S4, 'ja'));
  location.hash = '#/home?tab=genba';
  const tabIds = [...registry.app.innerHTML.matchAll(/data-open="([a-zA-Z_]+)"/g)].map(m => m[1]);
  const dup = tabIds.filter(id => opened.has(id));
  ok(dup.length === 0, `タブに、日次・週次・月次と同じものが残っていない${dup.length ? '（重複: ' + dup.join(',') + '）' : ''}`);

  /* 日次・週次・月次そのものも、ホームに常に出ているのでタブには並べない（2026-08-12）。
     ホーム＝今日やること／報告する＝気づいたときに出すもの、と役割を分ける。 */
  ['kyou', 'shukan', 'getsuji'].forEach(id => {
    ok(!tabIds.includes(id), `${id} は報告タブに並べない（ホームから開く）`);
  });
  run(() => setLS('manager', S4, 'ja'));
  location.hash = '#/home';
  const homeIds = [...registry.app.innerHTML.matchAll(/data-open="([a-zA-Z_]+)"/g)].map(m => m[1]);
  ['kyou', 'shukan', 'getsuji'].forEach(id => {
    ok(homeIds.includes(id), `${id} はホームから必ず開ける（唯一の入口になるため）`);
  });

  /* ★ホームに常に出ているものも、タブに重ねない（2026-08-12 神田さんのご指摘）。
     みんなの投稿・緊急連絡・公益通報が、ホームとタブの両方に並んでいた。
     ここも機械的に検査して、これから増えても気づけるようにする。 */
  const dupHome = [...new Set(tabIds.filter(id => homeIds.includes(id)))];
  ok(dupHome.length === 0, `ホームに出ているものが、タブに重ねて並んでいない${dupHome.length ? '（重複: ' + dupHome.join(',') + '）' : ''}`);
  ['community', 'emergency', 'whistle'].forEach(id => {
    ok(homeIds.includes(id), `${id} はホームから必ず開ける（タブから外したため）`);
  });
  // 随時使うものは残す（提出物ではないため、ここが唯一の入口）
  ok(/data-open="tabemono"/.test(tab), '食べ残しの報告は残す（随時のため）');
  // 気づきの報告は 2026-08-12 に日次業務の最後へ移した（日報の「清掃・特記事項」と重複していたため）
  ok(!/data-open="kizuki"/.test(tab), '気づきの報告はタブに並べない（日次業務の最後から開く）');
  // 随時使うもののうち、ホームに出ていないものだけがタブに残る
  ok(/data-open="tabemono"/.test(tab) && /data-open="history"/.test(tab),
     'タブに残るのは、ホームにも日次業務にも出ていないものだけ');

  // 外した先（日次業務）から、提出が済んだあとでも開ける
  const today3 = new Date().toLocaleDateString('en-CA');
  FETCH_ROWS = { ok:true, reports:[
    { kind:'subrec', store:S4, item:`openphoto|${today3}`, note: JSON.stringify({ by:'店長（山田）' }), photos:['x'], t: Date.now(), id:'o1' },
  ]};
  try { run(() => setLS('manager', S4, 'ja')); } catch (e) { FAIL++; console.log('  ✗ reopen threw: ' + e.message); }
  await new Promise(r => setTimeout(r, 50));
  location.hash = '#/app/kyou';
  const kh = registry.app.innerHTML;
  const i = kh.indexOf('オープン写真');
  const around = i < 0 ? '' : kh.slice(Math.max(0, i - 300), i + 300);
  ok(/提出済/.test(around), 'オープン写真が提出済みになっている');
  ok(/data-tsubphoto="openphoto"/.test(around), '提出が済んだあとも、そこから開き直せる');
  FETCH_ROWS = { ok:false };
}

console.log('== いいね／うちでもやってみます は、押し間違えても取り消せる（2026-08-12）==');
{
  /* バックエンドは追記だけで行を消せないため、取り消しは「取り消した」という記録を足して表す。
     いいね＝-1として合算／やってみます＝投稿×店舗ごとに最新が正。 */
  const S3 = '牛カツ世桜 長堀橋店';
  const t0 = Date.now() - 3600e3;
  const key = `${t0}|${S3}`;

  // 押した記録のあとに、取り消しの記録が来たら消える
  FETCH_ROWS = { ok:true, reports:[
    { kind:'comm', store:S3, item:'guest', note:'お客様が喜ばれました', photos:[], t:t0, id:'c1' },
    { kind:'commmod', store:S3, item:key, note: JSON.stringify({ state:'published' }), t:t0+1, id:'c2' },
    { kind:'commlike', store:S3, item:key, t:t0+2, id:'c3' },
    { kind:'commlike', store:S3, item:key, t:t0+3, id:'c4' },
    { kind:'commlike', store:S3, item:key, note: JSON.stringify({ off:true }), t:t0+4, id:'c5' },
    { kind:'commtry', store:'日本鰻世桜 浅草橋店', item:key, t:t0+5, id:'c6' },
    { kind:'commtry', store:'日本鰻世桜 浅草橋店', item:key, note: JSON.stringify({ on:false }), t:t0+6, id:'c7' },
    { kind:'commtry', store:'寿司世桜 心斎橋店', item:key, t:t0+7, id:'c8' },
  ]};
  try { run(() => setLS('manager', S3, 'ja')); } catch (e) { FAIL++; console.log('  ✗ comm undo threw: ' + e.message); }
  await new Promise(r => setTimeout(r, 60));
  const likes = JSON.parse(localStorage.getItem('yosakura_demo_commlike') || '{}');
  ok(likes[key] === 1, `いいね2件のうち1件を取り消すと1件になる（いま ${likes[key]}）`);
  const tries = JSON.parse(localStorage.getItem('yosakura_demo_commtry') || '{}');
  ok(!(tries[key] || []).includes('日本鰻世桜 浅草橋店'), '取り消した店舗は「取り入れた店舗」から外れる');
  ok((tries[key] || []).includes('寿司世桜 心斎橋店'), '取り消していない店舗はそのまま残る');

  // 取り消しが多くても、件数が負にならない
  FETCH_ROWS = { ok:true, reports:[
    { kind:'commlike', store:S3, item:key, note: JSON.stringify({ off:true }), t:t0+8, id:'c9' },
    { kind:'commlike', store:S3, item:key, note: JSON.stringify({ off:true }), t:t0+9, id:'c10' },
  ]};
  try { run(() => setLS('manager', S3, 'ja')); } catch (e) { FAIL++; console.log('  ✗ comm minus threw: ' + e.message); }
  await new Promise(r => setTimeout(r, 60));
  const likes2 = JSON.parse(localStorage.getItem('yosakura_demo_commlike') || '{}');
  ok((likes2[key] || 0) >= 0, `取り消しが多くても件数が負にならない（いま ${likes2[key]}）`);

  // 画面：押したあとのボタンが押せないままにならない（取り消せる）
  ok(!/data-commlike="[^"]*"\s+disabled/.test(code), 'いいねのボタンを押せないままにしない');
  ok(!/data-commtry="[^"]*"\$\{done \? ' disabled' : ''\}/.test(code), 'やってみますのボタンも押せないままにしない');
  FETCH_ROWS = { ok:false };
}

console.log('== 月次・週次の提出物もアプリで出せる（2026-08-12 神田さんのご指摘）==');
{
  /* 以前は「アプリで受けていないので、グループLINEへ送ってください」という項目が残っていた。
     写真を出す・実施したと伝える、という中身はすでにある仕組みと同じなので、アプリで受けるようにした。 */
  const S = '日本鰻世桜 浅草橋店';

  // 写真で出すもの＝同じ画面で、どれを出すかを渡して開く
  const mt = renderView('getsuji', 'manager', S, 'ja');
  ok(/data-tsubphoto="hygiene_m"/.test(mt), '月次の定期衛生を、写真の提出画面へ正しく渡して開く');
  ok(/data-tsubphoto="menubook"/.test(mt), 'メニューブックの確認も、同じ画面へ正しく渡して開く');

  // 開いた画面が、その提出物のものになっている（オープン写真のままにならない）
  const app = run(() => { setLS('manager', S, 'ja'); localStorage.setItem('yosakura_photo_target', 'menubook'); });
  location.hash = '#/app/openphoto';
  const ph = registry.app.innerHTML;
  ok(/メニューブック/.test(ph), '写真の画面の見出しが、選んだ提出物になっている');
  ok(/並べて/.test(ph), 'その提出物に合った撮り方の案内が出る');
  ok(/data-phtarget="openphoto"/.test(ph), '画面の中でも提出物を切り替えられる');

  // 実施するだけのもの＝その場で「実施しました」を押せる
  const gyu = renderView('shukan', 'manager', '牛カツ世桜 長堀橋店', 'ja'); // 週次は「今週出すもの」
  ok(/data-tdid="pop_week"/.test(gyu), '卓上POPの交換に「実施しました」が出る（牛カツは週1）');
  ok(/実施しました/.test(gyu), 'ボタンの文言が出ている');

  /* コンプラチェック＝案②：本部が設定したシートへの入口を出すだけ。
     ★何をチェックするのかは本部が配るもの。アプリの中に回答画面は作らない。 */
  {
    const S2 = '日本鰻世桜 浅草橋店';
    // URLが未設定のうちは、ボタンを出さない（押しても何も無い状態を作らない）
    const before = renderView('getsuji', 'manager', S2, 'ja'); // 四半期の提出物は月次業務に並ぶ
    ok(!/シートを開く/.test(before), 'シートが未設定のうちは「シートを開く」を出さない');

    /* ★説明とボタンが食い違わないこと（2026-08-12 神田さんのご指摘）。
       「下のボタンから開けます」と書いてあるのにボタンが無い、という状態を作らない。 */
    const q = renderView('getsuji', 'manager', S2, 'ja');
    ok(!/ボタンから開けます|button below/.test(q), 'まだ無いボタンを、説明文で案内しない');
    ok(/本部がシートを用意すると/.test(q), '用意待ちであることが画面に出ている');

    // 本部が設定すると、店舗の画面に入口が出る（設定は全端末で共有される）
    FETCH_ROWS = { ok:true, reports:[] };
    run(() => setLS('hq', 'all', 'ja'));
    location.hash = '#/app/teishutsu';
    ok(/data-msturl="compliance"/.test(registry.app.innerHTML), '本部の画面に、シートの場所を入れる欄がある');

    // 場所が設定されたら、説明の代わりに「シートを開く」が出る
    // 本部が設定した状態を作る（提出物マスタは丸ごと最新版が正なので、確認したい1件だけで足りる）
    const withUrl = [{ id:'compliance', name:{ja:'コンプラチェック（4・7・10・1月）',en:'Compliance',vi:'Tuân thủ'},
      oblig:'required', freq:'quarterly', due:'23:59', target:'all', hqReview:'each', detect:'none',
      url:'https://docs.google.com/spreadsheets/d/demo',
      how:{ja:'本部が用意したシートに記入してください',en:'Fill in the sheet prepared by HQ',vi:'Điền vào bảng do HQ chuẩn bị'} }];
    FETCH_ROWS = { ok:true, reports:[
      { kind:'submaster', store:'*', item:'master', note: JSON.stringify(withUrl), t: Date.now(), id:'m1' },
    ]};
    try { run(() => setLS('manager', S2, 'ja')); } catch (e) { FAIL++; console.log('  ✗ sheet url threw: ' + e.message); }
    await new Promise(r => setTimeout(r, 50));
    location.hash = '#/app/getsuji'; // 四半期のものは月次業務に並ぶ
    const set2 = registry.app.innerHTML;
    ok(/シートを開く/.test(set2), '設定されたら「シートを開く」が出る');
    ok(!/本部がシートを用意すると/.test(set2), '用意待ちの案内は消える');
    FETCH_ROWS = { ok:false };
  }

  // 押した記録が残れば提出済みになる（記録の置き場は写真提出と同じ）
  const today2 = new Date().toLocaleDateString('en-CA');
  FETCH_ROWS = { ok:true, reports:[
    { kind:'subrec', store:'牛カツ世桜 長堀橋店', item:`pop_week|${today2}`, note: JSON.stringify({ by:'店長（山田）' }), photos:[], t: Date.now(), id:'d1' },
  ]};
  try { run(() => setLS('manager', '牛カツ世桜 長堀橋店', 'ja')); } catch (e) { FAIL++; console.log('  ✗ didit threw: ' + e.message); }
  await new Promise(r => setTimeout(r, 50));
  location.hash = '#/app/shukan';
  const row2 = (h, name) => { const i = h.indexOf(name); return i < 0 ? '' : h.slice(Math.max(0, i - 260), i + 260); };
  ok(/提出済/.test(row2(registry.app.innerHTML, '卓上POP')), '「実施しました」を押すと提出済みになる');
  FETCH_ROWS = { ok:false };
}

console.log('== 体験版（配る版）は、どう操作しても本物の記録に送らない ==');
{
  /* 2026-08-12 勉強会デモMTGの決定＝勉強会のあと加盟店の皆さまへお配りする版を用意する。
     いちばん大事なのは「触っても本物のデータに影響しない」こと。
     ここが壊れると、体験の入力が本物の履歴に混ざる（取り返しがつかない）ので、テストで固定する。 */
  const urlLine = code.match(/ {2}const API_URL_DEFAULT = '[^']*';/);
  ok(!!urlLine, 'app.js に API_URL_DEFAULT の行がある（体験版はこの行を空にして作る）');
  const taikenCode = code.replace(urlLine[0], "  const API_URL_DEFAULT = '';");

  // 体験版を、通信を見張った状態で動かす
  // ※ アプリは起動時に sw.js を読んで「最新の版かどうか」を確かめる。これは同じ場所の file なので数えない。
  //   見張るのは「外（http/https）へ出ていく通信」だけ。
  let sent = [];
  const spyFetch = (u) => { if (/^https?:/i.test(String(u))) sent.push(String(u)); return Promise.resolve({ json: () => Promise.resolve({ ok:false }), text: () => Promise.resolve('') }); };
  const called = () => sent.length;
  const runTaiken = (setup) => {
    store.clear(); registry.app = makeEl('div');
    Object.keys(registry).forEach(k => { if (k !== 'app') delete registry[k]; });
    Object.keys(winHandlers).forEach(k => delete winHandlers[k]);
    hashVal = ''; setup();
    const box = Object.assign({}, sandbox, { fetch: spyFetch });
    box.window = Object.assign({}, windowObj, { fetch: spyFetch });
    box.globalThis = box; box.self = box;
    vm.runInContext(code === taikenCode ? code : taikenCode, vm.createContext(box), { filename:'app-taiken.js' });
    return registry.app;
  };

  // 以前この端末で本番の接続先を入れていた人が開いても、そこへは送らない
  runTaiken(() => { setLS('manager', S_HIROSHIMA, 'ja'); localStorage.setItem('yosakura_api_url', 'https://example.com/exec'); });
  await new Promise(r => setTimeout(r, 40));
  ok(called() === 0, '端末に接続先が残っていても、外へは一度も送らない：' + sent.join(','));

  // 触っても大丈夫だと分かる帯が、どの画面にも出る
  ok(/taiken-band/.test(registry.app.innerHTML), 'ホームに体験版の帯が出る');
  location.hash = '#/app/checklist';
  ok(/taiken-band/.test(registry.app.innerHTML), '別の画面へ移っても帯が残る');

  // 配る版に、接続先を切り替える入口を残さない
  runTaiken(() => setLS('hq', 'all', 'ja'));
  location.hash = '#/home?tab=hq';
  ok(!/data-open="backend"/.test(registry.app.innerHTML), '本部で開いても「バックエンド設定」は出さない');
  location.hash = '#/app/backend';
  ok(called() === 0, '接続先の画面を直接開こうとしても、外への通信は起きない：' + sent.join(','));

  /* ★お客様アンケートの見本が、どの店舗で開いても出ること（2026-08-12 神田さんのご要望）。
     以前は1店舗ぶんしか無く、他の店舗の店長で開くと集計が空っぽだった。 */
  runTaiken(() => setLS('manager', '日本鰻世桜 浅草橋店', 'ja'));
  const sv = JSON.parse(localStorage.getItem('yosakura_demo_survey') || '[]');
  ok(sv.length >= 100, `見本のご回答が十分にある（${sv.length}件）`);
  const svStores = [...new Set(sv.map(r => r.store))];
  ok(svStores.length >= 8, `複数の店舗にまたがっている（${svStores.length}店舗）`);
  for (const st of ['日本鰻世桜 浅草橋店', '日本鰻世桜 富士山店', '和牛世桜 広島店']) {
    runTaiken(() => setLS('manager', st, 'ja'));
    location.hash = '#/app/survey';
    const h = registry.app.innerHTML;
    ok(/[0-9]\.[0-9]/.test(h), `${st}：平均満足度が出る`);
    ok(/いただいたご指摘/.test(h), `${st}：いただいたご指摘が出る`);
    ok(/お客様の声/.test(h), `${st}：お客様の声が出る`);
  }
  /* 見本の中身は毎回同じにする（開くたびに評価や件数が変わると、画面を説明できない）。
     日時だけは「いま」を基準に置くので、そこは比べない。 */
  const shape = (a) => JSON.stringify(a.slice(0, 5).map(r => ({ s:r.store, v:r.sat, n:r.note, c:r.country })));
  const first = shape(sv);
  runTaiken(() => setLS('manager', '日本鰻世桜 浅草橋店', 'ja'));
  const again = shape(JSON.parse(localStorage.getItem('yosakura_demo_survey') || '[]'));
  ok(first === again, '開き直しても見本の中身（評価・ご意見）が変わらない');

  /* ★以前この端末で開いた方にも、作り直した見本が届くこと（2026-08-12 神田さんのご指摘）。
     「すでに何か入っていたら作らない」ままだと、古い見本が残って集計が出ないままになる。 */
  runTaiken(() => {
    setLS('manager', '日本鰻世桜 浅草橋店', 'ja');
    localStorage.setItem('yosakura_demo_survey', JSON.stringify([{ store:'寿司世桜 心斎橋店', sat:5, route:'google', note:'', country:'Japan', t: Date.now() }]));
  });
  const refreshed = JSON.parse(localStorage.getItem('yosakura_demo_survey') || '[]');
  ok(refreshed.length >= 100, `古い見本が残っていても、新しい見本に入れ替わる（${refreshed.length}件）`);

  /* ★実在の店舗が「評価の低い例」として見えないこと（2026-08-12 神田さんのご指摘）。
     見本とはいえ、加盟店の皆さまが自店を見たときに落ち込む形にしない。 */
  const avgBy = {};
  refreshed.forEach(r => { (avgBy[r.store] = avgBy[r.store] || []).push(r.sat); });
  const avgs = Object.entries(avgBy).map(([st, v]) => [st, v.reduce((a, b) => a + b, 0) / v.length]);
  const worst = avgs.sort((a, b) => a[1] - b[1])[0];
  ok(worst[1] >= 4.0, `いちばん低い店舗でも平均4.0以上（${worst[0]} ${worst[1].toFixed(2)}）`);
  const asakusa = avgBy['日本鰻世桜 浅草橋店'] || [];
  ok(asakusa.length > 0 && !asakusa.some(v => v <= 3), '浅草橋店に低い評価を入れていない');
  ok(refreshed.some(r => r.sat <= 3), '低い評価そのものは残す（低い順に出る機能を説明できるように）');

  /* ★過去の日次・月次のデータが見えること（2026-08-12 神田さんのご要望）。
     「過去のデータがどう表示されるのか」を見せるため。以前は日報が2件しか無く、
     履歴も個店カルテも月次の推移も、ほぼ空のままだった。 */
  runTaiken(() => setLS('manager', '日本鰻世桜 浅草橋店', 'ja'));
  const skAll = JSON.parse(localStorage.getItem('yosakura_demo_soukatsu') || '[]');
  const moAll = JSON.parse(localStorage.getItem('yosakura_demo_monthly') || '[]');
  ok(skAll.length >= 300, `過去の日報が十分にある（${skAll.length}件）`);
  ok(moAll.length >= 40, `過去の月次が十分にある（${moAll.length}件）`);
  const myDays = skAll.filter(r => r.store === '日本鰻世桜 浅草橋店');
  ok(myDays.length >= 30, `自店の日報が何日ぶんもある（${myDays.length}日）`);
  ok(myDays.every(r => Number(r.sales) > 0 && Number(r.guests) > 0), '売上と客数がすべて入っている');
  ok(myDays.every(r => /^\d+\.\d$/.test(String(r.food))), '原価率も入っている');
  const myMonths = [...new Set(moAll.filter(r => r.store === '日本鰻世桜 浅草橋店').map(r => r.ym))];
  ok(myMonths.length >= 5, `月次が複数の月にまたがる（${myMonths.join(',')}）`);

  // 画面に過去の日付が並ぶ（履歴・日報の画面）
  location.hash = '#/app/soukatsu';
  ok(/20\d\d-\d\d-\d\d/.test(registry.app.innerHTML), '日報の画面に過去の日付が出る');
  location.hash = '#/store?s=' + encodeURIComponent('日本鰻世桜 浅草橋店');
  ok(registry.app.innerHTML.length > 5000, '個店カルテに中身が出る');

  /* ★見本の版は「見本ごと」に持つこと。
     1つの印を共有すると、最初に走った見本が印を付けた時点で後続が作られない
     （2026-08-13 実際に起きた。サーベイの見本が入らなくなった）。 */
  ok(/const seedFresh = \(name\)/.test(code), '見本の版を見本ごとに見分けている');
  runTaiken(() => {
    setLS('manager', '日本鰻世桜 浅草橋店', 'ja');
    // 全部の見本が古い状態を作る
    ['survey', 'links', 'study', 'soukatsu', 'monthly'].forEach(k => localStorage.setItem('yosakura_demo_' + (k === 'links' ? 'links' : k), '[]'));
  });
  const after = ['yosakura_demo_survey', 'yosakura_demo_links', 'yosakura_demo_study', 'yosakura_demo_soukatsu', 'yosakura_demo_monthly']
    .map(k => (JSON.parse(localStorage.getItem(k) || '[]') || []).length);
  ok(after.every(n => n > 0), `古い見本が残っていても、5種すべてが作り直される（${after.join(',')}）`);

  /* ★マニュアルと勉強会が、体験版でも中身のある状態で見えること（2026-08-12 神田さんのご要望）。
     ただし配る版なので、①本部の資料URLは載せない ②加盟店の側では直せない。 */
  runTaiken(() => setLS('manager', '日本鰻世桜 浅草橋店', 'ja'));
  location.hash = '#/app/manual';
  const man = registry.app.innerHTML;
  ok((man.match(/mrow--sub/g) || []).length >= 15, `マニュアルに資料が並んでいる（${(man.match(/mrow--sub/g) || []).length}件）`);
  ok(!/data-openurl=""/.test(man), '押しても空のタブが開く行を作っていない');
  /* 2026-08-12：本部が実際に登録されている資料（リンク先つき）を入れた。
     公式ドライブの権限で守られているため、権限のない方には開けない、という前提。 */
  ok(/閲覧専用で開く/.test(man), '資料がその場で開ける状態になっている');
  ok((man.match(/data-openurl="https/g) || []).length >= 20,
     `リンク先が入っている（${(man.match(/data-openurl="https/g) || []).length}件）`);
  ok(/\/preview/.test(man), '加盟店の側では閲覧専用で開く（編集画面に入らない）');
  ok(!/資料リンクの管理/.test(man), '加盟店の側に、資料を直す入口を出さない');

  location.hash = '#/app/study';
  const stu = registry.app.innerHTML;
  // プレビューに実際に登録されている回と同じ（2026年6月・7月）＋今月
  ['2026年6月勉強会', '2026年7月勉強会', '2026年8月勉強会'].forEach(m => {
    ok(stu.includes(m), `勉強会の「${m}」が出る`);
  });
  ok(/アジェンダスライド/.test(stu), '登録されている資料の名前も出る');
  ok(!/data-studyedit/.test(stu) && !/studyForm/.test(stu), '加盟店の側では、勉強会を直せない');

  /* ★本部以外が開くリンクは、必ず閲覧専用にする（2026-08-13 神田さんのご指摘）。
     勉強会のアジェンダが編集できる状態になっていた。マニュアルだけ変換しており、
     勉強会・サーベイの資料・提出物のシートは編集画面のまま開いていた。
     「画面から直せない」だけでは足りない。開いた先で直せてしまう。 */
  for (const role of ['staff', 'manager', 'owner']) {
    runTaiken(() => setLS(role, '日本鰻世桜 浅草橋店', 'ja'));
    let edit = 0, ro = 0;
    for (const v of ['study', 'manual', 'survey', 'getsuji']) {
      location.hash = '#/app/' + v;
      const h = registry.app.innerHTML;
      edit += (h.match(/data-openurl="[^"]*\/edit/g) || []).length;
      ro += (h.match(/data-openurl="[^"]*\/preview/g) || []).length;
    }
    ok(edit === 0, `${role}：編集画面で開くリンクが1つも無い（${edit}件）`);
    ok(ro > 0, `${role}：閲覧専用で開くリンクがある（${ro}件）`);
  }
  ok(/const openUrlFor = \(u\) => \(getRole\(\) === 'hq'/.test(code),
     '閲覧専用にするかどうかの判断が1か所にまとまっている');

  /* ★体験版は保存先を持たないので、アプリからご意見を送っても本部へは届かない。
     それなのに「送信しました」と出していた（2026-08-13 神田さんのご指摘）。
     届いたと思ったまま待たれるのがいちばん困る。届かないことを、送る前に伝える。 */
  runTaiken(() => setLS('manager', '日本鰻世桜 浅草橋店', 'ja'));
  location.hash = '#/app/appfb';
  const fb = registry.app.innerHTML;
  /* ★2026-08-13 神田さんのご判断：受け皿を1つにする。
     体験版はアプリの中で受けず、Googleフォームへの入口だけを出す。
     （アプリの中に入力欄があると「送れたのに届かない」状態になる） */
  ok(!/送信する/.test(fb), '体験版では「送信する」ボタンを出さない');
  ok(!/id="fb_note"/.test(fb), '体験版にはご意見の入力欄そのものが無い');
  ok(!/全端末で共有されます/.test(fb), '届く前提の説明を出さない');
  ok(/ご意見フォームを開く|フォームは準備中/.test(fb), 'フォームへの入口（または準備中の案内）が出ている');
  ok(/お店の記録には送られません/.test(fb), '体験版であることを、この画面でも伝えている');
  ok(/const TAIKEN_FORM_URL/.test(code), 'フォームのURLを入れる場所が1か所にある');
  ok(/7DAYS 1日目/.test(man), 'マニュアルも、実際に登録されている資料と同じ並びになっている');

  /* ★月例MTGを、自店のスタッフさんもアーカイブとして見られる（2026-08-12 神田さんのご要望）。
     実施は一部の店舗でも、これから始める店舗が過去の回を見られるようにしておく。 */
  runTaiken(() => setLS('staff', '日本鰻世桜 浅草橋店', 'ja'));
  location.hash = '#/app/mtg';
  const mtgS = registry.app.innerHTML;
  ok(mtgS.length > 1000, 'スタッフでも月例MTGの中身が見える');
  ok(!/<input|<textarea/.test(mtgS), 'スタッフの画面には入力欄を出さない（見るだけ）');

  /* ★体験版は「加盟店の皆さまが使う3つの役割」だけ（2026-08-12 神田さんのご判断）。
     本部の画面は加盟店の方には関係がなく、見えると話が逸れる。 */
  runTaiken(() => setLS('hq', 'all', 'ja')); // 端末に本部が残っている状態で開く
  location.hash = '#/home';
  const th = registry.app.innerHTML;
  ok(!/data-tab="hq"/.test(th), '端末に本部が残っていても、本部タブは出さない');
  ok(/店長|オーナー|店舗iPad/.test(th), '店舗側の役割として開いている');
  location.hash = '#/app/teishutsu';
  ok(!/加盟店・提出物管理|提出物マスタ/.test(registry.app.innerHTML), '本部の画面を直接開いても中身を出さない');
  location.hash = '#/app/dashboard';
  ok(!/本部ダッシュボード/.test(registry.app.innerHTML), '本部ダッシュボードも出さない');

  // 役割を選ぶ画面に本部が並ばない
  runTaiken(() => setLS('manager', S_HIROSHIMA, 'ja'));
  ok(/const roleKeys = \(\) => TAIKEN \? \['staff', 'manager', 'owner'\]/.test(code),
     '選べる役割が、体験版では店舗側の3つに限られている');

  // 通常版（いまのビルド）は、これまでどおり接続する
  FETCH_ROWS = { ok:true, reports:[] };
  ok(/const API_URL_DEFAULT = 'https:/.test(code), '通常版のビルドは接続先を持ったまま（体験版はビルド時にだけ空にする）');
}

console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
