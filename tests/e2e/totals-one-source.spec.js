import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★同じ請求書の合計が 紙(PDF)・Excel・エンジンで1円も違わない★ 2026-08-11
//
//   ★なぜ★
//     合計を足す所が ★4つ★ に分かれていた:
//       invoice-pdf.js の tax10（エレガント・クラシックで2回）
//       daikou-seikyu.html の Excel の合計欄
//       daikou-seikyu.html の tax10（★誰も呼んでいない写し★）
//     今は答えが同じでも、片方だけ直せば ★同じ請求書の合計が紙とExcelで食い違う★。
//     請求書アプリは同じ型で ★1,111,000 を請求しながら 997,900 と書き、
//     11,000円 少なく振り込まれる★所まで行った（指示役の共有）。
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「請求」 2. 月 3. 会社
//     4.「📄 PDFで保存 / 送る」 5.「📊 Excelに書き出し」→「📥 このExcelを作る」
//
//   ※ 画面のプレビューは ★PDFをそのまま canvas に描いた物★なので、PDFを見れば画面も見た事になる。
// ============================================================

test.setTimeout(180000);

const CO = "飛勝工業株式会社";
// 端数が出る額にする（1円のズレが見える）
const KINGAKU = [12345, 8601, 9407];

function seed(amounts) {
  const uid = "u_tot";
  const co = "飛勝工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: amounts.map((a, i) => ({
          id: "m" + i,
          user_id: uid,
          company: co,
          date: "2026-05-0" + (i + 1),
          destination: "現場" + i,
          amount: a,
          note: "",
          distance: null,
          people: 1,
          name: "",
          extra: null,
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        })),
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
              issuer:
                "合同会社ZEROact\nZERO代行\n〒794-0018\n今治市本町7-3-40　00コーポ1号\nTEL090-5716-1946\n登録番号：T3500003003293",
              bank: "伊予銀行",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

// ★PDFの文字は 画面の中の pdf.js で読む★（自前で解くと壊れる。実績のある道具を使う）
async function pdfText(page, file) {
  const bytes = Array.from(fs.readFileSync(file));
  return await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    return (await pg.getTextContent()).items.map((i) => i.str);
  }, bytes);
}

test("★紙とExcelとエンジンの合計が1円も違わない★", async ({ page }) => {
  const OUT = path.join("test-results", "totals");
  fs.mkdirSync(OUT, { recursive: true });

  // ★CDNは塞がない★：Excel を作る XLSX は CDN から来る（塞ぐと Excel が測れない）
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, KINGAKU);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });

  // ① エンジンの答え（唯一の計算元）
  const engine = await page.evaluate(() => {
    const rows = window.DB.filter((r) => r.会社名 === "飛勝工業株式会社");
    return window.MeisaiEngine.invoiceTotals(rows, {});
  });
  expect(engine.shoukei, "見本の合計が違う").toBe(KINGAKU.reduce((a, b) => a + b, 0));

  // ② 紙（PDF）
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /PDFで保存/ }).click();
  const pdfPath = path.join(OUT, "t.pdf");
  await (await dl).saveAs(pdfPath);
  const t = await pdfText(page, pdfPath);
  const yen = (v) => "¥" + v.toLocaleString("en-US");
  expect(t, `★紙の小計が違う（エンジン=${yen(engine.shoukei)}）\n${t.join(" / ")}`).toContain(
    yen(engine.shoukei)
  );
  expect(t, `★紙の消費税が違う（エンジン=${yen(engine.zei)}）`).toContain(yen(engine.zei));

  // ③ Excel
  await page.waitForFunction(() => !!window.XLSX && !!window.XLSX.write, null, { timeout: 60000 });
  await page.getByRole("button", { name: /Excelに書き出し/ }).click();
  const picker = page.locator("#modalBody");
  await expect(picker.getByText("入れる内容")).toBeVisible();
  const xdl = page.waitForEvent("download", { timeout: 120000 });
  await picker.getByRole("button", { name: /このExcelを作る/ }).click();
  const xlPath = path.join(OUT, "t.xlsx");
  await (await xdl).saveAs(xlPath);

  // Excelのセルの値に 小計・消費税・合計 が在るか
  const vals = await page.evaluate(
    async (arr) => {
      const wb = window.XLSX.read(new Uint8Array(arr), { type: "array" });
      const out = [];
      for (const n of wb.SheetNames) {
        const ws = wb.Sheets[n];
        for (const k of Object.keys(ws))
          if (k[0] !== "!" && typeof ws[k].v === "number") out.push(ws[k].v);
      }
      return out;
    },
    Array.from(fs.readFileSync(xlPath))
  );

  expect(vals, `★Excelの小計が違う（エンジン=${engine.shoukei}）`).toContain(engine.shoukei);
  expect(vals, `★Excelの消費税が違う（エンジン=${engine.zei}）`).toContain(engine.zei);
  expect(vals, `★Excelの合計が違う（エンジン=${engine.goukei}）`).toContain(engine.goukei);

  // ④ ★言葉も3つで同じか★（半角/全角カッコまで含めて1文字も違わない）
  const L = await page.evaluate(() =>
    window.MeisaiEngine.totalsLabels(window.MASTER["飛勝工業株式会社"], {})
  );
  expect(
    t,
    `★紙の税の言い方が違う（エンジン=${L.消費税}）
${t.join(" / ")}`
  ).toContain(L.消費税);
  expect(t, "紙の小計の言い方が違う").toContain(L.小計);

  const xtext = await page.evaluate(
    async (arr) => {
      const wb = window.XLSX.read(new Uint8Array(arr), { type: "array" });
      const out = [];
      for (const n of wb.SheetNames) {
        const ws = wb.Sheets[n];
        for (const k of Object.keys(ws))
          if (k[0] !== "!" && typeof ws[k].v === "string") out.push(ws[k].v);
      }
      return out;
    },
    Array.from(fs.readFileSync(xlPath))
  );
  expect(xtext, `★Excelの税の言い方が違う（エンジン=${L.消費税}）`).toContain(L.消費税);
  expect(xtext, "Excelの小計の言い方が違う").toContain(L.小計);
});

// ★率を文字で書かない★（指示役 2026-08-12）
//   "10%" と直書きすると、率が変わった日・軽減税率が混ざった日に ★言葉だけ嘘になる★。
//   率は計算に使った値（TAX_RATE）から組み立てる。
test("★紙とExcelを作る所に 率の直書きが1つも無い★", async () => {
  const fsx = await import("node:fs");
  const bad = [];
  for (const f of ["invoice-pdf.js", "daikou-seikyu.html", "meisai-engine.js"]) {
    // ★複数行の注釈は 先に丸ごと落とす★
    //   行ごとに落とそうとすると /* … */ が跨いだ分を落とせず、
    //   ★自分が書いた説明文を「率の直書き」として拾ってしまう★（実際に踏んだ）。
    const src = fsx
      .readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    src.split("\n").forEach((L, i) => {
      const code = L.replace(/\/\/.*$/, "");
      if (/["'][^"']*\d+\s*%[^"']*["']/.test(code) && /消費税|税率|tax/i.test(code)) {
        bad.push(`${f}:${i + 1} ${L.trim().slice(0, 70)}`);
      }
    });
  }
  expect(bad, "★率を文字で書いている:\n  " + bad.join("\n  ")).toEqual([]);
});
