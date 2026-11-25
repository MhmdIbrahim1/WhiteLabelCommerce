-- Phase 14: Comprehensive Security, RLS, Multi-Tenant & Financial Integrity Hardening
-- Closes CRIT-01, CRIT-02 (DB), CRIT-04, CRIT-05, CRIT-06, CRIT-07, CRIT-08,
-- HIGH-02, HIGH-03, HIGH-04, HIGH-05, HIGH-06, HIGH-11, and M1-M6.
-- Apply after phase-13-pixels-abandoned-carts.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 0. SCHEMA ADDITIONS FOR PAYMENT ATTEMPTS, RETURN WINDOW, STOCK GUARD & READS
-- ============================================================================

-- 0a. Per-store configurable return window (days after delivered_at; 0 disables limit)
alter table public.store_settings
  add column if not exists return_window_days integer not null default 14;

alter table public.store_settings drop constraint if exists store_settings_return_window_days_check;
alter table public.store_settings add constraint store_settings_return_window_days_check
  check (return_window_days between 0 and 365);

-- 0b. Orders: track single stock restoration + optional delivery token expiration
alter table public.orders
  add column if not exists stock_restored boolean not null default false,
  add column if not exists delivery_token_expires_at timestamptz null;

update public.orders
set stock_restored = true
where status = 'cancelled'
  and stock_restored = false;

-- Enforce unique Paymob transaction ID per store (prevents cross-order payment replay)
create unique index if not exists uidx_orders_store_payment_tx
  on public.orders (store_id, payment_transaction_id)
  where payment_transaction_id is not null;

-- 0c. Payment attempts ledger (maps every initiated paymob_order_id safely to an order)
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  paymob_order_id text not null unique,
  payment_method text not null check (payment_method in ('paymob_card', 'paymob_wallet')),
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_attempts_order
  on public.payment_attempts (order_id, created_at desc);

alter table public.payment_attempts enable row level security;
revoke all on public.payment_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.payment_attempts to service_role;

-- Backfill existing paymob_order_id mappings into payment_attempts
insert into public.payment_attempts (store_id, order_id, paymob_order_id, payment_method, created_at)
select
  o.store_id,
  o.id,
  o.paymob_order_id,
  case when o.payment_method = 'paymob_wallet' then 'paymob_wallet' else 'paymob_card' end,
  o.created_at
from public.orders o
where o.paymob_order_id is not null
  and length(trim(o.paymob_order_id)) > 0
on conflict (paymob_order_id) do nothing;

-- 0d. Wallet transactions: link return_request_id with unique partial index
alter table public.wallet_transactions
  add column if not exists return_request_id uuid null references public.return_requests(id) on delete set null;

create unique index if not exists uidx_wallet_transactions_return_request_id
  on public.wallet_transactions (return_request_id)
  where return_request_id is not null;

-- 0e. Per-user broadcast notification read receipts
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists idx_notification_reads_user
  on public.notification_reads (user_id, read_at desc);

alter table public.notification_reads enable row level security;
revoke all on public.notification_reads from public, anon, authenticated;
grant select, insert, delete on public.notification_reads to authenticated;
grant select, insert, update, delete on public.notification_reads to service_role;

drop policy if exists user_manage_own_notification_reads on public.notification_reads;
create policy user_manage_own_notification_reads
  on public.notification_reads
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- ============================================================================
-- 1. REMOVE DEAD `current_user` AUTH CHECKS & ISOLATE INTERNAL HELPERS
--    (CRIT-01, HIGH-11, HIGH-04)
-- ============================================================================

-- Lock down internal wallet redemption helper (only callable by store_checkout)
revoke all on function public.redeem_wallet_for_order(uuid, uuid, uuid, numeric) from public, anon, authenticated;

-- 1a. Private internal helper: refund wallet credit for a cancelled order
create or replace function public._internal_refund_wallet_for_cancelled_order(
  p_store_id uuid,
  p_order_id uuid,
  p_actor uuid default null
)
returns table(refunded boolean, amount numeric, balance_after numeric, user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_order public.orders%rowtype;
  v_current_balance numeric(12,2) := 0;
  v_next_balance numeric(12,2) := 0;
  v_refund numeric(12,2) := 0;
  v_existing public.wallet_transactions%rowtype;
  v_short_id text := left(p_order_id::text, 8);
begin
  select * into v_order
  from public.orders o
  where o.id = p_order_id
    and o.store_id = p_store_id
  for update;

  if not found or v_order.status <> 'cancelled' or v_order.user_id is null or coalesce(v_order.wallet_discount, 0) <= 0 then
    return query select false, 0::numeric, 0::numeric, v_order.user_id;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wallet:' || p_store_id::text || ':' || v_order.user_id::text, 0)
  );

  select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
  into v_current_balance
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.user_id = v_order.user_id;

  select * into v_existing
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.order_id = p_order_id
    and wt.type = 'order_refund'
  limit 1;

  if found then
    return query select false, v_existing.amount, v_current_balance, v_order.user_id;
    return;
  end if;

  v_refund := round(v_order.wallet_discount, 2);
  v_next_balance := round(v_current_balance + v_refund, 2);

  insert into public.wallet_transactions(
    store_id, user_id, order_id, type, amount, balance_after, note_ar, note_en, created_by
  )
  values(
    p_store_id,
    v_order.user_id,
    p_order_id,
    'order_refund',
    v_refund,
    v_next_balance,
    'استرداد رصيد المحفظة للطلب الملغي #' || v_short_id,
    'Wallet credit refunded for cancelled order #' || v_short_id,
    p_actor
  );

  return query select true, v_refund, v_next_balance, v_order.user_id;
end $$;

revoke all on function public._internal_refund_wallet_for_cancelled_order(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public._internal_refund_wallet_for_cancelled_order(uuid, uuid, uuid) to service_role;

-- Public-facing admin RPC: refund_wallet_for_cancelled_order (strict auth, NO current_user check)
create or replace function public.refund_wallet_for_cancelled_order(
  p_store_id uuid,
  p_order_id uuid
)
returns table(refunded boolean, amount numeric, balance_after numeric, user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if p_store_id is null or p_order_id is null then
    raise exception 'invalid_parameters';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or not (public.is_store_admin(p_store_id) or public.is_platform_super_admin())
     ) then
    raise exception 'not_authorized';
  end if;

  return query
  select r.refunded, r.amount, r.balance_after, r.user_id
  from public._internal_refund_wallet_for_cancelled_order(p_store_id, p_order_id, auth.uid()) r;
end $$;

revoke all on function public.refund_wallet_for_cancelled_order(uuid, uuid) from public, anon;
grant execute on function public.refund_wallet_for_cancelled_order(uuid, uuid) to authenticated, service_role;

-- Update cancel trigger to invoke private internal helper
create or replace function public.trigger_refund_wallet_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if old.status is distinct from 'cancelled'
     and old.status is distinct from 'delivered'
     and new.status = 'cancelled'
     and new.user_id is not null
     and coalesce(new.wallet_discount, 0) > 0 then
    perform public._internal_refund_wallet_for_cancelled_order(new.store_id, new.id, auth.uid());
  end if;
  return new;
end $$;

revoke all on function public.trigger_refund_wallet_on_cancel() from public, anon, authenticated;

-- 1b. Private internal helper: award order cashback on delivery
create or replace function public._internal_award_order_cashback(
  p_store_id uuid,
  p_order_id uuid,
  p_create_notification boolean default true,
  p_actor uuid default null
)
returns table(awarded boolean, amount numeric, balance_after numeric, user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_order public.orders%rowtype;
  v_settings public.store_settings%rowtype;
  v_current_balance numeric(12,2) := 0;
  v_next_balance numeric(12,2) := 0;
  v_eligible numeric(12,2) := 0;
  v_cashback numeric(12,2) := 0;
  v_existing public.wallet_transactions%rowtype;
  v_short_id text := left(p_order_id::text, 8);
  v_currency_ar text;
begin
  select * into v_order
  from public.orders o
  where o.id = p_order_id
    and o.store_id = p_store_id
  for update;

  if not found or v_order.status <> 'delivered' or v_order.user_id is null then
    return query select false, 0::numeric, 0::numeric, v_order.user_id;
    return;
  end if;

  select * into v_settings
  from public.store_settings s
  where s.store_id = p_store_id
  limit 1;

  if not found or not v_settings.cashback_enabled or coalesce(v_settings.cashback_percentage, 0) <= 0 then
    return query select false, 0::numeric, 0::numeric, v_order.user_id;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wallet:' || p_store_id::text || ':' || v_order.user_id::text, 0)
  );

  select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
  into v_current_balance
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.user_id = v_order.user_id;

  select * into v_existing
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.order_id = p_order_id
    and wt.type = 'cashback_earned'
  limit 1;

  if found then
    return query select false, v_existing.amount, v_current_balance, v_order.user_id;
    return;
  end if;

  v_eligible := greatest(0::numeric, coalesce(v_order.subtotal, 0) - coalesce(v_order.wallet_discount, 0));
  v_cashback := round(v_eligible * v_settings.cashback_percentage / 100.0, 2);

  if v_cashback <= 0 then
    return query select false, 0::numeric, v_current_balance, v_order.user_id;
    return;
  end if;

  v_next_balance := round(v_current_balance + v_cashback, 2);

  insert into public.wallet_transactions(
    store_id, user_id, order_id, type, amount, balance_after, note_ar, note_en, created_by
  )
  values(
    p_store_id,
    v_order.user_id,
    p_order_id,
    'cashback_earned',
    v_cashback,
    v_next_balance,
    'كاش باك على الطلب #' || v_short_id,
    'Cashback earned on order #' || v_short_id,
    p_actor
  );

  update public.orders
  set cashback_earned = v_cashback
  where id = p_order_id;

  if coalesce(p_create_notification, true) then
    v_currency_ar := case when upper(trim(v_settings.currency)) = 'EGP' then 'ج.م' else v_settings.currency end;
    insert into public.notifications(
      store_id, user_id, target_role, category,
      title_ar, title_en, body_ar, body_en,
      deep_link, data, dedupe_key
    )
    values(
      p_store_id,
      v_order.user_id,
      'customer',
      'order_update',
      'تم إضافة ' || to_char(v_cashback, 'FM999999990.##') || ' ' || v_currency_ar || ' كاش باك إلى محفظتك!',
      to_char(v_cashback, 'FM999999990.##') || ' ' || v_settings.currency || ' cashback added to your wallet!',
      'مبروك! ربحت ' || to_char(v_cashback, 'FM999999990.##') || ' ' || v_currency_ar || ' كاش باك عن الطلب #' || v_short_id || '. رصيدك الحالي: ' || to_char(v_next_balance, 'FM999999990.##') || ' ' || v_currency_ar || '.',
      'Congrats! You earned ' || to_char(v_cashback, 'FM999999990.##') || ' ' || v_settings.currency || ' cashback on order #' || v_short_id || '. Current balance: ' || to_char(v_next_balance, 'FM999999990.##') || ' ' || v_settings.currency || '.',
      '/account',
      jsonb_build_object('order_id', p_order_id, 'cashback_amount', v_cashback, 'balance_after', v_next_balance),
      'wallet_cashback:' || p_order_id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return query select true, v_cashback, v_next_balance, v_order.user_id;
end $$;

revoke all on function public._internal_award_order_cashback(uuid, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public._internal_award_order_cashback(uuid, uuid, boolean, uuid) to service_role;

-- Public-facing admin RPC: award_order_cashback (strict auth, NO current_user check, revoked from anon)
create or replace function public.award_order_cashback(
  p_store_id uuid,
  p_order_id uuid,
  p_create_notification boolean default true
)
returns table(awarded boolean, amount numeric, balance_after numeric, user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if p_store_id is null or p_order_id is null then
    raise exception 'invalid_parameters';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or not (public.is_store_admin(p_store_id) or public.is_platform_super_admin())
     ) then
    raise exception 'not_authorized';
  end if;

  return query
  select r.awarded, r.amount, r.balance_after, r.user_id
  from public._internal_award_order_cashback(p_store_id, p_order_id, p_create_notification, auth.uid()) r;
end $$;

revoke all on function public.award_order_cashback(uuid, uuid, boolean) from public, anon;
grant execute on function public.award_order_cashback(uuid, uuid, boolean) to authenticated, service_role;


-- ============================================================================
-- 2. HARDEN STORAGE `product-images` POLICIES (CRIT-04)
--    Store-scoped folder isolation: <store_id>/... or app-icons/<store_id>/...
--    or banners/<store_id>/... (plus platform super-admin override).
-- ============================================================================

drop policy if exists nova_upload_images on storage.objects;
create policy nova_upload_images on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and name !~ '(^|/)\.\.(/|$)'
    and (
      (select public.is_platform_super_admin())
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[1])::uuid))
      )
      or (
        (storage.foldername(name))[1] in ('app-icons', 'banners')
        and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[2])::uuid))
      )
    )
  );

