// ============================================================
// ★テスト用の帯（2026-08-23）★
//
//   ★なぜ在るか★
//     2026-08-21、司さんの端末3台に ★テスト版のメーターが入っていた★。
//     当時のテスト版は 本番と ★1ドットも同じ見た目★ で、見分ける方法が無かった。
//     指示役が 2026-08-23 に7サイトを数えたら、帯が出ているのは Rakually だけだった。
//     ダイコメの3つを実測 … メーター○／事務所○／★この請求書だけ 無かった★。
//
//   ★決まり★
//     ①テスト用のアドレス(-test)の時だけ 帯を出す
//     ②★本番(daikou-seikyu.vercel.app)には 絶対に出さない★
//       ＝判定は ★自分のアドレス(location.hostname)だけ★（中の設定を信じない）
//     ③色は ★ダイコメの帯と同じ #c0392b★（他アプリの色を持ってこない）
//     ④★帯の中のボタンは 実際に押せる★
//       帯は pointer-events:none（下の画面を押せるように）なので、
//       中の <a> で auto に戻していないと ★DOMに在るのに永久に押せない★。
//       ＝2026-08-21 にメーターで実際に踏んだ穴。ここでも同じ事をしない。
// ============================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

describe("★テスト用の帯★", () => {
  it("①帯が在る（body のすぐ後ろ＝どの画面でも最初に見える）", () => {
    const body = HTML.indexOf("<body");
    const band = HTML.indexOf('id="testBand"');
    expect(band, "★帯が無い（本番と見分けが付かない）★").toBeGreaterThan(-1);
    expect(band).toBeGreaterThan(body);
    expect(band - body, "★帯が body から離れすぎ（別の物が先に出る）★").toBeLessThan(600);
    expect(HTML).toContain("テスト用（本番ではありません）");
  });

  it("②既定は出さない＝-test のアドレスの時だけ出す（本番では1ドットも変わらない）", () => {
    const i = HTML.indexOf('id="testBand"');
    const band = HTML.slice(i, i + 1400);
    expect(band, "★既定で出てしまう（本番にも出る）★").toMatch(/display:\s*none/);
    // 出す判定は「自分のアドレス」だけで行う
    expect(HTML, "★アドレスで判定していない★").toMatch(/location\.hostname/);
    expect(HTML, "★-test の判定が無い★").toMatch(/-test/);
  });

  // ★2026-08-25 指示役★
  //   「★本番のホスト名で 帯が出ない事★を、判定の関数に 本番ホスト名を実際に食わせて ★数で★」
  //   ＝「-test を見ている」ではなく ★本物のアドレスを入れて 出る/出ない を数える★。
  //   （字を読むだけの見張りは、判定を書き換えた日に 嘘をつく）
  it("★本番のアドレスを入れると 1つも出ない★（数で見る）", () => {
    // 画面の中の 判定そのものを 取り出して動かす
    const m = HTML.match(/var h = \(location\.hostname[\s\S]{0,120}?if \(([^\n]*)\) return;/);
    expect(m, "★出す/出さないの判定が見つからない★").toBeTruthy();
    // 「この形なら 帰る（＝出さない）」を そのまま関数にする
    const shouldHide = new Function("h", "return (" + m[1] + ");");
    const show = (host) => !shouldHide(String(host).toLowerCase());

    const 本番 = ["daikou-seikyu.vercel.app", "daikou-seikyu.com", "www.daikou-seikyu.vercel.app"];
    const テスト = ["daikou-seikyu-test.vercel.app", "daikou-seikyu-test"];

    const 出た本番 = 本番.filter(show);
    expect(
      出た本番,
      `★本番のアドレス ${出た本番.length} 件で 帯が出ます★ ` + 出た本番.join(" / ")
    ).toEqual([]);

    const 出たテスト = テスト.filter(show);
    expect(
      出たテスト.length,
      `★テストのアドレスで 帯が出ません（${テスト.length} 件中 ${出たテスト.length} 件）★`
    ).toBe(テスト.length);
  });

  it("③色は ダイコメの帯と同じ #c0392b", () => {
    const i = HTML.indexOf('id="testBand"');
    const band = HTML.slice(i, i + 1400);
    expect(band, "★ダイコメの帯の色ではない★").toContain("#c0392b");
  });

  it("★④帯の中のボタンは 実際に押せる（pointer-events を auto に戻している）★", () => {
    const i = HTML.indexOf('id="testBand"');
    const band = HTML.slice(i, i + 2200);
    expect(band, "★帯が pointer-events:none ではない（作りが変わった）★").toMatch(
      /pointer-events:\s*none/
    );
    const a = band.slice(band.indexOf("https://daikou-seikyu.vercel.app"));
    const style = a.slice(0, a.indexOf("</a"));
    expect(style, "★「本番を開く」が押せない（帯の pointer-events:none のまま）★").toMatch(
      /pointer-events:\s*auto/
    );
  });

  it("⑤本番へ戻る先が 本番のアドレス（-test を指していない）", () => {
    const i = HTML.indexOf('id="testBand"');
    const band = HTML.slice(i, i + 2200);
    expect(band).toContain("https://daikou-seikyu.vercel.app/daikou-seikyu.html");
    expect(band, "★本番を開くボタンが テスト側を指している★").not.toContain(
      "daikou-seikyu-test.vercel.app"
    );
  });
});
