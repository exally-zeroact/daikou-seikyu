import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ★2026-07-30 の実バグ回帰: 代行請求アプリが meisai を .select("*") だけで読んでいて、
//   Supabase(PostgREST) の既定 max_rows=1000 で 1000件を超えると"黙って"欠落していた。
//   司さん本人の 1,080件が請求書に反映されず験模工業ほかの一覧が消えていた。
//   根治として fetchAllQ(build)（count:"exact"を見て .range で全ページ取得）を入れた。
//   このテストは "画面が読むのと同じ実ファイル" から fetchAllQ を取り出して固定する（写経ではない）。

const HTML = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "daikou-seikyu.html"),
  "utf8"
);

// daikou-seikyu.html の中の async function fetchAllQ(build){ ... } を丸ごと取り出して関数化する。
function extractFetchAllQ() {
  const start = HTML.indexOf("async function fetchAllQ(build");
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
      const cap = opts.serverCap || PAGE; // サーバ側 max_rows（既定1000・小さくもできる）
      const width = Math.min(to - from + 1, cap); // 1回で返せるのは最大 cap
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

  it("★count が無い応答は「全部読めたか分からない」＝エラーで返す（黙って最初のページで止めない・2026-11-02）", async () => {
    // 前は「最初の非空ページで止める」を正としていた＝1,500件の内 1,000件だけで黙って紙が出得た。
    const s = makeSource(1500, { noCount: true });
    const r = await fetchAllQ(s.build);
    expect(r.error).toBeTruthy();
    expect(r.data).toBeNull();
    expect(s.calls()).toBeLessThanOrEqual(2);
  });

  it("★件数に届く前に空のページが返ったら、読み切れていない＝エラーで返す（2026-11-02）", async () => {
    // 1ページ目 1000件・count 1080・2ページ目が空＝80件 欠けたまま通っていた（3762 if (!got.length) break）
    let calls = 0;
    const build = (from) => {
      calls++;
      const data = from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ id: i })) : [];
      return Promise.resolve({ data, error: null, count: 1080 });
    };
    const r = await fetchAllQ(build);
    expect(r.error).toBeTruthy();
    expect(r.data).toBeNull();
    expect(calls).toBeLessThan(10);
  });

  it("★読む間に件数が変わったら、最初から読み直す（重なり・飛びを残さない・2026-11-02）", async () => {
    // 1回目の読みは 2ページ目で count が 1080→1079（消えた行で境目がずれる）＝読み直して 1079 件を返す
    let round = 0;
    let calls = 0;
    const build = (from) => {
      calls++;
      if (from === 0) round++;
      const total = round === 1 && from > 0 ? 1079 : round === 1 ? 1080 : 1079;
      const all = Array.from({ length: total }, (_, i) => ({ id: i }));
      return Promise.resolve({ data: all.slice(from, from + 1000), error: null, count: total });
    };
    const r = await fetchAllQ(build);
    expect(r.error).toBeNull();
    expect(r.data.length).toBe(1079);
    expect(new Set(r.data.map((x) => x.id)).size).toBe(1079);
    expect(round).toBe(2);
  });

  it("★件数が変わり続けたら、何回かでやめてエラーで返す（無限に読まない・2026-11-02）", async () => {
    let n = 1080;
    let calls = 0;
    const build = (from) => {
      calls++;
      const total = n++;
      const all = Array.from({ length: total }, (_, i) => ({ id: i }));
      return Promise.resolve({ data: all.slice(from, from + 1000), error: null, count: total });
    };
    const r = await fetchAllQ(build);
    expect(r.error).toBeTruthy();
    expect(r.data).toBeNull();
    expect(calls).toBeLessThanOrEqual(8);
  });

  it("★ページで切る読みは全部、一意に並べてから切る（並びが無いとページの境目で行が飛ぶ・重なる・2026-11-02）", () => {
    // fetchAllQ の呼び先の build の中身を取り出して、最後の order が一意の鍵かを見る
    const calls = [];
    for (const m of HTML.matchAll(/await fetchAllQ\(\s*function/g)) {
      calls.push(HTML.slice(m.index, HTML.indexOf(".range(a, b)", m.index)));
    }
    // 7本＝立ち上げの 5本＋消し込みの 書く 直前の 読み直し（その 会社の 入金・2026-11-03）
    //       ＋二重請求の 見張りの 読み直し（その 会社の 明細・日付の 範囲・2026-11-04）
    expect(calls.length).toBe(7);
    for (const c of calls) {
      const table = (c.match(/SB\.from\("([a-z_]+)"\)/) || [])[1];
      const orders = [...c.matchAll(/\.order\("([a-z_]+)"\)/g)].map((m) => m[1]);
      const last = orders[orders.length - 1];
      const uniq = table === "invoice_no" ? "user_id" : "id";
      expect(last, table + " の最後の order").toBe(uniq);
      if (table === "invoice_no") expect(orders).toEqual(["month", "company", "user_id"]);
      // 会社は作った順（同じ名前が2行在る時、前と同じく後から作った方が MASTER で勝つ・対立役 注3）
      if (table === "companies") expect(orders).toEqual(["created_at", "id"]);
      // 重なりを見る鍵が select に在る（invoices は列を絞っている）
      if (table === "invoices") expect(c).toMatch(/\.select\("id, /);
    }
  });

  it("★件数が同じまま中身がずれた（2ページの間に1件足して1件消す）＝同じ行が2回来る→読み直す（対立役 注1・2026-11-02）", async () => {
    // 1回目の読み：1ページ目を読んだ後、前の方へ1件足し・後ろの1件を消す＝count 1500 のまま境目が1つずれる
    let round = 0;
    let calls = 0;
    const base = Array.from({ length: 1500 }, (_, i) => ({ id: "r" + String(i).padStart(5, "0") }));
    const zureta = [{ id: "a0000" }].concat(base.slice(0, 1499)); // 足して消した後（並びは id 順）
    const build = (from) => {
      calls++;
      if (from === 0) round++;
      const rows = round === 1 && from === 0 ? base : zureta;
      return Promise.resolve({ data: rows.slice(from, from + 1000), error: null, count: 1500 });
    };
    const r = await fetchAllQ(build);
    expect(r.error).toBeNull();
    expect(round).toBe(2);
    expect(r.data.length).toBe(1500);
    expect(new Set(r.data.map((x) => x.id)).size).toBe(1500);
    expect(r.data.map((x) => x.id)).toContain("a0000");
  });

  it("★鍵を渡せば鍵で重なりを見る（id の無い台帳 invoice_no）・鍵の無い行はエラー（2026-11-02）", async () => {
    const rows = [
      { user_id: "u", month: "2026-05", company: "A" },
      { user_id: "u", month: "2026-05", company: "A" },
    ];
    const build = () => Promise.resolve({ data: rows, error: null, count: 2 });
    const kagi = (x) => x.user_id + "|" + x.month + "|" + x.company;
    const r = await fetchAllQ(build, kagi);
    expect(r.error).toBeTruthy(); // 3回とも重なる＝変わり続けた
    const r2 = await fetchAllQ(build); // 鍵を渡さない＝id で見る＝id が無い
    expect(r2.error).toBeTruthy();
    const ok = await fetchAllQ(
      () =>
        Promise.resolve({ data: [rows[0], { ...rows[1], company: "B" }], error: null, count: 2 }),
      kagi
    );
    expect(ok.error).toBeNull();
    expect(ok.data.length).toBe(2);
  });

  it("★途中で件数が減って2ページ目が 416（PGRST103）＝エラーで止めずに読み直す（対立役 注2・2026-11-02）", async () => {
    let round = 0;
    const build = (from) => {
      if (from === 0) round++;
      const total = round === 1 && from === 0 ? 1001 : 999; // 1ページ目の後に2件消える
      if (from >= total)
        return Promise.resolve({
          data: null,
          error: { code: "PGRST103", message: "Requested range not satisfiable" },
          status: 416,
          count: null,
        });
      const all = Array.from({ length: total }, (_, i) => ({ id: i }));
      return Promise.resolve({ data: all.slice(from, from + 1000), error: null, count: total });
    };
    // 1回目：1ページ目 count 1001・1000行 → 2ページ目の前に2件消える → 1000-1999 は 416
    const r = await fetchAllQ(build);
    expect(r.error).toBeNull();
    expect(round).toBe(2);
    expect(r.data.length).toBe(999);
  });

  it("★1ページ目の 416 はそのままエラー（読み直しは2ページ目から・2026-11-02）", async () => {
    const build = () =>
      Promise.resolve({ data: null, error: { code: "PGRST103" }, status: 416, count: null });
    const r = await fetchAllQ(build);
    expect(r.error).toBeTruthy();
  });
});
