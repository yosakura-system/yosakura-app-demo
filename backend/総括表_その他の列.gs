/**
 * 世桜アプリ｜総括表の顧客情報に「その他」の国の列を足す（2026-11-02 神田さん「総括表にその他の列を足してください」）
 * Code.gs・総括表取り込み.gs と同じプロジェクトへ「もう1つのファイル」として貼る。
 *
 * ■ なぜ
 *   レジの客層に「その他」があるが、総括表Ver.3.0 の日別タブ「顧客情報」の国の列に「その他」が無く、
 *   毎朝の書き戻しが「レジの客層「その他」は総括表の国の列に無い」で止まっていた（11/1 朝の点検 7件）。
 *
 * ■ どこに足すか（総括表Ver.3.0・牛カツ富士山 202611 で確認）
 *   日別タブ（1〜31）：顧客情報の2段目の「国」の行（E＝ブラジル…Q＝アフリカ）の右の空き S〜T（結合済み）に「その他」。
 *     組数＝その下の行（S69）・人数＝さらに下（S70）。書き戻し（skwb_cty_）は見出しの文字で列を探すので、見出しを足せば自動で入る。
 *   顧客情報タブ：AK〜AL の組（見出し行1が空のまま、組数/人数の小見出しと合計の式だけある予備の列）に「その他」。
 *     21〜51行（1日〜31日）の式を =INDIRECT("'" & ROW(Gn) & "'!S69")／S70 にする（いまは S63/S64＝見出しの文字を指していて #VALUE! の原因）。
 *   ★ほかの列（中央アジア〜アフリカ AE〜AJ）の式も日別タブの見出しの行を指していてずれているが、それは触らない（増田さんに報告）。
 *
 * ■ 使い方（エディタで実行・デプロイ不要）
 *   総括表_その他の列を足す_下見()      … 今月と先月の全店。どのセルに何を書くかの一覧だけ
 *   総括表_その他の列を足す()           … 今月と先月の全店に書く
 *   総括表_その他の列を足す_月指定('202611')／_今月()／_先月()（1か月ずつ＝1回2分ほど）
 */

var SKOT_LABEL = 'その他';

