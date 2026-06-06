import { describe, it, expect } from "vitest";
import formula from "../exally-formula.js";

// exally-formula.js の純ヘルパー(_toRC = セル参照→0始まり行列)を回帰固定。
// book.html から切り出したエンジンなので、export 形状とパース論理の崩れを毎 push で検出する。
describe("exally-formula 純ヘルパー", () => {
  it("export が主要関数を含む", () => {
    expect(typeof formula.initExallyFormula).toBe("function");
    expect(typeof formula._toRC).toBe("function");
  });

  it("_toRC: A1スタイル参照を {r,c}(0始まり)に変換", () => {
    expect(formula._toRC("A1")).toEqual({ r: 0, c: 0 });
    expect(formula._toRC("B2")).toEqual({ r: 1, c: 1 });
    expect(formula._toRC("Z10")).toEqual({ r: 9, c: 25 });
    expect(formula._toRC("AA1")).toEqual({ r: 0, c: 26 });
  });

  it("_toRC: 不正な参照は null", () => {
    expect(formula._toRC("not-a-ref")).toBeNull();
  });
});
