-- Phase 9: Unified Smart Notification Engine (FCM + Web Push + Supabase Realtime)
-- Creates push_subscriptions, notifications, back_in_stock_subscriptions,
-- notification_preferences, and cart_sessions (for abandoned cart recovery),
-- configures strict multi-tenant store_id RLS, enables Realtime on notifications,
-- and adds SECURITY DEFINER RPCs for safe guest/customer push & restock registration.
-- Apply after phase-8-paymob.sql. Idempotent and safe to re-run.
begin;

-- 1. Multi-platform Push Subscriptions (Android FCM & Web Push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
    references public.store_settings(store_id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  guest_session_id text,
  phone text,
  platform text not null check (platform in ('android', 'web')),
  token text not null,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_push_subscriptions_store_platform_token
  on public.push_subscriptions (store_id, platform, token);

create index if not exists idx_push_subscriptions_store_user
  on public.push_subscriptions (store_id, user_id)
  where user_id is not null;

create index if not exists idx_push_subscriptions_store_phone
  on public.push_subscriptions (store_id, phone)
  where phone is not null;

create index if not exists idx_push_subscriptions_store_active
  on public.push_subscriptions (store_id, is_active, platform);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated, service_role;

drop policy if exists admin_manage_push_subscriptions on public.push_subscriptions;
create policy admin_manage_push_subscriptions
  on public.push_subscriptions
  for all
  to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

drop policy if exists user_manage_own_push_subscriptions on public.push_subscriptions;
create policy user_manage_own_push_subscriptions
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 2. Unified Bilingual Notifications Inbox & Audit Log (Realtime enabled)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
    references public.store_settings(store_id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  target_role text not null default 'customer' check (target_role in ('customer', 'admin')),
  category text not null check (
    category in (
      'order_update',
      'payment_recovery',
      'abandoned_cart',
      'back_in_stock',
      'promo_campaign',
      'admin_alert'
    )
  ),
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  deep_link text not null default '/',
  data jsonb not null default '{}'::jsonb,
  dedupe_key text null unique,
  is_read boolean not null default false,
  sent_push boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_inbox
  on public.notifications (store_id, user_id, is_read, created_at desc);

create index if not exists idx_notifications_role_created
  on public.notifications (store_id, target_role, created_at desc);

create index if not exists idx_notifications_category_created
  on public.notifications (store_id, category, created_at desc);

alter table public.notifications replica identity full;
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, insert, update, delete on public.notifications to authenticated, service_role;
grant select on public.notifications to anon;

drop policy if exists admin_manage_notifications on public.notifications;
create policy admin_manage_notifications
  on public.notifications
  for all
  to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

drop policy if exists customer_read_own_notifications on public.notifications;
create policy customer_read_own_notifications
  on public.notifications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (target_role = 'customer' and user_id is null)
  );

drop policy if exists anon_read_public_promo_notifications on public.notifications;
create policy anon_read_public_promo_notifications
  on public.notifications
  for select
  to anon
  using (target_role = 'customer' and user_id is null and category = 'promo_campaign');

drop policy if exists customer_mark_own_notifications_read on public.notifications;
create policy customer_mark_own_notifications_read
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Back-in-Stock ("Notify Me") Subscriptions
create table if not exists public.back_in_stock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
    references public.store_settings(store_id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_key text not null default '',
  user_id uuid null references auth.users(id) on delete set null,
  phone text,
  push_token text,
  notified_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_back_in_stock_pending
  on public.back_in_stock_subscriptions (store_id, product_id)
  where notified_at is null;

create unique index if not exists idx_back_in_stock_unique_user
  on public.back_in_stock_subscriptions (store_id, product_id, variant_key, user_id)
  where notified_at is null and user_id is not null;

create unique index if not exists idx_back_in_stock_unique_phone
  on public.back_in_stock_subscriptions (store_id, product_id, variant_key, phone)
  where notified_at is null and phone is not null and phone <> '';

alter table public.back_in_stock_subscriptions enable row level security;
revoke all on public.back_in_stock_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.back_in_stock_subscriptions to authenticated, service_role;

drop policy if exists admin_manage_back_in_stock on public.back_in_stock_subscriptions;
create policy admin_manage_back_in_stock
  on public.back_in_stock_subscriptions
  for all
  to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

drop policy if exists user_read_own_back_in_stock on public.back_in_stock_subscriptions;
create policy user_read_own_back_in_stock
  on public.back_in_stock_subscriptions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- 4. User Notification Preferences & Quiet Hours
create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
    references public.store_settings(store_id) on delete cascade,
  order_updates boolean not null default true,
  promotions boolean not null default true,
  restock_alerts boolean not null default true,
  quiet_hours_start text not null default '23:00' check (quiet_hours_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_hours_end text not null default '09:00' check (quiet_hours_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated, service_role;

drop policy if exists admin_read_notification_prefs on public.notification_preferences;
create policy admin_read_notification_prefs
  on public.notification_preferences
  for select
  to authenticated
  using ((select public.is_store_admin(store_id)));

drop policy if exists user_manage_own_notification_prefs on public.notification_preferences;
create policy user_manage_own_notification_prefs
  on public.notification_preferences
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 5. Lightweight Cart Activity Heartbeat (for Abandoned Cart > 1h Recovery)
create table if not exists public.cart_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
    references public.store_settings(store_id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  guest_session_id text not null,
  phone text,
  push_token text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  item_count integer not null default 0 check (item_count >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  abandoned_notified_at timestamptz null,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_cart_sessions_store_guest
  on public.cart_sessions (store_id, guest_session_id);

create index if not exists idx_cart_sessions_abandoned_scan
  on public.cart_sessions (store_id, updated_at)
  where item_count > 0 and abandoned_notified_at is null;

alter table public.cart_sessions enable row level security;
revoke all on public.cart_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.cart_sessions to service_role;
grant select on public.cart_sessions to authenticated;

drop policy if exists admin_read_cart_sessions on public.cart_sessions;
create policy admin_read_cart_sessions
  on public.cart_sessions
  for select
  to authenticated
  using ((select public.is_store_admin(store_id)));

-- 6. SECURITY DEFINER RPCs for safe guest + authenticated token & restock registration
create or replace function public.register_push_subscription(
  p_store_id uuid,
  p_platform text,
  p_token text,
  p_locale text default 'ar',
  p_guest_session_id text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_token text := trim(coalesce(p_token, ''));
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_locale text := case when lower(trim(coalesce(p_locale, 'ar'))) = 'en' then 'en' else 'ar' end;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), '');
  v_guest text := nullif(trim(coalesce(p_guest_session_id, '')), '');
  v_id uuid;
begin
  if p_store_id is null or length(v_token) < 16 or v_platform not in ('android', 'web') then
    raise exception 'invalid_push_subscription';
  end if;

  insert into public.push_subscriptions (
    store_id, user_id, guest_session_id, phone, platform, token, locale, is_active, last_seen_at
  )
  values (
    p_store_id, v_uid, v_guest, v_phone, v_platform, v_token, v_locale, true, now()
  )
  on conflict (store_id, platform, token) do update
  set user_id = coalesce(excluded.user_id, public.push_subscriptions.user_id),
      guest_session_id = coalesce(excluded.guest_session_id, public.push_subscriptions.guest_session_id),
      phone = coalesce(excluded.phone, public.push_subscriptions.phone),
      locale = excluded.locale,
      is_active = true,
      last_seen_at = now()
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.register_push_subscription(uuid, text, text, text, text, text) from public;
grant execute on function public.register_push_subscription(uuid, text, text, text, text, text) to anon, authenticated;

create or replace function public.subscribe_back_in_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_key text default '',
  p_phone text default null,
  p_push_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_variant text := trim(coalesce(p_variant_key, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), '');
  v_token text := nullif(trim(coalesce(p_push_token, '')), '');
  v_existing uuid;
  v_id uuid;
begin
  if p_store_id is null or p_product_id is null then
    raise exception 'invalid_restock_request';
  end if;

  if v_uid is null and v_phone is null and v_token is null then
    raise exception 'contact_required';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.store_id = p_store_id and p.is_active = true
  ) then
    raise exception 'product_not_found';
  end if;

  if v_uid is not null then
    select id into v_existing
    from public.back_in_stock_subscriptions
    where store_id = p_store_id and product_id = p_product_id
      and variant_key = v_variant and user_id = v_uid and notified_at is null
    limit 1;
  elsif v_phone is not null then
    select id into v_existing
    from public.back_in_stock_subscriptions
    where store_id = p_store_id and product_id = p_product_id
      and variant_key = v_variant and phone = v_phone and notified_at is null
    limit 1;
  end if;

  if v_existing is not null then
    update public.back_in_stock_subscriptions
    set phone = coalesce(v_phone, phone),
        push_token = coalesce(v_token, push_token)
    where id = v_existing;
    return v_existing;
  end if;

  insert into public.back_in_stock_subscriptions (
    store_id, product_id, variant_key, user_id, phone, push_token
  )
  values (
    p_store_id, p_product_id, v_variant, v_uid, v_phone, v_token
  )
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.subscribe_back_in_stock(uuid, uuid, text, text, text) from public;
grant execute on function public.subscribe_back_in_stock(uuid, uuid, text, text, text) to anon, authenticated;

-- 7. Enable Supabase Realtime on public.notifications
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
