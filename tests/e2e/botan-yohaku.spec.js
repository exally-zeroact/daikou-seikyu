// ★字と枠の間（左右の余白）は 6px 以上★ 2026-11-20
//   入金の「全入金（記録¥…）」ボタン .pay-full-btn が padding 0 で 字が枠に付いていた（前の本番から）。
//   全画面・窓の 押せる物を 数えて、字（text node）と 枠線の内側の間が 左右とも 6px 未満の物 0。
//   ★字だけを測る★＝子の箱（見本のカード tpl-card の 幅いっぱいの絵）は 字でないので数えない。
//   ★CI は chromium だけ★＝iPhone SE（375）／13（390）／320 の幅を chromium で当てる。
//     WebKit（実 iPhone の Safari）は 手元の測り（commit しない zz-yohaku）で 数えた。
import { test, expect } from "@playwright/test";

function seed(a) {
  const pays = a.pays;
  const big = a.big;
  const uid = "u_ent";
  const mk = (id, date, amount) => ({
    id,
    user_id: uid,
    company: "繰越あり社",
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
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "k@x.com": { id: uid, email: "k@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "k@x.com" } },
      tables: {
        meisai: [mk("m1", "2026-05-06", big ? 1234567 : 37200), mk("m2", "2026-06-06", 12000)],
        companies: [
          {
            id: "c1",
            user_id: uid,
            name: "繰越あり社",
            items: ["日付", "行き先", "金額"],
            config: {
              widths: {},
              aligns: {},
              lead: "",
              tableTitle: "",
              noteSummary: false,
              carryover: true,
            },
            created_at: "2026-05-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        issuer: [
          {
            user_id: uid,
            config: { issuer: "合同会社ZEROact\nZERO代行", bank: "見本銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [],
        payments: pays.map((p, i) =>
          Object.assign(
            {
              id: "p" + i,
              user_id: uid,
              month: "2026-05",
              company: "繰越あり社",
              memo: "",
              created_at: "2026-06-10T00:00:00.000Z",
              deleted_at: null,
            },
            p
          )
        ),
      },
    })
  );
}

// 字（文字の並び）と 枠線の内側の 左右の間を 測る
const SEL =
  'button, .btn, [role="button"], input[type="button"], input[type="submit"], .chip, .dest-chip, .seg-btn, .dseg-btn';
async function yohaku(page, scr) {
  return page.evaluate(
    ([scr, SEL]) => {
      const out = [];
      const mieru = (e) => {
        const b = e.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) return false;
        for (let x = e; x; x = x.parentElement) {
          const cs = getComputedStyle(x);
          if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0)
            return false;
        }
        return true;
      };
      for (const e of document.querySelectorAll(SEL)) {
        if (!mieru(e)) continue;
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        let L = Infinity;
        let R = -Infinity;
        const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          if (!t.textContent.trim()) continue;
          if (!mieru(t.parentElement)) continue;
          const r = document.createRange();
          r.selectNodeContents(t);
          for (const q of r.getClientRects()) {
            if (q.width < 1) continue;
            L = Math.min(L, q.left);
            R = Math.max(R, q.right);
          }
        }
        if (!isFinite(L)) continue;
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        out.push({
          scr,
          cls: String(e.className || e.tagName).slice(0, 30),
          id: e.id || "",
          txt: (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 16),
          gl: Math.round((L - b.left - bl) * 10) / 10,
          gr: Math.round((b.right - br - R) * 10) / 10,
          h: Math.round(b.height),
        });
      }
      return out;
    },
    [scr, SEL]
  );
}

for (const [na, W] of [
  ["SE", 375],
  ["13", 390],
  ["320", 320],
]) {
  test("字と枠の間 6px 以上（全画面と窓・幅 " + na + "）", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: W, height: 740 });
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed, { pays: [{ paid: 0, paid_date: null }], big: false });
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
    const out = [];
    for (const scr of ["input", "list", "billing", "payment", "settings"]) {
      await page.locator(`.nav-item[data-scr="${scr}"]`).first().click();
      await page.waitForTimeout(500);
      out.push(...(await yohaku(page, scr)));
      if (scr === "settings") {
        for (const t of await page.locator("#scr-settings .seg-btn").all()) {
          await t.click();
          await page.waitForTimeout(400);
          const na2 = ((await t.textContent()) || "").trim().slice(0, 6);
          out.push(...(await yohaku(page, "settings:" + na2)));
        }
      }
    }
    for (const [mna, fn] of [
      ["窓:会社追加", () => window.openAddCompany()],
      ["窓:明細直し", () => window.openEdit("m1")],
      ["窓:入金", () => window.openPayEdit("2026-05", "繰越あり社")],
    ]) {
      await page.evaluate(fn);
      await page.waitForTimeout(500);
      out.push(...(await yohaku(page, mna)));
      await page.evaluate(() => window.closeModal && window.closeModal()).catch(() => {});
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    // 分母が 抜けて 偽の緑に ならない（全入金のボタンと 窓の中身が 数に入っている）
    expect(out.some((x) => x.cls.includes("pay-full-btn"))).toBe(true);
    expect(out.some((x) => x.scr.startsWith("窓:"))).toBe(true);
    expect(out.length).toBeGreaterThan(30);
    const tsuku = out.filter((x) => Math.min(x.gl, x.gr) < 6);
    expect(tsuku, JSON.stringify(tsuku)).toEqual([]);
  });
}

