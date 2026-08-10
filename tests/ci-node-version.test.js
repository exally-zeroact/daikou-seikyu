// @vitest-environment node
// ============================================================
// ★CIのNodeの版が 道具の要求を満たしているか★ 2026-08-10
//
//   ★踏んだ事★
//     CI が ずっと赤だった。しかも手元では緑。
//     原因は ★手元 Node 24 / CI Node 20★ で、jsdom@30 が Node 20 を切っていたこと。
//     Node 20 では undici が webidl.util.markAsUncloneable を呼べず、
//     jsdom を使う試験の worker が ★起動すらしない★（試験が落ちるのではなく走らない）。
//     ＝「手元が緑」は CI の証拠にならない、の一番きつい形。
//
//   ★この見張りがする事★
//     .github/workflows/ci.yml に書いてある Node の版が、
//     node_modules の道具が engines で要求する版を満たしているか を突き合わせる。
//     どちらかを上げ下げした時に ★食い違ったら赤★ になる。
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// engines を満たす最小のメジャー版を求める（"^22.22.2 || ^24.15.0 || >=26.0.0" 形式）
export function allowedMajors(range) {
  const out = new Set();
  for (const part of String(range).split("||")) {
    const m = part.trim().match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) continue;
    out.add(Number(m[1]));
  }
  return [...out].sort((a, b) => a - b);
}

// "^22.22.2" のような節ごとに「そのメジャーでの最低 minor.patch」を返す
export function minFor(range, major) {
  for (const part of String(range).split("||")) {
    const m = part.trim().match(/(\d+)\.(\d+)\.(\d+)/);
    if (m && Number(m[1]) === major) return part.trim();
  }
  return null;
}

const ci = fs.readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
const ciNode = Number((ci.match(/^\s*node-version:\s*"?(\d+)/m) || [])[1]);

// jsdom は「入れているだけ」では無く、vitest の jsdom 環境で実際に使う（login-brand.test.js）
const JSDOM = JSON.parse(
  fs.readFileSync(path.join(ROOT, "node_modules/jsdom/package.json"), "utf8")
);

describe("★CIのNodeの版★", () => {
  it("ci.yml から Node の版が読めている", () => {
    expect(Number.isInteger(ciNode), "ci.yml に node-version が無い").toBe(true);
    expect(ciNode).toBeGreaterThan(0);
  });

  it("jsdom が engines を宣言している（読めなければ この見張りは無意味）", () => {
    expect(JSDOM.engines && JSDOM.engines.node, "jsdom の engines が読めない").toBeTruthy();
  });

  it("★CIのNodeが jsdom の要求を満たしている★（満たさないと試験が走らずCIだけ赤）", () => {
    const majors = allowedMajors(JSDOM.engines.node);
    expect(majors.length, "engines が読めない: " + JSDOM.engines.node).toBeGreaterThan(0);
    expect(
      majors.includes(ciNode),
      `★CIのNode ${ciNode} は jsdom@${JSDOM.version} の要求 "${JSDOM.engines.node}" を満たしていない★\n` +
        `  使える版: ${majors.join(" / ")}\n` +
        "  ci.yml の node-version を直すか、jsdom を下げること。"
    ).toBe(true);
  });

  it("★手元のNodeも同じ要求を満たしている★（満たさないと逆に手元だけ赤になる）", () => {
    const majors = allowedMajors(JSDOM.engines.node);
    const here = Number(process.versions.node.split(".")[0]);
    expect(
      majors.includes(here),
      `手元の Node ${process.versions.node} は jsdom の要求 "${JSDOM.engines.node}" 外`
    ).toBe(true);
  });

  it("読み取りが本物か（わざと違う版を入れたら弾く）", () => {
    const majors = allowedMajors("^22.22.2 || ^24.15.0 || >=26.0.0");
    expect(majors).toEqual([22, 24, 26]);
    expect(majors.includes(20)).toBe(false);
    expect(minFor("^22.22.2 || ^24.15.0", 22)).toBe("^22.22.2");
  });
});
