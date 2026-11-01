import { test, expect } from "@playwright/test";
// ============================================================
// 入金の 画面に「出した 後に 明細が 変わりました」の 警告を 出さない 2026-11-01
//
//   司さん「修正したら反映されるんが普通やろが」「請求書を作り直して下さいってなんど」
//   ＝警告は 全部 消す（10-14〜11-01 は 出していた）。全社まとめの 写し（警告 専用）も 書かない。
//   1社の PDF の 控え（その 月を 作ったか＝繰越・番号の 材料）は 残す。書けない 時は 1回 自動で やり直し、
//   それでも 書けない 時だけ 害を 知らせる（利用者に 何かを させる 字は 出さない）。
//
//   ★わざと壊して 赤に なるのを 見る★（消す 前の 5c8332a で 回す）
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

const KURI = "繰越の試し株式会社";
const KEIKOKU =
  /出した後に明細が変わりました|額が違います|比べられません|で発行済み|明細を読めませんでした|明細を残せませんでした/;
const gyouOf = (page, co) =>
  page.locator("#payBody .pay-row, #payBody > div").filter({ hasText: co }).first();

async function tsukuru(page, co) {
  await page.locator('.nav-item[data-scr="billing"]').click();
  await page.selectOption("#invMonth", "2026-05");
  await page.selectOption("#invCompany", co);
}
async function dasu(page, opt) {
  return page.evaluate(async (o) => {
    const mae = JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.invoices.length;
    // 控えの insert を 試した 回数を 数え、最初の o.fail 回 だけ 落とす（時間で 外すと 遅い 機械で
    //   1回目が もう 書けて、やり直しを 壊しても 緑に なる・本番前の 対立役 注1）
    let tameshita = 0;
    const moto = SB.from.bind(SB);
    SB.from = function (t) {
      const q = moto(t);
      if (t !== "invoices") return q;
      const ins = q.insert.bind(q);
      q.insert = function (v) {
        tameshita++;
        if (tameshita <= (o.fail || 0))
          return Promise.resolve({ data: null, error: { message: "通信の 試し" } });
        return ins(v);
      };
      return q;
    };
    const x = await _buildInvoiceBytes();
    if (x) nokosenaiShiraseru(x);
    return {
      ok: !!(x && x.bytes),
      fname: x && x.fname,
      nokosenai: x && x.nokosenai,
      toast: document.getElementById("toast").textContent,
      fueta: JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.invoices.length - mae,
      kaita: (window.__FAKE_WRITES__ || {}).invoices || 0,
      tameshita,
    };
  }, opt || {});
}

test("出した 後に 明細を 直した＝入金の 一覧にも 窓にも 警告の 字を 出さない（額は 今の 明細）", async ({
  page,
}) => {
  const gyou = await hiraku(page, {
    ima: [12000, 4000],
    dashita: [12000, 3400],
    total: 15400,
    bangou: true,
  });
  await expect(gyou).toContainText("¥16,000");
  await expect(gyou).not.toContainText(KEIKOKU);
  await expect(page.locator(".pay-sagaku")).toHaveCount(0);
  await gyou.click();
  await expect(page.locator("#modalBody")).toContainText("請求額 ¥16,000");
  await expect(page.locator("#modalBody")).not.toContainText(KEIKOKU);
});

test("全社まとめの PDF＝控え（invoices）を 1行も 書かない・繰越の 材料は 前の まま", async ({
  page,
}) => {
  await hiraku(page, { ima: [12000, 4000], dashita: [12000, 3400], total: 15400, kuri: true });
  await tsukuru(page, "");
  const r = await dasu(page);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(r.fname).toContain("全社");
  expect(r.nokosenai).toEqual([]);
  expect(r.kaita, "全社で invoices に 書いた").toBe(0);
  expect(r.tameshita, "全社で invoices に 書こうとした").toBe(0);
  expect(r.fueta, "全社で invoices の 行が 増えた").toBe(0);
  const zai = await page.evaluate(() => INVOICES.map((x) => x.company + ":" + x.total).sort());
  expect(zai).toEqual([CO + ":15400", KURI + ":15400"]);
  await page.locator('.nav-item[data-scr="payment"]').click();
  await expect(gyouOf(page, KURI)).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#payBody")).not.toContainText(KEIKOKU);
});

test("1社の PDF＝控えを 1行 積む（その 月を 作った 証し）・知らせは 出さない", async ({ page }) => {
  await hiraku(page, { ima: [12000, 4000] });
  await tsukuru(page, CO);
  const r = await dasu(page);
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(r.nokosenai).toEqual([]);
  expect(r.kaita).toBe(1);
  expect(r.fueta).toBe(1);
  expect(r.tameshita, "書けたのに やり直した").toBe(1);
  expect(r.toast).not.toContain("控えを残せませんでした");
});

test("控えを 書けない（やり直しても）＝害を 知らせる・作り直しを 求めない", async ({ page }) => {
  await hiraku(page, { ima: [12000, 4000] });
  await tsukuru(page, CO);
  const r = await dasu(page, { fail: 99 });
  expect(r.ok, "PDF は 出る").toBe(true);
  expect(r.tameshita, "1回 やり直していない").toBe(2);
  expect(r.nokosenai).toEqual([CO]);
  expect(r.fueta).toBe(0);
  expect(r.toast).toContain("PDFは出来ましたが、控えを残せませんでした（通信）：" + CO);
  expect(r.toast).toContain("次の月の請求書の前回繰越が「読めません」になります");
  expect(r.toast).not.toMatch(/もう一度|作り直|出し直/);
});

test("控えの 1回目だけ 書けない＝自動で やり直して 残る（知らせは 出さない）", async ({ page }) => {
  await hiraku(page, { ima: [12000, 4000] });
  await tsukuru(page, CO);
  const r = await dasu(page, { fail: 1 });
  expect(r.ok).toBe(true);
  expect(r.tameshita, "やり直していない").toBe(2);
  expect(r.nokosenai).toEqual([]);
  expect(r.fueta).toBe(1);
  expect(r.toast).not.toContain("控えを残せませんでした");
});
