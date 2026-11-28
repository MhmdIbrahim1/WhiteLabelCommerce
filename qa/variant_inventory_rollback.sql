begin;
do $test$
declare
  merchant uuid := gen_random_uuid();
  tenant uuid;
  test_product uuid;
  receipt uuid;
  other_receipt uuid;
  request_key uuid;
  line jsonb;
  fields jsonb;
  matrix jsonb := '[{"color":"أحمر","size":"M","stock":3},{"color":"بني","size":"M","stock":5},{"color":"أصفر","size":"M","stock":5}]';
begin
  insert into auth.users(id,email,email_confirmed_at) values(merchant,merchant::text||'@example.invalid',now());
  for tenant in select id from public.stores where slug in ('nova-store','omar-a7a') order by slug loop
    insert into public.store_members(store_id,user_id,role,permissions) values(tenant,merchant,'catalog','{"manage_products":true}');
    perform set_config('request.jwt.claim.sub',merchant::text,true);
    fields := jsonb_build_object('name','QA','name_en','QA','slug',gen_random_uuid()::text,'stock',13,'price',10,'cost_price',0,'max_order_qty',5,
      'description','','description_en','','specifications','[]'::jsonb,'sizes',array['M'],'colors',array['أحمر','بني','أصفر'],
      'category_id',(select id from public.categories where store_id=tenant limit 1),'is_active',true,'color_images','{}'::jsonb);
    test_product := public.save_catalog_product(tenant,null,fields,matrix,'[]',0,'');
    line := jsonb_build_array(jsonb_build_object('id',test_product,'size','M','color','أحمر','quantity',3));
    request_key := gen_random_uuid();
    select order_number into strict receipt from public.store_checkout(request_key,'QA rollback address','01098765430','cod',line,null,'QA',false,tenant);
    if (select order_number from public.store_checkout(request_key,'QA rollback address','01098765430','cod',line,null,'QA',false,tenant)) <> receipt then
      raise exception 'idempotency failed';
    end if;
    begin
      perform public.store_checkout(gen_random_uuid(),'QA rollback address','01098765430','cod',line,null,'QA',false,tenant);
      raise exception 'oversold';
    exception when raise_exception then
      if sqlerrm<>'max_order_qty_exceeded' then raise; end if;
    end;
    if (select stock from public.products where id=test_product) is distinct from 10 or
       (select jsonb_object_agg(color,stock) from public.product_variants where product_id=test_product and listed)
         is distinct from '{"أحمر":0,"بني":5,"أصفر":5}'::jsonb then raise exception 'red depletion changed unrelated stock'; end if;
    begin
      perform public.save_catalog_product(tenant,test_product,fields,matrix,matrix,13,'');
      raise exception 'accepted stale merchant stock';
    exception when raise_exception then
      if sqlerrm<>'inventory_changed' then raise; end if;
    end;
    begin
      update public.product_variants v set stock=-1 where v.product_id=test_product and v.color='أحمر';
      raise exception 'accepted negative inventory';
    exception when check_violation then null;
    end;
    line := jsonb_build_array(jsonb_build_object('id',test_product,'size','M','color','بني','quantity',1),
                              jsonb_build_object('id',test_product,'size','M','color','أصفر','quantity',2));
    select order_number into strict other_receipt from public.store_checkout(gen_random_uuid(),'QA rollback address','01098765430','cod',line,null,'QA',false,tenant);
    if (select stock from public.products where id=test_product) is distinct from 7 or
       (select jsonb_object_agg(color,stock) from public.product_variants where product_id=test_product and listed)
         is distinct from '{"أحمر":0,"بني":4,"أصفر":3}'::jsonb then raise exception 'other colors could not be purchased independently'; end if;
    update public.orders set status='cancelled' where id=receipt;
    if (select stock from public.products where id=test_product) is distinct from 10 or
       (select jsonb_object_agg(color,stock) from public.product_variants where product_id=test_product and listed)
         is distinct from '{"أحمر":3,"بني":4,"أصفر":3}'::jsonb then raise exception 'red cancellation changed unrelated stock'; end if;
    update public.orders set status='cancelled' where id=other_receipt;
    if (select stock from public.products where id=test_product) is distinct from 13 or
       (select jsonb_object_agg(color,stock) from public.product_variants where product_id=test_product and listed)
         is distinct from '{"أحمر":3,"بني":5,"أصفر":5}'::jsonb then raise exception 'final stock mismatch'; end if;
  end loop;
end $test$;
rollback;
select 'variant inventory, idempotency, stale editor, cancellation, two tenants' as verified;
