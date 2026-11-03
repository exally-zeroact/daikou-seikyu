/* ==========================================================================
   lib/shitagaki.js — 写真と声 → AI が 明細の 下書き 2026-11-03
   司さんの 決め（11-02）：★写真と声 → AI が 下書き → 人が 確かめて 保存した 時だけ 入る★
   ★画面（daikou-seikyu.html）と 口（api/shitagaki.js）が 同じ 物を 使う★（UMD：window.Shitagaki／module.exports）
   DOM と 倉庫と 時計を 触らない 純粋な 関数だけ（今日の 日付は 引数＝Vercel の 時計は UTC・対立役 v2 止A）。

   ★守る 事（設計前 対立役 3回）★
   ・欄に 出す 値は「保存される 値」（保存の 式は 数字以外を 消すので "¥12,000-" が 0円に なっていた＝v1 止1）
   ・どの 数を 金額に するかは AI に 決めさせない：候補が 1つの 時だけ 入れ、2つ以上は 人が 選ぶ（v2 注3）
   ・年は 画面の 今日から 決め、伝票の 年の 字は 西暦4桁に 直して 範囲を 見る（v2 止A・止B／v3 注1・注2）
   ・読めない 物は 推して 埋めない＝空に して「読めなかった」に 入れる（人が 打つ）
   ========================================================================== */
