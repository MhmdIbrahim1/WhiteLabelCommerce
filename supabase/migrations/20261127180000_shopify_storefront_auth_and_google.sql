begin;

-- A Google identity may be linked to an account that also uses other providers.
-- Match the provider's verified address to the current address on the account.
create or replace function customer_auth.has_verified_google_identity(uid uuid, address text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select from auth.identities i
    where i.user_id = uid and i.provider = 'google'
      and lower(coalesce(i.identity_data->>'email', '')) = lower(address)
      and lower(coalesce(i.identity_data->>'email_verified', 'false')) = 'true'
  );
$$;
revoke all on function customer_auth.has_verified_google_identity(uuid,text) from public, anon, authenticated, service_role;

create or replace function customer_auth.record_email_otp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into customer_auth.verified_mailboxes as m (user_id, email)
  select u.id, lower(u.email)
  from auth.sessions s join auth.users u on u.id = s.user_id
  where s.id = new.session_id and u.email_confirmed_at is not null and u.email is not null
    and ((new.authentication_method = 'otp' and nullif(u.phone, '') is null)
      or (new.authentication_method = 'oauth' and customer_auth.has_verified_google_identity(u.id, u.email)))
  on conflict (user_id) do update set email = excluded.email where m.email is distinct from excluded.email;
  return new;
end $$;
create or replace trigger customer_email_otp
after insert or update of authentication_method on auth.mfa_amr_claims
for each row when (new.authentication_method in ('otp', 'oauth'))
execute function customer_auth.record_email_otp();

insert into customer_auth.verified_mailboxes as m (user_id, email)
select u.id, lower(u.email) from auth.users u
where u.last_sign_in_at is not null and u.email_confirmed_at is not null and u.email is not null
  and customer_auth.has_verified_google_identity(u.id, u.email)
on conflict (user_id) do update set email = excluded.email where m.email is distinct from excluded.email;

-- The one-time backfill belongs to the column installation. A later checkout
-- can save a shipping name without the shopper having completed onboarding.
do $backfill$
begin
  if not exists (select from pg_attribute where attrelid = 'public.store_customers'::regclass
                 and attname = 'enrolled_at' and not attisdropped) then
    alter table public.store_customers add column enrolled_at timestamptz;
    update public.store_customers set enrolled_at = coalesce(created_at, now())
    where user_id is not null and nullif(btrim(full_name), '') is not null;
  end if;
end $backfill$;

-- Preserve Android's store default, contact update semantics and mailbox gate.
-- Only a supplied name can enroll a shopper through the legacy profile RPC.
create or replace function public.sync_customer_profile(
  p_full_name text default '', p_phone text default '', p_city text default '', p_address text default '',
  p_governorate text default '', p_store_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tenant uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
  email_address text;
  verified boolean;
  phone_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  phone_variants text[] := array[]::text[];
  supplied_name text := left(btrim(coalesce(p_full_name, '')), 120);
  gov text := left(btrim(coalesce(p_governorate, '')), 100);
  city_name text := left(btrim(coalesce(p_city, '')), 100);
  street text := left(btrim(coalesce(p_address, '')), 500);
  customer uuid;
  claimed_guest uuid;
begin
  if uid is null then raise exception 'auth_required'; end if;
  if not exists (select from public.store_settings where store_id = tenant) then raise exception 'unknown_store'; end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant::text || uid::text, 0));
  select coalesce(u.email, ''), customer_auth.mailbox_verified(u.id, u.email) into email_address, verified
  from auth.users u where u.id = uid;

  if phone_digits ~ '^2001[0125][0-9]{8}$' then
    phone_digits := '0' || substr(phone_digits, 4);
  elsif phone_digits ~ '^00201[0125][0-9]{8}$' then
    phone_digits := '0' || substr(phone_digits, 5);
  elsif phone_digits ~ '^201[0125][0-9]{8}$' then
    phone_digits := '0' || substr(phone_digits, 3);
  end if;
  if length(phone_digits) >= 8 then
    perform pg_advisory_xact_lock(hashtextextended(tenant::text || phone_digits, 0));
    phone_variants := case when phone_digits ~ '^01[0125][0-9]{8}$'
      then array[phone_digits, '20' || substr(phone_digits, 2)] else array[phone_digits] end;
  end if;

  select sc.id into customer from public.store_customers sc where sc.store_id = tenant and sc.user_id = uid;
  if customer is null and verified and length(btrim(email_address)) > 3 then
    select sc.id into claimed_guest from public.store_customers sc
    where sc.store_id = tenant and sc.user_id is null and lower(btrim(sc.email)) = lower(btrim(email_address))
    order by sc.updated_at desc, sc.id limit 1 for update;
    customer := claimed_guest;
  end if;

  if exists (select from public.store_customers sc where sc.store_id = tenant and sc.id is distinct from customer
             and sc.user_id is not null and sc.phone = any(phone_variants)) then
    raise exception 'phone_already_in_use';
  end if;
  if length(phone_digits) >= 8 and exists (
    select from public.store_customers sc where sc.store_id = tenant and sc.id is distinct from customer
      and sc.user_id is null and sc.phone = phone_digits
  ) then
    phone_digits := '';
  end if;

  if customer is null then
    insert into public.store_customers(store_id, user_id, full_name, phone, email, governorate, city, address, enrolled_at)
    values(tenant, uid, supplied_name, phone_digits, email_address, gov, city_name, street,
           case when supplied_name <> '' then now() end)
    returning id into customer;
  else
    update public.store_customers sc set user_id = uid,
      full_name = coalesce(nullif(supplied_name, ''), sc.full_name),
      enrolled_at = case when supplied_name <> '' then coalesce(sc.enrolled_at, now()) else sc.enrolled_at end,
      phone = case when length(phone_digits) >= 8 then phone_digits else sc.phone end,
      email = coalesce(nullif(email_address, ''), sc.email),
      governorate = coalesce(nullif(gov, ''), sc.governorate), city = coalesce(nullif(city_name, ''), sc.city),
      address = coalesce(nullif(street, ''), sc.address), updated_at = now()
    where sc.id = customer and sc.store_id = tenant;
  end if;

  if claimed_guest is not null then
    update public.orders set user_id = uid, customer_id = customer
    where store_id = tenant and user_id is null and customer_id = claimed_guest;
  end if;
  update public.orders set customer_id = customer where store_id = tenant and user_id = uid and customer_id is null;
  return customer;
