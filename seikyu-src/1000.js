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
      // PDF bytes を pdf.js で 1ページ=1枚の canvas に描画（.sheet 包み＝印刷もページ送り維持）。
      async function renderInvoicePreviewPDF(bytes, seq) {
        var out = activeInvOut();
        var pdfjs = await ensurePdfjs();
        if (seq !== _invSeq) return;
        // pdf.js は渡した配列を detach するのでコピーを渡す
        var pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
        if (seq !== _invSeq) return;
        var inner = document.createElement("div");
        inner.className = "invScaleInner";
        for (var p = 1; p <= pdf.numPages; p++) {
          var pg = await pdf.getPage(p);
          var vp = pg.getViewport({ scale: 2 }); // 高解像度＝印刷でもくっきり
          var cv = document.createElement("canvas");
          cv.width = vp.width;
          cv.height = vp.height;
          cv.className = "inv-pdf-canvas";
          var sheet = document.createElement("div");
          sheet.className = "sheet sheet-pdf";
          sheet.dataset.page = p; // 何ページ目か（ページ切替で表示制御）
          sheet.appendChild(cv);
          inner.appendChild(sheet);
          await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
          if (seq !== _invSeq) return;
        }
        out.innerHTML = "";
        out.appendChild(inner);
        fitInvoice();
      }
      // 請求書PDFのbytes生成（保存/印刷で共有）。該当なし等は toast して null を返す。
      async function _buildInvoiceBytes() {
        if (yomenaiTomeru(SEIKYU_KEYS, "請求書の 作成")) return null;
        var _jng = jishaNg(currentIssuer());
        if (_jng) {
          toast(_jng);
          return null;
        }
        var _m0 = document.getElementById("invMonth").value;
        var _c0 = document.getElementById("invCompany").value;
        if (_m0 && kurikoshiTomeru(_c0 ? [_c0] : tsukiNoKaisha(_m0), "請求書の 作成")) return null;
        var month = document.getElementById("invMonth").value;
        if (!month) {
          toast("月を選んでください");
          return null;
        }
        var onlyCo = document.getElementById("invCompany").value;
        // ★出す 前の 見張り★ 2026-11-04（番号を 台帳に 書く 前・「該当なし」の 前＝倉庫に だけ 在る 会社も 拾う）
        if (!(await yomiNaoshiMon(month, onlyCo, "請求書の 作成"))) return null;
        if (kurikoshiTomeru(onlyCo ? [onlyCo] : tsukiNoKaisha(month), "請求書の 作成")) return null;
        if (!hakkoMon(month, onlyCo ? [onlyCo] : tsukiNoKaisha(month))) return null;
        var iss = issuerForEngine();
        var bytes, fname;
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
          if (!rows.length) {
            toast("該当する明細がありません");
            return null;
          }
          // ★番号は1回だけ決めて 紙と控えの両方に同じ物を使う★
          //   別々に取ると「紙の番号と控えの番号が違う」が起きる（実際に一度そう書いてしまった）
          var _no;
          try {
            _no = await issueInvoiceNo(month, onlyCo); // ★決めるのはここ1回だけ★（倉庫の 台帳に 書けた 番号）
          } catch (e) {
            toast(bangouNgBun(e));
            return null;
          }
          bytes = await InvoicePDF.buildOne(
            MASTER,
            onlyCo,
            rows,
            month,
            issuerForEngine(onlyCo, month), // ★繰越は 1回 読んだ 月で（番号を 待つ 間に #invMonth が 変わっても ずれない・注1 2026-11-02）
            _no
          );
          await writeInvoiceCopies([
            makeInvoiceCopy(month, onlyCo, rows, issuerForEngine(onlyCo, month), _no),
          ]);
          fname = "請求書_" + month + "_" + onlyCo + ".pdf";
        } else {
          // ★全社も 描く 前に 全部の 会社の 番号を 台帳に 書く★（1社でも 書けなければ 作らない）
          var _nos = {};
          var _tcos = tsukiNoKaisha(month);
          if (!_tcos.length) {
            toast("該当する明細がありません");
            return null;
          }
          try {
            for (var _ti = 0; _ti < _tcos.length; _ti++)
              _nos[_tcos[_ti]] = await issueInvoiceNo(month, _tcos[_ti]);
          } catch (e) {
            toast(bangouNgBun(e));
            return null;
          }
          bytes = await InvoicePDF.buildMonth(
            MASTER,
            DB,
            month,
            CURRENT_ACCOUNT,
            iss,
            function (co) {
              return issuerForEngine(co, month); // ★全社も 1回 読んだ 月の 繰越（注1）
            },
            function (co) {
              if (!_nos[co]) throw new Error("請求番号が 決まっていない 会社: " + co);
              return _nos[co];
            }
          );
          if (!bytes) {
            toast("該当する明細がありません");
            return null;
          }
          // ★全社まとめは 控えを 書かない★ 2026-11-01（司さん「出した後に明細が変わりました」の 警告は 全部 消す）
          //   10-14〜11-01 は 警告の 材料に 印 zensha 付きで 写しを 残していた（繰越・番号には 使わない 物）。
          //   警告が 無くなり 読む 所が 0＝書かない。番号は 上の issueInvoiceNo が 台帳（invoice_no）に 書く
          fname = "請求書_" + month + "_全社.pdf";
        }
        return { bytes: bytes, fname: fname, month: month, onlyCo: onlyCo };
      }
