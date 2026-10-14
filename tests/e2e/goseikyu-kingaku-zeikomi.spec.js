import { test, expect } from "@playwright/test";
// ============================================================
// 請求書の 一番 大きい 数「御請求金額（税込）」は 税込の 合計 2026-10-14
//
//   対立役が コードから 見つけた：invoice-pdf.js の grand は 明細の 金額を そのまま 足した 数。
//   内税の 会社は 金額＝税込 なので 合う が、外税の 会社は ★税抜の 額に「税込」と 書いて★ 刷っていた
//   （その 下の「合計」は 税抜＋消費税＝税込 で、同じ 紙に 2つの 額が 出る）。
//   入金の 画面と 繰越は 前から 税込（invoiceTotals の goukei）を 使っている。
//
//   客の 道：入金 → 一覧の 行 → 確認 → PDF（本物の 紙を 描いて 字を 読む）
// ============================================================
test.setTimeout(180000);
const kazu = (s) => Number(String(s).replace(/[^\d]/g, ""));

function seedOf() {
  return (arg) => {
    const tm = arg.tm;
    const uid = "u_zei";
    const co = "税の試し株式会社";
    const meisai = (id, date, amount) => ({
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
    localStorage.setItem(
      "__fake_supa_db__",
      JSON.stringify({
        users: { "s@x.com": { id: uid, email: "s@x.com", password: "himitsu123" } },
        session: { user: { id: uid, email: "s@x.com" } },
        tables: {
          meisai: [meisai("m1", "2026-05-06", 12000), meisai("m2", "2026-05-07", 3400)],
          companies: [
            {
              id: "c1",
              user_id: uid,
              name: co,
              items: ["日付", "行き先", "金額"],
              config: tm ? { taxMode: tm } : {},
              created_at: "2026-05-01T00:00:00.000Z",
              deleted_at: null,
            },
          ],
          issuer: [
            {
              user_id: uid,
              config: {
                issuer: "合同会社ZEROact\nZERO代行",
                bank: "見本銀行",
                showInvoiceNo: true,
                ...(arg.design ? { pdfDesign: arg.design } : {}),
              },
              updated_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          payments: [],
          invoices: [],
          invoice_no: [],
        },
      })
    );
  };
}

for (const [na, tm, goukei, design] of [
  ["外税（15,400＋消費税 1,540）", "外税", 16940, null],
  ["内税（金額＝税込）", "内税", 15400, null],
  ["外税・クラシックの 紙", "外税", 16940, "classic"],
  ["内税・クラシックの 紙", "内税", 15400, "classic"],
]) {
  test("御請求金額（税込）＝ 紙の 合計：" + na, async ({ page }) => {
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seedOf(), { tm, design });
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
    await page.locator('.nav-item[data-scr="payment"]').click();
    const gyou = page.locator("#payBody").getByText("税の試し株式会社", { exact: false }).first();
    await expect(gyou).toBeVisible({ timeout: 20000 });
    await gyou.click();
    const btn = page.locator("#modalBody .pay-kakunin");
    await expect(btn).toBeVisible();
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await btn.click();
    const p = await (await dl).path();
    const fsx = await import("node:fs");
    const bytes = Array.from(fsx.readFileSync(p));
    const items = await page.evaluate(async (arr) => {
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
      const pg = await doc.getPage(1);
      return (await pg.getTextContent()).items.map((i) => i.str).filter((s) => s.trim());
    }, bytes);
    const i = items.findIndex((s) => /御請求金額|ご請求金額/.test(s));
    expect(i, "紙に 御請求金額 が 無い").toBeGreaterThanOrEqual(0);
    // ラベルの 後で 最初に 出る ¥ の 額（太字は 3回 重ねて 描くので 同じ 字が 続く）
    const atai = items.slice(i + 1).find((s) => /[¥￥]\s*[\d,]+/.test(s));

    console.log(na, "御請求金額 =", atai, "／ 合計 =", goukei);
    expect(kazu(atai), "御請求金額（税込）が 紙の 合計（税込）と 違う").toBe(goukei);
  });
}
