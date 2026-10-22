/** ============================================================
 * 勉強会_Drive自動登録.gs — Drive の勉強会フォルダに資料が上がったら、アプリの「勉強会」へ自動で入れる
 *   2026-10-22 神田さん「ドライブに毎回勉強会の資料がアップされたら自動でアプリに入るように」
 *
 * ■ 仕組み
 *   1時間に1回 勉強会_Driveから自動登録() が走り、下の FOLDERS（勉強会フォルダと 2026年共有）を 3階層まで見る。
 *   題名に日付が入っている資料（例：…_20261014／2026/08/19／2026-10-13／2026_06_10）を月ごとにまとめ、
 *   「2026年10月勉強会（10/14）」の1件として reports シートに kind=study で登録する（同じID＝上書き・二重には並ばない）。
 *   動画（mp4 など）は「録画を見る」、それ以外は「資料」として並ぶ。
 *   内容が前回と同じなら書かない（ScriptProperties に指紋を持つ）。
 *
 * ■ 対象外（自動では入れない）
 *   ・題名に日付が無いもの（ひな形・進行表・ブランドコアなど）
 *   ・題名に アンケート／ボツ／コピー／【案】／FM／テンプレ を含むもの
 *   ・2026年8月以前（8月までは手で登録済み。START_MONTH で変えられる）
 *
 * ■ 初回だけ
 *   勉強会_トリガー登録() を1回実行 → 毎時のトリガーが入る。すぐ反映したいときは 勉強会_Driveから自動登録() を手で実行。
 *   ※ 資料のリンクを店舗が開けるかは、その資料の共有設定しだい（この関数は共有設定を変えない）。
 * ============================================================ */

var STUDY_FOLDERS = [
  '1jX_ZF0n4x_Z9nu6t9XZyuXhzCHosbS99',   // 02.勉強会／勉強会
  '14CvKWD7jDxzxeM7q8ezyraQbRRJi-cXl'    // 02.勉強会／勉強会／2026年共有
];
var STUDY_START_MONTH = '2026-09';         // この月から自動（それより前は手で登録済み）
var STUDY_SKIP = /アンケート|ボツ|コピー|【案】|FM|テンプレ/;
var STUDY_PROP = 'study_auto_fp_';         // ScriptProperties のキー（id ごとの指紋）

function 勉強会_トリガー登録() {
  var fn = 'studyAutoRegister';
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
  Logger.log('毎時のトリガーを登録しました（' + fn + '）');
}

/** トリガー用の別名（日本語名のトリガーは静かに失敗することがある） */
function studyAutoRegister() { 勉強会_Driveから自動登録(); }

function 勉強会_Driveから自動登録() {
  var files = [];
  STUDY_FOLDERS.forEach(function (id) {
    try { studyWalk_(DriveApp.getFolderById(id), 0, '', files); }
    catch (e) { Logger.log('フォルダが開けません: ' + id + ' ' + e); }
  });
  var groups = {};   // 'YYYY-MM' → { date, items[] }
  files.forEach(function (f) {
    if (STUDY_SKIP.test(f.title)) return;
    var d = studyDateOf_(f.title) || studyDateOf_(f.folder);
    if (!d) return;
    var ym = d.slice(0, 7);
    if (ym < STUDY_START_MONTH) return;
    var g = groups[ym] || (groups[ym] = { date: d, items: {} });
    if (d > g.date) g.date = d;                                   // その月で一番あとの日付＝開催日
    var cur = g.items[f.title];
    if (!cur || f.modified > cur.modified) g.items[f.title] = f;  // 同じ題は新しい方だけ
  });
  var props = PropertiesService.getScriptProperties();
  var sh = getSheet();
  var n = 0;
  Object.keys(groups).sort().forEach(function (ym) {
    var g = groups[ym];
    var list = Object.keys(g.items).map(function (k) { return g.items[k]; });
    list.sort(function (a, b) { return studyRank_(a) - studyRank_(b) || (a.title < b.title ? -1 : 1); });
    var videos = list.filter(function (f) { return f.isVideo; });
    var docs = list.filter(function (f) { return !f.isVideo; }).map(function (f) { return { title: f.title, url: f.url }; });
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), day = +g.date.slice(8, 10);
    var rec = {
      id: 'st_' + String(y).slice(2) + ('0' + m).slice(-2),
      title: y + '年' + m + '月勉強会（' + m + '/' + day + '）',
      date: g.date,
      video: videos.length ? videos[0].url : '',
      docs: docs.concat(videos.slice(1).map(function (f) { return { title: f.title, url: f.url }; })),
      note: '',
      auto: true
    };
    var fp = JSON.stringify([rec.title, rec.date, rec.video, rec.docs]);
    if (props.getProperty(STUDY_PROP + rec.id) === fp) return;   // 前回と同じ＝書かない
    rec.t = Date.now();
    sh.appendRow([Utilities.getUuid(), rec.t, 'study', '', rec.id, '', JSON.stringify(rec), '[]']);
    props.setProperty(STUDY_PROP + rec.id, fp);
    n++;
    Logger.log('登録: ' + rec.title + ' 資料' + rec.docs.length + '件' + (rec.video ? ' 録画あり' : ''));
  });
  Logger.log('勉強会の自動登録: ' + n + '件を書きました（対象の月: ' + Object.keys(groups).sort().join(', ') + '）');
}

/** フォルダを3階層まで歩く（題名・URL・動画かどうか・親フォルダ名・更新時刻） */
function studyWalk_(folder, depth, parentName, out) {
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var mt = String(f.getMimeType() || '');
    out.push({ title: f.getName(), url: f.getUrl(), isVideo: /^video\//.test(mt), mime: mt, folder: parentName, modified: f.getLastUpdated().getTime() });
  }
  if (depth >= 2) return;
  var sub = folder.getFolders();
  while (sub.hasNext()) { var s = sub.next(); studyWalk_(s, depth + 1, s.getName(), out); }
}

/** 題名から日付（YYYY-MM-DD）を取る。20261014／2026-10-13／2026/08/19／2026_06_10／202610（月だけ・日は01） */
function studyDateOf_(s) {
  s = String(s || '');
  var m = s.match(/(20\d{2})[-_\/年]?(0[1-9]|1[0-2])[-_\/月]?(0[1-9]|[12]\d|3[01])(?!\d)/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/(20\d{2})[-_\/年]?(0[1-9]|1[0-2])(?!\d)/);
  if (m) return m[1] + '-' + m[2] + '-01';
  return '';
}

/** 並び＝アジェンダ → スライド → PDF/文書 → 動画 */
function studyRank_(f) {
  if (/アジェンダ/.test(f.title)) return 0;
  if (/presentation/.test(f.mime)) return 1;
  if (f.isVideo) return 9;
  return 2;
}
