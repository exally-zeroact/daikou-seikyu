import { test, expect } from "@playwright/test";

// ============================================================
// ★設定▸テンプレートの見本は「実際の紙」か★
//
//   ★2026-08-11★ 司さんの実機で ★5枚とも画像が壊れて「?」★（tpl_*.png が repo に0件＝404）
//   ★2026-08-18★ 司さん「他のアプリは実際の見せとんのに なんでこれだけ意味わからんやり方なんど」
//                「もともとちゃんと見せれとったろが」
//     直前は ★線だけの作り物（SVG）★ を描いていた＝紙の実物とは別物。選ぶ時に嘘になる。
//     ⇒ ★本物のPDFを作って1ページ目を縮めて描く★（tplThumbBox + paintTplThumbs）
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「設定」
//     2. 「テンプレート」タブ
//     3. 「線ひかえめ」 … 2枚とも ★実際の紙★ が描かれるか
//     4. 「枠と帯」     … 3枚とも ★実際の紙★ が描かれるか
//
//   見るのは「DOMに在る」ではなく ★描かれた絵の画素★（白紙・作り物では通らない）。
//   ★人に見せる字に 中の名前（エレガント/クラシック）と「未対応」が0件★も ここで見る。
// ============================================================

const CASES = [
  ["線ひかえめ", 2],
  ["枠と帯", 3],
];

// ★見本は「その人自身の明細」から作る★＝データが要る（0件の時の出方は別のテストで見る）
function seed() {
  const uid = "u_tpl";
  const co = "飛勝工業株式会社";
  const rows = [
    ["2026-08-06", "本社〜北浜〜曽根崎", 12000, "深夜"],
    ["2026-08-11", "南森町〜天満橋", 8600, ""],
    ["2026-08-18", "梅田〜十三〜塚本", 9400, "2名"],
  ].map((r, i) => ({
    id: "m" + i,
    user_id: uid,
    company: co,
    date: r[0],
    destination: r[1],
    amount: r[2],
    note: r[3],
    distance: null,
    people: null,
    name: "",
    extra: null,
    created_at: "2026-08-01T00:00:00.000Z",
    deleted_at: null,
  }));
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: rows,
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
            config: {
              issuer: "合同会社ZEROact\nZERO代行\n登録番号：T3500003003293",
              bank: "伊予銀行　今治支店　普通　4160657",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        payments: [],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

function seedEmpty() {
  const uid = "u_tpl0";
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

// 描かれた絵の中身を測る（真っ白＝描けていない／緑＝禁止色）
const INK = () =>
  [...document.querySelectorAll("#tplGallery .tpl-thumb-real canvas")].map((cv) => {
    const g = cv.getContext("2d");
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let ink = 0,
      green = 0,
      n = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const r = d[i],
        gg = d[i + 1],
        b = d[i + 2];
      n++;
      if (r < 235 || gg < 235 || b < 235) ink++;
      // 禁止色の系統（濃い緑）＝ 緑が突出して暗い画素
      if (gg > r + 18 && gg > b + 18 && gg < 170) green++;
    }
    return { w: cv.width, h: cv.height, inkRate: ink / n, greenRate: green / n };
  });

function otherThanCdn(list) {
  return list.filter((u) => !/cdn\.jsdelivr\.net/.test(u));
}

for (const [label, kazu] of CASES) {
  test(`設定▸テンプレート: ${label} の見本${kazu}枚が「実際の紙」で描かれる`, async ({ page }) => {
    const errors = [];
    const missing = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => {
      if (r.status() === 404) missing.push(r.url());
    });

    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort()); // ★外の配信が死んでいても見本は出る★
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });

    await page.locator('.nav-item[data-scr="settings"]').click();
    await page.getByRole("button", { name: "テンプレート" }).click();
    await page.locator("#designSeg").getByRole("button", { name: label }).click();

    // ★本物の紙が入るまで待つ（作るのに1枚0.5秒ほど）★
    await page.waitForFunction(
      (n) => document.querySelectorAll("#tplGallery .tpl-thumb-real canvas").length >= n,
      kazu,
      { timeout: 90000 }
    );

    const thumbs = page.locator("#tplGallery .tpl-thumb");
    await expect(thumbs, `${label} の見本の枚数`).toHaveCount(kazu);

    const inks = await page.evaluate(INK);
    expect(inks.length, `★実際の紙が描かれていない（canvasが${inks.length}枚）★`).toBe(kazu);
    for (const b of inks) {
      expect(b.w, `見本の幅が0（潰れている）: ${JSON.stringify(inks)}`).toBeGreaterThan(100);
      expect(b.h, `見本の高さが0（潰れている）: ${JSON.stringify(inks)}`).toBeGreaterThan(140);
      // ★真っ白＝紙が描けていない★（字と罫が入っていれば必ず数%は色が乗る）
      expect(b.inkRate, `★見本が真っ白（紙が描けていない）: ${JSON.stringify(b)}★`).toBeGreaterThan(
        0.01
      );
      // ★禁止色の濃い緑が出ていない★（紙は青／白黒）
      expect(b.greenRate, `★見本に緑が出ている: ${JSON.stringify(b)}★`).toBeLessThan(0.002);
    }

    // ★人に見せる字に 中の名前・謝りの注意書きが無い★
    const words = await page.evaluate(() => document.body.innerText);
    expect(words.includes("エレガント"), "★人に見せる字に「エレガント」が出ている★").toBe(false);
    expect(words.includes("クラシック"), "★人に見せる字に「クラシック」が出ている★").toBe(false);
    expect(words.includes("未対応"), "★「未対応です」と謝っている★").toBe(false);

    expect(otherThanCdn(missing), `★404が出た: ${missing.join(" / ")}★`).toEqual([]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
    console.log(
      `[template-thumbs] ${label} ${kazu}枚 / 絵の濃さ ${inks.map((b) => (b.inkRate * 100).toFixed(1) + "%").join(" ")}`
    );
  });
}

test("★明細が1件も無い時は 作り物を出さず 案内を出す★", async ({ page }) => {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seedEmpty);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="settings"]').click();
  await page.getByRole("button", { name: "テンプレート" }).click();
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => ({
    canvas: document.querySelectorAll("#tplGallery .tpl-thumb-real canvas").length,
    msg: [...document.querySelectorAll("#tplGallery .tpl-thumb-msg")].map((x) =>
      x.textContent.trim()
    ),
  }));
  expect(st.canvas, "★明細0件なのに紙が出ている（作り物を見せている）★").toBe(0);
  expect(st.msg.length, "★案内も紙も出ていない（空の枠だけ）★").toBeGreaterThan(1);
  for (const m of st.msg) expect(m, `案内の中身: ${m}`).toMatch(/明細を1件|見本を作/);
  console.log(
    `[template-thumbs] 明細0件のとき: canvas=${st.canvas} 案内=${JSON.stringify(st.msg)}`
  );
});
