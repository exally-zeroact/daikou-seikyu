/* ==========================================================================
   lib/yomu-kuchi.js — 外から読むだけの口（①）の 表を 作る 2026-11-03
   司さん 11-02「外へ数を出す口＝読むだけ」（会計ソフト・客の AI が 明細・請求・入金・会社を 読む）
   入り＝倉庫の public.yomu_moto(token) の 答え（本人の 生の 行）。出＝4つの 表（見出し＋行）。
   ★額は 画面と 同じ 関数で 出す★（SQL に 式を 書かない＝画面と 口が 1円も 食い違わない）
     請求＝MeisaiEngine.listInvoices＋invoiceTotals（画面の seikyuList と 同じ）
     入金＝NyukinKai.payRecFromDb＋entriesOf（画面の 入金の 回と 同じ）
   DOM と 倉庫を 触らない 純粋な 関数だけ（vitest＝tests/yomu-kuchi.test.js）。
   公開：window.YomuKuchi（Node では module.exports）
   ========================================================================== */
(function (root) {
  "use strict";
  var ME =
    typeof module !== "undefined" && module.exports
      ? require("../meisai-engine.js")
      : root.MeisaiEngine;
  var NK =
    typeof module !== "undefined" && module.exports ? require("./nyukin-kai.js") : root.NyukinKai;

  var HYO = ["meisai", "seikyu", "nyukin", "kaisha"];
  var TSUKI_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  var HI_KA_TSUKI_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

  var SETSUMEI = {
    meisai:
      "明細（消した行は出ない）。月で絞る時は日付の月で絞り、日付の無い行は絞らない時だけ出る。",
    seikyu:
      "月×会社の請求。今月分（税込）は今の明細から画面と同じ式で出す（発行した紙の控えではない）。" +
      "繰越を使う会社の紙の上の額は「繰越＋今月分」で、ここの今月分とは違う。請求番号が空＝まだ発行していない。",
    nyukin:
      "記録した入金を1回1行で（繰越の会社で画面が月へ当てた額ではなく、記録した額）。" +
      "入金額＝消した額（うち振込＋うち振込手数料）。月で絞る時は記録した月で絞る。",
    kaisha: "会社。税の扱い（内税/外税）と繰越を使うか。",
  };

  // 会社：画面と 同じ「後から 作った 方が 勝つ」（倉庫は created_at,id の 順で 返す）
  function kaishaMap(moto) {
    var m = {};
    ((moto && moto.kaisha) || []).forEach(function (c) {
      if (c && c.name != null) m[c.name] = c;
    });
    return m;
  }
  function meisaiGyou(r) {
    // 画面の meisaiFromDb と 同じ 名前（extra は 出さない）
    return {
      account_id: "u",
      会社名: r.company,
      日付: r.date || "",
      行き先: r.destination || "",
      金額: r.amount == null ? "" : r.amount,
      備考: r.note || "",
      距離: r.distance == null ? "" : r.distance,
      人数: r.people == null ? "" : r.people,
      名前: r.name || "",
    };
  }
  function tsukiNaka(t, kara, made) {
    if (!kara && !made) return true;
    if (!t) return false;
    if (kara && t < kara) return false;
    if (made && t > made) return false;
    return true;
  }

  // ★明細の 日付を 範囲で 見る★ 2026-11-13 ⑥（kara/made は YYYY-MM か YYYY-MM-DD。それぞれの 長さで 頭を 比べる）
  //   1社 1か月が 大きすぎる 時に 日で 絞れる 様に（月より 細かく 絞る 手が 無いと 行き止まり）
  function hiNaka(d, kara, made) {
    if (!kara && !made) return true;
    if (!d) return false;
    var s = String(d);
    if (kara && s.slice(0, kara.length) < kara) return false;
    if (made && s.slice(0, made.length) > made) return false;
    return true;
  }

  function hyoMeisai(moto, kara, made) {
    var mi = ["日付", "会社名", "行き先", "金額", "備考", "距離", "人数", "名前"];
    var gyo = [];
    ((moto && moto.meisai) || []).forEach(function (r) {
      var g = meisaiGyou(r);
      if (!hiNaka(g.日付, kara, made)) return;
      gyo.push(
        mi.map(function (k) {
          return g[k];
        })
      );
    });
    return { midashi: mi, gyo: gyo };
  }

  function hyoSeikyu(moto, kara, made) {
    var mi = [
      "月",
      "会社名",
      "件数",
      "小計",
      "消費税",
      "今月分（税込）",
      "税の扱い",
      "繰越を使う",
      "請求番号",
    ];
    var KA = kaishaMap(moto);
    var rows = ((moto && moto.meisai) || []).map(meisaiGyou);
    var rowsBy = {};
    rows.forEach(function (r) {
      if (!r.日付) return;
      var k = String(r.日付).slice(0, 7) + " " + r.会社名;
      (rowsBy[k] = rowsBy[k] || []).push(r);
    });
    var bango = {};
    ((moto && moto.bango) || []).forEach(function (b) {
      bango[b.month + " " + b.company] = b.invoice_no;
    });
    var gyo = [];
    // 画面の seikyuList と 同じ：listInvoices（日付の 無い 行は 外す）→ invoiceTotals(その 月の 行, {taxMode})
    ME.listInvoices(rows, null, null)
      .slice()
      .sort(function (a, b) {
        return a.month.localeCompare(b.month) || a.company.localeCompare(b.company);
      })
      .forEach(function (iv) {
        if (!tsukiNaka(iv.month, kara, made)) return;
        var c = KA[iv.company] || {};
        var t = ME.invoiceTotals(rowsBy[iv.month + " " + iv.company] || [], {
          taxMode: c.taxMode,
        });
        gyo.push([
          iv.month,
          iv.company,
          iv.count,
          t.shoukei,
          t.zei,
          t.goukei,
          t.soto ? "外税" : "内税",
          c.carryover ? "はい" : "いいえ",
          bango[iv.month + " " + iv.company] || "",
        ]);
      });
    return { midashi: mi, gyo: gyo };
  }

  function hyoNyukin(moto, kara, made) {
    var mi = [
      "記録した月",
      "会社名",
      "入金日",
      "入金額",
      "うち振込",
      "うち振込手数料",
      "メモ",
      "記録ID",
    ];
    var gyo = [];
    ((moto && moto.nyukin) || []).forEach(function (r) {
      if (!tsukiNaka(r.month, kara, made)) return;
      var rec = NK.payRecFromDb(r);
      NK.entriesOf(rec, r.month).forEach(function (e, i) {
        var tes = e.tesuryo || 0;
        gyo.push([
          r.month,
          r.company,
          e.hi || "",
          e.gaku,
          e.gaku - tes,
          tes,
          r.memo || "",
          r.id + "#" + (i + 1),
        ]);
      });
    });
    return { midashi: mi, gyo: gyo };
  }

  function hyoKaisha(moto) {
    var mi = ["会社名", "税の扱い", "繰越を使う"];
    var KA = kaishaMap(moto);
    var gyo = Object.keys(KA)
      .sort()
      .map(function (n) {
        var c = KA[n];
        return [n, c.taxMode === "外税" ? "外税" : "内税", c.carryover ? "はい" : "いいえ"];
      });
    return { midashi: mi, gyo: gyo };
  }

  // 在る 会社名（会社の 表・明細・入金の どれかに 在る 名前）＝絞りの 名前を 確かめる 為
  function aruNamae(moto) {
    var s = {};
    ["kaisha", "meisai", "nyukin"].forEach(function (k) {
      ((moto && moto[k]) || []).forEach(function (r) {
        var n = r && (k === "kaisha" ? r.name : r.company);
        if (n != null && n !== "") s[n] = 1;
      });
    });
    return Object.keys(s).sort();
  }

  // 入口：hyo と 月の 範囲（明細は 日も）・会社名を 確かめて 表を 返す。違えば { error, status }
  //   ★kaisha（任意・完全一致）★ 2026-11-13 ⑥：どこにも 無い 名前は 400＋在る 名前を 並べる
  //   （黙って 0行を 返すと「その会社は 0件・0円」と 読まれる＝設計前 taiketsu S1）
  function tsukuru(moto, hyo, kara, made, kaisha) {
    if (HYO.indexOf(hyo) < 0) return { status: 400, error: "知らない表の名前です（" + hyo + "）" };
    var RE = hyo === "meisai" ? HI_KA_TSUKI_RE : TSUKI_RE;
    var KATA = hyo === "meisai" ? "YYYY-MM か YYYY-MM-DD" : "YYYY-MM（日は 明細だけ）";
    if (kara && !RE.test(kara)) return { status: 400, error: "kara は " + KATA + " で" };
    if (made && !RE.test(made)) return { status: 400, error: "made は " + KATA + " で" };
    if (kaisha != null && typeof kaisha !== "string")
      return { status: 400, error: "kaisha は 会社名を 1つ" };
    if (!moto || typeof moto !== "object")
      return { status: 502, error: "倉庫の答えの形が違います" };
    if (kaisha) {
      var aru = aruNamae(moto);
      if (aru.indexOf(kaisha) < 0)
        return {
          status: 400,
          error:
            "その会社名はありません（" +
            kaisha +
            "）。在る会社名（完全一致で）：" +
            (aru.length ? aru.join("／") : "（会社がありません）"),
        };
    }
    var t =
      hyo === "meisai"
        ? hyoMeisai(moto, kara, made)
        : hyo === "seikyu"
          ? hyoSeikyu(moto, kara, made)
          : hyo === "nyukin"
            ? hyoNyukin(moto, kara, made)
            : hyoKaisha(moto);
    var gyo = t.gyo;
    if (kaisha) {
      var ci = t.midashi.indexOf("会社名");
      gyo = gyo.filter(function (g) {
        return g[ci] === kaisha;
      });
    }
    return { hyo: hyo, setsumei: SETSUMEI[hyo], midashi: t.midashi, gyo: gyo };
  }

  // CSV：UTF-8 BOM・CRLF・全部の 欄を "" で 囲む・式に なる 頭（= + - @ タブ CR）は ' を 前に（Excel で 式として 動かさない）
  function csvKaku(midashi, gyo) {
    function ran(v) {
      var s = v == null ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }
    var out = [midashi.map(ran).join(",")];
    gyo.forEach(function (g) {
      out.push(g.map(ran).join(","));
    });
    return "﻿" + out.join("\r\n") + "\r\n";
  }

  var YomuKuchi = { HYO: HYO, tsukuru: tsukuru, csvKaku: csvKaku };
  root.YomuKuchi = YomuKuchi;
  if (typeof module !== "undefined" && module.exports) module.exports = YomuKuchi;
})(typeof window !== "undefined" ? window : this);
