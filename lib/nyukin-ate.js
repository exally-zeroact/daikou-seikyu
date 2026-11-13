/* ==========================================================================
   lib/nyukin-ate.js — 入金を 請求（会社×月）へ 当てる 所（1本）2026-11-13 ⑥件B
   画面の 入金タブ・集計（seikyuList・payStatusOf）と 外から読む口の 未入金の表（minyukin）の 両方が ここを 呼ぶ
   （写しを 作らない＝画面と 口が 1円も 食い違わない）。中身は 画面に 在った 物を そのまま 移した。
   ★「繰越を使う」会社だけ★ 記録した 入金を その会社の 全部の 月で 足し、古い 月から 請求額 いっぱいまで 当て、
     余りは 一番 新しい 月に 乗せる。繰越を 使わない 会社は 記録した 月の 額の まま。
   ★記録した 入金（paidKiroku）は 書き換えない★＝当てた 額は paid に 置くだけ。
   DOM と 倉庫を 触らない 純粋な 関数だけ。公開：window.NyukinAte（Node では module.exports）
   ========================================================================== */
(function (root) {
  "use strict";

  // all＝[{ month, company, total, paidKiroku, ... }]（paid は ここで 付ける）
  // isCarry(company)＝その 会社が 繰越を 使うか
  function ateru(all, isCarry) {
    all.forEach(function (x) {
      x.paid = x.paidKiroku;
    });
    var byCo = {};
    all.forEach(function (x) {
      if (isCarry(x.company)) (byCo[x.company] = byCo[x.company] || []).push(x);
    });
    Object.keys(byCo).forEach(function (co) {
      var list = byCo[co].slice().sort(function (a, b) {
        return a.month.localeCompare(b.month);
      });
      var pool = list.reduce(function (t, x) {
        return t + x.paidKiroku;
      }, 0);
      list.forEach(function (x, i) {
        var a = i === list.length - 1 ? pool : Math.min(Math.max(x.total, 0), pool);
        x.paid = a;
        pool -= a;
      });
    });
    return all;
  }

  function jotai(total, paid) {
    // ★請求 0円の 月は 払う 物が 無い＝入金済★（10-02 夜：繰越で 当てても「未入金」の まま 残った）
    if (total <= 0 && paid >= 0) return "paid";
    if (paid <= 0) return "unpaid";
    if (paid >= total) return "paid";
    return "partial";
  }

  var NyukinAte = { ateru: ateru, jotai: jotai };
  root.NyukinAte = NyukinAte;
  if (typeof module !== "undefined" && module.exports) module.exports = NyukinAte;
})(typeof window !== "undefined" ? window : this);
