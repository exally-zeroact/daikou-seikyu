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
              Object.assign(
                { carryover: opt.carry },
                opt.kuriSoto ? { taxMode: "外税" } : {},
                opt.design ? { pdfDesign: opt.design } : {}
              )
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
      opt.design || "std",
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

// ★紙の 上の 大きい「御請求金額（税込）」★ 2026-11-01（司さん「それでやれ」）
//   繰越を 使う 会社は 今回お支払額（相手が 実際に 払う 額）。使わない 会社・前回が 無い 月は その 月の 合計（今まで 通り）
//   前は 上が その 月の 12,000 で、下の「今回お支払額」24,200 と 2つの 額が 刷られた（上だけ 振り込まれる おそれ）
//   ★わざと壊して 赤（2026-11-01 手元 chromium 実測）★ meisai-engine.js ueNoGaku を return goukei に ⇒ 上の 3本が 赤
function ueNoGaku(t) {
  const i = t.findIndex((s) => /御請求金額|ご請求金額/.test(s));
  if (i < 0) return null;
  return t.slice(i + 1).find((s) => /[¥￥]/.test(s)) || null;
}
for (const design of ["elegant", "classic"]) {
  test(
    "★繰越を使う会社：上の 御請求金額 は 今回お支払額 24,200（" + design + "）★",
    async ({ page }) => {
      const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: true, design });
      const j = t.join(" / ");
      expect(ueNoGaku(t), "★上の 御請求金額 が 今回お支払額 で ない★\n" + j).toBe("¥24,200");
      expect(
        t.filter((x) => x === "¥24,200").length,
        "★上と 下の 今回お支払額 が 揃って いない★\n" + j
      ).toBeGreaterThanOrEqual(2);
    }
  );
}
test("★外税の繰越の会社：上の 御請求金額 も 今回お支払額 29,120★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: true, kuriSoto: true });
  expect(ueNoGaku(t), "★上が 今回お支払額 で ない★\n" + t.join(" / ")).toBe("¥29,120");
});
test("★繰越を使う会社でも 前回が無い月は 上は その月の 合計 37,200★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-05", { carry: true, copy: true });
  const j = t.join(" / ");
  expect(j, "前回が 無いのに 今回お支払額 が 出た").not.toContain("今回お支払額");
  expect(ueNoGaku(t), "★前回が 無い 月の 上が その 月の 合計 で ない★\n" + j).toBe("¥37,200");
});
test("★繰越を使わない会社：上の 御請求金額 は その月の 合計 12,000 のまま★", async ({ page }) => {
  const t = await kami(page, "繰越なし社", "2026-06", { carry: true, copy: true });
  expect(ueNoGaku(t), "★繰越を 使わない 会社の 上が 変わった★\n" + t.join(" / ")).toBe("¥12,000");
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

// ★プレビュー（画面の 紙）も 入金を 記録したら 上の 御請求金額 が 変わる★ 2026-11-02（本番前の 対立役 注A）
//   前は プレビューの 控えの 鍵（_issFp）に 繰越が 無く、明細が 同じなら 前に 描いた 紙を 使い回した
//   ＝入金の 画面で「全入金」を 押して 請求に 戻っても 上は ¥24,200 の まま（PDF を 作り直すと ¥0）。
//   ★画面の ボタンを 本当に 押す★（PAYMENTS を 直に 書かない）
// ★読む 紙は 選んだ 会社・月の 物だけ★（2回目の 対立役 注1 2026-11-02）
//   会社・月を 選ぶと 220ms 後に 作り直す（inv-loading は 付けない）＝画面に 入った 時の 全社の 紙を 読む 隙が 在った
//   ⇒ 控えの 鍵（sig）の 頭が「1|会社|月|」（全社は「0|月|」）に なるまで 待ち、鍵と 中身を 同じ 1回で 読む
async function preRead(page, head) {
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
  let got = null;
  await expect
    .poll(
      async () => {
        got = await page.evaluate(async (h) => {
          const c = _invCache;
          if (!c || !c.bytes || !String(c.sig || "").startsWith(h)) return null;
          const doc = await window.pdfjsLib.getDocument({ data: c.bytes.slice(0) }).promise;
          const out = [];
          for (let i = 1; i <= doc.numPages; i++) {
            const pg = await doc.getPage(i);
            out.push((await pg.getTextContent()).items.map((x) => x.str));
          }
          return out;
        }, head);
        return !!got;
      },
      { timeout: 120000, message: "★選んだ 会社・月の 紙が 控えに 来ない（" + head + "）★" }
    )
    .toBe(true);
  return got;
}
async function preUe(page, co, month) {
  const t = (await preRead(page, "1|" + co + "|" + month + "|"))[0];
  return { ue: ueNoGaku(t), j: t.join(" / ") };
}
test("★プレビュー：入金を 記録して 請求に 戻ると 上の 御請求金額 が 描き直される★", async ({
  page,
}) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-06");
  await page.selectOption("#invCompany", "繰越あり社");
  const mae = await preUe(page, "繰越あり社", "2026-06");
  expect(mae.ue, "★入金の 前の 上が 24,200 で ない★\n" + mae.j).toBe("¥24,200");

  // 入金の 画面で 6月の 行の「全入金」＝6月の 入金の 記録が 変わる（額は 下で 記録から 読む・手元 実測 17,000 ⇒ ¥12,200）
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();
  await page
    .locator(".pay-item")
    .filter({ hasText: "繰越あり社" })
    .filter({ hasText: "2026年6月" })
    .locator(".pay-full-btn")
    .click();
  await expect(page.locator(".toast-undo")).toContainText("全入金にしました");
  const paid = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.find(
        (p) => p.month === "2026-06" && p.company === "繰越あり社"
      ).paid
  );
  expect(paid, "★全入金で 6月の 記録が 変わって いない★").not.toBe(5000);
  // 上＝合計請求額 29,200 − 6月の 入金（記録）
  const mikomi = "¥" + (29200 - paid).toLocaleString("en-US");

  await page.locator('.nav-item[data-scr="billing"]').click();
  const ato = await preUe(page, "繰越あり社", "2026-06");
  expect(ato.ue, "★入金を 記録したのに プレビューの 上が 古い 額★\n" + ato.j).toBe(mikomi);
  expect(ato.j, "★プレビューの 下の 今回お支払額 と 揃って いない★").toContain(
    "今回お支払額 /   / " + mikomi
  );
});

