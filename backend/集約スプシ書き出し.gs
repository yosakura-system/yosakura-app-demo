/** ============================================================
 * 集約スプシ書き出し.gs
 * アプリの全提出データを、人が読める1枚のスプレッドシート「世桜アプリ_集約データ」へ
 * 毎日自動で書き出す（2026-09-09 神田さんのご指示。増田さんの「アプリ入力→スプシ」要望＝MTG協議の案）。
 * 各チームはこのスプシから、フィルタ・ピボット・IMPORTRANGEで自由に情報を抜き取れる。
 *
 * ■ 使い方（1回だけ）
 *   ① このファイルを「世桜アプリバックエンド」プロジェクトに追加（ファイル＋ → スクリプト → 全文貼り付け）
 *   ② 関数 aggSetup を選んで実行（初回は権限承認）
 *      → 集約スプシが作成され、毎日朝6時の自動更新トリガーが入る。URLは実行ログに出る
 *   ③ ログのURLを開き、見たいメンバー・チームへ共有する（アプリ本体の権限とは無関係に共有できる）
 *
 * ■ 運用の決めごと
 *   ・集約スプシは毎回「全面上書き」。直接編集しない（加工はコピーを取るか、別シートからIMPORTRANGE）
 *   ・総括表Ver2.6など既存のスプシには一切書き込まない（読むのも reports シートだけ）
 *   ・元データ（reports）の保存方針に従う＝90日で消える種類は集約からも消える
 *     （総括表・月次・Google口コミ・お知らせ系は恒久保存＝残り続ける）
 *   ・すぐ最新にしたいときは aggRebuild を手動実行（数十秒）
 * ============================================================ */

var AGG_PROP = 'AGG_SPREADSHEET_ID';
var AGG_TITLE = '世桜アプリ_集約データ';

/* 初回セットアップ：スプシ作成＋初回書き出し＋毎日6時トリガー */
function aggSetup() {
  var ss = aggSs_();
  aggRebuild();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'aggRebuild'; });
  if (!has) ScriptApp.newTrigger('aggRebuild').timeBased().everyDays(1).atHour(6).create();
  Logger.log('集約スプシ: ' + ss.getUrl());
}

function aggSs_() {
  var sp = PropertiesService.getScriptProperties();
  var id = sp.getProperty(AGG_PROP);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* 消されていたら作り直す */ } }
  var ss = SpreadsheetApp.create(AGG_TITLE);
  sp.setProperty(AGG_PROP, ss.getId());
  return ss;
}

