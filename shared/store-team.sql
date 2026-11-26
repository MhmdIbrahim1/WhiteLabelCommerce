-- Apply after saas-billing.sql and customer-signup.sql. All existing checkout RPCs keep their signatures.
begin;
set local lock_timeout = '8s';
set local search_path = public, pg_catalog;

do $$
begin
  if not exists (select from information_schema.columns where table_schema='public'
      and table_name='saas_plans' and column_name='max_staff_members') then
    alter table public.saas_plans add max_staff_members integer check (max_staff_members >= 0);
    update public.saas_plans set max_staff_members = case code when 'starter' then 1 when 'pro' then 5 end;
  end if;
end $$;

create or replace function public.valid_quota_overrides(v jsonb) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(v)='object' then not exists (
    select from jsonb_each(v) where not (case
      when key='custom_domains_enabled' then jsonb_typeof(value)='boolean'
      when key in ('max_products','max_monthly_orders','max_monthly_apk_builds','max_staff_members') then
        case jsonb_typeof(value) when 'null' then true when 'number' then
          value::numeric between 0 and 2147483647 and trunc(value::numeric)=value::numeric
        else false end
      else false end)
  ) else false end
$$;
create or replace function public.resolve_saas_entitlements(p public.saas_plans, overrides jsonb) returns jsonb
language sql immutable parallel safe set search_path = '' as $$
  select jsonb_build_object('max_products',p.max_products,'max_monthly_orders',p.max_monthly_orders,
    'max_monthly_apk_builds',p.max_monthly_apk_builds,'max_staff_members',p.max_staff_members,
    'custom_domains_enabled',p.custom_domains_enabled) || overrides
$$;

create or replace function public.billing_save_plan(p_plan jsonb,p_revision integer) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.saas_plans;
begin
  if not public.is_platform_super_admin() then raise insufficient_privilege; end if;
  if not coalesce(p_plan ?& array['max_products','max_monthly_orders','max_monthly_apk_builds'],false)
     or not public.valid_quota_overrides(jsonb_build_object('max_staff_members',p_plan->'max_staff_members')) then
    raise exception 'invalid_plan';
  end if;
  p := jsonb_populate_record(null::public.saas_plans,p_plan);
  update public.saas_plans set name_ar=p.name_ar,name_en=p.name_en,description_ar=p.description_ar,
    description_en=p.description_en,monthly_price_egp=p.monthly_price_egp,annual_price_egp=p.annual_price_egp,
    trial_days=p.trial_days,max_products=p.max_products,max_monthly_orders=p.max_monthly_orders,
    max_monthly_apk_builds=p.max_monthly_apk_builds,
    max_staff_members=case when p_plan ? 'max_staff_members' then p.max_staff_members else max_staff_members end,
    custom_domains_enabled=p.custom_domains_enabled,is_active=p.is_active,sort_order=p.sort_order,revision=revision+1
    where code=p.code and revision=p_revision;
  if not found then raise exception 'billing_edit_conflict'; end if;
end $$;

-- Sparse permission sets contain only granted keys. A customized preset is stored as 'custom'.
create or replace function private.team_preset(r text) returns jsonb
language sql immutable set search_path = '' as $$
  select case r
    when 'owner' then '{"manage_products":true,"manage_orders":true,"manage_customers":true,"manage_settings":true,"manage_domains":true,"manage_billing":true,"manage_staff":true,"manage_mobile_app":true}'::jsonb
    when 'manager' then '{"manage_products":true,"manage_orders":true,"manage_customers":true,"manage_settings":true,"manage_domains":true,"manage_staff":true,"manage_mobile_app":true}'::jsonb
    when 'orders' then '{"manage_orders":true}'::jsonb
    when 'catalog' then '{"manage_products":true}'::jsonb
    when 'custom' then '{}'::jsonb end
$$;
create or replace function private.valid_team_role(r text, perms jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case when r='custom' then jsonb_typeof(perms)='object' and private.team_preset('owner') @> perms
    else perms=private.team_preset(r) end,false)
$$;

