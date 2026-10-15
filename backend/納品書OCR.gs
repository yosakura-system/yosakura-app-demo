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
/* keys＝本文のどこかにあれば採用。社名はOCRで化けやすい（「オーディエー」→「才一工一」）ので、
   登録番号（T＋13桁）・電話番号も鍵にする（2026-10-02 実物13枚で確認）。
   total＝税率の行が無く「合計」だけ読めたときの扱い。'excl'＝合計は税抜（×税率で税込に）／'incl'＝合計は税込のまま */
var NOUHIN_VENDORS_DEFAULT = [
  { name: '西原商会',     keys: ['西原', '06-6552-8880', '6552-8880'],                         k8: 'food',  k10: 'food', total: 'excl' },
  { name: 'フレッシュ青果', keys: ['フレッシュ', '7340001003812', '06-6656-3170', '6656 3170', '6656-3170'], k8: 'food', k10: 'food', total: 'incl' },
  { name: '銘洋',         keys: ['銘洋', 'メイヨウ'],                                          k8: 'food',  k10: 'food', total: 'excl' },
  { name: '魚伸',         keys: ['魚伸'],                                                      k8: 'food',  k10: 'food', total: 'excl' },
  { name: '名畑',         keys: ['名畑', '4120001068302', '06-6372-0951', '6372-0951', '0120-40-3150'],                                                      k8: 'drink', k10: 'alc',  total: 'incl' },   // 社名は「名烟」「畑」に化ける（2026-10-15）
  { name: 'リカーマウンテン', keys: ['リカーマウンテン', 'リカマン'],                               k8: 'drink', k10: 'alc',  total: 'incl' },
  { name: '日本食研',     keys: ['日本食研'],                                                  k8: 'food',  k10: 'food', total: 'excl' },
  { name: 'オーディエー', keys: ['オーディエー', 'ODA', '8-1200-0103-7617', '81200010376', '06-6251-1061', '6251-1061'], k8: 'food', k10: 'food', total: 'incl' },
  { name: 'イオン',       keys: ['イオン', 'AEON', 'EON FOOD', '14140001005666', '06-6252-4147', '6252-4147'], k8: 'food', k10: 'alc', total: 'incl' },
  { name: 'ローソン',     keys: ['ローソン', 'LAWSON', '7810930211230', '06-6241-1963', '6241-1963'], k8: 'food', k10: 'alc', total: 'incl' },
  { name: '本部',         keys: ['Utec', 'ユーテック', 'utechnologies', '本部請求'],                 k8: 'food',  k10: 'alc',  total: 'excl' }   // 和牛・鰻＝8%／梅酒＝10%   // ★「世桜」は宛名（牛カツ世桜 様）に当たるので鍵にしない（2026-10-15 名畑を本部と取り違え）
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
      var ps = nouhin_parse_all_(text);                   // 金額が1つも読めない＝下書きを作らない（0で埋めない）
      ps.forEach(function (p, j) {
        p.src = 'ocr'; p.photo = ids[i]; p.by = String(data.note && data.note.by || '');
        if (ps.length > 1) p.part = (j + 1) + '/' + ps.length;   // 同じ写真の何枚目の伝票か
        p.raw = String(text).replace(/\r?\n\s*\n/g, '\n').slice(0, 3000);   // 読み取った文字（照合用・2026-10-02）
        sh.appendRow([Utilities.getUuid(), Date.now() + j, NOUHIN_DRAFT_KIND, String(data.store || ''), "'" + dateKey, '', JSON.stringify(p), '[]']);
      });
    }
  } catch (e) {
    try { Logger.log('nouhin_ocr_hook_: ' + e); } catch (_) {}
  }
}

/* ★1枚の写真に伝票が2枚以上写っている（2026-10-15 長堀橋＝フレッシュ青果の2枚・イオンのレシート＋ODAの納品書）。
   「納品書」「領収証」の見出しが、合計の出たあとにもう一度出たら、そこから別の伝票として区切る。
   区切った伝票が2つ以上それぞれ読めたら、別々の下書きにする。読めない区切りは捨て、1つしか読めなければ全文を1枚として読む。
   ★別の仕入先の文字が混ざって読める（OCRが2枚の行を交互に読む）ので、2枚目以降は conf:'low'＝店が写真と見比べる */
