-- Phase 10A: Gamified Free-Shipping Cart Progress Bar + Atomic Store Credit & Cashback Wallet
-- Adds store_settings incentive/cashback columns, public.wallet_transactions ledger with strict RLS
-- and idempotent partial unique indexes, orders.wallet_discount + orders.cashback_earned + updated total,
-- atomic SECURITY DEFINER wallet RPCs, auto-refund trigger on cancel, and upgraded store_checkout / mobile_checkout.
-- Apply after phase-10-cod-fallback.sql and phase-9-notifications-read-rpc.sql. Idempotent and safe to re-run.
begin;

-- 1. Store Settings: Free-Shipping Incentive & Cashback Wallet Config
alter table public.store_settings
  add column if not exists cart_incentive_enabled boolean not null default true,
  add column if not exists free_shipping_threshold numeric(12,2) not null default 1000,
  add column if not exists cashback_enabled boolean not null default true,
  add column if not exists cashback_percentage numeric(5,2) not null default 5;

alter table public.store_settings
  drop constraint if exists store_settings_free_shipping_threshold_check;
alter table public.store_settings
  add constraint store_settings_free_shipping_threshold_check
  check (free_shipping_threshold >= 0);

alter table public.store_settings
  drop constraint if exists store_settings_cashback_percentage_check;
alter table public.store_settings
  add constraint store_settings_cashback_percentage_check
  check (cashback_percentage >= 0 and cashback_percentage <= 50);

-- 2. Orders: Wallet Discount, Cashback Earned, 'wallet' Payment Method, and Updated Generated Total
alter table public.orders
  add column if not exists wallet_discount numeric(12,2) not null default 0,
  add column if not exists cashback_earned numeric(12,2) not null default 0;

alter table public.orders
  drop constraint if exists orders_wallet_discount_check;
alter table public.orders
  add constraint orders_wallet_discount_check
  check (wallet_discount >= 0);

alter table public.orders
  drop constraint if exists orders_cashback_earned_check;
alter table public.orders
  add constraint orders_cashback_earned_check
  check (cashback_earned >= 0);

alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cod', 'paymob_card', 'paymob_wallet', 'wallet'));

-- Update orders.total generated expression to subtract wallet_discount (clamped >= 0; null if subtotal is null)
do $$
declare
  v_expr text;
begin
  select pg_get_expr(ad.adbin, ad.adrelid)
  into v_expr
  from pg_attribute a
  join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
  where a.attrelid = 'public.orders'::regclass
    and a.attname = 'total'
    and not a.attisdropped;

  if v_expr is null or position('wallet_discount' in v_expr) = 0 then
    alter table public.orders drop column if exists total;
    alter table public.orders
      add column total numeric(13,2)
      generated always as (
        case
          when subtotal is null then null
          else greatest(0::numeric, subtotal + shipping_fee - wallet_discount)
        end
      ) stored;
  end if;
end $$;

