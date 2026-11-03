import { test, expect } from "@playwright/test";
// ============================================================
// ★請求書を 出す 前の 見張り★ 2026-11-04（html yomiNaoshiMon・hakkoMon／lib/nijuu.js）
//   押す 事：開いた 後に 倉庫へ 入った 行（その 月・繰越の 前の 月・DB に 0件の 会社）→ 1回 止めて 画面を 最新に →
//   もう一度で 紙に 出る（番号は 止めた 時に 台帳へ 書かない）／紙に 触れない 違いでは 止めない／
//   明細が 読めなければ 出さない／入金が 読めなければ 繰越の 会社 だけ 止める／
//   手の 行×メーターの 行の 重なり → 帯 → 別の 乗車 で 出る／料金が 空の メーター行 → 止める（通す 釦 無し）／
//   保存の「別の 乗車」は 倉庫に 残り 出す 時に 止めない／自分で 保存・記録した 直後に 嘘で 止めない／
//   入金画面の「確認」も 同じ 見張りを 通る
//   値は 全部 作り物
// ============================================================
test.setTimeout(120000);

const M = "2026-11";

function gyou(id, company, date, amount, meter) {
  return {
    id,
    user_id: "u_hm",
    company,
    date,
    destination: "本社〜北浜",
    amount,
    note: "",
    distance: null,
    people: null,
    name: "",
    extra: meter ? { dk_ref: "dev:1:" + id, dk_source: "daikome", dk_meter_yen: amount } : null,
    created_at: "2026-11-02T15:00:00.000Z",
    deleted_at: null,
  };
}

function seed(arg) {
  const uid = "u_hm";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "h@x.com": { id: uid, email: "h@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "h@x.com" }, access_token: "jwt-e2e" },
      tables: {
        meisai: arg.meisai || [],
        companies: ["A社", "B社"].map((co, i) => ({
          id: "c" + i,
          user_id: uid,
          name: co,
          items: ["日付", "行き先", "金額"],
          config: (arg.carry || []).indexOf(co) >= 0 ? { carryover: true } : {},
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
        payments: arg.payments || [],
        export_tokens: [],
      },
    })
  );
}

async function open(page, arg) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(() => {
    window.__FAKE_WRITES__ = {};
  });
  await page.addInitScript(`(${seed.toString()})(${JSON.stringify(arg || {})});`);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  // 紙に 載った 行を 数える（作る 物は 変えない）
  await page.evaluate(() => {
    window.__KAMI__ = [];
    const one = InvoicePDF.buildOne;
    InvoicePDF.buildOne = function (master, co, rows) {
      if (window.__DASU__) window.__KAMI__.push({ co: co, ids: rows.map((r) => r.id) });
      return one.apply(this, arguments);
    };
    const mon = InvoicePDF.buildMonth;
    InvoicePDF.buildMonth = function (master, db, month, acc) {
      if (window.__DASU__)
        window.__KAMI__.push({
          co: "*",
          ids: db
            .filter((r) => r.account_id === acc && (r.日付 || "").slice(0, 7) === month)
            .map((r) => r.id),
        });
      return mon.apply(this, arguments);
    };
    window.__MADO__ = 0;
    window.open = function () {
      window.__MADO__++;
      return {};
    };
  });
}

async function dasu(page, co) {
  return page.evaluate(
    async (a) => {
      // 選べる 物が 無い 時は 足す（倉庫に だけ 在る 会社・月を 選ぶ 形）
      [
        ["invMonth", a.m],
        ["invCompany", a.co],
      ].forEach(([id, v]) => {
        const sel = document.getElementById(id);
        if (![...sel.options].some((o) => o.value === v)) sel.add(new Option(v || "全社", v));
        sel.value = v;
      });
      window.__KAMI__ = [];
      window.__DASU__ = true;
      try {
        const r = await _buildInvoiceBytes();
        return !!(r && r.bytes);
      } finally {
        window.__DASU__ = false;
      }
    },
    { m: M, co: co }
  );
}
const kuraNiTasu = (page, g) =>
  page.evaluate((x) => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.meisai.push(x);
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  }, g);
const daicho = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.invoice_no.length
  );
const kami = (page) => page.evaluate(() => window.__KAMI__);
const toastNo = (page) => page.locator("#toast");

