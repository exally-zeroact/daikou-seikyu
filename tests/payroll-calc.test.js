import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// アプリ(kyuuryoumeisai.html)が読むのと同じ実ファイルを Node でロードし、
// 給与の社会保険料・課税対象額・所得税の確定計算を「値レベル」で固定する。
const require = createRequire(import.meta.url);
const PayrollCalc = require("../payroll-calc.js");
const SHAKAIHOKEN_HYO = require("../shakaihoken-hyo.js");
const SHOTOKUZEI_HYOU = require("../shotokuzei-hyou.js");

describe("介護保険 第2号被保険者の判定 (生年月日→対象月・法令準拠)", () => {
  // 開始 = 40歳の誕生日「前日が属する月」分から
  it("40歳到達月から対象になる (誕生日 4/25)", () => {
    expect(PayrollCalc.isKaigoTarget("1980-04-25", "2020-03")).toBe(false); // 到達前月
    expect(PayrollCalc.isKaigoTarget("1980-04-25", "2020-04")).toBe(true); // 到達月(前日4/24=4月)
  });

  // 1日生まれ特例: 前日が前月末日 → 開始が1ヶ月早まる
  it("1日生まれは40歳開始が前月に早まる (誕生日 4/1)", () => {
    expect(PayrollCalc.isKaigoTarget("1980-04-01", "2020-02")).toBe(false);
    expect(PayrollCalc.isKaigoTarget("1980-04-01", "2020-03")).toBe(true); // 前日3/31=3月から
  });

  // 終了 = 65歳の誕生日「前日が属する月」の前月分まで
  it("65歳到達月の前月で対象が終わる (誕生日 4/25)", () => {
    expect(PayrollCalc.isKaigoTarget("1955-04-25", "2020-03")).toBe(true); // 前月まで対象
    expect(PayrollCalc.isKaigoTarget("1955-04-25", "2020-04")).toBe(false); // 到達月は対象外
  });

  it("1日生まれは65歳終了も前月に早まる (誕生日 4/1)", () => {
    expect(PayrollCalc.isKaigoTarget("1955-04-01", "2020-02")).toBe(true); // 前日3/31=3月到達→2月まで
    expect(PayrollCalc.isKaigoTarget("1955-04-01", "2020-03")).toBe(false);
  });

  it("生年月日や対象月が不正なら false (=介護を引かない安全側)", () => {
    expect(PayrollCalc.isKaigoTarget("", "2020-04")).toBe(false);
    expect(PayrollCalc.isKaigoTarget("1980-04-25", "")).toBe(false);
    expect(PayrollCalc.isKaigoTarget(null, null)).toBe(false);
    expect(PayrollCalc.isKaigoTarget("こわれた", "2020-04")).toBe(false);
  });

  it("スラッシュ区切りの生年月日も受け付ける", () => {
    expect(PayrollCalc.isKaigoTarget("1980/04/25", "2020/04")).toBe(true);
  });
});

describe("社会保険料の確定額 (実テーブルで照合)", () => {
  const pay = 300000;

  it("各保険料が実テーブルから再計算した値と一致する", () => {
    const hyojun = SHAKAIHOKEN_HYO.getHyojunHoshu(pay);
    const si = PayrollCalc.calcSocialInsurance({
      payTotal: pay,
      healthRate: 0.04955,
      employRate: 0.0055,
      hasKaigo: false,
    });
    expect(si.hyojun).toBe(hyojun);
    expect(si.health).toBe(Math.round(hyojun * 0.04955));
    expect(si.pension).toBe(Math.round(hyojun * 0.0915));
    expect(si.employ).toBe(Math.round(pay * 0.0055));
    expect(si.kaigo).toBe(0); // 介護対象外
    expect(si.total).toBe(si.health + si.pension + si.kaigo + si.employ);
  });

  it("hasKaigo=true で介護保険料が加わる (標準報酬×0.795%)", () => {
    const hyojun = SHAKAIHOKEN_HYO.getHyojunHoshu(pay);
    const si = PayrollCalc.calcSocialInsurance({ payTotal: pay, hasKaigo: true });
    expect(si.kaigo).toBe(Math.round(hyojun * SHAKAIHOKEN_HYO.KAIGO_RITSU_JUGYOIN));
    expect(si.kaigo).toBeGreaterThan(0);
  });

  it("支給0なら全て0", () => {
    const si = PayrollCalc.calcSocialInsurance({ payTotal: 0, hasKaigo: true });
    expect(si.total).toBe(0);
  });
});

describe("課税対象額と所得税 (介護を引く=過大課税の是正)", () => {
  const pay = 300000;
  const fuyou = 1;

  it("課税対象額 = 支給 − 社保合計(介護含む)", () => {
    const si = PayrollCalc.calcSocialInsurance({ payTotal: pay, hasKaigo: true });
    expect(PayrollCalc.calcTaxableIncome(pay, si)).toBe(pay - si.total);
  });

  it("介護ありは課税対象額が介護保険料の分だけ小さい", () => {
    const noKaigo = PayrollCalc.calcSocialInsurance({ payTotal: pay, hasKaigo: false });
    const withKaigo = PayrollCalc.calcSocialInsurance({ payTotal: pay, hasKaigo: true });
    const kazeiNo = PayrollCalc.calcTaxableIncome(pay, noKaigo);
    const kazeiYes = PayrollCalc.calcTaxableIncome(pay, withKaigo);
    expect(kazeiNo - kazeiYes).toBe(withKaigo.kaigo);
  });

  it("所得税は実税額表(getZei)から再計算した値と一致する", () => {
    const si = PayrollCalc.calcSocialInsurance({ payTotal: pay, fuyou, hasKaigo: true });
    const kazei = PayrollCalc.calcTaxableIncome(pay, si);
    const expected = SHOTOKUZEI_HYOU.getZei(kazei, fuyou) ?? 0;
    expect(PayrollCalc.calcIncomeTax({ payTotal: pay, fuyou, hasKaigo: true })).toBe(expected);
  });

  it("介護ありの所得税は介護なし以下になる (過大課税にならない)", () => {
    const withKaigo = PayrollCalc.calcIncomeTax({ payTotal: pay, fuyou, hasKaigo: true });
    const noKaigo = PayrollCalc.calcIncomeTax({ payTotal: pay, fuyou, hasKaigo: false });
    expect(withKaigo).toBeLessThanOrEqual(noKaigo);
  });

  it("課税対象が課税最低額(88,000円)未満なら税額0", () => {
    expect(PayrollCalc.calcIncomeTax({ payTotal: 90000, fuyou: 0, hasKaigo: false })).toBe(0);
  });
});
