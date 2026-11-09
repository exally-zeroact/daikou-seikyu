      // ★直した金額を ダイコメ（事務所の売上）へ 戻す★ 2026-09-03
      //   ★戻すかどうかは エンジンが 決める★（決まりを 2か所に 置かない）
      //   ★戻す先★ supabase/functions/dk-fix-fare（ダイコメ側・service_role で 直す）
      //     ・その代行1件の 金額 と その業務の 合計だけ 直す
      //     ・★距離には 1mmも 触らない★
      //   ★失敗しても 画面は 止めない★（倉庫が 落ちていても 一覧の 保存は 済んでいる）
      // ★★黙らない★★ 2026-10-14（指示役：失敗を 読む 所が 0 だった＝成功の 時だけ toast）
      //   呼ぶ 所は ここ 1か所。結果は 全部 _dkFixKotae（受け口 1つ）で 読み、揃っていない 時は
      //   一覧の 頭に 1行ずつ 帯を 出す（toast は 1.7秒で 消える ので 失敗には 使わない）。
      //   「もう一度 送る」は 何も 直っていないと 言い切れる 時だけ（直った 後に 押すと 事務所が
      //    後から 直した 売上を 外して しまう＝対立役）。
      async function _jimushoHeModosu(ato, mae) {
        var U = window.MeisaiEngine && window.MeisaiEngine.utils;
        if (!U || typeof U.shouldPushFare !== "function") {
          // 部品が 読めない＝戻すべきか 決められない（前は 黙って 戻った）
          if (ato && ato.dk_source === "daikome") _dkFixKotae(ato, { kind: "buhin" });
          return;
        }
        if (!U.shouldPushFare(mae, ato)) return;
        await _dkFixOkuru(ato);
      }
      var _dkFixOkuruChu = {}; // 今 送っている 行（同じ 行を 2本 同時に 送らない）
      var _dkFixMata = {}; // 送っている 間に もう一度 直された 行（終わった 後に 1回 送り直す）
      var DK_FIX_MATSU_MS = 20000; // 返事を 待つ 長さ（来なければ 届いたか 分からない と 出す）
      async function _dkFixOkuru(ato) {
        var id = ato && ato.id;
        if (!id) return;
        if (_dkFixOkuruChu[id]) {
          // ★黙って 捨てない★ 2026-10-14（対立役：1回目が 前の 金額を 読んでいたら 事務所は 前の 金額の まま）
          _dkFixMata[id] = ato;
          return;
        }
        _dkFixOkuruChu[id] = true;
        try {
          var ses = await SB.auth.getSession(); // 鍵は 毎回 取り直す（古い 鍵を 掴まない）
          var tok = ses && ses.data && ses.data.session && ses.data.session.access_token;
          if (!tok) return _dkFixKotae(ato, { kind: "login" });
          var ctl = typeof AbortController === "function" ? new AbortController() : null;
          var tm = setTimeout(function () {
            if (ctl) ctl.abort();
          }, DK_FIX_MATSU_MS);
          var res;
          try {
            res = await fetch(SUPABASE_URL + "/functions/v1/dk-fix-fare", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + tok,
                apikey: SUPABASE_ANON,
              },
              body: JSON.stringify({ meisai_id: id }),
              signal: ctl ? ctl.signal : undefined,
            });
          } catch (e) {
            clearTimeout(tm);
            return _dkFixKotae(ato, { kind: "todoku", err: e && e.message });
          }
          clearTimeout(tm);
          var j = await res.json().catch(function () {
            return null;
          });
          _dkFixKotae(ato, { kind: "henji", status: res.status, httpOk: res.ok, j: j });
        } catch (e) {
          _dkFixKotae(ato, { kind: "todoku", err: e && e.message });
        } finally {
          delete _dkFixOkuruChu[id];
          _dkFixObi(); // 送り中の 印を 外したので ボタンを 押せる 形に 描き直す
          if (_dkFixMata[id]) {
            var tsugi = _dkFixMata[id];
            delete _dkFixMata[id];
            // 消した 行は 送り直さない
            if (
              DB.some(function (x) {
                return x.id === id;
              })
            )
              _dkFixOkuru(tsugi); // 最後に 直した 金額で もう 1回（関数は 倉庫の 今の 金額を 読む）
          }
        }
      }
      // ★受け口★ 結果を 1つの 形に 読む。成功は res.ok かつ j.ok===true の 時だけ（知らない 形は 全部 揃っていない 側）
      function _dkFixYomu(k) {
        var SOROWANAI = "請求書と 事務所の 売上が 揃っていません。";
        var KAKUNIN = "事務所の 売上を ダイコメの 給料の「時数を入れる」で 確かめてください。";
        if (k.kind === "buhin")
          return {
            dame: true,
            okuru: false,
            ji:
              "画面の 部品が 読めず、事務所の 売上へ 送れませんでした。" +
              SOROWANAI +
              "画面を 読み込み直して、もう一度 金額を 保存してください。",
          };
        if (k.kind === "login")
          return {
            dame: true,
            okuru: true,
            ji:
              "ログインが 切れていて 事務所の 売上へ 送れませんでした（何も 直っていません）。" +
              SOROWANAI +
              "ログインし直してから「もう一度 事務所へ 送る」を 押してください。",
          };
        if (k.kind === "todoku")
          return {
            dame: true,
            okuru: false,
            ji:
              "事務所に 届いたか 分かりません（通信が 切れたか 返事が 来ませんでした）。" +
              SOROWANAI +
              KAKUNIN,
          };
        var j = k.j || null;
        var r = j && typeof j.reason === "string" ? j.reason : "";
        if (k.httpOk && j && j.ok === true) {
          if (Number(j.updated) > 0)
            return { dame: false, seikou: true, hazushita: Number(j.uriage_hazushita) || 0 };
          if (r === "not_daikome" || r === "no_amount") return { dame: false }; // 戻す 先が 無い 行（何も 触らない）
          if (r === "no_shift" || r === "no_trip" || r === "bad_ref")
            return {
              dame: true,
              okuru: false,
              ji:
                "事務所の 記録が 見つからず、売上へ 戻せませんでした（何も 直っていません）。" +
                SOROWANAI,
            };
          return {
            dame: true,
            okuru: false,
            ji: "事務所から 分からない 返事が 来ました。" + SOROWANAI + KAKUNIN,
          };
        }
        // 失敗
        if (r === "uriage_reset_failed")
          return {
            dame: true,
            okuru: false,
            ji:
              "代行の 金額と 業務の 合計は 事務所に 戻りましたが、事務所が 前に 直した 売上を 外せませんでした。" +
              SOROWANAI +
              KAKUNIN,
          };
        if (r === "shift_update_failed" || (r === "read_failed" && j && j.at === "trips"))
          return {
            dame: true,
            okuru: false,
            ji:
              "代行の 金額は 事務所に 戻りましたが、業務の 合計が 直っていません。" +
              SOROWANAI +
              KAKUNIN,
          };
        if (k.status === 401)
          return {
            dame: true,
            okuru: true,
            ji:
              "ログインが 切れていて 事務所の 売上を 直せませんでした（何も 直っていません）。" +
              SOROWANAI +
              "ログインし直してから「もう一度 事務所へ 送る」を 押してください。",
          };
        if (r === "trip_update_failed" || r === "read_failed")
          return {
            dame: true,
            okuru: true,
            ji:
              "事務所の 売上を 直せませんでした（何も 直っていません）。" +
              SOROWANAI +
              "「もう一度 事務所へ 送る」を 押してください。",
          };
        if (k.status >= 400 && k.status < 500 && r)
          return {
            dame: true,
            okuru: false,
            ji: "事務所が 受け付けませんでした（何も 直っていません）。" + SOROWANAI,
          };
        return {
          dame: true,
          okuru: false,
          ji: "事務所の 売上を 直せたか 分かりません。" + SOROWANAI + KAKUNIN,
        };
      }
      var DK_FIX_KEY = "dkFixSorowanai"; // 揃っていない 行（読み込み直しても 知らせる）
      // ★ログインした 人ごとに 分ける★ 2026-10-14（対立役：同じ 端末で 別の 業者が 入ると 前の 人の 帯が 見えた）
      function _dkFixKagi() {
        return DK_FIX_KEY + ":" + String(CURRENT_ACCOUNT || "");
      }
      function _dkFixKiroku() {
        try {
          return JSON.parse(localStorage.getItem(_dkFixKagi()) || "{}") || {};
        } catch (e) {
          return {};
        }
      }
      function _dkFixKaku(m) {
        try {
          localStorage.setItem(_dkFixKagi(), JSON.stringify(m));
        } catch (e) {}
      }
      function _dkFixKotae(ato, k) {
        var y = _dkFixYomu(k);
        var m = _dkFixKiroku();
        // ★返事が 来る 前に 行を 消していたら 帯を 書かない★ 2026-10-14（対立役：消した 行の 帯が 出直した）
        var aru = DB.some(function (x) {
          return x.id === ato.id;
        });
        if (!aru) {
          delete m[ato.id];
          _dkFixKaku(m);
          _dkFixObi();
          if (window.console && console.warn)
            console.warn("[dk-fix-fare] 消した 行の 返事", ato.id);
          return y;
        }
        if (!y.dame) {
          delete m[ato.id];
          // ★事務所が 給料の 画面で 直していた 売上を この 直しで 外した 時は 知らせる★ 2026-10-14（指示役）
          //   外す 事 その物は 司さんの 決め（後から 直した 方が 勝つ）の 通り＝変えない。知らせる だけ。
          //   件数は dk-fix-fare の 返事（uriage_hazushita）の まま
          if (y.hazushita > 0)
            m[ato.id] = {
              shirase: true,
              ji:
                "事務所が 給料の 画面で 直していた 売上を、この 直しで 外しました（" +
                y.hazushita +
                "件）。事務所の 売上は この 直しを 入れた 合計に なりました。",
              na: _dkFixNa(ato),
              at: new Date().toISOString(),
            };
          _dkFixKaku(m);
          _dkFixObi();
          if (y.seikou) toast("事務所の売上も 直しました");
          return y;
        }
        m[ato.id] = {
          ji: y.ji,
          okuru: !!y.okuru,
          na: _dkFixNa(ato),
          at: new Date().toISOString(),
        };
        _dkFixKaku(m);
        _dkFixObi();
        if (window.console && console.warn)
          console.warn("[dk-fix-fare]", ato.id, k && k.status, k && k.j && k.j.reason, y.ji);
        return y;
      }
      function _dkFixNa(ato) {
        return [
          ato.日付 || "",
          ato.会社名 || "",
          ato.金額 === "" || ato.金額 == null ? "" : "¥" + Number(ato.金額).toLocaleString(),
        ]
          .filter(Boolean)
          .join(" ");
      }
