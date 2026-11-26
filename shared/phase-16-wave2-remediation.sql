-- Wave 2 QA remediation (BUG-08, BUG-09, BUG-12).
-- Idempotent. Apply after phase-15-qa-remediation.sql.

begin;

-- BUG-08: retain the established smart-search ranking, but remove the two
-- pre-pagination caps (60 returned rows and 150 stage-one candidates). The
-- public catalog RPC below remains the only caller that requests the complete
-- ranked relation; ordinary autocomplete callers still pass their own limit.
do $wave2_search$
declare
  v_oid oid;
  v_definition text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'search_products_fast'
    and pg_get_function_identity_arguments(p.oid) =
      'p_store_id uuid, p_query text, p_limit integer, p_category_id uuid, p_offset integer';

  if v_oid is null then
    raise exception 'phase-16 requires public.search_products_fast(uuid,text,int,uuid,int)';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_definition := replace(
    v_definition,
    'greatest(1, least(coalesce(p_limit, 10), 60))',
    'greatest(1, coalesce(p_limit, 10))'
  );
  v_definition := regexp_replace(
    v_definition,
    E'\\n[[:space:]]+LIMIT 150([[:space:]]*\\n)',
    E'\\1',
    'i'
  );
  v_definition := replace(
    v_definition,
    'ORDER BY f.total_score DESC, f.name ASC',
    'ORDER BY f.total_score DESC, f.name ASC, f.id ASC'
  );
  execute v_definition;
end
$wave2_search$;

create or replace function public.catalog_products_page(
  p_store_id uuid,
  p_query text default '',
  p_category_id uuid default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_in_stock boolean default false,
  p_flash_only boolean default false,
  p_sort text default 'relevance',
  p_limit integer default 24,
  p_offset integer default 0,
  p_now timestamptz default statement_timestamp()
)
returns table(
  id uuid,
  name text,
  name_en text,
  category_id uuid,
  description text,
  description_en text,
  price numeric,
  old_price numeric,
  flash_sale_price numeric,
  flash_sale_starts_at timestamptz,
  flash_sale_ends_at timestamptz,
  stock integer,
  sizes text[],
  colors text[],
  image_path text,
  specifications jsonb,
  avg_rating numeric,
  review_count integer,
  created_at timestamptz,
  rank real,
  match_type text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with search_matches as materialized (
    select
      s.id,
      s.rank,
      s.match_type
    from public.search_products_fast(
      p_store_id,
      trim(coalesce(p_query, '')),
      2147483647,
      p_category_id,
      0
    ) s
    where trim(coalesce(p_query, '')) <> ''
  ),
  candidates as materialized (
    select
      p.id,
      p.name,
      p.name_en,
      p.category_id,
      p.description,
      p.description_en,
      p.price,
      p.old_price,
      p.flash_sale_price,
      p.flash_sale_starts_at,
      p.flash_sale_ends_at,
      p.stock,
      p.sizes,
      p.colors,
      p.image_path,
      p.specifications,
      p.avg_rating,
      p.review_count,
      p.created_at,
      s.rank,
      s.match_type,
      (
        p.flash_sale_price is not null
        and p.flash_sale_price > 0
        and p.flash_sale_price < p.price
        and p.flash_sale_ends_at is not null
        and p.flash_sale_ends_at > p_now
        and (p.flash_sale_starts_at is null or p.flash_sale_starts_at <= p_now)
      ) as flash_active
    from public.products p
    left join search_matches s on s.id = p.id
    where p.store_id = p_store_id
      and p.is_active = true
      and (p_category_id is null or p.category_id = p_category_id)
      and (
        trim(coalesce(p_query, '')) = ''
        or s.id is not null
      )
  ),
  filtered as (
    select
      c.*,
      case when c.flash_active then c.flash_sale_price else c.price end as effective_price
    from candidates c
    where (not coalesce(p_in_stock, false) or c.stock > 0)
      and (not coalesce(p_flash_only, false) or c.flash_active)
      and (
        p_min_price is null
        or (case when c.flash_active then c.flash_sale_price else c.price end) >= p_min_price
      )
      and (
        p_max_price is null
        or (case when c.flash_active then c.flash_sale_price else c.price end) <= p_max_price
      )
  ),
  counted as (
    select f.*, count(*) over () as exact_total_count
    from filtered f
  )
  select
    c.id,
    c.name,
    c.name_en,
    c.category_id,
    c.description,
    c.description_en,
    c.price,
    c.old_price,
    c.flash_sale_price,
    c.flash_sale_starts_at,
    c.flash_sale_ends_at,
    c.stock,
    c.sizes,
    c.colors,
    c.image_path,
    c.specifications,
    c.avg_rating,
    c.review_count,
    c.created_at,
    c.rank,
    c.match_type,
    c.exact_total_count
  from counted c
  order by
    case when p_sort = 'relevance' and trim(coalesce(p_query, '')) <> '' then c.rank end desc nulls last,
    case when p_sort = 'price_asc' then c.effective_price end asc nulls last,
    case when p_sort = 'price_desc' then c.effective_price end desc nulls last,
    case when p_sort = 'rating' then coalesce(c.avg_rating, 0) end desc,
    case when p_sort = 'rating' then coalesce(c.review_count, 0) end desc,
    case when p_sort = 'newest' then c.created_at end desc nulls last,
    case when p_sort = 'relevance' and coalesce(p_flash_only, false) then c.flash_sale_ends_at end asc nulls last,
    case when p_sort = 'relevance' and trim(coalesce(p_query, '')) = '' and not coalesce(p_flash_only, false) then c.name end asc,
    c.id asc
  limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.catalog_products_page(
  uuid, text, uuid, numeric, numeric, boolean, boolean, text, integer, integer, timestamptz
) from public;
grant execute on function public.catalog_products_page(
  uuid, text, uuid, numeric, numeric, boolean, boolean, text, integer, integer, timestamptz
) to anon, authenticated;

-- BUG-09: fail the migration if any current product points at a category from
-- another store, then enforce the invariant at every PostgreSQL write path.
do $wave2_category_integrity$
declare
  v_mismatch_count bigint;
begin
  select count(*)
    into v_mismatch_count
  from public.products p
  left join public.categories c
    on c.id = p.category_id
   and c.store_id = p.store_id
  where c.id is null;

  if v_mismatch_count <> 0 then
    raise exception 'Cannot add tenant-category constraint: % mismatched product row(s)', v_mismatch_count;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_id_store_key'
  ) then
    alter table public.categories
      add constraint categories_id_store_key unique (id, store_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_category_store_fk'
  ) then
    alter table public.products
      add constraint products_category_store_fk
      foreign key (category_id, store_id)
      references public.categories(id, store_id)
      on update cascade
      on delete restrict;
  end if;
