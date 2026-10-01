/**
 * 世桜アプリ｜納品書・レシート写真の自動読み取り（2026-10-01 神田さん「写真を撮ったら仕入が自動で加算され、
 * 食材／酒／酒以外と 8%・10% も自動で」）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。日計OCR.gs と同じ作り。
 *
 * ■ なにをするか
 *   「納品書の写真」（提出物 nouhin）が提出されたら、写真1枚＝伝票1枚としてドライブ標準のOCRで読み、
 *   仕入先・8％対象（税込）・10％対象（税込）・合計 を「下書き」行（kind: nouhindraft）として保存する。
 *   アプリ側は日報を開いたとき、その日の下書きを「今日の納品書」に並べ、
 *   仕入先×税率から 食材／お酒／お酒以外 の3欄（税込）を自動で埋める＝スタッフは確認して送信するだけ。
 *
 * ■ 決めごと（日計OCRと同じ）
 *   ・自動送信はしない。読み取りは下書きまで。送信は必ず人が押す（誤読が静かに混ざるのが一番怖い）
 *   ・読めなかった欄は入れない（0で埋めない）。仕入先が分からなければ空＝アプリで選ぶ
 *   ・税込か税抜か迷う伝票は「要確認（conf:'low'）」の印を付けて渡す
 *   ・OCRに失敗しても提出は成功のまま。外部AIサービスは使わない（ドライブ標準OCRのみ・追加費用ゼロ）
 *   ・一時ドキュメントは読み取り後すぐ削除する（nikkei_ocr_text_ を使う＝日計OCR.gs が必要）
 *
 * ■ 仕入先の対応（Script Properties NOUHIN_VENDORS で上書き可・JSON）
 *   [{ name:'名畑', keys:['名畑'], k8:'drink', k10:'alc' }, …]  k8／k10＝その税率の金額の行き先（food／alc／drink）
 */
var NOUHIN_DRAFT_KIND = 'nouhindraft';
var NOUHIN_MAX_PHOTOS = 6;
var NOUHIN_MAX_YEN = 10000000;        // 1,000万円以上は誤読として捨てる
var NOUHIN_VENDORS_DEFAULT = [
  { name: '西原商会',     keys: ['西原'],                   k8: 'food',  k10: 'food' },
  { name: 'フレッシュ青果', keys: ['フレッシュ'],             k8: 'food',  k10: 'food' },
  { name: '銘洋',         keys: ['銘洋'],                   k8: 'food',  k10: 'food' },
  { name: '魚伸',         keys: ['魚伸'],                   k8: 'food',  k10: 'food' },
  { name: '名畑',         keys: ['名畑'],                   k8: 'drink', k10: 'alc' },
  { name: 'リカーマウンテン', keys: ['リカーマウンテン', 'リカマン'], k8: 'drink', k10: 'alc' },
  { name: '日本食研',     keys: ['日本食研'],               k8: 'food',  k10: 'food' },
  { name: 'オーディエー', keys: ['オーディエー', 'ODA'],     k8: 'food',  k10: 'food' },
  { name: 'イオン',       keys: ['イオン', 'AEON'],          k8: 'food',  k10: 'alc' },
  { name: 'ローソン',     keys: ['ローソン', 'LAWSON'],      k8: 'food',  k10: 'alc' },
  { name: '本部',         keys: ['Utec', 'ユーテック', 'utechnologies', '世桜'], k8: 'food', k10: 'alc' }   // 和牛・鰻＝8%／梅酒＝10%
];
function nouhin_vendors_() {
  var raw = getSetting_('NOUHIN_VENDORS', '');
  if (raw) { try { var a = JSON.parse(String(raw)); if (Array.isArray(a) && a.length) return a; } catch (e) {} }
  return NOUHIN_VENDORS_DEFAULT;
}

/* 提出のフック＝Code.gs の doPost から呼ぶ（日計OCRのフックの次の行） */
function nouhin_ocr_hook_(data, photoIds) {
  try {
    if (String(data.kind || '') !== 'subrec') return;
    var item = String(data.item || '');
    if (item.split('|')[0] !== 'nouhin') return;
    var dateKey = item.split('|')[1] || '';
    var ids = (photoIds || []).filter(function (p) { return /^[a-zA-Z0-9_-]{10,}$/.test(String(p || '')); }).slice(0, NOUHIN_MAX_PHOTOS);
    if (!ids.length) return;
    var sh = getSheet();
    for (var i = 0; i < ids.length; i++) {
      var text = '';
      try { text = nikkei_ocr_text_(ids[i]); } catch (e) { continue; }
      var p = nouhin_parse_(text);
      if (!p) continue;                                  // 金額が1つも読めない＝下書きを作らない（0で埋めない）
      p.src = 'ocr'; p.photo = ids[i]; p.by = String(data.note && data.note.by || '');
      sh.appendRow([Utilities.getUuid(), Date.now(), NOUHIN_DRAFT_KIND, String(data.store || ''), "'" + dateKey, '', JSON.stringify(p), '[]']);
    }
  } catch (e) {
    try { Logger.log('nouhin_ocr_hook_: ' + e); } catch (_) {}
  }
}

