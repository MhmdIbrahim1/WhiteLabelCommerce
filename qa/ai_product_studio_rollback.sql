begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '8s';

do $contract$
declare
  tenant uuid := gen_random_uuid();
  merchant uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  platform_admin uuid := gen_random_uuid();
  ym text := to_char(now() at time zone 'UTC','YYYY-MM');
  billing jsonb;
  plan jsonb;
  allowance jsonb;
  reservation jsonb;
  first_id uuid;
  second_id uuid;
  studio_id uuid;
  detail text;
  role_name text;
  i integer;
begin
  -- Test denial both on the ledger and on its deliberately inaccessible REST route.
  foreach role_name in array array['anon','authenticated'] loop
    assert not has_table_privilege(role_name,'private.ai_usage_reservations','SELECT,INSERT,UPDATE,DELETE');
    assert not has_table_privilege(role_name,'public.ai_usage_reservations','SELECT,INSERT,UPDATE,DELETE');
    execute format('set local role %I',role_name);
    begin perform id from private.ai_usage_reservations; assert false, 'private ledger readable';
      exception when insufficient_privilege then null; end;
    begin perform id from public.ai_usage_reservations; assert false, 'ledger REST route readable';
      exception when insufficient_privilege then null; end;
    begin perform public.reserve_ai_quota(tenant,merchant,'ai_autofills'); assert false, 'client can reserve';
      exception when insufficient_privilege then null; end;
    begin perform public.settle_ai_quota(gen_random_uuid(),'refunded'); assert false, 'client can settle';
      exception when insufficient_privilege then null; end;
    assert not has_function_privilege(current_user,'public.reserve_ai_quota(uuid,uuid,text)','EXECUTE');
    assert not has_function_privilege(current_user,'public.settle_ai_quota(uuid,text)','EXECUTE');
    reset role;
  end loop;

  insert into auth.users(id,email)
    select id,id::text||'@example.invalid' from unnest(array[merchant,buyer,platform_admin]) id;
  insert into public.stores(id,slug,name_ar,owner_user_id)
    values(tenant,'ai-qa-'||left(tenant::text,8),'QA',merchant);
  insert into public.store_members(store_id,user_id,role) values(tenant,merchant,'owner');
  insert into public.platform_admins(user_id) values(platform_admin);

  perform set_config('request.jwt.claim.sub',platform_admin::text,true);
  set local role authenticated;
  select to_jsonb(p) into strict plan from public.saas_plans p where p.code='starter';
  assert plan ?& array['max_monthly_ai_autofills','max_monthly_ai_studio_images'];
  perform public.billing_save_plan(plan||'{"max_monthly_ai_autofills":2,"max_monthly_ai_studio_images":1}'::jsonb,
    (plan->>'revision')::integer);
  -- Clients predating this release can still save other plan settings.
  perform public.billing_save_plan(plan-'max_monthly_ai_autofills'-'max_monthly_ai_studio_images',
    (plan->>'revision')::integer+1);
  assert (select max_monthly_ai_autofills=2 and max_monthly_ai_studio_images=1 from public.saas_plans where code='starter');
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  billing := public.get_store_billing(tenant);
  assert (billing->'entitlements') @> '{"max_monthly_ai_autofills":2,"max_monthly_ai_studio_images":1}';
  assert (billing->'plan') @> '{"max_monthly_ai_autofills":2,"max_monthly_ai_studio_images":1}';
  assert billing @> '{"ai_autofills":0,"ai_studio_images":0}' and not (billing ? 'admin_notes');
  allowance := public.get_resource_allowance(tenant,'ai_autofills');
  assert allowance @> '{"used":0,"cap":2}' and allowance->>'period_ym'=ym;
  begin perform public.get_resource_allowance(tenant,null); assert false, 'NULL allowance resource accepted';
    exception when insufficient_privilege then null; end;
  begin perform public.get_resource_allowance(tenant,'unknown'); assert false, 'unknown allowance resource accepted';
    exception when insufficient_privilege then null; end;
  assert public.get_resource_allowance(tenant,'ai_studio_images') @> '{"used":0,"cap":1}';
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  begin perform public.get_resource_allowance(tenant,'ai_autofills'); assert false, 'buyer read product allowance';
    exception when insufficient_privilege then null; end;
  reset role;

  assert public.valid_quota_overrides('{"max_monthly_ai_autofills":null,"max_monthly_ai_studio_images":0}');
  assert not public.valid_quota_overrides('{"max_monthly_ai_autofills":-1}');
  assert not public.valid_quota_overrides('{"max_monthly_ai_studio_images":1.2}');
  set local role service_role;
  begin perform public.reserve_ai_quota(tenant,buyer,'ai_autofills'); assert false, 'buyer reservation accepted';
    exception when insufficient_privilege then null; end;
  begin perform public.reserve_ai_quota(tenant,merchant,'orders'); assert false, 'invalid resource accepted';
    exception when invalid_parameter_value then null; end;
  reservation := public.reserve_ai_quota(tenant,merchant,'ai_autofills');
  first_id := (reservation->>'reservation_id')::uuid;
  assert first_id is not null and reservation @> '{"used":1,"cap":2,"resource":"ai_autofills"}' and reservation->>'period_ym'=ym;
  reservation := public.reserve_ai_quota(tenant,merchant,'ai_autofills');
  second_id := (reservation->>'reservation_id')::uuid;
  assert reservation @> '{"used":2,"cap":2}';
  begin perform public.reserve_ai_quota(tenant,merchant,'ai_autofills'); assert false, 'autofill cap+1 admitted';
  exception when sqlstate 'PT409' then
    get stacked diagnostics detail=pg_exception_detail;
    assert sqlerrm='plan_limit_reached' and detail::jsonb =
      '{"code":"plan_limit_reached","resource":"ai_autofills","current":2,"limit":2}'::jsonb;
  end;
  begin perform public.settle_ai_quota(first_id,null); assert false, 'NULL outcome accepted';
    exception when invalid_parameter_value then null; end;
  assert public.settle_ai_quota(first_id,'refunded')->>'status'='refunded';
  assert public.settle_ai_quota(first_id,'refunded')->>'status'='refunded';
  assert public.settle_ai_quota(first_id,'completed')->>'status'='refunded';
  assert public.settle_ai_quota(second_id,'completed')->>'status'='completed';
  assert public.settle_ai_quota(second_id,'refunded')->>'status'='completed';
  reset role;
  assert (select ai_autofills_count=1 and ai_studio_images_count=0 from public.store_monthly_usage
    where store_id=tenant and period_ym=ym);
  assert (select count(*)=2 and count(settled_at)=2 from private.ai_usage_reservations where store_id=tenant);
  set local role service_role;
  reservation := public.reserve_ai_quota(tenant,merchant,'ai_autofills');
  assert reservation @> '{"used":2,"cap":2}';
  perform public.settle_ai_quota((reservation->>'reservation_id')::uuid,'completed');
  reservation := public.reserve_ai_quota(tenant,merchant,'ai_studio_images');
  studio_id := (reservation->>'reservation_id')::uuid;
  assert reservation @> '{"used":1,"cap":1}';
  begin perform public.reserve_ai_quota(tenant,merchant,'ai_studio_images'); assert false, 'studio cap+1 admitted';
    exception when sqlstate 'PT409' then assert sqlerrm='plan_limit_reached'; end;
  reset role;
  -- Simulate a provider response crossing the UTC month boundary.
  update private.ai_usage_reservations set period_ym='2020-01' where id=studio_id;
  update public.store_monthly_usage set ai_studio_images_count=0 where store_id=tenant and period_ym=ym;
  insert into public.store_monthly_usage(store_id,period_ym,ai_studio_images_count) values(tenant,'2020-01',1);
  set local role service_role;
  perform public.settle_ai_quota(studio_id,'refunded');
  reset role;
  assert (select ai_studio_images_count=0 from public.store_monthly_usage where store_id=tenant and period_ym='2020-01');
  assert (select ai_autofills_count=2 and ai_studio_images_count=0 from public.store_monthly_usage where store_id=tenant and period_ym=ym);

  update public.store_subscriptions set quota_overrides='{"max_monthly_ai_studio_images":null}' where store_id=tenant;
  update private.ai_usage_reservations set created_at=now()-interval '2 minutes' where store_id=tenant;
  set local role service_role;
  for i in 1..10 loop
    reservation := public.reserve_ai_quota(tenant,merchant,'ai_studio_images');
    assert reservation->'cap'='null'::jsonb and (reservation->>'used')::integer=i;
  end loop;
  begin perform public.reserve_ai_quota(tenant,merchant,'ai_autofills'); assert false, 'store-wide burst limit exceeded';
    exception when sqlstate 'PT429' then assert sqlerrm='ai_rate_limited'; end;
  perform public.settle_ai_quota((reservation->>'reservation_id')::uuid,'refunded');
  reservation := public.reserve_ai_quota(tenant,merchant,'ai_studio_images');
  assert (reservation->>'used')::integer=10;
  reset role;
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  set local role authenticated;
  billing := public.get_store_billing(tenant);
  assert billing @> '{"ai_autofills":2,"ai_studio_images":10}';
  assert public.get_resource_allowance(tenant,'ai_studio_images') @> '{"used":10,"cap":null}';
  reset role;
  update public.store_subscriptions set scheduled_plan_code='pro',scheduled_billing_cycle='monthly',
    scheduled_effective_at=now()-interval '1 minute' where store_id=tenant;
  set local role authenticated;
  allowance := public.get_resource_allowance(tenant,'ai_autofills');
  assert (select plan_code='starter' from public.store_subscriptions where store_id=tenant), 'allowance mutated subscription';
  billing := public.get_store_billing(tenant);
  assert billing->'plan'->>'code'='pro' and allowance->'cap'=billing->'entitlements'->'max_monthly_ai_autofills';
  reset role;
end $contract$;
rollback;
