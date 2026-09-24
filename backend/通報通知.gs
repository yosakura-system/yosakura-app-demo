/* ===== 公益通報（kind: whistle）が届いたら本部へメールで知らせる（2026-09-24 神田さん） =====
   ねらい＝カスハラ対応（10/1施行）の相談窓口として、アプリの通報が「本部の誰かが画面を開くまで気づかれない」状態を無くす。
   使い方：
     1) この内容を Apps Script のプロジェクトに新しいファイルとして貼る（名前は何でもよい）→ Ctrl+S
     2) Code.gs の doPost で行を追加した直後に、次の1行が入っていることを確認する（v284 で追加済み）
          try { if (typeof notifyWhistle_ === 'function' && String(data.kind || '') === 'whistle') notifyWhistle_(data, id); } catch (e) {}
     3) 通知先を設定する：エディタ左の「プロジェクトの設定」→「スクリプト プロパティ」に
          WHISTLE_MAIL_TO = 本部の相談窓口のメールアドレス（複数はカンマ区切り）
        を1つ追加して保存。未設定のあいだは何も送らない（アプリの動きは変わらない）。
     4) 初回だけ、この関数をエディタから実行して権限（メール送信）を許可する：testWhistleMail
   注意：メール本文には店舗名（匿名のときは伏せる）・種類・本文の冒頭だけを入れる。写真は入れない。
        通報の本文は個人情報を含み得るため、通知先は相談窓口の担当者に限る。 */

var WHISTLE_CAT_LABEL_ = {
  power: 'パワーハラスメント', sexual: 'セクシュアルハラスメント',
  customer: 'お客様からの暴言・威圧・不当な要求（カスハラ）', abuse: '職場での暴言・威圧',
  fraud: '不正行為', legal: '法令違反', hygiene: '衛生上の重大問題', other: 'その他重大な相談'
};

function whistleMailTo_() {
  try { return String(PropertiesService.getScriptProperties().getProperty('WHISTLE_MAIL_TO') || '').trim(); } catch (e) { return ''; }
}

function notifyWhistle_(data, id) {
  var to = whistleMailTo_();
  if (!to) return;   // 通知先が未設定＝送らない
  var p = {}; try { p = JSON.parse(data.note || '{}') || {}; } catch (e) {}
  var cat = WHISTLE_CAT_LABEL_[p.cat] || String(p.cat || '');
  var store = p.anon ? '（匿名＝店舗名は伏せています）' : String(data.store || '');
  var body = String(p.body || '');
  var head = body.length > 120 ? body.slice(0, 120) + '…' : body;
  var when = Utilities.formatDate(new Date(Number(data.t) || Date.now()), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm');
  var subject = '【世桜アプリ】公益通報が届きました：' + cat;
  var text = [
    '世桜アプリの公益通報・コンプライアンス窓口に、新しい通報が届きました。',
    '',
    '日時　：' + when,
    '種類　：' + cat,
    '店舗　：' + store,
    '本文　：' + head,
    '',
    '全文はアプリ（本部でログイン）→ その他 → 公益通報 で確認してください。',
    '通報した方に不利益な扱いをしないこと、内容を店内に広げないことは法律の義務です。',
    '（ID: ' + String(id || '') + '）'
  ].join('\n');
  MailApp.sendEmail({ to: to, subject: subject, body: text, name: '世桜アプリ' });
}

/* 初回の権限許可と、通知先の確認用（エディタから実行）＝自分宛てにテストメールを送る */
function testWhistleMail() {
  var to = whistleMailTo_();
  if (!to) { Logger.log('WHISTLE_MAIL_TO が未設定です（プロジェクトの設定 → スクリプト プロパティ）'); return; }
  notifyWhistle_({ kind: 'whistle', store: '牛カツ世桜 長堀橋店', t: Date.now(),
                   note: JSON.stringify({ cat: 'customer', body: 'テスト送信です（本文の見え方の確認）', anon: false }) }, 'test');
  Logger.log('送信しました → ' + to);
}

/* スクリプト プロパティの画面で保存できないときは、これを1回実行して登録する（2026-09-24 設定画面で保存が消える現象があった） */
function setWhistleMailTo() {
  PropertiesService.getScriptProperties().setProperty('WHISTLE_MAIL_TO', 'yosakura.fc@gmail.com');
  Logger.log('登録しました → ' + PropertiesService.getScriptProperties().getProperty('WHISTLE_MAIL_TO'));
}

/* いま何が入っているかを見る */
function showWhistleMailTo() {
  Logger.log('WHISTLE_MAIL_TO = ' + PropertiesService.getScriptProperties().getProperty('WHISTLE_MAIL_TO'));
}
