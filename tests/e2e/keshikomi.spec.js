import { test, expect } from "@playwright/test";
// ============================================================
// ★★入金の 消し込み（銀行の 明細 CSV → 候補 → 人が 押す）★★ 2026-11-03
//   司さんの決め（11-03）：★人が「記録する」を 押した 行だけ 記録★・手数料は 決め打ちしない（1〜1,100円の 差）
//     会社ごとに 先方持ち（既定＝差は 未入金で 残る）／こちら持ち（差を 振込手数料として 消す）
//   対立役（設計前 4回）の 止め を 1本ずつ：
//     v1 止3／v2 止1 … 同じ 明細を 2回 読んでも 二重に 書かない／別の 端末が 別の 月へ 書いたら 止まる
//     v3 止1 … 入金日の 無い 古い 行が 在っても 止まらない（created_at を 読む）
//     v4 注2 … この 画面で「全入金」を 押した 直後でも 止まらない（uid の 無い 控え）
//     v2 注2 … 取り消しは 横から 書かれたら 戻さない（相手の 入金を 消さない）
//   手で 計算した 値：山田建設（先方持ち）9月 10,000・10月 20,000（内税）
// ============================================================
test.setTimeout(120000);
const UID = "u_ks";

function seed(arg) {
  const uid = "u_ks";
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
    created_at: "2026-09-01T00:00:00.000Z",
    deleted_at: null,
  });
  const co = (id, name, cfg) => ({
    id,
    user_id: uid,
    name,
    items: ["日付", "行き先", "金額"],
    config: Object.assign(
      { widths: {}, aligns: {}, lead: "", tableTitle: "", noteSummary: false },
      cfg || {}
    ),
    created_at: "2026-09-01T00:00:00.000Z",
    deleted_at: null,
  });
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [
          mk("m1", "山田建設", "2026-09-05", 10000),
          mk("m2", "山田建設", "2026-10-05", 20000),
          mk("m3", "鈴木商事", "2026-10-06", 55000),
          mk("m4", "繰越社", "2026-09-07", 10000),
          mk("m5", "繰越社", "2026-10-07", 20000),
        ].concat((arg.extraMeisai || []).map((x) => mk(x[0], x[1], x[2], x[3]))),
        companies: [
          co("c1", "山田建設", { furikomiMeigi: ["ﾔﾏﾀﾞｹﾝｾﾂ"] }),
          co("c2", "鈴木商事", { furikomiMeigi: ["ｽｽﾞｷｼｮｳｼﾞ"], tesuryoFutan: "kochira" }),
          co("c3", "繰越社", { furikomiMeigi: ["ｸﾘｺｼｼﾔ"], carryover: true }),
        ].concat((arg.extraCo || []).map((x) => co(x[0], x[1], x[2]))),
        issuer: [
          {
            user_id: uid,
            config: { issuer: "合同会社ZEROact\nZERO代行", bank: "見本銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [],
        payments: arg.pays || [],
      },
    })
  );
}

async function hiraku(page, pays, extra) {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, Object.assign({ pays: pays || [] }, extra || {}));
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
}
async function csvYomu(page, text) {
  await page.locator("#ksOpenBtn").click();
  await page.setInputFiles("#ksFile", {
    name: "meisai.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text, "utf8"),
  });
  await expect(page.locator("#ksKazu")).toBeVisible();
}
const pays = (page) =>
  page.evaluate(
    (uid) =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.filter(
        (p) => p.user_id === uid
      ),
    UID
  );
const CSV =
  "日付,摘要,お引出金額,お預り金額,残高\n" +
  "2026/11/02,ﾌﾘｺﾐ ｶ)ﾔﾏﾀﾞｹﾝｾﾂ,,20000,1\n" +
  "2026/11/03,ﾌﾘｺﾐ ｽｽﾞｷｼｮｳｼﾞ(ｶ,,54340,2\n" +
  "2026/11/03,ATM,5000,,3\n";
const gyou = (page, i) => page.locator('.ks-gyou[data-i="' + i + '"]');

