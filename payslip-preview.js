/**
 * payslip-preview.js
 * 給料明細プレビュー 統合エントリーポイント
 * layout='A' → makeACard / layout='B' → makeBCard を呼び出す
 * 個別ファイル: payslip-mint-tate1.js / payslip-mint-yoko1.js
 */
/**
 * payslip-preview.js
 * 給料明細プレビュー描画モジュール（kyuuryoumeisai.html 共用）
 * 将来テンプレ追加時は同様の preview-xxx.js を作る設計
 *
 * 依存なし・単体動作
 * 使い方: renderPayslipPreview(el, layout, ninzu, activeItems)
 */

// =============================================
// PDFサンプルデータ（a_1p〜a_4p / b_1p〜b_3p 確定値）
// =============================================
var PAYSLIP_SAMPLE_PERSONS = [
  {
    name: '山田 太郎',
    att:  { 出勤日数:20, 欠勤日数:0, 所定労働:176, 残業時間:8, 深夜時間:0 },
    pay:  { 基本給:250000, 残業代:9766, 通勤手当:10000, 皆勤手当:5000 },
    ded:  { 健康保険:12883, 厚生年金:23790, 雇用保険:1506, 所得税:6410, 住民税:10000 },
    payTotal: 274766, dedTotal: 54589, net: 206917,
  },
  {
    name: '鈴木 花子',
    att:  { 出勤日数:19, 欠勤日数:1, 所定労働:168, 残業時間:5, 深夜時間:0 },
    pay:  { 基本給:220000, 残業代:6875, 通勤手当:8000, 皆勤手当:0 },
    ded:  { 健康保険:11024, 厚生年金:20343, 雇用保険:1288, 所得税:4800, 住民税:12000 },
    payTotal: 234875, dedTotal: 49455, net: 185420,
  },
  {
    name: '田中 次郎',
    att:  { 出勤日数:21, 欠勤日数:0, 所定労働:184, 残業時間:22, 深夜時間:4 },
    pay:  { 基本給:380000, 残業代:29701, 通勤手当:15000, 皆勤手当:5000 },
    ded:  { 健康保険:21289, 厚生年金:39345, 雇用保険:2578, 所得税:14249, 住民税:27000 },
    payTotal: 429701, dedTotal: 104461, net: 325240,
  },
  {
    name: '佐藤 美咲',
    att:  { 出勤日数:18, 欠勤日数:2, 所定労働:160, 残業時間:3, 深夜時間:0 },
    pay:  { 基本給:210000, 残業代:4500, 通勤手当:7000, 皆勤手当:0 },
    ded:  { 健康保険:10400, 厚生年金:19100, 雇用保険:1200, 所得税:4200, 住民税:8100 },
    payTotal: 221500, dedTotal: 43000, net: 178500,
  },
];

// =============================================
// レイアウト仕様（PDFより確定）
// =============================================
var PAYSLIP_LAYOUT = {
  A: {
    // 人数別フォントサイズ・人数別差引行高さ
    diffFont: { 1:14, 2:12, 3:11, 4:10 },
  },
  B: {
    diffFont:    { 1:13, 2:11, 3:10 },
    compact:     { 1:false, 2:false, 3:true },
  },
  colors: {
    hdrBg:      '#3D9E72',
    hdrText:    '#ffffff',
    secBg:      '#F0FAF4',
    secText:    '#3D9E72',
    secBorder:  '#C8ECD8',
    diffText:   '#3D9E72',
    itemLabel:  '#3A4A42',
    itemVal:    '#3A4A42',
    totalVal:   '#3D9E72',
    totalBg:    '#F8FEFC',
    totalBorder:'#3D9E72',
    gray:       '#8A9A8E',
    border:     '#C8ECD8',
    dotLine:    '#E8F5EE',
  },
};

// =============================================
// ヘルパー
// =============================================
function _yen(n) {
  return '\u00a5' + Math.round(n || 0).toLocaleString();
}

