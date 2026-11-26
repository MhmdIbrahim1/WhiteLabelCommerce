-- Public catalog fields and tenant-scoped, active-only lexical postings.
begin;
create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;
create schema if not exists catalog_search;
revoke all on schema catalog_search from public, anon, authenticated;
grant usage on schema catalog_search to anon, authenticated, service_role;

create or replace function catalog_search.words(input text)
returns text[] language sql immutable parallel safe as $$
  select regexp_split_to_array(trim(regexp_replace(
    regexp_replace(regexp_replace(coalesce(input,''), '\mt[-‐‑– ]shirts?\M', 'tshirt', 'gi'),
                   'سويت[[:space:]]+شيرت', 'سويتشيرت', 'g'),
    '[^a-zA-Z0-9ء-غف-يٱ٠-٩ً-ٰٟـؐ-ؚۖ-ۭ]+', ' ', 'g')), ' +')
$$;

create or replace function catalog_search.norm_token(input text)
returns text language sql immutable strict parallel safe as $$
  with folded as (
    select translate(regexp_replace(lower(input), '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'),
      'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩', 'ااااهيوي0123456789') as t
  ), article as (
    select case when length(t)>3 and t like 'ال%' then substr(t,3) else t end as t from folded
  )
  select case t
    when 'watches' then 'watch' when 'smartwatches' then 'smartwatch'
    when 'shoes' then 'shoe' when 'shirts' then 'shirt' when 'tshirts' then 'tshirt'
    when 'hoodies' then 'hoodie' when 'glasses' then 'glass' when 'sunglasses' then 'sunglass'
    when 'bags' then 'bag' when 'sneakers' then 'sneaker' when 'trainers' then 'trainer'
    when 'ساعات' then 'ساعه' when 'سماعات' then 'سماعه' when 'نظارات' then 'نظاره'
    when 'تيشيرتات' then 'تيشيرت' when 'حقايب' then 'حقيبه' when 'حقائب' then 'حقيبه'
    when 'محافظ' then 'محفظه' when 'احذيه' then 'حذاء' when 'بناطيل' then 'بنطلون'
    when 'جلديه' then 'جلد' when 'جلدي' then 'جلد' else t end from article
$$;

create or replace function public.normalize_search_text(p_text text)
returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(catalog_search.norm_token(w), ' ' order by i),'')
  from unnest(catalog_search.words(p_text)) with ordinality a(w,i) where w <> ''
$$;

create or replace function public.arabic_consonant_skeleton(p_text text)
returns text language sql immutable parallel safe as $$
  with stems as (
    select case when length(t)>2 and t ~ '^[ء-ي]+$' then regexp_replace(t,'ه$','') else t end t,i
    from unnest(string_to_array(public.normalize_search_text(p_text),' ')) with ordinality a(t,i)
  )
  select coalesce(string_agg(case when length(t)>2 and t ~ '^[ء-ي]+$' then
    left(t,1) || translate(substr(t,2,length(t)-2),'اوي','') || right(t,1)
    else t end, ' ' order by i),'') from stems
$$;

create or replace function public.convert_keyboard_layout(p_text text)
returns text language plpgsql immutable strict parallel safe as $$
declare
  en constant text := 'qwertyuiop[]asdfghjkl;''zxcvbnm,./';
  ar constant text := 'ضصثقفغعهخحجدشسيبلاتنمكطئءؤر§ىةوزظ';
begin
  -- Windows B produces two letters (lam-alef); translate() maps one character at a time.
  if p_text ~ '[ء-ي]' and p_text !~ '[a-zA-Z]' then
    return translate(replace(p_text,'لا','§'), ar,en);
  elsif p_text ~ '[a-zA-Z]' and p_text !~ '[ء-ي]' then
    return replace(translate(lower(p_text),en,ar), '§', 'لا');
  end if;
  return p_text;
end $$;

