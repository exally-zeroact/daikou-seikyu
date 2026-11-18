import { test, expect } from "@playwright/test";
import { seed, nav } from "./stops.js";

// ============================================================
// ★件⑧b 2026-11-14★ ダイコメから 来た 行は「開いた 時の 額の まま」の 時だけ 書く
//   司さん「お互い修正したら反映されるようにしろ」＝事務所の 入力でも この 行の 額を 直せる。
//   開いた ままの 請求書の 画面が 古い 額で 上書きすると、入力の 直しが 黙って 消える。
//   ・別の 画面で 額が 変わっていた＝書かない・その 行を 読み直す・事務所へ 戻す 呼び出しも しない
//   ・変わっていない／料金未定（空）の 行／手で 入れた 行＝今まで 通り 書く
//   ・書けなかった（通信）＝手元の 行を 開いた 時の 姿へ 戻す（前は 一覧に 打った 額が 出た）
// ★2026-11-18 書き直し★ 司さん「最後に触った方が優先やないんか」「やれ」（10-21 の 決め）
//   ＝「額が 違えば 書かない」を やめ、欄ごとの 最後勝ちに した：
//   ・客が 変えた 欄だけ 書く（変えていない 欄は 別の 画面の 直しが 残る）・後の 保存が 勝つ
//   ・変えたかは 開いた 時の 打ち欄の 値と 比べる（改行・空と 0 で 割れない）
// ============================================================

test.setTimeout(120000);

async function hiraku(page, extra0, amount0, retsu) {
  const yobi = [];
  await page.route("**/functions/v1/**", async (r) => {
    yobi.push(r.request().url());
    // 本物の dk-fix-fare は 消された 行を 409 deleted で 断る（Daikou-app dk-fix-fare/index.ts:80）
    const kesu = await page
      .evaluate(
        () => !!JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai[0].deleted_at
      )
      .catch(() => false);
    if (kesu)
      return r.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "deleted" }),
      });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        updated: 1,
        shift_total: 1,
        uriage_hazushita: 0,
        seikyu_hazushita: 0,
      }),
    });
  });
  await page.setViewportSize({ width: 390, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.addInitScript(
    ([ex, am, re]) => {
      const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
      const b64u = (o) =>
        btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      if (db.session)
        db.session.access_token =
          b64u({ alg: "HS256", typ: "JWT" }) +
          "." +
          b64u({ sub: db.session.user.id, role: "authenticated" }) +
          ".e2e";
      const m = db.tables.meisai;
      m[0].extra = ex;
      if (am !== "mama") m[0].amount = am;
      if (re) Object.assign(m[0], re);
      localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
    },
    [extra0, amount0 === undefined ? "mama" : amount0, retsu || null]
  );
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await page.waitForSelector("#scr-input", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(1200);
  return yobi;
}

const DK = { dk_source: "daikome", dk_ref: "dev1:1700000000000:1" };

// 別の 画面（事務所の 入力）が 倉庫の 額を 変えた
async function betsuNoGamen(page, yen) {
  await page.evaluate((y) => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    db.tables.meisai[0].amount = y;
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  }, yen);
}
const kuraNoGaku = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai[0].amount);
const kuraNo = (page, k) =>
  page.evaluate(
    (kk) => JSON.parse(localStorage.getItem("__fake_supa_db__")).tables.meisai[0][kk],
    k
  );
async function kuraNiKaku(page, o) {
  await page.evaluate((oo) => {
    const db = JSON.parse(localStorage.getItem("__fake_supa_db__"));
    Object.assign(db.tables.meisai[0], oo);
    localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
  }, o);
}
const temotoNoGaku = (page) => page.evaluate(() => DB.filter((x) => x.id === "m0")[0].金額);

async function hiraite(page) {
  await nav(page, "list");
  await page.evaluate(() => openEdit("m0"));
  await page.waitForTimeout(400);
}
async function hozon(page, yen) {
  await page.fill("#ed_金額", String(yen));
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
}

