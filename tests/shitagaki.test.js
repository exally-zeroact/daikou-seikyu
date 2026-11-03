// @vitest-environment node
// ============================================================
// ★写真と声 → AI の 下書き（③）の 純粋な 部分★ 2026-11-03（司さん 11-02「人が 確かめて 保存した 時だけ 入る」）
//   守ること（設計前 対立役 3回）：
//   ・欄に 出す 値は「保存される 値」（"¥12,000-" が 0円に ならない）・直せない 字は 空＋「読めなかった」
//   ・どの 数を 金額に するかは AI に 決めさせない（候補が 2つ以上＝空＋人が 選ぶ）
//   ・年は 画面の 今日（引数）から 決める・伝票の 年の 字は 西暦に 直して 範囲を 見る
//   ・AI の 行は「確かめた」まで 保存しない／金額が 空の AI の 行は 保存しない
//   値は 全部 作り物（客の 物ではない）。
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const S = require("../lib/shitagaki.js");
const ME = require("../meisai-engine.js");

const ITEMS = ["日付", "行き先", "金額", "距離", "人数", "備考"];

describe("器の 名前は meisai-engine の FIELD_DEFS と 同じ", () => {
  it("日付・金額・数の 欄", () => {
    const keys = ME.FIELD_DEFS.map((f) => f.key);
    expect(keys).toContain(S.HIDUKE);
    expect(keys).toContain(S.KINGAKU);
    for (const k of Object.keys(S.KAZU)) {
      expect(keys).toContain(k);
      expect(ME.FIELD_DEFS.find((f) => f.key === k).type).toBe("number");
    }
  });
});

describe("数の 字 → 保存される 値（v1 止1）", () => {
  const ok = [
    ["¥12,000-", "sei", "12000"],
    ["￥12,000", "sei", "12000"],
    ["12,000円", "sei", "12000"],
    ["１２，０００", "sei", "12000"],
    ["12000.-", "sei", "12000"],
    ["3,500円-", "sei", "3500"],
    [" 2 ", "sei", "2"],
    ["007", "sei", "7"],
    ["12.5km", "shousuu", "12.5"],
    ["1,234.5", "shousuu", "1234.5"],
    ["", "sei", ""],
  ];
  for (const [ji, kind, v] of ok) {
    it(`${JSON.stringify(ji)} → ${JSON.stringify(v)}`, () => {
      expect(S.suujiNaosu(ji, kind)).toEqual({ ok: true, v });
    });
  }
  const dame = [
    ["△500", "sei"],
    ["-500", "sei"],
    ["▲1,000", "sei"],
    ["1万2千", "sei"],
    ["1.200", "sei"], // 桁区切りかも
    ["1,2,3", "sei"],
    ["12,00", "sei"],
    ["12.5", "sei"], // 金額・人数は 整数
    ["約3000", "sei"],
    ["三千", "sei"],
  ];
  for (const [ji, kind] of dame) {
    it(`${JSON.stringify(ji)} は 直さない（人が 打つ）`, () => {
      expect(S.suujiNaosu(ji, kind)).toEqual({ ok: false, v: "" });
    });
  }
  it("★保存の 式（数字以外を 消す）に 通しても 同じ 数★＝0円・桁違いに ならない", () => {
    for (const [ji, kind, v] of ok) {
      if (!v) continue;
      const r = S.suujiNaosu(ji, kind).v;
      expect(Number(r.replace(/[^\d.]/g, ""))).toBe(Number(v));
    }
  });
});

describe("年の 字 → 西暦（v3 注1）", () => {
  const ok = [
    ["2026年", 2026],
    ["2026", 2026],
    ["令和8年", 2026],
    ["R8年", 2026],
    ["r8", 2026],
    ["R.8", 2026],
    ["令和元年", 2019],
    ["'26", 2026],
    ["’26", 2026],
    ["２０２６年", 2026],
    ["26", 2026],
    ["8", 2026],
    ["", null],
  ];
  for (const [ji, nen] of ok) {
    it(`${JSON.stringify(ji)} → ${nen}`, () => {
      expect(S.nenNaosu(ji)).toEqual({ ok: true, nen });
    });
  }
  for (const ji of ["H30", "平成30年", "S60", "昭和60", "二〇二六", "20266"]) {
    it(`${JSON.stringify(ji)} は 読めない（推しの 道へ 落とさない）`, () => {
      expect(S.nenNaosu(ji)).toEqual({ ok: false, nen: null });
    });
  }
});

