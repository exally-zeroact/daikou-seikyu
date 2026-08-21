import { defineConfig, devices } from "@playwright/test";

// E2E(画面回帰)設定。静的ファイルを http-server で配信し、実ブラウザで各画面を開いて
// 実行時JSエラー(pageerror)が無いか・主要要素が出るか・操作でクラッシュしないかを自動検証する。
// vitest(tests/**/*.test.js)とは別系統: こちらは tests/e2e/**/*.spec.js のみ対象。
//
// ★2026-08-18 「重い試験は別の組で最後に走らせる」（指示役 許可）★
//   ★「重いから」で時間切れを片づけない★＝何が起きていたかを先に測った:
//     ・regno-gate の「出た紙の中に T+13桁が在る」は ★単独なら27秒で4本とも緑★
//     ・全部まとめて走らせる（16コア＝8ワーカー）と ★毎回どれか1本が30秒で時間切れ★
//       落ちる本は毎回ちがう（totals-one-source だったり regno-gate だったり）
//       ＝★直した所とは関係ない・PDF(フォント約3MB埋め込み)の取り合い★
//   ⇒ 紙(PDF)を作る試験を ★別の組「紙(重い)」★ にして、画面の組が終わってから走らせる。
//     その組だけ 1本あたりの持ち時間を120秒にする（画面の組は30秒のまま）。
//   ★走った本数は毎回 報告に出す★（組ごとに数える）
const HEAVY = [
  "**/regno-gate.spec.js",
  "**/shikisai-harness.spec.js",
  "**/carryover-paper.spec.js",
  "**/paper-ink-fixed.spec.js",
  "**/paper-date-right.spec.js",
  "**/invoice-copy.spec.js",
  "**/totals-one-source.spec.js",
  "**/route-text.spec.js",
  "**/template-thumbs.spec.js",
  "**/excel-no-invoice-sheet.spec.js",
  "**/excel-label-fits.spec.js",
];

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "list",
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    // ①画面の組（軽い）＝先に全部
    { name: "画面", testIgnore: HEAVY, use: { ...devices["Desktop Chrome"] } },
    // ②紙の組（重い）＝画面の組が終わってから・持ち時間120秒
    {
      name: "紙(重い)",
      testMatch: HEAVY,
      timeout: 120000,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["画面"],
    },
  ],
  webServer: {
    command: "npx http-server -p 8080 -c-1 -s .",
    // ★2026-08-07: Exallyの home.html を外したので、代行請求書の画面で待つ★
    url: "http://localhost:8080/daikou-seikyu.html",
    timeout: 60000,
    reuseExistingServer: !process.env.CI,
  },
});
