-- ============================================================================
-- Phase 14B: UX Refinements — Search Synonym Granularity & Precision Ranking
-- 1. Splits overly broad global synonym buckets (`watches_accessories` and
--    `bags_wallets`) into focused sub-groups (`watches`, `sunglasses`,
--    `accessories`, `bags`, `wallets`) while preserving Arabic dialect
--    synonyms (`كوتشي`/`جزمة`, `تيشيرت`/`تشرت`, etc.).
-- 2. Refines `public.search_products_fast` so category-only matches from
--    combined categories (e.g. "ساعات وإكسسوارات") do not dilute results when
--    direct product title or title-synonym matches already exist (e.g.
--    searching "ساعة" returns watches only, never sunglasses).
-- Strictly idempotent and safe to re-run.
-- ============================================================================

begin;

-- 1. Remove overly broad legacy global buckets that mixed unrelated product types
delete from public.search_synonyms
where store_id is null
  and category_tag in ('watches_accessories', 'bags_wallets');

-- 2. Upsert focused global synonym buckets
insert into public.search_synonyms (store_id, category_tag, terms)
values
  (
    null,
    'watches',
    array[
      'ساعه','ساعات','سمارت واتش','ساعه يد','ساعه ذكيه','كرونوغراف',
      'watch','watches','smartwatch','timepiece','chronograph'
    ]
  ),
  (
    null,
    'sunglasses',
    array[
      'نظاره','نضاره','نظارات','نضارات','نظاره شمس','نظاره شمسيه','نضاره شمس','شمسيه',
      'sunglasses','glasses','eyewear','shades'
    ]
  ),
  (
    null,
    'accessories',
    array[
      'حزام','احزمه','كاب','طاقيه','ايس كاب','اسوره','اساور','سلسله','سلاسل',
      'خاتم','خواتم','حلق','اكسسوار','اكسسوارات',
      'belt','belts','cap','hat','beanie','bracelet','necklace','ring','jewelry','accessories'
    ]
  ),
  (
    null,
    'bags',
    array[
      'شنطه','شنط','حقيبه','حقائب','باج','باك باج','ضهر','كروس','توت','كلاتش',
      'bag','bags','backpack','crossbody','handbag','clutch','luggage','tote'
    ]
  ),
  (
    null,
    'wallets',
    array[
      'محفظه','محافظ','بوك','حافظه كروت','كارد هولدر',
      'wallet','wallets','purse','cardholder'
    ]
  )
on conflict (category_tag) where store_id is null
do update set terms = excluded.terms;

