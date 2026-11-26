begin;
do $$
declare
  shopper uuid := gen_random_uuid();
  second_shopper uuid := gen_random_uuid();
  s uuid := '00000000-0000-0000-0000-000000000001';
  other_store uuid := 'b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c';
  home uuid := gen_random_uuid(); work uuid := gen_random_uuid();
  payload jsonb := '{"label":"home","recipient_name":"QA Shopper","phone":"01000000001","governorate":"cairo","city":"Cairo","street":"Test street","lat":30.04,"lng":31.23}';
  product public.products; line jsonb; receipt uuid; request_id uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) select uid,uid::text || '@example.invalid' from unnest(array[shopper,second_shopper]) uid;
  insert into public.governorate_shipping_rates values (s,'cairo',37) on conflict(store_id,governorate) do update set fee=37;
  select * into strict product from public.products p where store_id=s and is_active and stock>0 order by price limit 1;
  line := jsonb_build_array(jsonb_build_object('id',product.id,'quantity',1,'size',product.sizes[1],'color',product.colors[1]));
  perform set_config('request.jwt.claim.sub',shopper::text,true);
  set local role authenticated;
  perform public.change_address(s,'add',home,payload);
  perform public.change_address(s,'add',work,payload || '{"label":"work"}');
  perform public.change_address(s,'default',work);
  if (select count(*) from public.my_addresses(s))<>2 or not exists(select from public.my_addresses(s) where id=work and is_default) then raise exception 'default switch failed'; end if;
  perform public.change_address(s,'edit',home,payload || '{"floor":"3"}');
  perform public.change_address(other_store,'add',gen_random_uuid(),payload);
  if exists(select from public.my_addresses(other_store) where id=home) then raise exception 'tenant isolation'; end if;
  begin
    perform public.change_address(other_store,'delete',home);
    raise exception 'wrong store delete accepted';
  exception when raise_exception then if sqlerrm<>'address_not_found' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',second_shopper::text,true);
  if exists(select from public.my_addresses(s)) then raise exception 'shopper isolation'; end if;
  perform public.change_address(s,'add',gen_random_uuid(),payload);
  if (select count(*) from public.my_addresses(s))<>1 or exists(select from public.customer_addresses where id in(home,work)) then raise exception 'RLS owner scope'; end if;
  update public.customer_addresses set street='Wrong shopper' where id=home;
  if found then raise exception 'RLS update scope'; end if;
  begin
    perform public.change_address(s,'edit',home,payload);
    raise exception 'wrong shopper edit accepted';
  exception when raise_exception then if sqlerrm<>'address_not_found' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',shopper::text,true);
  select order_number into receipt from public.checkout_delivery(s,request_id,'Cairo - Test street','01000000001','cod',line,payload,null,'QA Recipient');
  if (select order_number from public.checkout_delivery(s,request_id,'Cairo - Test street','01000000001','cod',line,payload,null,'QA Recipient'))<>receipt then raise exception 'checkout replay'; end if;
  perform public.change_address(s,'delete',work);
  if not exists(select from public.my_addresses(s) where id=home and is_default and floor='3') then raise exception 'default promotion'; end if;
  reset role;
  if not exists(select from public.orders where id=receipt and customer_id is not null and user_id=shopper and store_id=s and lat=30.04 and lng=31.23 and recipient_name='QA Recipient' and shipping_fee=37) then raise exception 'order snapshot or fee'; end if;
  update public.orders set delivery_token=gen_random_uuid()::text where id=receipt;
  if not exists(select 1 from public.get_delivery_pin((select delivery_token from public.orders where id=receipt)) where lat=30.04 and lng=31.23) then raise exception 'courier pin'; end if;
  update public.orders set delivery_token_expires_at=now()-interval '1 second' where id=receipt;
  if exists(select from public.get_delivery_pin((select delivery_token from public.orders where id=receipt))) then raise exception 'expired courier pin'; end if;
  if has_column_privilege('anon','public.products','cost_price','select') or has_column_privilege('authenticated','public.products','cost_price','select') then raise exception 'catalog grants'; end if;
end $$;
rollback;
select 'address isolation, CRUD, checkout pin, rate, replay and catalog grants passed' as verified;
