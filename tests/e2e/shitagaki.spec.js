import { test, expect } from "@playwright/test";
// ============================================================
// ★写真と声 → AI の 下書き（③）★ 2026-11-03（司さん 11-02「AI が 下書き→人が 確かめて 保存した 時だけ 入る」）
//   口 /api/shitagaki は page.route で 偽に する（AI へは 送らない・お金 0円）。値は 全部 作り物。
//   押す 事：釦は ?tou=1 が true の 時だけ／下書きは 倉庫へ 書かない／「確かめた」まで 保存しない／
//   候補は 人が 選ぶ／AI 由来の 字は esc／会社が 替わったら 捨てる／写真は 縮めて 送る／JSON で ない 答えは 状態の 番号で 出す
// ============================================================
test.setTimeout(120000);

const CO = "作り物商事";
const CO2 = "見本運輸";
function seed() {
  const uid = "u_sg";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "s@x.com": { id: uid, email: "s@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "s@x.com" }, access_token: "jwt-e2e" },
      tables: {
        meisai: [],
        companies: ["作り物商事", "見本運輸"].map((n, i) => ({
          id: "c" + i,
          user_id: uid,
          name: n,
          items: i ? ["日付", "行き先", "金額", "人数"] : ["日付", "行き先", "金額"],
          config: {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        })),
        issuer: [],
        invoices: [],
        invoice_no: [],
        payments: [],
        export_tokens: [],
      },
    })
  );
}

/* 偽の 口：tou＝?tou=1 の 答え／post＝(本文)→{status, body|text} */
async function kuchi(page, o) {
  const log = { tou: [], post: [] };
  await page.route("**/api/shitagaki**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      log.tou.push(req.headers()["authorization"]);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tsukaeru: o.tou }),
      });
    }
    const b = JSON.parse(req.postData() || "{}");
    log.post.push({ b, auth: req.headers()["authorization"] });
    if (o.matsu) await o.matsu;
    const a = o.post ? o.post(b) : { status: 500, body: { ok: false, message: "x" } };
    return route.fulfill({
      status: a.status,
      contentType: a.text != null ? "text/plain" : "application/json",
      body: a.text != null ? a.text : JSON.stringify(a.body),
    });
  });
  return log;
}
async function hiraku(page, co) {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator("#inputCompany").selectOption(co || CO);
}
const kaita = (page) => page.evaluate(() => (window.__FAKE_WRITES__ || {}).meisai || 0);
const meisaiDomo = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai);
function hiOf(kyou) {
  const p = kyou.split("-");
  return { hi_nen: p[0], hi_tsuki: String(+p[1]), hi_hi: String(+p[2]) };
}
async function koeOkuru(page, bun) {
  await page.locator("#aiSgKoe").click();
  await page.locator("#aiSgBun").fill(bun || "駅まで 3000円");
  await page.locator("#aiSgKoeOkuru").click();
}

test("釦は ?tou=1 が true の 時だけ（false・口が 無い 時は 出ない）", async ({ page }) => {
  const log = await kuchi(page, { tou: false });
  await hiraku(page);
  await expect(page.locator("#entryCard")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator("#aiSg")).toBeHidden();
  expect(log.tou).toEqual(["Bearer jwt-e2e"]);
});

test("口が 無い（404）でも 釦は 出ない・画面は 今まで 通り", async ({ page }) => {
  await hiraku(page);
  await page.waitForTimeout(800);
  await expect(page.locator("#aiSg")).toBeHidden();
  await expect(page.locator("#entryBody .entry-line")).toHaveCount(1);
});

test("★下書きは 倉庫へ 書かない・確かめるまで 保存しない・候補は 人が 選ぶ★", async ({ page }) => {
  const log = await kuchi(page, {
    tou: true,
    post: (b) => ({
      status: 200,
      body: {
        ok: true,
        model: "claude-opus-5-5",
        kekka: {
          gyou: [
            {
              ...hiOf(b.kyou),
              k1: "駅",
              k2: "3000円",
              kingaku_kouho: [{ ji: "料金", atai: "3000円" }],
            },
            {
              ...hiOf(b.kyou),
              k1: "港",
              k2: "",
              kingaku_kouho: [
                { ji: "基本", atai: "2,000" },
                { ji: "合計", atai: "2,500" },
              ],
            },
          ],
          yomenai: [],
          kaisha_no_ji: "",
        },
      },
    }),
  });
  await hiraku(page);
  await expect(page.locator("#aiSg")).toBeVisible();
  await koeOkuru(page, "駅まで 3000円、港まで");
  await expect(page.locator("#entryBody .entry-line.ai-row")).toHaveCount(2);
  // 送った 形
  const p = log.post[0];
  expect(p.auth).toBe("Bearer jwt-e2e");
  expect(p.b).toMatchObject({
    shurui: "koe",
    kaisha: CO,
    koumoku: ["日付", "行き先", "金額"],
    bun: "駅まで 3000円、港まで",
  });
  expect(p.b.kyou).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // 空の 1行は 置き換わった・倉庫へは 0回
  await expect(page.locator("#entryBody .entry-line")).toHaveCount(2);
  expect(await kaita(page)).toBe(0);
  // 日付は 年まで
  const y = p.b.kyou.slice(0, 4);
  await expect(page.locator("#entryBody .entry-line").nth(0).locator(".date-show")).toContainText(
    y + "/"
  );
  await expect(page.locator("#aiSgModel")).toContainText("claude-opus-5-5");
  // 2行目＝候補が 2つ＝金額は 空・赤い 枠
  const r2 = page.locator("#entryBody .entry-line").nth(1);
  await expect(r2.locator(".ef-yomenai")).toHaveCount(1);
  await expect(r2.locator(".ai-kouho button")).toHaveCount(2);

  // 確かめず 保存 → 止まる（金額が 空 が 先）
  await page.getByRole("button", { name: "保存する" }).click();
  await page.waitForTimeout(300);
  expect(await kaita(page)).toBe(0);
  // 候補を 選ぶ（確かめた は 付かない）
  await r2.locator(".ai-kouho button").nth(1).click();
  await expect(page.locator("#entryBody .entry-line").nth(1).locator("input.num")).toHaveValue(
    "2500"
  );
  await expect(page.locator("#entryBody .ai-kakunin-cb").nth(1)).not.toBeChecked();
  // 1行だけ 確かめて 保存 → 止まる
  await page.locator("#entryBody .ai-kakunin-cb").nth(0).check();
  await page.getByRole("button", { name: "保存する" }).click();
  await page.waitForTimeout(300);
  expect(await kaita(page)).toBe(0);
  // 両方 確かめて 保存 → 入る
  await page.locator("#entryBody .ai-kakunin-cb").nth(1).check();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect.poll(() => kaita(page)).toBe(1);
  const m = await meisaiDomo(page);
  expect(m.map((r) => [r.company, r.destination, r.amount, r.date])).toEqual([
    [CO, "駅", 3000, p.b.kyou],
    [CO, "港", 2500, p.b.kyou],
  ]);
  // ★倉庫の 形は 変わらない★（印は 入らない）
  for (const r of m) for (const k of Object.keys(r)) expect(k.startsWith("_")).toBe(false);
  for (const r of m) expect(JSON.stringify(r.extra || {})).not.toMatch(/_ai|_kakunin|kouho/);
});

