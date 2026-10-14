import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// 一覧で 金額を 直した 後、事務所（ダイコメ）の 売上へ 戻せなかった 時に 黙らない 2026-10-14
//
//   指示役：dk-fix-fare を 呼ぶ 所は 1か所・失敗を 読む 所は 0（成功の 時だけ toast・例外は console.warn・
//   ログイン 切れは 黙って return）だった。全部を 受け口 1つ（_dkFixKotae）に 通し、揃っていない 時は
//   一覧の 頭に 1行ずつ 帯（読み込み直しても 残る）。「もう一度 送る」は 何も 直っていない 時だけ。
//
//   ★functions/v1 は 全部 この 試験が 受ける★（偽の 倉庫は SB だけ 差し替え、生の fetch は 本物の
//    テスト倉庫に 届く＝対立役）。受けていない 呼び出しは 赤。
//
//   ★わざと壊して 赤に なるのを 見た（2026-10-14 実測）★
//     受け口を 入れる 前の daikou-seikyu.html に 戻す ⇒ 赤（帯が 出ない）
// ============================================================

test.setTimeout(120000);

async function hiraku(page, kotae) {
  const yobi = [];
  await page.route("**/functions/v1/**", async (r) => {
    const u = r.request().url();
    yobi.push({ url: u, body: r.request().postData() });
    if (!/\/functions\/v1\/dk-fix-fare$/.test(u))
      return r.fulfill({ status: 599, body: "受けていない 呼び出し" });
    if (typeof kotae === "function") return kotae(r);
    const k = kotae.shift ? kotae.shift() : kotae;
    if (k === "abort") return r.abort("failed");
    return r.fulfill({
      status: k.status,
      contentType: "application/json",
      body: typeof k.body === "string" ? k.body : JSON.stringify(k.body),
    });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  // m0 を ダイコメから 来た 行に・ログインに 鍵（access_token）を 付ける
  await page.addInitScript(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
    if (db.session) db.session.access_token = "tok";
    const m = db.tables && db.tables.meisai;
    if (m && m[0]) m[0].extra = { dk_source: "daikome", dk_ref: "dev1:1700000000000:1" };
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await page.waitForSelector("#scr-input", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);
  return yobi;
}

async function kingakuNaosu(page, yen) {
  await nav(page, "list");
  await page.evaluate(() => openEdit("m0"));
  await page.waitForTimeout(400);
  await page.fill("#ed_金額", String(yen));
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
}

const obi = (page) => page.locator("#dkFixObi .dkfix-obi");

test("uriage_reset_failed（500）＝帯に 何が 直り 何が 直らないか・揃っていない・送り直しは 出さない", async ({
  page,
}) => {
  const yobi = await hiraku(page, [
    {
      status: 500,
      body: { ok: false, reason: "uriage_reset_failed", updated: 1, shift_total: 9000 },
    },
  ]);
  await kingakuNaosu(page, 1500);
  expect(yobi.length).toBe(1);
  await expect(obi(page)).toHaveCount(1);
  await expect(obi(page)).toContainText("事務所が 前に 直した 売上を 外せませんでした");
  await expect(obi(page)).toContainText("揃っていません");
  await expect(obi(page).locator("[data-dkfix-okuru]")).toHaveCount(0);
  // 読み込み直しても 残る
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  await nav(page, "list");
  await expect(obi(page)).toContainText("外せませんでした");
});

test("ログインが 切れた（401・訳 無し）＝送り直しを 出し、押して 直れば 帯が 消える", async ({
  page,
}) => {
  const yobi = await hiraku(page, [
    { status: 401, body: { code: 401, message: "Invalid JWT" } },
    { status: 200, body: { ok: true, updated: 1, shift_total: 9000, uriage_hazushita: 0 } },
  ]);
  await kingakuNaosu(page, 1600);
  await expect(obi(page)).toContainText("ログインが 切れていて");
  const b = obi(page).locator("[data-dkfix-okuru]");
  await expect(b).toHaveCount(1);
  await b.click();
  await page.waitForTimeout(800);
  expect(yobi.length).toBe(2);
  await expect(obi(page)).toHaveCount(0);
});

test("届かない（通信が 切れた）＝届いたか 分からない・送り直しは 出さない", async ({ page }) => {
  await hiraku(page, ["abort"]);
  await kingakuNaosu(page, 1700);
  await expect(obi(page)).toContainText("届いたか 分かりません");
  await expect(obi(page).locator("[data-dkfix-okuru]")).toHaveCount(0);
});

test("JSON で ない 500・知らない 訳 も 揃っていない と 出す", async ({ page }) => {
  await hiraku(page, [{ status: 500, body: "<html>oops</html>" }]);
  await kingakuNaosu(page, 1800);
  await expect(obi(page)).toContainText("揃っていません");
});

test("直った（updated>0）＝帯は 出ない・手で 入れた 行（not_daikome）も 黙る", async ({ page }) => {
  const yobi = await hiraku(page, [
    { status: 200, body: { ok: true, updated: 1, shift_total: 9000, uriage_hazushita: 0 } },
  ]);
  await kingakuNaosu(page, 1900);
  expect(yobi.length).toBe(1);
  await expect(obi(page)).toHaveCount(0);
});

// ── (2) 事務所が 直していた 売上を 外した 時は 知らせる 2026-10-14（指示役）──
//   ★わざと壊して 赤に なるのを 見た★：知らせを 入れる 前の 版で 赤（帯が 出ない）
for (const n of [1, 2]) {
  test(
    "事務所の 直しを 外した（uriage_hazushita=" + n + "）＝件数の まま 知らせる・送り直しは 無い",
    async ({ page }) => {
      await hiraku(page, [
        { status: 200, body: { ok: true, updated: 1, shift_total: 9000, uriage_hazushita: n } },
      ]);
      await kingakuNaosu(page, 2100);
      await expect(obi(page)).toHaveCount(1);
      await expect(obi(page)).toHaveClass(/dkfix-shirase/);
      await expect(obi(page)).toContainText("この 直しで 外しました（" + n + "件）");
      await expect(obi(page)).not.toContainText("揃っていません");
      await expect(obi(page).locator("[data-dkfix-okuru]")).toHaveCount(0);
      await obi(page).locator("[data-dkfix-x]").click();
      await expect(obi(page)).toHaveCount(0);
    }
  );
}

test("外していない（uriage_hazushita=0）＝知らせない", async ({ page }) => {
  await hiraku(page, [
    { status: 200, body: { ok: true, updated: 1, shift_total: 9000, uriage_hazushita: 0 } },
  ]);
  await kingakuNaosu(page, 2200);
  await expect(obi(page)).toHaveCount(0);
});

// ── 本番前の 対立役（2026-10-14）の 指摘への 試験 ──
//   ★わざと壊して 赤に なるのを 見た★：直す 前の 版（0673c2f）で 下の「2回目を 捨てない」「人ごと」「消した 行」が 赤
test("送っている 間に もう一度 直したら 捨てずに 終わった 後に 送り直す", async ({ page }) => {
  const yobi = [];
  const kotae = async (r) => {
    yobi.push(Date.now());
    await new Promise((ok) => setTimeout(ok, 1500));
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, updated: 1, shift_total: 1, uriage_hazushita: 0 }),
    });
  };
  await hiraku(page, kotae);
  await nav(page, "list");
  for (const yen of [3100, 3200]) {
    await page.evaluate(() => openEdit("m0"));
    await page.waitForTimeout(300);
    await page.fill("#ed_金額", String(yen));
    await page.locator("#modalBody button", { hasText: "保存" }).click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(4000);
  expect(yobi.length, "2回目が 捨てられた").toBe(2);
  expect(yobi[1] - yobi[0], "2本 同時に 送った").toBeGreaterThanOrEqual(1400);
});