-- 3. Refine search_products_fast so category-only synonym/token overlap never
--    dilutes specific item searches when direct title/title-synonym hits exist.
create or replace function public.search_products_fast(
  p_store_id uuid,
  p_query text,
  p_limit int default 10,
  p_category_id uuid default null,
  p_offset int default 0
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
set search_path = public, pg_temp
as $$
declare
  v_raw text := trim(coalesce(p_query, ''));
  v_ar_q text := public.normalize_arabic_text(v_raw);
  v_en_q text := public.normalize_english_text(v_raw);
  v_en_split_q text := trim(regexp_replace(lower(v_raw), '[^a-z0-9\s]+', ' ', 'g'));
  v_has_ar boolean := (v_ar_q ~ '[\u0600-\u06FF]');
  v_has_en boolean := (v_en_q ~ '[a-z0-9]');
  v_limit int := greatest(1, least(coalesce(p_limit, 10), 60));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_like_ar text;
  v_like_en text;
  v_like_en_split text;
  v_ar_tokens text[];
  v_ar_tokens_long text[];
  v_en_tokens text[];
  v_en_tokens_long text[];
  v_syn_ar_terms text[] := '{}';
  v_syn_en_terms text[] := '{}';
  v_stage1_text_patterns text[] := '{}';
  v_stage1_skel_patterns text[] := '{}';
  v_total_query_tokens int := 0;
begin
  if p_store_id is null or length(v_raw) = 0 then
    return;
  end if;

  v_like_ar := '%' || replace(replace(replace(v_ar_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_like_en := '%' || replace(replace(replace(v_en_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_like_en_split := '%' || replace(replace(replace(v_en_split_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(array_agg(distinct tok), '{}')
  into v_ar_tokens
  from (
    select public.strip_arabic_al(tok) as tok
    from regexp_split_to_table(v_ar_q, '\s+') as tok
    where tok ~ '[\u0600-\u06FF]' and length(tok) >= 2
  ) t
  where length(tok) >= 2;

  select coalesce(array_agg(distinct tok), '{}')
  into v_ar_tokens_long
  from unnest(v_ar_tokens) as tok
  where length(tok) >= 4;

  select coalesce(array_agg(distinct tok), '{}')
  into v_en_tokens
  from regexp_split_to_table(v_en_q, '\s+') as tok
  where tok ~ '^[a-z0-9]+$' and length(tok) >= 2;

  select coalesce(array_agg(distinct tok), '{}')
  into v_en_tokens_long
  from unnest(v_en_tokens) as tok
  where length(tok) >= 4;

  v_total_query_tokens := cardinality(v_ar_tokens) + cardinality(v_en_tokens);

  with matched_groups as (
    select ss.terms
    from public.search_synonyms ss
    where (ss.store_id is null or ss.store_id = p_store_id)
      and exists (
        select 1
        from unnest(ss.terms) as raw_term
        cross join lateral (
          select
            public.strip_arabic_al(public.normalize_arabic_text(raw_term)) as t_ar,
            public.normalize_english_text(raw_term) as t_en
        ) nt
        where
          (v_has_ar and nt.t_ar <> '' and (
            nt.t_ar = v_ar_q
            or nt.t_ar = public.strip_arabic_al(v_ar_q)
            or nt.t_ar = any(v_ar_tokens)
          ))
          or (v_has_en and nt.t_en <> '' and (
            nt.t_en = v_en_q
            or nt.t_en = any(v_en_tokens)
          ))
          or (
            v_has_ar and cardinality(v_ar_tokens_long) > 0
            and nt.t_ar ~ '^[\u0600-\u06FF]+$'
            and length(nt.t_ar) >= 4
            and exists (
              select 1
              from unnest(v_ar_tokens_long) as qtok
              where left(qtok, 1) = left(nt.t_ar, 1)
                and abs(length(qtok) - length(nt.t_ar)) <= 2
                and length(public.arabic_consonant_skeleton(qtok)) >= 3
                and public.arabic_consonant_skeleton(qtok) = public.arabic_consonant_skeleton(nt.t_ar)
            )
          )
          or (
            v_has_en and cardinality(v_en_tokens_long) > 0
            and nt.t_en ~ '^[a-z0-9]+$'
            and length(nt.t_en) >= 4
            and exists (
              select 1
              from unnest(v_en_tokens_long) as qtok
              where levenshtein(qtok, nt.t_en) <= 1
            )
          )
      )
  ),
  expanded_terms as (
    select distinct
      public.strip_arabic_al(public.normalize_arabic_text(term)) as t_ar,
      public.normalize_english_text(term) as t_en
    from matched_groups mg,
         unnest(mg.terms) as term
  )
  select
    coalesce(array_agg(distinct t_ar) filter (where t_ar ~ '[\u0600-\u06FF]' and length(t_ar) >= 2), '{}'),
    coalesce(array_agg(distinct t_en) filter (where t_en ~ '^[a-z0-9 ]+$' and length(t_en) >= 2), '{}')
  into v_syn_ar_terms, v_syn_en_terms
  from expanded_terms;

  select coalesce(array_agg(distinct '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
  into v_stage1_text_patterns
  from (
    select v_ar_q as term where v_has_ar and length(v_ar_q) >= 2
    union
    select v_en_q as term where v_has_en and length(v_en_q) >= 2
    union
    select v_en_split_q as term where v_has_en and length(v_en_split_q) >= 3
    union
    select tok as term from unnest(v_ar_tokens) as tok where length(tok) >= 3
    union
    select tok as term from unnest(v_en_tokens) as tok where length(tok) >= 3
    union
    select term from unnest(v_syn_ar_terms) as term where length(term) >= 3
    union
    select term from unnest(v_syn_en_terms) as term where length(term) >= 3
  ) s;

  select coalesce(array_agg(distinct '%' || replace(replace(replace(code, '\', '\\'), '%', '\%'), '_', '\_') || '%'), '{}')
  into v_stage1_skel_patterns
  from (
    select public.arabic_consonant_skeleton(qtok) as code
    from unnest(v_ar_tokens_long) as qtok
    where length(public.arabic_consonant_skeleton(qtok)) >= 3
    union
    select lower(dmetaphone(qtok)) as code
    from unnest(v_en_tokens_long) as qtok
    where dmetaphone(qtok) <> '' and length(dmetaphone(qtok)) >= 3
    union
    select lower(dmetaphone_alt(qtok)) as code
    from unnest(v_en_tokens_long) as qtok
    where dmetaphone_alt(qtok) <> '' and length(dmetaphone_alt(qtok)) >= 3
  ) sk;

  return query
  with stage1_candidates as materialized (
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
      p.search_text_norm,
      p.search_skeleton_norm
    from public.products p
    where p.store_id = p_store_id
      and p.is_active = true
      and (p_category_id is null or p.category_id = p_category_id)
      and (
        (cardinality(v_stage1_text_patterns) > 0 and p.search_text_norm like any (v_stage1_text_patterns))
        or (cardinality(v_stage1_skel_patterns) > 0 and p.search_skeleton_norm like any (v_stage1_skel_patterns))
        or (v_has_ar and length(v_ar_q) >= 3 and (p.search_text_norm % v_ar_q or v_ar_q <% p.search_text_norm))
        or (v_has_en and length(v_en_q) >= 3 and (p.search_text_norm % v_en_q or v_en_q <% p.search_text_norm))
      )
    order by
      greatest(
        case when v_has_ar and length(v_ar_q) >= 3 then word_similarity(v_ar_q, p.search_text_norm) else 0.0 end,
        case when v_has_en and length(v_en_q) >= 3 then word_similarity(v_en_q, p.search_text_norm) else 0.0 end
      ) desc,
      p.id asc
    limit 150
  ),
  stage2_joined as (
    select
      s1.id,
      s1.name,
      s1.name_en,
      s1.category_id,
      s1.description,
      s1.description_en,
      s1.price,
      s1.old_price,
      s1.stock,
      s1.sizes,
      s1.colors,
      s1.image_path,
      s1.specifications,
      public.normalize_arabic_text(s1.name) as n_ar,
      public.normalize_english_text(s1.name_en) as n_en,
      lower(coalesce(s1.name_en, '')) as raw_en,
      public.normalize_arabic_text(coalesce(c.name, '')) as cat_ar,
      public.normalize_english_text(coalesce(c.name_en, '')) as cat_en,
      public.normalize_arabic_text(s1.description) as d_ar,
      public.normalize_english_text(s1.description_en) as d_en,
      public.product_specs_text(s1.specifications) as s_raw,
      array_to_string(coalesce(s1.colors, '{}') || coalesce(s1.sizes, '{}'), ' ') as o_raw
    from stage1_candidates s1
    left join public.categories c on c.id = s1.category_id
  ),
  enriched as (
    select
      c.*,
      public.normalize_arabic_text(c.s_raw || ' ' || c.o_raw) as extra_ar,
      public.normalize_english_text(c.s_raw || ' ' || c.o_raw) as extra_en,
      lower(coalesce(c.d_en, '') || ' ' || coalesce(c.s_raw, '') || ' ' || coalesce(c.o_raw, '')) as raw_extra_en,
      (
        select coalesce(array_agg(distinct public.strip_arabic_al(tok)), '{}')
        from regexp_split_to_table(c.n_ar, '\s+') as tok
        where length(tok) >= 2
      ) as n_ar_tokens,
      (
        select coalesce(array_agg(distinct tok), '{}')
        from regexp_split_to_table(c.n_en || ' ' || regexp_replace(c.raw_en, '[^a-z0-9\s]+', ' ', 'g'), '\s+') as tok
        where length(tok) >= 2
      ) as n_en_tokens,
      (
        select coalesce(array_agg(distinct public.strip_arabic_al(tok)), '{}')
        from regexp_split_to_table(c.cat_ar, '\s+') as tok
        where length(tok) >= 2
      ) as cat_ar_tokens,
      (
        select coalesce(array_agg(distinct tok), '{}')
        from regexp_split_to_table(c.cat_en, '\s+') as tok
        where length(tok) >= 2
      ) as cat_en_tokens
    from stage2_joined c
  ),
  scored as (
    select
      e.*,
      -- Direct product-name exact/prefix match
      (
        case
          when (v_has_ar and length(v_ar_q) >= 2 and (e.n_ar = v_ar_q or e.n_ar like v_ar_q || '%'))
            or (v_has_en and length(v_en_q) >= 2 and (e.n_en = v_en_q or e.n_en like v_en_q || '%'))
          then 100.0
          when (v_has_ar and length(v_ar_q) >= 2 and (
              v_ar_q = any(e.n_ar_tokens)
              or public.strip_arabic_al(v_ar_q) = any(e.n_ar_tokens)
              or (length(v_ar_q) >= 3 and e.n_ar like v_like_ar)
            ))
            or (v_has_en and length(v_en_q) >= 2 and (
              v_en_q = any(e.n_en_tokens)
              or (length(v_en_q) >= 3 and (e.n_en like v_like_en or e.raw_en like v_like_en_split))
            ))
          then 88.0
          else 0.0
        end
      )::real as name_exact_score,

      -- Category exact/token match
      (
        case
          when (v_has_ar and length(v_ar_q) >= 2 and (
              e.cat_ar = v_ar_q
              or public.strip_arabic_al(v_ar_q) = any(e.cat_ar_tokens)
              or (length(v_ar_q) >= 3 and e.cat_ar like v_like_ar)
            ))
            or (v_has_en and length(v_en_q) >= 2 and (
              e.cat_en = v_en_q
              or v_en_q = any(e.cat_en_tokens)
              or (length(v_en_q) >= 3 and e.cat_en like v_like_en)
            ))
          then 72.0
          else 0.0
        end
      )::real as cat_exact_score,

      -- Multi-token match bonus when 2+ query tokens match title/category tokens
      (
        case
          when v_total_query_tokens >= 2 then (
            (
              select count(*)::real * 14.0
              from unnest(v_ar_tokens) as qtok
              where qtok = any(e.n_ar_tokens) or qtok = any(e.cat_ar_tokens)
            ) + (
              select count(*)::real * 14.0
              from unnest(v_en_tokens) as qtok
              where qtok = any(e.n_en_tokens) or qtok = any(e.cat_en_tokens)
            )
          )
          else 0.0
        end
      )::real as multi_token_bonus,

      -- Exact/Normalized Specs, Options & Description Match ONLY
      (
        case
          when (v_has_ar and length(v_ar_q) >= 3 and e.extra_ar like v_like_ar)
            or (v_has_en and length(v_en_q) >= 3 and (e.extra_en like v_like_en or e.raw_extra_en like v_like_en_split))
          then 62.0
          when (v_has_ar and length(v_ar_q) >= 3 and e.d_ar like v_like_ar)
            or (v_has_en and length(v_en_q) >= 3 and e.d_en like v_like_en)
          then 52.0
          else 0.0
        end
      )::real as spec_desc_exact_score,

      -- Synonym match on product name
      (
        case
          when (
            cardinality(v_syn_ar_terms) > 0 and exists (
              select 1
              from unnest(v_syn_ar_terms) as sterm
              where sterm = any(e.n_ar_tokens)
                 or (position(' ' in sterm) > 0 and (' ' || e.n_ar || ' ') like ('% ' || sterm || ' %'))
            )
          ) or (
            cardinality(v_syn_en_terms) > 0 and exists (
              select 1
              from unnest(v_syn_en_terms) as sterm
              where sterm = any(e.n_en_tokens)
                 or (position(' ' in sterm) > 0 and (' ' || e.n_en || ' ') like ('% ' || sterm || ' %'))
            )
          )
          then 68.0
          else 0.0
        end
      )::real as name_synonym_score,

      -- Synonym match on category name
      (
        case
          when (
            cardinality(v_syn_ar_terms) > 0 and exists (
              select 1
              from unnest(v_syn_ar_terms) as sterm
              where sterm = any(e.cat_ar_tokens)
                 or (position(' ' in sterm) > 0 and (' ' || e.cat_ar || ' ') like ('% ' || sterm || ' %'))
            )
          ) or (
            cardinality(v_syn_en_terms) > 0 and exists (
              select 1
              from unnest(v_syn_en_terms) as sterm
              where sterm = any(e.cat_en_tokens)
                 or (position(' ' in sterm) > 0 and (' ' || e.cat_en || ' ') like ('% ' || sterm || ' %'))
            )
          )
          then 60.0
          else 0.0
        end
      )::real as cat_synonym_score,

      -- Strict Arabic Consonant Skeleton
      (
        case
          when cardinality(v_ar_tokens_long) > 0 and exists (
            select 1
            from unnest(v_ar_tokens_long) as qtok
            join unnest(e.n_ar_tokens) as ptok on length(ptok) >= 4
            where left(qtok, 1) = left(ptok, 1)
              and abs(length(qtok) - length(ptok)) <= 2
              and length(public.arabic_consonant_skeleton(qtok)) >= 3
              and public.arabic_consonant_skeleton(qtok) = public.arabic_consonant_skeleton(ptok)
          ) then 76.0
          when cardinality(v_ar_tokens_long) > 0 and exists (
            select 1
            from unnest(v_ar_tokens_long) as qtok
            join unnest(e.cat_ar_tokens) as ptok on length(ptok) >= 4
            where left(qtok, 1) = left(ptok, 1)
              and abs(length(qtok) - length(ptok)) <= 2
              and length(public.arabic_consonant_skeleton(qtok)) >= 3
              and public.arabic_consonant_skeleton(qtok) = public.arabic_consonant_skeleton(ptok)
          ) then 60.0
          else 0.0
        end
      )::real as skeleton_score,

      -- English Phonetic Match via dmetaphone
      (
        case
          when cardinality(v_en_tokens_long) > 0 and exists (
            select 1
            from unnest(v_en_tokens_long) as qtok
            join unnest(e.n_en_tokens) as ptok on length(ptok) >= 4
            where dmetaphone(qtok) <> ''
              and abs(length(qtok) - length(ptok)) <= 2
              and levenshtein(qtok, ptok) <= 2
              and (
                dmetaphone(ptok) = dmetaphone(qtok)
                or (dmetaphone_alt(ptok) <> '' and dmetaphone_alt(ptok) = dmetaphone(qtok))
              )
          ) then 72.0
          when cardinality(v_en_tokens_long) > 0 and exists (
            select 1
            from unnest(v_en_tokens_long) as qtok
            join unnest(e.cat_en_tokens) as ptok on length(ptok) >= 4
            where dmetaphone(qtok) <> ''
              and abs(length(qtok) - length(ptok)) <= 2
              and levenshtein(qtok, ptok) <= 2
              and dmetaphone(ptok) = dmetaphone(qtok)
          ) then 58.0
          else 0.0
        end
      )::real as phonetic_score,

      -- Tight Fuzzy Typo Tolerance
      (
        case
          when cardinality(v_en_tokens_long) > 0 and exists (
            select 1
            from unnest(v_en_tokens_long) as qtok
            join unnest(e.n_en_tokens) as ptok on length(ptok) between 4 and 40
            where length(qtok) <= 40
              and levenshtein(qtok, ptok) <= 1
          ) then 48.0
          when cardinality(v_ar_tokens_long) > 0 and exists (
            select 1
            from unnest(v_ar_tokens_long) as qtok
            join unnest(e.n_ar_tokens) as ptok on length(ptok) between 4 and 40
            where length(qtok) <= 40
              and levenshtein(qtok, ptok) <= 1
          ) then 48.0
          when cardinality(v_en_tokens_long) > 0 and exists (
            select 1
            from unnest(v_en_tokens_long) as qtok
            join unnest(e.cat_en_tokens) as ptok on length(ptok) between 4 and 40
            where length(qtok) <= 40
              and levenshtein(qtok, ptok) <= 1
          ) then 38.0
          when cardinality(v_ar_tokens_long) > 0 and exists (
            select 1
            from unnest(v_ar_tokens_long) as qtok
            join unnest(e.cat_ar_tokens) as ptok on length(ptok) between 4 and 40
            where length(qtok) <= 40
              and levenshtein(qtok, ptok) <= 1
          ) then 38.0
          else 0.0
        end
      )::real as lev_score,

      -- Tight pg_trgm word_similarity >= 0.35 on Name & Category
      greatest(
        case when v_has_ar and length(v_ar_q) >= 3 then word_similarity(v_ar_q, e.n_ar) else 0.0 end,
        case when v_has_en and length(v_en_q) >= 3 then word_similarity(v_en_q, e.n_en) else 0.0 end,
        case when v_has_ar and length(v_ar_q) >= 3 then word_similarity(v_ar_q, e.cat_ar) * 0.9 else 0.0 end,
        case when v_has_en and length(v_en_q) >= 3 then word_similarity(v_en_q, e.cat_en) * 0.9 else 0.0 end
      )::real as title_trgm
    from enriched e
  ),
  ranked as (
    select
      s.*,
      (s.name_exact_score + s.cat_exact_score)::real as title_cat_exact_score,
      (s.name_synonym_score + s.cat_synonym_score)::real as synonym_score,
      (
        s.name_exact_score > 0
        or s.name_synonym_score > 0
        or s.spec_desc_exact_score > 0
        or s.skeleton_score >= 70.0
        or s.phonetic_score >= 70.0
        or s.lev_score >= 45.0
      ) as has_product_match,
      (
        s.name_exact_score
        + s.cat_exact_score
        + s.multi_token_bonus
        + s.spec_desc_exact_score
        + s.name_synonym_score
        + s.cat_synonym_score
        + s.skeleton_score
        + s.phonetic_score
        + s.lev_score
        + (case when s.title_trgm >= 0.35 then s.title_trgm * 55.0 else 0.0 end)
      )::real as total_score
    from scored s
  ),
  filtered as (
    select
      r.*,
      max(r.total_score) over () as best_score,
      bool_or(r.name_exact_score > 0 or r.name_synonym_score > 0) over () as any_direct_name_hit
    from ranked r
    where r.total_score >= 25.0
  )
  select
    f.id,
    f.name,
    f.name_en,
    f.category_id,
    f.description,
    f.description_en,
    f.price,
    f.old_price,
    f.stock,
    f.sizes,
    f.colors,
    f.image_path,
    f.specifications,
    f.total_score::real as rank,
    (
      case
        when f.title_cat_exact_score >= 70.0 then 'exact'
        when f.spec_desc_exact_score >= 50.0 and f.synonym_score = 0.0 and f.skeleton_score = 0.0 and f.phonetic_score = 0.0 then 'spec'
        when f.skeleton_score >= 60.0 then 'skeleton'
        when f.phonetic_score >= 58.0 then 'phonetic'
        when f.synonym_score >= 60.0 then 'synonym'
        else 'fuzzy'
      end
    )::text as match_type
  from filtered f
  where (f.best_score < 60.0 or f.total_score >= 40.0)
    and (
      not f.any_direct_name_hit
      or f.has_product_match
    )
  order by f.total_score desc, f.name asc
  limit v_limit
  offset v_offset;
end $$;

revoke all on function public.search_products_fast(uuid, text, int, uuid, int) from public;
grant execute on function public.search_products_fast(uuid, text, int, uuid, int) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
