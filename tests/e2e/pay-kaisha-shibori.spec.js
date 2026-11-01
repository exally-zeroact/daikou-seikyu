import { test, expect } from "@playwright/test";
// ============================================================
// ★入金の 画面に 会社の 絞り（#payCompany）★ 2026-11-01 司さん
//   「選択を 消して 会社の プルダウンを 足し、期間・状態・会社を 綺麗に 横1列に」
//
//   見る物（設計前 taiketsu の 答え）
//   1. 会社で 絞っても 繰越の 当て方が 変わらない（seikyuList の 返りに 掛ける）
//      ＝繰越の 会社の 5月は 絞っても 入金済
//   2. 並びは 請求書の 会社（#invCompany）と 同じ（マスタ順＝名前順と 逆に して 見分ける）
//   3. 会社で 絞った 時「（全期間 N件）」の N は 全社の 数＝「全社・全期間」と 書く
//   4. 390・360・320px で 3つが 1列・はみ出さない。月と 状態の 字は 切れない。
//      会社の 字（株式会社 等を 外した 短い 字）は 390px で 切れない。
//      字の 幅は 同じ 字体の span で 測る（overflow:hidden の select は scrollWidth が 当てに ならない）。
//      360px は 余りが 4px しか 無い＝CI の Linux の 字体で 揺れる ので 会社の 字は 見ない。
//
//   ★押す物の一覧（先に書く）★ 1. 下のナビ「入金」 2. #payCompany 3. #payStatus 4. #payMonth
// ============================================================
const KURI = "繰越工業株式会社";
const FUTSU = "普通商事株式会社";
test.setTimeout(120000);

