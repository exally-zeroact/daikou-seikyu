import { test, expect } from "@playwright/test";
// ============================================================
// 出した 請求書と 今の 明細の 額が 違う 時は 入金の 画面で 知らせる 2026-10-14
//
//   司さん「編集したらちゃんと反映」（出した 月の 明細も 直したら 変える）＋指示役「渡した 紙と 額が 変わる 事を 黙らない」
//   計算（請求額・入金・繰越）は 変えない。字を 出す だけ。
//   比べる 額は「出した 時の 明細の 行」を 今の 足し方（invoiceTotals）に 通した 物
//   （外税の 古い 写しは total が 税抜＝total と 比べると 嘘の「違う」が 出る・対立役）
//
//   ★わざと壊して 赤に なるのを 見た（2026-10-14 実測）★
//     知らせを 入れる 前の 版 ⇒ 赤（字が 出ない）
// ============================================================
test.setTimeout(120000);
const CO = "差の試し株式会社";

function seed() {
  return (arg) => {
    const uid = "u_sa";
    const co = "差の試し株式会社";
    const meisai = (id, date, amount) => ({
      id,
      user_id: uid,
      company: co,
      date,
      destination: "本社〜北浜",
      amount,
      note: "",
      distance: null,
      people: 1,
      name: "",
      extra: null,
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
    // 読み直しの 試験は 種を 撒き直さない（画面が 書いた 物を 読み直す）
    if (arg.nokosu && localStorage.getItem("__fake_supa_db__")) return;
    const co2 = "繰越の試し株式会社";
    const rowsJson = (amts) =>
      amts.map((a, k) => ({ 日付: "2026-05-0" + (k + 6), 行き先: "本社〜北浜", 金額: a }));
    localStorage.setItem(
      "__fake_supa_db__",
      JSON.stringify({
        users: { "s@x.com": { id: uid, email: "s@x.com", password: "himitsu123" } },
        session: { user: { id: uid, email: "s@x.com" } },
        tables: {
          meisai: arg.ima
            .map((a, k) => meisai("m" + k, "2026-05-0" + (k + 6), a))
            .concat(
              arg.kuri
                ? arg.ima.map((a, k) => ({
                    ...meisai("k" + k, "2026-05-0" + (k + 6), a),
                    company: co2,
                  }))
                : []
            ),
          companies: [
            {
              id: "c1",
              user_id: uid,
              name: co,
              items: ["日付", "行き先", "金額"],
              config: arg.tm ? { taxMode: arg.tm } : {},
              created_at: "2026-05-01T00:00:00.000Z",
              deleted_at: null,
            },
          ].concat(
            arg.kuri
              ? [
                  {
                    id: "c2",
                    user_id: uid,
                    name: co2,
                    items: ["日付", "行き先", "金額"],
                    config: { carryover: true },
                    created_at: "2026-05-01T00:00:00.000Z",
                    deleted_at: null,
                  },
                ]
              : []
          ),
          issuer: [
            {
              user_id: uid,
              config: {
                issuer: "合同会社ZEROact\nZERO代行\n登録番号：T1234567890123",
                bank: "見本銀行",
                showInvoiceNo: true,
              },
              updated_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          payments: [],
          invoices: arg.dashita
            ? [
                {
                  id: "i1",
                  user_id: uid,
                  month: "2026-05",
                  company: arg.kyuuMei || co,
                  invoice_no: "2026-05-01",
                  total: arg.total,
                  tax: 0,
                  rows_json: rowsJson(arg.dashita),
                  issued_at: arg.issued || "2026-06-01T00:00:00.000Z",
                  deleted_at: null,
                },
              ].concat(
                arg.kuri
                  ? [
                      {
                        id: "i2",
                        user_id: uid,
                        month: "2026-05",
                        company: co2,
                        invoice_no: "2026-05-02",
                        total: arg.total,
                        tax: 0,
                        rows_json: rowsJson(arg.dashita),
                        issued_at: "2026-06-01T00:00:00.000Z",
                        deleted_at: null,
                      },
                    ]
                  : []
              )
            : [],
          invoice_no: arg.bangou
            ? [
                {
                  user_id: uid,
                  month: "2026-05",
                  company: co,
                  invoice_no: "2026-05-01",
                  decided_at: "2026-06-01T00:00:00.000Z",
                },
              ]
            : [],
        },
      })
    );
  };
}

async function hiraku(page, arg) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed(), arg);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  const gyou = page.locator("#payBody .pay-row, #payBody > div").filter({ hasText: CO }).first();
  await expect(gyou).toBeVisible({ timeout: 20000 });
  return gyou;
}

test("出した 後に 明細が 増えた＝入金の 一覧と 窓に 差を 出す（額は 今の 明細のまま）", async ({
  page,
}) => {
  const gyou = await hiraku(page, { ima: [12000, 4000], dashita: [12000, 3400], total: 15400 });
  await expect(gyou).toContainText("出した時 ¥15,400 → 今 ¥16,000（+¥600）");
  await expect(gyou).toContainText("先方に渡した請求書と額が違います");
  await expect(gyou).toContainText("¥16,000"); // 請求額は 今の 明細（変えていない）
  await gyou.click();
  await expect(page.locator("#modalBody .pay-sagaku")).toContainText(
    "出した時 ¥15,400 → 今 ¥16,000"
  );
});

test("明細が 同じ＝何も 出さない", async ({ page }) => {
  const gyou = await hiraku(page, { ima: [12000, 3400], dashita: [12000, 3400], total: 15400 });
  await expect(gyou.locator(".pay-sagaku")).toHaveCount(0);
});

test("外税の 古い 写し（total が 税抜）でも 明細が 同じなら 何も 出さない", async ({ page }) => {
  const gyou = await hiraku(page, {
    tm: "外税",
    ima: [12000, 3400],
    dashita: [12000, 3400],
    total: 15400, // 古い 形＝税抜（今の 足し方なら 16,940）
  });
  await expect(gyou.locator(".pay-sagaku")).toHaveCount(0);
});

test("番号だけ 決まって 出した 時の 明細が 無い 月＝窓で「比べられません」", async ({ page }) => {
  const gyou = await hiraku(page, { ima: [12000, 3400], bangou: true });
  await expect(gyou.locator(".pay-sagaku")).toHaveCount(0);
  await gyou.click();
  await expect(page.locator("#modalBody")).toContainText("比べられません");
});

test("同じ 画面で 出し直した 直後は 新しい 額と 比べる（嘘の「違う」を 出さない）", async ({
  page,
}) => {
  const gyou = await hiraku(page, { ima: [12000, 4000], dashita: [12000, 3400], total: 15400 });
  await expect(gyou).toContainText("出した時 ¥15,400");
  await page.evaluate(async (co) => {
    const rows = DB.filter((r) => r.会社名 === co);
    await saveInvoiceCopy("2026-05", co, rows, issuerForEngine(co, "2026-05"), "2026-05-01");
    renderPayments();
  }, CO);
  await expect(
    page
      .locator("#payBody .pay-row, #payBody > div")
      .filter({ hasText: CO })
      .first()
      .locator(".pay-sagaku")
  ).toHaveCount(0);
});

// ── 本番前の 対立役（09c3103）の 指摘への 試験 ──
//   ★わざと壊して 赤に なるのを 見た★：直す 前の 版（09c3103）で 下の 4本とも 赤
test("内税で 出してから 外税へ 切り替えた（10-02 夜 より 後に 出した 物）＝知らせる", async ({
  page,
}) => {
  const gyou = await hiraku(page, {
    tm: "外税",
    ima: [12000, 3400],
    dashita: [12000, 3400],
    total: 15400, // 出した 時は 内税＝合計 15,400
    issued: "2026-10-05T03:00:00.000Z",
  });
  await expect(gyou).toContainText("出した時 ¥15,400 → 今 ¥16,940（+¥1,540）");
});

test("額が 減った＝マイナスの 符号・日付は 日本時間（朝 9時 前に 出した 物が 前の 日に ならない）", async ({
  page,
}) => {
  const gyou = await hiraku(page, {
    ima: [12000, 2800],
    dashita: [12000, 3400],
    total: 15400,
    issued: "2026-06-13T23:30:00.000Z", // 日本時間 6/14 8:30
  });
  await expect(gyou).toContainText("6/14 に出した後");
  await expect(gyou).toContainText("出した時 ¥15,400 → 今 ¥14,800（−¥600）");
});

test("出した 時の 明細を 読めなかった＝読めなかったと 出す（「残っていない」と 言わない）", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const t = setInterval(() => {
      const SBx = window.__EXALLY_FAKE_SB__;
      if (!SBx || SBx.__waza) return;
      SBx.__waza = true;
      const moto = SBx.from.bind(SBx);
      SBx.from = function (tbl) {
        const q = moto(tbl);
        if (tbl !== "invoices") return q;
        const sel = q.select.bind(q);
        q.select = function (cols, o) {
          if (String(cols).indexOf("rows_json") >= 0) {
            const bad = {
              order: () => bad,
              range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
            };
            return bad;
          }
          return sel(cols, o);
        };
        return q;
      };
      clearInterval(t);
    }, 0);
  });
  const gyou = await hiraku(page, { ima: [12000, 4000], dashita: [12000, 3400], total: 15400 });
  await gyou.click();
  await expect(page.locator("#modalBody")).toContainText("明細を読めませんでした");
  await expect(page.locator("#modalBody")).not.toContainText("残っていない");
});

