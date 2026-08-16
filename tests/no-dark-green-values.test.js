// @vitest-environment node
// ============================================================
// ★使わないと決めた濃い緑 #1A4A2E が「値として」残っていないか★ 2026-08-10
//
//   ★なぜ作り直したか★
//     今までの見張りは ★文字列 "#1A4A2E" を探すだけ★ だった。
//     ところが実際に残っていたのは、どちらも ★"#" が付かない書き方★ で、
//     見張りは緑のまま素通りしていた:
//
//       daikou-seikyu.html : var C_TEXT = { rgb: "1A4A2E" }   ← SheetJSは # を書かない
//       invoice-pdf.js     : TEXT = rgb(0.102, 0.29, 0.18)    ← pdf-libは 0〜1 の小数
//
//     しかも どちらも注釈には「#2E7D54」と書いてあった＝★中身と説明が食い違っていた★。
//     ＝「探す文字列」を見張るのではなく、★色の値に直してから比べる★ 必要がある。
//
//   ★この見張りが見る4つの書き方★
//     ① #1A4A2E            (よくある書き方)
//     ② "1A4A2E"           (# 無しの6桁。SheetJS の { rgb: "..." })
//     ③ rgb(26,74,46)      (0〜255)
//     ④ rgb(0.102,.29,.18) (0〜1の小数。pdf-lib)
//
//   ★自分自身を疑う★
//     4つの書き方それぞれについて「わざと書いたら捕まえるか」を下で試している。
//     ここが緑のまま通るなら、この見張りは何も見ていない。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { colorsIn as sharedColorsIn, OFFICE_BLUE, PAPER_INK } from "./color-value.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const BAD = "1A4A2E"; // 使わないと決めた濃い緑
const GOOD = "2E7D54"; // 代わりに使う緑

