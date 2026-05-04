// ===== QUIZ DATA =====
var quizData = {
  beginner: [
    {q:'A1からA10の合計を求める関数は？',hint:null,choices:['=SUM(A1:A10)','=TOTAL(A1:A10)','=ADD(A1,A10)','=COUNT(A1:A10)'],correct:0},
    {q:'A1からA10の平均を求める関数は？',hint:null,choices:['=AVERAGE(A1:A10)','=MEAN(A1:A10)','=SUM(A1:A10)/10','=MID(A1:A10)'],correct:0},
    {q:'「A1が80以上なら合格」をIF関数で書くと？',hint:'=IF(条件, 真の場合, 偽の場合)',choices:['=IF(A1>=80,"合格","不合格")','=IF(A1>80,"合格","不合格")','=IF("合格",A1>=80,"不合格")','=IFS(A1>=80,"合格")'],correct:0},
  ],
  basic: [
    {q:'VLOOKUPで「完全一致」の第4引数は？',hint:'=VLOOKUP(検索値, 範囲, 列番号, ???)',choices:['FALSE','TRUE','0','1'],correct:0},
    {q:'B列が「東京」のA列合計を求める関数は？',hint:null,choices:['=SUMIF(B:B,"東京",A:A)','=COUNTIF(B:B,"東京")','=SUM(A:A,"東京")','=SUMIFS(A:A,B:B)'],correct:0},
    {q:'#N/Aエラーのとき空白を表示するには？',hint:'VLOOKUPのエラー処理',choices:['=IFERROR(VLOOKUP(A2,B:D,2,FALSE),"")','=IFNA(VLOOKUP(A2,B:D,2,FALSE))','=IF(VLOOKUP=NA,"","")','=ERROR(VLOOKUP,"")'],correct:0},
  ],
  intermediate: [
    {q:'VLOOKUPで左の列を返せない。代替の組み合わせは？',hint:null,choices:['INDEX + MATCH','OFFSET + IF','XLOOKUP のみ','INDIRECT + ROW'],correct:0},
    {q:'複数条件のSUMを配列なしで計算する関数は？',hint:null,choices:['SUMPRODUCT','SUMIF','SUMIFS','SUM+IF'],correct:0},
    {q:'IFERRORとIFNAの違いは？',hint:null,choices:['IFNAは#N/Aのみ、IFERRORは全エラー処理','IFNAは全エラーを処理','どちらも同じ','IFERRORは#N/Aのみ処理'],correct:0},
  ],
  advanced: [
    {q:'LAMBDA関数の主な用途は？',hint:null,choices:['カスタム再利用可能な関数を定義する','配列を結合する','条件分岐を行う','テキストを変換する'],correct:0},
    {q:'スピル（Spill）機能とは？',hint:null,choices:['数式が複数のセルに結果を自動展開する機能','セルの内容を複数シートに同期する機能','グラフを自動作成する機能','データを自動整列する機能'],correct:0},
    {q:'XLOOKUP がVLOOKUPより優れている点は？',hint:null,choices:['左方向への検索が可能・エラー処理が内蔵','計算速度が速い','より多くの引数が使える','配列数式が不要'],correct:0},
  ]
};

var levelLabels = {beginner:'入門',basic:'初級',intermediate:'中級',advanced:'上級'};
var currentQuizLevel = 'beginner';
var currentQ = 0;
var quizScore = 0;
var answered = false;

function startQuiz(level) {
  currentQuizLevel = level; currentQ = 0; quizScore = 0; answered = false;
  document.getElementById('quizLevelSelect').style.display = 'none';
  document.getElementById('quizQuestions').style.display = 'block';
  document.getElementById('quizResult').classList.remove('show');
  renderQuestion();
}

function renderQuestion() {
  var qs = quizData[currentQuizLevel];
  var q = qs[currentQ];
  answered = false;
  document.getElementById('qNum').textContent = '問題 ' + (currentQ+1) + ' / ' + qs.length;
  document.getElementById('qLevel').textContent = levelLabels[currentQuizLevel];
  document.getElementById('qProgress').style.width = ((currentQ+1)/qs.length*100) + '%';
  document.getElementById('qText').textContent = q.q;
  var hint = document.getElementById('qHint');
  if (q.hint) { hint.textContent = q.hint; hint.style.display = 'block'; } else hint.style.display = 'none';
  var L = ['A','B','C','D'];
  document.getElementById('qChoices').innerHTML = q.choices.map(function(c,i){
    return '<button class="quiz-choice" onclick="answerQuiz('+i+')">'
      +'<span class="quiz-choice-label">'+L[i]+'</span>'+c+'</button>';
  }).join('');
}

function answerQuiz(idx) {
  if (answered) return; answered = true;
  var q = quizData[currentQuizLevel][currentQ];
  var btns = document.querySelectorAll('.quiz-choice');
  btns[q.correct].classList.add('correct');
  if (idx !== q.correct) btns[idx].classList.add('wrong'); else quizScore++;
  setTimeout(function(){
    currentQ++;
    if (currentQ < quizData[currentQuizLevel].length) renderQuestion();
    else showQuizResult();
  }, 1300);
}

function showQuizResult() {
  document.getElementById('quizQuestions').style.display = 'none';
  var total = quizData[currentQuizLevel].length;
  var pct = quizScore / total;
  var gain = Math.round(quizScore * 5);
  // score はmain側のグローバル変数を参照
  score = Math.min(100, score + gain);
  var rank = score>=80?'上級者':score>=60?'中級者':score>=40?'初中級':'初級者';
  document.getElementById('qrScore').textContent = quizScore+'/'+total;
  document.getElementById('qrIcon').textContent = pct===1?'🎉':pct>=0.6?'👍':'📖';
  document.getElementById('qrTitle').textContent = pct===1?'全問正解！パーフェクト！':pct>=0.6?'もう少しで完璧！':'一緒に復習しよう';
  document.getElementById('qrMsg').textContent = pct===1?'すばらしい！AIチャットでさらに深く学べます。':'AIチャットで苦手な部分を解説してもらいましょう。';
  document.getElementById('qrScoreUpdate').textContent = '🎓 習熟度 +'+gain+'pt → '+score+'pt（'+rank+'）';
  document.getElementById('scoreNum').textContent = score;
  document.getElementById('scoreBar').style.width = score + '%';
  document.getElementById('scoreRank').textContent = rank;
  document.getElementById('settingsScore').textContent = score + 'pt';
  document.getElementById('quizResult').classList.add('show');
}

function resetQuiz() {
  document.getElementById('quizResult').classList.remove('show');
  document.getElementById('quizLevelSelect').style.display = 'block';
  document.getElementById('quizQuestions').style.display = 'none';
}
