/* ==========================================================================
   lib/nijuu.js — 手で入れた行と メーターの行の 二重請求の 見張り 2026-11-04
   訳：紙の 明細の 多くは 手入力。同じ 乗車が メーター（ダイコメ → dk-sync-jobs → meisai・
       extra.dk_source／dk_ref）からも 入ると 二重に 請求する。保存の 直前に 倉庫から 読み直した
       メーターの 行と 突き合わせ、当たれば 人に「同じ 乗車か／別の 乗車か」を 選ばせる（額は 変えない）。
   決まり：
     ・倉庫に 入る 値（meisaiToDb の 後の company/date/amount）で 見る（対立役 注3）
     ・メーターの 日付＝勤務を 始めた 日（Daikou-app meisai-row.js businessDate）。乗車は その 後＝
       「メーターの 日付 ≦ 手の 日付 ≦ メーターの 日付＋1」で 当てる（対立役 注2）
     ・★拾えない 物★：［続ける］で 晩を またいだ 勤務（差が 2日 以上）＝ここでは 拾わない（対立役 注1）
     ・手同士・同じ 保存の 中の 行同士は 見ない（同じ 額の 乗車が 同じ 晩に 2本は 普通に 在る）
     ・日付が 無い・額が 0 の 行は 突き合わせず nashi に 数える（黙って 0本に しない・対立役 注4）
     ・「別の 乗車」は 決めた 時の 日付|額|当たった 行の id と 今が 同じ 時だけ 効く（対立役 注5）
   公開：window.Nijuu（Node では module.exports）。DOM と 倉庫は 触らない
   ========================================================================== */
