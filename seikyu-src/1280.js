      function aiSgYameru() {
        if (AI_SG.ctl) AI_SG.ctl.abort();
      }
      async function aiSgOkuru(naka) {
        if (AI_SG.busy || _entrySaving) return; // 同時に 1本・保存中は 送らない（v2 注1・v3 注C）
        var co = document.getElementById("inputCompany").value;
        if (!co || !MASTER[co]) return toast("会社を選んでください");
        var items = inputItemsOrder(MASTER[co].items);
        var hyouji = items.map(function (k) {
          return MeisaiEngine.utils.labelOf(MASTER[co], k);
        });
        var kyou = kyouNoHi();
        var narabi = JSON.stringify(items);
        aiSgObi("");
        aiSgBusy(true);
        AI_SG.ctl = typeof AbortController === "function" ? new AbortController() : null;
        var kotae = null;
        try {
          var tok = await aiSgTokun();
          if (!tok || !kagiMon(tok)) {
            if (!tok && LOGGED_IN_ID) kagiKireta();
            aiSgObi("ログインし直してください");
            return;
          }
          var r = await fetch("/api/shitagaki", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
            body: JSON.stringify(
              Object.assign({ kaisha: co, koumoku: items, hyouji: hyouji, kyou: kyou }, naka)
            ),
            signal: AI_SG.ctl ? AI_SG.ctl.signal : undefined,
          });
          var txt = await r.text();
          try {
            kotae = JSON.parse(txt);
          } catch (e) {
            kotae = null;
          }
          if (!kotae || typeof kotae !== "object") {
            // JSON で ない（Vercel の 時間切れ 等）＝状態の 番号と 字を そのまま 出す（v2 注6）
            aiSgObi("状態 " + r.status + "：" + String(txt || "").slice(0, 80));
            return;
          }
          if (r.status === 401) {
            aiSgObi("ログインし直してください");
            return;
          }
          if (!kotae.ok) {
            aiSgObi(String(kotae.message || "読み取りに失敗しました（状態 " + r.status + "）"));
            return;
          }
        } catch (e) {
          aiSgObi(
            e && e.name === "AbortError"
              ? "やめました"
              : "AI に つながりませんでした。電波を確かめてもう一度"
          );
          return;
        } finally {
          AI_SG.ctl = null;
          aiSgBusy(false);
        }
        // 保存中に 届いたら 保存が 終わってから 足す（v2 注1）
        if (_entrySaving && _entrySavingP) await _entrySavingP;
        var coIma = document.getElementById("inputCompany").value;
        if (
          coIma !== co ||
          !MASTER[coIma] ||
          JSON.stringify(inputItemsOrder(MASTER[coIma].items)) !== narabi
        ) {
          aiSgObi("会社が替わったので下書きを捨てました");
          return;
        }
        var rows = Shitagaki.gamenGyou(kotae.kekka || {}, items, kyou, co, naka.shurui);
        var m = document.getElementById("aiSgModel");
        if (m) {
          m.textContent = kotae.model ? "読んだ AI：" + kotae.model : "";
          m.style.display = kotae.model ? "block" : "none";
        }
        if (!rows.length) {
          if (!entryRows.length) entryRows = [blankEntry()];
          renderEntry();
          aiSgObi("1行も読めませんでした");
          return;
        }
        entryRows = Shitagaki.tsuika(entryRows, rows, items);
        renderEntry();
        var kj = String((kotae.kekka && kotae.kekka.kaisha_no_ji) || "").trim();
        if (kj && kj.indexOf(co) < 0 && co.indexOf(kj) < 0)
          aiSgObi(
            "伝票の会社名「" +
              kj +
              "」が、選んだ会社「" +
              co +
              "」と違うかもしれません。確かめてください"
          );
        if (naka.shurui === "koe") document.getElementById("aiSgBun").value = "";
        toast(
          rows.length + "行の下書きを入れました。伝票と見比べて「確かめた」を押してください",
          4000
        );
      }
      function aiSgKakunin(i, el) {
        if (entryRows[i]) entryRows[i]._kakunin = !!el.checked;
      }
      function pickKouho(i, j) {
        var r = entryRows[i];
        if (!r || !r._kouho || !r._kouho[j]) return;
        r["金額"] = r._kouho[j].atai; // ★「確かめた」は 付けない★（v3 注A）
        renderEntry();
      }
      function addEntryRow() {
        entryRows.push(blankEntry());
        renderEntry();
      }
      // 共通：オートフィル/予測変換の混入を止める属性
      var NOFILL = 'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';
      // 入力欄は常に自然な順（日付→行き先→金額→…の固定列順、そのあと自由項目）で出す。
      // ＝請求書の列順（ドラッグで自由）に引きずられて入力欄が乱れないようにする。
      function inputItemsOrder(items) {
        var order = FIELD_DEFS.map(function (f) {
          return f.key;
        });
        return items.slice().sort(function (a, b) {
          var ia = order.indexOf(a),
            ib = order.indexOf(b);
          if (ia < 0 && ib < 0) return items.indexOf(a) - items.indexOf(b); // 自由項目同士は元の順
          if (ia < 0) return 1; // 自由項目は固定列の後ろ
          if (ib < 0) return -1;
          return ia - ib;
        });
      }
      function renderEntry() {
        var co = document.getElementById("inputCompany").value;
        // ★候補の一覧は 画面を組み立てる前に作る★ 2026-08-21
        //   後で呼んでいたので「よく行く所」が1回目に出なかった（自分で作ったバグ）。
        refreshDestList(co);
        var items = inputItemsOrder(MASTER[co].items);
        var body = entryRows
          .map(function (row, i) {
            var fields = items
              .map(function (k) {
                var def = FIELD_DEFS.filter(function (f) {
                  return f.key === k;
                })[0];
                var t = def ? def.type : "text";
                var sizeCls = k === "行き先" || k === "名前" ? "ef-wide" : "ef-narrow";
                var inp;
                if (t === "date") {
                  // カレンダーで選択・内部はISO保持・表示は M/D（6/15）
                  // ★AI の 行は 年まで 出す★（年の 読み違いを 見落とさない・v1 止3）
                  var md = row._ai ? Shitagaki.hyoujiHi(row[k]) : mdShort(row[k]);
                  inp =
                    '<div class="date-wrap">' +
                    '<span class="date-show' +
                    (md ? "" : " empty") +
                    '">' +
                    (md ? esc(md) : "日付を選ぶ") +
                    "</span>" +
                    '<input class="date-input" type="date" value="' +
                    esc(row[k]) +
                    '" ' +
                    NOFILL +
                    ' onclick="try{this.showPicker()}catch(e){}" onchange="setEntryDate(' +
                    i +
                    ",'" +
                    k +
                    "',this)\"></div>";
                } else if (t === "number") {
                  inp =
                    '<input class="entry-inp num" inputmode="numeric" placeholder="" value="' +
                    esc(row[k]) +
                    '" ' +
                    NOFILL +
                    ' oninput="setEntryNum(' +
                    i +
                    ",'" +
                    k +
                    "',this)\">";
                } else if (k === "行き先") {
                  // 行き先は自前のサジェスト（タップで履歴表示・打つと絞り込み・iOSでも確実）
                  // ★2026-08-21 A3-③ 空欄を並べて埋めさせない★
                  //   その会社で よく出る行き先を ★先に3つ出す★（押すとそのまま入る）。
                  //   出どころは refreshDestList（頻度順）＝サジェストと同じ1本。
                  inp =
                    '<div class="sugg-wrap">' +
                    '<input class="entry-inp" value="' +
                    esc(row[k]) +
                    '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
                    ' oninput="onDestInput(' +
                    i +
                    ',this)" onfocus="onDestInput(' +
                    i +
                    ',this)" onblur="hideSugg(this)">' +
                    '<div class="sugg-box"></div>' +
                    "</div>" +
                    destOftenHtml(i);
                } else {
                  inp =
                    '<input class="entry-inp" value="' +
                    esc(row[k]) +
                    '" ' +
                    NOFILL +
                    ' oninput="setEntry(' +
                    i +
                    ",'" +
                    k +
                    "',this.value)\">";
                }
                // ★AI が 読めなかった 欄＝赤い 枠＋訳／金額の 候補＝番号で 選ぶ 釦★（AI 由来の 字は 全部 esc）
                var wake = row._ai && row._yomenai ? row._yomenai[k] : "";
                var ato = wake ? '<span class="ef-wake">' + esc(wake) + "</span>" : "";
                if (row._ai && k === "金額" && row._kouho && row._kouho.length) {
                  ato +=
                    '<div class="ai-kouho">' +
                    row._kouho
                      .map(function (c, j) {
                        return (
                          '<button type="button" onclick="pickKouho(' +
                          i +
                          "," +
                          j +
                          ')">' +
                          esc(c.ji) +
                          " " +
                          esc(Number(c.atai).toLocaleString()) +
                          "円</button>"
                        );
                      })
                      .join("") +
                    '<span class="ef-wake" style="color: #555555">（この会社は' +
                    esc(MASTER[co].taxMode === "外税" ? "外税" : "内税") +
                    "）</span></div>";
                }
                return (
                  '<div class="ef ' +
                  sizeCls +
                  (wake ? " ef-yomenai" : "") +
                  '"><span class="ef-lb">' +
                  esc(MeisaiEngine.utils.labelOf(MASTER[co], k)) +
                  "</span>" +
                  inp +
                  ato +
                  "</div>"
                );
              })
              .join("");
            // ★車（任意）★ 2026-10-23＝札が読めた時だけ出す（既定は空＝今まで通り「手で入れた分」）
            if (KURUMA_FUDA.length)
              fields +=
                '<div class="ef ef-narrow"><span class="ef-lb">車</span>' +
                '<select class="entry-inp entry-car" onchange="setEntryCar(' +
                i +
                ',this)">' +
                kurumaOptsHtml(row.dk_car || "") +
                "</select></div>";
            // ★AI の 行★ 出どころの 印・年の 印・行ごとの「確かめた」（押すまで 保存しない＝hozonMon）
            var aiMei = "",
              aiKaku = "";
            if (row._ai) {
              aiMei =
                '<span class="ai-row-mei">AI の下書き（' +
                esc(row._kaisha || "") +
                " の" +
                (row._ai === "koe" ? "声・文" : "伝票") +
                "から）</span>" +
                (row._toshi ? '<span class="ai-row-toshi">年を確かめて</span>' : "");
              aiKaku =
                '<label class="ai-kakunin"><input type="checkbox" class="ai-kakunin-cb"' +
                (row._kakunin ? " checked" : "") +
                ' onchange="aiSgKakunin(' +
                i +
                ',this)"> 伝票と見比べて 確かめた</label>';
            }
            return (
              '<div class="entry-line' +
              (row._ai ? " ai-row" : "") +
              '">' +
              '<div class="entry-line-hd"><span class="entry-line-no">明細 ' +
              (i + 1) +
              aiMei +
              '</span><button class="entry-del" onclick="delEntry(' +
              i +
              ')" aria-label="削除">✕</button></div>' +
              '<div class="ef-grid">' +
              fields +
              "</div>" +
              aiKaku +
              "</div>"
            );
          })
          .join("");
        document.getElementById("entryBody").innerHTML = body;
      }
      /* ★よく行く所を先に3つ出す★（2026-08-21 A3-③ 「聞いてあげる。埋めさせない」）
            ・出どころは DEST_ALL（refreshDestList が作る 頻度順）＝★サジェストと同じ1本★
            ・押すと その行の行き先に入る（打ち直さなくてよい）
            ・まだ1件も明細が無い時は 何も出さない（★作り物の候補を見せない★） */