describe("日付を 決める（kyou は 引数・時計を 読まない・v3 止A 止B 注2）", () => {
  it("kyou=2027-01-01・伝票 1/1・年なし → 2027-01-01（推した印）", () => {
    expect(S.kimeruHi("", "1", "1", "2027-01-01")).toEqual({
      hi: "2027-01-01",
      suishita: true,
      tooi: false,
      wake: null,
    });
  });
  it("kyou=2026-12-31・伝票 1/1・年なし → 2026-01-01（60日より 離れた 印）", () => {
    expect(S.kimeruHi("", "1", "1", "2026-12-31")).toEqual({
      hi: "2026-01-01",
      suishita: true,
      tooi: true,
      wake: null,
    });
  });
  it("kyou=2026-11-03・伝票 12/1・年なし → 今日より 後なので 前の 年 2025-12-01", () => {
    const r = S.kimeruHi("", "12", "1", "2026-11-03");
    expect(r.hi).toBe("2025-12-01");
    expect(r.suishita).toBe(true);
  });
  it("今日 そのもの・年なし → 今年", () => {
    expect(S.kimeruHi("", "11月", "３日", "2026-11-03").hi).toBe("2026-11-03");
  });
  it("「11月」「３日」の 字 も 読む", () => {
    const r = S.kimeruHi("令和8年", "11月", "３日", "2026-11-05");
    expect(r).toEqual({ hi: "2026-11-03", suishita: false, tooi: false, wake: null });
  });
  it("年が 在っても 60日より 離れたら 印", () => {
    expect(S.kimeruHi("2026", "6", "1", "2026-11-03").tooi).toBe(true);
  });
  it("月 13 は 読めない", () => {
    const r = S.kimeruHi("", "13", "1", "2026-11-03");
    expect(r.hi).toBe("");
    expect(r.wake).toMatch(/月が 1〜12/);
  });
  it("日 0 は 無い日", () => {
    const r = S.kimeruHi("", "11", "0", "2026-11-03");
    expect(r.hi).toBe("");
    expect(r.wake).toMatch(/無い 日/);
  });
  it("2/30 は 無い日（元の字を 訳に 残す）", () => {
    const r = S.kimeruHi("2026", "2", "30", "2026-03-10");
    expect(r.hi).toBe("");
    expect(r.wake).toMatch(/無い 日/);
    expect(r.wake).toMatch(/元の字：2026 2 30/);
  });
  it("平成の 年は 読めない", () => {
    expect(S.kimeruHi("H30", "1", "1", "2026-11-03").hi).toBe("");
  });
  it("年が 今の 年 −2〜+1 の 外", () => {
    expect(S.kimeruHi("2023", "1", "1", "2026-11-03").hi).toBe("");
    expect(S.kimeruHi("2024", "1", "1", "2026-11-03").hi).toBe("2024-01-01");
    expect(S.kimeruHi("2028", "1", "1", "2026-11-03").hi).toBe("");
  });
  it("何も 無い → 日付が 見つからない", () => {
    expect(S.kimeruHi("", "", "", "2026-11-03").wake).toMatch(/見つかりません/);
  });
  it("月だけ → 読めない", () => {
    expect(S.kimeruHi("", "11", "", "2026-11-03").hi).toBe("");
  });
  it("kyou が 形 違い → 空", () => {
    expect(S.kimeruHi("", "1", "1", "2026/1/1").hi).toBe("");
    expect(S.kimeruHi("", "1", "1", undefined).hi).toBe("");
  });
});

