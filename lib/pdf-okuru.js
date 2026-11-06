/* ==========================================================================
   lib/pdf-okuru.js — PDF を 送る（iPhone・iPad は 共有の 画面に PDF と 字だけ 渡す）
   ★2026-11-06 司さんの 答え「B」★（11-04「LINE で PDF と 一緒に 開けない blob:https://… の URL も 届く・
     どの アプリでも ならない 様に」）
     ・直す 前＝PDF を blob の URL で 開き、その 画面の 共有から 送っていた
       ＝iPhone は ★開いている 頁の URL（blob:https://…）も 一緒に 渡す★ → LINE に 開けない URL が 届いた。
     ・直した 後＝navigator.share に ★files と text だけ★（url・title は 付けない）。
       司さんの 実機（テスト線 share-test.html の B）で LINE に 字と PDF の 両方が 届いた。
     ・★files だけ（A）には 戻さない★＝10-25・10-30 に Daikou-app で 入れて「LINE ないやないか」（共有の 画面に LINE が 並ばない）。
     ・Android・パソコン＝今まで 通り（呼ぶ 側の 道）。共有が 使えない・ほかの エラー＝今まで 通り。
     ・iPhone は PDF を 作る 数秒の 間に「押した」扱いが 切れて 断る 事が ある（NotAllowedError）
       ＝今の 道に 落とすと URL が 付く 道に 戻る ⇒ 画面に「送る・印刷する」の 帯を 出し、押した 時に 同じ 共有を 開く。
   公開：window.PdfOkuru（Node では module.exports）
   ========================================================================== */
