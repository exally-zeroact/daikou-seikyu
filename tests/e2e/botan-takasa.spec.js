// ★ボタン・チップ・入力枠の 見える高さは 字に合わせる★ 2026-11-19（司さん「どのアプリでも何回もゆうてる」）
//   決まり＝高さ÷字の大きさ 2.5〜2.85／12px の字→32px・13px の字→36px・14px の字→36〜38px・16px の字→44px（主ボタンは48まで）。
//   押す所 44px は 見えない ::after で 縦に広げる（見える箱を 大きくしない）。
//   ① 全画面・窓の 押せる物と 入力枠を 数えて 外れ 0
//   ② 見える箱の 内側を 押すと 自分に 当たる（::after の 広げが 隣・上の label を 奪わない）
//   外す物（字の高さの決まりの外）＝下の帯 nav-item（絵文字＋字の2段）・行の高さいっぱいの消し swipe-del・
//     切り替えの丸 itb-switch（今は描く先が無い）・textarea・見本のカード tpl-card・320px で 2行に折れた物（375／390 の 2行は 外れ）。
//     丸い × entry-del／dnd-del／dkfix-x は 高さの決まりの外（見える丸 26px）＝押す所 44px 角を ③ で 数える。
//   ③ 広げた押す所（::after）の 内側を押しても 自分に当たる（下の物に 取られない・隣と 重ならない）
//   ★CI は chromium だけ★＝ここは iPhone SE（375）／13（390）／320 の幅を chromium で 当てる。
//     WebKit（実 iPhone の Safari）は 手元の測り（commit しない zz-hakaru）で 数えた。
import { test, expect } from "@playwright/test";

