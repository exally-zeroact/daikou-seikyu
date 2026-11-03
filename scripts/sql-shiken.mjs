#!/usr/bin/env node
// ============================================================
// ★外から読む口（supabase/yomu-kuchi.sql）の 守りを 倉庫の 中で 試す★ 2026-11-03
//   node scripts/sql-shiken.mjs          … 試す（★テスト線の 倉庫 khaw だけ★）
//   node scripts/sql-shiken.mjs --ateru  … yomu-kuchi.sql を khaw に 当ててから 試す
//
//   ★本番を 壊さない 形（対立役 v2 止1・v3 注1〜3）★
//   ・向き先は khaw に 固定（引数で 変えられない・tnfw の 字が 在れば 走らない）。本番の 倉庫へは 当てない。
//   ・試験は 1つの DO＝最後に 必ず raise exception 'ROLLBACK_OK n=…'＝どう 転んでも commit されない。
//     頭に select 1; を 付けて 複数の 文の 暗黙の 取引に する（DO の 中の COMMIT は エラーに なる）。
//     試験の 字に commit/rollback/end transaction/set transaction が 在れば 走らない。
//   ・緑は「SQLSTATE P0001 で ROLLBACK_OK n=<決めた数>」の 時だけ（構文エラーの 字に 釣られない）。
//   ・前と 後で 指紋（目印の 行の 数・試験口の 鍵・関数の md5 と 権限・表の 権限）が 同じで なければ 赤。
//   ・★auth に 利用者を 作らない★（作るのは 司さんの 決め）＝既に 在る 試験口 2つ（test@test.com・e0test）の
//     user_id を 使い、行は 目印 YOMU_SHIKEN_ で 数える（他の 席の 行が 増えても 揺れない）。
//   CI では 回らない（倉庫の 鍵 ~/.supabase-token が 要る）＝押す 前に 手で 回し、数を 引き継ぎの 紙に 残す。
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REF = "khawdrnvssdenumbiwfg"; // ★テスト線の 倉庫だけ★
const HONBAN = "tnfw";
const A = "e609e233-107e-4410-bc92-8964efeeb5d7"; // 試験口 test@test.com（khaw）
const B = "020d9f5e-1e61-4fea-8df0-e412aff5d895"; // 試験口 exally.supoort+e0test（khaw）
const KIMETA_KAZU = 13;
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

if (REF.includes(HONBAN) || process.argv.some((a) => a.includes(HONBAN))) {
  console.error("本番の 倉庫には 当てない");
  process.exit(2);
}
const TOKEN = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".supabase-token"), "utf8")).token;

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json",
      "User-Agent": "daikou-seikyu-sql-shiken/1",
    },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  return { status: r.status, text };
}

const SHIMON = `
select
 (select count(*) from daikou.meisai where company like 'YOMU_SHIKEN_%') as m,
 (select count(*) from daikou.companies where name like 'YOMU_SHIKEN_%') as c,
 (select count(*) from daikou.payments where company like 'YOMU_SHIKEN_%') as p,
 (select count(*) from daikou.invoice_no where company like 'YOMU_SHIKEN_%') as b,
 (select coalesce(string_agg(user_id::text || ':' || md5(token::text), ',' order by user_id), '')
    from daikou.export_tokens where user_id in ('${A}', '${B}')) as t,
 (select string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''), ',' order by p.proname)
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('yomu_moto', 'kagi_aru', 'kagi_tsukurinaosu', 'kagi_tomeru')) as f,
 (select string_agg(c.oid::regclass::text || ':' || coalesce(c.relacl::text, ''), ',' order by c.oid::regclass::text)
    from pg_class c where c.relname = 'export_tokens') as a`;

