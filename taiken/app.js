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
  const API_URL_DEFAULT = ''; // 体験版＝保存先を持たない（build-taiken.mjs が入れる）
  const LS_API = 'yosakura_api_url';
  /* ====== 体験版（2026-08-12 勉強会デモMTGの決定） ======
     勉強会のあと、加盟店の皆さまへお配りして自由に触っていただくための版。
     API_URL_DEFAULT を空にしてビルドしたものが体験版になる。
     ★端末に保存された接続先(LS_API)も無視する＝どう操作しても本物の記録には送られない。
       （ここを localStorage 任せにすると、以前この端末で本番URLを入れていた方の操作が
         本物の履歴に混ざる。配る版なので、ビルドの時点で断ち切る） */
  const TAIKEN = !API_URL_DEFAULT;
  const getApiUrl = () => (TAIKEN ? '' : (localStorage.getItem(LS_API) || API_URL_DEFAULT));
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
    staff:   { mark: '店', label: { ja:'店舗iPad', en:'Store iPad', vi:'iPad cửa hàng' }, desc: { ja:'店舗の共用iPad（現場スタッフが使用）', en:'Shared store iPad (used by staff)', vi:'iPad chung (nhân viên dùng)' } },
    manager: { mark: '長', label: { ja:'店長', en:'Manager', vi:'Cửa hàng trưởng' },   desc: { ja:'店舗の店長・管理者', en:'Store manager', vi:'Quản lý cửa hàng' } },
    owner:   { mark: '主', label: { ja:'加盟店オーナー', en:'Franchisee', vi:'Chủ nhượng quyền' }, desc: { ja:'加盟店のオーナー様', en:'Franchise store owner', vi:'Chủ cửa hàng nhượng quyền' } },
    hq:      { mark: '本', label: { ja:'本部', en:'HQ', vi:'Bộ phận chính' },            desc: { ja:'世桜 本部（経営・高原社長ら）', en:'YOSAKURA headquarters', vi:'Trụ sở YOSAKURA' } }
  };

  /* ---------- 店舗マスター ----------
     本部の「加盟店情報まとめ」の店舗名（日本語）に合わせる（2026-08-07 増田さんご指示）。
     ★実質直営の3店舗＝日本料理世桜本店／牛カツ世桜 長堀橋店／手巻き寿司世桜 難波店。
       新しい取り組みはこの3店舗で試してから加盟店へ広げる。 */
  const STORES = [
    '日本料理世桜本店', '寿司世桜 心斎橋店',
    '牛カツ世桜 長堀橋店', '日本鰻世桜 長堀橋店', '手巻き寿司世桜 難波店',
    '牛カツ世桜 富士山店', '日本鰻世桜 富士山店',
    '日本鰻世桜 京都祇園店', '日本鰻世桜 浅草橋店', '和牛世桜 広島店',
    '牛カツ世桜 ファンケビン店', '牛カツ世桜 タオディエン店', '日本鰻世桜 ホーチミン店'
  ];
  /* 以前の表記で入っているデータ（総括表・サーベイなど）を、正式名称へ寄せる。
     これが無いと、名称を変えた時点で過去の実績が「別の店舗」になってしまう。 */
  const STORE_ALIASES = {
    '日本料理世桜 心斎橋（おまかせ）': '日本料理世桜本店',
    '日本料理世桜 心斎橋': '日本料理世桜本店',
    '日本料理世桜本店サーベイ': '日本料理世桜本店',
    '牛カツ世桜 ハノイ店': '牛カツ世桜 ファンケビン店',
    '日本鰻世桜 ホーチミン1号店': '日本鰻世桜 ホーチミン店'
  };
  const normalizeStore = (s) => {
    const k = String(s == null ? '' : s).trim().replace(/　/g, ' ').replace(/\s+/g, ' ');
    if (!k || k === 'all' || k === 'owned' || k === '*') return k;
    if (STORE_ALIASES[k]) return STORE_ALIASES[k];
    return STORES.find(x => x === k) || k;
  };

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
      name:{ ja:'食べ残し報告', en:'Food Waste', vi:'Thức ăn thừa' },
      desc:{ ja:'お客様の食べ残しを写真で報告（食材ロスは将来）', en:'Report customer leftovers by photo', vi:'Báo cáo đồ khách để thừa bằng ảnh' } },
    { id:'firstphoto', group:'genba', icon:'camera', soon:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'一食目写真の報告', en:'First-plate Photo', vi:'Ảnh món đầu tiên' },
      desc:{ ja:'提供直後の一枚を本部へ', en:'Send the first serving photo', vi:'Gửi ảnh ngay khi phục vụ' } },
    // 日次業務の最後に並ぶようになったため、タブには重ねない（2026-08-12）。
    // 途中で気づいたときも、日次業務から開ける（提出後も開ける形にしてある）。
    { id:'kizuki', group:'genba', icon:'idea', tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'気づきの報告', en:'Daily Insights', vi:'Ghi nhận cuối ca' },
      desc:{ ja:'クローズ後の気づきを本部へ共有', en:'Share end-of-shift insights', vi:'Chia sẻ ghi nhận sau ca' } },
    { id:'route', group:'genba', icon:'pin', hide:true, roles:['staff','manager','owner','hq'], // 議事録12-1: 来店経路はサーベイで回収（アプリに重複入力を作らない）。結果は「サーベイ集計」で表示
      name:{ ja:'来店経路の記録', en:'Arrival Route', vi:'Nguồn khách' },
      desc:{ ja:'来店きっかけをワンタップで', en:'One-tap arrival source', vi:'Nguồn khách 1 chạm' } },
    // ホームの「みんなの投稿」カードから開く（ホームには常に出ている）。タブに重ねない
    { id:'community', group:'genba', icon:'chat', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'みんなの投稿', en:'Community', vi:'Cộng đồng' },
      desc:{ ja:'現場のグッドストーリーを全店で共有', en:'Share good stories across stores', vi:'Chia sẻ câu chuyện hay' } },
    { id:'review', group:'other', icon:'qr', hide:true, roles:['staff','manager','owner','hq'], // 議事録12-4/23: 口コミQRはアプリ掲載を一旦外す（紙運用が基本）
      name:{ ja:'口コミQR', en:'Review QR', vi:'QR đánh giá' },
      desc:{ ja:'紙での提示が基本。必要時のみ使用', en:'Paper first; use only when needed', vi:'Ưu tiên giấy; chỉ dùng khi cần' } },
    { id:'talk', group:'learn', icon:'chat', roles:['staff','manager','owner','hq'],
      name:{ ja:'接客スクリプト・食べ方ガイド', en:'Service Scripts', vi:'Kịch bản phục vụ' },
      desc:{ ja:'多言語の接客フレーズと食べ方案内', en:'Multilingual phrases & how-to-enjoy', vi:'Câu phục vụ đa ngữ' } },
    // 2026-08-12 渉さんのご指摘：日次業務と同じものが「報告する」にも並び、二重に見えていた。
    // 機能は生きているが、タブの一覧には出さない（日次業務の各チェックリストから開く）。
    { id:'checklist', group:'genba', icon:'check', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'オープン・クローズチェック', en:'Open & Close Check', vi:'Kiểm tra Mở & Đóng' },
      desc:{ ja:'開店・閉店の点検（店舗独自項目も追加可）', en:'Opening & closing checks', vi:'Kiểm tra mở & đóng cửa' } },
    { id:'links', group:'other', icon:'link', soon:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'リンク集', en:'Quick Links', vi:'Liên kết' },
      desc:{ ja:'初期設定・発注などの必要リンク', en:'Setup, ordering and key links', vi:'Cài đặt, đặt hàng, liên kết' } },
    // 8/10 構築MTG D-03/D-10・A-04: 単発のお知らせではなく「ルールを後から確認できる場所」として新設
    { id:'faq', group:'other', icon:'idea', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'よくある質問（ルール集）', en:'FAQ & Rules', vi:'Hỏi đáp & Quy định' },
      desc:{ ja:'販促物の依頼・持ち込みなど、迷ったときに確認', en:'Check the rules when in doubt', vi:'Xem quy định khi phân vân' } },
    { id:'inventory', group:'storeops', icon:'box', soon:true, hide:true, roles:['manager','owner','hq'], // 8/4: 棚卸は月末提出物へ統合＝独立は外す
      name:{ ja:'棚卸・在庫入力', en:'Stocktake', vi:'Kiểm kho' },
      desc:{ ja:'品目ごとの在庫をスマホで入力', en:'Enter stock by item on your phone', vi:'Nhập tồn kho theo mặt hàng' } },
    { id:'openreg', group:'storeops', icon:'coins', hide:true, roles:['manager','owner','hq'], // 8/7 増田さん: 開局（レジ開設）は不要
      name:{ ja:'開局（レジ準備金）', en:'Register Open', vi:'Mở quầy' },
      desc:{ ja:'金種を入力→合計を自動計算', en:'Enter float by denomination', vi:'Nhập tiền quỹ đầu ca' } },
    // 月次業務の「店舗内・外の動画」から開く。タブに同じものを並べない
    { id:'storevideo', group:'storeops', icon:'video', tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'店内動画の共有', en:'In-store Video', vi:'Video trong quán' },
      desc:{ ja:'店内一周の動画リンクを共有', en:'Share store walkthrough videos', vi:'Chia sẻ video trong quán' } },
    { id:'manual', group:'learn', icon:'book', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'マニュアル', en:'Manuals', vi:'Cẩm nang' },
      desc:{ ja:'権限・業態別に表示（理念・接客・衛生・商品）', en:'By role & store type', vi:'Theo vai trò & loại hình' } },
    { id:'materials', group:'learn', icon:'link', live:true, roles:['hq'],
      name:{ ja:'資料リンクの管理', en:'Manage material links', vi:'Quản lý liên kết' },
      desc:{ ja:'本部が資料を登録・編集（スタッフはマニュアルから閲覧）', en:'HQ registers materials (staff view via Manuals)', vi:'HQ đăng ký (nhân viên xem qua Cẩm nang)' } },
    { id:'survey', group:'storeops', icon:'star', roles:['staff','manager','owner','hq'],
      name:{ ja:'サーベイ・集計', en:'Survey & Results', vi:'Khảo sát & Kết quả' },
      desc:{ ja:'お客様アンケートの運用と結果集計（満足度・来店経路・月別）', en:'Run survey & view results', vi:'Vận hành & xem kết quả' } },
    { id:'guide', group:'other', icon:'play', roles:['staff','manager','owner','hq'],
      name:{ ja:'使い方ガイド', en:'How to use', vi:'Hướng dẫn' },
      desc:{ ja:'このアプリの使い方（1分）', en:'Quick app guide (1 min)', vi:'Hướng dẫn nhanh (1 phút)' } },
    // 8/7 増田さん: 日次業務と重複するため「報告する」タブには出さない。日次業務（今日出すもの）から開く
    { id:'soukatsu', group:'storeops', icon:'table', tabHide:true, roles:['staff','manager','owner','hq'], // 日報は店舗iPad（現場）でも入力可（上原さんご要望）
      name:{ ja:'総括表の入力（日報）', en:'Daily Summary', vi:'Tổng kết ngày' },
      desc:{ ja:'日次の売上・客数・分析（店舗iPadでも入力可）', en:'Daily sales, guests, review', vi:'Doanh thu, khách, phân tích' } },
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
    // 月次業務の「総括表の締め」「PL・損益」から開く。タブに同じものを並べない
    // （本部・オーナーも月次業務から開けることを確認済み）
    { id:'pl', group:'storeops', icon:'yen', live:true, tabHide:true, roles:['manager','owner','hq'],
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
  const LS = { role:'yosakura_demo_role', store:'yosakura_demo_store', reports:'yosakura_demo_reports', checks:'yosakura_demo_checks', uname:'yosakura_demo_uname' };
  /* 体験版で選べる役割は、加盟店の皆さまが実際にお使いになる3つだけ（2026-08-12 渉さんのご判断）。
     本部の画面は加盟店の方には関係がなく、見えると「本部はここまで見るのか」という話に逸れる。
     ★端末に本部が保存されていても、体験版では店長として開く（配る版なので入口を残さない）。 */
  const ROLE_KEYS_ALL = ['staff', 'manager', 'owner', 'hq'];
  const roleKeys = () => TAIKEN ? ['staff', 'manager', 'owner'] : ROLE_KEYS_ALL;
  const getRole = () => {
    const r = localStorage.getItem(LS.role) || 'staff';
    return roleKeys().includes(r) ? r : (TAIKEN ? 'manager' : 'staff');
  };
  const setRole = (r) => localStorage.setItem(LS.role, r);
  // 提出者名＝この端末を使う方のお名前。一度登録すれば以後の提出に自動で残る（本部決定：提出物は後から誰が出したか分かるようにする）
  const getUserName = () => (localStorage.getItem(LS.uname) || '').trim();
  const setUserName = (n) => { try { localStorage.setItem(LS.uname, String(n || '').trim().slice(0, 20)); } catch (e) {} };
  // 記録に残す表記＝「店長（山田）」。未登録でも提出は妨げない（役割だけが残る）
  const submitterLabel = () => { const r = ROLES[getRole()] ? L(ROLES[getRole()].label) : getRole(); const n = getUserName(); return n ? `${r}（${n}）` : r; };
  // 端末に旧い表記が保存されていても、正式名称へ読み替える（保存済みの選択が外れないように）
  const getStoreSel = () => normalizeStore(localStorage.getItem(LS.store) || STORES[0]);
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
  // 画面では「世桜」以降の地名だけを出す（例：日本料理世桜本店 → 本店／牛カツ世桜 長堀橋店 → 長堀橋店）
  const storeShort = (s) => s === 'all' ? L({ ja:'全店', en:'All', vi:'Tất cả' })
    : s === 'owned' ? L({ ja:'所有店舗', en:'My stores', vi:'CH của tôi' })
    : (String(s || '').replace(/^.*世桜[\s　]*/, '') || s);
  const getReports = () => { try { return JSON.parse(localStorage.getItem(LS.reports)) || []; } catch { return []; } };
  const saveReports = (a) => localStorage.setItem(LS.reports, JSON.stringify(a));
  const getFP = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_fp')) || []; } catch { return []; } };
  const saveFP = (a) => localStorage.setItem('yosakura_demo_fp', JSON.stringify(a));
  // 端末の現地日付（YYYY-MM-DD）。toISOString はUTCのため、日本時間の午前9時前に「前日」になってしまう
  const todayKey = () => { try { return new Date().toLocaleDateString('en-CA'); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  /* 総括表の正規化（表示・集計はすべてこれを通す）
     ① 店舗×日付は「最新の提出」が正 ＝ 出し直しで上書きできる／同じ日が二重に並ばない
     ② 売上0以下は「取消・未提出」扱いで出さない ＝ 誤りは0で出し直せば消える（追記式バックエンドでも訂正できる）
     ③ 未来の日付は無効 ＝ まだ来ていない日の日報は存在しえない（誤入力・取込ミスの流入を止める） */
  function skClean(arr) {
    const today = todayKey(), latest = {};
    (arr || []).forEach(r => {
      if (!r || !r.date || r.date > today) return;
      const k = (r.store || '') + '||' + r.date;
      if (!latest[k] || (Number(r.t) || 0) >= (Number(latest[k].t) || 0)) latest[k] = r;
    });
    return Object.values(latest).filter(r => (Number(r.sales) || 0) > 0);
  }
  const getSk = () => { try { return skClean(JSON.parse(localStorage.getItem('yosakura_demo_soukatsu')) || []); } catch { return []; } };
  const saveSk = (a) => localStorage.setItem('yosakura_demo_soukatsu', JSON.stringify(a));

  function seedIfEmpty() {
    if (localStorage.getItem(LS.reports)) return;
    const now = Date.now();
    saveReports([
      { kind:'a', store:'日本鰻世桜 富士山店', item:'うな重（並）', level:'half', note:{ ja:'ご飯を残されるお客様が多い', en:'Many guests leave rice', vi:'Nhiều khách để lại cơm' }, t: now-3600e3*20 },
      { kind:'a', store:'寿司世桜 心斎橋店',   item:'デザート（抹茶）', level:'third', note:{ ja:'抹茶チョコが重いとの声', en:'Matcha choco feels heavy', vi:'Socola matcha hơi ngán' }, t: now-3600e3*28 },
      { kind:'a', store:'牛カツ世桜 富士山店', item:'キャベツ', level:'little', note:'', t: now-3600e3*44 }
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
  /* 画面の下に表示する版（例：yosakura-hq-v59）。
     APP_BUILD＝いま動いているこの画面の版（同期のたびに書き換わる。デモは 'dev' のまま）。
     LATEST_BUILD＝配信されている最新の版（起動時に sw.js から読む）。
     2つが違えば「新しい版があります」と出して、その場で最新にできるようにする。
     ※ 以前は最新版の番号だけを表示していたため、端末が古い版のまま動いていても
       画面には最新の番号が出てしまい、更新が届いていないことに気づけなかった。 */
  const APP_BUILD = 'yosakura-taiken-v16';
  let LATEST_BUILD = '';
  const BUILD_TAG = APP_BUILD;
  const $app = document.getElementById('app');
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const esc = (s='') => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  /* 画面下の版表示。いつでも押せる「最新にする」を添える（誰でも自分で確かめられるように）。
     古い版のまま動いているときは、その旨をはっきり出す。 */
  function buildNote() {
    const stale = LATEST_BUILD && APP_BUILD !== 'dev' && LATEST_BUILD !== APP_BUILD;
    const btn = `<button type="button" id="appUpdate" style="margin-left:8px;padding:3px 10px;border:1px solid #d9d2c8;border-radius:999px;background:#fff;font:inherit;font-size:11px;cursor:pointer">${L({ ja:'最新にする', en:'Update', vi:'Cập nhật' })}</button>`;
    if (stale) {
      return `　<span style="color:#8E354A">${L({ ja:'新しい版があります', en:'A newer version is available', vi:'Đã có bản mới' })}（${esc(APP_BUILD)} → ${esc(LATEST_BUILD)}）</span>${btn}`;
    }
    return `　<span style="opacity:.55">${esc(APP_BUILD)}</span>${btn}`;
  }
  /* 端末に残っている古い画面を捨てて、配信中の最新を取り直す。
     お名前・役割・店舗などの設定（localStorage）は消さない。 */
  async function forceUpdate() {
    toast(L({ ja:'最新を取得しています…', en:'Fetching the latest…', vi:'Đang tải bản mới…' }));
    try {
      if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map(r => r.unregister()));
      }
    } catch (e) {}
    try {
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
    } catch (e) {}
    setTimeout(() => location.reload(), 300);
  }
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
  /* 使い方＝役割ごとに分ける。
     全員に同じ説明を出すと、店舗の方には関係のない本部の話まで並んでしまい、
     結局どれが自分のことか分からなくなるため（紙の使い方ガイドと同じ内容にしてある）。
     初回の案内（モーダル）と「使い方」の画面は、この同じ中身から作る。 */
  const G_COMMON_END = [
    { icon:'home',
      t:{ ja:'ホーム画面に追加しておく', en:'Add to Home Screen', vi:'Thêm vào màn hình chính' },
      b:{ ja:'「追加」を押すと、アプリのように世桜のロゴから開けます。毎回リンクを探さずに済みます。', en:'Tap “Add” to launch it like an app from the YOSAKURA logo.', vi:'Chạm “Thêm” để mở như ứng dụng từ logo YOSAKURA.' } },
    { icon:'check',
      t:{ ja:'画面が違って見えるときは', en:'If the screen looks different', vi:'Nếu màn hình khác' },
      b:{ ja:'いちばん下までスクロールして「最新にする」を押してください。お名前や店舗の設定は消えません。', en:'Scroll to the bottom and tap “Update”. Your name and store settings are kept.', vi:'Cuộn xuống dưới cùng và chạm “Cập nhật”. Tên và cửa hàng vẫn được giữ.' } }
  ];
  const GUIDES = {
    staff: [
      { icon:'hr', t:{ ja:'はじめに、お名前を登録', en:'Register your name first', vi:'Đăng ký tên trước' },
        b:{ ja:'右上の「店舗iPad ・ ○○店」を押して、お名前を入れてください。1回だけで、出したものに記録が残ります。', en:'Tap the chip at the top right and enter your name. Once only.', vi:'Chạm chip góc trên phải và nhập tên. Chỉ một lần.' } },
      { icon:'check', t:{ ja:'ホームの「日次業務」を開く', en:'Open “Daily tasks”', vi:'Mở “Hàng ngày”' },
        b:{ ja:'今日出すものが、出す順（開店前→営業中→閉店後）に並びます。赤い数字は、まだ出していない件数です。', en:'Today’s items are listed in the order you do them. The red number is what is left.', vi:'Các mục hôm nay xếp theo thứ tự. Số đỏ là còn lại.' } },
      { icon:'camera', t:{ ja:'「開いて提出」で出す', en:'Submit from the list', vi:'Nộp từ danh sách' },
        b:{ ja:'写真を撮って「提出する」を押すだけです。出した瞬間に本部へ届きます。（写真が無いと提出できません）', en:'Take a photo and tap Submit. It reaches HQ instantly.', vi:'Chụp ảnh và chạm Nộp. HQ nhận ngay.' } },
      { icon:'check', t:{ ja:'チェックリストもアプリで', en:'Checklists in the app', vi:'Checklist trong ứng dụng' },
        b:{ ja:'オープン／アイドル／クローズ／桜／定期衛生の5つ。手順も画面に出るので、紙やシートは開かなくて大丈夫です。', en:'Five checklists with the steps shown on screen. No paper needed.', vi:'Năm checklist kèm các bước. Không cần giấy.' } },
      { icon:'chat', t:{ ja:'良かったことも共有できます', en:'Share good stories', vi:'Chia sẻ điều tốt' },
        b:{ ja:'「みんなの投稿」に、お客様が喜ばれたことを書けます。本部が確認してから全店に届きます。', en:'Post good stories; HQ reviews them before they reach all stores.', vi:'Đăng chuyện hay; HQ duyệt trước khi đến các cửa hàng.' } }
    ],
    manager: [
      { icon:'hr', t:{ ja:'はじめに、お名前を登録', en:'Register your name first', vi:'Đăng ký tên trước' },
        b:{ ja:'右上の「店長 ・ ○○店」から。出したものに、どなたが出したかが残ります。', en:'From the chip at the top right. Submissions record who sent them.', vi:'Từ chip góc trên phải. Ghi lại ai đã nộp.' } },
      { icon:'check', t:{ ja:'今日出すものを確認して出す', en:'Check and submit today’s items', vi:'Kiểm tra và nộp hôm nay' },
        b:{ ja:'ホームの「日次業務」から。締切を過ぎたものがあると、ホームの上にお知らせが出ます。', en:'From “Daily tasks”. Overdue items appear at the top of Home.', vi:'Từ “Hàng ngày”. Quá hạn sẽ hiện ở đầu Trang chủ.' } },
      { icon:'report', t:{ ja:'日報（総括表）を出す', en:'Send the daily report', vi:'Gửi báo cáo ngày' },
        b:{ ja:'前日分を翌日のお昼までに。出すと、本部の数字にそのまま反映されます。二重に書く必要はありません。', en:'Yesterday’s figures by noon. They flow straight into HQ’s numbers.', vi:'Số liệu hôm trước trước trưa. Tự vào số liệu HQ.' } },
      { icon:'gauge', t:{ ja:'自店の数字を見る', en:'See your store’s numbers', vi:'Xem số liệu cửa hàng' },
        b:{ ja:'売上・客数・客単価・原価率と、月の目標に対する達成率が見られます。', en:'Sales, guests, spend per guest, cost rate and progress to target.', vi:'Doanh thu, khách, chi tiêu, tỷ lệ giá vốn và tiến độ.' } },
      { icon:'star', t:{ ja:'お客様の声を読む', en:'Read customer feedback', vi:'Đọc phản hồi khách' },
        b:{ ja:'サーベイの回答が1時間ごとに入ります。低い評価から順に、原文のまま読めます。', en:'Survey answers arrive hourly, lowest ratings first, in the original words.', vi:'Phản hồi vào mỗi giờ, điểm thấp trước, nguyên văn.' } },
      { icon:'check', t:{ ja:'実施状況を確認する', en:'Check what was done', vi:'Kiểm tra đã làm gì' },
        b:{ ja:'チェックリストを、どなたが何時に実施したかが分かります。声をかける前に確かめられます。', en:'See who completed each checklist and when.', vi:'Xem ai đã hoàn thành và khi nào.' } }
    ],
    owner: [
      { icon:'hr', t:{ ja:'はじめに、お名前と店舗を確認', en:'Check your name and store', vi:'Kiểm tra tên và cửa hàng' },
        b:{ ja:'右上から、見る店舗を切り替えられます。複数店をお持ちの場合は「所有店舗すべて（比較）」も選べます。', en:'Switch stores at the top right, or compare all your stores.', vi:'Đổi cửa hàng ở góc trên phải, hoặc so sánh tất cả.' } },
      { icon:'gauge', t:{ ja:'店舗の数字を見る', en:'See store numbers', vi:'Xem số liệu' },
        b:{ ja:'売上・客数・客単価・原価率。複数店をお持ちなら、店舗ごとに並べて比べられます。', en:'Sales, guests, spend and cost rate — compared across your stores.', vi:'Doanh thu, khách, chi tiêu, giá vốn — so sánh giữa các cửa hàng.' } },
      { icon:'check', t:{ ja:'提出と実施の状況を見る', en:'See submissions and checks', vi:'Xem nộp và kiểm tra' },
        b:{ ja:'その日に出ていないもの、チェックリストを誰が何時に実施したかが分かります。', en:'What is missing today, and who completed the checklists.', vi:'Còn thiếu gì hôm nay, ai đã hoàn thành checklist.' } },
      { icon:'star', t:{ ja:'お客様の声を読む', en:'Read customer feedback', vi:'Đọc phản hồi khách' },
        b:{ ja:'サーベイの評価と自由記述。ご指摘の多い順に、どこを直せばよいかが見えます。', en:'Ratings and comments, with the most common issues first.', vi:'Đánh giá và bình luận, vấn đề phổ biến trước.' } }
    ],
    hq: [
      { icon:'inbox', t:{ ja:'加盟店・提出物管理', en:'Submissions', vi:'Quản lý nộp' },
        b:{ ja:'誰が何を出していないかを自動で抽出します。「未提出の連絡文をコピー」で、そのままLINEへ貼れる文面ができます。', en:'Missing items are extracted automatically; copy a ready-made message for LINE.', vi:'Tự trích mục còn thiếu; sao chép tin nhắn cho LINE.' } },
      { icon:'gauge', t:{ ja:'本部ダッシュボード', en:'HQ dashboard', vi:'Bảng điều khiển HQ' },
        b:{ ja:'日報が出ると、そのまま全店の数字になります。転記は要りません。店舗名から個店カルテへ入れます。', en:'Daily reports become HQ numbers automatically. No re-entry.', vi:'Báo cáo ngày tự thành số liệu HQ. Không nhập lại.' } },
      { icon:'bell', t:{ ja:'お知らせを配る', en:'Send announcements', vi:'Gửi thông báo' },
        b:{ ja:'全店にも、特定の店舗にも配れます。画像と動画リンクを添えられ、重要にすると各店のホーム上部に出ます。', en:'Send to all or selected stores, with images and video links.', vi:'Gửi tất cả hoặc chọn cửa hàng, kèm ảnh và video.' } },
      { icon:'link', t:{ ja:'資料をマニュアルにひも付ける', en:'Link materials to manuals', vi:'Gắn tài liệu vào cẩm nang' },
        b:{ ja:'登録できるのは本部だけです。登録すると、店舗の皆様はマニュアルの該当項目から開けます。', en:'HQ only. Once added, stores open them from the manual.', vi:'Chỉ HQ. Sau khi thêm, cửa hàng mở từ cẩm nang.' } },
      { icon:'star', t:{ ja:'お客様サーベイを見る', en:'Customer survey', vi:'Khảo sát khách' },
        b:{ ja:'1時間ごとに自動で集まります。ご指摘の内訳と、原文のままのお客様の声が読めます。', en:'Collected hourly, with issue breakdown and original comments.', vi:'Thu thập mỗi giờ, kèm phân tích và nguyên văn.' } },
      { icon:'grad', t:{ ja:'勉強会を登録する', en:'Register study sessions', vi:'Đăng ký buổi học' },
        b:{ ja:'日程・録画・資料を登録すると、参加できなかった方も後から見られます。修正・削除も本部でできます。', en:'Add dates, recordings and materials so anyone can catch up.', vi:'Thêm lịch, ghi hình, tài liệu để xem lại.' } }
    ]
  };
  const guideFor = (role) => (GUIDES[role] || GUIDES.staff).concat(G_COMMON_END);
  function markTourDone() { localStorage.setItem('yosakura_tour_done', '1'); }
  function openTour(i) {
    i = i || 0;
    const TOUR = guideFor(getRole());   // 役割ごとの内容で案内する
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
  /* 画面の位置はアプリ側で決める。ブラウザに任せると、別の画面へ移ったのに
     前の画面の位置が復元され、途中から始まってしまう（2026-08-12 渉さんのご指摘）。 */
  try { if (window.history && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'; } catch (e) {}

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
      ${TAIKEN ? `<div class="taiken-band">${L({
        ja:'体験版｜どこを押しても大丈夫です。入力はこの端末の中だけに残り、お店の記録には送られません。',
        en:'Trial version — tap anything. Entries stay on this device and are never sent to store records.',
        vi:'Bản dùng thử — cứ chạm thoải mái. Dữ liệu chỉ lưu trên máy này, không gửi tới hồ sơ cửa hàng.' })}</div>` : ''}
      ${inner}
      <nav class="tabbar">
        ${tabs.map(([k, lbl, ic]) => `<button data-tab="${k}" class="${activeTab===k?'on':''}">${svg(ic)}${L(lbl)}</button>`).join('')}
      </nav>`;
  }

  /* ---------- ホーム ----------
     高原社長の要望＝ホームはシンプルに、よく使うものへワンクリックで届く入口に徹する。
     全機能は並べず「お知らせ／よく使う／緊急・相談／各メニューへの導線」だけを置く。
     全機能の一覧は 報告・学ぶ・本部 の各タブに残す。 */
  // 「よく使う」＝この端末で各自がピン留め（初期は空・全端末同期しない）
  const PINS_KEY = 'yosakura_home_pins';
  const getPins = () => { try { return JSON.parse(localStorage.getItem(PINS_KEY)) || []; } catch { return []; } };
  const setPins = (a) => { try { localStorage.setItem(PINS_KEY, JSON.stringify(a)); } catch (e) {} };
  const togglePin = (id) => { const p = getPins(); const i = p.indexOf(id); if (i < 0) p.push(id); else p.splice(i, 1); setPins(p); };
  // よく使うの設定シート（この端末のみ）
  function openPinSheet() {
    const role = getRole();
    const apps = APPS.filter(a => !a.hide && canOpen(a, role));
    const build = () => {
      const pins = getPins();
      return `<div class="sheet">
        <div class="grip"></div>
        <h3>${L({ ja:'よく使うを設定', en:'Set quick access', vi:'Đặt lối tắt' })}<span class="demo-tag">${L({ ja:'この端末', en:'This device', vi:'Máy này' })}</span></h3>
        <div class="sub">${L({ ja:'よく使う機能を選ぶとホームに並びます（設定はこの端末だけに保存されます）。', en:'Pinned features appear on Home (saved on this device only).', vi:'Tính năng đã ghim hiện ở Trang chủ (chỉ lưu trên máy này).' })}</div>
        ${apps.map(a => `<button class="role-opt ${pins.includes(a.id) ? 'on' : ''}" data-pin="${a.id}">
          <span class="rr">${svg(a.icon)}</span>
          <span class="ri"><b>${esc(L(a.name))}</b><span>${esc(L(a.desc))}</span></span>
          ${pins.includes(a.id) ? `<span class="rc">${svg('tick')}</span>` : ''}
        </button>`).join('')}
        <button class="btn-primary" data-done="1" style="margin-top:10px">${L({ ja:'完了', en:'Done', vi:'Xong' })}</button>
      </div>`;
    };
    const mask = el(`<div class="sheet-mask">${build()}</div>`);
    const wire = () => {
      mask.querySelectorAll('[data-pin]').forEach(b => b.onclick = () => { togglePin(b.dataset.pin); mask.querySelector('.sheet').outerHTML = build(); wire(); });
      const done = mask.querySelector('[data-done]'); if (done) done.onclick = () => { mask.remove(); render(); };
    };
    mask.addEventListener('click', (e) => { if (e.target === mask) { mask.remove(); render(); } });
    document.body.appendChild(mask); wire();
  }
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
    const tiles = (ids) => ids.map(appById).filter(a => a && !a.hide && canOpen(a, role)).map(a => tileHTML(a, role)).join('');
    const primary = tiles(getPins());
    const safety = tiles(['emergency', 'whistle']);
    // 提出・業務（日次／週次／月次）の残り件数
    const dstore = visibleStores()[0];
    const ditems = todayItemsFor(dstore);
    const remainOf = (fs) => ditems.filter(it => fs.includes(it.m.freq) && !it.manual && !it.submitted && !it.holiday).length;
    const dutyRow = (open, label, n) => `<button class="homelink" data-open="${open}">
        <span class="hl-ic">${svg('check')}</span><span class="hl-t">${L(label)}</span>
        <span class="hl-c">${n > 0 ? `<b style="color:#b23">${n}</b><small style="color:#8a8"> ${L({ ja:'件', en:'', vi:'' })}</small>` : `<small style="color:#2a7">${L({ ja:'完了', en:'Done', vi:'Xong' })}</small>`} ${svg('chev')}</span></button>`;
    /* 締切を過ぎた提出のお知らせ（アプリ内リマインド）。
       決定（7/30）＝未提出はアプリで自動通知し、それでも出なければLINE。ここはその前半。
       店舗側＝自店の超過件数／本部＝まだ出ていない店舗の数、と見せ方を変える。 */
    const overdueN = ditems.filter(it => it.overdue).length;
    const hqMissingStores = role === 'hq'
      ? STORES.filter(s => todayItemsFor(s).some(it =>
          it.m.freq === 'daily' && it.m.oblig === 'required' && it.overdue)).length
      : 0;
    const remind = (role !== 'hq' && overdueN > 0) ? `
      <button class="card news-card news-card--imp news-card--btn" data-open="kyou">
        <div class="news-h"><span class="news-ic">${svg('check')}</span><b>${L({ ja:'締切を過ぎている提出があります', en:'Overdue submissions', vi:'Có mục quá hạn' })}</b></div>
        <div class="news-title">${overdueN} ${L({ ja:'件', en:'item(s)', vi:'mục' })}</div>
        <p class="news-body">${L({ ja:'いま出せば、本部にはそのまま届きます。', en:'Submit now and it reaches HQ right away.', vi:'Nộp ngay, HQ sẽ nhận được.' })}</p>
        <span class="news-more">${L({ ja:'今日出すものを開く', en:'Open today’s list', vi:'Mở danh sách hôm nay' })} ${svg('chev')}</span>
      </button>` : (role === 'hq' && hqMissingStores > 0) ? `
      <button class="card news-card news-card--imp news-card--btn" data-open="teishutsu">
        <div class="news-h"><span class="news-ic">${svg('inbox')}</span><b>${L({ ja:'締切を過ぎている店舗があります', en:'Stores with overdue items', vi:'Cửa hàng quá hạn' })}</b></div>
        <div class="news-title">${hqMissingStores} ${L({ ja:'店舗', en:'store(s)', vi:'cửa hàng' })}</div>
        <p class="news-body">${L({ ja:'必須の提出物が、締切を過ぎても届いていません。', en:'Required submissions are past due.', vi:'Mục bắt buộc đã quá hạn.' })}</p>
        <span class="news-more">${L({ ja:'提出物管理を開く', en:'Open submissions', vi:'Mở quản lý nộp' })} ${svg('chev')}</span>
      </button>` : '';
    const dutyBlock = `<div class="homelinks">
        ${dutyRow('kyou', { ja:'日次業務', en:'Daily tasks', vi:'Hàng ngày' }, remainOf(['daily']))}
        ${dutyRow('shukan', { ja:'週次業務', en:'Weekly tasks', vi:'Hàng tuần' }, remainOf(['weekly']))}
        ${dutyRow('getsuji', { ja:'月次業務', en:'Monthly tasks', vi:'Hàng tháng' }, remainOf(['monthly', 'quarterly']))}
      </div>`;
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
    const cpost = commForView(getComm().slice().sort((a, b) => b.t - a.t))[0];
    const communityCard = cpost ? `
      <button class="card news-card news-card--btn" data-open="community">
        <div class="news-h"><span class="news-ic">${svg('chat')}</span><b>${L({ ja:'みんなの投稿', en:'Community', vi:'Cộng đồng' })}</b><span class="news-ago">${timeAgo(cpost.t)}</span></div>
        <div class="news-title">${esc(commCatLabel(cpost.cat))}</div>
        <p class="news-body">${esc(newsSnippet(cpost.body))}</p>
        ${(cpost.photos && cpost.photos.length) ? `<img class="news-thumb" src="${photoThumb(cpost.photos[0])}" alt="">` : ''}
        <span class="news-more">${commLikeN(cpost) ? `♥ ${commLikeN(cpost)} ・ ` : ''}${L({ ja:'みんなの投稿を見る', en:'See community', vi:'Xem cộng đồng' })} ${svg('chev')}</span>
      </button>` : `
      <button class="card news-card news-card--btn" data-open="community">
        <div class="news-h"><span class="news-ic">${svg('chat')}</span><b>${L({ ja:'みんなの投稿', en:'Community', vi:'Cộng đồng' })}</b></div>
        <p class="news-body">${L({ ja:'現場のグッドストーリー（お客様が喜んだこと・ファインプレー）をここで共有しましょう。', en:'Share good stories from the field here.', vi:'Chia sẻ câu chuyện hay tại đây.' })}</p>
      </button>`;
    const links = `
      <div class="homelinks">
        <button class="homelink" data-tab="genba"><span class="hl-ic">${svg('report')}</span><span class="hl-t">${L({ ja:'報告する', en:'Report', vi:'Báo cáo' })}</span><span class="hl-c">${svg('chev')}</span></button>
        <button class="homelink" data-tab="learn"><span class="hl-ic">${svg('grad')}</span><span class="hl-t">${L({ ja:'学ぶ', en:'Learn', vi:'Học tập' })}</span><span class="hl-c">${svg('chev')}</span></button>
        <button class="homelink" data-tab="other"><span class="hl-ic">${svg('dots')}</span><span class="hl-t">${L({ ja:'その他・設定', en:'More & Settings', vi:'Khác & Cài đặt' })}</span><span class="hl-c">${svg('chev')}</span></button>
        ${role === 'hq' ? `<button class="homelink" data-tab="hq"><span class="hl-ic">${svg('hq')}</span><span class="hl-t">${L({ ja:'本部メニュー', en:'HQ menu', vi:'Menu HQ' })}</span><span class="hl-c">${svg('chev')}</span></button>` : ''}
      </div>`;
    // 店舗（iPad・店長・オーナー）は「今日やること」を最初に見る＝画面の左上に置く。
    // 本部はお知らせの配信・確認が主なので、従来どおりお知らせを先頭にする。
    const dutySection = sec({ ja:'提出・業務', en:'Tasks', vi:'Nhiệm vụ' }) + dutyBlock;
    const newsSection = news + communityCard;
    const isStoreSide = role !== 'hq';
    return `
      <main class="screen">
        <div class="brandhead"><img class="brandhead__logo" src="icons/logo-full.png" alt="日本料理 世桜 -yosakura-"></div>
        ${installCardHTML()}
        ${remind}
        ${isStoreSide ? dutySection + newsSection : newsSection + dutySection}
        ${sec({ ja:'よく使う', en:'Quick access', vi:'Hay dùng' })}
        ${primary ? `<div class="grid">${primary}</div>` : ''}
        <button class="homelink" id="pinEdit"><span class="hl-ic" style="font-size:20px;text-align:center">＋</span><span class="hl-t">${primary ? L({ ja:'よく使うを編集', en:'Edit quick access', vi:'Sửa lối tắt' }) : L({ ja:'よく使う機能を追加', en:'Add quick access', vi:'Thêm lối tắt' })}</span><span class="hl-c">${svg('chev')}</span></button>
        ${safety ? sec({ ja:'緊急・相談', en:'Emergency & Report', vi:'Khẩn cấp & Tố giác' }) + `<div class="grid">${safety}</div>` : ''}
        ${sec({ ja:'メニュー', en:'Menu', vi:'Menu' })}
        ${links}
        <div class="footer-note">${L({ ja:'世桜アプリ ・ 役割と言語で表示が変わります（上部で切替）', en:'YOSAKURA app · View changes by role & language (switch at top)', vi:'Ứng dụng YOSAKURA · Hiển thị theo vai trò & ngôn ngữ (đổi ở trên)' })}${buildNote()}</div>
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
      // tabHide＝機能は生きているが、タブの一覧には出さない（日次業務など別の入口へ集約したもの）
      const apps = APPS.filter(a => a.group === gid && !a.hide && !a.tabHide && canOpen(a, role));
      if (!apps.length) continue;
      sections += `
        <div class="sec-h"><span class="bar"></span><h2>${esc(groupName(gid))}</h2></div>
        <div class="grid">${apps.map(a => tileHTML(a, role)).join('')}</div>`;
    }
    if (!sections) sections = `<div class="muted" style="text-align:center;padding:20px">${L({ ja:'表示できる項目がありません', en:'Nothing to show', vi:'Không có mục nào' })}</div>`;
    const heroBlock = `<div class="hero"><h1 class="hero__title">${L({ genba:{ja:'報告する',en:'Report',vi:'Báo cáo'}, learn:{ja:'学ぶ',en:'Learn',vi:'Học tập'}, other:{ja:'その他・設定',en:'More & Settings',vi:'Khác & Cài đặt'}, hq:{ja:'本部メニュー',en:'HQ Menu',vi:'Menu bộ phận'} }[tab])}</h1></div>`;
    // 左上の「← ホーム」は、機能の画面（viewApp）にはあってタブ一覧には無かった。
    // 画面によって有ったり無かったりすると迷うため、ホーム以外はすべて同じ位置に出す。
    const inner = `
      <main class="screen">
        <div class="appbar"><button class="back" id="backBtn">${svg('back')}${L({ ja:'ホーム', en:'Home', vi:'Trang chủ' })}</button></div>
        ${heroBlock}
        ${sections}
        <div class="footer-note">${L({ ja:'世桜アプリ ・ 役割と言語で表示が変わります（上部で切替）', en:'YOSAKURA app · View changes by role & language (switch at top)', vi:'Ứng dụng YOSAKURA · Hiển thị theo vai trò & ngôn ngữ (đổi ở trên)' })}${buildNote()}</div>
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

  /* 使い方＝いつでも読み返せる1枚（役割ごとに中身が変わる）。
     案内（初回のモーダル）と同じ内容を、順番つきで並べているだけ。
     ※ 紙の「つかいかた」と同じことを書く。紙とアプリで違うと現場が迷うため。 */
  APP_VIEWS.guide = () => {
    const role = getRole();
    const steps = guideFor(role);
    const rows = steps.map((s, i) => `
      <div class="rep">
        <span class="kind b" style="min-width:26px;text-align:center">${i + 1}</span>
        <div class="body">
          <div class="l1">${esc(L(s.t))}</div>
          <div class="l2" style="white-space:normal">${esc(L(s.b))}</div>
        </div>
      </div>`).join('');
    return `
      <div class="card">
        <h3>${L({ ja:'この端末での使い方', en:'How to use on this device', vi:'Cách dùng trên thiết bị này' })}
          <small style="color:#8a8">${esc(L(ROLES[role].label))}</small></h3>
        <p class="hint" style="display:block">${L({ ja:'いま選ばれている役割に合わせて表示しています。役割を変えると内容も変わります（右上から切替）。', en:'Shown for the current role. Switch roles at the top right to see other guides.', vi:'Hiển thị theo vai trò hiện tại. Đổi ở góc trên phải.' })}</p>
        ${rows}
        <button class="btn-primary" data-guide-tour="1" style="margin-top:10px">${L({ ja:'順番に見る（案内）', en:'Walk me through it', vi:'Xem lần lượt' })}</button>
      </div>
      <p class="hint" style="display:block">${L({ ja:'※ 同じ内容を紙（A4 1枚）でもお配りしています。', en:'The same content is also available on a one-page handout.', vi:'Nội dung tương tự cũng có bản in 1 trang.' })}</p>`;
  };

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
    const recent = getReports().filter(r => (r.kind === 'a' || r.kind === 'b') && vis.includes(r.store)).sort((x,y)=>y.t-x.t).slice(0,5);
    const segL = (arr) => arr.map((o,i)=>`<button type="button" data-v="${o.v}" class="${i===0?'on':''}">${L(o.t)}</button>`).join('');
    return `
      <div class="card" id="repForm">
        <h3>${L({ ja:'お客様の食べ残しを報告', en:'Report customer leftovers', vi:'Báo cáo khách để thừa' })}</h3>
        ${NOTE({ ja:'◆ 客席から下げた食べ残しをバックキッチン等で撮影→報告。残されやすい商品の傾向を把握します（食材ロスの入力・集計は将来対応）', en:'◆ Photograph leftovers after clearing → report. Ingredient-loss entry is a future feature.', vi:'◆ Chụp đồ thừa sau khi dọn → báo cáo. Nhập hao hụt nguyên liệu là tính năng tương lai.' })}
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
  // サーベイの「来店きっかけ」は、お客様が回答された言語のままの値で入る
  // （구글／グーグル／Instagram／인스타그램／Walk in／現場候位／đi thẳng vào／예약 없이 …）。
  // そのままではアプリの区分と一致せず集計に載らないため、ここで寄せる。判定できないものは「その他」。
  const ROUTE_ALIASES = [
    { v:'google',    re:/google|グーグル|구글|谷歌|공굴/i },
    { v:'instagram', re:/instagram|インスタ|인스타|ig\b/i },
    { v:'tiktok',    re:/tiktok|ティックトック|틱톡|抖音/i },
    { v:'referral',  re:/紹介|口コミ|referral|recommend|friend|소개|추천|giới thiệu|介紹|推薦|朋友|hotel|ホテル|酒店|호텔/i },
    { v:'walkin',    re:/walk[\s-]?in|通りがかり|飛び込み|現場|현장|예약\s*없이|đi thẳng|vãng lai|路過|店頭/i },
    { v:'repeat',    re:/repeat|リピート|再訪|재방문|khách quen|常連/i }
  ];
  const normalizeRoute = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (ROUTES.some(x => x.v === s)) return s; // アプリ内で記録した値はそのまま
    const hit = ROUTE_ALIASES.find(a => a.re.test(s));
    return hit ? hit.v : 'other';
  };
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
        <p class="hint">${L({ ja:'※ 記録は各店舗（スタッフ）が行います。記録された内容は全端末で共有され、本部にはここへ自動で集約されます。', en:'Logged by each store. Entries sync across all devices and aggregate here for HQ automatically.', vi:'Do từng cửa hàng ghi. Dữ liệu đồng bộ mọi thiết bị và tự tổng hợp cho HQ.' })}</p>`;
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
    const today = todayKey();
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
  /* ★オープン／アイドル／クローズは、本部の「オープン・クローズ・アイドルタイム チェックリスト」
     （ホール／キッチンの2系統）をそのまま実装したもの。
     項目名をチェック単位とし、シートの細目は説明として下に出す。 */
  const CHECK_GROUPS = [
    { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
      {ja:'手洗い・身だしなみ',en:'Handwash & grooming',vi:'Rửa tay & tác phong',
       d:{ja:'タイムカード打刻／手洗い（洗い場の手洗いPOP参照）／スタッフ全員の身だしなみ・手洗いを確認／開店準備中にお客様が見えたらお声がけ'}},
      {ja:'外観準備',en:'Exterior',vi:'Bên ngoài',
       d:{ja:'掃き掃除／看板準備（外観配置POP参照）／傘立て／窓ガラスをガラスクリーナーで拭き上げ'}},
      {ja:'ドリンク場の準備',en:'Drink station',vi:'Quầy đồ uống',
       d:{ja:'各種ドリンクの補充／アイスお茶／ポットのお湯／グラスの数量確認／使用する備品のセッティング'}},
      {ja:'レジの準備',en:'Register',vi:'Quầy thu ngân',
       d:{ja:'立ち上げ／お金の計算／釣り銭補充'}},
      {ja:'おしぼり準備',en:'Towels',vi:'Khăn',
       d:{ja:'おしぼりカゴに補充／予備の場所にも補充して残数確認（夏＝冷蔵庫／冬＝ウォーマー）'}},
      {ja:'清掃',en:'Cleaning',vi:'Vệ sinh',
       d:{ja:'床は掃除機・モップ／テーブルと椅子はアルコール＋ダスター／桜チェックはチェックシートに沿って'}},
      {ja:'予約確認',en:'Reservations',vi:'Đặt chỗ',
       d:{ja:'テーブルチェック（キッチンにも共有）／メッセージやアレルギーの確認'}},
      {ja:'テーブルセッティング',en:'Table setting',vi:'Bày bàn',
       d:{ja:'卓上調味料の補充と配置／メニューブック／おしぼりおき'}},
      {ja:'レジ周りの準備',en:'Around the register',vi:'Quanh quầy',
       d:{ja:'iPad 充電100%／決済端末 充電100%／販促物の補充／整理整頓'}},
      {ja:'店内照明・BGM',en:'Lighting & BGM',vi:'Ánh sáng & nhạc',
       d:{ja:'電気は必要な箇所すべてON／空調は室温を見て調整／アラームONを確認／BGM（選曲・音量）'}},
      {ja:'空気の入れ替え',en:'Ventilation',vi:'Thông gió',
       d:{ja:'窓や扉を開け、一度空気を入れ替える'}},
      {ja:'店内最終チェック（責任者）',en:'Final check (manager)',vi:'Kiểm tra cuối',
       d:{ja:'テーブル・椅子の配置／ホールから見たキッチンの整理整頓／デシャップ／レジ周り／私物や定位置にないものがないか'}},
      {ja:'朝礼',en:'Morning briefing',vi:'Họp sáng',
       d:{ja:'元気よく挨拶／共有事項／ポジション／予約確認（朝礼シートに沿って。ここで身だしなみの最終チェック）'}},
      {ja:'外観最終チェック',en:'Final exterior check',vi:'Kiểm tra ngoài',
       d:{ja:'電気がついているか／あるべき場所に設置されているか／暖簾がかかっているか'}},
      {ja:'オープン',en:'Open',vi:'Mở cửa',
       d:{ja:'「いらっしゃいませ！」と元気にお出迎え。一度きりかもしれない日本旅行で世桜を選んでくださったお客様へ、最高の和食体験を'}} ] },
    { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
      {ja:'手洗い・身だしなみ',en:'Handwash & grooming',vi:'Rửa tay & tác phong',
       d:{ja:'タイムカード打刻／手洗い／スタッフ全員の身だしなみ・手洗いを確認'}},
      {ja:'フライヤー',en:'Fryer',vi:'Bếp chiên',
       d:{ja:'蓋を開ける／電源ON／必要な備品を定位置に（油きりバット・網・トング・運ぶ用木箱）'}},
      {ja:'保温ジャー',en:'Rice warmer',vi:'Nồi giữ ấm',
       d:{ja:'釜が入っているか確認／電源ONで温める／しゃもじは水を入れて定位置に'}},
      {ja:'仕込み・在庫確認',en:'Prep & stock',vi:'Chuẩn bị & tồn kho',
       d:{ja:'前日の引き継ぎ表を見ながら在庫確認／必要な仕込みを確認'}},
      {ja:'解凍',en:'Thawing',vi:'Rã đông',
       d:{ja:'いくら／牛肉（牛カツ用）／和牛（ごはん用）／大根おろし／わさび／ゆず など'}},
      {ja:'米',en:'Rice',vi:'Cơm',
       d:{ja:'お米を洗って仕込み表の手順で炊く／前日の冷やごはんは電子レンジで温めて保温ジャーへ'}},
      {ja:'だし',en:'Dashi',vi:'Nước dùng',
       d:{ja:'出汁を仕込んでポットで温める／電源ON'}},
      {ja:'仕込み',en:'Prep',vi:'Sơ chế',
       d:{ja:'牛カツ／和牛（ごはん用）／トマト'}},
      {ja:'食材セッティング',en:'Ingredient setup',vi:'Bày nguyên liệu',
       d:{ja:'3連皿／ガリ・わさび／サラダ／だし椀（定数に合わせて）'}},
      {ja:'洗い物',en:'Dishes',vi:'Rửa bát',
       d:{ja:'すべて終わらせて営業に集中できる状態にする'}},
      {ja:'最終チェック（責任者）',en:'Final check (manager)',vi:'Kiểm tra cuối',
       d:{ja:'電源／あるべき場所への設置／仕込みとストック／洗い場のリセット／カット台・包丁のセット'}},
      {ja:'朝礼',en:'Morning briefing',vi:'Họp sáng',
       d:{ja:'元気よく挨拶／共有事項／ポジション／予約確認（朝礼シートに沿って）'}},
      {ja:'一食目の共有',en:'Share first plate',vi:'Chia sẻ món đầu',
       d:{ja:'1食目の写真の共有を忘れずに（盛り付けPOPを参考に丁寧な配置を）'}} ] },
  ];
  // クローズ（閉店）＝本部のチェックリスト（ホール／キッチン）どおり
  const CLOSE_GROUPS = [
    { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
      {ja:'外観',en:'Exterior',vi:'Bên ngoài',
       d:{ja:'店舗周辺のゴミを清掃／A看板は畳んで店内へ（コードは引きずらないよう結ぶ）／シャッターを下ろす／看板の電気を消す'}},
      {ja:'卓上調味料の補充',en:'Refill condiments',vi:'Bổ sung gia vị',
       d:{ja:'各席の卓上調味料を補充／容器を拭き、薬味スプーンは洗浄して拭く／各席にセッティング'}},
      {ja:'洗い物の回収',en:'Collect dishes',vi:'Thu dọn bát đĩa',
       d:{ja:'すべての洗い物を洗い場へ（カット場のまな板・包丁・急須も）／カット場の周辺はよく拭き掃除'}},
      {ja:'消耗品チェック',en:'Supplies check',vi:'Kiểm tra vật tư',
       d:{ja:'定数表を元に、発注が必要なものを共有'}},
      {ja:'発注管理（ドリンク）',en:'Drink ordering',vi:'Đặt đồ uống',
       d:{ja:'在庫数を確認してチェックリストに記入／撮影して「店舗×本部GLINE」で共有'}},
      {ja:'掃き掃除（ホール）',en:'Sweeping (hall)',vi:'Quét sàn',
       d:{ja:'椅子を両手で持って移動／ホール専用の箒で床を掃く／ホール全体にゴミが無いか（傘立ての中の雨水・ごみも）'}},
      {ja:'拭き掃除（テーブル・椅子）',en:'Wipe tables & chairs',vi:'Lau bàn ghế',
       d:{ja:'テーブル／椅子／テーブルの脚／荷物かご／作業台／カット場／レジカウンター（アルコール＋白いダスター）'}},
      {ja:'トイレ清掃',en:'Restroom cleaning',vi:'Vệ sinh WC',
       d:{ja:'桜チェックリストに沿って実施'}},
      {ja:'ゴミ出し',en:'Take out trash',vi:'Đổ rác',
       d:{ja:'袋をしっかり閉じて店舗前へ／段ボールは畳んで出す'}},
      {ja:'レジ締め',en:'Register close',vi:'Chốt quầy',
       d:{ja:'売上レシートとレジの金額を必ず合わせてから総括表へ入力／日計レポート（取引別・分類別）を印刷／現金売上と日計レポートを封筒へ／TIPは別の封筒／写真を撮り金庫に保管'}},
      // 2026-08-12 渉さんのご指摘：チェックリスト・日報・気づき・写真はアプリで提出すると本部へ届くため、
      // GLINEへ送り直す作業は不要になった。店舗内で確認が要るレジ関係だけを残す。
      {ja:'レジ締めの確認を店舗内で共有',en:'Share register close in store',vi:'Chia sẻ chốt quầy trong quán',
       d:{ja:'レジクローズ画面／現金売上・日計レポート・TIP封筒の写真（店舗内での確認用。本部への提出はアプリから）'}},
      {ja:'整理整頓・補充',en:'Tidy & restock',vi:'Sắp xếp & bổ sung',
       d:{ja:'レジ周りの整理整頓／販促物の補充（次の人が始めやすい環境をつくる）'}},
      {ja:'各種充電',en:'Charging',vi:'Sạc thiết bị',
       d:{ja:'iPad／スピーカー／決済端末／看板用バッテリー（電源はOFFに）'}},
      {ja:'電源OFF',en:'Power off',vi:'Tắt nguồn',
       d:{ja:'各種電気／エアコン／換気扇／ガス元栓（桜やバックヤードも確認）'}},
      {ja:'退勤・戸締り',en:'Clock out & lock up',vi:'Chấm công & khóa cửa',
       d:{ja:'退勤の打刻／シャッター・鍵を閉めてキーボックスへ（番号は必ずバラバラに）'}} ] },
    { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
      {ja:'フライヤー',en:'Fryer',vi:'Bếp chiên',
       d:{ja:'電源を落として元栓を閉める／油のカスを網で取り除く／フライヤーと周りを拭き上げ／清掃対象日は油を抜いて清掃'}},
      {ja:'ご飯・炊飯器',en:'Rice & cooker',vi:'Cơm & nồi',
       d:{ja:'残ったご飯はラップに包み日付を記入（平らに・目安300g）／ジップロックで冷凍／羽釜コンロの元栓を閉める／炊飯器・保温器は毎日洗浄（内蓋や本体も）'}},
      {ja:'ポットの洗浄',en:'Kettle',vi:'Bình nước',
       d:{ja:'コンセントを抜きお湯をシンクへ／中をすすぎ、本体も拭く'}},
      {ja:'はかりの掃除',en:'Scale',vi:'Cân',
       d:{ja:'アルコールとダスターで拭き上げ／土台との隙間も必ず（分解できる場合は分解）／定位置に戻す'}},
      {ja:'食器類の洗浄',en:'Dishes',vi:'Bát đĩa',
       d:{ja:'シンク・作業台・作業台下に洗い残しがないか／食器・グラス・調理器具が定位置か（見える箇所は段数や向きも意識）'}},
      {ja:'まな板の洗浄',en:'Cutting boards',vi:'Thớt',
       d:{ja:'漂白剤（スプレー）をかけて30分放置／しっかり洗い流し、重ならないように立てかける'}},
      {ja:'食洗機',en:'Dishwasher',vi:'Máy rửa bát',
       d:{ja:'庫内に小さなものが残っていないか／洗浄（水抜き）／天板もアルコールとダスターで拭く（水気を残さない＝異臭の原因）'}},
      {ja:'補充（食品以外）',en:'Restock (non-food)',vi:'Bổ sung (phi thực phẩm)',
       d:{ja:'洗剤／アルコール（ホール・キッチンすべて）／ハンドソープ（各容器の外側はおしぼりで毎日拭く）'}},
      {ja:'作業台の清掃',en:'Worktop',vi:'Bàn bếp',
       d:{ja:'除菌スプレーと清潔なおしぼり／汚れや水分を残さない／食器やストックを退けて上から順に'}},
      {ja:'作業台・ショーケースの清掃',en:'Worktop & showcase',vi:'Tủ trưng bày',
       d:{ja:'スポンジと洗剤で扉・取手・溝を洗う／ホースで泡を流す／ダスターで水気を取る'}},
      {ja:'キッチンの床',en:'Kitchen floor',vi:'Sàn bếp',
       d:{ja:'掃き掃除／デッキブラシと洗剤で磨く／ホースで泡を流す（作業台の下も忘れずに）'}},
      {ja:'シンクの清掃',en:'Sink',vi:'Bồn rửa',
       d:{ja:'ゴミ受けを洗い漂白剤で除菌（5分放置）／シンク内を掃除用スポンジで磨く（食器用・グラス用はNG）／泡や汚れを残さない'}},
      {ja:'ダスター類の洗浄',en:'Cloths',vi:'Khăn lau',
       d:{ja:'中性洗剤で洗浄／水と漂白剤に5分放置／バケツでまとめて洗う／絞って指定の場所に干す'}},
      {ja:'ゴミ出し',en:'Take out trash',vi:'Đổ rác',
       d:{ja:'厨房のゴミ箱／トイレのゴミ箱／段ボール（畳む・鰻の箱はパッケージが見えないように）／空き瓶（厨房内に残っていないか）'}},
      {ja:'在庫確認・整理整頓',en:'Stock & tidy',vi:'Tồn kho & sắp xếp',
       d:{ja:'消耗品はカレンダーを確認／食材は仕込み・発注・買い出しを確認／当日残数は冷蔵庫の表に記入／ついでに定位置へ戻す'}},
      // アプリで提出するもの（気づき・クローズチェックリスト）は再共有が要らなくなった
      {ja:'翌日への引き継ぎ',en:'Handover for tomorrow',vi:'Bàn giao cho hôm sau',
       d:{ja:'仕込み表（急ぎは「★」をつける）／発注の申し送り'}},
      {ja:'電源OFF',en:'Power off',vi:'Tắt nguồn',
       d:{ja:'各種電気／エアコン／換気扇／ガス元栓／食洗機（桜やバックヤードも確認）'}},
      {ja:'退勤・戸締り',en:'Clock out & lock up',vi:'Chấm công & khóa cửa',
       d:{ja:'退勤の打刻／シャッター・鍵を閉めてキーボックスへ（番号は必ずバラバラに）'}} ] }
  ];
  /* アイドルタイム＝昼営業を締めて、夜営業を開ける。本部のシートどおり「クローズ→オープン」の2部構成。 */
  const IDLE_GROUPS = [
    { g:{ja:'昼の締め（ホール）',en:'Lunch close (hall)',vi:'Đóng trưa (sảnh)'}, items:[
      {ja:'バッシング',en:'Bussing',vi:'Dọn bàn',
       d:{ja:'お客様の食べ終わった食器／カット場のまな板や包丁／その他の洗い物をすべて洗い場へ'}},
      {ja:'カスターセット',en:'Condiment set',vi:'Bộ gia vị',
       d:{ja:'各席の卓上調味料を補充／容器を拭き上げる／定位置に戻す'}},
      {ja:'カウンター・椅子',en:'Counter & chairs',vi:'Quầy & ghế',
       d:{ja:'物を退けながらアルコールとダスターで拭き上げ／床の汚れやゴミも同時に確認'}},
      {ja:'床掃除',en:'Floor',vi:'Sàn',
       d:{ja:'物を退けながらホウキで清掃'}},
      {ja:'桜チェック',en:'Sakura check',vi:'Kiểm tra WC',
       d:{ja:'桜チェックリストに基づいて掃除する'}},
      {ja:'ドリンク補充',en:'Refill drinks',vi:'Bổ sung đồ uống',
       d:{ja:'定数に合わせて補充／グラスの在庫も確認'}},
      {ja:'備品の補充',en:'Restock supplies',vi:'Bổ sung vật tư',
       d:{ja:'食べ方POP／お箸／おしぼり など'}},
      {ja:'作業台',en:'Worktop',vi:'Bàn làm việc',
       d:{ja:'物を退けながらアルコールとダスターで拭き上げ、定位置に戻す（カット台の下も忘れずに）'}},
      {ja:'洗い物',en:'Dishes',vi:'Rửa bát',
       d:{ja:'洗い物を終わらせ、洗い終わったものを定位置へ'}},
      {ja:'充電',en:'Charging',vi:'Sạc',
       d:{ja:'iPad／スピーカー／決済端末／インカム／看板は夜用のバッテリーを充電'}},
      {ja:'夜の担当への引き継ぎ',en:'Handover to evening shift',vi:'Bàn giao ca tối',
       d:{ja:'中間報告／引き継ぎ事項／仕込みの状況'}} ] },
    { g:{ja:'昼の締め（キッチン）',en:'Lunch close (kitchen)',vi:'Đóng trưa (bếp)'}, items:[
      {ja:'洗い物',en:'Dishes',vi:'Rửa bát',
       d:{ja:'すべての洗い物を終わらせる／しゃもじやトングも一度すべて洗う'}},
      {ja:'鉄板（牛カツ）',en:'Griddle (gyukatsu)',vi:'Vỉ nướng',
       d:{ja:'緑のスポンジで焦げを取る（水洗い）／定期清掃リストに沿って週1回は金たわしで洗う'}},
      {ja:'作業台のリセット',en:'Reset worktop',vi:'Dọn bàn bếp',
       d:{ja:'物を退けてアルコールとダスターで拭き上げ／洗ったものもすべて定位置へ'}},
      {ja:'在庫確認・共有',en:'Stock & share',vi:'Tồn kho & chia sẻ',
       d:{ja:'在庫と仕込みを確認／引き継ぎ事項があればGLINEで共有'}},
      {ja:'夜営業の仕込み',en:'Prep for dinner',vi:'Chuẩn bị tối',
       d:{ja:'牛カツ／和牛（ごはん用）／トマト／米／だし／三つ葉／キャベツ'}} ] },
    { g:{ja:'夜の開店準備',en:'Dinner open',vi:'Mở ca tối'}, items:[
      {ja:'手洗い・身だしなみ',en:'Handwash & grooming',vi:'Rửa tay & tác phong',
       d:{ja:'タイムカード打刻／手洗い／全員の身だしなみを確認／準備中にお客様が見えたらお声がけ'}},
      {ja:'外観準備',en:'Exterior',vi:'Bên ngoài',
       d:{ja:'掃き掃除／看板準備（バッテリーも）／傘立て／窓ガラスの拭き上げ'}},
      {ja:'テーブルセッティング',en:'Table setting',vi:'Bày bàn',
       d:{ja:'卓上調味料の補充と配置／メニューブック／おしぼりおき'}},
      {ja:'ドリンク場の準備',en:'Drink station',vi:'Quầy đồ uống',
       d:{ja:'各種ドリンクの補充／アイスお茶／ポットのお湯／グラスの数量確認'}},
      {ja:'レジの準備',en:'Register',vi:'Quầy thu ngân',
       d:{ja:'立ち上げ／お金の計算／釣り銭補充／iPadと決済端末の充電100%／販促物の補充'}},
      {ja:'店内照明・BGM',en:'Lighting & BGM',vi:'Ánh sáng & nhạc',
       d:{ja:'電気／空調／BGM（選曲・音量）／アラームON／インカムの電源ON'}},
      {ja:'店内最終チェック（責任者）',en:'Final check (manager)',vi:'Kiểm tra cuối',
       d:{ja:'テーブル・椅子の配置／キッチンとデシャップの整理整頓／レジ周り／私物が出ていないか'}},
      {ja:'キッチンの手伝い・定期清掃',en:'Help kitchen / periodic cleaning',vi:'Hỗ trợ bếp / vệ sinh định kỳ',
       d:{ja:'キッチンの仕込みを手伝う／定期清掃リストの本日分の残りを実施／時間が余ればお手すきチェックリスト'}},
      {ja:'朝礼',en:'Briefing',vi:'Họp ca',
       d:{ja:'挨拶／共有事項／ポジション／予約確認（ここで身だしなみの最終チェック）'}},
      {ja:'外観最終チェック',en:'Final exterior check',vi:'Kiểm tra ngoài',
       d:{ja:'電気／設置場所／暖簾がかかっているか'}} ] }
  ];
  /* 桜チェック＝トイレの清掃（本部の「桜チェックシート」より）。
     お店の裏の顔。他が綺麗でも桜が汚いと全体の印象が落ちる、という位置づけ。
     HACCPの一般衛生管理（施設衛生管理）の記録としても使う。 */
  const SAKURA_GROUPS = [
    { g:{ja:'営業中の見回り',en:'During service',vi:'Trong giờ phục vụ'}, items:[
      {ja:'便器：便座・蓋・ペーパーホルダーを拭く（汚れが目立つ場合は洗剤で洗浄）',en:'Toilet: wipe seat, lid, paper holder',vi:'Bồn cầu: lau bệ, nắp, giá giấy'},
      {ja:'洗面台：鏡や洗面台まわりの水滴を拭き取る',en:'Basin: wipe water drops on mirror and basin',vi:'Bồn rửa: lau nước đọng'},
      {ja:'消耗品：紙は残り1/3で交換・石鹸・ペーパータオルは半分で補充・芳香剤の残量',en:'Refill paper (at 1/3), soap, towels (at 1/2), check air freshener',vi:'Bổ sung giấy, xà phòng, khăn, kiểm tra thơm phòng'},
      {ja:'全体：ゴミの処理、床の汚れ・臭気・異常がないか',en:'Overall: trash, floor stains, odor, anything unusual',vi:'Tổng thể: rác, sàn, mùi, bất thường'},
      {ja:'清掃後は必ず手を洗う',en:'Always wash hands after cleaning',vi:'Luôn rửa tay sau khi dọn'} ] },
    { g:{ja:'開店前・アイドルタイム・閉店時',en:'Open / idle / close',vi:'Mở cửa / giữa ca / đóng cửa'}, items:[
      {ja:'便器：洗剤で内側を洗浄／外側・便座の裏・蝶番まで拭き取る',en:'Toilet: wash inside; wipe outside, under seat, hinges',vi:'Bồn cầu: rửa trong, lau ngoài & bản lề'},
      {ja:'コード：後ろ側のコードの上の埃を拭き取る',en:'Cords: wipe dust on cords behind',vi:'Dây điện: lau bụi'},
      {ja:'換気扇：カバーの埃を拭き取る',en:'Vent: wipe dust off the cover',vi:'Quạt hút: lau bụi nắp'},
      {ja:'洗面台：洗剤で洗浄／蛇口・排水口も拭く',en:'Basin: wash; wipe tap and drain',vi:'Bồn rửa: rửa, lau vòi & thoát nước'},
      {ja:'床：モップ掛けまたは拭き掃除',en:'Floor: mop or wipe',vi:'Sàn: lau'},
      {ja:'鏡：ガラスクリーナーで水滴・指紋を落とす',en:'Mirror: remove drops and prints',vi:'Gương: lau vết nước & vân tay'},
      {ja:'ドアノブ：アルコールで拭き取り（扉全体・周辺の壁も）',en:'Door handle: wipe with alcohol (door & wall too)',vi:'Tay nắm: lau cồn (cả cửa & tường)'},
      {ja:'消耗品：紙・石鹸・ペーパータオル・芳香剤の補充',en:'Refill paper, soap, towels, air freshener',vi:'Bổ sung giấy, xà phòng, khăn, thơm phòng'},
      {ja:'ゴミ：ゴミ袋の交換と周辺の清掃',en:'Trash: change bag & clean around',vi:'Rác: thay túi & dọn quanh'},
      {ja:'臭気：芳香剤の設置と換気の状況',en:'Odor: air freshener & ventilation',vi:'Mùi: thơm phòng & thông gió'},
      {ja:'異常：水漏れ・詰まり・破損がないか（あれば即報告）',en:'Issues: leaks, clogs, damage (report at once)',vi:'Bất thường: rò rỉ, tắc, hỏng (báo ngay)'},
      {ja:'清掃後は必ず手を洗う',en:'Always wash hands after cleaning',vi:'Luôn rửa tay sau khi dọn'} ] }
  ];
  /* 定期衛生管理＝曜日ごとに決められた箇所を清掃し、1週間でお店全体を1周する。
     掃除は上から下の順（ホコリは上から下へ落ちるため）。
     手が空いていれば他の曜日を先に実施してもよい＝画面で曜日を切り替えられるようにする。 */
  const HYGIENE_DAYS = [
    // 0=日曜
    { d:0, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'高度な機材（扉・LED）',d:{ja:'高度な機材の清掃方法マニュアルに沿って行う'}},
        {ja:'製氷機',d:{ja:'側面と扉の中を拭く／パッキンは所定の方法で／フィルターとその周辺／スコップは洗剤で洗って拭く／氷を全部出して中をアルコールで拭く'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'荷物かご',d:{ja:'洗えるものは洗ってしっかり乾かす／洗えないものはアルコールと水拭きで／収納スペースもリセット'}},
        {ja:'収納スペースの整理整頓',d:{ja:'全部退けて拭く／いるものといらないものを分ける／定位置に収納／テプラが剥がれていたら貼り直す'}} ] } ] },
    { d:1, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'ゴミ箱の洗浄',d:{ja:'キッチンとトイレのゴミ箱／全体にマジックリン／不要なスポンジで磨く（特に底）／水で流し、逆さにして水気を切る'}},
        {ja:'冷蔵庫（内部・外部）',d:{ja:'中身を全部出す／ダスターを湿らせアルコールで拭く／ストック用ケースはシンクで洗浄／戻す時に汚れていれば拭く／外側の扉も'}},
        {ja:'冷蔵庫（フィルター）',d:{ja:'取り外してシンクで洗い流す（落ちなければ中性洗剤）／乾かしてから戻す'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'壁から出ている部分の埃取り',d:{ja:'照明・防犯カメラ・棚・格子やレールなど。店内を見渡して最低7カ所／机や椅子の裏側も'}},
        {ja:'窓・扉の拭き上げ',d:{ja:'上から順に／ガラスはガラスクリーナーとマイクロファイバー／扉上のバネやベル、取手の埃もアルコールで'}} ] } ] },
    { d:2, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'ダクト・油うけ',d:{ja:'電源OFFにしてフィルター・カバー・油受けを外す／ケミクール等で洗う／ダクト内の溝や壁も拭く／最後にアルコールで（客席から見える面は水垢に注意）'}},
        {ja:'電子レンジの清掃',d:{ja:'外側（取っ手・ガラス面・本体上・側面）と内側（ガラス面・天井・側面・底）／中性洗剤で拭き取り→水拭き→乾燥／設置場所の周りと下も'}},
        {ja:'収納棚の清掃・整頓',d:{ja:'全部退けて拭く／いる・いらないを分ける／定位置に収納／テプラの貼り直し'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'掃除道具の確認・清掃',d:{ja:'破損や汚れを確認し、清潔で安全に使える状態に／倉庫内を全部出して清掃／使いやすい配置に／テプラの貼り直し'}},
        {ja:'収納かごを全部洗う',d:{ja:'洗えるものは洗ってしっかり乾かす／洗えないものはアルコールか水拭きで'}},
        {ja:'作業台の拭き上げ・整理整頓',d:{ja:'全部退けて拭く／いる・いらないを分ける／定位置に収納／テプラの貼り直し'}} ] } ] },
    { d:3, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'食器類のケース・破損確認',d:{ja:'食器を出してケース内をアルコールで拭く／戻してテプラを貼り直す／ひび割れや破損がないか確認'}},
        {ja:'冷凍庫（内部・外部）',d:{ja:'中身を全部出す／ダスターを湿らせアルコールで拭く／ストック用ケースはシンクで洗浄／外側の扉も'}},
        {ja:'冷凍庫（フィルター）',d:{ja:'取り外してシンクで洗い流す／乾かしてから戻す'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'レジカウンター周辺',d:{ja:'レジ周りの埃／整理整頓／アルコールで全体を拭く／金銭トレイ・チラシ立ても／カウンターの後ろも／傘立ては水を捨てて掃除'}},
        {ja:'バックヤード',d:{ja:'何がどこにあるか見て分かるように整理し、名称を表示／昼と夜の物を分ける／使ったものは必ず元に戻す'}},
        {ja:'壁から出ている部分の埃取り',d:{ja:'照明・防犯カメラ・棚・格子やレールなど（最低7カ所）／机や椅子の裏側も'}} ] } ] },
    { d:4, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'グリストラップ',d:{ja:'柄杓で浮いた油を取りザルでゴミを取る／カゴ内のゴミを捨てる／ブラシでカゴとグリスト内を洗浄／水が透明になったら部品を戻して蓋（必ず換気。油の廃棄方法に注意）'}},
        {ja:'ゴミ箱の洗浄',d:{ja:'キッチンとトイレのゴミ箱／マジックリンをかけて磨く（特に底）／水で流して逆さに'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'カーテン・暖簾',d:{ja:'カーテンは外さず、下の部分を洗剤入りの水でもみ洗い／暖簾は湿らせたダスターに洗剤をつけて汚れを取る／レールや金具も'}},
        {ja:'エアコンの吹き出し口',d:{ja:'フィルターが外れれば外して洗浄、外れなければアルコールで拭く／埃が落ちるので清掃後はカウンターや床も掃除'}} ] } ] },
    { d:5, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'冷蔵冷凍庫（パッキン）',d:{ja:'全部外してお湯＋ケミクールに漬ける／外した箇所をアルコールで拭く／漬けたパッキンをブラシで洗う／水気を取ってから戻す'}},
        {ja:'ストッカー',d:{ja:'中身を全部出し結露を取ってアルコールで拭く／パッキンも同様に／取り出しやすく戻す／フィルターとその周り／コンセントの埃も'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'ラック（バッシング用）',d:{ja:'湿らせたダスター＋アルコールで内側・外側を細かく拭く／汚れを放置すると落ちにくくなる'}},
        {ja:'照明',d:{ja:'切れているところがないか確認／カバーや埋め込み部分の埃を拭く（熱いと割れるので電気を消してから）'}},
        {ja:'床・階段',d:{ja:'ほうきで埃とゴミを除去／モップか床用洗剤で拭く／階段は上から下へ（手すりも）／水分を残さない（破損やぐらつきは責任者へ報告）'}} ] } ] },
    { d:6, g:[
      { g:{ja:'キッチン',en:'Kitchen',vi:'Bếp'}, items:[
        {ja:'ポットの洗浄',d:{ja:'専用の洗浄剤を使用方法に従って／本体もアルコールで拭く（放置すると汚れが落ちなくなり故障の原因に）'}},
        {ja:'シンク下・作業台下',d:{ja:'下の物を全部出す／アルコールで汚れを拭き取る／出した物が汚れていれば拭く／元に戻す（全部出さないときれいにならない）'}} ] },
      { g:{ja:'ホール',en:'Hall',vi:'Sảnh'}, items:[
        {ja:'外看板の清掃',d:{ja:'フィルムやフレームを拭き上げ／同時に外観の清掃も／コンセントの故障やポスターの色褪せも確認'}},
        {ja:'椅子',d:{ja:'フレームや脚を拭き上げ／足を乗せる場所の黒ずみは必ず落とす／脚裏のアジャスターやクッションが取れていないか'}} ] } ] }
  ];
  const CK_COMMON = { open: CHECK_GROUPS, idle: IDLE_GROUPS, close: CLOSE_GROUPS, sakura: SAKURA_GROUPS };
  // 定期衛生は曜日で内容が変わる。表示中の曜日（既定＝今日）で切り替える
  /* 表示する曜日。既定は「今日」。
     手が空いていれば他の曜日を先に実施してもよい運用のため切り替えも残すが、
     日をまたいだら今日へ戻す（前日に選んだ曜日のまま開くと、今日の箇所を見落とすため）。
     ※ 以前は未選択のとき Number(null)=0 となり、何曜日でも必ず日曜の箇所が開いていた。 */
  const getHygDay = () => {
    const [day, v] = String(localStorage.getItem('yosakura_hygday') || '').split('|');
    const n = Number(v);
    return (day === todayKey() && Number.isInteger(n) && n >= 0 && n <= 6) ? n : new Date().getDay();
  };
  /* 定期衛生は曜日で中身が変わる。
     ★曜日を省いたときは「今日の曜日」を使う（2026-08-12）。
       画面では別の曜日を選んで見られるようにしているが、提出できているかの判定まで
       その選択に引きずられると、今日やるべき箇所が終わっていないのに終わったことになる。 */
  const ckGroupsOf = (mode, hygDay) => mode === 'hygiene'
    ? ((HYGIENE_DAYS.find(x => x.d === (hygDay == null ? new Date().getDay() : hygDay)) || {}).g || [])
    : (CK_COMMON[mode] || []);
  const WDAY_LABELS = [{ja:'日',en:'Sun',vi:'CN'},{ja:'月',en:'Mon',vi:'T2'},{ja:'火',en:'Tue',vi:'T3'},{ja:'水',en:'Wed',vi:'T4'},{ja:'木',en:'Thu',vi:'T5'},{ja:'金',en:'Fri',vi:'T6'},{ja:'土',en:'Sat',vi:'T7'}];
  const CK_MODES = [
    { v:'open',   t:{ ja:'オープン', en:'Opening', vi:'Mở cửa' } },
    { v:'idle',   t:{ ja:'アイドル', en:'Idle time', vi:'Giữa ca' } },
    { v:'close',  t:{ ja:'クローズ', en:'Closing', vi:'Đóng cửa' } },
    { v:'sakura', t:{ ja:'桜（トイレ）', en:'Sakura (restroom)', vi:'Sakura (WC)' } },
    { v:'hygiene',t:{ ja:'定期衛生', en:'Periodic hygiene', vi:'Vệ sinh định kỳ' } }
  ];
  // モードごとの注意書き（現場が迷いやすいところだけ）
  const CK_NOTES = {
    idle:   { ja:'※ アイドルタイムは「昼の営業を締めて、夜の営業を開ける」流れです。上から順に進めてください。', en:'Idle time closes lunch service and opens dinner service. Work top to bottom.', vi:'Giữa ca: đóng ca trưa và mở ca tối. Làm từ trên xuống.' },
    sakura: { ja:'※ 便器用の清掃具と鏡用の布は、他と分けて使ってください。清掃後は厨房に戻る前に手を洗い、靴裏の汚れを持ち込まないようにしてください。', en:'Use separate tools for the toilet bowl and the mirror. Wash hands before returning to the kitchen.', vi:'Dùng dụng cụ riêng cho bồn cầu và gương. Rửa tay trước khi vào bếp.' },
    hygiene:{ ja:'※ 曜日ごとに決められた箇所を清掃し、1週間でお店全体を1周します。掃除は上から下の順に（ホコリは上から落ちるため）。手が空いていれば、他の曜日を先に実施しても大丈夫です。', en:'Each weekday has its own spots; one week covers the whole store. Clean top-down. You may do another day’s items if you have time.', vi:'Mỗi thứ có khu vực riêng; một tuần phủ toàn bộ. Lau từ trên xuống.' }
  };
  const getCkMode = () => { const v = localStorage.getItem('yosakura_ckmode'); return CK_MODES.some(m => m.v === v) ? v : 'open'; };
  // 店舗独自項目（店長・オーナーが追加）＝店舗×モードごと・全端末同期
  const getCkItems = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_ckitem')) || {}; } catch { return {}; } };
  const saveCkItems = (o) => { try { localStorage.setItem('yosakura_demo_ckitem', JSON.stringify(o)); } catch (e) {} };
  const ckCustom = (store, mode) => getCkItems()[`${store}||${mode}`] || [];
  // チェック状態＝店舗×モード×日付（日付が変わると自動で新しい一日になる）
  const getCkDone = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_ckdone')) || {}; } catch { return {}; } };
  const saveCkDone = (o) => { try { localStorage.setItem('yosakura_demo_ckdone', JSON.stringify(o)); } catch (e) {} };
  const ckDoneKey = (store, mode) => `${store}||${mode}||${todayKey()}`;
  const ckCanEdit = () => ['manager','owner','hq'].includes(getRole());
  // 誰がいつ実施したか（全端末共有）。チェックの中身とは別に持つ（IDと混ざらないように）
  const getCkMeta = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_ckmeta')) || {}; } catch { return {}; } };
  /* その店舗×モードで「いま画面に出ている項目」のIDを、画面と同じ手順で作る。
     ★数えるものを1か所に集約する理由（2026-08-12）：
       以前は「保存されているチェックの数」を数えていたため、
       あとから消した店舗独自の項目や、別の曜日の定期衛生のチェックまで数に入り、
       実際には終わっていないのに終わったように見えることがあった。 */
  const ckIdsOf = (store, mode, hygDay) => {
    const d = hygDay == null ? new Date().getDay() : hygDay; // 省いたら今日の曜日
    const idBase = mode === 'hygiene' ? `${mode}-${d}` : mode;
    const ids = [];
    ckGroupsOf(mode, d).forEach((gr, gi) => gr.items.forEach((_, ii) => ids.push(`${idBase}-c-${gi}-${ii}`)));
    return ids.concat(ckCustom(store, mode).map(c => c.id));
  };
  // その店舗×モードの項目数（本部共通＋店舗独自）
  const ckTotalOf = (store, mode) => ckIdsOf(store, mode).length;
  const ckDoneCountOf = (store, mode) => {
    const done = getCkDone()[ckDoneKey(store, mode)] || {};
    return ckIdsOf(store, mode).filter(id => done[id]).length;
  };
  // 全部終わっているか（提出済みの判定はこれを使う）
  const ckAllDoneOf = (store, mode, dayKey) => {
    const ids = ckIdsOf(store, mode);
    if (!ids.length) return false;
    const done = getCkDone()[`${store}||${mode}||${dayKey || todayKey()}`] || {};
    return ids.every(id => !!done[id]);
  };

  /* オーナー・本部が複数店舗を見るとき＝各店の本日の実施状況を一覧する
     （店舗の画面では従来どおりチェックを付ける画面を出す） */
  function ckOverview(vis) {
    const row = (store) => {
      const cells = CK_MODES.map(m => {
        const total = ckTotalOf(store, m.v) || 1;
        const n = ckDoneCountOf(store, m.v);
        const meta = getCkMeta()[ckDoneKey(store, m.v)] || {};
        const pct = Math.round(n / total * 100);
        const col = n === 0 ? '#a23b3b' : (n >= total ? '#2a7' : 'inherit');
        return `<div class="dcell${n ? '' : ' off'}">
          <span class="dk">${esc(L(m.t))}</span>
          <b class="dv" style="color:${col}">${n}/${total}</b>
          <span class="dk" style="display:block">${meta.by ? esc(meta.by) + ' ・ ' + timeAgo(meta.t) : L({ ja:'未実施', en:'Not started', vi:'Chưa làm' })}</span>
        </div>`;
      }).join('');
      return `<div class="card"><h3 style="font-size:13px">${esc(storeLabel(store))}</h3><div class="dgrid">${cells}</div></div>`;
    };
    return `
      ${NOTE({ ja:'◆ 各店の本日の点検状況です。どなたが実施したかも表示します（チェックは各店舗の画面で行います）', en:'◆ Today\'s check status by store, including who did it', vi:'◆ Tình trạng kiểm tra hôm nay theo cửa hàng' })}
      ${vis.map(row).join('')}
      <div class="hint">${L({ ja:'※ 実施状況は全端末で共有されます。「未実施」が続く店舗は、朝礼などでご確認ください。', en:'Status is shared across devices. Follow up with stores showing “Not started”.', vi:'Trạng thái được đồng bộ. Hãy nhắc các cửa hàng chưa làm.' })}</div>`;
  }

  APP_VIEWS.checklist = () => {
    const vis = visibleStores();
    if (vis.length > 1) return ckOverview(vis); // オーナー（所有店舗すべて）・本部（全店）
    const store = visibleStores()[0];
    const mode = getCkMode();
    const hygDay = getHygDay(); // 画面は「選んだ曜日」を出す（判定は今日の曜日を使う＝ckIdsOfの既定）
    const groups = ckGroupsOf(mode, hygDay);
    const custom = ckCustom(store, mode);
    const done = getCkDone()[ckDoneKey(store, mode)] || {};
    const editable = ckCanEdit();
    // 定期衛生は曜日ごとに内容が違うため、チェックのIDにも曜日を入れる（別の曜日と混ざらないように）
    const idBase = mode === 'hygiene' ? `${mode}-${hygDay}` : mode;
    // 数えるものは ckIdsOf に集約（「今日出すもの」の判定と必ず同じ数え方になるように）
    const allIds = ckIdsOf(store, mode, hygDay);
    const total = allIds.length || 1;
    const n = allIds.filter(id => done[id]).length;
    const groupsHTML = groups.map((gr, gi) => `
      <div class="sec-h" style="margin:16px 2px 6px"><span class="bar"></span><h2 style="font-size:13px">${esc(L(gr.g))}</h2></div>
      <div class="card" style="padding:4px 14px">
        ${gr.items.map((it, ii) => { const id = `${idBase}-c-${gi}-${ii}`; return `<div class="check ${done[id]?'done':''}" data-ck="${id}"><span class="box">${svg('tick')}</span><span class="lbl">${esc(L(it))}${it.d ? `<small style="display:block;color:var(--gray);font-weight:400;line-height:1.5;margin-top:3px">${esc(L(it.d))}</small>` : ''}</span></div>`; }).join('')}
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
        <h3>${L({ ja:'本日の', en:'Today: ', vi:'Hôm nay: ' })}${esc(L((CK_MODES.find(m => m.v === mode) || {}).t || ''))}${L({ ja:'点検', en:' check', vi:'' })}</h3>
        <div class="muted" style="margin:2px 0 8px">${esc(store)}</div>
        ${mode === 'hygiene' ? `<div class="seg" data-seg="hygday" style="margin:6px 0 10px">${WDAY_LABELS.map((w, i) => `<button type="button" data-hygday="${i}" class="${i===getHygDay()?'on':''}">${L(w)}</button>`).join('')}</div>` : ''}
        <div style="font-size:26px;font-weight:700;letter-spacing:.02em">${n}<span style="color:var(--gray);font-size:17px">/${total}</span></div>
        <div class="bar-track" style="margin:9px 0 2px"><div class="bar-fill" style="width:${Math.round(n/total*100)}%"></div></div>
      </div>
      ${groupsHTML}
      ${customHTML}
      ${CK_NOTES[mode] ? `<div class="hint" style="display:block">${L(CK_NOTES[mode])}</div>` : ''}
      <div class="hint">${L({ ja:'上から順に実施すれば完了です。チェックは店舗ごと・当日分として保存されます（翌日は自動でリセット）。実施状況は本部・オーナーからも確認できます。', en:'Work top to bottom. Checks are saved per store for today (auto-resets next day) and visible to HQ/owners.', vi:'Làm từ trên xuống. Lưu theo cửa hàng cho hôm nay; HQ/chủ có thể xem.' })}</div>`;
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
    { ic:'book',  gyotai:'all', roles:['all'],               gid:'philosophy', t:{ja:'世桜とは・理念',en:'Brand & Philosophy',vi:'Thương hiệu & Triết lý'}, s:{ja:'5つの価値／ビジョン／ブランドコア',en:'5 values / vision / brand core',vi:'5 giá trị / tầm nhìn'} },
    { ic:'star',  gyotai:'all', roles:['all'],               gid:'service', t:{ja:'接客・ホール',en:'Service & Hall',vi:'Phục vụ & Sảnh'}, s:{ja:'おもてなし／営業中の優先順位／世桜BOOK案内',en:'Hospitality / priorities / guide',vi:'Hiếu khách / ưu tiên'} },
    { ic:'camera',gyotai:'all', roles:['all'],               gid:'serving', t:{ja:'提供時のあるべき姿',en:'Serving standards',vi:'Chuẩn phục vụ'}, s:{ja:'盛り付け・グラム規定・提供基準（最重要）',en:'Plating, grams, serving rules (key)',vi:'Trình bày, định lượng (quan trọng)'} },
    { ic:'check', gyotai:'all', roles:['all'],               gid:'cleaning', t:{ja:'清掃',en:'Cleaning',vi:'Vệ sinh'}, s:{ja:'清掃基準／好事例（ウタマロ等）',en:'Cleaning standards / good practices',vi:'Chuẩn vệ sinh / thực hành tốt'} },
    { ic:'video', gyotai:'all', roles:['all'],               gid:'hygiene', t:{ja:'衛生管理・身だしなみ',en:'Hygiene & grooming',vi:'Vệ sinh & tác phong'}, s:{ja:'身だしなみ／手洗い／食中毒対策',en:'Grooming / handwash / food safety',vi:'Tác phong / rửa tay / an toàn TP'} },
    { ic:'grad',  gyotai:'all', roles:['staff','manager'],   gid:'sevendays', t:{ja:'7DAYS（新人教育）',en:'7DAYS (onboarding)',vi:'7DAYS (đào tạo)'}, s:{ja:'7DAYS研修（1〜7日目・活用）／ハウスルール／朝礼',en:'7DAYS (day1-7) / house rules / morning brief',vi:'7DAYS / nội quy / họp sáng'} },
    { ic:'star',  gyotai:'all', roles:['all'],               gid:'survey', t:{ja:'サーベイ運用',en:'Survey operation',vi:'Vận hành khảo sát'}, s:{ja:'iPad案内／回答の取り方',en:'iPad guidance / collecting answers',vi:'Hướng dẫn iPad'} },
    { ic:'table', gyotai:'all', roles:['manager','owner'],   gid:'storeops', t:{ja:'店舗運営',en:'Store operations',vi:'Vận hành cửa hàng'}, s:{ja:'タイムカード・シフト・鍵管理',en:'Timecard / shift / key management',vi:'Chấm công / ca / chìa khóa'} },
    { ic:'yen',   gyotai:'all', roles:['owner'],             gid:'owner', t:{ja:'オーナー向け経営',en:'Owner: management',vi:'Chủ: quản lý'}, s:{ja:'キャリアアップ実践ガイド／経営の考え方',en:'Career path / management',vi:'Thăng tiến / quản lý'} },
    { ic:'hq',    gyotai:'all', roles:['hq'],                gid:'hq', t:{ja:'本部運用',en:'HQ operations',vi:'Vận hành HQ'}, s:{ja:'研修トレーナー育成／7DAYS研修プログラム／権限',en:'Trainer dev / 7DAYS program / perms',vi:'Đào tạo trainer / 7DAYS / quyền'} },
    { ic:'food',  gyotai:'unagi',    roles:['all'], t:{ja:'鰻の焼成・タレ',en:'Eel grilling & sauce',vi:'Nướng lươn & sốt'}, s:{ja:'あぶり直し／タレ／提供の説明',en:'Re-grilling / sauce / explanation',vi:'Nướng lại / sốt / giải thích'} },
    { ic:'food',  gyotai:'sushi',    roles:['all'], t:{ja:'寿司オペレーション',en:'Sushi operation',vi:'Vận hành sushi'}, s:{ja:'シャリ／握り／衛生',en:'Rice / nigiri / hygiene',vi:'Cơm / nắm / vệ sinh'} },
    { ic:'food',  gyotai:'gyukatsu', roles:['all'], t:{ja:'牛カツの提供基準',en:'Gyukatsu serving',vi:'Phục vụ gyukatsu'}, s:{ja:'揚げ／断面／盛り付け（和牛のみ使用）',en:'Frying / cut / plating',vi:'Chiên / lát cắt / trình bày'} },
    { ic:'food',  gyotai:'wagyu',    roles:['all'], t:{ja:'和牛の扱い',en:'Wagyu handling',vi:'Xử lý wagyu'}, s:{ja:'カット／藁焼き／保管',en:'Cutting / straw-grill / storage',vi:'Cắt / nướng rơm / bảo quản'} },
    { ic:'food',  gyotai:'washoku',  roles:['all'], t:{ja:'日本料理コース',en:'Japanese course',vi:'Set Nhật'}, s:{ja:'おまかせの流れ／季節の献立',en:'Omakase flow / seasonal menu',vi:'Quy trình omakase'} }
  ];
  const manualVisibleRole = (m, role) => role === 'hq' || m.roles.includes('all') || m.roles.includes(role);
  // マニュアルの大項目リスト（本部が資料をここへ振り分ける。順番＝◀▶で切り替わる順）
  const MANUAL_GROUPS = MANUAL_CATALOG.filter(m => m.gid).map(m => ({ v: m.gid, t: m.t }));
  const mgroupLabel = (v) => { const g = MANUAL_GROUPS.find(x => x.v === v); return g ? L(g.t) : L({ ja:'未分類', en:'Unsorted', vi:'Chưa phân loại' }); };
  // Google文書を読み取り専用ビューアで開くURLへ変換（/edit... → /preview）。非本部は編集画面に入れない。
  const roViewUrl = (u) => String(u || '').replace(/\/edit\b[^#]*(#.*)?$/, '/preview');
  const manualRow = (m) => {
    const mats = m.gid ? getLinks().filter(l => l.mcat === m.gid).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))) : [];
    const roForRole = getRole() !== 'hq'; // 本部以外は読み取り専用で開く
    const head = `<div class="mrow"${mats.length ? '' : ' data-mock="1"'}><div class="mi">${svg(m.ic)}</div><div class="mt"><b>${esc(L(m.t))}</b><span>${esc(L(m.s))}</span></div><span class="chev">${mats.length ? `<small style="color:#8a8">${L({ ja:'資料', en:'Docs', vi:'TL' })}${mats.length}</small>` : svg('chev')}</span></div>`;
    const subs = mats.map(l => { const ou = roForRole ? roViewUrl(l.url) : l.url; return `<div class="mrow mrow--sub" data-openurl="${esc(ou)}" style="padding-left:22px"><div class="mi">${svg('link')}</div><div class="mt"><b>${esc(l.title)}</b><span>${l.desc ? esc(l.desc) + ' ・ ' : ''}${L({ ja: roForRole ? '閲覧専用で開く' : 'タップで開く', en: roForRole ? 'Open (read-only)' : 'Tap to open', vi: roForRole ? 'Mở (chỉ đọc)' : 'Chạm để mở' })}</span></div><span class="chev">${svg('chev')}</span></div>`; }).join('');
    return head + subs;
  };
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
  /* お客様アンケートの見本データ（2026-08-12 渉さんのご要望で全店ぶんに広げた）。
     ★狙い：どの店舗で開いても集計が「空っぽ」にならないこと。
       以前は1店舗ぶんしか無く、他の店舗の店長で開くと満足度も来店経路も0件だった。
     作り方の約束：
       ・お客様は回答された言語のまま答えるため、来店きっかけは各国語の生の値で入れる
         （google／グーグル／구글／인스타그램／Walk in／現場候位 など＝寄せる処理の確認にもなる）
       ・改善点は実際のご回答と同じく、本文の先頭に【…】で入る形にする
       ・店舗ごとに評価の傾向を変える（良い店・課題のある店が見分けられるように）
     ※ 見本なので、実在のお客様の声ではありません。 */
  // 見本データの版。中身を作り直したらここを上げる＝以前開いた端末にも新しい見本が届く
  const SEED_VER_KEY = 'yosakura_demo_seed_ver';
  const SEED_VER = '2026-08-12c';
  function seedSurvey() {
    /* ★以前この端末で開いた方には、古い見本が残ったままだった（2026-08-12 渉さんのご指摘で判明）。
       「すでに何か入っていたら作らない」という作りだったため、見本を作り直しても届かなかった。
       見本に版を付けて、版が変わったら作り直す。※見本はバックエンド非接続のときだけ入る。 */
    if (localStorage.getItem('yosakura_demo_survey') && localStorage.getItem(SEED_VER_KEY) === SEED_VER) return;
    const now = Date.now(), H = 3600e3;
    // 店舗ごとの傾向：良い評価の割合と、出やすいご指摘
    const PLAN = [
      /* ★どの店舗も高い評価にしてある（2026-08-12 渉さんのご指摘）。
         見本とはいえ、実在の店舗が「評価の低い例」として加盟店の皆さまの目に触れる形にしない。
         低い評価はどの店舗にも少しだけ入る＝「低い評価が上に出る」ことは説明できる。 */
      { store:'日本料理世桜本店',      n:22, hi:0.90, issues:['提供時間が長かった'] },
      { store:'寿司世桜 心斎橋店',      n:26, hi:0.88, issues:['提供時間が長かった', '盛り付け、接客'] },
      { store:'牛カツ世桜 長堀橋店',    n:24, hi:0.88, issues:['料理の味'] },
      { store:'日本鰻世桜 長堀橋店',    n:16, hi:0.91, issues:['店内の清潔さ'] },
      { store:'手巻き寿司世桜 難波店',  n:14, hi:0.87, issues:['接客'] },
      { store:'日本鰻世桜 富士山店',    n:19, hi:0.96, issues:['特に問題はありません'] },
      { store:'牛カツ世桜 富士山店',    n:15, hi:0.89, issues:['提供時間が長かった'] },
      { store:'日本鰻世桜 浅草橋店',    n:18, hi:0.95, issues:['特に問題はありません'] },
      { store:'和牛世桜 広島店',        n:12, hi:0.90, issues:['料理の味'] }
    ];
    // 来店きっかけ＝お客様が答えられた言語のまま（寄せる処理を通す）
    const ROUTE_RAW = ['google', 'グーグル', '구글', 'Google Maps', 'instagram', '인스타그램', 'tiktok', 'Walk in', '現場候位', '예약 없이', 'đi thẳng vào', '友人の紹介'];
    const COUNTRY = ['Korea', 'Taiwan', 'USA', 'Japan', 'China', 'Vietnam', 'Australia', 'France', 'Singapore'];
    const GOOD = [
      '', '', '', 'とても美味しかったです。また来ます。', 'Great dashi!', '스태프가 매우 친절했어요',
      '目の前で切り分けてくれる演出が最高でした', 'The eel was amazing', '雰囲気が落ち着いていて良かったです', ''
    ];
    const BAD = {
      '提供時間が長かった': ['料理は美味しかったのですが、最初の一品まで待ちました。', '混んでいたので仕方ないとは思います。', 'A bit long wait for the first dish.'],
      '接客': ['声かけがもう少しあると嬉しいです。', '入口でしばらく気づいてもらえませんでした。'],
      '盛り付け、接客': ['写真と少し違って見えました。声かけがもう少しあると嬉しいです。'],
      '料理の味': ['少し味が濃く感じました。', 'ご飯がかたく感じました。'],
      '店内の清潔さ': ['お手洗いが少し気になりました。'],
      '特に問題はありません': ['器がきれいでした。', '大満足です。']
    };
    // 見本は毎回同じ並びにする（開くたびに数字が変わると説明できないため）
    let seed = 20260812;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (a) => a[Math.floor(rnd() * a.length) % a.length];

    const rows = [];
    PLAN.forEach((p, pi) => {
      for (let k = 0; k < p.n; k++) {
        const high = rnd() < p.hi;
        const sat = high ? (rnd() < 0.62 ? 5 : 4) : (rnd() < 0.45 ? 2 : 3);
        const issue = high ? (rnd() < 0.18 ? '特に問題はありません' : '') : pick(p.issues);
        const body = issue ? pick(BAD[issue] || ['']) : pick(GOOD);
        const note = issue ? `【${issue}】${body}` : body;
        // 直近60日にばらす（月別の推移が出るように）
        const t = now - Math.floor(rnd() * 60 * 24) * H - pi * H;
        rows.push({ store: p.store, sat, route: pick(ROUTE_RAW), note, country: pick(COUNTRY), t });
      }
    });
    rows.sort((a, b) => b.t - a.t);
    saveSurvey(rows);
    try { localStorage.setItem(SEED_VER_KEY, SEED_VER); } catch (e) {}
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
  /* 本番サーベイの改善点は、お客様が回答された言語のまま【…】で本文の先頭に入る。
     （【특별한 문제는 없었어요】【No particular issue】【Không có vấn đề gì đặc biệt】
       【沒有特別的問題】【特に問題は無かった】【Food came out slowly】【그 외 문제】…）
     このままでは集計できないため、アプリの区分へ寄せる。1件で複数の指摘が入ることもある
     （例：「料理がおいしくない、料理提供が遅い」＝料理・味／提供時間）。 */
  const ISSUE_NONE_RE = /特に問題|問題は\s*(?:無|な)かった|no particular issue|no issue|không có vấn đề|沒有特別的問題|没有特别的问题|특별한\s*문제는?\s*없|문제\s*없/i;
  const SURVEY_ISSUE_ALIASES = [
    // 「Food came out slowly」は“料理”ではなく“提供の遅さ”。複合表現を先に判定して取り除く
    { v:'timing',  re:/(?:food|dishe?s?|料理|餐點)\s*(?:came out|came)?\s*slow\w*|料理提供が遅|提供が遅|提供時間|came out slow\w*|took (?:too )?long|slow service|遅い|遅かった|wait(?:ing)? time|待たされ|늦게|느리|오래|上菜[^、。]*慢|上得慢|速度慢|等(?:待|太久)|slow\w*|late/i },
    { v:'food',    re:/料理|味|おいし|美味し|不味|food|taste|flavou?r|맛|음식|餐點|菜品/i },
    { v:'service',  re:/接客|サービス|態度|service|staff|서비스|접객|직원|服務|態度/i },
    { v:'plating', re:/盛り付け|見た目|plating|presentation|플레이팅|담음새|擺盤/i },
    { v:'space',   re:/内装|空間|座席|席|騒|ambien|interior|noisy|seat|인테리어|자리|시끄|空間|座位/i },
    { v:'price',   re:/価格|値段|高い|高か|price|expensive|costly|가격|비싸|부담|價格|貴/i },
    { v:'other',   re:/その他|それ以外|other|그\s*외|기타|其他|其它/i }
  ];
  // 本文から【…】／[改善点: …] を取り出して区分へ寄せる。指摘なしは ['none']。
  const parseSurveyIssues = (note) => {
    const s = String(note || '');
    const m = s.match(/【([^】]*)】/) || s.match(/\[改善点[:：]\s*([^\]]*)\]/);
    if (!m) return [];
    const inner = m[1] || '';
    if (ISSUE_NONE_RE.test(inner)) return ['none'];
    const out = [];
    let rest = inner;
    SURVEY_ISSUE_ALIASES.forEach(a => {
      if (!a.re.test(rest)) return;
      if (out.indexOf(a.v) < 0) out.push(a.v);
      // 判定に使った表現は取り除く。「料理提供が遅い」を提供時間と数えたあと、
      // 残った「料理」でもう一度“料理・味”に数えてしまうのを防ぐため。
      rest = rest.replace(new RegExp(a.re.source, 'gi'), ' ');
    });
    return out.length ? out : ['other'];
  };
  // 表示用：先頭の【…】／[改善点: …] を除いた、お客様が書かれた本文だけを返す
  const surveyComment = (note) => String(note || '').replace(/^\s*【[^】]*】\s*/, '').replace(/^\s*\[改善点[:：][^\]]*\]\s*/, '').trim();
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
      ${['manager','owner','hq'].includes(getRole()) ? surveySheets() + surveyAgg(rows, vis) : ''}`;
  };
  /* 集約シート（回答の生データ）への入口。
     8/7 増田さんご要望。二重管理を避けるため、URLは既存の「資料リンク」で持つ
     （大項目＝サーベイ運用）。本部が1度登録すれば、店長・オーナーもここから開ける。 */
  function surveySheets() {
    const mats = getLinks().filter(l => l.mcat === 'survey' && isHttp(l.url));
    if (!mats.length) {
      return getRole() === 'hq' ? `
        <div class="card">
          <h3>${L({ ja:'回答の集約シート', en:'Response sheets', vi:'Bảng tổng hợp' })}</h3>
          <p class="muted">${L({ ja:'まだ登録されていません。「資料リンクの管理」で大項目を「サーベイ運用」にして登録すると、ここから開けるようになります。', en:'Not registered yet. Add it in “Manage material links” under “Survey operation”.', vi:'Chưa đăng ký. Thêm ở “Quản lý liên kết” với nhóm “Vận hành khảo sát”.' })}</p>
          <button class="mini" data-open="materials">${L({ ja:'資料リンクの管理を開く', en:'Open material links', vi:'Mở quản lý liên kết' })}</button>
        </div>` : '';
    }
    return `
      <div class="card">
        <h3>${L({ ja:'回答の集約シート', en:'Response sheets', vi:'Bảng tổng hợp' })}</h3>
        <div class="homelinks">
          ${mats.map(l => `<button class="homelink" data-openurl="${esc(l.url)}"><span class="hl-ic">${svg('table')}</span><span class="hl-t">${esc(l.title)}</span><span class="hl-c">${svg('chev')}</span></button>`).join('')}
        </div>
        <div class="hint">${L({ ja:'※ 集計はアプリが自動で行いますが、回答そのものを確認したいときはこちらから開けます。', en:'The app aggregates automatically; open these to see raw responses.', vi:'Ứng dụng tự tổng hợp; mở đây để xem phản hồi gốc.' })}</div>
      </div>`;
  }
  // サーベイ集計（本部・オーナー・店長向け）：満足度分布／低評価／来店経路／月別推移／店舗別
  function surveyAgg(rows, vis) {
    const n = rows.length;
    if (!n) return `
      <div class="card">
        <h3>${L({ ja:'サーベイ集計', en:'Survey results', vi:'Kết quả khảo sát' })}</h3>
        <p class="muted">${L({ ja:'まだサーベイの回答がありません。お客様の回答が入ると、満足度の分布・来店経路・月別の回答数・店舗別の評価がここに表示されます。', en:'No survey responses yet. Once guests reply, satisfaction, arrival routes, monthly counts and per-store scores appear here.', vi:'Chưa có phản hồi. Khi có, kết quả sẽ hiển thị ở đây.' })}</p>
      </div>`;
    const avg = n ? rows.reduce((s, r) => s + (Number(r.sat) || 0), 0) / n : 0;
    const low = rows.filter(r => (Number(r.sat) || 0) <= 2).length;
    const dist = [5, 4, 3, 2, 1].map(s => ({ s, c: rows.filter(r => Number(r.sat) === s).length }));
    // 来店経路＝各国語の回答をアプリの区分へ寄せて集計（寄せられなかった生の値は「その他」の内訳として出す）
    const rc = {}; ROUTES.forEach(x => rc[x.v] = 0);
    const otherRaw = {};
    rows.forEach(r => {
      const v = normalizeRoute(r.route);
      if (!v) return;
      if (rc[v] != null) rc[v]++;
      if (v === 'other' && String(r.route || '').trim()) { const k = String(r.route).trim(); otherRaw[k] = (otherRaw[k] || 0) + 1; }
    });
    const otherRows = Object.entries(otherRaw).sort((a, b) => b[1] - a[1]).slice(0, 8);
    // いただいたご指摘＝【…】の内容を区分へ寄せて集計（1件で複数の指摘が入ることがある）
    const ic = {}; SURVEY_ISSUES.forEach(x => ic[x.v] = 0);
    let noneN = 0, issueN = 0;
    rows.forEach(r => {
      const vs = parseSurveyIssues(r.note);
      if (!vs.length) return;
      if (vs[0] === 'none') { noneN++; return; }
      issueN++;
      vs.forEach(v => { if (ic[v] != null) ic[v]++; });
    });
    const issueRows = SURVEY_ISSUES.filter(x => ic[x.v] > 0).sort((a, b) => ic[b.v] - ic[a.v]);
    // お客様の声＝自由記述があるものを、低評価から先に並べる（改善の手がかりになるため）
    const voices = rows
      .map(r => ({ r, c: surveyComment(r.note) }))
      .filter(x => x.c)
      .sort((a, b) => (Number(a.r.sat) || 0) - (Number(b.r.sat) || 0) || b.r.t - a.r.t)
      .slice(0, 20);
    const cc = {}; rows.forEach(r => { if (r.country) cc[r.country] = (cc[r.country] || 0) + 1; });
    const countryRows = Object.entries(cc).sort((a, b) => b[1] - a[1]);
    const ymOf = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const mc = {}, msum = {}; rows.forEach(r => { const k = ymOf(r.t); mc[k] = (mc[k] || 0) + 1; msum[k] = (msum[k] || 0) + (Number(r.sat) || 0); });
    const mavg = (k) => mc[k] ? (msum[k] / mc[k]) : 0;
    const months = Object.keys(mc).sort().slice(-12); // 過去最大12か月まで表示
    const barRow = (label, c, total, cls) => `<div class="bar-row"><div class="bl"><span>${esc(label)}</span><b>${c}</b></div><div class="bar-track"><div class="bar-fill ${cls||''}" style="width:${total ? Math.round(c / total * 100) : 0}%"></div></div></div>`;
    const byStore = vis.length > 1 ? (() => {
      const bs = {}; vis.forEach(s => bs[s] = { n: 0, sum: 0, low: 0, iss: {} });
      rows.forEach(r => {
        const b = bs[r.store]; if (!b) return;
        b.n++; b.sum += Number(r.sat) || 0; if ((Number(r.sat) || 0) <= 2) b.low++;
        parseSurveyIssues(r.note).forEach(v => { if (v !== 'none') b.iss[v] = (b.iss[v] || 0) + 1; });
      });
      // 主なご指摘＝その店で多い順に2つまで。「どの店で何が起きているか」を1行で分かるようにする
      const topIss = (b) => Object.entries(b.iss).sort((x, y) => y[1] - x[1]).slice(0, 2)
        .map(([v, c]) => surveyIssueLabel(v) + ' ' + c).join(' ・ ');
      const noAnswer = vis.filter(s => !bs[s].n).length;
      return `<div class="card"><h3>${L({ ja:'店舗別の評価', en:'By store', vi:'Theo cửa hàng' })}</h3>
        ${vis.map(s => {
          const b = bs[s]; const a = b.n ? (b.sum / b.n) : 0; const ti = topIss(b);
          return `<div class="rep"><span class="amt" style="${b.low?'color:#a23b3b':''}">${b.n ? '★' + a.toFixed(1) : '—'}</span><div class="body"><div class="l1">${esc(s)}</div>${
            b.n
              ? `<div class="l2">${L({ja:'回答',en:'Resp.',vi:'PH'})} ${b.n} ・ ${L({ja:'低評価',en:'Low',vi:'Thấp'})} ${b.low}</div>${ti ? `<div class="l2">${L({ja:'主なご指摘',en:'Top issues',vi:'Góp ý chính'})}：${esc(ti)}</div>` : ''}`
              : `<div class="l2" style="color:#a23b3b">${L({ ja:'まだ回答がありません', en:'No responses yet', vi:'Chưa có phản hồi' })}</div>`
          }</div></div>`;
        }).join('')}
        ${noAnswer ? `<p class="hint" style="display:block">${L({ ja:'※ 回答がまだ無い店舗が' + noAnswer + '店あります。サーベイのご案内が現場で回っているか、あわせてご確認いただけますと助かります。', en:noAnswer + ' store(s) have no responses yet. Please check the survey is being offered on site.', vi:'Có ' + noAnswer + ' cửa hàng chưa có phản hồi.' })}</p>` : ''}
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
        ${otherRows.length ? `<p class="hint" style="display:block;margin-top:2px">${L({ ja:'「その他」の内訳', en:'Breakdown of “Other”', vi:'Chi tiết “Khác”' })}：${otherRows.map(([k, c]) => esc(k) + ' ' + c).join(' ／ ')}</p>` : ''}
        ${countryRows.length ? `<div class="idlabel" style="margin-top:12px">${L({ ja:'来店国', en:'Country', vi:'Quốc gia' })}</div>${countryRows.map(([c, ct]) => barRow(c, ct, n)).join('')}` : ''}
        ${months.length ? `<div class="idlabel" style="margin-top:12px">${L({ ja:'月別（回答数・平均満足度）', en:'By month (responses & avg)', vi:'Theo tháng (PH & TB)' })}</div>${months.map(m => barRow(`${m}　★${mavg(m).toFixed(1)}`, mc[m], Math.max(...months.map(x => mc[x])))).join('')}` : ''}
      </div>
      ${(issueN || noneN) ? `<div class="card">
        <h3>${L({ ja:'いただいたご指摘', en:'Reported issues', vi:'Điểm được góp ý' })}</h3>
        ${issueRows.length
          ? `${issueRows.map(x => barRow(L(x.t), ic[x.v], Math.max(1, issueN), 'bar-low')).join('')}
             <p class="hint" style="display:block">${L({ ja:'※ ご指摘があった回答は' + issueN + '件です（1件で複数のご指摘をいただく場合があるため、合計は一致しません）。', en:'Responses containing an issue: ' + issueN + ' (one response can raise several).', vi:'Phản hồi có góp ý: ' + issueN + '.' })}</p>`
          : `<p class="muted">${L({ ja:'ご指摘のあった回答はまだありません。', en:'No issues reported yet.', vi:'Chưa có góp ý.' })}</p>`}
        ${noneN ? `<div class="rep"><span class="amt">${noneN}</span><div class="body"><div class="l1">${L({ ja:'特にご指摘なし', en:'No particular issue', vi:'Không có vấn đề' })}</div><div class="l2">${L({ ja:'回答全体の', en:'of all responses', vi:'trên tổng số' })} ${Math.round(noneN / n * 100)}%</div></div></div>` : ''}
      </div>` : ''}
      ${voices.length ? `<div class="card">
        <h3>${L({ ja:'お客様の声', en:'Guest comments', vi:'Ý kiến khách' })}</h3>
        <p class="hint" style="display:block;margin-top:-4px">${L({ ja:'評価の低い順に表示しています（改善の手がかりになるため）。原文のまま表示します。', en:'Lowest ratings first, shown in the original language.', vi:'Đánh giá thấp trước, giữ nguyên văn.' })}</p>
        ${voices.map(({ r, c }) => `<div class="rep"><span class="amt" style="${(Number(r.sat)||0) <= 3 ? 'color:#a23b3b' : ''}">★${Number(r.sat) || '—'}</span><div class="body"><div class="l1">${esc(c)}</div><div class="l2">${esc(storeShort(r.store))}${r.country ? ' ・ ' + esc(r.country) : ''} ・ ${timeAgo(r.t)}</div></div></div>`).join('')}
      </div>` : ''}
      ${byStore}
      <p class="hint" style="display:block">${L({ ja:'※ サーベイ回答（本番フォーム）から集計しています。来店国はデータがある場合に表示します。来店経路は、お客様が回答された言語（韓国語・中国語・ベトナム語など）の値をアプリの区分へ寄せて集計しています。', en:'Aggregated from live survey responses. Country appears when available. Arrival routes answered in other languages are mapped to these categories.', vi:'Tổng hợp từ phản hồi khảo sát. Nguồn khách trả lời bằng ngôn ngữ khác được quy về các nhóm này.' })}</p>`;
  }

  /* ⑥ 総括表（動く：実日報フォーマットで入力→保存→履歴＆本部集約）*/
  const yen = (n) => '¥' + (Number(n) || 0).toLocaleString('en-US');
  APP_VIEWS.soukatsu = () => {
    const vis = visibleStores();
    const recent = getSk().filter(r => vis.includes(r.store)).sort((a,b)=>b.t-a.t).slice(0,6);
    const today = todayKey();
    // 店舗比較（複数店舗を見られる本部・オーナー）／個店サマリー（1店舗）
    const head = vis.length > 1 ? skCompare(vis, '/app/soukatsu') : (() => {
      const s = vis[0], ym = todayYm();
      const rows = getSk().filter(r => r.store === s && ymOfDate(r.date) === ym);
      const st = skStats(rows);
      const byDate = {}; rows.forEach(r => { byDate[r.date] = r; });
      return `
        <div class="card">
          <h3>${L({ ja:'今月の推移', en:'This month', vi:'Tháng này' })} — ${esc(storeLabel(s))}</h3>
          <div class="stat-row">
            <div class="stat"><div class="n">${esc(yenShort(st.sales))}</div><div class="k">${L({ ja:'売上合計', en:'Sales', vi:'Doanh thu' })}</div></div>
            <div class="stat"><div class="n">${st.guests.toLocaleString('en-US')}</div><div class="k">${L({ ja:'客数合計', en:'Guests', vi:'Khách' })}</div></div>
            <div class="stat"><div class="n">${st.per ? esc(yenShort(st.per)) : '—'}</div><div class="k">${L({ ja:'客単価', en:'Per guest', vi:'BQ/khách' })}</div></div>
          </div>
          ${colChart(daysOfYm(ym), (d) => byDate[d] ? numOr0(byDate[d].sales) : 0, { store:s, title:{ ja:'日別の売上', en:'Daily sales', vi:'Doanh thu theo ngày' } })}
          <button class="btn-primary" data-storelink="${esc(s)}" style="margin-top:12px">${L({ ja:'この店舗の詳細（カルテ）を見る', en:'Open this store\'s detail', vi:'Xem chi tiết cửa hàng' })}</button>
        </div>`;
    })();
    return `
      ${NOTE({ ja:'◆ 実際の日報フォーマットで入力→保存できます（履歴と本部集約に反映）', en:'◆ Enter in the real daily-report format; it saves to history & HQ', vi:'◆ Nhập theo mẫu báo cáo ngày thực tế; lưu vào lịch sử & HQ' })}
      ${head}
      <div class="card" id="skForm">
        <h3>${L({ ja:'本日の総括表', en:'Daily report', vi:'Báo cáo ngày' })}</h3>
        <div class="sk-grid">
          <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span><select id="sk_store">${vis.map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
          <label class="fld"><span>${L({ ja:'日付', en:'Date', vi:'Ngày' })}</span><input type="date" id="sk_date" value="${today}" max="${today}"></label>
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
        <div class="sk-grid">
          <label class="fld"><span>${L({ja:'現金売上',en:'Cash sales',vi:'DT tiền mặt'})}</span><input type="text" inputmode="numeric" id="sk_cash" placeholder="96800"></label>
          <label class="fld"><span>${L({ja:'カード売上',en:'Card sales',vi:'DT thẻ'})}</span><input type="text" inputmode="numeric" id="sk_card" placeholder="251700"></label>
          <label class="fld"><span>${L({ja:'昼のみ売上',en:'Lunch-only',vi:'DT buổi trưa'})}</span><input type="text" inputmode="numeric" id="sk_lunch" placeholder="186400"></label>
          <label class="fld"><span>${L({ja:'仕入金額（当日）',en:'Purchases today',vi:'Nhập hàng'})}</span><input type="text" inputmode="numeric" id="sk_buy" placeholder="7049"></label>
          <label class="fld"><span>${L({ja:'消耗品金額',en:'Supplies',vi:'Vật tư'})}</span><input type="text" inputmode="numeric" id="sk_supply" placeholder="0"></label>
          ${storeGyotai(vis[0]) === 'unagi' ? `<label class="fld"><span>${L({ja:'鰻の使用尾数',en:'Eel used',vi:'Số lươn'})}</span><input type="text" inputmode="numeric" id="sk_unagi" placeholder="12"></label>` : ''}
        </div>
        <label class="fld"><span>${L({ ja:'過不足（現金）の理由', en:'Reason for cash difference', vi:'Lý do chênh lệch tiền mặt' })}</span><input type="text" id="sk_errnote" placeholder="${L({ja:'差がある場合のみ',en:'only if there is a difference',vi:'chỉ khi có chênh lệch'})}"></label>

        <div class="idlabel" style="margin-top:14px">${L({ ja:'お客様の内訳（国別・組数／人数）', en:'Guests by country (groups / people)', vi:'Khách theo quốc gia (nhóm / người)' })}</div>
        <p class="hint" style="display:block;margin:-2px 0 8px">${L({ ja:'総括表と同じ区分です。分かるものだけで大丈夫です（空欄は0として扱いません）。', en:'Same categories as the summary sheet. Fill only what you know.', vi:'Cùng phân loại với bảng tổng kết. Chỉ điền phần bạn biết.' })}</p>
        <div class="sk-grid">
          ${SK_COUNTRIES.concat(SK_VISITKIND).map(cn => `
            <label class="fld"><span>${L(cn.t)}</span>
              <span style="display:flex;gap:6px">
                <input type="text" inputmode="numeric" id="sk_cty_${cn.k}_g" placeholder="${L({ja:'組',en:'grp',vi:'nhóm'})}" style="width:50%">
                <input type="text" inputmode="numeric" id="sk_cty_${cn.k}_p" placeholder="${L({ja:'人',en:'ppl',vi:'người'})}" style="width:50%">
              </span>
            </label>`).join('')}
        </div>
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
    <div class="rep tapable" data-skday="${esc((r.store||'') + '||' + (r.date||''))}" role="button" tabindex="0">
      <span class="kind b">${esc((r.date||'').slice(5))}</span>
      <div class="body">
        <div class="l1">${yen(r.sales)} ・ ${esc(r.guests||0)}${L({ja:'名',en:' guests',vi:' khách'})}</div>
        <div class="l2">${esc(r.store)}${r.food?' ・ FL '+esc(r.food)+'/'+esc(r.labor||'—')+'%':''}${r.closer?' ・ '+L({ja:'締め',en:'by',vi:'chốt'})+':'+esc(r.closer):''}</div>
      </div>
      <span class="amt">${r.guests?yen(Math.round((Number(r.sales)||0)/(Number(r.guests)||1))):'—'}</span>
    </div>`;

  /* ============================================================
     ⑥-2 総括表のビジュアル化（店舗比較グラフ／個店カルテ）
     - 色は増やさない：ブランド＝墨の1色。大小は「長さ」で、店舗の区別は「行と名前」で表す
     - グラフは素のCSS/SVG＝外部ライブラリ不要・オフラインでも動く・端末幅に追従
     - 個店の行をタップ→個店カルテ（#/store）。日付の行・棒をタップ→その日の日報（全項目）
     ============================================================ */
  // 表示名：同じ地名に複数店（長堀橋＝牛カツ/鰻、富士山＝牛カツ/鰻、心斎橋＝寿司/日本料理）があるため業態を前置
  const storeLabel = (s) => { const g = storeGyotai(s); return (g ? gyotaiLabel(g) + '・' : '') + storeShort(s); };
  const numOr0 = (v) => Number(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')) || 0;
  const hasVal = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const yenShort = (n) => {
    n = Number(n) || 0;
    if (LANG === 'ja') return n >= 10000 ? '¥' + (n / 10000).toFixed(n >= 1000000 ? 0 : 1) + '万' : yen(n);
    return n >= 1000 ? '¥' + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : yen(n);
  };
  const todayYm = () => todayKey().slice(0, 7);
  const ymOfDate = (d) => String(d || '').slice(0, 7);
  const addMonth = (ym, n) => { const [y, m] = String(ym).split('-').map(Number); if (!y) return ym; const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const daysOfYm = (ym) => { const [y, m] = String(ym).split('-').map(Number); const n = new Date(y, m, 0).getDate(); const out = []; for (let i = 1; i <= n; i++) out.push(ym + '-' + String(i).padStart(2, '0')); return out; };
  const ymLabel = (ym) => LANG === 'ja' ? `${String(ym).slice(0, 4)}年${Number(String(ym).slice(5, 7))}月` : String(ym);
  const WDAYS = [{ja:'日',en:'Sun',vi:'CN'},{ja:'月',en:'Mon',vi:'T2'},{ja:'火',en:'Tue',vi:'T3'},{ja:'水',en:'Wed',vi:'T4'},{ja:'木',en:'Thu',vi:'T5'},{ja:'金',en:'Fri',vi:'T6'},{ja:'土',en:'Sat',vi:'T7'}];
  const wdOf = (date) => { const d = new Date(String(date) + 'T00:00:00'); return isNaN(d.getTime()) ? 0 : d.getDay(); };
  const mdLabel = (date) => LANG === 'ja' ? `${Number(String(date).slice(5, 7))}/${Number(String(date).slice(8, 10))}` : String(date).slice(5);

  // 集計（1店舗ぶん／全店合計 どちらにも使う）
  const skStats = (rows) => {
    const sales = rows.reduce((s, r) => s + numOr0(r.sales), 0);
    const guests = rows.reduce((s, r) => s + numOr0(r.guests), 0);
    return { sales, guests, days: rows.length, per: guests ? Math.round(sales / guests) : 0, avgDay: rows.length ? Math.round(sales / rows.length) : 0 };
  };
  const PERIODS = [
    { v:'this', t:{ ja:'今月', en:'This month', vi:'Tháng này' } },
    { v:'prev', t:{ ja:'先月', en:'Last month', vi:'Tháng trước' } },
    { v:'d30',  t:{ ja:'直近30日', en:'Last 30 days', vi:'30 ngày qua' } }
  ];
  const daysOfPeriod = (p) => {
    if (p === 'd30') { const out = []; for (let i = 29; i >= 0; i--) out.push(new Date(Date.now() - i * 864e5).toLocaleDateString('en-CA')); return out; }
    return daysOfYm(p === 'prev' ? addMonth(todayYm(), -1) : todayYm());
  };
  const METRICS = [
    { v:'sales',  t:{ ja:'売上', en:'Sales', vi:'Doanh thu' },        get:(st)=>st.sales,  fmt:(n)=>yen(n) },
    { v:'guests', t:{ ja:'客数', en:'Guests', vi:'Khách' },           get:(st)=>st.guests, fmt:(n)=>Number(n||0).toLocaleString('en-US') + L({ ja:'名', en:'', vi:'' }) },
    { v:'per',    t:{ ja:'客単価', en:'Per guest', vi:'BQ/khách' },   get:(st)=>st.per,    fmt:(n)=>yen(n) }
  ];

  /* --- グラフ部品（墨1色・CSS/SVG） --- */
  // スパークライン（直近の推移。系列は1本だけ＝凡例不要）
  function spark(vals, w, h) {
    w = w || 76; h = h || 22;
    const v = (vals || []).filter(x => x != null && !isNaN(x));
    if (v.length < 2 || !v.some(x => x > 0)) return ''; // データなしの店に平坦な線を描かない
    const max = Math.max(...v), min = Math.min(...v), rng = (max - min) || 1;
    const pts = v.map((x, i) => `${(i / (v.length - 1) * (w - 3) + 1.5).toFixed(1)},${(h - 2.5 - ((x - min) / rng) * (h - 5)).toFixed(1)}`);
    const last = pts[pts.length - 1].split(',');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.1" fill="currentColor"/></svg>`;
  }
  // 日別カラムチャート（1本＝1日。タップでその日の日報を開く）
  function colChart(days, valueOf, opt) {
    opt = opt || {};
    const fmt = opt.fmt || yen;
    const vals = days.map(d => numOr0(valueOf(d)));
    const max = Math.max(1, ...vals);
    const has = vals.filter(v => v > 0);
    const avg = has.length ? has.reduce((s, v) => s + v, 0) / has.length : 0;
    const topI = has.length ? vals.indexOf(Math.max(...vals)) : -1;
    const cols = days.map((d, i) => {
      const v = vals[i];
      const h = v > 0 ? Math.max(4, Math.round(v / max * 100)) : 0;
      const tap = opt.store ? ` data-skday="${esc(opt.store + '||' + d)}"` : '';
      return `<button class="col${v > 0 ? '' : ' none'}${i === topI ? ' top' : ''}" style="--h:${h}%"${tap} title="${esc(mdLabel(d))}｜${v > 0 ? esc(fmt(v)) : '—'}" aria-label="${esc(mdLabel(d))} ${v > 0 ? esc(fmt(v)) : ''}"><span class="cb"></span></button>`;
    }).join('');
    return `
      <div class="chartbox">
        <div class="charthead"><span class="ct">${esc(L(opt.title || { ja:'日別の推移', en:'Daily trend', vi:'Theo ngày' }))}</span>
          ${topI >= 0 ? `<b>${L({ ja:'最高', en:'Peak', vi:'Cao nhất' })} ${esc(mdLabel(days[topI]))}　${esc(fmt(vals[topI]))}</b>` : `<b class="muted">${L({ ja:'データなし', en:'No data', vi:'Chưa có' })}</b>`}
        </div>
        <div class="colchart">
          ${avg > 0 ? `<div class="avgline" style="bottom:${Math.round(avg / max * 100)}%"><span>${L({ ja:'平均', en:'Avg', vi:'TB' })} ${esc(yenShort(avg))}</span></div>` : ''}
          ${cols}
        </div>
        <div class="colaxis"><span>${esc(mdLabel(days[0]))}</span><span>${esc(mdLabel(days[Math.floor(days.length / 2)]))}</span><span>${esc(mdLabel(days[days.length - 1]))}</span></div>
        ${opt.store ? `<div class="hint" style="display:block;margin-top:6px">${L({ ja:'※ 棒をタップすると、その日の日報（全項目）が開きます', en:'Tap a bar to open that day\'s full report', vi:'Chạm vào cột để mở báo cáo ngày đó' })}</div>` : ''}
      </div>`;
  }
  // 横棒（曜日別など・タップなし）
  const hBar = (label, val, max, sub) => `
    <div class="bar-row"><div class="bl"><span>${esc(label)}${sub ? ` <span class="muted">${esc(sub)}</span>` : ''}</span><b>${esc(val.txt)}</b></div>
    <div class="bar-track"><div class="bar-fill" style="width:${max ? Math.round(val.n / max * 100) : 0}%"></div></div></div>`;

  /* --- 店舗比較（本部＝全店／オーナー＝所有店）--- */
  function skCompare(vis, base) {
    const params = currentRoute().params;
    const p = PERIODS.some(x => x.v === params.get('p')) ? params.get('p') : 'this';
    const mv = METRICS.some(x => x.v === params.get('m')) ? params.get('m') : 'sales';
    const metric = METRICS.find(x => x.v === mv);
    const days = daysOfPeriod(p);
    const from = days[0], to = days[days.length - 1];
    const all = getSk().filter(r => vis.includes(r.store) && r.date >= from && r.date <= to);
    const total = skStats(all);
    // スパークラインは「今日まで」の直近14日（今月は先の日付が空欄なので線が消えてしまう）
    const today = todayKey();
    const past = days.filter(d => d <= today);
    const spDays = (past.length ? past : days).slice(-14);
    const rows = vis.map(s => {
      const rs = all.filter(r => r.store === s);
      const st = skStats(rs);
      const byD = {}; rs.forEach(r => { byD[r.date] = numOr0(r.sales) + (byD[r.date] || 0); });
      return { store: s, st, val: metric.get(st), sp: spDays.map(d => byD[d] || 0) };
    }).sort((a, b) => b.val - a.val);
    const max = Math.max(1, ...rows.map(r => r.val));
    const chip = (o, key, cur) => `<button class="chip${o.v === cur ? ' on' : ''}" data-go="${esc(base)}?p=${key === 'p' ? o.v : p}&m=${key === 'm' ? o.v : mv}">${esc(L(o.t))}</button>`;
    const totalByDay = (d) => all.filter(r => r.date === d).reduce((s, r) => s + numOr0(r.sales), 0);
    return `
      <div class="card">
        <h3>${L({ ja:'店舗比較（総括表より）', en:'Store comparison (from daily reports)', vi:'So sánh cửa hàng' })}</h3>
        <div class="seg-chips">${PERIODS.map(o => chip(o, 'p', p)).join('')}</div>
        <div class="stat-row">
          <div class="stat"><div class="n">${esc(yenShort(total.sales))}</div><div class="k">${L({ ja:'全店 売上合計', en:'Total sales', vi:'Tổng doanh thu' })}</div></div>
          <div class="stat"><div class="n">${total.guests.toLocaleString('en-US')}</div><div class="k">${L({ ja:'全店 客数', en:'Total guests', vi:'Tổng khách' })}</div></div>
          <div class="stat"><div class="n">${esc(yenShort(total.per))}</div><div class="k">${L({ ja:'平均 客単価', en:'Avg / guest', vi:'BQ/khách' })}</div></div>
        </div>
        ${colChart(days, totalByDay, { title:{ ja:'全店合計の日別売上', en:'Daily sales (all stores)', vi:'Doanh thu ngày (toàn bộ)' } })}
        <div class="idlabel" style="margin-top:16px">${L({ ja:'ランキング（並べ替え）', en:'Ranking', vi:'Xếp hạng' })}</div>
        <div class="seg-chips">${METRICS.map(o => chip(o, 'm', mv)).join('')}</div>
        ${rows.map((r, i) => `
          <button class="cmp" data-storelink="${esc(r.store)}">
            <div class="cmp-top"><span class="cmp-rank">${i + 1}</span><span class="cmp-name">${esc(storeLabel(r.store))}</span><b class="cmp-val">${r.st.days ? esc(metric.fmt(r.val)) : '<span class="muted">' + L({ ja:'未入力', en:'No data', vi:'Chưa nhập' }) + '</span>'}</b></div>
            <div class="cmp-bar"><div class="cmp-fill" style="width:${Math.round(r.val / max * 100)}%"></div></div>
            <div class="cmp-sub"><span>${L({ ja:'入力', en:'Days', vi:'Ngày' })} ${r.st.days}${L({ ja:'日', en:'d', vi:'n' })}${r.st.days ? ` ・ ${L({ ja:'客数', en:'Guests', vi:'Khách' })} ${r.st.guests} ・ ${L({ ja:'客単価', en:'Per', vi:'BQ' })} ${esc(yenShort(r.st.per))}` : ''}</span>${spark(r.sp)}</div>
          </button>`).join('')}
        <div class="hint" style="display:block;margin-top:10px">${L({ ja:'※ 店舗をタップすると、その店の詳細（カルテ）が開きます', en:'Tap a store to open its detail page', vi:'Chạm vào cửa hàng để xem chi tiết' })}</div>
      </div>`;
  }

  /* --- 個店カルテ（#/store?s=店舗&ym=YYYY-MM）--- */
  const SK_FIELDS = [
    { k:'sales',   t:{ ja:'当日売上', en:'Sales', vi:'Doanh thu' },              f:'yen' },
    { k:'guests',  t:{ ja:'客数', en:'Guests', vi:'Khách' },                     f:'num' },
    { k:'net',     t:{ ja:'純売上', en:'Net sales', vi:'DT thuần' },             f:'yen' },
    { k:'err',     t:{ ja:'レジ誤差', en:'Register error', vi:'Sai lệch quầy' }, f:'yen' },
    { k:'mtd',     t:{ ja:'月累計売上', en:'Month-to-date', vi:'Lũy kế tháng' }, f:'yen' },
    { k:'goal',    t:{ ja:'売上目標（月）', en:'Monthly goal', vi:'Mục tiêu tháng' }, f:'yen' },
    { k:'foodct',  t:{ ja:'フード数', en:'Food items', vi:'Số món ăn' },         f:'num' },
    { k:'drinkct', t:{ ja:'飲料数', en:'Drink items', vi:'Số đồ uống' },         f:'num' },
    { k:'rvt',     t:{ ja:'口コミ 当日', en:'Reviews today', vi:'Đánh giá nay' }, f:'num' },
    { k:'rva',     t:{ ja:'口コミ 累計', en:'Reviews total', vi:'Đánh giá tổng' }, f:'num' },
    { k:'hear',    t:{ ja:'ヒアリング 当日', en:'Hearings today', vi:'Phỏng vấn nay' }, f:'num' },
    { k:'disc',    t:{ ja:'値引き', en:'Discount', vi:'Giảm giá' },              f:'yen' },
    { k:'food',    t:{ ja:'原価率', en:'Food cost', vi:'Giá vốn' },              f:'pct' },
    { k:'labor',   t:{ ja:'人件費率', en:'Labor cost', vi:'Nhân sự' },           f:'pct' },
    { k:'tipt',    t:{ ja:'チップ 当日', en:'Tips today', vi:'Tip nay' },        f:'yen' },
    { k:'tipa',    t:{ ja:'チップ 累計', en:'Tips total', vi:'Tip tổng' },       f:'yen' },
    { k:'cancel',  t:{ ja:'キャンセル 累計', en:'Cancel total', vi:'Hủy tổng' }, f:'yen' },
    { k:'closer',  t:{ ja:'レジ締め担当', en:'Cash-up by', vi:'Người chốt sổ' }, f:'txt' },
    /* ここから下は、総括表 Ver.2.6（実物）に有ってアプリに無かった項目。
       現場が「シートと違う」と感じる箇所を減らすために合わせた。 */
    { k:'cash',    t:{ ja:'現金売上', en:'Cash sales', vi:'DT tiền mặt' },      f:'yen' },
    { k:'card',    t:{ ja:'カード売上', en:'Card sales', vi:'DT thẻ' },         f:'yen' },
    { k:'lunch',   t:{ ja:'昼のみ売上', en:'Lunch-only sales', vi:'DT buổi trưa' }, f:'yen' },
    { k:'buy',     t:{ ja:'仕入金額（当日）', en:'Purchases today', vi:'Nhập hàng hôm nay' }, f:'yen' },
    { k:'supply',  t:{ ja:'消耗品金額', en:'Supplies', vi:'Vật tư tiêu hao' },  f:'yen' },
    { k:'unagi',   t:{ ja:'鰻の使用尾数', en:'Eel used', vi:'Số lươn đã dùng' }, f:'num' },
    { k:'errnote', t:{ ja:'過不足の理由', en:'Cash difference reason', vi:'Lý do chênh lệch' }, f:'txt' }
  ];
  /* 顧客情報＝国別の組数・人数（総括表 Ver.2.6 の「顧客情報」欄）。
     サーベイの来店国と並べて見られるようにするため、シートと同じ区分にそろえている。 */
  const SK_COUNTRIES = [
    { k:'jp', t:{ ja:'日本', en:'Japan', vi:'Nhật' } },
    { k:'kr', t:{ ja:'韓国', en:'Korea', vi:'Hàn' } },
    { k:'cn', t:{ ja:'中国', en:'China', vi:'Trung' } },
    { k:'hk', t:{ ja:'香港', en:'Hong Kong', vi:'Hồng Kông' } },
    { k:'tw', t:{ ja:'台湾', en:'Taiwan', vi:'Đài Loan' } },
    { k:'sea', t:{ ja:'東南アジア', en:'SE Asia', vi:'ĐNÁ' } },
    { k:'eu', t:{ ja:'ヨーロッパ', en:'Europe', vi:'Châu Âu' } },
    { k:'au', t:{ ja:'オーストラリア', en:'Australia', vi:'Úc' } },
    { k:'us', t:{ ja:'アメリカ', en:'USA', vi:'Mỹ' } },
    { k:'ca', t:{ ja:'カナダ', en:'Canada', vi:'Canada' } },
    { k:'mx', t:{ ja:'メキシコ', en:'Mexico', vi:'Mexico' } },
    { k:'br', t:{ ja:'ブラジル', en:'Brazil', vi:'Brazil' } },
    { k:'latam', t:{ ja:'中南米', en:'Latin America', vi:'Mỹ Latinh' } },
    { k:'sasia', t:{ ja:'南アジア', en:'South Asia', vi:'Nam Á' } },
    { k:'casia', t:{ ja:'中央アジア', en:'Central Asia', vi:'Trung Á' } },
    { k:'me', t:{ ja:'中東', en:'Middle East', vi:'Trung Đông' } },
    { k:'af', t:{ ja:'アフリカ', en:'Africa', vi:'Châu Phi' } }
  ];
  const SK_VISITKIND = [
    { k:'new', t:{ ja:'新規', en:'New', vi:'Mới' } },
    { k:'rep', t:{ ja:'リピート', en:'Repeat', vi:'Quay lại' } }
  ];
  // r.cty = { jp:{g:組数,p:人数}, ... }。入力のあるものだけ持つ（空の国は保存しない）
  const ctyOf = (r) => (r && typeof r.cty === 'object' && r.cty) ? r.cty : {};
  // 合計は「国」だけを足す。新規・リピートは同じお客様を別の見方で数えたものなので、
  // 一緒に足すと人数が二重になる
  const ctySum = (r, f) => SK_COUNTRIES.reduce((a, cn) => a + numOr0((ctyOf(r)[cn.k] || {})[f]), 0);
  const skFmtVal = (f, v) => f === 'yen' ? yen(numOr0(v)) : f === 'pct' ? (numOr0(v).toFixed(1) + '%') : f === 'num' ? numOr0(v).toLocaleString('en-US') : esc(String(v));
  // 日報1件の全項目（未入力は「—」＝アップされたら自動で埋まる）
  function skFieldGrid(r) {
    const filled = SK_FIELDS.filter(f => hasVal(r[f.k])).length;
    const per = numOr0(r.guests) ? Math.round(numOr0(r.sales) / numOr0(r.guests)) : 0;
    const fl = (hasVal(r.food) || hasVal(r.labor)) ? (numOr0(r.food) + numOr0(r.labor)).toFixed(1) + '%' : '';
    return `
      <div class="fillhead"><span>${L({ ja:'入力済みの項目', en:'Filled items', vi:'Mục đã nhập' })}</span><b>${filled} / ${SK_FIELDS.length}</b></div>
      <div class="fillbar"><i style="width:${Math.round(filled / SK_FIELDS.length * 100)}%"></i></div>
      <div class="stat-row" style="margin-top:12px">
        <div class="stat"><div class="n">${esc(yenShort(numOr0(r.sales)))}</div><div class="k">${L({ ja:'売上', en:'Sales', vi:'DT' })}</div></div>
        <div class="stat"><div class="n">${numOr0(r.guests)}</div><div class="k">${L({ ja:'客数', en:'Guests', vi:'Khách' })}</div></div>
        <div class="stat"><div class="n">${per ? esc(yenShort(per)) : '—'}</div><div class="k">${L({ ja:'客単価', en:'Per guest', vi:'BQ/khách' })}</div></div>
      </div>
      ${fl ? `<p class="hint" style="display:block">FL ${esc(fl)}（${L({ ja:'原価', en:'Food', vi:'Giá vốn' })} ${esc(numOr0(r.food).toFixed(1))}% ＋ ${L({ ja:'人件費', en:'Labor', vi:'Nhân sự' })} ${esc(numOr0(r.labor).toFixed(1))}%）</p>` : ''}
      <div class="dgrid">
        ${SK_FIELDS.map(f => `<div class="dcell${hasVal(r[f.k]) ? '' : ' off'}"><span class="dk">${esc(L(f.t))}</span><b class="dv">${hasVal(r[f.k]) ? skFmtVal(f.f, r[f.k]) : '—'}</b></div>`).join('')}
      </div>
      ${Object.keys(ctyOf(r)).length ? `
        <div class="idlabel" style="margin-top:14px">${L({ ja:'お客様の内訳（国別）', en:'Guests by country', vi:'Khách theo quốc gia' })}
          <span class="muted">　${L({ ja:'合計', en:'total', vi:'tổng' })} ${ctySum(r, 'g')}${L({ ja:'組', en:' grp', vi:' nhóm' })} ・ ${ctySum(r, 'p')}${L({ ja:'名', en:' ppl', vi:' người' })}</span></div>
        <div class="dgrid">
          ${SK_COUNTRIES.concat(SK_VISITKIND).filter(cn => ctyOf(r)[cn.k]).map(cn => {
            const c = ctyOf(r)[cn.k];
            return `<div class="dcell"><span class="dk">${esc(L(cn.t))}</span><b class="dv">${numOr0(c.g)}${L({ ja:'組', en:'g', vi:'n' })} / ${numOr0(c.p)}${L({ ja:'名', en:'p', vi:'ng' })}</b></div>`;
          }).join('')}
        </div>` : ''}
      ${hasVal(r.note) ? `<div class="idlabel" style="margin-top:14px">${L({ ja:'清掃・特記事項', en:'Cleaning & notes', vi:'Vệ sinh & ghi chú' })}</div><p class="dtext">${esc(r.note)}</p>` : ''}
      ${hasVal(r.order) ? `<div class="idlabel">${L({ ja:'翌日の食材発注', en:'Tomorrow order', vi:'Đặt NL ngày mai' })}</div><p class="dtext">${esc(r.order)}</p>` : ''}
      ${hasVal(r.by) ? `<div class="idlabel" style="margin-top:14px">${L({ ja:'提出者', en:'Submitted by', vi:'Người nộp' })}</div><p class="dtext">${esc(r.by)}</p>` : ''}
      <p class="hint" style="display:block;margin-top:10px">${L({ ja:'※「—」は未入力の項目です。総括表に入力されると、ここに自動で表示されます。', en:'“—” means not entered yet; it fills in automatically once the daily report is submitted.', vi:'“—” là chưa nhập; sẽ tự hiển thị khi báo cáo được nộp.' })}</p>`;
  }
  // その日の日報を開く（シート）
  function openSkDay(key) {
    const i = String(key).lastIndexOf('||');
    const store = String(key).slice(0, i), date = String(key).slice(i + 2);
    const r = getSk().filter(x => x.store === store && x.date === date).sort((a, b) => b.t - a.t)[0];
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>${esc(mdLabel(date))}（${esc(L(WDAYS[wdOf(date)]))}）　${esc(storeLabel(store))}</h3>
      <div class="sub">${esc(store)}</div>
      ${r ? skFieldGrid(r) : `<p class="muted">${L({ ja:'この日はまだ総括表が提出されていません。', en:'No daily report submitted for this day yet.', vi:'Chưa có báo cáo cho ngày này.' })}</p>`}
      <button class="btn-primary" data-close="1" style="margin-top:14px">${L({ ja:'閉じる', en:'Close', vi:'Đóng' })}</button>
    </div></div>`);
    mask.addEventListener('click', (e) => { if (e.target === mask || (e.target.closest && e.target.closest('[data-close]'))) mask.remove(); });
    document.body.appendChild(mask);
  }

  function viewStore(sParam, ymParam) {
    const vis = visibleStores();
    const store = vis.includes(sParam) ? sParam : (vis[0] || STORES[0]);
    const ym = /^\d{4}-\d{2}$/.test(ymParam || '') ? ymParam : todayYm();
    const all = getSk().filter(r => r.store === store);
    const rows = all.filter(r => ymOfDate(r.date) === ym).sort((a, b) => a.date < b.date ? -1 : 1);
    const st = skStats(rows);
    // 前月比：今月は途中なので「前月の同じ日数まで」と比べる（4日分と31日分を比べない）
    const isCur = ym === todayYm();
    const cut = isCur ? Number(todayKey().slice(8, 10)) : 31;
    const pst = skStats(all.filter(r => ymOfDate(r.date) === addMonth(ym, -1) && Number(String(r.date).slice(8, 10)) <= cut));
    const byDate = {}; rows.forEach(r => { byDate[r.date] = r; });
    const days = daysOfYm(ym);
    const latest = rows[rows.length - 1];
    const mtd = latest && numOr0(latest.mtd) ? numOr0(latest.mtd) : st.sales;
    const delta = (cur, prv) => !prv ? '' : `<span class="delta ${cur >= prv ? 'up' : 'dn'}">${(Math.abs((cur - prv) / prv * 100)).toFixed(1)}%</span>`;
    const wd = WDAYS.map((w, i) => { const rs = rows.filter(r => wdOf(r.date) === i); const s = rs.reduce((a, r) => a + numOr0(r.sales), 0); return { w, n: rs.length, avg: rs.length ? Math.round(s / rs.length) : 0 }; });
    const wdMax = Math.max(1, ...wd.map(x => x.avg));
    const sv = getSurvey().filter(r => r.store === store);
    const svAvg = sv.length ? sv.reduce((s, r) => s + (Number(r.sat) || 0), 0) / sv.length : 0;
    const svLow = sv.filter(r => (Number(r.sat) || 0) <= 2).length;
    const mo = getMonthly().find(r => r.store === store && r.ym === ym);
    const moC = mo ? plCalc(mo) : null;
    // 売上目標＝「数値・原価率」で設定した月間目標が正。未設定なら日報に入力された目標を使う
    const goal = (mo && numOr0(mo.goal)) || (latest ? numOr0(latest.goal) : 0);
    const inYm = (t) => new Date(Number(t) || 0).toISOString().slice(0, 7) === ym;
    const kzN = getKz().filter(r => r.store === store && inYm(r.t)).length;
    const fdN = getReports().filter(r => (r.kind === 'a' || r.kind === 'b') && r.store === store && inYm(r.t)).length;
    const nav = (n) => `/store?s=${encodeURIComponent(store)}&ym=${addMonth(ym, n)}`;
    const canNext = ym < todayYm();
    const inner = `
      <main class="screen">
        <div class="appbar"><button class="back" data-go="/app/soukatsu">${svg('back')}${L({ ja:'総括表', en:'Daily reports', vi:'Báo cáo' })}</button></div>
        <div class="app-head">
          <div class="ico">${svg('table')}</div>
          <div><h1>${esc(storeLabel(store))}</h1><p>${esc(store)}${storeGyotai(store) ? '　/　' + esc(gyotaiLabel(storeGyotai(store))) : ''}</p></div>
        </div>
        ${NOTE({ ja:'◆ 総括表（日報）に入力された内容を、この店舗ぶんだけまとめています', en:'◆ Everything submitted in this store\'s daily reports, in one place', vi:'◆ Tổng hợp báo cáo ngày của cửa hàng này' })}
        <div class="card">
          <div class="mnav">
            <button class="chip" data-go="${esc(nav(-1))}">‹</button>
            <b>${esc(ymLabel(ym))}</b>
            <button class="chip${canNext ? '' : ' off'}"${canNext ? ` data-go="${esc(nav(1))}"` : ' disabled'}>›</button>
          </div>
          <div class="stat-row">
            <div class="stat"><div class="n">${esc(yenShort(st.sales))}</div><div class="k">${L({ ja:'売上合計', en:'Sales', vi:'Doanh thu' })} ${delta(st.sales, pst.sales)}</div></div>
            <div class="stat"><div class="n">${st.guests.toLocaleString('en-US')}</div><div class="k">${L({ ja:'客数合計', en:'Guests', vi:'Khách' })} ${delta(st.guests, pst.guests)}</div></div>
            <div class="stat"><div class="n">${st.per ? esc(yenShort(st.per)) : '—'}</div><div class="k">${L({ ja:'客単価', en:'Per guest', vi:'BQ/khách' })} ${delta(st.per, pst.per)}</div></div>
          </div>
          <div class="stat-row">
            <div class="stat"><div class="n">${st.days}</div><div class="k">${L({ ja:'入力日数', en:'Days entered', vi:'Số ngày' })}</div></div>
            <div class="stat"><div class="n">${st.avgDay ? esc(yenShort(st.avgDay)) : '—'}</div><div class="k">${L({ ja:'1日平均', en:'Avg / day', vi:'TB/ngày' })}</div></div>
            <div class="stat"><div class="n">${goal ? Math.round(mtd / goal * 100) + '%' : '—'}</div><div class="k">${L({ ja:'目標到達', en:'To goal', vi:'Đạt mục tiêu' })}</div></div>
          </div>
          ${pst.days ? `<p class="hint" style="display:block;margin:-4px 0 10px">${isCur ? L({ ja:'※ 前月比は「前月の同じ日（1〜' + cut + '日）まで」と比べています', en:'Month-over-month compares the same day range of last month', vi:'So sánh cùng khoảng ngày của tháng trước' }) : L({ ja:'※ 前月比は前月の実績と比べています', en:'Compared with last month', vi:'So với tháng trước' })}</p>` : ''}
          ${goal ? `<div class="fillhead"><span>${L({ ja:'月間目標', en:'Monthly goal', vi:'Mục tiêu tháng' })} ${esc(yen(goal))}</span><b>${esc(yen(mtd))}</b></div><div class="fillbar"><i style="width:${Math.min(100, Math.round(mtd / goal * 100))}%"></i></div>` : ''}
          ${colChart(days, (d) => byDate[d] ? numOr0(byDate[d].sales) : 0, { store, title:{ ja:'日別の売上', en:'Daily sales', vi:'Doanh thu theo ngày' } })}
        </div>
        <div class="card">
          <h3>${L({ ja:'曜日別の平均売上', en:'Average sales by weekday', vi:'Doanh thu TB theo thứ' })}</h3>
          ${st.days ? wd.map(x => hBar(L(x.w), { n: x.avg, txt: x.avg ? yenShort(x.avg) : '—' }, wdMax, x.n ? `（${x.n}${L({ ja:'日', en:'d', vi:'n' })}）` : '')).join('')
            : `<div class="muted">${L({ ja:'この月はまだ入力がありません', en:'No entries this month', vi:'Chưa có dữ liệu tháng này' })}</div>`}
        </div>
        <div class="card">
          <h3>${L({ ja:'最新の日報（全項目）', en:'Latest daily report (all fields)', vi:'Báo cáo mới nhất (tất cả)' })}${latest ? `　<span class="muted">${esc(mdLabel(latest.date))}</span>` : ''}</h3>
          ${latest ? skFieldGrid(latest) : `<p class="muted">${L({ ja:'この月の日報がまだありません。提出されると、売上・客数のほか、口コミ・ヒアリング・原価率・チップ・発注など全項目がここに表示されます。', en:'No report yet this month. Once submitted, all fields appear here.', vi:'Chưa có báo cáo tháng này.' })}</p>`}
        </div>
        <div class="card">
          <h3>${L({ ja:'この店舗の他のデータ', en:'Other data for this store', vi:'Dữ liệu khác' })}</h3>
          <div class="dgrid">
            <div class="dcell${sv.length ? '' : ' off'}"><span class="dk">${L({ ja:'サーベイ 平均満足度', en:'Survey avg.', vi:'Khảo sát TB' })}</span><b class="dv">${sv.length ? '★' + svAvg.toFixed(1) : '—'}</b></div>
            <div class="dcell${sv.length ? '' : ' off'}"><span class="dk">${L({ ja:'サーベイ 回答数／低評価', en:'Responses / low', vi:'Phản hồi / thấp' })}</span><b class="dv">${sv.length ? sv.length + ' / ' + svLow : '—'}</b></div>
            <div class="dcell${moC ? '' : ' off'}"><span class="dk">${L({ ja:'月次 原価率', en:'Monthly cost ratio', vi:'Giá vốn tháng' })}</span><b class="dv">${moC ? moC.costRate.toFixed(1) + '%' : '—'}</b></div>
            <div class="dcell${moC ? '' : ' off'}"><span class="dk">${L({ ja:'月次 粗利', en:'Gross profit', vi:'Lãi gộp' })}</span><b class="dv">${moC ? esc(yenShort(moC.gross)) : '—'}</b></div>
            <div class="dcell${kzN ? '' : ' off'}"><span class="dk">${L({ ja:'気づきの報告', en:'Insights', vi:'Ghi nhận' })}</span><b class="dv">${kzN ? kzN + L({ ja:'件', en:'', vi:'' }) : '—'}</b></div>
            <div class="dcell${fdN ? '' : ' off'}"><span class="dk">${L({ ja:'食べ残し報告', en:'Leftover reports', vi:'Báo cáo đồ thừa' })}</span><b class="dv">${fdN ? fdN + L({ ja:'件', en:'', vi:'' }) : '—'}</b></div>
          </div>
        </div>
        <div class="card">
          <h3>${L({ ja:'日別の一覧', en:'By day', vi:'Theo ngày' })}</h3>
          ${rows.length ? rows.slice().reverse().map(skRow).join('') : `<div class="muted">${L({ ja:'まだありません', en:'None yet', vi:'Chưa có' })}</div>`}
        </div>
      </main>`;
    return shell(inner, 'genba');
  }

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
          <label class="fld"><span>${L({ ja:'今月の売上目標', en:'Monthly sales goal', vi:'Mục tiêu doanh thu' })}</span><input type="text" inputmode="numeric" id="pl_goal" value="${esc(cur.goal||'')}" placeholder="3000000"></label>
        </div>
        <p class="hint" style="display:block;margin:2px 0 8px">${L({ ja:'※ 売上目標は本部・オーナー・店長が設定します。設定すると各店の画面に「目標到達」と進捗バーが出ます。', en:'The sales goal is set by HQ/owner/manager and appears as progress on each store screen.', vi:'Mục tiêu do HQ/chủ/quản lý đặt; hiển thị tiến độ trên màn hình cửa hàng.' })}</p>
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
    const reps = getReports().filter(r => (r.kind === 'a' || r.kind === 'b') && vis.includes(r.store));
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
        return `${vis.length > 1 ? skCompare(vis, '/app/dashboard') : ''}
          <div class="card"><h3>${L({ ja:'最新の総括表（店舗別）', en:'Latest daily report by store', vi:'Báo cáo mới theo cửa hàng' })}</h3>${rows.map(skRow).join('')}</div>`;
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

  /* ---------- よくある質問（ルール集）----------
     2026-08-10 構築MTG A-04。単発のお知らせ欄ではなく「あとから確認できる場所」として新設。
     ・本部で決まったルール（FAQ_FIXED）＝会議の決定事項。アプリ側で編集しない
     ・本部が追加した項目（faqset）＝配列を丸ごと保存し最新版が正（資料リンクと同じ方式・全端末同期） */
  const FAQ_CATS = [
    { v:'promo', t:{ ja:'販促物・制作物', en:'Promotional items', vi:'Vật phẩm quảng bá' } },
    { v:'store', t:{ ja:'店舗運営のルール', en:'Store rules', vi:'Quy định cửa hàng' } },
    { v:'other', t:{ ja:'その他', en:'Other', vi:'Khác' } }
  ];
  // 会議で決まったルール（2026-08-10 構築MTG）。出典を明記し、勝手に増やさない。
  // 本部が直したいときは faqset 側に同じ id の「上書き」を持たせる（deleted:true で非表示にもできる）。
  const FAQ_FIXED = [
    { id:'fx_promo', cat:'promo', src:'2026-08-10 構築MTG',
      q:{ ja:'販促物は、いつまでに依頼すればよいですか？', en:'How early should we request promotional items?', vi:'Cần đặt vật phẩm quảng bá trước bao lâu?' },
      a:{ ja:'制作元への依頼・調整を含めて2〜3週間かかります。使用したい日から逆算して、余裕をもってご依頼ください。',
          en:'It takes 2–3 weeks including the request to and coordination with the maker. Please order well before the date you need them.',
          vi:'Mất 2–3 tuần bao gồm đặt hàng và điều chỉnh với nhà sản xuất. Vui lòng đặt sớm trước ngày cần dùng.' } },
    { id:'fx_drink', cat:'store', src:'2026-08-10 構築MTG',
      q:{ ja:'お客様からお飲み物の持ち込みを希望されたら、どうすればよいですか？', en:'What if a guest asks to bring their own drinks?', vi:'Nếu khách muốn mang đồ uống vào thì sao?' },
      a:{ ja:'原則としてお断りしています。例外的にお受けする場合は、事前に本部の承認が必要です。ご来店当日にお申し出をいただいた場合は、承認が間に合わないため原則お断りとなります。',
          en:'As a rule we decline. Exceptions require prior HQ approval. If the request is made on the day of the visit, approval cannot be obtained in time, so we decline as a rule.',
          vi:'Về nguyên tắc chúng tôi từ chối. Trường hợp ngoại lệ cần được HQ chấp thuận trước. Nếu khách đề nghị ngay hôm đến, không kịp xin duyệt nên về nguyên tắc từ chối.' } }
  ];
  const getFaq = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_faq')) || []; } catch { return []; } };
  const saveFaq = (a) => { try { localStorage.setItem('yosakura_demo_faq', JSON.stringify(a)); } catch (e) {} };

  // 表示に使う一覧＝固定ルール（上書き・非表示を反映）＋本部が追加したもの
  function faqList() {
    const saved = getFaq();
    const ovr = {}; saved.forEach(f => { if (f && /^fx_/.test(f.id)) ovr[f.id] = f; });
    const fixed = FAQ_FIXED.map(f => {
      const o = ovr[f.id];
      if (o && o.deleted) return null;
      return { id:f.id, fixed:true, cat:(o && o.cat) || f.cat, q:(o && o.q) || L(f.q), a:(o && o.a) || L(f.a), src:f.src, edited:!!(o && (o.q || o.a)) };
    }).filter(Boolean);
    const mine = saved.filter(f => f && !/^fx_/.test(f.id)).map(f => ({ id:f.id, cat:f.cat || 'other', q:f.q || '', a:f.a || '' }));
    return fixed.concat(mine);
  }
  let faqEditId = null; // 編集中の項目（本部のみ）

  APP_VIEWS.faq = () => {
    const role = getRole(), isHQ = role === 'hq';
    const all = faqList();
    const catOpts = (sel) => FAQ_CATS.map(c => `<option value="${c.v}"${c.v === sel ? ' selected' : ''}>${esc(L(c.t))}</option>`).join('');
    const rows = FAQ_CATS.map(c => {
      const items = all.filter(f => f.cat === c.v);
      if (!items.length) return '';
      return `<div class="card"><h3>${esc(L(c.t))}</h3>
        ${items.map(it => (isHQ && faqEditId === it.id) ? `
        <div class="rep" style="display:block;padding:10px 2px">
          <label class="fl">${esc(L({ ja:'分類', en:'Category', vi:'Phân loại' }))}</label>
          <select id="faqe_cat">${catOpts(it.cat)}</select>
          <label class="fl">${esc(L({ ja:'質問', en:'Question', vi:'Câu hỏi' }))}</label>
          <input id="faqe_q" type="text" value="${esc(it.q)}">
          <label class="fl">${esc(L({ ja:'答え', en:'Answer', vi:'Trả lời' }))}</label>
          <textarea id="faqe_a" rows="4">${esc(it.a)}</textarea>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn" data-faqsave="${esc(it.id)}">${esc(L({ ja:'保存する', en:'Save', vi:'Lưu' }))}</button>
            <button class="btn sm" data-faqcancel="1">${esc(L({ ja:'やめる', en:'Cancel', vi:'Huỷ' }))}</button>
          </div>
        </div>` : `
        <details class="rep" style="display:block;padding:10px 2px">
          <summary style="cursor:pointer;font-weight:600">${esc(it.q)}</summary>
          <div class="l2" style="margin-top:6px;white-space:pre-wrap">${esc(it.a)}</div>
          ${it.src ? `<div class="hint" style="margin-top:6px">${esc(it.src)}での決定事項${it.edited ? `（${esc(L({ ja:'本部が修正', en:'edited by HQ', vi:'HQ đã sửa' }))}）` : ''}</div>` : ''}
          ${isHQ ? `<div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn sm" data-faqedit="${esc(it.id)}">${esc(L({ ja:'編集', en:'Edit', vi:'Sửa' }))}</button>
            <button class="btn sm" data-faqdel="${esc(it.id)}">${esc(L({ ja:'削除', en:'Delete', vi:'Xoá' }))}</button>
          </div>` : ''}
        </details>`).join('')}
      </div>`;
    }).join('');
    return `
      ${NOTE({ ja:'◆ 迷ったときに確認する場所です。お知らせと違い、あとから探せます', en:'◆ Check here when in doubt — unlike announcements, these stay searchable', vi:'◆ Xem tại đây khi phân vân — khác thông báo, nội dung luôn tìm lại được' })}
      ${rows || `<div class="card"><div class="muted">${L({ ja:'まだ項目がありません。', en:'No entries yet.', vi:'Chưa có mục nào.' })}</div></div>`}
      ${isHQ ? `<div class="card"><h3>${esc(L({ ja:'項目を追加（本部）', en:'Add an entry (HQ)', vi:'Thêm mục (HQ)' }))}</h3>
        <label class="fl">${esc(L({ ja:'分類', en:'Category', vi:'Phân loại' }))}</label>
        <select id="faq_cat">${FAQ_CATS.map(c => `<option value="${c.v}">${esc(L(c.t))}</option>`).join('')}</select>
        <label class="fl">${esc(L({ ja:'質問', en:'Question', vi:'Câu hỏi' }))}</label>
        <input id="faq_q" type="text" placeholder="${esc(L({ ja:'例）備品が足りないときは？', en:'e.g. What if supplies run out?', vi:'VD: Khi thiếu vật tư?' }))}">
        <label class="fl">${esc(L({ ja:'答え', en:'Answer', vi:'Trả lời' }))}</label>
        <textarea id="faq_a" rows="3"></textarea>
        <button class="btn" id="faqAdd" style="margin-top:8px">${esc(L({ ja:'追加する', en:'Add', vi:'Thêm' }))}</button>
        <p class="hint">${esc(L({ ja:'※ 追加・編集・削除は全店の端末に反映されます。会議で決まったルールも修正できます（元の出典は残ります）。', en:'Adds, edits and deletes sync to all devices. Rules decided in meetings can also be edited (the source note remains).', vi:'Thêm, sửa, xoá sẽ đồng bộ mọi máy. Quy định từ cuộc họp cũng có thể sửa (vẫn giữ ghi chú nguồn).' }))}</p>
      </div>` : ''}`;
  };

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
    <div class="homelinks">
      <button class="homelink" data-open="manual"><span class="hl-ic">${svg('book')}</span><span class="hl-t">${L({ ja:'トークスクリプト（マニュアル）を見る', en:'Open talk scripts (Manuals)', vi:'Xem kịch bản (Cẩm nang)' })}</span><span class="hl-c">${svg('chev')}</span></button>
    </div>
    <p class="hint" style="display:block;margin:-2px 0 10px">${L({ ja:'※ 詳しいトークスクリプトはマニュアルの「接客・ホール」にあります。', en:'Detailed scripts are in Manuals → Service & Hall.', vi:'Kịch bản chi tiết ở Cẩm nang → Phục vụ & Sảnh.' })}</p>
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
  /* first=true＝初回起動時の「はじめの設定」。
     いままでは右上のボタンを自分で見つけないと役割・店舗・お名前を設定できず、
     現場が最初につまずく場所だった。初回だけ、開いた時点でこの画面から始める。 */
  const SETUP_KEY = 'yosakura_setup_done';
  function openIdentitySheet(first) {
    const buildHTML = () => {
      const role = getRole(), sel = getStoreSel();
      const storeOpts = role === 'hq' ? ['all', ...STORES] : role === 'owner' ? ['owned', ...OWNER_STORES] : STORES;
      const storeLabel = (s) => s === 'all' ? L({ ja:'全店（本部）', en:'All stores (HQ)', vi:'Tất cả (HQ)' })
        : s === 'owned' ? L({ ja:'所有店舗すべて（比較）', en:'All my stores (compare)', vi:'Tất cả CH của tôi (so sánh)' }) : s;
      return `<div class="sheet">
        <div class="grip"></div>
        <h3>${first ? L({ ja:'はじめの設定', en:'First-time setup', vi:'Cài đặt ban đầu' }) : L({ ja:'表示を切り替える', en:'Switch view', vi:'Đổi hiển thị' })}${first ? `<span class="demo-tag">${L({ja:'1回だけ',en:'Once only',vi:'Chỉ một lần'})}</span>` : `<span class="demo-tag">${L({ja:'確認用',en:'For review',vi:'Để xem'})}</span>`}</h3>
        <div class="sub">${first
          ? L({ ja:'この端末をどなたが使うかを選んでください。あとから右上でいつでも変えられます。', en:'Tell us who uses this device. You can change it any time from the top right.', vi:'Chọn ai dùng thiết bị này. Có thể đổi bất cứ lúc nào ở góc trên bên phải.' })
          : TAIKEN
            ? L({ ja:'店舗iPad・店長・加盟店オーナーで、見えるものが変わります。切り替えてお試しください。', en:'What you see changes by role. Feel free to switch and try.', vi:'Nội dung thay đổi theo vai trò. Hãy thử chuyển đổi.' })
            : L({ ja:'本部は全店を閲覧できます。店舗iPad・店長・加盟店オーナーは自分の店舗のみ（数値なども自店だけ）。', en:'HQ sees all stores. Store iPad, managers and franchisees see only their own store, including numbers.', vi:'HQ xem mọi cửa hàng. iPad cửa hàng/quản lý/chủ chỉ xem cửa hàng của mình.' })}</div>
        <div class="idlabel">${L({ ja:'役割', en:'Role', vi:'Vai trò' })}</div>
        ${roleKeys().map(k => { const v = ROLES[k]; return `
          <button class="role-opt ${k===role?'on':''}" data-role="${k}">
            <span class="rr">${v.mark}</span>
            <span class="ri"><b>${L(v.label)}</b><span>${L(v.desc)}</span></span>
            ${k===role?`<span class="rc">${svg('tick')}</span>`:''}
          </button>`; }).join('')}
        <div class="idlabel">${L({ ja:'お名前（提出の記録に残ります）', en:'Your name (recorded on submissions)', vi:'Tên của bạn (ghi vào mục đã nộp)' })}</div>
        <label class="fld"><input type="text" id="idName" maxlength="20" value="${esc(getUserName())}" placeholder="${L({ ja:'例：山田', en:'e.g. Yamada', vi:'VD: Yamada' })}"></label>
        <p class="hint" style="display:block;margin:-2px 0 12px">${L({ ja:'一度ご登録いただくと、以後の提出に自動で記録されます。未登録でも提出はできます（1食目写真は店舗名だけで大丈夫です）。', en:'Register once and it is recorded automatically on later submissions. You can still submit without it.', vi:'Đăng ký một lần, các lần nộp sau sẽ tự ghi. Không có tên vẫn nộp được.' })}</p>
        <div class="idlabel">${L({ ja:'店舗（見えるデータの範囲）', en:'Store (data scope)', vi:'Cửa hàng (phạm vi dữ liệu)' })}</div>
        ${storeOpts.map(s=>`
          <button class="role-opt store-opt ${s===sel?'on':''}" data-store="${esc(s)}">
            <span class="ri"><b>${esc(storeLabel(s))}</b></span>
            ${s===sel?`<span class="rc">${svg('tick')}</span>`:''}
          </button>`).join('')}
        <button class="btn-primary" data-done="1" style="margin-top:10px">${first ? L({ ja:'この設定ではじめる', en:'Start with this', vi:'Bắt đầu' }) : L({ ja:'完了', en:'Done', vi:'Xong' })}</button>
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
      // お名前＝入力のたびに保存（役割・店舗を切り替えてシートを作り直しても消えない）
      const nameInput = mask.querySelector('#idName');
      if (nameInput) nameInput.oninput = () => setUserName(nameInput.value);
      const done = mask.querySelector('[data-done]');
      if (done) done.onclick = () => {
        try { localStorage.setItem(SETUP_KEY, '1'); } catch (e) {}
        mask.remove(); render();
        // はじめの設定を終えたら、そのまま使い方の案内へ（初回だけ）
        if (first && !localStorage.getItem('yosakura_tour_done')) setTimeout(() => openTour(0), 300);
      };
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
    /* 提出物マスタの保存先。ここに入るのは「本部が編集したもの」だけで、既定は保存しない。
       ※ 以前は既定も端末へ保存していたため、一度アプリを開いた端末には古い既定が残り続け、
         こちらで項目を増やしても届かなかった（v54で6→17項目にしたとき、
         新しい端末は17項目・以前から使っている端末は旧項目のまま、という食い違いが起きた）。
         キーを _v2 にして古い保存を無視し、以後は既定を焼き付けない。 */
    master:  'yosakura_sub_master_v2',
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
  /* 提出物マスタ＝本部の「提出物・実行項目一覧」に合わせる（2026-08-07 増田さんより受領）。
     並び順＝実際に出す順（開店前 → 営業中 → 閉店後）。この順で画面に並ぶ。
     oblig: required=必須／store=店舗内共有の推奨／off=準備中
     detect: 提出済みを自動で判定する方法（ckdone=アプリのチェックリスト実施） */
  function defaultMasters() {
    return [
      // ── 毎日 ──
      { id:'openphoto',  name:{ja:'オープン写真',en:'Opening photo',vi:'Ảnh mở cửa'},                 oblig:'required', freq:'daily', due:'11:00', target:'all', hqReview:'none',      detect:'subrec', linkApp:'openphoto' },
      { id:'ck_open',    name:{ja:'オープンチェックリスト',en:'Opening checklist',vi:'Checklist mở cửa'}, oblig:'store',  freq:'daily', due:'11:00', target:'all', hqReview:'none',      detect:'ckdone', ckMode:'open',   linkApp:'checklist' },
      // ★一食目写真：AI判定の運用が未確定（木村さんと協議中）のため、当面は提出物の対象から外す（準備中）。
      //   運用が決まったら oblig を 'required' に戻すだけで有効化できる。
      { id:'firstphoto', name:{ja:'一食目写真',en:'First-plate photo',vi:'Ảnh món đầu tiên'},          oblig:'off',      freq:'daily', due:'23:59', target:'except_course', hqReview:'exception', detect:'fp', linkApp:'firstphoto' },
      { id:'ck_idle',    name:{ja:'アイドルタイムチェックリスト',en:'Idle-time checklist',vi:'Checklist giữa ca'}, oblig:'store', freq:'daily', due:'23:59', target:'all', hqReview:'none', detect:'ckdone', ckMode:'idle',   linkApp:'checklist' },
      { id:'ck_sakura',  name:{ja:'桜チェックリスト（トイレ）',en:'Sakura checklist (restroom)',vi:'Checklist WC'}, oblig:'store', freq:'daily', due:'23:59', target:'all', hqReview:'none', detect:'ckdone', ckMode:'sakura', linkApp:'checklist' },
      { id:'hygiene_d',  name:{ja:'定期衛生管理（本日の曜日の箇所）',en:'Periodic hygiene (today\'s spots)',vi:'Vệ sinh định kỳ (hôm nay)'}, oblig:'store', freq:'daily', due:'23:59', target:'all', hqReview:'none', detect:'ckdone', ckMode:'hygiene', linkApp:'checklist' },
      { id:'ck_close',   name:{ja:'クローズチェックリスト',en:'Closing checklist',vi:'Checklist đóng cửa'}, oblig:'store', freq:'daily', due:'23:59', target:'all', hqReview:'none',      detect:'ckdone', ckMode:'close',  linkApp:'checklist' },
      { id:'nippou',     name:{ja:'日報（総括表）',en:'Daily report',vi:'Báo cáo ngày'},                oblig:'required', freq:'daily', due:'12:00', dueNextDay:true, target:'all', hqReview:'each', detect:'sk', linkApp:'soukatsu' }, // 閉店後〜翌日午前中まで（店舗ごとに開店時間が違うため一律「翌日午前中」）
      /* ★気づきの報告を、1日の最後に置く（2026-08-12 渉さんのご指摘）。
         これまで日報の中に「清掃・特記事項」という自由入力があり、
         「気づきの報告」と同じことを2か所で書く形になっていた。日報側を外し、こちらに一本化する。
         クローズ後に落ち着いて書くものなので、日次業務のいちばん最後に並ぶよう最後尾に置く。 */
      { id:'kizuki',     name:{ja:'気づきの報告',en:'Daily insights',vi:'Ghi nhận cuối ca'},           oblig:'store',    freq:'daily', due:'23:59', target:'all', hqReview:'none',  detect:'kizuki', linkApp:'kizuki',
        how:{ja:'クローズ後に、その日の気づきを共有してください（無い日は出さなくて大丈夫です）',en:'Share what you noticed after closing (skip if nothing)',vi:'Sau khi đóng cửa, chia sẻ điều bạn nhận thấy (không có thì bỏ qua)'} },
      // ── 毎週 ──
      { id:'pop_week',   name:{ja:'卓上POPの交換',en:'Table POP replacement',vi:'Thay POP bàn'},        oblig:'required', freq:'weekly', due:'23:59', target:'gyotai_in', gyotai:['gyukatsu'], hqReview:'none', detect:'didit', how:{ja:'新しいものと交換したら「実施しました」を押してください',en:'Replace with new ones, then tap “Done”',vi:'Thay mới rồi bấm “Đã làm”'} }, // 牛カツは油汚れ対策で週1
      // ── 毎月 ──
      /* ★総括表とPLは別のもの（2026-08-12 渉さんのご指摘で整理）。
           総括表＝日々の数値管理。毎月5日までに締める（売上・仕入・在庫→原価率）。アプリの「数値・原価率」で受ける。
           PL   ＝店舗の利益管理。前月分を月末まで。人件費・家賃・水光熱などを含むため、アプリはまだ受けていない。
         以前は両方とも同じ「数値・原価率」の画面へ飛んでおり、同じものが2つ並んでいるように見えていた。
         PLからはリンクを外し、何をするものかを画面に出す。**項目の統廃合は本部の一覧が正なので、こちらでは行わない。** */
      { id:'monthlynum', name:{ja:'総括表の締め（毎月5日まで）',en:'Monthly summary close (by the 5th)',vi:'Chốt tổng kết tháng (đến ngày 5)'}, oblig:'required', freq:'monthly', due:'23:59', target:'all', hqReview:'each', detect:'monthly', linkApp:'pl',
        how:{ja:'前月の売上・仕入・在庫を入力すると原価率まで出ます',en:'Enter last month’s sales, purchases and stock to get the cost ratio',vi:'Nhập doanh thu, nhập hàng, tồn kho tháng trước để ra giá vốn'} },
      { id:'pl',         name:{ja:'PL・損益（前月分を月末まで）',en:'P&L (previous month, by month end)',vi:'Lãi lỗ (tháng trước)'}, oblig:'required', freq:'monthly', due:'23:59', target:'all', hqReview:'each', detect:'none',
        how:{ja:'人件費・家賃なども含む損益の集計です。現在はアプリでは受けておらず、本部のPLシートへご入力ください',en:'P&L including labour and rent. Not yet handled in the app — please use the HQ P&L sheet',vi:'Lãi lỗ gồm nhân sự, thuê mặt bằng. Chưa có trong ứng dụng — vui lòng dùng bảng P&L của HQ'} },
      /* ★2026-08-12：この2件はアプリで受けていなかった（グループLINEへ送る運用のまま残っていた）。
         写真を出すという中身はオープン写真とまったく同じなので、同じ画面で受けるようにした。
         これで「送り先を選ばずに、アプリに出せば届く」が月次の提出物でも成り立つ。 */
      { id:'hygiene_m',  name:{ja:'定期衛生管理（月次の指定箇所）',en:'Monthly hygiene (assigned spots)',vi:'Vệ sinh tháng (khu chỉ định)'}, oblig:'required', freq:'monthly', due:'23:59', target:'all', hqReview:'each', detect:'subrec', linkApp:'openphoto', how:{ja:'清掃する箇所は毎月本部より指定。清掃前と清掃後を撮って提出してください',en:'HQ assigns the spots each month; submit before/after photos',vi:'HQ chỉ định khu vực hàng tháng; nộp ảnh trước/sau'} },
      { id:'menubook',   name:{ja:'メニューブック・販促物の確認',en:'Menu book & POP check',vi:'Kiểm tra menu & POP'}, oblig:'required', freq:'monthly', due:'23:59', target:'all', hqReview:'each', detect:'subrec', linkApp:'openphoto', how:{ja:'汚れや破れがないか確認し、並べて写真を撮って提出してください',en:'Check for stains/tears, lay them out and submit a photo',vi:'Kiểm tra bẩn/rách, bày ra và nộp ảnh'} },
      { id:'facade',     name:{ja:'店舗内・外の動画',en:'Store interior/exterior video',vi:'Video trong/ngoài quán'}, oblig:'required', freq:'monthly', due:'23:59', target:'all', hqReview:'each', detect:'video', linkApp:'storevideo' },
      { id:'pop_month',  name:{ja:'卓上POPの交換',en:'Table POP replacement',vi:'Thay POP bàn'},        oblig:'required', freq:'monthly', due:'23:59', target:'gyotai_ex', gyotai:['gyukatsu'], hqReview:'none', detect:'didit', how:{ja:'新しいものと交換したら「実施しました」を押してください',en:'Replace with new ones, then tap “Done”',vi:'Thay mới rồi bấm “Đã làm”'} },
      // ── 四半期 ──
      /* ★コンプラチェックは「案②」で運用する（2026-08-12 渉さんのご判断）。
         四半期に1回のためにアプリ内へ回答画面を作るより、本部が用意されたシートへの入口を置くだけにする。
         url は本部が「加盟店・提出物管理」から設定する（対象月ごとに差し替えられる）。
         ★何をチェックするのかは本部が配るもの。神田が中身を作らない。 */
      { id:'compliance', name:{ja:'コンプラチェック（4・7・10・1月）',en:'Compliance check (Apr/Jul/Oct/Jan)',vi:'Kiểm tra tuân thủ'}, oblig:'required', freq:'quarterly', due:'23:59', target:'all', hqReview:'each', detect:'none', url:'', how:{ja:'本部が用意したシートに記入してください',en:'Fill in the sheet prepared by HQ',vi:'Điền vào bảng do HQ chuẩn bị'} }
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
    // 端末に保存があるのは「本部が編集したとき」だけ。無ければ毎回そのときの既定を使う
    // （既定を保存しないので、こちらで項目を変えれば全端末にそのまま届く）
    const m = jget(SUBKEYS.master, null);
    return (Array.isArray(m) && m.length) ? m : defaultMasters();
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

  // この提出物がこの店舗に適用されるか（対象設定＋コース除外＋業態出し分け＋対象外オフ）
  function appliesToStore(m, store) {
    if (m.oblig === 'off') return false;
    if (m.target === 'except_course' && storeMeta(store).course) return false;
    if (m.target === 'stores' && Array.isArray(m.stores) && !m.stores.includes(store)) return false;
    if (m.target === 'gyotai_in' && Array.isArray(m.gyotai) && !m.gyotai.includes(storeMeta(store).gyotai)) return false; // 指定業態のみ（例：牛カツのみ）
    if (m.target === 'gyotai_ex' && Array.isArray(m.gyotai) && m.gyotai.includes(storeMeta(store).gyotai)) return false;  // 指定業態を除く（例：牛カツ以外）
    return true;
  }
  // 週キー（月曜始まり）＝週次提出の「今週提出済み」判定に使用
  function weekKeyOf(dstr) {
    const d = new Date(dstr + 'T00:00:00'); if (isNaN(d)) return dstr;
    const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off);
    return d.toISOString().slice(0, 10);
  }
  const quarterKeyOf = (dstr) => `${dstr.slice(0, 4)}Q${Math.floor((Number(dstr.slice(5, 7)) - 1) / 3) + 1}`;
  // 実データから「提出済みか」を判定（同期済みの実績を突き合わせ）
  function detectSubmitted(store, m, dk) {
    const sameDay = (t) => dateKeyFor(store, t) === dk;
    const sameMonth = (t) => dateKeyFor(store, t).slice(0, 7) === dk.slice(0, 7);
    const sameWeek = (t) => weekKeyOf(dateKeyFor(store, t)) === weekKeyOf(dk);
    const sameQuarter = (t) => quarterKeyOf(dateKeyFor(store, t)) === quarterKeyOf(dk);
    const inScope = m.freq === 'monthly' ? sameMonth : m.freq === 'weekly' ? sameWeek : m.freq === 'quarterly' ? sameQuarter : sameDay;
    // 日付文字列（YYYY-MM-DD）で同じ判定をする版＝日報のように「対象日」を持つ提出物に使う
    const inScopeD = (d) => m.freq === 'monthly' ? String(d).slice(0, 7) === dk.slice(0, 7)
      : m.freq === 'weekly' ? weekKeyOf(d) === weekKeyOf(dk)
      : m.freq === 'quarterly' ? quarterKeyOf(d) === quarterKeyOf(dk)
      : d === dk;
    try {
      if (m.detect === 'fp')     return getFP().some(r => r.store === store && inScope(r.t));
      if (m.detect === 'sk')     return getSk().some(r => r.store === store && (r.date ? inScopeD(r.date) : inScope(r.t)));
      // 気づきは「その日に1件でも出ていれば実施」（何件出してもよいもののため）
      if (m.detect === 'kizuki') return getKz().some(r => r.store === store && inScope(r.t)); // 対象日で判定（翌朝提出でも前日分として数える）
      if (m.detect === 'checks') { const c = jget(LS.checks, []); return Array.isArray(c) && c.some(r => r.store === store && inScope(r.t)); }
      /* アプリのチェックリスト＝★その日の項目が「全部」終わったときだけ提出済みとする。
         2026-08-12 渉さんのご指摘で修正。以前は1つでもチェックすれば実施とみなしていたため、
         途中までしか終わっていないのに「今日出すもの」から消えてしまっていた。
         点検は最後まで通してこそ意味があるので、途中は未提出のまま残す。 */
      if (m.detect === 'ckdone') return ckAllDoneOf(store, m.ckMode || 'open', dk);
      if (m.detect === 'video')  return getReports().some(r => r.kind === 'video' && r.store === store && inScope(r.t));
      if (m.detect === 'monthly') return getMonthly().some(r => r.store === store && r.ym === new Date().toISOString().slice(0, 7));
      if (m.detect === 'subrec' || m.detect === 'didit') return subRows(SUB_KINDS.open).some(r => r.store === store && String(r.item || '').split('|')[0] === m.id && inScope(r.t));
    } catch (e) {}
    return false;
  }

  // ある店舗の当日の提出物リスト（今日出すもの）
  function todayItemsFor(store) {
    const today = dateKeyFor(store, Date.now());
    const yday = dateKeyFor(store, Date.now() - 864e5);
    return getMasters().filter(m => appliesToStore(m, store)).map(m => {
      // dueNextDay＝「前日分を翌日◯時までに出す」提出物（日報）。対象日は前日になる
      const prev = !!m.dueNextDay && m.freq === 'daily';
      const dk = prev ? yday : today;
      const holiday = isHoliday(store, dk);
      const manual = m.detect === 'none'; // 自動判定できない（手動運用）
      const submitted = manual ? null : (holiday ? true : detectSubmitted(store, m, dk));
      const st = getStatus(store, m.id, dk);
      const overdue = !manual && !submitted && !holiday && nowHMFor(store) > (m.due || '23:59') && m.freq === 'daily';
      return { m, dk, submitted, manual, holiday, overdue, status: st, prev };
    });
  }

  const OBLIG_LABEL = { required:{ja:'必須',en:'Required',vi:'Bắt buộc'}, store:{ja:'店舗運用',en:'Store-run',vi:'Cửa hàng'}, off:{ja:'対象外',en:'Off',vi:'Không'} };
  const JUDGE_LABEL = { '':{ja:'—',en:'—',vi:'—'}, in:{ja:'基準内',en:'In-std',vi:'Đạt'}, check:{ja:'要確認',en:'Check',vi:'Cần KT'}, out:{ja:'基準外',en:'Out-std',vi:'Không đạt'} };

  /* ---------- 店舗向け：提出物の行（今日／月次で共通） ---------- */
  const subItemRow = (it) => {
    const badgeTxt = it.manual ? L({ja:'手動',en:'Manual',vi:'Thủ công'}) : (it.submitted ? L({ja:'提出済',en:'Done',vi:'Đã nộp'}) : L({ja:'未提出',en:'To do',vi:'Chưa'}));
    const badgeCls = it.manual ? '' : (it.submitted ? 'b' : 'a');
    const due = it.m.freq === 'monthly' ? L({ja:'今月',en:'This month',vi:'Tháng này'})
      : it.m.freq === 'quarterly' ? L({ja:'今四半期',en:'This quarter',vi:'Quý này'})
      : it.m.freq === 'weekly' ? L({ja:'今週',en:'This week',vi:'Tuần này'})
      : it.prev ? `${L({ja:'前日分',en:'Yesterday',vi:'Hôm qua'})}（${esc(String(it.dk).slice(5))}）・${L({ja:'締切',en:'Due',vi:'Hạn'})} ${L({ja:'本日',en:'today',vi:'hôm nay'})} ${it.m.due}`
      : `${L({ja:'締切',en:'Due',vi:'Hạn'})} ${it.m.due}`;
    /* ★チェックリストは5種類（オープン／アイドル／クローズ／桜／定期衛生）が同じ画面を使う。
       ここで「どれを開くか」を渡さないと、前回見ていた種類が開いてしまう。
       （2026-08-12 渉さんのご指摘。オープンを押したのにアイドルが開く状態だった） */
    const openArg = it.m.ckMode ? ` data-tsubmode="${it.m.ckMode}"`
      : (it.m.linkApp === 'openphoto' ? ` data-tsubphoto="${esc(it.m.id)}"` : '');
    /* 「実施するだけ」の項目（卓上POPの交換など）は、開く画面が無い。
       写真も要らないので、その場で押せる「実施しました」を出す。
       押した記録は写真の提出と同じ置き場に残るので、本部からも実施状況が見える。 */
    const didBtn = (it.m.detect === 'didit' && !it.submitted)
      ? `<button class="mini" data-tdid="${esc(it.m.id)}">${L({ja:'実施しました',en:'Done',vi:'Đã làm'})}</button>` : '';
    /* 本部が用意したシートへの入口（コンプラチェックなど）。
       アプリの中に回答画面を作らず、本部のシートをそのまま開く（2026-08-12 案②）。 */
    const sheetBtn = isHttp(it.m.url)
      ? `<button class="mini" data-openurl="${esc(it.m.url)}">${L({ja:'シートを開く',en:'Open sheet',vi:'Mở bảng'})}${svg('chev')}</button>` : '';
    /* ★提出が済んだあとも開けるようにする（2026-08-12）。
       以前は提出済みになるとボタンが消えていた。見返したり、チェックを直したりできなくなるうえ、
       この一覧を唯一の入口にすると（報告タブから重複を外すと）どこからも開けなくなる。 */
    const openBtn = didBtn || sheetBtn || (it.m.linkApp
      ? `<button class="mini" data-tsub="${it.m.linkApp}"${openArg}>${
          it.submitted && !it.manual ? L({ja:'開く',en:'Open',vi:'Mở'}) : L({ja:'開いて提出',en:'Open',vi:'Mở'})
        }${svg('chev')}</button>` : '');
    const oflag = it.overdue ? ` <span style="color:#b23">${L({ja:'締切超過',en:'Overdue',vi:'Quá hạn'})}</span>` : '';
    const noentry = it.manual ? ` <span class="hint" style="display:inline">※${L({ja:'自動判定なし（店舗運用・手動）',en:'no auto-check (store-run/manual)',vi:'không tự KT (thủ công)'})}</span>` : '';
    // アプリで出せないもの＝どこへどう出すかを書いておく（現場が迷わないように）
    let howTxt = (!it.m.linkApp && it.m.how) ? `<div class="l2" style="color:var(--gray)">${esc(L(it.m.how))}</div>` : '';
    /* シートで出すもの（コンプラチェックなど）は、本部が場所を設定するまで開くボタンが出ない。
       説明だけがあってボタンが無いと「どこから開くのか」と迷うので、待ちの状態だと分かるように書く。
       （2026-08-12 渉さんのご指摘：説明に「下のボタンから」とあるのにボタンが無かった） */
    if ('url' in it.m && !isHttp(it.m.url)) {
      howTxt += `<div class="l2" style="color:var(--gray)">${L({
        ja:'※ 本部がシートを用意すると、ここから開けるようになります',
        en:'The sheet will open from here once HQ has set it up',
        vi:'Bảng sẽ mở được ở đây sau khi HQ thiết lập' })}</div>`;
    }
    return `<div class="rep"><span class="kind ${badgeCls}">${badgeTxt}</span>
      <div class="body"><div class="l1">${esc(L(it.m.name))} <small style="color:#8a8">(${L(OBLIG_LABEL[it.m.oblig])})</small></div>${howTxt}
      <div class="l2">${due}${oflag}${noentry}</div></div>${openBtn}</div>`;
  };

  /* ---------- 店舗向け：今日出すもの（日次） ---------- */
  APP_VIEWS.kyou = () => {
    const store = visibleStores()[0];
    const items = todayItemsFor(store).filter(it => it.m.freq === 'daily');
    const dk = dateKeyFor(store, Date.now());
    const holiday = isHoliday(store, dk);
    const remain = items.filter(it => !it.manual && !it.submitted).length;
    const rows = items.map(subItemRow).join('');
    return `
      <div class="card">
        <h3>${L({ja:'今日出すもの',en:'Today to submit',vi:'Cần nộp hôm nay'})} — ${esc(storeShort(store))} <small style="color:#8a8">${dk}</small></h3>
        ${holiday ? `<p class="hint" style="display:block">${L({ja:'本日は定休日として登録されています（未提出にはなりません）。',en:'Registered as a holiday today (not counted as missing).',vi:'Hôm nay là ngày nghỉ (không tính chưa nộp).'})}</p>` : `<p class="hint" style="display:block">${L({ja:'残り',en:'Remaining',vi:'Còn lại'})} ${remain} ${L({ja:'件（現地時間で判定）',en:'item(s) (store local time)',vi:'mục (giờ địa phương)'})}</p>`}
        ${rows}
      </div>
      <p class="hint" style="display:block">${L({ja:'※ 提出の有無は、実際の提出データ（全端末同期）から自動で判定しています。',en:'Status is auto-detected from real submitted data (synced).',vi:'Trạng thái tự nhận từ dữ liệu đã nộp (đồng bộ).'})}</p>`;
  };

  /* ---------- 店舗向け：今週出すもの（週次） ---------- */
  APP_VIEWS.shukan = () => {
    const store = visibleStores()[0];
    const items = todayItemsFor(store).filter(it => it.m.freq === 'weekly');
    const remain = items.filter(it => !it.manual && !it.submitted).length;
    const rows = items.length ? items.map(subItemRow).join('') : `<div class="muted">${L({ja:'今週の提出物はありません',en:'No weekly items',vi:'Không có mục tuần này'})}</div>`;
    return `
      <div class="card">
        <h3>${L({ja:'今週出すもの',en:'This week to submit',vi:'Cần nộp tuần này'})} — ${esc(storeShort(store))}</h3>
        <p class="hint" style="display:block">${L({ja:'今週分の提出物です。残り',en:'This week. Remaining',vi:'Trong tuần. Còn lại'})} ${remain} ${L({ja:'件',en:'item(s)',vi:'mục'})}</p>
        ${rows}
      </div>
      <p class="hint" style="display:block">${L({ja:'※ 週内に提出があれば自動で「提出済」になります。',en:'Marked done when submitted within the week.',vi:'Tự đánh dấu khi nộp trong tuần.'})}</p>`;
  };

  /* ---------- 店舗向け：月末・月次で出すもの（月次） ---------- */
  APP_VIEWS.getsuji = () => {
    const store = visibleStores()[0];
    const items = todayItemsFor(store).filter(it => it.m.freq === 'monthly' || it.m.freq === 'quarterly');
    const ym = new Date().toISOString().slice(0, 7);
    const remain = items.filter(it => !it.manual && !it.submitted).length;
    const rows = items.length ? items.map(subItemRow).join('') : `<div class="muted">${L({ja:'今月の提出物はありません',en:'No monthly items',vi:'Không có mục tháng này'})}</div>`;
    return `
      <div class="card">
        <h3>${L({ja:'月末・月次で出すもの',en:'Monthly to submit',vi:'Cần nộp hàng tháng'})} — ${esc(storeShort(store))} <small style="color:#8a8">${ym}</small></h3>
        <p class="hint" style="display:block">${L({ja:'今月分の提出物です。残り',en:'This month. Remaining',vi:'Trong tháng. Còn lại'})} ${remain} ${L({ja:'件',en:'item(s)',vi:'mục'})}</p>
        ${rows}
      </div>
      <p class="hint" style="display:block">${L({ja:'※ 月内に提出があれば自動で「提出済」になります（月次数値は「数値・原価率」画面の入力で判定）。',en:'Marked done when submitted within the month (numbers via the Cost screen).',vi:'Tự đánh dấu khi nộp trong tháng.'})}</p>`;
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
        ${masters.map(m => `<div class="rep"><span class="kind b">${L(OBLIG_LABEL[m.oblig])}</span><div class="body"><div class="l1">${esc(L(m.name))}</div><div class="l2">${L({daily:{ja:'毎日',en:'Daily',vi:'Hàng ngày'},weekly:{ja:'週1',en:'Weekly',vi:'Hàng tuần'},monthly:{ja:'月1',en:'Monthly',vi:'Hàng tháng'},quarterly:{ja:'四半期',en:'Quarterly',vi:'Hàng quý'}}[m.freq]||{ja:'毎日',en:'Daily',vi:'Hàng ngày'})} ・ ${L({ja:'締切',en:'Due',vi:'Hạn'})} ${m.due} ・ ${m.hqReview==='each'?L({ja:'本部確認あり',en:'HQ review',vi:'HQ duyệt'}):m.hqReview==='exception'?L({ja:'例外のみ本部',en:'Exceptions to HQ',vi:'Ngoại lệ HQ'}):L({ja:'本部確認なし',en:'No HQ review',vi:'Không HQ'})}</div></div></div>`).join('')}
        <p class="hint" style="display:block">${L({ja:'※ この設定はこの端末に保存されています。全店で共有するにはバックエンド接続（次段階）が必要です。',en:'Saved on this device. Cross-store sharing needs backend (next step).',vi:'Lưu trên máy này. Cần backend để chia sẻ (bước sau).'})}</p>
      </div>
      ${/* 本部が用意されたシートへの入口を設定する（コンプラチェックなど）。
            対象月ごとにシートが変わるため、本部の方がここで差し替えられるようにしている。 */''}
      ${masters.filter(m => 'url' in m).map(m => `
      <div class="card">
        <h3>${L({ja:'シートの場所',en:'Sheet link',vi:'Liên kết bảng'})} — ${esc(L(m.name))}</h3>
        <p class="hint" style="display:block">${L({ja:'ここに入れたシートが、店舗の「シートを開く」から開きます。対象月ごとに差し替えられます。',en:'Stores open this sheet from “Open sheet”. Replace it each period.',vi:'Cửa hàng mở bảng này từ “Mở bảng”. Có thể thay mỗi kỳ.'})}</p>
        <label class="fld"><span>${L({ja:'シートのURL',en:'Sheet URL',vi:'URL bảng'})}</span>
          <input type="url" id="msturl_${esc(m.id)}" value="${esc(m.url || '')}" placeholder="https://docs.google.com/..."></label>
        <button class="btn" data-msturl="${esc(m.id)}">${L({ja:'保存する',en:'Save',vi:'Lưu'})}</button>
        ${isHttp(m.url) ? `<button class="mini" data-openurl="${esc(m.url)}" style="margin-left:8px">${L({ja:'開いて確認',en:'Open',vi:'Mở'})}</button>` : ''}
      </div>`).join('')}
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
  /* 写真で出す提出物は、すべてこの1画面で受ける（2026-08-12 渉さんのご指摘で拡張）。
     以前はオープン写真だけをアプリで受け、月次の衛生写真とメニューブックの確認は
     グループLINEへ送っていただく設計だった。仕組みは同じなのに受けていなかっただけなので、
     同じ画面で受けるようにした（送り先を選ばずに済む＝アプリでまとまる、が本当になる）。
     どれを出すかは「今日出すもの」から渡す（チェックリストと同じ考え方）。 */
  const photoSubIds = () => getMasters().filter(m => m.detect === 'subrec' && m.linkApp === 'openphoto').map(m => m.id);
  const getPhotoTarget = () => {
    const v = localStorage.getItem('yosakura_photo_target');
    return photoSubIds().includes(v) ? v : 'openphoto';
  };
  // 何をどう撮るか（画面に出す案内）。項目が増えたらここに足す
  const PHOTO_HINTS = {
    openphoto: { ja:'開店時の店内・外観を1枚。', en:'One photo of the store at opening.', vi:'Một ảnh cửa hàng khi mở cửa.' },
    hygiene_m: { ja:'本部から今月指定された箇所の、清掃前と清掃後を撮ってください。', en:'Before and after photos of the spot assigned by HQ this month.', vi:'Ảnh trước và sau khi vệ sinh khu vực HQ chỉ định tháng này.' },
    menubook:  { ja:'メニューブックと販促物を並べて、汚れや破れが分かるように撮ってください。', en:'Lay out the menu books and POP so stains or tears are visible.', vi:'Bày menu và vật phẩm quảng bá để thấy rõ vết bẩn hoặc rách.' }
  };
  APP_VIEWS.openphoto = () => {
    const store = visibleStores()[0];
    const dk = dateKeyFor(store, Date.now());
    const target = getPhotoTarget();
    const m = getMasters().find(x => x.id === target) || { id:'openphoto', detect:'subrec', freq:'daily' };
    const done = detectSubmitted(store, m, dk);
    const title = L(m.name || { ja:'オープン写真', en:'Opening photo', vi:'Ảnh mở cửa' });
    const hint = L(PHOTO_HINTS[target] || PHOTO_HINTS.openphoto);
    const period = m.freq === 'monthly'
      ? L({ ja:'今月は提出済みです（追加提出も可）。', en:'Submitted this month (you can add more).', vi:'Đã nộp tháng này (có thể thêm).' })
      : L({ ja:'本日は提出済みです（追加提出も可）。', en:'Submitted today (you can add more).', vi:'Đã nộp hôm nay (có thể thêm).' });
    // 同じ提出物の履歴だけを出す（オープン写真の中に月次の写真が混ざらないように）
    const recent = subRows(SUB_KINDS.open)
      .filter(r => visibleStores().includes(r.store) && String(r.item || '').split('|')[0] === target)
      .sort((a, b) => b.t - a.t).slice(0, 6);
    return `
      <div class="card">
        <h3>${esc(title)} — ${esc(storeShort(store))}</h3>
        ${done ? `<p class="hint" style="display:block;color:#2a7">${period}</p>` : `<p class="hint" style="display:block">${esc(hint)}</p>`}
        ${photoSubIds().length > 1 ? `<div class="seg" data-seg="phtarget" style="margin:2px 0 12px">${
          photoSubIds().map(id => { const mm = getMasters().find(x => x.id === id) || {}; return `<button type="button" data-phtarget="${esc(id)}" class="${id===target?'on':''}">${esc(L(mm.name || id))}</button>`; }).join('')}</div>` : ''}
        <label class="fld"><span>${L({ja:'店舗',en:'Store',vi:'Cửa hàng'})}</span><select id="op_store">${visibleStores().map(s=>`<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ja:'写真',en:'Photos',vi:'Ảnh'})}</span>
          <div class="photo-drop" id="photoDrop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ja:'撮影して追加',en:'Take photos',vi:'Chụp ảnh'})}</b><br><small>${esc(hint)}</small></div><input type="file" accept="image/*" multiple id="f_photo" hidden></div>
          <div class="photo-thumbs" id="photoThumbs"></div>
        </label>
        <button class="btn-primary" data-topensubmit="1">${L({ja:'提出する',en:'Submit',vi:'Gửi'})}</button>
        <div class="hint">${L({ja:'※ 写真が無いと提出できません（提出漏れ防止）。',en:'A photo is required to submit.',vi:'Cần có ảnh mới gửi được.'})}</div>
      </div>
      <div class="card"><h3>${L({ja:'最近の提出',en:'Recent submissions',vi:'Đã nộp gần đây'})}</h3>
        ${recent.length ? recent.map(r=>{ const who = parseNote(r.note).by || ''; return `<div class="rep">${r.photos&&r.photos.length?`<img class="rep-photo" src="${photoThumb(r.photos[0])}" data-full="${photoFull(r.photos[0])}" alt="">`:`<span class="kind b">${L({ja:'写真',en:'Photo',vi:'Ảnh'})}</span>`}<div class="body"><div class="l1">${esc(storeShort(r.store))}</div><div class="l2">${timeAgo(r.t)}${who?' ・ '+esc(who):''}</div></div></div>`; }).join('') : `<div class="muted">${L({ja:'まだありません',en:'None yet',vi:'Chưa có'})}</div>`}
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
    // 公開待ちの投稿＝本部が「みんなの投稿」を開かないと気づけなかったため、受信箱にも出す。
    // 公開すると pending でなくなり、この一覧から自然に消える（「対応済み」では消さない）。
    try {
      getComm().filter(p => commState(p) === 'pending' && vis.includes(p.store)).forEach(p => {
        add('commpend', { ja:'公開待ちの投稿', en:'Pending post', vi:'Bài chờ duyệt' }, p.t, p.store, commCatLabel(p.cat), String(p.body || '').slice(0, 60), p.photos);
        const last = items[items.length - 1];
        last.ckey = commKey(p); last.state = '';
      });
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
      // 公開待ちの投稿だけは「公開する」で完了する（対応済みでは消さない＝未公開のまま埋もれないように）
      const st = i.kind === 'commpend'
        ? `<div class="l2"><button class="mini" data-commpub="${esc(i.ckey)}">${L({ja:'公開する',en:'Publish',vi:'Duyệt'})}</button> <button class="mini" data-commhide="${esc(i.ckey)}">${L({ja:'公開しない',en:'Do not publish',vi:'Không duyệt'})}</button></div>`
        : i.state === 'done'
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

  /* ---------- 提出者（誰が出したか）＝記録があるものだけ返す ---------- */
  function submitterOf(store, m, dk) {
    try {
      if (m.detect === 'subrec') {
        const r = subRows(SUB_KINDS.open)
          .filter(x => x.store === store && String(x.item || '').split('|')[0] === m.id && dateKeyFor(store, x.t) === dk)
          .sort((a, b) => b.t - a.t)[0];
        return r ? (parseNote(r.note).by || '') : '';
      }
      if (m.detect === 'sk') {
        const r = getSk().filter(x => x.store === store && (x.date || dateKeyFor(store, x.t)) === dk).sort((a, b) => b.t - a.t)[0];
        return r ? (r.by || '') : '';
      }
      if (m.detect === 'monthly') {
        const r = getMonthly().find(x => x.store === store && x.ym === String(dk).slice(0, 7));
        return r ? (r.by || '') : '';
      }
    } catch (e) {}
    return '';
  }

  /* ---------- 提出履歴（直近7日・実データ） ---------- */
  APP_VIEWS.history = () => {
    const store = visibleStores()[0];
    const masters = getMasters().filter(m => appliesToStore(m, store) && m.oblig !== 'off' && m.detect !== 'none');
    const days = []; for (let i = 0; i < 7; i++) days.push(dateKeyFor(store, Date.now() - i * 86400000));
    const rows = days.map(dk => {
      const chips = masters.map(m => { const sub = detectSubmitted(store, m, dk); const st = getStatus(store, m.id, dk); const jl = st.judge ? ` ${L(JUDGE_LABEL[st.judge])}` : ''; return `<span class="kind ${sub?'b':'a'}" style="margin:2px 4px 2px 0;display:inline-block">${esc(L(m.name))}${sub?'✓':'✗'}${jl}</span>`; }).join('');
      // 提出者＝その日に提出された記録から（同じ方が複数出していれば1回だけ表示）
      const who = [...new Set(masters.map(m => detectSubmitted(store, m, dk) ? submitterOf(store, m, dk) : '').filter(Boolean))];
      return `<div class="rep"><div class="body"><div class="l1">${dk}${isHoliday(store,dk)?` <small style="color:#8a8">(${L({ja:'定休日',en:'Holiday',vi:'Nghỉ'})})</small>`:''}</div><div class="l2">${chips || '—'}</div>${who.length?`<div class="l2">${L({ja:'提出者',en:'Submitted by',vi:'Người nộp'})}：${esc(who.join('・'))}</div>`:''}</div></div>`;
    }).join('');
    return `<div class="card"><h3>${L({ja:'提出履歴（直近7日）',en:'History (last 7 days)',vi:'Lịch sử (7 ngày)'})} — ${esc(storeShort(store))}</h3>${rows}
      <p class="hint" style="display:block">${L({ja:'※ 実際の提出データ（全端末同期）から表示しています。提出者は、お名前をご登録いただいた端末からの提出に記録されます。',en:'From real synced submission data. The submitter is recorded when a name is registered on the device.',vi:'Từ dữ liệu đã nộp (đồng bộ). Người nộp được ghi khi thiết bị đã đăng ký tên.'})}</p></div>`;
  };

  // 委譲イベント（$appは再描画で中身が入れ替わるが要素自体は残るため一度だけ登録）
  (function bindSubmissionOnce() {
    if (document.__subBound) return; document.__subBound = true;
    document.addEventListener('click', (e) => {
      // フィードバックの種類切替（このビュー内のセグメント）
      const fbSeg = e.target.closest('[data-seg="fbcat"] [data-v]');
      if (fbSeg) { document.querySelectorAll('[data-seg="fbcat"] button').forEach(x => x.classList.remove('on')); fbSeg.classList.add('on'); return; }
      const t = e.target.closest('[data-tsub],[data-tdid],[data-tmissing],[data-treminder],[data-tdrill],[data-tjudge],[data-thq],[data-timp],[data-topensubmit],[data-apitest],[data-apireset],[data-fbsend],[data-ackdone],[data-ackmemo],[data-inboxdone]');
      if (!t) return;
      if (t.dataset.inboxdone) { const cur = localStorage.getItem('yosakura_inbox_showdone') === '1'; localStorage.setItem('yosakura_inbox_showdone', cur ? '0' : '1'); render(); return; }
      if (t.dataset.ackdone) { setAck(t.dataset.ackdone, 'done', ''); toast(L({ja:'対応済みにしました',en:'Marked done',vi:'Đã đánh dấu xử lý'})); render(true); return; }
      if (t.dataset.ackmemo) {
        const memo = prompt(L({ja:'対応した内容をメモできます（任意）',en:'Add a note (optional)',vi:'Ghi chú (tùy chọn)'}) || '', '');
        if (memo === null) return;
        setAck(t.dataset.ackmemo, 'done', memo.trim());
        toast(L({ja:'対応済みにしました',en:'Marked done',vi:'Đã đánh dấu xử lý'})); render(true); return;
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
        // どの提出物として出すか（オープン写真／月次の衛生写真／メニューブック）
        const target = getPhotoTarget();
        const tm = getMasters().find(x => x.id === target);
        postSub(SUB_KINDS.open, store, `${target}|${dk}`, { by: submitterLabel(), role: getRole() }, photos);
        pushAudit('open_submit', store);
        toast(`${L(tm && tm.name || {ja:'オープン写真',en:'Opening photo',vi:'Ảnh mở cửa'})}${L({ja:'を提出しました。ありがとうございます！',en:' submitted. Thank you!',vi:' đã gửi. Cảm ơn!'})}`);
        go('/app/kyou');
        return;
      }
      // 「実施しました」＝画面を開かずにその場で記録する（卓上POPの交換など）
      if (t.dataset.tdid) {
        const store = visibleStores()[0];
        const mid = t.dataset.tdid;
        const mm = getMasters().find(x => x.id === mid);
        postSub(SUB_KINDS.open, store, `${mid}|${dateKeyFor(store, Date.now())}`, { by: submitterLabel(), role: getRole() }, []);
        pushAudit('did_submit', `${store}|${mid}`);
        toast(`${L(mm && mm.name || { ja:'実施', en:'Task', vi:'Việc' })}${L({ ja:'を記録しました。ありがとうございます！', en:' recorded. Thank you!', vi:' đã ghi nhận. Cảm ơn!' })}`);
        render(true); return;
      }
      // 同じ画面を複数の提出物が使うもの（チェックリスト5種／写真3種）は、どれを開くかを先に決めてから移動する
      if (t.dataset.tsub) {
        if (t.dataset.tsubmode) localStorage.setItem('yosakura_ckmode', t.dataset.tsubmode);
        if (t.dataset.tsubphoto) localStorage.setItem('yosakura_photo_target', t.dataset.tsubphoto);
        go(`/app/${t.dataset.tsub}`); return;
      }
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
  function seedMaterials() {
    if (localStorage.getItem('yosakura_demo_links')) return;
    saveLinks([
      { id:'lk_demo1', title:'世桜の理念・ブランドコア（例）', url:'', mcat:'philosophy', desc:'本部が実際のSlides/DocsのURLを登録します' },
      { id:'lk_demo2', title:'スタッフの基本・接客の心得（例）', url:'', mcat:'sevendays', desc:'登録するとタップで資料が開きます' }
    ]);
  }
  function seedCommunity() {
    if (localStorage.getItem('yosakura_demo_community')) return;
    const now = Date.now();
    // demo:true ＝ 見本のデータ。画面に「見本」の札を出して、実際の投稿と見分けられるようにする
    saveComm([
      { store:'寿司世桜 心斎橋店', cat:'guest', demo:true, body:'記念日でご来店のお客様に、メッセージ入りのデザートプレートをお出ししたら涙ぐんで喜んでくださいました。写真も撮らせていただきました！', by:'スタッフ', photos:[], t: now - 3600e3 * 6 },
      { store:'和牛世桜 広島店', cat:'play', demo:true, body:'お子様連れのお客様に待ち時間で折り紙をお渡ししたら大喜び。ご両親もゆっくりお食事できたと感謝されました。', by:'', photos:[], t: now - 3600e3 * 20 },
      { store:'日本鰻世桜 富士山店', cat:'win', demo:true, body:'今月のGoogle口コミが目標の30件を突破しました！スタッフ全員で「提供時の一言」を大切にした成果です。', by:'店長', photos:[], t: now - 3600e3 * 40 }
    ]);
    const map = {};
    getComm().forEach(p => { map[`${p.t}|${p.store}`] = { state:'published', t: p.t }; }); // デモは公開済みで表示
    try { localStorage.setItem('yosakura_demo_commmod', JSON.stringify(map)); } catch (e) {}
    // ポジティブシャワー（横展開）の見え方を示すための見本。
    // 1件目を「横展開」に指定し、2店舗が「うちでもやってみます」を押した状態にしておく。
    // ⚠️ これは見本データのみ。試験運用を始める際はこの3行を消す（本番のバックエンドには入らない）。
    const first = getComm()[0];
    if (first) {
      const key = `${first.t}|${first.store}`;
      try {
        localStorage.setItem('yosakura_demo_commroll', JSON.stringify({ [key]: { on:true, t: first.t } }));
        localStorage.setItem('yosakura_demo_commtry', JSON.stringify({ [key]: ['牛カツ世桜 長堀橋店', '日本鰻世桜 浅草橋店'] }));
      } catch (e) {}
    }
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

  /* ---------- 勉強会（8/7 増田さんご要望）----------
     月に一度の勉強会を、日程・録画・資料をひとまとめにして残す。
     参加できなかった方が後から追えることと、過去の回を探せることが目的。
     URLはコードに書かず、本部が登録した内容をバックエンドで共有する。 */
  const getStudy = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_study')) || []; } catch { return []; } };
  const saveStudy = (a) => { try { localStorage.setItem('yosakura_demo_study', JSON.stringify(a)); } catch (e) {} };
  const studyDateLabel = (d) => {
    const m = String(d || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return String(d || '');
    return m[3] ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : `${m[1]}年${Number(m[2])}月`;
  };
  const studyRow = (s, isHq) => {
    const docs = (s.docs || []).filter(d => d && isHttp(d.url));
    return `
      <div class="card">
        <h3 style="font-size:14px">${esc(s.title || '—')}${s.date ? `　<span class="muted" style="font-size:12px">${esc(studyDateLabel(s.date))}</span>` : ''}</h3>
        ${s.note ? `<p class="dtext">${esc(s.note)}</p>` : ''}
        <div class="homelinks">
          ${isHttp(s.video) ? `<button class="homelink" data-openurl="${esc(s.video)}"><span class="hl-ic">${svg('video')}</span><span class="hl-t">${L({ ja:'録画を見る', en:'Watch recording', vi:'Xem ghi hình' })}</span><span class="hl-c">${svg('chev')}</span></button>` : ''}
          ${docs.map(d => `<button class="homelink" data-openurl="${esc(d.url)}"><span class="hl-ic">${svg('book')}</span><span class="hl-t">${esc(d.title || L({ ja:'資料', en:'Material', vi:'Tài liệu' }))}</span><span class="hl-c">${svg('chev')}</span></button>`).join('')}
        </div>
        ${(!isHttp(s.video) && !docs.length) ? `<p class="muted">${L({ ja:'録画・資料はまだ登録されていません', en:'No recording or materials yet', vi:'Chưa có ghi hình/tài liệu' })}</p>` : ''}
        ${isHq ? `<div style="display:flex;gap:8px;margin-top:10px">
          <button class="mini" data-studyedit="${esc(s.id)}">${L({ ja:'編集する', en:'Edit', vi:'Sửa' })}</button>
          <button class="mini" data-studydel="${esc(s.id)}">${L({ ja:'削除する', en:'Delete', vi:'Xóa' })}</button>
        </div>` : ''}
      </div>`;
  };
  // 削除の前に必ず一度確認する（ボタンひとつで消えてしまわないように）
  function confirmSheet(title, body, okLabel, onOk) {
    const mask = el(`<div class="sheet-mask"><div class="sheet">
      <div class="grip"></div>
      <h3>${esc(title)}</h3>
      <p class="hint" style="display:block;margin:2px 0 14px">${esc(body)}</p>
      <button class="btn-primary" data-ok="1" style="background:#a23b3b">${esc(okLabel)}</button>
      <button class="mini" data-cancel="1" style="margin-top:10px">${L({ ja:'キャンセル', en:'Cancel', vi:'Hủy' })}</button>
    </div></div>`);
    mask.addEventListener('click', (e) => {
      if (e.target === mask || e.target.closest('[data-cancel]')) { mask.remove(); return; }
      if (e.target.closest('[data-ok]')) { mask.remove(); onOk(); }
    });
    document.body.appendChild(mask);
  }
  const getStudyEdit = () => { try { return localStorage.getItem('yosakura_study_edit') || ''; } catch { return ''; } };
  const setStudyEdit = (id) => { try { id ? localStorage.setItem('yosakura_study_edit', id) : localStorage.removeItem('yosakura_study_edit'); } catch (e) {} };
  APP_VIEWS.study = () => {
    const isHq = getRole() === 'hq';
    const list = getStudy().slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.t - a.t);
    // 編集中はフォームに既存の内容を出す（同じIDで上書きする）
    const editing = isHq ? list.find(s => s.id === getStudyEdit()) : null;
    const dv = (i, k) => { const d = (editing && editing.docs && editing.docs[i - 1]) || {}; return esc(d[k] || ''); };
    const docFields = [1, 2, 3].map(i => `
      <div class="sk-grid">
        <label class="fld"><span>${L({ ja:'資料' + i + ' の名前', en:'Material ' + i + ' name', vi:'Tên tài liệu ' + i })}</span>
          <input type="text" id="st_doc${i}_t" value="${dv(i, 'title')}" placeholder="${esc(L({ ja:'例）アジェンダスライド', en:'e.g. Agenda slides', vi:'vd: Slide chương trình' }))}"></label>
        <label class="fld"><span>${L({ ja:'資料' + i + ' のリンク', en:'Material ' + i + ' link', vi:'Link tài liệu ' + i })}</span>
          <input type="url" id="st_doc${i}_u" value="${dv(i, 'url')}" placeholder="https://..."></label>
      </div>`).join('');
    const form = isHq ? `
      <div class="card" id="studyForm">
        <h3>${editing ? L({ ja:'勉強会を編集', en:'Edit session', vi:'Sửa buổi học' }) : L({ ja:'勉強会を登録', en:'Add a study session', vi:'Thêm buổi học' })}</h3>
        ${editing ? `<p class="hint" style="display:block;margin:-4px 0 10px;color:#a23b3b">${L({ ja:'「' + (editing.title || '') + '」を編集しています。保存すると上書きされます。', en:'Editing an existing session; saving overwrites it.', vi:'Đang sửa; lưu sẽ ghi đè.' })}</p>` : ''}
        <div class="sk-grid">
          <label class="fld"><span>${L({ ja:'タイトル', en:'Title', vi:'Tiêu đề' })}</span>
            <input type="text" id="st_title" value="${esc((editing && editing.title) || '')}" placeholder="${esc(L({ ja:'例）2026年7月 勉強会', en:'e.g. July 2026 session', vi:'vd: Buổi học 7/2026' }))}"></label>
          <label class="fld"><span>${L({ ja:'開催日', en:'Date', vi:'Ngày' })}</span>
            <input type="date" id="st_date" value="${esc((editing && editing.date) || '')}"></label>
        </div>
        <label class="fld"><span>${L({ ja:'録画のリンク', en:'Recording link', vi:'Link ghi hình' })}</span>
          <input type="url" id="st_video" value="${esc((editing && editing.video) || '')}" placeholder="https://..."></label>
        ${docFields}
        <label class="fld"><span>${L({ ja:'メモ（任意）', en:'Note (optional)', vi:'Ghi chú' })}</span>
          <textarea id="st_note" placeholder="${esc(L({ ja:'テーマや、見てほしいところ', en:'Theme or highlights', vi:'Chủ đề / điểm chính' }))}">${esc((editing && editing.note) || '')}</textarea></label>
        <button class="btn-primary" id="studyAdd" style="margin-top:12px">${editing ? L({ ja:'保存する', en:'Save', vi:'Lưu' }) : L({ ja:'登録する', en:'Add', vi:'Thêm' })}</button>
        ${editing ? `<button class="mini" id="studyCancel" style="margin-top:10px">${L({ ja:'編集をやめる', en:'Cancel editing', vi:'Hủy sửa' })}</button>` : ''}
        <div class="hint">${L({ ja:'登録すると全店の「勉強会」に表示されます。リンクの共有設定（閲覧できる範囲）は、リンク元でご確認ください。', en:'Visible to all stores once added. Check sharing settings at the source.', vi:'Hiển thị cho mọi cửa hàng. Kiểm tra quyền chia sẻ ở nguồn.' })}</div>
      </div>` : '';
    return `
      ${NOTE({ ja:'◆ 勉強会の日程・録画・資料をまとめています。参加できなかった回も、あとから追えます', en:'◆ Study sessions: dates, recordings and materials in one place', vi:'◆ Buổi học: lịch, ghi hình và tài liệu' })}
      ${form}
      ${list.length ? list.map(s => studyRow(s, isHq)).join('')
        : `<div class="card"><p class="muted">${L({ ja:'まだ登録がありません。' + (isHq ? '上のフォームから登録できます。' : '本部が登録すると、ここに表示されます。'), en:'Nothing yet.', vi:'Chưa có.' })}</p></div>`}`;
  };

  /* ---------- みんなの投稿（コミュニティ／グッドストーリー）----------
     現場発のポジティブ投稿を全店で共有（お客様が喜んだこと・スタッフのファインプレー・達成など）。
     本部承認後に全店へ公開（事前モデレーション）。いいね（拍手）で認め合う。全端末同期。 */
  const COMM_CATS = [
    { v:'guest', t:{ ja:'お客様が喜んだ', en:'Guest delight', vi:'Khách vui' } },
    { v:'play',  t:{ ja:'スタッフのファインプレー', en:'Great play', vi:'Pha xử lý hay' } },
    { v:'win',   t:{ ja:'達成・記録', en:'Achievement', vi:'Thành tích' } },
    { v:'other', t:{ ja:'その他', en:'Other', vi:'Khác' } }
  ];
  const commCatLabel = (v) => { const f = COMM_CATS.find(x => x.v === v); return f ? L(f.t) : v; };
  const commKey = (p) => `${p.t}|${p.store}`;
  const getComm = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_community')) || []; } catch { return []; } };
  const saveComm = (a) => { try { localStorage.setItem('yosakura_demo_community', JSON.stringify(a)); } catch (e) {} };
  const getCommMod = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_commmod')) || {}; } catch { return {}; } };
  const getCommLike = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_commlike')) || {}; } catch { return {}; } };
  const getLiked = () => { try { return JSON.parse(localStorage.getItem('yosakura_comm_liked')) || []; } catch { return []; } };
  const commState = (p) => (getCommMod()[commKey(p)] || {}).state || 'pending';
  const commLikeN = (p) => Number(getCommLike()[commKey(p)] || 0);
  // 全店コミュニティ＝店舗で絞らない。非本部は公開済みのみ、本部は保留も見える。
  function commForView(list) {
    if (getRole() === 'hq') return list.slice();
    return list.filter(p => commState(p) === 'published');
  }
  function setCommState(key, state) {
    const map = getCommMod(); map[key] = { state, t: Date.now() };
    try { localStorage.setItem('yosakura_demo_commmod', JSON.stringify(map)); } catch (e) {}
    const store = key.split('|')[1] || '';
    lastSync = Date.now(); pushAudit('comm_' + state, key); render(true); // 一覧の途中で押すので位置を保つ
    postReport({ kind:'commmod', store, item:key, note: JSON.stringify({ state }), t: Date.now() });
  }
  /* ポジティブシャワー（横展開）＝2026-08-10 構築MTG A-05。
     良かったことを共感するだけで終わらせず、他店が「うちでもやってみます」と拾えるようにする。
     ・commroll＝本部が「広げたい」と指定（投稿キーごと最新が正）
     ・commtry ＝店舗が実施を表明（追記式・店舗名を重複なく集める） */
  const getCommRoll = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_commroll')) || {}; } catch { return {}; } };
  const getCommTry  = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_commtry')) || {}; } catch { return {}; } };
  const commRolled = (p) => !!(getCommRoll()[commKey(p)] || {}).on;
  const commTryStores = (p) => (getCommTry()[commKey(p)] || []);
  function setCommRoll(key, on) {
    const map = getCommRoll(); map[key] = { on, t: Date.now() };
    try { localStorage.setItem('yosakura_demo_commroll', JSON.stringify(map)); } catch (e) {}
    lastSync = Date.now(); pushAudit('comm_roll_' + (on ? 'on' : 'off'), key); render(true);
    postReport({ kind:'commroll', store: key.split('|')[1] || '', item:key, note: JSON.stringify({ on }), t: Date.now() });
  }
  /* 「うちでもやってみます」の表明と取り消し（2026-08-12 押し間違いに備えて取り消せるようにした）。
     ★バックエンドは追記だけで消せないため、取り消しは「取り消した」という記録を足して表す。
       同じ投稿×同じ店舗については、いちばん新しい記録が正（commroll と同じ考え方）。 */
  function setCommTry(key, store, on) {
    const map = getCommTry();
    const arr = (map[key] || []).filter(s => s !== store);
    if (on) arr.push(store);
    map[key] = arr;
    try { localStorage.setItem('yosakura_demo_commtry', JSON.stringify(map)); } catch (e) {}
    lastSync = Date.now(); render(true);
    postReport({ kind:'commtry', store, item:key, note: on ? '' : JSON.stringify({ on:false }), t: Date.now() });
  }
  /* いいねの取り消し。件数は合算方式なので、取り消しは -1 の記録を足して表す。
     数が負にならないように、足し合わせたあとで0で止める。 */
  function toggleCommLike(key) {
    const liked = getLiked(); const on = !liked.includes(key);
    const next = on ? liked.concat(key) : liked.filter(x => x !== key);
    try { localStorage.setItem('yosakura_comm_liked', JSON.stringify(next)); } catch (e) {}
    const map = getCommLike();
    map[key] = Math.max(0, Number(map[key] || 0) + (on ? 1 : -1));
    try { localStorage.setItem('yosakura_demo_commlike', JSON.stringify(map)); } catch (e) {}
    lastSync = Date.now(); render(true);
    postReport({ kind:'commlike', store: key.split('|')[1] || '', item:key, note: on ? '' : JSON.stringify({ off:true }), t: Date.now() });
  }

  const commBadge = (p) => {
    const st = commState(p);
    if (st === 'published') return `<span class="kind b">${esc(commCatLabel(p.cat))}</span>`;
    if (st === 'hidden')    return `<span class="kind a">${L({ ja:'非公開', en:'Hidden', vi:'Ẩn' })}</span>`;
    return `<span class="kind a">${L({ ja:'公開待ち', en:'Pending', vi:'Chờ duyệt' })}</span>`;
  };
  const commRow = (p) => {
    const key = commKey(p), liked = getLiked().includes(key), n = commLikeN(p), isHq = getRole() === 'hq', st = commState(p);
    const tryN = commTryStores(p).length, rolled = commRolled(p);
    const mod = isHq ? `<div class="l2" style="margin-top:6px">${st !== 'published'
        ? `<button class="mini" data-commpub="${esc(key)}">${L({ ja:'公開する', en:'Publish', vi:'Duyệt' })}</button>`
        : `<button class="mini on" data-commhide="${esc(key)}">${L({ ja:'公開中（取り下げ）', en:'Published (hide)', vi:'Đang hiện (ẩn)' })}</button>`}${
        st === 'published' ? `<button class="mini ${rolled ? 'on' : ''}" data-commroll="${esc(key)}" data-on="${rolled ? '1' : '0'}" style="margin-left:6px">${rolled
          ? L({ ja:'横展開中（解除）', en:'Rolling out (undo)', vi:'Đang nhân rộng (bỏ)' })
          : L({ ja:'横展開する', en:'Roll out', vi:'Nhân rộng' })}</button>` : ''}</div>` : '';
    return `<div class="rep" style="align-items:flex-start">
      ${commBadge(p)}
      ${rolled && st === 'published' ? `<span class="kind b">${L({ ja:'横展開', en:'Roll-out', vi:'Nhân rộng' })}</span>` : ''}
      ${p.demo ? `<span class="kind a">${L({ ja:'見本', en:'Sample', vi:'Mẫu' })}</span>` : ''}
      <div class="body">
        <div class="l1">${esc(p.body || '—')}</div>
        ${(p.photos && p.photos.length) ? `<div class="rep-photos">${p.photos.map(x => `<img class="rep-photo" src="${photoThumb(x)}" data-full="${photoFull(x)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        <div class="l2">${esc(storeShort(p.store))}${p.by ? ` ・${esc(p.by)}` : ''} ・ ${timeAgo(p.t)}</div>
        ${/* 押し間違えたときのために、いいね／やってみます は、もう一度押すと取り消せる（2026-08-12 渉さんのご要望）。
              押した後に固定してしまうと、取り消す手段がどこにも無くなる。 */''}
        <div class="l2" style="margin-top:6px"><button class="mini ${liked ? 'on' : ''}" data-commlike="${esc(key)}" title="${liked ? esc(L({ ja:'もう一度押すと取り消せます', en:'Tap again to undo', vi:'Chạm lại để hoàn tác' })) : ''}">${liked ? '♥' : '♡'} ${L({ ja:'いいね', en:'Like', vi:'Thích' })}${n ? ` ${n}` : ''}</button>${
          (st === 'published' && !isHq) ? (() => {
            const my = visibleStores()[0] || '';
            const done = commTryStores(p).includes(my);
            return `<button class="mini ${done ? 'on' : ''}" data-commtry="${esc(key)}" title="${done ? esc(L({ ja:'もう一度押すと取り消せます', en:'Tap again to undo', vi:'Chạm lại để hoàn tác' })) : ''}">${done
              ? L({ ja:'✓ うちでもやってみます', en:'✓ We will try this', vi:'✓ Chúng tôi sẽ thử' })
              : L({ ja:'うちでもやってみます', en:'We will try this', vi:'Chúng tôi sẽ thử' })}</button>`;
          })() : ''}</div>
        ${tryN ? `<div class="l2" style="margin-top:4px">${L({ ja:'取り入れた店舗', en:'Stores adopting', vi:'Cửa hàng áp dụng' })}：${tryN}　<span class="hint">${esc(commTryStores(p).map(storeShort).join('・'))}</span></div>` : ''}
        ${mod}
      </div>
    </div>`;
  };
  APP_VIEWS.community = () => {
    const isHq = getRole() === 'hq';
    const all = getComm().sort((a, b) => b.t - a.t);
    const list = commForView(all).slice(0, 40);
    const pend = isHq ? all.filter(p => commState(p) === 'pending').length : 0;
    const stores = visibleStores();
    const form = `
      <div class="card" id="commForm">
        <h3>${L({ ja:'エピソードを投稿', en:'Share a good story', vi:'Chia sẻ câu chuyện' })}</h3>
        <p class="hint" style="display:block">${L({ ja:'お客様に喜ばれたこと・スタッフのファインプレー・達成などを、全店で共有しましょう。', en:'Share guest delights, great plays and wins across all stores.', vi:'Chia sẻ khoảnh khắc khách vui, pha xử lý hay, thành tích.' })}</p>
        <label class="fld"><span>${L({ ja:'店舗', en:'Store', vi:'Cửa hàng' })}</span>
          <select id="comm_store">${stores.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'カテゴリ', en:'Category', vi:'Danh mục' })}</span>
          <div class="seg" data-seg="commcat">${COMM_CATS.map((c, i) => `<button type="button" data-v="${c.v}" class="${i === 0 ? 'on' : ''}">${L(c.t)}</button>`).join('')}</div></label>
        <label class="fld"><span>${L({ ja:'エピソード', en:'Story', vi:'Câu chuyện' })}</span>
          <textarea id="comm_body" placeholder="${esc(L({ ja:'例）常連のお客様のお誕生日に一言お祝いを添えたら、とても喜んでくださいました！', en:'e.g. We surprised a regular guest on their birthday…', vi:'vd: Chúc mừng sinh nhật khách quen…' }))}"></textarea></label>
        <label class="fld"><span>${L({ ja:'写真（任意）', en:'Photo (optional)', vi:'Ảnh (tùy chọn)' })}</span>
          <div class="photo-drop" id="photoDrop"><div class="ph-ico">${svg('camera')}</div><div><b style="font-size:13px">${L({ ja:'写真を追加', en:'Add photos', vi:'Thêm ảnh' })}</b></div><input type="file" accept="image/*" multiple id="f_photo" hidden></div>
          <div class="photo-thumbs" id="photoThumbs"></div></label>
        <label class="fld"><span>${L({ ja:'お名前・ニックネーム（任意）', en:'Name (optional)', vi:'Tên (tùy chọn)' })}</span>
          <input type="text" id="comm_by" placeholder="${esc(L({ ja:'例）田中', en:'e.g. Tanaka', vi:'vd: Tanaka' }))}"></label>
        <button class="btn-primary" id="submitComm">${L({ ja:'投稿する', en:'Post', vi:'Đăng' })}</button>
        <div class="hint">${L({ ja:'※ 投稿は本部の確認後に全店へ公開されます。', en:'Posts appear to all stores after HQ review.', vi:'Bài đăng sẽ hiển thị sau khi HQ duyệt.' })}</div>
      </div>`;
    return `
      ${NOTE({ ja:'◆ 現場発のグッドストーリーを全店で共有（本部承認後に公開）', en:'◆ Good stories from the field, shared across stores', vi:'◆ Câu chuyện hay từ cửa hàng' })}
      ${isHq && pend ? `<div class="card" style="border-color:#caa"><b>${L({ ja:'公開待ちの投稿', en:'Pending posts', vi:'Chờ duyệt' })}：${pend}</b><p class="hint" style="display:block">${L({ ja:'下の一覧で「公開する」を押すと全店に表示されます。', en:'Press Publish below to show to all stores.', vi:'Bấm Duyệt để hiển thị.' })}</p></div>` : ''}
      ${(() => {
        // ポジティブシャワー＝本部が「広げたい」と指定した取り組みを先頭にまとめる（8/10 構築MTG A-05）
        const roll = commForView(all).filter(p => commState(p) === 'published' && commRolled(p)).slice(0, 10);
        if (!roll.length) return '';
        return `<div class="card">
          <h3>${L({ ja:'ポジティブシャワー（横展開）', en:'Positive Shower (roll-out)', vi:'Positive Shower (nhân rộng)' })}</h3>
          <p class="hint" style="display:block">${L({
            ja:'勉強会で出た「良かったこと」を、共感して終わりにせず他店へ広げるための場所です。取り入れられそうなものは「うちでもやってみます」を押してください。',
            en:'Good practices worth spreading. Tap “We will try this” if your store can adopt it.',
            vi:'Những việc tốt đáng nhân rộng. Hãy bấm “Chúng tôi sẽ thử” nếu cửa hàng bạn có thể áp dụng.' })}</p>
          ${roll.map(commRow).join('')}
        </div>`;
      })()}
      ${form}
      <div class="card">
        <h3>${L({ ja:'みんなの投稿', en:'Community feed', vi:'Bảng tin' })}</h3>
        ${list.length ? list.map(commRow).join('') : `<div class="muted">${L({ ja:'まだ投稿はありません。最初の一件を投稿してみましょう！', en:'No posts yet — be the first!', vi:'Chưa có bài. Hãy là người đầu tiên!' })}</div>`}
      </div>`;
  };

  /* ---------- 学ぶ：資料・学習リンク（本部が編集・全端末同期／タップで資料を開く）----------
     Slides/Docs 等のURLをバックエンドに保存（公開リポジトリにURLを直書きしない）。
     一覧の最新版が正（linkset＝配列を丸ごと保存し最新採用）。 */
  const getLinks = () => { try { return JSON.parse(localStorage.getItem('yosakura_demo_links')) || []; } catch { return []; } };
  const saveLinks = (a) => { try { localStorage.setItem('yosakura_demo_links', JSON.stringify(a)); } catch (e) {} };
  const isHttp = (u) => /^https?:\/\//i.test(u || '');
  APP_VIEWS.materials = () => {
    const links = getLinks().slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    const opts = (sel) => MANUAL_GROUPS.map(g => `<option value="${g.v}"${g.v === sel ? ' selected' : ''}>${esc(L(g.t))}</option>`).join('');
    const linkRow = (l) => `<div class="rep" style="align-items:center;gap:8px">
        <span class="hl-ic" style="flex:0 0 auto">${svg('link')}</span>
        <div class="body" style="min-width:0"><div class="l1">${esc(l.title || l.url)}</div>
          <div class="l2">${l.desc ? esc(l.desc) + ' ・ ' : ''}${isHttp(l.url) ? `<button class="mini" data-openurl="${esc(l.url)}">${L({ ja:'開く', en:'Open', vi:'Mở' })}</button>` : ''}</div></div>
        <select class="mat-cat-sel" data-matcat="${esc(l.id)}" style="flex:0 0 auto;max-width:132px">${opts(l.mcat)}</select>
        <button class="mini" data-matdel="${esc(l.id)}" style="flex:0 0 auto">✕</button>
      </div>`;
    const counts = MANUAL_GROUPS.map(g => `${esc(L(g.t))} ${links.filter(l => l.mcat === g.v).length}`).join(' ／ ');
    const form = `
      <div class="card" id="matForm">
        <h3>${L({ ja:'資料リンクを追加（本部）', en:'Add a material link (HQ)', vi:'Thêm liên kết (HQ)' })}</h3>
        <label class="fld"><span>${L({ ja:'タイトル', en:'Title', vi:'Tiêu đề' })}</span>
          <input type="text" id="mat_title" placeholder="${esc(L({ ja:'例）世桜の理念・ブランドコア', en:'e.g. Brand philosophy', vi:'vd: Triết lý' }))}"></label>
        <label class="fld"><span>${L({ ja:'リンク（Slides/Docs等のURL）', en:'Link (URL)', vi:'Liên kết (URL)' })}</span>
          <input type="url" id="mat_url" placeholder="https://..."></label>
        <label class="fld"><span>${L({ ja:'大項目（マニュアルのどこに出すか）', en:'Manual group', vi:'Nhóm cẩm nang' })}</span>
          <select id="mat_cat">${MANUAL_GROUPS.map(g => `<option value="${g.v}">${esc(L(g.t))}</option>`).join('')}</select></label>
        <label class="fld"><span>${L({ ja:'ひとことメモ（任意）', en:'Note (optional)', vi:'Ghi chú' })}</span>
          <input type="text" id="mat_desc"></label>
        <button class="btn-primary" id="matAdd">${L({ ja:'追加する', en:'Add', vi:'Thêm' })}</button>
        <div class="hint">${L({ ja:'追加すると全店のマニュアルに反映されます。', en:'Reflected in all stores.', vi:'Áp dụng toàn bộ.' })}</div>
      </div>`;
    return `
      ${NOTE({ ja:'◆ 資料の登録と、マニュアルの大項目への振り分け（本部専用）。右のプルダウンで大項目を選ぶだけで、その場で反映されます。', en:'◆ Register materials and pick the manual group from the dropdown (HQ).', vi:'◆ Đăng ký & chọn nhóm bằng menu (HQ).' })}
      ${form}
      <div class="card">
        <h3>${L({ ja:'登録済みの資料', en:'Registered materials', vi:'Tài liệu đã đăng ký' })} <small style="color:#8a8">${links.length}</small></h3>
        <p class="hint" style="display:block">${L({ ja:'各資料の右の選択で「大項目」を変更（すぐ反映・全店に同期）。', en:'Change each material’s group with the dropdown (synced).', vi:'Đổi nhóm bằng menu (đồng bộ).' })}</p>
        ${links.length ? links.map(linkRow).join('') : `<div class="muted">${L({ ja:'まだ資料が登録されていません。上のフォームから追加できます。', en:'No materials yet.', vi:'Chưa có tài liệu.' })}</div>`}
      </div>
      ${links.length ? `<p class="hint" style="display:block">${L({ ja:'大項目ごとの件数', en:'Count by group', vi:'Số theo nhóm' })}：${counts}</p>` : ''}`;
  };

  // 提出管理モジュールをアプリ一覧へ追加（店舗ロール中心・本部も閲覧可）
  if (!appById('openphoto')) {
    // 2026-08-12：日次業務・月次業務から開くため、タブの一覧には出さない（同じものが二重に並んでいた）
    APPS.unshift({ id:'openphoto', group:'genba', icon:'camera', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'写真の提出', en:'Photo submission', vi:'Nộp ảnh' },
      desc:{ ja:'オープン写真・月次の衛生写真・メニューブックの確認', en:'Opening photo, monthly hygiene, menu book', vi:'Ảnh mở cửa, vệ sinh tháng, menu' } });
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
  // 体験版では接続先の切り替えそのものを出さない（配る版なので、触れる余地を残さない）
  if (!appById('backend') && !TAIKEN) {
    APPS.push({ id:'backend', group:'hq', icon:'lock', roles:['hq'],
      name:{ ja:'バックエンド設定', en:'Backend settings', vi:'Cài đặt backend' },
      desc:{ ja:'データの保存先（専用／共用）を切り替え', en:'Switch data backend (dedicated/shared)', vi:'Đổi nơi lưu dữ liệu' } });
  }
  /* 日次・週次・月次は、ホームの「提出・業務」に常に出ている（全役割）。
     タブにも並べると同じものが2か所になるため、タブの一覧には出さない（2026-08-12 渉さんのご指摘）。
     これで「報告する」＝気づいたときに出すもの、ホーム＝今日やること、と役割が分かれる。 */
  if (!appById('kyou')) {
    APPS.unshift({ id:'kyou', group:'genba', icon:'check', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'今日出すもの', en:'Today to submit', vi:'Cần nộp hôm nay' },
      desc:{ ja:'当日の提出物と未提出をひと目で', en:'Today’s items & missing at a glance', vi:'Mục cần nộp & còn thiếu' } });
  }
  if (!appById('shukan')) {
    APPS.unshift({ id:'shukan', group:'genba', icon:'calendar', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'今週出すもの', en:'This week to submit', vi:'Cần nộp tuần này' },
      desc:{ ja:'今週の提出物と未提出をひと目で', en:'This week’s items & missing', vi:'Mục tuần & còn thiếu' } });
  }
  if (!appById('getsuji')) {
    APPS.unshift({ id:'getsuji', group:'genba', icon:'calendar', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'月末・月次で出すもの', en:'Monthly to submit', vi:'Cần nộp hàng tháng' },
      desc:{ ja:'今月の提出物と未提出をひと目で', en:'This month’s items & missing', vi:'Mục tháng & còn thiếu' } });
  }
  if (!appById('news')) {
    // 8/7 増田さん: 学ぶタブからは外す。ホームのお知らせカードから開く（そちらへ統合済み）
    APPS.push({ id:'news', group:'learn', icon:'bell', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'お知らせ', en:'Announcements', vi:'Thông báo' },
      desc:{ ja:'本部からのお知らせ・世桜ニュース', en:'News & notices from HQ', vi:'Thông báo & tin tức từ HQ' } });
  }
  if (!appById('study')) {
    APPS.push({ id:'study', group:'learn', icon:'grad', live:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'勉強会', en:'Study sessions', vi:'Buổi học' },
      desc:{ ja:'日程・録画・資料をまとめて確認（過去の回も見られます）', en:'Dates, recordings and materials', vi:'Lịch, ghi hình và tài liệu' } });
  }
  if (!appById('emergency')) {
    APPS.push({ id:'emergency', group:'genba', icon:'phone', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'緊急連絡先', en:'Emergency contacts', vi:'Liên hệ khẩn cấp' },
      desc:{ ja:'警察・消防・設備業者など、店舗別にすぐ確認', en:'Police, fire, vendors — by store', vi:'Cảnh sát, cứu hỏa, đơn vị — theo cửa hàng' } });
  }
  if (!appById('whistle')) {
    APPS.push({ id:'whistle', group:'genba', icon:'shield', live:true, tabHide:true, roles:['staff','manager','owner','hq'],
      name:{ ja:'公益通報・コンプラ窓口', en:'Whistleblowing', vi:'Tố giác / Tuân thủ' },
      desc:{ ja:'相談しにくい問題を本部へ直接（固定）', en:'Report directly to HQ (fixed item)', vi:'Báo cáo trực tiếp tới HQ (cố định)' } });
  }

  function render(keepScroll) {
    const y = keepScroll ? (window.scrollY || window.pageYOffset || 0) : 0;
    const { path, params } = currentRoute();
    let html;
    if (path.startsWith('/app/')) html = viewApp(path.slice(5));
    else if (path === '/store') html = viewStore(params.get('s') || '', params.get('ym') || ''); // 個店カルテ
    else if (path === '/home') html = viewHome(params.get('tab') || 'home');
    else html = viewHome('home');
    $app.innerHTML = html;
    window.scrollTo(0, y);
    /* ★別の画面へ移ったのに、前の画面で読んでいた位置のまま始まることがあった（2026-08-12 渉さんのご指摘）。
       中身を入れ替えた直後は高さがまだ決まっておらず、一度の scrollTo では戻りきらないため、
       描き直しが終わったあとにもう一度いちばん上へ送る。位置を保つとき（keepScroll）はそのまま。 */
    if (!keepScroll && typeof requestAnimationFrame === 'function') requestAnimationFrame(() => window.scrollTo(0, 0));
    bind();
  }

  function bind() {
    const byId = (id) => document.getElementById(id);
    // どの画面でも共有バックエンドから最新を取得（3秒スロットル）＝全端末で同期
    if (useBackend()) syncReports();
    if (byId('langBtn')) byId('langBtn').onclick = openLangSheet;
    if (byId('roleBtn')) byId('roleBtn').onclick = openIdentitySheet;
    if (byId('pinEdit')) byId('pinEdit').onclick = openPinSheet;
    if (byId('installBtn')) byId('installBtn').onclick = triggerInstall;
    if (byId('installDismiss')) byId('installDismiss').onclick = () => { localStorage.setItem('yosakura_install_hide', '1'); render(); };
    if (byId('backBtn')) byId('backBtn').onclick = () => go('/home');

    document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab === 'home' ? '/home' : `/home?tab=${b.dataset.tab}`));
    // 総括表のビジュアル：期間/指標の切替・個店カルテ・その日の日報
    document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    document.querySelectorAll('[data-storelink]').forEach(b => b.onclick = () => go(`/store?s=${encodeURIComponent(b.dataset.storelink)}`));
    document.querySelectorAll('[data-skday]').forEach(b => b.onclick = () => openSkDay(b.dataset.skday));
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
        if (byId('pl_goal')) byId('pl_goal').value = ex && ex.goal ? ex.goal : '';
        if (byId('pl_open')) byId('pl_open').value = (ex && ex.open != null && ex.open !== '') ? ex.open : plPrevClose(store, ym); // 前月末在庫→月初へ
        recalc();
      };
      if (byId('plSave')) byId('plSave').onclick = () => {
        const store = visibleStores()[0], ym = byId('pl_ym').value;
        if (!ym) { toast(L({ ja:'対象月を選んでください', en:'Pick a month', vi:'Chọn tháng' })); return; }
        const rec = { store, ym, sales: num('pl_sales'), purchase: num('pl_purchase'), open: num('pl_open'), close: num('pl_close'), goal: num('pl_goal'), by: submitterLabel(), t: Date.now() };
        const arr = getMonthly().filter(r => !(r.store === store && r.ym === ym)); arr.push(rec);
        try { saveMonthly(arr.slice(-300)); } catch (e) { saveMonthly(arr.slice(-120)); }
        lastSync = rec.t;
        toast(L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' })); render();
        postReport({ kind:'monthly', store, note: JSON.stringify({ ym, sales: rec.sales, purchase: rec.purchase, open: rec.open, close: rec.close, goal: rec.goal, by: rec.by }), t: rec.t });
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

    // 勉強会：本部が登録／削除（全端末へ同期）
    const studyAdd = byId('studyAdd');
    if (studyAdd) studyAdd.onclick = () => {
      const v = (id) => { const e = byId(id); return e ? String(e.value || '').trim() : ''; };
      const title = v('st_title');
      if (!title) { toast(L({ ja:'タイトルを入力してください', en:'Please enter a title', vi:'Vui lòng nhập tiêu đề' })); return; }
      const docs = [1, 2, 3].map(i => ({ title: v(`st_doc${i}_t`), url: v(`st_doc${i}_u`) })).filter(d => isHttp(d.url));
      const editId = getStudyEdit(); // 編集中は同じIDで上書きする
      const rec = { id: editId || ('st' + Date.now()), title, date: v('st_date'), video: v('st_video'), docs, note: v('st_note'), t: Date.now() };
      const arr = getStudy().filter(s => s.id !== rec.id); arr.push(rec);
      try { saveStudy(arr.slice(-120)); } catch (e) { saveStudy(arr.slice(-40)); }
      setStudyEdit(''); lastSync = rec.t;
      toast(editId ? L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' }) : L({ ja:'登録しました', en:'Added', vi:'Đã thêm' })); render();
      postReport({ kind:'study', store:'', item: rec.id, note: JSON.stringify(rec), t: rec.t });
    };
    // 編集：フォームへ読み込む（画面の上へ戻す）
    document.querySelectorAll('[data-studyedit]').forEach(b => b.onclick = () => {
      setStudyEdit(b.dataset.studyedit); render();
      try { window.scrollTo(0, 0); } catch (e) {}
    });
    if (byId('studyCancel')) byId('studyCancel').onclick = () => { setStudyEdit(''); render(); };
    // 削除：必ず確認してから（ボタンひとつで消えないように）
    document.querySelectorAll('[data-studydel]').forEach(b => b.onclick = () => {
      const id = b.dataset.studydel;
      const target = getStudy().find(s => s.id === id);
      confirmSheet(
        L({ ja:'この勉強会を削除しますか？', en:'Delete this session?', vi:'Xóa buổi học này?' }),
        (target && target.title ? '「' + target.title + '」' : '') + L({ ja:'を削除します。録画・資料のリンクも一覧から消えます（元のファイルは消えません）。この操作は取り消せません。', en:'The links will be removed from the list. The source files are not deleted. This cannot be undone.', vi:'Liên kết sẽ bị xóa khỏi danh sách. Tệp gốc không bị xóa.' }),
        L({ ja:'削除する', en:'Delete', vi:'Xóa' }),
        () => {
          const arr = getStudy().filter(s => s.id !== id); saveStudy(arr);
          if (getStudyEdit() === id) setStudyEdit('');
          const t = Date.now(); lastSync = t;
          toast(L({ ja:'削除しました', en:'Deleted', vi:'Đã xóa' })); render();
          postReport({ kind:'study', store:'', item: id, note: JSON.stringify({ id, deleted: true }), t });
        }
      );
    });

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
      render(true); // 一覧の途中で押すので、読んでいた位置を保つ
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
      const kindEl = document.querySelector('[data-seg="kind"] .on');
      const kind = kindEl ? kindEl.dataset.v : 'a'; // 初期は食べ残し(a)のみ
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

    // みんなの投稿：投稿（本部承認後に公開）
    const subComm = document.getElementById('submitComm');
    if (subComm) subComm.onclick = () => {
      const catEl = document.querySelector('[data-seg="commcat"] .on');
      const cat = catEl ? catEl.dataset.v : 'guest';
      const store = (document.getElementById('comm_store') || {}).value || visibleStores()[0];
      const body = ((document.getElementById('comm_body') || {}).value || '').trim();
      if (!body) { toast(L({ ja:'エピソードを入力してください', en:'Please enter your story', vi:'Vui lòng nhập nội dung' })); return; }
      const by = ((document.getElementById('comm_by') || {}).value || '').trim();
      const thumbsEl = document.getElementById('photoThumbs');
      const photos = thumbsEl ? Array.from(thumbsEl.querySelectorAll('.pt')).map(w => w.dataset.thumb).filter(Boolean).slice(0, 4) : [];
      const t = Date.now();
      const arr = getComm(); arr.push({ store, cat, body, by, photos, t });
      try { saveComm(arr.slice(-200)); } catch (e) { saveComm(arr.slice(-60)); }
      lastSync = t;
      toast(L({ ja:'投稿しました！本部の確認後に全店へ公開されます。', en:'Posted! It will appear after HQ review.', vi:'Đã đăng! Sẽ hiển thị sau khi HQ duyệt.' }));
      render();
      postReport({ kind:'community', store, item:cat, note: JSON.stringify({ body, by }), photos, t });
    };
    // いいね（拍手）＝この端末で一度だけ。カウントは全端末で合算。
    // ポジティブシャワー：本部が横展開に指定／店舗が「うちでもやってみます」
    document.querySelectorAll('[data-commroll]').forEach(b => b.onclick = () => setCommRoll(b.dataset.commroll, b.dataset.on !== '1'));
    // 押し間違えたときのために、もう一度押すと取り消せる（2026-08-12 渉さんのご要望）
    document.querySelectorAll('[data-commtry]').forEach(b => b.onclick = () => {
      const my = visibleStores()[0] || '';
      if (!my) { toast(L({ ja:'店舗が選ばれていません', en:'No store selected', vi:'Chưa chọn cửa hàng' })); return; }
      const key = b.dataset.commtry;
      const on = !commTryStores({ t: Number(key.split('|')[0]), store: key.split('|')[1] || '' }).includes(my);
      setCommTry(key, my, on);
      toast(on
        ? L({ ja:'ありがとうございます！本部と各店に共有されます', en:'Thanks! Shared with HQ and all stores', vi:'Cảm ơn! Đã chia sẻ với HQ và các cửa hàng' })
        : L({ ja:'取り消しました', en:'Undone', vi:'Đã hoàn tác' }));
    });
    document.querySelectorAll('[data-commlike]').forEach(b => b.onclick = () => {
      const key = b.dataset.commlike;
      const was = getLiked().includes(key);
      toggleCommLike(key);
      if (was) toast(L({ ja:'いいねを取り消しました', en:'Like removed', vi:'Đã bỏ thích' }));
    });
    // 本部：公開／非公開
    document.querySelectorAll('[data-commpub]').forEach(b => b.onclick = () => setCommState(b.dataset.commpub, 'published'));
    document.querySelectorAll('[data-commhide]').forEach(b => b.onclick = () => setCommState(b.dataset.commhide, 'hidden'));

    // 資料・学習リンク：本部が追加／削除（全端末同期）・誰でもタップで開く
    const matAdd = document.getElementById('matAdd');
    if (matAdd) matAdd.onclick = () => {
      const title = ((byId('mat_title') || {}).value || '').trim();
      const url = ((byId('mat_url') || {}).value || '').trim();
      const mcat = (byId('mat_cat') || {}).value || (MANUAL_GROUPS[0] && MANUAL_GROUPS[0].v) || '';
      const desc = ((byId('mat_desc') || {}).value || '').trim();
      if (!title || !isHttp(url)) { toast(L({ ja:'タイトルと正しいURL（https://）を入力してください', en:'Enter a title and a valid https URL', vi:'Nhập tiêu đề và URL https hợp lệ' })); return; }
      const links = getLinks(); links.push({ id:'lk' + Date.now(), title, url, mcat, desc });
      saveLinks(links); const t = Date.now(); lastSync = t;
      toast(L({ ja:'資料リンクを追加しました', en:'Material added', vi:'Đã thêm' })); render();
      postReport({ kind:'linkset', store:'', note: JSON.stringify(links), t });
    };
    document.querySelectorAll('[data-matdel]').forEach(b => b.onclick = () => {
      const links = getLinks().filter(l => l.id !== b.dataset.matdel);
      saveLinks(links); const t = Date.now(); lastSync = t; render(true);
      postReport({ kind:'linkset', store:'', note: JSON.stringify(links), t });
    });
    // 大項目をプルダウンで変更（本部）→ その場で反映・スクロール位置は保持・全端末同期
    document.querySelectorAll('[data-matcat]').forEach(s => s.onchange = () => {
      const links = getLinks(); const l = links.find(x => x.id === s.dataset.matcat); if (!l) return;
      l.mcat = s.value;
      saveLinks(links); const t = Date.now(); lastSync = t; render(true);
      postReport({ kind:'linkset', store:'', note: JSON.stringify(links), t });
    });
    // よくある質問（ルール集）：本部が項目を追加・削除→全端末同期（faqset＝配列を丸ごと保存し最新版が正）
    const faqAdd = document.getElementById('faqAdd');
    if (faqAdd) faqAdd.onclick = () => {
      const q = ((byId('faq_q') || {}).value || '').trim();
      const a = ((byId('faq_a') || {}).value || '').trim();
      const cat = (byId('faq_cat') || {}).value || 'other';
      if (!q || !a) { toast(L({ ja:'質問と答えの両方を入力してください', en:'Enter both a question and an answer', vi:'Nhập cả câu hỏi và câu trả lời' })); return; }
      const list = getFaq(); list.push({ id:'fq' + Date.now(), cat, q, a });
      saveFaq(list); const t = Date.now(); lastSync = t; faqEditId = null;
      toast(L({ ja:'追加しました', en:'Added', vi:'Đã thêm' })); render();
      postReport({ kind:'faqset', store:'', note: JSON.stringify(list), t });
    };
    const faqPush = (list) => {
      saveFaq(list); const t = Date.now(); lastSync = t; render(true);
      postReport({ kind:'faqset', store:'', note: JSON.stringify(list), t });
    };
    document.querySelectorAll('[data-faqedit]').forEach(b => b.onclick = () => { faqEditId = b.dataset.faqedit; render(true); });
    document.querySelectorAll('[data-faqcancel]').forEach(b => b.onclick = () => { faqEditId = null; render(true); });
    document.querySelectorAll('[data-faqsave]').forEach(b => b.onclick = () => {
      const id = b.dataset.faqsave;
      const q = ((byId('faqe_q') || {}).value || '').trim();
      const a = ((byId('faqe_a') || {}).value || '').trim();
      const cat = (byId('faqe_cat') || {}).value || 'other';
      if (!q || !a) { toast(L({ ja:'質問と答えの両方を入力してください', en:'Enter both a question and an answer', vi:'Nhập cả câu hỏi và câu trả lời' })); return; }
      const list = getFaq(); const i = list.findIndex(f => f && f.id === id);
      if (i >= 0) list[i] = Object.assign({}, list[i], { cat, q, a, deleted:false });
      else list.push({ id, cat, q, a });   // 会議で決まったルールを直した場合は「上書き」として持つ
      faqEditId = null; toast(L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' })); faqPush(list);
    });
    document.querySelectorAll('[data-faqdel]').forEach(b => b.onclick = () => {
      const id = b.dataset.faqdel; const list = getFaq();
      if (/^fx_/.test(id)) {   // 会議で決まったルールはコードに残るため「非表示」として保存する
        const i = list.findIndex(f => f && f.id === id);
        if (i >= 0) list[i] = Object.assign({}, list[i], { deleted:true }); else list.push({ id, deleted:true });
        faqEditId = null; faqPush(list); return;
      }
      faqEditId = null; faqPush(list.filter(f => f.id !== id));
    });

    document.querySelectorAll('[data-openurl]').forEach(b => b.onclick = () => window.open(b.dataset.openurl, '_blank', 'noopener'));

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
    // 画面下の「最新にする」（古い画面のまま動いていないか、誰でも自分で確かめられるように）
    const upd = document.getElementById('appUpdate'); if (upd) upd.onclick = forceUpdate;
    // 使い方を順番に見る（役割ごとの案内をもう一度）
    document.querySelectorAll('[data-guide-tour]').forEach(b => b.onclick = () => openTour(0));
    document.querySelectorAll('[data-ckmode]').forEach(b => b.onclick = () => { localStorage.setItem('yosakura_ckmode', b.dataset.ckmode); render(); });
    // 本部：シートの場所を保存する（コンプラチェックなど・全端末へ共有）
    document.querySelectorAll('[data-msturl]').forEach(b => b.onclick = () => {
      const id = b.dataset.msturl;
      const el = document.getElementById(`msturl_${id}`);
      const url = ((el && el.value) || '').trim();
      if (url && !isHttp(url)) { toast(L({ ja:'https で始まるURLを入れてください', en:'Enter a URL starting with https', vi:'Nhập URL bắt đầu bằng https' })); return; }
      const list = getMasters().map(m => m.id === id ? Object.assign({}, m, { url }) : m);
      saveMasters(list);
      toast(L({ ja:'保存しました', en:'Saved', vi:'Đã lưu' }));
      render(true);
    });
    // 写真の提出物の切り替え（オープン写真／月次の衛生写真／メニューブック）
    document.querySelectorAll('[data-phtarget]').forEach(b => b.onclick = () => { localStorage.setItem('yosakura_photo_target', b.dataset.phtarget); render(); });
    // 定期衛生：曜日の切替（手が空いていれば他の曜日を先に実施してもよい運用）
    document.querySelectorAll('[data-hygday]').forEach(b => b.onclick = () => { localStorage.setItem('yosakura_hygday', `${todayKey()}|${b.dataset.hygday}`); render(); });
    // チェックのON/OFF（店舗×モード×当日で保存）
    document.querySelectorAll('[data-ck]').forEach(row => row.onclick = (e) => {
      if (e.target.closest('[data-ckdel]')) return; // 削除ボタンは別処理
      const store = visibleStores()[0], mode = getCkMode(), key = ckDoneKey(store, mode), id = row.dataset.ck;
      const map = getCkDone(); const day = map[key] || {}; day[id] = !day[id]; map[key] = day;
      // 古い日付のチェックは肥大化防止のため間引く（直近14日分のみ保持）
      const keep = {}; const keys = Object.keys(map).sort().slice(-40); keys.forEach(k => keep[k] = map[k]);
      saveCkDone(keep);
      // 実施状況をオーナー・本部からも見えるように共有する（店舗×モード×日付ごと最新が正）
      const t = Date.now(); lastSync = t;
      const meta = getCkMeta(); meta[key] = { by: submitterLabel(), t };
      try { localStorage.setItem('yosakura_demo_ckmeta', JSON.stringify(meta)); } catch (e) {}
      // ★1項目チェックするたびに画面の先頭へ戻っていた（2026-08-12 渉さんのご指摘）。
      //   上から順に押していく画面なので、押すたびに戻ると実質使えない。読んでいた位置を保つ。
      render(true);
      postReport({ kind:'ckdone', store, item:`${mode}||${todayKey()}`, note: JSON.stringify({ done: day, by: submitterLabel() }), t });
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
      toast(L({ ja:'追加しました', en:'Added', vi:'Đã thêm' })); render(true); // 画面の下のほうにあるので位置を保つ
      postReport({ kind:'ckitem', store, note: JSON.stringify({ mode, items: list }), t });
    };
    // 店舗独自項目：削除
    document.querySelectorAll('[data-ckdel]').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      const store = visibleStores()[0], mode = getCkMode(), mk2 = `${store}||${mode}`, id = b.dataset.ckdel;
      const all = getCkItems(); const list = (all[mk2] || []).filter(c => c.id !== id);
      all[mk2] = list; saveCkItems(all);
      const t = Date.now(); lastSync = t;
      toast(L({ ja:'削除しました', en:'Removed', vi:'Đã xóa' })); render(true); // 画面の下のほうにあるので位置を保つ
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
        cancel: v('sk_cancel'), closer: v('sk_closer'), order: v('sk_order'),
        // 総括表 Ver.2.6 に合わせて足した項目
        cash: v('sk_cash'), card: v('sk_card'), lunch: v('sk_lunch'), buy: v('sk_buy'),
        supply: v('sk_supply'), unagi: v('sk_unagi'), errnote: v('sk_errnote'),
        // 国別の組数・人数（入力のあるものだけ残す＝空欄は保存しない）
        cty: SK_COUNTRIES.concat(SK_VISITKIND).reduce((o, cn) => {
          const g = v(`sk_cty_${cn.k}_g`), p = v(`sk_cty_${cn.k}_p`);
          if (g || p) o[cn.k] = { g: Number(g) || 0, p: Number(p) || 0 };
          return o;
        }, {}),
        by: submitterLabel(), t: Date.now()
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
    const food=[], subs=[], kz=[], route=[], open=[], sk=[], survey=[], svfb=[], video=[], whistle=[], news=[], comm=[]; const emg={}; const ckitem={}, ckitemT={}; const ckdone={}, ckmeta={}, ckdoneT={}; const study={}, studyT={}; const monthly={}, monthlyT={}; const commmod={}, commmodT={}, commlike={}; const commroll={}, commrollT={}, commtry={}, commtryT={}, commtryOn={}; let linkset=null, linksetT=null, faqset=null, faqsetT=null;
    (rows || []).forEach(r => {
      // 店舗名は正式名称へ寄せる（過去のデータが旧い表記でも、同じ店舗として扱う）
      const t = Number(r.t) || 0, id = r.id, store = normalizeStore(r.store || '');
      switch (r.kind) {
        case 'a': case 'b': food.push({ kind:r.kind, store, item:r.item, level:r.level, note:r.note, photos:r.photos||[], t, id }); break;
        // 提出物まわり（オープン写真の提出・提出物マスタ・判定/本部確認・定休日）＝subRows()が読む同じ置き場へ戻す。
        // これを入れないと、提出はバックエンドに届いているのに次の同期でローカルから消え、「提出済み」が未提出に戻る。
        case 'subrec': case 'submaster': case 'substat': case 'subholiday':
          subs.push({ kind:r.kind, store, item:r.item, level:r.level, note:r.note, photos:r.photos||[], t, id }); break;
        case 'kizuki': kz.push({ store, cat:r.item, note:r.note, photos:r.photos||[], t, id }); break;
        case 'route': route.push({ store, route:r.item, t, id }); break;
        case 'open': { const p=pj(r.note); open.push({ store, date:p.date||'', denom:p.denom||{}, total:Number(p.total)||0, t, id }); } break;
        case 'soukatsu': { const p=pj(r.note); sk.push(Object.assign({ store, t, id }, p)); } break;
        case 'survey': { const p = pj(r.note); const j = p && typeof p === 'object' && ('c' in p || 'f' in p); const ctry = j ? (p.c || '') : ''; if (/^TEST_/.test(ctry)) break; survey.push({ store, sat:Number(r.level)||0, route:r.item, note: j ? (p.f || '') : (r.note || ''), country: ctry, t, id }); } break; // TEST_ 接頭辞の国はテスト行として集計除外
        case 'svfb': { const p=pj(r.note); svfb.push({ store, aspect:r.item, good:p.good||'', improve:p.improve||'', t, id }); } break;
        case 'video': video.push({ store, url:r.item, note:r.note, t, id }); break;
        case 'emg': { const p=pj(r.note); if (!emg[store] || t >= emg[store].t) emg[store] = { slots: p.slots || {}, t }; } break; // 店舗ごとに最新版が正
        case 'whistle': { const p=pj(r.note); whistle.push({ store, cat:p.cat||'other', body:p.body||'', anon:!!p.anon, t, id }); } break;
        case 'news': { const p=pj(r.note); news.push({ title:p.title||'', body:p.body||'', level:p.level||'normal', target:p.target||'all', video:p.video||'', photos:r.photos||[], t, id }); } break;
        case 'ckitem': { const p=pj(r.note); const k=`${store}||${p.mode||'open'}`; if (ckitemT[k]==null || t>=ckitemT[k]) { ckitem[k]=Array.isArray(p.items)?p.items:[]; ckitemT[k]=t; } } break; // 店舗×モードごと最新版が正
        // オープン/クローズの実施状況＝店舗×モード×日付ごと最新が正。誰が実施したかは別に持つ
        case 'ckdone': { const p=pj(r.note); const k=`${store}||${r.item}`; if (ckdoneT[k]==null || t>=ckdoneT[k]) { ckdone[k]=p.done||{}; ckmeta[k]={ by:p.by||'', t }; ckdoneT[k]=t; } } break;
        // 勉強会＝IDごと最新が正。削除は deleted:true の行で表す（追記式のため）
        case 'study': { const p=pj(r.note); const k=r.item || (p && p.id); if (!k) break; if (studyT[k]==null || t>=studyT[k]) { study[k]=p; studyT[k]=t; } } break;
        case 'monthly': { const p=pj(r.note); const k=`${store}||${p.ym}`; if (monthlyT[k]==null || t>=monthlyT[k]) { monthly[k]={ store, ym:p.ym, sales:p.sales, purchase:p.purchase, open:p.open, close:p.close, goal:p.goal, by:p.by||'', t }; monthlyT[k]=t; } } break; // 店舗×月ごと最新版が正
        case 'community': { const p=pj(r.note); comm.push({ store, cat:r.item, body:p.body||'', by:p.by||'', photos:r.photos||[], t, id }); } break;
        case 'commmod': { const p=pj(r.note); const k=r.item; if (commmodT[k]==null || t>=commmodT[k]) { commmod[k]={ state:p.state||'published', t }; commmodT[k]=t; } } break; // 投稿キーごと最新の公開状態が正
        // 拍手は件数を合算。取り消し（off）は -1 として数える（追記式なので行は消せない）
        case 'commlike': { const k=r.item; const p2=pj(r.note); commlike[k]=(commlike[k]||0)+((p2 && p2.off) ? -1 : 1); } break;
        case 'commroll': { const p=pj(r.note); const k=r.item; if (commrollT[k]==null || t>=commrollT[k]) { commroll[k]={ on:!!(p&&p.on), t }; commrollT[k]=t; } } break; // 横展開の指定は投稿キーごと最新が正
        // 実施表明は「投稿×店舗」ごとに最新が正（取り消しの記録が後から来たら外す）
        case 'commtry': { const k=r.item, s=store; if (!s) break; const p2=pj(r.note); const kk=k+'||'+s;
          if (commtryT[kk] == null || t >= commtryT[kk]) { commtryT[kk]=t; commtryOn[kk]=!(p2 && p2.on === false); } } break;
        case 'linkset': { const p=pj(r.note); if (Array.isArray(p) && (linksetT==null || t>=linksetT)) { linkset=p; linksetT=t; } } break; // 資料リンク一覧は最新版が正
        case 'faqset': { const p=pj(r.note); if (Array.isArray(p) && (faqsetT==null || t>=faqsetT)) { faqset=p; faqsetT=t; } } break; // よくある質問（本部追加分）は最新版が正
      }
    });
    const set = (k, a) => { try { localStorage.setItem(k, JSON.stringify(a)); } catch (_) {} };
    set(LS.reports, food.concat(subs)); set('yosakura_demo_kizuki', kz); set('yosakura_demo_route', route);
    set('yosakura_demo_open', open); set('yosakura_demo_soukatsu', sk); set('yosakura_demo_survey', survey);
    set('yosakura_demo_svfb', svfb); set('yosakura_demo_storevideo', video);
    set('yosakura_demo_emg', emg); set('yosakura_demo_whistle', whistle); set('yosakura_demo_news', news); set('yosakura_demo_ckitem', ckitem); set('yosakura_demo_monthly', Object.values(monthly));
    if (Object.keys(ckdone).length) { set('yosakura_demo_ckdone', ckdone); set('yosakura_demo_ckmeta', ckmeta); } // 実施状況が1件も無い同期では、この端末の記録を消さない
    if (Object.keys(study).length) set('yosakura_demo_study', Object.values(study).filter(s => s && !s.deleted));
    Object.keys(commlike).forEach(k => { if (commlike[k] < 0) commlike[k] = 0; }); // 取り消しが多くても負にしない（保存の前に直す）
    set('yosakura_demo_community', comm); set('yosakura_demo_commmod', commmod); set('yosakura_demo_commlike', commlike);
    // 取り消しを反映して組み立て直す（最新が on の店舗だけを残す）
    Object.keys(commtryOn).forEach(kk => {
      if (!commtryOn[kk]) return;
      const i = kk.lastIndexOf('||'); const k = kk.slice(0, i), st2 = kk.slice(i + 2);
      if (!commtry[k]) commtry[k] = [];
      if (!commtry[k].includes(st2)) commtry[k].push(st2);
    });
    set('yosakura_demo_commroll', commroll); set('yosakura_demo_commtry', commtry);
    if (linkset !== null) set('yosakura_demo_links', linkset); // linksetが無い同期では既存の資料リンクを保持
    if (faqset !== null) set('yosakura_demo_faq', faqset); // faqsetが無い同期では既存のよくある質問を保持
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

  /* 端末に保存済みのデータを、正式名称へ寄せ直す（起動時に毎回・何度実行しても同じ結果）。
     ★同期は「バックエンドの中身が前回と同じなら作り直さない」ため、
       店舗名の付け替えをしても、データが増えない限り古い表記が端末に残り続ける。
       その状態だと、新しい店舗一覧と照合できず、過去の実績が画面から消えてしまう。 */
  function migrateStoreNames() {
    const listKeys = [LS.reports, 'yosakura_demo_soukatsu', 'yosakura_demo_survey', 'yosakura_demo_kizuki',
      'yosakura_demo_route', 'yosakura_demo_open', 'yosakura_demo_svfb', 'yosakura_demo_storevideo',
      'yosakura_demo_whistle', 'yosakura_demo_community', 'yosakura_demo_monthly', 'yosakura_demo_fp'];
    listKeys.forEach(k => {
      try {
        const a = JSON.parse(localStorage.getItem(k) || 'null');
        if (!Array.isArray(a)) return;
        let changed = false;
        a.forEach(r => { if (r && r.store) { const n = normalizeStore(r.store); if (n !== r.store) { r.store = n; changed = true; } } });
        if (changed) localStorage.setItem(k, JSON.stringify(a));
      } catch (e) {}
    });
    // 店舗名をキーに持つもの（緊急連絡先＝store／チェックリスト＝store||mode||date）
    [['yosakura_demo_emg', s => normalizeStore(s)],
     ['yosakura_demo_ckitem', s => { const p = String(s).split('||'); p[0] = normalizeStore(p[0]); return p.join('||'); }],
     ['yosakura_demo_ckdone', s => { const p = String(s).split('||'); p[0] = normalizeStore(p[0]); return p.join('||'); }],
     ['yosakura_demo_ckmeta', s => { const p = String(s).split('||'); p[0] = normalizeStore(p[0]); return p.join('||'); }]
    ].forEach(([k, fn]) => {
      try {
        const o = JSON.parse(localStorage.getItem(k) || 'null');
        if (!o || typeof o !== 'object' || Array.isArray(o)) return;
        const out = {}; let changed = false;
        Object.keys(o).forEach(key => { const nk = fn(key); if (nk !== key) changed = true; out[nk] = o[key]; });
        if (changed) localStorage.setItem(k, JSON.stringify(out));
      } catch (e) {}
    });
  }

  /* ---------- 起動 ---------- */
  document.documentElement.lang = LANG;
  if (!useBackend()) seedIfEmpty();
  // バックエンド接続時は全端末同期を使うためシードしない（＝実データのみ）。オフライン検証時のみ初期データを用意。
  if (!useBackend()) { seedSk(); seedKz(); seedSvfb(); seedSurvey(); seedEmg(); seedNews(); seedCommunity(); seedMaterials(); }
  migrateStoreNames(); // 端末に残っている旧い店舗表記を、正式名称へ寄せ直す
  render();
  syncReports(true);
  // 表示中の版を読み、画面下に出す（更新が端末へ届いているかの確認用）
  try {
    fetch('./sw.js', { cache: 'no-store' }).then(r => r.text()).then(t => {
      const m = String(t || '').match(/const CACHE = '([^']+)'/);
      if (m && m[1] !== LATEST_BUILD) { LATEST_BUILD = m[1]; render(true); }
    }).catch(() => {});
  } catch (e) {}
  setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 1150);
  // 初回だけ「はじめの設定」→ 続けて使い方ガイド。2回目以降はどちらも出さない
  if (!localStorage.getItem(SETUP_KEY)) setTimeout(() => openIdentitySheet(true), 1350);
  else if (!localStorage.getItem('yosakura_tour_done')) setTimeout(() => openTour(0), 1450);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
