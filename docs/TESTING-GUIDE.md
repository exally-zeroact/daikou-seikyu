# Exally テストガイド（チーム共有用）

Exally（給与明細・請求書・見積書・スプレッドシート `book.html`）を **速く・壊さずに** 開発するための、テスト手順とツールの全まとめ。
新しく入った人はこれを読めば「**何で・どう・いつ** テストするか」が分かります。

対象リポジトリ: `exally-test`（テスト版）。本番 `exally` へは別ルール（後述）。

---

## 0. 3行サマリ（まず結論）

1. `npm install` するだけで、テスト・整形・自動ゲートが全部入る。
2. 普段は `npm run test:watch` を回しっぱなしにして、**保存するたび自動でテスト**される。
3. `git commit` で自動整形、`git push` で自動テスト。**赤いものは push されない**ので安心。

---

## 1. 前提と初期セットアップ

### 必要なもの

- **Node.js 18 以上**（推奨 20 / 24）… `node -v` で確認
- **git**
- （任意）**Claude Code**… ブラウザ自動確認やコマンドを使う場合

### 手順（クローンから3コマンド）

```bash
git clone https://github.com/exally-zeroact/exally-test.git
cd exally-test
npm install        # ← これ1回で eslint / prettier / vitest / husky が全部入り、git フックも自動配線される
```

### 動作確認

```bash
npm test           # 全テストが PASS（緑）になれば準備OK
```

> `npm install` で `husky` が走り、`.husky/` のフック（commit時・push時の自動チェック）が有効になります。**追加設定は不要**です。

---

## 2. テストツール一覧（全部）

| ツール                          | 役割                                             | いつ動く                     | コマンド                                  | 状態                            |
| ------------------------------- | ------------------------------------------------ | ---------------------------- | ----------------------------------------- | ------------------------------- |
| **Vitest**                      | ロジック・データの単体テスト（数式/税計算/料率） | 手動 & push時                | `npm test` / `npm run test:watch`         | ✅ 導入済                       |
| **ESLint 9**                    | バグ・危険コードの静的検出                       | 手動 & commit時              | `npm run lint` / `npm run lint:fix`       | ✅ 導入済                       |
| **Prettier**                    | コード自動整形（体裁統一）                       | 手動 & commit時              | `npm run format` / `npm run format:check` | ✅ 導入済                       |
| **lint-staged**                 | commit時に「触ったファイルだけ」整形+fix         | commit時（自動）             | （自動）                                  | ✅ 導入済                       |
| **husky**                       | git フック管理（下の2つを自動起動）              | commit/push時（自動）        | （自動）                                  | ✅ 導入済                       |
| └ pre-commit                    | ステージしたファイルを lint-staged で整形        | `git commit`                 | （自動）                                  | ✅                              |
| └ pre-push                      | `npm test` を実行し、緑でなければ push を止める  | `git push`                   | （自動）                                  | ✅                              |
| **Playwright（MCP経由）**       | 実ブラウザで画面表示・コンソールエラーを確認     | Claude Code から対話的       | （後述）                                  | ✅ 利用可                       |
| **手動 push前チェック**         | `node --check` / div開閉 / Cloudflare汚染        | push前に手動 or `/pushcheck` | 下記                                      | ✅                              |
| **@playwright/test（自動E2E）** | スクリプトで画面操作を自動回帰                   | CI/手動                      | `npx playwright test`                     | ⚠️ **未導入**（必要なら追加可） |

> ✅＝今 `exally-test` に入っているもの / ⚠️＝入れれば使えるが現状は未導入。

### 各ツールの詳しい説明

- **Vitest（メインのテスト）**
  `tests/` フォルダの `*.test.js` を実行。給与計算・税率・数式など「間違うと実害が出るロジック」を守るのが目的。
  - `npm test` … 1回だけ全実行（CI/push時もこれ）
  - `npm run test:watch` … 保存するたび自動で再実行（**開発中はこれを別ターミナルで起動**）

- **ESLint（バグ検出）**
  未定義変数の使用ミスや到達不能コードなど「実バグ」を検出。体裁は Prettier に任せ、ESLint はバグ検出に絞った設定。
  - `npm run lint` … 検査のみ
  - `npm run lint:fix` … 自動修正できるものは直す
  - ※ 現状 warning（未使用変数など）は残っていますが **push はブロックしません**（既存コードを一気に直さない方針）。

