import { test, expect } from "@playwright/test";

// book.html(スプレッドシート)の基本操作が壊れていないかを自動検証。
// グリッドは canvas(#grid-canvas)描画のため計算結果値は DOM から読めないが、
// 「セルを選んで数式を打って確定してもクラッシュしない/数式バーが存在する」ことを回帰ガードする。
test.describe("book.html 数式入力操作", () => {
  test("グリッドにセル選択→数式入力→Enter で実行時エラーが出ない", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto("/book.html", { waitUntil: "load" });
    await page.waitForTimeout(800);

    // 数式バー要素が DOM 上に存在すること(canvas グリッドの入力受け口)
    await expect(page.locator("#cell-input")).toBeAttached();
    await expect(page.locator("#cell-addr")).toBeAttached();

    // 実ユーザー操作: canvas グリッドをクリックしてセルを選択 → 数式を打って確定
    const canvas = page.locator("#grid-canvas");
    await expect(canvas).toBeVisible();
    await canvas.click({ position: { x: 90, y: 60 } });
    await page.keyboard.type("=SUM(1,2,3)");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    expect(errors, `pageerror が発生: ${errors.join(" | ")}`).toEqual([]);
  });
});