function _mergePersonData(activeItems, samplePerson, actualData) {
  // activeItemsがあれば項目ラベルをそちらから、値はサンプル（actualDataがあれば実値優先）
  var pay = activeItems
    ? activeItems.filter(function(i) { return i.type === 'pay'; })
    : Object.keys(samplePerson.pay).map(function(k) { return { label: k }; });
  var ded = activeItems
    ? activeItems.filter(function(i) { return i.type === 'deduct'; })
    : Object.keys(samplePerson.ded).map(function(k) { return { label: k }; });
  var inf = activeItems
    ? activeItems.filter(function(i) { return i.type === 'info'; })
    : Object.keys(samplePerson.att).map(function(k) { return { label: k }; });

  // 支給値: actualDataがあれば実値、なければサンプル値にインデックス対応
  var payKeys = Object.keys(samplePerson.pay);
  var dedKeys = Object.keys(samplePerson.ded);

  return {
    name:     samplePerson.name,
    payRows:  pay.map(function(item, i) {
      var val = (actualData && actualData.payRows && actualData.payRows[i] !== undefined)
                ? actualData.payRows[i]
                : (samplePerson.pay[payKeys[i]] || 0);
      return { label: item.label, val: val };
    }),
    dedRows:  ded.map(function(item, i) {
      var val = (actualData && actualData.dedRows && actualData.dedRows[i] !== undefined)
                ? actualData.dedRows[i]
                : (samplePerson.ded[dedKeys[i]] || 0);
      return { label: item.label, val: val };
    }),
    attStr:   Object.keys(samplePerson.att).map(function(k) {
      return k + samplePerson.att[k];
    }).join('\u3000'),
    payTotal: (actualData && actualData.payTotal) || samplePerson.payTotal,
    dedTotal: (actualData && actualData.dedTotal) || samplePerson.dedTotal,
    net:      (actualData && actualData.net)      || samplePerson.net,
  };
}

// =============================================
// A縦型カード1枚のHTML生成
// =============================================
function makeACard(person, diffFontSize) {
  var c = PAYSLIP_LAYOUT.colors;
  var df = diffFontSize || 12;

  function row(label, val) {
    return '<div style="display:flex;justify-content:space-between;padding:2px 8px;border-bottom:1px dotted ' + c.dotLine + ';font-size:9px;">'
      + '<span style="color:' + c.itemLabel + ';">' + label + '</span>'
      + '<span style="color:' + c.itemVal + ';font-family:monospace;">' + val + '</span>'
      + '</div>';
  }
  function secHdr(label) {
    return '<div style="background:' + c.secBg + ';padding:2px 8px;font-size:8px;font-weight:700;color:' + c.secText + ';border-bottom:1px dotted ' + c.secBorder + ';">' + label + '</div>';
  }
  function totalRow(label, val) {
    return '<div style="display:flex;justify-content:space-between;padding:2px 8px;font-size:9px;font-weight:700;">'
      + '<span style="color:' + c.itemLabel + ';">' + label + '</span>'
      + '<span style="color:' + c.totalVal + ';font-family:monospace;">' + val + '</span>'
      + '</div>';
  }

  var attRows = '';
  if (person.attStr) {
    attRows = secHdr('勤 怠')
      + '<div style="padding:2px 8px;font-size:8px;color:' + c.gray + ';border-bottom:1px dotted ' + c.dotLine + ';">' + person.attStr + '</div>';
  }

  var payRows = person.payRows.map(function(r) { return row(r.label, _yen(r.val)); }).join('');
  var dedRows = person.dedRows.map(function(r) { return row(r.label, _yen(r.val)); }).join('');

  return '<div style="background:#fff;border:1.5px solid ' + c.border + ';border-radius:6px;overflow:hidden;flex:1;min-width:0;">'
    // ヘッダー1段目
    + '<div style="background:' + c.hdrBg + ';padding:5px 8px;display:flex;justify-content:space-between;align-items:center;">'
    + '<span style="font-size:10px;font-weight:700;color:' + c.hdrText + ';letter-spacing:2px;">給 料 明 細</span>'
    + '<span style="font-size:8px;color:rgba(255,255,255,0.85);">2026年4月分</span>'
    + '</div>'
    // ヘッダー2段目
    + '<div style="background:' + c.hdrBg + ';padding:3px 8px;display:flex;justify-content:space-between;font-size:8px;color:' + c.hdrText + ';border-top:1px solid #52B788;">'
    + '<span>○○株式会社</span><span>' + person.name + ' 様</span>'
    + '</div>'
    // 差引支給額
    + '<div style="padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + c.secBorder + ';">'
    + '<span style="font-size:8px;color:' + c.gray + ';letter-spacing:1px;">差引支給額</span>'
    + '<span style="font-size:' + df + 'px;font-weight:700;color:' + c.diffText + ';font-family:monospace;">' + _yen(person.net) + '</span>'
    + '</div>'
    // 勤怠
    + attRows
    // 支給
    + secHdr('支 給') + payRows + totalRow('総支給額', _yen(person.payTotal))
    // 控除
    + secHdr('控 除') + dedRows + totalRow('控除合計', _yen(person.dedTotal))
    // フッター

    + '</div>';
}

