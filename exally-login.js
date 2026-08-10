/* exally-login.js — Exally 共通のログイン画面
 * ==================================================================
 * 全アプリ（売上管理・代行請求・給料明細…）で同じ見た目・同じ言い方にするための部品。
 * 画面の作りも文言もここが一次情報＝各アプリに書き写さない。
 *
 * 使い方:
 *   <script src="exally-login.js"></script>
 *   var LOGIN = ExallyLogin.mount({
 *     app: "売上管理",          // カードに出すアプリ名
 *     brand: "🚗 ダイコメ",     // 製品名（省くと Exally）
 *     brandSub: "",             // 製品名の右の小さい字（省くと エクサリー・空文字なら出さない）
 *     logo: "/icons/logo.png",  // 文字入りのロゴ画像（あれば文字の代わりに出す）
 *     theme: { accent:"#007aff", accentDark:"#0a5fd0", bg:"#f2f7ff" }, // 色（省くと今までの緑）
 *     sb: SB,                   // supabase クライアント
 *     onLogin: function (user) {…}, // ログインできたら呼ばれる
 *   });
 *
 * ★色は hex を直に渡す。CSS変数(var(--…))は使わない★
 *   このrepoの決まり（CLAUDE.md「CSS変数禁止（直接hex値のみ）」）に合わせている。
 *   飲み屋(Castally)の写しは :root の変数で合わせる作りだが、★決まりが逆★なので真似しない。
 *
 * ★この exally-login.js は repo ごとに別のファイル★（2026-08-09 sha照合で確認）
 *   ここを直しても 飲み屋・給与・Exally のログイン画面は1文字も変わらない。
 *   渡さなければ今までどおり Exally の緑なので、このrepoの他の画面も変わらない。
 *   LOGIN.show();  // ログイン画面を出す
 *   LOGIN.hide();  // 閉じる
 *
 * 出す要素のid（テストや他アプリからも触れるよう固定）:
 *   #loginOv / #loginEmail / #loginPass / #loginErr / #btnLogin / #btnSignup
 */