lock table public.store_members in share row exclusive mode;
do $$
begin
  if not exists (select from information_schema.columns where table_schema='public' and table_name='store_members'
      and column_name='permissions') then
    alter table public.store_members drop constraint store_members_role_check;
    alter table public.store_members add permissions jsonb;
    insert into public.store_members(store_id,user_id,role)
      select id,owner_user_id,'owner' from public.stores where owner_user_id is not null
      on conflict(store_id,user_id) do update set role='owner';
    insert into public.store_members(store_id,user_id,role)
      select p.store_id,p.id,'admin' from public.profiles p join public.stores s on s.id=p.store_id where p.role='admin'
      on conflict do nothing;
    -- Legacy admins keep their operational grants. Legacy staff previously had no administrative access.
    update public.store_members set role=case role when 'admin' then 'custom' when 'staff' then 'custom' else role end,
      permissions=case role when 'admin' then private.team_preset('owner') when 'staff' then '{}' else private.team_preset(role) end;
    alter table public.store_members alter role set default 'custom', alter permissions set default '{}',
      alter permissions set not null, add constraint store_members_role_check check (private.valid_team_role(role,permissions));
  end if;
end $$;

create or replace function private.member_permissions(tenant uuid, actor uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when exists(select from public.platform_admins where user_id=actor) then private.team_preset('owner')
    else (select permissions from public.store_members where store_id=tenant and user_id=actor) end
$$;
create or replace function public.my_store_permissions(p_store uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.member_permissions(p_store,auth.uid())
$$;
create or replace function public.has_store_permission(p_store uuid,p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_store_permissions(p_store) ? p_permission,false)
$$;
-- Unknown legacy administrative surfaces remain owner-only. is_admin() is used for entry/discovery.
create or replace function public.is_store_admin(target_store_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_store_owner(target_store_id) $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_super_admin() or exists(select from public.store_members where user_id=(select auth.uid()))
$$;
create or replace function public.get_my_managed_stores()
returns table(store_id uuid,slug text,name_ar text,name_en text,plan text,status text,max_products integer,
  role text,mobile_app_access text,mobile_app_unlocked boolean)
language plpgsql security definer set search_path = '' as $$
declare platform boolean := public.is_platform_super_admin();
begin
  if auth.uid() is null then return; end if;
  perform public.claim_pending_store_ownership();
  return query select s.id,s.slug::text,coalesce(nullif(ss.store_name,''),s.name_ar)::text,
    coalesce(nullif(s.name_en,''),s.name_ar)::text,s.plan::text,s.status::text,s.max_products,
    case when platform then 'super_admin' else m.role end,s.mobile_app_access::text,public.store_has_mobile_app_access(s.id)
    from public.stores s left join public.store_settings ss on ss.store_id=s.id
    left join public.store_members m on m.store_id=s.id and m.user_id=auth.uid()
    where platform or m.user_id is not null order by (s.id='00000000-0000-0000-0000-000000000001') desc,s.created_at desc;
end $$;

drop policy if exists insert_store_memberships on public.store_members;
drop policy if exists update_store_memberships on public.store_members;
drop policy if exists delete_store_memberships on public.store_members;
drop policy if exists read_store_memberships on public.store_members;
create policy read_store_memberships on public.store_members for select to authenticated
  using (user_id=(select auth.uid()) or public.has_store_permission(store_id,'manage_staff'));
revoke all on public.store_members from public,anon,authenticated;
grant select on public.store_members to authenticated;

create table if not exists public.store_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  email text not null check (length(email)<=254 and email=lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  role text not null check (role<>'owner'),
  permissions jsonb not null check (private.valid_team_role(role,permissions)),
  token_hash bytea not null unique check (octet_length(token_hash)=32),
  link_version bigint not null default 1 check (link_version>0),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid references auth.users on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status='accepted')=(accepted_at is not null))
);
create unique index if not exists store_pending_invite_email on public.store_invitations(store_id,email) where status='pending';
create index if not exists store_invite_history on public.store_invitations(store_id,email,created_at desc);
alter table public.store_invitations enable row level security;
revoke all on public.store_invitations from public,anon,authenticated;
grant select(id,store_id,email,role,permissions,status,invited_by,expires_at,accepted_at,created_at)
  on public.store_invitations to authenticated;
drop policy if exists team_invites_read on public.store_invitations;
create policy team_invites_read on public.store_invitations for select to authenticated
  using (public.has_store_permission(store_id,'manage_staff'));

-- Allow an authorized manager to copy the same link after refreshing, without persisting its bearer token.
create table if not exists private.team_signing_key (
  singleton boolean primary key check(singleton), secret bytea not null check(octet_length(secret)=32)
);
revoke all on private.team_signing_key from public,anon,authenticated,service_role;
insert into private.team_signing_key values(true,extensions.gen_random_bytes(32)) on conflict do nothing;
create or replace function private.invite_token(invite_id uuid, version bigint) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(invite_id::text || '/' || version::text,'UTF8'),secret,'sha256'),'hex')
    from private.team_signing_key where singleton
