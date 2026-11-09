      async function deleteCompany(co) {
        if (!confirm(co + " をマスタから削除します。よろしいですか？（明細データは残ります）"))
          return;
        var dbid = MASTER[co] && MASTER[co]._dbid;
        if (dbid) {
          var d = await SB.from("companies")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", dbid);
          if (d.error) {
            cloudErr("会社削除", d.error);
            return;
          }
        }
        delete MASTER[co];
        renderMaster();
        refreshCompanySelects();
        toast("削除しました");
      }
      // 新しい 名前に 先から 在る 行の 鍵（台帳は 月・明細と 入金は id）。読めない・本数が 確かでない 時は null
      //   並びを 決めて 頁を 繰り、count が 数で 受け取った 本数と 合う 時だけ 確か とする（分からない 時に 通さない・対立役）
      // ★残っている 記録と 混ぜるかを 客に 訊く★ 2026-10-16 司さん「確かめを 出す」
      //   消した 会社の 入金・明細・請求番号は 消しても 倉庫に 残る。同じ 名前へ 付け替える・同じ 名前で 足すと、
      //   その 会社の 請求の 額と 入金済みの 見え方が 変わる＝黙って 混ぜない。消した 会社を 戻したい 客の 道は 残す
      // 入金の 行が 客に 見えるか（額が 0 より 大きい・メモ・入金日の どれか）。入金の 一覧と 混ぜるかの 数で 同じ 判じを 使う
      function nyukinGaMieru(paid, memo, hi) {
        return !!(Number(paid) > 0 || String(memo || "").trim() || hi);
      }
      function mazeruKaKiku(na, nokori) {
        var m = nokori.mieru;
        var kazu = [
          ["入金", m.payments],
          ["明細", m.meisai],
          ["請求番号", m.invoice_no],
          ["発行した 請求書の 控え", m.invoices],
        ].filter(function (x) {
          return x[1] > 0;
        });
        if (!kazu.length) return true;
        return confirm(
          "「" +
            na +
            "」の 名前で " +
            kazu
              .map(function (x) {
                return x[0] + " " + x[1] + " 件";
              })
              .join("・") +
            " が 残っています（前に 消した 会社の 物など）。\n" +
            "この 会社に 混ぜますか？ 混ぜると、この 会社の 請求の 額・入金済みの 見え方・前の 月の 額が 変わり、請求番号は 残っている 物を 使います。"
        );
      }
      async function sakiNiAruGyou(na) {
        // 4つ目の 表＝発行した 請求書の 控え（付け替えでは 動かさないが、同じ 名前に なると 前の 額が 混ざる・対立役）
        //   mieru＝客に 見える 行の 数（消していない・入金は 0円で ない）＝訊く 文に 出す 数
        var out = { mieru: {} };
        var hyou = [
          [
            "invoice_no",
            "month",
            "",
            function () {
              return true;
            },
          ],
          [
            "meisai",
            "id",
            ",deleted_at",
            function (x) {
              return !x.deleted_at;
            },
          ],
          [
            "payments",
            "id",
            ",deleted_at,paid,memo,paid_date",
            function (x) {
              return !x.deleted_at && nyukinGaMieru(x.paid, x.memo, x.paid_date);
            },
          ],
          // 控えは 読み込みで deleted_at を 見ずに 前の 月の 額の 材料に 入る＝全部 数える
          [
            "invoices",
            "id",
            "",
            function () {
              return true;
            },
          ],
        ];
        for (var h = 0; h < hyou.length; h++) {
          var tbl = hyou[h][0];
          var kagi = hyou[h][1];
          var keys = [];
          var mieru = 0;
          var total = null;
          for (var from = 0; ; ) {
            var r = await SB.from(tbl)
              .select(kagi + hyou[h][2], { count: "exact" })
              .eq("company", na)
              .order(kagi)
              .range(from, from + 999);
            if (!r || r.error || !Array.isArray(r.data) || typeof r.count !== "number") return null;
            total = r.count;
            r.data.forEach(function (x) {
              if (x && x[kagi] != null) {
                keys.push(x[kagi]);
                if (hyou[h][3](x)) mieru++;
              }
            });
            if (!r.data.length || keys.length >= total) break;
            from += r.data.length;
          }
          if (keys.length !== total) return null;
          out[tbl] = keys;
          out.mieru[tbl] = mieru;
        }
        return out;
      }
      // 付け替えの 戻し：新しい 名前の 行から、先から 在った 行（消した 会社の 残り）を 除いて 元の 名前へ
      //   残りが 多すぎる（URL が 長く なる）時は 戻さず「戻せない」を 返す（一括で 戻して 他社の 行を 動かさない）
      async function modoshiDake(tbl, nokoriKeys, kagi, oldName, newName) {
        if (nokoriKeys.length > 100) return { error: { message: "残りの 行が 多すぎて 戻せない" } };
        var q = SB.from(tbl).update({ company: oldName }).eq("company", newName);
        if (nokoriKeys.length)
          q = q.not(
            kagi,
            "in",
            "(" +
              nokoriKeys
                .map(function (k) {
                  return '"' + String(k).replace(/"/g, '\\"') + '"';
                })
                .join(",") +
              ")"
          );
        return await q;
      }
      async function renameCompany(oldName, newName) {
        if (KAISHA_KIKU_CHU) {
          toast("会社の 記録を 確かめています。少し 待ってから もう一度 押してください。");
          renderMaster();
          return;
        }
        KAISHA_KIKU_CHU = true;
        try {
          await renameCompanyHontai(oldName, newName);
        } finally {
          KAISHA_KIKU_CHU = false;
        }
      }
      async function renameCompanyHontai(oldName, newName) {
        toastUndoKesu(); // 古い 名前の 取り消しを 残さない（押すと 古い 名前で 書いた・対立役）
        newName = (newName || "").trim();
        if (!newName || newName === oldName) {
          renderMaster();
          return;
        }
        if (MASTER[newName]) {
          toast("同名の会社があります");
          renderMaster();
          return;
        }
        // ★請求番号の 台帳も 名前を 変える★ 2026-10-08 対立役（変えないと 同じ 請求に 新しい 番号が 振られた）
        //   新しい 名前に 前の 台帳が 残っていて ぶつかる 時は 名前を 変えない（同じ 月に 番号が 2つに なる）
        if (YOMENAI.invoice_no) {
          toast(
            "請求番号の 台帳を 読めていないので 会社名を 変えられません。画面を 開き直してください。"
          );
          renderMaster();
          return;
        }
        // ★戻しは 動かした 行だけ★ 2026-10-16 対立役（新しい 名前で 一括に 戻すと、消した 会社の 名前に 残っていた
        //   入金・明細・請求番号まで 元の 会社へ 動かした）。台帳は 鍵が (人, 月, 会社) なので 月で、明細・入金は id で 戻す
        // ★新しい 名前に 先から 在る 行（消した 会社の 残り）を 付け替える 前に 読む★ 2026-10-16 対立役
        //   戻しは「新しい 名前の 行から この 残りを 除いた 全部」＝消した 会社の 行は 動かさず、読んだ 後に 足された 行も 戻る
        //   （動かした 行の 名簿で 戻すと 読んだ 後に 足された 行を 取りこぼし、書き換えの 返りで 戻すと 倉庫の 上限で 切られうる）。
        //   読めない・本数が 確かでない 時は 何も 書かない
        var nokori = await sakiNiAruGyou(newName);
        if (!nokori) {
          toast(
            "会社名を 変えませんでした（変える 前の 確かめを 読めませんでした）。通信を 確かめて もう一度 試してください。"
          );
          renderMaster();
          return;
        }
        if (!mazeruKaKiku(newName, nokori)) {
          toast(
            "会社名を 変えませんでした（残っている 記録と 混ぜない）。別の 名前に してください。"
          );
          renderMaster();
          return;
        }
        if (MASTER[newName] || !MASTER[oldName]) {
          toast("同名の会社があります"); // 訊いている 間に 別の 道で 変わった
          renderMaster();
          return;
        }
        var u0 = await SB.from("invoice_no").update({ company: newName }).eq("company", oldName);
        if (u0 && u0.error) {
          if (u0.error.code === "23505")
            toast(
              "「" +
                newName +
                "」に 同じ 月の 請求番号が 残っているので、混ぜられませんでした（何も 変えていません）。別の 名前に してください。"
            );
          else cloudErr("会社名変更（請求番号の 台帳）", u0.error);
          renderMaster();
          return;
        }
        // クラウド側：会社名に紐づく明細・入金もまとめて改名（RLSで自分の分だけ）
        var u1 = await SB.from("meisai").update({ company: newName }).eq("company", oldName);
        var u2 = await SB.from("payments").update({ company: newName }).eq("company", oldName);
        if ((u1 && u1.error) || (u2 && u2.error)) {
          // ★明細・入金の 改名が 落ちたら 台帳の 名前も 戻す★（対立役：台帳だけ 新しい 名前に なると 古い 名前で 出した 時に 番号が 2つ目に なる）
          var m0 = await modoshiDake("invoice_no", nokori.invoice_no, "month", oldName, newName);
          var m1 =
            u1 && !u1.error
              ? await modoshiDake("meisai", nokori.meisai, "id", oldName, newName)
              : null;
          // 入金が 付け替わっていたら 入金も 戻す 2026-10-16（対立役：倉庫の 入金だけ 新しい 名前に 残り、
          //   開き直すと 古い 名前の 帯の 行が「記録なし＝直った」と 消えた）
          var m2 =
            u2 && !u2.error
              ? await modoshiDake("payments", nokori.payments, "id", oldName, newName)
              : null;
          if ((m0 && m0.error) || (m1 && m1.error) || (m2 && m2.error)) {
            // ★戻しも 落ちた＝台帳・明細・入金の 名前が 割れて いる★（黙らない・対立役）
            toast(
              "会社名の 変更が 途中で 止まり、元に 戻せませんでした（請求番号の 台帳・明細・入金の 一部が「" +
                newName +
                "」の まま）。請求書を 出す 前に 画面を 開き直し、もう一度「" +
                newName +
                "」へ 変えてください。"
            );
            renderMaster();
            return;
          }
          var ue = (u1 && u1.error) || (u2 && u2.error);
          if (ue && ue.code === "23505")
            toast(
              "「" +
                newName +
                "」に 同じ 月の 入金・明細が 残っているので、混ぜられませんでした（元に 戻しました）。別の 名前に してください。"
            );
          else cloudErr("会社名変更", ue);
          renderMaster();
          return;
        }
        Object.keys(INVOICE_NO).forEach(function (k) {
          var p = k.split("|");
          if (p.slice(1).join("|") === oldName) {
            INVOICE_NO[invNoKey(p[0], newName)] = INVOICE_NO[k];
            delete INVOICE_NO[k];
          }
        });
        // MASTERの並び順を保ったままキーを差し替え
        var rebuilt = {};
        Object.keys(MASTER).forEach(function (k) {
          rebuilt[k === oldName ? newName : k] = MASTER[k];
        });
        MASTER = rebuilt;
        // 既存明細の会社名も追従（in-memory）
        var moved = 0;
        DB.forEach(function (r) {
          if (r.会社名 === oldName) {
            r.会社名 = newName;
            moved++;
          }
        });
        // 入金のin-memoryキーも改名
        Object.keys(PAYMENTS).forEach(function (k) {
          var parts = k.split("::");
          if (parts.slice(2).join("::") === oldName) {
            PAYMENTS[parts[0] + "::" + parts[1] + "::" + newName] = PAYMENTS[k];
            delete PAYMENTS[k];
            payKaita(k);
            payKaita(parts[0] + "::" + parts[1] + "::" + newName);
          }
        });
        modoseNaWoKaeru(oldName, newName);
        await saveMaster(); // 会社名(name)の更新をクラウドへ
        refreshCompanySelects();
        renderMaster();
        var b = document.querySelector('.master-co-body[data-co="' + CSS.escape(newName) + '"]');
        if (b) b.classList.add("open");
        toast("会社名を変更しました（明細" + moved + "件も更新）");
      }

      /* 請求書生成（定義駆動）は meisai-engine.js（MeisaiEngine.buildMonth / buildInvoiceHTML）へ集約。
            スマホ側は入力・修正に専念するため、ここでは呼ばない。 */

      /* ===================================================================
      モーダル
      =================================================================== */
