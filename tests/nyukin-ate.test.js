"use strict";
// ============================================================
// ★入金の 当て方（lib/nyukin-ate.js）★ 2026-11-13 ⑥件B（設計 sekkei_6_kotoba 件B v0・v0.1）
//   守ること：
//   ①手で 数えた 例と 1円も 違わない（繰越あり＝古い 月から・払い過ぎ・0円の 月・マイナスの 月／繰越なし）
//   ②画面の 数が 変わらない：直す 前の seikyuList・payStatusOf（fixtures/nyukin-ate-mae.json＝3066ca4 の html の 字）と
//     今の html の seikyuList・payStatusOf を、作り物の 明細・入金 N 通りで 動かして 全部 一致
//   ③口の minyukin＝画面の summarize と 同じ 行・同じ 並び・同じ 額（全期間で 当ててから 月・会社で 絞る）
//   ④同じ (月, 会社) の 入金が 2行＝502（黙って 片方を 捨てない）
//   値は 全部 作り物。
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const NA = require("../lib/nyukin-ate.js");
const ME = require("../meisai-engine.js");
const NK = require("../lib/nyukin-kai.js");
const YK = require("../lib/yomu-kuchi.js");
const MAE = require("./fixtures/nyukin-ate-mae.json");
const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")),
  ".."
);
const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

// html から 関数を 1つ 字の まま 取る（{ } の 数で 終わりを 見る）
function toru(src, mae) {
  const a = src.indexOf(mae);
  if (a < 0) throw new Error("見つからない：" + mae);
  let d = 0;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(a, i + 1);
  }
  throw new Error("閉じない：" + mae);
}
const IMA = {
  seikyuList: toru(HTML, "function seikyuList(month, opt) {"),
  payStatusOf: toru(HTML, "function payStatusOf(total, paid) {"),
};

// 画面の 関数を 作り物の DB・MASTER・PAYMENTS の 上で 動かす
function gamen(fns, w) {
  const f = new Function(
    "MeisaiEngine",
    "NyukinAte",
    "DB",
    "CURRENT_ACCOUNT",
    "MASTER",
    "PAYMENTS",
    "kietaTsuki",
    "function payKeyFor(m, c) { return CURRENT_ACCOUNT + '::' + m + '::' + c; }\n" +
      "function payRecord(m, c) { return PAYMENTS[payKeyFor(m, c)] || { paid: 0, paidDate: '', note: '' }; }\n" +
      fns.seikyuList +
      "\n" +
      fns.payStatusOf +
      "\nreturn { seikyuList: seikyuList, payStatusOf: payStatusOf };"
  );
  return f(ME, NA, w.DB, "u", w.MASTER, w.PAYMENTS, () => []);
}

// 倉庫の 生の 行（moto）→ 画面の DB・MASTER・PAYMENTS（画面の 読み込みと 同じ 写し方）
function gamenNoKata(moto) {
  const DB = moto.meisai.map((r) => ({
    account_id: "u",
    会社名: r.company,
    日付: r.date || "",
    金額: r.amount == null ? "" : r.amount,
  }));
  const MASTER = {};
  moto.kaisha.forEach((c) => {
    MASTER[c.name] = { carryover: !!c.carryover, taxMode: c.taxMode === "外税" ? "外税" : "内税" };
  });
  const PAYMENTS = {};
  moto.nyukin.forEach((r) => {
    PAYMENTS["u::" + r.month + "::" + r.company] = NK.payRecFromDb(r);
  });
  return { DB, MASTER, PAYMENTS };
}

// 画面の summarize（html 13148〜）と 同じ 行
function summarizeGyo(g) {
  const LABEL = { unpaid: "未入金", partial: "一部入金", paid: "入金済" };
  return g.seikyuList(null).map((iv) => ({
    月: iv.month,
    会社名: iv.company,
    件数: iv.count,
    "今月分（税込）": iv.total,
    入金: iv.paid,
    記録した入金: iv.paidKiroku,
    残額: iv.total - iv.paid,
    状態: LABEL[g.payStatusOf(iv.total, iv.paid)],
  }));
}

