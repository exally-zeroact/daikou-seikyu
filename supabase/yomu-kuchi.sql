-- ============================================================
-- ★外から読むだけの口（①）★ 2026-11-03（司さん 11-02「外へ数を出す口＝読むだけ」）
--
--   ★何をするか★ 会計ソフト・客の AI が 鍵（export_tokens.token）で 明細・請求・入金・会社を 読む。書く道は 無い。
--   ★お金の 式は ここに 書かない★ ここは 本人の 生の 行を 1つの jsonb で 返す だけ。
--     額は api/yomu.js が 画面と 同じ 関数（meisai-engine.js の invoiceTotals・lib/nyukin-kai.js の entriesOf）で 出す
--     （SQL に 同じ 式を 書くと 画面と 口の 額が 食い違う＝対立役 ①の 設計 止1・止2）。
--   ★他人の 行を 混ぜない★ 鍵から 利用者 u を ★1か所で★ 決め、全部の 副問いを where user_id = u に する。
--     SECURITY DEFINER（持ち主 postgres＝RLS を 越える）なので ここが 唯一の 守り。試験＝scripts/sql-shiken.mjs。
--   ★古い export_* と api/excel.js の 答えの 列は 変えない★（06-16〜21 に 配った 古い xlsx/iqy が 読む）。
--   ★1行の jsonb★＝倉庫の max_rows（テスト 1000）に かからない＝黙って 途中まで に ならない。
--
--   ★鍵★ 作り直す・止めるは 関数だけ（1文）。表への insert/update は 取り上げる
--     （daikou 側も＝PostgREST は daikou にも 開いている・対立役 v2 注1）。select/delete は 残す。
--   ★権限は 書いた＝効いた ではない★ public の 関数は 既定で PUBLIC と anon に EXECUTE が 付く。
--     当てた 後に proacl を 測って anon が 消えた 事を 見る（kagi_tsukurinaosu・kagi_tomeru）。
-- ============================================================

-- ---------- ① 読む（鍵 → 本人の 生の 行） ----------
create or replace function public.yomu_moto(token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  u uuid;
begin
  if yomu_moto.token is null then
    raise exception 'kagi_nashi' using errcode = '28000';
  end if;
  select t.user_id into u from daikou.export_tokens t where t.token = yomu_moto.token;
  if u is null then
    raise exception 'kagi_nashi' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'meisai', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'company', m.company, 'date', m.date, 'destination', m.destination,
        'amount', m.amount, 'note', m.note, 'distance', m.distance, 'people', m.people,
        'name', m.name, 'created_at', m.created_at)
        order by m.date nulls last, m.company, m.created_at, m.id)
      from daikou.meisai m
      where m.user_id = u and m.deleted_at is null), '[]'::jsonb),
    'kaisha', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', c.name,
        'taxMode', c.config->>'taxMode',
        'carryover', coalesce((c.config->>'carryover')::boolean, false))
        order by c.created_at, c.id)
      from daikou.companies c
      where c.user_id = u and c.deleted_at is null), '[]'::jsonb),
    'nyukin', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'month', p.month, 'company', p.company, 'paid', p.paid,
        'paid_date', p.paid_date, 'memo', p.memo, 'created_at', p.created_at,
        'entries', p.entries)
        order by p.month, p.company)
      from daikou.payments p
      where p.user_id = u and p.deleted_at is null), '[]'::jsonb),
    'bango', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', n.month, 'company', n.company, 'invoice_no', n.invoice_no,
        'decided_at', n.decided_at)
        order by n.month, n.company)
      from daikou.invoice_no n
      where n.user_id = u), '[]'::jsonb)
  );
end;
$$;

-- ---------- ② 鍵が 在るか（古い Excel に「止まっています」を 出す 用・api/excel.js） ----------
create or replace function public.kagi_aru(token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from daikou.export_tokens t where t.token = $1);
$$;

-- ---------- ③ 鍵を 出す／作り直す（1文・古い 鍵は 即 使えなくなる） ----------
create or replace function public.kagi_tsukurinaosu()
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t uuid;
begin
  if me is null then
    raise exception 'login_nashi' using errcode = '28000';
  end if;
  insert into daikou.export_tokens as e (user_id, token, created_at)
  values (me, gen_random_uuid(), now())
  on conflict (user_id) do update set token = gen_random_uuid(), created_at = now()
  returning e.token into t;
  return t;
end;
$$;

-- ---------- ④ 鍵を 止める（消した 件数を 返す＝画面は 1 で なければ 失敗を 出す） ----------
create or replace function public.kagi_tomeru()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then
    raise exception 'login_nashi' using errcode = '28000';
  end if;
  delete from daikou.export_tokens where user_id = me;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------- ⑤ 権限 ----------
revoke all on function public.yomu_moto(uuid) from public;
revoke all on function public.kagi_aru(uuid) from public;
revoke all on function public.kagi_tsukurinaosu() from public, anon;
revoke all on function public.kagi_tomeru() from public, anon;
grant execute on function public.yomu_moto(uuid) to anon, authenticated;
grant execute on function public.kagi_aru(uuid) to anon, authenticated;
grant execute on function public.kagi_tsukurinaosu() to authenticated;
grant execute on function public.kagi_tomeru() to authenticated;

-- 鍵の 表に 直に 書かせない（弱い 鍵を 自分で 作れない・作り直しは ③だけ）
revoke insert, update on public.export_tokens from anon, authenticated;
revoke insert, update on daikou.export_tokens from anon, authenticated;

notify pgrst, 'reload schema';
