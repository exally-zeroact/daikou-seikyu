// @vitest-environment node
// ============================================================
// ★★一覧で 金額を 直したら 事務所の売上も 直る★★ 2026-09-03（司さん）
//
//   ★司さんの言葉★「一覧で金額とか修正したら事務所の売上とかも自動で修正されるようにしろよ」
//
//   ★なぜ 要ったか（実測）★
//     道は ★一方通行★でした。ダイコメ → 請求書 へ 送るだけで、
//     ★請求書 → ダイコメ へ 戻す道が 1本も 無かった★（機械で 数えて 0件）。
//     その為 一覧で 金額を 直しても 事務所の売上（dk_shifts.fare_total_yen）は 元のまま。
//
//   ★決まり（ここが 正本・2か所に 書かない）★
//     戻すのは ★次の 全部が そろった時だけ★
//       ・その行が ★ダイコメ発★（extra.dk_source === 'daikome'）
//       ・★戻す先が 分かる★（extra.dk_ref が 在る＝端末:業務開始:何本目）
//       ・★金額が 実際に 変わった★（同じなら 何も しない＝無駄に 倉庫を 触らない）
//     ★手で入れた行は 戻さない★（戻す先が 無い）
//
//   ★お金の 向き★ … 直すのは ★その代行1件の 金額★ と ★その業務の 合計★ だけ。
//     ★距離には 1mmも 触らない★（関数側 supabase/functions/dk-fix-fare でも 同じ）
//
//   ★★わざと壊して 赤に なる事を 見た（2026-09-03 実測）★★
//     ★1回目は 2通りが「壊しても 緑」でした＝★私の 見張りに 穴が 在った★★
//       ・「ダイコメ発かを 見ない」… dk_ref の 守りに 隠れて 赤に ならなかった
//         ⇒ ★dk_ref だけ 在る行★の 1本を 足した（⑤-b）
//       ・「画面から 呼ぶのを やめる」… 字が 関数の 中に 残るので 赤に ならなかった
//         ⇒ ★呼び出しの 1行そのもの★を 見るように した（⑥）
//     ★直した後（8本）★
//       ①同じ金額でも 戻す …………………… ★2本 赤★
//       ②ダイコメ発かを 見ない ……………… ★1本 赤★
//       ③戻す先(dk_ref)を 見ない …………… ★1本 赤★
//       ④画面から 呼ぶのを やめる ………… ★1本 赤★
//       ⑤鍵の名前を 間違える ………………… ★1本 赤★
//     戻した後 … ★8本とも 緑★
//     ⇒★5通り 全部で 赤に なった＝空振りでは ありません★
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "daikou-seikyu.html"), "utf8");

const ENGINE = await import("../meisai-engine.js");
const U = (globalThis.MeisaiEngine || ENGINE.default || ENGINE).utils;

const daikome = (yen) => ({
  id: "row-1",
  会社名: "テスト商事",
  金額: yen,
  dk_source: "daikome",
  dk_ref: "7e1919ef-4aaa-411e-8db0-ba0424d1fe53:1787385737281:3",
});
const teuchi = (yen) => ({ id: "row-2", 会社名: "テスト商事", 金額: yen });

describe("★一覧で 金額を 直したら 事務所へ 戻す★", () => {
  it("★① 金額が 変わったら 戻す★", () => {
    expect(U.shouldPushFare(daikome(1500), daikome(1800)), "★戻していません★").toBe(true);
  });

  it("★★② 金額が 同じなら 戻さない（無駄に 倉庫を 触らない）★★", () => {
    expect(U.shouldPushFare(daikome(1500), daikome(1500)), "★同じなのに 戻しています★").toBe(false);
  });

  it("★③ 金額以外だけ 直した時は 戻さない★", () => {
    const mae = daikome(1500);
    const ato = Object.assign({}, daikome(1500), { 備考: "会長" });
    expect(U.shouldPushFare(mae, ato)).toBe(false);
  });

  it("★★④ 手で入れた行は 戻さない（戻す先が 無い）★★", () => {
    expect(U.shouldPushFare(teuchi(1500), teuchi(1800)), "★戻す先が 無いのに 戻しています★").toBe(
      false
    );
  });

  it("★⑤ ダイコメ発でも 戻す先(dk_ref)が 無ければ 戻さない★", () => {
    const mae = { id: "x", 金額: 1500, dk_source: "daikome" };
    const ato = { id: "x", 金額: 1800, dk_source: "daikome" };
    expect(U.shouldPushFare(mae, ato)).toBe(false);
  });

  it("★★⑤-b ダイコメ発の印が 無ければ 戻さない（dk_ref だけ 在っても）★★", () => {
    // ★この1本が 無いと 「ダイコメ発かどうか」の 守りを 外しても 赤に ならなかった★
    //   （2026-09-03・わざと壊して 気づいた＝dk_ref の 守りに 隠れていた）
    const mae = { id: "x", 金額: 1500, dk_ref: "dev:123:1" };
    const ato = { id: "x", 金額: 1800, dk_ref: "dev:123:1" };
    expect(U.shouldPushFare(mae, ato), "★ダイコメ発か 見ていません★").toBe(false);
  });

  it("★⑥ 画面が 保存の後に 戻す道を ★実際に 呼んでいる★（読むだけ）★", () => {
    expect(HTML, "★戻すかどうかを エンジンに 聞いていません★").toMatch(
      /MeisaiEngine\.utils\.shouldPushFare|shouldPushFare\(/
    );
    expect(HTML, "★戻す関数(dk-fix-fare)を 呼んでいません★").toMatch(/dk-fix-fare/);
    // ★★呼び出しの 1行が 在るか★★
    //   これが 無いと ★呼ぶ所を 消しても 緑のまま★だった（2026-09-03・わざと壊して 気づいた）
    expect(HTML, "★保存の後に 呼ぶ 1行が ありません★").toMatch(/await _jimushoHeModosu\(r, _mae\)/);
  });

  it("★⑦ 戻すのに 失敗しても 保存は 止めない（画面を 白くしない）★", () => {
    // ★戻す所は try/catch の 中★＝倉庫が 落ちていても 一覧の 保存は 通す
    expect(HTML).toMatch(/async function _jimushoHeModosu[\s\S]*?catch \(e\)/);
    // ★鍵の 名前を 間違えると 実物で 落ちる★（1回 間違えた＝SUPABASE_ANON_KEY と 書いていた）
    expect(HTML, "★この画面に 無い 鍵の名前を 使っています★").not.toMatch(/SUPABASE_ANON_KEY/);
  });
});
