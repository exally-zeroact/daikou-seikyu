// @vitest-environment node
// ============================================================
// ★代行請求の画面を ダイコメの青にする★ 2026-08-09
//
//   ★司さんの言葉★
//     「代行請求書アプリの中もダイコメに合わせてな」
//     ログイン画面だけ青にしたら、入った先が緑のままで浮いていた（写真を見て言われた）。
//
//   ★ここで守ること★
//     1. 画面から ★Exally の緑が1色も残らない★
//     2. ★紙（請求書そのもの）は1色も変えない★
//        .sheet / .sh-* と @media print と invoice-pdf.js は ★刷る物★。
//        ここの色を変えると、司さんがお客さんに出す請求書が変わる。
//     3. ★Excel の緑 #217346 は残す★
//        これは Excel を表す色で、Exally の色ではない（Excel風の見せ方に使っている）
//
//   ★色は事務所(dashboard.html)と同じ値を名指しで入れる★
//     --blue #007aff / --blue-d #0a5fd0 / --bg #f2f7ff / --line #dbe7f7 / --muted #5a6b82
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { colorsIn, EXALLY_GREEN, OFFICE_BLUE, looksGreen } from "./color-value.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

// <style> の中を 規則ごとに切り出す
function rules() {
  const a = HTML.indexOf("<style>");
  const b = HTML.indexOf("</style>", a);
  const style = HTML.slice(a, b);
  const printAt = style.indexOf("@media print");
  const out = [];
  const RE = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  while ((m = RE.exec(style))) {
    out.push({
      // 直前のコメントや改行が混ざるので、最後の行だけを選択子とみなす
      sel: m[1].trim().split("\n").pop().trim(),
      body: m[2],
      paper: /\.sheet(?![-\w])|\.sh-/.test(m[1]),
      print: printAt >= 0 && m.index > printAt,
    });
  }
  return out;
}
const RULES = rules();

describe("★画面から Exally の緑が消えているか★", () => {
  it("規則が読めている（数百ある）", () => {
    expect(RULES.length).toBeGreaterThan(200);
  });

  // ★7色は tests/color-value.js の1か所で持つ★（画面と紙で別々の一覧を持つと必ずズレる）
  for (const g of EXALLY_GREEN) {
    it("画面に #" + g + " が残っていない", () => {
      const hit = RULES.filter((r) => !r.paper && !r.print && colorsIn(r.body).includes(g)).map(
        (r) => r.sel.split("\n").pop().trim()
      );
      expect(hit, "★#" + g + " が残っている: " + hit.join(" / ")).toEqual([]);
    });
  }

  // ★7色だけ見ると素通りする★
  //   2026-08-10、わざと戻して赤を見る途中で ★この穴を自分で踏んだ★:
  //   紙の #DCEFE6 は7色に無いので、画面側に同じ物が入っても誰も気づけなかった。
  //   → 名前で照合するのをやめ、★緑がかっているか値で判定★する。
  //   例外は #217346（Excelを表す色。Exallyの色ではないので残す）だけ。
  it("★7色に無い緑も 画面に残っていない（例外は Excelの #217346 だけ）★", () => {
    const hit = [];
    for (const r of RULES.filter((x) => !x.paper && !x.print)) {
      for (const c of colorsIn(r.body)) {
        if (looksGreen(c) && c !== "217346") hit.push(r.sel.split("\n").pop().trim() + " : #" + c);
      }
    }
    expect(hit, "★画面に緑が残っている:\n  " + hit.join("\n  ")).toEqual([]);
  });

  it("★事務所と同じ青が入っている★", () => {
    const all = RULES.filter((r) => !r.paper && !r.print)
      .map((r) => r.body)
      .join("")
      .toLowerCase();
    expect(all, "事務所の --blue-d が無い").toContain("#0a5fd0");
    expect(all, "事務所の --blue が無い").toContain("#007aff");
    expect(all, "事務所の --bg が無い").toContain("#f2f7ff");
  });

  // ★この試験は 2026-08-10 まで「何も見ていない緑」だった★
  //   "#1a4a2e" しか探しておらず、実際に残っていた { rgb: "1A4A2E" }（#無し）を
  //   素通りしていた。値まで見るのは tests/no-dark-green-values.test.js に移した。
  it("★濃い緑 #1A4A2E は1つも無い★（# の有無に関係なく・全アプリ共通の禁止色）", () => {
    const lower = HTML.toLowerCase();
    expect(lower, "# 付きで残っている").not.toContain("#1a4a2e");
    expect(lower, '★# 無しで残っている（例: { rgb: "1A4A2E" }）★').not.toMatch(
      /[^0-9a-f#]1a4a2e(?![0-9a-f])/
    );
  });

  // ★影は rgba( で書いてあるので hex を探すだけでは見つからない★
  //   画面を開いて計算後の色を数えて初めて気づいた（覆いの下地が緑だった）
  it("★影や覆いの rgba も 緑がかっていない★", () => {
    const green = (v) => {
      const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return false;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      return g > r + 10 && g > b + 6;
    };
    const bad = RULES.filter((r) => !r.paper && !r.print)
      .flatMap((r) => (r.body.match(/rgba?\([^)]*\)/g) || []).map((v) => r.sel + " : " + v))
      .filter((s) => green(s));
    expect(bad, "★緑がかった rgba が残っている:\n  " + bad.join("\n  ")).toEqual([]);
  });
});