$$;
create or replace function private.invite_hash(token text) returns bytea
language sql immutable strict set search_path = '' as $$
  select case when length(token)=64 and token ~ '^[a-f0-9]{64}$' then sha256(convert_to(token,'UTF8')) end
$$;
create or replace function private.staff_usage(tenant uuid, at_time timestamptz) returns integer
language sql stable set search_path = '' as $$
  select ((select count(*) from public.store_members where store_id=tenant and role<>'owner') +
    (select count(*) from public.store_invitations where store_id=tenant and status='pending' and expires_at>at_time))::integer
$$;
create or replace function private.lock_team(tenant uuid) returns integer
language plpgsql volatile set search_path = '' as $$
declare caps jsonb;
begin
  -- Serialize with plan/override writers. A physical row version also makes stale repeatable-read writers retry.
  update public.store_subscriptions set revision=revision where store_id=tenant;
  caps := public.lock_store_entitlements(tenant);
  return (caps->>'max_staff_members')::numeric::integer;
end $$;
create or replace function private.guard_team_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tenant uuid; cap integer; successor uuid;
begin
  if tg_op='DELETE' then tenant := old.store_id; else tenant := new.store_id; end if;
  if tg_op='DELETE' and not exists(select from public.stores where id=tenant) then return old; end if;
  if tg_op='UPDATE' and (new.store_id,new.user_id) is distinct from (old.store_id,old.user_id) then
    raise exception 'immutable_member_identity';
  end if;
  cap := private.lock_team(tenant);
  if tg_op<>'DELETE' and new.role='owner' then new.permissions := private.team_preset('owner'); end if;
  if tg_op<>'INSERT' and old.role='owner' and (tg_op='DELETE' or new.role<>'owner') then
    select user_id into successor from public.store_members where store_id=tenant and role='owner' and user_id<>old.user_id
      order by created_at,user_id limit 1;
    if successor is null then raise exception 'last_owner' using errcode='PT409'; end if;
    update public.stores set owner_user_id=successor where id=tenant and owner_user_id=old.user_id;
  end if;
  if tg_op<>'DELETE' and new.role<>'owner' and (tg_op='INSERT' or old.role='owner') then
    perform public.require_quota_room('staff_members',private.staff_usage(tenant,clock_timestamp()),cap);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists guard_team_member on public.store_members;
create trigger guard_team_member before insert or update or delete on public.store_members
  for each row execute function private.guard_team_member();

create or replace function private.guard_invite_seat() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cap integer; at_time timestamptz;
begin
  if tg_op='UPDATE' and (new.store_id,new.id) is distinct from (old.store_id,old.id) then raise exception 'immutable_invite_identity'; end if;
  cap := private.lock_team(new.store_id);
  at_time := clock_timestamp();
  if new.status='pending' and new.expires_at>at_time and
     (tg_op='INSERT' or old.status<>'pending' or old.expires_at<=at_time) then
    perform public.require_quota_room('staff_members',private.staff_usage(new.store_id,at_time),cap);
  end if;
  return new;
end $$;
drop trigger if exists guard_invite_seat on public.store_invitations;
create trigger guard_invite_seat before insert or update of status,expires_at,store_id,id on public.store_invitations
  for each row execute function private.guard_invite_seat();

-- Legacy assignment and verified pending-ownership claims install the successor before removing the former owner.
create or replace function private.install_store_owner(tenant uuid, successor uuid, previous_owner uuid) returns void
language plpgsql set search_path = '' as $$
begin
  insert into public.store_members(store_id,user_id,role) values(tenant,successor,'owner')
    on conflict(store_id,user_id) do update set role='owner';
  update public.stores set owner_user_id=successor,pending_owner_email=null,updated_at=now() where id=tenant;
  if previous_owner is not null and previous_owner<>successor then
    delete from public.store_members where store_id=tenant and user_id=previous_owner;
    update public.profiles set role='customer' where store_id=tenant and id=previous_owner and role='admin';
  end if;
end $$;
create or replace function public.claim_pending_store_ownership() returns integer
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); mailbox text; rec record; claimed integer := 0;
begin
  select lower(btrim(u.email)) into mailbox from auth.users u where u.id=actor and customer_auth.mailbox_verified(actor,u.email);
  for rec in select id,owner_user_id from public.stores where lower(btrim(pending_owner_email))=mailbox order by id for update loop
    perform private.install_store_owner(rec.id,actor,rec.owner_user_id);
    claimed := claimed+1;
  end loop;
  return claimed;
