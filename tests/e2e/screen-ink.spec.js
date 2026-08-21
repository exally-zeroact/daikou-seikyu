import { test, expect } from "@playwright/test";
import { STOPS, boot } from "./stops.js";

// ============================================================
// ★画面の文字は「薄い黒」★（司さん 2026-08-15「全てやけど文字は薄い黒にせな見にくい」）
//
//   ★直す前に実機の画面から数えた姿（2026-08-15）★
//     body の文字色が ★#0A5FD0（青）★ ＝ 画面じゅうの文字が青を受け継いでいた
//     金額 ¥1,200 … ★#0B57D0（リンクと同じ青）★
//     行き先 今治市喜田村 … ★#0A5FD0★／会社名 株式会社 生野組 … ★#5A6B82（一番 薄い）★
//     ＝ ★押せる物と 読むだけの物が 同じ青★／★探す物が 一番 薄い★
//
//   ★決まり★
//     本文・値・金額 … ★#333333（薄い黒）★  ラベル・副 … #555555 / #666666
//     ★色を付けてよいのは「押せる物」と「選ばれている物」だけ★
//
//   ★2026-08-18 この見張りの穴を塞いだ★
//     08-16版は ★6画面のうち4画面（入力/一覧/請求-請求書/設定-会社マスタ）しか開いていなかった★。
//     ＝ 入金・編集・請求(集計)・設定(自社情報/テンプレート) を ★1回も見ずに緑★ だった。
//     実測すると ★押せないのに青い字が 24個★ 残っていた（集計12・入金6・テンプレ5・自社情報1）。
//     ⇒ ★開く物を下の STOPS に「一覧」として書く★。押した数ではなく、押す物の名前を先に並べる。
//
//   ★ここで測るのは「描き終わった画面の色」★（ソースの文字列を grep しない）
//   ★幅 375 / 390 / 412 の3つで実測する★
//
//   ★まだ開いていない所（＝この見張りが見ていない所。増やす時はここへ足す）★
//     ・トースト（保存後に出る帯）／削除の確認モーダル
//     ・書体ポップ（itb-font）・編集タブの各チップを開いた中身
// ============================================================

test.setTimeout(240000);

// 押せる/選ばれている物にだけ許す青（事務所の青）
const BLUE = ["#0A5FD0", "#0B57D0", "#007AFF"];
// 読ませる字の濃さ（これより薄い＝読みにくい）。空の時の案内だけ例外。
const INK = "#333333";
// ★2026-08-21 追加：読ませる字に残っていた「薄い青灰」★（指示役が絵を読んで見つけた）
//   本文・値・ラベルは #333333 / #555555 / #666666 のどれか。
//   下の色は ★読む字には使わない★（押せる物・選ばれている物は今までどおり色を付けてよい）
const LIGHT = ["#5A6B82", "#6B7787", "#A9B5C4", "#2F517D", "#4A6B86"];

// 描き終わった画面から「文字とその色」を1つずつ拾う
function grabInk(where) {
  const out = [];
  const hex = (c) => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m
      ? "#" +
          [1, 2, 3]
            .map((i) => Number(m[i]).toString(16).padStart(2, "0"))
            .join("")
            .toUpperCase()
      : c;
  };
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.trim();
        if (!t) continue;
        const p = n.parentElement;
        const r = p.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const s = getComputedStyle(p);
        if (s.visibility === "hidden" || s.display === "none") continue;
        // ★押せる/選ばれている＝その要素自身★（親が押せるだけでは色を付けてよい理由にならない。
        //   一覧の行はまるごと押せるので、親で判定すると 中の金額まで青にできてしまう）
        const cls = (p.className || "").toString();
        const self =
          ["BUTTON", "A", "SELECT", "SUMMARY", "OPTION", "LABEL"].includes(p.tagName) ||
          /(^|[\s-])btn|chip|seg|tab|link|caret|add-line|clear|nav-ic|nav-lb|toggle|sw-/.test(cls);
        const activeNav = !!p.closest(".nav-item.active, .on, [aria-selected='true']");
        out.push({
          scr: where,
          t: t.slice(0, 24),
          col: hex(s.color),
          cls: cls.slice(0, 26),
          tag: p.tagName.toLowerCase(),
          ok: self && (!/nav-ic|nav-lb/.test(cls) || activeNav),
        });
      } else if (n.nodeType === 1) walk(n);
    }
  };
  // ★2026-08-21 場所を当てない★（指示役）
  //   前は「今 出ている画面」だけを選んで数えていたので、
  //   ★ログイン画面が丸ごと 数える範囲から外れていた★。
  //   ⇒ ★body を全部 歩く★（見えている字だけ拾うので、隠れている画面は入らない）
  walk(document.body);
  return out;
}

