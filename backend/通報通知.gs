/* ===== 公益通報（kind: whistle）が届いたら、本部へメールで知らせ、カスハラは記録スプレッドシートにも残す（2026-09-24 神田さん） =====
   ねらい＝カスハラ対応（10/1施行）の相談窓口として、アプリの通報が「本部の誰かが画面を開くまで気づかれない」状態を無くす。
   記録の保管（9/24 決定）＝yosakura.fc のドライブに「カスハラ対応記録」フォルダとスプレッドシートを置き、
     ・アプリからの通報（お客様からの暴言・威圧・不当な要求）は自動で1行追加
     ・紙の記録様式は本部が同じスプレッドシートの「紙の記録」タブに転記
   使い方：
     1) この内容を Apps Script の「通報通知」ファイルに貼って Ctrl+S（前回貼ったものと置き換え）
     2) 通知先：setWhistleMailTo を1回実行（yosakura.fc@gmail.com を登録。登録済みなら不要）
     3) 記録スプシ：setupWhistleLog を1回実行 → ログに出るURLがスプレッドシート。フォルダとシートはこの関数が作る
        （ドライブに作る権限の確認が出たら許可）
     4) テスト：testWhistleMail を実行 → メールが届き、スプレッドシートに1行（テスト）が入る。テスト行は消してよい
   注意：メール本文には店舗名（匿名のときは伏せる）・種類・本文の冒頭だけ。写真は入れない。閲覧は本部のみ。 */

var WHISTLE_CAT_LABEL_ = {
  power: 'パワーハラスメント', sexual: 'セクシュアルハラスメント',
  customer: 'お客様からの暴言・威圧・不当な要求（カスハラ）', abuse: '職場での暴言・威圧',
  fraud: '不正行為', legal: '法令違反', hygiene: '衛生上の重大問題', other: 'その他重大な相談'
};
var WHISTLE_LOG_FOLDER = 'カスハラ対応記録';
var WHISTLE_LOG_SHEET = 'カスハラ対応記録';
var WHISTLE_LOG_TAB_APP = 'アプリからの通報';
var WHISTLE_LOG_TAB_PAPER = '紙の記録';
var WHISTLE_LOG_HEAD_APP = ['受信日時', '店舗', '種類', '内容', '匿名', '通報ID', '折り返し日時', '対応した本部担当', '対処（出入り禁止・警察・弁護士・なし）', '店へ伝えた日', 'メモ'];
var WHISTLE_LOG_HEAD_PAPER = ['発生日時', '店舗', '対応した責任者', '記録係', '最初に対応したスタッフ', 'お客様（人数・特徴）', '言動（言葉どおり）', 'こちらの対応', '退去要請の回数', '110番', '金銭・返金（その場で決めていない）', 'スタッフの様子（休憩・早退・面談希望）', '本部への報告手段', '折り返し日時', '本部担当', '対処', '店へ伝えた日', '保管者'];

function whistleMailTo_() {
  try { return String(PropertiesService.getScriptProperties().getProperty('WHISTLE_MAIL_TO') || '').trim(); } catch (e) { return ''; }
}

/* 記録スプレッドシートを探す（無ければ作る）。IDはスクリプト プロパティ WHISTLE_LOG_ID に控える */
function whistleLog_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('WHISTLE_LOG_ID');
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    var folder = null;
    var it = DriveApp.getFoldersByName(WHISTLE_LOG_FOLDER);
    folder = it.hasNext() ? it.next() : DriveApp.createFolder(WHISTLE_LOG_FOLDER);
    var files = folder.getFilesByName(WHISTLE_LOG_SHEET);
    if (files.hasNext()) { ss = SpreadsheetApp.open(files.next()); }
    else {
      ss = SpreadsheetApp.create(WHISTLE_LOG_SHEET);
      var f = DriveApp.getFileById(ss.getId()); folder.addFile(f);
      try { DriveApp.getRootFolder().removeFile(f); } catch (e) {}
    }
    props.setProperty('WHISTLE_LOG_ID', ss.getId());
  }
  // タブと見出しを整える（何度呼んでも同じ結果）
  var a = ss.getSheetByName(WHISTLE_LOG_TAB_APP);
  if (!a) { a = ss.getSheets()[0]; a.setName(WHISTLE_LOG_TAB_APP); }
  if (a.getLastRow() === 0) { a.appendRow(WHISTLE_LOG_HEAD_APP); a.setFrozenRows(1); }
  var p = ss.getSheetByName(WHISTLE_LOG_TAB_PAPER);
  if (!p) { p = ss.insertSheet(WHISTLE_LOG_TAB_PAPER); }
  if (p.getLastRow() === 0) { p.appendRow(WHISTLE_LOG_HEAD_PAPER); p.setFrozenRows(1); }
  return ss;
}

