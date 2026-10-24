/** ============================================================
 * 数字台帳.gs — 数字の記録を全期間しまっておく2つ目の置き場所（2026-10-24）
 *
 * ■ なぜ要るか
 *   本部データ（reports）は「直近 READ_TAIL 行」しか読まない＝行が増えると古い数字から押し出される。
 *   数字（売上・USEN・口コミ・サーベイ・月次・SVチェック）は1年分のグラフに使うので消せず、毎日増え続ける。
 *   → 数字の行は全部「数字台帳」タブにも写し、reports には当月＋前月だけ残す（毎晩の整理圧縮で移す）。
 *     読み（apiRead_）は reports の窓＋台帳の「reports に無い行」を返す＝端末から見た中身は変わらない。
 *   設計：05_品質管理・仕組み構築/世桜アプリ_運営と数字を分ける設計_2026-10-24.md
 *
 * ■ 段階
 *   ① 数字台帳_初回写し() … reports の数字の行を台帳へ写す（消さない）。何度実行しても同じ行は増えない
 *   ② 読み・取込の重複チェック・集約が台帳も見るようにする（Code.gs / USEN取込 / 総括表取り込み / SurveyImport / 集約 / 総括表書き戻し）
 *   ③ 数字_移す = true … 毎晩の整理圧縮で、前月1日より前の数字の行を reports から外す（台帳に写し済みの行だけ）
 *
 * ■ 点検＝ 数字台帳_点検()／数字台帳_読みの試験()（どちらも読むだけ）
 * ============================================================ */

var 数字_台帳タブ = '数字台帳';
var 数字_種類 = ['soukatsu', 'gsnap', 'survey', 'monthly', 'svcheck', 'svstd'];   // 台帳へ写す種類
var 数字_移す種類 = ['soukatsu', 'gsnap', 'survey', 'monthly', 'svcheck'];      // reports から外す種類（svstd＝基準＝設定なので残す）
var 数字_移す = false;   // ★③で true にする（apiRead_ が台帳を返すのを本番で確かめてから）

function 数字_台帳_() {
  var ss = getSS_();
  var sh = ss.getSheetByName(数字_台帳タブ);
  if (!sh) {
    sh = ss.insertSheet(数字_台帳タブ);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function 数字_値_(sh) {
  var last = sh.getLastRow();
  return last >= 2 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
}
/* 取込の重複チェック・集約・書き戻し用＝ reports の全行＋台帳だけにある行（同じidは1回だけ＝数えても二重にならない） */
function 数字_全値_() {
  var a = 数字_値_(getSheet());
  var b = []; try { b = 数字_値_(数字_台帳_()); } catch (e) { b = []; }
  if (!b.length) return a;
  var seen = {}; a.forEach(function (r) { if (r[0]) seen[String(r[0])] = 1; });
  return a.concat(b.filter(function (r) { return r[0] && !seen[String(r[0])]; }));
}

/* reports の数字の行のうち、台帳にまだ無いもの（idで判定）を台帳の末尾へ写す */
function 数字台帳_同期_(書き込む) {
  var vals = 数字_値_(getSheet());
  var led = 数字_台帳_();
  var have = {};
  数字_値_(led).forEach(function (r) { if (r[0]) have[String(r[0])] = 1; });
  var add = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] || have[String(r[0])]) continue;
    if (数字_種類.indexOf(String(r[2])) === -1) continue;
    /* ★文字はアポストロフィ付きで書く＝「2026-10」「2026-10-24」等がシートで日付に化けない（読んだときの値・型を reports と同じに保つ）。
       Date のセル（reports で既に日付になっているもの）と数値はそのまま */
    add.push(r.map(function (v) { return (typeof v === 'string' && v !== '') ? "'" + v : v; }));
    have[String(r[0])] = 1;
  }
  if (書き込む && add.length) {
    for (var s = 0; s < add.length; s += 2000) {
      var part = add.slice(s, s + 2000);
      led.getRange(led.getLastRow() + 1, 1, part.length, HEADERS.length).setValues(part);
    }
  }
  return add.length;
}

