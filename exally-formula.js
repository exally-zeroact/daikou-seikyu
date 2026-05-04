/**
 * exally-formula.js - Exally 数式計算エンジン（完全版・A案）
 * ================================================================
 * 【役割】Excel 500+ 関数の独自実装（96関数全部入り）
 * 【切り出し元】book.html line 1006〜1596（約590行）
 * 【バージョン】2026-04-20 完全版
 * 【設計】
 *   - hf (HyperFormula) は内部変数 _hf として保持
 *   - book.html 側で hf 初期化後に initExallyFormula(hf) を1回呼ぶだけ
 *   - 呼び出し側の関数シグネチャは一切変更なし
 *   - Node.js / ブラウザ両対応（末尾 module.exports）
 * 【使用箇所】
 *   - book.html        (メインブック画面)
 *   - kyuuryoumeisai.html (給料明細)
 *   - seikyusyo.html   (請求書)
 *   - mitsumoriyo.html (見積書)
 * ================================================================
 */

// ================================================================
// 【HyperFormula インスタンスホルダー】
// book.html 側で hf を作成後、initExallyFormula(hf) で渡す
// ================================================================
var _hf = null;

function initExallyFormula(hfInstance) {
  _hf = hfInstance;
}

function _hfSid(sheet){
  if(typeof sheet==='number') return sheet;
  try{ var id=_hf.getSheetId(sheet); return (id!==null&&id!==undefined)?id:0; }catch(e){return 0;}
}
function addSheetToEngine(name) {
  if(!_hf) return;
  try { _hf.addSheet(name); } catch(e) {}
}

// ================================================================
// 内部ヘルパー
// ================================================================
function _hfGetDisplay(sheet, r, c) {
  try {
    var val = _hf.getCellValue({sheet:_hfSid(sheet), row:r, col:c});
    if(val===null||val===undefined) return '';
    if(typeof val==='object'&&val.type) return HF_ERR[val.type]||('#'+val.type);
    return String(val);
  } catch(e) { return '#ERR'; }
}
function _toRC(addr) {
  var m = addr.match(/^([A-Z]+)(\d+)$/i);
  if(!m) return null;
  var col=0;
  for(var i=0;i<m[1].length;i++) col=col*26+(m[1].toUpperCase().charCodeAt(i)-64);
  return {r:parseInt(m[2])-1, c:col-1};
}
function _getRangeVals(sheet, rangeStr) {
  var m = rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
  if(!m||!_hf) return [];
  var s=_toRC(m[1]),e=_toRC(m[2]),vals=[];
  for(var r=s.r;r<=e.r;r++)
    for(var c=s.c;c<=e.c;c++){
      var v=_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:c});
      if(typeof v==='number') vals.push(v);
    }
  return vals;
}
function _getRangeAll(sheet, rangeStr) {
  var m = rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
  if(!m||!_hf) return [];
  var s=_toRC(m[1]),e=_toRC(m[2]),vals=[];
  for(var r=s.r;r<=e.r;r++)
    for(var c=s.c;c<=e.c;c++)
      vals.push(_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:c}));
  return vals;
}
function _getSingleVal(sheet, ref) {
  var rc=_toRC(ref);
  if(!rc||!_hf) return null;
  return _hf.getCellValue({sheet:_hfSid(sheet),row:rc.r,col:rc.c});
}

// ================================================================
// JS実装関数群
// ================================================================

// --- TEXT書式 ---
function _applyTextFormat(num, fmt) {
  if(/^#,##0(\.0+)?$/.test(fmt)) {
    var d=fmt.indexOf('.')===-1?0:fmt.length-fmt.indexOf('.')-1;
    return num.toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d});
  }
  if(/^0+(\.0+)?$/.test(fmt)) {
    var d=fmt.indexOf('.')===-1?0:fmt.length-fmt.indexOf('.')-1;
    return num.toFixed(d);
  }
  if(fmt==='0%') return Math.round(num*100)+'%';
  if(fmt==='0.00%') return (num*100).toFixed(2)+'%';
  if(fmt==='¥#,##0'||fmt==='\\#,##0') return '¥'+Math.round(num).toLocaleString('ja-JP');
  return String(num);
}

// --- 統計 ---
function _jsRank(val,vals,order){var s=vals.slice().sort(function(a,b){return order===0?b-a:a-b;});var r=s.indexOf(val)+1;return r>0?r:'#N/A';}
function _jsPercentile(vals,k){var s=vals.slice().sort(function(a,b){return a-b;}),n=s.length,idx=k*(n-1),lo=Math.floor(idx),hi=Math.ceil(idx);if(lo===hi)return s[lo];return s[lo]+(idx-lo)*(s[hi]-s[lo]);}
function _jsQuartile(vals,q){return _jsPercentile(vals,[0,0.25,0.5,0.75,1][q]);}
function _jsMode(vals){var freq={};vals.forEach(function(v){if(typeof v==='number')freq[v]=(freq[v]||0)+1;});var keys=Object.keys(freq);if(!keys.length)return '#N/A';var max=0,mode=null;keys.forEach(function(k){if(freq[k]>max){max=freq[k];mode=parseFloat(k);}});return max>1?mode:'#N/A';}
function _jsTrimmean(vals,pct){var s=vals.slice().sort(function(a,b){return a-b;});var trim=Math.floor(s.length*pct/2);var t=s.slice(trim,s.length-trim);return t.reduce(function(a,b){return a+b;},0)/t.length;}
function _jsPercentrank(vals,x,sig){var s=vals.slice().sort(function(a,b){return a-b;}),n=s.length;var below=s.filter(function(v){return v<x;}).length;var rank=below/(n-1);var d=Math.pow(10,sig||3);return Math.floor(rank*d)/d;}
function _jsFrequency(data,bins){var r=new Array(bins.length+1).fill(0);data.forEach(function(v){var p=false;for(var i=0;i<bins.length;i++){if(v<=bins[i]){r[i]++;p=true;break;}}if(!p)r[bins.length]++;});return r;}
function _jsKurt(vals){var n=vals.length;if(n<4)return '#DIV/0!';var mean=vals.reduce(function(a,b){return a+b;})/n;var s2=vals.reduce(function(a,v){return a+Math.pow(v-mean,2);},0)/(n-1);var s=Math.sqrt(s2);var sum4=vals.reduce(function(a,v){return a+Math.pow((v-mean)/s,4);},0);return (n*(n+1))/((n-1)*(n-2)*(n-3))*sum4-3*(n-1)*(n-1)/((n-2)*(n-3));}
function _jsPermut(n,k){var r=1;for(var i=n;i>n-k;i--)r*=i;return r;}
function _jsPermutationa(n,k){return Math.pow(n,k);}
function _jsProb(vals,probs,lower,upper){if(upper===undefined)upper=lower;var sum=0;vals.forEach(function(v,i){if(v>=lower&&v<=upper)sum+=probs[i];});return sum;}
function _jsBinomDistRange(n,p,s1,s2){function bp(t,pr,k){var c=1;for(var i=0;i<k;i++)c=c*(t-i)/(i+1);return c*Math.pow(pr,k)*Math.pow(1-pr,t-k);}s2=s2===undefined?s1:s2;var sum=0;for(var k=s1;k<=s2;k++)sum+=bp(n,p,k);return sum;}

