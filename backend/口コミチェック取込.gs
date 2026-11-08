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
 *   ・問題画像（セル内の画像）は写さない＝画像はチェック表で見る
 *     ★11/7夜に一度「写真も写す」を入れたが、11/8 神田さんの判断で止めた＝お客様（投稿者）の写真の写しを世桜のドライブに保管しない。
 *       著作権は投稿したお客様にあり、Googleの規約が世桜に利用を許しているわけではない。小さくても踏まなくてよいリスク。
 *       写した274枚は rvissuePhotoRemoveAll で削除済み（11/8）。写真は元のチェック表（木村さん）で見る
 *   ・問題内容は 1,000字まで（口コミ本文は長い）・補足は300字まで
 *   ・店舗名はチェック表の表記のまま（アプリの正式名称と同じ。無い店もそのまま入れ、画面では「一覧に無い店」と出る）
 *   ・チェック表の行が直されると印が変わり、新しい行として写る（古い方は残る＝消さない）
 *
 * ■ 初回セットアップ（神田さんの作業）
 *   1. スクリプトプロパティに RVISSUE_SHEET_ID ＝ チェック表のスプレッドシートID（URLの /d/ と /edit の間）
 *      （タブ名が「問題記録」でないときは RVISSUE_TAB も）。★IDはコードに書かない（公開リポジトリ）
 *   2. このファイルを貼り、エディタで rvissueFetchCheck を選んで1回実行＝読めた行数・写す予定の件数・先頭5件がログに出る（何も書き込まない）
 *   3. トリガー設定：エディタで rvissueSetupTrigger を1回実行（rvissueFetchDaily ／ 日タイマー ／ 23〜24時＝口コミ取得 reviewFetchDaily の後。重複は作らない）
 *   4. 認証.gs（AUTH_HQ_READ_KINDS・AUTH_HQ_WRITE_KINDS）と Code.gs（PURGE_KEEP_KINDS）も貼り替え → デプロイ（既存の編集）
 */
var RVISSUE_KIND = 'rvissue';
var RVISSUE_TEXT_MAX = 1000;
var RVISSUE_MEMO_MAX = 300;

/** ★動作確認（エディタから1回実行）＝何も書き込まない。読めた行数・写す予定の件数・先頭5件をログに */
function rvissueFetchCheck() { Logger.log(JSON.stringify(rvissueRun_(false))); }

/** 毎日1回のトリガーで実行する本体（英字名＝日本語名トリガーの「不明なエラー」を避ける決めごと） */
function rvissueFetchDaily() { Logger.log(JSON.stringify(rvissueRun_(true))); }

function rvissueRun_(write) {
  var props = PropertiesService.getScriptProperties();
  var sid = props.getProperty('RVISSUE_SHEET_ID');
  if (!sid) return { ok: false, error: 'RVISSUE_SHEET_ID が未設定です（スクリプトプロパティにチェック表のスプレッドシートIDを入れてください）' };
  var tab = props.getProperty('RVISSUE_TAB') || '問題記録';
  var src = SpreadsheetApp.openById(sid).getSheetByName(tab);
  if (!src) return { ok: false, error: 'チェック表にタブが見つかりません: ' + tab };
  var last = src.getLastRow();
  if (last < 2) return { ok: true, write: !!write, read: 0, added: 0, alreadyCopied: 0 };
  /* A チェック日時／B 店舗名／C 問題種別／D 表示数値／E 表示単位／F 推定投稿日／G 問題内容／H 問題画像（写さない）／I 補足 */
  var vals = src.getRange(2, 1, last - 1, 9).getValues();

  /* すでに写した印＝reports の kind=rvissue 行の level 列 */
  var sh = getSheet();
  var seen = {};
  var n = sh.getLastRow();
  if (n >= 2) {
    var ks = sh.getRange(2, 3, n - 1, 4).getValues();   // kind, store, item, level
    for (var j = 0; j < ks.length; j++) if (String(ks[j][0]) === RVISSUE_KIND && ks[j][3]) seen[String(ks[j][3])] = 1;
  }

  var read = 0, added = 0, skipped = 0, sample = [], nth = {};
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    var chk = rvissueDate_(r[0]), store = String(r[1] || '').trim(), type = String(r[2] || '').trim();
    var text = String(r[6] || '').trim();
    if (!store || !type) continue;              // 空行・途中の行は飛ばす
    read++;
    var est = rvissueDate_(r[5]) || chk;        // 推定投稿日（無ければチェック日）
    var ago = (String(r[3] || '').trim() + ' ' + String(r[4] || '').trim()).trim();
    var base = chk + '|' + store + '|' + type + '|' + est + '|' + text.slice(0, 200);
    nth[base] = (nth[base] || 0) + 1;            // 同じ内容の何枚目か（表の並び順＝追記順で安定）
    var key = rvissueKey_(base + '|' + nth[base]);
    if (seen[key]) { skipped++; continue; }
    seen[key] = 1;
    var note = { src: 'kimura', key: key, chk: chk, type: type, ago: ago,
                 text: text.slice(0, RVISSUE_TEXT_MAX), memo: String(r[8] || '').trim().slice(0, RVISSUE_MEMO_MAX) };
    if (write) {
      /* ★日付は先頭アポストロフィ付き＝シートが日付セルへ自動変換するのを防ぐ（gsnap と同じ） */
      sh.appendRow([Utilities.getUuid(), Date.now(), RVISSUE_KIND, store, "'" + est, key, JSON.stringify(note), '[]']);
    } else if (sample.length < 5) {
      sample.push({ store: store, type: type, est: est, text: text.slice(0, 40) });
    }
    added++;
  }
  return { ok: true, write: !!write, read: read, added: added, alreadyCopied: skipped, sample: sample };
}

/** ★11/8 片づけ（エディタから1回実行）＝11/7夜の版が写した写真を全部消す。
 *   ・reports の kind=rvissue 行の photos にある写真IDのファイルをゴミ箱へ → photos を '[]' に戻す
 *   ・写真フォルダに残る rvissue_ で始まるファイル（行に付かなかった分）もゴミ箱へ
 *   チェック表には触らない。reports に書くのは photos 列（8列目）だけ */
function rvissuePhotoRemoveAll() {
  var sh = getSheet();
  var n = sh.getLastRow();
  var trashed = 0, cleared = 0, failed = 0, orphans = 0;
  if (n >= 2) {
    var vals = sh.getRange(2, 3, n - 1, 6).getValues();   // kind, store, item, level, note, photos
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]) !== RVISSUE_KIND) continue;
      var ph = String(vals[i][5] || '').trim();
      if (!ph || ph === '[]') continue;
      var ids = [];
      try { ids = JSON.parse(ph); } catch (e) { ids = []; }
      for (var j = 0; j < ids.length; j++) {
        var id = String(ids[j] || '').replace(/^p:/, '');
        if (!id) continue;
        try { DriveApp.getFileById(id).setTrashed(true); trashed++; } catch (e2) { failed++; Logger.log('trash ' + id + ': ' + e2); }
      }
      sh.getRange(i + 2, 8).setValue('[]');
      cleared++;
    }
  }
  /* 行に付かなかった写し（時間切れで後回しのまま等）＝ファイル名 rvissue_ で拾う */
  var it = getPhotoFolder().searchFiles("title contains 'rvissue_' and trashed = false");
  while (it.hasNext()) { var f = it.next(); if (/^rvissue_/.test(f.getName())) { f.setTrashed(true); orphans++; } }
  var r = { ok: true, trashed: trashed, orphans: orphans, rowsCleared: cleared, failed: failed };
  Logger.log(JSON.stringify(r));
  return r;
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