/* OCRテキスト → { v:仕入先, a8:8%対象（税込）, a10:10%対象（税込）, total:合計（税込）, conf:'high'|'low', vendorRaw }
   読み方：
   ・仕入先＝対応表のキーワードが本文のどこかにあれば採用
   ・税率ごとの金額＝「8%」「10%」を含む行（＋続く2行）の窓から、¥付きの数字を優先して拾う。
     「8%対象 1,234」「(8%対象 ¥1,234)」「税率8% 課税対象額 1,234」「8％ 1,234」のどれでも拾う
   ・税込か税抜か＝本文に「内税」「内消費税」「税込」があれば税込。
     それ以外は「合計」と 8%＋10% の和を見比べ、和が合計と一致＝税込、和＋税額が合計と一致＝税抜（税額を足す）。
     決められないときは税抜とみなして税を足し、conf:'low'
   ・税率の行が無い伝票＝合計だけ（a8／a10 は入れない）。アプリ側で仕入先の既定の税率に入る */
function nouhin_parse_(text) {
  var src = String(text || '');
  if (!src.replace(/\s/g, '')) return null;
  var lines = src.split(/\r?\n/).map(function (s) { return s.replace(/\s+$/, '').replace(/^\s+/, ''); }).filter(String);
  var flat = lines.join(' ');
  var out = {};

  // 仕入先
  var vendors = nouhin_vendors_();
  for (var i = 0; i < vendors.length && !out.v; i++) {
    var ks = vendors[i].keys || [vendors[i].name];
    for (var j = 0; j < ks.length; j++) {
      if (ks[j] && flat.indexOf(ks[j]) !== -1) { out.v = vendors[i].name; break; }
    }
  }

  var num = function (s) { var n = Number(String(s).replace(/[^\d]/g, '')); return (isNaN(n) || n <= 0 || n >= NOUHIN_MAX_YEN) ? null : n; };
  var yenIn = function (s) {                           // 行の中の金額候補＝¥付きを優先、無ければ桁区切りか4桁以上の数字
    var m = s.match(/[¥￥]\s*[\d,]+/g);
    if (m) return num(m[m.length - 1]);
    var m2 = s.match(/\d{1,3}(?:,\d{3})+|\d{3,}/g);          // 桁区切り無しの3桁（消費税701 など）も拾う
    return m2 ? num(m2[m2.length - 1]) : null;
  };
  var rateRe = { 8: /(^|[^\d])8\s*[%％]/, 10: /(^|[^\d])10\s*[%％]/ };
  var isTaxLine = function (s) { return /(消費税|税額|内税|内消費税)/.test(s) && !/対象|課税額|小計/.test(s); };
  var base = {}, tax = {};
  [8, 10].forEach(function (r) {
    for (var i2 = 0; i2 < lines.length; i2++) {
      if (!rateRe[r].test(lines[i2])) continue;
      var win = lines.slice(i2, i2 + 3);
      for (var w = 0; w < win.length; w++) {
        var line = win[w].replace(/\b(8|10)\s*[%％]/g, '');   // 税率の数字そのものは金額候補から外す
        if (w > 0 && (rateRe[8].test(win[w]) || rateRe[10].test(win[w])) && !rateRe[r].test(win[w])) break;   // 別の税率の行に入った
        var v = yenIn(line);
        if (v == null) continue;
        if (isTaxLine(win[w])) { if (tax[r] == null) tax[r] = v; }
        else if (base[r] == null) base[r] = v;
      }
      if (base[r] != null) break;
    }
  });

  // 合計（税込）
  for (var i3 = 0; i3 < lines.length; i3++) {
    if (/(合計|合　計|お買上|御買上|ご請求|請求金額|総額|計)\s*[¥￥]?\s*[\d,]/.test(lines[i3]) && !/小計|対象|税額|消費税|点数|数量/.test(lines[i3])) {
      var tv = yenIn(lines[i3]); if (tv != null) out.total = tv;    // 最後に出た合計を採る（総合計が最後に来る）
    }
  }

  var gotRate = base[8] != null || base[10] != null;
  if (!gotRate && out.total == null) return null;

  var inclusive = /(内税|内消費税|税込)/.test(flat) && !/税抜|外税/.test(flat);
  var sumBase = (base[8] || 0) + (base[10] || 0);
  var sumTax = (tax[8] || 0) + (tax[10] || 0);
  var conf = 'high';
  if (gotRate) {
    var mode;
    if (out.total != null && Math.abs(sumBase - out.total) <= 2) mode = 'incl';
    else if (out.total != null && sumTax && Math.abs(sumBase + sumTax - out.total) <= 2) mode = 'excl';
    else if (inclusive) mode = 'incl';
    else if (/(税抜|外税)/.test(flat)) mode = 'excl';
    else { mode = 'excl'; conf = 'low'; }
    [8, 10].forEach(function (r) {
      if (base[r] == null) return;
      var g = base[r];
      if (mode === 'excl') g = tax[r] != null ? base[r] + tax[r] : base[r] + Math.floor(base[r] * r / 100);
      out[r === 8 ? 'a8' : 'a10'] = g;
    });
    if (out.total == null) out.total = (out.a8 || 0) + (out.a10 || 0);
  } else {
    conf = 'low';   // 合計だけ＝税率はアプリ側で仕入先の既定に
  }
  out.conf = conf;
  return out;
}

/* ★動作確認（エディタから1回実行）＝文言だけで読み取りを試す。ドライブは触らない */
function 納品書OCR_動作確認() {
  var sample = '西原商会\n御納品書\n白だし 1本 1,945\n米 8kg 6,825\n8%対象 8,770\n消費税 701\n合計 ¥9,471\n';
  Logger.log(JSON.stringify(nouhin_parse_(sample)));
}
