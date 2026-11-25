-- Phase 11B: Self-Serve White-Label APK Factory, Plan Gating, Merchant Handover & Build Tracking
-- Extends public.stores with mobile_app_access & pending_owner_email, adds pure helper
-- store_has_mobile_app_access, adds super_admin_assign_store_owner + auto-claim on login
-- inside get_my_managed_stores, upgrades super_admin_list_stores_overview &
-- super_admin_update_store_plan_and_status, and creates public.store_app_builds with strict RLS.
-- Apply after phase-11a-aov-flash-sales.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 1. PER-STORE MOBILE APP ACCESS & PENDING OWNER HANDOVER (`public.stores`)
-- ============================================================================
alter table public.stores
  add column if not exists mobile_app_access text not null default 'plan',
  add column if not exists pending_owner_email text null;

alter table public.stores drop constraint if exists stores_mobile_app_access_check;
alter table public.stores add constraint stores_mobile_app_access_check
  check (mobile_app_access in ('plan', 'enabled', 'disabled'));

create index if not exists idx_stores_pending_owner_email
  on public.stores (lower(pending_owner_email))
  where pending_owner_email is not null;

-- ============================================================================
-- 2. PURE HELPER: `public.store_has_mobile_app_access(p_store_id uuid)`
-- ============================================================================
create or replace function public.store_has_mobile_app_access(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = '' as $$
  select coalesce(
    (
      select case
        when st.mobile_app_access = 'enabled' then true
        when st.mobile_app_access = 'disabled' then false
        else st.plan in ('growth', 'enterprise')
      end
      from public.stores st
      where st.id = p_store_id
      limit 1
    ),
    false
  );
$$;

revoke all on function public.store_has_mobile_app_access(uuid) from public;
grant execute on function public.store_has_mobile_app_access(uuid)
  to anon, authenticated, service_role;

-- ============================================================================
-- 3. MERCHANT OWNER ASSIGNMENT & AUTO-CLAIM ON SIGN-IN
-- ============================================================================
create or replace function public.claim_pending_store_ownership()
returns integer
language plpgsql
security definer
set search_path = '' as $$
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

  select lower(trim(coalesce(u.email::text, '')))
  into v_email
  from auth.users u
  where u.id = v_uid
  limit 1;

  if length(v_email) < 3 then
    return 0;
  end if;

  for v_rec in
    select st.id
    from public.stores st
    where st.pending_owner_email is not null
      and lower(trim(st.pending_owner_email)) = v_email
    for update
  loop
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
set search_path = '' as $$
#variable_conflict use_column
declare
  v_email text := lower(trim(coalesce(p_owner_email, '')));
  v_user_id uuid := null;
begin
  if not public.is_platform_super_admin() then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null or not exists (select 1 from public.stores st where st.id = p_store_id) then
    raise exception 'unknown_store';
  end if;

  if length(v_email) < 5 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email::text, ''))) = v_email
  order by u.created_at asc
  limit 1;

  if v_user_id is not null then
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

