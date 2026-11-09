      // 画面回転・リサイズで請求書プレビューの縮尺を合わせ直す（請求タブ）
      function _onViewportChange() {
        var billing = document.getElementById("scr-billing");
        var invPanel = document.querySelector('#scr-billing .seg-panel[data-seg="invoice"]');
        var billingOn =
          billing.classList.contains("active") && invPanel && invPanel.classList.contains("on");
        if (billingOn) fitInvoice();
      }
      window.addEventListener("resize", _onViewportChange);
      window.addEventListener("orientationchange", _onViewportChange);
      if (window.visualViewport)
        window.visualViewport.addEventListener("resize", _onViewportChange);
      /* ===================================================================
      ログイン（初回だけ・以後はセッション保持で自動）
      =================================================================== */
      // ログイン画面は全アプリ共通の部品（exally-login.js）。ここでは出す・閉じるだけ。
      var LOGIN = null;
      function ensureLogin() {
        if (!LOGIN) {
          LOGIN = ExallyLogin.mount({
            app: "代行請求",
            // ★司さん「ログイン画面がExally系のままやないか」(2026-08-09)★
            //   代行請求はダイコメの製品。事務所の「請求書 ↗」から来るので、
            //   事務所(dashboard.html)と同じ「🚗 ダイコメ」・同じ青にする。
            //   ★部品の既定は Exally の緑のまま★＝渡しているここだけが変わる。
            brand: "🚗 ダイコメ",
            brandSub: "", // 製品名の右の小さい字は出さない（ダイコメだけを出す）
            theme: {
              accent: "#007aff", // 事務所の --blue
              accentDark: "#0a5fd0", // 事務所の --blue-d
              bg: "#f2f7ff", // 事務所の --bg
              line: "#dbe7f7", // 事務所の --line
              // ★2026-08-21 読ませる字は 薄い黒（#333/#555/#666）★
              //   指示役が実配信のログイン画面から値で数えて見つけた：
              //   説明3行が #5A6B82／アプリ名が #14243D／見出し「🚗 ダイコメ」が #007AFF だった。
              //   ★客が一番先に見る画面が 直っていなかった★（私は画面を名指しで選んで数えていた）
              title: "#333333",
              ink: "#333333",
              muted: "#555555",
              link: "#0a5fd0",
              danger: "#e0483d", // 事務所の --danger
              shadow: "rgba(20,36,61,.10)",
            },
            sb: SB,
            onLogin: function (user) {
              onLoggedIn(user);
            },
          });
        }
        return LOGIN;
      }
      async function doLogout() {
        await SB.auth.signOut();
        location.reload();
      }
      function onLoggedIn(user) {
        CURRENT_ACCOUNT = user.id; // 各業者＝ログインユーザー
        ensureLogin().hide();
        var al = document.getElementById("acctLine");
        if (al) al.textContent = "ログイン中：" + (user.email || "");
        startApp();
      }
      function showLoad(msg) {
        document.getElementById("loadMsg").textContent = msg || "読み込み中…";
        document.getElementById("loadSpin").style.display = "block";
        document.getElementById("loadRetry").style.display = "none";
        document.getElementById("loadOverlay").classList.add("on");
      }
      function showLoadError(msg) {
        document.getElementById("loadMsg").textContent = msg;
        document.getElementById("loadSpin").style.display = "none";
        document.getElementById("loadRetry").style.display = "";
        document.getElementById("loadOverlay").classList.add("on");
      }
      function hideLoad() {
        document.getElementById("loadOverlay").classList.remove("on");
      }
      async function startApp() {
        showLoad("クラウドから読み込み中…");
        var ok;
        try {
          ok = await loadAllCloud();
        } catch (e) {
          ok = false;
        }
        if (!ok) {
          showLoadError("読み込みに失敗しました。通信を確認してもう一度。");
          return;
        }
        hideLoad();
        // ★読めなかった 物が 在れば 最初に 知らせる★（請求書・入金・自社情報の 保存は 止まる）
        if (yomenaiNo().length)
          toast(yomenaiBun(yomenaiNo(), "請求書の 作成と 入金・自社情報の 保存"));
        refreshCompanySelects();
        showScreen("input");
        updatePayBadge();
        // ★プレビュー資産(pdf-lib/fontkit/フォント約3MB/pdf.js)を裏で先読み＝編集/請求を開いた時に待たせない。
        //   入力画面が見えてから少し遅らせて開始（初期描画と競合させない）。
        setTimeout(warmPreviewAssets, 60);
      }
      var _previewAssetsWarmed = false;
      function warmPreviewAssets() {
        if (_previewAssetsWarmed) return;
        _previewAssetsWarmed = true;
        try {
          var f =
            typeof currentIssuer === "function" && currentIssuer() ? currentIssuer().pdfFont : null;
          if (typeof ensurePdfjs === "function") ensurePdfjs(); // pdf.jsを温める
          if (window.InvoicePDF && InvoicePDF.warmup)
            InvoicePDF.warmup(f).then(function () {
              _prebuildPreview(); // 資産が温まったら最有力の請求書を裏で先行ビルド→開いた瞬間はキャッシュ命中
            });
        } catch (e) {}
      }
      // ログイン後の空き時間に「最新月×データのある会社」の請求書を1枚だけ先行ビルドしてキャッシュ。
      //   編集/請求タブを開いた時は再ビルド不要＝描画だけ（解像度はそのまま）。
      async function _prebuildPreview() {
        if (yomenaiNo(YOMENAI_ZEN).length) return; // ★取って来られなかった 物が 在れば 先作り しない★
        try {
          if (!window.InvoicePDF || !InvoicePDF.buildOne) return;
          var rowsAll = DB.filter(function (r) {
            return r.account_id === CURRENT_ACCOUNT;
          });
          if (!rowsAll.length) return;
          var months = [];
          rowsAll.forEach(function (r) {
            var mm = String(r.日付 || "").slice(0, 7);
            if (mm && months.indexOf(mm) < 0) months.push(mm);
          });
          months.sort();
          var month = months[months.length - 1];
          if (!month) return;
          var co = (
            rowsAll.filter(function (r) {
              return inMonth(r.日付, month);
            })[0] || {}
          ).会社名;
          if (!co || !MASTER[co]) return;
          var rows = DB.filter(function (r) {
            return r.account_id === CURRENT_ACCOUNT && r.会社名 === co && inMonth(r.日付, month);
          }).sort(function (a, b) {
            return (
              (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
            );
          });
          if (!rows.length) return;
          var iss = issuerForEngine(co, month); // ★この会社のテンプレ（プレビュー先読みも会社毎）・★繰越は 先読みの 月で（注B）
          var sig = _invSig1(co, month, iss, rows);
          if (_invCache.sig === sig && _invCache.bytes) return; // 既にキャッシュ済み
          var bytes = await InvoicePDF.buildOne(
            MASTER,
            co,
            rows,
            month,
            iss,
            invoiceNoMiru(month, co)
          );
          _invCache = { sig: sig, bytes: bytes };
        } catch (e) {}
      }
      async function boot() {
        var sess = await SB.auth.getSession();
        var session = sess && sess.data ? sess.data.session : null;
        if (session && session.user) {
          onLoggedIn(session.user); // 既にログイン済み＝自動で入る
        } else {
          ensureLogin().show(); // 初回＝ログイン画面
        }
      }
      // ★数字入力欄(.fnum)に予測変換・オートフィルで文章が混入するのを防ぐ：
      //   入力されるたびに数字と小数点以外を即座に取り除く（iOSの予測バー対策）。
      document.addEventListener("input", function (e) {
        var t = e.target;
        if (t && t.classList && t.classList.contains("fnum")) {
          var clean = String(t.value).replace(/[^0-9.]/g, "");
          if (clean !== t.value) t.value = clean;
        }
      });
      boot();
