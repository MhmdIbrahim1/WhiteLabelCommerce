begin;
do $$
declare
 test_user uuid := gen_random_uuid();
 tenant_id uuid := (select id from public.stores where slug = 'omar-a7a');
 profile_id uuid;
begin
 if tenant_id is null then raise exception 'Missing QA store'; end if;
 insert into auth.users(id,email,email_confirmed_at) values(test_user, test_user::text || '@example.invalid', now());
 perform set_config('request.jwt.claim.sub',test_user::text,true);
 profile_id := public.sync_customer_profile(p_full_name=>'Android milestone QA',p_phone=>'',p_city=>'',p_address=>'',p_governorate=>'',p_store_id=>tenant_id);
 if not exists(select 1 from public.store_customers where id=profile_id and store_id=tenant_id and user_id=test_user) then raise exception 'Profile tenant mismatch'; end if;
 if public.sync_customer_profile(p_full_name=>'Android milestone QA',p_phone=>'',p_city=>'',p_address=>'',p_governorate=>'',p_store_id=>tenant_id) <> profile_id then raise exception 'Profile sync not idempotent'; end if;
end $$;
rollback;
select 'M3_SQL_PROFILE_ROLLBACK_OK' as verified;
