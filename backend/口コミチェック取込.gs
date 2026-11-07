/**
 * 世桜アプリ｜本部の口コミ・盛付チェック表の写し（2026-11-07 神田さんのご指示＝段階1・本部だけ・読むだけ）
 * Code.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なにをするか
 *   1日1回、本部の隔週チェック表（スプレッドシート）の「問題記録」タブを読み、まだ写していない行を
 *   reports に kind='rvissue' で1行ずつ足す。アプリの本部画面「口コミ・盛付の指摘」がこれを店別に並べる。
 *   店舗の端末には返さない（認証.gs の AUTH_HQ_READ_KINDS）。
 *
 * ■ 決めごと
 *   ・読むだけ＝チェック表には1文字も書き込まない。正はチェック表のまま（二重管理にしない）
 *   ・同じ行を二度写さない＝チェック日時＋店舗＋種別＋推定投稿日＋問題内容＋「同じ内容の何枚目か」から作った印（key）を level 列に控え、
 *     reports にある印は飛ばす（印の控えをスクリプトプロパティに持たない＝9KBの上限に当たらない）
 *     ★同じ日に同じ文面の行が複数ある（例：盛付写真「うなぎの焦げ」3枚）＝別の写真なので1件にまとめない（11/7 初回の下見で45件あった）
 *   ・問題画像（セル内の画像）も写す（11/7 神田さん「写真は見ることできないのかな？」）
 *     ＝セル内画像の中身を本部の写真フォルダ（店の提出写真と同じ「世桜アプリ_写真」）へ保存し、写真IDを行の photos に付ける。
 *       公開リンクにはしない（Code.gs の isPrivatePhotoRow_ で rvissue はログイン経由・本部だけに返す）。90日削除からも守る（samplePhotoIds_）。
 *       ★1回の実行で保存する枚数と時間に上限（6分の壁）。間に合わなかった分は rvissuePhotoBackfill で後から付ける（毎晩の取込の最後にも1回回る）
 *   ・問題内容は 1,000字まで（口コミ本文は長い）・補足は300字まで
 *   ・店舗名はチェック表の表記のまま（アプリの正式名称と同じ。無い店もそのまま入れ、画面では「一覧に無い店」と出る）
 *   ・チェック表の行が直されると印が変わり、新しい行として写る（古い方は残る＝消さない）
 *
 * ■ 初回セットアップ（神田さんの作業）
 *   1. スクリプトプロパティに RVISSUE_SHEET_ID ＝ チェック表のスプレッドシートID（URLの /d/ と /edit の間）
 *      （タブ名が「問題記録」でないときは RVISSUE_TAB も）。★IDはコードに書かない（公開リポジトリ）
 *   2. このファイルを貼り、エディタで rvissueFetchCheck を選んで1回実行＝読めた行数・写す予定の件数・画像のある行数・先頭5件がログに出る（何も書き込まない）
 *   3. トリガー設定：エディタで rvissueSetupTrigger を1回実行（rvissueFetchDaily ／ 日タイマー ／ 23〜24時＝口コミ取得 reviewFetchDaily の後。重複は作らない）
 *   4. 認証.gs（AUTH_HQ_READ_KINDS・AUTH_HQ_WRITE_KINDS）と Code.gs（PURGE_KEEP_KINDS・isPrivatePhotoRow_・samplePhotoIds_）も貼り替え → デプロイ（既存の編集）
 *   5. 写真を後から付ける＝エディタで rvissuePhotoBackfill を、ログの remaining が 0 になるまで何回か実行（1回4分まで）
 */
var RVISSUE_KIND = 'rvissue';
var RVISSUE_TEXT_MAX = 1000;
var RVISSUE_MEMO_MAX = 300;
var RVISSUE_PHOTO_BUDGET_MS = 240000;   // 写真の取得に使う時間の上限（4分）＝6分の壁の手前で止める
var RVISSUE_PHOTO_MAX = 80;             // 1回の実行で保存する写真の上限

/** ★動作確認（エディタから1回実行）＝何も書き込まない。読めた行数・写す予定の件数・画像のある行数・先頭5件をログに */
function rvissueFetchCheck() { Logger.log(JSON.stringify(rvissueRun_(false))); }

/** 毎日1回のトリガーで実行する本体（英字名＝日本語名トリガーの「不明なエラー」を避ける決めごと） */
function rvissueFetchDaily() {
  var t0 = Date.now();
  var r = rvissueRun_(true);
  Logger.log(JSON.stringify(r));
  /* 行は写したが写真がまだ付いていない分（時間切れ・前の版で写した行）を、残り時間で付ける */
  try { Logger.log(JSON.stringify(rvissuePhotoBackfill_(Math.max(0, RVISSUE_PHOTO_BUDGET_MS - (Date.now() - t0))))); }
  catch (e) { Logger.log('rvissuePhotoBackfill_: ' + e); }
}