// 作り物の 倉庫の 答えを 種から 作る（会社3・月 2026-01〜06・繰越あり/なし・外税/内税・0円・マイナス・払い過ぎ）
function tsukuri(tane) {
  let x = tane >>> 0; // mulberry32
  const rnd = (n) => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const KA = ["甲", "乙", "丙"];
  const kaisha = KA.map((name) => ({
    name,
    carryover: rnd(2) === 1,
    taxMode: rnd(2) ? "外税" : null,
  }));
  const meisai = [];
  const nyukin = [];
  let id = 0;
  KA.forEach((co) => {
    for (let m = 1; m <= 6; m++) {
      const tsuki = "2026-0" + m;
      const n = rnd(4); // 0 件の 月も
      for (let i = 0; i < n; i++) {
        const kind = rnd(10);
        const amount = kind === 0 ? 0 : kind === 1 ? -(rnd(3000) + 1) : rnd(20000) + 1;
        meisai.push({ id: String(++id), company: co, date: tsuki + "-1" + i, amount });
      }
      if (rnd(3) > 0) {
        const kind = rnd(5);
        const paid = kind === 0 ? 0 : kind === 1 ? 50000 : rnd(25000);
        nyukin.push({
          id: "p" + ++id,
          month: tsuki,
          company: co,
          paid,
          paid_date: tsuki + "-28",
          created_at: tsuki + "-28T00:00:00Z",
          entries: null,
        });
      }
    }
  });
  return { meisai, kaisha, nyukin, bango: [] };
}

describe("① lib/nyukin-ate.js 手で 数えた 例", () => {
  it("繰越あり：古い 月から 請求額 いっぱいまで・余りは 一番 新しい 月・0円と マイナスの 月は 当てない", () => {
    const all = [
      { month: "2026-03", company: "甲", total: 10000, paidKiroku: 0 },
      { month: "2026-01", company: "甲", total: 6000, paidKiroku: 4000 },
      { month: "2026-02", company: "甲", total: 0, paidKiroku: 0 },
      { month: "2026-04", company: "甲", total: -500, paidKiroku: 0 },
      { month: "2026-05", company: "甲", total: 3000, paidKiroku: 20000 },
    ];
    NA.ateru(all, (co) => co === "甲");
    // pool＝24000：1月 6000→ 18000・2月 0・3月 10000→ 8000・4月 max(-500,0)=0・5月（最後）に 残り 8000
    expect(all.map((x) => [x.month, x.paid])).toEqual([
      ["2026-03", 10000],
      ["2026-01", 6000],
      ["2026-02", 0],
      ["2026-04", 0],
      ["2026-05", 8000],
    ]);
    expect(all.map((x) => x.paidKiroku)).toEqual([0, 4000, 0, 0, 20000]); // 記録は 書き換えない
  });
  it("繰越あり：足りない 時は 古い 月から 埋まり 新しい 月が 未入金", () => {
    const all = [
      { month: "2026-01", company: "甲", total: 5000, paidKiroku: 0 },
      { month: "2026-02", company: "甲", total: 5000, paidKiroku: 7000 },
      { month: "2026-03", company: "甲", total: 5000, paidKiroku: 0 },
    ];
    NA.ateru(all, () => true);
    expect(all.map((x) => x.paid)).toEqual([5000, 2000, 0]);
    expect(all.map((x) => NA.jotai(x.total, x.paid))).toEqual(["paid", "partial", "unpaid"]);
  });
  it("繰越なし：記録した 月の 額の まま（払い過ぎも そのまま）", () => {
    const all = [
      { month: "2026-01", company: "乙", total: 5000, paidKiroku: 9000 },
      { month: "2026-02", company: "乙", total: 5000, paidKiroku: 0 },
    ];
    NA.ateru(all, () => false);
    expect(all.map((x) => x.paid)).toEqual([9000, 0]);
  });
  it("状態：0円は 入金済・マイナスの 入金は 未入金・同額は 入金済", () => {
    expect(NA.jotai(0, 0)).toBe("paid");
    expect(NA.jotai(-100, 0)).toBe("paid");
    expect(NA.jotai(0, -1)).toBe("unpaid");
    expect(NA.jotai(1000, 0)).toBe("unpaid");
    expect(NA.jotai(1000, 999)).toBe("partial");
    expect(NA.jotai(1000, 1000)).toBe("paid");
    expect(NA.jotai(1000, 1001)).toBe("paid");
  });
});

