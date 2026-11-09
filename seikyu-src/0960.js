      // ロゴ画像を「箱(幅max×高max mm)」にアスペクト比維持で収めた実寸(mm)を返す＝アプリのobject-fit:containと同じ。
      // ★必ずresolveする★：読込失敗/タイムアウトでも箱の既定値を返す＝書き出しがハングしない＆正方形化に戻らない。
      function _containLogoMm(dataURL, maxWmm, maxHmm) {
        return new Promise(function (resolve) {
          var done = false;
          // 失敗時の安全既定＝正方形でなく「箱」(縦は箱の高さ上限まで)。force-square回帰を防ぐ。
          var box = { wMm: maxWmm, hMm: Math.min(maxWmm, maxHmm) };
          function settle(v) {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve(v);
          }
          var t = setTimeout(function () {
            settle(box);
          }, 3000); // 画像が永遠に読めない時のハング防止
          var im = new Image();
          im.onload = function () {
            var w = im.naturalWidth || im.width,
              h = im.naturalHeight || im.height;
            if (!w || !h) {
              settle(box);
              return;
            }
            var asp = w / h, // 幅/高
              wMm = maxWmm,
              hMm = maxWmm / asp; // まず幅を箱幅に合わせる
            if (hMm > maxHmm) {
              hMm = maxHmm;
              wMm = maxHmm * asp;
            } // 高さがはみ出すなら高さ基準に切替
            settle({ wMm: Math.round(wMm * 100) / 100, hMm: Math.round(hMm * 100) / 100 });
          };
          im.onerror = function () {
            settle(box);
          };
          im.src = dataURL;
        });
      }

      // ワンタップで この会社の項目順を標準（日付/行き先/金額/…）に戻す。
      function resetItemOrder(co) {
        MASTER[co].items = inputItemsOrder(MASTER[co].items);
        saveMaster();
        reopen(co);
        toast("標準の順に戻しました");
      }
      // 明細はsaveEntries/saveEdit/deleteRowが各操作で直接クラウドに書く＝ここは何もしない
      function saveDB() {}
      // 入金はsavePayが各操作で直接upsert＝ここは何もしない
      function savePayments() {}
      // 会社マスタ：現在のMASTER全社をクラウドに同期（社数は少ないので全upsert）
      async function saveMaster() {
        var names = Object.keys(MASTER).filter(function (n) {
          return !MASTER[n].account_id || MASTER[n].account_id === CURRENT_ACCOUNT;
        });
        for (var idx = 0; idx < names.length; idx++) {
          var co = names[idx];
          var m = MASTER[co];
          var payload = companyToDb(co);
          try {
            if (m._dbid) {
              var u = await SB.from("companies").update(payload).eq("id", m._dbid);
              if (u.error) cloudErr("会社更新", u.error);
            } else {
              var r = await SB.from("companies").insert(payload).select("id").single();
              if (r.error) cloudErr("会社追加", r.error);
              else m._dbid = r.data.id;
            }
          } catch (e) {
            cloudErr("会社保存", e);
          }
        }
      }

      function seedMaster() {
        MASTER = {
          "Xalqal Alqalqal": {
            account_id: CURRENT_ACCOUNT,
            items: ["日付", "行き先", "金額"],
            widths: { 日付: 64, 行き先: 300, 金額: 120 },
            lead: "{月}月のご使用分です。",
            tableTitle: "運転業務委託料",
            noteSummary: false,
            noteGroups: [],
          },
          標様建設株式会社: {
            account_id: CURRENT_ACCOUNT,
            items: ["日付", "行き先", "金額", "備考"],
            widths: { 日付: 60, 行き先: 240, 金額: 104, 備考: 84 },
            lead: "{月}月のご利用分です。",
            tableTitle: "運転業務委託料",
            noteSummary: true,
            noteGroups: ["会長", "社長", "専務"],
          },
        };
        saveMaster();
      }
      function seedDB() {
        // 添付PDFの実データ（サンプル）。標様=2026-01、サンプル=2026-05。
        var rows = [];
        function push(co, d, dest, amt, note) {
          rows.push({
            account_id: CURRENT_ACCOUNT,
            会社名: co,
            日付: d,
            行き先: dest,
            金額: amt,
            備考: note || "",
            距離: "",
            人数: "",
            名前: "",
          });
        }
        // 標様建設（1月）合計7,500 / 社長1,500・専務6,000
        push("標様建設株式会社", "2026-01-14", "松本〜蔵敷〜祇園", 1500, "社長");
        push("標様建設株式会社", "2026-01-17", "時代〜鳥生", 1400, "専務");
        push("標様建設株式会社", "2026-01-17", "立花〜時代", 1700, "専務");
        push("標様建設株式会社", "2026-01-31", "松本〜鳥生", 1400, "専務");
        push("標様建設株式会社", "2026-01-31", "基〜松本", 1500, "専務");
        // Xalqal Alqalqal（5月）1ページ目=41,730 + 2ページ目先頭で継ぎ足し実演
        var ch = [
          ["2026-05-01", "UNIQLO〜郷本町", 1500],
          ["2026-05-01", "立花〜UNIQLO〜喜田村", 2100],
          ["2026-05-01", "UNIQLO〜喜田村", 2000],
          ["2026-05-02", "駐車場代", 1100],
          ["2026-05-02", "松本〜喜田村", 1800],
          ["2026-05-02", "UNIQLO〜喜田村", 1700],
          ["2026-05-02", "松本〜桜井", 2800],
          ["2026-05-02", "松本〜喜田村", 1700],
          ["2026-05-02", "UNIQLO〜東予", 5300],
          ["2026-05-02", "UNIQLO〜郷本町", 1500],
          ["2026-05-04", "桜井〜喜田村", 2000],
          ["2026-05-04", "UNIQLO〜喜田村", 1700],
          ["2026-05-04", "UNIQLO〜松本〜郷本町", 1800],
          ["2026-05-04", "たかと〜郷本町〜辻堂〜喜田村", 2500],
          ["2026-05-05", "旦〜喜田村", 2300],
          ["2026-05-08", "UNIQLO〜喜田村", 1700],
          ["2026-05-09", "駐車場代", 100],
          ["2026-05-09", "パフェ〜喜田村", 1800],
          ["2026-05-15", "UNIQLO〜喜田村", 1800],
          ["2026-05-15", "UNIQLO〜郷本町", 1500],
          ["2026-05-15", "タイムズ〜桜井", 2700],
          ["2026-05-15", "駐車場代", 330],
          ["2026-05-16", "UNIQLO〜郷本町", 1500],
          ["2026-05-16", "UNIQLO〜喜田村", 1700],
          ["2026-05-16", "光州園〜UNIQLO", 1000],
          ["2026-05-16", "光州園〜UNIQLO", 1000],
          ["2026-05-16", "UNIQLO〜喜田村", 1600],
        ];
        ch.forEach(function (r) {
          push("Xalqal Alqalqal", r[0], r[1], r[2]);
        });
        rows.forEach(function (r) {
          r.id = nextId();
          DB.push(r);
        });
        saveDB();
      }

      var _idc = 0;
      function nextId() {
        _idc += 1;
        return "R" + Date.now().toString(36) + _idc.toString(36);
      }

      /* ===================================================================
      ユーティリティ
      =================================================================== */
      function yen(n) {
        n = Math.round(n || 0);
        return "¥" + n.toLocaleString("ja-JP");
      }
      function comma(n) {
        if (n === "" || n === null || n === undefined) return "";
        return Number(n).toLocaleString("ja-JP");
      }
      function mdShort(iso) {
        if (!iso) return "";
        var p = iso.split("-");
        return Number(p[1]) + "/" + Number(p[2]);
      }
      function inMonth(iso, month) {
        return iso && month && iso.slice(0, 7) === month;
      }
      // ★tax10 の写しはここに在ったが 誰も呼んでいなかったので消した（2026-08-11）★
      //   合計を足すのは meisai-engine.js の invoiceTotals ただ1本。
      function esc(s) {
        return String(s == null ? "" : s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function reiwaIssueDate(month) {
        if (!month) return "";
        var p = month.split("-"),
          y = Number(p[0]),
          m = Number(p[1]);
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        return "令和" + (y - 2018) + "年" + m + "月1日";
      }
      function toast(msg, ms) {
        var t = document.getElementById("toast");
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(t._tm);
        t._tm = setTimeout(function () {
          t.classList.remove("show");
        }, ms || 1700);
      }
      // 連続入力(oninput等)で1回だけ出す保存トースト。入力が止まってからまとめて確認を出す。
      var _toastDebT = null;
      function toastDebounced(msg) {
        clearTimeout(_toastDebT);
        _toastDebT = setTimeout(function () {
          toast(msg);
        }, 450);
      }

      /* ===================================================================
      画面切替
      =================================================================== */
      function showScreen(name) {
        hakkoObiKesu(); // 出す 前の 見張りの 帯は 画面を 移ったら 消す（対立役 注4）
        if (window.PdfOkuru) PdfOkuru.kesu(); // 「送る・印刷する」の 帯も 消す（古い 紙を 送らない）
        var titles = {
          input: "明細入力",
          list: "明細一覧",
          billing: "請求 / 集計",
          payment: "入金管理",
          settings: "設定",
        };
        document.querySelectorAll(".screen").forEach(function (s) {
          s.classList.remove("active");
        });
        document.getElementById("scr-" + name).classList.add("active");
        document.querySelectorAll(".nav-item").forEach(function (b) {
          b.classList.toggle("active", b.dataset.scr === name);
        });
        document.getElementById("appTitle").textContent = titles[name] || "代行請求";
        // ★2026-08-21 A2-③ 画面を切り替えたら 頭を出す★（前の画面のスクロール位置が残り、
        //   一番上の説明文が途中から見えていた）
        try {
          window.scrollTo(0, 0);
        } catch (e) {}
        if (name === "input") preselectInputCompany();
        if (name === "list") renderList();
        if (name === "billing") showBillingSeg("invoice"); // 既定＝請求書
        if (name === "payment") renderPayments();
        if (name === "settings") {
          showSettingsSeg("master"); // 既定＝会社マスタ
        }
        updatePayBadge();
        window.scrollTo(0, 0);
      }
