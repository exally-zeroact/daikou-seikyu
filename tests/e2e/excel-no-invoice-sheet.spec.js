import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★Excelに「請求書（見た目つき）」を出さない★（司さん 2026-07-21 の決定）
//
//   ★司さん★「できんのなら請求書の書き出しはやめろ」
//     Excelはセル格子なので「中央タイトル＋真横に請求日＋直下の装飾線」だけは
//     PDFと同じにできない、と実物で確かめた上での決着。
//     ⇒ ★見た目の納品は PDF 一本／Excelは編集用データ（明細・集計・入金）に徹する★
//
//   ★なぜ見張りが要るか★
//     この決定は 2026-07-21 に出たのに ★消す作業が push されず★、
//     ★2026-08-16 まで 本番で出続けていた★（git の棚に入ったままだった）。
//     ＝「決めた」だけでは戻る。出来上がった Excel を毎回 数えて止める。
//
//   ★測るのは 出来上がった xlsx のシート名★（画面の見た目ではない）
// ============================================================

test.setTimeout(240000);

const CO = "株式会社 生野組";
const DATA_SHEETS = ["明細", "月次集計", "会社別集計", "入金"];

function seed() {
  const uid = "u_nx";
  const co = "株式会社 生野組";
  const rows = [0, 1, 2].map((i) => ({
    id: "m" + i,
    user_id: uid,
    company: co,
    date: "2026-05-0" + (i + 1),
    destination: "本社〜北浜〜曽根崎",
    amount: [12000, 8601, 9407][i],
    note: "",
    distance: null,
    people: 1,
    name: "",
    extra: null,
    created_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  }));
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: rows,
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
            config: {
              issuer: "合同会社ZEROact\nZERO代行\n登録番号：T3500003003293",
              bank: "伊予銀行　今治支店　普通　4160657",
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

test("★Excelに請求書のシートが1枚も無い（PDF一本の方針）★", async ({ page }) => {
  const OUT = path.join("test-results", "no-inv");
  fs.mkdirSync(OUT, { recursive: true });

  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });

  await page.waitForFunction(() => !!window.XLSX && !!window.XLSX.write, null, { timeout: 60000 });
  await page.getByRole("button", { name: /Excelに書き出し/ }).click();
  const picker = page.locator("#modalBody");
  await expect(picker.getByText("入れる内容")).toBeVisible();

  // ① 選ぶ所に「請求書」が出ていない（人が選べてしまわない）
  const pickText = (await picker.innerText()).replace(/\s+/g, "");
  expect(
    pickText.includes("請求書"),
    "★Excelの選ぶ所に「請求書（見た目つき）」が戻っている★"
  ).toBe(false);

  const dl = page.waitForEvent("download", { timeout: 120000 });
  await picker.getByRole("button", { name: /このExcelを作る/ }).click();
  const xlPath = path.join(OUT, "x.xlsx");
  await (await dl).saveAs(xlPath);

  // ② 出来上がった Excel のシート名を数える
  const names = await page.evaluate(async (arr) => {
    const wb = window.XLSX.read(new Uint8Array(arr), { type: "array" });
    return wb.SheetNames;
  }, Array.from(fs.readFileSync(xlPath)));

  expect(names.length, "★シートが1枚も無い（0枚の緑は未検査）★").toBeGreaterThan(0);
  // 請求書シートは ★会社名がシート名★ になる作りだった
  const inv = names.filter((n) => !DATA_SHEETS.includes(n));
  expect(
    inv,
    "★Excelに請求書のシートが出ている（会社名のシート）: " + inv.join(" / ") + "★"
  ).toEqual([]);
  expect(names.sort(), "★データのシートが欠けている★").toEqual([...DATA_SHEETS].sort());

  console.log(`[no-invoice-sheet] シート ${names.length}枚: ${names.join(" / ")}`);
});
