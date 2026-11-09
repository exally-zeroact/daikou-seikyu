// @vitest-environment node
// ============================================================
// ★請求書アプリの 画面（daikou-seikyu.html）と 塊・節ごとの 写し（seikyu-src/）を 縛る★ 2026-11-09 ④（手本＝Daikou-app tests/unit/index-tsunagu.test.js 件3）
//
//   ①seikyu-src/ を 繋ぐ ＝ daikou-seikyu.html（バイト 一致）・②seikyu-src ＝ 決まった 所で 割った 物（名・拡張子・目次）
//   ③割る 決まり（塊の 境目・複数行の 開きタグ・src= は html 側・ld+json は .json・読めない 塊は 止める）
//   ④名の 引き継ぎ（手前に 塊を 足しても 後ろの 枚の 名は 変わらない・設計前 taiketsu 注1）
//   ⑤門（--mae / --ato）を 一時の git repo で 走らせる（改行の 無い 枚・BOM の 枚は 止める＝止2・注3）
//   ⑥本番へ 写す（--utsusu-dasu / --utsusu / --utsusu-id・設計前 taiketsu 止1・叩き直し 止1）
//   ★わざと壊して 赤を 見る★
// ============================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { gitKankyo } = require("./lib/kari-git");
const ENV = gitKankyo();
// 一時 repo の git と 本物の html を 何度も 割る＝既定の 5秒では 足りない
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let T;
beforeAll(async () => {
  T = await import("../scripts/seikyu-tsunagu.mjs");
});

function yomuSrc(root) {
  const d = path.join(root, "seikyu-src");
  const names = fs
    .readdirSync(d)
    .filter((n) => /\.(html|css|js|json)$/.test(n))
    .sort();
  return {
    names,
    parts: names.map((n) => fs.readFileSync(path.join(d, n), "utf8")),
    moku: fs.readFileSync(path.join(d, "MOKUJI.md"), "utf8"),
  };
}
const HTML = () => fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

