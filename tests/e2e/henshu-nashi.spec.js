import { test, expect } from "@playwright/test";

// ============================================================
// ★編集タブは無い★ 2026-11-04（司さん「編集タブはいらない」＝釦もページも消した）
//
//   ① 下の帯に「編集」の釦が無い・#scr-edit のページが無い
//   ② 前に編集タブで保存した 字の係数（全体 fontScale・範囲別 blkFs）が残っていても、
//      紙と Excel に渡す issuerForEngine は fontScale 1・blkFs null を返す
//      （消した後は 戻す所が無い＝残った係数で 行数の計算と紙が食い違わない・本番前の対立役 注2）
//      ★わざと壊して 赤★ issuerForEngine の fontScale: 1 を s.fontScale に戻す ⇒ ② が赤
//   ③ 請求タブの紙のプレビューが、消した関数（_overlayHitBlocks 等）を呼ばずに描ける
// ============================================================

function seedDb() {
  const uid = "u_henshu";
  const co = "験模工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "h@example.com": { id: uid, email: "h@example.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "h@example.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: co,
            date: "2026-05-06",
            destination: "本社〜北浜〜曽根崎",
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
      },
    })
  );
}

async function hiraku(page, errors) {
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seedDb);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
}

test("① 編集の釦もページも無い", async ({ page }) => {
  const errors = [];
  await hiraku(page, errors);
  await expect(page.locator(".bottom-nav .nav-item")).toHaveCount(5);
  await expect(page.locator('.nav-item[data-scr="edit"]')).toHaveCount(0);
  await expect(page.locator("#scr-edit")).toHaveCount(0);
  await expect(page.locator("#editOut")).toHaveCount(0);
  await expect(page.locator(".bottom-nav")).not.toContainText("編集");
  expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
});

test("② 保存済みの字の係数（1.4・範囲別）が残っていても 紙へは 1 と null", async ({ page }) => {
  const errors = [];
  await hiraku(page, errors);
  const r = await page.evaluate(() => {
    if (!ISSUER_SETTINGS[CURRENT_ACCOUNT]) ISSUER_SETTINGS[CURRENT_ACCOUNT] = blankIssuer();
    var s = ISSUER_SETTINGS[CURRENT_ACCOUNT];
    s.fontScale = 1.4;
    s.blkFs = { table: 1.4, info: 1.3, grand: 1.2 };
    var a = issuerForEngine();
    var b = issuerForEngine("験模工業株式会社", "2026-05");
    return {
      saved: [s.fontScale, JSON.stringify(s.blkFs)],
      a: [a.fontScale, a.blkFs],
      b: [b.fontScale, b.blkFs],
    };
  });
  expect(r.saved[0], "★試験の前提（保存済みの係数を入れた）が崩れた★").toBe(1.4);
  expect(r.a, "★全体の紙に 保存済みの係数が渡った★").toEqual([1, null]);
  expect(r.b, "★会社の紙に 保存済みの係数が渡った★").toEqual([1, null]);
  expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
});

test("③ 請求タブの紙のプレビューが描ける（消した関数を呼ばない）", async ({ page }) => {
  const errors = [];
  await hiraku(page, errors);
  await page.locator('.nav-item[data-scr="billing"]').click();
  await expect(page.locator("#scr-billing")).toBeVisible();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", "験模工業株式会社");
  await expect(page.locator("#invoiceOut canvas.inv-pdf-canvas").first()).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator("#invoiceOut .li-empty")).toHaveCount(0);
  await expect(page.locator("#invoiceOut .hit-box")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 820 }); // 回転・幅変え＝_onViewportChange が走る
  await page.waitForTimeout(300);
  expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
});