function 数字台帳_初回写し() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { Logger.log('別の処理が実行中のため見送り'); return { 見送り: true }; }
  try {
    var n = 数字台帳_同期_(true);
    var out = { 写した行: n, 台帳の行数: 数字_台帳_().getLastRow() - 1 };
    Logger.log(JSON.stringify(out)); return out;
  } finally { lock.releaseLock(); }
}

/* 台帳の中も「最新が正」の古い版を外す（整理圧縮と同じ鍵）。外した行は _控え へ */
function 数字台帳_圧縮_() {
  var led = 数字_台帳_();
  var vals = 数字_値_(led);
  var best = {}, drop = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i]; if (!r[0]) continue;
    var p = null; var note = String(r[6] || '');
    if (note.charAt(0) === '{') { try { p = JSON.parse(note); } catch (e) { p = null; } }
    var k = 圧縮_鍵_(r, p); if (!k) continue;
    var t = Number(r[1]) || 0; var cur = best[k];
    if (!cur) { best[k] = { i: i, t: t }; continue; }
    if (t >= cur.t) { drop.push(cur.i); best[k] = { i: i, t: t }; } else drop.push(i);
  }
  if (!drop.length) return 0;
  drop.sort(function (a, b) { return a - b; });
  var ss = getSS_(); var ar = ss.getSheetByName(圧縮_控えタブ);
  if (!ar) { ar = ss.insertSheet(圧縮_控えタブ); ar.appendRow(['移した日時', '理由'].concat(HEADERS)); }
  var stamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var copy = drop.map(function (j) { return [stamp, '数字台帳の古い版'].concat(vals[j]); });
  ar.getRange(ar.getLastRow() + 1, 1, copy.length, copy[0].length).setValues(copy);
  for (var k2 = drop.length - 1; k2 >= 0;) {
    var end = drop[k2], start = end;
    while (k2 - 1 >= 0 && drop[k2 - 1] === start - 1) { k2--; start = drop[k2]; }
    led.deleteRows(start + 2, end - start + 1); k2--;
  }
  return drop.length;
}

/* 行の「業務の日付」（YYYY-MM-DD）。売上＝営業日、口コミ＝取得日、月次＝その月の1日、SVチェック＝巡回日、サーベイ＝回答時刻 */
function 数字_業務日_(r, p) {
  var kind = String(r[2] || '');
  var fmt = function (v) { return (v && v.getTime) ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v || '').replace(/^'/, '').slice(0, 10); };
  var ts = Number(r[1]) || 0;
  var byTs = ts ? Utilities.formatDate(new Date(ts), 'Asia/Tokyo', 'yyyy-MM-dd') : '';
  var d = '';
  if (kind === 'soukatsu') d = p && p.date ? fmt(p.date) : '';
  else if (kind === 'gsnap') d = fmt(r[4]);
  else if (kind === 'monthly') { var ym = (p && p.ym) ? String(p.ym) : fmt(r[4]); d = /^\d{4}-\d{2}/.test(ym) ? ym.slice(0, 7) + '-01' : ''; }
  else if (kind === 'svcheck') { var m = String(r[4] || '').match(/\d{4}-\d{2}-\d{2}/); d = m ? m[0] : ''; }
  else d = byTs;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : byTs;
}
/* reports に残す境目＝前月の1日（JST）。これより前の業務日の数字は台帳だけに置く */
function 数字_移す境目_() {
  var d = new Date(Date.now() + 9 * 3600e3);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() - 1; if (m < 0) { m += 12; y--; }
  return y + '-' + ('0' + (m + 1)).slice(-2) + '-01';
}

/* 読み（apiRead_ から）＝台帳のうち「今回読んだ reports の窓に無い行」を、同じ門番・同じ形で返す。
   本部の端末は総括表（soukatsu）の前々月1日より前を持たない作り（app.js の間引き）なので、その分は返さない */
function 数字_履歴_(u, store, readIds) {
  var vals = 数字_値_(数字_台帳_());
  var out = [];
  var hqCut = 0;
  if (!u || u.role === 'hq') { var d = new Date(Date.now() + 9 * 3600e3); hqCut = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1) - 9 * 3600e3; }
  for (var i = vals.length - 1; i >= 0; i--) {
    var r = vals[i];
    if (!r[0] || readIds[String(r[0])]) continue;
    var kind = String(r[2] || '');
    if (hqCut && kind === 'soukatsu' && (Number(r[1]) || 0) < hqCut) continue;
    if (store && store !== 'all' && r[3] !== store) continue;
    if (u && typeof auth_row_ok_ === 'function' && !auth_row_ok_(u, kind, String(r[3] || ''), String(r[4] || ''))) continue;
    var photos = parsePhotos(r[7]);
    if (isPrivatePhotoRow_(r[2], r[4])) photos = photos.map(function (x) { return /^[a-zA-Z0-9_-]{10,}$/.test(String(x || '')) ? 'p:' + x : x; });
    out.push({ id: r[0], t: Number(r[1]) || 0, kind: r[2], store: r[3], item: r[4], level: r[5], note: r[6], photos: photos });
  }
  return out;
}

