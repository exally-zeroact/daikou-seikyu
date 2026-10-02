import { test, expect } from "@playwright/test";
// ============================================================
// ★★「繰越を使う」会社が まとめて 払った 入金は 古い 月から 当てる★★ 2026-10-02
//
//   司さん「バグがあるなら直せやボケ」
//   ★前★ 5月 10,000・6月 10,000 を 請求し、6月に 20,000 まとめて 入金を 記録すると
//     5月＝★未入金の まま★／6月＝入金 20,000（請求 10,000 なのに）
//     未入金の バッジも 5月を 数え続けた（合計と 繰越の 額は 合っていた）。
//   ★今★ 繰越を 使う 会社だけ 古い 月から 当てる ⇒ 5月 入金済・6月 入金済・バッジ 0。
//   ★繰越を 使わない 会社は 今まで通り★（記録した 月の 額）も 同じ 試験で 見る。
//   ★記録した 入金（payments の 行）は 1円も 書き換えない★ も 数える。
//
//   ★押す物の一覧（先に書く）★ 1. 下のナビ「入金」（一覧と バッジを 見る）
//
//   ★★わざと壊して 赤に なるのを 見た（2026-10-02 実測）★★
//     直す前（入金を 記録した 月の 行に そのまま 付ける）⇒ ★赤★ 5月が「未入金」
//     直した後 ⇒ 緑
// ============================================================
const KURI = "繰越工業株式会社"; // 繰越を 使う
const FUTSU = "普通商事株式会社"; // 繰越を 使わない
test.setTimeout(120000);

function seed() {
  const uid = "u_kuri";
  const m = (id, co, date, amount) => ({
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
  const co = (id, name, carryover) => ({
    id,
    user_id: uid,
    name,
    items: ["日付", "行き先", "金額"],
    config: carryover ? { carryover: true } : {},
    created_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  });
  const pay = (id, month, company, paid) => ({
    id,
    user_id: uid,
    month,
    company,
    paid,
    paid_date: month + "-28",
    memo: "",
  });
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [
          m("a1", "繰越工業株式会社", "2026-05-10", 10000),
          m("a2", "繰越工業株式会社", "2026-06-10", 10000),
          m("b1", "普通商事株式会社", "2026-05-10", 10000),
          m("b2", "普通商事株式会社", "2026-06-10", 10000),
        ],
        companies: [co("c1", "繰越工業株式会社", true), co("c2", "普通商事株式会社", false)],
        issuer: [
          {
            user_id: uid,
            config: { issuer: "合同会社ZEROact", bank: "伊予銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        // ★どちらも 6月に 20,000 まとめて 入金を 記録（5月の 行は 無い）★
        payments: [
          pay("p1", "2026-06", "繰越工業株式会社", 20000),
          pay("p2", "2026-06", "普通商事株式会社", 20000),
        ],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

test("★繰越の 会社は まとめた 入金を 古い 月から 当てる／使わない 会社は 今まで通り★", async ({
  page,
}) => {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });

  // ★空回り していない★＝繰越の 印が 読めている
  expect(
    await page.evaluate((c) => !!(window.MASTER && MASTER[c] && MASTER[c].carryover), KURI),
    "★繰越を使う 設定が 読み込まれていない（この 試験は 何も 見ていない）★"
  ).toBe(true);

  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();

  // 画面と 同じ 関数で 状態を 読む（真似ない）
  const jou = await page.evaluate(() =>
    summarize(null, "").rows.map((x) => ({ m: x.month, c: x.company, st: x.st, paid: x.paid }))
  );
  const st = (m, c) => (jou.find((x) => x.m === m && x.c === c) || {}).st;
  const pd = (m, c) => (jou.find((x) => x.m === m && x.c === c) || {}).paid;

  // ★繰越を 使う 会社★
  expect(
    st("2026-05", KURI),
    "★繰越の 会社：5月が 入金済に ならない（古い 月から 当てていない）★"
  ).toBe("paid");
  expect(st("2026-06", KURI)).toBe("paid");
  expect(pd("2026-05", KURI)).toBe(10000);
  expect(pd("2026-06", KURI)).toBe(10000);

  // ★繰越を 使わない 会社★＝今まで通り（記録した 月の 額）
  expect(st("2026-05", FUTSU), "★繰越を 使わない 会社まで 当て方が 変わった★").toBe("unpaid");
  expect(pd("2026-06", FUTSU)).toBe(20000);

  // ★客の 目に 見える 物★＝一覧の 5月の 繰越の 会社の 行に「入金済」
  const gyou = page
    .locator("#payBody .pay-row, #payBody > *")
    .filter({ hasText: KURI })
    .filter({ hasText: "5月" });
  await expect(gyou.first(), "★一覧の 5月の 行に 入金済 と 出ていない★").toContainText("入金済");

  // ★記録した 入金は 1円も 書き換えていない★
  const kiroku = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.map((p) => [
      p.month,
      p.company,
      p.paid,
    ])
  );
  expect(kiroku).toEqual([
    ["2026-06", KURI, 20000],
    ["2026-06", FUTSU, 20000],
  ]);
});
