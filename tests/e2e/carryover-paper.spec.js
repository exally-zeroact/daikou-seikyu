import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★繰越を選んだ会社の紙／選んでいない会社の紙★ 2026-08-12
//
//   ★合格条件（指示役）★
//     ・★繰越を使わない会社の紙が1文字も変わらない★（既定は「使わない」）
//     ・★手計算した値を必ず埋める★（一致だけの試験にしない）
//     ・前回が無い＝「前回の請求はありません」／入金が読めない＝「入金は未確認」（0円と書かない）
//     ・★外税の会社の紙を実際に出して「外税」と刷られる事★（UIが無いまま出来ていると数えない）
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「請求」 2. 月 3. 会社 4.「📄 PDFで保存 / 送る」
// ============================================================

test.setTimeout(180000);

const OUT = path.join("test-results", "carry");
const UID = "u_carry";

// 手で計算した例：
//   2026-05 に 37,200 請求（控えあり）／20,000 入金 → 残り 17,200
//   2026-06 は 12,000 請求 ／ 入金 5,000
//     合計請求額 = 12,000 + 17,200 = 29,200
//     今回お支払額 = 29,200 − 5,000 = 24,200
function seed(opt) {
  const uid = "u_carry";
  const mk = (id, co, date, amount) => ({
    id,
    user_id: uid,
    company: co,
    date,
    destination: "現場",
    amount,
    note: "",
    distance: null,
    people: 1,
    name: "",
    extra: null,
    created_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  });
  const conf = (extra) =>
    Object.assign({ widths: {}, aligns: {}, lead: "", tableTitle: "", noteSummary: false }, extra);
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [
          mk("m1", "繰越あり社", "2026-05-06", 37200),
          mk("m2", "繰越あり社", "2026-06-06", 12000),
          mk("m3", "繰越なし社", "2026-06-06", 12000),
          mk("m4", "外税社", "2026-06-06", 10000),
        ],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: "繰越あり社",
            items: ["日付", "行き先", "金額"],
            config: conf({ carryover: opt.carry }),
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "c2",
            user_id: uid,
            name: "繰越なし社",
            items: ["日付", "行き先", "金額"],
            config: conf({}),
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "c3",
            user_id: uid,
            name: "外税社",
            items: ["日付", "行き先", "金額"],
            config: conf({ taxMode: "外税" }),
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
        // ★2026-05 の控え（渡した紙）と 入金★
        invoices: opt.copy
          ? [
              {
                id: "i1",
                user_id: uid,
                month: "2026-05",
                company: "繰越あり社",
                invoice_no: "2026-05-01",
                issued_at: "2026-06-01T00:00:00.000Z",
                total: 37200,
                tax: 3382,
                rows_json: [],
                issuer_json: {},
                design_json: {},
                carry_json: null,
                deleted_at: null,
              },
            ]
          : [],
        invoice_no: [],
        payments: [
          {
            id: "p1",
            user_id: uid,
            month: "2026-05",
            company: "繰越あり社",
            paid: 20000,
            paid_date: "2026-06-20",
            memo: "",
            created_at: "2026-06-20T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "p2",
            user_id: uid,
            month: "2026-06",
            company: "繰越あり社",
            paid: 5000,
            paid_date: "2026-07-20",
            memo: "",
            created_at: "2026-07-20T00:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

async function kami(page, co, month, opt) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, opt);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", month);
  await page.selectOption("#invCompany", co);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /PDFで保存/ }).click();
  // ★名前に条件を全部入れる★（並列で走るので、同じ名前だと EBUSY で1本だけ落ちる＝実際に踏んだ）
  const f = path.join(
    OUT,
    [co, month, opt.carry ? "carry-on" : "carry-off", opt.copy ? "copy" : "nocopy"].join("_") +
      ".pdf"
  );
  await (await dl).saveAs(f);
  const bytes = Array.from(fs.readFileSync(f));
  return await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    return (await pg.getTextContent()).items.map((i) => i.str);
  }, bytes);
}

test("★繰越を使う会社：手で計算した値が紙に出る★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: true });
  const j = t.join(" / ");
  expect(t, "前回繰越額の見出しが無い\n" + j).toContain("前回繰越額");
  expect(t, "★前回繰越が 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★合計請求額が 29,200 でない★\n" + j).toContain("¥29,200");
  expect(t, "★今回お支払額が 24,200 でない★\n" + j).toContain("¥24,200");
});

test("★繰越を使わない会社：紙に繰越の言葉が1つも出ない★", async ({ page }) => {
  const t = await kami(page, "繰越なし社", "2026-06", { carry: true, copy: true });
  for (const w of ["前回繰越額", "合計請求額", "今回お支払額", "ご入金額"]) {
    expect(t.join(" / "), `★繰越を選んでいないのに「${w}」が出ている★`).not.toContain(w);
  }
});

