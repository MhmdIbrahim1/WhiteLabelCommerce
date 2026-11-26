-- Apply with email confirmation still enabled on first install.
begin;
lock table auth.users in share row exclusive mode;
create schema if not exists customer_auth;
revoke all on schema customer_auth from public, anon, authenticated;

do $$
begin
  if to_regclass('customer_auth.verified_mailboxes') is null then
    create table customer_auth.verified_mailboxes (
      user_id uuid primary key references auth.users(id) on delete cascade,
      email text not null
    );
    insert into customer_auth.verified_mailboxes
      select id, lower(email) from auth.users
      where email_confirmed_at is not null and email is not null;
  end if;
end $$;

-- GoTrue records a password grant for automatic confirmation. An OTP grant
-- for an email-only account records actual possession of the mailbox.
create or replace function customer_auth.record_email_otp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into customer_auth.verified_mailboxes as m (user_id, email)
    select u.id, lower(u.email)
    from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = new.session_id and u.email_confirmed_at is not null
      and u.email is not null and nullif(u.phone, '') is null
    on conflict (user_id) do update set email = excluded.email;
  return new;
end $$;
create or replace trigger customer_email_otp
after insert or update of authentication_method on auth.mfa_amr_claims
for each row when (new.authentication_method = 'otp')
execute function customer_auth.record_email_otp();

create or replace function customer_auth.forget_old_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from customer_auth.verified_mailboxes where user_id = new.id;
  return new;
end $$;
create or replace trigger customer_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function customer_auth.forget_old_email();

create or replace function customer_auth.mailbox_verified(uid uuid, address text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select from customer_auth.verified_mailboxes
                 where user_id = uid and email = lower(address));
$$;
revoke all on all functions in schema customer_auth from public, anon, authenticated;
revoke all on all tables in schema customer_auth from public, anon, authenticated;

-- The global profile records the signup store. Customer and phone records
-- remain per store. Legacy clients can omit the store and use the schema default.
create or replace function public.create_signup_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, store_id)
    select new.id, s.id from public.stores s
    where s.id::text = new.raw_user_meta_data->>'signup_store_id';
  if not found then
    insert into public.profiles (id) values (new.id);
  end if;
  return new;
end $$;
revoke all on function public.create_signup_profile() from public, anon, authenticated;

-- Keep the installed RPC signatures, grants and payment logic. Fail atomically
-- if the expected Wave 1 definitions have changed.
do $$
declare
  fn regprocedure;
  body text;
  old_gate constant text := 'u.email_confirmed_at is not null';
  new_gate constant text := 'customer_auth.mailbox_verified(u.id, u.email)';
  phone_collision constant text := 'sc\.user_id is not null\s+and \(customer is null or sc\.user_id <> customer\)';
begin
  foreach fn in array array[
    'public.claim_pending_store_ownership()'::regprocedure,
    'public.super_admin_assign_store_owner(uuid,text)'::regprocedure,
    'public.sync_customer_profile(text,text,text,text,text,uuid)'::regprocedure
  ] loop
    body := pg_get_functiondef(fn);
    if strpos(body, new_gate) = 0 then
      if strpos(body, old_gate) = 0 then raise exception 'Unknown mailbox check in %', fn; end if;
      execute replace(body, old_gate, new_gate);
    end if;
  end loop;

  fn := 'public.store_checkout(uuid,text,text,text,jsonb,text,text,boolean,uuid)'::regprocedure;
  body := pg_get_functiondef(fn);
  if strpos(body, 'if v_cust_id is null and customer is null then') = 0 then
    if body !~ 'if v_cust_id is null then\s+select id into v_cust_id' or
       body !~ phone_collision then
      raise exception 'Unknown checkout customer lookup';
    end if;
    body := regexp_replace(body, 'if v_cust_id is null then(\s+select id into v_cust_id)',
                           'if v_cust_id is null and customer is null then\1');
    execute regexp_replace(body, phone_collision, 'sc.user_id is distinct from customer');
  end if;
end $$;

create or replace function public.initialize_customer_profile(p_store_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  meta jsonb;
  v_email text;
  wanted_name text := '';
  wanted_phone text := '';
  v_customer_id uuid;
  saved_phone text;
begin
  if uid is null then raise exception 'auth_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || uid::text, 0));
  select u.raw_user_meta_data, u.email into strict meta, v_email from auth.users u where u.id = uid;
  select sc.id into v_customer_id from public.store_customers sc
    where sc.store_id = p_store_id and sc.user_id = uid;
  if v_customer_id is null and meta->>'signup_store_id' = p_store_id::text then
    wanted_name := left(trim(meta->>'full_name'), 100);
    if meta->>'phone' ~ '^01[0125][0-9]{8}$' then wanted_phone := meta->>'phone'; end if;
  end if;
  if wanted_phone <> '' then
    perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || wanted_phone, 0));
  end if;
  begin
    v_customer_id := public.sync_customer_profile(p_full_name => wanted_name, p_phone => wanted_phone, p_store_id => p_store_id);
  exception when raise_exception then
    if sqlerrm <> 'phone_already_in_use' then raise; end if;
    v_customer_id := public.sync_customer_profile(p_full_name => wanted_name, p_store_id => p_store_id);
  end;
  -- A returning shopper may have created a profile before verifying their mailbox.
  if customer_auth.mailbox_verified(uid, v_email) then
    update public.orders o set user_id = uid, customer_id = v_customer_id
    from public.store_customers guest where guest.store_id = p_store_id and guest.user_id is null
      and lower(trim(guest.email)) = lower(v_email) and o.customer_id = guest.id
      and o.user_id is null and o.store_id = p_store_id;
  end if;
  select sc.phone into saved_phone from public.store_customers sc where sc.id = v_customer_id;
  if wanted_phone <> '' and saved_phone is distinct from wanted_phone then return 'phone_unavailable'; end if;
  return 'ready';
end $$;
revoke all on function public.initialize_customer_profile(uuid) from public, anon;
grant execute on function public.initialize_customer_profile(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
