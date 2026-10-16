import { test, expect } from "@playwright/test";
// ============================================================
// 明細が 0件に なった 会社×月も 入金の 一覧に 出す 2026-10-14
//
//   前：明細を 外す／消すと 行ごと 消え、記録した 入金も 出した 請求書の 番号も 画面に 出なかった
//   今：自分の 入金の 記録か 請求番号が 在る 月だけ「明細なし」の 行で 出す（請求 ¥0）
//     ・合計・残額・バッジ・Excel（summarize）は 前と 同じ 数
//     ・窓では 額を 入れる ボタンを 出さない（押すと 記録した 入金が ¥0 に なる）
//     ・出した 時の 写しだけ（会社名を 付け替えた 古い 名前）では 出さない
// ============================================================
test.setTimeout(120000);
const A = "明細ある株式会社";
const B = "明細消えた株式会社";
const KYUU = "古い名前株式会社";

function seed() {
  return () => {
    // 同じ 試験の 中で 開き直した 時は 倉庫を 作り直さない（本物の 倉庫は 開き直しても 記録が 残る）
    if (localStorage.getItem("__fake_supa_db__")) return;
    const uid = "u_ki";
    const meisai = (id, co, date, amount) => ({
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
    const kaisha = (id, name) => ({
      id,
      user_id: uid,
      name,
      items: ["日付", "行き先", "金額"],
      config: {},
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
    localStorage.setItem(
      "__fake_supa_db__",
      JSON.stringify({
        users: { "s@x.com": { id: uid, email: "s@x.com", password: "himitsu123" } },
        session: { user: { id: uid, email: "s@x.com" } },
        tables: {
          meisai: [meisai("m1", "明細ある株式会社", "2026-05-06", 15400)],
          companies: [kaisha("c1", "明細ある株式会社"), kaisha("c2", "明細消えた株式会社")],
          issuer: [
            {
              user_id: uid,
              config: {
                issuer: "合同会社ZEROact\nZERO代行",
                bank: "見本銀行",
                showInvoiceNo: true,
              },
              updated_at: "2026-08-01T00:00:00.000Z",
            },
          ],
          payments: [
            {
              id: "p1",
              user_id: uid,
              month: "2026-05",
              company: "明細消えた株式会社",
              paid: 5000,
              paid_date: "2026-06-10",
              memo: "",
              deleted_at: null,
            },
          ],
          invoices: [
            {
              id: "i1",
              user_id: uid,
              month: "2026-05",
              company: "古い名前株式会社",
              invoice_no: "2026-05-09",
              total: 8000,
              tax: 0,
              rows_json: [{ 日付: "2026-05-02", 行き先: "本社〜北浜", 金額: 8000 }],
              issued_at: "2026-06-01T00:00:00.000Z",
              deleted_at: null,
            },
          ],
          invoice_no: [
            {
              user_id: uid,
              month: "2026-04",
              company: "明細消えた株式会社",
              invoice_no: "2026-04-01",
              decided_at: "2026-05-01T00:00:00.000Z",
            },
          ],
        },
      })
    );
  };
}

async function hiraku(page) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed());
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#payBody")).toContainText(A, { timeout: 20000 });
}
const gyou = (page, co, tsuki) =>
  page.locator("#payBody .pay-item").filter({ hasText: co }).filter({ hasText: tsuki });

test("明細が 0件の 月も「明細なし」で 出る・記録した 入金が 見える・合計は 前と 同じ", async ({
  page,
}) => {
  await hiraku(page);
  const b5 = gyou(page, B, "2026年5月");
  await expect(b5).toHaveCount(1);
  await expect(b5).toContainText("明細なし");
  await expect(b5).toContainText("記録した入金 ¥5,000");
  await expect(b5).not.toContainText("入金済");
  const b4 = gyou(page, B, "2026年4月"); // 請求番号だけ 在る 月
  await expect(b4).toHaveCount(1);
  await expect(b4).toContainText("明細なし");
  // 会社名を 付け替えた 古い 名前（出した 時の 写しだけ）は 出さない
  await expect(page.locator("#payBody")).not.toContainText(KYUU);
  // 合計は 明細の ある 会社 だけ（前と 同じ）
  const sum = await page.locator("#paySummary").innerText();
  expect(sum.replace(/\s/g, "")).toContain("請求¥15,400");
  expect(sum.replace(/\s/g, "")).toContain("入金¥0");
  expect(sum.replace(/\s/g, "")).toContain("残額¥15,400");
  // バッジ・Excel の 元（summarize）は 前と 同じ
  const k = await page.evaluate(() => ({
    badge: document.getElementById("payBadge").textContent,
    rows: summarize(null, "").rows.map((x) => x.company + " " + x.month),
  }));
  expect(k.badge).toBe("1");
  expect(k.rows).toEqual([A + " 2026-05"]);
  // 月の 選びに 4月が 在る
  const tsuki = await page.locator("#payMonth option").evaluateAll((o) => o.map((x) => x.value));
  expect(tsuki).toContain("2026-04");
});

test("明細なしの 窓＝額を 入れる ボタンを 出さず、記録した 入金を そのまま 見せる", async ({
  page,
}) => {
  await hiraku(page);
  await gyou(page, B, "2026年5月").click();
  await expect(page.locator("#modalBody #payKietaNote")).toContainText("¥5,000");
  await expect(page.locator("#modalBody .pay-quick")).toHaveCount(0);
  await expect(page.locator("#modalBody #pay_amt")).toHaveValue("5000");
});

// ── 本番前の 対立役（5179b29）の 指摘 ──
test("明細なしの 窓で 額を 0・日も メモも 空で 保存＝「記録を消しました」と 出し、取り消すと 戻る", async ({
  page,
}) => {
  await hiraku(page);
  await gyou(page, B, "2026年5月").click();
  await page.locator("#modalBody #pay_amt").fill("0");
  await page.locator("#modalBody #pay_date").fill("");
  await page.locator("#modalBody #pay_note").fill("");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  const t = page.locator("#toastUndo");
  await expect(t).toContainText(B + " の入金の記録を消しました");
  await expect(page.locator("#toast")).not.toContainText("入金を記録しました");
  await t.getByRole("button", { name: "取り消す" }).click();
  await expect(gyou(page, B, "2026年5月")).toContainText("記録した入金 ¥5,000");
  const db = await page.evaluate(
    () => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments
  );
  expect(db.filter((r) => !r.deleted_at).map((r) => r.paid)).toEqual([5000]);
});

test("明細なしの 窓で 額だけ 0（入金日は 残す）＝行は 消えない", async ({ page }) => {
  await hiraku(page);
  await gyou(page, B, "2026年5月").click();
  await page.locator("#modalBody #pay_amt").fill("0");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(gyou(page, B, "2026年5月")).toHaveCount(1);
  await expect(gyou(page, B, "2026年5月")).toContainText("明細なし");
});

test("他の アカウントの 入金の 記録・請求番号は 明細なしの 行に しない（自分の 物は する）", async ({
  page,
}) => {
  await hiraku(page);
  const r = await page.evaluate(() => {
    PAYMENTS[CURRENT_ACCOUNT + "::2026-03::他人の会社"] = { paid: 100, uid: "u_other" };
    INVOICE_NO["2026-02|他人の会社2"] = "2026-02-01";
    INVOICE_NO_UID["2026-02|他人の会社2"] = "u_other";
    PAYMENTS[CURRENT_ACCOUNT + "::2026-03::自分の会社"] = { paid: 100, uid: CURRENT_ACCOUNT };
    return kietaTsuki(seikyuList(null)).map((x) => x.company);
  });
  expect(r).not.toContain("他人の会社");
  expect(r).not.toContain("他人の会社2");
  expect(r).toContain("自分の会社");
});

// ── 本番前の 対立役（01a27a6）の 指摘 ──
test("取り消しの 知らせが 出ている 間に 別の 保存を すると 前の 取り消しは 閉じる（新しい 記録を 古い 物で 上書きしない）", async ({
  page,
}) => {
  await hiraku(page);
  await gyou(page, B, "2026年5月").click();
  await page.locator("#modalBody #pay_amt").fill("0");
  await page.locator("#modalBody #pay_date").fill("");
  await page.locator("#modalBody #pay_note").fill("");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(page.locator("#toastUndo .toast-undo-btn")).toHaveCount(1);
  // 5秒 以内に 別の 行で 入金を 保存＝前の 取り消しボタンは 無くなる
  await gyou(page, A, "2026年5月").click();
  await expect(page.locator("#toastUndo .toast-undo-btn")).toHaveCount(1); // 窓を 開くだけでは 消さない
  await page.locator("#modalBody #pay_amt").fill("3000");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(page.locator("#toast")).toContainText("入金を記録しました");
  // その場で 数える（待つと 5秒の 時計で 消えて 守りを 外しても 緑に なった）
  const nokori = await page.evaluate(
    () => document.querySelectorAll("#toastUndo .toast-undo-btn").length
  );
  expect(nokori, "保存の 後も 古い 取り消しが 押せる").toBe(0);
});

test("取り消しボタンは 5秒で 画面から 消える（見えない まま Tab で 押せない）", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(() => markPaidFull("2026-05", "明細ある株式会社", 15400));
  await expect(page.locator("#toastUndo .toast-undo-btn")).toHaveCount(1);
  await page.waitForTimeout(5600);
  await expect(page.locator("#toastUndo .toast-undo-btn")).toHaveCount(0);
});

test("一括で 全入金 → 取り消す＝元に 戻る", async ({ page }) => {
  await hiraku(page);
  await page.evaluate(async () => {
    payToggleRow("2026-05", "明細ある株式会社", 15400);
    await bulkMarkPaid();
  });
  await expect(page.locator("#toastUndo")).toContainText("全入金にしました");
  await page.locator("#toastUndo").getByRole("button", { name: "取り消す" }).click();
  await expect(page.locator("#toast")).toContainText("取り消しました", { timeout: 10000 });
  const db = await page.evaluate(
    () => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments
  );
  expect(db.filter((r) => r.company === "明細ある株式会社" && !r.deleted_at && r.paid > 0)).toEqual(
    []
  );
});

test("倉庫に 記録が 在るのに この 画面に 無い 月（別の 端末で 入れた）を 空で 保存＝消さない", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(async () => {
    // 別の 端末が 後から 入れた 記録（この 画面は 知らない）
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.payments.push({
      id: "p_betsu",
      user_id: "u_ki",
      month: "2026-05",
      company: "明細ある株式会社",
      paid: 7000,
      paid_date: "2026-06-20",
      memo: "",
      deleted_at: null,
    });
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  await gyou(page, A, "2026年5月").click();
  await page.locator("#modalBody #pay_amt").fill("0");
  await page.locator("#modalBody #pay_date").fill("");
  await page.locator("#modalBody #pay_note").fill("");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(page.locator("#toast")).toContainText("何も変えていません");
  const nokori = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.payments.filter(
        (r) => r.id === "p_betsu"
      ).length
  );
  expect(nokori, "別の 端末の 記録が 消えた").toBe(1);
});

test("全入金の 知らせの 会社名は 二重に 化けない（& や < を そのまま）", async ({ page }) => {
  await hiraku(page);
  const ji = await page.evaluate(async () => {
    const co = "A&B<株>";
    MASTER[co] = { account_id: CURRENT_ACCOUNT, items: ["日付", "行き先", "金額"] };
    await markPaidFull("2026-05", co, 1000);
    return document.getElementById("toastUndo").textContent;
  });
  expect(ji).toContain("A&B<株> を全入金にしました");
});

test("記録の 無い 月で 空の まま 保存＝「記録しました」と 言わない", async ({ page }) => {
  await hiraku(page);
  await gyou(page, A, "2026年5月").click();
  await page.locator("#modalBody #pay_amt").fill("0");
  await page.locator("#modalBody #pay_date").fill("");
  await page.locator("#modalBody #pay_note").fill("");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(page.locator("#toast")).toContainText("この画面には入金の記録がありません");
});

test("一括の 取り消しで 戻せなかった 時は「戻せませんでした」と 出す（「取り消しました」と だけ 言わない）", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(async () => {
    payToggleRow("2026-05", "明細ある株式会社", 15400);
    await bulkMarkPaid();
  });
  await expect(page.locator("#toastUndo")).toContainText("全入金にしました");
  await page.evaluate(() => {
    window.__FAKE_OFFLINE__ = true; // 消す 呼び出しも 落ちる（書けない 表の 切り替えは 消す 方に 効かない）
  });
  await page.locator("#toastUndo").getByRole("button", { name: "取り消す" }).click();
  await expect(page.locator("#toast")).toContainText("1件のうち 1件を戻せませんでした", {
    timeout: 10000,
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("2026年5月 明細ある株式会社：前は 記録なし");
  await expect(obi).toContainText("下の一覧で 1件ずつ 前の額に直してください");
});

// 元の 額に 戻す 書き込み（upsert）だけ 落とす：会社名で 狙う
async function upsertWoOtosu(page, co) {
  await page.evaluate((co) => {
    // ★元の SB.from を 1回だけ 覚える★（重ねて 包むと 前の 落とし方が 残る）。co が null なら 元に 戻す
    if (!window.__sbMoto) window.__sbMoto = SB.from.bind(SB);
    const moto = window.__sbMoto;
    if (co === null) {
      SB.from = moto;
      return;
    }
    SB.from = function (t) {
      const q = moto(t);
      if (t !== "payments") return q;
      const u = q.upsert.bind(q);
      q.upsert = function (row, o) {
        if (row && row.company === co) {
          const ng = { data: null, error: { message: "わざと" } };
          const api = {
            select: () => api,
            single: () => Promise.resolve(ng),
            then: (a, b) => Promise.resolve(ng).then(a, b),
          };
          return api;
        }
        return u(row, o);
      };
      return q;
    };
  }, co);
}

test("一括の 取り消し：2件の うち 前の 記録が 在る 1件だけ 戻せない＝月・会社・前の 額を 出し、もう 1件は 戻る", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await hiraku(page);
  await page.evaluate(async () => {
    // 2社目（明細あり）と、1社目の 一部入金の 記録 3,000
    const co2 = "二つ目株式会社";
    MASTER[co2] = { account_id: CURRENT_ACCOUNT, items: ["日付", "行き先", "金額"] };
    DB.push({
      id: "m9",
      account_id: CURRENT_ACCOUNT,
      会社名: co2,
      日付: "2026-05-08",
      行き先: "x",
      金額: 2000,
    });
    const k = payKeyFor("2026-05", "明細ある株式会社");
    PAYMENTS[k] = { paid: 3000, paidDate: "2026-06-01", note: "" };
    renderPayments();
    payToggleRow("2026-05", "明細ある株式会社", 15400);
    payToggleRow("2026-05", co2, 2000);
    await bulkMarkPaid();
  });
  await expect(page.locator("#toastUndo")).toContainText("2件を全入金にしました");
  await upsertWoOtosu(page, "明細ある株式会社");
  await page.locator("#toastUndo").getByRole("button", { name: "取り消す" }).click();
  await expect(page.locator("#toast")).toContainText("2件のうち 1件を戻せませんでした", {
    timeout: 10000,
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("2026年5月 明細ある株式会社：前は ¥3,000・入金日 2026-06-01");
  await expect(obi).not.toContainText("二つ目株式会社");
  // 電話の 幅で 帯が 画面の 中に 収まり、字が はみ出さない
  const b = await obi.boundingBox();
  expect(b.x, "左に はみ出す").toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, "右に はみ出す").toBeLessThanOrEqual(375);
  expect(b.y, "上に はみ出す").toBeGreaterThanOrEqual(0);
  const hami = await obi.evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(hami, "字が 帯から はみ出す").toBeLessThanOrEqual(1);
  // 戻せた 方（二つ目）は 全入金が 消えている
  const rest = await page.evaluate(() => PAYMENTS[payKeyFor("2026-05", "二つ目株式会社")] || null);
  expect(rest).toBeNull();
  // 1件 直して 保存しても 帯は 残る（知らせ 1枚だと 上書きで 消えた）
  await upsertWoOtosu(page, null);
  await page.locator("#payBody .pay-item").filter({ hasText: "明細ある株式会社" }).first().click();
  await page.locator("#modalBody #pay_amt").fill("3000");
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(page.locator("#toast")).toContainText("入金を記録しました");
  await expect(page.locator("#payModose")).toContainText("2026年5月 明細ある株式会社");
  await page.locator("#payModose").getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator("#payModose")).toHaveCount(0);
});

test("一括の 取り消しの 間に 入金を 読めなく なった＝「画面を開き直して」と 出す（「この画面で 直して」と 言わない）", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(async () => {
    payToggleRow("2026-05", "明細ある株式会社", 15400);
    await bulkMarkPaid();
  });
  await expect(page.locator("#toastUndo")).toContainText("全入金にしました");
  await page.evaluate(() => {
    YOMENAI.payments = true;
  });
  await page.locator("#toastUndo").getByRole("button", { name: "取り消す" }).click();
  await expect(page.locator("#payModose")).toContainText("画面を開き直して確かめてください", {
    timeout: 10000,
  });
});

