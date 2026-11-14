// @vitest-environment node
// ============================================================
// ★lib/kagi-fetch.js（倉庫へ 出る 手前の 口）★ 2026-11-14 件⑥
//   本物の supabase-js（node_modules・2.111.0）を 通して 見る。fetchWithAuth（Authorization を 付け終えて
//   から global.fetch を 呼ぶ）の 形は 2.112.4（画面が CDN で 読む 版）と 同じ（taiketsu 確かめ・dist/index.cjs 286〜）。
//   違いが 出たら 2.112.4 を devDependency に 固定する。
//   住所は 在りもしない 物・中の fetch は 偽（外へ 0本）。
// ============================================================
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const KagiFetch = require("../lib/kagi-fetch.js");
const { createClient } = require("@supabase/supabase-js");

const URL_ = "https://kagi-shiken.invalid";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (p) => b64({ alg: "HS256", typ: "JWT" }) + "." + b64(p) + ".sig";
const ANON = jwt({ role: "anon", iss: "supabase" });
const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";
const kagi = (sub) =>
  jwt({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });

let okutta, kireta, chigau, hito, tootta;
function nakaFetch(input, init) {
  const u = String(typeof input === "string" ? input : input.url);
  okutta.push({
    u,
    auth: new Headers(init && init.headers).get("Authorization"),
    method: (init && init.method) || "GET",
  });
  if (u.includes("/auth/v1/user")) {
    const t = new Headers(init.headers).get("Authorization").replace(/^Bearer /, "");
    const sub = KagiFetch.kagiNoSub(t);
    return Promise.resolve(
      new Response(JSON.stringify({ id: sub, aud: "authenticated", role: "authenticated" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
  }
  return Promise.resolve(
    new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  );
}
function tsukuru() {
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: KagiFetch.tsukuru({
        url: URL_,
        anon: ANON,
        hito: () => hito,
        kireta: () => kireta++,
        chigau: (s) => chigau.push(s),
        tootta: () => tootta++,
        fetch: nakaFetch,
        navigator: { onLine: true },
      }),
    },
  });
}
async function hairu(sb, sub) {
  const r = await sb.auth.setSession({ access_token: kagi(sub), refresh_token: "r" });
  expect(r.error).toBeNull();
}
const kuraNi = () =>
  okutta.filter((o) => o.u.includes("/rest/v1/") || o.u.includes("/functions/v1/"));

beforeEach(() => {
  okutta = [];
  kireta = 0;
  chigau = [];
  hito = A;
  tootta = 0;
});

describe("止める（倉庫へ 送らない）", () => {
  it("① 鍵が 無い（公開鍵）で 更新＝KAGI_KIRE・倉庫へ 0本・kireta 1回", async () => {
    const sb = tsukuru();
    const r = await sb.from("invoices").update({ a: 1 }).eq("id", 1);
    expect(r.error && r.error.code).toBe("KAGI_KIRE");
    expect(r.status).toBe(401);
    expect(kuraNi().length).toBe(0);
    expect(kireta).toBe(1);
  });
  it("② B の 鍵（sub≠入った人）で 読み＝KAGI_HITO・倉庫へ 0本・chigau に B", async () => {
    const sb = tsukuru();
    await hairu(sb, B);
    const r = await sb.from("invoices").select("*");
    expect(r.error && r.error.code).toBe("KAGI_HITO");
    expect(kuraNi().length).toBe(0);
    expect(chigau).toEqual([B]);
    expect(kireta).toBe(0);
  });
  it("⑥ rpc・削除・functions も 止まる", async () => {
    const sb = tsukuru();
    expect((await sb.rpc("f", {})).error.code).toBe("KAGI_KIRE");
    expect((await sb.from("t").delete().eq("id", 1)).error.code).toBe("KAGI_KIRE");
    const f = await sb.functions.invoke("dk-fix-fare", { body: {} });
    expect(f.error).toBeTruthy();
    expect(kuraNi().length).toBe(0);
  });
  it("電波が 無い 時の 鍵切れは 通信の 失敗（倉庫へ 0本）", async () => {
    const f = KagiFetch.tsukuru({
      url: URL_,
      hito: () => A,
      fetch: nakaFetch,
      navigator: { onLine: false },
    });
    await expect(
      f(URL_ + "/rest/v1/t", { headers: { Authorization: "Bearer " + ANON } })
    ).rejects.toThrow(TypeError);
    expect(okutta.length).toBe(0);
  });
});

describe("通す（今の 動きの まま）", () => {
  it("③ A の 鍵＝通る（倉庫へ 1本・A の 鍵で）", async () => {
    const sb = tsukuru();
    await hairu(sb, A);
    const r = await sb.from("invoices").update({ a: 1 }).eq("id", 1);
    expect(r.error).toBeNull();
    expect(kuraNi().length).toBe(1);
    expect(KagiFetch.kagiNoSub(kuraNi()[0].auth.replace(/^Bearer /, ""))).toBe(A);
  });
  it("④ /auth/v1/ は 公開鍵でも 通る", async () => {
    const f = KagiFetch.tsukuru({ url: URL_, hito: () => A, fetch: nakaFetch });
    await f(URL_ + "/auth/v1/token?grant_type=refresh_token", {
      headers: { Authorization: "Bearer " + ANON },
    });
    expect(okutta.length).toBe(1);
  });
  it("⑤ 入る 前（hito null）は 公開鍵でも 通る", async () => {
    hito = null;
    const sb = tsukuru();
    const r = await sb.from("invoices").select("*");
    expect(r.error).toBeNull();
    expect(kuraNi().length).toBe(1);
    expect(kireta).toBe(0);
  });
  it("倉庫の host 以外は 口の 外（通す）・住所の 字に /auth/v1/ が 混ざっても 倉庫の rest は 止める", async () => {
    const f = KagiFetch.tsukuru({
      url: URL_,
      hito: () => A,
      fetch: nakaFetch,
      navigator: { onLine: true },
    });
    await f("https://betsu.invalid/rest/v1/t", { headers: { Authorization: "Bearer " + ANON } });
    expect(okutta.length).toBe(1);
    const r = await f(URL_ + "/rest/v1/t?x=/auth/v1/", {
      headers: { Authorization: "Bearer " + ANON },
    });
    expect(r.status).toBe(401);
    expect(okutta.length).toBe(1);
  });
});

describe("作りの 守り", () => {
  it("url・hito・fetch が 無ければ 作らない（黙って 素通しに しない）", () => {
    expect(() => KagiFetch.tsukuru({ url: URL_, fetch: nakaFetch })).toThrow();
    expect(() => KagiFetch.tsukuru({ hito: () => A, fetch: nakaFetch })).toThrow();
  });
  it("kagiNoSub：読めない 鍵は null", () => {
    expect(KagiFetch.kagiNoSub(ANON)).toBeNull();
    expect(KagiFetch.kagiNoSub("abc")).toBeNull();
    expect(KagiFetch.kagiNoSub("a.@@@.c")).toBeNull();
    expect(KagiFetch.kagiNoSub(kagi(A))).toBe(A);
  });
});

describe("tootta（入った人の 鍵で 通した 時だけ）", () => {
  it("A の 鍵で 通す＝1回／公開鍵・B の 鍵・/auth/v1/・入る 前＝0回", async () => {
    const sb = tsukuru();
    await sb.from("t").select("*"); // 公開鍵＝KAGI_KIRE
    expect(tootta).toBe(0);
    await hairu(sb, B); // /auth/v1/user は 通す が tootta 0
    expect(tootta).toBe(0);
    await sb.from("t").select("*"); // B＝KAGI_HITO
    expect(tootta).toBe(0);
    await hairu(sb, A);
    await sb.from("t").update({ a: 1 }).eq("id", 1);
    expect(tootta).toBe(1);
    hito = null;
    await sb.from("t").select("*");
    expect(tootta).toBe(1);
  });
});
