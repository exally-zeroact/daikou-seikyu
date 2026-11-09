      // ★1件の 取り消し★ 2026-11-01（司さん：「選択」＝一括入金を 消した。一括の 取り消しが
      //   「戻せなかった」帯の ただ 1つの 呼び手 だった＝対立役：消すと 帯は 古い 覚えを 出すだけに なる）
      //   戻せなかった 時は 知らせ 1枚で 終わらせず、帯に 月・会社・前の 額を 足す（知らせは 電話で 切れる）
      async function undoIchiken(month, co, snap) {
        var ok = await undoPayState(month, co, snap, true);
        if (ok) {
          toast("取り消しました");
          return true;
        }
        // 読めなくて 止まった 時は「開き直して」の 知らせを 残す（上書きすると 訳が 消える・対立役）
        if (!yomenaiNo(["payments"]).length)
          toast(co + " を戻せませんでした（入金の画面に一覧を出しています）");
        modoseNakattaMado(1, [{ month: month, co: co, snap: snap }]);
        return false;
      }
      // ★戻せなかった 入金の 一覧★ 2026-10-16（対立役：知らせ 1枚だと 電話で 切れる・直して 保存すると 消える）
      //   入金の 画面の 一覧の 上に「閉じる」まで 残す（窓に すると 直す 窓を 開いた 時に 消える）。
      //   年・月・会社・前の 額・前の 入金日（客が 手で 前に 戻せる 様に）
      // ★覚える★＝ログインした 人ごと・この 端末（開き直しても 消えない・対立役：訳の 通りに 開き直すと 一覧が 消えた）
      var MODOSE = null;
      function modoseKagi() {
        return "payModose:" + String(CURRENT_ACCOUNT || "");
      }
      // 返り値：覚えた 一覧（無ければ null）。端末の 覚えが 読めない 時は undefined（＝この 画面の MODOSE を 使う）
      function modoseYomu() {
        try {
          var o = JSON.parse(localStorage.getItem(modoseKagi()) || "null");
          return o && Array.isArray(o.dame) && o.dame.length ? o : null;
        } catch (e) {
          return undefined;
        }
      }
      // 書けたかを 覚える（書けない 端末で 覚えを 正に すると 帯が 一度も 出ない・新しい 行が 消えた・対立役）
      var MODOSE_KAKETA = true;
      function modoseKaku() {
        try {
          if (MODOSE) localStorage.setItem(modoseKagi(), JSON.stringify(MODOSE));
          else localStorage.removeItem(modoseKagi());
          MODOSE_KAKETA = true;
        } catch (e) {
          MODOSE_KAKETA = false; // 覚えられない 端末＝この 画面の 間だけ（覚えを 正に しない）
        }
      }
      // 入金の 新しさ：この タブが 読んだ 時刻と、その 鍵を この タブで 書き換えた 時刻の 新しい 方
      var PAY_YONDA = 0;
      var PAY_KOSHIN = {};
      function payKaita(key) {
        PAY_KOSHIN[key] = Date.now();
      }
      // 会社名の 付け替え：帯の 行の 会社名も 変える（端末の 覚えが 読めれば それを 正に）
      function modoseNaWoKaeru(oldName, newName) {
        var y = modoseYomu();
        var m = y !== undefined && MODOSE_KAKETA ? y : MODOSE;
        if (!m || !m.dame) return;
        var kaeta = false;
        var ima = new Date().toISOString();
        m.dame.forEach(function (x) {
          if (x.co === oldName) {
            x.co = newName;
            x.kaeta = ima; // 付け替えた 時刻＝これより 前に 入金を 読んだ タブは 判じない（x.at は 取り消せなかった 時刻の まま）
            kaeta = true;
          }
        });
        if (!kaeta) return;
        MODOSE = m;
        modoseKaku();
      }
      function modoseTojiru() {
        MODOSE = null;
        modoseKaku();
        renderModose();
      }
      // ★足す★（2回目に 戻せなかった 時に 1回目の まだ 直していない 行を 消さない・対立役）。
      //   同じ 月×会社は 最初の 前の 状態を 残す（2回目の 前の 状態は「全入金」の 後の 物）。
      //   覚えるのは 額・入金日・メモの 有無・起きた 日時 だけ（メモの 本文・倉庫の id は 覚えない・対立役）。
      //   読めない かどうかは 覚えない＝描く 時に 引き直す（覚えると 開き直して 読めた 後も「読めていません」と 出続けた）
      function modoseNakattaMado(zen, dame) {
        // ★足す 前に 端末の 覚えを 読み直す★（別の タブが 足した 行・閉じた 帯を 古い 一覧で 上書きしない・対立役）
        var y = modoseYomu();
        var mae = (y !== undefined && MODOSE_KAKETA ? y : MODOSE) || { dame: [] };
        var aru = {};
        mae.dame.forEach(function (x) {
          aru[x.month + " " + x.co] = 1;
        });
        var ima = new Date().toISOString();
        dame.forEach(function (x) {
          if (aru[x.month + " " + x.co]) return;
          aru[x.month + " " + x.co] = 1;
          mae.dame.push({
            month: x.month,
            co: x.co,
            at: ima,
            snap: x.snap
              ? { paid: x.snap.paid, paidDate: x.snap.paidDate || "", memo: !!x.snap.note }
              : null,
          });
        });
        MODOSE = { dame: mae.dame };
        modoseKaku();
        renderModose();
      }
      // 前の 状態に 直った 行は 消す（直し終えても「直して」と 言い続けない・古い 額で 上書きさせない）
      function modoseNaotta(x) {
        var key = payKeyFor(x.month, x.co);
        var shinsen = Math.max(PAY_YONDA, PAY_KOSHIN[key] || 0);
        var t = Date.parse(x.at);
        var tk = x.kaeta ? Date.parse(x.kaeta) : NaN; // 会社名を 付け替えた 時刻（在れば 遅い 方で 判じる）
        if (isFinite(t) && isFinite(tk) && tk > t) t = tk;
        if (!isFinite(t) || t > shinsen) return false; // 日時が 読めない・この タブの 入金が その 行より 古い＝判じない
        var r = PAYMENTS[key];
        // 前が 記録なし＝記録が 消えたか 額が 0（未入金(0) で 保存した 形）なら 直った
        if (!x.snap) return !r || Number(r.paid) === 0;
        return (
          !!r &&
          String(r.paid) === String(x.snap.paid) &&
          String(r.paidDate || "") === String(x.snap.paidDate || "")
        );
      }
      function renderModose() {
        var body = document.getElementById("payBody");
        if (!body) return;
        var y = modoseYomu(); // 描く 度に 端末の 覚えを 正に する（別の タブの 足し・閉じるに 合わせる）
        if (y !== undefined && MODOSE_KAKETA) MODOSE = y; // 書けない 端末では この 画面の 一覧を 使う
        if (MODOSE && !YOMENAI.payments) {
          var nokori = MODOSE.dame.filter(function (x) {
            return !modoseNaotta(x);
          });
          if (nokori.length !== MODOSE.dame.length) {
            MODOSE = nokori.length ? { dame: nokori } : null;
            modoseKaku();
          }
        }
        var el = document.getElementById("payModose");
        if (!MODOSE) {
          if (el) el.remove();
          return;
        }
        if (!el) {
          el = document.createElement("div");
          el.id = "payModose";
          el.className = "pay-modose";
          body.parentNode.insertBefore(el, body);
        }
        var nen = function (m) {
          var p = String(m).split("-");
          return Number(p[0]) + "年" + Number(p[1]) + "月";
        };
        var gaku = function (v) {
          // 空・null・数で ない＝「額が 読めない」（¥0 と 言わない）
          return v == null || v === "" || !isFinite(Number(v)) ? "額が 読めない" : yen(Number(v));
        };
        var hi = function (iso) {
          var t = Date.parse(iso);
          if (!isFinite(t)) return "";
          var d = new Date(t);
          return (
            d.getMonth() +
            1 +
            "/" +
            d.getDate() +
            " " +
            d.getHours() +
            ":" +
            ("0" + d.getMinutes()).slice(-2)
          );
        };
        var gyou = MODOSE.dame
          .map(function (x) {
            var mae = !x.snap
              ? "前は 記録なし（未入金に 戻す）"
              : "前は " +
                gaku(x.snap.paid) +
                (x.snap.paidDate ? "・入金日 " + x.snap.paidDate : "・入金日 なし") +
                (x.snap.memo ? "・メモ あり" : "");
            return (
              "<li>" +
              esc(nen(x.month) + " " + x.co) +
              "：" +
              esc(mae) +
              (hi(x.at)
                ? '<span style="color:#888;">（' + esc(hi(x.at)) + " に取り消せなかった）</span>"
                : "") +
              "</li>"
            );
          })
          .join("");
        var yomenai = yomenaiNo(["payments"]).length > 0;
        el.innerHTML =
          '<div class="pay-modose-hd"><b>' +
          esc(
            "取り消せなかった入金 " + MODOSE.dame.length + "件（取り消した時は「全入金」のまま）"
          ) +
          '</b><button type="button" class="btn btn-ghost btn-sm" onclick="modoseTojiru();">閉じる</button></div>' +
          '<ul style="max-height:40vh;overflow:auto;margin:6px 0;padding-left:18px;">' +
          gyou +
          "</ul><div>" +
          esc(
            (yomenai
              ? "入金を読めていません。画面を開き直して確かめてください（開き直しても この一覧は残ります）。"
              : "下の一覧で 1件ずつ 前の額に直してください（前の額に直った行は ここから消えます）。") +
              "月や状態で絞り込んでいる時は「全期間」に戻すと出ます。"
          ) +
          "</div>";
      }
      // 開いて いる 入金の 窓（入金が 読める／読めないが 変わったら 描き直す）
      var PAY_EDIT_AKI = null;
      function openPayEdit(month, co) {
        var iv = seikyuList(month, { kieta: true }).filter(function (x) {
          return x.company === co;
        })[0];
        if (!iv) return;
        PAY_EDIT_AKI = { month: month, co: co, fumei: nyukinFumei() };
        if (PAY_EDIT_AKI.fumei) {
          // ★入金を 読めない 時の 窓＝額・速押し・入金日・メモ・保存を 出さない★（空や 古い 記録で 描くと「0円」「メモ無し」に 見える）
          var _fp = month.split("-");
          document.getElementById("modalTitle").textContent = "入金を記録";
          document.getElementById("modalBody").innerHTML =
            // 「確認」は 残す（繰越の 無い 会社は 入金が 取れなくても 紙を 見られる＝司さん 10-08・繰越の 会社は 中で 止まる）
            '<div class="pay-head-row"><div class="pay-co" style="font-size:15px;">' +
            esc(co) +
            "</div>" +
            '<button class="btn btn-ghost btn-sm pay-kakunin" ' +
            "onclick=\"previewInvoiceFromPay(this,'" +
            esc(month) +
            "','" +
            esc(co).replace(/'/g, "&#39;") +
            "')\">確認</button>" +
            "</div>" +
            '<div class="pay-sub" style="margin-bottom:12px;">' +
            Number(_fp[0]) +
            "年" +
            Number(_fp[1]) +
            "月・明細" +
            iv.count +
            // ★繰越の 会社は「今月分」★（読める 時の 窓と 同じ・今回ご請求額は 入金が 要る＝出せない）
            (MASTER[co] && MASTER[co].carryover ? "件　今月分 " : "件　請求額 ") +
            yen(iv.total) +
            "</div>" +
            // ★繰越の 会社は 読める 時と 同じ 場所（#payAteNote）で「今回ご請求額は 出せません」と 言う★（額は 言わない）
            (MASTER[co] && MASTER[co].carryover
              ? '<div class="pay-sub" id="payAteNote" style="margin:-6px 0 10px;color:#555555;">' +
                "繰越の会社：この月の請求書の 今回ご請求額は 入金を 読めないので 出せません（画面を 開き直してください）</div>"
              : "") +
            '<div class="yomenai-obi" id="payEditFumei" style="padding:10px 0;color:#b42318;font-weight:700;font-size:13px">' +
            esc(
              "通信が 途切れて 入金 を 取って来られませんでした。入金の額・入金日・メモは 出せず、記録も できません（打ちかけの額も 残せません）。画面を 開き直してください。"
            ) +
            "</div>";
          openModal();
          return;
        }
        var rec = payRecord(month, co);
        var _kieta = !!iv.kieta;
        // ★繰越の 会社＝この 月の 紙の 今回ご請求額（紙と 同じ エンジン 1本）★
        var _crPay = _carryFor(co, month);
        var _seikyuGakuOf = MeisaiEngine.ueNoGaku(iv.total, _crPay);
        var _zenGaku = _kieta ? 0 : zenNyukinGaku(iv); // 全入金で 記録する 額（行の ボタンと 同じ 1本）
        var p = month.split("-");
        document.getElementById("modalTitle").textContent = "入金を記録";
        document.getElementById("modalBody").innerHTML =
          // ★★「確認」★★ 司さん（2026-10-01）「赤丸の所に確認ボタンを作って
          //   押したらPDFで請求書が見れるようにしろ」
          //   ・場所は 会社名の ★右★（親指で 押しやすい側）
          //   ・★見るだけ★なので 請求番号を ★新しく 発行しない★
          //     （issueInvoiceNo は 未発行なら 倉庫に 書くので、
          //      そのまま使うと ★覚く たびに 番号が 残る★）
          '<div class="pay-head-row">' +
          '<div class="pay-co" style="font-size:15px;">' +
          esc(co) +
          "</div>" +
          '<button class="btn btn-ghost btn-sm pay-kakunin" ' +
          "onclick=\"previewInvoiceFromPay(this,'" +
          esc(month) +
          "','" +
          esc(co).replace(/'/g, "&#39;") +
          "')\">確認</button>" +
          "</div>" +
          '<div class="pay-sub" style="margin-bottom:12px;">' +
          Number(p[0]) +
          "年" +
          Number(p[1]) +
          "月・明細" +
          iv.count +
          // ★繰越の 会社は「今月分」★（請求書の 額＝今回ご請求額 は 下の 説明に 出す＝額を 2つ「請求額」と 書かない・2026-11-02）
          (MASTER[co] && MASTER[co].carryover ? "件　今月分 " : "件　請求額 ") +
          yen(iv.total) +
          "</div>" +
          /* ★★繰越を 使う 会社＝一覧は 古い 月から 当てた 額で 数える★★ 2026-10-02 夜（対立役）
                  この窓の 入金額は ★その月の 記録★（直す 物）。前は 当てて 入金済の 月でも
                  記録 0 と「全額」ボタンを 出し、★二重に 記録しやすい★ 形だった。
                  ⇒ 当てた 額と 記録を 並べて 見せ、ボタンは「残りを 足す」に する。 */
          /* ★★2026-11-02 司さん「請求書の 月の 行に 記録」★★ 紙は その 月への 入金を 載せない（次の 月の 紙に 載る）。
                  別の 月の 行に 記録すると その 月の 紙が 二重に 請求する ⇒ この 窓で「この 請求書への 入金」と はっきり 書く。 */
          (MASTER[co] && MASTER[co].carryover
            ? '<div class="pay-sub" id="payAteNote" style="margin:-6px 0 10px;color:#555555;">' +
              // ★入金を 読めない 時は 額を 書かない★ 2026-11-02（注C・対立役 注1）＝今月分を「今回ご請求額」と 書くと 嘘
              // ★分かれは プレビューの 門・発行の 門と 同じ YOMENAI.payments で 見る★（本番前の 対立役 注1）
              //   エンジンの 理由の 字で 見ると、言い回しを 変えた 日に 黙って 外れる
              (YOMENAI.payments
                ? "繰越の会社：この月の請求書の 今回ご請求額は 入金を 読めないので 出せません（画面を 開き直してください）"
                : "繰越の会社：この月の請求書は 今回ご請求額 " +
                  MeisaiEngine.sankakuYen(_seikyuGakuOf)) +
              (_crPay && _crPay.seikyuGaku != null
                ? "（前の月までの残り " +
                  MeisaiEngine.sankakuYen(_crPay.kurikoshi) +
                  "＋この月 " +
                  yen(_crPay.konkai) +
                  "）"
                : "") +
              "。この請求書への入金を この行に記録します（前の月の請求書への入金は その月の行へ）。紙のご入金額は 入金日の月で数えます。" +
              "一覧の入金済／未入金は 記録を古い月から当てて数えています（この月は " +
              yen(iv.paid) +
              " 入金済・この月の行の記録 " +
              yen(iv.paidKiroku) +
              "）</div>"
            : "") +
          '<div class="frow"><div class="flabel">入金額（税込）</div>' +
          '<input class="finput fnum" inputmode="numeric" ' +
          NOFILL +
          ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\')" id="pay_amt" value="' +
          (Number(rec.paid) || 0) +
          '"></div>' +
          (_kieta
            ? '<div class="pay-sub" id="payKietaNote" style="margin:-6px 0 10px;color:#555555;">' +
              "この月の明細は 0件です（請求 ¥0）。記録した入金 " +
              yen(Number(rec.paid) || 0) +
              " は そのまま 残っています。</div>"
            : MASTER[co] && MASTER[co].carryover
              ? '<div class="pay-quick">' +
                (_zenGaku > (Number(rec.paid) || 0)
                  ? '<button class="btn btn-ghost btn-sm" id="payNokori" onclick="payFill(' +
                    _zenGaku +
                    ')">全入金（記録 ' +
                    yen(_zenGaku) +
                    "）</button>"
                  : "") +
                '<button class="btn btn-ghost btn-sm" onclick="payFill(0)">未入金(0)</button></div>'
              : '<div class="pay-quick"><button class="btn btn-ghost btn-sm" onclick="payFill(' +
                iv.total +
                ')">全額（' +
                yen(iv.total) +
                ")</button>" +
                // ★残額（請求−入金済）・半額のクイック。既存 payFill を再利用。
                (function () {
                  var rem = iv.total - (Number(rec.paid) || 0);
                  var half = Math.round(iv.total / 2);
                  var h = "";
                  if (rem > 0 && rem !== iv.total)
                    h +=
                      '<button class="btn btn-ghost btn-sm" onclick="payFill(' +
                      rem +
                      ')">残額（' +
                      yen(rem) +
                      "）</button>";
                  h +=
                    '<button class="btn btn-ghost btn-sm" onclick="payFill(' +
                    half +
                    ')">半額（' +
                    yen(half) +
                    "）</button>";
                  return h;
                })() +
                '<button class="btn btn-ghost btn-sm" onclick="payFill(0)">未入金(0)</button></div>') +
          /* ★繰越の 会社＝入金日の 欄は「今回の 入金日」（空で 出す）＋ これまでの 回を 並べる★ 2026-11-02（対立役 止3）
                  前は 欄に 前の 入金日が 入った まま＝額を 増やして 保存すると 増えた 分に 前の 日が 付き、紙の 月が ずれた */
          (MASTER[co] && MASTER[co].carryover
            ? (function () {
                var kai = payKaiGyou(month, co);
                return (
                  (kai
                    ? '<div class="pay-sub" id="payKai" style="margin:-6px 0 10px;color:#555555;">これまでの入金：' +
                      esc(kai) +
                      "</div>"
                    : "") +
                  '<div class="frow"><div class="flabel">今回の入金日（空なら今日）</div>' +
                  '<input class="finput" type="date" id="pay_date" value=""></div>' +
                  '<div class="pay-sub" style="margin:-6px 0 10px;color:#555555;">' +
                  "額を増やした分は この日の入金として 紙の その月に数えます。額を減らすと 新しい入金から減らします。日だけ打つと 最後の入金の日を直します。</div>"
                );
              })()
            : '<div class="frow"><div class="flabel">入金日</div>' +
              '<input class="finput" type="date" id="pay_date" value="' +
              esc(rec.paidDate || "") +
              '"></div>') +
          '<div class="frow"><div class="flabel">メモ</div>' +
          '<input class="finput" ' +
          NOFILL +
          ' id="pay_note" value="' +
          esc(rec.note || "") +
          '"></div>' +
          '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="savePay(\'' +
          esc(month) +
          "','" +
          esc(co).replace(/'/g, "\\'") +
          "'," +
          iv.total +
          ')">保存</button></div>' +
          naoshiIchiranHtml(naoshiNyukinBetsu()[month + "::" + co]);
        openModal();
      }
