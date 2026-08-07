import { test, expect } from "@playwright/test";

// 全主要画面が「実行時JSエラー無しで開き、本文が表示される」ことを毎回自動検証する。
// pageerror(未捕捉例外)= 構文崩れ・未定義参照・IME二重発火のような実バグの信号。
// これがゼロであることを画面ごとに保証する = 画面回帰の自動ガード。
//
// ★2026-08-07: このrepoは代行請求書アプリ専用になった★
//   Exallyの画面(home / book / seikyusyo / mitsumoriyo / kyuuryoumeisai / chat)は
//   exally repo が正なので、ここからは外した。
//   飲み屋(売上管理)は 2026-08-01 に nomiya-app / nomiya-app-test へ独立済み。
const PAGES = [{ path: "/daikou-seikyu.html", name: "代行請求書" }];

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
