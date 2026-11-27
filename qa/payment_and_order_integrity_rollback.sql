begin;

do $$ begin
  if (select id from public.stores where slug='nova-store') is distinct from '00000000-0000-0000-0000-000000000001'::uuid
    or (select id from public.stores where slug='omar-a7a') is distinct from 'b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c'::uuid
    then raise exception 'unexpected project mapping'; end if;
end $$;
create function pg_temp.expect(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'payment contract: %',message; end if; end $$;

-- The HTTP status translation is verified through PostgREST during release QA.
do $$
declare r text; c record; f regprocedure;
begin
  foreach r in array array['anon','authenticated'] loop
    for c in select * from (values ('products','cost_price'),('store_subscriptions','admin_notes'),
      ('store_invitations','token_hash'),('orders','delivery_token'),('order_items','unit_cost')) fields(tbl,col) loop
      perform pg_temp.expect(not has_column_privilege(r,'public.'||c.tbl,c.col,'SELECT'),r||'.'||c.tbl||'.'||c.col);
    end loop;
    foreach f in array array['public.reconcile_paymob_transaction(uuid,uuid,text,text,bigint,text,text)'::regprocedure,
      'public.reserve_paymob_attempt(uuid,uuid,text,text)'::regprocedure,'public.bind_paymob_attempt(uuid,uuid,uuid,uuid,text)'::regprocedure,
      'public.advance_paymob_attempt(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.release_expired_unpaid_orders(uuid,integer,uuid)'::regprocedure] loop
      perform pg_temp.expect(not has_function_privilege(r,f,'execute') and has_function_privilege('service_role',f,'execute'),f::text);
    end loop;
  end loop;
end $$;

do $test$
declare
  tenant uuid := '00000000-0000-0000-0000-000000000001';
  buyer uuid := gen_random_uuid(); product uuid := gen_random_uuid(); key uuid;
  coupon text := 'QA'||left(replace(gen_random_uuid()::text,'-',''),22);
  full_coupon text := coupon||'F'; lines jsonb; a jsonb; b jsonb; result jsonb;
  sale record; id uuid; provider text; tx text; reversal text; snapshot integer; alternate uuid; paid_tx text;
begin
  insert into auth.users(id,email,email_confirmed_at) values(buyer,buyer::text||'@example.invalid',now());
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  update public.store_settings set cod_enabled=true,paymob_enabled=true,paymob_card_enabled=true,paymob_wallet_enabled=true,
    shipping_fee=0,cart_incentive_enabled=false,cashback_enabled=false where store_id=tenant;
  insert into public.products(id,store_id,category_id,slug,name,price,stock,is_active,sizes,colors)
    values(product,tenant,(select c.id from public.categories c where c.store_id=tenant limit 1),product::text,'QA payment contract',100,60,true,array['M'],array['Blue','Red']);
  insert into public.product_variants(store_id,product_id,color,size,stock) values(tenant,product,'Blue','M',40),(tenant,product,'Red','M',20);
  insert into public.coupons(store_id,code,discount_type,discount_value) values(tenant,coupon,'fixed',10),(tenant,full_coupon,'percent',100);
  lines := jsonb_build_array(jsonb_build_object('id',product,'size','M','color','Blue','quantity',1));

  foreach reversal in array array['refunded','voided'] loop
    key := gen_random_uuid();
    select * into strict sale from public.checkout_reviewed(tenant,key,'QA address','01098765431','paymob_card',lines,'{}',100);
    id := sale.order_number;
    select * into strict sale from public.checkout_reviewed(tenant,key,'QA address','01098765431','paymob_card',lines,'{}',100);
    perform pg_temp.expect(not sale.created and sale.order_number=id,'stable checkout reservation');
    a := public.reserve_paymob_attempt(tenant,id,'paymob_card','https://nova-store.shopstage.live');
    b := public.reserve_paymob_attempt(tenant,id,'paymob_card',null);
    perform pg_temp.expect(a->>'action'='start' and b->>'action'='busy','only one registration lease');
    provider := abs(hashtextextended(gen_random_uuid()::text,0))::text; tx := provider||'1';
    perform pg_temp.expect(public.bind_paymob_attempt(tenant,id,(a->>'attempt')::uuid,(a->>'lease')::uuid,provider),'both bindings');
    perform pg_temp.expect(public.advance_paymob_attempt(tenant,id,(a->>'attempt')::uuid,(a->>'lease')::uuid,'ready','https://accept.paymob.com/test'),'key ready');
    b := public.reserve_paymob_attempt(tenant,id,'paymob_card',null);
    perform pg_temp.expect(b->>'action'='redirect' and (select count(*) from public.payment_attempts where order_id=sale.order_number)=1,'reuse active provider');
    begin
      update public.orders set status='shipped' where orders.id=sale.order_number;
      raise exception 'accepted unpaid shipping';
    exception when raise_exception then if sqlerrm<>'invalid_fulfillment_transition' then raise; end if; end;
    perform pg_temp.expect(public.allowed_order_transitions('confirmed','paymob_card','unpaid',true)=array['cancelled'],'drawer guard');
    begin
      perform public.reconcile_paymob_transaction(tenant,id,provider,tx,1,sale.order_currency,'paid');
      raise exception 'accepted wrong amount';
    exception when raise_exception then if sqlerrm<>'invalid_payment_event' then raise; end if; end;
    result := public.reconcile_paymob_transaction(tenant,id,provider,tx,10000,sale.order_currency,'paid');
    perform pg_temp.expect(result->>'notification'='paid' and (result->>'transitioned')::boolean,'first capture');
    result := public.reconcile_paymob_transaction(tenant,id,provider,tx,10000,sale.order_currency,'paid');
    perform pg_temp.expect(result->>'notification' is null and not (result->>'transitioned')::boolean,'duplicate capture');
    snapshot := (select stock from public.product_variants where product_id=product and color='Blue');
    update public.orders set status='cancelled' where orders.id=sale.order_number;
    update public.orders set status='cancelled' where orders.id=sale.order_number;
    perform pg_temp.expect((select payment_status='refund_pending' and stock_restored from public.orders where orders.id=sale.order_number)
      and (select stock=snapshot+1 from public.product_variants where product_id=product and color='Blue'),'refund obligation and single SKU restoration');
    result := public.reconcile_paymob_transaction(tenant,id,provider,case when reversal='voided' then provider||'2' else tx end,
      10000,sale.order_currency,reversal);
    perform pg_temp.expect(result->>'payment_status'=reversal and (result->>'transitioned')::boolean,'reversal after capture');
    result := public.reconcile_paymob_transaction(tenant,id,provider,tx,10000,sale.order_currency,'paid');
    perform pg_temp.expect(result->>'payment_status'=reversal and not (result->>'transitioned')::boolean,'reversal is terminal for that transaction');
  end loop;

  select * into strict sale from public.checkout_reviewed(tenant,gen_random_uuid(),'QA address','01098765431','paymob_wallet',lines,'{}',100);
  id := sale.order_number;
  a := public.reserve_paymob_attempt(tenant,id,'paymob_wallet',null);
  provider := abs(hashtextextended(gen_random_uuid()::text,0))::text; tx := provider||'1';
  perform public.bind_paymob_attempt(tenant,id,(a->>'attempt')::uuid,(a->>'lease')::uuid,provider);
  perform public.advance_paymob_attempt(tenant,id,(a->>'attempt')::uuid,(a->>'lease')::uuid,'charging');
  perform pg_temp.expect(public.reserve_paymob_attempt(tenant,id,'paymob_wallet',null)->>'action'='pending','no second wallet debit');
  perform public.switch_order_to_cod(tenant,id,'');
  update public.orders set status='shipped' where orders.id=sale.order_number;
  update public.orders set status='delivered' where orders.id=sale.order_number;
  result := public.reconcile_paymob_transaction(tenant,id,provider,tx,10000,sale.order_currency,'paid');
  perform pg_temp.expect(result->>'payment_status'='paid' and (select payment_review='late_capture_after_cod' and payment_method='paymob_wallet'
    from public.orders where orders.id=sale.order_number),'late capture removes cash due');
  paid_tx:=tx;

  -- A missing attempt is permitted only for a proven historical orders.paymob_order_id mapping.
  select * into strict sale from public.checkout_reviewed(tenant,gen_random_uuid(),'QA address','01098765431','paymob_card',lines,'{}',100);
  id:=sale.order_number; provider:=abs(hashtextextended(gen_random_uuid()::text,0))::text;
  update public.orders set paymob_order_id=provider where orders.id=sale.order_number;
  begin
    perform public.reconcile_paymob_transaction(tenant,id,provider,paid_tx,10000,sale.order_currency,'paid');
    raise exception 'accepted reused transaction';
  exception when raise_exception then if sqlerrm<>'transaction_conflict' then raise; end if; end;
  perform public.reconcile_paymob_transaction(tenant,id,provider,provider||'1',10000,sale.order_currency,'paid');
  perform pg_temp.expect((select count(*)=1 from public.payment_attempts where order_id=sale.order_number),'legacy provider mapping');

  select * into strict sale from public.checkout_reviewed(tenant,gen_random_uuid(),'QA address','01098765431','coupon',lines,'{}',0,full_coupon);
  perform pg_temp.expect(sale.method='coupon' and sale.pay_status='paid' and sale.fulfillment='confirmed' and sale.amount=0
    and (select wallet_discount=0 from public.orders where orders.id=sale.order_number),'coupon-only settlement');

  insert into public.wallet_transactions(store_id,user_id,type,amount,balance_after) values(tenant,buyer,'admin_credit',15,15);
  snapshot := (select stock from public.product_variants where product_id=product and color='Blue');
  select * into strict sale from public.checkout_reviewed(tenant,gen_random_uuid(),'QA address','01098765431','paymob_card',lines,'{}',75,coupon,'QA',true);
  id:=sale.order_number;
  perform pg_temp.expect(sale.expires_at between now()+interval '30 minutes' and now()+interval '60 minutes','bounded reservation');
  update public.orders set reservation_expires_at=now()-interval '1 second' where orders.id=sale.order_number;
  perform pg_temp.expect((select used_count=1 from public.coupons where code=coupon),'expiration fixture started with one coupon use');
  perform pg_temp.expect(public.release_expired_unpaid_orders(tenant,1,id)=1,'due reservation released');
  perform pg_temp.expect(public.release_expired_unpaid_orders(tenant,1,id)=0,'duplicate expiry');
  perform pg_temp.expect((select used_count=0 from public.coupons where code=coupon)
    and (select stock=snapshot from public.product_variants where product_id=product and color='Blue')
    and (select stock=20 from public.product_variants where product_id=product and color='Red')
    and (select count(*)=1 and sum(amount)=15 from public.wallet_transactions where order_id=sale.order_number and type='order_refund'),
    'one coupon, SKU and wallet release');
  select * into strict sale from public.checkout_reviewed(tenant,gen_random_uuid(),'QA address','01098765431','paymob_card',lines,'{}',100);
  alternate:=sale.order_number;
  a:=public.reserve_paymob_attempt(tenant,alternate,'paymob_card',null);
  update public.payment_attempts set settled_at=now(),state='paid' where payment_attempts.id=(a->>'attempt')::uuid;
  update public.orders set reservation_expires_at=now()-interval '1 second' where orders.id=alternate;
  perform pg_temp.expect(public.release_expired_unpaid_orders(tenant,1,alternate)=0,'settled attempt blocks expiry');

  update public.products set flash_sale_price=80,flash_sale_ends_at=now()+interval '1 hour' where products.id=product;
  perform pg_temp.expect((select subtotal=80 and discount_amount=10 from public.quote_checkout_coupon(tenant,coupon,lines)),'live sale quote');
  update public.products set flash_sale_ends_at=now()-interval '1 hour' where products.id=product;
  perform pg_temp.expect((select subtotal=100 from public.quote_checkout_coupon(tenant,coupon,lines)),'expired sale re-quote');
  key:=gen_random_uuid();
  begin
    perform public.checkout_reviewed(tenant,key,'QA address','01098765431','paymob_card',lines,'{}',70,coupon);
    raise exception 'accepted stale total';
  exception when raise_exception then if sqlerrm<>'checkout_quote_changed' then raise; end if; end;
  perform pg_temp.expect(not exists(select from public.orders where checkout_key=key),'price race rolled back checkout');
end $test$;
rollback;
select 'Payment and order integrity contract passed; all fixtures rolled back' as result;