drop policy if exists nova_delete_images on storage.objects;
create policy nova_delete_images on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and name !~ '(^|/)\.\.(/|$)'
    and (
      (select public.is_platform_super_admin())
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[1])::uuid))
      )
      or (
        (storage.foldername(name))[1] in ('app-icons', 'banners')
        and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[2])::uuid))
      )
    )
  );

drop policy if exists nova_update_images on storage.objects;
create policy nova_update_images on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and name !~ '(^|/)\.\.(/|$)'
    and (
      (select public.is_platform_super_admin())
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[1])::uuid))
      )
      or (
        (storage.foldername(name))[1] in ('app-icons', 'banners')
        and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[2])::uuid))
      )
    )
  )
  with check (
    bucket_id = 'product-images'
    and name !~ '(^|/)\.\.(/|$)'
    and (
      (select public.is_platform_super_admin())
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[1])::uuid))
      )
      or (
        (storage.foldername(name))[1] in ('app-icons', 'banners')
        and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and (select public.is_store_admin(((storage.foldername(name))[2])::uuid))
      )
    )
  );


-- ============================================================================
-- 3. PREVENT RETURN REFUND/STOCK INFLATION, CASHBACK FARMING & DOUBLE RESTOCK
--    (CRIT-05, HIGH-04, CRIT-01)
-- ============================================================================

-- 3a. Revoke direct UPDATE on public.return_requests from authenticated
drop policy if exists admin_update_store_return_requests on public.return_requests;
revoke update on public.return_requests from authenticated;

-- 3b. Block delivered -> cancelled and cancelled -> non-cancelled order transitions
create or replace function public.guard_order_status_transitions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if old.status = 'delivered' and new.status = 'cancelled' then
    raise exception 'cannot_cancel_delivered_order';
  end if;
  if old.status = 'cancelled' and new.status is distinct from 'cancelled' then
    raise exception 'cannot_reopen_cancelled_order';
  end if;
  return new;
end $$;

revoke all on function public.guard_order_status_transitions() from public, anon, authenticated;

drop trigger if exists trg_guard_order_status_transitions on public.orders;
create trigger trg_guard_order_status_transitions
  before update of status on public.orders
  for each row
  execute function public.guard_order_status_transitions();

-- 3c. Single-use, store-scoped stock restoration on order cancellation
create or replace function public.restore_order_stock_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  item record;
  v_marked integer := 0;
begin
  if old.status is distinct from 'cancelled'
     and old.status is distinct from 'delivered'
     and new.status = 'cancelled'
     and not coalesce(old.stock_restored, false) then
    update public.orders
    set stock_restored = true
    where id = new.id
      and stock_restored = false;

    get diagnostics v_marked = row_count;
    if v_marked = 0 then
      return new;
    end if;

    for item in
      select oi.product_id, sum(oi.quantity)::integer as qty
      from public.order_items oi
      where oi.order_id = new.id and oi.product_id is not null
      group by oi.product_id
      order by oi.product_id
    loop
      update public.products p
      set stock = p.stock + item.qty
      where p.id = item.product_id
        and p.store_id = new.store_id;
    end loop;
  end if;
  return new;
end $$;

revoke all on function public.restore_order_stock_on_cancel() from public, anon, authenticated;

-- 3d. Hardened submit_return_request (group strictly by oi.id, reject duplicates/ambiguity,
--     source variant_id from server order_items only, enforce return_window_days)
create or replace function public.submit_return_request(
  p_store_id uuid,
  p_order_id uuid,
  p_request_type text,
  p_refund_method text,
  p_reason text,
  p_customer_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.return_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_return_window_days integer := 14;
  v_req_type text := lower(trim(coalesce(p_request_type, 'return')));
  v_refund_method text := lower(trim(coalesce(p_refund_method, 'wallet')));
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
  v_notes text := nullif(left(trim(coalesce(p_customer_notes, '')), 1000), '');
  v_entry jsonb;
  v_req_oi_id uuid;
  v_req_prod_id uuid;
  v_req_size text;
  v_req_color text;
  v_req_qty integer;
  v_match_count integer;
  v_matched_oi_id uuid;
  v_seen_oi_ids uuid[] := array[]::uuid[];
  v_oi public.order_items%rowtype;
  v_has_oi_variant_col boolean := false;
  v_server_variant_id uuid;
  v_normalized_items jsonb := '[]'::jsonb;
  v_gross_selected numeric(12,2) := 0;
  v_gross_order_items numeric(12,2) := 0;
  v_refund_amount numeric(12,2) := 0;
  v_line_total numeric(12,2) := 0;
  v_matched_count integer := 0;
  v_created public.return_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null or p_order_id is null then
    raise exception 'invalid_return_request';
  end if;

  if v_req_type not in ('return', 'exchange') then
    raise exception 'invalid_request_type';
  end if;

  if v_refund_method not in ('wallet', 'original_payment') then
    raise exception 'invalid_refund_method';
  end if;

  if length(v_reason) < 2 then
    raise exception 'reason_required';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 100 then
    raise exception 'items_required';
  end if;

  -- Lock order row to serialize concurrent return submissions
  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.store_id = p_store_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.user_id is distinct from v_uid then
    raise exception 'not_authorized';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'order_not_delivered';
  end if;

  -- Enforce optional per-store return window (default 14 days from delivered_at)
  select coalesce(ss.return_window_days, 14)
  into v_return_window_days
  from public.store_settings ss
  where ss.store_id = p_store_id
  limit 1;

  if coalesce(v_return_window_days, 14) > 0
     and v_order.delivered_at is not null
     and now() > v_order.delivered_at + make_interval(days => v_return_window_days) then
    raise exception 'return_window_expired';
  end if;

  if exists (
    select 1
    from public.return_requests rr
    where rr.order_id = p_order_id
      and rr.status in ('pending', 'approved', 'received', 'refunded')
  ) then
    raise exception 'return_already_exists';
  end if;

  select coalesce(round(sum(oi.unit_price * oi.quantity), 2), 0)
  into v_gross_order_items
  from public.order_items oi
  where oi.order_id = p_order_id;

  select exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'order_items'
      and c.column_name = 'variant_id'
  ) into v_has_oi_variant_col;

  -- Validate every line strictly: unique oi.id, no duplicates, no ambiguous matches, server-only variant_id
  for v_entry in
    select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'invalid_return_items';
    end if;

    v_req_qty := case
      when (v_entry->>'quantity') ~ '^[1-9][0-9]{0,4}$' then (v_entry->>'quantity')::integer
      else 0
    end;
    if v_req_qty <= 0 then
      raise exception 'invalid_return_quantity';
    end if;

    v_req_oi_id := null;
    if nullif(trim(coalesce(v_entry->>'order_item_id', '')), '') is not null then
      if trim(v_entry->>'order_item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid_return_items';
      end if;
      v_req_oi_id := trim(v_entry->>'order_item_id')::uuid;
    end if;

    v_req_prod_id := null;
    if nullif(trim(coalesce(v_entry->>'product_id', '')), '') is not null then
      if trim(v_entry->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid_return_items';
      end if;
      v_req_prod_id := trim(v_entry->>'product_id')::uuid;
    end if;

    v_req_size := nullif(trim(coalesce(v_entry->>'size', '')), '');
    v_req_color := nullif(trim(coalesce(v_entry->>'color', '')), '');

    if v_req_oi_id is not null then
      select count(*)::integer, min(oi.id::text)::uuid
      into v_match_count, v_matched_oi_id
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.id = v_req_oi_id;
    elsif v_req_prod_id is not null then
      select count(*)::integer, min(oi.id::text)::uuid
      into v_match_count, v_matched_oi_id
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.product_id = v_req_prod_id
        and coalesce(oi.size, '') = coalesce(v_req_size, '')
        and coalesce(oi.color, '') = coalesce(v_req_color, '');
    else
      raise exception 'invalid_return_items';
    end if;

    if v_match_count = 0 or v_matched_oi_id is null then
      raise exception 'invalid_return_items';
    end if;
    if v_match_count > 1 then
      raise exception 'ambiguous_return_item';
    end if;

    -- Reject duplicate order_item_id lines (prevents refund/stock inflation)
    if v_matched_oi_id = any(v_seen_oi_ids) then
      raise exception 'duplicate_return_item';
    end if;
    v_seen_oi_ids := array_append(v_seen_oi_ids, v_matched_oi_id);

    select *
    into v_oi
    from public.order_items oi
    where oi.id = v_matched_oi_id
      and oi.order_id = p_order_id;

    if not found or v_req_qty > v_oi.quantity then
      raise exception 'invalid_return_quantity';
    end if;

    v_server_variant_id := null;
    if v_has_oi_variant_col then
      execute 'select variant_id from public.order_items where id = $1 and order_id = $2'
      into v_server_variant_id
      using v_oi.id, p_order_id;
    end if;

    v_line_total := round(v_oi.unit_price * v_req_qty, 2);
    v_gross_selected := round(v_gross_selected + v_line_total, 2);
    v_matched_count := v_matched_count + 1;

    v_normalized_items := v_normalized_items || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'order_item_id', v_oi.id,
          'product_id', v_oi.product_id,
          'variant_id', v_server_variant_id,
          'product_name', v_oi.product_name,
          'quantity', v_req_qty,
          'max_quantity', v_oi.quantity,
          'unit_price', v_oi.unit_price,
          'line_total', v_line_total,
          'size', v_oi.size,
          'color', v_oi.color
        )
      )
    );
  end loop;

  if v_matched_count = 0 then
    raise exception 'invalid_return_items';
  end if;

  if v_gross_order_items > 0
     and v_order.subtotal is not null
     and v_order.subtotal < v_gross_order_items then
    v_refund_amount := round(v_gross_selected * (v_order.subtotal / v_gross_order_items), 2);
  else
    v_refund_amount := v_gross_selected;
  end if;

  if v_order.subtotal is not null then
    v_refund_amount := least(v_refund_amount, greatest(0::numeric, v_order.subtotal));
  end if;

  insert into public.return_requests (
    store_id,
    order_id,
    user_id,
    request_type,
    status,
    refund_method,
    reason,
    customer_notes,
    refund_amount,
    items,
    restocked,
    wallet_credited
  )
  values (
    p_store_id,
    p_order_id,
    v_uid,
    v_req_type,
    'pending',
    v_refund_method,
    v_reason,
    v_notes,
    v_refund_amount,
    v_normalized_items,
    false,
    false
  )
  returning * into v_created;

  return v_created;