// =============================================
// B横型カード1枚のHTML生成
// =============================================
function makeBCard(person, compact, diffFontSize) {
  var c = PAYSLIP_LAYOUT.colors;
  var df = diffFontSize || 11;

  function bItem(label, val) {
    return '<div style="display:flex;justify-content:space-between;padding:' + (compact ? '1.5px' : '2px') + ' 0;border-bottom:1px dotted #F4F7F5;font-size:' + (compact ? '7px' : '8px') + ';">'
      + '<span style="color:#4A6B5A;">' + label + '</span>'
      + '<span style="color:' + c.itemVal + ';font-family:monospace;">' + val + '</span>'
      + '</div>';
  }

  var payRows = person.payRows.map(function(r) { return bItem(r.label, _yen(r.val)); }).join('');
  var dedRows = person.dedRows.map(function(r) { return bItem(r.label, _yen(r.val)); }).join('');

  return '<div style="background:#fff;border:1.5px solid ' + c.border + ';border-radius:6px;overflow:hidden;">'
    + '<div style="background:' + c.hdrBg + ';padding:5px 8px;display:flex;justify-content:space-between;align-items:center;">'
    + '<span style="font-size:10px;font-weight:700;color:' + c.hdrText + ';letter-spacing:2px;">給 料 明 細</span>'
    + '<span style="font-size:8px;color:rgba(255,255,255,0.85);">2026年4月分</span>'
    + '</div>'
    + '<div style="background:' + c.hdrBg + ';padding:3px 8px;display:flex;justify-content:space-between;font-size:8px;color:' + c.hdrText + ';border-top:1px solid #52B788;">'
    + '<span>○○株式会社</span><span>' + person.name + ' 様</span>'
    + '</div>'
    + '<div style="padding:4px 8px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ' + c.secBorder + ';">'
    + '<span style="font-size:8px;color:' + c.gray + ';letter-spacing:1px;">差引支給額</span>'
    + '<span style="font-size:' + df + 'px;font-weight:700;color:' + c.diffText + ';font-family:monospace;">' + _yen(person.net) + '</span>'
    + '</div>'
    + '<div style="background:' + c.secBg + ';padding:3px 8px;font-size:' + (compact ? '7px' : '8px') + ';color:' + c.secText + ';border-bottom:1px solid ' + c.secBorder + ';">⏱ ' + person.attStr + '</div>'
    + '<div style="display:flex;border-bottom:1.5px solid ' + c.secBorder + ';">'
    + '<div style="flex:1;padding:' + (compact ? '3px' : '5px') + ' 8px;border-right:1px solid #E0EDE6;">'
    + '<div style="font-size:7px;font-weight:700;color:' + c.secText + ';background:' + c.secBg + ';padding:2px 0 3px;border-bottom:1px solid ' + c.secBorder + ';margin-bottom:2px;">支 給</div>'
    + payRows
    + '<div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700;font-size:8px;">'
    + '<span style="color:#1A2B22;">総支給額</span><span style="color:' + c.totalVal + ';font-family:monospace;">' + _yen(person.payTotal) + '</span>'
    + '</div></div>'
    + '<div style="flex:1;padding:' + (compact ? '3px' : '5px') + ' 8px;">'
    + '<div style="font-size:7px;font-weight:700;color:' + c.secText + ';background:' + c.secBg + ';padding:2px 0 3px;border-bottom:1px solid ' + c.secBorder + ';margin-bottom:2px;">控 除</div>'
    + dedRows
    + '<div style="display:flex;justify-content:space-between;padding:2px 0;font-weight:700;font-size:8px;">'
    + '<span style="color:#1A2B22;">控除合計</span><span style="color:' + c.itemVal + ';font-family:monospace;">' + _yen(person.dedTotal) + '</span>'
    + '</div></div></div>'
    + '<div style="background:' + c.totalBg + ';padding:' + (compact ? '3px' : '5px') + ' 8px;display:flex;justify-content:space-between;align-items:center;">'
    + '<span style="font-size:9px;font-weight:700;color:#1A2B22;">差引支給額</span>'
    + '<span style="font-size:' + (compact ? 11 : 13) + 'px;font-weight:700;color:' + c.diffText + ';font-family:monospace;">' + _yen(person.net) + '</span>'
    + '</div>'
    + '</div>';
}

