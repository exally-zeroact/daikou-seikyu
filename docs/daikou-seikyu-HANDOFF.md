# 代行請求システム（プロトタイプ）引き継ぎ

最終更新: 2026-06-15 / リポジトリ: **Exally-test** / 最新コミット: `fa62cd7`
URL（テスト本番）: https://exally-test.vercel.app/daikou-seikyu.html

## これは何

合同会社ZEROact「ZERO代行」の代行業 請求明細システムの試作。スマホ1ページで「入力・修正・会社マスタ・自社情報・請求書プレビュー・Excel書き出し」まで。
**Exally本番への予行演習**。中核の定義駆動アーキはそのまま本番(Exally)に載せる前提。

## ファイル構成（このリポジトリ）

- `daikou-seikyu.html` … 本体（UI＋localStorage。スマホページ）
- `meisai-engine.js` … 定義駆動 帳票エンジン（DOM非依存・移植可能。請求書HTML生成）
- `hanko.js` … 電子判子の画像処理（白抜き透過・透過判定。再利用モジュール）
- `xlsx.full.min.js` … SheetJS（vendored。Excel .xlsx 生成用）

## 全体アーキ（厳守）

**アプリ＝本体（入力・データ・プレビュー・集計）／ Excel・PDF＝出力**。データは一方向：
`入力 → DB(固定の器) → 会社マスタ参照 → 請求書(定義駆動で生成)`。逆流禁止（請求書の手直しはDBに戻さない／データ誤りはDBを直して再生成）。

- **DB＝固定の器**（自由化しない）: `id / account_id / 会社名 / 日付 / 行き先 / 金額 / 備考 / 距離 / 人数 / 名前`。localStorage `daiko_db_v1`。1行=明細1件。
- **会社マスタ＝自由化の本体**: 会社ごとに `items[]`（項目の順）/ `widths{}` / `lead` / `tableTitle` / `noteSummary` / `noteGroups` / `account_id`。localStorage `daiko_master_v1`。UIはチェック＋ドラッグ＋幅入力＝項目名を手打ちさせず列名一致を原理保証。
- **自社情報＝請求書フォーマット定義の残り**: localStorage `daiko_issuer_v1`（account単位）。`issuer`(発行者・1行=1行) / `bank`(振込先) / `issuerAlign` / `bankAlign` / `dateEra`(seireki|reiwa) / `showInvoiceNo` / `hanko`(処理後dataURL) / `hankoRaw`(元画像) / `hankoBg`(auto|on|off) / `hankoSizeMm`。
- **account_id＝マルチテナントの土台**（将来のシャード/RLSキー）。練習台は単一 `CURRENT_ACCOUNT="acct_local"`。本番はログインアカウント(=代行業者)IDに。

## 画面（下部ナビ5タブ）

ナビは頻度で階層化（UX専門家の助言＋司さん指摘で 7→5 に集約）。並び順は **`設定 / 入金 / 入力 / 一覧 / 請求-集計`**（最頻の入力を親指の届く中央に）。🧾のラベルは中身に合わせ「請求/集計」表記（`.nav-lb`はnowrap）。タブ内サブ切替は **セグメント**（`.seg`/`.seg-btn.on`/`.seg-panel.on`、`showBillingSeg()`/`showSettingsSeg()`）。下記の番号は機能説明用（並び順とは別）。

1. **✍️入力**: 会社選択→その会社のitemsだけ入力欄（明細1件=カード）。日付はカレンダー＋表示M/D。金額は数字以外を即除去＋autocomplete off。**日付必須**（空はブロック）。
2. **📋一覧**: 明細をタップで編集/削除（id特定）。会社・期間（「全期間」+月）で絞り込み。日付なしは「⚠️日付なし」赤。**「📤 表示中の明細をExcelに書き出す」**＝絞り込み連動の明細出力（`exportListExcel()`・列 会社名/日付/行き先/金額/備考/距離/人数/名前＋合計・金額は数値・ファイル名にフィルタ反映）。
3. **🧾請求**: セグメント `[請求書｜集計]`。
   - **請求書**: 月・会社を選ぶ→エンジンで自動生成プレビュー（720pxのA4をスマホ幅に自動縮小）。**印刷/PDFのみ**（@page A4・実寸）。※明細Excelは「一覧」へ移設。
   - **集計（月次集計）**: 月を選ぶと 会社別 請求/入金/残 を表で一覧（請求額の大きい順・状態pill）＋合計カード＋合計行。読み取り専用。「📊この集計をExcel書き出し」（`summarize()`を画面とExcelで共用）。
4. **💰入金**: 請求（=会社×月）ごとに **入金済 / 一部入金 / 未入金** と残額を管理。月/状態フィルタ＋上部サマリ。カードタップで入金記録（全額/未入金クイック・入金日・メモ）。状態は自動判定。localStorage `daiko_payments_v1`（キー=`account::month::会社名`）。**独立タブ**（回収管理が事業の核心）＋**ナビに未入金件数の赤バッジ**（`updatePayBadge()`・未入金＋一部入金の件数）。
5. **⚙️設定**: セグメント `[会社マスタ｜自社情報]`（初回設定もの）。
   - **会社マスタ**: 追加・名前変更・左スワイプ削除・項目チェック・ドラッグ・幅。＋「💾 全データをExcelバックアップ（明細＋会社マスタ）」（`exportExcel()`・2シート・round-trip用）。
   - **自社情報**: 発行者/振込先(自由行・文字揃え左中右)・請求書番号トグル・日付(西暦/令和)・判子(アップロード/自動白抜き/サイズmm)。

