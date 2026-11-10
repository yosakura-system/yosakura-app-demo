/** ============================================================
 * 注文フォーム取込.gs — 本部ドライブの「店舗名マスタ」（新田さん作成）から、店舗ごとの注文フォームのURLをアプリへ写す
 *   2026-11-10 神田さん「店舗名マスタの中に各店舗のリンク先に分かれたフォームがある。アプリで各店舗がログインした際に
 *   そこから発注フォームに飛ぶ仕組みを。個人名のIDは店舗を選択して『発注』でそのフォームへ」
 *
 * ■ 仕組み
 *   1時間に1回 orderformsHourly() が走り、店舗名マスタ（スプレッドシートIDは ScriptProperties の ORDERFORMS_SHEET_ID）を読む。
 *   1行目＝見出し。「店舗番号」「店舗名」の列と、Googleフォームの URL が入っている列（和牛／ポップ／ハラル…）を拾い、
 *   店ごとに { code, store, forms:[{ key:列の見出し, url }] } にして、reports シートへ kind=orderforms の1行（note=JSON）で書く。
 *   アプリは最新の1行を読む（linkset と同じ「配列を丸ごと・最新版が正」）。内容が前回と同じなら書かない（指紋を ScriptProperties に持つ）。
 *   ★フォームのURLはこの写し（本部データ）にだけ置く。アプリのコード（公開リポジトリ）には書かない。
 *
 * ■ 読まない列
 *   見出しが「※」で始まる列（※請求先番号・※ハラル鰻・※ハラル禁則用正規表現）／住所・メール・郵便・電話の列／Googleフォーム以外のセル（「ー」「可能」空欄・ほかのURL）。
 *   住所・メールは写さない（注文の入口に要らない＝端末に残さない）。
 *
 * ■ 初回だけ
 *   1) 注文フォーム_設定('スプレッドシートのID') を1回実行（IDは店舗名マスタのURLの /d/ と /edit の間）
 *   2) 注文フォーム_トリガー登録() を1回実行 → 毎時のトリガーが入る。すぐ反映したいときは 注文フォーム_マスタから取込() を手で実行
 *   ※ デプロイは不要（トリガー関数＝Webアプリの更新と無関係）
 * ============================================================ */

var ORDERFORMS_PROP_ID = 'ORDERFORMS_SHEET_ID';   // 店舗名マスタのスプレッドシートID（ScriptProperties）
var ORDERFORMS_PROP_FP = 'orderforms_fp';         // 前回書いた内容の指紋
var ORDERFORMS_SHEET = '店舗名マスタ';              // タブ名（無ければ1枚目）

function 注文フォーム_設定(sheetId) {
  if (!sheetId) throw new Error('店舗名マスタのスプレッドシートIDを渡してください');
  PropertiesService.getScriptProperties().setProperty(ORDERFORMS_PROP_ID, String(sheetId).trim());
  var v = PropertiesService.getScriptProperties().getProperty(ORDERFORMS_PROP_ID) || '';
  Logger.log('ORDERFORMS_SHEET_ID を保存しました（長さ=' + v.length + ' 先頭4=' + v.slice(0, 4) + '）');
}

function 注文フォーム_トリガー登録() {
  var fn = 'orderformsHourly';
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
  Logger.log('毎時のトリガーを登録しました（' + fn + '）');
}

/** トリガー用の別名（日本語名のトリガーは静かに失敗することがある） */
function orderformsHourly() { 注文フォーム_マスタから取込(); }

/** 店舗名マスタを読んで { rows:[{code, store, forms:[{key,url}]}] } を返す（書かない）。確認用に単体でも実行できる */
function 注文フォーム_読む() {
  var id = PropertiesService.getScriptProperties().getProperty(ORDERFORMS_PROP_ID);
  if (!id) throw new Error('ORDERFORMS_SHEET_ID が未設定です。注文フォーム_設定(ID) を先に実行してください');
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(ORDERFORMS_SHEET) || ss.getSheets()[0];
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return { rows: [] };
  var head = vals[0].map(function (h) { return String(h || '').trim(); });
  var cCode = head.indexOf('店舗番号'), cStore = head.indexOf('店舗名');
  if (cCode < 0 || cStore < 0) throw new Error('見出しに「店舗番号」「店舗名」がありません: ' + head.join(' / '));
  // 注文フォーム＝Googleフォームの URL だけ（docs.google.com/forms／forms.gle）。住所・メール等に URL が入っても拾わない
  var isUrl = function (v) { return /^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/i.test(String(v || '').trim()); };
  var NOT_FORM_HEAD = /住所|メール|mail|郵便|電話|TEL|請求/i;
  // Googleフォームの URL が1つでも入っている列＝注文フォームの列（※で始まる見出し・住所やメールの列は対象外）
  var formCols = [];
  head.forEach(function (h, c) {
    if (!h || h.charAt(0) === '※' || NOT_FORM_HEAD.test(h) || c === cCode || c === cStore) return;
    for (var r = 1; r < vals.length; r++) { if (isUrl(vals[r][c])) { formCols.push(c); break; } }
  });
  var rows = [];
  for (var r = 1; r < vals.length; r++) {
    var code = String(vals[r][cCode] || '').trim(), store = String(vals[r][cStore] || '').trim();
    if (!code && !store) continue;
    var forms = [];
    formCols.forEach(function (c) { var u = String(vals[r][c] || '').trim(); if (isUrl(u)) forms.push({ key: head[c], url: u }); });
    rows.push({ code: code, store: store, forms: forms });
  }
  return { rows: rows };
}

function 注文フォーム_マスタから取込() {
  var data = 注文フォーム_読む();
  var props = PropertiesService.getScriptProperties();
  // 指紋＝SHA-256（ScriptProperties は1件 9KB 上限＝JSONをそのまま置かない）
  var fp = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(data.rows), Utilities.Charset.UTF_8));
  if (props.getProperty(ORDERFORMS_PROP_FP) === fp) { Logger.log('店舗名マスタは前回と同じ＝書きません（' + data.rows.length + '店）'); return; }
  data.t = Date.now(); data.src = 'master';
  // HEADERS = ['id', 'ts', 'kind', 'store', 'item', 'level', 'note', 'photos']
  getSheet().appendRow([Utilities.getUuid(), data.t, 'orderforms', '', 'orderforms', '', JSON.stringify(data), '[]']);
  props.setProperty(ORDERFORMS_PROP_FP, fp);
  Logger.log('注文フォームを写しました（' + data.rows.length + '店・フォーム ' + data.rows.reduce(function (n, r) { return n + r.forms.length; }, 0) + '件）');
}