-- 3. Wallet Transactions Ledger Table + Strict Multi-Tenant RLS + Idempotency Indexes
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.store_settings(store_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid null references public.orders(id) on delete set null,
  type text not null check (type in ('cashback_earned', 'order_redemption', 'order_refund', 'admin_credit', 'admin_debit')),
  amount numeric(12,2) not null check (amount <> 0),
  balance_after numeric(12,2) not null check (balance_after >= 0),
  note_ar text not null default '',
  note_en text not null default '',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_transactions_store_user_created
  on public.wallet_transactions (store_id, user_id, created_at desc, id desc);

create index if not exists idx_wallet_transactions_order
  on public.wallet_transactions (order_id)
  where order_id is not null;

-- Strict idempotency: never double-credit cashback or double-refund cancelled order
create unique index if not exists uidx_wallet_transactions_idempotent_order
  on public.wallet_transactions (store_id, order_id, type)
  where order_id is not null and type in ('cashback_earned', 'order_refund');

create unique index if not exists uidx_wallet_transactions_idempotent_redemption
  on public.wallet_transactions (store_id, order_id, type)
  where order_id is not null and type = 'order_redemption';

alter table public.wallet_transactions enable row level security;

revoke all on public.wallet_transactions from public, anon, authenticated;
grant select on public.wallet_transactions to authenticated;
grant select, insert, update, delete on public.wallet_transactions to service_role;

drop policy if exists customer_read_own_wallet_transactions on public.wallet_transactions;
create policy customer_read_own_wallet_transactions
  on public.wallet_transactions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists admin_read_store_wallet_transactions on public.wallet_transactions;
create policy admin_read_store_wallet_transactions
  on public.wallet_transactions
  for select
  to authenticated
  using ((select public.is_store_admin(store_id)));

-- 4. Atomic SECURITY DEFINER Wallet RPCs

-- 4a. Get Customer Wallet Summary (balance + recent transactions)
create or replace function public.get_customer_wallet_summary(
  p_store_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = '' as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_settings public.store_settings%rowtype;
  v_balance numeric(12,2) := 0;
  v_tx jsonb := '[]'::jsonb;
begin
  if v_caller is null or v_target is null then
    raise exception 'not_authorized';
  end if;

  if v_target <> v_caller and not public.is_store_admin(p_store_id) then
    raise exception 'not_authorized';
  end if;

  select * into v_settings
  from public.store_settings s
  where s.store_id = p_store_id
  limit 1;

  if not found then
    raise exception 'unknown_store';
  end if;

  select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
  into v_balance
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.user_id = v_target;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'store_id', t.store_id,
        'user_id', t.user_id,
        'order_id', t.order_id,
        'type', t.type,
        'amount', t.amount,
        'balance_after', t.balance_after,
        'note_ar', t.note_ar,
        'note_en', t.note_en,
        'created_at', t.created_at
      )
      order by t.created_at desc, t.id desc
    ),
    '[]'::jsonb
  )
  into v_tx
  from (
    select wt.*
    from public.wallet_transactions wt
    where wt.store_id = p_store_id
      and wt.user_id = v_target
    order by wt.created_at desc, wt.id desc
    limit 50
  ) t;

  return jsonb_build_object(
    'balance', v_balance,
    'currency', v_settings.currency,
    'cashback_enabled', v_settings.cashback_enabled,
    'cashback_percentage', v_settings.cashback_percentage,
    'transactions', v_tx
  );
end $$;

-- 4b. Admin Adjust Customer Wallet (instant credit or debit; prevents negative balance)
create or replace function public.admin_adjust_customer_wallet(
  p_store_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_note_ar text default '',
  p_note_en text default ''
)
returns table(transaction_id uuid, balance_after numeric)
language plpgsql
security definer
set search_path = '' as $$
declare
  v_caller uuid := auth.uid();
  v_amount numeric(12,2);
  v_current_balance numeric(12,2) := 0;
  v_next_balance numeric(12,2);
  v_type text;
  v_note_ar text;
  v_note_en text;
  v_tx_id uuid;
begin
  if v_caller is null or not public.is_store_admin(p_store_id) then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null or p_user_id is null or p_amount is null then
    raise exception 'invalid_wallet_adjustment';
  end if;

  v_amount := round(p_amount, 2);
  if v_amount = 0 then
    raise exception 'invalid_wallet_adjustment';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wallet:' || p_store_id::text || ':' || p_user_id::text, 0)
  );

  select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
  into v_current_balance
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.user_id = p_user_id;

  v_next_balance := round(v_current_balance + v_amount, 2);
  if v_next_balance < 0 then
    raise exception 'insufficient_wallet_balance';
  end if;

  v_type := case when v_amount > 0 then 'admin_credit' else 'admin_debit' end;
  v_note_ar := left(trim(coalesce(p_note_ar, '')), 300);
  v_note_en := left(trim(coalesce(p_note_en, '')), 300);

  if v_note_ar = '' then
    v_note_ar := case when v_amount > 0 then 'رصيد إضافي من إدارة المتجر' else 'خصم إداري من رصيد المحفظة' end;
  end if;
  if v_note_en = '' then
    v_note_en := case when v_amount > 0 then 'Store credit added by merchant' else 'Store credit deducted by merchant' end;
  end if;

  insert into public.wallet_transactions(
    store_id, user_id, order_id, type, amount, balance_after, note_ar, note_en, created_by
  )
  values(
    p_store_id, p_user_id, null, v_type, v_amount, v_next_balance, v_note_ar, v_note_en, v_caller
  )
  returning id into v_tx_id;

  return query select v_tx_id, v_next_balance;