/* ---------- 表示用の対応表 ---------- */
var AGG_KIND = {
  soukatsu: '総括表（アプリ入力）', soukatsu_imp: '総括表（スプシ取込）', survey: 'サーベイ回答', kizuki: '気づき',
  chukan: '中間報告', subrec: '写真等の提出', ckdone: 'チェックリスト操作', gsnap: 'Google口コミ取得',
  video: '店内動画', kinshu: '金種別入力', handover: '店内伝言板', a: '食べ残し', b: '食べ残し',
  svfb: '巡回フィードバック', route: '来店経路', open: '開局記録（旧）', community: 'みんなの投稿',
  news: 'お知らせ', newslike: 'お知らせ・いいね', newsread: 'お知らせ・確認', newscmt: 'お知らせ・コメント',
  study: '勉強会アーカイブ', monthly: '月次締め', whistle: '通報・相談', hqack: '本部の確認・コメント'
};
var AGG_CTY = {
  jp: '日本', kr: '韓国', cn: '中国', hk: '香港', tw: '台湾', sea: '東南アジア', eu: 'ヨーロッパ',
  au: 'オーストラリア', us: 'アメリカ', ca: 'カナダ', mx: 'メキシコ', br: 'ブラジル', latam: '中南米',
  sasia: '南アジア', casia: '中央アジア', me: '中東', af: 'アフリカ', 'new': '新規', rep: 'リピート'
};
/* 総括表の列（アプリの入力項目と同じ並び・ここに無いキーが増えたら自動で右端に足される） */
var AGG_SK_COLS = [
  ['sales', '当日売上'], ['guests', '客数'], ['cash', '現金'], ['card', 'カード'], ['lunch', '昼のみ売上'],
  ['net', '純売上'], ['err', 'レジ誤差'], ['errnote', '過不足（現金）の理由'], ['mtd', '月累計売上'], ['goal', '売上目標（月）'],
  ['foodamt', 'フード金額'], ['drinkamt', 'ドリンク金額'], ['foodct', 'フード数'], ['drinkct', 'ドリンク数'], ['food', '原価率%（旧）'],
  ['labor', '人件費率%'], ['laborcost', '人件費額'], ['hours', '総労働時間'], ['buy', '仕入額'],
  ['rvt', '口コミ 当日'], ['rva', '口コミ 累計'], ['hear', 'ヒアリング 当日'], ['disc', '値引き'],
  ['tipt', 'チップ 当日'], ['tipa', 'チップ 累計'], ['cancelt', 'キャンセル 当日'], ['cancel', 'キャンセル 累計'],
  ['lstaff', '昼の人数'], ['lhours', '昼の時間'], ['nstaff', '夜の人数'], ['nhours', '夜の時間'], ['sand', '牛カツサンド個数'],
  ['staffct', 'スタッフ数'], ['closer', 'クローズ担当'], ['loss', 'ロス'], ['lossnote', 'ロスの内容'],
  ['bad', '課題'], ['action', '改善アクション'], ['hikin', '引き継ぎ（昼→夜）'], ['hikim', '引き継ぎ（夜→朝）'],
  ['order', '翌日の食材発注'], ['supply', '消耗品'], ['unagi', 'うなぎ'], ['memo', '清掃・特記事項'], ['by', '提出者']
];

/* ---------- 小道具 ---------- */
function aggFmtT_(t) { return Utilities.formatDate(new Date(Number(t) || 0), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'); }
function aggDate_(v) { // 日付セル化（Dateオブジェクト）でも文字列でも yyyy-MM-dd に揃える
  if (v && v.getTime) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  var m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : String(v || '');
}
function aggWrite_(ss, name, header, data) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var oldF = sh.getFilter(); if (oldF) oldF.remove(); // 書き換え前に既存フィルターを外す（残すと範囲がずれる）
  sh.clearContents();
  var w = header.length;
  var all = [header].concat(data.map(function (row) {
    var r = row.slice(0, w); while (r.length < w) r.push('');
    return r;
  }));
  sh.getRange(1, 1, all.length, w).setValues(all);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, w).setFontWeight('bold');
  // ★全タブに検索用フィルター（2026-09-09 神田さんのご要望＝どの列でも絞り込み・並べ替えできるように）
  if (all.length > 1) sh.getRange(1, 1, all.length, w).createFilter();
}

