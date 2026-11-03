// ============================================================
// ★外から読むだけの口（①）★ 2026-11-03（司さん 11-02「外へ数を出す口＝読むだけ」）
//   GET /api/yomu?hyo=meisai|seikyu|nyukin|kaisha[&kara=YYYY-MM][&made=YYYY-MM][&kata=json|csv]
//   鍵＝Authorization: Bearer <鍵>（正）／?token=<鍵>（見出しを付けられない道具・Excel 用。URL の鍵は記録に残る）
//   ★書く道は無い★ GET 以外は 405。
//   ★額は 画面と 同じ 関数★（lib/yomu-kuchi.js → meisai-engine.js・lib/nyukin-kai.js）。倉庫は 生の 行を 返す だけ
//   ★失敗を 200 に しない★ 鍵なし/違う/止めた 401・知らない 表/形 400・倉庫 502・大きすぎ 413。
//   ★倉庫へは POST・鍵は body★（URL に 載せない＝倉庫の 記録に 残さない）。客の Authorization は 倉庫へ 回さない。
// ============================================================
const YomuKuchi = require("../lib/yomu-kuchi.js");

const SUPABASE_URL = "https://tnfwipbgfgjaymlszeid.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/yomu_moto", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: "Bearer " + SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: kagi }),
    });
    let body = null;
    try {
      body = await r.json();
    } catch (_) {
      body = null;
    }
    // ★状態の 番号で 判じない★ 鍵なしは 倉庫の 本文の code 28000（PostgREST は 403 で 返す 見立て）
    if (body && typeof body === "object" && !Array.isArray(body) && body.code === "28000")
      return dasu(res, 401, "json", { error: "鍵が違うか、止められています" });
    if (!r.ok || !body || typeof body !== "object" || Array.isArray(body) || !body.meisai)
      return dasu(res, 502, "json", { error: "倉庫を読めませんでした（" + r.status + "）" });

    const t = YomuKuchi.tsukuru(
      body,
      hyo,
      q.kara ? String(q.kara) : "",
      q.made ? String(q.made) : ""
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
