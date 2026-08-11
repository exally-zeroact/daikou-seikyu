// @vitest-environment node
// ============================================================
// ★配信物が「無いファイル」を読んでいないか★ 2026-08-11
//
//   ★踏んだ事★
//     設定▸テンプレートのサンプル画像が ★5枚とも404★ だった（司さんの実機で発覚）。
//       <img src="tpl_ + design + _ + key + .png">   ← repo に tpl_* は0件
//     元は「その場で描くSVG」だったのが .png のファイル読みに変わり、
//     ★ファイルが作られないまま残った★。画面は壊れず「?」が出るだけなので誰も気づかない。
//
//   ★この見張りがする事★
//     配信するHTMLの中で、★決め打ちの相対パス★を読んでいる所を全部拾い、
//     そのファイルが repo に在るかを数える。1本でも無ければ赤。
//     （data: と http(s): と、変数で組み立てる物は対象外＝ここでは判定できないので別に見る）
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

// ★JSが文字を足して組み立てる物も拾う★
//   '<img class="tpl-thumb" src="tpl_' + design + "_" + v.key + '.png"'
//   のような書き方は、src=" の後ろが ★閉じ引用符より先に + で切れる★ のが目印。
export function assetRefs(html) {
  const out = [];
  const line = (i) => html.slice(0, i).split("\n").length;

  // ① 普通の書き方  src="logo.png"
  //    ★JSの文字列の中では src=" の後に ' が来て切れる★ ので、' を含む物はここでは拾わない
  let m;
  const RE = /\bsrc\s*=\s*"([^"'<>]*)"/g;
  while ((m = RE.exec(html))) {
    const v = m[1].trim();
    if (!v || /^(data:|https?:|\/\/|#)/i.test(v)) continue;
    out.push({ raw: v, kumitate: false, at: line(m.index) });
  }

  // ② JSが足して組み立てる書き方  '<img src="tpl_' + design + ".png"'
  //    src=" の後ろが ★JS文字列の終わり(') と + ★ で切れるのが目印
  const RE2 = /\bsrc="([^"'<>]*)'\s*\+/g;
  while ((m = RE2.exec(html))) {
    const v = m[1].trim();
    if (!v || /^(data:|https?:|\/\/|#)/i.test(v)) continue; // 空＝変数だけ（実行時に data: が入る）
    out.push({ raw: v, kumitate: true, at: line(m.index) });
  }
  return out;
}

const REFS = assetRefs(HTML);

describe("★無いファイルを読んでいないか★", () => {
  it("読み取りが本物か（わざと書いたら拾う）", () => {
    // ★実物と同じ書き方★ JSの文字列の中に <img src="tpl_ が在り、' + で切れる
    const a = assetRefs('x = \'<img class="t" src="tpl_\' + design + ".png" />\';');
    expect(
      a.some((x) => x.kumitate && x.raw === "tpl_"),
      "組み立て式を拾えない: " + JSON.stringify(a)
    ).toBe(true);

    const b = assetRefs('<img src="logo.png">');
    expect(
      b.some((x) => x.raw === "logo.png"),
      "普通の src を拾えない"
    ).toBe(true);

    // data: と http: と「変数だけ」は対象外
    expect(assetRefs('<img src="data:image/png;base64,AAA">')).toEqual([]);
    expect(assetRefs('<img src="https://x/y.png">')).toEqual([]);
    expect(assetRefs("y = '<img src=\"' + s.logo + '\">';")).toEqual([]);
  });

  it("★決め打ちのファイルは repo に在る★", () => {
    const miss = REFS.filter((r) => !r.kumitate).filter(
      (r) => !fs.existsSync(path.join(ROOT, r.raw.split("?")[0]))
    );
    expect(
      miss,
      "★無いファイルを読んでいる:\n  " + miss.map((r) => r.at + "行目 " + r.raw).join("\n  ")
    ).toEqual([]);
  });

  // ★組み立て式は「その頭で始まるファイルが1つでも在るか」で見る★
  //   tpl_ で始まるファイルが repo に0件なら、何を足しても必ず404になる。
  it("★組み立てて読むファイルも 頭で1つは在る★", () => {
    const all = fs.readdirSync(ROOT);
    const miss = REFS.filter((r) => r.kumitate && r.raw).filter(
      (r) => !all.some((f) => f.startsWith(r.raw))
    );
    expect(
      miss,
      "★どう組み立てても必ず404になる:\n  " +
        miss.map((r) => r.at + '行目 src="' + r.raw + '"+…').join("\n  ")
    ).toEqual([]);
  });
});
