      function masterCardHTML(co) {
        var m = MASTER[co];
        return (
          '<div class="master-co">' +
          '<div class="swipe-action"><button class="swipe-del" onclick="deleteCompany(\'' +
          esc(co) +
          "')\">削除</button></div>" +
          '<div class="swipe-content">' +
          '<div class="master-co-hd" onclick="toggleMasterBody(this)">' +
          '<span class="master-co-name">' +
          esc(co) +
          "</span>" +
          '<span class="master-co-cols">' +
          esc(
            m.items
              .map(function (k) {
                return MeisaiEngine.utils.labelOf(m, k);
              })
              .join(" / ")
          ) +
          "</span>" +
          '<span class="master-co-caret">▾</span>' +
          "</div>" +
          '<div class="master-co-body" data-co="' +
          esc(co) +
          '">' +
          masterBodyHTML(co) +
          "</div>" +
          "</div>" +
          "</div>"
        );
      }
      function masterBodyHTML(co) {
        var m = MASTER[co];
        // 使う項目チェック（候補＝DB列名そのもの）
        var chips = FIELD_DEFS.map(function (f) {
          var on = m.items.indexOf(f.key) >= 0;
          return (
            '<span class="chip' +
            (on ? " on" : "") +
            '" onclick="toggleItem(\'' +
            esc(co) +
            "','" +
            f.key +
            "')\">" +
            (on ? "✓ " : "") +
            esc(f.key) +
            "</span>"
          );
        }).join("");
        // 順番（ドラッグ）＋幅
        var dnd = m.items
          .map(function (k) {
            return (
              '<div class="dnd-item" draggable="true" data-key="' +
              esc(k) +
              '"' +
              " ondragstart=\"dndStart(event,'" +
              esc(co) +
              '\')" ondragover="dndOver(event)" ondrop="dndDrop(event,\'' +
              esc(co) +
              '\')" ondragend="dndEnd(event)">' +
              '<span class="dnd-grip">⠿</span>' +
              dndNameHTML(co, k) +
              "</div>"
            );
          })
          .join("");
        var noteG = (m.noteGroups || []).join("、");
        return (
          "" +
          '<div class="card-label">会社名（編集）</div>' +
          '<div style="display:flex;gap:8px;margin-bottom:6px;">' +
          '<input class="finput" style="flex:1;" value="' +
          esc(co) +
          '" ' +
          NOFILL +
          " onkeydown=\"if(event.key==='Enter'){renameCompany('" +
          esc(co) +
          "',this.value);}\">" +
          '<button class="btn btn-ghost btn-sm" style="flex:0 0 auto;width:auto;" onclick="renameCompany(\'' +
          esc(co) +
          "',this.previousElementSibling.value)\">名前を変更</button></div>" +
          '<div class="card-label" style="margin-top:10px;">使う項目（タップで選択/削除）</div>' +
          '<div class="chip-row">' +
          chips +
          "</div>" +
          '<div class="addcustom"><input class="finput addcustom-inp" placeholder="自由な項目名（例：台数）" ' +
          NOFILL +
          " onkeydown=\"if(event.key==='Enter'){addCustomItem('" +
          esc(co) +
          '\',this.value);}"><button class="btn btn-ghost btn-sm addcustom-btn" onclick="addCustomItem(\'' +
          esc(co) +
          "',this.previousElementSibling.value)\">＋追加</button></div>" +
          '<div class="card-label" style="margin-top:10px;">順番（取っ手⠿を長押しで上下にドラッグ）</div>' +
          '<div class="dnd-list" data-co="' +
          esc(co) +
          '">' +
          dnd +
          "</div>" +
          '<div class="scr-sub" style="margin:2px 0 0;">この順番がそのまま請求書の列順になります。自由項目は✕で削除・列の幅は自動。</div>' +
          '<button class="btn btn-ghost btn-sm" style="margin-top:8px;width:auto;" onclick="resetItemOrder(\'' +
          esc(co) +
          "')\">↩ 標準の順（日付/行き先/金額…）に戻す</button>" +
          '<div class="frow" style="margin-top:8px;"><div class="flabel">リード文（{月}は対象月に置換）</div>' +
          '<input class="finput" value="' +
          esc(m.lead || "") +
          '" onchange="setMasterField(\'' +
          esc(co) +
          "','lead',this.value)\"></div>" +
          '<div class="frow"><div class="flabel">表ヘッダー名</div>' +
          '<input class="finput" value="' +
          esc(m.tableTitle || "運転業務委託料") +
          '" onchange="setMasterField(\'' +
          esc(co) +
          "','tableTitle',this.value)\"></div>" +
          '<label class="toggle-row"><input type="checkbox" ' +
          (m.noteSummary ? "checked" : "") +
          " onchange=\"setMasterField('" +
          esc(co) +
          "','noteSummary',this.checked)\"> 備考で集計ボックスを出す（例：役職別や名前別など）</label>" +
          /* ★繰越（2026-08-12 司さん「繰り越しに関しては選べるようにしろや」）★
                既定は切＝今までどおり。入れると 前回の残りを次の請求に乗せる。
                前回繰越は ★今の明細と入金から自動★（手打ちにしない・2026-11-01 から 控えでなく 今の 明細）。 */
          '<label class="toggle-row"><input type="checkbox" ' +
          (m.carryover ? "checked" : "") +
          " onchange=\"setMasterField('" +
          esc(co) +
          "','carryover',this.checked)\"> 繰越を使う（前回の残りを次の請求に乗せる）</label>" +
          '<div style="font-size:10px;color:#555555;margin:2px 0 8px 26px;line-height:1.6;">' +
          "前回ご請求額・ご入金額・繰越金額・今回ご請求額 が紙とExcelに出ます。入金は、払ってもらった請求書の月の行に記録してください。" +
          "前回の請求が無い会社は「前回の請求はありません」と出ます（0円とは書きません）。</div>" +
          /* ★入金の 消し込み★ 2026-11-03（司さん「CSV→候補→人が押す」・手数料は 会社ごとに 先方持ち／こちら持ち） */
          '<div class="frow"><div class="flabel">振込名義（銀行の明細に出るカナ・読点区切りで複数）</div>' +
          '<input class="finput" id="mFurikomiMeigi" ' +
          NOFILL +
          ' placeholder="ﾔﾏﾀﾞｹﾝｾﾂ" value="' +
          esc((m.furikomiMeigi || []).join("、")) +
          '" onchange="setFurikomiMeigi(\'' +
          esc(co) +
          "',this.value)\"></div>" +
          '<div class="frow"><div class="flabel">振込手数料（先方が差し引いて払った時）</div>' +
          '<div class="align-row">' +
          '<button type="button" class="align-btn' +
          (m.tesuryoFutan === "kochira" ? "" : " on") +
          '" onclick="setMasterField(\'' +
          esc(co) +
          "','tesuryoFutan','')\">先方持ち（差は未入金で残る）</button>" +
          '<button type="button" class="align-btn' +
          (m.tesuryoFutan === "kochira" ? " on" : "") +
          '" onclick="setMasterField(\'' +
          esc(co) +
          "','tesuryoFutan','kochira')\">こちら持ち（差を手数料として消す）</button>" +
          "</div></div>" +
          '<div style="font-size:10px;color:#555555;margin:-4px 0 8px;line-height:1.6;">' +
          "取り決めが無ければ振込手数料は払う側（先方）の負担です（民法485条）。こちら持ちにすると、銀行の明細を読んだ時に 1〜1,100円の差を振込手数料（当方負担）として消します。</div>" +
          /* ★内税/外税（値は前から在ったが 切り替える所が無かった＝到達しない分岐だった）★ */
          '<div class="frow"><div class="flabel">消費税の扱い</div>' +
          '<div class="align-row">' +
          '<button type="button" class="align-btn' +
          (m.taxMode === "外税" ? "" : " on") +
          '" onclick="setMasterField(\'' +
          esc(co) +
          "','taxMode','内税')\">内税（金額は税込）</button>" +
          '<button type="button" class="align-btn' +
          (m.taxMode === "外税" ? " on" : "") +
          '" onclick="setMasterField(\'' +
          esc(co) +
          "','taxMode','外税')\">外税（金額は税抜）</button>" +
          "</div></div>" +
          '<div class="frow" style="margin-top:6px;">' +
          '<div class="flabel">集計の並び（読点区切り）</div>' +
          '<input class="finput" placeholder="会長、社長、専務" value="' +
          esc(noteG) +
          '" onchange="setNoteGroups(\'' +
          esc(co) +
          "',this.value)\"></div>" +
          companyTplHTML(co) +
          '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button class="btn btn-danger btn-sm" style="flex:1;" onclick="deleteCompany(\'' +
          esc(co) +
          "')\">会社を削除</button></div>"
        );
      }
      // ★会社毎テンプレ選択（この会社専用 or 全体設定）。設定の全体ギャラリーを会社編集に持ち込む形。
      function companyTplHTML(co) {
        var m = MASTER[co];
        var hasOwn = !!m.pdfDesign;
        var gdv = resolveDesignVariant(); // 全体の解決結果（未指定時の表示用）
        var design = hasOwn ? (m.pdfDesign === "classic" ? "classic" : "elegant") : "elegant";
        var curVar =
          design === "classic" ? m.classicVariant || "diag_logo" : m.elegantVariant || "logo";
        var html =
          '<div class="card-label" style="margin-top:14px;">請求書テンプレ（この会社）</div>' +
          '<label class="toggle-row"><input type="checkbox" ' +
          (hasOwn ? "checked" : "") +
          " onchange=\"toggleCompanyTpl('" +
          esc(co) +
          "',this.checked)\"> この会社だけ専用テンプレにする</label>";
        if (!hasOwn) {
          html +=
            '<div class="scr-sub" style="margin:2px 0 0;">未指定＝全体設定（現在: ' +
            esc(DESIGN_LABELS[gdv.design] + "・" + gdv.variant.label) +
            "）を使います。</div>";
          return html;
        }
        html +=
          '<div class="dseg" style="display:flex;gap:6px;margin:6px 0;">' +
          Object.keys(DESIGN_LABELS)
            .map(function (d) {
              return (
                '<button type="button" class="dseg-btn' +
                (d === design ? " on" : "") +
                '" onclick="setCompanyDesign(\'' +
                esc(co) +
                "','" +
                d +
                "')\">" +
                DESIGN_LABELS[d] +
                "</button>"
              );
            })
            .join("") +
          "</div>";
        html +=
          '<div class="tpl-grid">' +
          designVariants(design)
            .map(function (v) {
              return (
                '<button type="button" class="tpl-card' +
                (v.key === curVar ? " on" : "") +
                '" onclick="setCompanyVariant(\'' +
                esc(co) +
                "','" +
                design +
                "','" +
                v.key +
                "')\">" +
                '<div class="tpl-badge">✓</div>' +
                tplThumbBox(design, v) +
                '<div class="tpl-meta"><div class="tpl-name">' +
                esc(v.label) +
                '</div><div class="tpl-desc">' +
                esc(v.desc) +
                "</div></div></button>"
              );
            })
            .join("") +
          "</div>";
        return html;
      }
