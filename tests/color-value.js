// ============================================================
// ★色は「文字」ではなく「値」で比べる★ 2026-08-10
//
//   同じ1色でも、書き方は最低4通りある。1つしか見ない見張りは必ず素通りする。
//     ① #2E7D54            CSS
//     ② "2E7D54"（# 無し）   SheetJS の { rgb: "..." }
//     ③ rgb(46,125,84)     0〜255
//     ④ rgb(0.18,0.49,.33) 0〜1の小数（pdf-lib）
//   実際に ②と④ で、お客さんに渡す Excel と PDF に禁止色が残っていた（注釈だけ正しかった）。
// ============================================================

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, "0");

// 1成分を 0〜255 の整数に。色として読めない物は null。
export function channel(raw) {
  const v = Number(raw);
  if (!isFinite(v) || v < 0) return null;
  const s = String(raw).trim();
  if (/^[01]?\.\d+$/.test(s) || s === "0" || s === "1") {
    return v <= 1 ? Math.round(v * 255) : null; // 0〜1の小数（pdf-lib）
  }
  return Number.isInteger(v) && v <= 255 ? v : null; // 0〜255
}

// 1行の中で「色として読める物」を全部 6桁HEX（大文字・# 無し）にして返す
export function colorsIn(line) {
  const out = [];
  // ★5つ目の書き方：data: URI の中の %23（= URLエンコードされた #）★
  //   2026-08-10、選択欄の▼の色 %233D9E72 が緑のまま残っていたのを見落としかけた。
  //   %23 のままだと「%」の次の 233D9E を色と読み違えるので、先に # に直す。
  line = String(line).replace(/%23([0-9A-Fa-f]{6})\b/g, "#$1");
  // 6桁HEX（# は在っても無くてもよい）。前後が16進の続きなら色ではない＝sha/idを誤検出しない
  for (const m of String(line).matchAll(/(^|[^0-9A-Fa-f#])#?([0-9A-Fa-f]{6})(?![0-9A-Fa-f])/g)) {
    out.push(m[2].toUpperCase());
  }
  for (const m of String(line).matchAll(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*[,)]/g
  )) {
    const c = [channel(m[1]), channel(m[2]), channel(m[3])];
    if (c.every((v) => v !== null)) out.push(c.map(hex2).join(""));
  }
  return out;
}

// ★Exally の緑（指示役が名指しした7色）★ 紙にも画面にも1つも使わない
export const EXALLY_GREEN = ["2E7D54", "52B788", "3D9E72", "7AA08C", "C8ECD8", "D4EAE0", "F0FAF4"];

// ★事務所(dashboard.html)と同じ青★ 紙もこの色にする
export const OFFICE_BLUE = {
  ink: "0A5FD0", // 本文・金額（主役）
  strong: "007AFF", // 見出し・飾り線（強め）
  bg: "F2F7FF", // 地・ヘッダー面
  line: "DBE7F7", // 罫・枠
  muted: "5A6B82", // 弱い字・補助文
};

// 緑がかっているか（7色に無い緑も拾う。#DCEFE6 や rgba(30,80,46) を逃がさないため）
export function looksGreen(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return g > r + 6 && g > b + 4;
}