create or replace function catalog_search.franco_word(w text)
returns text language plpgsql immutable strict parallel safe as $$
declare t text;
begin
  t := case lower(w)
    when 'sa3a' then 'ساعة' when 'naddara' then 'نظارة' when 'nadara' then 'نظارة'
    when 'shanta' then 'حقيبة' when 'ma7faza' then 'محفظة' when 'gazma' then 'حذاء'
    when 'kotchy' then 'حذاء' when 'bantalon' then 'بنطلون' when 'tshirt' then 'تيشيرت'
    when 'samma3a' then 'سماعة' when 'sama3a' then 'سماعة' end;
  if t is not null then return t; end if;
  if w !~* '^[a-z0-9]+$' or w !~* '[a-z]' or w !~ '[235679]' then return w; end if;
  t := replace(replace(replace(replace(lower(w),'sh','ش'),'kh','خ'),'gh','غ'),'th','ث');
  return translate(t,'375269abcdefghijklmnopqrstuvwxyz','عحخاطصابكديفجهيجكلمنوبقرستوفوكسيز');
end $$;

-- Bounded unrestricted Damerau-Levenshtein. Last occurrences allow a transposed
-- letter to participate in later edits (e.g. CA -> ABC). Over-bound returns k+1.
create or replace function public.damerau_levenshtein(a text,b text,k integer default 2)
returns integer language plpgsql immutable strict parallel safe as $$
declare
  n int := length(a); m int := length(b); inf int := n+m;
  d int[]; seen jsonb := '{}'; aa text[]; bb text[];
  i int; j int; i1 int; j1 int; last_match int; cost int;
begin
  if a=b then return 0; end if;
  if k<0 or abs(n-m)>k or greatest(n,m)>64 then return k+1; end if;
  if least(n,m)=0 then return least(k+1,greatest(n,m)); end if;
  aa:=string_to_array(a,null); bb:=string_to_array(b,null);
  d:=array_fill(0,array[n+2,m+2],array[0,0]); d[0][0]:=inf;
  for i in 0..n loop d[i+1][1]:=i; d[i+1][0]:=inf; end loop;
  for j in 0..m loop d[1][j+1]:=j; d[0][j+1]:=inf; end loop;
  for i in 1..n loop
    last_match:=0;
    for j in 1..m loop
      i1:=coalesce((seen->>bb[j])::int,0); j1:=last_match;
      cost:=1;
      if aa[i]=bb[j] then cost:=0; last_match:=j; end if;
      d[i+1][j+1]:=least(d[i][j]+cost,d[i+1][j]+1,d[i][j+1]+1,
                          d[i1][j1]+(i-i1-1)+1+(j-j1-1));
    end loop;
    seen:=seen || jsonb_build_object(aa[i],i);
  end loop;
  return least(d[n+1][m+1],k+1);
end $$;

create table if not exists catalog_search.postings (
  store_id uuid not null, product_id uuid not null, term text not null,
  display_term text not null, field smallint not null,
  primary key(store_id,product_id,term)
);
create index if not exists postings_term on catalog_search.postings(store_id,term text_pattern_ops,field,product_id);
create table if not exists public.store_search_vocab (
  store_id uuid not null references public.stores(id) on delete cascade,
  token_norm text not null, display_term text not null, skeleton text not null,
  doc_freq integer not null, idf_weight double precision not null, source_weight integer not null,
  primary key(store_id,token_norm)
);
create index if not exists vocab_prefix on public.store_search_vocab(store_id,token_norm text_pattern_ops);
create index if not exists vocab_skeleton on public.store_search_vocab(store_id,skeleton);
create index if not exists vocab_trgm on public.store_search_vocab using gin(token_norm gin_trgm_ops);
alter table public.store_search_vocab enable row level security;
revoke all on public.store_search_vocab from public, anon, authenticated;
revoke all on catalog_search.postings from public, anon, authenticated;

