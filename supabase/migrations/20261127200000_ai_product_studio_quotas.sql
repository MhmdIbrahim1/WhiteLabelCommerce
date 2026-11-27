begin;
set local lock_timeout = '8s';

-- A NULL cap chosen later by a platform administrator must survive a rerun.
do $install$
begin
  if not exists (select from information_schema.columns where table_schema='public'
      and table_name='saas_plans' and column_name='max_monthly_ai_autofills') then
    alter table public.saas_plans add max_monthly_ai_autofills integer check (max_monthly_ai_autofills >= 0);
    update public.saas_plans set max_monthly_ai_autofills =
      case code when 'starter' then 5 when 'pro' then 100 when 'business' then 500 end;
  end if;
  if not exists (select from information_schema.columns where table_schema='public'
      and table_name='saas_plans' and column_name='max_monthly_ai_studio_images') then
    alter table public.saas_plans add max_monthly_ai_studio_images integer check (max_monthly_ai_studio_images >= 0);
    update public.saas_plans set max_monthly_ai_studio_images =
      case code when 'starter' then 2 when 'pro' then 25 when 'business' then 100 end;
  end if;
end $install$;

alter table public.store_monthly_usage
  add column if not exists ai_autofills_count integer not null default 0 check (ai_autofills_count >= 0),
  add column if not exists ai_studio_images_count integer not null default 0 check (ai_studio_images_count >= 0);

create or replace function public.valid_quota_overrides(v jsonb) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(v)='object' then not exists (
    select from jsonb_each(v) where not (case
      when key='custom_domains_enabled' then jsonb_typeof(value)='boolean'
      when key in ('max_products','max_monthly_orders','max_monthly_apk_builds','max_staff_members',
                   'max_monthly_ai_autofills','max_monthly_ai_studio_images') then
        case jsonb_typeof(value) when 'null' then true when 'number' then
          value::numeric between 0 and 2147483647 and trunc(value::numeric)=value::numeric
        else false end
      else false end)
  ) else false end
$$;

create or replace function public.resolve_saas_entitlements(p public.saas_plans, overrides jsonb) returns jsonb
language sql immutable parallel safe set search_path = '' as $$
  select jsonb_build_object('max_products',p.max_products,'max_monthly_orders',p.max_monthly_orders,
    'max_monthly_apk_builds',p.max_monthly_apk_builds,'max_staff_members',p.max_staff_members,
    'max_monthly_ai_autofills',p.max_monthly_ai_autofills,'max_monthly_ai_studio_images',p.max_monthly_ai_studio_images,
    'custom_domains_enabled',p.custom_domains_enabled) || overrides
$$;