end $$;

create or replace function public.store_customer_membership(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  membership jsonb;
begin
  if uid is null then raise exception 'auth_required'; end if;
  if not exists (select from public.stores where id = p_store_id and status <> 'suspended') then
    raise exception 'store_unavailable';
  end if;
  select jsonb_build_object('enrolled', true, 'full_name', sc.full_name, 'phone', sc.phone) into membership
  from public.store_customers sc where sc.store_id = p_store_id and sc.user_id = uid
    and sc.enrolled_at is not null and nullif(btrim(sc.full_name), '') is not null;
  return coalesce(membership, '{"enrolled":false,"full_name":"","phone":""}'::jsonb);
end $$;

create or replace function public.complete_store_customer_onboarding(p_store_id uuid, p_full_name text, p_phone text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  email_address text;
  supplied_name text := btrim(coalesce(p_full_name, ''));
  phone_input text := btrim(coalesce(p_phone, ''));
  mobile text := '';
  customer uuid;
  saved_phone text;
  conflicting_index text;
begin
  if uid is null then raise exception 'auth_required'; end if;
  if not exists (select from public.stores where id = p_store_id and status <> 'suspended') then
    raise exception 'store_unavailable';
  end if;
  select lower(btrim(u.email)) into email_address from auth.users u
  where u.id = uid and nullif(btrim(u.email), '') is not null
    and (customer_auth.mailbox_verified(u.id, u.email) or u.email_confirmed_at is not null);
  if email_address is null then raise exception 'unconfirmed'; end if;
  if length(supplied_name) not between 2 and 100 then raise exception 'invalid_name'; end if;
  if phone_input <> '' then
    mobile := translate(phone_input, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
    mobile := regexp_replace(mobile, '[[:space:]()-]', '', 'g');
    mobile := regexp_replace(mobile, '^([+]20|0020|20)0?', '0');
    if mobile !~ '^01[0125][0-9]{8}$' then raise exception 'invalid_phone'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || uid::text, 0));
  if mobile <> '' then perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || mobile, 0)); end if;
  begin
    customer := public.sync_customer_profile(p_full_name => supplied_name, p_phone => mobile, p_store_id => p_store_id);
  exception when unique_violation then
    get stacked diagnostics conflicting_index = constraint_name;
    if conflicting_index = 'store_customers_store_phone_uidx' then raise exception 'phone_already_in_use'; end if;
    raise;
  end;
  update public.store_customers sc set enrolled_at = coalesce(sc.enrolled_at, now())
  where sc.id = customer and sc.user_id = uid and sc.store_id = p_store_id returning sc.phone into strict saved_phone;
  -- Legacy clients can skip a guest's occupied phone. An explicit submission
  -- must surface the conflict and roll the entire enrollment back.
  if mobile <> '' and saved_phone is distinct from mobile then raise exception 'phone_already_in_use'; end if;
  update public.orders o set user_id = uid, customer_id = customer from public.store_customers guest
  where guest.store_id = p_store_id and guest.user_id is null and lower(btrim(guest.email)) = email_address
    and o.customer_id = guest.id and o.user_id is null and o.store_id = p_store_id;
  return 'ready';
