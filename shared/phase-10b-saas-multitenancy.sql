-- Phase 10B: True Multi-Tenant SaaS Engine, Self-Serve Store Onboarding & Super-Admin Portal
-- Backward-compatible upgrade: preserves Nova Store (00000000-0000-0000-0000-000000000001) and all Phase 0-10A features.
-- Apply after phase-10a-wallet-incentives.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 1. TENANT DIRECTORY (`public.stores`) & NOVA STORE BACKFILL
-- ============================================================================
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null default '',
  slug text not null,
  custom_domain text null,
  plan text not null default 'starter',
  status text not null default 'active',
  max_products integer not null default 50,
  owner_user_id uuid null references auth.users(id) on delete set null,
  subscription_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores
  add column if not exists name_ar text not null default 'Store',
  add column if not exists name_en text not null default '',
  add column if not exists slug text,
  add column if not exists custom_domain text null,
  add column if not exists plan text not null default 'starter',
  add column if not exists status text not null default 'active',
  add column if not exists max_products integer not null default 50,
  add column if not exists owner_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists subscription_expires_at timestamptz null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.stores drop constraint if exists stores_plan_check;
alter table public.stores add constraint stores_plan_check
  check (plan in ('starter', 'growth', 'enterprise'));

alter table public.stores drop constraint if exists stores_status_check;
alter table public.stores add constraint stores_status_check
  check (status in ('active', 'trial', 'suspended'));

alter table public.stores drop constraint if exists stores_max_products_check;
alter table public.stores add constraint stores_max_products_check
  check (max_products >= 0);

alter table public.stores drop constraint if exists stores_slug_format_check;
alter table public.stores add constraint stores_slug_format_check
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) between 3 and 40);

create unique index if not exists stores_slug_uidx on public.stores (slug);
create unique index if not exists stores_custom_domain_uidx
  on public.stores (lower(custom_domain))
  where custom_domain is not null and length(trim(custom_domain)) > 0;
create index if not exists stores_owner_idx on public.stores (owner_user_id);

-- Backfill Nova Store (00000000-0000-0000-0000-000000000001)
do $$
declare
  v_nova_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_nova_name text;
  v_owner_id uuid;
begin
  select coalesce(nullif(trim(s.store_name), ''), 'Nova Store')
  into v_nova_name
  from public.store_settings s
  where s.store_id = v_nova_id or s.id = true
  limit 1;

  if v_nova_name is null then
    v_nova_name := 'Nova Store';
  end if;

  select p.id
  into v_owner_id
  from public.profiles p
  where p.role = 'admin'
  order by case when p.store_id = v_nova_id then 0 else 1 end, p.id
  limit 1;

  insert into public.stores (
    id, name_ar, name_en, slug, plan, status, max_products, owner_user_id
  )
  values (
    v_nova_id, v_nova_name, 'Nova Store', 'nova-store', 'enterprise', 'active', 10000, v_owner_id
  )
  on conflict (id) do update
  set slug = coalesce(nullif(public.stores.slug, ''), 'nova-store'),
      plan = 'enterprise',
      status = coalesce(public.stores.status, 'active'),
      max_products = greatest(public.stores.max_products, 10000),
      owner_user_id = coalesce(public.stores.owner_user_id, excluded.owner_user_id),
      updated_at = now();
end $$;

alter table public.stores alter column slug set not null;

-- ============================================================================
-- 2. PLATFORM SUPER-ADMIN & MULTI-STORE MEMBERSHIP SECURITY
-- ============================================================================
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'super_admin',
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;
grant select on public.platform_admins to authenticated;
grant select, insert, update, delete on public.platform_admins to service_role;

drop policy if exists platform_admin_read_self on public.platform_admins;
create policy platform_admin_read_self on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Seed existing Nova Store admin(s) as platform super-admins
insert into public.platform_admins (user_id, role)
select p.id, 'super_admin'
from public.profiles p
where p.role = 'admin'
on conflict (user_id) do nothing;

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index if not exists store_members_user_idx on public.store_members (user_id, store_id);

-- Backfill existing store admins into store_members
insert into public.store_members (store_id, user_id, role)
select
  coalesce(
    (select st.id from public.stores st where st.id = p.store_id),
    '00000000-0000-0000-0000-000000000001'::uuid
  ),
  p.id,
  'owner'
from public.profiles p
where p.role = 'admin'
on conflict (store_id, user_id) do nothing;

-- Helper: Is caller a platform super-admin?
create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = '' as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  )
$$;
revoke all on function public.is_platform_super_admin() from public, anon;
grant execute on function public.is_platform_super_admin() to authenticated, service_role;

-- Upgrade is_store_admin(target_store_id): super-admin OR store_members owner/admin OR legacy profiles admin
create or replace function public.is_store_admin(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = '' as $$
  select
    public.is_platform_super_admin()
    or exists (
      select 1
      from public.store_members sm
      where sm.store_id = target_store_id
        and sm.user_id = (select auth.uid())
        and sm.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.store_id = target_store_id
    )
$$;
revoke all on function public.is_store_admin(uuid) from public, anon;
grant execute on function public.is_store_admin(uuid) to authenticated, service_role;

-- Upgrade is_admin(): true if caller is super-admin OR manages at least one store (used by storage.objects policies)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = '' as $$
  select
    public.is_platform_super_admin()
    or exists (
      select 1
      from public.store_members sm
      where sm.user_id = (select auth.uid())
        and sm.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- RLS on public.store_members
alter table public.store_members enable row level security;
revoke all on public.store_members from public, anon, authenticated;
grant select, insert, update, delete on public.store_members to authenticated, service_role;

drop policy if exists read_own_store_memberships on public.store_members;
create policy read_own_store_memberships on public.store_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_super_admin()));

