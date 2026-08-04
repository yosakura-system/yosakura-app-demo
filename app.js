/* ===================================================================
   世桜アプリ app.js  ─ 多言語対応（日本語 / English / Tiếng Việt）
   1つの窓口 → 中に多数の業務アプリ → 権限で出し分け → すべてここで管理
   フレームワーク不使用のバニラJS・静的PWA（GitHub Pagesで無料公開可）
   データはGAS＋スプレッドシート／Googleドライブに保存し、全端末で同期する（未接続時はこの端末内に保存）。
=================================================================== */
(() => {
  'use strict';

  /* ====== 共有バックエンド設定 ======
     GAS WebアプリのURL（/exec）をここに貼ると、全端末でデータが同期される。
     空のままなら従来通りこの端末内(localStorage)だけに保存。 */
  /* 既定（従来からの共有バックエンド）。★本番運用では「本部の専用バックエンド」を設定して切り替える。
     設定は本部メニュー →「バックエンド設定」から。設定するとこの端末以降その接続先を使う。 */
  const API_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbzS-tvfTQwJjgYn2ASHWidU-qBWZzF85bqt25T4mAXcM-P6-75zFqzUSlgiPFDTe7KQRQ/exec';
  const LS_API = 'yosakura_api_url';
  const getApiUrl = () => (localStorage.getItem(LS_API) || API_URL_DEFAULT);
  const isCustomApi = () => !!localStorage.getItem(LS_API);
  /* システム管理者モード：接続先の変更は「本部ロール かつ 管理者モード」のみ可能。
     通常の本部利用者は接続状態の閲覧のみ（誤操作で共用へ戻すのを防ぐ）。
     ※ これは誤操作防止のための鍵であり、機密を守る認証ではありません（フロントのため）。 */
  const LS_ADMIN = 'yosakura_sysadmin';
  const ADMIN_CODE = 'yosakura-system';
  const isSysAdmin = () => localStorage.getItem(LS_ADMIN) === '1';
  const setSysAdmin = (on) => { if (on) localStorage.setItem(LS_ADMIN, '1'); else localStorage.removeItem(LS_ADMIN); };
  // 接続先の変更ログ（変更者・日時・変更前後・テスト結果）
  const LS_APILOG = 'yosakura_api_log';
  function pushApiLog(entry) {
    let a = []; try { a = JSON.parse(localStorage.getItem(LS_APILOG)) || []; } catch (e) {}
    a.push(Object.assign({ ts: Date.now(), role: getRole() }, entry));
    try { localStorage.setItem(LS_APILOG, JSON.stringify(a.slice(-50))); } catch (e) {}
  }
  const getApiLog = () => { try { return JSON.parse(localStorage.getItem(LS_APILOG)) || []; } catch { return []; } };
  const maskUrl = (u) => { const m = /\/macros\/s\/([^/]+)\//.exec(u || ''); return m ? `…/${m[1].slice(0, 8)}…/exec` : (u || '—'); };
  function setApiUrl(u) {
    const v = (u || '').trim();
    if (v) localStorage.setItem(LS_API, v); else localStorage.removeItem(LS_API);
    try { localStorage.removeItem(LS.reports); } catch (e) {} // 接続先が変わるため取得済みデータを破棄
  }
  const useBackend = () => !!getApiUrl();
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
    cart:   '<circle cx="9.5" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/><path d="M2.5 4h2.2l2.4 11.2h10.2l1.9-8.2H6.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    link:   '<path d="M9.5 14.5l5-5M11 6.5l1.3-1.3a3.6 3.6 0 0 1 5.1 5.1L16 11.6M13 17.4l-1.3 1.3a3.6 3.6 0 0 1-5.1-5.1L8 12.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    box:    '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5 3.5 16.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5V20.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    idea:   '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.5.4.9 1 .9 1.7v.5h5.4v-.5c0-.7.4-1.3.9-1.7A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>',
    pin:    '<path d="M12 21s7-6.3 7-11a7 7 0 0 0-14 0c0 4.7 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    coins:  '<ellipse cx="12" cy="6.4" rx="6.5" ry="2.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 6.4v5c0 1.55 2.9 2.8 6.5 2.8s6.5-1.25 6.5-2.8v-5M5.5 11.4v5c0 1.55 2.9 2.8 6.5 2.8s6.5-1.25 6.5-2.8v-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    chat:   '<path d="M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7.5 10h9M7.5 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    qr:     '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 14h3v3h-3zM19 14h1v1h-1zM19 19h1v1h-1zM14 19h3v1h-3z" fill="currentColor"/>',
    phone:  '<path d="M6.5 3.5h3l1.4 4-2 1.4a11 11 0 0 0 5.2 5.2l1.4-2 4 1.4v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    shield: '<path d="M12 3.5l7 2.5v5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6l7-2.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12l2 2 4-4.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    bell:   '<path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.2H4.5L6 16z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
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
    { id:'other',    name:{ ja:'その他・設定', en:'More & Settings', vi:'Khác & Cài đặt' } },
    { id:'hq',       name:{ ja:'本部', en:'Headquarters', vi:'Bộ phận chính' } }
  ];
  const groupName = (id) => { const g = GROUPS.find(x => x.id === id); return g ? L(g.name) : id; };

  /* ---------- アプリ登録 ---------- */
  const APPS = [
    { id:'tabemono', group:'genba', icon:'food', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'食べ残し・食材ロス報告', en:'Food Waste & Loss', vi:'Thức ăn thừa & hao hụt' },
      desc:{ ja:'お客様の残し／食材ロスを記録', en:'Log leftovers / ingredient loss', vi:'Ghi đồ thừa / hao hụt' } },
    { id:'firstphoto', group:'genba', icon:'camera', soon:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'一食目写真の報告', en:'First-plate Photo', vi:'Ảnh món đầu tiên' },
      desc:{ ja:'提供直後の一枚を本部へ', en:'Send the first serving photo', vi:'Gửi ảnh ngay khi phục vụ' } },
    { id:'kizuki', group:'genba', icon:'idea', roles:['staff','manager','owner','hq'],
      name:{ ja:'気づきの報告', en:'Daily Insights', vi:'Ghi nhận cuối ca' },
      desc:{ ja:'クローズ後の気づきを本部へ共有', en:'Share end-of-shift insights', vi:'Chia sẻ ghi nhận sau ca' } },
    { id:'route', group:'genba', icon:'pin', roles:['staff','manager','owner','hq'],
      name:{ ja:'来店経路の記録', en:'Arrival Route', vi:'Nguồn khách' },
      desc:{ ja:'来店きっかけをワンタップで', en:'One-tap arrival source', vi:'Nguồn khách 1 chạm' } },
    { id:'review', group:'other', icon:'qr', roles:['staff','manager','owner','hq'],
      name:{ ja:'口コミQR', en:'Review QR', vi:'QR đánh giá' },
      desc:{ ja:'紙での提示が基本。必要時のみ使用', en:'Paper first; use only when needed', vi:'Ưu tiên giấy; chỉ dùng khi cần' } },
    { id:'talk', group:'learn', icon:'chat', roles:['staff','manager','owner','hq'],
      name:{ ja:'接客スクリプト・食べ方ガイド', en:'Service Scripts', vi:'Kịch bản phục vụ' },
      desc:{ ja:'多言語の接客フレーズと食べ方案内', en:'Multilingual phrases & how-to-enjoy', vi:'Câu phục vụ đa ngữ' } },
    { id:'checklist', group:'genba', icon:'check', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'オープン・クローズチェック', en:'Open & Close Check', vi:'Kiểm tra Mở & Đóng' },
      desc:{ ja:'開店・閉店の点検（店舗独自項目も追加可）', en:'Opening & closing checks', vi:'Kiểm tra mở & đóng cửa' } },
    { id:'links', group:'other', icon:'link', soon:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'リンク集', en:'Quick Links', vi:'Liên kết' },
      desc:{ ja:'初期設定・発注などの必要リンク', en:'Setup, ordering and key links', vi:'Cài đặt, đặt hàng, liên kết' } },
    { id:'inventory', group:'storeops', icon:'box', soon:true, hide:true, roles:['manager','owner','hq'], // 8/4: 棚卸は月末提出物へ統合＝独立は外す
      name:{ ja:'棚卸・在庫入力', en:'Stocktake', vi:'Kiểm kho' },
      desc:{ ja:'品目ごとの在庫をスマホで入力', en:'Enter stock by item on your phone', vi:'Nhập tồn kho theo mặt hàng' } },
    { id:'openreg', group:'storeops', icon:'coins', roles:['manager','owner','hq'],
      name:{ ja:'開局（レジ準備金）', en:'Register Open', vi:'Mở quầy' },
      desc:{ ja:'金種を入力→合計を自動計算', en:'Enter float by denomination', vi:'Nhập tiền quỹ đầu ca' } },
    { id:'storevideo', group:'storeops', icon:'video', roles:['staff','manager','owner','hq'],
      name:{ ja:'店内動画の共有', en:'In-store Video', vi:'Video trong quán' },
      desc:{ ja:'店内一周の動画リンクを共有', en:'Share store walkthrough videos', vi:'Chia sẻ video trong quán' } },
    { id:'manual', group:'learn', icon:'book', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'マニュアル', en:'Manuals', vi:'Cẩm nang' },
      desc:{ ja:'権限・業態別に表示（理念・接客・衛生・商品）', en:'By role & store type', vi:'Theo vai trò & loại hình' } },
    { id:'survey', group:'learn', icon:'star', roles:['staff','manager','owner','hq'],
      name:{ ja:'サーベイ', en:'Survey', vi:'Khảo sát' },
      desc:{ ja:'お客様アンケート運用', en:'Customer survey operation', vi:'Khảo sát khách hàng' } },
    { id:'guide', group:'other', icon:'play', roles:['staff','manager','owner','hq'],
      name:{ ja:'使い方ガイド', en:'How to use', vi:'Hướng dẫn' },
      desc:{ ja:'このアプリの使い方（1分）', en:'Quick app guide (1 min)', vi:'Hướng dẫn nhanh (1 phút)' } },
    { id:'soukatsu', group:'storeops', icon:'table', roles:['manager','owner','hq'],
      name:{ ja:'総括表の入力', en:'Daily Summary', vi:'Tổng kết ngày' },
      desc:{ ja:'日次の売上・客数・分析', en:'Daily sales, guests, review', vi:'Doanh thu, khách, phân tích' } },
    { id:'mtg', group:'storeops', icon:'mtg', roles:['manager','owner','hq'],
      name:{ ja:'月例MTG', en:'Monthly Meeting', vi:'Họp hàng tháng' },
      desc:{ ja:'各店の定例MTGと議題を一元管理', en:'All stores meetings & agendas', vi:'Lịch họp & nội dung mọi cửa hàng' } },
    { id:'hr', group:'storeops', icon:'hr', soon:true, roles:['manager','owner','hq'],
      name:{ ja:'スタッフ評価・面談', en:'Staff Review', vi:'Đánh giá nhân viên' },
      desc:{ ja:'キャリアアップ制度と面談', en:'Career ranks & interviews', vi:'Xếp hạng & phỏng vấn' } },
    { id:'order', group:'storeops', icon:'cart', soon:true, roles:['manager','owner','hq'],
      name:{ ja:'備品・食材の発注', en:'Order Supplies', vi:'Đặt vật tư' },
      desc:{ ja:'カタログから本部へ発注', en:'Order from the HQ catalog', vi:'Đặt từ danh mục HQ' } },
    { id:'schedule', group:'biz', icon:'calendar', soon:true, hide:true, roles:['owner','hq'], // 8/4: 開業関係は初期で外す（D-90は未確定）
      name:{ ja:'開業スケジュール D-90', en:'Opening Schedule D-90', vi:'Lịch khai trương D-90' },
      desc:{ ja:'契約〜開業のマスター工程', en:'Contract to opening master plan', vi:'Từ hợp đồng đến khai trương' } },
    { id:'pl', group:'storeops', icon:'yen', live:true, roles:['manager','owner','hq'],
      name:{ ja:'数値・原価率', en:'Numbers & Cost', vi:'Số liệu & Giá vốn' },
      desc:{ ja:'月次の売上・仕入・在庫から原価率を自動計算', en:'Monthly cost ratio from sales/stock', vi:'Tự tính giá vốn theo tháng' } },
    { id:'dashboard', group:'hq', icon:'gauge', roles:['hq'],
      name:{ ja:'本部ダッシュボード', en:'HQ Dashboard', vi:'Bảng điều khiển' },
      desc:{ ja:'全店の報告を自動集約', en:'Auto-aggregate all reports', vi:'Tổng hợp báo cáo tự động' } },
    { id:'tasks', group:'hq', icon:'task', hide:true, roles:['hq'], // 8/4: 課題管理は増田さんのGoogle一元管理表が正・二重管理しない
      name:{ ja:'課題・タスク管理', en:'Task Management', vi:'Quản lý công việc' },
      desc:{ ja:'本部の全課題を担当・状況で管理', en:'All HQ tasks by owner & status', vi:'Công việc theo phụ trách & trạng thái' } },
    { id:'invoice', group:'hq', icon:'invoice', soon:true, hide:true, roles:['hq'], // 8/4: 請求関係は初期ダッシュから外す
      name:{ ja:'請求・支払管理', en:'Billing & Payment', vi:'Hóa đơn & Thanh toán' },
      desc:{ ja:'取引先ごとの請求方法・締日', en:'Vendor billing method & cutoff', vi:'Cách & kỳ hạn thanh toán' } },
    { id:'teishutsu', group:'hq', icon:'inbox', roles:['hq'],
      name:{ ja:'加盟店・提出物管理', en:'Submissions', vi:'Nộp tài liệu' },
      desc:{ ja:'提出状況と未提出の自動抽出', en:'Track & flag missing submissions', vi:'Theo dõi tài liệu chưa nộp' } },
    { id:'camera', group:'hq', icon:'video', soon:true, hide:true, roles:['hq'], // 8/4: 防犯カメラは初期ダッシュから外す
      name:{ ja:'防犯カメラ確認', en:'Security Cameras', vi:'Camera an ninh' },
      desc:{ ja:'本部から全店を一括確認', en:'Check all stores from HQ', vi:'Xem mọi cửa hàng từ HQ' } },
    { id:'svfb', group:'hq', icon:'report', hide:true, roles:['hq'], // 8/4(19-2/19-3): 店舗フィードバックは初期で外す→気づき報告・サーベイへ統合
      name:{ ja:'店舗巡回フィードバック', en:'Store Visit Feedback', vi:'Phản hồi cửa hàng' },
      desc:{ ja:'接客/提供/品質/内装/多言語を観点別に記録', en:'SV feedback by aspect', vi:'Ghi nhận theo tiêu chí' } }
  ];
  const appById = (id) => APPS.find(a => a.id === id);
  const canOpen = (app, role) => role === 'hq' || app.roles.includes(role);

  /* ---------- 状態 ---------- */
  const LS = { role:'yosakura_demo_role', store:'yosakura_demo_store', reports:'yosakura_demo_reports', checks:'yosakura_demo_checks' };
  const getRole = () => localStorage.getItem(LS.role) || 'staff';
  const setRole = (r) => localStorage.setItem(LS.role, r);
  const getStoreSel = () => localStorage.getItem(LS.store) || STORES[0];
  const setStoreSel = (s) => localStorage.setItem(LS.store, s);
  // 複数店舗オーナーの所有店舗（デモ用。実運用では本部の「権限設定表」で置き換える）
  // 例：富士山のオーナー（長田翔太さん）＝鰻・牛カツの2店を所有
  const OWNER_STORES = ['日本鰻世桜 富士山店', '牛カツ世桜 富士山店'];
  // 店舗スコープ：本部＝全店（または任意1店）、オーナー＝所有店舗（横断 or 1店）、他＝自店のみ
  function visibleStores() {
    const role = getRole(), sel = getStoreSel();
    if (role === 'hq') return sel === 'all' ? STORES.slice() : [sel];
    if (role === 'owner') return (sel === 'owned' || !OWNER_STORES.includes(sel)) ? OWNER_STORES.slice() : [sel];
    return [STORES.includes(sel) ? sel : STORES[0]];
  }
  const storeShort = (s) => s === 'all' ? L({ ja:'全店', en:'All', vi:'Tất cả' })
    : s === 'owned' ? L({ ja:'所有店舗', en:'My stores', vi:'CH của tôi' })
    : (s.split(' ').slice(1).join(' ') || s);
  const getReports = () => { try { return JSON.parse(localStorage.getItem(LS.reports)) || []; } catch { return []; } };
  const saveReports = (a) => localStorage.setItem(LS.reports, JSON.stringify(a));
  const getFP = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_fp')) || []; } catch { return []; } };
  const saveFP = (a) => localStorage.setItem('yosakura_demo_fp', JSON.stringify(a));
  const getSk = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_soukatsu')) || []; } catch { return []; } };
  const saveSk = (a) => localStorage.setItem('yosakura_demo_soukatsu', JSON.stringify(a));

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

  // 総括表の履歴を用意（バックエンド非管理のローカル機能・空のときだけ）
  function seedSk() {
    if (localStorage.getItem('yosakura_demo_soukatsu')) return;
    const now = Date.now(), d = (n) => new Date(now - n*864e5).toISOString().slice(0,10);
    saveSk([
      { store:'日本料理世桜 心斎橋（おまかせ）', date:d(1), sales:186817, guests:16, rvt:'2', rva:'70', hear:'9', disc:'0', food:'36.5', labor:'23.6', tipt:'21000', tipa:'84541', cancel:'31700', closer:'', note:'', order:'豆乳6／寿司のエビ2／ガリ1／お米', t:now-864e5 },
      { store:'寿司世桜 心斎橋店', date:d(2), sales:80850, guests:12, rvt:'1', rva:'', hear:'', disc:'0', food:'', labor:'', tipt:'0', tipa:'0', cancel:'', closer:'', note:'', order:'', t:now-2*864e5 }
    ]);
  }
  // 気づきの初期データ（ローカル機能・空のときだけ）
  function seedKz() {
    if (localStorage.getItem('yosakura_demo_kizuki')) return;
    const now = Date.now();
    saveKz([
      { store:'和牛世桜 広島店', cat:'food', note:'藁焼き後の油の切れが甘い皿があった。提供前にもう一度確認したい。', photos:[], t: now-3600e3*3 },
      { store:'寿司世桜 心斎橋店', cat:'service', note:'お客様から「わさび少なめ」のご希望が続いた。最初に伺うと良さそう。', photos:[], t: now-3600e3*20 },
      { store:'日本鰻世桜 長堀橋店', cat:'other', note:'アイスのお茶の出数が増加。ピッチャーを先に仕込むと提供が早くなる。', photos:[], t: now-3600e3*26 }
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
      ['learn', { ja:'学ぶ', en:'Learn', vi:'Học' }, 'grad'],
      ['other', { ja:'その他', en:'More', vi:'Khác' }, 'dots']
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

  /* ---------- ホーム ----------
     高原社長の要望＝ホームはシンプルに、よく使うものへワンクリックで届く入口に徹する。
     全機能は並べず「お知らせ／よく使う／緊急・相談／各メニューへの導線」だけを置く。
     全機能の一覧は 報告・学ぶ・本部 の各タブに残す。 */
  const HOME_PRIMARY = { // 役割ごとの「よく使う」＝ホームに大きく出す入口（ワンクリック）
    staff:   ['kyou', 'openphoto', 'checklist', 'kizuki'],
    manager: ['kyou', 'openphoto', 'soukatsu', 'checklist'],
    owner:   ['kyou', 'openphoto', 'soukatsu', 'checklist'],
    hq:      ['teishutsu', 'kyou', 'dashboard', 'svfb']
  };
  function installCardHTML() {
    if (installHidden()) return '';
    return `
      <div class="install-card">
        <button class="install-x" id="installDismiss" aria-label="close">×</button>
        <img class="hdr__logo" style="width:40px;height:40px" src="icons/icon-192.png" alt="">
        <div class="txt"><b>${L({ ja:'ホーム画面に世桜を追加', en:'Add YOSAKURA to Home Screen', vi:'Thêm YOSAKURA vào màn hình' })}</b>
          <span>${L({ ja:'アプリのように起動。世桜のロゴが立ち上がります。', en:'Launch like an app with the YOSAKURA logo.', vi:'Khởi động như ứng dụng với logo YOSAKURA.' })}</span></div>
        <button id="installBtn">${L({ ja:'追加', en:'Add', vi:'Thêm' })}</button>
      </div>`;
  }
  function homeInner(role) {
    const tiles = (ids) => ids.map(appById).filter(a => a && canOpen(a, role)).map(a => tileHTML(a, role)).join('');
    const primary = tiles(HOME_PRIMARY[role] || HOME_PRIMARY.staff);
    const safety = tiles(['emergency', 'whistle']);
    const sec = (t) => `<div class="sec-h"><span class="bar"></span><h2>${L(t)}</h2></div>`;
    const latest = newsVisible(getNews()).sort((a, b) => b.t - a.t)[0];
    const news = latest ? `
      <button class="card news-card news-card--btn ${latest.level === 'important' ? 'news-card--imp' : ''}" data-open="news">
        <div class="news-h"><span class="news-ic">${svg('bell')}</span><b>${latest.level === 'important' ? L({ ja:'重要なお知らせ', en:'Important', vi:'Quan trọng' }) : L({ ja:'本部からのお知らせ', en:'News from HQ', vi:'Thông báo từ HQ' })}</b><span class="news-ago">${timeAgo(latest.t)}</span></div>
        <div class="news-title">${esc(latest.title || '')}</div>
        ${latest.body ? `<p class="news-body">${esc(newsSnippet(latest.body))}</p>` : ''}
        ${(latest.photos && latest.photos.length) ? `<img class="news-thumb" src="${photoThumb(latest.photos[0])}" alt="">` : ''}
        <span class="news-more">${(latest.photos && latest.photos.length) ? '📷 ' : ''}${latest.video ? '▶ ' : ''}${L({ ja:'すべて見る', en:'See all', vi:'Xem tất cả' })} ${svg('chev')}</span>
      </button>` : `
      <button class="card news-card news-card--btn" data-open="news">
        <div class="news-h"><span class="news-ic">${svg('bell')}</span><b>${L({ ja:'本部からのお知らせ', en:'News from HQ', vi:'Thông báo từ HQ' })}</b></div>
        <p class="news-body">${role === 'hq' ? L({ ja:'タップしてお知らせを配信できます。', en:'Tap to post an announcement.', vi:'Chạm để đăng thông báo.' }) : L({ ja:'世桜ニュース・重要なお知らせがここに届きます。', en:'YOSAKURA news and notices will appear here.', vi:'Tin tức và thông báo sẽ hiển thị ở đây.' })}</p>
      </button>`;
    const links = `
      <div class="homelinks">
        <button class="homelink" data-tab="genba"><span class="hl-ic">${svg('report')}</span><span class="hl-t">${L({ ja:'報告する', en:'Report', vi:'Báo cáo' })}</span><span class="hl-c">${svg('chev')}</span></button>
        <button class="homelink" data-tab="learn"><span class="hl-ic">${svg('grad')}</span><span class="hl-t">${L({ ja:'学ぶ', en:'Learn', vi:'Học tập' })}</span><span class="hl-c">${svg('chev')}</span></button>
        <button class="homelink" data-tab="other"><span class="hl-ic">${svg('dots')}</span><span class="hl-t">${L({ ja:'その他・設定', en:'More & Settings', vi:'Khác & Cài đặt' })}</span><span class="hl-c">${svg('chev')}</span></button>
        ${role === 'hq' ? `<button class="homelink" data-tab="hq"><span class="hl-ic">${svg('hq')}</span><span class="hl-t">${L({ ja:'本部メニュー', en:'HQ menu', vi:'Menu HQ' })}</span><span class="hl-c">${svg('chev')}</span></button>` : ''}
      </div>`;
    return `
      <main class="screen">
        <div class="brandhead"><img class="brandhead__logo" src="icons/logo-full.png" alt="日本料理 世桜 -yosakura-"></div>
        ${installCardHTML()}
        ${news}
        ${sec({ ja:'よく使う', en:'Quick access', vi:'Hay dùng' })}
        <div class="grid">${primary}</div>
        ${safety ? sec({ ja:'緊急・相談', en:'Emergency & Report', vi:'Khẩn cấp & Tố giác' }) + `<div class="grid">${safety}</div>` : ''}
        ${sec({ ja:'メニュー', en:'Menu', vi:'Menu' })}
        ${links}
        <div class="footer-note">${L({ ja:'世桜アプリ ・ 役割と言語で表示が変わります（上部で切替）', en:'YOSAKURA app · View changes by role & language (switch at top)', vi:'Ứng dụng YOSAKURA · Hiển thị theo vai trò & ngôn ngữ (đổi ở trên)' })}</div>
      </main>`;
  }
  function viewHome(tab) {
    const role = getRole();
    if (tab === 'hq' && role !== 'hq') tab = 'home'; // 本部権限が無ければホームへ

    // ホーム＝シンプルな入口（全機能は並べない）
    if (tab === 'home') return shell(homeInner(role), 'home');

    // 報告・学ぶ・その他・本部の各タブ＝対応グループの全機能を一覧（グループ見出し付き）
    const gids = TAB_GROUPS[tab] || ['genba'];
    let sections = '';
    for (const gid of gids) {
      const apps = APPS.filter(a => a.group === gid && !a.hide && canOpen(a, role));
      if (!apps.length) continue;
      sections += `
        <div class="sec-h"><span class="bar"></span><h2>${esc(groupName(gid))}</h2></div>
        <div class="grid">${apps.map(a => tileHTML(a, role)).join('')}</div>`;
    }
    if (!sections) sections = `<div class="muted" style="text-align:center;padding:20px">${L({ ja:'表示できる項目がありません', en:'Nothing to show', vi:'Không có mục nào' })}</div>`;
    const heroBlock = `<div class="hero"><h1 class="hero__title">${L({ genba:{ja:'報告する',en:'Report',vi:'Báo cáo'}, learn:{ja:'学ぶ',en:'Learn',vi:'Học tập'}, other:{ja:'その他・設定',en:'More & Settings',vi:'Khác & Cài đặt'}, hq:{ja:'本部メニュー',en:'HQ Menu',vi:'Menu bộ phận'} }[tab])}</h1></div>`;
    const inner = `
      <main class="screen">
        ${heroBlock}
        ${sections}
        <div class="footer-note">${L({ ja:'世桜アプリ ・ 役割と言語で表示が変わります（上部で切替）', en:'YOSAKURA app · View changes by role & language (switch at top)', vi:'Ứng dụng YOSAKURA · Hiển thị theo vai trò & ngôn ngữ (đổi ở trên)' })}</div>
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
      ${a.soon ? `<span class="live" style="background:#8a8f98">${L({ja:'準備中',en:'Soon',vi:'Sắp có'})}</span>` : (a.live ? '<span class="live">● LIVE</span>' : '')}
      <div class="ico">${svg(a.icon)}</div>
      <div class="nm">${esc(L(a.name))}</div>
      <div class="desc">${esc(L(a.desc))}</div>
    </button>`;
  }

  /* ---------- アプリ詳細 ---------- */
  function viewApp(id) {
    if (id === 'guide') { setTimeout(() => openTour(0), 20); return viewHome('learn'); }
    const a = appById(id);
    if (!a || a.hide) return viewHome('home'); // 初期リリースで外した機能は開かない
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
  // グループ→タブの対応（開いている画面のタブを正しくハイライト）
  const TAB_GROUPS = { genba:['genba','storeops'], learn:['learn'], other:['other','biz'], hq:['hq'] };
  const groupTab = (g) => g === 'learn' ? 'learn' : g === 'hq' ? 'hq' : (g === 'other' || g === 'biz') ? 'other' : 'genba';

  const NOTE = (o) => `<p class="mock-note">${L(o)}</p>`;
  const demoImg = { ja:'◆ この画面は準備中です（画面イメージ）', en:'◆ This screen is in preparation (mockup)', vi:'◆ Màn hình đang chuẩn bị (mô phỏng)' };

  /* =================== 各アプリ =================== */
  const APP_VIEWS = {};

  /* 食べ残し報告のメニュー選択（木村さん要望：自由入力→選択式）。店舗の業態でメニューを出し分け＋「その他（自由入力）」 */
  // ※メニューは実測（2026-07-03巡回）＋公式サイト/TableCheck/Instagramの公表名に基づく。要確認は本部と突合。
  const MENU_MASTER = {
    unagi: [ // 日本鰻世桜＝ひつまぶし専門（並/上/極の3段階）
      { ja:'ひつまぶし（並）', en:'Hitsumabushi (Regular)', vi:'Hitsumabushi (Thường)' },
      { ja:'ひつまぶし（上）', en:'Hitsumabushi (Superior)', vi:'Hitsumabushi (Cao cấp)' },
      { ja:'ひつまぶし（極）', en:'Hitsumabushi (Ultimate)', vi:'Hitsumabushi (Đỉnh)' },
      { ja:'京都宇治茶', en:'Kyoto Uji tea', vi:'Trà Uji Kyoto' }
    ],
    gyukatsu: [ // 牛カツ世桜／焼きひつまぶし世桜
      { ja:'焼きひつまぶし', en:'Grilled hitsumabushi', vi:'Hitsumabushi nướng' },
      { ja:'和牛牛カツ', en:'Wagyu gyukatsu', vi:'Wagyu chiên xù' },
      { ja:'牛カツサンド', en:'Gyukatsu sandwich', vi:'Sandwich bò' }
    ],
    sushi: [ // 寿司世桜＝おまかせ専門
      { ja:'おまかせコース', en:'Omakase course', vi:'Set Omakase' }
    ],
    temaki: [ // 手巻き寿司世桜（OSAKA HAND ROLL）
      { ja:'OSAKA HAND ROLL（手巻き）', en:'Osaka Hand Roll', vi:'Sushi cuốn tay Osaka' },
      { ja:'鰻おにぎり', en:'Eel rice ball', vi:'Cơm nắm lươn' },
      { ja:'ハラル鰻', en:'Halal unagi', vi:'Lươn Halal' }
    ],
    wagyu: [ // 和牛世桜＝和牛ひつまぶし専門
      { ja:'和牛ひつまぶし', en:'Wagyu hitsumabushi', vi:'Wagyu hitsumabushi' },
      { ja:'和牛ひつまぶし（極）', en:'Wagyu hitsumabushi (Ultimate)', vi:'Wagyu hitsumabushi (Đỉnh)' },
      { ja:'和牛すき焼きひつまぶし', en:'Wagyu sukiyaki hitsumabushi', vi:'Sukiyaki hitsumabushi' },
      { ja:'神戸牛ひつまぶし', en:'Kobe beef hitsumabushi', vi:'Bò Kobe hitsumabushi' }
    ],
    nihonryori: [ // 日本料理世桜＝OMAKASEコース（コース内の各品も報告できるよう列挙）
      { ja:'おまかせコース（全体）', en:'Omakase course', vi:'Set Omakase' },
      { ja:'手巻き寿司', en:'Hand roll sushi', vi:'Sushi cuốn tay' },
      { ja:'握り寿司', en:'Nigiri sushi', vi:'Sushi nắm' },
      { ja:'和牛ステーキ', en:'Wagyu steak', vi:'Bò wagyu bít tết' },
      { ja:'和牛すき焼き', en:'Wagyu sukiyaki', vi:'Wagyu sukiyaki' },
      { ja:'鰻', en:'Unagi (eel)', vi:'Lươn' },
      { ja:'ラーメン', en:'Ramen', vi:'Mì ramen' }
    ]
  };
  const COMMON_MENU = [
    { ja:'世桜梅酒', en:'Plum wine', vi:'Rượu mơ' },
    { ja:'日本茶（ほうじ茶）', en:'Hojicha tea', vi:'Trà Hojicha' },
    { ja:'日本茶（緑茶）', en:'Green tea', vi:'Trà xanh' },
    { ja:'ドリンクペアリング', en:'Drink pairing', vi:'Đồ uống pairing' },
    { ja:'デザート', en:'Dessert', vi:'Tráng miệng' }
  ];
  const storeType = (s='') =>
    s.indexOf('日本鰻世桜')===0    ? 'unagi' :
    s.indexOf('牛カツ世桜')===0    ? 'gyukatsu' :
    s.indexOf('手巻き寿司世桜')===0 ? 'temaki' :
    s.indexOf('寿司世桜')===0      ? 'sushi' :
    s.indexOf('和牛世桜')===0      ? 'wagyu' :
    s.indexOf('日本料理世桜')===0  ? 'nihonryori' : null;
  const menusForStore = (s) => { const t = storeType(s); return (t && MENU_MASTER[t] ? MENU_MASTER[t] : []).concat(COMMON_MENU); };
  const itemLabelObj = (kind) => kind==='a' ? { ja:'メニュー', en:'Menu item', vi:'Món' } : { ja:'品目（食材）', en:'Item (ingredient)', vi:'Hạng mục' };
  // 種別・店舗に応じた「品目」入力欄を生成。食べ残し=メニュー選択、食材ロス=自由入力。
  function itemFieldHTML(kind, store) {
    if (kind === 'b') {
      return `<label class="fld"><span>${L(itemLabelObj('b'))}</span>
        <input type="text" id="f_item" placeholder="${L({ ja:'例：副菜の仕込み', en:'e.g. side-dish prep', vi:'vd: món phụ chuẩn bị' })}"></label>`;
    }
    const opts = menusForStore(store).map(m=>`<option value="${esc(m.ja)}">${esc(L(m))}</option>`).join('');
    return `<label class="fld"><span>${L(itemLabelObj('a'))}</span>
      <select id="f_item">
        <option value="" disabled selected>${L({ ja:'メニューを選択', en:'Select a menu item', vi:'Chọn món' })}</option>
        ${opts}
        <option value="__other__">${L({ ja:'その他（自由入力）', en:'Other (free text)', vi:'Khác (tự nhập)' })}</option>
      </select>
      <input type="text" id="f_item_other" style="display:none;margin-top:8px" placeholder="${L({ ja:'メニュー名を入力', en:'Enter menu name', vi:'Nhập tên món' })}"></label>`;
  }
  // 「その他」を選んだら自由入力欄を表示
  function wireItemBlock() {
    const sel = document.getElementById('f_item');
    const oth = document.getElementById('f_item_other');
    if (sel && sel.tagName === 'SELECT' && oth) {
      sel.onchange = () => { const other = sel.value === '__other__'; oth.style.display = other ? 'block' : 'none'; if (other) oth.focus(); };
    }
  }

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
        <div id="itemBlock">${itemFieldHTML('a', visibleStores()[0])}</div>
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
        <div class="hint">${L({ ja:'保存すると、下の一覧と「本部ダッシュボード」に反映されます', en:'Saved and shown below and in the HQ Dashboard', vi:'Được lưu và hiển thị bên dưới và ở Bảng điều khiển' })}</div>
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

  /* ② 一食目写真（撮影→提出まで動作・AI判定は演出）*/
  APP_VIEWS.firstphoto = () => {
    const recent = getFP().filter(r => visibleStores().includes(r.store)).sort((x,y)=>y.t-x.t).slice(0,6);
    return `
      ${NOTE({ ja:'◆ 準備中：AI判定の運用を検討中です。正式な運用開始までは、これまでどおりの方法でお願いします（お試しでの提出は可能です）', en:'◆ In preparation: AI judgment is under discussion. Please continue the current method until the official start (you may try submitting here).', vi:'◆ Đang chuẩn bị: cách dùng AI đang được bàn. Vui lòng giữ cách hiện tại cho đến khi chính thức.' })}
      <div class="card" id="fpForm">
        <h3>${L({ ja:'提供直後の一枚を報告', en:'Report the first serving photo', vi:'Gửi ảnh món vừa phục vụ' })}</h3>
        <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select id="fp_store">${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'メニュー', en:'Menu item', vi:'Món' })}</span><input type="text" id="fp_item" placeholder="${L({ja:'例：海鮮丼',en:'e.g. Seafood bowl',vi:'vd: Cơm hải sản'})}"></label>
        <label class="fld"><span>${L({ ja:'写真（複数可）', en:'Photos', vi:'Ảnh' })}</span>
          <div class="photo-drop" id="photoDrop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ja:'撮影して追加',en:'Take photos',vi:'Chụp ảnh'})}</b><br><small>${L({ja:'盛付の基準チェックに使用',en:'Used to check plating standards',vi:'Dùng để kiểm tra trình bày'})}</small></div><input type="file" accept="image/*" multiple id="f_photo" hidden></div>
          <div class="photo-thumbs" id="photoThumbs"></div>
        </label>
        <button class="btn-primary" id="submitFP">${L({ja:'AIチェックして提出',en:'Check with AI & submit',vi:'Kiểm AI & gửi'})}</button>
        <div class="hint">${L({ ja:'本番ではAIが盛付を一次判定 → 基準外のみ本部へ通知する構想', en:'In production, AI pre-checks plating and only flags issues to HQ', vi:'Bản chính: AI kiểm tra trình bày, chỉ báo HQ khi bất thường' })}</div>
      </div>
      <div class="card">
        <h3>${L({ ja:'最近の一食目写真', en:'Recent first-plate photos', vi:'Ảnh món đầu gần đây' })}</h3>
        <div id="fpList">${recent.length ? recent.map(fpRow).join('') : `<div class="muted">${L({ja:'まだありません',en:'None yet',vi:'Chưa có'})}</div>`}</div>
      </div>`;
  };
  const fpRow = (r) => {
    const hq = getRole() === 'hq';
    const fb = r.fb;
    const badge = fb
      ? `<span class="stag ${fb.result==='ok'?'st-done':'st-doing'}">${fb.result==='ok'?L({ja:'本部OK',en:'HQ OK',vi:'HQ OK'}):L({ja:'要改善',en:'Improve',vi:'Cần sửa'})}</span>`
      : `<span class="stag ${r.ai==='ok'?'st-done':'st-new'}">${r.ai==='ok'?L({ja:'AI 基準内',en:'AI OK',vi:'AI đạt'}):L({ja:'AI 要確認',en:'AI check',vi:'AI xem'})}</span>`;
    return `
    <div class="rep">
      ${r.photos && r.photos.length ? `<img class="rep-photo" src="${photoThumb(r.photos[0])}" alt="" data-full="${photoFull(r.photos[0])}">` : `<span class="kind b">${L({ja:'写真',en:'Photo',vi:'Ảnh'})}</span>`}
      <div class="body">
        <div class="l1">${esc(r.item||'—')}</div>
        <div class="l2">${esc(r.store)} ・ ${timeAgo(r.t)}</div>
        ${fb && fb.comment ? `<div class="l2" style="color:var(--sumi)">💬 ${esc(fb.comment)}</div>` : ''}
        ${hq && r.id ? `<button class="stag st-new" data-fpfb="${esc(r.id)}" style="cursor:pointer;margin-top:6px">${fb?L({ja:'FBを編集',en:'Edit feedback',vi:'Sửa FB'}):L({ja:'本部フィードバック',en:'Give HQ feedback',vi:'FB từ HQ'})}</button>` : ''}
      </div>
      ${badge}
    </div>`;
  };
  // 一食目写真の本部フィードバック（基準内/要改善＋コメント）
  function openFPFeedback(id) {
    const r = getFP().find(x => x.id === id);
    if (!r) return;
    const cur = r.fb || { result:'ok', comment:'' };
    let result = cur.result;
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>${L({ja:'一食目写真の本部フィードバック',en:'HQ feedback on first-plate photo',vi:'Phản hồi HQ cho ảnh món đầu'})}</h3>
      <div class="sub">${esc(r.item||'—')} ・ ${esc(r.store)}</div>
      ${r.photos && r.photos.length ? `<img class="rep-photo" src="${photoThumb(r.photos[0])}" alt="" data-full="${photoFull(r.photos[0])}" style="width:100%;height:180px;object-fit:cover;border-radius:12px;margin:8px 0">` : ''}
      <div class="idlabel">${L({ja:'判定',en:'Result',vi:'Kết quả'})}</div>
      <div class="seg" data-seg="fbres" style="margin-bottom:12px">
        <button type="button" data-v="ok" class="${cur.result==='ok'?'on':''}">${L({ja:'基準内（OK）',en:'Meets standard',vi:'Đạt chuẩn'})}</button>
        <button type="button" data-v="ng" class="${cur.result==='ng'?'on':''}">${L({ja:'要改善',en:'Needs work',vi:'Cần cải thiện'})}</button>
      </div>
      <label class="fld"><span>${L({ja:'コメント',en:'Comment',vi:'Nhận xét'})}</span><textarea id="fb_comment" placeholder="${L({ja:'例：盛り付けバランス／油をしっかり切る 等',en:'e.g. plating balance / drain oil well',vi:'vd: cân đối trình bày / ráo dầu kỹ'})}">${esc(cur.comment||'')}</textarea></label>
      <button class="btn-primary" data-fbsave="1">${L({ja:'フィードバックを送る',en:'Send feedback',vi:'Gửi phản hồi'})}</button>
    </div></div>`);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) return mask.remove();
      const seg = e.target.closest('[data-seg="fbres"] [data-v]');
      if (seg) { mask.querySelectorAll('[data-seg="fbres"] button').forEach(x=>x.classList.remove('on')); seg.classList.add('on'); result = seg.dataset.v; return; }
      const img = e.target.closest('.rep-photo');
      if (img) { openLightbox(img.dataset.full); return; }
      if (e.target.closest('[data-fbsave]')) {
        const comment = (mask.querySelector('#fb_comment').value || '').trim();
        const arr = getFP(); const t = arr.find(x => x.id === id);
        if (t) { t.fb = { result, comment, t: Date.now() }; saveFP(arr); }
        mask.remove();
        toast(result==='ok' ? L({ja:'「基準内」を送りました',en:'Marked as OK',vi:'Đã đánh dấu Đạt'}) : L({ja:'「要改善」を送りました',en:'Sent improvement feedback',vi:'Đã gửi phản hồi'}));
        render();
      }
    });
    document.body.appendChild(mask);
  }

  /* 気づきの報告（まな運用：クローズ後に全スタッフが気づきを送信）*/
  const getKz = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_kizuki')) || []; } catch { return []; } };
  const saveKz = (a) => localStorage.setItem('yosakura_demo_kizuki', JSON.stringify(a));
  const KZ_CATS = [
    { v:'food',    t:{ ja:'料理', en:'Food', vi:'Món ăn' } },
    { v:'service', t:{ ja:'サービス', en:'Service', vi:'Phục vụ' } },
    { v:'other',   t:{ ja:'その他・提案', en:'Other / Idea', vi:'Khác / Đề xuất' } }
  ];
  const kzCatLabel = (v) => { const f = KZ_CATS.find(x=>x.v===v); return f ? L(f.t) : v; };
  APP_VIEWS.kizuki = () => {
    const vis = visibleStores();
    const recent = getKz().filter(r=>vis.includes(r.store)).sort((a,b)=>b.t-a.t).slice(0,6);
    const ph = L({
      ja:'例）料理＝盛り付け・味・お客様の食べ残し（理由も）／サービス＝求められた調味料・ご指摘・褒められた点／その他＝必要な器具・こんなシステムがあれば 等',
      en:'e.g. Food = plating/taste/leftovers; Service = requests/feedback/praise; Other = tools or system ideas',
      vi:'vd: Món ăn / Phục vụ / Khác (đề xuất)'
    });
    return `
      ${NOTE({ ja:'◆ クローズ後、その日出勤したスタッフ全員で「気づき」を送信（本部が改善に活用）', en:'◆ After close, every staff shares an insight (HQ uses it to improve)', vi:'◆ Sau khi đóng cửa, mỗi nhân viên gửi một ghi nhận' })}
      <div class="card" id="kzForm">
        <h3>${L({ ja:'気づきを報告', en:'Share an insight', vi:'Gửi ghi nhận' })}</h3>
        <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span>
          <select id="kz_store">${vis.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'カテゴリ', en:'Category', vi:'Danh mục' })}</span>
          <div class="seg" data-seg="kzcat">${KZ_CATS.map((c,i)=>`<button type="button" data-v="${c.v}" class="${i===0?'on':''}">${L(c.t)}</button>`).join('')}</div></label>
        <label class="fld"><span>${L({ ja:'気づいたこと', en:'Your insight', vi:'Ghi nhận' })}</span>
          <textarea id="kz_note" placeholder="${esc(ph)}"></textarea></label>
        <label class="fld"><span>${L({ ja:'写真（任意）', en:'Photo (optional)', vi:'Ảnh (tùy chọn)' })}</span>
          <div class="photo-drop" id="photoDrop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ ja:'写真を追加', en:'Add photos', vi:'Thêm ảnh' })}</b></div><input type="file" accept="image/*" multiple id="f_photo" hidden></div>
          <div class="photo-thumbs" id="photoThumbs"></div></label>
        <button class="btn-primary" id="submitKz">${L({ ja:'報告する', en:'Submit', vi:'Gửi' })}</button>
        <div class="hint">${L({ ja:'※退勤前に。お客様がいらっしゃる時はキッチン奥などご配慮を。', en:'Before leaving. Please be discreet if guests are present.', vi:'Trước khi tan ca. Vui lòng kín đáo nếu có khách.' })}</div>
      </div>
      <div class="card">
        <h3>${L({ ja:'最近の気づき', en:'Recent insights', vi:'Ghi nhận gần đây' })}</h3>
        <div id="kzList">${recent.length ? recent.map(kzRow).join('') : `<div class="muted">${L({ ja:'まだありません', en:'None yet', vi:'Chưa có' })}</div>`}</div>
      </div>`;
  };
  const kzRow = (r) => `
    <div class="rep">
      <span class="kind ${r.cat==='food'?'a':'b'}">${esc(kzCatLabel(r.cat))}</span>
      <div class="body">
        <div class="l1">${esc(r.note||'—')}</div>
        <div class="l2">${esc(r.store)} ・ ${timeAgo(r.t)}</div>
        ${(r.photos && r.photos.length) ? `<div class="rep-photos">${r.photos.map(p=>`<img class="rep-photo" src="${photoThumb(p)}" alt="" data-full="${photoFull(p)}" loading="lazy">`).join('')}</div>` : ''}
      </div>
    </div>`;

  /* 来店経路の記録（まな＝記入減少→ワンタップで記録）*/
  const getRoute = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_route')) || []; } catch { return []; } };
  const saveRoute = (a) => localStorage.setItem('yosakura_demo_route', JSON.stringify(a));
  const ROUTES = [
    { v:'google',    t:{ ja:'Google（マップ/検索）', en:'Google', vi:'Google' } },
    { v:'instagram', t:{ ja:'Instagram', en:'Instagram', vi:'Instagram' } },
    { v:'tiktok',    t:{ ja:'TikTok', en:'TikTok', vi:'TikTok' } },
    { v:'referral',  t:{ ja:'紹介・口コミ', en:'Referral', vi:'Giới thiệu' } },
    { v:'walkin',    t:{ ja:'通りがかり', en:'Walk-in', vi:'Vãng lai' } },
    { v:'repeat',    t:{ ja:'リピーター', en:'Repeat guest', vi:'Khách quen' } },
    { v:'other',     t:{ ja:'その他', en:'Other', vi:'Khác' } }
  ];
  const routeLabel = (v) => { const f = ROUTES.find(x=>x.v===v); return f ? L(f.t) : v; };
  const dayStr = (t) => { const d = new Date(t); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
  APP_VIEWS.route = () => {
    const vis = visibleStores();
    const today = dayStr(Date.now());
    const todays = getRoute().filter(r => vis.includes(r.store) && dayStr(r.t)===today);
    const counts = {}; ROUTES.forEach(r=>counts[r.v]=0);
    todays.forEach(e => { if (counts[e.route] != null) counts[e.route]++; });
    const total = todays.length;
    // 本部・全店＝全店を集約して表示（閲覧モード。記録は各店舗で）
    if (vis.length > 1) {
      const byStore = {}; vis.forEach(s=>byStore[s]=0);
      todays.forEach(e => { if (byStore[e.store] != null) byStore[e.store]++; });
      const storeRows = Object.entries(byStore).sort((a,b)=>b[1]-a[1]);
      return `
        ${NOTE({ ja:'◆ 全店の本日の来店経路を集約表示（本部・閲覧モード。記録は各店舗で行います）／※サーベイを使っている店舗は、来店経路もサーベイ側で取得します（二重入力は不要です）', en:'◆ Aggregated arrival routes (HQ view). Stores using the survey collect this in the survey instead.', vi:'◆ Tổng hợp nguồn khách (HQ). Cửa hàng dùng khảo sát thì thu thập ở khảo sát.' })}
        <div class="card">
          <h3>${L({ ja:'本日の来店経路（全店）', en:'Arrival routes today (all stores)', vi:'Nguồn khách hôm nay (toàn bộ)' })}</h3>
          <div class="stat-row"><div class="stat"><div class="n">${total}</div><div class="k">${L({ ja:'合計', en:'Total', vi:'Tổng' })}</div></div></div>
          ${ROUTES.map(r=>`<div class="bar-row"><div class="bl"><span>${esc(L(r.t))}</span><b>${counts[r.v]}</b></div><div class="bar-track"><div class="bar-fill" style="width:${total?Math.round(counts[r.v]/total*100):0}%"></div></div></div>`).join('')}
        </div>
        <div class="card">
          <h3>${L({ ja:'店舗別の本日合計', en:'Today by store', vi:'Hôm nay theo cửa hàng' })}</h3>
          ${storeRows.map(([s,c])=>`<div class="rep"><div class="body"><div class="l1">${esc(s)}</div></div><span class="amt">${c}</span></div>`).join('')}
        </div>
        <p class="hint">${L({ ja:'※ 記録は各店舗（スタッフ）が行います。端末をまたいで集約するには共有同期の設定が必要です（食べ残し報告は設定済み）。', en:'Logged by each store. Cross-device aggregation needs shared sync (Food Waste already has it).', vi:'Do từng cửa hàng ghi. Cần đồng bộ để tổng hợp giữa các máy.' })}</p>`;
    }
    // 単一店舗＝ワンタップ記録
    const store = vis[0];
    return `
      ${NOTE({ ja:'◆ お客様の来店きっかけをワンタップで記録（本日分の集計に反映）', en:'◆ One-tap logging of how guests found us (today total)', vi:'◆ Ghi nhận 1 chạm nguồn khách (thống kê hôm nay)' })}
      <div class="card">
        <h3>${L({ ja:'来店経路を記録', en:'Log arrival route', vi:'Ghi nguồn khách' })}</h3>
        <div class="muted" style="margin-bottom:10px">${L({ ja:'記録先', en:'Logging to', vi:'Ghi cho' })}：${esc(store)}</div>
        <div class="grid">
          ${ROUTES.map(r=>`<button class="tile" data-route="${r.v}" data-store="${esc(store)}" style="min-height:84px"><div class="nm">${esc(L(r.t))}</div><div class="desc" style="font-size:20px;font-weight:700;color:var(--sumi)">${counts[r.v]}</div></button>`).join('')}
        </div>
        <div class="stat-row" style="margin-top:12px"><div class="stat"><div class="n">${total}</div><div class="k">${L({ ja:'本日の記録数', en:'Logged today', vi:'Hôm nay' })}</div></div></div>
      </div>`;
  };

  /* 開局（レジ準備金）＝金種入力→合計自動。総括表のレジ締めと対 */
  const getOpen = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_open')) || []; } catch { return []; } };
  const saveOpen = (a) => localStorage.setItem('yosakura_demo_open', JSON.stringify(a));
  const DENOMS = [10000,5000,1000,500,100,50,10,5,1];
  const OPEN_TARGET = 100000;
  APP_VIEWS.openreg = () => {
    const vis = visibleStores();
    const recent = getOpen().filter(r=>vis.includes(r.store)).sort((a,b)=>b.t-a.t).slice(0,5);
    const today = new Date().toISOString().slice(0,10);
    return `
      ${NOTE({ ja:'◆ 開店時のレジ準備金を金種で入力→合計を自動計算（準備金 ¥100,000 目安）', en:'◆ Enter opening float by denomination; total auto-calculated', vi:'◆ Nhập tiền quỹ đầu ca theo mệnh giá; tự tính tổng' })}
      <div class="card" id="orForm">
        <h3>${L({ ja:'開局（レジ準備金）', en:'Register open (float)', vi:'Mở quầy (tiền quỹ)' })}</h3>
        <div class="sk-grid">
          <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select id="or_store">${vis.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
          <label class="fld"><span>${L({ ja:'日付', en:'Date', vi:'Ngày' })}</span><input type="date" id="or_date" value="${today}"></label>
        </div>
        ${DENOMS.map(d=>`<div class="rep"><div class="body"><div class="l1">¥${d.toLocaleString('en-US')}</div></div><input type="text" inputmode="numeric" class="or_denom" data-d="${d}" placeholder="0" style="width:84px;text-align:center;padding:9px"></div>`).join('')}
        <div class="stat-row" style="margin-top:10px">
          <div class="stat"><div class="n" id="or_total">¥0</div><div class="k">${L({ ja:'合計', en:'Total', vi:'Tổng' })}</div></div>
          <div class="stat"><div class="n" id="or_diff">±0</div><div class="k">${L({ ja:'準備金との差', en:'vs float', vi:'So với quỹ' })}</div></div>
        </div>
        <button class="btn-primary" id="submitOr">${L({ ja:'開局する', en:'Open register', vi:'Mở quầy' })}</button>
        <div class="hint">${L({ ja:'保存すると履歴に反映されます', en:'Saved and shown in history', vi:'Được lưu và hiển thị trong lịch sử' })}</div>
      </div>
      <div class="card"><h3>${L({ ja:'最近の開局', en:'Recent opens', vi:'Mở quầy gần đây' })}</h3>
        <div>${recent.length ? recent.map(orRow).join('') : `<div class="muted">${L({ ja:'まだありません', en:'None yet', vi:'Chưa có' })}</div>`}</div>
      </div>`;
  };
  const orRow = (r) => {
    const df = (r.total||0) - OPEN_TARGET;
    const dfTxt = df===0 ? L({ ja:'準備金ぴったり', en:'exact', vi:'khớp' }) : (df>0?'+':'−') + yen(Math.abs(df));
    return `<div class="rep">
      <span class="kind b">${esc((r.date||'').slice(5))}</span>
      <div class="body"><div class="l1">${yen(r.total)}</div><div class="l2">${esc(r.store)} ・ ${esc(dfTxt)}</div></div>
    </div>`;
  };

  /* ③ 開店・清掃チェック（動く：和牛世桜 店舗管理チェックシート2026.05に準拠）*/
  const CHECK_GROUPS = [
    { g:{ja:'開店準備',en:'Pre-open',vi:'Chuẩn bị mở'}, items:[
      {ja:'制服・身だしなみ',en:'Uniform & grooming',vi:'Đồng phục & tác phong'},
      {ja:'手洗い・消毒',en:'Handwash & sanitize',vi:'Rửa tay & khử khuẩn'},
      {ja:'当日の予約確認',en:'Today reservations',vi:'Đặt chỗ hôm nay'},
      {ja:'冷蔵庫の温度確認',en:'Fridge temperature',vi:'Nhiệt độ tủ lạnh'} ] },
    { g:{ja:'ホール・客席',en:'Hall & seats',vi:'Sảnh & bàn'}, items:[
      {ja:'客席・テーブル清掃',en:'Seats & tables cleaning',vi:'Vệ sinh bàn ghế'},
      {ja:'グラスの汚れ（水垢・くもり）',en:'Glass stains (water marks)',vi:'Vết bẩn ly'},
      {ja:'照明・調光の確認',en:'Lighting & dimming',vi:'Ánh sáng & điều chỉnh'},
      {ja:'ディスプレイ・装飾の清掃',en:'Display & decor cleaning',vi:'Vệ sinh trưng bày'} ] },
    { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
      {ja:'ステンレスの汚れ（カット後にダスター）',en:'Stainless wipe-down after cutting',vi:'Lau inox sau khi cắt'},
      {ja:'藁焼き場のステンレス（中性洗剤→乾拭き）',en:'Straw-grill stainless (detergent→dry)',vi:'Inox bếp nướng rơm'},
      {ja:'まな板・包丁の管理',en:'Cutting board & knife care',vi:'Thớt & dao'},
      {ja:'洗い場の清掃',en:'Wash area cleaning',vi:'Vệ sinh khu rửa'},
      {ja:'食材の冷蔵保管（しぐれ・いくら・魚類は使用後すぐ戻す）',en:'Refrigerate ingredients right after use',vi:'Cất lạnh nguyên liệu ngay sau khi dùng'} ] },
    { g:{ja:'トイレ・入口',en:'Restroom & entrance',vi:'WC & lối vào'}, items:[
      {ja:'トイレ便器内の汚れ（サンボール）',en:'Toilet bowl stains (Sunbowl)',vi:'Vết bẩn bồn cầu'},
      {ja:'トイレ清掃・備品補充',en:'Restroom clean & supplies',vi:'Vệ sinh WC & vật tư'},
      {ja:'営業中看板／暖簾／A型看板',en:'Open sign / noren / A-frame',vi:'Bảng hiệu / rèm / bảng A'},
      {ja:'食べ方POPの汚れ（早めに再発行）',en:'How-to-eat POP condition',vi:'Tình trạng POP cách ăn'} ] }
  ];
  // クローズ（閉店）の本部共通項目＝業務順
  const CLOSE_GROUPS = [
    { g:{ja:'クローズ準備',en:'Closing prep',vi:'Chuẩn bị đóng'}, items:[
      {ja:'ラストオーダーの確認',en:'Last order check',vi:'Kiểm tra last order'},
      {ja:'当日の売上・レジ締め',en:'Daily sales & register close',vi:'Chốt doanh thu & quầy'},
      {ja:'翌日の予約・仕込みの確認',en:'Tomorrow reservations & prep',vi:'Đặt chỗ & chuẩn bị ngày mai'} ] },
    { g:{ja:'キッチン締め',en:'Kitchen closing',vi:'Đóng bếp'}, items:[
      {ja:'食材の冷蔵・冷凍保管',en:'Store ingredients (fridge/freezer)',vi:'Bảo quản nguyên liệu'},
      {ja:'器具・まな板・包丁の洗浄',en:'Clean tools / board / knife',vi:'Vệ sinh dụng cụ'},
      {ja:'油・グリストラップの確認',en:'Oil & grease trap check',vi:'Kiểm tra dầu & bẫy mỡ'},
      {ja:'ゴミの分別・搬出',en:'Sort & take out trash',vi:'Phân loại & đổ rác'} ] },
    { g:{ja:'ホール締め',en:'Hall closing',vi:'Đóng sảnh'}, items:[
      {ja:'客席・テーブルの清掃',en:'Clean seats & tables',vi:'Vệ sinh bàn ghế'},
      {ja:'床清掃',en:'Floor cleaning',vi:'Lau sàn'},
      {ja:'トイレの最終清掃',en:'Final restroom clean',vi:'Vệ sinh WC cuối'} ] },
    { g:{ja:'火元・施錠・記録',en:'Fire / lock / record',vi:'Lửa / khóa / ghi'}, items:[
      {ja:'火元・ガスの元栓の確認',en:'Fire & gas main check',vi:'Kiểm tra lửa & gas'},
      {ja:'空調・照明・電源のオフ',en:'AC / lights / power off',vi:'Tắt điều hòa / đèn / nguồn'},
      {ja:'クローズ写真の撮影',en:'Take closing photo',vi:'Chụp ảnh đóng cửa'},
      {ja:'戸締り・施錠',en:'Lock up',vi:'Khóa cửa'} ] }
  ];
  const CK_COMMON = { open: CHECK_GROUPS, close: CLOSE_GROUPS };
  const CK_MODES = [
    { v:'open',  t:{ ja:'オープン', en:'Opening', vi:'Mở cửa' } },
    { v:'close', t:{ ja:'クローズ', en:'Closing', vi:'Đóng cửa' } }
  ];
  const getCkMode = () => (localStorage.getItem('yosakura_ckmode') === 'close' ? 'close' : 'open');
  // 店舗独自項目（店長・オーナーが追加）＝店舗×モードごと・全端末同期
  const getCkItems = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_ckitem')) || {}; } catch { return {}; } };
  const saveCkItems = (o) => { try { localStorage.setItem('yosakura_demo_ckitem', JSON.stringify(o)); } catch (e) {} };
  const ckCustom = (store, mode) => getCkItems()[`${store}||${mode}`] || [];
  // チェック状態＝店舗×モード×日付（日付が変わると自動で新しい一日になる）
  const getCkDone = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_ckdone')) || {}; } catch { return {}; } };
  const saveCkDone = (o) => { try { localStorage.setItem('yosakura_demo_ckdone', JSON.stringify(o)); } catch (e) {} };
  const ckDoneKey = (store, mode) => `${store}||${mode}||${new Date().toISOString().slice(0,10)}`;
  const ckCanEdit = () => ['manager','owner','hq'].includes(getRole());
  APP_VIEWS.checklist = () => {
    const store = visibleStores()[0];
    const mode = getCkMode();
    const groups = CK_COMMON[mode];
    const custom = ckCustom(store, mode);
    const done = getCkDone()[ckDoneKey(store, mode)] || {};
    const editable = ckCanEdit();
    const commonIds = [];
    groups.forEach((gr, gi) => gr.items.forEach((_, ii) => commonIds.push(`${mode}-c-${gi}-${ii}`)));
    const allIds = commonIds.concat(custom.map(c => c.id));
    const total = allIds.length || 1;
    const n = allIds.filter(id => done[id]).length;
    const groupsHTML = groups.map((gr, gi) => `
      <div class="sec-h" style="margin:16px 2px 6px"><span class="bar"></span><h2 style="font-size:13px">${esc(L(gr.g))}</h2></div>
      <div class="card" style="padding:4px 14px">
        ${gr.items.map((it, ii) => { const id = `${mode}-c-${gi}-${ii}`; return `<div class="check ${done[id]?'done':''}" data-ck="${id}"><span class="box">${svg('tick')}</span><span class="lbl">${esc(L(it))}</span></div>`; }).join('')}
      </div>`).join('');
    const customHTML = `
      <div class="sec-h" style="margin:16px 2px 6px"><span class="bar"></span><h2 style="font-size:13px">${L({ ja:'この店舗の追加項目', en:'Store-specific items', vi:'Mục riêng của cửa hàng' })}</h2></div>
      <div class="card" style="padding:4px 14px">
        ${custom.length ? custom.map(c => `<div class="check ${done[c.id]?'done':''}" data-ck="${c.id}"><span class="box">${svg('tick')}</span><span class="lbl">${esc(c.label)}</span>${editable ? `<button class="ck-del" data-ckdel="${c.id}" aria-label="delete">×</button>` : ''}</div>`).join('')
          : `<div class="muted" style="padding:10px 4px">${L({ ja:'追加項目はありません', en:'No custom items', vi:'Chưa có mục thêm' })}</div>`}
        ${editable ? `<div class="ck-add"><input type="text" id="ck_new" placeholder="${esc(L({ ja:'例）季節の掲示物を差し替え', en:'e.g. Swap seasonal signage', vi:'vd: Thay bảng theo mùa' }))}"><button class="mini" id="ckAdd">${L({ ja:'追加', en:'Add', vi:'Thêm' })}</button></div>` : ''}
      </div>`;
    return `
      ${NOTE({ ja:'◆ オープン／クローズの点検。本部共通項目は削除できません。店舗独自の項目は店長・オーナーが追加できます', en:'◆ Opening/closing checks. HQ common items are fixed; managers/owners can add store-specific items.', vi:'◆ Kiểm tra mở/đóng. Mục chung của HQ cố định; quản lý/chủ có thể thêm mục riêng.' })}
      <div class="card" style="text-align:center">
        <div class="seg" data-seg="ckmode" style="margin-bottom:14px">${CK_MODES.map(m => `<button type="button" data-ckmode="${m.v}" class="${m.v===mode?'on':''}">${L(m.t)}</button>`).join('')}</div>
        <h3>${mode==='open' ? L({ ja:'本日のオープン点検', en:'Today opening check', vi:'Kiểm tra mở cửa hôm nay' }) : L({ ja:'本日のクローズ点検', en:'Today closing check', vi:'Kiểm tra đóng cửa hôm nay' })}</h3>
        <div class="muted" style="margin:2px 0 8px">${esc(store)}</div>
        <div style="font-size:26px;font-weight:700;letter-spacing:.02em">${n}<span style="color:var(--gray);font-size:17px">/${total}</span></div>
        <div class="bar-track" style="margin:9px 0 2px"><div class="bar-fill" style="width:${Math.round(n/total*100)}%"></div></div>
      </div>
      ${groupsHTML}
      ${customHTML}
      <div class="hint">${L({ ja:'上から順に実施すれば完了です。チェックは店舗ごと・当日分として保存されます（翌日は自動でリセット）。', en:'Work top to bottom. Checks are saved per store for today (auto-resets next day).', vi:'Làm từ trên xuống. Lưu theo cửa hàng cho hôm nay (tự đặt lại ngày mai).' })}</div>`;
  };

  /* ④ マニュアル（権限別×業態別に出し分け）
     店舗名から業態を判定し、共通マニュアル＋その店舗の業態マニュアルを表示。
     さらに閲覧できるロールで絞る（スタッフには管理者向けを出さない）。 */
  const GYOTAI = [
    { code:'sushi',    key:['寿司','手巻き'], label:{ ja:'寿司', en:'Sushi', vi:'Sushi' } },
    { code:'gyukatsu', key:['牛カツ'],        label:{ ja:'牛カツ', en:'Gyukatsu', vi:'Gyukatsu' } },
    { code:'unagi',    key:['鰻'],            label:{ ja:'鰻', en:'Unagi (eel)', vi:'Lươn' } },
    { code:'wagyu',    key:['和牛'],          label:{ ja:'和牛', en:'Wagyu', vi:'Wagyu' } },
    { code:'washoku',  key:['日本料理'],      label:{ ja:'日本料理', en:'Japanese cuisine', vi:'Ẩm thực Nhật' } }
  ];
  const storeGyotai = (store) => { const g = GYOTAI.find(x => x.key.some(k => (store || '').includes(k))); return g ? g.code : null; };
  const gyotaiLabel = (code) => { const g = GYOTAI.find(x => x.code === code); return g ? L(g.label) : code; };
  // roles: 閲覧できるロール（'all'は全員）／gyotai: 'all' or 業態code
  const MANUAL_CATALOG = [
    { ic:'book',  gyotai:'all', roles:['all'],               t:{ja:'世桜とは・理念',en:'Brand & Philosophy',vi:'Thương hiệu & Triết lý'}, s:{ja:'5つの価値／ビジョン／ブランドコア',en:'5 values / vision / brand core',vi:'5 giá trị / tầm nhìn'} },
    { ic:'star',  gyotai:'all', roles:['all'],               t:{ja:'接客・ホール',en:'Service & Hall',vi:'Phục vụ & Sảnh'}, s:{ja:'おもてなし／多言語対応／クレーム対応',en:'Hospitality / multilingual / complaints',vi:'Hiếu khách / đa ngữ / khiếu nại'} },
    { ic:'camera',gyotai:'all', roles:['all'],               t:{ja:'提供時のあるべき姿',en:'Serving standards',vi:'Chuẩn phục vụ'}, s:{ja:'盛り付け・グラム規定・提供基準（最重要）',en:'Plating, grams, serving rules (key)',vi:'Trình bày, định lượng (quan trọng)'} },
    { ic:'check', gyotai:'all', roles:['all'],               t:{ja:'清掃',en:'Cleaning',vi:'Vệ sinh'}, s:{ja:'清掃基準／好事例（ウタマロ等）',en:'Cleaning standards / good practices',vi:'Chuẩn vệ sinh / thực hành tốt'} },
    { ic:'video', gyotai:'all', roles:['all'],               t:{ja:'衛生管理',en:'Hygiene',vi:'Vệ sinh an toàn'}, s:{ja:'手洗い／食中毒対策／食材管理',en:'Handwash / food safety / ingredients',vi:'Rửa tay / an toàn TP'} },
    { ic:'grad',  gyotai:'all', roles:['staff','manager'],   t:{ja:'セブンデイズ（新人教育）',en:'Seven Days (onboarding)',vi:'Seven Days (đào tạo)'}, s:{ja:'アルバイトが最低限理解する内容',en:'Minimum for new part-timers',vi:'Cơ bản cho nhân viên mới'} },
    { ic:'star',  gyotai:'all', roles:['all'],               t:{ja:'サーベイ運用',en:'Survey operation',vi:'Vận hành khảo sát'}, s:{ja:'iPad案内／回答の取り方',en:'iPad guidance / collecting answers',vi:'Hướng dẫn iPad'} },
    { ic:'table', gyotai:'all', roles:['manager','owner'],   t:{ja:'店舗運営',en:'Store operations',vi:'Vận hành cửa hàng'}, s:{ja:'数値管理／シフト／発注',en:'Numbers / shifts / ordering',vi:'Số liệu / ca / đặt hàng'} },
    { ic:'yen',   gyotai:'all', roles:['owner'],             t:{ja:'オーナー向け経営',en:'Owner: management',vi:'Chủ: quản lý'}, s:{ja:'PL／原価率／複数店舗管理',en:'P/L / cost ratio / multi-store',vi:'P/L / giá vốn / nhiều cửa hàng'} },
    { ic:'hq',    gyotai:'all', roles:['hq'],                t:{ja:'本部運用',en:'HQ operations',vi:'Vận hành HQ'}, s:{ja:'権限設定／提出物管理／AI判定',en:'Permissions / submissions / AI',vi:'Phân quyền / nộp bài / AI'} },
    { ic:'food',  gyotai:'unagi',    roles:['all'], t:{ja:'鰻の焼成・タレ',en:'Eel grilling & sauce',vi:'Nướng lươn & sốt'}, s:{ja:'あぶり直し／タレ／提供の説明',en:'Re-grilling / sauce / explanation',vi:'Nướng lại / sốt / giải thích'} },
    { ic:'food',  gyotai:'sushi',    roles:['all'], t:{ja:'寿司オペレーション',en:'Sushi operation',vi:'Vận hành sushi'}, s:{ja:'シャリ／握り／衛生',en:'Rice / nigiri / hygiene',vi:'Cơm / nắm / vệ sinh'} },
    { ic:'food',  gyotai:'gyukatsu', roles:['all'], t:{ja:'牛カツの提供基準',en:'Gyukatsu serving',vi:'Phục vụ gyukatsu'}, s:{ja:'揚げ／断面／盛り付け（和牛のみ使用）',en:'Frying / cut / plating',vi:'Chiên / lát cắt / trình bày'} },
    { ic:'food',  gyotai:'wagyu',    roles:['all'], t:{ja:'和牛の扱い',en:'Wagyu handling',vi:'Xử lý wagyu'}, s:{ja:'カット／藁焼き／保管',en:'Cutting / straw-grill / storage',vi:'Cắt / nướng rơm / bảo quản'} },
    { ic:'food',  gyotai:'washoku',  roles:['all'], t:{ja:'日本料理コース',en:'Japanese course',vi:'Set Nhật'}, s:{ja:'おまかせの流れ／季節の献立',en:'Omakase flow / seasonal menu',vi:'Quy trình omakase'} }
  ];
  const manualVisibleRole = (m, role) => role === 'hq' || m.roles.includes('all') || m.roles.includes(role);
  const manualRow = (m) => `<div class="mrow" data-mock="1"><div class="mi">${svg(m.ic)}</div><div class="mt"><b>${esc(L(m.t))}</b><span>${esc(L(m.s))}</span></div><span class="chev">${svg('chev')}</span></div>`;
  APP_VIEWS.manual = () => {
    const role = getRole();
    const store = visibleStores()[0];
    const gy = getRole() === 'hq' && getStoreSel() === 'all' ? null : storeGyotai(store);
    const common = MANUAL_CATALOG.filter(m => m.gyotai === 'all' && manualVisibleRole(m, role));
    // 業態別：店舗の業態のみ（本部・全店表示のときは全業態）
    const gyList = MANUAL_CATALOG.filter(m => m.gyotai !== 'all' && manualVisibleRole(m, role) && (gy ? m.gyotai === gy : true));
    const byGyotai = {};
    gyList.forEach(m => { (byGyotai[m.gyotai] = byGyotai[m.gyotai] || []).push(m); });
    const gySections = Object.keys(byGyotai).map(code => `
      <div class="sec-h" style="margin:16px 2px 6px"><span class="bar"></span><h2 style="font-size:13px">${esc(gyotaiLabel(code))}${L({ ja:'のマニュアル', en:' manuals', vi:'' })}</h2></div>
      <div class="card" style="padding:2px 0">${byGyotai[code].map(manualRow).join('')}</div>`).join('');
    return `
      ${NOTE({ ja:`◆ ${role==='hq'&&!gy ? '全店・全業態のマニュアルを表示（本部）' : (gy ? gyotaiLabel(gy)+'業態のマニュアルを表示中' : 'マニュアル')}。権限に応じて表示が変わります（中身は順次追加）`, en:'◆ Manuals filtered by role and store type (content added progressively)', vi:'◆ Cẩm nang lọc theo vai trò & loại hình (nội dung bổ sung dần)' })}
      <div class="sec-h" style="margin:6px 2px 6px"><span class="bar"></span><h2 style="font-size:13px">${L({ ja:'全業態共通', en:'All types', vi:'Chung' })}</h2></div>
      <div class="card" style="padding:2px 0">${common.map(manualRow).join('')}</div>
      ${gySections}
      <div class="hint">${L({ ja:'動画マニュアルもこの中に統合していく構想です。', en:'Video manuals will also be integrated here.', vi:'Cẩm nang video cũng sẽ được tích hợp.' })}</div>`;
  };

  /* ⑤ サーベイ（モック）*/
  /* ⑥ サーベイ（動く：お客様が満足度・来店経路・ご感想を回答→自店で集計）*/
  const getSurvey = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_survey')) || []; } catch { return []; } };
  const saveSurvey = (a) => localStorage.setItem('yosakura_demo_survey', JSON.stringify(a));
  function seedSurvey() {
    if (localStorage.getItem('yosakura_demo_survey')) return;
    const now = Date.now(), st = '寿司世桜 心斎橋店';
    saveSurvey([
      { store:st, sat:5, route:'tiktok', note:'', t:now-3600e3*5 },
      { store:st, sat:4, route:'google', note:'Great dashi!', t:now-3600e3*9 },
      { store:st, sat:5, route:'instagram', note:'', t:now-3600e3*28 }
    ]);
  }
  // iPadサーベイ運用マニュアル準拠：顔文字の満足度／改善点（複数選択）／高満足時のみ口コミ案内
  const SAT_FACES = [
    { v:1, e:'😣', t:{ja:'大変不満',en:'Very poor',vi:'Rất tệ'} },
    { v:2, e:'🙁', t:{ja:'不満',en:'Poor',vi:'Chưa tốt'} },
    { v:3, e:'😐', t:{ja:'普通',en:'OK',vi:'Bình thường'} },
    { v:4, e:'🙂', t:{ja:'満足',en:'Good',vi:'Hài lòng'} },
    { v:5, e:'😍', t:{ja:'大変満足',en:'Excellent',vi:'Rất hài lòng'} }
  ];
  const SURVEY_ISSUES = [
    { v:'food', t:{ja:'料理・味',en:'Food',vi:'Món ăn'} },
    { v:'plating', t:{ja:'盛り付け',en:'Plating',vi:'Trình bày'} },
    { v:'service', t:{ja:'接客',en:'Service',vi:'Phục vụ'} },
    { v:'timing', t:{ja:'提供時間',en:'Wait time',vi:'Thời gian'} },
    { v:'space', t:{ja:'内装・空間',en:'Ambience',vi:'Không gian'} },
    { v:'price', t:{ja:'価格',en:'Price',vi:'Giá'} },
    { v:'other', t:{ja:'その他',en:'Other',vi:'Khác'} }
  ];
  const surveyIssueLabel = (v) => { const f = SURVEY_ISSUES.find(x=>x.v===v); return f ? L(f.t) : v; };
  const SURVEY_URL = 'https://yosakurasurvey.vercel.app/store2.html';
  APP_VIEWS.survey = () => {
    const vis = visibleStores();
    const rows = getSurvey().filter(r => vis.includes(r.store));
    const n = rows.length;
    const avg = n ? (rows.reduce((s, r) => s + (Number(r.sat) || 0), 0) / n) : 0;
    return `
      ${NOTE({ ja:'◆ サーベイはサーベイ（iPadの本番フォーム）で運用します。このアプリは入口と運用メモの役割です。', en:'◆ Surveys are run in the live iPad form. This app provides the entry point and operating notes.', vi:'◆ Khảo sát chạy trên form iPad thật. Ứng dụng chỉ là lối vào và ghi chú vận hành.' })}
      <div class="card">
        <h3>${L({ ja:'お客様アンケート（本番）', en:'Guest survey (live)', vi:'Khảo sát khách (thật)' })}</h3>
        <button class="btn-primary" id="surveyOpen" data-url="${SURVEY_URL}">${L({ ja:'本番サーベイを開く（お客様のiPad用）', en:'Open live survey (for guests)', vi:'Mở khảo sát thật (cho khách)' })}</button>
        <div class="hint">${L({ ja:'声かけは短く：「お時間がありましたら、アンケートにご協力をお願いいたします。」／回答は誘導せず、満足度を最優先に。', en:'Keep it short; never lead the answer; prioritize the guest.', vi:'Nói ngắn gọn; không gợi ý câu trả lời.' })}</div>
        <div class="hint">${L({ ja:'※「大変満足／満足」の時だけ、控えめに口コミQRをご案内（断られたらすぐ引く）。', en:'Only when highly satisfied, gently offer the review QR.', vi:'Chỉ khi rất hài lòng mới mời đánh giá.' })}</div>
      </div>
      ${(['manager','owner','hq'].includes(getRole()) && n) ? surveyAgg(rows, vis) : ''}`;
  };
  // サーベイ集計（本部・オーナー・店長向け）：満足度分布／低評価／来店経路／月別推移／店舗別
  function surveyAgg(rows, vis) {
    const n = rows.length;
    const avg = n ? rows.reduce((s, r) => s + (Number(r.sat) || 0), 0) / n : 0;
    const low = rows.filter(r => (Number(r.sat) || 0) <= 2).length;
    const dist = [5, 4, 3, 2, 1].map(s => ({ s, c: rows.filter(r => Number(r.sat) === s).length }));
    const rc = {}; ROUTES.forEach(x => rc[x.v] = 0); rows.forEach(r => { if (rc[r.route] != null) rc[r.route]++; });
    const ymOf = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const mc = {}; rows.forEach(r => { const k = ymOf(r.t); mc[k] = (mc[k] || 0) + 1; });
    const months = Object.keys(mc).sort().slice(-6);
    const barRow = (label, c, total, cls) => `<div class="bar-row"><div class="bl"><span>${esc(label)}</span><b>${c}</b></div><div class="bar-track"><div class="bar-fill ${cls||''}" style="width:${total ? Math.round(c / total * 100) : 0}%"></div></div></div>`;
    const byStore = vis.length > 1 ? (() => {
      const bs = {}; vis.forEach(s => bs[s] = { n: 0, sum: 0, low: 0 });
      rows.forEach(r => { if (bs[r.store]) { bs[r.store].n++; bs[r.store].sum += Number(r.sat) || 0; if ((Number(r.sat) || 0) <= 2) bs[r.store].low++; } });
      return `<div class="card"><h3>${L({ ja:'店舗別の評価', en:'By store', vi:'Theo cửa hàng' })}</h3>
        ${vis.map(s => { const b = bs[s]; const a = b.n ? (b.sum / b.n) : 0; return `<div class="rep"><span class="amt" style="${b.low?'color:#a23b3b':''}">${b.n ? a.toFixed(1) : '—'}</span><div class="body"><div class="l1">${esc(s)}</div><div class="l2">${L({ja:'回答',en:'Resp.',vi:'PH'})} ${b.n} ・ ${L({ja:'低評価',en:'Low',vi:'Thấp'})} ${b.low}</div></div></div>`; }).join('')}
      </div>`;
    })() : '';
    return `
      <div class="card">
        <h3>${L({ ja:'サーベイ集計', en:'Survey summary', vi:'Tổng hợp khảo sát' })}</h3>
        <div class="stat-row">
          <div class="stat"><div class="n">${n}</div><div class="k">${L({ ja:'回答数', en:'Responses', vi:'Phản hồi' })}</div></div>
          <div class="stat"><div class="n">${avg.toFixed(1)}</div><div class="k">${L({ ja:'平均満足度', en:'Avg.', vi:'TB' })}</div></div>
          <div class="stat"><div class="n" style="${low?'color:#a23b3b':''}">${low}</div><div class="k">${L({ ja:'低評価(1-2)', en:'Low (1-2)', vi:'Thấp' })}</div></div>
        </div>
        <div class="idlabel" style="margin-top:12px">${L({ ja:'満足度の分布', en:'Rating distribution', vi:'Phân bố đánh giá' })}</div>
        ${dist.map(d => barRow('★' + d.s, d.c, n, d.s <= 2 ? 'bar-low' : '')).join('')}
        <div class="idlabel" style="margin-top:12px">${L({ ja:'来店経路', en:'Arrival route', vi:'Nguồn khách' })}</div>
        ${ROUTES.map(r => barRow(L(r.t), rc[r.v], n)).join('')}
        ${months.length ? `<div class="idlabel" style="margin-top:12px">${L({ ja:'月別の回答数', en:'Responses by month', vi:'PH theo tháng' })}</div>${months.map(m => barRow(m, mc[m], Math.max(...months.map(x => mc[x])))).join('')}` : ''}
      </div>
      ${byStore}
      <p class="hint" style="display:block">${L({ ja:'※ 来店国など一部項目は本番サーベイ側に蓄積されます。ここはアプリ入力分の集計です。', en:'Some fields (e.g. country) live in the survey tool. This aggregates app entries.', vi:'Một số mục nằm ở công cụ khảo sát.' })}</p>`;
  }

  /* ⑥ 総括表（動く：実日報フォーマットで入力→保存→履歴＆本部集約）*/
  const yen = (n) => '¥' + (Number(n) || 0).toLocaleString('en-US');
  APP_VIEWS.soukatsu = () => {
    const vis = visibleStores();
    const recent = getSk().filter(r => vis.includes(r.store)).sort((a,b)=>b.t-a.t).slice(0,6);
    const today = new Date().toISOString().slice(0,10);
    return `
      ${NOTE({ ja:'◆ 実際の日報フォーマットで入力→保存できます（履歴と本部集約に反映）', en:'◆ Enter in the real daily-report format; it saves to history & HQ', vi:'◆ Nhập theo mẫu báo cáo ngày thực tế; lưu vào lịch sử & HQ' })}
      <div class="card" id="skForm">
        <h3>${L({ ja:'本日の総括表', en:'Daily report', vi:'Báo cáo ngày' })}</h3>
        <div class="sk-grid">
          <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select id="sk_store">${vis.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
          <label class="fld"><span>${L({ ja:'日付', en:'Date', vi:'Ngày' })}</span><input type="date" id="sk_date" value="${today}"></label>
          <label class="fld"><span>${L({ja:'当日売上',en:'Sales',vi:'Doanh thu'})}</span><input type="text" inputmode="numeric" id="sk_sales" placeholder="186817"></label>
          <label class="fld"><span>${L({ja:'客数',en:'Guests',vi:'Khách'})}</span><input type="text" inputmode="numeric" id="sk_guests" placeholder="16"></label>
        </div>
        <div class="stat-row" style="margin:2px 0 10px">
          <div class="stat"><div class="n" id="sk_avg">¥0</div><div class="k">${L({ja:'客単価（自動計算）',en:'Per guest (auto)',vi:'BQ/khách (tự động)'})}</div></div>
          <div class="stat"><div class="n" id="sk_rate">—</div><div class="k">${L({ja:'到達度（自動）',en:'To goal (auto)',vi:'Đạt mục tiêu (auto)'})}</div></div>
        </div>
        <div class="sk-grid">
          <label class="fld"><span>${L({ja:'純売上',en:'Net sales',vi:'Doanh thu thuần'})}</span><input type="text" inputmode="numeric" id="sk_net" placeholder="129136"></label>
          <label class="fld"><span>${L({ja:'レジ誤差',en:'Register error',vi:'Sai lệch quầy'})}</span><input type="text" inputmode="numeric" id="sk_err" placeholder="0"></label>
          <label class="fld"><span>${L({ja:'月累計売上',en:'Month-to-date',vi:'Lũy kế tháng'})}</span><input type="text" inputmode="numeric" id="sk_mtd" placeholder="2146145"></label>
          <label class="fld"><span>${L({ja:'売上目標（月）',en:'Monthly goal',vi:'Mục tiêu tháng'})}</span><input type="text" inputmode="numeric" id="sk_goal" placeholder="3000000"></label>
          <label class="fld"><span>${L({ja:'フード数',en:'Food items',vi:'Số món ăn'})}</span><input type="text" inputmode="numeric" id="sk_foodct" placeholder="29"></label>
          <label class="fld"><span>${L({ja:'飲料数',en:'Drink items',vi:'Số đồ uống'})}</span><input type="text" inputmode="numeric" id="sk_drinkct" placeholder="14"></label>
        </div>
        <div class="sk-grid">
          <label class="fld"><span>${L({ja:'口コミ 当日',en:'Reviews today',vi:'Đánh giá nay'})}</span><input type="text" inputmode="numeric" id="sk_rvt" placeholder="2"></label>
          <label class="fld"><span>${L({ja:'口コミ 累計',en:'Reviews total',vi:'Đánh giá tổng'})}</span><input type="text" inputmode="numeric" id="sk_rva" placeholder="70"></label>
          <label class="fld"><span>${L({ja:'ヒアリング 当日',en:'Hearings today',vi:'Phỏng vấn nay'})}</span><input type="text" inputmode="numeric" id="sk_hear" placeholder="9"></label>
          <label class="fld"><span>${L({ja:'値引き',en:'Discount',vi:'Giảm giá'})}</span><input type="text" inputmode="numeric" id="sk_disc" placeholder="0"></label>
          <label class="fld"><span>${L({ja:'原価率 %',en:'Food cost %',vi:'Giá vốn %'})}</span><input type="text" inputmode="decimal" id="sk_food" placeholder="36.5"></label>
          <label class="fld"><span>${L({ja:'人件費率 %',en:'Labor %',vi:'Nhân sự %'})}</span><input type="text" inputmode="decimal" id="sk_labor" placeholder="23.6"></label>
          <label class="fld"><span>${L({ja:'チップ 当日',en:'Tips today',vi:'Tip nay'})}</span><input type="text" inputmode="numeric" id="sk_tipt" placeholder="21000"></label>
          <label class="fld"><span>${L({ja:'チップ 累計',en:'Tips total',vi:'Tip tổng'})}</span><input type="text" inputmode="numeric" id="sk_tipa" placeholder="84541"></label>
          <label class="fld"><span>${L({ja:'キャンセル 累計',en:'Cancel total',vi:'Hủy tổng'})}</span><input type="text" inputmode="numeric" id="sk_cancel" placeholder="31700"></label>
          <label class="fld"><span>${L({ja:'レジ締め担当',en:'Cash-up by',vi:'Người chốt sổ'})}</span><input type="text" id="sk_closer" placeholder="${L({ja:'担当者名',en:'staff name',vi:'tên NV'})}"></label>
        </div>
        <label class="fld"><span>${L({ ja:'清掃・特記事項', en:'Cleaning & notes', vi:'Vệ sinh & ghi chú' })}</span><textarea id="sk_note" placeholder="${L({ja:'本日の気づき・清掃箇所など',en:'Findings, cleaning done, etc.',vi:'Ghi chú, vệ sinh đã làm...'})}"></textarea></label>
        <label class="fld"><span>${L({ ja:'翌日の食材発注', en:'Tomorrow ingredient order', vi:'Đặt NL ngày mai' })}</span><textarea id="sk_order" placeholder="${L({ja:'例：豆乳6／寿司のエビ2／お米 …',en:'e.g. soy milk 6 / shrimp 2 / rice …',vi:'vd: sữa đậu 6 / tôm 2 / gạo …'})}"></textarea></label>
        <button class="btn-primary" id="submitSk">${L({ja:'提出する',en:'Submit',vi:'Nộp'})}</button>
        <div class="hint">${L({ja:'保存すると、下の履歴と「本部ダッシュボード」に反映されます',en:'Saved and shown below and in the HQ Dashboard',vi:'Được lưu và hiển thị bên dưới và ở Bảng điều khiển'})}</div>
      </div>
      <div class="card">
        <h3>${L({ ja:'最近の総括表', en:'Recent daily reports', vi:'Báo cáo gần đây' })}</h3>
        <div id="skList">${recent.length ? recent.map(skRow).join('') : `<div class="muted">${L({ja:'まだありません',en:'None yet',vi:'Chưa có'})}</div>`}</div>
      </div>`;
  };
  const skRow = (r) => `
    <div class="rep">
      <span class="kind b">${esc((r.date||'').slice(5))}</span>
      <div class="body">
        <div class="l1">${yen(r.sales)} ・ ${esc(r.guests||0)}${L({ja:'名',en:' guests',vi:' khách'})}</div>
        <div class="l2">${esc(r.store)}${r.food?' ・ FL '+esc(r.food)+'/'+esc(r.labor||'—')+'%':''}${r.closer?' ・ '+L({ja:'締め',en:'by',vi:'chốt'})+':'+esc(r.closer):''}</div>
      </div>
      <span class="amt">${r.guests?yen(Math.round((Number(r.sales)||0)/(Number(r.guests)||1))):'—'}</span>
    </div>`;

  /* ⑦ 開業スケジュール D-90（モック）*/
  const TL = [
    ['D-90',{ja:'加盟契約締結・KO/1st〜3rd MTG・近隣店舗情報収集',en:'Contract, KO/1st-3rd MTG, area research',vi:'Ký HĐ, KO/1st-3rd MTG, khảo sát khu vực'}],
    ['D-75',{ja:'出店エリア確定・現地調査・物件選定・業態提案・物件契約',en:'Area fixed, survey, site select, format, lease',vi:'Chốt khu vực, khảo sát, chọn mặt bằng, ký thuê'}],
    ['D-60',{ja:'内装発注・店舗設計/施工見積・Instagram/LINE作成・MEO/Googleマイビジネス・採用面接/研修',en:'Interior order, design, SNS, MEO, hiring',vi:'Đặt nội thất, thiết kế, SNS, MEO, tuyển dụng'}],
    ['D-30',{ja:'許認可申請・行政検査・内装施工・備品搬入・写真撮影・PR TIMES・口コミ返信担当設置',en:'Permits, inspection, build, equipment, PR, reviews',vi:'Giấy phép, kiểm tra, thi công, thiết bị, PR'}],
    ['D-14',{ja:'研修・現地入り・仕込み・オペ確認',en:'Training, on-site prep, ops check',vi:'Đào tạo, chuẩn bị, kiểm tra vận hành'}],
    ['D-Day',{ja:'オープン（本部が現地サポート）',en:'Opening (HQ on-site support)',vi:'Khai trương (HQ hỗ trợ tại chỗ)'}]
  ];
  APP_VIEWS.schedule = () => `
    ${NOTE({ ja:'◆ 実際の開業マスタースケジュール（D-90）に準拠', en:'◆ Based on the real D-90 opening master schedule', vi:'◆ Theo lịch khai trương D-90 thực tế' })}
    <div class="card"><div class="tl">
      ${TL.map(([d,t])=>`<div class="ev"><div class="d">${d}</div><div class="t">${esc(L(t))}</div></div>`).join('')}
    </div></div>`;

  /* ⑧ 数値・原価率（月次）＝月初在庫＋当月仕入－月末在庫＝当月原価、原価率＝原価÷売上。
     前月末在庫は翌月の月初在庫へ自動引継。全端末同期（店舗×月ごと最新版が正）。 */
  const getMonthly = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_monthly')) || []; } catch { return []; } };
  const saveMonthly = (a) => { try { localStorage.setItem('yosakura_demo_monthly', JSON.stringify(a)); } catch (e) {} };
  const plCalc = (m) => { const sales = Number(m.sales) || 0; const cost = (Number(m.open) || 0) + (Number(m.purchase) || 0) - (Number(m.close) || 0); const costRate = sales ? cost / sales * 100 : 0; const gross = sales - cost; const grossRate = sales ? gross / sales * 100 : 0; return { sales, cost, costRate, gross, grossRate }; };
  const prevYm = (ym) => { const [y, m] = (ym || '').split('-').map(Number); if (!y) return ''; const d = new Date(y, m - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const plMonthsOf = (store) => getMonthly().filter(r => r.store === store).sort((a, b) => a.ym < b.ym ? 1 : -1);
  const plPrevClose = (store, ym) => { const r = getMonthly().find(x => x.store === store && x.ym === prevYm(ym)); return r ? r.close : ''; };
  const pct = (v) => (Number(v) || 0).toFixed(1) + '%';
  const plRow = (m) => { const c = plCalc(m); return `<div class="rep"><span class="kind ${c.costRate>0&&c.costRate<=35?'b':'a'}">${esc(m.ym)}</span><div class="body"><div class="l1">${L({ja:'売上',en:'Sales',vi:'DT'})} ${yen(c.sales)} ・ ${L({ja:'原価率',en:'Cost',vi:'Giá vốn'})} <b>${pct(c.costRate)}</b></div><div class="l2">${L({ja:'原価',en:'Cost',vi:'Giá vốn'})} ${yen(c.cost)} ・ ${L({ja:'粗利',en:'Gross',vi:'Lãi gộp'})} ${yen(c.gross)}（${pct(c.grossRate)}）</div></div></div>`; };
  APP_VIEWS.pl = () => {
    const vis = visibleStores();
    // 複数店舗（オーナー所有／本部全店）＝直近月の原価率を店舗比較
    if (vis.length > 1) {
      return `
        ${NOTE({ ja:'◆ 各店の直近月の売上・原価率を比較（入力は店舗を選ぶと行えます）', en:'◆ Compare latest-month sales & cost ratio by store', vi:'◆ So sánh doanh thu & giá vốn tháng gần nhất theo cửa hàng' })}
        <div class="card"><h3>${L({ ja:'店舗別（直近月）', en:'By store (latest month)', vi:'Theo cửa hàng' })}</h3>
          ${vis.map(s => { const m = plMonthsOf(s)[0]; if (!m) return `<div class="rep"><div class="body"><div class="l1">${esc(s)}</div><div class="l2">${L({ja:'未入力',en:'No data',vi:'Chưa nhập'})}</div></div></div>`; const c = plCalc(m); return `<div class="rep"><span class="amt">${pct(c.costRate)}</span><div class="body"><div class="l1">${esc(s)}</div><div class="l2">${esc(m.ym)} ・ ${L({ja:'売上',en:'Sales',vi:'DT'})} ${yen(c.sales)} ・ ${L({ja:'粗利',en:'Gross',vi:'Lãi'})} ${yen(c.gross)}</div></div></div>`; }).join('')}
        </div>
        <p class="hint">${L({ ja:'※ 入力は右上で対象店舗を選んでから', en:'Pick a store (top-right) to enter data', vi:'Chọn cửa hàng (góc phải) để nhập' })}</p>`;
    }
    const store = vis[0];
    const rows = plMonthsOf(store);
    const nowYm = new Date().toISOString().slice(0, 7);
    const cur = rows.find(r => r.ym === nowYm) || {};
    const openDef = cur.open != null && cur.open !== '' ? cur.open : plPrevClose(store, nowYm);
    return `
      ${NOTE({ ja:'◆ 月次の売上・仕入・在庫を入力→原価率を自動計算。前月末在庫は今月の月初在庫へ自動で引き継ぎます', en:'◆ Enter monthly sales/purchases/stock → cost ratio auto-calculated', vi:'◆ Nhập doanh thu/nhập hàng/tồn kho → tự tính giá vốn' })}
      <div class="card" id="plForm">
        <h3>${L({ ja:'月次数値の入力', en:'Monthly numbers', vi:'Số liệu tháng' })} — ${esc(storeShort(store))}</h3>
        <div class="sk-grid">
          <label class="fld"><span>${L({ ja:'対象月', en:'Month', vi:'Tháng' })}</span><input type="month" id="pl_ym" value="${esc(nowYm)}"></label>
          <label class="fld"><span>${L({ ja:'売上（税抜・月合計）', en:'Sales (monthly)', vi:'Doanh thu tháng' })}</span><input type="text" inputmode="numeric" id="pl_sales" value="${esc(cur.sales||'')}" placeholder="0"></label>
          <label class="fld"><span>${L({ ja:'当月仕入（合計）', en:'Purchases', vi:'Nhập hàng' })}</span><input type="text" inputmode="numeric" id="pl_purchase" value="${esc(cur.purchase||'')}" placeholder="0"></label>
          <label class="fld"><span>${L({ ja:'月初在庫', en:'Opening stock', vi:'Tồn đầu kỳ' })}</span><input type="text" inputmode="numeric" id="pl_open" value="${esc(openDef||'')}" placeholder="0"></label>
          <label class="fld"><span>${L({ ja:'月末在庫（棚卸）', en:'Closing stock', vi:'Tồn cuối kỳ' })}</span><input type="text" inputmode="numeric" id="pl_close" value="${esc(cur.close||'')}" placeholder="0"></label>
        </div>
        <div class="stat-row" style="margin-top:8px">
          <div class="stat"><div class="n" id="pl_cost">¥0</div><div class="k">${L({ ja:'当月原価', en:'Cost', vi:'Giá vốn' })}</div></div>
          <div class="stat"><div class="n" id="pl_costrate">—</div><div class="k">${L({ ja:'原価率', en:'Cost ratio', vi:'Tỷ lệ giá vốn' })}</div></div>
          <div class="stat"><div class="n" id="pl_grossrate">—</div><div class="k">${L({ ja:'粗利率', en:'Gross margin', vi:'Biên lãi gộp' })}</div></div>
        </div>
        <button class="btn-primary" id="plSave">${L({ ja:'保存する', en:'Save', vi:'Lưu' })}</button>
        <div class="hint">${L({ ja:'原価率＝（月初在庫＋当月仕入－月末在庫）÷売上', en:'Cost ratio = (open + purchases − close) ÷ sales', vi:'Giá vốn = (đầu + nhập − cuối) ÷ doanh thu' })}</div>
      </div>
      <div class="card"><h3>${L({ ja:'月別の推移', en:'Monthly history', vi:'Lịch sử theo tháng' })}</h3>
        ${rows.length ? rows.map(plRow).join('') : `<div class="muted">${L({ ja:'まだ入力がありません', en:'No data yet', vi:'Chưa có' })}</div>`}
      </div>`;
  };

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
      <div class="card"><h3>${L({ ja:'最新の報告', en:'Latest reports', vi:'Báo cáo mới nhất' })}</h3>${recent.map(repRow).join('')}</div>
      ${(() => {
        const sk = getSk().filter(r => vis.includes(r.store));
        if (!sk.length) return '';
        const latest = {}; sk.slice().sort((a,b)=>a.t-b.t).forEach(r => latest[r.store] = r);
        const rows = Object.values(latest).sort((a,b)=>b.t-a.t).slice(0,6);
        return `<div class="card"><h3>${L({ ja:'最新の総括表（店舗別）', en:'Latest daily report by store', vi:'Báo cáo mới theo cửa hàng' })}</h3>${rows.map(skRow).join('')}</div>`;
      })()}
      ${(() => {
        const kz = getKz().filter(r => vis.includes(r.store));
        if (!kz.length) return '';
        const rows = kz.slice().sort((a,b)=>b.t-a.t).slice(0,6);
        return `<div class="card"><h3>${L({ ja:'最近の気づき（全店）', en:'Recent staff insights', vi:'Ghi nhận gần đây' })}</h3>${rows.map(kzRow).join('')}</div>`;
      })()}`;
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
      <button class="btn-primary" style="margin-top:14px" id="demoInvoice">${L({ja:'請求書の受領状況を確認（準備中）',en:'Check invoice status (in preparation)',vi:'Kiểm tra hóa đơn (đang chuẩn bị)'})}</button>
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
    ${NOTE({ ja:'◆ 準備中：キャリアアップ制度・面談の一元管理（画面イメージ）', en:'◆ In preparation: career ranks & interviews', vi:'◆ Đang chuẩn bị: xếp hạng & phỏng vấn' })}
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
  // APP_VIEWS.teishutsu は「提出管理レイヤー」で実データ版に再定義（下方）。ここでの旧モック定義は削除済み。

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
      <button class="btn-primary" id="demoOrder">${L({ja:'発注する（準備中）',en:'Order (in preparation)',vi:'Đặt (đang chuẩn bị)'})}</button>
      <div class="hint">${L({ ja:'納期は通常 発注後 約1週間。お品代は注文先業者の請求書に準じ、POP等は納品後ロイヤリティに加算して請求。POP修正500円〜／新規2,000円〜（要素追加は本部承認）。', en:'Lead time ~1 week. Costs follow vendor invoices; POP etc. billed via royalty. POP edit from 500 yen / new from 2,000 yen (additions need HQ approval).', vi:'Giao ~1 tuần. Chi phí theo hóa đơn NCC; POP tính qua royalty. Sửa POP từ 500 yen / mới từ 2,000 yen (thêm mục cần HQ duyệt).' })}</div>
    </div>`;

  /* リンク集（初期リンク・発注リンク集）*/
  const LINK_GROUPS = [
    { g:{ja:'初期セットアップ',en:'Initial setup',vi:'Cài đặt ban đầu'}, items:[
      {ja:'Googleビジネスプロフィール',en:'Google Business Profile',vi:'Google Business'},
      {ja:'Googleカレンダー共有',en:'Google Calendar share',vi:'Chia sẻ lịch Google'},
      {ja:'公式LINE / サーベイ設定',en:'Official LINE / Survey setup',vi:'LINE chính thức / Khảo sát'} ] },
    { g:{ja:'発注',en:'Ordering',vi:'Đặt hàng'}, items:[
      {ja:'備品・食材 発注フォーム（パートナーズ）',en:'Supply & ingredient order form',vi:'Form đặt vật tư & NL'},
      {ja:'口コミQR 作成',en:'Review QR generator',vi:'Tạo QR đánh giá'} ] },
    { g:{ja:'学ぶ',en:'Learn',vi:'Học'}, items:[
      {ja:'マニュアル目次',en:'Manual index',vi:'Mục lục cẩm nang'},
      {ja:'7DAYS 研修',en:'7DAYS training',vi:'Đào tạo 7DAYS'} ] }
  ];
  APP_VIEWS.links = () => `
    ${NOTE({ ja:'◆ 準備中：各店に必要なリンクを1画面に集約', en:'◆ In preparation: key links for each store in one place', vi:'◆ Đang chuẩn bị: liên kết cần thiết ở một nơi' })}
    ${LINK_GROUPS.map(sec=>`
      <div class="card">
        <h3>${esc(L(sec.g))}</h3>
        ${sec.items.map(it=>`<div class="mrow" data-mock="1"><div class="mi">${svg('link')}</div><div class="mt"><b>${esc(L(it))}</b></div><span class="chev">${svg('chev')}</span></div>`).join('')}
      </div>`).join('')}`;

  /* 棚卸・在庫入力 */
  const INV_ITEMS = [
    {ja:'うなぎ（真空パック）',en:'Unagi (vacuum)',vi:'Lươn (hút chân không)'},
    {ja:'和牛',en:'Wagyu',vi:'Wagyu'},
    {ja:'お米（武川米）',en:'Rice (Mukawa)',vi:'Gạo (Mukawa)'},
    {ja:'世桜梅酒',en:'Plum wine',vi:'Rượu mơ'},
    {ja:'食べ方POP',en:'How-to-eat POP',vi:'POP cách ăn'},
    {ja:'おしぼり',en:'Wet towels',vi:'Khăn ướt'},
    {ja:'茶碗',en:'Rice bowls',vi:'Chén cơm'}
  ];
  APP_VIEWS.inventory = () => `
    ${NOTE({ ja:'◆ 準備中：棚卸をスマホ/PCから入力（保存はこの端末）', en:'◆ In preparation: enter stocktake from phone/PC (saved on device)', vi:'◆ Đang chuẩn bị: nhập kiểm kho (lưu trên máy)' })}
    <div class="card">
      <h3>${L({ ja:'在庫入力', en:'Enter stock', vi:'Nhập tồn kho' })}</h3>
      <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select>${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
      ${INV_ITEMS.map(it=>`<div class="rep"><div class="body"><div class="l1">${esc(L(it))}</div></div><input type="text" inputmode="numeric" placeholder="0" style="width:70px;text-align:center;padding:8px"></div>`).join('')}
      <button class="btn-primary" style="margin-top:12px" id="demoInv">${L({ja:'保存（準備中）',en:'Save (in preparation)',vi:'Lưu (đang chuẩn bị)'})}</button>
      <div class="hint">${L({ ja:'本番では発注システムと連動し、基準を下回った品目を発注候補として自動抽出する構想。', en:'In production, links to ordering and auto-suggests items below threshold.', vi:'Bản chính: liên kết đặt hàng, tự gợi ý mặt hàng dưới ngưỡng.' })}</div>
    </div>`;

  /* ① 接客スクリプト・食べ方ガイド（多言語・寿司世桜の来店FBの実フレーズ）*/
  const TALK = [
    { h:{ ja:'ご挨拶', en:'Greeting', vi:'Chào hỏi' }, items:[
      { ja:'本日は世桜へようこそ。シェフのおまかせと日本伝統の出汁でお楽しみください。',
        en:'Thank you for visiting YOSAKURA today. We serve the chef\'s omakase with a traditional Japanese dashi soup. Please enjoy the gentle and beautiful taste of Japan.',
        vi:'Cảm ơn quý khách đã đến YOSAKURA. Mời quý khách thưởng thức omakase của đầu bếp cùng nước dùng dashi truyền thống.' }
    ]},
    { h:{ ja:'食べ方・ペアリング', en:'How to enjoy / Pairing', vi:'Cách thưởng thức' }, items:[
      { ja:'まず出汁をひと口、次にお寿司を、そしてもうひと口出汁を。味のバランスが引き立ちます。',
        en:'Try tasting the broth first, then enjoy the sushi, and take another sip after. It helps bring out the balance of flavors.',
        vi:'Hãy nếm nước dùng trước, rồi ăn sushi, sau đó nhấp thêm một ngụm. Giúp cân bằng hương vị.' },
      { ja:'この出汁は、次にお出しするカニと一緒にお楽しみください。浸すと風味が一層引き立ちます。',
        en:'Please enjoy this broth with the crab served next. By dipping it in the broth, you can enjoy the flavor even more.',
        vi:'Mời dùng nước dùng này với cua phục vụ tiếp theo. Chấm vào sẽ ngon hơn.' }
    ]},
    { h:{ ja:'料理のご説明', en:'Dish explanation', vi:'Giới thiệu món' }, items:[
      { ja:'出汁は、干した魚と海藻からとった日本のスープです。',
        en:'This is Japanese soup stock made from dried fish and seaweed.',
        vi:'Đây là nước dùng Nhật nấu từ cá khô và rong biển.' },
      { ja:'シェフの季節のおすすめをお楽しみください。',
        en:'Please enjoy the chef\'s seasonal selection.',
        vi:'Mời quý khách thưởng thức lựa chọn theo mùa của đầu bếp.' }
    ]},
    { h:{ ja:'注意のお声がけ', en:'Safety notes', vi:'Lưu ý an toàn' }, items:[
      { ja:'熱いのでお気をつけください。',
        en:'It\'s very hot. Please be careful.',
        vi:'Món rất nóng, xin quý khách cẩn thận.' },
      { ja:'こちらはカニの天ぷらです。中に柔らかい骨があるのでお気をつけてお召し上がりください。',
        en:'This is crab tempura. Please enjoy it carefully — there are thin soft bones inside.',
        vi:'Đây là tempura cua. Bên trong có xương mềm, xin dùng cẩn thận.' }
    ]}
  ];
  APP_VIEWS.talk = () => `
    ${NOTE({ ja:'◆ 提供時にそのまま使える多言語フレーズ（外国籍スタッフの方も安心）', en:'◆ Ready-to-use multilingual phrases for serving', vi:'◆ Câu đa ngữ dùng ngay khi phục vụ' })}
    ${TALK.map(sec=>`<div class="card"><h3>${esc(L(sec.h))}</h3>${sec.items.map(it=>`
      <div class="rep" style="display:block;padding:10px 2px">
        <div class="l1" style="margin-bottom:5px">${esc(it.ja)}</div>
        <div class="l2" style="color:var(--sumi)"><b>EN</b>　${esc(it.en)}</div>
        <div class="l2"><b>VI</b>　${esc(it.vi)}</div>
      </div>`).join('')}</div>`).join('')}`;

  /* ③ 口コミQR（Googleレビュー直リンク・谷口さん課題対応）*/
  const getReviewMap = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_review')) || {}; } catch { return {}; } };
  const saveReviewMap = (m) => localStorage.setItem('yosakura_demo_review', JSON.stringify(m));
  APP_VIEWS.review = () => {
    const store = visibleStores()[0];
    const url = getReviewMap()[store] || '';
    return `
      ${NOTE({ ja:'◆ お客様がQRを読むとGoogleレビュー投稿ページへ直接移動（投稿までの導線を短縮）', en:'◆ Scanning the QR opens the Google review page directly', vi:'◆ Quét QR mở thẳng trang đánh giá Google' })}
      <div class="card" style="text-align:center">
        <h3>${L({ ja:'口コミQR', en:'Review QR', vi:'QR đánh giá' })}</h3>
        <div class="muted" style="margin-bottom:6px">${esc(store)}</div>
        ${url ? `
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(url)}" alt="QR" style="width:220px;height:220px;border:1px solid var(--line);border-radius:14px;margin:6px auto;display:block">
          <button class="btn-primary" id="reviewOpen" data-url="${esc(url)}" style="margin-top:8px">${L({ ja:'レビューページを開く', en:'Open review page', vi:'Mở trang đánh giá' })}</button>
          <button class="stag st-new" id="reviewCopy" data-url="${esc(url)}" style="cursor:pointer;margin-top:10px">${L({ ja:'リンクをコピー', en:'Copy link', vi:'Sao chép' })}</button>
        ` : `<p class="muted" style="margin:14px 0">${L({ ja:'レビューリンクが未設定です。下で設定してください。', en:'No review link set yet. Please set it below.', vi:'Chưa có liên kết. Vui lòng đặt bên dưới.' })}</p>`}
      </div>
      <div class="card">
        <h3>${L({ ja:'レビューリンクの設定（店長・本部）', en:'Set review link (manager/HQ)', vi:'Đặt liên kết (quản lý/HQ)' })}</h3>
        <label class="fld"><span>${L({ ja:'Googleレビュー 直リンクURL', en:'Google review direct URL', vi:'URL đánh giá Google' })}</span><input type="text" id="review_url" value="${esc(url)}" placeholder="https://g.page/r/..."></label>
        <button class="btn-primary" id="reviewSave">${L({ ja:'保存する', en:'Save', vi:'Lưu' })}</button>
        <div class="hint">${L({ ja:'取得方法：Googleビジネスプロフィール マネージャ → 対象店舗 →「クチコミを増やす（レビューを依頼）」→ 専用リンクをコピー', en:'How to get: Google Business Profile → your store → "Get more reviews" → copy the link', vi:'Lấy link: Google Business Profile → cửa hàng → "Nhận thêm đánh giá" → sao chép' })}</div>
      </div>`;
  };

  /* ④ 店内動画の共有（オープン前/中の店内一周を週1共有）*/
  const getVideos = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_storevideo')) || []; } catch { return []; } };
  const saveVideos = (a) => localStorage.setItem('yosakura_demo_storevideo', JSON.stringify(a));
  APP_VIEWS.storevideo = () => {
    const vis = visibleStores();
    const recent = getVideos().filter(r=>vis.includes(r.store)).sort((a,b)=>b.t-a.t).slice(0,8);
    return `
      ${NOTE({ ja:'◆ 店内一周（外観〜ホール〜キッチン〜トイレ）の動画リンクを共有（目安：週1回）', en:'◆ Share store walkthrough video links (about weekly)', vi:'◆ Chia sẻ link video đi một vòng quán (hàng tuần)' })}
      <div class="card" id="svForm">
        <h3>${L({ ja:'動画を共有', en:'Share a video', vi:'Chia sẻ video' })}</h3>
        <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select id="sv_store">${vis.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'動画リンク（Drive / YouTube 等）', en:'Video link', vi:'Link video' })}</span><input type="text" id="sv_url" placeholder="https://"></label>
        <label class="fld"><span>${L({ ja:'メモ（任意）', en:'Note (optional)', vi:'Ghi chú' })}</span><input type="text" id="sv_note" placeholder="${L({ ja:'例：オープン前の店内', en:'e.g. before opening', vi:'vd: trước khi mở' })}"></label>
        <button class="btn-primary" id="submitSv">${L({ ja:'共有する', en:'Share', vi:'Chia sẻ' })}</button>
      </div>
      <div class="card">
        <h3>${L({ ja:'共有された動画', en:'Shared videos', vi:'Video đã chia sẻ' })}</h3>
        <div>${recent.length ? recent.map(svRow).join('') : `<div class="muted">${L({ ja:'まだありません', en:'None yet', vi:'Chưa có' })}</div>`}</div>
      </div>`;
  };
  const svRow = (r) => `
    <div class="rep">
      <span class="kind b">${L({ ja:'動画', en:'Video', vi:'Video' })}</span>
      <div class="body">
        <div class="l1"><a href="${esc(r.url)}" target="_blank" rel="noopener" style="color:var(--sumi)">${esc(r.note || r.url)}</a></div>
        <div class="l2">${esc(r.store)} ・ ${timeAgo(r.t)}</div>
      </div>
    </div>`;

  /* ⑤ 店舗巡回フィードバック（SV/体験訪問様式・来店FB実例集を標準化）*/
  const getSvfb = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_svfb')) || []; } catch { return []; } };
  const saveSvfb = (a) => localStorage.setItem('yosakura_demo_svfb', JSON.stringify(a));
  const SVFB_ASPECTS = [
    { v:'service',  t:{ ja:'接客', en:'Service', vi:'Phục vụ' } },
    { v:'serving',  t:{ ja:'提供オペ', en:'Serving', vi:'Phục vụ món' } },
    { v:'quality',  t:{ ja:'品質・商品', en:'Quality', vi:'Chất lượng' } },
    { v:'interior', t:{ ja:'内装・環境', en:'Interior', vi:'Nội thất' } },
    { v:'lang',     t:{ ja:'多言語対応', en:'Language', vi:'Đa ngôn ngữ' } },
    { v:'other',    t:{ ja:'その他', en:'Other', vi:'Khác' } }
  ];
  const svfbAspect = (v) => { const f = SVFB_ASPECTS.find(x=>x.v===v); return f ? L(f.t) : v; };
  APP_VIEWS.svfb = () => {
    const recent = getSvfb().slice().sort((a,b)=>b.t-a.t).slice(0,8);
    return `
      ${NOTE({ ja:'◆ 店舗を訪問し、観点別に「良かった点／改善点」を記録（全店で品質を揃える）', en:'◆ Record good points / improvements by aspect when visiting a store', vi:'◆ Ghi điểm tốt / cần cải thiện theo tiêu chí' })}
      <div class="card" id="svfbForm">
        <h3>${L({ ja:'巡回フィードバックを記録', en:'Log store feedback', vi:'Ghi phản hồi' })}</h3>
        <label class="fld"><span>${L({ ja:'対象店舗', en:'Store', vi:'Cửa hàng' })}</span><select id="fb_store">${STORES.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'観点', en:'Aspect', vi:'Tiêu chí' })}</span><select id="fb_aspect">${SVFB_ASPECTS.map(a=>`<option value="${a.v}">${esc(L(a.t))}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'良かった点', en:'Good points', vi:'Điểm tốt' })}</span><textarea id="fb_good" placeholder="${L({ ja:'例：箸を落とした際すぐ気付いて交換＝気にかけが伝わる', en:'e.g. noticed a dropped chopstick immediately', vi:'vd: chú ý ngay khi khách rơi đũa' })}"></textarea></label>
        <label class="fld"><span>${L({ ja:'改善点', en:'To improve', vi:'Cần cải thiện' })}</span><textarea id="fb_improve" placeholder="${L({ ja:'例：提供時に食べ方を一言添える／出汁は石の中央に置く', en:'e.g. add a word on how to eat when serving', vi:'vd: nói cách dùng khi phục vụ' })}"></textarea></label>
        <button class="btn-primary" id="submitSvfb">${L({ ja:'記録する', en:'Save', vi:'Lưu' })}</button>
      </div>
      <div class="card">
        <h3>${L({ ja:'最近のフィードバック', en:'Recent feedback', vi:'Phản hồi gần đây' })}</h3>
        <div>${recent.length ? recent.map(svfbRow).join('') : `<div class="muted">${L({ ja:'まだありません', en:'None yet', vi:'Chưa có' })}</div>`}</div>
      </div>`;
  };
  const svfbRow = (r) => `
    <div class="rep" style="display:block">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span class="stag st-new">${esc(svfbAspect(r.aspect))}</span><span class="l2">${esc(r.store)} ・ ${timeAgo(r.t)}</span></div>
      ${r.good ? `<div class="l2" style="color:var(--sumi)">◎ ${esc(r.good)}</div>` : ''}
      ${r.improve ? `<div class="l2">△ ${esc(r.improve)}</div>` : ''}
    </div>`;
  function seedSvfb() {
    if (localStorage.getItem('yosakura_demo_svfb')) return;
    const now = Date.now();
    saveSvfb([
      { store:'寿司世桜 心斎橋店', aspect:'serving', good:'', improve:'出汁は寿司の石の中央に置くと綺麗。提供時に食べ方（ベストタイミング）を一言添える。', t: now-3600e3*24 },
      { store:'寿司世桜 心斎橋店', aspect:'service', good:'箸を落とした際すぐ気付いて新しい物を持ってきた＝「気にかけてくれている」が伝わる。', improve:'', t: now-3600e3*30 }
    ]);
  }

  const mockGeneric = (a) => `${NOTE(demoImg)}<div class="card"><p class="muted">${esc(L(a.name))}</p></div>`;
  const bar = (label, pct, hl=false) => `
    <div class="bar-row"><div class="bl"><span>${esc(label)}</span><b>${pct}%</b></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;${hl?'background:#000':''}"></div></div></div>`;

  /* ---------- 役割＋店舗（表示）切替シート ---------- */
  function openIdentitySheet() {
    const buildHTML = () => {
      const role = getRole(), sel = getStoreSel();
      const storeOpts = role === 'hq' ? ['all', ...STORES] : role === 'owner' ? ['owned', ...OWNER_STORES] : STORES;
      const storeLabel = (s) => s === 'all' ? L({ ja:'全店（本部）', en:'All stores (HQ)', vi:'Tất cả (HQ)' })
        : s === 'owned' ? L({ ja:'所有店舗すべて（比較）', en:'All my stores (compare)', vi:'Tất cả CH của tôi (so sánh)' }) : s;
      return `<div class="sheet">
        <div class="grip"></div>
        <h3>${L({ ja:'表示を切り替える', en:'Switch view', vi:'Đổi hiển thị' })}<span class="demo-tag">${L({ja:'確認用',en:'For review',vi:'Để xem'})}</span></h3>
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
        const r = b.dataset.role; setRole(r);
        const sel = getStoreSel();
        if (r === 'owner') { if (sel !== 'owned' && !OWNER_STORES.includes(sel)) setStoreSel('owned'); }
        else if (r !== 'hq' && (sel === 'all' || sel === 'owned')) setStoreSel(STORES[0]);
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
  /* ============================================================
     提出管理レイヤー（第1段階／本番運用前提）
     - 提出物マスタ・店舗×業態対象・定休日・現地時間・3軸ステータス
     - 「今日出すもの」（店舗）／提出状況一覧・未提出抽出（本部）
     - 提出判定は既存の実データ（同期済みの提出実績）から算出する
     - 外部送信・自動削除は初期OFF。未接続機能は「未接続／手動運用中」を明示
     ============================================================ */
  const SUBKEYS = {
    master:  'yosakura_sub_master_v1',
    status:  'yosakura_sub_status_v1',
    holiday: 'yosakura_sub_holiday_v1',
    roster:  'yosakura_sub_roster_v1',
    audit:   'yosakura_sub_audit_v1'
  };
  const jget = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // 店舗メタ（業態・タイムゾーン・コース店か）を店舗名から導出
  function storeMeta(name) {
    const overseas = /ハノイ|ホーチミン/.test(name);
    const course = /おまかせ/.test(name); // コース主体店（1食目写真は対象外）
    let gyotai = 'other';
    if (/日本料理世桜/.test(name)) gyotai = 'nihon';
    else if (/寿司世桜|手巻き寿司世桜/.test(name)) gyotai = 'sushi';
    else if (/牛カツ世桜/.test(name)) gyotai = 'gyukatsu';
    else if (/日本鰻世桜/.test(name)) gyotai = 'unagi';
    else if (/和牛世桜/.test(name)) gyotai = 'wagyu';
    return { course, gyotai, tz: overseas ? 'Asia/Ho_Chi_Minh' : 'Asia/Tokyo' };
  }
  // 店舗の現地時間での日付キー（YYYY-MM-DD）
  function dateKeyFor(name, ts) {
    const tz = storeMeta(name).tz;
    try { return new Date(ts || Date.now()).toLocaleDateString('en-CA', { timeZone: tz }); }
    catch { return new Date(ts || Date.now()).toISOString().slice(0, 10); }
  }
  function nowHMFor(name) {
    const tz = storeMeta(name).tz;
    try { return new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }); }
    catch { return new Date().toTimeString().slice(0, 5); }
  }

  // 提出物マスタ（本部が設定）。obligation: required(必須)/store(店舗運用)/off(対象外)
  function defaultMasters() {
    return [
      // ★一食目写真：AI判定の運用が未確定（木村さんと協議中）のため、当面は提出物の対象から外す（準備中）。
      //   運用が決まったら oblig を 'required' に戻すだけで有効化できる。
      { id:'firstphoto', name:{ja:'一食目写真',en:'First-plate photo',vi:'Ảnh món đầu tiên'}, oblig:'off', freq:'daily', due:'23:59', target:'except_course', hqReview:'exception', detect:'fp', linkApp:'firstphoto' },
      { id:'nippou',     name:{ja:'日報（総括表）',en:'Daily report',vi:'Báo cáo ngày'},       oblig:'required', freq:'daily', due:'23:59', target:'all',          hqReview:'each',      detect:'sk', linkApp:'soukatsu' },
      { id:'openphoto',  name:{ja:'オープン写真',en:'Opening photo',vi:'Ảnh mở cửa'},          oblig:'store',    freq:'daily', due:'11:00', target:'all',          hqReview:'none',      detect:'subrec', linkApp:'openphoto' },
      { id:'cleaning',   name:{ja:'開店清掃チェック',en:'Opening cleaning',vi:'Vệ sinh mở cửa'}, oblig:'store',    freq:'daily', due:'11:00', target:'all',          hqReview:'none',      detect:'none', linkApp:'checklist' },
      { id:'facade',     name:{ja:'内外装動画＋ポップ',en:'Interior video & POP',vi:'Video & POP'}, oblig:'required', freq:'monthly', due:'23:59', target:'all',       hqReview:'each',      detect:'video', linkApp:'storevideo' }
    ];
  }
  /* 提出管理データの全端末共有：既存バックエンド(reports)に専用kindで保存し本部全員で共有（追加kindのみ・既存挙動は不変） */
  const SUB_KINDS = { master:'submaster', status:'substat', holiday:'subholiday', open:'subrec' };
  const parseNote = (n) => { try { return typeof n === 'string' ? (n ? JSON.parse(n) : {}) : (n || {}); } catch { return {}; } };
  const subRows = (kind) => { try { return getReports().filter(r => r.kind === kind); } catch { return []; } };
  function postSub(kind, store, item, note, photos) {
    const rep = { kind, store: store || '*', item: item || '', note: (note && typeof note === 'object') ? JSON.stringify(note) : (note || ''), photos: photos || [], t: Date.now() };
    try { const reps = getReports(); reps.push(rep); saveReports(reps); } catch (e) {}
    if (useBackend()) postReport(rep);
    return rep;
  }
  // 提出物マスタ（本部設定・全端末共有）：最新のsubmaster行→無ければローカル→既定
  function getMasters() {
    const rows = subRows(SUB_KINDS.master).sort((a, b) => (b.t || 0) - (a.t || 0));
    if (rows.length) { const m = parseNote(rows[0].note); if (Array.isArray(m) && m.length) return m; }
    let m = jget(SUBKEYS.master, null); if (!m) { m = defaultMasters(); jset(SUBKEYS.master, m); } return m;
  }
  function saveMasters(m) { jset(SUBKEYS.master, m); postSub(SUB_KINDS.master, '*', 'master', m); pushAudit('master', 'update'); }

  // 定休日（全端末共有）：店舗ごと最新のsubholiday行＋ローカル
  function getHolidays() {
    const map = Object.assign({}, jget(SUBKEYS.holiday, {}));
    subRows(SUB_KINDS.holiday).sort((a, b) => (a.t || 0) - (b.t || 0)).forEach(r => { const p = parseNote(r.note); if (r.store && Array.isArray(p.dates)) map[r.store] = p.dates; });
    return map;
  }
  function setHoliday(store, dates) { const m = jget(SUBKEYS.holiday, {}); m[store] = dates; jset(SUBKEYS.holiday, m); postSub(SUB_KINDS.holiday, store, 'holiday', { dates }); pushAudit('holiday', store); }
  const isHoliday = (store, dk) => (getHolidays()[store] || []).includes(dk);
  const getAudit = () => jget(SUBKEYS.audit, []);
  function pushAudit(action, detail) {
    const a = getAudit();
    a.push({ ts: Date.now(), role: getRole(), store: getStoreSel(), action, detail: detail || '' });
    jset(SUBKEYS.audit, a.slice(-500));
  }

  // 3軸ステータス（提出は実データから算出／判定・本部確認・改善確認はここに保存）
  const statusKey = (store, mid, dk) => `${store}|${mid}|${dk}`;
  function getStatusMap() {
    const map = Object.assign({}, jget(SUBKEYS.status, {}));
    subRows(SUB_KINDS.status).sort((a, b) => (a.t || 0) - (b.t || 0)).forEach(r => {
      const p = parseNote(r.note); const key = `${r.store || ''}|${r.item || ''}`;
      map[key] = Object.assign({}, map[key], { judge: p.judge || '', hqConfirm: p.hqConfirm || '', improve: p.improve || '', ts: r.t, by: p.by });
    });
    return map;
  }
  function getStatus(store, mid, dk) { return getStatusMap()[statusKey(store, mid, dk)] || { judge:'', hqConfirm:'', improve:'' }; }
  function setStatus(store, mid, dk, patch) {
    const cur = getStatus(store, mid, dk);
    const next = Object.assign({ judge:'', hqConfirm:'', improve:'' }, cur, patch);
    const map = jget(SUBKEYS.status, {}); map[statusKey(store, mid, dk)] = Object.assign({}, next, { ts: Date.now(), by: getRole() }); jset(SUBKEYS.status, map);
    postSub(SUB_KINDS.status, store, `${mid}|${dk}`, { judge: next.judge, hqConfirm: next.hqConfirm, improve: next.improve, by: getRole() });
    pushAudit('status', `${store}/${mid}/${dk}:${JSON.stringify(patch)}`);
    return next;
  }

  // この提出物がこの店舗に適用されるか（対象設定＋コース除外＋対象外オフ）
  function appliesToStore(m, store) {
    if (m.oblig === 'off') return false;
    if (m.target === 'except_course' && storeMeta(store).course) return false;
    if (m.target === 'stores' && Array.isArray(m.stores) && !m.stores.includes(store)) return false;
    return true;
  }
  // 実データから「提出済みか」を判定（同期済みの実績を突き合わせ）
  function detectSubmitted(store, m, dk) {
    const sameDay = (t) => dateKeyFor(store, t) === dk;
    const sameMonth = (t) => dateKeyFor(store, t).slice(0, 7) === dk.slice(0, 7);
    const inScope = m.freq === 'monthly' ? sameMonth : sameDay;
    try {
      if (m.detect === 'fp')     return getFP().some(r => r.store === store && inScope(r.t));
      if (m.detect === 'sk')     return getSk().some(r => r.store === store && inScope(r.t));
      if (m.detect === 'checks') { const c = jget(LS.checks, []); return Array.isArray(c) && c.some(r => r.store === store && inScope(r.t)); }
      if (m.detect === 'video')  return getReports().some(r => r.kind === 'video' && r.store === store && inScope(r.t));
      if (m.detect === 'subrec') return subRows(SUB_KINDS.open).some(r => r.store === store && String(r.item || '').split('|')[0] === m.id && inScope(r.t));
    } catch (e) {}
    return false;
  }

  // ある店舗の当日の提出物リスト（今日出すもの）
  function todayItemsFor(store) {
    const dk = dateKeyFor(store, Date.now());
    const holiday = isHoliday(store, dk);
    return getMasters().filter(m => appliesToStore(m, store)).map(m => {
      const manual = m.detect === 'none'; // 自動判定できない（手動運用）
      const submitted = manual ? null : (holiday ? true : detectSubmitted(store, m, dk));
      const st = getStatus(store, m.id, dk);
      const overdue = !manual && !submitted && !holiday && nowHMFor(store) > (m.due || '23:59') && m.freq === 'daily';
      return { m, dk, submitted, manual, holiday, overdue, status: st };
    });
  }

  const OBLIG_LABEL = { required:{ja:'必須',en:'Required',vi:'Bắt buộc'}, store:{ja:'店舗運用',en:'Store-run',vi:'Cửa hàng'}, off:{ja:'対象外',en:'Off',vi:'Không'} };
  const JUDGE_LABEL = { '':{ja:'—',en:'—',vi:'—'}, in:{ja:'基準内',en:'In-std',vi:'Đạt'}, check:{ja:'要確認',en:'Check',vi:'Cần KT'}, out:{ja:'基準外',en:'Out-std',vi:'Không đạt'} };

  /* ---------- 店舗向け：今日出すもの ---------- */
  APP_VIEWS.kyou = () => {
    const store = visibleStores()[0];
    const items = todayItemsFor(store);
    const dk = dateKeyFor(store, Date.now());
    const holiday = isHoliday(store, dk);
    const remain = items.filter(it => !it.manual && !it.submitted).length;
    const rows = items.map(it => {
      const badgeTxt = it.manual ? L({ja:'手動',en:'Manual',vi:'Thủ công'}) : (it.submitted ? L({ja:'提出済',en:'Done',vi:'Đã nộp'}) : L({ja:'未提出',en:'To do',vi:'Chưa'}));
      const badgeCls = it.manual ? '' : (it.submitted ? 'b' : 'a');
      const due = it.m.freq === 'monthly' ? L({ja:'今月',en:'This month',vi:'Tháng này'}) : `${L({ja:'締切',en:'Due',vi:'Hạn'})} ${it.m.due}`;
      const openBtn = ((it.manual || !it.submitted) && it.m.linkApp) ? `<button class="mini" data-tsub="${it.m.linkApp}">${L({ja:'開いて提出',en:'Open',vi:'Mở'})}${svg('chev')}</button>` : '';
      const oflag = it.overdue ? ` <span style="color:#b23">${L({ja:'締切超過',en:'Overdue',vi:'Quá hạn'})}</span>` : '';
      const noentry = it.manual ? ` <span class="hint" style="display:inline">※${L({ja:'自動判定なし（店舗運用・手動）',en:'no auto-check (store-run/manual)',vi:'không tự KT (thủ công)'})}</span>` : '';
      return `<div class="rep"><span class="kind ${badgeCls}">${badgeTxt}</span>
        <div class="body"><div class="l1">${esc(L(it.m.name))} <small style="color:#8a8">(${L(OBLIG_LABEL[it.m.oblig])})</small></div>
        <div class="l2">${due}${oflag}${noentry}</div></div>${openBtn}</div>`;
    }).join('');
    return `
      <div class="card">
        <h3>${L({ja:'今日出すもの',en:'Today to submit',vi:'Cần nộp hôm nay'})} — ${esc(storeShort(store))} <small style="color:#8a8">${dk}</small></h3>
        ${holiday ? `<p class="hint" style="display:block">${L({ja:'本日は定休日として登録されています（未提出にはなりません）。',en:'Registered as a holiday today (not counted as missing).',vi:'Hôm nay là ngày nghỉ (không tính chưa nộp).'})}</p>` : `<p class="hint" style="display:block">${L({ja:'残り',en:'Remaining',vi:'Còn lại'})} ${remain} ${L({ja:'件（現地時間で判定）',en:'item(s) (store local time)',vi:'mục (giờ địa phương)'})}</p>`}
        ${rows}
      </div>
      <p class="hint" style="display:block">${L({ja:'※ 提出の有無は、実際の提出データ（全端末同期）から自動で判定しています。',en:'Status is auto-detected from real submitted data (synced).',vi:'Trạng thái tự nhận từ dữ liệu đã nộp (đồng bộ).'})}</p>`;
  };

  /* ---------- 本部向け：提出状況一覧・未提出抽出（実データ集約） ---------- */
  APP_VIEWS.teishutsu = () => {
    const role = getRole();
    if (role !== 'hq') return `<div class="card"><p>${L({ja:'本部のみ閲覧できます。',en:'HQ only.',vi:'Chỉ HQ.'})}</p></div>`;
    const missingOnly = localStorage.getItem('yosakura_sub_missingonly') === '1';
    const masters = getMasters().filter(m => m.oblig !== 'off');
    const stores = STORES.slice();
    let totalMissing = 0;
    const cells = stores.map(store => {
      const dk = dateKeyFor(store, Date.now());
      const holiday = isHoliday(store, dk);
      const items = masters.filter(m => appliesToStore(m, store)).map(m => {
        const manual = m.detect === 'none';
        const submitted = manual ? null : (holiday ? true : detectSubmitted(store, m, dk));
        if (!manual && !submitted && !holiday) totalMissing++;
        return { m, submitted, manual, holiday, status: getStatus(store, m.id, dk), dk };
      });
      const missing = items.filter(it => !it.manual && !it.submitted && !it.holiday);
      if (missingOnly && !missing.length) return '';
      const chips = items.map(it => {
        const cls = it.manual ? '' : (it.submitted ? 'b' : 'a');
        const sym = it.manual ? '·' : (it.submitted ? '✓' : '✗');
        const jl = it.status.judge ? ` ${L(JUDGE_LABEL[it.status.judge])}` : '';
        return `<span class="kind ${cls}" style="margin:2px 4px 2px 0;display:inline-block">${esc(L(it.m.name))}${sym}${jl}</span>`;
      }).join('');
      const act = missing.length ? `<div style="margin-top:8px"><button class="mini" data-treminder="${esc(store)}">${L({ja:'未提出の連絡文をコピー',en:'Copy reminder',vi:'Sao chép nhắc'})}</button> <button class="mini" data-tdrill="${esc(store)}">${L({ja:'判定・確認',en:'Review',vi:'Duyệt'})}${svg('chev')}</button></div>` : '';
      return `<div class="rep" style="align-items:flex-start"><span class="kind ${missing.length?'a':'b'}">${missing.length?L({ja:'未',en:'Miss',vi:'Thiếu'}):L({ja:'済',en:'OK',vi:'OK'})}</span>
        <div class="body"><div class="l1">${esc(storeShort(store))} ${holiday?`<small style="color:#8a8">(${L({ja:'定休日',en:'Holiday',vi:'Nghỉ'})})</small>`:''}</div>
        <div class="l2">${chips}</div>${act}</div></div>`;
    }).join('');
    return `
      <div class="card">
        <h3>${L({ja:'本日の提出状況（全店）',en:'Today submissions (all stores)',vi:'Trạng thái nộp (mọi cửa hàng)'})}</h3>
        <div style="display:flex;gap:8px;align-items:center;margin:6px 0 12px">
          <button class="mini ${missingOnly?'on':''}" data-tmissing="1">${missingOnly?'☑':'☐'} ${L({ja:'未提出のみ',en:'Missing only',vi:'Chỉ thiếu'})}</button>
          <span class="hint" style="display:inline">${L({ja:'未提出',en:'Missing',vi:'Thiếu'})} ${totalMissing}</span>
        </div>
        ${cells || `<p class="hint" style="display:block">${L({ja:'未提出はありません。',en:'No missing.',vi:'Không thiếu.'})}</p>`}
      </div>
      <div class="card">
        <h3>${L({ja:'提出物マスタ（本部設定）',en:'Submission master (HQ)',vi:'Cấu hình mục nộp (HQ)'})}</h3>
        ${masters.map(m => `<div class="rep"><span class="kind b">${L(OBLIG_LABEL[m.oblig])}</span><div class="body"><div class="l1">${esc(L(m.name))}</div><div class="l2">${m.freq==='daily'?L({ja:'毎日',en:'Daily',vi:'Hàng ngày'}):L({ja:'月1',en:'Monthly',vi:'Hàng tháng'})} ・ ${L({ja:'締切',en:'Due',vi:'Hạn'})} ${m.due} ・ ${m.hqReview==='each'?L({ja:'本部確認あり',en:'HQ review',vi:'HQ duyệt'}):m.hqReview==='exception'?L({ja:'例外のみ本部',en:'Exceptions to HQ',vi:'Ngoại lệ HQ'}):L({ja:'本部確認なし',en:'No HQ review',vi:'Không HQ'})}</div></div></div>`).join('')}
        <p class="hint" style="display:block">${L({ja:'※ この設定はこの端末に保存されています。全店で共有するにはバックエンド接続（次段階）が必要です。',en:'Saved on this device. Cross-store sharing needs backend (next step).',vi:'Lưu trên máy này. Cần backend để chia sẻ (bước sau).'})}</p>
      </div>
      <p class="hint" style="display:block">${L({ja:'※ 提出状況は実際の提出データ（同期済み）から自動集約しています。LINE通知・AI判定は未接続（手動運用中）。',en:'Auto-aggregated from real synced data. LINE & AI not connected (manual).',vi:'Tự tổng hợp từ dữ liệu thật (đã đồng bộ). LINE & AI chưa kết nối (thủ công).'})}</p>`;
  };

  /* ---------- 本部向け：店舗の判定・本部確認（手動判定＝AI未接続時） ---------- */
  function openTeishutsuDrill(store) {
    document.querySelectorAll('.sheet-mask').forEach(m => m.remove()); // 再判定時は前回シートを閉じる
    const dk = dateKeyFor(store, Date.now());
    const masters = getMasters().filter(m => appliesToStore(m, store) && m.oblig !== 'off');
    const rows = masters.map(m => {
      const submitted = detectSubmitted(store, m, dk);
      const st = getStatus(store, m.id, dk);
      const jbtns = ['in','check','out'].map(v => `<button class="mini ${st.judge===v?'on':''}" data-tjudge="${esc(store)}|${m.id}|${v}">${L(JUDGE_LABEL[v])}</button>`).join(' ');
      return `<div class="rep" style="align-items:flex-start"><span class="kind ${submitted?'b':'a'}">${submitted?'✓':'✗'}</span><div class="body">
        <div class="l1">${esc(L(m.name))}</div>
        <div class="l2">${L({ja:'手動判定（AI未接続）',en:'Manual judge (AI off)',vi:'Chấm tay (AI off)'})}: ${jbtns}</div>
        <div class="l2" style="margin-top:6px"><button class="mini ${st.hqConfirm==='done'?'on':''}" data-thq="${esc(store)}|${m.id}|done">${L({ja:'本部確認済',en:'HQ confirmed',vi:'HQ đã duyệt'})}</button>
          <button class="mini ${st.hqConfirm==='need'?'on':''}" data-thq="${esc(store)}|${m.id}|need">${L({ja:'要連絡',en:'Contact',vi:'Cần LH'})}</button>
          <button class="mini ${st.improve==='ok'?'on':''}" data-timp="${esc(store)}|${m.id}|ok">${L({ja:'翌日改善済',en:'Improved',vi:'Đã cải thiện'})}</button></div>
      </div></div>`;
    }).join('');
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>${esc(storeShort(store))} ${L({ja:'判定・本部確認',en:'Judge & HQ review',vi:'Chấm & duyệt'})} <small style="color:#8a8">${dk}</small></h3>
      ${rows}
      <p class="hint" style="display:block">${L({ja:'※ AI判定は未接続のため手動判定です。接続後は同じ欄へAI結果が入ります。',en:'AI not connected: manual. AI results will fill the same field later.',vi:'AI chưa kết nối: chấm tay. Sau này AI sẽ điền cùng ô.'})}</p>
      <button class="btn-primary" data-close="1" style="margin-top:12px">${L({ja:'閉じる',en:'Close',vi:'Đóng'})}</button>
    </div></div>`);
    mask.addEventListener('click', (e) => { if (e.target === mask || e.target.closest('[data-close]')) mask.remove(); });
    document.body.appendChild(mask);
  }

  /* ---------- 店舗向け：オープン写真の提出（実データ・全端末共有） ---------- */
  APP_VIEWS.openphoto = () => {
    const store = visibleStores()[0];
    const dk = dateKeyFor(store, Date.now());
    const m = getMasters().find(x => x.id === 'openphoto') || { id:'openphoto', detect:'subrec', freq:'daily' };
    const done = detectSubmitted(store, m, dk);
    const recent = subRows(SUB_KINDS.open).filter(r => visibleStores().includes(r.store)).sort((a, b) => b.t - a.t).slice(0, 6);
    return `
      <div class="card">
        <h3>${L({ja:'オープン写真の提出',en:'Submit opening photo',vi:'Nộp ảnh mở cửa'})} — ${esc(storeShort(store))}</h3>
        ${done ? `<p class="hint" style="display:block;color:#2a7">${L({ja:'本日は提出済みです（追加提出も可）。',en:'Submitted today (you can add more).',vi:'Đã nộp hôm nay (có thể thêm).'})}</p>` : `<p class="hint" style="display:block">${L({ja:'開店時の店内・外観を1枚。',en:'One photo of the store at opening.',vi:'Một ảnh cửa hàng khi mở cửa.'})}</p>`}
        <label class="fld"><span>${L({ja:'店舗',en:'Store',vi:'Cửa hàng'})}</span><select id="op_store">${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ja:'写真',en:'Photos',vi:'Ảnh'})}</span>
          <div class="photo-drop" id="photoDrop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ja:'撮影して追加',en:'Take photos',vi:'Chụp ảnh'})}</b><br><small>${L({ja:'開店時の店内・外観',en:'Store interior/exterior at open',vi:'Nội/ngoại thất khi mở cửa'})}</small></div><input type="file" accept="image/*" multiple id="f_photo" hidden></div>
          <div class="photo-thumbs" id="photoThumbs"></div>
        </label>
        <button class="btn-primary" data-topensubmit="1">${L({ja:'提出する',en:'Submit',vi:'Gửi'})}</button>
        <div class="hint">${L({ja:'※ 写真が無いと提出できません（提出漏れ防止）。',en:'A photo is required to submit.',vi:'Cần có ảnh mới gửi được.'})}</div>
      </div>
      <div class="card"><h3>${L({ja:'最近のオープン写真',en:'Recent opening photos',vi:'Ảnh mở cửa gần đây'})}</h3>
        ${recent.length ? recent.map(r=>`<div class="rep">${r.photos&&r.photos.length?`<img class="rep-photo" src="${photoThumb(r.photos[0])}" data-full="${photoFull(r.photos[0])}" alt="">`:`<span class="kind b">${L({ja:'写真',en:'Photo',vi:'Ảnh'})}</span>`}<div class="body"><div class="l1">${esc(storeShort(r.store))}</div><div class="l2">${timeAgo(r.t)}</div></div></div>`).join('') : `<div class="muted">${L({ja:'まだありません',en:'None yet',vi:'Chưa có'})}</div>`}
      </div>`;
  };

  /* ---------- フィードバック（本部メンバーの気づきをアプリ内で集める・全端末共有） ---------- */
  const FB_KIND = 'appfb';
  const FB_CATS = [
    { v:'hard',  t:{ja:'使いにくい',en:'Hard to use',vi:'Khó dùng'} },
    { v:'bug',   t:{ja:'不具合',en:'Bug',vi:'Lỗi'} },
    { v:'want',  t:{ja:'こうしたい',en:'Request',vi:'Đề xuất'} },
    { v:'good',  t:{ja:'良かった',en:'Good',vi:'Tốt'} }
  ];
  const fbCatLabel = (v) => { const f = FB_CATS.find(x => x.v === v); return f ? L(f.t) : v; };
  APP_VIEWS.appfb = () => {
    const rows = subRows(FB_KIND).sort((a, b) => b.t - a.t).slice(0, 30);
    const mine = getRole();
    return `
      <div class="card">
        <h3>${L({ja:'このアプリへのご意見',en:'Feedback on this app',vi:'Góp ý về ứng dụng'})}</h3>
        <p class="hint" style="display:block">${L({ja:'使ってみて気づいたことを、そのままお送りください。改善に使わせていただきます。',en:'Tell us anything you noticed. We use it to improve.',vi:'Hãy cho biết điều bạn nhận thấy. Chúng tôi sẽ cải thiện.'})}</p>
        <div class="idlabel">${L({ja:'種類',en:'Type',vi:'Loại'})}</div>
        <div class="seg" data-seg="fbcat" style="margin-bottom:12px">${FB_CATS.map((c, i) => `<button type="button" data-v="${c.v}" class="${i===0?'on':''}">${L(c.t)}</button>`).join('')}</div>
        <label class="fld"><span>${L({ja:'どの画面ですか（任意）',en:'Which screen (optional)',vi:'Màn hình nào (tùy chọn)'})}</span>
          <select id="fb_screen"><option value="">${L({ja:'選ばない',en:'None',vi:'Không chọn'})}</option>${APPS.filter(a=>canOpen(a,mine)).map(a=>`<option value="${esc(a.id)}">${esc(L(a.name))}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ja:'内容',en:'Details',vi:'Nội dung'})}</span><textarea id="fb_note" placeholder="${L({ja:'例：今日出すものが分かりやすい／提出ボタンが小さい など',en:'e.g. Today list is clear / submit button is small',vi:'vd: Danh sách rõ / nút gửi nhỏ'})}"></textarea></label>
        <button class="btn-primary" data-fbsend="1">${L({ja:'送信する',en:'Send',vi:'Gửi'})}</button>
      </div>
      <div class="card">
        <h3>${L({ja:'みんなのご意見',en:'All feedback',vi:'Tất cả góp ý'})} <small style="color:#8a8">${rows.length}</small></h3>
        ${rows.length ? rows.map(r => { const p = parseNote(r.note); return `<div class="rep"><span class="kind ${p.cat==='bug'?'a':'b'}">${esc(fbCatLabel(p.cat))}</span><div class="body"><div class="l1">${esc(p.note||'')}</div><div class="l2">${p.screen?esc(p.screen)+' ・ ':''}${esc(p.by||'')} ・ ${timeAgo(r.t)}</div></div></div>`; }).join('') : `<div class="muted">${L({ja:'まだありません',en:'None yet',vi:'Chưa có'})}</div>`}
        <p class="hint" style="display:block">${L({ja:'※ ご意見は全端末で共有されます（本部メンバー全員が見られます）。',en:'Feedback is shared across devices (all HQ members can see).',vi:'Góp ý được chia sẻ giữa các máy.'})}</p>
      </div>`;
  };

  /* ---------- 本部：受信箱（現場からの報告を確認して対応する窓口） ----------
     現場が報告しても本部の受け皿がないと報告が流れてしまうため、
     「未対応の報告」を1画面に集め、確認済み／対応済みにできるようにする。
     対応状況は全端末で共有（本部メンバー全員が同じ状態を見る）。 */
  const HQ_ACK_KIND = 'hqack';
  function ackKey(kind, t, store) { return `${kind}|${t}|${store || ''}`; }
  function getAckMap() {
    const map = {};
    subRows(HQ_ACK_KIND).sort((a, b) => (a.t || 0) - (b.t || 0)).forEach(r => {
      const p = parseNote(r.note); if (r.item) map[r.item] = { state: p.state || '', by: p.by || '', ts: r.t, memo: p.memo || '' };
    });
    return map;
  }
  function setAck(key, state, memo) {
    postSub(HQ_ACK_KIND, getStoreSel() || '*', key, { state, by: L(ROLES[getRole()].label), memo: memo || '' });
    pushAudit('hq_ack', `${key}:${state}`);
  }
  // 本部が確認すべき「現場からの報告」を集める（種類をまたいで1本化）
  function collectHqItems() {
    const vis = visibleStores();
    const acks = getAckMap();
    const items = [];
    const add = (kind, label, t, store, title, detail, photos) => {
      const key = ackKey(kind, t, store);
      const ack = acks[key] || {};
      items.push({ kind, label, t, store, title, detail, photos: photos || [], key, state: ack.state || '', by: ack.by, memo: ack.memo });
    };
    try {
      getKz().filter(r => vis.includes(r.store)).forEach(r => add('kizuki', { ja:'気づき', en:'Insight', vi:'Ghi nhận' }, r.t, r.store, kzCatLabel(r.cat), r.note, r.photos));
      getReports().filter(r => (r.kind === 'a' || r.kind === 'b') && vis.includes(r.store)).forEach(r => add('waste', { ja:'食べ残し', en:'Waste', vi:'Đồ thừa' }, r.t, r.store, r.item, L(r.note) || '', r.photos));
      getFP().filter(r => vis.includes(r.store)).forEach(r => add('firstphoto', { ja:'1食目写真', en:'First-plate', vi:'Ảnh món đầu' }, r.t, r.store, r.item || '', '', r.photos));
      getReports().filter(r => r.kind === 'svfb' && vis.includes(r.store)).forEach(r => add('svfb', { ja:'巡回FB', en:'Visit FB', vi:'Phản hồi' }, r.t, r.store, r.item || '', String(r.note || '').slice(0, 60), r.photos));
      subRows(SUB_KINDS.open).filter(r => vis.includes(r.store)).forEach(r => add('openphoto', { ja:'オープン写真', en:'Opening photo', vi:'Ảnh mở cửa' }, r.t, r.store, '', '', r.photos));
    } catch (e) {}
    return items.sort((a, b) => b.t - a.t);
  }

  APP_VIEWS.inbox = () => {
    if (getRole() !== 'hq') return `<div class="card"><p>${L({ja:'本部のみ閲覧できます。',en:'HQ only.',vi:'Chỉ HQ.'})}</p></div>`;
    const showDone = localStorage.getItem('yosakura_inbox_showdone') === '1';
    const all = collectHqItems();
    const open = all.filter(i => i.state !== 'done');
    const list = (showDone ? all : open).slice(0, 40);
    const row = (i) => {
      const ph = i.photos && i.photos.length ? `<img class="rep-photo" src="${photoThumb(i.photos[0])}" data-full="${photoFull(i.photos[0])}" alt="">` : `<span class="kind ${i.state==='done'?'b':'a'}">${esc(L(i.label))}</span>`;
      const st = i.state === 'done'
        ? `<div class="l2" style="color:#2a7">${L({ja:'対応済み',en:'Done',vi:'Đã xử lý'})}${i.by?` ・${esc(i.by)}`:''}${i.memo?` ・${esc(i.memo)}`:''}</div>`
        : `<div class="l2"><button class="mini" data-ackdone="${esc(i.key)}">${L({ja:'対応済みにする',en:'Mark done',vi:'Đã xử lý'})}</button> <button class="mini" data-ackmemo="${esc(i.key)}">${L({ja:'メモを付けて完了',en:'Done with note',vi:'Xong kèm ghi chú'})}</button></div>`;
      return `<div class="rep" style="align-items:flex-start">${ph}<div class="body">
        <div class="l1">${esc(L(i.label))}${i.title?` ・${esc(i.title)}`:''}</div>
        <div class="l2">${esc(storeShort(i.store))} ・ ${timeAgo(i.t)}</div>
        ${i.detail?`<div class="l2" style="color:var(--sumi)">${esc(String(i.detail).slice(0,90))}</div>`:''}
        ${st}</div></div>`;
    };
    const byKind = {};
    open.forEach(i => { const k = L(i.label); byKind[k] = (byKind[k] || 0) + 1; });
    return `
      <div class="card">
        <h3>${L({ja:'未対応の報告',en:'Needs response',vi:'Chưa xử lý'})} <small style="color:#8a8">${open.length}</small></h3>
        <p class="hint" style="display:block">${L({ja:'現場からの報告のうち、本部がまだ対応していないものです。対応したら「対応済みにする」を押してください（全端末で共有されます）。',en:'Reports not yet handled by HQ. Mark done after you respond (shared across devices).',vi:'Báo cáo HQ chưa xử lý. Bấm đã xử lý sau khi phản hồi (chia sẻ mọi máy).'})}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          ${Object.keys(byKind).map(k => `<span class="kind a">${esc(k)} ${byKind[k]}</span>`).join('') || `<span class="kind b">${L({ja:'未対応なし',en:'All clear',vi:'Không còn'})}</span>`}
        </div>
        <button class="mini ${showDone?'on':''}" data-inboxdone="1">${showDone?'☑':'☐'} ${L({ja:'対応済みも表示',en:'Show done',vi:'Hiện đã xử lý'})}</button>
      </div>
      <div class="card">
        <h3>${showDone?L({ja:'すべての報告',en:'All reports',vi:'Tất cả'}):L({ja:'対応が必要な報告',en:'To respond',vi:'Cần xử lý'})}</h3>
        ${list.length ? list.map(row).join('') : `<div class="muted">${L({ja:'ありません',en:'None',vi:'Không có'})}</div>`}
      </div>
      <p class="hint" style="display:block">${L({ja:'※ 提出物（1食目写真・日報など）の提出状況は「加盟店・提出物管理」でご確認ください。',en:'For submission status, see “Submissions”.',vi:'Xem trạng thái nộp tại “Nộp tài liệu”.'})}</p>`;
  };

  /* ---------- 本部：バックエンド設定（専用の保存先へ切り替える） ---------- */
  APP_VIEWS.backend = () => {
    if (getRole() !== 'hq') return `<div class="card"><p>${L({ja:'本部のみ閲覧できます。',en:'HQ only.',vi:'Chỉ HQ.'})}</p></div>`;
    const cur = getApiUrl(); const custom = isCustomApi(); const admin = isSysAdmin();
    // 接続状態（本部の方は「今どこにつながっているか」だけ確認できます）
    const statusCard = `
      <div class="card">
        <h3>${L({ja:'データの保存先（接続状態）',en:'Data backend (status)',vi:'Nơi lưu dữ liệu (trạng thái)'})}</h3>
        <div class="rep"><span class="kind ${custom?'b':'a'}">${custom?L({ja:'専用',en:'Dedicated',vi:'Riêng'}):L({ja:'共用',en:'Shared',vi:'Chung'})}</span>
          <div class="body"><div class="l1">${custom?L({ja:'世桜専用の保存先に接続しています',en:'Connected to the dedicated backend',vi:'Đang dùng backend riêng'}):L({ja:'共用（検証用）の保存先に接続しています',en:'Using the shared (test) backend',vi:'Đang dùng backend chung (thử nghiệm)'})}</div>
          <div class="l2">${esc(maskUrl(cur))}</div></div></div>
        ${custom ? '' : `<p class="hint" style="display:block;color:#b23">${L({ja:'※ 実データの運用を始める前に、システム担当（神田）が専用の保存先へ切り替えます。',en:'Before real operation, the system admin will switch to the dedicated backend.',vi:'Trước khi vận hành thật, quản trị hệ thống sẽ chuyển sang backend riêng.'})}</p>`}
      </div>`;
    if (!admin) {
      return statusCard + `
      <div class="card">
        <h3>${L({ja:'設定の変更について',en:'Changing this setting',vi:'Về việc thay đổi'})}</h3>
        <p class="hint" style="display:block">${L({ja:'保存先の変更は、初期設定・環境移行・障害対応のときにシステム担当（神田）が行います。日常の運用では変更の必要はありません。',en:'Only the system admin changes this (initial setup, migration, incidents).',vi:'Chỉ quản trị hệ thống thay đổi (cài đặt ban đầu, chuyển đổi, sự cố).'})}</p>
        <button class="mini" data-adminunlock="1">${L({ja:'システム管理者として変更する',en:'Unlock as system admin',vi:'Mở khóa quản trị'})}</button>
      </div>`;
    }
    const log = getApiLog().slice(-5).reverse();
    return statusCard + `
      <div class="card">
        <h3>${L({ja:'接続先の変更（システム管理者）',en:'Change backend (system admin)',vi:'Đổi backend (quản trị)'})}</h3>
        <label class="fld"><span>${L({ja:'専用バックエンドのURL（/exec で終わるもの）',en:'Dedicated backend URL (ends with /exec)',vi:'URL backend riêng (kết thúc /exec)'})}</span>
          <input type="text" id="api_url" placeholder="https://script.google.com/macros/s/.../exec" value="${custom?esc(cur):''}"></label>
        <button class="btn-primary" data-apitest="1">${L({ja:'接続をテストして保存',en:'Test connection & save',vi:'Kiểm tra & lưu'})}</button>
        ${custom ? `<button class="mini" data-apireset="1" style="margin-top:10px">${L({ja:'共用に戻す（通常は使いません）',en:'Back to shared (rarely used)',vi:'Về dùng chung (hiếm khi)'})}</button>` : ''}
        <button class="mini" data-adminlock="1" style="margin-top:10px">${L({ja:'管理者モードを終了',en:'Exit admin mode',vi:'Thoát chế độ quản trị'})}</button>
        <div class="hint">${L({ja:'接続テストに成功したときだけ保存されます。各端末で同じURLの設定が必要です。',en:'Saved only when the connection test succeeds. Set the same URL on each device.',vi:'Chỉ lưu khi kiểm tra kết nối thành công.'})}</div>
      </div>
      <div class="card">
        <h3>${L({ja:'変更の記録',en:'Change log',vi:'Nhật ký thay đổi'})}</h3>
        ${log.length ? log.map(e => `<div class="rep"><span class="kind ${e.result==='ok'?'b':'a'}">${e.result==='ok'?'OK':'NG'}</span><div class="body"><div class="l1">${esc(e.action||'')}</div><div class="l2">${esc(maskUrl(e.from))} → ${esc(maskUrl(e.to))}</div><div class="l2">${esc(e.role||'')} ・ ${timeAgo(e.ts)}</div></div></div>`).join('') : `<div class="muted">${L({ja:'まだありません',en:'None yet',vi:'Chưa có'})}</div>`}
      </div>`;
  };

  /* ---------- 提出履歴（直近7日・実データ） ---------- */
  APP_VIEWS.history = () => {
    const store = visibleStores()[0];
    const masters = getMasters().filter(m => appliesToStore(m, store) && m.oblig !== 'off' && m.detect !== 'none');
    const days = []; for (let i = 0; i < 7; i++) days.push(dateKeyFor(store, Date.now() - i * 86400000));
    const rows = days.map(dk => {
      const chips = masters.map(m => { const sub = detectSubmitted(store, m, dk); const st = getStatus(store, m.id, dk); const jl = st.judge ? ` ${L(JUDGE_LABEL[st.judge])}` : ''; return `<span class="kind ${sub?'b':'a'}" style="margin:2px 4px 2px 0;display:inline-block">${esc(L(m.name))}${sub?'✓':'✗'}${jl}</span>`; }).join('');
      return `<div class="rep"><div class="body"><div class="l1">${dk}${isHoliday(store,dk)?` <small style="color:#8a8">(${L({ja:'定休日',en:'Holiday',vi:'Nghỉ'})})</small>`:''}</div><div class="l2">${chips || '—'}</div></div></div>`;
    }).join('');
    return `<div class="card"><h3>${L({ja:'提出履歴（直近7日）',en:'History (last 7 days)',vi:'Lịch sử (7 ngày)'})} — ${esc(storeShort(store))}</h3>${rows}
      <p class="hint" style="display:block">${L({ja:'※ 実際の提出データ（全端末同期）から表示しています。',en:'From real synced submission data.',vi:'Từ dữ liệu đã nộp (đồng bộ).'})}</p></div>`;
  };

  // 委譲イベント（$appは再描画で中身が入れ替わるが要素自体は残るため一度だけ登録）
  (function bindSubmissionOnce() {
    if (document.__subBound) return; document.__subBound = true;
    document.addEventListener('click', (e) => {
      // フィードバックの種類切替（このビュー内のセグメント）
      const fbSeg = e.target.closest('[data-seg="fbcat"] [data-v]');
      if (fbSeg) { document.querySelectorAll('[data-seg="fbcat"] button').forEach(x => x.classList.remove('on')); fbSeg.classList.add('on'); return; }
      const t = e.target.closest('[data-tsub],[data-tmissing],[data-treminder],[data-tdrill],[data-tjudge],[data-thq],[data-timp],[data-topensubmit],[data-apitest],[data-apireset],[data-fbsend],[data-ackdone],[data-ackmemo],[data-inboxdone]');
      if (!t) return;
      if (t.dataset.inboxdone) { const cur = localStorage.getItem('yosakura_inbox_showdone') === '1'; localStorage.setItem('yosakura_inbox_showdone', cur ? '0' : '1'); render(); return; }
      if (t.dataset.ackdone) { setAck(t.dataset.ackdone, 'done', ''); toast(L({ja:'対応済みにしました',en:'Marked done',vi:'Đã đánh dấu xử lý'})); render(); return; }
      if (t.dataset.ackmemo) {
        const memo = prompt(L({ja:'対応した内容をメモできます（任意）',en:'Add a note (optional)',vi:'Ghi chú (tùy chọn)'}) || '', '');
        if (memo === null) return;
        setAck(t.dataset.ackmemo, 'done', memo.trim());
        toast(L({ja:'対応済みにしました',en:'Marked done',vi:'Đã đánh dấu xử lý'})); render(); return;
      }
      if (t.dataset.fbsend) {
        const noteEl = document.getElementById('fb_note');
        const note = (noteEl && noteEl.value || '').trim();
        if (!note) { toast(L({ja:'内容を入力してください',en:'Please enter details',vi:'Vui lòng nhập nội dung'})); return; }
        const catEl = document.querySelector('[data-seg="fbcat"] .on');
        const cat = catEl ? catEl.dataset.v : 'hard';
        const scEl = document.getElementById('fb_screen');
        const scId = scEl ? scEl.value : '';
        const scApp = scId ? appById(scId) : null;
        const roleLabel = L(ROLES[getRole()].label);
        postSub(FB_KIND, getStoreSel() || '*', cat, { cat, note, screen: scApp ? L(scApp.name) : '', by: roleLabel });
        pushAudit('feedback', cat);
        if (noteEl) noteEl.value = '';
        toast(L({ja:'ありがとうございます。ご意見を送信しました。',en:'Thank you. Your feedback was sent.',vi:'Cảm ơn. Đã gửi góp ý.'}));
        render(); return;
      }
      if (t.dataset.adminunlock) {
        const code = prompt(L({ja:'システム管理者コードを入力してください（システム担当のみ）',en:'Enter the system admin code',vi:'Nhập mã quản trị hệ thống'}) || '');
        if (code === null) return;
        if (code.trim() !== ADMIN_CODE) { toast(L({ja:'コードが違います',en:'Wrong code',vi:'Mã không đúng'})); return; }
        setSysAdmin(true); pushAudit('backend', 'admin unlock');
        toast(L({ja:'管理者モードになりました',en:'Admin mode on',vi:'Đã bật chế độ quản trị'})); render(); return;
      }
      if (t.dataset.adminlock) { setSysAdmin(false); pushAudit('backend', 'admin lock'); toast(L({ja:'管理者モードを終了しました',en:'Admin mode off',vi:'Đã tắt chế độ quản trị'})); render(); return; }
      if (t.dataset.apireset) {
        if (!isSysAdmin()) { toast(L({ja:'システム管理者のみ変更できます',en:'System admin only',vi:'Chỉ quản trị hệ thống'})); return; }
        if (!confirm(L({ja:'共用（検証用）の保存先に戻します。実データの参照先が変わります。よろしいですか？',en:'Switch back to the shared (test) backend? The data source will change.',vi:'Quay lại backend chung (thử nghiệm)?'}))) return;
        const from = getApiUrl();
        setApiUrl(''); pushAudit('backend', 'reset to shared'); pushApiLog({ action:'共用に戻す', from, to: API_URL_DEFAULT, result:'ok' });
        toast(L({ja:'共用の保存先に戻しました',en:'Switched back to shared',vi:'Đã quay lại dùng chung'}));
        syncReports(true); render(); return;
      }
      if (t.dataset.apitest) {
        if (!isSysAdmin()) { toast(L({ja:'システム管理者のみ変更できます',en:'System admin only',vi:'Chỉ quản trị hệ thống'})); return; }
        const input = document.getElementById('api_url');
        const url = (input && input.value || '').trim();
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec$/.test(url)) {
          toast(L({ja:'URLの形式が違います（/exec で終わるGASのURLを貼ってください）',en:'Invalid URL. Paste the GAS URL ending with /exec',vi:'URL không đúng. Dán URL GAS kết thúc /exec'})); return;
        }
        t.disabled = true; const prev = t.textContent;
        t.textContent = L({ja:'接続中…',en:'Testing…',vi:'Đang kiểm tra…'});
        const from = getApiUrl();
        fetch(url).then(r => r.json()).then(j => {
          if (!j || j.ok !== true) throw new Error('bad response');
          setApiUrl(url); pushAudit('backend', 'set dedicated');
          pushApiLog({ action:'専用へ切替', from, to: url, result:'ok' });
          toast(L({ja:'接続できました。専用の保存先に切り替えました。',en:'Connected. Switched to your dedicated backend.',vi:'Đã kết nối. Đã chuyển sang backend riêng.'}));
          syncReports(true); render();
        }).catch(() => {
          t.disabled = false; t.textContent = prev;
          pushApiLog({ action:'接続テスト', from, to: url, result:'ng' });
          toast(L({ja:'接続できませんでした。デプロイの「アクセスできるユーザー＝全員」をご確認ください。',en:'Could not connect. Check deployment access = Anyone.',vi:'Không kết nối được. Kiểm tra quyền truy cập = Mọi người.'}));
        });
        return;
      }
      if (t.dataset.topensubmit) {
        const sel = document.getElementById('op_store');
        const store = (sel && sel.value) || visibleStores()[0];
        const thumbsEl = document.getElementById('photoThumbs');
        const photos = thumbsEl ? Array.from(thumbsEl.querySelectorAll('.pt')).map(w => w.dataset.thumb).filter(Boolean).slice(0, 6) : [];
        if (!photos.length) { toast(L({ja:'写真を撮影・選択してください（提出漏れ防止）',en:'Please add a photo before submitting',vi:'Vui lòng thêm ảnh trước khi gửi'})); return; }
        const dk = dateKeyFor(store, Date.now());
        postSub(SUB_KINDS.open, store, `openphoto|${dk}`, { by: getRole() }, photos);
        pushAudit('open_submit', store);
        toast(L({ja:'オープン写真を提出しました。ありがとうございます！',en:'Opening photo submitted. Thank you!',vi:'Đã gửi ảnh mở cửa. Cảm ơn!'}));
        go('/app/kyou');
        return;
      }
      if (t.dataset.tsub) { go(`/app/${t.dataset.tsub}`); return; }
      if (t.dataset.tmissing) { const cur = localStorage.getItem('yosakura_sub_missingonly') === '1'; localStorage.setItem('yosakura_sub_missingonly', cur ? '0' : '1'); render(); return; }
      if (t.dataset.tdrill) { openTeishutsuDrill(t.dataset.tdrill); return; }
      if (t.dataset.treminder) {
        const store = t.dataset.treminder; const dk = dateKeyFor(store, Date.now());
        const miss = getMasters().filter(m => appliesToStore(m, store) && m.oblig !== 'off' && m.detect !== 'none' && !detectSubmitted(store, m, dk)).map(m => '・' + L(m.name));
        const text = `${storeShort(store)} ${L({ja:'様',en:'',vi:''})}\n${L({ja:'本日分の未提出があります。ご確認をお願いします。',en:'You have missing submissions today. Please check.',vi:'Hôm nay còn mục chưa nộp. Vui lòng kiểm tra.'})}\n${miss.join('\n')}`;
        try { navigator.clipboard.writeText(text); } catch (_) {}
        pushAudit('reminder_copy', store);
        toast(L({ja:'連絡文をコピーしました（LINEは手動送信）',en:'Reminder copied (send via LINE manually)',vi:'Đã sao chép (gửi LINE thủ công)'}));
        return;
      }
      if (t.dataset.tjudge) { const [s, mid, v] = t.dataset.tjudge.split('|'); const dk = dateKeyFor(s, Date.now()); const cur = getStatus(s, mid, dk).judge; setStatus(s, mid, dk, { judge: cur === v ? '' : v }); openTeishutsuDrill(s); return; }
      if (t.dataset.thq)   { const [s, mid, v] = t.dataset.thq.split('|'); const dk = dateKeyFor(s, Date.now()); const cur = getStatus(s, mid, dk).hqConfirm; setStatus(s, mid, dk, { hqConfirm: cur === v ? '' : v }); openTeishutsuDrill(s); return; }
      if (t.dataset.timp)  { const [s, mid, v] = t.dataset.timp.split('|'); const dk = dateKeyFor(s, Date.now()); const cur = getStatus(s, mid, dk).improve; setStatus(s, mid, dk, { improve: cur === v ? '' : v }); openTeishutsuDrill(s); return; }
    });
  })();

  /* ===================================================================
     緊急連絡先（emg）＝共通枠を用意し、店舗ごとに業者名・電話・メモを登録。
     店長・オーナー・本部が編集、スタッフは閲覧＋ワンタップ発信。全端末同期。
  =================================================================== */
  const EMG_SLOTS = [
    { id:'police',    fix:'110', t:{ ja:'警察',           en:'Police',              vi:'Cảnh sát' } },
    { id:'fire',      fix:'119', t:{ ja:'消防',           en:'Fire',                vi:'Cứu hỏa' } },
    { id:'ambulance', fix:'119', t:{ ja:'救急',           en:'Ambulance',           vi:'Cấp cứu' } },
    { id:'hospital',  t:{ ja:'最寄りの病院',       en:'Nearest hospital',    vi:'Bệnh viện gần nhất' } },
    { id:'electric',  t:{ ja:'電気',               en:'Electricity',         vi:'Điện lực' } },
    { id:'gas',       t:{ ja:'ガス',               en:'Gas',                 vi:'Gas' } },
    { id:'water',     t:{ ja:'水道',               en:'Water',               vi:'Cấp nước' } },
    { id:'building',  t:{ ja:'ビル管理会社',       en:'Building management', vi:'Quản lý tòa nhà' } },
    { id:'facility',  t:{ ja:'設備修理業者',       en:'Facility repair',     vi:'Sửa chữa thiết bị' } },
    { id:'kitchen',   t:{ ja:'厨房機器業者',       en:'Kitchen equipment',   vi:'Thiết bị bếp' } },
    { id:'other',     t:{ ja:'その他緊急連絡先',   en:'Other emergency',     vi:'Khẩn cấp khác' } }
  ];
  const emgSlotLabel = (id) => { const s = EMG_SLOTS.find(x => x.id === id); return s ? L(s.t) : id; };
  const getEmg = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_emg')) || {}; } catch { return {}; } };
  const saveEmg = (o) => { try { localStorage.setItem('yosakura_demo_emg', JSON.stringify(o)); } catch (e) {} };
  const emgOf = (store) => (getEmg()[store] || {}).slots || {};
  const canEditEmg = () => ['manager','owner','hq'].includes(getRole());
  function seedNews() {
    if (localStorage.getItem('yosakura_demo_news')) return;
    const now = Date.now();
    saveNews([
      { title:'お盆期間の発注前倒しのお願い', body:'和牛（銘洋）は日・木定休、鰻商社は8/8・9・11・14〜16が休業です。納品遅延を避けるため、発注は前倒しでお願いします。', level:'important', target:'all', t: now - 3600e3 * 5 },
      { title:'清掃の好事例を共有しました', body:'藁焼き装置のステンレス汚れはウタマロで改善できます。定期清掃箇所に追加しました。', level:'normal', target:'all', t: now - 3600e3 * 30 }
    ]);
  }
  function seedEmg() {
    if (localStorage.getItem('yosakura_demo_emg')) return;
    saveEmg({ '和牛世桜 広島店': { slots: {
      hospital: { vendor:'広島市民病院', phone:'082-221-2291', memo:'徒歩8分' },
      building: { vendor:'—', phone:'', memo:'' },
      kitchen:  { vendor:'厨房サービス中国', phone:'', memo:'フライヤー担当' }
    }, t: Date.now() } });
  }
  APP_VIEWS.emergency = () => {
    const vis = visibleStores();
    const editable = canEditEmg();
    // 本部・全店＝各店の登録状況を一覧（編集は店舗を選んでから＝右上の店舗切替）
    if (vis.length > 1) {
      const map = getEmg();
      return `
        ${NOTE({ ja:'◆ 緊急連絡先は店舗ごとに登録します。編集は右上で対象店舗を選ぶと行えます', en:'◆ Contacts are per store. Pick a store (top-right) to edit.', vi:'◆ Danh bạ theo từng cửa hàng. Chọn cửa hàng (góc phải) để sửa.' })}
        <div class="card"><h3>${L({ ja:'店舗別の登録状況', en:'Registration by store', vi:'Tình trạng theo cửa hàng' })}</h3>
          ${vis.map(s => { const n = Object.values((map[s]||{}).slots || {}).filter(v => v && v.phone).length;
            return `<div class="rep"><div class="body"><div class="l1">${esc(s)}</div><div class="l2">${n ? L({ ja:`${n}件 登録済み`, en:`${n} registered`, vi:`Đã đăng ký ${n}` }) : L({ ja:'未登録', en:'Not set', vi:'Chưa đăng ký' })}</div></div><span class="amt">${n}</span></div>`; }).join('')}
        </div>
        <p class="hint">${L({ ja:'※ 共通枠：警察・消防・救急・病院・電気・ガス・水道・ビル管理・設備・厨房機器・その他', en:'Fixed slots: police, fire, ambulance, hospital, utilities, building, facility, kitchen, other', vi:'Khung cố định: cảnh sát, cứu hỏa, cấp cứu, bệnh viện, tiện ích, tòa nhà, thiết bị, bếp, khác' })}</p>`;
    }
    const store = vis[0];
    const slots = emgOf(store);
    const rows = EMG_SLOTS.map(s => {
      const cur = slots[s.id] || {};
      const phone = cur.phone || s.fix || '';
      if (editable) {
        return `<div class="card" style="padding:12px 14px;margin-bottom:8px">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px">${esc(L(s.t))}</div>
          <div class="sk-grid">
            <label class="fld"><span>${L({ ja:'業者・宛先', en:'Vendor', vi:'Đơn vị' })}</span><input type="text" class="emg_vendor" data-slot="${s.id}" value="${esc(cur.vendor||'')}" placeholder="${esc(L({ ja:'例）〇〇設備', en:'e.g. ABC Corp', vi:'vd: Cty ABC' }))}"></label>
            <label class="fld"><span>${L({ ja:'電話番号', en:'Phone', vi:'Điện thoại' })}</span><input type="tel" inputmode="tel" class="emg_phone" data-slot="${s.id}" value="${esc(cur.phone||'')}" placeholder="${esc(s.fix || L({ ja:'番号', en:'Number', vi:'Số' }))}"></label>
          </div>
          <label class="fld"><span>${L({ ja:'メモ（任意）', en:'Memo (optional)', vi:'Ghi chú' })}</span><input type="text" class="emg_memo" data-slot="${s.id}" value="${esc(cur.memo||'')}"></label>
        </div>`;
      }
      return `<div class="rep">
        <div class="body"><div class="l1">${esc(L(s.t))}${cur.vendor?`　<span class="muted">${esc(cur.vendor)}</span>`:''}</div>
        <div class="l2">${phone ? `<a href="tel:${esc(phone.replace(/[^0-9+]/g,''))}">${esc(phone)}</a>` : L({ ja:'未登録', en:'Not set', vi:'Chưa đăng ký' })}${cur.memo?`　・${esc(cur.memo)}`:''}</div></div>
        ${phone ? `<a class="amt" style="text-decoration:none" href="tel:${esc(phone.replace(/[^0-9+]/g,''))}">${svg('phone')}</a>` : ''}
      </div>`;
    }).join('');
    return `
      ${NOTE({ ja:'◆ 水漏れ・停電・ガス・設備不具合・急病などのとき、すぐ連絡先を確認できます', en:'◆ Quickly find who to call for leaks, outages, gas, equipment or sudden illness', vi:'◆ Tra nhanh số cần gọi khi rò nước, mất điện, gas, thiết bị hỏng hay cấp cứu' })}
      <div class="card"><h3>${L({ ja:'緊急連絡先', en:'Emergency contacts', vi:'Liên hệ khẩn cấp' })}</h3>
        <div class="muted" style="margin-bottom:10px">${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}：${esc(store)}</div>
        ${editable ? '' : `<p class="hint" style="margin-top:0">${L({ ja:'※ 番号をタップすると発信します。登録・編集は店長・オーナー・本部が行います', en:'Tap a number to call. Managers/owners/HQ can edit.', vi:'Chạm số để gọi. Quản lý/chủ/HQ có thể sửa.' })}</p>`}
      </div>
      ${editable ? rows + `<button class="btn-primary" id="emgSave">${L({ ja:'保存する', en:'Save', vi:'Lưu' })}</button><div class="hint">${L({ ja:'保存すると全端末で共有されます', en:'Saved and shared across devices', vi:'Được lưu và chia sẻ mọi thiết bị' })}</div>` : `<div class="card" style="padding:6px 14px">${rows}</div>`}`;
  };

  /* ===================================================================
     公益通報・コンプライアンス窓口（whistle）＝スタッフ画面から削除不可の固定項目。
     店長・オーナーに相談しにくい問題を本部へ直接。通報先・担当は本部が別途決定。
  =================================================================== */
  const WHISTLE_CATS = [
    { v:'power',   t:{ ja:'パワーハラスメント',   en:'Power harassment',    vi:'Quấy rối quyền lực' } },
    { v:'sexual',  t:{ ja:'セクシュアルハラスメント', en:'Sexual harassment', vi:'Quấy rối tình dục' } },
    { v:'abuse',   t:{ ja:'暴言・威圧',           en:'Verbal abuse',        vi:'Lăng mạ/đe dọa' } },
    { v:'fraud',   t:{ ja:'不正行為',             en:'Misconduct',          vi:'Gian lận' } },
    { v:'legal',   t:{ ja:'法令違反',             en:'Legal violation',     vi:'Vi phạm pháp luật' } },
    { v:'hygiene', t:{ ja:'衛生上の重大問題',     en:'Serious hygiene issue', vi:'Vệ sinh nghiêm trọng' } },
    { v:'other',   t:{ ja:'その他重大な相談',     en:'Other serious matter', vi:'Vấn đề nghiêm trọng khác' } }
  ];
  const whistleCatLabel = (v) => { const c = WHISTLE_CATS.find(x => x.v === v); return c ? L(c.t) : v; };
  const getWhistle = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_whistle')) || []; } catch { return []; } };
  const saveWhistle = (a) => { try { localStorage.setItem('yosakura_demo_whistle', JSON.stringify(a)); } catch (e) {} };
  const getWhistleDone = () => { try { return JSON.parse(localStorage.getItem('yosakura_whistle_done')) || []; } catch { return []; } };
  APP_VIEWS.whistle = () => {
    // 本部＝受け付けた通報を一覧で確認
    if (getRole() === 'hq') {
      const done = getWhistleDone();
      const list = getWhistle().slice().sort((a,b) => b.t - a.t);
      return `
        ${NOTE({ ja:'◆ スタッフから直接届いた通報です。取り扱いは慎重に（担当・保存方法は本部で決定）', en:'◆ Reports sent directly by staff. Handle with care (owner & retention set by HQ).', vi:'◆ Báo cáo gửi trực tiếp từ nhân viên. Xử lý thận trọng.' })}
        <div class="card"><h3>${L({ ja:'受け付けた通報', en:'Received reports', vi:'Báo cáo đã nhận' })}</h3>
          ${list.length ? list.map(r => `<div class="rep">
            <span class="kind ${done.includes(r.t)?'':'a'}">${esc(whistleCatLabel(r.cat))}</span>
            <div class="body"><div class="l1">${esc(r.body||'—')}</div>
            <div class="l2">${r.anon ? L({ ja:'匿名', en:'Anonymous', vi:'Ẩn danh' }) : esc(r.store||'—')} ・ ${timeAgo(r.t)}</div></div>
            <button class="mini ${done.includes(r.t)?'on':''}" data-whdone="${r.t}">${done.includes(r.t) ? L({ ja:'対応済', en:'Done', vi:'Đã xử lý' }) : L({ ja:'未対応', en:'Open', vi:'Chưa xử lý' })}</button>
          </div>`).join('') : `<div class="muted">${L({ ja:'まだ通報はありません', en:'No reports yet', vi:'Chưa có báo cáo' })}</div>`}
        </div>
        <p class="hint">${L({ ja:'※ 通報先メール・受付担当・匿名可否・保存方法・対応フローは本部で決定してください（未確定）', en:'HQ to decide report address, handler, anonymity, retention and response flow (pending).', vi:'HQ quyết định địa chỉ, người phụ trách, ẩn danh, lưu trữ và quy trình (chưa chốt).' })}</p>`;
    }
    // スタッフ・店長・オーナー＝通報フォーム
    const store = visibleStores()[0];
    return `
      ${NOTE({ ja:'◆ 店長・オーナーに相談しにくい問題を、本部へ直接お伝えいただく窓口です', en:'◆ A channel to report issues to HQ directly when hard to raise with your manager/owner', vi:'◆ Kênh báo cáo trực tiếp tới HQ khi khó nói với quản lý/chủ' })}
      <div class="card" id="whForm">
        <h3>${L({ ja:'公益通報・コンプライアンス窓口', en:'Whistleblowing / Compliance', vi:'Tố giác / Tuân thủ' })}</h3>
        <label class="fld"><span>${L({ ja:'種類', en:'Category', vi:'Loại' })}</span>
          <div class="seg" data-seg="whcat" style="flex-wrap:wrap">${WHISTLE_CATS.map((c,i) => `<button type="button" data-v="${c.v}" class="${i===0?'on':''}">${L(c.t)}</button>`).join('')}</div></label>
        <label class="fld"><span>${L({ ja:'内容', en:'Details', vi:'Nội dung' })}</span>
          <textarea id="wh_body" placeholder="${esc(L({ ja:'事実を具体的に。日時・場所・関係者など分かる範囲で。', en:'Describe the facts: when, where, who, as far as you know.', vi:'Mô tả sự việc: khi nào, ở đâu, ai, trong khả năng biết.' }))}"></textarea></label>
        <label class="check-inline"><input type="checkbox" id="wh_anon"> ${L({ ja:'匿名で送信する（店舗名を伝えない）', en:'Send anonymously (hide store)', vi:'Gửi ẩn danh (ẩn cửa hàng)' })}</label>
        <button class="btn-primary" id="whSubmit" style="margin-top:12px">${L({ ja:'本部へ送信', en:'Send to HQ', vi:'Gửi tới HQ' })}</button>
        <div class="hint">${L({ ja:'※ この窓口はスタッフ画面から外せない固定項目です。内容は本部のみが確認します。', en:'This channel is a fixed item and cannot be removed. Only HQ can view submissions.', vi:'Kênh này cố định, không thể gỡ. Chỉ HQ xem được.' })}</div>
      </div>`;
  };

  /* ===================================================================
     本部からのお知らせ（news）＝本部が投稿→全端末に届く。ホームに最新を表示。
     配信先は全店 or 特定店舗。重要フラグあり。全端末同期。
  =================================================================== */
  const getNews = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_news')) || []; } catch { return []; } };
  const saveNews = (a) => { try { localStorage.setItem('yosakura_demo_news', JSON.stringify(a)); } catch (e) {} };
  function newsVisible(list) { // 非本部は「全店向け＋自店向け」だけ、本部は全件
    if (getRole() === 'hq') return list.slice();
    const store = visibleStores()[0];
    return list.filter(n => n.target === 'all' || n.target === store);
  }
  const newsTargetLabel = (t) => t === 'all' ? L({ ja:'全店', en:'All stores', vi:'Toàn bộ' }) : storeShort(t);
  const newsSnippet = (s = '') => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > 64 ? s.slice(0, 64) + '…' : s; };
  const newsBadge = (lv) => lv === 'important'
    ? `<span class="kind a">${L({ ja:'重要', en:'Important', vi:'Quan trọng' })}</span>`
    : `<span class="kind b">${L({ ja:'お知らせ', en:'News', vi:'Thông báo' })}</span>`;
  const newsRow = (n) => `
    <div class="rep news-item">
      ${newsBadge(n.level)}
      <div class="body">
        <div class="l1">${esc(n.title || '—')}</div>
        ${n.body ? `<div class="news-text">${esc(n.body)}</div>` : ''}
        ${(n.photos && n.photos.length) ? `<div class="rep-photos">${n.photos.map(p => `<img class="rep-photo" src="${photoThumb(p)}" data-full="${photoFull(p)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        ${n.video ? `<a class="news-video" href="${esc(n.video)}" target="_blank" rel="noopener">▶ ${L({ ja:'動画を見る', en:'Watch video', vi:'Xem video' })}</a>` : ''}
        <div class="l2">${esc(newsTargetLabel(n.target))} ・ ${timeAgo(n.t)}</div>
      </div>
    </div>`;
  APP_VIEWS.news = () => {
    const list = newsVisible(getNews()).sort((a, b) => b.t - a.t);
    const isHq = getRole() === 'hq';
    const form = isHq ? `
      <div class="card" id="newsForm">
        <h3>${L({ ja:'お知らせを投稿', en:'Post an announcement', vi:'Đăng thông báo' })}</h3>
        <label class="fld"><span>${L({ ja:'タイトル', en:'Title', vi:'Tiêu đề' })}</span>
          <input type="text" id="news_title" placeholder="${esc(L({ ja:'例）お盆期間の発注前倒しのお願い', en:'e.g. Early ordering for the holiday', vi:'vd: Đặt hàng sớm dịp lễ' }))}"></label>
        <label class="fld"><span>${L({ ja:'本文', en:'Body', vi:'Nội dung' })}</span>
          <textarea id="news_body" placeholder="${esc(L({ ja:'お知らせの内容を入力', en:'Enter the announcement', vi:'Nhập nội dung' }))}"></textarea></label>
        <label class="fld"><span>${L({ ja:'画像（任意・複数可）', en:'Images (optional)', vi:'Ảnh (tùy chọn)' })}</span>
          <div class="photo-drop" id="photoDrop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ ja:'画像を追加', en:'Add images', vi:'Thêm ảnh' })}</b></div><input type="file" accept="image/*" multiple id="f_photo" hidden></div>
          <div class="photo-thumbs" id="photoThumbs"></div></label>
        <label class="fld"><span>${L({ ja:'動画リンク（任意・YouTube等）', en:'Video link (optional)', vi:'Link video (tùy chọn)' })}</span>
          <input type="url" id="news_video" placeholder="https://..."></label>
        <label class="fld"><span>${L({ ja:'配信先', en:'Deliver to', vi:'Gửi đến' })}</span>
          <select id="news_target"><option value="all">${L({ ja:'全店', en:'All stores', vi:'Toàn bộ' })}</option>${STORES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label>
        <label class="check-inline"><input type="checkbox" id="news_important"> ${L({ ja:'重要なお知らせとして目立たせる', en:'Mark as important', vi:'Đánh dấu quan trọng' })}</label>
        <button class="btn-primary" id="newsPost" style="margin-top:12px">${L({ ja:'配信する', en:'Publish', vi:'Gửi' })}</button>
        <div class="hint">${L({ ja:'配信すると各店のホームに届きます', en:'Delivered to each store’s home', vi:'Sẽ hiển thị trên trang chủ mỗi cửa hàng' })}</div>
      </div>` : '';
    return `
      ${NOTE({ ja:'◆ 本部からのお知らせ・世桜ニュース', en:'◆ News and notices from HQ', vi:'◆ Thông báo & tin tức từ HQ' })}
      ${form}
      <div class="card"><h3>${L({ ja:'お知らせ一覧', en:'Announcements', vi:'Danh sách thông báo' })}</h3>
        ${list.length ? list.map(newsRow).join('') : `<div class="muted">${L({ ja:'まだお知らせはありません', en:'No announcements yet', vi:'Chưa có thông báo' })}</div>`}
      </div>`;
  };

  // 提出管理モジュールをアプリ一覧へ追加（店舗ロール中心・本部も閲覧可）
  if (!appById('openphoto')) {
    APPS.unshift({ id:'openphoto', group:'genba', icon:'camera', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'オープン写真の提出', en:'Opening photo', vi:'Ảnh mở cửa' },
      desc:{ ja:'開店時の店内・外観を提出', en:'Submit store photo at opening', vi:'Nộp ảnh khi mở cửa' } });
  }
  if (!appById('history')) {
    APPS.unshift({ id:'history', group:'genba', icon:'report', roles:['staff','manager','owner','hq'],
      name:{ ja:'提出履歴', en:'Submission history', vi:'Lịch sử nộp' },
      desc:{ ja:'直近7日の提出・判定を確認', en:'Last 7 days of submissions', vi:'7 ngày gần đây' } });
  }
  if (!appById('inbox')) {
    APPS.unshift({ id:'inbox', group:'hq', icon:'inbox', live:true, roles:['hq'],
      name:{ ja:'報告の確認（受信箱）', en:'Inbox (field reports)', vi:'Hộp thư báo cáo' },
      desc:{ ja:'現場からの報告を確認して対応済みにする', en:'Review field reports and mark done', vi:'Xem báo cáo và đánh dấu xử lý' } });
  }
  if (!appById('appfb')) {
    APPS.push({ id:'appfb', group:'other', icon:'idea', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'アプリへのご意見', en:'App feedback', vi:'Góp ý ứng dụng' },
      desc:{ ja:'使ってみて気づいたことをお送りください', en:'Tell us what you noticed', vi:'Cho biết điều bạn nhận thấy' } });
  }
  if (!appById('backend')) {
    APPS.push({ id:'backend', group:'hq', icon:'lock', roles:['hq'],
      name:{ ja:'バックエンド設定', en:'Backend settings', vi:'Cài đặt backend' },
      desc:{ ja:'データの保存先（専用／共用）を切り替え', en:'Switch data backend (dedicated/shared)', vi:'Đổi nơi lưu dữ liệu' } });
  }
  if (!appById('kyou')) {
    APPS.unshift({ id:'kyou', group:'genba', icon:'check', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'今日出すもの', en:'Today to submit', vi:'Cần nộp hôm nay' },
      desc:{ ja:'当日の提出物と未提出をひと目で', en:'Today’s items & missing at a glance', vi:'Mục cần nộp & còn thiếu' } });
  }
  if (!appById('news')) {
    APPS.push({ id:'news', group:'learn', icon:'bell', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'お知らせ', en:'Announcements', vi:'Thông báo' },
      desc:{ ja:'本部からのお知らせ・世桜ニュース', en:'News & notices from HQ', vi:'Thông báo & tin tức từ HQ' } });
  }
  if (!appById('emergency')) {
    APPS.push({ id:'emergency', group:'genba', icon:'phone', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'緊急連絡先', en:'Emergency contacts', vi:'Liên hệ khẩn cấp' },
      desc:{ ja:'警察・消防・設備業者など、店舗別にすぐ確認', en:'Police, fire, vendors — by store', vi:'Cảnh sát, cứu hỏa, đơn vị — theo cửa hàng' } });
  }
  if (!appById('whistle')) {
    APPS.push({ id:'whistle', group:'genba', icon:'shield', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'公益通報・コンプラ窓口', en:'Whistleblowing', vi:'Tố giác / Tuân thủ' },
      desc:{ ja:'相談しにくい問題を本部へ直接（固定）', en:'Report directly to HQ (fixed item)', vi:'Báo cáo trực tiếp tới HQ (cố định)' } });
  }

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
    // どの画面でも共有バックエンドから最新を取得（3秒スロットル）＝全端末で同期
    if (useBackend()) syncReports();
    if (byId('langBtn')) byId('langBtn').onclick = openLangSheet;
    if (byId('roleBtn')) byId('roleBtn').onclick = openIdentitySheet;
    if (byId('installBtn')) byId('installBtn').onclick = triggerInstall;
    if (byId('installDismiss')) byId('installDismiss').onclick = () => { localStorage.setItem('yosakura_install_hide', '1'); render(); };
    if (byId('backBtn')) byId('backBtn').onclick = () => go('/home');

    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab === 'home' ? '/home' : `/home?tab=${b.dataset.tab}`));
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { if (b.dataset.open === 'guide') openTour(0); else go(`/app/${b.dataset.open}`); });
    document.querySelectorAll('[data-locked]').forEach(b => b.onclick = () => { const a = appById(b.dataset.locked); toast(`${L(a.name)}`); });
    document.querySelectorAll('[data-mock]').forEach(b => b.onclick = () => toast(L({ ja:'この画面は準備中です（順次追加します）', en:'This screen is in preparation', vi:'Màn hình đang chuẩn bị' })));
    // 準備中のボタンにも必ずフィードバックを返す＝無反応ボタンを排除
    const demoBtns = {
      demoInvoice: { ja:'この機能は準備中です', en:'This feature is in preparation', vi:'Tính năng đang chuẩn bị' },
      demoReminder:{ ja:'この機能は準備中です', en:'This feature is in preparation', vi:'Tính năng đang chuẩn bị' },
      demoOrder:   { ja:'この機能は準備中です', en:'This feature is in preparation', vi:'Tính năng đang chuẩn bị' },
      demoInv:     { ja:'この機能は準備中です', en:'This feature is in preparation', vi:'Tính năng đang chuẩn bị' }
    };
    Object.keys(demoBtns).forEach(id => { const b = byId(id); if (b) b.onclick = () => toast(L(demoBtns[id])); });
    document.querySelectorAll('.rep-photo').forEach(im => im.onclick = () => openLightbox(im.dataset.full));

    document.querySelectorAll('[data-seg]').forEach(seg => {
      seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        btn.classList.add('on');
        if (seg.dataset.seg === 'kind') {
          const kind = btn.dataset.v;
          const store = (document.getElementById('f_store') || {}).value || visibleStores()[0];
          const block = document.getElementById('itemBlock');
          if (block) { block.innerHTML = itemFieldHTML(kind, store); wireItemBlock(); }
          const lvl = document.querySelector('[data-seg="level"]');
          if (lvl) { lvl.innerHTML = (kind==='a'?LEVELS_A:LEVELS_B).map((o,i)=>`<button type="button" data-v="${o.v}" class="${i===0?'on':''}">${L(o.t)}</button>`).join(''); rebindSeg(lvl); }
        }
      });
    });

    // 緊急連絡先：全枠をまとめて保存（店舗ごとに最新版が正・全端末共有）
    const emgSave = byId('emgSave');
    if (emgSave) emgSave.onclick = () => {
      const store = visibleStores()[0];
      const slots = {};
      document.querySelectorAll('.emg_phone').forEach(inp => {
        const id = inp.dataset.slot;
        const vendor = ((document.querySelector('.emg_vendor[data-slot="' + id + '"]') || {}).value || '').trim();
        const phone = (inp.value || '').trim();
        const memo = ((document.querySelector('.emg_memo[data-slot="' + id + '"]') || {}).value || '').trim();
        if (vendor || phone || memo) slots[id] = { vendor, phone, memo };
      });
      const t = Date.now();
      const all = getEmg(); all[store] = { slots, t }; saveEmg(all);
      lastSync = t;
      toast(L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' }));
      render();
      postReport({ kind:'emg', store, note: JSON.stringify({ slots }), t });
    };

    // 数値・原価率：ライブ計算＋月変更で月初在庫を自動引継＋保存
    const plForm = byId('plForm');
    if (plForm) {
      const num = (id) => Number((byId(id) && byId(id).value.replace(/[^0-9.-]/g, '')) || 0);
      const recalc = () => {
        const c = plCalc({ sales: num('pl_sales'), purchase: num('pl_purchase'), open: num('pl_open'), close: num('pl_close') });
        if (byId('pl_cost')) byId('pl_cost').textContent = yen(c.cost);
        if (byId('pl_costrate')) byId('pl_costrate').textContent = c.sales ? c.costRate.toFixed(1) + '%' : '—';
        if (byId('pl_grossrate')) byId('pl_grossrate').textContent = c.sales ? c.grossRate.toFixed(1) + '%' : '—';
      };
      ['pl_sales','pl_purchase','pl_open','pl_close'].forEach(id => { if (byId(id)) byId(id).oninput = recalc; });
      recalc();
      if (byId('pl_ym')) byId('pl_ym').onchange = () => {
        const store = visibleStores()[0], ym = byId('pl_ym').value;
        const ex = getMonthly().find(r => r.store === store && r.ym === ym);
        if (byId('pl_sales')) byId('pl_sales').value = ex && ex.sales != null ? ex.sales : '';
        if (byId('pl_purchase')) byId('pl_purchase').value = ex && ex.purchase != null ? ex.purchase : '';
        if (byId('pl_close')) byId('pl_close').value = ex && ex.close != null ? ex.close : '';
        if (byId('pl_open')) byId('pl_open').value = (ex && ex.open != null && ex.open !== '') ? ex.open : plPrevClose(store, ym); // 前月末在庫→月初へ
        recalc();
      };
      if (byId('plSave')) byId('plSave').onclick = () => {
        const store = visibleStores()[0], ym = byId('pl_ym').value;
        if (!ym) { toast(L({ ja:'対象月を選んでください', en:'Pick a month', vi:'Chọn tháng' })); return; }
        const rec = { store, ym, sales: num('pl_sales'), purchase: num('pl_purchase'), open: num('pl_open'), close: num('pl_close'), t: Date.now() };
        const arr = getMonthly().filter(r => !(r.store === store && r.ym === ym)); arr.push(rec);
        try { saveMonthly(arr.slice(-300)); } catch (e) { saveMonthly(arr.slice(-120)); }
        lastSync = rec.t;
        toast(L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' })); render();
        postReport({ kind:'monthly', store, note: JSON.stringify({ ym, sales: rec.sales, purchase: rec.purchase, open: rec.open, close: rec.close }), t: rec.t });
      };
    }

    // お知らせ：本部が配信（全端末へ）
    const newsPost = byId('newsPost');
    if (newsPost) newsPost.onclick = () => {
      const title = (byId('news_title') && byId('news_title').value.trim()) || '';
      const body = (byId('news_body') && byId('news_body').value.trim()) || '';
      if (!title && !body) { toast(L({ ja:'タイトルか本文を入力してください', en:'Please enter a title or body', vi:'Vui lòng nhập tiêu đề hoặc nội dung' })); return; }
      const target = (byId('news_target') && byId('news_target').value) || 'all';
      const level = (byId('news_important') && byId('news_important').checked) ? 'important' : 'normal';
      const video = (byId('news_video') && byId('news_video').value.trim()) || '';
      const thumbsEl = byId('photoThumbs');
      const photos = thumbsEl ? Array.from(thumbsEl.querySelectorAll('.pt')).map(w => w.dataset.thumb).filter(Boolean).slice(0, 6) : [];
      const t = Date.now();
      const arr = getNews(); arr.push({ title, body, level, target, video, photos, t });
      try { saveNews(arr.slice(-100)); } catch (e) { saveNews(arr.slice(-40)); }
      lastSync = t;
      toast(L({ ja:'お知らせを配信しました', en:'Announcement published', vi:'Đã đăng thông báo' }));
      render();
      postReport({ kind:'news', store:'', note: JSON.stringify({ title, body, level, target, video }), photos, t });
    };

    // 公益通報：本部へ送信（匿名可）
    const whSubmit = byId('whSubmit');
    if (whSubmit) whSubmit.onclick = () => {
      const catEl = document.querySelector('[data-seg="whcat"] .on');
      const cat = catEl ? catEl.dataset.v : 'other';
      const bodyEl = byId('wh_body');
      const body = bodyEl ? bodyEl.value.trim() : '';
      if (!body) { toast(L({ ja:'内容を入力してください', en:'Please enter details', vi:'Vui lòng nhập nội dung' })); return; }
      const anon = !!(byId('wh_anon') && byId('wh_anon').checked);
      const store = anon ? '' : visibleStores()[0];
      const t = Date.now();
      const arr = getWhistle(); arr.push({ store, cat, body, anon, t });
      try { saveWhistle(arr.slice(-200)); } catch (e) { saveWhistle(arr.slice(-60)); }
      lastSync = t;
      toast(L({ ja:'本部へ送信しました。ありがとうございます。', en:'Sent to HQ. Thank you.', vi:'Đã gửi tới HQ. Cảm ơn.' }));
      render();
      postReport({ kind:'whistle', store, note: JSON.stringify({ cat, body, anon }), t });
    };

    // 公益通報（本部）：対応済みトグル（この端末で表示管理）
    document.querySelectorAll('[data-whdone]').forEach(b => b.onclick = () => {
      const tv = Number(b.dataset.whdone);
      let done = getWhistleDone();
      done = done.includes(tv) ? done.filter(x => x !== tv) : done.concat(tv);
      try { localStorage.setItem('yosakura_whistle_done', JSON.stringify(done)); } catch (e) {}
      render();
    });

    // 店舗を変えたらメニュー選択肢を出し分け＋「その他」トグルを配線（食べ残し報告）
    const fstoreSel = document.getElementById('f_store');
    const itemBlockEl = document.getElementById('itemBlock');
    if (fstoreSel && itemBlockEl) {
      fstoreSel.onchange = () => {
        const on = document.querySelector('[data-seg="kind"] .on');
        const kind = on ? on.dataset.v : 'a';
        itemBlockEl.innerHTML = itemFieldHTML(kind, fstoreSel.value);
        wireItemBlock();
      };
    }
    wireItemBlock();

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
      const itemEl = document.getElementById('f_item');
      let item = itemEl ? itemEl.value.trim() : '';
      if (item === '__other__') { const oth = document.getElementById('f_item_other'); item = oth ? oth.value.trim() : ''; }
      const note = document.getElementById('f_note').value.trim();
      if (!item) { toast(L({ ja:'メニュー・品目を選んでください', en:'Please choose an item', vi:'Vui lòng chọn hạng mục' })); return; }
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

    const subKz = document.getElementById('submitKz');
    if (subKz) subKz.onclick = () => {
      const catEl = document.querySelector('[data-seg="kzcat"] .on');
      const cat = catEl ? catEl.dataset.v : 'food';
      const store = document.getElementById('kz_store').value;
      const note = document.getElementById('kz_note').value.trim();
      if (!note) { toast(L({ ja:'気づいたことを入力してください', en:'Please enter your insight', vi:'Vui lòng nhập ghi nhận' })); return; }
      const thumbsEl = document.getElementById('photoThumbs');
      const photos = thumbsEl ? Array.from(thumbsEl.querySelectorAll('.pt')).map(w => w.dataset.thumb).filter(Boolean).slice(0,4) : [];
      const t = Date.now();
      const arr = getKz(); arr.push({ store, cat, note, photos, t });
      try { saveKz(arr.slice(-80)); } catch (e) { saveKz(arr.slice(-30)); }
      lastSync = t; // 直後の重複同期を抑止（postReportがforce同期）
      toast(L({ ja:'気づきを共有しました。ありがとうございます！', en:'Insight shared. Thank you!', vi:'Đã gửi. Cảm ơn!' }));
      render();
      postReport({ kind:'kizuki', store, item:cat, note, photos, t });
    };

    // ③ 口コミQR：保存・開く・コピー
    if (byId('reviewSave')) byId('reviewSave').onclick = () => {
      const store = visibleStores()[0]; const u = byId('review_url').value.trim();
      const m = getReviewMap(); if (u) m[store] = u; else delete m[store]; saveReviewMap(m);
      toast(L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' })); render();
    };
    if (byId('reviewOpen')) byId('reviewOpen').onclick = (e) => window.open(e.currentTarget.dataset.url, '_blank', 'noopener');
    if (byId('reviewCopy')) byId('reviewCopy').onclick = (e) => { try { navigator.clipboard.writeText(e.currentTarget.dataset.url); } catch (_) {} toast(L({ ja:'コピーしました', en:'Copied', vi:'Đã sao chép' })); };

    // ④ 店内動画：共有
    const subSv = byId('submitSv');
    if (subSv) subSv.onclick = () => {
      const url = byId('sv_url').value.trim();
      if (!url) { toast(L({ ja:'動画リンクを入力してください', en:'Please enter a video link', vi:'Vui lòng nhập link' })); return; }
      const t = Date.now(), store = byId('sv_store').value, note = byId('sv_note').value.trim();
      const arr = getVideos(); arr.push({ store, url, note, t });
      try { saveVideos(arr.slice(-80)); } catch (e) { saveVideos(arr.slice(-30)); }
      lastSync = t;
      toast(L({ ja:'共有しました', en:'Shared', vi:'Đã chia sẻ' })); render();
      postReport({ kind:'video', store, item:url, note, t });
    };

    // ⑤ 巡回フィードバック：記録
    const subSvfb = byId('submitSvfb');
    if (subSvfb) subSvfb.onclick = () => {
      const good = byId('fb_good').value.trim(), improve = byId('fb_improve').value.trim();
      if (!good && !improve) { toast(L({ ja:'良かった点か改善点を入力してください', en:'Please enter a good point or an improvement', vi:'Vui lòng nhập nội dung' })); return; }
      const t = Date.now(), store = byId('fb_store').value, aspect = byId('fb_aspect').value;
      const arr = getSvfb(); arr.push({ store, aspect, good, improve, t });
      try { saveSvfb(arr.slice(-120)); } catch (e) { saveSvfb(arr.slice(-40)); }
      lastSync = t;
      toast(L({ ja:'記録しました', en:'Saved', vi:'Đã lưu' })); render();
      postReport({ kind:'svfb', store, item:aspect, note: JSON.stringify({ good, improve }), t });
    };

    // ⑥ サーベイ：本番リンク・改善点(複数選択)・回答送信（高満足時のみ口コミ案内）
    if (byId('surveyOpen')) byId('surveyOpen').onclick = (e) => window.open(e.currentTarget.dataset.url, '_blank', 'noopener');
    document.querySelectorAll('[data-multiseg] button').forEach(b => b.onclick = () => b.classList.toggle('on'));
    const subSurvey = byId('submitSurvey');
    if (subSurvey) subSurvey.onclick = () => {
      const satEl = document.querySelector('[data-seg="sat"] .on');
      const sat = satEl ? Number(satEl.dataset.v) : 5;
      const issues = Array.from(document.querySelectorAll('[data-multiseg="issue"] .on')).map(b => b.dataset.v);
      const t = Date.now(), store = visibleStores()[0], route = byId('survey_route').value, comment = byId('survey_note').value.trim();
      const note = (issues.length ? '[改善点: ' + issues.map(surveyIssueLabel).join('・') + '] ' : '') + comment;
      const arr = getSurvey(); arr.push({ store, sat, route, note, t });
      try { saveSurvey(arr.slice(-300)); } catch (e) { saveSurvey(arr.slice(-100)); }
      lastSync = t; render();
      postReport({ kind:'survey', store, level:String(sat), item:route, note, t });
      toast(sat >= 4
        ? L({ ja:'ありがとうございます！よろしければ口コミQRのご案内を（控えめに）', en:'Thank you! Gently offer the review QR.', vi:'Cảm ơn! Hãy mời đánh giá nhẹ nhàng.' })
        : L({ ja:'ご回答ありがとうございました！', en:'Thank you for your feedback!', vi:'Cảm ơn phản hồi của bạn!' }));
    };

    const subFP = document.getElementById('submitFP');
    if (subFP) subFP.onclick = () => {
      const thumbsEl = document.getElementById('photoThumbs');
      const photos = thumbsEl ? Array.from(thumbsEl.querySelectorAll('.pt')).map(w => w.dataset.thumb).filter(Boolean).slice(0,3) : [];
      const item = document.getElementById('fp_item').value.trim();
      const store = document.getElementById('fp_store').value;
      if (!photos.length) { toast(L({ ja:'写真を追加してください', en:'Please add a photo', vi:'Vui lòng thêm ảnh' })); return; }
      const ai = '';   // AIは未接続のため判定しない（本部が確認して判定を付ける）
      const fps = getFP(); fps.push({ id: 'fp' + Date.now() + Math.random().toString(36).slice(2,6), store, item, photos, ai, t: Date.now() });
      try { saveFP(fps.slice(-15)); } catch (e) { saveFP(fps.slice(-5)); }
      toast(L({ ja:'提出しました。ありがとうございます！', en:'Submitted. Thank you!', vi:'Đã gửi. Cảm ơn!' }));
      render();
    };

    // オープン・クローズチェック：モード切替
    document.querySelectorAll('[data-ckmode]').forEach(b => b.onclick = () => { localStorage.setItem('yosakura_ckmode', b.dataset.ckmode); render(); });
    // チェックのON/OFF（店舗×モード×当日で保存）
    document.querySelectorAll('[data-ck]').forEach(row => row.onclick = (e) => {
      if (e.target.closest('[data-ckdel]')) return; // 削除ボタンは別処理
      const store = visibleStores()[0], mode = getCkMode(), key = ckDoneKey(store, mode), id = row.dataset.ck;
      const map = getCkDone(); const day = map[key] || {}; day[id] = !day[id]; map[key] = day;
      // 古い日付のチェックは肥大化防止のため間引く（直近14日分のみ保持）
      const keep = {}; const keys = Object.keys(map).sort().slice(-40); keys.forEach(k => keep[k] = map[k]);
      saveCkDone(keep); render();
    });
    // 店舗独自項目：追加
    if (byId('ckAdd')) byId('ckAdd').onclick = () => {
      const inp = byId('ck_new'); const label = inp ? inp.value.trim() : '';
      if (!label) { toast(L({ ja:'項目名を入力してください', en:'Enter an item name', vi:'Nhập tên mục' })); return; }
      const store = visibleStores()[0], mode = getCkMode(), mk2 = `${store}||${mode}`;
      const all = getCkItems(); const list = (all[mk2] || []).slice();
      list.push({ id: `${mode}-x-${Date.now().toString(36)}`, label });
      all[mk2] = list; saveCkItems(all);
      const t = Date.now(); lastSync = t;
      toast(L({ ja:'追加しました', en:'Added', vi:'Đã thêm' })); render();
      postReport({ kind:'ckitem', store, note: JSON.stringify({ mode, items: list }), t });
    };
    // 店舗独自項目：削除
    document.querySelectorAll('[data-ckdel]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const store = visibleStores()[0], mode = getCkMode(), mk2 = `${store}||${mode}`, id = b.dataset.ckdel;
      const all = getCkItems(); const list = (all[mk2] || []).filter(c => c.id !== id);
      all[mk2] = list; saveCkItems(all);
      const t = Date.now(); lastSync = t;
      toast(L({ ja:'削除しました', en:'Removed', vi:'Đã xóa' })); render();
      postReport({ kind:'ckitem', store, note: JSON.stringify({ mode, items: list }), t });
    });

    // 来店経路：ワンタップ記録（全端末で本部に集約）
    document.querySelectorAll('[data-route]').forEach(b => b.onclick = () => {
      const t = Date.now(), store = b.dataset.store, route = b.dataset.route;
      const arr = getRoute(); arr.push({ store, route, t });
      try { saveRoute(arr.slice(-3000)); } catch (e) { saveRoute(arr.slice(-800)); }
      lastSync = t;
      toast(L({ ja:'記録しました', en:'Logged', vi:'Đã ghi' }) + '：' + routeLabel(route));
      render();
      postReport({ kind:'route', store, item:route, t });
    });

    // 開局（レジ準備金）：金種→合計/差の自動計算＋保存
    const orDenoms = document.querySelectorAll('.or_denom');
    if (orDenoms.length) {
      const upd = () => {
        let t = 0; orDenoms.forEach(i => { t += (Number(i.dataset.d)||0) * (Number(i.value)||0); });
        const totEl = byId('or_total'); if (totEl) totEl.textContent = '¥' + t.toLocaleString('en-US');
        const diffEl = byId('or_diff'); if (diffEl) { const df = t - OPEN_TARGET; diffEl.textContent = (df>=0?'+':'−') + '¥' + Math.abs(df).toLocaleString('en-US'); }
      };
      orDenoms.forEach(i => i.oninput = upd);
    }
    const subOr = byId('submitOr');
    if (subOr) subOr.onclick = () => {
      const denom = {}; let total = 0;
      document.querySelectorAll('.or_denom').forEach(i => { const d = Number(i.dataset.d)||0, c = Number(i.value)||0; denom[d] = c; total += d*c; });
      const t = Date.now(), store = byId('or_store').value, date = byId('or_date').value;
      const rec = { store, date, denom, total, t };
      const arr = getOpen(); arr.push(rec); try { saveOpen(arr.slice(-60)); } catch (e) { saveOpen(arr.slice(-20)); }
      lastSync = t;
      toast(L({ ja:'開局しました（合計 ', en:'Register opened (total ', vi:'Đã mở quầy (tổng ' }) + '¥' + total.toLocaleString('en-US') + '）');
      render();
      postReport({ kind:'open', store, note: JSON.stringify({ date, denom, total }), t });
    };

    // 一食目写真：本部フィードバックを開く
    document.querySelectorAll('[data-fpfb]').forEach(b => b.onclick = () => openFPFeedback(b.dataset.fpfb));

    // 総括表：客単価の自動計算＋提出
    const skSales = byId('sk_sales'), skGuests = byId('sk_guests'), skAvg = byId('sk_avg');
    if (skSales && skGuests && skAvg) {
      const upd = () => { const s = Number(skSales.value)||0, g = Number(skGuests.value)||0; skAvg.textContent = g ? ('¥' + Math.round(s/g).toLocaleString('en-US')) : '¥0'; };
      skSales.oninput = upd; skGuests.oninput = upd;
    }
    const skMtd = byId('sk_mtd'), skGoal = byId('sk_goal'), skRate = byId('sk_rate');
    if (skMtd && skGoal && skRate) {
      const upd2 = () => { const m = Number(skMtd.value)||0, g = Number(skGoal.value)||0; skRate.textContent = g ? ((m/g*100).toFixed(1) + '%') : '—'; };
      skMtd.oninput = upd2; skGoal.oninput = upd2;
    }
    const subSk = byId('submitSk');
    if (subSk) subSk.onclick = () => {
      const v = (id) => { const e = byId(id); return e ? e.value.trim() : ''; };
      if (!v('sk_sales')) { toast(L({ ja:'当日売上を入力してください', en:'Please enter sales', vi:'Vui lòng nhập doanh thu' })); return; }
      const rec = {
        store: v('sk_store'), date: v('sk_date'), sales: Number(v('sk_sales'))||0, guests: Number(v('sk_guests'))||0,
        net: Number(v('sk_net'))||0, err: v('sk_err'), mtd: Number(v('sk_mtd'))||0, goal: Number(v('sk_goal'))||0,
        foodct: v('sk_foodct'), drinkct: v('sk_drinkct'),
        rvt: v('sk_rvt'), rva: v('sk_rva'), hear: v('sk_hear'), disc: v('sk_disc'),
        food: v('sk_food'), labor: v('sk_labor'), tipt: v('sk_tipt'), tipa: v('sk_tipa'),
        cancel: v('sk_cancel'), closer: v('sk_closer'), note: v('sk_note'), order: v('sk_order'), t: Date.now()
      };
      const arr = getSk(); arr.push(rec);
      try { saveSk(arr.slice(-60)); } catch (e) { saveSk(arr.slice(-20)); }
      lastSync = rec.t;
      toast(L({ ja:'総括表を提出しました。ありがとうございます！', en:'Daily report submitted. Thank you!', vi:'Đã nộp báo cáo. Cảm ơn!' }));
      render();
      const skStore = rec.store, skT = rec.t, skPayload = Object.assign({}, rec); delete skPayload.store; delete skPayload.t;
      postReport({ kind:'soukatsu', store: skStore, note: JSON.stringify(skPayload), t: skT });
    };
  }
  // レベルセグメント差し替え後の再バインド
  function rebindSeg(seg) {
    seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      btn.classList.add('on');
    });
  }

  /* ---------- 共有バックエンドとの同期（全機能を種別で相乗り・全端末で同期）---------- */
  const pj = (s) => { try { return JSON.parse(s); } catch (_) { return {}; } };
  // バックエンドの全行を、各機能のローカルキーへ振り分け（バックエンドが正）。パース失敗も安全。
  function distribute(rows) {
    const food=[], kz=[], route=[], open=[], sk=[], survey=[], svfb=[], video=[], whistle=[], news=[]; const emg={}; const ckitem={}, ckitemT={}; const monthly={}, monthlyT={};
    (rows || []).forEach(r => {
      const t = Number(r.t) || 0, id = r.id, store = r.store || '';
      switch (r.kind) {
        case 'a': case 'b': food.push({ kind:r.kind, store, item:r.item, level:r.level, note:r.note, photos:r.photos||[], t, id }); break;
        case 'kizuki': kz.push({ store, cat:r.item, note:r.note, photos:r.photos||[], t, id }); break;
        case 'route': route.push({ store, route:r.item, t, id }); break;
        case 'open': { const p=pj(r.note); open.push({ store, date:p.date||'', denom:p.denom||{}, total:Number(p.total)||0, t, id }); } break;
        case 'soukatsu': { const p=pj(r.note); sk.push(Object.assign({ store, t, id }, p)); } break;
        case 'survey': survey.push({ store, sat:Number(r.level)||0, route:r.item, note:r.note, t, id }); break;
        case 'svfb': { const p=pj(r.note); svfb.push({ store, aspect:r.item, good:p.good||'', improve:p.improve||'', t, id }); } break;
        case 'video': video.push({ store, url:r.item, note:r.note, t, id }); break;
        case 'emg': { const p=pj(r.note); if (!emg[store] || t >= emg[store].t) emg[store] = { slots: p.slots || {}, t }; } break; // 店舗ごとに最新版が正
        case 'whistle': { const p=pj(r.note); whistle.push({ store, cat:p.cat||'other', body:p.body||'', anon:!!p.anon, t, id }); } break;
        case 'news': { const p=pj(r.note); news.push({ title:p.title||'', body:p.body||'', level:p.level||'normal', target:p.target||'all', video:p.video||'', photos:r.photos||[], t, id }); } break;
        case 'ckitem': { const p=pj(r.note); const k=`${store}||${p.mode||'open'}`; if (ckitemT[k]==null || t>=ckitemT[k]) { ckitem[k]=Array.isArray(p.items)?p.items:[]; ckitemT[k]=t; } } break; // 店舗×モードごと最新版が正
        case 'monthly': { const p=pj(r.note); const k=`${store}||${p.ym}`; if (monthlyT[k]==null || t>=monthlyT[k]) { monthly[k]={ store, ym:p.ym, sales:p.sales, purchase:p.purchase, open:p.open, close:p.close, t }; monthlyT[k]=t; } } break; // 店舗×月ごと最新版が正
      }
    });
    const set = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a)); } catch (_) {} };
    set(LS.reports, food); set('yosakura_demo_kizuki', kz); set('yosakura_demo_route', route);
    set('yosakura_demo_open', open); set('yosakura_demo_soukatsu', sk); set('yosakura_demo_survey', survey);
    set('yosakura_demo_svfb', svfb); set('yosakura_demo_storevideo', video);
    set('yosakura_demo_emg', emg); set('yosakura_demo_whistle', whistle); set('yosakura_demo_news', news); set('yosakura_demo_ckitem', ckitem); set('yosakura_demo_monthly', Object.values(monthly));
  }
  async function syncReports(force) {
    if (!useBackend()) return;
    if (!force && Date.now() - lastSync < 3000) return;
    lastSync = Date.now();
    try {
      const res = await fetch(getApiUrl());
      const d = await res.json();
      if (d && d.ok && Array.isArray(d.reports)) {
        const nextRaw = JSON.stringify(d.reports);
        if (nextRaw !== (localStorage.getItem('yosakura_demo_raw') || '')) {
          localStorage.setItem('yosakura_demo_raw', nextRaw);
          distribute(d.reports);
          render();
        }
      }
    } catch (_) { /* オフライン時はローカル（既存データ）を使用 */ }
  }
  // rep = { kind, store, item, level, note, photos, t }
  function postReport(rep) {
    if (!useBackend()) return Promise.resolve();
    return fetch(getApiUrl(), { method: 'POST', body: JSON.stringify(rep) }).then(() => syncReports(true)).catch(() => {});
  }

  /* ---------- 起動 ---------- */
  document.documentElement.lang = LANG;
  if (!useBackend()) seedIfEmpty();
  // バックエンド接続時は全端末同期を使うためシードしない（＝実データのみ）。オフライン検証時のみ初期データを用意。
  if (!useBackend()) { seedSk(); seedKz(); seedSvfb(); seedSurvey(); seedEmg(); seedNews(); }
  render();
  syncReports(true);
  setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 1150);
  if (!localStorage.getItem('yosakura_tour_done')) setTimeout(() => openTour(0), 1450); // 初回のみ使い方ガイド
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
