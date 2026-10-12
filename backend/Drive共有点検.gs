/** ============================================================
 * Drive共有点検.gs — 本部ドライブの「全ファイル」の共有状態を棚卸しする（2026-10-12・読み取りだけ・何も変えない）
 *
 * ■ なぜ要るか：10/12 のバックチェックで見たのは「アプリ」と「アプリが参照するファイル157件」まで。
 *   本部ドライブの全ファイルの共有設定は見ていない（神田さん「そもそも全ての世桜のファイル内って確認したんかな」）。
 *   この関数を本番GAS（世桜FCのアカウント）で動かすと、そのアカウントから見える全ファイル・全フォルダを1つずつ見て、
 *   本部データの隠しタブ `_drive_check` に書き出す。
 *
 * ■ 何を拾うか
 *   ① リンクを知っている全員／ウェブ上で公開 になっているファイル・フォルダ（＝URLが漏れた瞬間に誰でも見られる）
 *   ② 共有相手（編集者・閲覧者）のメールアドレスと、その人が入っているファイル数（＝退任者・知らないアカウントを見つける）
 *   ③ 所有者が世桜以外のファイル（外部の人が持ち主＝世桜側で共有を止められない）
 *
 * ■ 使い方：エディタで Drive_共有点検 を実行。6分の上限があるので4分半で区切り、1分後の自分のトリガーで続きを回す。
 *   終わると `_drive_check` タブに「完了」と件数が出る。進み具合は Drive_共有点検_進み具合。
 *   結果はメールアドレスを含むので、タブは本部データの中（所有者＝世桜FC・社長だけが見られる）から出さない。
 * ============================================================ */
var DRV_TAB = '_drive_check';
var DRV_BUDGET_MS = 270 * 1000;

function Drive_共有点検() {
  var started = Date.now();
  var sh = drv_tab_();
  var st = drv_state_(sh);               // { phase: 'files'|'folders'|'done', token: '', seen: n }
  if (st.phase === 'done') { st = { phase: 'files', token: '', seen: 0 }; sh.clearContents(); drv_header_(sh); }
  var rows = [];
  while (st.phase !== 'done') {
    var it = st.phase === 'files'
      ? (st.token ? DriveApp.continueFileIterator(st.token) : DriveApp.getFiles())
      : (st.token ? DriveApp.continueFolderIterator(st.token) : DriveApp.getFolders());
    while (it.hasNext()) {
      var f = it.next(); st.seen++;
      try {
        var acc = String(f.getSharingAccess());
        var owner = ''; try { owner = f.getOwner() ? f.getOwner().getEmail() : ''; } catch (e) {}
        var eds = [], vws = [];
        try { eds = f.getEditors().map(function (u) { return u.getEmail(); }); } catch (e) {}
        try { vws = f.getViewers().map(function (u) { return u.getEmail(); }); } catch (e) {}
        var link = (acc === 'ANYONE' || acc === 'ANYONE_WITH_LINK');
        rows.push([st.phase === 'files' ? 'ファイル' : 'フォルダ', f.getName(), f.getId(), acc, link ? '★リンク共有' : '', owner, eds.join(', '), vws.join(', '),
                   Utilities.formatDate(f.getLastUpdated(), 'Asia/Tokyo', 'yyyy-MM-dd')]);
      } catch (e) { rows.push([st.phase, '（読めない）', '', 'ERR', String(e).slice(0, 80), '', '', '', '']); }
      if (Date.now() - started > DRV_BUDGET_MS) {
        st.token = it.getContinuationToken();
        drv_flush_(sh, rows); drv_state_save_(sh, st); drv_trigger_(true);
        Logger.log('途中（' + st.seen + ' 件見た）＝1分後に続きを回します'); return '途中';
      }
    }
    st.phase = st.phase === 'files' ? 'folders' : 'done'; st.token = '';
  }
  drv_flush_(sh, rows); drv_state_save_(sh, st); drv_trigger_(false);
  var summary = drv_summary_(sh);
  Logger.log('完了：' + st.seen + ' 件。' + summary);
  return summary;
}
function Drive_共有点検_進み具合() {
  var sh = drv_tab_(); var st = drv_state_(sh);
  var out = { 段階: st.phase, 見た件数: st.seen, 書いた行: Math.max(0, sh.getLastRow() - 2), 続きのトリガー: ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'Drive_共有点検'; }).length };
  Logger.log(JSON.stringify(out)); return out;
}

/* ---- 内部 ---- */
function drv_tab_() {
  var ss = getSS_(); var sh = ss.getSheetByName(DRV_TAB);
  if (!sh) { sh = ss.insertSheet(DRV_TAB); drv_header_(sh); try { sh.hideSheet(); } catch (e) {} }
  return sh;
}
function drv_header_(sh) {
  sh.getRange(1, 1, 1, 3).setValues([['state', '{"phase":"files","token":"","seen":0}', '']]);
  sh.getRange(2, 1, 1, 9).setValues([['種類', '名前', 'ID', '共有の種類', 'リンク共有', '所有者', '編集者', '閲覧者', '最終更新']]).setFontWeight('bold');
}
function drv_state_(sh) { try { return JSON.parse(String(sh.getRange(1, 2).getValue() || '') || '{}'); } catch (e) { return { phase: 'files', token: '', seen: 0 }; } }
function drv_state_save_(sh, st) { sh.getRange(1, 2).setValue(JSON.stringify(st)); }
function drv_flush_(sh, rows) { if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows); }
function drv_trigger_(on) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'Drive_共有点検') ScriptApp.deleteTrigger(t); });
  if (on) ScriptApp.newTrigger('Drive_共有点検').timeBased().after(60 * 1000).create();
}
/* 完了時のまとめ＝リンク共有の件数・共有相手ごとのファイル数・外部所有の件数（3行目以降の表から集計して C1 に書く） */
function drv_summary_(sh) {
  var last = sh.getLastRow(); if (last < 3) return '0件';
  var v = sh.getRange(3, 1, last - 2, 9).getValues();
  var link = 0, ext = 0, people = {}, owners = {};
  v.forEach(function (r) {
    if (r[4]) link++;
    var o = String(r[5] || ''); if (o) owners[o] = (owners[o] || 0) + 1;
    String(r[6] || '').split(',').concat(String(r[7] || '').split(',')).map(function (s) { return s.trim(); }).filter(Boolean)
      .forEach(function (m) { people[m] = (people[m] || 0) + 1; });
  });
  var top = Object.keys(people).sort(function (a, b) { return people[b] - people[a]; }).map(function (m) { return m + '=' + people[m]; });
  var ow = Object.keys(owners).map(function (m) { return m + '=' + owners[m]; });
  var s = '完了 ' + v.length + '件／★リンク共有 ' + link + '件／所有者別 ' + ow.join('・') + '／共有相手（人→件数） ' + top.join('・');
  sh.getRange(1, 3).setValue(s); return s;
}
