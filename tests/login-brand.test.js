// @vitest-environment jsdom
// ============================================================
// ★ログイン画面が ダイコメ になっているか★ 2026-08-09
//
//   ★司さんの言葉★
//     「2 ログイン画面がExally系のままやないか」
//     事務所の「請求書 ↗」を押すと この画面が出る。
//     ダイコメの他の画面（login.html / daikome-admin.html）は
//     既に ★青の「🚗 ダイコメ」★ なのに、ここだけ ★緑の「Exally エクサリー」★ だった。
//
//   ★調べて分かったこと（2026-08-09）★
//     exally-login.js は「全アプリ共通の部品」と書いてあるが、実際は
//     ★repo ごとに別のファイル★で、中身が5種類に分かれている（sha照合済み）:
//       daikou-seikyu-test 226行 / nomiya(飲み屋) 366行 / exally-prod 197行 /
//       payslip 214行 / Exally-test 226行(shaは別)
//     ＝★ここを直しても 飲み屋・給与・Exally には影響しない★
//     製品名を渡す口(brand/brandSub/logo)は ★飲み屋の写しにしか無かった★ので、
//     ★同じ名前・同じ既定★でこちらにも足す（考え方を揃える）。
//
//   ★色の決まりが飲み屋と逆★
//     飲み屋: :root の CSS 変数で合わせる
//     ここ  : CLAUDE.md:99「CSS変数禁止（直接hex値のみ）」
//     → ★mount に hex を渡す★形にする。var() は使わない。
//
//   ★渡さなければ 今までどおり Exally の緑★（他の画面を巻き込まない）
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "exally-login.js"), "utf8");

function load() {
  // 部品は「window があればそこに付ける」形なので、window を渡して受け取る
  const fake = {};
  new Function("window", SRC + "\nreturn window.ExallyLogin;")(fake);
  return fake.ExallyLogin;
}

function mountWith(opts) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const L = load();
  const api = L.mount(Object.assign({ sb: { auth: {} }, onLogin: function () {} }, opts));
  return { api, ov: document.getElementById("loginOv") };
}

describe("★製品名を渡せる★", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("渡さなければ 今までどおり Exally エクサリー（他の画面を変えない）", () => {
    const { ov } = mountWith({ app: "代行請求" });
    expect(ov.textContent).toContain("Exally");
    expect(ov.textContent).toContain("エクサリー");
  });

  it("★ダイコメ を渡すと ダイコメ になる★", () => {
    const { ov } = mountWith({ app: "代行請求", brand: "🚗 ダイコメ", brandSub: "" });
    expect(ov.textContent, "★ここが Exally のままだと司さんが見た画面のまま★").toContain(
      "ダイコメ"
    );
    expect(ov.textContent).not.toContain("Exally");
    expect(ov.textContent, "brandSub に空を渡したのに残っている").not.toContain("エクサリー");
  });

  it("brandSub を省いたら エクサリー が付く（今までの形）", () => {
    const { ov } = mountWith({ app: "代行請求", brand: "Castally" });
    expect(ov.textContent).toContain("Castally");
    expect(ov.textContent).toContain("エクサリー");
  });

  it("★製品名を渡した時は 英字用の書体と字間を当てない★（「ダ イ コ メ」と開く）", () => {
    const { ov } = mountWith({ app: "代行請求", brand: "🚗 ダイコメ", brandSub: "" });
    expect(ov.querySelector(".login-logo").classList.contains("alt")).toBe(true);
    const css = document.getElementById("exally-login-css").textContent;
    expect(css).toContain(".login-logo.alt{font-family:inherit");
  });

  it("渡さなければ 今までの英字用の見え方のまま", () => {
    const { ov } = mountWith({ app: "代行請求" });
    expect(ov.querySelector(".login-logo").classList.contains("alt")).toBe(false);
  });

  it("アプリ名は今までどおり出る", () => {
    const { ov } = mountWith({ app: "代行請求", brand: "🚗 ダイコメ", brandSub: "" });
    expect(ov.textContent).toContain("代行請求");
  });
});

