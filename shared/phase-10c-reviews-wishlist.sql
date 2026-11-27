-- Phase 10C: Verified Product Reviews, Cloud Wishlist & Strict Multi-Tenant RLS
-- Adds avg_rating & review_count aggregates on public.products, public.product_reviews
-- with automatic rating sync trigger, public.wishlists, atomic SECURITY DEFINER RPCs,
-- Customer reviews are created through the purchase verification flow.
-- Apply after phase-10b-saas-multitenancy.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 1. PRODUCT RATING AGGREGATES (`public.products`)
-- ============================================================================
alter table public.products
  add column if not exists avg_rating numeric(3,2) not null default 0,
  add column if not exists review_count integer not null default 0;

alter table public.products drop constraint if exists products_avg_rating_check;
alter table public.products add constraint products_avg_rating_check
  check (avg_rating >= 0 and avg_rating <= 5);

alter table public.products drop constraint if exists products_review_count_check;
alter table public.products add constraint products_review_count_check
  check (review_count >= 0);

-- ============================================================================
-- 2. VERIFIED PRODUCT REVIEWS (`public.product_reviews`)
-- ============================================================================
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null,
  order_id uuid null references public.orders(id) on delete set null,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '',
  is_verified_purchase boolean not null default true,
  status text not null default 'published' check (status in ('published', 'hidden')),
  admin_reply text null,
  admin_replied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_store_product_user_uidx unique (store_id, product_id, user_id)
);

create index if not exists idx_product_reviews_store_product_status
  on public.product_reviews (store_id, product_id, status, created_at desc);

create index if not exists idx_product_reviews_store_status_created
  on public.product_reviews (store_id, status, created_at desc);

create index if not exists idx_product_reviews_user_store
  on public.product_reviews (user_id, store_id);

-- Automatic product rating aggregate sync trigger
create or replace function public.sync_product_rating_stats()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
declare
  v_target_ids uuid[];
  v_pid uuid;
begin
  if tg_op = 'DELETE' then
    v_target_ids := array[old.product_id];
  elsif tg_op = 'INSERT' then
    v_target_ids := array[new.product_id];
  else
    if old.product_id is distinct from new.product_id then
      v_target_ids := array[old.product_id, new.product_id];
    else
      v_target_ids := array[new.product_id];
    end if;
  end if;

  foreach v_pid in array v_target_ids loop
    if v_pid is not null then
      update public.products p
      set
        avg_rating = coalesce(
          (
            select round(avg(r.rating)::numeric, 2)
            from public.product_reviews r
            where r.product_id = v_pid
              and r.status = 'published'
          ),
          0::numeric(3,2)
        ),
        review_count = (
          select count(*)::integer
          from public.product_reviews r
          where r.product_id = v_pid
            and r.status = 'published'
        )
      where p.id = v_pid;
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

revoke all on function public.sync_product_rating_stats() from public, anon, authenticated;

drop trigger if exists trg_sync_product_rating_stats on public.product_reviews;
create trigger trg_sync_product_rating_stats
  after insert or update or delete on public.product_reviews
  for each row
  execute function public.sync_product_rating_stats();

-- Strict RLS on public.product_reviews (direct client writes revoked; use SECURITY DEFINER RPCs)
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from public, anon, authenticated;
grant select on public.product_reviews to anon, authenticated;
grant select, insert, update, delete on public.product_reviews to service_role;

drop policy if exists public_read_published_reviews on public.product_reviews;
create policy public_read_published_reviews
  on public.product_reviews
  for select
  to anon, authenticated
  using (status = 'published');

drop policy if exists customer_read_own_reviews on public.product_reviews;
create policy customer_read_own_reviews
  on public.product_reviews
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists admin_read_store_reviews on public.product_reviews;
create policy admin_read_store_reviews
  on public.product_reviews
  for select
  to authenticated
  using ((select public.is_store_admin(store_id)));

-- ============================================================================
-- 3. CLOUD WISHLIST (`public.wishlists`)
-- ============================================================================
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wishlists_store_user_product_uidx unique (store_id, user_id, product_id)
);

create index if not exists idx_wishlists_store_product
  on public.wishlists (store_id, product_id);

