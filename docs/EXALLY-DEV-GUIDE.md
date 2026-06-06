# Exally 開発ガイド（効率の良い作り方・テストのやらせ方・構成）

Exally（給与明細・請求書・見積書・スプレッドシート `book.html`）を **速く・正確に・壊さず** 作るための総合ガイド。
「どう進めれば効率がいいか」「どうテストさせるか」「どんな構成か」を1枚にまとめたもの。
テスト手順の細部は `docs/TESTING-GUIDE.md` を参照。

---

## A. 効率よく作る進め方

### A-1. いちばん速いループ（見ながら即反映）

```
1. npm run dev を起動  →  vite が http://localhost:5173 で配信(保存で自動リロード)
2. ブラウザ(PC=localhost:5173/book.html / スマホ=同Wi-Fiの http://<PCのIP>:5173/book.html)を開く
3. 「ここ直して」と言葉で指示
4. ファイルを直して保存  →  開いている画面が数秒で自動更新
```

- 急がないなら テストURL `exally-test.vercel.app` でもOK（push → 1〜2分で自動デプロイ）。違いは反映速度だけ。

### A-2. 役割分担（手で打つ作業をなくす）

```
人がやること   : 「何を・どこを」だけ言葉で指示
Claudeがやること: コードを書く
自動でやること : commit時=整形 / push時=テスト+E2E / push後=Vercelデプロイ
```

→ `npm run lint` や `npm run format` を手で打つ必要なし。commit / push が勝手にやる。

### A-3. 「最上級に作らせる」指示の型（プロンプト）

迷ったらこの5項目を埋めて渡すと精度が跳ね上がる：

```
【ゴール】何を作る / 何ができたら完成か（成功条件は数値か見た目で）
【制約】vanilla JS・CSS直接hex(変数禁止)・デザイン値はCLAUDE.md準拠・book.htmlは巨大注意
【参照】触るファイル名 / 似た既存実装 / CLAUDE.md
【検証】テスト緑 + Playwrightで画面確認 + /pushcheck まで
【進め方】まずplanで設計を見せて(暴走防止)→OKで一気実装→/reportで報告
```

効くレバー：

- 冒頭に「**plan first**（先に設計を見せて）」＝複雑化・暴走を防ぐ
- 成功条件を**数値化**（「速い」→「初回描画<1s」「100行入力でカクつき0」）
- 「**実際に画面を見て確認してから完了と言って**」＝緑≠実機OKの誤報告を防ぐ
- 「**1指示=1修正・ついでに直すな**」＝関係ない箇所を触らせない
- 最後に「**/report**」＝貼り付け用の完了報告が一発で出る

### A-4. Claude Code の便利機能

| 機能                | 何ができる                                                        | 備考             |
| ------------------- | ----------------------------------------------------------------- | ---------------- |
| Playwright MCP      | Claudeが自分でブラウザを開き、表示/コンソールエラーを見て自己修正 | ★再起動後に有効★ |
| `/report`           | 完了報告を貼り付け用4-backtickで出力                              | すぐ使える       |
| `/pushcheck <file>` | node --check / div開閉 / data-cfemail を自動チェック              | すぐ使える       |

> Playwright MCP（Claudeが画面を見る）は、設定追加後に **Claude Code を一度再起動**（`/exit`→`claude`）すると有効。

---

## B. テストのやらせ方

### B-1. 4層 自動回帰（git push だけで全部自動）

| 層             | 何を守る                                         | ファイル                       |
| -------------- | ------------------------------------------------ | ------------------------------ |
| ① 構文/ロード  | モジュールがエラー無く読めるか                   | `tests/modules-load.test.js`   |
| ② データ健全性 | 料率/税テーブルに NaN/負値 typo が無いか         | `tests/rate-tables.test.js`    |
| ③ **計算値**   | 実エンジンで =SUM/VLOOKUP/税/給与 の値が正しいか | `tests/formula-engine.test.js` |
| ④ 画面         | 全画面が実行時エラー0で開く + book操作で落ちない | `tests/e2e/*.spec.js`          |

- ローカル（husky）でも、クラウド（GitHub Actions CI）でも、**push のたびに自動実行**。
- 現状：vitest 24本 + E2E 6本、すべて緑。

### B-2. 普段の回し方

