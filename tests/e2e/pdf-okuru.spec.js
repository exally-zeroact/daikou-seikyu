import { test, expect } from "@playwright/test";

// ============================================================
// ★PDF を 送る（iPhone・iPad は 共有に PDF と 字だけ）★ 2026-11-06 司さん B（lib/pdf-okuru.js）
//
//   ★直す 前★ iPhone で「印刷 / 送る」＝PDF を blob の URL で 開き、その 画面の 共有から 送る
//     → LINE に PDF と 一緒に 開けない blob:https://… の URL も 届いた（11-04 司さん）
//   ★直した 後★ iPhone・iPad は navigator.share({ files:[PDF], text }) ＝url・title は 付けない
//     ・断られた（NotAllowedError＝作る 間に「押した」扱いが 切れた）→ 帯「送る・印刷する」→ 押すと 同じ 共有
//       （司さんの 実機 11-06 11:22：F＝15秒 待つと 断られる／G＝帯の 2回目で LINE に 字と PDF・URL 無し）
//     ・帯でも 断られた → 「PDF を 開く」（今までの 道＝行き止まりに しない）
//     ・やめた（AbortError）→「送るのを やめました」・保存へ 落ちない
//     ・PC・Android・共有の 無い 端末 → 今までの 道（共有を 呼ばない）
//
//   webkit の 組は この repo に 無い＝chromium に iPhone の 名乗り と 偽の share を 入れて 回す
//   （本物の 共有の 画面は 司さんの 実機で 確かめ済み＝ここは 呼び方と 落ち方を 守る）
// ============================================================

const CO = "験模工業株式会社";
const ISSUER =
  "合同会社ZEROact\nZERO代行\n〒100-0000\n東京都架空区見本台1-2-3\nTEL000-0000-0000\n登録番号：T9000000000009";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function seed(issuerText) {
  const uid = "u_okuru";
  const co = "験模工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "g@x.com": { id: uid, email: "g@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "g@x.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: co,
            date: "2026-05-06",
            destination: "本社〜北浜",
            amount: 12000,
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
            config: { issuer: issuerText, bank: "見本銀行　見本支店　普通　7654321" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    })
  );
}

// ★偽の 共有★ modes＝呼ばれる 順の 答え（"ok"／"NotAllowedError"／"AbortError"）・使い切ったら 最後の 物
function fakeShare(modes) {
  window.__shares = [];
  window.__opens = 0;
  window.open = function () {
    window.__opens++;
    return null;
  };
  const share = function (data) {
    const keys = Object.keys(data || {}).sort();
    const files = (data.files || []).map((f) => ({ name: f.name, size: f.size, type: f.type }));
    window.__shares.push({ keys, files, text: data.text });
    const m = modes[Math.min(window.__shares.length - 1, modes.length - 1)];
    if (m === "ok") return Promise.resolve();
    return Promise.reject(new DOMException("偽", m));
  };
  const canShare = function (data) {
    return !!(data && data.files && data.files.length);
  };
  Object.defineProperty(Navigator.prototype, "share", { value: share, configurable: true });
  Object.defineProperty(Navigator.prototype, "canShare", { value: canShare, configurable: true });
}

async function open(page, modes) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(fakeShare, modes);
  await page.addInitScript(seed, ISSUER);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
}

function dlCount(page) {
  const c = { n: 0 };
  page.on("download", () => c.n++);
  return c;
}

const shares = (page) => page.evaluate(() => window.__shares);

