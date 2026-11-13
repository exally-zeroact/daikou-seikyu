import { test, expect } from "@playwright/test";
// ============================================================
// ★外から読む口の 未入金の表（minyukin）＝画面の 入金の 集計（summarize）と 全行・全列 同じ★ 2026-11-13 ⑥件B
//   設計前 taiketsu S2：口と 画面を 本物の 画面で 突き合わせる（lib の 単体だけで 緑に しない）。
//   同じ 生の 行を ①偽の 倉庫（fake-supabase）に 入れて 画面を 開き summarize(null,"") を 読む
//   ②倉庫の yomu_moto と 同じ 形に して YomuKuchi.tsukuru(moto,"minyukin") に 渡す（lib/yomu-kuchi.js を 同じ 頁に 読み込み、
//     画面が 読んだ meisai-engine.js・lib/nyukin-kai.js・lib/nyukin-ate.js を そのまま 使う＝口の api と 同じ 字） ⇒ 全行・全列・並びが 一致。
//   作り物＝繰越あり/なし・外税/内税・払い過ぎ・0円・マイナス・複数月・0件の 月（種 8つ）。
//   ★わざと壊して 赤を 見た（2026-11-13）★ 口だけ 繰越を 無視 ⇒ 赤／戻して 緑
// ============================================================
test.setTimeout(120000);

function tsukuri(tane) {
  let x = tane >>> 0; // mulberry32
  const rnd = (n) => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const KA = ["甲商事", "乙工業", "丙運輸"];
  const kaisha = KA.map((name) => ({
    name,
    carryover: rnd(2) === 1,
    taxMode: rnd(2) ? "外税" : null,
  }));
  if (!kaisha.some((c) => c.carryover)) kaisha[0].carryover = true; // 繰越の 道を 必ず 通す
  const meisai = [];
  const nyukin = [];
  let id = 0;
  KA.forEach((co) => {
    for (let m = 1; m <= 6; m++) {
      const tsuki = "2026-0" + m;
      const n = rnd(4);
      for (let i = 0; i < n; i++) {
        const kind = rnd(10);
        const amount = kind === 0 ? 0 : kind === 1 ? -(rnd(3000) + 1) : rnd(20000) + 1;
        meisai.push({ id: "m" + ++id, company: co, date: tsuki + "-1" + i, amount });
      }
      if (n > 0 && rnd(3) > 0) {
        const kind = rnd(5);
        const paid = kind === 0 ? 0 : kind === 1 ? 50000 : rnd(25000);
        nyukin.push({ id: "p" + ++id, month: tsuki, company: co, paid, paid_date: tsuki + "-28" });
      }
    }
  });
  return { meisai, kaisha, nyukin };
}

function seed(g) {
  const uid = "u_mi";
  const T = "2026-01-01T00:00:00.000Z";
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "m@x.com": { id: uid, email: "m@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "m@x.com" } },
      tables: {
        meisai: g.meisai.map((r) => ({
          id: r.id,
          user_id: uid,
          company: r.company,
          date: r.date,
          destination: "本社〜駅",
          amount: r.amount,
          note: "",
          distance: null,
          people: 1,
          name: "",
          extra: null,
          created_at: T,
          deleted_at: null,
        })),
        companies: g.kaisha.map((c, i) => ({
          id: "c" + i,
          user_id: uid,
          name: c.name,
          items: ["日付", "行き先", "金額"],
          config: Object.assign(
            {},
            c.carryover ? { carryover: true } : {},
            c.taxMode ? { taxMode: c.taxMode } : {}
          ),
          created_at: T,
          deleted_at: null,
        })),
        issuer: [],
        payments: g.nyukin.map((p) => ({
          id: p.id,
          user_id: uid,
          month: p.month,
          company: p.company,
          paid: p.paid,
          paid_date: p.paid_date,
          memo: "",
          created_at: T,
          deleted_at: null,
        })),
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

// 倉庫の yomu_moto の 形（supabase/yomu-kuchi.sql と 同じ 鍵の 名前）
function motoOf(g) {
  return {
    meisai: g.meisai.map((r) => ({
      id: r.id,
      company: r.company,
      date: r.date,
      destination: "本社〜駅",
      amount: r.amount,
      note: "",
      distance: null,
      people: 1,
      name: "",
    })),
    kaisha: g.kaisha.map((c) => ({ name: c.name, taxMode: c.taxMode, carryover: c.carryover })),
    nyukin: g.nyukin.map((p) => ({
      id: p.id,
      month: p.month,
      company: p.company,
      paid: p.paid,
      paid_date: p.paid_date,
      memo: "",
      created_at: "2026-01-01T00:00:00.000Z",
      entries: null,
    })),
    bango: [],
  };
}

for (const tane of [1, 2, 3, 4, 5, 6, 7, 8]) {
  test(`★口の minyukin＝画面の summarize（種 ${tane}）★`, async ({ page }) => {
    const g = tsukuri(tane);
    await page.route(/cdn\.jsdelivr\.net/, (r) => r.abort());
    await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
    await page.addInitScript(seed, g);
    await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 20000 });
    // ★空回り していない★＝明細・会社・入金が 画面に 読めている
    await expect.poll(() => page.evaluate(() => (window.DB || []).length)).toBe(g.meisai.length);
    const kuri = g.kaisha.filter((c) => c.carryover).map((c) => c.name);
    expect(
      await page.evaluate((ks) => ks.every((k) => MASTER[k] && MASTER[k].carryover), kuri),
      "★繰越の 設定が 画面に 読めていない★"
    ).toBe(true);

    const gamen = await page.evaluate(() => {
      const L = { unpaid: "未入金", partial: "一部入金", paid: "入金済" };
      return summarize(null, "").rows.map((x) => ({
        月: x.month,
        会社名: x.company,
        件数: x.count,
        "今月分（税込）": x.total,
        入金: x.paid,
        記録した入金: x.kiroku,
        残額: x.rem,
        状態: L[x.st],
      }));
    });
    await page.addScriptTag({ url: "/lib/yomu-kuchi.js" });
    const t = await page.evaluate((moto) => YomuKuchi.tsukuru(moto, "minyukin", "", ""), motoOf(g));
    expect(t.error).toBeUndefined();
    const kuchi = t.gyo.map((r) => {
      const o = Object.fromEntries(t.midashi.map((k, i) => [k, r[i]]));
      delete o.繰越を使う;
      return o;
    });
    expect(gamen.length).toBeGreaterThan(5);
    expect(kuchi).toEqual(gamen);
  });
}
