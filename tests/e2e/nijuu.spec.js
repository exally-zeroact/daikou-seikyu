import { test, expect } from "@playwright/test";
// ============================================================
// ★手で入れた行と メーターの行の 二重請求の 見張り★ 2026-11-04（lib/nijuu.js）
//   押す 事：メーターの 行と 同じ 会社・日付（同じ日か 次の日）・同じ 額 → 保存しない／
//   「別の 乗車」で 通す／押した 後に 額を 直して 別の メーター行と 同じに なれば また 止める／
//   倉庫が 読めなければ 保存しない（insert 0）／2日 離れた 行・当たらない 行は 今まで 通り 1回で 保存／
//   開いた 後に 入った メーターの 行も 拾う（手元の DB で なく 倉庫を 読み直す）／行き先の 字は esc
//   値は 全部 作り物
// ============================================================
test.setTimeout(120000);

const CO = "作り物商事";
const UID = "u_nj";
function seed(meter) {
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "n@x.com": { id: "u_nj", email: "n@x.com", password: "himitsu123" } },
      session: { user: { id: "u_nj", email: "n@x.com" }, access_token: "jwt-e2e" },
      tables: {
        meisai: meter || [],
        companies: [
          {
            id: "c0",
            user_id: "u_nj",
            name: "作り物商事",
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [],
        invoices: [],
        invoice_no: [],
        payments: [],
        export_tokens: [],
      },
    })
  );
}
function meterGyou(id, date, amount, dest) {
  return {
    id,
    user_id: UID,
    company: CO,
    date,
    destination: dest || "松本町〜東鳥生町",
    amount,
    note: "",
    distance: 5.36,
    people: null,
    name: "",
    extra: { dk_ref: "dev:1:" + id, dk_source: "daikome", dk_meter_yen: amount },
    created_at: "2026-11-02T15:00:00.000Z",
    deleted_at: null,
  };
}
async function hiraku(page, meter) {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, meter);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator("#inputCompany").selectOption(CO);
}
async function ireru(page, hi, kin) {
  await page.locator("#entryBody .sugg-wrap .entry-inp").first().fill("駅");
  await page.locator("#entryBody input.num").first().fill(String(kin));
  await page.locator("#entryBody .date-input").first().fill(hi);
  await page.locator("#entryBody .date-input").first().dispatchEvent("change");
}
const hozon = (page) => page.getByRole("button", { name: "保存する" }).click();
const kaita = (page) => page.evaluate(() => (window.__FAKE_WRITES__ || {}).meisai || 0);
const teGyou = (page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.filter(
        (r) => !(r.extra && r.extra.dk_source)
      ).length
  );

test("★メーターの 行と 同じ（夜中の 乗車＝次の 日）→ 止まる → 別の 乗車 で 入る★", async ({
  page,
}) => {
  await hiraku(page, [meterGyou("m1", "2026-11-02", 4500, "<b>x</b>松本町")]);
  await ireru(page, "2026-11-03", 4500);
  await hozon(page);
  await expect(page.locator("#toast")).toContainText("メーターから入った明細と同じ日付・金額");
  const kamo = page.locator("#entryBody .nijuu-kamo");
  await expect(kamo).toContainText("2026-11-02");
  await expect(kamo).toContainText("¥4,500");
  await expect(kamo).toContainText("<b>x</b>松本町"); // esc（字の まま 出る）
  expect(await kaita(page)).toBe(0);
  await kamo.locator(".nijuu-betsu").click();
  await expect(kamo).toContainText("別の乗車として保存します");
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
  expect(await teGyou(page)).toBe(1);
});

test("★別の 乗車を 押した 後に 額を 直して 別の メーター行と 同じ → また 止まる★", async ({
  page,
}) => {
  await hiraku(page, [meterGyou("m1", "2026-11-02", 4500), meterGyou("m2", "2026-11-02", 3000)]);
  await ireru(page, "2026-11-02", 4500);
  await hozon(page);
  await page.locator("#entryBody .nijuu-betsu").click();
  await page.locator("#entryBody input.num").first().fill("3000");
  await hozon(page);
  await expect(page.locator("#toast")).toContainText("メーターから入った明細と同じ日付・金額");
  await expect(page.locator("#entryBody .nijuu-kamo")).toContainText("¥3,000");
  await page.waitForTimeout(300);
  expect(await kaita(page)).toBe(0);
});

test("★倉庫が 読めなければ 保存しない（insert 0）★", async ({ page }) => {
  await hiraku(page, [meterGyou("m1", "2026-11-02", 4500)]);
  await ireru(page, "2026-11-10", 1200);
  await page.evaluate(() => {
    window.__FAKE_FAIL_TABLES__ = ["meisai"];
  });
  await hozon(page);
  await expect(page.locator("#toast")).toContainText("二重の確かめが出来ず保存していません");
  await page.waitForTimeout(300);
  expect(await kaita(page)).toBe(0);
  // 読めるように 戻せば 入る
  await page.evaluate(() => {
    window.__FAKE_FAIL_TABLES__ = [];
  });
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
});

test("★2日 離れた・前の 日・額違い は 止めず 1回で 保存★", async ({ page }) => {
  await hiraku(page, [
    meterGyou("m1", "2026-11-02", 4500),
    meterGyou("m2", "2026-11-05", 4500),
    meterGyou("m3", "2026-11-04", 4501),
  ]);
  await ireru(page, "2026-11-04", 4500); // m1 と 2日・m2 の 前の 日・m3 と 1円 違い
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
  await expect(page.locator("#entryBody .nijuu-kamo")).toHaveCount(0);
});

test("★開いた 後に 入った メーターの 行も 拾う（倉庫を 読み直す）★", async ({ page }) => {
  await hiraku(page, []);
  await ireru(page, "2026-11-02", 4500);
  // 開いた 後に メーターの 行が 倉庫へ 入る（dk-sync-jobs の 代わり）
  await page.evaluate(
    (g) => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      db.tables.meisai.push(g);
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    },
    meterGyou("m9", "2026-11-02", 4500)
  );
  await hozon(page);
  await expect(page.locator("#toast")).toContainText("メーターから入った明細と同じ日付・金額");
  await page.waitForTimeout(300);
  expect(await kaita(page)).toBe(0);
});