test("会社名を 付け替えた 会社＝「残っていない」と 嘘を 言わず 見つからない 訳を 出す", async ({
  page,
}) => {
  const gyou = await hiraku(page, {
    ima: [12000, 4000],
    dashita: [12000, 3400],
    total: 15400,
    bangou: true,
    kyuuMei: "差の試し株式会社（旧名）",
  });
  await gyou.click();
  await expect(page.locator("#modalBody")).toContainText("会社名を変えた月など");
  await expect(page.locator("#modalBody")).not.toContainText("残っていない");
});

// ── 本番前の 対立役（997e69b）の 指摘への 試験 ──
test("全社まとめの PDF で 出し直した＝出した 明細が 残り 嘘の「違う」を 出さない", async ({
  page,
}) => {
  const gyou = await hiraku(page, { ima: [12000, 4000], dashita: [12000, 3400], total: 15400 });
  await expect(gyou).toContainText("出した時 ¥15,400");
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", "");
  const kazu = await page.evaluate(async () => {
    const r = await _buildInvoiceBytes();
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return {
      ok: !!(r && r.bytes),
      toast: document.getElementById("toast").textContent,
      invoices: db.tables.invoices.length,
      fname: r && r.fname,
    };
  });
  expect(kazu.ok, JSON.stringify(kazu)).toBe(true);
  expect(kazu.fname).toContain("全社");
  expect(kazu.invoices, "全社まとめで 出した 明細が 残っていない").toBe(2);
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(
    page
      .locator("#payBody .pay-row, #payBody > div")
      .filter({ hasText: CO })
      .first()
      .locator(".pay-sagaku")
  ).toHaveCount(0);
});

