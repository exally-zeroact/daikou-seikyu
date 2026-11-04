import { test, expect } from "@playwright/test";
// ============================================================
// ★★入金を 読めない 時は「入金 ¥0・全部 未入金」と 描かない★★ 2026-11-04
//   前：書き込みは yomenaiTomeru で 止まって いたが、入金一覧・下の 帯の 数字・入金の 窓・集計の 画面は
//       空（最初の 失敗）か 古い（読み直しの 失敗）PAYMENTS で 数えて「入金 ¥0／未入金／全入金」を 描いた
//   物差し：読めない ⇒ 帯・入金と 残は「―」・札は「入金 不明」・全入金 0個・帯の 数字「?」・窓に 額/日/メモ/保存 0・
//           集計に 未入金/入金済/一部入金 0個・赤 0／読める ⇒ 今まで 通り／読み直しで 変われば 描き直す
//   値は 全部 作り物
// ============================================================
test.setTimeout(120000);

function seed() {
  const uid = "u_nf";
  const g = (id, company, date, amount) => ({
    id,
    user_id: uid,
    company,
    date,
    destination: "本社〜北浜",
    amount,
    note: "",
    distance: null,
    people: null,
    name: "",
    extra: null,
    created_at: "2026-11-02T15:00:00.000Z",
    deleted_at: null,
  });
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "n@x.com": { id: uid, email: "n@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "n@x.com" }, access_token: "jwt-e2e" },
      tables: {
        // A社＝繰越なし（11月 10,000・入金 3,000）／B社＝繰越（11月 8,000・入金 8,000＝入金済）
        meisai: [g("a1", "A社", "2026-11-03", 10000), g("b1", "B社", "2026-11-03", 8000)],
        companies: ["A社", "B社"].map((co, i) => ({
          id: "c" + i,
          user_id: uid,
          name: co,
          items: ["日付", "行き先", "金額"],
          config: co === "B社" ? { carryover: true } : {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        })),
        issuer: [
          {
            user_id: uid,
            config: { issuer: "試験の 会社\n登録番号：T1234567890123", bank: "試験 銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [],
        payments: [
          {
            id: "p1",
            user_id: uid,
            month: "2026-11",
            company: "A社",
            paid: 3000,
            paid_date: "2026-11-20",
            memo: "半分の前",
            deleted_at: null,
          },
          {
            id: "p2",
            user_id: uid,
            month: "2026-11",
            company: "B社",
            paid: 8000,
            paid_date: "2026-11-21",
            memo: "",
            deleted_at: null,
          },
          // 明細の 無い 月の 記録＝繰越なし A社 の 9月（読める 時は「明細なし」・読み直しの 失敗では 古い 記録で 出る＝「入金 不明」）
          {
            id: "p4",
            user_id: uid,
            month: "2026-09",
            company: "A社",
            paid: 1000,
            paid_date: "2026-09-25",
            memo: "",
            deleted_at: null,
          },
          // 繰越の 会社の 明細の 無い 月（一覧には 出ない 作り）
          {
            id: "p3",
            user_id: uid,
            month: "2026-09",
            company: "B社",
            paid: 2000,
            paid_date: "2026-09-25",
            memo: "",
            deleted_at: null,
          },
        ],
        export_tokens: [],
      },
    })
  );
}

async function open(page, ochiru) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript((t) => {
    window.__FAKE_FAIL_TABLES__ = t;
    window.__FAKE_WRITES__ = {};
  }, ochiru);
  await page.addInitScript(`(${seed.toString()})();`);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
}

async function nyukinGamen(page) {
  await page.locator('.nav-item[data-scr="payment"]').click();
  await page.selectOption("#payMonth", "");
  await page.selectOption("#payStatus", "");
  await page.evaluate(() => renderPayments());
}

async function shukeiGamen(page) {
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.evaluate(() => showBillingSeg("report"));
  await page.selectOption("#repMonth", "2026-11"); // onchange＝renderReport（試験の 中で 自分では 呼ばない）
}

const JOUTAI = /未入金|入金済|一部入金/;

async function fumeiNoKatachi(page, kensu) {
  // 入金一覧
  await nyukinGamen(page);
  await expect(page.locator("#payFumeiObi")).toBeVisible();
  await expect(page.locator("#payFumeiObi")).toContainText("取って来られませんでした");
  const sum = await page.locator("#paySummary").innerText();
  expect(sum).toContain("―");
  expect(sum).not.toMatch(/入金\s*¥/);
  await expect(page.locator("#payBody .pay-item")).toHaveCount(kensu);
  await expect(page.locator("#payBody .pay-pill.fumei")).toHaveCount(kensu);
  expect(await page.locator("#payBody .pay-pill").allInnerTexts()).toEqual(
    Array(kensu).fill("入金 不明")
  );
  await expect(page.locator("#payFumeiObi")).toContainText(
    "入金の記録だけの月は 出ていない事が あります"
  );
  await expect(page.locator("#payBody .pay-full-btn")).toHaveCount(0);
  await expect(page.locator("#payBody .pay-rem")).toHaveCount(0);
  expect(await page.locator("#payBody .pay-sub").allInnerTexts()).not.toContainEqual(
    expect.stringMatching(/入金/)
  );
  await expect(page.locator("#payCount")).toContainText("不明");
  await expect(page.locator("#payBadge")).toHaveText("?");
  // 状態で 絞っても 0件に しない（全部 出して 訳を 言う）
  await page.selectOption("#payStatus", "paid");
  await expect(page.locator("#payBody .pay-item")).toHaveCount(kensu);
  await expect(page.locator("#payCount")).toContainText("状態では 絞れません");
  await page.selectOption("#payStatus", "");
  // 入金の 窓（繰越なし A社・繰越 B社 どちらも）
  for (const co of ["A社", "B社"]) {
    await page.evaluate((c) => openPayEdit("2026-11", c), co);
    await expect(page.locator("#payEditFumei")).toBeVisible();
    const body = await page.locator("#modalBody").innerText();
    expect(body).not.toContain("¥0");
    expect(body).not.toMatch(/入金済|記録 ¥|全入金|全額|未入金/);
    // 繰越の 会社は「今月分」（今回ご請求額は 入金が 要る＝「請求額」と 書かない）
    if (co === "B社") {
      expect(body).toContain("今月分 ¥8,000");
      expect(body).not.toContain("件　請求額");
      await expect(page.locator("#payAteNote")).toContainText(
        "今回ご請求額は 入金を 読めないので 出せません"
      );
    } else expect(body).toContain("請求額 ¥10,000");
    await expect(page.locator("#pay_amt, #pay_date, #pay_note")).toHaveCount(0);
    await expect(page.locator("#modalBody button:not(.pay-kakunin)")).toHaveCount(0);
    await expect(page.locator("#modalBody .pay-kakunin")).toHaveCount(1); // 確認は 残す（司さん 10-08）
    await page.evaluate(() => closeModal());
  }
  // 集計の 画面
  await shukeiGamen(page);
  await expect(page.locator("#repFumeiObi")).toBeVisible();
  const rep = await page.locator("#repBody").innerText();
  expect(rep).not.toMatch(JOUTAI);
  expect(rep).toContain("入金 不明");
  await expect(page.locator("#repBody .rep-rem")).toHaveCount(0);
  expect(await page.locator("#repSummary").innerText()).toContain("―");
}

async function yomeruNoKatachi(page) {
  await nyukinGamen(page);
  await expect(page.locator("#payFumeiObi")).toHaveCount(0);
  await expect(page.locator("#payBody .pay-pill.fumei")).toHaveCount(0);
  expect(await page.locator("#payBody .pay-pill").allInnerTexts()).toEqual(
    expect.arrayContaining(["一部入金", "入金済"])
  );
  await expect(page.locator("#payBody .pay-full-btn")).toHaveCount(1); // A社 だけ
  await expect(page.locator("#payBody .pay-item")).toHaveCount(3); // A社 11月・B社 11月・A社 9月（明細なし）
  await expect(page.locator("#payBody .pay-pill.kieta")).toHaveCount(1);
  await expect(page.locator("#payBadge")).toHaveText("1");
  await page.evaluate(() => openPayEdit("2026-11", "A社"));
  await expect(page.locator("#payEditFumei")).toHaveCount(0);
  await expect(page.locator("#pay_amt")).toHaveValue("3000");
  await expect(page.locator("#pay_note")).toHaveValue("半分の前");
  await page.evaluate(() => closeModal());
  await shukeiGamen(page);
  await expect(page.locator("#repFumeiObi")).toHaveCount(0);
  expect(await page.locator("#repBody").innerText()).toMatch(/一部入金/);
  await expect(page.locator("#repBody .rep-rem")).not.toHaveCount(0);
}

test("★入金を 最初から 読めない ⇒ 一覧・帯の 数字・窓・集計 どれも ¥0／未入金 を 描かない・書かない★", async ({
  page,
}) => {
  await open(page, ["payments"]);
  await fumeiNoKatachi(page, 2); // PAYMENTS が 空＝記録だけの 月は 出ない
  expect(await page.evaluate(() => window.__FAKE_WRITES__.payments || 0)).toBe(0);
});

test("★全部 読める ⇒ 今まで 通り（止めすぎない）★", async ({ page }) => {
  await open(page, []);
  await yomeruNoKatachi(page);
});

test("★読めた 後に 読み直しで 読めなくなる ⇒ 開いた 窓・一覧・帯・集計を 描き直す／また 読めたら 戻る★", async ({
  page,
}) => {
  await open(page, []);
  await nyukinGamen(page);
  await shukeiGamen(page); // 集計を 読める 形で 描いて おく
  expect(await page.locator("#repBody").innerText()).toMatch(/一部入金/);
  await page.evaluate(() => openPayEdit("2026-11", "A社"));
  await expect(page.locator("#pay_amt")).toHaveValue("3000");
  await page.evaluate(async () => {
    window.__FAKE_FAIL_TABLES__ = ["payments"];
    await yomiNaoshiMon("2026-11", "A社", "試験");
  });
  // 開いて いた 窓が「読めない」の 形に 変わる
  await expect(page.locator("#payEditFumei")).toBeVisible();
  await expect(page.locator("#pay_amt")).toHaveCount(0);
  await page.evaluate(() => closeModal());
  // ★試験の 中で 描き直さずに★ 集計・帯の 数字・一覧が 変わって いる
  await expect(page.locator("#repFumeiObi")).toBeVisible();
  expect(await page.locator("#repBody").innerText()).not.toMatch(JOUTAI);
  await expect(page.locator("#payBadge")).toHaveText("?");
  await expect(page.locator("#payFumeiObi")).toHaveCount(1);
  await fumeiNoKatachi(page, 3); // 古い PAYMENTS＝A社 9月の 記録だけの 行も「入金 不明」で 出る
  // また 読めたら 戻る（集計を 開いた まま・試験の 中で 描き直さない）
  await page.evaluate(async () => {
    window.__FAKE_FAIL_TABLES__ = [];
    await yomiNaoshiMon("2026-11", "A社", "試験");
  });
  await expect(page.locator("#repFumeiObi")).toHaveCount(0);
  await expect(page.locator("#payBadge")).toHaveText("1");
  await yomeruNoKatachi(page);
});