end $$;

revoke all on function public.submit_return_request(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_return_request(uuid, uuid, text, text, text, text, jsonb) to authenticated, service_role;

-- 3e. Hardened admin_process_return_request:
--     - Strict auth (NO current_user check)
--     - Scoped product_variants restock by (id, product_id, store_id)
--     - Proportional cashback_earned clawback + unique wallet_transactions(return_request_id)
--     - Distinct bilingual customer notification for every status transition keyed on (return_id, new_status)
create or replace function public.admin_process_return_request(
  p_return_id uuid,
  p_action text,
  p_admin_notes text default null,
  p_restock boolean default true
)
returns public.return_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_req public.return_requests%rowtype;
  v_order public.orders%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_notes text := case
    when p_admin_notes is null then null
    else nullif(left(trim(p_admin_notes), 1000), '')
  end;
  v_should_restock boolean := coalesce(p_restock, true);
  v_restocked boolean;
  v_wallet_credited boolean;
  v_prev_status text;
  v_next_status text;
  v_item jsonb;
  v_prod_id uuid;
  v_variant_id uuid;
  v_qty integer;
  v_current_balance numeric(12,2) := 0;
  v_cashback_clawback numeric(12,2) := 0;
  v_net_refund numeric(12,2) := 0;
  v_next_balance numeric(12,2) := 0;
  v_settings public.store_settings%rowtype;
  v_currency_ar text := 'ج.م';
  v_currency_en text := 'EGP';
  v_short_order text;
  v_short_return text;
  v_has_variants_table boolean := false;
  v_type_ar text;
  v_type_en text;
  v_notif_title_ar text;
  v_notif_title_en text;
  v_notif_body_ar text;
  v_notif_body_en text;
begin
  if p_return_id is null then
    raise exception 'return_request_not_found';
  end if;

  if v_action not in ('approve', 'reject', 'mark_received', 'complete_refund') then
    raise exception 'invalid_return_action';
  end if;

  select *
  into v_req
  from public.return_requests rr
  where rr.id = p_return_id
  for update;

  if not found then
    raise exception 'return_request_not_found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or not (public.is_store_admin(v_req.store_id) or public.is_platform_super_admin())
     ) then
    raise exception 'not_authorized';
  end if;

  v_prev_status := v_req.status;
  v_restocked := v_req.restocked;
  v_wallet_credited := v_req.wallet_credited;
  v_short_order := left(v_req.order_id::text, 8);
  v_short_return := left(v_req.id::text, 8);
  v_type_ar := case when v_req.request_type = 'exchange' then 'الاستبدال' else 'الإرجاع' end;
  v_type_en := case when v_req.request_type = 'exchange' then 'exchange' else 'return' end;

  if v_action = 'approve' then
    if v_req.status not in ('pending', 'approved') then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'approved';

  elsif v_action = 'reject' then
    if v_req.status not in ('pending', 'approved', 'rejected') then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'rejected';

  elsif v_action = 'mark_received' then
    if v_req.status not in ('pending', 'approved', 'received') then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'received';

  elsif v_action = 'complete_refund' then
    if v_req.status = 'rejected' then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'refunded';
  end if;

  -- Atomic Inventory Restock (idempotent via v_restocked guard, store-scoped)
  if v_action in ('mark_received', 'complete_refund')
     and v_should_restock
     and not v_restocked then
    v_has_variants_table := (to_regclass('public.product_variants') is not null);

    for v_item in
      select elem
      from jsonb_array_elements(coalesce(v_req.items, '[]'::jsonb)) as elem
    loop
      v_qty := case
        when (v_item->>'quantity') ~ '^[1-9][0-9]{0,4}$' then (v_item->>'quantity')::integer
        else 0
      end;
      if v_qty <= 0 then
        continue;
      end if;

      v_prod_id := null;
      if nullif(trim(coalesce(v_item->>'order_item_id', '')), '') is not null then
        select oi.product_id
        into v_prod_id
        from public.order_items oi
        where oi.id = (v_item->>'order_item_id')::uuid
          and oi.order_id = v_req.order_id;
      end if;
      if v_prod_id is null and nullif(trim(coalesce(v_item->>'product_id', '')), '') is not null then
        v_prod_id := trim(v_item->>'product_id')::uuid;
      end if;

      if v_prod_id is not null then
        update public.products p
        set stock = p.stock + v_qty
        where p.id = v_prod_id
          and p.store_id = v_req.store_id;
      end if;

      v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;
      if v_has_variants_table and v_variant_id is not null and v_prod_id is not null then
        execute
          'update public.product_variants pv
             set stock_qty = pv.stock_qty + $1
            from public.products p
           where pv.id = $2
             and pv.product_id = $3
             and p.id = pv.product_id
             and p.store_id = $4'
        using v_qty, v_variant_id, v_prod_id, v_req.store_id;
      end if;
    end loop;

    v_restocked := true;
  end if;

  -- Load currency formatting for notifications
  select * into v_settings
  from public.store_settings ss
  where ss.store_id = v_req.store_id
  limit 1;

  if found then
    v_currency_en := coalesce(nullif(trim(v_settings.currency), ''), 'EGP');
    v_currency_ar := case when upper(v_currency_en) = 'EGP' then 'ج.م' else v_currency_en end;
  end if;

  -- Atomic Store Wallet Credit Refund with proportional cashback_earned clawback
  if v_action = 'complete_refund'
     and v_req.refund_method = 'wallet'
     and not v_wallet_credited
     and coalesce(v_req.refund_amount, 0) > 0 then
    perform pg_advisory_xact_lock(
      hashtextextended('wallet:' || v_req.store_id::text || ':' || v_req.user_id::text, 0)
    );

    if not exists (
      select 1 from public.wallet_transactions wt
      where wt.return_request_id = v_req.id
    ) then
      select * into v_order
      from public.orders o
      where o.id = v_req.order_id
        and o.store_id = v_req.store_id
      for update;

      v_cashback_clawback := 0;
      if found and coalesce(v_order.cashback_earned, 0) > 0 and coalesce(v_order.subtotal, 0) > 0 then
        v_cashback_clawback := round(
          least(
            v_order.cashback_earned,
            v_order.cashback_earned * least(1::numeric, v_req.refund_amount / v_order.subtotal)
          ),
          2
        );
      end if;

      v_net_refund := round(greatest(0::numeric, v_req.refund_amount - v_cashback_clawback), 2);

      select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
      into v_current_balance
      from public.wallet_transactions wt
      where wt.store_id = v_req.store_id
        and wt.user_id = v_req.user_id;

      v_next_balance := round(v_current_balance + v_net_refund, 2);

      if v_net_refund > 0 then
        insert into public.wallet_transactions (
          store_id,
          user_id,
          order_id,
          return_request_id,
          type,
          amount,
          balance_after,
          note_ar,
          note_en,
          created_by
        )
        values (
          v_req.store_id,
          v_req.user_id,
          v_req.order_id,
          v_req.id,
          'return_refund',
          v_net_refund,
          v_next_balance,
          'استرداد طلب ' || v_type_ar || ' #' || v_short_return || ' للطلب #' || v_short_order
            || case when v_cashback_clawback > 0 then ' (بعد خصم كاش باك ' || to_char(v_cashback_clawback, 'FM999999990.##') || ')' else '' end,
          initcap(v_type_en) || ' refund #' || v_short_return || ' credited for order #' || v_short_order
            || case when v_cashback_clawback > 0 then ' (net of ' || to_char(v_cashback_clawback, 'FM999999990.##') || ' cashback adjustment)' else '' end,
          auth.uid()
        );
      end if;

      if v_cashback_clawback > 0 then
        update public.orders
        set cashback_earned = greatest(0::numeric, cashback_earned - v_cashback_clawback)
        where id = v_req.order_id
          and store_id = v_req.store_id;
      end if;
    end if;

    v_wallet_credited := true;
  end if;

  update public.return_requests
  set status = v_next_status,
      admin_notes = case
        when p_admin_notes is not null then v_notes
        else admin_notes
      end,
      restocked = v_restocked,
      wallet_credited = v_wallet_credited,
      updated_at = now()
  where id = v_req.id
  returning * into v_req;

  -- Distinct bilingual customer notification for every status transition keyed on (return_id, new_status)
  if v_next_status in ('approved', 'rejected', 'received', 'refunded')
     and (v_next_status is distinct from v_prev_status or v_next_status = 'refunded') then
    if v_next_status = 'approved' then
      v_notif_title_ar := 'تمت الموافقة على طلب ' || v_type_ar || ' #' || v_short_return;
      v_notif_title_en := initcap(v_type_en) || ' request #' || v_short_return || ' approved';
      v_notif_body_ar := 'تمت الموافقة على طلب ' || v_type_ar || ' للطلب #' || v_short_order || '. يرجى تجهيز المنتجات للتسليم.';
      v_notif_body_en := 'Your ' || v_type_en || ' request for order #' || v_short_order || ' has been approved. Please prepare your items for pickup.';
    elsif v_next_status = 'rejected' then
      v_notif_title_ar := 'تحديث بشأن طلب ' || v_type_ar || ' #' || v_short_return;
      v_notif_title_en := 'Update on ' || v_type_en || ' request #' || v_short_return;
      v_notif_body_ar := 'نأسف، لم تتم الموافقة على طلب ' || v_type_ar || ' للطلب #' || v_short_order || '.'
        || case when v_req.admin_notes is not null then ' ملاحظة: ' || left(v_req.admin_notes, 180) else '' end;
      v_notif_body_en := 'Your ' || v_type_en || ' request for order #' || v_short_order || ' was declined.'
        || case when v_req.admin_notes is not null then ' Note: ' || left(v_req.admin_notes, 180) else '' end;
    elsif v_next_status = 'received' then
      v_notif_title_ar := 'تم استلام شحنة ' || v_type_ar || ' #' || v_short_return;
      v_notif_title_en := initcap(v_type_en) || ' items received (#' || v_short_return || ')';
      v_notif_body_ar := 'استلم المتجر منتجات طلب ' || v_type_ar || ' للطلب #' || v_short_order || ' وجارٍ إتمام الاسترداد.';
      v_notif_body_en := 'We received your ' || v_type_en || ' items for order #' || v_short_order || ' and are finalizing your refund.';
    else
      if v_req.refund_method = 'wallet' and v_wallet_credited then
        v_notif_title_ar := 'تم إيداع ' || to_char(coalesce(nullif(v_net_refund, 0), v_req.refund_amount), 'FM999999990.##') || ' ' || v_currency_ar || ' في محفظة المتجر';
        v_notif_title_en := to_char(coalesce(nullif(v_net_refund, 0), v_req.refund_amount), 'FM999999990.##') || ' ' || v_currency_en || ' refunded to your Store Wallet';
        v_notif_body_ar := 'تم إتمام طلب ' || v_type_ar || ' #' || v_short_return || ' للطلب #' || v_short_order || ' وإيداع المبلغ في محفظتك.';
        v_notif_body_en := 'Your ' || v_type_en || ' #' || v_short_return || ' for order #' || v_short_order || ' is complete and credited to your Store Wallet.';
      else
        v_notif_title_ar := 'تم إتمام الاسترداد لطلب ' || v_type_ar || ' #' || v_short_return;
        v_notif_title_en := 'Refund completed for ' || v_type_en || ' #' || v_short_return;
        v_notif_body_ar := 'تم إتمام استرداد مبلغ ' || to_char(v_req.refund_amount, 'FM999999990.##') || ' ' || v_currency_ar || ' للطلب #' || v_short_order || '.';
        v_notif_body_en := 'Your refund of ' || to_char(v_req.refund_amount, 'FM999999990.##') || ' ' || v_currency_en || ' for order #' || v_short_order || ' has been completed.';
      end if;
    end if;

    insert into public.notifications (
      store_id,
      user_id,
      target_role,
      category,
      title_ar,
      title_en,
      body_ar,
      body_en,
      deep_link,
      data,
      dedupe_key
    )
    values (
      v_req.store_id,
      v_req.user_id,
      'customer',
      'order_update',
      v_notif_title_ar,
      v_notif_title_en,
      v_notif_body_ar,
      v_notif_body_en,
      '/orders/' || v_req.order_id::text,
      jsonb_build_object(
        'order_id', v_req.order_id,
        'return_id', v_req.id,
        'return_status', v_next_status,
        'refund_amount', v_req.refund_amount,
        'net_wallet_refund', v_net_refund,
        'cashback_clawback', v_cashback_clawback
      ),
      'return_status:' || v_req.id::text || ':' || v_next_status
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return v_req;
end $$;

revoke all on function public.admin_process_return_request(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_process_return_request(uuid, text, text, boolean) to authenticated, service_role;


-- ============================================================================
-- 4. STOP UNVERIFIED PHONE/EMAIL ACCOUNT & STORE HIJACKING
--    (CRIT-06, CRIT-07, HIGH-05, M2, M5)
-- ============================================================================

-- 4a. Hardened sync_customer_profile:
--     - Remove unverified phone-based guest order/CRM claiming
--     - Require email_confirmed_at IS NOT NULL for email-based claiming
create or replace function public.sync_customer_profile(
  p_full_name text default '',
  p_phone text default '',
  p_city text default '',
  p_address text default '',
  p_governorate text default '',
  p_store_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_email_confirmed boolean := false;
  v_store_id uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_phone_variants text[] := array[]::text[];
  v_name text := left(trim(coalesce(p_full_name, '')), 120);
  v_gov text := left(trim(coalesce(p_governorate, '')), 100);
  v_city text := left(trim(coalesce(p_city, '')), 100);
  v_addr text := left(trim(coalesce(p_address, '')), 500);
  v_cust_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if not exists (select 1 from public.store_settings s where s.store_id = v_store_id) then
    raise exception 'unknown_store';
  end if;

  select
    coalesce(u.email, ''),
    (u.email_confirmed_at is not null)
  into v_email, v_email_confirmed
  from auth.users u
  where u.id = v_uid;

  if v_phone ~ '^2001[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 4);
  elsif v_phone ~ '^00201[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 5);
  end if;

  if v_phone ~ '^01[0125][0-9]{8}$' then
    v_phone_variants := array[v_phone, '20' || substr(v_phone, 2)];
  elsif v_phone ~ '^201[0125][0-9]{8}$' then
    v_phone_variants := array['0' || substr(v_phone, 3), v_phone];
    v_phone := '0' || substr(v_phone, 3);
  elsif length(v_phone) >= 8 then
    v_phone_variants := array[v_phone];
  end if;

  select sc.id into v_cust_id
  from public.store_customers sc
  where sc.store_id = v_store_id
    and sc.user_id = v_uid;

  -- Only claim an unclaimed CRM record by CONFIRMED email (never by unverified phone)
  if v_cust_id is null and v_email_confirmed and length(trim(v_email)) > 3 then
    select sc.id into v_cust_id
    from public.store_customers sc
    where sc.store_id = v_store_id
      and sc.user_id is null
      and lower(trim(sc.email)) = lower(trim(v_email))
    order by sc.updated_at desc
    limit 1;
  end if;

  -- Prevent stealing or colliding on a phone number owned by another user or unclaimed guest row
  if length(v_phone) >= 8 and exists (
    select 1
    from public.store_customers sc
    where sc.store_id = v_store_id
      and (v_cust_id is null or sc.id <> v_cust_id)
      and sc.phone = any(v_phone_variants)
      and sc.user_id is not null
  ) then
    raise exception 'phone_already_in_use';
  end if;

  -- If an unclaimed guest row holds the same phone, clear its phone only if it has no email conflict?
  -- Better: keep guest rows intact and do NOT hijack them; clear phone collision only on current user if unique index would conflict.
  if length(v_phone) >= 8 and exists (
    select 1
    from public.store_customers sc
    where sc.store_id = v_store_id
      and (v_cust_id is null or sc.id <> v_cust_id)
      and sc.user_id is null
      and sc.phone = v_phone
  ) then
    -- Do NOT claim the guest row or its orders; detach phone only if we need to avoid unique index failure?
    -- No: leave guest row untouched; only raise if phone collision cannot be stored.
    -- Store phone on authenticated user safely only when not conflicting.
    v_phone := '';
  end if;

  if v_cust_id is null then
    insert into public.store_customers (
      store_id, user_id, full_name, phone, email, governorate, city, address
    )
    values (
      v_store_id, v_uid, v_name, v_phone, v_email, v_gov, v_city, v_addr
    )
    returning id into v_cust_id;
  else
    update public.store_customers
    set user_id = v_uid,
        full_name = case when length(v_name) > 0 then v_name else full_name end,
        phone = case when length(v_phone) >= 8 then v_phone else phone end,
        email = case when length(v_email) > 0 then v_email else email end,
        governorate = case when length(v_gov) > 0 then v_gov else governorate end,
        city = case when length(v_city) > 0 then v_city else city end,
        address = case when length(v_addr) > 0 then v_addr else address end,
        updated_at = now()
    where id = v_cust_id;
  end if;

  -- Claim guest orders ONLY when the user's email is verified
  if v_email_confirmed and length(trim(v_email)) > 3 then
    update public.orders
    set user_id = v_uid,
        customer_id = v_cust_id
    where store_id = v_store_id
      and user_id is null
      and customer_id in (
        select sc.id
        from public.store_customers sc
        where sc.store_id = v_store_id
          and sc.user_id is null
          and lower(trim(sc.email)) = lower(trim(v_email))
      );
  end if;

  update public.orders
  set customer_id = v_cust_id
  where store_id = v_store_id
    and user_id = v_uid
    and customer_id is null;

  return v_cust_id;
end $$;

revoke all on function public.sync_customer_profile(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.sync_customer_profile(text, text, text, text, text, uuid) to authenticated, service_role;

-- 4b. Hardened claim_pending_store_ownership & super_admin_assign_store_owner (CRIT-07, M5)
create or replace function public.claim_pending_store_ownership()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_claimed integer := 0;
  v_rec record;
begin
  if v_uid is null then
    return 0;
  end if;

  -- Require confirmed email before claiming pending store ownership
  select lower(trim(coalesce(u.email::text, '')))
  into v_email
  from auth.users u
  where u.id = v_uid
    and u.email_confirmed_at is not null
  limit 1;

  if length(v_email) < 3 then
    return 0;
  end if;

  for v_rec in
    select st.id, st.owner_user_id
    from public.stores st
    where st.pending_owner_email is not null
      and lower(trim(st.pending_owner_email)) = v_email
    for update
  loop
    -- Demote / remove previous owner membership when handing over ownership
    if v_rec.owner_user_id is not null and v_rec.owner_user_id <> v_uid then
      delete from public.store_members
      where store_id = v_rec.id
        and user_id = v_rec.owner_user_id;

      update public.profiles
      set role = 'customer'
      where id = v_rec.owner_user_id
        and store_id = v_rec.id
        and role = 'admin';
    end if;

    insert into public.store_members (store_id, user_id, role)
    values (v_rec.id, v_uid, 'owner')
    on conflict on constraint store_members_pkey
    do update set role = 'owner';

    update public.stores st
    set owner_user_id = v_uid,
        pending_owner_email = null,
        updated_at = now()
    where st.id = v_rec.id;

    v_claimed := v_claimed + 1;
  end loop;

  return v_claimed;
end $$;

revoke all on function public.claim_pending_store_ownership() from public, anon;
grant execute on function public.claim_pending_store_ownership() to authenticated, service_role;

create or replace function public.super_admin_assign_store_owner(
  p_store_id uuid,
  p_owner_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_user_id uuid := null;
  v_prev_owner_id uuid := null;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_platform_super_admin() then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null then
    raise exception 'unknown_store';
  end if;

  select st.owner_user_id
  into v_prev_owner_id
  from public.stores st
  where st.id = p_store_id
  for update;

  if not found then
    raise exception 'unknown_store';
  end if;

  if length(v_email) < 5 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  -- Only assign immediately if the target user has a confirmed email
  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email::text, ''))) = v_email
    and u.email_confirmed_at is not null
  order by u.created_at asc
  limit 1;

  if v_user_id is not null then
    -- Demote / clean up previous owner membership on reassignment
    if v_prev_owner_id is not null and v_prev_owner_id <> v_user_id then
      delete from public.store_members
      where store_id = p_store_id
        and user_id = v_prev_owner_id;

      update public.profiles
      set role = 'customer'
      where id = v_prev_owner_id
        and store_id = p_store_id
        and role = 'admin';
    end if;

    update public.stores st
    set owner_user_id = v_user_id,
        pending_owner_email = null,
        updated_at = now()
    where st.id = p_store_id;

    insert into public.store_members (store_id, user_id, role)
    values (p_store_id, v_user_id, 'owner')
    on conflict on constraint store_members_pkey
    do update set role = 'owner';

    return jsonb_build_object(
      'status', 'assigned',
      'owner_email', v_email,
      'user_id', v_user_id
    );
  end if;

  update public.stores st
  set pending_owner_email = v_email,
      updated_at = now()
  where st.id = p_store_id;

  return jsonb_build_object(
    'status', 'pending_signup',
    'pending_owner_email', v_email
  );
end $$;

revoke all on function public.super_admin_assign_store_owner(uuid, text) from public, anon;
grant execute on function public.super_admin_assign_store_owner(uuid, text) to authenticated, service_role;

-- 4c. Restrict `anon` column-level SELECT on stores, products, and product_reviews
revoke select on public.stores from anon;
grant select (id, name_ar, name_en, slug, custom_domain, status, plan) on public.stores to anon;

do $$
declare
  v_prod_cols text;
  v_rev_cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
  into v_prod_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'products'
    and c.column_name <> 'cost_price';

  if v_prod_cols is not null then
    execute 'revoke select on public.products from anon';
    execute format('grant select (%s) on public.products to anon', v_prod_cols);
  end if;

  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
  into v_rev_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'product_reviews'
    and c.column_name not in ('order_id', 'user_id');

  if v_rev_cols is not null then
    execute 'revoke select on public.product_reviews from anon';
    execute format('grant select (%s) on public.product_reviews to anon', v_rev_cols);
  end if;
end $$;

-- 4d. Hardened store_checkout: restrict guest phone lookup to user_id IS NULL (HIGH-05)
create or replace function public.store_checkout(
  request_key uuid,
  address text,
  customer_phone text,
  payment text,
  lines jsonb,
  p_coupon_code text default null,
  p_customer_name text default null,
  p_use_wallet boolean default false,
  p_store_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
)
returns table(order_number uuid, amount numeric, order_currency text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  customer uuid := auth.uid();
  v_store_id uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
  v_store_status text;
  v_payment text := case
    when upper(trim(coalesce(payment, ''))) = 'COD' then 'cod'
    else lower(trim(coalesce(payment, '')))
  end;
  v_pay_status text;
  v_order_status text := 'pending';
  fingerprint text;
  prior public.orders%rowtype;
  settings public.store_settings%rowtype;
  product public.products%rowtype;
  entry jsonb;
  item_quantity integer;
  chosen_size text;
  chosen_color text;
  v_unit_price numeric := 0;
  gross_subtotal numeric := 0;
  discount_val numeric := 0;
  net_subtotal numeric := 0;
  v_shipping_fee numeric := 0;
  v_pre_wallet_total numeric := 0;
  v_wallet_discount numeric := 0;
  v_remaining_total numeric := 0;
  applied_coupon text := null;
  c public.coupons%rowtype;
  v_coupon_clean text := upper(trim(coalesce(p_coupon_code, '')));
  v_address text := trim(coalesce(address, ''));
  v_cust_name text := trim(coalesce(p_customer_name, ''));
  v_cust_email text := '';
  v_cust_id uuid;
  v_phone_owned_by_other boolean := false;
  v_use_wallet boolean := coalesce(p_use_wallet, false);
  new_id uuid;
begin
  if request_key is null
    or v_payment not in ('cod', 'paymob_card', 'paymob_wallet', 'wallet')
    or address is null or length(v_address) not between 3 and 500
    or customer_phone is null or customer_phone !~ '^[0-9]{8,15}$'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'invalid_checkout';
  end if;
  if jsonb_array_length(lines) not between 1 and 100 then
    raise exception 'invalid_cart';
  end if;

  if v_payment = 'wallet' then
    v_use_wallet := true;
  end if;

  fingerprint := md5(jsonb_build_array(v_store_id, v_address, customer_phone, v_payment, lines, v_coupon_clean, v_use_wallet)::text);
  perform pg_advisory_xact_lock(hashtextextended(request_key::text, 0));
  select * into prior from public.orders where checkout_key = request_key;
  if found then
    if prior.user_id is distinct from customer or prior.checkout_fingerprint is distinct from fingerprint
       or prior.guest_tracking is distinct from (customer is null) then
      raise exception 'checkout_key_conflict';
    end if;
    return query select prior.id, prior.total, prior.currency;
    return;
  end if;

  select st.status into v_store_status from public.stores st where st.id = v_store_id;
  if not found then
    raise exception 'unknown_store';
  end if;
  if v_store_status = 'suspended' then
    raise exception 'store_suspended';
  end if;

  select * into strict settings from public.store_settings s where s.store_id = v_store_id;

  if v_payment = 'cod' and not settings.cod_enabled then
    raise exception 'payment_method_disabled';
  end if;
  if v_payment = 'paymob_card' and not (settings.paymob_enabled and settings.paymob_card_enabled) then
    raise exception 'payment_method_disabled';
  end if;
  if v_payment = 'paymob_wallet' and not (settings.paymob_enabled and settings.paymob_wallet_enabled) then
    raise exception 'payment_method_disabled';
  end if;
  if v_payment = 'wallet' and customer is null then
    raise exception 'not_authorized';
  end if;

  v_pay_status := case when v_payment = 'cod' then 'unpaid' else 'pending' end;

  if customer is not null then
    select coalesce(u.email, '') into v_cust_email from auth.users u where u.id = customer;
    select id into v_cust_id
    from public.store_customers
    where store_id = settings.store_id and user_id = customer;
  end if;

  -- Only look up unclaimed guest CRM rows by phone (NEVER match/overwrite an authenticated user's CRM row)
  if v_cust_id is null then
    select id into v_cust_id
    from public.store_customers
    where store_id = settings.store_id
      and phone = customer_phone
      and user_id is null
    limit 1;
  end if;

  if v_cust_id is null then
    select exists (
      select 1 from public.store_customers sc
      where sc.store_id = settings.store_id
        and sc.phone = customer_phone
        and sc.user_id is not null
        and (customer is null or sc.user_id <> customer)
    ) into v_phone_owned_by_other;

    if not v_phone_owned_by_other then
      insert into public.store_customers (store_id, user_id, full_name, phone, email, address)
      values (settings.store_id, customer, v_cust_name, customer_phone, v_cust_email, v_address)
      returning id into v_cust_id;
    elsif customer is not null then
      insert into public.store_customers (store_id, user_id, full_name, phone, email, address)
      values (settings.store_id, customer, v_cust_name, '', v_cust_email, v_address)
      returning id into v_cust_id;
    end if;
  else
    update public.store_customers sc
    set user_id = coalesce(sc.user_id, customer),
        full_name = case when length(v_cust_name) > 0 then v_cust_name else sc.full_name end,
        email = case when length(v_cust_email) > 0 then v_cust_email else sc.email end,
        address = v_address,
        updated_at = now()
    where sc.id = v_cust_id
      and (sc.user_id is null or sc.user_id = customer);
  end if;

  insert into public.orders(
    store_id, user_id, customer_id, shipping_address, phone, payment_method, payment_status,
    guest_tracking, currency, shipping_fee, subtotal, wallet_discount, checkout_key, checkout_fingerprint
  )
  values(
    settings.store_id, customer, v_cust_id, v_address, customer_phone, v_payment, v_pay_status,
    customer is null, settings.currency, settings.shipping_fee, 0, 0, request_key, fingerprint
  )
  returning id into new_id;

  -- Lock products in ID order, strictly isolated to this store_id, using server-verified effective price
  for entry in select value from jsonb_array_elements(lines) order by (value->>'id')::uuid loop
    if jsonb_typeof(entry->'quantity') is distinct from 'number'
       or (entry->>'quantity') !~ '^[1-9][0-9]{0,5}$' then
      raise exception 'invalid_quantity';
    end if;
    item_quantity := (entry->>'quantity')::integer;
    chosen_size := coalesce(entry->>'size', '');
    chosen_color := coalesce(entry->>'color', '');
    select * into product
    from public.products p
    where p.id = (entry->>'id')::uuid
      and p.store_id = settings.store_id
    for update;
    if not found or not product.is_active or product.stock < item_quantity then
      raise exception 'stock_unavailable';
    end if;
    if (cardinality(product.sizes) = 0 and chosen_size <> '') or
       (cardinality(product.sizes) > 0 and not coalesce(chosen_size = any(product.sizes), false)) or
       (cardinality(product.colors) = 0 and chosen_color <> '') or
       (cardinality(product.colors) > 0 and not coalesce(chosen_color = any(product.colors), false)) then
      raise exception 'invalid_variant';
    end if;

    v_unit_price := public.get_effective_product_price(
      product.price,
      product.flash_sale_price,
      product.flash_sale_starts_at,
      product.flash_sale_ends_at,
      now()
    );

    update public.products set stock = stock - item_quantity where id = product.id;
    insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, unit_cost, size, color)
      values(new_id, product.id, product.name, item_quantity, v_unit_price, coalesce(product.cost_price, 0), nullif(chosen_size, ''), nullif(chosen_color, ''));
    gross_subtotal := gross_subtotal + v_unit_price * item_quantity;
  end loop;

  if length(v_coupon_clean) >= 2 then
    select * into c
    from public.coupons cp
    where cp.store_id = settings.store_id
      and upper(trim(cp.code)) = v_coupon_clean
    for update;

    if not found or not c.is_active
       or (c.expires_at is not null and c.expires_at < now())
       or (c.max_uses is not null and c.used_count >= c.max_uses)
       or gross_subtotal < c.min_order_amount then
      raise exception 'invalid_coupon';
    end if;

    if c.discount_type = 'percent' then
      discount_val := round(gross_subtotal * least(c.discount_value, 100) / 100.0, 2);
    else
      discount_val := least(gross_subtotal, c.discount_value);
    end if;

    applied_coupon := c.code;
    update public.coupons set used_count = used_count + 1 where id = c.id;
  end if;

  net_subtotal := greatest(0::numeric, gross_subtotal - discount_val);

  if settings.cart_incentive_enabled
     and coalesce(settings.free_shipping_threshold, 0) > 0
     and gross_subtotal >= settings.free_shipping_threshold then
    v_shipping_fee := 0;
  else
    v_shipping_fee := settings.shipping_fee;
  end if;

  v_pre_wallet_total := net_subtotal + v_shipping_fee;

  if v_use_wallet and customer is not null and v_pre_wallet_total > 0 then
    v_wallet_discount := public.redeem_wallet_for_order(
      settings.store_id,
      customer,
      new_id,
      v_pre_wallet_total
    );
  end if;

  v_remaining_total := greatest(0::numeric, v_pre_wallet_total - v_wallet_discount);

  if v_payment = 'wallet' and v_remaining_total > 0 then
    raise exception 'insufficient_wallet_balance';
  end if;

  if v_remaining_total = 0 and v_wallet_discount > 0 then
    v_payment := 'wallet';
    v_pay_status := 'paid';
    v_order_status := 'confirmed';
  end if;

  update public.orders
  set subtotal = net_subtotal,
      shipping_fee = v_shipping_fee,
      coupon_code = applied_coupon,
      discount_amount = discount_val,
      wallet_discount = v_wallet_discount,
      payment_method = v_payment,
      payment_status = v_pay_status,
      status = v_order_status
  where id = new_id;

  return query select o.id, o.total, o.currency from public.orders o where o.id = new_id;
end $$;

revoke all on function public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean, uuid) from public;
grant execute on function public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean, uuid) to anon, authenticated;

-- 4e. Hardened register_push_subscription: stop trusting unverified caller-supplied phone (HIGH-05)
create or replace function public.register_push_subscription(
  p_store_id uuid,
  p_platform text,
  p_token text,
  p_locale text default 'ar',
  p_guest_session_id text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_token text := left(trim(coalesce(p_token, '')), 512);
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_locale text := case when lower(trim(coalesce(p_locale, 'ar'))) = 'en' then 'en' else 'ar' end;
  v_guest text := nullif(left(trim(coalesce(p_guest_session_id, '')), 120), '');
  v_id uuid;
begin
  if p_store_id is null or length(v_token) < 16 or v_platform not in ('android', 'web') then
    raise exception 'invalid_push_subscription';
  end if;

  if not exists (select 1 from public.stores st where st.id = p_store_id and st.status <> 'suspended') then
    raise exception 'unknown_store';
  end if;

  -- Never trust unverified caller-supplied p_phone (prevents phone-based push interception)
  insert into public.push_subscriptions (
    store_id, user_id, guest_session_id, phone, platform, token, locale, is_active, last_seen_at
  )
  values (
    p_store_id, v_uid, v_guest, null, v_platform, v_token, v_locale, true, now()
  )
  on conflict (store_id, platform, token) do update
  set user_id = coalesce(excluded.user_id, public.push_subscriptions.user_id),
      guest_session_id = coalesce(excluded.guest_session_id, public.push_subscriptions.guest_session_id),
      phone = null,
      locale = excluded.locale,
      is_active = true,
      last_seen_at = now()
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.register_push_subscription(uuid, text, text, text, text, text) from public;
grant execute on function public.register_push_subscription(uuid, text, text, text, text, text) to anon, authenticated;


-- ============================================================================
-- 5. LOCK DOWN `abandoned_carts`, `notifications`, `support_tickets`,
--    `store_customers`, `store_members`, `switch_order_to_cod`, `orders`,
--    `delivery`, AND `back_in_stock_subscriptions`
--    (CRIT-08, HIGH-02, HIGH-03, HIGH-06, M3, M4, M5, M6)
-- ============================================================================

-- 5a. Abandoned carts: revoke direct UPDATE, harden RPCs (CRIT-08, CRIT-01, M6)
drop policy if exists admin_update_store_abandoned_carts on public.abandoned_carts;
revoke update on public.abandoned_carts from authenticated;

drop function if exists public.upsert_abandoned_cart(uuid, text, jsonb, numeric, text, text, text, text, text);
create or replace function public.upsert_abandoned_cart(
  p_store_id uuid,
  p_session_key text,
  p_items jsonb,
  p_subtotal numeric,
  p_currency text default 'EGP',
  p_source text default 'web',
  p_customer_name text default null,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session text := left(trim(coalesce(p_session_key, '')), 120);
  v_source text := case when lower(trim(coalesce(p_source, 'web'))) = 'android' then 'android' else 'web' end;
  v_currency text := upper(left(trim(coalesce(nullif(p_currency, ''), 'EGP')), 8));
  v_name text := nullif(left(trim(coalesce(p_customer_name, '')), 120), '');
  v_email text := nullif(left(trim(coalesce(p_customer_email, '')), 180), '');
  v_phone text := nullif(left(trim(coalesce(p_customer_phone, '')), 32), '');
  v_subtotal numeric(12,2) := round(greatest(0::numeric, coalesce(p_subtotal, 0)), 2);
  v_profile_name text;
  v_profile_email text;
  v_profile_phone text;
  v_auth_email text;
  v_existing public.abandoned_carts%rowtype;
  v_row public.abandoned_carts%rowtype;
begin
  if p_store_id is null or length(v_session) < 24 then
    raise exception 'invalid_session_key';
  end if;

  if not exists (select 1 from public.stores st where st.id = p_store_id and st.status <> 'suspended') then
    raise exception 'unknown_store';
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 50 then
    raise exception 'too_many_items';
  end if;

  -- Lock existing row (if any) to prevent anon hijacking of authenticated or recovered carts
  select *
  into v_existing
  from public.abandoned_carts ac
  where ac.store_id = p_store_id
    and ac.session_key = v_session
  for update;

  if found then
    if v_existing.user_id is not null and (v_uid is null or v_existing.user_id <> v_uid) then
      raise exception 'not_authorized';
    end if;
    if v_uid is null and v_existing.status = 'recovered' then
      raise exception 'cart_already_recovered';
    end if;
  end if;

  -- Empty cart or zero subtotal -> remove active non-recovered row (respecting ownership check above)
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or v_subtotal <= 0 then
    delete from public.abandoned_carts ac
    where ac.store_id = p_store_id
      and ac.session_key = v_session
      and ac.status <> 'recovered'
      and (ac.user_id is null or ac.user_id = v_uid);
    return jsonb_build_object('id', null, 'status', 'cleared', 'updated_at', now());
  end if;

  if v_uid is not null then
    select
      nullif(trim(sc.full_name), ''),
      nullif(trim(sc.email), ''),
      nullif(trim(sc.phone), '')
    into v_profile_name, v_profile_email, v_profile_phone
    from public.store_customers sc
    where sc.store_id = p_store_id
      and sc.user_id = v_uid
    limit 1;

    select nullif(trim(u.email), '')
    into v_auth_email
    from auth.users u
    where u.id = v_uid;

    v_name := coalesce(v_name, v_profile_name);
    v_email := coalesce(v_email, v_profile_email, v_auth_email);
    v_phone := coalesce(v_phone, v_profile_phone);
  end if;

  insert into public.abandoned_carts (
    store_id,
    user_id,
    session_key,
    customer_name,
    customer_email,
    customer_phone,
    items,
    subtotal,
    currency,
    source,
    status,
    updated_at
  )
  values (
    p_store_id,
    v_uid,
    v_session,
    v_name,
    v_email,
    v_phone,
    p_items,
    v_subtotal,
    v_currency,
    v_source,
    'open',
    now()
  )
  on conflict (store_id, session_key) do update
  set user_id = coalesce(excluded.user_id, public.abandoned_carts.user_id),
      customer_name = coalesce(excluded.customer_name, public.abandoned_carts.customer_name),
      customer_email = coalesce(excluded.customer_email, public.abandoned_carts.customer_email),
      customer_phone = coalesce(excluded.customer_phone, public.abandoned_carts.customer_phone),
      items = excluded.items,
      subtotal = excluded.subtotal,
      currency = excluded.currency,
      source = excluded.source,
      status = case
        when public.abandoned_carts.status in ('recovered', 'dismissed') then 'open'
        else public.abandoned_carts.status
      end,
      recovered_order_id = case
        when public.abandoned_carts.status in ('recovered', 'dismissed') then null
        else public.abandoned_carts.recovered_order_id
      end,
      reminder_count = case
        when public.abandoned_carts.status in ('recovered', 'dismissed') then 0
        else public.abandoned_carts.reminder_count
      end,
      last_reminded_at = case
        when public.abandoned_carts.status in ('recovered', 'dismissed') then null
        else public.abandoned_carts.last_reminded_at
      end,
      recovery_coupon_code = case
        when public.abandoned_carts.status in ('recovered', 'dismissed') then null
        else public.abandoned_carts.recovery_coupon_code
      end,
      updated_at = now()
  returning * into v_row;

  -- Return non-PII summary ONLY
  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'updated_at', v_row.updated_at
  );
end $$;

revoke all on function public.upsert_abandoned_cart(uuid, text, jsonb, numeric, text, text, text, text, text) from public;
grant execute on function public.upsert_abandoned_cart(uuid, text, jsonb, numeric, text, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.mark_abandoned_cart_recovered(
  p_store_id uuid,
  p_session_key text default null,
  p_order_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session text := nullif(left(trim(coalesce(p_session_key, '')), 120), '');
  v_verified_order_id uuid := null;
  v_count integer := 0;
begin
  if p_store_id is null then
    return 0;
  end if;

  if v_uid is null and (v_session is null or length(v_session) < 24) then
    return 0;
  end if;

  -- Verify p_order_id belongs strictly to (p_store_id, auth.uid()) (or recent guest order when anon)
  if p_order_id is not null then
    if v_uid is not null then
      select o.id
      into v_verified_order_id
      from public.orders o
      where o.id = p_order_id
        and o.store_id = p_store_id
        and o.user_id = v_uid
      limit 1;
    else
      select o.id
      into v_verified_order_id
      from public.orders o
      where o.id = p_order_id
        and o.store_id = p_store_id
        and o.user_id is null
        and o.guest_tracking = true
        and o.created_at >= now() - interval '2 hours'
      limit 1;
    end if;
  end if;

  update public.abandoned_carts ac
  set status = 'recovered',
      recovered_order_id = coalesce(v_verified_order_id, ac.recovered_order_id),
      updated_at = now()
  where ac.store_id = p_store_id
    and ac.status in ('open', 'reminded')
    and (
      (v_uid is not null and (ac.user_id = v_uid or (v_session is not null and length(v_session) >= 24 and ac.session_key = v_session and ac.user_id is null)))
      or (v_uid is null and v_session is not null and length(v_session) >= 24 and ac.session_key = v_session and ac.user_id is null)
    );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.mark_abandoned_cart_recovered(uuid, text, uuid) from public;
grant execute on function public.mark_abandoned_cart_recovered(uuid, text, uuid) to anon, authenticated, service_role;

create or replace function public.admin_update_abandoned_cart(
  p_cart_id uuid,
  p_action text,
  p_coupon_code text default null
)
returns public.abandoned_carts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_cart public.abandoned_carts%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_coupon text := nullif(upper(left(trim(coalesce(p_coupon_code, '')), 40)), '');
begin
  if p_cart_id is null then
    raise exception 'abandoned_cart_not_found';
  end if;

  if v_action not in ('mark_reminded', 'dismiss') then
    raise exception 'invalid_abandoned_cart_action';
  end if;

  select *
  into v_cart
  from public.abandoned_carts ac
  where ac.id = p_cart_id
  for update;

  if not found then
    raise exception 'abandoned_cart_not_found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or not (public.is_store_admin(v_cart.store_id) or public.is_platform_super_admin())
     ) then
    raise exception 'not_authorized';
  end if;

  if v_action = 'mark_reminded' then
    update public.abandoned_carts ac
    set status = case when ac.status = 'recovered' then 'recovered' else 'reminded' end,
        reminder_count = ac.reminder_count + 1,
        last_reminded_at = now(),
        recovery_coupon_code = coalesce(v_coupon, ac.recovery_coupon_code),
        updated_at = now()
    where ac.id = p_cart_id
    returning * into v_cart;
  elsif v_action = 'dismiss' then
    update public.abandoned_carts ac
    set status = 'dismissed',
        updated_at = now()
    where ac.id = p_cart_id
    returning * into v_cart;
  end if;

  return v_cart;
end $$;

revoke all on function public.admin_update_abandoned_cart(uuid, text, text) from public, anon;
grant execute on function public.admin_update_abandoned_cart(uuid, text, text) to authenticated, service_role;

-- 5b. Notifications: revoke direct UPDATE from authenticated, tighten broadcast SELECT,
--     and track per-user broadcast read state in public.notification_reads (HIGH-02)
drop policy if exists customer_mark_own_notifications_read on public.notifications;
drop policy if exists admin_update_notifications on public.notifications;
revoke update on public.notifications from authenticated;

drop policy if exists customer_read_own_notifications on public.notifications;
create policy customer_read_own_notifications
  on public.notifications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (target_role = 'customer' and user_id is null and category = 'promo_campaign')
  );

drop function if exists public.mark_notifications_read(uuid, uuid[], boolean);
drop function if exists public.mark_notifications_read(uuid, uuid[], boolean, text);
create or replace function public.mark_notifications_read(
  p_store_id uuid,
  p_notification_ids uuid[] default null,
  p_mark_all boolean default false,
  p_scope text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_scope text := lower(trim(coalesce(p_scope, '')));
  v_updated integer := 0;
  v_broadcast_count integer := 0;
  v_admin_count integer := 0;
begin
  if p_store_id is null then
    raise exception 'store_id_required';
  end if;

  -- Unauthenticated callers persist broadcast read state locally; never mutate shared rows
  if v_uid is null then
    return 0;
  end if;

  select (public.is_store_admin(p_store_id) or public.is_platform_super_admin())
  into v_is_admin;

  if v_scope = 'admin' and not v_is_admin then
    raise exception 'not_authorized';
  end if;

  if p_mark_all then
    if v_scope = 'admin' then
      update public.notifications
      set is_read = true,
          read_at = coalesce(read_at, now())
      where store_id = p_store_id
        and target_role = 'admin'
        and (is_read = false or read_at is null);
      get diagnostics v_updated = row_count;
      return v_updated;
    end if;

    -- Personal customer notifications
    update public.notifications
    set is_read = true,
        read_at = coalesce(read_at, now())
    where store_id = p_store_id
      and target_role = 'customer'
      and user_id = v_uid
      and (is_read = false or read_at is null);
    get diagnostics v_updated = row_count;

    -- Per-user broadcast read receipts (never flip global is_read on shared broadcast rows)
    insert into public.notification_reads (notification_id, user_id, read_at)
    select n.id, v_uid, now()
    from public.notifications n
    where n.store_id = p_store_id
      and n.target_role = 'customer'
      and n.user_id is null
      and n.category = 'promo_campaign'
    on conflict (notification_id, user_id) do nothing;
    get diagnostics v_broadcast_count = row_count;

    -- Legacy 3-arg call by admin without explicit scope also marks admin alerts read
    if v_scope = '' and v_is_admin then
      update public.notifications
      set is_read = true,
          read_at = coalesce(read_at, now())
      where store_id = p_store_id
        and target_role = 'admin'
        and (is_read = false or read_at is null);
      get diagnostics v_admin_count = row_count;
      v_updated := v_updated + v_admin_count;
    end if;

    return v_updated + v_broadcast_count;
  end if;

  if p_notification_ids is null or coalesce(array_length(p_notification_ids, 1), 0) = 0 then
    return 0;
  end if;

  if v_scope = 'admin' then
    update public.notifications
    set is_read = true,
        read_at = coalesce(read_at, now())
    where store_id = p_store_id
      and target_role = 'admin'
      and id = any(p_notification_ids);
    get diagnostics v_updated = row_count;
    return v_updated;
  end if;

  -- Personal customer notifications
  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where store_id = p_store_id
    and id = any(p_notification_ids)
    and (
      (target_role = 'customer' and user_id = v_uid)
      or (v_scope = '' and v_is_admin and target_role = 'admin')
    );
  get diagnostics v_updated = row_count;

  -- Per-user broadcast read receipts
  insert into public.notification_reads (notification_id, user_id, read_at)
  select n.id, v_uid, now()
  from public.notifications n
  where n.store_id = p_store_id
    and n.id = any(p_notification_ids)
    and n.target_role = 'customer'
    and n.user_id is null
    and n.category = 'promo_campaign'
  on conflict (notification_id, user_id) do nothing;
  get diagnostics v_broadcast_count = row_count;

  return v_updated + v_broadcast_count;
end $$;

revoke all on function public.mark_notifications_read(uuid, uuid[], boolean, text) from public;
grant execute on function public.mark_notifications_read(uuid, uuid[], boolean, text) to anon, authenticated, service_role;

-- 5c. Support tickets: replace global is_admin() with store-scoped is_store_admin(store_id) (HIGH-03)
drop policy if exists protect_ticket_staff_fields on public.support_tickets;
create policy protect_ticket_staff_fields on public.support_tickets as restrictive
  for insert to authenticated
  with check (
    (select public.is_store_admin(store_id))
    or (admin_reply = '' and order_id is null)
  );

-- 5d. store_customers: revoke direct UPDATE from authenticated; add admin notes RPC (HIGH-03)
drop policy if exists customer_update_own_record on public.store_customers;
revoke update on public.store_customers from authenticated;

create or replace function public.admin_update_customer_notes(
  p_store_id uuid,
  p_customer_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_id uuid;
begin
  if p_store_id is null or p_customer_id is null then
    raise exception 'invalid_parameters';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and (
       auth.uid() is null
       or not (public.is_store_admin(p_store_id) or public.is_platform_super_admin())
     ) then
    raise exception 'not_authorized';
  end if;

  update public.store_customers
  set notes = left(trim(coalesce(p_notes, '')), 1000),
      updated_at = now()
  where id = p_customer_id
    and store_id = p_store_id
  returning id into v_id;

  if v_id is null then
    raise exception 'customer_not_found';
  end if;

  return v_id;
end $$;

revoke all on function public.admin_update_customer_notes(uuid, uuid, text) from public, anon;
grant execute on function public.admin_update_customer_notes(uuid, uuid, text) to authenticated, service_role;

-- 5e. store_members: block non-owner 'admin' from promoting to 'owner' or deleting 'owner' rows (M5)
create or replace function public.is_store_owner(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.is_platform_super_admin()
    or exists (
      select 1
      from public.store_members sm
      where sm.store_id = target_store_id
        and sm.user_id = (select auth.uid())
        and sm.role = 'owner'
    )
$$;

revoke all on function public.is_store_owner(uuid) from public, anon;
grant execute on function public.is_store_owner(uuid) to authenticated, service_role;

drop policy if exists manage_store_memberships on public.store_members;
drop policy if exists read_store_memberships on public.store_members;
drop policy if exists insert_store_memberships on public.store_members;
drop policy if exists update_store_memberships on public.store_members;
drop policy if exists delete_store_memberships on public.store_members;

create policy read_store_memberships on public.store_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_store_admin(store_id))
  );

create policy insert_store_memberships on public.store_members
  for insert to authenticated
  with check (
    (select public.is_platform_super_admin())
    or (
      (select public.is_store_admin(store_id))
      and role <> 'owner'
    )
  );

create policy update_store_memberships on public.store_members
  for update to authenticated
  using (
    (select public.is_platform_super_admin())
    or (
      (select public.is_store_admin(store_id))
      and role <> 'owner'
    )
  )
  with check (
    (select public.is_platform_super_admin())
    or (
      (select public.is_store_admin(store_id))
      and role <> 'owner'
    )
  );

create policy delete_store_memberships on public.store_members
  for delete to authenticated
  using (
    (select public.is_platform_super_admin())
    or (
      (select public.is_store_admin(store_id))
      and role <> 'owner'
    )
  );

-- 5f. switch_order_to_cod: fix non-Nova tenants (remove `s.id and`) & enforce online payment state (HIGH-06)
create or replace function public.switch_order_to_cod(
  p_store uuid,
  p_order_id uuid,
  p_phone text default ''
)
returns table(
  id uuid,
  status text,
  payment_method text,
  payment_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_store_status text;
  v_settings public.store_settings%rowtype;
  v_order public.orders%rowtype;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_phone_variants text[] := array[]::text[];
  v_authorized boolean := false;
begin
  select st.status into v_store_status
  from public.stores st
  where st.id = p_store;

  if not found then
    raise exception 'unknown_store';
  end if;
  if v_store_status = 'suspended' then
    raise exception 'store_suspended';
  end if;

  select * into strict v_settings
  from public.store_settings s
  where s.store_id = p_store;

  if not v_settings.cod_enabled then
    raise exception 'cod_disabled';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id
    and o.store_id = p_store
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_phone ~ '^2001[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 4);
  elsif v_phone ~ '^00201[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 5);
  end if;

  if v_phone ~ '^01[0125][0-9]{8}$' then
    v_phone_variants := array[v_phone, '20' || substr(v_phone, 2)];
  elsif v_phone ~ '^201[0125][0-9]{8}$' then
    v_phone_variants := array['0' || substr(v_phone, 3), v_phone];
  elsif length(v_phone) >= 8 then
    v_phone_variants := array[v_phone];
  end if;

  if v_uid is not null and (v_order.user_id = v_uid or public.is_store_admin(p_store)) then
    v_authorized := true;
  elsif v_order.user_id is null and cardinality(v_phone_variants) > 0 and v_order.phone = any(v_phone_variants) then
    v_authorized := true;
  end if;

  if not v_authorized then
    raise exception 'not_authorized';
  end if;

  if v_order.status in ('cancelled', 'delivered') then
    raise exception 'order_closed';
  end if;

  if v_order.payment_status = 'paid' then
    raise exception 'already_paid';
  end if;

  if v_order.payment_method not in ('paymob_card', 'paymob_wallet')
     or v_order.payment_status not in ('pending', 'failed') then
    raise exception 'invalid_payment_state';
  end if;

  update public.orders o
  set payment_method = 'cod',
      payment_status = 'cod_pending',
      status = case when o.status = 'pending' then 'confirmed' else o.status end
  where o.id = v_order.id
  returning o.id, o.status, o.payment_method, o.payment_status
  into id, status, payment_method, payment_status;

  return next;
end $$;

revoke all on function public.switch_order_to_cod(uuid, uuid, text) from public;
grant execute on function public.switch_order_to_cod(uuid, uuid, text) to anon, authenticated;

-- 5g. Drop legacy anon direct INSERT on public.orders (M4)
drop policy if exists submit_guest_order on public.orders;
revoke insert on public.orders from anon;

-- 5h. Hardened delivery token RPCs: enforce status = 'shipped', token expiration & PII redaction (M3)
create or replace function public.get_delivery_by_token(p_token text)
returns table(
  order_id uuid,
  status text,
  shipping_address text,
  phone text,
  shipping_carrier text,
  tracking_number text,
  courier_note text,
  total numeric,
  currency text,
  payment_method text,
  item_count bigint,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id as order_id,
    o.status,
    case when o.status in ('delivered', 'cancelled') then '' else o.shipping_address end as shipping_address,
    case when o.status in ('delivered', 'cancelled') then '' else o.phone end as phone,
    o.shipping_carrier,
    o.tracking_number,
    case when o.status in ('delivered', 'cancelled') then null else o.courier_note end as courier_note,
    o.total,
    o.currency,
    o.payment_method,
    coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id), 0) as item_count,
    o.shipped_at,
    o.delivered_at,
    o.created_at
  from public.orders o
  where p_token is not null
    and length(trim(p_token)) >= 24
    and o.delivery_token = trim(p_token)
    and now() <= coalesce(
      o.delivery_token_expires_at,
      coalesce(o.shipped_at, o.created_at) + interval '30 days'
    )
$$;

create or replace function public.confirm_delivery_by_token(p_token text)
returns table(
  outcome text,
  order_id uuid,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  target public.orders%rowtype;
  ts timestamptz;
begin
  if p_token is null or length(trim(p_token)) < 24 then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select * into target
  from public.orders
  where delivery_token = trim(p_token)
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if now() > coalesce(
    target.delivery_token_expires_at,
    coalesce(target.shipped_at, target.created_at) + interval '30 days'
  ) then
    return query select 'expired'::text, target.id, target.delivered_at;
    return;
  end if;

  if target.status = 'delivered' then
    return query select 'already_delivered'::text, target.id, target.delivered_at;
    return;
  end if;

  if target.status <> 'shipped' then
    return query select 'invalid_state'::text, target.id, target.delivered_at;
    return;
  end if;

  ts := coalesce(target.delivered_at, now());
  update public.orders
  set status = 'delivered',
      delivered_at = ts
  where id = target.id;

  perform public._internal_award_order_cashback(target.store_id, target.id, true, null);

  return query select 'delivered'::text, target.id, ts;
end $$;

revoke all on function public.get_delivery_by_token(text), public.confirm_delivery_by_token(text) from public;
grant execute on function public.get_delivery_by_token(text), public.confirm_delivery_by_token(text) to anon, authenticated;

-- 5i. Harden subscribe_back_in_stock: prevent guest overwriting authenticated user push_token (M6)
create or replace function public.subscribe_back_in_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_key text default '',
  p_phone text default null,
  p_push_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_variant text := left(trim(coalesce(p_variant_key, '')), 120);
  v_phone text := nullif(left(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), 24), '');
  v_token text := nullif(left(trim(coalesce(p_push_token, '')), 512), '');
  v_existing uuid;
  v_id uuid;
begin
  if p_store_id is null or p_product_id is null then
    raise exception 'invalid_restock_request';
  end if;

  if v_uid is null and v_phone is null and v_token is null then
    raise exception 'contact_required';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.store_id = p_store_id and p.is_active = true
  ) then
    raise exception 'product_not_found';
  end if;

  if v_uid is not null then
    select id into v_existing
    from public.back_in_stock_subscriptions
    where store_id = p_store_id and product_id = p_product_id
      and variant_key = v_variant and user_id = v_uid and notified_at is null
    limit 1;
  elsif v_phone is not null then
    select id into v_existing
    from public.back_in_stock_subscriptions
    where store_id = p_store_id and product_id = p_product_id
      and variant_key = v_variant and phone = v_phone and user_id is null and notified_at is null
    limit 1;
  elsif v_token is not null then
    select id into v_existing
    from public.back_in_stock_subscriptions
    where store_id = p_store_id and product_id = p_product_id
      and variant_key = v_variant and push_token = v_token and user_id is null and notified_at is null
    limit 1;
  end if;

  if v_existing is not null then
    update public.back_in_stock_subscriptions
    set phone = coalesce(v_phone, phone),
        push_token = coalesce(v_token, push_token)
    where id = v_existing;
    return v_existing;
  end if;

  insert into public.back_in_stock_subscriptions (
    store_id, product_id, variant_key, user_id, phone, push_token
  )
  values (
    p_store_id, p_product_id, v_variant, v_uid, v_phone, v_token
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.subscribe_back_in_stock(uuid, uuid, text, text, text) from public;
grant execute on function public.subscribe_back_in_stock(uuid, uuid, text, text, text) to anon, authenticated;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

commit;