/* 点検（読むだけ）＝種類ごとの行数と、写し漏れ・台帳だけにある行 */
function 数字台帳_点検() {
  var rv = 数字_値_(getSheet()); var lv = 数字_値_(数字_台帳_());
  var rid = {}, lid = {}, c = {};
  var inc = function (k, f) { c[k] = c[k] || { reports: 0, 台帳: 0, 写し漏れ: 0, 台帳だけ: 0 }; c[k][f]++; };
  rv.forEach(function (r) { if (!r[0]) return; rid[String(r[0])] = 1; if (数字_種類.indexOf(String(r[2])) !== -1) inc(String(r[2]), 'reports'); });
  lv.forEach(function (r) { if (!r[0]) return; lid[String(r[0])] = 1; inc(String(r[2]), '台帳'); if (!rid[String(r[0])]) inc(String(r[2]), '台帳だけ'); });
  rv.forEach(function (r) { if (r[0] && 数字_種類.indexOf(String(r[2])) !== -1 && !lid[String(r[0])]) inc(String(r[2]), '写し漏れ'); });
  var out = { reports行: rv.length, 台帳行: lv.length, 移す: 数字_移す, 境目: 数字_移す境目_(), 種類別: c };
  Logger.log(JSON.stringify(out, null, 2)); return out;
}

/* 試験（読むだけ）＝端末に返る行数・大きさ・時間。本部・本店の店長の2通り。
   apiRead_ の返事に fromLedger（台帳から足した行数）が入る */
function 数字台帳_読みの試験() {
  var res = {};
  [['本部', { uid: 't', role: 'hq', stores: [] }], ['本店の店長', { uid: 't', role: 'manager', stores: ['日本料理世桜本店'] }]].forEach(function (x) {
    var t0 = Date.now(); var a = apiRead_({}, x[1]); var ms = Date.now() - t0;
    var k = {}; (a.reports || []).forEach(function (o) { k[o.kind] = (k[o.kind] || 0) + 1; });
    res[x[0]] = { 行: (a.reports || []).length, 秒: ms / 1000, 台帳から: a.fromLedger || 0, soukatsu: k.soukatsu || 0, survey: k.survey || 0, gsnap: k.gsnap || 0, monthly: k.monthly || 0, svcheck: k.svcheck || 0, 大きさKB: Math.round(JSON.stringify(a).length / 1024) };
  });
  Logger.log(JSON.stringify(res, null, 2)); return res;
}