drop policy if exists manage_store_memberships on public.store_members;
create policy manage_store_memberships on public.store_members
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

-- RLS on public.stores (public read for storefront tenant resolution; strict super-admin/owner write)
alter table public.stores enable row level security;
revoke all on public.stores from public, anon, authenticated;
grant select on public.stores to anon, authenticated;
grant select, insert, update, delete on public.stores to service_role;

drop policy if exists public_read_stores on public.stores;
create policy public_read_stores on public.stores
  for select to anon, authenticated
  using (true);

drop policy if exists super_admin_manage_stores on public.stores;
create policy super_admin_manage_stores on public.stores
  for all to authenticated
  using ((select public.is_platform_super_admin()))
  with check ((select public.is_platform_super_admin()));

-- ============================================================================
-- 3. CONVERT `store_settings`, `categories`, `products`, `support_tickets` TO TRUE MULTI-TENANCY
-- ============================================================================

-- 3a. Convert public.store_settings from singleton boolean PK (`id=true`) to multi-tenant PK (`store_id`)
--     while keeping `id = true` ONLY on Nova Store so legacy `where id = true` queries continue returning Nova Store!
do $$
declare
  v_pk_col text;
  v_chk record;
begin
  select a.attname
  into v_pk_col
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = 'public.store_settings'::regclass
    and i.indisprimary
  limit 1;

  -- Drop legacy singleton check constraint (`check (id)`)
  alter table public.store_settings drop constraint if exists store_settings_id_check;
  for v_chk in
    select conname
    from pg_constraint
    where conrelid = 'public.store_settings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\yid\y'
  loop
    execute format('alter table public.store_settings drop constraint if exists %I', v_chk.conname);
  end loop;

  if v_pk_col = 'id' then
    alter table public.store_settings drop constraint if exists store_settings_pkey;
    alter table public.store_settings alter column id drop not null;
    alter table public.store_settings alter column id set default false;
    alter table public.store_settings add constraint store_settings_pkey primary key (store_id);
  end if;
end $$;

update public.store_settings
set id = (store_id = '00000000-0000-0000-0000-000000000001'::uuid)
where id is distinct from (store_id = '00000000-0000-0000-0000-000000000001'::uuid);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.store_settings'::regclass
      and conname = 'store_settings_store_fk'
  ) then
    alter table public.store_settings
      add constraint store_settings_store_fk
      foreign key (store_id) references public.stores(id) on delete cascade;
  end if;
end $$;

drop policy if exists admin_manage on public.store_settings;
create policy admin_manage on public.store_settings
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

-- 3b. Scope public.categories by store_id and replace global slug unique with per-store unique
alter table public.categories
  add column if not exists store_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_store_fk'
  ) then
    alter table public.categories
      add constraint categories_store_fk
      foreign key (store_id) references public.stores(id) on delete cascade;
  end if;
end $$;

alter table public.categories drop constraint if exists categories_slug_key;
create unique index if not exists categories_store_slug_uidx on public.categories (store_id, slug);
create index if not exists categories_store_idx on public.categories (store_id, name);

drop policy if exists admin_manage on public.categories;
create policy admin_manage on public.categories
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

-- 3c. Replace global products.slug unique with per-store unique + store FK
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_store_fk'
  ) then
    alter table public.products
      add constraint products_store_fk
      foreign key (store_id) references public.stores(id) on delete cascade;
  end if;
end $$;

alter table public.products drop constraint if exists products_slug_key;
create unique index if not exists products_store_slug_uidx on public.products (store_id, slug);

-- 3d. Scope order_items & support_tickets RLS strictly by store_id
drop policy if exists admin_manage on public.order_items;
create policy admin_manage on public.order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_store_admin(o.store_id))
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (select public.is_store_admin(o.store_id))
    )
  );

drop policy if exists admin_manage on public.support_tickets;
create policy admin_manage on public.support_tickets
  for all to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

grant insert (store_id, subject, message) on public.support_tickets to anon;

-- Update default_order_settings trigger to match new.store_id
create or replace function public.default_order_settings()
returns trigger
language plpgsql
set search_path = '' as $$
declare
  v_store_id uuid := coalesce(new.store_id, '00000000-0000-0000-0000-000000000001'::uuid);
begin
  new.store_id := v_store_id;
  if new.currency is null or new.shipping_fee is null then
    select coalesce(new.currency, s.currency), coalesce(new.shipping_fee, s.shipping_fee)
    into strict new.currency, new.shipping_fee
    from public.store_settings s
    where s.store_id = v_store_id;
  end if;
  return new;
end $$;

-- ============================================================================
-- 4. PLAN LIMIT ENFORCEMENT (`max_products`) ON PRODUCT CREATION
-- ============================================================================
create or replace function public.enforce_store_max_products()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
declare
  v_max integer;
  v_count bigint;