/* ---------- 本体：reports を読み、タブごとに書き出す ---------- */
function aggRebuild() {
  var src = getSheet(); // Code.gs の reports シート
  var last = src.getLastRow();
  var vals = last >= 2 ? src.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
  var recs = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[2]) continue;
    var note = String(r[6] || ''); var p = {};
    if (note.charAt(0) === '{') { try { p = JSON.parse(note); } catch (e) { p = {}; } }
    recs.push({ t: Number(r[1]) || 0, kind: String(r[2]), store: String(r[3] || ''), item: r[4], level: r[5], p: p, note: note });
  }
  recs.sort(function (a, b) { return a.t - b.t; });
  var ss = aggSs_();

  /* --- ① 総括表_日別：店舗×日付で1行（アプリ入力を取込より優先・同種なら新しい方） --- */
  var byDay = {};
  recs.forEach(function (x) {
    if (x.kind !== 'soukatsu' || !x.p.date) return;
    var key = x.store + '|' + aggDate_(x.p.date);
    var cur = byDay[key];
    var isApp = !x.p.src;
    if (!cur || (isApp && cur.p.src) || (isApp === !cur.p.src && x.t >= cur.t)) byDay[key] = x;
  });
  var known = {}; AGG_SK_COLS.forEach(function (c) { known[c[0]] = 1; });
  var extras = {};
  Object.keys(byDay).forEach(function (k) {
    Object.keys(byDay[k].p).forEach(function (key) {
      if (!known[key] && key !== 'date' && key !== 'src' && key !== 'cty') extras[key] = 1;
    });
  });
  var exKeys = Object.keys(extras).sort();
  var skHead = ['日付', '店舗', '経路', '客単価（自動）'].concat(AGG_SK_COLS.map(function (c) { return c[1]; })).concat(exKeys);
  var skRows = Object.keys(byDay).sort().map(function (k) {
    var x = byDay[k], p = x.p;
    var unit = (Number(p.sales) > 0 && Number(p.guests) > 0) ? Math.round(Number(p.sales) / Number(p.guests)) : '';
    var row = [aggDate_(p.date), x.store, p.src ? 'スプシ取込' : 'アプリ入力', unit];
    AGG_SK_COLS.forEach(function (c) { row.push(p[c[0]] != null ? p[c[0]] : ''); });
    exKeys.forEach(function (key) { var v = p[key]; row.push(v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : v)); });
    return row;
  });
  aggWrite_(ss, '総括表_日別', skHead, skRows);

  /* --- ② 総括表_国別内訳（cty のある日だけ・1国1行） --- */
  var ctyRows = [];
  Object.keys(byDay).sort().forEach(function (k) {
    var x = byDay[k], c = x.p.cty;
    if (!c || typeof c !== 'object') return;
    Object.keys(c).forEach(function (key) {
      var v = c[key] || {};
      if (!Number(v.g) && !Number(v.p)) return;
      ctyRows.push([aggDate_(x.p.date), x.store, AGG_CTY[key] || key, Number(v.g) || 0, Number(v.p) || 0]);
    });
  });
  aggWrite_(ss, '総括表_国別内訳', ['日付', '店舗', '区分', '組数', '人数'], ctyRows);

  /* --- ③ サーベイ（お客様アンケート） --- */
  var svRows = recs.filter(function (x) { return x.kind === 'survey' && !/^TEST_/.test(String(x.p.c || '')); })
    .map(function (x) {
      var isJ = x.p && ('c' in x.p || 'f' in x.p);
      return [aggFmtT_(x.t), x.store, Number(x.level) || '', String(x.item || ''), isJ ? (x.p.c || '') : '', isJ ? (x.p.f || '') : x.note];
    });
  aggWrite_(ss, 'サーベイ', ['日時', '店舗', '満足度', '来店経路', '来店国', 'コメント'], svRows);

  /* --- ④ 気づき --- */
  var kzRows = recs.filter(function (x) { return x.kind === 'kizuki'; })
    .map(function (x) { return [aggFmtT_(x.t), x.store, String(x.item || ''), x.note]; });
  aggWrite_(ss, '気づき', ['日時', '店舗', '分類', '内容'], kzRows);

  /* --- ⑤ 中間報告 --- */
  var chRows = recs.filter(function (x) { return x.kind === 'chukan'; }).map(function (x) {
    var p = x.p;
    return [aggFmtT_(x.t), x.store, p.rtype === 'morning' ? '朝' : '中間', p.kumi || '', p.kyaku || '',
      p.cash || '', p.card || '', p.emoney || '', p.unpaid || '', p.total || '', p.tip || '', p.greview || '',
      String(p.staff || '').replace(/\n/g, '、'), p.memo || '', p.by || ''];
  });
  aggWrite_(ss, '中間報告', ['日時', '店舗', '種別', '組数', '客数', '現金', 'カード', '電子マネー', '未会計', '総売上', 'チップ', '口コミ', '人員', '営業内容', '提出者'], chRows);

  /* --- ⑥ Google口コミ（日次スナップショット）。同じ店×日付が複数ある日（手動＋自動で2回取得した日）は最新だけ --- */
  var gsMap = {};
  recs.forEach(function (x) {
    if (x.kind !== 'gsnap') return;
    var k = x.store + '|' + aggDate_(x.item);
    if (!gsMap[k] || x.t >= gsMap[k].t) gsMap[k] = x;
  });
  var gsRows = Object.keys(gsMap).sort().map(function (k) {
    var x = gsMap[k];
    return [aggDate_(x.item), x.store, x.p.total != null ? x.p.total : '', x.p.gained != null ? x.p.gained : '', x.p.rating != null ? x.p.rating : ''];
  });
  aggWrite_(ss, 'Google口コミ', ['日付', '店舗', '総件数', '前日比', '星'], gsRows);

  /* --- ⑦ 提出ログ（店舗が何をいつ出したか） --- */
  var LOG_KINDS = { subrec: 1, chukan: 1, kizuki: 1, video: 1, kinshu: 1, handover: 1, svfb: 1, a: 1, b: 1 };
  var logRows = [];
  recs.forEach(function (x) {
    if (x.kind === 'soukatsu' && !x.p.src) {
      logRows.push([aggFmtT_(x.t), x.store, AGG_KIND.soukatsu, aggDate_(x.p.date), x.p.by || '']);
    } else if (LOG_KINDS[x.kind]) {
      var it = String(x.item || '');
      if (x.kind === 'subrec') it = it.replace('|', ' ');
      logRows.push([aggFmtT_(x.t), x.store, AGG_KIND[x.kind] || x.kind, it, x.p.by || '']);
    }
  });
  aggWrite_(ss, '提出ログ', ['日時', '店舗', '種類', '項目・対象日', '提出者'], logRows);

  /* --- ⑧ 店舗別サマリ（どの店が・何を・どれだけ使っているか）＝縦持ち（ピボットしやすい形） --- */
  var sum = {};
  recs.forEach(function (x) {
    var kk = x.kind === 'soukatsu' ? (x.p.src ? 'soukatsu_imp' : 'soukatsu') : x.kind;
    if (!AGG_KIND[kk] || !x.store) return;
    var key = x.store + '|' + kk;
    if (!sum[key]) sum[key] = { store: x.store, kind: kk, n: 0, lastT: 0 };
    sum[key].n++; if (x.t > sum[key].lastT) sum[key].lastT = x.t;
  });
  var sumRows = Object.keys(sum).sort().map(function (k) {
    var s = sum[k];
    return [s.store, AGG_KIND[s.kind], s.n, aggFmtT_(s.lastT)];
  });
  aggWrite_(ss, '店舗別サマリ', ['店舗', '種類', '件数', '最終利用日時'], sumRows);

  /* --- ⑨ 説明タブ --- */
  aggWrite_(ss, '_この表について', ['項目', '説明'], [
    ['更新', '毎日 朝6時に自動で全面書き換え（手動更新＝GASの aggRebuild 実行）。最終更新: ' + aggFmtT_(Date.now())],
    ['注意', 'このスプシは毎日上書きされます。直接編集せず、加工はコピーを取るか IMPORTRANGE で別シートへ'],
    ['総括表_日別', '店舗×日付で1行。「経路」＝アプリ入力／スプシ取込（取込は売上・客数のみ）。同じ日はアプリ入力を優先'],
    ['総括表_国別内訳', '総括表の「お客様の内訳」。入力のある日だけ・1国1行（新規/リピートは同じお客様の別の数え方）'],
    ['サーベイ', '店頭QRのお客様アンケート（満足度・来店経路・来店国・コメント）'],
    ['提出ログ', '写真等の提出・中間報告・気づきなど、店舗の提出をそのまま時系列で'],
    ['店舗別サマリ', '店舗×種類ごとの件数と最終利用日時。ピボットで「どの店が何を使っているか」を一覧化できます'],
    ['保存期間', '元データの方針に従います（総括表・月次・Google口コミ等は恒久。写真等の提出記録は90日）'],
    ['元データ', '世桜アプリのバックエンドから自動生成。この表を直しても元データは変わりません']
  ]);

  /* 初期タブ「シート1」が残っていれば消す */
  var s1 = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 1) ss.deleteSheet(s1);
}
