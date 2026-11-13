"use strict";
// ============================================================
// ★MCP の口（⑥）api/mcp.js★ 2026-11-13（設計 sekkei_6_kotoba v1.2）
//   守ること：
//   ・鍵は Authorization: Bearer だけ（?token は 受けない）・鍵なし/違う 401（倉庫を 呼ばない）
//   ・繋ぐ 時に kagi_aru が true の 時だけ 通す（false 401・読めない 502）
//   ・額は ①（api/yomu.js）と 1マスも 違わない（同じ 倉庫の 答えから 両方を 比べる）
//   ・書く tool 0本・未入金・残額は minyukin で 答える（seikyu − nyukin で 引かない）と 説明に 書く（件B 11-13）
//   ・大きすぎる 答えは 切らずに isError（24,000 バイト）・会社名が 無い 時は 0行に しない
//   ・壊れた JSON は -32700（Vercel の req.body が 投げる 形も）・失敗を 成功に しない
//   ・答えに 鍵の 字が 出ない
//   ★偽の fetch が 入り損ねると 本物の 倉庫を 叩く★＝呼ばれた 数と 行き先を 必ず 見る。値は 全部 作り物。
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mcp = require("../api/mcp.js");
const yomu = require("../api/yomu.js");
const { MOTO } = require("./fixtures/yomu-moto.js");

const KAGI = "11111111-2222-4333-8444-555555555555";
const AUTH = { authorization: "Bearer " + KAGI };

const realFetch = globalThis.fetch;
let calls;
// rpc の 名前ごとに 答えを 変える（yomu_moto／kagi_aru）
function fakeFetch(kotaeOf) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const name = String(url).split("/rpc/")[1];
    const k = kotaeOf[name];
    if (!k) throw new Error("知らない rpc " + name);
    if (k.throws) throw new Error(k.throws);
    const status = k.status || 200;
    return { ok: status >= 200 && status < 300, status, json: async () => k.body };
  };
}
const FUTSU = { yomu_moto: { body: MOTO }, kagi_aru: { body: true } };

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
async function post(body, { headers = AUTH, method = "POST", req = null } = {}) {
  const res = fakeRes();
  await mcp(req || { method, headers, body, query: {} }, res);
  const o = res.out;
  o.json = o.body ? JSON.parse(o.body) : null;
  return o;
}
const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, params });
const yobu = (args, id = 9) => post(rpc(id, "tools/call", { name: "yomu_hyo", arguments: args }));
const naka = (o) => JSON.parse(o.json.result.content[0].text);

beforeEach(() => fakeFetch(FUTSU));
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("api/mcp.js 鍵", () => {
  it("鍵なし・形違い・?token だけ＝401（WWW-Authenticate）・倉庫を 呼ばない", async () => {
    for (const headers of [{}, { authorization: "Bearer abc" }, { authorization: KAGI }]) {
      const o = await post(rpc(1, "tools/list"), { headers });
      expect(o.status).toBe(401);
      expect(o.headers["WWW-Authenticate"]).toMatch(/^Bearer /);
    }
    // ?token は ① だけ。MCP は 受けない
    const res = fakeRes();
    await mcp(
      { method: "POST", headers: {}, query: { token: KAGI }, body: rpc(1, "tools/list") },
      res
    );
    expect(res.out.status).toBe(401);
    expect(calls.length).toBe(0);
  });
  it("initialize：kagi_aru が true の 時だけ 通す（false 401・読めない 502・形違い 502）", async () => {
    const init = rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    const ok = await post(init);
    expect(ok.status).toBe(200);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toMatch(/\/rest\/v1\/rpc\/kagi_aru$/);
    expect(JSON.parse(calls[0].opts.body)).toEqual({ token: KAGI });
    expect(calls[0].url).not.toContain(KAGI);
    expect(calls[0].opts.headers.Authorization).not.toContain(KAGI);

    fakeFetch({ kagi_aru: { body: false } });
    expect((await post(init)).status).toBe(401);
    fakeFetch({ kagi_aru: { status: 500, body: { code: "XX000" } } });
    expect((await post(init)).status).toBe(502);
    fakeFetch({ kagi_aru: { body: "true" } });
    expect((await post(init)).status).toBe(502);
    fakeFetch({ kagi_aru: { throws: "net" } });
    expect((await post(init)).status).toBe(500);
  });
  it("tools/call で 鍵を 止めた（28000）＝HTTP 401", async () => {
    fakeFetch({ yomu_moto: { status: 403, body: { code: "28000", message: "kagi_nashi" } } });
    const o = await yobu({ hyo: "seikyu" });
    expect(o.status).toBe(401);
  });
});

