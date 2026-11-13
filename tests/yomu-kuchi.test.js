"use strict";
// ============================================================
// ★外から読むだけの口（①）★ 2026-11-03（司さん 11-02「外へ数を出す口＝読むだけ」）
//   守ること：
//   ・請求の 額は 画面の seikyuList と 同じ 式（listInvoices＋invoiceTotals・会社の taxMode）＝1円も 違わない
//   ・入金は 画面の entriesOf と 同じ 回（回の 和 ＝ 記録した 額）
//   ・失敗を 200 に しない（鍵なし/違う 401・知らない 表 400・倉庫 502・GET 以外 405）
//   ・倉庫へは POST・鍵は body（URL に 載せない）・客の Authorization を 倉庫へ 回さない
//   ・CSV は BOM・式に なる 頭に '（Excel で 式として 動かさない）
//   ★偽の fetch が 入り損ねると 本物の 倉庫を 叩く★＝呼ばれた 数と 行き先を 必ず 見る。
//   値は 全部 作り物（客の 物ではない）。
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const handler = require("../api/yomu.js");
const YK = require("../lib/yomu-kuchi.js");
const ME = require("../meisai-engine.js");
const NK = require("../lib/nyukin-kai.js");

const KAGI = "11111111-2222-4333-8444-555555555555";
const { MOTO } = require("./fixtures/yomu-moto.js");

describe("lib/yomu-kuchi.js 請求＝画面と 同じ 式", () => {
  it("今月分（税込）が invoiceTotals（会社の taxMode）と 1円も 違わない", () => {
    const t = YK.tsukuru(MOTO, "seikyu", "", "");
    const i = (k) => t.midashi.indexOf(k);
    const soto = t.gyo.find((g) => g[0] === "2026-10" && g[1] === "外税の会社");
    const ex = ME.invoiceTotals([{ 金額: 3333 }, { 金額: 1001 }], { taxMode: "外税" });
    expect(soto[i("今月分（税込）")]).toBe(ex.goukei);
    expect(soto[i("消費税")]).toBe(ex.zei);
    expect(soto[i("税の扱い")]).toBe("外税");
    expect(soto[i("繰越を使う")]).toBe("はい");
    expect(soto[i("請求番号")]).toBe("No.2026-10-001");
    const uchi = t.gyo.find((g) => g[0] === "2026-10" && g[1] === "内税の会社");
    expect(uchi[i("今月分（税込）")]).toBe(11000);
    expect(uchi[i("消費税")]).toBe(ME.invoiceTotals([{ 金額: 11000 }], {}).zei);
    expect(uchi[i("請求番号")]).toBe("");
    // 会社の 無い 明細は 内税（画面の MASTER が 無い 時と 同じ）
    const nashi = t.gyo.find((g) => g[1] === "会社の無い明細");
    expect(nashi[i("今月分（税込）")]).toBe(777);
    // 日付の 無い 行は 請求に 入らない（listInvoices と 同じ）
    expect(t.gyo.length).toBe(4);
  });
  it("kara/made で 月を 絞る・形が 違えば 400", () => {
    expect(YK.tsukuru(MOTO, "seikyu", "2026-10", "2026-10").gyo.length).toBe(3);
    expect(YK.tsukuru(MOTO, "seikyu", "2026-13", "").status).toBe(400);
    expect(YK.tsukuru(MOTO, "seikyu", "", "2026-1").status).toBe(400);
    expect(YK.tsukuru(MOTO, "nanika", "", "").status).toBe(400);
  });
  it("明細：日付の 無い 行は 絞らない 時だけ 出る", () => {
    expect(YK.tsukuru(MOTO, "meisai", "", "").gyo.length).toBe(6);
    expect(YK.tsukuru(MOTO, "meisai", "2026-09", "2026-10").gyo.length).toBe(5);
  });
});

