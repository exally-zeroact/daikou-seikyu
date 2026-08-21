import { test, expect } from "@playwright/test";

// ============================================================
// ★紙(PDF)の明細の 日付は「右」に揃える★（指示役 2026-08-18）
//   「画面と紙で違うのは駄目」＝同じ物を2か所で別々に決めない。
//
//   ★直す前★ invoice-pdf.js colAlign の既定 … 金額=右 / ★日付=中央★ / 他=左
//              画面（一覧・集計）は 2026-08-18 に 数字・日付=右 に揃えた ⇒ 紙だけ中央で残っていた。
//
//   ★測り方★ ソースを読むのではなく ★実際に刷った紙の字の位置★ で測る。
//     右に揃っていれば ★字の右端が全部そろう★（左端は日付の桁でバラつく）。
//     中央だと 右端がバラつき 中心がそろう。両方を数えて判定する。
// ============================================================

test.setTimeout(240000);

const CO = "飛勝工業株式会社";
// 桁の違う日付を混ぜる（8/6 と 8/11 と 8/18）＝右揃えと中央揃えの差が必ず出る
const ROWS = [
  ["2026-08-06", "本社〜北浜〜曽根崎", 12000],
  ["2026-08-11", "南森町〜天満橋", 8600],
  ["2026-08-18", "梅田〜十三〜塚本", 9400],
];

function seed(rows, co) {
  const uid = "u_pdate";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: rows.map((r, i) => ({
          id: "m" + i,
          user_id: uid,
          company: co,
          date: r[0],
          destination: r[1],
          amount: r[2],
          note: "",
          distance: null,
          people: null,
          name: "",
          extra: null,
          created_at: "2026-08-01T00:00:00.000Z",
          deleted_at: null,
        })),
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

const MEASURE = async (design) => {
  const rows = window.DB.filter((r) => r.account_id === window.CURRENT_ACCOUNT);
  const iss = Object.assign({}, window.issuerForEngine(rows[0].会社名), { pdfDesign: design });
  const bytes = await window.InvoicePDF.buildOne(
    window.MASTER,
    rows[0].会社名,
    rows,
    "2026-08",
    iss,
    "TEST-1"
  );
  const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const pg = await doc.getPage(1);
  const c = await pg.getTextContent();
  return c.items
    .filter((i) => /^\d{1,2}\/\d{1,2}$/.test(i.str.trim()))
    .map((i) => ({
      s: i.str.trim(),
      left: Math.round(i.transform[4] * 100) / 100,
      right: Math.round((i.transform[4] + i.width) * 100) / 100,
      w: Math.round(i.width * 100) / 100,
    }));
};

const spread = (a) => Math.max(...a) - Math.min(...a);

for (const design of ["elegant", "classic"])
  test(`★刷った紙の日付が右にそろう（${design === "elegant" ? "線ひかえめ" : "枠と帯"}）★`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed, ROWS, CO);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });

    const d = await page.evaluate(MEASURE, design);
    expect(d.length, "★紙の中に日付を1つも見ていない（0件の緑は未検査）★").toBe(ROWS.length);

    const rights = d.map((x) => x.right);
    const lefts = d.map((x) => x.left);
    const centers = d.map((x) => (x.left + x.right) / 2);
    const widths = d.map((x) => x.w);

    expect(
      spread(widths),
      "★日付の字幅が全部同じ＝右と中央の差が出ない並びで測っている★"
    ).toBeGreaterThan(0.5);
    expect(spread(rights), "★日付が右にそろっていない：" + JSON.stringify(d) + "★").toBeLessThan(
      0.6
    );
    expect(
      spread(centers),
      "★中央にそろっている（＝右揃えになっていない）：" + JSON.stringify(d) + "★"
    ).toBeGreaterThan(0.5);
    expect(spread(lefts), "★左端まで同じ＝字幅が同じ疑い★").toBeGreaterThan(0.5);

    console.log(
      `[paper-date-right] ${design} 日付${d.length}個 右端のばらつき${spread(rights).toFixed(2)}pt / 中心のばらつき${spread(centers).toFixed(2)}pt`
    );
  });
