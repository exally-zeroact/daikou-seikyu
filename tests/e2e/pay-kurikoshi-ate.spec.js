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

// ============================================================
// ★★10-02 夜（対立役に 叩かれて 足した）：当てた 後の 窓・Excel・一括入金★★
//   6月に 15,000 だけ 記録（5月 10,000・6月 10,000 の 請求）
//   ・5月の「入金を記録」の 窓：前は 記録 0 と「全額」を 出し ★二重に 記録しやすかった★
//   ・Excel の 入金シート：前は 当てた 額（5月 10,000・日 空／6月 5,000）＝★記録 15,000 が 消えて 見えた★
//   ・一括入金：前は 6月の 記録を ★請求額 10,000 で 上書き★＝5,000 の 記録が 消えた
//   ★わざと壊して 赤（10-02 夜 実測）★ 直す前の 画面で ★赤★＝最初の ①「窓の 説明が 無い」で 止まる。
//     ②Excel・③一括入金 は その 手前で 止まるので ★個別には 赤を 見ていない★（直す前の 字では 10,000 に なる 見立て）
// ============================================================
function seed15() {
  const raw = JSON.parse(localStorage.getItem("__fake_supa_db__") || "null");
  if (!raw) return;
  raw.tables.payments = raw.tables.payments.map((p) =>
    p.company === "繰越工業株式会社" ? Object.assign({}, p, { paid: 15000 }) : p
  );
  localStorage.setItem("__fake_supa_db__", JSON.stringify(raw));
}

test("★当てた 後も 窓・Excel・一括入金で 記録が 消えない★", async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.addInitScript(seed15);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();

  // 当て方：5月 10,000（入金済）・6月 5,000（一部）
  const jou = await page.evaluate(() =>
    summarize(null, "").rows.map((x) => [x.month, x.company, x.st, x.paid])
  );
  expect(jou).toContainEqual(["2026-05", "繰越工業株式会社", "paid", 10000]);
  expect(jou).toContainEqual(["2026-06", "繰越工業株式会社", "partial", 5000]);

  // ① 5月の 窓＝説明が 出て「全額」が 無い・入金額の 欄は 記録（0）
  await page.evaluate(() => openPayEdit("2026-05", "繰越工業株式会社"));
  await expect(page.locator("#payAteNote"), "★当てている 説明が 窓に 無い★").toBeVisible();
  await expect(page.locator("#payAteNote")).toContainText("10,000");
  await expect(page.locator("#modalBody").getByText("全額（", { exact: false })).toHaveCount(0);
  await expect(page.locator("#pay_amt")).toHaveValue("0");
  await page.evaluate(() => closeModal && closeModal());

  // ② Excel の 入金シート＝記録どおり（6月 15,000）
  const aoa = await page.evaluate(() => _exlPayAoa(summarize(null, "").rows));
  const kuri = aoa.filter((r) => r[1] === "繰越工業株式会社").map((r) => [r[0], r[2]]);
  expect(kuri, "★Excel の 入金シートが 記録と 違う★").toEqual([["2026年6月", 15000]]);

  // ③ 一括入金（ボタンが 呼ぶ 関数を そのまま 呼ぶ）
  await page.evaluate(async () => {
    payToggleSelMode();
    payToggleRow("2026-06", "繰越工業株式会社", 10000);
    payToggleRow("2026-05", "普通商事株式会社", 10000);
    await bulkMarkPaid();
  });
  const kiroku = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__"))
      .tables.payments.map((p) => [p.month, p.company, p.paid])
      .sort()
  );
  expect(kiroku, "★一括入金で 記録が 上書きされて 消えた★").toEqual([
    ["2026-05", "普通商事株式会社", 10000], // 繰越を 使わない 会社＝今まで通り 請求額
    ["2026-06", "普通商事株式会社", 20000],
    ["2026-06", "繰越工業株式会社", 20000], // 15,000 ＋ 残り 5,000
  ]);
  const ato = await page.evaluate(() =>
    summarize(null, "")
      .rows.filter((x) => x.company === "繰越工業株式会社")
      .map((x) => x.st)
  );
  expect(ato).toEqual(["paid", "paid"]);
});