(function (root) {
  "use strict";

  var CSS_ID = "exally-login-css";

  // ★今までの色（Exallyの緑）★ 渡されなければこのまま＝他の画面は1色も変わらない
  var GREEN = {
    bg: "#eef7f1", // 画面の背景
    card: "#ffffff", // カードの地
    line: "#d4eae0", // 枠線
    accent: "#52b788", // 製品名の色・入力欄を選んだ時の枠
    accentDark: "#2f8f5b", // ログインボタンの地
    title: "#2f5d45", // アプリ名
    muted: "#7aa08c", // 小さい説明の字
    ink: "#24422f", // 入力した字
    link: "#3d6b53", // 「パスワードを忘れた」
    danger: "#c0392b", // 間違いの字
    shadow: "rgba(30,80,46,.10)",
  };

  // 渡された分だけ差し替える（★hexを直に埋める。var(--…)は使わない★）
  function themeOf(t) {
    var out = {};
    for (var k in GREEN) if (Object.prototype.hasOwnProperty.call(GREEN, k)) out[k] = GREEN[k];
    if (t && typeof t === "object") {
      for (var j in out) {
        if (Object.prototype.hasOwnProperty.call(t, j) && t[j]) out[j] = String(t[j]);
      }
    }
    return out;
  }

  function cssFor(c) {
    return [
      ".login-ov{position:fixed;inset:0;background:" + c.bg + ";z-index:400;display:none;",
      "align-items:center;justify-content:center;overflow:auto;",
      "padding:24px 18px calc(24px + env(safe-area-inset-bottom));}",
      ".login-ov.open{display:flex;}",
      ".login-card{width:100%;max-width:380px;background:" +
        c.card +
        ";border:1px solid " +
        c.line +
        ";",
      "border-radius:20px;box-shadow:0 6px 22px " + c.shadow + ";padding:26px 20px 22px;",
      "text-align:center;box-sizing:border-box;}",
      ".login-logo{font-family:'DM Mono',ui-monospace,monospace;font-size:27px;letter-spacing:2px;",
      "color:" + c.accent + ";}",
      // ★製品名を渡された時（＝日本語や絵文字が入る）は英字用の書体と字間を当てない★
      //   当てたままだと「ダ イ コ メ」と間が開いて、事務所の見出しと違う物に見える（実際に見た）
      ".login-logo.alt{font-family:inherit;font-weight:800;letter-spacing:normal;}",
      ".login-logo span{font-family:'Noto Sans JP',sans-serif;font-size:11px;letter-spacing:1px;",
      "color:" + c.muted + ";margin-left:6px;}",
      ".login-mark{max-width:190px;height:auto;display:block;margin:0 auto;}",
      ".login-title{font-size:15px;font-weight:700;color:" + c.title + ";margin:10px 0 2px;}",
      ".login-sub{font-size:12px;color:" + c.muted + ";margin-bottom:16px;}",
      ".login-inp{width:100%;box-sizing:border-box;font-size:16px;padding:13px 14px;",
      "border:1px solid " +
        c.line +
        ";border-radius:12px;background:" +
        c.card +
        ";color:" +
        c.ink +
        ";",
      "margin-bottom:10px;font-family:inherit;outline:none;-webkit-appearance:none;}",
      ".login-inp:focus{border-color:" + c.accent + ";}",
      ".login-err{min-height:18px;font-size:12px;color:" +
        c.danger +
        ";margin-bottom:6px;white-space:pre-wrap;}",
      /* ログインと新規登録の間の案内。近い方（新規登録）に付いて見えるよう上を空けて下は詰める */
      ".login-mid{font-size:11.5px;color:" +
        c.muted +
        ";line-height:1.9;margin:16px 0 7px;word-break:keep-all;}",
      ".login-note{font-size:11px;color:" + c.muted + ";line-height:1.7;margin-top:14px;}",
      ".login-forgot{display:inline-block;margin-top:12px;font-size:11.5px;color:" + c.link + ";",
      "background:none;border:none;padding:4px 6px;text-decoration:underline;cursor:pointer;",
      "font-family:inherit;}",
      ".login-btn{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;",
      "font-weight:700;padding:14px 16px;border-radius:14px;cursor:pointer;border:1px solid transparent;}",
      ".login-btn-main{background:" + c.accentDark + ";color:#ffffff;}",
      ".login-btn-sub{background:" +
        c.bg +
        ";color:" +
        c.accentDark +
        ";border-color:" +
        c.line +
        ";}",
      ".login-btn:disabled{opacity:.55;}",
    ].join("");
  }

  // ★色を渡された時は入れ直す★（既に入っている物を残すと 緑と青が混ざる）
  function injectCss(theme) {
    var st = document.getElementById(CSS_ID);
    if (!st) {
      st = document.createElement("style");
      st.id = CSS_ID;
      document.head.appendChild(st);
    }
    st.textContent = cssFor(themeOf(theme));
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // 出す言葉は全アプリ共通。生のエラー文をそのまま見せない。
  function friendly(e) {
    var m = String((e && e.message) || e || "");
    if (/Invalid login credentials/i.test(m)) return "メールかパスワードが違います";
    if (/User already registered/i.test(m))
      return "そのメールはもう登録されています。ログインしてください";
    if (/Password should be at least/i.test(m)) return "パスワードは6文字以上にしてください";
    if (/Email not confirmed/i.test(m))
      return "メールの確認がまだです。届いたメールを開いてください";
    if (/Failed to fetch|NetworkError|fetch failed/i.test(m))
      return "つながりませんでした。電波を確かめてください";
    return m;
  }

  function mount(opt) {
    var o = opt || {};
    var sb = o.sb;
    injectCss(o.theme);

    var ov = document.getElementById("loginOv");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "login-ov";
      ov.id = "loginOv";
      document.body.appendChild(ov);
    }
    ov.innerHTML =
      '<div class="login-card">' +
      // 製品名。渡されなければ今までどおり Exally（このrepoの他の画面は1文字も変わらない）
      (o.logo
        ? '<img class="login-mark" src="' +
          esc(o.logo) +
          '" alt="' +
          esc(o.brand || "Exally") +
          '">'
        : '<div class="login-logo' +
          (o.brand ? " alt" : "") +
          '">' +
          esc(o.brand || "Exally") +
          (o.brandSub === "" ? "" : " <span>" + esc(o.brandSub || "エクサリー") + "</span>") +
          "</div>") +
      '<div class="login-title">' +
      esc(o.app || "") +
      "</div>" +
      '<div class="login-sub">メールでログイン</div>' +
      '<input class="login-inp" id="loginEmail" type="email" inputmode="email" ' +
      'autocomplete="email" placeholder="メールアドレス">' +
      '<input class="login-inp" id="loginPass" type="password" ' +
      'autocomplete="current-password" placeholder="パスワード（6文字以上）">' +
      '<div class="login-err" id="loginErr"></div>' +
      '<button class="login-btn login-btn-main" type="button" id="btnLogin">ログイン</button>' +
      // 折り返しの位置は自分で決める（機種任せだと語の途中で割れる）
      '<div class="login-mid">はじめての方は、メールとパスワードを<br>' +
      "入力してから新規登録ボタンを押して下さい</div>" +
      '<button class="login-btn login-btn-sub" type="button" id="btnSignup">新規登録</button>' +
      // パスワードを忘れた人の逃げ道（これが無いと、その店は自分の売上に二度と入れない）
      (sb && sb.auth && sb.auth.resetPasswordForEmail
        ? '<div><button class="login-forgot" type="button" id="btnForgot">パスワードを忘れた</button></div>'
        : "") +
      '<div class="login-note">' +
      esc(o.note || "一度ログインすれば、次からは自動で入れます。") +
      "</div>" +
      "</div>";

    var $ = function (id) {
      return document.getElementById(id);
    };
    function err(msg) {
      $("loginErr").textContent = msg || "";
    }
    function busy(on) {
      $("btnLogin").disabled = on;
      $("btnSignup").disabled = on;
    }
    function ok(user) {
      err("");
      $("loginPass").value = "";
      hide();
      if (o.onLogin) o.onLogin(user);
    }
    function show() {
      ov.classList.add("open");
    }
    function hide() {
      ov.classList.remove("open");
    }

    async function login() {
      var email = $("loginEmail").value.trim();
      var pass = $("loginPass").value;
      if (!email || !pass) {
        err("メールとパスワードを入れてください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      busy(false);
      if (r.error) {
        err(friendly(r.error));
        return;
      }
      ok(r.data.user);
    }

    async function signup() {
      var email = $("loginEmail").value.trim();
      var pass = $("loginPass").value;
      if (!email || pass.length < 6) {
        err("メールと、6文字以上のパスワードを入れてください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.signUp({ email: email, password: pass });
      if (r.error) {
        busy(false);
        err(friendly(r.error));
        return;
      }
      // メール確認オフのときは、登録の直後にそのまま入れる
      if (r.data.session) {
        busy(false);
        ok(r.data.user);
        return;
      }
      var li = await sb.auth.signInWithPassword({ email: email, password: pass });
      busy(false);
      if (li.error) {
        err("登録できました。そのままログインしてください");
        return;
      }
      ok(li.data.user);
    }

    async function forgot() {
      var email = $("loginEmail").value.trim();
      if (!email) {
        err("メールアドレスを入れてから押してください");
        return;
      }
      err("");
      busy(true);
      var r = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname,
      });
      busy(false);
      if (r && r.error) {
        err(friendly(r.error));
        return;
      }
      err("");
      $("loginErr").textContent =
        "パスワードを作り直すメールを送りました。届いたメールを開いてください";
    }

    $("btnLogin").onclick = login;
    $("btnSignup").onclick = signup;
    if ($("btnForgot")) $("btnForgot").onclick = forgot;
    $("loginPass").onkeydown = function (ev) {
      if (ev.key === "Enter") login();
    };

    return { show: show, hide: hide, error: err, el: ov };
  }

  root.ExallyLogin = { mount: mount, friendly: friendly };
})(typeof window !== "undefined" ? window : this);