test("★1社：開いた 後に 入った メーターの 行 → 1回 止まる（番号 0）→ もう一度で 紙に 出る★", async ({
  page,
}) => {
  await open(page, { meisai: [gyou("t1", "A社", "2026-11-03", 3000)] });
  await kuraNiTasu(page, gyou("m9", "A社", "2026-11-05", 4500, true));
  expect(await dasu(page, "A社")).toBe(false);
  await expect(toastNo(page)).toContainText("倉庫に この 紙の 新しい 明細");
  expect(await daicho(page)).toBe(0);
  expect(await kami(page)).toEqual([]);
  expect(await dasu(page, "A社")).toBe(true);
  const k = await kami(page);
  expect([...new Set(k.flatMap((x) => x.ids))].sort()).toEqual(["m9", "t1"]);
  expect(await daicho(page)).toBe(1);
});

test("★全社：DB に 0件の 会社へ 開いた 後に 入った 行 → 止まる → もう一度で その 会社も 紙と 台帳に★", async ({
  page,
}) => {
  await open(page, { meisai: [gyou("t1", "A社", "2026-11-03", 3000)] });
  await kuraNiTasu(page, gyou("m9", "B社", "2026-11-05", 4500, true));
  expect(await dasu(page, "")).toBe(false);
  expect(await daicho(page)).toBe(0);
  expect(await dasu(page, "")).toBe(true);
  const k = await kami(page);
  expect([...new Set(k.flatMap((x) => x.ids))].sort()).toEqual(["m9", "t1"]);
  const cos = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__"))
      .tables.invoice_no.map((r) => r.company)
      .sort()
  );
  expect(cos).toEqual(["A社", "B社"]);
});

test("★1社：DB に 0件で 倉庫に だけ 在る → 「該当なし」で なく 止まって 読み直す★", async ({
  page,
}) => {
  await open(page, { meisai: [gyou("t1", "A社", "2026-11-03", 3000)] });
  await kuraNiTasu(page, gyou("m9", "B社", "2026-11-05", 4500, true));
  expect(await dasu(page, "B社")).toBe(false);
  await expect(toastNo(page)).toContainText("倉庫に この 紙の 新しい 明細");
  expect(await dasu(page, "B社")).toBe(true);
});

test("★繰越の 会社：前の 月に 入った 行も 止める・止めた 後は 繰越が 新しい★", async ({ page }) => {
  await open(page, {
    carry: ["A社"],
    meisai: [gyou("t1", "A社", "2026-11-03", 3000), gyou("t0", "A社", "2026-10-03", 2000)],
  });
  const mae = await page.evaluate(() => JSON.stringify(issuerForEngine("A社", "2026-11").carry));
  await kuraNiTasu(page, gyou("m8", "A社", "2026-10-20", 7000, true));
  expect(await dasu(page, "A社")).toBe(false);
  expect(await daicho(page)).toBe(0);
  const ato = await page.evaluate(() => JSON.stringify(issuerForEngine("A社", "2026-11").carry));
  expect(ato, "★繰越が 古い まま★").not.toBe(mae);
  expect(await dasu(page, "A社")).toBe(true);
});

test("★繰越の 無い 会社：前の 月・別の 会社の 違いでは 止めない（DB は 新しく なる）★", async ({
  page,
}) => {
  await open(page, { meisai: [gyou("t1", "A社", "2026-11-03", 3000)] });
  await kuraNiTasu(page, gyou("m8", "A社", "2026-10-20", 7000, true));
  await kuraNiTasu(page, gyou("m7", "B社", "2026-11-20", 7000, true));
  expect(await dasu(page, "A社")).toBe(true);
  const ids = await page.evaluate(() => DB.map((r) => r.id).sort());
  expect(ids).toEqual(["m7", "m8", "t1"]);
});

test("★明細が 読めなければ 出さない（番号 0）★", async ({ page }) => {
  await open(page, { meisai: [gyou("t1", "A社", "2026-11-03", 3000)] });
  await page.evaluate(() => {
    window.__FAKE_FAIL_TABLES__ = ["meisai"];
  });
  expect(await dasu(page, "A社")).toBe(false);
  await expect(toastNo(page)).toContainText("明細を 読み直せませんでした");
  expect(await daicho(page)).toBe(0);
  expect(await kami(page)).toEqual([]);
});

test("★入金が 読めなければ 繰越の 会社 だけ 止める（繰越の 無い 会社は 出る・司さん 10-08）★", async ({
  page,
}) => {
  await open(page, {
    carry: ["B社"],
    meisai: [gyou("t1", "A社", "2026-11-03", 3000), gyou("t2", "B社", "2026-11-03", 3000)],
  });
  await page.evaluate(() => {
    window.__FAKE_FAIL_TABLES__ = ["payments"];
  });
  expect(await dasu(page, "A社")).toBe(true);
  expect(await dasu(page, "B社")).toBe(false);
  await expect(toastNo(page)).toContainText("入金 を 取って来られませんでした");
});

