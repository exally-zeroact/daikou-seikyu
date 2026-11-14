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
      function _coFp(m) {
        if (!m) return "";
        return JSON.stringify({
          w: m.widths,
          a: m.aligns,
          i: m.items,
          l: m.labels,
          lead: m.lead,
          tt: m.tableTitle,
          ns: m.noteSummary,
          ng: m.noteGroups,
        });
      }
      function _rowsFp(rows) {
        return JSON.stringify(
          rows.map(function (r) {
            var o = {};
            Object.keys(r).forEach(function (k) {
              if (k !== "id" && k !== "account_id" && k !== "_dbid" && k !== "_created")
                o[k] = r[k];
            });
            return o;
          })
        );
      }
      function _invSig1(co, month, iss, rows) {
        return (
          "1|" +
          co +
          "|" +
          month +
          "|" +
          invoiceNoMiru(month, co) +
          "|" +
          _issFp(iss) +
          "|" +
          _coFp(MASTER[co]) +
          "|" +
          _rowsFp(rows)
        );
      }
      function _invEmpty(out, msg, seq) {
        if (seq !== _invSeq) return;
        out.classList.remove("inv-loading");
        out.innerHTML = '<div class="li-empty">' + msg + "</div>";
        out.style.height = "";
      }
      // 請求書のプレビュー枠（請求タブ=invoiceOut）を返す。
      function activeInvOut() {
        return (
          document.querySelector(".screen.active .inv-out") || document.getElementById("invoiceOut")
        );
      }
      async function _doGenerateInvoices() {
        var out = activeInvOut();
        if (!out) return;
        // ★画面の 請求書も 読めなかった 物が 在れば 描かない★（既定の 振込先・0円 入金の 繰越を 見せない）
        var yk = yomenaiNo(SEIKYU_KEYS);
        if (yk.length) {
          out.classList.remove("inv-loading");
          out.innerHTML =
            '<div class="yomenai-obi" style="padding:16px;color:#b42318;font-weight:700">' +
            esc(yomenaiBun(yk, "請求書の 表示")) +
            "</div>";
          return;
        }
        ensureLogoTrimmed(); // 既存ロゴの余白を一度だけ自動トリミング（揃え）
        var mSel = document.getElementById("invMonth");
        var month = mSel ? mSel.value : "";
        var onlyCo = document.getElementById("invCompany").value;
        var seq = ++_invSeq;
        if (!month) return _invEmpty(out, "月を選んでください", seq);
        // ★入金を 読めない 時、前回繰越を 載せる 会社の 紙は 描かない★ 2026-11-02（注C・対立役 止1）
        //   発行の ボタンは 止まっても、描いた プレビューは ブラウザの 印刷（Ctrl+P）で そのまま A4 に 刷れる
        //   ＝入金を 知らずに 数えた 御請求金額の 紙が 外へ 出る。門は 発行の ボタン（updateRegnoGate）と 同じ 条件
        if (YOMENAI.payments) {
          var _pkuri = (onlyCo ? [onlyCo] : tsukiNoKaisha(month)).filter(function (c) {
            return MASTER[c] && MASTER[c].carryover;
          });
          if (_pkuri.length) {
            out.classList.remove("inv-loading");
            out.innerHTML =
              '<div class="yomenai-obi" style="padding:16px;color:#b42318;font-weight:700">' +
              esc(
                "通信が 途切れて 入金 を 取って来られませんでした。前回繰越を 載せる " +
                  _pkuri.join("・") +
                  " の 請求書は 表示 しません。画面を 開き直してください。"
              ) +
              "</div>";
            out.style.height = "";
            return;
          }
        }
        if (typeof InvoicePDF === "undefined")
          return _invEmpty(out, "PDFモジュール読み込み中…少し待って操作してください", seq);
        var iss = issuerForEngine();
        out.classList.add("inv-loading"); // 既存プレビューの上に「作成中」を重ねる（チラつき防止）
        try {
          var bytes, sig;
          if (onlyCo) {
            var rows = DB.filter(function (r) {
              return (
                r.account_id === CURRENT_ACCOUNT && r.会社名 === onlyCo && inMonth(r.日付, month)
              );
            }).sort(function (a, b) {
              return (
                (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
              );
            });
            if (!rows.length) return _invEmpty(out, "該当する明細がありません", seq);
            var _coIss = issuerForEngine(onlyCo, month); // ★この会社のテンプレ（未設定は全体）・★繰越は 描く 月で（注B 2026-11-02）
            sig = _invSig1(onlyCo, month, _coIss, rows);
            if (_invCache.sig === sig && _invCache.bytes) {
              bytes = _invCache.bytes; // ★同内容＝再ビルドを飛ばす（約0.7秒節約）
            } else {
              bytes = await InvoicePDF.buildOne(
                MASTER,
                onlyCo,
                rows,
                month,
                _coIss,
                invoiceNoMiru(month, onlyCo)
              );
              _invCache = { sig: sig, bytes: bytes };
            }
          } else {
            var monthRows = DB.filter(function (r) {
              return r.account_id === CURRENT_ACCOUNT && inMonth(r.日付, month);
            });
            sig =
              "0|" +
              month +
              "|" +
              _issFp(iss) +
              "|" +
              JSON.stringify(MASTER) +
              "|" +
              _rowsFp(monthRows) +
              "|" +
              // ★会社ごとの 繰越も 鍵に★（全社まとめは 会社ごとの 様式で 描く＝その 繰越が 変われば 描き直す）
              JSON.stringify(
                Object.keys(MASTER).map(function (c) {
                  return _carryFor(c, month);
                })
              );
            if (_invCache.sig === sig && _invCache.bytes) {
              bytes = _invCache.bytes;
            } else {
              bytes = await InvoicePDF.buildMonth(
                MASTER,
                DB,
                month,
                CURRENT_ACCOUNT,
                iss,
                function (co) {
                  return issuerForEngine(co, month); // ★全社まとめPDFも会社毎テンプレで描き分け・★繰越は 描く 月で（注B）
                }
              );
              if (!bytes) return _invEmpty(out, "該当する明細がありません", seq);
              _invCache = { sig: sig, bytes: bytes };
            }
          }
          if (seq !== _invSeq) return; // 新しい要求が来ていたら破棄
          await renderInvoicePreviewPDF(bytes, seq);
        } catch (e) {
          if (seq === _invSeq)
            _invEmpty(out, "プレビュー作成に失敗：" + (e && e.message ? e.message : e), seq);
        } finally {
          if (seq === _invSeq) out.classList.remove("inv-loading");
        }
      }
