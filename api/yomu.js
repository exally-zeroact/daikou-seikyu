// ============================================================
// ★外から読むだけの口（①）★ 2026-11-03（司さん 11-02「外へ数を出す口＝読むだけ」）
//   GET /api/yomu?hyo=meisai|seikyu|nyukin|kaisha[&kara=YYYY-MM][&made=YYYY-MM][&kaisha=会社名][&kata=json|csv]
//     2026-11-13 ⑥：明細は kara/made に YYYY-MM-DD も・kaisha（完全一致・無い名前は 400＋在る名前）
//     倉庫を 読む 所は lib/yomu-kura.js（MCP の口 api/mcp.js と 共有）
//   鍵＝Authorization: Bearer <鍵>（正）／?token=<鍵>（見出しを付けられない道具・Excel 用。URL の鍵は記録に残る）
//   ★書く道は無い★ GET 以外は 405。
//   ★額は 画面と 同じ 関数★（lib/yomu-kuchi.js → meisai-engine.js・lib/nyukin-kai.js）。倉庫は 生の 行を 返す だけ
//   ★失敗を 200 に しない★ 鍵なし/違う/止めた 401・知らない 表/形 400・倉庫 502・大きすぎ 413。
//   ★倉庫へは POST・鍵は body★（URL に 載せない＝倉庫の 記録に 残さない）。客の Authorization は 倉庫へ 回さない。
// ============================================================
const YomuKuchi = require("../lib/yomu-kuchi.js");

const { UUID_RE, yomuMoto } = require("../lib/yomu-kura.js");
const OOKISA_MAX = 4 * 1024 * 1024; // Vercel の 答えの 上限 4.5MB の 手前＝黙って 切らせない

function kagiYomu(req, q) {
  const h = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || "");
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  const k = m ? m[1] : String(q.token || "");
  return UUID_RE.test(k) ? k : null;
}

function dasu(res, status, kata, obj, csv) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (kata === "csv" && csv != null) {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(status).send(csv);
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).send(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const kata = q.kata == null || q.kata === "" ? "json" : String(q.kata);
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return dasu(res, 405, "json", { error: "読むだけの口です（GET だけ）" });
    }
    if (kata !== "json" && kata !== "csv")
      return dasu(res, 400, "json", { error: "kata は json か csv" });
    const hyo = String(q.hyo || "");
    if (YomuKuchi.HYO.indexOf(hyo) < 0)
      return dasu(res, 400, "json", {
        error: "hyo は " + YomuKuchi.HYO.join(" / ") + " のどれか",
      });
    const kagi = kagiYomu(req, q);
    if (!kagi) return dasu(res, 401, "json", { error: "鍵がありません（形が違います）" });

    // 倉庫を 読む 所は lib/yomu-kura.js の 1本（MCP の口と 共有）
    const k = await yomuMoto(kagi);
    if (k.status !== 200) return dasu(res, k.status, "json", { error: k.error });
    const body = k.moto;

    const t = YomuKuchi.tsukuru(
      body,
      hyo,
      q.kara ? String(q.kara) : "",
      q.made ? String(q.made) : "",
      // ★配列（?kaisha= を 2回）は そのまま 渡して 400＝String で "a,b" に して 0行に しない★
      q.kaisha == null || q.kaisha === "" ? null : q.kaisha
    );
    if (t.error) return dasu(res, t.status || 400, "json", { error: t.error });

    const gyo = t.gyo.map((g) => {
      const o = {};
      t.midashi.forEach((k, i) => (o[k] = g[i]));
      return o;
    });
    const out = {
      hyo: t.hyo,
      kensu: gyo.length,
      kara: q.kara || null,
      made: q.made || null,
      kaisha: q.kaisha || null,
      tsukutta: new Date().toISOString(),
      setsumei: t.setsumei,
      gyo: gyo,
    };
    const csv = kata === "csv" ? YomuKuchi.csvKaku(t.midashi, t.gyo) : null;
    const ookisa = Buffer.byteLength(csv != null ? csv : JSON.stringify(out), "utf8");
    if (ookisa > OOKISA_MAX)
      return dasu(res, 413, "json", {
        error: "大きすぎます（" + ookisa + " バイト）。kara/made で月を絞ってください",
      });
    return dasu(res, 200, kata, out, csv);
  } catch (e) {
    return dasu(res, 500, "json", { error: "口の中で失敗しました" });
  }
};
