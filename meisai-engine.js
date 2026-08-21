/* ==========================================================================
   meisai-engine.js  —  定義駆動 帳票エンジン（移植可能な共通モジュール）

   役割: 「会社マスタ(定義)」と「明細(DBの行)」を渡すと、請求書HTMLを返す純粋関数群。
   - DOM に一切依存しない（document を触らない＝文字列を組むだけ）
   - 会社名による if 分岐を書かない＝マスタの items 配列をループするだけ（定義駆動）
   - Exally本体 / ダイコメ(option) / Excel連携 のどこからでも load して使える

   公開API（window.MeisaiEngine）:
     .FIELD_DEFS / .DEFAULT_WIDTH / .ISSUER / .ROWS_PER_PAGE   … 器(スキーマ)と固定情報
     .buildInvoiceHTML(master, company, rows, month)          … 1社ぶんの請求書HTML(複数ページ)
     .buildMonth(master, db, month, accountId)                … 月＋アカウントで全社ぶんをまとめて生成
     .utils … {yen,comma,mdShort,inMonth,tax10,esc,reiwaIssueDate,labelOf,routeTextOf}
              ★routeTextOf = 行き先の文字を作る唯一の所（一覧・紙・Excel が同じ物を呼ぶ）★
   ========================================================================== */
