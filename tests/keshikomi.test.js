// @vitest-environment node
// ============================================================
// ★入金の消し込み：銀行の入出金明細 CSV の読み★ 2026-11-03（司さん「CSV→候補→人が押す」）
//   守ること：読めない行を 黙って 捨てない（訳ごとに 数える）／出金を 入金に しない／名義の カナを 揃える
//   ★各銀行の 実物の 見出しは 手元に 無い＝推し★（外れたら 画面で 人が 選ぶ）。ここの 見出しは 形の 試し
// ============================================================
import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const K = require("../lib/keshikomi.js");

function sjis(str) {
  // Node の TextEncoder は UTF-8 だけ＝Shift_JIS の バイトを 手で 作る（「日付,入金」）
  const map = { 日: [0x93, 0xfa], 付: [0x95, 0x74], 入: [0x93, 0xfc], 金: [0x8b, 0xe0] };
  const out = [];
  for (const c of str) {
    if (map[c]) out.push(...map[c]);
    else out.push(c.charCodeAt(0));
  }
  return new Uint8Array(out);
}

describe("文字コード", () => {
  it("UTF-8 は UTF-8 で読む", () => {
    const r = K.mojiYomu(new TextEncoder().encode("日付,入金\n"));
    expect(r.code).toBe("UTF-8");
    expect(r.text).toBe("日付,入金\n");
  });
  it("Shift_JIS は Shift_JIS で読む", () => {
    const r = K.mojiYomu(sjis("日付,入金\n"));
    expect(r.code).toBe("Shift_JIS");
    expect(r.text).toBe("日付,入金\n");
  });
});

describe("CSV", () => {
  it('引用符の中のカンマ・改行・""・BOM・CRLF', () => {
    const rows = K.csvYomu('﻿a,"b,c","d\r\ne","f""g"\r\n1,2,3,4\r\n');
    expect(rows.length).toBe(2);
    expect(rows[0].slice()).toEqual(["a", "b,c", "d\r\ne", 'f"g']);
    expect(rows[1].slice()).toEqual(["1", "2", "3", "4"]);
  });
  it("行番号はファイルの物理の行（空行と引用符の中の改行も数える）", () => {
    const rows = K.csvYomu('a,b\n\n"x\ny",1\n\nz,2\n');
    expect(rows.map((r) => r.gyou)).toEqual([1, 3, 6]);
  });
});

describe("日付", () => {
  it.each([
    ["2026/11/03", "2026-11-03"],
    ["2026-1-5", "2026-01-05"],
    ["2026年11月3日", "2026-11-03"],
    ["20261103", "2026-11-03"],
    ["R8.11.3", "2026-11-03"],
    ["令和8年11月3日", "2026-11-03"],
    ["令和元年5月1日", "2019-05-01"],
    ["２０２６／１１／０３", "2026-11-03"],
  ])("%s → %s", (a, b) => expect(K.hizukeYomu(a)).toBe(b));
  it.each(["2026/2/30", "11/03", "", "abc"])("読めない %s は空", (a) =>
    expect(K.hizukeYomu(a)).toBe("")
  );
});

describe("額", () => {
  it("カンマ・円・¥・全角", () => {
    expect(K.gakuYomu("1,234")).toBe(1234);
    expect(K.gakuYomu("¥5,000")).toBe(5000);
    expect(K.gakuYomu("1234円")).toBe(1234);
    expect(K.gakuYomu("１２，３４５")).toBe(12345);
  });
  it("空は null（0 と作り分ける）・数でない物は NaN（捨てずに数える）", () => {
    expect(K.gakuYomu("")).toBe(null);
    expect(K.gakuYomu("0")).toBe(0);
    expect(K.gakuYomu("△1,000")).toBeNaN();
    expect(K.gakuYomu("abc")).toBeNaN();
  });
});

