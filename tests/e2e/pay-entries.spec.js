import { test, expect } from "@playwright/test";
// ============================================================
// ★★入金の 回（payments.entries）★★ 2026-11-02
//
//   司さん「そんなことにならんようにしろ」「列を足してよい」
//   ★前★ 入金は 会社×月に 1行・入金日は 最後の 1つ だけ。
//     5月の 請求書（37,200）を「6/10 に 20,000・7/20 に 17,200」と 払われると、行の 入金日は 7/20 だけ
//     ＝37,200 全部が 7月に 数わり、出し直した 6月の 紙は ご入金額 0・今回ご請求額 49,200（20,000 多い）。
//   ★今★ 1回ずつ 入金日の 月で 数える ⇒ 6月の 紙＝前回 37,200・入金 20,000・繰越 17,200・今回 29,200。
//
//   手で 計算した 値（明細 5月 37,200・6月 12,000・7月 なし）
//     6月の 紙：前回 37,200 − 6月の 入金 20,000 ＝ 繰越 17,200 ＋ 今月 12,000 ＝ 29,200
//     7月の 紙：前回 29,200 − 7月の 入金 17,200 ＝ 繰越 12,000 ＋ 今月 0 ＝ 12,000
//
//   対立役（設計前 2026-11-02）の 止1〜3 を 1本ずつ：
//     止1 取り消しで 回を 送らないと 回が 新しい 日の まま 残る
//     止2 古い 版の 画面が 日だけ 変えると 新しい 画面が 気づかない
//     止3 窓で 額を 増やした だけで 前の 入金日が 付く
// ============================================================
test.setTimeout(120000);
const CO = "繰越あり社";
const UID = "u_ent";

function seed(pays) {
  const uid = "u_ent";
  const mk = (id, date, amount) => ({
    id,
    user_id: uid,
    company: "繰越あり社",
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
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [mk("m1", "2026-05-06", 37200), mk("m2", "2026-06-06", 12000)],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: "繰越あり社",
            items: ["日付", "行き先", "金額"],
            config: {
              widths: {},
              aligns: {},
              lead: "",
              tableTitle: "",
              noteSummary: false,
              carryover: true,
            },
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [
          {
            user_id: uid,
            config: { issuer: "合同会社ZEROact\nZERO代行", bank: "見本銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [],
        payments: pays.map((p, i) =>
          Object.assign(
            {
              id: "p" + i,
              user_id: uid,
              month: "2026-05",
              company: "繰越あり社",
              memo: "",
              created_at: "2026-06-10T00:00:00.000Z",
              deleted_at: null,
            },
            p
          )
        ),
      },
    })
  );
}

async function hiraku(page, pays) {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, pays);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
}
// 紙の 数（請求書と 同じ エンジン 1本）
const kami = (page, month) =>
  page.evaluate(
    ([co, m]) => {
      const c = window._carryFor(co, m);
      return { mae: c.maeSeikyu, nyukin: c.nyukin, kuri: c.kurikoshi, ue: c.seikyuGaku };
    },
    [CO, month]
  );
const gyou = (page) =>
  page.evaluate(
    (uid) =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.find(
        (p) => p.user_id === uid && p.month === "2026-05" && p.company === "繰越あり社"
      ),
    UID
  );
async function mado(page, gaku, hi) {
  await page.locator('.nav-item[data-scr="payment"]').click();
  await page.locator(".pay-item").filter({ hasText: CO }).filter({ hasText: "2026年5月" }).click();
  await expect(page.locator("#pay_amt")).toBeVisible();
  // ★止3★ 繰越の 会社の 入金日の 欄は 空で 出る（前の 日を 使い回さない）
  await expect(page.locator("#pay_date")).toHaveValue("");
  await page.fill("#pay_amt", String(gaku));
  if (hi) await page.fill("#pay_date", hi);
  await page.locator("#modalBody").getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".toast").last()).toContainText("入金を記録しました");
}
const SEIKAI6 = { mae: 37200, nyukin: 20000, kuri: 17200, ue: 29200 };
const SEIKAI7 = { mae: 29200, nyukin: 17200, kuri: 12000, ue: 12000 };

test("★6/10 一部・7/20 残り（回つき）＝6月の 紙 29,200・7月の 紙 12,000★", async ({ page }) => {
  await hiraku(page, [
    {
      paid: 37200,
      paid_date: "2026-07-20",
      entries: [
        { gaku: 20000, hi: "2026-06-10" },
        { gaku: 17200, hi: "2026-07-20" },
      ],
    },
  ]);
  expect(await kami(page, "2026-06"), "★6月の 紙が 多く 請求した★").toEqual(SEIKAI6);
  expect(await kami(page, "2026-07")).toEqual(SEIKAI7);
});

test("★窓で 6/10 に 20,000→7/20 に 37,200 と 2回 記録＝回が 2つ・紙は 上と 同じ★", async ({
  page,
}) => {
  await hiraku(page, []);
  await mado(page, 20000, "2026-06-10");
  await mado(page, 37200, "2026-07-20");
  const r = await gyou(page);
  expect(r.paid).toBe(37200);
  expect(r.paid_date).toBe("2026-07-20");
  expect(r.entries).toEqual([
    { gaku: 20000, hi: "2026-06-10" },
    { gaku: 17200, hi: "2026-07-20" },
  ]);
  expect(await kami(page, "2026-06")).toEqual(SEIKAI6);
  expect(await kami(page, "2026-07")).toEqual(SEIKAI7);
  // 窓に これまでの 回が 出る
  await page.locator(".pay-item").filter({ hasText: CO }).filter({ hasText: "2026年5月" }).click();
  await expect(page.locator("#payKai")).toContainText("6/10 ¥20,000・7/20 ¥17,200");
});

