// @vitest-environment node
// ============================================================
// ★請求書を 出す 前の 見張り★ 2026-11-04（lib/nijuu.js zureKazoeru・hakkoMae・kasanariKagi）
//   守ること：倉庫と 画面の 違いを 数える（足す・直す・消す・画面の 中の 同じ id の 2重）／
//   鍵の 順だけ 違う 物は 違いに しない（jsonb は 鍵を 並べ替える）／この 紙の 材料に 触れる 物だけ 数える／
//   手の 行 × メーターの 行の 重なり（同じ 会社・同じ 額・メーターの日 ≦ 手の日 ≦ ＋1・どちらかが その 月）／
//   保存の 時の「別の 乗車」の 印は 値が 同じ 間だけ 効く／料金が 空の メーターの 行は 止める（0円は 止めない）
//   値は 全部 作り物
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const N = require("../lib/nijuu.js");

const it_ = (id, row, sigObj) => ({ id, row, sig: N.shirushi(sigObj || row) });

describe("shirushi（鍵の 順を 揃えた 印）", () => {
  it("鍵の 順だけ 違う 物は 同じ（中の 物も）", () => {
    expect(N.shirushi({ a: 1, extra: { dk_car: "1号", 車種: "x" } })).toBe(
      N.shirushi({ extra: { 車種: "x", dk_car: "1号" }, a: 1 })
    );
    expect(N.shirushi({ e: [{ b: 1, a: 2 }] })).toBe(N.shirushi({ e: [{ a: 2, b: 1 }] }));
  });
  it("値が 違えば 違う", () => {
    expect(N.shirushi({ a: 1 })).not.toBe(N.shirushi({ a: 2 }));
    expect(N.shirushi({ a: 1 })).not.toBe(N.shirushi({ a: "1" }));
  });
});

describe("zureKazoeru（倉庫と 画面の 違い）", () => {
  const A = { 会社名: "A社", 日付: "2026-11-02", 金額: 3000 };
  it("同じ なら 0", () => {
    const z = N.zureKazoeru(
      [it_("1", A)],
      [it_("1", { 金額: 3000, 日付: "2026-11-02", 会社名: "A社" })]
    );
    expect(z).toEqual({ tasu: 0, naoru: 0, kieru: 0, kasanaru: 0, zenbu: 0 });
  });
  it("倉庫に 足された・直った・消えた を 数える", () => {
    const z = N.zureKazoeru(
      [it_("1", A), it_("2", A)],
      [it_("1", Object.assign({}, A, { 金額: 3500 })), it_("3", A)]
    );
    expect(z).toEqual({ tasu: 1, naoru: 1, kieru: 1, kasanaru: 0, zenbu: 3 });
  });
  it("★画面の 中で 同じ id が 2回＝違い★（保存の 途中に 替えた 時の 2重）", () => {
    const z = N.zureKazoeru([it_("1", A), it_("1", A)], [it_("1", A)]);
    expect(z.kasanaru).toBe(1);
    expect(z.zenbu).toBe(1);
  });
  it("材料に 触れない 違いは 数えない（zenbu には 入る）・前か 後の どちらかが 触れれば 数える", () => {
    const B = { 会社名: "B社", 日付: "2026-11-02", 金額: 1000 };
    const fureru = (r) => r.会社名 === "A社";
    const z = N.zureKazoeru(
      [it_("9", B)],
      [it_("9", Object.assign({}, B, { 金額: 2000 })), it_("8", B)],
      fureru
    );
    expect(z).toEqual({ tasu: 0, naoru: 0, kieru: 0, kasanaru: 0, zenbu: 2 });
    // B社 → A社 に 直った 行は 触れる
    const z2 = N.zureKazoeru(
      [it_("9", B)],
      [it_("9", Object.assign({}, B, { 会社名: "A社" }))],
      fureru
    );
    expect(z2.naoru).toBe(1);
    // A社 → B社 に 動いた 行も 触れる（紙から 抜ける）
    const z3 = N.zureKazoeru(
      [it_("9", A)],
      [it_("9", Object.assign({}, A, { 会社名: "B社" }))],
      fureru
    );
    expect(z3.naoru).toBe(1);
  });
});