describe("名義のカナ", () => {
  it.each([
    ["ﾌﾘｺﾐ ｶ)ﾔﾏﾀﾞｹﾝｾﾂ", "ヤマダケンセツ"],
    ["ﾔﾏﾀﾞｹﾝｾﾂ(ｶ", "ヤマダケンセツ"],
    ["ﾔﾏﾀﾞ(ｶ)ｹﾝｾﾂ", "ヤマダケンセツ"],
    ["ｼﾔ)ﾌｸｼﾉｶｲ", "フクシノカイ"],
    ["ﾕ)ﾀﾅｶ ｼｮｳﾃﾝ", "タナカシヨウテン"],
    ["やまだ　けんせつ", "ヤマダケンセツ"],
    ["カブシキガイシャヤマダ", "ヤマダ"],
  ])("%s → %s", (a, b) => expect(K.kanaSeiki(a)).toBe(b));
  it("長音は消さない（コーヒー と コヒ を重ねない）", () => {
    expect(K.kanaSeiki("ｺｰﾋｰﾔ")).toBe("コーヒーヤ");
    expect(K.kanaSeiki("ｺｰﾋｰﾔ")).not.toBe(K.kanaSeiki("ｺﾋﾔ"));
  });
});

describe("見出しと入金の行", () => {
  it("先頭に口座の行がある形：見出しを探す・出金の行と読めない日を数える", () => {
    const rows = K.csvYomu(
      "口座,123\r\n日付,摘要,お引出金額,お預り金額,残高\r\n" +
        '2026/11/01,"ﾌﾘｺﾐ ｶ)ﾔﾏﾀﾞ",,"55,000",100\r\n' +
        "2026/11/02,ATM,3000,,97\r\n" +
        "xx,ﾌﾘｺﾐ,,10,1\r\n"
    );
    const m = K.midashiSagasu(rows);
    expect(m.gyou).toBe(1);
    const r = K.nyukinNukidasu(rows, m.gyou + 1, m.retsu);
    expect(r.nyukin).toEqual([{ gyou: 3, hi: "2026-11-01", gaku: 55000, meigi: "ﾌﾘｺﾐ ｶ)ﾔﾏﾀﾞ" }]);
    expect(r.otosu.shukkin).toBe(1);
    expect(r.otosu.hizuke).toEqual([5]);
  });
  it("名義の列は「摘要内容」を「摘要」より先に推す", () => {
    const rows = K.csvYomu(
      "日付,摘要,摘要内容,支払い金額,預かり金額\n2026/11/01,振込１,ｶ)ﾔﾏﾀﾞ,,55000\n"
    );
    const m = K.midashiSagasu(rows);
    expect(m.retsu.meigi).toBe(2);
    expect(m.retsu.nyukin).toBe(4);
  });
  it("「金額」＋「入払区分」の形：出金の行を入金にしない", () => {
    const rows = K.csvYomu(
      "年月日,お取り扱い内容,金額,入払区分\n2026/11/01,ﾔﾏﾀﾞ,10000,出金\n2026/11/02,ﾔﾏﾀﾞ,20000,入金\n"
    );
    const m = K.midashiSagasu(rows);
    expect(m.retsu.kubun).toBe(3);
    const r = K.nyukinNukidasu(rows, m.gyou + 1, m.retsu);
    expect(r.nyukin.map((x) => x.gaku)).toEqual([20000]);
    expect(r.otosu.shukkin).toBe(1);
  });
  it("欄が足りない行・数でない額は数えて返す（黙って捨てない）", () => {
    const rows = K.csvYomu("日付,入金,摘要\n2026/11/01\n2026/11/02,abc,X\n2026/11/03,1.5,Y\n");
    const m = K.midashiSagasu(rows);
    const r = K.nyukinNukidasu(rows, m.gyou + 1, m.retsu);
    expect(r.nyukin).toEqual([]);
    expect(r.otosu.retsu).toEqual([2]);
    expect(r.otosu.gaku).toEqual([3, 4]);
  });
  it("列が選ばれていない時はエラー", () => {
    const r = K.nyukinNukidasu([["a"]], 0, {
      hi: -1,
      nyukin: -1,
      kingaku: -1,
      kubun: -1,
      meigi: -1,
    });
    expect(r.err).not.toBe("");
  });
});

