-- Apply after order-quantity-limits.sql and store-domains.sql.
begin;
set local timezone = 'UTC';
set local lock_timeout = '8s';

create table if not exists public.saas_plans (
  code text primary key check (code in ('starter','pro','business')),
  name_ar text not null check (length(trim(name_ar)) between 1 and 100),
  name_en text not null check (length(trim(name_en)) between 1 and 100),
  description_ar text not null check (length(trim(description_ar)) between 1 and 1000),
  description_en text not null check (length(trim(description_en)) between 1 and 1000),
  monthly_price_egp integer not null check (monthly_price_egp >= 0),
  annual_price_egp integer not null check (annual_price_egp >= 0),
  trial_days integer not null check (trial_days >= 0),
  max_products integer check (max_products >= 0),
  max_monthly_orders integer check (max_monthly_orders >= 0),
  max_monthly_apk_builds integer check (max_monthly_apk_builds >= 0),
  custom_domains_enabled boolean not null,
  is_active boolean not null default true,
  sort_order integer not null,
  revision integer not null default 1
);
insert into public.saas_plans (code,name_ar,name_en,description_ar,description_en,monthly_price_egp,
  annual_price_egp,trial_days,max_products,max_monthly_orders,max_monthly_apk_builds,custom_domains_enabled,sort_order)
values ('starter','البداية','Starter','لمتجرك الأول وطلباتك الأولى.','For your first catalog and orders.',0,0,0,50,100,2,false,1),
  ('pro','الاحترافية','Pro','لمتجر متنامٍ بعنوانه الخاص.','For a growing store on its own domain.',499,4990,14,500,1000,10,true,2),
  ('business','الأعمال','Business','للكتالوجات الكبيرة والطلبات المتزايدة.','For large catalogs and higher order volumes.',1499,14990,14,null,null,null,true,3)
on conflict (code) do nothing;

create or replace function public.valid_quota_overrides(v jsonb) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(v) = 'object' then not exists (
    select from jsonb_each(v) e where not (case
      when key = 'custom_domains_enabled' then jsonb_typeof(value) = 'boolean'
      when key in ('max_products','max_monthly_orders','max_monthly_apk_builds') then
        case jsonb_typeof(value) when 'null' then true when 'number' then
          value::numeric between 0 and 2147483647 and trunc(value::numeric) = value::numeric
        else false end
      else false end)
  ) else false end
$$;

