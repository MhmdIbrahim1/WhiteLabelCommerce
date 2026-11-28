-- Run against the seeded Nova catalog. Capture the complete SKU matrix before checkout and after cancellation.
begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '5s';

do $test$
declare
  nova constant uuid := '00000000-0000-0000-0000-000000000001';
  buyer uuid := gen_random_uuid();
  chosen record;
  receipt uuid;
  alternate_receipt uuid;
  before_stock jsonb;
  after_stock jsonb;
  parent_stock integer;
begin
  select p.id, v.color, v.stock, p.stock as parent, p.colors[2] as alternate,
    p.color_galleries->p.colors[2]->>0 as alternate_cover into strict chosen
  from public.products p
  join public.product_variants v on (v.store_id,v.product_id)=(p.store_id,p.id) and v.listed
  join public.store_settings s on s.store_id=p.store_id
  where p.store_id=nova and p.is_active and cardinality(p.sizes)=0 and cardinality(p.colors)>=3
    and p.image_path like 'https://zpabcnskkbpplurngtle.supabase.co/storage/v1/object/public/product-images/00000000-0000-0000-0000-000000000001/catalog/%'
    and v.color=p.colors[1] and v.size='' and v.stock between 1 and coalesce(p.max_order_qty,s.default_max_order_qty,p.stock)
    and 2 = (select count(*) from public.product_variants sibling
      where (sibling.store_id,sibling.product_id)=(p.store_id,p.id) and sibling.listed
        and sibling.color in (p.colors[2],p.colors[3]) and sibling.stock>0)
  order by p.slug limit 1 for update of p;

  select jsonb_object_agg(color,stock) into before_stock from public.product_variants
  where store_id=nova and product_id=chosen.id and listed;
  insert into auth.users(id,email,email_confirmed_at) values(buyer,buyer::text || '@example.invalid',now());
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  select order_number into strict receipt from public.store_checkout(gen_random_uuid(),'QA rollback address',
    '01098765430','cod',jsonb_build_array(jsonb_build_object('id',chosen.id,'quantity',chosen.stock,
    'color',chosen.color,'size','')),null,'QA',false,nova);

  select jsonb_object_agg(color,stock) into after_stock from public.product_variants
  where store_id=nova and product_id=chosen.id and listed;
  select stock into strict parent_stock from public.products where store_id=nova and id=chosen.id;
  assert after_stock = jsonb_set(before_stock,array[chosen.color],'0') and parent_stock=chosen.parent-chosen.stock,
    'checkout did not deplete exactly one color';
  update public.orders set status='cancelled' where store_id=nova and id=receipt;
  assert found, 'test checkout missing';
  select jsonb_object_agg(color,stock) into after_stock from public.product_variants
  where store_id=nova and product_id=chosen.id and listed;
  select stock into strict parent_stock from public.products where store_id=nova and id=chosen.id;
  assert after_stock=before_stock and parent_stock=chosen.parent, 'cancellation did not restore inventory';
  -- Older order cards still read color_images; exercise a non-hero color.
  select order_number into strict alternate_receipt from public.store_checkout(gen_random_uuid(),'QA rollback address',
    '01098765430','cod',jsonb_build_array(jsonb_build_object('id',chosen.id,'quantity',1,
    'color',chosen.alternate,'size','')),null,'QA',false,nova);
  assert (select thumbnails[1] from public.my_order_cards(nova) where id=alternate_receipt)
    is not distinct from chosen.alternate_cover, 'customer order card lost its selected color image';
  update public.orders set status='cancelled' where store_id=nova and id=alternate_receipt;
  assert (select jsonb_object_agg(color,stock) from public.product_variants where store_id=nova and product_id=chosen.id and listed)
    = before_stock and (select stock from public.products where store_id=nova and id=chosen.id)=chosen.parent;
end $test$;
rollback;
select 'Seeded first color depleted, sibling colors untouched, cancellation restored every SKU, and the order card showed its selected primary' as verified;