## エンジン API（`window.MeisaiEngine` / Nodeでも `require`可）

- `FIELD_DEFS, DEFAULT_WIDTH, ISSUER, ROWS_PER_PAGE(=22), DB_COLS`
- `buildInvoiceHTML(master, co, rows, month, issuer, invoiceNo)` … 1社分（複数ページ）HTML
- `buildMonth(master, db, month, accountId, issuer)` … 月+account で全社分
- `buildWorkbookData(master, db, accountId)` … Excel用シートデータ（{sheets:[{name,aoa}]}）
- `invoiceNoFor(master, accountId, month, co)` … 請求書No（"2026-06-02"形式・会社登録順で安定）
- `listInvoices(db, accountId, month)` … 請求(会社×月)の一覧 `[{company,month,total,count}]`（月=nullで全期間・日付なしは除外・新しい月→会社名順）。入金管理／月次集計の土台。
- `utils.{yen,comma,mdShort,inMonth,tax10,esc,reiwaIssueDate,issueDateStr}`
- issuer引数の形: `{lines:[], bank:[], lineAlign, bankAlign, dateEra, showInvoiceNo, hanko, hankoSizeMm}`。HTML側は `issuerForEngine()` で生成。

## 請求書レイアウト（現状の確定仕様）

- 最上部右端: 「請求日　2026/2/1」「No. 2026-01-02」（西暦が既定／令和切替可／No.はトグル）
- 中央: 「請 求 書」
- 左: 宛名「○○ 御中」（下線なし）→(30px下げ)→ あいさつ文＋「ご請求金額（税込）¥◯」（下線は文字幅+α）
- 右: 発行者ブロック（自社情報・判子は右上に重ねて配置・mm実寸）
- 明細表: ヘッダー「運転業務委託料｜金額（税込み）｜備考」=縦線あり。本文=横罫線のみ＋**金額・備考の列だけ縦線**(`.vl`)。外枠で囲む。22行/枚。
- 右下: **小計/消費税/合計**（ENEOS式・枠なし・色なし・ラベル左/金額右）。その下に役職集計（藤原型）。両塊は列幅統一で縦ライン一致。**役職集計が続く時だけ合計行の下に区切り線**。左下: お振込先。
- **税方式は内税（税込）**: 小計=合計=税込総額、消費税（10%）=内税分=round(total\*10/110)。※ENEOSの外税(数量×単価+消費税)は別物＝代行には使わない（司さん確認済み）。
- 継ぎ足し: 22行超で次ページ。各ページに自前の小計枠。総額headline（ご請求金額）は最終ページのみ。

## 重要な決定事項

- 既存の汎用 `seikyusyo.html` とは別物（あれはExcel貼付テンプレ）。代行は専用に新規。
- 本番DB＝標準Postgres（Supabase推し or Neon）。「自作DBエンジン」はしない＝標準をシャード/分散して上限撤廃（Notion/Figma方式）。容量は1ユーザー数MB/年で問題なし、数千万人はaccount_idシャードで。
- Vercelはフロント/APIで継続。DBは分離して差し替え可能に。
- 「スマホ→PCのExcelに自動反映」は今はファイル書き出しのみ。自動反映は本番クラウド化で対応。
- Excelは微調整・印刷に必要なので残す（出力）。フォーマット自体はアプリが定義から自動生成。

## 残タスク / 次の一歩

1. ~~**入金管理**（請求ごとに入金済/未入金/残額）~~ ✅ 完了（commit `a034b8f`・入金タブ）。
2. ~~**月次集計**（その月 誰にいくら請求/入金 の一覧）~~ ✅ 完了（commit `f85f218`）。**アプリ内の「集計」タブで閲覧**（会社別 請求/入金/残の表＋合計）。Excel書き出しは同タブの副ボタン。
3. （あれば便利）入力補助（よく使う行き先/会社のサジェスト）← 次の候補
4. 本番移行: localStorage→Supabase、ブラウザ印刷→サーバPDF、account_id→ログインアカウント

## 開発環境 / 流儀

- ローカル確認: `node /tmp/srv2.js`相当の静的サーバ（ポート8732でExally-testを配信）→ Playwright MCPでブラウザ確認・スクショ。`file://`はブロックされるのでhttp必須。
- push前チェック: `node --check meisai-engine.js`（HTMLはdiv開閉0確認）。pre-commitでprettier、pre-pushでnpm test（vitest）。`*.min.js`は整形/lint除外済み。
- コミットは小さく1機能ずつ→push→Vercel自動デプロイ(1-2分)。完了報告は4-backtick貼付ブロック。
- ★ツール空振り注意★: tool callは必ず `antml:invoke` / `antml:parameter` 名前空間で書く（付け忘れると生テキストで表示される＝Claude Code側の既知のクセ）。

## 参考（司さんの実Excelテンプレ・OneDrive。送ってもらう必要なし＝直接読める）

- `C:\Users\zeroa\OneDrive\チェリッシュ(代行.xlsx` … 明細型（日付/行き先/金額・内税）。月シート12枚。明細エリア A11:H32。この形を再現済み。
- `C:\Users\zeroa\OneDrive\ENEOS(ZEROact.xlsx` … 外税型（項目/数量/単価/金額/消費税）。小計/消費税/合計は右下の枠（このレイアウトを代行にも採用＝今回の右下枠）。
- 他: `せんば(代行/カラタチ(代行/笠原工業(代行` 等、取引先ごと1ファイル。
- 読み方: `node -e 'const X=require("./xlsx.full.min.js");const fs=require("fs");const wb=X.read(fs.readFileSync("<path>"),{type:"buffer"});...'`