test.describe("iPhone", () => {
  test.use({ userAgent: IPHONE_UA });

  test("★共有に PDF と 字だけ（url・title 無し）・保存の 道へ 落ちない★", async ({ page }) => {
    await open(page, ["ok"]);
    const dl = dlCount(page);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await expect.poll(() => shares(page).then((s) => s.length), { timeout: 120000 }).toBe(1);
    const s = (await shares(page))[0];
    // わざと 壊す：share に url を 足す ⇒ ★赤★（blob の URL が LINE に 届く 元）
    expect(s.keys, "★files と text 以外が 渡っている★").toEqual(["files", "text"]);
    expect(s.files.length).toBe(1);
    expect(s.files[0].type).toBe("application/pdf");
    expect(s.files[0].name).toMatch(/\.pdf$/);
    expect(s.files[0].size, "★中身の 無い PDF★").toBeGreaterThan(50000);
    expect(s.text).toBe("請求書 5月分 " + CO + " 御中");
    await expect(page.locator(".toast, #toast").filter({ hasText: "PDFを渡しました" })).toHaveCount(
      1
    );
    await expect(page.locator("#pdfOkuruObi")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(dl.n, "★共有の 後に 保存（blob の URL の 道）も 走った★").toBe(0);
    expect(await page.evaluate(() => window.__opens)).toBe(0);
  });

  test("★断られたら 帯「送る・印刷する」→ 押すと 同じ 共有★", async ({ page }) => {
    await open(page, ["NotAllowedError", "ok"]);
    const dl = dlCount(page);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    const obi = page.locator("#pdfOkuruObi");
    await expect(obi).toBeVisible({ timeout: 120000 });
    await expect(obi).toContainText("PDF が できました");
    // 帯は 画面の 中（下の ナビの 上）に 在る
    const box = await obi.boundingBox();
    const vh = page.viewportSize().height;
    expect(box.y + box.height, "★帯が 画面の 外★").toBeLessThanOrEqual(vh);
    await page.locator("#pdfOkuruGo").click();
    await expect.poll(() => shares(page).then((s) => s.length)).toBe(2);
    const s = await shares(page);
    expect(s[1].keys).toEqual(["files", "text"]);
    expect(s[1].files[0].name).toBe(s[0].files[0].name);
    expect(s[1].files[0].size).toBe(s[0].files[0].size);
    await expect(obi).toHaveCount(0);
    expect(dl.n, "★断られて 保存（blob の URL の 道）に 落ちた★").toBe(0);
  });

  test("★帯でも 断られたら「PDF を 開く」（今までの 道）★", async ({ page }) => {
    await open(page, ["NotAllowedError"]);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await expect(page.locator("#pdfOkuruObi")).toBeVisible({ timeout: 120000 });
    await page.locator("#pdfOkuruGo").click();
    await expect(page.locator("#pdfOkuruMsg")).toContainText("送れませんでした");
    const hiraku = page.locator("#pdfOkuruHiraku");
    await expect(hiraku).toBeVisible();
    const dl = page.waitForEvent("download", { timeout: 30000 });
    await hiraku.click();
    const f = await dl;
    expect(f.suggestedFilename()).toMatch(/\.pdf$/);
    await expect(page.locator("#pdfOkuruObi")).toHaveCount(0);
  });

  test("★やめたら「送るのを やめました」・保存へ 落ちない・帯も 出ない★", async ({ page }) => {
    await open(page, ["AbortError"]);
    const dl = dlCount(page);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await expect(
      page.locator(".toast, #toast").filter({ hasText: "送るのを やめました" })
    ).toHaveCount(1, { timeout: 120000 });
    await expect(page.locator("#pdfOkuruObi")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(dl.n).toBe(0);
  });

  test("★帯が 出ても ボタンは 戻る・知らせは 帯に 隠れない★", async ({ page }) => {
    await open(page, ["NotAllowedError"]);
    const btn = page.locator("#btnInvPdf");
    await btn.click();
    const obi = page.locator("#pdfOkuruObi");
    await expect(obi).toBeVisible({ timeout: 120000 });
    await expect(btn, "★帯の 後も ボタンが 止まった まま★").toBeEnabled();
    // 帯が 出ている 間の 知らせ（作る 途中の「読み直せませんでした」等）＝帯と 重ならず 上に 出る（対立役 注2）
    await page.evaluate(() => window.toast("知らせの 試し", 5000));
    const t = page.locator("#toast");
    await expect(t).toHaveClass(/show/);
    await page.waitForTimeout(400); // 出る 動き（0.25秒）を 待つ
    const tb = await t.boundingBox();
    const ob = await obi.boundingBox();
    expect(
      tb.y + tb.height,
      "★知らせが 帯に 重なる★ " + JSON.stringify({ tb, ob })
    ).toBeLessThanOrEqual(ob.y);
  });

  test("★帯は 紙の 印刷に 載らない★", async ({ page }) => {
    await open(page, ["NotAllowedError"]);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    const obi = page.locator("#pdfOkuruObi");
    await expect(obi).toBeVisible({ timeout: 120000 });
    await page.emulateMedia({ media: "print" });
    await expect(obi, "★帯が 印刷に 載る★（対立役 注1 2回目）").toBeHidden();
    await page.emulateMedia({ media: "screen" });
    await expect(obi).toBeVisible();
  });

  test("★月・会社を 変えたら 帯を 消す（前の 会社の 紙を 送らない）★", async ({ page }) => {
    await open(page, ["NotAllowedError"]);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await expect(page.locator("#pdfOkuruObi")).toBeVisible({ timeout: 120000 });
    await page.selectOption("#invCompany", ""); // 全社 へ
    await expect(page.locator("#pdfOkuruObi")).toHaveCount(0);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await expect(page.locator("#pdfOkuruObi")).toBeVisible({ timeout: 120000 });
    await page.selectOption("#invMonth", "");
    await expect(page.locator("#pdfOkuruObi")).toHaveCount(0);
  });

  test("★画面を 移ったら 帯を 消す（古い 紙を 送らない）★", async ({ page }) => {
    await open(page, ["NotAllowedError"]);
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await expect(page.locator("#pdfOkuruObi")).toBeVisible({ timeout: 120000 });
    await page.locator('.nav-item[data-scr="input"]').click();
    await expect(page.locator("#pdfOkuruObi")).toHaveCount(0);
  });
});

test.describe("PC", () => {
  test("★PC は 共有が 在っても 呼ばない＝今まで 通り★", async ({ page }) => {
    await open(page, ["ok"]);
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await dl; // 窓は 止めてある＝保存に 落ちる（今までの 道）
    expect(await page.evaluate(() => window.__opens)).toBe(1);
    expect((await shares(page)).length, "★PC で 共有を 呼んだ★").toBe(0);
  });
});
