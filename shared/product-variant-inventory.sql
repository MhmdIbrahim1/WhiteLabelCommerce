begin;

create unique index if not exists products_store_id_id_uidx on public.products(store_id,id);
alter table public.products add column if not exists color_images jsonb not null default '{}' check (jsonb_typeof(color_images)='object');
grant select(color_images) on public.products to anon, authenticated;

create table if not exists public.product_variants (
  store_id uuid not null,
  product_id uuid not null,
  color text not null default '',
  size text not null default '',
  stock integer not null check (stock >= 0),
  listed boolean not null default true,
  primary key (store_id,product_id,color,size),
  foreign key (store_id,product_id) references public.products(store_id,id) on delete cascade,
  check (color <> '' or size <> '')
);
alter table public.product_variants enable row level security;
revoke all on public.product_variants from public,anon,authenticated;
grant select on public.product_variants to anon,authenticated,service_role;
drop policy if exists visible_variants on public.product_variants;
create policy visible_variants on public.product_variants for select using (
  listed and exists(select 1 from public.products p where p.store_id=product_variants.store_id
    and p.id=product_variants.product_id)
);

-- Checkout and stock restoration both lock the product before touching its SKUs.
create or replace function public.adjust_product_inventory(p_store uuid,p_product uuid,p_color text,p_size text,p_delta integer)
returns void language plpgsql security invoker set search_path='' as $$
declare
  has_matrix boolean;
  color_key text := coalesce(p_color,'');
  size_key text := coalesce(p_size,'');
begin
  perform 1 from public.products where store_id=p_store and id=p_product for update;
  if not found then
    if p_delta < 0 then raise exception 'stock_unavailable'; end if;
    return;
  end if;
  select exists(select from public.product_variants where store_id=p_store and product_id=p_product and listed) into has_matrix;
  if has_matrix then
    update public.product_variants set stock=stock+p_delta
      where store_id=p_store and product_id=p_product and color=color_key and size=size_key
        and listed and (p_delta>=0 or stock>=-p_delta);
    if not found then
      if p_delta<0 then raise exception 'stock_unavailable'; end if;
      -- A retired option stays off sale when an older order is returned.
      if color_key<>'' or size_key<>'' then
        insert into public.product_variants as v (store_id,product_id,color,size,stock,listed)
          values(p_store,p_product,color_key,size_key,p_delta,false)
          on conflict(store_id,product_id,color,size) do update set stock=v.stock+excluded.stock;
      else
        -- A legacy line without options cannot be assigned to an arbitrary SKU.
        update public.products set unassigned_stock=unassigned_stock+p_delta where store_id=p_store and id=p_product;
      end if;
      return;
    end if;
  end if;
  update public.products set stock=stock+p_delta where store_id=p_store and id=p_product and (p_delta>=0 or stock>=-p_delta);
  if not found then raise exception 'stock_unavailable'; end if;
end $$;
alter table public.products add column if not exists unassigned_stock integer not null default 0 check (unassigned_stock>=0);
revoke all on function public.adjust_product_inventory(uuid,uuid,text,text,integer) from public,anon,authenticated;

-- Preserve the active checkout's pricing, idempotency, shipping, wallet and receipt behavior.
do $migration$
declare
  signature regprocedure := 'public.store_checkout(uuid,text,text,text,jsonb,text,text,boolean,uuid)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  updated text;
begin
  if strpos(definition,'public.adjust_product_inventory(')=0 then
    updated := regexp_replace(definition,'update\s+public\.products\s+set\s+stock\s*=\s*stock\s*-\s*item_quantity\s+where\s+id\s*=\s*product\.id;',
      'perform public.adjust_product_inventory(settings.store_id,product.id,chosen_color,chosen_size,-item_quantity);','i');
    if updated=definition then raise exception 'unrecognized checkout inventory implementation'; end if;
    execute updated;
  end if;
end $migration$;

create or replace function public.restore_order_stock_on_cancel() returns trigger
language plpgsql security definer set search_path='' as $$
declare item record;
begin
  if new.status='cancelled' and old.status not in ('cancelled','delivered') and not old.stock_restored then
    update public.orders set stock_restored=true where id=new.id and not stock_restored;
    if found then
      for item in select product_id,color,size,sum(quantity)::integer qty from public.order_items
        where order_id=new.id and product_id is not null group by product_id,color,size order by product_id,color,size loop
        perform public.adjust_product_inventory(new.store_id,item.product_id,item.color,item.size,item.qty);
      end loop;
    end if;
  end if;
  return new;
end $$;

-- Restock only the purchased line, including its recorded color and size.
do $migration$
declare
  signature regprocedure := 'public.admin_process_return_request(uuid,text,text,boolean)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  updated text;
begin
  if strpos(definition,'public.adjust_product_inventory(')=0 then
    updated := regexp_replace(definition,'v_prod_id := null;.*?end if;\s*end loop;\s*v_restocked := true;', $body$
      perform public.adjust_product_inventory(v_req.store_id,oi.product_id,oi.color,oi.size,v_qty)
      from public.order_items oi where oi.order_id=v_req.order_id
        and oi.id=nullif(v_item->>'order_item_id','')::uuid;
      if not found then
        -- Older requests sometimes recorded only a product. Resolve it only when unambiguous.
        select min(oi.id::text)::uuid into v_variant_id from public.order_items oi
          where oi.order_id=v_req.order_id and oi.product_id=nullif(v_item->>'product_id','')::uuid having count(*)=1;
        if v_variant_id is null then raise exception 'ambiguous_return_item'; end if;
        perform public.adjust_product_inventory(v_req.store_id,oi.product_id,oi.color,oi.size,v_qty)
          from public.order_items oi where oi.id=v_variant_id;
      end if;
    end loop;
    v_restocked := true;$body$);
    if updated=definition then raise exception 'unrecognized return inventory implementation'; end if;
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
      sizes,colors,stock,color_images,is_active,image_path,image_paths,specifications,flash_sale_price,flash_sale_starts_at,flash_sale_ends_at)
    values(item_id,p_store,product.category_id,product.slug,product.name,product.name_en,product.description,product.description_en,
      product.price,product.cost_price,product.old_price,product.sizes,product.colors,total_stock,product.color_images,product.is_active,
      product.image_path,product.image_paths,product.specifications,product.flash_sale_price,product.flash_sale_starts_at,product.flash_sale_ends_at);
  else
    update public.products set category_id=product.category_id,slug=product.slug,name=product.name,name_en=product.name_en,
      description=product.description,description_en=product.description_en,price=product.price,cost_price=product.cost_price,
      old_price=product.old_price,sizes=product.sizes,colors=product.colors,stock=total_stock,color_images=product.color_images,
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
