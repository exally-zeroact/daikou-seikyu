      // 請求書をクリーンなPDF（ブラウザのURL足跡なし・日本語埋込・複数ページ）で保存/共有。
      async function exportInvoicePDF(btn) {
        if (typeof InvoicePDF === "undefined") {
          toast("PDFモジュールの読み込み待ちです。少し待って再度押してください");
          return;
        }
        var old = btn ? btn.textContent : "";
        if (btn) {
          btn.disabled = true;
          btn.textContent = "PDF作成中…";
        }
        if (window.PdfOkuru) PdfOkuru.kesu(); // 前の 紙の「送る・印刷する」の 帯を 残さない
        try {
          var r = await _buildInvoiceBytes();
          if (!r) return;
          var miss = InvoicePDF.lastMissing();
          var chuiJi = miss.length ? "注意：この字は出せず〓表示→ " + miss.join(" ") : "";
          // ★iPhone・iPad は 共有に PDF と 字だけ 渡す★ 2026-11-06 司さん B（lib/pdf-okuru.js）
          //   前は PDF を blob の URL で 開いて その 画面から 共有 → LINE に 開けない blob:https://… の URL も 届いた
          //   作る 間に「押した」扱いが 切れて 断られたら 帯「送る・印刷する」（司さん 実機 F・G で 確かめ済み）
          //   'none'（Android・PC・共有が 無い）だけ 下の 今までの 道
          // ★押した 時と 紙が 違う（作っている 間に 月・会社を 変えた・窓を 開いた・画面や 集計へ 移った）＝送らない★
          //   違う 会社の 画面に 前の 会社の 紙を 送らない（本番前の 対立役 注1 2回目・3回目）
          function okuruKawatta() {
            var bamen = document.getElementById("scr-billing");
            var mado = document.getElementById("modalOv");
            var seg = document.querySelector('#scr-billing .seg-panel[data-seg="invoice"]');
            var m = document.getElementById("invMonth");
            var c = document.getElementById("invCompany");
            return (
              (m && m.value !== r.month) ||
              (c && c.value !== r.onlyCo) ||
              (mado && mado.classList.contains("open")) ||
              !(bamen && bamen.classList.contains("active")) ||
              !(seg && seg.classList.contains("on"))
            );
          }
          var tomeJi = "紙を 選び直したので 送るのを 止めました（もう一度 押してください）";
          if (window.PdfOkuru && PdfOkuru.appleTouch(window.navigator) && okuruKawatta()) {
            toast(tomeJi);
            return;
          }
          if (window.PdfOkuru) {
            var ok = await PdfOkuru.okuru(
              r.bytes,
              r.fname,
              PdfOkuru.seikyuJi(r.month, r.onlyCo),
              window,
              {
                chui: chuiJi,
                hiraku: function () {
                  InvoicePDF.save(r.bytes, r.fname);
                },
              }
            );
            if (ok.how === "share") {
              toast(chuiJi ? "PDFを渡しました（" + chuiJi + "）" : "PDFを渡しました");
              return;
            }
            if (ok.how === "cancel") {
              toast("送るのを やめました");
              return;
            }
            if (ok.how === "need-tap") {
              // ★作っている 間に 窓を 開いた・画面や 集計へ 移った＝帯を 出さない★（帯 z100000 が 窓や 別の 画面に 乗る・本番前の 対立役 注1 2回目）
              if (okuruKawatta()) {
                PdfOkuru.kesu();
                toast(tomeJi);
              }
              return; // 帯に 字も〓の 知らせも 出ている
            }
          }
          // ★スマホは 保存（PDF の 画面が 開き 共有から 送る・プリント）／PC は 新しい 窓で 開く（印刷も 保存も そこから）★
          //   2026-10-29「印刷 / 送る」を 1つに した 時（PC で 保存だけに すると ダウンロード欄に 入るだけで 印刷の 画面が 出ない・対立役 止6）
          //   窓を 止められたら 保存に 落とす（前の「印刷」と 同じ 形）
          var pcMado = false;
          if (!insatsuSumaho()) {
            var url = URL.createObjectURL(new Blob([r.bytes], { type: "application/pdf" }));
            pcMado = !!window.open(url, "_blank");
            setTimeout(function () {
              URL.revokeObjectURL(url);
            }, 60000);
          }
          if (!pcMado) InvoicePDF.save(r.bytes, r.fname);
          toast(
            miss.length
              ? "PDFを作成（注意：この字は出せず〓表示→ " + miss.join(" ") + "）"
              : pcMado
                ? "PDFを開きました（印刷・保存は その画面から）"
                : "PDFを作成しました（開いた画面の共有から 送る・プリント）"
          );
        } catch (e) {
          toast("PDF作成に失敗：" + (e && e.message ? e.message : e));
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = old;
          }
        }
      }
      // スマホ・タブレット・ホーム画面の アプリ＝保存の 道（新しい 窓は 戻れなく なる 端末が 在る）
      function insatsuSumaho() {
        try {
          var n = window.navigator || {};
          if (n.standalone === true) return true;
          if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
            return true;
          var ua = String(n.userAgent || "");
          if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
          return /Macintosh/.test(ua) && (n.maxTouchPoints || 0) > 1; // iPadOS の Safari
        } catch (_) {
          return true;
        }
      }
      // ★「印刷」の 別ボタン（printInvoicePDF＝新しい 窓で 開く）は 2026-10-29 に 無くした★（司さん「同じ画面が開かれるんやけん
      //   1つのボタンにして印刷/送るにまとめろ」）＝exportInvoicePDF（InvoicePDF.save）1つで 開いて 共有から 送る・プリント
      // 720pxのA4シートをスマホ画面幅に縮小して全体を見せる
      function fitInvoice() {
        document.querySelectorAll(".inv-out").forEach(function (out) {
          var inner = out.querySelector(".invScaleInner");
          if (!inner) return;
          if (out.clientWidth <= 0) return; // 非表示中は scale(0) を当てない
          var s = Math.min(1, out.clientWidth / 720);
          inner.style.transform = "scale(" + s + ")";
          var sh = inner.offsetHeight * s; // 縮小後の見た目の高さ（transformは原寸のままなので s を掛ける）
          out.style.height = sh + "px"; // 内容に合わせる
        });
      }

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