(function (root) {
  "use strict";

  // ===== 器(固定スキーマ)・固定情報 =====
  var FIELD_DEFS = [
    { key: "日付", type: "date" },
    { key: "行き先", type: "text" },
    { key: "金額", type: "number" },
    { key: "備考", type: "text" },
    { key: "距離", type: "number" },
    { key: "人数", type: "number" },
    { key: "名前", type: "text" },
  ];
  var DEFAULT_WIDTH = { 日付: 64, 行き先: 240, 金額: 100, 備考: 80, 距離: 80, 人数: 64, 名前: 96 };
  var ROWS_PER_PAGE = 22; // 1ページの明細スロット数（実物Excel基準）
  var ISSUER = {
    lines: [
      "合同会社ZEROact",
      "ZERO代行",
      "〒794-0018",
      "今治市本町7-3-40　00コーポ1号",
      "TEL090-5716-1946",
      "登録番号：T3500003003293",
    ],
    bank: ["お振込先", "伊予銀行　今治支店　普通　4160657", "ド）ゼロアクト"],
  };

  // ===== 純粋ユーティリティ =====
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
    var p = String(iso).split("-");
    return Number(p[1]) + "/" + Number(p[2]);
  }
  function inMonth(iso, month) {
    return iso && month && iso.slice(0, 7) === month;
  }
  /* ★消費税の率は ここ1つ★（2026-08-12 指示役）
     率を文字で書くと、率が変わった日・軽減税率が混ざった日に ★言葉だけ嘘になる★。
     計算にも 紙の文言にも ★同じ TAX_RATE を使う★＝"10%" と書かない。 */
  var TAX_RATE = 10;
  function tax10(total) {
    return Math.round((total * TAX_RATE) / (100 + TAX_RATE));
  } // 内税の内消費税（既定の率）

  /* ★請求の合計は ここだけで足す★（2026-08-11）
     それまで ★4か所が別々に足していた★:
       invoice-pdf.js の tax10（エレガント/クラシックで2回 使用）
       daikou-seikyu.html の Excel の合計欄
       daikou-seikyu.html の tax10（★誰も呼んでいない重複★）
     今は答えが同じでも、片方だけ直すと ★同じ請求書の合計が紙とExcelで食い違う★。
     （請求書アプリは同じ型で ★11,000円 少なく振り込まれる★所まで行った）
     ★文言は様式ごとに違う（エレガント=消費税（10%）／クラシック=消費税（10%・内税））ので
       ここでは数字だけを返し、見出しは今までどおり各様式が持つ＝紙は1文字も変わらない。★ */
  /* ★繰越（会社ごとに選べる）★ 2026-08-11
     並べる順（指示役 2026-08-11 が決めた形）:
       今回請求額 → ＋前回繰越額 → 合計請求額 → −ご入金額 → 今回お支払額
     ・★前回繰越額★ ＝ 当月より前の（請求 − 入金）の残り（＝まだ入っていない分）
     ・★ご入金額★   ＝ 当月ぶんとして受け取った入金
       ⇒ 前回繰越は過去の入金を引いた後の数なので ★二重に引かない★
     ★0円と書かない★（指示役の合格条件）
       前回の請求が1件も無い     → kurikoshi=null・riyu="前回の請求はありません"
       入金が読めない（不明）    → nyukin=null・riyu に "入金は未確認"
       ＝「無い」と「0円」は別物。0円と書くと 払い忘れと区別が付かなくなる。
     kako = [{ month, seikyu, nyukin }]  seikyu/nyukin が null なら「不明」 */
  function carryoverOf(kako, konkaiSeikyu, konkaiNyukin) {
    var mae = (kako || []).filter(function (k) {
      return k && k.month;
    });
    var riyu = [];
    var kurikoshi = null;
    if (!mae.length) {
      riyu.push("前回の請求はありません");
    } else if (
      mae.some(function (k) {
        return k.seikyu == null;
      })
    ) {
      riyu.push("前回の請求額が読めません"); // 控えが無い月が混ざっている
    } else if (
      mae.some(function (k) {
        return k.nyukin == null;
      })
    ) {
      riyu.push("入金は未確認");
    } else {
      kurikoshi = mae.reduce(function (t, k) {
        return t + (Number(k.seikyu) || 0) - (Number(k.nyukin) || 0);
      }, 0);
    }
    var konkai = Number(konkaiSeikyu) || 0;
    var nyukin = konkaiNyukin == null ? null : Number(konkaiNyukin) || 0;
    if (konkaiNyukin == null) riyu.push("入金は未確認");
    var goukeiSeikyu = kurikoshi == null ? null : konkai + kurikoshi;
    var oshiharai = goukeiSeikyu == null || nyukin == null ? null : goukeiSeikyu - nyukin;
    return {
      konkai: konkai, // 今回請求額
      kurikoshi: kurikoshi, // 前回繰越額（null＝出せない）
      goukeiSeikyu: goukeiSeikyu, // 合計請求額
      nyukin: nyukin, // ご入金額（null＝未確認）
      oshiharai: oshiharai, // 今回お支払額（null＝出せない）
      riyu: riyu.filter(function (x, i, a) {
        return a.indexOf(x) === i;
      }),
    };
  }

  function invoiceTotals(rows, iss) {
    var grand = (rows || []).reduce(function (t, r) {
      return t + (Number(r && r.金額) || 0);
    }, 0);
    // ★言い方は1つ★：会社マスタに入っている値（"外税"）をそのまま見る。
    //   別の綴り（"soto"等）を足すと、書く側と読む側で語彙がずれて必ず事故る。
    var soto = !!(iss && iss.taxMode === "外税");
    var tax = soto
      ? Math.round((grand * TAX_RATE) / 100)
      : Math.round((grand * TAX_RATE) / (100 + TAX_RATE));
    return {
      shoukei: grand, // 小計
      zei: tax, // 消費税
      goukei: soto ? grand + tax : grand, // 合計
      soto: soto,
      rate: TAX_RATE, // ★文言はこの数から組み立てる★
    };
  }

  /* ★合計欄の言葉は ここ1つで組み立てる★（2026-08-12 指示役の裁定）
     ・★率は計算に使った値から作る★（"10%" と直書きしない）
     ・★内税/外税は 実際の設定から作る★（固定の既定にしない＝外税の紙が嘘をつかない）
     ・会社ごとの言い換え（MASTER[会社].labels）を ★その上に被せる★
       ＝仕組みを増やさない。何も入れなければ 下の既定が出る。
     直す前は 同じ請求書なのに 出し方で4通りに割れていた:
       "消費税（10%・内税）" / "消費税（10%）" / "消費税(10%)" / "消費税"
       （★半角カッコと全角カッコまで混ざっていた★） */
  function totalsLabels(m, iss) {
    var soto = !!(iss && iss.taxMode === "外税");
    var kihon = {
      小計: "小計",
      消費税: "消費税（" + TAX_RATE + "%・" + (soto ? "外税" : "内税") + "）",
      合計: "合計",
      前回繰越額: "前回繰越額",
      合計請求額: "合計請求額",
      ご入金額: "ご入金額",
      今回お支払額: "今回お支払額",
    };
    var L = (m && m.labels) || {};
    Object.keys(kihon).forEach(function (k) {
      if (L[k]) kihon[k] = L[k]; // 会社ごとの言い換えを被せる
    });
    return kihon;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function reiwaIssueDate(month) {
    return issueDateStr(month, "reiwa");
  }
  // 項目の表示見出し。会社マスタの labels で上書き可（自由項目・見出し名編集）。未設定はキーそのもの。
  /* ★行き先の文字を作るのは ここ1本★（一覧・紙(PDF)・Excel が同じ物を呼ぶ）2026-08-18
       司さん「開始 〜 経由 〜 最終 で出せ。区切りは 〜」

     ★どこで作られているか（実測 2026-08-18）★
       ・行き先の本文は ★ダイコメ側★ が作って meisai.destination に入れている。
         正本 = Daikou-app-test/supabase/functions/dk-sync-jobs/meisai-row.js の routeText()
         （出発〜経由〜到着／地元の市は落とす／市外は市名を付ける／取れていない所はとばす）
       ・代行請求(この器)には ★経由地の列が無い★。だから ここで経路を組み立て直さない。
         ＝★同じ物を2か所で作らない★。ここは「受け取った文字を出す所」1本。

     ★1つだけ ここで合流させる物★
       2026-08-05版の同期は destination に ★到着地だけ★ を入れ、出発地は extra.dk_from に入れていた。
       その行は「〜」を持たないので、★出発地が在れば 出発〜到着 にして出す★（過去の行が読めるようになる）。
       ★市名は落とさない★＝落とす決まりはダイコメ側の設定（地元の市）なので、ここで2か所目を作らない。

     ★勝手に埋めない★＝無い物は足さない。経由地はこの器に無いので出せない。 */
  function routeTextOf(row) {
    if (!row) return "";
    var dest = String(row["行き先"] == null ? "" : row["行き先"]).trim();
    var from = String(row.dk_from == null ? "" : row.dk_from).trim(); // extra.dk_from（出発地）
    if (!from) return dest;
    if (!dest) return from;
    if (dest.indexOf("〜") >= 0) return dest; // 既に 開始〜経由〜最終
    if (from === dest || dest.indexOf(from) === 0) return dest; // 出発が既に先頭に在る
    return from + "〜" + dest;
  }

  function labelOf(m, k) {
    return (m && m.labels && m.labels[k]) || k;
  }
  // 請求日＝対象月の翌月1日。era: "seireki"(2026/2/1) / "reiwa"(令和8年2月1日)
  function issueDateStr(month, era) {
    if (!month) return "";
    var p = month.split("-"),
      y = Number(p[0]),
      m = Number(p[1]);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (era === "seireki") return y + "/" + m + "/1";
    return "令和" + (y - 2018) + "年" + m + "月1日";
  }

  // ===== 1ページぶんのシートHTML（純粋） =====
  // issuer = { lines:[], bank:[], hanko:dataURL|null }。未指定なら組み込み既定(ZEROact・判子なし)。
  function buildSheet(m, co, items, pageRows, ctx, issuer) {
    var iss = issuer || { lines: ISSUER.lines, bank: ISSUER.bank, hanko: null };
    var leadFilled = (m.lead || "").replace("{月}", ctx.monthNum);
    // 列幅 colgroup
    var totalW = items.reduce(function (s, k) {
      return s + (Number(m.widths[k]) || DEFAULT_WIDTH[k] || 80);
    }, 0);
    var colgroup = items
      .map(function (k) {
        var w = Number(m.widths[k]) || DEFAULT_WIDTH[k] || 80;
        return '<col style="width:' + ((w / totalW) * 100).toFixed(2) + '%">';
      })
      .join("");
    // ヘッダー行：金額より前の列を tableTitle でまとめ、金額=「金額（税込み）」、以降は項目名
    var amtIdx = items.indexOf("金額");
    var leadCount = amtIdx >= 0 ? amtIdx : items.length;
    var headCells = "";
    if (leadCount > 0)
      headCells +=
        '<th colspan="' + leadCount + '">' + esc(m.tableTitle || "運転業務委託料") + "</th>";
    if (amtIdx >= 0) {
      headCells += "<th>金額（税込み）</th>";
      items.slice(amtIdx + 1).forEach(function (k) {
        headCells += "<th>" + esc(labelOf(m, k)) + "</th>";
      });
    } else {
      headCells = items
        .map(function (k) {
          return "<th>" + esc(labelOf(m, k)) + "</th>";
        })
        .join("");
    }
    // 明細行（日付は前行と同じなら空欄）
    var prevDate = null;
    var bodyRows = "";
    for (var r = 0; r < ROWS_PER_PAGE; r++) {
      var row = pageRows[r];
      var tds = items
        .map(function (k, ci) {
          // 金額の列とそれ以降（備考など）は左に縦線を入れる
          var vl = amtIdx >= 0 && ci >= amtIdx ? " vl" : "";
          if (!row) return vl ? '<td class="vl">&nbsp;</td>' : "<td>&nbsp;</td>";
          var def = FIELD_DEFS.filter(function (f) {
            return f.key === k;
          })[0];
          var t = def ? def.type : "text";
          if (k === "日付") {
            var cur = row.日付 || "";
            var show = cur && cur !== prevDate ? mdShort(cur) : "";
            return '<td class="c' + vl + '">' + esc(show) + "</td>";
          }
          if (k === "金額") return '<td class="r' + vl + '">' + comma(row.金額) + "</td>";
          if (t === "number") return '<td class="c' + vl + '">' + comma(row[k]) + "</td>";
          return '<td class="dest' + vl + '">' + esc(row[k]) + "</td>";
        })
        .join("");
      if (row) prevDate = row.日付 || prevDate;
      bodyRows += "<tr>" + tds + "</tr>";
    }
    // ページ小計（このページ分）
    var pageTotal = pageRows.reduce(function (s, x) {
      return s + (Number(x.金額) || 0);
    }, 0);
    // 役職集計が下に続くか（続く時だけ合計の下に区切りの下線を入れる）
    var showSummary = m.noteSummary && ctx.isLast && (m.noteGroups || []).length;
    var ul = showSummary ? " ul" : "";
    // 小計/消費税/合計は ENEOS式の右下のコンパクトな枠に（中身は税込/内税のまま）
    var totalsBox =
      '<table class="sh-totalbox">' +
      '<tr><td class="k">小計</td><td class="v">' +
      yen(pageTotal) +
      "</td></tr>" +
      '<tr><td class="k">' +
      totalsLabels(m, iss).消費税 +
      '</td><td class="v">' +
      yen(tax10(pageTotal)) +
      "</td></tr>" +
      '<tr><td class="k' +
      ul +
      '">合計</td><td class="v' +
      ul +
      '">' +
      yen(pageTotal) +
      "</td></tr>" +
      "</table>";
    // 役職（備考）集計ボックス：最終ページのみ
    var summaryBox = "";
    if (showSummary) {
      var sums = {};
      m.noteGroups.forEach(function (g) {
        sums[g] = 0;
      });
      ctx.allRows.forEach(function (x) {
        var g = (x.備考 || "").trim();
        if (sums.hasOwnProperty(g)) sums[g] += Number(x.金額) || 0;
      });
      summaryBox =
        '<table class="sh-summary">' +
        m.noteGroups
          .map(function (g) {
            return (
              '<tr><td class="k">' +
              esc(g) +
              '</td><td class="v">' +
              (sums[g] ? yen(sums[g]) : "") +
              "</td></tr>"
            );
          })
          .join("") +
        "</table>";
    }
    // ヘッダー（屋号・住所など＝自社情報。判子はユーザー画像があれば描画、なければ無し）
    var hankoMm = Number(iss.hankoSizeMm) || 21; // 本物の判子サイズ(mm)
    var hankoHtml = iss.hanko
      ? '<div style="position:absolute;right:4px;top:0;width:' +
        hankoMm +
        "mm;height:" +
        hankoMm +
        'mm;"><img src="' +
        iss.hanko +
        '" style="width:100%;height:100%;object-fit:contain;"></div>'
      : "";
    var issuerAlign = iss.lineAlign || "left"; // left / center / right
    var bankAlign = iss.bankAlign || "left";
    var issuer =
      '<div class="sh-issuer" style="text-align:' +
      issuerAlign +
      '">' +
      hankoHtml +
      (iss.lines || [])
        .map(function (l, idx) {
          return "<div" + (idx === 0 ? ' class="big"' : "") + ">" + esc(l) + "</div>";
        })
        .join("") +
      "</div>";
    var grandLine =
      '<div class="sh-grand"><span class="lbl">ご請求金額（税込）</span><span class="val">' +
      (ctx.isLast ? yen(ctx.grand) : "") +
      "</span></div>";
    var bank =
      '<div class="sh-bank" style="text-align:' +
      bankAlign +
      '">' +
      (iss.bank || [])
        .map(function (l) {
          return "<div>" + esc(l) + "</div>";
        })
        .join("") +
      "</div>";

    // ===== テンプレ別ヘッダー =====
    // A（A_logo / A_plain）= タイトル左寄せ・請求日も左・ロゴは右上の角（logoMode=show時）。
    // B（B_center）       = タイトル中央・請求日/Noは右上メタ（従来）。
    var style = iss.headerStyle === "A" ? "A" : "B";
    var dateStr = esc(issueDateStr(ctx.month, iss.dateEra));
    var noStr = iss.showInvoiceNo && ctx.invoiceNo ? esc(ctx.invoiceNo) : "";
    var wantLogo = iss.logoMode === "show" && iss.logo;
    var logoMm = Number(iss.logoSizeMm) || 40;
    // ロゴは「絶対配置でpx」だと画面(padding38px)と印刷(padding0+@page余白)でズレる。
    // フレックスの行に流し込んで“内容の右端”に揃える＝画面でも印刷でも同じ位置。
    // インラインstyleで書くのは、古いCSSがキャッシュされた端末でも正しく出すため。
    var logoHtml = wantLogo
      ? '<img class="sh-logo" src="' +
        esc(iss.logo) +
        '" style="display:block;flex:0 0 auto;margin-left:16px;max-width:' +
        logoMm +
        'mm;max-height:26mm;object-fit:contain;">'
      : "";
    var headerHtml;
    if (style === "A") {
      headerHtml =
        '<div class="sh-headA" style="display:flex;justify-content:space-between;align-items:flex-start;">' +
        "<div>" +
        '<div class="sh-title sh-title-l" style="text-align:left;padding-left:0;margin:2px 0 2px;">請求書</div>' +
        '<div class="sh-date-l" style="text-align:left;font-size:12px;margin:0 0 10px;">請求日　' +
        dateStr +
        (noStr
          ? '<span class="sh-no-inl" style="margin-left:16px;color:#444;">No.　' + noStr + "</span>"
          : "") +
        "</div>" +
        "</div>" +
        logoHtml +
        "</div>";
    } else {
      headerHtml =
        '<div class="sh-meta"><div>請求日　' +
        dateStr +
        "</div>" +
        (noStr ? "<div>No.　" + noStr + "</div>" : "") +
        "</div>" +
        '<div class="sh-title">請求書</div>';
    }
    return (
      '<div class="sheet">' +
      headerHtml +
      '<div class="sh-top">' +
      '<div class="sh-left">' +
      '<div class="sh-client">' +
      esc(co) +
      '<span class="ochu">御中</span></div>' +
      '<div class="sh-leadwrap">' +
      '<div class="sh-lead">' +
      esc(leadFilled) +
      "</div>" +
      '<div class="sh-lead">下記の通り御請求申し上げます。</div>' +
      grandLine +
      "</div>" +
      "</div>" +
      '<div class="sh-right" style="text-align:' +
      issuerAlign +
      // テンプレAは自社情報を少し下げてロゴと間を空ける（バランス）
      (style === "A" ? ";margin-top:18px" : "") +
      '">' +
      issuer +
      "</div>" +
      "</div>" +
      '<table class="sh-table"><colgroup>' +
      colgroup +
      "</colgroup>" +
      "<thead><tr>" +
      headCells +
      "</tr></thead>" +
      "<tbody>" +
      bodyRows +
      "</tbody></table>" +
      '<div class="sh-foot">' +
      bank +
      '<div class="sh-foot-right">' +
      totalsBox +
      summaryBox +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // 請求書No（会社の登録順で安定）: "2026-06-02" 形式
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function invoiceNoFor(master, accountId, month, co) {
    var cos = Object.keys(master).filter(function (c) {
      return accountId == null || master[c].account_id === accountId;
    });
    var i = cos.indexOf(co);
    return month + "-" + pad2((i < 0 ? 0 : i) + 1);
  }

  // ===== 1社ぶん（複数ページ）の請求書HTML =====
  function buildInvoiceHTML(master, co, rows, month, issuer, invoiceNo) {
    var m = master[co];
    if (!m) return "";
    var items = m.items;
    var grand = rows.reduce(function (s, r) {
      return s + (Number(r.金額) || 0);
    }, 0);
    var pages = [];
    for (var i = 0; i < rows.length; i += ROWS_PER_PAGE)
      pages.push(rows.slice(i, i + ROWS_PER_PAGE));
    if (!pages.length) pages.push([]);
    var monthNum = Number(month.split("-")[1]);
    var html = "";
    pages.forEach(function (pageRows, pi) {
      html += buildSheet(
        m,
        co,
        items,
        pageRows,
        {
          month: month,
          monthNum: monthNum,
          grand: grand,
          isLast: pi === pages.length - 1,
          allRows: rows,
          invoiceNo: invoiceNo || "",
        },
        issuer
      );
    });
    return html;
  }

  // ===== 月＋アカウントで全社ぶんを生成 =====
  function buildMonth(master, db, month, accountId, issuer) {
    var companies = Object.keys(master).filter(function (co) {
      return accountId == null || master[co].account_id === accountId;
    });
    var out = [];
    var html = "";
    companies.forEach(function (co) {
      var rows = db
        .filter(function (r) {
          if (accountId != null && r.account_id !== accountId) return false;
          return r.会社名 === co && inMonth(r.日付, month);
        })
        .sort(function (a, b) {
          return (
            (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
          );
        });
      if (!rows.length) return;
      var co_html = buildInvoiceHTML(
        master,
        co,
        rows,
        month,
        issuer,
        invoiceNoFor(master, accountId, month, co)
      );
      out.push({ company: co, rows: rows.length, html: co_html });
      html += co_html;
    });
    return { produced: out.length, companies: out, html: html };
  }

  // ===== 入金管理／月次集計の土台：請求書(=会社×月)の一覧 =====
  // db を「会社×対象月」でまとめ、各請求の合計額と明細件数を返す純粋関数。
  // 請求書の単位は (account_id, month, 会社名)＝invoiceNoFor と同じ粒度。
  // month を渡せばその月だけ、null なら全期間（月またぎで会社×月ごとに分かれる）。
  // 日付なしの行は請求対象外（除外）。新しい月→会社名順でソート。
  function listInvoices(db, accountId, month) {
    var groups = {};
    db.forEach(function (r) {
      if (accountId != null && r.account_id !== accountId) return;
      if (!r.日付) return; // 日付なしは請求にできない
      var ym = String(r.日付).slice(0, 7);
      if (month && ym !== month) return;
      var key = ym + " " + r.会社名;
      if (!groups[key]) groups[key] = { company: r.会社名, month: ym, total: 0, count: 0 };
      groups[key].total += Number(r.金額) || 0;
      groups[key].count++;
    });
    return Object.keys(groups)
      .map(function (k) {
        return groups[k];
      })
      .sort(function (a, b) {
        return b.month.localeCompare(a.month) || a.company.localeCompare(b.company);
      });
  }

  // ===== Excel受け渡し：明細DB＋会社マスタを1つの.xls(HTML)に書き出す =====
  // スマホ→Excel(=中央DB) の一方向ハンドオフ。account_id でテナント分離。
  var DB_COLS = [
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
  ];
  // 明細DB＋会社マスタを「シートごとの2次元配列」で返す（純粋・ライブラリ非依存）。
  // 実ファイル(.xlsx)化は呼び出し側が SheetJS 等で行う＝エンジンは形式に依存しない。
  function buildWorkbookData(master, db, accountId) {
    var rows = db.filter(function (r) {
      return accountId == null || r.account_id === accountId;
    });
    var cos = Object.keys(master).filter(function (c) {
      return accountId == null || master[c].account_id === accountId;
    });
    var dbAoa = [DB_COLS.slice()];
    rows.forEach(function (r) {
      dbAoa.push(
        DB_COLS.map(function (c) {
          return r[c] == null ? "" : r[c];
        })
      );
    });
    var mCols = [
      "会社名",
      "account_id",
      "項目(順)",
      "各幅",
      "リード文",
      "表ヘッダー名",
      "備考集計",
      "集計グループ",
    ];
    var mAoa = [mCols.slice()];
    cos.forEach(function (co) {
      var m = master[co];
      mAoa.push([
        co,
        m.account_id,
        (m.items || []).join(" / "),
        (m.items || [])
          .map(function (k) {
            return k + ":" + ((m.widths && m.widths[k]) || "");
          })
          .join(" / "),
        m.lead || "",
        m.tableTitle || "",
        m.noteSummary ? "ON" : "",
        (m.noteGroups || []).join("、"),
      ]);
    });
    return {
      sheets: [
        { name: "明細DB", aoa: dbAoa },
        { name: "会社マスタ", aoa: mAoa },
      ],
    };
  }

  root.MeisaiEngine = {
    FIELD_DEFS: FIELD_DEFS,
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    ISSUER: ISSUER,
    ROWS_PER_PAGE: ROWS_PER_PAGE,
    DB_COLS: DB_COLS,
    buildInvoiceHTML: buildInvoiceHTML,
    buildMonth: buildMonth,
    buildWorkbookData: buildWorkbookData,
    invoiceNoFor: invoiceNoFor,
    invoiceTotals: invoiceTotals, // ★合計を足すのはここだけ★
    carryoverOf: carryoverOf, // ★繰越もここだけ★
    totalsLabels: totalsLabels, // ★合計欄の言葉もここだけ★
    TAX_RATE: TAX_RATE,
    listInvoices: listInvoices,
    utils: {
      yen: yen,
      comma: comma,
      mdShort: mdShort,
      inMonth: inMonth,
      tax10: tax10,
      esc: esc,
      reiwaIssueDate: reiwaIssueDate,
      labelOf: labelOf,
      routeTextOf: routeTextOf,
    },
  };

  // Node(将来のExcel連携/テスト)からも使えるように
  if (typeof module !== "undefined" && module.exports) module.exports = root.MeisaiEngine;
})(typeof window !== "undefined" ? window : this);
