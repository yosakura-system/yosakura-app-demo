/** ============================================================
 * 見守り.gs — アプリの不具合を「言われる前に」見つけて、神田さんへメールで知らせる
 *
 * ■ なぜ要るか（2026-10-09 神田さん「指摘される前にエラーを自動で検知して修繕できないの？」
 *   「エラーばっか出て、もう言うのもめんどくさい人は言わない。結局使ってもらえないアプリになる」）
 *   それまでは、エラーの控え（apperr）が本部データに残るだけで、誰かが見に行かないと気づけなかった。
 *   増田さんの「ログイン画面と行き来」も、8:51の再ログインの記録はあったのに誰も見ていなかった。
 *
 * ■ 何を見るか（1時間ごと・前回見た時刻より後の行だけ）
 *   ① エラーの控え（kind:'apperr'）が増えた → 番号・店舗・画面・内容を列挙
 *      （E＝画面のエラー／AUTHDROP＝ログインが外れた／AUTHKEEP＝外れかけたが続行／LSFULL＝端末の保存領域いっぱい）
 *   ② 同じIDのログインし直しが24時間に3回以上（_users の tokens の増え方で数える）
 *   ③ 5時台と10時台：USENレジの店で、昨日の営業日のレジ締め（src:'usen' で sales がある行）が無い店 → 取込漏れ
 *      ★2026-10-18 フード・ドリンクだけの行（伝票明細・sales なし）でも「ある」と数えていたため、レジ締めの送信が落ちても鳴らなかった
 *        （10/17・10/18 原さんに言われて気づいた）。sales がある行だけ数え、4時の自動のすぐ後（5時台）にも見る
 *   ④ 10時台だけ：おととい提出のあった店で、きのう1件も提出（ckdone／subrec／zaiko／soukatsu）が無い店 → 止まっている可能性
 *      ★2026-10-12 営業日は「朝4時〜翌朝4時」で数える。23時台に「きょう」で判定していたため、
 *        閉店が0時を回る店（手巻き寿司難波店＝10/9分を10/10 1:01に提出）が毎晩引っかかった＝空振り。朝の回（③と同じ）へ移した
 *
 * ■ 知らせ方＝見つかったときだけメール（何も無ければ送らない）。送り先＝Script Properties の MIMAMORI_MAIL_TO
 *   （未設定なら、このGASを動かしている人のアドレス）。無料・外部サービスなし。
 *
 * ■ 使い方
 *   1. このファイルを本番のGASプロジェクトへ貼る（Code.gs と同じプロジェクト）
 *   2. 見守り_トリガー登録() を1回実行（毎時 mimamoriHourly が走る。日本語名の関数はトリガーに登録しない＝ローマ字の別名で登録）
 *   3. 試すなら 見守り_いますぐ() を実行 → 直近24時間ぶんで判定し、見つかればメールが届く
 * ============================================================ */

var MIMAMORI_LAST_KEY = 'MIMAMORI_LAST_TS';        // 前回見た時刻（エポックms）
var MIMAMORI_TOK_KEY = 'MIMAMORI_TOKEN_SNAPSHOT';  // 前回の tokens 件数（uid → 件数・時刻の履歴）
var MIMAMORI_SUBMIT_KINDS = ['ckdone', 'subrec', 'zaiko', 'soukatsu', 'nippou', 'kizuki'];

