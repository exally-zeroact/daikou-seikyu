"use strict";
// ============================================================
// ★api/excel.js（Excel の Webクエリ口）が、読み切れない時に黙らない★ 2026-11-02
//
//   倉庫は1回に返す行に上限がある（max_rows：テスト倉庫 1000・本番 100000）。
//   前は Content-Range を見ず、上限で切れた途中の表をそのまま Excel に出していた。
//   また r.ok を見ず、倉庫のエラーを「データがありません」に化けさせていた。
//
//   形は倉庫で測った物（count=exact を付けた GET）：
//     0件 → 200・Content-Range "*/0"・本文 []
//     切れた時 → 206・"0-999/1477"（206 は r.ok が true＝状態の番号で判じない）
//
//   ★偽の fetch が入り損ねると本物の倉庫を叩く★＝呼ばれた数と行き先の形を必ず見る。
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const handler = require("../api/excel.js");

const realFetch = globalThis.fetch;
let calls;

function fakeFetch({ status = 200, body = [], contentRange = null, throws = null }) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (throws) throw new Error(throws);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (k) => (String(k).toLowerCase() === "content-range" ? contentRange : null),
      },
      json: async () => body,
    };
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

async function call(query) {
  const res = fakeRes();
  await handler({ query }, res);
  // 偽物が1回だけ呼ばれ、倉庫の RPC の口へ行っている（本物の fetch に抜けていない）
  expect(calls.length).toBe(1);
  expect(new URL(calls[0].url).hostname.endsWith(".supabase.co")).toBe(true);
  expect(calls[0].url).toContain("/rest/v1/rpc/");
  return res.out;
}

const row = (i) => ({ 会社名: "会社" + i, 金額: 1000 + i });

describe("api/excel.js 読み切り", () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("count=exact を頼む", async () => {
    fakeFetch({ body: [row(1)], contentRange: "0-0/1" });
    await call({ token: "t", sheet: "meisai" });
    expect(calls[0].opts && calls[0].opts.headers && calls[0].opts.headers.Prefer).toBe(
      "count=exact"
    );
  });

  it("全部読めた時は表を出す", async () => {
    fakeFetch({ body: [row(1), row(2)], contentRange: "0-1/2" });
    const o = await call({ token: "t", sheet: "meisai" });
    expect(o.status).toBe(200);
    expect(o.body).toContain("<th>会社名</th>");
    expect(o.body).toContain("会社2");
    expect(o.body).not.toContain("エラー");
  });

  it("0件（*/0）は「データがありません」でエラーにしない", async () => {
    fakeFetch({ body: [], contentRange: "*/0" });
    const o = await call({ token: "t", sheet: "meisai" });
    expect(o.body).toContain("データがありません");
    expect(o.body).not.toContain("エラー");
  });

  it("上限で切れた（206・0-999/1477）時は途中の表を出さずエラー", async () => {
    const body = Array.from({ length: 1000 }, (_, i) => row(i));
    fakeFetch({ status: 206, body, contentRange: "0-999/1477" });
    const o = await call({ token: "t", sheet: "meisai" });
    expect(o.body).toContain("全部を読めませんでした（全1477行のうち1000行）");
    expect(o.body).not.toContain("<th>");
    expect(o.body).not.toContain("会社0");
  });

  it("倉庫のエラー（400）を「データがありません」に化けさせない・中身を出さない", async () => {
    fakeFetch({ status: 400, body: { code: "22P02", message: "invalid uuid: himitsu" } });
    const o = await call({ token: "himitsu", sheet: "meisai" });
    expect(o.body).toContain("エラー: 倉庫を読めませんでした（400）");
    expect(o.body).not.toContain("データがありません");
    expect(o.body).not.toContain("himitsu");
  });

  it("全件数が分からない（ヘッダ無し・*/*）時はエラー", async () => {
    fakeFetch({ body: [row(1)], contentRange: null });
    let o = await call({ token: "t", sheet: "meisai" });
    expect(o.body).toContain("全部の件数が分かりません");
    fakeFetch({ body: [row(1)], contentRange: "0-0/*" });
    o = await call({ token: "t", sheet: "meisai" });
    expect(o.body).toContain("全部の件数が分かりません");
  });

  it("答えが配列でない時は「データがありません」に化けさせない", async () => {
    fakeFetch({ body: { hint: "x" }, contentRange: "*/0" });
    const o = await call({ token: "t", sheet: "meisai" });
    expect(o.body).toContain("エラー");
    expect(o.body).not.toContain("データがありません");
  });

  it("fetch が投げた時はエラー行", async () => {
    fakeFetch({ throws: "network down" });
    const o = await call({ token: "t", sheet: "meisai" });
    expect(o.body).toContain("エラー: network down");
  });
});

// ============================================================
// ★表の名前の取り違えで別の表を出さない★ 2026-11-02
//   xlsx の Webクエリは sheet=payments を投げるのに、口は "pay" しか知らず、
//   知らない名前は黙って明細に倒れた＝入金シートに明細の行が出た。
// ============================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rpcOf = (url) => new URL(url).pathname.split("/rest/v1/rpc/")[1];

describe("api/excel.js 表の名前", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it.each([
    ["meisai", "export_meisai"],
    ["pay", "export_payments"],
    ["payments", "export_payments"],
    ["summary", "export_summary"],
    ["companies", "export_companies"],
  ])("sheet=%s は %s を引く", async (sheet, fn) => {
    fakeFetch({ body: [row(1)], contentRange: "0-0/1" });
    await call({ token: "t", sheet });
    expect(rpcOf(calls[0].url)).toBe(fn);
  });

  it("sheet 無しは今まで通り明細", async () => {
    fakeFetch({ body: [row(1)], contentRange: "0-0/1" });
    await call({ token: "t" });
    expect(rpcOf(calls[0].url)).toBe("export_meisai");
  });

  it.each(["foo", "constructor", "toString", "__proto__"])(
    "知らない名前（%s）は明細に倒さずエラー・倉庫を呼ばない",
    async (sheet) => {
      fakeFetch({ body: [row(1)], contentRange: "0-0/1" });
      const res = fakeRes();
      await handler({ query: { token: "t", sheet } }, res);
      expect(calls.length).toBe(0);
      expect(res.out.body).toContain("エラー: 知らない表の名前です");
      expect(res.out.body).not.toContain("<th>");
    }
  );

  it("画面の xlsx が投げる名前は全部、その名前の RPC を引く", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const html = readFileSync(join(here, "..", "daikou-seikyu.html"), "utf8");
    // 画面は sh.fn.replace("export_", "") を sheet に入れる（_wqInject）
    expect(html).toContain('sh.fn.replace("export_", "")');
    const fns = [...html.matchAll(/fn:\s*"(export_[a-z]+)"/g)].map((m) => m[1]);
    expect(fns.length).toBeGreaterThanOrEqual(4);
    for (const fn of new Set(fns)) {
      fakeFetch({ body: [row(1)], contentRange: "0-0/1" });
      await call({ token: "t", sheet: fn.replace("export_", "") });
      expect(rpcOf(calls[0].url)).toBe(fn);
    }
  });
});