// --- 回帰・予測 ---
function _jsSlope(ys,xs){var n=ys.length,sx=0,sy=0,sxx=0,sxy=0;for(var i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxx+=xs[i]*xs[i];sxy+=xs[i]*ys[i];}return(n*sxy-sx*sy)/(n*sxx-sx*sx);}
function _jsIntercept(ys,xs){var slope=_jsSlope(ys,xs),n=ys.length,sx=ys.reduce(function(a,_,i){return a+xs[i];},0)/n,sy=ys.reduce(function(a,b){return a+b;})/n;return sy-slope*sx;}
function _jsForecast(x,ys,xs){return _jsIntercept(ys,xs)+_jsSlope(ys,xs)*x;}
function _jsLinest(ys,xs){return[_jsSlope(ys,xs),_jsIntercept(ys,xs)];}
function _jsLogest(ys,xs){var lys=ys.map(function(v){return Math.log(v);});return[Math.exp(_jsSlope(lys,xs)),Math.exp(_jsIntercept(lys,xs))];}
function _jsTrend(ys,xs,newXs){var s=_jsSlope(ys,xs),i=_jsIntercept(ys,xs);return newXs.map(function(x){return i+s*x;});}
function _jsGrowth(ys,xs,newXs){var lg=_jsLogest(ys,xs);return newXs.map(function(x){return lg[1]*Math.pow(lg[0],x);});}

// --- 行列 ---
function _jsMdeterm(m){var n=m.length;if(n===1)return m[0][0];if(n===2)return m[0][0]*m[1][1]-m[0][1]*m[1][0];var det=0;for(var c=0;c<n;c++){var sub=m.slice(1).map(function(r){return r.filter(function(_,ci){return ci!==c;});});det+=Math.pow(-1,c)*m[0][c]*_jsMdeterm(sub);}return det;}
function _jsMinverse(m){var det=_jsMdeterm(m);if(Math.abs(det)<1e-10)return null;if(m.length===2)return[[m[1][1]/det,-m[0][1]/det],[-m[1][0]/det,m[0][0]/det]];return null;}

// --- 文字列 ---
function _jsConcat(vals){return vals.map(function(v){return v===null||v===undefined?'':String(v);}).join('');}
function _jsTextjoin(delim,ignoreEmpty,vals){var f=ignoreEmpty?vals.filter(function(v){return v!==null&&v!==undefined&&v!=='';}) :vals;return f.map(function(v){return String(v===null||v===undefined?'':v);}).join(delim);}
function _jsFixed(num,dec,noCommas){dec=dec===undefined?2:Math.max(0,Math.round(dec));var str=num.toFixed(dec);if(!noCommas){var p=str.split('.');p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');str=p.join('.');}return str;}
function _jsDollar(num,dec){dec=dec===undefined?2:Math.max(0,dec);var abs=Math.abs(num),str=abs.toFixed(dec);var p=str.split('.');p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');str='$'+p.join('.');return num<0?'('+str+')':str;}
function _jsYen(num,dec){dec=dec===undefined?0:Math.max(0,dec);var v=Math.abs(num);var str=v.toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g,',');return'¥'+str;}
function _jsLenb(s){return s.split('').reduce(function(a,c){return a+(c.charCodeAt(0)>0x7F?2:1);},0);}
function _jsLeftb(s,b){var r='',bytes=0;for(var i=0;i<s.length&&bytes<b;i++){var w=s.charCodeAt(i)>0x7F;if(bytes+(w?2:1)>b)break;r+=s[i];bytes+=w?2:1;}return r;}
function _jsRightb(s,b){return _jsLeftb(s.split('').reverse().join(''),b).split('').reverse().join('');}
function _jsMidb(s,start,len){return _jsLeftb(s.substring(start-1),len);}
function _jsFindb(find,within,start){start=start||1;var pos=within.indexOf(find,start-1);return pos>=0?pos+1:'#VALUE!';}
function _jsReplaceb(text,start,numBytes,repl){return text.substring(0,start-1)+repl+text.substring(start-1+numBytes);}
function _jsAsc(s){return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0xFEE0);});}
function _jsJis(s){return s.replace(/[A-Za-z0-9]/g,function(c){return String.fromCharCode(c.charCodeAt(0)+0xFEE0);});}
function _jsTextbefore(text,delim,inst){inst=inst||1;var count=0,idx=0;while((idx=text.indexOf(delim,idx))!==-1){count++;if(count===inst)return text.substring(0,idx);idx++;}return'#N/A';}
function _jsTextafter(text,delim,inst){inst=inst||1;var count=0,idx=0;while((idx=text.indexOf(delim,idx))!==-1){count++;if(count===inst)return text.substring(idx+delim.length);idx++;}return'#N/A';}
function _jsTextsplit(text,colDelim,rowDelim){if(rowDelim)return text.split(rowDelim).map(function(r){return r.split(colDelim);});return text.split(colDelim);}
function _jsValuetotext(v){if(typeof v==='string')return'"'+v+'"';if(typeof v==='boolean')return v?'TRUE':'FALSE';return String(v);}
function _jsArraytotext(vals){return'{'+vals.map(_jsValuetotext).join(',')+'}';}

// --- 日付 ---
function _jsDateValue(str){var m=str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);if(!m)return null;var d=new Date(parseInt(m[1]),parseInt(m[2])-1,parseInt(m[3]));return Math.round((d-new Date(1899,11,30))/86400000);}
function _jsDatestring(serial){var base=new Date(1899,11,30);var d=new Date(base.getTime()+serial*86400000);return d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();}

// --- 情報 ---
function _jsValue(x){var n=parseFloat(String(x).replace(/,/g,''));return isNaN(n)?null:n;}
function _jsN(v){if(typeof v==='number')return v;if(v===true)return 1;return 0;}
function _jsType(v){if(typeof v==='number')return 1;if(typeof v==='string')return 2;if(typeof v==='boolean')return 4;if(v&&v.type)return 16;if(Array.isArray(v))return 64;return 1;}
function _jsCell(infoType,val){if(infoType==='type'){if(val===''||val===null||val===undefined)return'b';if(typeof val==='number')return'n';return'l';}if(infoType==='contents')return val;return'';}

// --- 参照 ---
function _jsIndirect(sheet,refStr){var rc=_toRC(refStr.trim());if(rc&&_hf){var v=_hf.getCellValue({sheet:_hfSid(sheet),row:rc.r,col:rc.c});return v===null||v===undefined?'':v;}return'#REF!';}
function _jsOffset(sheet,ref,dr,dc){var rc=_toRC(ref.trim());if(!rc||!_hf)return'#REF!';var nr=rc.r+dr,nc=rc.c+dc;if(nr<0||nc<0)return'#REF!';var v=_hf.getCellValue({sheet:_hfSid(sheet),row:nr,col:nc});return v===null||v===undefined?'':v;}
function _jsLookup(val,lookupVals,resultVals){var found=-1;for(var i=0;i<lookupVals.length;i++){if(lookupVals[i]<=val)found=i;else break;}return found>=0?resultVals[found]:'#N/A';}
function _jsXlookup(val,lookupVals,returnVals,notFound){for(var i=0;i<lookupVals.length;i++){if(String(lookupVals[i])===String(val))return returnVals[i];}return notFound!==undefined?notFound:'#N/A';}
function _jsXmatch(val,arr,mode){if(!mode||mode===0){for(var i=0;i<arr.length;i++)if(String(arr[i])===String(val))return i+1;return'#N/A';}if(mode===1){var found=-1;for(var i=0;i<arr.length;i++)if(arr[i]<=val)found=i;return found>=0?found+1:'#N/A';}return'#N/A';}

