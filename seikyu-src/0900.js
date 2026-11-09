      // 請求書シート＝上に「目次（会社×年月）」、下に各請求書をアプリと同じページ割り(22行/ページ)で積む。
      // 1請求書が複数ページなら各ページに発行者/宛名を繰り返し・最終ページに合計・ページ間で改ページ。
      // 目次タップ→その請求書の1ページ目へ。各ページから「↩一覧へ」。
      // 返り値 {aoa, links, backs, breaks}（行は1始まり・breaks=各ページ先頭行）
      function _exlInvoiceData(fCos, fMonths) {
        var empty = { aoa: [], styles: {}, merges: [], links: [], backs: [], breaks: [] };
        if (typeof MeisaiEngine === "undefined") return empty;
        var U = MeisaiEngine.utils;
        // Excelの請求書はA4縦1枚を明細でいっぱいに使う＝アプリ画面プレビュー(22)より多くの
        // 明細スロットを持たせる（司さん指示「明細を入れる行は増やして」）。A4縦1枚に収まる上限。
        var PER = 28;
        // ★会社毎テンプレ：このシートが1社だけ(会社毎シート分割)ならその会社のデザインを使う。
        //   複数社/全社(旧・単一シート経路)は会社指定なし＝全体設定（従来どおり・バイト不変）。
        var iss = issuerForEngine(fCos && fCos.length === 1 ? fCos[0] : null);
        // ★Excelにも「文字サイズ」を反映（全体fontScale）。A4縦1枚を守るため上限は控えめ(1.2)。
        //   クラシックはPDFが文字サイズ非対応なので整合させ1.0固定。標準(1.0)では全 sz/heights が
        //   元値のまま＝生成バイト完全不変。範囲別(blkFs)のセル単位反映は段階2（ここは全体のみ）。
        var _exlFs =
          iss.pdfDesign === "classic"
            ? 1
            : Math.max(0.85, Math.min(1.2, Number(iss.fontScale) || 1));
        // ヘッダー型：A=対角(左タイトル+右ロゴ/自社情報・会計ソフト標準/専門家推奨) / B=中央タイトル(整理版)
        var headerStyle = iss.headerStyle || "A";
        var invs = MeisaiEngine.listInvoices(DB, CURRENT_ACCOUNT, null);
        // ★選択式Excel：会社/月で絞る（fCos/fMonths が空なら全部）。
        if (fCos && fCos.length) invs = invs.filter((iv) => fCos.indexOf(iv.company) >= 0);
        if (fMonths && fMonths.length) invs = invs.filter((iv) => fMonths.indexOf(iv.month) >= 0);
        if (!invs.length) return empty;

        // ===== スタイル素材（PDFに寄せる） =====
        var THIN = { style: "thin", color: { rgb: "808080" } };
        var BOX = { top: THIN, bottom: THIN, left: THIN, right: THIN };
        var YEN = '"¥"#,##0';
        // ★PDFのミント配色（文字色）。色未指定セル（＝黒）を本文＝濃い緑にして「色がPDFと違う」を解消。
        // ★SheetJS の rgb は「#」を書かない★ ＝ 濃い緑の見張りが素通りしていた場所（2026-08-10 に発見）
        // ★紙の文字の濃さは「全体の色」から作らない。固定する★（指示役 2026-08-15）
        //   薄い色を選ばれた瞬間 読めない請求書が客先へ出る。紙はPDFと同じ濃さにする。
        var C_TEXT = { rgb: "1A1A1A" }; // 本文・明細・金額・宛名（★旧 0A5FD0＝全体の色そのものだった★）
        var C_LABEL = { rgb: "1A1A1A" }; // 見出し・ラベル（★見出しの「字」に色は付けない★）
        var C_MUTED = { rgb: "444444" }; // 副の情報・自社情報・あいさつ（★旧 5A6B82＝薄い灰青★）
        var C_ACCENT = { rgb: "0A5FD0" }; // ★全体の色。★線だけ★に使う（文字には使わない）
        var aoa = [],
          styles = {},
          merges = [],
          heights = {}; // 行→高さ(pt)。表/タイトル等をアプリに寄せる
        var indexRowOf = [],
          firstPageRowOf = [],
          backs = [],
          breaks = [],
          invCols = null, // シート共通の列幅（最初の請求書の項目構成で決定）
          hankoAnchors = [], // 判子の貼り位置（各請求書ページの右上）
          logoAnchors = []; // ロゴ画像の貼り位置（各請求書ページの左上）
        function row(cells) {
          aoa.push(cells || []);
          return aoa.length - 1; // 0始まりの行index
        }
        function S(r, c, s) {
          if (s && s.font) {
            if (_exlFs !== 1 && s.font.sz) s.font.sz = Math.round(s.font.sz * _exlFs); // 文字サイズ係数
            if (!s.font.color) s.font.color = C_TEXT; // ★色未指定（黒）→PDFの本文緑に既定化
          }
          styles[XLSX.utils.encode_cell({ r: r, c: c })] = s;
        }
        function M(r1, c1, r2, c2) {
          merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
        }
        // 画像アンカー＝oneCellAnchor（セル基準＝改ページに正しく追従）。
        // 表の中央寄せは horizontalCentered ではなく「表幅に合わせた左右対称マージン」で行う
        // （horizontalCenteredは右上ロゴ＋判子の偏りに引っ張られ表が左にズレるため不使用）。
        function anchorAt(col, rw, colOff, rowOff) {
          return { col: col, row: rw, colOff: colOff || 0, rowOff: rowOff || 0 };
        }

        // ===== 目次は別シートに出す（請求書シートは請求書だけ＝印刷がきれい・見本Excel同様） =====
        // ここでは目次行を作らない。各請求書の先頭行(firstPageRowOf)を目次シートのリンク先に使う。

        // ===== 各請求書（PDF体裁・全幅レイアウト・ページ割り） =====
        // 表を横幅いっぱいに：行き先(テキスト列)を複数列にまたがらせ、金額を右端に。
        // 発行者は右上ゾーン(左揃え)、宛名/リードは左。アプリPDFに合わせる。
        function issDateStr(month, era) {
          var p = month.split("-"),
            y = Number(p[0]),
            mm = Number(p[1]) + 1;
          if (mm > 12) {
            mm = 1;
            y += 1;
          }
          return era === "reiwa" ? "令和" + (y - 2018) + "年" + mm + "月1日" : y + "/" + mm + "/1";
        }
        // 全請求書で総列数を揃える＝項目が少ない請求書はテキスト列を余分に伸ばす。
        // （列数が違うと狭い請求書に右端の空列が残り、表が左に寄って両端余白がズレる）
        var maxItemsLen = invs.reduce(function (mx, iv) {
          var mm = MASTER[iv.company];
          var its = mm && mm.items && mm.items.length ? mm.items : ["日付", "行き先", "金額"];
          return Math.max(mx, its.length);
        }, 3);
        invs.forEach(function (iv) {
          var co = iv.company,
            month = iv.month;
          var m = MASTER[co] || { items: ["日付", "行き先", "金額"] };
          var items = m.items && m.items.length ? m.items : ["日付", "行き先", "金額"];
          var amt = items.indexOf("金額");
          if (amt < 0) amt = items.length - 1;
          // 横幅を稼ぐテキスト列（行き先優先）を決め、+2列ぶん広げる
          var textIdx = items.indexOf("行き先");
          if (textIdx < 0)
            for (var ti = 0; ti < items.length; ti++)
              if (items[ti] !== "日付" && items[ti] !== "金額") {
                textIdx = ti;
                break;
              }
          if (textIdx < 0) textIdx = amt > 0 ? amt - 1 : 0;
          var spans = items.map(function () {
            return 1;
          });
          spans[textIdx] += 2 + Math.max(0, maxItemsLen - items.length);
          var colStart = [],
            acc = 0;
          items.forEach(function (k, i) {
            colStart.push(acc);
            acc += spans[i];
          });
          var W = acc,
            lastCol = W - 1;
          var amtDisp = colStart[amt];
          // ★列幅を動的計算（項目が増減しても破綻しない再利用グリッド）★
          // 役割ごとに固定幅、伸縮するのは行き先（テキスト主役）1本だけ＝専門家③設計。
          function roleWidth(k) {
            if (k === "日付") return 9;
            if (k === "金額") return 15;
            if (k === "人数") return 8;
            if (k === "距離") return 10;
            if (k === "名前") return 13;
            if (k === "行き先") return 39; // span3に分配される主役テキスト列
            return 14; // 備考・自由項目（テキスト）
          }
          var colWidths = [];
          items.forEach(function (k, ci) {
            var span = spans[ci],
              total = roleWidth(k);
            for (var s = 0; s < span; s++) colWidths.push(Math.max(5, Math.round(total / span)));
          });
          // シートの列幅は共通＝最初の請求書の項目構成で確定（各社1ページずつ）
          if (!invCols)
            invCols = colWidths.map(function (w) {
              return { wch: w };
            });
          // 発行者ゾーンは表の右端の2列。左ゾーン(宛名/あいさつ/ご請求金額)を広く取り文章切れを防ぐ。
          var rightStart = Math.max(2, lastCol - 1);
          // 縦線＝行き先より右の各列の左に入れる（距離/人数/金額…を仕切る）。本文は横線主体。
          var vlCols = {};
          items.forEach(function (k, ci) {
            if (ci > textIdx) vlCols[colStart[ci]] = 1;
          });
          // ★「ご請求金額」の下線は ★金額の下まで★（右端まで引かない）★
          //   司さん 2026-08-15「なぜExcelの方のご請求金額の下線は右端までいっとんど／金額の下までやろが」
          //   紙(PDF)は文字の幅ぶんだけ線を引く。Excelは列の切れ目でしか止められないので、
          //   ★文字が届いた列★までで止める（列幅は本物の !cols から数える）。
          function _wchOfCol(c) {
            var w = (invCols && invCols[c] && invCols[c].wch) || (colWidths && colWidths[c]) || 9;
            return Number(w) || 9;
          }
          function _needWchOf(str, sz) {
            var n = 0;
            String(str == null ? "" : str)
              .split("")
              .forEach(function (ch) {
                n += /[ -~｡-ﾟ]/.test(ch) ? 1 : 2; // 全角=2・半角=1
              });
            return Math.ceil((n * (sz || 11)) / 11);
          }
          // ★線を止める列＝文字の幅を「超えない」最後の列★
          //   超える方で数えると1列ぶん先まで線が伸びる（実測 金額の右端54.7%に対し線66.1%）。
          //   超えない方で止めると 線は金額のほぼ真下で終わる（実測 52.2%）。
          function _lineCols(str, sz, maxCol) {
            var need = _needWchOf(str, sz),
              acc = 0,
              last = 0;
            for (var c = 0; c <= maxCol; c++) {
              acc += _wchOfCol(c);
              if (acc > need) break;
              last = c;
            }
            return last;
          }
          var blank = function () {
            var a = [];
            for (var i = 0; i < W; i++) a.push("");
            return a;
          };

          var allRows = DB.filter(function (r) {
            return r.account_id === CURRENT_ACCOUNT && r.会社名 === co && U.inMonth(r.日付, month);
          }).sort(function (a, b) {
            return (
              (a.日付 || "").localeCompare(b.日付 || "") || (a.id || "").localeCompare(b.id || "")
            );
          });
          var mo = Number(month.split("-")[1]);
          var grand = allRows.reduce(function (s, r) {
            return s + (Number(r.金額) || 0);
          }, 0);
          // 税方式：内税(既定・金額=税込) / 外税(金額=税抜→消費税を別途加算)。会社マスタ taxMode。
          var isSoto = m.taxMode === "外税";
          var billTotal = isSoto ? grand + Math.round(grand * 0.1) : grand; // ご請求金額(税込)
          // ★上の 大きい「ご請求金額（税込）」★ 繰越の 会社は 今回ご請求額（紙と 同じ エンジン 1本・2026-11-01／11-02 司さん）
          var _crUe = m.carryover ? _carryFor(co, month) : null;
          var billUe = MeisaiEngine.ueNoGaku(billTotal, _crUe);
          // ★上の 額の 字★ 繰越の 会社は マイナスを ▲（紙と 同じ sankakuYen）・使わない 会社は 今まで 通り
          var billUeJi = _crUe
            ? MeisaiEngine.sankakuYen(billUe)
            : "¥" + String(billUe).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          // ★PDFと配置を一致：ヘッダ右上＝お振込先、下＝自社情報（従来のExcelは上下逆だった）。
          var hdrInfo =
            iss.bank && iss.bank.length
              ? /振込/.test(iss.bank[0])
                ? iss.bank.slice()
                : ["お振込先"].concat(iss.bank)
              : iss.lines || [];
          var ftrInfo = iss.lines || []; // 下段の自社情報（フッター）
          // 下段が増えるテンプレ（役職集計/源泉/繰越/税率別）は明細スロットを減らしA4縦1枚に。
          var extraFooter = 0;
          if (m.noteSummary && (m.noteGroups || []).length) extraFooter += m.noteGroups.length + 3;
          if (m.withholding) extraFooter += 2;
          if (m.carryover) extraFooter += 3 + (_crUe && _crUe.seikyuGaku < 0 ? 1 : 0); // ▲の 説明の 1行
          if (m.taxRates) extraFooter += 2;
          if (headerStyle === "A") extraFooter += 4; // 対角ヘッダーは天マージン等で上部が高い
          PER = Math.max(12, 28 - extraFooter);
          var pageCount = Math.max(1, Math.ceil(allRows.length / PER));
          var BAND = { fgColor: { rgb: "F2F2F2" } }; // クラシックの帯＝★白黒のまま★（ごく薄い灰）
          // ★デザイン分岐：elegant＝淡ミント＋横罫だけ／classic＝緑＋#808080全罫（PDFと一致）★
          var isElegant = (iss.pdfDesign || "elegant") === "elegant";
          var HDR_FILL = isElegant ? { fgColor: { rgb: "F2F7FF" } } : BAND;
          // ★罫線は濃さで作る（色で作らない）★ 白黒コピーで飛ばない灰
          var HRULE = { style: "thin", color: { rgb: isElegant ? "BFBFBF" : "808080" } };

          // ★複数ページは最終に「サマリーページ（ご請求金額＋ページ別内訳＋合計＋振込先）」を足す＝PDF同様。
          var hasSummary = pageCount > 1;
          var totalPages = pageCount + (hasSummary ? 1 : 0);
          var pageSubs = []; // 各明細ページの小計（サマリーの【ページ別内訳】用）
          for (var pi = 0; pi < totalPages; pi++) {
            var isSummary = hasSummary && pi === pageCount; // 最終＝サマリーページ
            var pageRows = isSummary ? [] : allRows.slice(pi * PER, (pi + 1) * PER);
            var pageTotal = pageRows.reduce(function (s, r) {
              return s + (Number(r.金額) || 0);
            }, 0);
            if (!isSummary) pageSubs.push(pageTotal);
            var startRow = aoa.length + 1;
            breaks.push(startRow);
            backs.push(startRow);
            if (pi === 0) firstPageRowOf.push(startRow);

            if (headerStyle === "A") {
              // ===== 対角ヘッダー：左=タイトル＋請求日／右上=ロゴ（大きめ）。自社情報は宛名の高さ＝B同様 =====
              var rmar = row(blank());
              heights[rmar] = 12; // 天マージン（呼吸）
              // タイトル(左・大) ＋ ロゴ(右上・大きめ＝タイトルとバランス)
              var rTa = blank();
              rTa[0] = "請　求　書";
              var riTa = row(rTa);
              M(riTa, 0, riTa, Math.max(rightStart - 1, 0));
              heights[riTa] = 34;
              S(riTa, 0, {
                font: { bold: true, sz: 22, color: C_TEXT }, // ★司さん「請求書って文字も同じ黒に」★
                alignment: { horizontal: "left", vertical: "center" },
              });
              // ロゴ＝右上の隅（会議：空いた右上に大きめ）。右マージンを小さくした(非対称)ので
              // 印刷可能域が右に広がり、ロゴを右端(lastCol)に置いても横分割されない。
              // テンプレが「ロゴ型(show)」かつ自社情報にロゴ登録あり のときだけ描く。
              if (iss.logo && iss.logoMode === "show")
                logoAnchors.push(anchorAt(lastCol, rmar, 90000, 0));
              // 請求日/No/期限（左・小・1グループ）。自社情報はここに出さず、下の宛名の高さに置く。
              var leftMeta = ["請求日　" + issDateStr(month, iss.dateEra)];
              if (iss.showInvoiceNo) leftMeta.push("No. " + invoiceNoFrozen(month, co));
              var _pdueA = iss.paymentDue || m.paymentDue;
              if (_pdueA) leftMeta.push("お支払期限　" + _pdueA);
              // ★ページ番号は請求日に足さない（PDF同様。右下に別途出す＝_xlPageNo）。
              leftMeta.forEach(function (mt) {
                var mrx = blank();
                mrx[0] = mt;
                var mri = row(mrx);
                M(mri, 0, mri, Math.max(rightStart - 1, 0));
                S(mri, 0, { font: { sz: 9 }, alignment: { horizontal: "left" } });
                heights[mri] = 13;
              });
              var rgapA = row(blank());
              heights[rgapA] = 10; // タイトル群と宛名の谷
              // 宛名(左) ＋ 自社情報(右・宛名の高さから) ＝ B同様の2カラム
              var atA = blank();
              atA[0] = co + "　御中";
              atA[rightStart] = hdrInfo[0] || ""; // ★ヘッダ右＝お振込先（PDF同様）
              var riAtA = row(atA);
              heights[riAtA] = 22;
              M(riAtA, 0, riAtA, rightStart - 1);
              M(riAtA, rightStart, riAtA, lastCol);
              S(riAtA, 0, { font: { sz: 16 } });
              S(riAtA, rightStart, {
                font: { sz: 10 },
                alignment: { horizontal: "right" },
              });
              // 判子は自社情報フッター（下段）に押す＝ヘッダ右はお振込先になったため。
              // リード(宛名から2行下げてくっつき解消) ＋ 自社情報の続き(右) ＋ ご請求金額
              var leftLinesA = [];
              if (m.lead) leftLinesA.push(String(m.lead).replace(/\{月\}/g, mo));
              // 「消費税は10%…」は下段の消費税内訳と重複＋税率混在で不正確なので出さない。
              leftLinesA.push("下記の通り御請求申し上げます。");
              var issRestA = hdrInfo.slice(1);
              var gapA = 2; // 宛名とリードの間隔（くっつき解消）
              var nA = Math.max(gapA + leftLinesA.length + 1, issRestA.length);
              for (var ka = 0; ka < nA; ka++) {
                var liA = ka - gapA;
                var rra = blank();
                if (liA >= 0 && liA < leftLinesA.length) rra[0] = leftLinesA[liA];
                if (issRestA[ka]) rra[rightStart] = issRestA[ka];
                var rria = row(rra);
                if (issRestA[ka]) {
                  M(rria, rightStart, rria, lastCol);
                  S(rria, rightStart, {
                    font: { sz: 10 },
                    alignment: { horizontal: "right" },
                  });
                }
                if (liA >= 0 && liA < leftLinesA.length) {
                  M(rria, 0, rria, rightStart - 1);
                  S(rria, 0, { font: { sz: 10 } });
                }
                if (liA === leftLinesA.length && (pageCount === 1 || isSummary)) {
                  // ★ご請求金額は単ページ or 最終サマリーページのみ（途中ページには出さない＝PDF同様）。
                  //   同じ行に自社情報がある時は左ゾーンだけ結合＝右の自社情報結合と重ならない（重複→修復/見切れ防止）。
                  var goseiR = issRestA[ka] ? rightStart - 1 : lastCol;
                  var yenA = billUeJi;
                  // ★線は「金額の下まで」★（右端まで引かない）＝司さん 2026-08-15
                  //   Excelは列の切れ目でしか線を止められないので、
                  //   ★ラベルと金額を別のセルにし、金額を右寄せ★にして
                  //   その列の右端＝金額の右端＝線の終わり に揃える。
                  // ★形は変えない★＝ラベルと金額は本番どおり1つのセル（司さん 2026-08-15）
                  //   変えるのは ★線をどこで止めるか★ だけ。
                  aoa[rria][0] = "ご請求金額（税込）　　" + yenA;
                  // ★結合は本番のまま★（縮めると 金額が「¥30,00」と欠ける＝結合は文字をはみ出させない）
                  M(rria, 0, rria, goseiR);
                  var ulA = _lineCols(aoa[rria][0], 16, goseiR); // ★線を止める列だけ短くする★
                  S(rria, 0, {
                    font: { bold: true, sz: 16 }, // ★PDF同様に大きく目立たせる
                    alignment: { horizontal: "left", vertical: "center" },
                    border: { bottom: { style: "medium" } },
                  });
                  heights[rria] = 26;
                  for (var uba = 1; uba <= ulA; uba++)
                    S(rria, uba, { border: { bottom: { style: "medium" } } });
                }
              }
              row(blank());
            } else {
              // ===== 中央タイトル型（従来＝整理版） =====
              // 請求日（右上・西暦/令和は設定に従う）
              var meta = "請求日　" + issDateStr(month, iss.dateEra);
              if (iss.showInvoiceNo) meta += "　No." + invoiceNoFrozen(month, co);
              // ★ページ番号は請求日に足さない（PDF同様・右下へ）。
              var r0 = blank();
              r0[rightStart] = meta;
              var ri0 = row(r0);
              M(ri0, rightStart, ri0, lastCol);
              S(ri0, rightStart, { font: { sz: 9 }, alignment: { horizontal: "right" } });
              // ロゴ画像＝左上角（請求日が右上・中央タイトルと衝突しない位置）。
              // 中央タイトルは中央のみ＝左端のロゴは本文と被らない。画像はあとでJSZip注入。
              if (iss.logo && iss.logoMode === "show") logoAnchors.push(anchorAt(0, ri0, 30000, 0));
              // お支払期限（自社情報優先・会社マスタfallback。請求日の下・右上）
              var _pdueB = iss.paymentDue || m.paymentDue;
              if (_pdueB) {
                var rd = blank();
                rd[rightStart] = "お支払期限　" + _pdueB;
                var rdi = row(rd);
                M(rdi, rightStart, rdi, lastCol);
                S(rdi, rightStart, { font: { sz: 9 }, alignment: { horizontal: "right" } });
              }

              // タイトル「請 求 書」中央・特大
              var rT2 = blank();
              rT2[0] = "請　求　書";
              var riT = row(rT2);
              M(riT, 0, riT, lastCol);
              heights[riT] = 28;
              S(riT, 0, {
                // 専門家助言：字間/サイズを締める（26→20）。太字は司さん指定で維持。
                font: { bold: true, sz: 20, color: C_TEXT }, // ★司さん「請求書って文字も同じ黒に」★
                alignment: { horizontal: "center", vertical: "center" },
              });
              row(blank());

              // 宛名(左) / 発行者(右・左揃え)
              var atRow = blank();
              atRow[0] = co + "　御中";
              atRow[rightStart] = hdrInfo[0] || ""; // ★ヘッダ右＝お振込先（PDF同様）
              var riAt = row(atRow);
              heights[riAt] = 24;
              M(riAt, 0, riAt, rightStart - 1);
              M(riAt, rightStart, riAt, lastCol);
              // 見本どおり会社名は太字でない（太字はご請求金額と合計だけ）。サイズも見本に合わせる。
              S(riAt, 0, { font: { sz: 14 } }); // 宛名 御中 sz14
              S(riAt, rightStart, {
                font: { sz: 10 }, // 自社情報1行目 sz10
                alignment: { horizontal: "right" },
              });
              // 判子は自社情報フッター（下段）に押す＝ヘッダ右はお振込先になったため。

              // リード／ご請求金額（左・宛名から2行下げる＝sh-leadwrapの余白）＋発行者の続き(右)
              var leftLines = [];
              if (m.lead) leftLines.push(String(m.lead).replace(/\{月\}/g, mo));
              // 「消費税は10%…」は下段の消費税内訳と重複＋税率混在で不正確なので出さない。
              leftLines.push("下記の通り御請求申し上げます。");
              var issRest = hdrInfo.slice(1);
              var gap = 2; // 宛名とリードの間隔（左だけ空ける／発行者は連続）
              var n = Math.max(gap + leftLines.length + 1, issRest.length);
              for (var k = 0; k < n; k++) {
                var leftI = k - gap;
                var rr = blank();
                if (leftI >= 0 && leftI < leftLines.length) rr[0] = leftLines[leftI];
                if (issRest[k]) rr[rightStart] = issRest[k];
                var rri = row(rr);
                if (issRest[k]) {
                  M(rri, rightStart, rri, lastCol);
                  S(rri, rightStart, {
                    font: { sz: 10 }, // 見本どおり自社情報 sz10
                    alignment: { horizontal: "right" },
                  });
                }
                if (leftI >= 0 && leftI < leftLines.length) {
                  M(rri, 0, rri, rightStart - 1);
                  S(rri, 0, { font: { sz: 10 } }); // 見本どおりあいさつ文 sz10
                }
                if (leftI === leftLines.length && (pageCount === 1 || isSummary)) {
                  // ★ご請求金額は単ページ or 最終サマリーページのみ（PDF同様）。
                  // ご請求金額（税込）¥xxx ＝ ラベル＋金額を左ゾーン全幅で1セルに（切れ防止）。
                  // 見本どおり sz13 太字・下線。左ゾーン(0..rightStart-1)に下線を引く。
                  var yenStr = billUeJi;
                  aoa[rri][0] = "ご請求金額（税込）　　" + yenStr;
                  // 同じ行に自社情報がある時は左ゾーンだけ結合＝右の自社情報結合と重ならない（重複→修復/見切れ防止）。
                  var goseiRB = issRest[k] ? rightStart - 1 : lastCol;
                  // ★線は「金額の下まで」★（上と同じ作り）
                  // ★形は変えない★＝本番どおり1つのセル。変えるのは線を止める列だけ。
                  // ★結合は本番のまま★（縮めると金額が欠ける）
                  M(rri, 0, rri, goseiRB);
                  var ulB = _lineCols(aoa[rri][0], 16, goseiRB); // ★線を止める列だけ短くする★
                  S(rri, 0, {
                    font: { bold: true, sz: 16 }, // ★PDF同様に大きく目立たせる
                    alignment: { horizontal: "left", vertical: "center" },
                    border: { bottom: { style: "medium" } },
                  });
                  heights[rri] = 26;
                  for (var ub = 1; ub <= ulB; ub++)
                    S(rri, ub, { border: { bottom: { style: "medium" } } });
                }
              }
              row(blank());
            } // end headerStyle B

            if (isSummary) {
              // ===== サマリーページ：明細でなく【ページ別 内訳】（各ページの小計一覧）＝PDF同様 =====
              var sumLbl = Math.max(lastCol - 1, 0); // ラベル列（最右の1つ左）
              var sumAmt = lastCol; // 金額＝右端
              var capRow = blank();
              capRow[0] = "【ページ別 内訳】";
              var capRi = row(capRow);
              S(capRi, 0, { font: { sz: 9, color: C_MUTED } });
              heights[capRi] = 14;
              var shd = blank();
              shd[0] = "ページ";
              shd[sumAmt] = "金額（税込）";
              var shdRi = row(shd);
              heights[shdRi] = 20;
              M(shdRi, 0, shdRi, sumLbl);
              for (var sc = 0; sc < W; sc++)
                S(shdRi, sc, {
                  font: { bold: true, sz: 12, color: C_LABEL },
                  alignment: { horizontal: sc === sumAmt ? "right" : "left", vertical: "center" },
                  fill: HDR_FILL,
                  border: isElegant ? { bottom: { style: "thin", color: C_ACCENT } } : BOX,
                });
              pageSubs.forEach(function (sub, si) {
                var sr2 = blank();
                sr2[0] = si + 1 + "ページ目";
                sr2[sumAmt] = sub;
                var sr2i = row(sr2);
                heights[sr2i] = 16;
                M(sr2i, 0, sr2i, sumLbl);
                S(sr2i, 0, {
                  font: { sz: 11 },
                  alignment: { horizontal: "left" },
                  border: isElegant ? { bottom: HRULE } : BOX,
                });
                S(sr2i, sumAmt, {
                  font: { sz: 11 },
                  numFmt: "#,##0",
                  alignment: { horizontal: "right" },
                  border: isElegant ? { bottom: HRULE } : BOX,
                });
              });
              row(blank());
            } else {
              // 表ヘッダー：運転業務委託料（日付＋行き先にかける）／増えた項目は各自に見出し／金額（税込み）
              var hd = blank();
              var titleEnd = colStart[textIdx] + spans[textIdx] - 1; // 行き先（説明ブロック）の右端
              hd[0] = amt > 0 ? m.tableTitle || "運転業務委託料" : "金額（税込み）";
              // 行き先より後・金額より前の項目（距離/人数等）＝各列に見出しを付ける
              items.forEach(function (k2, ci) {
                if (ci > textIdx && ci < amt) hd[colStart[ci]] = U.labelOf(m, k2);
              });
              hd[amtDisp] = "金額（税込み）";
              items.slice(amt + 1).forEach(function (k2, j) {
                hd[colStart[amt + 1 + j]] = U.labelOf(m, k2);
              });
              var riHd = row(hd);
              heights[riHd] = 20;
              if (titleEnd > 0) M(riHd, 0, riHd, titleEnd);
              for (var c = 0; c < W; c++)
                S(riHd, c, {
                  font: { bold: true, sz: 12, color: C_LABEL }, // 表ヘッダー sz12（PDFと同じ中緑）
                  alignment: { horizontal: "center", vertical: "center" },
                  fill: HDR_FILL,
                  border: isElegant ? { bottom: { style: "thin", color: C_ACCENT } } : BOX,
                });

              // 明細22行（全幅・空行も枠線）
              var prevDate = null;
              for (var rr2 = 0; rr2 < PER; rr2++) {
                var src = pageRows[rr2];
                var line = blank();
                if (src) {
                  items.forEach(function (key, ci) {
                    var dc = colStart[ci];
                    if (key === "日付") {
                      var cur = src.日付 || "";
                      line[dc] = cur && cur !== prevDate ? U.mdShort(cur) : "";
                    } else if (key === "金額") {
                      line[dc] = src.金額 === "" || src.金額 == null ? "" : Number(src.金額);
                    } else line[dc] = src[key] == null ? "" : src[key];
                  });
                  prevDate = src.日付 || prevDate;
                }
                var riR = row(line);
                heights[riR] = 14; // 明細を多く(30行)＋お振込先/合計までA4縦1枚に収める詰め行高
                // テキスト列はまたがり結合
                items.forEach(function (key, ci) {
                  if (spans[ci] > 1) M(riR, colStart[ci], riR, colStart[ci] + spans[ci] - 1);
                });
                for (var c2 = 0; c2 < W; c2++) {
                  // 本文：elegant＝横罫だけ／classic＝上下＋外枠左右＋金額前の縦線（PDF準拠）
                  var bd;
                  if (isElegant) {
                    bd = { bottom: HRULE };
                  } else {
                    bd = { top: THIN, bottom: THIN };
                    if (c2 === 0 || vlCols[c2]) bd.left = THIN;
                    if (c2 === lastCol) bd.right = THIN;
                  }
                  var base = {
                    border: bd,
                    font: { sz: 11 },
                    alignment: { horizontal: "center", vertical: "center" },
                  };
                  if (c2 === amtDisp) {
                    // 見本どおり金額は中央揃え（右揃えにしない）。右揃えは自社情報だけ。
                    base.alignment = { horizontal: "center", vertical: "center" };
                    base.numFmt = "#,##0";
                  }
                  S(riR, c2, base);
                }
              }
            } // end 明細テーブル(!isSummary)
            // 表と下段の間は詰める（アプリ .sh-foot margin-top:8px 相当）
            var spRi = row(blank());
            heights[spRi] = 6;

            // 下段：お振込先(左) / 小計・消費税・合計(右下隅)。専門家3名合意の配置：
            // ①合計は表の右端に右揃えで置き桁を縦に揃える ②ラベル左・金額右(中央寄せ廃止)
            // ③合計を強調＋上に区切り線 ④役職集計は「内訳」見出しで合計と分離。最終ページのみ。
            var showSummary =
              m.noteSummary && (pageCount === 1 || isSummary) && (m.noteGroups || []).length;
            var bank = []; // 下段の左列は使わない（お振込先はヘッダ右・自社情報は各ページのフッターへ）
            // ===== 合計欄を動的に組む（基本/外税/税率別インボイス ＋ 源泉/繰越のテンプレ対応） =====
            var YENNEG = '"¥"#,##0;"▲¥"#,##0'; // マイナスは ▲¥（控除・入金・繰越＝紙の sankakuYen と 同じ 字・2026-11-02）
            var tot = [];
            var baseGoukei;
            var hasRate8 =
              m.taxRates &&
              allRows.some(function (r) {
                return Number(r.税率) === 8;
              });
            if (hasRate8) {
              // 税率別インボイス（金額=税込/内税）：税率ごとの対価額と消費税額を明示
              var t10s = 0,
                t8s = 0;
              allRows.forEach(function (r) {
                var rt = Number(r.税率) === 8 ? 8 : 10,
                  v = Number(r.金額) || 0;
                if (rt === 8) t8s += v;
                else t10s += v;
              });
              var b10 = Math.round(t10s / 1.1),
                b8 = Math.round(t8s / 1.08);
              // ★率は文字で書かず 計算に使った数から組み立てる★（2026-08-12 指示役）
              //   ここは半角カッコ "消費税(10%)" で、紙の全角カッコと違っていた＝4通りに割れた原因の1つ
              var _r10 = 10,
                _r8 = 8;
              tot.push({ l: _r10 + "%対象", v: b10 });
              tot.push({ l: "消費税（" + _r10 + "%）", v: t10s - b10 });
              tot.push({ l: _r8 + "%対象", v: b8 });
              tot.push({ l: "消費税（" + _r8 + "%）", v: t8s - b8 });
              baseGoukei = t10s + t8s;
              tot.push({ l: "合計", v: baseGoukei, big: 1, line: 1 });
            } else {
              // 内税:小計=合計=税込/消費税=内税分。外税:小計=税抜/消費税=小計×10%/合計=税込。
              // ★合計は請求全体(grand)で計算（最終ページにのみ出す＝PDF同様。途中ページはページ小計）。
              // ★合計も言葉も エンジン1本から★（紙と別々に足さない・別々に書かない）
              var _et = MeisaiEngine.invoiceTotals(allRows, { taxMode: m.taxMode });
              var _eL = MeisaiEngine.totalsLabels(m, { taxMode: m.taxMode });
              var pTax = _et.zei;
              baseGoukei = _et.goukei;
              tot.push({ l: _eL.小計, v: _et.shoukei });
              tot.push({ l: _eL.消費税, v: pTax });
              tot.push({ l: _eL.合計, v: baseGoukei, big: 1, line: 1 });
            }
            // 源泉徴収（個人宛）：税抜×10.21%を差引いてお振込金額
            if (m.withholding) {
              var taxBase = isSoto ? grand : Math.round(grand / 1.1);
              var gensen = Math.round(taxBase * 0.1021);
              tot.push({ l: "源泉徴収税額", v: -gensen });
              tot.push({ l: "お振込金額", v: baseGoukei - gensen, big: 1, line: 1 });
            }
            // ★繰越★ 2026-08-12：マスタの手打ち(carryoverPrev/Paid)をやめ、
            //   ★保存した控えと入金から出した物（iss.carry）をそのまま使う★＝紙とExcelが同じ数になる
            var _crx = _carryFor(co, month); // ★その 紙の 月の 繰越★
            if (m.carryover && _crx) {
              var _c = _crx;
              // ★5項目（2026-11-02 司さん）★ その 月への 入金は 載せない＝出し直しても 変わらない
              tot.push({
                l: _eL.前回ご請求額,
                v: _c.maeSeikyu,
                t: _c.maeSeikyu == null ? _c.riyu[0] || "—" : null,
              });
              if (_c.maeSeikyu != null) {
                tot.push({ l: _eL.ご入金額, v: -_c.nyukin });
                tot.push({ l: _eL.繰越金額, v: _c.kurikoshi });
                tot.push({ l: _eL.今回ご請求額, v: _c.seikyuGaku, big: 1, line: 1 });
                if (_c.seikyuGaku < 0) tot.push({ l: MeisaiEngine.SASHIHIKI_JI, v: null, t: " " }); // 額の 欄は 空（"—" に しない）
              }
            }
            var amtC = lastCol; // 金額＝表の右端（右下隅・桁の縦ライン）
            var lblC = Math.max(amtC - 1, 0); // ラベルは金額のすぐ左
            // ★合計欄のラベルは「列幅」で欠ける★（文字はセルに在るのに紙に出ない）
            //   2026-08-14 実測：「消費税（10%・内税）」が Excel の紙で「費税（10%・内税」に欠けた。
            //   中央揃えは右隣(金額)が埋まっていると ★左右とも切り落とされる★（左へはみ出さない）。
            //   なので 文字の要る幅を数えて、足りる所まで ★左へセルを結合してから★ 書く。
            //   結合したセルは ★左上の値しか出ない★ ので、ラベルは結合の左端に置く。
            function _wchAt(c) {
              var w = (invCols && invCols[c] && invCols[c].wch) || (colWidths && colWidths[c]) || 9;
              return Number(w) || 9;
            }
            function _needWch(s, sz) {
              var n = 0;
              String(s == null ? "" : s)
                .split("")
                .forEach(function (ch) {
                  n += /[\x20-\x7E｡-ﾟ]/.test(ch) ? 1 : 2; // 全角=2・半角=1
                });
              return Math.ceil((n * (sz || 11)) / 11) + 2; // 左右の余白ぶん
            }
            function _lblFrom(s, sz, minCol) {
              var need = _needWch(s, sz),
                have = _wchAt(lblC),
                from = lblC,
                floorC = minCol == null ? 1 : minCol;
              while (have < need && from > floorC) {
                from--;
                have += _wchAt(from);
              }
              return from;
            }
            if (!(pageCount === 1 || isSummary)) {
              // ★途中の明細ページ：このページの小計だけ（PDF同様・振込先や総額・ご請求金額はサマリーページに）。
              var subFr = blank();
              var subFrom = _lblFrom("このページの小計", 11, 1);
              subFr[subFrom] = "このページの小計";
              subFr[amtC] = pageTotal;
              var subRi = row(subFr);
              if (subFrom > 1) M(subRi, 0, subRi, subFrom - 1);
              if (subFrom < lblC) M(subRi, subFrom, subRi, lblC);
              for (var _sc = subFrom; _sc <= lblC; _sc++)
                S(subRi, _sc, { font: { sz: 11 }, alignment: { horizontal: "center" } });
              S(subRi, amtC, {
                font: { sz: 11 },
                numFmt: YEN,
                alignment: { horizontal: "center" },
              });
              heights[subRi] = 16;
            } else {
              // 単ページ or サマリーページ：お振込先(左) ＋ 小計/消費税/合計(右下隅・請求全体)。
              var fn = Math.max(bank.length, tot.length);
              for (var f = 0; f < fn; f++) {
                var fr = blank();
                if (bank[f]) fr[0] = bank[f];
                var t = tot[f];
                var tFrom = lblC;
                if (t) {
                  tFrom = _lblFrom(t.l, t.big ? 13 : 11, bank[f] ? lblC : 1);
                  fr[tFrom] = t.l;
                  // ★不明（繰越が出せない・入金が未確認）は紙と同じ言葉を金額欄に出す★
                  //   数が無いからと空欄にすると、Excelだけ「0円で済んだ」に見える。
                  fr[amtC] = t.v == null ? t.t || "—" : t.v;
                }
                var rif = row(fr);
                if (bank[f]) {
                  M(rif, 0, rif, Math.max(lblC - 1, 0));
                  S(rif, 0, {
                    font: { sz: 11 },
                    alignment: { horizontal: iss.bankAlign || "left" },
                  });
                }
                if (t) {
                  // 見本どおり中央揃え。強調行(big)は太字大、line指定で上に区切り線。
                  var topbd = t.line
                    ? { top: { style: "thin", color: { rgb: "000000" } } }
                    : undefined;
                  if (tFrom < lblC) M(rif, tFrom, rif, lblC);
                  // 罫線は結合の全セルに引く（左上だけだと合計の上線が途中で切れる）
                  for (var _tc = tFrom; _tc <= lblC; _tc++)
                    S(rif, _tc, {
                      font: { bold: !!t.big, sz: t.big ? 13 : 11 },
                      alignment: { horizontal: "center" },
                      border: topbd,
                    });
                  S(rif, amtC, {
                    font: { bold: !!t.big, sz: t.big ? 13 : 11 },
                    numFmt: t.v == null ? undefined : YENNEG,
                    alignment: { horizontal: "center" },
                    border: topbd,
                  });
                }
                heights[rif] = t && t.big ? 18 : 16;
              }
            }
            // 役職集計（標様型）＝合計の内訳。余白＋見出しで合計と分離・金額は右端右揃え。
            if (showSummary) {
              var rsums = {};
              m.noteGroups.forEach(function (g) {
                rsums[g] = 0;
              });
              allRows.forEach(function (x) {
                var g = (x.備考 || "").trim();
                if (rsums.hasOwnProperty(g)) rsums[g] += Number(x.金額) || 0;
              });
              var gp = row(blank());
              heights[gp] = 5;
              var hr = blank();
              hr[lblC] = "内訳（役職別）";
              var hri = row(hr);
              if (amtC >= lblC) M(hri, lblC, hri, amtC);
              S(hri, lblC, {
                font: { sz: 9, color: { rgb: "666666" } },
                alignment: { horizontal: "left" },
              });
              heights[hri] = 14;
              m.noteGroups.forEach(function (g) {
                var sr = blank();
                var gFrom = _lblFrom(g, 10, 1); // 役職名が長くても欠けないよう左へ結合
                sr[gFrom] = g;
                if (rsums[g]) sr[amtC] = rsums[g];
                var sri = row(sr);
                if (gFrom < lblC) M(sri, gFrom, sri, lblC);
                // 内訳も中央揃え（小計/合計と同じ＝見本準拠）・小さめ文字で従属表現
                for (var _gc = gFrom; _gc <= lblC; _gc++)
                  S(sri, _gc, { font: { sz: 10 }, alignment: { horizontal: "center" } });
                if (rsums[g])
                  S(sri, amtC, {
                    font: { sz: 10 },
                    numFmt: YEN,
                    alignment: { horizontal: "center" },
                  });
                heights[sri] = 15;
              });
            }
            if (hasSummary && !isSummary) {
              // 明細ページ（サマリーが後ろに来る）＝次へ続く。★PDF同様に右側（金額列）に右揃え。
              var cr = blank();
              // ★結合したセルは左上の値しか出ない★＝右端に書くと Excel では消える。
              var _cFrom = Math.max(lastCol - 2, 0);
              cr[_cFrom] = "次ページへ続く →";
              var ric = row(cr);
              if (_cFrom < lastCol) M(ric, _cFrom, ric, lastCol);
              S(ric, _cFrom, {
                font: { italic: true, color: C_MUTED },
                alignment: { horizontal: "right" },
              });
            }
            // ★自社情報フッター（全ページ・右下＝PDF同様）。判子は社名(1行目)に重ねて押す（角印標準）。
            if (ftrInfo.length) {
              var fgap = row(blank());
              heights[fgap] = 6;
              ftrInfo.forEach(function (ln, fi) {
                var frr = blank();
                // ★結合したセルは左上の値しか出ない★＝右端に書くと Excel では自社情報が消える。
                var _fFrom = Math.max(lastCol - 2, 0);
                frr[_fFrom] = ln;
                var frri = row(frr);
                if (_fFrom < lastCol) M(frri, _fFrom, frri, lastCol);
                S(frri, _fFrom, {
                  font: { sz: fi === 0 ? 11 : 9, color: fi === 0 ? C_TEXT : C_MUTED },
                  alignment: { horizontal: "right" },
                });
                heights[frri] = fi === 0 ? 16 : 13;
                if (fi === 0 && iss.hanko) hankoAnchors.push(anchorAt(lastCol, frri, 250000, 0));
              });
            }
            // ★ページ番号は右下（PDF同様）。複数ページ時のみ・総ページ数=明細＋サマリー。
            if (totalPages > 1) {
              var pn = blank();
              pn[lastCol] = pi + 1 + " / " + totalPages;
              var pnRi = row(pn);
              S(pnRi, lastCol, {
                font: { sz: 9, color: C_MUTED },
                alignment: { horizontal: "right" },
              });
            }
            // ★ページの終わりに空行を足さない★
            //   足すと 1ページぶんの高さが A4 を超え、Excel が ★自動の改ページ★ を入れる。
            //   はみ出すのは中身の無い行なので、印刷すると ★白紙が1枚 挟まる★
            //   （明細60本＝論理4ページで 紙7枚・うち3枚が白紙。2026-08-15 実測）。
            //   この後には手動の改ページが入るので、下の余白は紙の下マージンが持つ。
          }
        });

        // 目次シート用：会社×月 → 請求書シートの先頭行（1始まり）
        var index = invs.map(function (iv, i) {
          return { label: iv.company + "　" + iv.month, targetRow: firstPageRowOf[i] };
        });
        // 判子＋ロゴ（両方とも画像注入。どちらか一方でも可）
        var hankoObj = null;
        if ((iss.hanko && hankoAnchors.length) || (iss.logo && logoAnchors.length)) {
          hankoObj = {};
          if (iss.hanko && hankoAnchors.length) {
            hankoObj.dataURL = iss.hanko;
            hankoObj.sizeMm = Number(iss.hankoSizeMm) || 21;
            hankoObj.anchors = hankoAnchors;
          }
          if (iss.logo && logoAnchors.length) {
            hankoObj.logo = {
              // ★アプリ表示とExcelでロゴを一致させる★：アプリと同じ「箱に収める」モデル。
              //   箱＝幅最大 logoSizeMm(既定40mm) × 高さ最大26mm、アスペクト比維持(object-fit:contain相当)。
              //   実寸(wMm/hMm)は書き出し時に画像の自然比から算出して上書きする(downloadExcelWorkbook)。
              //   検証済み：40mm幅でも右端=6.93in<印刷可能域7.88in＝はみ出さない(EMU実測)。
              dataURL: iss.logo,
              wMm: Number(iss.logoSizeMm) || 40, // 暫定(箱の幅上限)。書き出し時にcontain実寸へ上書き。
              boxMaxWmm: Number(iss.logoSizeMm) || 40,
              boxMaxHmm: 26,
              anchors: logoAnchors,
            };
          }
        }
        // 表幅(inch)から左右対称マージンを算出＝表をA4縦の中央に置く（horizontalCentered不使用＝
        // 右上ロゴ＋判子の偏りで中央寄せが崩れるのを回避。マージン左右同値なら必ず中央）。
        var sumWch = (invCols || []).reduce(function (a, c) {
          return a + (c.wch || 9);
        }, 0);
        var tableIn = sumWch * 0.093; // 経験係数（游ゴシック実測・分割防止に表幅をやや大きめ見積り）
        var sideMargin = Math.max(0.3, (8.27 - tableIn) / 2); // A4縦の幅=8.27in
        // 文字サイズに合わせて行高も一括スケール（_exlFs=1なら無変更＝バイト不変）。
        if (_exlFs !== 1)
          Object.keys(heights).forEach(function (k) {
            heights[k] = Math.round(heights[k] * _exlFs);
          });
        // ★重複する結合セルを除去＝Excelの「修復しますか」の根因（重なった結合をExcelが嫌う）。
        //   先勝ちで、既に占有されたセルを含む結合は捨てる（捨てるのは重なってる方＝見た目はほぼ不変）。
        var _occ = {},
          _cleanM = [];
        merges.forEach(function (m) {
          var bad = false,
            r,
            c;
          for (r = m.s.r; r <= m.e.r && !bad; r++)
            for (c = m.s.c; c <= m.e.c && !bad; c++) if (_occ[r + "," + c]) bad = true;
          if (bad) return;
          for (r = m.s.r; r <= m.e.r; r++) for (c = m.s.c; c <= m.e.c; c++) _occ[r + "," + c] = 1;
          _cleanM.push(m);
        });
        merges = _cleanM;
        return {
          aoa: aoa,
          styles: styles,
          merges: merges,
          heights: heights,
          cols: invCols, // 動的列幅（項目数に応じて算出）
          index: index,
          breaks: breaks,
          hanko: hankoObj,
          margin: sideMargin, // 請求書シートの左右マージン(inch)＝中央寄せ用
        };
      }
      /* ===================================================================
      Excel自動更新ファイル ─ SheetJSの「開ける実データxlsx」を土台に、その上に
      Power Query層(接続+DataMashup+テーブル)を載せる。
      → ①列数=実データ完全一致で破損回避 ②iPhoneは実データがそのまま見える
         ③PCのExcelは「すべて更新」でクラウドから最新を取得。
      PQ注入に失敗しても、フォント補正だけした静的Excel(=今まで通り開ける)で落ちる。
      nodeで構造検証済み(content-type全網羅/rels全解決/列数一致/DataMashupバイト一致)。
      =================================================================== */
