begin;

alter table public.products add column if not exists color_galleries jsonb not null default '{}'::jsonb
  constraint products_color_galleries_object check (jsonb_typeof(color_galleries) = 'object');
grant select(color_galleries) on public.products to anon, authenticated;

update public.products p
set color_galleries = (select jsonb_object_agg(link.key, jsonb_build_array(link.value))
  from jsonb_each_text(p.color_images) link)
where p.color_galleries = '{}'::jsonb and p.color_images <> '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.save_catalog_product(p_store uuid, p_id uuid, p_fields jsonb, p_variants jsonb, p_original_variants jsonb, p_original_stock integer, p_previous_image text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_product public.products%rowtype;
  product public.products%rowtype;
  current_variants jsonb;
  item_id uuid := coalesce(p_id,gen_random_uuid());
  total_stock integer;
begin
  if auth.uid() is null or not coalesce(public.has_store_permission(p_store,'manage_products'),false) then raise insufficient_privilege; end if;
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
  if not (p_fields ? 'color_images') then
    product.color_images := coalesce(current_product.color_images, '{}'::jsonb);
  end if;
  if not exists(select from public.categories where store_id=p_store and id=product.category_id)
     or jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants)>1000
     or jsonb_typeof(product.color_images) is distinct from 'object' then raise exception 'invalid_product'; end if;
  if p_fields ? 'color_galleries' then
    if not (p_fields ? 'color_images') then
      -- Drop thumbnails owned by the previous gallery, including removed colors.
      select coalesce(jsonb_object_agg(link.key, link.value), '{}'::jsonb) into product.color_images
      from jsonb_each(product.color_images) link
      where link.key = any(product.colors) and not (coalesce(current_product.color_galleries, '{}'::jsonb) ? link.key);
    end if;
  elsif p_fields ? 'color_images' then
    -- An older editor supplies only one primary photo per color.
    select coalesce(jsonb_object_agg(link.key, jsonb_build_array(link.value)), '{}'::jsonb)
      into product.color_galleries from jsonb_each(product.color_images) link;
  else
    product.color_galleries := coalesce(current_product.color_galleries, '{}'::jsonb);
  end if;

  if jsonb_typeof(product.color_galleries) is distinct from 'object' then
    raise exception 'invalid_color_gallery';
  end if;
  if exists (
    select from jsonb_each(product.color_galleries) g
    where (g.key = any(product.colors)) is not true
      or case when jsonb_typeof(g.value) = 'array' then
          jsonb_array_length(g.value) not between 1 and 8
          or exists (select from jsonb_array_elements(g.value) photo
                     where jsonb_typeof(photo) <> 'string' or (photo #>> '{}') !~ '^https://')
        else true end
  ) then raise exception 'invalid_color_gallery'; end if;
  select product.color_images || coalesce(jsonb_object_agg(g.key, g.value->>0), '{}'::jsonb)
    into product.color_images from jsonb_each(product.color_galleries) g;
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
      sizes,colors,stock,max_order_qty,color_images,color_galleries,is_active,image_path,image_paths,specifications,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at)
    values(item_id,p_store,product.category_id,product.slug,product.name,product.name_en,product.description,product.description_en,
      product.price,product.cost_price,product.old_price,product.sizes,product.colors,total_stock,product.max_order_qty,product.color_images,product.color_galleries,product.is_active,
      product.image_path,product.image_paths,product.specifications,product.flash_sale_price,product.flash_sale_starts_at,product.flash_sale_ends_at);
  else
    update public.products set category_id=product.category_id,slug=product.slug,name=product.name,name_en=product.name_en,
      description=product.description,description_en=product.description_en,price=product.price,cost_price=product.cost_price,
      old_price=product.old_price,sizes=product.sizes,colors=product.colors,stock=total_stock,max_order_qty=product.max_order_qty,color_images=product.color_images,
      color_galleries=product.color_galleries,
      image_path=product.image_path,image_paths=product.image_paths,specifications=product.specifications,is_active=product.is_active,
      flash_sale_price=product.flash_sale_price,flash_sale_starts_at=product.flash_sale_starts_at,flash_sale_ends_at=product.flash_sale_ends_at
      where store_id=p_store and id=item_id;
  end if;
  update public.product_variants set listed=false where store_id=p_store and product_id=item_id and listed;
  insert into public.product_variants(store_id,product_id,color,size,stock)
    select p_store,item_id,v.color,v.size,v.stock from jsonb_to_recordset(p_variants) as v(color text,size text,stock integer)
    on conflict(store_id,product_id,color,size) do update set stock=excluded.stock,listed=true;
  return item_id;
end $function$;

revoke all on function public.save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text) from public,anon;
grant execute on function public.save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text) to authenticated;

notify pgrst, 'reload schema';
commit;