describe("★色を hex で渡せる（CSS変数は使わない）★", () => {
  it("★CLAUDE.md:99 のとおり 出す CSS に CSS変数を1つも使っていない★", () => {
    // ★説明書き(コメント)ではなく、実際に画面へ入る CSS を見る★
    //   （最初はソース全文を見ていたが、注意書きの中の字まで拾って赤くなった＝試験の側の欠陥）
    mountWith({ app: "代行請求", theme: { accent: "#007aff" } });
    const css = document.getElementById("exally-login-css").textContent;
    expect(css.includes("var(--"), "★CSS変数禁止（直接hex値のみ）に反している★").toBe(false);
  });

  it("渡さなければ 今までの緑のまま", () => {
    mountWith({ app: "代行請求" });
    const css = document.getElementById("exally-login-css").textContent;
    expect(css).toContain("#52b788");
    expect(css).toContain("#2f8f5b");
  });

  it("★ダイコメの青を渡すと その色になる★", () => {
    mountWith({
      app: "代行請求",
      brand: "🚗 ダイコメ",
      brandSub: "",
      theme: { accent: "#007aff", accentDark: "#0a5fd0", bg: "#f2f7ff" },
    });
    const css = document.getElementById("exally-login-css").textContent;
    expect(css, "★渡した青が出ていない★").toContain("#007aff");
    expect(css).toContain("#0a5fd0");
    expect(css).toContain("#f2f7ff");
    expect(css, "★Exallyの緑が残っている＝混ざる★").not.toContain("#52b788");
  });

  it("★色を渡した時に 濃い緑 #1A4A2E は1つも出ない★（全アプリ共通の禁止色）", () => {
    mountWith({ app: "代行請求", theme: { accent: "#007aff", accentDark: "#0a5fd0" } });
    const css = document.getElementById("exally-login-css").textContent.toLowerCase();
    expect(css).not.toContain("#1a4a2e");
  });
});

describe("★触る所の名前は変えない（他のテスト・他アプリが掴んでいる）★", () => {
  it("id は今までどおり", () => {
    const { ov } = mountWith({ app: "代行請求" });
    for (const id of ["loginOv", "loginEmail", "loginPass", "loginErr", "btnLogin", "btnSignup"]) {
      expect(document.getElementById(id), id + " が無い").toBeTruthy();
    }
    expect(ov).toBeTruthy();
  });
});

describe("★画面側が ちゃんと渡しているか★", () => {
  const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

  it("★daikou-seikyu.html の mount に ダイコメ が渡っている★", () => {
    // ★渡している「値」を見る。ブロックの字面を探すと 説明書きの中の字まで拾う★
    //   （最初そう書いて、わざと brand を Exally に戻しても緑のままだった＝何も見ていない試験）
    const i = HTML.indexOf("ExallyLogin.mount({");
    expect(i, "mount している所が見つからない").toBeGreaterThan(-1);
    const block = HTML.slice(i, HTML.indexOf("onLogin", i));

    const brand = (block.match(/\n\s*brand:\s*"([^"]*)"/) || [])[1];
    expect(brand, "★brand を渡していない＝Exally のまま出る★").toBeTruthy();
    expect(brand, "★渡している製品名が ダイコメ でない★").toContain("ダイコメ");

    const accent = (block.match(/\n\s*accent:\s*"([^"]*)"/) || [])[1];
    expect(accent, "★色(accent)を渡していない＝緑のまま★").toBe("#007aff");
  });

  // ★ログイン画面だけ直しても、入った先の見出しとタブが Exally のままだと直っていない★
  //   司さんが見るのは「入る前」だけではない。
  it("★アプリの中の見出しが ダイコメ★（ログインした先で一番上に出る字）", () => {
    const m = HTML.match(/<span class="app-logo">([^<]*)<\/span>/);
    expect(m, "見出しが見つからない").toBeTruthy();
    expect(m[1], "★入った先が Exally のまま★").toContain("ダイコメ");
    expect(
      HTML.includes('<span class="app-logo-ja">エクサリー</span>'),
      "★「エクサリー」が残っている★"
    ).toBe(false);
  });

  it("★タブ／ホーム画面の名前が Exally でない★", () => {
    const t = (HTML.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    expect(t, "★タブに Exally と出る（ホーム画面に置くとその名前になる）★").not.toContain("Exally");
    expect(t).toContain("ダイコメ");
  });
});
