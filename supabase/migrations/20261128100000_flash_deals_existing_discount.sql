begin;

-- A merchant can feature the current sale price until the configured end time.
create or replace view public.storefront_flash_deals with (security_invoker = true) as
  select p.store_id, p.id, p.name, p.name_en, p.category_id, p.description, p.description_en,
         p.price, p.old_price, p.flash_sale_price, p.flash_sale_starts_at, p.flash_sale_ends_at,
         p.stock, p.max_order_qty, p.sizes, p.colors, p.image_path, p.specifications, p.avg_rating, p.review_count
  from public.products p
  where p.is_active and p.stock > 0 and p.flash_sale_price > 0
    and (p.flash_sale_price < p.price or (p.flash_sale_price = p.price and p.old_price > p.price))
    and (p.flash_sale_starts_at is null or p.flash_sale_starts_at <= statement_timestamp())
    and p.flash_sale_ends_at > statement_timestamp();

create or replace function public.catalog_products_page(
  p_store_id uuid,p_query text default '',p_category_id uuid default null,
  p_min_price numeric default null,p_max_price numeric default null,p_in_stock boolean default false,
  p_flash_only boolean default false,p_sort text default 'relevance',p_limit int default 24,
  p_offset int default 0,p_now timestamptz default statement_timestamp(),p_exact_query boolean default false
) returns table(
  id uuid,name text,name_en text,category_id uuid,description text,description_en text,
  price numeric,old_price numeric,flash_sale_price numeric,flash_sale_starts_at timestamptz,flash_sale_ends_at timestamptz,
  stock int,sizes text[],colors text[],image_path text,specifications jsonb,avg_rating numeric,
  review_count int,created_at timestamptz,rank real,match_type text,total_count bigint,
  effective_query text,corrected_from text,correction_reason text,was_auto_corrected boolean,match_tier int,slug text
) language plpgsql stable security invoker set search_path=pg_catalog,pg_temp as $$
declare
  raw text:=trim(left(coalesce(p_query,''),100)); keywords text:=raw; intent text[]; ceiling numeric;
begin
  if not coalesce(p_exact_query,false) then
    intent:=regexp_match(translate(lower(raw),'٠١٢٣٤٥٦٧٨٩','0123456789'),
      '(^|[[:space:]])(under|تحت|[اأ]قل[[:space:]]+من)[[:space:]]+([0-9]{1,12}([.][0-9]{1,2})?)[[:space:]]*$');
    if intent is not null then
      keywords:=trim(regexp_replace(keywords,'(^|[[:space:]])(under|تحت|[اأ]قل[[:space:]]+من)[[:space:]]+[0-9٠-٩.]+[[:space:]]*$','','i'));
      if p_max_price is null then ceiling:=intent[3]::numeric; end if;
    end if;
  end if;
  return query
    with eligible as materialized (
      select p.id,p.stock,p.avg_rating,p.review_count,p.created_at,p.name,p.flash_sale_ends_at,
        case when f.active then p.flash_sale_price else p.price end as selling_price
      from public.products p cross join lateral (select p.flash_sale_price>0 and (p.flash_sale_price<p.price or (p.flash_sale_price=p.price and p.old_price>p.price))
        and p.flash_sale_ends_at>p_now and (p.flash_sale_starts_at is null or p.flash_sale_starts_at<=p_now) as active) f
      where p.store_id=p_store_id and p.is_active and (p_category_id is null or p.category_id=p_category_id)
        and (not coalesce(p_in_stock,false) or p.stock>0) and (not coalesce(p_flash_only,false) or (p.stock>0 and f.active))
  ), filtered as materialized (
      select e.* from eligible e where (p_min_price is null or e.selling_price>=p_min_price)
        and (p_max_price is null or e.selling_price<=p_max_price) and (ceiling is null or e.selling_price<ceiling)
  ), matches as materialized (
    select m.* from catalog_search.ranked(p_store_id,keywords,coalesce(p_exact_query,false),
      case when p_category_id is not null or p_min_price is not null or p_max_price is not null or ceiling is not null
        or p_in_stock or p_flash_only then array(select f.id from filtered f) end) m where keywords<>''
  ), scored as (
    select f.*,m.match_type,m.match_tier,m.effective_query,m.correction_reason,
      ((array[100,75,50,10])[m.match_tier]+(array[30,20,20,10])[m.match_tier]*
       (m.lexical_quality + 0.16*(f.stock>0)::int + 0.03*coalesce(s.boost,0)
        +0.03*least(1.0,ln(1+greatest(f.review_count,0)::float8)/5)))::real score
    from filtered f left join matches m on m.product_id=f.id
    left join catalog_search.sales_boost(p_store_id) s on keywords<>'' and s.product_id=m.product_id
    where keywords='' or m.product_id is not null
  ), page as materialized (
    select a.*,count(*) over() total,row_number() over(order by
      case when p_sort='relevance' then a.score end desc nulls last,
      case when p_sort='price_asc' then a.selling_price end,
      case when p_sort='price_desc' then a.selling_price end desc,
      case when p_sort='rating' then coalesce(a.avg_rating,0) end desc,
      case when p_sort='rating' then coalesce(a.review_count,0) end desc,
      case when p_sort='newest' then a.created_at end desc nulls last,
      case when p_sort='relevance' and p_flash_only then a.flash_sale_ends_at end,
      case when p_sort='relevance' and keywords='' and not p_flash_only then a.name end,a.id) pos
    from scored a order by pos limit greatest(1,least(coalesce(p_limit,24),100)) offset greatest(0,coalesce(p_offset,0))
  )
  select p.id,p.name,p.name_en,p.category_id,p.description,p.description_en,p.price,p.old_price,p.flash_sale_price,
    p.flash_sale_starts_at,p.flash_sale_ends_at,p.stock,p.sizes,p.colors,p.image_path,p.specifications,p.avg_rating,
    p.review_count,p.created_at,a.score,a.match_type,a.total,coalesce(a.effective_query,keywords),
    case when a.correction_reason is not null then raw end,a.correction_reason,a.correction_reason is not null,a.match_tier,p.slug
  from page a join public.products p on p.id=a.id and p.store_id=p_store_id and p.is_active order by a.pos;
end $$;

notify pgrst, 'reload schema';
commit;
