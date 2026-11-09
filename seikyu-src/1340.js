      // 期間プルダウンを最新化（「全期間」＋データのある月だけ）
      function refreshMonthSelect() {
        var sel = document.getElementById("listMonth");
        if (!sel) return;
        var keep = sel.value;
        var present = {};
        DB.forEach(function (r) {
          if (r.account_id === CURRENT_ACCOUNT && r.日付) present[r.日付.slice(0, 7)] = true;
        });
        var months = Object.keys(present).sort().reverse();
        sel.innerHTML =
          '<option value="">全期間</option>' +
          months
            .map(function (m) {
              var p = m.split("-");
              return (
                '<option value="' + m + '">' + Number(p[0]) + "年" + Number(p[1]) + "月</option>"
              );
            })
            .join("");
        if (months.indexOf(keep) >= 0 || keep === "") sel.value = keep;
      }
      // ★車ごとに分けて 早い順に並べる為の小道具★ 2026-08-25
      //   決まりは ★エンジン1本★（請求書の明細も 同じ物で並べる）。
      //   ここで書き直すと ★一覧と請求書で並びが食い違う★ので 呼ぶだけにする。
      function carNoOf(r) {
        return MeisaiEngine.utils.carNoOf(r);
      }
      function seqOf(r) {
        return MeisaiEngine.utils.seqOf(r);
      }
      function carLabelOf(r) {
        return r && r.dk_car ? String(r.dk_car) : "";
      }
      function renderList() {
        _dkFixObi(); // 事務所へ 戻せなかった 行の 知らせ（読み込み直しても 出す）2026-10-14
        refreshCompanySelects();
        refreshMonthSelect();
        var co = document.getElementById("listCompany").value;
        var mo = document.getElementById("listMonth").value;
        var rows = DB.filter(function (r) {
          if (r.account_id !== CURRENT_ACCOUNT) return false;
          if (co && r.会社名 !== co) return false;
          if (mo && !inMonth(r.日付, mo)) return false;
          return true;
        }).sort(function (a, b) {
          // ★2026-08-25 司さん「一覧の並びも 上から車ごとに分けて 早い順で並べて」★
          //   ★日の順は 今まで通り。1文字も触っていない★（司さん「古い日は今まで通りでええ」）。
          //   足したのは ★同じ日の中★＝ ★車ごと（事務所で決めた並び順）★、
          //   車の中は ★早い順★（メーターの何本目→無ければ 入れた順）。
          //   ★手で入れた分は 車が無いので 車の後ろにまとめる★（消さない）。
          var d = (b.日付 || "").localeCompare(a.日付 || "");
          if (d !== 0) return d;
          return MeisaiEngine.utils.compareInDay(a, b);
        });
        var box = document.getElementById("listBody");
        var sumEl = document.getElementById("listSum");
        // ★④頭に「◯件／合計 ¥◯」★（絞り込むと数え直る＝今 見えている物の数）
        var grand = rows.reduce(function (t, r) {
          return t + (Number(r.金額) || 0);
        }, 0);
        if (sumEl)
          sumEl.innerHTML =
            '<span><span class="n">' +
            rows.length +
            "件</span>" +
            (co || mo ? "（絞り込み中）" : "") +
            '</span><span>合計 <span class="v">' +
            esc(yen(grand)) +
            "</span></span>";
        naoshiTadashiNuru(); // 直しの 履歴（⑦）の 但し書き
        if (!rows.length) {
          box.innerHTML = '<div class="li-empty">明細がありません</div>';
          return;
        }
        // ★⑤日ごとにまとめる（同じ日付を何度も読ませない）＋その日の合計★
        var days = [];
        var byDay = {};
        rows.forEach(function (r) {
          var k = r.日付 || "";
          if (!byDay[k]) {
            byDay[k] = [];
            days.push(k);
          }
          byDay[k].push(r);
        });
        var WD = ["日", "月", "火", "水", "木", "金", "土"];
        box.innerHTML = days
          .map(function (k) {
            var list = byDay[k];
            var dsum = list.reduce(function (t, r) {
              return t + (Number(r.金額) || 0);
            }, 0);
            var head;
            if (k) {
              var p = k.split("-");
              var wd = WD[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()];
              head =
                '<div class="li-day"><span class="d">' +
                esc(mdShort(k)) +
                "（" +
                wd +
                '）</span><span class="s">' +
                list.length +
                "件 " +
                esc(yen(dsum)) +
                "</span></div>";
            } else {
              head =
                '<div class="li-day"><span class="d">⚠️日付なし</span><span class="s">' +
                list.length +
                "件 " +
                esc(yen(dsum)) +
                "</span></div>";
            }
            // ★車の見出しは 日ごとに出し直す★（2026-08-25 司さん）
            var lastCar = null;
            return (
              head +
              list
                .map(function (r) {
                  // ★車が変わったら 見出しを1本 はさむ★（手で入れた分は「手で入れた分」）
                  var carNow = carLabelOf(r);
                  var carHead = "";
                  if (carNow !== lastCar) {
                    lastCar = carNow;
                    carHead =
                      '<div class="li-car">' +
                      esc(carNow ? "車 " + carNow : "手で入れた分") +
                      "</div>";
                  }
                  // ★②会社名が主役・行き先は副★（前は逆だった＝探す物が一番 薄かった）
                  var co2 = r.会社名 + (r.備考 ? "・" + r.備考 : "");
                  // ★直しの 履歴（⑦）★ 運転手が 最後に 直した 行は 赤（司さん 10-21）
                  var _nl = NAOSHI.joutai === "ok" ? NAOSHI.meisai[String(r.id)] : null;
                  var _aka = !!(_nl && window.NaoshiRireki && NaoshiRireki.akaKa(_nl));
                  return (
                    carHead +
                    '<div class="list-swipe">' +
                    '<div class="swipe-action"><button class="swipe-del" onclick="deleteRow(\'' +
                    r.id +
                    "')\">削除</button></div>" +
                    '<div class="swipe-content"><div class="list-item' +
                    (_aka ? " li-aka" : "") +
                    '" onclick="openEdit(\'' +
                    r.id +
                    "')\">" +
                    '<div class="li-main"><div class="li-meta">' +
                    esc(co2) +
                    '</div><div class="li-dest">' +
                    // ★行き先の文字は エンジン1本から（紙・Excelと同じ物）★ 2026-08-18
                    esc(MeisaiEngine.utils.routeTextOf(r) || "（行き先なし）") +
                    "</div></div>" +
                    '<div class="li-amt">' +
                    yen(r.金額 || 0) +
                    naoshiFudaHtml(_nl) +
                    "</div></div></div></div>"
                  );
                })
                .join("")
            );
          })
          .join("");
        attachSwipeHandlers();
      }
      function openEdit(id) {
        var r = DB.filter(function (x) {
          return x.id === id;
        })[0];
        if (!r) return;
        var m = MASTER[r.会社名];
        // 編集はその会社のitems（無ければ全列）を表示
        var keys =
          m && m.items
            ? m.items.slice()
            : FIELD_DEFS.map(function (f) {
                return f.key;
              });
        document.getElementById("modalTitle").textContent = "明細を編集";
        var fields = keys
          .map(function (k) {
            var def = FIELD_DEFS.filter(function (f) {
              return f.key === k;
            })[0];
            var t = def ? def.type : "text";
            var val = esc(r[k]);
            // ★距離だけ小数を打てるようにする (2026-08-05)★
            //   ダイコメのメーターが 5.36km と実測どおり入れてくるようになった。
            //   数の欄は今まで [^0-9] を全部消していたので、★距離を打ち直すと
            //   5.36 → 536 になっていた★。金額・人数は今までどおり整数のみ。
            var _dec = k === "距離";
            var inp =
              t === "date"
                ? '<input class="finput" type="date" id="ed_' + k + '" value="' + val + '">'
                : t === "number"
                  ? '<input class="finput fnum" inputmode="' +
                    (_dec ? "decimal" : "numeric") +
                    '" ' +
                    NOFILL +
                    ' oninput="this.value=this.value.replace(' +
                    (_dec ? "/[^0-9.]/g" : "/[^0-9]/g") +
                    ",'')\" id=\"ed_" +
                    k +
                    '" value="' +
                    val +
                    '">'
                  : '<input class="finput" ' + NOFILL + ' id="ed_' + k + '" value="' + val + '">';
            return '<div class="frow"><div class="flabel">' + esc(k) + "</div>" + inp + "</div>";
          })
          .join("");
        // ★車（任意）★ 2026-10-23＝手で入れた行だけ・札が読めた時だけ。
        //   事務所から来た行（dk_source・dk_ref が在る）の車は 事務所の札が正本＝ここでは変えない。
        if (KURUMA_FUDA.length && !r.dk_source && !r.dk_ref)
          fields +=
            '<div class="frow"><div class="flabel">車</div>' +
            '<select class="finput ed-car" id="ed__car">' +
            kurumaOptsHtml(r.dk_car || "") +
            "</select></div>";
        // ★2026-08-25 直し★：2026-08-21 に「（idで特定）」の見出しを消した時、
        //   ★代入が `= "";` で終わってしまい、後ろの連結が誰にも渡らない ただの式★ になっていた。
        //   ＝ 一覧から1件 押すと ★「明細を編集」と「閉じる」だけの空の画面★ が出る＝直せない。
        //   構文は正しいので lint も試験も緑のまま通っていた。
        //   見張り: tests/dead-expression.test.js（誰にも渡らない式が1件でも在れば赤）
        // ★0円と 決める 印の 欄★ 2026-11-04（前の 版で 空を 0 に された メーター行は 0 と 打っても 印が 付かない・本番前の 対立役 注1）
        //   出すのは メーターの 行で 額が 0 で メーターの 料金（dk_meter_yen）も 無い 時 だけ
        var zeroKimeHtml = "";
        if (
          (r.dk_source || r.dk_ref) &&
          Number(r.金額) === 0 &&
          r.金額 !== "" &&
          (r.dk_meter_yen === "" || r.dk_meter_yen == null)
        )
          zeroKimeHtml =
            '<label class="ai-kakunin"><input type="checkbox" id="ed__zero0"' +
            (r.ryokin_0_kimeta === true ? " checked" : "") +
            "> この乗車は 0円（料金なし）で 決める</label>";
        document.getElementById("modalBody").innerHTML =
          /* ★中の言葉(id)は客に見せない★ 2026-08-21 */
          fields +
          zeroKimeHtml +
          naoshiIchiranHtml(NAOSHI.meisai[String(r.id)]) +
          '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteRow(\'' +
          r.id +
          "')\">削除</button>" +
          '<button class="btn btn-primary btn-sm" style="flex:2;" onclick="saveEdit(\'' +
          r.id +
          "')\">保存</button></div>";
        openModal();
      }
      async function saveEdit(id) {
        var r = DB.filter(function (x) {
          return x.id === id;
        })[0];
        if (!r) return;
        // ★直す前の 姿を 控える（金額が 変わったかを 見る為）★ 2026-09-03
        //   ★決まりは エンジン1本★（MeisaiEngine.utils.shouldPushFare）＝ここに 書き直さない
        var _mae = { 金額: r.金額, dk_source: r.dk_source, dk_ref: r.dk_ref };
        var m = MASTER[r.会社名];
        var keys =
          m && m.items
            ? m.items
            : FIELD_DEFS.map(function (f) {
                return f.key;
              });
        // 日付必須チェック（編集でも空にはできない）
        if (keys.indexOf("日付") >= 0) {
          var dEl = document.getElementById("ed_日付");
          if (dEl && !String(dEl.value || "").trim()) {
            toast("日付を入れてください");
            return;
          }
        }
        var maeKingaku = r.金額; // 0円と 決めた 印は 客が 額を 0 に 変えた 時 だけ 付ける（本番前の 対立役 注1）
        keys.forEach(function (k) {
          var el = document.getElementById("ed_" + k);
          if (!el) return;
          var def = FIELD_DEFS.filter(function (f) {
            return f.key === k;
          })[0];
          var t = def ? def.type : "text";
          if (t === "number")
            r[k] = el.value === "" ? "" : Number(String(el.value).replace(/[^0-9.\-]/g, "")) || 0;
          else r[k] = el.value;
        });
        // 車：空に戻したら dk_car・dk_car_no とも消す（「keep」＝一覧に無い今の札はそのまま）
        var carEl = document.getElementById("ed__car");
        if (carEl && carEl.value !== "keep")
          kurumaWoTsukeru(r, carEl.value === "" ? -1 : Number(carEl.value));
        // ★メーターの 行に 客が 0 と 打った＝0円と 決めた 印★（料金未定の 見張りが 通す・本番前の 対立役 注1）
        if ((r.dk_source || r.dk_ref) && document.getElementById("ed_金額")) {
          // 前から 0 の 行（前の 版で 空を 0 に された 行）の 行き先だけ 直しても 印は 付けない
          var zeroEl = document.getElementById("ed__zero0");
          if (zeroEl) {
            // 前から 0 の 行＝客が 欄に 印を 付けた 時 だけ（行き先 だけ 直しても 付かない）
            if (r.金額 === 0 && zeroEl.checked) r.ryokin_0_kimeta = true;
            else delete r.ryokin_0_kimeta;
          } else if (r.金額 === 0 && maeKingaku !== 0 && maeKingaku !== "0")
            r.ryokin_0_kimeta = true;
          else if (r.金額 !== 0) delete r.ryokin_0_kimeta;
        }
        var upd = meisaiToDb(r);
        // ★メーターの 行で 料金が 空なら 空（null）の まま 書く★ 2026-11-04（本番前の 対立役 止1）
        //   meisaiToDb は 空の 額を 0 に する＝備考だけ 直すと 料金未定の 乗車が 0円で 請求された
        if ((r.dk_source || r.dk_ref) && (r.金額 === "" || r.金額 == null)) upd.amount = null;
        var u = await SB.from("meisai").update(upd).eq("id", id);
        if (u.error) {
          cloudErr("明細更新", u.error);
          return;
        }
        closeModal();
        renderList();
        toast("保存しました");
        naoshiYomu(); // 事務所の 直し＝赤が 消える（⑦）
        // ★事務所の売上へ 戻す★ 2026-09-03（司さん「一覧で金額とか修正したら事務所の売上とかも自動で修正されるように」）
        //   ★保存は もう 終わっている★＝ここで 何が 起きても 一覧の 保存は 通ったまま。
        await _jimushoHeModosu(r, _mae);
      }
