// @vitest-environment node
// ============================================================
// ★請求書を 出す 前の 見張り★ 2026-11-04（lib/nijuu.js zureKazoeru・hakkoMae）
//   守ること：倉庫と 画面の 違いを 数える（足す・直す・消す・画面の 中の 同じ id の 2重）／
//   鍵の 順だけ 違う 物は 違いに しない（jsonb は 鍵を 並べ替える）／この 紙の 材料に 触れる 物だけ 数える／
//   料金が 空の メーターの 行は 止める（0円は 止めない）／
//   ★手の 行 × メーターの 行の「同じ 乗車かも」は 見ない★（2026-11-04 夜 外した・司さん「いちいち 出すなや」）
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

describe("hakkoMae（手と メーターの 重なりは 見ない）", () => {
  it("同じ 会社・同じ日・同じ 額の 手と メーターでも 何も 返さない（返すのは mitei だけ）", () => {
    const r = N.hakkoMae(
      [
        meter("m1", "2026-11-02", 3000),
        te("t1", "2026-11-02", 3000),
        te("t2", "2026-11-03", 3000),
        meter("m2", "2026-10-31", 3000),
        te("t3", "2026-11-01", 3000),
      ],
      "2026-11",
      ["A社"]
    );
    expect(r).toEqual({ mitei: [] });
  });
  it("倉庫に 古い「別の 乗車」の 印（nijuu_betsu）が 残った 手の 行も 何も 返さない", () => {
    const b = { ids: ["m9"], date: "2026-10-01", amount: 1 };
    const r = N.hakkoMae(
      [meter("m1", "2026-11-02", 3000), te("t1", "2026-11-02", 3000, { nijuu_betsu: b })],
      "2026-11",
      ["A社"]
    );
    expect(r).toEqual({ mitei: [] });
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
