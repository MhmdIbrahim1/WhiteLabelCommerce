-- Phase 6: Multi-Tenant Store-Scoped Auth, Customer CRM, Cost/Profit Tracking & Promo Coupons
-- Apply after phase-5-search-index.sql. Idempotent and backward compatible.
begin;

-- 1. Multi-tenant store_id scoping across core tables (default tenant UUID for existing singleton store)
alter table public.store_settings
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid;
create unique index if not exists store_settings_store_id_uidx on public.store_settings (store_id);

alter table public.profiles
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid;

alter table public.products
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  add column if not exists cost_price numeric(12,2) not null default 0 check (cost_price >= 0);

alter table public.order_items
  add column if not exists unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0);

alter table public.orders
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0);

create index if not exists orders_store_created_idx on public.orders (store_id, created_at desc);

-- Multi-tenant store admin helper
create or replace function public.is_store_admin(target_store_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.store_id = target_store_id
  )
$$;
revoke all on function public.is_store_admin(uuid) from public, anon;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;

-- 2. Store-scoped Customers CRM table
create table if not exists public.store_customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_customers_store_user_uidx
  on public.store_customers (store_id, user_id)
  where user_id is not null;

create unique index if not exists store_customers_store_phone_uidx
  on public.store_customers (store_id, phone)
  where length(phone) >= 8;

create index if not exists store_customers_store_idx
  on public.store_customers (store_id, created_at desc);

alter table public.orders
  add column if not exists customer_id uuid references public.store_customers(id) on delete set null;
create index if not exists orders_customer_ref_idx on public.orders (customer_id);

-- Strict store_id RLS on store_customers
alter table public.store_customers enable row level security;
revoke all on public.store_customers from public, anon, authenticated;
grant select, insert, update, delete on public.store_customers to authenticated, service_role;

drop policy if exists admin_manage_store_customers on public.store_customers;
create policy admin_manage_store_customers on public.store_customers
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

drop policy if exists customer_read_own_record on public.store_customers;
create policy customer_read_own_record on public.store_customers
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists customer_update_own_record on public.store_customers;
create policy customer_update_own_record on public.store_customers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Tighten store_id admin isolation on orders & products
drop policy if exists admin_manage on public.orders;
create policy admin_manage on public.orders
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

drop policy if exists admin_manage on public.products;
create policy admin_manage on public.products
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

-- 3. Promo Coupons table (strict store_id scoped)
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid,
  code text not null check (length(trim(code)) between 2 and 40),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists coupons_store_code_uidx
  on public.coupons (store_id, upper(trim(code)));

alter table public.coupons enable row level security;
revoke all on public.coupons from public, anon, authenticated;
grant select, insert, update, delete on public.coupons to authenticated, service_role;

drop policy if exists admin_manage_coupons on public.coupons;
create policy admin_manage_coupons on public.coupons
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

-- 4. Public-safe coupon validation RPC (returns discount preview without exposing coupons table)
create or replace function public.validate_coupon(
  p_code text,
  p_subtotal numeric
)
returns table(
  valid boolean,
  reason text,
  code text,
  discount_type text,
  discount_value numeric,
  discount_amount numeric,
  min_order_amount numeric
)
language plpgsql
stable
security definer
set search_path = '' as $$
declare
  v_store_id uuid;
  v_clean text := upper(trim(coalesce(p_code, '')));
  v_sub numeric := greatest(0, coalesce(p_subtotal, 0));
  c public.coupons%rowtype;
  v_disc numeric := 0;
begin
  select s.store_id into strict v_store_id from public.store_settings s where s.id;

  if length(v_clean) < 2 then
    return query select false, 'invalid_code'::text, v_clean, null::text, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  select * into c
  from public.coupons cp
  where cp.store_id = v_store_id
    and upper(trim(cp.code)) = v_clean;

  if not found or not c.is_active then
    return query select false, 'not_found'::text, v_clean, null::text, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  if c.expires_at is not null and c.expires_at < now() then
    return query select false, 'expired'::text, c.code, c.discount_type, c.discount_value, 0::numeric, c.min_order_amount;
    return;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return query select false, 'max_uses_reached'::text, c.code, c.discount_type, c.discount_value, 0::numeric, c.min_order_amount;
    return;
  end if;

  if v_sub < c.min_order_amount then
    return query select false, 'min_order_not_met'::text, c.code, c.discount_type, c.discount_value, 0::numeric, c.min_order_amount;
    return;
  end if;

  if c.discount_type = 'percent' then
    v_disc := round(v_sub * least(c.discount_value, 100) / 100.0, 2);
  else
    v_disc := least(v_sub, c.discount_value);
  end if;

  return query select true, 'ok'::text, c.code, c.discount_type, c.discount_value, v_disc, c.min_order_amount;