const UID = "u_ent";
function seed() {
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
        meisai: [mk("m1", "2026-05-06", 37200), mk("m2", "2026-06-06", 12000)],
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
            config: { issuer: "見本の会社\n見本の店", bank: "見本銀行" },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        invoices: [],
        invoice_no: [],
        payments: [
          {
            id: "p0",
            user_id: uid,
            month: "2026-05",
            company: "繰越あり社",
            memo: "",
            paid: 0,
            paid_date: null,
            created_at: "2026-06-10T00:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    })
  );
}

const OSU =
  'button, .btn, .chip, .itb-chip, .dest-chip, [role="button"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]):not([type="range"]), select, label';
const SOTO = ["nav-item", "swipe-del", "itb-switch"];
const MARU = ["entry-del", "dnd-del", "dkfix-x"]; // 丸い ×＝高さの決まりの外・押す所は 44px 角

// 画面の中の 押せる物を 数える（高さ÷字・2行か・見える箱の内側を押して 自分に当たるか）
async function kazoeru(page, basho, ne = "body") {
  return page.evaluate(
    ([basho, OSU, SOTO, MARU, ne]) => {
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
      const gyou = (e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        const tops = new Set();
        for (const q of r.getClientRects()) if (q.height > 4) tops.add(Math.round(q.top / 4));
        return tops.size;
      };
      const root = document.querySelector(ne);
      for (const e of root.querySelectorAll(OSU)) {
        // 窓が開いている時の 後ろの画面は 数えない（窓の中だけ）
        if (ne === "body" && e.closest("#modalOv")) continue;
        if (!mieru(e)) continue;
        const cls = String(e.className || "");
        if (SOTO.some((c) => cls.split(/\s+/).includes(c))) continue;
        if (e.closest(".nav-item, .swipe-del")) continue;
        e.scrollIntoView({ block: "center", inline: "center" });
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        const fs = parseFloat(cs.fontSize);
        const isLabel = e.tagName === "LABEL";
        const waku = /^(INPUT|SELECT)$/.test(e.tagName) && !/button|submit/.test(e.type);
        const kiji = (e.textContent || e.value || e.placeholder || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 14);
        const nigyou = !waku && !isLabel ? gyou(e) > 1 : false;
        const maru = MARU.some((c) => cls.split(/\s+/).includes(c));
        // ② 見える箱の 内側（4辺の真ん中から2px・真ん中）を押すと 自分（か 中の物）に当たるか
        //    ★角は 丸め（border-radius）で 箱の外になる＝角は押さない★
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        const pts = [
          [cx, cy],
          [cx, b.top + 2],
          [cx, b.bottom - 2],
          [b.left + 2, cy],
          [b.right - 2, cy],
        ];
        let ubawareta = null;
        for (const [x, y] of pts) {
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const h = document.elementFromPoint(x, y);
          if (!h || h === e || e.contains(h)) continue;
          // 上に乗っている 固定の帯（下の帯・トースト）は この試験の外
          if (h.closest(".bottom-nav, nav, .toast, .undo-toast, header")) continue;
          // label の中の入力を押した＝label の物
          if (isLabel && e.control && (h === e.control || e.control.contains(h))) continue;
          ubawareta =
            (h.className || h.tagName) + "「" + (h.textContent || "").trim().slice(0, 10) + "」";
          break;
        }
        // ③ 広げた押す所の 内側（::after の 上下の端から1px・丸い × は 44px 角の 4辺から1px）を押すと 自分に当たるか
        let hirogari = null;
        let ue = 0;
        let shita = 0;
        let yoko = 0;
        //    ★CSS の値から 推さない★＝見える箱の 真ん中から 縦 44px（丸い × は 44px 角）の 内側を 直に押す
        if (!waku && !isLabel) {
          ue = shita = Math.max(0, (44 - b.height) / 2);
          if (maru) yoko = Math.max(0, (44 - b.width) / 2);
        }
        if (ue || shita || yoko) {
          const hp = [
            [cx, b.top - ue + 1],
            [cx, b.bottom + shita - 1],
          ];
          if (yoko) hp.push([b.left - yoko + 1, cy], [b.right + yoko - 1, cy]);
          for (const [x, y] of hp) {
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const h = document.elementFromPoint(x, y);
            if (!h || h === e || e.contains(h)) continue;
            if (h.closest(".bottom-nav, nav, .toast, .undo-toast, header")) continue;
            hirogari =
              (h.className || h.tagName) + "「" + (h.textContent || "").trim().slice(0, 10) + "」";
            break;
          }
        }
        out.push({
          basho,
          vw: innerWidth,
          maru,
          hirogari,
          tag: e.tagName,
          cls: cls.slice(0, 40),
          kiji,
          fs,
          h: Math.round(b.height * 10) / 10,
          hi: Math.round((b.height / fs) * 100) / 100,
          waku,
          isLabel,
          nigyou,
          ubawareta,
        });
      }
      return out;
    },
    [basho, OSU, SOTO, MARU, ne]
  );
}

// 高さの決まり（12〜13px は 32〜37 も合格・主ボタン 16px は 48 まで）
function hazure(r) {
  if (r.isLabel || r.maru) return false;
  // 見本の カード（tpl-card）は 中に 絵の在る 箱＝字の高さの決まりの外（押す所の 試験は する）
  if (/\btpl-card\b/.test(r.cls)) return false;
  // 2行に折れて よいのは 320px の幅だけ（逃がし）。375／390 で 2行は 外れ
  if (r.nigyou) return r.vw > 320;
  if (!r.fs) return false;
  if (r.fs <= 12.5 && r.h >= 31.5 && r.h <= 34.5) return false;
  if (r.fs > 12.5 && r.fs <= 13.5 && r.h >= 31.5 && r.h <= 37.5) return false;
  if (r.fs >= 15.5 && /btn-primary/.test(r.cls) && r.h <= 48.5 && r.h >= 40) return false;
  return !(r.hi >= 2.5 && r.hi <= 2.85);
}

async function zenbu(page) {
  const out = [];
  const nav = async (scr) => {
    await page.locator(`.nav-item[data-scr="${scr}"]`).first().click();
    await page.waitForTimeout(300);
  };
  await nav("input");
  await page.selectOption("#inputCompany", "繰越あり社");
  await page.waitForTimeout(300);
  out.push(...(await kazoeru(page, "入力（会社を選んだ後）")));
  await nav("list");
  out.push(...(await kazoeru(page, "一覧")));
  await nav("billing");
  out.push(...(await kazoeru(page, "請求書")));
  // 発行の門の帯（メーターの料金が未定の明細がある時だけ出る）＝門の判じだけ 差し替えて 本物の描きで出す
  await page.evaluate(() => {
    const moto = window.Nijuu.hakkoMae;
    window.Nijuu.hakkoMae = () => ({
      mitei: [{ 会社名: "繰越あり社", 日付: "2026-05-06", 行き先: "現場" }],
    });
    try {
      window.hakkoMon("2026-05", ["繰越あり社"]);
    } finally {
      window.Nijuu.hakkoMae = moto;
    }
  });
  await expect(page.locator("#hakkoObi .hakko-obi-x")).toBeVisible();
  out.push(...(await kazoeru(page, "請求書（発行の門の帯）")));
  await page.evaluate(() => window.hakkoObiKesu());
  await page.evaluate(() => window.showBillingSeg("report"));
  await page.waitForTimeout(300);
  out.push(...(await kazoeru(page, "集計")));
  await nav("payment");
  out.push(...(await kazoeru(page, "入金")));
  await nav("settings");
  for (const s of ["master", "issuer", "template", "yomu"]) {
    await page.evaluate((s) => window.showSettingsSeg(s), s);
    await page.waitForTimeout(300);
    out.push(...(await kazoeru(page, "設定:" + s)));
  }
  // 会社マスタで 会社を開いた後（項目のチップ・寄せ・見本）
  await page.evaluate(() => window.showSettingsSeg("master"));
  await page.locator('[onclick^="toggleMasterBody"]').first().click();
  await expect(page.locator(".master-co-body.open .chip").first()).toBeVisible();
  out.push(...(await kazoeru(page, "設定:master（会社を開いた）")));
  const mado = [
    ["窓:会社追加", () => window.openAddCompany()],
    ["窓:明細直し", () => window.openEdit("m1")],
    ["窓:入金", () => window.openPayEdit("2026-05", "繰越あり社")],
  ];
  for (const [na, fn] of mado) {
    await page.evaluate(fn);
    await page.waitForTimeout(400);
    // 窓が開いている時は 窓の中だけ数える（後ろの画面は 押せない）
    await expect(page.locator("#modalOv.open")).toBeVisible();
    out.push(...(await kazoeru(page, na, "#modalOv")));
    await page.evaluate(() => window.closeModal && window.closeModal()).catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  }
  return out;
}

for (const [na, w, h] of [
  ["iPhone SE", 375, 667],
  ["iPhone 13", 390, 844],
  ["320", 320, 640],
]) {
  test.describe("ボタンの高さ " + na, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true });
    test("全画面の押せる物の高さが字に合う・見える箱の内側は自分に当たる", async ({ page }) => {
      test.setTimeout(90000);
      await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
      await page.addInitScript(seed);
      await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
      await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
      const rows = await zenbu(page);
      if (process.env.TAKASA_LOG) console.log("TAKASA" + w + " " + JSON.stringify(rows));
      // 分母が 落ちていないか（どれかの画面で 0 なら 測れていない）
      const basho = new Set(rows.map((r) => r.basho));
      expect([...basho].length, [...basho].join(",")).toBeGreaterThanOrEqual(14);
      expect(rows.length).toBeGreaterThan(60);
      const takasa = rows
        .filter(hazure)
        .map((r) => `${r.basho} ${r.cls || r.tag}「${r.kiji}」${r.fs}px→${r.h}px（${r.hi}）`);
      expect(takasa, "高さが字に合わない").toEqual([]);
      const ubai = rows
        .filter((r) => r.ubawareta)
        .map((r) => `${r.basho} ${r.cls || r.tag}「${r.kiji}」を押すと ${r.ubawareta}`);
      expect(ubai, "見える箱の内側が 他に取られる").toEqual([]);
      const hiro = rows
        .filter((r) => r.hirogari)
        .map((r) => `${r.basho} ${r.cls || r.tag}「${r.kiji}」の 広げを押すと ${r.hirogari}`);
      expect(hiro, "広げた押す所が 他に取られる").toEqual([]);
      // 丸い × も 数えている（分母）
      expect(rows.filter((r) => r.maru).length, "丸い × が 1つも 測れていない").toBeGreaterThan(0);
    });
  });
}

