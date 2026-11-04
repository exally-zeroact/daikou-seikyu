/* ==========================================================================
   lib/nijuu.js — 請求書を 出す 前の 見張りの 部品（倉庫と 画面の 違い・料金が 空の メーターの 行）
   ★2026-11-04 夜 手の 行と メーターの 行の「同じ 乗車かも」（二重請求の 見張り）は 外した★
     司さん「おれが 入力しよんやけん いちいち 出すなや／いつ こんなん 出せって 指示したんど」＝頼まれていない 見張り。
     保存の 時（sagasu・yomuHanni・betsuKagi・tomeru）も 出す 時（hakkoMae の kasanari・kasanariKagi）も 消した。
     倉庫に 残った extra.nijuu_betsu は 読む 所が 無いだけ（消さない）。ファイル名と window.Nijuu の 名は 他から 読まれるので そのまま。
   公開：window.Nijuu（Node では module.exports）。DOM と 倉庫は 触らない
   ========================================================================== */
(function (root) {
  "use strict";

  function meterKa(r) {
    return !!(r && (r.dk_source || r.dk_ref));
  }

  function gaku(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* ==========================================================================
     ★請求書を 出す 前の 見張り★ 2026-11-04（設計前の 対立役 v1 止5・v2 止3注8 を 受けて）
     訳：画面の 明細（DB）と 入金（PAYMENTS）は ログインの 時に 1回 読むだけ＝開いた 後に メーターから
         入った 行・別の 端末で 直した 行・記録した 入金が 紙に 出ない（少なく／古い 繰越で 請求）。
         出す 前に 倉庫を 丸ごと 読み直し、この 紙の 材料に 触れる 違いが 在れば 画面を 最新に して 1回 止める。
     ========================================================================== */

  /* 鍵の 順を 揃える（jsonb は 鍵を 並べ替えて 返す・対立役 v2 注1） */
  function junKagi(v) {
    if (Array.isArray(v)) return v.map(junKagi);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v)
        .sort()
        .forEach(function (k) {
          o[k] = junKagi(v[k]);
        });
      return o;
    }
    return v;
  }
  function shirushi(x) {
    return JSON.stringify(junKagi(x));
  }

  /* mae＝画面の 物・ato＝倉庫から 読み直した 物。どちらも [{id, sig, row}]。
     fureru(row)＝この 紙の 材料か（違いの 前と 後の どちらかが 触れれば 数える・対立役 v2 注2）。
     ★画面の 中で 同じ id が 2回 出るのも 違い★（保存の 途中に 丸ごと 替えると 2重に 入る・対立役 v2 止A）
     返す { tasu, naoru, kieru, kasanaru, zenbu }（zenbu＝触れない 物も 含めた 違いの 数） */
  function zureKazoeru(mae, ato, fureru) {
    fureru =
      fureru ||
      function () {
        return true;
      };
    var out = { tasu: 0, naoru: 0, kieru: 0, kasanaru: 0, zenbu: 0 };
    var m = {};
    (mae || []).forEach(function (x) {
      var k = String(x.id);
      if (m[k]) {
        out.zenbu++;
        if (fureru(x.row) || fureru(m[k].row)) out.kasanaru++;
        return;
      }
      m[k] = x;
    });
    var a = {};
    (ato || []).forEach(function (x) {
      var k = String(x.id);
      a[k] = x;
      var y = m[k];
      if (!y) {
        out.zenbu++;
        if (fureru(x.row)) out.tasu++;
      } else if (y.sig !== x.sig) {
        out.zenbu++;
        if (fureru(x.row) || fureru(y.row)) out.naoru++;
      }
    });
    Object.keys(m).forEach(function (k) {
      if (a[k]) return;
      out.zenbu++;
      if (fureru(m[k].row)) out.kieru++;
    });
    return out;
  }

  function tsukiKa(hi, month) {
    return !!(hi && month && String(hi).slice(0, 7) === month);
  }

  /* rows＝倉庫と 揃えた DB（meisaiFromDb の 形）・month＝"YYYY-MM"・cos＝紙に 載せる 会社。
     返す { mitei: [ {id,会社名,日付,行き先} ] }
       mitei＝その 月の メーターの 行で 額が 空（料金が まだ 決まっていない）＝★0円は 入れない★（対立役 v2 注7） */
  function hakkoMae(rows, month, cos) {
    var co = {};
    (cos || []).forEach(function (c) {
      co[c] = true;
    });
    var mitei = [];
    (rows || []).forEach(function (r) {
      if (!r || !co[r.会社名] || !meterKa(r)) return;
      // 料金未定＝額が 空、または 額が 0 で メーターの 料金（dk_meter_yen）も 無い
      //   （前の 版で 一覧の 直しが 空を 0 に して 書いた 行・対立役 止1。本当の 0円は dk_meter_yen が 0）
      if (
        tsukiKa(r.日付, month) &&
        (r.金額 === "" ||
          r.金額 == null ||
          (gaku(r.金額) == null &&
            (r.dk_meter_yen === "" || r.dk_meter_yen == null) &&
            r.ryokin_0_kimeta !== true))
      )
        mitei.push({ id: r.id, 会社名: r.会社名, 日付: r.日付, 行き先: r.行き先 || "" });
    });
    return { mitei: mitei };
  }

  var api = {
    shirushi: shirushi,
    zureKazoeru: zureKazoeru,
    hakkoMae: hakkoMae,
    meterKa: meterKa,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Nijuu = api;
})(typeof window !== "undefined" ? window : this);
