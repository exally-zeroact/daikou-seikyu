import { test, expect } from "@playwright/test";

// ============================================================
// ★スマホ幅で 潰れ0・はみ出し0★ 2026-08-10
//
//   flex/grid の箱に入った字は「DOMに在るのに1文字ずつ縦に割れる」ことがある。
//   この型で踏むのは3回目なので、★幅を変えて実際に測る★試験にした。
//     ・横に溢れていないか   … scrollWidth と clientWidth
//     ・縦に割れていないか   … 箱の幅が1文字ぶん程度しかない要素を数える
//     ・紙が読めるか         … 請求書の画面で紙(canvas)が出る
//
//   ★★2026-09-05 穴を 2つ 塞いだ（Rakunally が 借りて 気づいた）★★
//     ①★4文字未満を 1つも 見ていなかった★
//        設定／入金／入力／一覧／編集／請求 … ★この 画面の 札は 全部 2文字★
//        ⇒ ★まるごと 見張りの 外＝潰しても 赤に ならない★
//     ②★12×1.6＝19.200000000000003★ ⇒ ちょうどの 幅が 割れ扱いに なる
//
//   ★★実測（2026-09-05・幅375/390/412）★★
//     ★今の 画面に 潰れは 0個★（2文字 77個・3文字 12個・4文字以上 73個・境界ちょうど 0個）
//     ⇒ ★直す所は 無い。物差しだけ 直した★
//
//   ★★わざと 潰して 赤に なる事を 見た（幅390・.nav-lb を 14px に）★★
//     ★直す前（4文字以上）★ …… ★1個しか 見つからない★（「請求/集計」だけ）
//     ★直した後（2文字から）★ … ★6個 見つかる★
//       設定 14x30／入金 14x30／入力 14x30／一覧 14x30／編集 14x30／請求/集計 14x60
//     ⇒ ★半分だけ 効いていた＝一番 見つけにくい 形★だった
//
//   ★分かった 事（この 画面の 作り）★
//     札は ★white-space: nowrap★ なので 今は 縦に 割れない（横に はみ出る）
//     ⇒ ★はみ出しの 方（scrollWidth）で 捕まる★。折り返す 作りに 変えた 時に この 見張りが 効く
// ============================================================

const WIDTHS = [375, 390, 412];

function seedDb() {
  const uid = "u_width";
  const co = "飛勝工業株式会社";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "w@example.com": { id: uid, email: "w@example.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "w@example.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: co,
            date: "2026-05-06",
            destination: "本社〜北浜〜曽根崎",
            amount: 12000,
            note: "深夜",
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

// 押す物の一覧（先に書く）：設定 / 入金 / 入力 / 一覧 / 編集 / 請求
const SCREENS = ["settings", "payment", "input", "list", "edit", "billing"];

for (const w of WIDTHS) {
  test(`幅${w}: 全画面で 潰れ0・はみ出し0`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewportSize({ width: w, height: 820 });
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seedDb);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });

    for (const scr of SCREENS) {
      await page.locator(`.nav-item[data-scr="${scr}"]`).click();
      await expect(page.locator(`#scr-${scr}`)).toBeVisible();
      await page.waitForTimeout(150);

      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const bad = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          // 子要素を持たない＝自分が字を描いている物だけ見る
          if (el.children.length) continue;
          const t = (el.textContent || "").trim();
          // ★★2文字から 見る★★ 2026-09-05（Rakunally が 借りて 気づいた）
          //   ★前は 4文字以上しか 見ていなかった★
          //   ⇒ 設定／入金／入力／一覧／編集／請求 … ★画面の 札は 全部 2文字＝まるごと 外★
          //   ⇒ ★わざと 潰しても 赤に ならなかった★（向こうで 実証・こちらでも 確かめた）
          //   ★1文字は 見ない★＝×・✓ などの 印は 元から 細長い
          if (t.length < 2) continue;
          // ★1文字ずつ縦に割れている＝幅が1文字ぶんしかないのに背が高い★
          const fs = parseFloat(cs.fontSize) || 12;
          // ★★ちょうどは 割れに しない★★ 2026-09-05
          //   ★JS の 掛け算★ 12 × 1.6 ＝ 19.200000000000003
          //                     12 × 2.4 ＝ 28.799999999999997
          //   ⇒ ★幅 ちょうど 19.2 が「19.2 < 19.2000…3」で 割れ扱いに なる★
          //   ⇒ 見張りが 誤って 鳴る＝人が 見なくなる
          const YURUSHI = 1e-9;
          if (r.width < fs * 1.6 - YURUSHI && r.height > fs * 2.4 + YURUSHI) {
            bad.push({ t: t.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) });
          }
        }
        return { over: de.scrollWidth - de.clientWidth, bad };
      });

      expect(m.over, `★${scr}: 横に ${m.over}px はみ出している★`).toBeLessThanOrEqual(0);
      expect(m.bad, `★${scr}: 縦に割れている字がある: ${JSON.stringify(m.bad)}★`).toEqual([]);
    }

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
}
