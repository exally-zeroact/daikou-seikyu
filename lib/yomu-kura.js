/* ==========================================================================
   lib/yomu-kura.js — 読むだけの口の 倉庫を 読む 所（1本）2026-11-13 ⑥
   ①（api/yomu.js）と MCP の口（api/mcp.js）の 両方が ここを 呼ぶ（写しを 作らない）。
   ★鍵の 字を 受けて 倉庫を 読む だけ★。鍵を 客の 要求から 取り出す 所は 各口に 残す
     （?token を 受けるのは ① だけ＝MCP は Authorization: Bearer だけ）。
   ★倉庫へは POST・鍵は body★（URL に 載せない＝倉庫の 記録に 残さない）。客の Authorization は 回さない。
   ★状態の 番号で 判じない★ 鍵なし・止めた は 倉庫の 本文の code 28000（PostgREST は 403 で 返す 見立て）。
   網が 落ちた 時は 投げる（口の 側で 500 に する＝200 に しない）。
   ========================================================================== */
"use strict";

const SUPABASE_URL = "https://tnfwipbgfgjaymlszeid.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZndpcGJnZmdqYXltbHN6ZWlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1Nzk4MzQsImV4cCI6MjA5NzE1NTgzNH0.zhKPLSlW4zxsdjsXNvqDHvtP3wBqp-EKaxbjqLGW_ek";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function rpc(name, kagi) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + name, {
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
  return { r, body };
}

// 戻り＝{ status: 200, moto } ／ { status: 401|502, error }
async function yomuMoto(kagi) {
  const { r, body } = await rpc("yomu_moto", kagi);
  if (body && typeof body === "object" && !Array.isArray(body) && body.code === "28000")
    return { status: 401, error: "鍵が違うか、止められています" };
  if (!r.ok || !body || typeof body !== "object" || Array.isArray(body) || !body.meisai)
    return { status: 502, error: "倉庫を読めませんでした（" + r.status + "）" };
  return { status: 200, moto: body };
}

// 鍵が 在るか（MCP の 繋ぐ 時）。★true の 時だけ 通す★：在る true／無い false／読めない null
async function kagiAru(kagi) {
  const { r, body } = await rpc("kagi_aru", kagi);
  if (!r.ok) return null;
  if (body === true) return true;
  if (body === false) return false;
  return null;
}

module.exports = { UUID_RE, yomuMoto, kagiAru };