function nouhin_parse_all_(text) {
  var ls = String(text || '').split(/\r?\n/);
  var secs = [], cur = [], sawTotal = false;
  ls.forEach(function (l) {
    var k = l.replace(/[\s　]/g, '');
    if (/^(納品書|御納品書|領収証|領收証|領収書|納品日)$/.test(k) && sawTotal && cur.length > 5) { secs.push(cur.join('\n')); cur = []; sawTotal = false; }
    cur.push(l);
    if (/合計|合\s*計|^合$/.test(k) && !/小計|対象/.test(k)) sawTotal = true;
  });
  if (cur.length) secs.push(cur.join('\n'));
  if (secs.length < 2) { var one = nouhin_parse_(text); return one ? [one] : []; }
  var got = secs.map(function (t) { return nouhin_parse_(t); }).filter(function (p) { return p && p.total; });
  if (got.length < 2) { var one2 = nouhin_parse_(text); return one2 ? [one2] : []; }
  for (var i = 1; i < got.length; i++) if (got[i].v !== got[0].v || got.some(function (q, j) { return j < i && q.total === got[i].total; })) got[i].conf = 'low';
  return got;
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
  /* ★OCRの崩れを先にそろえる（2026-10-02 実物13枚）：
     「13.730」「11..630」「5. 835」＝桁区切りがピリオドやスペースに化ける → 「13,730」に
     「13, 730」＝カンマの後に空白 → 「13,730」に */
  src = src.replace(/(\d)\.{1,2}\s?(\d{3})(?!\d)/g, '$1,$2').replace(/(\d),\s+(\d{3})(?!\d)/g, '$1,$2');
  var lines = src.split(/\r?\n/).map(function (s) { return s.replace(/\s+$/, '').replace(/^\s+/, ''); }).filter(String);
  var flat = lines.join(' ');
  var flatKey = flat.replace(/[\s　]/g, '');   // 鍵の照合用（空白を除く＝「06-6656 3170」も「6656-3170」も当たる）
  var out = {};

  // 仕入先＝社名か、登録番号・電話番号の鍵
  var vendors = nouhin_vendors_(); var vendor = null;
  for (var i = 0; i < vendors.length && !vendor; i++) {
    var ks = vendors[i].keys || [vendors[i].name];
    for (var j = 0; j < ks.length; j++) {
      var k = String(ks[j] || '').replace(/[\s　]/g, '');
      if (k && (flat.indexOf(ks[j]) !== -1 || flatKey.indexOf(k) !== -1)) { vendor = vendors[i]; break; }
    }
  }
  if (vendor) out.v = vendor.name;

  var num = function (s) { var n = Number(String(s).replace(/[^\d]/g, '')); return (isNaN(n) || n <= 0 || n >= NOUHIN_MAX_YEN) ? null : n; };
  /* 行の中の金額候補＝¥付きを優先（¥はOCRで W・V・$・# に化けるので同じ扱い）、無ければ桁区切りか3桁以上の数字 */
  /* ★2026-10-15 長堀橋の実物で見つけた誤読＝日付「2026年」（イオン）・商品コード「00102042」（名畑）・容量「190ml」（名畑）を金額と読んだ。
     金額を探す前に、日付・時刻・商品コード・容量と単位つきの数・@単価を消す */
  var amtClean = function (s) {
    return String(s)
      .replace(/\d{2,4}\s*[年\/]\s*\d{1,2}\s*[月\/]\s*\d{1,2}\s*日?(\s*[\(（][^\)）]{0,3}[\)）])?/g, ' ')
      .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
      .replace(/(^|[^\d,])0\d{5,}/g, '$1 ')
      .replace(/\d+(-\d+){2,}/g, ' ')
      .replace(/\d{6,}_\d+/g, ' ')
      .replace(/\d+(\.\d+)?\s*(ml|mL|ML|cc|kg|Kg|KG|g|L|l|個|本|箱|袋|枚|PC|pc|入|尾|ケース)(?![a-zA-Z])/g, ' ')
      .replace(/@\s*[\d,]+/g, ' ');
  };
  var yenIn = function (s) {
    s = amtClean(s);
    var m = s.match(/[¥￥WV$#]\s*[\d,]+/g);
    if (m) { var v0 = num(m[m.length - 1]); if (v0 != null) return v0; }
    var m2 = s.match(/\d{1,3}(?:,\d{3})+|\d{3,}/g);
    return m2 ? num(m2[m2.length - 1]) : null;
  };
  var rateRe = { 8: /(^|[^\d])8\s*[%％]/, 10: /(^|[^\d])10\s*[%％]/ };
  var isTaxLine = function (s) { return /(消費税|消费税|税額|稅額|内税|内消費税|外税)/.test(s) && !/対象|对象|課税額|小計/.test(s); };
  var isIdLine = function (s) { return /(番号|No\.|NO\.|TEL|FAX|電話|登録|〒|AID|承認)/.test(s); };   // 伝票番号・電話・登録番号＝金額ではない
  var numFirst = /^[¥￥WV$#]?\s*[\d,]{3,}\s*(消費税|消费税|税額|稅額)/;                             // 「2,340 稅額10%」＝数字は前の見出し（対象額）の値
  var base = {}, tax = {}, taxSeen = {};
  [8, 10].forEach(function (r) { taxSeen[r] = lines.some(function (l) { return rateRe[r].test(l) && /(税額|稅額|消費税|消费税)/.test(l) && !/軽減|輕減|印は/.test(l); }); });   // 税額の見出し（「2,340 稅額10%」）がある税率＝対象額は税抜
  [8, 10].forEach(function (r) {
    for (var i2 = 0; i2 < lines.length; i2++) {
      if (!rateRe[r].test(lines[i2])) continue;
      if (/軽減税率|輕減税率|軽印|印は/.test(lines[i2])) continue;        // 「※印は軽減税率8%対象商品」＝金額の行ではない
      var win = lines.slice(i2, i2 + 3);
      for (var w = 0; w < win.length; w++) {
        if (isIdLine(win[w])) continue;
        var line = win[w].replace(/\b(8|10)\s*[%％]/g, '');
        if (w > 0 && (rateRe[8].test(win[w]) || rateRe[10].test(win[w])) && !rateRe[r].test(win[w])) break;
        var v = yenIn(line);
        if (v == null) continue;
        if (numFirst.test(win[w])) { if (base[r] == null) base[r] = v; }
        else if (isTaxLine(win[w])) { if (tax[r] == null) tax[r] = v; }
        else if (base[r] == null) base[r] = v;
      }
      if (base[r] != null) break;
    }
  });
  /* ★2026-10-15 税率ごとの「小計」「対象額＋税額」の行を最優先（名畑「10%小計 392」・ODA「課税対象額10% 1,740 税額10% 174」・フレッシュ「8%小計 ¥2,628／8%消費税 ¥210」）。
     見つかった税率は、上の窓の拾い方（容量や商品コードを拾いやすい）を上書きする。「8%小計 0」＝その税率は無い */
  var numAfter = function (s, re) { var m = re.exec(s); if (!m) return null; var rest = amtClean(s.slice(m.index + m[0].length)); var mm = rest.match(/[¥￥WV$#]?\s*\d{1,3}(?:,\d{3})+|[¥￥WV$#]?\s*\d+/); return mm ? num(mm[0]) : null; };
  var nextNum = function (i, n) { for (var k = i + 1; k < Math.min(lines.length, i + 1 + n); k++) { if (isIdLine(lines[k])) continue; var t = amtClean(lines[k]).replace(/[\s　]/g, ''); if (/^[¥￥WV$#]?[\d,]+$/.test(t)) return { v: num(t), zero: /^[¥￥WV$#]?0+$/.test(t) }; if (/[一-龥ぁ-んァ-ン]/.test(t)) return null; } return null; };
  /* ★見出しが縦に並び、数字がそのあとにまとめて並ぶ伝票（フレッシュ青果の簡易版＝「10%小計／10%消費税／8%小計／8%消費税／消費税計／合計」→「¥0／¥0／¥2,190／¥175／¥175／¥2,365」）。
     i 行目の見出しが、見出しの塊の何番目かを数え、塊のすぐ後の数字の塊の同じ番目を返す。塊でなければ null（2026-10-15） */
  var isMoneyLine = function (t) { return /^[¥￥WV$#]?\s*[\d,]+$/.test(amtClean(t).replace(/[\s　]/g, '')); };
  var isLabelLine = function (t) { var k = t.replace(/[\s　]/g, ''); return k.length > 0 && !isMoneyLine(t) && /[一-龥ぁ-んァ-ン]/.test(k) && !/\d{2,}/.test(k.replace(/(8|10)[%％]/g, '')); };
  var colValue = function (i) {
    if (!isLabelLine(lines[i])) return null;
    var s0 = i, e0 = i;
    while (s0 > 0 && isLabelLine(lines[s0 - 1])) s0--;
    while (e0 + 1 < lines.length && isLabelLine(lines[e0 + 1])) e0++;
    var n = e0 - s0 + 1; if (n < 3) return null;
    var vals = []; for (var k = e0 + 1; k < lines.length && isMoneyLine(lines[k]); k++) vals.push(lines[k]);
    /* 数字の数が見出しより少ない＝塊の頭に説明の行（「※は軽減税率対象商品です」など）が混ざっている＝後ろから合わせる */
    var off = vals.length >= n ? i - s0 : i - (e0 - vals.length + 1);
    if (vals.length < 3 || off < 0 || off >= vals.length) return null;
    var t = amtClean(vals[off]).replace(/[\s　]/g, '');
    return { v: num(t), zero: /^[¥￥WV$#]?0+$/.test(t) };
  };
  var subSeen = {};
  [8, 10].forEach(function (r) {
    var rr = new RegExp('(^|[^\\d])' + r + '\\s*[%％]');
    for (var i5 = 0; i5 < lines.length; i5++) {
      var L5 = lines[i5]; if (!rr.test(L5) || /軽減|輕減|軽印|印は/.test(L5)) continue;
      var L5k = L5.replace(/[\s　]/g, '');
      if (/(対象額?|对象額?)/.test(L5k) && /(税額|稅額)/.test(L5k)) {          // 同じ行に対象額と税額
        var b5 = numAfter(L5.replace(/\b(8|10)\s*[%％]/g, ' '), /(対象額?|对象額?)/), t5 = numAfter(L5.replace(/\b(8|10)\s*[%％]/g, ' '), /(税額|稅額)/);
        if (b5 != null) { base[r] = b5; subSeen[r] = true; if (t5 != null) tax[r] = t5; }
        continue;
      }
      if (new RegExp(r + '[%％](小計|小计)').test(L5k)) {
        var v5 = numAfter(L5.replace(new RegExp(r + '\\s*[%％]'), ' '), /(小計|小计)/); var z5 = /(小計|小计)\s*[¥￥WV$#]?\s*0+\s*$/.test(L5);
        if (v5 == null && !z5) { var nx = colValue(i5) || nextNum(i5, 2); if (nx) { v5 = nx.v; z5 = nx.zero; } }
        if (v5 != null || z5) { subSeen[r] = true; if (v5 != null) base[r] = v5; else delete base[r]; }
        continue;
      }
      if (subSeen[r] && new RegExp(r + '[%％](消費税|消费税|税額|稅額)').test(L5k)) {
        var t6 = numAfter(L5.replace(new RegExp(r + '\\s*[%％]'), ' '), /(消費税|消费税|税額|稅額)/);
        if (t6 == null) { var nx2 = colValue(i5) || nextNum(i5, 2); if (nx2) t6 = nx2.v; }
        if (t6 != null) tax[r] = t6;
      }
    }
  });
  /* 「外税対象額」「課税対象額」のように税率の数字が落ちた行＝本文に 8% しか無ければ 8% の行とみなす（イオンのレシート） */
  if (base[8] == null && /8\s*[%％]/.test(flat)) {
    for (var i4 = 0; i4 < lines.length; i4++) {
      if (!/(外税|課税)?(対象額|对象額)/.test(lines[i4]) || /[%％]/.test(lines[i4]) || /小計/.test(lines[i4])) continue;
      var win4 = lines.slice(i4, i4 + 3);
      for (var w4 = 0; w4 < win4.length; w4++) { if (isIdLine(win4[w4]) || /[%％]/.test(win4[w4])) continue; var v4 = yenIn(win4[w4]); if (v4 != null) { base[8] = v4; break; } }
      if (base[8] != null) break;
    }
  }

  /* 合計（税込）＝印字された合計（2026-10-15 改）。強い見出し（合計金額・総合計・合計・「合」だけの行）を先に、無ければ弱い見出し（お買上・ご請求…）。
     数字が下の行に落ちる伝票がある（名畑＝「合計金額」の5行下・イオン＝3行下・西原＝「合」の次の行）ので6行まで見る。
     保証金・受領・番号・消費税・お釣りの行は飛ばす。最初に見つかった強い見出しの値を採る（伝票番号や日付の数字を拾わない） */
  var totalAt = function (i) {
    var v = yenIn(lines[i].replace(/(総合計金額|合計金額|総合計|合\s*計|合|お買上|御買上|ご請求|請求金額|総額|買上金額)/g, ''));
    if (v != null) return v;
    var cv = colValue(i); if (cv && cv.v != null) return cv.v;
    for (var k = i + 1; k < Math.min(lines.length, i + 7); k++) {
      var t = lines[k]; var tk = t.replace(/[\s　]/g, '');
      if (isIdLine(t) || /(保証|保證|保证|受領|消費|消费|税|稅|お釣|釣|点数|商品数|小計|対象)/.test(tk)) continue;
      var v2 = yenIn(t); if (v2 != null) return v2;
    }
    return null;
  };
  var STRONG = /(総合計|合計金額|^合計|^合$|^合[^\d一-龥ぁ-んァ-ン]*$|合計[¥￥WV$#\d]|[^小]合計)/, WEAK = /(お買上|御買上|ご請求|請求金額|総額|買上金額)/;
  var NOTTOTAL = /(小計|小计|対象|税額|消費税|点数|数量|取扱|商品数|保証|保證)/;
  [STRONG, WEAK].forEach(function (re) {
    if (out.total != null) return;
    for (var i3 = 0; i3 < lines.length; i3++) {
      var lk = lines[i3].replace(/[\s　]/g, '');
      if (!re.test(lk) || NOTTOTAL.test(lk)) continue;
      var tv = totalAt(i3);
      if (tv != null) { out.total = tv; out.totalPrinted = true; break; }
    }
  });
  /* 合計の行が無い伝票（西原＝「合計」の文字が無く金額だけ並ぶ）＝桁区切り付きか¥付きの数字の最大を合計とみなす */
  if (out.total == null) {
    var cands = flat.match(/[¥￥WV$#]?\s*\d{1,3}(?:,\d{3})+(?!\d)/g) || [];
    var mx = null; cands.forEach(function (c) { var n = num(c); if (n != null && (mx == null || n > mx)) mx = n; });
    if (mx != null) { out.total = mx; out.totalGuess = true; }
  }

  var gotRate = base[8] != null || base[10] != null;
  if (!gotRate && out.total == null) return null;

  var inclusive = /(内税|内消費税|税込)/.test(flat) && !/税抜|外税/.test(flat);
  var conf = 'high';
  if (gotRate) {
    /* 税額の行は誤読しやすい（「76」が「476」）＝税率×対象額から大きく外れていたら計算値に置き換える */
    [8, 10].forEach(function (r) {
      if (base[r] == null) return;
      var calc = Math.floor(base[r] * r / 100);
      if (tax[r] != null && Math.abs(tax[r] - calc) > Math.max(3, calc * 0.05)) tax[r] = calc;
    });
    var sumBase = (base[8] || 0) + (base[10] || 0);
    var sumTax = (tax[8] || 0) + (tax[10] || 0);
    var mode;
    var printed = out.totalPrinted ? out.total : null;
    var calcIncl = 0; [8, 10].forEach(function (r) { if (base[r] != null) calcIncl += base[r] + Math.floor(base[r] * r / 100); });
    if (printed != null && Math.abs(sumBase - printed) <= 2) mode = 'incl';
    else if (printed != null && sumTax && Math.abs(sumBase + sumTax - printed) <= 2) mode = 'excl';
    else if (printed != null && Math.abs(calcIncl - printed) <= 3) mode = 'excl';
    else if (printed != null) {
      /* 税率の金額と印字の合計が合わない＝税率の金額のどれかが誤読。税率が1つだけなら印字の合計をその税率に。2つなら税込として入れて要確認 */
      var rs = [8, 10].filter(function (r) { return base[r] != null; });
      var small = rs.length === 1 && base[rs[0]] != null && Math.abs(base[rs[0]] + (tax[rs[0]] != null ? tax[rs[0]] : Math.floor(base[rs[0]] * rs[0] / 100)) - printed) <= 50;
      if (rs.length === 1) { base[rs[0]] = printed; tax = {}; mode = 'incl'; }
      else mode = 'incl';
      if (!small) conf = 'low';
    }
    else if (out.total != null && !out.totalGuess && Math.abs(sumBase - out.total) <= 2) mode = 'incl';
    else if (out.total != null && sumTax && Math.abs(sumBase + sumTax - out.total) <= 2) mode = 'excl';
    else if (inclusive) mode = 'incl';
    else if (/(税抜|外税)/.test(flat) || taxSeen[8] || taxSeen[10]) mode = 'excl';
    else if (vendor && vendor.total) mode = vendor.total;
    else { mode = 'excl'; conf = 'low'; }
    [8, 10].forEach(function (r) {
      if (base[r] == null) return;
      var g = base[r];
      if (mode === 'excl') g = tax[r] != null ? base[r] + tax[r] : base[r] + Math.floor(base[r] * r / 100);
      out[r === 8 ? 'a8' : 'a10'] = g;
    });
    out.total = (out.a8 || 0) + (out.a10 || 0);
    if (printed != null && Math.abs(out.total - printed) > 3) conf = 'low';   // 最後にもう一度、印字の合計と照らす
  } else {
    /* 合計だけ＝仕入先が分かっていれば、その仕入先の既定（税抜→税込に直す／税込のまま）で 8% か 10% に入れる */
    if (vendor) {
      var rate = (vendor.k8 === 'food' || vendor.k8 === 'drink') ? 8 : 10;
      if (/^(名畑|リカーマウンテン)$/.test(vendor.name)) rate = 10;       // 酒屋＝金額の大半はお酒
      var g2 = (vendor.total === 'excl' && !out.totalPrinted) ? out.total + Math.floor(out.total * rate / 100) : out.total;   // 印字の合計＝そのまま（西原「合 4,900」に8%を足していた・2026-10-15）
      out[rate === 8 ? 'a8' : 'a10'] = g2; out.total = g2;
      conf = out.totalGuess ? 'low' : 'high';
    } else conf = 'low';
  }
  if (!vendor) conf = 'low';
  delete out.totalGuess; delete out.totalPrinted;
  out.conf = conf;
  return out;
}

/* ★動作確認（エディタから1回実行）＝文言だけで読み取りを試す。ドライブは触らない */
function 納品書OCR_動作確認() {
  var sample = '西原商会\n御納品書\n白だし 1本 1,945\n米 8kg 6,825\n8%対象 8,770\n消費税 701\n合計 ¥7,020\n';
  Logger.log(JSON.stringify(nouhin_parse_(sample)));
}

/* ★過去の納品書写真をまとめて読む（2026-10-01 神田さん「9月の仕入が更新されていない」＝総括表の仕入台帳が9/24で止まっている）。
   店舗×月の「納品書の写真」（subrec・item nouhin|日付）を全部OCRして nouhindraft を作り、仕入先ごとの合計と税抜合計をログに出す。
   使い方（GASエディタで）：
     納品書OCR_月まとめ('牛カツ世桜 長堀橋店', '2026-09')          … 1回で最大40枚。残りがあればログに出るので、もう一度実行
   ・すでに下書きのある写真は読み直さない（何度実行しても二重にならない）
   ・自動では走らない（手で実行したときだけ） */
function 納品書OCR_月まとめ(store, ym, limit) {
  var sh = getSheet(); var last = sh.getLastRow();
  var vals = last >= 2 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
  var done = {}; var photos = [];
  for (var i = 0; i < vals.length; i++) {
    var kind = String(vals[i][2] || ''); if (String(vals[i][3] || '') !== store) continue;
    if (kind === NOUHIN_DRAFT_KIND) { try { var q = JSON.parse(vals[i][6] || '{}'); if (q.photo) done[q.photo] = true; } catch (e) {} }
    if (kind !== 'subrec') continue;
    var item = String(vals[i][4] || ''); if (item.indexOf('nouhin|' + ym) !== 0) continue;
    var ids; try { ids = JSON.parse(vals[i][7] || '[]'); } catch (e) { ids = []; }
    (ids || []).forEach(function (id) { if (/^[a-zA-Z0-9_-]{10,}$/.test(String(id || ''))) photos.push({ id: id, date: item.split('|')[1] || '' }); });
  }
  var todo = photos.filter(function (p) { return !done[p.id]; });
  var max = Number(limit) || 40; var read = 0, made = 0, failed = 0; var start = Date.now();
  for (var j = 0; j < todo.length && j < max; j++) {
    if (Date.now() - start > 4.5 * 60 * 1000) break;                       // 6分の壁の手前で止める
    var text = ''; try { text = nikkei_ocr_text_(todo[j].id); read++; } catch (e) { failed++; continue; }
    var p = nouhin_parse_(text);
    if (!p) { sh.appendRow([Utilities.getUuid(), Date.now(), NOUHIN_DRAFT_KIND, store, "'" + todo[j].date, '', JSON.stringify({ src: 'ocr', photo: todo[j].id, unread: true }), '[]']); continue; }
    p.src = 'ocr'; p.photo = todo[j].id;
    sh.appendRow([Utilities.getUuid(), Date.now(), NOUHIN_DRAFT_KIND, store, "'" + todo[j].date, '', JSON.stringify(p), '[]']);
    made++;
  }
  // 集計（今回ぶんも含めて読み直す）
  var sum = {}, totalIncl = 0, totalNet = 0, n = 0, unread = 0;
  last = sh.getLastRow(); vals = last >= 2 ? sh.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
  var seen = {};
  for (var k = vals.length - 1; k >= 0; k--) {                              // 新しい行から＝同じ写真は最新だけ
    if (String(vals[k][2]) !== NOUHIN_DRAFT_KIND || String(vals[k][3]) !== store) continue;
    var it = String(vals[k][4] || '').replace(/^'/, ''); if (it.indexOf(ym) !== 0) continue;
    var d; try { d = JSON.parse(vals[k][6] || '{}'); } catch (e) { continue; }
    var key = d.photo || ('row' + k); if (seen[key]) continue; seen[key] = true;
    if (d.unread) { unread++; continue; }
    n++;
    var v = d.v || '（仕入先不明）'; sum[v] = sum[v] || { 枚: 0, a8: 0, a10: 0, 税抜: 0 };
    var a8 = Number(d.a8) || 0, a10 = Number(d.a10) || 0;
    if (!a8 && !a10 && d.total) { if (/名畑|リカー/.test(v)) a10 = Number(d.total) || 0; else a8 = Number(d.total) || 0; }
    var net = (a8 - Math.floor(a8 * 8 / 108)) + (a10 - Math.floor(a10 * 10 / 110));
    sum[v].枚++; sum[v].a8 += a8; sum[v].a10 += a10; sum[v].税抜 += net; totalIncl += a8 + a10; totalNet += net;
  }
  var out = { 店舗: store, 月: ym, 写真: photos.length, 今回読んだ: read, 今回下書き: made, 読めなかった: unread + failed, 残り: Math.max(0, todo.length - read - failed),
              読めた伝票: n, 仕入先ごと: sum, 仕入合計_税込: totalIncl, 仕入合計_税抜: totalNet, 注意: '合計だけの伝票は仕入先の既定の税率で税抜にした。要確認の伝票は税込か税抜か迷ったもの' };
  Logger.log(JSON.stringify(out, null, 2)); return out;
}