/** 写真だけ後から付ける（エディタから実行＝1回4分まで・remaining が 0 になるまで繰り返す） */
function rvissuePhotoBackfill() { Logger.log(JSON.stringify(rvissuePhotoBackfill_(RVISSUE_PHOTO_BUDGET_MS))); }

/** チェック表の「問題記録」を読み、1行ずつ印（key）まで計算して返す。書かない */
function rvissueSource_() {
  var props = PropertiesService.getScriptProperties();
  var sid = props.getProperty('RVISSUE_SHEET_ID');
  if (!sid) return { ok: false, error: 'RVISSUE_SHEET_ID が未設定です（スクリプトプロパティにチェック表のスプレッドシートIDを入れてください）' };
  var tab = props.getProperty('RVISSUE_TAB') || '問題記録';
  var src = SpreadsheetApp.openById(sid).getSheetByName(tab);
  if (!src) return { ok: false, error: 'チェック表にタブが見つかりません: ' + tab };
  var last = src.getLastRow();
  var rows = [], nth = {};
  if (last < 2) return { ok: true, rows: rows };
  /* A チェック日時／B 店舗名／C 問題種別／D 表示数値／E 表示単位／F 推定投稿日／G 問題内容／H 問題画像（セル内の画像）／I 補足 */
  var vals = src.getRange(2, 1, last - 1, 9).getValues();
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    var chk = rvissueDate_(r[0]), store = String(r[1] || '').trim(), type = String(r[2] || '').trim();
    var text = String(r[6] || '').trim();
    if (!store || !type) continue;              // 空行・途中の行は飛ばす
    var est = rvissueDate_(r[5]) || chk;        // 推定投稿日（無ければチェック日）
    var ago = (String(r[3] || '').trim() + ' ' + String(r[4] || '').trim()).trim();
    var base = chk + '|' + store + '|' + type + '|' + est + '|' + text.slice(0, 200);
    nth[base] = (nth[base] || 0) + 1;            // 同じ内容の何枚目か（表の並び順＝追記順で安定）
    var key = rvissueKey_(base + '|' + nth[base]);
    rows.push({ chk: chk, store: store, type: type, est: est, ago: ago, text: text,
                memo: String(r[8] || '').trim(), key: key, img: rvissueHasImage_(r[7]) ? r[7] : null });
  }
  return { ok: true, rows: rows };
}

function rvissueRun_(write) {
  var t0 = Date.now();
  var s = rvissueSource_();
  if (!s.ok) return s;
  if (!s.rows.length) return { ok: true, write: !!write, read: 0, added: 0, alreadyCopied: 0, withImage: 0 };

  /* すでに写した印＝reports の kind=rvissue 行の level 列 */
  var sh = getSheet();
  var seen = {};
  var n = sh.getLastRow();
  if (n >= 2) {
    var ks = sh.getRange(2, 3, n - 1, 4).getValues();   // kind, store, item, level
    for (var j = 0; j < ks.length; j++) if (String(ks[j][0]) === RVISSUE_KIND && ks[j][3]) seen[String(ks[j][3])] = 1;
  }

  var read = 0, added = 0, skipped = 0, withImage = 0, photos = 0, photoLater = 0, sample = [];
  for (var i = 0; i < s.rows.length; i++) {
    var x = s.rows[i];
    read++;
    if (x.img) withImage++;
    if (seen[x.key]) { skipped++; continue; }
    seen[x.key] = 1;
    var note = { src: 'kimura', key: x.key, chk: x.chk, type: x.type, ago: x.ago,
                 text: x.text.slice(0, RVISSUE_TEXT_MAX), memo: x.memo.slice(0, RVISSUE_MEMO_MAX) };
    if (write) {
      var ids = [];
      if (x.img) {
        if (photos < RVISSUE_PHOTO_MAX && Date.now() - t0 < RVISSUE_PHOTO_BUDGET_MS) {
          var pid = rvissueSavePhoto_(x.img, x.store, x.est, x.key);
          if (pid) { ids.push(pid); photos++; } else photoLater++;
        } else photoLater++;                       // 時間切れ＝行だけ写し、写真は rvissuePhotoBackfill_ で後から
      }
      /* ★日付は先頭アポストロフィ付き＝シートが日付セルへ自動変換するのを防ぐ（gsnap と同じ） */
      sh.appendRow([Utilities.getUuid(), Date.now(), RVISSUE_KIND, x.store, "'" + x.est, x.key, JSON.stringify(note), JSON.stringify(ids)]);
    } else if (sample.length < 5) {
      sample.push({ store: x.store, type: x.type, est: x.est, text: x.text.slice(0, 40), img: !!x.img });
    }
    added++;
  }
  return { ok: true, write: !!write, read: read, added: added, alreadyCopied: skipped, withImage: withImage,
           photosSaved: photos, photosLater: photoLater, sample: sample, ms: Date.now() - t0 };
}

