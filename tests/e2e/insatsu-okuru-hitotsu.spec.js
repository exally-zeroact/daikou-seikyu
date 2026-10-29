// ============================================================
// ★★「印刷 / 送る」は ボタン 1つ★★ 2026-10-29
//   司さん「代行請求のPDFで保存/送ると印刷のボタンは同じ画面が開かれるんやけん1つのボタンにして印刷/送るにまとめろ」
//   ・スマホ（iPhone）＝保存（PDF の 画面が 開き 共有から LINE・プリント）
//   ・PC＝新しい 窓で PDF を 開く（印刷・保存は その 画面から）／窓を 止められたら 保存に 落ちる
//   わざと壊す：insatsuSumaho を いつも true ⇒ ★赤★（PC で 窓が 開かない）／いつも false ⇒ ★赤★（iPhone で 保存されない）
// ============================================================
import { test, expect, devices } from "@playwright/test";

const CO = "験模工業株式会社";
// ★本番に今 入っている物と同じ形（6行）★
const HONBAN_ISSUER =
  "合同会社ZEROact\nZERO代行\n〒100-0000\n東京都架空区見本台1-2-3\nTEL000-0000-0000\n登録番号：T9000000000009";

function seed(issuerText) {
  const uid = "u_regno";
  const co = "験模工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "g@x.com": { id: uid, email: "g@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "g@x.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: co,
            date: "2026-05-06",
            destination: "本社〜北浜",
            amount: 12000,
            note: "",
            distance: null,
            people: 1,
            name: "",
            extra: null,
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: co,
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [
          {
            user_id: uid,
            config: { issuer: issuerText, bank: "見本銀行　見本支店　普通　7654321" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    })
  );
}

async function open(page) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(() => {
    window.__mado = [];
    window.open = (u) => {
      window.__mado.push(String(u));
      return { closed: false };
    };
  });
  await page.addInitScript(seed, HONBAN_ISSUER);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
}

test("★ボタンは 1つ（印刷 / 送る）・Excel は 残る★", async ({ page }) => {
  await open(page);
  const acts = page.locator(".invoice-actions");
  await expect(acts.getByRole("button", { name: /印刷 \/ 送る/ })).toHaveCount(1);
  await expect(acts.getByRole("button", { name: /^🖨/ })).toHaveCount(0);
  await expect(acts.getByRole("button", { name: /Excelに書き出し/ })).toHaveCount(1);
});

test("★PC は 新しい 窓で PDF を 開く（ダウンロードだけに しない）★", async ({ page }) => {
  await open(page);
  let dl = 0;
  page.on("download", () => dl++);
  await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
  await expect.poll(() => page.evaluate(() => window.__mado.length), { timeout: 120000 }).toBe(1);
  expect(await page.evaluate(() => window.__mado[0])).toMatch(/^blob:/);
  await page.waitForTimeout(500);
  expect(dl, "★PC で 窓を 開いたのに 保存も した★").toBe(0);
});

test.describe("iPhone", () => {
  test.use({
    userAgent: devices["iPhone 13"].userAgent,
    viewport: devices["iPhone 13"].viewport,
    isMobile: true,
    hasTouch: true,
  });
  test("★スマホは 保存（PDF の 画面が 開く）・新しい 窓は 開かない★", async ({ page }) => {
    await open(page);
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    const d = await dl;
    expect(d.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await page.evaluate(() => window.__mado.length), "★スマホで 新しい 窓を 開いた★").toBe(
      0
    );
  });
});
