/**
 * 世桜アプリ｜バックエンド移行スクリプト
 * 旧（yosakura.system の個人アカウント）→ 新（yosakura.fc の Workspace アカウント）
 *
 * ★このファイルは「新しいアカウント側」の Apps Script プロジェクトへ貼って実行します。
 *   Code.gs と同じプロジェクトに、もう1つのファイルとして追加してください。
 *
 * ★旧側には一切書き込みません（読むだけ）。失敗しても旧環境はそのまま残ります。
 *
 * ■ なぜ必要か
 *   reports シートの photos 列には Drive の「ファイルID」が入っています。
 *   写真をコピーするとIDが変わるため、そのままでは過去の提出写真が開けなくなります。
 *   このスクリプトが「旧ID→新ID」の対応表を作り、photos 列を機械的に付け替えます。
 *
 * ■ 事前準備（旧アカウントで1回だけ）
 *   1. 旧スプレッドシート「世桜アプリ_本部データ」を、新アカウントへ「閲覧者」で共有
 *   2. 旧フォルダ「世桜アプリ_写真」を、新アカウントへ「閲覧者」で共有
 *   3. それぞれのIDを下の MIG_OLD_SHEET_ID / MIG_OLD_FOLDER_ID に貼る
 *      （IDはURLの /d/ と /edit の間、フォルダは /folders/ の後ろ）
 *
 * ■ 実行の順番（関数の選択で選んで実行し、毎回ログを確認する）
 *   移行_0_下見        … 何件あるかを数えるだけ。書き込みなし
 *   移行_1_行をコピー   … reports の行を新シートへ写す（写真IDはまだ旧のまま）
 *   移行_2_写真を移す   … 写真を新フォルダへ作り直し、対応表に記録（時間切れなら再実行）
 *   移行_3_写真IDを付替 … photos 列を新IDへ書き換える
 *   移行_4_点検        … 全部の写真が新フォルダで開けるかを確認
 *
 * ⚠️ 移行の前に Script Properties の ENABLE_AUTO_PURGE を false にしてください
 *    （Code.gs の既定は true。移行中に自動削除が走ると事故ります）
 */

/* ===== 設定（ここだけ書き換える） ===== */
var MIG_OLD_SHEET_ID  = '';   // 旧スプレッドシート「世桜アプリ_本部データ」のID
var MIG_OLD_FOLDER_ID = '';   // 旧フォルダ「世桜アプリ_写真」のID

var MIG_MAP_SHEET = '_移行対応表';   // 旧ID→新IDの記録先（新スプレッドシート内に作られる）
var MIG_TIME_LIMIT_MS = 4.5 * 60 * 1000;  // 1回の実行で使う上限（GASの6分制限より手前で止める）

/* ============================================================
   0. 下見（書き込みなし）
   ============================================================ */
