import { test, expect } from "@playwright/test";
// ============================================================
// ★★入金画面の「請求」と 請求書の「合計」が 同じ 額か（外税の 会社）★★ 2026-10-02
//
//   司さん「入金の金額が請求書と合ってない」
//   ★10-01 に 本番の 倉庫で 12通り 数えて 食い違い 0本★ … ただし ★外税の 会社が 0社★ だった。
//   ★コードを 読むと 外税の 会社は 必ず ずれる 作り★:
//     入金画面の 請求 … MeisaiEngine.listInvoices ＝ 明細の 金額を 足した だけ（税抜）
//     請求書の 合計   … MeisaiEngine.invoiceTotals ＝ 外税なら ★税抜 ＋ 消費税★
//   ⇒ 外税に した 日から ★入金画面は 消費税の 分だけ 少なく 出る★
//     （お客さんが 請求書どおり 払うと「入金 > 請求」に なる）
//
//   ★客の 道を そのまま 通る★：入金タブ → 一覧の 請求額 → 行を 押す → 確認 → PDF の 合計
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「入金」 2. 一覧の 行 3. 「確認」
//
//   ★★わざと壊して 赤に なるのを 見た（2026-10-02 実測）★★
//     直す前（入金の 3か所が listInvoices の 税抜を そのまま 使う）
//       ……… ★赤 1/1★「入金画面の 請求額が 請求書の 合計と 違う」 入金 15,400 ／ 請求書 16,940
//     直した後（seikyuList＝invoiceTotals の goukei）……… 緑 1/1 ／ 入金 16,940 ／ 請求書 16,940
// ============================================================
const CO = "外税工業株式会社";
const TSUKI = "2026-05";
// 12,000 + 3,400 = 15,400（税抜）／消費税 1,540 ／★合計 16,940★
const ZEINUKI = 15400;
const GOUKEI = 16940;
test.setTimeout(180000);

function seed() {
  const uid = "u_soto";
  const co = "外税工業株式会社";
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
            config: { taxMode: "外税" },
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [
          {
            user_id: uid,
            config: { issuer: "合同会社ZEROact\nZERO代行", bank: "伊予銀行", showInvoiceNo: true },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        payments: [],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

const kazu = (s) => Number(String(s).replace(/[^\d]/g, ""));

test("★外税の 会社：入金画面の 請求額 ＝ 請求書の 合計★", async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();

  // ★見張りが 空回り していない★＝外税が 本当に 効いている（会社の 設定が 読めている）
  expect(
    await page.evaluate((co) => (window.MASTER && MASTER[co] && MASTER[co].taxMode) || null, CO),
    "★会社の 外税が 読み込まれていない（この試験は 何も 測っていない）★"
  ).toBe("外税");

  // ① 入金画面の 上の まとめ「請求」
  const sumSeikyu = kazu(
    await page.locator("#paySummary .pay-sum-cell").first().locator(".pay-sum-val").innerText()
  );
  // ② 一覧の 行に 出る 額
  const gyou = page.locator("#payBody").getByText(CO, { exact: false }).first();
  await expect(gyou).toBeVisible({ timeout: 20000 });

  // ③ 確認 → PDF の 合計
  await gyou.click();
  const btn = page.locator("#modalBody .pay-kakunin");
  await expect(btn).toBeVisible();
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await btn.click();
  const p = await (await dl).path();
  const fsx = await import("node:fs");
  const bytes = Array.from(fsx.readFileSync(p));
  const text = await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    return (await pg.getTextContent()).items.map((i) => i.str).join("\n");
  }, bytes);
  const flat = text.replace(/\s/g, "");
  expect(flat, "★紙の 合計が 外税（税抜＋消費税）に なっていない★").toContain(
    GOUKEI.toLocaleString("en-US")
  );

  console.log("★入金画面の 請求★", sumSeikyu, "／★請求書の 合計★", GOUKEI, "／税抜", ZEINUKI);
  expect(
    sumSeikyu,
    "★★入金画面の 請求額が 請求書の 合計と 違う（外税の 消費税が 抜けている）★★"
  ).toBe(GOUKEI);
});