// ---------- 試験の 本体（1つの DO） ----------
const DO = `
do $shiken$
declare
  ua uuid := '${A}';
  ub uuid := '${B}';
  ka uuid := gen_random_uuid();
  kb uuid := gen_random_uuid();
  kn uuid;
  j jsonb;
  n int := 0;
  k int;
  ok boolean;
  def text;
  kowashi text;
begin
  -- 作り物（目印 YOMU_SHIKEN_・試験口 2つ・全部 この 取引の 中だけ）
  delete from daikou.export_tokens where user_id in (ua, ub);
  insert into daikou.export_tokens (user_id, token) values (ua, ka), (ub, kb);
  insert into daikou.meisai (user_id, company, date, amount) values
    (ua, 'YOMU_SHIKEN_A', '2026-10-01', 1000), (ua, 'YOMU_SHIKEN_A', '2026-10-02', 2000),
    (ub, 'YOMU_SHIKEN_B', '2026-10-01', 5000);
  insert into daikou.meisai (user_id, company, date, amount, deleted_at) values
    (ua, 'YOMU_SHIKEN_A', '2026-10-03', 9999, now());
  insert into daikou.companies (user_id, name, config) values
    (ua, 'YOMU_SHIKEN_A', '{"taxMode":"外税","carryover":true}'), (ub, 'YOMU_SHIKEN_B', '{}');
  insert into daikou.payments (user_id, month, company, paid, paid_date, entries) values
    (ua, '2026-10', 'YOMU_SHIKEN_A', 500, '2026-10-20', '[{"gaku":500,"hi":"2026-10-20"}]'),
    (ub, '2026-10', 'YOMU_SHIKEN_B', 5000, '2026-10-21', null);
  insert into daikou.invoice_no (user_id, month, company, invoice_no) values
    (ua, '2026-10', 'YOMU_SHIKEN_A', 'YS-A-' || ka), (ub, '2026-10', 'YOMU_SHIKEN_B', 'YS-B-' || kb);

  -- 1〜4 A の 鍵で A の 作り物が 入れた 数どおり 返る（消した 明細は 出ない）
  j := public.yomu_moto(ka);
  select count(*) into k from jsonb_array_elements(j->'meisai') e where e->>'company' = 'YOMU_SHIKEN_A';
  if k <> 2 then raise exception 'SHIKEN_AKA: A の 明細 % 行（2 の はず）', k; end if; n := n + 1;
  select count(*) into k from jsonb_array_elements(j->'kaisha') e
    where e->>'name' = 'YOMU_SHIKEN_A' and e->>'taxMode' = '外税' and (e->>'carryover')::boolean;
  if k <> 1 then raise exception 'SHIKEN_AKA: A の 会社 %', k; end if; n := n + 1;
  select count(*) into k from jsonb_array_elements(j->'nyukin') e
    where e->>'company' = 'YOMU_SHIKEN_A' and (e->>'paid')::int = 500 and jsonb_array_length(e->'entries') = 1;
  if k <> 1 then raise exception 'SHIKEN_AKA: A の 入金 %', k; end if; n := n + 1;
  select count(*) into k from jsonb_array_elements(j->'bango') e where e->>'company' = 'YOMU_SHIKEN_A';
  if k <> 1 then raise exception 'SHIKEN_AKA: A の 番号 %', k; end if; n := n + 1;

  -- 5 A の 答えに B の 字が 1つも 無い
  if position('YOMU_SHIKEN_B' in j::text) > 0 then raise exception 'SHIKEN_AKA: A の 鍵で B が 見えた'; end if; n := n + 1;
  -- 6 B の 鍵は B だけ
  j := public.yomu_moto(kb);
  if position('YOMU_SHIKEN_A' in j::text) > 0 or position('YOMU_SHIKEN_B' in j::text) = 0 then
    raise exception 'SHIKEN_AKA: B の 鍵の 答えが 違う'; end if; n := n + 1;

  -- 7 無い 鍵・null は 28000（200 [] に しない）
  ok := false; begin perform public.yomu_moto(gen_random_uuid()); exception when sqlstate '28000' then ok := true; end;
  if not ok then raise exception 'SHIKEN_AKA: 無い 鍵が 通った'; end if;
  ok := false; begin perform public.yomu_moto(null); exception when sqlstate '28000' then ok := true; end;
  if not ok then raise exception 'SHIKEN_AKA: null の 鍵が 通った'; end if; n := n + 1;

  -- 8 kagi_aru
  if not public.kagi_aru(ka) or public.kagi_aru(gen_random_uuid()) then raise exception 'SHIKEN_AKA: kagi_aru'; end if; n := n + 1;

  -- 9 A が ログインして 作り直す＝古い 鍵は 28000・新しい 鍵で 読める
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  execute 'set local role authenticated';
  kn := public.kagi_tsukurinaosu();
  execute 'reset role';
  if kn is null or kn = ka then raise exception 'SHIKEN_AKA: 作り直した 鍵が 同じ'; end if;
  ok := false; begin perform public.yomu_moto(ka); exception when sqlstate '28000' then ok := true; end;
  if not ok then raise exception 'SHIKEN_AKA: 作り直した 後も 古い 鍵が 通った'; end if;
  if position('YOMU_SHIKEN_A' in public.yomu_moto(kn)::text) = 0 then raise exception 'SHIKEN_AKA: 新しい 鍵で 読めない'; end if;
  if not public.kagi_aru(kb) then raise exception 'SHIKEN_AKA: A の 作り直しで B の 鍵が 消えた'; end if;
  n := n + 1;

  -- 10 A が 止める＝1件・もう 1回は 0件・止めた 鍵は 28000・B は 生きている
  execute 'set local role authenticated';
  k := public.kagi_tomeru();
  if k <> 1 then execute 'reset role'; raise exception 'SHIKEN_AKA: 止めた 件数 %', k; end if;
  k := public.kagi_tomeru();
  execute 'reset role';
  if k <> 0 then raise exception 'SHIKEN_AKA: 2回目の 止め %', k; end if;
  ok := false; begin perform public.yomu_moto(kn); exception when sqlstate '28000' then ok := true; end;
  if not ok or not public.kagi_aru(kb) then raise exception 'SHIKEN_AKA: 止めた 後'; end if;
  n := n + 1;

  -- 11 ログイン 無し（anon）は 作り直し・止めを 呼べない／鍵の 表へ 直に 書けない（両方の 窓）
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  ok := false; begin perform public.kagi_tsukurinaosu(); exception when insufficient_privilege then ok := true; end;
  if not ok then execute 'reset role'; raise exception 'SHIKEN_AKA: anon が 作り直せた'; end if;
  ok := false; begin perform public.kagi_tomeru(); exception when insufficient_privilege then ok := true; end;
  if not ok then execute 'reset role'; raise exception 'SHIKEN_AKA: anon が 止められた'; end if;
  ok := false; begin insert into public.export_tokens (user_id, token) values (ub, gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  if not ok then execute 'reset role'; raise exception 'SHIKEN_AKA: anon が public の 窓へ 書けた'; end if;
  ok := false; begin insert into daikou.export_tokens (user_id, token) values (ub, gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  if not ok then execute 'reset role'; raise exception 'SHIKEN_AKA: anon が daikou へ 書けた'; end if;
  -- anon でも 鍵が あれば 読める（口は anon の 鍵で 倉庫を 呼ぶ）
  if position('YOMU_SHIKEN_B' in public.yomu_moto(kb)::text) = 0 then execute 'reset role'; raise exception 'SHIKEN_AKA: anon で 読めない'; end if;
  execute 'reset role';
  n := n + 1;

  -- 12 ログインした 本人も 鍵の 表へ 直に update できない（弱い 鍵を 自分で 作れない）
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  execute 'set local role authenticated';
  ok := false; begin update daikou.export_tokens set token = '00000000-0000-0000-0000-000000000000' where user_id = ub; exception when insufficient_privilege then ok := true; end;
  if not ok then execute 'reset role'; raise exception 'SHIKEN_AKA: 本人が daikou の 鍵を update できた'; end if;
  ok := false; begin update public.export_tokens set token = '00000000-0000-0000-0000-000000000000' where user_id = ub; exception when insufficient_privilege then ok := true; end;
  execute 'reset role';
  if not ok then raise exception 'SHIKEN_AKA: 本人が public の 鍵を update できた'; end if;
  n := n + 1;

  -- 13 壊し：明細の where user_id を 外すと B の 行が A の 鍵で 見える（＝この 試験は 効く）
  def := pg_get_functiondef('public.yomu_moto(uuid)'::regprocedure);
  kowashi := replace(def, 'where m.user_id = u and m.deleted_at is null', 'where m.deleted_at is null');
  if kowashi = def then raise exception 'SHIKEN_AKA: 壊しの 字が 見つからない'; end if;
  execute kowashi;
  insert into daikou.export_tokens (user_id, token) values (ua, ka);
  if position('YOMU_SHIKEN_B' in public.yomu_moto(ka)::text) = 0 then
    raise exception 'SHIKEN_AKA: 壊しても B が 見えない＝試験が 効いていない'; end if;
  n := n + 1;

  raise exception 'ROLLBACK_OK n=%', n;
end
$shiken$;`;

