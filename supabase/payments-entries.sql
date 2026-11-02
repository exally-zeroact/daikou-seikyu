-- ============================================================
-- ★入金の 回（payments.entries）★ 2026-11-02（司さん「列を足してよい」＝足すだけ・消さない）
--
--   ★なぜ要るか★ 入金は 会社×月に 1行・入金日は 最後の 1つ だけ。
--     「6/10 に 一部・7/20 に 残り」と 払われると 全部が 7月に 数わり、
--     出し直した 6月の 紙が 多く 請求した（繰越の 会社）。
--   ★中身★ entries＝[{"gaku": 整数, "hi": "YYYY-MM-DD"}]（1回ずつ）。null＝前からの 記録
--     （画面は 今の 額と 入金日を 1回分と 数える）。★正は paid★（古い 版の 画面は paid と paid_date だけ 書く）
--   ★決まりに合わせた所★
--     ・部屋(daikou)に足したら ★public の窓(view)にも足す★（列は 最後に 足すだけ＝create or replace で 通る・権限は 残る）
--     ・窓は ★security_invoker=true★
--     ・★倉庫が 先・画面が 後★（列が 無い 倉庫に 新しい 画面を 出すと 入金の 保存が 全部 落ちる）
-- ============================================================
alter table daikou.payments add column if not exists entries jsonb;

create or replace view public.payments with (security_invoker = true) as
  select id, user_id, month, company, paid, paid_date, memo, created_at, deleted_at, entries
  from daikou.payments;

notify pgrst, 'reload schema';
