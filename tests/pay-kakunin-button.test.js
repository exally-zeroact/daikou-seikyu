// @vitest-environment node
// ============================================================
// ★入金画面の「確認」ボタン＝押したら 請求書の PDF が 見える★ 2026-10-01
//
//   司さん「代行請求書アプリの入金のページの……赤丸の所に確認ボタンを作って
//           押したらPDFで請求書が見れるようにしろ」
//
//   ★ここで 一番 守りたいのは「見るだけ」★
//     請求画面の `_buildInvoiceBytes()` は
//       ・`issueInvoiceNo()` … 未発行なら ★倉庫に 請求番号を 書く★
//       ・`saveInvoiceCopy()` … ★控えを 残す★
//     を やる。確認ボタンが それを 呼ぶと
//     ★覗く たびに 請求書を 発行した事に なる★（番号が 残り、控えが 増える）。
//     ⇒ 確認は ★1文字も 書かない★。発行済みの 番号が 在れば それを 使い、
//       無ければ 同じ計算で 出した 番号を 付けるだけ（保存しない）。
//
//   ★★わざと壊した 記録（2026-10-01・自分で 1つずつ 戻して 数えた）★★
//     壊す前 …………………………………… 赤 0 / 全 5
//     ① ボタンの 字を 変える ……………… ★赤 1★ / 5
//     ② onclick を 外す …………………… ★赤 1★ / 5
//     ③ invoiceNoPeek → issueInvoiceNo に 戻す ★赤 1★ / 5
//     ④ saveInvoiceCopy を 呼ぶように する … ★赤 1★ / 5
//     戻した後 ………………………………… 赤 0 / 全 5
//     ※ どれも ★赤 1本ずつ★＝壊した 所と 赤に なる 段が 1対1。
//       水増しせず 数えたままを 書く。
//     ※ ①は はじめ 探す字を 間違えて 「STRING NOT FOUND」に なった
//       （引用符の 種類違い）。★壊せていない のに 通ったと 読まない★。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, "..", "daikou-seikyu.html"), "utf8");

// ★入金モーダルを 組み立てている 所だけを 切り出す★
//   （全文に かけると 請求画面の 字を 拾って ★偽の緑★ に なる）
function payModalBu() {
  const a = SRC.indexOf("function openPayEdit(");
  const b = SRC.indexOf("function payFill(", a);
  return SRC.slice(a, b > a ? b : a + 6000);
}
// ★確認の 中身だけを 切り出す★
function kakuninBu() {
  const a = SRC.indexOf("async function previewInvoiceFromPay(");
  const b = SRC.indexOf("function payStatusOf(", a);
  return SRC.slice(a, b > a ? b : a + 4000);
}

describe("★入金画面の「確認」ボタン★", () => {
  it("★① 入金モーダルに 確認ボタンが 在る★", () => {
    const bu = payModalBu();
    expect(bu.length, "★入金モーダルの 切り出しが 空＝測れていない★").toBeGreaterThan(500);
    expect(bu, "★確認ボタンが 無い★").toContain(">確認</button>");
  });

  it("★② 押すと 確認の 中身が 呼ばれる★", () => {
    expect(payModalBu(), "★ボタンに onclick が 付いていない★").toContain(
      "previewInvoiceFromPay(this,"
    );
  });

  it("★③ 見るだけ＝請求番号を 新しく 発行しない★", () => {
    const bu = kakuninBu();
    expect(bu.length, "★確認の 中身の 切り出しが 空＝測れていない★").toBeGreaterThan(300);
    expect(bu, "★覗く たびに 番号を 発行している（倉庫に 書く）★").not.toContain("issueInvoiceNo(");
    expect(bu, "発行済みの 番号を 使う 道が 無い").toContain("invoiceNoPeek(");
  });

  it("★④ 見るだけ＝控えを 残さない★", () => {
    expect(kakuninBu(), "★覗く たびに 控えが 増える★").not.toContain("saveInvoiceCopy(");
  });

  it("★⑤ 覗く用の 番号は 保存しない★", () => {
    const a = SRC.indexOf("function invoiceNoPeek(");
    const b = SRC.indexOf("async function previewInvoiceFromPay(", a);
    const bu = SRC.slice(a, b > a ? b : a + 800);
    expect(bu.length, "★切り出しが 空★").toBeGreaterThan(100);
    expect(bu, "★覗くだけ なのに 倉庫へ 書いている★").not.toMatch(/SB\.from\(|upsert\(/);
    expect(bu, "★覗くだけ なのに 手元に 覚えさせている★").not.toMatch(/INVOICE_NO\[\s*k\s*\]\s*=/);
  });
});