create or replace function catalog_search.refresh_products(tenant uuid, ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare touched text[]; added text[]; n int;
begin
  perform pg_advisory_xact_lock(hashtextextended(tenant::text,17017));
  select array_agg(distinct term) into touched from catalog_search.postings
    where store_id=tenant and product_id=any(ids) and field<=3;
  delete from catalog_search.postings where store_id=tenant and product_id=any(ids);
  with tokens as (
    select p.id, f.field, w, catalog_search.norm_token(w) term
    from public.products p join public.categories c on c.store_id=p.store_id and c.id=p.category_id
    cross join lateral (values
      (1,concat_ws(' ',p.name,p.name_en)),(2,concat_ws(' ',c.name,c.name_en)),
      (3,concat_ws(' ',p.slug,array_to_string(p.colors,' '),array_to_string(p.sizes,' '))),
      (4,(select string_agg(x.value,' ') from jsonb_array_elements(case jsonb_typeof(p.specifications) when 'array' then p.specifications else '[]' end) spec
          cross join lateral jsonb_each_text(case jsonb_typeof(spec) when 'object' then spec else '{}' end) x)),
      (5,concat_ws(' ',p.description,p.description_en))
    ) f(field,raw)
    cross join lateral unnest(catalog_search.words(f.raw)) w
    where p.store_id=tenant and p.id=any(ids) and p.is_active
  ), ins as (
    insert into catalog_search.postings(store_id,product_id,term,display_term,field)
    select distinct on(id,term) tenant,id,term,w,field from tokens
    where term<>'' order by id,term,field,length(w),w collate "C"
    returning term,field
  ) select array_agg(distinct term) into added from ins where field<=3;
  touched:=coalesce(touched,'{}')||coalesce(added,'{}');
  select count(*) into n from public.products where store_id=tenant and is_active;
  delete from public.store_search_vocab where store_id=tenant and token_norm=any(touched);
  insert into public.store_search_vocab(store_id,token_norm,display_term,skeleton,doc_freq,idf_weight,source_weight)
  select tenant,term,(array_agg(display_term order by field,length(display_term),display_term collate "C"))[1],
    public.arabic_consonant_skeleton(term),count(*),ln(1+n::float8/count(*)),
    case min(field) when 1 then 100 when 2 then 85 else 60 end
  from catalog_search.postings where store_id=tenant and term=any(touched) and field<=3 group by term;
  update public.store_search_vocab set idf_weight=ln(1+n::float8/doc_freq)
    where store_id=tenant and idf_weight<>ln(1+n::float8/doc_freq);
end $$;

create or replace function catalog_search.sync_changes()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare rec record; changes text;
begin
  if tg_table_name='categories' then
    changes:='select p.store_id,p.id from public.products p join new_rows n on n.id=p.category_id and n.store_id=p.store_id
      join old_rows o on o.id=n.id where (n.name,n.name_en) is distinct from (o.name,o.name_en)';
  elsif tg_op='UPDATE' then
    -- Stock, prices and ratings are read at query time.
    changes:='with changed as (select n.id as new_id,n.store_id as new_store,o.id as old_id,o.store_id as old_store
      from new_rows n full join old_rows o on n.id=o.id where
      (n.id,n.store_id,n.category_id,n.is_active,n.name,n.name_en,n.slug,n.colors,n.sizes,n.specifications,n.description,n.description_en)
      is distinct from (o.id,o.store_id,o.category_id,o.is_active,o.name,o.name_en,o.slug,o.colors,o.sizes,o.specifications,o.description,o.description_en))
      select new_store as store_id,new_id as id from changed union select old_store,old_id from changed';
  elsif tg_op='INSERT' then changes:='select store_id,id from new_rows';
  else changes:='select store_id,id from old_rows';
  end if;
  for rec in execute 'select store_id,array_agg(distinct id) ids from ('||changes||') q where store_id is not null group by store_id order by store_id' loop
    perform catalog_search.refresh_products(rec.store_id,rec.ids);
  end loop;
  return null;
end $$;

