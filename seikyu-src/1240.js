      function updateRegnoGate() {
        // ★読めなかった 物が 在れば 出す ボタンも 止める★（ボタンの「出せる」と 門が 同じ 物を 見る）
        var yk = yomenaiNo(SEIKYU_KEYS);
        var _gm = (document.getElementById("invMonth") || {}).value || "";
        var _gc = (document.getElementById("invCompany") || {}).value || "";
        var _gcos = _gm ? (_gc ? [_gc] : tsukiNoKaisha(_gm)) : [];
        var _gkuri = YOMENAI.payments
          ? _gcos.filter(function (c) {
              return MASTER[c] && MASTER[c].carryover;
            })
          : [];
        var ng = yk.length
          ? yomenaiBun(yk, "請求書の 作成")
          : _gkuri.length
            ? "通信が 途切れて 入金 を 取って来られませんでした。前回繰越を 載せる " +
              _gkuri.join("・") +
              " の 請求書は しません。画面を 開き直してください。"
            : jishaNg(currentIssuer());
        if (_gkuri.length) yk = ["_"];
        ["btnInvPdf", "btnInvExcel"].forEach(function (id) {
          var b = document.getElementById(id);
          if (b) b.disabled = !!ng;
        });
        var w = document.getElementById("regnoWarn");
        if (!w) return;
        if (!ng) {
          w.hidden = true;
          w.textContent = "";
          return;
        }
        w.hidden = false;
        // ★自社情報が 空の 時は 登録番号の 案内を 足さない★（振込先が 空の 客に 違う 直し方を 教えていた・対立役）
        if (yk.length || ng.indexOf("自社情報を入れてください") === 0) {
          w.innerHTML = "<b>" + esc(ng) + "</b>";
          return;
        }
        w.innerHTML =
          "<b>" +
          esc(ng) +
          "</b><br>適格請求書（インボイス）には登録番号が要ります。" +
          "<b>設定 ▸ 自社情報 ▸ 登録番号</b> に <b>T＋13桁</b>（例 T1234567890123）を入れると出せます。";
      }
      function setAlign(field, val) {
        setIssuer(field, val);
        renderIssuer();
        generateInvoices();
        toast(
          val === "left"
            ? "左揃えにしました"
            : val === "center"
              ? "中央揃えにしました"
              : "右揃えにしました"
        );
      }
      function setDateEra(val) {
        setIssuer("dateEra", val);
        renderIssuer();
        generateInvoices();
        toast("日付を" + (val === "reiwa" ? "令和" : "西暦") + "表記にしました");
      }
      function setDueEra(val) {
        setIssuer("paymentDueEra", val);
        if (typeof syncInvoiceToolbar === "function") syncInvoiceToolbar();
        generateInvoices();
        toast("お支払期限を" + (val === "reiwa" ? "令和" : "西暦") + "表記にしました");
      }
      function setIssuer(field, value) {
        if (!ISSUER_SETTINGS[CURRENT_ACCOUNT]) ISSUER_SETTINGS[CURRENT_ACCOUNT] = blankIssuer();
        ISSUER_SETTINGS[CURRENT_ACCOUNT][field] = value;
        saveIssuer();
        updateRegnoGate(); // 直したその場で 出せる/出せないを切り替える
      }
      function renderIssuer() {
        var s = currentIssuer();
        ensureLogoTrimmed(); // 既存ロゴの余白を一度だけ自動トリミング（揃え）
        var ti = document.getElementById("iss_issuer");
        var tb = document.getElementById("iss_bank");
        // ★登録番号の欄★ 今の値を出し、形が違えば その場で理由を出す
        var tr = document.getElementById("iss_regno");
        if (tr) tr.value = regnoOf(s);
        var rh = document.getElementById("regnoHint");
        if (rh) {
          var ng = regnoNg(s);
          rh.textContent = ng
            ? ng + " ／ 入っていないと 請求書は出せません"
            : "T＋13桁で入っています（請求書に刷られます）";
          rh.style.color = ng ? "#c0392b" : "#555555";
        }
        var ia = s.issuerAlign || "left";
        var ba = s.bankAlign || "left";
        if (ti) {
          ti.value = s.issuer || "";
          ti.style.textAlign = ia;
        }
        if (tb) {
          tb.value = s.bank || "";
          tb.style.textAlign = ba;
        }
        // 揃え／白抜きボタンのハイライト更新
        var bg = s.hankoBg || "auto";
        var lbg = s.logoBg || "auto";
        var era = s.dateEra || "seireki";
        document.querySelectorAll(".align-btn").forEach(function (b) {
          var grp = b.dataset.grp;
          var cur =
            grp === "issuerAlign"
              ? ia
              : grp === "bankAlign"
                ? ba
                : grp === "hankoBg"
                  ? bg
                  : grp === "logoBg"
                    ? lbg
                    : grp === "dueEra"
                      ? s.paymentDueEra || "seireki"
                      : era;
          b.classList.toggle("on", b.dataset.a === cur);
        });
        var sz = document.getElementById("iss_hankoSize");
        if (sz && document.activeElement !== sz) sz.value = s.hankoSizeMm || 21;
        var lsz = document.getElementById("iss_logoSize");
        // 旧データで46超を保存していたら一度だけ46へ正す（上限と一致）。
        var lmm = Number(s.logoSizeMm) || 40;
        if (lmm > 46 || lmm < 10) {
          lmm = Math.max(10, Math.min(46, lmm));
          setIssuer("logoSizeMm", lmm);
        }
        if (lsz && document.activeElement !== lsz) lsz.value = lmm;
        var cn = document.getElementById("iss_showNo");
        if (cn) cn.checked = !!s.showInvoiceNo;
        // プレビューは選んだmmサイズに比例して大小を表示＝サイズ変更が目で見える(共通 約1.6px/mm)。
        var prev = document.getElementById("hankoPreview");
        if (s.hanko) {
          var hmm = Number(s.hankoSizeMm) || 21;
          var hpx = Math.max(16, Math.min(72, Math.round(hmm * 1.6)));
          prev.innerHTML =
            '<img src="' +
            s.hanko +
            '" style="width:' +
            hpx +
            "px;height:" +
            hpx +
            'px;object-fit:contain;display:block;margin:auto;">';
        } else {
          prev.textContent = "なし";
        }
        var lprev = document.getElementById("logoPreview");
        if (lprev) {
          if (s.logo) {
            var lmm = Number(s.logoSizeMm) || 40;
            var lpx = Math.max(24, Math.min(96, Math.round(lmm * 1.6)));
            lprev.innerHTML =
              '<img src="' +
              s.logo +
              '" style="width:' +
              lpx +
              'px;max-height:100%;object-fit:contain;display:block;margin:auto;">';
          } else {
            lprev.textContent = "なし";
          }
        }
      }
      function loadHanko(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          setIssuer("hankoRaw", e.target.result); // 元画像を保持（再処理用）
          reprocessHanko();
        };
        reader.readAsDataURL(file);
        ev.target.value = "";
      }
      // 元画像から、選択中の白抜きモードで処理して hanko を更新
      function reprocessHanko() {
        var s = currentIssuer();
        if (!s.hankoRaw) return;
        HankoTool.process(s.hankoRaw, { mode: s.hankoBg || "auto" }).then(function (r) {
          setIssuer("hanko", r.dataURL);
          renderIssuer();
          toast(r.kept ? "透過済み画像をそのまま使います" : "判子を保存しました（背景を透過）");
        });
      }
      function setHankoBg(mode) {
        setIssuer("hankoBg", mode);
        renderIssuer();
        reprocessHanko(); // モード変更→元画像から作り直し
      }
      function setHankoSize(v) {
        var n = Number(String(v).replace(/[^0-9.]/g, "")) || 21;
        setIssuer("hankoSizeMm", n);
        renderIssuer(); // プレビューを実サイズで更新（大小が見える）
        generateInvoices(); // 請求書プレビュー（実PDF）も更新
        toastDebounced("判子の大きさを " + n + "mm にしました（請求書に反映）");
      }
      function clearHanko() {
        setIssuer("hanko", "");
        setIssuer("hankoRaw", "");
        renderIssuer();
        toast("判子を消しました");
      }
      // ===== 会社ロゴ（判子と同じ仕組み：登録→白抜き透過→サイズ調整） =====
      function loadLogo(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          setIssuer("logoRaw", e.target.result); // 元画像を保持（再処理用）
          reprocessLogo();
        };
        reader.readAsDataURL(file);
        ev.target.value = "";
      }
      function reprocessLogo() {
        var s = currentIssuer();
        if (!s.logoRaw) return;
        HankoTool.process(s.logoRaw, { mode: s.logoBg || "auto" }).then(function (r) {
          // ★透明余白を自動で詰める＝ロゴの「見えてる上端」が請求書タイトルの上端にピタッと揃う。
          trimTransparentPNG(r.dataURL).then(function (trimmed) {
            setIssuer("logo", trimmed);
            setIssuer("logoTrimmed", true);
            renderIssuer();
            generateInvoices();
            toast(r.kept ? "透過済みロゴをそのまま使います" : "ロゴを保存しました（背景を透過）");
          });
        });
      }
      // PNGの周囲の透明部分を切り落として返す（不透明な絵柄だけにする）。失敗時は元のまま。
      function trimTransparentPNG(dataURL) {
        return new Promise(function (resolve) {
          if (!dataURL || dataURL.indexOf("data:image/png") !== 0) return resolve(dataURL);
          var img = new Image();
          img.onload = function () {
            var w = img.naturalWidth,
              h = img.naturalHeight;
            if (!w || !h) return resolve(dataURL);
            var cv = document.createElement("canvas");
            cv.width = w;
            cv.height = h;
            var cx = cv.getContext("2d");
            cx.drawImage(img, 0, 0);
            var data;
            try {
              data = cx.getImageData(0, 0, w, h).data;
            } catch (e) {
              return resolve(dataURL);
            }
            var minX = w,
              minY = h,
              maxX = -1,
              maxY = -1,
              A = 10; // アルファ閾値
            for (var y = 0; y < h; y++) {
              for (var x = 0; x < w; x++) {
                if (data[(y * w + x) * 4 + 3] > A) {
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }
            if (maxX < minX || maxY < minY) return resolve(dataURL); // 全部透明
            var pad = 1;
            minX = Math.max(0, minX - pad);
            minY = Math.max(0, minY - pad);
            maxX = Math.min(w - 1, maxX + pad);
            maxY = Math.min(h - 1, maxY + pad);
            var tw = maxX - minX + 1,
              th = maxY - minY + 1;
            if (tw >= w && th >= h) return resolve(dataURL); // 詰める余地なし
            var oc = document.createElement("canvas");
            oc.width = tw;
            oc.height = th;
            oc.getContext("2d").drawImage(cv, minX, minY, tw, th, 0, 0, tw, th);
            resolve(oc.toDataURL("image/png"));
          };
          img.onerror = function () {
            resolve(dataURL);
          };
          img.src = dataURL;
        });
      }
