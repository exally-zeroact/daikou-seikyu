      async function ksTorikeshiGyou(i) {
        if (!KS || KS.oshiteru || !KS.undo[i]) return;
        var u = KS.undo[i];
        toastUndoKesu();
        KS.oshiteru = true;
        ksKaku();
        var ok;
        try {
          ok = await ksTorikeshi(u.co, u.undo);
        } finally {
          KS.oshiteru = false;
        }
        if (ok) {
          delete KS.kiroku[i];
          delete KS.kaita[i];
          delete KS.undo[i];
        }
        ksKaku();
      }
      function kyouNoHi() {
        var d = new Date();
        return (
          d.getFullYear() +
          "-" +
          ("0" + (d.getMonth() + 1)).slice(-2) +
          "-" +
          ("0" + d.getDate()).slice(-2)
        );
      }
      // その 会社の 入金を 入金日の 月ごとに 足す（1回ずつ）
      function nyukinByTsuki(co) {
        var out = {};
        var mae = CURRENT_ACCOUNT + "::";
        Object.keys(PAYMENTS).forEach(function (k) {
          if (k.indexOf(mae) !== 0) return;
          var rest = k.slice(mae.length); // "YYYY-MM::会社"
          var gyou = rest.slice(0, 7);
          if (rest.slice(9) !== co) return;
          var rec = PAYMENTS[k] || {};
          entriesOf(rec, gyou).forEach(function (e) {
            var t = e.hi ? e.hi.slice(0, 7) : nyukinNoTsuki(rec, gyou);
            out[t] = (out[t] || 0) + e.gaku;
          });
        });
        return out;
      }
      // 戻り＝{ kako: 当月より 前の 月の [{month, seikyu, nyukin}], uketori: 当月の 中に 入った 入金 }
      function carryMaterialFor(month, co) {
        var kako = [];
        var rowsBy = {};
        DB.forEach(function (r) {
          if (r.account_id !== CURRENT_ACCOUNT || r.会社名 !== co || !r.日付) return;
          var m2 = String(r.日付).slice(0, 7);
          if (m2 < month) (rowsBy[m2] = rowsBy[m2] || []).push(r);
        });
        var m = MASTER[co] || {};
        var nb = nyukinByTsuki(co);
        // ★入金を 読めない 時は 入金を「不明」（null）で 渡す★ 2026-11-02（注C）
        //   前は nb[m2] || 0 ＝読めないのに 0円入金で 繰越を 数え、払い済みの 客でも 全額 残りに 見えた
        //   ⇒ エンジンが「入金は未確認」を 刷り、上は その月の 合計（発行・Excel・確認は kurikoshiTomeru が 止める）
        var fumei = !!YOMENAI.payments;
        var tsuki = Object.keys(rowsBy);
        Object.keys(nb).forEach(function (t) {
          if (t < month && !rowsBy[t]) tsuki.push(t);
        });
        tsuki.sort().forEach(function (m2) {
          kako.push({
            month: m2,
            seikyu: rowsBy[m2]
              ? MeisaiEngine.invoiceTotals(rowsBy[m2], { taxMode: m.taxMode }).goukei
              : 0,
            nyukin: fumei ? null : nb[m2] || 0,
            nyukinDake: !rowsBy[m2], // 入金だけ 入った 月（前回の 請求には 数えない）
          });
        });
        return { kako: kako, uketori: fumei ? null : nb[month] || 0 };
      }

      // ★発行の控えを1行 積む★（明細・自社情報・様式の写しつき）
      async function saveInvoiceCopy(month, co, rows, iss, no) {
        var rec = makeInvoiceCopy(month, co, rows, iss, no);
        await writeInvoiceCopies([rec]);
        return rec;
      }
      function makeInvoiceCopy(month, co, rows, iss, no) {
        /* ★控えの 合計は 請求書と 同じ 関数で 出す★ 2026-10-02 夜（対立役）
                前は 明細の 足し算（＝外税なら 税抜）と 内税の 式の 消費税を 残していた。
                控えの total は 繰越の「前回の 請求額」に 使う ⇒ 外税の 会社は
                ★消費税の 分 少なく 残り、お客さんが 請求書どおり 払うと 繰越が「払い過ぎ」に 出た★。
                内税の 会社は 合計も 消費税も 前と 同じ 数。 */
        var _t = MeisaiEngine.invoiceTotals(rows, {
          taxMode: (MASTER[co] && MASTER[co].taxMode) || "",
        });
        var total = _t.goukei;
        var rec = {
          user_id: CURRENT_ACCOUNT,
          month: month,
          company: co,
          invoice_no: no,
          total: total,
          tax: _t.zei,
          rows_json: rows.map(function (r) {
            var o = {};
            MeisaiEngine.FIELD_DEFS.forEach(function (f) {
              o[f.key] = r[f.key];
            });
            return o;
          }),
          issuer_json: { lines: iss.lines, bank: iss.bank, regno: regnoOf(currentIssuer()) },
          design_json: {
            templateId: iss.templateId,
            items: (MASTER[co] && MASTER[co].items) || [],
            widths: (MASTER[co] && MASTER[co].widths) || {},
            aligns: (MASTER[co] && MASTER[co].aligns) || {},
          },
        };
        return rec;
      }
      // 控えを 倉庫に 積む。返り値＝残せなかった 会社の 名前
      //   2026-11-01 夜 控えは 繰越に 使わない（繰越は 今の 明細）＝使うのは 番号の 空き数えの 予備 だけ
      //   （番号は 先に 台帳 invoice_no に 書く）。書けなくても 紙・繰越・番号は 変わらない ので 客への 知らせは 出さない
      //   （前は「次の 月の 前回繰越が 読めません」と 出した・司さん「読めませんってふざけすぎとるやろが」）。
      //   書けなかった 時は 1回 だけ 自動で やり直す。2行 積まれても 害は 無い（控えは 出すたび 1行 積む 物）
      async function writeInvoiceCopies(recs) {
        if (!SB || !CURRENT_ACCOUNT || !recs.length) return [];
        var ok = false;
        for (var tabi = 0; tabi < 2 && !ok; tabi++) {
          if (tabi)
            await new Promise(function (res) {
              setTimeout(res, 800);
            });
          try {
            var r = await SB.from("invoices").insert(recs.length === 1 ? recs[0] : recs);
            if (r && r.error) {
              if (tabi) cloudErr("請求書の控え保存", r.error);
            } else ok = true;
          } catch (e) {
            if (tabi) cloudErr("請求書の控え保存", e);
          }
        }
        return ok
          ? []
          : recs.map(function (rec) {
              return rec.company;
            });
      }
      var ISSUER_SETTINGS = {};