end $$;
create or replace function public.super_admin_assign_store_owner(p_store_id uuid,p_owner_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare mailbox text := lower(btrim(p_owner_email)); previous_owner uuid; successor uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_platform_super_admin() then raise insufficient_privilege; end if;
  select owner_user_id into strict previous_owner from public.stores where id=p_store_id for update;
  if mailbox is null or mailbox !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'invalid_email'; end if;
  select u.id into successor from auth.users u where lower(btrim(u.email))=mailbox and customer_auth.mailbox_verified(u.id,u.email);
  if successor is not null then
    perform private.install_store_owner(p_store_id,successor,previous_owner);
    return jsonb_build_object('status','assigned','owner_email',mailbox,'user_id',successor);
  end if;
  update public.stores set pending_owner_email=mailbox,updated_at=now() where id=p_store_id;
  return jsonb_build_object('status','pending_signup','pending_owner_email',mailbox);
end $$;

create or replace function private.can_delegate(tenant uuid, actor uuid, target_role text, target_perms jsonb)
returns boolean language sql stable set search_path = '' as $$
  select coalesce((perms ? 'manage_staff') and perms @> target_perms and
    (target_role<>'owner' or exists(select from public.store_members where store_id=tenant and user_id=actor and role='owner')
      or exists(select from public.platform_admins where user_id=actor)),false)
  from (select private.member_permissions(tenant,actor) perms) access
$$;
create or replace function public.team_edit_member(p_store uuid,p_user uuid,p_role text,p_permissions jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare member public.store_members;
begin
  if not public.has_store_permission(p_store,'manage_staff') then raise insufficient_privilege; end if;
  -- Same lock order as the platform owner-assignment path.
  perform 1 from public.stores where id=p_store for update;
  perform private.lock_team(p_store);
  select * into strict member from public.store_members where store_id=p_store and user_id=p_user for update;
  if (auth.uid()=p_user and member.role<>'owner') or not private.can_delegate(p_store,auth.uid(),member.role,member.permissions)
    then raise insufficient_privilege; end if;
  if p_role is null and p_permissions is null then
    delete from public.store_members where store_id=p_store and user_id=p_user;
  else
    if not private.valid_team_role(p_role,p_permissions) then raise exception 'invalid_permissions' using errcode='PT400'; end if;
    if not private.can_delegate(p_store,auth.uid(),p_role,p_permissions) then raise insufficient_privilege; end if;
    update public.store_members set role=p_role,permissions=p_permissions where store_id=p_store and user_id=p_user;
  end if;
end $$;

create or replace function public.team_invite(p_store uuid,p_email text,p_role text,p_permissions jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invite_id uuid := gen_random_uuid(); mailbox text := lower(btrim(p_email));
begin
  if not public.has_store_permission(p_store,'manage_staff') then raise insufficient_privilege; end if;
  perform private.lock_team(p_store);
  if not private.valid_team_role(p_role,p_permissions) or p_role='owner' then raise exception 'invalid_permissions' using errcode='PT400'; end if;
  if not private.can_delegate(p_store,auth.uid(),p_role,p_permissions) then raise insufficient_privilege; end if;
  if exists(select from public.store_members m join auth.users u on u.id=m.user_id
    where m.store_id=p_store and lower(btrim(u.email))=mailbox) then raise exception 'already_member' using errcode='PT409'; end if;
  update public.store_invitations set status='expired' where store_id=p_store and email=mailbox and status='pending' and expires_at<=clock_timestamp();
  if exists(select from public.store_invitations where store_id=p_store and email=mailbox and status='pending') then
    raise exception 'already_invited' using errcode='PT409';
  end if;
  insert into public.store_invitations(id,store_id,email,role,permissions,token_hash,invited_by,expires_at)
    values(invite_id,p_store,mailbox,p_role,p_permissions,private.invite_hash(private.invite_token(invite_id,1)),
      auth.uid(),clock_timestamp()+interval '7 days');
  return invite_id;
end $$;

create or replace function public.team_invite_link(p_store uuid,p_id uuid,p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare invite public.store_invitations;
begin
  if not public.has_store_permission(p_store,'manage_staff') then raise insufficient_privilege; end if;
  perform private.lock_team(p_store);
  select * into invite from public.store_invitations where store_id=p_store and id=p_id for update;
  if not found or invite.status not in ('pending','expired') then raise exception 'invite_unavailable' using errcode='PT409'; end if;
  if not private.can_delegate(p_store,auth.uid(),invite.role,invite.permissions) then raise insufficient_privilege; end if;
  if p_action='revoke' then
    update public.store_invitations set status='revoked' where id=p_id;
    return null;
  elsif p_action='regenerate' then
    if exists(select from public.store_members m join auth.users u on u.id=m.user_id
      where m.store_id=p_store and lower(btrim(u.email))=invite.email) then raise exception 'already_member' using errcode='PT409'; end if;
    if exists(select from public.store_invitations where store_id=p_store and email=invite.email and id<>p_id and status='pending') then
      raise exception 'already_invited' using errcode='PT409';
    end if;
    update public.store_invitations set link_version=link_version+1,invited_by=auth.uid(),status='pending',
      token_hash=private.invite_hash(private.invite_token(id,link_version+1)),expires_at=clock_timestamp()+interval '7 days'
      where id=p_id returning * into invite;
  elsif p_action is distinct from 'copy' or invite.status<>'pending' or invite.expires_at<=clock_timestamp() then
    raise exception 'invite_unavailable' using errcode='PT409';
  end if;
  return private.invite_token(invite.id,invite.link_version);
end $$;

create or replace function public.team_invite_preview(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name_ar',s.name_ar,'name_en',s.name_en,'slug',s.slug,'role',i.role,'expires_at',i.expires_at,
    'account',case when auth.uid() is null then 'anonymous' when lower(btrim(u.email)) is distinct from i.email then 'mismatch'
      when not customer_auth.mailbox_verified(u.id,u.email) then 'verify' else 'ready' end)
  from public.store_invitations i join public.stores s on s.id=i.store_id left join auth.users u on u.id=auth.uid()
  where i.token_hash=private.invite_hash(p_token) and i.status='pending' and i.expires_at>statement_timestamp()
$$;
create or replace function public.team_accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); hashed bytea := private.invite_hash(p_token); tenant uuid;
  invite public.store_invitations; mailbox text; cap integer; used integer; accepted_time timestamptz;
begin
  if actor is null then raise insufficient_privilege; end if;
  select store_id into tenant from public.store_invitations where token_hash=hashed;
  if tenant is null then raise exception 'invite_unavailable' using errcode='PT409'; end if;
  cap := private.lock_team(tenant);
  select * into invite from public.store_invitations where store_id=tenant and token_hash=hashed for update;
  accepted_time := clock_timestamp();
  if not found or invite.status<>'pending' or invite.expires_at<=accepted_time then raise exception 'invite_unavailable' using errcode='PT409'; end if;
  select lower(btrim(u.email)) into mailbox from auth.users u where u.id=actor and customer_auth.mailbox_verified(actor,u.email) for share;
  if mailbox is distinct from invite.email then raise exception 'mailbox_required' using errcode='PT403'; end if;
  if not private.can_delegate(tenant,invite.invited_by,invite.role,invite.permissions) then raise insufficient_privilege; end if;
  if exists(select from public.store_members where store_id=tenant and user_id=actor) then raise exception 'already_member' using errcode='PT409'; end if;
  used := private.staff_usage(tenant,accepted_time);
  if used>cap then perform public.billing_quota_error('plan_limit_reached','staff_members',used,cap); end if;
  update public.store_invitations set status='accepted',accepted_at=accepted_time where id=invite.id;
  insert into public.store_members(store_id,user_id,role,permissions) values(tenant,actor,invite.role,invite.permissions);
  return tenant;
end $$;
create or replace function public.get_store_team(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_store_permission(p_store,'manage_staff') then raise insufficient_privilege; end if;
  return (select jsonb_build_object('used',private.staff_usage(p_store,statement_timestamp()),
    'cap',public.resolve_saas_entitlements(p,s.quota_overrides)->'max_staff_members',
    'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'email',u.email,'role',m.role,'permissions',m.permissions)
      order by (m.role='owner') desc,m.created_at,m.user_id),'[]') from public.store_members m join auth.users u on u.id=m.user_id where m.store_id=p_store),
    'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'permissions',i.permissions,
      'expires_at',i.expires_at,'expired',i.expires_at<=statement_timestamp() or i.status='expired') order by i.created_at desc),'[]')
      from public.store_invitations i where i.store_id=p_store and i.status in ('pending','expired')
        and not exists(select from public.store_invitations newer where newer.store_id=p_store and newer.email=i.email and newer.created_at>i.created_at)))
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code where s.store_id=p_store);
end $$;

