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

// 手で計算した例（2026-11-02 5項目＝司さん「それでやれ」）：
//   2026-05 に 37,200 請求／5月の 行に 20,000 入金
//   2026-06 は 12,000 請求／6月の 行に 5,000 入金（★6月の 紙には 載らない＝7月の 紙に 載る★）
//   6月の 紙：前回ご請求額 37,200・ご入金額 ▲20,000・繰越金額 17,200・今回ご請求額 17,200 + 12,000 = 29,200
//   （前の 形は 今回お支払額 24,200＝6月への 入金まで 引き、払い終えると ¥0 に なった）
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
            month: opt.kyuu ? "2026-06" : "2026-05", // kyuu＝前の 作りの 置き方（受け取った 月の 行）
            company: "繰越あり社",
            paid: opt.mayPaid || 20000,
            paid_date: opt.hiNashi ? null : "2026-06-20",
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
        ].filter((p) => !(opt.kyuu && p.id === "p2")), // kyuu は 6月の 行が p1 と ぶつかるので 外す
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
      opt.mayPaid ? "may" + opt.mayPaid : "may20000",
      opt.tag || "", // ★同じ 条件の 試験が 2本 在る 時の 区別（EBUSY・対立役 2026-11-02）★
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
  for (const w of ["前回ご請求額", "ご入金額", "繰越金額", "今回ご請求額"])
    expect(t, `「${w}」の見出しが無い\n` + j).toContain(w);
  expect(t, "★前回ご請求額が 37,200 でない★\n" + j).toContain("¥37,200");
  expect(t, "★ご入金額が ▲20,000 でない★\n" + j).toContain("▲¥20,000");
  expect(t, "★繰越金額が 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★今回ご請求額が 29,200 でない★\n" + j).toContain("¥29,200");
  // ★6月への 入金（5,000）は 6月の 紙に 載らない★（わざと壊す：当月の 入金を 引くと 24,200 が 出て 赤）
  expect(j, "★6月への 入金を 6月の 紙で 引いた★").not.toContain("24,200");
  expect(j, "★前の 形の 言葉が 残った★").not.toContain("今回お支払額");
});

