/** ============================================================
 * 点検_ログイン.gs — 「急にログイン画面になった」の切り分け用（読むだけ・書き込みなし）
 *
 * ■ なぜ要るか（2026-10-24）
 *   10/21〜23 に、ログイン中の人が外された記録（apperr の AUTHDROP）が7件あり、
 *   どれもサーバー側でも「トークンが一覧に無い」（AUTHMISS）だった。
 *   トークンが一覧から消えるのは ①同時ログイン上限（AUTH_TOKEN_MAX）で古い順に押し出し
 *   ②パスワード変更で他の端末を外した ③登録し直し・月次リセット のどれか。
 *   → IDごとの「いま有効なログインの数」と「最後に変わった日時」を出して、どれかを見分ける。
 *
 * ■ 出すもの：uid・役割・有効なログインの数（上限との比）・最後の更新・パスワードを変えた日
 *   ★トークンやハッシュの中身は出さない（数だけ）
 * ============================================================ */
function 点検_ログイン数() {
  var fmt = function (d) { try { return d ? Utilities.formatDate(new Date(d), 'Asia/Tokyo', 'MM/dd HH:mm') : ''; } catch (e) { return ''; } };
  var out = auth_rows_().map(function (r) {
    var n = 0; try { n = JSON.parse(r.tokens || '[]').length; } catch (e) { n = -1; }
    return { uid: String(r.uid), 役割: String(r.role), ログイン数: n + '/' + AUTH_TOKEN_MAX, 上限: n >= AUTH_TOKEN_MAX ? '★上限' : '',
             最後の更新: fmt(r.updated), PW変更: fmt(r.pw_at) };
  }).sort(function (a, b) { return parseInt(b.ログイン数, 10) - parseInt(a.ログイン数, 10); });
  Logger.log(out.map(function (o) { return [o.上限, o.uid, o.役割, o.ログイン数, '更新 ' + o.最後の更新, 'PW ' + o.PW変更].join('  '); }).join('\n'));
  return out;
}
