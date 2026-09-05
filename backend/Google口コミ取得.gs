/**
 * 世桜アプリ｜Google口コミ件数の自動取得（2026-09-06 神田さんご承認：①口コミ欄=Google口コミ ②キーは yosakura.fc）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか
 *   1日1回、各店舗のGoogleビジネスプロフィールの「総口コミ件数」を Places API で取得し、
 *   前日との差（＝当日の獲得数）を gsnap 行として保存する。
 *   アプリ側は総括表入力の「口コミ 当日」へその数字を下書きとして入れる（確定は必ず人が提出＝写真OCRと同じ型）。
 *
 * ■ 決めごと（既存の取込と同じ）
 *   ・読むだけ＝総括表シートには1文字も書き込まない。reports に1日1店舗1行を足すだけ
 *   ・読めなかった店舗は入れない（0で埋めない）
 *   ・初回は前回値が無いため「総数」だけ記録し、獲得数は翌日から入る
 *   ・口コミが削除されると獲得数がマイナスになる日がある（そのまま記録する。アプリ側は自動では入れず手入力に譲る）
 *   ・費用＝この用途のSKUは月1,000リクエストまで無料。5店舗×1日1回≒月150回＝無料枠内。
 *     ★毎時にはしない（枠を超えて課金される）
 *
 * ■ 初回セットアップ（神田さんの作業）
 *   1. Google Cloud（yosakura.fc でログイン）→ プロジェクト作成 → 「Places API (New)」を有効化 → APIキーを作成
 *      （お支払い情報の登録は必要。無料枠内なら請求は発生しない。キーは「Places API (New)」だけに制限しておく）
 *   2. GASのスクリプトプロパティに2つ設定：
 *      PLACES_API_KEY = 作成したキー
 *      REVIEW_PLACES  = {"牛カツ世桜 長堀橋店":"ChIJ..."} の形（店舗名→プレイスID。店舗名はアプリの正式名称と完全一致）
 *      プレイスIDは公式の「Place ID Finder」で店舗名を検索して取得：
 *      https://developers.google.com/maps/documentation/places/web-service/place-id
 *   3. このファイルを貼り、エディタで reviewFetchCheck を選んで1回実行（初回の承認もここで出る。何も書き込まない）
 *   4. トリガー設定：関数 reviewFetchDaily ／ 時間主導型 ／ 日タイマー ／ 22〜23時
 *      （クローズ前に当日ぶんを確定させ、翌朝の総括表入力に「昨日の獲得数」が入るようにする）
 */
var REVIEW_KIND = 'gsnap';

/** ★動作確認（エディタから1回実行）＝最初の1店舗だけ読んでログに出す。何も書き込まない */
function reviewFetchCheck() {
  var places = reviewPlaces_();
  var names = Object.keys(places);
  if (!names.length) { Logger.log('REVIEW_PLACES が未設定です（スクリプトプロパティに 店舗名→プレイスID のJSONを入れてください）'); return; }
  var r = reviewFetchOne_(places[names[0]]);
  Logger.log(names[0] + ': ' + JSON.stringify(r) + '（total=総口コミ件数・rating=星の平均）');
}

/** 毎日1回のトリガーで実行する本体（英字名＝日本語名トリガーの「不明なエラー」を避ける決めごと） */
function reviewFetchDaily() {
  var places = reviewPlaces_();
  var props = PropertiesService.getScriptProperties();
  var last = {};
  try { last = JSON.parse(props.getProperty('REVIEW_LAST') || '{}'); } catch (e) { last = {}; }
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var sh = getSheet();
  for (var store in places) {
    try {
      var r = reviewFetchOne_(places[store]);
      if (!r || r.total === undefined) continue;            // 読めなかった店舗は入れない
      var prev = last[store] || {};
      /* 基準＝前日の総数。同じ日に2回動いても基準は前日のまま（差が0に潰れない） */
      var baseN = (prev.d === today) ? prev.base : prev.n;
      var note = { total: r.total, src: 'places' };
      if (r.rating !== undefined) note.rating = r.rating;
      if (baseN !== undefined) note.gained = r.total - baseN;
      sh.appendRow([Utilities.getUuid(), Date.now(), REVIEW_KIND, store, today, '', JSON.stringify(note), '[]']);
      last[store] = { d: today, n: r.total, base: baseN };  // 初日は base=undefined のまま＝獲得数は翌日から
    } catch (e) {
      try { Logger.log('reviewFetchDaily ' + store + ': ' + e); } catch (_) {}
    }
  }
  props.setProperty('REVIEW_LAST', JSON.stringify(last));
}

/** プレイスID 1件 → { total: 総口コミ件数, rating: 星の平均 }。読めなければ null */
function reviewFetchOne_(placeId) {
  var key = PropertiesService.getScriptProperties().getProperty('PLACES_API_KEY');
  if (!key) throw new Error('PLACES_API_KEY が未設定です');
  var res = UrlFetchApp.fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId) + '?languageCode=ja', {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'userRatingCount,rating' },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('Places API HTTP ' + res.getResponseCode() + ': ' + String(res.getContentText()).slice(0, 200));
    return null;
  }
  var j = JSON.parse(res.getContentText());
  var out = {};
  if (typeof j.userRatingCount === 'number') out.total = j.userRatingCount;
  if (typeof j.rating === 'number') out.rating = j.rating;
  return out;
}

function reviewPlaces_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('REVIEW_PLACES') || '{}'); } catch (e) { return {}; }
}
