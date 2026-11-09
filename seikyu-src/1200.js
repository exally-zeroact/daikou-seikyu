      // 自社情報は「自由な行」。要らない行は消す、足したい行は足す＝定義駆動。
      // ★★自社情報の 行が 無い 客の 既定＝会社名・振込先・登録番号は 空★★ 2026-10-08（司さん「自社情報を入れて下さいと警告をだせや」）
      //   前は defaultIssuer()＝ZEROact の 会社名・住所・振込先・登録番号が 入り、そのまま 他の 客の 請求書に 刷られた
      //   （様式・字の 大きさを 1回 触ると ZEROact の 字ごと その 客の 行に 保存された）
      function blankIssuer() {
        var b = defaultIssuer();
        b.issuer = "";
        b.bank = "";
        b.regno = "";
        delete b.regnoPrefix;
        delete b.regnoIdx;
        return b;
      }
      // ★自社情報が 入っていない 時の 文（真＝止める）★
      function jishaNg(s) {
        var naki = [];
        if (!String((s && s.issuer) || "").trim()) naki.push("会社名・住所");
        if (!String((s && s.bank) || "").trim()) naki.push("振込先");
        if (!regnoOf(s)) naki.push("登録番号");
        if (naki.length)
          return "自社情報を入れてください（設定 ▸ 自社情報）。" + naki.join("・") + " が 空です。";
        return regnoNg(s);
      }
      function defaultIssuer() {
        // ★既定も 専用の欄に移した形で返す（読む所を1本にする）★
        return migrateRegno({
          issuer: "", // ★既定は 空★（ZEROact の 字を 他の 客に 出さない・2026-10-08）
          bank: "",
          issuerAlign: "left",
          bankAlign: "left",
          alignIssuer: "auto", // 自社情報ブロックの位置（auto=テンプレ既定・前に編集タブで変えた値は残る）
          lineIssuer: "auto", // 自社情報の行の並び（auto=位置と同じ）
          posGrand: "auto", // ご請求金額の位置（auto=左）
          posLead: "auto", // 説明文の位置（auto=左）
          posDue: "auto", // お支払期限の位置（auto=テンプレ既定）
          dateEra: "seireki", // 日付の表記: seireki(2026/2/1) / reiwa(令和8年2月1日)
          showInvoiceNo: false, // 請求書番号を表示するか
          showPaymentDue: false, // お支払期限（有効期限）を表示するか
          paymentDue: "", // お支払期限の日付（ISO "2026-06-30"）
          paymentDueEra: "seireki", // お支払期限の表記: seireki / reiwa
          hanko: "", // 表示・出力用（白抜き処理後）
          hankoRaw: "", // 元画像（白抜きON/OFF切替時に再処理する素）
          hankoBg: "auto", // 背景白抜き: auto / on / off
          hankoSizeMm: 21, // 本物の判子サイズ(mm)
          logo: "", // 自社ロゴ 表示・出力用（白抜き処理後）
          logoRaw: "", // ロゴ元画像（再処理用）
          logoTrimmed: false, // 透明余白トリミング済みか（一度だけ実行）
          logoBg: "auto", // ロゴ背景白抜き: auto / on / off
          logoSizeMm: 40, // ロゴの大きさ(mm)・基本値（UIで変更可）
          pdfFont: "BIZ UDPゴシック", // 請求書PDFの書体（Excel同梱のBIZ UD系から選択）
          pdfDesign: "elegant", // 請求書デザイン（elegant / classic）
          elegantVariant: "logo", // エレガント時の種類（logo / plain）
          classicVariant: "diag_logo", // クラシック時の種類（diag_logo / diag_plain / center）
          headerStyle: "A", // 旧フラグ（互換用）
        });
      }
      function loadIssuer() {
        try {
          ISSUER_SETTINGS = JSON.parse(localStorage.getItem(ISSUER_KEY)) || {};
          Object.keys(ISSUER_SETTINGS).forEach(function (k) {
            migrateRegno(ISSUER_SETTINGS[k]);
          });
        } catch (e) {
          ISSUER_SETTINGS = {};
        }
        if (!ISSUER_SETTINGS[CURRENT_ACCOUNT]) ISSUER_SETTINGS[CURRENT_ACCOUNT] = blankIssuer();
        migrateIssuer();
      }
      // 旧「固定8項目」形式があれば自由行形式へ変換／デザイン項目の補完
      function migrateIssuer() {
        var changed = false;
        Object.keys(ISSUER_SETTINGS).forEach(function (acc) {
          var s = ISSUER_SETTINGS[acc];
          if (!s) return;
          // デザイン2軸の補完（旧データに無ければ既定を焼く）。旧 defaultTemplate からも吸収。
          if (s.pdfDesign === undefined) {
            s.pdfDesign = "elegant";
            changed = true;
          }
          if (s.elegantVariant === undefined) {
            s.elegantVariant = "logo";
            changed = true;
          }
          if (s.classicVariant === undefined) {
            // 旧 defaultTemplate(A_logo/A_plain/B_center) を classic 種類へ移行
            var dt = s.defaultTemplate;
            s.classicVariant =
              dt === "B_center" ? "center" : dt === "A_plain" ? "diag_plain" : "diag_logo";
            changed = true;
          }
          if (s && s.name1 !== undefined && s.issuer === undefined) {
            s.issuer = [s.name1, s.name2, s.zip, s.addr, s.tel, s.regno].filter(Boolean).join("\n");
            s.bank = [s.bank, s.holder].filter(Boolean).join("\n");
            delete s.name1;
            delete s.name2;
            delete s.zip;
            delete s.addr;
            delete s.tel;
            delete s.regno;
            delete s.holder;
            changed = true;
          }
        });
        if (changed) saveIssuer();
      }
      async function saveIssuer() {
        // ★自社情報を 読めていない 時は 書かない★（既定の 値で 本物の 判子・振込先・登録番号を 上書きした・対立役 A2）
        if (yomenaiTomeru(["issuer"], "自社情報の 保存")) return;
        // 自社情報（1業者1行）をクラウドにupsert
        var cfg = ISSUER_SETTINGS[CURRENT_ACCOUNT] || blankIssuer();
        var up = await SB.from("issuer").upsert(
          { user_id: CURRENT_ACCOUNT, config: cfg, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
        if (up.error) cloudErr("自社情報保存", up.error);
      }
      function currentIssuer() {
        return ISSUER_SETTINGS[CURRENT_ACCOUNT] || blankIssuer();
      }
      /* ===== 登録番号（適格請求書） ===================================================
            ★2026-08-11 まで 登録番号は「自社情報」の自由入力の1行に手で書いていた★。
              その行を消して PDF を押すと、警告も無く ★要件を満たさない紙が出た★（年1,300通）。
            ここで:
              ① 専用の欄(regno)に出す＝1行消して黙って消える形をやめる
              ② 空／形が違う（T+13桁でない）なら ★紙を出させない★
            ★紙は1文字も変えない★：欄に移した後も、刷る行は元と同じ位置・同じ文字。
         ============================================================================= */
      var REGNO_RE = /^T\d{13}$/; // 適格請求書発行事業者の登録番号（T＋13桁）
      var REGNO_PREFIX_DEFAULT = "登録番号：";
      // 自由入力の中から「登録番号」の行を見つけて {idx, prefix, value} を返す（無ければ null）
      function findRegnoLine(text) {
        var ls = String(text || "").split(/\r?\n/);
        for (var i = 0; i < ls.length; i++) {
          if (ls[i].indexOf("登録番号") < 0) continue;
          var m = ls[i].match(/^(\s*登録番号\s*[:：]?\s*)(.*)$/);
          if (!m) continue;
          return { idx: i, prefix: m[1].replace(/^\s+/, ""), value: m[2].trim() };
        }
        return null;
      }
      // ★専用の欄へ移す（1度だけ）★ 元の行は自由入力から外し、位置と見出しを覚えておく
      function migrateRegno(s) {
        if (!s || s.regno != null) return s; // 既に移してある
        var f = findRegnoLine(s.issuer);
        if (!f) {
          s.regno = ""; // 元から無い＝空として持つ（黙って出させないため）
          return s;
        }
        var ls = String(s.issuer || "").split(/\r?\n/);
        ls.splice(f.idx, 1);
        s.issuer = ls.join("\n");
        s.regno = f.value;
        s.regnoPrefix = f.prefix;
        s.regnoIdx = f.idx; // 元の位置に戻して刷る＝紙が動かない
        return s;
      }
      // 今の登録番号（未移行でも読めるようにする）
      function regnoOf(s) {
        if (s && s.regno != null) return String(s.regno).trim();
        var f = findRegnoLine(s && s.issuer);
        return f ? f.value : "";
      }
      // ★出させない理由★（問題なければ null）
      function regnoNg(s) {
        var v = regnoOf(s);
        if (!v) return "登録番号が入っていません";
        if (REGNO_RE.test(v)) return null;
        if (/[Ｔ０-９]/.test(v)) return "登録番号が全角です（半角の T＋13桁で入れてください）";
        if (/^T/.test(v)) return "登録番号の桁数が違います（T＋13桁・今は " + v.length + "文字）";
        return "登録番号の形が違います（T で始まる13桁の数字）";
      }
      // 刷る行＝自由入力の行に、登録番号を ★元の位置★ で戻した物
      function issuerLinesOf(s) {
        var base = String(s && s.issuer ? s.issuer : "").split(/\r?\n/);
        var v = regnoOf(s);
        if (s && s.regno != null && v) {
          var idx = Number(s.regnoIdx);
          if (!(idx >= 0 && idx <= base.length)) idx = base.length;
          base.splice(idx, 0, (s.regnoPrefix || REGNO_PREFIX_DEFAULT) + v);
        }
        return base
          .map(function (l) {
            return l.trim();
          })
          .filter(Boolean);
      }
      function splitLines(t) {
        return String(t || "")
          .split(/\r?\n/)
          .map(function (l) {
            return l.trim();
          })
          .filter(Boolean);
      }
      // ===== 請求書デザイン（2軸）：pdfDesign(elegant/classic) × variant（種類） =====
      //  ・elegant＝中央タイトル＋ひし形・淡ミント表。種類はロゴ有/無の2つ（headerStyleは無視される設計）。
      //  ・classic＝緑ヘッダー帯＋横罫の伝統型。種類は対角ロゴ有/対角ロゴ無/中央の3つ。
      //  状態は (pdfDesign, elegantVariant, classicVariant) の2次元で持つ＝デザインを跨いでも化けない。
      /* ★人に見せる名前は「形」で言う★（2026-08-18 司さん／指示役 ④）
            中の名前（elegant / classic）は データにそのまま残す＝過去の設定が化けない。
            見張り: tests/e2e/template-thumbs.spec.js（人に見せる字に中の名前が0件） */
      var DESIGN_LABELS = { elegant: "線ひかえめ", classic: "枠と帯" };
      /* ===== 見本のサムネ ─ ★実際の紙を そのまま縮めて見せる★ ==========================
            ★2026-08-18 司さん★
              「他のアプリは実際の見せとんのに なんでこれだけ意味わからんやり方なんど」
              「もともとちゃんと見せれとったろが」
            ここは 2026-08-11 まで tpl_〈様式〉_〈種類〉.png を読んでいたが ★5枚とも404★ だった。
            その後は ★線だけの作り物（SVG）★ を描いていた＝実物とは別物で、選ぶ時に嘘になる。
            ⇒ ★本物のPDFを作って1ページ目を縮めて描く★。紙を直せば見本も同時に直る（古くならない）。
              ・データは ★その人自身の明細★（一番新しい月）。1件も無い時だけ、形が分かる最小の見本。
              ・作るのは開いた時だけ・1枚ずつ・同じ物はキャッシュ（フォントは請求タブと同じ物を使い回す）
            見張り: tests/e2e/template-thumbs.spec.js（★本物の紙が描かれたか★を実際の絵で測る）
         ============================================================================= */
      var _tplThumbCache = {}; // key(design|variant|会社|月|件数) -> PDFのバイト
      function tplThumbBox(design, v) {
        return (
          '<div class="tpl-thumb tpl-thumb-real" data-design="' +
          esc(design) +
          '" data-variant="' +
          esc(v.key) +
          '" role="img" aria-label="' +
          esc(v.label) +
          ' の見本（実際の紙）"><span class="tpl-thumb-msg">見本を作っています…</span></div>'
        );
      }
      // 見本に使う明細＝★その人自身の物★（会社を指定されればその会社／無ければ一番新しい月）
      function tplSampleRows(co) {
        var mine = DB.filter(function (r) {
          return r.account_id === CURRENT_ACCOUNT && (!co || r.会社名 === co);
        });
        if (!mine.length && co)
          mine = DB.filter(function (r) {
            return r.account_id === CURRENT_ACCOUNT;
          });
        if (!mine.length) return null;
        var months = {};
        mine.forEach(function (r) {
          if (r.日付) months[String(r.日付).slice(0, 7)] = 1;
        });
        var month = Object.keys(months).sort().pop();
        if (!month) return null;
        var rows = mine
          .filter(function (r) {
            return String(r.日付 || "").slice(0, 7) === month;
          })
          .sort(function (a, b) {
            return (
              (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
            );
          });
        if (!rows.length) return null;
        var company = co || rows[0].会社名;
        rows = rows
          .filter(function (r) {
            return r.会社名 === company;
          })
          .slice(0, 8);
        if (!rows.length) return null;
        return { co: company, month: month, rows: rows };
      }