const meter = (id, 日付, 金額, extra) =>
  Object.assign(
    {
      id,
      会社名: "A社",
      日付,
      金額,
      行き先: "松本町〜東鳥生町",
      dk_source: "daikome",
      dk_ref: "d:" + id,
    },
    extra || {}
  );
const te = (id, 日付, 金額, extra) =>
  Object.assign({ id, 会社名: "A社", 日付, 金額, 行き先: "駅" }, extra || {});

describe("hakkoMae（重なり）", () => {
  it("同じ日・次の日は 当たる／前の日・2日後・額違い・会社違いは 当たらない", () => {
    const r = N.hakkoMae(
      [
        meter("m1", "2026-11-02", 3000),
        te("t1", "2026-11-02", 3000),
        te("t2", "2026-11-03", 3000),
        te("t3", "2026-11-01", 3000),
        te("t4", "2026-11-04", 3000),
        te("t5", "2026-11-02", 3100),
        te("t6", "2026-11-02", 3000, { 会社名: "B社" }),
      ],
      "2026-11",
      ["A社", "B社"]
    );
    expect(r.kasanari["A社"].map((k) => k.te.id)).toEqual(["t1", "t2"]);
    expect(r.kasanari["B社"]).toBeUndefined();
  });
  it("手同士・メーター同士は 見ない", () => {
    const r = N.hakkoMae(
      [
        te("t1", "2026-11-02", 3000),
        te("t2", "2026-11-02", 3000),
        meter("m1", "2026-11-02", 3000),
        meter("m2", "2026-11-02", 3000),
      ],
      "2026-11",
      ["A社"]
    );
    // 手 t1・t2 が それぞれ m1・m2 の 両方に 当たる＝2組×2（手同士・メーター同士の 組は 無い）
    expect(r.kasanari["A社"].map((k) => k.te.id)).toEqual(["t1", "t2"]);
    expect(r.kasanari["A社"].map((k) => k.meter.length)).toEqual([2, 2]);
    r.kasanari["A社"].forEach((k) => {
      expect(k.te.id.startsWith("t")).toBe(true);
      k.meter.forEach((m) => expect(m.id.startsWith("m")).toBe(true));
    });
  });
  it("月を またぐ 組も 出す（メーター 10-31・手 11-01）・どちらも 月の 外なら 出さない", () => {
    const r = N.hakkoMae(
      [meter("m1", "2026-10-31", 3000), te("t1", "2026-11-01", 3000)],
      "2026-11",
      ["A社"]
    );
    expect(r.kasanari["A社"].length).toBe(1);
    const r2 = N.hakkoMae(
      [meter("m1", "2026-10-30", 3000), te("t1", "2026-10-31", 3000)],
      "2026-11",
      ["A社"]
    );
    expect(r2.kasanari["A社"]).toBeUndefined();
  });
  it("紙に 載せない 会社は 見ない", () => {
    const r = N.hakkoMae(
      [meter("m1", "2026-11-02", 3000), te("t1", "2026-11-02", 3000)],
      "2026-11",
      ["B社"]
    );
    expect(r.kasanari).toEqual({});
  });
  it("「別の 乗車」の 印（nijuu_betsu）は 値が 同じ 間だけ 効く", () => {
    const b = { ids: ["m1"], date: "2026-11-02", amount: 3000 };
    const r = N.hakkoMae(
      [meter("m1", "2026-11-02", 3000), te("t1", "2026-11-02", 3000, { nijuu_betsu: b })],
      "2026-11",
      ["A社"]
    );
    expect(r.kasanari).toEqual({});
    // 別の メーター行には 効かない
    const r2 = N.hakkoMae(
      [
        meter("m1", "2026-11-02", 3000),
        meter("m2", "2026-11-02", 3000),
        te("t1", "2026-11-02", 3000, { nijuu_betsu: b }),
      ],
      "2026-11",
      ["A社"]
    );
    expect(r2.kasanari["A社"][0].meter.map((m) => m.id)).toEqual(["m2"]);
    // 日付を 直した 後は 効かない
    const r3 = N.hakkoMae(
      [meter("m1", "2026-11-02", 3000), te("t1", "2026-11-03", 3000, { nijuu_betsu: b })],
      "2026-11",
      ["A社"]
    );
    expect(r3.kasanari["A社"].length).toBe(1);
    // 額を 直して 別の 額で 当たれば 効かない
    const r4 = N.hakkoMae(
      [meter("m1", "2026-11-02", 3500), te("t1", "2026-11-02", 3500, { nijuu_betsu: b })],
      "2026-11",
      ["A社"]
    );
    expect(r4.kasanari["A社"].length).toBe(1);
  });
});

