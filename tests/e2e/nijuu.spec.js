import { test, expect } from "@playwright/test";
// ============================================================
// ★手で入れた行と メーターの行の「同じ 乗車かも」の 見張りは 外した★ 2026-11-04 夜
//   司さん「おれが 入力しよんやけん いちいち 出すなや／いつ こんなん 出せって 指示したんど」＝頼まれていない 見張り。
//   押す 事：メーターの 行と 同じ 会社・日付・額でも 保存を 止めない／枠・釦・知らせが 出ない／
//   倉庫に「別の 乗車」の 印を 書かない／当たらない 行は 今まで 通り 1回で 保存
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
      session: {
        user: { id: "u_nj", email: "n@x.com" },
        access_token:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1X25qIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.e2e",
      },
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

const KAMO_JI = /メーターから入った明細と同じ|同じ乗車かも|別の乗車/;
async function denai(page) {
  await expect(page.locator("#entryBody .nijuu-kamo")).toHaveCount(0);
  await expect(page.locator("#entryBody .nijuu-betsu")).toHaveCount(0);
  await expect(page.locator("#scr-input")).not.toContainText(KAMO_JI);
  await expect(page.locator("#toast")).not.toContainText(KAMO_JI);
}

test("★メーターの 行と 同じ 会社・次の 日・同じ 額でも 止めず 1回で 保存（枠も 釦も 出ない）★", async ({
  page,
}) => {
  await hiraku(page, [meterGyou("m1", "2026-11-02", 4500)]);
  await ireru(page, "2026-11-03", 4500);
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
  await expect(page.locator("#toast")).toContainText("件を保存しました");
  expect(await teGyou(page)).toBe(1);
  await denai(page);
});

test("★メーターの 行と 同じ日・同じ 額でも 1回で 保存・倉庫に「別の 乗車」の 印を 書かない★", async ({
  page,
}) => {
  await hiraku(page, [meterGyou("m1", "2026-11-02", 4500), meterGyou("m2", "2026-11-02", 3000)]);
  await ireru(page, "2026-11-02", 4500);
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
  await denai(page);
  const ex = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.filter(
        (r) => !(r.extra && r.extra.dk_source)
      )[0].extra
  );
  expect(ex && ex.nijuu_betsu).toBeUndefined();
});

test("★2日 離れた・前の 日・額違い も 今まで 通り 1回で 保存★", async ({ page }) => {
  await hiraku(page, [
    meterGyou("m1", "2026-11-02", 4500),
    meterGyou("m2", "2026-11-05", 4500),
    meterGyou("m3", "2026-11-04", 4501),
  ]);
  await ireru(page, "2026-11-04", 4500);
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
  await denai(page);
});

test("★開いた 後に 同じ 日・同じ 額の メーターの 行が 倉庫へ 入っても 止めず 1回で 保存★", async ({
  page,
}) => {
  await hiraku(page, []);
  await ireru(page, "2026-11-02", 4500);
  await page.evaluate(
    (g) => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      db.tables.meisai.push(g);
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    },
    meterGyou("m9", "2026-11-02", 4500)
  );
  await hozon(page);
  await expect.poll(() => kaita(page)).toBe(1);
  await denai(page);
});
