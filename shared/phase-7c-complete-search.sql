-- Phase 7c: High-Precision Bilingual Smart Search + 15-Category Synonym Dictionary + Category Matching
-- Eliminates false positives via stricter pg_trgm (0.35), token-length >= 4 skeleton/levenshtein <= 1
-- restricted strictly to product name/name_en/category (never descriptions/specs), strict score cutoffs
-- (>= 25 minimum; suppress < 40 when high-confidence >= 60 exists), and 15 bilingual/Egyptian synonym groups.
-- Apply after phase-7b-smart-search.sql. Idempotent and safe to re-run.
begin;

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- 1. Helper to strip Arabic definite article "ال" from tokens of length >= 5
create or replace function public.strip_arabic_al(p_token text)
returns text
language sql
immutable
parallel safe as $$
  select case
    when p_token is not null and length(p_token) >= 5 and left(p_token, 2) = 'ال'
      then substr(p_token, 3)
    else coalesce(p_token, '')
  end
$$;

-- 2. Multi-tenant + Global Platform Search Synonyms Table
--    store_id IS NULL => global platform synonyms available to all stores.
--    store_id NOT NULL => tenant-specific custom synonyms.
create table if not exists public.search_synonyms (
  id uuid primary key default gen_random_uuid(),
  store_id uuid null references public.store_settings(store_id) on delete cascade,
  terms text[] not null check (cardinality(terms) > 0),
  category_tag text,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_synonyms_terms_gin
  on public.search_synonyms using gin (terms);

create index if not exists idx_search_synonyms_store_idx
  on public.search_synonyms (store_id);

create unique index if not exists idx_search_synonyms_global_tag_uidx
  on public.search_synonyms (category_tag)
  where store_id is null;

alter table public.search_synonyms enable row level security;

drop policy if exists "Public can read global or store search synonyms" on public.search_synonyms;
create policy "Public can read global or store search synonyms"
  on public.search_synonyms
  for select
  to anon, authenticated
  using (
    store_id is null
    or exists (
      select 1
      from public.store_settings ss
      where ss.store_id = search_synonyms.store_id
    )
  );

drop policy if exists "Store admins can manage store search synonyms" on public.search_synonyms;
create policy "Store admins can manage store search synonyms"
  on public.search_synonyms
  for all
  to authenticated
  using (
    store_id is not null
    and (select public.is_store_admin(store_id))
  )
  with check (
    store_id is not null
    and (select public.is_store_admin(store_id))
  );

-- 3. Seed 15 Comprehensive Bilingual & Egyptian Dialect Synonym Groups (Global: store_id = NULL)
insert into public.search_synonyms (store_id, category_tag, terms)
values
  (
    null,
    'footwear',
    array['حذاء','احذيه','كوتشي','كوتشيات','جزمه','جزم','سنيكرز','شوز','شبشب','صندل','بوت','هاف بوت','لوفر','shoe','shoes','sneaker','sneakers','boots','sandals','slippers','loafers','footwear']
  ),
  (
    null,
    'tops_shirts',
    array['تيشيرت','تيشرت','تشرت','قميص','قمصان','بلوزه','بولو','توب','تانك','كت','tshirt','t-shirt','shirt','polo','blouse','top','tank']
  ),
  (
    null,
    'outerwear_winter',
    array['جاكيت','جواكت','هودي','سويت شيرت','بلوفر','كارديجان','معطف','بالطو','بليزر','فيست','jacket','hoodie','sweatshirt','pullover','sweater','cardigan','coat','blazer','vest']
  ),
  (
    null,
    'pants_sets',
    array['بنطلون','بناطيل','جينز','جبردين','سويت بانتس','شورت','برمودا','ليجن','جيبه','تنوره','فستان','عبايه','طقم','ترينج','pants','trousers','jeans','chinos','sweatpants','joggers','shorts','skirt','dress','abaya','tracksuit']
  ),
  (
    null,
    'bags_wallets',
    array['شنطه','شنط','حقيبه','حقائب','باج','باك باج','ضهر','كروس','محفظه','بوك','كلاتش','bag','backpack','crossbody','handbag','wallet','purse','clutch','luggage','tote']
  ),
  (
    null,
    'watches_accessories',
    array['ساعه','ساعات','سمارت واتش','نظاره','نضاره','حزام','كاب','طاقيه','ايس كاب','اسوره','سلسله','خاتم','حلق','اكسسوار','watch','smartwatch','sunglasses','glasses','belt','cap','hat','beanie','bracelet','necklace','ring','accessories']
  ),
  (
    null,
    'mobile_tablets',
    array['موبايل','موبايلات','تليفون','هاتف','جوال','ايفون','سامسونج','شاومي','تابلت','ايباد','شاحن','كابل','سلك','باور بانك','جراب','كفر','اسكرينه','حامل','phone','mobile','smartphone','iphone','tablet','ipad','charger','cable','powerbank','case','cover','screen protector']
  ),
  (
    null,
    'audio',
    array['سماعه','سماعات','ايربودز','هيدفون','بلوتوث','سبيكر','مكبر صوت','مايك','ميكروفون','headphone','headphones','earbuds','airpods','headset','bluetooth','speaker','mic','microphone']
  ),
  (
    null,
    'computers_gaming',
    array['لابتوب','لاب','كمبيوتر','بي سي','شاشه','مونيتور','كيبورد','لوحه مفاتيح','ماوس','فاره','هارد','فلاشه','راوتر','دراع','بلايستيشن','اكس بوكس','جيمنج','laptop','computer','pc','monitor','keyboard','mouse','ssd','flash','router','controller','playstation','gaming']
  ),
  (
    null,
    'home_kitchen',
    array['خلاط','كبه','محضر طعام','ميكروويف','فرن','بوتاجاز','اير فراير','قلايه','كاتل','غلايه','ماكينه قهوه','اسبريسو','مكنسه','مكواه','تكييف','مروحه','دفايه','سخان','غساله','ثلاجه','تلاجه','blender','mixer','microwave','oven','stove','air fryer','kettle','coffee maker','espresso','vacuum','iron','ac','fan','heater','washer','fridge']
  ),
  (
    null,
    'home_decor_bedding',
    array['طقم سرير','ملايه','لحاف','بطانيه','مخده','وساده','فوطه','بشكير','ستاره','ستاير','سجاده','مشايه','لمبه','اضاءه','اباجوره','نجفه','ترابيزه','طاوله','كرسي','كنبه','ديكور','فازه','برواز','bedsheet','comforter','blanket','pillow','towel','curtain','rug','carpet','lamp','lighting','table','chair','sofa','decor']
  ),
  (
    null,
    'perfumes_care',
    array['برفان','برفيوم','عطر','عطور','معطر','مزيل عرق','سبراي','كريم','مرطب','غسول','سيروم','شامبو','بلسم','زيت شعر','ماكينه حلاقه','سشوار','بيبي ليس','مكواه شعر','ميك اب','روج','مسكره','perfume','fragrance','cologne','deodorant','spray','cream','moisturizer','cleanser','serum','shampoo','conditioner','hair oil','trimmer','shaver','hair dryer','straightener','makeup']
  ),
  (
    null,
    'sports_fitness',
    array['جيم','رياضه','دمبل','دامبلز','عقله','مشايه','عجله','مات','سجاده يوجا','حبل','زجاجه مياه','زمزميه','شيكر','بروتين','كرياتين','جوانتي','gym','fitness','dumbbell','treadmill','yoga mat','jump rope','bottle','shaker','protein','gloves']
  ),
  (
    null,
    'kids_baby',
    array['اطفال','بيبي','لعبه','العاب','عروسه','عربيه','بازل','مكعبات','ليجو','سترولر','بامبرز','حفاضات','kids','baby','toy','toys','puzzle','blocks','lego','stroller','diapers']
  ),
  (
    null,
    'automotive',
    array['عربيه','سياره','سيارات','كاوتش','طاره','دواسات','فواحه','شاحن عربيه','هولدر','منفاخ','مكنسه عربيه','غطاء عربيه','لمبه ليد','car','auto','automotive','car charger','car holder','car vacuum','car cover','tire inflator','led']
  )
on conflict (category_tag) where store_id is null
do update set terms = excluded.terms;

-- 4. GIN trigram indexes on normalized category names for fast category matching
create index if not exists idx_categories_name_norm_trgm
  on public.categories using gin (public.normalize_arabic_text(name) gin_trgm_ops);

create index if not exists idx_categories_name_en_norm_trgm
  on public.categories using gin (public.normalize_english_text(name_en) gin_trgm_ops);

-- 5. Upgraded High-Precision search_products_fast RPC (strictly store_id scoped)
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
  v_en_q text := public.normalize_english_text(v_raw);
  v_en_split_q text := trim(regexp_replace(lower(v_raw), '[^a-z0-9\s]+', ' ', 'g'));
  v_has_ar boolean := v_raw ~ '[\u0600-\u06FF]';
  v_has_en boolean := v_raw ~ '[a-zA-Z0-9]';
  v_like_ar text;
  v_like_en text;
  v_like_en_split text;
  v_ar_tokens text[];
  v_ar_tokens_long text[];
  v_en_tokens text[];
  v_en_tokens_long text[];
  v_syn_ar_terms text[] := '{}';
  v_syn_en_terms text[] := '{}';
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

  -- Expand matching synonym groups (global store_id IS NULL or tenant-specific store_id = p_store_id)
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
          -- Exact normalized Arabic phrase or token match
          (v_has_ar and nt.t_ar <> '' and (
            nt.t_ar = v_ar_q
            or nt.t_ar = public.strip_arabic_al(v_ar_q)
            or nt.t_ar = any(v_ar_tokens)
          ))
          -- Exact normalized English phrase or token match
          or (v_has_en and nt.t_en <> '' and (
            nt.t_en = v_en_q
            or nt.t_en = any(v_en_tokens)
          ))
          -- Tight Arabic consonant skeleton synonym match ONLY for tokens >= 4 chars with same initial letter
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
          -- Tight English levenshtein <= 1 synonym match ONLY for tokens >= 4 chars (e.g. tshrt->tshirt, sneekers->sneakers, jaket->jacket)
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
      public.normalize_arabic_text(p.name) as n_ar,
      public.normalize_english_text(p.name_en) as n_en,
      lower(coalesce(p.name_en, '')) as raw_en,
      public.normalize_arabic_text(coalesce(c.name, '')) as cat_ar,
      public.normalize_english_text(coalesce(c.name_en, '')) as cat_en,
      public.normalize_arabic_text(p.description) as d_ar,
      public.normalize_english_text(p.description_en) as d_en,
      public.product_specs_text(p.specifications) as s_raw,
      array_to_string(coalesce(p.colors, '{}') || coalesce(p.sizes, '{}'), ' ') as o_raw
    from public.products p
    left join public.categories c on c.id = p.category_id
    where p.store_id = p_store_id
      and p.is_active = true
      and (p_category_id is null or p.category_id = p_category_id)
  ),
  enriched as (
    select
      c.*,
      public.normalize_arabic_text(c.s_raw || ' ' || c.o_raw) as extra_ar,
      public.normalize_english_text(c.s_raw || ' ' || c.o_raw) as extra_en,
      lower(coalesce(c.d_en, '') || ' ' || coalesce(c.s_raw, '') || ' ' || coalesce(c.o_raw, '')) as raw_extra_en,
      -- Token arrays (with Arabic "ال" stripped) for whole-word synonym & tight fuzzy checks on name + category ONLY
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
    from candidates c
  ),
  scored as (
    select
      e.*,

      -- Layer 1: Exact / Prefix / Normalized Match (Name, Category, Specs/Description exact ONLY)
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
        +
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
      )::real as title_cat_exact_score,

      -- Exact/Normalized Specs, Options & Description Match ONLY (never fuzzy/skeleton)
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

      -- Layer 2: 15-Category Synonym Match (whole-word / phrase match on Name & Category ONLY)
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
        +
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
      )::real as synonym_score,

      -- Layer 3: Arabic Consonant Skeleton Match (ONLY on Name & Category tokens of length >= 4, same initial char, len diff <= 2)
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

      -- Layer 4a: English Phonetic Match via dmetaphone (ONLY on Name_en & Category_en tokens >= 4 chars, levenshtein <= 2)
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

      -- Layer 4b: Tight Fuzzy Typo Tolerance (levenshtein <= 1 ONLY on Name & Category tokens >= 4 chars)
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

      -- Layer 4c: Tight pg_trgm word_similarity >= 0.35 ONLY on Name & Category (NEVER descriptions/specs)
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
      (
        s.title_cat_exact_score
        + s.spec_desc_exact_score
        + s.synonym_score
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
      max(r.total_score) over () as best_score
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
  order by f.total_score desc, f.name asc
  limit v_limit;
end $$;

revoke all on function public.search_products_fast(uuid, text, int, uuid) from public;
grant execute on function public.search_products_fast(uuid, text, int, uuid) to anon, authenticated;
grant execute on function public.strip_arabic_al(text) to anon, authenticated;

grant select on public.search_synonyms to anon, authenticated;
grant insert, update, delete on public.search_synonyms to authenticated;

notify pgrst, 'reload schema';

commit;
