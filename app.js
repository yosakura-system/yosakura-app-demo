/* ===================================================================
   世桜アプリ（デモ） app.js
   1つの窓口 → 中に多数の業務アプリ → 権限で出し分け → すべてここで管理
   フレームワーク不使用のバニラJS・静的PWA（GitHub Pagesで無料公開可）
   ※これはデモ。データはこの端末内(localStorage)にのみ保存。本番はGAS+スプレッドシート等に接続する想定。
=================================================================== */
(() => {
  'use strict';

  /* ---------- SVGアイコン ---------- */
  const I = {
    food:   '<path d="M4 3v7a3 3 0 0 0 3 3v8M9 3v7M7 3v7M17 3c-1.5 0-3 2-3 6 0 2 1 3 3 3v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    check:  '<path d="M9 5h9M9 12h9M9 19h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 5l1.2 1.2L7.5 4M4 12l1.2 1.2L7.5 11M4 19l1.2 1.2L7.5 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    book:   '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 4v16" stroke="currentColor" stroke-width="1.8"/>',
    star:   '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    table:  '<rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M3.5 14.5h17M9 9.5v10M15 9.5v10" stroke="currentColor" stroke-width="1.5"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    yen:    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 8l3.5 4 3.5-4M12 12v5M9.5 13h5M9.5 15.2h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    gauge:  '<path d="M4 15a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 15l4-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/>',
    inbox:  '<path d="M4 13l2-7h12l2 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 13h4l1 2h6l1-2h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    video:  '<rect x="3.5" y="6.5" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 10l5-2.5v9L15.5 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    home:   '<path d="M4 11l8-6.5L20 11M6 9.5V19h12V9.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    report: '<path d="M7 4h7l4 4v12H7z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M13 4v5h5M10 13h5M10 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    grad:   '<path d="M12 4l9 4-9 4-9-4 9-4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M6 10v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    hq:     '<path d="M4 20V9l8-5 8 5v11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 20v-6h6v6M10.5 10.5h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    lock:   '<rect x="5" y="10.5" width="14" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    tick:   '<path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    chev:   '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    back:   '<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    add:    '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    mtg:    '<circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 18c0-2.4 2-3.9 4.5-3.9 1.2 0 2.3.35 3.1.95M12.9 15.05c.8-.6 1.9-.95 3.1-.95 2.5 0 4.5 1.5 4.5 3.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    task:   '<rect x="4.5" y="3.5" width="15" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8.5l1.2 1.2L11.5 7M8 14.5l1.2 1.2L11.5 13M14 9h3.2M14 15h3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    invoice:'<path d="M6.5 3h8l3.5 3.5V21l-2-1-2 1-2-1-2 1-2-1-2 1V3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8.5h6M9 11.5h6M9 14.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    hr:     '<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 19c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;

  /* ---------- 役割（権限）---------- */
  const ROLES = {
    staff:   { label: 'スタッフ',       mark: '員', desc: '加盟店・直営店の現場スタッフ' },
    manager: { label: '店長',           mark: '長', desc: '店舗の店長・管理者' },
    owner:   { label: '加盟店オーナー', mark: '主', desc: '加盟店のオーナー様' },
    hq:      { label: '本部',           mark: '本', desc: '世桜 本部（経営・高原社長ら）' }
  };

  /* ---------- 店舗マスター（実在店舗・公式サイト＋内部資料より）---------- */
  const STORES = [
    '日本料理世桜 心斎橋（おまかせ）', '寿司世桜 心斎橋店',
    '牛カツ世桜 長堀橋店', '日本鰻世桜 長堀橋店', '手巻き寿司世桜 難波店',
    '牛カツ世桜 富士山店', '日本鰻世桜 富士山店',
    '日本鰻世桜 京都祇園店', '日本鰻世桜 浅草橋店', '和牛世桜 広島店',
    '牛カツ世桜 ハノイ店', '日本鰻世桜 ホーチミン1号店'
  ];

  /* ---------- アプリ登録（この配列を増やすほど"窓口の中身"が増える）---------- */
  const APPS = [
    { id:'tabemono', group:'現場業務',  icon:'food',    name:'食べ残し・食材ロス報告', desc:'お客様の残し／食材ロスを記録', roles:['staff','manager','owner','hq'], live:true },
    { id:'firstphoto',group:'現場業務', icon:'camera',  name:'一食目写真の報告',       desc:'提供直後の一枚を本部へ',       roles:['staff','manager','owner','hq'] },
    { id:'checklist', group:'現場業務', icon:'check',   name:'開店・清掃チェック',     desc:'毎日の開店前チェック',         roles:['staff','manager','owner','hq'] },
    { id:'manual',    group:'学ぶ',     icon:'book',    name:'マニュアル',             desc:'理念・接客・衛生・商品',       roles:['staff','manager','owner','hq'] },
    { id:'survey',    group:'学ぶ',     icon:'star',    name:'サーベイ',               desc:'お客様アンケート運用',         roles:['staff','manager','owner','hq'] },
    { id:'soukatsu',  group:'店舗運営', icon:'table',   name:'総括表の入力',           desc:'日次の売上・客数・分析',       roles:['manager','owner','hq'] },
    { id:'mtg',       group:'店舗運営', icon:'mtg',     name:'月例MTG',                desc:'各店の定例MTGと議題を一元管理', roles:['manager','owner','hq'] },
    { id:'hr',        group:'店舗運営', icon:'hr',      name:'スタッフ評価・面談',     desc:'キャリアアップ制度と面談',     roles:['manager','hq'] },
    { id:'schedule',  group:'開業・経営', icon:'calendar',name:'開業スケジュール D-90',  desc:'契約〜開業のマスター工程',     roles:['owner','hq'] },
    { id:'pl',        group:'開業・経営', icon:'yen',     name:'数値・PL',               desc:'損益・KPIの見える化',          roles:['owner','hq'] },
    { id:'dashboard', group:'本部',     icon:'gauge',   name:'本部ダッシュボード',     desc:'全店の報告を自動集約',         roles:['hq'] },
    { id:'tasks',     group:'本部',     icon:'task',    name:'課題・タスク管理',       desc:'本部の全課題を担当・状況で管理', roles:['hq'] },
    { id:'invoice',   group:'本部',     icon:'invoice', name:'請求・支払管理',         desc:'取引先ごとの請求方法・締日',   roles:['hq'] },
    { id:'teishutsu', group:'本部',     icon:'inbox',   name:'加盟店・提出物管理',     desc:'提出状況と未提出の自動抽出',   roles:['hq'] },
    { id:'camera',    group:'本部',     icon:'video',   name:'防犯カメラ確認',         desc:'本部から全店を一括確認',       roles:['hq'] }
  ];
  const GROUPS = ['現場業務', '学ぶ', '店舗運営', '開業・経営', '本部'];
  const appById = (id) => APPS.find(a => a.id === id);
  const canOpen = (app, role) => role === 'hq' || app.roles.includes(role);

  /* ---------- 状態 ---------- */
  const LS = {
    role:    'yosakura_demo_role',
    reports: 'yosakura_demo_reports',
    checks:  'yosakura_demo_checks'
  };
  const getRole = () => localStorage.getItem(LS.role) || 'staff';
  const setRole = (r) => localStorage.setItem(LS.role, r);
  const getReports = () => { try { return JSON.parse(localStorage.getItem(LS.reports)) || []; } catch { return []; } };
  const saveReports = (a) => localStorage.setItem(LS.reports, JSON.stringify(a));

  // ダッシュボードが最初から"生きて"見えるようサンプルを一度だけ投入
  function seedIfEmpty() {
    if (localStorage.getItem(LS.reports)) return;
    const now = Date.now();
    const s = [
      { kind:'a', store:'日本鰻世桜 富士山店', item:'うな重（並）', level:'半分以上', note:'ご飯を残されるお客様が多い', t: now-3600e3*20 },
      { kind:'a', store:'寿司世桜 心斎橋店',   item:'デザート（抹茶）', level:'3分の1', note:'抹茶チョコが重いとの声', t: now-3600e3*28 },
      { kind:'b', store:'和牛世桜 広島店',     item:'副菜の仕込み', level:'多め', note:'夜の副菜を仕込み過ぎ', t: now-3600e3*30 },
      { kind:'a', store:'牛カツ世桜 富士山店', item:'キャベツ', level:'少し', note:'', t: now-3600e3*44 },
      { kind:'b', store:'日本鰻世桜 富士山店', item:'うなぎのタレ', level:'少なめ', note:'', t: now-3600e3*46 }
    ];
    saveReports(s);
  }

  /* ---------- ユーティリティ ---------- */
  const $app = document.getElementById('app');
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const esc = (s='') => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }
  const timeAgo = (t) => {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'たった今'; if (m < 60) return `${m}分前`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}時間前`;
    return `${Math.floor(h / 24)}日前`;
  };

  /* ---------- PWAインストール ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  function triggerInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => { deferredPrompt = null; });
    } else {
      toast('ブラウザのメニューから「ホーム画面に追加」を選んでください');
    }
  }

  /* ---------- ルーター ---------- */
  function currentRoute() {
    const h = location.hash.replace(/^#/, '') || '/home';
    const [path, qs] = h.split('?');
    const params = new URLSearchParams(qs || '');
    return { path, params };
  }
  const go = (hash) => { location.hash = hash; };
  window.addEventListener('hashchange', render);

  /* ---------- 画面：共通シェル ---------- */
  function shell(inner, activeTab) {
    const role = ROLES[getRole()];
    const tabs = [
      ['home', 'ホーム', 'home'],
      ['genba', '報告', 'report'],
      ['learn', '学ぶ', 'grad'],
      ['hq', '本部', 'hq']
    ];
    return `
      <header class="hdr">
        <img class="hdr__logo" src="icons/icon-192.png" alt="">
        <div class="hdr__brand">世桜<small>YOSAKURA APP</small></div>
        <div class="hdr__spacer"></div>
        <button class="role-chip" id="roleBtn">
          <span class="tag">デモ・役割</span><span class="dot"></span>${role.label}
        </button>
      </header>
      ${inner}
      <nav class="tabbar">
        ${tabs.map(([k, lbl, ic]) => `<button data-tab="${k}" class="${activeTab===k?'on':''}">${svg(ic)}${lbl}</button>`).join('')}
      </nav>`;
  }

  /* ---------- 画面：ホーム（タブでグループ絞り込み）---------- */
  function viewHome(tab) {
    const role = getRole();
    const filter = { home:null, genba:'現場業務', learn:'学ぶ', hq:'本部' }[tab];
    const groups = filter ? [filter] : GROUPS;

    const install = tab === 'home' ? `
      <div class="install-card">
        <img class="hdr__logo" style="width:40px;height:40px" src="icons/icon-192.png" alt="">
        <div class="txt"><b>ホーム画面に世桜を追加</b><span>アプリのように起動。世桜のロゴが立ち上がります。</span></div>
        <button id="installBtn">追加</button>
      </div>` : '';

    let sections = '';
    for (const g of groups) {
      const apps = APPS.filter(a => a.group === g);
      if (!apps.length) continue;
      sections += `
        <div class="sec-h"><span class="bar"></span><h2>${g}</h2>
          <span class="count">${apps.filter(a=>canOpen(a,role)).length}/${apps.length} 利用可</span></div>
        <div class="grid">
          ${apps.map(a => tileHTML(a, role)).join('')}
        </div>`;
    }

    const heroTitle = tab === 'hq'
      ? '本部メニュー'
      : tab === 'genba' ? '報告する' : tab === 'learn' ? '学ぶ' : `世桜の業務を、<b>ひとつに</b>。`;

    const heroBlock = tab === 'home'
      ? `<div class="brandhead">
           <img class="brandhead__logo" src="icons/logo-full.png" alt="日本料理 世桜 -yosakura-">
         </div>`
      : `<div class="hero">
           <h1 class="hero__title">${heroTitle}</h1>
         </div>`;

    const inner = `
      <main class="screen">
        ${heroBlock}
        ${install}
        ${sections}
        <div class="footer-note">世桜アプリ demo v1 ・ 権限で表示が変わります（上部の役割を切替えてお試しください）</div>
      </main>`;
    return shell(inner, tab);
  }

  function tileHTML(a, role) {
    const ok = canOpen(a, role);
    if (!ok) {
      const need = a.roles.includes('hq') && a.roles.length === 1 ? '本部' : a.roles.includes('owner') ? '加盟店オーナー' : '店長';
      return `<div class="tile locked" data-locked="${a.id}">
        <span class="lock">${svg('lock')}</span>
        <div class="ico">${svg(a.icon)}</div>
        <div class="nm">${esc(a.name)}</div>
        <div class="desc">${esc(a.desc)}</div>
        <span class="need">${need}権限が必要</span>
      </div>`;
    }
    return `<button class="tile" data-open="${a.id}">
      ${a.live ? '<span class="live">● LIVE</span>' : ''}
      <div class="ico">${svg(a.icon)}</div>
      <div class="nm">${esc(a.name)}</div>
      <div class="desc">${esc(a.desc)}</div>
    </button>`;
  }

  /* ---------- 画面：アプリ詳細 ---------- */
  function viewApp(id) {
    const a = appById(id);
    if (!a) return viewHome('home');
    if (!canOpen(a, getRole())) { toast('この機能を開く権限がありません'); return viewHome('home'); }
    const body = APP_VIEWS[id] ? APP_VIEWS[id](a) : mockGeneric(a);
    const inner = `
      <main class="screen">
        <div class="appbar"><button class="back" id="backBtn">${svg('back')}ホーム</button></div>
        <div class="app-head">
          <div class="ico">${svg(a.icon)}</div>
          <div><h1>${esc(a.name)}</h1><p>${esc(a.desc)}</p></div>
        </div>
        ${body}
      </main>`;
    return shell(inner, groupTab(a.group));
  }
  const groupTab = (g) => g === '現場業務' ? 'genba' : g === '学ぶ' ? 'learn' : g === '本部' ? 'hq' : 'home';

  /* ===================================================================
     各アプリの中身
  =================================================================== */
  const APP_VIEWS = {};

  /* --- ① 食べ残し・食材ロス報告（実際に動く）--- */
  APP_VIEWS.tabemono = () => {
    const recent = getReports().slice().sort((x,y)=>y.t-x.t).slice(0,5);
    return `
      <div class="card" id="repForm">
        <h3>報告する</h3>
        <label class="fld"><span>種別</span>
          <div class="seg" data-seg="kind">
            <button type="button" data-v="a" class="on">お客様の食べ残し</button>
            <button type="button" data-v="b">食材ロス</button>
          </div>
        </label>
        <label class="fld"><span>店舗</span>
          <select id="f_store">${STORES.map(s=>`<option>${s}</option>`).join('')}</select>
        </label>
        <label class="fld"><span id="f_item_l">メニュー</span>
          <input type="text" id="f_item" placeholder="例：うな重（並）">
        </label>
        <label class="fld"><span>残り具合</span>
          <div class="seg" data-seg="level">
            <button type="button" data-v="半分以上" class="on">半分以上</button>
            <button type="button" data-v="3分の1">3分の1</button>
            <button type="button" data-v="少し">少し</button>
          </div>
        </label>
        <label class="fld"><span>気づき（任意）</span>
          <textarea id="f_note" placeholder="例：ご飯が多いかも／仕込み過ぎ など"></textarea>
        </label>
        <label class="fld"><span>写真（任意）</span>
          <div class="photo-drop" id="photoDrop">
            <div class="ph-ico">${svg('camera')}</div>
            <div><b style="font-size:13px">写真を追加</b><br><small>お皿を下げてから／料理だけを撮影</small></div>
            <input type="file" accept="image/*" id="f_photo" hidden>
          </div>
        </label>
        <button class="btn-primary" id="submitRep">報告する</button>
        <div class="hint">※デモ：この端末に保存され、下と「本部ダッシュボード」に反映されます</div>
      </div>
      <div class="card">
        <h3>最近の報告</h3>
        <div id="recentList">${recent.length ? recent.map(repRow).join('') : '<div class="muted">まだ報告がありません</div>'}</div>
      </div>`;
  };
  const repRow = (r) => `
    <div class="rep">
      <span class="kind ${r.kind}">${r.kind==='a'?'お客様':'ロス'}</span>
      <div class="body">
        <div class="l1">${esc(r.item||'（品目未記入）')}</div>
        <div class="l2">${esc(r.store)} ・ ${timeAgo(r.t)}${r.note?' ・ '+esc(r.note):''}</div>
      </div>
      <span class="amt">${esc(r.level)}</span>
    </div>`;

  /* --- ② 一食目写真（モック）--- */
  APP_VIEWS.firstphoto = () => `
    <p class="mock-note">◆ デモ表示（画面イメージ）</p>
    <div class="card">
      <h3>提供直後の一枚を報告</h3>
      <label class="fld"><span>店舗</span><select>${STORES.map(s=>`<option>${s}</option>`).join('')}</select></label>
      <label class="fld"><span>メニュー</span><input type="text" placeholder="例：海鮮丼"></label>
      <label class="fld"><span>写真</span>
        <div class="photo-drop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">撮影して追加</b><br><small>盛付の基準チェックに使用</small></div></div>
      </label>
      <button class="btn-primary" onclick="return false">送信（デモ）</button>
      <div class="hint">本番ではAIが盛付を一次判定 → 基準外のみ本部へ通知する構想</div>
    </div>`;

  /* --- ③ 開店・清掃チェック（動く：チェック状態を保存）--- */
  const CHECK_ITEMS = ['制服・身だしなみ','手洗い・消毒','冷蔵庫の温度確認','客席・テーブル清掃','トイレ清掃','ゴミ・廃棄処理','当日の予約確認','POP・季節メニュー確認'];
  APP_VIEWS.checklist = () => {
    const done = JSON.parse(localStorage.getItem(LS.checks) || '{}');
    const n = CHECK_ITEMS.filter((_,i)=>done[i]).length;
    return `
      <div class="card">
        <h3>本日の開店前チェック（${n}/${CHECK_ITEMS.length}）</h3>
        <div id="checkList">
          ${CHECK_ITEMS.map((t,i)=>`<div class="check ${done[i]?'done':''}" data-ci="${i}"><span class="box">${svg('tick')}</span><span class="lbl">${t}</span></div>`).join('')}
        </div>
      </div>
      <div class="hint">※デモ：チェックはこの端末に保存されます</div>`;
  };

  /* --- ④ マニュアル（モック：本物の目次構成）--- */
  const MANUAL = [
    ['01','店舗の世界観・理念','世桜とは／5つの価値／世桜10訓','book'],
    ['02','スタッフの基本','ハウスルール／シフト／優先順位','check'],
    ['03','接客・ホール','おもてなし／クレーム対応／iPadサーベイ','star'],
    ['04','集客・マーケ','Google口コミ／導線／冊子','gauge'],
    ['05','衛生管理','清掃ルール／食中毒対策／食材管理','video']
  ];
  APP_VIEWS.manual = () => `
    <p class="mock-note">◆ デモ表示（本部マニュアル目次に沿った構成）</p>
    <div class="card">
      ${MANUAL.map(([no,t,s,ic])=>`<div class="mrow" data-mock="1"><div class="mi">${svg(ic)}</div><div class="mt"><b>${no}. ${t}</b><span>${s}</span></div><span class="chev">${svg('chev')}</span></div>`).join('')}
    </div>
    <div class="hint">動画マニュアルもこの中に統合していく構想</div>`;

  /* --- ⑤ サーベイ（モック）--- */
  APP_VIEWS.survey = () => `
    <p class="mock-note">◆ デモ表示（画面イメージ）</p>
    <div class="card">
      <h3>お客様サーベイ</h3>
      <p class="muted">お客様がiPad／スマホで回答するアンケート。回答は本部に自動集約され、店舗改善に活用します。</p>
      <div class="mrow" data-mock="1"><div class="mi">${svg('star')}</div><div class="mt"><b>QRコードを表示</b><span>卓上・お会計時にご案内</span></div><span class="chev">${svg('chev')}</span></div>
      <div class="mrow" data-mock="1"><div class="mi">${svg('table')}</div><div class="mt"><b>回答を見る</b><span>満足度・自由記述の集計</span></div><span class="chev">${svg('chev')}</span></div>
    </div>`;

  /* --- ⑥ 総括表（モック）--- */
  APP_VIEWS.soukatsu = () => `
    <p class="mock-note">◆ デモ表示（画面イメージ）</p>
    <div class="card">
      <h3>本日の総括表</h3>
      <label class="fld"><span>店舗</span><select>${STORES.map(s=>`<option>${s}</option>`).join('')}</select></label>
      <div class="stat-row">
        <div class="stat"><div class="n">¥87,000</div><div class="k">売上</div></div>
        <div class="stat"><div class="n">13</div><div class="k">客数</div></div>
        <div class="stat"><div class="n">¥6,692</div><div class="k">客単価</div></div>
      </div>
      <label class="fld"><span>特記事項</span><textarea placeholder="本日の気づき・共有事項"></textarea></label>
      <button class="btn-primary" onclick="return false">提出（デモ）</button>
    </div>`;

  /* --- ⑦ 開業スケジュール D-90（モック）--- */
  APP_VIEWS.schedule = () => `
    <p class="mock-note">◆ デモ表示（開業マスター工程）</p>
    <div class="card">
      <div class="tl">
        <div class="ev"><div class="d">D-90</div><div class="t">加盟契約締結・キックオフMTG</div></div>
        <div class="ev"><div class="d">D-75</div><div class="t">物件確定・現地調査・業態提案</div></div>
        <div class="ev"><div class="d">D-60</div><div class="t">内装発注／SNS・MEO・採用開始</div></div>
        <div class="ev"><div class="d">D-30</div><div class="t">許認可申請・行政検査・備品搬入</div></div>
        <div class="ev"><div class="d">D-14</div><div class="t">研修・現地入り・仕込み・オペ確認</div></div>
        <div class="ev"><div class="d">D-Day</div><div class="t">オープン（本部が現地サポート）</div></div>
      </div>
    </div>`;

  /* --- ⑧ 数値・PL（モック）--- */
  APP_VIEWS.pl = () => `
    <p class="mock-note">◆ デモ表示（画面イメージ）</p>
    <div class="card">
      <h3>今月の損益（サンプル）</h3>
      ${bar('売上', 100)}${bar('原価', 32)}${bar('人件費', 28)}${bar('その他経費', 18)}${bar('営業利益', 22, true)}
      <p class="muted" style="margin-top:12px">300店フェーズでは、全店のPLを同じ様式で本部が一覧・比較できる構想。</p>
    </div>`;

  /* --- ⑨ 本部ダッシュボード（動く：報告を集約）--- */
  APP_VIEWS.dashboard = () => {
    const reps = getReports();
    const a = reps.filter(r=>r.kind==='a').length, b = reps.filter(r=>r.kind==='b').length;
    const byStore = {};
    reps.forEach(r => byStore[r.store] = (byStore[r.store]||0)+1);
    const max = Math.max(1, ...Object.values(byStore));
    const rows = Object.entries(byStore).sort((x,y)=>y[1]-x[1]);
    const recent = reps.slice().sort((x,y)=>y.t-x.t).slice(0,6);
    return `
      <p class="mock-note">◆ 現場の「食べ残し報告」がここに自動集約されます（実データ連動）</p>
      <div class="stat-row">
        <div class="stat"><div class="n">${reps.length}</div><div class="k">総報告数</div></div>
        <div class="stat"><div class="n">${a}</div><div class="k">お客様の残し</div></div>
        <div class="stat"><div class="n">${b}</div><div class="k">食材ロス</div></div>
      </div>
      <div class="card">
        <h3>店舗別の報告数</h3>
        ${rows.map(([s,c])=>`<div class="bar-row"><div class="bl"><span>${esc(s)}</span><b>${c}件</b></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/max*100)}%"></div></div></div>`).join('') || '<div class="muted">データがありません</div>'}
      </div>
      <div class="card">
        <h3>最新の報告</h3>
        ${recent.map(repRow).join('')}
      </div>`;
  };

  /* --- ⑩ 提出物管理（モック）--- */
  APP_VIEWS.teishutsu = () => {
    const data = [['日本鰻世桜 富士山店','提出済','—'],['牛カツ世桜 富士山店','提出済','—'],['寿司世桜 心斎橋店','提出済','—'],['日本鰻世桜 長堀橋店','提出済','—'],['日本鰻世桜 京都祇園店','未提出','1日'],['日本鰻世桜 浅草橋店','提出済','—'],['和牛世桜 広島店','未提出','3日']];
    return `
      <p class="mock-note">◆ デモ表示（提出状況の自動集約イメージ）</p>
      <div class="card">
        <h3>本日の提出状況</h3>
        ${data.map(([s,st,d])=>`<div class="rep"><span class="kind ${st==='提出済'?'b':'a'}">${st}</span><div class="body"><div class="l1">${s}</div><div class="l2">${st==='未提出'?('未提出 '+d):'期限内'}</div></div></div>`).join('')}
        <button class="btn-primary" style="margin-top:14px" onclick="return false">未提出店に連絡文を自動生成（デモ）</button>
      </div>`;
  };

  /* --- ⑪ 防犯カメラ（モック）--- */
  APP_VIEWS.camera = () => `
    <p class="mock-note">◆ デモ表示（画面イメージ）</p>
    <div class="card">
      <h3>全店カメラ（本部アカウント）</h3>
      <div class="grid">
        ${STORES.map(s=>`<div class="tile" data-mock="1" style="min-height:92px"><div class="ico">${svg('video')}</div><div class="nm" style="font-size:12px">${s}</div><div class="desc">ライブ / 録画</div></div>`).join('')}
      </div>
      <p class="muted" style="margin-top:12px">監視ではなくブランド品質維持・加盟店支援のための確認。倍速で要点のみ確認。</p>
    </div>`;

  /* --- 月例MTG（各店の定例MTG・議題を一元管理／実データ反映）--- */
  APP_VIEWS.mtg = () => {
    const MTG = [
      ['富士山2店舗（鰻・牛カツ）', '毎月 第4木 18:00', ['サーベイ', 'Google口コミ用POP', 'A型看板', 'ポストカード4種', '和牛BOX見積', '3店舗目の商談', 'お茶（桐箱）オペ']],
      ['寿司世桜 心斎橋店', '毎月 第4木 16:00', ['小冊子', '日本文化の説明', 'シャリ合わせ', 'ザル', '照明', 'ランチメニュー', 'サーベイ']],
      ['日本鰻世桜 京都祇園店', '毎月 第4木 15:00', ['口コミ返信', '売価設定FIX', 'サーベイ', '7DAYSヒアリング', 'MEO/SEOの本部区分']],
      ['日本鰻世桜 長堀橋店', '毎月 第4木 16:30', ['梅酒の状況', 'サーベイ', 'メニュー', '蛍の演出']],
      ['日本鰻世桜 浅草橋店', '毎月 第4水 15:00', ['和牛', 'ガスバーナーケース', 'サーベイ', 'TIP BOX', 'ハラール状況', 'マニュアル見直し']],
      ['和牛世桜 広島店', '毎月 第4木 18:00', ['Google口コミ', '総括表の記入', '商品別売上構成比', '盛付・一食目共有', '店内動画共有', '藁焼きの声がけ', 'サーベイ']]
    ];
    return `
      <p class="mock-note">◆ 全店の月例MTGと議題を一元管理（実データ反映）</p>
      ${MTG.map(([name, when, items]) => `
        <div class="card">
          <div class="mtg-h"><h3>${esc(name)}</h3><span class="muted">${esc(when)}</span></div>
          <div class="chips">${items.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
        </div>`).join('')}`;
  };

  /* --- 課題・タスク管理（本部の一元管理表／実データ反映・機密は非表示）--- */
  APP_VIEWS.tasks = () => {
    const T = [
      ['進行中', '請求', '他業者の請求フロー一覧の作成', '本部'],
      ['新規',   '品質', '食べ残し・食材ロスを本部へ共有する仕組み', '本部'],
      ['進行中', '動画マニュアル', '動画化する項目と参考動画の選定', '本部'],
      ['進行中', 'マニュアル', 'レシピ全体の見直し（見やすさ・使いやすさ）', '商品開発'],
      ['進行中', '提出物', '提出物管理シートの運用ルール整備', '本部'],
      ['進行中', '口コミ', 'ネガティブ口コミの確認・報告フロー化', '本部'],
      ['進行中', '備品', '備品発注・在庫管理シートの整備', '本部'],
      ['新規',   '教育', 'キャリアアップテストの雛形作成', '本部'],
      ['完了',   'マニュアル', '祝いカードの記入・スタンプ運用の追加', '本部'],
      ['完了',   '開業支援', '現地研修用チェックリストの作成', '本部']
    ];
    const cnt = (s) => T.filter(t => t[0] === s).length;
    const cls = { '進行中': 'st-doing', '完了': 'st-done', '新規': 'st-new' };
    return `
      <p class="mock-note">◆ 本部の全課題を担当・状況で一元管理（実データ反映）</p>
      <div class="stat-row">
        <div class="stat"><div class="n">${T.length}</div><div class="k">総課題</div></div>
        <div class="stat"><div class="n">${cnt('進行中') + cnt('新規')}</div><div class="k">対応中</div></div>
        <div class="stat"><div class="n">${cnt('完了')}</div><div class="k">完了</div></div>
      </div>
      <div class="card">
        ${T.map(([st, cat, title, who]) => `<div class="rep"><span class="stag ${cls[st]}">${st}</span><div class="body"><div class="l1">${esc(title)}</div><div class="l2">${esc(cat)} ・ 担当：${esc(who)}</div></div></div>`).join('')}
      </div>`;
  };

  /* --- 請求・支払管理（高原社長のご要望「誰へ・締日・方法の一覧化」）--- */
  APP_VIEWS.invoice = () => {
    const V = [
      ['山口陶器', '食器', 'メール請求', '月末締め'],
      ['丸眞', 'おしぼり 等', '郵送請求', '月末締め'],
      ['亀池商店', '箸', '担当へ直接請求', '都度'],
      ['かねさし', '食材', '発注・在庫連携', '週次']
    ];
    return `
      <p class="mock-note">◆ 高原社長のご要望「誰へ・締日・支払方法の一覧化」を一元管理</p>
      <div class="card">
        <h3>取引先マスター</h3>
        ${V.map(([n, k, how, when]) => `<div class="rep"><div class="body"><div class="l1">${esc(n)} <span class="muted" style="font-weight:400">・ ${esc(k)}</span></div><div class="l2">${esc(how)}</div></div><span class="amt" style="color:var(--sumi)">${esc(when)}</span></div>`).join('')}
        <button class="btn-primary" style="margin-top:14px" onclick="return false">請求書の受領状況を確認（デモ）</button>
      </div>
      <p class="hint">本部宛か担当直送かが混在していた請求を、一覧で見える化する構想。</p>`;
  };

  /* --- スタッフ評価・面談（キャリアアップ制度）--- */
  APP_VIEWS.hr = () => {
    const RANKS = [
      ['S', '店長代行クラス', '時間帯/日別の責任者・店長代行（時給+300円）'],
      ['L', 'リーダー', '新人育成を担当・全部門をカバー'],
      ['A', '一人前', '基本の営業が一通りできる'],
      ['B', '新人', '入って間もないスタッフ']
    ];
    return `
      <p class="mock-note">◆ キャリアアップ制度・面談を一元管理（イメージ）</p>
      <div class="card">
        <h3>ランク制度</h3>
        ${RANKS.map(([r, t, d]) => `<div class="rep"><span class="rankb">${r}</span><div class="body"><div class="l1">${esc(t)}</div><div class="l2">${esc(d)}</div></div></div>`).join('')}
      </div>
      <div class="card">
        <h3>面談</h3>
        <div class="chips"><span class="chip">年4回（3・6・9・12月）</span><span class="chip">1ヶ月前にフォーム予約</span><span class="chip">1回30分</span></div>
        <p class="muted" style="margin-top:10px">評価は7DAYS／面談評価シート（5つの価値・7つの管理・店舗ルール 等）／目標設定で実施。時給は面談の翌月に反映。</p>
      </div>`;
  };

  const mockGeneric = (a) => `<p class="mock-note">◆ デモ表示</p><div class="card"><p class="muted">「${esc(a.name)}」の画面イメージ。</p></div>`;

  const bar = (label, pct, hl=false) => `
    <div class="bar-row"><div class="bl"><span>${label}</span><b>${pct}%</b></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;${hl?'background:#000':''}"></div></div></div>`;

  /* ---------- 役割切替シート ---------- */
  function openRoleSheet() {
    const cur = getRole();
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>役割を切り替える<span class="demo-tag">デモ</span></h3>
      <div class="sub">本部だけでなく、加盟店（スタッフ・店長・加盟店オーナー）も同じアプリを使う前提です。役割によって見える機能・画面が変わります。この出し分けをお見せするための切替です。</div>
      ${Object.entries(ROLES).map(([k,v])=>`
        <button class="role-opt ${k===cur?'on':''}" data-role="${k}">
          <span class="rr">${v.mark}</span>
          <span class="ri"><b>${v.label}</b><span>${v.desc}</span></span>
          ${k===cur?`<span class="rc">${svg('tick')}</span>`:''}
        </button>`).join('')}
    </div></div>`);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) return mask.remove();
      const btn = e.target.closest('[data-role]');
      if (btn) { setRole(btn.dataset.role); mask.remove(); render(); toast(`「${ROLES[btn.dataset.role].label}」に切り替えました`); }
    });
    document.body.appendChild(mask);
  }

  /* ---------- レンダリング＆イベント ---------- */
  function render() {
    const { path, params } = currentRoute();
    let html;
    if (path.startsWith('/app/')) html = viewApp(path.slice(5));
    else if (path === '/home') html = viewHome(params.get('tab') || 'home');
    else html = viewHome('home');
    $app.innerHTML = html;
    window.scrollTo(0, 0);
    bind();
  }

  function bind() {
    const roleBtn = document.getElementById('roleBtn');
    if (roleBtn) roleBtn.onclick = openRoleSheet;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) installBtn.onclick = triggerInstall;
    const backBtn = document.getElementById('backBtn');
    if (backBtn) backBtn.onclick = () => go('/home');

    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab === 'home' ? '/home' : `/home?tab=${b.dataset.tab}`));
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => go(`/app/${b.dataset.open}`));
    document.querySelectorAll('[data-locked]').forEach(b => b.onclick = () => { const a = appById(b.dataset.locked); toast(`「${a.name}」は権限が必要です`); });
    document.querySelectorAll('[data-mock]').forEach(b => b.onclick = () => toast('デモのため、この先はイメージです'));

    // セグメント
    document.querySelectorAll('[data-seg]').forEach(seg => {
      seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        btn.classList.add('on');
        if (seg.dataset.seg === 'kind') {
          const isA = btn.dataset.v === 'a';
          const lab = document.getElementById('f_item_l');
          const inp = document.getElementById('f_item');
          if (lab) lab.textContent = isA ? 'メニュー' : '品目';
          if (inp) inp.placeholder = isA ? '例：うな重（並）' : '例：副菜の仕込み';
        }
      });
    });

    // 写真
    const drop = document.getElementById('photoDrop');
    if (drop) {
      const fi = document.getElementById('f_photo');
      drop.onclick = () => fi.click();
      fi.onchange = () => {
        if (!fi.files[0]) return;
        const url = URL.createObjectURL(fi.files[0]);
        drop.querySelector('img')?.remove();
        const img = new Image(); img.src = url; drop.appendChild(img);
      };
    }

    // 報告送信
    const sub = document.getElementById('submitRep');
    if (sub) sub.onclick = () => {
      const kind = document.querySelector('[data-seg="kind"] .on').dataset.v;
      const level = document.querySelector('[data-seg="level"] .on').dataset.v;
      const store = document.getElementById('f_store').value;
      const item = document.getElementById('f_item').value.trim();
      const note = document.getElementById('f_note').value.trim();
      if (!item) { toast(kind==='a'?'メニューを入力してください':'品目を入力してください'); return; }
      const reps = getReports();
      reps.push({ kind, store, item, level, note, t: Date.now() });
      saveReports(reps);
      toast('報告しました。ありがとうございます！');
      render();
    };

    // チェックリスト
    document.querySelectorAll('[data-ci]').forEach(row => row.onclick = () => {
      const done = JSON.parse(localStorage.getItem(LS.checks) || '{}');
      const i = row.dataset.ci; done[i] = !done[i];
      localStorage.setItem(LS.checks, JSON.stringify(done));
      render();
    });
  }

  /* ---------- 起動 ---------- */
  seedIfEmpty();
  render();
  setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 1150);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
