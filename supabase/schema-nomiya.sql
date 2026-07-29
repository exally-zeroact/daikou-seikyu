-- ════════════════════════════════════════════════════════════════════════
-- 飲み屋 売上管理（nomiya-uriage）の棚
--
--   ★適用は「テスト用Supabase（DB-test / khawdrnvssdenumbiwfg）」に先。★
--     本番倉庫(tnfwipbgfgjaymlszeid)には、実際に店に配るときに同じ物を当てる。
--   ★このファイルは「新規テーブル3つを作るだけ」。既存テーブル/既存データには触らない。★
--   ★冪等（create if not exists / drop policy if exists）＝何度実行しても安全。★
--   適用方法: Supabase ダッシュボード > SQL Editor に貼って Run（1回）。
--
--   新規:
--     nomiya_sales    ... 売上1件＝1組のお会計
--     nomiya_partners ... 宛先（請求書送りの相手＝会社名・敬称・担当者）
--     nomiya_settings ... 店の情報・ロゴ・判子・請求書のデザイン（1アカウント1行）
--
--   共通方針: account_id = auth.uid() + RLS 本人のみ（既存 pay_* と同方式）。
--             お金の記録はソフト削除(deleted_at)＝物理削除しない。
--             端末でも打てる（オフライン）ので、突合の鍵は端末が作る id（cid）。
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 売上（1組のお会計） ───────────────────────────────────────────────
--   cid          = 端末が作ったID（画面の売上.id）。同期の突合はこれで行う。
--   pay          = cash / credit / paypay / invoice / tsuke
--   receipt      = none / issued / later / na
--   paid_date    = 入金日（請求書送り・ツケが回収済みになった日。未回収は null）
--   staff        = 担当（誰の客か）。今は画面に出さないが、後からキャスト別売上を
--                  出すときに過去分が空だと使えないので、最初から器を持つ。
create table if not exists nomiya_sales (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cid        text not null,
  ymd        date not null,
  name       text not null default '',
  people     integer not null default 1,
  amount     integer not null default 0,
  pay        text not null default 'cash',
  receipt      text not null default 'none',
  receipt_date date,                              -- 領収書を渡した日（出していなければ null）
  memo       text not null default '',
  paid_date  date,
  staff      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, cid)
);
create index if not exists idx_nomiya_sales_acct_ymd on nomiya_sales(account_id, ymd);
create index if not exists idx_nomiya_sales_acct_upd on nomiya_sales(account_id, updated_at);

-- ── 宛先（請求書送りの相手） ──────────────────────────────────────────
--   name  = 会社名（そのまま売上の名前になる＝突合の鍵）
--   honor = 御中 / 様
create table if not exists nomiya_partners (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null,
  honor        text not null default '御中',
  person       text not null default '',
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (account_id, name)
);
create index if not exists idx_nomiya_partners_acct on nomiya_partners(account_id, name);

-- ── 店の設定（1アカウント1行） ────────────────────────────────────────
--   config 例: { store:'', addr:'', tel:'', regNo:'', bank:'', rate:0.1,
--                tpl:'card', accent:'', font:'mincho', logoPos:'top',
--                logo:'data:image/png;base64,...', hanko:'data:image/png;base64,...' }
create table if not exists nomiya_settings (
  account_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── RLS: 本人(account_id = auth.uid())の行だけ ────────────────────────
alter table nomiya_sales    enable row level security;
alter table nomiya_partners enable row level security;
alter table nomiya_settings enable row level security;

drop policy if exists own_nomiya_sales on nomiya_sales;
create policy own_nomiya_sales on nomiya_sales for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_partners on nomiya_partners;
create policy own_nomiya_partners on nomiya_partners for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

drop policy if exists own_nomiya_settings on nomiya_settings;
create policy own_nomiya_settings on nomiya_settings for all
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- ── 確認用（適用後に SQL Editor で実行すると3行とも rowsecurity=true で返る） ──
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in
--     ('nomiya_sales','nomiya_partners','nomiya_settings');
