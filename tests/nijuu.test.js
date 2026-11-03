// @vitest-environment node
// ============================================================
// ★手で入れた行と メーターの行の 二重請求の 見張り★ 2026-11-04
//   守ること：倉庫に 入る 値（meisaiToDb の 後）で 見る／メーターの 日付 ≦ 手の 日付 ≦ メーターの 日付＋1
//   （メーターの 日付＝勤務を 始めた 日・乗車は 必ず その 後）／手同士は 見ない／
//   「別の 乗車」は 決めた 時の 値と 今の 値が 同じ 時だけ 効く
//   ★拾えない 物★：［続ける］で 晩を またいだ 勤務（差が 2日 以上）＝この 見張りでは 拾わない（紙に 書いた）
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const N = require("../lib/nijuu.js");

const m = (id, 日付, 金額, extra) =>
  Object.assign(
    { id, 会社名: "A社", 日付, 金額, 行き先: "松本町〜東鳥生町", dk_source: "daikome" },
    extra || {}
  );
const p = (date, amount, company) => ({ company: company || "A社", date, amount });

describe("hiNoSa（日数の 差）", () => {
  it("同じ日＝0・次の日＝1・前の日＝-1", () => {
    expect(N.hiNoSa("2026-11-02", "2026-11-02")).toBe(0);
    expect(N.hiNoSa("2026-11-02", "2026-11-03")).toBe(1);
    expect(N.hiNoSa("2026-11-03", "2026-11-02")).toBe(-1);
  });
  it("月末・年末・閏年を またぐ", () => {
    expect(N.hiNoSa("2026-10-31", "2026-11-01")).toBe(1);
    expect(N.hiNoSa("2026-12-31", "2027-01-01")).toBe(1);
    expect(N.hiNoSa("2028-02-28", "2028-02-29")).toBe(1);
    expect(N.hiNoSa("2028-02-29", "2028-03-01")).toBe(1);
    expect(N.hiNoSa("2027-02-28", "2027-03-01")).toBe(1);
  });
  it("形が 違えば null（突き合わせない）", () => {
    expect(N.hiNoSa("", "2026-11-02")).toBe(null);
    expect(N.hiNoSa(null, "2026-11-02")).toBe(null);
    expect(N.hiNoSa("2026/11/02", "2026-11-02")).toBe(null);
    expect(N.hiNoSa("2026-02-30", "2026-03-01")).toBe(null);
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

describe("sagasu（当たりを 探す）", () => {
  it("同じ 会社・同じ 日・同じ 額 → 当たり", () => {
    const r = N.sagasu([p("2026-11-02", 4500)], [m("x1", "2026-11-02", 4500)]);
    expect(Object.keys(r.atari)).toEqual(["0"]);
    expect(r.atari[0][0]).toMatchObject({ id: "x1", 日付: "2026-11-02", 金額: 4500 });
  });
  it("手の 日付が メーターの 次の 日（夜中の 乗車）→ 当たり", () => {
    const r = N.sagasu([p("2026-11-03", 4500)], [m("x1", "2026-11-02", 4500)]);
    expect(r.atari[0].length).toBe(1);
  });
  it("手の 日付が メーターの 前の 日 → 当たらない（乗車は 勤務の 始まりより 後）", () => {
    const r = N.sagasu([p("2026-11-01", 4500)], [m("x1", "2026-11-02", 4500)]);
    expect(r.atari).toEqual({});
  });
  it("2日 離れれば 当たらない（晩を またいだ 勤務は 拾えない＝紙に 書いた）", () => {
    const r = N.sagasu([p("2026-11-04", 4500)], [m("x1", "2026-11-02", 4500)]);
    expect(r.atari).toEqual({});
  });
  it("月末を またいで 次の 日 → 当たり", () => {
    const r = N.sagasu([p("2026-11-01", 4500)], [m("x1", "2026-10-31", 4500)]);
    expect(r.atari[0].length).toBe(1);
  });
  it("額が 1円 違えば 当たらない", () => {
    const r = N.sagasu([p("2026-11-02", 4501)], [m("x1", "2026-11-02", 4500)]);
    expect(r.atari).toEqual({});
  });
  it("会社が 違えば 当たらない", () => {
    const r = N.sagasu([p("2026-11-02", 4500, "B社")], [m("x1", "2026-11-02", 4500)]);
    expect(r.atari).toEqual({});
  });
  it("メーターでない 行（手同士）とは 当たらない", () => {
    const te = { id: "t1", 会社名: "A社", 日付: "2026-11-02", 金額: 4500 };
    const r = N.sagasu([p("2026-11-02", 4500)], [te]);
    expect(r.atari).toEqual({});
  });
  it("メーターの 額が 文字でも 数で 比べる", () => {
    const r = N.sagasu([p("2026-11-02", 4500)], [m("x1", "2026-11-02", "4500")]);
    expect(r.atari[0].length).toBe(1);
  });
  it("2本 当たれば 2本 返す", () => {
    const r = N.sagasu(
      [p("2026-11-03", 4500)],
      [m("x1", "2026-11-02", 4500), m("x2", "2026-11-03", 4500)]
    );
    expect(r.atari[0].map((x) => x.id)).toEqual(["x1", "x2"]);
  });
  it("日付が 無い・額が 0 の 行は 突き合わせず nashi に 数える（黙って 0本に しない）", () => {
    const r = N.sagasu(
      [p(null, 4500), p("2026-11-02", 0), p("2026-11-02", 4500)],
      [m("x1", "2026-11-02", 4500)]
    );
    expect(r.nashi).toEqual([0, 1]);
    expect(Object.keys(r.atari)).toEqual(["2"]);
  });
});

describe("yomuHanni（倉庫から 読み直す 日付の 範囲）", () => {
  it("最小の 前の 日 〜 最大", () => {
    expect(N.yomuHanni([p("2026-11-03", 1), p("2026-11-01", 1), p("2026-11-05", 1)])).toEqual({
      gte: "2026-10-31",
      lte: "2026-11-05",
    });
  });
  it("年の 頭は 前の 年の 大晦日から", () => {
    expect(N.yomuHanni([p("2027-01-01", 1)])).toEqual({ gte: "2026-12-31", lte: "2027-01-01" });
  });
  it("日付が 1つも 無ければ null（読まない）", () => {
    expect(N.yomuHanni([p(null, 1), p("", 1)])).toBe(null);
  });
});

describe("tomeru（保存を 止める 行）と 別の 乗車", () => {
  const meter = [m("x1", "2026-11-02", 4500), m("x2", "2026-11-02", 3000)];
  it("当たりが 在って 別の 乗車が 無ければ その 行で 止める", () => {
    const pl = [p("2026-11-02", 1000), p("2026-11-02", 4500)];
    const r = N.sagasu(pl, meter);
    expect(N.tomeru(r.atari, pl, [undefined, undefined])).toBe(1);
  });
  it("決めた 時の 値と 同じなら 通す", () => {
    const pl = [p("2026-11-02", 4500)];
    const r = N.sagasu(pl, meter);
    const kagi = N.betsuKagi(pl[0], r.atari[0]);
    expect(N.tomeru(r.atari, pl, [kagi])).toBe(-1);
  });
  it("別の 乗車と 決めた 後に 額を 直して 別の メーターの 行と 同じに なれば また 止める", () => {
    const pl1 = [p("2026-11-02", 4500)];
    const kagi = N.betsuKagi(pl1[0], N.sagasu(pl1, meter).atari[0]);
    const pl2 = [p("2026-11-02", 3000)];
    const r2 = N.sagasu(pl2, meter);
    expect(N.tomeru(r2.atari, pl2, [kagi])).toBe(0);
  });
  it("決めた 後に メーターの 行が 1本 増えたら また 止める", () => {
    const pl = [p("2026-11-02", 4500)];
    const kagi = N.betsuKagi(pl[0], N.sagasu(pl, meter).atari[0]);
    const r2 = N.sagasu(pl, meter.concat([m("x3", "2026-11-02", 4500)]));
    expect(N.tomeru(r2.atari, pl, [kagi])).toBe(0);
  });
  it("当たりが 無ければ -1", () => {
    expect(N.tomeru({}, [p("2026-11-02", 1)], [])).toBe(-1);
  });
});
