import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// ★手で入れた明細にも「車」を付けられる★ 2026-10-23
//   出どころ … 事務所で付けた札（public の dk_device_labels：label・sort_order）
//   付けた時 … extra.dk_car（札）・extra.dk_car_no（並び順）だけを入れる。
//              dk_ref / dk_source は入れない＝事務所へ金額を戻す道（shouldPushFare）に乗せない。
//   空に戻す … dk_car・dk_car_no とも消す。
//   読めない・0件・会社が2つ以上 … 欄を出さない（黙って空の欄を出さない／札を混ぜない）。
//
//   ★倉庫には 読みも書きもしない★
//     ・画面の倉庫は 偽の倉庫（fake-supabase.js）に差し替える。
//     ・札の表だけは ここで偽の答えを返す（fake は持ち主の列で絞るので 会社の列しか無い札を返せない）。
//     ・念のため 倉庫の住所へ出る通信は page.route で全部止めて数える＝0 でなければ赤。
// ============================================================

test.setTimeout(120000);

const LABELS = [
  { company_id: "k1", device_id: "d2", label: "4987", sort_order: 2 },
  { company_id: "k1", device_id: "d1", label: "1466", sort_order: 1 },
];

async function open(page, opts) {
  const o = opts || {};
  const soto = [];
  await page.route(/supabase\.co/, (route) => {
    soto.push(route.request().url());
    return route.abort();
  });
  // 外の配り元の道具（倉庫の道具・Excel・zip）は この試験では使わない＝待たない
  //   （遅い日は 1本 60秒を超えて 開くだけで 時間切れになった・10-23 実測）
  //   使わない事は 下の「画面の実行時エラー 0」で縛る。
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/(@supabase\/supabase-js|xlsx-js-style|jszip)@/,
    (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );
  page.__errs = [];
  page.on("pageerror", (e) => page.__errs.push(String(e)));
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  if (o.daikome)
    await page.addInitScript(() => {
      // 事務所から来た行（m0）＝同期が入れる形（dk_source・dk_ref・dk_car・dk_car_no）
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
      db.tables.meisai[0].extra = {
        dk_source: "daikome",
        dk_ref: "d1:1:1",
        dk_car: "1466",
        dk_car_no: 1,
      };
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    });
  await page.addInitScript(
    ({ labels, fail }) => {
      const sb = window.__EXALLY_FAKE_SB__;
      const from0 = sb.from;
      window.__DK_LABEL_YOMI__ = [];
      window.__MEISAI_OKURI__ = [];
      sb.from = function (table) {
        if (table === "dk_device_labels") {
          return {
            select(cols) {
              window.__DK_LABEL_YOMI__.push(cols);
              const p = Promise.resolve(
                fail
                  ? { data: null, error: { message: "Failed to fetch" } }
                  : { data: JSON.parse(JSON.stringify(labels)), error: null }
              );
              const q = {
                eq: () => q,
                order: () => q,
                then: (a, b) => p.then(a, b),
              };
              return q;
            },
          };
        }
        const t = from0(table);
        if (table === "meisai") {
          const ins = t.insert;
          const upd = t.update;
          t.insert = function (rows) {
            window.__MEISAI_OKURI__.push({
              kind: "insert",
              rows: JSON.parse(JSON.stringify(rows)),
            });
            return ins.apply(this, arguments);
          };
          t.update = function (vals) {
            window.__MEISAI_OKURI__.push({
              kind: "update",
              rows: [JSON.parse(JSON.stringify(vals))],
            });
            return upd.apply(this, arguments);
          };
        }
        return t;
      };
    },
    { labels: o.labels || LABELS, fail: !!o.fail }
  );
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });
  await page.locator("#inputCompany").selectOption({ index: 1 });
  await page.waitForTimeout(400);
  return soto;
}

async function nyuuryoku(page) {
  await page.locator("#entryBody .date-input").first().fill("2026-08-20");
  await page.locator("#entryBody .date-input").first().dispatchEvent("change");
  await page.locator("#entryBody .sugg-wrap .entry-inp").first().fill("今治市試験町");
  await page.locator("#entryBody .sugg-wrap .entry-inp").first().dispatchEvent("input");
  await page.locator("#entryBody .entry-inp.num").first().fill("3000");
  await page.locator("#entryBody .entry-inp.num").first().dispatchEvent("input");
}