create table if not exists public.store_subscriptions (
  store_id uuid primary key references public.stores(id) on delete cascade,
  plan_code text not null default 'starter' references public.saas_plans(code),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual')),
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '1 month'),
  quota_overrides jsonb not null default '{}' check (public.valid_quota_overrides(quota_overrides)),
  admin_notes text check (length(admin_notes) <= 4000),
  active_products_count integer not null default 0 check (active_products_count >= 0),
  revision integer not null default 1,
  check (status <> 'trialing' or trial_ends_at is not null),
  check (current_period_end > current_period_start)
);
create table if not exists public.store_monthly_usage (
  store_id uuid not null references public.stores(id) on delete cascade,
  period_ym text not null check (period_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  orders_count integer not null default 0 check (orders_count >= 0),
  apk_builds_count integer not null default 0 check (apk_builds_count >= 0),
  primary key (store_id, period_ym)
);

-- Keep the seed, the usage baseline and installation of the triggers in one snapshot of writers.
lock table public.stores, public.products, public.orders, public.store_app_builds, public.store_domains
  in share row exclusive mode;
insert into public.store_subscriptions (store_id,plan_code,active_products_count)
select s.id, case when s.slug in ('nova-store','omar-a7a') then 'pro' else 'starter' end,
  (select count(*) from public.products p where p.store_id=s.id and p.is_active)
from public.stores s on conflict (store_id) do nothing;

with activity as (
  select store_id, to_char(created_at at time zone 'UTC','YYYY-MM') ym, count(*) orders, 0 builds
  from public.orders group by 1,2
  union all
  select store_id, to_char(created_at at time zone 'UTC','YYYY-MM'), 0, count(*)
  from public.store_app_builds group by 1,2
)
insert into public.store_monthly_usage (store_id,period_ym,orders_count,apk_builds_count)
select store_id,ym,sum(orders),sum(builds) from activity group by store_id,ym
on conflict (store_id,period_ym) do nothing;

create or replace function public.start_store_subscription() returns trigger
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  insert into public.store_subscriptions(store_id) values (new.id);
  return new;
end $$;
drop trigger if exists start_store_subscription on public.stores;
create trigger start_store_subscription after insert on public.stores
  for each row execute function public.start_store_subscription();

alter table public.saas_plans enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.store_monthly_usage enable row level security;
revoke all on public.saas_plans, public.store_subscriptions, public.store_monthly_usage
  from public, anon, authenticated;
grant select on public.saas_plans to anon, authenticated;
-- Internal notes are only returned by the platform-admin reader below.
grant select(store_id,plan_code,billing_cycle,status,trial_ends_at,current_period_start,current_period_end,
  quota_overrides,active_products_count,revision) on public.store_subscriptions to authenticated;
grant select on public.store_monthly_usage to authenticated;
drop policy if exists billing_catalog on public.saas_plans;
create policy billing_catalog on public.saas_plans for select to anon, authenticated using (is_active);
drop policy if exists billing_platform_catalog on public.saas_plans;
create policy billing_platform_catalog on public.saas_plans for select to authenticated
  using ((select public.is_platform_super_admin()));
drop policy if exists billing_store_subscription on public.store_subscriptions;
create policy billing_store_subscription on public.store_subscriptions for select to authenticated
  using (public.is_store_admin(store_id));
drop policy if exists billing_store_usage on public.store_monthly_usage;
create policy billing_store_usage on public.store_monthly_usage for select to authenticated
  using (public.is_store_admin(store_id));

-- JSON object merge preserves explicit JSON null, zero and false.
create or replace function public.resolve_saas_entitlements(p public.saas_plans, overrides jsonb)
returns jsonb language sql immutable parallel safe set search_path = '' as $$
  select jsonb_build_object('max_products',p.max_products,'max_monthly_orders',p.max_monthly_orders,
    'max_monthly_apk_builds',p.max_monthly_apk_builds,'custom_domains_enabled',p.custom_domains_enabled) || overrides
$$;

create or replace function public.lock_store_entitlements(p_store uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  sub public.store_subscriptions;
  plan public.saas_plans;
begin
  select * into strict sub from public.store_subscriptions where store_id=p_store for no key update;
  select * into strict plan from public.saas_plans where code=sub.plan_code for share;
  return public.resolve_saas_entitlements(plan,sub.quota_overrides);
end $$;

create or replace function public.billing_quota_error(p_code text,p_resource text,p_current bigint,p_limit integer)
returns void language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = case when p_code='feature_not_in_plan' then 'PT403' else 'PT409' end,
    message = p_code, detail = jsonb_build_object('code',p_code,'resource',p_resource,'current',p_current,'limit',p_limit)::text;
end $$;
create or replace function public.require_quota_room(p_resource text,p_current integer,p_limit integer)
returns void language plpgsql set search_path = '' as $$
begin
  if p_current >= p_limit then
    perform public.billing_quota_error('plan_limit_reached',p_resource,p_current,p_limit);
  end if;
end $$;

-- AFTER triggers only count materialized rows (including ON CONFLICT), and are rolled back with the caller.
create or replace function public.meter_active_products() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  source_store uuid;
  target_store uuid;
  caps jsonb;
  in_use integer;
begin
  if tg_op <> 'INSERT' and old.is_active then source_store := old.store_id; end if;
  if tg_op <> 'DELETE' and new.is_active then target_store := new.store_id; end if;
  if source_store is not distinct from target_store then return null; end if;
  if source_store is not null and target_store is not null then
    perform 1 from public.store_subscriptions where store_id in (source_store,target_store)
      order by store_id for no key update;
  end if;
  if source_store is not null then
    update public.store_subscriptions set active_products_count=active_products_count-1 where store_id=source_store;
  end if;
  if target_store is not null then
    caps := public.lock_store_entitlements(target_store);
    select active_products_count into strict in_use from public.store_subscriptions where store_id=target_store;
    perform public.require_quota_room('products',in_use,(caps->>'max_products')::numeric::integer);
    update public.store_subscriptions set active_products_count=active_products_count+1 where store_id=target_store;
  end if;
  return null;
end $$;
drop trigger if exists trg_enforce_store_max_products on public.products;
drop trigger if exists billing_active_products on public.products;
create trigger billing_active_products after insert or delete or update of is_active,store_id on public.products
  for each row execute function public.meter_active_products();

create or replace function public.meter_monthly_event(p_store uuid,p_resource text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caps jsonb := public.lock_store_entitlements(p_store);
  ym text := to_char(transaction_timestamp() at time zone 'UTC','YYYY-MM');
  quota integer;
  in_use integer;
begin
  if p_resource='orders' then
    quota := (caps->>'max_monthly_orders')::numeric::integer;
    select orders_count into in_use from public.store_monthly_usage where store_id=p_store and period_ym=ym;
  elsif p_resource='apk_builds' then
    quota := (caps->>'max_monthly_apk_builds')::numeric::integer;
    select apk_builds_count into in_use from public.store_monthly_usage where store_id=p_store and period_ym=ym;
    if exists (select from public.stores where id=p_store and mobile_app_access='disabled') then
      perform public.billing_quota_error('feature_not_in_plan',p_resource,coalesce(in_use,0),0);
    end if;
  else
    raise exception 'unknown_quota_resource';
  end if;
  perform public.require_quota_room(p_resource,coalesce(in_use,0),quota);
  insert into public.store_monthly_usage as u (store_id,period_ym,orders_count,apk_builds_count)
  values (p_store,ym,(p_resource='orders')::integer,(p_resource='apk_builds')::integer)
  on conflict (store_id,period_ym) do update set orders_count=u.orders_count+excluded.orders_count,
    apk_builds_count=u.apk_builds_count+excluded.apk_builds_count;
end $$;

-- The retry branch returns the original receipt earlier in the function. All web and mobile
-- entry points call this RPC. Meter only the final receipt, in the same inventory transaction.
do $checkout$
declare
  installed text := pg_get_functiondef('public.store_checkout(uuid,text,text,text,jsonb,text,text,boolean,uuid)'::regprocedure);
  anchor text := 'return query select o.id, o.total, o.currency from public.orders o where o.id = new_id;';
begin
  if strpos(installed,'public.meter_monthly_event(')=0 then
    if array_length(string_to_array(lower(installed),anchor),1) <> 2 then
      raise exception 'unrecognized checkout receipt; billing migration rolled back';
    end if;
    execute regexp_replace(installed, replace(anchor,'.','[.]'),
      'perform public.meter_monthly_event(v_store_id,''orders''); ' || anchor,'i');
  end if;
end $checkout$;

create or replace function public.meter_apk_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.meter_monthly_event(new.store_id,'apk_builds');
  return null;
end $$;
drop trigger if exists billing_apk_request on public.store_app_builds;
create trigger billing_apk_request after insert on public.store_app_builds
  for each row execute function public.meter_apk_request();

-- Allocate the version and reserve the queue slot under the same store lock as the meter.
create or replace function public.queue_store_apk(p_store uuid,p_requester uuid,p_name text,p_suffix text,
  p_package text,p_icon text,p_workflow text) returns public.store_app_builds
language plpgsql security definer set search_path = '' as $$
declare
  next_version integer;
  queued public.store_app_builds;
begin
  perform 1 from public.store_subscriptions where store_id=p_store for no key update;
  if not found then raise exception 'unknown_store'; end if;
  if exists (select from public.store_app_builds where store_id=p_store and status in ('queued','building')) then
    raise exception 'build_in_progress' using errcode='PT409';
  end if;
  select greatest(100,coalesce(max(version_code),99)+1) into next_version from public.store_app_builds where store_id=p_store;
  insert into public.store_app_builds (store_id,requested_by,app_name,app_id_suffix,package_id,icon_url,
    version_code,version_name,status,github_run_url)
  values (p_store,p_requester,p_name,p_suffix,p_package,p_icon,next_version,'1.0.' || (next_version-99),'queued',p_workflow)
  returning * into queued;
  return queued;
end $$;
revoke all on function public.queue_store_apk(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.queue_store_apk(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.gate_custom_domain() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caps jsonb := public.lock_store_entitlements(new.store_id);
begin
  if not (caps->>'custom_domains_enabled')::boolean then
    perform public.billing_quota_error('feature_not_in_plan','custom_domains',
      (select count(*) from public.store_domains where store_id=new.store_id and id<>new.id),0);
  end if;
  return new;
end $$;
drop trigger if exists billing_custom_domain on public.store_domains;
create trigger billing_custom_domain after insert on public.store_domains
  for each row execute function public.gate_custom_domain();

-- Every catalog plan includes an APK allowance (including zero). Platform operators can still
-- suspend the studio independently. The request trigger enforces the actual monthly allowance.
create or replace function public.store_has_mobile_app_access(p_store_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select from public.stores where id=p_store_id and mobile_app_access <> 'disabled')
$$;

-- Rolling calendar periods keep the original renewal day across short months and leap years.
create or replace function public.billing_period(p_start timestamptz,p_end timestamptz,p_cycle text,p_at timestamptz)
returns table(period_start timestamptz, period_end timestamptz)
language plpgsql stable set search_path = '' set timezone = 'UTC' as $$
declare
  step_months integer := case when p_cycle='annual' then 12 else 1 end;
  months integer;
begin
  if p_at < p_end then return query select p_start,p_end; return; end if;
  months := (extract(year from p_at)-extract(year from p_start))::integer*12
    + extract(month from p_at)::integer-extract(month from p_start)::integer;
  months := months/step_months*step_months;
  if p_start+make_interval(months=>months) > p_at then months := months-step_months; end if;
  return query select p_start+make_interval(months=>months),p_start+make_interval(months=>months+step_months);
end $$;

create or replace function public.get_store_billing(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ym text := to_char(now() at time zone 'UTC','YYYY-MM');
begin
  if not coalesce(public.is_store_admin(p_store),false) then raise insufficient_privilege; end if;
  return (select jsonb_build_object('plan',to_jsonb(p),'billing_cycle',s.billing_cycle,'status',s.status,
    'trial_ends_at',s.trial_ends_at,'current_period_start',period.period_start,'current_period_end',period.period_end,
    'entitlements',public.resolve_saas_entitlements(p,s.quota_overrides),'quota_overrides',s.quota_overrides,
    'period_ym',ym,'products',s.active_products_count,'orders',coalesce(u.orders_count,0),'apk_builds',coalesce(u.apk_builds_count,0))
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code
    cross join lateral public.billing_period(s.current_period_start,s.current_period_end,s.billing_cycle,
      case when s.status='active' then now() else s.current_period_start end) period
    left join public.store_monthly_usage u on u.store_id=s.store_id and u.period_ym=ym where s.store_id=p_store);
end $$;

create or replace function public.billing_admin_subscription(p_store uuid) returns public.store_subscriptions
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.is_platform_super_admin(),false) then raise insufficient_privilege; end if;
  return (select s from public.store_subscriptions s where s.store_id=p_store);
end $$;

create or replace function public.billing_save_plan(p_plan jsonb,p_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.saas_plans;
begin
  if not coalesce(public.is_platform_super_admin(),false) then raise insufficient_privilege; end if;
  if not coalesce(p_plan ?& array['max_products','max_monthly_orders','max_monthly_apk_builds'],false) then
    raise exception 'invalid_plan';
  end if;
  p := jsonb_populate_record(null::public.saas_plans,p_plan);
  update public.saas_plans set name_ar=p.name_ar,name_en=p.name_en,description_ar=p.description_ar,
    description_en=p.description_en,monthly_price_egp=p.monthly_price_egp,annual_price_egp=p.annual_price_egp,
    trial_days=p.trial_days,max_products=p.max_products,max_monthly_orders=p.max_monthly_orders,
    max_monthly_apk_builds=p.max_monthly_apk_builds,custom_domains_enabled=p.custom_domains_enabled,
    is_active=p.is_active,sort_order=p.sort_order,revision=revision+1
    where code=p.code and revision=p_revision;
  if not found then raise exception 'billing_edit_conflict'; end if;
end $$;

create or replace function public.billing_save_subscription(p_store uuid,p_plan text,p_cycle text,p_status text,
  p_trial_end timestamptz,p_overrides jsonb,p_notes text,p_revision integer) returns void
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  sub public.store_subscriptions;
  plan public.saas_plans;
  restart boolean;
  period record;
begin
  if not coalesce(public.is_platform_super_admin(),false) then raise insufficient_privilege; end if;
  select * into strict sub from public.store_subscriptions where store_id=p_store for no key update;
  if sub.revision is distinct from p_revision then raise exception 'billing_edit_conflict'; end if;
  select * into strict plan from public.saas_plans where code=p_plan for share;
  if not plan.is_active and sub.plan_code <> plan.code then raise exception 'billing_plan_inactive'; end if;
  restart := (sub.plan_code,sub.billing_cycle) is distinct from (p_plan,p_cycle)
    or (p_status='active' and sub.status in ('canceled','trialing','past_due'));
  select * into period from public.billing_period(sub.current_period_start,sub.current_period_end,
    sub.billing_cycle,case when sub.status='active' and p_status<>'active' then now() else sub.current_period_start end);
  update public.store_subscriptions set plan_code=p_plan,billing_cycle=p_cycle,status=p_status,
    trial_ends_at=p_trial_end,quota_overrides=p_overrides,admin_notes=nullif(trim(p_notes),''),
    current_period_start=case when restart then now() else period.period_start end,
    current_period_end=case when restart then now()+case when p_cycle='annual' then interval '1 year'
      else interval '1 month' end else period.period_end end, revision=revision+1 where store_id=p_store;
end $$;

-- Keep the legacy stores columns readable by existing callers. The old integer column
-- cannot represent infinity. Billing readers always use the nullable catalog entitlement.
create or replace function public.sync_legacy_billing(p_code text,p_store uuid) returns void
language sql security definer set search_path = '' as $$
  update public.stores st set plan=x.legacy_plan, max_products=x.legacy_max
  from (select s.store_id, case s.plan_code when 'pro' then 'growth' when 'business' then 'enterprise'
      else 'starter' end legacy_plan,
    coalesce((public.resolve_saas_entitlements(p,s.quota_overrides)->>'max_products')::numeric::integer,2147483647) legacy_max
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code
    where (p_code is null or s.plan_code=p_code) and (p_store is null or s.store_id=p_store)) x
  where st.id=x.store_id and (st.plan,st.max_products) is distinct from (x.legacy_plan,x.legacy_max)
$$;
create or replace function public.sync_billing_display() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='saas_plans' then
    perform public.sync_legacy_billing(new.code,null);
  else
    perform public.sync_legacy_billing(null,new.store_id);
  end if;
  return null;
end $$;
drop trigger if exists sync_billing_display on public.store_subscriptions;
create trigger sync_billing_display after insert or update of plan_code,quota_overrides on public.store_subscriptions
  for each row execute function public.sync_billing_display();
drop trigger if exists sync_billing_display on public.saas_plans;
create trigger sync_billing_display after update of max_products on public.saas_plans
  for each row when (old.max_products is distinct from new.max_products) execute function public.sync_billing_display();
select public.sync_legacy_billing(null,null);

-- Preserve the prior super-admin RPC contract during rollout. It uses the same guarded
-- subscription mutation, so old clients cannot create a second, conflicting product cap.
create or replace function public.super_admin_update_store_plan_and_status(p_store_id uuid,p_plan text default null,
  p_status text default null,p_max_products integer default null,p_subscription_expires_at timestamptz default null,
  p_clear_expiry boolean default false,p_mobile_app_access text default null)
returns table(store_id uuid,slug text,plan text,status text,max_products integer,subscription_expires_at timestamptz,
  mobile_app_access text,mobile_app_unlocked boolean)
language plpgsql security definer set search_path = '' as $$
declare
  sub public.store_subscriptions;
  next_plan text;
  overrides jsonb;
begin
  if not coalesce(public.is_platform_super_admin(),false) then raise insufficient_privilege; end if;
  p_plan := nullif(lower(trim(p_plan)),'');
  p_status := nullif(lower(trim(p_status)),'');
  p_mobile_app_access := nullif(lower(trim(p_mobile_app_access)),'');
  if p_plan is not null or p_max_products is not null then
    select s.* into strict sub from public.store_subscriptions s where s.store_id=p_store_id for no key update;
    next_plan := case p_plan when 'growth' then 'pro' when 'enterprise' then 'business' when 'starter' then 'starter'
      else sub.plan_code end;
    if p_plan not in ('starter','growth','enterprise') then raise exception 'invalid_plan'; end if;
    overrides := case when p_plan is not null then sub.quota_overrides-'max_products' else sub.quota_overrides end;
    if p_max_products is not null then overrides := overrides || jsonb_build_object('max_products',p_max_products); end if;
    perform public.billing_save_subscription(p_store_id,next_plan,sub.billing_cycle,sub.status,sub.trial_ends_at,
      overrides,sub.admin_notes,sub.revision);
  end if;
  update public.stores st set status=coalesce(p_status,st.status),
    mobile_app_access=coalesce(p_mobile_app_access,st.mobile_app_access),
    subscription_expires_at=case when p_clear_expiry then null else coalesce(p_subscription_expires_at,st.subscription_expires_at) end,
    updated_at=now() where st.id=p_store_id;
  if not found then raise exception 'unknown_store'; end if;
  return query select st.id,st.slug::text,st.plan::text,st.status::text,st.max_products,st.subscription_expires_at,
    st.mobile_app_access::text,public.store_has_mobile_app_access(st.id) from public.stores st where st.id=p_store_id;
end $$;

revoke all on function public.valid_quota_overrides(jsonb), public.start_store_subscription(),
  public.resolve_saas_entitlements(public.saas_plans,jsonb), public.lock_store_entitlements(uuid),
  public.billing_quota_error(text,text,bigint,integer), public.require_quota_room(text,integer,integer),
  public.meter_active_products(), public.meter_monthly_event(uuid,text), public.meter_apk_request(),
  public.gate_custom_domain(), public.billing_period(timestamptz,timestamptz,text,timestamptz),
  public.get_store_billing(uuid), public.billing_admin_subscription(uuid), public.billing_save_plan(jsonb,integer),
  public.billing_save_subscription(uuid,text,text,text,timestamptz,jsonb,text,integer),
  public.sync_legacy_billing(text,uuid),public.sync_billing_display()
  from public, anon, authenticated;
grant execute on function public.get_store_billing(uuid), public.billing_admin_subscription(uuid),
  public.billing_save_plan(jsonb,integer),public.billing_save_subscription(uuid,text,text,text,timestamptz,jsonb,text,integer)
  to authenticated;
notify pgrst, 'reload schema';
commit;