describe("hakkoMae（料金が まだ 無い メーターの 行）", () => {
  it("空・null・0 で 料金も 無い は 出す／本当の 0円・手の 行の 空・月の 外は 出さない", () => {
    const r = N.hakkoMae(
      [
        meter("m1", "2026-11-02", ""),
        meter("m2", "2026-11-03", null),
        meter("m3", "2026-11-04", 0, { dk_meter_yen: 0 }), // 本当の 0円
        meter("m5", "2026-11-05", 0), // 0 で 料金（dk_meter_yen）も 無い＝前の 版の 一覧の 直しが 空を 0 に した 行
        meter("m6", "2026-11-06", 0, { ryokin_0_kimeta: true }), // 客が 一覧で 0 と 打った＝0円と 決めた
        te("t1", "2026-11-02", ""),
        meter("m4", "2026-10-31", ""),
      ],
      "2026-11",
      ["A社"]
    );
    expect(r.mitei.map((x) => x.id)).toEqual(["m1", "m2", "m5"]);
  });
});

describe("kasanariKagi（このまま 出す 印）", () => {
  it("組が 同じ なら 同じ・組が 変われば 違う・並びに 依らない", () => {
    const k1 = [
      { te: { id: "t1" }, meter: [{ id: "m1" }] },
      { te: { id: "t2" }, meter: [{ id: "m2" }] },
    ];
    const k2 = [
      { te: { id: "t2" }, meter: [{ id: "m2" }] },
      { te: { id: "t1" }, meter: [{ id: "m1" }] },
    ];
    expect(N.kasanariKagi("2026-11", "A社", k1)).toBe(N.kasanariKagi("2026-11", "A社", k2));
    expect(N.kasanariKagi("2026-11", "A社", k1)).not.toBe(
      N.kasanariKagi("2026-11", "A社", [{ te: { id: "t1" }, meter: [{ id: "m3" }] }])
    );
    expect(N.kasanariKagi("2026-11", "A社", k1)).not.toBe(N.kasanariKagi("2026-12", "A社", k1));
  });
});

describe("倉庫の 形と 画面の 形（対立役 注6）", () => {
  it("extra の 鍵の 順だけ 違う 行は 違い 0（jsonb は 鍵を 並べ替える）", () => {
    const gamen = {
      id: "1",
      company: "A社",
      date: "2026-11-02",
      amount: 3000,
      extra: { 車種: "x", dk_car: "1号", dk_car_no: 1 },
    };
    const kura = {
      amount: 3000,
      extra: { dk_car: "1号", 車種: "x", dk_car_no: 1 },
      date: "2026-11-02",
      company: "A社",
      id: "1",
    };
    const z = N.zureKazoeru(
      [{ id: "1", row: gamen, sig: N.shirushi(gamen) }],
      [{ id: "1", row: kura, sig: N.shirushi(kura) }]
    );
    expect(z.zenbu).toBe(0);
  });
});
