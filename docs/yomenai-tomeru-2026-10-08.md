# 読めなかった 時は 請求書を 作らない 設計（2026-10-08）

司さん 10-08「全部対立でやれ」。ダイコメの 横断（odan）で 見つかった 候補 3件（代行請求書は ダイコメの 席の 持ち物）。
司さんの 決め「お金の 出力は 1人でも 計算 できなければ 止めて 警告（除いて 確認は 甘い）」に 合わせる。

## 今の 穴（daikou-seikyu.html の loadAllCloud）

- 会社と 明細の 読み込みは 失敗すると ok=false で 画面を 止める（startApp）
- 入金・発行者（issuer）・請求書の 控え（invoices）・番号の 台帳（invoice_no）は 失敗しても toast だけで 画面が 動く
  1. 発行者 ⇒ defaultIssuer()（自社名・登録番号・振込先が 既定）の まま 請求書が 出る
  2. 控え ⇒ INVOICES=[]＝繰越の 材料が 空
  3. 番号の 台帳 ⇒ INVOICE_NO={} ＝ ★発行（issueInvoiceNo）が 新しい 番号を 作って 倉庫に upsert＝凍結した 番号を 上書き★（書く 害）
  4. 入金 ⇒ PAYMENTS={}＝繰越の 入金が 0 と 見える

## 直し

- loadAllCloud で 読めなかった 物を YOMENAI（{issuer, invoices, invoice_no, payments}）に 印を 付ける（読む たびに 作り直す）
- 請求書を 作る 道 全部の 頭で 止める（文：「読めなかった 物（◯◯）が あるので 請求書は 作りません。開き直してください」）
  - \_buildInvoiceBytes（請求画面の PDF・印刷 2か所から 呼ぶ）
  - previewInvoiceFromPay（入金画面の 確認）
- issueInvoiceNo は 台帳を 読めていない 時は 書かない（投げて 止める＝倉庫の 番号を 守る）
- 画面にも 1行 出す（読めなかった 物が 在る 間）

## 試験（e2e・作り物の 倉庫）

- 4つ それぞれ 読めない ⇒ PDF を 作らない（InvoicePDF の 呼び出し 0回）・文が 出る・invoice_no への 書き込み 0回
- 全部 読める ⇒ 今まで 通り 作れる（止めすぎない）
- わざと壊して 赤（門を 外す）

## お金の 出方

- 出る 額は 変えない（読めた 時は 今と 同じ）。読めない 時に 出さない だけ＝司さんの 決めの 向き

## 対立役（10-08）の 指摘を 入れた 後の 作り（ここが 正）

- 印は loadAllCloud の 頭で 4つ 全部 立て、読めた 物だけ 下ろす（自社情報は 行が 無い＝新しい 客は 読めた 扱い）
- 控え・番号の 台帳は fetchAllQ（count:exact）で 全部 読む（1000行で 黙って 切れて 凍結した 番号を 上書きした）
- 止める 作る 道：\_buildInvoiceBytes（PDF・印刷）・previewInvoiceFromPay（入金の 確認）・buildPickedExcel（請求書・入金の 表）・画面の 請求書（\_doGenerateInvoices）・先作り（\_prebuildPreview）。ボタンは updateRegnoGate で 止めて 文を 出す
- 止める 書く 道：saveIssuer（自社情報）・issueInvoiceNo（番号）・bulkMarkPaid／savePay／markPaidFull／undoPayState（入金）
- 本番（10-08 読んだ）：使う 人 1人（ZEROact）・自社情報 在り・繰越の 会社 0・控え 最大 3行・台帳 最大 2行＝今は 害 0
- ★司さんに 訊く★ a. 自社情報の 行が 無い 新しい 客に ZEROact の 振込先・登録番号が 既定で 刷られる ／ b. 入金が 読めない 時 繰越を 使わない 会社の 紙まで 止めるか（今は 止める）／ c. 全社 PDF・Excel・画面が 台帳と 違う 計算の 番号を 刷る 件を 直すか（直すと 刷られる 番号が 変わる）