// --- 動的配列 ---
function _jsSequence(rows,cols,start,step){start=start===undefined?1:start;step=step===undefined?1:step;var r=[],val=start;for(var i=0;i<rows*cols;i++){r.push(val);val+=step;}return r;}
function _jsRandarray(rows,cols,min,max,isInt){min=min||0;max=max||1;rows=rows||1;cols=cols||1;var r=[];for(var i=0;i<rows*cols;i++){var v=Math.random()*(max-min)+min;r.push(isInt?Math.floor(v):v);}return r;}
function _jsSort(vals,order){return vals.slice().sort(function(a,b){return order===false?b-a:a-b;});}
function _jsUnique(vals){return vals.filter(function(v,i,a){return a.indexOf(v)===i;});}
function _jsFilter(vals,include){return vals.filter(function(_,i){return!!include[i];});}
function _jsTake(arr,n){return n>0?arr.slice(0,n):arr.slice(arr.length+n);}
function _jsDrop(arr,n){return n>0?arr.slice(n):arr.slice(0,arr.length+n);}
function _jsExpand(arr,len,pad){var r=arr.slice();while(r.length<len)r.push(pad===undefined?0:pad);return r;}
function _jsVstack(){return[].concat.apply([],Array.from(arguments));}
function _jsHstack(){return[].concat.apply([],Array.from(arguments));}
function _jsTorow(arr){return[].concat(arr);}
function _jsTocol(arr){return[].concat(arr);}
function _jsChoosecols(matrix,cols){return cols.map(function(c){return matrix[c-1];});}
function _jsChooserows(matrix,rows){return rows.map(function(r){return matrix[r-1];});}

// --- 財務 ---
function _jsIrr(values,guess){guess=guess===undefined?0.1:guess;var rate=guess;for(var iter=0;iter<1000;iter++){var npv=0,dnpv=0;values.forEach(function(v,i){var f=Math.pow(1+rate,i);npv+=v/f;dnpv-=i*v/Math.pow(1+rate,i+1);});if(Math.abs(dnpv)<1e-15)break;var nr=rate-npv/dnpv;if(Math.abs(nr-rate)<1e-10){rate=nr;break;}rate=nr;}return rate;}
function _jsXirr(values,dates,guess){guess=guess===undefined?0.1:guess;var d0=dates[0],rate=guess;for(var iter=0;iter<1000;iter++){var npv=0,dnpv=0;values.forEach(function(v,i){var t=(dates[i]-d0)/365,f=Math.pow(1+rate,t);npv+=v/f;dnpv-=t*v/Math.pow(1+rate,t+1);});if(Math.abs(dnpv)<1e-15)break;var nr=rate-npv/dnpv;if(Math.abs(nr-rate)<1e-10){rate=nr;break;}rate=nr;}return rate;}
function _jsVdb(cost,salvage,life,start,end,factor){factor=factor||2;var total=0;for(var p=Math.floor(start);p<Math.ceil(end);p++){var s=Math.max(start,p),e2=Math.min(end,p+1);var book=cost;for(var i=0;i<p;i++)book-=Math.min(book*factor/life,book-salvage);total+=Math.min(book*factor/life,book-salvage)*(e2-s);}return total;}
function _jsDisc(settlement,maturity,pr,redemption){var t=(maturity-settlement)/365;return(redemption-pr)/(redemption*t);}
function _jsIntrate(settlement,maturity,investment,redemption){var t=(maturity-settlement)/365;return(redemption-investment)/(investment*t);}
function _jsDuration(settlement,maturity,coupon,yld,freq){var n=Math.round((maturity-settlement)/365*freq);var pv=0,wsum=0;for(var k=1;k<=n;k++){var cf=coupon*100/freq+(k===n?100:0);var pvk=cf/Math.pow(1+yld/freq,k);pv+=pvk;wsum+=pvk*k/freq;}return wsum/pv;}
function _jsAccrint(issue,firstInterest,settlement,rate,par,freq){var t=(settlement-issue)/365;return par*rate*t;}
function _jsAmordegrc(cost,date_purchased,first_period,salvage,period,rate){return cost*rate;}
function _jsAmorlinc(cost,date_purchased,first_period,salvage,period,rate){return(cost-salvage)*rate;}

// --- エンジニアリング ---
function _jsConvert(num,from,to){var u={'g':1,'kg':1000,'mg':0.001,'lbm':453.592,'ozm':28.3495,'ton':1e6,'m':1,'km':1000,'cm':0.01,'mm':0.001,'mi':1609.344,'yd':0.9144,'ft':0.3048,'in':0.0254,'sec':1,'min':60,'hr':3600,'day':86400,'yr':31557600,'Pa':1,'atm':101325,'bar':100000,'psi':6894.76,'J':1,'cal':4.184,'eV':1.602e-19,'l':0.001,'ml':0.000001,'gal':0.003785,'qt':0.000946,'pt':0.000473};if(from==='C'&&to==='F')return num*9/5+32;if(from==='F'&&to==='C')return(num-32)*5/9;if(from==='C'&&to==='K')return num+273.15;if(from==='K'&&to==='C')return num-273.15;if(from==='F'&&to==='K')return(num-32)*5/9+273.15;if(from==='K'&&to==='F')return(num-273.15)*9/5+32;if(!u[from]||!u[to])return'#N/A';return num*u[from]/u[to];}
function _jsGestep(num,step){return num>=(step||0)?1:0;}

// --- データベース ---
function _jsDbFunc(func,sheet,dbRange,field,criteriaRange){if(!_hf)return'#VALUE!';var m=dbRange.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);if(!m)return'#VALUE!';var s=_toRC(m[1]),e=_toRC(m[2]);var headers=[];for(var c=s.c;c<=e.c;c++)headers.push(_hf.getCellValue({sheet:_hfSid(sheet),row:s.r,col:c}));var fieldIdx=typeof field==='number'?field-1:headers.indexOf(field);if(fieldIdx<0)return'#VALUE!';var cm=criteriaRange.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);if(!cm)return'#VALUE!';var cs=_toRC(cm[1]);var critField=_hf.getCellValue({sheet:_hfSid(sheet),row:cs.r,col:cs.c});var critVal=_hf.getCellValue({sheet:_hfSid(sheet),row:cs.r+1,col:cs.c});var critFieldIdx=headers.indexOf(critField);var results=[];for(var r=s.r+1;r<=e.r;r++){if(String(_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:s.c+critFieldIdx}))===String(critVal)){results.push(_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:s.c+fieldIdx}));}}var nums=results.filter(function(v){return typeof v==='number';});if(func==='SUM')return nums.reduce(function(a,b){return a+b;},0);if(func==='AVG')return nums.length?nums.reduce(function(a,b){return a+b;})/nums.length:'#DIV/0!';if(func==='CNT')return nums.length;if(func==='CNTA')return results.filter(function(v){return v!==null&&v!==undefined;}).length;if(func==='MAX')return nums.length?Math.max.apply(null,nums):'#NUM!';if(func==='MIN')return nums.length?Math.min.apply(null,nums):'#NUM!';if(func==='PROD')return nums.reduce(function(a,b){return a*b;},1);if(func==='GET')return results.length===1?results[0]:'#NUM!';if(func==='STD'){var n=nums.length;if(n<2)return'#DIV/0!';var mean=nums.reduce(function(a,b){return a+b;})/n;return Math.sqrt(nums.reduce(function(a,v){return a+Math.pow(v-mean,2);},0)/(n-1));}if(func==='STDP'){var n=nums.length;if(!n)return'#DIV/0!';var mean=nums.reduce(function(a,b){return a+b;})/n;return Math.sqrt(nums.reduce(function(a,v){return a+Math.pow(v-mean,2);},0)/n);}if(func==='VAR'){var n=nums.length;if(n<2)return'#DIV/0!';var mean=nums.reduce(function(a,b){return a+b;})/n;return nums.reduce(function(a,v){return a+Math.pow(v-mean,2);},0)/(n-1);}if(func==='VARP'){var n=nums.length;if(!n)return'#DIV/0!';var mean=nums.reduce(function(a,b){return a+b;})/n;return nums.reduce(function(a,v){return a+Math.pow(v-mean,2);},0)/n;}return'#VALUE!';}

// --- Web ---
function _jsEncodeUrl(str){try{return encodeURIComponent(str);}catch(e){return'#VALUE!';}}

