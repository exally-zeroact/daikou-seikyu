// @vitest-environment node
// ============================================================
// ★lib/naoshi-rireki.js★ 2026-11-09（⑦ 3押し目＝直しの 履歴と 運転手の 赤）
//   赤の 決め＝司さん 10-21「運転手が 直したやつは 赤・事務所が 後で 直したら 消す」
//   設計前 taiketsu 止め1（会社名の 変えで 赤が 消える）・止め2（kansu・chokusetsu で 赤が 消える）を 塞ぐ
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const N = require("../lib/naoshi-rireki.js");

let n = 0;
function r(op, shu, kawatta, extra) {
  n += 1;
  return Object.assign(
    {
      id: n,
      tbl: "daikou.meisai",
      op: op,
      pk: { id: "m1" },
      dare_shu: shu,
      dare: shu === "device" ? "device:tan1" : shu + ":x",
      kawatta: kawatta || [],
      mae: null,
      ato: null,
    },
    extra || {}
  );
}

describe("運転手の 赤", () => {
  it("端末が 入れた だけ（I）は 赤で ない", () => {
    expect(N.akaKa([r("I", "device")])).toBe(false);
  });
  it("端末が 直した（U）は 赤", () => {
    expect(N.akaKa([r("I", "device"), r("U", "device", ["amount"])])).toBe(true);
  });
  it("後で 事務所が 直すと 赤が 消える", () => {
    expect(N.akaKa([r("U", "device", ["amount"]), r("U", "jimusho", ["amount"])])).toBe(false);
  });
  it("★止め1★ 会社名の 変えだけ（company）では 赤は 消えない", () => {
    expect(N.akaKa([r("U", "device", ["amount"]), r("U", "jimusho", ["company"])])).toBe(true);
  });
  it("会社名と 他の 列を 一緒に 直したら 消える", () => {
    expect(N.akaKa([r("U", "device", ["amount"]), r("U", "jimusho", ["company", "amount"])])).toBe(
      false
    );
  });
  it("★止め2★ kansu・chokusetsu・fumei・ai が 後に 来ても 赤は 消えない", () => {
    ["kansu", "chokusetsu", "fumei", "ai"].forEach((s) => {
      expect(N.akaKa([r("U", "device", ["amount"]), r("U", s, ["amount"])]), s).toBe(true);
    });
  });
  it("★叩き直し 注1★ 端末の 送り直しで 会社名だけ 戻った 行は 赤で ない", () => {
    expect(N.akaKa([r("I", "device"), r("U", "device", ["company"])])).toBe(false);
    expect(N.akaKa([r("U", "jimusho", ["amount"]), r("U", "device", ["company"])])).toBe(false);
  });
  it("事務所の 後に 運転手が 直すと 赤に 戻る（最後の 方）", () => {
    expect(N.akaKa([r("U", "jimusho", ["amount"]), r("U", "device", ["amount"])])).toBe(true);
  });
  it("生き返った 行（device の U deleted_at）は 赤", () => {
    expect(N.akaKa([r("U", "jimusho", ["deleted_at"]), r("U", "device", ["deleted_at"])])).toBe(
      true
    );
  });
  it("並びは id で 決める（渡す 順で なく）", () => {
    const a = r("U", "device", ["amount"]);
    const b = r("U", "jimusho", ["amount"]);
    const by = N.meisaiBetsu([b, a]);
    expect(N.akaKa(by.m1)).toBe(false);
  });
});

describe("結び・数え", () => {
  it("tbl は 'daikou.meisai' だけ 拾う（'meisai' は 拾わない）", () => {
    const by = N.meisaiBetsu([
      r("U", "device", ["amount"]),
      r("U", "device", ["amount"], { tbl: "meisai" }),
    ]);
    expect(by.m1.length).toBe(1);
    expect(by.m1[0].tbl).toBe("daikou.meisai");
  });
  it("直し n は U と D だけ", () => {
    expect(N.naoshiKazu([r("I", "device"), r("U", "device", ["amount"]), r("D", "jimusho")])).toBe(
      2
    );
    // ★叩き直し 注3★ 会社名だけ・自動の 埋め戻し・直接は 数えない
    expect(
      N.naoshiKazu([
        r("U", "jimusho", ["company"]),
        r("U", "kansu", ["amount"]),
        r("U", "chokusetsu", ["amount"]),
      ])
    ).toBe(0);
  });
});

