/**
 * nomiya-core.js - 飲み屋の売上管理（純ロジック / DOM非依存）
 * ================================================================
 * 【役割】
 *  売上1件の器（スキーマ）と、絞り込み・集計・未回収・請求書の計算を1本化する。
 *  画面(nomiya-uriage.html)はここを呼ぶだけ＝計算の二重管理をしない。
 *
 * 【1件の売上】= 1組のお会計
 *  { id, date:'YYYY-MM-DD', name, people, amount(税込円), pay, receipt(bool),
 *    memo, paidDate|null, createdAt, updatedAt, deletedAt|null }
 *
 * 【支払い方法】現金 / クレジット / PayPay / 請求書送り / ツケ
 *  請求書送り・ツケ は「その場でお金が入っていない」＝未回収。paidDate が入ると回収済み。
 *
 * 【消費税】飲食は税込表記が実態。請求書には内税(税込金額の中に消費税が含まれる)で内訳を出す。
 *  消費税額 = 税込 × 10 / 110 の小数切り捨て（1円未満は切り捨てが実務の既定）。
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.NomiyaCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ===================================================================
     支払い方法（唯一の定義。並び順もここが正）
     =================================================================== */
  var PAY_METHODS = [
    { key: "cash", label: "現金", short: "現金", unpaid: false },
    { key: "credit", label: "クレジット", short: "クレカ", unpaid: false },
    { key: "paypay", label: "PayPay", short: "PayPay", unpaid: false },
    { key: "invoice", label: "請求書送り", short: "請求書", unpaid: true },
    { key: "tsuke", label: "ツケ", short: "ツケ", unpaid: true },
  ];
  var PAY_KEYS = PAY_METHODS.map(function (m) {
    return m.key;
  });
  // 未回収になりうる支払い方法（請求書送り・ツケ）
  var UNPAID_KEYS = PAY_METHODS.filter(function (m) {
    return m.unpaid;
  }).map(function (m) {
    return m.key;
  });

  /* ===================================================================
     領収書の状態（4通り）
     ─ 現場の実際に合わせる。支払い方法で「そもそも領収書が要るか」が違う。
       none   = 出していない（現金でレシートも渡していない）
       issued = 出した（発行済み）
       later  = あとで渡す（ツケはその場でお金を受け取っていないので出せない。回収時に渡す）
       na     = 要らない（振込＝請求書が証憑 / カード・PayPay＝売上票・利用明細が証憑）
     ※ 集計は2つに分ける。
       「領収書あり」= issued（出した）＋ na（振込・カード＝そもそも要らない。請求書や
         売上票が証憑として残るので、領収書ありと同じ側で数える）
       「領収書なし」= none（出していない）＋ later（あとで渡す＝まだ出していない）
     =================================================================== */
  var RECEIPT_STATES = [
    { key: "none", label: "なし", mark: "" },
    { key: "issued", label: "あり", mark: "○" },
    // あとで渡す分はまだ出していない＝「なし」側なので、紙の印も空にする
    { key: "later", label: "あとで", mark: "" },
    // na = 領収書はいらない。振込(請求書が証憑)・カード/PayPay(売上票・利用明細が証憑)のとき。
    // 「なし(none)」と分けるのが肝。まとめると、振込やカードの売上まで
    // 「領収書なし」として落とされてしまう。
    // 振込・カードは領収書が要らない分。集計で「あり」側に数えるので、紙の印も○で揃える。
    { key: "na", label: "不要", mark: "○" },
  ];
  // 旧データ(true/false)や画面の 'yes'/'no' もここで吸収する
  function normalizeReceipt(v) {
    if (v === true) return "issued";
    if (v === false || v == null || v === "") return "none";
    if (v === "yes") return "issued";
    if (v === "no") return "none";
    return v === "issued" || v === "later" || v === "na" ? v : "none";
  }
  function isIssued(s) {
    return normalizeReceipt(s && s.receipt) === "issued";
  }
  function isLater(s) {
    return normalizeReceipt(s && s.receipt) === "later";
  }
  // 領収書がいらない支払い（振込＝請求書が証憑 / カード・PayPay＝売上票が証憑）
  function isNa(s) {
    return normalizeReceipt(s && s.receipt) === "na";
  }
  // 支払い方法ごとの「領収書のはじめの状態」と「選べる状態」
  function receiptChoices(payKey) {
    if (payKey === "credit" || payKey === "paypay") return ["na", "issued"];
    if (payKey === "invoice") return ["na", "issued"];
    if (payKey === "tsuke") return ["later", "issued", "none"];
    return ["none", "issued"]; // 現金
  }
  function defaultReceipt(payKey) {
    return receiptChoices(payKey)[0];
  }
  // その支払い方法で選べない状態なら既定に戻す（変な組み合わせで保存されないように）
  function fixReceiptFor(payKey, receipt) {
    var r = normalizeReceipt(receipt);
    return receiptChoices(payKey).indexOf(r) >= 0 ? r : defaultReceipt(payKey);
  }
  function receiptMark(v) {
    var k = normalizeReceipt(v);
    for (var i = 0; i < RECEIPT_STATES.length; i++) {
      if (RECEIPT_STATES[i].key === k) return RECEIPT_STATES[i].mark;
    }
    return "";
  }

  function payLabel(key) {
    for (var i = 0; i < PAY_METHODS.length; i++) {
      if (PAY_METHODS[i].key === key) return PAY_METHODS[i].label;
    }
    return "";
  }
  function payShort(key) {
    for (var i = 0; i < PAY_METHODS.length; i++) {
      if (PAY_METHODS[i].key === key) return PAY_METHODS[i].short;
    }
    return "";
  }
  function isUnpaidMethod(key) {
    return UNPAID_KEYS.indexOf(key) >= 0;
  }

  /* ===================================================================
     日付ユーティリティ（すべて 'YYYY-MM-DD' / 'YYYY-MM' の文字列で扱う。
     文字列比較がそのまま日付比較になる＝タイムゾーンで狂わない）
     =================================================================== */
  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  // Date → 'YYYY-MM-DD'（ローカル時刻基準。toISOStringはUTCずれで前日になるので使わない）
  function toIso(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function isIsoDate(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }
  function ymOf(iso) {
    return isIsoDate(iso) ? iso.slice(0, 7) : "";
  }
  function daysInMonth(ym) {
    var y = +ym.slice(0, 4);
    var m = +ym.slice(5, 7);
    return new Date(y, m, 0).getDate();
  }
  function rangeOfMonth(ym) {
    return { from: ym + "-01", to: ym + "-" + pad2(daysInMonth(ym)) };
  }
  function shiftMonth(ym, delta) {
    var y = +ym.slice(0, 4);
    var m = +ym.slice(5, 7) + delta;
    y += Math.floor((m - 1) / 12);
    m = ((((m - 1) % 12) + 12) % 12) + 1;
    return y + "-" + pad2(m);
  }
  // '2026-07-05' → '7/5' （売上帳の日付欄。年は見出しに出るので省く）
  function mdShort(iso) {
    if (!isIsoDate(iso)) return "";
    return +iso.slice(5, 7) + "/" + +iso.slice(8, 10);
  }
  // '2026-07-05' → '2026年7月5日'
  function jpDate(iso) {
    if (!isIsoDate(iso)) return "";
    return +iso.slice(0, 4) + "年" + +iso.slice(5, 7) + "月" + +iso.slice(8, 10) + "日";
  }
  // '2026-07' → '2026年7月'
  function jpMonth(ym) {
    if (typeof ym !== "string" || ym.length < 7) return "";
    return +ym.slice(0, 4) + "年" + +ym.slice(5, 7) + "月";
  }
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function weekday(iso) {
    if (!isIsoDate(iso)) return "";
    return WD[new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getDay()];
  }

  /* ===================================================================
     金額表記
     =================================================================== */
  function comma(n) {
    var v = Math.round(Number(n) || 0);
    var neg = v < 0;
    var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + s;
  }
  function yen(n) {
    return "¥" + comma(n);
  }

  /* ===================================================================
     1件の検証・正規化
     ─ 画面から来た生の値を、保存できる形に固める。
       金額/人数は数字以外を弾く（空文字を0扱いして黙って保存しない）。
     =================================================================== */
  // 空欄('' / null / undefined / 空白だけ)を Number() が 0 にしてしまうのを防ぐ。
  // 空欄は「0」ではなく「未入力」＝ NaN として扱い、検証で弾く。
  function numOrNaN(v) {
    if (v == null) return NaN;
    if (typeof v === "string" && v.trim() === "") return NaN;
    return Number(v);
  }

  function validateSale(raw) {
    var errors = [];
    var r = raw || {};
    if (!isIsoDate(r.date)) errors.push("日付を入れてください");
    var name = String(r.name == null ? "" : r.name).trim();
    if (!name) errors.push("名前を入れてください");
    var people = numOrNaN(r.people);
    if (!isFinite(people) || people < 1 || Math.floor(people) !== people) {
      errors.push("人数は1以上の整数で入れてください");
    }
    var amount = numOrNaN(r.amount);
    if (!isFinite(amount) || amount < 0 || Math.floor(amount) !== amount) {
      errors.push("金額は0以上の整数で入れてください");
    }
    if (PAY_KEYS.indexOf(r.pay) < 0) errors.push("支払い方法を選んでください");
    return { ok: errors.length === 0, errors: errors };
  }

  function normalizeSale(raw, now) {
    var r = raw || {};
    var nowIso = now || new Date().toISOString();
    return {
      id: r.id || makeId(),
      date: r.date,
      name: String(r.name == null ? "" : r.name).trim(),
      people: Math.floor(Number(r.people)),
      amount: Math.floor(Number(r.amount)),
      pay: r.pay,
      receipt: normalizeReceipt(r.receipt),
      // 領収書を渡した日（あとで渡す場合は入金日が入る。出していなければ null）
      receiptDate: normalizeReceipt(r.receipt) === "issued" ? r.receiptDate || r.date : null,
      memo: String(r.memo == null ? "" : r.memo).trim(),
      // 担当（誰の客か）。今は画面に出さないが、後からキャスト別に出せるよう器だけ持つ
      staff: String(r.staff == null ? "" : r.staff).trim(),
      // 未回収でない支払い方法は「その場で回収済み」＝ paidDate は持たない
      paidDate: isUnpaidMethod(r.pay) ? r.paidDate || null : null,
      createdAt: r.createdAt || nowIso,
      updatedAt: nowIso,
      deletedAt: r.deletedAt || null,
    };
  }

  // 同一ミリ秒で連投しても衝突しないID（時刻＋乱数）
  var _idSeq = 0;
  function makeId() {
    _idSeq = (_idSeq + 1) % 100000;
    return (
      "s" +
      Date.now().toString(36) +
      "_" +
      _idSeq.toString(36) +
      Math.floor(Math.random() * 1679616).toString(36)
    );
  }

  /* ===================================================================
     絞り込み・並べ替え
     =================================================================== */
  function isAlive(s) {
    return !!s && !s.deletedAt;
  }

  /**
   * filterSales(sales, opt)
   *  opt = { from, to, pay:'all'|key, receipt:'all'|'yes'|'no', name, q }
   *  from/to は両端を含む。
   */
  function filterSales(sales, opt) {
    var o = opt || {};
    var q = o.q ? String(o.q).trim() : "";
    return (sales || []).filter(function (s) {
      if (!isAlive(s)) return false;
      if (o.from && s.date < o.from) return false;
      if (o.to && s.date > o.to) return false;
      if (o.pay && o.pay !== "all" && s.pay !== o.pay) return false;
      // 'yes'=発行済み＋振込・カード / 'no'=出していない(なし＋あとで) / 'later','na'=細かく見る用
      if (o.receipt === "yes" && !(isIssued(s) || isNa(s))) return false;
      if (o.receipt === "no" && !(normalizeReceipt(s.receipt) === "none" || isLater(s)))
        return false;
      if (o.receipt === "na" && !isNa(s)) return false;
      if (o.receipt === "later" && !isLater(s)) return false;
      if (o.name && s.name !== o.name) return false;
      if (q && String(s.name).indexOf(q) < 0 && String(s.memo || "").indexOf(q) < 0) return false;
      if (o.unpaidOnly && !(isUnpaidMethod(s.pay) && !s.paidDate)) return false;
      return true;
    });
  }

  // 日付昇順 → 同日は入力順(createdAt) → 最後にidで安定化
  function sortSales(sales) {
    return (sales || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var ca = a.createdAt || "";
      var cb = b.createdAt || "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
  }

  /* ===================================================================
     集計
     =================================================================== */
  function summarize(sales) {
    var list = (sales || []).filter(isAlive);
    var amount = 0;
    var people = 0;
    for (var i = 0; i < list.length; i++) {
      amount += Number(list[i].amount) || 0;
      people += Number(list[i].people) || 0;
    }
    return {
      count: list.length, // 組数
      people: people, // のべ人数
      amount: amount, // 売上合計(税込)
      perGroup: list.length ? Math.round(amount / list.length) : 0, // 1組あたり
      perPerson: people ? Math.round(amount / people) : 0, // 客単価(1人あたり)
    };
  }

  function ratio(part, whole) {
    return whole > 0 ? part / whole : 0;
  }

  // 支払い方法別（5種すべてを常に同じ順で返す＝0件でも行が消えない）
  function byPayMethod(sales) {
    var list = (sales || []).filter(isAlive);
    var total = summarize(list).amount;
    return PAY_METHODS.map(function (m) {
      var rows = list.filter(function (s) {
        return s.pay === m.key;
      });
      var sum = summarize(rows);
      return {
        key: m.key,
        label: m.label,
        short: m.short,
        count: sum.count,
        people: sum.people,
        amount: sum.amount,
        ratio: ratio(sum.amount, total),
      };
    });
  }

  // 領収書あり（発行済み）/ なし（未発行＝なし＋あとで）
  function byReceipt(sales) {
    var list = (sales || []).filter(isAlive);
    var total = summarize(list).amount;
    return [
      {
        key: "yes",
        label: "領収書あり",
        test: function (s) {
          // 振込・カードは領収書が要らない分。証憑が残るので「あり」と同じ側で数える。
          return isIssued(s) || isNa(s);
        },
      },
      {
        key: "no",
        label: "領収書なし",
        test: function (s) {
          return normalizeReceipt(s.receipt) === "none" || isLater(s);
        },
      },
    ].map(function (g) {
      var rows = list.filter(function (s) {
        return g.test(s);
      });
      var sum = summarize(rows);
      return {
        key: g.key,
        label: g.label,
        count: sum.count,
        people: sum.people,
        amount: sum.amount,
        ratio: ratio(sum.amount, total),
      };
    });
  }

  // 日別（売上のあった日だけ・日付昇順）
  function byDay(sales) {
    var list = (sales || []).filter(isAlive);
    var map = {};
    var order = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!map[s.date]) {
        map[s.date] = { date: s.date, count: 0, people: 0, amount: 0 };
        order.push(s.date);
      }
      map[s.date].count += 1;
      map[s.date].people += Number(s.people) || 0;
      map[s.date].amount += Number(s.amount) || 0;
    }
    order.sort();
    return order.map(function (d) {
      return map[d];
    });
  }

  /**
   * markFirstOfDate(rows)
   *  紙に並べるとき「同じ日付は最初の行だけ日付を出す」ための印を付ける。
   *  代行請求書と同じ見せ方＝日付が繰り返されず圧迫感が出ない。
   *  返り = [{sale, showDate}]（並び順は渡されたまま。先に sortSales してから呼ぶ）
   */
  function markFirstOfDate(rows) {
    var last = null;
    return (rows || []).map(function (s) {
      var first = s.date !== last;
      last = s.date;
      return { sale: s, showDate: first };
    });
  }

  /* ===================================================================
     未回収（請求書送り・ツケ で paidDate が無いもの）
     =================================================================== */
  function unpaidSales(sales) {
    return (sales || []).filter(function (s) {
      return isAlive(s) && isUnpaidMethod(s.pay) && !s.paidDate;
    });
  }

  // 相手ごとの未回収残高（金額の大きい順→名前順）
  // payKey を渡すと、その支払い方法（請求書送り or ツケ）だけに絞る。
  function unpaidByName(sales, payKey) {
    var list = unpaidSales(sales).filter(function (s) {
      return !payKey || s.pay === payKey;
    });
    var map = {};
    var order = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!map[s.name]) {
        map[s.name] = { name: s.name, count: 0, amount: 0, first: s.date, last: s.date, ids: [] };
        order.push(s.name);
      }
      var g = map[s.name];
      g.count += 1;
      g.amount += Number(s.amount) || 0;
      if (s.date < g.first) g.first = s.date;
      if (s.date > g.last) g.last = s.date;
      g.ids.push(s.id);
    }
    return order
      .map(function (n) {
        return map[n];
      })
      .sort(function (a, b) {
        if (a.amount !== b.amount) return b.amount - a.amount;
        return a.name < b.name ? -1 : 1;
      });
  }

  /**
   * unpaidGroups(sales)
   *  未回収を「請求書送り」と「ツケ」に分けて返す（性質が違うので混ぜない）。
   *  請求書送り＝会社へ請求書を出して振込を待つもの／ツケ＝店で付けておくもの。
   *  返り = [{key,label,count,amount,people,names:[{name,count,amount,first,last,ids}]}]
   */
  function unpaidGroups(sales) {
    return UNPAID_KEYS.map(function (k) {
      var names = unpaidByName(sales, k);
      var count = 0;
      var amount = 0;
      names.forEach(function (n) {
        count += n.count;
        amount += n.amount;
      });
      return {
        key: k,
        label: payLabel(k),
        count: count, // 件数（会計の数）
        amount: amount, // 残高
        names: names,
      };
    });
  }

  /**
   * laterReceipts(sales)
   *  「あとで渡す」ままの領収書（回収したときに渡す約束が残っているもの）。
   *  集計では「なし」に入るので、件数と金額を別に出して取りこぼしを防ぐ。
   */
  function laterReceipts(sales) {
    var rows = (sales || []).filter(function (s) {
      return isAlive(s) && isLater(s);
    });
    var sum = summarize(rows);
    return { count: sum.count, amount: sum.amount, rows: rows };
  }

  /**
   * receiptNotes(sale)
   *  領収書についての注意（黄色い注記・止めない・断定しない）。
   *  - カード/電子マネー払いの領収書：発行義務はなく、売上票や利用明細が証憑になる。
   *    出すなら「クレジットカード払い」と書けば二重発行と誤解されず、収入印紙も不要。
   *  - 現金など金銭を受け取った紙の領収書：税抜5万円以上は収入印紙が必要（電子なら不要）。
   *  返り = 文字列の配列（無ければ空）
   */
  function receiptNotes(sale, rate) {
    var s = sale || {};
    var out = [];
    if (isNa(s)) {
      if (s.pay === "invoice") {
        out.push(
          "振込は請求書が証憑になるので領収書は要りません。求められたら出せます（紙で税抜5万円以上なら収入印紙が必要）。"
        );
      } else {
        out.push("カード・PayPayは売上票や利用明細が証憑になるので領収書は要りません。");
      }
      return out;
    }
    if (!isIssued(s) && !isLater(s)) return out;
    var cashless = s.pay === "credit" || s.pay === "paypay";
    if (cashless && isIssued(s)) {
      out.push(
        "カード・PayPay払いの領収書は発行義務がなく、売上票や利用明細が証憑になります。出すときは「クレジットカード払い」と書けば二重発行と誤解されず、収入印紙も不要です。"
      );
    }
    if (!cashless && isIssued(s)) {
      var net = taxIncluded(s.amount, rate).net;
      if (net >= 50000) {
        out.push(
          "紙の領収書は税抜5万円以上（この会計は税抜" +
            comma(net) +
            "円）で収入印紙が必要です。電子で渡すなら不要です。"
        );
      }
    }
    if (isLater(s) && !isUnpaidMethod(s.pay)) {
      out.push("その場でお金を受け取っているので、「あとで」ではなく「あり」で記録できます。");
    }
    return out;
  }

  /* ===================================================================
     宛先（請求書送りの相手）
     ─ 会社名がそのまま鍵。入力画面で「請求書送り」を選ぶと、
       ここに登録した会社名から選ぶ（最近選んだ順）ので、打ち間違いが起きない。
       登録が無い名前（ツケの個人客など）は名前に「御中」を付けるだけ（今までと同じ）。
     =================================================================== */
  function normalizePartner(raw, now) {
    var r = raw || {};
    var name = String(r.name == null ? "" : r.name).trim();
    var to = String(r.to == null ? "" : r.to).trim(); // 昔のデータは宛名を別に持っている
    return {
      name: name, // 会社名（売上にもこの名前で入る）
      to: to || name, // 請求書に出す宛名
      honor: r.honor === "様" ? "様" : "御中", // 敬称
      person: String(r.person == null ? "" : r.person).trim(), // 担当者
      lastUsedAt: String(r.lastUsedAt == null ? "" : r.lastUsedAt), // 最後に選んだとき
      updatedAt: now || new Date().toISOString(),
    };
  }
  function validatePartner(raw) {
    var errors = [];
    var r = raw || {};
    if (!String(r.name == null ? "" : r.name).trim()) errors.push("会社名を入れてください");
    return { ok: errors.length === 0, errors: errors };
  }
  /**
   * touchPartner(partners, name, now)
   *  その宛先を「今選んだ」ことにする。並び順（最近選んだ順）に使う。
   *  登録が無い名前なら何もしない。元のオブジェクトは変えず、新しいものを返す。
   */
  function touchPartner(partners, name, now) {
    var m = partners || {};
    var nm = String(name == null ? "" : name).trim();
    if (!m[nm]) return m;
    var out = {};
    Object.keys(m).forEach(function (k) {
      out[k] = m[k];
    });
    var p = {};
    Object.keys(m[nm]).forEach(function (k) {
      p[k] = m[nm][k];
    });
    p.lastUsedAt = now || new Date().toISOString();
    out[nm] = p;
    return out;
  }
  /**
   * partnerRecent(partners)
   *  最近選んだ順。まだ選んでいないものは、あとから登録したものを先に。
   */
  function partnerRecent(partners) {
    return alivePartners(partners).sort(function (a, b) {
      var al = a.lastUsedAt || "";
      var bl = b.lastUsedAt || "";
      if (al !== bl) return al < bl ? 1 : -1; // 最近選んだものが上
      var au = a.updatedAt || "";
      var bu = b.updatedAt || "";
      if (au !== bu) return au < bu ? 1 : -1;
      return String(a.name) < String(b.name) ? -1 : 1;
    });
  }
  /**
   * invoiceTo(partners, name)
   *  請求書の宛名まわりを決める。登録が無くても必ず出せる形を返す。
   */
  function invoiceTo(partners, name) {
    var nm = String(name == null ? "" : name).trim();
    var all = partners || {};
    var p = all[nm] && !all[nm].deletedAt ? all[nm] : {};
    return {
      to: String(p.to || nm).trim(),
      honor: p.honor === "様" ? "様" : "御中",
      person: String(p.person || "").trim(),
      registered: !!(all[nm] && !all[nm].deletedAt),
    };
  }
  // 生きている宛先だけ（消したものは控えとして残るが、画面には出さない）
  function alivePartners(partners) {
    var m = partners || {};
    return Object.keys(m)
      .filter(function (k) {
        return m[k] && !m[k].deletedAt;
      })
      .map(function (k) {
        return m[k];
      });
  }
  // 登録済みの宛先を名前順で並べる
  function partnerList(partners) {
    return alivePartners(partners).sort(function (a, b) {
      return String(a.name) < String(b.name) ? -1 : 1;
    });
  }

  /* ===================================================================
     名前のサジェスト（よく使う順→最近使った順）
     =================================================================== */
  function nameSuggestions(sales, limit) {
    var list = (sales || []).filter(isAlive);
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var n = list[i].name;
      if (!n) continue;
      if (!map[n]) map[n] = { name: n, count: 0, last: "" };
      map[n].count += 1;
      if (list[i].date > map[n].last) map[n].last = list[i].date;
    }
    var arr = Object.keys(map).map(function (k) {
      return map[k];
    });
    arr.sort(function (a, b) {
      if (a.last !== b.last) return a.last < b.last ? 1 : -1; // 最近来た人が上
      if (a.count !== b.count) return b.count - a.count;
      return a.name < b.name ? -1 : 1;
    });
    return limit ? arr.slice(0, limit) : arr;
  }

  /* ===================================================================
     消費税（内税）
     =================================================================== */
  function taxIncluded(total, rate) {
    var r = rate == null ? 0.1 : Number(rate);
    var t = Math.floor(Number(total) || 0);
    var tax = Math.floor((t * r) / (1 + r));
    return { total: t, tax: tax, net: t - tax, rate: r };
  }

  /* ===================================================================
     請求書
     =================================================================== */
  // 請求No: '202607-001'
  function formatInvoiceNo(ym, seq) {
    var s = String(seq);
    while (s.length < 3) s = "0" + s;
    return String(ym).replace("-", "") + "-" + s;
  }
  function nextInvoiceSeq(invoices, ym) {
    var max = 0;
    var pre = String(ym).replace("-", "") + "-";
    (invoices || []).forEach(function (iv) {
      if (iv && typeof iv.no === "string" && iv.no.indexOf(pre) === 0) {
        var n = parseInt(iv.no.slice(pre.length), 10);
        if (isFinite(n) && n > max) max = n;
      }
    });
    return max + 1;
  }
  // 同じ相手・同じ期間の請求書は同じ番号を使い回す（プレビューのたびに採番しない）
  function invoiceKey(name, from, to) {
    return name + "" + from + "" + to;
  }

  /**
   * billableNames(sales, from, to)
   *  その月に「請求書送り・ツケ」の売上がある相手。入金済みかどうかは見ない
   *  （月で区切った請求書は、あとから出し直しても同じ中身になる）。古い売上の順。
   */
  function billableNames(sales, from, to) {
    var seen = {};
    var out = [];
    sortSales(filterSales(sales, { from: from, to: to })).forEach(function (s) {
      if (!isUnpaidMethod(s.pay)) return;
      if (!s.name || seen[s.name]) return;
      seen[s.name] = 1;
      out.push(s.name);
    });
    return out;
  }

  /**
   * buildInvoice(sales, opt)
   *  opt = { name, from, to, unpaidOnly(既定true), rate, no }
   *  返り = { name, from, to, rows[], count, people, total, tax, net, no }
   */
  function buildInvoice(sales, opt) {
    var o = opt || {};
    var rows = sortSales(
      filterSales(sales, {
        from: o.from,
        to: o.to,
        name: o.name,
        unpaidOnly: o.unpaidOnly === false ? false : true,
      })
    ).filter(function (s) {
      // 請求書に載るのは「請求書送り」「ツケ」だけ（現金/クレカ/PayPayはその場で完結）
      return isUnpaidMethod(s.pay);
    });
    var sum = summarize(rows);
    var tx = taxIncluded(sum.amount, o.rate);
    return {
      name: o.name,
      from: o.from,
      to: o.to,
      rows: rows,
      count: sum.count,
      people: sum.people,
      total: tx.total,
      tax: tx.tax,
      net: tx.net,
      rate: tx.rate,
      no: o.no || "",
    };
  }

  /* ===================================================================
     クラウド同期（純ロジック。通信そのものは画面側）
     ─ 考え方：端末の中が作業台、クラウドは同じ物の控え。
       電波が無くても打てて、つながったときに送る。
       突合の鍵は「端末が作ったid（売上）」「会社名（宛先）」。
       ぶつかったら updatedAt が新しい方が勝つ（消したのも“新しい更新”として扱う）。
     =================================================================== */
  function _s(v) {
    return String(v == null ? "" : v);
  }
  // 売上 → DBの行
  function saleToRow(s) {
    return {
      cid: _s(s.id),
      ymd: s.date,
      name: _s(s.name),
      people: Math.floor(Number(s.people) || 0),
      amount: Math.floor(Number(s.amount) || 0),
      pay: _s(s.pay),
      receipt: normalizeReceipt(s.receipt),
      receipt_date: s.receiptDate || null,
      memo: _s(s.memo),
      paid_date: s.paidDate || null,
      staff: _s(s.staff),
      created_at: s.createdAt || null,
      updated_at: s.updatedAt || null,
      deleted_at: s.deletedAt || null,
    };
  }
  // DBの行 → 売上（normalizeSale は updatedAt を今にしてしまうので通さない）
  function saleFromRow(r) {
    return {
      id: _s(r.cid),
      date: _s(r.ymd),
      name: _s(r.name),
      people: Math.floor(Number(r.people) || 0),
      amount: Math.floor(Number(r.amount) || 0),
      pay: _s(r.pay),
      receipt: normalizeReceipt(r.receipt),
      receiptDate: r.receipt_date || null,
      memo: _s(r.memo),
      paidDate: r.paid_date || null,
      staff: _s(r.staff),
      createdAt: r.created_at || "",
      updatedAt: r.updated_at || "",
      deletedAt: r.deleted_at || null,
    };
  }
  function partnerToRow(p) {
    return {
      name: _s(p.name),
      honor: p.honor === "様" ? "様" : "御中",
      person: _s(p.person),
      last_used_at: p.lastUsedAt || null,
      updated_at: p.updatedAt || null,
      deleted_at: p.deletedAt || null,
    };
  }
  function partnerFromRow(r) {
    var name = _s(r.name);
    return {
      name: name,
      to: name, // 宛名は会社名そのまま（昔のデータだけ to を別に持つ）
      honor: r.honor === "様" ? "様" : "御中",
      person: _s(r.person),
      lastUsedAt: r.last_used_at || "",
      updatedAt: r.updated_at || "",
      deletedAt: r.deleted_at || null,
    };
  }

  /**
   * syncPlan(localArr, remoteArr, keyOf)
   *  端末とクラウドを突き合わせて「これが最新」と「これを送る」を出す。
   *  - 片方にしか無い → それが最新（端末だけにある物は送る）
   *  - 両方にある → updatedAt が新しい方が最新。端末が新しければ送る
   *  - 同じ updatedAt → 端末を残す（同じ物なので送らない）
   */
  function syncPlan(localArr, remoteArr, keyOf) {
    var L = {};
    var R = {};
    var keys = [];
    var k;
    (localArr || []).forEach(function (r) {
      k = keyOf(r);
      if (!k) return;
      if (!L[k]) keys.push(k);
      L[k] = r;
    });
    (remoteArr || []).forEach(function (r) {
      k = keyOf(r);
      if (!k) return;
      if (!L[k] && !R[k]) keys.push(k);
      R[k] = r;
    });
    var merged = [];
    var push = [];
    keys.forEach(function (key) {
      var l = L[key];
      var r = R[key];
      if (l && !r) {
        merged.push(l);
        push.push(l);
        return;
      }
      if (!l && r) {
        merged.push(r);
        return;
      }
      if (_s(l.updatedAt) > _s(r.updatedAt)) {
        merged.push(l);
        push.push(l);
      } else {
        merged.push(r);
      }
    });
    return { merged: merged, push: push };
  }
  // 売上の同期計画（鍵＝端末が作ったid）
  function syncPlanSales(localArr, remoteArr) {
    return syncPlan(localArr, remoteArr, function (s) {
      return s && s.id;
    });
  }
  // 宛先の同期計画（鍵＝会社名）。持ち方が { 名前: 宛先 } なので出入りで詰め替える
  function syncPlanPartners(localMap, remoteArr) {
    var localArr = Object.keys(localMap || {}).map(function (k) {
      return (localMap || {})[k];
    });
    var plan = syncPlan(localArr, remoteArr, function (p) {
      return p && p.name;
    });
    var map = {};
    plan.merged.forEach(function (p) {
      map[p.name] = p;
    });
    return { merged: map, push: plan.push };
  }
  // 設定は1アカウント1つ。新しい方が勝つ（同時刻なら端末を残す）
  function syncPlanSettings(localCfg, localAt, remoteCfg, remoteAt) {
    if (!remoteCfg) return { merged: localCfg, push: true };
    if (_s(remoteAt) > _s(localAt)) return { merged: remoteCfg, push: false };
    if (_s(remoteAt) === _s(localAt)) return { merged: localCfg, push: false };
    return { merged: localCfg, push: true };
  }

  /* ===================================================================
     A4のページ分け（1ページに入る行数で切る）
     =================================================================== */
  /**
   * ledgerPages(rows, full, last)
   *  売上帳のページ割り。合計欄は最後のページに載るので、最後のページだけ入る行数が少ない。
   *  full = 合計欄が無いページの行数 / last = 合計欄が載るページの行数
   *  最後のページに合計が入りきらないときは、合計だけの1枚を足す。
   */
  function ledgerPages(rows, full, last) {
    var F = Math.max(1, Math.floor(full || 38));
    var L = Math.max(1, Math.min(F, Math.floor(last || 30)));
    var list = rows || [];
    if (!list.length) return [[]];
    var pages = [];
    var i = 0;
    while (i < list.length) {
      if (list.length - i <= L) {
        pages.push(list.slice(i));
        i = list.length;
      } else {
        pages.push(list.slice(i, i + F));
        i += F;
      }
    }
    if (pages[pages.length - 1].length > L) pages.push([]);
    return pages;
  }

  function paginate(rows, perPage) {
    var n = Math.max(1, Math.floor(perPage || 30));
    var out = [];
    var list = rows || [];
    if (!list.length) return [[]]; // 0件でも1枚は出す（白紙の売上帳）
    for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  }

  return {
    PAY_METHODS: PAY_METHODS,
    PAY_KEYS: PAY_KEYS,
    UNPAID_KEYS: UNPAID_KEYS,
    RECEIPT_STATES: RECEIPT_STATES,
    normalizeReceipt: normalizeReceipt,
    isIssued: isIssued,
    isLater: isLater,
    isNa: isNa,
    receiptChoices: receiptChoices,
    defaultReceipt: defaultReceipt,
    fixReceiptFor: fixReceiptFor,
    receiptMark: receiptMark,
    laterReceipts: laterReceipts,
    receiptNotes: receiptNotes,
    payLabel: payLabel,
    payShort: payShort,
    isUnpaidMethod: isUnpaidMethod,
    toIso: toIso,
    isIsoDate: isIsoDate,
    ymOf: ymOf,
    daysInMonth: daysInMonth,
    rangeOfMonth: rangeOfMonth,
    shiftMonth: shiftMonth,
    mdShort: mdShort,
    jpDate: jpDate,
    jpMonth: jpMonth,
    weekday: weekday,
    comma: comma,
    yen: yen,
    validateSale: validateSale,
    normalizeSale: normalizeSale,
    makeId: makeId,
    filterSales: filterSales,
    sortSales: sortSales,
    summarize: summarize,
    byPayMethod: byPayMethod,
    byReceipt: byReceipt,
    byDay: byDay,
    unpaidSales: unpaidSales,
    unpaidByName: unpaidByName,
    unpaidGroups: unpaidGroups,
    markFirstOfDate: markFirstOfDate,
    nameSuggestions: nameSuggestions,
    normalizePartner: normalizePartner,
    validatePartner: validatePartner,
    invoiceTo: invoiceTo,
    partnerList: partnerList,
    partnerRecent: partnerRecent,
    touchPartner: touchPartner,
    taxIncluded: taxIncluded,
    formatInvoiceNo: formatInvoiceNo,
    nextInvoiceSeq: nextInvoiceSeq,
    invoiceKey: invoiceKey,
    billableNames: billableNames,
    alivePartners: alivePartners,
    saleToRow: saleToRow,
    saleFromRow: saleFromRow,
    partnerToRow: partnerToRow,
    partnerFromRow: partnerFromRow,
    syncPlan: syncPlan,
    syncPlanSales: syncPlanSales,
    syncPlanPartners: syncPlanPartners,
    syncPlanSettings: syncPlanSettings,
    buildInvoice: buildInvoice,
    paginate: paginate,
    ledgerPages: ledgerPages,
  };
});