-- Upgrade get_my_managed_stores() (VOLATILE so it auto-claims pending_owner_email on login)
drop function if exists public.get_my_managed_stores();
create or replace function public.get_my_managed_stores()
returns table(
  store_id uuid,
  slug text,
  name_ar text,
  name_en text,
  plan text,
  status text,
  max_products integer,
  role text,
  mobile_app_access text,
  mobile_app_unlocked boolean
)
language plpgsql
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  -- Automatically claim any store whose pending_owner_email matches this authenticated user
  perform public.claim_pending_store_ownership();

  if public.is_platform_super_admin() then
    return query
    select
      st.id as store_id,
      st.slug::text,
      coalesce(nullif(ss.store_name, ''), st.name_ar)::text as name_ar,
      coalesce(nullif(st.name_en, ''), st.name_ar)::text as name_en,
      st.plan::text,
      st.status::text,
      st.max_products::integer,
      'super_admin'::text as role,
      st.mobile_app_access::text,
      public.store_has_mobile_app_access(st.id) as mobile_app_unlocked
    from public.stores st
    left join public.store_settings ss on ss.store_id = st.id
    order by
      case when st.id = '00000000-0000-0000-0000-000000000001'::uuid then 0 else 1 end,
      st.created_at desc;
    return;
  end if;

  return query
  select distinct on (st.id)
    st.id as store_id,
    st.slug::text,
    coalesce(nullif(ss.store_name, ''), st.name_ar)::text as name_ar,
    coalesce(nullif(st.name_en, ''), st.name_ar)::text as name_en,
    st.plan::text,
    st.status::text,
    st.max_products::integer,
    coalesce(sm.role, 'admin')::text as role,
    st.mobile_app_access::text,
    public.store_has_mobile_app_access(st.id) as mobile_app_unlocked
  from public.stores st
  left join public.store_settings ss on ss.store_id = st.id
  left join public.store_members sm
    on sm.store_id = st.id and sm.user_id = v_uid and sm.role in ('owner', 'admin')
  left join public.profiles p
    on p.store_id = st.id and p.id = v_uid and p.role = 'admin'
  where sm.user_id is not null or p.id is not null
  order by st.id, st.created_at desc;
end $$;

revoke all on function public.get_my_managed_stores() from public, anon;
grant execute on function public.get_my_managed_stores() to authenticated, service_role;

