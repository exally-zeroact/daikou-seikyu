// @vitest-environment node
// ============================================================
// ★入金の 回の 数え方を lib/nyukin-kai.js へ 移した（2026-11-03・外から読む口と 画面が 同じ 物を 使う）★
//   守ること：移す 前（a11687f の html の 本文＝tests/fixtures/nyukin-kai-mae.js）と ★出しが 1つも 変わらない★
//   ・画面と 口が 同じ 関数を 呼ぶ だけでは「同じ 物どうし」で 必ず 緑になる＝旧の 写しと 比べる（対立役 v2 注5）
//   ・倉庫の 行 → rec の 写し（payRecFromDb）も 比べる（日が created_at や 月の 1日に 化ける 所）
//   ・回の gaku の 和 ＝ max(0, round(paid))（entriesOf の 作りから 必ず 成り立つ）
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
const require = createRequire(import.meta.url);
const L = require("../lib/nyukin-kai.js");
const M = require("./fixtures/nyukin-kai-mae.js");

// 倉庫の 行の 作り物（値は 作り物・客の 物ではない）
const DB_ROWS = [
  {
    id: "a",
    user_id: "u",
    paid: 1000,
    paid_date: "2026-10-05",
    created_at: "2026-10-05T01:00:00Z",
    entries: null,
    memo: "",
  },
  {
    id: "b",
    user_id: "u",
    paid: 1000,
    paid_date: "2026-10-05",
    created_at: "2026-10-01T00:00:00Z",
    entries: [{ gaku: 600, hi: "2026-09-30" }],
    memo: "x",
  },
  {
    id: "c",
    user_id: "u",
    paid: 500,
    paid_date: "2026-10-05",
    created_at: null,
    entries: [
      { gaku: 600, hi: "2026-09-30" },
      { gaku: 400, hi: "2026-10-05" },
    ],
  },
  {
    id: "d",
    user_id: "u",
    paid: 800,
    paid_date: null,
    created_at: "2026-08-20T00:00:00Z",
    entries: [
      { gaku: 0, hi: "2026-08-01" },
      { gaku: -5, hi: "2026-08-02" },
    ],
  },
  { id: "e", user_id: "u", paid: 800, paid_date: null, created_at: null, entries: [{ gaku: 800 }] },
  {
    id: "f",
    user_id: "u",
    paid: 3000,
    paid_date: "2026-11-03",
    created_at: "2026-11-03T00:00:00Z",
    entries: [{ gaku: 3000, hi: "2026-11-03", src: "csv:1:abc", tesuryo: 9999 }],
  },
  {
    id: "g",
    user_id: "u",
    paid: 0,
    paid_date: "2026-11-01",
    created_at: null,
    entries: [{ gaku: 700, hi: "2026-11-01" }],
  },
  {
    id: "h",
    user_id: "u",
    paid: 1234.6,
    paid_date: "2026-10-31",
    created_at: null,
    entries: "ちがう形",
  },
  { id: "i", user_id: "u", paid: null, paid_date: "", created_at: "", entries: null },
  {
    id: "j",
    user_id: "u",
    paid: 2000,
    paid_date: "2026-10-10",
    created_at: null,
    entries: [
      { gaku: 500, hi: "2026-09-01", tesuryo: 220 },
      { gaku: 1500, hi: "2026-10-01" },
    ],
  },
  // 1円の 差（足りない／多い）＝境目（壊し「sum < paid - 1」が 緑の まま 通った 穴を 塞ぐ）
  {
    id: "k",
    user_id: "u",
    paid: 1001,
    paid_date: "2026-10-20",
    created_at: null,
    entries: [{ gaku: 1000, hi: "2026-10-01" }],
  },
  {
    id: "l",
    user_id: "u",
    paid: 999,
    paid_date: "2026-10-20",
    created_at: null,
    entries: [{ gaku: 1000, hi: "2026-10-01" }],
  },
];
const TSUKI = ["2026-10", "2026-09", "2026-08", "", null];

describe("移す 前と 後で 出しが 同じ", () => {
  it("payRecFromDb", () => {
    for (const r of DB_ROWS) expect(L.payRecFromDb(r)).toStrictEqual(M.payRecFromDb(r));
  });
  it("entriesOf（倉庫の 行 → rec → 回）", () => {
    let n = 0;
    for (const r of DB_ROWS)
      for (const t of TSUKI) {
        expect(L.entriesOf(L.payRecFromDb(r), t)).toStrictEqual(M.entriesOf(M.payRecFromDb(r), t));
        n++;
      }
    expect(n).toBe(DB_ROWS.length * TSUKI.length);
  });
  it("entriesAtarashii・entriesKezuru・kaiTsukuru・hiDake", () => {
    const mae = [
      { gaku: 600, hi: "2026-09-30", src: "s" },
      { gaku: 400, hi: "2026-10-05", tesuryo: 110 },
    ];
    for (const np of [0, 300, 999, 1000, 1500, -1, "abc"])
      for (const hk of [true, false])
        expect(L.entriesAtarashii(mae, np, "2026-11-01", hk)).toStrictEqual(
          M.entriesAtarashii(mae, np, "2026-11-01", hk)
        );
    expect(L.entriesKezuru(mae.slice(), 700)).toStrictEqual(M.entriesKezuru(mae.slice(), 700));
    expect(L.kaiTsukuru({ tesuryo: 50.4, src: "" }, 30, "2026-01-01")).toStrictEqual(
      M.kaiTsukuru({ tesuryo: 50.4, src: "" }, 30, "2026-01-01")
    );
    for (const s of ["2026-10-05T09:00", "2026-10", "", null, "10/05"])
      expect(L.hiDake(s)).toBe(M.hiDake(s));
  });
});

describe("回の 和 ＝ 記録した 額（正は paid）", () => {
  it("どの 行でも 回の gaku の 和 ＝ max(0, round(paid))", () => {
    for (const r of DB_ROWS) {
      const rec = L.payRecFromDb(r);
      const sum = L.entriesOf(rec, "2026-10").reduce((t, e) => t + e.gaku, 0);
      expect(sum).toBe(Math.max(0, Math.round(Number(r.paid) || 0)));
    }
  });
});

describe("画面が lib を 使っている", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "daikou-seikyu.html"), "utf8");
  it("lib/nyukin-kai.js を 読み込む 札が 1つ・keshikomi の 後", () => {
    const tags = html.match(/<script src="lib\/nyukin-kai\.js"><\/script>/g) || [];
    expect(tags.length).toBe(1);
    expect(html.indexOf("lib/nyukin-kai.js")).toBeGreaterThan(html.indexOf("lib/keshikomi.js"));
  });
  it("html に 本体の 式が 残っていない（2か所に 書かない）", () => {
    for (const n of [
      "payRecFromDb",
      "hiDake",
      "kaiTsukuru",
      "entriesKezuru",
      "entriesOf",
      "entriesAtarashii",
    ]) {
      const defs = html.match(new RegExp("function " + n + "\\(", "g")) || [];
      expect(defs.length, n).toBe(1);
      expect(html, n).toContain("return NyukinKai." + n + "(");
    }
  });
});