describe("候補（司さんの決め 11-03）", () => {
  const ny = (gaku, meigi = "ﾌﾘｺﾐ ｶ)ﾔﾏﾀﾞｹﾝｾﾂ", hi = "2026-11-02") => ({ gaku, meigi, hi });
  const yamada = (o = {}) => ({
    name: "山田建設",
    meigi: ["ﾔﾏﾀﾞｹﾝｾﾂ"],
    mitsuki: [
      { month: "2026-09", zan: 10000 },
      { month: "2026-10", zan: 20000 },
    ],
    ...o,
  });
  it("ぴったり（1か月）", () => {
    const k = K.kohoTsukuru(ny(20000), [yamada()]);
    expect(k[0]).toMatchObject({ co: "山田建設", kind: "pittari", meigiAtari: true });
    expect(k[0].ate).toEqual([{ month: "2026-10", gaku: 20000, tesuryo: 0 }]);
  });
  it("差（先方持ち＝入った額だけ）・差は実額", () => {
    const k = K.kohoTsukuru(ny(19780), [yamada()]);
    expect(k[0]).toMatchObject({ kind: "sa", sa: 220 });
    expect(k[0].ate).toEqual([{ month: "2026-10", gaku: 19780, tesuryo: 0 }]);
  });
  it("差（こちら持ち＝差を手数料として消す）", () => {
    const k = K.kohoTsukuru(ny(19010), [yamada({ kochira: true })]);
    expect(k[0]).toMatchObject({ kind: "sa", sa: 990 });
    expect(k[0].ate).toEqual([{ month: "2026-10", gaku: 20000, tesuryo: 990 }]);
  });
  it("差が 1,100円を超えたら差の候補にしない", () => {
    const k = K.kohoTsukuru(ny(18899), [yamada()]);
    expect(k.some((x) => x.kind === "sa")).toBe(false);
  });
  it("まとめ（古い月から2か月）", () => {
    const k = K.kohoTsukuru(ny(30000), [yamada()]);
    expect(k[0].kind).toBe("matome");
    expect(k[0].ate).toEqual([
      { month: "2026-09", gaku: 10000, tesuryo: 0 },
      { month: "2026-10", gaku: 20000, tesuryo: 0 },
    ]);
  });
  it("まとめ＋差（こちら持ち）＝差は最後の月", () => {
    const k = K.kohoTsukuru(ny(29560), [yamada({ kochira: true })]);
    expect(k[0]).toMatchObject({ kind: "matome", sa: 440 });
    expect(k[0].ate).toEqual([
      { month: "2026-09", gaku: 10000, tesuryo: 0 },
      { month: "2026-10", gaku: 20000, tesuryo: 440 },
    ]);
  });
  it("一部（古い月から当てて最後が一部）：9月 10,000＋10月 20,000 に 15,000", () => {
    const k = K.kohoTsukuru(ny(15000), [yamada()]);
    expect(k[0].kind).toBe("ichibu");
    expect(k[0].ate).toEqual([
      { month: "2026-09", gaku: 10000, tesuryo: 0 },
      { month: "2026-10", gaku: 5000, tesuryo: 0 },
    ]);
  });
  it("多い＝当て方を出さない", () => {
    const k = K.kohoTsukuru(ny(40000), [yamada()]);
    expect(k[0]).toMatchObject({ kind: "oosugi", oosugi: 10000, ate: [] });
  });
  it("繰越の会社＝月で割らず、当たった請求書の月の行へ全額", () => {
    const c = yamada({
      carryover: true,
      mitsuki: [
        { month: "2026-09", zan: 10000 },
        { month: "2026-10", zan: 30000 },
      ],
    });
    expect(K.kohoTsukuru(ny(30000), [c])[0].ate).toEqual([
      { month: "2026-10", gaku: 30000, tesuryo: 0 },
    ]);
    // 一部＝一番古い未入金の月の行
    expect(K.kohoTsukuru(ny(15000), [c])[0]).toMatchObject({
      kind: "ichibu",
      ate: [{ month: "2026-09", gaku: 15000, tesuryo: 0 }],
    });
  });
  it("名義が当たらない会社は、ぴったりと差だけ（一部・まとめは出さない）", () => {
    const k = K.kohoTsukuru(ny(15000, "ｽｽﾞｷ"), [yamada()]);
    expect(k).toEqual([]);
    const k2 = K.kohoTsukuru(ny(20000, "ｽｽﾞｷ"), [yamada()]);
    expect(k2[0]).toMatchObject({ kind: "pittari", meigiAtari: false });
  });
  it("並び：名義と額が当たる会社 ＞ 額だけ当たる会社", () => {
    const other = {
      name: "鈴木",
      meigi: ["ｽｽﾞｷｼｮｳｼﾞ"],
      mitsuki: [{ month: "2026-08", zan: 20000 }],
    };
    const k = K.kohoTsukuru(ny(20000), [other, yamada()]);
    expect(k.map((x) => x.co)).toEqual(["山田建設", "鈴木"]);
  });
  it("短い名義（4字未満）は当てない", () => {
    expect(K.meigiAtaru({ meigi: ["ﾔﾏﾀﾞ"] }, "ﾔﾏﾀﾞｺｳｷﾞｮｳ")).toBe(false);
  });
});