function seed() {
  const uid = "u_kuri";
  const m = (id, co, date, amount) => ({
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
  const co = (id, name, carryover) => ({
    id,
    user_id: uid,
    name,
    items: ["日付", "行き先", "金額"],
    config: carryover ? { carryover: true } : {},
    created_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  });
  const pay = (id, month, company, paid) => ({
    id,
    user_id: uid,
    month,
    company,
    paid,
    paid_date: month + "-28",
    memo: "",
  });
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [
          m("a1", "繰越工業株式会社", "2026-05-10", 10000),
          m("a2", "繰越工業株式会社", "2026-06-10", 10000),
          m("b1", "普通商事株式会社", "2026-05-10", 10000),
          m("b2", "普通商事株式会社", "2026-06-10", 10000),
          m("b3", "普通商事株式会社", "2026-10-10", 10000),
        ],
        // マスタ順＝普通→繰越
        companies: [co("c2", "普通商事株式会社", false), co("c1", "繰越工業株式会社", true)],
        issuer: [
          {
            user_id: uid,
            config: { issuer: "合同会社ZEROact", bank: "見本銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        // 繰越の 会社が 6月に 20,000 まとめて 入金
        payments: [pay("p1", "2026-06", "繰越工業株式会社", 20000)],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

async function hiraku(page) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#scr-payment")).toBeVisible();
}

test("★会社で 絞る＝繰越の 当て方は 変わらない・並びは 請求書と 同じ・全社の 数と 書く★", async ({
  page,
}) => {
  await hiraku(page);
  const opts = await page.$$eval("#payCompany option", (os) => os.map((o) => o.value));
  // #invCompany は 請求の 画面を 開くまで 作られない＝同じ 関数の 返りと 比べる
  const inv = await page.evaluate(() =>
    [""].concat(InvoicePDF.billableCompanies(MASTER, DB, CURRENT_ACCOUNT))
  );
  expect(opts, "★会社の 並びが 請求書（#invCompany と 同じ 関数）と 違う★").toEqual(inv);
  expect(opts).toEqual(["", FUTSU, KURI]);
  // ★見せる 字は 会社の 種類（株式会社）を 外す・value は 元の 名前（taiketsu 注1）★
  const ji = await page.$$eval("#payCompany option", (os) => os.map((o) => o.textContent));
  expect(ji, "★狭い 画面で 見分けられる 短い 字に なっていない★").toEqual([
    "全社",
    "普通商事",
    "繰越工業",
  ]);
  // 外すと 同じ 字に なる 2社（株式会社A／A株式会社）は 元の 名前の まま
  const onaji = await page.evaluate(() => {
    const sel = document.getElementById("payCompany");
    const MAE = Object.assign({}, MASTER);
    MASTER["株式会社見本"] = { account_id: CURRENT_ACCOUNT };
    MASTER["見本株式会社"] = { account_id: CURRENT_ACCOUNT };
    MASTER["（株）ひとつ"] = { account_id: CURRENT_ACCOUNT };
    MASTER["㈱ふたつ"] = { account_id: CURRENT_ACCOUNT };
    MASTER["みっつ㈲"] = { account_id: CURRENT_ACCOUNT };
    MASTER["株式会社全社"] = { account_id: CURRENT_ACCOUNT };
    MASTER["ABC株式会社東京支店"] = { account_id: CURRENT_ACCOUNT };
    refreshPayCompanySelect([]);
    const out = Array.from(sel.options).map((o) => [o.value, o.textContent]);
    Object.keys(MASTER).forEach((k) => delete MASTER[k]);
    Object.assign(MASTER, MAE);
    refreshPayCompanySelect([]);
    return out;
  });
  expect(onaji).toContainEqual(["株式会社見本", "株式会社見本"]);
  expect(onaji).toContainEqual(["見本株式会社", "見本株式会社"]);
  expect(onaji).toContainEqual(["（株）ひとつ", "ひとつ"]);
  expect(onaji).toContainEqual(["㈱ふたつ", "ふたつ"]);
  expect(onaji).toContainEqual(["みっつ㈲", "みっつ"]);
  expect(onaji, "★先頭の「全社」と 同じ 字に した★").toContainEqual([
    "株式会社全社",
    "株式会社全社",
  ]);
  expect(onaji, "★途中の 種類まで 外した★").toContainEqual([
    "ABC株式会社東京支店",
    "ABC株式会社東京支店",
  ]);

  await page.selectOption("#payCompany", KURI);
  const rows = page.locator("#payBody .pay-item");
  await expect(rows).toHaveCount(2);
  await expect(page.locator("#payBody")).not.toContainText(FUTSU);
  await expect(
    rows.filter({ hasText: "5月" }),
    "★会社で 絞ったら 繰越の 5月が 入金済で なくなった★"
  ).toContainText("入金済");
  await expect(page.locator("#payCount")).toContainText("絞り込み中");

  // 普通商事 10月＝未入金 1件 見える・全社全期間の 未入金＝普通 3件（繰越は 全部 入金済）
  await page.selectOption("#payCompany", FUTSU);
  await page.selectOption("#payMonth", "2026-10");
  await expect(rows).toHaveCount(1);
  const line = (await page.locator("#payCount").textContent()).trim();
  console.log(`[pay-kaisha] ${line}`);
  expect(line, "★会社で 絞った 時に 全社の 数を「全期間」とだけ 書いている★").toContain(
    "全社・全期間 3件"
  );

  // 全社へ 戻すと 前の 字（全期間 N件）に 戻る
  await page.selectOption("#payCompany", "");
  const line2 = (await page.locator("#payCount").textContent()).trim();
  expect(line2).not.toContain("全社・");
  expect(line2).toContain("全期間 3件");
});

for (const w of [390, 360, 320]) {
  test(`★${w}px で 期間・状態・会社が 横1列・字が 切れない★`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await hiraku(page);
    await page.selectOption("#payMonth", "2026-10");
    await page.selectOption("#payStatus", "partial");
    await page.selectOption("#payCompany", KURI);
    const m = await page.evaluate(() =>
      ["payMonth", "payStatus", "payCompany"].map((id) => {
        const e = document.getElementById(id);
        const r = e.getBoundingClientRect();
        // ★描く 字の 幅は 同じ 字体の span で 測る★（overflow:hidden の select は
        //   scrollWidth が 枠の 幅しか 返さない＝空回りする・2026-11-01 実測 320px で 60＝60）
        const cs = getComputedStyle(e);
        const sp = document.createElement("span");
        sp.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" + cs.font;
        sp.textContent = e.options[e.selectedIndex].textContent;
        document.body.appendChild(sp);
        const ji = sp.getBoundingClientRect().width;
        sp.remove();
        const naka = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return {
          id,
          top: Math.round(r.top),
          right: Math.round(r.right),
          sw: Math.ceil(ji),
          cw: Math.floor(naka),
        };
      })
    );
    console.log(`[pay-kaisha ${w}px]`, JSON.stringify(m));
    expect(new Set(m.map((x) => x.top)).size, "★3つが 1列に 並んでいない★").toBe(1);
    for (const x of m) {
      expect(x.right, `★${x.id} が 画面から はみ出す★`).toBeLessThanOrEqual(w);
    }
    // 月の 字（2026年10月）・状態（一部入金）は 切れない
    for (const x of m.slice(0, 2)) {
      expect(x.sw, `★${x.id} の 字が 切れる★`).toBeLessThanOrEqual(x.cw);
    }
    // ★会社（繰越工業＝短くした 4字）の 描いた 字が 切れない★＝390px（中 98・字 64＝余り 大）
    //   CSS の 値では なく span で 測った 字の 幅で 見る（taiketsu 注2）。
    //   360px（余り 4px）・320px は 字体で 揺れる／入らない ので 1列・はみ出さない だけ。
    if (w >= 390) expect(m[2].sw, "★会社の 字が 切れる★").toBeLessThanOrEqual(m[2].cw);
  });
}
