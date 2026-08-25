// @vitest-environment jsdom
// ============================================================
// ★パスワードを忘れた人の「その先」★ 2026-08-23
//
//   ★見つけた事（実測）★
//     この画面には「パスワードを忘れた」は在り、メールも送れていた。
//     ★ところが 戻ってきた人に「新しいパスワードを決める」画面が無かった★
//     （updateUser の呼び出しが repo 全体で 0件）。
//     Supabase のリンクを押すと その場では入れる（セッションが張られる）が、
//     ★パスワードは分からないまま★＝別の端末・別のブラウザで また詰まる。
//     2026-08-22 に独自SMTPを入れて ★メールが本当に届くようになった★ので、
//     今日から実際に人が押す＝行き止まりが表に出る。
//
//   ★入れた物★
//     ・送ったら「送りました」の札（★その住所が登録されているかは言わない★＝当てられてしまう）
//     ・戻ってきた人には「新しいパスワードを決める」札 → updateUser → そのまま入れる
//     ・戻ってきた人の見分け方を ★3通り★（目印 pwreset=1 ／ type=recovery ／ 合図 PASSWORD_RECOVERY）
//       1通りだけだと Supabase の付け方が変わった日に ★黙って行き止まり★ になる
//     ・戻り先に ★自分の目印★ を付ける。★倉庫の「戻ってよい一覧」に入っている事が前提★
//
//   ★見た目は この repo のまま★（theme / brand / logo は1文字も変えない）
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "exally-login.js"), "utf8");

function load() {
  const fake = {};
  new Function("window", SRC + "\nreturn window.ExallyLogin;")(fake);
  return fake.ExallyLogin;
}