describe("api/mcp.js 話し方（JSON-RPC）", () => {
  it("initialize：知っている 版は そのまま・知らない 版は 一番 新しい 版・tools だけ", async () => {
    const a = await post(rpc(1, "initialize", { protocolVersion: "2025-03-26" }));
    expect(a.json.result.protocolVersion).toBe("2025-03-26");
    const b = await post(rpc(2, "initialize", { protocolVersion: "1999-01-01" }));
    expect(b.json.result.protocolVersion).toBe("2025-11-25");
    expect(Object.keys(b.json.result.capabilities)).toEqual(["tools"]);
    expect(b.json.result.instructions).toContain("未入金");
    expect(b.headers["Mcp-Session-Id"]).toBeUndefined();
  });
  it("知らせ＝202 本文なし・ping＝{}・知らない method＝-32601・id 無しの 要求＝400", async () => {
    const n = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(n.status).toBe(202);
    expect(n.body).toBe("");
    expect((await post(rpc(3, "ping"))).json.result).toEqual({});
    const x = await post(rpc(4, "resources/list"));
    expect(x.json.error.code).toBe(-32601);
    expect(x.json.id).toBe(4);
    expect((await post({ jsonrpc: "2.0", method: "tools/list" })).status).toBe(400);
  });
  it("POST 以外 405・batch（配列）-32600・jsonrpc が 無い -32600", async () => {
    expect((await post(null, { method: "GET" })).status).toBe(405);
    expect((await post(null, { method: "DELETE" })).status).toBe(405);
    const b = await post([rpc(1, "ping")]);
    expect(b.status).toBe(400);
    expect(b.json.error.code).toBe(-32600);
    expect((await post({ id: 1, method: "ping" })).json.error.code).toBe(-32600);
  });
  it("壊れた JSON＝-32700（字の 本文・Buffer・req.body が 投げる 形・本文なし）・500 に しない", async () => {
    for (const body of ["{壊れ", Buffer.from("{壊れ"), undefined]) {
      const o = await post(body);
      expect(o.status).toBe(400);
      expect(o.json.error.code).toBe(-32700);
    }
    const req = { method: "POST", headers: AUTH, query: {} };
    Object.defineProperty(req, "body", {
      get() {
        throw new Error("Invalid JSON");
      },
    });
    const o = await post(null, { req });
    expect(o.status).toBe(400);
    expect(o.json.error.code).toBe(-32700);
    // 字の 本文でも 正しい JSON なら 読める
    expect((await post(JSON.stringify(rpc(5, "ping")))).json.result).toEqual({});
  });
});