// ★全社まとめの プレビューも 同じ★（対立役 注1 2026-11-02：全社の 鍵の 足しを 外すと 上の 1社の 試験は 緑の まま）
//   ★わざと壊して 赤★ 全社の 鍵（"0|" の sig）から 会社ごとの _carryFor を 外す ⇒ この 1本だけ 赤
async function preUeOf(page, co, month) {
  const pages = await preRead(page, "0|" + month + "|");
  const t = pages.find((p) => p.includes(co)) || [];
  return { ue: ueNoGaku(t), j: t.join(" / "), n: pages.length };
}
test("★プレビュー（全社まとめ）：入金を 記録して 戻ると 繰越の 会社の 上が 描き直される★", async ({
  page,
}) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-06");
  await page.selectOption("#invCompany", "");
  const mae = await preUeOf(page, "繰越あり社", "2026-06");
  expect(mae.n, "★全社まとめに 3社 の 紙が 無い★").toBeGreaterThanOrEqual(3);
  expect(mae.ue, "★入金の 前の 上が 24,200 で ない★\n" + mae.j).toBe("¥24,200");

  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();
  await page
    .locator(".pay-item")
    .filter({ hasText: "繰越あり社" })
    .filter({ hasText: "2026年6月" })
    .locator(".pay-full-btn")
    .click();
  await expect(page.locator(".toast-undo")).toContainText("全入金にしました");
  const paid = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.find(
        (p) => p.month === "2026-06" && p.company === "繰越あり社"
      ).paid
  );
  expect(paid).not.toBe(5000);
  const mikomi = "¥" + (29200 - paid).toLocaleString("en-US");

  await page.locator('.nav-item[data-scr="billing"]').click();
  await expect(page.locator("#invCompany")).toHaveValue("");
  const ato = await preUeOf(page, "繰越あり社", "2026-06");
  expect(ato.ue, "★全社まとめの プレビューの 上が 古い 額★\n" + ato.j).toBe(mikomi);
});

// ★内税／外税を 切り替えたら プレビューも 描き直す★（対立役 注2 2026-11-02：_coFp は taxMode を 見ない＝鍵の tx だけが 頼り）
//   ★設定の ボタンを 本当に 押す★（MASTER を 直に 書かない）
//   ★わざと壊して 赤★ _issFp の tx を 外す ⇒ この 1本だけ 赤（「内税」の まま）
test("★プレビュー：会社マスタで 内税→外税 を 押して 戻ると 外税の 紙に 描き直される★", async ({
  page,
}) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-06");
  await page.selectOption("#invCompany", "繰越なし社");
  const mae = await preUe(page, "繰越なし社", "2026-06");
  expect(mae.j, "★前は 内税 の 紙★").toContain("内税");
  expect(mae.ue).toBe("¥12,000");

  await page.locator('.nav-item[data-scr="settings"]').click();
  const card = page.locator(".master-co").filter({ hasText: "繰越なし社" });
  await card.locator(".master-co-hd").click();
  await card.getByRole("button", { name: "外税（金額は税抜）" }).click();

  await page.locator('.nav-item[data-scr="billing"]').click();
  await expect(page.locator("#invCompany")).toHaveValue("繰越なし社");
  const ato = await preUe(page, "繰越なし社", "2026-06");
  // 外税＝12,000 ＋ 1,200 ＝ 13,200
  expect(ato.ue, "★外税に したのに プレビューの 上が 古い 額★\n" + ato.j).toBe("¥13,200");
  expect(ato.j, "★外税に したのに プレビューが 内税 の まま★").toContain("外税");
});