// ★<style> の中だけ直しても足りない★
//   要素に style="…" と直書きしてある所と、JSが組み立てる小さな見た目が残る。
//   実際に、画面を開いて全要素の「計算後の色」を数えて見つけた（ソースを読むだけでは気づけなかった）。
describe("★直書きの色も 緑が残っていない★", () => {
  const styleEnd = HTML.indexOf("</style>");
  const rest = HTML.slice(styleEnd);

  for (const g of ["#2e7d54", "#52b788", "#7aa08c", "#c8ecd8", "#a9c4b6", "#eaf5ef"]) {
    it("style の外に " + g + " が残っていない", () => {
      const bad = rest
        .split("\n")
        .filter((L) => L.toLowerCase().includes(g))
        .map((L) => L.trim().slice(0, 60));
      expect(bad, "★" + g + " が残っている:\n  " + bad.join("\n  ")).toEqual([]);
    });
  }
});

// ============================================================
// ★紙も 事務所と同じ青にする★（指示役 2026-08-10）
//
//   ここは 2026-08-09 まで ★逆の事を守っていた★:
//     「.sheet の枠線は今までの色のまま」「紙に青が漏れていない」
//     「紙の本文色は 2E7D54 であること」
//   ＝画面から緑を追い出す試験と ★同じファイルの中で正面から食い違っていた★。
//   紙だけ緑を固定していたので、お客さんに渡す請求書はずっと緑のままだった。
//
//   ★判子の朱色 #C0392B は意匠なので残す★（緑ではない）
//   ★罫線 #B0B0B0 は FAX/白黒で消えないよう わざと濃くした灰色なので残す★（緑ではない）
// ============================================================
describe("★紙（刷る物）も 事務所の青になっている★", () => {
  const paperRules = RULES.filter((r) => r.paper || r.print);

  it("紙の規則が読めている", () => {
    expect(paperRules.length, "紙の規則が1本も取れていない").toBeGreaterThan(5);
  });

  for (const g of EXALLY_GREEN) {
    it("紙に #" + g + " が1つも無い", () => {
      const hit = paperRules
        .filter((r) => colorsIn(r.body).includes(g))
        .map((r) => r.sel.split("\n").pop().trim());
      expect(hit, "★紙に #" + g + " が残っている: " + hit.join(" / ")).toEqual([]);
    });
  }

  // ★7色だけ見ると素通りする緑がある★
  //   実際 .sh-table th の #DCEFE6 と .sheet の影 rgba(30,80,46,.1) は
  //   指示役が名指しした7色に入っていないが、どちらも緑。値で見て弾く。
  it("★7色に無い緑も 紙に残っていない（rgba の影も含む）★", () => {
    const hit = [];
    for (const r of paperRules) {
      for (const c of colorsIn(r.body)) {
        if (looksGreen(c)) hit.push(r.sel.split("\n").pop().trim() + " : #" + c);
      }
    }
    expect(hit, "★紙に緑が残っている:\n  " + hit.join("\n  ")).toEqual([]);
  });

  // ★消しただけで色が無い、を防ぐ★
  //   画面の中の紙(.sheet)は 本文が黒・表の罫が黒の「classic寄り」の見た目で、
  //   もともと色が付いているのは ★枠(線)と 表の地★ の2か所だけ。
  //   本文の青は PDF(TEXT) と Excel(C_TEXT) の方で見る（下の describe）。
  it("★紙が事務所の青を使っている★（線と地）", () => {
    const all = paperRules.flatMap((r) => colorsIn(r.body));
    expect(all, "紙に罫・枠の青が無い").toContain(OFFICE_BLUE.line);
    expect(all, "紙に地の青が無い").toContain(OFFICE_BLUE.bg);
  });

  it("判子の朱色 #C0392B は残っている（意匠・緑ではない）", () => {
    const all = paperRules.flatMap((r) => colorsIn(r.body));
    expect(all, "★判子の色まで塗り替えている★").toContain("C0392B");
  });
});

