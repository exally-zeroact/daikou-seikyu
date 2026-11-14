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

