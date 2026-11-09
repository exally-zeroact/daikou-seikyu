      // 1枚ぶんの本物のPDFを作る（同じ物は作り直さない）
      async function tplThumbBytes(design, vkey, co) {
        var samp = tplSampleRows(co);
        if (!samp) return null; // ★1件も無い時は「まだ紙が無い」と正直に出す（作り物を出さない）★
        // ★入金を 読めない 時、繰越の 会社の 見本は 描かない★ 2026-11-02（注C・2回目の 対立役 注1）
        //   描くと 上が 今月分 ¥12,000 の 紙に なる（本当は 繰越を 足した 額）＝プレビューの 門と 揃える
        if (YOMENAI.payments && MASTER[samp.co] && MASTER[samp.co].carryover)
          return "NYUKIN_YOMENAI";
        var key =
          design +
          "|" +
          vkey +
          "|" +
          samp.co +
          "|" +
          samp.month +
          "|" +
          samp.rows.length +
          "|" +
          invoiceNoMiru(samp.month, samp.co); // ★番号を 出した 後に「未発行」の まま 残らない★
        if (_tplThumbCache[key]) return _tplThumbCache[key];
        var v =
          designVariants(design).filter(function (x) {
            return x.key === vkey;
          })[0] || designVariants(design)[0];
        // ★実際に刷る時と同じ関数・同じ設定★。デザインと種類だけ この見本の物に差し替える。
        var iss = issuerForEngine(samp.co, samp.month);
        iss = Object.assign({}, iss, {
          pdfDesign: design,
          headerStyle: v.headerStyle,
          logoMode: v.logoMode,
        });
        var bytes = await InvoicePDF.buildOne(
          MASTER,
          samp.co,
          samp.rows,
          samp.month,
          iss,
          invoiceNoMiru(samp.month, samp.co) // ★見本も 台帳の 番号・無ければ「未発行」★
        );
        _tplThumbCache[key] = bytes;
        return bytes;
      }
      var _tplThumbSeq = 0;
      // 画面に出ている見本の枠を、1枚ずつ 本物の紙で埋める
      //   ★見えている枠だけ★（閉じている会社の分まで作らない＝開いた時に作る）
      async function paintTplThumbs(root) {
        var boxes = [].filter.call(
          (root || document).querySelectorAll(".tpl-thumb-real"),
          function (b) {
            var r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          }
        );
        if (!boxes.length) return;
        var seq = ++_tplThumbSeq;
        if (typeof InvoicePDF === "undefined") return; // まだ読み込み中＝「作っています…」のまま
        for (var i = 0; i < boxes.length; i++) {
          if (seq !== _tplThumbSeq) return; // 別の画面に切り替わった＝やめる
          var box = boxes[i];
          try {
            var host = box.closest("[data-co]"); // 会社ごとテンプレの中なら その会社の紙で見せる
            var bytes = await tplThumbBytes(
              box.dataset.design,
              box.dataset.variant,
              host ? host.dataset.co : null
            );
            if (seq !== _tplThumbSeq) return;
            if (bytes === "NYUKIN_YOMENAI") {
              box.innerHTML =
                '<span class="tpl-thumb-msg">入金を 読めないので<br />繰越の 会社の 見本は 出しません</span>';
              continue;
            }
            if (!bytes) {
              box.innerHTML =
                '<span class="tpl-thumb-msg">明細を1件 入れると<br />ここに実際の紙が出ます</span>';
              continue;
            }
            var pdfjs = await ensurePdfjs();
            var pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
            var pg = await pdf.getPage(1);
            var w = Math.max(120, Math.round(box.getBoundingClientRect().width || 150));
            var vp0 = pg.getViewport({ scale: 1 });
            var vp = pg.getViewport({ scale: (w * 2) / vp0.width }); // 2倍解像度＝縮めても字が潰れない
            var cv = document.createElement("canvas");
            cv.width = vp.width;
            cv.height = vp.height;
            await pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
            if (seq !== _tplThumbSeq) return;
            box.innerHTML = "";
            box.appendChild(cv);
          } catch (e) {
            box.innerHTML = '<span class="tpl-thumb-msg">見本を作れませんでした</span>';
          }
        }
      }
      var DESIGN_VARIANTS = {
        elegant: [
          {
            key: "logo",
            label: "ロゴあり",
            desc: "中央タイトル＋ロゴ（下中央）",
            logoMode: "show",
            headerStyle: "B",
          },
          {
            key: "plain",
            label: "ロゴなし",
            desc: "中央タイトル・ロゴなし",
            logoMode: "hide",
            headerStyle: "B",
          },
        ],
        classic: [
          {
            key: "diag_logo",
            label: "対角・ロゴあり",
            desc: "左タイトル＋右上ロゴ",
            logoMode: "show",
            headerStyle: "A",
          },
          {
            key: "diag_plain",
            label: "対角・ロゴなし",
            desc: "左タイトル・ロゴなし",
            logoMode: "hide",
            headerStyle: "A",
          },
          {
            key: "center",
            label: "中央タイトル",
            desc: "昔ながらの定番",
            logoMode: "hide",
            headerStyle: "B",
          },
        ],
      };
      // 請求タブの「その回だけ」一時上書き（保存しない）。{pdfDesign, variant} or null。
      var INV_OVERRIDE = null;
      function designVariants(design) {
        return DESIGN_VARIANTS[design] || DESIGN_VARIANTS.elegant;
      }
      function activeDesign() {
        if (INV_OVERRIDE && INV_OVERRIDE.pdfDesign) return INV_OVERRIDE.pdfDesign;
        return currentIssuer().pdfDesign || "elegant";
      }
      function activeVariantKey(design) {
        if (INV_OVERRIDE && INV_OVERRIDE.pdfDesign === design && INV_OVERRIDE.variant)
          return INV_OVERRIDE.variant;
        var s = currentIssuer();
        var stored = design === "classic" ? s.classicVariant : s.elegantVariant;
        var list = designVariants(design);
        return list.some(function (v) {
          return v.key === stored;
        })
          ? stored
          : list[0].key;
      }
      function resolveDesignVariant() {
        var d = activeDesign();
        var vk = activeVariantKey(d);
        var v =
          designVariants(d).filter(function (x) {
            return x.key === vk;
          })[0] || designVariants(d)[0];
        return { design: d, variant: v };
      }
      // 互換：旧resolveTemplate（headerStyle/logoMode/id）を新モデルから導出。
      function resolveTemplate() {
        var dv = resolveDesignVariant();
        return {
          id: dv.design + "_" + dv.variant.key,
          headerStyle: dv.variant.headerStyle,
          logoMode: dv.variant.logoMode,
        };
      }
      // お支払期限のISO日付を和暦/西暦の表示文字列へ。
      function fmtDueDate(iso, era) {
        if (!iso) return "";
        var p = String(iso).split("-");
        if (p.length < 3) return iso;
        var y = Number(p[0]),
          mo = Number(p[1]),
          d = Number(p[2]);
        if (era === "reiwa") return "令和" + (y - 2018) + "年" + mo + "月" + d + "日";
        return y + "/" + mo + "/" + d;
      }
      // エンジンが受け取る形（lines/bank/hanko）へ変換。空行は自動で除外。
      /* ★繰越の中身を作る（会社が「使う」を選んだ時だけ）★
            月は請求タブで選んでいる月。選ばれていなければ 繰越は出さない。 */
      // ★月は 引数で★ 2026-10-08（対立役：Excel で 複数の 月を 出すと 請求タブで 選んだ 月の 繰越が 他の 月の 紙にも 刷られた）
      function _carryFor(co, mo) {
        if (!co || !MASTER[co] || !MASTER[co].carryover) return null;
        var el = document.getElementById("invMonth");
        var month = mo || (el ? el.value : "");
        if (!month) return null;
        var rows = DB.filter(function (r) {
          return r.account_id === CURRENT_ACCOUNT && r.会社名 === co && inMonth(r.日付, month);
        });
        var konkai = MeisaiEngine.invoiceTotals(rows, {
          taxMode: MASTER[co].taxMode,
        }).goukei;
        // ★入金は 入金日の 月で 数える★（2026-11-02 司さん＝出し直しても 紙が 変わらない・二重に 請求しない）
        var zai = carryMaterialFor(month, co);
        return MeisaiEngine.carryoverOf(zai.kako, konkai, zai.uketori);
      }
      function issuerForEngine(co, mo) {
        var s = currentIssuer();
        var bankLines = splitLines(s.bank);
        // ★デザインの解決順：①請求タブ一時上書き(全社強制) → ②会社毎テンプレ → ③全体設定（既定）。
        //   会社毎未設定(=co無し/m.pdfDesign無し)は resolveDesignVariant() と完全同一＝バイト不変。
        var _m = (co && MASTER[co]) || null;
        var dv;
        if (INV_OVERRIDE) {
          dv = resolveDesignVariant();
        } else if (_m && _m.pdfDesign) {
          var _d = _m.pdfDesign === "classic" ? "classic" : "elegant";
          var _vk = _d === "classic" ? _m.classicVariant : _m.elegantVariant;
          var _list = designVariants(_d);
          var _v =
            _list.filter(function (x) {
              return x.key === _vk;
            })[0] || _list[0];
          dv = { design: _d, variant: _v };
        } else {
          dv = resolveDesignVariant();
        }
        return {
          lines: issuerLinesOf(s), // ★登録番号は専用の欄から 元の位置に戻して刷る★
          bank: bankLines.length ? ["お振込先"].concat(bankLines) : [],
          lineAlign: s.issuerAlign || "left",
          bankAlign: s.bankAlign || "left",
          alignIssuer: s.alignIssuer || "auto", // 自社情報ブロックの位置（前に編集タブで保存した値・無ければ auto）
          lineIssuer: s.lineIssuer || "auto", // 自社情報の行の並び（同上）
          posGrand: s.posGrand || "auto", // ご請求金額の位置（同上）
          posLead: s.posLead || "auto", // 説明文の位置（同上）
          posDue: s.posDue || "auto", // お支払期限（有効期限）の位置（同上）
          dateEra: s.dateEra || "seireki",
          showInvoiceNo: !!s.showInvoiceNo,
          paymentDue:
            s.showPaymentDue && s.paymentDue
              ? fmtDueDate(s.paymentDue, s.paymentDueEra || "seireki")
              : "",
          // ★繰越（会社ごと・既定は使わない）★ 紙とExcelに同じ物を渡す
          taxMode: (_m && _m.taxMode) === "外税" ? "外税" : "内税",
          carry: _carryFor(co, mo),
          hanko: s.hanko || null,
          hankoSizeMm: Number(s.hankoSizeMm) || 21,
          logo: s.logo || null,
          logoSizeMm: Math.max(10, Math.min(46, Number(s.logoSizeMm) || 40)), // 10〜46mm（描画上限と一致）
          pdfDesign: dv.design, // ★これが無いと classic に到達できない（監査B-1）★
          headerStyle: dv.variant.headerStyle, // デザイン×種類から導出
          logoMode: dv.variant.logoMode, // show=ロゴ枠あり / hide=ロゴ出さない
          templateId: dv.design + "_" + dv.variant.key,
          pdfFont: s.pdfFont || "BIZ UDPゴシック", // PDFの書体
          // ★字の大きさの係数は 使わない（1 に固定）★ 2026-11-04 司さん「編集タブはいらない」＋紙の字を小さくして行を増やした。
          //   前に編集タブで 保存した 係数（全体 fontScale・範囲別 blkFs）が 残っていると、行数の計算と 合わず
          //   合計が 明細の 表に 重なる（対立役が 測った：係数1.4 で 72pt 食い込む）。保存の値は 消さずに 無視する。
          fontScale: 1,
          blkFs: null,
        };
      }
      /* ★登録番号が無い／形が違う時は 紙を出させない★
            押せて何も起きない、にしない＝★押させない＋理由（どこで入れるか）まで出す★ */
