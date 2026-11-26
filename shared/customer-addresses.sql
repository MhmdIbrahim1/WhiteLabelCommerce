begin;

create unique index if not exists store_customer_tenant_key on public.store_customers(store_id, id);
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  customer_id uuid not null,
  foreign key (store_id, customer_id) references public.store_customers(store_id,id) on delete cascade,
  label text not null check (label in ('home','work','other')),
  recipient_name text not null check (length(trim(recipient_name)) between 2 and 100),
  phone text not null check (phone ~ '^[0-9]{8,15}$'),
  governorate text not null check (length(trim(governorate)) between 1 and 50),
  city text not null check (length(trim(city)) between 1 and 100),
  street text not null check (length(trim(street)) between 1 and 240),
  building text not null default '' check (length(building)<=40),
  floor text not null default '' check (length(floor)<=20),
  apartment text not null default '' check (length(apartment)<=20),
  landmark text not null default '' check (length(landmark)<=100),
  lat double precision, lng double precision,
  check ((lat is null) = (lng is null) and lat between -90 and 90 and lng between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists customer_address_default on public.customer_addresses(store_id,customer_id) where is_default;
create index if not exists customer_address_owner on public.customer_addresses(store_id,customer_id);
alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from public, anon, authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
drop policy if exists address_owner on public.customer_addresses;
create policy address_owner on public.customer_addresses for all to authenticated using (
  store_id = nullif(current_setting('app.address_store',true),'')::uuid and exists (
    select from public.store_customers sc where sc.store_id=customer_addresses.store_id
    and sc.id=customer_addresses.customer_id and sc.user_id=(select auth.uid())
  )
);

create or replace function public.my_addresses(p_store_id uuid)
returns setof public.customer_addresses language plpgsql security invoker set search_path='' as $$
begin
  perform set_config('app.address_store',p_store_id::text,true);
  return query select a.* from public.customer_addresses a where a.store_id=p_store_id
    order by a.is_default desc,a.created_at,a.id;
end $$;

create or replace function public.change_address(p_store_id uuid,p_action text,p_id uuid,p_address jsonb default '{}')
returns setof public.customer_addresses language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid;
  a public.customer_addresses;
  make_default boolean;
begin
  if auth.uid() is null or p_id is null then raise exception 'auth_required'; end if;
  perform set_config('app.address_store',p_store_id::text,true);
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || auth.uid()::text,0));
  select sc.id into owner_id from public.store_customers sc where sc.store_id=p_store_id and sc.user_id=auth.uid();
  if owner_id is null and p_action='add' then
    perform public.initialize_customer_profile(p_store_id);
    select sc.id into strict owner_id from public.store_customers sc where sc.store_id=p_store_id and sc.user_id=auth.uid();
  end if;
  select * into a from public.customer_addresses where id=p_id and store_id=p_store_id and customer_id=owner_id;
  if not found and p_action <> 'add' then raise exception 'address_not_found'; end if;
  if p_action='delete' then
    delete from public.customer_addresses where id=p_id;
    if a.is_default then
      update public.customer_addresses set is_default=true where id=(
        select id from public.customer_addresses where store_id=p_store_id and customer_id=owner_id order by created_at,id limit 1);
    end if;
  elsif p_action='default' then
    update public.customer_addresses set is_default=false where store_id=p_store_id and customer_id=owner_id and is_default and id<>p_id;
    update public.customer_addresses set is_default=true where id=p_id;
  elsif p_action in ('add','edit') then
    if p_action='add' and a.id is not null then return query select * from public.my_addresses(p_store_id); return; end if;
    make_default := coalesce(a.is_default,false) or coalesce((p_address->>'is_default')::boolean,false)
      or not exists(select from public.customer_addresses where store_id=p_store_id and customer_id=owner_id and is_default);
    if make_default then
      update public.customer_addresses set is_default=false where store_id=p_store_id and customer_id=owner_id and is_default and id<>p_id;
    end if;
    a := jsonb_populate_record(null::public.customer_addresses,p_address);
    if p_action='add' then
      insert into public.customer_addresses(id,store_id,customer_id,label,recipient_name,phone,governorate,city,street,building,floor,apartment,landmark,lat,lng,is_default)
      values(p_id,p_store_id,owner_id,a.label,a.recipient_name,a.phone,a.governorate,a.city,a.street,coalesce(a.building,''),coalesce(a.floor,''),coalesce(a.apartment,''),coalesce(a.landmark,''),a.lat,a.lng,make_default);
    else
      update public.customer_addresses set label=a.label,recipient_name=a.recipient_name,phone=a.phone,governorate=a.governorate,city=a.city,street=a.street,
        building=coalesce(a.building,''),floor=coalesce(a.floor,''),apartment=coalesce(a.apartment,''),landmark=coalesce(a.landmark,''),lat=a.lat,lng=a.lng,is_default=make_default where id=p_id;
    end if;
  else raise exception 'unknown_address_action';
  end if;
  return query select * from public.my_addresses(p_store_id);
