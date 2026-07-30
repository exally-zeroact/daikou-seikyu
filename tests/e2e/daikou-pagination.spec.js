import { test, expect } from "@playwright/test";

// ★2026-07-30 実バグの実ブラウザ回帰: 代行請求で 1000件超の明細が"黙って"欠落していた。
//   偽クラウド(fake-supabase.js)は本物と同じ「1リクエスト最大1000行」を再現するので、
//   1,080件を仕込んで開き、画面が実際に全件を読み込むことを実ブラウザで固定する。
//   旧コード（.select("*")だけ）だと window.DB は 1000 で止まり、このテストは赤くなる。

const TOTAL = 1080; // 司さんの実データ規模

function seedDb() {
  const uid = "u_daiko_page_test";
  const total = 1080;
  const meisai = [];
  for (let i = 0; i < total; i++) {
    // 5月に集中させ、飛勝工業と別会社に散らす（"最近だけ落ちる"のではない事も兼ねて）
    meisai.push({
      id: "m" + i,
      user_id: uid,
      company: i % 3 === 0 ? "飛勝工業株式会社" : "協同組合友愛会",
      date: "2026-05-" + String((i % 28) + 1).padStart(2, "0"),
      destination: "現場" + i,
      amount: 1000 + i,
      note: "",
      distance: null,
      people: 1,
      name: "",
      extra: null,
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
  }
  const db = {
    users: { "daiko@example.com": { id: uid, email: "daiko@example.com", password: "himitsu123" } },
    session: { user: { id: uid, email: "daiko@example.com" } },
    tables: {
      meisai,
      companies: [
        {
          id: "c1",
          user_id: uid,
          name: "飛勝工業株式会社",
          items: [],
          config: {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        },
        {
          id: "c2",
          user_id: uid,
          name: "協同組合友愛会",
          items: [],
          config: {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
    },
  };
  localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
}

test("代行請求: 1,080件（1000超）を1件も落とさず全部読み込む", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());

  // 偽クラウド → その中に 1,080件を仕込む（どちらもページ読み込み前に走る）
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seedDb);

  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });

  // ログイン済みセッションで起動 → 入力画面が出る（＝loadAllCloud 完了）
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 15000 });

  // メモリ上の明細は 1000 で止まらず 1,080 全部
  const loaded = await page.evaluate(() => window.DB.length);
  expect(loaded, "1000件で頭打ち＝ページングが効いていない").toBe(TOTAL);

  // 飛勝工業の分（i%3===0）も全部そろっている
  const hikatsu = await page.evaluate(
    () => window.DB.filter((r) => r["会社名"] === "飛勝工業株式会社").length
  );
  expect(hikatsu).toBe(Math.floor((TOTAL + 2) / 3)); // i=0,3,...,1079 → 360件

  expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
});
