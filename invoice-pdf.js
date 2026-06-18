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
  var M = 64; // 余白(pt)＝約22.6mm（エレガント版より左右を少し詰めて幅を抑える）
  var CW = A4.w - M * 2; // 本文幅
  var ROWS_PER_PAGE = 22; // 1ページの明細スロット数（HTML/Excelと同じ）
  // Exallyブランドのミント配色（参考の上品レイアウト×アプリの色で統一）
  var MINT, MINTD, MINTBG, BORDER, RULE, TEXT, MUTED, BLACK;
  // クラシック（前テンプレ＝緑ヘッダー帯＋罫線）の配色
  var GREEN, GREY, DARK;
  var _defColor = null; // T() の既定文字色（テーマ別に drawCompany 先頭で設定）
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
    MINT = rgb(0.322, 0.718, 0.533); // #52b788 線・アクセント
    MINTD = rgb(0.239, 0.62, 0.447); // #3d9e72 見出し・ラベル
    MINTBG = rgb(0.941, 0.98, 0.957); // #f0faf4 極薄ミント面
    BORDER = rgb(0.784, 0.925, 0.847); // #c8ecd8 細い境界
    RULE = rgb(0.85, 0.85, 0.85); // 薄グレー罫（明細の行罫）
    TEXT = rgb(0.102, 0.29, 0.18); // #1a4a2e 本文・金額
    MUTED = rgb(0.478, 0.627, 0.549); // #7aa08c 補助文
    BLACK = rgb(0, 0, 0);
    // クラシック用
    GREEN = rgb(220 / 255, 239 / 255, 230 / 255); // 緑ヘッダー帯
    GREY = rgb(0.5, 0.5, 0.5); // 罫線
    DARK = rgb(0.13, 0.13, 0.13); // 本文
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
      color: opts.color || _defColor || TEXT,
    });
    return w;
  }
  function line(page, x1, y1, x2, y2, color, thick) {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: thick || 0.7,
      color: color || RULE,
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

  // ★テーマ振り分け：iss.pdfDesign==="classic" で前テンプレ（緑）、それ以外はエレガント。★
  async function drawCompany(ctx, master, co, rows, month, iss, invoiceNo) {
    if (iss && iss.pdfDesign === "classic") {
      _defColor = BLACK;
      return drawCompanyClassic(ctx, master, co, rows, month, iss, invoiceNo);
    }
    _defColor = TEXT;
    return drawCompanyElegant(ctx, master, co, rows, month, iss, invoiceNo);
  }

  // 1社ぶんを描画して doc にページ追加。（参考のエレガントなレイアウト × Exallyミント配色）
  async function drawCompanyElegant(ctx, master, co, rows, month, iss, invoiceNo) {
    var doc = ctx.doc,
      font = ctx.font;
    var m = master[co] || { items: ["日付", "行き先", "金額"], widths: {} };
    var items = m.items;
    var amtIdx = items.indexOf("金額");
    var pDue = (iss && iss.paymentDue) || m.paymentDue; // お支払期限（自社情報優先・会社マスタfallback）
    var cw = colWidths(items, m.widths);
    var grand = rows.reduce(function (s, r) {
      return s + (Number(r.金額) || 0);
    }, 0);
    var logo = ctx.logoImg,
      hanko = ctx.hankoImg;
    var showLogo = logo && iss && iss.logoMode === "show";
    var monthNum = Number(month.split("-")[1]);
    var bank = (iss && iss.bank) || [];
    var iLines = (iss && iss.lines) || [];
    var CX = M + CW / 2; // 中央x
    var RXp = M + CW; // 右端x
    var headH = 22,
      rowH = 22;
    var FOOT_Y = 116; // 明細テーブルの下限（これより下はフッター領域）
    var noteN = m.noteSummary && (m.noteGroups || []).length ? m.noteGroups.length : 0;

    // ---- ページ分割：単ページに収まるか／収まらなければ明細ページ＋サマリーページ ----
    // 自社情報が多行のときはフッターが高くなるぶん、単ページの明細上限を減らして合計と被らせない。
    var issTall = Math.max(0, (iLines.length || 1) - 4);
    var capSingle = Math.max(8, 17 - noteN - issTall); // 単ページ（御請求金額＋合計＋役職）の明細上限
    var capDetail = 22; // 明細ページ（総額なし）の明細上限
    var multi = rows.length > capSingle;
    var detailPages = [];
    if (multi) {
      for (var i = 0; i < rows.length; i += capDetail)
        detailPages.push(rows.slice(i, i + capDetail));
    } else {
      detailPages.push(rows.slice());
    }
    var pageSubtotals = detailPages.map(function (pr) {
      return pr.reduce(function (s, x) {
        return s + (Number(x.金額) || 0);
      }, 0);
    });
    var totalPages = multi ? detailPages.length + 1 : 1;
    var pageNum = 0;

    // ---- 細い装飾区切り（中央にひし形＋左右の細線） ----
    function flourish(page, y) {
      var d = 4;
      line(page, M, y, CX - 16, y, MINT, 0.8);
      line(page, CX + 16, y, RXp, y, MINT, 0.8);
      // ひし形（線4本）
      line(page, CX - d, y, CX, y + d, MINT, 1);
      line(page, CX, y + d, CX + d, y, MINT, 1);
      line(page, CX + d, y, CX, y - d, MINT, 1);
      line(page, CX, y - d, CX - d, y, MINT, 1);
    }

    // ---- ヘッダー上部（タイトル・装飾・請求日No・宛名・あいさつ）。戻り=本文開始y ----
    function drawTop(page) {
      var cy = A4.h - 50;
      T(page, font, "請　求　書", CX, cy, 26, { align: "center", color: TEXT });
      // 請求日 / No.（右上・控えめ）
      T(page, font, "請求日　" + issueDateStr(month, iss && iss.dateEra), RXp, A4.h - 52, 9, {
        align: "right",
        color: MUTED,
      });
      if (iss && iss.showInvoiceNo && invoiceNo)
        T(page, font, "No.　" + invoiceNo, RXp, A4.h - 64, 9, { align: "right", color: MUTED });
      cy -= 30;
      flourish(page, cy - 4);
      cy -= 26;
      // 宛名（右の期限＋振込先ブロックと被らないよう幅を抑える）
      var aw = T(page, font, co + "　御中", M, cy, 17, { color: TEXT, maxW: CW * 0.5 });
      line(page, M, cy - 21, M + Math.min(aw + 10, CW * 0.5), cy - 21, BORDER, 0.6);
      // ★右ブロック（赤丸の位置）：お支払期限＋振込先を一塊で右上に★
      var ry = cy + 2;
      if (pDue) {
        T(page, font, "お支払期限　" + pDue, RXp, ry, 10, { align: "right", color: TEXT });
        ry -= 16;
      }
      if (bank.length) {
        bank.forEach(function (ln, i) {
          T(page, font, ln, RXp, ry, i === 0 ? 9.5 : 9, {
            align: "right",
            color: i === 0 ? TEXT : MUTED,
          });
          ry -= i === 0 ? 13 : 11;
        });
      }
      cy -= 34;
      // あいさつ
      var lead = ((m.lead || "{月}月のご利用分です。") + "").replace("{月}", monthNum);
      T(page, font, lead, M, cy, 9.5, { color: MUTED });
      cy -= 14;
      T(page, font, "下記の通り御請求申し上げます。", M, cy, 9.5, { color: MUTED });
      cy -= 20;
      return cy;
    }

    // ---- 御請求金額（枠なし＝アプリ統一）。ラベル＋大きい金額＋下にミント線。戻り=次のy ----
    //   ★太字（微小ずらし重ね描き＝疑似ボールド）★
    function drawGrandBox(page, topY) {
      var by = topY;
      var gBold = function (str, x, size, color) {
        var o = size * 0.025;
        T(page, font, str, x, by, size, { color: color });
        T(page, font, str, x + o, by, size, { color: color });
        T(page, font, str, x + o * 2, by, size, { color: color });
        return font.widthOfTextAtSize(_sanitize(str), size);
      };
      var lbl = "御請求金額（税込）";
      var lw = gBold(lbl, M, 12, MINTD);
      var gv = yen(grand);
      gBold(gv, M + lw + 50, 20, TEXT);
      var gw = lw + 50 + font.widthOfTextAtSize(_sanitize(gv), 20);
      line(page, M, by - 25, M + Math.min(gw + 10, 330), by - 25, MINT, 1.2); // 下線
      return by - 25 - 16;
    }

    // ---- 明細テーブル（縦罫なし・薄ミントヘッダー・件数ぶんだけ）。戻り=tableBottom ----
    function drawTable(page, topY, pageRows) {
      var tableTop = topY;
      var colX = [M];
      for (var c = 0; c < cw.length; c++) colX.push(colX[c] + cw[c]);
      // ヘッダー帯
      rect(page, M, tableTop, CW, headH, MINTBG);
      items.forEach(function (k, ci) {
        var cx0 = colX[ci],
          cx1 = colX[ci + 1];
        var label = k === "金額" ? "金額（税込）" : (m.labels && m.labels[k]) || k;
        var al = k === "金額" ? "right" : k === "日付" ? "center" : "left";
        var tx = al === "right" ? cx1 - 8 : al === "center" ? (cx0 + cx1) / 2 : cx0 + 8;
        T(page, font, label, tx, tableTop - 5, 9, { align: al, color: MINTD });
      });
      line(page, M, tableTop, RXp, tableTop, BORDER, 0.5); // 帯の上
      line(page, M, tableTop - headH, RXp, tableTop - headH, MINT, 0.8); // 帯の下（ミント）
      // データ行（件数ぶんだけ）
      var prevDate = null;
      var bodyTop = tableTop - headH;
      var n = pageRows.length;
      for (var r = 0; r < n; r++) {
        var yTop = bodyTop - r * rowH;
        var row = pageRows[r];
        items.forEach(function (k, ci) {
          var cx0 = colX[ci],
            cx1 = colX[ci + 1],
            pad = 9;
          if (k === "日付") {
            var cur = row.日付 || "";
            var val = cur && cur !== prevDate ? mdShort(cur) : "";
            T(page, font, val, (cx0 + cx1) / 2, yTop - 4, 9.5, { align: "center" });
          } else if (k === "金額") {
            T(page, font, comma(row.金額), cx1 - pad, yTop - 4, 9.5, {
              align: "right",
              maxW: cx1 - cx0 - pad * 2,
            });
          } else {
            T(page, font, row[k], cx0 + pad, yTop - 4, 9.5, {
              align: "left",
              maxW: cx1 - cx0 - pad * 2,
            });
          }
        });
        if (row.日付) prevDate = row.日付;
        if (r < n - 1) line(page, M, yTop - rowH, RXp, yTop - rowH, RULE, 0.5); // 行間（薄グレー）
      }
      var tableBottom = bodyTop - n * rowH;
      line(page, M, tableBottom, RXp, tableBottom, MINT, 0.75); // 表を締めるミント線
      return tableBottom;
    }

    // ---- 小計/消費税/合計（右下・アプリと統一＝枠なし・合計の上に線＋太字）。戻り=次のy ----
    function drawTotals(page, topY) {
      var bw = 230,
        bx = RXp - bw,
        rx = RXp,
        sy = topY;
      T(page, font, "小計", bx + 10, sy, 9.5, { color: MUTED });
      T(page, font, yen(grand), rx - 10, sy, 9.5, { color: TEXT, align: "right" });
      sy -= 16;
      T(page, font, "消費税（10%）", bx + 10, sy, 9.5, { color: MUTED });
      T(page, font, yen(tax10(grand)), rx - 10, sy, 9.5, { color: TEXT, align: "right" });
      sy -= 14; // ★線を消費税の文字／数字と重ねない（下げる）★
      line(page, bx + 8, sy, rx, sy, MINT, 0.8); // 合計の上に1本（アプリと同じ）
      sy -= 15;
      T(page, font, "合計", bx + 10, sy, 12, { color: TEXT });
      T(page, font, yen(grand), rx - 10, sy - 1, 14, { color: TEXT, align: "right" });
      sy -= 20;
      // 役職集計（内訳）
      if (noteN) {
        var sums = {};
        (m.noteGroups || []).forEach(function (g) {
          sums[g] = 0;
        });
        rows.forEach(function (x) {
          var g = (x.備考 || "").trim();
          if (sums.hasOwnProperty(g)) sums[g] += Number(x.金額) || 0;
        });
        T(page, font, "（内訳）", bx + 10, sy, 8.5, { color: MUTED });
        sy -= 13;
        (m.noteGroups || []).forEach(function (g) {
          T(page, font, g, bx + 10, sy, 8.5, { color: MUTED });
          T(page, font, sums[g] ? yen(sums[g]) : "", rx - 10, sy, 8.5, {
            color: TEXT,
            align: "right",
          });
          sy -= 12;
        });
      }
      return sy;
    }

    // ---- フッター：長い緑の線＋そのすぐ下に「自社情報(中央揃え・真ん中)」。ロゴありは自社情報の右に大きく。 ----
    //   振込先はヘッダー右ブロック（お支払期限と一塊）へ移動済み。多行でも線が自動で上がりあふれない。
    function drawFooter(page) {
      var nL = iLines.length || 1;
      var issH = nL > 0 ? 13 + (nL - 1) * 10 : 0; // 自社情報ブロック高さ
      // ロゴ寸法（エレガントの基準＝大きめ。logoSizeMm を 1.3倍で効かせ、上限も大きく）。
      var logoW = 0,
        logoH = 0;
      if (showLogo) {
        var asp = logo.width / logo.height;
        logoW = Math.min((Number(iss && iss.logoSizeMm) || 40) * MM * 1.3, 165);
        logoH = logoW / asp;
        if (logoH > 74) {
          logoH = 74;
          logoW = logoH * asp;
        }
      }
      var blockH = Math.max(issH, logoH, 20);
      var FOOT = 78 + blockH; // 線のy（ブロック＋下マージンの上）。ロゴ/多行ほど上がる＝あふれない
      line(page, M, FOOT, RXp, FOOT, MINT, 0.9); // 下の長い緑の線
      var topY = FOOT - 16; // 線のすぐ下
      // ロゴ＝右端固定・上端を線のすぐ下から（大きく）
      if (showLogo)
        page.drawImage(logo, { x: RXp - logoW, y: topY - logoH, width: logoW, height: logoH });
      // 自社情報（中央揃え・ページ中央）＝ブロック内で縦中央に
      var textTop = topY - Math.max(0, (blockH - issH) / 2);
      var fy = textTop;
      iLines.forEach(function (ln, idx) {
        T(page, font, ln, CX, fy, idx === 0 ? 11 : 8, {
          align: "center",
          color: idx === 0 ? TEXT : MUTED,
        });
        fy -= idx === 0 ? 13 : 10;
      });
      // 判子（中央寄せ社名の右端に“重ねて”押す＝角印標準）。左側が社名末尾に被る位置へ。
      if (hanko) {
        var hs = (Number(iss && iss.hankoSizeMm) || 20) * MM * 0.8;
        var nameW = font.widthOfTextAtSize(_sanitize(iLines[0] || ""), 11);
        page.drawImage(hanko, {
          x: CX + nameW / 2 - hs * 0.45, // 社名末尾に重なる
          y: textTop - hs + 9,
          width: hs,
          height: hs,
          opacity: 0.95,
        });
      }
      pageNum += 1;
      if (totalPages > 1)
        T(page, font, pageNum + " / " + totalPages, RXp, 24, 8, { align: "right", color: MUTED });
    }

    // ===== 明細ページ =====
    detailPages.forEach(function (pageRows, pi) {
      var page = doc.addPage([A4.w, A4.h]);
      var cy = drawTop(page);
      if (!multi) cy = drawGrandBox(page, cy); // 単ページのみ上部に御請求金額
      // 表の上に小さなキャプション（運転業務委託料 等）
      T(page, font, "【" + (m.tableTitle || "運転業務委託料") + "】", M, cy, 9, { color: MUTED });
      cy -= 14;
      var tableBottom = drawTable(page, cy, pageRows);
      if (!multi) {
        drawTotals(page, tableBottom - 18);
      } else {
        T(page, font, "このページの小計", RXp - 230, tableBottom - 16, 9, { color: MUTED });
        T(page, font, yen(pageSubtotals[pi]), RXp, tableBottom - 16, 10.5, {
          align: "right",
          color: TEXT,
        });
        T(page, font, "次ページへ続く →", RXp, tableBottom - 32, 9, {
          align: "right",
          color: MUTED,
        });
      }
      drawFooter(page);
    });

    // ===== ページ別サマリー（複数ページ時のみ・最終ページ・コンパクト） =====
    if (multi) {
      var spage = doc.addPage([A4.w, A4.h]);
      var cy2 = drawTop(spage);
      cy2 = drawGrandBox(spage, cy2);
      T(spage, font, "【ページ別 内訳】", M, cy2, 9, { color: MUTED });
      cy2 -= 14;
      // コンパクトなサマリー表（件数ぶんだけ）
      var sAmtX = RXp;
      rect(spage, M, cy2, CW, headH, MINTBG);
      T(spage, font, "ページ", M + 10, cy2 - 5, 9, { color: MINTD });
      T(spage, font, "金額（税込）", RXp - 8, cy2 - 5, 9, { align: "right", color: MINTD });
      line(spage, M, cy2, RXp, cy2, BORDER, 0.5);
      line(spage, M, cy2 - headH, RXp, cy2 - headH, MINT, 0.8);
      var sbTop = cy2 - headH;
      pageSubtotals.forEach(function (sub, r) {
        var yT = sbTop - r * rowH;
        T(spage, font, r + 1 + "ページ目", M + 10, yT - 4, 9.5, { color: TEXT });
        T(spage, font, comma(sub), sAmtX - 8, yT - 4, 9.5, { align: "right", color: TEXT });
        if (r < pageSubtotals.length - 1) line(spage, M, yT - rowH, RXp, yT - rowH, RULE, 0.5);
      });
      var sBottom = sbTop - pageSubtotals.length * rowH;
      line(spage, M, sBottom, RXp, sBottom, MINT, 0.75);
      drawTotals(spage, sBottom - 18);
      drawFooter(spage);
    }
  }

  // =====================================================================
  // クラシック（前テンプレ）：緑ヘッダー帯＋罫線の伝統的レイアウト。
  //   style A=左タイトル＋右上ロゴ／style B=中央タイトル（テンプレ差がはっきり出る）。
  //   幅はエレガントと同じ本文幅フル。行き先は左寄せ、最終ページは塊を下げてバランス。
  // =====================================================================
  async function drawCompanyClassic(ctx, master, co, rows, month, iss, invoiceNo) {
    var doc = ctx.doc,
      font = ctx.font;
    var m = master[co] || { items: ["日付", "行き先", "金額"], widths: {} };
    var items = m.items;
    var amtIdx = items.indexOf("金額");
    var pDue = (iss && iss.paymentDue) || m.paymentDue; // お支払期限（自社情報優先・会社マスタfallback）
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
    var multi = detailPages.length > 1;
    var totalPages = multi ? detailPages.length + 1 : 1;
    var pageNum = 0;

    // ---- 共通ヘッダー。bodyTop で「請求書」より下を塊ごと下げられる（最終ページ用）。----
    function drawHeader(page, showGrand, bodyTop) {
      var cy = A4.h - M;
      var dateStr = "請求日　" + issueDateStr(month, iss && iss.dateEra);
      var noStr = iss && iss.showInvoiceNo && invoiceNo ? "No.　" + invoiceNo : "";
      if (style === "A" && logo && iss && iss.logoMode === "show") {
        // クラシックの基準＝右上ロゴをやや大きめに（logoSizeMm を1.15倍・高さ上限32mm）
        var maxW = (Number(iss.logoSizeMm) || 40) * MM * 1.15,
          maxH = 32 * MM;
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
        cy -= 14;
        if (pDue) {
          T(page, font, "お支払期限　" + pDue, M, cy, 10, { color: DARK });
          cy -= 14;
        }
        cy -= 18; // ★黄色＝請求日/No→御中の隙間を少し広げる★
      } else {
        T(page, font, dateStr, M + CW, cy, 9.5, { align: "right", color: DARK });
        cy -= 13;
        if (noStr) {
          T(page, font, noStr, M + CW, cy, 9.5, { align: "right", color: DARK });
          cy -= 13;
        }
        if (pDue) {
          T(page, font, "お支払期限　" + pDue, M + CW, cy, 9.5, {
            align: "right",
            color: DARK,
          });
          cy -= 13;
        }
        cy -= 6;
        T(page, font, "請　求　書", M + CW / 2, cy, 22, { align: "center" });
        cy -= 42; // ★黄色相当＝タイトル→御中の隙間（2枚目もバランス統一）★
      }
      var topRow = bodyTop != null ? bodyTop : cy;
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
        // ★ご請求金額：ラベルと数字を同じ大きさに統一＋太字（微小ずらし重ね描き＝疑似ボールド）★
        //   緑＝下線→表の隙間は黄色の約2倍。
        var gSize = 16;
        var gBold = function (str, x) {
          var o = gSize * 0.025; // ずらし幅（疑似ボールド）
          T(page, font, str, x, cy, gSize, { color: BLACK });
          T(page, font, str, x + o, cy, gSize, { color: BLACK });
          T(page, font, str, x + o * 2, cy, gSize, { color: BLACK });
          return font.widthOfTextAtSize(_sanitize(str), gSize);
        };
        var gLabel = "ご請求金額（税込）";
        var glw = gBold(gLabel, M);
        var gv = yen(grand);
        gBold(gv, M + glw + 40);
        var gTextW = glw + 40 + font.widthOfTextAtSize(_sanitize(gv), gSize);
        line(page, M, cy - 22, M + gTextW + 8, cy - 22, BLACK, 1.4);
        return cy - 22 - 56; // 緑の隙間≈黄色(約28)の2倍
      }
      return cy - 30;
    }

    // ---- 合計フッター（左=振込先／右=小計・消費税・合計＋役職集計）。本文幅フルなので左右並びでOK。----
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

    // ---- 明細テーブル（緑ヘッダー＋縦罫・件数ぶんだけ・行き先は左寄せ）。戻り=tableBottom ----
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
      var n = pageRows.length; // 件数ぶんだけ（空行で埋めない）
      for (var r = 0; r < n; r++) {
        var yTop = bodyTop - r * rowH;
        var row = pageRows[r];
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
            T(page, font, row[k], cx0 + 8, yTop - 2.5, 9, {
              align: "left",
              maxW: cx1 - cx0 - 14,
            });
          }
        });
        if (row.日付) prevDate = row.日付;
        if (r < n - 1) line(page, M, yTop - rowH, tableRight, yTop - rowH, GREY, 0.5); // 行間（最終行の下は引かない）
      }
      var tableBottom = bodyTop - n * rowH;
      // ★縦罫は引かない（エレガントと同じ横罫だけ＝見やすく）。表を締める下線のみ。★
      line(page, M, tableBottom, tableRight, tableBottom, GREY, 0.8);
      return tableBottom;
    }

    // ---- ページ別サマリーテーブル（最終ページ・件数ぶんだけ）----
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
      var n = subs.length;
      for (var r = 0; r < n; r++) {
        var yTop = bodyTop - r * rowH;
        T(page, font, r + 1 + "ページ目", M + 12, yTop - 2.5, 9.5, { align: "left" });
        T(page, font, comma(subs[r]), tableRight - 8, yTop - 2.5, 9.5, { align: "right" });
        if (r < n - 1) line(page, M, yTop - rowH, tableRight, yTop - rowH, GREY, 0.5);
      }
      var tableBottom = bodyTop - n * rowH;
      // ★縦罫は引かない（横罫だけ）。表を締める下線のみ。★
      line(page, M, tableBottom, tableRight, tableBottom, GREY, 0.8);
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
      var cy = drawHeader(page, !multi);
      var tableBottom = drawDetailTable(page, cy, pageRows);
      var footTop = tableBottom - 16;
      if (!multi) {
        drawTotalsFooter(page, footTop);
      } else {
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
    //  ★請求書→御中の隙間も1枚目と統一＝通常ヘッダー（130pt落としは廃止）。★
    if (multi) {
      var spage = doc.addPage([A4.w, A4.h]);
      var scy = drawHeader(spage, true); // 1枚目と同じ間隔
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