function mimamoriHourly() { return 見守り_毎時(); }          // ← トリガーに登録する名前（ローマ字）
function 見守り_トリガー登録() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'mimamoriHourly'; });
  if (!has) ScriptApp.newTrigger('mimamoriHourly').timeBased().everyHours(1).create();
  Logger.log(has ? '登録済み（毎時 mimamoriHourly）' : '登録しました（毎時 mimamoriHourly）');
  return { ok: true, registered: true };
}
function 見守り_いますぐ() {   // 直近24時間ぶんで判定（前回時刻を使わない・試し用）
  var r = mimamori_run_(Date.now() - 24 * 3600 * 1000, true);
  Logger.log(JSON.stringify(r, null, 1)); return r;
}
function 見守り_毎時() {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty(MIMAMORI_LAST_KEY) || 0);
  if (!last || Date.now() - last > 3 * 24 * 3600 * 1000) last = Date.now() - 24 * 3600 * 1000;   // 初回・長く止まっていた＝24時間ぶん
  var r = mimamori_run_(last, false);
  props.setProperty(MIMAMORI_LAST_KEY, String(Date.now()));
  return r;
}

function mimamori_run_(sinceTs, isTest) {
  var now = new Date();
  var hour = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));
  var rows = mimamori_recentRows_(Math.min(sinceTs, Date.now() - 3 * 24 * 3600 * 1000));   // 直近3日は必ず読む（③④の比較用＝④は「おととい」の営業日まで見る）
  var found = [];

  /* ① エラーの控え */
  var errs = rows.filter(function (r) { return r.kind === 'apperr' && r.ts > sinceTs && r.item !== 'TASKOK'; });   // ★2026-10-28 PCの朝の報告（TASKOK）は朝の点検メールにだけ載せる。TASK★ はここにも出す
  if (errs.length) {
    var lines = errs.map(function (r) {
      var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
      return '・' + mimamori_fmt_(r.ts) + '　' + (r.item || n.code || '') + '　' + (r.store || n.store || '') +
             '　画面=' + String(n.path || '') + '　' + String(n.msg || '').slice(0, 80) + (n.detail ? '　／ ' + String(n.detail).slice(0, 120) : '');
    });
    var drops = errs.filter(function (r) { return r.item === 'AUTHDROP'; }).length;
    var keeps = errs.filter(function (r) { return r.item === 'AUTHKEEP'; }).length;
    found.push('【エラーの控えが ' + errs.length + ' 件】' + (drops ? '　ログインが外れた=' + drops : '') + (keeps ? '　外れかけたが続行=' + keeps : '') + '\n' + lines.join('\n'));
  }

  /* ② ログインし直しが多いID（tokens の増え方） */
  var relog = mimamori_relogins_(now);
  if (relog.length) found.push('【24時間に3回以上ログインし直したID】\n' + relog.map(function (x) { return '・' + x.uid + '（' + x.name + '）　' + x.count + '回'; }).join('\n'));

  /* ③ USEN取込漏れ（5時台＝4時の自動のすぐ後／10時台＝念のため） */
  if (isTest || hour === 5 || hour === 10) {
    var miss = mimamori_usenMissing_(rows, now);
    if (miss.length) found.push('【USENレジの締めが届いていない店（' + miss[0].date + '）】\n' + miss.map(function (x) { return '・' + x.store; }).join('\n') + '\n→ 総括表の現金・カード・客数が空のままです。06/USENレジ/_自動取込ログ.txt を見て「USEN更新」で送り直す（USEN側に営業日の行が無い日もある）');
  }

  /* ④ 提出が止まった店（10時台・営業日＝朝4時区切り） */
  if (isTest || hour === 10) {
    var stopped = mimamori_stopped_(rows, now);
    if (stopped.length) found.push('【おとといは提出があったのに、きのう（' + mimamori_bizDay_(now.getTime() - 24 * 3600 * 1000) + '）1件も無い店】\n' + stopped.map(function (x) { return '・' + x; }).join('\n') + '\n→ 休業か、端末が止まっているか（ログイン・容量・電波）。営業日は朝4時〜翌朝4時で数えています');
  }

  if (!found.length) return { ok: true, found: 0 };
  var subject = '【世桜アプリ 見守り】' + found.length + '件（' + Utilities.formatDate(now, 'Asia/Tokyo', 'M/d H:mm') + '）';
  var body = found.join('\n\n') + '\n\n---\n本部データ: ' + mimamori_sheetUrl_() + '\n' + (isTest ? '※ 試し実行（直近24時間）' : '前回確認: ' + mimamori_fmt_(sinceTs));
  var to = getSetting_('MIMAMORI_MAIL_TO', '') || Session.getEffectiveUser().getEmail();
  if (to) MailApp.sendEmail({ to: String(to), subject: subject, body: body, name: '世桜アプリ 見守り' });
  return { ok: true, found: found.length, to: to };
}