function skot_実行_(書き込む, ymArg) {
  var 開始 = Date.now();
  var months = ymArg ? [String(ymArg)] : (function () { var now = new Date(); var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); return [Utilities.formatDate(prev, 'Asia/Tokyo', 'yyyyMM'), Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMM')]; })();
  var 結果 = { 書き込み: 書き込む ? '実行した' : '★下見のみ（書き込みなし）', 対象月: months, 日別タブ_書く: 0, 日別タブ_済み: 0, 顧客情報_書く: 0, 顧客情報_済み: 0, 止めた: [], 一覧: [] };
  sk_設定_().forEach(function (src) {
    var books = sk_対象ブック_全期間_(src.folder);
    months.forEach(function (ym) {
      var book = books.filter(function (b) { return b.ym === ym; }).pop();
      if (!book) { 結果.止めた.push(src.store + ' ' + ym + '：総括表が無い'); return; }
      var ss = SpreadsheetApp.openById(book.id);
      var line = { 店舗: src.store, 月: ym, 日別タブ: [], 顧客情報: '' };
      // --- 日別タブ 1〜31 ---
      for (var d = 1; d <= 31; d++) {
        var sh = ss.getSheetByName(String(d)); if (!sh) continue;
        var vals = sh.getRange(60, 1, 15, 20).getValues();   // 60〜74行・A〜T
        var r2 = -1;
        for (var i = 0; i < vals.length; i++) { if (String(vals[i][1]).trim() === '国' && String(vals[i][4]).trim() === 'ブラジル') { r2 = 60 + i; break; } }
        if (r2 < 0) { 結果.止めた.push(src.store + ' ' + book.name + ' タブ' + d + '：2段目の「国」の行（ブラジル…）が見つからない'); continue; }
        var cur = String(vals[r2 - 60][18] || '').trim();   // S列
        if (cur === SKOT_LABEL) { 結果.日別タブ_済み++; continue; }
        if (cur !== '') { 結果.止めた.push(src.store + ' ' + book.name + ' タブ' + d + '：S' + r2 + ' に「' + cur + '」が入っている'); continue; }
        結果.日別タブ_書く++; line.日別タブ.push(d + ':S' + r2);
        if (書き込む) sh.getRange(r2, 19).setValue(SKOT_LABEL);
      }
      // --- 顧客情報タブ ---
      var ks = ss.getSheetByName('顧客情報');
      if (!ks) { 結果.止めた.push(src.store + ' ' + book.name + '：顧客情報タブが無い'); 結果.一覧.push(line); return; }
      var hdr = ks.getRange(1, 1, 5, 40).getValues();
      // 「アフリカ」の列（見出し行1）を探し、その2つ右（AK）を「その他」の列にする
      var cAf = -1; for (var c = 0; c < hdr[0].length; c++) if (String(hdr[0][c]).trim() === 'アフリカ') { cAf = c; break; }
      if (cAf < 0) { 結果.止めた.push(src.store + ' ' + book.name + '：顧客情報の見出し「アフリカ」が見つからない'); 結果.一覧.push(line); return; }
      var cG = cAf + 2, cP = cAf + 3;   // 0始まり＝AK, AL
      var h1 = String(hdr[0][cG] || '').trim();
      if (h1 && h1 !== SKOT_LABEL) { 結果.止めた.push(src.store + ' ' + book.name + '：顧客情報 ' + skwb_a1_(0, cG) + '1 に「' + h1 + '」が入っている'); 結果.一覧.push(line); return; }
      var colG = skwb_a1_(0, cG).replace(/\d+$/, ''), colP = skwb_a1_(0, cP).replace(/\d+$/, '');
      var want = [];   // [row, col(1始まり), 値/式]
      if (h1 !== SKOT_LABEL) want.push([1, cG + 1, SKOT_LABEL]);
      if (String(hdr[1][cG]).trim() !== '組数') want.push([2, cG + 1, '組数']);
      if (String(hdr[1][cP]).trim() !== '人数') want.push([2, cP + 1, '人数']);
      if (String(hdr[3][cG]).trim() !== '組数') want.push([4, cG + 1, '組数']);
      if (String(hdr[3][cP]).trim() !== '人数') want.push([4, cP + 1, '人数']);
      var fm = ks.getRange(1, cG + 1, 52, 2).getFormulas();
      if (fm[2][0] !== '=' + colG + '5') want.push([3, cG + 1, '=' + colG + '5']);
      if (fm[2][1] !== '=' + colP + '5') want.push([3, cP + 1, '=' + colP + '5']);
      if (fm[4][0].toLowerCase() !== ('=sum(' + colG + '21:' + colG + '51)').toLowerCase()) want.push([5, cG + 1, '=SUM(' + colG + '21:' + colG + '51)']);
      if (fm[4][1].toLowerCase() !== ('=sum(' + colP + '21:' + colP + '51)').toLowerCase()) want.push([5, cP + 1, '=SUM(' + colP + '21:' + colP + '51)']);
      for (var row = 21; row <= 51; row++) {
        var n = row - 20;
        var fG = '=INDIRECT("\'" & ROW(G' + n + ') & "\'!S69")', fP = '=INDIRECT("\'" & ROW(G' + n + ') & "\'!S70")';
        if (fm[row - 1][0] !== fG) want.push([row, cG + 1, fG]);
        if (fm[row - 1][1] !== fP) want.push([row, cP + 1, fP]);
      }
      if (fm[51][0].toLowerCase() !== ('=sum(' + colG + '21:' + colG + '51)').toLowerCase()) want.push([52, cG + 1, '=SUM(' + colG + '21:' + colG + '51)']);
      if (fm[51][1].toLowerCase() !== ('=sum(' + colP + '21:' + colP + '51)').toLowerCase()) want.push([52, cP + 1, '=SUM(' + colP + '21:' + colP + '51)']);
      if (!want.length) { 結果.顧客情報_済み++; line.顧客情報 = '済み（' + colG + '/' + colP + '）'; }
      else {
        結果.顧客情報_書く += want.length; line.顧客情報 = colG + '/' + colP + ' に ' + want.length + 'セル（見出し・組数/人数・式）';
        if (書き込む) {
          /* 21〜52行の式は1回でまとめて書く（1セルずつだと6分の上限に当たる）。見出し・小見出し・3行目/5行目は個別 */
          var block = [];
          for (var rr = 21; rr <= 52; rr++) block.push([null, null]);
          var others = [];
          want.forEach(function (w) { if (w[0] >= 21 && w[0] <= 52) block[w[0] - 21][w[1] - (cG + 1)] = w[2]; else others.push(w); });
          others.forEach(function (w) { ks.getRange(w[0], w[1]).setValue(w[2]); });
          var cur = ks.getRange(21, cG + 1, 32, 2).getFormulas();
          var merged = block.map(function (r, i) { return [r[0] != null ? r[0] : cur[i][0], r[1] != null ? r[1] : cur[i][1]]; });
          ks.getRange(21, cG + 1, 32, 2).setFormulas(merged);
        }
      }
      結果.一覧.push(line);
    });
  });
  結果.所要秒 = Math.round((Date.now() - 開始) / 1000);
  Logger.log(JSON.stringify(結果, null, 2));
  return 結果;
}
function 総括表_その他の列を足す_下見() { return skot_実行_(false); }
function 総括表_その他の列を足す() { return skot_実行_(true); }
function 総括表_その他の列を足す_月指定(ym) { return skot_実行_(true, ym); }
function 総括表_その他の列を足す_今月() { return skot_実行_(true, Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMM')); }
function 総括表_その他の列を足す_先月() { var d = new Date(); d = new Date(d.getFullYear(), d.getMonth() - 1, 1); return skot_実行_(true, Utilities.formatDate(d, 'Asia/Tokyo', 'yyyyMM')); }