function 移行_0_下見() {
  var chk = mig_設定を確認_();
  var oldSh = mig_旧シート_();
  var newSh = mig_新シート_();

  var oldRows = mig_行を読む_(oldSh);
  var newRows = mig_行を読む_(newSh);

  var oldIds = {}, kinds = {};
  oldRows.forEach(function (r) {
    oldIds[r.id] = true;
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  });
  var newIds = {};
  newRows.forEach(function (r) { newIds[r.id] = true; });

  var 重複 = 0;
  Object.keys(oldIds).forEach(function (id) { if (newIds[id]) 重複++; });

  var photoIds = mig_写真IDを集める_(oldRows);
  var map = mig_対応表を読む_();

  var 旧フォルダ枚数 = -1;
  try {
    var it = DriveApp.getFolderById(MIG_OLD_FOLDER_ID).getFiles();
    旧フォルダ枚数 = 0;
    while (it.hasNext()) { it.next(); 旧フォルダ枚数++; }
  } catch (e) { 旧フォルダ枚数 = 'エラー：' + e; }

  var out = {
    接続: chk,
    旧シートの行数: oldRows.length,
    新シートの行数: newRows.length,
    idが重複している件数: 重複,
    kindの内訳: kinds,
    写真の枚数_シート上: photoIds.length,
    写真の枚数_旧フォルダ: 旧フォルダ枚数,
    対応表に記録済み: Object.keys(map).length,
    これから移す枚数: photoIds.filter(function (id) { return !map[id]; }).length
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   1. 行をコピー（旧 reports → 新 reports）
   idが既にある行は飛ばすので、何度実行しても増えません
   ============================================================ */
function 移行_1_行をコピー() {
  mig_設定を確認_();
  var oldSh = mig_旧シート_();
  var newSh = mig_新シート_();

  var newHeaders = mig_ヘッダー_(newSh);
  var oldRows = mig_行を読む_(oldSh);
  var newRows = mig_行を読む_(newSh);

  var 既存 = {};
  newRows.forEach(function (r) { if (r.id) 既存[String(r.id)] = true; });

  var 追加 = [];
  var 飛ばした = 0;
  oldRows.forEach(function (r) {
    if (r.id && 既存[String(r.id)]) { 飛ばした++; return; }
    追加.push(newHeaders.map(function (h) { return r._raw[h] === undefined ? '' : r._raw[h]; }));
  });

  if (追加.length) {
    newSh.getRange(newSh.getLastRow() + 1, 1, 追加.length, newHeaders.length).setValues(追加);
  }
  var out = { コピーした行: 追加.length, 既にあって飛ばした行: 飛ばした, 新シートの行数: newSh.getLastRow() - 1 };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   2. 写真を新フォルダへ作り直す（時間切れになったら再実行）
   ============================================================ */
function 移行_2_写真を移す() {
  mig_設定を確認_();
  var 開始 = new Date().getTime();

  var newSh = mig_新シート_();
  var rows = mig_行を読む_(newSh);
  var photoIds = mig_写真IDを集める_(rows);
  var map = mig_対応表を読む_();
  var folder = mig_新フォルダ_();
  var mapSh = mig_対応表シート_();

  // ★移行済みの新IDを飛ばす（移行_3 のあとに、もう一度ここを実行しても写真が二重にならないように）
  var 移行済み = {};
  Object.keys(map).forEach(function (旧) { 移行済み[map[旧]] = true; });

  var 残り = photoIds.filter(function (id) { return !map[id] && !移行済み[id]; });
  var 成功 = 0, 失敗 = [], 共有失敗 = 0, 追記 = [], 既に新フォルダ = 0;
  var 新フォルダID = folder.getId();

  for (var i = 0; i < 残り.length; i++) {
    if (new Date().getTime() - 開始 > MIG_TIME_LIMIT_MS) break;
    var 旧ID = 残り[i];
    try {
      var src = DriveApp.getFileById(旧ID);
      // 念のためもう一段：既に新フォルダの中にあるものはコピーしない
      var 親 = src.getParents(), 新の中 = false;
      while (親.hasNext()) { if (親.next().getId() === 新フォルダID) { 新の中 = true; break; } }
      if (新の中) { 既に新フォルダ++; continue; }
      var copy = src.makeCopy(src.getName(), folder);
      try {
        copy.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e2) {
        // 組織の共有設定で「リンクを知っている全員」が禁止されている場合はここに来る
        共有失敗++;
      }
      追記.push([旧ID, copy.getId(), src.getName(), new Date()]);
      成功++;
    } catch (e) {
      失敗.push({ 旧ID: 旧ID, 理由: String(e) });
    }
  }

  if (追記.length) {
    mapSh.getRange(mapSh.getLastRow() + 1, 1, 追記.length, 4).setValues(追記);
  }

  var out = {
    今回移した枚数: 成功,
    既に新フォルダにあり飛ばした枚数: 既に新フォルダ,
    共有設定を付けられなかった枚数: 共有失敗,
    失敗: 失敗,
    まだ残っている枚数: 残り.length - 成功 - 既に新フォルダ,
    次にすること: (残り.length - 成功 - 既に新フォルダ) > 0 ? 'もう一度 移行_2_写真を移す を実行' : '移行_3_写真IDを付替 へ'
  };
  if (共有失敗 > 0) {
    out.警告 = '★共有設定が付いていない写真があります。このままだとアプリに写真が表示されません。'
             + '管理コンソール → アプリ → Google Workspace → ドライブとドキュメント → 共有設定 で'
             + '「組織外との共有」を許可してから、移行_5_共有を付け直す を実行してください。';
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   3. photos 列を新IDへ付け替える（何度実行しても同じ結果）
   ============================================================ */
function 移行_3_写真IDを付替() {
  mig_設定を確認_();
  var newSh = mig_新シート_();
  var headers = mig_ヘッダー_(newSh);
  var pCol = headers.indexOf('photos') + 1;
  if (pCol === 0) throw new Error('photos 列が見つかりません');

  var 行数 = newSh.getLastRow() - 1;
  if (行数 <= 0) return { 書き換えた行: 0 };

  var map = mig_対応表を読む_();
  var rng = newSh.getRange(2, pCol, 行数, 1);
  var vals = rng.getValues();
  var 書換 = 0, 付替 = 0, 未対応 = {};

  for (var i = 0; i < vals.length; i++) {
    var cur = String(vals[i][0] || '');
    if (!cur) continue;
    var ids = mig_写真を配列に_(cur);
    if (!ids.length) continue;
    var 変わった = false;
    var 新 = ids.map(function (id) {
      if (map[id]) { 変わった = true; 付替++; return map[id]; }
      if (!mig_対応表の値か_(map, id)) 未対応[id] = true;  // 既に新IDになっているものは無視
      return id;
    });
    if (変わった) { vals[i][0] = JSON.stringify(新); 書換++; }
  }
  if (書換) rng.setValues(vals);

  var out = {
    書き換えた行: 書換,
    付け替えた写真: 付替,
    対応表に無かった写真: Object.keys(未対応)
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   4. 点検（書き込みなし）
   ============================================================ */
function 移行_4_点検() {
  var newSh = mig_新シート_();
  var rows = mig_行を読む_(newSh);
  var ids = mig_写真IDを集める_(rows);
  var folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');

  var 開ける = 0, 開けない = [], 別フォルダ = [], 共有なし = [];
  ids.forEach(function (id) {
    try {
      var f = DriveApp.getFileById(id);
      開ける++;
      var 親 = f.getParents();
      var ok = false;
      while (親.hasNext()) { if (親.next().getId() === folderId) { ok = true; break; } }
      if (!ok) 別フォルダ.push(id);
      if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) 共有なし.push(id);
    } catch (e) {
      開けない.push(id);
    }
  });

  var out = {
    写真の総数: ids.length,
    開ける: 開ける,
    開けない: 開けない,
    新フォルダの外にある: 別フォルダ.length,
    共有設定が付いていない: 共有なし.length,
    判定: (開けない.length === 0 && 別フォルダ.length === 0 && 共有なし.length === 0) ? '★OK' : '★要対応'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   5. 共有設定を付け直す（組織の共有設定を直したあとに実行）
   ============================================================ */
function 移行_5_共有を付け直す() {
  var newSh = mig_新シート_();
  var ids = mig_写真IDを集める_(mig_行を読む_(newSh));
  var 開始 = new Date().getTime();
  var 付けた = 0, 失敗 = [];
  for (var i = 0; i < ids.length; i++) {
    if (new Date().getTime() - 開始 > MIG_TIME_LIMIT_MS) break;
    try {
      var f = DriveApp.getFileById(ids[i]);
      if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) {
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        付けた++;
      }
    } catch (e) { 失敗.push({ id: ids[i], 理由: String(e) }); }
  }
  var out = { 付けた枚数: 付けた, 失敗: 失敗 };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ============================================================
   補助（先頭が mig_ のものは直接実行しません）
   ============================================================ */
function mig_設定を確認_() {
  if (!MIG_OLD_SHEET_ID)  throw new Error('MIG_OLD_SHEET_ID が空です。旧スプレッドシートのIDを入れてください。');
  if (!MIG_OLD_FOLDER_ID) throw new Error('MIG_OLD_FOLDER_ID が空です。旧フォルダのIDを入れてください。');
  var 新ID = mig_新スプレッドシート_().getId();
  if (MIG_OLD_SHEET_ID === 新ID) {
    throw new Error('★旧と新が同じスプレッドシートです。新しいアカウント側のプロジェクトで実行してください。');
  }
  var 新フォルダID = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  if (MIG_OLD_FOLDER_ID === 新フォルダID) {
    throw new Error('★旧と新が同じ写真フォルダです。setupYosakuraBackend を先に実行してください。');
  }
  if (!新フォルダID) {
    throw new Error('★PHOTO_FOLDER_ID がありません。先に setupYosakuraBackend を実行してください。');
  }
  return { 新スプレッドシート: 新ID, 新写真フォルダ: 新フォルダID, 旧スプレッドシート: MIG_OLD_SHEET_ID, 旧写真フォルダ: MIG_OLD_FOLDER_ID };
}

function mig_新スプレッドシート_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('新しいスプレッドシートが見つかりません（このスクリプトはシートに紐づけて作成してください）');
  return ss;
}

function mig_新シート_() {
  var sh = mig_新スプレッドシート_().getSheetByName('reports');
  if (!sh) throw new Error('新しい reports シートがありません。先に setupYosakuraBackend を実行してください。');
  return sh;
}

function mig_旧シート_() {
  var sh = SpreadsheetApp.openById(MIG_OLD_SHEET_ID).getSheetByName('reports');
  if (!sh) throw new Error('旧 reports シートを開けません。共有されているか、IDが正しいかご確認ください。');
  return sh;
}

function mig_新フォルダ_() {
  return DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID'));
}

function mig_ヘッダー_(sh) {
  return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
}

// 行を { id, kind, photos, _raw:{列名:値} } の形で返す（列の並びが違っても壊れないように列名で読む）
function mig_行を読む_(sh) {
  var 行数 = sh.getLastRow() - 1;
  if (行数 <= 0) return [];
  var headers = mig_ヘッダー_(sh);
  var vals = sh.getRange(2, 1, 行数, headers.length).getValues();
  return vals.map(function (row) {
    var raw = {};
    headers.forEach(function (h, i) { raw[h] = row[i]; });
    return { id: raw.id, kind: raw.kind, photos: raw.photos, _raw: raw };
  });
}

function mig_写真を配列に_(v) {
  var s = String(v || '').trim();
  if (!s) return [];
  try {
    var a = JSON.parse(s);
    if (Object.prototype.toString.call(a) === '[object Array]') return a.map(String).filter(String);
  } catch (e) { /* JSONでなければ下へ */ }
  return s.indexOf(',') >= 0 ? s.split(',').map(function (x) { return x.trim(); }).filter(String) : [s];
}

function mig_写真IDを集める_(rows) {
  var set = {};
  rows.forEach(function (r) {
    mig_写真を配列に_(r.photos).forEach(function (id) {
      if (id && id.indexOf('data:') !== 0) set[id] = true;
    });
  });
  return Object.keys(set);
}

function mig_対応表シート_() {
  var ss = mig_新スプレッドシート_();
  var sh = ss.getSheetByName(MIG_MAP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MIG_MAP_SHEET);
    sh.appendRow(['旧ID', '新ID', 'ファイル名', '移した日時']);
  }
  return sh;
}

function mig_対応表を読む_() {
  var sh = mig_対応表シート_();
  var 行数 = sh.getLastRow() - 1;
  var map = {};
  if (行数 <= 0) return map;
  sh.getRange(2, 1, 行数, 2).getValues().forEach(function (r) {
    if (r[0] && r[1]) map[String(r[0])] = String(r[1]);
  });
  return map;
}

// そのIDが「対応表の新ID側」に既にあるか（＝付け替え済み）を判定する
function mig_対応表の値か_(map, id) {
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) if (map[keys[i]] === id) return true;
  return false;
}