/* 直近の行だけ読む（末尾から・ts が since より古くなったら止める。reports は追記式で概ね時系列） */
function mimamori_recentRows_(sinceTs) {
  var sh = getSheet(); var last = sh.getLastRow(); if (last < 2) return [];
  var out = []; var step = 400; var end = last;
  while (end >= 2) {
    var start = Math.max(2, end - step + 1);
    var vals = sh.getRange(start, 1, end - start + 1, 8).getValues();
    var oldest = Infinity;
    for (var i = vals.length - 1; i >= 0; i--) {
      var v = vals[i]; var ts = Number(v[1]) || 0;
      if (ts < oldest) oldest = ts;
      out.push({ ts: ts, kind: String(v[2] || ''), store: String(v[3] || ''), item: String(v[4] || ''), note: String(v[6] || '') });
    }
    if (oldest < sinceTs - 6 * 3600 * 1000) break;   // 6時間の余裕（取込行は過去日付の ts を持つことがある）
    end = start - 1;
  }
  return out.filter(function (r) { return r.ts >= sinceTs; });
}

/* ② tokens の件数が増えた回数を uid ごとに数える（前回の控えと比べる。履歴は24時間ぶん） */
function mimamori_relogins_(now) {
  var props = PropertiesService.getScriptProperties();
  var snap = {}; try { snap = JSON.parse(props.getProperty(MIMAMORI_TOK_KEY) || '{}'); } catch (e) {}
  var out = []; var cut = now.getTime() - 24 * 3600 * 1000;
  if (typeof auth_rows_ !== 'function') return out;
  auth_rows_().forEach(function (rec) {
    var uid = String(rec.uid || ''); if (!uid) return;
    var n = 0; try { n = JSON.parse(rec.tokens || '[]').length; } catch (e) {}
    var s = snap[uid] || { n: n, hist: [] };
    var hist = (s.hist || []).filter(function (t) { return t > cut; });
    if (n > (s.n || 0)) { for (var k = 0; k < n - s.n; k++) hist.push(now.getTime()); }   // 増えた分＝ログインし直し（上限20で押し出されると増えないが、updated で補う）
    else if (n === (s.n || 0) && rec.updated && new Date(rec.updated).getTime() > (s.at || 0) && n >= 20) hist.push(now.getTime());
    snap[uid] = { n: n, hist: hist, at: now.getTime() };
    if (hist.length >= 3) out.push({ uid: uid, name: String(rec.name || ''), count: hist.length });
  });
  props.setProperty(MIMAMORI_TOK_KEY, JSON.stringify(snap));
  return out;
}

/* ③ USENの店＝直近の src:'usen' の行がある店。昨日（営業日）のレジ締め（sales あり）の行が無ければ漏れ */
function mimamori_usenMissing_(rows, now) {
  var y = new Date(now.getTime() - 24 * 3600 * 1000);
  var ymd = Utilities.formatDate(y, 'Asia/Tokyo', 'yyyy-MM-dd');
  var dow = Number(Utilities.formatDate(y, 'Asia/Tokyo', 'u'));   // 1=月 … 7=日
  var usenStores = {}; var hasY = {};
  rows.forEach(function (r) {
    if (r.kind !== 'soukatsu') return;
    var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
    if (n.src !== 'usen') return;
    usenStores[r.store] = true;
    if (String(n.date || '') === ymd && n.sales != null && n.sales !== '') hasY[r.store] = true;   // ★2026-10-18 伝票明細だけの行（sales なし）は数えない
  });
  return Object.keys(usenStores).filter(function (s) {
    if (hasY[s]) return false;
    if (dow === 7 && /京都祇園/.test(s)) return false;   // 京都祇園は日曜定休
    return true;
  }).map(function (s) { return { store: s, date: ymd }; });
}

