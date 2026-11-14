import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// ★2026-11-14 鍵（ログイン）が切れた後の書き込み＝★本物の supabase-js★ で流す（偽の倉庫を使わない）★
//   何を守るか：鍵が切れると supabase-js は 公開鍵（anon）で 倉庫へ 送る。倉庫は RLS で
//     PATCH/DELETE を「0行・誤り無し」で 返す＝画面は「保存しました」と 出して 倉庫に 入らない（お金）。
//     別の タブで 違う 人が 入ると、この 画面は その人の 鍵で 書く。
//   直し＝createClient の global.fetch の 口（lib/kagi-fetch.js）で 公開鍵・違う 人の 鍵を 倉庫へ 出さない。
//   ★偽の 倉庫（__EXALLY_FAKE_SB__）は SB を 丸ごと 差し替える＝口の つなぎを 通らない★（設計 4版の 止め1）
//     ＝ここは CDN の supabase-js を 手元の UMD（node_modules・2.111.0。送り口 fetchWithAuth は CDN の
//     2.112.4 と 同じ＝対立役が 読み比べた）へ 差し替え、supabase.co は 全部 ここで 返す（外へ 0本）。
//   倉庫の 返りは テスト倉庫で 測った 本物の 形：公開鍵の PATCH/DELETE＝誤り無しの 0行・POST＝42501。
// ★向き先（テスト線は khaw・本番は tnfw）は 決め打ちせず daikou-seikyu.html から 読む★
//   （11-14 本番前 taiketsu 止め1＝決め打ちで 本番の枝だけ 13本 赤だった）
const HTML = readFileSync("daikou-seikyu.html", "utf8");
function htmlNoAtai(na) {
  const m = HTML.match(new RegExp("var " + na + String.raw`\s*=\s*"([^"]+)"`));
  if (!m) throw new Error("daikou-seikyu.html に var " + na + " が 無い");
  return m[1];
}
const URL_KURA = htmlNoAtai("SUPABASE_URL");
const KAGI_NA = "sb-" + new URL(URL_KURA).hostname.split(".")[0] + "-auth-token";
const ANON = htmlNoAtai("SUPABASE_ANON");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const CO = "テスト商事カギキレ";
const UMD = readFileSync("node_modules/@supabase/supabase-js/dist/umd/supabase.js", "utf8");

function b64u(o) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
function jwt(sub) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return (
    b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({ sub, role: "authenticated", exp }) + ".x"
  );
}
function sessionOf(sub) {
  return {
    access_token: jwt(sub),
    refresh_token: "r-" + sub,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: sub,
      email: sub.slice(0, 1) + "@example.com",
      aud: "authenticated",
      role: "authenticated",
    },
  };
}
function sub(authz) {
  const t = String(authz || "").replace(/^Bearer /, "");
  if (t === ANON) return "anon";
  try {
    return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub || "?";
  } catch (e) {
    return "?";
  }
}

const ROWS = {
  companies: [
    { id: "c1", name: CO, user_id: A, items: [], config: {}, created_at: "2026-11-01T00:00:00Z" },
  ],
  meisai: [
    {
      id: "m1",
      user_id: A,
      company: CO,
      date: "2026-11-02",
      destination: "駅",
      amount: 3000,
      note: "",
      created_at: "2026-11-02T00:00:00Z",
    },
  ],
};