begin
  select st.max_products
  into v_max
  from public.stores st
  where st.id = new.store_id
  for update;

  if not found then
    raise exception 'unknown_store';
  end if;

  select count(*)
  into v_count
  from public.products p
  where p.store_id = new.store_id;

  if v_count >= v_max then
    raise exception 'store_product_limit_reached'
      using detail = 'max_products=' || v_max::text;
  end if;

  return new;
end $$;

revoke all on function public.enforce_store_max_products() from public, anon, authenticated;

drop trigger if exists trg_enforce_store_max_products on public.products;
create trigger trg_enforce_store_max_products
  before insert on public.products
  for each row
  execute function public.enforce_store_max_products();

-- ============================================================================
-- 5. SLUG AVAILABILITY & ATOMIC STORE PROVISIONING RPCs
-- ============================================================================
create or replace function public.check_store_slug_available(p_slug text)
returns table(available boolean, reason text)
language plpgsql
stable
security definer
set search_path = '' as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_reserved text[] := array[
    'admin', 'super-admin', 'api', 'auth', 'account', 'cart', 'checkout',
    'create-store', 's', 'products', 'orders', 'login', 'register',
    'contact', 'support', 'delivery', 'www', 'app', 'dashboard',
    'settings', 'static', 'assets', 'public', 'health'
  ];
begin
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug) not between 3 and 40 then
    return query select false, 'invalid'::text;
    return;
  end if;

  if v_slug = any(v_reserved) then
    return query select false, 'reserved'::text;
    return;
  end if;

  if exists (select 1 from public.stores st where st.slug = v_slug) then
    return query select false, 'taken'::text;
    return;
  end if;

  return query select true, 'ok'::text;
end $$;

revoke all on function public.check_store_slug_available(text) from public;
grant execute on function public.check_store_slug_available(text) to anon, authenticated, service_role;

