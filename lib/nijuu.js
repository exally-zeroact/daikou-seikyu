/* ==========================================================================
   lib/nijuu.js — 手で入れた行と メーターの行の 二重請求の 見張り 2026-11-04
   訳：紙の 明細の 多くは 手入力。同じ 乗車が メーター（ダイコメ → dk-sync-jobs → meisai・
       extra.dk_source／dk_ref）からも 入ると 二重に 請求する。保存の 直前に 倉庫から 読み直した
       メーターの 行と 突き合わせ、当たれば 人に「同じ 乗車か／別の 乗車か」を 選ばせる（額は 変えない）。
   決まり：
     ・倉庫に 入る 値（meisaiToDb の 後の company/date/amount）で 見る（対立役 注3）
     ・メーターの 日付＝勤務を 始めた 日（Daikou-app meisai-row.js businessDate）。乗車は その 後＝
       「メーターの 日付 ≦ 手の 日付 ≦ メーターの 日付＋1」で 当てる（対立役 注2）
     ・★拾えない 物★：［続ける］で 晩を またいだ 勤務（差が 2日 以上）＝ここでは 拾わない（対立役 注1）
     ・手同士・同じ 保存の 中の 行同士は 見ない（同じ 額の 乗車が 同じ 晩に 2本は 普通に 在る）
     ・日付が 無い・額が 0 の 行は 突き合わせず nashi に 数える（黙って 0本に しない・対立役 注4）
     ・「別の 乗車」は 決めた 時の 日付|額|当たった 行の id と 今が 同じ 時だけ 効く（対立役 注5）
   公開：window.Nijuu（Node では module.exports）。DOM と 倉庫は 触らない
   ========================================================================== */
(function (root) {
  "use strict";

  var HI_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function hiNoMs(s) {
    var mm = HI_RE.exec(String(s == null ? "" : s));
    if (!mm) return null;
    var y = Number(mm[1]);
    var mo = Number(mm[2]);
    var d = Number(mm[3]);
    var ms = Date.UTC(y, mo - 1, d, 12);
    var dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return null;
    return ms;
  }

  /* b − a の 日数（形が 違えば null） */
  function hiNoSa(a, b) {
    var x = hiNoMs(a);
    var y = hiNoMs(b);
    if (x == null || y == null) return null;
    return Math.round((y - x) / 86400000);
  }

  function hiTasu(s, n) {
    var ms = hiNoMs(s);
    if (ms == null) return null;
    var dt = new Date(ms + n * 86400000);
    var p = function (v) {
      return String(v).padStart(2, "0");
    };
    return dt.getUTCFullYear() + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate());
  }

  function meterKa(r) {
    return !!(r && (r.dk_source || r.dk_ref));
  }

  function gaku(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* payload＝これから 入れる 行（meisaiToDb の 形）／meter＝読み直した 行（meisaiFromDb の 形・メーター 以外は 捨てる）
     返す { atari: { 行の番号: [ {id,日付,金額,行き先} ] }, nashi: [突き合わせなかった 行の番号] } */
  function sagasu(payload, meter) {
    var atari = {};
    var nashi = [];
    var ms = (meter || []).filter(meterKa);
    (payload || []).forEach(function (pl, i) {
      var kin = pl ? gaku(pl.amount) : null;
      if (!pl || hiNoMs(pl.date) == null || kin == null) {
        nashi.push(i);
        return;
      }
      var hit = [];
      ms.forEach(function (r) {
        if (r.会社名 !== pl.company) return;
        if (gaku(r.金額) !== kin) return;
        var sa = hiNoSa(r.日付, pl.date);
        if (sa !== 0 && sa !== 1) return;
        hit.push({ id: r.id, 日付: r.日付, 金額: gaku(r.金額), 行き先: r.行き先 || "" });
      });
      if (hit.length) atari[i] = hit;
    });
    return { atari: atari, nashi: nashi };
  }

  /* 倉庫から 読み直す 範囲（最小の 前の 日 〜 最大）。日付が 無ければ null */
  function yomuHanni(payload) {
    var hi = (payload || [])
      .map(function (pl) {
        return pl && hiNoMs(pl.date) != null ? pl.date : null;
      })
      .filter(Boolean)
      .sort();
    if (!hi.length) return null;
    return { gte: hiTasu(hi[0], -1), lte: hi[hi.length - 1] };
  }

  /* 「別の 乗車」の 印＝決めた 時の 値 */
  function betsuKagi(pl, hit) {
    var ids = (hit || [])
      .map(function (h) {
        return String(h.id);
      })
      .sort();
    return String(pl && pl.date) + "|" + String(pl && pl.amount) + "|" + ids.join(",");
  }

  /* 止める 行の 番号（無ければ -1）。betsu[i]＝その 行で 押した 印 */
  function tomeru(atari, payload, betsu) {
    for (var i = 0; i < (payload || []).length; i++) {
      if (!atari || !atari[i]) continue;
      if ((betsu || [])[i] !== betsuKagi(payload[i], atari[i])) return i;
    }
    return -1;
  }

  var api = {
    hiNoSa: hiNoSa,
    hiTasu: hiTasu,
    meterKa: meterKa,
    sagasu: sagasu,
    yomuHanni: yomuHanni,
    betsuKagi: betsuKagi,
    tomeru: tomeru,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Nijuu = api;
})(typeof window !== "undefined" ? window : this);
