begin;

alter table public.store_settings add column if not exists default_max_order_qty integer default 10
  check (default_max_order_qty > 0);
alter table public.products add column if not exists max_order_qty integer check (max_order_qty > 0);
grant select(default_max_order_qty) on public.store_settings to anon, authenticated;
grant select(max_order_qty) on public.products to anon, authenticated;

-- Every checkout entry point uses store_checkout. Lock in the same order as
-- inventory adjustments, before any deduction, so split lines see one snapshot.
create or replace function public.check_cart_quantities(p_store uuid, p_lines jsonb, p_default integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  requested record;
  sku record;
  item public.products%rowtype;
  allowed integer;
  sku_allowed integer;
begin
  if exists (select from jsonb_array_elements(p_lines) e where jsonb_typeof(e->'quantity') is distinct from 'number'
      or (e->>'quantity') !~ '^[1-9][0-9]{0,5}$') then raise exception 'invalid_quantity'; end if;

  for requested in
    select (e->>'id')::uuid as id, sum((e->>'quantity')::integer) as qty, jsonb_agg(e) as lines
    from jsonb_array_elements(p_lines) e group by 1 order by 1
  loop
    select * into item from public.products where store_id=p_store and id=requested.id for update;
    if not found or not item.is_active then raise exception 'stock_unavailable'; end if;
    allowed := least(item.stock, coalesce(item.max_order_qty, p_default));
    if requested.qty > allowed then
      raise exception 'max_order_qty_exceeded' using detail = jsonb_build_object(
        'code', 'max_order_qty_exceeded', 'product_id', item.id, 'allowed', allowed)::text;
    end if;

    if exists (select from public.product_variants where store_id=p_store and product_id=item.id and listed) then
      for sku in
        select coalesce(e->>'color','') as color, coalesce(e->>'size','') as size, sum((e->>'quantity')::integer) as qty
        from jsonb_array_elements(requested.lines) e group by 1,2 order by 1,2
      loop
        select least(v.stock, allowed) into sku_allowed from public.product_variants v
          where v.store_id=p_store and v.product_id=item.id and v.listed and v.color=sku.color and v.size=sku.size;
        if not found then raise exception 'invalid_variant'; end if;
        if sku.qty > sku_allowed then
          raise exception 'max_order_qty_exceeded' using detail = jsonb_build_object(
            'code', 'max_order_qty_exceeded', 'product_id', item.id, 'color', sku.color, 'size', sku.size, 'allowed', sku_allowed)::text;
        end if;
      end loop;
    end if;
  end loop;
end $$;
revoke all on function public.check_cart_quantities(uuid,jsonb,integer) from public,anon,authenticated;

-- Keep the installed pricing, delivery, idempotency and wallet implementation.
-- The settings read occurs after the checkout-key lock and successful retry return.
do $migration$
declare
  checkout regprocedure := 'public.store_checkout(uuid,text,text,text,jsonb,text,text,boolean,uuid)'::regprocedure;
  original text := pg_get_functiondef(checkout);
  updated text;
begin
  if strpos(original,'public.check_cart_quantities(')=0 then
    updated := regexp_replace(original,
      'select\s+\*\s+into\s+strict\s+settings\s+from\s+public\.store_settings\s+s\s+where\s+s\.store_id\s*=\s*v_store_id\s*;',
      'select * into strict settings from public.store_settings s where s.store_id = v_store_id for share;
       perform public.check_cart_quantities(settings.store_id, lines, settings.default_max_order_qty);', 'i');
    if updated=original then raise exception 'unrecognized checkout settings read'; end if;
    execute updated;
  end if;
end $migration$;

-- A single merchant save changes product details, options, color photos and on-sale total.
-- Compare the editor's snapshot under the checkout lock to avoid reinstating sold units.
create or replace function public.save_catalog_product(p_store uuid,p_id uuid,p_fields jsonb,p_variants jsonb,
  p_original_variants jsonb,p_original_stock integer,p_previous_image text) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  current_product public.products%rowtype;
  product public.products%rowtype;
  current_variants jsonb;
  item_id uuid := coalesce(p_id,gen_random_uuid());
  total_stock integer;
begin
  if auth.uid() is null or not coalesce(public.is_store_admin(p_store),false) then raise insufficient_privilege; end if;
  if p_id is not null then
    select * into strict current_product from public.products where store_id=p_store and id=p_id for update;
    select coalesce(jsonb_agg(jsonb_build_object('color',color,'size',size,'stock',stock)),'[]') into current_variants
      from public.product_variants where store_id=p_store and product_id=p_id and listed;
    if current_product.stock is distinct from p_original_stock or
       not (current_variants @> p_original_variants and current_variants <@ p_original_variants) or
       (p_fields ? 'image_path' and current_product.image_path is distinct from nullif(p_previous_image,'')) then
      raise exception 'inventory_changed';
    end if;
  end if;
  product := jsonb_populate_record(current_product,p_fields);
  if not exists(select from public.categories where store_id=p_store and id=product.category_id)
     or jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants)>1000
     or jsonb_typeof(product.color_images) is distinct from 'object' then raise exception 'invalid_product'; end if;
  if exists (select from jsonb_each_text(product.color_images) link where not(link.key=any(product.colors)) or link.value !~ '^https://') then
    raise exception 'invalid_color_image';
  end if;
  if exists (select from jsonb_to_recordset(p_variants) as v(color text,size text,stock integer)
    where color is null or size is null or stock is null or stock<0 or
      not(case when cardinality(product.colors)=0 then color='' else color=any(product.colors) end) or
      not(case when cardinality(product.sizes)=0 then size='' else size=any(product.sizes) end)) then raise exception 'invalid_variant'; end if;
  select coalesce(sum(v.stock),product.stock)::integer into total_stock from jsonb_to_recordset(p_variants) as v(stock integer);
  if p_id is null then
    insert into public.products(id,store_id,category_id,slug,name,name_en,description,description_en,price,cost_price,old_price,
      sizes,colors,stock,max_order_qty,color_images,is_active,image_path,image_paths,specifications,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at)
    values(item_id,p_store,product.category_id,product.slug,product.name,product.name_en,product.description,product.description_en,
      product.price,product.cost_price,product.old_price,product.sizes,product.colors,total_stock,product.max_order_qty,product.color_images,product.is_active,
      product.image_path,product.image_paths,product.specifications,product.flash_sale_price,product.flash_sale_starts_at,product.flash_sale_ends_at);
  else
    update public.products set category_id=product.category_id,slug=product.slug,name=product.name,name_en=product.name_en,
      description=product.description,description_en=product.description_en,price=product.price,cost_price=product.cost_price,
      old_price=product.old_price,sizes=product.sizes,colors=product.colors,stock=total_stock,max_order_qty=product.max_order_qty,color_images=product.color_images,
      image_path=product.image_path,image_paths=product.image_paths,specifications=product.specifications,is_active=product.is_active,
      flash_sale_price=product.flash_sale_price,flash_sale_starts_at=product.flash_sale_starts_at,flash_sale_ends_at=product.flash_sale_ends_at
      where store_id=p_store and id=item_id;
  end if;
  update public.product_variants set listed=false where store_id=p_store and product_id=item_id and listed;
  insert into public.product_variants(store_id,product_id,color,size,stock)
    select p_store,item_id,v.color,v.size,v.stock from jsonb_to_recordset(p_variants) as v(color text,size text,stock integer)
    on conflict(store_id,product_id,color,size) do update set stock=excluded.stock,listed=true;
  return item_id;
end $$;
revoke all on function public.save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text) from public,anon;
grant execute on function public.save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
