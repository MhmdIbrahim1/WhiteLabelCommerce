begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '5s';

do $test$
declare
  tenant uuid := gen_random_uuid();
  merchant uuid := gen_random_uuid();
  category uuid := gen_random_uuid();
  item uuid;
  fields jsonb;
  matrix jsonb := '[{"color":"Black","size":"","stock":3},{"color":"Tan","size":"","stock":4}]';
  galleries jsonb := '{"Black":["https://example.com/black-front","https://example.com/black-side"],"Tan":["https://example.com/tan-front"]}';
  covers jsonb := '{"Black":"https://example.com/black-front","Tan":"https://example.com/tan-front"}';
  bad jsonb;
  stored public.products%rowtype;
begin
  insert into auth.users(id,email) values(merchant,merchant::text || '@example.invalid');
  insert into public.stores(id,slug,name_ar) values (tenant,'gallery-qa-' || left(tenant::text,12),'QA');
  update public.store_subscriptions set quota_overrides = '{"max_staff_members":1,"max_products":5}' where store_id = tenant;
  insert into public.store_members(store_id,user_id,role,permissions) values(tenant,merchant,'catalog','{"manage_products":true}');
  insert into public.categories(id,store_id,slug,name) values(category,tenant,'qa','QA');
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  fields := jsonb_build_object('category_id',category,'slug','gallery-test','name','QA','name_en','QA',
    'description','','description_en','','sizes',array[]::text[],'colors',array['Black','Tan'],'stock',7,
    'price',100,'cost_price',60,'old_price',125,'max_order_qty',3,'specifications','[]'::jsonb,
    'is_active',true,'flash_sale_price',90,'flash_sale_starts_at',now(),'flash_sale_ends_at',now()+interval '7 days');

  for bad in select value from (values
    ('null'::jsonb), ('[]'::jsonb), ('{"Black":"https://example.com/one"}'::jsonb),
    ('{"Black":[]}'::jsonb), (jsonb_build_object('Black',array_fill('https://example.com'::text,array[9]))),
    ('{"Black":["https://example.com/valid","http://example.com/plain"]}'::jsonb),
    ('{"Black":[42]}'::jsonb), ('{"Black":[null]}'::jsonb), ('{"Unknown":["https://example.com"]}'::jsonb)
  ) cases(value) loop
    begin
      perform public.save_catalog_product(tenant,null,fields || jsonb_build_object('color_galleries',bad),matrix,'[]',0,'');
      raise exception 'unexpectedly accepted invalid gallery';
    exception when raise_exception then
      if sqlerrm <> 'invalid_color_gallery' then raise; end if;
    end;
  end loop;

  item := public.save_catalog_product(tenant,null,fields || jsonb_build_object('color_galleries',galleries,
    'color_images','{"Black":"https://example.com/stale"}'::jsonb),matrix,'[]',0,'');
  perform public.save_catalog_product(tenant,item,'{"name":"Edited"}',matrix,matrix,7,'');
  select * into strict stored from public.products where store_id=tenant and id=item;
  assert stored.color_galleries = galleries and stored.color_images = covers, 'cover sync or partial update failed';
  assert stored.max_order_qty=3 and stored.specifications='[]'::jsonb and stored.cost_price=60 and stored.old_price=125
    and stored.flash_sale_price=90 and stored.flash_sale_starts_at=now() and stored.flash_sale_ends_at=now()+interval '7 days';

  begin
    perform public.save_catalog_product(tenant,item,'{}',matrix,matrix,6,'');
    raise exception 'stale stock accepted';
  exception when raise_exception then
    if sqlerrm <> 'inventory_changed' then raise; end if;
  end;
  perform public.save_catalog_product(tenant,item,'{"color_images":{"Black":"https://example.com/replacement"}}',matrix,matrix,7,'');
  select * into strict stored from public.products where store_id=tenant and id=item;
  assert stored.color_galleries='{"Black":["https://example.com/replacement"]}' and
         stored.color_images='{"Black":"https://example.com/replacement"}', 'legacy update failed';
  perform public.save_catalog_product(tenant,item,'{"color_galleries":{}}',matrix,matrix,7,'');
  select * into strict stored from public.products where store_id=tenant and id=item;
  assert stored.color_galleries='{}' and stored.color_images='{}', 'clearing a gallery left a stale primary';
  item := public.save_catalog_product(tenant,null,fields || '{"slug":"legacy-no-images"}',matrix,'[]',0,'');
  select * into strict stored from public.products where store_id=tenant and id=item;
  assert stored.color_galleries='{}' and stored.color_images='{}', 'missing galleries should default to empty';
  assert has_column_privilege('anon','public.products','color_galleries','select') and
         has_column_privilege('authenticated','public.products','color_galleries','select');
  assert not has_function_privilege('anon','public.save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text)','execute') and
         has_function_privilege('authenticated','public.save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text)','execute');
end $test$;
rollback;
select 'Validated gallery shape, URL scheme, membership, primary sync, legacy callers, commercial fields, inventory guards and grants' as verified;