end $$;

-- 4c. Atomic Wallet Redemption on Checkout (row/advisory-locked, prevents overdraft/race conditions)
create or replace function public.redeem_wallet_for_order(
  p_store_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_max_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = '' as $$
declare
  v_current_balance numeric(12,2) := 0;
  v_redeem numeric(12,2) := 0;
  v_next_balance numeric(12,2) := 0;
  v_existing numeric(12,2);
  v_short_id text := left(p_order_id::text, 8);
begin
  if p_store_id is null or p_user_id is null or p_order_id is null or coalesce(p_max_amount, 0) <= 0 then
    return 0;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wallet:' || p_store_id::text || ':' || p_user_id::text, 0)
  );

  -- Idempotency guard per order
  select abs(wt.amount)
  into v_existing
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.order_id = p_order_id
    and wt.type = 'order_redemption'
  limit 1;

  if found then
    return coalesce(v_existing, 0);
  end if;

  select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
  into v_current_balance
  from public.wallet_transactions wt
  where wt.store_id = p_store_id
    and wt.user_id = p_user_id;

  v_redeem := round(least(v_current_balance, greatest(0::numeric, p_max_amount)), 2);
  if v_redeem <= 0 then
    return 0;
  end if;

  v_next_balance := round(v_current_balance - v_redeem, 2);

  insert into public.wallet_transactions(
    store_id, user_id, order_id, type, amount, balance_after, note_ar, note_en, created_by
  )
  values(
    p_store_id,
    p_user_id,
    p_order_id,
    'order_redemption',
    -v_redeem,
    v_next_balance,
    'استخدام رصيد المحفظة في الطلب #' || v_short_id,
    'Wallet credit redeemed on order #' || v_short_id,
    p_user_id
  );

  return v_redeem;
end $$;

-- 4d. Atomic Refund of Redeemed Wallet Credit when an Order is Cancelled (strictly idempotent)
create or replace function public.refund_wallet_for_cancelled_order(
  p_store_id uuid,
  p_order_id uuid
)
returns table(refunded boolean, amount numeric, balance_after numeric, user_id uuid)
language plpgsql
security definer
set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_current_balance numeric(12,2) := 0;
  v_next_balance numeric(12,2) := 0;
  v_refund numeric(12,2) := 0;
  v_existing public.wallet_transactions%rowtype;
  v_short_id text := left(p_order_id::text, 8);
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_store_admin(p_store_id) then
    raise exception 'not_authorized';
  end if;

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
    auth.uid()
  );

  return query select true, v_refund, v_next_balance, v_order.user_id;
end $$;

-- Trigger: Automatically refund wallet_discount whenever an order transitions to cancelled
create or replace function public.trigger_refund_wallet_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  if old.status is distinct from 'cancelled'
     and new.status = 'cancelled'
     and new.user_id is not null
     and coalesce(new.wallet_discount, 0) > 0 then
    perform public.refund_wallet_for_cancelled_order(new.store_id, new.id);
  end if;
  return new;
end $$;

revoke all on function public.trigger_refund_wallet_on_cancel() from public, anon, authenticated;

