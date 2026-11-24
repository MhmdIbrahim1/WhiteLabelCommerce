-- Phase 9: Unified Customer Auth, Governorate Profile Field & Enhanced Guest Order Claiming
-- Apply after phase-6-crm-analytics.sql & android-phase-8-sync.sql. Idempotent and backward compatible.
begin;

-- 1. Add governorate field to store_customers for structured Egyptian shipping profiles (web + Android)
alter table public.store_customers
  add column if not exists governorate text not null default '';

-- 2. Upgrade sync_customer_profile to support governorate, Egyptian phone variants (01x / 201x),
--    and linking past guest orders matching either phone OR email within the active store.
drop function if exists public.sync_customer_profile(text, text, text, text);
create or replace function public.sync_customer_profile(
  p_full_name text default '',
  p_phone text default '',
  p_city text default '',
  p_address text default '',
  p_governorate text default ''
)
returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_store_id uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_phone_variants text[] := array[]::text[];
  v_name text := trim(coalesce(p_full_name, ''));
  v_gov text := trim(coalesce(p_governorate, ''));
  v_city text := trim(coalesce(p_city, ''));
  v_addr text := trim(coalesce(p_address, ''));
  v_cust_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  select s.store_id into strict v_store_id from public.store_settings s where s.id;
  select coalesce(u.email, '') into v_email from auth.users u where u.id = v_uid;

  -- Build canonical Egyptian phone variants so 010xxxxxxxx and 2010xxxxxxxx both claim guest orders
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

  -- 1) Look up existing customer record by (store_id, user_id)
  select id into v_cust_id
  from public.store_customers
  where store_id = v_store_id and user_id = v_uid;

  -- 2) Otherwise look up an unclaimed guest record by phone variants
  if v_cust_id is null and cardinality(v_phone_variants) > 0 then
    select id into v_cust_id
    from public.store_customers
    where store_id = v_store_id
      and user_id is null
      and phone = any(v_phone_variants)
    order by updated_at desc
    limit 1;
  end if;

  -- 3) Otherwise look up an unclaimed guest record by case-insensitive email
  if v_cust_id is null and length(trim(v_email)) > 3 then
    select id into v_cust_id
    from public.store_customers
    where store_id = v_store_id
      and user_id is null
      and lower(email) = lower(trim(v_email))
    order by updated_at desc
    limit 1;
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
    -- If another unclaimed guest row already holds this normalized phone, merge its orders first
    if cardinality(v_phone_variants) > 0 then
      update public.orders
      set user_id = v_uid,
          customer_id = v_cust_id
      where store_id = v_store_id
        and user_id is null
        and customer_id in (
          select sc.id
          from public.store_customers sc
          where sc.store_id = v_store_id
            and sc.id <> v_cust_id
            and sc.user_id is null
            and sc.phone = any(v_phone_variants)
        );

      delete from public.store_customers
      where store_id = v_store_id
        and id <> v_cust_id
        and user_id is null
        and phone = any(v_phone_variants);
    end if;

    -- Reject claiming a phone already bound to another authenticated user in this store
    if length(v_phone) >= 8 and exists (
      select 1
      from public.store_customers sc
      where sc.store_id = v_store_id
        and sc.id <> v_cust_id
        and sc.user_id is not null
        and sc.phone = any(v_phone_variants)
    ) then
      raise exception 'phone_already_in_use';
    end if;

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

  -- Use the customer's stored phone as well if p_phone was omitted during login sync
  if cardinality(v_phone_variants) = 0 then
    select regexp_replace(coalesce(sc.phone, ''), '[^0-9]+', '', 'g')
    into v_phone
    from public.store_customers sc
    where sc.id = v_cust_id;

    if v_phone ~ '^01[0125][0-9]{8}$' then
      v_phone_variants := array[v_phone, '20' || substr(v_phone, 2)];
    elsif v_phone ~ '^201[0125][0-9]{8}$' then
      v_phone_variants := array['0' || substr(v_phone, 3), v_phone];
    elsif length(v_phone) >= 8 then
      v_phone_variants := array[v_phone];
    end if;
  end if;

  -- Claim past guest orders in this store matching normalized phone variants
  if cardinality(v_phone_variants) > 0 then
    update public.orders
    set user_id = v_uid,
        customer_id = v_cust_id
    where store_id = v_store_id
      and user_id is null
      and phone = any(v_phone_variants);
  end if;

  -- Claim past guest orders in this store linked to any guest customer row with matching email
  if length(trim(v_email)) > 3 then
    update public.orders
    set user_id = v_uid,
        customer_id = v_cust_id
    where store_id = v_store_id
      and user_id is null
      and customer_id in (
        select sc.id
        from public.store_customers sc
        where sc.store_id = v_store_id
          and lower(sc.email) = lower(trim(v_email))
      );
  end if;

  -- Ensure all existing orders for this user in this store reference customer_id
  update public.orders
  set customer_id = v_cust_id
  where store_id = v_store_id
    and user_id = v_uid
    and customer_id is null;

  return v_cust_id;
end $$;

revoke all on function public.sync_customer_profile(text, text, text, text, text) from public, anon;
grant execute on function public.sync_customer_profile(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