// ── 本番前の 対立役（760458d）の 指摘 ──
async function ikkatsuDeOtosu(page, co, total) {
  await page.evaluate(
    async ([co, total]) => {
      payToggleRow("2026-05", co, total);
      await bulkMarkPaid();
    },
    [co, total]
  );
  await expect(page.locator("#toastUndo")).toContainText("全入金にしました");
  await page.evaluate(() => (window.__FAKE_OFFLINE__ = true));
  await page.locator("#toastUndo").getByRole("button", { name: "取り消す" }).click();
  await expect(page.locator("#toast")).toContainText("戻せませんでした", { timeout: 10000 });
  await page.evaluate(() => (window.__FAKE_OFFLINE__ = false));
}

test("戻せなかった 一覧は 画面を 開き直しても 残る（訳の 通りに 開き直すと 消えていた）", async ({
  page,
}) => {
  await hiraku(page);
  await ikkatsuDeOtosu(page, "明細ある株式会社", 15400);
  await expect(page.locator("#payModose")).toContainText("2026年5月 明細ある株式会社");
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#payModose")).toContainText("2026年5月 明細ある株式会社", {
    timeout: 20000,
  });
  await page.locator("#payModose").getByRole("button", { name: "閉じる" }).click();
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#payBody")).toContainText("明細ある株式会社", { timeout: 20000 });
  await expect(page.locator("#payModose")).toHaveCount(0);
});

