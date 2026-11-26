begin;
do $test$
declare
  shopper uuid := gen_random_uuid();
  another uuid := gen_random_uuid();
  tenant uuid := '00000000-0000-0000-0000-000000000001';
  other_tenant uuid := 'b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c';
  customer uuid;
  moment timestamptz := now();
  first_page uuid[];
  second_page uuid[];
  expected uuid[];
begin
  insert into auth.users(id,email) select id,id::text||'@example.invalid' from unnest(array[shopper,another]) id;
  perform set_config('request.jwt.claim.sub',shopper::text,true);
  perform public.initialize_customer_profile(tenant);
  select id into strict customer from public.store_customers where store_id=tenant and user_id=shopper;
  insert into public.orders(store_id,user_id,customer_id,created_at,status,shipping_address,currency,subtotal,shipping_fee)
  select tenant,shopper,case when i=3 then null else customer end,moment,
    case i when 1 then 'delivered' when 4 then 'cancelled' else 'pending' end,
    'Rollback test','EGP',case when i=3 then null else 10 end,0 from generate_series(1,5) i;

  select array_agg(id order by id desc) into expected from public.orders where store_id=tenant and user_id=shopper;
  set local role authenticated;
  select array_agg(id order by id desc) into first_page from public.my_order_cards(tenant,'all',null,null,2);
  select array_agg(id order by id desc) into second_page from public.my_order_cards(tenant,'all',moment,first_page[2],3);
  if (first_page || second_page) is distinct from expected then raise exception 'incomplete or duplicate cursor page'; end if;
  if (select count(*) from public.my_order_cards(tenant,'active')) <> 3 or
     (select count(*) from public.my_order_cards(tenant,'completed')) <> 1 or
     (select count(*) from public.my_order_cards(tenant,'cancelled')) <> 1 then raise exception 'order filter mismatch'; end if;
  if (public.my_account_counts(tenant)->>'orders')::int <> 5 then raise exception 'account count mismatch'; end if;
  if exists (select from public.my_order_cards(other_tenant)) then raise exception 'tenant mismatch'; end if;

  perform public.mobile_support(tenant,'Owned order','Rollback test',first_page[1]);
  if not exists (select from public.support_tickets where customer_id=shopper and order_id=first_page[1]) then
    raise exception 'missing order support reference';
  end if;
  perform set_config('request.jwt.claim.sub',another::text,true);
  if exists (select from public.my_order_cards(tenant)) then raise exception 'customer mismatch'; end if;
  perform public.mobile_support(tenant,'Separate customer','Rollback test',first_page[1]);
  if exists (select from public.support_tickets where customer_id=another and order_id is not null) then
    raise exception 'unexpected order support reference';
  end if;
end $test$;
rollback;
select 'cursor ties, legacy receipts, filters, counts and tenant/customer isolation passed' as verified;