end
$wave2_category_integrity$;

-- BUG-12: aggregate dashboard KPIs in PostgreSQL for one explicit tenant and
-- date window. The UI passes concrete inclusive/exclusive timestamps.
create or replace function public.admin_dashboard_metrics(
  p_store_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_previous_start_at timestamptz,
  p_previous_end_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with authorized as materialized (
    select
      auth.role() is null
      or coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is not null and public.is_store_admin(p_store_id)) as ok
  ),
  current_orders as materialized (
    select o.*
    from public.orders o
    cross join authorized a
    where o.store_id = p_store_id
      and a.ok
      and o.created_at >= p_start_at
      and o.created_at < p_end_at
  ),
  previous_orders as materialized (
    select o.*
    from public.orders o
    cross join authorized a
    where o.store_id = p_store_id
      and a.ok
      and o.created_at >= p_previous_start_at
      and o.created_at < p_previous_end_at
  ),
  item_profit as (
    select
      o.id as order_id,
      coalesce(sum((oi.unit_price - coalesce(nullif(oi.unit_cost, 0), p.cost_price, 0)) * oi.quantity), 0)
        - coalesce(o.discount_amount, 0) as base_profit
    from current_orders o
    left join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id and p.store_id = p_store_id
    group by o.id, o.discount_amount
  ),
  return_adjustment as (
    select
      r.order_id,
      sum(
        -coalesce(r.refund_amount, 0)
        + case when coalesce(r.restocked, false) then coalesce(restocked.reversed_cogs, 0) else 0 end
      ) as adjustment
    from public.return_requests r
    join current_orders o on o.id = r.order_id
    left join lateral (
      select sum(
        greatest(0, coalesce((entry->>'quantity')::integer, 0))
        * coalesce(nullif(oi.unit_cost, 0), p.cost_price, 0)
      ) as reversed_cogs
      from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) entry
      left join public.order_items oi
        on oi.order_id = r.order_id
       and (
         (entry->>'order_item_id' is not null and oi.id::text = entry->>'order_item_id')
         or (
           entry->>'order_item_id' is null
           and entry->>'product_id' is not null
           and oi.product_id::text = entry->>'product_id'
         )
       )
      left join public.products p on p.id = oi.product_id and p.store_id = p_store_id
    ) restocked on true
    where r.store_id = p_store_id
      and r.status in ('refunded', 'completed')
    group by r.order_id
  ),
  order_profit as (
    select
      o.id,
      o.created_at,
      case when o.status = 'delivered'
        then coalesce(ip.base_profit, 0) + coalesce(ra.adjustment, 0)
        else 0
      end as profit
    from current_orders o
    left join item_profit ip on ip.order_id = o.id
    left join return_adjustment ra on ra.order_id = o.id
  ),
  totals as (
    select
      count(*)::bigint as order_count,
      count(*) filter (where status = 'delivered')::bigint as delivered_count,
      count(*) filter (where status = 'cancelled')::bigint as cancelled_count,
      count(*) filter (where status = 'shipped')::bigint as shipped_count,
      coalesce(sum(total) filter (where status = 'delivered'), 0) as gross_revenue,
      coalesce(sum(total) filter (where status = 'shipped'), 0) as pending_cod_value,
      coalesce(avg(total) filter (where status <> 'cancelled'), 0) as average_order_value
    from current_orders
  ),
  previous_totals as (
    select coalesce(sum(total) filter (where status = 'delivered'), 0) as gross_revenue
    from previous_orders
  ),
  status_rows as (
    select wanted.status, count(o.id)::bigint as count
    from (values ('pending'), ('confirmed'), ('shipped'), ('delivered'), ('cancelled')) wanted(status)
    left join current_orders o on o.status = wanted.status
    group by wanted.status
  ),
  daily as (
    select
      day::date as day,
      coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as revenue,
      coalesce(sum(op.profit), 0) as profit,
      count(o.id)::bigint as count
    from generate_series(
      greatest(p_start_at::date, (p_end_at::date - interval '13 days')::date),
      (p_end_at - interval '1 microsecond')::date,
      interval '1 day'
    ) day
    left join current_orders o on o.created_at >= day and o.created_at < day + interval '1 day'
    left join order_profit op on op.id = o.id
    group by day
    order by day
  ),
  top_products as (
    select
      coalesce(oi.product_id::text, oi.product_name) as id,
      coalesce(p.name, oi.product_name) as name,
      p.name_en,
      p.image_path,
      sum(oi.quantity)::bigint as units,
      sum(oi.unit_price * oi.quantity) as revenue,
      sum((oi.unit_price - coalesce(nullif(oi.unit_cost, 0), p.cost_price, 0)) * oi.quantity) as profit
    from current_orders o
    join public.order_items oi on oi.order_id = o.id
    left join public.products p on p.id = oi.product_id and p.store_id = p_store_id
    where o.status <> 'cancelled'
    group by coalesce(oi.product_id::text, oi.product_name), coalesce(p.name, oi.product_name), p.name_en, p.image_path
    order by revenue desc, id asc
    limit 5
  ),
  low_stock as (
    select p.id, p.name, p.name_en, p.price, p.cost_price, p.stock, p.image_path, p.is_active
    from public.products p
    cross join authorized a
    where a.ok and p.store_id = p_store_id and p.stock <= 5
    order by p.stock asc, p.name asc, p.id asc
    limit 6
  )
  select jsonb_build_object(
    'product_count', (
      select count(*)
      from public.products p
      cross join authorized a
      where a.ok and p.store_id = p_store_id
    ),
    'order_count', t.order_count,
    'gross_revenue', t.gross_revenue,
    'net_profit', coalesce((select sum(profit) from order_profit), 0),
    'pending_cod_value', t.pending_cod_value,
    'pending_cod_count', t.shipped_count,
    'average_order_value', t.average_order_value,
    'delivery_rate', case
      when t.delivered_count + t.cancelled_count = 0 then 0
      else round(100.0 * t.delivered_count / (t.delivered_count + t.cancelled_count))
    end,
    'revenue_trend', case
      when pt.gross_revenue > 0 then round(100.0 * (t.gross_revenue - pt.gross_revenue) / pt.gross_revenue)
      when t.gross_revenue > 0 then 100
      else 0
    end,
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', to_char(day, 'DD/MM'),
        'revenue', revenue,
        'profit', profit,
        'count', count
      ) order by day) from daily
    ), '[]'::jsonb),
    'status_breakdown', coalesce((
      select jsonb_agg(jsonb_build_object('key', status, 'count', count) order by status)
      from status_rows
    ), '[]'::jsonb),
    'top_products', coalesce((select jsonb_agg(to_jsonb(tp)) from top_products tp), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(to_jsonb(ls)) from low_stock ls), '[]'::jsonb)
  )
  from totals t cross join previous_totals pt;
$$;

revoke all on function public.admin_dashboard_metrics(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_dashboard_metrics(uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;

create or replace function public.admin_abandoned_cart_summary(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'all', count(*) filter (where status <> 'dismissed'),
    'open', count(*) filter (where status = 'open'),
    'reminded', count(*) filter (where status = 'reminded'),
    'recovered', count(*) filter (where status = 'recovered'),
    'recoverable_value', coalesce(sum(subtotal) filter (where status in ('open', 'reminded')), 0)
  )
  from public.abandoned_carts
  where store_id = p_store_id
    and (
      auth.role() is null
      or coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is not null and public.is_store_admin(p_store_id))
    );
$$;

revoke all on function public.admin_abandoned_cart_summary(uuid) from public, anon;
grant execute on function public.admin_abandoned_cart_summary(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
