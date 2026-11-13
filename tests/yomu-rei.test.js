"use strict";
// ============================================================
// ★設定画面の「読み方」（yomuRei＝客が 自分の AI に 貼る 説明）が 口の 本当の 表と 揃う★ 2026-11-13
//   件B（minyukin）の 本番前 taiketsu 任意1：見本の hyo の 並びに minyukin が 無かった。
//   ・lib/yomu-kuchi.js の HYO の 名が 全部「名（」の 形で 見本に 出る（表を 足したら 見本も 足す）
//   ・未入金・残額は minyukin で 読む／seikyu から nyukin を 引かない（api/mcp.js の MINYUKIN_CHUI と 同じ 向き）
//   ・kaisha=（完全一致）と 明細の YYYY-MM-DD が 書いてある（api/yomu.js が 受ける 物）
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const YK = require("../lib/yomu-kuchi.js");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

// html から 関数を 1つ 字の まま 取る（{ } の 数で 終わりを 見る）＝tests/nyukin-ate.test.js と 同じ
function toru(src, mae) {
  const a = src.indexOf(mae);
  if (a < 0) throw new Error("見つからない：" + mae);
  let d = 0;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(a, i + 1);
  }
  throw new Error("閉じない：" + mae);
}

const yomuRei = new Function("location", toru(HTML, "function yomuRei(") + "\nreturn yomuRei;")({
  origin: "https://rei.example",
});

describe("設定画面の 読み方（yomuRei）", () => {
  const t = yomuRei("KAGI-1");

  it("口の 表の 名が 全部 出る（HYO と 同じ 数）", () => {
    expect(YK.HYO.length).toBe(5);
    // 「minyukin（」が「nyukin（」を含むので、前の区切り（＝ か ／）まで見る（本番前 taiketsu 任意1）
    for (const h of YK.HYO) expect(t).toMatch(new RegExp("[＝／]" + h + "（"));
  });

  it("未入金・残額は minyukin で 読み、引き算しない", () => {
    expect(t).toMatch(/残額は minyukin で読む/);
    expect(t).toMatch(/nyukin を引かない/);
  });

  it("kaisha= と 明細の 日付の 絞り が 書いてある", () => {
    expect(t).toContain("kaisha=会社名（完全一致）");
    expect(t).toContain("YYYY-MM-DD");
  });

  it("鍵と 口の 道が 入る", () => {
    expect(t).toContain("Bearer KAGI-1");
    expect(t).toContain("https://rei.example/api/yomu");
    expect(yomuRei(null)).toContain("Bearer （鍵）");
  });
});