/* 営業日（朝4時〜翌朝4時）＝ 4時間引いた時刻の日付。0:00〜3:59 の提出は前日の営業日に数える */
var MIMAMORI_BIZ_CUT_H = 4;
function mimamori_bizDay_(ts) { return Utilities.formatDate(new Date(Number(ts) - MIMAMORI_BIZ_CUT_H * 3600 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd'); }

/* ④ おととい（営業日）提出があって、きのう（営業日）無い店。朝10時台に動かす＝きのうの営業日は閉まっている */
function mimamori_stopped_(rows, now) {
  var yday = mimamori_bizDay_(now.getTime() - 24 * 3600 * 1000);
  var dby = mimamori_bizDay_(now.getTime() - 2 * 24 * 3600 * 1000);
  var y = {}, t = {};
  rows.forEach(function (r) {
    if (MIMAMORI_SUBMIT_KINDS.indexOf(r.kind) === -1 || !r.store || r.store === '本部' || r.store === 'all') return;
    var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
    if (n.src === 'usen' || n.src === 'drive') return;   // 取込は店の操作ではない
    var d = mimamori_bizDay_(r.ts);
    if (d === dby) y[r.store] = true; if (d === yday) t[r.store] = true;
  });
  return Object.keys(y).filter(function (s) { return !t[s]; });
}

function mimamori_fmt_(ts) { return Utilities.formatDate(new Date(Number(ts) || 0), 'Asia/Tokyo', 'M/d H:mm'); }
function mimamori_sheetUrl_() { try { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) { return ''; } }


/* ============================================================
 * ★2026-10-28 朝の点検（毎日 5:30・★が1つでもあった朝だけメール。問題が無い日は送らない＝神田さん「動いてるなら報告は不要」）
 *   神田さん「エラーを言われな気づかないようじゃダメ。指摘される前に自分で自動でバックチェックできる体制を」
 *   「最近エラーのメールも届いてないけど、ちゃんとバックチェックこちらも自動でとれてるの？」
 *   → 毎時の見守りは「見つかったときだけ」送るので、届かない＝正常なのか止まっているのか分からなかった。
 *     朝の点検は必ず送る＝届かない日はこのGASのトリガーが止まっている印。
 *
 * ■ 見るもの（昨日の営業日ぶん）
 *   ① レジの取込＝USEN_STORE_MAP の全店（USEN7店＋本店101＋鰻富士山102＋鰻長堀橋103）に、きのうの締め（src:'usen'・sales あり）が届いたか
 *   ② PCの自動タスク＝神田さんのPCの朝の報告（kind:'apperr' item:'TASK…'・ops_morning_report.py が 5:15 に送る）。無ければ★（PC側が止まっている）
 *   ③ エラーの控え（apperr）24時間の件数と内訳
 *   ④ 総括表への書き戻し＝下見（書かない）で「まだ書けていない」「止めた」を数える
 *   ⑤ 提出が止まった店（おととい提出あり・きのう無し）
 * ■ 送り先＝MIMAMORI_MAIL_TO（未設定ならこのGASを動かしている人）。トリガー登録＝見守り_朝の点検トリガー登録() を1回実行
 * ============================================================ */
function mimamoriDaily() { return 見守り_朝の点検(); }
function 見守り_朝の点検トリガー登録() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'mimamoriDaily'; });
  if (!has) ScriptApp.newTrigger('mimamoriDaily').timeBased().everyDays(1).atHour(5).nearMinute(30).inTimezone('Asia/Tokyo').create();
  Logger.log(has ? '登録済み（毎日 5:30 mimamoriDaily）' : '登録しました（毎日 5:30 mimamoriDaily）');
  return { ok: true, registered: true };
}
function 見守り_朝の点検_いますぐ() { return 見守り_朝の点検(); }