describe("二重の見分け", () => {
  const n = { hi: "2026-11-02", gaku: 20000, meigi: "ﾔﾏﾀﾞｹﾝｾﾂ" };
  it("同じ src＝記録済み", () => {
    const r = K.nijuu(n, [
      { month: "2026-10", gaku: 20000, hi: "2026-11-02", src: K.srcTsukuru(n) },
    ]);
    expect(r.zumi.length).toBe(1);
    expect(r.kamo.length).toBe(0);
  });
  it("src 無し・同じ額・前後7日＝記録済みかも／8日離れたら出さない", () => {
    expect(K.nijuu(n, [{ gaku: 20000, hi: "2026-11-09" }]).kamo.length).toBe(1);
    expect(K.nijuu(n, [{ gaku: 20000, hi: "2026-11-10" }]).kamo.length).toBe(0);
  });
  it("こちら持ちで消した回（額＝入った額＋手数料）も見分ける", () => {
    expect(K.nijuu(n, [{ gaku: 20440, tesuryo: 440, hi: "2026-11-02" }]).kamo.length).toBe(1);
  });
});

describe("二重の見分け（本番前 taiketsu 止1・注1・注2）", () => {
  const n = { hi: "2026-11-02", gaku: 20000, meigi: "ﾔﾏﾀﾞｹﾝｾﾂ" };
  it("止1：名義の列が違う形で読んだ同じ入金（src が違う）も「記録済みかも」", () => {
    const e = {
      month: "2026-10",
      gaku: 20000,
      hi: "2026-11-02",
      src: K.srcTsukuru({ ...n, meigi: "ﾔﾏﾀﾞｹﾝｾﾂ ｼﾃﾝ" }),
    };
    expect(K.nijuu(n, [e]).kamo.length).toBe(1);
  });
  it("止1：日付の列が違う形（2日ずれ）も「記録済みかも」", () => {
    const e = {
      month: "2026-10",
      gaku: 20000,
      hi: "2026-11-04",
      src: K.srcTsukuru({ ...n, hi: "2026-11-04" }),
    };
    expect(K.nijuu(n, [e]).kamo.length).toBe(1);
  });
  it("注1：同じ日・同じ額・同じ名義の2本目は src が別（何本目かを付ける）", () => {
    expect(K.srcTsukuru(n, 1)).not.toBe(K.srcTsukuru(n, 2));
    // 1本目は前の形のまま（もう記録した回と合う）
    expect(K.srcTsukuru(n, 1)).toBe(K.srcTsukuru(n));
    const e1 = { gaku: 20000, hi: "2026-11-02", src: K.srcTsukuru(n, 1) };
    const r2 = K.nijuu(n, [e1], 2);
    expect(r2.zumi.length).toBe(0);
    expect(r2.kamo.length).toBe(1); // 同じ額・同じ日＝「かも」は出す（押せる）
  });
  it("注2：まとめ入金で割った回（同じ日の合計）と、手数料の消えた回も「記録済みかも」", () => {
    const wari = [
      { month: "2026-09", gaku: 10000, hi: "2026-11-02" },
      { month: "2026-10", gaku: 20000, hi: "2026-11-02" },
    ];
    expect(K.nijuu({ ...n, gaku: 30000 }, wari).kamo.length).toBe(2);
    // 手数料の 鍵が 古い 画面で 落ちた 回（20,660）＝入金 20,000 と 差 660 が 1〜1,100円
    expect(K.nijuu(n, [{ month: "2026-10", gaku: 20660, hi: "2026-11-02" }]).kamo.length).toBe(1);
  });
  it("別の入金（額が違う・8日以上離れた）は出さない", () => {
    expect(K.nijuu(n, [{ gaku: 25000, hi: "2026-11-02" }]).kamo.length).toBe(0);
    expect(K.nijuu(n, [{ gaku: 20000, hi: "2026-11-10" }]).kamo.length).toBe(0);
  });
});

