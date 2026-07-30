import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ★2026-07-30 の実バグ回帰: 代行請求アプリが meisai を .select("*") だけで読んでいて、
//   Supabase(PostgREST) の既定 max_rows=1000 で 1000件を超えると"黙って"欠落していた。
//   司さん本人の 1,080件が請求書に反映されず飛勝工業ほかの一覧が消えていた。
//   根治として fetchAllQ(build)（count:"exact"を見て .range で全ページ取得）を入れた。
//   このテストは "画面が読むのと同じ実ファイル" から fetchAllQ を取り出して固定する（写経ではない）。

const HTML = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "daikou-seikyu.html"),
  "utf8"
);

// daikou-seikyu.html の中の async function fetchAllQ(build){ ... } を丸ごと取り出して関数化する。
function extractFetchAllQ() {
  const start = HTML.indexOf("async function fetchAllQ(build)");
  expect(start, "fetchAllQ が daikou-seikyu.html に無い").toBeGreaterThan(-1);
  // 対応する閉じ波括弧まで数える
  const bodyStart = HTML.indexOf("{", start);
  let depth = 0,
    i = bodyStart;
  for (; i < HTML.length; i++) {
    if (HTML[i] === "{") depth++;
    else if (HTML[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const src = HTML.slice(start, i + 1);
  // 無名関数として評価して返す
  return new Function(src + "; return fetchAllQ;")();
}

const fetchAllQ = extractFetchAllQ();

// 本物と同じ「1回のリクエストは最大1000行しか返らない・countは総数」を再現する偽クエリ。
function makeSource(total, opts = {}) {
  const PAGE = 1000;
  let calls = 0;
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  // build=(from,to)=>完成クエリ。ここでは即Promiseを返す（await される）。
  return {
    calls: () => calls,
    build: (from, to) => {
      calls++;
      if (opts.errorOnCall && calls === opts.errorOnCall) {
        return Promise.resolve({ data: null, error: { message: "boom" }, count: null });
      }
      const cap = opts.serverCap || PAGE;           // サーバ側 max_rows（既定1000・小さくもできる）
      const width = Math.min(to - from + 1, cap);   // 1回で返せるのは最大 cap
      const slice = all.slice(from, from + width);
      return Promise.resolve({
        data: slice,
        error: null,
        count: opts.noCount ? null : total,
      });
    },
  };
}

describe("fetchAllQ（成長テーブルの全件読み込み）", () => {
  it("1,080件（＝司さんの実バグ規模）を1件も落とさず全部返す", async () => {
    const s = makeSource(1080);
    const r = await fetchAllQ(s.build);
    expect(r.error).toBeNull();
    expect(r.data.length).toBe(1080);
    expect(r.data[0].id).toBe(0);
    expect(r.data[1079].id).toBe(1079); // 最後の1件まで来ている
    expect(s.calls()).toBe(2); // 1000 + 80 → 2ページ
  });

  it("★サーバ上限がページ幅より小さくても取りこぼさない（実受信数で進める）", async () => {
    // max_rows を将来1000未満に下げても壊れない保証。size(1000)で進めると380件で止まって欠落する。
    const s = makeSource(1080, { serverCap: 300 });
    const r = await fetchAllQ(s.build);
    expect(r.data.length).toBe(1080);
    const ids = new Set(r.data.map((x) => x.id));
    expect(ids.size).toBe(1080); // 重複も欠落もない
  });

  it("2,500件でも3ページに分けて全部返す（境目の取り違えなし）", async () => {
    const s = makeSource(2500);
    const r = await fetchAllQ(s.build);
    expect(r.data.length).toBe(2500);
    // 全idが重複なく0..2499で揃う
    const ids = new Set(r.data.map((x) => x.id));
    expect(ids.size).toBe(2500);
    expect(s.calls()).toBe(3);
  });

  it("ちょうど1000件は1ページで終わり、余計なリクエストを投げない", async () => {
    const s = makeSource(1000);
    const r = await fetchAllQ(s.build);
    expect(r.data.length).toBe(1000);
    // 1ページ目で count(1000) に到達 → 打ち切り。空ページを取りに行かない設計もOK許容。
    expect(s.calls()).toBeLessThanOrEqual(2);
  });

  it("0件でも安全（空配列・エラー無し）", async () => {
    const s = makeSource(0);
    const r = await fetchAllQ(s.build);
    expect(r.error).toBeNull();
    expect(r.data.length).toBe(0);
  });

  it("途中でエラーが出たら、握りつぶさずそのまま返す（黙って欠落しない）", async () => {
    const s = makeSource(2500, { errorOnCall: 2 });
    const r = await fetchAllQ(s.build);
    expect(r.error).toBeTruthy();
    expect(r.data).toBeNull();
  });

  it("★count が無い応答でも無限ループしない（防御）", async () => {
    const s = makeSource(1500, { noCount: true });
    const r = await fetchAllQ(s.build);
    // count が取れない時は最初の非空ページで止める（飲み屋 fetchAll と同じ安全側）。
    expect(r.error).toBeNull();
    expect(Array.isArray(r.data)).toBe(true);
    expect(s.calls()).toBeLessThanOrEqual(2);
  });
});
