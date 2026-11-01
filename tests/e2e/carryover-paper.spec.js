import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// ============================================================
// ★繰越を選んだ会社の紙／選んでいない会社の紙★ 2026-08-12
//
//   ★合格条件（指示役）★
//     ・★繰越を使わない会社の紙が1文字も変わらない★（既定は「使わない」）
//     ・★手計算した値を必ず埋める★（一致だけの試験にしない）
//     ・前回が無い＝「前回の請求はありません」／入金が読めない＝「入金は未確認」（0円と書かない）
//     ・★外税の会社の紙を実際に出して「外税」と刷られる事★（UIが無いまま出来ていると数えない）
//
//   ★押す物の一覧（先に書く）★
//     1. 下のナビ「請求」 2. 月 3. 会社 4.「📄 印刷 / 送る」
// ============================================================

test.setTimeout(180000);

const OUT = path.join("test-results", "carry");
const UID = "u_carry";

// 手で計算した例：
//   2026-05 に 37,200 請求（控えあり）／20,000 入金 → 残り 17,200
//   2026-06 は 12,000 請求 ／ 入金 5,000
//     合計請求額 = 12,000 + 17,200 = 29,200
//     今回お支払額 = 29,200 − 5,000 = 24,200
function seed(opt) {
  const uid = "u_carry";
  const mk = (id, co, date, amount) => ({
    id,
    user_id: uid,
    company: co,
    date,
    destination: "現場",
    amount,
    note: "",
    distance: null,
    people: 1,
    name: "",
    extra: null,
    created_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  });
  const conf = (extra) =>
    Object.assign({ widths: {}, aligns: {}, lead: "", tableTitle: "", noteSummary: false }, extra);
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [
          mk("m1", "繰越あり社", "2026-05-06", 37200),
          mk("m2", "繰越あり社", "2026-06-06", 12000),
          mk("m3", "繰越なし社", "2026-06-06", 12000),
          mk("m4", "外税社", "2026-06-06", 10000),
        ],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: "繰越あり社",
            items: ["日付", "行き先", "金額"],
            config: conf(
              Object.assign({ carryover: opt.carry }, opt.kuriSoto ? { taxMode: "外税" } : {})
            ),
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "c2",
            user_id: uid,
            name: "繰越なし社",
            items: ["日付", "行き先", "金額"],
            config: conf({}),
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "c3",
            user_id: uid,
            name: "外税社",
            items: ["日付", "行き先", "金額"],
            config: conf({ taxMode: "外税" }),
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [
          {
            user_id: uid,
            config: {
              issuer:
                "合同会社ZEROact\nZERO代行\n〒100-0000\n東京都架空区見本台1-2-3\nTEL000-0000-0000\n登録番号：T9000000000009",
              bank: "見本銀行",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        // ★2026-05 の控え（渡した紙）と 入金★
        invoices: opt.copy
          ? [
              {
                id: "i1",
                user_id: uid,
                month: "2026-05",
                company: "繰越あり社",
                invoice_no: "2026-05-01",
                issued_at: "2026-06-01T00:00:00.000Z",
                total: opt.copyTotal || 37200,
                tax: 3382,
                rows_json: [],
                issuer_json: {},
                design_json: {},
                carry_json: null,
                deleted_at: null,
              },
            ]
          : [],
        invoice_no: [],
        payments: [
          {
            id: "p1",
            user_id: uid,
            month: "2026-05",
            company: "繰越あり社",
            paid: 20000,
            paid_date: "2026-06-20",
            memo: "",
            created_at: "2026-06-20T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "p2",
            user_id: uid,
            month: "2026-06",
            company: "繰越あり社",
            paid: 5000,
            paid_date: "2026-07-20",
            memo: "",
            created_at: "2026-07-20T00:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

async function kami(page, co, month, opt) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  // ★「印刷 / 送る」は PC だと 新しい 窓で 開く★ 2026-10-29＝PDF の 中身を 見る 為 窓を 止めた 形（保存に 落ちる）で 回す
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.addInitScript(seed, opt);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", month);
  await page.selectOption("#invCompany", co);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
  // ★名前に条件を全部入れる★（並列で走るので、同じ名前だと EBUSY で1本だけ落ちる＝実際に踏んだ）
  const f = path.join(
    OUT,
    [
      co,
      month,
      opt.carry ? "carry-on" : "carry-off",
      opt.copy ? "copy" + (opt.copyTotal || "") : "nocopy",
      opt.kuriSoto ? "soto" : "uchi",
    ].join("_") + ".pdf"
  );
  await (await dl).saveAs(f);
  const bytes = Array.from(fs.readFileSync(f));
  return await page.evaluate(async (arr) => {
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
    const pg = await doc.getPage(1);
    return (await pg.getTextContent()).items.map((i) => i.str);
  }, bytes);
}

test("★繰越を使う会社：手で計算した値が紙に出る★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: true });
  const j = t.join(" / ");
  expect(t, "前回繰越額の見出しが無い\n" + j).toContain("前回繰越額");
  expect(t, "★前回繰越が 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★合計請求額が 29,200 でない★\n" + j).toContain("¥29,200");
  expect(t, "★今回お支払額が 24,200 でない★\n" + j).toContain("¥24,200");
});

test("★繰越を使わない会社：紙に繰越の言葉が1つも出ない★", async ({ page }) => {
  const t = await kami(page, "繰越なし社", "2026-06", { carry: true, copy: true });
  for (const w of ["前回繰越額", "合計請求額", "今回お支払額", "ご入金額"]) {
    expect(t.join(" / "), `★繰越を選んでいないのに「${w}」が出ている★`).not.toContain(w);
  }
});

test("★控えの無い月（全社まとめで作った月など）も、繰越は今の明細で出る・「読めません」と刷らない★", async ({
  page,
}) => {
  // 2026-11-01 夜 司さん「基本PDFだけやろが」「読めませんってふざけすぎとるやろが」
  //   控え（invoices）を 入れない＝前は「前回の請求額が読めません」と 刷り 繰越が 出なかった
  //   ★わざと壊して 赤に なるのを 見る★：直す 前（a4100d1）では この 試験が 赤
  const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: false });
  const j = t.join(" / ");
  expect(j, "★「読めません」と 刷った★").not.toContain("読めません");
  expect(t, "★前回繰越が 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★合計請求額が 29,200 でない★\n" + j).toContain("¥29,200");
  expect(t, "★今回お支払額が 24,200 でない★\n" + j).toContain("¥24,200");
});

// ★前の 月を 直したら 次の 紙の 繰越に そのまま 入る★ 2026-11-01
//   司さん「修正したら反映されるんが普通やろが」「入力したら反映されるんが当たり前やないか」
//   前は 最後に PDF を 作った 時の 控えの total を 使った＝直しても 古い 額が 刷られた。
//   ★わざと壊して 赤に なるのを 見る★：直す 前（e51c762）では 下の 2本が 赤
//     （控え 30,000 なら 前回繰越 10,000／外税の 会社は 控え 37,200 のまま 17,200）
test("★控えが古い額（PDF を作った後に前の月の明細を直した）でも、繰越は今の明細で出る★", async ({
  page,
}) => {
  // 2026-05 の 控えは 30,000（作った 時）・今の 明細は 37,200（後で 足した）・入金 20,000
  //   ⇒ 前回繰越 = 37,200 − 20,000 = 17,200（古い 控えなら 10,000）
  const t = await kami(page, "繰越あり社", "2026-06", {
    carry: true,
    copy: true,
    copyTotal: 30000,
  });
  const j = t.join(" / ");
  expect(t, "★前回繰越が 今の 明細の 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★古い 控えの 額（10,000）で 刷られた★\n" + j).not.toContain("¥10,000");
  expect(t, "★合計請求額が 29,200 でない★\n" + j).toContain("¥29,200");
  expect(t, "★今回お支払額が 24,200 でない★\n" + j).toContain("¥24,200");
});

test("★外税の繰越の会社：前回請求額も今の明細を外税で足した額★", async ({ page }) => {
  // 2026-05 明細 37,200 → 外税 37,200 + 3,720 = 40,920・入金 20,000 ⇒ 前回繰越 20,920
  // 2026-06 明細 12,000 → 外税 13,200 ⇒ 合計請求額 34,120・今回お支払額 34,120 − 5,000 = 29,120
  //   （控えの 額 37,200 なら 17,200／外税を 渡し忘れたら 17,200＝どちらも 赤）
  const t = await kami(page, "繰越あり社", "2026-06", {
    carry: true,
    copy: true,
    kuriSoto: true,
  });
  const j = t.join(" / ");
  expect(t, "★前回繰越が 20,920 でない★\n" + j).toContain("¥20,920");
  expect(t, "★合計請求額が 34,120 でない★\n" + j).toContain("¥34,120");
  expect(t, "★今回お支払額が 29,120 でない★\n" + j).toContain("¥29,120");
});

test("★外税の会社：紙に「外税」と刷られる★", async ({ page }) => {
  const t = await kami(page, "外税社", "2026-06", { carry: false, copy: false });
  const j = t.join(" / ");
  expect(
    t.some((x) => x.includes("外税")),
    "★外税を選んだのに 内税と刷られている★\n" + j
  ).toBe(true);
  // 外税＝10,000 に 1,000 を足して 11,000
  expect(t, "★外税の合計が違う★\n" + j).toContain("¥11,000");
});

// ★Excelの繰越は測らない★
//   Excelの「請求書（見た目つき）」は 2026-07-21 に廃止（司さん「できんのなら請求書の書き出しはやめろ」）。
//   Excelは編集用データだけなので、繰越の欄そのものが無い。紙(PDF)で測る。

test("★紙の中で 見出しと金額が重ならない★", async ({ page }) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  // ★「印刷 / 送る」は PC だと 新しい 窓で 開く★ 2026-10-29＝PDF の 中身を 見る 為 窓を 止めた 形（保存に 落ちる）で 回す
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-06");
  await page.selectOption("#invCompany", "繰越あり社");
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
  const f = path.join(OUT, "kasanari.pdf");
  await (await dl).saveAs(f);

  // ★文字の置き場所と幅を取り、同じ行で重なっていないか数える★
  const items = await page.evaluate(
    async (arr) => {
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
      const pg = await doc.getPage(1);
      const c = await pg.getTextContent();
      return c.items.map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    },
    Array.from(fs.readFileSync(f))
  );

  // ★同じ文字どうしは見ない★
  //   太字は「同じ文字を0.02ptずつずらして3回 重ね書き」して作っている（疑似ボールド）。
  //   それを重なりとして数えると ★必ず赤になる見張り＝誰も見なくなる★（実際に踏んだ）。
  const kasanari = [];
  for (const a of items) {
    for (const b of items) {
      if (a === b) continue;
      if (a.s.trim() === b.s.trim()) continue; // 疑似ボールドの重ね書き
      if (!a.s.trim() || !b.s.trim()) continue; // 空白だけの物
      if (Math.abs(a.y - b.y) > 2) continue; // 同じ行だけ
      if (a.x < b.x && a.x + a.w > b.x + 0.5) kasanari.push(`「${a.s}」と「${b.s}」`);
    }
  }
  expect(kasanari, "★紙の中で文字が重なっている:\n  " + kasanari.join("\n  ")).toEqual([]);
});