test("2回目に 戻せなかった 物は 1回目の 一覧に 足す（消さない）・字は そのまま・額が 空なら「額が 読めない」", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(() => {
    modoseNakattaMado(
      1,
      [{ month: "2026-04", co: "一回目株式会社", snap: { paid: 1000, paidDate: "2026-05-01" } }],
      false
    );
    modoseNakattaMado(
      2,
      [
        { month: "2026-05", co: "<b>太字</b>株式会社", snap: { paid: null } },
        { month: "2026-04", co: "一回目株式会社", snap: { paid: 15400 } }, // 同じ 月×会社＝最初の 前の 状態を 残す
      ],
      false
    );
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("2026年4月 一回目株式会社：前は ¥1,000・入金日 2026-05-01");
  await expect(obi).toContainText("2026年5月 <b>太字</b>株式会社：前は 額が 読めない");
  await expect(obi).not.toContainText("¥15,400");
  expect(await obi.locator("li b").count(), "会社名の 字が HTML に なった").toBe(0);
  await expect(obi).toContainText("取り消せなかった入金 2件");
});

// ── 本番前の 対立役（a97eb05）の 指摘 ──
async function hirakiNaosu(page) {
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#payBody")).toContainText("明細ある株式会社", { timeout: 20000 });
}

test("「読めていません」は 開き直して 読めた 後は 出ない（覚えない）・別の 人の 一覧は 出ない", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(() => {
    YOMENAI.payments = true;
    modoseNakattaMado(1, [{ month: "2026-05", co: "明細ある株式会社", snap: { paid: 1 } }]);
  });
  await expect(page.locator("#payModose")).toContainText("入金を読めていません");
  await hirakiNaosu(page);
  await expect(page.locator("#payModose")).toContainText("2026年5月 明細ある株式会社");
  await expect(page.locator("#payModose")).not.toContainText("入金を読めていません");
  // 別の 人の 鍵に 在る 一覧は 出さない
  await page.evaluate(() => {
    modoseTojiru();
    localStorage.setItem(
      "payModose:other",
      JSON.stringify({ dame: [{ month: "2026-05", co: "他人の会社", snap: { paid: 1 } }] })
    );
  });
  await hirakiNaosu(page);
  await expect(page.locator("#payModose")).toHaveCount(0);
});