// ③ 押す所は 見えない広げで 縦44px 以上（見える箱が低い物）
test.describe("押す所の広げ", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("低い押せる物の ::after は 縦44px 以上", async ({ page }) => {
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
    await page.locator('.nav-item[data-scr="settings"]').first().click();
    const r = await page.evaluate(() => {
      const out = [];
      for (const sel of [".seg-btn", ".btn-ghost", ".btn-sm", ".btn-primary"]) {
        const e = [...document.querySelectorAll(sel)].find(
          (x) => x.getBoundingClientRect().height > 0
        );
        if (!e) continue;
        const a = getComputedStyle(e, "::after");
        // 広げの 本当の高さ（top/bottom の値から 引くと 枠線の分 ずれて 42 を 44 と 読んだ）
        const h = parseFloat(a.height);
        out.push({ sel, h: Math.round(h), pos: getComputedStyle(e).position, content: a.content });
      }
      return out;
    });
    expect(r.length).toBeGreaterThanOrEqual(3);
    for (const x of r) {
      expect(x.content, x.sel).toBe('""');
      expect(x.pos, x.sel).toBe("relative");
      expect(x.h, x.sel).toBeGreaterThanOrEqual(44);
    }
  });
});

// ④ ログイン画面（共通の部品 exally-login.js）も 字に合わせる＝16px の枠→44・14px のボタン→38・押す所は ::after で 44
test.describe("ログイン画面の高さ", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });
  test("ログインの枠とボタンは字に合い・押す所は縦44px以上", async ({ page }) => {
    // ログインしていない形（login-shared.spec.js と同じ出し方）
    await page.route(/cdn.jsdelivr.net/, (r) => r.abort());
    await page.addInitScript(() => (window.__FAKE_NO_SESSION__ = true));
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "load" });
    await expect(page.locator("#loginOv")).toHaveClass(/open/, { timeout: 20000 });
    const r = await page.evaluate(() =>
      ["#loginEmail", "#loginPass", "#btnLogin", "#btnSignup"].map((sel) => {
        const e = document.querySelector(sel);
        const h = e.getBoundingClientRect().height;
        const a = getComputedStyle(e, "::after");
        const oshi = a.content === "none" ? h : h - parseFloat(a.top) - parseFloat(a.bottom);
        return {
          sel,
          fs: parseFloat(getComputedStyle(e).fontSize),
          h: Math.round(h * 10) / 10,
          oshi: Math.round(oshi),
        };
      })
    );
    for (const x of r) {
      const hi = x.h / x.fs;
      expect(hi, `${x.sel} ${x.fs}px→${x.h}px`).toBeGreaterThanOrEqual(2.5);
      expect(hi, `${x.sel} ${x.fs}px→${x.h}px`).toBeLessThanOrEqual(2.85);
      expect(x.oshi, x.sel + " の押す所").toBeGreaterThanOrEqual(38);
    }
    // ボタンは ::after で 44 まで 押せる
    for (const x of r.filter((y) => /btn/.test(y.sel)))
      expect(x.oshi, x.sel).toBeGreaterThanOrEqual(44);
  });
});