test("★前回の請求が無い会社：0円と書かず「前回の請求はありません」★", async ({ page }) => {
  // 控えを入れない＝2026-05 の紙が残っていない
  const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: false });
  const j = t.join(" / ");
  expect(j, "★読めないのに 0円と書いている★").not.toContain("¥0");
  expect(
    t.some((x) => /前回の請求(はありません|額が読めません)/.test(x)),
    "★理由が出ていない★\n" + j
  ).toBe(true);
});

test("★外税の会社：紙に「外税」と刷られる★", async ({ page }) => {
  const t = await kami(page, "外税社", "2026-06", { carry: false, copy: false });
  const j = t.join(" / ");
  expect(
    t.some((x) => x.includes("外税")),
    "★外税を選んだのに 内税と刷られている★\n" + j
  ).toBe(true);
  // 外税＝10,000 に 1,000 を足して 11,000
  expect(t, "★外税の合計が違う★\n" + j).toContain("¥11,000");
});

// ★Excelでも同じ数が出るか（紙だけ見て終わりにしない）★
//   指示役の指摘：Excel側の繰越は ★コードを通しただけで 実物を数えていなかった★。
test("★Excelにも繰越が出て、紙と同じ数★", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-06");
  await page.selectOption("#invCompany", "繰越あり社");
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });

  await page.waitForFunction(() => !!window.XLSX && !!window.XLSX.write, null, { timeout: 60000 });
  await page.getByRole("button", { name: /Excelに書き出し/ }).click();
  const picker = page.locator("#modalBody");
  await expect(picker.getByText("入れる内容")).toBeVisible();
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await picker.getByRole("button", { name: /このExcelを作る/ }).click();
  const f = path.join(OUT, "carry.xlsx");
  await (await dl).saveAs(f);

  const cells = await page.evaluate(
    async (arr) => {
      const wb = window.XLSX.read(new Uint8Array(arr), { type: "array" });
      const txt = [],
        num = [];
      for (const n of wb.SheetNames) {
        const ws = wb.Sheets[n];
        for (const k of Object.keys(ws)) {
          if (k[0] === "!") continue;
          if (typeof ws[k].v === "string") txt.push(ws[k].v);
          if (typeof ws[k].v === "number") num.push(ws[k].v);
        }
      }
      return { txt, num };
    },
    Array.from(fs.readFileSync(f))
  );

  // ★言葉★
  for (const w of ["前回繰越額", "合計請求額", "ご入金額", "今回お支払額"]) {
    expect(cells.txt, `★Excelに「${w}」が無い★`).toContain(w);
  }
  // ★数（手計算：37,200−20,000=17,200 ／ +12,000=29,200 ／ −5,000=24,200）★
  expect(cells.num, "★Excelの前回繰越が 17,200 でない★").toContain(17200);
  expect(cells.num, "★Excelの合計請求額が 29,200 でない★").toContain(29200);
  expect(cells.num, "★Excelの今回お支払額が 24,200 でない★").toContain(24200);
});

// ★長い言葉が 紙の中で重ならないか★
//   「今回お支払額」は今までで一番長い見出し。値と重なると紙が読めなくなる。
test("★紙の中で 見出しと金額が重ならない★", async ({ page }) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-06");
  await page.selectOption("#invCompany", "繰越あり社");
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /PDFで保存/ }).click();
  const f = path.join(OUT, "kasanari.pdf");
  await (await dl).saveAs(f);

  // ★文字の置き場所と幅を取り、同じ行で重なっていないか数える★
  const items = await page.evaluate(
    async (arr) => {
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
      const pg = await doc.getPage(1);
      const c = await pg.getTextContent();
      return c.items.map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    },
    Array.from(fs.readFileSync(f))
  );

  // ★同じ文字どうしは見ない★
  //   太字は「同じ文字を0.02ptずつずらして3回 重ね書き」して作っている（疑似ボールド）。
  //   それを重なりとして数えると ★必ず赤になる見張り＝誰も見なくなる★（実際に踏んだ）。
  const kasanari = [];
  for (const a of items) {
    for (const b of items) {
      if (a === b) continue;
      if (a.s.trim() === b.s.trim()) continue; // 疑似ボールドの重ね書き
      if (!a.s.trim() || !b.s.trim()) continue; // 空白だけの物
      if (Math.abs(a.y - b.y) > 2) continue; // 同じ行だけ
      if (a.x < b.x && a.x + a.w > b.x + 0.5) kasanari.push(`「${a.s}」と「${b.s}」`);
    }
  }
  expect(kasanari, "★紙の中で文字が重なっている:\n  " + kasanari.join("\n  ")).toEqual([]);
});