test("ダイコメの 行・別の 画面で 額が 変わっていた・客も 額を 変えた＝後の 保存が 勝つ・事務所へ 戻す・知らせる", async ({
  page,
}) => {
  const yobi = await hiraku(page, DK);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await hozon(page, 1500);
  expect(await kuraNoGaku(page)).toBe(1500);
  expect(await temotoNoGaku(page)).toBe(1500);
  expect(yobi.filter((u) => /dk-fix-fare$/.test(u)).length).toBe(1);
  await expect(page.locator("#toast")).toContainText("別の画面で 7,777円 に直されていましたが");
  await expect(page.locator("#toast")).toContainText("この保存の 1,500円 にしました");
});

test("ダイコメの 行・別の 画面で 額が 変わっていた・客は 行き先だけ＝額は 別の 画面の まま・行き先は 書く・事務所へ 戻さない", async ({
  page,
}) => {
  const yobi = await hiraku(page, DK);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await page.fill("#ed_行き先", "びこう");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  expect(await kuraNoGaku(page)).toBe(7777);
  expect(await temotoNoGaku(page)).toBe(7777);
  expect(await kuraNo(page, "destination")).toBe("びこう");
  expect(yobi.length).toBe(0);
  await expect(page.locator("#toast")).toContainText("額は別の画面で直された 7,777円 のままです");
});

test("ダイコメの 行・変わっていない＝書く・事務所へ 戻す", async ({ page }) => {
  const yobi = await hiraku(page, DK);
  await hiraite(page);
  await hozon(page, 1500);
  // 保存の 後に 事務所へ 戻した 知らせが 上に 出る
  await expect(page.locator("#toast")).toContainText("事務所の売上も 直しました");
  expect(await kuraNoGaku(page)).toBe(1500);
  expect(yobi.filter((u) => /dk-fix-fare$/.test(u)).length).toBe(1);
});

test("ダイコメの 行・料金未定（空）＝空の まま なら 書ける", async ({ page }) => {
  await hiraku(page, DK, null);
  await hiraite(page);
  await hozon(page, 2000);
  await expect(page.locator("#toast")).toContainText("事務所の売上も 直しました");
  expect(await kuraNoGaku(page)).toBe(2000);
});

test("ダイコメの 行・料金未定（空）の 間に 別の 画面で 額が 入った・客も 打った＝客の 額が 勝つ", async ({
  page,
}) => {
  await hiraku(page, DK, null);
  await hiraite(page);
  await betsuNoGamen(page, 3300);
  await hozon(page, 2000);
  expect(await kuraNoGaku(page)).toBe(2000);
  await expect(page.locator("#toast")).toContainText("別の画面で 3,300円 に直されていましたが");
});

test("料金未定（空）に 0 と 打つ＝倉庫も 0（null の まま に しない）・0円と 決めた 印", async ({
  page,
}) => {
  await hiraku(page, DK, null);
  await hiraite(page);
  await hozon(page, 0);
  expect(await kuraNoGaku(page)).toBe(0);
  expect(await kuraNo(page, "extra")).toMatchObject({ ryokin_0_kimeta: true });
});

test("メーターの 行の 額を 空に する＝倉庫も 空（null）", async ({ page }) => {
  await hiraku(page, DK);
  await hiraite(page);
  await page.fill("#ed_金額", "");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  expect(await kuraNoGaku(page)).toBe(null);
});

test("手で 入れた 行・別の 画面で 額が 変わっていた・客も 額を 変えた＝後の 保存が 勝つ", async ({
  page,
}) => {
  await hiraku(page, null);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await hozon(page, 1500);
  await expect(page.locator("#toast")).toContainText("保存しました");
  expect(await kuraNoGaku(page)).toBe(1500);
});

test("別の 画面で 会社名が 変わった 後に 行き先だけ 保存＝会社名を 古い 名前で 書き戻さない", async ({
  page,
}) => {
  await hiraku(page, null);
  await hiraite(page);
  const mae = await kuraNo(page, "company");
  await kuraNiKaku(page, { company: mae + "（新）" });
  await page.fill("#ed_行き先", "びこう");
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  expect(await kuraNo(page, "company")).toBe(mae + "（新）");
  expect(await kuraNo(page, "destination")).toBe("びこう");
});

test("行き先に 改行が ある 行を 何も 変えずに 保存＝何も 書かない（別の 画面の 額を 潰さない）", async ({
  page,
}) => {
  await hiraku(page, DK, undefined, { destination: "一行目\n二行目" });
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  expect(await kuraNoGaku(page)).toBe(7777);
  expect(await kuraNo(page, "destination")).toBe("一行目\n二行目");
  await expect(page.locator("#toast")).toContainText("変えた所が無いので書いていません");
});

