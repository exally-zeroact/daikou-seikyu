// ===================================================================
// kyuuryoumeisai-data.js
// 給料明細のテンプレートデータ定義
// 元: kyuuryoumeisai.html から切り出し（2026-04-21）
// 機能・挙動は既存と 100% 同一（関数リテラルも保持）
// ===================================================================

// ----- 月給制の項目定義 -----
window.MONTHLY = [
  {id:'attend',label:'出勤日数',type:'info',cat:'勤怠',default:true,canRemove:false,value:'22日 / 所定21日',formula:null,title:null,rates:null},
  {id:'absent',label:'欠勤日数',type:'info',cat:'勤怠',default:true,canRemove:true,value:'0日',formula:null,title:null,rates:null},
  {id:'ot_h',label:'残業時間',type:'info',cat:'勤怠',default:true,canRemove:true,value:'10時間',formula:null,title:null,rates:null},
  {id:'mid_h',label:'深夜時間',type:'info',cat:'勤怠',default:false,canRemove:true,value:'0時間',formula:null,title:null,rates:null},
  {id:'basic',label:'基本給',type:'pay',cat:'支給',default:true,canRemove:false,value:'¥250,000',formula:'手入力',title:'基本給',desc:'毎月固定で支払われる給与。残業代・手当の計算基準になります。',why:'基本給は雇用契約で決定します。',rates:null},
  {id:'overtime',label:'残業代',type:'pay',cat:'支給',default:true,canRemove:true,value:'=基本給÷160×1.25×残業時間',formula:'=ROUND(基本給/160*1.25*残業時間,0)',title:'残業代の計算式',desc:'月の所定労働時間（160時間）で基本給を割り、割増率をかけた金額です。',why:'労働基準法により月60時間以内の残業は25%増し（×1.25）が義務です。',rates:[{key:'rate',label:'残業割増率',val:1.25,unit:'倍',hint:'法定最低 1.25倍',fmt:v=>v.toFixed(2)+'倍',toD:v=>v,frD:v=>parseFloat(v)}]},
  {id:'midnight',label:'深夜手当',type:'pay',cat:'支給',default:true,canRemove:true,value:'=基本給÷160×0.25×深夜時間',formula:'=ROUND(基本給/160*0.25*深夜時間,0)',title:'深夜手当の計算式',desc:'22時〜翌5時の労働に対して基本給の25%増しが追加されます。',why:'深夜労働には25%割増賃金が法律で義務付けられています（労基法第37条）。',rates:[{key:'rate',label:'深夜割増率',val:0.25,unit:'倍',hint:'法定最低 0.25倍',fmt:v=>v.toFixed(2)+'倍',toD:v=>v,frD:v=>parseFloat(v)}]},
  {id:'transport',label:'交通費',type:'pay',cat:'支給',default:true,canRemove:true,value:'¥15,000',formula:'手入力',title:'交通費',desc:'通勤実費を支給します。非課税限度額は月15万円です。',why:'月15万円を超える交通費は給与として課税されます。',rates:null},
  {id:'health',label:'健康保険',sub:'病院代が安くなる保険',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=支給合計×4.955%',formula:'=ROUND(支給合計*0.04955,0)',title:'健康保険料の計算式',desc:'給与から健康保険料が天引きされます。会社と折半で負担します。',why:'協会けんぽ（東京）2025年度の従業員負担は4.955%です。',rates:[{key:'rate',label:'従業員負担率',val:0.04955,unit:'%',hint:'東京協会けんぽ2025年度: 4.955%',fmt:v=>(v*100).toFixed(3)+'%',toD:v=>(v*100).toFixed(3),frD:v=>parseFloat(v)/100}]},
  {id:'pension',label:'厚生年金',sub:'将来の年金のための積立',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=支給合計×9.15%（全国一律）',formula:'=ROUND(支給合計*0.0915,0)',title:'厚生年金保険料の計算式',desc:'全国一律18.3%。会社と折半するため従業員負担は9.15%です。',why:'厚生年金の料率は法律で全国一律18.3%に固定されています。',rates:[{key:'rate',label:'従業員負担率（固定）',val:0.0915,unit:'%',hint:'法定固定値 変更不可',fmt:v=>(v*100).toFixed(2)+'%',toD:v=>(v*100).toFixed(2),frD:v=>parseFloat(v)/100,ro:true}]},
  {id:'employ',label:'雇用保険',sub:'失業したときの給付金',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=支給合計×0.55%',formula:'=ROUND(支給合計*0.0055,0)',title:'雇用保険料の計算式',desc:'失業給付などの財源となる保険料です。',why:'2025年度の雇用保険料率（一般事業）は従業員負担0.55%です。',rates:[{key:'rate',label:'従業員負担率',val:0.0055,unit:'%',hint:'一般事業2025年度: 0.55%',fmt:v=>(v*100).toFixed(2)+'%',toD:v=>(v*100).toFixed(2),frD:v=>parseFloat(v)/100}]},
  {id:'kaigo',label:'介護保険',sub:'40歳以上64歳以下の従業員に適用',type:'deduct',cat:'控除',default:false,canRemove:true,value:'=支給合計×0.795%',formula:'=ROUND(支給合計*0.00795,0)',title:'介護保険料の計算式',desc:'40歳以上64歳以下の従業員に健康保険と一緒に天引きされます。会社と折半で負担します。',why:'令和7年度の介護保険料率は1.59%で、従業員負担は半分の0.795%です。40歳未満・65歳以上の従業員には不要です。',rates:[{key:'rate',label:'従業員負担率',val:0.00795,unit:'%',hint:'令和7年度: 0.795%（全国一律）',fmt:v=>(v*100).toFixed(3)+'%',toD:v=>(v*100).toFixed(3),frD:v=>parseFloat(v)/100}]},
  {id:'income',label:'所得税',sub:'給与にかかる国税（年末調整あり）',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=課税所得×源泉税額表',formula:'=課税所得×源泉税額表',title:'所得税の計算式',desc:'給与から社会保険料を引いた金額と扶養人数をもとに、国税庁の源泉徴収税額表で金額が決まるよ。',why:'給与から社会保険料を引いた金額がどの範囲かを国税庁の税額表で調べて、その金額をそのまま使うんだよ。従業員ごとの扶養人数・都道府県はExcelの設定エリアで変更してね。年末調整で最終的な金額に精算されるから安心してね。',rates:null},
  {id:'resident',label:'住民税',sub:'前年所得への市区町村税',type:'deduct',cat:'控除',default:false,canRemove:true,value:'¥8,500',formula:'手入力',title:'住民税',desc:'前年の所得に基づき市区町村が計算した金額を12分割して天引きします。',why:'住民税は前年所得で決まるため会社での計算は不可能です。',rates:null},
  {id:'perfect',label:'皆勤手当',type:'pay',cat:'支給',default:false,canRemove:true,value:'=IF(欠勤=0, ¥5,000, ¥0)',formula:'=IF(欠勤日数=0,5000,0)',title:'皆勤手当の計算式',desc:'欠勤・遅刻が0回の月に支給される手当です。',why:'皆勤手当は法律の義務ではなく会社が任意で設定します。',rates:[{key:'amount',label:'支給金額',val:5000,unit:'円',hint:'会社で自由に設定',fmt:v=>'¥'+Math.round(v).toLocaleString(),toD:v=>Math.round(v),frD:v=>parseInt(v)}]},
  {id:'housing',label:'住宅手当',type:'pay',cat:'支給',default:false,canRemove:true,value:'固定額（¥10,000）',formula:'=10000',title:'住宅手当',desc:'従業員の家賃負担を軽減するための手当です。',why:'住宅手当は法律上の義務はありません。',rates:[{key:'amount',label:'支給金額',val:10000,unit:'円',hint:'会社で自由に設定',fmt:v=>'¥'+Math.round(v).toLocaleString(),toD:v=>Math.round(v),frD:v=>parseInt(v)}]},
  {id:'skill',label:'資格手当',type:'pay',cat:'支給',default:false,canRemove:true,value:'固定額（¥3,000）',formula:'=3000',title:'資格手当',desc:'調理師免許・食品衛生責任者など特定資格保持者への手当です。',why:'資格手当は会社が任意で設定できます。',rates:[{key:'amount',label:'支給金額',val:3000,unit:'円',hint:'会社で自由に設定',fmt:v=>'¥'+Math.round(v).toLocaleString(),toD:v=>Math.round(v),frD:v=>parseInt(v)}]},
  {id:'lunch',label:'弁当代・食事代',type:'deduct',cat:'控除',default:false,canRemove:true,value:'¥3,000',formula:'手入力',title:'弁当代・食事代の控除',desc:'社員食堂やまかない食の実費を給与から天引きします。',why:'月3,500円以下かつ従業員が半額以上負担する場合は非課税。',rates:[{key:'amount',label:'月額控除額',val:3000,unit:'円',hint:'月3,500円以下・半額以上負担で非課税',fmt:v=>'¥'+Math.round(v).toLocaleString(),toD:v=>Math.round(v),frD:v=>parseInt(v)}]},
  {id:'dormitory',label:'社宅・寮費',type:'deduct',cat:'控除',default:false,canRemove:true,value:'¥15,000',formula:'手入力',title:'社宅・寮費の控除',desc:'会社が用意した社宅・寮の家賃相当額を天引きします。',why:'適正家賃の50%以上を従業員が負担すれば非課税。',rates:null},
  {id:'uniform',label:'制服・ユニフォーム代',type:'deduct',cat:'控除',default:false,canRemove:true,value:'¥1,000',formula:'手入力',title:'制服・ユニフォーム代の控除',desc:'制服の購入費などを分割で天引きします。',why:'業務に必要な制服は会社負担が原則。就業規則への明記が必要です。',rates:null},
  {id:'union',label:'組合費・親睦会費',type:'deduct',cat:'控除',default:false,canRemove:true,value:'¥500',formula:'手入力',title:'組合費・親睦会費の控除',desc:'労働組合費や社内親睦会費を給与から天引きします。',why:'チェックオフ（給与天引き）は労使協定が必要です。',rates:null},
  {id:'advance',label:'貸付金・立替金返済',type:'deduct',cat:'控除',default:false,canRemove:true,value:'¥10,000',formula:'手入力',title:'貸付金・立替金返済の控除',desc:'会社からの借入金や立替金を分割で返済します。',why:'給与からの控除は労使協定が必要です。最低賃金を下回る控除は違法です。',rates:null},
];

// ----- 時給制の項目定義 -----
window.HOURLY = [
  {id:'h_work',label:'実働時間',type:'info',cat:'勤怠',default:true,canRemove:false,value:'160時間00分',formula:null,title:null,rates:null},
  {id:'h_attend',label:'出勤日数',type:'info',cat:'勤怠',default:true,canRemove:false,value:'22日',formula:null,title:null,rates:null},
  {id:'h_ot_h',label:'残業時間',type:'info',cat:'勤怠',default:true,canRemove:true,value:'10時間',formula:null,title:null,rates:null},
  {id:'h_mid_h',label:'深夜時間',type:'info',cat:'勤怠',default:false,canRemove:true,value:'0時間',formula:null,title:null,rates:null},
  {id:'h_wage',label:'時給',type:'pay',cat:'支給',default:true,canRemove:false,value:'¥1,563',formula:'手入力',title:'時給',desc:'雇用契約で決めた1時間あたりの賃金です。',why:'月給¥250,000相当の時給。実際の時給はExallyブックで設定してね。地域の最低賃金（2025年度東京1,226円など）を下回ると違法になります。',rates:[{key:'wage',label:'時給',val:1563,unit:'円',hint:'月給¥250,000相当のサンプル値',fmt:v=>'¥'+Math.round(v).toLocaleString(),toD:v=>Math.round(v),frD:v=>parseInt(v)}]},
  {id:'h_base',label:'基本給（時給×実働）',type:'pay',cat:'支給',default:true,canRemove:false,value:'=時給×実働時間',formula:'=ROUND(時給*実働時間,0)',title:'基本給（時給制）の計算式',desc:'時給に実際の実働時間をかけた金額です。',why:'時給制の場合、働いた時間だけ給与が発生します。',rates:null},
  {id:'h_ot',label:'残業代（時給制）',type:'pay',cat:'支給',default:true,canRemove:true,value:'=時給×1.25×残業時間',formula:'=ROUND(時給*1.25*残業時間,0)',title:'残業代（時給制）の計算式',desc:'時給に割増率（1.25）と残業時間をかけた金額です。',why:'月60時間以内の残業は時給の25%増し（×1.25）が法定義務です。',rates:[{key:'rate',label:'残業割増率',val:1.25,unit:'倍',hint:'法定最低 1.25倍',fmt:v=>v.toFixed(2)+'倍',toD:v=>v,frD:v=>parseFloat(v)}]},
  {id:'h_mid',label:'深夜手当（時給制）',type:'pay',cat:'支給',default:false,canRemove:true,value:'=時給×0.25×深夜時間',formula:'=ROUND(時給*0.25*深夜時間,0)',title:'深夜手当（時給制）の計算式',desc:'時給の25%増しが深夜時間分追加されます。',why:'時給制も月給制と同様に深夜割増（0.25倍）が義務です。',rates:[{key:'rate',label:'深夜割増率',val:0.25,unit:'倍',hint:'法定最低 0.25倍',fmt:v=>v.toFixed(2)+'倍',toD:v=>v,frD:v=>parseFloat(v)}]},
  {id:'h_health',label:'健康保険',sub:'病院代が安くなる保険',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=支給合計×4.955%',formula:'=ROUND(支給合計*0.04955,0)',title:'健康保険料（時給制）',desc:'支給合計に保険料率をかけた金額を天引きします。',why:'週30時間以上（または一定条件）勤務のパートは社会保険加入が必要です。',rates:[{key:'rate',label:'従業員負担率',val:0.04955,unit:'%',hint:'東京協会けんぽ2025年度: 4.955%',fmt:v=>(v*100).toFixed(3)+'%',toD:v=>(v*100).toFixed(3),frD:v=>parseFloat(v)/100}]},
  {id:'h_pension',label:'厚生年金',sub:'将来の年金のための積立',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=支給合計×9.15%（全国一律）',formula:'=ROUND(支給合計*0.0915,0)',title:'厚生年金（時給制）',desc:'全国一律18.3%。会社と折半するため従業員負担は9.15%です。',why:'料率は法律で固定されています。',rates:[{key:'rate',label:'従業員負担率（固定）',val:0.0915,unit:'%',hint:'法定固定値 変更不可',fmt:v=>(v*100).toFixed(2)+'%',toD:v=>(v*100).toFixed(2),frD:v=>parseFloat(v)/100,ro:true}]},
  {id:'h_employ',label:'雇用保険',sub:'失業したときの給付金',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=支給合計×0.55%',formula:'=ROUND(支給合計*0.0055,0)',title:'雇用保険料（時給制）',desc:'週20時間以上勤務であれば加入が必要です。',why:'2025年度の雇用保険料率（一般事業）は従業員負担0.55%です。',rates:[{key:'rate',label:'従業員負担率',val:0.0055,unit:'%',hint:'一般事業2025年度: 0.55%',fmt:v=>(v*100).toFixed(2)+'%',toD:v=>(v*100).toFixed(2),frD:v=>parseFloat(v)/100}]},
  {id:'h_kaigo',label:'介護保険',sub:'40歳以上64歳以下の従業員に適用',type:'deduct',cat:'控除',default:false,canRemove:true,value:'=支給合計×0.795%',formula:'=ROUND(支給合計*0.00795,0)',title:'介護保険料の計算式（時給制）',desc:'40歳以上64歳以下の従業員に健康保険と一緒に天引きされます。会社と折半で負担します。',why:'令和7年度の介護保険料率は1.59%で、従業員負担は半分の0.795%です。40歳未満・65歳以上の従業員には不要です。',rates:[{key:'rate',label:'従業員負担率',val:0.00795,unit:'%',hint:'令和7年度: 0.795%（全国一律）',fmt:v=>(v*100).toFixed(3)+'%',toD:v=>(v*100).toFixed(3),frD:v=>parseFloat(v)/100}]},
  {id:'h_income',label:'所得税',sub:'給与にかかる国税（年末調整あり）',type:'deduct',cat:'控除',default:true,canRemove:true,value:'=課税所得×源泉税額表',formula:'=課税所得×源泉税額表',title:'所得税の計算式（時給制）',desc:'給与から社会保険料を引いた金額と扶養人数をもとに、国税庁の源泉徴収税額表で金額が決まるよ。',why:'給与から社会保険料を引いた金額がどの範囲かを国税庁の税額表で調べて、その金額をそのまま使うんだよ。従業員ごとの扶養人数・都道府県はExcelの設定エリアで変更してね。年末調整で最終的な金額に精算されるから安心してね。',rates:null},
];

// ----- 日当制の項目定義 -----
window.DAILY = [
  {id:'d_teiji', label:'1日所定時間', type:'info', cat:'勤怠', default:true, canRemove:false, value:'8時間',   formula:null, title:null, rates:null},
  {id:'d_attend',label:'出勤日数',    type:'info', cat:'勤怠', default:true, canRemove:false, value:'20日',    formula:null, title:null, rates:null},
  {id:'d_ot_h',  label:'残業時間',   type:'info', cat:'勤怠', default:true, canRemove:true,  value:'0時間',   formula:null, title:null, rates:null},
  {id:'d_mid_h', label:'深夜時間',   type:'info', cat:'勤怠', default:false,canRemove:true,  value:'0時間',   formula:null, title:null, rates:null},
  {id:'d_wage',  label:'日当',       type:'pay',  cat:'支給', default:true, canRemove:false, value:'¥15,000', formula:'手入力', title:'日当', desc:'1日あたりの賃金です。出勤日数をかけて基本給を計算します。', why:'日当×出勤日数=基本給。残業代は日当÷所定時間×1.25×残業時間で計算します。', rates:[{key:'wage',label:'日当',val:15000,unit:'円',hint:'会社で設定',fmt:v=>'¥'+Math.round(v).toLocaleString(),toD:v=>Math.round(v),frD:v=>parseInt(v)}]},
  {id:'d_base',  label:'基本給（日当×出勤日数）', type:'pay', cat:'支給', default:true, canRemove:false, value:'=日当×出勤日数', formula:'=ROUND(日当*出勤日数,0)', title:'基本給（日当制）の計算式', desc:'日当に出勤日数をかけた金額です。', why:'日当制では実際に出勤した日数分だけ給与が発生します。', rates:null},
  {id:'d_ot',    label:'残業代（日当制）', type:'pay', cat:'支給', default:true, canRemove:true, value:'=日当÷所定時間×1.25×残業時間', formula:'=ROUND(日当/1日所定時間*1.25*残業時間,0)', title:'残業代（日当制）の計算式', desc:'日当を所定時間で割った時給換算額に、割増率と残業時間をかけます。', why:'日当制でも時間外労働は25%割増が法律で義務付けられています。', rates:[{key:'rate',label:'残業割増率',val:1.25,unit:'倍',hint:'法定最低 1.25倍',fmt:v=>v.toFixed(2)+'倍',toD:v=>v,frD:v=>parseFloat(v)}]},
  {id:'d_mid',   label:'深夜手当（日当制）', type:'pay', cat:'支給', default:false, canRemove:true, value:'=日当÷所定時間×0.25×深夜時間', formula:'=ROUND(日当/1日所定時間*0.25*深夜時間,0)', title:'深夜手当（日当制）の計算式', desc:'日当÷所定時間で時給換算し、0.25倍×深夜時間分を追加します。', why:'日当制も深夜割増（0.25倍）の義務があります。', rates:[{key:'rate',label:'深夜割増率',val:0.25,unit:'倍',hint:'法定最低 0.25倍',fmt:v=>v.toFixed(2)+'倍',toD:v=>v,frD:v=>parseFloat(v)}]},
  {id:'d_transport',label:'交通費', type:'pay', cat:'支給', default:true, canRemove:true, value:'¥15,000', formula:'手入力', title:'交通費', desc:'通勤実費を支給します。非課税限度額は月15万円です。', why:'月15万円を超える交通費は給与として課税されます。', rates:null},
  {id:'d_health', label:'健康保険', sub:'病院代が安くなる保険',    type:'deduct',cat:'控除',default:true, canRemove:true, value:'=支給合計×4.955%',        formula:'=ROUND(支給合計*0.04955,0)',  title:'健康保険料（日当制）', desc:'支給合計に保険料率をかけた金額を天引きします。', why:'週30時間以上（または一定条件）勤務のパートは社会保険加入が必要です。', rates:[{key:'rate',label:'従業員負担率',val:0.04955,unit:'%',hint:'東京協会けんぽ2025年度: 4.955%',fmt:v=>(v*100).toFixed(3)+'%',toD:v=>(v*100).toFixed(3),frD:v=>parseFloat(v)/100}]},
  {id:'d_pension', label:'厚生年金', sub:'将来の年金のための積立',  type:'deduct',cat:'控除',default:true, canRemove:true, value:'=支給合計×9.15%（全国一律）',formula:'=ROUND(支給合計*0.0915,0)',   title:'厚生年金（日当制）', desc:'全国一律18.3%。会社と折半するため従業員負担は9.15%です。', why:'料率は法律で固定されています。', rates:[{key:'rate',label:'従業員負担率（固定）',val:0.0915,unit:'%',hint:'法定固定値 変更不可',fmt:v=>(v*100).toFixed(2)+'%',toD:v=>(v*100).toFixed(2),frD:v=>parseFloat(v)/100,ro:true}]},
  {id:'d_employ',  label:'雇用保険', sub:'失業したときの給付金',    type:'deduct',cat:'控除',default:true, canRemove:true, value:'=支給合計×0.55%',         formula:'=ROUND(支給合計*0.0055,0)',  title:'雇用保険料（日当制）', desc:'週20時間以上勤務であれば加入が必要です。', why:'2025年度の雇用保険料率（一般事業）は従業員負担0.55%です。', rates:[{key:'rate',label:'従業員負担率',val:0.0055,unit:'%',hint:'一般事業2025年度: 0.55%',fmt:v=>(v*100).toFixed(2)+'%',toD:v=>(v*100).toFixed(2),frD:v=>parseFloat(v)/100}]},
  {id:'d_income',  label:'所得税',   sub:'給与にかかる国税（年末調整あり）', type:'deduct',cat:'控除',default:true, canRemove:true, value:'=課税所得×源泉税額表', formula:'=課税所得×源泉税額表', title:'所得税の計算式（日当制）', desc:'給与から社会保険料を引いた金額と扶養人数をもとに、国税庁の源泉徴収税額表で金額が決まるよ。', why:'給与から社会保険料を引いた金額がどの範囲かを国税庁の税額表で調べて、その金額をそのまま使うんだよ。', rates:null},
];

// ----- 業種プリセット -----
window.GYOSHU_PRESETS = {
  '飲食・サービス': {icon:'🍳', on:['mid_h','midnight','lunch','perfect'],               label:['深夜時間','深夜手当','食事代控除','皆勤手当']},
  '建設・工事':     {icon:'🏗',  on:['skill','perfect','housing','uniform'],              label:['資格手当','皆勤手当','住宅手当','制服代控除']},
  '介護・医療':     {icon:'🏥',  on:['mid_h','midnight','skill','perfect','housing'],     label:['深夜時間','深夜手当','資格手当','皆勤手当','住宅手当']},
  '小売・販売':     {icon:'🏪',  on:['mid_h','midnight','perfect','uniform'],             label:['深夜時間','深夜手当','皆勤手当','制服代控除']},
  '事務・オフィス': {icon:'🏢',  on:['housing','resident'],                               label:['住宅手当','住民税']},
  '学校・教育':     {icon:'🏫',  on:['housing','resident','skill'],                       label:['住宅手当','住民税','資格手当']},
  '製造・工場':     {icon:'⚙️',  on:['mid_h','midnight','perfect','uniform','housing'],   label:['深夜時間','深夜手当','皆勤手当','制服代控除','住宅手当']},
  'その他':         {icon:'👤',  on:[],                                                   label:[]}
};
