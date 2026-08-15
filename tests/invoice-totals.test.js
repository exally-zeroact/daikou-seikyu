// @vitest-environment node
// ============================================================
// ★合計の式そのものを固定する★ 2026-08-11
//
//   ★なぜ この試験が別に要るか★
//     「紙とExcelとエンジンが一致する」試験（tests/e2e/totals-one-source.spec.js）は、
//     ★1本化した計算元をずらすと 3つとも同じだけずれるので 緑のまま★になる。
//     （実際に わざと1円ずらして確かめた：紙だけ／Excelだけ→赤、エンジン→緑）
//     ＝一致の試験は「食い違い」を捕まえる物で、「式が正しいか」は捕まえられない。
//     → ここで ★手で計算した値★ と突き合わせて 式を固定する。
//
//   内税10%の内消費税 ＝ round(税込 × 10 ÷ 110)
// ============================================================
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const Engine = createRequire(import.meta.url)(path.join(ROOT, "meisai-engine.js"));

const rows = (...amts) => amts.map((a) => ({ 金額: a }));

describe("★合計の式（内税10%）★", () => {
  it("エンジンが読めている", () => {
    expect(typeof Engine.invoiceTotals).toBe("function");
  });

  // 手で計算した値（1円まで）
  const HYO = [
    { zeikomi: 110, zei: 10 }, //   1100/110 = 10
    { zeikomi: 111, zei: 10 }, //   10.09… → 10
    { zeikomi: 105, zei: 10 }, //   9.545… → 10（四捨五入で上がる）
    { zeikomi: 104, zei: 9 }, //    9.454… → 9
    { zeikomi: 1, zei: 0 }, //      0.0909… → 0
    { zeikomi: 0, zei: 0 },
    { zeikomi: 30353, zei: 2759 }, // 2759.36… → 2759
    { zeikomi: 37200, zei: 3382 }, // 本番の実データと同じ額
    { zeikomi: 1111000, zei: 101000 },
  ];
  for (const h of HYO) {
    it(`税込 ${h.zeikomi} → 消費税 ${h.zei}`, () => {
      const t = Engine.invoiceTotals(rows(h.zeikomi), {});
      expect(t.zei, `★内税の消費税が違う（税込 ${h.zeikomi}）`).toBe(h.zei);
      expect(t.shoukei, "小計は税込のまま").toBe(h.zeikomi);
      expect(t.goukei, "内税なら 合計＝小計").toBe(h.zeikomi);
    });
  }

  it("★複数行を足してから 税を出す（行ごとに出して足さない）★", () => {
    // 行ごとに丸めると 1円ずれる組み合わせ
    const t = Engine.invoiceTotals(rows(105, 105), {});
    expect(t.shoukei).toBe(210);
    expect(t.zei, "★行ごとに丸めて足している（10+10=20 になっている）★").toBe(19); // 2100/110=19.09→19
  });

  it('外税（会社マスタの taxMode="外税"）は 税抜×率 を足す', () => {
    const t = Engine.invoiceTotals(rows(1000), { taxMode: "外税" });
    expect(t.shoukei).toBe(1000);
    expect(t.zei).toBe(100);
    expect(t.goukei).toBe(1100);
    expect(t.soto).toBe(true);
  });

  // ★言い方は1つだけ★（書く側と読む側で語彙がずれると必ず事故る）
  //   実際に一度 "soto" と書いて渡してしまい、会社マスタの "外税" と食い違っていた。
  it("★別の綴りは 外税として扱わない（内税のまま）★", () => {
    for (const ng of ["soto", "SOTO", "外税 ", "外 税", ""]) {
      const t = Engine.invoiceTotals(rows(1000), { taxMode: ng });
      expect(t.soto, `★"${ng}" を外税として受け付けている★`).toBe(false);
      expect(t.goukei, `★"${ng}" で合計が変わっている★`).toBe(1000);
    }
  });

  it("★率は1か所から出る（計算と文言が同じ数を使う）★", () => {
    expect(Engine.TAX_RATE).toBe(10);
    const uchi = Engine.totalsLabels({}, {});
    const soto = Engine.totalsLabels({}, { taxMode: "外税" });
    expect(uchi.消費税).toBe("消費税（" + Engine.TAX_RATE + "%・内税）");
    expect(soto.消費税).toBe("消費税（" + Engine.TAX_RATE + "%・外税）");
  });

  it("★会社ごとの言い換えが 上に被さる★", () => {
    const L = Engine.totalsLabels({ labels: { 消費税: "税", 今回お支払額: "お振込み額" } }, {});
    expect(L.消費税).toBe("税");
    expect(L.今回お支払額).toBe("お振込み額");
    expect(L.小計, "言い換えていない物まで変わっている").toBe("小計");
  });

  it("金額が空・文字でも落ちない（0として足す）", () => {
    const t = Engine.invoiceTotals(
      [{ 金額: "" }, { 金額: null }, { 金額: "あ" }, { 金額: 100 }],
      {}
    );
    expect(t.shoukei).toBe(100);
  });
});
