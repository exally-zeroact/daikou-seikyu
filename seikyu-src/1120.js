      // 取り消しボタン付きトースト（通常 toast とは別要素・別タイマー＝監査指摘）。
      // 前の 取り消しを 閉じる 2026-10-16（対立役：取り消しの 知らせが 出ている 間に 別の 保存を し、その後
      //   取り消しを 押すと、たった今 入れた 記録が 消す 前の 記録で 上書きされた）
      function toastUndoKesu() {
        var t = document.getElementById("toastUndo");
        if (!t) return;
        clearTimeout(t._tm);
        t.classList.remove("show");
        t.innerHTML = "";
      }
      function toastUndo(msg, onUndo) {
        sakkiNiOku(msg);
        if (KAGI_KIRE) {
          kireTasu(msg); // 取り消すは 出さない（押しても 倉庫へ 届かない）
          return;
        }
        var t = document.getElementById("toastUndo");
        if (!t) {
          t = document.createElement("div");
          t.id = "toastUndo";
          t.className = "toast-undo";
          document.body.appendChild(t);
        }
        t.innerHTML = "";
        var span = document.createElement("span");
        span.textContent = msg;
        var btn = document.createElement("button");
        btn.className = "toast-undo-btn";
        btn.type = "button";
        btn.textContent = "取り消す";
        btn.onclick = function () {
          toastUndoKesu();
          onUndo();
        };
        t.appendChild(span);
        t.appendChild(btn);
        t.classList.add("show");
        clearTimeout(t._tm);
        t._tm = setTimeout(toastUndoKesu, 5000); // 中身ごと 消す（見えない ボタンが Tab で 押せた・対立役）
      }

      /* ===================================================================
      自社情報（発行者・振込先・判子）＝請求書フォーマット定義の残りピース
      アカウント単位で保存。エンジンの issuer 形へ変換して請求書に渡す。
      =================================================================== */
      /* ===== A 請求書を保存する（発行した瞬間に写しを残す）===========================
            ★なぜ★ 本番で数えたら 控えを置く棚が1つも無く、PDFは端末に落とすだけだった。
              請求書は毎回 明細から計算し直すので、★明細を直すと過去に渡した紙と食い違う★。
              実測: 12,000→9,000 に直して同じ月を出すと 請求額も 9,000 に変わった。
            ★2つの棚★
              invoices   … 発行の控え（出すたび1行 積む）
              invoice_no … 番号の台帳（月×会社に1つ）★一度決めた番号は動かさない★
            ★番号は 重ならない★（2026-10-08 作り直し・下の issueInvoiceNo）
              台帳に 無い 間は 番号を 出さない（紙を 作る 時に 台帳へ 書いて から 使う・見るだけは「未発行」）
         ============================================================================= */
      var INVOICE_NO = {}; // "YYYY-MM|会社名" -> "2026-05-03"（倉庫の 台帳に 書けた 番号 だけ）
      var INVOICES = []; // 発行の控え（番号の 空きの 数え だけ。繰越は 2026-11-01 から 今の 明細・控えの 有無で 分けない）
      var INVOICE_NO_UID = {}; // 番号の 持ち主（明細が 0件の 月を 出す 時だけ 使う）
      function invNoKey(month, co) {
        return month + "|" + co;
      }
      /* ★★請求書番号は 重ならない★★ 2026-10-08（司さん「重なったらいかんやろ、そもそもなんの番号ど」）
            番号＝紙の 右上の「No. 2026-08-03」（その 月の 何通目か）
            前は「会社の 並びの 何番目か」の 計算で、並びが 動くと 別の 会社に 出した 番号と 重なった
            （本番 実測：控えで 仮標工業 7月 と ミサル 7月 が 同じ 2026-07-07）
            ・台帳（invoice_no）に 在る 番号は 動かさない
            ・無い 時は 紙を 作る 前に その 月で 空いている 一番 小さい 番号を ★倉庫の 台帳に 書いてから★ 使う
              空きは 台帳＋控え（invoices）の 両方で 数える。倉庫は (user_id, invoice_no) が 一意＝2台 同時でも 重ならない
            ・書けなければ 紙は 作らない（番号の 無い・重なる 紙を 出さない）
            ・見るだけの 所（画面・確認・見本）は 台帳に 在る 番号 だけ 出す（まだ 出していない 番号は 出さない） */
      function invoiceNoFrozen(month, co) {
        return INVOICE_NO[invNoKey(month, co)] || "";
      }
      // ★見るだけの 紙（画面・確認・見本）の 番号★：出した 番号 か「未発行」（空だと 番号の 無い 紙に 見える・対立役）
      function invoiceNoMiru(month, co) {
        return invoiceNoFrozen(month, co) || "未発行";
      }
      function bangouNiketa(n) {
        return n < 10 ? "0" + n : String(n);
      }
      // その 月で 使われている 番号（台帳＋控え）
      function tsukattaBangou(month) {
        var used = {};
        var hd = month + "-";
        Object.keys(INVOICE_NO).forEach(function (k) {
          var no = INVOICE_NO[k];
          if (String(no).indexOf(hd) === 0) used[no] = k;
        });
        (INVOICES || []).forEach(function (iv) {
          var no = iv && iv.invoice_no;
          if (no && String(no).indexOf(hd) === 0 && !used[no])
            used[no] = invNoKey(iv.month, iv.company);
        });
        return used;
      }
      function akiBangou(month, used) {
        for (var n = 1; n < 10000; n++) {
          var no = month + "-" + bangouNiketa(n);
          if (!used[no]) return no;
        }
        throw new Error("請求番号の 空きが ありません");
      }
      // 倉庫の 台帳を その 月 だけ 読み直す（他の 端末が 出した 番号を 拾う）
      async function daichoYominaoshi(month) {
        var r = await SB.from("invoice_no")
          .select("month, company, invoice_no")
          .eq("month", month)
          .order("company");
        if (r.error) throw new Error("請求番号の 台帳を 読めません");
        Object.keys(INVOICE_NO).forEach(function (k) {
          if (k.indexOf(month + "|") === 0) delete INVOICE_NO[k];
        });
        (r.data || []).forEach(function (x) {
          INVOICE_NO[invNoKey(x.month, x.company)] = x.invoice_no;
        });
      }
      /* ★番号を決めるのは この1本だけ★
            決める所が2つに割れていると、片方を壊しても もう片方が庇って
            ★試験が赤にならない★（実際にそう書いてしまい、わざと壊しても緑のままだった）。
            ★倉庫の 台帳に 書けた 番号 だけを 返す★。書けなければ 投げる（呼ぶ 側は 紙を 作らない） */
      async function issueInvoiceNo(month, co) {
        // ★台帳・控えを 読めていない 時は 番号を 決めない★（空きを 数え 間違える）
        if (YOMENAI.invoice_no || YOMENAI.invoices)
          throw new Error("請求番号の台帳を読めていません");
        var k = invNoKey(month, co);
        if (INVOICE_NO[k]) return INVOICE_NO[k]; // ★一度 決めた番号は動かさない★
        if (!SB || !CURRENT_ACCOUNT)
          throw new Error("請求番号を 控えられません（ログインしていません）");
        await daichoYominaoshi(month);
        if (INVOICE_NO[k]) return INVOICE_NO[k];
        var used = tsukattaBangou(month);
        // 控えに この 会社の この 月の 番号が 在り、他で 使われていなければ それを 台帳へ（控えと 揃える）
        var hikae = "";
        (INVOICES || []).forEach(function (iv) {
          if (iv && iv.month === month && iv.company === co && iv.invoice_no) hikae = iv.invoice_no;
        });
        var kouho = hikae && used[hikae] === k ? hikae : "";
        for (var tabi = 0; tabi < 20; tabi++) {
          var no = kouho || akiBangou(month, used);
          kouho = "";
          var r = await SB.from("invoice_no").insert({
            user_id: CURRENT_ACCOUNT,
            month: month,
            company: co,
            invoice_no: no,
          });
          if (!r || !r.error) {
            INVOICE_NO[k] = no;
            return no;
          }
          if (r.error.code !== "23505") throw new Error("請求番号を 控えられません");
          // ぶつかった＝他の 端末が 先に 書いた。読み直して、同じ 会社なら その 番号・違えば 次の 空き
          await daichoYominaoshi(month);
          if (INVOICE_NO[k]) return INVOICE_NO[k];
          used = tsukattaBangou(month);
          used[no] = used[no] || "ぶつかった";
        }
        throw new Error("請求番号を 決められません");
      }
      function bangouNgBun(e) {
        return (
          "請求番号を 控えられませんでした（" +
          ((e && e.message) || "通信") +
          "）。番号の 重なる 紙を 出さない ため、請求書は 作っていません。通信を 確かめて もう一度 押してください。"
        );
      }
      /* ★繰越の材料を集める★（2026-08-12）
            前回繰越は ★手打ちにしない★：今の明細(DB) と 入金(PAYMENTS) から出す。
            ・前の 月（明細が 在る 月 全部）… ★その月の 今の 明細の 合計★
                （入金の 画面と 同じ invoiceTotals・今の 内税／外税）
                2026-11-01 司さん「修正したら反映されるんが普通やろが」「入力したら反映されるんが当たり前」
                ＝前は 最後に PDF を 作った 時の 控えの total を 使い、月が 変わってから 前の 月を
                  直しても 次の 紙の 繰越は 古い 額の まま だった（入金の 画面とも 額が 合わなかった）
            ・控え（INVOICES）が 在るかで 分けない 2026-11-01 夜（司さん「基本PDFだけやろが」「読めませんってふざけすぎとるやろが」）
                ＝前は 控えの 無い 月（全社まとめで 作った 月・控えを 書けなかった 月）を null にして
                  紙に「前回の請求額が読めません」と 刷り、その 会社は ずっと 繰越が 出なかった
            ・入金   … PAYMENTS に行が無い月は 0（入金なし）。未確認は null で表す */
      /* ★★入金は 入金日の 月で 数える★★ 2026-11-02（司さん「そんなことにならんようにしろ」）
              どの 月の 行に 記録したかは 見ない＝「受け取った 月の 行」に 入れた 前からの 記録でも 二重に 請求しない。
              入金日が 空なら 記録を 作った 日（created_at）、それも 無ければ 記録した 行の 月。 */
      function nyukinNoTsuki(rec, gyouNoTsuki) {
        var d = String((rec && rec.paidDate) || "");
        if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
        var c = String((rec && rec.createdAt) || "");
        if (/^\d{4}-\d{2}/.test(c)) return c.slice(0, 7);
        return gyouNoTsuki;
      }
      /* ★★入金の 回（entries）★★ 本体は lib/nyukin-kai.js へ 移した 2026-11-03（外から読む口と 同じ 物を 使う）。
              決まり（正は paid・足りない 分は paid_date の 回・多い 分は 新しい 回から 削る 等）は lib の 注に ある。 */
      function hiDake(s) {
        return NyukinKai.hiDake(s);
      }
      function kaiTsukuru(e, gaku, hi) {
        return NyukinKai.kaiTsukuru(e, gaku, hi);
      }
      function entriesKezuru(out, n) {
        return NyukinKai.entriesKezuru(out, n);
      }
      function entriesOf(rec, gyouNoTsuki) {
        return NyukinKai.entriesOf(rec, gyouNoTsuki);
      }
      function entriesAtarashii(mae, newPaid, hi, hiKaeta) {
        return NyukinKai.entriesAtarashii(mae, newPaid, hi, hiKaeta);
      }
      /* =====================================================================
            ★★入金の 消し込み（銀行の 入出金明細 CSV → 候補 → 人が 押す）★★ 2026-11-03
            司さんの決め（11-03）：★人が「記録する」を 押した 行だけ 記録★（自動では 記録しない・全部記録の ボタンは 作らない）
              ・手数料は 決め打ちしない（1〜1,100円の 不足だけ「差 ¥実額（振込手数料かも）」）
              ・会社ごとに 先方持ち（既定・民法485条）／こちら持ち（差を 手数料として 消す）
              ・紙の ご入金額＝消した 額（入った 額＋こちら持ちの 手数料）・Excel と 回の 字は 内訳を 分ける（弥生の 形）
            ★書く 直前に その 会社の 入金の 行を 全部 読み直し、この 画面の 控えと 違えば 書かずに 止める★
              （別の 端末が 別の 月へ 同じ 入金を 記録した 時の 二重・対立役 v2 止1／v3 止1・注1〜3／v4 注1・2）
              ★競り合いを 止めるのは この 道（と その 取り消し）だけ★＝窓の 保存・全入金・前からの 取り消しは 今まで 通り
            純粋な 所（CSV・候補・二重の 見分け）は lib/keshikomi.js（vitest＝tests/keshikomi.test.js）
            ===================================================================== */
      var KS = null;
      var KS_RETSU = "id,user_id,month,company,paid,paid_date,memo,entries,created_at,deleted_at";
      function ksOpen() {
        if (yomenaiTomeru(["payments"], "銀行の明細の読み込み")) return;
        KS = null;
        document.getElementById("modalTitle").textContent = "銀行の明細（CSV）から入金を記録";
        document.getElementById("modalBody").innerHTML =
          '<div class="pay-sub" style="margin:0 0 10px;color:#555555;">' +
          "ネットバンキングの「入出金明細」を CSV で保存して選んでください。合いそうな請求を候補に出します。" +
          "★記録するのは「記録する」を押した行だけです★。</div>" +
          '<input type="file" id="ksFile" accept=".csv,text/csv,text/plain" onchange="ksYomu(this.files[0])">' +
          '<div id="ksBody"></div>';
        openModal();
      }
      async function ksYomu(file) {
        if (!file) return;
        var buf;
        try {
          buf = await file.arrayBuffer();
        } catch (e) {
          toast("ファイルを読めませんでした");
          return;
        }
        var m = Keshikomi.mojiYomu(buf);
        var rows = Keshikomi.csvYomu(m.text);
        var mi = Keshikomi.midashiSagasu(rows);
        KS = {
          name: file.name,
          code: m.code,
          rows: rows,
          midashi: mi.gyou,
          retsu: mi.retsu,
          kiroku: {}, // CSV の 行 i → この 窓で 記録した 額（途中で 止まった 時に 残りだけ 押せる）
          kaita: {}, // CSV の 行 i → 記録した 月の 字
          undo: {}, // CSV の 行 i → { co, undo }（窓の 中の「取り消す」・知らせは 窓の 下に 隠れる）
          oshiteru: false,
        };
        ksKaku();
      }