for (const W of [375, 390, 412])
  test(`★画面の文字が薄い黒・幅${W}★`, async ({ page }) => {
    await boot(page, W);
    await expect(page.locator("#scr-input")).toBeVisible({ timeout: 30000 });

    const found = [];
    const perStop = [];
    for (const s of STOPS) {
      await s.open(page);
      const got = await page.evaluate(grabInk, s.name);
      perStop.push(`${s.name}:${got.length}`);
      found.push(...got);
      if (s.close) await s.close(page);
    }

    // ★開いたのに文字が0個＝見ていない（0本の緑は未検査）★
    const empty = perStop.filter((x) => x.endsWith(":0"));
    expect(empty, "★開いたのに文字が0個の所がある（＝見ていない）: " + empty.join(" ")).toEqual([]);
    expect(found.length, "★文字を1つも見ていない（0本の緑は未検査）★").toBeGreaterThan(200);

    // ① 押せない物に青が付いていたら赤
    const blueOnRead = found.filter((f) => BLUE.includes(f.col) && !f.ok);
    expect(
      blueOnRead,
      "★読むだけの字に 押せる色（青）が付いている:\n  " +
        blueOnRead.map((f) => `${f.scr} ${f.tag}.${f.cls} 「${f.t}」 ${f.col}`).join("\n  ")
    ).toEqual([]);

    // ①-2 読むだけの字に「薄い青灰」が残っていたら赤（2026-08-21）
    const lightOnRead = found.filter((f) => LIGHT.includes(f.col) && !f.ok);
    expect(
      lightOnRead,
      "★読ませる字が薄い青灰のまま（#333/#555/#666 のどれかにする）:\n  " +
        lightOnRead.map((f) => `${f.scr} ${f.tag}.${f.cls} 「${f.t}」 ${f.col}`).join("\n  ")
    ).toEqual([]);

    // ② 金額に青が付いていたら赤（司さんが最初に言った所）
    const money = found.filter((f) => /^[¥￥][\d,]+$/.test(f.t));
    expect(money.length, "★金額を1つも見ていない★").toBeGreaterThan(2);
    const blueMoney = money.filter((f) => BLUE.includes(f.col));
    expect(
      blueMoney,
      "★金額がリンクと同じ青:\n  " + blueMoney.map((f) => `${f.scr} ${f.t} ${f.col}`).join("\n  ")
    ).toEqual([]);

    // ③ 土台（body）が薄い黒か＝ここが青だと 画面じゅうが青を受け継ぐ
    const bodyCol = await page.evaluate(() => {
      const c = getComputedStyle(document.body).color.match(/\d+/g);
      return (
        "#" +
        c
          .slice(0, 3)
          .map((x) => Number(x).toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase()
      );
    });
    expect(bodyCol, "★body の文字色が薄い黒ではない★").toBe(INK);

    const n = {};
    for (const f of found) n[f.col] = (n[f.col] || 0) + 1;
    console.log(
      `[screen-ink] w=${W} 文字${found.length}個 / 開いた所 ${perStop.join(" ")} / ` +
        Object.entries(n)
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => `${c}:${v}`)
          .join(" ")
    );
  });
