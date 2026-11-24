-- Bootstrap a fresh Supabase project or upgrade the Phase 0 schema. Changes and seed data commit together.
begin;

create table if not exists public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  locale text not null,
  primary_color text not null,
  secondary_color text not null,
  surface_color text not null,
  border_radius integer not null check (border_radius >= 0),
  whatsapp_number text not null default '',
  support_email text not null,
  shipping_fee numeric(12,2) not null check (shipping_fee >= 0)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories on delete restrict,
  slug text not null unique,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default false
);
create index if not exists products_category_idx on public.products(category_id);

-- Checkout runs on a trusted backend and records prices at purchase time.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  shipping_address text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  shipping_fee numeric(12,2) not null check (shipping_fee >= 0),
  total numeric(13,2) generated always as (subtotal + shipping_fee) stored,
  created_at timestamptz not null default now()
);
-- Preserve existing order ownership when upgrading from Phase 0.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'orders' and column_name = 'customer_id') then
    alter table public.orders rename column customer_id to user_id;
  end if;
end $$;
create index if not exists orders_customer_idx on public.orders(user_id);

-- Guest submissions are unpriced until a trusted checkout records their items.
alter table public.orders alter column subtotal drop not null;
alter table public.orders drop constraint if exists orders_unpriced_status;
alter table public.orders add constraint orders_unpriced_status
  check (subtotal is not null or status in ('pending', 'cancelled'));

create or replace function public.default_order_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.currency is null or new.shipping_fee is null then
    select coalesce(new.currency, s.currency), coalesce(new.shipping_fee, s.shipping_fee)
      into strict new.currency, new.shipping_fee from public.store_settings s where s.id;
  end if;
  return new;
end $$;
create or replace trigger default_order_settings before insert on public.orders
for each row execute function public.default_order_settings();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  product_id uuid references public.products on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid default auth.uid() references auth.users on delete set null,
  subject text not null check (length(trim(subject)) > 0),
  message text not null check (length(trim(message)) > 0),
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_customer_idx on public.support_tickets(customer_id);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin'))
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
drop policy if exists read_own_profile on public.profiles;
create policy read_own_profile on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create or replace function public.create_signup_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;
revoke all on function public.create_signup_profile() from public, anon, authenticated;
create or replace trigger nova_create_signup_profile after insert on auth.users
for each row execute function public.create_signup_profile();

-- Import existing accounts once. Only server-managed Phase 0 roles carry over.
insert into public.profiles (id, role)
select id, case when raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'customer' end
from auth.users on conflict (id) do nothing;

-- The caller can read their own profile under RLS, so no elevated role is needed.
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array['store_settings','categories','products','orders','order_items','support_tickets']
  loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('revoke all on public.%I from public, anon, authenticated', relation_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', relation_name);
    execute format('drop policy if exists admin_manage on public.%I', relation_name);
    execute format('create policy admin_manage on public.%I for all to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()))', relation_name);
  end loop;
end $$;

grant select on public.store_settings, public.categories, public.products to anon;
grant insert (shipping_address) on public.orders to anon;
grant insert (subject, message) on public.support_tickets to anon;

drop policy if exists read_settings on public.store_settings;
create policy read_settings on public.store_settings for select to anon, authenticated using (true);
drop policy if exists read_categories on public.categories;
create policy read_categories on public.categories for select to anon, authenticated using (true);
drop policy if exists read_catalog on public.products;
create policy read_catalog on public.products for select to anon, authenticated using (is_active);
drop policy if exists read_own_orders on public.orders;
create policy read_own_orders on public.orders for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists read_own_items on public.order_items;
create policy read_own_items on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_id and o.user_id = (select auth.uid())));
drop policy if exists read_own_tickets on public.support_tickets;
create policy read_own_tickets on public.support_tickets for select to authenticated
  using (customer_id = (select auth.uid()));
drop policy if exists open_own_ticket on public.support_tickets;
create policy open_own_ticket on public.support_tickets for insert to authenticated
  with check (customer_id = (select auth.uid()) and status = 'open' and created_at = now());

drop policy if exists submit_guest_order on public.orders;
create policy submit_guest_order on public.orders for insert to anon
  with check (user_id is null and status = 'pending' and subtotal is null
              and length(trim(shipping_address)) > 0);
drop policy if exists submit_guest_ticket on public.support_tickets;
create policy submit_guest_ticket on public.support_tickets for insert to anon
  with check (customer_id is null and status = 'open');

insert into storage.buckets (id, name, public) values ('product-images','product-images',true)
on conflict (id) do update set public = true;
drop policy if exists nova_read_images on storage.objects;
create policy nova_read_images on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
drop policy if exists nova_upload_images on storage.objects;
create policy nova_upload_images on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
drop policy if exists nova_delete_images on storage.objects;
create policy nova_delete_images on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

insert into public.store_settings
  (store_name, currency, locale, primary_color, secondary_color, surface_color,
   border_radius, whatsapp_number, support_email, shipping_fee)
values ('Nova Store','EGP','ar-EG','#164E63','#C2410C','#FFFFFF',12,'','support@example.com',50) on conflict (id) do nothing;

insert into public.categories (slug, name) values ('accessories','إكسسوارات') on conflict (slug) do nothing;
insert into public.products (category_id, slug, name, price, stock, is_active)
select id, 'canvas-tote', 'حقيبة قماشية', 250, 10, true
from public.categories where slug = 'accessories' on conflict (slug) do nothing;

commit;