- **Prettier（整形）**
  インデントや改行を統一。**`book.html`（約6,000行）と vendor/min.js は整形対象から除外**（巨大ファイルの一括整形は差分が膨大＆破損リスクのため `.prettierignore` で保護）。

- **husky + lint-staged（自動ゲート＝これが効率化の肝）**
  手で意識しなくても、
  - `git commit` → 触ったファイルだけ自動で lint --fix + 整形
  - `git push` → 自動で `npm test`、**緑じゃないと push が止まる**
    つまり「壊れたコードがリモートに出ない」状態が自動で保たれます。

- **Playwright（ブラウザ確認）**
  Claude Code の Playwright MCP を使うと、実ブラウザでページを開き、**コンソールエラーや表示崩れを目で確認**できます（セクション6）。
  スクリプトで自動回帰したい場合は `@playwright/test` を別途導入します（未導入）。

- **手動 push前チェック（CLAUDE.md 準拠）**
  HTML を直接編集したときの定番チェック：
  ```bash
  node --check ファイル名.js          # JS構文エラーが無いか
  grep -c '<div' ファイル名.html       # 開きdivの数
  grep -c '</div' ファイル名.html      # 閉じdivの数（上と一致＝差0であること）
  grep -c 'data-cfemail' ファイル名.html  # Cloudflare汚染（0であること）
  ```
  Claude Code を使うなら `/pushcheck <ファイル名>` でこれを自動実行できます。

---

## 3. 日々の開発フロー（効率版）

```
┌ 1. コードを書く
│
├ 2. 別ターミナルで  npm run test:watch  を起動 → 保存ごとに自動テスト（赤くなったら即気づく）
│
├ 3. git add .  →  git commit -m "..."   ← pre-commit が触ったファイルを自動整形（手間ゼロ）
│
├ 4. git push                            ← pre-push が npm test を自動実行。緑のみ通過
│
└ 5. push の1〜2分後、Vercel が自動デプロイ → プレビューURLで実機確認
```

**ポイント**: 手で `npm run lint` や `npm run format` を毎回打つ必要はありません。commit/push が勝手にやります。手動で打つのは「今すぐ全体を確認したい」時だけ。

---

## 4. テストの書き方（最重要：何をテストすべきか）

### 置き場所と形式

- `tests/` フォルダに `〇〇.test.js` を作る。
- Vitest 形式（ESM の import を使う）:

```js
import { describe, it, expect } from "vitest";
import SHOUHIZEI from "../shouhizei-ritsu.js";

describe("消費税率テーブル", () => {
  it("標準税率が含まれる", () => {
    // テーブルの中に 0.10（10%）が存在することを確認する等
    expect(SHOUHIZEI).toBeTruthy();
  });
});
```

### テストすべき優先順位（Exally の場合）

1. **金額・税・料率の計算**（間違うと給与/請求の金額が狂う＝実害最大）
   - 消費税 `shouhizei-ritsu.js` / 所得税 `shotokuzei-hyou.js` / 社会保険 `shakaihoken-hyo.js` /
     雇用保険 `koyohoken-ritsu.js` / 労基 `rouki-ritsu.js` / 最低賃金 `saitei-chingin.js`
2. **数式エンジン**（`exally-formula.js`）の関数 … 例: セル参照変換 `_toRC("A1") → {r:0,c:0}`
3. **モジュールがエラー無くロードできる**こと（構文崩れの早期検出）

### 今あるサンプルテスト（参考にコピーして増やす）

- `tests/modules-load.test.js` … 主要モジュールが読み込めるか（構文ガード）
- `tests/rate-tables.test.js` … 料率/税テーブルに NaN や負値の typo が無いか
- `tests/formula-helpers.test.js` … 数式ヘルパー `_toRC` の計算が正しいか

> **コツ**: 「Node でロードできる（`module.exports` がある）ファイル」はそのままテストできます。
> `window.〇〇 =` で直接ブラウザに書いているファイル（例 `kyuuryoumeisai-data.js`）は Node で読めないので、
> ブラウザ前提のテスト（Playwright）側で確認します。

---

## 5. Excel／スプレッドシート特有のテスト観点

Exally は「Excel を Web で作る」ので、普通のサイトより数値の正しさが厳しいです。次の観点を意識：

