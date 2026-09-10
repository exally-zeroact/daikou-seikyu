// @vitest-environment node
// ============================================================
// ★知らせの 箱を 濃い色で 塗らない★ 2026-09-10
//
//   ★司さんの言葉（電話の 絵つき）★
//     「全アプリで こんな 濃い色 使うなって 言うてなかったか？」
//     「色が 濃いすぎるし ★背景ボックスの 使い方★が 悪くないか？」
//     直した 形を 見て →「★絶対 これが ええ★」
//     ⇒「Exally や 他の アプリで ★前みたいな 重たい感じに なってる所★ あったら ★先に 直せ★」
//
//   ★ここで 守る 事★
//     ★お客さんの 画面に かぶせる 知らせは ★白地★★（濃い色は ★左の 帯★だけ）
//     ⇒★色を 禁じて いません＝★大きく 塗る のを 禁じて います★★
//
//   ★実測（Exally の 同じ 箱で ★絵を 撮って 点を 数えた★）★
//     箱の 中 330×148 の うち 暗い 点 … ★88% → 6%★（★14.8分の1★）
//     手本＝exally book.html の #toast（PR #64）
//
//   ★★見て いない 範囲（★書かない 見張りは「全部 守った」と 読まれる★）★★
//     ・★ボタン・選ばれている タブは 見て いません★（小さい）
//     ・★紙（請求書）は 1色も 触って いません★＝この 見張りも 見ません
//     ・★この repo で 知らせが 在るのは daikou-seikyu.html だけ★（★数えて 書いた★）
//
//   ★色は 文字で 探さず 値に 直す★＝この repo に 既に 在る tests/color-value.js を 使う
//     （自分で 色の 読み方を 書き直さない＝2通りの 読み方が できると 必ず ずれる）
// ============================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { colorsIn } from "./color-value.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ★この repo で 知らせの 規則を 持つ ファイル（★数えて 書いた★）★ */
const MIRU = ["daikou-seikyu.html"];

/* ══ ★免除（★理由つきで 名指し★／黙って 見逃さない）★ ══
   ★見張りは 知らせの ★箱★ を 見ます。箱の 中の ★押す物★ は 別の 話です。
   ⇒ 実Excel も ボタンは 塗ります／小さい／字は その 上に 載る
   ⇒★ただし 黙って 飛ばしません＝下で 名前を 出します★ */
const MENJO = [
  {
    ha: (name) => /btn|button/i.test(name),
    wake:
      "★箱の 中の 押す物（ボタン）★＝知らせの 箱では ない。" +
      "実Excel も ボタンは 塗る／小さい。" +
      "★2026-09-10 箱を 白地に した時 ボタンは 白→青地に 直して 在る★" +
      "（白地の 上の 白い ボタンは 消えるから）",
  },
];
function menjoKa(name) {
  return MENJO.find((m) => m.ha(name)) || null;
}

function akarusa(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/* ★知らせの 規則（#toast / .toast で 始まる 物）を 集める★ */
function toastRules(text) {
  const out = [];
  const re = /(^|[\s}])((?:#toast|\.toast)[^{}]{0,60})\{([^{}]{0,900})\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[2].trim(), body: m[3] });
  }
  return out;
}

function nuriIro(body) {
  const m = /background(?:-color)?\s*:\s*([^;}]+)/.exec(body);
  if (!m) return null;
  const v = m[1];
  /* ★薄い 覆い（alpha 0.5 未満）は 別の 話＝狼少年に しない★ */
  const a = /rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)/.exec(v);
  if (a && parseFloat(a[1]) < 0.5) return null;
  const c = colorsIn(v);
  return c.length ? c[0] : null;
}

const FILES = MIRU.map((f) => {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) throw new Error("★見る はずの " + f + " が 無い★");
  return { name: f, text: fs.readFileSync(p, "utf-8") };
});

