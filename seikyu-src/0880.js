      function _exlMeisaiAoa() {
        var cols = ["会社名", "日付", "行き先", "金額", "備考", "距離", "人数", "名前"];
        var nums = { 金額: 1, 距離: 1, 人数: 1 };
        var rows = DB.filter(function (r) {
          return r.account_id === CURRENT_ACCOUNT;
        }).sort(function (a, b) {
          return (
            (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
          );
        });
        var aoa = [cols],
          tot = 0;
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
        return aoa;
      }
      function _exlSummaryRows() {
        return summarize("").rows; // 全月・会社別（請求/入金/残/状態/入金日/メモ）
      }
      function _exlSummaryAoa(rows) {
        var aoa = [["月", "会社名", "件数", "請求額", "入金額", "残額", "状態"]];
        rows.forEach(function (x) {
          var p = x.month.split("-");
          aoa.push([
            Number(p[0]) + "年" + Number(p[1]) + "月",
            x.company,
            x.count,
            x.total,
            x.paid,
            x.rem,
            PAY_LABEL[x.st],
          ]);
        });
        return aoa;
      }
      function _exlPayAoa(rows) {
        // ★入金額＝消した 額（入った 額＋こちら持ちの 振込手数料）・その 後ろに 内訳★ 2026-11-03
        //   司さんの決め（弥生の形：入金区分「振込」と「振込手数料」・掛入金計に 手数料を 含める）
        //   列は 入金額の 後ろに 足す＝月・会社名・入金額は r[0..2] の まま（入金日と メモは 2列 右へ 動く・本番前 taiketsu 任1）
        var aoa = [["月", "会社名", "入金額", "うち振込", "うち振込手数料", "入金日", "メモ"]];
        rows.forEach(function (x) {
          // ★入金の 記録の 帳面＝記録した 額と 日★（10-02 夜：当てた 額を 出すと 記録が 消えて 見えた）
          var kiroku = x.kiroku != null ? x.kiroku : x.paid;
          if (!kiroku && !x.date && !x.note) return; // 入金実績のある行だけ
          var p = x.month.split("-");
          var tes = 0;
          var rec = PAYMENTS[payKeyFor(x.month, x.company)];
          if (rec)
            entriesOf(rec, x.month).forEach(function (e) {
              tes += e.tesuryo || 0;
            });
          aoa.push([
            Number(p[0]) + "年" + Number(p[1]) + "月",
            x.company,
            kiroku,
            (Number(kiroku) || 0) - tes,
            tes,
            x.date,
            x.note,
          ]);
        });
        return aoa;
      }
      function _exlCompaniesAoa() {
        var aoa = [["会社名", "使う項目"]];
        Object.keys(MASTER)
          .sort()
          .forEach(function (name) {
            var m = MASTER[name];
            if (!m || m.deleted_at) return;
            aoa.push([name, (m.items || []).join(" / ")]);
          });
        return aoa;
      }
      // 明細aoa（事前に絞り込んだ rows から）。_exlMeisaiAoa の rows 差し替え版。
      function _exlMeisaiAoaFrom(rows) {
        var cols = ["会社名", "日付", "行き先", "金額", "備考", "距離", "人数", "名前"];
        var nums = { 金額: 1, 距離: 1, 人数: 1 };
        var aoa = [cols],
          tot = 0;
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
        return aoa;
      }
      // 会社別の合計（全月まとめ）＝会社ごとに 件数/請求額/入金額/残額/状態。
      function _exlCompanyTotalsAoa(sumRows) {
        var by = {};
        sumRows.forEach(function (x) {
          var b = by[x.company] || (by[x.company] = { count: 0, total: 0, paid: 0 });
          b.count += Number(x.count) || 0;
          b.total += Number(x.total) || 0;
          b.paid += Number(x.paid) || 0;
        });
        var aoa = [["会社名", "件数", "請求額", "入金額", "残額", "状態"]];
        Object.keys(by)
          .sort()
          .forEach(function (co) {
            var b = by[co],
              rem = b.total - b.paid;
            aoa.push([co, b.count, b.total, b.paid, rem, PAY_LABEL[payStatusOf(b.total, b.paid)]]);
          });
        return aoa;
      }
      // ===== 選択式・普通に開けるExcel（自動更新なし＝修復ダイアログ無し・送れる1ファイル） =====
      function openExcelPicker() {
        var acct = CURRENT_ACCOUNT;
        var cosAll = Object.keys(MASTER)
          .filter(function (n) {
            return MASTER[n] && !MASTER[n].deleted_at && MASTER[n].account_id === acct;
          })
          .sort();
        var moSet = {};
        DB.forEach(function (r) {
          if (r.account_id === acct && r.日付) moSet[r.日付.slice(0, 7)] = 1;
        });
        var mosAll = Object.keys(moSet).sort().reverse();
        // ★Excelに請求書のシートは出さない★（司さん 2026-07-21「できんのなら請求書の書き出しはやめろ」）
        //   Excelはセル格子なので「中央タイトル＋真横に請求日＋直下の装飾線」だけは
        //   PDFと同じにできない＝中途半端な見た目コピーは渡さない、と実物で確かめた上の決着。
        //   ★見た目の納品は PDF 一本。Excelは編集用のデータ（明細・集計・入金）に徹する。★
        //   ※下の pick.invoice の枝は到達しない（消すと戻す時に困るので残置＝死にコード棚卸しで扱う）
        var sheetDefs = [
          ["meisai", "明細データ"],
          ["summary", "月次集計"],
          ["byco", "会社別集計"],
          ["pay", "入金一覧"],
        ];
        var chk = function (cls, val, label, on) {
          return (
            '<label class="exl-pick"><input type="checkbox" class="' +
            cls +
            '" value="' +
            esc(val) +
            '"' +
            (on ? " checked" : "") +
            "> " +
            esc(label) +
            "</label>"
          );
        };
        var h = '<div class="exl-pick-grp"><div class="exl-pick-h">入れる内容（複数OK）</div>';
        sheetDefs.forEach(function (s) {
          h += chk("xlSheet", s[0], s[1], true);
        });
        h +=
          '</div><div class="exl-pick-grp"><div class="exl-pick-h">会社</div>' +
          '<label class="exl-pick"><input type="checkbox" id="xlAllCo" checked onchange="_xlToggleAll(\'xlCo\',this.checked)"> <b>全社</b></label>';
        cosAll.forEach(function (c) {
          h += chk("xlCo", c, c, false);
        });
        h +=
          '</div><div class="exl-pick-grp"><div class="exl-pick-h">月</div>' +
          '<label class="exl-pick"><input type="checkbox" id="xlAllMo" checked onchange="_xlToggleAll(\'xlMo\',this.checked)"> <b>全期間</b></label>';
        mosAll.forEach(function (m) {
          var p = m.split("-");
          h += chk("xlMo", m, Number(p[0]) + "年" + Number(p[1]) + "月", false);
        });
        h +=
          '</div><div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="buildPickedExcel(this)">📥 このExcelを作る</button></div>';
        document.getElementById("modalTitle").textContent = "Excelを作る（選んで書き出し）";
        document.getElementById("modalBody").innerHTML = h;
        openModal();
      }
      function _xlToggleAll(cls, on) {
        // 「全社/全期間」チェック時は個別を無効化（=全部扱い）。外したら個別選択可。
        document.querySelectorAll("#modalBody ." + cls).forEach(function (el) {
          el.disabled = on;
          if (on) el.checked = false;
        });
      }
      // Excelシート名の制約に合わせる：31字以内・禁止文字( : \ / ? * [ ] )除去・空なら代替・重複は連番。
      function _exlSheetName(co, used) {
        var n = String(co == null ? "" : co)
          .replace(/[:\\\/?*\[\]]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 28);
        if (!n) n = "請求書";
        var base = n,
          i = 2;
        while (used[n]) {
          n = base.slice(0, 26) + "_" + i;
          i++;
        }
        used[n] = 1;
        return n;
      }
      async function buildPickedExcel(btn) {
        var pick = {};
        document.querySelectorAll("#modalBody .xlSheet:checked").forEach(function (el) {
          pick[el.value] = 1;
        });
        if (!Object.keys(pick).length) {
          toast("入れる内容を1つ以上選んでください");
          return;
        }
        // ★請求書・入金の 表は 読めなかった 物が 在れば 作らない★（対立役 D：Excel が 漏れていた）
        //   集計・会社別集計も 入金額・残額・状態を 載せる（対立役：入金を 読めないと「全部 未入金」の 表が 出た）
        //   請求書は 入金が 取れなくても 出す（繰越の 会社 だけ 止める）・入金の 数を 載せる 表は 入金が 要る
        var xlKeys = (pick.invoice ? SEIKYU_KEYS : []).concat(
          pick.pay || pick.summary || pick.byco ? ["payments"] : []
        );
        if (yomenaiTomeru(xlKeys, "Excel の 作成")) return;
        if (pick.invoice) {
          var _xjng = jishaNg(currentIssuer());
          if (_xjng) {
            toast(_xjng);
            return;
          }
          if (kurikoshiTomeru(Object.keys(MASTER), "Excel の 請求書")) return;
        }
        var allCo = document.getElementById("xlAllCo").checked;
        var allMo = document.getElementById("xlAllMo").checked;
        var cos = allCo
          ? []
          : [].map.call(document.querySelectorAll("#modalBody .xlCo:checked"), function (e) {
              return e.value;
            });
        var months = allMo
          ? []
          : [].map.call(document.querySelectorAll("#modalBody .xlMo:checked"), function (e) {
              return e.value;
            });
        var inCo = function (c) {
          return !cos.length || cos.indexOf(c) >= 0;
        };
        var inMo = function (m) {
          return !months.length || months.indexOf(m) >= 0;
        };
        var old = btn ? btn.textContent : "";
        if (btn) {
          btn.disabled = true;
          btn.textContent = "作成中…";
        }
        try {
          var acct = CURRENT_ACCOUNT;
          var wb = XLSX.utils.book_new();
          var append = function (name, aoa) {
            var ws = XLSX.utils.aoa_to_sheet(aoa);
            ws["!cols"] = autoColWidths(aoa);
            XLSX.utils.book_append_sheet(wb, ws, name);
          };
          var sumRows = summarize("").rows.filter(function (x) {
            return inCo(x.company) && inMo(x.month);
          });
          if (pick.meisai) {
            var mrows = DB.filter(function (r) {
              return r.account_id === acct && inCo(r.会社名) && inMo((r.日付 || "").slice(0, 7));
            }).sort(function (a, b) {
              return (
                (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
              );
            });
            append("明細", _exlMeisaiAoaFrom(mrows));
          }
          if (pick.summary) append("月次集計", _exlSummaryAoa(sumRows));
          if (pick.byco) append("会社別集計", _exlCompanyTotalsAoa(sumRows));
          if (pick.pay) append("入金", _exlPayAoa(sumRows));
          // ★請求書は会社毎に別シート(タブ)にする＝列幅もテンプレも会社毎にできる（1シート縦積みの制約解消）。
          var invSheets = [];
          if (pick.invoice) {
            var _invList = MeisaiEngine.listInvoices(DB, CURRENT_ACCOUNT, null).filter(
              function (iv) {
                return inCo(iv.company) && inMo(iv.month);
              }
            );
            var _coOrder = [],
              _seenCo = {};
            _invList.forEach(function (iv) {
              if (!_seenCo[iv.company]) {
                _seenCo[iv.company] = 1;
                _coOrder.push(iv.company);
              }
            });
            var _usedNm = {};
            for (var _ci = 0; _ci < _coOrder.length; _ci++) {
              var _co = _coOrder[_ci];
              var _d1 = _exlInvoiceData([_co], months);
              if (!_d1.aoa.length) continue;
              var iws = XLSX.utils.aoa_to_sheet(_d1.aoa);
              iws["!cols"] = _d1.cols || [{ wch: 9 }, { wch: 13 }, { wch: 13 }, { wch: 13 }];
              iws["!merges"] = _d1.merges;
              var rws = [];
              Object.keys(_d1.heights).forEach(function (r) {
                rws[Number(r)] = { hpt: _d1.heights[r] };
              });
              iws["!rows"] = rws;
              Object.keys(_d1.styles).forEach(function (ref) {
                if (!iws[ref]) iws[ref] = { t: "s", v: "" };
                iws[ref].s = _d1.styles[ref];
              });
              // ロゴ寸法をアプリ一致に（Excelのforce-square回避）。
              if (_d1.hanko && _d1.hanko.logo && _d1.hanko.logo.dataURL) {
                try {
                  var _lg = _d1.hanko.logo;
                  var _dim = await _containLogoMm(
                    _lg.dataURL,
                    _lg.boxMaxWmm || 40,
                    _lg.boxMaxHmm || 26
                  );
                  _lg.wMm = _dim.wMm;
                  _lg.hMm = _dim.hMm;
                } catch (e) {}
              }
              var _snm = _exlSheetName(_co, _usedNm);
              XLSX.utils.book_append_sheet(wb, iws, _snm);
              invSheets.push({
                name: _snm,
                breaks: _d1.breaks,
                hanko: _d1.hanko,
                margin: _d1.margin,
              });
            }
          }
          if (!wb.SheetNames.length) {
            toast("該当データがありません");
            return;
          }
          var buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
          var blob;
          if (invSheets.length) {
            // ★token=null＝Power Query(自動更新)を一切入れない。各会社シートにページ区切り/判子/フォントだけ入れる＝
            //   印刷でページ毎に分かれる＋判子＋游ゴシック。自動更新なしなので「修復しますか」も出ない。
            blob = await _exlEnhance(buf, [], null, null, null, null, invSheets);
          } else {
            blob = new Blob([buf], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
          }
          var d = new Date();
          var z2 = function (n) {
            return ("0" + n).slice(-2);
          };
          // ★ファイル名に時刻(時分)も入れる＝毎回違う名前＝古いダウンロードと見分けがつく（一番新しいのが分かる）。
          var ymd =
            d.getFullYear() +
            z2(d.getMonth() + 1) +
            z2(d.getDate()) +
            "_" +
            z2(d.getHours()) +
            z2(d.getMinutes());
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "代行データ_" + ymd + ".xlsx";
          document.body.appendChild(a);
          a.click();
          setTimeout(function () {
            URL.revokeObjectURL(a.href);
            a.remove();
          }, 1500);
          closeModal();
          toast("Excelを作りました（" + wb.SheetNames.join("/") + "）");
        } catch (e) {
          toast("作成に失敗：" + (e && e.message ? e.message : e));
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = old;
          }
        }
      }