create or replace function public.billing_save_plan(p_plan jsonb,p_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.saas_plans;
begin
  if not public.is_platform_super_admin() then raise insufficient_privilege; end if;
  if not coalesce(p_plan ?& array['max_products','max_monthly_orders','max_monthly_apk_builds'],false)
     or not public.valid_quota_overrides(jsonb_build_object('max_staff_members',p_plan->'max_staff_members',
       'max_monthly_ai_autofills',p_plan->'max_monthly_ai_autofills',
       'max_monthly_ai_studio_images',p_plan->'max_monthly_ai_studio_images')) then
    raise exception 'invalid_plan';
  end if;
  p := jsonb_populate_record(null::public.saas_plans,p_plan);
  update public.saas_plans set name_ar=p.name_ar,name_en=p.name_en,description_ar=p.description_ar,
    description_en=p.description_en,monthly_price_egp=p.monthly_price_egp,annual_price_egp=p.annual_price_egp,
    trial_days=p.trial_days,max_products=p.max_products,max_monthly_orders=p.max_monthly_orders,
    max_monthly_apk_builds=p.max_monthly_apk_builds,
    max_staff_members=case when p_plan ? 'max_staff_members' then p.max_staff_members else max_staff_members end,
    max_monthly_ai_autofills=case when p_plan ? 'max_monthly_ai_autofills'
      then p.max_monthly_ai_autofills else max_monthly_ai_autofills end,
    max_monthly_ai_studio_images=case when p_plan ? 'max_monthly_ai_studio_images'
      then p.max_monthly_ai_studio_images else max_monthly_ai_studio_images end,
    custom_domains_enabled=p.custom_domains_enabled,is_active=p.is_active,sort_order=p.sort_order,revision=revision+1
    where code=p.code and revision=p_revision;
  if not found then raise exception 'billing_edit_conflict'; end if;
end $$;

-- A billing read may materialize an elapsed trial or a scheduled plan change.
create or replace function private.billing_apply_due_changes(p_store uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select from public.store_subscriptions s where store_id=p_store and
    (s.scheduled_effective_at<=now() or (s.status='trialing' and s.trial_ends_at<=now() and
       exists(select from private.billing_trial_origins o where o.store_id=p_store)))) then
    perform private.billing_lock_subscription(p_store);
  end if;
end $$;
revoke all on function private.billing_apply_due_changes(uuid) from public,anon,authenticated,service_role;

create or replace function public.get_store_billing(p_store uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ym text := to_char(now() at time zone 'UTC','YYYY-MM');
begin
  perform private.require_store_billing(p_store);
  perform private.billing_apply_due_changes(p_store);
  return (select jsonb_build_object('plan',to_jsonb(p),'billing_cycle',s.billing_cycle,'status',s.status,
    'trial_ends_at',s.trial_ends_at,'trial_used_at',s.trial_used_at,'can_start_trial',s.trial_used_at is null,
    'scheduled_plan_code',s.scheduled_plan_code,'scheduled_billing_cycle',s.scheduled_billing_cycle,
    'scheduled_effective_at',s.scheduled_effective_at,'current_period_start',period.period_start,'current_period_end',period.period_end,
    'entitlements',public.resolve_saas_entitlements(p,s.quota_overrides),'quota_overrides',s.quota_overrides,
    'period_ym',ym,'products',s.active_products_count,'orders',coalesce(u.orders_count,0),'apk_builds',coalesce(u.apk_builds_count,0),
    'ai_autofills',coalesce(u.ai_autofills_count,0),'ai_studio_images',coalesce(u.ai_studio_images_count,0),
    'staff_members',private.staff_usage(p_store,statement_timestamp()),
    'custom_domains',(select count(*) from public.store_domains where store_id=p_store))
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code
    cross join lateral public.billing_period(s.current_period_start,s.current_period_end,s.billing_cycle,
      case when s.status='active' then now() else s.current_period_start end) period
    left join public.store_monthly_usage u on u.store_id=s.store_id and u.period_ym=ym where s.store_id=p_store);
end $$;

create or replace function public.get_resource_allowance(p_store uuid,p_resource text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare perm text; quota_key text; ym text := to_char(now() at time zone 'UTC','YYYY-MM');
begin
  select permission,key into perm,quota_key from (values ('products','manage_products','max_products'),
    ('ai_autofills','manage_products','max_monthly_ai_autofills'),
    ('ai_studio_images','manage_products','max_monthly_ai_studio_images'),
    ('apk_builds','manage_mobile_app','max_monthly_apk_builds'),
    ('custom_domains','manage_domains','custom_domains_enabled')) r(resource,permission,key)
    where resource=p_resource;
  if perm is null or not public.has_store_permission(p_store,perm) then raise insufficient_privilege; end if;
  -- Preserve GET/read-only allowance access. Project the plan that the next
  -- entitlement lock will materialize so an expired cap cannot disable the form.
  return (select jsonb_build_object('cap',public.resolve_saas_entitlements(p,s.quota_overrides)->quota_key,'period_ym',ym,
    'plan_name_ar',p.name_ar,'plan_name_en',p.name_en,'used',case p_resource when 'products' then s.active_products_count
      when 'ai_autofills' then coalesce(u.ai_autofills_count,0) when 'ai_studio_images' then coalesce(u.ai_studio_images_count,0)
      when 'apk_builds' then coalesce(u.apk_builds_count,0) else (select count(*) from public.store_domains where store_id=p_store) end)
    from public.store_subscriptions s left join private.billing_trial_origins prior on prior.store_id=s.store_id
    join public.saas_plans p on p.code=case when p_resource not in ('ai_autofills','ai_studio_images') then s.plan_code
      when s.scheduled_effective_at<=now() then s.scheduled_plan_code
      when s.status='trialing' and s.trial_ends_at<=now() then coalesce(prior.plan_code,s.plan_code) else s.plan_code end
    left join public.store_monthly_usage u on u.store_id=s.store_id and u.period_ym=ym where s.store_id=p_store);
end $$;

create table if not exists private.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource text not null check (resource in ('ai_autofills','ai_studio_images')),
  period_ym text not null check (period_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'reserved' check (status in ('reserved','completed','refunded')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((status='reserved') = (settled_at is null))
);
create index if not exists ai_reservations_store_created on private.ai_usage_reservations(store_id,created_at desc);
create index if not exists ai_reservations_store_status_created on private.ai_usage_reservations(store_id,status,created_at);
alter table private.ai_usage_reservations enable row level security;
revoke all on private.ai_usage_reservations from public,anon,authenticated,service_role;

-- Give the ledger a REST permission boundary without granting access to its rows.
-- Invoker rights retain the underlying private ACL even if the view's ACL changes.
create or replace view public.ai_usage_reservations with (security_invoker=true) as
  select id from private.ai_usage_reservations;
revoke all on public.ai_usage_reservations from public,anon,authenticated,service_role;

create or replace function public.reserve_ai_quota(p_store uuid,p_user uuid,p_resource text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caps jsonb;
  quota integer;
  in_use integer;
  ym text := to_char(now() at time zone 'UTC','YYYY-MM');
  reservation_id uuid;
begin
  if not coalesce(private.member_permissions(p_store,p_user) ? 'manage_products',false) then
    raise insufficient_privilege;
  end if;
  if p_resource is null or p_resource not in ('ai_autofills','ai_studio_images') then
    raise exception 'invalid_ai_resource' using errcode='22023';
  end if;
  caps := public.lock_store_entitlements(p_store);
  if (select count(*) from private.ai_usage_reservations where store_id=p_store
      and created_at > clock_timestamp() - interval '60 seconds' and status<>'refunded') >= 10 then
    raise exception 'ai_rate_limited' using errcode='PT429';
  end if;
  quota := (caps->>('max_monthly_' || p_resource))::numeric::integer;
  select case p_resource when 'ai_autofills' then ai_autofills_count else ai_studio_images_count end into in_use
    from public.store_monthly_usage where store_id=p_store and period_ym=ym;
  in_use := coalesce(in_use,0);
  perform public.require_quota_room(p_resource,in_use,quota);
  insert into public.store_monthly_usage as u(store_id,period_ym,ai_autofills_count,ai_studio_images_count)
    values(p_store,ym,(p_resource='ai_autofills')::integer,(p_resource='ai_studio_images')::integer)
    on conflict (store_id,period_ym) do update set ai_autofills_count=u.ai_autofills_count+excluded.ai_autofills_count,
      ai_studio_images_count=u.ai_studio_images_count+excluded.ai_studio_images_count;
  insert into private.ai_usage_reservations(store_id,user_id,resource,period_ym)
    values(p_store,p_user,p_resource,ym) returning id into reservation_id;
  return jsonb_build_object('reservation_id',reservation_id,'resource',p_resource,'used',in_use+1,'cap',quota,'period_ym',ym);
end $$;

create or replace function public.settle_ai_quota(p_reservation_id uuid,p_outcome text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid; receipt private.ai_usage_reservations;
begin
  if p_outcome is null or p_outcome not in ('completed','refunded') then
    raise exception 'invalid_ai_outcome' using errcode='22023';
  end if;
  -- This first lookup takes no row lock. The subscription is the first write lock
  -- in both reservation and settlement, including when the UTC month has changed.
  select store_id into strict tenant from private.ai_usage_reservations where id=p_reservation_id;
  perform from public.store_subscriptions where store_id=tenant for no key update;
  select * into strict receipt from private.ai_usage_reservations where id=p_reservation_id for update;
  if receipt.status='reserved' then
    if p_outcome='refunded' then
      update public.store_monthly_usage set
        ai_autofills_count=greatest(0,ai_autofills_count-(receipt.resource='ai_autofills')::integer),
        ai_studio_images_count=greatest(0,ai_studio_images_count-(receipt.resource='ai_studio_images')::integer)
        where store_id=receipt.store_id and period_ym=receipt.period_ym;
    end if;
    update private.ai_usage_reservations set status=p_outcome,settled_at=clock_timestamp()
      where id=p_reservation_id returning * into strict receipt;
  end if;
  return jsonb_build_object('reservation_id',receipt.id,'status',receipt.status);
end $$;
revoke all on function public.reserve_ai_quota(uuid,uuid,text),public.settle_ai_quota(uuid,text)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_quota(uuid,uuid,text),public.settle_ai_quota(uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
