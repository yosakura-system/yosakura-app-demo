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
      run(() => { setLS(role, storeSel, 'ja'); localStorage.setItem('yosakura_sub_master_v1', JSON.stringify(M)); });
      location.hash = '#/app/' + appId; html = registry.app.innerHTML;
    } catch (e) { FAIL++; console.log(`  ✗ ${appId}/${role} threw: ` + e.message); }
    return html;
  };
  // 牛カツ店：今日=週次POPが出る／四半期・月次は出ない
  const gk_kyou = renderWith('kyou', 'manager', S_GYUKATSU);
  ok(/卓上POP交換_週/.test(gk_kyou), '牛カツ/今日：週次POP（今週）が出る');
  ok(!/コンプラチェック/.test(gk_kyou), '牛カツ/今日：四半期は今日に出ない');
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
  ok(/data-mcatstep=/.test(html), '各資料に大項目◀▶スライド切替が出る');
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
  location.hash = '#/app/manual';
  const html = registry.app.innerHTML;
  ok(/data-openurl=/.test(html), 'マニュアルに資料のタップ開くリンクが出る');
  ok(/世桜とは/.test(html) && /ハウスルール/.test(html), '理念/7DAYSに対応資料が紐づく');
}
FETCH_ROWS = { ok:false };

console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL ? 1 : 0);