test("額が 空の 字なら「額が 読めない」・メモの 本文は 覚えない・前の 額に 直った 行は 消える", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(() => {
    modoseNakattaMado(2, [
      { month: "2026-04", co: "空の会社", snap: { paid: "", note: "ひみつの メモ" } },
      { month: "2026-05", co: "明細ある株式会社", snap: { paid: 3000, paidDate: "2026-06-01" } },
    ]);
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("2026年4月 空の会社：前は 額が 読めない・入金日 なし・メモ あり");
  const oboe = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.indexOf("payModose:") === 0)
      .map((k) => localStorage.getItem(k))
      .join("\n")
  );
  expect(oboe, "メモの 本文を 覚えた").not.toContain("ひみつ");
  // 明細ある株式会社 を 前の 額（3,000・6/1）に 直す＝その 行は 消える
  await page.evaluate(() => {
    PAYMENTS[payKeyFor("2026-05", "明細ある株式会社")] = {
      paid: 3000,
      paidDate: "2026-06-01",
      note: "",
    };
    payKaita(payKeyFor("2026-05", "明細ある株式会社")); // この タブで 書き換えた（保存の 道と 同じ 印）
    renderPayments();
  });
  await expect(obi).not.toContainText("明細ある株式会社");
  await expect(obi).toContainText("空の会社");
});