create or replace function public.provision_new_store(
  p_name_ar text,
  p_name_en text,
  p_slug text,
  p_preset_key text default 'modern-minimal',
  p_contact_phone text default '',
  p_currency text default 'EGP'
)
returns table(store_id uuid, slug text)
language plpgsql
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_owner_email text := '';
  v_name_ar text := left(trim(coalesce(p_name_ar, '')), 120);
  v_name_en text := left(trim(coalesce(p_name_en, '')), 120);
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_preset text := lower(trim(coalesce(p_preset_key, 'modern-minimal')));
  v_phone text := left(trim(coalesce(p_contact_phone, '')), 32);
  v_currency text := upper(trim(coalesce(p_currency, 'EGP')));
  v_reserved text[] := array[
    'admin', 'super-admin', 'api', 'auth', 'account', 'cart', 'checkout',
    'create-store', 's', 'products', 'orders', 'login', 'register',
    'contact', 'support', 'delivery', 'www', 'app', 'dashboard',
    'settings', 'static', 'assets', 'public', 'health'
  ];
  v_primary text;
  v_accent text;
  v_surface text;
  v_page_bg text;
  v_radius integer;
  v_hero_layout text;
  v_grid_cols integer;
  v_store_id uuid;
  v_ui_config jsonb;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if length(v_name_ar) < 2 then
    raise exception 'invalid_store_name';
  end if;
  if length(v_name_en) = 0 then
    v_name_en := v_name_ar;
  end if;

  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug) not between 3 and 40 then
    raise exception 'invalid_slug';
  end if;
  if v_slug = any(v_reserved) then
    raise exception 'reserved_slug';
  end if;
  if exists (select 1 from public.stores st where st.slug = v_slug) then
    raise exception 'slug_taken';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    v_currency := 'EGP';
  end if;

  if v_preset not in ('modern-minimal', 'luxury-boutique', 'vibrant-pop', 'tech-grid') then
    v_preset := 'modern-minimal';
  end if;

  case v_preset
    when 'luxury-boutique' then
      v_primary := '#242322'; v_accent := '#856425'; v_surface := '#FFFDFA'; v_page_bg := '#F5F1EA'; v_radius := 4; v_hero_layout := 'full-bleed'; v_grid_cols := 3;
    when 'vibrant-pop' then
      v_primary := '#752AA0'; v_accent := '#B92D59'; v_surface := '#FFFCFF'; v_page_bg := '#FAF2FC'; v_radius := 20; v_hero_layout := 'bento'; v_grid_cols := 4;
    when 'tech-grid' then
      v_primary := '#303D87'; v_accent := '#17677A'; v_surface := '#FAFCFF'; v_page_bg := '#EDF1F8'; v_radius := 8; v_hero_layout := 'bento'; v_grid_cols := 4;
    else
      v_primary := '#164E63'; v_accent := '#C2410C'; v_surface := '#FFFFFF'; v_page_bg := '#F6F8F9'; v_radius := 12; v_hero_layout := 'split'; v_grid_cols := 4;
  end case;

  select coalesce(u.email, '') into v_owner_email from auth.users u where u.id = v_uid;

  insert into public.stores (
    name_ar, name_en, slug, plan, status, max_products, owner_user_id
  )
  values (
    v_name_ar, v_name_en, v_slug, 'starter', 'active', 50, v_uid
  )
  returning id into v_store_id;

  insert into public.store_members (store_id, user_id, role)
  values (v_store_id, v_uid, 'owner')
  on conflict on constraint store_members_pkey do update set role = 'owner';

  v_ui_config := jsonb_build_object(
    'version', 1,
    'baseTemplate', v_preset,
    'defaultLanguage', 'ar',
    'global', jsonb_build_object(
      'primaryButtonBg', v_primary,
      'primaryButtonText', '#FFFFFF',
      'pageBg', v_page_bg,
      'cardSurface', v_surface,
      'accentBadge', v_accent,
      'borderRadius', v_radius,
      'motionIntensity', 'smooth'
    ),
    'pages', jsonb_build_object(
      'home', jsonb_build_object(
        'heroLayout', v_hero_layout,
        'heroBg', v_primary,
        'heroText', '#FFFFFF',
        'bannerSpeedMs', 4500,
        'categoryCardStyle', 'pills',
        'entranceAnimation', 'fade-up',
        'hero_visible', true,
        'hero_badge_visible', true,
        'hero_badge_ar', 'وصل حديثاً',
        'hero_badge_en', 'New Arrivals',
        'hero_title_ar', 'أهلاً بك في ' || v_name_ar,
        'hero_title_en', 'Welcome to ' || v_name_en,
        'hero_subtitle_ar', 'تشكيلة مختارة بعناية مع شحن سريع لجميع المحافظات.',
        'hero_subtitle_en', 'Carefully curated products with fast nationwide shipping.',
        'hero_cta_visible', true,
        'hero_cta_text_ar', 'تسوّق الآن',
        'hero_cta_text_en', 'Shop Now',
        'hero_cta_link', '/products',
        'hero_image_url', null,
        'hero_overlay_opacity', 45,
        'promo_banners', jsonb_build_array(
          jsonb_build_object(
            'id', 'slide-welcome',
            'active', true,
            'imageUrl', '',
            'badge_ar', 'افتتاح جديد',
            'badge_en', 'Grand Opening',
            'title_ar', 'أهلاً بك في ' || v_name_ar,
            'title_en', 'Welcome to ' || v_name_en,
            'subtitle_ar', 'اكتشف منتجاتنا المختارة مع شحن سريع وخدمة عملاء متميزة.',
            'subtitle_en', 'Discover our curated collection with fast delivery and dedicated support.',
            'ctaText_ar', 'تسوّق الآن',
            'ctaText_en', 'Shop Now',
            'targetRoute', '/products',
            'accentColor', v_primary
          ),
          jsonb_build_object(
            'id', 'slide-shipping',
            'active', true,
            'imageUrl', '',
            'badge_ar', 'شحن مجاني',
            'badge_en', 'Free Shipping',
            'title_ar', 'شحن مجاني للطلبات فوق 1,000 ' || v_currency,
            'title_en', 'Free Shipping on Orders Over 1,000 ' || v_currency,
            'subtitle_ar', 'واكسب 5% كاش باك في محفظتك مع كل طلب يتم تسليمه.',
            'subtitle_en', 'Plus earn 5% wallet cashback on every delivered order.',
            'ctaText_ar', 'اكتشف العروض',
            'ctaText_en', 'Explore Offers',
            'targetRoute', '/products',
            'accentColor', v_accent
          )
        )
      ),
      'products', jsonb_build_object(
        'gridColumns', v_grid_cols,
        'cardHoverEffect', 'zoom',
        'priceBadgeColor', v_primary,
        'addToCartStyle', 'solid'
      ),
      'product_details', jsonb_build_object(
        'galleryStyle', 'thumbnails-bottom',
        'ctaButtonColor', v_primary,
        'variantSelectorStyle', 'pills'
      ),
      'cart_checkout', jsonb_build_object(
        'summaryCardBg', v_surface,
        'progressBarAccent', v_accent,
        'checkoutButtonColor', v_primary
      ),
      'orders', jsonb_build_object(
        'timelineActiveColor', v_primary,
        'statusBadgeStyle', 'pill',
        'cardElevation', 'subtle'
      )
    ),
    'homeSections', jsonb_build_array(
      jsonb_build_object('id', 'sec-hero', 'type', 'hero_banner', 'visible', true),
      jsonb_build_object('id', 'sec-categories', 'type', 'categories_grid', 'visible', true, 'title', 'تسوّق حسب القسم'),
      jsonb_build_object('id', 'sec-featured', 'type', 'featured_products', 'visible', true, 'title', 'أحدث المنتجات', 'categoryId', '', 'limit', 8),
      jsonb_build_object('id', 'sec-trust', 'type', 'trust_features', 'visible', true, 'title', 'لماذا تتسوّق معنا؟')
    )
  );

  insert into public.store_settings (
    id, store_id, store_name, currency, locale,
    primary_color, secondary_color, surface_color, border_radius,
    whatsapp_number, support_email, shipping_fee,
    banners, theme_template, ui_config,
    cod_enabled, paymob_enabled, paymob_card_enabled, paymob_wallet_enabled,
    cart_incentive_enabled, free_shipping_threshold, cashback_enabled, cashback_percentage
  )
  values (
    false, v_store_id, v_name_ar, v_currency, 'ar-EG',
    v_primary, v_accent, v_surface, v_radius,
    v_phone, coalesce(nullif(v_owner_email, ''), 'support@example.com'), 50,
    '{}'::text[], v_preset, v_ui_config,
    true, false, false, false,
    true, 1000, true, 5
  );

  return query select v_store_id, v_slug;
end $$;

