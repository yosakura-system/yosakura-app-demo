/**
 * 世桜アプリ｜日計レポート写真の自動読み取り（長堀橋トライアル・2026-09-01）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか
 *   「日計レポート（アイドルクローズ／レジクローズ）」の写真が提出されたら、
 *   Googleドライブ標準のOCR（画像→Googleドキュメント変換）で文字を読み取り、
 *   組数・客数・現金・クレジット・電子マネー・売上を「下書き」行として保存する。
 *   アプリ側は、中間報告フォーム（アイドル分）と日報入力（クローズ分）を開いたとき、
 *   その下書きの数字を自動で入れておく＝スタッフは確認して送信するだけになる。
 *
 * ■ 決めごと
 *   ・★自動送信はしない。読み取りは「下書き」まで。送信は必ず人が押す
 *     （写真の写り次第で誤読があり得る。売上金額の誤読が静かに混ざるのが一番怖い）
 *   ・読み取れなかった欄は入れない（勝手に0にしない）
 *   ・OCRに失敗しても提出は成功のまま（下書きが無いだけ＝従来どおり手入力）
 *   ・外部AIサービスは使わない。ドライブ標準のOCRのみ＝追加費用ゼロ・新規契約なし
 *   ・一時ドキュメントは読み取り後すぐ削除する
 *
 * ■ 使い方
 *   1. このファイルをGASプロジェクトへ追加し、Code.gs を最新版に貼り替える
 *      （doPost に「typeof nikkei_ocr_hook_」のフックが1行入っている版）
 *   2. 再デプロイ（既存デプロイの「編集」→ 新バージョン ＝ URL不変）
 *   3. 初回実行時にドライブへのアクセス承認が出たら許可する
 *
 * ■ テスト
 *   backend/日計OCR_通し実行.mjs（実物レシートの文言で読み取りを検証）
 */

/* 対象の提出物ID → 下書きの種類。
   nikkei_idle（アイドルクローズ）→ chukandraft ＝中間報告フォームへ
   nikkei_close（レジクローズ）  → skdraft     ＝日報（総括表）入力へ */
var NIKKEI_TARGETS = { nikkei_idle: 'chukandraft', nikkei_close: 'skdraft' };
var NIKKEI_MAX_PHOTOS = 3;          // 読み取る写真の上限（取引別＋商品別＋封筒を想定）
var NIKKEI_MAX_YEN = 100000000;     // これ以上の金額は誤読とみなして捨てる（1億円）

/* doPost から呼ばれる入口。失敗しても提出を壊さない（呼び出し側で try/catch 済みだが二重に守る） */
function nikkei_ocr_hook_(data, photoIds) {
  try {
    var kind = String(data.kind || '');
    if (kind !== 'subrec') return;
    var item = String(data.item || '');
    var mid = item.split('|')[0];
    var draftKind = NIKKEI_TARGETS[mid];
    if (!draftKind) return;
    var dateKey = item.split('|')[1] || '';
    var ids = (photoIds || []).filter(function (p) { return /^[a-zA-Z0-9_-]{10,}$/.test(String(p || '')); }).slice(0, NIKKEI_MAX_PHOTOS);
    if (!ids.length) return;

    /* 写真を順に読み、見つかった欄から埋める（先に見つかった値が正）。
       取引別レポートに全欄が載っているので、通常は1枚目で揃う */
    var merged = {};
    var got = false;
    for (var i = 0; i < ids.length; i++) {
      var text = '';
      try { text = nikkei_ocr_text_(ids[i]); } catch (e) { continue; }
      var p = nikkei_parse_(text);
      for (var k in p) { if (merged[k] === undefined) { merged[k] = p[k]; got = true; } }
      if (merged.total !== undefined && merged.cash !== undefined && merged.card !== undefined) break; // 主要欄が揃ったら十分
    }
    if (!got) return;
    merged.src = 'ocr';

    var sh = getSheet();
    sh.appendRow([Utilities.getUuid(), Date.now(), draftKind, String(data.store || ''), dateKey, '', JSON.stringify(merged), '[]']);
  } catch (e) {
    try { Logger.log('nikkei_ocr_hook_: ' + e); } catch (_) {}
  }
}

/* 画像ファイルID → OCRテキスト。
   Drive API v3 の files.copy で「Googleドキュメントとしてコピー」すると自動でOCRされる。
   本文を text/plain でエクスポートし、一時ドキュメントは必ず削除する。 */
function nikkei_ocr_text_(fileId) {
  var token = ScriptApp.getOAuthToken();
  var head = { Authorization: 'Bearer ' + token };
  var doc = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/copy?ocrLanguage=ja&fields=id',
    { method: 'post', contentType: 'application/json', headers: head,
      payload: JSON.stringify({ mimeType: 'application/vnd.google-apps.document', name: '_OCR一時（自動削除されます）' }) });
  var docId = JSON.parse(doc.getContentText()).id;
  var text = '';
  try {
    text = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId) + '/export?mimeType=text%2Fplain',
      { headers: head }).getContentText();
  } finally {
    try { UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId), { method: 'delete', headers: head }); } catch (e) {}
  }
  return text;
}

/* OCRテキスト → 数字。POSの「日計レポート 取引別」の行ラベルで拾う。
   ★行の最後の数字を金額とみなす（例「現金 4件 ¥44,700」→ 44700。件数でなく金額を取る）。
   ★「現金在高」「お預かり現金」「レジオープン時現金」等は行頭が違うので混ざらない。
   ★読めなかった欄は入れない（0で埋めない） */
function nikkei_parse_(text) {
  var lines = String(text || '').split(/\r?\n/);
  var LABELS = [
    { key: 'kumi',   re: /^組数/ },
    { key: 'kyaku',  re: /^客数/ },
    { key: 'total',  re: /^売上/ },              // 「総売上点数」「純売上」は行頭が違うため対象外
    { key: 'cash',   re: /^現金(?!在高)/ },       // 「現金在高」を除く
    { key: 'card',   re: /^クレジット/ },
    { key: 'emoney', re: /^電子マネー/ }
  ];
  var out = {};
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+/, '');
    for (var j = 0; j < LABELS.length; j++) {
      var lb = LABELS[j];
      if (out[lb.key] !== undefined || !lb.re.test(line)) continue;
      /* ラベル行に数字が無い（OCRで折り返された）場合は次の行も見る */
      var nums = (line.match(/[\d,]+/g) || []);
      if (!nums.length && lines[i + 1]) nums = (String(lines[i + 1]).match(/[\d,]+/g) || []);
      if (!nums.length) continue;
      var v = Number(String(nums[nums.length - 1]).replace(/,/g, ''));
      if (isNaN(v) || v < 0 || v >= NIKKEI_MAX_YEN) continue;
      out[lb.key] = v;
    }
  }
  /* つじつまの確認：支払内訳が揃っていて売上と大きく食い違うなら、売上を信じて内訳を捨てる
     （どこかを誤読している合図。中途半端に混ざるより、確実な欄だけ渡す） */
  if (out.total !== undefined && out.cash !== undefined && out.card !== undefined) {
    var sum = (out.cash || 0) + (out.card || 0) + (out.emoney || 0);
    if (Math.abs(sum - out.total) > Math.max(1000, out.total * 0.05)) {
      delete out.cash; delete out.card; delete out.emoney;
    }
  }
  return out;
}