test("★繰越を使わない会社：紙に繰越の言葉が1つも出ない★", async ({ page }) => {
  const t = await kami(page, "繰越なし社", "2026-06", { carry: true, copy: true });
  for (const w of ["前回ご請求額", "繰越金額", "今回ご請求額", "ご入金額"]) {
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
  expect(t, "★繰越金額が 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★今回ご請求額が 29,200 でない★\n" + j).toContain("¥29,200");
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
  //   ⇒ 前回ご請求額 37,200・繰越 = 37,200 − 20,000 = 17,200（古い 控えなら 30,000・10,000）
  const t = await kami(page, "繰越あり社", "2026-06", {
    carry: true,
    copy: true,
    copyTotal: 30000,
  });
  const j = t.join(" / ");
  expect(t, "★繰越金額が 今の 明細の 17,200 でない★\n" + j).toContain("¥17,200");
  expect(t, "★古い 控えの 額（10,000）で 刷られた★\n" + j).not.toContain("¥10,000");
  expect(t, "★前回ご請求額が 古い 控えの 30,000★\n" + j).not.toContain("¥30,000");
  expect(t, "★今回ご請求額が 29,200 でない★\n" + j).toContain("¥29,200");
});

test("★外税の繰越の会社：前回ご請求額も今の明細を外税で足した額★", async ({ page }) => {
  // 2026-05 明細 37,200 → 外税 37,200 + 3,720 = 40,920（前回ご請求額）・入金 20,000 ⇒ 繰越 20,920
  // 2026-06 明細 12,000 → 外税 13,200 ⇒ 今回ご請求額 34,120（6月への 入金 5,000 は 載らない）
  //   （控えの 額 37,200 なら 17,200／外税を 渡し忘れたら 17,200＝どちらも 赤）
  const t = await kami(page, "繰越あり社", "2026-06", {
    carry: true,
    copy: true,
    kuriSoto: true,
  });
  const j = t.join(" / ");
  expect(t, "★前回ご請求額が 40,920 でない★\n" + j).toContain("¥40,920");
  expect(t, "★繰越金額が 20,920 でない★\n" + j).toContain("¥20,920");
  expect(t, "★今回ご請求額が 34,120 でない★\n" + j).toContain("¥34,120");
});

// ★払い過ぎが 今月分より 大きい 時だけ 今回ご請求額が マイナス＝▲と 説明の 1行★ 2026-11-02
//   5月 37,200・5月の 行に 50,000 ⇒ 繰越 ▲12,800・6月 12,000 ⇒ 今回ご請求額 ▲800
for (const design of ["elegant", "classic"]) {
  test(
    "★払い過ぎ：▲¥800 と「次回のご請求から差し引きます」（" + design + "）★",
    async ({ page }) => {
      const t = await kami(page, "繰越あり社", "2026-06", {
        carry: true,
        copy: true,
        design,
        mayPaid: 50000,
      });
      const j = t.join(" / ");
      expect(t, "★繰越金額が ▲12,800 でない★\n" + j).toContain("▲¥12,800");
      expect(ueNoGaku(t), "★上が ▲800 でない★\n" + j).toBe("▲¥800");
      expect(
        t.filter((x) => x === "▲¥800").length,
        "★上と 下の 今回ご請求額 が 揃って いない★\n" + j
      ).toBeGreaterThanOrEqual(2);
      expect(j, "★▲の 説明が 無い★").toContain("▲の額は次回のご請求から差し引きます");
      expect(j, "★マイナスを ¥- で 刷った★").not.toContain("¥-");
    }
  );
}
// ★前の 作りの 置き方（5月分を 6月に 受け取り、6月の 行に 記録）でも 二重に 請求しない★ 2026-11-02
//   司さん「そんなことにならんようにしろ」＝入金は 入金日の 月で 数える（行で 数えると 6月の 紙が 49,200）
//   入金日が 空の 時は 記録を 作った 日（6/20）で 数える
for (const hiNashi of [false, true]) {
  test(
    "★受け取った 月の 行の 記録でも 6月の 紙は 29,200（入金日" +
      (hiNashi ? "なし" : "あり") +
      "）★",
    async ({ page }) => {
      const t = await kami(page, "繰越あり社", "2026-06", {
        carry: true,
        copy: true,
        kyuu: true,
        hiNashi,
        tag: "kyuu" + (hiNashi ? "-hinashi" : ""),
      });
      const j = t.join(" / ");
      expect(ueNoGaku(t), "★二重に 請求した★ " + j).toBe("¥29,200");
      expect(j, "★二重に 請求した★").not.toContain("49,200");
      expect(t).toContain("▲¥20,000");
    }
  );
}

test("★払い過ぎで ない 月は ▲の 説明を 刷らない★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-06", {
    carry: true,
    copy: true,
    tag: "sashihiki-nashi",
  });
  expect(t.join(" / ")).not.toContain("差し引きます");
});