/* 点検（読むだけ）＝両方にある行が、セルの値・型まで同じか（日付に化けていないか）。違いは種類と列名だけ出す */
function 数字台帳_同じか点検() {
  var key = function (v) { return (v && v.getTime) ? 'D' + v.getTime() : (typeof v) + ':' + String(v); };
  var rmap = {}; 数字_値_(getSheet()).forEach(function (r) { if (r[0]) rmap[String(r[0])] = r; });
  var same = 0, diff = 0, ex = {};
  数字_値_(数字_台帳_()).forEach(function (l) {
    var r = rmap[String(l[0])]; if (!r) return;
    var bad = [];
    for (var c = 0; c < HEADERS.length; c++) if (key(r[c]) !== key(l[c])) bad.push(HEADERS[c]);
    if (bad.length) { diff++; var k = String(l[2]) + ':' + bad.join('/'); ex[k] = (ex[k] || 0) + 1; } else same++;
  });
  var out = { 同じ: same, 違う: diff, 違いの内訳: ex };
  Logger.log(JSON.stringify(out, null, 2)); return out;
}

/* 試験（読むだけ・③の前に必ず）＝「いま移したら」端末に返る中身が今と同じかを、移さずに確かめる。
   移す予定の行を reports から除いたつもりで読みを組み立て、今の読みと id・中身（JSON）を1行ずつ突き合わせる。
   本部は総括表の前々月1日より前を返さない作り（端末側でも持たない）＝その分は「本部で返さない分」として別に数える */
function 数字台帳_移した後の試験() {
  var vals = 数字_値_(getSheet());
  var ledIds = {}; 数字_値_(数字_台帳_()).forEach(function (l) { if (l[0]) ledIds[String(l[0])] = 1; });
  var cut = 数字_移す境目_(); var moved = {}; var nMoved = 0;
  vals.forEach(function (r) {
    if (!r[0] || !ledIds[String(r[0])] || 数字_移す種類.indexOf(String(r[2])) === -1) return;
    var p = null; var n = String(r[6] || ''); if (n.charAt(0) === '{') { try { p = JSON.parse(n); } catch (e) { p = null; } }
    if (数字_業務日_(r, p) < cut) { moved[String(r[0])] = 1; nMoved++; }
  });
  var keepIds = {}; vals.forEach(function (r) { if (r[0] && !moved[String(r[0])]) keepIds[String(r[0])] = 1; });
  var d = new Date(Date.now() + 9 * 3600e3); var hqCut = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 1) - 9 * 3600e3;
  var users = [['本部', { uid: 't', role: 'hq', stores: [] }], ['本店の店長', { uid: 't', role: 'manager', stores: ['日本料理世桜本店'] }],
               ['長堀橋牛カツの店舗ID', { uid: 't', role: 'staff', stores: ['牛カツ世桜 長堀橋店'] }]];
  var res = { 境目: cut, 移す予定の行: nMoved };
  users.forEach(function (x) {
    var u = x[1];
    var now = apiRead_({}, u).reports || [];
    var a = {}; now.forEach(function (o) { a[String(o.id)] = JSON.stringify(o); });
    var t0 = Date.now();
    var b = {}; now.forEach(function (o) { if (!moved[String(o.id)]) b[String(o.id)] = JSON.stringify(o); });
    var hist = 数字_履歴_(u, '', keepIds); var ms = Date.now() - t0;
    hist.forEach(function (o) { b[String(o.id)] = JSON.stringify(o); });
    var 足りない = 0, 本部で返さない = 0, 余分 = 0, 中身違い = 0, 例 = [];
    Object.keys(a).forEach(function (id) {
      if (!(id in b)) { var o = JSON.parse(a[id]); if (u.role === 'hq' && o.kind === 'soukatsu' && o.t < hqCut) 本部で返さない++; else { 足りない++; if (例.length < 3) 例.push(o.kind + ' ' + o.store); } }
      else if (a[id] !== b[id]) { 中身違い++; if (例.length < 3) 例.push('違い ' + JSON.parse(a[id]).kind); }
    });
    Object.keys(b).forEach(function (id) { if (!(id in a)) 余分++; });
    res[x[0]] = { 今の行: now.length, 移した後の行: Object.keys(b).length, 足りない: 足りない, 本部で返さない: 本部で返さない, 余分: 余分, 中身違い: 中身違い, 例: 例, 台帳を読む秒: ms / 1000 };
  });
  Logger.log(JSON.stringify(res, null, 2)); return res;
}
