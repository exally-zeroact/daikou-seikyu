import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// ★Excel機能の「計算値そのもの」を値レベルで自動回帰する。
//   アプリ(book.html)が実際に使う vendored エンジン hyperformula.full.min.js を
//   そのまま Node で読み込み、HyperFormula.buildEmpty と同じ licenseKey で計算させる。
//   = エンジン差し替え/設定崩れ/関数非対応化が起きたら即落ちる。
const require = createRequire(import.meta.url);
const { HyperFormula } = require("../hyperformula.full.min.js");

// grid(2次元配列)を計算し、指定セルの値を返す
function calc(grid, row, col) {
  const hf = HyperFormula.buildFromArray(grid, { licenseKey: "gpl-v3" });
  return hf.getCellValue({ sheet: 0, row, col });
}

describe("HyperFormula 計算値レベル回帰 (実エンジン)", () => {
  it("エンジンが Node で構築できる", () => {
    expect(typeof HyperFormula.buildFromArray).toBe("function");
  });

  it("集計: SUM / AVERAGE / MAX / MIN", () => {
    const g = [["=SUM(1,2,3)", "=AVERAGE(2,4,6)", "=MAX(5,9,2)", "=MIN(5,9,2)"]];
    expect(calc(g, 0, 0)).toBe(6);
    expect(calc(g, 0, 1)).toBe(4);
    expect(calc(g, 0, 2)).toBe(9);
    expect(calc(g, 0, 3)).toBe(2);
  });

  it("論理/丸め: IF / ROUND / ROUNDUP / ROUNDDOWN", () => {
    const g = [['=IF(2>1,"y","n")', "=ROUND(3.14159,2)", "=ROUNDUP(1.01,1)", "=ROUNDDOWN(1.99,1)"]];
    expect(calc(g, 0, 0)).toBe("y");
    expect(calc(g, 0, 1)).toBe(3.14);
    expect(calc(g, 0, 2)).toBe(1.1);
    expect(calc(g, 0, 3)).toBe(1.9);
  });

  it("文字列: CONCATENATE / & 連結", () => {
    const g = [['=CONCATENATE("税抜",1000)', '="合計"&"円"']];
    expect(calc(g, 0, 0)).toBe("税抜1000");
    expect(calc(g, 0, 1)).toBe("合計円");
  });

  it("参照: VLOOKUP 完全一致", () => {
    const g = [
      [1, "x", "=VLOOKUP(2,A1:B3,2,FALSE())"],
      [2, "y", ""],
      [3, "z", ""],
    ];
    expect(calc(g, 0, 2)).toBe("y");
  });

  it("税計算: 消費税10% と 端数処理(FLOOR)", () => {
    const g = [["=1000*0.1", "=FLOOR(1234*0.1,1)"]];
    expect(calc(g, 0, 0)).toBe(100);
    expect(calc(g, 0, 1)).toBe(123); // 123.4 → 円未満切り捨て
  });

  it("給与計算: 雇用保険 一般0.55% を実エンジンで(賃金30万→1650円)", () => {
    const g = [["=ROUND(300000*0.0055,0)"]];
    expect(calc(g, 0, 0)).toBe(1650);
  });
});
