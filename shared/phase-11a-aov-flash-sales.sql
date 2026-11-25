-- Phase 11A: Conversion & AOV Boost Engine (Flash Sales, Related Products & Smart Cart Upsells)
-- Adds flash sale pricing & time window fields on public.products, pure server-side
-- get_effective_product_price helper, upgrades store_checkout & mobile_checkout for
-- tamper-proof flash sale pricing, creates multi-tenant get_related_products &
-- get_cart_upsell_products RPCs, and seeds 3 active 72h Flash Deals for Nova Store.
-- Apply after phase-10c-reviews-wishlist.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 1. FLASH SALE COLUMNS, CONSTRAINTS & PARTIAL INDEX ON `public.products`
-- ============================================================================
alter table public.products
  add column if not exists flash_sale_price numeric(10,2) null,
  add column if not exists flash_sale_starts_at timestamptz null,
  add column if not exists flash_sale_ends_at timestamptz null;

alter table public.products drop constraint if exists products_flash_sale_price_check;
alter table public.products add constraint products_flash_sale_price_check
  check (flash_sale_price is null or flash_sale_price > 0);

alter table public.products drop constraint if exists products_flash_sale_window_check;
alter table public.products add constraint products_flash_sale_window_check
  check (
    flash_sale_starts_at is null
    or flash_sale_ends_at is null
    or flash_sale_ends_at > flash_sale_starts_at
  );

create index if not exists idx_products_store_flash_deals
  on public.products (store_id, flash_sale_ends_at)
  where is_active = true
    and flash_sale_price is not null
    and flash_sale_ends_at is not null;

-- ============================================================================
-- 2. PURE EFFECTIVE PRICE HELPER (`public.get_effective_product_price`)
-- ============================================================================
create or replace function public.get_effective_product_price(
  p_regular_price numeric,
  p_flash_sale_price numeric,
  p_flash_sale_starts_at timestamptz,
  p_flash_sale_ends_at timestamptz,
  p_at timestamptz default now()
)
returns numeric
language sql
stable
set search_path = '' as $$
  select case
    when p_flash_sale_price is not null
     and p_regular_price is not null
     and p_flash_sale_price > 0
     and p_flash_sale_price < p_regular_price
     and p_flash_sale_ends_at is not null
     and p_flash_sale_ends_at > coalesce(p_at, now())
     and (p_flash_sale_starts_at is null or coalesce(p_at, now()) >= p_flash_sale_starts_at)
    then p_flash_sale_price
    else p_regular_price
  end;
$$;

revoke all on function public.get_effective_product_price(numeric, numeric, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.get_effective_product_price(numeric, numeric, timestamptz, timestamptz, timestamptz)
  to anon, authenticated, service_role;

-- ============================================================================
-- 3. SERVER-SIDE CHECKOUT SECURITY (`store_checkout` & `mobile_checkout`)
--    Preserves exact Phase 10B signatures while enforcing get_effective_product_price
-- ============================================================================
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
set search_path = '' as $$
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
begin
  return query
  select r.*
  from public.store_checkout(
    request_key,
    address,
    customer_phone,
    payment,
    lines,
    p_coupon_code,
    p_customer_name,
    coalesce(p_use_wallet, false),
    p_store
  ) r;
end $$;

revoke all on function public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean) from public;
grant execute on function public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean) to anon, authenticated;

-- ============================================================================
-- 4. MULTI-TENANT RECOMMENDATION RPCs (`get_related_products` & `get_cart_upsell_products`)
-- ============================================================================

-- 4a. Related Products ("Customers Also Bought")
drop function if exists public.get_related_products(uuid, uuid, integer);
create or replace function public.get_related_products(
  p_store_id uuid,
  p_product_id uuid,
  p_limit integer default 6
)
returns table(
  id uuid,
  category_id uuid,
  slug text,
  name text,
  name_en text,
  description text,
  description_en text,
  price numeric,
  old_price numeric,
  flash_sale_price numeric,
  flash_sale_starts_at timestamptz,
  flash_sale_ends_at timestamptz,
  stock integer,
  is_active boolean,
  sizes text[],
  colors text[],
  image_path text,
  specifications jsonb,
  avg_rating numeric,
  review_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 6), 1), 24);
  v_category_id uuid;
