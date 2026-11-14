      function kireIchi() {
        // 板の 上は テスト線の 帯の 下・ログインの 箱は 板の 下から（欄を 覆わない）
        var b = document.getElementById("kireShirase");
        var ov = LOGIN && LOGIN.el;
        if (!b) {
          if (ov) {
            ov.style.paddingTop = "";
            ov.style.alignItems = "";
          }
          return;
        }
        // 枠（exally-login.js）は 真ん中寄せ＝上を 空けると 箱の 頭が 送っても 戻らない 所へ はみ出す（360x640 で 82px・ロゴが 板の 下）→ 板の 間は 上詰め
        if (ov) ov.style.alignItems = "flex-start";
        var band = document.getElementById("testBand");
        var top = band && band.offsetParent !== null ? band.getBoundingClientRect().bottom : 0;
        b.style.top = Math.max(0, Math.round(top)) + 8 + "px";
        if (ov) ov.style.paddingTop = Math.ceil(b.getBoundingClientRect().bottom) + 8 + "px";
      }
      window.addEventListener("resize", kireIchi);
      function kireTasu(msg, mae) {
        var b = kireIta();
        var ul = b.querySelector(".kire-list");
        var last = ul.lastElementChild;
        msg = String(msg);
        if (last && last.dataset.ji === msg) {
          var n = Number(last.dataset.n || 1) + 1;
          last.dataset.n = n;
          last.textContent = (last.dataset.mae ? "切れる直前：" : "") + msg + "（×" + n + "）";
        } else {
          var li = document.createElement("li");
          li.dataset.ji = msg;
          if (mae) li.dataset.mae = "1";
          li.textContent = (mae ? "切れる直前：" : "") + msg;
          ul.appendChild(li);
        }
        kireIchi();
      }
      function kagiKireta() {
        if (KAGI_KIRE) return;
        KAGI_KIRE = true;
        var d = new Date();
        var old = document.getElementById("kireShirase");
        if (old) old.remove();
        var b = kireIta();
        b.querySelector(".kire-ji").textContent =
          "ログインが切れました（" +
          d.getHours() +
          ":" +
          String(d.getMinutes()).padStart(2, "0") +
          "）。この後の保存・削除は倉庫に届いていないかもしれません。もう一度ログインすると画面を倉庫の中身で読み直します。入れ直す前に、読み直した一覧で在るかを確かめてください。下は切れた後に画面が出した知らせです。";
        // 最後に 倉庫へ 通した 時より 後に 出た 字（出た 順）
        var kara = T_TOOTTA - 2000;
        SAKKI.filter(function (x) {
          return x.t >= kara;
        }).forEach(function (x) {
          kireTasu(x.ji, true);
        });
        // toastDebounced の 待ちは 消さない（450ms 後に 旗の 道で 板へ 並ぶ＝字を 捨てない）
        var t = document.getElementById("toast");
        if (t) {
          clearTimeout(t._tm);
          t.classList.remove("show");
        }
        toastUndoKesu();
        var obi = document.getElementById("hakkoObi");
        if (obi && obi.textContent.trim()) {
          kireTasu(obi.textContent.replace(/\s+/g, " ").trim(), true);
          hakkoObiKesu();
        }
        ensureLogin().show();
        kireIchi();
      }
      function kireTojiru() {
        var b = document.getElementById("kireShirase");
        if (b) b.remove();
        kireIchi();
      }
      function kagiChigatta() {
        try {
          sessionStorage.setItem("kagiChigau", "1");
        } catch (e) {}
        location.reload();
      }
      // 直に fetch する 所（口を 通らない）の 門＝入った人の 鍵の 時だけ true
      function kagiMon(tok) {
        if (!LOGGED_IN_ID) return !!tok;
        var sub = tok ? window.KagiFetch.kagiNoSub(tok) : null;
        if (sub === LOGGED_IN_ID) return true;
        if (sub) kagiChigatta();
        else kagiKireta();
        return false;
      }

      /* ===================================================================
      画面切替
      =================================================================== */
      function showScreen(name) {
        hakkoObiKesu(); // 出す 前の 見張りの 帯は 画面を 移ったら 消す（対立役 注4）
        if (window.PdfOkuru) PdfOkuru.kesu(); // 「送る・印刷する」の 帯も 消す（古い 紙を 送らない）
        var titles = {
          input: "明細入力",
          list: "明細一覧",
          billing: "請求 / 集計",
          payment: "入金管理",
          settings: "設定",
        };
        document.querySelectorAll(".screen").forEach(function (s) {
          s.classList.remove("active");
        });
        document.getElementById("scr-" + name).classList.add("active");
        document.querySelectorAll(".nav-item").forEach(function (b) {
          b.classList.toggle("active", b.dataset.scr === name);
        });
        document.getElementById("appTitle").textContent = titles[name] || "代行請求";
        // ★2026-08-21 A2-③ 画面を切り替えたら 頭を出す★（前の画面のスクロール位置が残り、
        //   一番上の説明文が途中から見えていた）
        try {
          window.scrollTo(0, 0);
        } catch (e) {}
        if (name === "input") preselectInputCompany();
        if (name === "list") renderList();
        if (name === "billing") showBillingSeg("invoice"); // 既定＝請求書
        if (name === "payment") renderPayments();
        if (name === "settings") {
          showSettingsSeg("master"); // 既定＝会社マスタ
        }
        updatePayBadge();
        window.scrollTo(0, 0);
      }
      // タブ内サブ切替（請求＝請求書/集計）
      function showBillingSeg(seg) {
        if (window.PdfOkuru) PdfOkuru.kesu(); // 請求書の 帯を 集計の 上に 残さない（本番前の 対立役 注1 2026-11-06）
        document.querySelectorAll("#scr-billing .seg-panel").forEach(function (p) {
          p.classList.toggle("on", p.dataset.seg === seg);
        });
        document.querySelectorAll("#scr-billing .seg-btn").forEach(function (b) {
          b.classList.toggle("on", b.dataset.seg === seg);
        });
        if (seg === "invoice") {
          refreshInvoiceSelects();
          syncInvoiceToolbar(); // テンプレ強調＋書体名＋プレビュー書体を現在値に
          generateInvoices(true); // 画面入場＝即ビルド（debounce無し）
        } else {
          renderReport();
        }
      }
      // タブ内サブ切替（設定＝会社マスタ/自社情報）
      function showSettingsSeg(seg) {
        document.querySelectorAll("#scr-settings .seg-panel").forEach(function (p) {
          p.classList.toggle("on", p.dataset.seg === seg);
        });
        document.querySelectorAll("#scr-settings .seg-btn").forEach(function (b) {
          b.classList.toggle("on", b.dataset.seg === seg);
        });
        if (seg === "master") renderMaster();
        else if (seg === "template") renderTemplates();
        else if (seg === "yomu") renderYomuKuchi();
        else renderIssuer();
      }
      // ===== デザイン×種類ギャラリー（サムネ＝デザイン別SVG・サンプル固定でテナント安全） =====
      function renderTemplates() {
        var g = document.getElementById("tplGallery");
        if (!g) return;
        var s = currentIssuer();
        var design = s.pdfDesign || "elegant";
        var curVar =
          design === "classic" ? s.classicVariant || "diag_logo" : s.elegantVariant || "logo";
        var seg = document.getElementById("designSeg");
        if (seg)
          seg.innerHTML = Object.keys(DESIGN_LABELS)
            .map(function (d) {
              return (
                '<button type="button" class="dseg-btn' +
                (d === design ? " on" : "") +
                '" onclick="setDesignDefault(\'' +
                d +
                "')\">" +
                DESIGN_LABELS[d] +
                "</button>"
              );
            })
            .join("");
        g.innerHTML = designVariants(design)
          .map(function (v) {
            return (
              '<button type="button" class="tpl-card' +
              (v.key === curVar ? " on" : "") +
              '" onclick="setVariantDefault(\'' +
              design +
              "','" +
              v.key +
              "')\">" +
              '<div class="tpl-badge">✓</div>' +
              tplThumbBox(design, v) +
              '<div class="tpl-meta"><div class="tpl-name">' +
              v.label +
              '</div><div class="tpl-desc">' +
              v.desc +
              "</div></div>" +
              "</button>"
            );
          })
          .join("");
        paintTplThumbs(g); // ★見本＝実際の紙（作った順に1枚ずつ入る）★
        var hint = document.getElementById("tplLogoHint");
        if (hint) {
          var needLogo =
            designVariants(design).filter(function (x) {
              return x.key === curVar;
            })[0].logoMode === "show";
          hint.style.display = needLogo && !currentIssuer().logo ? "block" : "none";
        }
      }
      function setDesignDefault(design) {
        if (!DESIGN_VARIANTS[design]) return;
        setIssuer("pdfDesign", design);
        renderTemplates();
        toast(DESIGN_LABELS[design] + " に設定しました");
      }
      function setVariantDefault(design, key) {
        if (
          !designVariants(design).some(function (v) {
            return v.key === key;
          })
        )
          return;
        setIssuer("pdfDesign", design);
        setIssuer(design === "classic" ? "classicVariant" : "elegantVariant", key);
        renderTemplates();
        var v = designVariants(design).filter(function (x) {
          return x.key === key;
        })[0];
        toast(DESIGN_LABELS[design] + "・" + (v ? v.label : key) + " に設定しました");
      }
      // 入金タブの未入金バッジ（未入金＋一部入金の件数）
      /* ★★入金を 読めない 時は 入金・残額・状態を 描かない★★ 2026-11-04
              PAYMENTS が 空（最初の 読み込みの 失敗）か 古い（読み直しの 失敗）まま 数えると
              「入金 ¥0・全部 未入金」と 嘘を 描く（書き込みは yomenaiTomeru で 止まって いた）。
              見せる 所は 全部 この 1本で 分ける。 */
      function nyukinFumei() {
        return !!YOMENAI.payments;
      }
      var NYUKIN_FUMEI_JI =
        "通信が 途切れて 入金 を 取って来られませんでした。入金・残額・入金の状態は 出せません（入金の記録だけの月は 出ていない事が あります）。画面を 開き直してください。";
      function nyukinFumeiObi(id) {
        return (
          '<div class="yomenai-obi" id="' +
          id +
          '" style="padding:10px 12px;margin:0 0 10px;color:#b42318;font-weight:700;font-size:13px">' +
          esc(NYUKIN_FUMEI_JI) +
          "</div>"
        );
      }
