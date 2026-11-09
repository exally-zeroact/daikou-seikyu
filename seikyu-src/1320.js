      async function yomiNaoshiMon(month, onlyCo, what) {
        hakkoObiKesu(); // 前の 押しの 帯を 残さない（本番前の 対立役 注2）
        if (_entrySavingP) {
          try {
            await _entrySavingP;
          } catch (_) {}
        }
        var m = await kuraMeisaiYomu();
        if (m.error) {
          toast(
            "通信が 途切れて 明細を 読み直せませんでした。" +
              what +
              " は しません。もう一度 押してください",
            6000
          );
          return false;
        }
        var p = await kuraPaymentsYomu();
        var maeDB = DB;
        var cos = onlyCo
          ? [onlyCo]
          : tsukiNoKaishaOf(maeDB, month).concat(
              tsukiNoKaishaOf(m.db, month).filter(function (c) {
                return tsukiNoKaishaOf(maeDB, month).indexOf(c) < 0;
              })
            );
        var coAri = {};
        cos.forEach(function (c) {
          coAri[c] = true;
        });
        // 材料の 窓＝紙と 同じ 数え方（日付の 頭7字＝月）。2026-11-04 まで 重なりの ために 前後1日 広げていた＝重なりを 外したので その 月に 戻した
        //   （大小 比べで 書くと 0の 欠けた 日付 "2026-11-5" が 外れる＝紙に 載るのに 見ない・設計前の 対立役 注2）
        var fureruM = function (r) {
          if (!r || !coAri[r.会社名] || !r.日付) return false;
          var tsuki = String(r.日付).slice(0, 7);
          if (MASTER[r.会社名] && MASTER[r.会社名].carryover) return tsuki <= month; // 繰越＝前の 月も 全部
          return tsuki === month;
        };
        var zm = Nijuu.zureKazoeru(meisaiZureList(maeDB), meisaiZureList(m.db), fureruM);
        var zp = { tasu: 0, naoru: 0, kieru: 0, kasanaru: 0, zenbu: 0 };
        if (!p.error) {
          zp = Nijuu.zureKazoeru(paymentsZureList(PAYMENTS), paymentsZureList(p.map), function (r) {
            return !!(r && coAri[r.会社名] && MASTER[r.会社名] && MASTER[r.会社名].carryover);
          });
        }
        var kaeta = false;
        if (zm.zenbu) {
          DB = m.db;
          naoshiYomu(); // 表示用（⑦）＝見張りの 判じには 使わない
          kaeta = true;
        }
        if (p.error) {
          if (!YOMENAI.payments) kaeta = true; // ★読めない に 変わった＝一覧・帯・窓・集計を 描き直す★（古い 入金で 描いた まま 残る）
          YOMENAI.payments = true; // ★繰越の 会社 だけ 止まる（kurikoshiTomeru）★
          toast("入金を 読み直せませんでした（入金の 記録は 画面を 開き直してから）", 5000);
        } else {
          if (zp.zenbu || YOMENAI.payments) kaeta = true;
          PAYMENTS = p.map;
          PAY_YONDA = p.hajime;
          YOMENAI.payments = false;
        }
        if (kaeta) hakkoGamenNaosu();
        var fure = zm.tasu + zm.naoru + zm.kieru + zm.kasanaru + zp.tasu + zp.naoru + zp.kieru;
        if (!fure) return true;
        toast(
          "倉庫に この 紙の 新しい 明細・入金が ありました（明細 足す " +
            zm.tasu +
            "・直す " +
            (zm.naoru + zm.kasanaru) +
            "・消す " +
            zm.kieru +
            "／入金 " +
            (zp.tasu + zp.naoru + zp.kieru) +
            "）。画面を 最新に しました。紙を 確かめてから もう一度 押してください",
          8000
        );
        // ★帯にも 出す★（知らせは 1行で スマホでは 切れる・本番前の 対立役 注4）
        var obi = document.getElementById("hakkoObi");
        if (obi) {
          obi.innerHTML =
            '<div class="hakko-obi-hd">請求書は まだ 作っていません</div><div class="hakko-obi-sec">倉庫に この 紙の 新しい 明細・入金が ありました（明細 足す ' +
            zm.tasu +
            "・直す " +
            (zm.naoru + zm.kasanaru) +
            "・消す " +
            zm.kieru +
            "／入金 " +
            (zp.tasu + zp.naoru + zp.kieru) +
            "）。画面を 最新に しました。紙を 確かめてから もう一度 押してください</div>" +
            '<button type="button" class="hakko-obi-x" onclick="hakkoObiKesu()">閉じる</button>';
          obi.hidden = false;
        }
        return false;
      }
      // ★料金が 空の 行の 帯★（alert/confirm は 使わない）
      function hakkoObiKesu() {
        var el = document.getElementById("hakkoObi");
        if (el) {
          el.hidden = true;
          el.innerHTML = "";
        }
      }
      /* 通して よければ true */
      function hakkoMon(month, cos) {
        var r = Nijuu.hakkoMae(
          DB.filter(function (x) {
            return x.account_id === CURRENT_ACCOUNT;
          }),
          month,
          cos
        );
        if (!r.mitei.length) {
          hakkoObiKesu();
          return true;
        }
        var el = document.getElementById("hakkoObi");
        var h = '<div class="hakko-obi-hd">請求書は まだ 作っていません</div>';
        if (r.mitei.length) {
          h +=
            '<div class="hakko-obi-sec"><b>メーターの 料金が まだ 入っていない 明細が ' +
            r.mitei.length +
            "件 あります</b>（このままでは 金額を 計算 できません。一覧で 金額を 入れてから 出してください。0円で 良い 乗車なら 一覧で 0 と 入れて 保存、すでに 0 の 行は「0円（料金なし）で 決める」に 印を 付けて 保存してください）<ul>" +
            r.mitei
              .map(function (x) {
                return (
                  "<li>" +
                  esc(x.会社名) +
                  " " +
                  esc(mdShort(x.日付)) +
                  (x.行き先 ? " " + esc(x.行き先) : "") +
                  "</li>"
                );
              })
              .join("") +
            "</ul></div>";
        }
        h += '<button type="button" class="hakko-obi-x" onclick="hakkoObiKesu()">閉じる</button>';
        if (el) {
          el.innerHTML = h;
          el.hidden = false;
        }
        toast(
          "料金が まだ 入っていない メーターの 明細が あります（請求書は 作っていません）",
          6000
        );
        return false;
      }
      async function saveEntriesHontai() {
        var co = document.getElementById("inputCompany").value;
        if (!co) {
          toast("会社を選んでください");
          return;
        }
        var items = MASTER[co].items;
        // ★AI の 下書きの 門★（確かめていない・金額が 空・読めなかった 数が 空 の AI の 行が 在れば 保存しない）
        var aiMon = Shitagaki.hozonMon(entryRows, items);
        if (aiMon) {
          toast(aiMon, 4000);
          return;
        }
        var needsDate = items.indexOf("日付") >= 0;
        // 内容のある行だけ対象
        var contentRows = entryRows.filter(function (row) {
          return items.some(function (k) {
            return String(row[k] || "").trim() !== "";
          });
        });
        if (!contentRows.length) {
          toast("入力がありません");
          return;
        }
        // 日付必須（空のまま保存すると月集計・請求書から抜けるためブロック）
        if (
          needsDate &&
          contentRows.some(function (row) {
            return !String(row["日付"] || "").trim();
          })
        ) {
          toast("日付が空の明細があります。日付を入れてください");
          return;
        }
        var recs = contentRows.map(function (row) {
          var rec = { account_id: CURRENT_ACCOUNT, 会社名: co };
          FIELD_DEFS.forEach(function (f) {
            var raw = row[f.key];
            if (f.type === "number")
              rec[f.key] =
                raw === "" || raw == null ? "" : Number(String(raw).replace(/[^0-9.\-]/g, "")) || 0;
            else rec[f.key] = raw || "";
          });
          items.forEach(function (k) {
            if (
              FIELD_DEFS.some(function (f) {
                return f.key === k;
              })
            )
              return;
            rec[k] = row[k] || "";
          });
          // 車（選んだ時だけ）＝dk_car・dk_car_no だけ（dk_ref・dk_source は入れない）
          if (row.dk_car) rec.dk_car = row.dk_car;
          if (row.dk_car && row.dk_car_no != null) rec.dk_car_no = row.dk_car_no;
          return rec;
        });
        // クラウドに一括insert→返ってきたuuid＋created_atを各明細に載せて in-memory に追加
        // ★500件ずつ分割（1回のinsert返りもmax_rows上限に掛かる＝1000超でid対応が崩れ、以後その行が更新/削除できなくなるのを防ぐ）
        var payload = recs.map(meisaiToDb);
        var insData = [];
        for (var bi = 0; bi < payload.length; bi += 500) {
          var chunk = payload.slice(bi, bi + 500);
          var ins = await SB.from("meisai").insert(chunk).select("id, created_at");
          if (ins.error) {
            cloudErr("明細追加", ins.error);
            return;
          }
          if ((ins.data || []).length !== chunk.length) {
            cloudErr("明細追加", {
              message:
                "一部しか保存できませんでした（" +
                (ins.data || []).length +
                "/" +
                chunk.length +
                "）",
            });
            return;
          }
          insData = insData.concat(ins.data);
        }
        insData.forEach(function (r, i) {
          recs[i].id = r.id;
          recs[i]._created = r.created_at || ""; // 一覧で「今入れた明細」を最上部に出すため
          // ★もう 在る id は 足さない★（保存の 途中に 出す 前の 見張りが DB を 丸ごと 替えると 2重に 入る・対立役 注1）
          if (
            DB.some(function (x) {
              return x.id === r.id;
            })
          )
            return;
          DB.push(recs[i]);
        });
        try {
          localStorage.setItem(LAST_CO_KEY, co); // 次回の入力で同じ会社を自動選択（端末ごと）
        } catch (e) {}
        recordCompanyUse(co); // 「最近使った会社」順の記録（セレクト並べ替え用）
        updatePayBadge();
        entryRows = [blankEntry()];
        renderEntry();
        toast(recs.length + "件を保存しました");
      }

      /* ===================================================================
      一覧 / 修正
      =================================================================== */