test("帯は ログインした 人ごと（別の 人には 見えない）・行を 消したら 帯も 消える", async ({
  page,
}) => {
  await hiraku(page, [{ status: 500, body: { ok: false, reason: "uriage_reset_failed" } }]);
  await kingakuNaosu(page, 3300);
  await expect(obi(page)).toHaveCount(1);
  const betsu = await page.evaluate(() => {
    const moto = CURRENT_ACCOUNT;
    CURRENT_ACCOUNT = "betsu-no-hito";
    _dkFixObi();
    const n = document.querySelectorAll("#dkFixObi .dkfix-obi").length;
    CURRENT_ACCOUNT = moto;
    _dkFixObi();
    return n;
  });
  expect(betsu, "別の 人に 前の 人の 帯が 見えた").toBe(0);
  await expect(obi(page)).toHaveCount(1);
  await page.evaluate(() => deleteRow("m0"));
  await page.waitForTimeout(800);
  await expect(obi(page)).toHaveCount(0);
});

// 訳ごとの 字と 送り直しの 有無（dk-fix-fare の 段ごとの 本当の 動き）・中の 言葉は 字に 出さない
for (const [na, k, ji, okuru] of [
  [
    "read_failed（業務の 合計）",
    { status: 500, body: { ok: false, reason: "read_failed", at: "trips", updated: 1 } },
    "業務の 合計が 直っていません",
    0,
  ],
  [
    "read_failed（業務）",
    { status: 500, body: { ok: false, reason: "read_failed", at: "shift" } },
    "何も 直っていません",
    1,
  ],
  [
    "trip_update_failed",
    { status: 500, body: { ok: false, reason: "trip_update_failed" } },
    "何も 直っていません",
    1,
  ],
  [
    "shift_update_failed",
    { status: 500, body: { ok: false, reason: "shift_update_failed" } },
    "業務の 合計が 直っていません",
    0,
  ],
  [
    "no_trip",
    { status: 200, body: { ok: true, updated: 0, reason: "no_trip" } },
    "記録が 見つからず",
    0,
  ],
  [
    "no_row（404）",
    { status: 404, body: { ok: false, reason: "no_row" } },
    "受け付けませんでした",
    0,
  ],
]) {
  test("訳ごと：" + na, async ({ page }) => {
    await hiraku(page, [k]);
    await kingakuNaosu(page, 3400);
    await expect(obi(page)).toContainText(ji);
    await expect(obi(page)).toContainText("揃っていません");
    await expect(obi(page).locator("[data-dkfix-okuru]")).toHaveCount(okuru);
    const t = await obi(page).textContent();
    expect(t, "中の 言葉が 客の 字に 出た").not.toMatch(/[a-z]+_[a-z]+/);
  });
}

// 本番前の 対立役（2回目）：送っている 最中に 行を 消すと、返事（409 deleted）で 消した 行の 帯が 出直した
//   ★わざと壊して 赤に なるのを 見た★：直す 前の 版（5abbf9c）で 赤
test("送っている 最中に 行を 消したら 返事が 来ても 帯を 出さない", async ({ page }) => {
  const kotae = async (r) => {
    await new Promise((ok) => setTimeout(ok, 1500));
    return r.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "deleted" }),
    });
  };
  await hiraku(page, kotae);
  await nav(page, "list");
  await page.evaluate(() => openEdit("m0"));
  await page.waitForTimeout(300);
  await page.fill("#ed_金額", "4100");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(200);
  await page.evaluate(() => deleteRow("m0"));
  await page.waitForTimeout(2500);
  await expect(obi(page)).toHaveCount(0);
});