create index if not exists idx_wishlists_store_user_created
  on public.wishlists (store_id, user_id, created_at desc);

alter table public.wishlists enable row level security;
revoke all on public.wishlists from public, anon, authenticated;
grant select, insert, delete on public.wishlists to authenticated;
grant select, insert, update, delete on public.wishlists to service_role;

drop policy if exists user_manage_own_wishlists on public.wishlists;
create policy user_manage_own_wishlists
  on public.wishlists
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================================
-- 4. ATOMIC `SECURITY DEFINER` RPCs
-- ============================================================================

-- 4a. Check whether current user has a delivered purchase for a product in a store
create or replace function public.can_review_product(
  p_store_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_order_id uuid := null;
  v_existing jsonb := null;
begin
  if v_uid is null or p_store_id is null or p_product_id is null then
    return jsonb_build_object(
      'eligible', false,
      'order_id', null,
      'existing_review', null
    );
  end if;

  select o.id
  into v_order_id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.store_id = p_store_id
    and o.user_id = v_uid
    and o.status = 'delivered'
    and oi.product_id = p_product_id
  order by coalesce(o.delivered_at, o.created_at) desc
  limit 1;

  select jsonb_build_object(
    'id', r.id,
    'store_id', r.store_id,
    'product_id', r.product_id,
    'user_id', r.user_id,
    'order_id', r.order_id,
    'author_name', r.author_name,
    'rating', r.rating,
    'comment', r.comment,
    'is_verified_purchase', r.is_verified_purchase,
    'status', r.status,
    'admin_reply', r.admin_reply,
    'admin_replied_at', r.admin_replied_at,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  )
  into v_existing
  from public.product_reviews r
  where r.store_id = p_store_id
    and r.product_id = p_product_id
    and r.user_id = v_uid
  limit 1;

  return jsonb_build_object(
    'eligible', (v_order_id is not null or v_existing is not null),
    'order_id', v_order_id,
    'existing_review', v_existing
  );
end $$;

revoke all on function public.can_review_product(uuid, uuid) from public;
grant execute on function public.can_review_product(uuid, uuid) to anon, authenticated, service_role;

-- 4b. Submit or update a verified product review
create or replace function public.submit_product_review(
  p_store_id uuid,
  p_product_id uuid,
  p_rating smallint,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_order_id uuid := null;
  v_author_name text := '';
  v_comment text := left(trim(coalesce(p_comment, '')), 1500);
  v_saved public.product_reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_store_id is null or p_product_id is null then
    raise exception 'invalid_review_target';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.store_id = p_store_id
  ) then
    raise exception 'product_not_found';
  end if;

  select o.id
  into v_order_id
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.store_id = p_store_id
    and o.user_id = v_uid
    and o.status = 'delivered'
    and oi.product_id = p_product_id
  order by coalesce(o.delivered_at, o.created_at) desc
  limit 1;

  if v_order_id is null then
    raise exception 'verified_purchase_required';
  end if;

  select coalesce(nullif(trim(sc.full_name), ''), '')
  into v_author_name
  from public.store_customers sc
  where sc.store_id = p_store_id
    and sc.user_id = v_uid
  limit 1;

  if coalesce(v_author_name, '') = '' then
    select coalesce(
      nullif(trim((u.raw_user_meta_data ->> 'full_name')::text), ''),
      nullif(split_part(coalesce(u.email::text, ''), '@', 1), ''),
      'Verified Buyer'
    )
    into v_author_name
    from auth.users u
    where u.id = v_uid;
  end if;

  v_author_name := left(coalesce(nullif(trim(v_author_name), ''), 'Verified Buyer'), 80);

  insert into public.product_reviews (
    store_id,
    product_id,
    user_id,
    order_id,
    author_name,
    rating,
    comment,
    is_verified_purchase,
    status,
    updated_at
  )
  values (
    p_store_id,
    p_product_id,
    v_uid,
    v_order_id,
    v_author_name,
    p_rating,
    v_comment,
    true,
    'published',
    now()
  )
  on conflict on constraint product_reviews_store_product_user_uidx
  do update set
    order_id = coalesce(excluded.order_id, public.product_reviews.order_id),
    author_name = excluded.author_name,
    rating = excluded.rating,
    comment = excluded.comment,
    is_verified_purchase = true,
    updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'id', v_saved.id,
    'store_id', v_saved.store_id,
    'product_id', v_saved.product_id,
    'user_id', v_saved.user_id,
    'order_id', v_saved.order_id,
    'author_name', v_saved.author_name,
    'rating', v_saved.rating,
    'comment', v_saved.comment,
    'is_verified_purchase', v_saved.is_verified_purchase,
    'status', v_saved.status,
    'admin_reply', v_saved.admin_reply,
    'admin_replied_at', v_saved.admin_replied_at,
    'created_at', v_saved.created_at,
    'updated_at', v_saved.updated_at
  );