// ★紙の 上の 大きい「御請求金額（税込）」★ 2026-11-01／11-02（司さん「それでやれ」）
//   繰越を 使う 会社は 今回ご請求額（繰越＋今月分）。使わない 会社・前回が 無い 月は その 月の 合計（今まで 通り）
//   ★わざと壊して 赤★ meisai-engine.js ueNoGaku を return goukei に ⇒ 上の 3本が 赤（12,000／13,200 が 出る）
function ueNoGaku(t) {
  const i = t.findIndex((s) => /御請求金額|ご請求金額/.test(s));
  if (i < 0) return null;
  return t.slice(i + 1).find((s) => /[¥￥]/.test(s)) || null;
}
for (const design of ["elegant", "classic"]) {
  test(
    "★繰越を使う会社：上の 御請求金額 は 今回ご請求額 29,200（" + design + "）★",
    async ({ page }) => {
      const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: true, design });
      const j = t.join(" / ");
      expect(ueNoGaku(t), "★上の 御請求金額 が 今回ご請求額 で ない★\n" + j).toBe("¥29,200");
      expect(
        t.filter((x) => x === "¥29,200").length,
        "★上と 下の 今回ご請求額 が 揃って いない★\n" + j
      ).toBeGreaterThanOrEqual(2);
    }
  );
}
test("★外税の繰越の会社：上の 御請求金額 も 今回ご請求額 34,120★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-06", { carry: true, copy: true, kuriSoto: true });
  expect(ueNoGaku(t), "★上が 今回ご請求額 で ない★\n" + t.join(" / ")).toBe("¥34,120");
});
test("★繰越を使う会社でも 前回が無い月は 上は その月の 合計 37,200★", async ({ page }) => {
  const t = await kami(page, "繰越あり社", "2026-05", { carry: true, copy: true });
  const j = t.join(" / ");
  expect(j, "前回が 無いのに 今回ご請求額 が 出た").not.toContain("今回ご請求額");
  expect(j, "★前回が 無いのに「前回の請求はありません」が 無い★").toContain(
    "前回の請求はありません"
  );
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
  expect(mae.ue, "★入金の 前の 上が 29,200 で ない★\n" + mae.j).toBe("¥29,200");

  // ① 6月の 行の「全入金」＝6月の 請求書を 払い終えた ⇒ ★6月の 紙は 1円も 変わらない★（2026-11-02 司さん）
  //    全入金は 6月の 紙の 今回ご請求額 29,200 まで 記録する（前は 当てた 後の 足りない 額）
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();
  // ★押す 前に ボタンに 記録する 額が 出て、知らせにも 同じ 額が 出る★
  //   （行の「残」と 違う 額を 黙って 記録しない・対立役 止1 2026-11-02）
  const zennyukin = async (tsuki, gaku) => {
    const btn = page
      .locator(".pay-item")
      .filter({ hasText: "繰越あり社" })
      .filter({ hasText: tsuki })
      .locator(".pay-full-btn");
    await expect(btn, "★全入金の ボタンに 記録する 額が 無い★").toContainText("記録 " + gaku);
    await btn.click();
    await expect(page.locator(".toast-undo")).toContainText("全入金にしました");
    await expect(page.locator(".toast-undo"), "★知らせに 記録した 額が 無い★").toContainText(
      "記録 " + gaku
    );
  };
  const kiroku = (m) =>
    page.evaluate(
      (mm) =>
        JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.find(
          (p) => p.month === mm && p.company === "繰越あり社"
        ).paid,
      m
    );
  // ① 5月の 請求書の 残りが 6月の 中に 入った（窓で 入金日 6/10・37,200）＝★6月の 紙の 繰越が 0 に なり 上は 12,000★
  //    ★わざと壊して 赤★ プレビューの 控えの 鍵（_issFp の cy）から 繰越を 外す ⇒ 古い ¥29,200 の まま
  //    （行の「全入金」は 今日の 日付で 記録する＝6月の 紙には 効かない。ボタンの 額だけ 見る）
  await expect(
    page
      .locator(".pay-item")
      .filter({ hasText: "繰越あり社" })
      .filter({ hasText: "2026年5月" })
      .locator(".pay-full-btn"),
    "★全入金の ボタンに 記録する 額が 無い★"
  ).toContainText("記録 ¥32,200"); // 手で 計算：5月の 記録 20,000 ＋（5月までの 請求 37,200 − 記録 全部 25,000）
  await madoKiroku(page, "2026年5月", 37200, "2026-06-10");
  expect(await kiroku("2026-05")).toBe(37200);
  await page.locator('.nav-item[data-scr="billing"]').click();
  const ato = await preUe(page, "繰越あり社", "2026-06");
  expect(ato.ue, "★前の 月の 入金を 記録したのに プレビューの 上が 古い 額★\n" + ato.j).toBe(
    "¥12,000"
  );
  expect(ato.j, "★下の 今回ご請求額 と 揃って いない★").toContain("今回ご請求額 /   / ¥12,000");

  // ② 6月の 行の「全入金」＝6月の 請求書を 払い終えた ⇒ ★6月の 紙は 1円も 変わらない★（2026-11-02 司さん）
  //    全入金は 6月の 紙の 今回ご請求額（12,000）まで 記録する
  await page.locator('.nav-item[data-scr="payment"]').click();
  await zennyukin("2026年6月", "¥12,000");
  expect(await kiroku("2026-06"), "★6月の 全入金が 紙の 今回ご請求額 で ない★").toBe(12000);
  await page.locator('.nav-item[data-scr="billing"]').click();
  const harai = await preUe(page, "繰越あり社", "2026-06");
  expect(harai.ue, "★払い終えたら 6月の 紙の 上が 変わった★\n" + harai.j).toBe("¥12,000");
  expect(harai.j, "★紙が 変わった★").toBe(ato.j);
});