begin
  if p_store_id is null or p_product_id is null then
    return;
  end if;

  select p.category_id
  into v_category_id
  from public.products p
  where p.id = p_product_id
    and p.store_id = p_store_id
  limit 1;

  return query
  with co_purchased as (
    select
      oi2.product_id as rel_product_id,
      count(distinct o.id)::integer as co_count
    from public.orders o
    join public.order_items oi1 on oi1.order_id = o.id
    join public.order_items oi2 on oi2.order_id = o.id
    where o.store_id = p_store_id
      and o.status <> 'cancelled'
      and oi1.product_id = p_product_id
      and oi2.product_id is not null
      and oi2.product_id <> p_product_id
    group by oi2.product_id
  )
  select
    p.id,
    p.category_id,
    coalesce(p.slug, '')::text as slug,
    p.name::text,
    p.name_en::text,
    coalesce(p.description, '')::text as description,
    p.description_en::text,
    p.price::numeric,
    p.old_price::numeric,
    p.flash_sale_price::numeric,
    p.flash_sale_starts_at,
    p.flash_sale_ends_at,
    p.stock::integer,
    p.is_active,
    coalesce(p.sizes, '{}'::text[]) as sizes,
    coalesce(p.colors, '{}'::text[]) as colors,
    p.image_path::text,
    coalesce(p.specifications, '[]'::jsonb) as specifications,
    coalesce(p.avg_rating, 0)::numeric as avg_rating,
    coalesce(p.review_count, 0)::integer as review_count,
    p.created_at
  from public.products p
  left join co_purchased cp on cp.rel_product_id = p.id
  where p.store_id = p_store_id
    and p.is_active = true
    and p.stock > 0
    and p.id <> p_product_id
  order by
    case when coalesce(cp.co_count, 0) > 0 then 0 else 1 end asc,
    coalesce(cp.co_count, 0) desc,
    case when v_category_id is not null and p.category_id = v_category_id then 0 else 1 end asc,
    coalesce(p.avg_rating, 0) desc,
    coalesce(p.review_count, 0) desc,
    p.created_at desc,
    p.id asc
  limit v_limit;
end $$;

revoke all on function public.get_related_products(uuid, uuid, integer) from public;
grant execute on function public.get_related_products(uuid, uuid, integer)
  to anon, authenticated, service_role;

-- 4b. Smart Cart Upsell Products (Free-Shipping Gap Closer + Flash Deals)
drop function if exists public.get_cart_upsell_products(uuid, uuid[], numeric, integer);
create or replace function public.get_cart_upsell_products(
  p_store_id uuid,
  p_cart_product_ids uuid[] default '{}'::uuid[],
  p_gap_amount numeric default 0,
  p_limit integer default 4
)
returns table(
  id uuid,
  category_id uuid,
  slug text,
  name text,
  name_en text,
  description text,
  description_en text,
  price numeric,
  old_price numeric,
  flash_sale_price numeric,
  flash_sale_starts_at timestamptz,
  flash_sale_ends_at timestamptz,
  stock integer,
  is_active boolean,
  sizes text[],
  colors text[],
  image_path text,
  specifications jsonb,
  avg_rating numeric,
  review_count integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 4), 1), 12);
  v_gap numeric := greatest(0::numeric, coalesce(p_gap_amount, 0));
  v_excluded uuid[] := coalesce(p_cart_product_ids, '{}'::uuid[]);
  v_now timestamptz := now();
