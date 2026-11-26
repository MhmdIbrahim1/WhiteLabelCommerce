-- Read-only unit tests of the exact PostgreSQL functions used by the write triggers.
begin read only;
do $unit$
declare
  plan public.saas_plans;
  base jsonb := '{"max_products":50,"max_monthly_orders":100,"max_monthly_apk_builds":2,"max_staff_members":1,"custom_domains_enabled":true}';
  changed jsonb := '{"max_products":null,"max_monthly_orders":0,"custom_domains_enabled":false}';
  bad jsonb;
  detail text;
  msg text;
  capacity integer;
  used integer;
  period record;
begin
  plan := jsonb_populate_record(null::public.saas_plans,base);
  if public.resolve_saas_entitlements(plan,'{}') is distinct from base or
    public.resolve_saas_entitlements(plan,changed) is distinct from (base || changed) then raise exception 'override precedence'; end if;
  plan.max_products := 63;
  if public.resolve_saas_entitlements(plan,'{}')->>'max_products' <> '63' or
    public.resolve_saas_entitlements(plan,changed)->'max_products' is distinct from 'null'::jsonb then raise exception 'edited plan'; end if;
  if not public.valid_quota_overrides(changed) or not public.valid_quota_overrides('{"max_products":2147483647,"max_monthly_apk_builds":2.0}') then
    raise exception 'valid overrides rejected'; end if;
  foreach bad in array array['[]','null','true','{"extra":0}','{"max_products":-1}','{"max_products":2.5}',
    '{"max_monthly_orders":"2"}','{"max_monthly_apk_builds":2147483648}','{"custom_domains_enabled":null}',
    '{"custom_domains_enabled":0}','{"max_products":false}']::jsonb[] loop
    if public.valid_quota_overrides(bad) then raise exception 'invalid override accepted: %',bad; end if;
  end loop;
  perform public.require_quota_room('orders',99,100);
  perform public.require_quota_room('products',2147483647,null);
  foreach capacity in array array[0,1,100] loop
    foreach used in array array[capacity,capacity+1] loop
      begin
        perform public.require_quota_room('orders',used,capacity);
        raise exception 'quota admission at or above limit';
      exception when sqlstate 'PT409' then
        get stacked diagnostics detail=pg_exception_detail,msg=message_text;
        if msg<>'plan_limit_reached' or detail::jsonb is distinct from jsonb_build_object(
          'code',msg,'resource','orders','current',used,'limit',capacity) then raise exception 'invalid quota error detail'; end if;
      end;
    end loop;
  end loop;
  begin
    perform public.billing_quota_error('feature_not_in_plan','custom_domains',1,0);
    raise exception 'domain rejection missing';
  exception when sqlstate 'PT403' then
    get stacked diagnostics detail=pg_exception_detail,msg=message_text;
    if msg<>'feature_not_in_plan' or detail::jsonb <> '{"code":"feature_not_in_plan","resource":"custom_domains","current":1,"limit":0}'::jsonb
      then raise exception 'invalid feature error'; end if;
  end;
  select * into period from public.billing_period('2026-01-31 09:00Z','2026-02-28 09:00Z','monthly','2026-03-01 10:00Z');
  if period.period_start <> '2026-02-28 09:00Z'::timestamptz or period.period_end <> '2026-03-31 09:00Z'::timestamptz then
    raise exception 'month end drift'; end if;
  select * into period from public.billing_period('2024-02-29 09:00Z','2025-02-28 09:00Z','annual','2028-02-29 09:00Z');
  if period.period_start <> '2028-02-29 09:00Z'::timestamptz or period.period_end <> '2029-02-28 09:00Z'::timestamptz then
    raise exception 'annual boundary'; end if;
end $unit$;

-- Exercise the two read contracts with the installed tenant fixture, without exposing any
-- account identifiers or notes. The platform-admin and merchant guards use the real auth helpers.
do $read_contract$
declare
  platform_user uuid;
  fixture uuid;
  billing jsonb;
  subscription public.store_subscriptions;
  actual_products integer;
begin
  select user_id into platform_user from public.platform_admins order by user_id limit 1;
  select store_id into fixture from public.store_subscriptions order by store_id limit 1;
  if fixture is null or platform_user is null then return; end if;
  select count(*) into actual_products from public.products where store_id=fixture and is_active;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  set local role authenticated;
  billing := public.get_store_billing(fixture);
  subscription := public.billing_admin_subscription(fixture);
  if subscription.store_id is distinct from fixture or (billing->>'products')::integer is distinct from actual_products
    or billing->'plan'->>'code' is distinct from subscription.plan_code or billing ? 'admin_notes'
    or not (billing->'entitlements' ?& array['max_products','max_monthly_orders','max_monthly_apk_builds','max_staff_members','custom_domains_enabled'])
    then raise exception 'billing read contract'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.get_store_billing(fixture);
    raise exception 'unrelated account read a subscription';
  exception when insufficient_privilege then null; end;
  begin
    perform public.billing_admin_subscription(fixture);
    raise exception 'unrelated account read internal notes';
  exception when insufficient_privilege then null; end;
  reset role;
end $read_contract$;
rollback;
