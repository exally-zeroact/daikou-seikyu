# ログイン画面の共通化（全アプリ同じ見た目・同じ言い方）

一次情報は **`exally-login.js`**（このリポジトリの直下）。見た目も文言もここだけを直せば全アプリに効く。
各アプリに書き写さない。

## もう入っているもの（このリポジトリ）

| アプリ             | 状態                                                   |
| ------------------ | ------------------------------------------------------ |
| 売上管理（飲み屋） | 差し替え済み。`ExallyLogin.mount({app:"売上管理", …})` |
| 代行請求           | 差し替え済み。`ExallyLogin.mount({app:"代行請求", …})` |

テスト = `tests/e2e/login-shared.spec.js`（両アプリで、出るもの・並び・文言・案内が2行・カードの幅380px/角丸20px/余白26pxを実測で固定。登録して入れる／開き直すと自動で入る、も確認）。

## まだ入っていないもの（別リポジトリ）

- **Kyually**（`payslip-app` / テストは `payslip-app-test`）
- **ハブ**（`exally` / テストは `exally-staging`）

★どちらも別セッションが同じファイルを触っている最中に当てると壊れる。
　作業が空いているのを確かめてから当てること。

## 当て方（3手順）

1. `exally-login.js` を `js/exally-login.js` としてコピーする
2. HTML で、そのアプリの `js/auth.js` の**前**に読み込む
   ```html
   <script src="js/exally-login.js?v=1"></script>
   <script src="js/auth.js?v=…"></script>
   ```
3. `js/auth.js` の「自前のCSS＋オーバーレイの組み立て」と「ログイン／新規登録ボタンの配線」を消し、
   代わりに部品を組み立てる。利用権ゲート（`gateCheck`/`showLock`）やログアウトの処理はそのまま残す。

   ```js
   var LOGIN = window.ExallyLogin.mount({
     app: "給料明細", // ハブなら "Exally"
     sb: SB, // supabase クライアント。Kyually は Store.auth を下の形に包む
     note: "ログインすると、どの端末でも同じ内容で使えます。",
     onLogin: function (user) {
       afterLogin((user && user.email) || "");
     },
   });
   function show() {
     LOGIN.show();
   }
   function hide() {
     LOGIN.hide();
   }
   function msg(t, err) {
     if (err) LOGIN.error(t || "");
   }
   ```

   Kyually は `Store.auth`（`signIn(email,pw)` / `signUp(email,pw)`）なので、supabase と同じ形に包んで渡す:

   ```js
   sb: {
     auth: {
       signInWithPassword: function (c) {
         return A.signIn(c.email, c.password);
       },
       signUp: function (c) {
         return A.signUp(c.email, c.password);
       },
     },
   }
   ```

   利用停止の画面（`showLock`）は、部品の枠 `LOGIN.el` の中に同じカードの見た目で描く:

   ```js
   ov.innerHTML =
     '<div class="login-card"><div class="login-logo">Exally <span>エクサリー</span></div>' +
     '<div class="login-title">給料明細</div>' +
     '<div class="login-mid" style="color:#92500A;font-weight:700">' +
     m.title +
     "</div>" +
     '<button class="login-btn login-btn-sub" style="margin-top:14px" id="auth-lock-out" type="button">別のアカウントでログイン</button></div>';
   ```

## Kyually 用の出来上がり（そのまま当てられる）

`docs/exally-login-kyually.patch` に、`index.html` と `js/auth.js` の差分を置いてある。

```
cd payslip-app
cp ../Exally-test/exally-login.js js/exally-login.js
git apply ../Exally-test/docs/exally-login-kyually.patch
```

当てたら `npm test` と実ブラウザ（テストURL）でログイン→入れることを確認する。

## 出す要素のid（テストや他アプリから触る用）

`#loginOv` / `#loginEmail` / `#loginPass` / `#loginErr` / `#btnLogin` / `#btnSignup`