describe("項目の 門と schema（v2 注4）", () => {
  it("鍵は k0〜kN（日付は 除く）", () => {
    expect(S.kagiNo(ITEMS).map((x) => x.kagi)).toEqual(["k1", "k2", "k3", "k4", "k5"]);
  });
  it("schema：値は 全部 string・additionalProperties false・null と union を 使わない", () => {
    const sc = S.schemaTsukuru(ITEMS);
    const g = sc.properties.gyou.items;
    expect(g.additionalProperties).toBe(false);
    expect(sc.additionalProperties).toBe(false);
    for (const k of ["hi_nen", "hi_tsuki", "hi_hi", "k1", "k2", "k3", "k4", "k5"]) {
      expect(g.properties[k]).toEqual({ type: "string" });
      expect(g.required).toContain(k);
    }
    expect(g.properties.kingaku_kouho.type).toBe("array");
    const s = JSON.stringify(sc);
    expect(s).not.toMatch(/"null"|anyOf|oneOf/);
  });
  it("金額・日付が 無い 会社は 候補・年月日の 鍵を 出さない", () => {
    const g = S.schemaTsukuru(["行き先", "名前"]).properties.gyou.items;
    expect(Object.keys(g.properties)).toEqual(["k0", "k1"]);
  });
  it("koumokuMon：数・重なり・名前の 形", () => {
    expect(S.koumokuMon(ITEMS, ITEMS)).toBe(null);
    expect(S.koumokuMon([], [])).toMatch(/数/);
    const many = Array.from({ length: 21 }, (_, i) => "x" + i);
    expect(S.koumokuMon(many, many)).toMatch(/数/);
    expect(S.koumokuMon(["金額", "金額"], ["a", "b"])).toMatch(/重なって/);
    expect(S.koumokuMon(["金額"], ["a", "b"])).toMatch(/名前/);
    expect(S.koumokuMon(["金額"], [""])).toMatch(/名前/);
    expect(S.koumokuMon("金額", "金額")).toMatch(/数/);
  });
  it("頼みの 字に 鍵と 表示名が 出る", () => {
    const t = S.tanomiNoJi(ITEMS, ["日", "行先", "料金", "km", "人", "メモ"], "作り物商事");
    expect(t).toMatch(/作り物商事/);
    expect(t).toMatch(/k2 ＝ 料金/);
    expect(t).toMatch(/hi_nen \/ hi_tsuki \/ hi_hi ＝ 日/);
    expect(t).toMatch(/kingaku_kouho ＝ 料金/);
  });
});

describe("kensa（口で 見る 形だけ）", () => {
  it("知らない 鍵を 捨て・字で ない 物は 空・余白を 切る", () => {
    const r = S.kensa(
      {
        gyou: [
          {
            hi_nen: "",
            hi_tsuki: "11",
            hi_hi: "3",
            k1: " 駅 ",
            k2: 3000,
            k99: "x",
            kingaku_kouho: [{ ji: "合計", atai: "3,000" }, { atai: 5 }],
          },
        ],
        yomenai: [],
        kaisha_no_ji: " 作り物商事 ",
      },
      ITEMS
    );
    expect(r.ok).toBe(true);
    const g = r.kekka.gyou[0];
    expect(g.k1).toBe("駅");
    expect(g.k2).toBe("");
    expect(g.k99).toBeUndefined();
    // 字で ない 候補も 捨てない（捨てると 残りの 1つが 金額に 入る＝対立役 止1）
    expect(g.kingaku_kouho).toEqual([
      { ji: "合計", atai: "3,000" },
      { ji: "", atai: "(字でない値)" },
    ]);
    expect(r.kekka.kaisha_no_ji).toBe("作り物商事");
  });
  it("形 違い・行が 多すぎる", () => {
    expect(S.kensa(null, ITEMS).ok).toBe(false);
    expect(S.kensa({ gyou: "x" }, ITEMS).ok).toBe(false);
    expect(S.kensa({ gyou: Array.from({ length: 101 }, () => ({})) }, ITEMS).ok).toBe(false);
    expect(S.kensa({ gyou: Array.from({ length: 100 }, () => ({})) }, ITEMS).ok).toBe(true);
  });
  it("yomenai：在る 行・知っている 鍵 だけ", () => {
    const r = S.kensa(
      {
        gyou: [{}],
        yomenai: [
          { gyou: 0, koumoku: "k2", wake: "にじんで 読めない" },
          { gyou: 1, koumoku: "k2", wake: "x" },
          { gyou: 0.5, koumoku: "k2", wake: "x" },
          { gyou: 0, koumoku: "kk", wake: "x" },
          { gyou: 0, koumoku: "hi", wake: 3 },
        ],
      },
      ITEMS
    );
    expect(r.kekka.yomenai).toEqual([
      { gyou: 0, koumoku: "k2", wake: "にじんで 読めない" },
      { gyou: 0, koumoku: "hi", wake: "" },
    ]);
  });
  it("長い 字は 切る", () => {
    const r = S.kensa({ gyou: [{ k1: "あ".repeat(500) }], yomenai: [], kaisha_no_ji: "" }, ITEMS);
    expect(r.kekka.gyou[0].k1.length).toBe(200);
  });
});

