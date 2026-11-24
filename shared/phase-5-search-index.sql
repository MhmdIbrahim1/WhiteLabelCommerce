-- Phase 5: High-Speed GIN-Indexed Full-Text & Trigram Product Search
-- Apply after phase-4-orders-shipping.sql. Idempotent and safe to re-run.
begin;

create extension if not exists pg_trgm;

-- Stored generated tsvector combining product name (weight A), slug (B), and description (C).
-- Uses 'simple' dictionary so Arabic and English words index accurately without destructive stemming.
alter table public.products
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(slug, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored;

-- GIN index on full-text search vector.
create index if not exists idx_products_search_vector
  on public.products using gin (search_vector);

-- Trigram GIN indexes for partial matches, infix Arabic/English queries, and typo tolerance.
create index if not exists idx_products_name_trgm
  on public.products using gin (name gin_trgm_ops);

create index if not exists idx_products_description_trgm
  on public.products using gin (description gin_trgm_ops);

-- Fast indexed search RPC ranked by full-text ts_rank + trigram similarity.
create or replace function public.search_products_fast(
  p_query text,
  p_category_id uuid default null,
  p_limit int default 20
)
returns table(
  id uuid,
  name text,
  category_id uuid,
  description text,
  price numeric,
  old_price numeric,
  stock integer,
  sizes text[],
  colors text[],
  image_path text,
  rank real
)
language plpgsql
stable
security invoker
set search_path = public, extensions as $$
declare
  v_q text := trim(coalesce(p_query, ''));
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_tsq tsquery;
  v_like text;
begin
  if length(v_q) = 0 then
    return;
  end if;

  -- Build a prefix-friendly simple tsquery from whitespace-separated tokens
  select to_tsquery(
    'simple',
    string_agg(lexeme || ':*', ' & ')
  )
  into v_tsq
  from (
    select regexp_replace(tok, '[^[:alnum:]\u0600-\u06FF]+', '', 'g') as lexeme
    from regexp_split_to_table(v_q, '\s+') as tok
  ) t
  where length(lexeme) > 0;

  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    p.id,
    p.name,
    p.category_id,
    p.description,
    p.price,
    p.old_price,
    p.stock,
    p.sizes,
    p.colors,
    p.image_path,
    (
      coalesce(case when v_tsq is not null then ts_rank(p.search_vector, v_tsq) else 0 end, 0) * 2.0 +
      greatest(similarity(p.name, v_q), word_similarity(v_q, p.name)) * 1.5 +
      greatest(similarity(coalesce(p.description, ''), v_q), word_similarity(v_q, coalesce(p.description, ''))) * 0.5
    )::real as rank
  from public.products p
  where p.is_active = true
    and (p_category_id is null or p.category_id = p_category_id)
    and (
      (v_tsq is not null and p.search_vector @@ v_tsq)
      or p.name ilike v_like
      or p.description ilike v_like
      or p.name % v_q
      or word_similarity(v_q, p.name) >= 0.35
      or word_similarity(v_q, coalesce(p.description, '')) >= 0.45
    )
  order by rank desc, p.name asc
  limit v_limit;
end $$;

revoke all on function public.search_products_fast(text, uuid, int) from public;
grant execute on function public.search_products_fast(text, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
