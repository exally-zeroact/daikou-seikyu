import { test, expect } from "@playwright/test";

// ============================================================
// ★行き先は「開始 〜 経由 〜 最終」で出す★（司さん 2026-08-15 実機 → 指示役 2026-08-18）
//   「今は 開始地点しか出ていない」
//
//   ★どこで作っているか（実測 2026-08-18）★
//     行き先の本文を作る正本 ＝ ダイコメ側
//       Daikou-app-test/supabase/functions/dk-sync-jobs/meisai-row.js の routeText()
//       （出発〜経由〜到着／地元の市は落とす／取れていない所はとばす）2026-08-09
//     ★代行請求(この器)には 経由地の列が無い★ ＝ ここで経路を組み立て直さない。
//     ここは「受け取った文字を出す所」を ★1本(MeisaiEngine.utils.routeTextOf)★ にして、
//     ★一覧・紙(PDF)・Excel が同じ物を呼ぶ★ ことを見張る。
//
//   ★1つだけ合流させる★
//     2026-08-05版の同期は destination に到着地だけを入れ、出発地は extra.dk_from に置いた。
//     その行は「〜」を持たないので ★出発〜到着★ にして出す（過去の行が読めるようになる）。
//
//   ★見るのは3通り★ 経由あり / 経由なし(出発は extra) / 経由が多い(1行に入らない)
// ============================================================

test.setTimeout(240000);

const CO = "飛勝工業株式会社";
// [id, 日付, destination, extra.dk_from, 期待する「出す文字」]
const CASES = [
  ["r1", "2026-08-06", "松本〜蔵敷〜祇園", null, "松本〜蔵敷〜祇園"], // 経由あり
  ["r2", "2026-08-11", "今治市喜田村", "今治市松本町", "今治市松本町〜今治市喜田村"], // 経由なし＝出発を合流
  [
    "r3",
    "2026-08-18",
    // ★経由が多い（どの幅でも1行に入らない長さ）★
    //   2026-08-21：一覧から日付の列が消えて 行き先の箱が広くなったので、
    //   前の長さ（7地点）は 幅412だと全部入るようになった＝「…」の検査ができなくなっていた。
    "UNIQLO〜松本〜郷本町〜辻堂〜喜田村〜東予〜桜井〜大西〜菊間〜波方〜今治港〜常盤町",
    null,
    "UNIQLO〜松本〜郷本町〜辻堂〜喜田村〜東予〜桜井〜大西〜菊間〜波方〜今治港〜常盤町",
  ], // 経由が多い
  ["r4", "2026-08-19", "喜田村", "喜田村", "喜田村"], // 出発と到着が同じ＝重ねない
];

function seed(cases, co) {
  const uid = "u_route";
  const rows = cases.map((c, i) => ({
    id: c[0],
    user_id: uid,
    company: co,
    date: c[1],
    destination: c[2],
    amount: 1000 * (i + 1),
    note: "",
    distance: null,
    people: null,
    name: "",
    extra: c[3] ? { dk_from: c[3], dk_source: "daikome" } : null,
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

async function boot(page, W) {
  await page.setViewportSize({ width: W, height: 900 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, CASES, CO);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
}

for (const W of [375, 390, 412])
  test(`★一覧の行き先が 開始〜経由〜最終・幅${W}★`, async ({ page }) => {
    await boot(page, W);
    await page.locator('.nav-item[data-scr="list"]').click();
    await page.waitForTimeout(700);

    const got = await page.evaluate(() => {
      const cv = document.createElement("canvas");
      const ctx = cv.getContext("2d");
      return [...document.querySelectorAll(".li-dest")].map((el) => {
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
        const t = (el.textContent || "").trim();
        return {
          t,
          box: Math.round(b.width),
          text: Math.round(ctx.measureText(t).width),
          ellipsis: s.textOverflow,
          nowrap: s.whiteSpace,
        };
      });
    });
    expect(got.length, "★一覧の行き先を1つも見ていない★").toBe(CASES.length);

    const want = CASES.map((c) => c[4]).sort();
    expect(
      got.map((g) => g.t).sort(),
      "★一覧の行き先が 決めた形と違う★\n  出た物: " + got.map((g) => g.t).join(" / ")
    ).toEqual(want);

    // ★1行に入らない時は 末尾を「…」で切る（「ほか◯件」にしない）★
    const long = got.filter((g) => g.text > g.box);
    expect(
      long.length,
      "★長い行き先を1つも見ていない（切れ方を検査できていない）★"
    ).toBeGreaterThan(0);
    for (const g of long) {
      expect(g.ellipsis, `★長い行き先が「…」で切られていない: ${g.t}★`).toBe("ellipsis");
      expect(g.nowrap, `★折り返してしまう: ${g.t}★`).toBe("nowrap");
    }
    console.log(
      `[route-text] w=${W} ` + got.map((g) => `「${g.t}」箱${g.box}/字${g.text}`).join(" ")
    );
  });

test("★一覧・紙(PDF)・Excel が 同じ行き先を出す（同じ物を2か所で作らない）★", async ({ page }) => {
  await boot(page, 390);

  // ① 一覧
  await page.locator('.nav-item[data-scr="list"]').click();
  await page.waitForTimeout(700);
  const list = await page.evaluate(() =>
    [...document.querySelectorAll(".li-dest")].map((e) => e.textContent.trim())
  );

  // ② Excel（明細シート）＝実物の関数をそのまま呼ぶ
  const excel = await page.evaluate(() => {
    const aoa = window._exlMeisaiAoa();
    const head = aoa[0];
    const ci = head.indexOf("行き先");
    return aoa.slice(1, -1).map((r) => String(r[ci]));
  });

  // ③ 紙(PDF)＝実際に刷る関数で作って、出た紙の字を読む
  const paper = await page.evaluate(async () => {
    const rows = window.DB.filter((r) => r.account_id === window.CURRENT_ACCOUNT);
    const bytes = await window.InvoicePDF.buildOne(
      window.MASTER,
      rows[0].会社名,
      rows,
      "2026-08",
      window.issuerForEngine(rows[0].会社名),
      "TEST-1"
    );
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const pg = await doc.getPage(1);
    const c = await pg.getTextContent();
    return c.items.map((i) => i.str);
  });

  const want = CASES.map((c) => c[4]);
  expect(list.sort(), "★一覧★").toEqual(want.slice().sort());
  expect(excel.sort(), "★Excel（明細シート）★").toEqual(want.slice().sort());
  for (const w of want) {
    // 紙は列幅で末尾を詰める事がある＝先頭から一致していれば同じ物
    const head = w.slice(0, 6);
    expect(
      paper.some((s) => s.indexOf(head) === 0),
      `★紙に出ていない行き先: ${w}★\n紙の字: ${paper.join(" | ").slice(0, 500)}`
    ).toBe(true);
  }
  console.log(
    `[route-text] 一覧${list.length}件 / Excel${excel.length}件 / 紙の字${paper.length}個`
  );
});