(function (root) {
  "use strict";

  var HI_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function hiNoMs(s) {
    var mm = HI_RE.exec(String(s == null ? "" : s));
    if (!mm) return null;
    var y = Number(mm[1]);
    var mo = Number(mm[2]);
    var d = Number(mm[3]);
    var ms = Date.UTC(y, mo - 1, d, 12);
    var dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return null;
    return ms;
  }

  /* b − a の 日数（形が 違えば null） */
  function hiNoSa(a, b) {
    var x = hiNoMs(a);
    var y = hiNoMs(b);
    if (x == null || y == null) return null;
    return Math.round((y - x) / 86400000);
  }

  function hiTasu(s, n) {
    var ms = hiNoMs(s);
    if (ms == null) return null;
    var dt = new Date(ms + n * 86400000);
    var p = function (v) {
      return String(v).padStart(2, "0");
    };
    return dt.getUTCFullYear() + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate());
  }

  function meterKa(r) {
    return !!(r && (r.dk_source || r.dk_ref));
  }

  function gaku(v) {
    if (v === "" || v == null) return null;
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* payload＝これから 入れる 行（meisaiToDb の 形）／meter＝読み直した 行（meisaiFromDb の 形・メーター 以外は 捨てる）
     返す { atari: { 行の番号: [ {id,日付,金額,行き先} ] }, nashi: [突き合わせなかった 行の番号] } */
  function sagasu(payload, meter) {
    var atari = {};
    var nashi = [];
    var ms = (meter || []).filter(meterKa);
    (payload || []).forEach(function (pl, i) {
      var kin = pl ? gaku(pl.amount) : null;
      if (!pl || hiNoMs(pl.date) == null || kin == null) {
        nashi.push(i);
        return;
      }
      var hit = [];
      ms.forEach(function (r) {
        if (r.会社名 !== pl.company) return;
        if (gaku(r.金額) !== kin) return;
        var sa = hiNoSa(r.日付, pl.date);
        if (sa !== 0 && sa !== 1) return;
        hit.push({ id: r.id, 日付: r.日付, 金額: gaku(r.金額), 行き先: r.行き先 || "" });
      });
      if (hit.length) atari[i] = hit;
    });
    return { atari: atari, nashi: nashi };
  }

  /* 倉庫から 読み直す 範囲（最小の 前の 日 〜 最大）。日付が 無ければ null */
  function yomuHanni(payload) {
    var hi = (payload || [])
      .map(function (pl) {
        return pl && hiNoMs(pl.date) != null ? pl.date : null;
      })
      .filter(Boolean)
      .sort();
    if (!hi.length) return null;
    return { gte: hiTasu(hi[0], -1), lte: hi[hi.length - 1] };
  }

  /* 「別の 乗車」の 印＝決めた 時の 値 */
  function betsuKagi(pl, hit) {
    var ids = (hit || [])
      .map(function (h) {
        return String(h.id);
      })
      .sort();
    return String(pl && pl.date) + "|" + String(pl && pl.amount) + "|" + ids.join(",");
  }

  /* 止める 行の 番号（無ければ -1）。betsu[i]＝その 行で 押した 印 */
  function tomeru(atari, payload, betsu) {
    for (var i = 0; i < (payload || []).length; i++) {
      if (!atari || !atari[i]) continue;
      if ((betsu || [])[i] !== betsuKagi(payload[i], atari[i])) return i;
    }
    return -1;
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

  /* 手の 行に 残した「別の 乗車」の 印（保存の 時・{ids,date,amount}）が 今の 値と 同じ 時だけ 効く */
  function betsuNoIds(r) {
    var b = r && r.nijuu_betsu;
    if (!b || typeof b !== "object" || !Array.isArray(b.ids)) return {};
    if (String(b.date) !== String(r.日付)) return {};
    if (gaku(b.amount) !== gaku(r.金額)) return {};
    var o = {};
    b.ids.forEach(function (id) {
      o[String(id)] = true;
    });
    return o;
  }

  /* rows＝倉庫と 揃えた DB（meisaiFromDb の 形）・month＝"YYYY-MM"・cos＝紙に 載せる 会社。
     返す { kasanari: { 会社: [ {te:{id,日付,金額,行き先}, meter:[...]} ] }, mitei: [ {id,会社名,日付,行き先} ] }
       kasanari＝手の 行 × メーターの 行・同じ 会社・同じ 額(>0)・メーターの日 ≦ 手の日 ≦ メーターの日＋1・
                 どちらかが その 月（月を またぐ 組も 出す）・「別の 乗車」の 印が 今も 効く 組は 除く
       mitei＝その 月の メーターの 行で 額が 空（料金が まだ 決まっていない）＝★0円は 入れない★（対立役 v2 注7） */
  function hakkoMae(rows, month, cos) {
    var co = {};
    (cos || []).forEach(function (c) {
      co[c] = true;
    });
    var meter = [];
    var te = [];
    var mitei = [];
    (rows || []).forEach(function (r) {
      if (!r || !co[r.会社名]) return;
      if (meterKa(r)) {
        // 料金未定＝額が 空、または 額が 0 で メーターの 料金（dk_meter_yen）も 無い
        //   （前の 版で 一覧の 直しが 空を 0 に して 書いた 行・対立役 止1。本当の 0円は dk_meter_yen が 0）
        if (
          tsukiKa(r.日付, month) &&
          (r.金額 === "" ||
            r.金額 == null ||
            (gaku(r.金額) == null && (r.dk_meter_yen === "" || r.dk_meter_yen == null)))
        )
          mitei.push({ id: r.id, 会社名: r.会社名, 日付: r.日付, 行き先: r.行き先 || "" });
        if (gaku(r.金額) != null && hiNoMs(r.日付) != null) meter.push(r);
      } else if (gaku(r.金額) != null && hiNoMs(r.日付) != null) te.push(r);
    });
    var kasanari = {};
    te.forEach(function (t) {
      var betsu = betsuNoIds(t);
      var hit = meter.filter(function (r) {
        if (r.会社名 !== t.会社名 || gaku(r.金額) !== gaku(t.金額)) return false;
        var sa = hiNoSa(r.日付, t.日付);
        if (sa !== 0 && sa !== 1) return false;
        if (!tsukiKa(t.日付, month) && !tsukiKa(r.日付, month)) return false;
        return !betsu[String(r.id)];
      });
      if (!hit.length) return;
      (kasanari[t.会社名] = kasanari[t.会社名] || []).push({
        te: { id: t.id, 日付: t.日付, 金額: gaku(t.金額), 行き先: t.行き先 || "" },
        meter: hit.map(function (r) {
          return { id: r.id, 日付: r.日付, 金額: gaku(r.金額), 行き先: r.行き先 || "" };
        }),
      });
    });
    return { kasanari: kasanari, mitei: mitei };
  }

  /* 「別の 乗車（このまま 出す）」の 印＝月|会社|組（手の id>メーターの id）。組が 変われば 効かない */
  function kasanariKagi(month, co, kumi) {
    var s = [];
    (kumi || []).forEach(function (k) {
      k.meter.forEach(function (m) {
        s.push(String(k.te.id) + ">" + String(m.id));
      });
    });
    return month + "|" + co + "|" + s.sort().join(",");
  }

  var api = {
    shirushi: shirushi,
    zureKazoeru: zureKazoeru,
    hakkoMae: hakkoMae,
    kasanariKagi: kasanariKagi,
    hiNoSa: hiNoSa,
    hiTasu: hiTasu,
    meterKa: meterKa,
    sagasu: sagasu,
    yomuHanni: yomuHanni,
    betsuKagi: betsuKagi,
    tomeru: tomeru,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Nijuu = api;
})(typeof window !== "undefined" ? window : this);