// ── 本番前の 対立役（83418d9）の 指摘 ──
test("帯は ログインした 人の 物だけ（人を 入れ替えると 出ない）", async ({ page }) => {
  await hiraku(page);
  await page.evaluate(() => {
    modoseNakattaMado(1, [{ month: "2026-05", co: "明細ある株式会社", snap: { paid: 1 } }]);
  });
  await expect(page.locator("#payModose")).toContainText("明細ある株式会社");
  await page.evaluate(() => {
    MODOSE = null;
    CURRENT_ACCOUNT = "u_betsu";
    renderPayments();
  });
  await expect(page.locator("#payModose")).toHaveCount(0);
});

test("前が 記録なしの 行は 客が「未入金(0)」で 保存すると 消える・前の 入金日が 空なら「入金日 なし」", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    modoseNakattaMado(2, [
      { month: "2026-05", co: "明細ある株式会社", snap: null },
      { month: "2026-04", co: "日の無い会社", snap: { paid: 3000, paidDate: "" } },
    ]);
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("2026年4月 日の無い会社：前は ¥3,000・入金日 なし");
  await expect(obi).toContainText("2026年5月 明細ある株式会社");
  await page.locator("#payBody .pay-item").filter({ hasText: "明細ある株式会社" }).first().click();
  await page.locator("#modalBody").getByRole("button", { name: "未入金(0)" }).click();
  await page.locator("#modalBody").getByRole("button", { name: /保存/ }).first().click();
  await expect(page.locator("#toast")).toContainText("入金を記録しました");
  await expect(obi).not.toContainText("明細ある株式会社");
  await expect(obi).toContainText("日の無い会社");
});

test("別の タブで 足された 行・閉じた 帯に 合わせる（古い 一覧で 上書きしない）", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(() => {
    modoseNakattaMado(1, [{ month: "2026-05", co: "一つ目の会社", snap: { paid: 1 } }]);
    // 別の タブが 足した（端末の 覚えだけ 変わる）
    const k = "payModose:" + CURRENT_ACCOUNT;
    const o = JSON.parse(localStorage.getItem(k));
    o.dame.push({ month: "2026-05", co: "二つ目の会社", snap: { paid: 2 } });
    localStorage.setItem(k, JSON.stringify(o));
    modoseNakattaMado(1, [{ month: "2026-05", co: "三つ目の会社", snap: { paid: 3 } }]);
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("一つ目の会社");
  await expect(obi).toContainText("二つ目の会社");
  await expect(obi).toContainText("三つ目の会社");
  // 別の タブで 閉じた＝この タブでも 描き直すと 消える
  await page.evaluate(() => {
    localStorage.removeItem("payModose:" + CURRENT_ACCOUNT);
    renderPayments();
  });
  await expect(page.locator("#payModose")).toHaveCount(0);
});

// ── 本番前の 対立役（592de9e）の 指摘 ──
test("覚えに 書けない 端末でも 帯は 出て、新しい 行も 出る（覚えを 正に しない）", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(() => {
    modoseNakattaMado(1, [{ month: "2026-04", co: "古い行の会社", snap: { paid: 1 } }]);
    // ここから 書けなく なる（読めは する）
    const moto = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).indexOf("payModose:") === 0) throw new Error("いっぱい");
      return moto.call(this, k, v);
    };
    modoseNakattaMado(1, [{ month: "2026-05", co: "新しい行の会社", snap: { paid: 2 } }]);
    renderPayments();
  });
  const obi = page.locator("#payModose");
  await expect(obi).toContainText("古い行の会社");
  await expect(obi).toContainText("新しい行の会社");
});