test("★手の 行と メーターの 行が 重なる → 帯 → 別の 乗車 で 出る・組が 変われば また 止まる★", async ({
  page,
}) => {
  await open(page, {
    meisai: [gyou("t1", "A社", "2026-11-03", 4500), gyou("m1", "A社", "2026-11-02", 4500, true)],
  });
  expect(await dasu(page, "A社")).toBe(false);
  const obi = page.locator("#hakkoObi");
  await expect(obi).toBeVisible();
  await expect(obi).toContainText("同じ 乗車かも しれません（1件）");
  await expect(obi).toContainText("¥4,500");
  expect(await daicho(page)).toBe(0);
  await obi.locator(".hakko-obi-betsu").click();
  await expect(obi).toBeHidden();
  expect(await dasu(page, "A社")).toBe(true);
  // 開いた 後に もう1本 同じ 額の メーター行 → 組が 変わる → また 止まる
  await kuraNiTasu(page, gyou("m2", "A社", "2026-11-03", 4500, true));
  expect(await dasu(page, "A社")).toBe(false); // 倉庫の 違いで 1回
  expect(await dasu(page, "A社")).toBe(false); // 重なりで もう1回
  await expect(obi).toContainText("¥4,500");
});

test("★料金が 空の メーター行 → 止める・通す 釦は 無い・0円は 止めない★", async ({ page }) => {
  await open(page, {
    meisai: [gyou("m1", "A社", "2026-11-02", null, true), gyou("m2", "B社", "2026-11-02", 0, true)],
  });
  expect(await dasu(page, "A社")).toBe(false);
  const obi = page.locator("#hakkoObi");
  await expect(obi).toContainText("料金が まだ 入っていない 明細が 1件");
  await expect(obi.locator(".hakko-obi-betsu")).toHaveCount(0);
  expect(await daicho(page)).toBe(0);
  expect(await dasu(page, "B社")).toBe(true);
});

test("★保存で「別の 乗車」→ 倉庫に 印 → 出す 時に 止めない（自分で 保存した 直後も 嘘で 止めない）★", async ({
  page,
}) => {
  await open(page, { meisai: [gyou("m1", "A社", "2026-11-02", 4500, true)] });
  await page.locator('.nav-item[data-scr="input"]').click();
  await page.locator("#inputCompany").selectOption("A社");
  await page.locator("#entryBody .sugg-wrap .entry-inp").first().fill("駅");
  await page.locator("#entryBody input.num").first().fill("4500");
  await page.locator("#entryBody .date-input").first().fill("2026-11-02");
  await page.locator("#entryBody .date-input").first().dispatchEvent("change");
  await page.getByRole("button", { name: "保存する" }).click();
  await page.locator("#entryBody .nijuu-betsu").click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(toastNo(page)).toContainText("件を保存しました");
  const b = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.filter(
        (r) => !(r.extra && r.extra.dk_source)
      )[0].extra.nijuu_betsu
  );
  expect(b).toEqual({ ids: ["m1"], date: "2026-11-02", amount: 4500 });
  expect(await dasu(page, "A社")).toBe(true);
});

test("★入金画面の「確認」も 同じ 見張り（開いた 後に 入った 行 → 開かない → もう一度で 開く）★", async ({
  page,
}) => {
  await open(page, { meisai: [gyou("t1", "A社", "2026-11-03", 3000)] });
  await kuraNiTasu(page, gyou("m9", "A社", "2026-11-05", 4500, true));
  await page.evaluate(() => {
    window.__DASU__ = true;
    return previewInvoiceFromPay(null, "2026-11", "A社");
  });
  expect(await page.evaluate(() => window.__MADO__)).toBe(0);
  await expect(toastNo(page)).toContainText("倉庫に この 紙の 新しい 明細");
  await page.evaluate(() => previewInvoiceFromPay(null, "2026-11", "A社"));
  expect(await page.evaluate(() => window.__MADO__)).toBe(1);
  const k = await kami(page);
  expect([...new Set(k.flatMap((x) => x.ids))].sort()).toEqual(["m9", "t1"]);
});

