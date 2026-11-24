-- Phase 7b: Hybrid Smart Bilingual Fuzzy Search (AR/EN) with Multi-Tenant store_id Isolation
-- Enables pg_trgm + fuzzystrmatch (levenshtein, dmetaphone), Arabic/English normalizers,
-- Arabic consonant skeleton matching, JSONB specifications + options search, and GIN trigram indexes.
-- Apply after phase-7-specs-bilingual.sql. Idempotent and safe to re-run.
begin;

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- 1. Arabic text normalizer:
--    Unifies أ/إ/آ -> ا, ة -> ه, ى -> ي, strips tashkeel (diacritics) and tatweel (ـ),
--    normalizes punctuation and collapses whitespace.
create or replace function public.normalize_arabic_text(p_text text)
returns text
language sql
immutable
parallel safe as $$
  select trim(
    regexp_replace(
      regexp_replace(
        translate(
          regexp_replace(
            coalesce(p_text, ''),
            '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+',
            '',
            'g'
          ),
          'أإآةىؤئ',
          'اااهيوي'
        ),
        '[^\u0600-\u06FF0-9a-zA-Z\s]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

-- 2. Arabic consonant skeleton:
--    Normalizes Arabic text and strips long vowels (ا, و, ي) from tokens so
--    typos like "تشرت" match "تيشيرت" and "كتشي" match "كوتشي".
create or replace function public.arabic_consonant_skeleton(p_text text)
returns text
language sql
immutable
parallel safe as $$
  select trim(
    regexp_replace(
      regexp_replace(
        public.normalize_arabic_text(p_text),
        '[اوي]',
        '',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

-- 3. English text normalizer:
--    Lowercases, strips hyphens and apostrophes inside words so "tshirt", "t-shrt", and "T-Shirt"
--    unify cleanly, replaces remaining punctuation with spaces, and collapses whitespace.
create or replace function public.normalize_english_text(p_text text)
returns text
language sql
immutable
parallel safe as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(coalesce(p_text, '')),
          '[-''’`]',
          '',
          'g'
        ),
        '[^a-z0-9\s]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  )
$$;

-- 4. Flatten JSONB specifications array into searchable bilingual text
create or replace function public.product_specs_text(p_specs jsonb)
returns text
language sql
immutable
parallel safe as $$
  select coalesce(
    (
      select string_agg(
        concat_ws(
          ' ',
          elem->>'key_ar',
          elem->>'key_en',
          elem->>'value_ar',
          elem->>'value_en'
        ),
        ' '
      )
      from jsonb_array_elements(
        case
          when p_specs is not null and jsonb_typeof(p_specs) = 'array' then p_specs
          else '[]'::jsonb
        end
      ) as elem
    ),
    ''
  )
$$;

-- 5. GIN trigram indexes on normalized Arabic name and normalized English name
create index if not exists idx_products_name_norm_trgm
  on public.products using gin (public.normalize_arabic_text(name) gin_trgm_ops);

create index if not exists idx_products_name_en_norm_trgm
  on public.products using gin (public.normalize_english_text(name_en) gin_trgm_ops);

create index if not exists idx_products_store_active_idx
  on public.products (store_id, is_active);

-- 6. Hybrid multi-layer smart search RPC strictly scoped by store_id
drop function if exists public.search_products_fast(text, uuid, int);
drop function if exists public.search_products_fast(uuid, text, int);
drop function if exists public.search_products_fast(uuid, text, int, uuid);

create or replace function public.search_products_fast(
  p_store_id uuid,
  p_query text,
  p_limit int default 20,
  p_category_id uuid default null
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
  rank real,
  match_type text
)
language plpgsql
stable
security invoker
set search_path = public, extensions as $$
declare
  v_raw text := trim(coalesce(p_query, ''));
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_ar_q text := public.normalize_arabic_text(v_raw);
  v_skel_q text := public.arabic_consonant_skeleton(v_raw);
  v_en_q text := public.normalize_english_text(v_raw);
  v_en_split_q text := trim(regexp_replace(lower(v_raw), '[^a-z0-9\s]+', ' ', 'g'));
  v_has_ar boolean := v_raw ~ '[\u0600-\u06FF]';
  v_has_en boolean := v_raw ~ '[a-zA-Z0-9]';
  v_like_ar text;
  v_like_en text;
  v_like_en_split text;
  v_ar_tokens text[];
  v_skel_tokens text[];
  v_en_tokens text[];
  v_tsq tsquery;
begin
  if p_store_id is null or length(v_raw) = 0 then
    return;
  end if;

  v_like_ar := '%' || replace(replace(replace(v_ar_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_like_en := '%' || replace(replace(replace(v_en_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_like_en_split := '%' || replace(replace(replace(v_en_split_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(array_agg(tok), '{}')
  into v_ar_tokens
  from (
    select distinct tok
    from regexp_split_to_table(v_ar_q, '\s+') as tok
    where tok ~ '[\u0600-\u06FF]' and length(tok) >= 2
  ) t;

  select coalesce(array_agg(sk), '{}')
  into v_skel_tokens
  from (
    select distinct public.arabic_consonant_skeleton(tok) as sk
    from unnest(v_ar_tokens) as tok
    where length(public.arabic_consonant_skeleton(tok)) >= 2
  ) t;

  select coalesce(array_agg(tok), '{}')
  into v_en_tokens
  from (
    select distinct tok
    from regexp_split_to_table(v_en_q, '\s+') as tok
    where tok ~ '^[a-z0-9]+$' and length(tok) >= 2
  ) t;

  select to_tsquery('simple', string_agg(lexeme || ':*', ' & '))
  into v_tsq
  from (
    select regexp_replace(tok, '[^[:alnum:]\u0600-\u06FF]+', '', 'g') as lexeme
    from regexp_split_to_table(v_raw, '\s+') as tok
  ) t
  where length(lexeme) > 0;

  return query
  with candidates as (
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
      p.search_vector,
      public.normalize_arabic_text(p.name) as n_ar,
      public.normalize_english_text(p.name_en) as n_en,
      lower(coalesce(p.name_en, '')) as raw_en,
      public.normalize_arabic_text(p.description) as d_ar,
      public.normalize_english_text(p.description_en) as d_en,
      public.product_specs_text(p.specifications) as s_raw,
      array_to_string(coalesce(p.colors, '{}') || coalesce(p.sizes, '{}'), ' ') as o_raw
    from public.products p
    where p.store_id = p_store_id
      and p.is_active = true
      and (p_category_id is null or p.category_id = p_category_id)
  ),
  enriched as (
    select
      c.*,
      public.normalize_arabic_text(c.s_raw || ' ' || c.o_raw) as extra_ar,
      public.normalize_english_text(c.s_raw || ' ' || c.o_raw) as extra_en,
      lower(coalesce(c.d_en, '') || ' ' || coalesce(c.s_raw, '') || ' ' || coalesce(c.o_raw, '')) as raw_extra_en
    from candidates c
  ),
  scored as (
    select
      e.*,
      -- Layer 1: Exact / Prefix / Substring Normalized Match
      (
        case
          when (v_has_ar and length(v_ar_q) >= 2 and (e.n_ar = v_ar_q or e.n_ar like v_ar_q || '%'))
            or (v_has_en and length(v_en_q) >= 2 and (e.n_en = v_en_q or e.n_en like v_en_q || '%'))
          then 10.0
          when (v_has_ar and length(v_ar_q) >= 2 and e.n_ar like v_like_ar)
            or (v_has_en and length(v_en_q) >= 2 and (e.n_en like v_like_en or e.raw_en like v_like_en_split))
          then 8.0
          else 0.0
        end
        +
        case
          when (v_has_ar and length(v_ar_q) >= 2 and (e.d_ar like v_like_ar or e.extra_ar like v_like_ar))
            or (v_has_en and length(v_en_q) >= 2 and (e.d_en like v_like_en or e.extra_en like v_like_en or e.raw_extra_en like v_like_en_split))
          then 4.5
          else 0.0
        end
        +
        coalesce(case when v_tsq is not null and e.search_vector @@ v_tsq then ts_rank(e.search_vector, v_tsq) * 2.0 else 0.0 end, 0.0)
      )::real as exact_score,

      -- Layer 2: Arabic Consonant Skeleton Match (e.g. تشرت == تيشيرت, كتشي == كوتشي)
      (
        case
          when cardinality(v_skel_tokens) > 0 and exists (
            select 1
            from unnest(v_skel_tokens) as qsk
            join regexp_split_to_table(e.n_ar, '\s+') as ptok on length(ptok) >= 2
            where public.arabic_consonant_skeleton(ptok) = qsk
               or (length(qsk) >= 3 and public.arabic_consonant_skeleton(ptok) like qsk || '%')
          ) then 7.2
          when cardinality(v_skel_tokens) > 0 and exists (
            select 1
            from unnest(v_skel_tokens) as qsk
            join regexp_split_to_table(e.d_ar || ' ' || e.extra_ar, '\s+') as ptok on length(ptok) >= 2
            where public.arabic_consonant_skeleton(ptok) = qsk
          ) then 5.0
          else 0.0
        end
      )::real as skeleton_score,

      -- Layer 3: English Phonetic Match via dmetaphone (e.g. sneekers == sneakers, jaket == jacket, tshrt == tshirt)
      (
        case
          when cardinality(v_en_tokens) > 0 and exists (
            select 1
            from unnest(v_en_tokens) as qtok
            join regexp_split_to_table(e.n_en || ' ' || regexp_replace(e.raw_en, '[^a-z0-9\s]+', ' ', 'g'), '\s+') as ptok
              on length(ptok) >= 2
            where length(qtok) >= 3
              and dmetaphone(qtok) <> ''
              and (
                dmetaphone(ptok) = dmetaphone(qtok)
                or (dmetaphone_alt(ptok) <> '' and dmetaphone_alt(ptok) = dmetaphone(qtok))
              )
          ) then 6.8
          when cardinality(v_en_tokens) > 0 and exists (
            select 1
            from unnest(v_en_tokens) as qtok
            join regexp_split_to_table(e.d_en || ' ' || e.extra_en || ' ' || regexp_replace(e.raw_extra_en, '[^a-z0-9\s]+', ' ', 'g'), '\s+') as ptok
              on length(ptok) >= 3
            where length(qtok) >= 3
              and dmetaphone(qtok) <> ''
              and dmetaphone(ptok) = dmetaphone(qtok)
          ) then 4.2
          else 0.0
        end
      )::real as phonetic_score,

      -- Layer 4: Fuzzy Typo Tolerance (pg_trgm word_similarity >= 0.15 + token levenshtein <= 2)
      (
        case
          when cardinality(v_en_tokens) > 0 and exists (
            select 1
            from unnest(v_en_tokens) as qtok
            join regexp_split_to_table(e.n_en || ' ' || regexp_replace(e.raw_en, '[^a-z0-9\s]+', ' ', 'g'), '\s+') as ptok
              on length(ptok) between 3 and 40
            where length(qtok) between 3 and 40
              and levenshtein(qtok, ptok) <= (case when length(qtok) <= 4 then 1 else 2 end)
          ) then 5.5
          when cardinality(v_ar_tokens) > 0 and exists (
            select 1
            from unnest(v_ar_tokens) as qtok
            join regexp_split_to_table(e.n_ar, '\s+') as ptok
              on length(ptok) between 3 and 40
            where length(qtok) between 3 and 40
              and levenshtein(qtok, ptok) <= (case when length(qtok) <= 4 then 1 else 2 end)
          ) then 5.5
          when cardinality(v_en_tokens) > 0 and exists (
            select 1
            from unnest(v_en_tokens) as qtok
            join regexp_split_to_table(e.d_en || ' ' || e.extra_en || ' ' || regexp_replace(e.raw_extra_en, '[^a-z0-9\s]+', ' ', 'g'), '\s+') as ptok
              on length(ptok) between 4 and 40
            where length(qtok) between 4 and 40
              and levenshtein(qtok, ptok) <= (case when length(qtok) <= 5 then 1 else 2 end)
          ) then 3.2
          when cardinality(v_ar_tokens) > 0 and exists (
            select 1
            from unnest(v_ar_tokens) as qtok
            join regexp_split_to_table(e.d_ar || ' ' || e.extra_ar, '\s+') as ptok
              on length(ptok) between 4 and 40
            where length(qtok) between 4 and 40
              and levenshtein(qtok, ptok) <= (case when length(qtok) <= 5 then 1 else 2 end)
          ) then 3.2
          else 0.0
        end
      )::real as lev_score,

      greatest(
        case when v_has_ar and length(v_ar_q) >= 2 then word_similarity(v_ar_q, e.n_ar) else 0.0 end,
        case when v_has_en and length(v_en_q) >= 2 then word_similarity(v_en_q, e.n_en) else 0.0 end
      )::real as title_trgm,

      greatest(
        case when v_has_ar and length(v_ar_q) >= 2 then word_similarity(v_ar_q, e.d_ar || ' ' || e.extra_ar) else 0.0 end,
        case when v_has_en and length(v_en_q) >= 2 then word_similarity(v_en_q, e.d_en || ' ' || e.extra_en) else 0.0 end
      )::real as body_trgm
    from enriched e
  )
  select
    s.id,
    s.name,
    s.name_en,
    s.category_id,
    s.description,
    s.description_en,
    s.price,
    s.old_price,
    s.stock,
    s.sizes,
    s.colors,
    s.image_path,
    s.specifications,
    (
      s.exact_score
      + s.skeleton_score
      + s.phonetic_score
      + s.lev_score
      + (s.title_trgm * 2.5)
      + (s.body_trgm * 1.0)
    )::real as rank,
    (
      case
        when s.exact_score >= 8.0 then 'exact'
        when s.exact_score >= 4.0 then 'spec'
        when s.skeleton_score > 0.0 then 'skeleton'
        when s.phonetic_score > 0.0 then 'phonetic'
        else 'fuzzy'
      end
    )::text as match_type
  from scored s
  where s.exact_score > 0.0
     or s.skeleton_score > 0.0
     or s.phonetic_score > 0.0
     or s.lev_score > 0.0
     or s.title_trgm >= 0.15
     or s.body_trgm >= 0.25
  order by rank desc, s.name asc
  limit v_limit;
end $$;

revoke all on function public.search_products_fast(uuid, text, int, uuid) from public;
grant execute on function public.search_products_fast(uuid, text, int, uuid) to anon, authenticated;

grant execute on function
  public.normalize_arabic_text(text),
  public.arabic_consonant_skeleton(text),
  public.normalize_english_text(text),
  public.product_specs_text(jsonb)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
