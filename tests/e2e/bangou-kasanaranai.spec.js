import { test, expect } from "@playwright/test";

// ============================================================
// ★★請求書番号は 重ならない★★ 2026-10-08（司さん「重なったらいかんやろ、そもそもなんの番号ど」）
//   番号＝紙の 右上の「No. 2026-05-03」（その 月の 何通目か）
//   ・台帳（invoice_no）に 在る 番号は 動かさない
//   ・無い 時は 紙を 作る 前に その 月で 空いている 一番 小さい 番号を 倉庫の 台帳に 書いてから 使う
//     空きは 台帳＋控え（invoices）で 数える。倉庫の 一意 (user_id, invoice_no) に ぶつかれば 次の 空き
//   ・書けなければ 紙を 作らない
//   ・見るだけの 所は まだ 出していない 番号を 出さない
//   ★偽の 倉庫に 本番と 同じ 一意を 入れた★（tests/e2e/fake-supabase.js UNIQ）
//
//   ★わざと壊して 赤（2026-10-08 実測）★ 各 試験の 頭に 書く
// ============================================================

const UID = "u_ban";
const M = "2026-05";

function seed(arg) {
  const uid = "u_ban";
  const meisai = [];
  ["A社", "B社"].forEach((co, i) => {
    meisai.push({
      id: "m" + i,
      user_id: uid,
      company: co,
      date: "2026-05-0" + (i + 3),
      destination: "本社〜北浜",
      amount: 12000,
      note: "",
      distance: null,
      people: 1,
      name: "",
      extra: null,
      created_at: "2026-05-01T00:00:00.000Z",
      deleted_at: null,
    });
  });
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "b@x.com": { id: uid, email: "b@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "b@x.com" } },
      tables: {
        meisai: meisai,
        companies: ["A社", "B社"].map((co, i) => ({
          id: "c" + i,
          user_id: uid,
          name: co,
          items: ["日付", "行き先", "金額"],
          config: {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        })),
        issuer: [
          {
            user_id: uid,
            config: { issuer: "試験の 会社\n登録番号：T1234567890123", bank: "試験 銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: (arg && arg.invoices) || [],
        invoice_no: (arg && arg.invoice_no) || [],
        payments: [],
      },
    })
  );
}

async function open(page, arg) {
  await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(() => {
    window.__FAKE_WRITES__ = {};
  });
  await page.addInitScript(`(${seed.toString()})(${JSON.stringify(arg || {})});`);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", M);
  await expect(page.locator("#invoiceOut.inv-loading")).toHaveCount(0, { timeout: 60000 });
}

const daicho = (page) =>
  page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    return (db.tables.invoice_no || []).map((r) => [r.month, r.company, r.invoice_no]);
  });

const ledger = (co, no) => ({ user_id: UID, month: M, company: co, invoice_no: no });
const hikae = (co, no) => ({
  id: "iv-" + co,
  user_id: UID,
  month: M,
  company: co,
  invoice_no: no,
  total: 1000,
  issued_at: "2026-06-01T00:00:00.000Z",
  deleted_at: null,
});

// ★わざと壊して 赤（2026-10-08 実測）★ tsukattaBangou から 控え（INVOICES）を 外す ⇒ ★赤★（2026-05-02 を 振る）
test("★空き番号＝台帳と 控えの 両方で 使われていない 一番 小さい 番号・台帳に 書く★", async ({
  page,
}) => {
  await open(page, {
    invoice_no: [ledger("前に 消した 会社", "2026-05-01")],
    invoices: [hikae("別の 会社", "2026-05-02")],
  });
  const no = await page.evaluate(() => issueInvoiceNo("2026-05", "A社"));
  expect(no).toBe("2026-05-03");
  expect(await daicho(page)).toContainEqual([M, "A社", "2026-05-03"]);
});

