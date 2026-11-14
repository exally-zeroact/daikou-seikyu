/* ==========================================================================
   lib/kagi-fetch.js — 倉庫へ 出る 手前の 口（鍵切れ・違う人の 鍵で 書かない）
   ★2026-11-14 件⑥（設計 4版〜5版・紙 sekkei_seikyu_kagikire_2026-11-14.md）★
   何を 守るか：
     ログインの 鍵が 切れると supabase-js は 公開鍵（anon）で 倉庫へ 出る。倉庫の 決まり（RLS）は
     anon の PATCH/DELETE を 0行・誤り無しの 200 [] で 返す＝画面は「保存しました」と 言うのに 何も 入らない
     （テスト倉庫で 測った）。別の タブで 違う人が 入ると、この タブの 画面の まま 違う人の 鍵で 書いて しまう。
     →★倉庫へ 送る 鍵そのもの★（supabase-js の fetchWithAuth が Authorization を 付け終えてから
       createClient の global.fetch を 呼ぶ）を 見て、入った人の 鍵（sub＝hito()）の 時だけ 通す。
   通す：
     ・倉庫の host 以外（口の 外）・倉庫の /auth/v1/（ログインと 鍵の 更新）
     ・hito() が null（まだ 入っていない＝今の 動きの まま）
     ・Authorization の 鍵の sub ＝ hito()
   止める（倉庫へは 送らない）：
     ・公開鍵／鍵が 無い／読めない＝401 {code:"KAGI_KIRE"} を 返し kireta() を 呼ぶ
       （電波が 無い 時は TypeError("Failed to fetch")＝今の 通信の 失敗の 道）
     ・sub ≠ hito()＝401 {code:"KAGI_HITO"} を 返し chigau() を 呼ぶ
   知らせる：入った人の 鍵で 倉庫へ 通した 時は tootta() を 呼ぶ（6.2版：最後に 通した 時より 後に 出た
     「〜しました」は 入ったと 確かめられない＝鍵切れの 時に 板へ 移す 窓の 頭）
   公開：window.KagiFetch（Node では module.exports）。DOM と 倉庫は 触らない
   ========================================================================== */
(function (root) {
  "use strict";

  function b64urlJi(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin =
      typeof root.atob === "function" ? root.atob(s) : Buffer.from(s, "base64").toString("binary");
    try {
      return decodeURIComponent(
        bin
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
    } catch (e) {
      return bin;
    }
  }

  /* 鍵（JWT）の sub を 読む。読めなければ null */
  function kagiNoSub(jwt) {
    if (!jwt || typeof jwt !== "string") return null;
    var p = jwt.split(".");
    if (p.length !== 3) return null;
    try {
      var o = JSON.parse(b64urlJi(p[1]));
      return o && typeof o.sub === "string" && o.sub ? o.sub : null;
    } catch (e) {
      return null;
    }
  }

  function midashiNoKagi(input, init) {
    var h = (init && init.headers) || (input && typeof input === "object" && input.headers) || null;
    var v = null;
    if (h) {
      if (typeof h.get === "function") v = h.get("Authorization");
      else if (Array.isArray(h)) {
        h.forEach(function (kv) {
          if (String(kv[0]).toLowerCase() === "authorization") v = kv[1];
        });
      } else {
        Object.keys(h).forEach(function (k) {
          if (k.toLowerCase() === "authorization") v = h[k];
        });
      }
    }
    if (!v) return null;
    var m = /^Bearer\s+(.+)$/i.exec(String(v).trim());
    return m ? m[1] : null;
  }

  function sumika(input) {
    var s = typeof input === "string" ? input : input && (input.url || input.href || String(input));
    try {
      return new URL(s);
    } catch (e) {
      return null;
    }
  }

  function kotae(code, message) {
    return new Response(
      JSON.stringify({ code: code, message: message, details: null, hint: null }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  function tsukuru(o) {
    if (!o || !o.url || typeof o.hito !== "function" || typeof o.fetch !== "function") {
      throw new Error("KagiFetch.tsukuru: url・hito・fetch が 要る");
    }
    var kuraHost = new URL(o.url).host;
    var motoFetch = o.fetch;
    var kireta = typeof o.kireta === "function" ? o.kireta : function () {};
    var chigau = typeof o.chigau === "function" ? o.chigau : function () {};
    var tootta = typeof o.tootta === "function" ? o.tootta : function () {};
    var nav = o.navigator || root.navigator || null;

    return function kagiFetch(input, init) {
      var u = sumika(input);
      if (!u || u.host !== kuraHost) return motoFetch(input, init);
      if (u.pathname.indexOf("/auth/v1/") === 0) return motoFetch(input, init);
      var hito = o.hito();
      if (!hito) return motoFetch(input, init);
      var sub = kagiNoSub(midashiNoKagi(input, init));
      if (sub === hito) {
        try {
          tootta();
        } catch (e) {
          /* 受けの 誤りで 通しを 崩さない */
        }
        return motoFetch(input, init);
      }
      if (sub) {
        try {
          chigau(sub);
        } catch (e) {
          /* 受けの 誤りで 止めを 崩さない */
        }
        return Promise.resolve(
          kotae("KAGI_HITO", "別の人で入り直されています（倉庫へは送っていません）")
        );
      }
      if (nav && nav.onLine === false) return Promise.reject(new TypeError("Failed to fetch"));
      try {
        kireta();
      } catch (e) {
        /* 受けの 誤りで 止めを 崩さない */
      }
      return Promise.resolve(
        kotae("KAGI_KIRE", "ログインが切れています（倉庫へは送っていません）")
      );
    };
  }

  var api = { tsukuru: tsukuru, kagiNoSub: kagiNoSub };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KagiFetch = api;
})(typeof window !== "undefined" ? window : globalThis);
