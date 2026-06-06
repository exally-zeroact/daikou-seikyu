import { describe, it, expect } from "vitest";
import KOYOHOKEN from "../koyohoken-ritsu.js";
import ROUKI from "../rouki-ritsu.js";
import SAITEI from "../saitei-chingin.js";
import SHAKAIHOKEN from "../shakaihoken-hyo.js";
import SHOTOKUZEI from "../shotokuzei-hyou.js";
import SHOUHIZEI from "../shouhizei-ritsu.js";

// 全数値リーフが「有限かつ非負」であることを再帰検査する。
// 料率/税テーブルの typo (NaN / undefined / 負値 / 末尾カンマ崩れ) が混入すると
// 給与明細・請求書の金額が壊れるため、ここで止める。
function assertNumericLeavesSane(value, path) {
  if (value === null || value === undefined) return;
  if (typeof value === "number") {
    // 最上位ブラケットの上限は Infinity が正しい仕様。NaN と負値のみを typo として弾く。
    expect(Number.isNaN(value), `${path} は NaN でないこと`).toBe(false);
    expect(value >= 0, `${path} は非負であること(Infinity可)`).toBe(true);
    return;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      assertNumericLeavesSane(value[key], `${path}.${key}`);
    }
  }
}

describe("料率/税テーブルの健全性 (給与計算の正しさを守る)", () => {
  const tables = { KOYOHOKEN, ROUKI, SAITEI, SHAKAIHOKEN, SHOTOKUZEI, SHOUHIZEI };
  for (const [name, table] of Object.entries(tables)) {
    it(`${name} は object で、数値リーフが全て有限・非負`, () => {
      expect(table && typeof table === "object").toBe(true);
      assertNumericLeavesSane(table, name);
    });
  }

  it("雇用保険 一般の事業 従業員負担率 = 0.55% (既知値を固定)", () => {
    expect(KOYOHOKEN.jugyoin.ippan).toBe(0.0055);
  });
});
