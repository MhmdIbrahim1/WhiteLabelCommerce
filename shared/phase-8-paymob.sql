-- Phase 8: Enterprise Multi-Tenant Paymob Payment Gateway Integration
-- Adds public payment method flags on store_settings, isolated store_payment_secrets
-- with strict RLS (zero anon access, store-admin + service_role only), order payment
-- tracking columns + indexes, and upgrades store_checkout & track_guest_order.
-- Apply after phase-7d-scalable-search.sql. Idempotent and safe to re-run.
begin;

-- 1. Public Store Payment Flags on public.store_settings
alter table public.store_settings
  add column if not exists cod_enabled boolean not null default true,
  add column if not exists paymob_enabled boolean not null default false,
  add column if not exists paymob_card_enabled boolean not null default false,
  add column if not exists paymob_wallet_enabled boolean not null default false;

-- 2. Isolated Secret Credentials Table (strictly store_id scoped; ZERO anon access)
create table if not exists public.store_payment_secrets (
  store_id uuid primary key references public.store_settings(store_id) on delete cascade,
  paymob_api_key text,
  paymob_card_integration_id text,
  paymob_wallet_integration_id text,
  paymob_iframe_id text,
  paymob_hmac_secret text,
  updated_at timestamptz not null default now()
);

alter table public.store_payment_secrets enable row level security;

revoke all on public.store_payment_secrets from public;
revoke all on public.store_payment_secrets from anon;
revoke all on public.store_payment_secrets from authenticated;

grant select, insert, update, delete on public.store_payment_secrets to authenticated, service_role;

drop policy if exists admin_manage_payment_secrets on public.store_payment_secrets;
create policy admin_manage_payment_secrets
  on public.store_payment_secrets
  for all
  to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

-- 3. Order Payment Columns & Indexes on public.orders
do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%payment_method%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', c_name);
  end loop;
end $$;

alter table public.orders
  add column if not exists payment_method text not null default 'cod',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paymob_order_id text,
  add column if not exists payment_transaction_id text;

update public.orders
set payment_method = case
  when payment_method is null or lower(trim(payment_method)) = 'cod' then 'cod'
  when lower(trim(payment_method)) in ('card', 'paymob_card') then 'paymob_card'
  when lower(trim(payment_method)) in ('wallet', 'paymob_wallet') then 'paymob_wallet'
  else 'cod'
end;

alter table public.orders
  alter column payment_method set default 'cod',
  alter column payment_method set not null;

alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('cod', 'paymob_card', 'paymob_wallet'));

alter table public.orders
  drop constraint if exists orders_payment_status_check;
alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

create index if not exists idx_orders_paymob_order_id
  on public.orders (paymob_order_id)
  where paymob_order_id is not null;

create index if not exists idx_orders_payment_transaction_id
  on public.orders (payment_transaction_id)
  where payment_transaction_id is not null;

-- 4. Upgrade store_checkout to support COD, Paymob Card & Paymob Wallet with store_settings checks
create or replace function public.store_checkout(
  request_key uuid,
  address text,
  customer_phone text,
  payment text,
  lines jsonb,
  p_coupon_code text default null,
  p_customer_name text default null
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
  applied_coupon text := null;
  c public.coupons%rowtype;
  v_coupon_clean text := upper(trim(coalesce(p_coupon_code, '')));
  v_address text := trim(coalesce(address, ''));
  v_cust_name text := trim(coalesce(p_customer_name, ''));
  v_cust_email text := '';
  v_cust_id uuid;
  new_id uuid;
begin
  if request_key is null
    or v_payment not in ('cod', 'paymob_card', 'paymob_wallet')
    or address is null or length(v_address) not between 3 and 500
    or customer_phone is null or customer_phone !~ '^[0-9]{8,15}$'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'invalid_checkout';
  end if;
  if jsonb_array_length(lines) not between 1 and 100 then
    raise exception 'invalid_cart';
  end if;

  fingerprint := md5(jsonb_build_array(v_address, customer_phone, v_payment, lines, v_coupon_clean)::text);
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
    guest_tracking, currency, shipping_fee, subtotal, checkout_key, checkout_fingerprint
  )
  values(
    settings.store_id, customer, v_cust_id, v_address, customer_phone, v_payment, v_pay_status,
    customer is null, settings.currency, settings.shipping_fee, 0, request_key, fingerprint
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

  update public.orders
  set subtotal = greatest(0, gross_subtotal - discount_val),
      coupon_code = applied_coupon,
      discount_amount = discount_val
  where id = new_id;

  return query select o.id, o.total, o.currency from public.orders o where o.id = new_id;
end $$;

revoke all on function public.store_checkout(uuid, text, text, text, jsonb, text, text) from public;
grant execute on function public.store_checkout(uuid, text, text, text, jsonb, text, text) to anon, authenticated;

-- 5. Upgrade track_guest_order RPC to expose payment_method and payment_status
drop function if exists public.track_guest_order(uuid, text);
create or replace function public.track_guest_order(
  order_number uuid,
  customer_phone text
)
returns table(
  id uuid,
  status text,
  created_at timestamptz,
  shipping_carrier text,
  tracking_number text,
  tracking_url text,
  courier_note text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  payment_method text,
  payment_status text
)
language sql
stable
security definer
set search_path = '' as $$
  select
    o.id,
    o.status,
    o.created_at,
    o.shipping_carrier,
    o.tracking_number,
    o.tracking_url,
    o.courier_note,
    o.shipped_at,
    o.delivered_at,
    o.payment_method,
    o.payment_status
  from public.orders o
  where o.id = order_number
    and o.guest_tracking
    and o.user_id is null
    and o.phone = customer_phone
$$;

revoke all on function public.track_guest_order(uuid, text) from public;
grant execute on function public.track_guest_order(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
