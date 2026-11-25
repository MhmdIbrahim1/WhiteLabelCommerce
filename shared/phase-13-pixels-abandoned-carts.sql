-- Phase 13: Multi-Tenant Ad Pixels (Meta / TikTok / GA4) & Omnichannel Abandoned Cart Recovery
-- Extends public.store_settings with per-tenant pixel IDs, creates public.abandoned_carts with strict
-- multi-tenant RLS, and implements SECURITY DEFINER RPCs: upsert_abandoned_cart,
-- mark_abandoned_cart_recovered, and admin_update_abandoned_cart.
-- Apply after phase-12-returns-wallet-refunds.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 1. PER-TENANT AD PIXEL COLUMNS ON public.store_settings
-- ============================================================================
alter table public.store_settings
  add column if not exists meta_pixel_id text null,
  add column if not exists tiktok_pixel_id text null,
  add column if not exists ga4_measurement_id text null;

-- ============================================================================
-- 2. OMNICHANNEL ABANDONED CARTS TABLE, INDEXES & STRICT RLS
-- ============================================================================
create table if not exists public.abandoned_carts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  session_key text not null,
  customer_name text null,
  customer_email text null,
  customer_phone text null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  currency text not null default 'EGP',
  source text not null default 'web',
  status text not null default 'open',
  recovery_coupon_code text null,
  reminder_count integer not null default 0,
  last_reminded_at timestamptz null,
  recovered_order_id uuid null references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.abandoned_carts drop constraint if exists abandoned_carts_source_check;
alter table public.abandoned_carts add constraint abandoned_carts_source_check
  check (source in ('web', 'android'));

alter table public.abandoned_carts drop constraint if exists abandoned_carts_status_check;
alter table public.abandoned_carts add constraint abandoned_carts_status_check
  check (status in ('open', 'reminded', 'recovered', 'dismissed'));

alter table public.abandoned_carts drop constraint if exists abandoned_carts_subtotal_check;
alter table public.abandoned_carts add constraint abandoned_carts_subtotal_check
  check (subtotal >= 0);

alter table public.abandoned_carts drop constraint if exists abandoned_carts_reminder_count_check;
alter table public.abandoned_carts add constraint abandoned_carts_reminder_count_check
  check (reminder_count >= 0);

alter table public.abandoned_carts drop constraint if exists abandoned_carts_items_array_check;
alter table public.abandoned_carts add constraint abandoned_carts_items_array_check
  check (jsonb_typeof(items) = 'array');

create unique index if not exists uidx_abandoned_carts_store_session
  on public.abandoned_carts (store_id, session_key);

create index if not exists idx_abandoned_carts_store_status_updated
  on public.abandoned_carts (store_id, status, updated_at desc);

create index if not exists idx_abandoned_carts_store_user
  on public.abandoned_carts (store_id, user_id)
  where user_id is not null;

alter table public.abandoned_carts enable row level security;

revoke all on public.abandoned_carts from public, anon, authenticated;
grant select, update on public.abandoned_carts to authenticated;
grant select, insert, update, delete on public.abandoned_carts to service_role;

drop policy if exists admin_read_store_abandoned_carts on public.abandoned_carts;
create policy admin_read_store_abandoned_carts
  on public.abandoned_carts
  for select
  to authenticated
  using (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  );

drop policy if exists admin_update_store_abandoned_carts on public.abandoned_carts;
create policy admin_update_store_abandoned_carts
  on public.abandoned_carts
  for update
  to authenticated
  using (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  )
  with check (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  );

-- ============================================================================
-- 3. ATOMIC RPC 1: public.upsert_abandoned_cart (WEB & ANDROID)
-- ============================================================================
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
returns public.abandoned_carts
language plpgsql
security definer
set search_path = public
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
  v_row public.abandoned_carts%rowtype;
begin
  if p_store_id is null or length(v_session) < 3 then
    raise exception 'invalid_session_key';
  end if;

  if not exists (select 1 from public.stores st where st.id = p_store_id) then
    raise exception 'unknown_store';
  end if;

  -- Empty cart or zero subtotal -> remove any active non-recovered row
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or v_subtotal <= 0 then
    delete from public.abandoned_carts ac
    where ac.store_id = p_store_id
      and ac.session_key = v_session
      and ac.status <> 'recovered';
    return null;
  end if;

  -- Enrich contact details from authenticated customer profile when available
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

  return v_row;
end $$;

revoke all on function public.upsert_abandoned_cart(uuid, text, jsonb, numeric, text, text, text, text, text) from public;
grant execute on function public.upsert_abandoned_cart(uuid, text, jsonb, numeric, text, text, text, text, text) to anon, authenticated, service_role;

-- ============================================================================
-- 4. ATOMIC RPC 2: public.mark_abandoned_cart_recovered
-- ============================================================================
create or replace function public.mark_abandoned_cart_recovered(
  p_store_id uuid,
  p_session_key text default null,
  p_order_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_session text := nullif(left(trim(coalesce(p_session_key, '')), 120), '');
  v_count integer := 0;
begin
  if p_store_id is null or (v_session is null and v_uid is null) then
    return 0;
  end if;

  update public.abandoned_carts ac
  set status = 'recovered',
      recovered_order_id = coalesce(p_order_id, ac.recovered_order_id),
      updated_at = now()
  where ac.store_id = p_store_id
    and ac.status in ('open', 'reminded')
    and (
      (v_session is not null and ac.session_key = v_session)
      or (v_uid is not null and ac.user_id = v_uid)
    );

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.mark_abandoned_cart_recovered(uuid, text, uuid) from public;
grant execute on function public.mark_abandoned_cart_recovered(uuid, text, uuid) to anon, authenticated, service_role;

-- ============================================================================
-- 5. ATOMIC RPC 3: public.admin_update_abandoned_cart
-- ============================================================================
create or replace function public.admin_update_abandoned_cart(
  p_cart_id uuid,
  p_action text,
  p_coupon_code text default null
)
returns public.abandoned_carts
language plpgsql
security definer
set search_path = public
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

  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role'
     and not (public.is_store_admin(v_cart.store_id) or public.is_platform_super_admin()) then
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

notify pgrst, 'reload schema';

commit;
