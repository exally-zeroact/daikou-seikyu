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
      function payStatusOf(total, paid) {
        // ★請求 0円の 月は 払う 物が 無い＝入金済★（10-02 夜：繰越で 当てても「未入金」の まま 残った）
        if (total <= 0 && paid >= 0) return "paid";
        if (paid <= 0) return "unpaid";
        if (paid >= total) return "paid";
        return "partial";
      }
      var PAY_LABEL = { unpaid: "未入金", partial: "一部入金", paid: "入金済" };
      function refreshPayMonthSelect() {
        var sel = document.getElementById("payMonth");
        if (!sel) return;
        var keep = sel.value;
        var present = {};
        DB.forEach(function (r) {
          if (r.account_id === CURRENT_ACCOUNT && r.日付) present[r.日付.slice(0, 7)] = true;
        });
        kietaTsuki(seikyuList(null)).forEach(function (x) {
          present[x.month] = true; // 明細が 0件に なった 月も 選べる（入金の 画面 だけ）
        });
        var months = Object.keys(present).sort().reverse();
        sel.innerHTML =
          '<option value="">全期間</option>' +
          months
            .map(function (m) {
              var p = m.split("-");
              return (
                '<option value="' + m + '">' + Number(p[0]) + "年" + Number(p[1]) + "月</option>"
              );
            })
            .join("");
        if (months.indexOf(keep) >= 0 || keep === "") sel.value = keep;
      }
      /* ★入金の 画面の 会社の 絞り（2026-11-01 司さん「期間・状態・会社を 横1列に」）★
              並び＝請求書の 会社（#invCompany）と 同じ InvoicePDF.billableCompanies（マスタ順→孤児）。
              ★漢字は localeCompare で 読み順に ならない★ので 並べ直さない。
              明細も マスタも 無く 入金の 記録だけ 残る 会社は 後ろに 足す（同じ sort()）。
              ★作り直してから value を 読む★（消えた 会社を 選んだ ままに しない＝全社へ 戻す）。 */
      var PAY_CO_SHURUI =
        /^(株式会社|株式會社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|[(（]株[)）]|[(（]有[)）]|[(（]同[)）]|㈱|㈲)\s*|\s*(株式会社|株式會社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|[(（]株[)）]|[(（]有[)）]|[(（]同[)）]|㈱|㈲)$/g;
      function payCoMijika(n) {
        return String(n || "")
          .replace(PAY_CO_SHURUI, "")
          .trim();
      }
      function refreshPayCompanySelect(list) {
        var sel = document.getElementById("payCompany");
        if (!sel) return;
        var keep = sel.value;
        var names = InvoicePDF.billableCompanies(MASTER, DB, CURRENT_ACCOUNT);
        var seen = {};
        names.forEach(function (n) {
          seen[n] = 1;
        });
        var extra = [];
        (list || []).forEach(function (iv) {
          if (iv.company && !seen[iv.company]) {
            seen[iv.company] = 1;
            extra.push(iv.company);
          }
        });
        extra.sort();
        names = names.concat(extra);
        // ★見せる 字だけ 会社の 種類（株式会社 等）を 外す★（taiketsu 注1：狭い 画面で「株式会…」と
        //   しか 出ず どの 会社か 見分けられない）。value と title は 元の 名前の まま。
        //   外すと 他の 会社と 同じ 字に なる／空に なる 時は 外さない。
        var mijika = names.map(payCoMijika);
        var kazu = {};
        mijika.forEach(function (m) {
          kazu[m] = (kazu[m] || 0) + 1;
        });
        sel.innerHTML =
          '<option value="">全社</option>' +
          names
            .map(function (n, i) {
              // 「全社」（先頭の 選択肢）と 同じ 字に なる 時も 外さない
              var ji = mijika[i] && mijika[i] !== "全社" && kazu[mijika[i]] === 1 ? mijika[i] : n;
              return (
                '<option value="' + esc(n) + '" title="' + esc(n) + '">' + esc(ji) + "</option>"
              );
            })
            .join("");
        sel.value = names.indexOf(keep) >= 0 ? keep : "";
      }
      /* ★★入金で 使う「請求額」は 請求書の 合計と 同じ 関数で 出す★★ 2026-10-02
              ★前★ MeisaiEngine.listInvoices の total ＝ ★明細の 金額を 足した だけ★（税抜）
                請求書の 合計は invoiceTotals ＝ 外税なら ★税抜 ＋ 消費税★
                ⇒ ★外税の 会社だけ 入金画面が 消費税の 分 少なく 出た★
                  （手元で 本物の 画面を 動かして 実測：入金 15,400 ／ 請求書 16,940）
              ★今★ 入金の 3か所（一覧・入金を記録・まとめ/Excel の 入金）は ★全部 ここ★ から 読む。
                zeinuki に 元の 税抜を 残す。
            ★★入金も ここで 決める（paid）★★ 2026-10-02 司さん「バグがあるなら直せ」
              ★前★ 入金は ★記録した 月の 行★に そのまま 付けていた。
                「繰越を使う」会社が 前の月の 残り＋今月ぶんを ★まとめて★ 払うと
                ⇒ 前の月は ★未入金の まま★／今月は ★請求より 多い 入金★ に 見え、
                  未入金の バッジも 前の月を 数え続けた（合計と 繰越の 額は 合っていた）。
              ★今★「繰越を使う」会社だけ、記録した 入金を その会社の 全部の 月で 足し、
                ★古い 月から 順に 請求額 いっぱいまで 当てる★。余りは 一番 新しい 月に 乗せる。
                ★記録した 入金（PAYMENTS）は 1円も 書き換えない★＝見え方だけ。
                繰越を 使わない 会社は 今まで通り（記録した 月の 額）。 */
