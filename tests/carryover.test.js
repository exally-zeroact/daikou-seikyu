// @vitest-environment node
// ============================================================
// ★繰越（前回の残りを次の請求に乗せる）★ 2026-08-11
//
//   並べる順（指示役が決めた形）
//     今回請求額 → ＋前回繰越額 → 合計請求額 → −ご入金額 → 今回お支払額
//
//   ★ここで守ること（指示役の合格条件）★
//     ・★手で計算した値を必ず埋める★
//       （「紙とExcelが一致」だけの試験は ★両方が同じだけ間違っていると素通りする★。
//         2 の時に実際にそうなった＝エンジンをずらすと3つとも同じだけずれて緑のままだった）
//     ・★0円と書かない★
//         前回の請求が無い   → 「前回の請求はありません」
//         入金が読めない     → 「入金は未確認」
//       ＝「無い」と「0円」は別物。0円と書くと ★払い忘れと区別が付かない★。
//     ・前回繰越は ★過去の入金を引いた後★ の数なので、ご入金額で ★二重に引かない★
// ============================================================
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const E = createRequire(import.meta.url)(path.join(ROOT, "meisai-engine.js"));

describe("★繰越★", () => {
  it("エンジンが読めている", () => {
    expect(typeof E.carryoverOf).toBe("function");
  });

  it("★手で計算した例：前回 37,200 のうち 20,000 入金 → 繰越 17,200★", () => {
    // 過去：2026-05 に 37,200 請求 / 20,000 入金 → 残り 17,200
    // 今回：2026-06 に 12,000 請求 / 5,000 入金
    //   合計請求額 = 12,000 + 17,200 = 29,200
    //   今回お支払額 = 29,200 − 5,000 = 24,200
    const r = E.carryoverOf([{ month: "2026-05", seikyu: 37200, nyukin: 20000 }], 12000, 5000);
    expect(r.konkai).toBe(12000);
    expect(r.kurikoshi).toBe(17200);
    expect(r.goukeiSeikyu).toBe(29200);
    expect(r.nyukin).toBe(5000);
    expect(r.oshiharai).toBe(24200);
    expect(r.riyu).toEqual([]);
  });

  it("★手で計算した例：複数月の残りを足す★", () => {
    // 2026-03: 10,000 請求 / 10,000 入金 → 0
    // 2026-04: 8,600 請求 /      0 入金 → 8,600
    // 2026-05: 9,400 請求 /  4,000 入金 → 5,400
    //   前回繰越 = 0 + 8,600 + 5,400 = 14,000
    //   今回 7,200 → 合計請求額 21,200 → 入金 1,200 → お支払額 20,000
    const r = E.carryoverOf(
      [
        { month: "2026-03", seikyu: 10000, nyukin: 10000 },
        { month: "2026-04", seikyu: 8600, nyukin: 0 },
        { month: "2026-05", seikyu: 9400, nyukin: 4000 },
      ],
      7200,
      1200
    );
    expect(r.kurikoshi).toBe(14000);
    expect(r.goukeiSeikyu).toBe(21200);
    expect(r.oshiharai).toBe(20000);
  });

  it("★過去に払い過ぎている時は 繰越がマイナスになる（勝手に0にしない）★", () => {
    // 2026-05: 10,000 請求 / 12,000 入金 → −2,000
    const r = E.carryoverOf([{ month: "2026-05", seikyu: 10000, nyukin: 12000 }], 5000, 0);
    expect(r.kurikoshi, "★払い過ぎを0に丸めている★").toBe(-2000);
    expect(r.goukeiSeikyu).toBe(3000);
    expect(r.oshiharai).toBe(3000);
  });

  it("★前回の請求が1件も無い → 0円と書かず「前回の請求はありません」★", () => {
    const r = E.carryoverOf([], 12000, 0);
    expect(r.kurikoshi, "★0円と書いている（無いのと0は別物）★").toBe(null);
    expect(r.goukeiSeikyu, "出せないのに数を出している").toBe(null);
    expect(r.oshiharai).toBe(null);
    expect(r.riyu).toContain("前回の請求はありません");
  });

  it("★入金が読めない → 0円と書かず「入金は未確認」★", () => {
    const r = E.carryoverOf([{ month: "2026-05", seikyu: 37200, nyukin: 20000 }], 12000, null);
    expect(r.kurikoshi).toBe(17200);
    expect(r.goukeiSeikyu).toBe(29200);
    expect(r.nyukin, "★未確認を0円と書いている★").toBe(null);
    expect(r.oshiharai, "入金が分からないのに お支払額を出している").toBe(null);
    expect(r.riyu).toContain("入金は未確認");
  });

  it("★過去の月の請求額が読めない（控えが無い）→ 繰越を出さない★", () => {
    const r = E.carryoverOf(
      [
        { month: "2026-04", seikyu: null, nyukin: 0 },
        { month: "2026-05", seikyu: 9400, nyukin: 0 },
      ],
      7200,
      0
    );
    expect(r.kurikoshi, "★読めない月が在るのに 足して出している★").toBe(null);
    expect(r.riyu).toContain("前回の請求額が読めません");
  });

  it("★過去の入金が0の月と 未確認の月は別物★", () => {
    const zero = E.carryoverOf([{ month: "2026-05", seikyu: 1000, nyukin: 0 }], 0, 0);
    expect(zero.kurikoshi).toBe(1000);
    const fumei = E.carryoverOf([{ month: "2026-05", seikyu: 1000, nyukin: null }], 0, 0);
    expect(fumei.kurikoshi, "★未確認を0として足している★").toBe(null);
    expect(fumei.riyu).toContain("入金は未確認");
  });

  it("★前回繰越で引いた入金を もう一度 引かない（二重に引かない）★", () => {
    // 2026-05: 10,000 請求 / 10,000 入金 → 繰越 0
    // 今回 5,000 / 入金 0 → 合計 5,000 / お支払 5,000
    const r = E.carryoverOf([{ month: "2026-05", seikyu: 10000, nyukin: 10000 }], 5000, 0);
    expect(r.kurikoshi).toBe(0);
    expect(r.oshiharai, "★過去の入金を2回 引いている★").toBe(5000);
  });
});
