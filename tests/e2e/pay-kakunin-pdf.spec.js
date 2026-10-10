import { test, expect } from "@playwright/test";

// ============================================================
// ★入金画面の「確認」を 押したら 請求書の PDF が 出る★ 2026-10-01
//
//   司さん「代行請求書アプリの入金のページの……赤丸の所に確認ボタンを作って
//           押したらPDFで請求書が見れるようにしろ」
//
//   ★字の試験（tests/pay-kakunin-button.test.js）と 別に これが 要る理由★
//     あちらは ★ソースに その字が 在るか★ しか 見ていない。
//     ボタンが 画面に 出ていない／押しても 落ちる／PDF が 空 でも ★緑★ に なる。
//     ＝「見張りを 書いた」は「見張っている」では ない。
//     ここでは ★客の 道を そのまま 通る★：入金タブ → 行を 押す → 確認 を 押す。
//
//   ★一番 守りたいのは「見るだけ」★
//     押した後に `invoice_no` と `invoices` が ★1行も 増えていない★ 事を 数える。
//     （請求画面の道は 番号を 発行し 控えを 残す。確認が それを やると
//       ★覗く たびに 請求書を 発行した事に なる★）
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「入金」 2. 一覧の 行 3. 「確認」
//
//   ★★わざと壊して 赤に なるのを 見た（2026-10-01 実測）★★
//     壊す前 ………………………………………… 赤 0 / 全 2
//     確認の 中で invoiceNoPeek → issueInvoiceNo に 戻す
//       ……………………………………………… ★赤 2 / 2★
//       出た字：「★覗いただけ なのに 請求番号が 発行された★」
//       ＝この試験は ★本当に 倉庫の 行を 数えている★
//     戻した後 ………………………………………… 赤 0 / 全 2
// ============================================================

const CO = "飛勝工業株式会社";
const TSUKI = "2026-05";

// ★3MBのPDFを作って 中身の字まで 読む★ ので 既定の30秒では 時間切れで 赤に なる。
test.setTimeout(180000);

function seed() {
  const uid = "u_kakunin";
  const co = "飛勝工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "c@x.com": { id: uid, email: "c@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "c@x.com" } },
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
          {
            id: "m2",
            user_id: uid,
            company: co,
            date: "2026-05-07",
            destination: "北浜〜本社",
            amount: 3400,
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
            id: "c2",
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
            config: {
              issuer: "合同会社ZEROact\nZERO代行\n東京都架空区見本台1-2-3",
              bank: "見本銀行",
              showInvoiceNo: true,
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
}

async function hiraku(page) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  // ★新しい窓は 開かせない★＝確認は 保存に 落ちる（PDFの 中身を 読める）
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();
}

test("★入金の「確認」で 請求書の PDF が 出る／しかも 1行も 書かない★", async ({ page }) => {
  await hiraku(page);

  // ★押す前に 数える★（後で「増えていない」と 言う為の 分母）
  const mae = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem("__fake_supa_db__")).tables;
    return { no: (t.invoice_no || []).length, copy: (t.invoices || []).length };
  });
  expect(mae.no, "★はじめから 番号が 在る＝この試験では 増減を 測れない★").toBe(0);
  expect(mae.copy, "★はじめから 控えが 在る★").toBe(0);

  // 一覧に その 請求が 出ている
  const gyou = page.locator("#payBody").getByText(CO, { exact: false }).first();
  await expect(gyou, "★入金の 一覧に 請求が 出ていない★").toBeVisible({ timeout: 20000 });
  await gyou.click();

  // モーダルが 開き、★確認ボタンが 見えている★
  const btn = page.locator("#modalBody .pay-kakunin");
  await expect(btn, "★確認ボタンが 画面に 出ていない★").toBeVisible();
  await expect(btn).toHaveText("確認");

  // 押す → 新しい窓は 塞いだので 保存に 落ちる
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await btn.click();
  const download = await dl;
  expect(download.suggestedFilename(), "★ファイル名が 請求書に なっていない★").toContain(
    "請求書_" + TSUKI + "_" + CO
  );

  // ★PDFの 中身を 読む★（空の 紙を 緑に しない）
  const p = await download.path();
  const fsx = await import("node:fs");
  const bytes = Array.from(fsx.readFileSync(p));
  expect(bytes.length, "★PDFが 空★").toBeGreaterThan(10000);
  const text = await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    return (await pg.getTextContent()).items.map((i) => i.str).join("\n");
  }, bytes);
  expect(text, "★紙に 会社名が 無い★").toContain(CO);
  // 12,000 + 3,400 = 15,400（内税＝そのまま）
  expect(text.replace(/\s/g, ""), "★紙に 請求額が 無い★").toContain("15,400");

  // ★★見るだけ＝1行も 書いていない★★
  const ato = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem("__fake_supa_db__")).tables;
    return { no: (t.invoice_no || []).length, copy: (t.invoices || []).length };
  });
  expect(ato.no, "★覗いただけ なのに 請求番号が 発行された★").toBe(0);
  expect(ato.copy, "★覗いただけ なのに 控えが 残った★").toBe(0);
});

test("★確認を 2回 押しても 何も 増えない★", async ({ page }) => {
  await hiraku(page);
  const gyou = page.locator("#payBody").getByText(CO, { exact: false }).first();
  await expect(gyou).toBeVisible({ timeout: 20000 });
  await gyou.click();
  const btn = page.locator("#modalBody .pay-kakunin");
  for (let i = 0; i < 2; i++) {
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await btn.click();
    await dl;
  }
  const ato = await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem("__fake_supa_db__")).tables;
    return { no: (t.invoice_no || []).length, copy: (t.invoices || []).length };
  });
  expect(ato.no, "★2回 覗いたら 番号が 増えた★").toBe(0);
  expect(ato.copy, "★2回 覗いたら 控えが 増えた★").toBe(0);
});
