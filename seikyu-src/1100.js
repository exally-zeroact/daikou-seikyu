      // これまでの 入金の 回を 1行に（例「6/10 ¥50,000・7/20 ¥80,000」）
      function payKaiGyou(month, co) {
        var rec = PAYMENTS[payKeyFor(month, co)];
        if (!rec) return "";
        return entriesOf(rec, month)
          .map(function (e) {
            var p = String(e.hi || "").split("-");
            var hi = p.length === 3 ? Number(p[1]) + "/" + Number(p[2]) : "日付なし";
            // こちら持ちで 消した 回＝うち 振込手数料 を 分けて 出す（銀行の 明細と 見比べる・司さん 11-03 弥生の 形）
            return (
              hi +
              " " +
              yen(e.gaku) +
              (e.tesuryo ? "（うち振込手数料 " + yen(e.tesuryo) + "）" : "")
            );
          })
          .join("・");
      }
      function payFill(v) {
        var el = document.getElementById("pay_amt");
        if (el) el.value = v;
      }
      async function savePay(month, co, total) {
        // ★入金を 読めていない 時は 書かない・消さない★（未入金に 見えた まま 上書き・取り消しで 消した・対立役 A1）
        if (yomenaiTomeru(["payments"], "入金の 保存")) return;
        toastUndoKesu();
        var amt =
          Number(String(document.getElementById("pay_amt").value).replace(/[^0-9]/g, "")) || 0;
        var date = document.getElementById("pay_date").value || "";
        var note = document.getElementById("pay_note").value || "";
        var key = payKeyFor(month, co);
        var snap = PAYMENTS[key] ? Object.assign({}, PAYMENTS[key]) : null; // 取り消し用（消した 時）
        var keshita = false;
        if (amt <= 0 && !date && !note && !snap) {
          // この 画面に 記録が 無い＝倉庫も 触らない 2026-10-16（対立役：前は 消す 呼び出しを 送り、別の 端末で
          //   後から 入れた 記録を 消しながら「何も変えていません」と 出し得た）
        } else if (amt <= 0 && !date && !note) {
          // 全部空＝未入金に戻す＝記録を消す（入金は実削除）
          var del = await SB.from("payments").delete().eq("month", month).eq("company", co);
          if (del.error) {
            cloudErr("入金削除", del.error);
            return;
          }
          delete PAYMENTS[key];
          payKaita(key);
          keshita = !!snap;
        } else {
          /* ★入金の 回★ 2026-11-02（対立役 止3）
                  繰越の 会社＝入金日の 欄は「今回の 入金日」（空で 出す）。額を 増やして 空なら 今日の 回。
                    日を 打った 時だけ 最後の 回の 日を 変える（前は 欄に 前の 日が 入った まま＝増えた 分に 前の 日が 付いた）。
                  繰越を 使わない 会社＝今まで 通り 欄の 日＝入金日（最後の 回の 日も 欄の 日）。 */
          var _kuri = !!(MASTER[co] && MASTER[co].carryover);
          var _mae = snap ? entriesOf(snap, month) : [];
          var _ent;
          if (_kuri) {
            _ent = entriesAtarashii(_mae, amt, date || kyouNoHi(), !!date);
            date = _ent.length ? _ent[_ent.length - 1].hi : date;
          } else {
            if (amt >= total && !date) date = kyouNoHi();
            _ent = entriesAtarashii(_mae, amt, date, true);
          }
          var up = await SB.from("payments")
            .upsert(
              {
                user_id: CURRENT_ACCOUNT,
                month: month,
                company: co,
                paid: amt,
                paid_date: date || null,
                memo: note,
                entries: _ent,
                deleted_at: null,
              },
              { onConflict: "user_id,month,company" }
            )
            .select("id")
            .single();
          if (up.error) {
            cloudErr("入金保存", up.error);
            return;
          }
          PAYMENTS[key] = {
            paid: amt,
            paidDate: date || "",
            createdAt: (snap && snap.createdAt) || new Date().toISOString(),
            entries: _ent,
            note: note,
            _dbid: up.data.id,
          };
          payKaita(key);
        }
        closeModal();
        renderPayments();
        updatePayBadge();
        // ★消した 時は「記録しました」と 言わず、取り消せる 様に する★ 2026-10-14（対立役：明細が 0件の 月の 窓で
        //   額を 0 に すると 記録が 黙って 消え、知らせは「入金を記録しました」だった）
        if (keshita)
          toastUndo(co + " の入金の記録を消しました", function () {
            undoIchiken(month, co, snap);
          });
        else if (!snap && amt <= 0 && !date && !note)
          toast("この画面には入金の記録がありません（何も変えていません）");
        else toast("入金を記録しました");
      }
      // ★行から直接ワンタップで全額入金済に（確認なし＝取り消しトースト付き）。savePayと同一のupsertを流用。
      async function markPaidFull(month, co, total) {
        // ★入金を 読めていない 時は 書かない・消さない★（未入金に 見えた まま 上書き・取り消しで 消した・対立役 A1）
        if (yomenaiTomeru(["payments"], "入金の 保存")) return;
        toastUndoKesu();
        var key = payKeyFor(month, co);
        var snap = PAYMENTS[key] ? Object.assign({}, PAYMENTS[key]) : null; // 取り消し用に前の状態を保持
        var d = new Date();
        var date =
          d.getFullYear() +
          "-" +
          ("0" + (d.getMonth() + 1)).slice(-2) +
          "-" +
          ("0" + d.getDate()).slice(-2);
        /* ★★1件の 全入金も「記録に 足りない 額を 足す」★★ 2026-11-01（対立役：一括入金（11-01 に 消した）だけ
                10-02 夜に 直してあり、行の ボタンは ★請求額で 上書き★ の まま だった）
                繰越を 使う 会社＝入金を 古い 月から 当てる。5月 10,000・6月 10,000・6月に 15,000 記録で
                6月の 行の「全入金」を 押すと 記録が 10,000 に なり、当て直すと 6月が「未入金」に 戻った。
                繰越を 使わない 会社は 当てた額＝記録 なので 結果は 前と 同じ（＝請求額）。 */
        var iv0 = null;
        seikyuList(null).forEach(function (iv) {
          if (payKeyFor(iv.month, iv.company) === key) iv0 = iv;
        });
        var atarashii = !iv0 ? Number(total) || 0 : zenNyukinGaku(iv0);
        var _kuriFull = !!(iv0 && MASTER[co] && MASTER[co].carryover);
        // ★入金の 回★ 増えた 分＝今日の 回（同じ 額なら 回は 変えない）・paid_date＝最後の 回の 日（対立役 止2）
        var _ent = entriesAtarashii(snap ? entriesOf(snap, month) : [], atarashii, date, false);
        if (_ent.length) date = _ent[_ent.length - 1].hi || date;
        var up = await SB.from("payments")
          .upsert(
            {
              user_id: CURRENT_ACCOUNT,
              month: month,
              company: co,
              paid: atarashii,
              paid_date: date,
              memo: (snap && snap.note) || "",
              entries: _ent,
              deleted_at: null,
            },
            { onConflict: "user_id,month,company" }
          )
          .select("id")
          .single();
        if (up.error) {
          cloudErr("入金保存", up.error);
          return;
        }
        PAYMENTS[key] = {
          paid: atarashii,
          paidDate: date,
          createdAt: (snap && snap.createdAt) || new Date().toISOString(),
          entries: _ent,
          note: (snap && snap.note) || "",
          _dbid: up.data.id,
        };
        payKaita(key);
        renderPayments();
        updatePayBadge();
        // ★繰越の 会社は 記録した 額を 知らせに 出す★（行の「残」と 違う 額を 黙って 記録しない・対立役 2026-11-02）
        toastUndo(
          co +
            " を全入金にしました" +
            (_kuriFull ? "（この月の行の記録 " + yen(atarashii) + "）" : ""),
          function () {
            undoIchiken(month, co, snap);
          }
        );
      }
      /* ★★「全入金」で 記録する 額★★（行の ボタン・窓の ボタン・押した 時の 記録を ここ 1本から）
              繰越の 会社＝この 月までの 請求 全部 − 記録した 入金 全部（どの 行・どの 入金日でも）の 残りを この 行に 足す
                ＝この 月の 請求書（前の 月の 残り込み）を 払い終えた 形（2026-11-02 司さん「請求書の 月の 行に 記録」）。
                前は「当てた 後の 足りない 額」＝前の 月が 未入金だと 今月分しか 入らなかった。
                紙の 今回ご請求額 を そのまま 使うと、その 行に 紙を 出す 前に 入った 入金が 在る 時に 足りなくなる。
              繰越を 使わない 会社＝記録 ＋ 足りない 額（今まで 通り）。 */
      function zenNyukinGaku(iv) {
        var co = iv.company;
        if (MASTER[co] && MASTER[co].carryover) {
          var seikyu = 0;
          var made = {};
          DB.forEach(function (r) {
            if (r.account_id !== CURRENT_ACCOUNT || r.会社名 !== co || !r.日付) return;
            var m2 = String(r.日付).slice(0, 7);
            if (m2 <= iv.month) (made[m2] = made[m2] || []).push(r);
          });
          Object.keys(made).forEach(function (m2) {
            seikyu += MeisaiEngine.invoiceTotals(made[m2], {
              taxMode: MASTER[co].taxMode,
            }).goukei;
          });
          var nb = nyukinByTsuki(co);
          var kiroku = Object.keys(nb).reduce(function (t, k) {
            return t + nb[k];
          }, 0);
          return iv.paidKiroku + Math.max(seikyu - kiroku, 0);
        }
        return iv.paidKiroku + Math.max(iv.total - iv.paid, 0);
      }
      // 全入金の取り消し＝直前の状態へ戻す（元が未入金なら記録削除）。
      // 返り値＝戻せたか（undoIchiken が 帯に 足すかを 決める）。damaru＝「取り消しました」を 出さない
      async function undoPayState(month, co, snap, damaru) {
        // ★入金を 読めていない 時は 書かない・消さない★（未入金に 見えた まま 上書き・取り消しで 消した・対立役 A1）
        if (yomenaiTomeru(["payments"], "入金の 保存")) return false;
        var key = payKeyFor(month, co);
        if (snap === null) {
          var del = await SB.from("payments").delete().eq("month", month).eq("company", co);
          if (del.error) {
            cloudErr("入金取消", del.error);
            return false;
          }
          delete PAYMENTS[key];
          payKaita(key);
        } else {
          var up = await SB.from("payments")
            .upsert(
              {
                user_id: CURRENT_ACCOUNT,
                month: month,
                company: co,
                paid: snap.paid,
                paid_date: snap.paidDate || null,
                memo: snap.note || "",
                // ★回も 必ず 送る★（送らない 列は 倉庫に 残る＝前からの 記録の 日を 戻しても 回が 新しい 日の まま・対立役 止1）
                entries: Array.isArray(snap.entries) ? snap.entries : null,
                deleted_at: null,
              },
              { onConflict: "user_id,month,company" }
            )
            .select("id")
            .single();
          if (up.error) {
            cloudErr("入金取消", up.error);
            return false;
          }
          PAYMENTS[key] = {
            paid: snap.paid,
            paidDate: snap.paidDate,
            createdAt: snap.createdAt || "",
            entries: Array.isArray(snap.entries) ? snap.entries : null,
            note: snap.note,
            _dbid: up.data.id,
          };
          payKaita(key);
        }
        renderPayments();
        updatePayBadge();
        if (!damaru) toast("取り消しました");
        return true;
      }