drop trigger if exists search_v2_insert on public.products;
create trigger search_v2_insert after insert on public.products referencing new table as new_rows for each statement execute function catalog_search.sync_changes();
drop trigger if exists search_v2_delete on public.products;
create trigger search_v2_delete after delete on public.products referencing old table as old_rows for each statement execute function catalog_search.sync_changes();
drop trigger if exists search_v2_update on public.products;
create trigger search_v2_update after update on public.products referencing old table as old_rows new table as new_rows for each statement execute function catalog_search.sync_changes();
drop trigger if exists search_v2_categories on public.categories;
create trigger search_v2_categories after update on public.categories referencing old table as old_rows new table as new_rows for each statement execute function catalog_search.sync_changes();
select catalog_search.refresh_products(store_id,array_agg(id)) from public.products group by store_id order by store_id;
create or replace function catalog_search.synonyms(w text)
returns text[] language sql immutable parallel safe as $$
  select coalesce((select terms from (values
    (array['ساعه','watch','smartwatch']),
    (array['نضاره','نظاره','sunglass','eyewear','shades','glass']),
    (array['شنطه','حقيبه','bag','handbag','backpack','briefcase','satchel','tote','daypack']),
    (array['محفظه','wallet','cardholder']),
    (array['جزمه','كوتشي','شوز','حذاء','سنيكر','سنيكرز','shoe','sneaker','footwear','trainer']),
    (array['تيشيرت','تشيرت','tee','tees','tshirt']),
    (array['بنطلون','جينز','جبردين','pants','trousers','jeans','chinos']),
    (array['هودي','هوديز','سويتشيرت','hoodie','sweatshirt','sweatshirts']),
    (array['سماعه','earbuds','headphones','earphones','audio','buds']),
    (array['مكتب','مكتبي','desk','desktop']),
    (array['جلد','leather'])
  ) g(terms) where w=any(terms)), '{}'::text[])
$$;

-- Merchants can retain their own aliases. Use older, broader global groups only
-- for terms outside the precision dictionary.
create or replace function catalog_search.aliases(tenant uuid,w text)
returns text[] language sql stable set search_path=pg_catalog,pg_temp as $$
  with curated as (select catalog_search.synonyms(w) terms)
  select c.terms || array(
    select distinct public.normalize_search_text(a) from public.search_synonyms s
    cross join lateral unnest(s.terms) a
    where (s.store_id=tenant or (s.store_id is null and cardinality(c.terms)=0))
      and s.terms @> array[w]
  ) from curated c
$$;

create or replace function catalog_search.near_terms(tenant uuid,w text)
returns table(term text,display_term text,distance int,same_skeleton boolean,similarity real,
              frequency int,weight int)
language sql stable set search_path=pg_catalog,public,extensions,pg_temp as $$
  with bounds as materialized (
    select case when length(w)<=4 then 1 else 2 end as k, public.arabic_consonant_skeleton(w) sk
  ), candidates as materialized (
    select v.*, b.k, (w ~ '[ء-ي]' and b.sk=v.skeleton) same_sk,
      word_similarity(w,v.token_norm) sim
    from public.store_search_vocab v cross join bounds b
    where v.store_id=tenant and v.source_weight>=85 and length(w) between 3 and 32
      and w !~ '[0-9]' and abs(length(v.token_norm)-length(w))<=b.k
      and (v.skeleton=b.sk or v.token_norm % w or left(v.token_norm,1)=left(w,1)
        or right(v.token_norm,1)=right(w,1))
      and levenshtein_less_equal(w,v.token_norm,2*b.k)<=2*b.k
  ), measured as materialized (
    select c.*,public.damerau_levenshtein(w,token_norm,k) as dist from candidates c
  )
  select token_norm,display_term,dist,same_sk,sim,doc_freq,source_weight from measured
  where dist<=k and (dist<=1 or same_sk or sim>=0.45)
$$;

create or replace function public.suggest_corrected_query(p_store_id uuid,p_raw_query text)
returns text language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare source text; w text; candidate text; result text[]:='{}';
begin
  foreach source in array catalog_search.words(left(p_raw_query,100)) loop
    w:=catalog_search.norm_token(source);
    if w='' then continue; end if;
    candidate:=null;
    if not exists(select 1 from public.store_search_vocab v where v.store_id=p_store_id
      and (v.token_norm=w or (v.source_weight>=85 and (v.token_norm like w||'%' or v.token_norm=any(catalog_search.aliases(p_store_id,w)))))) then
      select n.display_term into candidate from catalog_search.near_terms(p_store_id,w) n
      order by n.distance,n.same_skeleton desc,n.weight desc,n.similarity desc,n.frequency desc,n.term limit 1;
    end if;
    result:=array_append(result,coalesce(candidate,source));
  end loop;
  return array_to_string(result,' ');