test("★止3：額を 増やして 日を 打たない＝増えた 分は 今日の 回（前の 6/10 を 付けない）★", async ({
  page,
}) => {
  await hiraku(page, []);
  await mado(page, 20000, "2026-06-10");
  await mado(page, 37200, "");
  const r = await gyou(page);
  const kyou = await page.evaluate(() => window.kyouNoHi());
  expect(r.entries).toEqual([
    { gaku: 20000, hi: "2026-06-10" },
    { gaku: 17200, hi: kyou },
  ]);
  expect(r.paid_date).toBe(kyou);
  // 6月の 紙は 6/10 の 20,000 だけ 引く（17,200 は 6月に 入れない）
  expect(await kami(page, "2026-06")).toEqual(SEIKAI6);
});

test("★前からの 記録（回なし）＝今の 額と 入金日を 1回分＝行で 数えた 時と 同じ★", async ({
  page,
}) => {
  await hiraku(page, [{ paid: 20000, paid_date: "2026-06-20" }]);
  // 6月の 紙＝前回 37,200・入金 20,000（6/20）・繰越 17,200・今回 29,200
  expect(await kami(page, "2026-06")).toEqual(SEIKAI6);
});

test("★止2：古い 版の 画面が 日だけ 変えた（回の 最後 8/20・paid_date 7/20）＝7/20 で 数える★", async ({
  page,
}) => {
  await hiraku(page, [
    {
      paid: 37200,
      paid_date: "2026-07-20",
      entries: [
        { gaku: 20000, hi: "2026-06-10" },
        { gaku: 17200, hi: "2026-08-20" },
      ],
    },
  ]);
  expect(await kami(page, "2026-07"), "★7月の 入金を 8月に 数えた★").toEqual(SEIKAI7);
});

test("★古い 版の 画面が 額だけ 変えた（回の 合計 20,000・paid 37,200・paid_date 7/20）＝足りない 分は 7/20★", async ({
  page,
}) => {
  await hiraku(page, [
    { paid: 37200, paid_date: "2026-07-20", entries: [{ gaku: 20000, hi: "2026-06-10" }] },
  ]);
  expect(await kami(page, "2026-06")).toEqual(SEIKAI6);
  expect(await kami(page, "2026-07")).toEqual(SEIKAI7);
});

test("★止1：前からの 記録に 全入金→取り消し＝回は 前の 形（null）に 戻る・紙は 前と 同じ★", async ({
  page,
}) => {
  await hiraku(page, [{ paid: 20000, paid_date: "2026-06-20" }]);
  const mae6 = await kami(page, "2026-06");
  await page.locator('.nav-item[data-scr="payment"]').click();
  await page
    .locator(".pay-item")
    .filter({ hasText: CO })
    .filter({ hasText: "2026年5月" })
    .locator(".pay-full-btn")
    .click();
  await expect(page.locator(".toast-undo")).toContainText("全入金にしました");
  const naka = await gyou(page);
  expect(naka.entries.length, "★全入金で 回が 足されていない★").toBe(2);
  await page.locator(".toast-undo .toast-undo-btn").click();
  await expect(page.locator(".toast").last()).toContainText("取り消しました");
  const r = await gyou(page);
  expect(r.paid).toBe(20000);
  expect(r.paid_date).toBe("2026-06-20");
  expect(r.entries, "★取り消しで 回が 戻っていない★").toBeNull();
  expect(await kami(page, "2026-06")).toEqual(mae6);
});

test("★止1：回つきの 記録を 0 で 消す→取り消し＝回ごと 戻る★", async ({ page }) => {
  const ent = [
    { gaku: 20000, hi: "2026-06-10" },
    { gaku: 17200, hi: "2026-07-20" },
  ];
  await hiraku(page, [{ paid: 37200, paid_date: "2026-07-20", entries: ent }]);
  await page.locator('.nav-item[data-scr="payment"]').click();
  await page.locator(".pay-item").filter({ hasText: CO }).filter({ hasText: "2026年5月" }).click();
  await page.fill("#pay_amt", "0");
  await page.locator("#modalBody").getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".toast-undo")).toContainText("消しました");
  await page.locator(".toast-undo .toast-undo-btn").click();
  await expect(page.locator(".toast").last()).toContainText("取り消しました");
  const r = await gyou(page);
  expect(r.entries).toEqual(ent);
  expect(await kami(page, "2026-06")).toEqual(SEIKAI6);
});

test("★額を 減らす＝新しい 回から 削る・日だけ 打つ＝最後の 回の 日を 直す★", async ({ page }) => {
  await hiraku(page, [
    {
      paid: 37200,
      paid_date: "2026-07-20",
      entries: [
        { gaku: 20000, hi: "2026-06-10" },
        { gaku: 17200, hi: "2026-07-20" },
      ],
    },
  ]);
  await mado(page, 30000, "");
  let r = await gyou(page);
  expect(r.entries).toEqual([
    { gaku: 20000, hi: "2026-06-10" },
    { gaku: 10000, hi: "2026-07-20" },
  ]);
  expect(r.paid_date).toBe("2026-07-20");
  await mado(page, 30000, "2026-07-25");
  r = await gyou(page);
  expect(r.entries).toEqual([
    { gaku: 20000, hi: "2026-06-10" },
    { gaku: 10000, hi: "2026-07-25" },
  ]);
  expect(r.paid_date).toBe("2026-07-25");
});