// ★⑥（2026-11-13）会社の 絞り・明細の 日の 範囲★（設計 sekkei_6 v1.2 S1・N2）
//   会社名が どこにも 無い 時に 黙って 0行（＝「0件・0円」）を 返さない＝400 で 在る 名前を 並べる
describe("lib/yomu-kuchi.js 会社の 絞り・明細の 日", () => {
  it("kaisha で 会社を 絞る（4つの 表 全部）", () => {
    const s = YK.tsukuru(MOTO, "seikyu", "", "", "外税の会社");
    expect(s.gyo.length).toBe(1);
    expect(s.gyo[0][1]).toBe("外税の会社");
    expect(YK.tsukuru(MOTO, "meisai", "", "", "内税の会社").gyo.length).toBe(3);
    expect(YK.tsukuru(MOTO, "nyukin", "", "", "内税の会社").gyo.length).toBe(1);
    expect(YK.tsukuru(MOTO, "kaisha", "", "", "内税の会社").gyo).toEqual([
      ["内税の会社", "内税", "いいえ"],
    ]);
    // 明細だけに 在る 名前も 在る 名前（会社の 表に 無くても）
    expect(YK.tsukuru(MOTO, "meisai", "", "", "会社の無い明細").gyo.length).toBe(1);
  });
  it("どこにも 無い 名前＝400・在る 名前を 並べる（0行で 返さない）", () => {
    const t = YK.tsukuru(MOTO, "seikyu", "", "", "外税");
    expect(t.status).toBe(400);
    expect(t.gyo).toBeUndefined();
    expect(t.error).toContain("外税の会社");
    expect(t.error).toContain("内税の会社");
    expect(t.error).toContain("会社の無い明細");
    // 在る 名前で 月に 行が 無い＝0行は 正しい（名前は 在る）
    const z = YK.tsukuru(MOTO, "seikyu", "2026-01", "2026-01", "外税の会社");
    expect(z.status).toBeUndefined();
    expect(z.gyo.length).toBe(0);
  });
  it("明細は YYYY-MM-DD でも 絞れる・月の 表に 日は 400", () => {
    expect(YK.tsukuru(MOTO, "meisai", "2026-10-02", "2026-10-03").gyo.length).toBe(2);
    expect(YK.tsukuru(MOTO, "meisai", "2026-10", "2026-10-01").gyo.length).toBe(1);
    expect(YK.tsukuru(MOTO, "meisai", "2026-10-32", "").status).toBe(400);
    expect(YK.tsukuru(MOTO, "seikyu", "2026-10-01", "").status).toBe(400);
    expect(YK.tsukuru(MOTO, "nyukin", "", "2026-10-31").status).toBe(400);
  });
});

describe("lib/yomu-kuchi.js 入金＝画面の 回と 同じ", () => {
  it("回ごとに 1行・回の 和 ＝ 記録した 額・手数料は うち", () => {
    const t = YK.tsukuru(MOTO, "nyukin", "", "");
    const i = (k) => t.midashi.indexOf(k);
    for (const r of MOTO.nyukin) {
      const mine = t.gyo.filter((g) => g[i("記録ID")].startsWith(r.id + "#"));
      const kai = NK.entriesOf(NK.payRecFromDb(r), r.month);
      expect(mine.length).toBe(kai.length);
      expect(mine.reduce((s, g) => s + g[i("入金額")], 0)).toBe(r.paid);
      mine.forEach((g) => expect(g[i("うち振込")] + g[i("うち振込手数料")]).toBe(g[i("入金額")]));
    }
    // 古い 記録（entries null・入金日 null）は 作った 日の 1回
    const p2 = t.gyo.find((g) => g[i("記録ID")] === "p2#1");
    expect(p2[i("入金日")]).toBe("2026-09-25");
    // 足りない 分（500）は 入金日（paid_date）の 新しい 回として 足される＝画面の entriesOf と 同じ
    const p1 = t.gyo.filter((g) => g[i("記録ID")].startsWith("p1#"));
    expect(p1.map((g) => g[i("入金額")])).toEqual([1000, 1500, 500]);
    expect(p1.map((g) => g[i("入金日")])).toEqual(["2026-10-20", "2026-10-31", "2026-10-31"]);
    expect(p1[1][i("うち振込手数料")]).toBe(440);
  });
});

describe("lib/yomu-kuchi.js CSV", () => {
  it("BOM・CRLF・式の 頭に '・数の マイナスは そのまま", () => {
    const csv = YK.csvKaku(
      ["a", "b"],
      [
        ["=1+1", -500],
        ["-まとめ", '引"用'],
      ]
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"\'=1+1","-500"\r\n');
    expect(csv).toContain('"\'-まとめ","引""用"\r\n');
  });
});

// ---------- api/yomu.js ----------
const realFetch = globalThis.fetch;
let calls;
function fakeFetch({ status = 200, body = MOTO, throws = null }) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (throws) throw new Error(throws);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}
function fakeRes() {
  const out = { status: null, body: null, headers: {} };
  return {
    out,
    setHeader(k, v) {
      out.headers[k] = v;
    },
    status(s) {
      out.status = s;
      return this;
    },
    send(b) {
      out.body = b;
      return this;
    },
  };
}
async function call(query, { method = "GET", headers = {} } = {}) {
  const res = fakeRes();
  await handler({ method, query, headers }, res);
  return res.out;
}
function kuraNiItta() {
  expect(calls.length).toBe(1);
  expect(new URL(calls[0].url).hostname.endsWith(".supabase.co")).toBe(true);
  expect(calls[0].url).toMatch(/\/rest\/v1\/rpc\/yomu_moto$/);
}