// ★注釈は証拠にならない★
//   以前ここは "#2e7d54" という ★注釈の中の文字★ を拾って緑になっていた。
//   実際の値 rgb(...) とは無関係だった。必ず rgb() の数字を色に直して見る。
describe("★PDF(invoice-pdf.js) の色は 注釈ではなく値で見る★", () => {
  const pdf = fs.readFileSync(path.join(ROOT, "invoice-pdf.js"), "utf8");
  const hexOf = (name) => {
    const m = pdf.match(new RegExp("\\b" + name + "\\s*=\\s*rgb\\(([^)]*)\\)"));
    return m ? colorsIn("rgb(" + m[1] + ")")[0] : null;
  };

  it("本文・金額(TEXT) が 事務所の青", () => {
    expect(hexOf("TEXT"), "★お客さんに渡すPDFの本文が青ではない★").toBe(OFFICE_BLUE.ink);
  });
  it("飾り線(MINT) が 強めの青", () => {
    expect(hexOf("MINT")).toBe(OFFICE_BLUE.strong);
  });
  it("ヘッダー面(MINTBG) が 地の青", () => {
    expect(hexOf("MINTBG")).toBe(OFFICE_BLUE.bg);
  });
  it("補助文(MUTED) が 弱い字の色", () => {
    expect(hexOf("MUTED")).toBe(OFFICE_BLUE.muted);
  });

  // ★クラシックは「白黒で刷っても崩れない紙」が意匠★（指示役 2026-08-10）
  //   青の面を足すと その意匠を壊す＝直す前より変わってしまう。
  //   だから クラシックの色は ★灰色系だけ★（緑も青も入れない）に固定する。
  it("★クラシックの色は 白黒のまま（青も緑も入れない）★", () => {
    const CLASSIC = ["GREEN", "GREY", "DARK", "INKSC", "INKC", "HAIRC"];
    const bad = [];
    for (const name of CLASSIC) {
      const c = hexOf(name);
      if (!c) continue;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
      // 灰色＝R・G・B がほぼ同じ。差が付いていれば色が入っている。
      if (Math.max(r, g, b) - Math.min(r, g, b) > 6) bad.push(name + " = #" + c);
    }
    expect(bad, "★クラシックに色が入っている: " + bad.join(" / ")).toEqual([]);
  });

  it("★PDFの色トークンに Exallyの緑が1つも無い★", () => {
    const hit = [];
    for (const m of pdf.matchAll(/^\s*([A-Z][A-Z0-9]*)\s*=\s*rgb\(([^)]*)\);/gm)) {
      const c = colorsIn("rgb(" + m[2] + ")")[0];
      if (c && (EXALLY_GREEN.includes(c) || looksGreen(c))) hit.push(m[1] + " = #" + c);
    }
    expect(hit, "★PDFに緑が残っている: " + hit.join(" / ")).toEqual([]);
  });
});

