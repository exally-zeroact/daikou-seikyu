/* ==========================================================================
   lib/keshikomi.js — 入金の消し込み（銀行の入出金明細 CSV → 候補）2026-11-03
   司さんの決め（11-03）：CSV を取り込む → 金額（＋会社ごとの振込手数料の差）と振込名義のカナで候補
     → ★人が押した時だけ★入金を記録（自動では記録しない）・銀行 API はつながない
   ここは DOM と倉庫を触らない純粋な関数だけ（vitest で試す）。記録は daikou-seikyu.html 側。
   公開：window.Keshikomi（Node では module.exports）
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---------- 文字コード：UTF-8 で読めなければ Shift_JIS（日本の銀行の CSV の多くは Shift_JIS） ---------- */
  function mojiYomu(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(u8), code: "UTF-8" };
    } catch {
      return { text: new TextDecoder("shift_jis").decode(u8), code: "Shift_JIS" };
    }
  }

  /* ---------- CSV：引用符・引用符の中のカンマ/改行・"" を読む。BOM を落とす ---------- */
  function csvYomu(text) {
    var s = String(text || "");
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    var rows = [];
    var row = [];
    var f = "";
    var q = false;
    // ★行番号は ファイルの 物理の 行（空行・引用符の 中の 改行も 数える）★（対立役 任1）
    var gyou = 1;
    var hajime = 1;
    var tojiru = function () {
      row.push(f);
      row.gyou = hajime;
      rows.push(row);
      row = [];
      f = "";
    };
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            f += '"';
            i++;
          } else q = false;
        } else {
          if (c === "\n" || (c === "\r" && s[i + 1] !== "\n")) gyou++;
          f += c;
        }
        continue;
      }
      if (c === '"') q = true;
      else if (c === ",") {
        row.push(f);
        f = "";
      } else if (c === "\r" || c === "\n") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        tojiru();
        gyou++;
        hajime = gyou;
      } else f += c;
    }
    if (f !== "" || row.length) tojiru();
    // 中身の無い行（全部の欄が空）は数えない
    return rows.filter(function (r) {
      return r.some(function (x) {
        return String(x).trim() !== "";
      });
    });
  }

  /* ---------- 日付：西暦（/ - 年月日 8桁）と令和（R8.11.3・令和8年11月3日）。読めない＝"" ---------- */
  function z2(n) {
    return ("0" + n).slice(-2);
  }
  function hizukeYomu(s) {
    var t = String(s || "")
      .normalize("NFKC")
      .trim();
    var m, y, mo, d;
    if ((m = /^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?/.exec(t))) {
      y = +m[1];
      mo = +m[2];
      d = +m[3];
    } else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) {
      y = +m[1];
      mo = +m[2];
      d = +m[3];
    } else if ((m = /^(?:R|令和)\s*(\d{1,2}|元)[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?/i.exec(t))) {
      y = 2018 + (m[1] === "元" ? 1 : +m[1]);
      mo = +m[2];
      d = +m[3];
    } else return "";
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
      return "";
    return y + "-" + z2(mo) + "-" + z2(d);
  }

  /* ---------- 額：「1,234」「¥1,234」「1234円」。空＝null（0 と作り分ける）・数でない＝NaN ---------- */
  function gakuYomu(s) {
    var t = String(s == null ? "" : s)
      .normalize("NFKC")
      .replace(/[,\s¥\\円]/g, "")
      .trim();
    if (t === "" || t === "-") return null;
    if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return NaN;
    return Number(t);
  }

  /* ---------- 振込名義のカナ：半角→全角・空白と記号を外す・法人の印を外す・小さい字を大きく ---------- */
  var HOUJIN = [
    "カブシキガイシヤ",
    "ユウゲンガイシヤ",
    "ゴウドウガイシヤ",
    "イツパンシヤダンホウジン",
    "イツパンザイダンホウジン",
    "シヤカイフクシホウジン",
    "イリヨウホウジン",
    "トクテイヒエイリカツドウホウジン",
  ];
  // 銀行の名義の略号（カ)＝株式会社 等）。前「カ)」・後「(カ」の両方
  var RYAKU = ["カ", "ユ", "ド", "シヤ", "ザイ", "イ", "フク", "トクヒ", "ガ", "ゴ"];
  var CHIISAI = {
    ァ: "ア",
    ィ: "イ",
    ゥ: "ウ",
    ェ: "エ",
    ォ: "オ",
    ャ: "ヤ",
    ュ: "ユ",
    ョ: "ヨ",
    ッ: "ツ",
    ヮ: "ワ",
  };
  function kanaSeiki(s) {
    var t = String(s || "").normalize("NFKC");
    // ひらがな→カタカナ
    t = t.replace(/[ぁ-ゖ]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) + 0x60);
    });
    t = t.replace(/[ァィゥェォャュョッヮ]/g, function (c) {
      return CHIISAI[c];
    });
    t = t.replace(/[（]/g, "(").replace(/[）]/g, ")");
    t = t.replace(/[\s\u3000]/g, "");
    // 頭の「振込」（銀行が摘要に付ける）
    t = t.replace(/^(フリコミ|振込)[:：]?/, "");
    // 略号：「カ)」「(カ」「(カ)」を どこに在っても外す（長い略号から＝シヤ) を ヤ) と読まない）
    RYAKU.slice()
      .sort(function (a, b) {
        return b.length - a.length;
      })
      .forEach(function (r) {
        t = t
          .split("(" + r + ")")
          .join("")
          .split(r + ")")
          .join("")
          .split("(" + r)
          .join("");
      });
    // ★長音「ー」は 消さない★（コーヒー と コヒ を 重ねない・対立役 注4）
    t = t.replace(/[・.,\-()「」"'／/:：]/g, "");
    HOUJIN.forEach(function (h) {
      t = t.split(h).join("");
    });
    return t;
  }

  /* ---------- 見出しから列を推す（推しは画面で人が直せる） ---------- */
  // ★各銀行の実物の見出しは 手元に無い＝推し★。外れたら 画面で 人が 見出しの行と 列を 選ぶ（対立役 注5）
  var MIDASHI = {
    hi: /^(日付|取引日|年月日|お取引日|入出金日|お取扱日|取扱日|お取り扱い日|日時|取引日付|記帳日|勘定日)$/,
    nyukin:
      /^(入金|入金額|入金金額|お預り金額|お預り金|お預かり金額|預かり金額|預り金額|預入|預入金額|お預入れ|お預け入れ|お預入れ金額|入金額\(円\)|お預り額)$/,
    shukkin:
      /^(出金|出金額|出金金額|お引出金額|お引出し|お引き出し|お支払金額|支払い金額|支払金額|引出金額|出金額\(円\))$/,
    kingaku: /^(金額|取引金額|入出金額)$/,
    kubun: /^(入払区分|入出金区分|区分|入出区分|取引区分)$/,
  };
  // 名義の列は 強い順（「摘要」は 三菱UFJ風で「振込１」の 列＝名前は「摘要内容」側）
  var MEIGI = [
    /^(振込依頼人|振込依頼人名|依頼人名|お取引先|取引先|振込人名)$/,
    /^(摘要内容|お取り扱い内容|お取扱内容|お取引内容|取引内容|内容)$/,
    /^(摘要|備考|メモ)$/,
  ];
  function retsuSuitei(header) {
    var out = { hi: -1, nyukin: -1, shukkin: -1, kingaku: -1, kubun: -1, meigi: -1 };
    var ts = (header || []).map(function (h) {
      return String(h || "")
        .normalize("NFKC")
        .replace(/\s/g, "");
    });
    ts.forEach(function (t, i) {
      Object.keys(MIDASHI).forEach(function (k) {
        if (out[k] < 0 && MIDASHI[k].test(t)) out[k] = i;
      });
    });
    for (var j = 0; j < MEIGI.length && out.meigi < 0; j++) {
      for (var i = 0; i < ts.length; i++)
        if (MEIGI[j].test(ts[i])) {
          out.meigi = i;
          break;
        }
    }
    return out;
  }
  // 見出しの行を探す（銀行によって先頭に口座の情報が数行ある）＝日付の列と入金/金額の列が推せた最初の行
  function midashiSagasu(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var r = retsuSuitei(rows[i]);
      if (r.hi >= 0 && (r.nyukin >= 0 || r.kingaku >= 0)) return { gyou: i, retsu: r };
    }
    return { gyou: -1, retsu: retsuSuitei([]) };
  }

  /* ---------- 入金の行を取り出す。★落とした行は 訳ごとに 数えて返す（黙って捨てない）★ ---------- */
  //   retsu＝{hi, nyukin, kingaku, kubun, kubunNyukin, meigi}
  //     nyukin が在ればそれ・無ければ kingaku の正の数
  //     kubun（入払区分の列）が在る時は、その欄が kubunNyukin（既定「入金|入|預入|お預入れ」）の行だけ入金（対立役 注5：出金が入金に化けた）
  function nyukinNukidasu(rows, kaishi, retsu) {
    var out = [];
    var otosu = { hizuke: [], gaku: [], shukkin: 0, retsu: [] };
    // kubunNyukin＝人が選んだ「入金」の字の配列（字そのまま比べる・正規表現にしない）
    var kubunRe = {
      test: function (v) {
        return (
          (retsu.kubunNyukin || ["入金", "入", "預入", "お預入れ", "お預け入れ"]).indexOf(v) >= 0
        );
      },
    };
    for (var i = kaishi; i < rows.length; i++) {
      var r = rows[i];
      var gyou = r.gyou || i + 1; // ファイルの何行目（人に見せる）
      var col = retsu.nyukin >= 0 ? retsu.nyukin : retsu.kingaku;
      if (col < 0 || retsu.hi < 0) return { nyukin: [], otosu: otosu, err: "列が選ばれていません" };
      if (r.length <= Math.max(col, retsu.hi, retsu.kubun >= 0 ? retsu.kubun : 0)) {
        otosu.retsu.push(gyou);
        continue;
      }
      if (
        retsu.kubun >= 0 &&
        !kubunRe.test(
          String(r[retsu.kubun] || "")
            .normalize("NFKC")
            .trim()
        )
      ) {
        otosu.shukkin++;
        continue;
      }
      var g = gakuYomu(r[col]);
      if (g === null) {
        otosu.shukkin++; // 入金の欄が空＝出金の行
        continue;
      }
      if (!isFinite(g) || Math.round(g) !== g) {
        otosu.gaku.push(gyou);
        continue;
      }
      if (g <= 0) {
        otosu.shukkin++;
        continue;
      }
      var hi = hizukeYomu(r[retsu.hi]);
      if (!hi) {
        otosu.hizuke.push(gyou);
        continue;
      }
      out.push({
        gyou: gyou,
        hi: hi,
        gaku: g,
        meigi: retsu.meigi >= 0 ? String(r[retsu.meigi] || "").trim() : "",
      });
    }
    return { nyukin: out, otosu: otosu, err: "" };
  }

  /* ---------- 候補 ----------
       司さんの決め（11-03）：
         ・額（＋振込手数料の差）と振込名義のカナで候補。★人が押した時だけ記録★
         ・手数料は決め打ちしない＝入金が残より 1〜SA_MAX 円少ない時だけ「差 ¥実額（振込手数料かも）」
         ・会社ごとに 先方持ち（既定）／こちら持ち（kochira）
             先方持ち＝入った額だけ記録（差は未入金で残る）／こちら持ち＝差を手数料として消して閉じる
         ・まとめ/一部入金は同じ会社の未入金の月を古い順に
       kaisha＝[{ name, meigi:[カナ…], kochira:bool, carryover:bool,
                  mitsuki:[{ month, zan }]（未入金の月・古い順・zan＞0） }]
         繰越の会社の zan＝その月の請求書の未入金（前の月の分込み）＝zenNyukinGaku − 記録（対立役 v2 注3）
       戻り＝[{ co, kind, ate:[{month, gaku, tesuryo}], sa, meigiAtari, oosugi }]（最大3・並びは強い順） */
  var SA_MAX = 1100;
  var MEIGI_MIN = 4; // 覚える名義の短さの下限（短い名義は別の会社に当たる・対立役 注4）
  function meigiAtaru(kaisha, nyukinMeigi) {
    var n = kanaSeiki(nyukinMeigi);
    if (!n) return false;
    return (kaisha.meigi || []).some(function (m) {
      var k = kanaSeiki(m);
      return k.length >= MEIGI_MIN && n.indexOf(k) >= 0;
    });
  }
  function ateTsukuru(kai, gaku, sa, kochira, kind) {
    // 最後の月に 差を 寄せる（こちら持ち＝差も 消す・先方持ち＝入った 額だけ）
    var ate = kai.map(function (a) {
      return { month: a.month, gaku: a.gaku, tesuryo: 0 };
    });
    if (sa > 0 && kochira) {
      ate[ate.length - 1].gaku += sa;
      ate[ate.length - 1].tesuryo = sa;
    }
    return { kind: kind, ate: ate, sa: sa };
  }
  function kaishaKoho(c, gaku) {
    var mi = (c.mitsuki || []).filter(function (m) {
      return m.zan > 0;
    });
    if (!mi.length) return [];
    var out = [];
    var kochira = !!c.kochira;
    if (c.carryover) {
      // 繰越の会社＝月ごとに 割らない（当たった 請求書の 月の 行に 全額・対立役 v1 止1）
      mi.forEach(function (m) {
        var sa = m.zan - gaku;
        if (sa === 0)
          out.push(ateTsukuru([{ month: m.month, gaku: gaku }], gaku, 0, kochira, "pittari"));
        else if (sa >= 1 && sa <= SA_MAX)
          out.push(ateTsukuru([{ month: m.month, gaku: gaku }], gaku, sa, kochira, "sa"));
      });
      if (!out.length) {
        var saigo = mi[mi.length - 1].zan;
        if (gaku < saigo)
          out.push(ateTsukuru([{ month: mi[0].month, gaku: gaku }], gaku, 0, kochira, "ichibu"));
        else out.push({ kind: "oosugi", ate: [], sa: 0, oosugi: gaku - saigo });
      }
      return out;
    }
    // 繰越を 使わない 会社
    mi.forEach(function (m) {
      var sa = m.zan - gaku;
      if (sa === 0)
        out.push(ateTsukuru([{ month: m.month, gaku: gaku }], gaku, 0, kochira, "pittari"));
      else if (sa >= 1 && sa <= SA_MAX)
        out.push(ateTsukuru([{ month: m.month, gaku: gaku }], gaku, sa, kochira, "sa"));
    });
    // まとめ（古い 月から 2か月 以上）
    var wa = 0;
    var kai = [];
    var matome = null;
    for (var i = 0; i < mi.length; i++) {
      wa += mi[i].zan;
      kai.push({ month: mi[i].month, gaku: mi[i].zan });
      if (i === 0) continue;
      var sa2 = wa - gaku;
      if (sa2 === 0) {
        matome = ateTsukuru(kai.slice(), gaku, 0, kochira, "matome");
        break;
      }
      if (sa2 >= 1 && sa2 <= SA_MAX) {
        var k2 = kai.slice();
        k2[k2.length - 1] = { month: k2[k2.length - 1].month, gaku: k2[k2.length - 1].gaku - sa2 };
        matome = ateTsukuru(k2, gaku, sa2, kochira, "matome");
        break;
      }
    }
    if (matome) out.push(matome);
    if (!out.length) {
      var zen = mi.reduce(function (t, m) {
        return t + m.zan;
      }, 0);
      if (gaku > zen) out.push({ kind: "oosugi", ate: [], sa: 0, oosugi: gaku - zen });
      else {
        // 一部（古い 月から 当て、最後の 月が 一部）
        var nokori = gaku;
        var k3 = [];
        for (var j = 0; j < mi.length && nokori > 0; j++) {
          var g = Math.min(mi[j].zan, nokori);
          k3.push({ month: mi[j].month, gaku: g });
          nokori -= g;
        }
        out.push(ateTsukuru(k3, gaku, 0, kochira, "ichibu"));
      }
    }
    return out;
  }
  var TSUYOSA = { pittari: 0, sa: 1, matome: 2, ichibu: 3, oosugi: 4 };
  function kohoTsukuru(nyukin, kaisha) {
    var all = [];
    (kaisha || []).forEach(function (c) {
      var atari = meigiAtaru(c, nyukin.meigi);
      kaishaKoho(c, nyukin.gaku).forEach(function (k) {
        // 名義が 当たらない 会社は「ぴったり」と「差」だけ 出す（一部・まとめ・多い は 名義が 当たった 時だけ）
        if (!atari && k.kind !== "pittari" && k.kind !== "sa") return;
        k.co = c.name;
        k.meigiAtari = atari;
        k.kochira = !!c.kochira;
        k.carryover = !!c.carryover;
        all.push(k);
      });
    });
    all.sort(function (a, b) {
      // 名義が当たり額も当たる ＞ 額が当たる（名義なし）＞ 名義が当たる一部 ＞ 多い
      var ra = (a.meigiAtari ? 0 : 10) + TSUYOSA[a.kind];
      var rb = (b.meigiAtari ? 0 : 10) + TSUYOSA[b.kind];
      if (a.meigiAtari && a.kind === "ichibu") ra = 20;
      if (b.meigiAtari && b.kind === "ichibu") rb = 20;
      if (a.kind === "oosugi") ra = 30;
      if (b.kind === "oosugi") rb = 30;
      if (ra !== rb) return ra - rb;
      if (a.sa !== b.sa) return a.sa - b.sa; // 差の 小さい 方を 上（対立役 v2 任2）
      return String(a.ate[0] ? a.ate[0].month : "").localeCompare(
        String(b.ate[0] ? b.ate[0].month : "")
      );
    });
    return all.slice(0, 3);
  }

  /* ---------- 二重の見分け ----------
       src＝CSV の 1行の 出どころ（日・額・名義）＝まとめ入金で 割った 回にも 同じ src
       kiroku＝[{ month, gaku, hi, src, tesuryo }]（その 会社の 全部の 行の 回）
       戻り＝{ zumi: [同じ src の 回]（記録済み）, kamo: [src 無し・同じ額・前後7日の 回]（記録済みかも） } */
  function srcTsukuru(nyukin) {
    return "csv:" + nyukin.hi + ":" + nyukin.gaku + ":" + kanaSeiki(nyukin.meigi);
  }
  function hiSa(a, b) {
    var x = Date.parse(a + "T00:00:00Z");
    var y = Date.parse(b + "T00:00:00Z");
    if (!isFinite(x) || !isFinite(y)) return Infinity;
    return Math.abs(x - y) / 86400000;
  }
  function nijuu(nyukin, kiroku) {
    var src = srcTsukuru(nyukin);
    var zumi = [];
    var kamo = [];
    (kiroku || []).forEach(function (e) {
      if (e.src === src) zumi.push(e);
      else if (
        !e.src &&
        (e.gaku === nyukin.gaku || e.gaku - (e.tesuryo || 0) === nyukin.gaku) &&
        hiSa(e.hi, nyukin.hi) <= 7
      )
        kamo.push(e);
    });
    return { zumi: zumi, kamo: kamo };
  }

  root.Keshikomi = {
    SA_MAX: SA_MAX,
    MEIGI_MIN: MEIGI_MIN,
    meigiAtaru: meigiAtaru,
    kohoTsukuru: kohoTsukuru,
    srcTsukuru: srcTsukuru,
    nijuu: nijuu,
    mojiYomu: mojiYomu,
    csvYomu: csvYomu,
    hizukeYomu: hizukeYomu,
    gakuYomu: gakuYomu,
    kanaSeiki: kanaSeiki,
    retsuSuitei: retsuSuitei,
    midashiSagasu: midashiSagasu,
    nyukinNukidasu: nyukinNukidasu,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Keshikomi;
})(typeof window !== "undefined" ? window : this);
