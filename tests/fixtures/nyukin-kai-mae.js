// ★旧の 写し（試験の ためだけ）★ a11687f の daikou-seikyu.html 8328-8339・9545-9622 を そのまま。
// lib/nyukin-kai.js へ 移した 後も 出しが 1円も 変わらない事を tests/nyukin-kai.test.js が 比べる。直すな。

// ★倉庫の payments の 1行 → PAYMENTS の 1つ（立ち上げと 消し込みの 読み直しが 同じ 物を 使う・対立役 v3 止1）★
function payRecFromDb(r) {
  return {
    paid: r.paid,
    paidDate: r.paid_date || "",
    createdAt: r.created_at || "", // 入金日が 空の 時の 月（繰越の ご入金額）
    entries: Array.isArray(r.entries) ? r.entries : null, // 入金の 回（null＝前からの 記録）
    note: r.memo || "",
    _dbid: r.id,
    uid: r.user_id, // 明細が 0件に なった 月を 出す 時に 自分の 記録だけを 拾う 2026-10-14
  };
}

/* ★★入金の 回（entries）★★ 2026-11-02（司さん「列を足してよい」）
   payments.entries＝[{gaku, hi}]＝1行に 入った 入金の 1回ずつ。紙は 1回ずつ 入金日の 月で 数える
   （前は 行の 入金日 1つ＝「6/10 一部・7/20 残り」が 全部 7月に 数わり、出し直した 6月の 紙が 多く 請求した）。
   ★正は paid★（古い 版の 画面は paid と paid_date だけ 書く）：
     ・entries が 無い＝前からの 記録＝今の 額と 入金日を 1回分
     ・合計 ≠ paid＝古い 版が 額を 変えた＝足りない 分は paid_date の 回・多い 分は 新しい 回から 削る
     ・最後の 回の 日 ≠ paid_date＝古い 版が 日を 変えた＝最後の 回を paid_date に 寄せる（対立役 止2）
   新しい 画面は いつも paid_date＝最後の 回の 日 を 書く。 */
function hiDake(s) {
  var d = String(s || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(d)) return d + "-01";
  return "";
}
/* ★回の 1つを 作る＝鍵の 順を 決めて 作る（gaku, hi, src, tesuryo）★ 2026-11-03（消し込み）
   src＝銀行の明細 CSV の 出どころ（二重に 記録しない 見分け）・tesuryo＝うち 振込手数料（こちら持ちで 消した 額）
   ★{gaku,hi} だけに 作り直すと 消える★（対立役 v1 止3）・倉庫の jsonb は 鍵を 並べ替えて 返す＝順を 固定して 比べる（v3 注1） */
function kaiTsukuru(e, gaku, hi) {
  var o = { gaku: gaku, hi: hi };
  if (e && typeof e.src === "string" && e.src) o.src = e.src;
  var t = Math.round(Number(e && e.tesuryo) || 0);
  if (t > 0) o.tesuryo = Math.min(t, gaku);
  return o;
}
function entriesKezuru(out, n) {
  for (var i = out.length - 1; i >= 0 && n > 0; i--) {
    var g = Math.min(out[i].gaku, n);
    out[i] = kaiTsukuru(out[i], out[i].gaku - g, out[i].hi);
    n -= g;
  }
  return out.filter(function (e) {
    return e.gaku > 0;
  });
}
function entriesOf(rec, gyouNoTsuki) {
  var paid = Math.max(0, Math.round(Number(rec && rec.paid) || 0));
  var pd = hiDake(rec && rec.paidDate);
  var ichi = pd || hiDake(rec && rec.createdAt) || hiDake(gyouNoTsuki);
  var out = [];
  if (rec && Array.isArray(rec.entries)) {
    rec.entries.forEach(function (e) {
      var g = Math.round(Number(e && e.gaku));
      if (!isFinite(g) || g <= 0) return;
      out.push(kaiTsukuru(e, g, hiDake(e.hi) || ichi));
    });
  } else if (paid > 0) out.push({ gaku: paid, hi: ichi });
  var sum = out.reduce(function (t, e) {
    return t + e.gaku;
  }, 0);
  if (sum < paid) out.push({ gaku: paid - sum, hi: ichi });
  else if (sum > paid) out = entriesKezuru(out, sum - paid);
  // 最後の 回の 日 ≠ paid_date＝古い 版が 日だけ 変えた（新しい 画面は 必ず 揃えて 書く）
  if (out.length && out[out.length - 1].hi !== ichi)
    out[out.length - 1] = kaiTsukuru(out[out.length - 1], out[out.length - 1].gaku, ichi);
  return out;
}
/* 書く 時の 回：前の 回と 新しい 額の 差で 決める
   増えた＝{差, hi} を 足す／減った＝新しい 回から 削る／hiKaeta＝最後の 回の 日を hi に する */
function entriesAtarashii(mae, newPaid, hi, hiKaeta) {
  var out = (mae || []).map(function (e) {
    return kaiTsukuru(e, e.gaku, e.hi);
  });
  var sum = out.reduce(function (t, e) {
    return t + e.gaku;
  }, 0);
  newPaid = Math.max(0, Math.round(Number(newPaid) || 0));
  if (newPaid > sum) out.push({ gaku: newPaid - sum, hi: hi || null });
  else {
    if (newPaid < sum) out = entriesKezuru(out, sum - newPaid);
    if (hiKaeta && out.length)
      out[out.length - 1] = kaiTsukuru(out[out.length - 1], out[out.length - 1].gaku, hi || null);
  }
  return out;
}
module.exports = { payRecFromDb, hiDake, kaiTsukuru, entriesKezuru, entriesOf, entriesAtarashii };