test("★押した行だけ記録する（候補を出しても書かない）・回に出どころが残る★", async ({ page }) => {
  await hiraku(page);
  await csvYomu(page, CSV);
  await expect(page.locator("#ksKazu")).toContainText("入金 2件");
  await expect(page.locator("#ksKazu")).toContainText("出金・入金の欄が空 1行");
  await expect(gyou(page, 0)).toContainText("山田建設");
  await expect(gyou(page, 0)).toContainText("ぴったり");
  // 読んだだけ＝何も 書かない
  expect(await pays(page)).toEqual([]);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toContainText("2026年10月の行");
  const p = await pays(page);
  expect(p.length).toBe(1);
  expect(p[0]).toMatchObject({
    month: "2026-10",
    company: "山田建設",
    paid: 20000,
    paid_date: "2026-11-02",
  });
  expect(p[0].entries).toEqual([
    { gaku: 20000, hi: "2026-11-02", src: "csv:2026-11-02:20000:ヤマダケンセツ" },
  ]);
});

test("★同じ明細を2回読む＝記録済み（押すボタンを出さない）★", async ({ page }) => {
  await hiraku(page);
  await csvYomu(page, CSV);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  await page.locator("#ksFile").setInputFiles({
    name: "meisai2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });
  await expect(gyou(page, 0).locator(".ks-zumi").first()).toContainText("記録済みです");
  await expect(gyou(page, 0).locator(".ks-oshi")).toHaveCount(0);
  expect((await pays(page)).length).toBe(1);
});

test("★こちら持ち＝差 ¥660 を振込手数料として消して閉じる・Excel は内訳を分ける★", async ({
  page,
}) => {
  await hiraku(page);
  await csvYomu(page, CSV);
  await expect(gyou(page, 1)).toContainText("差 ¥660（振込手数料かも）");
  await expect(gyou(page, 1)).toContainText("振込手数料（当方負担）として消して");
  await gyou(page, 1).locator(".ks-oshi").first().click();
  await expect(gyou(page, 1).locator(".ks-kaita")).toBeVisible();
  const p = (await pays(page)).find((x) => x.company === "鈴木商事");
  expect(p).toMatchObject({ month: "2026-10", paid: 55000 });
  expect(p.entries).toEqual([
    { gaku: 55000, hi: "2026-11-03", src: "csv:2026-11-03:54340:スズキシヨウジ", tesuryo: 660 },
  ]);
  const aoa = await page.evaluate(() => window._exlPayAoa(window.summarize("").rows));
  expect(aoa[0]).toEqual([
    "月",
    "会社名",
    "入金額",
    "うち振込",
    "うち振込手数料",
    "入金日",
    "メモ",
  ]);
  const r = aoa.find((x) => x[1] === "鈴木商事");
  expect(r.slice(2, 5)).toEqual([55000, 54340, 660]);
});

test("★先方持ち＝入った額だけ記録・差は未入金で残ると押す前に出す★", async ({ page }) => {
  await hiraku(page);
  await csvYomu(page, "日付,摘要,お預り金額\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,19780\n");
  await expect(gyou(page, 0)).toContainText("差 ¥220（振込手数料かも）");
  await expect(gyou(page, 0)).toContainText("は未入金で残ります");
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  const p = await pays(page);
  expect(p).toHaveLength(1);
  expect(p[0]).toMatchObject({ month: "2026-10", paid: 19780 });
  expect(p[0].entries[0].tesuryo).toBeUndefined();
});

test("★まとめ入金＝古い月から2行に分けて書く★", async ({ page }) => {
  await hiraku(page);
  await csvYomu(page, "日付,摘要,お預り金額\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,30000\n");
  await expect(gyou(page, 0)).toContainText("まとめ入金");
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  const p = (await pays(page)).sort((a, b) => a.month.localeCompare(b.month));
  expect(p.map((x) => [x.month, x.paid])).toEqual([
    ["2026-09", 10000],
    ["2026-10", 20000],
  ]);
});

test("★別の端末が別の月へ同じ入金を書いた＝押しても止まる（二重に書かない）★", async ({ page }) => {
  await hiraku(page);
  await csvYomu(page, "日付,摘要,お預り金額\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,10000\n");
  // 横から（別の 端末）：9月の 行に 10,000 を 記録
  await page.evaluate((uid) => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.payments.push({
      id: "yoko1",
      user_id: uid,
      month: "2026-09",
      company: "山田建設",
      paid: 10000,
      paid_date: "2026-11-02",
      memo: "",
      entries: [{ gaku: 10000, hi: "2026-11-02" }],
      created_at: "2026-11-02T01:00:00.000Z",
      deleted_at: null,
    });
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  }, UID);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(page.locator(".toast").last()).toContainText("別の端末で入金が変わっていました");
  expect(await pays(page)).toHaveLength(1); // 横から 書いた 1行 だけ
  // 読み直した 後は「記録済みかも」が 出る
  await expect(gyou(page, 0).locator(".ks-kamo").first()).toContainText("記録済みかも");
});

test("★入金日の無い古い行が在っても止まらずに書ける（created_at を読む）★", async ({ page }) => {
  await hiraku(page, [
    {
      id: "old1",
      user_id: UID,
      month: "2026-09",
      company: "繰越社",
      paid: 3000,
      paid_date: null,
      memo: "",
      created_at: "2026-09-20T00:00:00.000Z",
      deleted_at: null,
    },
  ]);
  const mae = await page.evaluate(() => window._carryFor("繰越社", "2026-10"));
  await csvYomu(page, "日付,摘要,お預り金額\n2026/11/02,ｸﾘｺｼｼﾔ,27000\n");
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  const p = (await pays(page)).find((x) => x.month === "2026-10");
  expect(p).toMatchObject({ paid: 27000, paid_date: "2026-11-02" });
  // 10月の 紙（入金は 入金日の 月で 数える＝11/02 は 10月の 紙に 入らない）は 変わらない
  const ato = await page.evaluate(() => window._carryFor("繰越社", "2026-10"));
  expect(ato).toEqual(mae);
});

test("★この画面で全入金を押した直後でも止まらない（uid の無い控え）★", async ({ page }) => {
  await hiraku(page);
  await page.evaluate(() => window.markPaidFull("2026-09", "山田建設", 10000));
  await expect(page.locator("#toastUndo")).toContainText("全入金にしました");
  await csvYomu(page, CSV);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  expect((await pays(page)).length).toBe(2);
});

test("★取り消し：横から書かれたら戻さない（相手の入金を消さない）／横から無ければ戻す★", async ({
  page,
}) => {
  await hiraku(page);
  await csvYomu(page, CSV);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(page.locator("#toastUndo")).toContainText("入金を記録しました");
  // 横から：同じ 行に 5,000 足す
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    const r = db.tables.payments.find((p) => p.month === "2026-10" && p.company === "山田建設");
    r.paid = 25000;
    r.entries = r.entries.concat([{ gaku: 5000, hi: "2026-11-03" }]);
    r.paid_date = "2026-11-03";
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  await gyou(page, 0).locator(".ks-torikeshi").click();
  await expect(page.locator(".toast").last()).toContainText("取り消せません");
  expect((await pays(page))[0].paid).toBe(25000);

  // 横から 無い 時は 戻す（新しい 行＝消す）
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.payments = [];
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await csvYomu(page, CSV);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(page.locator("#toastUndo")).toContainText("入金を記録しました");
  await gyou(page, 0).locator(".ks-torikeshi").click();
  await expect(page.locator(".toast").last()).toContainText("取り消しました");
  expect(await pays(page)).toEqual([]);
});

test("★入金を読めない時は窓を開かない★", async ({ page }) => {
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed, { pays: [] });
  await page.addInitScript(() => {
    window.__FAKE_FAIL_TABLES__ = ["payments"];
  });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await page.locator("#ksOpenBtn").click();
  await expect(page.locator("#ksFile")).toHaveCount(0);
});

