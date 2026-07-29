import { test, expect } from "@playwright/test";

// 飲み屋の売上管理(nomiya-uriage.html)を実ブラウザで開き、
// 「実際に指で押す操作」を全ボタン分たどって、値が正しく出るところまで確かめる。
// 計算そのものは tests/nomiya-core.test.js(実数値)が固定。ここは配線と画面の確認。

const PAGE = "/nomiya-uriage.html";

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // 印刷ダイアログは自動テストで開けないので、呼ばれた回数だけ数える
  await page.addInitScript(() => {
    window.__printed = 0;
    window.print = function () {
      window.__printed++;
    };
  });
  await page.goto(PAGE, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await expect(page.locator("#scr-input")).toBeVisible();
  return errors;
}

// 1件入れる（実際の操作と同じ順: 日付→名前→人数→金額→支払い→領収書→保存）
async function addSale(page, s) {
  await page.locator(".nav-item[data-scr='input']").click();
  await page.locator("#inDate").fill(s.date);
  await page.locator(`#payChips button[data-pay="${s.pay}"]`).click();
  // 請求書送りだけは自由入力ではなく、登録した宛先から選ぶ（無ければその場で登録する）
  if (s.pay === "invoice") {
    if ((await page.locator(`#inNameSel option[value="${s.name}"]`).count()) === 0) {
      await page.locator("#inNameSel").selectOption("__new");
      await page.locator("#ptName").fill(s.name);
      await page.locator("#ptOk").click();
    }
    await page.locator("#inNameSel").selectOption(s.name);
  } else {
    await page.locator("#inName").fill(s.name);
  }
  await page.locator("#inPeople").fill(String(s.people));
  await page.locator("#inAmount").fill(String(s.amount));
  // 領収書は支払い方法ごとに選べるものが違う。true=あり / false=その方法の既定のまま。
  const rec = s.receipt === true ? "issued" : s.receipt === false ? null : s.receipt;
  if (rec) await page.locator(`#recChips button[data-rec="${rec}"]`).click();
  if (s.memo) await page.locator("#inMemo").fill(s.memo);
  await page.locator("#btnSave").click();
}