end $$;
revoke all on function public.my_addresses(uuid), public.change_address(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.my_addresses(uuid), public.change_address(uuid,text,uuid,jsonb) to authenticated;

-- Missing overrides inherit the store's regular shipping fee.
create table if not exists public.governorate_shipping_rates (
  store_id uuid not null references public.stores(id) on delete cascade,
  governorate text not null, fee numeric(12,2) not null check(fee>=0),
  primary key(store_id,governorate)
);
alter table public.governorate_shipping_rates enable row level security;
revoke all on public.governorate_shipping_rates from public,anon,authenticated;
grant select on public.governorate_shipping_rates to anon,authenticated;
drop policy if exists read_shipping_rates on public.governorate_shipping_rates;
create policy read_shipping_rates on public.governorate_shipping_rates for select using(true);

alter table public.orders add column if not exists lat double precision,
  add column if not exists lng double precision, add column if not exists recipient_name text;
do $$ begin
  if not exists(select from pg_constraint where conrelid='public.orders'::regclass and conname='delivery_pin_valid') then
    alter table public.orders add constraint delivery_pin_valid check ((lat is null)=(lng is null) and lat between -90 and 90 and lng between -180 and 180);
  end if;
end $$;

-- Extend the installed transaction in place so all previous checkout callers keep their signature.
do $$
declare
  body text := pg_get_functiondef('public.store_checkout(uuid,text,text,text,jsonb,text,text,boolean,uuid)'::regprocedure);
begin
  if strpos(body,'app.checkout_delivery')=0 then
    if strpos(body,'new_id uuid;')=0 or strpos(body,'perform pg_advisory_xact_lock')=0 or
       strpos(body,'v_shipping_fee := settings.shipping_fee;')=0 or strpos(body,'update public.orders set subtotal = net_subtotal')=0 then
      raise exception 'Unexpected checkout definition';
    end if;
    body := replace(body,'new_id uuid;', $sql$new_id uuid;
      delivery jsonb := nullif(current_setting('app.checkout_delivery',true),'')::jsonb;$sql$);
    body := replace(body,'perform pg_advisory_xact_lock', $sql$if delivery is not null then
      fingerprint := md5(fingerprint || delivery::text || v_cust_name);
    end if;
    perform pg_advisory_xact_lock$sql$);
    body := replace(body,'v_shipping_fee := settings.shipping_fee;', $sql$select coalesce((
      select r.fee from public.governorate_shipping_rates r where r.store_id=v_store_id and r.governorate=delivery->>'governorate'
    ),settings.shipping_fee) into v_shipping_fee;$sql$);
    body := replace(body,'update public.orders set subtotal = net_subtotal',$sql$update public.orders set
      lat=(delivery->>'lat')::double precision, lng=(delivery->>'lng')::double precision,
      recipient_name=nullif(v_cust_name,''), subtotal = net_subtotal$sql$);
    body := replace(body,'when length(v_cust_name) > 0 then v_cust_name else sc.full_name','when delivery is null and length(v_cust_name) > 0 then v_cust_name else sc.full_name');
    execute body;
  end if;
end $$;

create or replace function public.checkout_delivery(p_store_id uuid, request_key uuid,address text,customer_phone text,payment text,lines jsonb,
  p_delivery jsonb,p_coupon_code text default null,p_customer_name text default null,p_use_wallet boolean default false)
returns table(order_number uuid,amount numeric,order_currency text) language plpgsql security invoker set search_path='' as $$
begin
  perform set_config('app.checkout_delivery',jsonb_build_object('governorate',p_delivery->>'governorate','lat',(p_delivery->>'lat')::double precision,'lng',(p_delivery->>'lng')::double precision)::text,true);
  return query select * from public.store_checkout(request_key,address,customer_phone,payment,lines,p_coupon_code,p_customer_name,p_use_wallet,p_store_id);
  perform set_config('app.checkout_delivery','',true);
end $$;
revoke all on function public.checkout_delivery(uuid,uuid,text,text,text,jsonb,jsonb,text,text,boolean) from public;
grant execute on function public.checkout_delivery(uuid,uuid,text,text,text,jsonb,jsonb,text,text,boolean) to anon,authenticated;

-- Reuse the delivery token's expiry and PII redaction in the same SQL snapshot.
create or replace function public.get_delivery_pin(p_token text)
returns table(lat double precision,lng double precision,recipient_name text)
language sql stable security definer set search_path='' as $$
  select o.lat,o.lng,o.recipient_name from public.get_delivery_by_token(p_token) d
    join public.orders o on o.id=d.order_id where d.shipping_address<>'';
$$;
revoke all on function public.get_delivery_pin(text) from public;
grant execute on function public.get_delivery_pin(text) to anon,authenticated;

-- Shared upstream request budget and coarse, short-lived cache for all web replicas.
create table if not exists public.reverse_geocode_cache (
  key text primary key, result jsonb not null, expires_at timestamptz not null
);
alter table public.reverse_geocode_cache enable row level security;
revoke all on public.reverse_geocode_cache from public,anon,authenticated;
grant select,insert,update,delete on public.reverse_geocode_cache to service_role;
create or replace function public.reserve_reverse_geocode(p_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare hit jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nominatim-reverse',0));
  select result into hit from public.reverse_geocode_cache where key=p_key and expires_at>clock_timestamp();
  if found then return jsonb_build_object('cached',hit); end if;
  if exists(select from public.reverse_geocode_cache where key='upstream' and expires_at>clock_timestamp()) then return '"busy"'::jsonb; end if;
  delete from public.reverse_geocode_cache where expires_at<=clock_timestamp();
  insert into public.reverse_geocode_cache values ('upstream','null',clock_timestamp()+interval '1.2 seconds');
  return '"fetch"'::jsonb;
end $$;
revoke all on function public.reserve_reverse_geocode(text) from public,anon,authenticated;
grant execute on function public.reserve_reverse_geocode(text) to service_role;
notify pgrst,'reload schema';
commit;