| 観点                  | 何を確認するか                                         | 例                                                     |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **数式の結果**        | 関数が Excel と同じ値を返すか（HyperFormula ベース）   | `=SUM(1,2,3)` → 6 / `=VLOOKUP(...)`                    |
| **税・料率テーブル**  | 数値の typo が無いか（NaN/負値/桁ミス）                | 雇用保険 一般 0.55% / 消費税 10%・8%                   |
| **端数処理**          | 四捨五入・切り捨ての方向（法令準拠）                   | 社会保険料の円未満処理                                 |
| **セル参照変換**      | `A1` ↔ 行列番号の相互変換                              | `AA1 → 列26`                                           |
| **IME（日本語入力）** | 変換確定 Enter の二重発火でカーソルが2行進まないか     | ← 実際に過去発生・修正済                               |
| **境界値**            | 0 / 空欄 / 負値 / 上限なし                             | 所得税 最上位ブラケットの上限は `Infinity`（正常仕様） |
| **巨大ファイル**      | `book.html`（約6,000行）は一括整形・無関係改変をしない | `.prettierignore` で保護済                             |
| **実機表示**          | レイアウト崩れ・console error・スマホ幅                | Playwright で確認（セクション6）                       |

---

## 6. Claude Code を使う場合（任意・最速ルート）

Claude Code があると、ブラウザ確認とチェックを自動化できます。

### (a) Playwright MCP で「見て直す」

実ブラウザを開いて表示・コンソールを確認し、直して再確認まで自走させられます。指示は **URL＋合格条件＋再現手順** の3点セットが効率的：

```
https://exally-test-...vercel.app/seikyusyo.html を開いて、
【再現手順】品目を1行追加して金額300、税率10%を選ぶ
【合格条件】合計が330・console error 0・レイアウト崩れなし
を確認して。ズレてたら直して、直ったら同じ手順で再確認して。
```

### (b) スラッシュコマンド

- `/pushcheck <ファイル名>` … push前チェック（node --check / div開閉 / data-cfemail / 禁止文字）を自動実行
- `/report` … 完了報告を貼り付け用の定型ブロックで出力

> Claude Code でこれらを使うには、MCP/コマンドを読み込むため **一度 Claude Code を再起動**してください（設定はセッション開始時に読み込まれます）。

---

## 7. やってはいけないこと（事故防止）

- ❌ `book.html` を Prettier で一括整形する（巨大 diff＋破損リスク）。→ `.prettierignore` で除外済。手で全体整形もしない。
- ❌ lint の warning を消すために**無関係な箇所を触る**。1指示＝1修正。
- ❌ テストを実機で確認せず「直った」と報告する。**緑＝実機OKではない**。Playwright か実URLで必ず目視。
- ❌ 本番 `exally` へ複数まとめて push。**本番は 1修正 → 実機確認 → 次**（テスト版だけ複数まとめてOK）。
- ❌ CSS変数を使う（Exally は直接 hex 値のみ）。`#1A2B22` をコードブロックに使わない。
- ❌ GitHub のウェブエディタ（鉛筆アイコン）で編集（Cloudflare 汚染が入る）。

---

## 8. コマンド早見表

```bash
npm install            # 初回・依存更新時。テスト/整形/フックを全部セットアップ
npm test               # 全テストを1回実行（緑/赤を確認）
npm run test:watch     # 保存ごとに自動テスト（開発中ずっと起動推奨）
npm run lint           # バグ検査
npm run lint:fix       # 自動修正できるものを直す
npm run format         # 整形（book.html等は除外）
npm run format:check   # 整形が必要な箇所が無いか確認（変更はしない）
npm run check          # lint + test をまとめて
```

---

## 9. トラブルシュート

| 症状                                                             | 対処                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm test` が赤                                                  | 出力の `ファイル名:行` を見る。料率/数式の typo か、構文崩れが多い         |
| push が止まる                                                    | 正常な防御。`npm test` を緑にしてから push                                 |
| commit で整形が走らない / フックが動かない                       | `npm install` を再実行（`prepare` で husky が再配線される）                |
| Windows PowerShell で `claude mcp add ... -- ...` が `-y` で失敗 | `--` を `'--'` とクォートする                                              |
| `book.html` を編集したら差分が巨大                               | 整形が走った可能性。`book.html` は整形対象外のはず。無関係改変が無いか確認 |

---

最終更新: 2026-06-06 / 対象: `exally-test`
