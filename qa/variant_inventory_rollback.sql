begin;
do $test$
declare
  merchant uuid := gen_random_uuid();
  tenant uuid;
  test_product uuid;
  receipt uuid;
  request_key uuid;
  line jsonb;
  fields jsonb;
  matrix jsonb := '[{"color":"Blue","size":"M","stock":1},{"color":"Red","size":"M","stock":5}]';
begin
  insert into auth.users(id,email,email_confirmed_at) values(merchant,merchant::text||'@example.invalid',now());
  for tenant in select id from public.stores where slug in ('nova-store','omar-a7a') order by slug loop
    insert into public.store_members(store_id,user_id,role) values(tenant,merchant,'admin');
    perform set_config('request.jwt.claim.sub',merchant::text,true);
    fields := jsonb_build_object('name','QA','name_en','QA','slug',gen_random_uuid()::text,'stock',6,'price',10,'cost_price',0,
      'description','','description_en','','specifications','[]'::jsonb,'sizes',array['M'],'colors',array['Blue','Red'],
      'category_id',(select id from public.categories where store_id=tenant limit 1),'is_active',true,'color_images','{}'::jsonb);
    test_product := public.save_catalog_product(tenant,null,fields,matrix,'[]',0,'');
    line := jsonb_build_array(jsonb_build_object('id',test_product,'size','M','color','Blue','quantity',1));
    request_key := gen_random_uuid();
    select order_number into receipt from public.store_checkout(request_key,'QA rollback address','01098765430','cod',line,null,'QA',false,tenant);
    if (select order_number from public.store_checkout(request_key,'QA rollback address','01098765430','cod',line,null,'QA',false,tenant)) <> receipt then
      raise exception 'idempotency failed';
    end if;
    begin
      perform public.store_checkout(gen_random_uuid(),'QA rollback address','01098765430','cod',line,null,'QA',false,tenant);
      raise exception 'oversold';
    exception when raise_exception then
      if sqlerrm<>'stock_unavailable' then raise; end if;
    end;
    if (select stock from public.products where id=test_product)<>5 then raise exception 'parent stock mismatch'; end if;
    if (select v.stock from public.product_variants v where v.product_id=test_product and v.color='Red')<>5 then raise exception 'unrelated stock changed'; end if;
    begin
      perform public.save_catalog_product(tenant,test_product,fields,matrix,matrix,6,'');
      raise exception 'accepted stale merchant stock';
    exception when raise_exception then
      if sqlerrm<>'inventory_changed' then raise; end if;
    end;
    begin
      update public.product_variants v set stock=-1 where v.product_id=test_product and v.color='Blue';
      raise exception 'accepted negative inventory';
    exception when check_violation then null;
    end;
    update public.orders set status='cancelled' where id=receipt;
    if (select stock from public.products where id=test_product)<>6 or
        (select v.stock from public.product_variants v where v.product_id=test_product and v.color='Blue')<>1 then
      raise exception 'cancellation did not restore original SKU';
    end if;
  end loop;
end $test$;
rollback;
select 'variant inventory, idempotency, stale editor, cancellation, two tenants' as verified;
