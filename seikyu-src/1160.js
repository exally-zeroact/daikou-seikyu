      // その 会社の 入金の 行を 倉庫から 全部 読む（消した 印の 行も・自分の 行だけ）
      async function ksYominaosu(co) {
        var r = await fetchAllQ(function (a, b) {
          return SB.from("payments")
            .select(KS_RETSU, { count: "exact" })
            .eq("user_id", CURRENT_ACCOUNT)
            .eq("company", co)
            .order("id")
            .range(a, b);
        });
        return r;
      }
      // 比べる 鍵（paid・入金日・メモ・回 を 揃えて JSON。回は 鍵の 順を 固定＝jsonb の 並べ替えに 負けない）
      function ksHikakuKagi(rec, month) {
        return JSON.stringify([
          Math.round(Number(rec.paid) || 0),
          hiDake(rec.paidDate),
          String(rec.note || ""),
          entriesOf(rec, month),
        ]);
      }
      // この 画面の 控え（その 会社・自分の 行）と 倉庫の 行（消した 印の 無い 行）が 同じか
      function ksOnaji(co, kuraRows) {
        var mae = CURRENT_ACCOUNT + "::";
        var mine = {};
        Object.keys(PAYMENTS).forEach(function (k) {
          if (k.indexOf(mae) !== 0) return;
          var rest = k.slice(mae.length);
          if (rest.slice(9) !== co) return;
          var rec = PAYMENTS[k];
          if (rec && rec.uid && rec.uid !== CURRENT_ACCOUNT) return; // 書いた 行は uid 無し＝自分（対立役 v4 注2）
          mine[rest.slice(0, 7)] = ksHikakuKagi(rec || {}, rest.slice(0, 7));
        });
        var kura = {};
        kuraRows.forEach(function (r) {
          if (r.deleted_at) return;
          kura[r.month] = ksHikakuKagi(payRecFromDb(r), r.month);
        });
        var a = Object.keys(mine).sort();
        var b = Object.keys(kura).sort();
        if (a.join("|") !== b.join("|")) return false;
        return a.every(function (m) {
          return mine[m] === kura[m];
        });
      }
      // 倉庫の 値で その 会社の 控えを 置き換える（倉庫に 無い 鍵は 消す）
      function ksOkikae(co, kuraRows, hajime) {
        var mae = CURRENT_ACCOUNT + "::";
        Object.keys(PAYMENTS).forEach(function (k) {
          if (k.indexOf(mae) !== 0) return;
          var rest = k.slice(mae.length);
          if (rest.slice(9) !== co) return;
          var rec = PAYMENTS[k];
          if (rec && rec.uid && rec.uid !== CURRENT_ACCOUNT) return;
          delete PAYMENTS[k];
          PAY_KOSHIN[k] = hajime;
        });
        kuraRows.forEach(function (r) {
          if (r.deleted_at) return;
          var k = mae + r.month + "::" + co;
          PAYMENTS[k] = payRecFromDb(r);
          PAY_KOSHIN[k] = hajime;
        });
      }
      // 書いた 行の 返り（本物は 配列・1行なら 物の 形で 返る 道も 受ける）＝何行 当たったかを 数える
      function ksGyou(res) {
        if (!res || res.error || res.data == null) return [];
        return Array.isArray(res.data) ? res.data : [res.data];
      }
      // 回を 日の 順の 場所へ 入れる（最後の 回＝一番 新しい 日＝入金日・対立役 v1 任5）
      function ksKaiIreru(mae, kai) {
        var out = mae.slice();
        var at = out.length;
        while (at > 0 && String(out[at - 1].hi || "") > kai.hi) at--;
        out.splice(at, 0, kai);
        return out;
      }
      /* 記録する（月ごとに 古い 月から）。戻り＝{ ok, kawatta, kaita:[{month, gaku}], undo:[…], err } */
      async function ksKiroku(co, ate, src, hi) {
        var hajime = Date.now();
        var y = await ksYominaosu(co);
        if (y.error) {
          cloudErr("入金の読み直し", y.error);
          return { ok: false, kaita: [], undo: [], err: "yomenai" };
        }
        if (!ksOnaji(co, y.data)) {
          ksOkikae(co, y.data, hajime);
          return { ok: false, kawatta: true, kaita: [], undo: [] };
        }
        var byMonth = {};
        y.data.forEach(function (r) {
          byMonth[r.month] = r;
        });
        var kaita = [];
        var undo = [];
        // ★0円・マイナスは 書かない★＝1件目を 書く 前に 全部の 当てを 見る（候補の 作りが 割れても 半分だけ 書かない・本番前 taiketsu 2回目 止1・再叩き 注1）
        var okashii = ate.filter(function (a) {
          return !(a.gaku > 0) || Math.round(a.gaku) !== a.gaku || (a.tesuryo || 0) > a.gaku;
        });
        if (!ate.length || okashii.length) {
          toast(
            "当てる額がおかしいので記録しませんでした" +
              (okashii[0]
                ? "（" + ksTsuki(okashii[0].month) + " " + yen(okashii[0].gaku) + "）"
                : "")
          );
          return { ok: false, kaita: kaita, undo: undo, err: "gaku" };
        }
        for (var i = 0; i < ate.length; i++) {
          var a = ate[i];
          var kai = { gaku: a.gaku, hi: hi, src: src };
          if (a.tesuryo > 0) kai.tesuryo = a.tesuryo;
          kai = kaiTsukuru(kai, a.gaku, hi);
          var r = byMonth[a.month];
          var q;
          var maeRec = null;
          if (r && !r.deleted_at) {
            maeRec = payRecFromDb(r);
            var ent = ksKaiIreru(entriesOf(maeRec, a.month), kai);
            q = SB.from("payments")
              .update({
                paid: Math.round(Number(r.paid) || 0) + a.gaku,
                paid_date: ent[ent.length - 1].hi,
                memo: r.memo || "",
                entries: ent,
                deleted_at: null,
              })
              .eq("id", r.id)
              .eq("paid", r.paid);
            q = r.paid_date == null ? q.is("paid_date", null) : q.eq("paid_date", r.paid_date);
          } else if (r) {
            // ★消した 印の 行を 蘇らせる＝今回の 回だけ（消した 回と メモを 戻さない・対立役 v4 注1）★
            q = SB.from("payments")
              .update({ paid: a.gaku, paid_date: hi, memo: "", entries: [kai], deleted_at: null })
              .eq("id", r.id)
              .eq("paid", r.paid);
          } else {
            q = SB.from("payments").insert({
              user_id: CURRENT_ACCOUNT,
              month: a.month,
              company: co,
              paid: a.gaku,
              paid_date: hi,
              memo: "",
              entries: [kai],
            });
          }
          var res = await q.select(KS_RETSU);
          var d = ksGyou(res);
          if (res.error || d.length !== 1) {
            if (res.error) cloudErr("入金保存", res.error);
            return { ok: false, kaita: kaita, undo: undo, err: res.error ? "kakenai" : "kawatta" };
          }
          res = { data: d };
          var key = payKeyFor(a.month, co);
          PAYMENTS[key] = payRecFromDb(res.data[0]);
          payKaita(key);
          kaita.push({ month: a.month, gaku: a.gaku, tesuryo: a.tesuryo || 0 });
          undo.push({ month: a.month, id: res.data[0].id, mae: maeRec, ato: res.data[0] });
        }
        return { ok: true, kaita: kaita, undo: undo };
      }
      // 取り消し＝同じ 門（倉庫の 行が 書いた 直後の 値と 同じ 時だけ 戻す・対立役 v2 注2）
      async function ksTorikeshi(co, undo) {
        var y = await ksYominaosu(co);
        if (y.error) {
          cloudErr("入金の読み直し", y.error);
          return false;
        }
        var byId = {};
        y.data.forEach(function (r) {
          byId[r.id] = r;
        });
        var dame = undo.some(function (u) {
          var r = byId[u.id];
          return (
            !r ||
            ksHikakuKagi(payRecFromDb(r), u.month) !== ksHikakuKagi(payRecFromDb(u.ato), u.month)
          );
        });
        if (dame) {
          ksOkikae(co, y.data, Date.now());
          renderPayments();
          updatePayBadge();
          toast("別の端末で入金が変わったので取り消せません（一覧を読み直しました）");
          return false;
        }
        for (var i = undo.length - 1; i >= 0; i--) {
          var u = undo[i];
          var res;
          if (!u.mae)
            res = await SB.from("payments")
              .delete()
              .eq("id", u.id)
              .eq("paid", u.ato.paid)
              .select("id");
          else
            res = await SB.from("payments")
              .update({
                paid: u.mae.paid,
                paid_date: u.mae.paidDate || null,
                memo: u.mae.note || "",
                entries: u.mae.entries,
              })
              .eq("id", u.id)
              .eq("paid", u.ato.paid)
              .select(KS_RETSU);
          var key = payKeyFor(u.month, co);
          var d = ksGyou(res);
          if (res.error || d.length !== 1) {
            if (res.error) cloudErr("入金の取り消し", res.error);
            toast(
              "取り消しが途中で止まりました（" + ksTsuki(u.month) + "）。一覧を確かめてください"
            );
            renderPayments();
            updatePayBadge();
            return false;
          }
          if (!u.mae) delete PAYMENTS[key];
          else PAYMENTS[key] = payRecFromDb(d[0]);
          payKaita(key);
        }
        renderPayments();
        updatePayBadge();
        toast("取り消しました");
        return true;
      }
      // 名義を 覚える＝その 1社だけ 書く（全社を 書く saveMaster を 使わない・対立役 v1 任4）
      async function ksMeigiOboeru(co, meigi) {
        var m = MASTER[co];
        if (!m || !m._dbid) return;
        var nm = Keshikomi.kanaSeiki(meigi);
        var ima = (m.furikomiMeigi || []).map(Keshikomi.kanaSeiki);
        if (!nm || ima.indexOf(nm) >= 0) return;
        m.furikomiMeigi = (m.furikomiMeigi || []).concat([meigi]);
        var u = await SB.from("companies").update(companyToDb(co)).eq("id", m._dbid);
        if (u.error) cloudErr("振込名義の保存", u.error);
      }
      async function ksOshita(i, j) {
        if (!KS || KS.oshiteru) return;
        if (yomenaiTomeru(["payments"], "入金の 保存")) return;
        var n = KS.nyukin[i];
        if (!n) return;
        var zumiGaku = ksKirokuZumi(i, n);
        if (zumiGaku >= n.gaku) {
          ksKaku();
          return;
        }
        var nyu = { hi: n.hi, gaku: n.gaku - zumiGaku, meigi: n.meigi };
        var koho = Keshikomi.kohoTsukuru(nyu, ksKaisha());
        var k = koho[j];
        if (!k || !k.ate.length) {
          ksKaku();
          return;
        }
        var oboe = document.querySelector(
          '#ksBody .ksOboe[data-i="' + i + '"][data-j="' + j + '"]'
        );
        var oboeru = !!(oboe && oboe.checked);
        KS.oshiteru = true;
        ksKaku();
        toastUndoKesu();
        var src = Keshikomi.srcTsukuru(n, n.nanbon);
        var r;
        try {
          r = await ksKiroku(k.co, k.ate, src, n.hi);
        } finally {
          KS.oshiteru = false;
        }
        if (r.kaita.length) {
          // 銀行に 入った 額の うち 書けた 分（こちら持ちの 手数料は 入った 額に 入らない）
          var g = r.kaita.reduce(function (t, x) {
            return t + x.gaku - (x.tesuryo || 0);
          }, 0);
          KS.kiroku[i] = r.ok ? n.gaku : zumiGaku + g; // 全部 書けた＝この 明細の 行は 済み
          KS.kaita[i] =
            k.co +
            " " +
            r.kaita
              .map(function (x) {
                return ksTsuki(x.month) + "の行 " + yen(x.gaku);
              })
              .join("・");
        }
        if (r.ok && oboeru) await ksMeigiOboeru(k.co, n.meigi);
        renderPayments();
        updatePayBadge();
        ksKaku();
        if (r.kawatta) {
          toast(
            "別の端末で入金が変わっていました。読み直したので、候補を見直してからもう一度押してください"
          );
          return;
        }
        if (!r.ok) {
          if (r.kaita.length)
            toast(
              ksTsuki(r.kaita[r.kaita.length - 1].month) +
                "まで記録しました。その先は記録できていません（残りの候補を見て押し直してください）"
            );
          else if (r.err === "kawatta")
            toast("別の端末で入金が変わっていました。もう一度読み直してから押してください");
          return;
        }
        KS.undo[i] = { co: k.co, undo: r.undo };
        ksKaku();
        var ks0 = KS;
        toastUndo(k.co + " に入金を記録しました（" + yen(n.gaku) + "）", function () {
          if (KS === ks0) ksTorikeshiGyou(i);
        });
      }