end $$;

revoke all on function public.validate_coupon(text, numeric) from public;
grant execute on function public.validate_coupon(text, numeric) to anon, authenticated;

-- 5. Sync customer profile & automatically link previous guest orders by store_id + phone
create or replace function public.sync_customer_profile(
  p_full_name text default '',
  p_phone text default '',
  p_city text default '',
  p_address text default ''
)
returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_store_id uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_name text := trim(coalesce(p_full_name, ''));
  v_city text := trim(coalesce(p_city, ''));
  v_addr text := trim(coalesce(p_address, ''));
  v_cust_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  select s.store_id into strict v_store_id from public.store_settings s where s.id;
  select coalesce(u.email, '') into v_email from auth.users u where u.id = v_uid;

  -- Try existing record by (store_id, user_id)
  select id into v_cust_id
  from public.store_customers
  where store_id = v_store_id and user_id = v_uid;

  -- Otherwise try linking an existing guest record by (store_id, phone)
  if v_cust_id is null and length(v_phone) >= 8 then
    select id into v_cust_id
    from public.store_customers
    where store_id = v_store_id and phone = v_phone and user_id is null
    limit 1;
  end if;

  if v_cust_id is null then
    insert into public.store_customers (store_id, user_id, full_name, phone, email, city, address)
    values (v_store_id, v_uid, v_name, v_phone, v_email, v_city, v_addr)
    returning id into v_cust_id;
  else
    update public.store_customers
    set user_id = v_uid,
        full_name = case when length(v_name) > 0 then v_name else full_name end,
        phone = case when length(v_phone) >= 8 then v_phone else phone end,
        email = case when length(v_email) > 0 then v_email else email end,
        city = case when length(v_city) > 0 then v_city else city end,
        address = case when length(v_addr) > 0 then v_addr else address end,
        updated_at = now()
    where id = v_cust_id;
  end if;

  -- Attach previous guest orders in this store matching the customer's normalized phone
  if length(v_phone) >= 8 then
    update public.orders
    set user_id = v_uid,
        customer_id = v_cust_id
    where store_id = v_store_id
      and user_id is null
      and phone = v_phone;
  end if;

  -- Ensure existing user orders in this store also point to customer_id
  update public.orders
  set customer_id = v_cust_id
  where store_id = v_store_id
    and user_id = v_uid
    and customer_id is null;

  return v_cust_id;
end $$;

revoke all on function public.sync_customer_profile(text, text, text, text) from public, anon;
grant execute on function public.sync_customer_profile(text, text, text, text) to authenticated;

-- 6. Upgrade store_checkout to upsert store_customers, snapshot unit_cost, and support optional promo coupon
drop function if exists public.store_checkout(uuid, text, text, text, jsonb);
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
  if request_key is null or payment is distinct from 'COD'
    or address is null or length(v_address) not between 3 and 500
    or customer_phone is null or customer_phone !~ '^[0-9]{8,15}$'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'invalid_checkout';
  end if;
  if jsonb_array_length(lines) not between 1 and 100 then
    raise exception 'invalid_cart';
  end if;

  fingerprint := md5(jsonb_build_array(v_address, customer_phone, payment, lines, v_coupon_clean)::text);
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
    store_id, user_id, customer_id, shipping_address, phone, payment_method, guest_tracking,
    currency, shipping_fee, subtotal, checkout_key, checkout_fingerprint
  )
  values(
    settings.store_id, customer, v_cust_id, v_address, customer_phone, payment, customer is null,
    settings.currency, settings.shipping_fee, 0, request_key, fingerprint
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

-- 7. Backfill store_customers from pre-existing orders so CRM has immediate historical data
do $$
declare
  o record;
  v_cid uuid;
  v_email text;
begin
  for o in
    select id, store_id, user_id, phone, shipping_address, created_at
    from public.orders
    where customer_id is null
    order by created_at asc
  loop
    v_cid := null;
    v_email := '';
    if o.user_id is not null then
      select coalesce(email, '') into v_email from auth.users where id = o.user_id;
      select id into v_cid from public.store_customers where store_id = o.store_id and user_id = o.user_id;
    end if;
    if v_cid is null and o.phone is not null and length(o.phone) >= 8 then
      select id into v_cid from public.store_customers where store_id = o.store_id and phone = o.phone limit 1;
    end if;
    if v_cid is null then
      insert into public.store_customers (store_id, user_id, phone, email, address, created_at)
      values (o.store_id, o.user_id, coalesce(o.phone, ''), v_email, coalesce(o.shipping_address, ''), o.created_at)
      returning id into v_cid;
    end if;
    update public.orders set customer_id = v_cid where id = o.id;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
