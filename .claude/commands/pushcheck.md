---
description: Exally push前チェックを対象ファイルに実行(CLAUDE.md準拠)
argument-hint: "<ファイル名>"
allowed-tools: Bash, Grep, Read
---

対象ファイル「$ARGUMENTS」に CLAUDE.md の push前チェックを実行し、結果を表で報告する。

実行する検査:

1. JS構文: HTML内 <script> または .js は `node --check`(HTMLは該当JS抽出 or 既知の構文崩れ目視)。
2. div開閉差: `<div` の数と `</div` の数を数え、差が 0 であること。
3. Cloudflare汚染: `data-cfemail` の出現数が 0 であること。
4. 禁止文字混入: スマートクォート(” “ ’)・Unicode省略記号(…)・非標準バッククォートが無いこと。
5. 禁止色: コードブロック箇所に #1A2B22 が使われていないこと。

いずれか NG があれば ★赤字で明示し push を止めるよう進言★。全て OK のときのみ「push可」と報告する。
勝手に push はしない(司さんの判断/指示を待つ)。