end $$;

revoke all on function public.submit_product_review(uuid, uuid, smallint, text) from public, anon;
grant execute on function public.submit_product_review(uuid, uuid, smallint, text) to authenticated, service_role;

-- 4c. Toggle wishlist item for authenticated customer
create or replace function public.toggle_wishlist_item(
  p_store_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_deleted_id uuid := null;
  v_in_wishlist boolean := false;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_store_id is null or p_product_id is null then
    raise exception 'invalid_wishlist_target';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.id = p_product_id
      and p.store_id = p_store_id
  ) then
    raise exception 'product_not_found';
  end if;

  delete from public.wishlists w
  where w.store_id = p_store_id
    and w.user_id = v_uid
    and w.product_id = p_product_id
  returning w.id into v_deleted_id;

  if v_deleted_id is not null then
    v_in_wishlist := false;
  else
    insert into public.wishlists (store_id, user_id, product_id)
    values (p_store_id, v_uid, p_product_id)
    on conflict on constraint wishlists_store_user_product_uidx do nothing;
    v_in_wishlist := true;
  end if;

  select count(*)::integer
  into v_count
  from public.wishlists w
  where w.store_id = p_store_id
    and w.user_id = v_uid;

  return jsonb_build_object(
    'in_wishlist', v_in_wishlist,
    'wishlist_count', v_count
  );
end $$;

revoke all on function public.toggle_wishlist_item(uuid, uuid) from public, anon;
grant execute on function public.toggle_wishlist_item(uuid, uuid) to authenticated, service_role;

-- 4d. Merchant admin review moderation & store reply
create or replace function public.admin_moderate_review(
  p_store_id uuid,
  p_review_id uuid,
  p_status text,
  p_admin_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_status text := lower(trim(coalesce(p_status, '')));
  v_reply_clean text;
  v_updated public.product_reviews%rowtype;
begin
  if v_uid is null or not public.is_store_admin(p_store_id) then
    raise exception 'not_authorized';
  end if;

  if v_status not in ('published', 'hidden') then
    raise exception 'invalid_status';
  end if;

  if p_admin_reply is not null then
    v_reply_clean := nullif(left(trim(p_admin_reply), 1500), '');
  end if;

  update public.product_reviews r
  set
    status = v_status,
    admin_reply = case
      when p_admin_reply is null then r.admin_reply
      else v_reply_clean
    end,
    admin_replied_at = case
      when p_admin_reply is null then r.admin_replied_at
      when v_reply_clean is null then null
      else now()
    end,
    updated_at = now()
  where r.id = p_review_id
    and r.store_id = p_store_id
  returning * into v_updated;

  if not found then
    raise exception 'review_not_found';
  end if;

  return jsonb_build_object(
    'id', v_updated.id,
    'store_id', v_updated.store_id,
    'product_id', v_updated.product_id,
    'user_id', v_updated.user_id,
    'order_id', v_updated.order_id,
    'author_name', v_updated.author_name,
    'rating', v_updated.rating,
    'comment', v_updated.comment,
    'is_verified_purchase', v_updated.is_verified_purchase,
    'status', v_updated.status,
    'admin_reply', v_updated.admin_reply,
    'admin_replied_at', v_updated.admin_replied_at,
    'created_at', v_updated.created_at,
    'updated_at', v_updated.updated_at
  );
end $$;

revoke all on function public.admin_moderate_review(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_review(uuid, uuid, text, text) to authenticated, service_role;

commit;

NOTIFY pgrst, 'reload schema';
