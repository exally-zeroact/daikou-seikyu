      function openModal() {
        if (window.PdfOkuru) PdfOkuru.kesu(); // 帯（z 100000）が 窓（z 100）の 釦を 隠さない（本番前の 対立役 注1 2026-11-06）
        document.getElementById("modalOv").classList.add("open");
      }
      function closeModal() {
        document.getElementById("modalOv").classList.remove("open");
      }

      /* ===================================================================
      初期化
      =================================================================== */
      /* ===================================================================
      Excel書き出し（スマホ→Excel=中央DB の一方向ハンドオフ）
      =================================================================== */
      // 各列の最大文字幅から Excel の列幅(!cols)を算出（全角は2、半角は1で概算）
      function autoColWidths(aoa) {
        var widths = [];
        aoa.forEach(function (row) {
          (row || []).forEach(function (cell, c) {
            var s = cell == null ? "" : String(cell);
            var w = 0;
            for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 2 : 1;
            if (!widths[c] || w > widths[c]) widths[c] = w;
          });
        });
        return widths.map(function (w) {
          return { wch: Math.min(Math.max((w || 0) + 2, 6), 50) };
        });
      }
      function exportExcel() {
        if (
          !DB.filter(function (r) {
            return r.account_id === CURRENT_ACCOUNT;
          }).length
        ) {
          toast("書き出す明細がありません");
          return;
        }
        if (typeof XLSX === "undefined") {
          toast("Excelライブラリの読み込み待ちです。少し待って再度押してください");
          return;
        }
        // エンジンが返す「シートごとの2次元配列」を本物の .xlsx に変換（警告なし・2シート）
        var data = MeisaiEngine.buildWorkbookData(MASTER, DB, CURRENT_ACCOUNT);
        var wb = XLSX.utils.book_new();
        data.sheets.forEach(function (sh) {
          var ws = XLSX.utils.aoa_to_sheet(sh.aoa);
          ws["!cols"] = autoColWidths(sh.aoa); // 列幅を中身に合わせて自動調整
          XLSX.utils.book_append_sheet(wb, ws, sh.name);
        });
        var d = new Date();
        var ymd =
          d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
        XLSX.writeFile(wb, "代行明細_" + ymd + ".xlsx");
        toast("Excelファイル(.xlsx)を書き出しました");
      }

      // 一覧タブ：表示中（＝絞り込み連動）の明細をそのままExcelに書き出す。
      // 「今見えている明細＝出るもの」を一致させる（会社/期間フィルタを尊重）。
      function exportListExcel() {
        if (typeof XLSX === "undefined") {
          toast("Excelライブラリの読み込み待ちです。少し待って再度押してください");
          return;
        }
        var co = document.getElementById("listCompany").value;
        var mo = document.getElementById("listMonth").value;
        var rows = DB.filter(function (r) {
          if (r.account_id !== CURRENT_ACCOUNT) return false;
          if (co && r.会社名 !== co) return false;
          if (mo && !inMonth(r.日付, mo)) return false;
          return true;
        }).sort(function (a, b) {
          return (
            (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
          );
        });
        if (!rows.length) {
          toast("書き出す明細がありません");
          return;
        }
        var cols = ["会社名", "日付", "行き先", "金額", "備考", "距離", "人数", "名前"];
        var nums = { 金額: 1, 距離: 1, 人数: 1 };
        var aoa = [cols];
        var tot = 0;
        rows.forEach(function (r) {
          tot += Number(r.金額) || 0;
          aoa.push(
            cols.map(function (c) {
              // ★行き先は エンジン1本から（画面・紙と同じ物）★ 2026-08-18
              var v = c === "行き先" ? MeisaiEngine.utils.routeTextOf(r) : r[c];
              if (nums[c]) return v === "" || v == null ? "" : Number(v);
              return v == null ? "" : v;
            })
          );
        });
        aoa.push(["合計", "", "", tot, "", "", "", ""]);
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = autoColWidths(aoa);
        XLSX.utils.book_append_sheet(wb, ws, "明細");
        var d = new Date();
        var ymd =
          d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
        XLSX.writeFile(wb, "明細_" + (co || "全社") + "_" + (mo || "全期間") + "_" + ymd + ".xlsx");
        toast("明細(.xlsx)を書き出しました");
      }

      /* ===================================================================
      月次集計（アプリ内で閲覧）＝選んだ月の「どの会社にいくら請求/入金/残」を一覧表示。
      集計データの組み立ては共通化（画面表示とExcel書き出しで同じ summarize() を使う）。
      請求は明細(DB)、入金は PAYMENTS から都度計算＝一方向アーキ維持。
      =================================================================== */
      function summarize(month, statusF) {
        var invs = seikyuList(month || null); // ★請求書の 合計と 同じ 額★（外税は 税込み）
        var rows = invs
          .map(function (iv) {
            var rec = payRecord(iv.month, iv.company);
            var paid = iv.paid; // ★一覧と 同じ 入金（繰越の 会社は 古い 月から 当てた 額）★
            return {
              month: iv.month,
              company: iv.company,
              count: iv.count,
              total: iv.total,
              paid: paid,
              kiroku: iv.paidKiroku, // ★Excel の 入金シート＝記録した 額（当てた 額では ない）★
              st: payStatusOf(iv.total, paid),
              rem: iv.total - paid,
              date: rec.paidDate || "",
              note: rec.note || "",
            };
          })
          .filter(function (x) {
            return !statusF || x.st === statusF;
          });
        var t = { total: 0, paid: 0, rem: 0, count: 0 };
        rows.forEach(function (x) {
          t.total += x.total;
          t.paid += x.paid;
          t.rem += x.rem;
          t.count += x.count;
        });
        return { rows: rows, totals: t };
      }
      function refreshReportMonthSelect() {
        var sel = document.getElementById("repMonth");
        if (!sel) return;
        var keep = sel.value;
        var present = {};
        DB.forEach(function (r) {
          if (r.account_id === CURRENT_ACCOUNT && r.日付) present[r.日付.slice(0, 7)] = true;
        });
        var months = Object.keys(present).sort().reverse();
        sel.innerHTML =
          '<option value="">― 月を選択 ―</option>' +
          months
            .map(function (m) {
              var p = m.split("-");
              return (
                '<option value="' + m + '">' + Number(p[0]) + "年" + Number(p[1]) + "月</option>"
              );
            })
            .join("");
        if (months.indexOf(keep) >= 0) sel.value = keep;
        else if (months.length) sel.value = months[0]; // 既定＝最新月
      }
      function renderReport() {
        refreshReportMonthSelect();
        var month = document.getElementById("repMonth").value;
        var sumEl = document.getElementById("repSummary");
        var box = document.getElementById("repBody");
        var act = document.getElementById("repActions");
        if (!month) {
          sumEl.innerHTML = "";
          box.innerHTML = '<div class="li-empty">月を選んでください</div>';
          act.style.display = "none";
          return;
        }
        var s = summarize(month, "");
        if (!s.rows.length) {
          sumEl.innerHTML = "";
          box.innerHTML = '<div class="li-empty">この月の請求はありません</div>';
          act.style.display = "none";
          return;
        }
        act.style.display = "";
        var t = s.totals;
        var fumei = nyukinFumei(); // ★入金を 読めない＝入金・残・札を 描かない（集計の Excel は exportReport の yomenaiTomeru で 止まる）★
        sumEl.innerHTML =
          '<div class="pay-sum-cell"><div class="pay-sum-lb">請求</div><div class="pay-sum-val">' +
          yen(t.total) +
          '</div></div><div class="pay-sum-cell"><div class="pay-sum-lb">入金</div><div class="pay-sum-val">' +
          (fumei ? "―" : yen(t.paid)) +
          '</div></div><div class="pay-sum-cell rem"><div class="pay-sum-lb">残額</div><div class="pay-sum-val">' +
          (fumei ? "―" : yen(t.rem > 0 ? t.rem : 0)) +
          "</div></div>";
        // 請求額の大きい順に並べた読み取り専用の集計表
        var sorted = s.rows.slice().sort(function (a, b) {
          return b.total - a.total;
        });
        var body = sorted
          .map(function (x) {
            return (
              '<tr><td class="rep-co"><span class="pay-pill ' +
              (fumei ? "fumei" : x.st) +
              '">' +
              (fumei ? "入金 不明" : PAY_LABEL[x.st]) +
              "</span>" +
              esc(x.company) +
              '</td><td class="rep-n">' +
              yen(x.total) +
              '</td><td class="rep-n">' +
              (fumei ? "―" : yen(x.paid)) +
              '</td><td class="rep-n' +
              (!fumei && x.rem > 0 ? " rep-rem" : "") +
              '">' +
              (fumei ? "―" : yen(x.rem)) +
              "</td></tr>"
            );
          })
          .join("");
        box.innerHTML =
          (fumei ? nyukinFumeiObi("repFumeiObi") : "") +
          '<table class="rep-table"><thead><tr><th>会社</th><th>請求</th><th>入金</th><th>残</th></tr></thead><tbody>' +
          body +
          "</tbody><tfoot><tr><td>合計（" +
          s.rows.length +
          "社・" +
          t.count +
          '件）</td><td class="rep-n">' +
          yen(t.total) +
          '</td><td class="rep-n">' +
          (fumei ? "―" : yen(t.paid)) +
          '</td><td class="rep-n' +
          (!fumei && t.rem > 0 ? " rep-rem" : "") +
          '">' +
          (fumei ? "―" : yen(t.rem)) +
          "</td></tr></tfoot></table>";
      }
      // 表示中の月の集計を帳簿用 .xlsx に（金額は数値＝Excel側で集計/編集できる）
      function exportReport() {
        // ★集計の Excel も 入金を 読めていない 時は 作らない★（入金 0・全部 未入金 の 表を 出さない）
        if (yomenaiTomeru(["payments"], "集計の Excel の 作成")) return;
        if (typeof XLSX === "undefined") {
          toast("Excelライブラリの読み込み待ちです。少し待って再度押してください");
          return;
        }
        var month = document.getElementById("repMonth").value;
        if (!month) {
          toast("月を選んでください");
          return;
        }
        var s = summarize(month, "");
        if (!s.rows.length) {
          toast("書き出す請求がありません");
          return;
        }
        var aoa = [["月", "会社", "件数", "請求額", "入金額", "残額", "状態", "入金日", "メモ"]];
        s.rows.forEach(function (x) {
          var p = x.month.split("-");
          aoa.push([
            Number(p[0]) + "年" + Number(p[1]) + "月",
            x.company,
            x.count,
            x.total,
            x.paid,
            x.rem,
            PAY_LABEL[x.st],
            x.date,
            x.note,
          ]);
        });
        var t = s.totals;
        aoa.push(["合計", "", t.count, t.total, t.paid, t.rem, "", "", ""]);
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = autoColWidths(aoa);
        XLSX.utils.book_append_sheet(wb, ws, "月次集計");
        var d = new Date();
        var ymd =
          d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2);
        XLSX.writeFile(wb, "月次集計_" + month + "_" + ymd + ".xlsx");
        toast("月次集計(.xlsx)を書き出しました");
      }