begin
  if p_store_id is null then
    return;
  end if;

  return query
  with candidates as (
    select
      p.*,
      public.get_effective_product_price(
        p.price,
        p.flash_sale_price,
        p.flash_sale_starts_at,
        p.flash_sale_ends_at,
        v_now
      ) as eff_price
    from public.products p
    where p.store_id = p_store_id
      and p.is_active = true
      and p.stock > 0
      and not (p.id = any(v_excluded))
  )
  select
    c.id,
    c.category_id,
    coalesce(c.slug, '')::text as slug,
    c.name::text,
    c.name_en::text,
    coalesce(c.description, '')::text as description,
    c.description_en::text,
    c.price::numeric,
    c.old_price::numeric,
    c.flash_sale_price::numeric,
    c.flash_sale_starts_at,
    c.flash_sale_ends_at,
    c.stock::integer,
    c.is_active,
    coalesce(c.sizes, '{}'::text[]) as sizes,
    coalesce(c.colors, '{}'::text[]) as colors,
    c.image_path::text,
    coalesce(c.specifications, '[]'::jsonb) as specifications,
    coalesce(c.avg_rating, 0)::numeric as avg_rating,
    coalesce(c.review_count, 0)::integer as review_count,
    c.created_at
  from candidates c
  order by
    case
      when v_gap > 0 then
        case
          when c.eff_price >= v_gap and c.eff_price <= greatest(v_gap * 2.2, v_gap + 350) then 0
          when c.eff_price < v_gap or c.eff_price < c.price then 1
          else 2
        end
      else
        case when c.eff_price < c.price then 0 else 1 end
    end asc,
    case when c.eff_price < c.price then 0 else 1 end asc,
    case when v_gap > 0 then abs(c.eff_price - v_gap) else 0 end asc,
    coalesce(c.avg_rating, 0) desc,
    coalesce(c.review_count, 0) desc,
    c.eff_price asc,
    c.created_at desc,
    c.id asc
  limit v_limit;
end $$;

revoke all on function public.get_cart_upsell_products(uuid, uuid[], numeric, integer) from public;
grant execute on function public.get_cart_upsell_products(uuid, uuid[], numeric, integer)
  to anon, authenticated, service_role;

-- ============================================================================
-- 5. REALISTIC 72-HOUR FLASH SALE SEED (NOVA STORE ONLY — 3 IN-STOCK PRODUCTS)
-- ============================================================================
do $$
declare
  v_nova_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_active_count integer := 0;
  v_needed integer := 0;
  v_rec record;
  v_discounts numeric[] := array[0.20, 0.25, 0.15];
  v_idx integer := 0;
  v_flash numeric(10,2);
begin
  if not exists (select 1 from public.stores where id = v_nova_id) then
    return;
  end if;

  select count(*)::integer
  into v_active_count
  from public.products p
  where p.store_id = v_nova_id
    and p.is_active = true
    and p.stock > 0
    and p.flash_sale_price is not null
    and p.flash_sale_price < p.price
    and p.flash_sale_ends_at is not null
    and p.flash_sale_ends_at > now()
    and (p.flash_sale_starts_at is null or now() >= p.flash_sale_starts_at);

  if v_active_count >= 3 then
    return;
  end if;

  v_needed := 3 - v_active_count;

  for v_rec in
    select p.id, p.price
    from public.products p
    where p.store_id = v_nova_id
      and p.is_active = true
      and p.stock > 0
      and p.price >= 100
      and (
        p.flash_sale_price is null
        or p.flash_sale_ends_at is null
        or p.flash_sale_ends_at <= now()
      )
    order by coalesce(p.review_count, 0) desc, p.created_at desc, p.id asc
    limit v_needed
  loop
    v_idx := v_idx + 1;
    v_flash := greatest(
      1::numeric,
      least(
        v_rec.price - 1,
        round((v_rec.price * (1 - v_discounts[least(v_idx, 3)])) / 5.0) * 5.0
      )
    );
    update public.products
    set
      flash_sale_price = v_flash,
      flash_sale_starts_at = now(),
      flash_sale_ends_at = now() + interval '72 hours'
    where id = v_rec.id;
  end loop;
end $$;

commit;

NOTIFY pgrst, 'reload schema';
