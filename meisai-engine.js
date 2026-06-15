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
     .utils … {yen,comma,mdShort,inMonth,tax10,esc,reiwaIssueDate}（必要なら外でも使える）
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
  function tax10(total) {
    return Math.round((total * 10) / 110);
  } // 内税10%の内消費税
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

  // ===== 1ページぶんのシートHTML（純粋） =====
  function buildSheet(m, co, items, pageRows, ctx) {
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
        headCells += "<th>" + esc(k) + "</th>";
      });
    } else {
      headCells = items
        .map(function (k) {
          return "<th>" + esc(k) + "</th>";
        })
        .join("");
    }
    // 明細行（日付は前行と同じなら空欄）
    var prevDate = null;
    var bodyRows = "";
    for (var r = 0; r < ROWS_PER_PAGE; r++) {
      var row = pageRows[r];
      var tds = items
        .map(function (k) {
          if (!row) return "<td>&nbsp;</td>";
          var def = FIELD_DEFS.filter(function (f) {
            return f.key === k;
          })[0];
          var t = def ? def.type : "text";
          if (k === "日付") {
            var cur = row.日付 || "";
            var show = cur && cur !== prevDate ? mdShort(cur) : "";
            return '<td class="c">' + esc(show) + "</td>";
          }
          if (k === "金額") return '<td class="r">' + comma(row.金額) + "</td>";
          if (t === "number") return '<td class="c">' + comma(row[k]) + "</td>";
          return '<td class="dest">' + esc(row[k]) + "</td>";
        })
        .join("");
      if (row) prevDate = row.日付 || prevDate;
      bodyRows += "<tr>" + tds + "</tr>";
    }
    // ページ小計（このページ分）
    var pageTotal = pageRows.reduce(function (s, x) {
      return s + (Number(x.金額) || 0);
    }, 0);
    var trailing = amtIdx >= 0 ? items.length - 1 - amtIdx : 0;
    function totRow(label, valHtml) {
      var t = '<tr class="tot"><td colspan="' + leadCount + '">' + label + "</td>";
      t += '<td class="r">' + valHtml + "</td>";
      for (var x = 0; x < trailing; x++) t += "<td>&nbsp;</td>";
      return t + "</tr>";
    }
    var totals =
      totRow("小計", yen(pageTotal)) +
      totRow("消費税（10%）", yen(tax10(pageTotal))) +
      totRow("合計", yen(pageTotal));
    // 役職（備考）集計ボックス：最終ページのみ
    var summaryBox = "";
    if (m.noteSummary && ctx.isLast && (m.noteGroups || []).length) {
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
    // ヘッダー（屋号・住所など固定）
    var issuer =
      '<div class="sh-issuer">' +
      '<div class="sh-hanko">合同会社<br>ZEROact</div>' +
      ISSUER.lines
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
      '<div class="sh-bank">' +
      ISSUER.bank
        .map(function (l) {
          return "<div>" + esc(l) + "</div>";
        })
        .join("") +
      "</div>";

    return (
      '<div class="sheet">' +
      '<div class="sh-title">請求書</div>' +
      '<div class="sh-top"><div class="sh-left">' +
      '<div class="sh-date">' +
      esc(reiwaIssueDate(ctx.month)) +
      "</div>" +
      '<div class="sh-client">' +
      esc(co) +
      '<span class="ochu">御中</span></div>' +
      '<div class="sh-lead">' +
      esc(leadFilled) +
      "</div>" +
      '<div class="sh-lead">下記の通り御請求申し上げます。</div>' +
      grandLine +
      "</div>" +
      issuer +
      "</div>" +
      '<table class="sh-table"><colgroup>' +
      colgroup +
      "</colgroup>" +
      "<thead><tr>" +
      headCells +
      "</tr></thead>" +
      "<tbody>" +
      bodyRows +
      totals +
      "</tbody></table>" +
      '<div class="sh-foot">' +
      bank +
      summaryBox +
      "</div>" +
      "</div>"
    );
  }

  // ===== 1社ぶん（複数ページ）の請求書HTML =====
  function buildInvoiceHTML(master, co, rows, month) {
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
      html += buildSheet(m, co, items, pageRows, {
        month: month,
        monthNum: monthNum,
        grand: grand,
        isLast: pi === pages.length - 1,
        allRows: rows,
      });
    });
    return html;
  }

  // ===== 月＋アカウントで全社ぶんを生成 =====
  function buildMonth(master, db, month, accountId) {
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
      var co_html = buildInvoiceHTML(master, co, rows, month);
      out.push({ company: co, rows: rows.length, html: co_html });
      html += co_html;
    });
    return { produced: out.length, companies: out, html: html };
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
    utils: {
      yen: yen,
      comma: comma,
      mdShort: mdShort,
      inMonth: inMonth,
      tax10: tax10,
      esc: esc,
      reiwaIssueDate: reiwaIssueDate,
    },
  };

  // Node(将来のExcel連携/テスト)からも使えるように
  if (typeof module !== "undefined" && module.exports) module.exports = root.MeisaiEngine;
})(typeof window !== "undefined" ? window : this);