(function (root) {
  "use strict";

  // 器（meisai-engine.js の FIELD_DEFS と 同じ 名前・試験で 突き合わせる）
  var HIDUKE = "日付";
  var KINGAKU = "金額";
  var KAZU = { 金額: "sei", 人数: "sei", 距離: "shousuu" };
  var KOUMOKU_MAX = 20;
  var GYOU_MAX = 100;
  var JI_MAX = 200;
  var KOUHO_MAX = 10;
  var TOOI_HI = 60;

  function nfkc(s) {
    var t = String(s == null ? "" : s);
    return typeof t.normalize === "function" ? t.normalize("NFKC") : t;
  }
  function kiru(s, n) {
    var t = String(s == null ? "" : s);
    return t.length > n ? t.slice(0, n) : t;
  }

  /* ★数の 字 → 保存される 値★（直せない 物は ok:false＝人が 打つ）
       sei＝金額・人数（整数）／shousuu＝距離（小数も 可） */
  function suujiNaosu(ji, kind) {
    var s = nfkc(ji).replace(/\s+/g, "");
    if (s === "") return { ok: true, v: "" };
    s = s.replace(/^[¥\\]/, "");
    s = s.replace(/km$/i, "");
    s = s.replace(/(\.-|-)$/, "");
    s = s.replace(/円$/, "");
    s = s.replace(/(\.-|-)$/, "");
    if (s.indexOf(",") >= 0) {
      // 桁の 区切りとして 正しい 時だけ 外す（"1,2,3" は 直さない）
      if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return { ok: false, v: "" };
      s = s.replace(/,/g, "");
    }
    var re = kind === "shousuu" ? /^\d+(\.\d+)?$/ : /^\d+$/;
    if (!re.test(s)) return { ok: false, v: "" };
    s = s.replace(/^0+(?=\d)/, "");
    return { ok: true, v: s };
  }

  function sueNoHi(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function iso(y, m, d) {
    return y + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
  }
  function hiNoSa(a, b) {
    var pa = a.split("-"),
      pb = b.split("-");
    var ta = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
    var tb = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round(Math.abs(ta - tb) / 86400000);
  }

  /* 伝票の 年の 字 → 西暦4桁（直せない 時は ok:false＝推しの 道へ 落とさない・v3 注1） */
  function nenNaosu(ji) {
    var s = nfkc(ji).replace(/\s+/g, "");
    if (s === "") return { ok: true, nen: null };
    s = s.replace(/[年.'’]/g, "").replace(/元/g, "1");
    var m;
    if (/^\d{4}$/.test(s)) return { ok: true, nen: +s };
    if ((m = /^(?:R|令和)(\d{1,2})$/i.exec(s))) return { ok: true, nen: 2018 + +m[1] };
    if (/^\d{2}$/.test(s)) return { ok: true, nen: 2000 + +s };
    if (/^\d$/.test(s)) return { ok: true, nen: 2018 + +s }; // 1桁だけ＝令和
    return { ok: false, nen: null };
  }
  function tsukiHiNaosu(ji, ato) {
    var s = nfkc(ji).replace(/\s+/g, "");
    if (s === "") return { ok: true, n: null };
    s = s.replace(ato, "");
    if (!/^\d{1,2}$/.test(s)) return { ok: false, n: null };
    return { ok: true, n: +s };
  }

  /* ★日付を 決める★（kyou＝画面の 今日 YYYY-MM-DD・時計は 読まない）
       返す：{ hi:"YYYY-MM-DD"|"", suishita:年を 推した, tooi:今日から 60日より 離れた, wake:読めない 訳|null } */
  function kimeruHi(nenJi, tsukiJi, hiJi, kyou) {
    var kp = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(kyou || ""));
    if (!kp) return { hi: "", suishita: false, tooi: false, wake: "今日の 日付が 分かりません" };
    var ky = +kp[1];
    var moto = [nenJi, tsukiJi, hiJi]
      .map(function (x) {
        return String(x == null ? "" : x);
      })
      .join(" ")
      .trim();
    var dame = function (w) {
      return {
        hi: "",
        suishita: false,
        tooi: false,
        wake: w + (moto ? "（元の字：" + kiru(moto, 40) + "）" : ""),
      };
    };
    var t = tsukiHiNaosu(tsukiJi, /月$/);
    var d = tsukiHiNaosu(hiJi, /日$/);
    var n = nenNaosu(nenJi);
    if (t.n == null && d.n == null && n.nen == null && t.ok && d.ok && n.ok)
      return dame("伝票に 日付が 見つかりません");
    if (!t.ok || !d.ok || t.n == null || d.n == null) return dame("日付が 読めませんでした");
    if (t.n < 1 || t.n > 12) return dame("月が 1〜12 では ありません");
    if (!n.ok) return dame("年の 字が 読めませんでした");
    var y, suishita;
    if (n.nen != null) {
      if (n.nen < ky - 2 || n.nen > ky + 1) return dame("年が 今の 年から 離れすぎています");
      y = n.nen;
      suishita = false;
    } else {
      y = ky;
      suishita = true;
    }
    if (d.n < 1 || d.n > sueNoHi(y, t.n)) return dame("その月に 無い 日です");
    var hi = iso(y, t.n, d.n);
    if (suishita && hi > kyou) {
      y = y - 1;
      if (d.n > sueNoHi(y, t.n)) return dame("その月に 無い 日です");
      hi = iso(y, t.n, d.n);
    }
    return { hi: hi, suishita: suishita, tooi: hiNoSa(hi, kyou) > TOOI_HI, wake: null };
  }

  /* AI へ 渡す 欄の 名前（鍵は k0〜kN の 英字に 固定・値は 全部 字＝union を 使わない・v1 注4） */
  function kagiNo(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] === HIDUKE) continue;
      out.push({ kagi: "k" + i, item: items[i] });
    }
    return out;
  }

  /* 形の 門（口で 使う）：会社の 項目と 表示名 */
  function koumokuMon(items, labels) {
    if (!Array.isArray(items) || !items.length || items.length > KOUMOKU_MAX)
      return "項目の 数が 合いません";
    if (!Array.isArray(labels) || labels.length !== items.length) return "項目の 名前が 合いません";
    var seen = {};
    for (var i = 0; i < items.length; i++) {
      var k = items[i],
        l = labels[i];
      if (typeof k !== "string" || !k || k.length > 40) return "項目の 名前が 合いません";
      if (typeof l !== "string" || !l || l.length > 40) return "項目の 名前が 合いません";
      if (seen[k]) return "項目が 重なっています";
      seen[k] = 1;
    }
    return null;
  }

  function schemaTsukuru(items) {
    var props = {};
    var req = [];
    var add = function (k) {
      props[k] = { type: "string" };
      req.push(k);
    };
    if (items.indexOf(HIDUKE) >= 0) {
      add("hi_nen");
      add("hi_tsuki");
      add("hi_hi");
    }
    kagiNo(items).forEach(function (x) {
      add(x.kagi);
    });
    if (items.indexOf(KINGAKU) >= 0) {
      props.kingaku_kouho = {
        type: "array",
        items: {
          type: "object",
          properties: { ji: { type: "string" }, atai: { type: "string" } },
          required: ["ji", "atai"],
          additionalProperties: false,
        },
      };
      req.push("kingaku_kouho");
    }
    return {
      type: "object",
      properties: {
        gyou: {
          type: "array",
          items: { type: "object", properties: props, required: req, additionalProperties: false },
        },
        yomenai: {
          type: "array",
          items: {
            type: "object",
            properties: {
              gyou: { type: "integer" },
              koumoku: { type: "string" },
              wake: { type: "string" },
            },
            required: ["gyou", "koumoku", "wake"],
            additionalProperties: false,
          },
        },
        kaisha_no_ji: { type: "string" },
      },
      required: ["gyou", "yomenai", "kaisha_no_ji"],
      additionalProperties: false,
    };
  }

  /* AI への 頼みの 字（欄の 鍵と 表示名の 対応）。伝票の 中身は 別の 塊で 渡す */
  function tanomiNoJi(items, labels, kaisha) {
    var lines = [];
    lines.push("会社（請求先）として 選ばれている 名前：" + kiru(kaisha, 100));
    lines.push("欄（鍵＝表示名）：");
    if (items.indexOf(HIDUKE) >= 0)
      lines.push(
        "hi_nen / hi_tsuki / hi_hi ＝ " +
          labels[items.indexOf(HIDUKE)] +
          "（年・月・日を 書いてある 字のまま 分けて）"
      );
    kagiNo(items).forEach(function (x) {
      lines.push(x.kagi + " ＝ " + labels[items.indexOf(x.item)]);
    });
    if (items.indexOf(KINGAKU) >= 0)
      lines.push(
        "kingaku_kouho ＝ " +
          labels[items.indexOf(KINGAKU)] +
          " の 候補になる 数（行に 数が 2つ以上 ある 時は 全部。1つなら その1つ）"
      );
    return lines.join("\n");
  }

  /* ★口で 見る★ AI の 返事の 形だけ（知らない 鍵を 捨てる・字に する・数を 切る） */
  function kensa(raw, items) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.gyou))
      return { ok: false, wake: "形が 違います" };
    if (raw.gyou.length > GYOU_MAX)
      return {
        ok: false,
        wake: "行が 多すぎます（" + raw.gyou.length + "行）。伝票を 分けて ください",
      };
    var kagi = [];
    if (items.indexOf(HIDUKE) >= 0) kagi.push("hi_nen", "hi_tsuki", "hi_hi");
    kagiNo(items).forEach(function (x) {
      kagi.push(x.kagi);
    });
    var kinOk = items.indexOf(KINGAKU) >= 0;
    var gyou = raw.gyou.map(function (r) {
      var o = {};
      r = r && typeof r === "object" ? r : {};
      kagi.forEach(function (k) {
        o[k] = typeof r[k] === "string" ? kiru(r[k].trim(), JI_MAX) : "";
      });
      if (kinOk) {
        o.kingaku_kouho = (Array.isArray(r.kingaku_kouho) ? r.kingaku_kouho : [])
          .slice(0, KOUHO_MAX)
          .filter(function (c) {
            return c && typeof c === "object";
          })
          .map(function (c) {
            // 字で ない 値も 捨てない＝画面で「読めない 候補」に 数える（捨てると 残りが 金額に 入る）
            return {
              ji: kiru(typeof c.ji === "string" ? c.ji : "", 40),
              atai: typeof c.atai === "string" ? kiru(c.atai, 40) : "(字でない値)",
            };
          });
      }
      return o;
    });
    var yomenaiKagi = kagi.concat(["hi"]);
    var yomenai = (Array.isArray(raw.yomenai) ? raw.yomenai : [])
      .filter(function (y) {
        return (
          y &&
          typeof y.gyou === "number" &&
          y.gyou >= 0 &&
          y.gyou < gyou.length &&
          Math.floor(y.gyou) === y.gyou &&
          yomenaiKagi.indexOf(y.koumoku) >= 0
        );
      })
      .slice(0, GYOU_MAX * 5)
      .map(function (y) {
        return {
          gyou: y.gyou,
          koumoku: y.koumoku,
          wake: kiru(typeof y.wake === "string" ? y.wake : "", JI_MAX),
        };
      });
    var kaisha = typeof raw.kaisha_no_ji === "string" ? kiru(raw.kaisha_no_ji.trim(), 100) : "";
    return { ok: true, kekka: { gyou: gyou, yomenai: yomenai, kaisha_no_ji: kaisha } };
  }

  /* ★画面で 使う★ 口の 返事 → 入力の 行（保存は しない）
       返す：行の 配列。行には 器の 鍵＋項目＋印（_ai・_kakunin・_kaisha・_yomenai・_kouho・_toshi） */
  function gamenGyou(kekka, items, kyou, kaisha, shurui) {
    var map = kagiNo(items);
    var aiYomenai = {};
    (kekka.yomenai || []).forEach(function (y) {
      (aiYomenai[y.gyou] = aiYomenai[y.gyou] || []).push(y);
    });
    return (kekka.gyou || []).map(function (r, gi) {
      var row = {
        _ai: shurui === "koe" ? "koe" : "shashin",
        _kakunin: false,
        _kaisha: kaisha,
        _yomenai: {},
        _kouho: [],
        _toshi: false,
      };
      items.forEach(function (k) {
        row[k] = "";
      });
      // AI が「読めない」と 言った 欄は 値が 在っても 空に する（推した 値を 残さない）
      var aiDame = {};
      (aiYomenai[gi] || []).forEach(function (y) {
        var item = y.koumoku === "hi" ? HIDUKE : null;
        if (!item)
          map.forEach(function (x) {
            if (x.kagi === y.koumoku) item = x.item;
          });
        if (/^hi_/.test(y.koumoku)) item = HIDUKE;
        if (item) aiDame[item] = y.wake || "読めませんでした";
      });
      if (items.indexOf(HIDUKE) >= 0) {
        if (aiDame[HIDUKE]) row._yomenai[HIDUKE] = aiDame[HIDUKE];
        else {
          var h = kimeruHi(r.hi_nen, r.hi_tsuki, r.hi_hi, kyou);
          row[HIDUKE] = h.hi;
          if (h.wake) row._yomenai[HIDUKE] = h.wake;
          // 今日より 先の 日付も 印（年が 書いてあっても 月の 読み違いが ある・作った後の 対立役 注1）
          row._toshi = !!(h.hi && (h.suishita || h.tooi || h.hi > kyou));
        }
      }
      map.forEach(function (x) {
        var ji = r[x.kagi] || "";
        if (aiDame[x.item]) {
          row._yomenai[x.item] = aiDame[x.item];
          return;
        }
        if (KAZU[x.item]) {
          var n = suujiNaosu(ji, KAZU[x.item]);
          if (n.ok) row[x.item] = n.v;
          else row._yomenai[x.item] = "数として 読めませんでした（元の字：" + kiru(ji, 40) + "）";
        } else row[x.item] = ji;
      });
      if (items.indexOf(KINGAKU) >= 0) {
        var kouho = [];
        var dameKouho = []; // ★読めない 候補も 数える★（捨てると 残りの 1つが 金額に 入る＝作った後の 対立役 止1）
        (r.kingaku_kouho || []).forEach(function (c) {
          var n = suujiNaosu(c.atai, "sei");
          if (!n.ok || n.v === "") {
            dameKouho.push(kiru((c.ji ? c.ji + " " : "") + c.atai, 40));
            return;
          }
          if (
            n.ok &&
            n.v !== "" &&
            !kouho.some(function (z) {
              return z.atai === n.v && z.ji === c.ji;
            })
          )
            kouho.push({ ji: c.ji, atai: n.v });
        });
        // 金額の 欄に AI が 入れた 数も 候補と 一緒に 数える（欄と 候補が 食い違えば 人が 選ぶ）
        var atai = {};
        kouho.forEach(function (c) {
          atai[c.atai] = 1;
        });
        if (row[KINGAKU] !== "" && !atai[row[KINGAKU]]) {
          atai[row[KINGAKU]] = 1;
          kouho.unshift({ ji: "金額の欄", atai: row[KINGAKU] });
        }
        var kazu = Object.keys(atai).length;
        if (dameKouho.length) {
          // 伝票に 読めない 数（値引・▲・漢字 など）が 在る＝どれが 請求額か 人が 決める
          row[KINGAKU] = "";
          row._kouho = kouho;
          row._yomenai[KINGAKU] =
            "数として 読めない 候補が あります（元の字：" +
            kiru(dameKouho.join("／"), 60) +
            "）。伝票を 見て 打つか、下から 選んでください";
        } else if (kazu === 1 && row[KINGAKU] === "" && !row._yomenai[KINGAKU]) {
          row[KINGAKU] = Object.keys(atai)[0]; // 候補が 1つだけ＝その 数（v2 注3）
        } else if (kazu >= 2) {
          // ★どれを 金額に するかは 人が 選ぶ★
          row[KINGAKU] = "";
          row._kouho = kouho;
          if (!row._yomenai[KINGAKU])
            row._yomenai[KINGAKU] = "数が いくつか あります。下から 選ぶか 打ってください";
        }
      }
      return row;
    });
  }

  /* 「中身が ある 行」＝日付 以外の 項目の どれかが 空でない（v2 注D） */
  function gyouNiNakamiAri(row, items) {
    return items.some(function (k) {
      return k !== HIDUKE && String((row && row[k]) == null ? "" : row[k]).trim() !== "";
    });
  }

  /* AI の 行を 足す：後ろの 中身の 無い 行（日付だけを 含む）を 除いてから 足す */
  function tsuika(rows, atarashii, items) {
    var nokori = rows.slice();
    while (
      nokori.length &&
      !nokori[nokori.length - 1]._ai &&
      !gyouNiNakamiAri(nokori[nokori.length - 1], items)
    )
      nokori.pop();
    return nokori.concat(atarashii);
  }

  /* ★保存の 門★ 止める 訳（無ければ null） */
  function hozonMon(rows, items) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r._ai) continue;
      var bango = "明細 " + (i + 1);
      if (items.indexOf(KINGAKU) >= 0 && String(r[KINGAKU] == null ? "" : r[KINGAKU]).trim() === "")
        return (
          "AI の 下書きの 金額が 空です（" +
          bango +
          "）。伝票を 見て 打つか、候補から 選んでください"
        );
      for (var k in r._yomenai || {}) {
        if (KAZU[k] && items.indexOf(k) >= 0 && String(r[k] == null ? "" : r[k]).trim() === "")
          return (
            "AI が 読めなかった 数が 空の ままです（" + bango + "）。伝票を 見て 打ってください"
          );
      }
    }
    for (var j = 0; j < rows.length; j++) {
      if (rows[j] && rows[j]._ai && !rows[j]._kakunin)
        return (
          "AI の 下書きの 行を 伝票と 見比べて「確かめた」を 押してください（明細 " + (j + 1) + "）"
        );
    }
    return null;
  }

  /* AI の 行の 日付は 年まで 出す（v1 止3） */
  function hyoujiHi(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    return m ? m[1] + "/" + +m[2] + "/" + +m[3] : "";
  }

  /* 許した 利用者の 一覧（環境変数の 字）→ 配列。無い・空＝誰も 通さない（v2 注C） */
  function ichiran(ji) {
    return String(ji == null ? "" : ji)
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(function (s) {
        return s !== "";
      });
  }

  var Shitagaki = {
    HIDUKE: HIDUKE,
    KINGAKU: KINGAKU,
    KAZU: KAZU,
    KOUMOKU_MAX: KOUMOKU_MAX,
    suujiNaosu: suujiNaosu,
    nenNaosu: nenNaosu,
    kimeruHi: kimeruHi,
    kagiNo: kagiNo,
    koumokuMon: koumokuMon,
    schemaTsukuru: schemaTsukuru,
    tanomiNoJi: tanomiNoJi,
    kensa: kensa,
    gamenGyou: gamenGyou,
    gyouNiNakamiAri: gyouNiNakamiAri,
    tsuika: tsuika,
    hozonMon: hozonMon,
    hyoujiHi: hyoujiHi,
    ichiran: ichiran,
  };
  root.Shitagaki = Shitagaki;
  if (typeof module !== "undefined" && module.exports) module.exports = Shitagaki;
})(typeof window !== "undefined" ? window : this);
