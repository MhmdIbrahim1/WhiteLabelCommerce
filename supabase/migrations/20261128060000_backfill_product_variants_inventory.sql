-- Checkout, cancellation and merchant edits take the product lock before changing its variants.
do $backfill$
declare
  product record;
  written integer;
begin
  for product in
    select p.store_id, p.id, p.colors, p.sizes, p.stock
    from public.products p
    where (cardinality(p.colors) > 0 or cardinality(p.sizes) > 0)
      and not exists (
        select from public.product_variants v
        where (v.store_id, v.product_id) = (p.store_id, p.id) and v.listed
      )
    order by p.store_id, p.id
    for update of p
  loop
    -- A merchant or another migration may have created a matrix while we waited for the lock.
    if exists (select from public.product_variants v
               where (v.store_id, v.product_id) = (product.store_id, product.id) and v.listed) then
      continue;
    end if;

    with colors as (
      select color, min(position) as position
      from unnest(product.colors) with ordinality as c(color, position)
      where nullif(trim(color), '') is not null
      group by color
    ), sizes as (
      select size, min(position) as position
      from unnest(product.sizes) with ordinality as s(size, position)
      where nullif(trim(size), '') is not null
      group by size
    ), options as (
      select c.color, s.size, count(*) over () as n,
             row_number() over (order by c.position, s.position) as i
      from (select * from colors union all select '', 1 where not exists (select from colors)) c
      cross join (select * from sizes union all select '', 1 where not exists (select from sizes)) s
      where c.color <> '' or s.size <> ''
    )
    insert into public.product_variants as v (store_id, product_id, color, size, stock, listed)
    select product.store_id, product.id, color, size,
           product.stock / n + case when i <= product.stock % n then 1 else 0 end, true
    from options
    on conflict (store_id, product_id, color, size)
    do update set stock = excluded.stock, listed = true where not v.listed;

    get diagnostics written = row_count;
    if written = 0 or product.stock is distinct from (
      select sum(v.stock) from public.product_variants v
      where (v.store_id, v.product_id) = (product.store_id, product.id) and v.listed
    ) then
      raise exception 'Variant backfill could not reconcile stock for product %', product.id;
    end if;
  end loop;
end
$backfill$;
