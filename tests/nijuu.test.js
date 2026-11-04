// @vitest-environment node
// ============================================================
// ★lib/nijuu.js の 公開★ 2026-11-04 夜
//   手で入れた行と メーターの行の「同じ 乗車かも」（二重請求の 見張り）は 外した（司さん「おれが 入力しよんやけん
//   いちいち 出すなや／いつ こんなん 出せって 指示したんど」）＝その 関数が 戻って いない 事を 見る
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const N = require("../lib/nijuu.js");

describe("外した 見張りの 関数は 無い", () => {
  it("公開は shirushi・zureKazoeru・hakkoMae・meterKa だけ", () => {
    expect(Object.keys(N).sort()).toEqual(["hakkoMae", "meterKa", "shirushi", "zureKazoeru"]);
    ["sagasu", "yomuHanni", "betsuKagi", "tomeru", "kasanariKagi"].forEach((k) =>
      expect(N[k]).toBeUndefined()
    );
  });
});

describe("meterKa（メーターから 入った 行か）", () => {
  it("dk_source か dk_ref が 在れば メーター", () => {
    expect(N.meterKa({ dk_source: "daikome" })).toBe(true);
    expect(N.meterKa({ dk_ref: "dev:1:2" })).toBe(true);
    expect(N.meterKa({ dk_car: "1号車" })).toBe(false);
    expect(N.meterKa({})).toBe(false);
    expect(N.meterKa(null)).toBe(false);
  });
});
