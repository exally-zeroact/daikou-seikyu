// ============================================================
// ★MCP の口（⑥ 事務所が 自分の AI から 言葉で 訊ける）★ 2026-11-13（設計 sekkei_6_kotoba v1.2）
//   POST /mcp（vercel.json で /api/mcp へ）。①の 読むだけの口（api/yomu.js）と 同じ 中身を MCP の 形で 出す。
//   ★うちは AI を 呼ばない★（客の Claude が 呼びに 来る＝AI の 鍵も お金も 要らない）。★書く tool は 0本★。
//   形＝stateless の Streamable HTTP：POST に application/json で 1つ 返す（SSE・Mcp-Session-Id は 出さない）。
//     借り物（mcp-handler・SDK＝66MB・106包み）は 入れない＝使う 所が これだけの 為。
//   鍵＝①と 同じ UUID を ★Authorization: Bearer だけ★（?token は 受けない＝URL に 鍵を 載せない）。
//     繋ぐ 時（initialize）に 倉庫の kagi_aru で 確かめる＝true の 時だけ 通す（違う 401・読めない 502）。
//   ★額は ①と 同じ★：倉庫＝lib/yomu-kura.js・表＝lib/yomu-kuchi.js の tsukuru（写しを 作らない）。
//   ★黙って 切らない★：答えの 字が 24,000 バイトを 越えたら 切らずに isError で「絞って」（Claude Code は
//     既定 25,000 トークンで 切る・トークン数 ≤ バイト数＝上の 限り）。
//   ★未入金・残額は 出さない★（画面の 入金タブの 当て方は まだ lib に 無い＝件B）。tool の 説明で 明言する。
// ============================================================
"use strict";
const YomuKuchi = require("../lib/yomu-kuchi.js");
const { UUID_RE, yomuMoto, kagiAru } = require("../lib/yomu-kura.js");

const BAN = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]; // 話せる 版（先頭＝一番 新しい）
const MON_BYTES = 24000;

const MINYUKIN_CHUI =
  "★未入金・残額・繰越の後の請求額は、この口では出しません★。seikyu の今月分から nyukin の入金額を引いた値は、" +
  "繰越を使う会社や月をまたぐ入金では、請求書アプリの入金タブの未入金・残額と違います。" +
  "未入金・残額を訊かれたら、引き算で答えずに「請求書アプリの入金タブを見てください」と伝えてください。";

const TOOL = {
  name: "yomu_hyo",
  title: "代行請求の表を読む",
  description:
    "代行請求書アプリ（ダイコメ請求書）の表を読むだけ（書く道はありません）。額は画面と同じ式で出します。" +
    "表（hyo）：meisai＝" +
    "明細。seikyu＝月×会社の請求（今月分は税込）。nyukin＝記録した入金（1回1行）。kaisha＝会社。" +
    "kara/made は YYYY-MM（明細だけ YYYY-MM-DD も）。kaisha は会社名の完全一致（違えば在る名前が返ります）。" +
    "答えが大きすぎる時は切らずにエラーで返すので、月・日・会社で絞って訊き直してください。" +
    MINYUKIN_CHUI,
  inputSchema: {
    type: "object",
    properties: {
      hyo: {
        type: "string",
        enum: YomuKuchi.HYO.slice(),
        description: "表の名前（meisai＝明細／seikyu＝請求／nyukin＝入金／kaisha＝会社）",
      },
      kara: { type: "string", description: "この月（明細は日も）から。YYYY-MM か YYYY-MM-DD" },
      made: { type: "string", description: "この月（明細は日も）まで。YYYY-MM か YYYY-MM-DD" },
      kaisha: { type: "string", description: "会社名（完全一致）" },
    },
    required: ["hyo"],
    additionalProperties: false,
  },
  annotations: {
    title: "代行請求の表を読む",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

function dasu(res, status, obj, more) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  Object.keys(more || {}).forEach((k) => res.setHeader(k, more[k]));
  if (obj == null) return res.status(status).send("");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).send(JSON.stringify(obj));
}
function kotae(id, result) {
  return { jsonrpc: "2.0", id: id, result: result };
}
function ayamari(id, code, message) {
  return { jsonrpc: "2.0", id: id == null ? null : id, error: { code: code, message: message } };
}
function kagiNai(res, id, msg) {
  return dasu(res, 401, ayamari(id, -32001, msg), {
    "WWW-Authenticate": 'Bearer realm="daikou-seikyu", error="invalid_token"',
  });
}
function toolNoAyamari(text) {
  return { content: [{ type: "text", text: text }], isError: true };
}

// ★本文は 自分で 読む★ Vercel の req.body は 壊れた JSON で 読む 時に 投げる＝500 に 落とさず -32700
function honbunYomu(req) {
  let b;
  try {
    b = req.body;
  } catch (_) {
    return { ng: true };
  }
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") {
    try {
      return { v: JSON.parse(b) };
    } catch (_) {
      return { ng: true };
    }
  }
  if (b == null) return { ng: true };
  return { v: b };
}

