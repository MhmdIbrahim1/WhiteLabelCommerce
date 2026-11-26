begin;

-- Use real API roles but fresh review/author IDs. Each storefront is tested
-- with its own published review, another shopper, and both stores' merchants.
create temporary table review_cases as
select s.id as tenant, gen_random_uuid() as review, gen_random_uuid() as author,
       gen_random_uuid() as merchant
from public.stores s where slug in ('nova-store','omar-a7a');
insert into auth.users(id,email,email_confirmed_at)
select merchant, merchant::text || '@example.invalid', now() from review_cases;
insert into public.store_members(store_id,user_id,role,permissions)
select tenant, merchant, 'catalog','{"manage_products":true}'::jsonb from review_cases;
insert into public.product_reviews (id, store_id, product_id, user_id, author_name, rating)
select c.review, c.tenant, (select id from public.products where store_id = c.tenant and is_active limit 1),
       c.author, 'Rollback follow-up QA', 5 from review_cases c;
grant select on review_cases to authenticated, anon;
set local role authenticated;

do $$
declare
  c record;
  other_tenant uuid;
  other_merchant uuid;
begin
  for c in select * from review_cases loop
    select tenant, merchant into strict other_tenant, other_merchant from review_cases where tenant <> c.tenant;
    perform set_config('request.jwt.claim.sub',c.author::text,true);
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'customer','Too early');
      raise exception 'Expected opening reply requirement';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',c.merchant::text,true);
    perform public.admin_moderate_review(c.tenant,c.review,'published','Opening reply');
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'merchant','Too early');
      raise exception 'Expected customer turn first';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'customer','Other shopper');
      raise exception 'Expected author restriction';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',c.author::text,true);
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(other_tenant,c.review,'customer','Wrong store');
      raise exception 'Expected tenant restriction';
    exception when insufficient_privilege then null; end;
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'customer',repeat('x',501));
      raise exception 'Expected character limit';
    exception when check_violation then null; end;
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'customer',E' \n\t');
      raise exception 'Expected nonblank body';
    exception when check_violation then null; end;
    insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'customer',repeat('🙂',500));
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'customer','Duplicate');
      raise exception 'Expected one customer turn';
    exception when unique_violation then null; end;
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'merchant','Invalid role');
      raise exception 'Expected merchant restriction';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',other_merchant::text,true);
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'merchant','Other store');
      raise exception 'Expected merchant tenant restriction';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claim.sub',c.merchant::text,true);
    begin
      perform public.admin_moderate_review(c.tenant,c.review,'published','Replace opener');
      raise exception 'Expected immutable opener after customer turn';
    exception when check_violation then null; end;
    insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'merchant','Closing reply');
    begin
      insert into public.review_replies(store_id,review_id,role,body) values(c.tenant,c.review,'merchant','Duplicate');
      raise exception 'Expected one closing reply';
    exception when unique_violation then null; end;
    perform public.admin_moderate_review(c.tenant,c.review,'hidden');
    if (select count(*) from public.review_replies where review_id = c.review) <> 2 then
      raise exception 'Merchant lost hidden thread';
    end if;
    perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
    if exists (select 1 from public.review_replies where review_id = c.review) then
      raise exception 'Shopper saw hidden thread';
    end if;
  end loop;
end $$;
set local role anon;
do $$ begin
  if exists (select 1 from public.review_replies where review_id in (select review from review_cases)) then
    raise exception 'Guest saw hidden thread';
  end if;
end $$;
rollback;
select 'Review follow-up role and turn checks passed' as result;
