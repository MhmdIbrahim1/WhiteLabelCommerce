-- Phase 15: Wave 1 QA remediation (OPS-01, BUG-01, BUG-03)
-- Idempotent: safe to re-run after the Phase 14 security hardening migration.

begin;

-- BUG-01: table-level SELECT grants override column-level revokes. Replace them
-- with explicit public projections for both PostgREST client roles. Merchants and
-- platform admins read private fields through authorized server-only queries.
revoke select on table public.products from anon, authenticated;
grant select (
  id, category_id, slug, name, description, price, stock, is_active,
  old_price, sizes, colors, image_path, created_at, store_id, name_en,
  description_en, specifications, avg_rating, review_count,
  flash_sale_price, flash_sale_starts_at, flash_sale_ends_at
) on table public.products to anon, authenticated;

revoke select on table public.stores from anon, authenticated;
grant select (
  id, name_ar, name_en, slug, custom_domain, status, plan
) on table public.stores to anon, authenticated;

revoke select on table public.product_reviews from anon, authenticated;
grant select (
  id, store_id, product_id, author_name, rating, comment,
  is_verified_purchase, status, admin_reply, admin_replied_at,
  created_at, updated_at
) on table public.product_reviews to anon, authenticated;

revoke select on table public.store_app_builds from anon, authenticated;
grant select (
  id, store_id, app_name, package_id, app_id_suffix, icon_url,
  version_code, version_name, status, github_run_url, apk_download_url,
  created_at, updated_at, completed_at
) on table public.store_app_builds to authenticated;

-- BUG-03: retain the unclaimed customer row identifier before claiming it, then
-- attach only that row's guest orders after verified-email ownership is proven.
create or replace function public.sync_customer_profile(
  p_full_name text default '',
  p_phone text default '',
  p_city text default '',
  p_address text default '',
  p_governorate text default '',
  p_store_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_email_confirmed boolean := false;
  v_store_id uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_phone_variants text[] := array[]::text[];
  v_name text := left(trim(coalesce(p_full_name, '')), 120);
  v_gov text := left(trim(coalesce(p_governorate, '')), 100);
  v_city text := left(trim(coalesce(p_city, '')), 100);
  v_addr text := left(trim(coalesce(p_address, '')), 500);
  v_cust_id uuid;
  v_claimed_guest_customer_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if not exists (select 1 from public.store_settings s where s.store_id = v_store_id) then
    raise exception 'unknown_store';
  end if;

  select
    coalesce(u.email, ''),
    (u.email_confirmed_at is not null)
  into v_email, v_email_confirmed
  from auth.users u
  where u.id = v_uid;

  if v_phone ~ '^2001[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 4);
  elsif v_phone ~ '^00201[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 5);
  end if;

  if v_phone ~ '^01[0125][0-9]{8}$' then
    v_phone_variants := array[v_phone, '20' || substr(v_phone, 2)];
  elsif v_phone ~ '^201[0125][0-9]{8}$' then
    v_phone_variants := array['0' || substr(v_phone, 3), v_phone];
    v_phone := '0' || substr(v_phone, 3);
  elsif length(v_phone) >= 8 then
    v_phone_variants := array[v_phone];
  end if;

  select sc.id into v_cust_id
  from public.store_customers sc
  where sc.store_id = v_store_id
    and sc.user_id = v_uid;

  -- Claim by confirmed email only. Keep the pre-update ID for order linking.
  if v_cust_id is null and v_email_confirmed and length(trim(v_email)) > 3 then
    select sc.id into v_claimed_guest_customer_id
    from public.store_customers sc
    where sc.store_id = v_store_id
      and sc.user_id is null
      and lower(trim(sc.email)) = lower(trim(v_email))
    order by sc.updated_at desc
    limit 1;

    v_cust_id := v_claimed_guest_customer_id;
  end if;

  -- Preserve collision protection for phone numbers already owned by another account.
  if length(v_phone) >= 8 and exists (
    select 1
    from public.store_customers sc
    where sc.store_id = v_store_id
      and (v_cust_id is null or sc.id <> v_cust_id)
      and sc.phone = any(v_phone_variants)
      and sc.user_id is not null
  ) then
    raise exception 'phone_already_in_use';
  end if;

  -- Never claim an unrelated phone-only guest row.
  if length(v_phone) >= 8 and exists (
    select 1
    from public.store_customers sc
    where sc.store_id = v_store_id
      and (v_cust_id is null or sc.id <> v_cust_id)
      and sc.user_id is null
      and sc.phone = v_phone
  ) then
    v_phone := '';
  end if;

  if v_cust_id is null then
    insert into public.store_customers (
      store_id, user_id, full_name, phone, email, governorate, city, address
    )
    values (
      v_store_id, v_uid, v_name, v_phone, v_email, v_gov, v_city, v_addr
    )
    returning id into v_cust_id;
  else
    update public.store_customers
    set user_id = v_uid,
        full_name = case when length(v_name) > 0 then v_name else full_name end,
        phone = case when length(v_phone) >= 8 then v_phone else phone end,
        email = case when length(v_email) > 0 then v_email else email end,
        governorate = case when length(v_gov) > 0 then v_gov else governorate end,
        city = case when length(v_city) > 0 then v_city else city end,
        address = case when length(v_addr) > 0 then v_addr else address end,
        updated_at = now()
    where id = v_cust_id;
  end if;

  if v_email_confirmed and v_claimed_guest_customer_id is not null then
    update public.orders
    set user_id = v_uid,
        customer_id = v_cust_id
    where store_id = v_store_id
      and user_id is null
      and customer_id = v_claimed_guest_customer_id;
  end if;

  update public.orders
  set customer_id = v_cust_id
  where store_id = v_store_id
    and user_id = v_uid
    and customer_id is null;

  return v_cust_id;
end $$;

revoke all on function public.sync_customer_profile(text, text, text, text, text, uuid)
  from public, anon;
grant execute on function public.sync_customer_profile(text, text, text, text, text, uuid)
  to authenticated, service_role;

comment on function public.sync_customer_profile(text, text, text, text, text, uuid)
  is 'Claims verified-email guest CRM/order history without phone-only account takeover.';

notify pgrst, 'reload schema';

commit;