// =============================================
// メイン描画関数
// =============================================
// actualData: person 0 の実値 { payRows:[], dedRows:[], payTotal, dedTotal, net }
// 省略時はサンプル値を使用（後方互換）
function renderPayslipPreview(el, layout, ninzu, activeItems, actualData) {
  if (!el) return;
  var perf = '<div style="border-top:1.5px dashed #C8ECD8;margin:4px 0;text-align:center;font-size:9px;color:#C8ECD8;">\u2702</div>';
  var sep  = '<div style="width:1px;background:repeating-linear-gradient(to bottom,#52B788 0,#52B788 5px,transparent 5px,transparent 9px);flex-shrink:0;margin:0 6px;"></div>';

  var people = [];
  for (var i = 0; i < ninzu; i++) {
    // person 0 のみ実値を渡す（1〜3 はサンプル値）
    var ad = (i === 0 && actualData) ? actualData : null;
    people.push(_mergePersonData(activeItems, PAYSLIP_SAMPLE_PERSONS[i] || PAYSLIP_SAMPLE_PERSONS[0], ad));
  }

  var html = '';

  if (layout === 'B') {
    // B横型: 縦積み・A4縦向き比率（max-width:300px = PDF仕様）
    var compact = PAYSLIP_LAYOUT.B.compact[ninzu] || false;
    var df      = PAYSLIP_LAYOUT.B.diffFont[ninzu] || 11;
    var cards   = people.map(function(p) { return makeBCard(p, compact, df); });
    html = '<div style="max-width:300px;margin:0 auto;">' + cards.join(perf) + '</div>';
  } else {
    // A縦型: 横並び（PDF比率準拠）
    var df = PAYSLIP_LAYOUT.A.diffFont[ninzu] || 11;
    // PDF仕様: 1人=40%中央, 2人=40%+gap10%, 3人=28%+gap6%, 4人=23.75%+gap1%
    var widths = {1:'40%', 2:'40%', 3:'28%', 4:'23.75%'};
    var gaps   = {1:'0px', 2:'6px',  3:'4px',  4:'2px'};
    var w = widths[ninzu] || '25%';
    var g = gaps[ninzu]   || '4px';
    if (ninzu === 1) {
      html = '<div style="max-width:260px;width:100%;margin:0 auto;">' + makeACard(people[0], df) + '</div>';
    } else {
      var parts = people.map(function(p) {
        return '<div style="flex:0 0 ' + w + ';min-width:0;">' + makeACard(p, df) + '</div>';
      });
      html = '<div style="display:flex;gap:' + g + ';align-items:stretch;">'
        + parts.join(sep)
        + '</div>';
    }
  }

  el.innerHTML = html;
}