describe("api/mcp.js tools", () => {
  it("tools/list＝1本・読むだけ・未入金は minyukin と 書く・書く 道 0", async () => {
    const o = await post(rpc(1, "tools/list"));
    const t = o.json.result.tools;
    expect(t.length).toBe(1);
    expect(t[0].name).toBe("yomu_hyo");
    expect(t[0].annotations.readOnlyHint).toBe(true);
    expect(t[0].annotations.destructiveHint).toBe(false);
    expect(t[0].description).toContain("未入金");
    expect(t[0].description).toContain("入金タブ");
    expect(t[0].inputSchema.properties.hyo.enum).toEqual([
      "meisai",
      "seikyu",
      "nyukin",
      "kaisha",
      "minyukin",
    ]);
    expect(t[0].description).toContain("minyukin");
    expect(t[0].description).toContain("引き算で答えないで");
    expect(calls.length).toBe(0);
  });
  it("知らない tool＝-32602・hyo 無し/違う＝isError・字でない 引数＝isError", async () => {
    const x = await post(rpc(1, "tools/call", { name: "kaku", arguments: {} }));
    expect(x.json.error.code).toBe(-32602);
    for (const args of [{}, { hyo: "mikaishu" }, { hyo: "seikyu", kara: 202610 }, undefined]) {
      const o = await yobu(args);
      expect(o.status).toBe(200);
      expect(o.json.result.isError).toBe(true);
    }
  });
  it("★額は ①と 1マスも 違わない★（5つの 表・同じ 倉庫の 答えから）", async () => {
    for (const hyo of ["meisai", "seikyu", "nyukin", "kaisha", "minyukin"]) {
      const m = naka(await yobu({ hyo }));
      const res = fakeRes();
      await yomu({ method: "GET", headers: AUTH, query: { hyo } }, res);
      const y = JSON.parse(res.out.body);
      expect(m.kensu).toBe(y.kensu);
      const mi = m.midashi;
      expect(m.gyo.map((g) => Object.fromEntries(mi.map((k, i) => [k, g[i]])))).toEqual(y.gyo);
    }
    const s = naka(await yobu({ hyo: "seikyu", kara: "2026-10", made: "2026-10" }));
    expect(s.midashi).toContain("今月分（税込）");
    expect(s.kensu).toBe(3);
    expect(s.chui).toContain("入金タブ");
  });
  it("会社名が 無い＝isError で 在る 名前（0行に しない）・在る 名前で 絞る・明細は 日で 絞る", async () => {
    const n = await yobu({ hyo: "seikyu", kaisha: "外税" });
    expect(n.json.result.isError).toBe(true);
    expect(n.json.result.content[0].text).toContain("外税の会社");
    expect(naka(await yobu({ hyo: "seikyu", kaisha: "外税の会社" })).kensu).toBe(1);
    expect(naka(await yobu({ hyo: "meisai", kara: "2026-10-02", made: "2026-10-03" })).kensu).toBe(
      2
    );
  });
  it("倉庫が 読めない＝isError（成功に しない）・網が 落ちた＝500", async () => {
    fakeFetch({ yomu_moto: { status: 500, body: { code: "XX000" } } });
    const o = await yobu({ hyo: "seikyu" });
    expect(o.json.result.isError).toBe(true);
    fakeFetch({ yomu_moto: { body: [] } });
    expect((await yobu({ hyo: "seikyu" })).json.result.isError).toBe(true);
    fakeFetch({ yomu_moto: { throws: "net" } });
    const x = await yobu({ hyo: "seikyu" });
    expect(x.status).toBe(500);
    expect(x.json.error.code).toBe(-32603);
  });
  it("★24,000 バイトを 越えたら 切らずに isError★（越えない 時は 全部）", async () => {
    const meisai = [];
    for (let i = 0; i < 400; i++)
      meisai.push({
        id: String(i),
        company: "大きい会社",
        date: "2026-10-" + String((i % 28) + 1).padStart(2, "0"),
        destination: "今治市北日吉町一丁目",
        amount: 3500,
        note: "深夜",
        distance: 12.4,
        people: 2,
        name: "山田太郎",
      });
    fakeFetch({ yomu_moto: { body: { ...MOTO, meisai } } });
    const o = await yobu({ hyo: "meisai" });
    expect(o.json.result.isError).toBe(true);
    expect(o.json.result.content[0].text).toContain("400件");
    expect(o.json.result.content[0].text).toContain("24000");
    // 日で 絞れば 出る＝行き止まりに ならない
    const p = naka(await yobu({ hyo: "meisai", kara: "2026-10-01", made: "2026-10-05" }));
    expect(p.kensu).toBe(meisai.filter((r) => r.date <= "2026-10-05").length);
    expect(p.kensu).toBeGreaterThan(0);
    const ok = await yobu({ hyo: "meisai", kara: "2026-10-01", made: "2026-10-05" });
    expect(Buffer.byteLength(ok.json.result.content[0].text, "utf8")).toBeLessThanOrEqual(24000);
  });
  it("答えと 誤りの 字に 鍵が 出ない", async () => {
    const outs = [
      await yobu({ hyo: "seikyu" }),
      await yobu({ hyo: "x" }),
      await post(rpc(1, "initialize", {})),
    ];
    fakeFetch({ yomu_moto: { throws: "net " + KAGI } });
    outs.push(await yobu({ hyo: "seikyu" }));
    for (const o of outs) expect(o.body).not.toContain(KAGI);
  });
});
