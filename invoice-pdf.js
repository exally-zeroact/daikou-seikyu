/* =====================================================================
   invoice-pdf.js — 請求書をクリーンなベクターPDFで出力（複数ページ対応）

   なぜ自前PDF？ iOS Safari の window.print() はページ最下部に URL＋日付を
   勝手に付ける（ブラウザの仕様で CSS では消せない）。自前で PDF を組めば
   その“足跡”が出ない。文字は日本語フォントを埋め込み＝くっきり。

   仕組み: pdf-lib + @pdf-lib/fontkit + BIZ UDPGothic(Office同梱の無料UD書体/OFL・
   全字形13,932字＝異体字 髙﨑邉 や記号 ㈱№℡㊞ も網羅) を遅延ロード
   （PDF作成を押した時だけ／以後キャッシュ）。pdf-libのサブセッタは大きいフォントで
   字を落とすバグがあるため subset:false で全埋め込み（PDFは約3MB）。

   公開API（window.InvoicePDF）:
     .buildMonth(master, db, month, accountId, issuer)  → Promise<Uint8Array>
     .buildOne(master, co, rows, month, issuer, invoiceNo) → Promise<Uint8Array>
     .save(bytes, filename)  … ダウンロード/共有
   ===================================================================== */
(function (global) {
  "use strict";

  var MM = 72 / 25.4; // mm → pt
  var A4 = { w: 595.28, h: 841.89 };
  var M = 42; // 余白(pt)＝約14.8mm
  var CW = A4.w - M * 2; // 本文幅
  var ROWS_PER_PAGE = 22; // 1ページの明細スロット数（HTML/Excelと同じ）
  var GREY, GREEN, BLACK, DARK;
  // フォントが持たない字（例：髙﨑邉などの異体字）の検出。描画時に〓へ置換し、利用者に知らせる。
  var _cov = null; // { fk: fontkitフォント, missing: Set }
  var _lastMissing = [];
  function _sanitize(str) {
    if (!_cov || !_cov.fk) return str;
    var out = "";
    for (var i = 0; i < str.length; i++) {
      var cp = str.codePointAt(i);
      if (cp > 0xffff) i++; // サロゲートペア
      var ch = String.fromCodePoint(cp);
      if (cp === 0x20 || cp === 0x3000 || _cov.fk.hasGlyphForCodePoint(cp)) {
        out += ch;
      } else {
        _cov.missing.add(ch);
        out += "〓";
      }
    }
    return out;
  }

  // ---- 遅延ロード（libs＋フォント。初回だけ） ----
  function _script(src, globalName) {
    return new Promise(function (res, rej) {
      if (global[globalName]) return res();
      var s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = function () {
        rej(new Error("読み込み失敗: " + src));
      };
      document.head.appendChild(s);
    });
  }
  // フォント＝Office同梱の無料UD書体(BIZ UD・OFL)に絞る＝Excelと書体を揃える。
  // ★全字形(異体字 髙﨑邉/記号 ㈱№℡㊞)。pdf-libのサブセッタは大きいフォントで字を落とす
  //   バグがあるため subset:false で全埋め込み（PDFは約3MB）。
  var FONT_FILES = {
    "BIZ UDPゴシック": "vendor/fonts/BIZUDPGothic-Regular.ttf",
    "BIZ UDゴシック": "vendor/fonts/BIZUDGothic-Regular.ttf",
    "BIZ UD明朝": "vendor/fonts/BIZUDMincho-Regular.ttf",
    "BIZ UDP明朝": "vendor/fonts/BIZUDPMincho-Regular.ttf",
  };
  var DEFAULT_FONT = "BIZ UDPゴシック";
  var _assetsCache = {}; // フォント名 → {PDFLib, fontkit, fontBytes}（フォント別にキャッシュ）
  async function loadAssets(fontKey) {
    fontKey = FONT_FILES[fontKey] ? fontKey : DEFAULT_FONT;
    if (_assetsCache[fontKey]) return _assetsCache[fontKey];
    await _script("vendor/pdf-lib.min.js", "PDFLib");
    await _script("vendor/fontkit.umd.min.js", "fontkit");
    var fontBytes = new Uint8Array(await (await fetch(FONT_FILES[fontKey])).arrayBuffer());
    _assetsCache[fontKey] = {
      PDFLib: global.PDFLib,
      fontkit: global.fontkit,
      fontBytes: fontBytes,
    };
    return _assetsCache[fontKey];
  }

  // ---- ユーティリティ ----
  function yen(n) {
    return "¥" + Math.round(Number(n) || 0).toLocaleString("ja-JP");
  }
  function comma(n) {
    if (n === "" || n == null) return "";
    return Number(n).toLocaleString("ja-JP");
  }
  function tax10(t) {
    return Math.round((t * 10) / 110);
  }
  function mdShort(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return Number(p[1]) + "/" + Number(p[2]);
  }
  function issueDateStr(month, era) {
    if (!month) return "";
    var p = month.split("-"),
      y = Number(p[0]),
      m = Number(p[1]) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (era === "reiwa") return "令和" + (y - 2018) + "年" + m + "月1日";
    return y + "/" + m + "/1";
  }
  function invoiceNoFor(master, accountId, month, co) {
    var cos = Object.keys(master).filter(function (c) {
      return accountId == null || master[c].account_id === accountId;
    });
    var i = cos.indexOf(co);
    return month + "-" + (i < 0 ? 1 : i + 1 < 10 ? "0" + (i + 1) : i + 1);
  }

  // ---- PDF描画ヘルパ（1社ぶん。複数ページ） ----
  // ctx: { doc, font, rgb } を持つ
  function makeDrawer(ctx) {
    var rgb = ctx.rgb;
    GREY = rgb(0.5, 0.5, 0.5);
    GREEN = rgb(220 / 255, 239 / 255, 230 / 255);
    BLACK = rgb(0, 0, 0);
    DARK = rgb(0.13, 0.13, 0.13);
    return ctx;
  }

  // 文字列を maxW(pt) に収まるよう末尾を…で詰める（セルからのはみ出し防止）。
  function _truncate(font, str, size, maxW) {
    if (!maxW || font.widthOfTextAtSize(str, size) <= maxW) return str;
    var s = str;
    while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  // テキスト描画。x,y は「行の左上(top)」基準。align=left/center/right。opts.maxWで折返しせず…詰め。返り値=文字幅。
  function T(page, font, str, x, top, size, opts) {
    opts = opts || {};
    str = _sanitize(String(str == null ? "" : str));
    if (opts.maxW) str = _truncate(font, str, size, opts.maxW);
    var w = font.widthOfTextAtSize(str, size);
    var dx = opts.align === "right" ? -w : opts.align === "center" ? -w / 2 : 0;
    page.drawText(str, {
      x: x + dx,
      y: top - size * 0.82, // top基準→ベースライン
      size: size,
      font: font,
      color: opts.color || BLACK,
    });
    return w;
  }
  function line(page, x1, y1, x2, y2, color, thick) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: thick || 0.7,
      color: color || GREY,
    });
  }
  function rect(page, x, yTop, w, h, color) {
    page.drawRectangle({ x: x, y: yTop - h, width: w, height: h, color: color });
  }

  // dataURL → 埋め込み画像（png/jpeg）。失敗時 null。
  async function embedImg(doc, dataURL) {
    if (!dataURL) return null;
    var m = String(dataURL).match(/^data:image\/(png|jpe?g);base64,(.*)$/i);
    if (!m) return null;
    var bin = atob(m[2]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    try {
      return /png/i.test(m[1]) ? await doc.embedPng(u8) : await doc.embedJpg(u8);
    } catch (e) {
      return null;
    }
  }

  // 列幅(pt)を items から算出（金額は固定広め・行き先=伸縮）。
  function colWidths(items, widths) {
    var base = { 日付: 64, 行き先: 240, 金額: 100, 備考: 80, 距離: 80, 人数: 64, 名前: 96 };
    var raw = items.map(function (k) {
      return Number((widths || {})[k]) || base[k] || 80;
    });
    var sum = raw.reduce(function (a, b) {
      return a + b;
    }, 0);
    return raw.map(function (w) {
      return (w / sum) * CW;
    });
  }

  // 1社ぶんを描画して doc にページ追加。
  async function drawCompany(ctx, master, co, rows, month, iss, invoiceNo) {
    var doc = ctx.doc,
      font = ctx.font;
    var m = master[co] || { items: ["日付", "行き先", "金額"], widths: {} };
    var items = m.items;
    var amtIdx = items.indexOf("金額");
    var cw = colWidths(items, m.widths);
    var grand = rows.reduce(function (s, r) {
      return s + (Number(r.金額) || 0);
    }, 0);
    var style = (iss && iss.headerStyle) === "A" ? "A" : "B";
    var logo = ctx.logoImg,
      hanko = ctx.hankoImg;
    var monthNum = Number(month.split("-")[1]);
    var bank = (iss && iss.bank) || [];
    var iLines = (iss && iss.lines) || [];
    var rowH = 17,
      headH = 19;
    // 役職集計が付く時は、その行数ぶん1ページの明細を減らして下にはみ出さないように
    var footExtra = m.noteSummary && (m.noteGroups || []).length ? m.noteGroups.length + 2 : 0;
    var rpp = Math.max(12, ROWS_PER_PAGE - footExtra);
    var detailPages = [];
    for (var i = 0; i < rows.length; i += rpp) detailPages.push(rows.slice(i, i + rpp));
    if (!detailPages.length) detailPages.push([]);
    var pageSubtotals = detailPages.map(function (pr) {
      return pr.reduce(function (s, x) {
        return s + (Number(x.金額) || 0);
      }, 0);
    });
    // ★複数ページの時だけ最後に「ページ別サマリー」ページを足す（最終ページに総額を集約）。
    //   単ページの時は従来通り（上部に総額＋下部に内訳）。
    var multi = detailPages.length > 1;
    var totalPages = multi ? detailPages.length + 1 : 1;
    var pageNum = 0;

    // ---- 共通ヘッダー（タイトル〜あいさつ。showGrandで上部に「ご請求金額」）。戻り=テーブル開始y ----
    function drawHeader(page, showGrand) {
      var cy = A4.h - M;
      var dateStr = "請求日　" + issueDateStr(month, iss && iss.dateEra);
      var noStr = iss && iss.showInvoiceNo && invoiceNo ? "No.　" + invoiceNo : "";
      if (style === "A" && logo && iss && iss.logoMode === "show") {
        var maxW = (Number(iss.logoSizeMm) || 40) * MM,
          maxH = 26 * MM;
        var asp = logo.width / logo.height;
        var lw0 = maxW,
          lh0 = maxW / asp;
        if (lh0 > maxH) {
          lh0 = maxH;
          lw0 = maxH * asp;
        }
        page.drawImage(logo, { x: M + CW - lw0, y: cy - lh0, width: lw0, height: lh0 });
      }
      if (style === "A") {
        T(page, font, "請　求　書", M, cy, 22);
        cy -= 30;
        T(page, font, dateStr + (noStr ? "　　" + noStr : ""), M, cy, 10, { color: DARK });
        cy -= 22;
      } else {
        T(page, font, dateStr, M + CW, cy, 9.5, { align: "right", color: DARK });
        cy -= 13;
        if (noStr) {
          T(page, font, noStr, M + CW, cy, 9.5, { align: "right", color: DARK });
          cy -= 13;
        }
        cy -= 4;
        T(page, font, "請　求　書", M + CW / 2, cy, 22, { align: "center" });
        cy -= 34;
      }
      var topRow = cy;
      T(page, font, co + "　御中", M, topRow, 15, { maxW: CW * 0.6 });
      var iy = style === "A" ? topRow - 6 : topRow;
      iLines.forEach(function (ln, idx) {
        T(page, font, ln, M + CW, iy, idx === 0 ? 11 : 9.5, { align: "right", color: DARK });
        iy -= idx === 0 ? 15 : 13;
      });
      if (hanko) {
        var hs = (Number(iss && iss.hankoSizeMm) || 21) * MM;
        page.drawImage(hanko, {
          x: M + CW - hs + 2,
          y: topRow - hs + 4,
          width: hs,
          height: hs,
          opacity: 0.95,
        });
      }
      cy = topRow - 40;
      var lead = ((m.lead || "{月}月のご利用分です。") + "").replace("{月}", monthNum);
      T(page, font, lead, M, cy, 9.5, { color: DARK });
      cy -= 16;
      T(page, font, "下記の通り御請求申し上げます。", M, cy, 9.5, { color: DARK });
      cy -= 22;
      if (showGrand) {
        var gLabel = "ご請求金額（税込）";
        var glw = T(page, font, gLabel, M, cy, 12);
        var gv = yen(grand);
        T(page, font, gv, M + glw + 60, cy, 13);
        var gTextW = glw + 60 + font.widthOfTextAtSize(gv, 13);
        line(page, M, cy - 17, M + gTextW + 6, cy - 17, BLACK, 1.3);
      }
      return cy - 30;
    }

    // ---- 合計フッター（振込先＋小計/消費税/合計＋役職集計）。最終/サマリーページ用 ----
    function drawTotalsFooter(page, footTop) {
      var by = footTop;
      bank.forEach(function (ln) {
        T(page, font, ln, M, by, 9, { color: DARK });
        by -= 14;
      });
      var boxX = M + CW - 200,
        RX = M + CW,
        sy = footTop;
      function totRow(lbl, val, big) {
        T(page, font, lbl, boxX, sy, big ? 11 : 9.5, { color: DARK });
        T(page, font, val, RX, sy, big ? 12 : 9.5, { align: "right" });
        sy -= big ? 18 : 15;
      }
      totRow("小計", yen(grand));
      totRow("消費税（10%・内税）", yen(tax10(grand)));
      line(page, boxX, sy + 3, RX, sy + 3, DARK, 0.8);
      sy -= 2;
      totRow("合計", yen(grand), true);
      if (m.noteSummary && (m.noteGroups || []).length) {
        var sums = {};
        (m.noteGroups || []).forEach(function (g) {
          sums[g] = 0;
        });
        rows.forEach(function (x) {
          var g = (x.備考 || "").trim();
          if (sums.hasOwnProperty(g)) sums[g] += Number(x.金額) || 0;
        });
        var ny = sy - 4;
        T(page, font, "（内訳）", boxX, ny, 9, { color: DARK });
        ny -= 14;
        (m.noteGroups || []).forEach(function (g) {
          T(page, font, g, boxX, ny, 9, { color: DARK });
          T(page, font, sums[g] ? yen(sums[g]) : "", RX, ny, 9, { align: "right", color: DARK });
          ny -= 13;
        });
      }
    }

    // ---- 明細テーブル（会社の項目列）。戻り=tableBottom ----
    function drawDetailTable(page, topY, pageRows) {
      var tableTop = topY;
      var colX = [M];
      for (var c = 0; c < cw.length; c++) colX.push(colX[c] + cw[c]);
      var tableRight = M + CW;
      rect(page, M, tableTop, CW, headH, GREEN);
      var leadCount = amtIdx >= 0 ? amtIdx : items.length;
      if (leadCount > 0) {
        T(
          page,
          font,
          m.tableTitle || "運転業務委託料",
          M + (colX[leadCount] - M) / 2,
          tableTop - 3,
          9.5,
          {
            align: "center",
          }
        );
      }
      if (amtIdx >= 0) {
        T(page, font, "金額（税込み）", (colX[amtIdx] + colX[amtIdx + 1]) / 2, tableTop - 3, 9.5, {
          align: "center",
        });
        items.slice(amtIdx + 1).forEach(function (k, j) {
          var ci = amtIdx + 1 + j;
          T(
            page,
            font,
            (m.labels && m.labels[k]) || k,
            (colX[ci] + colX[ci + 1]) / 2,
            tableTop - 3,
            9.5,
            {
              align: "center",
            }
          );
        });
      }
      line(page, M, tableTop, tableRight, tableTop, GREY, 0.8);
      line(page, M, tableTop - headH, tableRight, tableTop - headH, GREY, 0.8);
      var prevDate = null;
      var bodyTop = tableTop - headH;
      for (var r = 0; r < rpp; r++) {
        var yTop = bodyTop - r * rowH;
        var row = pageRows[r];
        if (row) {
          items.forEach(function (k, ci) {
            var cx0 = colX[ci],
              cx1 = colX[ci + 1],
              pad = 6;
            if (k === "日付") {
              var cur = row.日付 || "";
              var val = cur && cur !== prevDate ? mdShort(cur) : "";
              T(page, font, val, (cx0 + cx1) / 2, yTop - 2.5, 9, { align: "center" });
            } else if (k === "金額") {
              T(page, font, comma(row.金額), cx1 - 5, yTop - 2.5, 9, {
                align: "right",
                maxW: cx1 - cx0 - pad,
              });
            } else {
              T(page, font, row[k], (cx0 + cx1) / 2, yTop - 2.5, 9, {
                align: "center",
                maxW: cx1 - cx0 - pad,
              });
            }
          });
          if (row.日付) prevDate = row.日付;
        }
        line(page, M, yTop - rowH, tableRight, yTop - rowH, GREY, 0.6);
      }
      var tableBottom = bodyTop - rpp * rowH;
      var vlines = [M, tableRight];
      if (amtIdx >= 0) {
        vlines.push(colX[amtIdx], colX[amtIdx + 1]);
        items.slice(amtIdx + 1).forEach(function (k, j) {
          vlines.push(colX[amtIdx + 2 + j]);
        });
      }
      vlines.forEach(function (vx) {
        line(page, vx, tableTop, vx, tableBottom, GREY, 0.6);
      });
      return tableBottom;
    }

    // ---- ページ別サマリーテーブル（最終サマリーページ）[内容 | 金額（税込み）]・明細ページと同じ体裁 ----
    function drawSummaryTable(page, topY, subs) {
      var tableTop = topY;
      var amtW = 130,
        splitX = M + CW - amtW,
        tableRight = M + CW;
      rect(page, M, tableTop, CW, headH, GREEN);
      T(page, font, "内容（ページ別）", (M + splitX) / 2, tableTop - 3, 9.5, { align: "center" });
      T(page, font, "金額（税込み）", (splitX + tableRight) / 2, tableTop - 3, 9.5, {
        align: "center",
      });
      line(page, M, tableTop, tableRight, tableTop, GREY, 0.8);
      line(page, M, tableTop - headH, tableRight, tableTop - headH, GREY, 0.8);
      var bodyTop = tableTop - headH;
      for (var r = 0; r < rpp; r++) {
        var yTop = bodyTop - r * rowH;
        if (r < subs.length) {
          T(page, font, r + 1 + "ページ目", M + 12, yTop - 2.5, 9.5, { align: "left" });
          T(page, font, comma(subs[r]), tableRight - 5, yTop - 2.5, 9.5, { align: "right" });
        }
        line(page, M, yTop - rowH, tableRight, yTop - rowH, GREY, 0.6);
      }
      var tableBottom = bodyTop - rpp * rowH;
      [M, splitX, tableRight].forEach(function (vx) {
        line(page, vx, tableTop, vx, tableBottom, GREY, 0.6);
      });
      return tableBottom;
    }

    function drawPageNo(page) {
      pageNum += 1;
      if (totalPages > 1) {
        T(page, font, pageNum + " / " + totalPages, M + CW, M - 4, 8, {
          align: "right",
          color: GREY,
        });
      }
    }

    // ===== 明細ページ =====
    detailPages.forEach(function (pageRows, pi) {
      var page = doc.addPage([A4.w, A4.h]);
      // 単ページ(=最終)のみ上部に総額。複数ページの明細ページには総額を出さない。
      var cy = drawHeader(page, !multi);
      var tableBottom = drawDetailTable(page, cy, pageRows);
      var footTop = tableBottom - 16;
      if (!multi) {
        drawTotalsFooter(page, footTop);
      } else {
        // 明細ページ：このページの小計＋「次ページへ続く」（総額は最終サマリーに集約）
        T(page, font, "このページの小計", M + CW - 200, footTop, 9.5, { color: DARK });
        T(page, font, yen(pageSubtotals[pi]), M + CW, footTop, 9.5, { align: "right" });
        T(page, font, "次ページへ続く →", M + CW, footTop - 16, 10, {
          align: "right",
          color: DARK,
        });
      }
      drawPageNo(page);
    });

    // ===== ページ別サマリー（複数ページ時のみ・最終ページ） =====
    if (multi) {
      var spage = doc.addPage([A4.w, A4.h]);
      var scy = drawHeader(spage, true); // 上部にご請求金額（総額）
      var sBottom = drawSummaryTable(spage, scy, pageSubtotals);
      drawTotalsFooter(spage, sBottom - 16);
      drawPageNo(spage);
    }
  }

  // ---- 公開: 1社 ----
  async function buildOne(master, co, rows, month, iss, invoiceNo) {
    var a = await loadAssets(iss && iss.pdfFont);
    var doc = await a.PDFLib.PDFDocument.create();
    doc.registerFontkit(a.fontkit);
    var font = await doc.embedFont(a.fontBytes, { subset: false });
    _cov = { fk: a.fontkit.create(a.fontBytes), missing: new Set() };
    var ctx = makeDrawer({ doc: doc, font: font, rgb: a.PDFLib.rgb });
    ctx.logoImg = await embedImg(doc, iss && iss.logo);
    ctx.hankoImg = await embedImg(doc, iss && iss.hanko);
    await drawCompany(
      ctx,
      master,
      co,
      rows,
      month,
      iss,
      invoiceNo || invoiceNoFor(master, null, month, co)
    );
    _lastMissing = [..._cov.missing];
    return await doc.save();
  }

  // ---- 公開: 月内の全社（1つのPDFに連結） ----
  async function buildMonth(master, db, month, accountId, iss) {
    var a = await loadAssets(iss && iss.pdfFont);
    var doc = await a.PDFLib.PDFDocument.create();
    doc.registerFontkit(a.fontkit);
    var font = await doc.embedFont(a.fontBytes, { subset: false });
    _cov = { fk: a.fontkit.create(a.fontBytes), missing: new Set() };
    var ctx = makeDrawer({ doc: doc, font: font, rgb: a.PDFLib.rgb });
    ctx.logoImg = await embedImg(doc, iss && iss.logo);
    ctx.hankoImg = await embedImg(doc, iss && iss.hanko);
    var inMonth = function (iso) {
      return iso && iso.slice(0, 7) === month;
    };
    var cos = Object.keys(master).filter(function (c) {
      return accountId == null || master[c].account_id === accountId;
    });
    var any = false;
    for (var ci = 0; ci < cos.length; ci++) {
      var co = cos[ci];
      var rows = db
        .filter(function (r) {
          return (
            (accountId == null || r.account_id === accountId) && r.会社名 === co && inMonth(r.日付)
          );
        })
        .sort(function (x, y) {
          return (
            (x.日付 || "").localeCompare(y.日付 || "") || (x.id || "").localeCompare(y.id || "")
          );
        });
      if (!rows.length) continue;
      any = true;
      await drawCompany(
        ctx,
        master,
        co,
        rows,
        month,
        iss,
        invoiceNoFor(master, accountId, month, co)
      );
    }
    if (!any) return null;
    _lastMissing = [..._cov.missing];
    return await doc.save();
  }

  // ---- 公開: 保存/共有 ----
  function save(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "請求書.pdf";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  }

  global.InvoicePDF = {
    buildOne: buildOne,
    buildMonth: buildMonth,
    save: save,
    fonts: function () {
      return Object.keys(FONT_FILES);
    },
    fontFile: function (name) {
      return FONT_FILES[name] || FONT_FILES[DEFAULT_FONT];
    },
    lastMissing: function () {
      return _lastMissing.slice();
    },
  };
})(window);
