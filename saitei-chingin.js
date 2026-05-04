/**
 * saitei-chingin.js - 都道府県別最低賃金
 * ================================================================
 * 【更新タイミング】毎年10月（一部の県は翌年3月まで年またぎ）
 * 【参照先】厚生労働省
 *   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/
 * 【最終確認】令和7年度（2025年10月〜2026年3月順次発効）
 * 全国加重平均：1,121円（前年比+66円・過去最大の引き上げ）
 * 全都道府県で初めて1,000円超え達成
 * ================================================================
 * 【更新方法】
 *  1. 毎年8〜9月頃に厚生労働省サイトで答申額を確認
 *  2. 10月以降に順次発効するので、発効日も確認
 *  3. 各都道府県の chingin 値を更新
 *  4. NENDO と ZENKOKU_HEIKIN を更新
 * ================================================================
 * 【注意】
 *  ・事業所の所在地（勤務地）の最低賃金が適用される
 *  ・従業員の住所地や本社所在地ではない
 * ================================================================
 */

const SAITEI_CHINGIN = {

  NENDO: '令和7年度（2025年度）',
  HATSUKO_KIKAN: '2025年10月1日〜2026年3月31日（順次）',
  ZENKOKU_HEIKIN: 1121,  // 全国加重平均

  // ----------------------------------------------------------------
  // 都道府県別最低賃金（時給・円）
  // 出典：厚生労働省「令和7年度地域別最低賃金額改定状況」
  // ----------------------------------------------------------------
  todofuken: {
    hokkaido:  { name: '北海道', chingin: 1107 },
    aomori:    { name: '青森県', chingin: 1055 },
    iwate:     { name: '岩手県', chingin: 1047 },
    miyagi:    { name: '宮城県', chingin: 1055 },
    akita:     { name: '秋田県', chingin: 1031 },
    yamagata:  { name: '山形県', chingin: 1037 },
    fukushima: { name: '福島県', chingin: 1028 },
    ibaraki:   { name: '茨城県', chingin: 1077 },
    tochigi:   { name: '栃木県', chingin: 1078 },
    gunma:     { name: '群馬県', chingin: 1057 },
    saitama:   { name: '埼玉県', chingin: 1148 },
    chiba:     { name: '千葉県', chingin: 1145 },
    tokyo:     { name: '東京都', chingin: 1226 },
    kanagawa:  { name: '神奈川県', chingin: 1225 },
    niigata:   { name: '新潟県', chingin: 1063 },
    toyama:    { name: '富山県', chingin: 1072 },
    ishikawa:  { name: '石川県', chingin: 1058 },
    fukui:     { name: '福井県', chingin: 1049 },
    yamanashi: { name: '山梨県', chingin: 1055 },
    nagano:    { name: '長野県', chingin: 1072 },
    gifu:      { name: '岐阜県', chingin: 1068 },
    shizuoka:  { name: '静岡県', chingin: 1105 },
    aichi:     { name: '愛知県', chingin: 1145 },
    mie:       { name: '三重県', chingin: 1092 },
    shiga:     { name: '滋賀県', chingin: 1082 },
    kyoto:     { name: '京都府', chingin: 1124 },
    osaka:     { name: '大阪府', chingin: 1177 },
    hyogo:     { name: '兵庫県', chingin: 1118 },
    nara:      { name: '奈良県', chingin: 1053 },
    wakayama:  { name: '和歌山県', chingin: 1043 },
    tottori:   { name: '鳥取県', chingin: 1027 },
    shimane:   { name: '島根県', chingin: 1032 },
    okayama:   { name: '岡山県', chingin: 1050 },
    hiroshima: { name: '広島県', chingin: 1090 },
    yamaguchi: { name: '山口県', chingin: 1043 },
    tokushima: { name: '徳島県', chingin: 1051 },
    kagawa:    { name: '香川県', chingin: 1071 },
    ehime:     { name: '愛媛県', chingin: 1023 },
    kochi:     { name: '高知県', chingin: 1023 },
    fukuoka:   { name: '福岡県', chingin: 1065 },
    saga:      { name: '佐賀県', chingin: 1024 },
    nagasaki:  { name: '長崎県', chingin: 1020 },
    kumamoto:  { name: '熊本県', chingin: 1034 },
    oita:      { name: '大分県', chingin: 1019 },
    miyazaki:  { name: '宮崎県', chingin: 1023 },
    kagoshima: { name: '鹿児島県', chingin: 1020 },
    okinawa:   { name: '沖縄県', chingin: 1023 },
  },

  // ----------------------------------------------------------------
  // ヘルパー関数
  // ----------------------------------------------------------------
  // 都道府県名から最低賃金を取得
  getChingin: function(prefCode) {
    var pref = this.todofuken[prefCode];
    return pref ? pref.chingin : null;
  }

};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SAITEI_CHINGIN;
}
