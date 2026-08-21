// ============================================================
// ★開く物の一覧（＝この見張りが見ている所）★
//   押した数を報告するのではなく、★押す物の名前を先に並べる★。
//   画面の色・揃え・入力欄の大きさは、どれも「同じ所を開いて」測る＝一覧はここ1本。
//   ここに無い所は「見ていない」。増やす時はここへ足す。
//
//   ★まだ開いていない所★
//     ・トースト（保存後に出る帯）／削除の確認モーダル
//     ・書体ポップ（itb-font）・編集タブの各チップを開いた中身
// ============================================================

// 画面に出す作り物のデータ（実物と同じ形）。入金が無いと 入金/集計の数字を見ないまま緑になる。
export function seed() {
  const uid = "u_ink";
  const co1 = "株式会社 生野組";
  const co2 = "飛勝工業株式会社";
  const dests = ["今治市喜田村", "今治市東鳥生町", "西条市郷桜井", "今治市小泉", "今治市東門町"];
  const rows = dests.map((d, i) => ({
    id: "m" + i,
    user_id: uid,
    company: i % 2 ? co2 : co1,
    date: "2026-08-" + String(14 - (i % 3)).padStart(2, "0"),
    destination: d,
    amount: [1200, 12000, 900, 1234567, 4800][i],
    note: "",
    distance: null,
    people: 1,
    name: "",
    extra: null,
    created_at: "2026-08-01T00:00:00.000Z",
    deleted_at: null,
  }));
  localStorage.setItem(
    "__fake_supa_db__",
    JSON.stringify({
      users: { "t@x.com": { id: uid, email: "t@x.com", password: "himitsu123" } },
      session: { user: { id: uid, email: "t@x.com" } },
      tables: {
        meisai: rows,
        companies: [co1, co2].map((n, i) => ({
          id: "c" + i,
          user_id: uid,
          name: n,
          items: ["日付", "行き先", "金額"],
          config: {},
          created_at: "2026-05-01T00:00:00.000Z",
          deleted_at: null,
        })),
        issuer: [
          {
            user_id: uid,
            config: {
              issuer: "合同会社ZEROact\nZERO代行\n登録番号：T3500003003293",
              bank: "伊予銀行　今治支店　普通　4160657",
            },
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        payments: [
          {
            id: "p0",
            user_id: uid,
            month: "2026-08",
            company: co1,
            paid: 3200,
            paid_date: "2026-08-10",
            memo: "",
            deleted_at: null,
          },
        ],
        invoices: [],
        invoice_no: [],
      },
    })
  );
}

export async function nav(page, scr) {
  const b = page.locator(`.nav-item[data-scr="${scr}"]`);
  if (await b.count()) {
    await b.click();
    await page.waitForTimeout(700);
  }
}

export async function seg(page, scr, name) {
  await nav(page, scr);
  const b = page.locator(`#scr-${scr} .seg-btn[data-seg="${name}"]`);
  if (await b.count()) {
    await b.click();
    await page.waitForTimeout(700);
  }
}

export async function closeModal(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  const x = page.locator(".modal-x, .modal-close").first();
  if (await x.count()) await x.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
}

export const STOPS = [
  // ★客が一番先に見る画面＝ログインする前★（2026-08-21 指示役が実配信から見つけた穴）
  //   ここを数えていなかったので「読ませる字は薄い黒」がログイン画面だけ直っていなかった。
  {
    name: "ログイン前",
    open: async (p) => {
      // ★画面を作る前に「入っていない状態」にする★（後から立てても もう読まれている）
      await p.addInitScript(() => {
        window.__FAKE_NO_SESSION__ = true;
        try {
          const db = JSON.parse(localStorage.getItem("__fake_supa_db__") || "{}");
          db.session = null;
          localStorage.setItem("__fake_supa_db__", JSON.stringify(db));
        } catch (e) {}
      });
      await p.reload({ waitUntil: "load" });
      await p.waitForSelector(".login-card", { state: "attached", timeout: 30000 });
      await p.waitForTimeout(1200);
    },
    close: async (p) => {
      // 次の所のために 入り直す（作り物データを元に戻す）
      await p.addInitScript(() => {
        window.__FAKE_NO_SESSION__ = false;
      });
      await p.reload({ waitUntil: "load" });
      await p.waitForSelector("#scr-input", { state: "visible", timeout: 30000 });
      await p.waitForTimeout(400);
    },
  },
  { name: "入力", open: async (p) => nav(p, "input") },
  { name: "一覧", open: async (p) => nav(p, "list") },
  { name: "入金", open: async (p) => nav(p, "payment") },
  {
    name: "入金→1件を開く",
    open: async (p) => {
      await nav(p, "payment");
      const row = p.locator("#payBody .pay-co").first();
      if (await row.count()) {
        await row.click();
        await p.waitForTimeout(800);
      }
    },
    close: closeModal,
  },
  { name: "編集", open: async (p) => nav(p, "edit") },
  { name: "請求→請求書", open: async (p) => seg(p, "billing", "invoice") },
  {
    name: "請求→Excelに書き出し",
    open: async (p) => {
      await seg(p, "billing", "invoice");
      const b = p.locator("#btnInvExcel");
      if (await b.count()) {
        await b.click();
        await p.waitForTimeout(800);
      }
    },
    close: closeModal,
  },
  {
    name: "請求→集計",
    open: async (p) => {
      await seg(p, "billing", "report");
      const rm = p.locator("#repMonth");
      if ((await rm.locator("option").count()) > 1) {
        await rm.selectOption({ index: 1 });
        await p.waitForTimeout(900);
      }
    },
  },
  { name: "設定→会社マスタ", open: async (p) => seg(p, "settings", "master") },
  {
    name: "設定→会社マスタ→1社を開く",
    open: async (p) => {
      await seg(p, "settings", "master");
      const hd = p.locator("#scr-settings .master-co-hd").first();
      if (await hd.count()) {
        await hd.click();
        await p.waitForTimeout(800);
      }
    },
  },
  { name: "設定→自社情報", open: async (p) => seg(p, "settings", "issuer") },
  { name: "設定→テンプレート", open: async (p) => seg(p, "settings", "template") },
];

// 画面を開く前の下ごしらえ（3本の見張りで同じ形にする）
export async function boot(page, width) {
  await page.setViewportSize({ width, height: 850 });
  await page.addInitScript({ path: "tests/e2e/fake-supabase.js" });
  await page.addInitScript(seed);
  await page.goto("/daikou-seikyu.html", { waitUntil: "load" });
  await page.waitForSelector("#scr-input", { state: "visible", timeout: 30000 });
}
