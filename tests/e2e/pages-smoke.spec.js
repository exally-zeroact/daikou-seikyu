import { test, expect } from "@playwright/test";

// 全主要画面が「実行時JSエラー無しで開き、本文が表示される」ことを毎回自動検証する。
// pageerror(未捕捉例外)= 構文崩れ・未定義参照・IME二重発火のような実バグの信号。
// これがゼロであることを画面ごとに保証する = 画面回帰の自動ガード。
const PAGES = [
  { path: "/home.html", name: "ホーム" },
  { path: "/book.html", name: "スプレッドシート" },
  { path: "/seikyusyo.html", name: "請求書" },
  { path: "/mitsumoriyo.html", name: "見積書" },
  { path: "/kyuuryoumeisai.html", name: "給料明細" },
  { path: "/nomiya-uriage.html", name: "売上管理(飲み屋)" },
];

for (const p of PAGES) {
  test(`${p.name} (${p.path}) が実行時エラー無しで開く`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(p.path, { waitUntil: "load" });
    // スクリプト初期化が走るまで少し待つ
    await page.waitForTimeout(800);

    await expect(page.locator("body")).toBeVisible();
    expect(errors, `pageerror が発生: ${errors.join(" | ")}`).toEqual([]);
  });
}