async function open(page, opt = {}) {
  const kaki = []; // 倉庫へ 届いた 書き込み（method・誰の 鍵・住所）
  const soto = []; // supabase.co 以外の 外（数えるだけ）
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/, (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: UMD })
  );
  await page.route(/cdn\.jsdelivr\.net\/npm\/(xlsx-js-style|jszip)@/, (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
  // 本物の 倉庫と 同じく CORS の 見出しを 付ける（無いと 件数 content-range が 画面から 見えない）
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,PUT,HEAD,OPTIONS",
    "access-control-expose-headers": "content-range",
  };
  await page.route(/supabase\.co/, async (route0) => {
    const route = {
      fulfill: (o) => route0.fulfill({ ...o, headers: { ...CORS, ...(o.headers || {}) } }),
      abort: () => route0.abort(),
    };
    const req = route0.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, body: "" });
    const u = new URL(req.url());
    const m = req.method();
    const who = sub(req.headers()["authorization"]);
    // 箱で B として 入る（パスワードの 入り）＝B の 鍵を 返す（⑨）
    if (u.pathname.startsWith("/auth/v1/token") && u.searchParams.get("grant_type") === "password")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(sessionOf(B)),
      });
    if (u.pathname.startsWith("/auth/v1/token")) {
      if (opt.tokenOsoku) await new Promise((r) => setTimeout(r, opt.tokenOsoku)); // 鍵の 更新が 遅い（③''）
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid Refresh Token: Refresh Token Not Found",
        }),
      });
    }
    if (u.pathname.startsWith("/auth/v1/")) return route.fulfill({ status: 204, body: "" });
    if (!u.pathname.startsWith("/rest/v1/")) {
      soto.push(req.url());
      return route.abort();
    }
    const tbl = u.pathname.slice("/rest/v1/".length);
    const rep = /return=representation/.test(req.headers()["prefer"] || "");
    if (m === "GET" || m === "HEAD") {
      const rows = who === A ? ROWS[tbl] || [] : [];
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0" },
        body: JSON.stringify(rows),
      });
    }
    kaki.push({ m, tbl, who });
    // その 表へ A の 書き込みが 通った 直後に 鍵を 切る（⑥ 改名の u0 の 後）
    if (opt.kiruAto && opt.kiruAto === tbl && who === A && !opt._kitta) {
      opt._kitta = true;
      await page.evaluate((k) => {
        const x = JSON.parse(localStorage.getItem(k));
        x.expires_at = Math.floor(Date.now() / 1000) - 60;
        localStorage.setItem(k, JSON.stringify(x));
      }, KAGI_NA);
    }
    if (m === "POST" && who === "anon")
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          code: "42501",
          message: "new row violates row-level security policy",
          details: null,
          hint: null,
        }),
      });
    // PATCH/DELETE：公開鍵なら RLS で 0行（誤り無し）・本人なら 当たった 行
    const hit = who === A ? [{ id: "m1" }] : [];
    if (rep)
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(hit),
      });
    return route.fulfill({ status: 204, body: "" });
  });
  page.__errs = [];
  page.on("pageerror", (e) => page.__errs.push(String(e)));
  const loads = { n: 0 };
  page.on("load", () => loads.n++);
  await page.addInitScript(
    ([k, s]) => {
      if (!sessionStorage.getItem("__t_oita")) {
        localStorage.setItem(k, JSON.stringify(s));
        sessionStorage.setItem("__t_oita", "1");
      }
    },
    [KAGI_NA, sessionOf(A)]
  );
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect
    .poll(() => page.evaluate(() => typeof CURRENT_ACCOUNT !== "undefined" && CURRENT_ACCOUNT))
    .toBe(A);
  await expect(page.locator("#loadOverlay")).not.toHaveClass(/on/);
  await expect
    .poll(() => page.evaluate((co) => !!(window.MASTER && MASTER[co] && MASTER[co]._dbid), CO))
    .toBe(true);
  return { kaki, soto, loads };
}

// 鍵を 切る＝保管の 鍵の 期限を 過去に（getSession が 更新を 呼び→400→session 無し＝本物の 道）
async function kagiKiru(page) {
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(k, JSON.stringify(s));
  }, KAGI_NA);
}
// 別の タブで B が 入った＝保管の 鍵が B の 物に なる
async function bNiKaeru(page, s) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KAGI_NA, s]);
}
async function meisaiNaosu(page) {
  await page.evaluate(() => {
    openEdit("m1");
  });
  await page.evaluate(() => saveEdit("m1"));
}

test("普段（鍵が 在る）：明細の 直しは A の 鍵で 1本・「保存しました」", async ({ page }) => {
  const { kaki, soto, loads } = await open(page);
  await meisaiNaosu(page);
  await expect(page.locator("#toast")).toContainText("保存しました");
  expect(kaki.filter((x) => x.m === "PATCH" && x.tbl === "meisai")).toEqual([
    { m: "PATCH", tbl: "meisai", who: A },
  ]);
  expect(loads.n).toBe(1); // 起動〜入る で 開き直し 0回
  expect(soto).toEqual([]);
  expect(page.__errs).toEqual([]);
});

test("鍵切れ：明細を 直して 保存＝公開鍵で 倉庫へ 出さず「保存しました」も 出さない", async ({
  page,
}) => {
  const { kaki } = await open(page);
  await kagiKiru(page);
  await meisaiNaosu(page);
  await page.waitForTimeout(800);
  expect(kaki.filter((x) => x.who === "anon")).toEqual([]);
  await expect(page.locator("#toast")).not.toContainText("保存しました");
  // 板が 出て「届いていない」・ログインの 箱が 開く
  await expect(page.locator("#kireShirase")).toBeVisible();
  await expect(page.locator("#kireShirase .kire-ji")).toContainText("届いていない");
  await expect(page.locator("#loginOv")).toHaveClass(/open/);
});

