      // ログイン後の一括読み込み（RLSで自分の行だけ返る）
      // ★★読めなかった 物の 印（最初は 全部 立てて 読めた 物だけ 下ろす）★★ 2026-10-08
      //   司さん「お金の出力は 1人でも 計算できなければ 止めて 警告」・対立役：
      //   入金・自社情報・控え・番号の 台帳は 読めなくても toast だけで 画面が 動き、
      //   既定の 自社情報（振込先・登録番号）で 請求書が 出る／番号を 新しく 作って 台帳を 上書き／入金を 上書き した
      var YOMENAI = { issuer: true, invoices: true, invoice_no: true, payments: true };
      var YOMENAI_NA = {
        issuer: "自社情報",
        invoices: "請求書の控え",
        invoice_no: "請求番号の台帳",
        payments: "入金",
      };
      var YOMENAI_ZEN = ["issuer", "invoices", "invoice_no", "payments"];
      function yomenaiNo(keys) {
        return (keys || YOMENAI_ZEN).filter(function (k) {
          return YOMENAI[k];
        });
      }
      // ★文は 平らに★ 2026-10-08（司さん「読めなかったってそもそも意味が分からん」）
      function yomenaiBun(keys, what) {
        return (
          "通信が 途切れて " +
          keys
            .map(function (k) {
              return YOMENAI_NA[k];
            })
            .join("・") +
          " を 取って来られませんでした。" +
          what +
          " は しません。画面を 開き直してください。"
        );
      }
      // ★請求書に 要る 物★（入金は 入らない＝入金が 取れなくても 請求書は 出す・司さん 10-08）
      var SEIKYU_KEYS = ["issuer", "invoices", "invoice_no"];
      // ★入金が 取れない 時に 止める 会社＝前回繰越を 載せる 会社 だけ★（入金で 繰越を 計算する）
      function kurikoshiTomeru(cos, what) {
        if (!YOMENAI.payments) return false;
        var ng = (cos || []).filter(function (c) {
          return MASTER[c] && MASTER[c].carryover;
        });
        if (!ng.length) return false;
        toast(
          "通信が 途切れて 入金 を 取って来られませんでした。前回繰越を 載せる " +
            ng.join("・") +
            " の " +
            what +
            " は しません。画面を 開き直してください。"
        );
        return true;
      }
      // その 月に 明細の 在る 会社
      function tsukiNoKaisha(month) {
        var seen = {};
        var out = [];
        DB.forEach(function (r) {
          if (r.account_id !== CURRENT_ACCOUNT || !r.会社名 || !inMonth(r.日付, month)) return;
          if (!seen[r.会社名]) {
            seen[r.会社名] = 1;
            out.push(r.会社名);
          }
        });
        return out;
      }
      // ★止める（真＝止めた）★
      function yomenaiTomeru(keys, what) {
        var k = yomenaiNo(keys);
        if (!k.length) return false;
        toast(yomenaiBun(k, what));
        return true;
      }
      // ★手で入れた明細にも「車」を付けられる★ 2026-10-23
      //   出どころ … 事務所で付けた札（public の dk_device_labels：label＝車の名前・sort_order＝並び順）
      //     ＝ダイコメの同期（dk-sync-jobs）が extra.dk_car / dk_car_no に入れる物と同じ札。
      //   ★欄を出さない時★（黙って空の欄を出さない・札を混ぜない）
      //     ・読めない（落ちた・権限が無い）／0件
      //     ・会社が2つ以上 読めた＝どの会社の車か ここでは決められない
      //   ★失敗しても 読み込みは止めない★（車が付けられないだけ＝今まで通り）
      var KURUMA_FUDA = []; // [{label, no}]（並び順）。空＝欄を出さない
      async function yomuKurumaFuda() {
        KURUMA_FUDA = [];
        TANMATSU_NA = {};
        try {
          var r = await SB.from("dk_device_labels").select(
            "company_id, device_id, label, sort_order"
          );
          if (r.error) {
            // 並び順の列が無い倉庫でも 札だけは読む
            r = await SB.from("dk_device_labels").select("company_id, device_id, label");
          }
          if (r.error || !Array.isArray(r.data)) return;
          var kaisha = {};
          var list = [];
          r.data.forEach(function (x) {
            var lb = x && typeof x.label === "string" ? x.label.trim() : "";
            if (!lb) return;
            if (x.device_id != null) TANMATSU_NA[String(x.device_id)] = lb; // 直しの 履歴の「誰」（⑦）
            kaisha[String(x.company_id)] = 1;
            var n = Number(x.sort_order);
            list.push({ label: lb, no: isFinite(n) && n > 0 ? n : null });
          });
          if (Object.keys(kaisha).length !== 1) return; // 0件・会社が2つ以上 ＝出さない
          list.sort(function (a, b) {
            return (a.no || 9999) - (b.no || 9999) || a.label.localeCompare(b.label);
          });
          var seen = {};
          KURUMA_FUDA = list.filter(function (x) {
            if (seen[x.label]) return false;
            seen[x.label] = 1;
            return true;
          });
        } catch (e) {
          KURUMA_FUDA = [];
          TANMATSU_NA = {};
        }
      }
      /* ★直しの 履歴（⑦ 3押し目・2026-11-09）★ 設計＝sekkei_7_gamen_2026-11-09.md v3
           ★表示だけ★＝お金・並び・出す 前の 見張りは 変えない（判じは lib/naoshi-rireki.js）。
           読むのは U と D だけ（I は メーターの 1乗車ごとに 積もる＝読まない）・ログインを 待たせない（await しない）。
           joutai：mada（まだ）／ok／nai（表・部屋が 無い＝本番の 倉庫は 未適用＝黙る）／ng（読めない＝小さく 一言） */
      var TANMATSU_NA = {}; // device_id → 札（yomuKurumaFuda で 作る）
      var NAOSHI = { joutai: "mada", rows: [], meisai: {}, gen: 0 };
      function naoshiKara() {
        NAOSHI.gen += 1; // 走っている 読みの 返りを 捨てる
        NAOSHI.joutai = "mada";
        NAOSHI.rows = [];
        NAOSHI.meisai = {};
      }
      async function naoshiYomu() {
        var NR = window.NaoshiRireki;
        if (!NR) return;
        var gen = (NAOSHI.gen += 1);
        var kekka;
        try {
          if (!SB || typeof SB.schema !== "function") kekka = { joutai: "nai", rows: [] };
          else {
            var r = await fetchAllQ(function (a, b) {
              return SB.schema("daikome")
                .from("dk_naoshi_rireki")
                .select("id,at,tbl,op,pk,dare_shu,dare,kawatta,mae,ato", { count: "exact" })
                .in("tbl", [NR.TBL_MEISAI, NR.TBL_PAY])
                .in("op", ["U", "D"])
                .order("id")
                .range(a, b);
            });
            if (r.error) kekka = { joutai: NR.hyouGaNai(r.error) ? "nai" : "ng", rows: [] };
            else kekka = { joutai: "ok", rows: r.data || [] };
          }
        } catch (e) {
          kekka = { joutai: "ng", rows: [] };
        }
        if (gen !== NAOSHI.gen) return; // 後から 呼んだ 読み・ログアウトが 勝つ
        NAOSHI.joutai = kekka.joutai;
        NAOSHI.rows = kekka.rows;
        NAOSHI.meisai = NR.meisaiBetsu(kekka.rows);
        try {
          var a = document.querySelector(".screen.active");
          if (a && a.id === "scr-list") renderList();
          else if (a && a.id === "scr-payment") renderPayments();
        } catch (e) {}
      }
      function naoshiTadashiNuru() {
        var el = document.getElementById("naoshiTadashi");
        if (!el) return;
        el.classList.toggle("ng", NAOSHI.joutai === "ng");
        el.textContent =
          NAOSHI.joutai === "ok"
            ? "運転手が修正したものは赤になります"
            : NAOSHI.joutai === "ng"
              ? "運転手の直しの印を確かめられませんでした（開き直すと読み直します）"
              : "";
      }
      function naoshiNyukinBetsu() {
        if (NAOSHI.joutai !== "ok" || !window.NaoshiRireki) return {};
        var ima = [];
        Object.keys(PAYMENTS || {}).forEach(function (k) {
          var p = k.split("::");
          var rec = PAYMENTS[k];
          if (p.length === 3 && p[0] === String(CURRENT_ACCOUNT) && rec && rec._dbid != null)
            ima.push({ id: rec._dbid, month: p[1], company: p[2] });
        });
        return NaoshiRireki.nyukinBetsu(NAOSHI.rows, ima);
      }
      function naoshiFudaHtml(list) {
        if (NAOSHI.joutai !== "ok" || !window.NaoshiRireki) return "";
        var n = NaoshiRireki.naoshiKazu(list);
        return n > 0 ? '<span class="naoshi-fuda">直し ' + n + "</span>" : "";
      }
      function naoshiJikoku(at) {
        var d = new Date(at);
        if (!at || isNaN(d.getTime())) return String(at || "");
        var z = function (n) {
          return (n < 10 ? "0" : "") + n;
        };
        return (
          d.getFullYear() +
          "/" +
          z(d.getMonth() + 1) +
          "/" +
          z(d.getDate()) +
          " " +
          z(d.getHours()) +
          ":" +
          z(d.getMinutes())
        );
      }
      function naoshiIchiranHtml(list) {
        if (NAOSHI.joutai !== "ok" || !window.NaoshiRireki || !list || !list.length) return "";
        return (
          '<div class="naoshi-ichiran"><div class="naoshi-midashi">直しの履歴</div>' +
          list
            .map(function (h) {
              return (
                '<div class="naoshi-gyou' +
                (h.dare_shu === "device" ? " aka" : "") +
                '"><div>' +
                esc(naoshiJikoku(h.at)) +
                "・" +
                esc(NaoshiRireki.dareMoji(h, TANMATSU_NA)) +
                "</div>" +
                NaoshiRireki.naiyou(h)
                  .map(function (x) {
                    return (
                      "<div>" +
                      esc(x.nani) +
                      (x.mae || x.ato ? "：" + esc(x.mae) + " → " + esc(x.ato) : "") +
                      "</div>"
                    );
                  })
                  .join("") +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        );
      }
      // 車を付ける／外す（付けるのは dk_car・dk_car_no だけ＝dk_ref・dk_source は入れない
      //   ＝事務所へ金額を戻す道 MeisaiEngine.utils.shouldPushFare に乗せない）
      function kurumaWoTsukeru(row, idx) {
        var f = KURUMA_FUDA[idx];
        delete row.dk_car;
        delete row.dk_car_no;
        if (!f) return;
        row.dk_car = f.label;
        if (f.no != null) row.dk_car_no = f.no;
      }
      function kurumaOptsHtml(nowLabel) {
        var hit = -1;
        var html = KURUMA_FUDA.map(function (f, i) {
          if (f.label === nowLabel) hit = i;
          return (
            '<option value="' +
            i +
            '"' +
            (f.label === nowLabel ? " selected" : "") +
            ">" +
            esc(f.label) +
            "</option>"
          );
        }).join("");
        // 今付いている札が 一覧に無い（名前を変えた等）＝そのまま残せる様に 先頭に置く
        var keep =
          nowLabel && hit < 0 ? '<option value="keep" selected>' + esc(nowLabel) + "</option>" : "";
        return '<option value="">（車なし）</option>' + keep + html;
      }