test("時刻の 書き方が 違っても 正しく 比べる（+09:00 の 10-02 20時＝税込で 残る 前）", async ({
  page,
}) => {
  const gyou = await hiraku(page, {
    tm: "外税",
    ima: [12000, 3400],
    dashita: [12000, 3400],
    total: 15400, // 税抜で 残った 古い 写し（UTC では 11:00＝境の 13:47 より 前）
    issued: "2026-10-02T20:00:00+09:00",
  });
  await expect(gyou.locator(".pay-sagaku")).toHaveCount(0);
});

// ── 本番前の 対立役（75e664a）の 指摘への 試験 ──
const KURI = "繰越の試し株式会社";
async function zenshaDasu(page) {
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", "");
  const r = await page.evaluate(async () => {
    const x = await _buildInvoiceBytes();
    if (x) nokosenaiShiraseru(x);
    return {
      ok: !!(x && x.bytes),
      nokosenai: x && x.nokosenai,
      toast: document.getElementById("toast").textContent,
    };
  });
  await page.locator('.nav-item[data-scr="payment"]').click();
  return r;
}
const gyouOf = (page, co) =>
  page.locator("#payBody .pay-row, #payBody > div").filter({ hasText: co }).first();

test("全社まとめ・繰越の 会社が 混ざる 2社＝2社とも 知らせが 消え、繰越の 材料は 前の 写しの まま", async ({
  page,
}) => {
  await hiraku(page, {
    ima: [12000, 4000],
    dashita: [12000, 3400],
    total: 15400,
    kuri: true,
    nokosu: true,
  });
  await expect(gyouOf(page, KURI)).toContainText("出した時 ¥15,400");
  const r = await zenshaDasu(page);
  expect(r.ok).toBe(true);
  expect(r.nokosenai).toEqual([]);
  await expect(gyouOf(page, CO).locator(".pay-sagaku")).toHaveCount(0);
  await expect(gyouOf(page, KURI).locator(".pay-sagaku")).toHaveCount(0);
  // 読み直した 後も 同じ・繰越の 材料（INVOICES）は 全社の 写しを 読まない＝前の 1件ずつ
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(gyouOf(page, KURI)).toBeVisible({ timeout: 20000 });
  await expect(gyouOf(page, KURI).locator(".pay-sagaku")).toHaveCount(0);
  const kazu = await page.evaluate(() => ({
    zaiRyo: INVOICES.map((x) => x.company + ":" + x.total).sort(),
    kaita: JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.invoices.length,
  }));
  expect(kazu.kaita, "全社の 写しが 1回で 2社分 残っていない").toBe(4);
  expect(kazu.zaiRyo, "繰越の 材料に 全社の 写しが 入った").toEqual([
    CO + ":15400",
    KURI + ":15400",
  ]);
});

test("全社まとめで 明細を 残せなかった＝長い 知らせ・入金の 画面は「額が 違います」と 嘘を 言わない（読み直しても）", async ({
  page,
}) => {
  await hiraku(page, { ima: [12000, 4000], dashita: [12000, 3400], total: 15400, nokosu: true });
  await page.evaluate(() => {
    window.__FAKE_FAIL_WRITES__ = ["invoices"];
  });
  const r = await zenshaDasu(page);
  expect(r.ok, "PDF は 出る").toBe(true);
  expect(r.nokosenai).toEqual([CO]);
  expect(r.toast).toContain("出した時の明細を残せませんでした");
  await expect(gyouOf(page, CO)).toContainText("明細を残せませんでした");
  await expect(gyouOf(page, CO)).not.toContainText("額が違います");
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(gyouOf(page, CO)).toContainText("明細を残せませんでした", { timeout: 20000 });
  await expect(gyouOf(page, CO)).not.toContainText("額が違います");
});