async function hozon(page) {
  await page.locator('#scr-input button[onclick="saveEntries()"]').click();
  await page.waitForTimeout(500);
}

test("★入力：車を選んで保存＝dk_car と dk_car_no だけが入る（dk_ref・dk_source は無い）★", async ({
  page,
}) => {
  const soto = await open(page);
  const sel = page.locator("#entryBody select.entry-car");
  await expect(sel, "★車の欄が出ていない★").toHaveCount(1);
  // 既定は空（今まで通り「手で入れた分」）・候補は並び順
  const opts = await sel.locator("option").allTextContents();
  expect(opts[0].trim(), "★既定が空になっていない★").toBe("（車なし）");
  expect(opts.slice(1).map((s) => s.trim())).toEqual(["1466", "4987"]);
  expect(await sel.inputValue()).toBe("");

  await page.screenshot({ path: test.info().outputPath("input-390.png"), fullPage: false });

  await nyuuryoku(page);
  await sel.selectOption({ label: "4987" });
  await hozon(page);

  const okuri = await page.evaluate(() => window.__MEISAI_OKURI__);
  const ins = okuri.filter((x) => x.kind === "insert");
  expect(ins.length, "★保存が送られていない★").toBe(1);
  expect(ins[0].rows.length).toBe(1);
  const ex = ins[0].rows[0].extra || {};
  expect(ex.dk_car, "★車の札が送られていない★").toBe("4987");
  expect(ex.dk_car_no, "★並び順が送られていない★").toBe(2);
  expect("dk_ref" in ex, "★dk_ref が入った（事務所へ戻す道に乗る）★").toBe(false);
  expect("dk_source" in ex, "★dk_source が入った（事務所へ戻す道に乗る）★").toBe(false);
  // 札は 読んだ（何を読んだかを数える＝読まずに緑にしない）
  const yomi = await page.evaluate(() => window.__DK_LABEL_YOMI__);
  expect(yomi.length, "★札を1回も読んでいない★").toBeGreaterThan(0);
  expect(soto, "★倉庫へ通信が出た★").toEqual([]);
  expect(page.__errs, "★画面の実行時エラー★").toEqual([]);
});

test("★入力：車を選ばなければ 今まで通り（dk_car・dk_car_no が無い）★", async ({ page }) => {
  await open(page);
  await expect(page.locator("#entryBody select.entry-car")).toHaveCount(1);
  await nyuuryoku(page);
  await hozon(page);
  const okuri = await page.evaluate(() => window.__MEISAI_OKURI__);
  const ins = okuri.filter((x) => x.kind === "insert");
  expect(ins.length).toBe(1);
  const ex = ins[0].rows[0].extra || {};
  expect("dk_car" in ex).toBe(false);
  expect("dk_car_no" in ex).toBe(false);
});

