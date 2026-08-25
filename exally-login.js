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

  /* ★メールから戻ってきた人の見分け方を3通り持つ（2026-08-23）★
       ①自分で付けた目印 pwreset=1（? でも # でも拾う）
       ②Supabase が付ける type=recovery
       ③Supabase からの合図 PASSWORD_RECOVERY（mount の中で拾う）
     1通りだけにすると、Supabase の付け方が変わった日に ★黙って行き止まり★ になる。 */
  var RESET_MARK = "pwreset=1";
  var recoveryOn = false;
  function isRecovery() {
    if (recoveryOn) return true;
    try {
      var h = String(location.hash || "") + "&" + String(location.search || "");
      if (h.indexOf(RESET_MARK) >= 0) return true;
      return /(^|[#&?])type=recovery(&|$)/.test(h);
    } catch (e) {
      return false;
    }
  }
  // 決め終わったら目印を消す（読み直しで また再設定画面が出るのを防ぐ）
  function cleanUrl() {
    try {
      if (!history || !history.replaceState) return;
      var q = String(location.search || "")
        .replace(RESET_MARK, "")
        .replace(/[?&]+$/, "");
      if (q === "?") q = "";
      history.replaceState(null, "", location.pathname + q);
    } catch (e) {
      /* 消せなくても 動きは止めない */
    }
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
    function markHTML() {
      return o.logo
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
            "</div>";
    }
    /* ★送りました／新しいパスワードを決める（2026-08-23）★
       これまでは メールは送れるのに 戻ってきた人の受け皿が無く、
       ★リンクを押すと その場では入れるが パスワードは分からないまま★＝別の端末で また詰まる。 */
    function sentHTML(email) {
      return (
        '<div class="login-card" id="loginResetSent">' +
        markHTML() +
        '<div class="login-title">パスワードの再設定メールを送りました</div>' +
        '<div class="login-sub">' +
        esc(email) +
        "</div>" +
        '<div class="login-mid">このメールに届いた リンクを押すと<br>' +
        "新しいパスワードを決める画面が開きます。</div>" +
        '<button class="login-btn login-btn-sub" type="button" id="btnBackLogin">ログイン画面へ戻る</button>' +
        '<div class="login-note">メールが見つからない時は、迷惑メールの箱も見てください。</div>' +
        "</div>"
      );
    }
    function resetHTML() {
      return (
        '<div class="login-card" id="loginReset">' +
        markHTML() +
        '<div class="login-title">新しいパスワードを決める</div>' +
        '<div class="login-sub">6文字以上</div>' +
        '<input class="login-inp" id="loginNew" type="password" ' +
        'autocomplete="new-password" placeholder="新しいパスワード">' +
        '<div class="login-err" id="loginResetErr"></div>' +
        '<button class="login-btn login-btn-main" type="button" id="btnSetPass">これにする</button>' +
        "</div>"
      );
    }

    function cardHTML() {
      return (
        "" +
        '<div class="login-card">' +
        // 製品名。渡されなければ今までどおり Exally（このrepoの他の画面は1文字も変わらない）
        markHTML() +
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
        "</div>"
      );
    }

    var $ = function (id) {
      return document.getElementById(id);
    };
    /* ★札(カード)を差し替える作りになったので、今 出ていない部品を触りに行かない★
       （再設定の札には loginErr も loginPass も無い＝素で触ると そこで止まる） */
    function err(msg) {
      var e = $("loginErr");
      if (e) e.textContent = msg || "";
    }
    function busy(on) {
      ["btnLogin", "btnSignup", "btnForgot"].forEach(function (id) {
        var b = $(id);
        if (b) b.disabled = on;
      });
    }
    function ok(user) {
      err("");
      var p = $("loginPass");
      if (p) p.value = "";
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
      /* ★戻り先に自分の目印を付ける★＝Supabase の付け方（# か ? か type=recovery）が
         版で変わっても、こちらで拾える。★このURLは倉庫の「戻ってよい一覧」に入っている事★ */
      var r = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: location.origin + location.pathname + "?" + RESET_MARK,
      });
      busy(false);
      if (r && r.error) {
        err(friendly(r.error));
        return;
      }
      showResetSent(email);
    }

    async function setNewPass() {
      var pw = $("loginNew").value;
      if (!pw || pw.length < 6) {
        $("loginResetErr").textContent = "6文字以上で決めてください";
        return;
      }
      $("loginResetErr").textContent = "";
      $("btnSetPass").disabled = true;
      var r = await sb.auth.updateUser({ password: pw });
      $("btnSetPass").disabled = false;
      if (r && r.error) {
        $("loginResetErr").textContent = friendly(r.error);
        return;
      }
      recoveryOn = false;
      cleanUrl();
      // 決め終わった時点で もう入れている＝ログイン画面に戻さない
      ok((r && r.data && r.data.user) || null);
    }

    function bindCard() {
      $("btnLogin").onclick = login;
      $("btnSignup").onclick = signup;
      if ($("btnForgot")) $("btnForgot").onclick = forgot;
      $("loginPass").onkeydown = function (ev) {
        if (ev.key === "Enter") login();
      };
    }
    function bindReset() {
      $("btnSetPass").onclick = setNewPass;
      $("loginNew").onkeydown = function (ev) {
        if (ev.key === "Enter") setNewPass();
      };
    }
    function showLoginForm() {
      ov.innerHTML = cardHTML();
      bindCard();
    }
    function showResetSent(email) {
      ov.innerHTML = sentHTML(email);
      $("btnBackLogin").onclick = showLoginForm;
    }
    function showResetForm() {
      ov.innerHTML = resetHTML();
      bindReset();
      show();
    }

    if (isRecovery()) showResetForm();
    else showLoginForm();
    /* ★Supabase 側からの合図でも受ける★＝目印が消えても行き止まりにしない */
    try {
      if (sb && sb.auth && sb.auth.onAuthStateChange) {
        sb.auth.onAuthStateChange(function (ev) {
          if (ev === "PASSWORD_RECOVERY") {
            recoveryOn = true;
            showResetForm();
          }
        });
      }
    } catch (e) {
      /* 合図が無い版でも 目印で拾えるので止めない */
    }

    return { show: show, hide: hide, error: err, el: ov, isRecovery: isRecovery };
  }

  root.ExallyLogin = { mount: mount, friendly: friendly, isRecovery: isRecovery };
})(typeof window !== "undefined" ? window : this);
