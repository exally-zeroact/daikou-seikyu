import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// ★件⑧b 2026-11-14★ ダイコメから 来た 行は「開いた 時の 額の まま」の 時だけ 書く
//   司さん「お互い修正したら反映されるようにしろ」＝事務所の 入力でも この 行の 額を 直せる。
//   開いた ままの 請求書の 画面が 古い 額で 上書きすると、入力の 直しが 黙って 消える。
//   ・別の 画面で 額が 変わっていた＝書かない・その 行を 読み直す・事務所へ 戻す 呼び出しも しない
//   ・変わっていない／料金未定（空）の 行／手で 入れた 行＝今まで 通り 書く
//   ・書けなかった（通信）＝手元の 行を 開いた 時の 姿へ 戻す（前は 一覧に 打った 額が 出た）
// ============================================================

test.setTimeout(120000);

async function hiraku(page, extra0, amount0) {
  const yobi = [];
  await page.route("**/functions/v1/**", async (r) => {
    yobi.push(r.request().url());
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        updated: 1,
        shift_total: 1,
        uriage_hazushita: 0,
        seikyu_hazushita: 0,
      }),
    });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.addInitScript(
    ([ex, am]) => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
      const b64u = (o) =>
        btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      if (db.session)
        db.session.access_token =
          b64u({ alg: "HS256", typ: "JWT" }) +
          "." +
          b64u({ sub: db.session.user.id, role: "authenticated" }) +
          ".e2e";
      const m = db.tables.meisai;
      m[0].extra = ex;
      if (am !== "mama") m[0].amount = am;
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    },
    [extra0, amount0 === undefined ? "mama" : amount0]
  );
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await page.waitForSelector("#scr-input", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);
  return yobi;
}

const DK = { dk_source: "daikome", dk_ref: "dev1:1700000000000:1" };

// 別の 画面（事務所の 入力）が 倉庫の 額を 変えた
async function betsuNoGamen(page, yen) {
  await page.evaluate((y) => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.meisai[0].amount = y;
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  }, yen);
}
const kuraNoGaku = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai[0].amount);
const temotoNoGaku = (page) => page.evaluate(() => DB.filter((x) => x.id === "m0")[0].金額);

async function hiraite(page) {
  await nav(page, "list");
  await page.evaluate(() => openEdit("m0"));
  await page.waitForTimeout(400);
}
async function hozon(page, yen) {
  await page.fill("#ed_金額", String(yen));
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
}

test("ダイコメの 行・別の 画面で 額が 変わっていた＝書かない・読み直す・事務所へ 戻さない", async ({
  page,
}) => {
  const yobi = await hiraku(page, DK);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await hozon(page, 1500);
  await expect(page.locator("#toast")).toContainText("別の画面で直されていました");
  await expect(page.locator("#toast")).toContainText("読み直しました");
  expect(await kuraNoGaku(page)).toBe(7777);
  expect(await temotoNoGaku(page)).toBe(7777);
  expect(yobi.length).toBe(0);
});

test("ダイコメの 行・変わっていない＝書く・事務所へ 戻す", async ({ page }) => {
  const yobi = await hiraku(page, DK);
  await hiraite(page);
  await hozon(page, 1500);
  // 保存の 後に 事務所へ 戻した 知らせが 上に 出る
  await expect(page.locator("#toast")).toContainText("事務所の売上も 直しました");
  expect(await kuraNoGaku(page)).toBe(1500);
  expect(yobi.filter((u) => /dk-fix-fare$/.test(u)).length).toBe(1);
});

test("ダイコメの 行・料金未定（空）＝空の まま なら 書ける", async ({ page }) => {
  await hiraku(page, DK, null);
  await hiraite(page);
  await hozon(page, 2000);
  await expect(page.locator("#toast")).toContainText("事務所の売上も 直しました");
  expect(await kuraNoGaku(page)).toBe(2000);
});

test("ダイコメの 行・料金未定（空）の 間に 別の 画面で 額が 入った＝書かない", async ({ page }) => {
  await hiraku(page, DK, null);
  await hiraite(page);
  await betsuNoGamen(page, 3300);
  await hozon(page, 2000);
  await expect(page.locator("#toast")).toContainText("別の画面で直されていました");
  expect(await kuraNoGaku(page)).toBe(3300);
});

test("手で 入れた 行は 今まで 通り（入力から 直せない＝守りは 掛けない）", async ({ page }) => {
  await hiraku(page, null);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await hozon(page, 1500);
  await expect(page.locator("#toast")).toContainText("保存しました");
  expect(await kuraNoGaku(page)).toBe(1500);
});

test("書けなかった（通信）＝手元の 行は 開いた 時の 額の まま", async ({ page }) => {
  await hiraku(page, DK);
  await hiraite(page);
  await page.evaluate(() => {
    window.__FAKE_OFFLINE__ = true;
  });
  await hozon(page, 1500);
  expect(await temotoNoGaku(page)).toBe(1200);
  expect(await kuraNoGaku(page)).toBe(1200);
});