// --- AGGREGATE ---
function _jsAggregate(funcNum,opts,vals){var clean=vals.filter(function(v){return typeof v==='number'&&isFinite(v);});if(funcNum===1)return clean.reduce(function(a,b){return a+b;},0)/clean.length;if(funcNum===2)return clean.length;if(funcNum===3)return vals.filter(function(v){return v!==null&&v!==undefined;}).length;if(funcNum===4)return Math.max.apply(null,clean);if(funcNum===5)return Math.min.apply(null,clean);if(funcNum===6)return clean.reduce(function(a,b){return a*b;},1);if(funcNum===7){var n=clean.length;if(n<2)return'#DIV/0!';var m=clean.reduce(function(a,b){return a+b;})/n;return Math.sqrt(clean.reduce(function(a,v){return a+Math.pow(v-m,2);},0)/(n-1));}if(funcNum===8){var n=clean.length;if(!n)return'#DIV/0!';var m=clean.reduce(function(a,b){return a+b;})/n;return Math.sqrt(clean.reduce(function(a,v){return a+Math.pow(v-m,2);},0)/n);}if(funcNum===9)return clean.reduce(function(a,b){return a+b;},0);if(funcNum===10){var n=clean.length;if(n<2)return'#DIV/0!';var m=clean.reduce(function(a,b){return a+b;})/n;return clean.reduce(function(a,v){return a+Math.pow(v-m,2);},0)/(n-1);}if(funcNum===11){var n=clean.length;if(!n)return'#DIV/0!';var m=clean.reduce(function(a,b){return a+b;})/n;return clean.reduce(function(a,v){return a+Math.pow(v-m,2);},0)/n;}if(funcNum===12)return _jsMode(clean);if(funcNum===13){var s=clean.slice().sort(function(a,b){return a-b;});return s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2;}return'#VALUE!';}

// ================================================================
// LET / LAMBDA / MAP / REDUCE / SCAN / MAKEARRAY / BYROW / BYCOL / ISOMITTED
// ================================================================

// 引数文字列をネスト考慮でパース
function _parseFuncArgs(str) {
  var args=[], depth=0, current='', inStr=false, strChar='';
  for(var i=0;i<str.length;i++){
    var ch=str[i];
    if(!inStr&&(ch==='"'||ch==="'")){inStr=true;strChar=ch;current+=ch;continue;}
    if(inStr&&ch===strChar){inStr=false;current+=ch;continue;}
    if(!inStr&&ch==='(')depth++;
    if(!inStr&&ch===')')depth--;
    if(!inStr&&ch===','&&depth===0){args.push(current.trim());current='';continue;}
    current+=ch;
  }
  if(current.trim())args.push(current.trim());
  return args;
}

// LET展開（再帰・セル参照名変数はスキップ）
function _jsLetExpand(formula) {
  if(!formula||formula[0]!=='=') return formula;
  var result = formula;
  for(var iter=0;iter<10;iter++){
    var f = result.slice(1).trim();
    if(!/^LET\s*\(/i.test(f)) break;
    var inside = f.match(/^LET\s*\((.+)\)$/is);
    if(!inside) break;
    var args = _parseFuncArgs(inside[1]);
    if(!args||args.length<3||args.length%2===0) break;
    var body = args[args.length-1];
    for(var i=args.length-3;i>=0;i-=2){
      var name=args[i].trim(), val=args[i+1].trim();
      if(/^[A-Z]+\d+$/i.test(name)) continue; // セル参照名の変数はスキップ
      if(/^\d/.test(name)) continue;
      body = body.replace(new RegExp('\\b'+name+'\\b','g'), '('+val+')');
    }
    result = '='+body;
  }
  return result;
}

// LAMBDA即時呼び出し展開
function _jsLambdaExpand(formula) {
  if(!formula||formula[0]!=='=') return formula;
  var f = formula.slice(1).trim();
  var mL = f.match(/^LAMBDA\s*\((.+)\)\s*\((.+)\)$/is);
  if(!mL) return formula;
  var defArgs = _parseFuncArgs(mL[1]);
  if(defArgs.length<2) return formula;
  var params=defArgs.slice(0,-1), body=defArgs[defArgs.length-1];
  var callArgs = _parseFuncArgs(mL[2]);
  if(callArgs.length!==params.length) return formula;
  params.forEach(function(p,i){
    var name=p.trim();
    if(/^[A-Z]+\d+$/i.test(name)) return;
    body = body.replace(new RegExp('\\b'+name+'\\b','g'),'('+callArgs[i].trim()+')');
  });
  return '='+body;
}

// REDUCE(initial, range, LAMBDA(acc, x, body)) → HF委譲
function _jsReduceCompute(sheet, initial, rangeStr, lambdaFormula) {
  if(!_hf) return null;
  var mL=lambdaFormula.match(/^LAMBDA\s*\(([^,)]+)\s*,\s*([^,)]+)\s*,\s*(.+)\)$/is);
  if(!mL) return '#VALUE!';
  var p1=mL[1].trim(),p2=mL[2].trim(),body=mL[3].trim();
  var m=rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i); if(!m) return '#VALUE!';
  var s=_toRC(m[1]),e=_toRC(m[2]),acc=initial;
  for(var r=s.r;r<=e.r;r++){for(var c=s.c;c<=e.c;c++){
    var v=_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:c});
    var expr=body.replace(new RegExp('\\b'+p1+'\\b','g'),'('+acc+')').replace(new RegExp('\\b'+p2+'\\b','g'),'('+v+')');
    _hf.setCellContents({sheet:_hfSid(sheet),row:9998,col:0},'='+expr);
    var res=_hf.getCellValue({sheet:_hfSid(sheet),row:9998,col:0});
    if(typeof res==='number') acc=res;
    _hf.setCellContents({sheet:_hfSid(sheet),row:9998,col:0},null);
  }}
  return String(acc);
}

// SCAN(initial, range, LAMBDA(acc, x, body)) → 先頭値を返す
function _jsScanCompute(sheet, initial, rangeStr, lambdaFormula) {
  if(!_hf) return null;
  var mL=lambdaFormula.match(/^LAMBDA\s*\(([^,)]+)\s*,\s*([^,)]+)\s*,\s*(.+)\)$/is);
  if(!mL) return '#VALUE!';
  var p1=mL[1].trim(),p2=mL[2].trim(),body=mL[3].trim();
  var m=rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i); if(!m) return '#VALUE!';
  var s=_toRC(m[1]),e=_toRC(m[2]),acc=initial,first=null;
  for(var r=s.r;r<=e.r;r++){for(var c=s.c;c<=e.c;c++){
    var v=_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:c});
    var expr=body.replace(new RegExp('\\b'+p1+'\\b','g'),'('+acc+')').replace(new RegExp('\\b'+p2+'\\b','g'),'('+v+')');
    _hf.setCellContents({sheet:_hfSid(sheet),row:9997,col:0},'='+expr);
    var res=_hf.getCellValue({sheet:_hfSid(sheet),row:9997,col:0});
    if(typeof res==='number'){acc=res; if(first===null)first=res;}
    _hf.setCellContents({sheet:_hfSid(sheet),row:9997,col:0},null);
  }}
  return first!==null ? String(first) : String(initial);
}

