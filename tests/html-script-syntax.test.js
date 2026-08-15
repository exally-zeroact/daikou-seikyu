// @vitest-environment node
// ============================================================
// ★HTMLの中のJSが 構文として通るか★ 2026-08-12
//
//   ★踏んだ事★
//     daikou-seikyu.html の中の <script> に ★エスケープ落ちの構文エラー★ を作ってしまい、
//     アプリが ★1行も動かない★状態になった（全ての関数が未定義）。
//     それなのに ★lint も vitest も緑のまま★だった:
//       ・eslint は HTML の中の <script> を見ない
//       ・vitest の試験は HTML を ★文字として読む★だけで、実行しない
//     気づいたのは 実ブラウザで動かした時（"Invalid or unexpected token"）。
//     ＝★「lintとvitestが緑」は HTMLのJSが動く証拠にならない★
//
//   ★この見張りがする事★
//     HTML の中の <script>…</script> を全部 取り出し、★構文として解析できるか★を見る。
//     実ブラウザを立てないので速い＝直した直後に必ず気づける。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// <script>（src= の無い物）の中身を、HTMLでの開始行つきで返す
export function inlineScripts(html) {
  const out = [];
  const RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = RE.exec(html))) {
    out.push({ code: m[1], line: html.slice(0, m.index).split("\n").length });
  }
  return out;
}

// 構文だけ見る（実行はしない）。通れば null、駄目なら理由。
export function syntaxError(code) {
  try {
    new Function(code);
    return null;
  } catch (e) {
    return e.message;
  }
}

const FILES = ["daikou-seikyu.html"];

describe("★HTMLの中のJSが構文として通る★", () => {
  it("見張りが本物か（わざと壊した物を弾く）", () => {
    expect(syntaxError("var a = 1;"), "通る物を弾いている").toBe(null);
    // 実際に作ってしまったのと同じ形（エスケープ落ちで引用符が閉じない）
    expect(syntaxError("var s = '\" onclick=\"f('' + x;"), "壊れた物を通している").not.toBe(null);
    expect(syntaxError("function f( {"), "壊れた物を通している").not.toBe(null);
  });

  it("script を取り出せている（0本なら何も見ていない）", () => {
    const html = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");
    const ss = inlineScripts(html);
    expect(ss.length, "インラインの script が取れていない").toBeGreaterThan(0);
    // 本体は数千行ある
    expect(Math.max(...ss.map((s) => s.code.split("\n").length))).toBeGreaterThan(1000);
  });

  for (const f of FILES) {
    it(`${f} の中の JS が全部 構文OK`, () => {
      const html = fs.readFileSync(path.join(ROOT, f), "utf8");
      const bad = inlineScripts(html)
        .map((s) => ({ line: s.line, err: syntaxError(s.code) }))
        .filter((x) => x.err);
      expect(
        bad.map((x) => `${f} の ${x.line}行目からの <script>: ${x.err}`),
        "★HTMLの中のJSが構文エラー★"
      ).toEqual([]);
    });
  }
});