test("★同じ日・同じ額・同じ名義の振込が2本＝2本目を「記録済み」と言わない（本番前 taiketsu 注1）★", async ({
  page,
}) => {
  await hiraku(page);
  await csvYomu(
    page,
    "日付,摘要,お預り金額\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,10000\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,10000\n"
  );
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  // 2本目：記録済み と 言わない（「かも」の 警告は 出して 押せる）
  await expect(gyou(page, 1).locator(".ks-zumi")).toHaveCount(0);
  await expect(gyou(page, 1).locator(".ks-kamo").first()).toContainText("記録済みかも");
  await gyou(page, 1).locator(".ks-oshi").first().click();
  await expect(gyou(page, 1).locator(".ks-kaita")).toBeVisible();
  const p = await pays(page);
  const wa = p.reduce((t, x) => t + x.paid, 0);
  expect(wa).toBe(20000);
});

test("★名義の列を選び替えて同じ入金を読み直す＝「記録済みかも」が出る（本番前 taiketsu 止1）★", async ({
  page,
}) => {
  await hiraku(page);
  const csv = "日付,摘要,依頼人名,お預り金額\n2026/11/02,ﾌﾘｺﾐ ﾔﾏﾀﾞｹﾝｾﾂ ｼﾃﾝ,ﾔﾏﾀﾞｹﾝｾﾂ,20000\n";
  await csvYomu(page, csv);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  // 名義の 列を「摘要」に 選び替える（src が 変わる）
  await page.locator("#ksBody select").nth(5).selectOption({ label: "摘要" });
  await expect(gyou(page, 0).locator(".ks-zumi")).toHaveCount(0);
  await expect(gyou(page, 0)).toContainText("記録済みかも");
});

