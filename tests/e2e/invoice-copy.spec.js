import { test, expect } from "@playwright/test";

// ============================================================
// ★A 請求書を保存する（発行した瞬間に写しを残す）★ 2026-08-11
//
//   ★直す前に実測した事★
//     控えを置く棚が1つも無く、PDFは端末に落とすだけ。請求書は毎回 明細から計算し直す。
//     明細を 12,000→9,000 に直して同じ月を出すと ★請求額も 9,000 に変わった★
//     ＝過去に渡した紙と 出し直した紙が食い違い、止める物が無い。
//
//   ★ここで守ること★
//     1. 出した瞬間に ★控えが1行 残る★（明細・自社情報・様式の写しつき）
//     2. ★明細を後から直しても 出した控えの金額は変わらない★
//     3. 番号は ★台帳に止まり、2回目に出しても同じ★
//     4. ★凍結しても 今 見えている番号は1つも変わらない★（凍結した瞬間に動いたら事故）
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「請求」 2. 月 3. 会社 4.「📄 PDFで保存 / 送る」
// ============================================================

const CO = "飛勝工業株式会社";

// ★この試験は 3MBのPDFを2通 作って 中身の文字まで読む★
//   既定の30秒だと、全部まとめて回した時に ★中身ではなく時間切れで赤★になる（実際になった）。
//   assert を緩めるのではなく 時間を伸ばす。
test.setTimeout(180000);
function seed(amount) {
  const uid = "u_copy";
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
            amount,
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
            name: "あ社",
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
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
              issuer:
                "合同会社ZEROact\nZERO代行\n〒794-0018\n今治市本町7-3-40　00コーポ1号\nTEL090-5716-1946\n登録番号：T3500003003293",
              bank: "伊予銀行",
              showInvoiceNo: true, // ★紙にも番号を出す＝紙の番号まで数えるため★
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

async function open(page, amount) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, amount);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
}

// 出たPDFの中から 請求書番号（No.）を読む
async function noOnPaper(page, download) {
  const p = await download.path();
  const fsx = await import("node:fs");
  const bytes = Array.from(fsx.readFileSync(p));
  const text = await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    return (await pg.getTextContent()).items.map((i) => i.str).join("\n");
  }, bytes);
  const m = text.match(/No\.?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  if (!m) throw new Error("★紙に番号が出ていない★\n" + text.slice(0, 300));
  return m[1];
}

const cloud = () => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables;

test("★凍結しても 今 見えている番号は1つも変わらない★", async ({ page }) => {
  await open(page, 12000);
  const r = await page.evaluate(() => {
    const out = {};
    for (const co of Object.keys(window.MASTER)) {
      out[co] = {
        ima: window.MeisaiEngine.invoiceNoFor(window.MASTER, window.CURRENT_ACCOUNT, "2026-05", co),
        kore: window.invoiceNoFrozen("2026-05", co),
      };
    }
    return out;
  });
  for (const [co, v] of Object.entries(r)) {
    expect(v.kore, `★${co} の番号が凍結で変わった★ ${v.ima} → ${v.kore}`).toBe(v.ima);
  }
});

test("★出した瞬間に控えが残り、明細を直しても その控えは変わらない★", async ({ page }) => {
  await open(page, 12000);

  // 出す（実物のボタン）
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /PDFで保存/ }).click();
  const kami1 = await noOnPaper(page, await dl);
  await page.waitForTimeout(400);

  const after1 = await page.evaluate(cloud);
  expect(after1.invoices.length, "★控えが残っていない★").toBe(1);
  expect(after1.invoices[0].total, "控えの金額が違う").toBe(12000);
  expect(after1.invoices[0].company).toBe(CO);
  expect(after1.invoice_no.length, "★番号が台帳に止まっていない★").toBe(1);
  const no1 = after1.invoice_no[0].invoice_no;
  expect(after1.invoices[0].invoice_no).toBe(no1);
  expect(kami1, "★紙の番号と台帳の番号が違う★").toBe(no1);
  // 写しの中身（明細・自社情報・様式）
  expect(after1.invoices[0].rows_json.length, "明細の写しが無い").toBe(1);
  expect(after1.invoices[0].rows_json[0].金額).toBe(12000);
  expect(after1.invoices[0].issuer_json.regno, "登録番号の写しが無い").toBe("T3500003003293");

  // ★明細を後から直す＋会社を1社 足す（同じ画面で）★
  //   会社を足さないと 番号は元々動かないので、
  //   ★「台帳を見ずに毎回 計算する」実装でも試験が通ってしまう★（実際に踏んだ）。
  //   足した上で「番号が変わらない」を見て初めて 凍結を確かめた事になる。
  const wouldBe = await page.evaluate(() => {
    const r = window.DB.find((x) => x.会社名 === "飛勝工業株式会社");
    r.金額 = 9000;
    // 先頭に来る会社を足す＝計算し直すと 飛勝工業の番号は必ず後ろへずれる
    window.MASTER = Object.assign(
      {
        "＿先頭に入る会社": {
          account_id: window.CURRENT_ACCOUNT,
          items: [],
          widths: {},
          aligns: {},
        },
      },
      window.MASTER
    );
    return window.MeisaiEngine.invoiceNoFor(
      window.MASTER,
      window.CURRENT_ACCOUNT,
      "2026-05",
      "飛勝工業株式会社"
    );
  });
  // 計算し直すと番号は変わるはず＝この試験に効き目が在る事の確認
  expect(wouldBe, "★会社を足しても番号が動かない＝この試験は何も見ていない★").not.toBe(no1);

  // もう一度 出す
  const dl2 = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /PDFで保存/ }).click();
  const kami2 = await noOnPaper(page, await dl2);
  await page.waitForTimeout(400);
  // ★紙に刷られた番号が 1通目と同じ★（凍結の本丸。台帳を見ない実装ならここで落ちる）
  expect(kami2, `★紙の番号が動いた★ ${kami1} → ${kami2}（計算し直すと ${wouldBe}）`).toBe(kami1);

  const after2 = await page.evaluate(cloud);
  expect(after2.invoices.length, "2回目の控えが積まれていない").toBe(2);
  // ★1通目の控えは 12,000 のまま★（ここが A の肝）
  const ichi = after2.invoices.find((x) => x.total === 12000);
  expect(ichi, "★1通目の控えが書き換わった＝過去の紙が残らない★").toBeTruthy();
  expect(ichi.rows_json[0].金額).toBe(12000);
  // 2通目は 9,000
  expect(
    after2.invoices.some((x) => x.total === 9000),
    "2通目が残っていない"
  ).toBe(true);
  // ★番号は2回目も同じ（台帳から出る）★
  expect(after2.invoice_no.length, "台帳が増えた＝番号が2つできた").toBe(1);
  for (const iv of after2.invoices) expect(iv.invoice_no).toBe(no1);
});