test("★AI 由来の 字は esc（img を 作らない）★", async ({ page }) => {
  const X = '<img src=x onerror="window.__xss=1">';
  await kuchi(page, {
    tou: true,
    post: (b) => ({
      status: 200,
      body: {
        ok: true,
        model: X,
        kekka: {
          gyou: [
            {
              ...hiOf(b.kyou),
              k1: X,
              k2: "",
              kingaku_kouho: [
                { ji: X, atai: "100" },
                { ji: X, atai: "200" },
              ],
            },
          ],
          yomenai: [{ gyou: 0, koumoku: "k1", wake: X }],
          kaisha_no_ji: X,
        },
      },
    }),
  });
  await hiraku(page);
  await koeOkuru(page);
  await expect(page.locator("#entryBody .entry-line.ai-row")).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(await page.locator("#scr-input img").count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator("#aiSgObi")).toContainText("<img");
});

test("会社が 替わったら 届いた 下書きを 捨てる", async ({ page }) => {
  let hanasu;
  const matsu = new Promise((r) => (hanasu = r));
  await kuchi(page, {
    tou: true,
    matsu,
    post: (b) => ({
      status: 200,
      body: {
        ok: true,
        kekka: {
          gyou: [{ ...hiOf(b.kyou), k1: "駅", k2: "1", kingaku_kouho: [] }],
          yomenai: [],
          kaisha_no_ji: "",
        },
      },
    }),
  });
  await hiraku(page);
  await koeOkuru(page);
  await expect(page.locator("#aiSgMatsu")).toBeVisible();
  await expect(page.locator("#aiSgKoeOkuru")).toBeDisabled();
  await page.locator("#inputCompany").selectOption(CO2);
  hanasu();
  await expect(page.locator("#aiSgObi")).toContainText("会社が替わったので下書きを捨てました");
  await expect(page.locator("#entryBody .entry-line.ai-row")).toHaveCount(0);
});

test("JSON で ない 答え（504）は 状態の 番号で 出す・0行は「読めませんでした」", async ({
  page,
}) => {
  let n = 0;
  await kuchi(page, {
    tou: true,
    post: () =>
      ++n === 1
        ? { status: 504, text: "An error occurred with your deployment" }
        : { status: 200, body: { ok: true, kekka: { gyou: [], yomenai: [], kaisha_no_ji: "" } } },
  });
  await hiraku(page);
  await koeOkuru(page);
  await expect(page.locator("#aiSgObi")).toContainText("状態 504");
  await page.locator("#aiSgBun").fill("x");
  await page.locator("#aiSgKoeOkuru").click();
  await expect(page.locator("#aiSgObi")).toContainText("1行も読めませんでした");
  await expect(page.locator("#entryBody .entry-line")).toHaveCount(1);
  expect(await kaita(page)).toBe(0);
});

test("写真は 長い辺 2000px の JPEG に 縮めて 送る", async ({ page }) => {
  const log = await kuchi(page, {
    tou: true,
    post: () => ({
      status: 200,
      body: { ok: true, kekka: { gyou: [], yomenai: [], kaisha_no_ji: "" } },
    }),
  });
  await hiraku(page);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 3000;
    c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = "#336699";
    g.fillRect(0, 0, 3000, 1200);
    const d = c.toDataURL("image/png");
    return d.slice(d.indexOf(",") + 1);
  });
  await page.locator("#aiSgFile").setInputFiles({
    name: "denpyo.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect.poll(() => log.post.length).toBe(1);
  const b = log.post[0].b;
  expect(b.shurui).toBe("shashin");
  expect(b.media_type).toBe("image/jpeg");
  const wh = await page.evaluate(
    (b64) =>
      new Promise((ok) => {
        const im = new Image();
        im.onload = () => ok([im.naturalWidth, im.naturalHeight]);
        im.src = "data:image/jpeg;base64," + b64;
      }),
    b.gazou_base64
  );
  expect(wh).toEqual([2000, 800]);
});