// ★入金の 窓で 額と 入金日を 入れて 保存する（行を 押す＝窓・画面の ボタンを 本当に 押す）★
async function madoKiroku(page, tsuki, gaku, hi) {
  await page
    .locator(".pay-item")
    .filter({ hasText: "繰越あり社" })
    .filter({ hasText: tsuki })
    .click();
  await expect(page.locator("#pay_amt")).toBeVisible();
  await page.fill("#pay_amt", String(gaku));
  await page.fill("#pay_date", hi);
  await page.locator("#modalBody").getByRole("button", { name: "保存" }).click();
  await expect(page.locator(".toast").last()).toContainText("入金を記録しました");
}

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
  expect(mae.ue, "★入金の 前の 上が 29,200 で ない★\n" + mae.j).toBe("¥29,200");

  // 5月の 請求書の 残りが 6月の 中に 入った（窓で 入金日 6/10・37,200）⇒ 6月の 繰越 0・上は 12,000
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();
  await madoKiroku(page, "2026年5月", 37200, "2026-06-10");
  const paid = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.find(
        (p) => p.month === "2026-05" && p.company === "繰越あり社"
      ).paid
  );
  expect(paid).toBe(37200);

  await page.locator('.nav-item[data-scr="billing"]').click();
  await expect(page.locator("#invCompany")).toHaveValue("");
  const ato = await preUeOf(page, "繰越あり社", "2026-06");
  expect(ato.ue, "★全社まとめの プレビューの 上が 古い 額★\n" + ato.j).toBe("¥12,000");
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

// ★編集タブの プレビューも 描く 月の 繰越★ 2026-11-02（本番前の 対立役 注B）
//   編集タブは 自分の 月（_editMonth＝データの 在る 一番 新しい 月）で 描くのに、
//   繰越だけ 請求タブの #invMonth の 月で 数えていた（issuerForEngine(onlyCo) に 月が 無い）
//   ＝請求タブで 5月を 選んでから 編集タブを 開くと、6月の 紙に 5月の 繰越（前回なし）が 載った
//   ★わざと壊して 赤★ daikou-seikyu.html の issuerForEngine(onlyCo, month) から month を 外す ⇒ この 1本が 赤
test("★編集タブの プレビュー：請求タブで 別の 月を 選んでいても 6月の 紙は 上 29,200★", async ({
  page,
}) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { carry: true, copy: true });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", "繰越あり社");
  const go = await preUe(page, "繰越あり社", "2026-05");
  expect(go.ue, "★5月の 紙の 上が 37,200 で ない★\n" + go.j).toBe("¥37,200");
  await page.locator('.nav-item[data-scr="edit"]').click();
  await expect(page.locator("#scr-edit")).toBeVisible();
  await expect(page.locator("#editCompany")).toHaveValue("繰越あり社");
  const ed = await preUe(page, "繰越あり社", "2026-06");
  expect(ed.ue, "★編集タブの 6月の 紙が #invMonth（5月）の 繰越で 描かれた★\n" + ed.j).toBe(
    "¥29,200"
  );
  expect(ed.j, "★前回ご請求額 37,200 が 無い★").toContain("¥37,200");
  expect(ed.j, "★ご入金額 ▲20,000 が 無い★").toContain("▲¥20,000");
});