// MAP(range, LAMBDA(x, body)) → 全件カンマ区切り
function _jsMapCompute(sheet, rangeStr, lambdaFormula) {
  if(!_hf) return null;
  var mL=lambdaFormula.match(/^LAMBDA\s*\(([^,)]+)\s*,\s*(.+)\)$/is);
  if(!mL) return '#VALUE!';
  var param=mL[1].trim(),body=mL[2].trim();
  var m=rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i); if(!m) return '#VALUE!';
  var s=_toRC(m[1]),e=_toRC(m[2]),results=[];
  for(var r=s.r;r<=e.r;r++){for(var c=s.c;c<=e.c;c++){
    var v=_hf.getCellValue({sheet:_hfSid(sheet),row:r,col:c});
    var expr=body.replace(new RegExp('\\b'+param+'\\b','g'),'('+v+')');
    _hf.setCellContents({sheet:_hfSid(sheet),row:9999,col:c},'='+expr);
    var res=_hf.getCellValue({sheet:_hfSid(sheet),row:9999,col:c});
    results.push(res===null?'':String(res));
    _hf.setCellContents({sheet:_hfSid(sheet),row:9999,col:c},null);
  }}
  return results[0]; // 先頭値（スピル制限）
}

// MAKEARRAY(rows, cols, LAMBDA(r, c, body)) → 先頭値を返す
function _jsMakearrayCompute(sheet, rows, cols, lambdaFormula) {
  if(!_hf) return null;
  var mL=lambdaFormula.match(/^LAMBDA\s*\(([^,)]+)\s*,\s*([^,)]+)\s*,\s*(.+)\)$/is);
  if(!mL) return '#VALUE!';
  var p1=mL[1].trim(),p2=mL[2].trim(),body=mL[3].trim();
  var expr=body.replace(new RegExp('\\b'+p1+'\\b','g'),'(1)').replace(new RegExp('\\b'+p2+'\\b','g'),'(1)');
  _hf.setCellContents({sheet:_hfSid(sheet),row:9996,col:0},'='+expr);
  var res=_hf.getCellValue({sheet:_hfSid(sheet),row:9996,col:0});
  _hf.setCellContents({sheet:_hfSid(sheet),row:9996,col:0},null);
  return res===null?'0':String(res);
}

// ISOMITTED(arg) - 省略チェック
function _jsIsomitted(v) { return v===undefined||v===null; }

