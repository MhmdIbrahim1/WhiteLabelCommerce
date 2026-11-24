-- Phase 7: Product Technical Specifications (JSONB), Bilingual Catalog (AR/EN) & Bilingual GIN Search
-- Apply after phase-6-crm-analytics.sql. Idempotent and safe to re-run.
begin;

create extension if not exists pg_trgm;

-- 1. Bilingual fields & structured technical specifications on products
alter table public.products
  add column if not exists name_en text not null default '',
  add column if not exists description_en text not null default '',
  add column if not exists specifications jsonb not null default '[]'::jsonb;

alter table public.products
  drop constraint if exists products_specifications_is_array;
alter table public.products
  add constraint products_specifications_is_array
  check (jsonb_typeof(specifications) = 'array');

-- 2. Bilingual name on categories
alter table public.categories
  add column if not exists name_en text not null default '';

-- 3. Upgrade stored generated tsvector to index both Arabic and English fields
drop index if exists public.idx_products_search_vector;
alter table public.products
  drop column if exists search_vector;

alter table public.products
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(name_en, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(slug, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description_en, '')), 'C')
  ) stored;

-- GIN indexes for full-text + bilingual trigram search
create index if not exists idx_products_search_vector
  on public.products using gin (search_vector);

create index if not exists idx_products_name_trgm
  on public.products using gin (name gin_trgm_ops);

create index if not exists idx_products_name_en_trgm
  on public.products using gin (name_en gin_trgm_ops);

create index if not exists idx_products_description_trgm
  on public.products using gin (description gin_trgm_ops);

create index if not exists idx_products_description_en_trgm
  on public.products using gin (description_en gin_trgm_ops);

-- 4. Upgrade search_products_fast RPC to search & return bilingual fields + specifications
drop function if exists public.search_products_fast(text, uuid, int);
create or replace function public.search_products_fast(
  p_query text,
  p_category_id uuid default null,
  p_limit int default 20
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
  stock integer,
  sizes text[],
  colors text[],
  image_path text,
  specifications jsonb,
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
    p.name_en,
    p.category_id,
    p.description,
    p.description_en,
    p.price,
    p.old_price,
    p.stock,
    p.sizes,
    p.colors,
    p.image_path,
    p.specifications,
    (
      coalesce(case when v_tsq is not null then ts_rank(p.search_vector, v_tsq) else 0 end, 0) * 2.0 +
      greatest(
        similarity(p.name, v_q),
        word_similarity(v_q, p.name),
        similarity(coalesce(p.name_en, ''), v_q),
        word_similarity(v_q, coalesce(p.name_en, ''))
      ) * 1.5 +
      greatest(
        similarity(coalesce(p.description, ''), v_q),
        word_similarity(v_q, coalesce(p.description, '')),
        similarity(coalesce(p.description_en, ''), v_q),
        word_similarity(v_q, coalesce(p.description_en, ''))
      ) * 0.5
    )::real as rank
  from public.products p
  where p.is_active = true
    and (p_category_id is null or p.category_id = p_category_id)
    and (
      (v_tsq is not null and p.search_vector @@ v_tsq)
      or p.name ilike v_like
      or p.name_en ilike v_like
      or p.description ilike v_like
      or p.description_en ilike v_like
      or p.name % v_q
      or p.name_en % v_q
      or word_similarity(v_q, p.name) >= 0.35
      or word_similarity(v_q, coalesce(p.name_en, '')) >= 0.35
      or word_similarity(v_q, coalesce(p.description, '')) >= 0.45
      or word_similarity(v_q, coalesce(p.description_en, '')) >= 0.45
    )
  order by rank desc, p.name asc
  limit v_limit;
end $$;

revoke all on function public.search_products_fast(text, uuid, int) from public;
grant execute on function public.search_products_fast(text, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