function kagiYomu(req) {
  const h = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || "");
  const m = /^Bearer\s+(\S+)\s*$/i.exec(h);
  return m && UUID_RE.test(m[1]) ? m[1] : null;
}

async function toolYobu(kagi, args) {
  const a = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const hyo = typeof a.hyo === "string" ? a.hyo : "";
  if (YomuKuchi.HYO.indexOf(hyo) < 0)
    return { kekka: toolNoAyamari("hyo は " + YomuKuchi.HYO.join(" / ") + " のどれか") };
  const mojiKa = (v) => v == null || v === "" || typeof v === "string";
  if (!mojiKa(a.kara) || !mojiKa(a.made) || !mojiKa(a.kaisha))
    return { kekka: toolNoAyamari("kara・made・kaisha は 字で") };
  const k = await yomuMoto(kagi);
  if (k.status === 401) return { kagiNai: k.error };
  if (k.status !== 200) return { kekka: toolNoAyamari(k.error) };
  const t = YomuKuchi.tsukuru(k.moto, hyo, a.kara || "", a.made || "", a.kaisha || null);
  if (t.error) return { kekka: toolNoAyamari(t.error) };
  const text = JSON.stringify({
    hyo: t.hyo,
    kensu: t.gyo.length,
    kara: a.kara || null,
    made: a.made || null,
    kaisha: a.kaisha || null,
    tsukutta: new Date().toISOString(),
    setsumei: t.setsumei,
    chui: MINYUKIN_CHUI,
    midashi: t.midashi,
    gyo: t.gyo,
  });
  const ookisa = Buffer.byteLength(text, "utf8");
  if (ookisa > MON_BYTES)
    return {
      kekka: toolNoAyamari(
        "大きすぎるので出していません（" +
          t.gyo.length +
          "件・" +
          ookisa +
          "バイト・上限 " +
          MON_BYTES +
          "）。kara/made（明細は日も）か kaisha で絞って訊き直してください"
      ),
    };
  return { kekka: { content: [{ type: "text", text: text }] } };
}

module.exports = async (req, res) => {
  let id = null;
  try {
    if (req.method !== "POST") {
      // SSE の 流れは 出さない（仕様＝GET に SSE を 出さない 口は 405）
      return dasu(res, 405, ayamari(null, -32000, "POST だけの口です"), { Allow: "POST" });
    }
    const hb = honbunYomu(req);
    if (hb.ng) return dasu(res, 400, ayamari(null, -32700, "本文が JSON ではありません"));
    const m = hb.v;
    if (Array.isArray(m) || !m || typeof m !== "object" || m.jsonrpc !== "2.0")
      return dasu(res, 400, ayamari(null, -32600, "JSON-RPC 2.0 の 1つの要求で送ってください"));
    id = m.id === undefined ? null : m.id;
    const kagi = kagiYomu(req);
    if (!kagi) return kagiNai(res, id, "鍵がありません（Authorization: Bearer <鍵>）");

    // 知らせ（id が 無い）＝答えない
    if (m.id === undefined) {
      if (typeof m.method === "string" && m.method.indexOf("notifications/") === 0)
        return dasu(res, 202, null);
      return dasu(res, 400, ayamari(null, -32600, "id がありません"));
    }
    if (m.method === "initialize") {
      const aru = await kagiAru(kagi);
      if (aru === false) return kagiNai(res, id, "鍵が違うか、止められています");
      if (aru !== true) return dasu(res, 502, ayamari(id, -32002, "倉庫を読めませんでした"));
      const p = m.params && m.params.protocolVersion;
      return dasu(
        res,
        200,
        kotae(id, {
          protocolVersion: BAN.indexOf(p) >= 0 ? p : BAN[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "daikou-seikyu",
            title: "ダイコメ請求書（読むだけ）",
            version: "1.0.0",
          },
          instructions: "代行請求書の表を読むだけの口です。" + MINYUKIN_CHUI,
        })
      );
    }
    if (m.method === "ping") return dasu(res, 200, kotae(id, {}));
    if (m.method === "tools/list") return dasu(res, 200, kotae(id, { tools: [TOOL] }));
    if (m.method === "tools/call") {
      const p = m.params || {};
      if (p.name !== TOOL.name)
        return dasu(res, 200, ayamari(id, -32602, "知らない tool です（" + p.name + "）"));
      const r = await toolYobu(kagi, p.arguments);
      if (r.kagiNai) return kagiNai(res, id, r.kagiNai);
      return dasu(res, 200, kotae(id, r.kekka));
    }
    return dasu(res, 200, ayamari(id, -32601, "知らない method です"));
  } catch (_) {
    // 鍵・中身を 出さない（字に 鍵が 混ざらない 様に e は 返さない）
    return dasu(res, 500, ayamari(id, -32603, "口の中で失敗しました"));
  }
};