test("古い タブは 自分が 入金を 読んだ 後に 起きた 行を「直った」と 消さない", async ({ page }) => {
  await hiraku(page);
  const tsugi = await page.evaluate(() => {
    // 別の タブが 今 足した 行（この タブの 入金は それより 古い＝記録なしに 見える）
    const k = "payModose:" + CURRENT_ACCOUNT;
    const ato = new Date(Date.now() + 60000).toISOString();
    localStorage.setItem(
      k,
      JSON.stringify({ dame: [{ month: "2026-05", co: "明細ある株式会社", at: ato, snap: null }] })
    );
    renderPayments();
    return JSON.parse(localStorage.getItem(k) || "null");
  });
  expect(tsugi && tsugi.dame.length, "古い タブが 別の タブの 行を 消した").toBe(1);
  await expect(page.locator("#payModose")).toContainText("明細ある株式会社");
});

// ── 本番前の 対立役（a9cc53e）の 指摘 ──
test("会社名を 変えても 帯の 行は 新しい 名前で 残る（前は 記録なしに 見えて 黙って 消え、全入金が 残った）", async ({
  page,
}) => {
  await hiraku(page);
  await page.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    modoseNakattaMado(1, [{ month: "2026-05", co: "明細ある株式会社", snap: null }]);
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    renderPayments();
  });
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(page.locator("#payModose")).toContainText("2026年5月 名前を変えた株式会社", {
    timeout: 10000,
  });
});

test("日時が 読めない 行は「直った」と 判じない（分からない 時は 消さない）", async ({ page }) => {
  await hiraku(page);
  const nokori = await page.evaluate(() => {
    const k = "payModose:" + CURRENT_ACCOUNT;
    localStorage.setItem(
      k,
      JSON.stringify({
        dame: [{ month: "2026-05", co: "明細ある株式会社", at: "よめない", snap: null }],
      })
    );
    renderPayments();
    const o = JSON.parse(localStorage.getItem(k) || "null");
    return o ? o.dame.length : 0;
  });
  expect(nokori).toBe(1);
});

// ── 本番前の 対立役（bc63963）の 指摘 ──
test("別の タブで 会社名を 変えても、古い タブは 付け替えた 行を「直った」と 消さない", async ({
  context,
}) => {
  const a = await context.newPage();
  await hiraku(a);
  await a.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    modoseNakattaMado(1, [{ month: "2026-05", co: "明細ある株式会社", snap: null }]);
  });
  const b = await context.newPage();
  await hiraku(b);
  await a.evaluate(async () => {
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
  });
  const nokori = await b.evaluate(() => {
    renderPayments();
    const o = JSON.parse(localStorage.getItem("payModose:" + CURRENT_ACCOUNT) || "null");
    return o ? o.dame.map((x) => x.co) : [];
  });
  expect(nokori, "古い タブが 付け替えた 行を 消した").toEqual(["名前を変えた株式会社"]);
});

test("明細の 付け替えだけ 落ちた＝入金も 元の 名前に 戻す（倉庫の 入金だけ 新しい 名前に 残さない）", async ({
  page,
}) => {
  await hiraku(page);
  const kaisha = await page.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    window.__FAKE_FAIL_WRITES__ = ["meisai"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    // 偽の倉庫には 前から 別の 会社の 入金も 在る＝付け替えに 関わる 2つの 名前だけ 見る
    return db.tables.payments
      .filter((r) => !r.deleted_at && r.paid > 0)
      .map((r) => r.company)
      .filter((c) => c === "明細ある株式会社" || c === "名前を変えた株式会社");
  });
  expect(kaisha).toEqual(["明細ある株式会社"]);
});

test("会社名の 付け替えで 関係ない 会社の 帯の 行の 名前は 変えない", async ({ page }) => {
  await hiraku(page);
  const na = await page.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    modoseNakattaMado(2, [
      { month: "2026-05", co: "明細ある株式会社", snap: null },
      { month: "2026-04", co: "関係ない会社", snap: { paid: 1 } },
    ]);
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    const o = JSON.parse(localStorage.getItem("payModose:" + CURRENT_ACCOUNT) || "null");
    return o ? o.dame.map((x) => x.co).sort() : [];
  });
  expect(na).toEqual(["名前を変えた株式会社", "関係ない会社"].sort());
});