test("★繰越の 会社：この 画面で 入金を 記録した 直後に 嘘の「新しい 入金」で 止めない（入金日 空・あり の 両方）★", async ({
  page,
}) => {
  await open(page, {
    carry: ["A社"],
    meisai: [gyou("t0", "A社", "2026-10-03", 2000), gyou("t1", "A社", "2026-11-03", 3000)],
  });
  for (const hi of ["2026-11-01", ""]) {
    await page.evaluate(() => openPayEdit("2026-10", "A社"));
    await page.locator("#pay_amt").fill(hi ? "2000" : "1500");
    await page.locator("#pay_date").fill(hi);
    await page.evaluate(() => savePay("2026-10", "A社", 2000));
    await expect(toastNo(page)).toContainText("入金を記録しました");
    expect(await dasu(page, "A社"), "★自分の 入金で 止まった（入金日 " + (hi || "空") + "）★").toBe(
      true
    );
  }
  // 別の 端末で 入金が 直った → 止まる
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.payments[0].paid = 1800;
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  expect(await dasu(page, "A社")).toBe(false);
  await expect(toastNo(page)).toContainText("入金 1");
});

test("★料金が 空の メーター行の 行き先を 一覧で 直しても 0円に ならない・前に 0 で 書かれた 行も 止める★", async ({
  page,
}) => {
  const mae0 = gyou("m2", "A社", "2026-11-04", 0, true);
  mae0.extra.dk_meter_yen = null; // 前の 版の 一覧の 直しが 空を 0 に した 行
  await open(page, { meisai: [gyou("m1", "A社", "2026-11-02", null, true), mae0] });
  await page.locator('.nav-item[data-scr="list"]').click();
  await page.evaluate(() => openEdit("m1"));
  await page.waitForTimeout(400);
  await page.fill("#ed_行き先", "本社〜南浜");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  const kura = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.find((r) => r.id === "m1")
  );
  expect(kura.destination).toBe("本社〜南浜");
  expect(kura.amount, "★料金未定の 乗車が 0円で 倉庫に 入った★").toBe(null);
  await page.locator('.nav-item[data-scr="billing"]').click();
  expect(await dasu(page, "A社")).toBe(false);
  expect(await dasu(page, "A社")).toBe(false);
  await expect(page.locator("#hakkoObi")).toContainText("料金が まだ 入っていない 明細が 2件");
  expect(await daicho(page)).toBe(0);
});

test("★料金の 無い メーター行に 一覧で 0 と 打つ＝0円と 決めた 印 → 出せる★", async ({ page }) => {
  await open(page, { meisai: [gyou("m1", "A社", "2026-11-02", null, true)] });
  await page.locator('.nav-item[data-scr="list"]').click();
  await page.evaluate(() => openEdit("m1"));
  await page.waitForTimeout(400);
  await page.fill("#ed_金額", "0");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  const kura = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.find((r) => r.id === "m1")
  );
  expect(kura.amount).toBe(0);
  expect(kura.extra.ryokin_0_kimeta).toBe(true);
  await page.locator('.nav-item[data-scr="billing"]').click();
  expect(await dasu(page, "A社")).toBe(true);
});

test("★前に 0 に された 行（額0・料金も 無い）の 行き先だけ 直しても 0円の 印は 付かず 止まったまま・止めた 訳は 帯にも 出る★", async ({
  page,
}) => {
  const mae0 = gyou("m2", "A社", "2026-11-04", 0, true);
  mae0.extra.dk_meter_yen = null;
  await open(page, { meisai: [mae0] });
  await page.locator('.nav-item[data-scr="list"]').click();
  await page.evaluate(() => openEdit("m2"));
  await page.waitForTimeout(400);
  await page.fill("#ed_行き先", "本社〜南浜");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  const kura = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.find((r) => r.id === "m2")
  );
  expect(kura.destination).toBe("本社〜南浜");
  expect(kura.extra.ryokin_0_kimeta, "★額を 変えて いないのに 0円の 印が 付いた★").toBeUndefined();
  await page.locator('.nav-item[data-scr="billing"]').click();
  // 倉庫と 画面が 違えば 帯に 訳が 全部 出る
  await kuraNiTasu(page, gyou("m9", "A社", "2026-11-05", 4500, true));
  expect(await dasu(page, "A社")).toBe(false);
  await expect(page.locator("#hakkoObi")).toContainText("もう一度 押してください");
  expect(await dasu(page, "A社")).toBe(false);
  await expect(page.locator("#hakkoObi")).toContainText("料金が まだ 入っていない 明細が 1件");
  expect(await daicho(page)).toBe(0);
});
