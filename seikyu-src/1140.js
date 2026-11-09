      function ksMidashi(v) {
        if (KS.oshiteru) return ksKaku();
        ksGyouKesu();
        KS.midashi = Number(v);
        KS.retsu = Keshikomi.retsuSuitei(KS.rows[KS.midashi] || []);
        ksKaku();
      }
      function ksRetsu(k, v) {
        if (KS.oshiteru) return ksKaku();
        ksGyouKesu();
        KS.retsu[k] = Number(v);
        if (k === "kubun") KS.retsu.kubunNyukin = null;
        ksKaku();
      }
      function ksKubun(v) {
        if (KS.oshiteru) return ksKaku();
        ksGyouKesu();
        KS.retsu.kubunNyukin = v ? [v] : null;
        ksKaku();
      }
      // 会社ごとの 未入金の 月（古い 順）＝候補の 元
      function ksKaisha() {
        var by = {};
        seikyuList(null).forEach(function (iv) {
          var m = MASTER[iv.company];
          if (!m) return;
          if (m.account_id && m.account_id !== CURRENT_ACCOUNT) return;
          // 繰越の 会社＝その 月の 請求書の 未入金（前の 月の 分込み）／他＝一覧の 行の 残
          var zan = m.carryover
            ? zenNyukinGaku(iv) - iv.paidKiroku
            : Math.max(iv.total, 0) - iv.paid;
          if (!(zan > 0)) return;
          (by[iv.company] = by[iv.company] || []).push({ month: iv.month, zan: zan });
        });
        return Object.keys(by).map(function (co) {
          var m = MASTER[co];
          return {
            name: co,
            meigi: (m.furikomiMeigi || []).slice(),
            kochira: m.tesuryoFutan === "kochira",
            carryover: !!m.carryover,
            mitsuki: by[co].sort(function (a, b) {
              return a.month.localeCompare(b.month);
            }),
          };
        });
      }
      // その 会社の 全部の 回（二重の 見分け）
      function ksKaiZenbu(co) {
        var out = [];
        var mae = CURRENT_ACCOUNT + "::";
        Object.keys(PAYMENTS).forEach(function (k) {
          if (k.indexOf(mae) !== 0) return;
          var rest = k.slice(mae.length);
          // co が null＝全部の 会社（「かも」は 全社の 回で 見る・本番前 taiketsu 2回目 注2）
          if (co != null && rest.slice(9) !== co) return;
          var gyou = rest.slice(0, 7);
          entriesOf(PAYMENTS[k] || {}, gyou).forEach(function (e) {
            out.push({
              co: rest.slice(9),
              month: gyou,
              gaku: e.gaku,
              hi: e.hi,
              src: e.src,
              tesuryo: e.tesuryo,
            });
          });
        });
        return out;
      }
      // src が 同じ 明細の 行（日と 額が 同じ）から 来たか＝"csv:日:額:…"
      function ksOnajiMeisai(src, n) {
        return typeof src === "string" && src.indexOf("csv:" + n.hi + ":" + n.gaku + ":") === 0;
      }
      // 同じ src の 回が 在る 所（全部の 会社）＝["山田建設 2026年10月の行 ¥20,000", …]
      /* 同じ src の 回が 在る 所と、その 回で 消した「入った 額」の 合計（額−手数料）
              ★残りは 窓の 覚えでなく 倉庫の 回から 出す★（まとめ入金が 途中で 止まった 後に 窓を 開き直しても 残りを 押せる・本番前 taiketsu 再叩き 注1） */
      function ksZumiDoko(n) {
        var src = Keshikomi.srcTsukuru(n, n.nanbon);
        var out = [];
        var gaku = 0;
        var mae = CURRENT_ACCOUNT + "::";
        Object.keys(PAYMENTS).forEach(function (k) {
          if (k.indexOf(mae) !== 0) return;
          var rest = k.slice(mae.length);
          var gyou = rest.slice(0, 7);
          entriesOf(PAYMENTS[k] || {}, gyou).forEach(function (e) {
            if (e.src === src) {
              out.push(rest.slice(9) + " " + ksTsuki(gyou) + "の行 " + yen(e.gaku));
              gaku += e.gaku - (e.tesuryo || 0);
            }
          });
        });
        return { doko: out, gaku: gaku };
      }
      // この 明細の 行で もう 記録した 入った 額（窓の 覚えと 倉庫の 回の 多い 方）
      function ksKirokuZumi(i, n) {
        return Math.max(KS.kiroku[i] || 0, ksZumiDoko(n).gaku);
      }
      function ksTsuki(m) {
        var p = String(m).split("-");
        return Number(p[0]) + "年" + Number(p[1]) + "月";
      }
      function ksKohoJi(k) {
        var ate = k.ate
          .map(function (a) {
            return ksTsuki(a.month) + " " + yen(a.gaku);
          })
          .join("・");
        var s = "";
        if (k.kind === "pittari") s = "ぴったり";
        else if (k.kind === "matome") s = "まとめ入金（古い月から）";
        else if (k.kind === "ichibu") s = "一部入金";
        if (k.kind === "sa" || (k.kind === "matome" && k.sa > 0)) {
          s +=
            (s ? "・" : "") +
            "差 " +
            yen(k.sa) +
            "（振込手数料かも）" +
            (k.kochira
              ? "→ 振込手数料（当方負担）として消して請求を閉じます"
              : "→ 入った額だけ記録します。差 " +
                yen(k.sa) +
                " は未入金で残ります" +
                (k.carryover ? "（次の請求書の繰越に載ります）" : ""));
        }
        var naka = k.carryover ? "（その月の請求書の未入金・前の月の分込み）" : "";
        return (
          esc(k.co) +
          (k.meigiAtari ? "" : "（振込名義は一致していません）") +
          "：" +
          esc(ate) +
          esc(naka) +
          "　" +
          esc(s)
        );
      }
      function ksKaku() {
        var body = document.getElementById("ksBody");
        if (!body || !KS) return;
        var rows = KS.rows;
        var h = "";
        if (!rows.length) {
          body.innerHTML = '<div class="pay-sub">中身の行がありません。</div>';
          return;
        }
        // 見出しの 行と 列は 人が 直せる（推しは 外れる・対立役 注5）
        var midashi = rows[KS.midashi] || [];
        var opt = function (k, label) {
          var s =
            '<label style="display:inline-block;margin:0 10px 6px 0;font-size:12px;">' +
            label +
            ' <select class="fselect" style="width:auto;" onchange="ksRetsu(\'' +
            k +
            '\',this.value)"><option value="-1">（無し）</option>';
          midashi.forEach(function (x, i) {
            s +=
              '<option value="' +
              i +
              '"' +
              (KS.retsu[k] === i ? " selected" : "") +
              ">" +
              esc(String(x || "列" + (i + 1))) +
              "</option>";
          });
          return s + "</select></label>";
        };
        h +=
          '<div style="margin:10px 0 6px;font-size:12px;color:#555555;">' +
          esc(KS.name) +
          "（" +
          esc(KS.code) +
          "・" +
          rows.length +
          "行）</div>";
        h +=
          '<label style="display:inline-block;margin:0 10px 6px 0;font-size:12px;">見出しの行 <select class="fselect" style="width:auto;" onchange="ksMidashi(this.value)">';
        for (var g = 0; g < Math.min(rows.length, 15); g++)
          h +=
            '<option value="' +
            g +
            '"' +
            (KS.midashi === g ? " selected" : "") +
            ">" +
            (rows[g].gyou || g + 1) +
            "行目：" +
            esc(rows[g].slice(0, 4).join(" / ").slice(0, 40)) +
            "</option>";
        h += "</select></label><br>";
        if (KS.midashi < 0) {
          body.innerHTML =
            h +
            '<div class="pay-sub" style="color:#b00020;">見出しの行が見つかりません。上で見出しの行を選んでください。</div>';
          return;
        }
        h +=
          opt("hi", "日付") +
          opt("nyukin", "入金") +
          opt("kingaku", "金額（1列の時）") +
          opt("kubun", "入払区分") +
          opt("meigi", "振込名義");
        if (KS.retsu.kubun >= 0) {
          var vals = {};
          rows.slice(KS.midashi + 1).forEach(function (r) {
            var v = String(r[KS.retsu.kubun] || "")
              .normalize("NFKC")
              .trim();
            if (v) vals[v] = 1;
          });
          var cur = KS.retsu.kubunNyukin ? KS.retsu.kubunNyukin[0] : "";
          h +=
            '<label style="display:inline-block;margin:0 10px 6px 0;font-size:12px;">入金の区分 <select class="fselect" style="width:auto;" onchange="ksKubun(this.value)"><option value="">（既定：入金・預入）</option>';
          Object.keys(vals).forEach(function (v) {
            h +=
              '<option value="' +
              esc(v) +
              '"' +
              (cur === v ? " selected" : "") +
              ">" +
              esc(v) +
              "</option>";
          });
          h += "</select></label>";
        }
        var r = Keshikomi.nyukinNukidasu(rows, KS.midashi + 1, KS.retsu);
        if (r.err) {
          body.innerHTML =
            h + '<div class="pay-sub" style="color:#b00020;">' + esc(r.err) + "</div>";
          return;
        }
        KS.nyukin = r.nyukin;
        // 同じ 日・額・名義の 何本目か（2本目から src に 付ける・本番前 taiketsu 注1）
        var _nb = {};
        r.nyukin.forEach(function (x) {
          var kk = x.hi + "|" + x.gaku + "|" + Keshikomi.kanaSeiki(x.meigi);
          _nb[kk] = (_nb[kk] || 0) + 1;
          x.nanbon = _nb[kk];
        });
        // ★落とした 行は 訳ごとに 数を 出す（黙って 捨てない）★
        var ot = r.otosu;
        var otoshi = [];
        if (ot.shukkin) otoshi.push("出金・入金の欄が空 " + ot.shukkin + "行");
        if (ot.hizuke.length)
          otoshi.push(
            "日付が読めない " +
              ot.hizuke.length +
              "行（" +
              ot.hizuke.slice(0, 5).join("・") +
              "行目）"
          );
        if (ot.gaku.length)
          otoshi.push(
            "額が読めない " + ot.gaku.length + "行（" + ot.gaku.slice(0, 5).join("・") + "行目）"
          );
        if (ot.retsu.length)
          otoshi.push(
            "欄が足りない " + ot.retsu.length + "行（" + ot.retsu.slice(0, 5).join("・") + "行目）"
          );
        h +=
          '<div class="pay-sub" id="ksKazu" style="margin:6px 0;color:#555555;">入金 ' +
          r.nyukin.length +
          "件" +
          (otoshi.length ? "・候補にしなかった行：" + esc(otoshi.join("／")) : "") +
          "</div>";
        var kaisha = ksKaisha();
        // 今 読んでいる CSV の 行ごとの src（その 行 自身は 除いて 使う）
        var ksSrcGyou = {};
        r.nyukin.forEach(function (x, xi) {
          ksSrcGyou[Keshikomi.srcTsukuru(x, x.nanbon)] = xi;
        });
        r.nyukin.forEach(function (n, i) {
          var zumiGaku = ksKirokuZumi(i, n);
          var nokori = n.gaku - zumiGaku;
          var p = n.hi.split("-");
          h +=
            '<div class="ks-gyou" data-i="' +
            i +
            '" style="border:1px solid #dddddd;border-radius:8px;padding:8px;margin:6px 0;">' +
            '<div style="font-weight:600;">' +
            Number(p[1]) +
            "/" +
            Number(p[2]) +
            "　" +
            yen(n.gaku) +
            "　" +
            esc(n.meigi) +
            "</div>";
          if (KS.kaita[i] && nokori <= 0) {
            h +=
              '<div class="ks-kaita" style="color:#1565c0;">記録しました（' +
              esc(KS.kaita[i]) +
              "）" +
              (KS.undo[i]
                ? ' <button class="btn btn-ghost btn-sm ks-torikeshi" style="width:auto;" ' +
                  (KS.oshiteru ? "disabled " : "") +
                  'onclick="ksTorikeshiGyou(' +
                  i +
                  ')">取り消す</button>'
                : "") +
              "</div></div>";
            return;
          }
          // ★同じ 明細の 行が もう どこかの 行に 記録されている＝候補より 先に 見る（請求が 残っていなくても 出す）★
          if (nokori <= 0) {
            h +=
              '<div class="ks-zumi" style="color:#1565c0;">この明細の入金は記録済みです（' +
              esc(ksZumiDoko(n).doko.join("・")) +
              "）</div></div>";
            return;
          }
          var nyu = { hi: n.hi, gaku: nokori, meigi: n.meigi };
          var ksBetsuGyouSrc = {};
          Object.keys(ksSrcGyou).forEach(function (sk) {
            if (ksSrcGyou[sk] !== i) ksBetsuGyouSrc[sk] = 1;
          });
          var koho = Keshikomi.kohoTsukuru(nyu, kaisha);
          if (zumiGaku > 0)
            h +=
              '<div style="color:#b00020;">途中まで記録しました（' +
              esc(KS.kaita[i] || ksZumiDoko(n).doko.join("・")) +
              "）。残り " +
              yen(nokori) +
              " の候補です。</div>";
          if (!koho.length) {
            h +=
              '<div class="ks-nashi" style="color:#555555;">合う請求がありません（入金の一覧から手で記録してください）</div></div>';
            return;
          }
          koho.forEach(function (k, j) {
            // 途中まで 記録した 行も 残りの 額で「かも」を 見る（同じ src の 回は 記録した 分＝zumi は 使わない・再叩き 注1）
            // 「かも」の 元＝候補の 会社の 全部の 回＋他の 会社は 同じ 明細の 行（日と 額が 同じ CSV の src）を 読み直した 回だけ
            //   （全社の 回を 全部 見ると 定額の 別の 会社の 普通の 入金にも 毎回 出て 読まれなくなる・再叩き 注2）
            var nj = Keshikomi.nijuu(
              n,
              ksKaiZenbu(null).filter(function (e) {
                // 今 読んでいる CSV の 別の 行の 記録（同じ日・同じ額の 別の 名義）は 外す（3回目の 叩き 注1）
                return e.co === k.co || (ksOnajiMeisai(e.src, n) && !ksBetsuGyouSrc[e.src]);
              }),
              n.nanbon,
              zumiGaku > 0 ? nokori : 0
            );
            if (zumiGaku > 0) nj.zumi = [];
            h += '<div class="ks-koho" style="margin-top:6px;">' + (j + 1) + ". ";
            if (k.kind === "oosugi") {
              h +=
                esc(k.co) +
                "：請求より " +
                yen(k.oosugi) +
                " 多い入金です。ここでは記録しません（入金の一覧から手で記録してください）";
              // 多い＝もう 記録した 入金を 読み直した 時に よく 出る＝「かも」も 出す（本番前 taiketsu 止1）
              if (nj.kamo.length)
                h +=
                  '<div class="ks-kamo" style="color:#b00020;">記録済みかも：' +
                  esc(
                    nj.kamo
                      .map(function (e) {
                        var q = String(e.hi || "").split("-");
                        return (
                          (e.co ? e.co + " " : "") +
                          ksTsuki(e.month) +
                          "の行に " +
                          Number(q[1]) +
                          "/" +
                          Number(q[2]) +
                          " " +
                          yen(e.gaku)
                        );
                      })
                      .join("・")
                  ) +
                  "</div>";
              h += "</div>";
              return;
            }
            h += ksKohoJi(k);
            if (nj.zumi.length) {
              h +=
                '<div class="ks-zumi" style="color:#1565c0;">この明細の入金は記録済みです（' +
                esc(
                  nj.zumi
                    .map(function (e) {
                      return ksTsuki(e.month) + "の行 " + yen(e.gaku);
                    })
                    .join("・")
                ) +
                "）</div></div>";
              return;
            }
            if (nj.kamo.length)
              h +=
                '<div class="ks-kamo" style="color:#b00020;">記録済みかも：' +
                esc(
                  nj.kamo
                    .map(function (e) {
                      var q = String(e.hi || "").split("-");
                      return (
                        (e.co ? e.co + " " : "") +
                        ksTsuki(e.month) +
                        "の行に " +
                        Number(q[1]) +
                        "/" +
                        Number(q[2]) +
                        " " +
                        yen(e.gaku)
                      );
                    })
                    .join("・")
                ) +
                "</div>";
            if (!k.meigiAtari && Keshikomi.kanaSeiki(n.meigi).length >= Keshikomi.MEIGI_MIN)
              h +=
                '<label style="display:block;font-size:11px;margin-top:2px;"><input type="checkbox" class="ksOboe" data-i="' +
                i +
                '" data-j="' +
                j +
                '"> この名義を ' +
                esc(k.co) +
                " の振込名義として覚える</label>";
            h +=
              '<button class="btn btn-primary btn-sm ks-oshi" style="width:auto;margin-top:4px;" ' +
              (KS.oshiteru ? "disabled " : "") +
              'onclick="ksOshita(' +
              i +
              "," +
              j +
              ')">' +
              (nj.kamo.length ? "それでも記録する" : "記録する") +
              "</button></div>";
          });
          h += "</div>";
        });
        body.innerHTML = h;
      }