describe("★今の repo の 写し★", () => {
  it("①② 繋ぐと daikou-seikyu.html・割った 物と 同じ・目次も 同じ", () => {
    const html = HTML();
    const s = yomuSrc(ROOT);
    expect(T.tsunagu(s.parts) === html, "★繋いだ 物が daikou-seikyu.html と 違う★").toBe(true);
    expect(
      T.zure(html, s.names, s.parts, s.moku),
      "→ node scripts/seikyu-tsunagu.mjs --modosu"
    ).toEqual([]);
  });

  it("名は 4桁＋中身の 拡張子・番号は 重ならない・塊の 種類が 全部 在る", () => {
    const s = yomuSrc(ROOT);
    // 11-09 測った 数＝72枚（html 17・css 19・js 36・json 0＝請求書に ld+json は 無い）
    expect(s.names.length).toBeGreaterThan(50);
    expect(s.names.every((n) => /^\d{4}\.(html|css|js|json)$/.test(n))).toBe(true);
    expect(new Set(s.names.map((n) => n.slice(0, 4))).size).toBe(s.names.length);
    for (const x of ["html", "css", "js"])
      expect(
        s.names.some((n) => n.endsWith("." + x)),
        x
      ).toBe(true);
  });

  it(".js の 枚は 塊ごとに 繋ぐと acorn で 読める・.json は JSON・.css に タグが 無い", async () => {
    const acorn = await import("acorn");
    const s = yomuSrc(ROOT);
    let buf = "";
    let n = 0;
    const dasu = () => {
      if (buf) {
        acorn.parse(buf, { ecmaVersion: "latest" });
        n++;
      }
      buf = "";
    };
    s.names.forEach((nm, k) => {
      if (nm.endsWith(".js")) buf += s.parts[k];
      else dasu();
      if (nm.endsWith(".json")) JSON.parse(s.parts[k]);
      if (nm.endsWith(".css")) expect(s.parts[k], nm).not.toMatch(/<\/?style/i);
    });
    dasu();
    // 請求書の 中に 書いた script は 2塊（11-09 測った＝帯の 12行・本体の 約1万行）
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("配る 物は 変えない：seikyu-src は 配らない・lint/整形/stylelint しない・門で 揃える", () => {
    // 請求書には .eslintignore・.stylelintignore が 無い（eslint は eslint.config.js の ignores）
    const yomu = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const f of [".vercelignore", ".prettierignore"])
      expect(yomu(f), f).toMatch(/^seikyu-src\/$/m);
    // 道具も 配らない（名指し）
    for (const d of ["scripts/seikyu-tsunagu.mjs", "scripts/gamen-tsunagu.mjs"])
      expect(yomu(".vercelignore"), d).toMatch(new RegExp(`^${d.replace(/\./g, "\\.")}$`, "m"));
    expect(yomu("eslint.config.js")).toMatch(/ignores:\s*\[\s*["']seikyu-src\/\*\*["']/);
    // 作業木でも LF（本番の 作業木は autocrlf＝CRLF に 化けると 道具が 止まる）
    const ga = yomu(".gitattributes");
    expect(ga).toMatch(/^daikou-seikyu\.html text eol=lf$/m);
    expect(ga).toMatch(/^seikyu-src\/\*\* text eol=lf$/m);
    const h = fs.readFileSync(path.join(ROOT, ".husky/pre-commit"), "utf8");
    const i = (s) => h.indexOf(s);
    expect(i("node scripts/seikyu-tsunagu.mjs --mae")).toBeGreaterThan(-1);
    expect(i("node scripts/seikyu-tsunagu.mjs --mae")).toBeLessThan(i("npx lint-staged"));
    expect(i("node scripts/seikyu-tsunagu.mjs --ato")).toBeGreaterThan(i("npx lint-staged"));
  });
});

describe("★割る 決まり★", () => {
  const doc = (body) => `<!doctype html>\n<html>\n  <head>\n${body}  </head>\n</html>\n`;
  it("塊の 境目：開きと 閉じの 行は .html・中身は .css/.js/.json・src= は html 側", () => {
    const html = doc(
      "    <style>\n      a { color: red; }\n    </style>\n" +
        '    <script type="application/ld+json">\n      { "a": 1 }\n    </script>\n' +
        '    <script\n      src="x.js"\n      defer\n    ></script>\n' +
        '    <script src="y.js"></script>\n' +
        "    <script>\n      var a = 1;\n    </script>\n"
    );
    const { parts, exts } = T.wariX(html);
    expect(T.tsunagu(parts)).toBe(html);
    expect(exts).toEqual(["html", "css", "html", "json", "html", "js", "html"]);
    expect(parts[1]).toBe("      a { color: red; }\n");
    expect(parts[4]).toMatch(/src="x\.js"[\s\S]*src="y\.js"[\s\S]*<script>\n$/);
  });
  it("節：<!-- ★・/* ★・// ★★ の 前で 切る（js は 根の 文の 途中では 切らない）", () => {
    const html = doc(
      "    <!-- ★頭 -->\n    <meta a>\n    <!-- ★二 -->\n    <style>\n      /* ★一 */\n      a {}\n      /* ★二 */\n      b {}\n    </style>\n" +
        "    <script>\n      var a = 1;\n      // ★★節★★\n      function f() {\n        // ★★中★★\n      }\n    </script>\n"
    );
    const { parts, exts } = T.wariX(html);
    expect(T.tsunagu(parts)).toBe(html);
    expect(exts).toEqual(["html", "html", "html", "css", "css", "html", "js", "js", "html"]);
    expect(parts[7].startsWith("      // ★★節★★\n      function f()")).toBe(true);
  });
  it("長い 塊は 根の 文の 頭で 切る（NAGAI 行 超え）", () => {
    const fn = (k) => `      function f${k}() {\n${"        x();\n".repeat(98)}      }\n`;
    const naka = Array.from({ length: 8 }, (_, k) => fn(k)).join("");
    const html = doc(`    <script>\n${naka}    </script>\n`);
    const { parts, exts } = T.wariX(html);
    expect(T.tsunagu(parts)).toBe(html);
    const js = parts.filter((_, k) => exts[k] === "js");
    expect(js.length).toBeGreaterThan(1);
    js.forEach((p) => {
      expect(p.split("\n").length - 1).toBeLessThanOrEqual(T.NAGAI);
      expect(p).toMatch(/^ {6}function f\d\(\)/);
    });
  });
  it("壊す：読めない script・ld+json・行の 途中の 塊・閉じない 塊・知らない type・CR・BOM・尻の 改行", () => {
    expect(() => T.wari(doc("    <script>\n      var = ;\n    </script>\n"))).toThrow(/読めない/);
    expect(() =>
      T.wari(doc('    <script type="application/ld+json">\n      {a:1}\n    </script>\n'))
    ).toThrow(/ld\+json/);
    expect(() => T.wari(doc("    <div><script>\n      var a;\n    </script></div>\n"))).toThrow(
      /途中/
    );
    expect(() => T.wari(doc("    <style>\n      a {}\n"))).toThrow(/閉じ/);
    expect(() =>
      T.wari(doc('    <script type="text/x-tmpl">\n      <b>\n    </script>\n'))
    ).toThrow(/知らない/);
    expect(() =>
      T.wari(doc("    <style>\n      a {}\n    </style>\n").replace(/\n/g, "\r\n"))
    ).toThrow(/CR/);
    expect(() => T.wari("﻿" + doc(""))).toThrow(/BOM/);
    expect(() => T.wari(doc("").slice(0, -1))).toThrow(/改行/);
    // 注釈の 中の <script> は よい
    expect(() => T.wari(doc("    <!-- 古い <script> は 消した -->\n"))).not.toThrow();
  });
  it("壊す：写しの 1字・html の 1字で ずれを 出す", () => {
    const html = HTML();
    const s = yomuSrc(ROOT);
    const p2 = s.parts.slice();
    p2[5] = p2[5] + " ";
    expect(T.zure(html, s.names, p2, s.moku).length).toBeGreaterThan(0);
    expect(
      T.zure(html.replace("<head>", "<head >"), s.names, s.parts, s.moku).length
    ).toBeGreaterThan(0);
    // 拡張子が 中身と 違う
    const n2 = s.names.slice();
    const k = n2.findIndex((n) => n.endsWith(".css"));
    n2[k] = n2[k].replace(".css", ".html");
    expect(T.zure(html, n2, s.parts, s.moku).join()).toMatch(/拡張子/);
  });
});

describe("★名の 引き継ぎ★（本物の daikou-seikyu.html で）", () => {
  // 同じ 中身の 枚が 同じ 名の まま か（同じ 中身が 2枚 以上 在る 物＝「</script>」と 空行 だけ 等は どれが 元か 決まらないので 数えない）
  const nokotta = (oldN, oldP, newN, newP) => {
    const m = new Map();
    const kazu = new Map();
    oldP.forEach((p, k) => {
      m.set(p, oldN[k]);
      kazu.set(p, (kazu.get(p) || 0) + 1);
    });
    for (const [p, c] of kazu) if (c > 1) m.delete(p);
    let onaji = 0;
    const chigau = [];
    newP.forEach((p, k) => {
      if (!m.has(p)) return;
      if (m.get(p) === newN[k]) onaji++;
      else chigau.push(`${m.get(p)}→${newN[k]}`);
    });
    return { onaji, chigau };
  };
  it("手前に 塊（script）を 足しても 後ろの 枚の 名は 変わらない", () => {
    const html = HTML();
    const s = yomuSrc(ROOT);
    const L = html.split("\n");
    const at = L.findIndex((l) => /^\s*<\/script>/.test(l)) + 1;
    L.splice(at, 0, "    <script>", "      window.ATARASHII = 1;", "    </script>");
    const h2 = L.join("\n");
    const { parts, exts } = T.wariX(h2);
    const names = T.namae(parts, s.names, s.parts, exts);
    expect(names.furinaoshi).toBeFalsy();
    expect(T.tsunagu(parts)).toBe(h2);
    const r = nokotta(s.names, s.parts, names, parts);
    expect(r.chigau).toEqual([]);
    expect(r.onaji).toBeGreaterThan(s.names.length - 5);
    expect(new Set(names).size).toBe(names.length);
  });
  it("css に 節を 足す・見出しの 無い 枚を 直しても 他の 名は 変わらない", () => {
    const html = HTML();
    const s = yomuSrc(ROOT);
    const L = html.split("\n");
    const st = L.findIndex((l) => /^\s*<style>/.test(l)) + 1;
    L.splice(st, 0, "      /* ★新しい 節 */", "      .atarashii { color: inherit; }");
    // 見出し（// ★★）の 無い 小さい js 枚（テスト線の 帯）を 1字 直す（html に 1か所だけ）
    const MAE = 'el.style.display = "block";';
    expect(html.split(MAE).length - 1).toBe(1);
    const h2 = L.join("\n").replace(MAE, 'el.style.display = "flex";');
    const { parts, exts } = T.wariX(h2);
    const names = T.namae(parts, s.names, s.parts, exts);
    expect(names.furinaoshi).toBeFalsy();
    const r = nokotta(s.names, s.parts, names, parts);
    expect(r.chigau).toEqual([]);
    // 直した 枚は 前の 名の まま（中身の 近さで 当てる＝件3 設計前 taiketsu 注1）
    const moto = s.names[s.parts.findIndex((p) => p.includes(MAE))];
    const k = parts.findIndex((p) => p.includes('"flex"'));
    expect(moto).toMatch(/\.js$/);
    expect(names[k]).toBe(moto);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("★門（--mae / --ato）★ 一時の git repo", () => {
  let R;
  const git = (...a) => execFileSync("git", a, { cwd: R, encoding: "utf8", env: ENV });
  const w = (f, s) => {
    fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true });
    fs.writeFileSync(path.join(R, f), s);
  };
  const r = (f) => fs.readFileSync(path.join(R, f), "utf8");
  const H0 =
    "<!doctype html>\n<html>\n  <head>\n    <style>\n      a { color: red; }\n    </style>\n  </head>\n  <body>\n    <script>\n      var a = 1;\n      // ★★節★★\n      function f() {\n        return a;\n      }\n    </script>\n  </body>\n</html>\n";
  const kakunin = () => {
    const s = yomuSrc(R);
    return T.zure(r("daikou-seikyu.html"), s.names, s.parts, s.moku);
  };
  const edaNo = (re) => yomuSrc(R).names.find((n, k) => re.test(yomuSrc(R).parts[k]));

  beforeEach(() => {
    R = fs.mkdtempSync(path.join(os.tmpdir(), "itsunagu-"));
    git("init", "-q");
    git("config", "user.email", "t@example.invalid");
    git("config", "user.name", "t");
    git("config", "core.autocrlf", "false");
    w("daikou-seikyu.html", H0);
    git("add", "-A");
    expect(T.mae(R, ENV).kekka).toBe("tooru");
    expect(T.ato(R, ENV).kekka).toBe("src-wo-kaita");
    expect(kakunin()).toEqual([]);
    git("commit", "-qm", "hajime");
  });
  afterEach(() => fs.rmSync(R, { recursive: true, force: true }));

  it("写しの .js だけ 直す → 繋いで daikou-seikyu.html を 書く", () => {
    const n = edaNo(/return a;/);
    w(`seikyu-src/${n}`, r(`seikyu-src/${n}`).replace("return a;", "return a + 1;"));
    git("add", "-A");
    expect(T.mae(R, ENV).kekka).toBe("js-wo-kaita");
    expect(T.ato(R, ENV).kekka).toBe("tooru");
    expect(r("daikou-seikyu.html")).toMatch(/return a \+ 1;/);
    expect(git("diff", "--cached", "--name-only")).toMatch(/^daikou-seikyu\.html$/m);
    expect(kakunin()).toEqual([]);
  });

  it("daikou-seikyu.html だけ 直す → 割り直して 写しを 書く", () => {
    w("daikou-seikyu.html", H0.replace("color: red", "color: blue"));
    git("add", "-A");
    expect(T.mae(R, ENV).kekka).toBe("tooru");
    expect(T.ato(R, ENV).kekka).toBe("src-wo-kaita");
    expect(git("diff", "--cached", "--name-only")).toMatch(/seikyu-src\/\d{4}\.css/);
    expect(kakunin()).toEqual([]);
  });

  it("両方 直して ずれる → 止める（どちらも 消さない）", () => {
    const n = edaNo(/return a;/);
    w(`seikyu-src/${n}`, r(`seikyu-src/${n}`).replace("return a;", "return 9;"));
    w("daikou-seikyu.html", H0.replace("color: red", "color: blue"));
    git("add", "-A");
    const m = T.mae(R, ENV);
    expect(m.kekka).toBe("tomeru");
    expect(m.riyuu).toMatch(/両方/);
    expect(r("daikou-seikyu.html")).toMatch(/blue/);
  });

  it("stage していない 直し → 止める", () => {
    const n = edaNo(/return a;/);
    w(`seikyu-src/${n}`, r(`seikyu-src/${n}`).replace("return a;", "return 2;"));
    git("add", "-A");
    w(`seikyu-src/${n}`, r(`seikyu-src/${n}`).replace("return 2;", "return 3;"));
    expect(T.mae(R, ENV).kekka).toBe("tomeru");
  });

  it("壊す：尻に 改行の 無い 枚・BOM の 枚・CR の 枚 → 止める（daikou-seikyu.html は 書かない）", () => {
    const n = edaNo(/return a;/);
    const moto = r(`seikyu-src/${n}`);
    for (const [bad, re] of [
      [moto.slice(0, -1), /改行/],
      ["﻿" + moto, /BOM/],
      [moto.replace(/\n/g, "\r\n"), /CR/],
    ]) {
      w(`seikyu-src/${n}`, bad);
      git("add", "-A");
      const m = T.mae(R, ENV);
      expect(m.kekka).toBe("tomeru");
      expect(m.riyuu).toMatch(re);
      expect(r("daikou-seikyu.html")).toBe(H0);
    }
  });

  it("壊す：読めない script を daikou-seikyu.html に 書く → --ato が 投げる（門は 止める）", () => {
    w("daikou-seikyu.html", H0.replace("return a;", "return a +;"));
    git("add", "-A");
    expect(T.mae(R, ENV).kekka).toBe("tooru");
    expect(() => T.ato(R, ENV)).toThrow(/読めない/);
  });
});

describe("★本番へ 写す（--utsusu-dasu / --utsusu / --utsusu-id）★ 一時の git repo 2つ", () => {
  // テスト線（A）と 本番（B）は 土台が 違う＝B の css に 節が 多く 切れ目（枚の 名）が 違う
  const JS =
    "    <script>\n      var a = 1;\n      // ★★節★★\n      function f() {\n        return a;\n      }\n    </script>\n";
  const HA =
    "<!doctype html>\n<html>\n  <head>\n    <style>\n      a { color: red; }\n    </style>\n  </head>\n  <body>\n" +
    JS +
    "  </body>\n</html>\n";
  const HB = HA.replace(
    "      a { color: red; }\n",
    "      /* ★本番だけ 一 */\n      a { color: red; }\n      /* ★本番だけ 二 */\n      b { color: blue; }\n"
  );
  let A;
  let B;
  const git = (R, ...a) => execFileSync("git", a, { cwd: R, encoding: "utf8", env: ENV });
  const w = (R, f, s) => {
    fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true });
    fs.writeFileSync(path.join(R, f), s);
  };
  const r = (R, f) => fs.readFileSync(path.join(R, f), "utf8");
  const kakunin = (R) => {
    const s = yomuSrc(R);
    return T.zure(r(R, "daikou-seikyu.html"), s.names, s.parts, s.moku);
  };
  // 門を 通して commit（--mae → --ato → commit）
  const monCommit = (R, msg) => {
    git(R, "add", "-A");
    expect(T.mae(R, ENV).kekka).not.toBe("tomeru");
    T.ato(R, ENV);
    git(R, "commit", "-qm", msg);
    expect(kakunin(R)).toEqual([]);
  };
  const tsukuru = (html) => {
    const R = fs.mkdtempSync(path.join(os.tmpdir(), "itsunagu-u-"));
    git(R, "init", "-q");
    git(R, "config", "user.email", "t@example.invalid");
    git(R, "config", "user.name", "t");
    git(R, "config", "core.autocrlf", "false");
    w(R, "daikou-seikyu.html", html);
    monCommit(R, "hajime");
    return R;
  };
  const dasuTo = (R, patch) => {
    const f = path.join(os.tmpdir(), `itsunagu-${process.pid}-${Date.now()}.patch`);
    fs.writeFileSync(f, patch);
    return f;
  };

  beforeEach(() => {
    A = tsukuru(HA);
    B = tsukuru(HB);
    // 土台が 違う＝写しの 名が 違う（テスト線だけの 名が 在る）
    expect(yomuSrc(A).names).not.toEqual(yomuSrc(B).names);
    // テスト線で 写しの .js を 直す commit（門が html も 直す）
    const s = yomuSrc(A);
    const n = s.names.find((nm, k) => /return a;/.test(s.parts[k]));
    w(A, `seikyu-src/${n}`, r(A, `seikyu-src/${n}`).replace("return a;", "return a + 1;"));
    monCommit(A, "naoshi");
    expect(git(A, "show", "--name-only", "--format=", "HEAD")).toMatch(/^seikyu-src\//m);
  });
  afterEach(() => {
    fs.rmSync(A, { recursive: true, force: true });
    fs.rmSync(B, { recursive: true, force: true });
  });

  it("写す：seikyu-src を 除いた 差分を 当て→門で 本番の 写しを 作る→id が 一致", () => {
    const { patch, id } = T.utsusuDasu(A, "HEAD", ENV);
    expect(T.michi(A, patch, ENV)).toEqual(["daikou-seikyu.html"]);
    expect(T.utsusu(B, patch, ENV).michi).toEqual(["daikou-seikyu.html"]);
    monCommit(B, "utsushi");
    expect(r(B, "daikou-seikyu.html")).toBe(HB.replace("return a;", "return a + 1;"));
    expect(git(B, "show", "--name-only", "--format=", "HEAD")).toMatch(/^seikyu-src\//m);
    expect(T.utsusuId(B, "HEAD", ENV)).toBe(id);
    expect(T.utsusuId(A, "HEAD", ENV)).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{40}$/);
  });

  it("壊す：写し（seikyu-src）を 含む patch は 止める（本番は 変えない）", () => {
    const zen = git(A, "diff", "--binary", "--full-index", "HEAD^", "HEAD");
    expect(() => T.utsusu(B, zen, ENV)).toThrow(/seikyu-src/);
    expect(r(B, "daikou-seikyu.html")).toBe(HB);
    expect(git(B, "status", "--porcelain")).toBe("");
  });

  it("壊す：noprefix の patch（a/ b/ が 無い）でも 止める", () => {
    const np = git(A, "diff", "--no-prefix", "--binary", "--full-index", "HEAD^", "HEAD");
    expect(() => T.utsusu(B, np, ENV)).toThrow();
    expect(r(B, "daikou-seikyu.html")).toBe(HB);
    expect(git(B, "status", "--porcelain")).toBe("");
  });

  it("壊す：本番で 空白を 1字 変えて commit → id が 違う（--verbatim）", () => {
    const { patch, id } = T.utsusuDasu(A, "HEAD", ENV);
    T.utsusu(B, patch, ENV);
    w(
      B,
      "daikou-seikyu.html",
      r(B, "daikou-seikyu.html").replace("return a + 1;", "return a  + 1;")
    );
    monCommit(B, "utsushi-zure");
    expect(T.utsusuId(B, "HEAD", ENV)).not.toBe(id);
  });

  it("台本：--utsusu-dasu → --utsusu → commit → --utsusu-id が 一致（patch は 作業木の 外）", () => {
    const DOUGU = path.join(ROOT, "scripts", "seikyu-tsunagu.mjs");
    // 台本は ROOT（自分の repo）で 走る＝写しの 関数を 一時 repo に 当てる 試験は 上で 済み。ここは 引数の 誤りで 止まる 事だけ
    let err = "";
    try {
      execFileSync(process.execPath, [DOUGU, "--utsusu"], {
        encoding: "utf8",
        env: ENV,
        stdio: "pipe",
      });
    } catch (e) {
      err = String(e.stderr);
    }
    expect(err).toMatch(/写せませんでした/);
    const f = dasuTo(A, "nai\n");
    try {
      execFileSync(process.execPath, [DOUGU, "--utsusu", f], {
        encoding: "utf8",
        env: ENV,
        stdio: "pipe",
      });
      err = "";
    } catch (e) {
      err = String(e.stderr);
    }
    fs.rmSync(f, { force: true });
    expect(err).toMatch(/差分が 無い/);
  });

  it("壊す：別の repo（本番の 作業木）で この repo の 道具を 絶対道で 呼ぶ → 止める（作った後 taiketsu 止1）", () => {
    const DOUGU = path.join(ROOT, "scripts", "seikyu-tsunagu.mjs");
    for (const args of [["--utsusu-id", "HEAD"], ["--check"]]) {
      let err = "";
      let ok = true;
      try {
        execFileSync(process.execPath, [DOUGU, ...args], {
          cwd: B,
          encoding: "utf8",
          env: ENV,
          stdio: "pipe",
        });
      } catch (e) {
        ok = false;
        err = String(e.stderr);
      }
      expect(ok, args.join(" ")).toBe(false);
      expect(err).toMatch(/道具の repo/);
    }
    // git の 外でも 止める
    const soto = fs.mkdtempSync(path.join(os.tmpdir(), "itsunagu-soto-"));
    let err = "";
    try {
      execFileSync(process.execPath, [DOUGU, "--check"], {
        cwd: soto,
        encoding: "utf8",
        env: ENV,
        stdio: "pipe",
      });
    } catch (e) {
      err = String(e.stderr);
    }
    fs.rmSync(soto, { recursive: true, force: true });
    expect(err).toMatch(/git の 作業木で ない/);
  });

  it("壊す：merge の commit は 写さない", () => {
    git(A, "checkout", "-qb", "eda", "HEAD^");
    w(A, "betsu.txt", "x\n");
    git(A, "add", "-A");
    git(A, "commit", "-qm", "betsu");
    git(A, "checkout", "-q", "-");
    git(A, "merge", "-q", "--no-edit", "--no-ff", "eda");
    expect(() => T.utsusuDasu(A, "HEAD", ENV)).toThrow(/merge/);
  });
});
