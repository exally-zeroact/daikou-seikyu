# 引継ぎ — Exally代行請求 編集タブ（2026-06-20）

別チャット/別セッションで続きをやるための引継ぎ。リモートが401で弾かれたため作成。

## 環境

- リポジトリ: `C:\Users\zeroa\Exally-test`（バニラJS単一HTML `daikou-seikyu.html` + `invoice-pdf.js`）
- テストURL: https://exally-test.vercel.app/daikou-seikyu.html （キャッシュ回避は `?数字`）。**Exally-test自体がテスト環境**（別の「本番」同期は今回なし）
- 検証: Playwright 390×844 + **実機iPhone(Safari)/Android 両方**（メモリ恒久ルール）
- ログイン: zeroact24.729@outlook.com / Kanaki0903
- ローカル: `http://127.0.0.1:8777/daikou-seikyu.html`
- push前チェック: `node --check invoice-pdf.js` ＋ div均衡 `node -e "const h=require('fs').readFileSync('daikou-seikyu.html','utf8');console.log((h.match(/<div/g)||[]).length-(h.match(/<\/div>/g)||[]).length)"`（0であること）

## 今セッションでpush済（main・テスト反映済）

1. `1c65c21` プレビュー高さ=合計の下端まで自動カット（PDF座標frac）
2. `d9723d9` ロゴ/判子サイズ変更で上に戻る不具合修正＋ロゴ1mm刻み
3. `10316ce` チップで各範囲へ確実に飛ぶ（PDF座標で決定的・getBoundingClientRect廃止）
4. `a913f9f` 文字サイズ=全体fontScale＋行送り連動（標準1.0でバイト不変）
5. `b503e2c` 文字サイズを**範囲(チップ)別**に（`_blkFs[塊名]`override＋`_globalFs`base・各範囲パネルに小/標準/大）
6. `cdfa46b` 明細多い時の小計×自社情報の重なり根治（capDetail自動化）＋プレビュー上限0.44
7. `2f7abfe` 複数ページは1ページずつ＋「◀ N/M ▶」ページ切替バー
8. `3e06f08` ★編集タブを**1画面固定フレーム化**＝「上下に動きすぎ」根治＋選択中プレビュー縮小でパネル拡張★

詳細はメモリ `project_exally_edit_tab_session_2026-06-20.md` 参照。

## 次にやること＝3機能（厳しい監査官会議 wpn13f7ir 完了・全「修正の上採用」・**未実装**）

### ① 文字サイズをスライダー化（監査6.5）

- `_fontCtrlHtml(key)`（daikou-seikyu.html 約L6105）の 小/標準/大 3チップ → `<input type=range min=0.85 max=1.18 step=0.05 value=cur data-key=key>`
- 両端「小/大」ラベル＋中央「標準」tick・**1.0スナップ**（|v-1.0|<0.02→1.0）・step0.05に丸めて保存
- **二段分離**: `oninput`=ライブプレビュー（`generateInvoices()` 220ms debounce、メモリのISSUER_SETTINGSだけ更新）／`pointerup`+`change`=クラウド保存（`setIssuer('blkFs',m)`→saveIssuer）1回だけ
- CSS: `touch-action:none`（iOS Safariのドラッグ×スクロール競合回避）・`-webkit-appearance:none`・thumb視覚30px+行高48pxで当たり44px確保
- classicは既存どおりdisabled維持。`_rerenderRangePanel`/`_appendFontCtrl`再描画でslider valueを現在値で復元（標準に戻るバグ注意）
- **★push前ブロッカー（監査全員指摘）**: Excel書出経路（L3702-3819 / L5112+ 請求書シート）が `blkFs` を読んでいない。(a)Excelにも係数反映 or (b)スライダー直下に薄字で「字サイズはPDF専用・Excelは標準固定」注記＋**司さんに事前報告**。黙ってPDFだけ変えるのは「PDF/Excel出力一致」不可侵に抵触

### ② 入金画面の自由度（監査7.0）

- `renderPayments()`（約L7150・行組み立てL7196-7217）の各行に独立「**全入金**」ワンタップbtn＝`markPaidFull(month,co,total)`（`savePay`と同一upsert流用・`event.stopPropagation()`・44px・**Undoトースト**・確認なし）。paid行は淡色「済」表示でレイアウト不変
- `openPayEdit`のpay-quick（L7247-7251）に **残額/半額** チップ追加（既存`payFill(v)`再利用・残額=iv.total-rec.paid・半額=Math.round(...)）
- filterbarに「選択」トグル＋sticky footerで`bulkMarkPaid`（未完了行チェック→1件ずつupsert・部分失敗明示・一括Undo）
- **★監査必須fix**: 月/会社の復元は `split('::')[2]` 禁止→既存L8891同様 `parts[1]` ＋ `parts.slice(2).join('::')`（会社名に`::`含む対策）。選択は文字列キーでなく `{key:{month,co,total}}` オブジェクト保持。`#paySelBar`の縦位置は `bottom:var(--nav-h)`（既存変数・env二重加算しない）。Undoトーストは通常toastと別要素/別タイマー
- savePay/PAYMENTS{account::month::会社}/payStatusOf/クラウド同期は**非破壊**

### ③ 取引先セレクトを最近使った順＝MRU（監査8.0＝最高評価・effort S）

- optgroup二段:「最近使った会社」上位N=3 ＋「すべての会社」（現状の安定順・全件）
- 新規: `recordCompanyUse(name)`（saveEntries成功時 約L8158直後に呼ぶ）→ localStorage `daiko_co_recent_v1` = `{会社名:epochMs}`（CO_RECENT_KEY定数をLAST_CO_KEY隣 約L3421に）／`topRecentCompanies(names,n)`（安定ソート降順上位n）
- `refreshCompanySelects()`（L7828-7851）の `head + names.map(...)` を head＋（最近optgroup）＋「すべての会社」optgroup＋names全件 に。対象=**#inputCompany / #listCompany のみ**（editCompanyは対象外）
- **★監査必須fix**: try/catchは「JSON.parse失敗→空map」と「setItem例外→握り潰し」を別々に。`names.length <= N+1`(4社以下)は最近グループ省略で**単段フォールバック**（小規模で冗長二段にしない）。重複表示(同一社が上下段)の実機見えをiPhone/Androidネイティブピッカー両方で確認（紛らわしければ下段から最近N社除外案を司さんに併示）。クラウド不可侵=localStorageのみ。LAST_CO_KEYは別物で温存

## 作法（恒久・メモリ準拠）

- 3-layer: routine=自走 / 危険・エラー=止めて提示 / prod-push=1行heads-up。「進めますか？」等のYes/No質問は禁止
- 完了報告は4バッククォート1ブロック（司さんが貼れる形）
- **データ(companies/meisai/payments)を指示なしで追加/削除/復元しない**（過去に意図的削除を勝手に復元して二度手間にした）
- スマホ修正は複数サイズ＋iPhone(Safari)/Android両方の描画差を確認してから「直した」と言う
- 大改修前は厳しい監査官会議、デザイン変更は先に画面で見せてからpush
- 会議は Workflow（ネストtemplate literal不可＝文字列連結で書く・const末尾は`;`）