revoke all on function public.provision_new_store(text, text, text, text, text, text) from public, anon;
grant execute on function public.provision_new_store(text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================================
-- 6. MANAGED STORES & SUPER-ADMIN RPCs
-- ============================================================================
create or replace function public.get_my_managed_stores()
returns table(
  store_id uuid,
  slug text,
  name_ar text,
  name_en text,
  plan text,
  status text,
  max_products integer,
  role text
)
language plpgsql
stable
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  if public.is_platform_super_admin() then
    return query
    select
      st.id as store_id,
      st.slug,
      coalesce(nullif(ss.store_name, ''), st.name_ar) as name_ar,
      coalesce(nullif(st.name_en, ''), st.name_ar) as name_en,
      st.plan,
      st.status,
      st.max_products,
      'super_admin'::text as role
    from public.stores st
    left join public.store_settings ss on ss.store_id = st.id
    order by
      case when st.id = '00000000-0000-0000-0000-000000000001'::uuid then 0 else 1 end,
      st.created_at desc;
    return;
  end if;

  return query
  select distinct on (st.id)
    st.id as store_id,
    st.slug,
    coalesce(nullif(ss.store_name, ''), st.name_ar) as name_ar,
    coalesce(nullif(st.name_en, ''), st.name_ar) as name_en,
    st.plan,
    st.status,
    st.max_products,
    coalesce(sm.role, 'admin')::text as role
  from public.stores st
  left join public.store_settings ss on ss.store_id = st.id
  left join public.store_members sm
    on sm.store_id = st.id and sm.user_id = v_uid and sm.role in ('owner', 'admin')
  left join public.profiles p
    on p.store_id = st.id and p.id = v_uid and p.role = 'admin'
  where sm.user_id is not null or p.id is not null
  order by st.id, st.created_at desc;
end $$;

revoke all on function public.get_my_managed_stores() from public, anon;
grant execute on function public.get_my_managed_stores() to authenticated, service_role;

create or replace function public.super_admin_list_stores_overview()
returns table(
  store_id uuid,
  slug text,
  name_ar text,
  name_en text,
  custom_domain text,
  plan text,
  status text,
  max_products integer,
  owner_user_id uuid,
  owner_email text,
  subscription_expires_at timestamptz,
  created_at timestamptz,
  products_count bigint,
  active_products_count bigint,
  orders_count bigint,
  gmv numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = '' as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    st.id as store_id,
    st.slug,
    coalesce(nullif(ss.store_name, ''), st.name_ar) as name_ar,
    coalesce(nullif(st.name_en, ''), st.name_ar) as name_en,
    st.custom_domain,
    st.plan,
    st.status,
    st.max_products,
    st.owner_user_id,
    coalesce(u.email::text, '') as owner_email,
    st.subscription_expires_at,
    st.created_at,
    coalesce(prod.total_products, 0)::bigint as products_count,
    coalesce(prod.active_products, 0)::bigint as active_products_count,
    coalesce(ord.total_orders, 0)::bigint as orders_count,
    coalesce(ord.total_gmv, 0)::numeric as gmv,
    coalesce(ss.currency, 'EGP') as currency
  from public.stores st
  left join public.store_settings ss on ss.store_id = st.id
  left join auth.users u on u.id = st.owner_user_id
  left join lateral (
    select
      count(*) as total_products,
      count(*) filter (where p.is_active) as active_products
    from public.products p
    where p.store_id = st.id
  ) prod on true
  left join lateral (
    select
      count(*) as total_orders,
      coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as total_gmv
    from public.orders o
    where o.store_id = st.id
  ) ord on true
  order by
    case when st.id = '00000000-0000-0000-0000-000000000001'::uuid then 0 else 1 end,
    st.created_at desc;
end $$;

revoke all on function public.super_admin_list_stores_overview() from public, anon;
grant execute on function public.super_admin_list_stores_overview() to authenticated, service_role;

create or replace function public.super_admin_update_store_plan_and_status(
  p_store_id uuid,
  p_plan text default null,
  p_status text default null,
  p_max_products integer default null,
  p_subscription_expires_at timestamptz default null,
  p_clear_expiry boolean default false
)
returns table(
  store_id uuid,
  slug text,
  plan text,
  status text,
  max_products integer,
  subscription_expires_at timestamptz
)
language plpgsql
security definer
set search_path = '' as $$
declare
  v_plan text := nullif(lower(trim(coalesce(p_plan, ''))), '');
  v_status text := nullif(lower(trim(coalesce(p_status, ''))), '');
  v_default_max integer;
begin
  if not public.is_platform_super_admin() then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null then
    raise exception 'unknown_store';
  end if;

  if v_plan is not null and v_plan not in ('starter', 'growth', 'enterprise') then
    raise exception 'invalid_plan';
  end if;

  if v_status is not null and v_status not in ('active', 'trial', 'suspended') then
    raise exception 'invalid_status';
  end if;

  if p_max_products is not null and p_max_products < 0 then
    raise exception 'invalid_max_products';
  end if;

  v_default_max := case v_plan
    when 'starter' then 50
    when 'growth' then 500
    when 'enterprise' then 10000
    else null
  end;

  update public.stores st
  set
    plan = coalesce(v_plan, st.plan),
    status = coalesce(v_status, st.status),
    max_products = coalesce(p_max_products, v_default_max, st.max_products),
    subscription_expires_at = case
      when coalesce(p_clear_expiry, false) then null
      when p_subscription_expires_at is not null then p_subscription_expires_at
      else st.subscription_expires_at
    end,
    updated_at = now()
  where st.id = p_store_id;

  if not found then
    raise exception 'unknown_store';
  end if;

  return query
  select st.id, st.slug, st.plan, st.status, st.max_products, st.subscription_expires_at
  from public.stores st
  where st.id = p_store_id;
end $$;

revoke all on function public.super_admin_update_store_plan_and_status(uuid, text, text, integer, timestamptz, boolean) from public, anon;
grant execute on function public.super_admin_update_store_plan_and_status(uuid, text, text, integer, timestamptz, boolean) to authenticated, service_role;

-- ============================================================================
-- 7. MULTI-TENANT STOREFRONT RPC UPGRADES (100% BACKWARD-COMPATIBLE)
-- ============================================================================

-- 7a. validate_coupon with optional p_store_id
drop function if exists public.validate_coupon(text, numeric);
drop function if exists public.validate_coupon(text, numeric, uuid);
create or replace function public.validate_coupon(
  p_code text,
  p_subtotal numeric,
  p_store_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
)
returns table(
  valid boolean,
  reason text,
  code text,
  discount_type text,
  discount_value numeric,
  discount_amount numeric,
  min_order_amount numeric
)
language plpgsql
stable
security definer
set search_path = '' as $$
declare
  v_store_id uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
  v_clean text := upper(trim(coalesce(p_code, '')));
  v_sub numeric := greatest(0, coalesce(p_subtotal, 0));
  c public.coupons%rowtype;
  v_disc numeric := 0;
begin
  if length(v_clean) < 2 then
    return query select false, 'invalid_code'::text, v_clean, null::text, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  select * into c
  from public.coupons cp
  where cp.store_id = v_store_id
    and upper(trim(cp.code)) = v_clean;

  if not found or not c.is_active then
    return query select false, 'not_found'::text, v_clean, null::text, 0::numeric, 0::numeric, 0::numeric;
    return;
  end if;

  if c.expires_at is not null and c.expires_at < now() then
    return query select false, 'expired'::text, c.code, c.discount_type, c.discount_value, 0::numeric, c.min_order_amount;
    return;
  end if;

  if c.max_uses is not null and c.used_count >= c.max_uses then
    return query select false, 'max_uses_reached'::text, c.code, c.discount_type, c.discount_value, 0::numeric, c.min_order_amount;
    return;
  end if;

  if v_sub < c.min_order_amount then
    return query select false, 'min_order_not_met'::text, c.code, c.discount_type, c.discount_value, 0::numeric, c.min_order_amount;
    return;
  end if;

  if c.discount_type = 'percent' then
    v_disc := round(v_sub * least(c.discount_value, 100) / 100.0, 2);
  else
    v_disc := least(v_sub, c.discount_value);
  end if;

  return query select true, 'ok'::text, c.code, c.discount_type, c.discount_value, v_disc, c.min_order_amount;
end $$;

revoke all on function public.validate_coupon(text, numeric, uuid) from public;
grant execute on function public.validate_coupon(text, numeric, uuid) to anon, authenticated;

-- 7b. sync_customer_profile with optional p_store_id
drop function if exists public.sync_customer_profile(text, text, text, text, text);
drop function if exists public.sync_customer_profile(text, text, text, text, text, uuid);
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
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := '';
  v_store_id uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
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

  if not exists (select 1 from public.store_settings s where s.store_id = v_store_id) then
    raise exception 'unknown_store';
  end if;

  select coalesce(u.email, '') into v_email from auth.users u where u.id = v_uid;

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

  select id into v_cust_id
  from public.store_customers
  where store_id = v_store_id and user_id = v_uid;

  if v_cust_id is null and cardinality(v_phone_variants) > 0 then
    select id into v_cust_id
    from public.store_customers
    where store_id = v_store_id
      and user_id is null
      and phone = any(v_phone_variants)
    order by updated_at desc
    limit 1;
  end if;

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

  if cardinality(v_phone_variants) > 0 then
    update public.orders
    set user_id = v_uid,
        customer_id = v_cust_id
    where store_id = v_store_id
      and user_id is null
      and phone = any(v_phone_variants);
  end if;

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

  update public.orders
  set customer_id = v_cust_id
  where store_id = v_store_id
    and user_id = v_uid
    and customer_id is null;

  return v_cust_id;
end $$;

revoke all on function public.sync_customer_profile(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.sync_customer_profile(text, text, text, text, text, uuid) to authenticated;

-- 7c. store_checkout & mobile_checkout: multi-tenant store_id + suspended store guard + strict product isolation
drop function if exists public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean);
drop function if exists public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean, uuid);

create or replace function public.store_checkout(
  request_key uuid,
  address text,
  customer_phone text,
  payment text,
  lines jsonb,
  p_coupon_code text default null,
  p_customer_name text default null,
  p_use_wallet boolean default false,
  p_store_id uuid default '00000000-0000-0000-0000-000000000001'::uuid
)
returns table(order_number uuid, amount numeric, order_currency text)
language plpgsql
security definer
set search_path = '' as $$
declare
  customer uuid := auth.uid();
  v_store_id uuid := coalesce(p_store_id, '00000000-0000-0000-0000-000000000001'::uuid);
  v_store_status text;
  v_payment text := case
    when upper(trim(coalesce(payment, ''))) = 'COD' then 'cod'
    else lower(trim(coalesce(payment, '')))
  end;
  v_pay_status text;
  v_order_status text := 'pending';
  fingerprint text;
  prior public.orders%rowtype;
  settings public.store_settings%rowtype;
  product public.products%rowtype;
  entry jsonb;
  item_quantity integer;
  chosen_size text;
  chosen_color text;
  gross_subtotal numeric := 0;
  discount_val numeric := 0;
  net_subtotal numeric := 0;
  v_shipping_fee numeric := 0;
  v_pre_wallet_total numeric := 0;
  v_wallet_discount numeric := 0;
  v_remaining_total numeric := 0;
  applied_coupon text := null;
  c public.coupons%rowtype;
  v_coupon_clean text := upper(trim(coalesce(p_coupon_code, '')));
  v_address text := trim(coalesce(address, ''));
  v_cust_name text := trim(coalesce(p_customer_name, ''));
  v_cust_email text := '';
  v_cust_id uuid;
  v_use_wallet boolean := coalesce(p_use_wallet, false);
  new_id uuid;
begin
  if request_key is null
    or v_payment not in ('cod', 'paymob_card', 'paymob_wallet', 'wallet')
    or address is null or length(v_address) not between 3 and 500
    or customer_phone is null or customer_phone !~ '^[0-9]{8,15}$'
    or jsonb_typeof(lines) is distinct from 'array' then
    raise exception 'invalid_checkout';
  end if;
  if jsonb_array_length(lines) not between 1 and 100 then
    raise exception 'invalid_cart';
  end if;

  if v_payment = 'wallet' then
    v_use_wallet := true;
  end if;

  fingerprint := md5(jsonb_build_array(v_store_id, v_address, customer_phone, v_payment, lines, v_coupon_clean, v_use_wallet)::text);
  perform pg_advisory_xact_lock(hashtextextended(request_key::text, 0));
  select * into prior from public.orders where checkout_key = request_key;
  if found then
    if prior.user_id is distinct from customer or prior.checkout_fingerprint is distinct from fingerprint
       or prior.guest_tracking is distinct from (customer is null) then
      raise exception 'checkout_key_conflict';
    end if;
    return query select prior.id, prior.total, prior.currency;
    return;
  end if;

  select st.status into v_store_status from public.stores st where st.id = v_store_id;
  if not found then
    raise exception 'unknown_store';
  end if;
  if v_store_status = 'suspended' then
    raise exception 'store_suspended';
  end if;

  select * into strict settings from public.store_settings s where s.store_id = v_store_id;

  if v_payment = 'cod' and not settings.cod_enabled then
    raise exception 'payment_method_disabled';
  end if;
  if v_payment = 'paymob_card' and not (settings.paymob_enabled and settings.paymob_card_enabled) then
    raise exception 'payment_method_disabled';
  end if;
  if v_payment = 'paymob_wallet' and not (settings.paymob_enabled and settings.paymob_wallet_enabled) then
    raise exception 'payment_method_disabled';
  end if;
  if v_payment = 'wallet' and customer is null then
    raise exception 'not_authorized';
  end if;

  v_pay_status := case when v_payment = 'cod' then 'unpaid' else 'pending' end;

  if customer is not null then
    select coalesce(u.email, '') into v_cust_email from auth.users u where u.id = customer;
    select id into v_cust_id
    from public.store_customers
    where store_id = settings.store_id and user_id = customer;
  end if;

  if v_cust_id is null then
    select id into v_cust_id
    from public.store_customers
    where store_id = settings.store_id and phone = customer_phone
    limit 1;
  end if;

  if v_cust_id is null then
    insert into public.store_customers (store_id, user_id, full_name, phone, email, address)
    values (settings.store_id, customer, v_cust_name, customer_phone, v_cust_email, v_address)
    returning id into v_cust_id;
  else
    update public.store_customers sc
    set user_id = coalesce(sc.user_id, customer),
        full_name = case when length(v_cust_name) > 0 then v_cust_name else sc.full_name end,
        email = case when length(v_cust_email) > 0 then v_cust_email else sc.email end,
        address = v_address,
        updated_at = now()
    where sc.id = v_cust_id;
  end if;

  insert into public.orders(
    store_id, user_id, customer_id, shipping_address, phone, payment_method, payment_status,
    guest_tracking, currency, shipping_fee, subtotal, wallet_discount, checkout_key, checkout_fingerprint
  )
  values(
    settings.store_id, customer, v_cust_id, v_address, customer_phone, v_payment, v_pay_status,
    customer is null, settings.currency, settings.shipping_fee, 0, 0, request_key, fingerprint
  )
  returning id into new_id;

  -- Lock products in ID order, strictly isolated to this store_id
  for entry in select value from jsonb_array_elements(lines) order by (value->>'id')::uuid loop
    if jsonb_typeof(entry->'quantity') is distinct from 'number'
       or (entry->>'quantity') !~ '^[1-9][0-9]{0,5}$' then
      raise exception 'invalid_quantity';
    end if;
    item_quantity := (entry->>'quantity')::integer;
    chosen_size := coalesce(entry->>'size', '');
    chosen_color := coalesce(entry->>'color', '');
    select * into product
    from public.products p
    where p.id = (entry->>'id')::uuid
      and p.store_id = settings.store_id
    for update;
    if not found or not product.is_active or product.stock < item_quantity then
      raise exception 'stock_unavailable';
    end if;
    if (cardinality(product.sizes) = 0 and chosen_size <> '') or
       (cardinality(product.sizes) > 0 and not coalesce(chosen_size = any(product.sizes), false)) or
       (cardinality(product.colors) = 0 and chosen_color <> '') or
       (cardinality(product.colors) > 0 and not coalesce(chosen_color = any(product.colors), false)) then
      raise exception 'invalid_variant';
    end if;
    update public.products set stock = stock - item_quantity where id = product.id;
    insert into public.order_items(order_id, product_id, product_name, quantity, unit_price, unit_cost, size, color)
      values(new_id, product.id, product.name, item_quantity, product.price, coalesce(product.cost_price, 0), nullif(chosen_size, ''), nullif(chosen_color, ''));
    gross_subtotal := gross_subtotal + product.price * item_quantity;
  end loop;

  if length(v_coupon_clean) >= 2 then
    select * into c
    from public.coupons cp
    where cp.store_id = settings.store_id
      and upper(trim(cp.code)) = v_coupon_clean
    for update;

    if not found or not c.is_active
       or (c.expires_at is not null and c.expires_at < now())
       or (c.max_uses is not null and c.used_count >= c.max_uses)
       or gross_subtotal < c.min_order_amount then
      raise exception 'invalid_coupon';
    end if;

    if c.discount_type = 'percent' then
      discount_val := round(gross_subtotal * least(c.discount_value, 100) / 100.0, 2);
    else
      discount_val := least(gross_subtotal, c.discount_value);
    end if;

    applied_coupon := c.code;
    update public.coupons set used_count = used_count + 1 where id = c.id;
  end if;

  net_subtotal := greatest(0::numeric, gross_subtotal - discount_val);

  if settings.cart_incentive_enabled
     and coalesce(settings.free_shipping_threshold, 0) > 0
     and gross_subtotal >= settings.free_shipping_threshold then
    v_shipping_fee := 0;
  else
    v_shipping_fee := settings.shipping_fee;
  end if;

  v_pre_wallet_total := net_subtotal + v_shipping_fee;

  if v_use_wallet and customer is not null and v_pre_wallet_total > 0 then
    v_wallet_discount := public.redeem_wallet_for_order(
      settings.store_id,
      customer,
      new_id,
      v_pre_wallet_total
    );
  end if;

  v_remaining_total := greatest(0::numeric, v_pre_wallet_total - v_wallet_discount);

  if v_payment = 'wallet' and v_remaining_total > 0 then
    raise exception 'insufficient_wallet_balance';
  end if;

  if v_remaining_total = 0 and v_wallet_discount > 0 then
    v_payment := 'wallet';
    v_pay_status := 'paid';
    v_order_status := 'confirmed';
  end if;

  update public.orders
  set subtotal = net_subtotal,
      shipping_fee = v_shipping_fee,
      coupon_code = applied_coupon,
      discount_amount = discount_val,
      wallet_discount = v_wallet_discount,
      payment_method = v_payment,
      payment_status = v_pay_status,
      status = v_order_status
  where id = new_id;

  return query select o.id, o.total, o.currency from public.orders o where o.id = new_id;
end $$;

revoke all on function public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean, uuid) from public;
grant execute on function public.store_checkout(uuid, text, text, text, jsonb, text, text, boolean, uuid) to anon, authenticated;

