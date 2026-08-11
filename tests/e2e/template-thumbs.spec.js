import { test, expect } from "@playwright/test";

// ============================================================
// ★設定▸テンプレートのサンプルが5枚とも出るか★ 2026-08-11
//
//   司さんの実機で ★5枚とも画像が壊れて「?」★ になっていた（tpl_*.png が repo に0件＝404）。
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「設定」
//     2. 「テンプレート」タブ
//     3. 「エレガント」  … 2枚出るか
//     4. 「クラシック」  … 3枚出るか
//   見るのは「DOMに在る」ではなく ★実際に大きさを持って描かれているか★。
// ============================================================

const CASES = [
  ["エレガント", 2],
  ["クラシック", 3],
];

function seed() {
  const uid = "u_tpl";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: [],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: "飛勝工業株式会社",
            items: ["日付", "行き先", "金額"],
            config: {},
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

for (const [label, kazu] of CASES) {
  test(`設定▸テンプレート: ${label} のサンプルが${kazu}枚とも出る`, async ({ page }) => {
    const errors = [];
    const missing = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    // ★404を1本でも出したら記録する★
    page.on("response", (r) => {
      if (r.status() === 404) missing.push(r.url());
    });

    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });

    await page.locator('.nav-item[data-scr="settings"]').click();
    await page.getByRole("button", { name: "テンプレート" }).click();
    await page.locator("#designSeg").getByRole("button", { name: label }).click();
    await page.waitForTimeout(300);

    const thumbs = page.locator("#tplGallery .tpl-thumb");
    await expect(thumbs, `${label} のサンプルの枚数`).toHaveCount(kazu);

    // ★「在る」ではなく「描かれている」を測る★
    const box = await page.evaluate(() =>
      [...document.querySelectorAll("#tplGallery .tpl-thumb")].map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height) };
      })
    );
    for (const b of box) {
      expect(b.w, `サンプルの幅が0（潰れている）: ${JSON.stringify(box)}`).toBeGreaterThan(40);
      expect(b.h, `サンプルの高さが0（潰れている）: ${JSON.stringify(box)}`).toBeGreaterThan(60);
    }

    // ★壊れた画像が1つも無い★（img なら naturalWidth が0になる）
    const broken = await page.evaluate(
      () =>
        [...document.querySelectorAll("#tplGallery img")].filter(
          (im) => !im.complete || im.naturalWidth === 0
        ).length
    );
    expect(broken, "★壊れた画像が在る（404）★").toBe(0);

    expect(missing, `★404が出た: ${missing.join(" / ")}★`).toEqual([]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
}

test("サンプルの色に Exallyの緑が1色も無い", async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="settings"]').click();
  await page.getByRole("button", { name: "テンプレート" }).click();

  const cols = await page.evaluate(() => {
    const out = new Set();
    for (const d of ["elegant", "classic"]) {
      for (const v of window.designVariants(d)) {
        const svg = window.tplThumbSvg(d, v);
        for (const m of svg.matchAll(/#([0-9A-Fa-f]{6})/g)) out.add(m[1].toUpperCase());
      }
    }
    return [...out];
  });
  const green = cols.filter((c) => {
    const r = parseInt(c.slice(0, 2), 16),
      g = parseInt(c.slice(2, 4), 16),
      b = parseInt(c.slice(4, 6), 16);
    return g > r + 6 && g > b + 4;
  });
  expect(
    green,
    `★サンプルに緑が残っている: ${green.join(",")}（全色: ${cols.join(",")}）★`
  ).toEqual([]);
});
