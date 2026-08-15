// @vitest-environment node
// ============================================================
// ★番号を凍結しても 今の番号が1つも変わらない★ 2026-08-11
//
//   ★司さんの答え（2026-08-11）★
//     「そんなもんすってないわ」＝★請求番号は紙に刷っていない★
//     実データでも確認：本番の showInvoiceNo = false
//     ⇒ 番号は お客さんに1度も渡っていない＝ずれていた事の実害はゼロ
//     ⇒ B は ★今の並びのまま凍結して完了★（過去のPDFから台帳を作る作業は要らない）
//
//   ★ここで確かめる事★
//     台帳に入れて凍結した後も、★今 画面に出ている番号と1つも違わない★。
//     （凍結した瞬間に番号が動いたら、それこそ事故）
//
//   ★測り方★
//     ・本番から写した ★実物の会社の並び（22社・DBが返す順）★ と
//       ★実物の請求の組（113通）★ を使う
//     ・番号を出すのは ★本番と同じ関数★（meisai-engine.js の invoiceNoFor）を呼ぶ
//       ＝自前で計算し直さない（自分の答えと突き合わせても意味が無い）
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ★本番から写した実物（2026-08-11 実測）★ DBが返す順そのまま＝アプリが番号を振る順
const HONBAN_KAISHA = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "honban-companies.json"), "utf8")
);
const HONBAN_PAIRS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "honban-invoice-pairs.json"), "utf8")
);

// ★本番と同じ関数を読む（自前で書き直さない）★
//   meisai-engine.js は module.exports で出しているので そのまま require する。
import { createRequire } from "node:module";
const Engine = createRequire(import.meta.url)(path.join(ROOT, "meisai-engine.js"));

const ACCT = "u_honban";
function masterOf(names) {
  const m = {};
  for (const n of names) m[n] = { account_id: ACCT, items: [], widths: {}, aligns: {} };
  return m;
}
const MASTER = masterOf(HONBAN_KAISHA);
const DB = HONBAN_PAIRS.map((p) => ({
  account_id: ACCT,
  会社名: p.company,
  日付: p.tsuki + "-01",
}));

// 台帳（凍結）を真似る：一度 決めた番号を返し、無ければ本番と同じ計算
function frozenNo(ledger, month, co) {
  const k = month + "|" + co;
  if (ledger[k]) return ledger[k];
  return Engine.invoiceNoFor(MASTER, ACCT, month, co, DB);
}

describe("★番号の凍結★", () => {
  it("本番の実物を読めている（22社 / 113通）", () => {
    expect(HONBAN_KAISHA.length).toBe(22);
    expect(HONBAN_PAIRS.length).toBe(113);
    expect(typeof Engine.invoiceNoFor, "本番の関数が読めていない").toBe("function");
  });

  it("★凍結した後も 113通の番号が1つも変わらない★", () => {
    // 凍結する前の番号（＝今 画面に出ている物）
    const mae = HONBAN_PAIRS.map((p) => frozenNo({}, p.tsuki, p.company));
    // その番号を台帳に入れて凍結
    const ledger = {};
    HONBAN_PAIRS.forEach((p, i) => {
      ledger[p.tsuki + "|" + p.company] = mae[i];
    });
    // 凍結した後の番号
    const ato = HONBAN_PAIRS.map((p) => frozenNo(ledger, p.tsuki, p.company));

    const chigau = HONBAN_PAIRS.map((p, i) => ({ p, mae: mae[i], ato: ato[i] })).filter(
      (x) => x.mae !== x.ato
    );
    expect(
      chigau.map((x) => `${x.p.tsuki} ${x.p.company}: ${x.mae} → ${x.ato}`),
      "★凍結で番号が動いた★"
    ).toEqual([]);
  });

  it("★凍結が効いている（会社を1社 足しても番号が動かない）★", () => {
    // 先に凍結
    const ledger = {};
    HONBAN_PAIRS.forEach((p) => {
      ledger[p.tsuki + "|" + p.company] = frozenNo({}, p.tsuki, p.company);
    });
    const mae = HONBAN_PAIRS.map((p) => ledger[p.tsuki + "|" + p.company]);

    // ★先頭に会社を1社 足す＝計算し直すと 後ろの会社は必ずずれる★
    const M2 = masterOf(["＿先頭に入る会社", ...HONBAN_KAISHA]);
    const keisan = HONBAN_PAIRS.map((p) => Engine.invoiceNoFor(M2, ACCT, p.tsuki, p.company, DB));
    const ugoita = keisan.filter((n, i) => n !== mae[i]).length;
    // この試験に効き目が在るか（動かないなら 何も見ていない）
    expect(ugoita, "★会社を足しても1通も動かない＝この試験は何も見ていない★").toBeGreaterThan(100);

    // 台帳から出せば 動かない
    const ato = HONBAN_PAIRS.map((p) => frozenNo(ledger, p.tsuki, p.company));
    expect(ato, "★凍結したのに番号が動いた★").toEqual(mae);
  });
});