(function (root) {
  "use strict";

  // ★指で 触る Apple の 端末★（iPhone・iPod・iPad。iPadOS の Safari は Mac の 名乗り＋触れる 点）
  function appleTouch(nav) {
    nav = nav || {};
    var ua = String(nav.userAgent || "");
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return nav.platform === "MacIntel" && Number(nav.maxTouchPoints) > 1;
  }

  // ★共有に 添える 字★ 紙の 宛名（invoice-pdf.js「〇〇 御中」）に 合わせる
  //   month＝"2026-10"・co＝会社名（全社 まとめは 空）・kakunin＝入金画面の 確認の 紙
  function seikyuJi(month, co, kakunin) {
    var m = String(month || "").split("-")[1];
    var ji = "請求書" + (m ? " " + Number(m) + "月分" : "");
    if (co) ji += " " + co + " 御中";
    return (kakunin ? "確認用 " : "") + ji;
  }

  function fileOf(env, bytes, filename) {
    try {
      var B = env.Blob,
        F = env.File;
      if (typeof F !== "function") return null;
      var data = typeof B === "function" ? new B([bytes], { type: "application/pdf" }) : bytes;
      return new F([data], filename, { type: "application/pdf" });
    } catch {
      return null;
    }
  }

  // ★帯を 消す★ 画面を 移った・次の 紙を 作る 時（古い 紙を 送らない・対立役 注3）
  function kesu(env) {
    env = env || root || {};
    var doc = env.document;
    var old = doc && doc.getElementById && doc.getElementById("pdfOkuruObi");
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  // ★帯★（共有は 押した その 時にしか 開けない）＝どの 紙か 名前を 出す
  //   opt.chui＝出せない 字（〓）の 知らせ（toast は 帯の 下に 隠れる＝帯の 字に 入れる・注2）
  //   opt.hiraku＝今の 道（PDF を 開く）。帯でも 断られたら 出す（行き止まりに しない・注1）
  function obi(env, go, filename, opt) {
    var doc = env.document;
    if (!doc || !doc.body) return;
    kesu(env);
    var bar = doc.createElement("div");
    bar.id = "pdfOkuruObi";
    bar.setAttribute("role", "dialog");
    // ★下の ナビの 上★（iPhone の ホームの 棒に 被らない・今の 帯と 同じ 置き方・注6）
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:calc(var(--nav-h, 56px) + env(safe-area-inset-bottom) + 8px);" +
      "z-index:100000;background:#fff;border:1px solid #c9d6cf;border-radius:14px;padding:12px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.18);display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
    var msg = doc.createElement("div");
    msg.id = "pdfOkuruMsg";
    msg.style.cssText = "flex:1 1 160px;font-size:14px;";
    var chui = opt && opt.chui ? "　" + opt.chui : "";
    msg.textContent = "PDF が できました（" + filename + "）" + chui;
    var b = doc.createElement("button");
    b.type = "button";
    b.id = "pdfOkuruGo";
    b.className = "btn btn-primary btn-sm";
    b.textContent = "送る・印刷する";
    var x = doc.createElement("button");
    x.type = "button";
    x.id = "pdfOkuruTojiru";
    x.className = "btn btn-sm";
    x.textContent = "閉じる";
    function close() {
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    }
    var hirakuAru = false;
    function hirakuDasu() {
      if (hirakuAru || !(opt && typeof opt.hiraku === "function")) return;
      hirakuAru = true;
      var h = doc.createElement("button");
      h.type = "button";
      h.id = "pdfOkuruHiraku";
      h.className = "btn btn-sm";
      h.textContent = "PDF を 開く";
      h.onclick = function () {
        close();
        opt.hiraku();
      };
      bar.insertBefore ? bar.insertBefore(h, x) : bar.appendChild(h);
    }
    b.onclick = function () {
      var p;
      try {
        p = go();
      } catch (e) {
        p = Promise.reject(e);
      }
      return Promise.resolve(p).then(close, function (e) {
        if (e && e.name === "AbortError") return close();
        msg.textContent =
          "送れませんでした（" +
          ((e && e.name) || "不明") +
          "）。「PDF を 開く」から 開いて、その 画面の 共有で 送るか 印刷してください。";
        hirakuDasu();
      });
    };
    x.onclick = close;
    bar.appendChild(msg);
    bar.appendChild(b);
    bar.appendChild(x);
    doc.body.appendChild(bar);
    // ★帯の 高さを 画面へ 渡す★（知らせ toast を 帯の 上へ 逃がす 為・呼ぶ 側の CSS が 使う）
    try {
      if (doc.documentElement && doc.documentElement.style && bar.offsetHeight)
        doc.documentElement.style.setProperty("--pdf-obi-h", bar.offsetHeight + "px");
    } catch {
      /* 測れない 端末＝CSS の 既定（72px） */
    }
  }

  // ★送る★ → Promise<{how:'share'|'cancel'|'need-tap'|'none'}>
  //   'none' の 時だけ 呼ぶ 側が 今までの 道（PC は 窓・スマホは 保存）
  //   opt＝{ chui: 出せない 字の 知らせ, hiraku: 今の 道（帯で 断られた 時の 逃げ道） }
  function okuru(bytes, filename, text, env, opt) {
    env = env || root || {};
    var nav = env.navigator;
    if (!nav || !appleTouch(nav)) return Promise.resolve({ how: "none" });
    // ★share も canShare も 要る★（無い 端末＝今の 道・紙と 中身を 揃えた 任4）
    if (typeof nav.share !== "function" || typeof nav.canShare !== "function")
      return Promise.resolve({ how: "none" });
    var file = fileOf(env, bytes, filename);
    if (!file) return Promise.resolve({ how: "none" });
    var data = { files: [file], text: String(text || "") }; // ★files と text だけ（url・title は 付けない）★
    try {
      if (!nav.canShare(data)) return Promise.resolve({ how: "none" });
    } catch {
      return Promise.resolve({ how: "none" });
    }
    function go() {
      return nav.share({ files: [file], text: data.text });
    }
    var p;
    try {
      p = go();
    } catch (e) {
      p = Promise.reject(e);
    }
    return Promise.resolve(p).then(
      function () {
        return { how: "share" };
      },
      function (e) {
        var nm = e && e.name;
        if (nm === "AbortError") return { how: "cancel" };
        if (nm === "NotAllowedError") {
          obi(env, go, filename, opt);
          return { how: "need-tap" };
        }
        return { how: "none" };
      }
    );
  }

  var api = { appleTouch: appleTouch, seikyuJi: seikyuJi, okuru: okuru, kesu: kesu };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PdfOkuru = api;
})(typeof window !== "undefined" ? window : this);