// 倉庫の代わり。呼ばれた回数と 渡された中身を控える。
function makeSb(opt) {
  const o = opt || {};
  const calls = { reset: 0, update: 0, resetArgs: null, updateArgs: null, onAuth: null };
  const auth = {
    signInWithPassword: () => Promise.resolve(o.signIn || { data: { user: { email: "a@b.com" } } }),
    signUp: () =>
      Promise.resolve(o.signUp || { data: { user: {}, session: { access_token: "t" } } }),
    updateUser: (a) => {
      calls.update++;
      calls.updateArgs = a;
      return Promise.resolve(o.update || { data: { user: { email: "a@b.com" } } });
    },
    onAuthStateChange: (cb) => {
      calls.onAuth = cb;
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };
  if (!o.noReset) {
    auth.resetPasswordForEmail = (email, a) => {
      calls.reset++;
      calls.resetArgs = [email, a];
      return Promise.resolve(o.reset || {});
    };
  }
  return { calls, auth };
}

function mountWith(opts, sb, onLogin) {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const L = load();
  const api = L.mount(Object.assign({ sb, onLogin: onLogin || function () {} }, opts));
  return { api, ov: document.getElementById("loginOv") };
}
const $ = (id) => document.getElementById(id);
const clickAsync = (id) => Promise.resolve($(id).onclick());

// jsdom の URL を差し替える（メールから戻ってきた状態を作る）
function setUrl(href) {
  window.history.replaceState(null, "", href);
}

describe("★パスワードを忘れた（送るところまで）★", () => {
  beforeEach(() => {
    setUrl("/daikou-seikyu.html");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("倉庫が再設定を持たない版では ★ボタンを見せない★（出来ない物のボタンを出さない）", () => {
    mountWith({ app: "代行請求" }, makeSb({ noReset: true }));
    expect($("btnForgot"), "出来ないのにボタンが在る").toBeNull();
    expect($("btnLogin")).not.toBeNull();
  });

  it("持っている版では ボタンが出る", () => {
    mountWith({ app: "代行請求" }, makeSb({}));
    expect($("btnForgot")).not.toBeNull();
    expect($("btnForgot").textContent).toBe("パスワードを忘れた");
  });

  it("メール未入力で押したら ★1通も送らない★・言葉で返す", async () => {
    const sb = makeSb({});
    mountWith({ app: "代行請求" }, sb);
    $("loginEmail").value = "   ";
    await clickAsync("btnForgot");
    expect(sb.calls.reset, "★空のまま送っている★").toBe(0);
    expect($("loginErr").textContent).toContain("メールアドレスを入れて");
  });

  it("送ったら「送りました」の札／★登録されているかは言わない★", async () => {
    const sb = makeSb({});
    const { ov } = mountWith({ app: "代行請求" }, sb);
    $("loginEmail").value = "z@b.com";
    await clickAsync("btnForgot");
    expect(sb.calls.reset).toBe(1);
    expect($("loginResetSent"), "★送りましたの札が出ない★").not.toBeNull();
    expect(ov.textContent).toContain("z@b.com");
    expect(ov.textContent, "★住所が有るか無いかを言っている＝当てられてしまう★").not.toMatch(
      /登録されて|見つかりません|ありません/
    );
  });

  it("戻り先に ★自分の目印 pwreset=1★ が付いている／★自分のページに戻す★", async () => {
    const sb = makeSb({});
    mountWith({ app: "代行請求" }, sb);
    $("loginEmail").value = "z@b.com";
    await clickAsync("btnForgot");
    const [email, arg] = sb.calls.resetArgs;
    expect(email).toBe("z@b.com");
    expect(arg && typeof arg.redirectTo).toBe("string");
    expect(arg.redirectTo, "★目印が無いと 戻ってきた人を見分けられない★").toMatch(/\?pwreset=1$/);
    expect(arg.redirectTo, "★他アプリへ飛ばしていないか★").toContain("/daikou-seikyu.html");
  });

  it("送信が失敗したら 札を出さず 言葉で返す", async () => {
    const sb = makeSb({ reset: { error: { message: "Failed to fetch" } } });
    mountWith({ app: "代行請求" }, sb);
    $("loginEmail").value = "z@b.com";
    await clickAsync("btnForgot");
    expect($("loginResetSent")).toBeNull();
    expect($("loginErr").textContent).toContain("つながりません");
  });

  it("「送りました」から戻るで ログイン画面に復帰する", async () => {
    mountWith({ app: "代行請求" }, makeSb({}));
    $("loginEmail").value = "z@b.com";
    await clickAsync("btnForgot");
    $("btnBackLogin").onclick();
    expect($("btnLogin")).not.toBeNull();
    expect($("btnSignup")).not.toBeNull();
    expect($("loginResetSent")).toBeNull();
  });
});

describe("★戻ってきた人の「その先」（これが無かった）★", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  for (const [name, href] of [
    ["自分の目印 ?pwreset=1", "/daikou-seikyu.html?pwreset=1"],
    ["Supabase の #type=recovery", "/daikou-seikyu.html#type=recovery&access_token=x"],
  ]) {
    it(`メールから戻ってきた人（${name}）は ★新しいパスワードの札★ が最初に出る`, () => {
      setUrl(href);
      mountWith({ app: "代行請求" }, makeSb({}));
      expect($("loginReset"), "★行き止まり＝ログイン画面のまま★").not.toBeNull();
      expect($("loginNew")).not.toBeNull();
      expect($("btnLogin"), "★決める前にログイン画面を見せている★").toBeNull();
    });
  }

  it("合図 PASSWORD_RECOVERY でも ★新しいパスワードの札★ に切り替わる", () => {
    setUrl("/daikou-seikyu.html");
    const sb = makeSb({});
    mountWith({ app: "代行請求" }, sb);
    expect($("btnLogin")).not.toBeNull();
    expect(typeof sb.calls.onAuth, "合図を受け取る用意が無い").toBe("function");
    sb.calls.onAuth("PASSWORD_RECOVERY", {});
    expect($("loginReset")).not.toBeNull();
  });

  it("6文字未満は ★倉庫を呼ばない★・言葉で返す", async () => {
    setUrl("/daikou-seikyu.html?pwreset=1");
    const sb = makeSb({});
    mountWith({ app: "代行請求" }, sb);
    $("loginNew").value = "12345";
    await clickAsync("btnSetPass");
    expect(sb.calls.update, "★短いまま倉庫へ投げている★").toBe(0);
    expect($("loginResetErr").textContent).toContain("6文字以上");
  });

  it("決めたら 倉庫に渡す／そのまま入れる／★目印がURLから消える★", async () => {
    setUrl("/daikou-seikyu.html?pwreset=1");
    const sb = makeSb({});
    let loggedIn = "まだ";
    mountWith({ app: "代行請求" }, sb, (u) => {
      loggedIn = u;
    });
    $("loginNew").value = "newpass1";
    await clickAsync("btnSetPass");
    expect(sb.calls.update).toBe(1);
    expect(sb.calls.updateArgs.password).toBe("newpass1");
    expect(loggedIn, "★決め終わったのにログイン画面へ戻している★").not.toBe("まだ");
    expect(window.location.search, "★目印が残ると 読み直しで また再設定画面が出る★").not.toContain(
      "pwreset"
    );
  });

  it("決めるのに失敗したら 入れない・言葉で返す", async () => {
    setUrl("/daikou-seikyu.html?pwreset=1");
    const sb = makeSb({
      update: { error: { message: "Password should be at least 6 characters" } },
    });
    let loggedIn = null;
    mountWith({ app: "代行請求" }, sb, (u) => {
      loggedIn = u;
    });
    $("loginNew").value = "newpass1";
    await clickAsync("btnSetPass");
    expect(loggedIn).toBeNull();
    expect($("loginResetErr").textContent).toContain("6文字以上");
  });
});

describe("★見た目と 前からの動きを壊していないか（回帰）★", () => {
  beforeEach(() => {
    setUrl("/daikou-seikyu.html");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("製品名（brand / brandSub）は前のまま", () => {
    const { ov } = mountWith({ app: "代行請求", brand: "🚗 ダイコメ", brandSub: "" }, makeSb({}));
    expect(ov.textContent).toContain("ダイコメ");
    expect(ov.textContent).not.toContain("Exally");
  });

  it("★渡した色（theme）が 新しい札にも効いている★（この repo は CSS 変数禁止＝直hex）", async () => {
    mountWith(
      { app: "代行請求", brand: "🚗 ダイコメ", brandSub: "", theme: { accentDark: "#0a5fd0" } },
      makeSb({})
    );
    $("loginEmail").value = "z@b.com";
    await clickAsync("btnForgot");
    const css = document.getElementById("exally-login-css").textContent;
    expect(css, "★渡した色が当たっていない★").toContain("#0a5fd0");
    expect(css, "★var() を使っている（この repo は禁止）★").not.toContain("var(--");
  });

  it("ふつうのログインは前のまま", async () => {
    let loggedIn = null;
    mountWith({ app: "代行請求" }, makeSb({}), (u) => {
      loggedIn = u;
    });
    $("loginEmail").value = "a@b.com";
    $("loginPass").value = "secret1";
    await clickAsync("btnLogin");
    expect(loggedIn && loggedIn.email).toBe("a@b.com");
  });
});