// ★名前で探すと必ず取りこぼす★
//   Excel に渡していた緑は、探し方を広げるたびに 3回 出てきた:
//     1回目 C_TEXT/C_LABEL/C_MUTED だけ見た      → { rgb: "52B788" } を見落とし
//     2回目 rgb: "…" を見た                       → DCEFE6 / EAF7F0 を捕まえた
//     3回目 でも rgb: isElegant ? "DCE8E2" : … は ★間に三項演算子が入る★ ので素通り
//   → 名前も書き方も当てにせず、★HTMLの中の「6桁hexの文字列」を全部★ 見る。
describe("★配信するファイル1本まるごとに 緑が1つも無い★", () => {
  // ★規則(<style>)と 文字列リテラルだけ見ても まだ足りなかった★
  //   実配信を取得して数えたら #D6E6DD / #5F8A72 が出た。どちらも
  //   ★JSが組み立てる HTML の中の 直書き style="…" ★ で、
  //   '…border-top:1px dashed #d6e6dd;…' のように 長い文字列の途中に埋まっていた。
  //   → 場所を当てるのをやめ、★ファイルを1行ずつ 端から端まで★ 値で見る。
  it("daikou-seikyu.html の全行（直書き style= も含む）に緑が無い", () => {
    const hit = [];
    HTML.split("\n").forEach((L, i) => {
      for (const c of colorsIn(L)) {
        if (c === "217346") continue; // Excelを表す色（Exallyの色ではない）
        if (EXALLY_GREEN.includes(c) || looksGreen(c)) hit.push(i + 1 + "行目 #" + c);
      }
    });
    expect(hit, "★緑が残っている:\n  " + hit.join("\n  ")).toEqual([]);
  });

  it("invoice-pdf.js / meisai-engine.js の全行に緑が無い", () => {
    const hit = [];
    for (const f of ["invoice-pdf.js", "meisai-engine.js"]) {
      fs.readFileSync(path.join(ROOT, f), "utf8")
        .split("\n")
        .forEach((L, i) => {
          for (const c of colorsIn(L)) {
            if (EXALLY_GREEN.includes(c) || looksGreen(c)) hit.push(f + ":" + (i + 1) + " #" + c);
          }
        });
    }
    expect(hit, "★緑が残っている:\n  " + hit.join("\n  ")).toEqual([]);
  });

  // ★exally-login.js だけは除く（理由を書く）★
  //   ここの緑は「何も渡さなければ 今までの Exally のまま」という f629b09 の設計で、
  //   tests/login-brand.test.js が ★その既定を守る側★ の試験を持っている。
  //   代行請求は青を明示的に渡すので画面には出ない。変えるなら別の判断が要る。
  it("exally-login.js の既定色は 今までのまま（設計どおり・変わっていない事を固定）", () => {
    const js = fs.readFileSync(path.join(ROOT, "exally-login.js"), "utf8");
    expect(js, "★既定色を変えている＝他アプリの見た目が動く★").toContain('accent: "#52b788"');
  });
});

describe("★Excelに書き出す文字色も 事務所の青★", () => {
  const rgbOf = (name) => {
    const m = HTML.match(new RegExp("var " + name + '\\s*=\\s*\\{\\s*rgb:\\s*"([0-9A-Fa-f]{6})"'));
    return m ? m[1].toUpperCase() : null;
  };
  // ★クラシックの帯は Excel 側にも在る★
  //   PDF だけ白黒にして Excel を青のままにすると、同じ請求書なのに紙とExcelで別物になる。
  //   （わざと青に戻したら赤にならず、この穴を自分で踏んだ 2026-08-10）
  it("★クラシックの帯(BAND)も 白黒のまま★", () => {
    const m = HTML.match(/var BAND\s*=\s*\{\s*fgColor:\s*\{\s*rgb:\s*"([0-9A-Fa-f]{6})"/);
    expect(m, "BAND が見つからない").toBeTruthy();
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    expect(
      Math.max(r, g, b) - Math.min(r, g, b),
      "★クラシックの帯に色が入っている: #" + m[1] + "★"
    ).toBeLessThanOrEqual(6);
  });

  it("本文・金額(C_TEXT)", () => expect(rgbOf("C_TEXT")).toBe(OFFICE_BLUE.ink));
  it("見出し・ラベル(C_LABEL)", () => expect(rgbOf("C_LABEL")).toBe(OFFICE_BLUE.strong));
  it("補助文(C_MUTED)", () => expect(rgbOf("C_MUTED")).toBe(OFFICE_BLUE.muted));
});

describe("★Excel の緑は残す★", () => {
  it("#217346 が残っている（Excelを表す色。Exallyの色ではない）", () => {
    const xl = RULES.filter((r) => r.body.includes("#217346")).map((r) => r.sel);
    expect(xl.length, "★Excelの緑まで塗り替えている★").toBeGreaterThan(0);
  });
});
