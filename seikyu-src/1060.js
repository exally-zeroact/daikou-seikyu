      // ★本体は lib/nyukin-ate.js★（外から読む口の 未入金の表と 同じ 物・2026-11-13）
      function payStatusOf(total, paid) {
        return NyukinAte.jotai(total, paid);
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
      // opt.kieta＝入金の 画面 だけ：明細が 0件に なった 会社×月も 出す（下の kietaTsuki）。
      //   合計・残額・バッジ・月次集計・Excel は これを 渡さない＝前と 同じ 数の まま
      function seikyuList(month, opt) {
        var invs = MeisaiEngine.listInvoices(DB, CURRENT_ACCOUNT, null);
        var rowsBy = {};
        DB.forEach(function (r) {
          if (r.account_id !== CURRENT_ACCOUNT || !r.日付) return;
          var k = String(r.日付).slice(0, 7) + " " + r.会社名;
          (rowsBy[k] = rowsBy[k] || []).push(r);
        });
        var all = invs.map(function (iv) {
          var m = MASTER[iv.company] || {};
          var t = MeisaiEngine.invoiceTotals(rowsBy[iv.month + " " + iv.company] || [], {
            taxMode: m.taxMode,
          });
          var kiroku = Number(payRecord(iv.month, iv.company).paid) || 0;
          return Object.assign({}, iv, {
            zeinuki: iv.total,
            total: t.goukei,
            paid: kiroku,
            paidKiroku: kiroku,
          });
        });
        // 繰越を使う 会社＝古い 月から 順に 当てる。★本体は lib/nyukin-ate.js★（外から読む口の 未入金の表と 同じ 物・2026-11-13）
        NyukinAte.ateru(all, function (co) {
          return !!(MASTER[co] && MASTER[co].carryover);
        });
        if (opt && opt.kieta) {
          all = all.concat(kietaTsuki(all)).sort(function (a, b) {
            return b.month.localeCompare(a.month) || a.company.localeCompare(b.company);
          });
        }
        return month
          ? all.filter(function (x) {
              return x.month === month;
            })
          : all;
      }
      /* ★明細が 0件に なった 会社×月★ 2026-10-14（指示役：明細を 外すと 入金の 一覧から 行ごと 消え、
              記録した 入金も 出した 請求書も 画面の どこにも 出なかった）
            ・出す 物＝自分の 入金の 記録（額か メモ）か 請求番号が 在る 月だけ（出した 時の 写しだけでは 出さない＝
              会社名を 付け替えた 時に 古い 名前の 行が 出る・対立役）
            ・繰越を 使う 会社は 出さない（当て方を 変えない）
            ・請求 ¥0。状態は 入金済の 扱い（全入金・バッジに 入れない）で、札の 字は「明細なし」 */
      function kietaTsuki(all) {
        var aru = {};
        all.forEach(function (x) {
          aru[x.month + " " + x.company] = 1;
        });
        var out = [];
        var tasu = function (month, co) {
          var k = month + " " + co;
          if (!month || !co || aru[k]) return;
          if (MASTER[co] && MASTER[co].carryover) return;
          aru[k] = 1;
          var kiroku = Number(payRecord(month, co).paid) || 0;
          out.push({
            month: month,
            company: co,
            count: 0,
            total: 0,
            zeinuki: 0,
            paid: kiroku,
            paidKiroku: kiroku,
            kieta: true,
          });
        };
        var mae = CURRENT_ACCOUNT + "::";
        Object.keys(PAYMENTS).forEach(function (k) {
          if (k.indexOf(mae) !== 0) return;
          var r = PAYMENTS[k] || {};
          if (r.uid != null && r.uid !== CURRENT_ACCOUNT) return;
          if (!nyukinGaMieru(r.paid, r.note, r.paidDate)) return;
          var rest = k.slice(mae.length);
          var i = rest.indexOf("::");
          if (i < 0) return;
          tasu(rest.slice(0, i), rest.slice(i + 2));
        });
        Object.keys(INVOICE_NO).forEach(function (k) {
          if (INVOICE_NO_UID[k] != null && INVOICE_NO_UID[k] !== CURRENT_ACCOUNT) return;
          var i = k.indexOf("|");
          if (i < 0) return;
          tasu(k.slice(0, i), k.slice(i + 1));
        });
        return out;
      }
      function renderPayments() {
        var _nav = document.querySelector(".bottom-nav"); // 取り消しの 知らせの 位置用（--nav-h）
        if (_nav) document.documentElement.style.setProperty("--nav-h", _nav.offsetHeight + "px");
        refreshPayMonthSelect();
        var month = document.getElementById("payMonth").value;
        var statusF = document.getElementById("payStatus").value;
        renderModose(); // 戻せなかった 入金の 一覧（閉じるまで 残す）
        // ★会社の 絞りは seikyuList の 返りに 掛ける★（中に 掛けると 繰越の 当て方が 変わる）
        var invsAll = seikyuList(month || null, { kieta: true });
        // 全期間の 時は 同じ 物＝使い回す（taiketsu 任2）
        refreshPayCompanySelect(month ? seikyuList(null, { kieta: true }) : invsAll);
        var coF = document.getElementById("payCompany").value;
        var invs = coF
          ? invsAll.filter(function (iv) {
              return iv.company === coF;
            })
          : invsAll;
        // 状態を付与しつつ集計
        var totalSum = 0,
          paidSum = 0;
        var rows = invs.map(function (iv) {
          var paid = iv.paid; // ★seikyuList が 決めた 入金（繰越の 会社は 古い 月から 当てた 額）★
          var st = payStatusOf(iv.total, paid);
          // 明細が 0件の 行は 合計に 入れない（前と 同じ 数・他の 会社の 残りを 打ち消さない）
          if (!iv.kieta) {
            totalSum += iv.total;
            paidSum += paid;
          }
          return { iv: iv, paid: paid, st: st, rem: iv.total - paid };
        });
        var remSum = totalSum - paidSum;
        var fumei = nyukinFumei(); // ★入金を 読めない＝入金・残額・状態を 描かない★
        // サマリ（フィルタ結果の合計＝簡易な月次集計も兼ねる）
        document.getElementById("paySummary").innerHTML =
          '<div class="pay-sum-cell"><div class="pay-sum-lb">請求</div><div class="pay-sum-val">' +
          yen(totalSum) +
          '</div></div><div class="pay-sum-cell"><div class="pay-sum-lb">入金</div><div class="pay-sum-val">' +
          (fumei ? "―" : yen(paidSum)) +
          '</div></div><div class="pay-sum-cell rem"><div class="pay-sum-lb">残額</div><div class="pay-sum-val">' +
          (fumei ? "―" : yen(remSum > 0 ? remSum : 0)) +
          "</div></div>";
        var box = document.getElementById("payBody");
        // 読めない 時は 状態で 絞れない（全部「未入金」に 見えて いた）＝絞らずに 全部 出して 帯で 訳を 言う
        var shown = rows.filter(function (x) {
          return fumei || !statusF || x.st === statusF;
        });
        /* ★2026-08-21 A3-⑦ バッジ29 と 画面31 の食い違い★
              数え方は summarize() 1本で同じ。違っていたのは ★数える範囲★：
                バッジ ＝ ★全期間★の「未入金＋一部入金」の件数
                この画面 ＝ ★絞り込んだ後★の一覧
              ＝同じ物を2か所で別々に決めていた。★どちらの数かを その場に書く★。 */
        var yetAll = summarize(null, "").rows.filter(function (x) {
          return x.st !== "paid";
        }).length;
        var yetShown = shown.filter(function (x) {
          return x.st !== "paid";
        }).length;
        var cntEl = document.getElementById("payCount");
        if (cntEl && fumei)
          cntEl.innerHTML =
            '<span><span class="n">' +
            shown.length +
            "件</span>" +
            (month || coF ? "（絞り込み中）" : "") +
            "</span><span>未入金・一部入金 " +
            '<span class="v">不明</span>' +
            (statusF ? "（入金を 読めないので 状態では 絞れません）" : "") +
            "</span>";
        else if (cntEl)
          cntEl.innerHTML =
            '<span><span class="n">' +
            shown.length +
            "件</span>" +
            (month || statusF || coF ? "（絞り込み中）" : "") +
            "</span><span>未入金・一部入金 " +
            '<span class="v">' +
            yetShown +
            "件</span>" +
            // ★この 数は 全社・全期間（バッジと 同じ）★＝会社で 絞った 時は「全社」と 書く
            (yetShown !== yetAll ? (coF ? "（全社・全期間 " : "（全期間 ") + yetAll + "件）" : "") +
            "</span>";
        var obi = fumei ? nyukinFumeiObi("payFumeiObi") : "";
        var _nb = naoshiNyukinBetsu(); // 直しの 履歴（⑦）
        if (!shown.length) {
          box.innerHTML = obi + '<div class="li-empty">該当する請求がありません</div>';
          updatePayBadge();
          return;
        }
        box.innerHTML =
          obi +
          shown
            .map(function (x) {
              var p = x.iv.month.split("-");
              var moEsc = esc(x.iv.month);
              var coEsc = esc(x.iv.company).replace(/'/g, "\\'");
              // 行を 押す＝詳細の 窓（2026-11-01 司さん：「選択」＝一括入金を 消した）
              var rowClick = "openPayEdit('" + moEsc + "','" + coEsc + "')";
              if (fumei) {
                // ★入金・残・全入金を 出さない（数は 古いか 空）・行を 押すと 窓は「読めない」の 形★
                return (
                  '<div class="pay-item" onclick="' +
                  rowClick +
                  '"><span class="pay-pill fumei">入金 不明</span>' +
                  '<div class="pay-main"><div class="pay-co">' +
                  esc(x.iv.company) +
                  '</div><div class="pay-sub">' +
                  esc(
                    Number(p[0]) +
                      "年" +
                      Number(p[1]) +
                      "月・" +
                      x.iv.count +
                      "件" +
                      (x.iv.kieta ? "（明細が 0件に なりました）" : "")
                  ) +
                  "</div></div>" +
                  '<div class="pay-right"><div class="pay-amt">' +
                  yen(x.iv.total) +
                  "</div></div></div>"
                );
              }
              var sub =
                Number(p[0]) +
                "年" +
                Number(p[1]) +
                "月・" +
                x.iv.count +
                "件" +
                (x.paid > 0 && x.st !== "paid" ? "・入金 " + yen(x.paid) : "") +
                (x.iv.kieta
                  ? "（明細が 0件に なりました）" +
                    (x.iv.paidKiroku > 0 ? "・記録した入金 " + yen(x.iv.paidKiroku) : "")
                  : "");
              var remHtml =
                x.st === "paid" ? "" : '<div class="pay-rem">残 ' + yen(x.rem) + "</div>";
              var fullBtn =
                x.st !== "paid"
                  ? '<button type="button" class="pay-full-btn" onclick="event.stopPropagation();markPaidFull(\'' +
                    moEsc +
                    "','" +
                    coEsc +
                    "'," +
                    x.iv.total +
                    ')">全入金' +
                    // ★繰越の 会社は 記録する 額を 押す 前に 見せる★（「残」は 古い 月から 当てた 今月分・押すと 請求書の 額を 記録）
                    (MASTER[x.iv.company] && MASTER[x.iv.company].carryover
                      ? "（記録 " + yen(zenNyukinGaku(x.iv)) + "）"
                      : "") +
                    "</button>"
                  : "";
              return (
                '<div class="pay-item" onclick="' +
                rowClick +
                '">' +
                '<span class="pay-pill ' +
                (x.iv.kieta ? "kieta" : x.st) +
                '">' +
                (x.iv.kieta ? "明細なし" : PAY_LABEL[x.st]) +
                "</span>" +
                '<div class="pay-main"><div class="pay-co">' +
                esc(x.iv.company) +
                '</div><div class="pay-sub">' +
                esc(sub) +
                naoshiFudaHtml(_nb[x.iv.month + "::" + x.iv.company]) +
                "</div>" +
                "</div>" +
                '<div class="pay-right"><div class="pay-amt">' +
                yen(x.iv.total) +
                "</div>" +
                remHtml +
                "</div>" +
                fullBtn +
                "</div>"
              );
            })
            .join("");
        updatePayBadge(); // ★同じ数え方(summarize)で 同時に数え直す★ 2026-08-21
      }
