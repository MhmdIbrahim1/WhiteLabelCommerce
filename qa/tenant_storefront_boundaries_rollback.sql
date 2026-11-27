-- Run as the project SQL administrator after the migration. No fixture survives ROLLBACK.
begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '5s';

do $test$
declare
  nova constant uuid := '00000000-0000-0000-0000-000000000001';
  omar constant uuid := 'b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c';
  tenant uuid := gen_random_uuid();
  buyer uuid := gen_random_uuid();
  staff uuid := gen_random_uuid();
  buyer_order uuid := gen_random_uuid();
  guest_order uuid := gen_random_uuid();
  guest_phone constant text := '01000000027';
  common_category uuid := gen_random_uuid();
  rare_category uuid := gen_random_uuid();
  first_deal uuid := gen_random_uuid();
  second_deal uuid := gen_random_uuid();
  actor text;
  field record;
  link text;
  metrics jsonb;
begin
  assert (select id from public.stores where slug = 'nova-store') is not distinct from nova, 'Nova mapping';
  assert (select id from public.stores where slug = 'omar-a7a') is not distinct from omar, 'Omar mapping';
  assert to_regprocedure('public.track_guest_order(uuid,text)') is null, 'unscoped guest lookup remains';

  insert into auth.users(id, email) select u, u::text || '@example.invalid' from unnest(array[buyer, staff]) u;
  insert into public.stores(id, slug, name_ar, max_products) values (tenant, 'boundary-qa-' || left(tenant::text, 8), 'QA', 80);
  update public.store_subscriptions set quota_overrides = '{"max_staff_members":1,"max_products":80}' where store_id = tenant;
  insert into public.store_members(store_id, user_id, role, permissions)
    values (tenant, staff, 'manager', private.team_preset('manager'));
  insert into public.orders(id, store_id, user_id, guest_tracking, phone, status, shipping_address, currency, subtotal, shipping_fee)
    values (buyer_order, tenant, buyer, false, guest_phone, 'delivered', 'QA', 'EGP', 14, 0),
           (guest_order, tenant, null, true, guest_phone, 'shipped', 'QA', 'EGP', 14, 0);
  insert into public.order_items(order_id, product_name, quantity, unit_price, unit_cost)
    values (buyer_order, 'QA line', 2, 7, 2);

  -- Rank 53 is the only member of its category. Ranks 2–4 are respectively
  -- sold out, scheduled for tomorrow and expired at the exclusive end boundary.
  insert into public.categories(id, store_id, slug, name) values
    (common_category, tenant, 'common', 'Common'), (rare_category, tenant, 'rare', 'Rare');
  insert into public.products(id, store_id, category_id, slug, name, is_active, stock, price, created_at,
    flash_sale_price, flash_sale_starts_at, flash_sale_ends_at)
  select case n when 53 then first_deal when 60 then second_deal else gen_random_uuid() end,
    tenant, case when n = 53 then rare_category else common_category end, 'item-' || n, 'Item ' || n,
    true, case when n = 2 then 0 else 3 end, 10, now() - n * interval '1 minute',
    case when n in (2, 3, 4, 53, 60) then 5 end,
    case n when 3 then now() + interval '1 day' when 53 then statement_timestamp() end,
    case n when 2 then now() + interval '1 hour' when 3 then now() + interval '2 days'
      when 4 then statement_timestamp() when 53 then now() + interval '1 hour' when 60 then now() + interval '4 hours' end
  from generate_series(1, 63) n;
  assert (select position from (select id, row_number() over(order by created_at desc, id) as position
    from public.products where store_id = tenant and is_active) ranked where id = first_deal) = 53;

  foreach actor in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claim.role', actor, true);
    perform set_config('request.jwt.claim.sub', case when actor = 'anon' then '' else buyer::text end, true);
    execute format('set local role %I', actor);
    assert not has_table_privilege(current_user, 'public.orders', 'SELECT');
    assert not has_table_privilege(current_user, 'public.order_items', 'SELECT');
    for field in select * from (values
      ('orders', 'delivery_token'), ('order_items', 'unit_cost'), ('products', 'cost_price'),
      ('store_subscriptions', 'admin_notes'), ('store_invitations', 'token_hash')
    ) fields(relation, col) loop
      assert not has_column_privilege(current_user, 'public.' || field.relation, field.col, 'SELECT');
      -- PostgREST maps SQLSTATE 42501 to 401 for anon and 403 for authenticated.
      begin
        execute format('select %I from public.%I where false', field.col, field.relation);
        raise exception 'Unexpected SELECT grant for % on %.%', actor, field.relation, field.col;
      exception when insufficient_privilege then null;
      end;
    end loop;

    assert (select count(*) from public.track_guest_order(tenant, guest_order, guest_phone)) = 1;
    assert not exists (select from public.track_guest_order(nova, guest_order, guest_phone)), 'foreign tenant';
    assert not exists (select from public.track_guest_order(tenant, guest_order, '01000000028')), 'wrong phone';
    assert not exists (select from public.track_guest_order(tenant, buyer_order, guest_phone)), 'registered order';
    assert (select array_agg(id order by flash_sale_ends_at, id) from (
      select id, flash_sale_ends_at from public.storefront_flash_deals where store_id = tenant
      order by flash_sale_ends_at, id limit 8
    ) deals) = array[first_deal, second_deal], 'flash eligibility and expiry order';
    assert (select id from public.products where store_id = tenant and is_active and category_id = rare_category
      order by created_at desc, id limit 1) = first_deal, 'category filter before limit';
    begin
      perform public.merchant_order_delivery_token(tenant, guest_order, true);
      raise exception 'Non-staff token issuance succeeded';
    exception when insufficient_privilege then null;
    end;
    if actor = 'anon' then
      assert not has_any_column_privilege(current_user, 'public.orders', 'SELECT');
      assert not has_any_column_privilege(current_user, 'public.order_items', 'SELECT');
    else
      assert exists (select from public.orders o join public.order_items i on i.order_id = o.id
        where o.id = buyer_order and o.store_id = tenant and o.user_id = buyer and i.unit_price = 7);
      assert exists (select from public.my_order_cards(tenant) where id = buyer_order and item_count = 2);
      assert not exists (select from public.orders where id = guest_order), 'buyer RLS';
    end if;
    reset role;
  end loop;

  perform set_config('request.jwt.claim.sub', staff::text, true);
  set local role authenticated;
  assert exists (select from public.orders where store_id = tenant and id = guest_order);
  assert public.merchant_order_delivery_token(tenant, guest_order) is null;
  link := public.merchant_order_delivery_token(tenant, guest_order, true);
  assert link ~ '^[0-9a-f]{48}$';
  assert public.merchant_order_delivery_token(tenant, guest_order, true) is not distinct from link;
  assert public.merchant_order_delivery_token(tenant, guest_order) is not distinct from link;
  begin
    perform public.merchant_order_delivery_token(omar, guest_order);
    raise exception 'Staff crossed store boundary';
  exception when insufficient_privilege then null;
  end;
  metrics := public.admin_dashboard_metrics(tenant, now() - interval '1 day', now() + interval '1 day',
    now() - interval '3 days', now() - interval '1 day');
  assert (metrics->>'net_profit')::numeric = 10, 'staff profit from the recorded line cost';
  reset role;

  perform set_config('request.jwt.claim.role', 'anon', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  assert exists (select from public.get_delivery_by_token(link) where order_id = guest_order), 'courier link';
  reset role;
end
$test$;

rollback;