```
開発中     : npm run test:watch を別ターミナルで起動(保存ごと自動テスト)
git commit : 触ったファイルを自動整形(lint-staged)
git push   : npm test が自動実行。緑じゃないと push がブロック
push後     : GitHub Actions が lint+test+E2E をクラウドで再検証
```

### B-3. 新しい数式・機能を「守る」指示の出し方

- **新しいExcel数式を実装したとき** → `tests/formula-engine.test.js` に1行足すだけで回帰に乗る：
  ```js
  expect(calc([["=ROUNDDOWN(1234567,-3)"]], 0, 0)).toBe(1234000);
  expect(calc([["=300000 - 300000*0.0055"]], 0, 0)).toBe(298350); // 手取り
  ```
  指示例：「この数式 `=○○` の正解は △△。formula-engine に回帰テストを1行足して」
- **画面の挙動を守りたいとき** → 「book.html を開いてセルに入力→Enterして落ちないか、E2Eに足して」
- **テストを頼むときのコツ** → 合格条件を数値で渡す：「合計が330・console error 0・崩れ無し を確認して」

### B-4. テストすべき優先順位（Exally）

1. 金額・税・料率の計算（間違うと実害最大）
2. 数式エンジン（exally-formula / HyperFormula）の関数
3. 各画面が実行時エラー無しで開くこと

---

## C. どんな構成になっているか

### C-1. ファイル構成（全体像）

```
exally-test/
├── home.html / book.html / chat.html               # 画面(book.html=約6000行・巨大注意)
├── seikyusyo.html / mitsumoriyo.html / kyuuryoumeisai.html
├── exally-formula.js                                # 数式エンジン(HyperFormula ラッパー)
├── hyperformula.full.min.js                         # 数式エンジン本体(vendor)
├── 各種料率/税JS (koyohoken/shotokuzei/shakaihoken…) # 給与計算データ
├── api/claude.js                                    # サーバ側(Claude API)
│
├── tests/                                           # ← テスト
│   ├── modules-load.test.js     (層①構文)
│   ├── rate-tables.test.js      (層②データ)
│   ├── formula-helpers.test.js  (補助)
│   ├── formula-engine.test.js   (層③計算値・実HyperFormula)
│   └── e2e/                     (層④画面・Playwright)
│       ├── pages-smoke.spec.js
│       └── book-interaction.spec.js
│
├── .github/workflows/ci.yml                         # クラウド自動テスト(push/PR)
├── .husky/ (pre-commit=整形 / pre-push=test)         # ローカル自動ゲート
├── .claude/commands/ (report.md / pushcheck.md)     # Claude Code コマンド
├── playwright.config.js / vitest.config.js          # テスト設定
├── eslint.config.js / .prettierrc / .prettierignore # lint/整形(book.html除外)
└── docs/ (TESTING-GUIDE.md / EXALLY-DEV-GUIDE.md)    # ドキュメント
```

### C-2. 自動ゲートの流れ

```
コード書く
   │  (npm run dev で見ながら / test:watch で自動テスト)
   ▼
git commit ──→ pre-commit: 触ったファイルを自動整形
   │
git push  ──→ pre-push: npm test(緑のみ通過)
   │
   ├─→ GitHub Actions CI: lint + vitest + E2E をクラウド再検証
   └─→ Vercel: 1〜2分で自動デプロイ → exally-test.vercel.app
```

### C-3. URL早見

| 用途                | URL                             | 反映              |
| ------------------- | ------------------------------- | ----------------- |
| ローカル即反映(dev) | http://localhost:5173/book.html | 保存で数秒        |
| テスト(チーム確認)  | https://exally-test.vercel.app/ | push後1〜2分      |
| 本番                | https://exally.vercel.app/      | 1修正→実機確認→次 |

### C-4. コマンド早見

```bash
npm run dev        # ライブリロード開発サーバ(localhost:5173)
npm run test:watch # 保存ごと自動テスト(開発中)
npm test           # 全ロジックテスト(24本)
npm run test:e2e   # 画面E2E(6本)
npm run lint       # バグ検査
npm run check      # lint + test まとめて
```

---

## まとめ（これだけ覚えれば回る）

1. `npm run dev` で見ながら、言葉で「ここ直して」と指示（スクショ不要）
2. Claudeが直す → commit=整形・push=テスト が全自動 → 壊れたものは出ない
3. 新しい数式は formula-engine に1行足すだけで永久に自動チェック
4. 大きい作業は「plan first」で設計を見せてもらってからGO

最終更新: 2026-06-06 / 対象: exally-test