describe("途中まで記録した行の二重の見分け（再叩き 注1）", () => {
  it("比べる額を残りにして見る（src が同じ回は「かも」に入れない）", () => {
    const n = { hi: "2026-11-02", gaku: 30000, meigi: "ﾔﾏﾀﾞｹﾝｾﾂ" };
    const src = K.srcTsukuru(n);
    const kiroku = [
      { month: "2026-09", gaku: 10000, hi: "2026-11-02", src },
      { month: "2026-10", gaku: 20000, hi: "2026-11-03" }, // 人が 全入金で 閉じた（src 無し）
    ];
    const r = K.nijuu(n, kiroku, 1, 20000);
    expect(r.kamo.map((e) => e.month)).toEqual(["2026-10"]);
    expect(r.zumi.length).toBe(1);
  });
});

describe("まとめ入金の最後の月がマイナスにならない（本番前 taiketsu 2回目 止1）", () => {
  const c = (o = {}) => ({
    name: "山田建設",
    meigi: ["ﾔﾏﾀﾞｹﾝｾﾂ"],
    mitsuki: [
      { month: "2026-09", zan: 10000 },
      { month: "2026-10", zan: 500 },
    ],
    ...o,
  });
  const ny = (gaku) => ({ gaku, meigi: "ﾔﾏﾀﾞｹﾝｾﾂ", hi: "2026-11-02" });
  it("差が最後の月の残以上なら、まとめを出さない（先方持ち・こちら持ち）", () => {
    for (const kochira of [false, true]) {
      const k = K.kohoTsukuru(ny(9700), [c({ kochira })]);
      expect(k.some((x) => x.kind === "matome")).toBe(false);
      for (const x of k) for (const a of x.ate) expect(a.gaku).toBeGreaterThan(0);
    }
  });
  it("どの候補も、当てる額は全部 1円以上・手数料は当てる額以下", () => {
    for (let g = 9000; g <= 10600; g += 50) {
      for (const kochira of [false, true]) {
        for (const x of K.kohoTsukuru(ny(g), [c({ kochira })])) {
          for (const a of x.ate) {
            expect(a.gaku).toBeGreaterThan(0);
            expect(a.tesuryo).toBeLessThanOrEqual(a.gaku);
          }
        }
      }
    }
  });
});
