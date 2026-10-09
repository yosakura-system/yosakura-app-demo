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
 *   ③ 10時台だけ：USENレジの店で、昨日の営業日の行（src:'usen'）が無い店 → 取込漏れ
 *   ④ 23時台だけ：きのう提出のあった店で、きょう1件も提出（ckdone／subrec／zaiko／soukatsu）が無い店 → 止まっている可能性
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
  var rows = mimamori_recentRows_(Math.min(sinceTs, Date.now() - 2 * 24 * 3600 * 1000));   // 直近2日は必ず読む（③④の比較用）
  var found = [];

  /* ① エラーの控え */
  var errs = rows.filter(function (r) { return r.kind === 'apperr' && r.ts > sinceTs; });
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

  /* ③ USEN取込漏れ（10時台） */
  if (isTest || hour === 10) {
    var miss = mimamori_usenMissing_(rows, now);
    if (miss.length) found.push('【USENレジの行が無い店（' + miss[0].date + '）】\n' + miss.map(function (x) { return '・' + x.store; }).join('\n') + '\n→ 「USEN更新」が走っていないか、USEN側に営業日の行が無いか');
  }

  /* ④ 提出が止まった店（23時台） */
  if (isTest || hour === 23) {
    var stopped = mimamori_stopped_(rows, now);
    if (stopped.length) found.push('【きのうは提出があったのに、きょう1件も無い店】\n' + stopped.map(function (x) { return '・' + x; }).join('\n') + '\n→ 休業か、端末が止まっているか（ログイン・容量・電波）');
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

/* ③ USENの店＝直近14日に src:'usen' の行がある店。昨日（営業日）の行が無ければ漏れ */
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
    if (String(n.date || '') === ymd) hasY[r.store] = true;
  });
  return Object.keys(usenStores).filter(function (s) {
    if (hasY[s]) return false;
    if (dow === 7 && /京都祇園/.test(s)) return false;   // 京都祇園は日曜定休
    return true;
  }).map(function (s) { return { store: s, date: ymd }; });
}

/* ④ きのう提出があって、きょう無い店 */
function mimamori_stopped_(rows, now) {
  var today = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  var yday = Utilities.formatDate(new Date(now.getTime() - 24 * 3600 * 1000), 'Asia/Tokyo', 'yyyy-MM-dd');
  var y = {}, t = {};
  rows.forEach(function (r) {
    if (MIMAMORI_SUBMIT_KINDS.indexOf(r.kind) === -1 || !r.store || r.store === '本部' || r.store === 'all') return;
    var n = {}; try { n = JSON.parse(r.note || '{}'); } catch (e) {}
    if (n.src === 'usen' || n.src === 'drive') return;   // 取込は店の操作ではない
    var d = Utilities.formatDate(new Date(r.ts), 'Asia/Tokyo', 'yyyy-MM-dd');
    if (d === yday) y[r.store] = true; if (d === today) t[r.store] = true;
  });
  return Object.keys(y).filter(function (s) { return !t[s]; });
}

function mimamori_fmt_(ts) { return Utilities.formatDate(new Date(Number(ts) || 0), 'Asia/Tokyo', 'M/d H:mm'); }
function mimamori_sheetUrl_() { try { return SpreadsheetApp.getActiveSpreadsheet().getUrl(); } catch (e) { return ''; } }
