/** ============================================================
 * 勉強会9月登録.gs — 2026年9月勉強会（9/9）をアプリの「勉強会アーカイブ」へ登録する1回きりの関数
 *
 * ■ 使い方
 *   ① このファイルを「世桜アプリバックエンド」プロジェクトに追加
 *   ② 関数 勉強会9月を登録 を実行 → ログに登録内容が出る
 *   ③ アプリ側は「最新にする」か次の同期で全店に表示される
 *
 * ■ 録画リンクの追記（録画がドライブに上がったら）
 *   下の VIDEO_URL にリンクを貼って、もう一度 勉強会9月を登録 を実行するだけ
 *   （同じID・新しい時刻＝上書きの作りなので、二重には並ばない）
 * ============================================================ */

var ST9_ID = 'st_2609';            // この回のID（再実行しても同じIDに上書き）
var VIDEO_URL = '';                // ★録画が上がったらここにリンクを貼って再実行

function 勉強会9月を登録() {
  var rec = {
    id: ST9_ID,
    title: '2026年9月勉強会（9/9）',
    date: '2026-09-09',
    video: VIDEO_URL,
    docs: [
      { title: 'アジェンダスライド', url: 'https://docs.google.com/presentation/d/18h4Q-975CWb_hYCC1Gpxx7wqU9qtzQ13S3e2gPPHzAY/edit?usp=sharing' }
    ],
    note: 'テーマ＝8月口コミ実績（世桜全体2万件突破・年内3万件目標）／盛り付け・レシピ・ロス管理／Google広告の始め方（1日500円から）／提出物のご案内',
    t: Date.now()
  };
  var sh = getSheet(); // Code.gs の reports シート
  sh.appendRow([Utilities.getUuid(), rec.t, 'study', '', rec.id, '', JSON.stringify(rec), '[]']);
  Logger.log('登録しました：' + rec.title + (rec.video ? '（録画あり）' : '（録画は未登録＝上がったら VIDEO_URL に貼って再実行）'));
  Logger.log(JSON.stringify(rec, null, 2));
}
