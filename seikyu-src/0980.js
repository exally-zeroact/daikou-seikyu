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
      function updatePayBadge() {
        var el = document.getElementById("payBadge");
        if (!el) return;
        if (nyukinFumei()) {
          el.textContent = "?";
          el.classList.add("on");
          el.title = "入金を 読めません";
          el.setAttribute("aria-label", "入金を 読めません");
          return;
        }
        el.removeAttribute("title");
        el.removeAttribute("aria-label");
        var n = summarize(null, "").rows.filter(function (x) {
          return x.st !== "paid";
        }).length;
        el.textContent = n > 99 ? "99+" : String(n);
        el.classList.toggle("on", n > 0);
      }

      /* ===================================================================
      請求書プレビュー（定義から自動生成・エンジンで描画）
      =================================================================== */
      function refreshInvoiceSelects() {
        var ms = document.getElementById("invMonth");
        var keepM = ms.value;
        var present = {};
        DB.forEach(function (r) {
          if (r.account_id === CURRENT_ACCOUNT && r.日付) present[r.日付.slice(0, 7)] = true;
        });
        var months = Object.keys(present).sort().reverse();
        ms.innerHTML =
          '<option value="">― 月を選択 ―</option>' +
          months
            .map(function (m) {
              var p = m.split("-");
              return (
                '<option value="' + m + '">' + Number(p[0]) + "年" + Number(p[1]) + "月</option>"
              );
            })
            .join("");
        if (months.indexOf(keepM) >= 0) ms.value = keepM;
        else if (months.length) ms.value = months[0]; // 既定＝最新月
        var cs = document.getElementById("invCompany");
        var keepC = cs.value;
        // ★会社マスタの会社に加え、マスタから消えても明細が残る孤児会社も選べる＝請求漏れ防止。
        //   InvoicePDF.billableCompanies と同じ並び（マスタ順→孤児名前順）で全社PDFと一致させる。
        var names = InvoicePDF.billableCompanies(MASTER, DB, CURRENT_ACCOUNT);
        cs.innerHTML =
          '<option value="">全社</option>' +
          names
            .map(function (n) {
              return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
            })
            .join("");
        if (names.indexOf(keepC) >= 0 || keepC === "") cs.value = keepC;
      }
      // ===== 請求タブ プレビュー＝実PDFをそのまま描画（WYSIWYG・選んだデザインがそのまま見える） =====
      // pdf.js は vendor から遅延ロード（CDN不使用＝オフラインOK）。
      var _pdfjsReady = null;
      function ensurePdfjs() {
        if (_pdfjsReady) return _pdfjsReady;
        _pdfjsReady = new Promise(function (res, rej) {
          if (window.pdfjsLib) return res(window.pdfjsLib);
          var s = document.createElement("script");
          s.src = "vendor/pdf.min.js";
          s.onload = function () {
            res(window.pdfjsLib);
          };
          s.onerror = function () {
            rej(new Error("pdf.js読込失敗"));
          };
          document.head.appendChild(s);
        }).then(function (lib) {
          lib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
          return lib;
        });
        return _pdfjsReady;
      }
      var _invSeq = 0;
      var _invGenTimer = null;
      // immediate=true（画面入場時）は debounce を挟まず即ビルド＋即「作成中」表示＝待ち感ゼロ。
      // 引数なし（連続編集）は従来どおり 220ms でまとめる。
      function generateInvoices(immediate) {
        // ★紙が 変わる（月・会社・様式・自社情報）＝前の 紙の「送る・印刷する」の 帯は 消す★
        //   残すと 会社を 変えた 後に 前の 会社の PDF を 送る（対立役 注1 2026-11-06）
        if (window.PdfOkuru) PdfOkuru.kesu();
        updateRegnoGate(); // ★紙を出す前に 登録番号を見る★
        if (_invGenTimer) clearTimeout(_invGenTimer);
        if (immediate) {
          var out = activeInvOut();
          if (out) out.classList.add("inv-loading"); // 空白白画面でなく即「作成中」を出す
          _invGenTimer = setTimeout(_doGenerateInvoices, 0);
        } else {
          _invGenTimer = setTimeout(_doGenerateInvoices, 220); // 0.6sのPDF生成を連続変更でまとめる
        }
      }
      // ★ビルド結果キャッシュ：同じ内容なら約0.7秒の再ビルド(フォント埋込)を飛ばす（解像度は不変）。
      var _invCache = { sig: null, bytes: null };
      function _issFp(iss) {
        return JSON.stringify({
          d: iss.pdfDesign,
          h: iss.headerStyle,
          lm: iss.logoMode,
          t: iss.templateId,
          la: iss.lineAlign,
          ba: iss.bankAlign,
          ai: iss.alignIssuer,
          li: iss.lineIssuer,
          pg: iss.posGrand,
          pl: iss.posLead,
          pdu: iss.posDue,
          de: iss.dateEra,
          sn: iss.showInvoiceNo,
          pd: iss.paymentDue,
          hs: iss.hankoSizeMm,
          ls: iss.logoSizeMm,
          fsz: iss.fontScale,
          bfs: iss.blkFs ? JSON.stringify(iss.blkFs) : "",
          f: iss.pdfFont,
          lines: iss.lines,
          bank: iss.bank,
          lg: iss.logo ? iss.logo.length + iss.logo.slice(0, 24) : "",
          hk: iss.hanko ? iss.hanko.length + iss.hanko.slice(0, 24) : "",
          // ★繰越と 内税／外税も 鍵に 入れる★ 2026-11-02（本番前の 対立役 注A）
          //   前は 入れて いなかった＝入金を 記録した・前の 月を 直した・内税／外税を 切り替えた 後も
          //   明細が 同じなら 鍵が 同じ＝プレビューは 古い 上の 御請求金額 の まま（PDF を 作り直すと 正しい 額）
          tx: iss.taxMode,
          cy: iss.carry ? JSON.stringify(iss.carry) : "",
        });
      }