create or replace function public.get_store_billing(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ym text := to_char(now() at time zone 'UTC','YYYY-MM');
begin
  if not public.has_store_permission(p_store,'manage_billing') then raise insufficient_privilege; end if;
  return (select jsonb_build_object('plan',to_jsonb(p),'billing_cycle',s.billing_cycle,'status',s.status,
    'trial_ends_at',s.trial_ends_at,'current_period_start',period.period_start,'current_period_end',period.period_end,
    'entitlements',public.resolve_saas_entitlements(p,s.quota_overrides),'quota_overrides',s.quota_overrides,
    'period_ym',ym,'products',s.active_products_count,'orders',coalesce(u.orders_count,0),'apk_builds',coalesce(u.apk_builds_count,0),
    'staff_members',private.staff_usage(p_store,statement_timestamp()))
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code
    cross join lateral public.billing_period(s.current_period_start,s.current_period_end,s.billing_cycle,
      case when s.status='active' then now() else s.current_period_start end) period
    left join public.store_monthly_usage u on u.store_id=s.store_id and u.period_ym=ym where s.store_id=p_store);
end $$;

-- Replace only the tenant-admin branch of the installed policies. Customer, public and
-- service-role branches keep their own predicates, including product column privileges.
do $$
declare entry record; pol record; source text; target text; predicate text; check_predicate text;
begin
  for entry in select * from (values
    ('products','manage_products'),('categories','manage_products'),('coupons','manage_products'),
    ('product_reviews','manage_products'),('search_synonyms','manage_products'),
    ('orders','manage_orders'),('order_items','manage_orders'),('return_requests','manage_orders'),
    ('store_customers','manage_customers'),('wallet_transactions','manage_customers'),('support_tickets','manage_customers'),
    ('abandoned_carts','manage_customers'),('cart_sessions','manage_customers'),('notifications','manage_customers'),
    ('back_in_stock_subscriptions','manage_customers'),('push_subscriptions','manage_customers'),
    ('notification_preferences','manage_customers'),('store_settings','manage_settings'),('store_payment_secrets','manage_settings'),
    ('store_domains','manage_domains'),('store_app_builds','manage_mobile_app'),
    ('store_subscriptions','manage_billing'),('store_monthly_usage','manage_billing')) m(tbl,perm)
  loop
    for pol in select * from pg_policies where schemaname='public' and tablename=entry.tbl
      and (qual like '%is_store_admin(%' or with_check like '%is_store_admin(%')
    loop
      source := 'is_store_admin[(]([a-z_.]+)[)]';
      target := format('public.has_store_permission(\1,%L)',entry.perm);
      predicate := regexp_replace(pol.qual,source,target,'g');
      check_predicate := regexp_replace(pol.with_check,source,target,'g');
      if concat(predicate,check_predicate) like '%is_store_admin(%' then raise exception 'unknown policy guard %',pol.policyname; end if;
      execute format('alter policy %I on public.%I %s %s',pol.policyname,entry.tbl,
        case when predicate is null then '' else 'using ('||predicate||')' end,
        case when check_predicate is null then '' else 'with check ('||check_predicate||')' end);
    end loop;
  end loop;
end $$;
alter policy customer_read_own_notifications on public.notifications using
  (target_role='customer' and (user_id=(select auth.uid()) or (user_id is null and category='promo_campaign')));
alter policy customer_delete_own_notifications on public.notifications using (target_role='customer' and user_id=(select auth.uid()));

create or replace function private.is_review_merchant(tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select public.has_store_permission(tenant,'manage_products') $$;
-- The campaign history and shared admin inbox combine customer, order and stock details.
create or replace function public.can_manage_store_notifications(tenant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_store_permissions(tenant) ?& array['manage_customers','manage_orders','manage_products'],false)
$$;
alter policy admin_manage_notifications on public.notifications using (public.can_manage_store_notifications(store_id))
  with check (public.can_manage_store_notifications(store_id));
alter policy admin_delete_notifications on public.notifications using (public.can_manage_store_notifications(store_id));
create or replace function public.admin_revenue(store_currency text) returns numeric
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_super_admin() and not exists(select from public.store_members
    where user_id=auth.uid() and permissions ? 'manage_orders') then raise insufficient_privilege; end if;
  return (select coalesce(sum(total),0) from public.orders
    where public.has_store_permission(store_id,'manage_orders') and status='delivered' and currency=store_currency);
end $$;
-- Patch the guard in place so inventory, wallet, customer self-service and delivery behavior stays intact.
do $$
declare entry record; body text; old_guard text; new_guard text;
begin
  for entry in select * from (values
    ('save_catalog_product(uuid,uuid,jsonb,jsonb,jsonb,integer,text)','p_store','manage_products'),
    ('admin_moderate_review(uuid,uuid,text,text)','p_store_id','manage_products'),
    ('admin_process_return_request(uuid,text,text,boolean)','v_req.store_id','manage_orders'),
    ('award_order_cashback(uuid,uuid,boolean)','p_store_id','manage_orders'),
    ('refund_wallet_for_cancelled_order(uuid,uuid)','p_store_id','manage_orders'),
    ('switch_order_to_cod(uuid,uuid,text)','p_store','manage_orders'),
    ('get_customer_wallet_summary(uuid,uuid)','p_store_id','manage_customers'),
    ('admin_adjust_customer_wallet(uuid,uuid,numeric,text,text)','p_store_id','manage_customers'),
    ('admin_update_customer_notes(uuid,uuid,text)','p_store_id','manage_customers'),
    ('admin_abandoned_cart_summary(uuid)','p_store_id','manage_customers'),
    ('admin_update_abandoned_cart(uuid,text,text)','v_cart.store_id','manage_customers'),
    ('set_store_domain_primary(uuid,uuid,boolean)','p_store_id','manage_domains'),
    ('admin_dashboard_metrics(uuid,timestamptz,timestamptz,timestamptz,timestamptz)','p_store_id','overview')
  ) m(sig,arg,perm) loop
    body := pg_get_functiondef(('public.'||entry.sig)::regprocedure);
    old_guard := format('public.is_store_admin(%s)',entry.arg);
    new_guard := case when entry.perm='overview' then
      '(public.my_store_permissions(p_store_id) ?& array[''manage_orders'',''manage_products'',''manage_customers'',''manage_settings''])'
      else format('public.has_store_permission(%s,%L)',entry.arg,entry.perm) end;
    if strpos(body,old_guard)=0 and strpos(body,new_guard)=0 then raise exception 'unrecognized RPC guard in %',entry.sig; end if;
    if entry.perm='overview' or entry.sig='admin_abandoned_cart_summary(uuid)' then
      body := regexp_replace(body,'auth[.]role[(][)] is null[[:space:]]+or[[:space:]]+','','gi');
    end if;
    execute replace(body,old_guard,new_guard);
  end loop;
end $$;

-- Check before the aggregate runs, including empty stores where a row filter would never execute.
do $$
declare entry record; src text; args text; lang text; guard text;
begin
  for entry in select * from (values
    ('admin_dashboard_metrics(uuid,timestamptz,timestamptz,timestamptz,timestamptz)',
      array['manage_orders','manage_products','manage_customers','manage_settings']),
    ('admin_abandoned_cart_summary(uuid)',array['manage_customers'])
  ) m(sig,required) loop
    select p.prosrc,pg_get_function_arguments(p.oid),l.lanname into strict src,args,lang
      from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=('public.'||entry.sig)::regprocedure;
    guard := format('if coalesce(auth.role(),'''')<>''service_role'' and not coalesce(public.my_store_permissions(p_store_id) ?& %L::text[],false) then raise insufficient_privilege; end if;',entry.required);
    if lang='sql' then
      execute format('create or replace function public.%I(%s) returns jsonb language plpgsql stable security definer set search_path = '''' as %L',
        split_part(entry.sig,'(',1),args,'begin '||guard||' return ('||btrim(src,E' \n\t\r;')||'); end');
    elsif strpos(src,guard)=0 then raise exception 'unrecognized aggregate guard in %',entry.sig; end if;
  end loop;
end $$;

do $$
declare body text := pg_get_functiondef('public.mark_notifications_read(uuid,uuid[],boolean,text)'::regprocedure);
  target constant text := 'public.can_manage_store_notifications(p_store_id)';
begin
  body := replace(body,'public.is_store_admin(p_store_id)',target);
  body := replace(body,'public.has_store_permission(p_store_id,''manage_customers'')',target);
  if strpos(body,target)=0 then raise exception 'unrecognized notifications guard'; end if;
  execute body;
end $$;

-- The service performs the external operation. Recheck the requester at the database write after waiting on the team lock.
do $$
declare body text := pg_get_functiondef('public.queue_store_apk(uuid,uuid,text,text,text,text,text)'::regprocedure);
  anchor constant text := 'if not found then raise exception ''unknown_store''; end if;';
  guard constant text := 'if not coalesce(private.member_permissions(p_store,p_requester) ? ''manage_mobile_app'',false) then raise insufficient_privilege; end if;';
begin
  if strpos(body,guard)=0 then
    if strpos(body,anchor)=0 then raise exception 'unrecognized APK queue lock'; end if;
    execute replace(body,anchor,anchor||' '||guard);
  end if;
end $$;
create or replace function public.record_store_domain_dns(p_store uuid,p_actor uuid,p_id uuid,p_token text,
  p_expected_status text,p_updated_at timestamptz,p_status text,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.store_subscriptions where store_id=p_store for no key update;
  if not coalesce(private.member_permissions(p_store,p_actor) ? 'manage_domains',false) then raise insufficient_privilege; end if;
  update public.store_domains set status=p_status,last_error=p_error where store_id=p_store and id=p_id
    and status=p_expected_status and updated_at=p_updated_at and verification_token=p_token;
  return found;
end $$;
revoke all on function public.record_store_domain_dns(uuid,uuid,uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_store_domain_dns(uuid,uuid,uuid,text,text,timestamptz,text,text) to service_role;

create or replace function public.can_manage_store_image(object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare folders text[] := storage.foldername(object_name); tenant text; permission text;
begin
  if object_name ~ '(^|/)[.][.](/|$)' then return false; end if;
  if public.is_platform_super_admin() then return true; end if;
  if folders[1] in ('app-icons','banners') then
    tenant := folders[2]; permission := case folders[1] when 'app-icons' then 'manage_mobile_app' else 'manage_settings' end;
  else
    tenant := folders[1]; permission := case folders[2] when 'banners' then 'manage_settings'
      when 'app-icons' then 'manage_mobile_app' else 'manage_products' end;
  end if;
  if tenant is null or tenant !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then return false; end if;
  return public.has_store_permission(tenant::uuid,permission);
end $$;
alter policy nova_upload_images on storage.objects with check (bucket_id='product-images' and public.can_manage_store_image(name));
alter policy nova_delete_images on storage.objects using (bucket_id='product-images' and public.can_manage_store_image(name));
alter policy nova_update_images on storage.objects using (bucket_id='product-images' and public.can_manage_store_image(name))
  with check (bucket_id='product-images' and public.can_manage_store_image(name));
-- Operational pages can read just their own allowance without access to billing or other resources.
create or replace function public.get_resource_allowance(p_store uuid,p_resource text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare perm text; quota_key text; ym text := to_char(now() at time zone 'UTC','YYYY-MM');
begin
  select permission,key into perm,quota_key from (values ('products','manage_products','max_products'),
    ('apk_builds','manage_mobile_app','max_monthly_apk_builds'),('custom_domains','manage_domains','custom_domains_enabled')) r(resource,permission,key)
    where resource=p_resource;
  if not public.has_store_permission(p_store,perm) then raise insufficient_privilege; end if;
  return (select jsonb_build_object('cap',public.resolve_saas_entitlements(p,s.quota_overrides)->quota_key,'period_ym',ym,
    'plan_name_ar',p.name_ar,'plan_name_en',p.name_en,'used',case p_resource when 'products' then s.active_products_count
      when 'apk_builds' then coalesce(u.apk_builds_count,0) else (select count(*) from public.store_domains where store_id=p_store) end)
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code
    left join public.store_monthly_usage u on u.store_id=s.store_id and u.period_ym=ym where s.store_id=p_store);
end $$;

revoke all on function private.team_preset(text),private.valid_team_role(text,jsonb),private.member_permissions(uuid,uuid),
  private.can_delegate(uuid,uuid,text,jsonb),private.staff_usage(uuid,timestamptz),private.lock_team(uuid),
  private.install_store_owner(uuid,uuid,uuid),private.guard_team_member(),private.guard_invite_seat(),
  private.invite_token(uuid,bigint),private.invite_hash(text) from public,anon,authenticated,service_role;
grant execute on function private.valid_team_role(text,jsonb),private.team_preset(text) to service_role;
revoke all on function public.my_store_permissions(uuid),public.has_store_permission(uuid,text),public.can_manage_store_notifications(uuid),
  public.can_manage_store_image(text),public.get_resource_allowance(uuid,text),public.get_store_team(uuid),
  public.team_invite(uuid,text,text,jsonb),public.team_edit_member(uuid,uuid,text,jsonb),public.team_invite_link(uuid,uuid,text),
  public.team_invite_preview(text),public.team_accept_invite(text) from public,anon,authenticated,service_role;
grant execute on function public.my_store_permissions(uuid),public.has_store_permission(uuid,text),public.can_manage_store_notifications(uuid),
  public.can_manage_store_image(text),public.get_resource_allowance(uuid,text),public.get_store_team(uuid),
  public.team_invite(uuid,text,text,jsonb),public.team_edit_member(uuid,uuid,text,jsonb),public.team_invite_link(uuid,uuid,text),
  public.team_accept_invite(text) to authenticated;
grant execute on function public.team_invite_preview(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