// ★本物の 発行も 描く 月の 繰越★ 2026-11-02（設計前の 対立役 注1）
//   「印刷 / 送る」は 月を 1回 読んだ 後、倉庫に 番号を 取りに 行く 間 待つ。ボタンは 押せなく なるが #invMonth は 触れる。
//   待つ 間に 月を 変えると、紙は 明細も 番号も 元の 月なのに 繰越だけ 変えた 後の 月で 刷られた
//   （issuerForEngine(onlyCo) が #invMonth を もう一度 読む）＝客に 渡す 紙の 額が 黙って 変わる
//   ★直す前に 赤を 見た★ 1社＝上 ¥12,000・「前回の請求はありません」で 刷られた
//   ★わざと壊して 赤★ 1社＝7347 の issuerForEngine(onlyCo, month)・全社＝7376 の issuerForEngine(co, month) から month を 外す
for (const k of [
  { co: "繰越あり社", na: "1社" },
  { co: "", na: "全社" },
]) {
  test(`★発行（${k.na}）：番号を 取りに 行く 間に 月を 変えても 6月の 紙は 上 29,200★`, async ({
    page,
  }) => {
    fs.mkdirSync(OUT, { recursive: true });
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(() => {
      window.open = () => null;
    });
    await page.addInitScript(seed, { carry: true, copy: true });
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
    await page.locator('.nav-item[data-scr="billing"]').click();
    await page.selectOption("#invMonth", "2026-06");
    await page.selectOption("#invCompany", k.co);
    await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 120000 });
    // 番号の 台帳への ★最初の 1回の★ 書き込みだけ 止める（離すまで 返さない）。2回目から（全社の 残りの 会社）は 素通し
    //   （輪で 止まる 度に 離す 形は、月を 変えた 描き直しで 待ちが 延びると 抜けて 揺れる＝対立役 注1）
    await page.evaluate(() => {
      const orig = window.SB.from.bind(window.SB);
      let kai = 0;
      window.SB.from = (t) => {
        const q = orig(t);
        if (t === "invoice_no") {
          const oi = q.insert.bind(q);
          q.insert = (...a) => {
            if (kai++ > 0) return oi(...a);
            return new Promise((res) => {
              window.__tomete = true;
              window.__hanasu = () => res(oi(...a));
            });
          };
        }
        return q;
      };
    });
    const dl = page.waitForEvent("download", { timeout: 120000 });
    await page.getByRole("button", { name: /印刷 \/ 送る/ }).click();
    await page.waitForFunction(() => window.__tomete === true, null, { timeout: 30000 });
    await page.selectOption("#invMonth", "2026-05"); // ★待つ 間に 月を 変える★
    await page.evaluate(() => window.__hanasu());
    const f = path.join(OUT, "hakko_tsuki_kae_" + (k.co ? "1sha" : "zensha") + ".pdf");
    await (await dl).saveAs(f);
    const bytes = Array.from(fs.readFileSync(f));
    const t = await page.evaluate(async (arr) => {
      const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(arr) }).promise;
      const out = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i);
        out.push(...(await pg.getTextContent()).items.map((x) => x.str));
      }
      return out;
    }, bytes);
    const j = t.join(" / ");
    expect(t, "★前回ご請求額 37,200 が 無い＝5月の 繰越で 刷られた★\n" + j).toContain("¥37,200");
    expect(t, "★ご入金額 ▲20,000 が 無い★\n" + j).toContain("▲¥20,000");
    expect(t, "★上の 額 29,200 が 無い★\n" + j).toContain("¥29,200");
    expect(j, "★6月の 紙に「前回の請求はありません」＝5月の 繰越★").not.toContain(
      "前回の請求はありません"
    );
  });
}