end $$;

-- One best field per product and query token. The lexical stage is independent
-- of presentation, business signals and pagination.
create or replace function catalog_search.lexical(tenant uuid, tokens text[], literal boolean, fuzzy boolean, ids uuid[])
returns table(product_id uuid, tier int, hits int, strong_hits int, quality float8, kind text)
language sql stable set search_path=pg_catalog,pg_temp as $$
  with q as materialized (
    select distinct t from unnest(tokens) t where t<>''
  ), variants as materialized (
    select q.t,q.t as term,0 as method from q
    union all
    select q.t,v.token_norm,1 from q join public.store_search_vocab v
      on v.store_id=tenant and v.token_norm like q.t||'%' and v.token_norm<>q.t
    union all
    select q.t,s,2 from q cross join lateral unnest(catalog_search.aliases(tenant,q.t)) s
      where not literal and s<>q.t
  ), direct as materialized (
    select x.t,p.product_id,
      case when p.field>=4 then 4 when p.field=1 and x.method<2 then 1 else 2 end level,
      case when p.field=1 and x.method<2 then 'exact' when p.field<=3 then 'synonym'
           when p.field=4 then 'spec' else 'description' end kind,
      (case p.field when 1 then 1.0 when 2 then 0.65 else 0.4 end
        * case x.method when 0 then 1 when 1 then 0.85 else 0.7 end
        * (1+coalesce(v.idf_weight,1))) as merit
    from variants x join catalog_search.postings p on p.store_id=tenant and p.term=x.term
    left join public.store_search_vocab v on v.store_id=tenant and v.token_norm=x.term
    where (ids is null or p.product_id=any(ids))
      and (x.method=0 or (p.field<=3 and (p.field<3 or x.method=1)))
  ), unknown as materialized (
    select q.t from q where fuzzy and not literal
      and not exists(select 1 from direct d where d.t=q.t and d.level<=2)
  ), approx as (
    select q.t,p.product_id,3 as level,'fuzzy'::text as kind,
      (1+n.similarity+n.same_skeleton::int)::float8 as merit
    from unknown q cross join lateral catalog_search.near_terms(tenant,q.t) n
    join catalog_search.postings p on p.store_id=tenant and p.term=n.term and p.field<=2
    where ids is null or p.product_id=any(ids)
  ), best as (
    select distinct on(product_id,t) product_id,t,level,kind,merit
    from (select * from direct union all select * from approx) a
    order by product_id,t,level,merit desc,kind
  )
  select product_id,max(level),count(*)::int,count(*) filter(where level<=2)::int,
    avg(merit),(array_agg(kind order by level desc, merit desc))[1] from best group by product_id
$$;

create or replace function catalog_search.ranked(tenant uuid,raw text,literal boolean,ids uuid[])
returns table(product_id uuid,match_tier int,lexical_quality float8,match_type text,
              effective_query text, correction_reason text)
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare
  chosen text:=raw; reason text; proposal text; words text[]; alternative text[]; n int; best int; coverage int;
begin
  words:=string_to_array(public.normalize_search_text(raw),' ');
  select count(distinct t) into n from unnest(words) t;
  if n=0 then return; end if;
  if not literal then
    select coalesce(max(s.strong_hits),0) into best from catalog_search.lexical(tenant,words,false,false,ids) s;
    if best<n then
      for i in 1..3 loop
        if i=1 then proposal:=public.convert_keyboard_layout(raw);
        elsif i=2 then
          select string_agg(catalog_search.franco_word(w),' ' order by pos) into proposal
          from unnest(catalog_search.words(raw)) with ordinality a(w,pos);
        else proposal:=public.suggest_corrected_query(tenant,raw);
        end if;
        alternative:=string_to_array(public.normalize_search_text(proposal),' ');
        if alternative is null or alternative=words then continue; end if;
        select coalesce(max(s.strong_hits),0) into coverage from catalog_search.lexical(tenant,alternative,false,false,ids) s;
        if coverage*n>best*cardinality(alternative) and coverage>=greatest(1,ceil(cardinality(alternative)/2.0)) then
          chosen:=proposal; words:=alternative; reason:=(array['layout','franco','spell'])[i]; exit;
        end if;
      end loop;
    end if;
  end if;
  select count(distinct t) into n from unnest(words) t;
  return query
    with matches as materialized (
      select s.*,max(s.strong_hits) over() strongest from catalog_search.lexical(tenant,words,literal,true,ids) s
    )
    select m.product_id,case when reason='franco' then greatest(2,m.tier) else m.tier end,
      0.55*m.hits/n::float8 + 0.23*m.quality/(2+m.quality),
      case when reason='franco' and m.tier=1 then 'synonym' else m.kind end,chosen,reason
    from matches m where m.hits>=case when literal or strongest=n then n else greatest(1,ceil(n/2.0)::int) end;