// ★入金の行は 会社名を 潰さない★（taiketsu 2026-11-20 止め＝全入金の余白で 会社名が 0〜7px・320 で 行の外へ はみ出した）
//   狭い時は「全入金」だけが 下の段の 右へ回る。会社名の箱 100px 以上・ボタンも 金額も 行の内・ページの 横はみ出し 0。
for (const [na, W] of [
  ["SE", 375],
  ["13", 390],
  ["320", 320],
]) {
  for (const big of [false, true]) {
    test("入金の行の割り付け（幅 " + na + (big ? "・7桁の額" : "") + "）", async ({ page }) => {
      await page.setViewportSize({ width: W, height: 740 });
      await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
      await page.addInitScript(seed, { pays: [{ paid: 0, paid_date: null }], big });
      await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
      await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
      await page.locator('.nav-item[data-scr="payment"]').first().click();
      await expect(page.locator(".pay-full-btn").first()).toBeVisible();
      const r = await page.evaluate(() => {
        const rows = [];
        for (const it of document.querySelectorAll(".pay-item")) {
          const btn = it.querySelector(".pay-full-btn");
          if (!btn) continue;
          const ib = it.getBoundingClientRect();
          const cs = getComputedStyle(it);
          const inR = ib.right - (parseFloat(cs.paddingRight) || 0) + 0.5;
          const co = it.querySelector(".pay-co").getBoundingClientRect();
          const am = it.querySelector(".pay-right").getBoundingClientRect();
          const bb = btn.getBoundingClientRect();
          rows.push({
            co: Math.round(co.width),
            btnOut: Math.round(bb.right - inR),
            amtOut: Math.round(am.right - inR),
            btnH: Math.round(bb.height),
          });
        }
        return { rows, over: document.documentElement.scrollWidth - window.innerWidth };
      });
      expect(r.rows.length, JSON.stringify(r)).toBeGreaterThan(0);
      for (const x of r.rows) {
        expect(x.co, JSON.stringify(r)).toBeGreaterThanOrEqual(100);
        expect(x.btnOut, JSON.stringify(r)).toBeLessThanOrEqual(0);
        expect(x.amtOut, JSON.stringify(r)).toBeLessThanOrEqual(0);
        expect(x.btnH, JSON.stringify(r)).toBeLessThanOrEqual(34.5);
      }
      expect(r.over, JSON.stringify(r)).toBeLessThanOrEqual(0);
    });
  }
}
