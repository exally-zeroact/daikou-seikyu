import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★色を「実物」で確かめるための取り出し口★ 2026-08-10
//
//   ソースを読むだけでは色は分からない。実際に注釈と中身が食い違っていた
//   （注釈は「#2E7D54」なのに、中身は使わないと決めた濃い緑だった）。
//   だから ★本物の画面の本物のボタンを押して★ Excel と PDF を書き出し、後で色を測る。
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「設定」          … 設定画面へ
//     2. 「テンプレート」タブ       … デザインを選ぶ所へ
//     3. 「エレガント」/「クラシック」… 紙の見た目を切り替える
//     4. 下のナビ「請求」          … 請求書の画面へ
//     5. 「月」を 2026年5月 に      … select#invMonth
//     6. 「会社」を 飛勝工業株式会社 … select#invCompany
//     7. 「📄 PDFで保存 / 送る」    … → <design>.pdf
//     8. 「📊 Excelに書き出し」     … モーダルを開く
//     9. 「📥 このExcelを作る」     … → <design>.xlsx
//
//   出す場所: 環境変数 SHIKISAI_OUT（無ければ test-results/shikisai）
// ============================================================

const OUT = process.env.SHIKISAI_OUT || path.join("test-results", "shikisai");
const CO = "飛勝工業株式会社";
const DESIGNS = [
  ["elegant", "エレガント"],
  ["classic", "クラシック"],
];

function seedDb() {
  const uid = "u_shikisai";
  const co = "飛勝工業株式会社";
  const rows = [
    ["2026-05-06", "本社〜北浜〜曽根崎", 12000, "深夜"],
    ["2026-05-11", "南森町〜天満橋", 8600, ""],
    ["2026-05-18", "梅田〜十三〜塚本", 9400, "2名"],
    ["2026-05-24", "淀屋橋〜中之島", 7200, ""],
  ].map((r, i) => ({
    id: "m" + i,
    user_id: uid,
    company: co,
    date: r[0],
    destination: r[1],
    amount: r[2],
    note: r[3],
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
      users: {
        "daiko@example.com": { id: uid, email: "daiko@example.com", password: "himitsu123" },
      },
      session: { user: { id: uid, email: "daiko@example.com" } },
      tables: {
        meisai: rows,
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: co,
            // ★items を空にすると PDF は列が1本も無くなり「表が真っ白の請求書」が出る★
            //   （Excel側は既定の3列で出るので、空のままだと 紙とExcelで別物になり
            //     色の比較にならない）。実際の会社登録と同じ既定の3列を入れる。
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

for (const [design, label] of DESIGNS) {
  test(`★実物のボタンで ${label} の PDF と Excel を書き出す★`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seedDb);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });

    // 明細が本当に入っているか（0件だと「空の紙」で色も金額も測れない）
    const n = await page.evaluate(() => window.DB.filter((r) => r.会社名).length);
    expect(n, "明細が入っていない＝この後は何も測れない").toBe(4);

    // 1〜3. 設定 → テンプレート → デザインを選ぶ
    await page.locator('.nav-item[data-scr="settings"]').click();
    await page.getByRole("button", { name: "テンプレート" }).click();
    await page.locator("#designSeg").getByRole("button", { name: label }).click();
    // 本当に切り替わったか（押した気になるのを防ぐ）
    await expect
      .poll(() => page.evaluate(() => window.currentIssuer().pdfDesign), { timeout: 10000 })
      .toBe(design);

    // 4. 下のナビ「請求」
    await page.locator('.nav-item[data-scr="billing"]').click();
    await expect(page.locator("#scr-billing")).toBeVisible();

    // 5〜6. 月と会社を選ぶ
    await page.selectOption("#invMonth", "2026-05");
    await page.selectOption("#invCompany", CO);
    // プレビューは PDF を canvas に描く（DOMに文字は出ない）。読み込み終了＋canvas で待つ。
    await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
    await expect(page.locator("#invoiceOut canvas").first()).toBeVisible({ timeout: 120000 });

    // 7. 「📄 PDFで保存 / 送る」（pdf-lib＋フォント約3MBを取りに行くので長めに待つ）
    const pdfPath = path.join(OUT, design + ".pdf");
    const pdfDl = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("button", { name: /PDFで保存/ }).click();
    await (await pdfDl).saveAs(pdfPath);
    expect(fs.statSync(pdfPath).size, "空のPDF").toBeGreaterThan(50000);

    // 8. 「📊 Excelに書き出し」
    await page.waitForFunction(() => !!window.XLSX && !!window.XLSX.write, null, {
      timeout: 60000,
    });
    await page.getByRole("button", { name: /Excelに書き出し/ }).click();
    const picker = page.locator("#modalBody");
    await expect(picker.getByText("入れる内容")).toBeVisible();

    // 9. 「📥 このExcelを作る」
    const xlPath = path.join(OUT, design + ".xlsx");
    const xlDl = page.waitForEvent("download", { timeout: 120000 });
    await picker.getByRole("button", { name: /このExcelを作る/ }).click();
    await (await xlDl).saveAs(xlPath);
    expect(fs.statSync(xlPath).size, "空のExcel").toBeGreaterThan(3000);

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
}
