/* ==========================================================================
   lib/naoshi-rireki.js — 明細・入金の「直しの履歴」を 画面に 出す 部品（⑦ 3押し目・2026-11-09）
   ★表示だけ★（元の 設計 v3 注9）＝履歴を 読んで お金・並び・出す 前の 見張りを 決めない。
   出どころ：倉庫の 仕掛け daikome.dk_naoshi_kiroku() が 積む daikome.dk_naoshi_rireki
     tbl＝'daikou.meisai' / 'daikou.payments'（部屋の 名 付き＝11-09 テスト線で 測った）
     pk＝{id}・op＝I/U/D・dare_shu＝jimusho/device/kansu/chokusetsu/fumei/ai
     I の ato は 鍵と お金の 列だけ／U の mae・ato は 変わった 列だけ／D の mae は 行 まるごと
   ★運転手が 直した 行の 赤★（司さん 2026-10-21「運転手が 直したやつは 明細に 赤」「事務所が 後で 直したら 消す」）
     判じに 使うのは device と jimusho の U/D だけ（設計前 taiketsu 止め2）。
     jimusho の U で kawatta が company だけ（会社名の 変え）は 使わない（止め1）。I は 赤に しない（注6）。
   公開：window.NaoshiRireki（Node では module.exports）。DOM と 倉庫は 触らない
   ========================================================================== */
(function (root) {
  "use strict";

  var TBL_MEISAI = "daikou.meisai";
  var TBL_PAY = "daikou.payments";

  function pkId(r) {
    return r && r.pk && r.pk.id != null ? String(r.pk.id) : null;
  }

  function idJun(a, b) {
    return Number(a.id) - Number(b.id);
  }

  /* 明細の 行 id → 履歴（id 順） */
  function meisaiBetsu(rows) {
    var out = {};
    (rows || [])
      .filter(function (r) {
        return r && r.tbl === TBL_MEISAI && pkId(r);
      })
      .sort(idJun)
      .forEach(function (r) {
        var k = pkId(r);
        (out[k] = out[k] || []).push(r);
      });
    return out;
  }

  /* 赤の 判じと「直し n」に 使う 1本か
     ・device と jimusho だけ（kansu・chokusetsu・fumei・ai は 飛ばす＝止め2）
     ・U で kawatta が company だけ（会社名の 変え 12779／端末の 送り直しで 古い 名に 戻る meisai-row.js:188）は
       誰の 物でも 飛ばす（中身の 直しで ない＝止め1・叩き直し 注1） */
  function hanjiNiTsukau(r) {
    if (!r || (r.op !== "U" && r.op !== "D")) return false;
    if (r.dare_shu !== "device" && r.dare_shu !== "jimusho") return false;
    if (r.op === "D") return true;
    var k = Array.isArray(r.kawatta) ? r.kawatta : [];
    return k.some(function (c) {
      return c !== "company";
    });
  }

  /* その 行の 履歴（id 順）→ 運転手が 最後に 直した 行なら true */
  function akaKa(list) {
    var saigo = null;
    (list || []).forEach(function (r) {
      if (hanjiNiTsukau(r)) saigo = r;
    });
    return !!(saigo && saigo.dare_shu === "device");
  }

  /* 「直し n」の n＝赤の 判じと 同じ 物だけ（I・会社名だけ・自動の 埋め戻しは 数えない・注5／叩き直し 注3） */
  function naoshiKazu(list) {
    return (list || []).filter(hanjiNiTsukau).length;
  }

  function tanmatsuId(dare) {
    var s = String(dare || "");
    if (s.indexOf("device:") !== 0) return "";
    s = s.slice(7);
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  }

  /* 誰の 字。na＝{device_id: label} */
  function dareMoji(r, na) {
    var shu = r && r.dare_shu;
    if (shu === "jimusho") return "事務所";
    if (shu === "device") {
      var id = tanmatsuId(r.dare);
      var lb = na && id && typeof na[id] === "string" && na[id].trim() ? na[id].trim() : "";
      return "運転手の端末（" + (lb || "名前なし") + "）";
    }
    if (shu === "kansu") return "自動";
    if (shu === "chokusetsu") return "直接";
    if (shu === "ai") return "AI";
    return "不明";
  }

  var RETSU = {
    company: "会社名",
    date: "日付",
    destination: "行き先",
    amount: "金額",
    note: "備考",
    distance: "距離",
    people: "人数",
    name: "名前",
    extra: "その他（車・メーター）",
    deleted_at: "消した／戻した",
    month: "月",
    paid: "入金額",
    paid_date: "入金日",
    memo: "メモ",
    entries: "入金の回",
  };
  function retsuMoji(c) {
    return RETSU[c] || String(c);
  }

  function atai(v) {
    if (v === undefined || v === null || v === "") return "（空）";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  /* 1本を 画面の 字の 塊に（何・前→後） */
  function naiyou(r) {
    if (!r) return [];
    if (r.op === "I") return [{ nani: "足した", mae: "", ato: "" }];
    if (r.op === "D") return [{ nani: "消した", mae: "", ato: "" }];
    var k = Array.isArray(r.kawatta) ? r.kawatta : [];
    return k.map(function (c) {
      var mae = r.mae ? r.mae[c] : undefined;
      var ato = r.ato ? r.ato[c] : undefined;
      // 中身が 塊（JSON）の 列は 前→後を 出さない（読めない 字を 並べない）
      if (c === "extra" || c === "entries") return { nani: retsuMoji(c), mae: "", ato: "" };
      if (c === "deleted_at") return { nani: ato ? "消した" : "戻した", mae: "", ato: "" };
      return { nani: retsuMoji(c), mae: atai(mae), ato: atai(ato) };
    });
  }

  /* 入金：(month, company) → 履歴（id 順）。
     id → 月・会社は 今の 入金の 行（ima＝[{id,month,company}]）と D の mae（行 まるごと）から だけ 引く（注1）。
     引けない 物は 出さない。 */
  function nyukinBetsu(rows, ima) {
    var basho = {};
    (ima || []).forEach(function (p) {
      if (p && p.id != null && p.month && p.company)
        basho[String(p.id)] = p.month + "::" + p.company;
    });
    var pay = (rows || [])
      .filter(function (r) {
        return r && r.tbl === TBL_PAY && pkId(r);
      })
      .sort(idJun);
    pay.forEach(function (r) {
      if (r.op === "D" && r.mae && r.mae.month && r.mae.company && !basho[pkId(r)])
        basho[pkId(r)] = r.mae.month + "::" + r.mae.company;
    });
    var out = {};
    pay.forEach(function (r) {
      var k = basho[pkId(r)];
      if (!k) return;
      (out[k] = out[k] || []).push(r);
    });
    return out;
  }

  /* 黙ってよい 読めない（表・部屋が 無い）か（注9） */
  function hyouGaNai(err) {
    if (!err) return false;
    var c = String(err.code || "");
    return c === "PGRST205" || c === "PGRST106" || c === "42P01" || err.status === 404;
  }

  var api = {
    TBL_MEISAI: TBL_MEISAI,
    TBL_PAY: TBL_PAY,
    meisaiBetsu: meisaiBetsu,
    akaKa: akaKa,
    naoshiKazu: naoshiKazu,
    dareMoji: dareMoji,
    retsuMoji: retsuMoji,
    naiyou: naiyou,
    nyukinBetsu: nyukinBetsu,
    hyouGaNai: hyouGaNai,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NaoshiRireki = api;
})(typeof window !== "undefined" ? window : this);
