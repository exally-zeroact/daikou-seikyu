import { test, expect } from "@playwright/test";
// ============================================================
// 明細が 0件に なった 会社×月も 入金の 一覧に 出す 2026-10-14
//
//   前：明細を 外す／消すと 行ごと 消え、記録した 入金も 出した 請求書の 番号も 画面に 出なかった
//   今：自分の 入金の 記録か 請求番号が 在る 月だけ「明細なし」の 行で 出す（請求 ¥0）
//     ・合計・残額・バッジ・Excel（summarize）は 前と 同じ 数
//     ・窓では 額を 入れる ボタンを 出さない（押すと 記録した 入金が ¥0 に なる）
//     ・出した 時の 写しだけ（会社名を 付け替えた 古い 名前）では 出さない
// ============================================================
test.setTimeout(120000);
const A = "明細ある株式会社";
const B = "明細消えた株式会社";
const KYUU = "古い名前株式会社";

function seed() {
  return () => {
    const uid = "u_ki";
    const meisai = (id, co, date, amount) => ({
      id,
      user_id: uid,
      company: co,
      date,
      destination: "本社〜北浜",
      amount,
      note: "",
      distance: null,
      people: 1,
      name: "",
      extra: null,
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
    const kaisha = (id, name) => ({
      id,
      user_id: uid,
      name,
      items: ["日付", "行き先", "金額"],
      config: {},
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
    localStorage.setItem(
      "__fake_supa_db__",
      JSON.stringify({
        users: { "s@x.com": { id: uid, email: "s@x.com", password: "himitsu123" } },
        session: { user: { id: uid, email: "s@x.com" } },
        tables: {
          meisai: [meisai("m1", "明細ある株式会社", "2026-05-06", 15400)],
          companies: [kaisha("c1", "明細ある株式会社"), kaisha("c2", "明細消えた株式会社")],
          issuer: [
            {
              user_id: uid,
              config: {
                issuer: "合同会社ZEROact\nZERO代行",
                bank: "見本銀行",
                showInvoiceNo: true,
              },
              updated_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          payments: [
            {
              id: "p1",
              user_id: uid,
              month: "2026-05",
              company: "明細消えた株式会社",
              paid: 5000,
              paid_date: "2026-06-10",
              memo: "",
              deleted_at: null,
            },
          ],
          invoices: [
            {
              id: "i1",
              user_id: uid,
              month: "2026-05",
              company: "古い名前株式会社",
              invoice_no: "2026-05-09",
              total: 8000,
              tax: 0,
              rows_json: [{ 日付: "2026-05-02", 行き先: "本社〜北浜", 金額: 8000 }],
              issued_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ],
          invoice_no: [
            {
              user_id: uid,
              month: "2026-04",
              company: "明細消えた株式会社",
              invoice_no: "2026-04-01",
              decided_at: "2026-05-01T00:00:00.000Z",
            },
          ],
        },
      })
    );
  };
}

async function hiraku(page) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed());
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#payBody")).toContainText(A, { timeout: 20000 });
}
const gyou = (page, co, tsuki) =>
  page.locator("#payBody .pay-item").filter({ hasText: co }).filter({ hasText: tsuki });

test("明細が 0件の 月も「明細なし」で 出る・記録した 入金が 見える・合計は 前と 同じ", async ({
  page,
}) => {
  await hiraku(page);
  const b5 = gyou(page, B, "2026年5月");
  await expect(b5).toHaveCount(1);
  await expect(b5).toContainText("明細なし");
  await expect(b5).toContainText("記録した入金 ¥5,000");
  await expect(b5).not.toContainText("入金済");
  const b4 = gyou(page, B, "2026年4月"); // 請求番号だけ 在る 月
  await expect(b4).toHaveCount(1);
  await expect(b4).toContainText("明細なし");
  // 会社名を 付け替えた 古い 名前（出した 時の 写しだけ）は 出さない
  await expect(page.locator("#payBody")).not.toContainText(KYUU);
  // 合計は 明細の ある 会社 だけ（前と 同じ）
  const sum = await page.locator("#paySummary").innerText();
  expect(sum.replace(/\s/g, "")).toContain("請求¥15,400");
  expect(sum.replace(/\s/g, "")).toContain("入金¥0");
  expect(sum.replace(/\s/g, "")).toContain("残額¥15,400");
  // バッジ・Excel の 元（summarize）は 前と 同じ
  const k = await page.evaluate(() => ({
    badge: document.getElementById("payBadge").textContent,
    rows: summarize(null, "").rows.map((x) => x.company + " " + x.month),
  }));
  expect(k.badge).toBe("1");
  expect(k.rows).toEqual([A + " 2026-05"]);
  // 月の 選びに 4月が 在る
  const tsuki = await page.locator("#payMonth option").evaluateAll((o) => o.map((x) => x.value));
  expect(tsuki).toContain("2026-04");
});

test("明細なしの 窓＝額を 入れる ボタンを 出さず、記録した 入金を そのまま 見せる", async ({
  page,
}) => {
  await hiraku(page);
  await gyou(page, B, "2026年5月").click();
  await expect(page.locator("#modalBody #payKietaNote")).toContainText("¥5,000");
  await expect(page.locator("#modalBody .pay-quick")).toHaveCount(0);
  await expect(page.locator("#modalBody #pay_amt")).toHaveValue("5000");
});