function kekka1(g, yomenai) {
  return S.kensa({ gyou: [g], yomenai: yomenai || [], kaisha_no_ji: "" }, ITEMS).kekka;
}

describe("gamenGyou（口の 返事 → 入力の 行・保存は しない）", () => {
  const KYOU = "2026-11-03";
  it("数は 保存される 値に・印が 付く・確かめた は false", () => {
    const rows = S.gamenGyou(
      kekka1({
        hi_nen: "",
        hi_tsuki: "11",
        hi_hi: "1",
        k1: "駅",
        k2: "¥3,000-",
        k3: "12.5km",
        k4: "2",
        k5: "",
        kingaku_kouho: [{ ji: "合計", atai: "¥3,000-" }],
      }),
      ITEMS,
      KYOU,
      "作り物商事",
      "shashin"
    );
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r).toMatchObject({
      日付: "2026-11-01",
      行き先: "駅",
      金額: "3000",
      距離: "12.5",
      人数: "2",
      _ai: "shashin",
      _kakunin: false,
      _kaisha: "作り物商事",
    });
    expect(r._yomenai).toEqual({});
    expect(r._toshi).toBe(true); // 年を 推した
  });
  it("直せない 数 → 空＋元の字", () => {
    const r = S.gamenGyou(
      kekka1({ hi_tsuki: "11", hi_hi: "1", k2: "△500", k4: "二人" }),
      ITEMS,
      KYOU,
      "c",
      "koe"
    )[0];
    expect(r.金額).toBe("");
    expect(r.人数).toBe("");
    expect(r._yomenai.金額).toMatch(/元の字：△500/);
    expect(r._yomenai.人数).toMatch(/元の字：二人/);
    expect(r._ai).toBe("koe");
  });
  it("AI が 読めないと 言った 欄は 値が 在っても 空", () => {
    const r = S.gamenGyou(
      kekka1({ hi_nen: "2026", hi_tsuki: "11", hi_hi: "1", k1: "推した 駅", k2: "3000" }, [
        { gyou: 0, koumoku: "k1", wake: "にじみ" },
        { gyou: 0, koumoku: "hi_hi", wake: "かすれ" },
      ]),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.行き先).toBe("");
    expect(r._yomenai.行き先).toBe("にじみ");
    expect(r.日付).toBe("");
    expect(r._yomenai.日付).toBe("かすれ");
    expect(r.金額).toBe("3000");
  });
  it("★候補が 2つ以上 → 金額は 空・人が 選ぶ★", () => {
    const r = S.gamenGyou(
      kekka1({
        hi_tsuki: "11",
        hi_hi: "1",
        k2: "",
        kingaku_kouho: [
          { ji: "基本", atai: "3,000" },
          { ji: "高速", atai: "800" },
          { ji: "合計", atai: "3,800" },
          { ji: "値引", atai: "△200" },
        ],
      }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.金額).toBe("");
    expect(r._kouho).toEqual([
      { ji: "基本", atai: "3000" },
      { ji: "高速", atai: "800" },
      { ji: "合計", atai: "3800" },
    ]);
    expect(r._yomenai.金額).toContain("元の字：値引 △200");
  });
  it("★AI が 金額の 欄に 1つ 入れても 候補と 食い違えば 人が 選ぶ★", () => {
    const r = S.gamenGyou(
      kekka1({
        hi_tsuki: "11",
        hi_hi: "1",
        k2: "5000",
        kingaku_kouho: [{ ji: "合計", atai: "3000" }],
      }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.金額).toBe("");
    expect(r._kouho.map((c) => c.atai).sort()).toEqual(["3000", "5000"]);
  });
  it("候補が 1つで 金額の 欄が 空 → その 1つ", () => {
    const r = S.gamenGyou(
      kekka1({
        hi_tsuki: "11",
        hi_hi: "1",
        k2: "",
        kingaku_kouho: [{ ji: "料金", atai: "4,200円" }],
      }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.金額).toBe("4200");
    expect(r._kouho).toEqual([]);
  });
  it("候補が 同じ 数 2つ（見出し違い）→ 1つと 数える", () => {
    const r = S.gamenGyou(
      kekka1({
        hi_tsuki: "11",
        hi_hi: "1",
        k2: "3000",
        kingaku_kouho: [
          { ji: "小計", atai: "3000" },
          { ji: "合計", atai: "3,000" },
        ],
      }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.金額).toBe("3000");
  });
  it("金額が 読めない と 言われたら 候補 1つでも 入れない", () => {
    const r = S.gamenGyou(
      kekka1(
        { hi_tsuki: "11", hi_hi: "1", k2: "", kingaku_kouho: [{ ji: "料金", atai: "3000" }] },
        [{ gyou: 0, koumoku: "k2", wake: "にじみ" }]
      ),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.金額).toBe("");
  });
  it("候補の 値が 数で 無い 物は 出さない（v3 注A）", () => {
    const r = S.gamenGyou(
      kekka1({
        hi_tsuki: "11",
        hi_hi: "1",
        kingaku_kouho: [
          { ji: "a", atai: "<img src=x>" },
          { ji: "b", atai: "1万" },
        ],
      }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r._kouho).toEqual([]);
    expect(r.金額).toBe("");
  });
  // ★対立役（作った後）止1★ 読めない 候補を 黙って 捨てると 残りの 1つが 金額に 入る（小計 5000＋値引 -500 → 5000 で 500円 多い）
  const yomeruHitotsu = [
    [
      "小計＋値引",
      [
        { ji: "小計", atai: "5000" },
        { ji: "値引", atai: "-500" },
      ],
      "-500",
    ],
    [
      "単価＋合計（漢字）",
      [
        { ji: "単価", atai: "3,000" },
        { ji: "合計", atai: "1万2千円" },
      ],
      "1万2千円",
    ],
    [
      "▲の 値引",
      [
        { ji: "料金", atai: "4,000" },
        { ji: "割引", atai: "▲400" },
      ],
      "▲400",
    ],
  ];
  for (const [name, kouho, moto] of yomeruHitotsu) {
    it("★読める 候補 1つ＋読めない 候補 → 金額は 空・元の字を 出す（" + name + "）★", () => {
      const r = S.gamenGyou(
        kekka1({ hi_tsuki: "11", hi_hi: "1", k2: "", kingaku_kouho: kouho }),
        ITEMS,
        KYOU,
        "c",
        "shashin"
      )[0];
      expect(r.金額).toBe("");
      expect(r._yomenai.金額).toContain(moto);
      expect(r._kouho.length).toBe(1); // 読めた 物は 釦で 選べる
      expect(S.hozonMon([Object.assign(r, { _kakunin: true })], ITEMS)).toMatch(/金額が 空/);
    });
  }
  it("★字で ない 候補（kensa を 通った 物）も 読めない 候補と 数える★", () => {
    const k = S.kensa(
      {
        gyou: [
          {
            hi_tsuki: "11",
            hi_hi: "1",
            k2: "",
            kingaku_kouho: [
              { ji: "合計", atai: "3,000" },
              { ji: "x", atai: 5 },
            ],
          },
        ],
        yomenai: [],
        kaisha_no_ji: "",
      },
      ITEMS
    ).kekka;
    const r = S.gamenGyou(k, ITEMS, KYOU, "c", "shashin")[0];
    expect(r.金額).toBe("");
  });
  it("金額の 欄の 数＋読めない 候補 → 空", () => {
    const r = S.gamenGyou(
      kekka1({
        hi_tsuki: "11",
        hi_hi: "1",
        k2: "5000",
        kingaku_kouho: [{ ji: "値引", atai: "△500" }],
      }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.金額).toBe("");
  });
  // ★対立役（作った後）注1★ 年が 書いてあっても 今日より 先の 日付は 印（11 を 12 と 読み違えた）
  it("年が 在って 今日より 先の 日付 → 年を 確かめて の 印", () => {
    const r = S.gamenGyou(
      kekka1({ hi_nen: "2026", hi_tsuki: "12", hi_hi: "25", k2: "1" }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r.日付).toBe("2026-12-25");
    expect(r._toshi).toBe(true);
  });
  it("年が 在って 今日より 前・60日 以内 → 印 なし", () => {
    const r = S.gamenGyou(
      kekka1({ hi_nen: "2026", hi_tsuki: "10", hi_hi: "25", k2: "1" }),
      ITEMS,
      KYOU,
      "c",
      "shashin"
    )[0];
    expect(r._toshi).toBe(false);
  });
  it("0 行 → 0 行", () => {
    expect(S.gamenGyou({ gyou: [], yomenai: [] }, ITEMS, KYOU, "c", "shashin")).toEqual([]);
  });
});

describe("中身の 判定・足し方（v2 注2・v3 注D）", () => {
  it("日付だけの 行は 中身 無し", () => {
    expect(S.gyouNiNakamiAri({ 日付: "2026-11-01", 金額: "" }, ITEMS)).toBe(false);
    expect(S.gyouNiNakamiAri({ 日付: "", 金額: "0" }, ITEMS)).toBe(true);
    expect(S.gyouNiNakamiAri({ 備考: "  " }, ITEMS)).toBe(false);
  });
  it("後ろの 空の 行（日付だけ 含む）を 除いて 足す・打ちかけは 残す", () => {
    const a = { 日付: "2026-11-01", 行き先: "駅" };
    const kara = { 日付: "2026-11-01" };
    const ai = { _ai: "shashin", 金額: "1" };
    expect(S.tsuika([a, kara, {}], [ai], ITEMS)).toEqual([a, ai]);
    expect(S.tsuika([kara], [ai], ITEMS)).toEqual([ai]);
    expect(S.tsuika([kara, a], [ai], ITEMS)).toEqual([kara, a, ai]);
  });
  it("前の AI の 行（空でも）は 消さない", () => {
    const ai0 = { _ai: "koe" };
    expect(S.tsuika([ai0], [{ _ai: "koe" }], ITEMS).length).toBe(2);
  });
});

describe("★保存の 門（hozonMon）★", () => {
  const te = { 日付: "2026-11-01", 金額: "" }; // 手で 打った 行は 門の 外（今の 保存と 同じ）
  const ai = (o) =>
    Object.assign(
      { _ai: "shashin", _kakunin: false, _yomenai: {}, 日付: "2026-11-01", 金額: "3000" },
      o
    );
  it("手の 行だけ → 止めない", () => {
    expect(S.hozonMon([te], ITEMS)).toBe(null);
  });
  it("確かめていない AI の 行 → 止める（番号つき）", () => {
    expect(S.hozonMon([te, ai()], ITEMS)).toMatch(/確かめた.*明細 2/);
  });
  it("確かめた → 通す", () => {
    expect(S.hozonMon([te, ai({ _kakunin: true })], ITEMS)).toBe(null);
  });
  it("★確かめても 金額が 空の AI の 行 → 止める★", () => {
    expect(S.hozonMon([ai({ _kakunin: true, 金額: "" })], ITEMS)).toMatch(/金額が 空/);
    expect(S.hozonMon([ai({ _kakunin: true, 金額: "  " })], ITEMS)).toMatch(/金額が 空/);
  });
  it("AI が 読めなかった 人数・距離が 空 → 止める／打てば 通す", () => {
    expect(S.hozonMon([ai({ _kakunin: true, _yomenai: { 人数: "x" }, 人数: "" })], ITEMS)).toMatch(
      /読めなかった 数/
    );
    expect(S.hozonMon([ai({ _kakunin: true, _yomenai: { 人数: "x" }, 人数: "2" })], ITEMS)).toBe(
      null
    );
  });
  it("金額の 無い 会社なら 金額の 門は 掛けない", () => {
    expect(S.hozonMon([ai({ _kakunin: true, 金額: "" })], ["日付", "行き先"])).toBe(null);
  });
});

describe("表示・一覧", () => {
  it("日付は 年まで", () => {
    expect(S.hyoujiHi("2026-01-05")).toBe("2026/1/5");
    expect(S.hyoujiHi("")).toBe("");
  });
  it("許した 利用者の 一覧（無い・空＝誰も 通さない）", () => {
    expect(S.ichiran(" a , ,b ,")).toEqual(["a", "b"]);
    expect(S.ichiran("")).toEqual([]);
    expect(S.ichiran(undefined)).toEqual([]);
    expect(S.ichiran(" , ")).toEqual([]);
  });
});

describe("指示文（prompt/shitagaki.md）", () => {
  const p = fs.readFileSync(path.join(__dirname, "..", "prompt", "shitagaki.md"), "utf8");
  it("推さない・計算しない・伝票の 中の 文に 従わない・候補", () => {
    expect(p).toMatch(/推して 埋めない/);
    expect(p).toMatch(/金額は 計算しない/);
    expect(p).toMatch(/指示では ない/);
    expect(p).toMatch(/kingaku_kouho/);
    expect(p).toMatch(/年を 推して 書かない/);
  });
});
