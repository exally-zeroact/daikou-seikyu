      // 長い行き先は ★端と端を残して 途中を省く★（押す物なのに中身が読めないと選べない）
      //   例: UNIQLO〜松本〜郷本町〜辻堂〜喜田村〜東予〜桜井 → UNIQLO〜…〜桜井
      function destChipLabel(d) {
        var s = String(d || "");
        if (s.length <= 14) return s;
        var p = s.split("〜");
        if (p.length >= 3) {
          var head = p[0];
          var tail = p[p.length - 1];
          if (head.length + tail.length <= 16) return head + "〜…〜" + tail;
        }
        return s.slice(0, 7) + "…" + s.slice(-5);
      }
      function destOftenHtml(i) {
        var top = (DEST_ALL || []).slice(0, 3);
        if (!top.length) return "";
        return (
          '<div class="dest-often">よく行く所：' +
          top
            .map(function (d, j) {
              // ★字は onclick に 埋めない・番号で 渡す★ 2026-11-03（&#39; は 属性の 中で ' に 戻る＝
              //   行き先 x');alert(1);(' で 走る。AI の 下書きで 外から 字が 届く 道が できた＝作った後の 対立役 注3）
              return (
                '<button type="button" class="dest-chip" onclick="pickDestOften(' +
                i +
                "," +
                j +
                ')" title="' +
                esc(d) +
                '">' +
                esc(destChipLabel(d)) +
                "</button>"
              );
            })
            .join("") +
          "</div>"
        );
      }
      function pickDestOften(i, j) {
        var d = (DEST_ALL || [])[j];
        if (typeof d !== "string") return;
        var wrap = document.querySelectorAll("#entryBody .sugg-wrap")[i];
        var el = wrap && wrap.querySelector(".entry-inp");
        if (!el) return;
        el.value = d;
        if (entryRows[i]) entryRows[i]["行き先"] = d;
      }
      // 行き先サジェストの母集合：過去明細から（その会社優先・少なければ全社）頻度順
      var DEST_ALL = [];
      function refreshDestList(co) {
        function collect(filterCo) {
          var freq = {};
          DB.forEach(function (r) {
            if (r.account_id !== CURRENT_ACCOUNT) return;
            if (filterCo && r.会社名 !== filterCo) return;
            var d = (r.行き先 || "").trim();
            if (d) freq[d] = (freq[d] || 0) + 1;
          });
          return Object.keys(freq).sort(function (a, b) {
            return freq[b] - freq[a] || a.localeCompare(b);
          });
        }
        var list = collect(co);
        if (list.length < 5) {
          collect("").forEach(function (d) {
            if (list.indexOf(d) < 0) list.push(d);
          });
        }
        DEST_ALL = list;
      }
      // 行き先入力：状態を更新しつつ、母集合を絞り込んで自前ドロップダウンに出す
      function onDestInput(i, el) {
        if (entryRows[i]) entryRows[i]["行き先"] = el.value;
        var q = (el.value || "").trim().toLowerCase();
        var list = DEST_ALL.filter(function (d) {
          return !q || d.toLowerCase().indexOf(q) >= 0;
        });
        var box = el.nextElementSibling;
        if (!box) return;
        if (!list.length) {
          box.classList.remove("on");
          box.innerHTML = "";
          return;
        }
        box.innerHTML = list
          .slice(0, 30)
          .map(function (d) {
            return (
              '<div class="sugg-item" data-i="' +
              i +
              '" onmousedown="pickDest(event,this)">' +
              esc(d) +
              "</div>"
            );
          })
          .join("");
        box.classList.add("on");
      }
      // 候補タップ（onmousedown＝blurより先に発火させて確実に拾う）
      function pickDest(ev, item) {
        ev.preventDefault();
        var wrap = item.closest(".sugg-wrap");
        var input = wrap.querySelector("input");
        var i = Number(item.getAttribute("data-i"));
        input.value = item.textContent;
        if (entryRows[i]) entryRows[i]["行き先"] = item.textContent;
        wrap.querySelector(".sugg-box").classList.remove("on");
      }
      function hideSugg(el) {
        // blur直後に閉じる（候補タップのonmousedownが先に走るよう少し遅延）
        setTimeout(function () {
          var b = el.nextElementSibling;
          if (b) b.classList.remove("on");
        }, 160);
      }
      function setEntry(i, k, v) {
        if (entryRows[i]) entryRows[i][k] = v;
      }
      function setEntryCar(i, el) {
        if (!entryRows[i] || el.value === "keep") return;
        kurumaWoTsukeru(entryRows[i], el.value === "" ? -1 : Number(el.value));
      }
      function setEntryNum(i, k, el) {
        // 数字以外を即除去（オートフィルの文章混入を物理的に弾く）
        // ★距離だけ小数点を通す (2026-08-05)★
        //   ダイコメのメーターが 5.36km と実測どおり入れてくるようになったので、
        //   手入力でも 5.36 と打てないと揃わない。金額・人数は今までどおり整数のみ。
        var clean = String(el.value).replace(k === "距離" ? /[^0-9.]/g : /[^0-9]/g, "");
        if (el.value !== clean) el.value = clean;
        if (entryRows[i]) entryRows[i][k] = clean;
      }
      function setEntryDate(i, k, el) {
        // 内部はISO（2026-06-15）で保持・画面表示だけ M/D（6/15）に更新
        if (entryRows[i]) entryRows[i][k] = el.value;
        var s = el.parentNode.querySelector(".date-show");
        if (s) {
          var md = mdShort(el.value);
          s.textContent = md || "日付を選ぶ";
          s.classList.toggle("empty", !md);
        }
      }
      function delEntry(i) {
        entryRows.splice(i, 1);
        if (!entryRows.length) entryRows = [blankEntry()];
        renderEntry();
      }
      // ★保存中の 旗★ 2026-11-03（AI の 下書きが 保存の 途中に 届いても 行を 混ぜない・二度押しで 二重に 入れない）
      var _entrySaving = false;
      var _entrySavingP = null;
      async function saveEntries() {
        if (_entrySaving) {
          // ★黙って 捨てない★（何が 起きているか 客に 見せる・本番前の 対立役 注2）
          toast("保存しています。終わるまで お待ちください");
          return;
        }
        _entrySaving = true;
        _entrySavingP = saveEntriesHontai();
        try {
          await _entrySavingP;
        } finally {
          _entrySaving = false;
          _entrySavingP = null;
        }
      }
      /* ===================================================================
            ★請求書を 出す 前の 見張り★ 2026-11-04（lib/nijuu.js zureKazoeru・hakkoMae・設計前の 対立役 v1 止5・v2 止3注8）
            訳：DB と PAYMENTS は ログインの 時に 1回 読むだけ＝開いた 後に メーターから 入った 行・別の 端末で
                直した 行・記録した 入金が 紙に 出ない（少なく 請求・古い 繰越）。料金が 空の メーターの 行も 出す 時に 見る。
            決まり：
              ・出す 前に 倉庫を 丸ごと 読み直す（loadAllCloud と 同じ 読み）。違えば DB・PAYMENTS を 丸ごと 替える
                （id で 入れ替えない＝月を 動いた 行が 消えたり 2重に なったり しない・v1 止3）
              ・★この 紙の 材料に 触れる 違いが 在れば 1回 止める★（見た 紙と 出る 紙を 同じに する）。
                材料＝紙の 会社の その 月（紙と 同じ 日付の 頭7字）＋繰越の 会社は それより 前の 全部の 月と 入金（v1 止1・v2 注2）
              ・明細が 読めなければ 出さない。入金が 読めなければ 繰越の 会社 だけ 止める（司さん 10-08・v2 止B）
              ・保存の 途中なら 終わるまで 待つ（v2 止A）
              ・★手の 行と メーターの 行の「同じ 乗車かも」は 見ない★（司さん 2026-11-04「おれが 入力しよんやけん いちいち 出すなや」＝頼まれていない 見張り・保存の 時も 外した）
              ・料金が 空の メーターの 行は ★止めて 警告・通す 釦は 無い★（計算 できない 物は 出さない）
            ★拾えない 物★：［続ける］で 晩を またいだ 勤務（差が 2日 以上・Daikou-app の 別の 押し）／会社の 設定（MASTER）の 違い
            =================================================================== */
      function meisaiSig(r) {
        var o = meisaiToDb(r);
        var ex = {};
        Object.keys(o.extra || {}).forEach(function (k) {
          if (k.charAt(0) !== "_") ex[k] = o.extra[k]; // 画面だけの 印（_ で 始まる）は 比べない
        });
        o.extra = ex;
        o.account_id = r.account_id;
        return Nijuu.shirushi(o);
      }
      function meisaiZureList(rows) {
        return (rows || []).map(function (r) {
          return { id: r.id, row: r, sig: meisaiSig(r) };
        });
      }
      // 入金の 鍵＝消し込みと 同じ 揃え方（ksHikakuKagi）＋入金日が 空の 時の 月（createdAt）＋倉庫の id（v2 止C）
      function paymentsZureList(map) {
        return Object.keys(map || {}).map(function (k) {
          var p = k.split("::");
          var rec = map[k];
          return {
            id: k,
            row: { 会社名: p.slice(2).join("::"), month: p[1] },
            sig: JSON.stringify([
              ksHikakuKagi(rec, p[1]),
              // 作った 日の 月は 入金日が 空の 時 だけ 使う（nyukinNoTsuki）＝その 時 だけ 比べる
              hiDake(rec.paidDate) ? "" : String(rec.createdAt || "").slice(0, 7),
              rec._dbid == null ? "" : String(rec._dbid),
            ]),
          };
        });
      }
      function tsukiNoKaishaOf(rows, month) {
        var seen = {};
        var out = [];
        (rows || []).forEach(function (r) {
          if (r.account_id !== CURRENT_ACCOUNT || !r.会社名 || !inMonth(r.日付, month)) return;
          if (!seen[r.会社名]) {
            seen[r.会社名] = 1;
            out.push(r.会社名);
          }
        });
        return out;
      }
      // 入金の 窓が 開いた 時と 今で 読める／読めないが 違えば 描き直す（同じ なら 打ちかけを 消さない）
      function payEditNaosu() {
        var ov = document.getElementById("modalOv");
        if (!PAY_EDIT_AKI || !ov || !ov.classList.contains("open")) return;
        // 見出しの 字で なく 中身で 見る（字を 変えた 日に 黙って 外れない）
        if (!document.querySelector("#modalBody #pay_amt, #modalBody #payEditFumei")) return;
        if (PAY_EDIT_AKI.fumei === nyukinFumei()) return;
        openPayEdit(PAY_EDIT_AKI.month, PAY_EDIT_AKI.co);
      }
      function hakkoGamenNaosu() {
        [
          refreshMonthSelect,
          renderList,
          renderPayments,
          updatePayBadge,
          renderModose,
          renderReport,
          payEditNaosu,
        ].forEach(function (f) {
          try {
            f();
          } catch (e) {
            console.warn("hakko-mae redraw", e);
          }
        });
        try {
          generateInvoices(true);
        } catch (e) {
          console.warn("hakko-mae redraw", e);
        }
      }
      /* month＝紙の 月・onlyCo＝1社（空＝全社）・what＝止めた 時の 字。通して よければ true */