test("書けなかった（通信）＝手元の 行は 開いた 時の 額の まま", async ({ page }) => {
  await hiraku(page, DK);
  await hiraite(page);
  await page.evaluate(() => {
    window.__FAKE_OFFLINE__ = true;
  });
  await hozon(page, 1500);
  expect(await temotoNoGaku(page)).toBe(1200);
  expect(await kuraNoGaku(page)).toBe(1200);
});

// ============================================================
// ★消されていた 行（2026-11-18 司さん「最後に触った方が優先」）★
//   ・手で 入れた 行＝変えた 欄が あれば 戻す（deleted_at を 外す）・戻したと 言う
//   ・手で 入れた 行で 何も 変えていない＝戻さない・一覧から 外す
//   ・ダイコメの 行＝戻さない（運転手が 現金に 直して 外した 行と 区別できない＝戻すと 二重に 請求）
// ============================================================
const kesu = (page) => kuraNiKaku(page, { deleted_at: new Date().toISOString() });

test("手で 入れた 行・別の 画面で 消されていた・客が 額を 変えた＝戻す・戻したと 言う", async ({
  page,
}) => {
  await hiraku(page, null);
  await hiraite(page);
  await kesu(page);
  await hozon(page, 1500);
  expect(await kuraNo(page, "deleted_at")).toBe(null);
  expect(await kuraNoGaku(page)).toBe(1500);
  expect(await page.evaluate(() => DB.some((x) => x.id === "m0"))).toBe(true);
  await expect(page.locator("#toast")).toContainText(
    "別の画面で消されていた行を、この保存で戻しました"
  );
});

test("手で 入れた 行・別の 画面で 消されていた・何も 変えていない＝戻さない・一覧から 外す", async ({
  page,
}) => {
  await hiraku(page, null);
  await hiraite(page);
  await kesu(page);
  await page.locator("#modalBody button", { hasText: "保存" }).click();
  await page.waitForTimeout(1200);
  expect(await kuraNo(page, "deleted_at")).not.toBe(null);
  expect(await page.evaluate(() => DB.some((x) => x.id === "m0"))).toBe(false);
  await expect(page.locator("#toast")).toContainText("何も変えていないので戻していません");
});

test("ダイコメの 行・別の 画面で 消されていた＝戻さない・書かない・事務所へ 送らない・一覧から 外す", async ({
  page,
}) => {
  const yobi = await hiraku(page, DK);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await kesu(page);
  await hozon(page, 1500);
  await expect(page.locator("#toast")).toContainText("別の画面で消されていました");
  await expect(page.locator("#toast")).toContainText("打った内容は保存していません");
  expect(await kuraNo(page, "deleted_at")).not.toBe(null);
  expect(await kuraNoGaku(page)).toBe(7777);
  expect(yobi.length).toBe(0);
  expect(await page.evaluate(() => DB.some((x) => x.id === "m0"))).toBe(false);
});

test("書く 前に 読めなかった＝書かない・手元は 開いた 時の まま", async ({ page }) => {
  await hiraku(page, DK);
  await hiraite(page);
  await betsuNoGamen(page, 7777);
  await page.evaluate(() => {
    const from0 = SB.from.bind(SB);
    SB.from = (t) => {
      const q = from0(t);
      if (t !== "meisai") return q;
      return new Proxy(q, {
        get(o, k) {
          if (k !== "select") return typeof o[k] === "function" ? o[k].bind(o) : o[k];
          return (...a) => {
            const s = o.select(...a);
            return new Proxy(s, {
              get(so, sk) {
                if (sk === "eq")
                  return (...b) => {
                    const e = so.eq(...b);
                    e.maybeSingle = async () => ({ data: null, error: { message: "x" } });
                    return e;
                  };
                return typeof so[sk] === "function" ? so[sk].bind(so) : so[sk];
              },
            });
          };
        },
      });
    };
  });
  await hozon(page, 1500);
  await expect(page.locator("#toast")).toContainText("クラウド保存に失敗");
  expect(await kuraNoGaku(page)).toBe(7777);
  expect(await temotoNoGaku(page)).toBe(1200);
});
