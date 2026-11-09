      async function loadAllCloud() {
        YOMENAI = { issuer: true, invoices: true, invoice_no: true, payments: true };
        DB = [];
        naoshiKara(); // 直しの 履歴（⑦）も 前の 人の 物を 残さない
        MASTER = {};
        PAYMENTS = {};
        ISSUER_SETTINGS = {};
        var ok = true;
        var c = await fetchAllQ(function (a, b) {
          return (
            SB.from("companies")
              .select("*", { count: "exact" })
              .is("deleted_at", null)
              // ★一意に 並べてから 切る（並びが 無いと 境目で 行が 飛ぶ・重なる）★
              //   会社は 作った 順＝同じ 名前が 2行 在っても 前と 同じく 後から 作った 方が MASTER で 勝つ（対立役 注3・11-02 本番 重なり 0組）
              .order("created_at")
              .order("id")
              .range(a, b)
          );
        });
        if (c.error) {
          cloudErr("会社読込", c.error);
          ok = false;
        } else {
          c.data.forEach(function (r) {
            var cf = r.config || {};
            MASTER[r.name] = {
              _dbid: r.id,
              account_id: r.user_id,
              items: r.items || [],
              widths: cf.widths || {},
              aligns: cf.aligns || {},
              lead: cf.lead || "",
              tableTitle: cf.tableTitle || "",
              noteSummary: !!cf.noteSummary,
              noteGroups: cf.noteGroups || [],
              labels: cf.labels || {},
              // ★繰越（既定は使わない）／消費税の扱い（既定は内税）★
              carryover: !!cf.carryover,
              taxMode: cf.taxMode === "外税" ? "外税" : "内税",
              // ★入金の 消し込み★（読まないと 次の saveMaster で 消える・対立役 v1 注2）
              furikomiMeigi: Array.isArray(cf.furikomiMeigi) ? cf.furikomiMeigi.slice() : [],
              tesuryoFutan: cf.tesuryoFutan === "kochira" ? "kochira" : "",
              // ★会社毎テンプレ（未設定=null=全体設定を使う＝既定）。
              pdfDesign: cf.pdfDesign || null,
              elegantVariant: cf.elegantVariant || null,
              classicVariant: cf.classicVariant || null,
            };
          });
        }
        var m = await kuraMeisaiYomu();
        if (m.error) {
          cloudErr("明細読込", m.error);
          ok = false;
        } else DB = m.db;
        await yomuKurumaFuda();
        var p = await kuraPaymentsYomu();
        if (p.error) cloudErr("入金読込", p.error);
        else {
          YOMENAI.payments = false;
          PAY_YONDA = p.hajime; // 入金を 読み始めた 時刻（帯の「直った」判じに 使う・読み終えた 時刻に しない）
          PAYMENTS = p.map;
        }
        var i = await SB.from("issuer")
          .select("config")
          .eq("user_id", CURRENT_ACCOUNT)
          .maybeSingle();
        naoshiYomu(); // ★直しの 履歴（⑦）＝待たない・中で 全部 受ける（投げない）★
        // ★発行の控えを読む（番号の 空きの 数え・2026-11-01 から 繰越には 使わない＝今の 明細で 出す）★
        INVOICES = [];
        try {
          // ★1000行で 黙って 切れない 様に 全部 読む★（対立役 B）
          var ivs = await fetchAllQ(function (a, b) {
            return SB.from("invoices")
              .select("id, month, company, invoice_no, total, issued_at, design_json", {
                count: "exact",
              })
              .order("issued_at")
              .order("company")
              .order("month")
              .order("id")
              .range(a, b);
          });
          if (ivs.error) cloudErr("請求書の控え読込", ivs.error);
          else {
            // ★全社まとめで 残した 写し（design_json.zensha）は 繰越の 材料に しない★ 2026-10-14（対立役）
            //   全社まとめは 10-14 より 前も 11-01 から 後も 写しを 残さない＝繰越の 材料は 前と 同じ 集まり。
            //   10-14〜11-01 に 警告の 材料として 残した 古い 写しが 倉庫に 在る ので 外し続ける
            INVOICES = (ivs.data || []).filter(function (x) {
              return !(x && x.design_json && x.design_json.zensha === true);
            });
            YOMENAI.invoices = false;
          }
        } catch (e) {
          cloudErr("請求書の控え読込", e);
        }
        // ★番号の台帳を読む（凍結した番号はここから出す）★
        INVOICE_NO = {};
        try {
          // ★1000行で 黙って 切れない 様に 全部 読む★（切れると 台帳に 無い 月の 番号を 作り直して 上書きした・対立役 B）
          var no = await fetchAllQ(
            function (a, b) {
              return SB.from("invoice_no")
                .select("month, company, invoice_no, user_id", { count: "exact" })
                .order("month")
                .order("company")
                .order("user_id") // ★鍵は (user_id, month, company)＝これで 一意★
                .range(a, b);
            },
            function (x) {
              return x && x.user_id + "\u0001" + x.month + "\u0001" + x.company;
            }
          );
          if (no.error) cloudErr("請求番号の読込", no.error);
          else {
            INVOICE_NO_UID = {};
            (no.data || []).forEach(function (r) {
              INVOICE_NO[invNoKey(r.month, r.company)] = r.invoice_no;
              INVOICE_NO_UID[invNoKey(r.month, r.company)] = r.user_id;
            });
            YOMENAI.invoice_no = false;
          }
        } catch (e) {
          cloudErr("請求番号の読込", e);
        }
        // ★自社情報：行が 無い（新しい 客）は 読めた 扱い・エラーは 読めない★
        if (i && !i.error) YOMENAI.issuer = false;
        else cloudErr("自社情報読込", i && i.error);
        if (!i.error && i.data && i.data.config) ISSUER_SETTINGS[CURRENT_ACCOUNT] = i.data.config;
        if (!ISSUER_SETTINGS[CURRENT_ACCOUNT]) ISSUER_SETTINGS[CURRENT_ACCOUNT] = blankIssuer();
        migrateRegno(ISSUER_SETTINGS[CURRENT_ACCOUNT]); // ★登録番号を専用の欄へ（1度だけ・紙は変わらない）★
        return ok;
      }
      /* ===================================================================
      ★★外から読むだけの口（設定）★★ 2026-11-03（司さん 11-02「外へ数を出す口＝読むだけ」）
      会計ソフト・客の AI が 鍵で /api/yomu を 読む（明細・請求・入金・会社・書く道は 無い）。
      ★鍵は 押した 時だけ 作る★（開く だけでは 作らない＝止めても 次に 開いた 時に 生まれない・対立役 v2 注8）
      ★作り直す・止めるは 倉庫の 関数だけ★（kagi_tsukurinaosu／kagi_tomeru・表へ 直に 書く 権限は 取り上げた）
      ★止めたのに「止めました」と 嘘を 言わない★ 止めた 件数が 1 で なければ 失敗を 出す（対立役 v2 注3）
      前の Excel自動連携（開くだけで 鍵を 作る 関数・.iqy・URL の 欄・5シートの xlsx）は 呼び元 0 で 消した（古い xlsx/iqy は api/excel.js が 読む）
      =================================================================== */
      function yomuMieru(id, on) {
        var el = document.getElementById(id);
        if (el) el.style.display = on ? "" : "none";
      }
      function yomuRei(kagi) {
        var k = kagi || "（鍵）";
        var u = location.origin + "/api/yomu";
        return (
          "読むだけの口（ダイコメ請求）\n" +
          "GET " +
          u +
          "?hyo=seikyu&kata=json\n" +
          "見出し Authorization: Bearer " +
          k +
          "\n" +
          "hyo＝meisai（明細）／seikyu（月×会社の請求・今月分は税込）／nyukin（入金を1回1行）／kaisha（会社）\n" +
          "kara=YYYY-MM・made=YYYY-MM で月を絞れる。kata=csv で CSV（UTF-8）。\n" +
          "答えの setsumei に各表の意味。鍵が違う・止めた時は 401。"
        );
      }
      async function renderYomuKuchi() {
        var el = document.getElementById("yomuKagiJotai");
        if (!el) return;
        yomuMieru("yomuKagiMieru", false);
        el.textContent = "鍵を確かめています…";
        var q = await SB.from("export_tokens")
          .select("token, created_at")
          .eq("user_id", CURRENT_ACCOUNT)
          .maybeSingle();
        if (q.error) {
          el.textContent = "鍵が在るかを読めませんでした（通信を確認して、もう一度開いてください）";
          yomuMieru("yomuDasuBtn", false);
          yomuMieru("yomuTomeruBtn", false);
          return;
        }
        var aru = !!(q.data && q.data.token);
        el.textContent = aru
          ? "鍵：あり（" +
            String(q.data.token).slice(0, 4) +
            "…・" +
            String(q.data.created_at || "").slice(0, 10) +
            " に作成）。外から読めます。"
          : "鍵：ありません（外からは読めません）";
        var b = document.getElementById("yomuDasuBtn");
        if (b) b.textContent = aru ? "鍵を作り直す" : "鍵を出す";
        yomuMieru("yomuDasuBtn", true);
        yomuMieru("yomuTomeruBtn", aru);
        var r = document.getElementById("yomuRei");
        if (r) r.value = yomuRei(null);
      }
      async function yomuKagiDasu(btn) {
        var tsukurinaoshi = btn && btn.textContent.indexOf("作り直す") >= 0;
        if (
          tsukurinaoshi &&
          !confirm(
            "鍵を作り直すと、今の鍵はすぐ使えなくなります（今の鍵を入れた会計ソフト・AI・Excel は読めなくなります）。作り直しますか？"
          )
        )
          return;
        if (btn) btn.disabled = true;
        try {
          var r = await SB.rpc("kagi_tsukurinaosu");
          if (r.error || !r.data) {
            toast("鍵を出せませんでした（" + ((r.error && r.error.message) || "答えが空") + "）");
            return;
          }
          await renderYomuKuchi();
          var k = document.getElementById("yomuKagi");
          if (k) k.value = String(r.data);
          var rei = document.getElementById("yomuRei");
          if (rei) rei.value = yomuRei(String(r.data));
          yomuMieru("yomuKagiMieru", true);
          toast(tsukurinaoshi ? "鍵を作り直しました（古い鍵は止まりました）" : "鍵を出しました");
        } finally {
          if (btn) btn.disabled = false;
        }
      }
      async function yomuKagiTomeru(btn) {
        if (
          !confirm("鍵を止めると、外からは読めなくなります（会計ソフト・AI・Excel）。止めますか？")
        )
          return;
        if (btn) btn.disabled = true;
        try {
          var r = await SB.rpc("kagi_tomeru");
          if (r.error || r.data !== 1) {
            toast(
              "鍵を止められませんでした（" +
                ((r.error && r.error.message) || "止めた数 " + r.data) +
                "）。もう一度開いて確かめてください"
            );
            await renderYomuKuchi();
            return;
          }
          await renderYomuKuchi();
          toast("鍵を止めました");
        } finally {
          if (btn) btn.disabled = false;
        }
      }
      function yomuCopy(id) {
        var el = document.getElementById(id);
        if (!el || !el.value) return;
        function done() {
          toast("コピーしました");
        }
        if (navigator.clipboard && navigator.clipboard.writeText)
          navigator.clipboard.writeText(el.value).then(done, function () {
            el.select();
            toast("選んだ字を長押しでコピーしてください");
          });
        else {
          el.select();
          toast("選んだ字を長押しでコピーしてください");
        }
      }

      /* ===================================================================
      Excel連携ファイル(.xlsx)生成 ─ ボタン1個で「4シート入りExcel」を作って落とす。
      SheetJSで静的xlsx（全端末で確実に開ける）。明細/入金/集計/会社の4シート。
      最新化＝もう一度ボタンを押す。PCで自動更新したい人は「上級者向けURL」を使う。
      =================================================================== */
