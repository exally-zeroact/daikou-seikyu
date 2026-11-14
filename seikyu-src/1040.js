      // ===== 請求タブ：テンプレ＆書体をその場で切替（リアルタイム反映） =====
      // 請求タブ：デザイン/種類の切替＝★保存する（既定として永続）★。
      //   以前は「この回だけ(INV_OVERRIDE)」で保存されず、更新/再読込のたびに既定へ戻っていた
      //   （例：エレガント・ロゴなしにしてもロゴありに戻る）。アプリ哲学＝値は保存して全反映、に統一。
      function setInvoiceDesign(design) {
        if (!DESIGN_VARIANTS[design]) return;
        INV_OVERRIDE = null;
        setIssuer("pdfDesign", design); // 保存
        syncInvoiceToolbar();
        generateInvoices();
        toast(DESIGN_LABELS[design] + " にしました");
      }
      function setInvoiceVariant(key) {
        var d = currentIssuer().pdfDesign === "classic" ? "classic" : "elegant";
        var v = designVariants(d).filter(function (x) {
          return x.key === key;
        })[0];
        if (!v) return;
        INV_OVERRIDE = null;
        setIssuer(d === "classic" ? "classicVariant" : "elegantVariant", key); // 保存
        syncInvoiceToolbar();
        generateInvoices();
        toast(v.label + " にしました");
      }
      // 「既定にする」＝今の見た目(一時上書き or 既定)をアカウント既定として保存。
      function makeInvoiceDefault() {
        var dv = resolveDesignVariant();
        setIssuer("pdfDesign", dv.design);
        setIssuer(dv.design === "classic" ? "classicVariant" : "elegantVariant", dv.variant.key);
        INV_OVERRIDE = null; // 既定になったので一時上書き解除
        syncInvoiceToolbar();
        toast(DESIGN_LABELS[dv.design] + "・" + dv.variant.label + " を既定にしました");
      }
      function syncInvoiceToolbar() {
        var dv = resolveDesignVariant();
        // デザイン seg
        var seg = document.getElementById("invDesignSeg");
        if (seg)
          seg.innerHTML = Object.keys(DESIGN_LABELS)
            .map(function (d) {
              return (
                '<button type="button" class="itb-btn' +
                (d === dv.design ? " on" : "") +
                '" onclick="setInvoiceDesign(\'' +
                d +
                "')\">" +
                DESIGN_LABELS[d] +
                "</button>"
              );
            })
            .join("");
        // 種類 chips（選んだデザインの種類だけ）
        var chips = document.getElementById("invVariantChips");
        if (chips)
          chips.innerHTML = designVariants(dv.design)
            .map(function (v) {
              return (
                '<button type="button" class="itb-chip' +
                (v.key === dv.variant.key ? " on" : "") +
                '" onclick="setInvoiceVariant(\'' +
                v.key +
                "')\">" +
                v.label +
                "</button>"
              );
            })
            .join("");
        // 一時上書き中の表示＋「既定にする」
        var note = document.getElementById("invOverrideNote");
        if (note) note.style.display = INV_OVERRIDE ? "flex" : "none";
        var fn = currentIssuer().pdfFont || "BIZ UDPゴシック";
        var nm = document.getElementById("invFontName");
        if (nm) nm.textContent = fn;
        applyPreviewFont(fn, false); // 初期はDLしない（既ロードなら反映）
        // お支払期限（ON/OFF＋日付＋和暦/西暦）の同期
        var s = currentIssuer();
        var dueOn = !!s.showPaymentDue;
        var sw = document.getElementById("invDueSwitch"),
          ctrls = document.getElementById("invDueControls");
        if (sw) {
          sw.classList.toggle("on", dueOn);
          sw.setAttribute("aria-checked", dueOn ? "true" : "false");
        }
        if (ctrls) ctrls.style.display = dueOn ? "inline-flex" : "none";
        var dd = document.getElementById("invDueDate");
        if (dd && document.activeElement !== dd) dd.value = s.paymentDue || "";
        document
          .querySelectorAll('#scr-billing .itb-chip[data-grp="dueEra"]')
          .forEach(function (b) {
            b.classList.toggle("on", b.dataset.a === (s.paymentDueEra || "seireki"));
          });
      }
      // 請求タブ：お支払期限 ON/OFF（トグルスイッチ）。ONで日付入力が出る。
      function toggleInvoiceDue() {
        var on = !currentIssuer().showPaymentDue;
        setIssuer("showPaymentDue", on);
        syncInvoiceToolbar();
        generateInvoices();
        toast(on ? "お支払期限：あり" : "お支払期限：なし");
      }
      // 請求タブ：お支払期限の日付（毎回設定）。
      function setInvoiceDue(v) {
        setIssuer("paymentDue", v || "");
        syncInvoiceToolbar();
        generateInvoices();
        toast(v ? "お支払期限を設定しました" : "お支払期限を空欄にしました");
      }
      function toggleFontList() {
        var pop = document.getElementById("invFontPop");
        if (!pop) return;
        var show = pop.style.display === "none";
        pop.style.display = show ? "block" : "none";
        if (show) {
          renderFontList("");
          var s = document.getElementById("invFontSearch");
          if (s) {
            s.value = "";
            s.focus();
          }
        }
      }
      function renderFontList(q) {
        if (typeof InvoicePDF === "undefined") return;
        q = (q || "").trim();
        var cur = currentIssuer().pdfFont || "BIZ UDPゴシック";
        var list = InvoicePDF.fonts().filter(function (f) {
          return !q || f.indexOf(q) >= 0;
        });
        document.getElementById("invFontList").innerHTML =
          list
            .map(function (f) {
              return (
                '<div class="itb-fopt' +
                (f === cur ? " on" : "") +
                '" onclick="setInvoiceFont(\'' +
                f +
                "')\">" +
                f +
                "</div>"
              );
            })
            .join("") || '<div class="itb-fopt">該当なし</div>';
      }
      function setInvoiceFont(name) {
        setIssuer("pdfFont", name);
        var nm = document.getElementById("invFontName");
        if (nm) nm.textContent = name;
        var pop = document.getElementById("invFontPop");
        if (pop) pop.style.display = "none";
        applyPreviewFont(name, true); // 選んだ時はDLして即反映
        toast("書体を「" + name + "」にしました（請求書・PDFに反映）");
      }
      // 選んだ書体を画面プレビューにも反映（BIZ UDのTTFをWebフォントとして遅延ロード）
      var _previewFonts = {};
      // doLoad=false のときは未ロードのフォントを取りに行かない（請求タブを開くだけで
      // 4.6MBのフォントDLが走るのを防ぐ）。書体を実際に選んだ時だけ doLoad=true でロード。
      function applyPreviewFont(name, doLoad) {
        var out = document.getElementById("invoiceOut");
        if (!out || typeof InvoicePDF === "undefined") return;
        var file = InvoicePDF.fontFile(name);
        if (!file) return;
        // ファイル名から一意なCSSフォント名を作る（書体名は日本語＝英数字除去だと衝突するため）
        var fam = "invfont_" + file.replace(/.*\//, "").replace(/[^A-Za-z0-9]/g, "");
        if (!_previewFonts[name]) {
          if (!doLoad) return; // 初期表示では読み込まず既定フォントのまま
          _previewFonts[name] = fam;
          try {
            var ff = new FontFace(fam, 'url("' + file + '")');
            ff.load()
              .then(function (f) {
                document.fonts.add(f);
              })
              .catch(function () {});
          } catch (e) {}
        }
        out.style.fontFamily = '"' + fam + '", "Noto Sans JP", sans-serif';
      }
      // 書体ポップは外側クリックで閉じる
      document.addEventListener("click", function (e) {
        var pop = document.getElementById("invFontPop");
        var box = document.getElementById("invFontBox");
        if (!pop || pop.style.display === "none") return;
        if (
          e.target.closest &&
          (e.target.closest("#invFontPop") || e.target.closest("#invFontBox"))
        )
          return;
        pop.style.display = "none";
      });

      /* ===================================================================
      入金管理（請求＝会社×月 ごとに 入金額／残額／状態を記録）
      請求書の単位(account_id, month, 会社名)＝invoiceNoFor と同じ粒度。
      PAYMENTS にユーザーが記録した入金額を持ち、請求額は明細(DB)から都度計算。
      =================================================================== */
      function payKeyFor(month, co) {
        return CURRENT_ACCOUNT + "::" + month + "::" + co;
      }
      // ★倉庫の payments の 1行 → PAYMENTS の 1つ★ 本体は lib/nyukin-kai.js（外から読む口と 同じ 物・2026-11-03）
      function payRecFromDb(r) {
        return NyukinKai.payRecFromDb(r);
      }
      function payRecord(month, co) {
        return PAYMENTS[payKeyFor(month, co)] || { paid: 0, paidDate: "", note: "" };
      }
      /* ★★入金画面の「確認」★★ 2026-10-01（司さん）
            その請求（会社×月）の 請求書を ★その場で PDF に して 開く★。

            ★「見るだけ」に する★（ここが 一番 大事）
              請求画面の `_buildInvoiceBytes()` は
                ・`issueInvoiceNo()` … 未発行なら ★倉庫に 番号を 書く★
                ・`writeInvoiceCopies()` … ★控えを 残す★
              を やる。そのまま 使うと ★覚く たびに 発行した事に なる★。
              ★確認は 何も 書かない★。発行済みの番号が 在れば それを 使い、
              無ければ 同じ 計算で 出した番号を ★付けるだけ（保存しない）★。

            ★行の 選び方は 請求画面と 同じ式を 使う★
              （真似て 書き直すと 「一部だけ 真似た」形に なり 字が ずれる）
            ★開き方は 前の printInvoicePDF（2026-10-29 に 無くした「印刷」）と 同じ★（blob を 新しい 窓で。
              止められたら 保存に 落とす） */
      function invoiceNoPeek(month, co) {
        var k = invNoKey(month, co);
        if (INVOICE_NO[k]) return INVOICE_NO[k]; // 発行済みは それを 使う
        return invoiceNoMiru(month, co); // ★まだ 出していない 番号は「未発行」★（見るだけで 番号を 決めると 後で 違う 番号に なり得る）
      }
      async function previewInvoiceFromPay(btn, month, co) {
        if (yomenaiTomeru(SEIKYU_KEYS, "請求書の 確認")) return;
        if (kurikoshiTomeru([co], "請求書の 確認")) return;
        if (typeof InvoicePDF === "undefined") {
          toast("PDFモジュールの読み込み待ちです。少し待って再度押してください");
          return;
        }
        var old = btn ? btn.textContent : "";
        if (btn) {
          btn.disabled = true;
          btn.textContent = "作成中…";
        }
        var url = null;
        try {
          // ★出す 前の 見張り★（確認の 紙も 本物の 番号が 刷られ 送れる＝同じ 見張りを 通す・対立役 v1 止5）
          if (!(await yomiNaoshiMon(month, co, "請求書の 確認"))) return;
          if (kurikoshiTomeru([co], "請求書の 確認")) return;
          if (!hakkoMon(month, [co])) return;
          var rows = DB.filter(function (r) {
            return r.account_id === CURRENT_ACCOUNT && r.会社名 === co && inMonth(r.日付, month);
          }).sort(function (a, b) {
            return (
              (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
            );
          });
          if (!rows.length) {
            toast("該当する明細がありません");
            return;
          }
          var bytes = await InvoicePDF.buildOne(
            MASTER,
            co,
            rows,
            month,
            issuerForEngine(co, month),
            invoiceNoPeek(month, co)
          );
          var blob = new Blob([bytes], { type: "application/pdf" });
          url = URL.createObjectURL(blob);
          var w = window.open(url, "_blank");
          if (!w) {
            // ★確認（見るだけ）の 紙は 名前で 分かる 様に★（本物と 同じ 名前だと 番号「未発行」の 紙を 先方へ 送れてしまう・対立役）
            InvoicePDF.save(bytes, "確認用_請求書_" + month + "_" + co + ".pdf");
            toast("PDFを保存しました（新しい窓が止められています）");
          }
        } catch (e) {
          toast("PDF作成に失敗：" + (e && e.message ? e.message : e));
        } finally {
          if (url)
            setTimeout(function () {
              URL.revokeObjectURL(url);
            }, 60000);
          if (btn) {
            btn.disabled = false;
            btn.textContent = old;
          }
        }
      }
