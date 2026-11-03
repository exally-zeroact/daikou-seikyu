import { test, expect } from "@playwright/test";
// ============================================================
// ★外から読むだけの口（設定「外から読む」）★ 2026-11-03（司さん 11-02「外へ数を出す口＝読むだけ」）
//   対立役の 止め を 1本ずつ：
//     v2 注8 … 設定を 開く だけでは 鍵を 作らない（止めても 次に 開いた 時に 生まれない）
//     v2 注3 … 止めた 件数が 1 で なければ「止めました」と 言わない
//     作り直す＝古い 鍵は 消え 新しい 鍵が 1つ（倉庫の 関数 kagi_tsukurinaosu）
//   倉庫の 中の 守り（他人の 行・anon・表へ 直に 書けない）は scripts/sql-shiken.mjs（khaw）で 見る
// ============================================================
test.setTimeout(90000);
const UID = "u_yk";

function seed(arg) {
  const uid = "u_yk";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "y@x.com": { id: uid, email: "y@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "y@x.com" } },
      tables: {
        meisai: [],
        companies: [],
        issuer: [],
        invoices: [],
        invoice_no: [],
        payments: [],
        export_tokens: arg.kagi || [],
      },
    })
  );
}
async function hiraku(page, kagi) {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { kagi: kagi || [] });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="settings"]').click();
}
const kagiDomo = (page) =>
  page.evaluate(
    (uid) =>
      (JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.export_tokens || []).filter(
        (t) => t.user_id === uid
      ),
    UID
  );

test("★設定を開いても、外から読む札を開いても、鍵は作られない★", async ({ page }) => {
  await hiraku(page);
  await page.locator('#scr-settings .seg-btn[data-seg="yomu"]').click();
  await expect(page.locator("#yomuKagiJotai")).toContainText("鍵：ありません");
  await expect(page.locator("#yomuDasuBtn")).toHaveText("鍵を出す");
  await expect(page.locator("#yomuTomeruBtn")).toBeHidden();
  // 他の 札へ 行って 戻っても 作られない
  await page.locator('#scr-settings .seg-btn[data-seg="master"]').click();
  await page.locator('#scr-settings .seg-btn[data-seg="yomu"]').click();
  await expect(page.locator("#yomuKagiJotai")).toContainText("鍵：ありません");
  expect(await kagiDomo(page)).toEqual([]);
});

test("★鍵を出す→全部は1回だけ見える・作り直す→古い鍵は消え1つだけ・止める→0★", async ({ page }) => {
  const kiita = [];
  page.on("dialog", (d) => {
    kiita.push(d.message());
    d.accept();
  });
  await hiraku(page);
  await page.locator('#scr-settings .seg-btn[data-seg="yomu"]').click();
  await page.locator("#yomuDasuBtn").click();
  await expect(page.locator("#yomuKagiMieru")).toBeVisible();
  const k1 = await page.locator("#yomuKagi").inputValue();
  let t = await kagiDomo(page);
  expect(t.length).toBe(1);
  expect(t[0].token).toBe(k1);
  await expect(page.locator("#yomuKagiJotai")).toContainText("鍵：あり（" + k1.slice(0, 4));
  await expect(page.locator("#yomuRei")).toHaveValue(new RegExp("Bearer " + k1));
  await expect(page.locator("#yomuDasuBtn")).toHaveText("鍵を作り直す");
  expect(kiita).toEqual([]); // 初めて 出す 時は 訊かない

  // 札を 離れて 戻ると 全部は もう 見えない
  await page.locator('#scr-settings .seg-btn[data-seg="master"]').click();
  await page.locator('#scr-settings .seg-btn[data-seg="yomu"]').click();
  await expect(page.locator("#yomuKagiMieru")).toBeHidden();

  await page.locator("#yomuDasuBtn").click();
  await expect(page.locator("#yomuKagiMieru")).toBeVisible();
  const k2 = await page.locator("#yomuKagi").inputValue();
  expect(k2).not.toBe(k1);
  t = await kagiDomo(page);
  expect(t.map((x) => x.token)).toEqual([k2]);
  expect(kiita.length).toBe(1);
  expect(kiita[0]).toContain("今の鍵はすぐ使えなくなります");

  await page.locator("#yomuTomeruBtn").click();
  await expect(page.locator("#yomuKagiJotai")).toContainText("鍵：ありません");
  await expect(page.locator("#yomuTomeruBtn")).toBeHidden();
  expect(await kagiDomo(page)).toEqual([]);
  expect(kiita[1]).toContain("止めますか");
});

test("★止めた件数が1でない時は「止めました」と言わない★", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await hiraku(page, [
    { token: "kagi-mae-0000", user_id: UID, created_at: "2026-11-01T00:00:00Z" },
  ]);
  await page.evaluate(() => {
    window.__FAKE_TOMERU_USO__ = true;
  });
  await page.locator('#scr-settings .seg-btn[data-seg="yomu"]').click();
  await expect(page.locator("#yomuKagiJotai")).toContainText("鍵：あり（kagi");
  await page.locator("#yomuTomeruBtn").click();
  await expect(page.locator("#toast, .toast").first()).toContainText("止められませんでした");
});

test("★作り直しで倉庫が落ちた時は、鍵を見せず失敗を出す★", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await hiraku(page);
  await page.evaluate(() => {
    window.__FAKE_RPC_OCHIRU__ = "kagi_tsukurinaosu";
  });
  await page.locator('#scr-settings .seg-btn[data-seg="yomu"]').click();
  await page.locator("#yomuDasuBtn").click();
  await expect(page.locator("#toast, .toast").first()).toContainText("鍵を出せませんでした");
  await expect(page.locator("#yomuKagiMieru")).toBeHidden();
  expect(await kagiDomo(page)).toEqual([]);
});