// ★わざと壊して 赤（2026-10-08 実測）★ 控えの 番号を 引き継ぐ 所で 他の 会社の 物か 見ない ⇒ ★赤★（2026-05-01 が 2社に）
test("★控えに 在る 番号は 引き継ぐ・ただし 台帳で 他の 会社の 番号なら 引き継がない（西栄工業の 形）★", async ({
  page,
}) => {
  await open(page, {
    invoice_no: [ledger("B社", "2026-05-01")],
    invoices: [hikae("A社", "2026-05-01")],
  });
  const a = await page.evaluate(() => issueInvoiceNo("2026-05", "A社"));
  expect(a, "★別の 会社の 番号を 引き継いだ★").toBe("2026-05-02");

  await open(page, { invoices: [hikae("A社", "2026-05-04")] });
  const b = await page.evaluate(() => issueInvoiceNo("2026-05", "A社"));
  expect(b, "★控えの 番号を 引き継がなかった★").toBe("2026-05-04");
});

// ★★2台 同時：開いた 後に 他の 端末が 書いた 番号を 拾う・倉庫の 一意に ぶつかれば 次の 空き★★
//   ★わざと壊して 赤（2026-10-08 実測）★ daichoYominaoshi を 呼ばない ＋ 23505 で やり直さない ⇒ ★赤★
test("★2台 同時 ⇒ 番号は 重ならない★", async ({ page }) => {
  await open(page, {});
  const r = await page.evaluate(async () => {
    const tasu = (row) => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      db.tables.invoice_no.push(row);
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    };
    // ①開いた 後に 他の 端末が 2026-05-01 を 書いた
    tasu({
      user_id: "u_ban",
      month: "2026-05",
      company: "他の 端末の 会社",
      invoice_no: "2026-05-01",
    });
    const a = await issueInvoiceNo("2026-05", "A社");
    // ②読み直した 直後・書く 直前に 他の 端末が 次の 空き（2026-05-03）を 書いた
    const motoFrom = SB.from.bind(SB);
    let ichido = false;
    SB.from = function (t) {
      const q = motoFrom(t);
      if (t === "invoice_no" && !ichido) {
        const motoIns = q.insert;
        q.insert = function (row) {
          ichido = true;
          tasu({
            user_id: "u_ban",
            month: "2026-05",
            company: "割り込んだ 会社",
            invoice_no: row.invoice_no,
          });
          return motoIns.call(q, row);
        };
      }
      return q;
    };
    let b;
    try {
      b = await issueInvoiceNo("2026-05", "B社");
    } finally {
      SB.from = motoFrom;
    }
    return { a: a, b: b };
  });
  expect(r.a, "★他の 端末の 番号と 重なった★").toBe("2026-05-02");
  expect(r.b, "★割り込まれた 番号と 重なった★").toBe("2026-05-04");
  const nos = (await daicho(page)).map((x) => x[2]);
  expect(new Set(nos).size, "★台帳の 中で 番号が 重なった★ " + JSON.stringify(nos)).toBe(
    nos.length
  );
});

// ★★台帳に 書けない ⇒ 紙を 作らない・控えも 残さない・知らせる★★
//   ★わざと壊して 赤（2026-10-08 実測）★ issueInvoiceNo の「書けなければ 投げる」を 外す ⇒ ★赤★（番号の 無い 紙）
for (const co of ["A社", ""]) {
  test("★台帳に 書けない（" + (co || "全社") + "）⇒ 紙を 作らない★", async ({ page }) => {
    await open(page, {});
    await page.selectOption("#invCompany", co);
    const r = await page.evaluate(async () => {
      window.__FAKE_FAIL_WRITES__ = ["invoice_no"];
      window.__FAKE_WRITES__ = {};
      const bytes = await _buildInvoiceBytes();
      return {
        bytes: bytes,
        toast: document.getElementById("toast").textContent,
        ivs: window.__FAKE_WRITES__.invoices || 0,
      };
    });
    expect(r.bytes).toBeNull();
    expect(r.toast).toContain("請求番号を 控えられませんでした");
    expect(r.ivs, "★控えを 残した★").toBe(0);
    expect(await daicho(page)).toEqual([]);
  });
}