function kinshi(s) {
  // plpgsql の begin…end は 引っかけない。取引を 閉じる 字だけ 見る
  return /\bcommit\b|\brollback\b|\bend\s+transaction\b|\bset\s+transaction\b|\bsavepoint\b/i.test(
    s
  );
}

async function main() {
  if (kinshi(DO)) throw new Error("試験の 字に 取引を 閉じる 字が 在る＝走らない");
  if (process.argv.includes("--ateru")) {
    const ddl = fs.readFileSync(path.join(ROOT, "supabase/yomu-kuchi.sql"), "utf8");
    const r = await sql(ddl);
    console.log("当てた:", r.status, r.text.slice(0, 300));
    if (r.status >= 300) process.exit(1);
  }
  const mae = await sql(SHIMON);
  if (mae.status >= 300) throw new Error("前の 指紋が 取れない: " + mae.text);
  const r = await sql("select 1;\n" + DO);
  const ato = await sql(SHIMON);
  if (ato.status >= 300) throw new Error("後の 指紋が 取れない: " + ato.text);
  console.log("答え:", r.status, r.text.slice(0, 500));
  const m = /P0001: ROLLBACK_OK n=(\d+)\b/.exec(r.text);
  const maeJ = JSON.parse(mae.text)[0];
  const atoJ = JSON.parse(ato.text)[0];
  let aka = 0;
  if (!m) {
    console.log("赤：ROLLBACK_OK（P0001）で 終わっていない");
    aka++;
  } else if (Number(m[1]) !== KIMETA_KAZU) {
    console.log("赤：通った 確かめ " + m[1] + "（" + KIMETA_KAZU + " の はず）");
    aka++;
  }
  for (const key of Object.keys(maeJ)) {
    if (JSON.stringify(maeJ[key]) !== JSON.stringify(atoJ[key])) {
      console.log("赤：指紋が 変わった " + key, maeJ[key], "→", atoJ[key]);
      aka++;
    }
  }
  if (Number(atoJ.m) + Number(atoJ.c) + Number(atoJ.p) + Number(atoJ.b) !== 0) {
    console.log("赤：目印の 行が 残っている", atoJ);
    aka++;
  }
  console.log("指紋:", JSON.stringify(atoJ).slice(0, 400));
  console.log(aka ? "★赤 " + aka + "★" : "★緑 確かめ " + KIMETA_KAZU + "・何も 残っていない★");
  process.exit(aka ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