// ── 本番前の 対立役（0764422）の 止める 指摘：戻しが 消した 会社の 行まで 動かした ──
// 消した 会社「名前を変えた株式会社」の 入金・明細・請求番号が 倉庫に 残っている 形を 作る
async function keshitaKaishaWoOku(page) {
  await page.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    const p0 = db.tables.payments.find((x) => x.company === "明細ある株式会社");
    db.tables.payments.push(
      Object.assign({}, p0, {
        id: "pX-keshita",
        company: "名前を変えた株式会社",
        month: "2026-03",
        paid: 9000,
      })
    );
    const m0 = db.tables.meisai.find((x) => x.company === "明細ある株式会社");
    db.tables.meisai.push(
      Object.assign({}, m0, { id: "mX-keshita", company: "名前を変えた株式会社" })
    );
    const uid = p0.user_id;
    db.tables.invoice_no.push(
      {
        user_id: uid,
        month: "2026-03",
        company: "名前を変えた株式会社",
        invoice_no: "2026-03-01",
        decided_at: "2026-04-01T00:00:00.000Z",
      },
      {
        user_id: uid,
        month: "2026-05",
        company: "明細ある株式会社",
        invoice_no: "2026-05-01",
        decided_at: "2026-06-01T00:00:00.000Z",
      }
    );
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
}
function kaishaDoko(page) {
  return page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    const co = (t, f) => db.tables[t].filter(f).map((r) => r.company);
    return {
      keshitaPay: co("payments", (r) => r.id === "pX-keshita"),
      keshitaMeisai: co("meisai", (r) => r.id === "mX-keshita"),
      keshitaBangou: co("invoice_no", (r) => r.month === "2026-03"),
      aPay: co(
        "payments",
        (r) => r.month === "2026-05" && r.paid > 0 && r.id !== "pX-keshita"
      ).filter((c) => c === "明細ある株式会社" || c === "名前を変えた株式会社"),
      aMeisai: [
        ...new Set(
          co("meisai", (r) => r.id !== "mX-keshita").filter(
            (c) => c === "明細ある株式会社" || c === "名前を変えた株式会社"
          )
        ),
      ],
      aBangou: co("invoice_no", (r) => r.month === "2026-05"),
      master: Object.keys(MASTER).includes("明細ある株式会社"),
    };
  });
}
const KESHITA_NOKOSU = {
  keshitaPay: ["名前を変えた株式会社"],
  keshitaMeisai: ["名前を変えた株式会社"],
  keshitaBangou: ["名前を変えた株式会社"],
};

test("明細の 付け替えが 落ちた 戻しは 動かした 行だけ（消した 会社の 入金・請求番号を 動かさない）", async ({
  page,
}) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  await page.evaluate(async () => {
    window.__FAKE_FAIL_WRITES__ = ["meisai"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
  });
  expect(await kaishaDoko(page)).toEqual({
    ...KESHITA_NOKOSU,
    aPay: ["明細ある株式会社"],
    aMeisai: ["明細ある株式会社"],
    aBangou: ["明細ある株式会社"],
    master: true,
  });
});

test("入金の 付け替えが 落ちた 戻しは 動かした 明細だけ（消した 会社の 明細を 動かさない）", async ({
  page,
}) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  await page.evaluate(async () => {
    window.__FAKE_FAIL_WRITES__ = ["payments"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
  });
  expect(await kaishaDoko(page)).toEqual({
    ...KESHITA_NOKOSU,
    aPay: ["明細ある株式会社"],
    aMeisai: ["明細ある株式会社"],
    aBangou: ["明細ある株式会社"],
    master: true,
  });
});

test("戻す 明細が 200 件を 超えても 全部 戻す（鍵を 分けて 送る）", async ({ page }) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    const m0 = db.tables.meisai.find((x) => x.company === "明細ある株式会社");
    for (let i = 0; i < 450; i++) db.tables.meisai.push(Object.assign({}, m0, { id: "m-oi-" + i }));
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  const r = await page.evaluate(async () => {
    window.__FAKE_FAIL_WRITES__ = ["payments"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return {
      nokori: db.tables.meisai.filter((x) => x.company === "名前を変えた株式会社").map((x) => x.id),
      modotta: db.tables.meisai.filter(
        (x) => String(x.id).startsWith("m-oi-") && x.company === "明細ある株式会社"
      ).length,
      shirase: document.body.innerText.includes("元に 戻せませんでした"),
    };
  });
  expect(r).toEqual({ nokori: ["mX-keshita"], modotta: 450, shirase: false });
});

test("戻す 明細が 倉庫の 1ページ（1000 行）を 超えても 全部 戻す（名簿を 全ページ 読む）", async ({
  page,
}) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    const m0 = db.tables.meisai.find((x) => x.company === "明細ある株式会社");
    for (let i = 0; i < 1100; i++) db.tables.meisai.push(Object.assign({}, m0, { id: "m-p-" + i }));
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  const r = await page.evaluate(async () => {
    window.__FAKE_FAIL_WRITES__ = ["payments"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return {
      nokori: db.tables.meisai.filter((x) => x.company === "名前を変えた株式会社").map((x) => x.id),
      shirase: document.body.innerText.includes("元に 戻せませんでした"),
    };
  });
  expect(r).toEqual({ nokori: ["mX-keshita"], shirase: false });
});

