import { test, expect } from "@playwright/test";

// ============================================================
// ★★読めなかった 物が 在る 時は 請求書を 作らない・入金／自社情報／番号を 書かない★★ 2026-10-08
//
//   司さんの 決め「お金の出力は 1人でも 計算できなければ 止めて 警告」
//   ★前★ 入金・自社情報・控え・番号の 台帳は 読めなくても toast だけで 画面が 動き、
//         ・既定の 自社情報（振込先・登録番号）で 請求書が 出る
//         ・台帳に 無い 事に なり 番号を 作り直して 倉庫の 凍結した 番号を 上書き
//         ・未入金に 見えた まま 入金を 上書き
//   ★物差し★ 4つ それぞれ 読めない ⇒ 請求書の ボタンが 止まり・作る 関数が 何も 返さず・
//             自社情報／入金／番号への 書き込みが 0回。全部 読める ⇒ ボタンは 押せる（止めすぎない）
//
//   ★★わざと壊して 赤に なるのを 見た（2026-10-08 実測）★★ 下の 試験の 頭に 書く
// ============================================================

const CO = "飛勝工業株式会社";
test.setTimeout(120000);

function seed() {
  const uid = "u_yomi";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "y@x.com": { id: uid, email: "y@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "y@x.com" } },
      tables: {
        meisai: [
          {
            id: "m1",
            user_id: uid,
            company: CO_NA,
            date: "2026-05-06",
            destination: "本社〜北浜",
            amount: 12000,
            note: "",
            distance: null,
            people: 1,
            name: "",
            extra: null,
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        companies: [
          {
            id: "c2",
            user_id: uid,
            name: CO_NA,
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
              issuer: "合同会社ZEROact\n登録番号：T3500003003293",
              bank: "伊予銀行",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [{ user_id: uid, month: "2026-05", company: CO_NA, invoice_no: "202605-099" }],
        payments: [
          {
            id: "p1",
            user_id: uid,
            month: "2026-05",
            company: CO_NA,
            paid: 5000,
            paid_date: "2026-06-01",
            memo: "半分",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

async function open(page, ochiru, ooi) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript((t) => {
    window.__FAKE_FAIL_TABLES__ = t;
    window.__FAKE_WRITES__ = {};
  }, ochiru);
  await page.addInitScript(`var CO_NA = ${JSON.stringify(CO)};(${seed.toString()})();`);
  // ★台帳の 前に 1000行 足す（1001行目が 目当ての 月）★
  if (ooi)
    await page.addInitScript(() => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      const mae = [];
      for (let i = 0; i < 1000; i++)
        mae.push({
          user_id: "u_yomi",
          month: "2025-01",
          company: "ダミー" + i,
          invoice_no: "202501-" + i,
        });
      db.tables.invoice_no = mae.concat(db.tables.invoice_no);
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    });
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", CO);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 60000 });
}

// わざと壊す：_buildInvoiceBytes・saveIssuer・入金の 4つ・issueInvoiceNo の 門を 外す ⇒ 赤（書き込み・作成が 起きる）
for (const t of ["issuer", "invoices", "invoice_no", "payments"]) {
  test("★" + t + " が 読めない ⇒ 請求書を 作らない・書かない★", async ({ page }) => {
    const err = [];
    page.on("pageerror", (e) => err.push(e.message));
    await open(page, [t]);
    // ★ボタンと 知らせ★
    await expect(page.locator("#btnInvPdf")).toBeDisabled();
    await expect(page.locator("#regnoWarn")).toContainText("読めなかったので");
    // ★作る・書く 道を 直に 呼ぶ★（ボタンが 止まっていても 関数が 止まるか）
    const r = await page.evaluate(async (co) => {
      window.__FAKE_WRITES__ = {};
      const bytes = await _buildInvoiceBytes();
      await saveIssuer();
      await markPaidFull("2026-05", co, 12000);
      let no = "投げなかった";
      try {
        await issueInvoiceNo("2026-05", co);
      } catch (e) {
        no = "投げた";
      }
      return {
        bytes: bytes,
        writes: window.__FAKE_WRITES__,
        no: no,
        out: document.getElementById("invoiceOut").textContent,
      };
    }, CO);

    console.log("★" + t + "★ " + JSON.stringify(r).slice(0, 300));
    expect(r.bytes, "★読めないのに 請求書を 作った★").toBeNull();
    if (t === "issuer") expect(r.writes.issuer || 0, "★読めない 自社情報を 既定で 上書き★").toBe(0);
    if (t === "payments") expect(r.writes.payments || 0, "★読めない 入金を 上書き★").toBe(0);
    if (t === "invoice_no") {
      expect(r.writes.invoice_no || 0, "★読めない 台帳の 番号を 上書き★").toBe(0);
      expect(r.no).toBe("投げた");
    }
    expect(r.out, "★画面に 既定の 請求書を 描いた★").toContain("読めなかったので");
    expect(err).toEqual([]);
  });
}

test("★全部 読める ⇒ 請求書の ボタンは 押せる（止めすぎない）★", async ({ page }) => {
  await open(page, []);
  await expect(page.locator("#btnInvPdf")).toBeEnabled();
  const out = await page.evaluate(() => document.getElementById("invoiceOut").textContent);
  expect(out).not.toContain("読めなかったので");
});

// ★★番号の 台帳が 1000行を 越えても 黙って 切れない（凍結した 番号を 上書きしない）★★ 2026-10-08（対立役 B）
//   ★わざと壊して 赤（2026-10-08 実測）★ invoice_no の 読み込みを 1回の select に 戻す ⇒ ★赤★（番号を 書き直す）
test("★台帳 1001行（目当ての 月が 1001行目）⇒ 番号は 台帳の まま・書かない★", async ({ page }) => {
  await open(page, [], true);
  const r = await page.evaluate(async (co) => {
    window.__FAKE_WRITES__ = {};
    const no = await issueInvoiceNo("2026-05", co);
    return { no: no, w: window.__FAKE_WRITES__.invoice_no || 0 };
  }, CO);

  console.log("★1001行★ " + JSON.stringify(r));
  expect(r.no, "★1000行で 切れて 台帳の 番号を 見失った★").toBe("202605-099");
  expect(r.w, "★凍結した 番号を 書き直した★").toBe(0);
});

// ★★入金を 読めない 時の 門を 1つずつ 見る★★ 2026-10-08（対立役：全部 外すと 赤 だけでは 1つずつの 守りの 証しに ならない）
//   ★わざと壊して 赤（2026-10-08 実測）★ 下の どの 関数の 門を 1つ 外しても その 1本が 赤
for (const [na, yobu, tou] of [
  ["savePay", (co) => savePay("2026-05", co, 12000), "入金の 保存"],
  ["bulkMarkPaid", () => bulkMarkPaid(), "入金の 保存"],
  ["undoPayState", (co) => undoPayState("2026-05", co, null), "入金の 保存"],
  ["previewInvoiceFromPay", (co) => previewInvoiceFromPay(null, "2026-05", co), "請求書の 確認"],
  ["exportReport（集計の Excel）", () => exportReport(), "集計の Excel の 作成"],
]) {
  test("★入金が 読めない ⇒ " + na + " は 止まる★", async ({ page }) => {
    await open(page, ["payments"]);
    const r = await page.evaluate(
      async ([src, co]) => {
        window.__FAKE_WRITES__ = {};
        const f = eval("(" + src + ")");
        await f(co);
        return {
          w: window.__FAKE_WRITES__.payments || 0,
          toast: document.getElementById("toast").textContent,
        };
      },
      [yobu.toString(), CO]
    );

    console.log("★" + na + "★ " + JSON.stringify(r));
    expect(r.w, "★読めない 入金を 書いた★").toBe(0);
    expect(r.toast, "★止めた 訳を 出していない★").toContain(tou);
    expect(r.toast).toContain("読めなかったので");
  });
}