function 見守り_朝の点検() {
  var now = new Date(); var nowTs = now.getTime();
  var ymd = Utilities.formatDate(new Date(nowTs - 24 * 3600 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd');
  var dow = Number(Utilities.formatDate(new Date(nowTs - 24 * 3600 * 1000), 'Asia/Tokyo', 'u'));
  var rows = mimamori_recentRows_(nowTs - 3 * 24 * 3600 * 1000);
  var ng = 0; var sec = [];

  /* ① レジの取込（全店） */
  var map = (typeof usen_storeMap_ === 'function') ? usen_storeMap_() : {};
  var stores = []; Object.keys(map).forEach(function (c) { if (stores.indexOf(map[c]) === -1) stores.push(map[c]); });
  var hasY = {};
  rows.forEach(function (r) {
    if (r.kind !== 'soukatsu') return;
    var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
    if (n.src === 'usen' && String(n.date || '') === ymd && n.sales != null && n.sales !== '') hasY[r.store] = true;
  });
  var ok1 = [], ng1 = [];
  stores.forEach(function (s) {
    if (hasY[s]) ok1.push(s);
    else if (dow === 7 && /京都祇園/.test(s)) ok1.push(s + '（日曜定休）');
    else ng1.push(s);
  });
  if (ng1.length) ng++;
  sec.push((ng1.length ? '★' : '○') + '① レジの取込（' + ymd + '）　届いた ' + ok1.length + '／' + stores.length + ' 店' +
    (ng1.length ? '\n　届いていない：' + ng1.join('・') + '\n　→ 総括表の現金・カード・客数が空のまま。PCの 06/…/_自動取込ログ.txt を見て送り直す' : ''));

  /* ② PCの自動タスクの報告（ops_morning_report.py） */
  var tasksAll = rows.filter(function (r) { return r.kind === 'apperr' && /^TASK/.test(r.item); });
  var tasks = tasksAll.filter(function (r) { return r.ts > nowTs - 24 * 3600 * 1000; });
  if (!tasks.length) {
    if (tasksAll.length) { ng++; sec.push('★② PCの自動タスク　きょうの報告が届いていない（神田さんのPCの「Yosakura_OpsReport」が動いていない／PCが起動していない／本番に送れていない）'); }
    else sec.push('△② PCの自動タスク　報告が届いたことがない（本番の受け口 opsreport が未デプロイのあいだはこの表示）');   // ★届いたことが無い＝入口未デプロイ。★にしない
  }
  else {
    var bad = tasks.filter(function (r) { return /★/.test(r.item); });
    if (bad.length) ng++;
    sec.push((bad.length ? '★' : '○') + '② PCの自動タスク\n' + tasks.map(function (r) {
      var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
      return '　' + mimamori_fmt_(r.ts) + '　' + String(n.msg || '').slice(0, 400);
    }).join('\n'));
  }

  /* ③ エラーの控え（24時間） */
  var errs = rows.filter(function (r) { return r.kind === 'apperr' && !/^TASK/.test(r.item) && r.ts > nowTs - 24 * 3600 * 1000; });
  var byItem = {}; errs.forEach(function (r) { var k = r.item || '?'; byItem[k] = (byItem[k] || 0) + 1; });
  if (errs.length) {
    sec.push('△③ エラーの控え（24時間）　' + errs.length + ' 件　' + Object.keys(byItem).map(function (k) { return k + '=' + byItem[k]; }).join('　') + '\n' +
      errs.slice(-5).map(function (r) { var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
        return '　' + mimamori_fmt_(r.ts) + '　' + (r.item || '') + '　' + (r.store || n.store || '') + '　' + String(n.msg || '').slice(0, 80); }).join('\n') +
      (errs.length > 5 ? '\n　（ほか ' + (errs.length - 5) + ' 件＝毎時の見守りメールに全件）' : ''));
  } else sec.push('○③ エラーの控え（24時間）　0 件');

  /* ④ 総括表への書き戻し（下見＝書かない） */
  try {
    if (typeof skwb_実行_ === 'function') {
      var r4 = skwb_実行_(false, 3);
      var rest = Number(r4.書く || 0) + Number(r4.書き直す || 0);
      var stopped = (r4.止めた || []).slice(0, 8);
      var bad4 = rest > 0;   // ★「止めた」は毎日同じ行が出る（お客様層の国の列など）ので△扱い。★は書けていない行があるときだけ
      if (bad4) ng++;
      sec.push((bad4 ? '★' : (stopped.length ? '△' : '○')) + '④ 総括表への書き戻し（直近3日）　まだ書けていない ' + rest + '　ずれ（店の値と違う・上書きしない） ' + Number(r4.ずれ || 0) +
        (stopped.length ? '\n　止めた：\n' + stopped.map(function (s) { return '　・' + String(s).slice(0, 160); }).join('\n') : '') +
        (rest > 0 ? '\n　→ 「まだ書けていない」は 4時の書き戻しが走らなかったか、総括表のタブ・ラベルが変わった印' : ''));
    }
  } catch (e4) { ng++; sec.push('★④ 総括表への書き戻し　下見でエラー：' + String(e4).slice(0, 200)); }

  /* ⑤ 提出が止まった店 */
  var stopped5 = mimamori_stopped_(rows, now);
  if (stopped5.length) { ng++; sec.push('★⑤ おとといは提出があったのに、きのう1件も無い店：' + stopped5.join('・') + '\n　→ 休業か、端末が止まっているか（ログイン・容量・電波）'); }
  else sec.push('○⑤ 提出が止まった店　なし');

  var subject = '【世桜アプリ 朝の点検】' + Utilities.formatDate(now, 'Asia/Tokyo', 'M/d') + (ng ? '　★ ' + ng + ' 件' : '　○ 全部OK');
  var body = sec.join('\n\n') + '\n\n---\n○＝問題なし　△＝見ておく　★＝対応が要る\n問題（★）が無い朝は送りません\n本部データ: ' + mimamori_sheetUrl_();
  var to = getSetting_('MIMAMORI_MAIL_TO', '') || Session.getEffectiveUser().getEmail();
  if (ng && to) MailApp.sendEmail({ to: String(to), subject: subject, body: body, name: '世桜アプリ 見守り' });   // ★問題が無い朝は送らない
  return { ok: true, ng: ng, sent: !!(ng && to), to: to, sections: sec.length };
}

/* ★PC側の朝の報告を受ける入口（USEN取込.gs の usen_api_ から kind:'opsreport' で呼ばれる・合言葉＝USEN_POST_KEY）
   行の形＝kind:'apperr' store:'本部' item:'TASKOK'／'TASK★' note:{code:'TASK', path:'PC', msg}。毎時の見守り①にも載る（★のときだけ目立つ） */
function opsreport_api_(data) {
  var key = String(getSetting_('USEN_POST_KEY', '') || '');
  if (!key || String(data.key || '') !== key) return { ok: false, error: 'USEN_KEY' };
  var msg = String(data.msg || '').slice(0, 1500);
  var bad = data.ng === true;   // ★の有無でなくPC側の判定（Airレジの「内訳の列が無い」のような毎日の注意書きで★にしない）
  var sh = getSheet();
  var id = Utilities.getUuid();
  sh.appendRow([id, Date.now(), 'apperr', '本部', bad ? 'TASK★' : 'TASKOK', '', JSON.stringify({ code: 'TASK', path: 'PC', msg: msg }), '[]']);
  return { ok: true, id: id, item: bad ? 'TASK★' : 'TASKOK' };
}
