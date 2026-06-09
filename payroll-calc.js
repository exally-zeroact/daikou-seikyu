/**
 * payroll-calc.js - 給与の社会保険料・課税対象額・所得税の確定計算（純関数）
 * ================================================================
 * 【目的】
 *  kyuuryoumeisai.html 内に4箇所コピペされていた所得税計算を1本化する。
 *  - 表示プレビュー / Excel式出力 / Excel数値出力 / calcItemAmount 控除計算
 *  すべて本ファイルの純関数を呼ぶだけにし、計算の二重管理をなくす。
 *
 * 【正しい課税対象額】(shotokuzei-hyou.js のヘッダ仕様に準拠)
 *  課税対象額 = 支給合計 − 社会保険料合計（健保 + 厚生年金 + 介護 + 雇用）
 *  ※従来は介護保険料を引いておらず、40〜64歳で過大課税になっていた。
 *
 * 【介護保険 第2号被保険者の判定】(40歳以上65歳未満)
 *  業界標準（freee/マネフォ/弥生/ジンジャー等）に合わせ、生年月日から自動判定する。
 *  - 開始: 40歳の誕生日の「前日が属する月」分から
 *  - 終了: 65歳の誕生日の「前日が属する月」の前月分まで
 *  - 1日生まれ特例: 前日が前月末日になるため、開始/終了が1ヶ月早まる
 *
 * 【依存】shotokuzei-hyou.js（getZei）/ shakaihoken-hyo.js（getHyojunHoshu, KAIGO_RITSU_JUGYOIN）
 * 【利用】ブラウザは window.PayrollCalc、Node(テスト)は require('./payroll-calc.js')
 * ================================================================
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./shotokuzei-hyou.js"), require("./shakaihoken-hyo.js"));
  } else {
    // ブラウザ：依存は `const SHOTOKUZEI_HYOU = ...` 等でトップレベル宣言されており
    // window プロパティにならない。bare 参照（グローバル lexical）で解決する。
    root.PayrollCalc = factory(
      typeof SHOTOKUZEI_HYOU !== "undefined" ? SHOTOKUZEI_HYOU : root.SHOTOKUZEI_HYOU,
      typeof SHAKAIHOKEN_HYO !== "undefined" ? SHAKAIHOKEN_HYO : root.SHAKAIHOKEN_HYO
    );
  }
})(typeof self !== "undefined" ? self : this, function (SHOTOKUZEI_HYOU, SHAKAIHOKEN_HYO) {
  "use strict";

  var KOSEI_NENKIN_RITSU = 0.0915; // 厚生年金（従業員負担・全国一律）

  // 'YYYY-MM-DD' / Date / {y,m,d} を {y,m,d} に正規化
  function parseYmd(v) {
    if (v == null || v === "") return null;
    if (typeof v === "object" && v.y) return { y: +v.y, m: +v.m, d: +v.d };
    var s = String(v).trim().replace(/\//g, "-");
    var p = s.split("-");
    if (p.length < 3) return null;
    var y = +p[0],
      m = +p[1],
      d = +p[2];
    if (!y || !m || !d) return null;
    return { y: y, m: m, d: d };
  }

  // 'YYYY-MM' / {y,m} を月インデックス(y*12+m-1)に
  function parseYmToIndex(v) {
    if (v == null || v === "") return null;
    if (typeof v === "object" && v.y) return +v.y * 12 + (+v.m - 1);
    var s = String(v).trim().replace(/\//g, "-");
    var p = s.split("-");
    var y = +p[0],
      m = +p[1];
    if (!y || !m) return null;
    return y * 12 + (m - 1);
  }

  // 生年月日 + addYears歳「到達」が属する月インデックス（到達日 = 誕生日の前日）
  function reachMonthIndex(birth, addYears) {
    if (birth.d === 1) {
      // 前日は前月末日 → 1ヶ月手前
      var y = birth.y + addYears,
        m = birth.m - 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
      return y * 12 + (m - 1);
    }
    return (birth.y + addYears) * 12 + (birth.m - 1);
  }

  /**
   * 介護保険 第2号被保険者か（生年月日と対象支給月から判定）
   * @returns {boolean} 生年月日 or 対象月が不正なら false（＝引かない安全側）
   */
  function isKaigoTarget(birthYmd, payYm) {
    var b = parseYmd(birthYmd);
    var pay = parseYmToIndex(payYm);
    if (!b || pay == null) return false;
    var start = reachMonthIndex(b, 40); // 40歳到達月から対象
    var endExclusive = reachMonthIndex(b, 65); // 65歳到達月からは対象外
    return pay >= start && pay < endExclusive;
  }

  /**
   * 社会保険料の各確定額。hasKaigo=true で介護保険料を加える。
   */
  function calcSocialInsurance(opts) {
    var payTotal = opts.payTotal || 0;
    var healthRate = opts.healthRate != null ? opts.healthRate : 0.04955;
    var employRate = opts.employRate != null ? opts.employRate : 0.0055;
    var hasKaigo = !!opts.hasKaigo;
    if (payTotal <= 0 || !SHAKAIHOKEN_HYO) {
      return { hyojun: 0, health: 0, pension: 0, kaigo: 0, employ: 0, total: 0 };
    }
    var hyojun = SHAKAIHOKEN_HYO.getHyojunHoshu(payTotal);
    var health = Math.round(hyojun * healthRate);
    var pension = Math.round(hyojun * KOSEI_NENKIN_RITSU);
    var kaigoRate =
      SHAKAIHOKEN_HYO.KAIGO_RITSU_JUGYOIN != null ? SHAKAIHOKEN_HYO.KAIGO_RITSU_JUGYOIN : 0.00795;
    var kaigo = hasKaigo ? Math.round(hyojun * kaigoRate) : 0;
    var employ = Math.round(payTotal * employRate);
    return {
      hyojun: hyojun,
      health: health,
      pension: pension,
      kaigo: kaigo,
      employ: employ,
      total: health + pension + kaigo + employ,
    };
  }

  /**
   * 課税対象額 = 支給合計 − 社会保険料合計（介護を含む）。0未満は0。
   */
  function calcTaxableIncome(payTotal, si) {
    var k = (payTotal || 0) - (si ? si.total : 0);
    return k > 0 ? k : 0;
  }

  /**
   * 所得税の確定額（源泉徴収月額表・甲欄）。
   * @returns {number} 円。範囲外/未計算は 0。
   */
  function calcIncomeTax(opts) {
    if (!SHOTOKUZEI_HYOU || !(opts.payTotal > 0)) return 0;
    var si = calcSocialInsurance(opts);
    var kazei = calcTaxableIncome(opts.payTotal, si);
    if (kazei <= 0) return 0;
    var fuyou = opts.fuyou || 0;
    var zei = SHOTOKUZEI_HYOU.getZei(kazei, fuyou);
    return zei != null ? zei : 0;
  }

  return {
    isKaigoTarget: isKaigoTarget,
    calcSocialInsurance: calcSocialInsurance,
    calcTaxableIncome: calcTaxableIncome,
    calcIncomeTax: calcIncomeTax,
    _parseYmd: parseYmd,
    _reachMonthIndex: reachMonthIndex,
  };
});
