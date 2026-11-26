begin;

-- Keep the existing provisioning exclusions and reserve infrastructure labels at the table boundary.
create or replace function public.is_reserved_store_slug(p_slug text)
returns boolean language sql immutable strict set search_path = '' as $$
  select lower(p_slug) = any(array[
    'www','app','admin','api','auth','mail','billing','support','docs','status','cdn','static','assets',
    'super-admin','account','cart','checkout','create-store','s','store','products','orders','login',
    'register','contact','delivery','dashboard','settings','public','health'
  ]);
$$;

alter table public.stores drop constraint if exists stores_slug_not_reserved;
alter table public.stores add constraint stores_slug_not_reserved check (not public.is_reserved_store_slug(slug));
create unique index if not exists stores_slug_uidx on public.stores (slug);

create or replace function public.check_store_slug_available(p_slug text)
returns table(available boolean, reason text)
language sql stable security definer set search_path = '' as $$
  with input as (select lower(trim(coalesce(p_slug, ''))) as slug),
  verdict as (
    select case
      when length(i.slug) not between 3 and 40 or i.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then 'invalid'
      when public.is_reserved_store_slug(i.slug) then 'reserved'
      when exists (select 1 from public.stores s where s.slug = i.slug) then 'taken'
      else 'ok' end as reason
    from input i
  )
  select v.reason = 'ok', v.reason from verdict v;
$$;
revoke all on function public.check_store_slug_available(text) from public;
grant execute on function public.check_store_slug_available(text) to anon, authenticated, service_role;

create table if not exists public.store_domains (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  domain text not null,
  verification_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  status text not null default 'pending_dns',
  is_primary boolean not null default false,
  verified_at timestamptz,
  last_error text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint store_domains_name check (
    -- Leave room for the "_wlc-verify." TXT label within the 253-character DNS limit.
    length(domain) <= 241 and domain = lower(domain)
    and domain collate "C" ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.])+([a-z]{2,63}|xn--[a-z0-9-]{1,58}[a-z0-9])$'
    and domain !~ '(^|[.])(localhost|local|internal|home[.]arpa)$'
  ),
  constraint store_domains_token check (verification_token ~ '^[0-9a-f]{64}$'),
  constraint store_domains_status check (status in ('pending_dns','verified','active','error')),
  constraint store_domains_verified check ((status in ('verified','active')) = (verified_at is not null)),
  constraint store_domains_primary_active check (not is_primary or status = 'active'),
  constraint store_domains_error check (
    (status = 'error') = (last_error is not null)
    and (last_error is null or last_error in ('txt_missing','dns_timeout','dns_failed'))
  )
);
create unique index if not exists store_domains_name_uidx on public.store_domains (lower(domain));
create unique index if not exists store_domains_primary_uidx on public.store_domains (store_id) where is_primary;
create index if not exists store_domains_store_idx on public.store_domains (store_id, domain);

create or replace function public.guard_store_domain_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_dns' then raise exception 'domain_must_start_pending'; end if;
    return new;
  end if;
  if (new.id, new.domain, new.store_id, new.verification_token)
     is distinct from (old.id, old.domain, old.store_id, old.verification_token) then
    raise exception 'domain_identity_immutable';
  end if;
  if new.status <> old.status and not (
    (old.status in ('pending_dns','error') and new.status in ('verified','error'))
    or (old.status = 'verified' and new.status in ('active','error'))
  ) then raise exception 'invalid_domain_transition'; end if;
  new.verified_at := case when new.status in ('verified','active')
    then coalesce(old.verified_at, clock_timestamp()) end;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists guard_domain_state on public.store_domains;
create trigger guard_domain_state before insert or update on public.store_domains
for each row execute function public.guard_store_domain_state();

alter table public.store_domains enable row level security;
revoke all on public.store_domains from public, anon, authenticated, service_role;
grant select, delete on public.store_domains to authenticated;
grant insert (store_id, domain) on public.store_domains to authenticated;
grant select, insert, update, delete on public.store_domains to service_role;
drop policy if exists domain_read_own on public.store_domains;
create policy domain_read_own on public.store_domains for select to authenticated
using (public.is_store_admin(store_id));
drop policy if exists domain_add_own on public.store_domains;
create policy domain_add_own on public.store_domains for insert to authenticated
with check (public.is_store_admin(store_id));
drop policy if exists domain_remove_own on public.store_domains;
create policy domain_remove_own on public.store_domains for delete to authenticated
using (public.is_store_admin(store_id));

-- Only DNS verification on the server can advance status. Primary selection is an
-- independently authorized, serialized operation. Turning it off restores the subdomain.
create or replace function public.set_store_domain_primary(p_store_id uuid, p_domain_id uuid, p_primary boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_store_admin(p_store_id) then raise insufficient_privilege; end if;
  perform 1 from public.stores where id = p_store_id for update;
  perform 1 from public.store_domains
    where id = p_domain_id and store_id = p_store_id and status = 'active' for update;
  if not found or p_primary is null then raise exception 'domain_not_active'; end if;
  if p_primary then
    update public.store_domains set is_primary = false
      where store_id = p_store_id and is_primary and id <> p_domain_id;
  end if;
  update public.store_domains set is_primary = p_primary
    where store_id = p_store_id and id = p_domain_id and is_primary <> p_primary;
end;
$$;
revoke all on function public.set_store_domain_primary(uuid,uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_store_domain_primary(uuid,uuid,boolean) to authenticated;

-- Proxy workers and server actions need not share a process. Commit the routing revision
-- in the same transaction as any change that could invalidate a cached hit OR miss.
create table if not exists public.store_route_revision (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 1
);
insert into public.store_route_revision (singleton) values (true) on conflict do nothing;
alter table public.store_route_revision enable row level security;
revoke all on public.store_route_revision from public, anon, authenticated, service_role;
create or replace function public.bump_store_route_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.store_route_revision set revision = revision + 1 where singleton;
  return null;
end;
$$;
revoke all on function public.bump_store_route_revision() from public, anon, authenticated, service_role;
drop trigger if exists domain_routes_changed on public.store_domains;
create trigger domain_routes_changed after insert or update or delete or truncate on public.store_domains
for each statement execute function public.bump_store_route_revision();
drop trigger if exists store_routes_changed on public.stores;
create trigger store_routes_changed after insert or update of slug, id or delete or truncate on public.stores
for each statement execute function public.bump_store_route_revision();

-- One snapshot and one round trip. Warm entries only read the singleton. Cold entries
-- use exact indexed lookups and return only the identifiers required for routing/SEO.
create or replace function public.resolve_store_route(p_kind text, p_value text, p_known_revision text default null)
returns table(route_revision text, unchanged boolean, store_id uuid, slug text, primary_domain text)
language plpgsql stable security definer set search_path = '' as $$
begin
  select r.revision::text into strict route_revision from public.store_route_revision r where r.singleton;
  unchanged := coalesce(p_known_revision = route_revision, false);
  if not unchanged then
    if p_kind = 'slug' then
      select s.id, s.slug into store_id, slug from public.stores s where s.slug = p_value;
    elsif p_kind = 'domain' then
      select s.id, s.slug into store_id, slug
        from public.store_domains d join public.stores s on s.id = d.store_id
        where lower(d.domain) = lower(p_value) and d.status = 'active';
    end if;
    if store_id is not null then
      select d.domain into primary_domain from public.store_domains d
        where d.store_id = resolve_store_route.store_id and d.is_primary and d.status = 'active';
    end if;
  end if;
  return next;
end;
$$;
revoke all on function public.resolve_store_route(text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.resolve_store_route(text,text,text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
