import { test, expect } from "@playwright/test";
// ============================================================
// ★「よく行く所」の 釦は 字を onclick に 埋めない★ 2026-11-03（③下書きを 作った後の 対立役 注3）
//   前は ' を &#39; に して 埋めていた＝HTML の 属性の 中で ' に 戻り、行き先 x');…;(' で スクリプトが 走った。
//   AI の 下書きで 伝票の 字が 外から 届く 道が できたので、番号で 渡す 形に した。値は 作り物。
// ============================================================
test.setTimeout(90000);
const D = "x');window.__xss2=1;('";
function seed(d) {
  const uid = "u_dc";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "d@x.com": { id: uid, email: "d@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "d@x.com" } },
      tables: {
        meisai: [
          {
            id: "m0",
            user_id: uid,
            company: "作り物商事",
            date: "2026-10-01",
            destination: d,
            amount: 1000,
            note: "",
            distance: null,
            people: 1,
            name: "",
            extra: null,
            created_at: "2026-10-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        companies: [
          {
            id: "c0",
            user_id: uid,
            name: "作り物商事",
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [],
        invoices: [],
        invoice_no: [],
        payments: [],
        export_tokens: [],
      },
    })
  );
}

test("行き先に ' と ; が 在っても 押して 走らず、字が そのまま 入る", async ({ page }) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, D);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator("#inputCompany").selectOption("作り物商事");
  const chip = page.locator("#entryBody .dest-chip").first();
  await expect(chip).toBeVisible();
  await chip.click();
  expect(await page.evaluate(() => window.__xss2)).toBeUndefined();
  await expect(page.locator("#entryBody .sugg-wrap .entry-inp").first()).toHaveValue(D);
});
