-- ============================================================
-- ★A 請求書を保存する（発行した瞬間に写しを残す）★ 2026-08-11
--
--   ★なぜ要るか（本番で数えた事実）★
--     ・請求書を保存する棚が1つも無く、Supabase の bucket も0個・ファイル0件
--     ・PDFは端末に落とすだけ＝サーバに残らない
--     ・請求書は毎回 meisai から計算し直す
--     ★実測★ 明細を 12,000→9,000 に直して同じ月を出すと 請求額も 9,000 に変わった
--            ＝過去に渡した紙と 出し直した紙が食い違う。止める物は無い。
--
--   ★2つの棚に分ける（役割が違うので混ぜない）★
--     daikou.invoices    … ★発行の控え（履歴）★ 出すたびに1行 積む。過去の紙が何だったかが残る
--     daikou.invoice_no  … ★番号の台帳★ (月×会社) に1つだけ。一度決めた番号は動かさない
--                          ＝B「番号の凍結」と C「同じ番号を2通 作れる」の土台
--
--   ★決まりに合わせた所★
--     ・部屋(daikou)に作ったら ★public の窓(view)にも足す★（忘れると同期が丸ごと落ちる）
--     ・窓は ★security_invoker=true★（付け直さないと権限が落ちる）
--     ・RLS は既存と同じ形： policy "own" for all using/with check (auth.uid() = user_id)
-- ============================================================

-- ---------- ① 部屋（daikou） ----------
create table if not exists daikou.invoices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  month        text not null,                     -- 'YYYY-MM'
  company      text not null,
  invoice_no   text not null,                     -- ★出した時の番号（凍結された物）★
  issued_at    timestamptz not null default now(),
  total        integer not null,                  -- 請求額（税込）
  tax          integer not null,                  -- 消費税
  rows_json    jsonb not null default '[]'::jsonb, -- 明細の写し
  issuer_json  jsonb not null default '{}'::jsonb, -- 自社情報・登録番号・振込先の写し
  design_json  jsonb not null default '{}'::jsonb, -- 様式・列・幅・揃えの写し
  carry_json   jsonb,                             -- 繰越の内訳（前回繰越/入金/今回お支払）
  deleted_at   timestamptz
);

create table if not exists daikou.invoice_no (
  user_id      uuid not null,
  month        text not null,
  company      text not null,
  invoice_no   text not null,
  decided_at   timestamptz not null default now(),
  primary key (user_id, month, company)
);

-- ★同じ番号を2通 作れない★（Cの答え。今は止める物が1つも無い）
create unique index if not exists invoice_no_uniq
  on daikou.invoice_no (user_id, invoice_no);

-- 控えは (月×会社) で何度でも積む＝再発行の履歴が残る。引く時の索引だけ足す。
create index if not exists invoices_user_month_idx
  on daikou.invoices (user_id, month, company);
create index if not exists invoices_user_no_idx
  on daikou.invoices (user_id, invoice_no);

-- ---------- ② 鍵（RLS）… 既存の棚と同じ形 ----------
alter table daikou.invoices   enable row level security;
alter table daikou.invoice_no enable row level security;

drop policy if exists own on daikou.invoices;
create policy own on daikou.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists own on daikou.invoice_no;
create policy own on daikou.invoice_no
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- ③ 窓（public）… ★部屋に作ったら必ず窓も★ ----------
create or replace view public.invoices as
  select id, user_id, month, company, invoice_no, issued_at,
         total, tax, rows_json, issuer_json, design_json, carry_json, deleted_at
    from daikou.invoices;
alter view public.invoices set (security_invoker = true);

create or replace view public.invoice_no as
  select user_id, month, company, invoice_no, decided_at
    from daikou.invoice_no;
alter view public.invoice_no set (security_invoker = true);

grant select, insert, update, delete on public.invoices   to authenticated;
grant select, insert, update, delete on public.invoice_no to authenticated;
