      // 既存ロゴ（過去にアップ済み）も一度だけ余白トリミングして揃える（再アップ不要の自己修復）。
      function ensureLogoTrimmed() {
        var s = currentIssuer();
        if (!s.logo || s.logoTrimmed) return;
        setIssuer("logoTrimmed", true); // 多重実行防止に先にフラグ
        trimTransparentPNG(s.logo).then(function (trimmed) {
          if (trimmed && trimmed !== s.logo) {
            setIssuer("logo", trimmed);
            renderIssuer();
            generateInvoices();
          }
        });
      }
      function setLogoBg(mode) {
        setIssuer("logoBg", mode);
        renderIssuer();
        reprocessLogo();
      }
      function setLogoSize(v) {
        var n = Number(String(v).replace(/[^0-9.]/g, "")) || 40;
        n = Math.max(10, Math.min(46, n)); // 下限10mm・上限46mm（=描画の実効上限・範囲外は確定時に強制クランプ）
        setIssuer("logoSizeMm", n);
        renderIssuer(); // プレビューを実サイズで更新（大小が見える）
        generateInvoices(); // 請求書プレビュー（実PDF）も更新
        toastDebounced("ロゴの大きさを " + n + "mm にしました（請求書に反映）");
        return n; // onchange でクランプ後の値を入力欄へ書き戻す
      }
      function clearLogo() {
        setIssuer("logo", "");
        setIssuer("logoRaw", "");
        renderIssuer();
        toast("ロゴを消しました");
      }

      /* ===================================================================
      会社プルダウン群を最新化
      =================================================================== */
      function refreshCompanySelects() {
        var names = Object.keys(MASTER).filter(function (n) {
          return MASTER[n].account_id === CURRENT_ACCOUNT;
        });
        [
          ["inputCompany", false],
          ["listCompany", true],
        ].forEach(function (pair) {
          var el = document.getElementById(pair[0]);
          if (!el) return;
          var keep = el.value;
          var head = pair[1]
            ? '<option value="">全社</option>'
            : '<option value="">― 会社を選択 ―</option>';
          el.innerHTML = head + _companyOptsHtml(names);
          if (names.indexOf(keep) >= 0 || keep === "") el.value = keep;
        });
      }

      /* ===================================================================
      入力画面（定義駆動：マスタのitemsだけ欄を出す）
      =================================================================== */
      // 会社選択補助：直近に使った会社を自動選択（未選択のときだけ）。連続入力が速くなる。
      function preselectInputCompany() {
        var el = document.getElementById("inputCompany");
        if (!el || el.value) return;
        var last = "";
        try {
          last = localStorage.getItem(LAST_CO_KEY) || "";
        } catch (e) {}
        if (last && MASTER[last] && MASTER[last].account_id === CURRENT_ACCOUNT) {
          el.value = last;
          onInputCompany();
        }
      }
      function onInputCompany() {
        var co = document.getElementById("inputCompany").value;
        var card = document.getElementById("entryCard");
        if (!co || !MASTER[co]) {
          card.style.display = "none";
          return;
        }
        card.style.display = "block";
        document.getElementById("entryCardLabel").textContent = co + " の明細";
        recordCompanyUse(co); // ★選んだ時点で「最近使った」に記録＝次開いたら上に来る
        entryRows = [blankEntry()];
        aiSgObi("");
        renderEntry();
        aiSgTouMiru();
      }
      function blankEntry() {
        var last = entryRows && entryRows.length ? entryRows[entryRows.length - 1] : null;
        var e = {};
        FIELD_DEFS.forEach(function (f) {
          e[f.key] = "";
        });
        // 日付は引き継ぎ（連続入力の利便）。★確かめていない AI の 行の 日付は 写さない★（読み違いを 広げない・v3）
        if (last && last["日付"] && !(last._ai && !last._kakunin)) e["日付"] = last["日付"];
        return e;
      }

      /* ===================================================================
            ★写真と声 → AI の 下書き（③）★ 2026-11-03（司さん 11-02「AI が 下書き→人が 確かめて 保存した 時だけ 入る」）
            ・★倉庫へは 何も 書かない★＝返った 行は entryRows（画面だけの 行）に 入る。保存は 今の saveEntries（hozonMon の 門つき）
            ・釦は 口の ?tou=1 が true の 時だけ 出す（許した 利用者 かつ 鍵が 在る）
            ・AI 由来の 字は 全部 esc を 通す。候補は 番号で 渡す（値を onclick に 埋めない）
            ・頼んだ 時の 会社と 項目の 並びを 覚え、届いた 時に 違えば 捨てる（v3 注F）
            =================================================================== */
      var AI_SG = { tou: null, touMiru: null, busy: false, ctl: null, mic: null };
      function aiSgObi(msg) {
        var el = document.getElementById("aiSgObi");
        if (!el) return;
        el.textContent = msg || "";
        el.style.display = msg ? "block" : "none";
      }
      async function aiSgTokun() {
        var ses = await SB.auth.getSession(); // 鍵は 毎回 取り直す（古い 鍵を 掴まない・v2 注7）
        return (ses && ses.data && ses.data.session && ses.data.session.access_token) || "";
      }
      function aiSgTouMiru() {
        if (AI_SG.tou === true) return aiSgMiseru();
        if (AI_SG.touMiru) return AI_SG.touMiru;
        AI_SG.touMiru = (async function () {
          try {
            var tok = await aiSgTokun();
            if (!tok) return;
            var r = await fetch("/api/shitagaki?tou=1", {
              method: "GET",
              headers: { Authorization: "Bearer " + tok },
              cache: "no-store",
            });
            var j = await r.json().catch(function () {
              return null;
            });
            AI_SG.tou = !!(r.ok && j && j.tsukaeru === true);
          } catch (e) {
            AI_SG.tou = false;
          } finally {
            AI_SG.touMiru = null;
          }
          aiSgMiseru();
        })();
        return AI_SG.touMiru;
      }
      function aiSgMiseru() {
        var el = document.getElementById("aiSg");
        if (el) el.style.display = AI_SG.tou === true ? "block" : "none";
        var mic = document.getElementById("aiSgMic");
        var nashi = document.getElementById("aiSgMicNashi");
        var ari =
          typeof window.webkitSpeechRecognition === "function" ||
          typeof window.SpeechRecognition === "function";
        if (mic) mic.style.display = ari ? "" : "none";
        if (nashi) nashi.style.display = ari ? "none" : "block";
      }
      function aiSgBusy(on) {
        AI_SG.busy = on;
        ["aiSgShashin", "aiSgKoe", "aiSgKoeOkuru"].forEach(function (id) {
          var b = document.getElementById(id);
          if (b) b.disabled = on;
        });
        var m = document.getElementById("aiSgMatsu");
        if (m) m.style.display = on ? "block" : "none";
      }
      function aiSgShashinHiraku() {
        if (AI_SG.busy || _entrySaving) return;
        if (!document.getElementById("inputCompany").value) return toast("会社を選んでください");
        var f = document.getElementById("aiSgFile");
        f.value = "";
        f.click();
      }
      function aiSgKoeHiraku() {
        var p = document.getElementById("aiSgKoePanel");
        p.style.display = p.style.display === "none" ? "block" : "none";
        aiSgMiseru();
      }
      function aiSgMic() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return;
        if (AI_SG.mic) {
          try {
            AI_SG.mic.stop();
          } catch (e) {}
          return;
        }
        var rec = new SR();
        rec.lang = "ja-JP";
        rec.interimResults = false;
        rec.continuous = false;
        var btn = document.getElementById("aiSgMic");
        rec.onresult = function (ev) {
          var t = "";
          for (var i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript;
          var ta = document.getElementById("aiSgBun");
          ta.value = (ta.value ? ta.value + "\n" : "") + t;
        };
        rec.onend = function () {
          AI_SG.mic = null;
          if (btn) btn.textContent = "マイクで話す";
        };
        rec.onerror = function (ev) {
          toast("マイクが使えませんでした（" + (ev && ev.error ? ev.error : "") + "）");
        };
        AI_SG.mic = rec;
        if (btn) btn.textContent = "話し終えたら押す";
        try {
          rec.start();
        } catch (e) {
          AI_SG.mic = null;
          if (btn) btn.textContent = "マイクで話す";
        }
      }
      function aiSgKoeOkuru() {
        var bun = document.getElementById("aiSgBun").value;
        if (!String(bun).trim()) return toast("文が空です");
        aiSgOkuru({ shurui: "koe", bun: bun });
      }
      /* 写真は 端末で 縮める：長い辺 2000px・JPEG 0.85（受け取り 上限 4.5MB と 代金のため） */
      function aiSgChijimeru(file) {
        return new Promise(function (ok, ng) {
          var url = URL.createObjectURL(file);
          var img = new Image();
          img.onload = function () {
            try {
              var w = img.naturalWidth,
                h = img.naturalHeight;
              var s = Math.min(1, 2000 / Math.max(w, h));
              var c = document.createElement("canvas");
              c.width = Math.max(1, Math.round(w * s));
              c.height = Math.max(1, Math.round(h * s));
              var g = c.getContext("2d");
              g.fillStyle = "#ffffff";
              g.fillRect(0, 0, c.width, c.height);
              g.drawImage(img, 0, 0, c.width, c.height);
              var d = c.toDataURL("image/jpeg", 0.85);
              URL.revokeObjectURL(url);
              ok({ b64: d.slice(d.indexOf(",") + 1), w: c.width, h: c.height });
            } catch (e) {
              URL.revokeObjectURL(url);
              ng(e);
            }
          };
          img.onerror = function () {
            URL.revokeObjectURL(url);
            ng(new Error("写真を開けませんでした"));
          };
          img.src = url;
        });
      }
      async function aiSgFileErabu(el) {
        var file = el.files && el.files[0];
        if (!file) return;
        var z;
        try {
          z = await aiSgChijimeru(file);
        } catch (e) {
          return toast("写真を開けませんでした");
        }
        aiSgOkuru({ shurui: "shashin", media_type: "image/jpeg", gazou_base64: z.b64 });
      }
