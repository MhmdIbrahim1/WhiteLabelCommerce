-- Run against the reference catalogs in a single Management API request.
begin;
do $test$
declare
  nova constant uuid := '00000000-0000-0000-0000-000000000001';
  omar constant uuid := 'b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c';
  cat uuid; item uuid; sibling uuid; rows_before int; page1 uuid[]; page2 uuid[]; full_ids uuid[];
begin
  if not exists(select from public.stores where id=nova and slug='nova-store')
    or not exists(select from public.stores where id=omar and slug='omar-a7a') then
    raise exception 'Unexpected reference stores';
  end if;
  assert public.damerau_levenshtein('ca','abc',2)=2;
  assert public.damerau_levenshtein('سعاة','ساعة',1)=1;
  assert public.arabic_consonant_skeleton('سعه')=public.arabic_consonant_skeleton('ساعة');
  assert public.arabic_consonant_skeleton('هودي')='هدي';
  assert public.normalize_search_text('السَّاعَـة ١٢ T-shirts')='ساعه 12 tshirt';
  assert public.convert_keyboard_layout('shum')='ساعة' and public.convert_keyboard_layout('ساعة')='shum';

  select count(*) into rows_before from public.products where store_id=nova and is_active;
  insert into public.categories(store_id,slug,name,name_en)
    values(nova,'qa-search-'||gen_random_uuid(),'فئة تجريبية','qacatword') returning id into cat;
  insert into public.products(store_id,category_id,slug,name,name_en,description,stock,price,is_active)
    values(nova,cat,'qa-search-'||gen_random_uuid(),'ساعة تجريبية','qasearchterm','qadescriptiononly',2,20,true) returning id into item;
  insert into public.products(store_id,category_id,slug,name,name_en,stock,price,is_active)
    values(nova,cat,'qa-search-'||gen_random_uuid(),'ساعة تجريبية','qasearchterm',0,12,true) returning id into sibling;
  assert (select doc_freq=2 and abs(idf_weight-ln(1+(rows_before+2)/2.0))<0.00001
    from public.store_search_vocab where store_id=nova and token_norm='qasearchterm') is true;
  assert not exists(select from public.store_search_vocab where token_norm='qadescriptiononly');
  assert not exists(select from public.catalog_products_page(omar,'qasearchterm',p_exact_query=>true));
  assert (select id=item and total_count=2 and match_tier=1 from public.catalog_products_page(nova,'qasearchterm') limit 1) is true;
  assert (select total_count=1 from public.catalog_products_page(nova,'qasearchterm',p_category_id=>cat,p_in_stock=>true)) is true;
  assert (select id=sibling from public.catalog_products_page(nova,'qasearchterm under 15',p_category_id=>cat)) is true;
  assert (select total_count=2 from public.catalog_products_page(nova,'qasearchterm under 15',p_category_id=>cat,p_max_price=>20) limit 1) is true;
  assert (select id=item and match_tier=4 from public.catalog_products_page(nova,'qadescriptiononly',p_exact_query=>true)) is true;
  select array_agg(id order by ordinality) into full_ids from public.catalog_products_page(nova,'qasearchterm',p_sort=>'price_asc') with ordinality r;
  select array_agg(id) into page1 from public.catalog_products_page(nova,'qasearchterm',p_sort=>'price_asc',p_limit=>1);
  select array_agg(id) into page2 from public.catalog_products_page(nova,'qasearchterm',p_sort=>'price_asc',p_limit=>1,p_offset=>1);
  assert full_ids=page1||page2 and full_ids=array[sibling,item];

  insert into public.products(store_id,category_id,slug,name,stock,price,is_active)
    select nova,category_id,'qa-search-'||gen_random_uuid(),'qasearchtern',1,15,true
    from public.products where store_id=nova and category_id<>cat limit 1;
  assert (select match_tier=3 and rank between 50 and 70 from public.catalog_products_page(
    nova,'qasearchtern',p_category_id=>cat) limit 1) is true;
  assert not exists(select from public.catalog_products_page(nova,'qasearchtern',p_category_id=>cat,p_exact_query=>true));

  update public.categories set name_en='qanewcategory' where id=cat;
  assert not exists(select from public.store_search_vocab where token_norm='qacatword');
  assert (select doc_freq=2 from public.store_search_vocab where store_id=nova and token_norm='qanewcategory') is true;
  update public.products set is_active=false where id=item;
  assert (select doc_freq=1 from public.store_search_vocab where store_id=nova and token_norm='qasearchterm') is true;
  update public.products set name_en='qarenamedword' where id=sibling;
  assert not exists(select from public.store_search_vocab where token_norm='qasearchterm');
  delete from public.products where id=sibling;
  assert not exists(select from public.store_search_vocab where token_norm in ('qarenamedword','qanewcategory'));
  assert not exists(select from catalog_search.postings where product_id in (item,sibling));
  insert into public.products(store_id,category_id,slug,name,stock,price,is_active)
    select nova,cat,'qa-search-'||gen_random_uuid(),'qabatchproduct',1,i,true from generate_series(1,102) i;
  assert (select count(*)=10 from public.search_products_fast(nova,'qabatchproduct'));
  assert (select count(distinct id)=102 from public.search_products_fast(nova,'qabatchproduct',1000));
  assert (select count(*)=100 and max(total_count)=102 from public.catalog_products_page(nova,'qabatchproduct',p_limit=>1000));
end $test$;
rollback;