-- Upgrade mobile_* RPCs for multi-tenant white-label Android APKs
create or replace function public.mobile_checkout(
  p_store uuid,
  request_key uuid,
  address text,
  customer_phone text,
  payment text,
  lines jsonb,
  p_coupon_code text default null,
  p_customer_name text default null,
  p_use_wallet boolean default false
)
returns table(order_number uuid, amount numeric, order_currency text)
language plpgsql
security definer
set search_path = '' as $$
begin
  return query
  select r.*
  from public.store_checkout(
    request_key,
    address,
    customer_phone,
    payment,
    lines,
    p_coupon_code,
    p_customer_name,
    coalesce(p_use_wallet, false),
    p_store
  ) r;
end $$;

revoke all on function public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean) from public;
grant execute on function public.mobile_checkout(uuid, uuid, text, text, text, jsonb, text, text, boolean) to anon, authenticated;

create or replace function public.mobile_coupon(p_store uuid, p_code text, p_subtotal numeric)
returns table(valid boolean, discount_amount numeric)
language sql
stable
security invoker
set search_path = '' as $$
  select c.valid, c.discount_amount
  from public.validate_coupon(p_code, p_subtotal, p_store) c
$$;

revoke all on function public.mobile_coupon(uuid, text, numeric) from public;
grant execute on function public.mobile_coupon(uuid, text, numeric) to anon, authenticated;

create or replace function public.mobile_support(p_store uuid, p_subject text, p_message text)
returns void
language plpgsql
security invoker
set search_path = '' as $$
begin
  if not exists (select 1 from public.stores st where st.id = p_store and st.status <> 'suspended') then
    raise exception 'unknown_store';
  end if;
  insert into public.support_tickets(store_id, subject, message)
  values(p_store, p_subject, p_message);
end $$;

revoke all on function public.mobile_support(uuid, text, text) from public;
grant execute on function public.mobile_support(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