function notifyWhistle_(data, id) {
  var p = {}; try { p = JSON.parse(data.note || '{}') || {}; } catch (e) {}
  var cat = WHISTLE_CAT_LABEL_[p.cat] || String(p.cat || '');
  var store = p.anon ? '（匿名＝店舗名は伏せています）' : String(data.store || '');
  var body = String(p.body || '');
  var when = new Date(Number(data.t) || Date.now());
  var whenS = Utilities.formatDate(when, 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');

  // ① カスハラは記録スプレッドシートに1行（他の種類は本部データにだけ残す＝より慎重な扱い）
  if (String(p.cat || '') === 'customer') {
    try {
      var sh = whistleLog_().getSheetByName(WHISTLE_LOG_TAB_APP);
      sh.appendRow([whenS, store, cat, body, p.anon ? '匿名' : '', String(id || ''), '', '', '', '', '']);
    } catch (e) { Logger.log('記録スプシへの追加に失敗: ' + e); }
  }

  // ② 本部へメール
  var to = whistleMailTo_();
  if (!to) return;
  var head = body.length > 120 ? body.slice(0, 120) + '…' : body;
  // ★区分で件名を分ける（2026-09-25 構築MTG／増田さん 9/24「公益通報とカスハラを分ける」）。古い端末の送信（kind2なし）は種類から判定
  var HARASS = { customer: 1, power: 1, sexual: 1, abuse: 1 };
  var isHarass = p.kind2 ? (p.kind2 === 'harass') : !!HARASS[String(p.cat || '')];
  var subject = (isHarass ? '【世桜アプリ】ハラスメントの相談が届きました：' : '【世桜アプリ】公益通報が届きました：') + cat;
  var lines = [
    (isHarass ? '世桜アプリの相談・通報窓口に、ハラスメントの相談が届きました。' : '世桜アプリの相談・通報窓口に、公益通報が届きました。'),
    '',
    '日時　：' + whenS,
    '種類　：' + cat,
    '店舗　：' + store,
    '本文　：' + head,
    '',
    '全文はアプリ（本部でログイン）→ その他 → 相談・通報窓口 で確認してください。',
    '受付：平日9:00〜18:00／回答：原則、翌営業日（相談窓口＝世桜本部）'
  ];
  if (String(p.cat || '') === 'customer') {
    var url = ''; try { url = whistleLog_().getUrl(); } catch (e) {}
    lines.push('カスハラ対応記録（スプレッドシート）にも1行追加しました。折り返し・対処を書き足してください。');
    if (url) lines.push(url);
  }
  lines.push('通報した方に不利益な扱いをしないこと、内容を店内に広げないことは法律の義務です。');
  lines.push('（ID: ' + String(id || '') + '）');
  MailApp.sendEmail({ to: to, subject: subject, body: lines.join('\n'), name: '世桜アプリ' });
}

/* ---- エディタから実行する関数 ---- */

/* 通知先の登録（設定画面で保存が消える現象があるため、コードから登録する） */
function setWhistleMailTo() {
  PropertiesService.getScriptProperties().setProperty('WHISTLE_MAIL_TO', 'yosakura.fc@gmail.com');
  Logger.log('登録しました → ' + PropertiesService.getScriptProperties().getProperty('WHISTLE_MAIL_TO'));
}

/* いま何が入っているかを見る */
function showWhistleMailTo() {
  Logger.log('WHISTLE_MAIL_TO = ' + PropertiesService.getScriptProperties().getProperty('WHISTLE_MAIL_TO'));
  Logger.log('WHISTLE_LOG_ID = ' + PropertiesService.getScriptProperties().getProperty('WHISTLE_LOG_ID'));
}

/* 記録スプレッドシートを作る（初回だけ。2回目以降は既存を使う） */
function setupWhistleLog() {
  var ss = whistleLog_();
  Logger.log('カスハラ対応記録 → ' + ss.getUrl());
  Logger.log('タブ：' + ss.getSheets().map(function (s) { return s.getName(); }).join(' / '));
}

/* 初回の権限許可と、通知先・記録の確認用＝自分宛てにテストメールを送り、記録スプシに1行（テスト）を入れる */
function testWhistleMail() {
  var to = whistleMailTo_();
  if (!to) { Logger.log('WHISTLE_MAIL_TO が未設定です。先に setWhistleMailTo を実行してください'); return; }
  notifyWhistle_({ kind: 'whistle', store: '牛カツ世桜 長堀橋店', t: Date.now(),
                   note: JSON.stringify({ cat: 'customer', body: 'テスト送信です（本文の見え方の確認）。この行は消してください', anon: false }) }, 'test');
  Logger.log('送信しました → ' + to + '　記録：' + whistleLog_().getUrl());
}
