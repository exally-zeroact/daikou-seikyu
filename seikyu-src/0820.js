      // ★★ここは司さんの本番です。倉庫を切り替えないでください★★ 2026-08-06
      //   repo名もURLも "test" が付いていますが、★このアプリには本番用の別の家がありません★。
      //   実測(2026-08-06):
      //     exally-test.vercel.app/daikou-seikyu.html … 200 ← ここだけ
      //     exally / exally-staging / daikome-jimusho … 全部404
      //   ＝この住所で司さんが毎日 請求書を作っています(明細1080件 / 会社24件)。
      //
      //   ★一度これをテストDBへ向け替えて事故になりました★
      //     画面はいつもどおり開き、エラーも出ず、★中身だけ空になる★。
      //     アプリは「まだ誰も居ない」と判断してログイン画面を出し、
      //     司さんが自分の画面に入れなくなりました。
      //   切り替えるなら★先にテスト用の家(別ホスト)を建ててから★。
      //   tests/warehouse-pointer.test.js が、ここが変わったら赤にします。
      var SUPABASE_URL = "https://tnfwipbgfgjaymlszeid.supabase.co";
      var SUPABASE_ANON =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek";
      // テストは偽のクラウドを差し込む（本物に通信せず配線だけ確かめる）
      // ★2026-11-14 件⑥ 倉庫へ 出る 手前の 口（lib/kagi-fetch.js）★
      //   鍵が 切れると supabase-js は 公開鍵で 倉庫へ 出る＝倉庫は 更新・削除を 0行の 200 で 返し
      //   画面は「保存しました」と 言うのに 何も 入らない（テスト倉庫で 測った）。送る 鍵そのものを
      //   口で 見て、入った人の 鍵の 時だけ 通す。止めたら 板（kagiKireta）で 言う。
      if (!window.__EXALLY_FAKE_SB__ && !window.KagiFetch)
        throw new Error("lib/kagi-fetch.js が 読めていません（口が 無いまま 倉庫へ 出さない）");
      var SB =
        window.__EXALLY_FAKE_SB__ ||
        window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
          global: {
            fetch: window.KagiFetch.tsukuru({
              url: SUPABASE_URL,
              anon: SUPABASE_ANON,
              hito: function () {
                return LOGGED_IN_ID;
              },
              kireta: function () {
                kagiKireta();
              },
              chigau: function () {
                kagiChigatta();
              },
              tootta: function () {
                T_TOOTTA = performance.now();
              },
              fetch: window.fetch.bind(window),
            }),
          },
        });

      /* ===================================================================
      定数・固定情報
      ─ 器(スキーマ)と帳票ロジックは meisai-engine.js（移植可能コア）が一次情報。
        UI側はそれを参照するだけ＝定義の二重管理をしない。
      =================================================================== */
      var FIELD_DEFS = MeisaiEngine.FIELD_DEFS; // DBの器（固定・最大集合）
      var DEFAULT_WIDTH = MeisaiEngine.DEFAULT_WIDTH;
      var ROWS_PER_PAGE = 22; // 1ページの明細スロット数（実物Excel基準）
      var DB_KEY = "daiko_db_v1";
      var ISSUER_KEY = "daiko_issuer_v1";
      var MASTER_KEY = "daiko_master_v1";
      var PAY_KEY = "daiko_payments_v1";
      var LAST_CO_KEY = "daiko_lastco_v1"; // 入力で直近に使った会社（自動選択用）
      var CO_RECENT_KEY = "daiko_co_recent_v1"; // 会社→最終使用時刻 {会社名:epochMs}（最近使った順セレクト用・端末ローカル）
      // ★明細保存した会社を「最近使った」として記録（端末ローカル・クラウド非同期）。
      //   JSON.parse失敗 と setItem例外 を別々に握り潰す（壊れた値で記録が永久停止しないように）。
      function recordCompanyUse(name) {
        if (!name) return;
        var map = {};
        try {
          map = JSON.parse(localStorage.getItem(CO_RECENT_KEY) || "{}") || {};
          if (typeof map !== "object") map = {};
        } catch (e) {
          map = {};
        }
        map[name] = Date.now();
        // 上限50件で古いものを間引き（肥大防止）
        var keys = Object.keys(map);
        if (keys.length > 50) {
          keys
            .sort(function (a, b) {
              return map[b] - map[a];
            })
            .slice(50)
            .forEach(function (k) {
              delete map[k];
            });
        }
        try {
          localStorage.setItem(CO_RECENT_KEY, JSON.stringify(map));
        } catch (e2) {}
      }
      // 最近使った会社を新しい順に最大n社（names のうち記録があるものだけ）。
      function topRecentCompanies(names, n) {
        var map = {};
        try {
          map = JSON.parse(localStorage.getItem(CO_RECENT_KEY) || "{}") || {};
          if (typeof map !== "object") map = {};
        } catch (e) {
          map = {};
        }
        return names
          .filter(function (nm) {
            return map[nm] != null;
          })
          .sort(function (a, b) {
            return map[b] - map[a]; // epoch降順（Array.sortは安定）
          })
          .slice(0, n);
      }
      // ★会社セレクトの<option>群を1枚のリストで返す：最近使った会社を使った順(新→古)で上へ寄せ、
      //   残りは元の順で下に。重複なし・ラベルなし。入力/一覧/編集すべてで共通＝「使った順に上へ」を全箇所統一。
      function _companyOptsHtml(names) {
        var opt = function (n) {
          return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
        };
        // 記録のある会社を全部、新しい順に。残りは names の元順を保つ。
        var recent = topRecentCompanies(names, names.length);
        var used = {};
        recent.forEach(function (n) {
          used[n] = 1;
        });
        var rest = names.filter(function (n) {
          return !used[n];
        });
        return recent.concat(rest).map(opt).join("");
      }

      // ===== テナント（マルチテナントの土台） =====
      // 本番ではログインアカウント(=代行業者)のIDが入る。練習台は単一アカウント固定。
      // 明細・会社マスタすべてに account_id を持たせ、将来のシャード/RLSキーにする。
      var CURRENT_ACCOUNT = "acct_local";

      // ★ZEROact の 会社名・住所・振込先・登録番号を コードに 置かない★ 2026-10-08（司さん「他のユーザーにZEROactの情報はあかんやろ」）
      //   自社情報は 客 ごとに 倉庫（issuer）から 読む だけ。無ければ 空＝「自社情報を入れてください」で 止める

      /* ===================================================================
      状態
      =================================================================== */
      var DB = []; // [{id,会社名,日付,行き先,金額,備考,距離,人数,名前}]
      var MASTER = {}; // { 会社名: {items:[],widths:{},lead,tableTitle,noteSummary,noteGroups} }
      var PAYMENTS = {}; // { "account::month::会社名": {paid,paidDate,note,updatedAt} } 入金記録(請求単位)
      var entryRows = []; // 入力画面の一時行

      /* ===================================================================
      永続化
      =================================================================== */
      /* ===================================================================
      クラウド(Supabase)データ層 ─ localStorageを置き換え。
      in-memory(DB/MASTER/PAYMENTS/ISSUER_SETTINGS)を作業状態にし、
      読込=ログイン時に一括fetch／書込=各操作でinsert/update/softdelete。
      日本語キー(会社名/日付…)↔英語列(company/date…)はここで写像する。
      =================================================================== */
      var STD_MEISAI_KEYS = [
        "id",
        "account_id",
        "会社名",
        "日付",
        "行き先",
        "金額",
        "備考",
        "距離",
        "人数",
        "名前",
        "_created", // 読み取り専用の並び替え鍵(created_at)。extraに書き込ませないため除外リストに入れる。
      ];
      function _numOrNull(v) {
        if (v === "" || v == null) return null;
        return Number(String(v).replace(/[^0-9.\-]/g, "")) || 0;
      }
      function meisaiFromDb(r) {
        var o = {
          id: r.id,
          account_id: r.user_id,
          会社名: r.company,
          日付: r.date || "",
          行き先: r.destination || "",
          金額: r.amount == null ? "" : r.amount,
          備考: r.note || "",
          距離: r.distance == null ? "" : r.distance,
          人数: r.people == null ? "" : r.people,
          名前: r.name || "",
          _created: r.created_at || "", // 一覧の並び替え用(同日付は登録の新しい順)。書き戻さない。
        };
        if (r.extra && typeof r.extra === "object")
          Object.keys(r.extra).forEach(function (k) {
            o[k] = r.extra[k];
          });
        return o;
      }
      function meisaiToDb(row) {
        var extra = {};
        Object.keys(row).forEach(function (k) {
          if (STD_MEISAI_KEYS.indexOf(k) < 0 && row[k] !== "" && row[k] != null) extra[k] = row[k];
        });
        return {
          company: row.会社名,
          date: row.日付 ? row.日付 : null,
          destination: row.行き先 || "",
          amount: _numOrNull(row.金額) || 0,
          note: row.備考 || "",
          distance: _numOrNull(row.距離),
          people: _numOrNull(row.人数),
          name: row.名前 || "",
          extra: extra,
        };
      }
      function companyToDb(co) {
        var m = MASTER[co];
        var config = {
          widths: m.widths || {},
          aligns: m.aligns || {},
          lead: m.lead || "",
          tableTitle: m.tableTitle || "",
          noteSummary: !!m.noteSummary,
          noteGroups: m.noteGroups || [],
          labels: m.labels || {},
        };
        // ★繰越・税の扱いも「選ばれた時だけ」足す＝選んでいない会社の中身は今までと完全に同じ★
        if (m.carryover) config.carryover = true;
        if (m.taxMode === "外税") config.taxMode = "外税";
        // ★入金の 消し込み★ 2026-11-03：振込名義（カナ・複数）と 振込手数料の 持ち方（こちら持ちの 時だけ）
        if (m.furikomiMeigi && m.furikomiMeigi.length)
          config.furikomiMeigi = m.furikomiMeigi.slice();
        if (m.tesuryoFutan === "kochira") config.tesuryoFutan = "kochira";
        // ★会社毎テンプレは「指定された時だけ」configに足す＝未設定会社のpayloadは従来と完全一致（バイト不変）。
        if (m.pdfDesign) {
          config.pdfDesign = m.pdfDesign;
          config.elegantVariant = m.elegantVariant || null;
          config.classicVariant = m.classicVariant || null;
        }
        return { name: co, items: m.items || [], config: config };
      }
      function cloudErr(where, e) {
        console.warn("cloud", where, e);
        toast("クラウド保存に失敗（" + where + "）通信を確認して再操作してください");
      }
      // ★成長テーブルを"全件"読む（max_rows=1000で黙って過少になるのを根治）。
      //   build=(from,to)=>完成クエリ。count:"exact"で総数を見て、総数に達するまで.rangeでバッチ取得。
      //   飲み屋(nomiya)のfetchAllと同型（フィルタ付きに対応するためビルダを受ける版）。
      async function fetchAllQ(build, kagi) {
        // ★読み切れなかった時は 黙って 通さず エラーで 返す★ 2026-11-02（対立役 注3）
        //   前は 件数に 届く 前の 空の ページ・count 無しで 黙って 抜けた＝欠けた 入金・明細で 本物の 紙が 出得た。
        //   エラーに すれば 会社・明細は 読み込み失敗の 画面、入金・控え・番号は YOMENAI の 門で 止まる。
        //   読む 間に 件数が 変わったら（別の 端末の 保存・消し）境目が ずれる ので 最初から 読み直す。
        //   ★件数が 同じ まま ずれる（1件 足して 1件 消す）時は 同じ 行が 2回 来る＝鍵の 重なりで 見て 読み直す★（対立役 注1）
        //   kagi＝行の 鍵（既定 id）。重なりが 無くて 件数が 合えば 抜けも 無い
        kagi =
          kagi ||
          function (x) {
            return x && x.id;
          };
        var size = 1000;
        for (var kai = 0; kai < 3; kai++) {
          var out = [];
          var from = 0;
          var kazu = null;
          var kawatta = false;
          for (;;) {
            var r = await build(from, from + size - 1);
            // ★途中で 件数が 減って 開始が 総数を 越えると PostgREST は 416（PGRST103）＝読み直す★（対立役 注2）
            if (r.error && kazu != null && (r.error.code === "PGRST103" || r.status === 416)) {
              kawatta = true;
              break;
            }
            if (r.error) return { data: null, error: r.error };
            if (r.count == null)
              return { data: null, error: { message: "件数が返らず 全部 読めたか 分からない" } };
            if (kazu == null) kazu = r.count;
            else if (r.count !== kazu) {
              kawatta = true;
              break;
            }
            var got = r.data || [];
            out = out.concat(got);
            if (out.length >= kazu) break;
            if (!got.length)
              return { data: null, error: { message: "途中で 切れて 全部 読めなかった" } };
            from += got.length; // ★size ではなく実受信数で進める(サーバ上限がページ幅より小さくても漏れない)
          }
          if (kawatta) continue;
          if (out.length !== kazu)
            return { data: null, error: { message: "件数と 読めた 数が 合わない" } };
          var mita = {};
          var kasanari = false;
          for (var j = 0; j < out.length; j++) {
            var k = kagi(out[j]);
            if (k == null)
              return { data: null, error: { message: "行の 鍵が 無く 重なりを 見られない" } };
            k = String(k);
            if (mita[k]) {
              kasanari = true;
              break;
            }
            mita[k] = true;
          }
          if (kasanari) continue;
          return { data: out, error: null, count: out.length };
        }
        return { data: null, error: { message: "読む 間に 中身が 変わり続けた" } };
      }
      /* ★明細と 入金を 倉庫から 全部 読む★ 2026-11-04（ログインの 時と 請求書を 出す 前の 見張りが 同じ 物を 使う・対立役 v2 注4）
            明細＝{db, error}（meisaiFromDb の 形）／入金＝{map, hajime, error}（hajime＝読み始めた 時刻・v2 注3） */
      async function kuraMeisaiYomu() {
        var m = await fetchAllQ(function (a, b) {
          return SB.from("meisai")
            .select("*", { count: "exact" })
            .is("deleted_at", null)
            .order("id")
            .range(a, b);
        });
        if (m.error) return { db: null, error: m.error };
        return { db: m.data.map(meisaiFromDb), error: null };
      }
      async function kuraPaymentsYomu() {
        var hajime = Date.now();
        var p = await fetchAllQ(function (a, b) {
          return SB.from("payments")
            .select("*", { count: "exact" })
            .is("deleted_at", null)
            .order("id")
            .range(a, b);
        });
        if (p.error) return { map: null, hajime: hajime, error: p.error };
        var map = {};
        p.data.forEach(function (r) {
          map[CURRENT_ACCOUNT + "::" + r.month + "::" + r.company] = payRecFromDb(r);
        });
        return { map: map, hajime: hajime, error: null };
      }
