import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// ★直しの 履歴（⑦ 3押し目・2026-11-09）★ 設計＝sekkei_7_gamen_2026-11-09.md v3
//   ・運転手が 最後に 直した 明細の 行は 赤（司さん 10-21「運転手が 直したやつは 明細に 赤」「事務所が 後で 直したら 消す」）
//   ・直しの ある 行に「直し n」の 札（n＝赤の 判じと 同じ 物だけ＝会社名だけ・自動・直接・足した は 数えない）
//   ・一覧の 上に 但し書き「運転手が修正したものは赤になります」
//   ・編集の 窓・入金の 窓の 下に「直しの履歴」（いつ・誰・何・前→後）
//   ・表が 無い（本番の 倉庫は まだ 無い）＝何も 出さない／読めない＝小さく 一言
//   ★表示だけ★＝お金・並び・出す 前の 見張りは 変えない。
//
//   ★倉庫には 読みも書きもしない★（偽の倉庫 fake-supabase.js・倉庫の 住所へ 出る 通信は 止めて 数える＝0）
// ============================================================

test.setTimeout(120000);
test.use({ timezoneId: "Asia/Tokyo" });

const CO1 = "株式会社 標様本";
const LABELS = [{ company_id: "k1", device_id: "d 1", label: "1466", sort_order: 1 }];
const DEV = "device:" + encodeURIComponent("d 1");

// 履歴（倉庫の 仕掛けが 積む 形＝tbl は 部屋の 名 付き）
const RIREKI = [
  // m0：運転手が 金額を 直した＝赤・直し 1
  {
    id: 1,
    at: "2026-11-09T01:05:00Z",
    tbl: "daikou.meisai",
    op: "U",
    pk: { id: "m0" },
    dare_shu: "device",
    dare: DEV,
    kawatta: ["amount"],
    mae: { amount: 1000 },
    ato: { amount: 1200 },
  },
  // m1：運転手が 直した 後に 事務所が 直した＝赤は 消える・直し 2
  {
    id: 2,
    at: "2026-11-09T02:00:00Z",
    tbl: "daikou.meisai",
    op: "U",
    pk: { id: "m1" },
    dare_shu: "device",
    dare: DEV,
    kawatta: ["destination"],
    mae: { destination: "今治市旧町" },
    ato: { destination: "今治市東鳥生町" },
  },
  {
    id: 3,
    at: "2026-11-09T03:00:00Z",
    tbl: "daikou.meisai",
    op: "U",
    pk: { id: "m1" },
    dare_shu: "jimusho",
    dare: "jimusho:x",
    kawatta: ["amount"],
    mae: { amount: 11000 },
    ato: { amount: 12000 },
  },
  // m2：事務所の 会社名だけの 変え＋自動の 埋め戻し＝札も 赤も 無し（窓には 出す）
  {
    id: 4,
    at: "2026-11-09T04:00:00Z",
    tbl: "daikou.meisai",
    op: "U",
    pk: { id: "m2" },
    dare_shu: "jimusho",
    dare: "jimusho:x",
    kawatta: ["company"],
    mae: { company: "旧社" },
    ato: { company: CO1 },
  },
  {
    id: 5,
    at: "2026-11-09T04:10:00Z",
    tbl: "daikou.meisai",
    op: "U",
    pk: { id: "m2" },
    dare_shu: "kansu",
    dare: "kansu",
    kawatta: ["note"],
    mae: { note: "" },
    ato: { note: "自動" },
  },
  // m4：足した（I）だけ＝読まない（op を 絞る）＝窓にも 出ない
  {
    id: 6,
    at: "2026-11-09T05:00:00Z",
    tbl: "daikou.meisai",
    op: "I",
    pk: { id: "m4" },
    dare_shu: "device",
    dare: DEV,
    kawatta: null,
    mae: null,
    ato: { amount: 4800 },
  },
  // 入金 p0：事務所が 入金額を 直した＝入金の 札「直し 1」
  {
    id: 7,
    at: "2026-11-09T06:00:00Z",
    tbl: "daikou.payments",
    op: "U",
    pk: { id: "p0" },
    dare_shu: "jimusho",
    dare: "jimusho:x",
    kawatta: ["paid"],
    mae: { paid: 3000 },
    ato: { paid: 3200 },
  },
  // 別の 表の 行（tbl を 絞る）＝どこにも 出ない
  {
    id: 8,
    at: "2026-11-09T07:00:00Z",
    tbl: "daikou.companies",
    op: "U",
    pk: { id: "m3" },
    dare_shu: "device",
    dare: DEV,
    kawatta: ["name"],
    mae: { name: "a" },
    ato: { name: "b" },
  },
];