describe("api/yomu.js", () => {
  beforeEach(() => fakeFetch({}));
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("Bearer の 鍵で 読める・倉庫へは POST で 鍵は body・URL に 鍵が 無い・客の 見出しを 回さない", async () => {
    const o = await call({ hyo: "seikyu" }, { headers: { authorization: "Bearer " + KAGI } });
    expect(o.status).toBe(200);
    kuraNiItta();
    expect(calls[0].opts.method).toBe("POST");
    expect(JSON.parse(calls[0].opts.body)).toEqual({ token: KAGI });
    expect(calls[0].url).not.toContain(KAGI);
    expect(calls[0].opts.headers.Authorization).not.toContain(KAGI);
    const j = JSON.parse(o.body);
    expect(j.hyo).toBe("seikyu");
    expect(j.kensu).toBe(4);
    expect(j.gyo[0]).toHaveProperty("今月分（税込）");
    expect(o.headers["Cache-Control"]).toBe("no-store");
  });
  it("?token= でも 読める・CSV", async () => {
    const o = await call({ hyo: "nyukin", token: KAGI, kata: "csv" });
    expect(o.status).toBe(200);
    expect(o.headers["Content-Type"]).toContain("text/csv");
    expect(o.body.charCodeAt(0)).toBe(0xfeff);
    expect(o.body).toContain("'-まとめ");
  });
  it("鍵なし・形が 違う＝401（倉庫を 呼ばない）", async () => {
    expect((await call({ hyo: "meisai" })).status).toBe(401);
    expect((await call({ hyo: "meisai", token: "abc" })).status).toBe(401);
    expect(calls.length).toBe(0);
  });
  it("倉庫の 28000（鍵が 無い・止めた）＝401。状態の 番号では なく 本文の code で 判じる", async () => {
    fakeFetch({ status: 403, body: { code: "28000", message: "kagi_nashi" } });
    const o = await call({ hyo: "meisai", token: KAGI });
    expect(o.status).toBe(401);
    kuraNiItta();
  });
  it("倉庫の エラー・形が 違う・落ちた＝502/500（200 に しない）", async () => {
    fakeFetch({ status: 500, body: { code: "XX000", message: "x" } });
    expect((await call({ hyo: "meisai", token: KAGI })).status).toBe(502);
    fakeFetch({ status: 200, body: [] });
    expect((await call({ hyo: "meisai", token: KAGI })).status).toBe(502);
    fakeFetch({ throws: "net" });
    expect((await call({ hyo: "meisai", token: KAGI })).status).toBe(500);
  });
  it("GET 以外 405・知らない hyo/kata 400・月の 形 400", async () => {
    expect((await call({ hyo: "meisai", token: KAGI }, { method: "POST" })).status).toBe(405);
    expect((await call({ hyo: "meisai", token: KAGI }, { method: "HEAD" })).status).toBe(405);
    expect((await call({ hyo: "x", token: KAGI })).status).toBe(400);
    expect((await call({ hyo: "meisai", token: KAGI, kata: "xml" })).status).toBe(400);
    expect((await call({ hyo: "meisai", token: KAGI, kara: "2026-13" })).status).toBe(400);
  });
  it("⑥ ?kaisha= で 絞る・無い 名前は 400・2回 付けたら 400", async () => {
    const o = await call({ hyo: "seikyu", token: KAGI, kaisha: "外税の会社" });
    expect(o.status).toBe(200);
    expect(JSON.parse(o.body).kensu).toBe(1);
    const n = await call({ hyo: "seikyu", token: KAGI, kaisha: "外税" });
    expect(n.status).toBe(400);
    expect(JSON.parse(n.body).error).toContain("外税の会社");
    const csv = await call({ hyo: "meisai", token: KAGI, kaisha: "無い", kata: "csv" });
    expect(csv.status).toBe(400);
    const w = await call({ hyo: "seikyu", token: KAGI, kaisha: ["外税の会社", "内税の会社"] });
    expect(w.status).toBe(400);
  });
});

describe("倉庫の SQL（supabase/yomu-kuchi.sql）の 字の 守り", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "supabase/yomu-kuchi.sql"), "utf8");
  it("yomu_moto の 4つの 副問いが 全部 where X.user_id = u", () => {
    const body = sql.slice(
      sql.indexOf("function public.yomu_moto"),
      sql.indexOf("function public.kagi_aru")
    );
    expect(
      (body.match(/from daikou\.(meisai|companies|payments|invoice_no) \w/g) || []).length
    ).toBe(4);
    expect((body.match(/where \w\.user_id = u\b/g) || []).length).toBe(4);
  });
  it("作り直し・止めは anon から 取り上げ・鍵の 表に 直に 書かせない（両方の 窓）", () => {
    expect(sql).toMatch(/revoke all on function public\.kagi_tsukurinaosu\(\) from public, anon;/);
    expect(sql).toMatch(/revoke all on function public\.kagi_tomeru\(\) from public, anon;/);
    expect(sql).toMatch(/revoke insert, update on public\.export_tokens from anon, authenticated;/);
    expect(sql).toMatch(/revoke insert, update on daikou\.export_tokens from anon, authenticated;/);
  });
});