end $$;

revoke all on function public.store_customer_membership(uuid), public.complete_store_customer_onboarding(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.store_customer_membership(uuid), public.complete_store_customer_onboarding(uuid,text,text)
  to authenticated;

drop policy if exists support_thread_read on public.support_ticket_messages;
create policy support_thread_read on public.support_ticket_messages for select to authenticated using (
  public.has_store_permission(store_id, 'manage_customers') or exists (
    select from public.support_tickets t where t.id = support_ticket_messages.ticket_id
      and t.store_id = support_ticket_messages.store_id and t.customer_id = (select auth.uid())
  )
);

-- A support ticket can predate enrollment. The agent sees the current
-- account email and a store-local name only when the store has one on file.
create or replace function public.admin_support_detail(p_store_id uuid, p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.has_store_permission(p_store_id, 'manage_customers') is not true then raise insufficient_privilege; end if;
  return (select jsonb_build_object('id',t.id,'subject',t.subject,'status',t.status,'priority',t.priority,'is_read',t.is_read,
    'read_at',t.read_at,'last_message_at',t.last_message_at,'order_id',t.order_id,'created_at',t.created_at,
    'customer_name',nullif(btrim(c.full_name),''),'customer_email',coalesce(nullif(c.email,''),u.email),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at)
      order by m.created_at,m.id) from public.support_ticket_messages m where m.ticket_id=t.id),'[]'::jsonb))
    from public.support_tickets t left join public.store_customers c on c.store_id=t.store_id and c.user_id=t.customer_id
    left join auth.users u on u.id=t.customer_id where t.store_id=p_store_id and t.id=p_ticket_id);
end $$;

create or replace function public.submit_product_review(p_store_id uuid, p_product_id uuid, p_rating smallint, p_comment text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  purchased_order uuid;
  display_name text;
  saved public.product_reviews%rowtype;
begin
  if uid is null then raise exception 'auth_required'; end if;
  if p_store_id is null or p_product_id is null then raise exception 'invalid_review_target'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating'; end if;
  if not exists (select from public.products where id = p_product_id and store_id = p_store_id) then
    raise exception 'product_not_found';
  end if;
  select o.id into purchased_order from public.orders o join public.order_items i on i.order_id = o.id
  where o.store_id = p_store_id and o.user_id = uid and o.status = 'delivered' and i.product_id = p_product_id
  order by coalesce(o.delivered_at, o.created_at) desc limit 1;
  if purchased_order is null then raise exception 'verified_purchase_required'; end if;

  -- A public review must never publish another store's signup name or the
  -- local part of the buyer's private login address.
  select nullif(btrim(sc.full_name), '') into display_name from public.store_customers sc
  where sc.store_id = p_store_id and sc.user_id = uid;
  insert into public.product_reviews(store_id, product_id, user_id, order_id, author_name, rating, comment,
                                     is_verified_purchase, status, updated_at)
  values (p_store_id, p_product_id, uid, purchased_order, left(coalesce(display_name, 'Verified Buyer'),80),
          p_rating, left(btrim(coalesce(p_comment, '')),1500), true, 'published', now())
  on conflict on constraint product_reviews_store_product_user_uidx do update set
    order_id = coalesce(excluded.order_id, public.product_reviews.order_id), author_name = excluded.author_name,
    rating = excluded.rating, comment = excluded.comment, is_verified_purchase = true, updated_at = now()
  returning * into saved;
  return jsonb_build_object('id',saved.id,'store_id',saved.store_id,'product_id',saved.product_id,'user_id',saved.user_id,
    'order_id',saved.order_id,'author_name',saved.author_name,'rating',saved.rating,'comment',saved.comment,
    'is_verified_purchase',saved.is_verified_purchase,'status',saved.status,'admin_reply',saved.admin_reply,
    'admin_replied_at',saved.admin_replied_at,'created_at',saved.created_at,'updated_at',saved.updated_at);
end $$;

notify pgrst, 'reload schema';
commit;