describe("② 画面の 数が 変わらない（直す 前の html の 字 と 今の html）", () => {
  it("前の 写しは 字の まま 取れていて、今の html は lib を 呼ぶ", () => {
    expect(MAE.seikyuList).toContain("var byCo = {};");
    expect(MAE.seikyuList).not.toContain("NyukinAte");
    expect(IMA.seikyuList).toContain("NyukinAte.ateru");
    expect(IMA.payStatusOf).toContain("NyukinAte.jotai");
    expect(HTML).toMatch(
      /<script src="lib\/nyukin-kai\.js"><\/script>\s*<script src="lib\/nyukin-ate\.js"><\/script>/
    );
  });
  it("作り物 200 通りで seikyuList(全部・月ごと)・状態が 全部 一致", () => {
    let gyosu = 0;
    for (let tane = 1; tane <= 200; tane++) {
      const moto = tsukuri(tane);
      const mae = gamen(MAE, gamenNoKata(moto));
      const ima = gamen(IMA, gamenNoKata(moto));
      const a = mae.seikyuList(null);
      expect(ima.seikyuList(null)).toEqual(a);
      expect(ima.seikyuList("2026-03")).toEqual(mae.seikyuList("2026-03"));
      expect(summarizeGyo(ima)).toEqual(summarizeGyo(mae));
      gyosu += a.length;
    }
    expect(gyosu).toBeGreaterThan(1000); // 空の 比べで 緑に しない
  });
});

describe("③ 口の minyukin＝画面の summarize と 同じ", () => {
  const kuchi = (moto, kara, made, kaisha) => {
    const t = YK.tsukuru(moto, "minyukin", kara || "", made || "", kaisha || null);
    expect(t.error).toBeUndefined();
    return t.gyo.map((g) => {
      const o = Object.fromEntries(t.midashi.map((k, i) => [k, g[i]]));
      delete o.繰越を使う;
      return o;
    });
  };
  it("作り物 200 通りで 全行・全列・並びが 一致（直す 前の 画面と）", () => {
    let kurikoshi = 0;
    for (let tane = 1; tane <= 200; tane++) {
      const moto = tsukuri(tane);
      const s = summarizeGyo(gamen(MAE, gamenNoKata(moto)));
      expect(kuchi(moto)).toEqual(s);
      // 月で 絞る＝全期間で 当ててから 絞る（先に 絞ると 繰越の 当てが 変わる）
      expect(kuchi(moto, "2026-03", "2026-04")).toEqual(
        s.filter((x) => x.月 >= "2026-03" && x.月 <= "2026-04")
      );
      expect(kuchi(moto, "", "", "乙")).toEqual(s.filter((x) => x.会社名 === "乙"));
      if (moto.kaisha.some((c) => c.carryover)) kurikoshi++;
    }
    expect(kurikoshi).toBeGreaterThan(100); // 繰越の 道を 通った
  });
  it("共有の 作り物：外税の会社（繰越・後から 作った 方が 勝つ）の 当て", () => {
    const { MOTO } = require("./fixtures/yomu-moto.js");
    const s = summarizeGyo(gamen(MAE, gamenNoKata(MOTO)));
    expect(kuchi(MOTO)).toEqual(s);
    const soto = kuchi(MOTO).find((x) => x.会社名 === "外税の会社");
    const g = ME.invoiceTotals([{ 金額: 3333 }, { 金額: 1001 }], { taxMode: "外税" }).goukei;
    expect(soto).toMatchObject({ 月: "2026-10", "今月分（税込）": g, 入金: 3000, 残額: g - 3000 });
  });
  it("並び＝月の 新しい 順→会社（画面と 同じ）・繰越を使う の 列", () => {
    const t = YK.tsukuru(tsukuri(7), "minyukin", "", "");
    const mi = t.midashi;
    expect(mi).toEqual([
      "月",
      "会社名",
      "件数",
      "今月分（税込）",
      "入金",
      "記録した入金",
      "残額",
      "状態",
      "繰越を使う",
    ]);
    for (let i = 1; i < t.gyo.length; i++) {
      const [a, b] = [t.gyo[i - 1], t.gyo[i]];
      expect(a[0] > b[0] || (a[0] === b[0] && a[1].localeCompare(b[1]) < 0)).toBe(true);
    }
  });
  it("④ 同じ (月, 会社) の 入金が 2行＝502・知らない 会社＝400", () => {
    const moto = tsukuri(3);
    moto.nyukin.push(Object.assign({}, moto.nyukin[0], { id: "dup" }));
    const t = YK.tsukuru(moto, "minyukin", "", "");
    expect(t.status).toBe(502);
    expect(t.error).toContain("2行");
    expect(YK.tsukuru(tsukuri(3), "minyukin", "", "", "無い会社").status).toBe(400);
  });
});