async function open(page, o) {
  o = o || {};
  const soto = [];
  await page.route(/supabase\.co/, (route) => {
    soto.push(route.request().url());
    return route.abort();
  });
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/(@supabase\/supabase-js|xlsx-js-style|jszip)@/,
    (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
  page.__errs = [];
  page.on("pageerror", (e) => page.__errs.push(String(e)));
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.addInitScript(
    ({ rireki, hyou, fail, labels }) => {
      if (hyou) window.__FAKE_SCHEMA_TABLES__ = ["daikome.dk_naoshi_rireki"];
      if (fail) window.__FAKE_FAIL_TABLES__ = ["daikome.dk_naoshi_rireki"];
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      const uid = db.session.user.id;
      db.tables["daikome.dk_naoshi_rireki"] = rireki.map((r) => Object.assign({ user_id: uid }, r));
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
      // 車の 札（端末の 名前）＝偽の 答え（fake は 持ち主の 列で 絞るので 会社の 列しか 無い 札を 返せない）
      const sb = window.__EXALLY_FAKE_SB__;
      const from0 = sb.from;
      sb.from = function (table) {
        if (table === "dk_device_labels") {
          return {
            select() {
              const p = Promise.resolve({ data: JSON.parse(JSON.stringify(labels)), error: null });
              const q = { eq: () => q, order: () => q, then: (a, b) => p.then(a, b) };
              return q;
            },
          };
        }
        return from0(table);
      };
    },
    { rireki: RIREKI, hyou: o.hyou !== false, fail: !!o.fail, labels: LABELS }
  );
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await nav(page, "list");
  await page.waitForTimeout(500);
  return soto;
}

const gyou = (page, id) => page.locator(`#listBody .list-item[onclick*="'${id}'"]`);

async function mado(page, id) {
  await gyou(page, id).click();
  await page.waitForTimeout(400);
  return page.locator("#modalBody .naoshi-ichiran");
}

test("★表が在る：運転手が最後に直した行だけ赤・直し n・但し書き・編集の窓の履歴★", async ({
  page,
}) => {
  const soto = await open(page);

  const tadashi = page.locator("#naoshiTadashi");
  await expect(tadashi, "★但し書きが出ていない★").toHaveText("運転手が修正したものは赤になります");
  await expect(tadashi).toBeVisible();

  // 赤は m0 だけ（m1 は 事務所が 後で 直した＝消える）
  await expect(gyou(page, "m0"), "★運転手が直した行が赤でない★").toHaveClass(/li-aka/);
  for (const id of ["m1", "m2", "m3", "m4"])
    await expect(gyou(page, id), `★${id} が赤になった★`).not.toHaveClass(/li-aka/);
  const aka = await gyou(page, "m0")
    .locator(".li-amt")
    .evaluate((e) => getComputedStyle(e).color);
  expect(aka, "★金額の字が赤でない★").toBe("rgb(192, 57, 43)");

  // 札＝判じと 同じ 物だけ
  await expect(gyou(page, "m0").locator(".naoshi-fuda")).toHaveText("直し 1");
  await expect(gyou(page, "m1").locator(".naoshi-fuda")).toHaveText("直し 2");
  for (const id of ["m2", "m3", "m4"])
    await expect(gyou(page, id).locator(".naoshi-fuda"), `★${id} に札が出た★`).toHaveCount(0);

  await page.screenshot({ path: test.info().outputPath("list-390.png"), fullPage: true });

  // 編集の 窓：m0＝運転手の 端末（札の 名）・金額 前→後・日本の 時刻
  let ichi = await mado(page, "m0");
  await expect(ichi, "★編集の窓に直しの履歴が無い★").toHaveCount(1);
  await expect(ichi.locator(".naoshi-gyou")).toHaveCount(1);
  await expect(ichi.locator(".naoshi-gyou").first()).toHaveClass(/aka/);
  await expect(ichi).toContainText("2026/11/09 10:05・運転手の端末（1466）");
  await expect(ichi).toContainText("金額：1000 → 1200");
  await page.screenshot({ path: test.info().outputPath("edit-m0-390.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // m2：札は 無いが 窓には 全部 出す（何が 起きたかは 隠さない）
  await page.evaluate(() => closeModal && closeModal());
  ichi = await mado(page, "m2");
  await expect(ichi.locator(".naoshi-gyou")).toHaveCount(2);
  await expect(ichi).toContainText("事務所");
  await expect(ichi).toContainText("会社名：旧社 → 株式会社 標様本");
  await expect(ichi).toContainText("自動");
  await page.evaluate(() => closeModal && closeModal());

  // m4：足した（I）は 読まない＝窓に 履歴が 出ない
  ichi = await mado(page, "m4");
  await expect(ichi, "★I を読んでいる（op が絞れていない）★").toHaveCount(0);
  await page.evaluate(() => closeModal && closeModal());

  expect(soto, "★倉庫へ通信が出た★").toEqual([]);
  expect(page.__errs, "★画面の実行時エラー★").toEqual([]);
});

test("★表が在る：入金の札と入金の窓の履歴★", async ({ page }) => {
  const soto = await open(page);
  await nav(page, "payment");
  await page
    .locator("#payMonth")
    .selectOption({ value: "2026-08" })
    .catch(() => {});
  await page.waitForTimeout(500);
  const item = page.locator("#scr-payment .pay-item", { hasText: CO1 }).first();
  await expect(item.locator(".naoshi-fuda"), "★入金の札が出ていない★").toHaveText("直し 1");
  await page.screenshot({ path: test.info().outputPath("pay-390.png"), fullPage: true });
  await item.click();
  await page.waitForTimeout(400);
  const ichi = page.locator("#modalBody .naoshi-ichiran");
  await expect(ichi, "★入金の窓に直しの履歴が無い★").toHaveCount(1);
  await expect(ichi).toContainText("2026/11/09 15:00・事務所");
  await expect(ichi).toContainText("入金額：3000 → 3200");
  await page.screenshot({ path: test.info().outputPath("pay-mado-390.png"), fullPage: false });
  expect(soto).toEqual([]);
  expect(page.__errs).toEqual([]);
});

test("★表が無い（本番の倉庫）＝何も出さない（但し書きも札も赤も）★", async ({ page }) => {
  const soto = await open(page, { hyou: false });
  await expect(page.locator("#listBody .list-item").first()).toBeVisible();
  await expect(page.locator("#naoshiTadashi")).toHaveText("");
  await expect(page.locator("#naoshiTadashi")).toBeHidden();
  await expect(page.locator("#listBody .naoshi-fuda")).toHaveCount(0);
  await expect(page.locator("#listBody .li-aka")).toHaveCount(0);
  const ichi = await mado(page, "m0");
  await expect(ichi).toHaveCount(0);
  expect(soto).toEqual([]);
  expect(page.__errs).toEqual([]);
});

test("★読めない＝小さく一言・札も赤も出さない★", async ({ page }) => {
  const soto = await open(page, { fail: true });
  await expect(page.locator("#listBody .list-item").first()).toBeVisible();
  await expect(page.locator("#naoshiTadashi")).toHaveText(
    "運転手の直しの印を確かめられませんでした（開き直すと読み直します）"
  );
  await expect(page.locator("#naoshiTadashi")).toHaveClass(/ng/);
  await expect(page.locator("#listBody .naoshi-fuda")).toHaveCount(0);
  await expect(page.locator("#listBody .li-aka")).toHaveCount(0);
  expect(soto).toEqual([]);
  expect(page.__errs).toEqual([]);
});