end $$;

-- The only order-derived value used by search is the bounded logarithmic boost.
create or replace function catalog_search.sales_boost(tenant uuid)
returns table(product_id uuid, boost float8)
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select i.product_id,least(1.0,ln(1+greatest(0,sum(i.quantity))::float8)/6)
  from public.orders o join public.order_items i on i.order_id=o.id
  join public.products p on p.id=i.product_id and p.store_id=o.store_id and p.is_active
  where o.store_id=tenant and o.status='delivered' group by i.product_id
$$;

drop function if exists public.catalog_products_page(uuid,text,uuid,numeric,numeric,boolean,boolean,text,integer,integer,timestamptz);
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
      from public.products p cross join lateral (select p.flash_sale_price>0 and p.flash_sale_price<p.price
        and p.flash_sale_ends_at>p_now and (p.flash_sale_starts_at is null or p.flash_sale_starts_at<=p_now) as active) f
      where p.store_id=p_store_id and p.is_active and (p_category_id is null or p.category_id=p_category_id)
        and (not coalesce(p_in_stock,false) or p.stock>0) and (not coalesce(p_flash_only,false) or f.active)
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

-- Installed clients on v1.4.3 still call the original named arguments and row shape.
create or replace function public.search_products_fast(
  p_store_id uuid,p_query text,p_limit int default 10,p_category_id uuid default null,p_offset int default 0
) returns table(id uuid,name text,name_en text,category_id uuid,description text,description_en text,
  price numeric,old_price numeric,stock int,sizes text[],colors text[],image_path text,specifications jsonb,rank real,match_type text)
language plpgsql stable security invoker set search_path=pg_catalog,pg_temp as $$
declare remaining int:=greatest(1,coalesce(p_limit,10)); skip_rows bigint:=greatest(0,coalesce(p_offset,0)); n int;
begin
  if trim(coalesce(p_query,''))='' then return; end if;
  -- Wave 2 allowed bulk consumers to request more than one storefront page.
  while remaining>0 and skip_rows<=2147483647 loop
    return query select p.id,p.name,p.name_en,p.category_id,p.description,p.description_en,p.price,p.old_price,p.stock,
      p.sizes,p.colors,p.image_path,p.specifications,p.rank,p.match_type from public.catalog_products_page(
        p_store_id=>p_store_id,p_query=>p_query,p_category_id=>p_category_id,p_limit=>remaining,p_offset=>skip_rows::int) p;
    get diagnostics n=row_count;
    exit when n<least(100,remaining);
    remaining:=remaining-n; skip_rows:=skip_rows+n;
  end loop;
end $$;

revoke all on all functions in schema catalog_search from public, anon, authenticated;
grant execute on function catalog_search.ranked(uuid,text,boolean,uuid[]),catalog_search.sales_boost(uuid),
  catalog_search.words(text),catalog_search.norm_token(text) to anon,authenticated,service_role;
revoke all on function public.suggest_corrected_query(uuid,text),
  public.catalog_products_page(uuid,text,uuid,numeric,numeric,boolean,boolean,text,int,int,timestamptz,boolean) from public;
grant execute on function public.suggest_corrected_query(uuid,text),
  public.catalog_products_page(uuid,text,uuid,numeric,numeric,boolean,boolean,text,int,int,timestamptz,boolean) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