describe("★知らせの 箱を 濃い色で 塗らない★", () => {
  it("★知らせの 箱を 見つけて いる（★空振りして いない★）★", () => {
    const n = FILES.reduce((s, f) => s + toastRules(f.text).length, 0);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it("★★知らせの 箱を 濃い色で 塗って いない（★これが 本体★）★★", () => {
    const warui = [];
    const menjoshita = [];
    for (const f of FILES) {
      for (const r of toastRules(f.text)) {
        const men = menjoKa(r.name);
        if (men) {
          menjoshita.push(f.name + " " + r.name);
          continue;
        }
        const hex = nuriIro(r.body);
        if (!hex) continue;
        if (akarusa(hex) < 170) warui.push(f.name + " " + r.name + " → #" + hex);
      }
    }
    /* ★免除した 物を 黙らせない＝名前を 出す★ */
    if (menjoshita.length) console.log("      ★免除（理由つき）★ " + menjoshita.join(" / "));
    expect(warui, "★濃い色で 塗って いる★ ⇒ 白地に して 濃い色は 左の 帯だけに").toEqual([]);
  });

  it("★★塗りを 持つ 知らせは 左の 帯も 持つ（★色を 消した わけでは ない★）★★", () => {
    /* ★数を 焼き込みません★＝「◯か所」では なく ★塗りと 帯が 対★かを 見る */
    const warui = [];
    let obi = 0;
    for (const f of FILES) {
      for (const r of toastRules(f.text)) {
        if (menjoKa(r.name)) continue;
        if (!/background(?:-color)?\s*:/.test(r.body)) continue;
        const b = /border-left\s*:\s*(\d+)px\s+solid\s+([^;}]+)/.exec(r.body);
        if (!b) {
          warui.push(f.name + " " + r.name + " ★帯が 無い★");
          continue;
        }
        if (Number(b[1]) > 8) {
          warui.push(f.name + " ★帯が 太すぎる " + b[1] + "px★");
          continue;
        }
        if (!colorsIn(b[2]).length) {
          warui.push(f.name + " 帯の 色が 読めない");
          continue;
        }
        obi++;
      }
    }
    expect(warui).toEqual([]);
    expect(obi, "★帯が 1つも 無い＝色が 消えて しまって いる★").toBeGreaterThanOrEqual(1);
  });

  it("★白地に 薄い 字を 置いて いない（★読めなく なって いない★）★", () => {
    const warui = [];
    for (const f of FILES) {
      for (const r of toastRules(f.text)) {
        const bg = nuriIro(r.body);
        const cm = /(?:^|[;\s])color\s*:\s*([^;}]+)/.exec(r.body);
        if (!bg || !cm) continue;
        const fg = colorsIn(cm[1])[0];
        if (!fg) continue;
        if (akarusa(bg) > 200 && akarusa(fg) > 200) warui.push(f.name + " " + r.name);
      }
    }
    expect(warui).toEqual([]);
  });

  it("★免除は 全部 理由つき（★黙って 見逃さない★）★", () => {
    expect(MENJO.length).toBeGreaterThanOrEqual(1);
    for (const m of MENJO)
      expect(m.wake && m.wake.trim().length, "★理由が 無い 免除★").toBeGreaterThan(20);
  });

  it("★★免除に 逃げて いない（箱そのものは 免除に しない）★★", () => {
    expect(menjoKa(".toast"), "★箱そのものを 免除に して いる★").toBe(null);
    expect(menjoKa("#toast"), "★箱そのものを 免除に して いる★").toBe(null);
    expect(menjoKa(".toast-undo"), "★箱そのものを 免除に して いる★").toBe(null);
    expect(menjoKa(".toast-undo-btn"), "★ボタンが 免除に なって いない★").not.toBe(null);
  });

  /* ══ ★わざと 壊して 赤に なるか（★壊すのは 写し★＝ファイルは 1バイトも 触らない）★ ══ */
  const hantei = (text) =>
    toastRules(text).some((r) => {
      const hex = nuriIro(r.body);
      return hex !== null && akarusa(hex) < 170;
    });

  it("★★前の 塗り（#0a5fd0）に 戻すと 赤に なる★★", () => {
    const utsushi = FILES[0].text.replace("background: #ffffff;", "background: #0a5fd0;");
    expect(utsushi, "★写しを 壊せて いない＝この 試験は 何も 見て いない★").not.toBe(FILES[0].text);
    expect(hantei(utsushi)).toBe(true);
  });

  it("★★薄い 覆い（alpha 0.4）は 赤に しない（★狼少年に しない★）★★", () => {
    expect(hantei(".toast{position:fixed;background:rgba(0,0,0,0.4);color:#fff;}")).toBe(false);
  });

  it("★★色を 文字で 探して いない（値に 直して いる）★★", () => {
    for (const kakikata of ["#0a5fd0", "rgb(10,95,208)", "rgba(10, 95, 208, 0.94)", "#0A5FD0"]) {
      expect(
        hantei(".toast{position:fixed;background:" + kakikata + ";color:#fff;}"),
        "★" + kakikata + " を 見落とした★"
      ).toBe(true);
    }
  });
});
