import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// 画面(nomiya-uriage.html)が読むのと同じ実ファイルを Node でロードし、
// 飲み屋の売上管理の「絞り込み・集計・未回収・請求書」を実数値で固定する。
const require = createRequire(import.meta.url);
const C = require("../nomiya-core.js");

// テスト用の売上（2026年7月・実際にありそうな1週間分）
function sale(o) {
  return C.normalizeSale(
    Object.assign(
      { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash", receipt: false },
      o
    ),
    "2026-07-01T00:00:00.000Z"
  );
}

const SALES = [
  sale({ date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash", receipt: false }),
  sale({
    date: "2026-07-01",
    name: "山本商事",
    people: 4,
    amount: 32000,
    pay: "invoice",
    receipt: true,
  }),
  sale({
    date: "2026-07-02",
    name: "佐藤",
    people: 3,
    amount: 12000,
    pay: "paypay",
    receipt: false,
  }),
  sale({ date: "2026-07-02", name: "田中", people: 1, amount: 5000, pay: "tsuke", receipt: false }),
  sale({
    date: "2026-07-05",
    name: "鈴木",
    people: 5,
    amount: 25000,
    pay: "credit",
    receipt: true,
  }),
  sale({
    date: "2026-07-31",
    name: "山本商事",
    people: 2,
    amount: 15000,
    pay: "invoice",
    receipt: true,
  }),
  sale({ date: "2026-08-01", name: "田中", people: 2, amount: 9000, pay: "cash", receipt: false }),
];

describe("支払い方法の定義", () => {
  it("5種類・並び順が固定（現金→クレジット→PayPay→請求書送り→ツケ）", () => {
    expect(C.PAY_KEYS).toEqual(["cash", "credit", "paypay", "invoice", "tsuke"]);
    expect(C.payLabel("paypay")).toBe("PayPay");
    expect(C.payLabel("invoice")).toBe("請求書送り");
  });
  it("未回収になるのは請求書送りとツケだけ", () => {
    expect(C.UNPAID_KEYS).toEqual(["invoice", "tsuke"]);
    expect(C.isUnpaidMethod("cash")).toBe(false);
    expect(C.isUnpaidMethod("tsuke")).toBe(true);
  });
});

describe("日付ユーティリティ", () => {
  it("月の範囲（月末が31/30/28/うるう29で正しい）", () => {
    expect(C.rangeOfMonth("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(C.rangeOfMonth("2026-06")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(C.rangeOfMonth("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(C.rangeOfMonth("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
  it("月送りが年をまたぐ", () => {
    expect(C.shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(C.shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(C.shiftMonth("2026-07", -13)).toBe("2025-06");
  });
  it("表示用の整形", () => {
    expect(C.mdShort("2026-07-05")).toBe("7/5");
    expect(C.jpDate("2026-07-05")).toBe("2026年7月5日");
    expect(C.jpMonth("2026-07")).toBe("2026年7月");
    expect(C.weekday("2026-07-01")).toBe("水"); // 2026-07-01 は水曜
  });
  it("Date→ISOはローカル日付（UTCずれで前日にならない）", () => {
    expect(C.toIso(new Date(2026, 6, 5, 1, 0, 0))).toBe("2026-07-05");
    expect(C.toIso(new Date(2026, 0, 1, 0, 30, 0))).toBe("2026-01-01");
  });
  it("金額のカンマ", () => {
    expect(C.comma(1234567)).toBe("1,234,567");
    expect(C.comma(0)).toBe("0");
    expect(C.yen(32000)).toBe("¥32,000");
  });
});

describe("1件の検証", () => {
  it("正しい1件は通る", () => {
    expect(
      C.validateSale({ date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash" }).ok
    ).toBe(true);
  });
  it("空欄・不正値は理由付きで弾く", () => {
    const r = C.validateSale({ date: "", name: "  ", people: 0, amount: -1, pay: "bitcoin" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(5);
  });
  it("金額が空文字なら0にせず弾く（黙って0円で保存しない）", () => {
    const r = C.validateSale({
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: "",
      pay: "cash",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("金額");
  });
  it("人数が空文字なら1人にせず弾く", () => {
    const r = C.validateSale({
      date: "2026-07-01",
      name: "田中",
      people: "",
      amount: 8000,
      pay: "cash",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("人数");
  });
  it("金額0円（サービス・0円会計）は通す", () => {
    expect(
      C.validateSale({ date: "2026-07-01", name: "田中", people: 2, amount: 0, pay: "cash" }).ok
    ).toBe(true);
  });
  it("現金で保存したら paidDate は持たない（その場で回収済み）", () => {
    const s = C.normalizeSale({
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      paidDate: "2026-07-09",
    });
    expect(s.paidDate).toBe(null);
  });
  it("IDは同一ミリ秒の連投でも重複しない", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(C.makeId());
    expect(ids.size).toBe(1000);
  });
});

describe("絞り込み（タブ切り替えの中身）", () => {
  const july = C.rangeOfMonth("2026-07");

  it("7月だけ（8月分は入らない）", () => {
    const rows = C.filterSales(SALES, july);
    expect(rows.length).toBe(6);
  });
  it("支払い方法別", () => {
    expect(C.filterSales(SALES, { ...july, pay: "invoice" }).length).toBe(2);
    expect(C.filterSales(SALES, { ...july, pay: "cash" }).length).toBe(1);
    expect(C.filterSales(SALES, { ...july, pay: "all" }).length).toBe(6);
  });
  it("領収書あり／なし別", () => {
    expect(C.filterSales(SALES, { ...july, receipt: "yes" }).length).toBe(3);
    expect(C.filterSales(SALES, { ...july, receipt: "no" }).length).toBe(3);
  });
  it("支払い方法と領収書の重ねがけ", () => {
    const rows = C.filterSales(SALES, { ...july, pay: "invoice", receipt: "yes" });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.pay === "invoice" && r.receipt)).toBe(true);
  });
  it("消した行は出てこない", () => {
    const withDeleted = SALES.concat([sale({ date: "2026-07-03", amount: 99999, deletedAt: "x" })]);
    expect(C.filterSales(withDeleted, july).length).toBe(6);
    expect(C.summarize(C.filterSales(withDeleted, july)).amount).toBe(97000);
  });
  it("日付昇順→同日は入力順で並ぶ", () => {
    const rows = C.sortSales(C.filterSales(SALES, july));
    expect(rows.map((r) => r.date)).toEqual([
      "2026-07-01",
      "2026-07-01",
      "2026-07-02",
      "2026-07-02",
      "2026-07-05",
      "2026-07-31",
    ]);
  });
});

describe("集計", () => {
  const july = C.filterSales(SALES, C.rangeOfMonth("2026-07"));

  it("合計・組数・のべ人数・単価", () => {
    const s = C.summarize(july);
    expect(s.amount).toBe(8000 + 32000 + 12000 + 5000 + 25000 + 15000); // 97,000
    expect(s.amount).toBe(97000);
    expect(s.count).toBe(6);
    expect(s.people).toBe(17);
    expect(s.perGroup).toBe(Math.round(97000 / 6)); // 16,167
    expect(s.perGroup).toBe(16167);
    expect(s.perPerson).toBe(Math.round(97000 / 17)); // 5,706
    expect(s.perPerson).toBe(5706);
  });
  it("0件でも0割りしない", () => {
    const s = C.summarize([]);
    expect(s).toEqual({ count: 0, people: 0, amount: 0, perGroup: 0, perPerson: 0 });
  });

  it("支払い方法別（0件の行も消えない・構成比の合計は1）", () => {
    const rows = C.byPayMethod(july);
    expect(rows.map((r) => r.key)).toEqual(["cash", "credit", "paypay", "invoice", "tsuke"]);
    const m = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(m.cash.amount).toBe(8000);
    expect(m.credit.amount).toBe(25000);
    expect(m.paypay.amount).toBe(12000);
    expect(m.invoice.amount).toBe(47000);
    expect(m.tsuke.amount).toBe(5000);
    expect(m.invoice.count).toBe(2);
    expect(rows.reduce((a, r) => a + r.amount, 0)).toBe(97000);
    expect(rows.reduce((a, r) => a + r.ratio, 0)).toBeCloseTo(1, 10);
    expect(m.cash.ratio).toBeCloseTo(8000 / 97000, 10);
  });
  it("支払い方法別は0件でも5行返り、構成比は0", () => {
    const rows = C.byPayMethod([]);
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.amount === 0 && r.ratio === 0)).toBe(true);
  });

  it("領収書あり／なし別", () => {
    const rows = C.byReceipt(july);
    expect(rows[0].key).toBe("yes");
    expect(rows[0].amount).toBe(32000 + 25000 + 15000); // 72,000
    expect(rows[0].count).toBe(3);
    expect(rows[1].amount).toBe(8000 + 12000 + 5000); // 25,000
    expect(rows[0].amount + rows[1].amount).toBe(97000);
    expect(rows[0].ratio).toBeCloseTo(72000 / 97000, 10);
  });

  it("日別（売上のある日だけ・昇順）", () => {
    const rows = C.byDay(july);
    expect(rows.map((r) => r.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-05",
      "2026-07-31",
    ]);
    expect(rows[0].amount).toBe(40000);
    expect(rows[0].count).toBe(2);
    expect(rows[0].people).toBe(6);
  });
});

describe("未回収（請求書送り・ツケ）", () => {
  it("入金前は未回収に出る", () => {
    const un = C.unpaidSales(SALES);
    expect(un.length).toBe(3); // 山本商事2件 + 田中ツケ1件
    expect(un.reduce((a, s) => a + s.amount, 0)).toBe(52000);
  });
  it("相手ごとの残高（多い順）", () => {
    const g = C.unpaidByName(SALES);
    expect(g[0].name).toBe("山本商事");
    expect(g[0].amount).toBe(47000);
    expect(g[0].count).toBe(2);
    expect(g[0].first).toBe("2026-07-01");
    expect(g[0].last).toBe("2026-07-31");
    expect(g[1].name).toBe("田中");
    expect(g[1].amount).toBe(5000);
  });
  it("入金を付けたら未回収から消える", () => {
    const paid = SALES.map((s) =>
      s.name === "山本商事" ? Object.assign({}, s, { paidDate: "2026-08-10" }) : s
    );
    const g = C.unpaidByName(paid);
    expect(g.length).toBe(1);
    expect(g[0].name).toBe("田中");
    // 売上そのものは減らない（入金は回収の記録であって売上の取り消しではない）
    expect(C.summarize(C.filterSales(paid, C.rangeOfMonth("2026-07"))).amount).toBe(97000);
  });
  it("現金・クレカ・PayPayは未回収に混ざらない", () => {
    expect(C.unpaidSales(SALES).every((s) => s.pay === "invoice" || s.pay === "tsuke")).toBe(true);
  });
});

describe("領収書の3通り（なし / あり / あとで）", () => {
  it("旧データ(true/false)も画面の yes/no も同じ形に揃える", () => {
    expect(C.normalizeReceipt(true)).toBe("issued");
    expect(C.normalizeReceipt(false)).toBe("none");
    expect(C.normalizeReceipt("yes")).toBe("issued");
    expect(C.normalizeReceipt("no")).toBe("none");
    expect(C.normalizeReceipt("later")).toBe("later");
    expect(C.normalizeReceipt(undefined)).toBe("none");
    expect(C.normalizeReceipt("へんな値")).toBe("none");
  });
  it("'none' は文字列だが「あり」と数えない（!!receipt の取り違えを防ぐ）", () => {
    const s = C.normalizeSale({
      date: "2026-07-01",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: false,
    });
    expect(s.receipt).toBe("none");
    expect(C.isIssued(s)).toBe(false);
    expect(!!s.receipt).toBe(true); // 文字列なので真になる=だから isIssued を使う
  });
  it("発行済みなら発行日が入り、出していなければ入らない", () => {
    const base = { date: "2026-07-01", name: "田中", people: 2, amount: 8000, pay: "cash" };
    expect(C.normalizeSale({ ...base, receipt: "issued" }).receiptDate).toBe("2026-07-01");
    expect(
      C.normalizeSale({ ...base, receipt: "issued", receiptDate: "2026-08-10" }).receiptDate
    ).toBe("2026-08-10");
    expect(C.normalizeSale({ ...base, receipt: "later" }).receiptDate).toBe(null);
    expect(C.normalizeSale({ ...base, receipt: "none" }).receiptDate).toBe(null);
  });
  it("紙に出す印は集計と同じ2つ（あり側=○ / なし側=空）", () => {
    expect(C.receiptMark("issued")).toBe("○");
    expect(C.receiptMark("na")).toBe("○"); // 振込・カードも「あり」側
    expect(C.receiptMark("later")).toBe(""); // あとで渡す＝まだ出していない
    expect(C.receiptMark("none")).toBe("");
    expect(C.receiptMark(true)).toBe("○");
  });

  const MIX = [
    sale({ name: "現金あり", pay: "cash", amount: 10000, receipt: "issued" }),
    sale({ name: "現金なし", pay: "cash", amount: 20000, receipt: "none" }),
    sale({ name: "ツケあとで", pay: "tsuke", amount: 30000, receipt: "later" }),
    sale({ name: "請求書あとで", pay: "invoice", amount: 40000, receipt: "later" }),
  ];

  it("「あり」は発行済み＋振込・カード・「なし」は未発行(なし＋あとで)", () => {
    expect(C.filterSales(MIX, { receipt: "yes" }).map((s) => s.name)).toEqual(["現金あり"]);
    expect(C.filterSales(MIX, { receipt: "no" }).map((s) => s.name)).toEqual([
      "現金なし",
      "ツケあとで",
      "請求書あとで",
    ]);
    expect(C.filterSales(MIX, { receipt: "later" }).map((s) => s.name)).toEqual([
      "ツケあとで",
      "請求書あとで",
    ]);
  });
  it("集計のあり/なしも同じ数え方（合計は必ず全体と一致）", () => {
    const r = C.byReceipt(MIX);
    expect(r[0].amount).toBe(10000);
    expect(r[1].amount).toBe(90000);
    expect(r[0].amount + r[1].amount).toBe(C.summarize(MIX).amount);
  });
  it("「あとで」の残りを別に数えられる（取りこぼし防止）", () => {
    const l = C.laterReceipts(MIX);
    expect(l.count).toBe(2);
    expect(l.amount).toBe(70000);
  });
});

describe("領収書は支払い方法で「要る/要らない」が違う", () => {
  it("選べる状態と既定が支払い方法ごとに決まる", () => {
    expect(C.receiptChoices("cash")).toEqual(["none", "issued"]);
    expect(C.receiptChoices("credit")).toEqual(["na", "issued"]);
    expect(C.receiptChoices("paypay")).toEqual(["na", "issued"]);
    expect(C.receiptChoices("invoice")).toEqual(["na", "issued"]); // 振込は請求書が証憑＝不要が既定
    expect(C.receiptChoices("tsuke")).toEqual(["later", "issued", "none"]); // 回収時に渡す
    expect(C.defaultReceipt("cash")).toBe("none");
    expect(C.defaultReceipt("invoice")).toBe("na");
    expect(C.defaultReceipt("tsuke")).toBe("later");
  });
  it("その支払い方法にない状態は既定に戻す（変な組み合わせを保存しない）", () => {
    expect(C.fixReceiptFor("invoice", "none")).toBe("na"); // 振込に「なし」はない
    expect(C.fixReceiptFor("cash", "na")).toBe("none"); // 現金に「不要」はない
    expect(C.fixReceiptFor("cash", "later")).toBe("none");
    expect(C.fixReceiptFor("invoice", "issued")).toBe("issued"); // 求められて出した＝あり
    expect(C.fixReceiptFor("tsuke", "later")).toBe("later");
  });

  // 現金なし / 現金あり / 振込(不要) / カード(不要) / ツケ(あとで)
  const MIX2 = [
    sale({ name: "現金なし", pay: "cash", amount: 10000, receipt: "none" }),
    sale({ name: "現金あり", pay: "cash", amount: 20000, receipt: "issued" }),
    sale({ name: "振込", pay: "invoice", amount: 30000, receipt: "na" }),
    sale({ name: "カード", pay: "credit", amount: 40000, receipt: "na" }),
    sale({ name: "ツケ", pay: "tsuke", amount: 50000, receipt: "later" }),
  ];

  it("★振込・カードは「領収書あり」側に入る（なしを外しても落ちない）", () => {
    const yes = C.filterSales(MIX2, { receipt: "yes" });
    expect(yes.map((s) => s.name)).toEqual(["現金あり", "振込", "カード"]);
    const no = C.filterSales(MIX2, { receipt: "no" });
    expect(no.map((s) => s.name)).toEqual(["現金なし", "ツケ"]); // 振込・カードは入らない
    // 細かく見たいときだけ振込・カードだけを取り出せる
    const na = C.filterSales(MIX2, { receipt: "na" });
    expect(na.map((s) => s.name)).toEqual(["振込", "カード"]);
    expect(C.summarize(na).amount).toBe(70000);
  });
  it("集計は あり / なし の2区分で、合計は必ず全体と一致", () => {
    const r = C.byReceipt(MIX2);
    expect(r.map((x) => x.key)).toEqual(["yes", "no"]);
    expect(r[0].amount).toBe(90000); // 現金あり20,000 + 振込30,000 + カード40,000
    expect(r[1].amount).toBe(60000); // 現金なし10,000 + ツケ(あとで)50,000
    expect(r.reduce((a, x) => a + x.amount, 0)).toBe(C.summarize(MIX2).amount);
    expect(r.reduce((a, x) => a + x.count, 0)).toBe(5);
  });
  it("紙の印も集計の2区分と揃っている", () => {
    expect(C.receiptMark("na")).toBe("○");
    expect(C.receiptMark("issued")).toBe("○");
    expect(C.receiptMark("later")).toBe("");
    expect(C.receiptMark("none")).toBe("");
  });
  it("振込・カードの「不要」は理由を説明する", () => {
    const inv = C.receiptNotes({ pay: "invoice", receipt: "na", amount: 30000 });
    expect(inv[0]).toContain("請求書が証憑");
    expect(inv[0]).toContain("求められたら出せます");
    const card = C.receiptNotes({ pay: "credit", receipt: "na", amount: 30000 });
    expect(card[0]).toContain("売上票");
  });
});

describe("領収書の注意（黄色い注記・止めない）", () => {
  const mk = (o) => sale({ date: "2026-07-01", name: "客", people: 2, ...o });

  it("カード払いで領収書を出すとき＝印紙不要・売上票が証憑・二重発行注意", () => {
    const n = C.receiptNotes(mk({ pay: "credit", amount: 60000, receipt: "issued" }));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("クレジットカード払い");
    expect(n[0]).toContain("収入印紙も不要");
    // PayPayも同じ扱い
    expect(C.receiptNotes(mk({ pay: "paypay", amount: 60000, receipt: "issued" }))[0]).toContain(
      "売上票"
    );
  });
  it("現金で税抜5万円以上の紙の領収書＝収入印紙が必要", () => {
    // 税込55,000 → 税抜50,000 でちょうど境目に乗る
    const n = C.receiptNotes(mk({ pay: "cash", amount: 55000, receipt: "issued" }));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("収入印紙が必要");
    expect(n[0]).toContain("50,000");
  });
  it("税抜5万円未満なら注意を出さない（境目は税込54,999円＝税抜50,000円）", () => {
    // 54,999 → 税抜 50,000 でちょうど必要
    expect(C.taxIncluded(54999).net).toBe(50000);
    expect(C.receiptNotes(mk({ pay: "cash", amount: 54999, receipt: "issued" })).length).toBe(1);
    // 54,998 → 税抜 49,999 で不要
    expect(C.taxIncluded(54998).net).toBe(49999);
    expect(C.receiptNotes(mk({ pay: "cash", amount: 54998, receipt: "issued" }))).toEqual([]);
    expect(C.receiptNotes(mk({ pay: "cash", amount: 10000, receipt: "issued" }))).toEqual([]);
  });
  it("領収書を出さないなら何も言わない", () => {
    expect(C.receiptNotes(mk({ pay: "cash", amount: 99999, receipt: "none" }))).toEqual([]);
  });
  it("その場で払っているのに「あとで」なら、そう言う", () => {
    const n = C.receiptNotes(mk({ pay: "cash", amount: 8000, receipt: "later" }));
    expect(n.length).toBe(1);
    expect(n[0]).toContain("「あり」で記録");
    // ツケ・請求書送りの「あとで」は普通のことなので言わない
    expect(C.receiptNotes(mk({ pay: "tsuke", amount: 8000, receipt: "later" }))).toEqual([]);
    expect(C.receiptNotes(mk({ pay: "invoice", amount: 8000, receipt: "later" }))).toEqual([]);
  });
});

describe("同じ日付は最初の行だけ出す（紙の圧迫感を減らす）", () => {
  it("同じ日が続いたら2行目以降は日付を出さない", () => {
    const rows = C.sortSales(C.filterSales(SALES, C.rangeOfMonth("2026-07")));
    const marked = C.markFirstOfDate(rows);
    // 7/1,7/1,7/2,7/2,7/5,7/31
    expect(marked.map((m) => m.showDate)).toEqual([true, false, true, false, true, true]);
    // 中身は入れ替わらない
    expect(marked.map((m) => m.sale.date)).toEqual(rows.map((r) => r.date));
  });
  it("1件だけなら出す・0件なら空", () => {
    expect(C.markFirstOfDate([{ date: "2026-07-01" }]).map((m) => m.showDate)).toEqual([true]);
    expect(C.markFirstOfDate([])).toEqual([]);
    expect(C.markFirstOfDate(null)).toEqual([]);
  });
  it("日付が飛んで戻っても、直前の行とだけ比べる（ページを跨いでも崩れない前提の素直な規則）", () => {
    const r = [{ date: "7/1" }, { date: "7/2" }, { date: "7/1" }].map((x) => ({ date: x.date }));
    expect(C.markFirstOfDate(r).map((m) => m.showDate)).toEqual([true, true, true]);
  });
});

describe("未回収は「請求書送り」と「ツケ」に分ける", () => {
  it("2グループが常に同じ順で返る（0件でも消えない）", () => {
    const g = C.unpaidGroups(SALES);
    expect(g.map((x) => x.key)).toEqual(["invoice", "tsuke"]);
    expect(g[0].label).toBe("請求書送り");
    expect(g[0].amount).toBe(47000); // 山本商事 32,000 + 15,000
    expect(g[0].count).toBe(2);
    expect(g[0].names.map((n) => n.name)).toEqual(["山本商事"]);
    expect(g[1].label).toBe("ツケ");
    expect(g[1].amount).toBe(5000); // 田中のツケ
    expect(g[1].names.map((n) => n.name)).toEqual(["田中"]);
    expect(C.unpaidGroups([]).map((x) => x.amount)).toEqual([0, 0]);
  });
  it("2グループの合計＝未回収の合計（取りこぼしがない）", () => {
    const g = C.unpaidGroups(SALES);
    const all = C.unpaidSales(SALES).reduce((a, s) => a + s.amount, 0);
    expect(g.reduce((a, x) => a + x.amount, 0)).toBe(all);
    expect(all).toBe(52000);
  });
  it("支払い方法を指定した相手別も出せる", () => {
    expect(C.unpaidByName(SALES, "tsuke").map((n) => n.name)).toEqual(["田中"]);
    expect(C.unpaidByName(SALES, "invoice")[0].amount).toBe(47000);
    expect(C.unpaidByName(SALES, "cash")).toEqual([]); // 現金は未回収にならない
  });
  it("入金したら該当グループから消える", () => {
    const paid = SALES.map((s) => (s.pay === "tsuke" ? { ...s, paidDate: "2026-08-01" } : s));
    const g = C.unpaidGroups(paid);
    expect(g[0].amount).toBe(47000);
    expect(g[1].amount).toBe(0);
    expect(g[1].names).toEqual([]);
  });
});

describe("宛先（請求書送りの相手）", () => {
  it("登録が無ければ名前をそのまま宛名にして「御中」を付ける（今までと同じ）", () => {
    const t = C.invoiceTo({}, "山本商事");
    expect(t).toEqual({ to: "山本商事", honor: "御中", person: "", registered: false });
  });
  it("登録があれば宛名・敬称・担当者を差し替える", () => {
    const partners = {
      山本商事: C.normalizePartner(
        {
          name: "山本商事",
          to: "株式会社山本商事",
          honor: "御中",
          person: "総務部 山本様",
        },
        "2026-07-28T00:00:00.000Z"
      ),
    };
    const t = C.invoiceTo(partners, "山本商事");
    expect(t.to).toBe("株式会社山本商事");
    expect(t.person).toBe("総務部 山本様");
    expect(t.registered).toBe(true);
  });
  it("個人客は「様」も選べる（変な値は御中に倒す）", () => {
    expect(C.normalizePartner({ name: "田中", honor: "様" }).honor).toBe("様");
    expect(C.normalizePartner({ name: "田中", honor: "殿" }).honor).toBe("御中");
    expect(C.normalizePartner({ name: "田中" }).honor).toBe("御中");
  });
  it("前後の空白は落とす・名前が無ければ弾く", () => {
    const p = C.normalizePartner({ name: "  山本商事  ", to: " 株式会社山本商事 " });
    expect(p.name).toBe("山本商事");
    expect(p.to).toBe("株式会社山本商事");
    expect(C.validatePartner({ name: "   " }).ok).toBe(false);
    expect(C.validatePartner({ name: "山本商事" }).ok).toBe(true);
  });
  it("登録済みは名前順に並ぶ", () => {
    const m = {
      田中: C.normalizePartner({ name: "田中" }),
      山本商事: C.normalizePartner({ name: "山本商事" }),
      あかり: C.normalizePartner({ name: "あかり" }),
    };
    expect(C.partnerList(m).map((x) => x.name)).toEqual(["あかり", "山本商事", "田中"]);
    expect(C.partnerList({})).toEqual([]);
    expect(C.partnerList(null)).toEqual([]);
  });
  it("宛名を別に打たなければ会社名がそのまま宛名になる", () => {
    const p = C.normalizePartner({ name: "株式会社山本商事" });
    expect(p.to).toBe("株式会社山本商事");
    expect(C.invoiceTo({ 株式会社山本商事: p }, "株式会社山本商事").to).toBe("株式会社山本商事");
  });
  it("選ぶと「最近選んだ順」の先頭に来る（選んでいないものは新しく登録したものが先）", () => {
    let m = {
      A社: C.normalizePartner({ name: "A社" }, "2026-07-01T00:00:00.000Z"),
      B社: C.normalizePartner({ name: "B社" }, "2026-07-02T00:00:00.000Z"),
      C社: C.normalizePartner({ name: "C社" }, "2026-07-03T00:00:00.000Z"),
    };
    // まだ一度も選んでいないうちは、あとから登録したものが上
    expect(C.partnerRecent(m).map((x) => x.name)).toEqual(["C社", "B社", "A社"]);
    m = C.touchPartner(m, "A社", "2026-07-10T00:00:00.000Z");
    expect(C.partnerRecent(m).map((x) => x.name)).toEqual(["A社", "C社", "B社"]);
    m = C.touchPartner(m, "B社", "2026-07-11T00:00:00.000Z");
    expect(C.partnerRecent(m).map((x) => x.name)).toEqual(["B社", "A社", "C社"]);
    expect(C.partnerRecent({})).toEqual([]);
    expect(C.partnerRecent(null)).toEqual([]);
  });
  it("登録していない名前を選んでも壊れない・元のデータは変えない", () => {
    const m = { A社: C.normalizePartner({ name: "A社" }, "2026-07-01T00:00:00.000Z") };
    expect(C.touchPartner(m, "知らない会社", "2026-07-10T00:00:00.000Z")).toBe(m);
    const after = C.touchPartner(m, "A社", "2026-07-10T00:00:00.000Z");
    expect(m["A社"].lastUsedAt).toBe(""); // 元は変わらない
    expect(after["A社"].lastUsedAt).toBe("2026-07-10T00:00:00.000Z");
    expect(after["A社"].updatedAt).toBe("2026-07-01T00:00:00.000Z"); // 直したわけではない
  });
});

describe("名前サジェスト", () => {
  it("最近来た人が上に来る", () => {
    const s = C.nameSuggestions(SALES);
    expect(s[0].name).toBe("田中"); // 8/1が最新
    expect(s.map((x) => x.name)).toContain("山本商事");
    expect(s.find((x) => x.name === "田中").count).toBe(3);
  });
});

describe("消費税（内税10%）", () => {
  it("税込から中の消費税を出す（1円未満切り捨て）", () => {
    expect(C.taxIncluded(10000)).toEqual({ total: 10000, tax: 909, net: 9091, rate: 0.1 });
    expect(C.taxIncluded(47000).tax).toBe(4272);
    expect(C.taxIncluded(47000).net).toBe(42728);
    expect(C.taxIncluded(1)).toEqual({ total: 1, tax: 0, net: 1, rate: 0.1 });
    expect(C.taxIncluded(0).tax).toBe(0);
  });
  it("税抜＋税＝税込がいつも一致する（1円のズレも出さない）", () => {
    for (let t = 0; t < 5000; t += 7) {
      const r = C.taxIncluded(t);
      expect(r.net + r.tax).toBe(t);
    }
  });
  it("税率8%（軽減）も出せる", () => {
    expect(C.taxIncluded(10800, 0.08)).toEqual({ total: 10800, tax: 800, net: 10000, rate: 0.08 });
  });
});

describe("請求書", () => {
  it("相手・期間で明細をまとめる（未入金だけ）", () => {
    const iv = C.buildInvoice(SALES, { name: "山本商事", from: "2026-07-01", to: "2026-07-31" });
    expect(iv.rows.length).toBe(2);
    expect(iv.count).toBe(2);
    expect(iv.people).toBe(6);
    expect(iv.total).toBe(47000);
    expect(iv.tax).toBe(4272);
    expect(iv.net).toBe(42728);
    expect(iv.net + iv.tax).toBe(iv.total);
  });
  it("現金の売上は請求書に載らない", () => {
    const iv = C.buildInvoice(SALES, { name: "田中", from: "2026-07-01", to: "2026-07-31" });
    expect(iv.rows.length).toBe(1); // ツケの1件だけ（現金8000は載らない）
    expect(iv.total).toBe(5000);
  });
  it("入金済みを含める指定もできる", () => {
    const paid = SALES.map((s) =>
      s.name === "山本商事" && s.date === "2026-07-01"
        ? Object.assign({}, s, { paidDate: "2026-07-20" })
        : s
    );
    expect(
      C.buildInvoice(paid, { name: "山本商事", from: "2026-07-01", to: "2026-07-31" }).total
    ).toBe(15000);
    expect(
      C.buildInvoice(paid, {
        name: "山本商事",
        from: "2026-07-01",
        to: "2026-07-31",
        unpaidOnly: false,
      }).total
    ).toBe(47000);
  });
  it("その月に請求書送り・ツケがある相手だけが並ぶ（現金の客は出ない）", () => {
    const r = C.rangeOfMonth("2026-07");
    expect(C.billableNames(SALES, r.from, r.to)).toEqual(["山本商事", "田中"]);
    // 8月は売上が無ければ誰も出ない
    const r8 = C.rangeOfMonth("2026-08");
    expect(C.billableNames(SALES, r8.from, r8.to)).toEqual([]);
  });
  it("入金済みでも、その月の相手として残る（あとから出し直せる）", () => {
    const paid = SALES.map((s) =>
      s.pay === "invoice" ? Object.assign({}, s, { paidDate: "2026-08-10" }) : s
    );
    const r = C.rangeOfMonth("2026-07");
    expect(C.billableNames(paid, r.from, r.to)).toContain("山本商事");
    // 中身も入金済みを含めて同じ1枚になる
    const iv = C.buildInvoice(paid, {
      name: "山本商事",
      from: r.from,
      to: r.to,
      unpaidOnly: false,
    });
    expect(iv.total).toBe(47000);
  });
  it("請求Noの採番（月ごとに001から・既存の続き）", () => {
    expect(C.formatInvoiceNo("2026-07", 1)).toBe("202607-001");
    expect(C.formatInvoiceNo("2026-07", 12)).toBe("202607-012");
    const iv = [{ no: "202607-001" }, { no: "202607-003" }, { no: "202606-009" }];
    expect(C.nextInvoiceSeq(iv, "2026-07")).toBe(4);
    expect(C.nextInvoiceSeq(iv, "2026-08")).toBe(1);
    expect(C.nextInvoiceSeq([], "2026-07")).toBe(1);
  });
});

describe("A4のページ分け", () => {
  it("行数で切る", () => {
    const rows = Array.from({ length: 70 }, (_, i) => i);
    const pages = C.paginate(rows, 30);
    expect(pages.length).toBe(3);
    expect(pages[0].length).toBe(30);
    expect(pages[2].length).toBe(10);
  });
  it("0件でも1枚は出す", () => {
    expect(C.paginate([], 30)).toEqual([[]]);
  });
  it("ちょうど割り切れるとき空ページを作らない", () => {
    expect(
      C.paginate(
        Array.from({ length: 60 }, (_, i) => i),
        30
      ).length
    ).toBe(2);
  });
});

describe("売上帳のページ割り（合計欄が最後のページに載る）", () => {
  const rows = (n) => Array.from({ length: n }, (_, i) => i);
  const pages = (n) => C.ledgerPages(rows(n), 38, 30);

  it("30件までは1枚（合計欄まで入る）", () => {
    expect(pages(1).map((p) => p.length)).toEqual([1]);
    expect(pages(30).map((p) => p.length)).toEqual([30]);
  });
  it("31件は1枚に載りきらず、合計欄用の2枚目が付く", () => {
    expect(pages(31).map((p) => p.length)).toEqual([31, 0]);
  });
  it("38件ぴったりは、合計欄のために2枚目を足す", () => {
    const p = pages(38);
    expect(p.map((x) => x.length)).toEqual([38, 0]);
  });
  it("40件は38+2", () => {
    expect(pages(40).map((p) => p.length)).toEqual([38, 2]);
  });
  it("90件でも最後のページは必ず30件以内（合計欄が必ず載る）", () => {
    const p = pages(90);
    expect(p.reduce((a, x) => a + x.length, 0)).toBe(90);
    expect(p[p.length - 1].length).toBeLessThanOrEqual(30);
    expect(p.map((x) => x.length)).toEqual([38, 38, 14]);
  });
  it("0件でも1枚は出す", () => {
    expect(C.ledgerPages([], 38, 30)).toEqual([[]]);
  });
  it("行が抜け落ちない・順番が変わらない（1〜200件を全部確認）", () => {
    for (let n = 1; n <= 200; n++) {
      const p = C.ledgerPages(rows(n), 38, 30);
      expect(p.flat()).toEqual(rows(n));
      expect(p[p.length - 1].length).toBeLessThanOrEqual(30);
      p.slice(0, -1).forEach((x) => expect(x.length).toBeLessThanOrEqual(38));
    }
  });
});

describe("クラウド同期（端末が作業台・クラウドは控え）", () => {
  const mkSale = (o) =>
    Object.assign(
      {
        id: "s1",
        date: "2026-07-01",
        name: "田中",
        people: 2,
        amount: 8000,
        pay: "cash",
        receipt: "none",
        receiptDate: null,
        memo: "",
        paidDate: null,
        paidCash: false,
        staff: "",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        deletedAt: null,
      },
      o
    );

  it("売上 ⇄ DBの行 を往復しても中身が変わらない", () => {
    const s = mkSale({
      pay: "invoice",
      receipt: "issued",
      receiptDate: "2026-07-02",
      paidDate: "2026-08-10",
      memo: "ボトル入れ",
      staff: "あかり",
    });
    const row = C.saleToRow(s);
    expect(row.cid).toBe("s1");
    expect(row.ymd).toBe("2026-07-01");
    expect(row.receipt_date).toBe("2026-07-02");
    expect(row.paid_date).toBe("2026-08-10");
    expect(row.staff).toBe("あかり");
    expect(C.saleFromRow(row)).toEqual(s);
  });
  it("宛先 ⇄ DBの行 を往復しても中身が変わらない", () => {
    const p = C.normalizePartner(
      { name: "株式会社山本商事", honor: "様", person: "総務部 山本 様" },
      "2026-07-20T00:00:00.000Z"
    );
    p.lastUsedAt = "2026-07-25T00:00:00.000Z";
    const row = C.partnerToRow(p);
    expect(row.name).toBe("株式会社山本商事");
    expect(row.honor).toBe("様");
    expect(row.last_used_at).toBe("2026-07-25T00:00:00.000Z");
    const back = C.partnerFromRow(row);
    expect(back.name).toBe(p.name);
    expect(back.to).toBe(p.name);
    expect(back.honor).toBe("様");
    expect(back.person).toBe("総務部 山本 様");
    expect(back.deletedAt).toBe(null);
  });

  it("端末にしか無いものは送る／クラウドにしか無いものは取り込む", () => {
    const local = [mkSale({ id: "a" })];
    const remote = [C.saleToRow(mkSale({ id: "b" }))].map(C.saleFromRow);
    const plan = C.syncPlanSales(local, remote);
    expect(plan.merged.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(plan.push.map((s) => s.id)).toEqual(["a"]); // bは送らない（もう向こうにある）
  });
  it("ぶつかったら新しい方が勝つ（端末が新しければ送る）", () => {
    const old = mkSale({ id: "a", amount: 8000, updatedAt: "2026-07-01T00:00:00.000Z" });
    const neo = mkSale({ id: "a", amount: 9000, updatedAt: "2026-07-02T00:00:00.000Z" });
    // 端末が新しい
    let plan = C.syncPlanSales([neo], [old]);
    expect(plan.merged[0].amount).toBe(9000);
    expect(plan.push.length).toBe(1);
    // クラウドが新しい（別のスマホで直した）
    plan = C.syncPlanSales([old], [neo]);
    expect(plan.merged[0].amount).toBe(9000);
    expect(plan.push.length).toBe(0);
    // 同じ時刻なら端末を残して送らない
    plan = C.syncPlanSales([old], [mkSale({ id: "a", amount: 8000 })]);
    expect(plan.push.length).toBe(0);
  });
  it("消したものは復活しない（消したのも“新しい更新”として扱う）", () => {
    const alive = mkSale({ id: "a", updatedAt: "2026-07-01T00:00:00.000Z" });
    const removed = mkSale({
      id: "a",
      updatedAt: "2026-07-05T00:00:00.000Z",
      deletedAt: "2026-07-05T00:00:00.000Z",
    });
    // 別のスマホで消した → 端末側でも消える
    const plan = C.syncPlanSales([alive], [removed]);
    expect(plan.merged[0].deletedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(C.filterSales(plan.merged, {}).length).toBe(0);
    // こちらで消した → 送る
    const plan2 = C.syncPlanSales([removed], [alive]);
    expect(plan2.push.length).toBe(1);
    expect(plan2.push[0].deletedAt).toBe("2026-07-05T00:00:00.000Z");
  });
  it("宛先は会社名で突合する（消した宛先は一覧から消えるが控えは残る）", () => {
    const local = {
      A社: C.normalizePartner({ name: "A社" }, "2026-07-01T00:00:00.000Z"),
      B社: C.normalizePartner({ name: "B社" }, "2026-07-01T00:00:00.000Z"),
    };
    local["B社"].deletedAt = "2026-07-09T00:00:00.000Z";
    local["B社"].updatedAt = "2026-07-09T00:00:00.000Z";
    const remote = [C.partnerFromRow(C.partnerToRow(C.normalizePartner({ name: "C社" })))];
    const plan = C.syncPlanPartners(local, remote);
    expect(Object.keys(plan.merged).sort()).toEqual(["A社", "B社", "C社"]);
    expect(plan.push.map((p) => p.name).sort()).toEqual(["A社", "B社"]);
    // 画面に出るのは生きているものだけ
    expect(C.partnerList(plan.merged).map((p) => p.name)).toEqual(["A社", "C社"]);
    expect(
      C.partnerRecent(plan.merged)
        .map((p) => p.name)
        .sort()
    ).toEqual(["A社", "C社"]);
    // 消した宛先は「登録していない」扱い＝名前＋御中に戻る
    expect(C.invoiceTo(plan.merged, "B社").registered).toBe(false);
  });
  it("設定は新しい方が勝つ（クラウドに無ければ送る）", () => {
    const l = { store: "まりも" };
    const r = { store: "MARIMO" };
    expect(C.syncPlanSettings(l, "2026-07-02T00:00:00.000Z", null, null)).toEqual({
      merged: l,
      push: true,
    });
    expect(
      C.syncPlanSettings(l, "2026-07-01T00:00:00.000Z", r, "2026-07-02T00:00:00.000Z").merged
    ).toBe(r);
    expect(
      C.syncPlanSettings(l, "2026-07-03T00:00:00.000Z", r, "2026-07-02T00:00:00.000Z")
    ).toEqual({ merged: l, push: true });
    expect(
      C.syncPlanSettings(l, "2026-07-02T00:00:00.000Z", r, "2026-07-02T00:00:00.000Z")
    ).toEqual({ merged: l, push: false });
  });
});

describe("P0: 空の時刻を送らない・戻せるバックアップ・請求Noの台帳", () => {
  it("時刻や日付が空の売上でも、DBには null で送る（空文字は22007で落ちる）", () => {
    const row = C.saleToRow({
      id: "a",
      date: "",
      name: "田中",
      people: 2,
      amount: 8000,
      pay: "cash",
      receipt: "none",
      receiptDate: "",
      paidDate: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: "",
    });
    expect(row.receipt_date).toBe(null);
    expect(row.paid_date).toBe(null);
    expect(row.created_at).toBe(null);
    expect(row.deleted_at).toBe(null);
    // 更新時刻は同期の勝ち負けを決める鍵なので、空なら今の時刻が入る
    expect(typeof row.updated_at).toBe("string");
    expect(isNaN(Date.parse(row.updated_at))).toBe(false);
    const p = C.partnerToRow({ name: "A社", lastUsedAt: "", updatedAt: "", deletedAt: "" });
    expect(p.last_used_at).toBe(null);
    expect(p.deleted_at).toBe(null);
    expect(isNaN(Date.parse(p.updated_at))).toBe(false);
  });
  it("日付が壊れた売上は送らずに端末に残す（1行のせいで全部失敗させない）", () => {
    const ok1 = C.normalizeSale({ date: "2026-07-01", name: "田中", people: 1, amount: 100 });
    const bad = Object.assign({}, ok1, { id: "bad", date: "" });
    const r = C.pushableSales([ok1, bad]);
    expect(r.ok.length).toBe(1);
    expect(r.bad.length).toBe(1);
    expect(r.bad[0].id).toBe("bad");
  });

  it("書き出したファイルから戻すと、戻した行が勝つ（更新時刻が今になる）", () => {
    const old = C.normalizeSale(
      { id: "a", date: "2026-07-01", name: "田中", people: 2, amount: 8000 },
      "2026-07-01T00:00:00.000Z"
    );
    // クラウドには「消した」版がある（古いファイルのままだと負けて消える）
    const removed = Object.assign({}, old, {
      deletedAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
    const restored = C.restorePlan([removed], [old], "add", "2026-07-09T00:00:00.000Z");
    expect(restored.length).toBe(1);
    expect(restored[0].updatedAt).toBe("2026-07-09T00:00:00.000Z");
    // 戻した方が新しいので、同期しても消えない
    const plan = C.syncPlanSales(restored, [removed]);
    expect(plan.merged[0].deletedAt).toBe(null);
    expect(plan.push.length).toBe(1);
  });
  it("「入れ替える」で読み込むと、ファイルに無い行に消した印が立つ（前のが残らない）", () => {
    const keep = C.normalizeSale({
      id: "a",
      date: "2026-07-01",
      name: "田中",
      amount: 8000,
      people: 1,
    });
    const gone = C.normalizeSale({
      id: "b",
      date: "2026-07-02",
      name: "佐藤",
      amount: 5000,
      people: 1,
    });
    const out = C.restorePlan([keep, gone], [keep], "replace", "2026-07-09T00:00:00.000Z");
    expect(out.length).toBe(2);
    const b = out.find((x) => x.id === "b");
    expect(b.deletedAt).toBe("2026-07-09T00:00:00.000Z");
    expect(b.updatedAt).toBe("2026-07-09T00:00:00.000Z");
    // 生きているのは1件
    expect(C.filterSales(out, {}).length).toBe(1);
    // 「足す」なら消えない
    const add = C.restorePlan([keep, gone], [keep], "add", "2026-07-09T00:00:00.000Z");
    expect(C.filterSales(add, {}).length).toBe(2);
  });

  it("請求書番号の台帳：DBの行と往復できる", () => {
    const rec = {
      key: "山本商事||2026-07-01|2026-07-31",
      no: "202607-001",
      name: "山本商事",
      from: "2026-07-01",
      to: "2026-07-31",
      issuedAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    };
    const row = C.invoiceRecToRow(rec);
    expect(row.ymd_from).toBe("2026-07-01");
    expect(row.no).toBe("202607-001");
    expect(C.invoiceRecFromRow(row)).toEqual(rec);
    // 期間が空でも送れる（null になる）
    expect(C.invoiceRecToRow({ key: "k", no: "n", from: "", to: "" }).ymd_from).toBe(null);
  });
  it("請求書番号は先に採番した方（古い方）を正とする＝番号が入れ替わらない", () => {
    const mine = {
      key: "k1",
      no: "202607-005",
      name: "A社",
      issuedAt: "2026-07-31T10:00:00.000Z",
      updatedAt: "2026-07-31T10:00:00.000Z",
    };
    const other = {
      key: "k1",
      no: "202607-002",
      name: "A社",
      issuedAt: "2026-07-31T09:00:00.000Z",
      updatedAt: "2026-07-31T09:00:00.000Z",
    };
    // 別の端末が先に 002 を採番していた → そちらが残る
    const plan = C.syncPlanInvoices([mine], [other]);
    expect(plan.merged[0].no).toBe("202607-002");
    expect(plan.push.length).toBe(0);
    // 端末にしか無い番号は送る
    const only = C.syncPlanInvoices([mine], []);
    expect(only.push.length).toBe(1);
    expect(only.merged[0].no).toBe("202607-005");
  });
});

describe("レジ締め（現金合わせ）", () => {
  const day = "2026-07-30";
  const S = [
    C.normalizeSale({ date: day, name: "田中", people: 2, amount: 8000, pay: "cash" }),
    C.normalizeSale({ date: day, name: "佐藤", people: 3, amount: 12000, pay: "paypay" }),
    C.normalizeSale({ date: day, name: "山本商事", people: 4, amount: 32000, pay: "invoice" }),
    C.normalizeSale({ date: day, name: "鈴木", people: 5, amount: 25000, pay: "credit" }),
    // 前に打ったツケを、今日「現金で」回収した
    C.normalizeSale({
      date: "2026-07-20",
      name: "田中",
      people: 1,
      amount: 5000,
      pay: "tsuke",
      paidDate: day,
      paidCash: true,
    }),
    // 同じ日に振込で回収した分は、金庫の現金には入らない
    C.normalizeSale({
      date: "2026-07-21",
      name: "山本商事",
      people: 2,
      amount: 9000,
      pay: "invoice",
      paidDate: day,
      paidCash: false,
    }),
  ];

  it("あるべき額＝釣銭＋現金売上＋現金で回収した分−出金", () => {
    const d = C.closeDraft(S, day, {
      opening: 30000,
      outs: [
        { kind: "buy", amount: 3000, memo: "氷とおしぼり" },
        { kind: "pay", amount: 10000, memo: "あかり 日払い", staff: "あかり" },
      ],
      counted: 30000,
    });
    expect(d.cashSales).toBe(8000);
    expect(d.collected).toBe(5000); // 現金で回収したツケだけ（振込の9,000は入らない）
    expect(d.outTotal).toBe(13000);
    expect(d.should).toBe(30000 + 8000 + 5000 - 13000); // 30,000
    expect(d.counted).toBe(30000);
    expect(d.diff).toBe(0);
  });
  it("カード・PayPay・請求書送りは金庫の現金に入れない（でも売上には入る）", () => {
    const d = C.closeDraft(S, day, { opening: 0, outs: [], counted: 13000 });
    expect(d.other).toEqual({ credit: 25000, paypay: 12000, invoice: 32000, tsuke: 0 });
    expect(d.salesTotal).toBe(8000 + 12000 + 32000 + 25000); // 77,000
    expect(d.should).toBe(8000 + 5000);
    expect(d.diff).toBe(0);
  });
  it("合わない日は差額をそのまま出す（0に見せない）", () => {
    const d = C.closeDraft(S, day, { opening: 30000, outs: [], counted: 42500 });
    expect(d.should).toBe(43000);
    expect(d.diff).toBe(-500); // 500円足りない
    const over = C.closeDraft(S, day, { opening: 30000, outs: [], counted: 43200 });
    expect(over.diff).toBe(200); // 多い日もそのまま
  });
  it("数えていないうちは差額を出さない（0円と嘘をつかない）", () => {
    const d = C.closeDraft(S, day, { opening: 30000, outs: [], counted: "" });
    expect(d.counted).toBe(null);
    expect(d.diff).toBe(null);
  });
  it("締めたあとに売上を触ったら、締め直しが要ると分かる", () => {
    const closedAt = "2026-07-31T02:00:00.000Z";
    const before = C.closeDraft(S, day, {
      opening: 0,
      outs: [],
      counted: 13000,
      closedAt: closedAt,
    });
    expect(before.needsRedo).toBe(false);
    const touched = S.map((s) =>
      s.date === day && s.pay === "cash"
        ? Object.assign({}, s, { amount: 9000, updatedAt: "2026-07-31T03:00:00.000Z" })
        : s
    );
    const after = C.closeDraft(touched, day, {
      opening: 0,
      outs: [],
      counted: 13000,
      closedAt: closedAt,
    });
    expect(after.needsRedo).toBe(true);
    expect(after.should).toBe(9000 + 5000);
  });
  it("出金は5種類に丸め、金額は整数にする（変な値で締めが狂わない）", () => {
    const o = C.normalizeOut({ kind: "とんかつ", amount: "3,000", memo: "  氷  " });
    expect(o.kind).toBe("other");
    expect(o.amount).toBe(0); // 数字にできない値は0（黙って3000にしない）
    expect(o.memo).toBe("氷");
    expect(C.normalizeOut({ kind: "taxi", amount: 1200.9 }).amount).toBe(1200);
    expect(C.OUT_KINDS.map((k) => k.key)).toEqual(["buy", "taxi", "pay", "lend", "other"]);
  });
  it("前の日に数えた実数が、次の日の釣銭になる", () => {
    const closes = {
      "2026-07-28": C.normalizeClose({ ymd: "2026-07-28", counted: 28000 }),
      "2026-07-29": C.normalizeClose({ ymd: "2026-07-29", counted: 31500 }),
    };
    expect(C.carryOver(closes, "2026-07-30")).toBe(31500);
    expect(C.carryOver(closes, "2026-07-29")).toBe(28000);
    expect(C.carryOver(closes, "2026-07-28")).toBe(null); // 前の日が無ければ自分で入れる
    expect(C.carryOver({}, "2026-07-30")).toBe(null);
  });
  it("締め ⇄ DBの行 を往復しても中身が変わらない", () => {
    const c = C.normalizeClose(
      {
        ymd: day,
        opening: 30000,
        outs: [{ kind: "taxi", amount: 1500, memo: "送り", staff: "" }],
        counted: 30000,
        memo: "500円足りない",
        closedAt: "2026-07-31T02:00:00.000Z",
      },
      "2026-07-31T02:00:00.000Z"
    );
    const row = C.closeToRow(c);
    expect(row.ymd).toBe(day);
    expect(row.counted).toBe(30000);
    expect(row.closed_at).toBe("2026-07-31T02:00:00.000Z");
    const back = C.closeFromRow(row);
    expect(back.opening).toBe(30000);
    expect(back.outs[0].amount).toBe(1500);
    expect(back.memo).toBe("500円足りない");
    // 数えていない締めは null で送る（空文字はDBが受け取れない）
    expect(C.closeToRow(C.normalizeClose({ ymd: day, counted: "" })).counted).toBe(null);
  });
  it("締めも同期できる（日付が鍵・新しい方が勝つ）", () => {
    const local = {
      "2026-07-30": C.normalizeClose(
        { ymd: "2026-07-30", counted: 30000 },
        "2026-07-31T01:00:00.000Z"
      ),
    };
    const remote = [
      C.normalizeClose({ ymd: "2026-07-30", counted: 29000 }, "2026-07-31T02:00:00.000Z"),
      C.normalizeClose({ ymd: "2026-07-29", counted: 28000 }, "2026-07-30T02:00:00.000Z"),
    ];
    const plan = C.syncPlanCloses(local, remote);
    expect(Object.keys(plan.merged).sort()).toEqual(["2026-07-29", "2026-07-30"]);
    expect(plan.merged["2026-07-30"].counted).toBe(29000); // クラウドが新しい
    expect(plan.push.length).toBe(0);
  });
});