// ★★全社 PDF も 描く 前に 全部の 会社の 番号を 台帳に 書く（重ならない）★★
//   ★わざと壊して 赤（2026-10-08 実測）★ 全社の 枝で issueInvoiceNo を 呼ばない ⇒ ★赤★（台帳 0行）
test("★全社 ⇒ 2社とも 別の 番号で 台帳に 書く★", async ({ page }) => {
  await open(page, { invoice_no: [ledger("B社", "2026-05-01")] });
  await page.selectOption("#invCompany", "");
  // PDF の 部品（CDN）は 試験では 読まない＝描く 所で 落ちても よい。番号は 描く 前に 決まる
  await page.evaluate(() => _buildInvoiceBytes().catch(() => null));
  const d = await daicho(page);
  expect(d).toContainEqual([M, "B社", "2026-05-01"]);
  expect(d).toContainEqual([M, "A社", "2026-05-02"]);
});

// ★★見るだけの 所は まだ 出していない 番号を 出さない・書かない★★
//   ★わざと壊して 赤（2026-10-08 実測）★ invoiceNoPeek を 前の 計算に 戻す ⇒ ★赤★
test("★見るだけ ⇒ 未発行の 番号は 空・台帳に 書かない★", async ({ page }) => {
  await open(page, { invoice_no: [ledger("B社", "2026-05-01")] });
  const r = await page.evaluate(() => ({
    a: invoiceNoPeek("2026-05", "A社"),
    af: invoiceNoFrozen("2026-05", "A社"),
    b: invoiceNoPeek("2026-05", "B社"),
    w: window.__FAKE_WRITES__.invoice_no || 0,
  }));
  // 見るだけの 紙は「未発行」（空だと 番号の 無い 紙に 見える）・紙を 作る 時の 番号は 空（台帳に 無い）
  expect(r).toEqual({ a: "未発行", af: "", b: "2026-05-01", w: 0 });
});

// ★★会社名を 変えても 同じ 請求の 番号は 変わらない★★
//   ★わざと壊して 赤（2026-10-08 実測）★ renameCompany の 台帳の 名前変えを 外す ⇒ ★赤★（新しい 番号）
test("★会社名を 変える ⇒ 台帳の 番号も 付いていく★", async ({ page }) => {
  await open(page, { invoice_no: [ledger("A社", "2026-05-01")] });
  await page.evaluate(() => renameCompany("A社", "A商事"));
  expect(await daicho(page)).toContainEqual([M, "A商事", "2026-05-01"]);
  const no = await page.evaluate(() => issueInvoiceNo("2026-05", "A商事"));
  expect(no).toBe("2026-05-01");
});

// ★★会社名の 変更が 途中で 落ちたら 台帳の 名前も 戻す（同じ 請求に 番号が 2つ に ならない）★★ 2026-10-08 対立役
//   ★わざと壊して 赤（2026-10-08 実測）★ 落ちた 時の 台帳の 戻しを 外す ⇒ ★赤★（台帳だけ 新しい 名前）
test("★会社名の 変更が 途中で 落ちる ⇒ 台帳は 元の 名前の まま★", async ({ page }) => {
  await open(page, { invoice_no: [ledger("A社", "2026-05-01")] });
  await page.evaluate(async () => {
    window.__FAKE_FAIL_WRITES__ = ["payments"];
    await renameCompany("A社", "A商事");
    window.__FAKE_FAIL_WRITES__ = [];
  });
  const d = await daicho(page);
  expect(d, "★台帳だけ 新しい 名前に なった★").toContainEqual([M, "A社", "2026-05-01"]);
  expect(d.map((x) => x[1])).not.toContain("A商事");
  const mei = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai.map((r) => r.company)
  );
  expect(mei, "★明細の 名前が 戻って いない★").not.toContain("A商事");
  const no = await page.evaluate(() => issueInvoiceNo("2026-05", "A社"));
  expect(no, "★同じ 請求に 2つ目の 番号★").toBe("2026-05-01");
});