test("★直す画面：車を付ける→空に戻すと dk_car・dk_car_no とも消える・一覧は車の見出しへ★", async ({
  page,
}) => {
  const soto = await open(page);
  await nav(page, "list");
  // 種の行（手で入れた分）を1件開く
  await page.locator(".list-item").first().click();
  await page.waitForTimeout(400);
  const sel = page.locator("#modalBody select.ed-car");
  await expect(sel, "★直す画面に車の欄が出ていない★").toHaveCount(1);
  expect(await sel.inputValue(), "★既定が空になっていない★").toBe("");

  await sel.selectOption({ label: "1466" });
  await page.screenshot({ path: test.info().outputPath("edit-390.png"), fullPage: false });
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(500);

  let okuri = await page.evaluate(() => window.__MEISAI_OKURI__);
  let up = okuri.filter((x) => x.kind === "update");
  expect(up.length, "★直しが送られていない★").toBe(1);
  let ex = up[0].rows[0].extra || {};
  expect(ex.dk_car).toBe("1466");
  expect(ex.dk_car_no).toBe(1);
  expect("dk_ref" in ex).toBe(false);
  expect("dk_source" in ex).toBe(false);

  // 一覧に「車 1466」の見出しが出る
  const heads = await page.locator("#listBody .li-car").allTextContents();
  expect(heads, "★一覧に車の見出しが出ていない★").toContain("車 1466");
  await page.screenshot({ path: test.info().outputPath("list-390.png"), fullPage: false });

  // 同じ行を開き直して 空に戻す
  const id = await page.evaluate(() => DB.filter((r) => r.dk_car === "1466").map((r) => r.id)[0]);
  expect(id).toBeTruthy();
  await page.evaluate((x) => openEdit(x), id);
  await page.waitForTimeout(300);
  expect(await page.locator("#modalBody select.ed-car").inputValue()).not.toBe("");
  await page.locator("#modalBody select.ed-car").selectOption("");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(500);
  okuri = await page.evaluate(() => window.__MEISAI_OKURI__);
  up = okuri.filter((x) => x.kind === "update");
  expect(up.length).toBe(2);
  ex = up[1].rows[0].extra || {};
  expect("dk_car" in ex, "★空に戻しても dk_car が残った★").toBe(false);
  expect("dk_car_no" in ex, "★空に戻しても dk_car_no が残った★").toBe(false);
  const mem = await page.evaluate((x) => {
    const r = DB.filter((y) => y.id === x)[0];
    return { car: r.dk_car, no: r.dk_car_no };
  }, id);
  expect(mem.car == null && mem.no == null, "★画面の中に車が残った★").toBe(true);
  expect(soto, "★倉庫へ通信が出た★").toEqual([]);
  expect(page.__errs, "★画面の実行時エラー★").toEqual([]);
});

test("★札が読めない時は 車の欄を出さない（入力・直す画面とも）★", async ({ page }) => {
  await open(page, { fail: true });
  const yomi = await page.evaluate(() => window.__DK_LABEL_YOMI__);
  expect(yomi.length, "★札を読みに行っていない（読めない時を試していない）★").toBeGreaterThan(0);
  await expect(page.locator("#entryBody .ef-lb", { hasText: /^車$/ })).toHaveCount(0);
  await expect(page.locator("#entryBody select.entry-car")).toHaveCount(0);
  // 入力欄そのものは出ている（欄が0で緑にしない）
  await expect(page.locator("#entryBody .entry-inp.num")).toHaveCount(1);
  await nav(page, "list");
  await page.locator(".list-item").first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("#modalBody .finput").first()).toBeVisible();
  await expect(page.locator("#modalBody select.ed-car")).toHaveCount(0);
});

test("★札が0件の時は 車の欄を出さない★", async ({ page }) => {
  await open(page, { labels: [] });
  const yomi = await page.evaluate(() => window.__DK_LABEL_YOMI__);
  expect(yomi.length).toBeGreaterThan(0);
  await expect(page.locator("#entryBody .entry-inp.num")).toHaveCount(1);
  await expect(page.locator("#entryBody select.entry-car")).toHaveCount(0);
});

test("★会社が2つ以上の札は 混ぜない＝欄を出さない★", async ({ page }) => {
  await open(page, {
    labels: LABELS.concat([{ company_id: "k2", device_id: "d9", label: "7777", sort_order: 1 }]),
  });
  const yomi = await page.evaluate(() => window.__DK_LABEL_YOMI__);
  expect(yomi.length).toBeGreaterThan(0);
  await expect(page.locator("#entryBody .entry-inp.num")).toHaveCount(1);
  await expect(page.locator("#entryBody select.entry-car")).toHaveCount(0);
});

test("★事務所から来た行は 直す画面に車の欄を出さない（車は事務所の札が正本）★", async ({
  page,
}) => {
  await open(page, { daikome: true });
  await nav(page, "list");
  await page.evaluate(() => openEdit("m0"));
  await page.waitForTimeout(300);
  await expect(page.locator("#modalBody .finput").first()).toBeVisible();
  await expect(page.locator("#modalBody select.ed-car")).toHaveCount(0);
  // 手で入れた行（m1）には出る＝札は読めている（欄が0で緑にしない）
  await page.evaluate(() => openEdit("m1"));
  await page.waitForTimeout(300);
  await expect(page.locator("#modalBody select.ed-car")).toHaveCount(1);
});