const SEED = [
  { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash", receipt: false },
  { date: "2026-07-01", name: "山本商事", people: 4, amount: 32000, pay: "invoice", receipt: true },
  { date: "2026-07-02", name: "佐藤", people: 3, amount: 12000, pay: "paypay", receipt: false },
  { date: "2026-07-02", name: "田中", people: 1, amount: 5000, pay: "tsuke", receipt: false },
  { date: "2026-07-05", name: "鈴木", people: 5, amount: 25000, pay: "credit", receipt: true },
];

// 請求書タブの「見た目を変える」は畳んである。開いてから触る。
async function openLook(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  const d = page.locator("#scr-inv .look:not(#partnerBox)");
  if (!(await d.evaluate((el) => el.open))) await d.locator("summary").click();
}

// 宛先の一覧は画面に置かない。請求書タブの「宛先を直す」で開く。
async function openPartners(page) {
  await page.locator(".nav-item[data-scr='inv']").click();
  await page.locator("#btnPartners").click();
  await expect(page.locator("#partnerList")).toBeVisible();
}

async function seed(page) {
  for (const s of SEED) await addSale(page, s);
  // 期間を7月に合わせる（今日が7月とは限らないので範囲指定で固定）
  await page.locator(".nav-item[data-scr='list']").click();
  await page.locator("#periodList .period-lb").click();
  await page.locator("#mdFrom").fill("2026-07-01");
  await page.locator("#mdTo").fill("2026-07-31");
  await page.locator("#mdOk").click();
}

test.describe("飲み屋 売上管理", () => {
  test("開いて1件入れると、その日の一覧と合計に出る", async ({ page }) => {
    const errors = await open(page);

    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
      memo: "ボトル入れ",
    });

    await expect(page.locator("#dayList .li-nm").first()).toContainText("田中");
    await expect(page.locator("#dayList .li-amt").first()).toHaveText("¥8,000");
    const strip = page.locator("#dayStrip .strip-v");
    await expect(strip.nth(0)).toHaveText("1 組");
    await expect(strip.nth(1)).toHaveText("2 人");
    await expect(strip.nth(2)).toHaveText("¥8,000");
    // 保存したらフォームは空に戻り、日付は残る（続けて次の組を打てる）
    await expect(page.locator("#inName")).toHaveValue("");
    await expect(page.locator("#inDate")).toHaveValue("2026-07-01");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("空欄のまま保存すると理由が出て、勝手に0円で保存されない", async ({ page }) => {
    const errors = await open(page);
    await page.locator("#btnSave").click();
    await expect(page.locator("#inErr")).toContainText("名前");
    await expect(page.locator("#inErr")).toContainText("金額");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("支払い方法5つと領収書あり／なしが、タップで選べて保存される", async ({ page }) => {
    const errors = await open(page);
    for (const s of SEED) await addSale(page, s);

    const saved = await page.evaluate(() => window.__NOMIYA.sales);
    expect(saved.length).toBe(5);
    expect(saved.map((s) => s.pay)).toEqual(["cash", "invoice", "paypay", "tsuke", "credit"]);
    expect(saved.filter((s) => s.receipt === "issued").length).toBe(2);
    // 支払い方法ごとの既定が入る: 現金=なし / 振込=なし(na) / PayPay=なし(na) / ツケ=あとで
    expect(saved.map((s) => s.receipt)).toEqual(["none", "issued", "na", "later", "issued"]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("「今日」ボタンが効く（人数はチップを置かず数字だけ）", async ({ page }) => {
    const errors = await open(page);
    await expect(page.locator("#peopleChips")).toHaveCount(0);
    await page.locator("#inDate").fill("2020-01-01");
    await page.locator("#btnToday").click();
    const today = await page.evaluate(() => {
      const d = new Date();
      const p = (n) => (n < 10 ? "0" + n : "" + n);
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    });
    await expect(page.locator("#inDate")).toHaveValue(today);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: A4の売上帳に全件が並び、合計が合う", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    const strip = page.locator("#listStrip .strip-v");
    await expect(strip.nth(0)).toHaveText("5 組");
    await expect(strip.nth(1)).toHaveText("15 人");
    await expect(strip.nth(2)).toHaveText("¥82,000");
    // 紙の合計欄
    await expect(page.locator("#listSheets .st-v")).toHaveText("¥82,000");
    // A4の実寸(794px = 210mm)で描いている
    const w = await page
      .locator("#listSheets .sheet")
      .first()
      .evaluate((el) => el.offsetWidth);
    expect(w).toBe(794);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: 支払い方法別・領収書別のタブ切り替えが効く", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator("#filPay button[data-fp='invoice']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥32,000");

    // 「領収書あり」には振込・カード（領収書が要らない分）も入る
    await page.locator("#filPay button[data-fp='all']").click();
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(3);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥69,000");

    // 重ねがけ（領収書ありのクレジットだけ）
    await page.locator("#filPay button[data-fp='credit']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥25,000");

    // 紙の見出しに絞り込みの中身が出る
    await expect(page.locator("#listSheets .sh-meta")).toContainText("クレジット");
    await expect(page.locator("#listSheets .sh-meta")).toContainText("領収書あり");

    await page.locator("#filPay button[data-fp='all']").click();
    await page.locator("#filRec button[data-rec='all']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: 紙の行をタップすると入力画面で直せる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator("#listSheets tr[data-id]").first().click();
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect(page.locator("#inputMode")).toHaveText("この売上を直す");
    await expect(page.locator("#inName")).toHaveValue("田中");
    await page.locator("#inAmount").fill("9000");
    await page.locator("#btnSave").click();

    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥83,000");
    // 件数は増えていない（新規追加になっていない）
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("一覧タブ: 売上を消せる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator("#listSheets tr[data-id]").first().click();
    await page.locator("#btnDelete").click();
    await page.locator("#mdYes").click();
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(4);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥74,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("集計タブ: 支払い方法別・領収書別・日別・未回収が出る", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='sum']").click();

    const stats = page.locator("#sumStrip .strip-v");
    await expect(stats.nth(0)).toHaveText("¥82,000");
    await expect(stats.nth(1)).toContainText("5");
    await expect(stats.nth(2)).toContainText("15");
    await expect(stats.nth(3)).toHaveText("¥5,467"); // 82,000 / 15人

    // 支払い方法別（0件の行も消えない = 5行）
    const payRows = page.locator("#sumPay tbody tr");
    await expect(payRows).toHaveCount(5);
    await expect(payRows.nth(0)).toContainText("現金");
    await expect(payRows.nth(0)).toContainText("8,000");
    await expect(payRows.nth(3)).toContainText("請求書送り");
    await expect(payRows.nth(3)).toContainText("32,000");
    await expect(page.locator("#sumPay tfoot")).toContainText("82,000");

    // 領収書別は2区分（振込・カードは「あり」に含める）。合計は全体と一致する
    const recRows = page.locator("#sumRec tbody tr");
    await expect(recRows).toHaveCount(2);
    await expect(recRows.nth(0)).toContainText("69,000"); // あり(請求書送り32,000+クレカ25,000+PayPay12,000)
    await expect(recRows.nth(1)).toContainText("13,000"); // なし(現金8,000+ツケ5,000)

    // 日別（3日分）
    await expect(page.locator("#sumDay tbody tr")).toHaveCount(3);

    // 未回収は請求書タブの「請求する相手」に名前だけ並ぶ（金額は紙に出る）
    await page.locator(".nav-item[data-scr='inv']").click();
    const opts = await page.locator("#invName option").allInnerTexts();
    expect(opts.map((t) => t.trim())).toEqual(["山本商事", "田中"]);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥32,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("集計タブ: 同じ相手が請求書送りとツケの両方でも、片方だけ入金できる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 田中はツケ5,000。請求書送りも足す
    await addSale(page, {
      date: "2026-07-10",
      name: "田中",
      people: 2,
      amount: 7000,
      pay: "invoice",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='inv']").click();
    // 田中は ツケ5,000 + 請求書送り7,000 = 12,000（金額は紙の合計で確かめる）
    await page.locator("#invName").selectOption("田中");
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥12,000");

    // 田中の7月分を入金済みにする → 未回収は山本商事だけになる
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidOk").click();
    await expect(page.locator("#invBadge")).toHaveText("1");
    // 7月分の請求書は中身が変わらない（あとから出し直せる）
    await expect(page.locator("#invName option[value='田中']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥12,000");
    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥32,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("紙は同じ日付を繰り返さない（最初の行だけ日付を出す）", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 7/1が2件・7/2が2件・7/5が1件
    const dates = await page
      .locator("#listSheets tr[data-id] .c-d")
      .allInnerTexts()
      .then((a) => a.map((s) => s.trim()));
    expect(dates).toEqual(["7/1", "", "7/2", "", "7/5"]);
    const wd = await page
      .locator("#listSheets tr[data-id] .c-w")
      .allInnerTexts()
      .then((a) => a.map((s) => s.trim()));
    expect(wd).toEqual(["水", "", "木", "", "日"]);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("売上帳の一番右に備考欄があり、メモが入る", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
      memo: "ボトル入れ",
    });
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();

    // 備考は表の一番右の列
    const heads = await page.locator("#listSheets thead th").allInnerTexts();
    expect(heads[heads.length - 1].trim()).toBe("備考");
    await expect(page.locator("#listSheets tr[data-id] .c-bk")).toHaveText("ボトル入れ");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("入金を記録すると未回収が減り、売上もその月の請求書も変わらない", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='inv']").click();

    await page.locator("#invName").selectOption("山本商事");
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidDate").fill("2026-08-10");
    await page.locator("#mdPaidOk").click();

    // 未回収は田中のツケだけになる（バッジが2→1）
    await expect(page.locator("#invBadge")).toHaveText("1");
    // 7月分の請求書はそのまま出せる（入金しても中身は変わらない）
    await expect(page.locator("#invName option[value='山本商事']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥32,000");
    // 売上は変わらない
    await page.locator(".nav-item[data-scr='sum']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥82,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("集計タブ: 全体／領収書あり／領収書なし の切り替えで全部の数字が変わる", async ({
    page,
  }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='sum']").click();

    // 全体
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥82,000");
    await expect(page.locator("#sumRecCard")).toBeVisible();

    // 領収書あり = 山本商事32,000 + 鈴木25,000 + PayPay12,000（振込・カードを含む）
    await page.locator("#sumRecTabs button[data-srec='yes']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥69,000");
    await expect(page.locator("#sumStrip .strip-v").nth(1)).toContainText("3");
    // 絞っているときは「領収書あり/なし別」は出さない
    await expect(page.locator("#sumRecCard")).toBeHidden();
    // 支払い方法別も絞った中身になる（現金は領収書なしなので0）
    await expect(page.locator("#sumPay tbody tr").nth(0)).toContainText("現金");
    await expect(page.locator("#sumPay tfoot")).toContainText("69,000");
    // 領収書なし = 現金8,000 + ツケ5,000（振込・カードは「あり」側なので入らない）
    await page.locator("#sumRecTabs button[data-srec='no']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥13,000");
    await page.locator("#sumRecTabs button[data-srec='all']").click();
    await expect(page.locator("#sumStrip .strip-v").nth(0)).toHaveText("¥82,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("税理士タブ: 1ヶ月の売上報告書が出て、対象で中身が変わる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='tax']").click();

    const strip = page.locator("#taxStrip .strip-v");
    await expect(strip.nth(0)).toHaveText("5 組");
    await expect(strip.nth(2)).toHaveText("¥82,000");
    await expect(page.locator("#taxSheets .sh-title")).toHaveText("売 上 報 告 書");
    // 内税の消費税額も出る（82,000 → 7,454）
    await expect(page.locator("#taxSheets .sm-stats")).toContainText("7,454");
    // A4に収まる
    const h = await page
      .locator("#taxSheets .sheet")
      .first()
      .evaluate((el) => el.offsetHeight);
    expect(h).toBe(1123);

    // 領収書ありだけに絞ると紙の中身が変わる（紙に注意書きは出さない）
    await page.locator("#taxRecTabs button[data-trec='yes']").click();
    await expect(page.locator("#taxStrip .strip-v").nth(2)).toHaveText("¥69,000");
    await expect(page.locator("#taxSheets .sm-stats")).toContainText("69,000");
    await expect(page.locator("#taxSheets .sh-meta")).not.toContainText("対象");

    await page.locator("#taxRecTabs button[data-trec='no']").click();
    await expect(page.locator("#taxStrip .strip-v").nth(2)).toHaveText("¥13,000");
    await expect(page.locator("#taxSheets .sm-stats")).toContainText("13,000");

    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("税理士タブ: 印刷は同じ画面のまま（別タブを開かない）", async ({ page, context }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='tax']").click();
    const before = context.pages().length;
    await page.locator("#btnPrintTax").click();
    await page.waitForTimeout(300);
    // 別タブが増えない＝iPhoneで戻れなくならない
    expect(context.pages().length, "別タブが開いている").toBe(before);
    expect(await page.evaluate(() => window.__printed)).toBe(1);
    // 印刷に渡す中身が入っている
    await expect(page.locator("#printArea .sheet")).toHaveCount(1);
    await expect(page.locator("#printArea .sh-title")).toHaveText("売 上 報 告 書");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("入力: 備考が売上帳・請求書の備考欄に出ることが画面に書いてある", async ({ page }) => {
    const errors = await open(page);
    const hint = page.locator("#memoNote");
    await expect(hint).toContainText("売上帳");
    await expect(hint).toContainText("請求書");
    await expect(hint).toContainText("備考");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("領収書の選択肢が支払い方法で変わる（振込・カードは「なし」が既定）", async ({ page }) => {
    const errors = await open(page);
    const recs = () =>
      page.locator("#recChips button").evaluateAll((els) => els.map((e) => e.dataset.rec));
    // 現金 = なし / あり
    expect(await recs()).toEqual(["none", "issued"]);
    await expect(page.locator("#recChips button[data-rec='none']")).toHaveClass(/on/);

    // 請求書送りもカードも言い方は同じ「なし / あり」。既定は「なし」
    await page.locator("#payChips button[data-pay='invoice']").click();
    expect(await recs()).toEqual(["na", "issued"]);
    await expect(page.locator("#recChips button[data-rec='na']")).toHaveClass(/on/);
    await expect(page.locator("#recChips button[data-rec='na']")).toHaveText("なし");

    await page.locator("#payChips button[data-pay='credit']").click();
    await expect(page.locator("#recChips button[data-rec='na']")).toHaveText("なし");

    // ツケ = あとで渡す / 渡した / なし
    await page.locator("#payChips button[data-pay='tsuke']").click();
    expect(await recs()).toEqual(["later", "issued", "none"]);
    await expect(page.locator("#recChips button[data-rec='later']")).toHaveClass(/on/);

    // 「あとで」のまま現金に変えたら「なし」に戻る（変な組み合わせで保存されない）
    await page.locator("#payChips button[data-pay='cash']").click();
    expect(await recs()).toEqual(["none", "issued"]);
    await expect(page.locator("#recChips button[data-rec='none']")).toHaveClass(/on/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("★振込の売上は「領収書なし」に落ちない（計上しないユーザーでも消えない）", async ({
    page,
  }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "山本商事",
      people: 4,
      amount: 30000,
      pay: "invoice",
    });
    await addSale(page, { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash" });

    // 紙の領収書欄は 振込=○（領収書あり側）/ 現金=空
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();
    const marks = await page.locator("#listSheets tr[data-id] .c-r").allInnerTexts();
    expect(marks.map((m) => m.trim())).toEqual(["○", ""]);

    // 「領収書なし」で絞ると現金だけ（振込は落ちない）
    await page.locator("#filRec button[data-rec='no']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥8,000");
    // 振込は「領収書あり」側に入る
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await expect(page.locator("#listStrip .strip-v").nth(2)).toHaveText("¥30,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("領収書: 印紙とカード払いの注意が出る（止めない）", async ({ page }) => {
    const errors = await open(page);
    // 現金・税抜5万円以上（税込55,000）で領収書あり → 収入印紙の注意
    await page.locator("#inAmount").fill("55000");
    await page.locator("#payChips button[data-pay='cash']").click();
    await page.locator("#recChips button[data-rec='issued']").click();
    await expect(page.locator("#recNote")).toContainText("収入印紙が必要");
    // カード払いに変えると既定が「なし」になり、理由が出る
    await page.locator("#payChips button[data-pay='credit']").click();
    await expect(page.locator("#recNote")).toContainText("売上票");
    // それでも出す場合は「あり」を選ぶ＝印紙不要と二重発行の注意
    await page.locator("#recChips button[data-rec='issued']").click();
    await expect(page.locator("#recNote")).toContainText("クレジットカード払い");
    await expect(page.locator("#recNote")).toContainText("収入印紙も不要");
    // 現金の「なし」なら何も出ない
    await page.locator("#payChips button[data-pay='cash']").click();
    await page.locator("#recChips button[data-rec='none']").click();
    await expect(page.locator("#recNote")).toHaveText("");
    // 金額を下げると印紙の注意が消える
    await page.locator("#payChips button[data-pay='cash']").click();
    await page.locator("#recChips button[data-rec='issued']").click();
    await page.locator("#inAmount").fill("10000");
    await expect(page.locator("#recNote")).toHaveText("");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("領収書: ツケの「あとで」は入金のときに渡したことにできる", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "鈴木",
      people: 2,
      amount: 30000,
      pay: "tsuke",
      receipt: "later",
    });
    // 売上帳では空（まだ渡していない＝「なし」側）
    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();
    await expect(page.locator("#listSheets tr[data-id] .c-r")).toHaveText("");
    // 「あとで渡す分」で絞れる
    await page.locator("#filRec button[data-rec='later']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(0);

    // 入金のときに「領収書も渡した」で発行済みになる
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("鈴木");
    await page.locator("#btnPaid").click();
    await expect(page.locator("#mdPaidRc")).toBeChecked();
    await page.locator("#mdPaidDate").fill("2026-08-10");
    await page.locator("#mdPaidOk").click();

    const saved = await page.evaluate(() => window.__NOMIYA.sales[0]);
    expect(saved.receipt).toBe("issued");
    expect(saved.receiptDate).toBe("2026-08-10"); // 発行日は入金日
    expect(saved.paidDate).toBe("2026-08-10");

    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#filRec button[data-rec='yes']").click();
    await expect(page.locator("#listSheets tr[data-id] .c-r")).toHaveText("○");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書タブ: 3つのデザインを切り替えられて、どれもA4に収まる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='inv']").click();

    await openLook(page);
    for (const tpl of ["card", "band", "tate"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      await expect(page.locator("#invSheets .sheet")).toHaveClass(new RegExp("iv-" + tpl));
      const size = await page
        .locator("#invSheets .sheet")
        .first()
        .evaluate((el) => ({ w: el.offsetWidth, h: el.offsetHeight }));
      expect(size, `${tpl} がA4(794x1123)に収まっていない`).toEqual({ w: 794, h: 1123 });
      // 縦組みの見出しとグラスの飾りは3種共通
      await expect(page.locator("#invSheets .iv-title")).toContainText("請");
    }
    // 選んだデザインは開き直しても残る
    await page.reload({ waitUntil: "load" });
    await page.locator(".nav-item[data-scr='inv']").click();
    await expect(page.locator("#invSheets .sheet")).toHaveClass(/iv-tate/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("見た目（デザイン・色・書体・ロゴ位置）は請求書タブで変えられて、開き直しても残る", async ({
    page,
  }) => {
    const errors = await open(page);
    await seed(page);
    await openLook(page);

    // 設定タブには見た目の選択を置いていない（画像を入れる場所だけ）
    await expect(page.locator("#setTpl")).toHaveCount(0);
    await expect(page.locator("#setAccent")).toHaveCount(0);
    await expect(page.locator("#setFont")).toHaveCount(0);

    await page.locator("#invTpl button[data-tpl='tate']").click();
    await expect(page.locator("#invSheets .sheet")).toHaveClass(/iv-tate/);
    await page.locator("#invFont button[data-font='gothic']").click();
    await page.locator("#invLogoPos button[data-lpos='bottom']").click();

    await page.reload({ waitUntil: "load" });
    await openLook(page);
    await expect(page.locator("#invTpl button[data-tpl='tate']")).toHaveClass(/on/);
    await expect(page.locator("#invFont button[data-font='gothic']")).toHaveClass(/on/);
    await expect(page.locator("#invLogoPos button[data-lpos='bottom']")).toHaveClass(/on/);
    await expect(page.locator("#invSheets .sheet")).toHaveClass(/iv-tate/);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("自分の店らしくする: 色・書体・ロゴが請求書に反映され、印刷にも乗る", async ({
    page,
    context,
  }) => {
    const errors = await open(page);
    await seed(page);
    await openLook(page);

    // 色（ワイン）を選ぶ → 紙の見出し・罫の色が変わる
    await page.locator("#invAccent [data-accent='#7d3a44']").click();
    await expect(page.locator("#invAccent [data-accent='#7d3a44']")).toHaveClass(/on/);
    const skin = () => page.evaluate(() => document.getElementById("invSkin").textContent);
    expect(await skin()).toContain("#7d3a44");

    await page.locator(".nav-item[data-scr='inv']").click();
    const capColor = await page
      .locator("#invSheets .iv-cap")
      .evaluate((el) => getComputedStyle(el).color);
    expect(capColor).toBe("rgb(125, 58, 68)"); // #7d3a44

    // 書体をゴシックへ
    await page.locator("#invFont button[data-font='gothic']").click();
    const titleFont = await page
      .locator("#invSheets .iv-title")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(titleFont).toContain("Noto Sans JP");

    // ロゴを入れる → 発行者の上に出る
    await page.locator(".nav-item[data-scr='set']").click();
    await page.evaluate(() => {
      const png =
        "data:image/svg+xml;base64," +
        btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"></svg>');
      window.__NOMIYA.settings.logo = png;
      window.__NOMIYA.renderAll();
    });
    await page.locator(".nav-item[data-scr='inv']").click();
    // 既定は「上（右上）」＝請求書の定番の位置
    await expect(page.locator("#invSheets .iv-logo-top")).toBeVisible();

    // 「下（店名の上）」にも変えられる
    await page.locator("#invLogoPos button[data-lpos='bottom']").click();
    await expect(page.locator("#invSheets .iv-logo-top")).toHaveCount(0);
    await expect(page.locator("#invSheets .iv-issuer .iv-logo")).toBeVisible();
    await page.locator("#invLogoPos button[data-lpos='top']").click();

    // 印刷に渡す紙にも色と書体が乗る（画面だけ変わって紙が変わらない、を防ぐ）
    await page.locator("#btnPrintInv").click();
    await page.waitForTimeout(300);
    expect(context.pages().length, "別タブが開いている").toBe(1);
    const printed = await page.evaluate(() => {
      const el = document.querySelector("#printArea .iv-cap");
      const t = document.querySelector("#printArea .iv-title");
      return {
        color: el ? getComputedStyle(el).color : "",
        font: t ? getComputedStyle(t).fontFamily : "",
      };
    });
    expect(printed.color).toBe("rgb(125, 58, 68)"); // #7d3a44 が紙にも乗る
    expect(printed.font).toContain("Noto Sans JP");

    // 「デザインのまま」で元に戻る
    await page.locator("#invAccent [data-accent='']").click();
    expect(await skin()).not.toContain("#7d3a44");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書タブ: 相手ごとに1枚にまとまり、内税の内訳が合う", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    // 山本商事にもう1件（請求書送り）を足して2件まとめる
    await addSale(page, {
      date: "2026-07-31",
      name: "山本商事",
      people: 2,
      amount: 15000,
      pay: "invoice",
      receipt: true,
    });

    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("山本商事");

    await expect(page.locator("#invSheets .iv-to")).toContainText("山本商事　御中");
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥47,000");
    const sumRows = page.locator("#invSheets .iv-sum tr");
    await expect(sumRows.nth(0)).toContainText("42,728"); // 税抜
    await expect(sumRows.nth(1)).toContainText("4,272"); // 消費税10%
    await expect(sumRows.nth(2)).toContainText("¥47,000"); // 合計
    // 明細は2行（現金・PayPayは載らない）
    await expect(page.locator("#invSheets .iv-tbl tbody tr")).toHaveCount(2);
    // 請求Noが採番される
    await expect(page.locator("#invSheets .iv-meta")).toContainText("202607-");
    // 一番右は備考欄
    const ivHeads = await page.locator("#invSheets .iv-tbl thead th").allInnerTexts();
    expect(ivHeads[ivHeads.length - 1].trim()).toBe("備考");
    // A4に収まっている
    const h = await page
      .locator("#invSheets .sheet")
      .first()
      .evaluate((el) => el.offsetHeight);
    expect(h).toBe(1123);

    // 「この請求分を入金済みにする」で未回収が減る（紙は7月分のまま）
    await page.locator("#btnPaid").click();
    await page.locator("#mdPaidOk").click();
    await expect(page.locator("#invBadge")).toHaveText("1");
    await expect(page.locator("#invName option[value='山本商事']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥47,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書: 明細が多くてもA4からはみ出さない（ほかn件で受ける）", async ({ page }) => {
    const errors = await open(page);
    for (let i = 1; i <= 25; i++) {
      await addSale(page, {
        date: "2026-07-" + String(i).padStart(2, "0"),
        name: "山本商事",
        people: 2,
        amount: 5000 + i * 100,
        pay: "invoice",
        receipt: false,
        memo: i % 5 === 0 ? "ボトル入れ" : "",
      });
    }
    await openLook(page);
    // 1枚に載る行数はレイアウトごとに違う（カード14 / 帯13 / 縦組み14）。
    // どのレイアウトでも「載らない分は ほかn件」で受けて、A4を割らないこと。
    const rowsByTpl = { card: 14, band: 13, tate: 14 };
    for (const tpl of ["card", "band", "tate"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      const n = rowsByTpl[tpl];
      await expect(page.locator("#invSheets .iv-tbl tbody tr")).toHaveCount(n);
      await expect(page.locator("#invSheets .iv-more")).toContainText("ほか " + (25 - n) + " 件");
      const h = await page
        .locator("#invSheets .sheet")
        .first()
        .evaluate((el) => el.offsetHeight);
      expect(h, `${tpl} がA4(1123px)を超えている`).toBe(1123);
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書タブ: 未回収がゼロでも見本の請求書が出る（デザインを比べられる）", async ({
    page,
  }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await page.locator(".nav-item[data-scr='inv']").click();
    // 紙が出る（真っ白にならない）＋「見本」と分かる
    await expect(page.locator("#invSheets .iv-title")).toContainText("請");
    await expect(page.locator("#invSample")).toBeVisible();
    await expect(page.locator("#invSheets .iv-tbl tbody tr")).toHaveCount(3);
    const h = await page
      .locator("#invSheets .sheet")
      .first()
      .evaluate((el) => el.offsetHeight);
    expect(h).toBe(1123);
    // デザインは3つとも見本で切り替えられる
    await openLook(page);
    for (const tpl of ["band", "tate", "card"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      await expect(page.locator("#invSheets .sheet")).toHaveClass(new RegExp("iv-" + tpl));
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("設定タブ: 店名と税率を変えると、紙と請求書に反映される", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#setStore").fill("スナック ゼロ");
    await page.locator("#setBank").fill("伊予銀行 今治支店 普通 1234567");
    await page.locator("#btnSaveSet").click();

    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets .sh-store").first()).toHaveText("スナック ゼロ");

    // 税率8%に切り替え → 請求書の内訳が変わる（32,000 → 税2,370）
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#setRate button[data-rate='0.08']").click();
    await page.locator(".nav-item[data-scr='inv']").click();
    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-sum tr").nth(1)).toContainText("2,370");
    await expect(page.locator("#invSheets .iv-bank")).toContainText("伊予銀行");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("設定タブ: 全部消すが効く", async ({ page }) => {
    const errors = await open(page);
    await seed(page);
    await page.locator(".nav-item[data-scr='set']").click();
    await page.locator("#btnWipe").click();
    await page.locator("#mdYes").click();
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(0);
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("期間の月送り（◀▶）が効く", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    await addSale(page, {
      date: "2026-08-01",
      name: "佐藤",
      people: 2,
      amount: 6000,
      pay: "cash",
      receipt: false,
    });

    await page.locator(".nav-item[data-scr='list']").click();
    await page.locator("#periodList .period-lb").click();
    await page.locator("#mdFrom").fill("2026-07-01");
    await page.locator("#mdTo").fill("2026-07-31");
    await page.locator("#mdOk").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(1);

    // 範囲指定 → タップで月モードに戻す → 月送り
    await page.locator("#periodList .period-lb").click();
    await expect(page.locator("#periodList .period-lb")).toContainText("年");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("印刷/PDFは同じ画面のまま出す（別タブを開かない・原寸A4）", async ({ page, context }) => {
    const errors = await open(page);
    await seed(page);

    for (const btn of ["#btnPrintList"]) {
      await page.locator(btn).click();
      await page.waitForTimeout(300);
      expect(context.pages().length, "別タブが開いている").toBe(1);
      // 印刷の見た目で確かめる（画面の部品が隠れ、紙だけが原寸A4で出る）
      await page.emulateMedia({ media: "print" });
      const m = await page.evaluate(() => {
        const sheet = document.querySelector("#printArea .sheet");
        const cs = (sel) => getComputedStyle(document.querySelector(sel)).display;
        return {
          w: sheet ? sheet.offsetWidth : 0,
          h: sheet ? sheet.offsetHeight : 0,
          title: document.querySelector("#printArea .sh-title").textContent.trim(),
          header: cs(".app-header"),
          nav: cs(".bottom-nav"),
          screen: cs(".screen.active"),
          area: cs("#printArea"),
        };
      });
      await page.emulateMedia({ media: "screen" });
      expect(m.title).toBe("売 上 帳");
      expect(m.w, "紙が原寸A4(794px)でない").toBe(794);
      expect(m.h).toBe(1123);
      expect([m.header, m.nav, m.screen]).toEqual(["none", "none", "none"]);
      expect(m.area).toBe("block");
    }

    // 税理士の紙も同じように出せる
    await page.locator(".nav-item[data-scr='tax']").click();
    await page.locator("#btnPrintTax").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#printArea .sh-title").first()).toHaveText("売 上 報 告 書");
    expect(context.pages().length).toBe(1);
    // 印刷が終われば中身は片付けられる
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await expect(page.locator("#printArea .sheet")).toHaveCount(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("iPhone幅で横にはみ出さない（表が枠から出ない）", async ({ page }) => {
    const errors = await open(page);
    await page.setViewportSize({ width: 390, height: 664 });
    await seed(page);
    for (const scr of ["input", "list", "sum", "inv", "tax", "set"]) {
      await page.evaluate((s) => window.__NOMIYA.showScreen(s), scr);
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const over = [];
        document.querySelectorAll(".screen.active table, .screen.active .card").forEach((el) => {
          if (el.scrollWidth > el.clientWidth + 1) {
            over.push((el.className || el.tagName) + " " + el.scrollWidth + ">" + el.clientWidth);
          }
        });
        return { docW: document.documentElement.scrollWidth, view: window.innerWidth, over };
      });
      expect(m.over, `${scr} ではみ出し`).toEqual([]);
      expect(m.docW, `${scr} で横スクロールが出る`).toBeLessThanOrEqual(m.view);
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("iPhone幅で下に余分な空白が出ない", async ({ page }) => {
    const errors = await open(page);
    await page.setViewportSize({ width: 390, height: 664 });
    await seed(page);
    for (const scr of ["input", "list", "sum", "inv", "tax", "set"]) {
      await page.locator(`.nav-item[data-scr='${scr}']`).click();
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => {
        const active = document.querySelector(".screen.active");
        const r = active.getBoundingClientRect();
        return {
          doc: Math.round(document.documentElement.scrollHeight),
          contentBottom: Math.round(r.bottom + window.scrollY),
        };
      });
      // 中身の下から、下ナビのぶん(72px)＋少しの余白しか無いこと
      const gap = m.doc - m.contentBottom;
      expect(gap, `${scr} の下に余分な空白 ${gap}px`).toBeLessThanOrEqual(90);
    }
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書送りは名前を打たずに、登録した会社から選ぶ（最近選んだ順）", async ({ page }) => {
    const errors = await open(page);

    // ふだんは自由入力。請求書送りを押した瞬間だけドロップダウンになる
    await page.locator("#inDate").fill("2026-07-03");
    await expect(page.locator("#inName")).toBeVisible();
    await expect(page.locator("#inNameSel")).toBeHidden();
    await page.locator("#payChips button[data-pay='invoice']").click();
    await expect(page.locator("#inName")).toBeHidden();
    await expect(page.locator("#inNameSel")).toBeVisible();
    // まだ登録が無いので「選んでください」と「＋ 新しく登録する」だけ
    expect(await page.locator("#inNameSel option").allInnerTexts()).toEqual([
      "（選んでください）",
      "＋ 新しく登録する",
    ]);

    // その場で登録する → 選ばれた状態で戻ってくる
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptPerson").fill("総務部 山本 様");
    await page.locator("#ptOk").click();
    await expect(page.locator("#scr-input")).toBeVisible();
    await expect(page.locator("#inNameSel")).toHaveValue("株式会社山本商事");

    await page.locator("#inPeople").fill("4");
    await page.locator("#inAmount").fill("32000");
    await page.locator("#btnSave").click();
    expect(await page.evaluate(() => window.__NOMIYA.sales[0].name)).toBe("株式会社山本商事");

    // 現金に戻すと自由入力に戻る（個人客は打てる）
    await page.locator("#payChips button[data-pay='cash']").click();
    await expect(page.locator("#inName")).toBeVisible();
    await expect(page.locator("#inNameSel")).toBeHidden();

    // 2社目を登録すると、最後に選んだ会社が上に来る
    await page.locator("#payChips button[data-pay='invoice']").click();
    await page.locator("#inNameSel").selectOption("__new");
    await page.locator("#ptName").fill("田中建設株式会社");
    await page.locator("#ptOk").click();
    await page.locator("#inPeople").fill("2");
    await page.locator("#inAmount").fill("9000");
    await page.locator("#btnSave").click();

    await page.locator("#payChips button[data-pay='invoice']").click();
    expect(await page.locator("#inNameSel option").allInnerTexts()).toEqual([
      "（選んでください）",
      "田中建設株式会社",
      "株式会社山本商事",
      "＋ 新しく登録する",
    ]);
    // 選び直さないまま保存はできない（相手を間違えないため）
    await page.locator("#inAmount").fill("5000");
    await page.locator("#btnSave").click();
    await expect(page.locator("#inErr")).toContainText("名前");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(2);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("請求書は「◯月分」で1枚（月送りで前の月も出せる・紙に期間が出る）", async ({ page }) => {
    const errors = await open(page);
    await seed(page); // 7月に 山本商事(請求書送り32,000) と 田中(ツケ5,000)
    // 6月にも1件入れておく
    await addSale(page, {
      date: "2026-06-20",
      name: "山本商事",
      people: 2,
      amount: 9000,
      pay: "invoice",
      receipt: false,
    });

    await page.locator(".nav-item[data-scr='inv']").click();
    // 起動時は今月。テストの月に合わせるため、2026年7月まで送る
    const label = () => page.locator("#periodInv .period-lb");
    for (let i = 0; i < 36; i++) {
      if ((await label().innerText()).trim() === "2026年7月分") break;
      const now = (await label().innerText()).trim();
      await page.locator(`#periodInv [data-imv="${now > "2026年7月分" ? -1 : 1}"]`).click();
    }
    await expect(label()).toHaveText("2026年7月分");

    // その月に請求書送り・ツケがある相手だけ出る
    expect((await page.locator("#invName option").allInnerTexts()).map((t) => t.trim())).toEqual([
      "山本商事",
      "田中",
    ]);
    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥32,000");
    // 紙に「◯月分（期間）」が出る
    await expect(page.locator("#invSheets .iv-cap")).toContainText("2026年7月分");
    await expect(page.locator("#invSheets .iv-meta")).toContainText("202607-");

    // ◀ で6月分。中身も番号も6月のものに変わる
    await page.locator('#periodInv [data-imv="-1"]').click();
    await expect(label()).toHaveText("2026年6月分");
    expect((await page.locator("#invName option").allInnerTexts()).map((t) => t.trim())).toEqual([
      "山本商事",
    ]);
    await expect(page.locator("#invSheets .iv-grand b")).toHaveText("¥9,000");
    await expect(page.locator("#invSheets .iv-cap")).toContainText("2026年6月分");
    // 過ぎた月なので請求日は締め日（その月の末日）
    await expect(page.locator("#invSheets .iv-meta")).toContainText("2026年6月30日");
    await expect(page.locator("#invSheets .iv-meta")).toContainText("202606-");

    // 売上が無い月は相手がいない＝見本になる
    await page.locator('#periodInv [data-imv="-1"]').click();
    await expect(label()).toHaveText("2026年5月分");
    await expect(page.locator("#invName")).toContainText("この月は請求書送り・ツケがありません");
    await expect(page.locator("#invSample")).toBeVisible();
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("宛先マスタ: 請求書の宛名が会社名になり、担当者が出る（A4を割らない）", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    // 担当者を足す（相手の住所は請求書には出さない）
    await openPartners(page);
    await expect(page.locator("#partnerList .li")).toHaveCount(1);
    await page.locator("#partnerList .li").click();
    await expect(page.locator("#ptName")).toHaveValue("山本商事");
    await page.locator("#ptPerson").fill("総務部 山本 様");
    await page.locator("#ptOk").click();

    await page.locator("#invName").selectOption("山本商事");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("山本商事　御中");
    await expect(page.locator("#invSheets .iv-tosub")).toHaveText("総務部 山本 様");
    // 相手の住所は出さない（登録する欄も置いていない）
    await expect(page.locator("#invSheets")).not.toContainText("愛媛県今治市栄町");

    // 明細が多くても、担当者のぶんだけ行を減らしてA4に収める
    for (let i = 6; i <= 26; i++) {
      await addSale(page, {
        date: "2026-07-" + String(i).padStart(2, "0"),
        name: "山本商事",
        people: 2,
        amount: 5000,
        pay: "invoice",
        receipt: false,
      });
    }
    await openLook(page);
    for (const tpl of ["band", "tate", "card"]) {
      await page.locator(`#invTpl button[data-tpl="${tpl}"]`).click();
      const m = await page
        .locator("#invSheets .sheet")
        .first()
        .evaluate((el) => ({ h: el.offsetHeight, sh: el.scrollHeight }));
      expect(m.h, `${tpl} がA4(1123px)を超えている`).toBe(1123);
      expect(m.sh, `${tpl} の中身が紙からはみ出している`).toBeLessThanOrEqual(1123);
    }

    // 登録していない相手（ツケの田中）は名前＋御中のまま
    await page.locator("#invName").selectOption("田中");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("田中　御中");
    await expect(page.locator("#invSheets .iv-tosub")).toHaveCount(0);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("宛先マスタ: 会社名を直すと売上の名前も一緒に直る・様にできる・消せる", async ({ page }) => {
    const errors = await open(page);
    await seed(page);

    // 会社名を「株式会社」付きに直す → 売上帳の名前も請求書の宛名も一緒に変わる
    await openPartners(page);
    await page.locator("#partnerList .li").click();
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptHonor button[data-h='様']").click();
    await page.locator("#ptOk").click();
    expect(await page.evaluate(() => window.__NOMIYA.sales.map((s) => s.name))).toContain(
      "株式会社山本商事"
    );
    await page.locator("#invName").selectOption("株式会社山本商事");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("株式会社山本商事　様");
    // 売上帳にも新しい名前で出る（件数は増えていない）
    await page.locator(".nav-item[data-scr='list']").click();
    await expect(page.locator("#listSheets tr[data-id]")).toHaveCount(5);
    await expect(page.locator("#listSheets")).toContainText("株式会社山本商事");

    // 開き直しても残る
    await page.reload({ waitUntil: "load" });
    await openPartners(page);
    await expect(page.locator("#partnerList .li-nm")).toHaveText("株式会社山本商事　様");

    // 同じ会社名は2つ作れない
    await page.locator("#btnPartnerNew").click();
    await page.locator("#ptName").fill("株式会社山本商事");
    await page.locator("#ptOk").click();
    await expect(page.locator("#ptErr")).toContainText("もう登録されています");
    // 会社名が空でも保存できない
    await page.locator("#ptName").fill("");
    await page.locator("#ptOk").click();
    await expect(page.locator("#ptErr")).toContainText("会社名");
    await page.locator("#modalX").click();

    // 消すと売上はそのまま残り、宛名は名前＋御中に戻る
    await openPartners(page);
    await page.locator("#partnerList .li").click();
    await page.locator("#ptDel").click();
    await openPartners(page);
    await expect(page.locator("#partnerList .empty")).toBeVisible();
    await page.locator("#modalX").click();
    await page.locator("#invName").selectOption("株式会社山本商事");
    await expect(page.locator("#invSheets .iv-to")).toHaveText("株式会社山本商事　御中");
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(5);
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });

  test("入れ直しても消えない（開き直しても残る）", async ({ page }) => {
    const errors = await open(page);
    await addSale(page, {
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "tsuke",
      receipt: false,
    });
    await page.reload({ waitUntil: "load" });
    expect(await page.evaluate(() => window.__NOMIYA.sales.length)).toBe(1);
    await page.locator(".nav-item[data-scr='inv']").click();
    await expect(page.locator("#invName option[value='田中']")).toHaveCount(1);
    await expect(page.locator("#invSheets .iv-grand")).toContainText("¥8,000");
    expect(errors, `pageerror: ${errors.join(" | ")}`).toEqual([]);
  });
});
