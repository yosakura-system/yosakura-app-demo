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
/* 画面ごとの「縦に積まれたカード数」を数える（タブ分けの対象を洗い出す・2026-09-18） */
const src = code;
const ids = [...new Set([...src.matchAll(/APP_VIEWS\.(\w+)\s*=/g)].map(m => m[1]))];
const count = (h) => ({ cards: (h.match(/<div class="card[ "]/g) || []).length, len: h.length, tabs: (h.match(/data-(seg|\w*tab)=/g) || []).length });
const out = [];
for (const role of ['hq', 'manager', 'staff']) {
  const st = role === 'hq' ? 'all' : '牛カツ世桜 長堀橋店';
  for (const id of ids) { const h = renderView(id, role, st, 'ja'); if (!h) continue; const c = count(h); if (c.cards >= 3) out.push([role, id, c.cards, c.tabs, c.len]); }
  // ホーム
  for (const tab of ['home', 'genba', 'learn', 'other']) { const app = run(() => { setLS(role, st, 'ja'); }); location.hash = tab === 'home' ? '#/home' : '#/home?tab=' + tab; const c = count(registry.app.innerHTML); out.push([role, 'HOME/' + tab, c.cards, c.tabs, c.len]); }
}
out.sort((a, b) => b[2] - a[2]);
console.log(out.map(x => x.join(' | ')).join('\n'));
console.log('=== card titles ===');
for (const [role, id] of [['hq','checklist'],['manager','emergency'],['hq','faq'],['hq','mtg'],['hq','handover'],['hq','openphoto'],['hq','backend']]) {
  const h = renderView(id, role, role === 'hq' ? 'all' : '牛カツ世桜 長堀橋店', 'ja');
  const titles = [...h.matchAll(/<div class="card[^"]*"[^>]*>\s*(?:<[^>]+>\s*)*?<h3[^>]*>([^<]{1,40})/g)].map(m => m[1]);
  console.log(role, id, titles.length, titles.join(' / ').slice(0, 300));
}
for (const role of ['hq','manager']) { const app = run(() => { setLS(role, role==='hq'?'all':'牛カツ世桜 長堀橋店', 'ja'); }); location.hash = '#/home'; const h = registry.app.innerHTML;
  const titles = [...h.matchAll(/class="(?:card[^"]*|news-card[^"]*|homelink)"[^>]*>[\s\S]{0,400}?(?:<h3[^>]*>|<div class="l1">|<b>)([^<]{1,40})/g)].map(m => m[1]);
  console.log('HOME', role, titles.length, titles.join(' / ').slice(0, 600)); }
