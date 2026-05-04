/**
 * shakaihoken-hyo.js - 社会保険料（標準報酬月額・保険料率）
 * ================================================================
 * 【更新タイミング】
 *   健康保険料率：毎年3月（3月分＝4月納付分から適用）
 *   厚生年金料率：現在固定（変更時は法改正）
 *   介護保険料率：毎年3月（全国一律）
 * 【参照先】
 *   協会けんぽ https://www.kyoukaikenpo.or.jp/g7/cat330/sb3130/
 *   日本年金機構 https://www.nenkin.go.jp/service/kounen/hokenryo/ryogaku/
 * 【最終確認】令和7年度（2025年3月〜2026年2月）
 * ================================================================
 * 【更新方法】
 *  1. 毎年2月頃に協会けんぽのサイトで翌年度料率を確認
 *  2. KENKO_RITSU の各都道府県の値を更新
 *  3. 介護保険料率（KAIGO_RITSU）も確認して更新
 *  4. NENDO を更新年度に変更
 * ================================================================
 * 【正しい計算方法】
 *  ① 支給合計から「標準報酬月額等級」を決定
 *  ② 標準報酬月額 × 保険料率 = 保険料（会社＋本人合計）
 *  ③ 従業員負担 = 保険料 ÷ 2（労使折半）
 *  ④ 端数処理：50銭以下切捨て、50銭超切上げ
 * ================================================================
 */

