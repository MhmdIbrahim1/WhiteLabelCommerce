-- Keep product_reviews.admin_reply as the opening reply for existing clients.
begin;

create unique index if not exists product_reviews_store_id_id_key
  on public.product_reviews (store_id, id);

create table if not exists public.review_replies (
  store_id uuid not null,
  review_id uuid not null,
  role text not null check (role in ('customer', 'merchant')),
  body text not null check (char_length(body) between 1 and 500 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  primary key (store_id, review_id, role),
  foreign key (store_id, review_id) references public.product_reviews (store_id, id) on delete cascade
);
alter table public.review_replies enable row level security;
revoke all on public.review_replies from public, anon, authenticated;
grant select on public.review_replies to anon, authenticated, service_role;
grant insert (store_id, review_id, role, body) on public.review_replies to authenticated;

create schema if not exists private;
create or replace function private.is_review_merchant(tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_members
    where store_id = tenant and user_id = auth.uid() and role in ('owner','admin'))
    or exists (select 1 from public.profiles
    where store_id = tenant and id = auth.uid() and role = 'admin')
    or exists (select 1 from public.stores where id = tenant and owner_user_id = auth.uid())
$$;
revoke all on function private.is_review_merchant(uuid) from public, anon, authenticated;

-- Lock the parent through the insert so hiding/editing the opener and claiming a
-- turn are serialized. Ownership stays private even on public review pages.
create or replace function private.can_insert_review_reply(tenant uuid, review uuid, reply_role text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  perform 1 from public.product_reviews r
    where r.store_id = tenant and r.id = review and r.status = 'published'
      and nullif(btrim(r.admin_reply), '') is not null
      and ((reply_role = 'customer' and r.user_id = auth.uid())
        or (reply_role = 'merchant' and private.is_review_merchant(tenant)))
    for update;
  if not found then return false; end if;
  return reply_role = 'customer' or exists (select 1 from public.review_replies
    where store_id = tenant and review_id = review and role = 'customer');
end
$$;
revoke all on function private.can_insert_review_reply(uuid, uuid, text) from public, anon;
grant execute on function private.can_insert_review_reply(uuid, uuid, text) to authenticated;

drop policy if exists read_review_thread on public.review_replies;
create policy read_review_thread on public.review_replies for select to anon, authenticated
using (exists (select 1 from public.product_reviews r
  where r.id = review_replies.review_id and r.store_id = review_replies.store_id));
drop policy if exists append_review_turn on public.review_replies;
create policy append_review_turn on public.review_replies for insert to authenticated
with check (private.can_insert_review_reply(store_id, review_id, role));

create or replace function private.protect_opening_review_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_review_merchant(new.store_id) then
    raise exception 'store_merchant_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.review_replies where store_id = new.store_id and review_id = new.id) then
    raise exception 'review_thread_started' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.protect_opening_review_reply() from public, anon, authenticated;
drop trigger if exists protect_opening_review_reply on public.product_reviews;
create trigger protect_opening_review_reply before update of admin_reply, admin_replied_at on public.product_reviews
  for each row when (old.admin_reply is distinct from new.admin_reply or old.admin_replied_at is distinct from new.admin_replied_at)
  execute function private.protect_opening_review_reply();

do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_replies') then
    alter publication supabase_realtime add table public.review_replies;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
