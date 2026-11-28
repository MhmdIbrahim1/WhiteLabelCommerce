begin;
set local plpgsql.check_asserts = on;

do $test$
declare
  tenant uuid := gen_random_uuid();
  category uuid := gen_random_uuid();
  expected text[] := array['deeper', 'featured'];
  actor text;
begin
  insert into public.stores(id, slug, name_ar) values (tenant, 'flash-qa-' || left(tenant::text, 8), 'QA');
  insert into public.categories(id, store_id, slug, name) values (category, tenant, 'offers', 'Offers');
  insert into public.products(store_id, category_id, slug, name, price, old_price, flash_sale_price,
                              is_active, stock, flash_sale_starts_at, flash_sale_ends_at)
  select tenant, category, label, label, 30, previous, flash, published, qty, starts, ends
  from (values
    ('ordinary', 100, null, true, 2, null::timestamptz, null::timestamptz),
    ('featured', 100, 30, true, 2, now(), now() + interval '1 day'),
    ('deeper', null, 20, true, 2, null, now() + interval '1 day'),
    ('no-discount', null, 30, true, 2, null, now() + interval '1 day'),
    ('sold-out', 100, 30, true, 0, null, now() + interval '1 day'),
    ('draft', 100, 30, false, 2, null, now() + interval '1 day'),
    ('expired', 100, 30, true, 2, null, now()),
    ('upcoming', 100, 30, true, 2, now() + interval '1 hour', now() + interval '1 day')
  ) as fixture(label, previous, flash, published, qty, starts, ends);

  foreach actor in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claim.role', actor, true);
    execute format('set local role %I', actor);
    assert (select array_agg(name order by name) from public.storefront_flash_deals
            where store_id = tenant) is not distinct from expected, 'Flash deals home feed';
    assert (select array_agg(name order by name) from public.catalog_products_page(
            p_store_id => tenant, p_flash_only => true)) is not distinct from expected, 'Flash deals catalog';
    assert public.get_effective_product_price(30, 30, null, now() + interval '1 day', now()) = 30,
           'Featuring the current sale must keep its checkout price';
    reset role;
  end loop;
end $test$;

rollback;