test("★まとめ入金が途中で止まった＝窓を開き直しても残りを押せる（本番前 taiketsu 再叩き 注1）★", async ({
  page,
}) => {
  await hiraku(page);
  // 2回目の 書き（10月の 行）だけ 落とす
  await page.evaluate(() => {
    window.__FAKE_WRITES__ = {};
    Object.defineProperty(window, "__FAKE_FAIL_WRITES__", {
      configurable: true,
      get: () => ((window.__FAKE_WRITES__ || {}).payments >= 1 ? ["payments"] : []),
    });
  });
  const csv = "日付,摘要,お預り金額\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,30000\n";
  await csvYomu(page, csv);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(page.locator(".toast").last()).toContainText("その先は記録できていません");
  expect((await pays(page)).map((x) => [x.month, x.paid])).toEqual([["2026-09", 10000]]);
  // 書けるように 戻して、窓を 開き直す（窓の 覚えは 消える）
  await page.evaluate(() => {
    Object.defineProperty(window, "__FAKE_FAIL_WRITES__", { configurable: true, value: [] });
  });
  await page.locator("#modalOv").evaluate((e) => e.classList.remove("open"));
  await csvYomu(page, csv);
  await expect(gyou(page, 0).locator(".ks-zumi")).toHaveCount(0);
  await expect(gyou(page, 0)).toContainText("残り ¥20,000");
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toBeVisible();
  const p = (await pays(page)).sort((a, b) => a.month.localeCompare(b.month));
  expect(p.map((x) => [x.month, x.paid])).toEqual([
    ["2026-09", 10000],
    ["2026-10", 20000],
  ]);
});

test("★別の会社に記録した同じ入金も「記録済みかも」（本番前 taiketsu 2回目 注2）★", async ({
  page,
}) => {
  await hiraku(page, [], {
    extraMeisai: [["m9", "田中運輸", "2026-10-08", 20000]],
    extraCo: [["c9", "田中運輸", { furikomiMeigi: ["ﾀﾅｶｳﾝﾕ"] }]],
  });
  const csv = "日付,摘要,依頼人名,お預り金額\n2026/11/02,ﾌﾘｺﾐ 1234,ﾔﾏﾀﾞｹﾝｾﾂ,20000\n";
  await csvYomu(page, csv);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toContainText("山田建設");
  // 名義の 列を「摘要」に 選び替える＝名義が どこにも 当たらない・田中運輸の 20,000 が ぴったりで 出る
  await page.locator("#ksBody select").nth(5).selectOption({ label: "摘要" });
  await expect(gyou(page, 0)).toContainText("田中運輸");
  await expect(gyou(page, 0).locator(".ks-kamo").first()).toContainText("山田建設");
});

test("★同じ日・同じ額の別の会社の振込＝もう1行の記録を「かも」にしない（3回目の叩き 注1）★", async ({
  page,
}) => {
  await hiraku(page, [], {
    extraMeisai: [["m9", "田中運輸", "2026-10-08", 20000]],
    extraCo: [["c9", "田中運輸", { furikomiMeigi: ["ﾀﾅｶｳﾝﾕ"] }]],
  });
  const csv = "日付,摘要,お預り金額\n2026/11/02,ﾔﾏﾀﾞｹﾝｾﾂ,20000\n2026/11/02,ﾀﾅｶｳﾝﾕ,20000\n";
  await csvYomu(page, csv);
  await gyou(page, 0).locator(".ks-oshi").first().click();
  await expect(gyou(page, 0).locator(".ks-kaita")).toContainText("山田建設");
  await expect(gyou(page, 1)).toContainText("田中運輸");
  await expect(gyou(page, 1).locator(".ks-kamo")).toHaveCount(0);
  await expect(gyou(page, 1).locator(".ks-oshi").first()).toHaveText("記録する");
});