describe("字", () => {
  it("誰の 字", () => {
    expect(N.dareMoji({ dare_shu: "jimusho" })).toBe("事務所");
    expect(N.dareMoji({ dare_shu: "device", dare: "device:%E8%BB%8A1" }, { 車1: "1号車" })).toBe(
      "運転手の端末（1号車）"
    );
    expect(N.dareMoji({ dare_shu: "device", dare: "device:tan9" }, {})).toBe(
      "運転手の端末（名前なし）"
    );
    // 200 字で 切られて 壊れた % でも 投げない（任意2）
    expect(N.dareMoji({ dare_shu: "device", dare: "device:%E8%BB" }, {})).toBe(
      "運転手の端末（名前なし）"
    );
    expect(N.dareMoji({ dare_shu: "kansu" })).toBe("自動");
    expect(N.dareMoji({ dare_shu: "chokusetsu" })).toBe("直接");
  });
  it("何・前→後", () => {
    expect(
      N.naiyou({ op: "U", kawatta: ["amount"], mae: { amount: 1000 }, ato: { amount: 1200 } })
    ).toEqual([{ nani: "金額", mae: "1000", ato: "1200" }]);
    expect(
      N.naiyou({
        op: "U",
        kawatta: ["deleted_at"],
        mae: { deleted_at: null },
        ato: { deleted_at: "x" },
      })[0].nani
    ).toBe("消した");
    expect(
      N.naiyou({
        op: "U",
        kawatta: ["deleted_at"],
        mae: { deleted_at: "x" },
        ato: { deleted_at: null },
      })[0].nani
    ).toBe("戻した");
    expect(N.naiyou({ op: "I" })[0].nani).toBe("足した");
    expect(
      N.naiyou({
        op: "U",
        kawatta: ["extra"],
        mae: { extra: { a: 1 } },
        ato: { extra: { a: 2 } },
      })[0]
    ).toEqual({ nani: "その他（車・メーター）", mae: "", ato: "" });
    expect(N.naiyou({ op: "U", kawatta: ["nazo"], mae: {}, ato: { nazo: 1 } })[0]).toEqual({
      nani: "nazo",
      mae: "（空）",
      ato: "1",
    });
  });
});

describe("入金の 束ね（id が 替わる・I に 月が 無い＝注1）", () => {
  const p = (id, op, pk, extra) =>
    Object.assign(
      { id, tbl: "daikou.payments", op, pk: { id: pk }, dare_shu: "jimusho", kawatta: [] },
      extra || {}
    );
  it("今の 行と D の mae から 月・会社を 引く・引けない 物は 出さない", () => {
    const rows = [
      p(1, "I", "a", { ato: { id: "a", paid: 500 } }),
      p(2, "D", "a", { mae: { id: "a", month: "2026-11", company: "甲", paid: 500 } }),
      p(3, "I", "b", { ato: { id: "b", paid: 600 } }),
      p(4, "U", "b", { kawatta: ["paid"] }),
      p(5, "U", "z", { kawatta: ["paid"] }),
    ];
    const by = N.nyukinBetsu(rows, [{ id: "b", month: "2026-11", company: "甲" }]);
    expect(Object.keys(by)).toEqual(["2026-11::甲"]);
    expect(by["2026-11::甲"].map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("黙ってよい 読めない", () => {
  it("表・部屋が 無い 時だけ", () => {
    expect(N.hyouGaNai({ code: "PGRST205" })).toBe(true);
    expect(N.hyouGaNai({ code: "42P01" })).toBe(true);
    expect(N.hyouGaNai({ status: 404 })).toBe(true);
    expect(N.hyouGaNai({ message: "Failed to fetch" })).toBe(false);
    expect(N.hyouGaNai(null)).toBe(false);
  });
});
