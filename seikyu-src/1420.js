      function toggleCompanyTpl(co, on) {
        var m = MASTER[co];
        if (on) {
          if (!m.pdfDesign) {
            var dv = resolveDesignVariant(); // 全体の現在値を初期値に
            m.pdfDesign = dv.design;
            if (dv.design === "classic") m.classicVariant = dv.variant.key;
            else m.elegantVariant = dv.variant.key;
          }
        } else {
          m.pdfDesign = null;
          m.elegantVariant = null;
          m.classicVariant = null;
        }
        saveMaster();
        reopen(co);
        generateInvoices();
      }
      function setCompanyDesign(co, design) {
        if (!DESIGN_VARIANTS[design]) return;
        MASTER[co].pdfDesign = design;
        saveMaster();
        reopen(co);
        generateInvoices();
        toast(DESIGN_LABELS[design] + " にしました");
      }
      function setCompanyVariant(co, design, key) {
        if (
          !designVariants(design).some(function (v) {
            return v.key === key;
          })
        )
          return;
        var m = MASTER[co];
        m.pdfDesign = design;
        if (design === "classic") m.classicVariant = key;
        else m.elegantVariant = key;
        saveMaster();
        reopen(co);
        generateInvoices();
        var v = designVariants(design).filter(function (x) {
          return x.key === key;
        })[0];
        toast(DESIGN_LABELS[design] + "・" + (v ? v.label : key) + " にしました");
      }
      function toggleMasterBody(hd) {
        var body = hd.nextElementSibling;
        body.classList.toggle("open");
        // ★開いた時に その会社の紙で見本を作る★（閉じている分は作らない）
        if (body.classList.contains("open")) paintTplThumbs(body);
      }
      function reopen(co) {
        // マスタ再描画後、編集中の会社を開いたまま保つ
        renderMaster();
        var b = document.querySelector('.master-co-body[data-co="' + CSS.escape(co) + '"]');
        if (b) {
          b.classList.add("open");
          paintTplThumbs(b); // ★見本＝実際の紙★
        }
      }
      function toggleItem(co, key) {
        var m = MASTER[co];
        var i = m.items.indexOf(key);
        if (i >= 0) {
          // ★「日付」は請求書の月まとめ・並び・採番の基準。外すと日付なし明細が保存でき、
          //   請求書・集計・入金すべてから漏れる（請求漏れ）ため固定＝外せない。
          if (key === "日付") {
            toast("「日付」は請求書に必須のため外せません");
            return;
          }
          if (m.items.length <= 1) {
            toast("最低1項目は必要です");
            return;
          }
          m.items.splice(i, 1);
        } else {
          // 固定列は標準の位置に挿入（末尾pushだと順番がドリフトするため）。自由項目は末尾。
          var order = FIELD_DEFS.map(function (f) {
            return f.key;
          });
          var ki = order.indexOf(key);
          if (ki < 0) {
            m.items.push(key);
          } else {
            var pos = m.items.length;
            for (var j = 0; j < m.items.length; j++) {
              var oj = order.indexOf(m.items[j]);
              if (oj < 0 || oj > ki) {
                pos = j;
                break;
              }
            }
            m.items.splice(pos, 0, key);
          }
          if (!m.widths[key]) m.widths[key] = DEFAULT_WIDTH[key] || 80;
        }
        saveMaster();
        reopen(co);
      }
      // 並べ替え行の名前部分。金額・日付は固定ラベル、それ以外は編集可、自由項目は✕削除付き。
      // 並べ替え行の名前部分。名前はすべてプレーン表示（インライン編集はしない＝上のチップで
      // 追加/削除、自由項目は＋で追加できるため不要）。自由項目だけ✕で削除できる。
      function dndNameHTML(co, k) {
        var m = MASTER[co];
        var isCustom = !FIELD_DEFS.some(function (f) {
          return f.key === k;
        });
        var label = MeisaiEngine.utils.labelOf(m, k);
        var del = isCustom
          ? '<button class="dnd-del" onclick="removeCustomItem(\'' +
            esc(co) +
            "','" +
            esc(k) +
            '\')" aria-label="削除">✕</button>'
          : "";
        return '<span class="dnd-name">' + esc(label) + "</span>" + del;
      }
      // 自由項目（テキスト列）の追加。キーは一意id、表示名はlabelsで持つ。
      function addCustomItem(co, name) {
        name = (name || "").trim();
        if (!name) {
          toast("項目名を入力してください");
          return;
        }
        var m = MASTER[co];
        if (!m.labels) m.labels = {};
        if (!m.widths) m.widths = {};
        var key = "x" + Date.now().toString(36);
        m.items.push(key);
        m.labels[key] = name;
        m.widths[key] = DEFAULT_WIDTH["備考"] || 80;
        saveMaster();
        reopen(co);
        toast("項目「" + name + "」を追加しました");
      }
      function removeCustomItem(co, key) {
        var m = MASTER[co];
        m.items = m.items.filter(function (k) {
          return k !== key;
        });
        if (m.labels) delete m.labels[key];
        saveMaster();
        reopen(co);
        toast("項目「" + key + "」を削除しました");
      }
      function setMasterField(co, field, v) {
        MASTER[co][field] = v;
        saveMaster();
        toastDebounced("保存しました（請求書に反映）");
      }
      function meigiWakeru(v) {
        return String(v || "")
          .split(/[、,，\n]/)
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
      }
      function setFurikomiMeigi(co, v) {
        MASTER[co].furikomiMeigi = meigiWakeru(v);
        saveMaster();
        toastDebounced("振込名義を保存しました");
      }
      function setNoteGroups(co, v) {
        MASTER[co].noteGroups = v
          .split(/[、,，]/)
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        saveMaster();
        toastDebounced("集計の並びを保存しました");
      }
      // drag & drop reorder
      var _drag = { co: null, key: null };
      function dndStart(e, co) {
        _drag.co = co;
        _drag.key = e.currentTarget.dataset.key;
        e.currentTarget.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", _drag.key);
        } catch (x) {}
      }
      function dndOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
      function dndDrop(e, co) {
        e.preventDefault();
        var target = e.currentTarget.dataset.key;
        if (_drag.co !== co || _drag.key === target) return;
        var arr = MASTER[co].items;
        var from = arr.indexOf(_drag.key),
          to = arr.indexOf(target);
        if (from < 0 || to < 0) return;
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        saveMaster();
        reopen(co);
      }
      function dndEnd(e) {
        e.currentTarget.classList.remove("dragging");
      }

      function openAddCompany() {
        document.getElementById("modalTitle").textContent = "会社を追加";
        document.getElementById("modalBody").innerHTML =
          '<div class="frow"><div class="flabel">会社名（宛名）</div><input class="finput" id="newCoName" placeholder="例：テスト物流株式会社"></div>' +
          '<div class="scr-sub" style="margin:2px 0 10px;">追加した後、設定→会社マスタで 項目・順番 を決められます（初めは 日付／行き先／金額）。</div>' +
          '<button class="btn btn-primary" onclick="addCompany()">保存する</button>';
        openModal();
      }
      var KAISHA_KIKU_CHU = false; // 会社の 足し・付け替えを 確かめている 間（2回 押しで 2回 訊かない・対立役）
      async function addCompany() {
        if (KAISHA_KIKU_CHU) {
          toast("会社の 記録を 確かめています。少し 待ってから もう一度 押してください。");
          return;
        }
        KAISHA_KIKU_CHU = true;
        try {
          await addCompanyHontai();
        } finally {
          KAISHA_KIKU_CHU = false;
        }
      }
      async function addCompanyHontai() {
        var name = document.getElementById("newCoName").value.trim();
        if (!name) {
          toast("会社名を入力してください");
          return;
        }
        if (MASTER[name]) {
          toast("同名の会社があります");
          return;
        }
        // 同じ 名前で 消した 会社の 記録が 残っていれば 混ぜるかを 訊く（読めない 時は 足さない）
        var nokori = await sakiNiAruGyou(name);
        if (!nokori) {
          toast(
            "会社を 足しませんでした（同じ 名前の 記録の 確かめを 読めませんでした）。もう一度 試してください。"
          );
          return;
        }
        if (!mazeruKaKiku(name, nokori)) {
          toast(
            "会社を 足しませんでした（残っている 記録と 混ぜない）。別の 名前に してください。"
          );
          return;
        }
        if (MASTER[name]) {
          toast("同名の会社があります"); // 読んでいる 間に 別の 道で 足された
          return;
        }
        MASTER[name] = {
          account_id: CURRENT_ACCOUNT,
          items: ["日付", "行き先", "金額"],
          widths: { 日付: 64, 行き先: 260, 金額: 110 },
          lead: "{月}月のご利用分です。",
          tableTitle: "運転業務委託料",
          noteSummary: false,
          noteGroups: [],
        };
        saveMaster();
        closeModal();
        renderMaster();
        refreshCompanySelects();
        toast("保存しました");
      }