-- ============================================================================
-- 4. UPGRADE SUPER-ADMIN OVERVIEW & PLAN/STATUS RPCs
-- ============================================================================
drop function if exists public.super_admin_list_stores_overview();
create or replace function public.super_admin_list_stores_overview()
returns table(
  store_id uuid,
  slug text,
  name_ar text,
  name_en text,
  custom_domain text,
  plan text,
  status text,
  max_products integer,
  owner_user_id uuid,
  owner_email text,
  pending_owner_email text,
  mobile_app_access text,
  mobile_app_unlocked boolean,
  subscription_expires_at timestamptz,
  created_at timestamptz,
  products_count bigint,
  active_products_count bigint,
  orders_count bigint,
  gmv numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_platform_super_admin() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    st.id as store_id,
    st.slug::text,
    coalesce(nullif(ss.store_name, ''), st.name_ar)::text as name_ar,
    coalesce(nullif(st.name_en, ''), st.name_ar)::text as name_en,
    st.custom_domain::text,
    st.plan::text,
    st.status::text,
    st.max_products::integer,
    st.owner_user_id,
    coalesce(u.email::text, '') as owner_email,
    st.pending_owner_email::text,
    st.mobile_app_access::text,
    public.store_has_mobile_app_access(st.id) as mobile_app_unlocked,
    st.subscription_expires_at,
    st.created_at,
    coalesce(prod.total_products, 0)::bigint as products_count,
    coalesce(prod.active_products, 0)::bigint as active_products_count,
    coalesce(ord.total_orders, 0)::bigint as orders_count,
    coalesce(ord.total_gmv, 0)::numeric as gmv,
    coalesce(ss.currency, 'EGP')::text as currency
  from public.stores st
  left join public.store_settings ss on ss.store_id = st.id
  left join auth.users u on u.id = st.owner_user_id
  left join lateral (
    select
      count(*) as total_products,
      count(*) filter (where p.is_active) as active_products
    from public.products p
    where p.store_id = st.id
  ) prod on true
  left join lateral (
    select
      count(*) as total_orders,
      coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as total_gmv
    from public.orders o
    where o.store_id = st.id
  ) ord on true
  order by
    case when st.id = '00000000-0000-0000-0000-000000000001'::uuid then 0 else 1 end,
    st.created_at desc;
end $$;

revoke all on function public.super_admin_list_stores_overview() from public, anon;
grant execute on function public.super_admin_list_stores_overview() to authenticated, service_role;

drop function if exists public.super_admin_update_store_plan_and_status(uuid, text, text, integer, timestamptz, boolean);
drop function if exists public.super_admin_update_store_plan_and_status(uuid, text, text, integer, timestamptz, boolean, text);
create or replace function public.super_admin_update_store_plan_and_status(
  p_store_id uuid,
  p_plan text default null,
  p_status text default null,
  p_max_products integer default null,
  p_subscription_expires_at timestamptz default null,
  p_clear_expiry boolean default false,
  p_mobile_app_access text default null
)
returns table(
  store_id uuid,
  slug text,
  plan text,
  status text,
  max_products integer,
  subscription_expires_at timestamptz,
  mobile_app_access text,
  mobile_app_unlocked boolean
)
language plpgsql
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_plan text := nullif(lower(trim(coalesce(p_plan, ''))), '');
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_mobile_access text := nullif(lower(trim(coalesce(p_mobile_app_access, ''))), '');
  v_default_max integer;
begin
  if not public.is_platform_super_admin() then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null then
    raise exception 'unknown_store';
  end if;

  if v_plan is not null and v_plan not in ('starter', 'growth', 'enterprise') then
    raise exception 'invalid_plan';
  end if;

  if v_status is not null and v_status not in ('active', 'trial', 'suspended') then
    raise exception 'invalid_status';
  end if;

  if v_mobile_access is not null and v_mobile_access not in ('plan', 'enabled', 'disabled') then
    raise exception 'invalid_mobile_app_access';
  end if;

  if p_max_products is not null and p_max_products < 0 then
    raise exception 'invalid_max_products';
  end if;

  v_default_max := case v_plan
    when 'starter' then 50
    when 'growth' then 500
    when 'enterprise' then 10000
    else null
  end;

  update public.stores st
  set
    plan = coalesce(v_plan, st.plan),
    status = coalesce(v_status, st.status),
    max_products = coalesce(p_max_products, v_default_max, st.max_products),
    mobile_app_access = coalesce(v_mobile_access, st.mobile_app_access),
    subscription_expires_at = case
      when coalesce(p_clear_expiry, false) then null
      when p_subscription_expires_at is not null then p_subscription_expires_at
      else st.subscription_expires_at
    end,
    updated_at = now()
  where st.id = p_store_id;

  if not found then
    raise exception 'unknown_store';
  end if;

  return query
  select
    st.id as store_id,
    st.slug::text,
    st.plan::text,
    st.status::text,
    st.max_products::integer,
    st.subscription_expires_at,
    st.mobile_app_access::text,
    public.store_has_mobile_app_access(st.id) as mobile_app_unlocked
  from public.stores st
  where st.id = p_store_id;
end $$;

revoke all on function public.super_admin_update_store_plan_and_status(uuid, text, text, integer, timestamptz, boolean, text) from public, anon;
grant execute on function public.super_admin_update_store_plan_and_status(uuid, text, text, integer, timestamptz, boolean, text) to authenticated, service_role;

-- ============================================================================
-- 5. WHITE-LABEL APK BUILD HISTORY (`public.store_app_builds`) + STRICT RLS
-- ============================================================================
create table if not exists public.store_app_builds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  requested_by uuid not null,
  app_name text not null,
  package_id text not null,
  app_id_suffix text not null,
  icon_url text null,
  version_code integer not null default 1 check (version_code >= 1),
  version_name text not null default '1.0.0',
  status text not null default 'queued' check (status in ('queued', 'building', 'succeeded', 'failed')),
  github_run_url text null,
  apk_download_url text null,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_store_app_builds_store_created
  on public.store_app_builds (store_id, created_at desc);

alter table public.store_app_builds enable row level security;
revoke all on public.store_app_builds from public, anon, authenticated;
grant select on public.store_app_builds to authenticated;
grant select, insert, update, delete on public.store_app_builds to service_role;

drop policy if exists store_admin_read_app_builds on public.store_app_builds;
create policy store_admin_read_app_builds
  on public.store_app_builds
  for select
  to authenticated
  using (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  );

commit;

NOTIFY pgrst, 'reload schema';