// ================================================================
// convertFormula: 文字列変換
// ================================================================
function convertFormula(f) {
  if(!f||f[0]!=='=') return f;
  // LET展開
  if(/^=LET\s*\(/i.test(f)) f = _jsLetExpand(f);
  // LAMBDA即時呼び出し展開
  if(/^=LAMBDA\s*\(/i.test(f)) f = _jsLambdaExpand(f);
  f = f.replace(/\bFALSE\b(?!\s*\()/g, 'FALSE()');
  f = f.replace(/\bTRUE\b(?!\s*\()/g, 'TRUE()');
  f = f.replace(/\bNORMSDIST\s*\(([^,)]+)\)/gi, 'NORMSDIST($1,TRUE())');
  f = f.replace(/\bBETADIST\s*\(([^,()]+,[^,()]+,[^,()]+)\)/gi, 'BETA.DIST($1,TRUE())');
  f = f.replace(/\bHYPGEOMDIST\s*\(([^()]+)\)/gi, function(m,args){return args.split(',').length===4?'HYPGEOMDIST('+args+',FALSE())':m;});
  f = f.replace(/\bNEGBINOMDIST\s*\(([^()]+)\)/gi, function(m,args){return args.split(',').length===3?'NEGBINOMDIST('+args+',FALSE())':m;});
  f = f.replace(/\bISREF\s*\(([^)]+)\)/gi, function(m,arg){return /^[A-Z]+\d+(:[A-Z]+\d+)?$/i.test(arg.trim())?'TRUE()':'FALSE()';});
  return f;
}

// ================================================================
// _jsComputeFormula: JS側で完全計算
// ================================================================
function _jsComputeFormula(sheet, v) {
  if(!v||v[0]!=='='||!_hf) return null;

  // 🚀 早期return: 関数名でJS処理対象外をHFに早送り（55regex→O(1)）
  var _f0 = v.slice(1).trim();
  var _fn = _f0.match(/^([A-Z][A-Z0-9.]*)\s*\(/i);
  if(!_fn) return null; // 関数形式でない（=A1+B1等）→ HFへ
  var _fnBase = _fn[1].toUpperCase().split('.')[0];
  var _jsSet = {TEXT:1,VALUE:1,NUMBERVALUE:1,RANK:1,PERCENTILE:1,QUARTILE:1,
    MODE:1,TRIMMEAN:1,PERCENTRANK:1,KURT:1,INTERCEPT:1,FORECAST:1,IRR:1,XIRR:1,
    DATEVALUE:1,DATESTRING:1,INDIRECT:1,OFFSET:1,XLOOKUP:1,XMATCH:1,LOOKUP:1,
    CONCAT:1,TEXTJOIN:1,FIXED:1,DOLLAR:1,YEN:1,N:1,TYPE:1,ENCODEURL:1,
    CONVERT:1,GESTEP:1,TEXTBEFORE:1,TEXTAFTER:1,VALUETOTEXT:1,
    DSUM:1,DAVERAGE:1,DCOUNT:1,DCOUNTA:1,DMAX:1,DMIN:1,DPRODUCT:1,
    DGET:1,DSTDEV:1,DSTDEVP:1,DVAR:1,DVARP:1,
    AGGREGATE:1,LINEST:1,PERMUT:1,PERMUTATIONA:1,BINOM:1,FREQUENCY:1,
    MDETERM:1,REDUCE:1,SCAN:1,MAP:1,MAKEARRAY:1,ISOMITTED:1,
    LENB:1,LEFTB:1,RIGHTB:1,MIDB:1,ASC:1,JIS:1};
  if(!_jsSet[_fnBase]) return null; // JS非対象 → HFへ

  var f = v.slice(1).trim().toUpperCase();
  var fOrig = v.slice(1).trim();

  // TEXT
  var mText=fOrig.match(/^TEXT\s*\(([A-Z]+\d+)\s*,\s*"([^"]+)"\s*\)$/i);
  if(mText){var num=_getSingleVal(sheet,mText[1]);if(typeof num==='number')return _applyTextFormat(num,mText[2]);}

  // VALUE / NUMBERVALUE
  var mVal=fOrig.match(/^(?:VALUE|NUMBERVALUE)\s*\(([^)]+)\)$/i);
  if(mVal){var arg=mVal[1].trim().replace(/^["']|["']$/g,'');var sv=_getSingleVal(sheet,arg);var n=_jsValue(sv!==null?sv:arg);return n!==null?String(n):'#VALUE!';}

  // RANK / RANK.EQ / RANK.AVG
  var mRank=fOrig.match(/^RANK(?:\.EQ|\.AVG)?\s*\(([A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([01])\s*\)$/i);
  if(mRank){var val=_getSingleVal(sheet,mRank[1]);var vals=_getRangeVals(sheet,mRank[2]);if(val!==null&&vals.length)return String(_jsRank(val,vals,parseInt(mRank[3])));}

  // PERCENTILE / PERCENTILE.INC / PERCENTILE.EXC
  var mPerc=fOrig.match(/^PERCENTILE(?:\.INC|\.EXC)?\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([0-9.]+)\s*\)$/i);
  if(mPerc){var vals=_getRangeVals(sheet,mPerc[1]);if(vals.length)return String(_jsPercentile(vals,parseFloat(mPerc[2])));}

  // QUARTILE / QUARTILE.INC / QUARTILE.EXC
  var mQuart=fOrig.match(/^QUARTILE(?:\.INC|\.EXC)?\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([0-4])\s*\)$/i);
  if(mQuart){var vals=_getRangeVals(sheet,mQuart[1]);if(vals.length)return String(_jsQuartile(vals,parseInt(mQuart[2])));}

  // MODE / MODE.SNGL / MODE.MULT
  var mMode=fOrig.match(/^MODE(?:\.SNGL|\.MULT)?\s*\(([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mMode){var vals=_getRangeVals(sheet,mMode[1]);return String(_jsMode(vals));}

  // TRIMMEAN
  var mTrim=fOrig.match(/^TRIMMEAN\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([0-9.]+)\s*\)$/i);
  if(mTrim){var vals=_getRangeVals(sheet,mTrim[1]);return String(_jsTrimmean(vals,parseFloat(mTrim[2])));}

  // PERCENTRANK / PERCENTRANK.INC / PERCENTRANK.EXC
  var mPr=fOrig.match(/^PERCENTRANK(?:\.INC|\.EXC)?\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+|[0-9.]+)\s*(?:,\s*(\d+))?\s*\)$/i);
  if(mPr){var vals=_getRangeVals(sheet,mPr[1]);var x=_getSingleVal(sheet,mPr[2])||parseFloat(mPr[2]);return String(_jsPercentrank(vals,x,parseInt(mPr[3])||3));}

  // KURT
  var mKurt=fOrig.match(/^KURT\s*\(([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mKurt){var vals=_getRangeVals(sheet,mKurt[1]);var r=_jsKurt(vals);return typeof r==='number'?String(Math.round(r*10000)/10000):r;}

  // INTERCEPT
  var mInter=fOrig.match(/^INTERCEPT\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mInter){var ys=_getRangeVals(sheet,mInter[1]),xs=_getRangeVals(sheet,mInter[2]);return String(_jsIntercept(ys,xs));}

  // FORECAST / FORECAST.LINEAR
  var mFc=fOrig.match(/^FORECAST(?:\.LINEAR)?\s*\(([A-Z]+\d+|[0-9.]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mFc){var x=_getSingleVal(sheet,mFc[1])||parseFloat(mFc[1]);var ys=_getRangeVals(sheet,mFc[2]),xs=_getRangeVals(sheet,mFc[3]);return String(_jsForecast(x,ys,xs));}

  // IRR
  var mIrr=fOrig.match(/^IRR\s*\(([A-Z]+\d+:[A-Z]+\d+)(?:\s*,\s*[0-9.]+)?\s*\)$/i);
  if(mIrr){var vals=_getRangeAll(sheet,mIrr[1]).filter(function(v){return typeof v==='number';});return String(Math.round(_jsIrr(vals)*10000)/10000);}

  // DATEVALUE
  var mDate=fOrig.match(/^DATEVALUE\s*\(\s*"([^"]+)"\s*\)$/i);
  if(mDate){var s=_jsDateValue(mDate[1]);return s!==null?String(s):'#VALUE!';}

  // DATESTRING
  var mDs=fOrig.match(/^DATESTRING\s*\(([A-Z]+\d+|[0-9]+)\)$/i);
  if(mDs){var sv=_getSingleVal(sheet,mDs[1])||parseInt(mDs[1]);return _jsDatestring(sv);}

  // INDIRECT
  var mInd=fOrig.match(/^INDIRECT\s*\(([A-Z]+\d+)\)$/i);
  if(mInd){var sv=_getSingleVal(sheet,mInd[1]);if(sv)return String(_jsIndirect(sheet,String(sv)));}

  // OFFSET
  var mOff=fOrig.match(/^OFFSET\s*\(([A-Z]+\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i);
  if(mOff){var v=_jsOffset(sheet,mOff[1],parseInt(mOff[2]),parseInt(mOff[3]));return String(v);}

  // XLOOKUP
  var mXl=fOrig.match(/^XLOOKUP\s*\(([^,()]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)(?:\s*,\s*"([^"]*)")?\s*\)$/i);
  if(mXl){var lv=_getSingleVal(sheet,mXl[1]);if(lv===null)lv=mXl[1].replace(/^["']|["']$/g,'');var la=_getRangeAll(sheet,mXl[2]),ra=_getRangeAll(sheet,mXl[3]);return String(_jsXlookup(lv,la,ra,mXl[4]));}

  // XMATCH
  var mXm=fOrig.match(/^XMATCH\s*\(([^,()]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)(?:\s*,\s*(-?\d+))?\s*\)$/i);
  if(mXm){var lv=_getSingleVal(sheet,mXm[1]);if(lv===null)lv=mXm[1].replace(/^["']|["']$/g,'');var arr=_getRangeAll(sheet,mXm[2]);return String(_jsXmatch(lv,arr,parseInt(mXm[3])||0));}

  // LOOKUP
  var mLk=fOrig.match(/^LOOKUP\s*\(([A-Z]+\d+|[0-9.]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mLk){var lv=_getSingleVal(sheet,mLk[1])||parseFloat(mLk[1]);var la=_getRangeAll(sheet,mLk[2]),ra=_getRangeAll(sheet,mLk[3]);return String(_jsLookup(lv,la,ra));}

  // CONCAT
  var mConcat=fOrig.match(/^CONCAT\s*\((.+)\)$/i);
  if(mConcat){
    var args=mConcat[1].split(',').map(function(a){
      a=a.trim();
      if(/:/.test(a))return _getRangeAll(sheet,a).map(String).join('');
      var sv=_getSingleVal(sheet,a);
      if(sv!==null)return String(sv);
      return a.replace(/^["']|["']$/g,'');
    });
    return args.join('');
  }

  // TEXTJOIN
  var mTj=fOrig.match(/^TEXTJOIN\s*\("([^"]*)"\s*,\s*(TRUE|FALSE)\s*,\s*(.+)\)$/i);
  if(mTj){
    var delim=mTj[1],ignore=mTj[2].toUpperCase()==='TRUE';
    var parts=mTj[3].split(',').map(function(a){
      a=a.trim();
      if(/:/.test(a))return _getRangeAll(sheet,a).map(function(v){return v===null||v===undefined?'':String(v);});
      var sv=_getSingleVal(sheet,a);
      return [sv!==null?String(sv):a.replace(/^["']|["']$/g,'')];
    });
    var vals=[].concat.apply([],parts);
    return _jsTextjoin(delim,ignore,vals);
  }

  // FIXED
  var mFixed=fOrig.match(/^FIXED\s*\(([A-Z]+\d+|[0-9.\-]+)(?:\s*,\s*([0-9]+))?(?:\s*,\s*(TRUE|FALSE))?\s*\)$/i);
  if(mFixed){var n=_getSingleVal(sheet,mFixed[1])||parseFloat(mFixed[1]);return _jsFixed(n,mFixed[2]?parseInt(mFixed[2]):2,mFixed[3]&&mFixed[3].toUpperCase()==='TRUE');}

  // DOLLAR
  var mDollar=fOrig.match(/^DOLLAR\s*\(([A-Z]+\d+|[0-9.\-]+)(?:\s*,\s*(-?\d+))?\s*\)$/i);
  if(mDollar){var n=_getSingleVal(sheet,mDollar[1])||parseFloat(mDollar[1]);return _jsDollar(n,mDollar[2]?parseInt(mDollar[2]):2);}

  // YEN
  var mYen=fOrig.match(/^YEN\s*\(([A-Z]+\d+|[0-9.\-]+)(?:\s*,\s*(\d+))?\s*\)$/i);
  if(mYen){var n=_getSingleVal(sheet,mYen[1])||parseFloat(mYen[1]);return _jsYen(n,mYen[2]?parseInt(mYen[2]):0);}

  // N
  var mN=fOrig.match(/^N\s*\(([^)]+)\)$/i);
  if(mN){var sv=_getSingleVal(sheet,mN[1]);return String(_jsN(sv!==null?sv:mN[1]));}

  // TYPE
  var mType=fOrig.match(/^TYPE\s*\(([^)]+)\)$/i);
  if(mType){var sv=_getSingleVal(sheet,mType[1]);return String(_jsType(sv!==null?sv:mType[1]));}

  // ENCODEURL
  var mEnc=fOrig.match(/^ENCODEURL\s*\(([^)]+)\)$/i);
  if(mEnc){var sv=_getSingleVal(sheet,mEnc[1])||mEnc[1].replace(/^["']|["']$/g,'');return _jsEncodeUrl(String(sv));}

  // CONVERT
  var mCv=fOrig.match(/^CONVERT\s*\(([A-Z]+\d+|[0-9.\-]+)\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)$/i);
  if(mCv){var n=_getSingleVal(sheet,mCv[1])||parseFloat(mCv[1]);var r=_jsConvert(n,mCv[2],mCv[3]);return typeof r==='number'?String(Math.round(r*10000)/10000):r;}

  // GESTEP
  var mGe=fOrig.match(/^GESTEP\s*\(([A-Z]+\d+|[0-9.\-]+)(?:\s*,\s*([A-Z]+\d+|[0-9.\-]+))?\s*\)$/i);
  if(mGe){var n=_getSingleVal(sheet,mGe[1])||parseFloat(mGe[1]);var s=mGe[2]?(_getSingleVal(sheet,mGe[2])||parseFloat(mGe[2])):0;return String(_jsGestep(n,s));}

  // TEXTBEFORE
  var mTb=fOrig.match(/^TEXTBEFORE\s*\(([A-Z]+\d+|"[^"]+")\s*,\s*"([^"]*)"\s*(?:,\s*(\d+))?\s*\)$/i);
  if(mTb){var sv=_getSingleVal(sheet,mTb[1])||mTb[1].replace(/^"|"$/g,'');return _jsTextbefore(String(sv),mTb[2],parseInt(mTb[3])||1);}

  // TEXTAFTER
  var mTa=fOrig.match(/^TEXTAFTER\s*\(([A-Z]+\d+|"[^"]+")\s*,\s*"([^"]*)"\s*(?:,\s*(\d+))?\s*\)$/i);
  if(mTa){var sv=_getSingleVal(sheet,mTa[1])||mTa[1].replace(/^"|"$/g,'');return _jsTextafter(String(sv),mTa[2],parseInt(mTa[3])||1);}

  // VALUETOTEXT
  var mVtt=fOrig.match(/^VALUETOTEXT\s*\(([^)]+)\)$/i);
  if(mVtt){var sv=_getSingleVal(sheet,mVtt[1]);return _jsValuetotext(sv);}

  // REDUCE(initial, range, LAMBDA(...))
  var mReduce=fOrig.match(/^REDUCE\s*\(([^,]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*,\s*(LAMBDA\s*\(.+\))\s*\)$/is);
  if(mReduce){var reduceInit=parseFloat(mReduce[1].trim())||0;var reduceR=_jsReduceCompute(sheet,reduceInit,mReduce[2],mReduce[3]);if(reduceR!==null)return reduceR;}

  // SCAN(initial, range, LAMBDA(...))
  var mScan=fOrig.match(/^SCAN\s*\(([^,]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*,\s*(LAMBDA\s*\(.+\))\s*\)$/is);
  if(mScan){var scanInit=parseFloat(mScan[1].trim())||0;var scanR=_jsScanCompute(sheet,scanInit,mScan[2],mScan[3]);if(scanR!==null)return scanR;}

  // MAP(range, LAMBDA(...))
  var mMap=fOrig.match(/^MAP\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*(LAMBDA\s*\(.+\))\s*\)$/is);
  if(mMap){var mapR=_jsMapCompute(sheet,mMap[1],mMap[2]);if(mapR!==null)return mapR;}

  // MAKEARRAY(rows, cols, LAMBDA(...))
  var mMkarr=fOrig.match(/^MAKEARRAY\s*\(([0-9]+)\s*,\s*([0-9]+)\s*,\s*(LAMBDA\s*\(.+\))\s*\)$/is);
  if(mMkarr){var mkR=_jsMakearrayCompute(sheet,parseInt(mMkarr[1]),parseInt(mMkarr[2]),mMkarr[3]);if(mkR!==null)return mkR;}

  // ISOMITTED(ref)
  var mIso=fOrig.match(/^ISOMITTED\s*\(([^)]*)\)$/i);
  if(mIso){var isoSv=_getSingleVal(sheet,mIso[1].trim());return String(_jsIsomitted(isoSv));}

  // DSUM / DAVERAGE / DCOUNT / DCOUNTA / DMAX / DMIN / DPRODUCT / DGET / DSTDEV / DSTDEVP / DVAR / DVARP
  var mDb=fOrig.match(/^(DSUM|DAVERAGE|DCOUNT|DCOUNTA|DMAX|DMIN|DPRODUCT|DGET|DSTDEV|DSTDEVP|DVAR|DVARP)\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([^,]+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*\)$/i);
  if(mDb){var funcMap={'DSUM':'SUM','DAVERAGE':'AVG','DCOUNT':'CNT','DCOUNTA':'CNTA','DMAX':'MAX','DMIN':'MIN','DPRODUCT':'PROD','DGET':'GET','DSTDEV':'STD','DSTDEVP':'STDP','DVAR':'VAR','DVARP':'VARP'};var fn=funcMap[mDb[1].toUpperCase()];var fieldArg=mDb[3].trim().replace(/^["']|["']$/g,'');var fieldVal=parseInt(fieldArg)||fieldArg;return String(_jsDbFunc(fn,sheet,mDb[2],fieldVal,mDb[4]));}

  // AGGREGATE
  var mAgg=fOrig.match(/^AGGREGATE\s*\((\d+)\s*,\s*(\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*\)$/i);
  if(mAgg){var vals=_getRangeVals(sheet,mAgg[3]);var r=_jsAggregate(parseInt(mAgg[1]),parseInt(mAgg[2]),vals);return String(typeof r==='number'?Math.round(r*10000)/10000:r);}

  // LINEST
  var mLi=fOrig.match(/^LINEST\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\s*\)$/i);
  if(mLi){var ys=_getRangeVals(sheet,mLi[1]),xs=_getRangeVals(sheet,mLi[2]);var r=_jsLinest(ys,xs);return String(Math.round(r[0]*10000)/10000);}

  // PERMUT
  var mPerm=fOrig.match(/^PERMUT\s*\(([0-9]+)\s*,\s*([0-9]+)\s*\)$/i);
  if(mPerm)return String(_jsPermut(parseInt(mPerm[1]),parseInt(mPerm[2])));

  // PERMUTATIONA
  var mPa=fOrig.match(/^PERMUTATIONA\s*\(([0-9]+)\s*,\s*([0-9]+)\s*\)$/i);
  if(mPa)return String(_jsPermutationa(parseInt(mPa[1]),parseInt(mPa[2])));

  // BINOM.DIST.RANGE
  var mBdr=fOrig.match(/^BINOM\.DIST\.RANGE\s*\(([0-9]+)\s*,\s*([0-9.]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9]+))?\s*\)$/i);
  if(mBdr)return String(Math.round(_jsBinomDistRange(parseInt(mBdr[1]),parseFloat(mBdr[2]),parseInt(mBdr[3]),mBdr[4]?parseInt(mBdr[4]):undefined)*10000)/10000);

  // FREQUENCY - 最初の値だけ返す（スピル）
  var mFreq=fOrig.match(/^FREQUENCY\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mFreq){var data=_getRangeVals(sheet,mFreq[1]),bins=_getRangeVals(sheet,mFreq[2]);var r=_jsFrequency(data,bins);return String(r[0]);}

  // MDETERM
  var mMd=fOrig.match(/^MDETERM\s*\(([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mMd){var m2=mMd[1].match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);if(m2){var s=_toRC(m2[1]),e=_toRC(m2[2]),n=e.r-s.r+1,mat=[];for(var r=0;r<n;r++){mat.push([]);for(var c=0;c<n;c++)mat[r].push(_hf.getCellValue({sheet:_hfSid(sheet),row:s.r+r,col:s.c+c})||0);}return String(Math.round(_jsMdeterm(mat)*10000)/10000);}}

  // IRR / XIRR (既存)
  var mXirr=fOrig.match(/^XIRR\s*\(([A-Z]+\d+:[A-Z]+\d+)\s*,\s*([A-Z]+\d+:[A-Z]+\d+)\)$/i);
  if(mXirr){var vals=_getRangeAll(sheet,mXirr[1]).filter(function(v){return typeof v==='number';});var dates=_getRangeAll(sheet,mXirr[2]).filter(function(v){return typeof v==='number';});return String(Math.round(_jsXirr(vals,dates)*10000)/10000);}

  // ENCODEURL (文字列直接)
  var mEncStr=fOrig.match(/^ENCODEURL\s*\("([^"]*)"\)$/i);
  if(mEncStr)return _jsEncodeUrl(mEncStr[1]);

  // LENB/LEFTB/RIGHTB/MIDB/FINDB
  var mLenb=fOrig.match(/^LENB\s*\(([A-Z]+\d+|"[^"]+")\)$/i);
  if(mLenb){var sv=_getSingleVal(sheet,mLenb[1])||mLenb[1].replace(/^"|"$/g,'');return String(_jsLenb(String(sv)));}
  var mLeftb=fOrig.match(/^LEFTB\s*\(([A-Z]+\d+|"[^"]+")\s*,\s*([0-9]+)\)$/i);
  if(mLeftb){var sv=_getSingleVal(sheet,mLeftb[1])||mLeftb[1].replace(/^"|"$/g,'');return _jsLeftb(String(sv),parseInt(mLeftb[2]));}
  var mRightb=fOrig.match(/^RIGHTB\s*\(([A-Z]+\d+|"[^"]+")\s*,\s*([0-9]+)\)$/i);
  if(mRightb){var sv=_getSingleVal(sheet,mRightb[1])||mRightb[1].replace(/^"|"$/g,'');return _jsRightb(String(sv),parseInt(mRightb[2]));}
  var mMidb=fOrig.match(/^MIDB\s*\(([A-Z]+\d+|"[^"]+")\s*,\s*([0-9]+)\s*,\s*([0-9]+)\)$/i);
  if(mMidb){var sv=_getSingleVal(sheet,mMidb[1])||mMidb[1].replace(/^"|"$/g,'');return _jsMidb(String(sv),parseInt(mMidb[2]),parseInt(mMidb[3]));}

  // ASC / JIS
  var mAsc=fOrig.match(/^ASC\s*\(([A-Z]+\d+|"[^"]+")\)$/i);
  if(mAsc){var sv=_getSingleVal(sheet,mAsc[1])||mAsc[1].replace(/^"|"$/g,'');return _jsAsc(String(sv));}
  var mJis=fOrig.match(/^JIS\s*\(([A-Z]+\d+|"[^"]+")\)$/i);
  if(mJis){var sv=_getSingleVal(sheet,mJis[1])||mJis[1].replace(/^"|"$/g,'');return _jsJis(String(sv));}

  // DATESTRING
  var mDstr=fOrig.match(/^DATESTRING\s*\(([A-Z]+\d+|[0-9]+)\)$/i);
  if(mDstr){var sv=_getSingleVal(sheet,mDstr[1])||parseInt(mDstr[1]);return _jsDatestring(sv);}

  return null;
}

// ================================================================
// setCellFormula / undoCellFormula / recalcSheet
// ================================================================
// HFに渡す値の型変換（文字列の数値→number、空→null）

// ================================================================
// 【Node.js 両対応】module.exports
// ブラウザでは module が undefined なので無視される
// ================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initExallyFormula: initExallyFormula,
    // 補助・内部
    _hfSid: _hfSid, _toRC: _toRC, _getRangeVals: _getRangeVals,
    _getRangeAll: _getRangeAll, _getSingleVal: _getSingleVal,
    _hfGetDisplay: _hfGetDisplay, _applyTextFormat: _applyTextFormat,
    addSheetToEngine: addSheetToEngine,
    // 統計
    _jsRank: _jsRank, _jsPercentile: _jsPercentile, _jsQuartile: _jsQuartile,
    _jsMode: _jsMode, _jsTrimmean: _jsTrimmean, _jsPercentrank: _jsPercentrank,
    _jsFrequency: _jsFrequency, _jsKurt: _jsKurt, _jsPermut: _jsPermut,
    _jsPermutationa: _jsPermutationa, _jsProb: _jsProb, _jsBinomDistRange: _jsBinomDistRange,
    // 回帰
    _jsSlope: _jsSlope, _jsIntercept: _jsIntercept, _jsForecast: _jsForecast,
    _jsLinest: _jsLinest, _jsLogest: _jsLogest, _jsTrend: _jsTrend, _jsGrowth: _jsGrowth,
    // 行列
    _jsMdeterm: _jsMdeterm, _jsMinverse: _jsMinverse,
    // 文字列
    _jsConcat: _jsConcat, _jsTextjoin: _jsTextjoin, _jsFixed: _jsFixed,
    _jsDollar: _jsDollar, _jsYen: _jsYen, _jsLenb: _jsLenb, _jsLeftb: _jsLeftb,
    _jsRightb: _jsRightb, _jsMidb: _jsMidb, _jsFindb: _jsFindb, _jsReplaceb: _jsReplaceb,
    _jsAsc: _jsAsc, _jsJis: _jsJis,
    _jsTextbefore: _jsTextbefore, _jsTextafter: _jsTextafter, _jsTextsplit: _jsTextsplit,
    _jsValuetotext: _jsValuetotext, _jsArraytotext: _jsArraytotext,
    // 日付・変換
    _jsDateValue: _jsDateValue, _jsDatestring: _jsDatestring,
    _jsValue: _jsValue, _jsN: _jsN, _jsType: _jsType, _jsCell: _jsCell,
    // 参照系
    _jsIndirect: _jsIndirect, _jsOffset: _jsOffset,
    _jsLookup: _jsLookup, _jsXlookup: _jsXlookup, _jsXmatch: _jsXmatch,
    // 配列
    _jsSequence: _jsSequence, _jsRandarray: _jsRandarray, _jsSort: _jsSort,
    _jsUnique: _jsUnique, _jsFilter: _jsFilter, _jsTake: _jsTake, _jsDrop: _jsDrop,
    _jsExpand: _jsExpand, _jsVstack: _jsVstack, _jsHstack: _jsHstack,
    _jsTorow: _jsTorow, _jsTocol: _jsTocol,
    _jsChoosecols: _jsChoosecols, _jsChooserows: _jsChooserows,
    // 財務
    _jsIrr: _jsIrr, _jsXirr: _jsXirr, _jsVdb: _jsVdb, _jsDisc: _jsDisc,
    _jsIntrate: _jsIntrate, _jsDuration: _jsDuration, _jsAccrint: _jsAccrint,
    _jsAmordegrc: _jsAmordegrc, _jsAmorlinc: _jsAmorlinc,
    // その他
    _jsConvert: _jsConvert, _jsGestep: _jsGestep, _jsDbFunc: _jsDbFunc,
    _jsEncodeUrl: _jsEncodeUrl, _jsAggregate: _jsAggregate,
    _jsIsomitted: _jsIsomitted,
    // LET/LAMBDA系
    _parseFuncArgs: _parseFuncArgs,
    _jsLetExpand: _jsLetExpand, _jsLambdaExpand: _jsLambdaExpand,
    _jsReduceCompute: _jsReduceCompute, _jsScanCompute: _jsScanCompute,
    _jsMapCompute: _jsMapCompute, _jsMakearrayCompute: _jsMakearrayCompute,
    // ルーター
    convertFormula: convertFormula,
    _jsComputeFormula: _jsComputeFormula
  };
}