// ---- 見ないファイル（理由つき。理由を書けない除外は作らない） ----
const SKIP_FILES = {
  "tests/no-dark-green-values.test.js": "この見張り自身（探す色を持っている）",
  "tests/app-daikome-blue.test.js": "見張り（探す色を持っている）",
  "tests/login-brand.test.js": "見張り（探す色を持っている）",
  "docs/exally-login-kyually.patch": "記録（消した行に当時の色が残る）",
  "xlsx.full.min.js": "他所の道具（SheetJS本体）",
};
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  ".vercel",
  "vendor", // 他所の道具
  "test-results",
  "playwright-report",
]);
const EXT = new Set([".js", ".mjs", ".css", ".html", ".json", ".md", ".yml", ".yaml"]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (EXT.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

// ---- 値に直す ----
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// 0〜1 の小数なら 255倍、0〜255 の整数ならそのまま。それ以外は色ではない。
function chan(raw) {
  const v = Number(raw);
  if (!isFinite(v) || v < 0) return null;
  if (/^\s*[01]?\.\d+\s*$/.test(raw) || raw.trim() === "0" || raw.trim() === "1") {
    return v <= 1 ? Math.round(v * 255) : null; // 0〜1の小数（pdf-lib）
  }
  return Number.isInteger(v) && v <= 255 ? v : null; // 0〜255
}

// 1行の中にある「色として読める物」を全部 6桁HEX にして返す
export function colorsIn(line) {
  const out = [];
  // ①② 6桁HEX（# は在っても無くてもよい）。前後が16進の続きなら色ではない。
  for (const m of line.matchAll(/(^|[^0-9A-Fa-f#])#?([0-9A-Fa-f]{6})(?![0-9A-Fa-f])/g)) {
    out.push(m[2].toUpperCase());
  }
  // ③④ rgb()/rgba()
  for (const m of line.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*[,)]/g)) {
    const c = [chan(m[1]), chan(m[2]), chan(m[3])];
    if (c.every((v) => v !== null)) out.push(c.map(hex2).join(""));
  }
  return out;
}

// ---- 実際に repo を数える ----
function findBad() {
  const hits = [];
  for (const abs of walk(ROOT, [])) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (SKIP_FILES[rel]) continue;
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    lines.forEach((L, i) => {
      if (colorsIn(L).includes(BAD)) hits.push(rel + ":" + (i + 1) + "  " + L.trim().slice(0, 90));
    });
  }
  return hits;
}

describe("★見張りが本当に見えているか（先に自分を疑う）★", () => {
  it("① #1A4A2E を捕まえる", () => {
    expect(colorsIn("color: #1A4A2E;")).toContain(BAD);
    expect(colorsIn("color: #1a4a2e;")).toContain(BAD);
  });

  it("② ★# の付かない 1A4A2E を捕まえる（SheetJS の rgb:）★", () => {
    expect(colorsIn('var C_TEXT = { rgb: "1A4A2E" };')).toContain(BAD);
  });

  it("③ rgb(26,74,46) / rgba(26,74,46,.5) を捕まえる", () => {
    expect(colorsIn("color: rgb( 26 , 74 , 46 );")).toContain(BAD);
    expect(colorsIn("color: rgba(26,74,46,.5);")).toContain(BAD);
  });

  it("④ ★0〜1の小数 rgb(0.102,0.29,0.18) を捕まえる（pdf-lib）★", () => {
    expect(colorsIn("TEXT = rgb(0.102, 0.29, 0.18);")).toContain(BAD);
  });

  it("使ってよい緑 #2E7D54 は捕まえない", () => {
    expect(colorsIn('{ rgb: "2E7D54" }')).not.toContain(BAD);
    expect(colorsIn("rgb(0.18, 0.49, 0.329)")).toEqual([GOOD]);
  });

  it("色でない6桁（sha・idなど）を色と読み違えない", () => {
    expect(colorsIn("commit 1a4a2e9f0011")).toEqual([]);
    expect(colorsIn("rgb(300, 74, 46)")).toEqual([]);
  });

  // ★2026-08-11 指示役の見張りが ここで誤報を出した★
  //   登録番号「例 T1234567890123」の中の 789012 を ★緑★ と読んで報告しかけた。
  //   ＝登録番号を画面に足した副作用。こちらの数え方に同じ穴が無いかを固定する。
  //   （6桁の前後が16進なら色ではない、という判定で弾けている）
  it("★登録番号(T+13桁)を色と読み違えない★", () => {
    for (const t of [
      "登録番号：T3500003003293",
      "例 T1234567890123",
      "T＋13桁（例 T1234567890123）を入れると出せます",
      "invoice_no T9876543210987",
    ]) {
      expect(colorsIn(t), "★登録番号を色と読んでいる: " + t).toEqual([]);
    }
  });

  it("★共有の実装(color-value.js)と同じ答えになる★（実装が2つに割れない）", () => {
    for (const L of ['{ rgb: "1A4A2E" }', "rgb(0.102,0.29,0.18)", "#1a4a2e", "rgb(26,74,46)"]) {
      expect(sharedColorsIn(L), L).toEqual(colorsIn(L));
    }
  });

  it("読んでいるファイルが数十本ある（0本なら何も見ていない）", () => {
    expect(walk(ROOT, []).length).toBeGreaterThan(20);
  });
});

describe("★repo に濃い緑 #1A4A2E が値として残っていない★", () => {
  it("Excelに書き出す本文色（daikou-seikyu.html の C_TEXT）が 固定の濃い墨", () => {
    const html = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");
    const m = html.match(/var C_TEXT\s*=\s*\{\s*rgb:\s*"([0-9A-Fa-f]{6})"/);
    expect(m, "C_TEXT が見つからない").toBeTruthy();
    // ★2026-08-15 指示役：紙の文字は「全体の色」から作らない。#1A1A1A に固定★
    //   （2026-08-10 は事務所の青にしていた＝全体の色を変えたら本文まで動く作りだった）
    expect(m[1].toUpperCase(), "★お客さんに渡すExcelの本文が固定の濃さではない★").toBe(
      PAPER_INK.ink
    );
  });

  it("PDFに刷る本文色（invoice-pdf.js の TEXT）が 固定の濃い墨", () => {
    const js = fs.readFileSync(path.join(ROOT, "invoice-pdf.js"), "utf8");
    // ★色は名前つきの定数から作る★ ので、定数の中身まで引く
    const m = js.match(/\bTEXT\s*=\s*hexRgb\(rgb,\s*([A-Za-z_][A-Za-z0-9_]*)\)/);
    expect(m, "TEXT が見つからない").toBeTruthy();
    const d = js.match(new RegExp("\\b" + m[1] + '\\s*=\\s*"#([0-9A-Fa-f]{6})"'));
    expect(d, "TEXT が指している定数の値が読めない").toBeTruthy();
    expect(d[1].toUpperCase(), "★お客さんに渡すPDFの本文が固定の濃さではない★").toBe(PAPER_INK.ink);
  });

  it("★どのファイルにも1件も無い（指示書・docs も含む）★", () => {
    const hits = findBad();
    expect(hits, "★濃い緑が残っている:\n  " + hits.join("\n  ")).toEqual([]);
  });
});