drop trigger if exists nova_refund_wallet_on_cancel on public.orders;
create trigger nova_refund_wallet_on_cancel
  after update of status on public.orders
  for each row
  when (old.status is distinct from 'cancelled' and new.status = 'cancelled' and coalesce(new.wallet_discount, 0) > 0)
  execute function public.trigger_refund_wallet_on_cancel();

-- 4e. Award Order Cashback on Delivery (strictly idempotent + optional Phase 9 notification)
create or replace function public.award_order_cashback(
  p_store_id uuid,
  p_order_id uuid,
  p_create_notification boolean default true
)
returns table(awarded boolean, amount numeric, balance_after numeric, user_id uuid)
language plpgsql
security definer
set search_path = '' as $$
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
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_store_admin(p_store_id) then
    raise exception 'not_authorized';
  end if;

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
    auth.uid()
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

-- 5. Upgrade confirm_delivery_by_token so driver one-tap confirmation also credits cashback idempotently
create or replace function public.confirm_delivery_by_token(p_token text)
returns table(
  outcome text,
  order_id uuid,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = '' as $$
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

  if target.status = 'delivered' then
    return query select 'already_delivered'::text, target.id, target.delivered_at;
    return;
  end if;

  if target.status not in ('confirmed', 'shipped') then
    return query select 'invalid_state'::text, target.id, target.delivered_at;
    return;
  end if;

  ts := coalesce(target.delivered_at, now());
  update public.orders
  set status = 'delivered',
      delivered_at = ts
  where id = target.id;

  perform public.award_order_cashback(target.store_id, target.id, true);

  return query select 'delivered'::text, target.id, ts;
end $$;

-- 6. Upgrade store_checkout & mobile_checkout with Server-Side Free Shipping & Atomic Wallet Redemption
drop function if exists public.store_checkout(uuid, text, text, text, jsonb, text, text);
drop function if exists public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean);

create or replace function public.store_checkout(
  request_key uuid,
  address text,
  customer_phone text,
  payment text,
  lines jsonb,
  p_coupon_code text default null,
  p_customer_name text default null,
  p_use_wallet boolean default false
)
returns table(order_number uuid, amount numeric, order_currency text)
language plpgsql
security definer
set search_path = '' as $$
declare
  customer uuid := auth.uid();
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

  fingerprint := md5(jsonb_build_array(v_address, customer_phone, v_payment, lines, v_coupon_clean, v_use_wallet)::text);
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

  select * into strict settings from public.store_settings where id;

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

  if v_cust_id is null then
    select id into v_cust_id
    from public.store_customers
    where store_id = settings.store_id and phone = customer_phone
    limit 1;
  end if;

  if v_cust_id is null then
    insert into public.store_customers (store_id, user_id, full_name, phone, email, address)
    values (settings.store_id, customer, v_cust_name, customer_phone, v_cust_email, v_address)
    returning id into v_cust_id;
  else
    update public.store_customers sc
    set user_id = coalesce(sc.user_id, customer),
        full_name = case when length(v_cust_name) > 0 then v_cust_name else sc.full_name end,
        email = case when length(v_cust_email) > 0 then v_cust_email else sc.email end,
        address = v_address,
        updated_at = now()
    where sc.id = v_cust_id;
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

  -- Lock products in ID order
  for entry in select value from jsonb_array_elements(lines) order by (value->>'id')::uuid loop
    if jsonb_typeof(entry->'quantity') is distinct from 'number'
       or (entry->>'quantity') !~ '^[1-9][0-9]{0,5}$' then
      raise exception 'invalid_quantity';
    end if;
    item_quantity := (entry->>'quantity')::integer;
    chosen_size := coalesce(entry->>'size', '');
    chosen_color := coalesce(entry->>'color', '');
    select * into product from public.products where id = (entry->>'id')::uuid for update;
    if not found or not product.is_active or product.stock < item_quantity then
      raise exception 'stock_unavailable';
    end if;
    if (cardinality(product.sizes) = 0 and chosen_size <> '') or
       (cardinality(product.sizes) > 0 and not coalesce(chosen_size = any(product.sizes), false)) or
       (cardinality(product.colors) = 0 and chosen_color <> '') or
       (cardinality(product.colors) > 0 and not coalesce(chosen_color = any(product.colors), false)) then
      raise exception 'invalid_variant';
    end if;
    update public.products set stock = stock - item_quantity where id = product.id;
    insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, unit_cost, size, color)
      values(new_id, product.id, product.name, item_quantity, product.price, coalesce(product.cost_price, 0), nullif(chosen_size, ''), nullif(chosen_color, ''));
    gross_subtotal := gross_subtotal + product.price * item_quantity;
  end loop;

  -- Apply optional promo coupon atomically
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

  -- Server-side Free Shipping enforcement
  if settings.cart_incentive_enabled
     and coalesce(settings.free_shipping_threshold, 0) > 0
     and gross_subtotal >= settings.free_shipping_threshold then
    v_shipping_fee := 0;
  else
    v_shipping_fee := settings.shipping_fee;
  end if;

  v_pre_wallet_total := net_subtotal + v_shipping_fee;

  -- Atomic wallet credit redemption for signed-in customers
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

  -- When wallet fully covers the order (remainingTotal == 0), complete cleanly as Paid via Store Wallet
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