test("鍵切れ：会社の 税の 扱いを 変える＝「保存しました（請求書に反映）」を 出さない", async ({
  page,
}) => {
  const { kaki } = await open(page);
  await kagiKiru(page);
  await page.evaluate((co) => setMasterField(co, "taxMode", "外税"), CO);
  await page.waitForTimeout(1200); // toastDebounced 450ms の 後まで 待つ
  expect(kaki.filter((x) => x.who === "anon")).toEqual([]);
  await expect(page.locator("#toast")).not.toContainText("保存しました");
  await expect(page.locator("#kireShirase .kire-list")).toContainText("保存しました"); // 字は 捨てず 板へ
});

test("別の タブで B が 入った：A の 画面で 保存＝B の 鍵で 書かずに 開き直す", async ({ page }) => {
  const { kaki, loads } = await open(page);
  await bNiKaeru(page, sessionOf(B));
  await meisaiNaosu(page).catch(() => {}); // 開き直しが 速いと evaluate の 途中で 画面が 替わる（それが 正しい 動き）
  await expect.poll(() => loads.n).toBeGreaterThan(1);
  expect(kaki.filter((x) => x.who === B)).toEqual([]);
});

test("鍵切れ：自社の 登録番号を 変えて 離れる＝「保存しました」を 出さない（saveIssuer も 誤りを 飲む＝出口で 止める）", async ({
  page,
}) => {
  const { kaki } = await open(page);
  await kagiKiru(page);
  await page.evaluate(() => showScreen("settings"));
  // 欄は 畳まれた 箱の 中＝値を 入れて 打った（input）・離れた（change）の 合図を 撃つ（同じ oninput/onchange が 走る）
  await page.evaluate(() => {
    const el = document.getElementById("iss_regno");
    el.value = "T1234567890123";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(800); // 打った 時の 保存が 落ちて 失敗の 字が 出る（人は 打ってから 離れる）
  await page.evaluate(() =>
    document.getElementById("iss_regno").dispatchEvent(new Event("change", { bubbles: true }))
  );
  await page.waitForTimeout(1200);
  expect(kaki.filter((x) => x.who === "anon" && x.m !== "POST")).toEqual([]);
  await expect(page.locator("#toast")).not.toContainText("保存しました");
});

test("⑨ 鍵切れの 後に 開いた 箱で B が 入る＝開き直す・A の 会社も 打ちかけも B へ 行かない", async ({
  page,
}) => {
  const { kaki, loads } = await open(page);
  // A の 打ちかけ（画面だけの 行）
  await page.evaluate((co) => {
    document.getElementById("inputCompany").value = co;
    entryRows = [
      Object.assign(blankEntry(), { 日付: "2026-11-14", 行き先: "Aの打ちかけ", 金額: "4000" }),
    ];
  }, CO);
  expect(
    await page.evaluate(() => entryRows.filter((r) => r["行き先"] === "Aの打ちかけ").length)
  ).toBe(1);
  await kagiKiru(page);
  await meisaiNaosu(page);
  // 箱が 開くのを 待つ（直す前は 開かない＝ここで 開いて B で 入る 形に する）
  await page.waitForTimeout(800);
  const hiraita = await page.evaluate(
    () =>
      document.getElementById("loginOv") &&
      document.getElementById("loginOv").classList.contains("open")
  );
  if (!hiraita) await page.evaluate(() => ensureLogin().show());
  const n0 = loads.n;
  await page.fill("#loginEmail", "b@example.com");
  await page.fill("#loginPass", "bbbbbbbb");
  await page.click("#btnLogin");
  await page.waitForTimeout(1500);
  const ato = await page.evaluate(
    (co) => ({
      acct: typeof CURRENT_ACCOUNT !== "undefined" ? CURRENT_ACCOUNT : null,
      masterNiA: !!(window.MASTER && MASTER[co]),
      sel: Array.from(document.querySelectorAll("#inputCompany option")).map((o) => o.value),
      uchikake: (typeof entryRows !== "undefined" ? entryRows : []).filter(
        (r) => r["行き先"] === "Aの打ちかけ"
      ).length,
    }),
    CO
  );
  // B の 画面で 保存を 押しても B の 鍵で A の 物を 書かない
  await page.evaluate(() => typeof saveEntries === "function" && saveEntries()).catch(() => {});
  await page.waitForTimeout(500);
  console.log(
    "⑨ 測り",
    JSON.stringify({ reload: loads.n - n0, ...ato, bNoKaki: kaki.filter((x) => x.who === B) })
  );
  expect(loads.n - n0).toBe(1);
  expect(ato.uchikake).toBe(0);
  expect(ato.masterNiA).toBe(false);
  expect(ato.sel).not.toContain(CO);
  expect(kaki.filter((x) => x.who === B)).toEqual([]);
});

test("③' 鍵切れ：会社の 型を 変える（字が 先に 出る）＝#toast に 残さず 板へ 移す", async ({
  page,
}) => {
  const { kaki } = await open(page);
  await kagiKiru(page);
  await page.evaluate((co) => setCompanyDesign(co, Object.keys(DESIGN_VARIANTS)[1]), CO);
  await page.waitForTimeout(900);
  expect(kaki.filter((x) => x.who === "anon")).toEqual([]);
  await expect(page.locator("#toast")).not.toHaveClass(/show/);
  await expect(page.locator("#kireShirase .kire-list")).toContainText("にしました");
});

test("③'' 鍵の 更新が 2秒 遅い：先に 出て 消えた「〜にしました」も 板に 在る", async ({ page }) => {
  const { kaki } = await open(page, { tokenOsoku: 2500 });
  await kagiKiru(page);
  await page.evaluate((co) => setCompanyDesign(co, Object.keys(DESIGN_VARIANTS)[1]), CO);
  await expect(page.locator("#kireShirase")).toBeVisible({ timeout: 8000 });
  expect(kaki.filter((x) => x.who === "anon")).toEqual([]);
  await expect(page.locator("#kireShirase .kire-list")).toContainText("にしました");
});

test("⑥ 改名で 請求番号の 台帳（u0）の 後に 切れる＝「戻せませんでした」が 板に 在り、同じ人で 入り直しても 残る", async ({
  page,
}) => {
  page.on("dialog", (d) => d.accept());
  const { kaki } = await open(page, { kiruAto: "invoice_no" });
  await page.evaluate((co) => renameCompany(co, co + "新"), CO);
  await expect(page.locator("#kireShirase")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#kireShirase .kire-list")).toContainText("戻せませんでした");
  expect(kaki.filter((x) => x.who === "anon")).toEqual([]);
  // 同じ人（A）で 入り直す＝新しい A の 鍵を 置いて 開き直さず 読み直す・板は 残る
  await bNiKaeru(page, sessionOf(A));
  await page.evaluate(() => onLoggedIn({ id: LOGGED_IN_ID, email: "a@example.com" }));
  await page.waitForTimeout(500);
  await expect(page.locator("#kireShirase .kire-list")).toContainText("戻せませんでした");
  expect(await page.evaluate(() => KAGI_KIRE)).toBe(false);
});

for (const [w, h] of [
  [390, 664],
  [360, 640],
]) {
  test(`⑧ ${w}x${h}：板を 35vh まで 満たしても ログインの 箱の 欄と ボタンが 押せる`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    await kagiKiru(page);
    await meisaiNaosu(page);
    await expect(page.locator("#kireShirase")).toBeVisible();
    await page.evaluate(() => {
      for (let i = 0; i < 12; i++)
        toast("会社名の 変更が 途中で 止まり、元に 戻せませんでした（長い 字の 見本 " + i + "）");
    });
    const ita = await page.locator("#kireShirase").boundingBox();
    expect(ita.height).toBeGreaterThan(h * 0.3);
    for (const sel of ["#loginEmail", "#loginPass", "#btnLogin"]) {
      const ok = await page.evaluate((q) => {
        const el = document.querySelector(q);
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit === el || el.contains(hit);
      }, sel);
      expect(ok, sel).toBe(true);
    }
    // いちばん 上へ 戻すと 箱の 頭（ロゴ）が 板の 下に 在る（真ん中寄せの はみ出しで 送っても 見えない 所を 作らない）
    const ue = await page.evaluate(() => {
      LOGIN.el.scrollTop = 0;
      return {
        ita: document.getElementById("kireShirase").getBoundingClientRect().bottom,
        hako: LOGIN.el.querySelector(".login-card").getBoundingClientRect().top,
      };
    });
    expect(ue.hako).toBeGreaterThanOrEqual(ue.ita);
    await page.screenshot({ path: `test-results/kire-ita-${w}x${h}.png` });
  });
}

test("⑩ 鍵切れの 後の 取り消しの 帯＝板に 並び、取り消すの ボタンは 出ない", async ({ page }) => {
  await open(page);
  await kagiKiru(page);
  await meisaiNaosu(page);
  await expect(page.locator("#kireShirase")).toBeVisible();
  await page.evaluate(() => toastUndo("入金を記録しました", () => {}));
  await expect(page.locator("#kireShirase .kire-list")).toContainText("入金を記録しました");
  await expect(page.locator(".toast-undo-btn")).toHaveCount(0);
});

test("⑪ 直に fetch する 所の 門：鍵が 無い＝板・B の 鍵＝開き直す", async ({ page }) => {
  const { loads } = await open(page);
  expect(await page.evaluate(() => kagiMon(""))).toBe(false);
  await expect(page.locator("#kireShirase")).toBeVisible();
  const bKagi = sessionOf(B).access_token;
  await page.evaluate((t) => kagiMon(t), bKagi);
  await expect.poll(() => loads.n).toBeGreaterThan(1);
  await expect(page.locator("#toast")).toContainText("違う人が入ったので開き直しました");
});