test("会社名を 付け替えても 帯の「いつ 取り消せなかったか」は 変えない", async ({ page }) => {
  await hiraku(page);
  const at = await page.evaluate(async () => {
    await markPaidFull("2026-05", "明細ある株式会社", 15400);
    modoseNakattaMado(1, [{ month: "2026-05", co: "明細ある株式会社", snap: null }]);
    const k = "payModose:" + CURRENT_ACCOUNT;
    const o = JSON.parse(localStorage.getItem(k));
    o.dame[0].at = "2026-10-01T03:04:00.000Z";
    localStorage.setItem(k, JSON.stringify(o));
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    const o2 = JSON.parse(localStorage.getItem(k) || "null");
    return o2 ? o2.dame.map((x) => x.co + " " + x.at) : [];
  });
  expect(at).toEqual(["名前を変えた株式会社 2026-10-01T03:04:00.000Z"]);
});

for (const tbl of ["invoice_no", "meisai", "payments"]) {
  test("変える 前の 確かめが 読めない 時は 何も 書かない：" + tbl, async ({ page }) => {
    await hiraku(page);
    await keshitaKaishaWoOku(page);
    const shirase = await page.evaluate(async (tbl) => {
      window.__FAKE_FAIL_TABLES__ = [tbl];
      await renameCompany("明細ある株式会社", "名前を変えた株式会社");
      window.__FAKE_FAIL_TABLES__ = [];
      return document.body.innerText.includes("会社名を 変えませんでした");
    }, tbl);
    expect(shirase).toBe(true);
    expect(await kaishaDoko(page)).toEqual({
      ...KESHITA_NOKOSU,
      aPay: ["明細ある株式会社"],
      aMeisai: ["明細ある株式会社"],
      aBangou: ["明細ある株式会社"],
      master: true,
    });
  });
}

test("変える 前の 確かめで 本数（count）が 返らない 時は 何も 書かない", async ({ page }) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  await page.evaluate(async () => {
    const moto = SB.from.bind(SB);
    SB.from = function (t) {
      const q = moto(t);
      if (t === "meisai") {
        const sel = q.select;
        q.select = function () {
          const b = sel.apply(q, arguments);
          const th = b.then;
          b.then = (res, rej) =>
            th.call(b, (x) => Object.assign({}, x, { count: null })).then(res, rej);
          return b;
        };
      }
      return q;
    };
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    SB.from = moto;
  });
  const d = await kaishaDoko(page);
  expect(d.master, "本数が 分からないのに 付け替えた").toBe(true);
  expect(d.aMeisai).toEqual(["明細ある株式会社"]);
});

test("確かめの 後に 足された 明細も 戻す（入金の 付け替えが 落ちた 時）", async ({ page }) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  const r = await page.evaluate(async () => {
    // 台帳を 書く 直前に、別の タブが 元の 名前で 明細を 1行 足した 形
    const moto = SB.from.bind(SB);
    let tashita = false;
    SB.from = function (t) {
      if (t === "invoice_no" && !tashita) {
        const q = moto(t);
        const up = q.update;
        q.update = function () {
          tashita = true;
          const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
          const m0 = db.tables.meisai.find((x) => x.company === "明細ある株式会社");
          db.tables.meisai.push(Object.assign({}, m0, { id: "m-race" }));
          localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
          return up.apply(this, arguments);
        };
        return q;
      }
      return moto(t);
    };
    window.__FAKE_FAIL_WRITES__ = ["payments"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
    SB.from = moto;
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return {
      race: db.tables.meisai.find((x) => x.id === "m-race").company,
      keshita: db.tables.meisai.find((x) => x.id === "mX-keshita").company,
    };
  });
  expect(r).toEqual({ race: "明細ある株式会社", keshita: "名前を変えた株式会社" });
});

test("消した 会社の 残りが 多すぎる 時は 戻さず「戻せなかった」と 知らせる（一括で 動かさない）", async ({
  page,
}) => {
  await hiraku(page);
  await keshitaKaishaWoOku(page);
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    const m0 = db.tables.meisai.find((x) => x.company === "名前を変えた株式会社");
    for (let i = 0; i < 150; i++)
      db.tables.meisai.push(Object.assign({}, m0, { id: "mX-oi-" + i }));
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  });
  const r = await page.evaluate(async () => {
    window.__FAKE_FAIL_WRITES__ = ["payments"];
    await renameCompany("明細ある株式会社", "名前を変えた株式会社");
    window.__FAKE_FAIL_WRITES__ = [];
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return {
      shirase: document.body.innerText.includes("元に 戻せませんでした"),
      keshitaUgoita: db.tables.meisai.filter(
        (x) => String(x.id).startsWith("mX-") && x.company !== "名前を変えた株式会社"
      ).length,
    };
  });
  expect(r).toEqual({ shirase: true, keshitaUgoita: 0 });
});
