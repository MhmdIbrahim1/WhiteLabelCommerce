begin;
do $test$
declare
  tenant uuid;
  shopper uuid := gen_random_uuid();
  product uuid;
  legacy_product uuid;
  other_store uuid;
  receipt uuid;
  request_key uuid;
  fields jsonb;
  matrix jsonb := '[{"color":"Blue","size":"","stock":15},{"color":"Red","size":"","stock":3}]';
  lines jsonb;
  step record;
  details text;
begin
  insert into auth.users(id,email,email_confirmed_at) values(shopper,shopper::text||'@example.invalid',now());
  perform set_config('request.jwt.claim.sub',shopper::text,true);
  for tenant in select id from public.stores where slug in ('nova-store','omar-a7a') order by slug loop
    insert into public.store_members(store_id,user_id,role,permissions) values(tenant,shopper,'catalog','{"manage_products":true}');
    update public.store_settings set default_max_order_qty=5 where store_id=tenant;
    fields := jsonb_build_object('name','QA limit','name_en','QA limit','slug',gen_random_uuid()::text,'stock',18,'price',10,
      'cost_price',0,'description','','description_en','','specifications','[]'::jsonb,'sizes',array[]::text[],
      'colors',array['Blue','Red'],'category_id',(select id from public.categories where store_id=tenant limit 1),
      'is_active',true,'color_images','{}'::jsonb);
    product := public.save_catalog_product(tenant,null,fields,matrix,'[]',0,'');
    for step in select * from (values
      (null::int,4,2,'Red',5), -- store default across colors
      (4,3,2,'Blue',4),         -- product override across identical lines
      (12,0,4,'Red',3),         -- SKU stock below configured limit
      (null,0,19,'Blue',18)     -- both settings null, parent stock limits the order
    ) as t(override,first_qty,second_qty,second_color,expected) loop
      if step.expected=18 then update public.store_settings set default_max_order_qty=null where store_id=tenant; end if;
      perform public.save_catalog_product(tenant,product,fields||jsonb_build_object('max_order_qty',step.override),matrix,matrix,18,'');
      lines := jsonb_build_array(jsonb_build_object('id',product,'quantity',step.second_qty,'color',step.second_color));
      if step.first_qty>0 then lines := lines || jsonb_build_array(jsonb_build_object('id',product,'quantity',step.first_qty,'color','Blue')); end if;
      request_key := gen_random_uuid();
      begin
        perform public.mobile_checkout(tenant,request_key,'QA rollback address','01098765430','cod',lines);
        raise exception 'over-limit order succeeded';
      exception when raise_exception then
        get stacked diagnostics details = pg_exception_detail;
        if sqlerrm <> 'max_order_qty_exceeded' or (details::jsonb->>'code') is distinct from sqlerrm
           or (details::jsonb->>'allowed')::int is distinct from step.expected
           or (details::jsonb->>'product_id')::uuid is distinct from product then raise; end if;
      end;
      if exists(select from public.orders where checkout_key=request_key)
         or (select stock from public.products where id=product)<>18 then raise exception 'rejection left side effects'; end if;
    end loop;
    update public.store_settings set default_max_order_qty=2 where store_id=tenant;
    legacy_product := public.save_catalog_product(tenant,null,
      fields||jsonb_build_object('slug',gen_random_uuid()::text,'stock',9),'[]','[]',0,'');
    lines := jsonb_build_array(jsonb_build_object('id',legacy_product,'quantity',2,'color','Red'),
      jsonb_build_object('id',legacy_product,'quantity',1,'color','Blue'),jsonb_build_object('id',product,'quantity',1,'color','Blue'));
    request_key := gen_random_uuid();
    begin
      perform public.checkout_delivery(tenant,request_key,'QA rollback address','01098765430','cod',lines,'{}');
      raise exception 'accepted split legacy inventory over the default';
    exception when raise_exception then
      get stacked diagnostics details = pg_exception_detail;
      if sqlerrm <> 'max_order_qty_exceeded' or (details::jsonb->>'allowed')::int is distinct from 2 then raise; end if;
    end;
    if exists(select from public.orders where checkout_key=request_key)
       or (select stock from public.products where id=legacy_product)<>9
       or (select stock from public.products where id=product)<>18 then raise exception 'partial cart committed'; end if;
    select id into strict other_store from public.stores where slug in ('nova-store','omar-a7a') and id<>tenant;
    begin
      perform public.checkout_delivery(other_store,gen_random_uuid(),'QA rollback address','01098765430','cod',
        jsonb_build_array(jsonb_build_object('id',legacy_product,'quantity',1,'color','Blue')),'{}');
      raise exception 'accepted a product from a different store';
    exception when raise_exception then
      if sqlerrm <> 'stock_unavailable' then raise; end if;
    end;
    perform public.save_catalog_product(tenant,product,fields||'{"max_order_qty":5}',matrix,matrix,18,'');
    lines := jsonb_build_array(jsonb_build_object('id',product,'quantity',5,'color','Blue'));
    request_key := gen_random_uuid();
    select order_number into strict receipt from public.store_checkout(request_key,'QA rollback address','01098765430','cod',lines,null,'QA',false,tenant);
    update public.products set max_order_qty=1 where store_id=tenant and id=product;
    if (select order_number from public.mobile_checkout(tenant,request_key,'QA rollback address','01098765430','cod',lines,null,'QA')) is distinct from receipt
       or (select stock from public.product_variants where product_id=product and color='Blue')<>10 then raise exception 'retry changed receipt or inventory'; end if;
    begin
      update public.products set max_order_qty=0 where id=product;
      raise exception 'invalid product override accepted';
    exception when check_violation then null; end;
    begin
      update public.store_settings set default_max_order_qty=-1 where store_id=tenant;
      raise exception 'invalid store default accepted';
    exception when check_violation then null; end;
  end loop;
end $test$;
rollback;
select 'order quantity limits, two tenants' as verified;