-- Upgrade mobile_checkout to forward p_use_wallet (preserving full backward compatibility)
drop function if exists public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text);
drop function if exists public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean);

create or replace function public.mobile_checkout(
  p_store uuid,
  request_key uuid,
  address text,
  customer_phone text,
  payment text,
  lines jsonb,
  p_coupon_code text default null,
  p_customer_name text default null,
  p_use_wallet boolean default false
)
returns table(order_number uuid, amount numeric, order_currency text)
language plpgsql
security definer
set search_path = '' as $$
declare item record;
begin
  perform 1 from public.store_settings s where s.id and s.store_id = p_store for share;
  if not found then raise exception 'unknown_store'; end if;
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) not between 1 and 100 then raise exception 'invalid_cart'; end if;
  for item in select distinct (entry->>'id')::uuid as id from jsonb_array_elements(lines) entry order by id loop
    perform 1 from public.products p where p.id = item.id and p.store_id = p_store for update;
    if not found then raise exception 'invalid_cart'; end if;
  end loop;
  return query select r.* from public.store_checkout(request_key, address, customer_phone, payment, lines, p_coupon_code, p_customer_name, coalesce(p_use_wallet, false)) r;
  if exists (select 1 from public.orders o where o.checkout_key = request_key and o.store_id <> p_store) then raise exception 'unknown_store'; end if;
end $$;

-- 7. Explicit RPC Permissions
revoke all on function public.get_customer_wallet_summary(uuid, uuid) from public;
grant execute on function public.get_customer_wallet_summary(uuid, uuid) to authenticated, service_role;

revoke all on function public.admin_adjust_customer_wallet(uuid, uuid, numeric, text, text) from public;
grant execute on function public.admin_adjust_customer_wallet(uuid, uuid, numeric, text, text) to authenticated, service_role;

revoke all on function public.award_order_cashback(uuid, uuid, boolean) from public;
grant execute on function public.award_order_cashback(uuid, uuid, boolean) to authenticated, service_role;

revoke all on function public.redeem_wallet_for_order(uuid, uuid, uuid, numeric) from public, anon, authenticated;
grant execute on function public.redeem_wallet_for_order(uuid, uuid, uuid, numeric) to service_role;

revoke all on function public.refund_wallet_for_cancelled_order(uuid, uuid) from public, anon;
grant execute on function public.refund_wallet_for_cancelled_order(uuid, uuid) to authenticated, service_role;

revoke all on function public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean) from public;
grant execute on function public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean) to anon, authenticated;

revoke all on function public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean) from public;
grant execute on function public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