/** 行は写したが写真が付いていない rvissue 行に、チェック表のセル内画像を保存して付ける（reports 側だけ書く・チェック表には書かない） */
function rvissuePhotoBackfill_(budgetMs) {
  var t0 = Date.now();
  var s = rvissueSource_();
  if (!s.ok) return s;
  var byKey = {};
  for (var k = 0; k < s.rows.length; k++) if (s.rows[k].img) byKey[s.rows[k].key] = s.rows[k];
  var sh = getSheet();
  var n = sh.getLastRow();
  if (n < 2) return { ok: true, added: 0, remaining: 0 };
  var vals = sh.getRange(2, 3, n - 1, 6).getValues();   // kind, store, item, level, note, photos
  var added = 0, missing = 0, noImage = 0, failed = 0;
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) !== RVISSUE_KIND) continue;
    var ph = String(vals[i][5] || '').trim();
    if (ph && ph !== '[]') continue;                      // もう付いている
    var x = byKey[String(vals[i][3] || '')];
    if (!x) { noImage++; continue; }                      // 表に画像が無い行（口コミ）か、表が直されて印が変わった古い行
    missing++;
    if (added >= RVISSUE_PHOTO_MAX || Date.now() - t0 > (budgetMs || 0)) continue;
    var id = rvissueSavePhoto_(x.img, x.store, x.est, x.key);
    if (!id) { failed++; continue; }
    sh.getRange(i + 2, 8).setValue(JSON.stringify([id]));
    added++;
  }
  return { ok: true, added: added, remaining: missing - added, failed: failed, withoutImage: noImage, ms: Date.now() - t0 };
}

/** セルの値が「セル内の画像」か（CellImage。文字のURLでも可） */
function rvissueHasImage_(v) {
  if (!v) return false;
  if (typeof v === 'object' && (typeof v.getContentUrl === 'function' || typeof v.getUrl === 'function')) return true;
  return /^https?:\/\//.test(String(v));
}

/** セル内の画像を本部の写真フォルダへ保存して、写真IDを返す（読めなければ ''）。公開リンクにはしない */
function rvissueSavePhoto_(img, store, est, key) {
  try {
    var url = '';
    try { if (img && typeof img.getContentUrl === 'function') url = String(img.getContentUrl() || ''); } catch (e1) {}
    if (!url) { try { if (img && typeof img.getUrl === 'function') url = String(img.getUrl() || ''); } catch (e2) {} }
    if (!url && /^https?:\/\//.test(String(img || ''))) url = String(img);
    if (!url) return '';
    /* 原寸（=s2048）は要らない＝画面は幅1,600までしか使わない。小さい指定が効かないURLなら元のまま */
    var small = url.replace(/=s\d+(?=\?|$)/, '=s1200');
    var res = UrlFetchApp.fetch(small, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200 && small !== url) res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return '';
    var blob = res.getBlob();
    var ct = String(blob.getContentType() || '');
    if (ct.indexOf('image/') !== 0) return '';
    blob.setName('rvissue_' + key + (ct === 'image/png' ? '.png' : ct === 'image/webp' ? '.webp' : '.jpg'));
    var file = getPhotoFolder().createFile(blob);   // 共有は付けない＝本部のログイン経由（action:'photo'）でだけ返る
    try { file.setDescription(JSON.stringify({ store: String(store || ''), kind: RVISSUE_KIND, item: String(est || ''), key: String(key || '') })); } catch (e3) {}
    return file.getId();
  } catch (err) {
    Logger.log('rvissueSavePhoto_ ' + key + ': ' + err);
    return '';
  }
}

/** セルの値 → 'yyyy-MM-dd'。Date型でも '2026/11/05' の文字でも。読めなければ '' */
function rvissueDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var m = String(v || '').trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

/** 行の印＝MD5 の先頭6バイト（12桁の16進） */
function rvissueKey_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < 6; i++) h += ('0' + ((d[i] + 256) % 256).toString(16)).slice(-2);
  return h;
}

/** トリガーを登録（エディタから1回実行・重複は作らない）＝rvissueFetchDaily 日タイマー 23〜24時 */
function rvissueSetupTrigger() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'rvissueFetchDaily'; });
  if (has) { Logger.log('登録済み: rvissueFetchDaily'); return; }
  ScriptApp.newTrigger('rvissueFetchDaily').timeBased().everyDays(1).atHour(23).create();
  Logger.log('登録した: rvissueFetchDaily 毎日23時台');
}