const SHAKAIHOKEN_HYO = {

  NENDO: '令和7年度（2025年3月〜2026年2月）',

  // ----------------------------------------------------------------
  // 厚生年金保険料率（全国一律・固定）
  // 2017年9月以降18.3%固定
  // 従業員負担：9.15%（折半）
  // ----------------------------------------------------------------
  KOSEI_NENKIN_RITSU_TOTAL: 0.183,
  KOSEI_NENKIN_RITSU_JUGYOIN: 0.0915,

  // ----------------------------------------------------------------
  // 介護保険料率（40歳以上65歳未満に適用・全国一律）
  // ----------------------------------------------------------------
  KAIGO_RITSU_TOTAL: 0.0159,         // 令和7年度：1.59%
  KAIGO_RITSU_JUGYOIN: 0.00795,      // 従業員負担：0.795%

  // ----------------------------------------------------------------
  // 協会けんぽ 都道府県別 健康保険料率（令和7年度・全国）
  // ※労使折半のため、従業員負担 = 全体料率 ÷ 2
  // ※組合健保は各健康保険組合で異なる（要確認）
  // ----------------------------------------------------------------
  KENKO_RITSU: {
    // 全体料率（%）→ 従業員負担は ÷ 2
    hokkaido:  { name: '北海道', total: 0.1031, jugyoin: 0.05155 },
    aomori:    { name: '青森県', total: 0.0985, jugyoin: 0.04925 },
    iwate:     { name: '岩手県', total: 0.0971, jugyoin: 0.04855 },
    miyagi:    { name: '宮城県', total: 0.1008, jugyoin: 0.05040 },
    akita:     { name: '秋田県', total: 0.1001, jugyoin: 0.05005 },
    yamagata:  { name: '山形県', total: 0.0984, jugyoin: 0.04920 },
    fukushima: { name: '福島県', total: 0.0980, jugyoin: 0.04900 },
    ibaraki:   { name: '茨城県', total: 0.0982, jugyoin: 0.04910 },
    tochigi:   { name: '栃木県', total: 0.0997, jugyoin: 0.04985 },
    gunma:     { name: '群馬県', total: 0.0982, jugyoin: 0.04910 },
    saitama:   { name: '埼玉県', total: 0.0988, jugyoin: 0.04940 },
    chiba:     { name: '千葉県', total: 0.0987, jugyoin: 0.04935 },
    tokyo:     { name: '東京都', total: 0.0991, jugyoin: 0.04955 },
    kanagawa:  { name: '神奈川県', total: 0.0990, jugyoin: 0.04950 },
    niigata:   { name: '新潟県', total: 0.0985, jugyoin: 0.04925 },
    toyama:    { name: '富山県', total: 0.0982, jugyoin: 0.04910 },
    ishikawa:  { name: '石川県', total: 0.0988, jugyoin: 0.04940 },
    fukui:     { name: '福井県', total: 0.0985, jugyoin: 0.04925 },
    yamanashi: { name: '山梨県', total: 0.0987, jugyoin: 0.04935 },
    nagano:    { name: '長野県', total: 0.0979, jugyoin: 0.04895 },
    gifu:      { name: '岐阜県', total: 0.1003, jugyoin: 0.05015 },
    shizuoka:  { name: '静岡県', total: 0.0986, jugyoin: 0.04930 },
    aichi:     { name: '愛知県', total: 0.1009, jugyoin: 0.05045 },
    mie:       { name: '三重県', total: 0.1002, jugyoin: 0.05010 },
    shiga:     { name: '滋賀県', total: 0.0997, jugyoin: 0.04985 },
    kyoto:     { name: '京都府', total: 0.1003, jugyoin: 0.05015 },
    osaka:     { name: '大阪府', total: 0.1020, jugyoin: 0.05100 },
    hyogo:     { name: '兵庫県', total: 0.1018, jugyoin: 0.05090 },
    nara:      { name: '奈良県', total: 0.1007, jugyoin: 0.05035 },
    wakayama:  { name: '和歌山県', total: 0.1013, jugyoin: 0.05065 },
    tottori:   { name: '鳥取県', total: 0.0988, jugyoin: 0.04940 },
    shimane:   { name: '島根県', total: 0.1006, jugyoin: 0.05030 },
    okayama:   { name: '岡山県', total: 0.1025, jugyoin: 0.05125 },
    hiroshima: { name: '広島県', total: 0.1017, jugyoin: 0.05085 },
    yamaguchi: { name: '山口県', total: 0.1013, jugyoin: 0.05065 },
    tokushima: { name: '徳島県', total: 0.1026, jugyoin: 0.05130 },
    kagawa:    { name: '香川県', total: 0.1028, jugyoin: 0.05140 },
    ehime:     { name: '愛媛県', total: 0.1026, jugyoin: 0.05130 },
    kochi:     { name: '高知県', total: 0.1031, jugyoin: 0.05155 },
    fukuoka:   { name: '福岡県', total: 0.1045, jugyoin: 0.05225 },
    saga:      { name: '佐賀県', total: 0.1078, jugyoin: 0.05390 },
    nagasaki:  { name: '長崎県', total: 0.1046, jugyoin: 0.05230 },
    kumamoto:  { name: '熊本県', total: 0.1022, jugyoin: 0.05110 },
    oita:      { name: '大分県', total: 0.1025, jugyoin: 0.05125 },
    miyazaki:  { name: '宮崎県', total: 0.1020, jugyoin: 0.05100 },
    kagoshima: { name: '鹿児島県', total: 0.1038, jugyoin: 0.05190 },
    okinawa:   { name: '沖縄県', total: 0.0944, jugyoin: 0.04720 },
  },

  // ----------------------------------------------------------------
  // 標準報酬月額等級テーブル（厚生年金：32等級）
  // 支給合計からこのテーブルで等級を決定し、標準報酬月額を使用
  // ----------------------------------------------------------------
  // { min: 以上（円）, max: 未満（円）, hyojun: 標準報酬月額（円）, tokyu: 等級 }
  HYOJUN_HOSHU_HYO: [
    { min: 0,      max: 93000,  hyojun: 88000,  tokyu: 1  },
    { min: 93000,  max: 101000, hyojun: 98000,  tokyu: 2  },
    { min: 101000, max: 107000, hyojun: 104000, tokyu: 3  },
    { min: 107000, max: 114000, hyojun: 110000, tokyu: 4  },
    { min: 114000, max: 122000, hyojun: 118000, tokyu: 5  },
    { min: 122000, max: 130000, hyojun: 126000, tokyu: 6  },
    { min: 130000, max: 138000, hyojun: 134000, tokyu: 7  },
    { min: 138000, max: 146000, hyojun: 142000, tokyu: 8  },
    { min: 146000, max: 155000, hyojun: 150000, tokyu: 9  },
    { min: 155000, max: 165000, hyojun: 160000, tokyu: 10 },
    { min: 165000, max: 175000, hyojun: 170000, tokyu: 11 },
    { min: 175000, max: 185000, hyojun: 180000, tokyu: 12 },
    { min: 185000, max: 195000, hyojun: 190000, tokyu: 13 },
    { min: 195000, max: 210000, hyojun: 200000, tokyu: 14 },
    { min: 210000, max: 230000, hyojun: 220000, tokyu: 15 },
    { min: 230000, max: 250000, hyojun: 240000, tokyu: 16 },
    { min: 250000, max: 270000, hyojun: 260000, tokyu: 17 },
    { min: 270000, max: 290000, hyojun: 280000, tokyu: 18 },
    { min: 290000, max: 310000, hyojun: 300000, tokyu: 19 },
    { min: 310000, max: 330000, hyojun: 320000, tokyu: 20 },
    { min: 330000, max: 350000, hyojun: 340000, tokyu: 21 },
    { min: 350000, max: 370000, hyojun: 360000, tokyu: 22 },
    { min: 370000, max: 395000, hyojun: 380000, tokyu: 23 },
    { min: 395000, max: 425000, hyojun: 410000, tokyu: 24 },
    { min: 425000, max: 455000, hyojun: 440000, tokyu: 25 },
    { min: 455000, max: 485000, hyojun: 470000, tokyu: 26 },
    { min: 485000, max: 515000, hyojun: 500000, tokyu: 27 },
    { min: 515000, max: 545000, hyojun: 530000, tokyu: 28 },
    { min: 545000, max: 575000, hyojun: 560000, tokyu: 29 },
    { min: 575000, max: 605000, hyojun: 590000, tokyu: 30 },
    { min: 605000, max: 635000, hyojun: 620000, tokyu: 31 },
    { min: 635000, max: Infinity, hyojun: 650000, tokyu: 32 }, // 上限等級
  ],

  // ----------------------------------------------------------------
  // ヘルパー関数：支給合計から標準報酬月額を取得
  // ----------------------------------------------------------------
  getHyojunHoshu: function(shikyugokei) {
    for (var i = 0; i < this.HYOJUN_HOSHU_HYO.length; i++) {
      var row = this.HYOJUN_HOSHU_HYO[i];
      if (shikyugokei >= row.min && shikyugokei < row.max) {
        return row.hyojun;
      }
    }
    return 650000; // 上限
  },

  // ----------------------------------------------------------------
  // ヘルパー関数：健康保険料（従業員負担）を計算
  // ----------------------------------------------------------------
  calcKenkoHoken: function(shikyugokei, prefCode, hasKaigo) {
    var hyojun = this.getHyojunHoshu(shikyugokei);
    var pref = this.KENKO_RITSU[prefCode] || this.KENKO_RITSU['tokyo'];
    var ritsu = pref.jugyoin;
    if (hasKaigo) ritsu += this.KAIGO_RITSU_JUGYOIN; // 40歳以上65歳未満
    var kingaku = hyojun * ritsu;
    // 端数処理：50銭以下切捨て、50銭超切上げ
    return Math.round(kingaku);
  },

  // ----------------------------------------------------------------
  // ヘルパー関数：厚生年金保険料（従業員負担）を計算
  // ----------------------------------------------------------------
  calcKoseiNenkin: function(shikyugokei) {
    var hyojun = this.getHyojunHoshu(shikyugokei);
    var kingaku = hyojun * this.KOSEI_NENKIN_RITSU_JUGYOIN;
    return Math.round(kingaku);
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHAKAIHOKEN_HYO;
}
