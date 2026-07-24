/* ===================================================================
   世桜アプリ（デモ） app.js  ─ 多言語対応（日本語 / English / Tiếng Việt）
   1つの窓口 → 中に多数の業務アプリ → 権限で出し分け → すべてここで管理
   フレームワーク不使用のバニラJS・静的PWA（GitHub Pagesで無料公開可）
   ※デモ。データは端末内(localStorage)のみ。本番はGAS+スプレッドシート等に接続する想定。
=================================================================== */
(() => {
  'use strict';

  /* ====== 共有バックエンド設定 ======
     GAS WebアプリのURL（/exec）をここに貼ると、全端末でデータが同期される。
     空のままなら従来通りこの端末内(localStorage)だけに保存。 */
  const API_URL = 'https://script.google.com/macros/s/AKfycbzS-tvfTQwJjgYn2ASHWidU-qBWZzF85bqt25T4mAXcM-P6-75zFqzUSlgiPFDTe7KQRQ/exec';
  const useBackend = () => !!API_URL;
  let lastSync = 0;

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
    globe:  '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" fill="none" stroke="currentColor" stroke-width="1.35"/>',
    share:  '<path d="M12 3.5v10.5M12 3.5l-3 3M12 3.5l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 9.5H5.6A1.6 1.6 0 0 0 4 11.1V19a1.6 1.6 0 0 0 1.6 1.6h12.8A1.6 1.6 0 0 0 20 19v-7.9a1.6 1.6 0 0 0-1.6-1.6H17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    dots:   '<circle cx="12" cy="5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="19" r="1.7" fill="currentColor"/>',
    mtg:    '<circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="8" r="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 18c0-2.4 2-3.9 4.5-3.9 1.2 0 2.3.35 3.1.95M12.9 15.05c.8-.6 1.9-.95 3.1-.95 2.5 0 4.5 1.5 4.5 3.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    task:   '<rect x="4.5" y="3.5" width="15" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 8.5l1.2 1.2L11.5 7M8 14.5l1.2 1.2L11.5 13M14 9h3.2M14 15h3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    invoice:'<path d="M6.5 3h8l3.5 3.5V21l-2-1-2 1-2-1-2 1-2-1-2 1V3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 8.5h6M9 11.5h6M9 14.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    hr:     '<circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 19c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    play:   '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 8.3l5.2 3.7-5.2 3.7z" fill="currentColor"/>',
    cart:   '<circle cx="9.5" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/><path d="M2.5 4h2.2l2.4 11.2h10.2l1.9-8.2H6.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k] || ''}</svg>`;

  /* ---------- 言語 ---------- */
  const LANGS = { ja: { label: '日本語', short: 'JP' }, en: { label: 'English', short: 'EN' }, vi: { label: 'Tiếng Việt', short: 'VI' } };
  let LANG = localStorage.getItem('yosakura_demo_lang') || 'ja';
  const setLang = (l) => { LANG = l; localStorage.setItem('yosakura_demo_lang', l); };
  // L() : {ja,en,vi} を現在言語で解決。文字列ならそのまま。
  const L = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? (o[LANG] || o.ja) : o;

  /* ---------- 役割（権限）---------- */
  const ROLES = {
    staff:   { mark: '員', label: { ja:'スタッフ', en:'Staff', vi:'Nhân viên' },       desc: { ja:'加盟店・直営店の現場スタッフ', en:'On-site staff of stores', vi:'Nhân viên tại cửa hàng' } },
    manager: { mark: '長', label: { ja:'店長', en:'Manager', vi:'Cửa hàng trưởng' },   desc: { ja:'店舗の店長・管理者', en:'Store manager', vi:'Quản lý cửa hàng' } },
    owner:   { mark: '主', label: { ja:'加盟店オーナー', en:'Franchisee', vi:'Chủ nhượng quyền' }, desc: { ja:'加盟店のオーナー様', en:'Franchise store owner', vi:'Chủ cửa hàng nhượng quyền' } },
    hq:      { mark: '本', label: { ja:'本部', en:'HQ', vi:'Bộ phận chính' },            desc: { ja:'世桜 本部（経営・高原社長ら）', en:'YOSAKURA headquarters', vi:'Trụ sở YOSAKURA' } }
  };

  /* ---------- 店舗マスター（実在店舗・固有名詞のまま）---------- */
  const STORES = [
    '日本料理世桜 心斎橋（おまかせ）', '寿司世桜 心斎橋店',
    '牛カツ世桜 長堀橋店', '日本鰻世桜 長堀橋店', '手巻き寿司世桜 難波店',
    '牛カツ世桜 富士山店', '日本鰻世桜 富士山店',
    '日本鰻世桜 京都祇園店', '日本鰻世桜 浅草橋店', '和牛世桜 広島店',
    '牛カツ世桜 ハノイ店', '日本鰻世桜 ホーチミン1号店'
  ];

  /* ---------- グループ ---------- */
  const GROUPS = [
    { id:'genba',    name:{ ja:'現場業務', en:'On-site', vi:'Tại cửa hàng' } },
    { id:'learn',    name:{ ja:'学ぶ', en:'Learn', vi:'Học tập' } },
    { id:'storeops', name:{ ja:'店舗運営', en:'Store Ops', vi:'Vận hành' } },
    { id:'biz',      name:{ ja:'開業・経営', en:'Opening & Business', vi:'Khai trương & Kinh doanh' } },
    { id:'hq',       name:{ ja:'本部', en:'Headquarters', vi:'Bộ phận chính' } }
  ];
  const groupName = (id) => { const g = GROUPS.find(x => x.id === id); return g ? L(g.name) : id; };

  /* ---------- アプリ登録 ---------- */
  const APPS = [
    { id:'tabemono', group:'genba', icon:'food', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'食べ残し・食材ロス報告', en:'Food Waste & Loss', vi:'Thức ăn thừa & hao hụt' },
      desc:{ ja:'お客様の残し／食材ロスを記録', en:'Log leftovers / ingredient loss', vi:'Ghi đồ thừa / hao hụt' } },
    { id:'firstphoto', group:'genba', icon:'camera', roles:['staff','manager','owner','hq'],
      name:{ ja:'一食目写真の報告', en:'First-plate Photo', vi:'Ảnh món đầu tiên' },
      desc:{ ja:'提供直後の一枚を本部へ', en:'Send the first serving photo', vi:'Gửi ảnh ngay khi phục vụ' } },
    { id:'checklist', group:'genba', icon:'check', roles:['staff','manager','owner','hq'],
      name:{ ja:'開店・清掃チェック', en:'Opening & Cleaning', vi:'Mở cửa & Vệ sinh' },
      desc:{ ja:'毎日の開店前チェック', en:'Daily pre-open checklist', vi:'Kiểm tra trước khi mở cửa' } },
    { id:'manual', group:'learn', icon:'book', roles:['staff','manager','owner','hq'],
      name:{ ja:'マニュアル', en:'Manuals', vi:'Cẩm nang' },
      desc:{ ja:'理念・接客・衛生・商品', en:'Values, service, hygiene, menu', vi:'Triết lý, phục vụ, vệ sinh' } },
    { id:'survey', group:'learn', icon:'star', roles:['staff','manager','owner','hq'],
      name:{ ja:'サーベイ', en:'Survey', vi:'Khảo sát' },
      desc:{ ja:'お客様アンケート運用', en:'Customer survey operation', vi:'Khảo sát khách hàng' } },
    { id:'guide', group:'learn', icon:'play', roles:['staff','manager','owner','hq'],
      name:{ ja:'使い方ガイド', en:'How to use', vi:'Hướng dẫn' },
      desc:{ ja:'このアプリの使い方（1分）', en:'Quick app guide (1 min)', vi:'Hướng dẫn nhanh (1 phút)' } },
    { id:'soukatsu', group:'storeops', icon:'table', roles:['manager','owner','hq'],
      name:{ ja:'総括表の入力', en:'Daily Summary', vi:'Tổng kết ngày' },
      desc:{ ja:'日次の売上・客数・分析', en:'Daily sales, guests, review', vi:'Doanh thu, khách, phân tích' } },
    { id:'mtg', group:'storeops', icon:'mtg', roles:['manager','owner','hq'],
      name:{ ja:'月例MTG', en:'Monthly Meeting', vi:'Họp hàng tháng' },
      desc:{ ja:'各店の定例MTGと議題を一元管理', en:'All stores meetings & agendas', vi:'Lịch họp & nội dung mọi cửa hàng' } },
    { id:'hr', group:'storeops', icon:'hr', roles:['manager','owner','hq'],
      name:{ ja:'スタッフ評価・面談', en:'Staff Review', vi:'Đánh giá nhân viên' },
      desc:{ ja:'キャリアアップ制度と面談', en:'Career ranks & interviews', vi:'Xếp hạng & phỏng vấn' } },
    { id:'order', group:'storeops', icon:'cart', roles:['manager','owner','hq'],
      name:{ ja:'備品・食材の発注', en:'Order Supplies', vi:'Đặt vật tư' },
      desc:{ ja:'カタログから本部へ発注', en:'Order from the HQ catalog', vi:'Đặt từ danh mục HQ' } },
    { id:'schedule', group:'biz', icon:'calendar', roles:['owner','hq'],
      name:{ ja:'開業スケジュール D-90', en:'Opening Schedule D-90', vi:'Lịch khai trương D-90' },
      desc:{ ja:'契約〜開業のマスター工程', en:'Contract to opening master plan', vi:'Từ hợp đồng đến khai trương' } },
    { id:'pl', group:'biz', icon:'yen', roles:['owner','hq'],
      name:{ ja:'数値・PL', en:'Numbers & P/L', vi:'Số liệu & P/L' },
      desc:{ ja:'損益・KPIの見える化', en:'Profit and KPI visibility', vi:'Lợi nhuận & KPI' } },
    { id:'dashboard', group:'hq', icon:'gauge', roles:['hq'],
      name:{ ja:'本部ダッシュボード', en:'HQ Dashboard', vi:'Bảng điều khiển' },
      desc:{ ja:'全店の報告を自動集約', en:'Auto-aggregate all reports', vi:'Tổng hợp báo cáo tự động' } },
    { id:'tasks', group:'hq', icon:'task', roles:['hq'],
      name:{ ja:'課題・タスク管理', en:'Task Management', vi:'Quản lý công việc' },
      desc:{ ja:'本部の全課題を担当・状況で管理', en:'All HQ tasks by owner & status', vi:'Công việc theo phụ trách & trạng thái' } },
    { id:'invoice', group:'hq', icon:'invoice', roles:['hq'],
      name:{ ja:'請求・支払管理', en:'Billing & Payment', vi:'Hóa đơn & Thanh toán' },
      desc:{ ja:'取引先ごとの請求方法・締日', en:'Vendor billing method & cutoff', vi:'Cách & kỳ hạn thanh toán' } },
    { id:'teishutsu', group:'hq', icon:'inbox', roles:['hq'],
      name:{ ja:'加盟店・提出物管理', en:'Submissions', vi:'Nộp tài liệu' },
      desc:{ ja:'提出状況と未提出の自動抽出', en:'Track & flag missing submissions', vi:'Theo dõi tài liệu chưa nộp' } },
    { id:'camera', group:'hq', icon:'video', roles:['hq'],
      name:{ ja:'防犯カメラ確認', en:'Security Cameras', vi:'Camera an ninh' },
      desc:{ ja:'本部から全店を一括確認', en:'Check all stores from HQ', vi:'Xem mọi cửa hàng từ HQ' } }
  ];
  const appById = (id) => APPS.find(a => a.id === id);
  const canOpen = (app, role) => role === 'hq' || app.roles.includes(role);

  /* ---------- 状態 ---------- */
  const LS = { role:'yosakura_demo_role', store:'yosakura_demo_store', reports:'yosakura_demo_reports', checks:'yosakura_demo_checks' };
  const getRole = () => localStorage.getItem(LS.role) || 'staff';
  const setRole = (r) => localStorage.setItem(LS.role, r);
  const getStoreSel = () => localStorage.getItem(LS.store) || STORES[0];
  const setStoreSel = (s) => localStorage.setItem(LS.store, s);
  // 店舗スコープ：本部＝全店（または任意1店にドリルダウン）、非本部＝自店のみ
  function visibleStores() {
    const role = getRole(), sel = getStoreSel();
    if (role === 'hq') return sel === 'all' ? STORES.slice() : [sel];
    return [STORES.includes(sel) ? sel : STORES[0]];
  }
  const storeShort = (s) => s === 'all' ? L({ ja:'全店', en:'All', vi:'Tất cả' }) : (s.split(' ').slice(1).join(' ') || s);
  const getReports = () => { try { return JSON.parse(localStorage.getItem(LS.reports)) || []; } catch { return []; } };
  const saveReports = (a) => localStorage.setItem(LS.reports, JSON.stringify(a));

  function seedIfEmpty() {
    if (localStorage.getItem(LS.reports)) return;
    const now = Date.now();
    saveReports([
      { kind:'a', store:'日本鰻世桜 富士山店', item:'うな重（並）', level:'half', note:{ ja:'ご飯を残されるお客様が多い', en:'Many guests leave rice', vi:'Nhiều khách để lại cơm' }, t: now-3600e3*20 },
      { kind:'a', store:'寿司世桜 心斎橋店',   item:'デザート（抹茶）', level:'third', note:{ ja:'抹茶チョコが重いとの声', en:'Matcha choco feels heavy', vi:'Socola matcha hơi ngán' }, t: now-3600e3*28 },
      { kind:'b', store:'和牛世桜 広島店',     item:'副菜の仕込み', level:'much', note:{ ja:'夜の副菜を仕込み過ぎ', en:'Over-prepped side dishes', vi:'Chuẩn bị dư món phụ' }, t: now-3600e3*30 },
      { kind:'a', store:'牛カツ世桜 富士山店', item:'キャベツ', level:'little', note:'', t: now-3600e3*44 },
      { kind:'b', store:'日本鰻世桜 富士山店', item:'うなぎのタレ', level:'small', note:'', t: now-3600e3*46 }
    ]);
  }

  /* 残り具合ラベル */
  const LEVELS_A = [ { v:'half', t:{ja:'半分以上',en:'Over half',vi:'Hơn nửa'} }, { v:'third', t:{ja:'3分の1',en:'About 1/3',vi:'Khoảng 1/3'} }, { v:'little', t:{ja:'少し',en:'A little',vi:'Một ít'} } ];
  const LEVELS_B = [ { v:'small', t:{ja:'少なめ',en:'Small',vi:'Ít'} }, { v:'normal', t:{ja:'ふつう',en:'Normal',vi:'Vừa'} }, { v:'much', t:{ja:'多め',en:'Large',vi:'Nhiều'} } ];
  const levelLabel = (v) => { const f = [...LEVELS_A, ...LEVELS_B].find(x => x.v === v); return f ? L(f.t) : v; };

  /* ---------- ユーティリティ ---------- */
  const $app = document.getElementById('app');
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const esc = (s='') => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  let toastTimer;
  function toast(msg) {
    const el2 = document.getElementById('toast');
    el2.textContent = msg; el2.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el2.classList.remove('show'), 2400);
  }
  const timeAgo = (ts) => {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return L({ ja:'たった今', en:'just now', vi:'vừa xong' });
    if (m < 60) return m + L({ ja:'分前', en:'m ago', vi:' phút trước' });
    const h = Math.floor(m / 60);
    if (h < 24) return h + L({ ja:'時間前', en:'h ago', vi:' giờ trước' });
    return Math.floor(h / 24) + L({ ja:'日前', en:'d ago', vi:' ngày trước' });
  };
  // 写真を縮小してdataURL化（localStorage節約のためJPEG・最大240px）
  function downscale(img, max, q) {
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w > h) { if (w > max) { h = Math.round(h * max / w); w = max; } }
    else { if (h > max) { w = Math.round(w * max / h); h = max; } }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    try { return c.toDataURL('image/jpeg', q || 0.6); } catch { return ''; }
  }
  function openLightbox(src) {
    const m = el(`<div class="lightbox"><img src="${src}" alt=""></div>`);
    m.onclick = () => m.remove();
    document.body.appendChild(m);
  }
  // 写真は base64(dataURL) か DriveファイルID。表示用URLに変換（IDはDriveのサムネイル配信）
  const isDataUrl = (p) => typeof p === 'string' && p.slice(0, 5) === 'data:';
  const photoThumb = (p) => isDataUrl(p) ? p : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(p) + '&sz=w400';
  const photoFull  = (p) => isDataUrl(p) ? p : 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(p) + '&sz=w1600';

  /* ---------- 使い方ガイド（アプリ内チュートリアル）---------- */
  const TOUR = [
    { icon:'play',
      t:{ ja:'世桜アプリへようこそ', en:'Welcome to YOSAKURA App', vi:'Chào mừng đến YOSAKURA' },
      b:{ ja:'店舗の報告から本部の管理まで、これ1つで。役割と言語で表示が変わります。', en:'From store reports to HQ management, all in one. The view changes by role and language.', vi:'Từ báo cáo cửa hàng đến quản lý HQ, tất cả trong một. Hiển thị đổi theo vai trò và ngôn ngữ.' } },
    { icon:'hr',
      t:{ ja:'役割・言語を切り替え', en:'Switch role & language', vi:'Đổi vai trò & ngôn ngữ' },
      b:{ ja:'右上のチップで役割（スタッフ／店長／加盟店オーナー／本部）を、🌐で言語（日・英・越）を切替。見える画面が変わります。', en:'Use the top-right chip to switch role, and 🌐 to switch language (JP/EN/VI). Visible screens change.', vi:'Dùng chip góc trên phải để đổi vai trò, và 🌐 để đổi ngôn ngữ (JP/EN/VI). Màn hình sẽ thay đổi.' } },
    { icon:'food',
      t:{ ja:'食べ残し・食材ロスを報告', en:'Report food waste & loss', vi:'Báo cáo thức ăn thừa & hao hụt' },
      b:{ ja:'「報告」から入力。写真も複数枚OK。送信すると本部にすぐ届きます。', en:'Fill it from “Report”. Multiple photos OK. On submit it reaches HQ instantly.', vi:'Nhập từ “Báo cáo”. Nhiều ảnh OK. Gửi xong sẽ đến HQ ngay.' } },
    { icon:'gauge',
      t:{ ja:'本部で全店を確認', en:'HQ sees all stores', vi:'HQ xem mọi cửa hàng' },
      b:{ ja:'本部ダッシュボードに全店の報告と写真が自動で集まります（店舗別に閲覧）。', en:'The HQ dashboard auto-collects every store’s reports and photos (viewable by store).', vi:'Bảng điều khiển HQ tự tổng hợp báo cáo và ảnh mọi cửa hàng (xem theo cửa hàng).' } },
    { icon:'home',
      t:{ ja:'ホーム画面に追加', en:'Add to Home Screen', vi:'Thêm vào màn hình chính' },
      b:{ ja:'「追加」ボタンでアプリのように起動。世桜のロゴが立ち上がります。', en:'Use the “Add” button to launch like an app, with the YOSAKURA logo.', vi:'Dùng nút “Thêm” để khởi động như ứng dụng với logo YOSAKURA.' } }
  ];
  function markTourDone() { localStorage.setItem('yosakura_tour_done', '1'); }
  function openTour(i) {
    i = i || 0;
    const step = TOUR[i], last = i === TOUR.length - 1;
    const mask = el(`<div class="tour-mask"><div class="tour">
      <button class="tour__x" data-tour-close="1" aria-label="close">×</button>
      <div class="tour__ic">${svg(step.icon)}</div>
      <h3 class="tour__t">${esc(L(step.t))}</h3>
      <p class="tour__b">${esc(L(step.b))}</p>
      <div class="tour__dots">${TOUR.map((_, k) => `<span class="tour__dot ${k===i?'on':''}"></span>`).join('')}</div>
      <div class="tour__row">
        ${i>0 ? `<button class="tour__skip" data-tour-back="1">${L({ja:'戻る',en:'Back',vi:'Quay lại'})}</button>` : `<button class="tour__skip" data-tour-close="1">${L({ja:'スキップ',en:'Skip',vi:'Bỏ qua'})}</button>`}
        <button class="btn-primary tour__next" data-tour-next="1">${last ? L({ja:'はじめる',en:'Get started',vi:'Bắt đầu'}) : L({ja:'次へ',en:'Next',vi:'Tiếp'})}</button>
      </div>
    </div></div>`);
    mask.addEventListener('click', (e) => {
      if (e.target === mask || e.target.closest('[data-tour-close]')) { markTourDone(); mask.remove(); return; }
      if (e.target.closest('[data-tour-back]')) { mask.remove(); openTour(i - 1); return; }
      if (e.target.closest('[data-tour-next]')) { mask.remove(); if (last) { markTourDone(); } else { openTour(i + 1); } return; }
    });
    document.body.appendChild(mask);
  }

  /* ---------- PWAインストール ---------- */
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  // 追加が完了したら記録して案内を消す
  window.addEventListener('appinstalled', () => { localStorage.setItem('yosakura_installed', '1'); deferredPrompt = null; render(); });
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const installHidden = () => isStandalone() || localStorage.getItem('yosakura_installed') || localStorage.getItem('yosakura_install_hide');
  function getPlatform() {
    const ua = navigator.userAgent || '';
    const iOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    if (iOS) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'desktop';
  }
  function triggerInstall() {
    // Android/PCのChrome系はネイティブのインストールダイアログを自動表示
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; }); return; }
    // それ以外（iPhone等）は端末別の手順を案内
    openInstallSheet(getPlatform());
  }

  const INSTALL_STEPS = {
    ios: [
      { icon:'share', t:{ ja:'画面下の「共有」ボタンをタップ', en:'Tap the Share button at the bottom', vi:'Chạm nút Chia sẻ ở dưới' } },
      { t:{ ja:'メニューを下にスクロールし「ホーム画面に追加」をタップ', en:'Scroll down and tap “Add to Home Screen”', vi:'Kéo xuống, chọn “Thêm vào màn hình chính”' } },
      { t:{ ja:'右上の「追加」をタップ', en:'Tap “Add” at the top right', vi:'Chạm “Thêm” ở góc trên phải' } }
    ],
    android: [
      { icon:'dots', t:{ ja:'右上の「⋮」メニューをタップ', en:'Tap the “⋮” menu at the top right', vi:'Chạm menu “⋮” ở góc trên phải' } },
      { t:{ ja:'「アプリをインストール」または「ホーム画面に追加」をタップ', en:'Tap “Install app” or “Add to Home screen”', vi:'Chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”' } },
      { t:{ ja:'案内に沿って「追加／インストール」', en:'Follow the prompt to Add / Install', vi:'Làm theo hướng dẫn để Thêm / Cài đặt' } }
    ],
    desktop: [
      { t:{ ja:'アドレスバー右の「インストール」アイコン、またはメニューから「インストール」を選択', en:'Click the install icon in the address bar, or Menu → Install', vi:'Nhấn biểu tượng cài đặt ở thanh địa chỉ, hoặc Menu → Cài đặt' } }
    ]
  };
  function openInstallSheet(platform) {
    const steps = INSTALL_STEPS[platform] || INSTALL_STEPS.desktop;
    const title = {
      ios:     { ja:'ホーム画面に追加（iPhone・iPad）', en:'Add to Home Screen (iPhone / iPad)', vi:'Thêm vào màn hình (iPhone / iPad)' },
      android: { ja:'ホーム画面に追加（Android）', en:'Add to Home Screen (Android)', vi:'Thêm vào màn hình (Android)' },
      desktop: { ja:'アプリをインストール', en:'Install the app', vi:'Cài đặt ứng dụng' }
    }[platform];
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>${L(title)}</h3>
      <div class="inst-list">
        ${steps.map((s,i)=>`<div class="inst-step"><span class="inst-no">${i+1}</span><div class="inst-tx">${L(s.t)}${s.icon?` <span class="inst-ic">${svg(s.icon)}</span>`:''}</div></div>`).join('')}
      </div>
      ${platform==='ios'?`<p class="inst-note">${L({ ja:'※ Safari で開いてください。他アプリ内のブラウザでは表示されない場合があります。', en:'Please open in Safari. In-app browsers may not show this option.', vi:'Hãy mở bằng Safari. Trình duyệt trong ứng dụng có thể không hiện tùy chọn này.' })}</p>`:''}
      <button class="btn-primary" data-close="1">${L({ ja:'閉じる', en:'Close', vi:'Đóng' })}</button>
    </div></div>`);
    mask.addEventListener('click', (e) => { if (e.target === mask || e.target.closest('[data-close]')) mask.remove(); });
    document.body.appendChild(mask);
  }

  /* ---------- ルーター ---------- */
  function currentRoute() {
    const h = location.hash.replace(/^#/, '') || '/home';
    const [path, qs] = h.split('?');
    return { path, params: new URLSearchParams(qs || '') };
  }
  const go = (hash) => { location.hash = hash; };
  window.addEventListener('hashchange', render);

  /* ---------- シェル ---------- */
  function shell(inner, activeTab) {
    const roleKey = getRole();
    const role = ROLES[roleKey];
    const tabs = [
      ['home', { ja:'ホーム', en:'Home', vi:'Trang chủ' }, 'home'],
      ['genba', { ja:'報告', en:'Report', vi:'Báo cáo' }, 'report'],
      ['learn', { ja:'学ぶ', en:'Learn', vi:'Học' }, 'grad']
    ];
    if (roleKey === 'hq') tabs.push(['hq', { ja:'本部', en:'HQ', vi:'HQ' }, 'hq']); // 本部権限のみ
    return `
      <header class="hdr">
        <img class="hdr__logo" src="icons/icon-192.png" alt="">
        <div class="hdr__brand">世桜<small>YOSAKURA APP</small></div>
        <div class="hdr__spacer"></div>
        <button class="lang-chip" id="langBtn" aria-label="language">${svg('globe')}<span>${LANGS[LANG].short}</span></button>
        <button class="role-chip" id="roleBtn">
          <span class="dot"></span><span class="rc-role">${L(role.label)}</span><span class="sep">・</span><span class="rc-store">${esc(storeShort(getStoreSel()))}</span>
        </button>
      </header>
      ${inner}
      <nav class="tabbar">
        ${tabs.map(([k, lbl, ic]) => `<button data-tab="${k}" class="${activeTab===k?'on':''}">${svg(ic)}${L(lbl)}</button>`).join('')}
      </nav>`;
  }

  /* ---------- ホーム ---------- */
  function viewHome(tab) {
    const role = getRole();
    if (tab === 'hq' && role !== 'hq') tab = 'home'; // 本部権限が無ければホームへ
    const filter = { home:null, genba:'genba', learn:'learn', hq:'hq' }[tab];
    const groups = filter ? [filter] : GROUPS.map(g => g.id);

    const install = (tab === 'home' && !installHidden()) ? `
      <div class="install-card">
        <button class="install-x" id="installDismiss" aria-label="close">×</button>
        <img class="hdr__logo" style="width:40px;height:40px" src="icons/icon-192.png" alt="">
        <div class="txt"><b>${L({ ja:'ホーム画面に世桜を追加', en:'Add YOSAKURA to Home Screen', vi:'Thêm YOSAKURA vào màn hình' })}</b>
          <span>${L({ ja:'アプリのように起動。世桜のロゴが立ち上がります。', en:'Launch like an app with the YOSAKURA logo.', vi:'Khởi động như ứng dụng với logo YOSAKURA.' })}</span></div>
        <button id="installBtn">${L({ ja:'追加', en:'Add', vi:'Thêm' })}</button>
      </div>` : '';

    let sections = '';
    for (const gid of groups) {
      const apps = APPS.filter(a => a.group === gid && canOpen(a, role)); // 使える機能だけ表示
      if (!apps.length) continue;                                          // 空セクションは非表示
      sections += `
        <div class="sec-h"><span class="bar"></span><h2>${esc(groupName(gid))}</h2></div>
        <div class="grid">${apps.map(a => tileHTML(a, role)).join('')}</div>`;
    }

    const heroBlock = tab === 'home'
      ? `<div class="brandhead"><img class="brandhead__logo" src="icons/logo-full.png" alt="日本料理 世桜 -yosakura-"></div>`
      : `<div class="hero"><h1 class="hero__title">${L({ home:'', genba:{ja:'報告する',en:'Report',vi:'Báo cáo'}, learn:{ja:'学ぶ',en:'Learn',vi:'Học tập'}, hq:{ja:'本部メニュー',en:'HQ Menu',vi:'Menu bộ phận'} }[tab])}</h1></div>`;

    const inner = `
      <main class="screen">
        ${heroBlock}
        ${install}
        ${sections}
        <div class="footer-note">${L({ ja:'世桜アプリ demo ・ 役割と言語で表示が変わります（上部で切替）', en:'YOSAKURA app demo · View changes by role & language (switch at top)', vi:'Demo YOSAKURA · Hiển thị theo vai trò & ngôn ngữ (đổi ở trên)' })}</div>
      </main>`;
    return shell(inner, tab);
  }

  function tileHTML(a, role) {
    if (!canOpen(a, role)) {
      const needRole = a.roles.includes('hq') && a.roles.length === 1 ? ROLES.hq : a.roles.includes('owner') ? ROLES.owner : ROLES.manager;
      return `<div class="tile locked" data-locked="${a.id}">
        <span class="lock">${svg('lock')}</span>
        <div class="ico">${svg(a.icon)}</div>
        <div class="nm">${esc(L(a.name))}</div>
        <div class="desc">${esc(L(a.desc))}</div>
        <span class="need">${esc(L(needRole.label))}${L({ ja:'権限が必要', en:' only', vi:' mới xem được' })}</span>
      </div>`;
    }
    return `<button class="tile" data-open="${a.id}">
      ${a.live ? '<span class="live">● LIVE</span>' : ''}
      <div class="ico">${svg(a.icon)}</div>
      <div class="nm">${esc(L(a.name))}</div>
      <div class="desc">${esc(L(a.desc))}</div>
    </button>`;
  }

  /* ---------- アプリ詳細 ---------- */
  function viewApp(id) {
    if (id === 'guide') { setTimeout(() => openTour(0), 20); return viewHome('learn'); }
    const a = appById(id);
    if (!a) return viewHome('home');
    if (!canOpen(a, getRole())) { toast(L({ ja:'この機能を開く権限がありません', en:'You do not have permission for this', vi:'Bạn không có quyền mở mục này' })); return viewHome('home'); }
    const body = APP_VIEWS[id] ? APP_VIEWS[id](a) : mockGeneric(a);
    const inner = `
      <main class="screen">
        <div class="appbar"><button class="back" id="backBtn">${svg('back')}${L({ ja:'ホーム', en:'Home', vi:'Trang chủ' })}</button></div>
        <div class="app-head">
          <div class="ico">${svg(a.icon)}</div>
          <div><h1>${esc(L(a.name))}</h1><p>${esc(L(a.desc))}</p></div>
        </div>
        ${body}
      </main>`;
    return shell(inner, groupTab(a.group));
  }
  const groupTab = (g) => (g === 'genba' || g === 'learn' || g === 'hq') ? g : 'home';

  const NOTE = (o) => `<p class="mock-note">${L(o)}</p>`;
  const demoImg = { ja:'◆ デモ表示（画面イメージ）', en:'◆ Demo view (mockup)', vi:'◆ Bản demo (mô phỏng)' };

  /* =================== 各アプリ =================== */
  const APP_VIEWS = {};

  /* ① 食べ残し・食材ロス報告（動く）*/
  APP_VIEWS.tabemono = () => {
    const vis = visibleStores();
    const recent = getReports().filter(r => vis.includes(r.store)).sort((x,y)=>y.t-x.t).slice(0,5);
    const segL = (arr) => arr.map((o,i)=>`<button type="button" data-v="${o.v}" class="${i===0?'on':''}">${L(o.t)}</button>`).join('');
    return `
      <div class="card" id="repForm">
        <h3>${L({ ja:'報告する', en:'Report', vi:'Báo cáo' })}</h3>
        <label class="fld"><span>${L({ ja:'種別', en:'Type', vi:'Loại' })}</span>
          <div class="seg" data-seg="kind">
            <button type="button" data-v="a" class="on">${L({ ja:'お客様の食べ残し', en:'Customer leftovers', vi:'Khách để thừa' })}</button>
            <button type="button" data-v="b">${L({ ja:'食材ロス', en:'Ingredient loss', vi:'Hao hụt NL' })}</button>
          </div>
        </label>
        <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span>
          <select id="f_store">${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select>
        </label>
        <label class="fld"><span id="f_item_l">${L({ ja:'メニュー', en:'Menu item', vi:'Món' })}</span>
          <input type="text" id="f_item" placeholder="${L({ ja:'例：うな重（並）', en:'e.g. Unagi rice bowl', vi:'vd: Cơm lươn' })}">
        </label>
        <label class="fld"><span>${L({ ja:'残り具合', en:'Amount left', vi:'Lượng còn lại' })}</span>
          <div class="seg" data-seg="level">${segL(LEVELS_A)}</div>
        </label>
        <label class="fld"><span>${L({ ja:'気づき（任意）', en:'Notes (optional)', vi:'Ghi chú (tùy chọn)' })}</span>
          <textarea id="f_note" placeholder="${L({ ja:'例：ご飯が多いかも／仕込み過ぎ など', en:'e.g. portion too big / over-prepped', vi:'vd: khẩu phần lớn / chuẩn bị dư' })}"></textarea>
        </label>
        <label class="fld"><span>${L({ ja:'写真（任意・複数可）', en:'Photos (optional, multiple)', vi:'Ảnh (tùy chọn, nhiều ảnh)' })}</span>
          <div class="photo-drop" id="photoDrop">
            <div class="ph-ico">${svg('camera')}</div>
            <div><b style="font-size:13px">${L({ ja:'写真を追加', en:'Add photos', vi:'Thêm ảnh' })}</b><br><small>${L({ ja:'複数枚OK／お皿を下げてから・料理だけを撮影', en:'Multiple OK / after clearing table, dish only', vi:'Nhiều ảnh OK / sau khi dọn bàn, chỉ chụp món' })}</small></div>
            <input type="file" accept="image/*" multiple id="f_photo" hidden>
          </div>
          <div class="photo-thumbs" id="photoThumbs"></div>
        </label>
        <button class="btn-primary" id="submitRep">${L({ ja:'報告する', en:'Submit', vi:'Gửi báo cáo' })}</button>
        <div class="hint">${L({ ja:'※デモ：この端末に保存され、下と「本部ダッシュボード」に反映されます', en:'Demo: saved on this device and shown below and in the HQ Dashboard', vi:'Demo: lưu trên máy này, hiển thị bên dưới và ở Bảng điều khiển' })}</div>
      </div>
      <div class="card">
        <h3>${L({ ja:'最近の報告', en:'Recent reports', vi:'Báo cáo gần đây' })}</h3>
        <div id="recentList">${recent.length ? recent.map(repRow).join('') : `<div class="muted">${L({ ja:'まだ報告がありません', en:'No reports yet', vi:'Chưa có báo cáo' })}</div>`}</div>
      </div>`;
  };
  const repRow = (r) => `
    <div class="rep">
      <span class="kind ${r.kind}">${r.kind==='a'?L({ja:'お客様',en:'Guest',vi:'Khách'}):L({ja:'ロス',en:'Loss',vi:'Hao hụt'})}</span>
      <div class="body">
        <div class="l1">${esc(r.item||L({ja:'（品目未記入）',en:'(no item)',vi:'(chưa nhập)'}))}</div>
        <div class="l2">${esc(r.store)} ・ ${timeAgo(r.t)}${r.note?' ・ '+esc(L(r.note)):''}</div>
        ${(r.photos && r.photos.length) ? `<div class="rep-photos">${r.photos.map(p=>`<img class="rep-photo" src="${photoThumb(p)}" alt="" data-full="${photoFull(p)}" loading="lazy">`).join('')}</div>` : ''}
      </div>
      <span class="amt">${esc(levelLabel(r.level))}</span>
    </div>`;

  /* ② 一食目写真（モック）*/
  APP_VIEWS.firstphoto = () => `
    ${NOTE(demoImg)}
    <div class="card">
      <h3>${L({ ja:'提供直後の一枚を報告', en:'Report the first serving photo', vi:'Gửi ảnh món vừa phục vụ' })}</h3>
      <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select>${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
      <label class="fld"><span>${L({ ja:'メニュー', en:'Menu item', vi:'Món' })}</span><input type="text" placeholder="${L({ja:'例：海鮮丼',en:'e.g. Seafood bowl',vi:'vd: Cơm hải sản'})}"></label>
      <label class="fld"><span>${L({ ja:'写真', en:'Photo', vi:'Ảnh' })}</span>
        <div class="photo-drop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ja:'撮影して追加',en:'Take a photo',vi:'Chụp ảnh'})}</b><br><small>${L({ja:'盛付の基準チェックに使用',en:'Used to check plating standards',vi:'Dùng để kiểm tra cách trình bày'})}</small></div></div>
      </label>
      <button class="btn-primary" onclick="return false">${L({ja:'送信（デモ）',en:'Send (demo)',vi:'Gửi (demo)'})}</button>
      <div class="hint">${L({ ja:'本番ではAIが盛付を一次判定 → 基準外のみ本部へ通知する構想', en:'In production, AI pre-checks plating and only flags issues to HQ', vi:'Bản chính: AI kiểm tra trình bày, chỉ báo HQ khi bất thường' })}</div>
    </div>`;

  /* ③ 開店・清掃チェック（動く）*/
  const CHECK_ITEMS = [
    { ja:'制服・身だしなみ', en:'Uniform & grooming', vi:'Đồng phục & tác phong' },
    { ja:'手洗い・消毒', en:'Handwash & sanitize', vi:'Rửa tay & khử khuẩn' },
    { ja:'冷蔵庫の温度確認', en:'Fridge temperature', vi:'Nhiệt độ tủ lạnh' },
    { ja:'客席・テーブル清掃', en:'Seats & tables cleaning', vi:'Vệ sinh bàn ghế' },
    { ja:'トイレ清掃', en:'Restroom cleaning', vi:'Vệ sinh nhà vệ sinh' },
    { ja:'ゴミ・廃棄処理', en:'Trash & disposal', vi:'Rác & xử lý' },
    { ja:'当日の予約確認', en:'Today reservations', vi:'Đặt chỗ hôm nay' },
    { ja:'POP・季節メニュー確認', en:'POP & seasonal menu', vi:'POP & thực đơn mùa' }
  ];
  APP_VIEWS.checklist = () => {
    const done = JSON.parse(localStorage.getItem(LS.checks) || '{}');
    const n = CHECK_ITEMS.filter((_,i)=>done[i]).length;
    return `
      <div class="card">
        <h3>${L({ ja:'本日の開店前チェック', en:'Today pre-open check', vi:'Kiểm tra trước mở cửa' })}（${n}/${CHECK_ITEMS.length}）</h3>
        <div id="checkList">
          ${CHECK_ITEMS.map((it,i)=>`<div class="check ${done[i]?'done':''}" data-ci="${i}"><span class="box">${svg('tick')}</span><span class="lbl">${esc(L(it))}</span></div>`).join('')}
        </div>
      </div>
      <div class="hint">${L({ ja:'※デモ：チェックはこの端末に保存されます', en:'Demo: checks are saved on this device', vi:'Demo: lưu trạng thái trên máy này' })}</div>`;
  };

  /* ④ マニュアル（モック）*/
  const MANUAL = [
    ['01','book',{ja:'店舗の世界観・理念',en:'Brand & Philosophy',vi:'Thương hiệu & Triết lý'},{ja:'世桜とは／5つの価値／世桜10訓',en:'About YOSAKURA / 5 values / 10 rules',vi:'Về YOSAKURA / 5 giá trị / 10 quy tắc'}],
    ['02','check',{ja:'スタッフの基本',en:'Staff Basics',vi:'Cơ bản nhân viên'},{ja:'ハウスルール／シフト／優先順位',en:'House rules / shifts / priorities',vi:'Nội quy / ca / ưu tiên'}],
    ['03','star',{ja:'接客・ホール',en:'Service & Hall',vi:'Phục vụ & Sảnh'},{ja:'おもてなし／クレーム対応／サーベイ',en:'Hospitality / complaints / survey',vi:'Hiếu khách / khiếu nại / khảo sát'}],
    ['04','gauge',{ja:'集客・マーケ',en:'Marketing',vi:'Marketing'},{ja:'Google口コミ／導線／冊子',en:'Google reviews / funnel / booklet',vi:'Đánh giá Google / phễu / sổ tay'}],
    ['05','video',{ja:'衛生管理',en:'Hygiene',vi:'Vệ sinh'},{ja:'清掃ルール／食中毒対策／食材管理',en:'Cleaning / food safety / ingredients',vi:'Vệ sinh / an toàn TP / nguyên liệu'}]
  ];
  APP_VIEWS.manual = () => `
    ${NOTE({ ja:'◆ デモ表示（本部マニュアル目次に沿った構成）', en:'◆ Demo (based on the HQ manual index)', vi:'◆ Demo (theo mục lục cẩm nang HQ)' })}
    <div class="card">
      ${MANUAL.map(([no,ic,t,s])=>`<div class="mrow" data-mock="1"><div class="mi">${svg(ic)}</div><div class="mt"><b>${no}. ${esc(L(t))}</b><span>${esc(L(s))}</span></div><span class="chev">${svg('chev')}</span></div>`).join('')}
    </div>
    <div class="hint">${L({ ja:'動画マニュアルもこの中に統合していく構想', en:'Video manuals will also be integrated here', vi:'Cẩm nang video cũng sẽ được tích hợp' })}</div>`;

  /* ⑤ サーベイ（モック）*/
  APP_VIEWS.survey = () => `
    ${NOTE(demoImg)}
    <div class="card">
      <h3>${L({ ja:'お客様サーベイ', en:'Customer Survey', vi:'Khảo sát khách hàng' })}</h3>
      <p class="muted">${L({ ja:'お客様がiPad／スマホで回答するアンケート。回答は本部に自動集約され、店舗改善に活用します。', en:'Guests answer on iPad/phone. Responses auto-collect at HQ to improve stores.', vi:'Khách trả lời trên iPad/điện thoại. Kết quả tự tổng hợp về HQ để cải thiện.' })}</p>
      <div class="mrow" data-mock="1"><div class="mi">${svg('star')}</div><div class="mt"><b>${L({ja:'QRコードを表示',en:'Show QR code',vi:'Hiện mã QR'})}</b><span>${L({ja:'卓上・お会計時にご案内',en:'On table / at checkout',vi:'Trên bàn / khi thanh toán'})}</span></div><span class="chev">${svg('chev')}</span></div>
      <div class="mrow" data-mock="1"><div class="mi">${svg('table')}</div><div class="mt"><b>${L({ja:'回答を見る',en:'View responses',vi:'Xem phản hồi'})}</b><span>${L({ja:'満足度・自由記述の集計',en:'Satisfaction & comments',vi:'Mức hài lòng & nhận xét'})}</span></div><span class="chev">${svg('chev')}</span></div>
    </div>`;

  /* ⑥ 総括表（モック）*/
  APP_VIEWS.soukatsu = () => `
    ${NOTE({ ja:'◆ 実際の日報フォーマットに準拠（デモ数値）', en:'◆ Based on the real daily report format (demo figures)', vi:'◆ Theo mẫu báo cáo ngày thực tế (số liệu demo)' })}
    <div class="card">
      <h3>${L({ ja:'本日の総括表', en:'Daily report', vi:'Báo cáo ngày' })}</h3>
      <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select>${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
      <div class="stat-row">
        <div class="stat"><div class="n">¥186,817</div><div class="k">${L({ja:'当日売上',en:'Sales',vi:'Doanh thu'})}</div></div>
        <div class="stat"><div class="n">16</div><div class="k">${L({ja:'客数',en:'Guests',vi:'Khách'})}</div></div>
        <div class="stat"><div class="n">¥11,676</div><div class="k">${L({ja:'客単価',en:'Per guest',vi:'BQ/khách'})}</div></div>
      </div>
      ${soukatsuRow(L({ja:'月累計 / 目標到達',en:'Month total / to goal',vi:'Lũy kế / mục tiêu'}), '¥4,278,725', '77.4%')}
      ${soukatsuRow(L({ja:'口コミ（当日 / 累計）',en:'Reviews (today / total)',vi:'Đánh giá (nay / tổng)'}), '2', '70')}
      ${soukatsuRow(L({ja:'ヒアリング（当日）',en:'Hearings (today)',vi:'Phỏng vấn (nay)'}), '9', '')}
      ${soukatsuRow(L({ja:'原価率 / 人件費率（FL）',en:'Food / Labor (FL)',vi:'Giá vốn / nhân sự'}), '36.5%', '23.6%')}
      ${soukatsuRow(L({ja:'チップ（当日 / 累計）',en:'Tips (today / total)',vi:'Tip (nay / tổng)'}), '¥21,000', '¥84,541')}
      ${soukatsuRow(L({ja:'キャンセル（累計）',en:'Cancellations (total)',vi:'Hủy (tổng)'}), '¥31,700', '')}
      <label class="fld" style="margin-top:14px"><span>${L({ ja:'清掃・特記事項', en:'Cleaning & notes', vi:'Vệ sinh & ghi chú' })}</span><textarea placeholder="${L({ja:'本日の気づき・清掃箇所など',en:'Findings, cleaning done, etc.',vi:'Ghi chú, vệ sinh đã làm...'})}"></textarea></label>
      <label class="fld"><span>${L({ ja:'翌日の食材発注', en:'Tomorrow ingredient order', vi:'Đặt NL ngày mai' })}</span><textarea placeholder="${L({ja:'例：豆乳6／寿司のエビ2／お米 …',en:'e.g. soy milk 6 / shrimp 2 / rice …',vi:'vd: sữa đậu 6 / tôm 2 / gạo …'})}"></textarea></label>
      <button class="btn-primary" onclick="return false">${L({ja:'提出（デモ）',en:'Submit (demo)',vi:'Nộp (demo)'})}</button>
    </div>`;
  const soukatsuRow = (label, a, b) => `<div class="bar-row" style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding:9px 2px"><span style="font-size:12.5px;color:var(--gray)">${esc(label)}</span><b style="font-size:14px">${esc(a)}${b?` <span style="color:var(--gray);font-weight:400">/ ${esc(b)}</span>`:''}</b></div>`;

  /* ⑦ 開業スケジュール D-90（モック）*/
  const TL = [
    ['D-90',{ja:'加盟契約締結・キックオフMTG',en:'Franchise contract & kickoff',vi:'Ký hợp đồng & khởi động'}],
    ['D-75',{ja:'物件確定・現地調査・業態提案',en:'Site fixed, survey, format',vi:'Chốt mặt bằng, khảo sát'}],
    ['D-60',{ja:'内装発注／SNS・MEO・採用開始',en:'Interior order / SNS / hiring',vi:'Đặt nội thất / SNS / tuyển'}],
    ['D-30',{ja:'許認可申請・行政検査・備品搬入',en:'Permits, inspection, equipment',vi:'Giấy phép, kiểm tra, thiết bị'}],
    ['D-14',{ja:'研修・現地入り・仕込み・オペ確認',en:'Training, on-site prep, ops check',vi:'Đào tạo, chuẩn bị, kiểm tra'}],
    ['D-Day',{ja:'オープン（本部が現地サポート）',en:'Opening (HQ on-site support)',vi:'Khai trương (HQ hỗ trợ)'}]
  ];
  APP_VIEWS.schedule = () => `
    ${NOTE({ ja:'◆ デモ表示（開業マスター工程）', en:'◆ Demo (opening master plan)', vi:'◆ Demo (kế hoạch khai trương)' })}
    <div class="card"><div class="tl">
      ${TL.map(([d,t])=>`<div class="ev"><div class="d">${d}</div><div class="t">${esc(L(t))}</div></div>`).join('')}
    </div></div>`;

  /* ⑧ 数値・PL（モック）*/
  APP_VIEWS.pl = () => `
    ${NOTE(demoImg)}
    <div class="card">
      <h3>${L({ ja:'今月の損益（サンプル）', en:'This month P/L (sample)', vi:'P/L tháng này (mẫu)' })}</h3>
      ${bar(L({ja:'売上',en:'Sales',vi:'Doanh thu'}),100)}${bar(L({ja:'原価',en:'Cost',vi:'Giá vốn'}),32)}${bar(L({ja:'人件費',en:'Labor',vi:'Nhân sự'}),28)}${bar(L({ja:'その他経費',en:'Other',vi:'Khác'}),18)}${bar(L({ja:'営業利益',en:'Op. profit',vi:'Lợi nhuận'}),22,true)}
      <p class="muted" style="margin-top:12px">${L({ ja:'300店フェーズでは、全店のPLを同じ様式で本部が一覧・比較できる構想。', en:'At 300 stores, HQ can list and compare every P/L in one format.', vi:'Ở quy mô 300 cửa hàng, HQ so sánh mọi P/L cùng định dạng.' })}</p>
    </div>`;

  /* ⑨ 本部ダッシュボード（動く）*/
  APP_VIEWS.dashboard = () => {
    const vis = visibleStores();
    const reps = getReports().filter(r => vis.includes(r.store));
    const a = reps.filter(r=>r.kind==='a').length, b = reps.filter(r=>r.kind==='b').length;
    const byStore = {}; reps.forEach(r => byStore[r.store] = (byStore[r.store]||0)+1);
    const max = Math.max(1, ...Object.values(byStore));
    const rows = Object.entries(byStore).sort((x,y)=>y[1]-x[1]);
    const recent = reps.slice().sort((x,y)=>y.t-x.t).slice(0,6);
    return `
      ${NOTE({ ja:'◆ 現場の「食べ残し報告」がここに自動集約されます（実データ連動）', en:'◆ Field reports auto-aggregate here (live data)', vi:'◆ Báo cáo hiện trường tự tổng hợp (dữ liệu thật)' })}
      <div class="stat-row">
        <div class="stat"><div class="n">${reps.length}</div><div class="k">${L({ja:'総報告数',en:'Total',vi:'Tổng'})}</div></div>
        <div class="stat"><div class="n">${a}</div><div class="k">${L({ja:'お客様の残し',en:'Leftovers',vi:'Đồ thừa'})}</div></div>
        <div class="stat"><div class="n">${b}</div><div class="k">${L({ja:'食材ロス',en:'Loss',vi:'Hao hụt'})}</div></div>
      </div>
      <div class="card">
        <h3>${L({ ja:'店舗別の報告数', en:'Reports by store', vi:'Báo cáo theo cửa hàng' })}</h3>
        ${rows.map(([s,c])=>`<div class="bar-row"><div class="bl"><span>${esc(s)}</span><b>${c}${L({ja:'件',en:'',vi:''})}</b></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(c/max*100)}%"></div></div></div>`).join('') || `<div class="muted">${L({ja:'データがありません',en:'No data',vi:'Chưa có dữ liệu'})}</div>`}
      </div>
      <div class="card"><h3>${L({ ja:'最新の報告', en:'Latest reports', vi:'Báo cáo mới nhất' })}</h3>${recent.map(repRow).join('')}</div>`;
  };

  /* ⑩ 月例MTG（一元管理・実データ）*/
  const MTG = [
    [{ja:'富士山2店舗（鰻・牛カツ）',en:'Fujisan 2 stores (Unagi/Gyukatsu)',vi:'2 cửa hàng Fujisan'}, '第4木 18:00',
      [{ja:'サーベイ',en:'Survey',vi:'Khảo sát'},{ja:'Google口コミ用POP',en:'Google review POP',vi:'POP đánh giá Google'},{ja:'A型看板',en:'A-frame sign',vi:'Bảng chữ A'},{ja:'ポストカード4種',en:'4 postcards',vi:'4 bưu thiếp'},{ja:'和牛BOX見積',en:'Wagyu box quote',vi:'Báo giá hộp wagyu'},{ja:'3店舗目の商談',en:'3rd store talk',vi:'Cửa hàng thứ 3'},{ja:'お茶（桐箱）オペ',en:'Tea (paulownia box)',vi:'Trà (hộp gỗ)'}]],
    [{ja:'寿司世桜 心斎橋店',en:'Sushi Yosakura Shinsaibashi',vi:'Sushi Yosakura Shinsaibashi'}, '第4木 16:00',
      [{ja:'小冊子',en:'Booklet',vi:'Sổ tay'},{ja:'日本文化の説明',en:'Japanese culture talk',vi:'Văn hóa Nhật'},{ja:'シャリ合わせ',en:'Rice tuning',vi:'Chỉnh cơm'},{ja:'ザル',en:'Bamboo basket',vi:'Rổ tre'},{ja:'照明',en:'Lighting',vi:'Ánh sáng'},{ja:'ランチメニュー',en:'Lunch menu',vi:'Thực đơn trưa'},{ja:'サーベイ',en:'Survey',vi:'Khảo sát'}]],
    [{ja:'日本鰻世桜 京都祇園店',en:'Unagi Yosakura Kyoto Gion',vi:'Unagi Yosakura Kyoto Gion'}, '第4木 15:00',
      [{ja:'口コミ返信',en:'Review replies',vi:'Trả lời đánh giá'},{ja:'売価設定FIX',en:'Price finalize',vi:'Chốt giá'},{ja:'サーベイ',en:'Survey',vi:'Khảo sát'},{ja:'7DAYSヒアリング',en:'7DAYS hearing',vi:'Phỏng vấn 7DAYS'},{ja:'MEO/SEOの本部区分',en:'MEO/SEO ownership',vi:'Phân chia MEO/SEO'}]],
    [{ja:'日本鰻世桜 長堀橋店',en:'Unagi Yosakura Nagahoribashi',vi:'Unagi Yosakura Nagahoribashi'}, '第4木 16:30',
      [{ja:'梅酒の状況',en:'Plum wine status',vi:'Tình hình rượu mơ'},{ja:'サーベイ',en:'Survey',vi:'Khảo sát'},{ja:'メニュー',en:'Menu',vi:'Thực đơn'},{ja:'蛍の演出',en:'Firefly staging',vi:'Trình diễn đom đóm'}]],
    [{ja:'日本鰻世桜 浅草橋店',en:'Unagi Yosakura Asakusabashi',vi:'Unagi Yosakura Asakusabashi'}, '第4水 15:00',
      [{ja:'和牛',en:'Wagyu',vi:'Wagyu'},{ja:'ガスバーナーケース',en:'Gas burner case',vi:'Hộp đèn khò'},{ja:'サーベイ',en:'Survey',vi:'Khảo sát'},{ja:'TIP BOX',en:'Tip box',vi:'Hộp tip'},{ja:'ハラール状況',en:'Halal status',vi:'Tình hình Halal'},{ja:'マニュアル見直し',en:'Manual review',vi:'Rà soát cẩm nang'}]],
    [{ja:'和牛世桜 広島店',en:'Wagyu Yosakura Hiroshima',vi:'Wagyu Yosakura Hiroshima'}, '第4木 18:00',
      [{ja:'Google口コミ',en:'Google reviews',vi:'Đánh giá Google'},{ja:'総括表の記入',en:'Daily summary entry',vi:'Nhập tổng kết'},{ja:'商品別売上構成比',en:'Sales mix by item',vi:'Cơ cấu doanh thu'},{ja:'盛付・一食目共有',en:'Plating / first-plate',vi:'Trình bày / món đầu'},{ja:'店内動画共有',en:'In-store video',vi:'Video trong quán'},{ja:'藁焼きの声がけ',en:'Straw-grill call-out',vi:'Mời khách nướng rơm'},{ja:'サーベイ',en:'Survey',vi:'Khảo sát'}]]
  ];
  const whenL = (w) => w.replace('第4木', L({ja:'毎月 第4木',en:'4th Thu',vi:'Thứ 5 tuần 4'})).replace('第4水', L({ja:'毎月 第4水',en:'4th Wed',vi:'Thứ 4 tuần 4'}));
  // 店舗 → MTGインデックス（自店の議題のみ表示するため）
  const MTG_OF = { '牛カツ世桜 富士山店':0, '日本鰻世桜 富士山店':0, '寿司世桜 心斎橋店':1, '日本鰻世桜 京都祇園店':2, '日本鰻世桜 長堀橋店':3, '日本鰻世桜 浅草橋店':4, '和牛世桜 広島店':5 };
  APP_VIEWS.mtg = () => {
    const isHQ = getRole() === 'hq' && getStoreSel() === 'all';
    const vis = visibleStores();
    const idx = isHQ ? MTG.map((_,i)=>i) : [...new Set(vis.map(s=>MTG_OF[s]).filter(i=>i!==undefined))];
    const list = idx.map(i=>MTG[i]);
    return `
      ${NOTE(isHQ ? { ja:'◆ 全店の月例MTGと議題を一元管理（実データ反映）', en:'◆ All stores monthly meetings & agendas (live data)', vi:'◆ Họp & nội dung mọi cửa hàng (dữ liệu thật)' } : { ja:'◆ 自店の月例MTGと議題（実データ反映）', en:'◆ Your store monthly meeting & agenda (live data)', vi:'◆ Họp & nội dung cửa hàng của bạn (dữ liệu thật)' })}
      ${list.length ? list.map(([name,when,items])=>`
        <div class="card">
          <div class="mtg-h"><h3>${esc(L(name))}</h3><span class="muted">${esc(whenL(when))}</span></div>
          <div class="chips">${items.map(t=>`<span class="chip">${esc(L(t))}</span>`).join('')}</div>
        </div>`).join('') : `<div class="card"><p class="muted">${L({ ja:'自店の月例MTGはまだ登録されていません。', en:'No monthly meeting registered for your store yet.', vi:'Chưa có lịch họp cho cửa hàng của bạn.' })}</p></div>`}`;
  };

  /* ⑪ 課題・タスク管理（一元管理・実データ）*/
  const ST = { doing:{ja:'進行中',en:'In progress',vi:'Đang làm'}, done:{ja:'完了',en:'Done',vi:'Xong'}, new:{ja:'新規',en:'New',vi:'Mới'} };
  const WHO = { hq:{ja:'本部',en:'HQ',vi:'HQ'}, dev:{ja:'商品開発',en:'Product dev',vi:'Phát triển SP'} };
  const CAT = { billing:{ja:'請求',en:'Billing',vi:'Hóa đơn'}, quality:{ja:'品質',en:'Quality',vi:'Chất lượng'}, video:{ja:'動画マニュアル',en:'Video manual',vi:'Video'}, manual:{ja:'マニュアル',en:'Manual',vi:'Cẩm nang'}, submit:{ja:'提出物',en:'Submissions',vi:'Tài liệu'}, review:{ja:'口コミ',en:'Reviews',vi:'Đánh giá'}, supply:{ja:'備品',en:'Supplies',vi:'Vật tư'}, edu:{ja:'教育',en:'Training',vi:'Đào tạo'}, open:{ja:'開業支援',en:'Opening',vi:'Khai trương'} };
  const TASKS = [
    ['doing','billing',{ja:'他業者の請求フロー一覧の作成',en:'Build vendor billing flow list',vi:'Lập danh sách quy trình hóa đơn'},'hq'],
    ['new','quality',{ja:'食べ残し・食材ロスを本部へ共有する仕組み',en:'System to share food waste to HQ',vi:'Cơ chế chia sẻ đồ thừa lên HQ'},'hq'],
    ['doing','video',{ja:'動画化する項目と参考動画の選定',en:'Pick items & reference videos',vi:'Chọn mục & video tham khảo'},'hq'],
    ['doing','manual',{ja:'レシピ全体の見直し（見やすさ・使いやすさ）',en:'Revamp all recipes for usability',vi:'Rà soát công thức cho dễ dùng'},'dev'],
    ['doing','submit',{ja:'提出物管理シートの運用ルール整備',en:'Set submission sheet rules',vi:'Quy tắc bảng nộp tài liệu'},'hq'],
    ['doing','review',{ja:'ネガティブ口コミの確認・報告フロー化',en:'Flow for negative reviews',vi:'Quy trình đánh giá tiêu cực'},'hq'],
    ['doing','supply',{ja:'備品発注・在庫管理シートの整備',en:'Supply order & stock sheet',vi:'Bảng đặt & tồn kho vật tư'},'hq'],
    ['new','edu',{ja:'キャリアアップテストの雛形作成',en:'Career-up test template',vi:'Mẫu bài kiểm tra thăng hạng'},'hq'],
    ['done','manual',{ja:'祝いカードの記入・スタンプ運用の追加',en:'Celebration card & stamp rule',vi:'Quy tắc thiệp & con dấu'},'hq'],
    ['done','open',{ja:'現地研修用チェックリストの作成',en:'On-site training checklist',vi:'Checklist đào tạo tại chỗ'},'hq']
  ];
  APP_VIEWS.tasks = () => {
    const cnt = (s) => TASKS.filter(t=>t[0]===s).length;
    const cls = { doing:'st-doing', done:'st-done', new:'st-new' };
    return `
      ${NOTE({ ja:'◆ 本部の全課題を担当・状況で一元管理（実データ反映）', en:'◆ All HQ tasks centralized by owner & status (live data)', vi:'◆ Quản lý tập trung công việc HQ theo phụ trách & trạng thái' })}
      <div class="stat-row">
        <div class="stat"><div class="n">${TASKS.length}</div><div class="k">${L({ja:'総課題',en:'Total',vi:'Tổng'})}</div></div>
        <div class="stat"><div class="n">${cnt('doing')+cnt('new')}</div><div class="k">${L({ja:'対応中',en:'Active',vi:'Đang xử lý'})}</div></div>
        <div class="stat"><div class="n">${cnt('done')}</div><div class="k">${L({ja:'完了',en:'Done',vi:'Xong'})}</div></div>
      </div>
      <div class="card">
        ${TASKS.map(([st,cat,title,who])=>`<div class="rep"><span class="stag ${cls[st]}">${esc(L(ST[st]))}</span><div class="body"><div class="l1">${esc(L(title))}</div><div class="l2">${esc(L(CAT[cat]))} ・ ${L({ja:'担当',en:'Owner',vi:'Phụ trách'})}：${esc(L(WHO[who]))}</div></div></div>`).join('')}
      </div>`;
  };

  /* ⑫ 請求・支払管理（一元管理）*/
  const VENDORS = [
    [{ja:'山口陶器',en:'Yamaguchi Toki',vi:'Yamaguchi Toki'},{ja:'食器',en:'Tableware',vi:'Chén đĩa'},{ja:'メール請求',en:'Email invoice',vi:'Hóa đơn email'},{ja:'月末締め',en:'Month-end',vi:'Cuối tháng'}],
    [{ja:'丸眞',en:'Marushin',vi:'Marushin'},{ja:'おしぼり 等',en:'Towels etc.',vi:'Khăn v.v.'},{ja:'郵送請求',en:'Postal invoice',vi:'Hóa đơn bưu điện'},{ja:'月末締め',en:'Month-end',vi:'Cuối tháng'}],
    [{ja:'亀池商店',en:'Kameike Shoten',vi:'Kameike Shoten'},{ja:'箸',en:'Chopsticks',vi:'Đũa'},{ja:'担当へ直接請求',en:'Direct to staff',vi:'Trực tiếp cho NV'},{ja:'都度',en:'Each time',vi:'Mỗi lần'}],
    [{ja:'かねさし',en:'Kanesashi',vi:'Kanesashi'},{ja:'食材',en:'Ingredients',vi:'Nguyên liệu'},{ja:'発注・在庫連携',en:'Order/stock linked',vi:'Liên kết đặt/tồn'},{ja:'週次',en:'Weekly',vi:'Hàng tuần'}],
    [{ja:'株式会社ZEST',en:'ZEST Inc.',vi:'ZEST'},{ja:'倉庫・発送',en:'Warehouse/shipping',vi:'Kho/vận chuyển'},{ja:'手配チェック＋請求書',en:'Handling check + invoice',vi:'Kiểm tra + hóa đơn'},{ja:'都度',en:'Each time',vi:'Mỗi lần'}]
  ];
  APP_VIEWS.invoice = () => `
    ${NOTE({ ja:'◆ 高原社長のご要望「誰へ・締日・支払方法の一覧化」を一元管理', en:'◆ Centralize who/cutoff/method of billing (per CEO request)', vi:'◆ Quản lý tập trung ai/kỳ hạn/cách thanh toán' })}
    <div class="card">
      <h3>${L({ ja:'取引先マスター', en:'Vendor master', vi:'Danh sách nhà cung cấp' })}</h3>
      ${VENDORS.map(([n,k,how,when])=>`<div class="rep"><div class="body"><div class="l1">${esc(L(n))} <span class="muted" style="font-weight:400">・ ${esc(L(k))}</span></div><div class="l2">${esc(L(how))}</div></div><span class="amt" style="color:var(--sumi)">${esc(L(when))}</span></div>`).join('')}
      <button class="btn-primary" style="margin-top:14px" onclick="return false">${L({ja:'請求書の受領状況を確認（デモ）',en:'Check invoice status (demo)',vi:'Kiểm tra hóa đơn (demo)'})}</button>
    </div>
    <p class="hint">${L({ ja:'本部宛か担当直送かが混在していた請求を一覧で見える化。備品POP等は納品後ロイヤリティに加算して加盟店へ請求。', en:'Makes billing routes visible. Supplies/POP are billed to franchisees via royalty after delivery.', vi:'Làm rõ luồng hóa đơn. Vật tư/POP tính cho cửa hàng qua royalty sau khi giao.' })}</p>`;

  /* ⑬ スタッフ評価・面談（モック）*/
  const RANKS = [
    ['S',{ja:'店長代行クラス',en:'Deputy manager',vi:'Phó quản lý'},{ja:'時間帯/日別の責任者・店長代行（時給+300円）',en:'Shift lead / deputy (+300 yen/h)',vi:'Trưởng ca / phó QL (+300 yen/h)'}],
    ['L',{ja:'リーダー',en:'Leader',vi:'Trưởng nhóm'},{ja:'新人育成を担当・全部門をカバー',en:'Trains newcomers, all sections',vi:'Đào tạo nhân viên mới, mọi bộ phận'}],
    ['A',{ja:'一人前',en:'Full member',vi:'Thành thạo'},{ja:'基本の営業が一通りできる',en:'Handles core operations',vi:'Làm được nghiệp vụ cơ bản'}],
    ['B',{ja:'新人',en:'Newcomer',vi:'Mới vào'},{ja:'入って間もないスタッフ',en:'Recently joined staff',vi:'Nhân viên mới'}]
  ];
  APP_VIEWS.hr = () => `
    ${NOTE({ ja:'◆ キャリアアップ制度・面談を一元管理（イメージ）', en:'◆ Career ranks & interviews, centralized (mockup)', vi:'◆ Xếp hạng & phỏng vấn tập trung (mô phỏng)' })}
    <div class="card">
      <h3>${L({ ja:'ランク制度', en:'Rank system', vi:'Hệ thống xếp hạng' })}</h3>
      ${RANKS.map(([r,t,d])=>`<div class="rep"><span class="rankb">${r}</span><div class="body"><div class="l1">${esc(L(t))}</div><div class="l2">${esc(L(d))}</div></div></div>`).join('')}
    </div>
    <div class="card">
      <h3>${L({ ja:'面談', en:'Interviews', vi:'Phỏng vấn' })}</h3>
      <div class="chips"><span class="chip">${L({ja:'年4回（3・6・9・12月）',en:'4x/year (Mar/Jun/Sep/Dec)',vi:'4 lần/năm (3/6/9/12)'})}</span><span class="chip">${L({ja:'1ヶ月前に予約',en:'Book 1 month ahead',vi:'Đặt trước 1 tháng'})}</span><span class="chip">${L({ja:'1回30分',en:'30 min each',vi:'30 phút/lần'})}</span></div>
      <p class="muted" style="margin-top:10px">${L({ ja:'評価は7DAYS／面談評価シート／目標設定で実施。時給は面談の翌月に反映。', en:'Evaluated via 7DAYS / review sheet / goals. Pay updates next month.', vi:'Đánh giá qua 7DAYS / phiếu / mục tiêu. Lương cập nhật tháng sau.' })}</p>
    </div>`;

  /* ⑭ 提出物管理（モック）*/
  APP_VIEWS.teishutsu = () => {
    const S = { in:{ja:'提出済',en:'Submitted',vi:'Đã nộp'}, out:{ja:'未提出',en:'Missing',vi:'Chưa nộp'} };
    const vis = visibleStores();
    const data = [['日本鰻世桜 富士山店','in','—'],['牛カツ世桜 富士山店','in','—'],['寿司世桜 心斎橋店','in','—'],['日本鰻世桜 長堀橋店','in','—'],['日本鰻世桜 京都祇園店','out','1'],['日本鰻世桜 浅草橋店','in','—'],['和牛世桜 広島店','out','3']].filter(([s])=>vis.includes(s));
    return `
      ${NOTE({ ja:'◆ デモ表示（提出状況の自動集約イメージ）', en:'◆ Demo (auto-aggregated submission status)', vi:'◆ Demo (tổng hợp trạng thái nộp)' })}
      <div class="card">
        <h3>${L({ ja:'本日の提出状況', en:'Today submissions', vi:'Trạng thái nộp hôm nay' })}</h3>
        ${data.map(([s,st,d])=>`<div class="rep"><span class="kind ${st==='in'?'b':'a'}">${L(S[st])}</span><div class="body"><div class="l1">${esc(s)}</div><div class="l2">${st==='out'?L({ja:'未提出',en:'Missing',vi:'Chưa nộp'})+' '+d+L({ja:'日',en:'d',vi:' ngày'}):L({ja:'期限内',en:'On time',vi:'Đúng hạn'})}</div></div></div>`).join('')}
        <button class="btn-primary" style="margin-top:14px" onclick="return false">${L({ja:'未提出店に連絡文を自動生成（デモ）',en:'Auto-draft reminder to missing stores (demo)',vi:'Tự soạn nhắc cửa hàng chưa nộp (demo)'})}</button>
      </div>`;
  };

  /* ⑮ 防犯カメラ（モック）*/
  APP_VIEWS.camera = () => `
    ${NOTE(demoImg)}
    <div class="card">
      <h3>${L({ ja:'全店カメラ（本部アカウント）', en:'All-store cameras (HQ account)', vi:'Camera mọi cửa hàng (HQ)' })}</h3>
      <div class="grid">
        ${visibleStores().map(s=>`<div class="tile" data-mock="1" style="min-height:92px"><div class="ico">${svg('video')}</div><div class="nm" style="font-size:12px">${esc(s)}</div><div class="desc">${L({ja:'ライブ / 録画',en:'Live / Rec',vi:'Trực tiếp / Ghi'})}</div></div>`).join('')}
      </div>
      <p class="muted" style="margin-top:12px">${L({ ja:'監視ではなくブランド品質維持・加盟店支援のための確認。倍速で要点のみ確認。', en:'Not surveillance: quality & franchisee support. Review key moments at high speed.', vi:'Không phải giám sát: hỗ trợ chất lượng. Xem nhanh các điểm chính.' })}</p>
    </div>`;

  /* 備品・食材の発注（加盟店パートナーズに準拠）*/
  const ORDER_ITEMS = [
    { n:{ja:'世桜BOOK',en:'YOSAKURA BOOK',vi:'YOSAKURA BOOK'}, k:{ja:'冊子',en:'Booklet',vi:'Sổ'} },
    { n:{ja:'祝カード',en:'Celebration card',vi:'Thiệp chúc mừng'}, k:{ja:'カード',en:'Card',vi:'Thiệp'} },
    { n:{ja:'ショッパー',en:'Shopper bag',vi:'Túi giấy'}, k:{ja:'袋',en:'Bag',vi:'Túi'} },
    { n:{ja:'食べ方POP（鰻/牛カツ/和牛）',en:'How-to-eat POP',vi:'POP cách ăn'}, k:{ja:'POP',en:'POP',vi:'POP'} },
    { n:{ja:'牛カツサンド箱',en:'Gyukatsu sando box',vi:'Hộp sando'}, k:{ja:'箱',en:'Box',vi:'Hộp'} },
    { n:{ja:'世桜梅酒 1,800ml',en:'YOSAKURA plum wine 1.8L',vi:'Rượu mơ 1.8L'}, k:{ja:'食材',en:'Ingredient',vi:'Nguyên liệu'} }
  ];
  APP_VIEWS.order = () => `
    ${NOTE({ ja:'◆ 加盟店パートナーズ（本部一括の発注）に準拠', en:'◆ Based on the HQ ordering system', vi:'◆ Theo hệ thống đặt hàng của HQ' })}
    <div class="card">
      <h3>${L({ ja:'カタログ', en:'Catalog', vi:'Danh mục' })}</h3>
      ${ORDER_ITEMS.map(it=>`<div class="rep"><div class="body"><div class="l1">${esc(L(it.n))}</div><div class="l2">${esc(L(it.k))}</div></div><span class="stag st-new" data-mock="1" style="cursor:pointer">＋ ${L({ja:'カゴ',en:'Cart',vi:'Giỏ'})}</span></div>`).join('')}
    </div>
    <div class="card">
      <h3>${L({ ja:'発注する', en:'Place order', vi:'Đặt hàng' })}</h3>
      <label class="fld"><span>${L({ ja:'品目', en:'Item', vi:'Mặt hàng' })}</span><select>${ORDER_ITEMS.map(it=>`<option>${esc(L(it.n))}</option>`).join('')}</select></label>
      <label class="fld"><span>${L({ ja:'数量', en:'Quantity', vi:'Số lượng' })}</span><input type="text" inputmode="numeric" placeholder="30"></label>
      <button class="btn-primary" onclick="return false">${L({ja:'発注する（デモ）',en:'Order (demo)',vi:'Đặt (demo)'})}</button>
      <div class="hint">${L({ ja:'納期は通常 発注後 約1週間。お品代は注文先業者の請求書に準じ、POP等は納品後ロイヤリティに加算して請求。POP修正500円〜／新規2,000円〜（要素追加は本部承認）。', en:'Lead time ~1 week. Costs follow vendor invoices; POP etc. billed via royalty. POP edit from 500 yen / new from 2,000 yen (additions need HQ approval).', vi:'Giao ~1 tuần. Chi phí theo hóa đơn NCC; POP tính qua royalty. Sửa POP từ 500 yen / mới từ 2,000 yen (thêm mục cần HQ duyệt).' })}</div>
    </div>`;

  const mockGeneric = (a) => `${NOTE(demoImg)}<div class="card"><p class="muted">${esc(L(a.name))}</p></div>`;
  const bar = (label, pct, hl=false) => `
    <div class="bar-row"><div class="bl"><span>${esc(label)}</span><b>${pct}%</b></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;${hl?'background:#000':''}"></div></div></div>`;

  /* ---------- 役割＋店舗（表示）切替シート ---------- */
  function openIdentitySheet() {
    const buildHTML = () => {
      const role = getRole(), sel = getStoreSel();
      const storeOpts = role === 'hq' ? ['all', ...STORES] : STORES;
      const storeLabel = (s) => s === 'all' ? L({ ja:'全店（本部）', en:'All stores (HQ)', vi:'Tất cả (HQ)' }) : s;
      return `<div class="sheet">
        <div class="grip"></div>
        <h3>${L({ ja:'表示を切り替える', en:'Switch view', vi:'Đổi hiển thị' })}<span class="demo-tag">${L({ja:'デモ',en:'Demo',vi:'Demo'})}</span></h3>
        <div class="sub">${L({ ja:'本部は全店を閲覧できます。スタッフ・店長・加盟店オーナーは自分の店舗のみ（数値なども自店だけ）。', en:'HQ sees all stores. Staff, managers and franchisees see only their own store, including numbers.', vi:'HQ xem mọi cửa hàng. Nhân viên/quản lý/chủ chỉ xem cửa hàng của mình, kể cả số liệu.' })}</div>
        <div class="idlabel">${L({ ja:'役割', en:'Role', vi:'Vai trò' })}</div>
        ${Object.entries(ROLES).map(([k,v])=>`
          <button class="role-opt ${k===role?'on':''}" data-role="${k}">
            <span class="rr">${v.mark}</span>
            <span class="ri"><b>${L(v.label)}</b><span>${L(v.desc)}</span></span>
            ${k===role?`<span class="rc">${svg('tick')}</span>`:''}
          </button>`).join('')}
        <div class="idlabel">${L({ ja:'店舗（見えるデータの範囲）', en:'Store (data scope)', vi:'Cửa hàng (phạm vi dữ liệu)' })}</div>
        ${storeOpts.map(s=>`
          <button class="role-opt store-opt ${s===sel?'on':''}" data-store="${esc(s)}">
            <span class="ri"><b>${esc(storeLabel(s))}</b></span>
            ${s===sel?`<span class="rc">${svg('tick')}</span>`:''}
          </button>`).join('')}
        <button class="btn-primary" data-done="1" style="margin-top:10px">${L({ ja:'完了', en:'Done', vi:'Xong' })}</button>
      </div>`;
    };
    const mask = el(`<div class="sheet-mask">${buildHTML()}</div>`);
    const wire = () => {
      mask.querySelectorAll('[data-role]').forEach(b => b.onclick = () => {
        setRole(b.dataset.role);
        if (b.dataset.role !== 'hq' && getStoreSel() === 'all') setStoreSel(STORES[0]);
        rebuild();
      });
      mask.querySelectorAll('[data-store]').forEach(b => b.onclick = () => { setStoreSel(b.dataset.store); rebuild(); });
      const done = mask.querySelector('[data-done]');
      if (done) done.onclick = () => { mask.remove(); render(); };
    };
    const rebuild = () => { mask.querySelector('.sheet').outerHTML = buildHTML(); wire(); };
    mask.addEventListener('click', (e) => { if (e.target === mask) { mask.remove(); render(); } });
    document.body.appendChild(mask);
    wire();
  }

  /* ---------- 言語切替シート ---------- */
  function openLangSheet() {
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>${L({ ja:'言語を選択', en:'Language', vi:'Ngôn ngữ' })}</h3>
      ${Object.entries(LANGS).map(([k,v])=>`
        <button class="role-opt ${k===LANG?'on':''}" data-lang="${k}">
          <span class="rr" style="font-family:var(--sans);font-size:12px">${v.short}</span>
          <span class="ri"><b>${v.label}</b></span>
          ${k===LANG?`<span class="rc">${svg('tick')}</span>`:''}
        </button>`).join('')}
    </div></div>`);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) return mask.remove();
      const btn = e.target.closest('[data-lang]');
      if (btn) { setLang(btn.dataset.lang); mask.remove(); document.documentElement.lang = btn.dataset.lang; render(); }
    });
    document.body.appendChild(mask);
  }

  /* ---------- レンダリング ---------- */
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
    const byId = (id) => document.getElementById(id);
    // 報告一覧・ダッシュボード表示時は共有バックエンドから最新を取得
    if (useBackend() && (byId('recentList') || location.hash.indexOf('/app/dashboard') >= 0)) syncReports();
    if (byId('langBtn')) byId('langBtn').onclick = openLangSheet;
    if (byId('roleBtn')) byId('roleBtn').onclick = openIdentitySheet;
    if (byId('installBtn')) byId('installBtn').onclick = triggerInstall;
    if (byId('installDismiss')) byId('installDismiss').onclick = () => { localStorage.setItem('yosakura_install_hide', '1'); render(); };
    if (byId('backBtn')) byId('backBtn').onclick = () => go('/home');

    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab === 'home' ? '/home' : `/home?tab=${b.dataset.tab}`));
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { if (b.dataset.open === 'guide') openTour(0); else go(`/app/${b.dataset.open}`); });
    document.querySelectorAll('[data-locked]').forEach(b => b.onclick = () => { const a = appById(b.dataset.locked); toast(`${L(a.name)}`); });
    document.querySelectorAll('[data-mock]').forEach(b => b.onclick = () => toast(L({ ja:'デモのため、この先はイメージです', en:'Demo: further screens are mockups', vi:'Demo: màn hình tiếp theo là mô phỏng' })));
    document.querySelectorAll('.rep-photo').forEach(im => im.onclick = () => openLightbox(im.dataset.full));

    document.querySelectorAll('[data-seg]').forEach(seg => {
      seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        btn.classList.add('on');
        if (seg.dataset.seg === 'kind') {
          const isA = btn.dataset.v === 'a';
          const lab = document.getElementById('f_item_l');
          const inp = document.getElementById('f_item');
          const lvl = document.querySelector('[data-seg="level"]');
          if (lab) lab.textContent = isA ? L({ ja:'メニュー', en:'Menu item', vi:'Món' }) : L({ ja:'品目', en:'Item', vi:'Hạng mục' });
          if (inp) inp.placeholder = isA ? L({ ja:'例：うな重（並）', en:'e.g. Unagi rice bowl', vi:'vd: Cơm lươn' }) : L({ ja:'例：副菜の仕込み', en:'e.g. side-dish prep', vi:'vd: món phụ chuẩn bị' });
          if (lvl) { lvl.innerHTML = (isA?LEVELS_A:LEVELS_B).map((o,i)=>`<button type="button" data-v="${o.v}" class="${i===0?'on':''}">${L(o.t)}</button>`).join(''); rebindSeg(lvl); }
        }
      });
    });

    const drop = document.getElementById('photoDrop');
    if (drop) {
      const fi = document.getElementById('f_photo');
      const thumbs = document.getElementById('photoThumbs');
      drop.onclick = () => fi.click();
      fi.onchange = () => {
        Array.from(fi.files).forEach(f => {
          const url = URL.createObjectURL(f);
          const wrap = document.createElement('div'); wrap.className = 'pt';
          const img = new Image(); img.alt = '';
          img.onload = () => { wrap.dataset.thumb = downscale(img, 1500, 0.82); };
          img.src = url;
          const x = document.createElement('button'); x.type = 'button'; x.className = 'pt-x'; x.textContent = '×';
          x.onclick = (e) => { e.stopPropagation(); URL.revokeObjectURL(url); wrap.remove(); };
          wrap.appendChild(img); wrap.appendChild(x); thumbs.appendChild(wrap);
        });
        fi.value = ''; // 同じ写真の再選択や追加ができるようにクリア
      };
    }

    const sub = document.getElementById('submitRep');
    if (sub) sub.onclick = () => {
      const kind = document.querySelector('[data-seg="kind"] .on').dataset.v;
      const level = document.querySelector('[data-seg="level"] .on').dataset.v;
      const store = document.getElementById('f_store').value;
      const item = document.getElementById('f_item').value.trim();
      const note = document.getElementById('f_note').value.trim();
      if (!item) { toast(L({ ja:'品目を入力してください', en:'Please enter an item', vi:'Vui lòng nhập hạng mục' })); return; }
      const thumbsEl = document.getElementById('photoThumbs');
      const photos = thumbsEl ? Array.from(thumbsEl.querySelectorAll('.pt')).map(w => w.dataset.thumb).filter(Boolean).slice(0,6) : [];
      const rep = { kind, store, item, level, note, photos, t: Date.now() };
      const reps = getReports();
      reps.push(rep);         // 楽観的に即表示
      saveReports(reps);
      postReport(rep);        // バックエンド設定時は全端末へ同期
      toast(L({ ja:'報告しました。ありがとうございます！', en:'Reported. Thank you!', vi:'Đã gửi. Cảm ơn!' }));
      render();
    };

    document.querySelectorAll('[data-ci]').forEach(row => row.onclick = () => {
      const done = JSON.parse(localStorage.getItem(LS.checks) || '{}');
      const i = row.dataset.ci; done[i] = !done[i];
      localStorage.setItem(LS.checks, JSON.stringify(done));
      render();
    });
  }
  // レベルセグメント差し替え後の再バインド
  function rebindSeg(seg) {
    seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      btn.classList.add('on');
    });
  }

  /* ---------- 共有バックエンドとの同期 ---------- */
  async function syncReports(force) {
    if (!useBackend()) return;
    if (!force && Date.now() - lastSync < 3000) return;
    lastSync = Date.now();
    try {
      const res = await fetch(API_URL);
      const d = await res.json();
      if (d && d.ok && Array.isArray(d.reports)) {
        const next = JSON.stringify(d.reports);
        if (next !== (localStorage.getItem(LS.reports) || '')) { localStorage.setItem(LS.reports, next); render(); }
      }
    } catch (_) { /* オフライン時はキャッシュを使用 */ }
  }
  function postReport(rep) {
    if (!useBackend()) return Promise.resolve();
    return fetch(API_URL, { method: 'POST', body: JSON.stringify(rep) }).then(() => syncReports(true)).catch(() => {});
  }

  /* ---------- 起動 ---------- */
  document.documentElement.lang = LANG;
  if (!useBackend()) seedIfEmpty();
  render();
  syncReports(true);
  setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 1150);
  if (!localStorage.getItem('yosakura_tour_done')) setTimeout(() => openTour(0), 1450); // 初回のみ使い方ガイド
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
