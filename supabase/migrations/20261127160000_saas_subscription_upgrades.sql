begin;
set local timezone = 'UTC';
set local lock_timeout = '8s';

alter table public.store_subscriptions
  add column if not exists trial_used_at timestamptz,
  add column if not exists scheduled_plan_code text references public.saas_plans(code),
  add column if not exists scheduled_billing_cycle text check (scheduled_billing_cycle in ('monthly','annual')),
  add column if not exists scheduled_effective_at timestamptz;
alter table public.store_subscriptions drop constraint if exists subscription_schedule_complete;
alter table public.store_subscriptions add constraint subscription_schedule_complete check (
  (scheduled_plan_code is null) = (scheduled_billing_cycle is null)
  and (scheduled_plan_code is null) = (scheduled_effective_at is null)
);
update public.store_subscriptions set trial_used_at=current_period_start
where trial_used_at is null and (status='trialing' or trial_ends_at is not null);
grant select(trial_used_at,scheduled_plan_code,scheduled_billing_cycle,scheduled_effective_at)
  on public.store_subscriptions to authenticated;

-- Only a self-serve trial needs a return destination. Preserve the paid plan's
-- renewal anchor and the merchant's existing period, even when the trial crosses it.
create table if not exists private.billing_trial_origins (
  store_id uuid primary key references public.store_subscriptions(store_id) on delete cascade,
  plan_code text not null references public.saas_plans(code),
  billing_cycle text not null, status text not null,
  period_start timestamptz not null, period_end timestamptz not null
);
revoke all on private.billing_trial_origins from public,anon,authenticated;

create table if not exists public.platform_billing_settings (
  id integer primary key default 1 check (id=1),
  paymob_enabled boolean not null default false,
  paymob_card_enabled boolean not null default false,
  paymob_wallet_enabled boolean not null default false,
  manual_transfer_enabled boolean not null default true,
  instapay_handle text check (length(instapay_handle)<=120),
  wallet_transfer_number text check (length(wallet_transfer_number)<=32),
  bank_name text check (length(bank_name)<=120),
  bank_account_name text check (length(bank_account_name)<=120),
  bank_iban text check (length(bank_iban)<=64),
  manual_instructions_ar text check (length(manual_instructions_ar)<=1000),
  manual_instructions_en text check (length(manual_instructions_en)<=1000),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.platform_billing_settings(id) values(1) on conflict (id) do nothing;
create table if not exists public.platform_billing_secrets (
  id integer primary key default 1 check (id=1),
  paymob_api_key text, paymob_hmac_secret text, paymob_card_integration_id text,
  paymob_card_iframe_id text, paymob_wallet_integration_id text,
  updated_at timestamptz not null default now()
);
insert into public.platform_billing_secrets(id) values(1) on conflict (id) do nothing;

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  target_plan_code text not null references public.saas_plans(code),
  target_billing_cycle text not null check (target_billing_cycle in ('monthly','annual')),
  amount_egp integer not null check (amount_egp>=0), currency text not null default 'EGP',
  payment_channel text not null check (payment_channel in
    ('paymob_card','paymob_wallet','instapay','bank_transfer','mobile_wallet_manual')),
  status text not null default 'pending' check (status in
    ('pending','awaiting_review','paid','failed','rejected','cancelled','expired','refunded')),
  idempotency_key text not null,
  transfer_reference text check (length(transfer_reference)<=120),
  transfer_sender text check (length(transfer_sender)<=120),
  receipt_path text check (length(receipt_path)<=400),
  merchant_note text check (length(merchant_note)<=1000),
  review_note text check (length(review_note)<=1000),
  reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz,
  paymob_order_id text, paymob_transaction_id text, paid_at timestamptz, expires_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(store_id,idempotency_key)
);
create unique index if not exists subscription_invoices_one_open_manual_idx
  on public.subscription_invoices(store_id) where status='awaiting_review';
create index if not exists subscription_invoices_store_idx on public.subscription_invoices(store_id,created_at desc,id desc);
create index if not exists subscription_invoices_status_idx on public.subscription_invoices(status,created_at desc);
create unique index if not exists subscription_invoices_provider_idx on public.subscription_invoices(paymob_order_id)
  where paymob_order_id is not null;

create table if not exists public.subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.subscription_invoices(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade, idempotency_key text not null,
  payment_method text not null check (payment_method in ('paymob_card','paymob_wallet')),
  amount_cents integer not null check (amount_cents>0), paymob_order_id text, paymob_transaction_id text,
  status text not null default 'reserved' check (status in
    ('reserved','initiated','pending','paid','failed','cancelled','expired','refunded','voided')),
  raw_payload jsonb, checkout_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(store_id,idempotency_key)
);
create unique index if not exists subscription_attempt_provider_idx on public.subscription_payment_attempts(paymob_order_id)
  where paymob_order_id is not null;
create unique index if not exists subscription_attempt_transaction_idx on public.subscription_payment_attempts(paymob_transaction_id)
  where paymob_transaction_id is not null;

alter table public.platform_billing_settings enable row level security;
alter table public.platform_billing_secrets enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_payment_attempts enable row level security;
revoke all on public.platform_billing_settings, public.platform_billing_secrets,
  public.subscription_invoices, public.subscription_payment_attempts from public,anon,authenticated;
grant all on public.platform_billing_settings, public.platform_billing_secrets,
  public.subscription_invoices, public.subscription_payment_attempts to service_role;
grant select on public.subscription_invoices to authenticated;
drop policy if exists subscription_invoice_read on public.subscription_invoices;
create policy subscription_invoice_read on public.subscription_invoices for select to authenticated
  using (public.has_store_permission(store_id,'manage_billing') or (select public.is_platform_super_admin()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('billing-receipts','billing-receipts',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types
where (buckets.public,buckets.file_size_limit,buckets.allowed_mime_types)
  is distinct from (excluded.public,excluded.file_size_limit,excluded.allowed_mime_types);

create or replace function private.require_store_billing(p_store uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.has_store_permission(p_store,'manage_billing') is not true then
    raise insufficient_privilege;
  end if;
end $$;

create or replace function public.get_platform_billing_options(p_store uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_store_billing(p_store);
  return (select to_jsonb(s) from public.platform_billing_settings s where id=1);
end $$;

create or replace function public.billing_admin_secret_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if public.is_platform_super_admin() is not true then raise insufficient_privilege; end if;
  return (select jsonb_build_object('paymob_api_key',paymob_api_key is not null,
    'paymob_hmac_secret',paymob_hmac_secret is not null,'paymob_card_integration_id',paymob_card_integration_id is not null,
    'paymob_card_iframe_id',paymob_card_iframe_id is not null,'paymob_wallet_integration_id',paymob_wallet_integration_id is not null)
    from public.platform_billing_secrets where id=1);
end $$;

create or replace function public.billing_admin_payment_settings(p_expected_revision integer,p_settings jsonb,p_secrets jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.platform_billing_settings; v public.platform_billing_secrets;
begin
  if public.is_platform_super_admin() is not true then raise insufficient_privilege; end if;
  if jsonb_typeof(p_settings) is distinct from 'object' or jsonb_typeof(p_secrets) is distinct from 'object' then
    raise exception 'billing_invalid_input' using errcode='PT400';
  end if;
  select * into strict s from public.platform_billing_settings where id=1 for update;
  if s.revision is distinct from p_expected_revision then raise exception 'billing_edit_conflict' using errcode='PT409'; end if;
  s := jsonb_populate_record(s,p_settings);
  update public.platform_billing_secrets as vault set
    paymob_api_key=coalesce(nullif(btrim(p_secrets->>'paymob_api_key'),''),paymob_api_key),
    paymob_hmac_secret=coalesce(nullif(btrim(p_secrets->>'paymob_hmac_secret'),''),paymob_hmac_secret),
    paymob_card_integration_id=coalesce(nullif(btrim(p_secrets->>'paymob_card_integration_id'),''),paymob_card_integration_id),
    paymob_card_iframe_id=coalesce(nullif(btrim(p_secrets->>'paymob_card_iframe_id'),''),paymob_card_iframe_id),
    paymob_wallet_integration_id=coalesce(nullif(btrim(p_secrets->>'paymob_wallet_integration_id'),''),paymob_wallet_integration_id),
    updated_at=now() where id=1 and exists (
      select from jsonb_each_text(p_secrets) e
      where e.key in ('paymob_api_key','paymob_hmac_secret','paymob_card_integration_id',
        'paymob_card_iframe_id','paymob_wallet_integration_id')
      and nullif(btrim(e.value),'') is not null and btrim(e.value) is distinct from (to_jsonb(vault)->>e.key)
    );
  select * into strict v from public.platform_billing_secrets where id=1;
  if s.paymob_enabled and (not(s.paymob_card_enabled or s.paymob_wallet_enabled)
    or v.paymob_api_key is null or v.paymob_hmac_secret is null
    or (s.paymob_card_enabled and (v.paymob_card_integration_id is null or v.paymob_card_iframe_id is null))
    or (s.paymob_wallet_enabled and v.paymob_wallet_integration_id is null)) then
    raise exception 'billing_channel_unavailable' using errcode='PT400';
  end if;
  update public.platform_billing_settings set
    paymob_enabled=s.paymob_enabled,paymob_card_enabled=s.paymob_card_enabled,paymob_wallet_enabled=s.paymob_wallet_enabled,
    manual_transfer_enabled=s.manual_transfer_enabled,instapay_handle=nullif(btrim(s.instapay_handle),''),
    wallet_transfer_number=nullif(btrim(s.wallet_transfer_number),''),bank_name=nullif(btrim(s.bank_name),''),
    bank_account_name=nullif(btrim(s.bank_account_name),''),bank_iban=nullif(btrim(s.bank_iban),''),
    manual_instructions_ar=nullif(btrim(s.manual_instructions_ar),''),manual_instructions_en=nullif(btrim(s.manual_instructions_en),''),
    revision=revision+1,updated_at=now() where id=1 returning revision into s.revision;
  return s.revision;
end $$;

-- Keep edits through the existing super-admin subscription editor consistent
-- with a previously scheduled change or a temporary self-serve trial.
create or replace function private.billing_subscription_edit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='trialing' or new.trial_ends_at is not null then
    new.trial_used_at := coalesce(new.trial_used_at,new.current_period_start);
  end if;
  if tg_op='UPDATE' then
    new.trial_used_at := coalesce(old.trial_used_at,new.trial_used_at);
    if (old.plan_code,old.status,old.billing_cycle,old.trial_ends_at,old.current_period_end)
      is distinct from (new.plan_code,new.status,new.billing_cycle,new.trial_ends_at,new.current_period_end) then
      new.scheduled_plan_code := null;
      new.scheduled_billing_cycle := null;
      new.scheduled_effective_at := null;
      if old.status='trialing' and new.status<>'trialing' then
        delete from private.billing_trial_origins where store_id=old.store_id;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists billing_subscription_edit on public.store_subscriptions;
create trigger billing_subscription_edit before insert or update of
  status,plan_code,billing_cycle,trial_ends_at,current_period_end,trial_used_at on public.store_subscriptions
  for each row execute function private.billing_subscription_edit();

-- The subscription row is always the first write lock (also for settlement).
create or replace function private.billing_lock_subscription(p_store uuid) returns public.store_subscriptions
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s public.store_subscriptions; prior private.billing_trial_origins;
begin
  select * into strict s from public.store_subscriptions where store_id=p_store for no key update;
  if s.scheduled_effective_at<=now() then
    update public.store_subscriptions set plan_code=s.scheduled_plan_code,billing_cycle=s.scheduled_billing_cycle,
      status='active',trial_ends_at=null,current_period_start=s.scheduled_effective_at,
      current_period_end=s.scheduled_effective_at+
        case when s.scheduled_billing_cycle='annual' then interval '1 year' else interval '1 month' end,
      scheduled_plan_code=null,scheduled_billing_cycle=null,scheduled_effective_at=null,revision=revision+1
    where store_id=p_store returning * into strict s;
  elsif s.status='trialing' and s.trial_ends_at<=now() then
    select * into prior from private.billing_trial_origins where store_id=p_store;
    if found then
      update public.store_subscriptions set plan_code=prior.plan_code,billing_cycle=prior.billing_cycle,status=prior.status,
        trial_ends_at=null,current_period_start=prior.period_start,current_period_end=prior.period_end,revision=revision+1
      where store_id=p_store returning * into strict s;
    end if;
  end if;
  return s;
end $$;

create or replace function public.lock_store_entitlements(p_store uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s public.store_subscriptions; p public.saas_plans;
begin
  s := private.billing_lock_subscription(p_store);
  select * into strict p from public.saas_plans where code=s.plan_code for share;
  return public.resolve_saas_entitlements(p,s.quota_overrides);
end $$;

create or replace function public.get_store_billing(p_store uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ym text := to_char(now() at time zone 'UTC','YYYY-MM');
begin
  perform private.require_store_billing(p_store);
  if exists(select from public.store_subscriptions s where store_id=p_store and
    (s.scheduled_effective_at<=now() or (s.status='trialing' and s.trial_ends_at<=now() and
       exists(select from private.billing_trial_origins o where o.store_id=p_store)))) then
    perform private.billing_lock_subscription(p_store);
  end if;
  return (select jsonb_build_object('plan',to_jsonb(p),'billing_cycle',s.billing_cycle,'status',s.status,
    'trial_ends_at',s.trial_ends_at,'trial_used_at',s.trial_used_at,'can_start_trial',s.trial_used_at is null,
    'scheduled_plan_code',s.scheduled_plan_code,'scheduled_billing_cycle',s.scheduled_billing_cycle,
    'scheduled_effective_at',s.scheduled_effective_at,'current_period_start',period.period_start,'current_period_end',period.period_end,
    'entitlements',public.resolve_saas_entitlements(p,s.quota_overrides),'quota_overrides',s.quota_overrides,
    'period_ym',ym,'products',s.active_products_count,'orders',coalesce(u.orders_count,0),'apk_builds',coalesce(u.apk_builds_count,0),
    'staff_members',private.staff_usage(p_store,statement_timestamp()),
    'custom_domains',(select count(*) from public.store_domains where store_id=p_store))
    from public.store_subscriptions s join public.saas_plans p on p.code=s.plan_code
    cross join lateral public.billing_period(s.current_period_start,s.current_period_end,s.billing_cycle,
      case when s.status='active' then now() else s.current_period_start end) period
    left join public.store_monthly_usage u on u.store_id=s.store_id and u.period_ym=ym where s.store_id=p_store);
end $$;

create or replace function private.billing_target(p_plan text,p_cycle text) returns public.saas_plans
language plpgsql security definer set search_path='' as $$
declare p public.saas_plans;
begin
  if p_cycle is null or p_cycle not in ('monthly','annual') then raise exception 'billing_invalid_input' using errcode='PT400'; end if;
  select * into p from public.saas_plans where code=p_plan and is_active for share;
  if not found then raise exception 'billing_plan_ineligible' using errcode='PT409'; end if;
  return p;
end $$;
create or replace function private.billing_price(p public.saas_plans,p_cycle text) returns integer
language sql immutable set search_path='' as $$
  select case when p_cycle='annual' then p.annual_price_egp else p.monthly_price_egp end
$$;

create or replace function public.billing_start_trial(p_store uuid,p_plan text,p_cycle text) returns void
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare s public.store_subscriptions; p public.saas_plans; trial_end timestamptz;
begin
  perform private.require_store_billing(p_store);
  s := private.billing_lock_subscription(p_store);
  p := private.billing_target(p_plan,p_cycle);
  if s.trial_used_at is not null or p.trial_days<=0 or private.billing_price(p,p_cycle)<=(
    select private.billing_price(current_plan,p_cycle) from public.saas_plans current_plan where code=s.plan_code)
  then raise exception 'billing_trial_unavailable' using errcode='PT409'; end if;
  insert into private.billing_trial_origins values(s.store_id,s.plan_code,s.billing_cycle,s.status,s.current_period_start,s.current_period_end);
  trial_end := now()+make_interval(days=>p.trial_days);
  update public.store_subscriptions set plan_code=p_plan,billing_cycle=p_cycle,status='trialing',trial_used_at=now(),
    trial_ends_at=trial_end,current_period_start=now(),current_period_end=trial_end,
    scheduled_plan_code=null,scheduled_billing_cycle=null,scheduled_effective_at=null,revision=revision+1 where store_id=p_store;
end $$;

create or replace function public.billing_schedule_plan_change(p_store uuid,p_plan text,p_cycle text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.store_subscriptions; p public.saas_plans; effective timestamptz;
begin
  perform private.require_store_billing(p_store);
  s := private.billing_lock_subscription(p_store);
  p := private.billing_target(p_plan,p_cycle);
  if s.plan_code=p_plan or ((p_plan<>'starter' or private.billing_price(p,p_cycle)<>0) and private.billing_price(p,p_cycle)>=(
    select private.billing_price(current_plan,p_cycle) from public.saas_plans current_plan where code=s.plan_code))
  then raise exception 'billing_plan_ineligible' using errcode='PT409'; end if;
  select period_end into effective from public.billing_period(s.current_period_start,s.current_period_end,s.billing_cycle,
    case when s.status='active' then now() else s.current_period_start end);
  update public.store_subscriptions set scheduled_plan_code=p_plan,scheduled_billing_cycle=p_cycle,
    scheduled_effective_at=effective,revision=revision+1 where store_id=p_store
      and (scheduled_plan_code,scheduled_billing_cycle,scheduled_effective_at) is distinct from (p_plan,p_cycle,effective);
end $$;
create or replace function public.billing_cancel_scheduled_change(p_store uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_store_billing(p_store);
  perform private.billing_lock_subscription(p_store);
  update public.store_subscriptions set scheduled_plan_code=null,scheduled_billing_cycle=null,scheduled_effective_at=null,
    revision=revision+1 where store_id=p_store and scheduled_plan_code is not null;
end $$;

create or replace function private.billing_checkout_price(s public.store_subscriptions,p_plan text,p_cycle text) returns integer
language plpgsql security definer set search_path='' as $$
declare p public.saas_plans := private.billing_target(p_plan,p_cycle); amount integer := private.billing_price(p,p_cycle);
begin
  if amount<=0 or (s.plan_code=p_plan and s.status='active' and not (
      s.billing_cycle='monthly' and p_cycle='annual' and amount<p.monthly_price_egp::bigint*12)) or
    (s.plan_code<>p_plan and amount<=(select private.billing_price(current_plan,p_cycle) from public.saas_plans current_plan where code=s.plan_code))
  then raise exception 'billing_plan_ineligible' using errcode='PT409'; end if;
  return amount;
end $$;

create or replace function private.billing_activate(i public.subscription_invoices) returns void
language sql security definer set search_path='' set timezone='UTC' as $$
  update public.store_subscriptions set plan_code=i.target_plan_code,billing_cycle=i.target_billing_cycle,status='active',
    trial_ends_at=null,scheduled_plan_code=null,scheduled_billing_cycle=null,scheduled_effective_at=null,
    current_period_start=now(),current_period_end=now()+case i.target_billing_cycle when 'annual' then interval '1 year' else interval '1 month' end,
    revision=revision+1 where store_id=i.store_id
$$;

-- Replace the previous signatures so the defaulted quote argument remains unambiguous for PostgREST.
drop function if exists public.billing_submit_manual_upgrade(uuid,text,text,text,text,text,text,text,text);
create or replace function public.billing_submit_manual_upgrade(p_store uuid,p_plan text,p_cycle text,p_channel text,
  p_reference text,p_sender text,p_note text,p_receipt_path text,p_idempotency_key text,p_expected_amount integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.store_subscriptions; i public.subscription_invoices; config public.platform_billing_settings; amount integer;
begin
  perform private.require_store_billing(p_store);
  s := private.billing_lock_subscription(p_store);
  p_reference := btrim(p_reference);
  p_sender := nullif(btrim(p_sender),'');
  p_note := nullif(btrim(p_note),'');
  p_receipt_path := nullif(btrim(p_receipt_path),'');
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.-]{8,120}$'
    or p_reference is null or length(p_reference) not between 3 and 120
    or length(p_sender)>120 or length(p_note)>1000 or length(p_receipt_path)>400
    or (p_receipt_path is not null and (split_part(p_receipt_path,'/',1)<>p_store::text
        or strpos(p_receipt_path,'/')=0 or p_receipt_path ~ '(^|/)[.]{1,2}(/|$)'))
  then raise exception 'billing_invalid_input' using errcode='PT400'; end if;
  select * into i from public.subscription_invoices where store_id=p_store and idempotency_key=p_idempotency_key;
  if found then
    if (i.target_plan_code,i.target_billing_cycle,i.payment_channel,i.transfer_reference,i.transfer_sender,i.merchant_note,i.receipt_path)
      is distinct from (p_plan,p_cycle,p_channel,p_reference,p_sender,p_note,p_receipt_path)
    then raise exception 'billing_idempotency_conflict' using errcode='PT409'; end if;
    if p_expected_amount is not null and p_expected_amount<>i.amount_egp then
      raise exception 'billing_price_changed' using errcode='PT409';
    end if;
    return i.id;
  end if;
  select * into strict config from public.platform_billing_settings where id=1 for share;
  if not config.manual_transfer_enabled or (case p_channel when 'instapay' then config.instapay_handle
    when 'bank_transfer' then config.bank_iban when 'mobile_wallet_manual' then config.wallet_transfer_number end) is null
  then raise exception 'billing_channel_unavailable' using errcode='PT409'; end if;
  if exists(select from public.subscription_invoices where store_id=p_store and status='awaiting_review') then
    raise exception 'billing_manual_pending' using errcode='PT409';
  end if;
  if p_receipt_path is not null and not exists(select from storage.objects where bucket_id='billing-receipts' and name=p_receipt_path) then
    raise exception 'billing_invalid_input' using errcode='PT400';
  end if;
  amount := private.billing_checkout_price(s,p_plan,p_cycle);
  if p_expected_amount is not null and p_expected_amount<>amount then raise exception 'billing_price_changed' using errcode='PT409'; end if;
  insert into public.subscription_invoices(store_id,requested_by,target_plan_code,target_billing_cycle,amount_egp,
    payment_channel,status,idempotency_key,transfer_reference,transfer_sender,merchant_note,receipt_path)
  values(p_store,auth.uid(),p_plan,p_cycle,amount,p_channel,'awaiting_review',p_idempotency_key,p_reference,p_sender,p_note,p_receipt_path)
  returning id into i.id;
  return i.id;
end $$;

create or replace function public.billing_cancel_manual_upgrade(p_store uuid,p_invoice_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_store_billing(p_store);
  perform private.billing_lock_subscription(p_store);
  update public.subscription_invoices set status='cancelled',updated_at=now()
    where id=p_invoice_id and store_id=p_store and status='awaiting_review';
  if not found then raise exception 'billing_request_unavailable' using errcode='PT409'; end if;
end $$;

create or replace function public.billing_review_manual_upgrade(p_invoice_id uuid,p_decision text,p_review_note text) returns void
language plpgsql security definer set search_path='' as $$
declare tenant uuid; i public.subscription_invoices;
begin
  if public.is_platform_super_admin() is not true then raise insufficient_privilege; end if;
  p_review_note := nullif(btrim(p_review_note),'');
  if p_decision is null or p_decision not in ('approve','reject') or length(p_review_note)>1000
    or (p_decision='reject' and p_review_note is null) then raise exception 'billing_invalid_input' using errcode='PT400'; end if;
  select store_id into strict tenant from public.subscription_invoices where id=p_invoice_id;
  perform 1 from public.store_subscriptions where store_id=tenant for no key update;
  select * into strict i from public.subscription_invoices where id=p_invoice_id for update;
  if i.status<>'awaiting_review' then raise exception 'billing_request_unavailable' using errcode='PT409'; end if;
  if p_decision='approve' then perform private.billing_activate(i); end if;
  update public.subscription_invoices set status=case p_decision when 'approve' then 'paid' else 'rejected' end,
    paid_at=case when p_decision='approve' then now() end,reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=p_review_note,updated_at=now() where id=p_invoice_id;
end $$;

drop function if exists public.reserve_subscription_paymob(uuid,uuid,text,text,text,text);
create or replace function public.reserve_subscription_paymob(p_store uuid,p_user uuid,p_plan text,p_cycle text,
  p_method text,p_idempotency_key text,p_expected_amount integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.store_subscriptions; i public.subscription_invoices; a public.subscription_payment_attempts;
  amount integer; created boolean := false;
begin
  if not coalesce(private.member_permissions(p_store,p_user) ? 'manage_billing',false) then raise insufficient_privilege; end if;
  if p_method is null or p_method not in ('paymob_card','paymob_wallet') or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9_.-]{8,120}$' then raise exception 'billing_invalid_input' using errcode='PT400'; end if;
  s := private.billing_lock_subscription(p_store);
  -- A process that dies between reserve and bind leaves a bounded reservation.
  -- A late authenticated provider notification can still settle its bound invoice.
  with expired as (
    update public.subscription_invoices set status='expired',updated_at=now()
    where store_id=p_store and status='pending' and expires_at<=now() returning id
  )
  update public.subscription_payment_attempts set status='expired',checkout_url=null,updated_at=now()
    where invoice_id in (select id from expired) and status in ('reserved','initiated','pending');
  select * into i from public.subscription_invoices where store_id=p_store and idempotency_key=p_idempotency_key;
  if found and (i.target_plan_code,i.target_billing_cycle,i.payment_channel) is distinct from (p_plan,p_cycle,p_method) then
    raise exception 'billing_idempotency_conflict' using errcode='PT409';
  end if;
  if i.id is null then
    -- A browser reload may generate a fresh key. Avoid creating another payable
    -- order for the same purchase while the first checkout is still open.
    select * into i from public.subscription_invoices where store_id=p_store and target_plan_code=p_plan
      and target_billing_cycle=p_cycle and status='pending' order by created_at desc,id desc limit 1;
    if found and i.payment_channel<>p_method then raise exception 'billing_checkout_pending' using errcode='PT409'; end if;
  end if;
  if i.id is null then
    if not exists(select from public.platform_billing_settings where id=1 and paymob_enabled and
      case p_method when 'paymob_card' then paymob_card_enabled else paymob_wallet_enabled end)
    then raise exception 'billing_channel_unavailable' using errcode='PT409'; end if;
    amount := private.billing_checkout_price(s,p_plan,p_cycle);
    if p_expected_amount is not null and p_expected_amount<>amount then raise exception 'billing_price_changed' using errcode='PT409'; end if;
    if amount>21474836 then raise exception 'billing_invalid_amount' using errcode='PT400'; end if;
    insert into public.subscription_invoices(store_id,requested_by,target_plan_code,target_billing_cycle,amount_egp,
      payment_channel,idempotency_key,expires_at)
    values(p_store,p_user,p_plan,p_cycle,amount,p_method,p_idempotency_key,now()+interval '15 minutes') returning * into strict i;
    insert into public.subscription_payment_attempts(invoice_id,store_id,idempotency_key,payment_method,amount_cents)
      values(i.id,p_store,p_idempotency_key,p_method,amount*100) returning * into strict a;
    created := true;
  else
    if p_expected_amount is not null and p_expected_amount<>i.amount_egp then
      raise exception 'billing_price_changed' using errcode='PT409';
    end if;
    select * into strict a from public.subscription_payment_attempts where invoice_id=i.id;
  end if;
  return jsonb_build_object('invoice_id',i.id,'attempt_id',a.id,'amount_cents',a.amount_cents,'created',created,
    'status',a.status,'paymob_order_id',a.paymob_order_id,'checkout_url',a.checkout_url,'expires_at',i.expires_at);
end $$;

create or replace function public.bind_subscription_paymob(p_attempt_id uuid,p_paymob_order_id text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a public.subscription_payment_attempts;
begin
  if p_paymob_order_id is null or p_paymob_order_id !~ '^[0-9]{1,30}$' then raise exception 'billing_invalid_input'; end if;
  perform 1 from public.store_subscriptions s join public.subscription_payment_attempts t on t.store_id=s.store_id
    where t.id=p_attempt_id for no key update of s;
  update public.subscription_payment_attempts set paymob_order_id=p_paymob_order_id,status='initiated',updated_at=now()
    where id=p_attempt_id and status in ('reserved','initiated') and (paymob_order_id is null or paymob_order_id=p_paymob_order_id)
    returning * into a;
  if not found then raise exception 'billing_binding_failed'; end if;
  update public.subscription_invoices set paymob_order_id=p_paymob_order_id,updated_at=now() where id=a.invoice_id
    and status='pending' and expires_at>now() and (paymob_order_id is null or paymob_order_id=p_paymob_order_id);
  if not found then raise exception 'billing_binding_failed'; end if;
  return true;
end $$;

create or replace function public.billing_paymob_checkout_ready(p_attempt_id uuid,p_redirect_url text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_redirect_url is null or p_redirect_url not like 'https://%' or length(p_redirect_url)>16384 then
    raise exception 'billing_invalid_input';
  end if;
  perform 1 from public.store_subscriptions s join public.subscription_payment_attempts a on a.store_id=s.store_id
    where a.id=p_attempt_id for no key update of s;
  update public.subscription_payment_attempts a set checkout_url=p_redirect_url,updated_at=now()
    from public.subscription_invoices i where a.id=p_attempt_id and i.id=a.invoice_id and i.status='pending'
    and a.status='initiated' and i.expires_at>now() and (a.checkout_url is null or a.checkout_url=p_redirect_url);
  return found;
end $$;

create or replace function public.fail_subscription_paymob(p_attempt_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare invoice uuid;
begin
  perform 1 from public.store_subscriptions s join public.subscription_payment_attempts a on a.store_id=s.store_id
    where a.id=p_attempt_id for no key update of s;
  update public.subscription_payment_attempts set status='failed',checkout_url=null,updated_at=now()
    where id=p_attempt_id and status in ('reserved','initiated') returning invoice_id into invoice;
  if not found then return false; end if;
  update public.subscription_invoices set status='failed',updated_at=now() where id=invoice and status='pending';
  return true;
end $$;

create or replace function public.reconcile_subscription_paymob(p_paymob_order_id text,p_paymob_tx_id text,
  p_amount_cents integer,p_currency text,p_success boolean,p_pending boolean,p_refunded boolean,p_voided boolean,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid; a public.subscription_payment_attempts; i public.subscription_invoices; event text;
begin
  if p_paymob_order_id is null or p_paymob_order_id !~ '^[0-9]{1,30}$' or p_paymob_tx_id is null or p_paymob_tx_id !~ '^[0-9]{1,30}$'
    or p_success is null or p_pending is null or p_refunded is null or p_voided is null then
    raise exception 'billing_invalid_payment_event' using errcode='PT400';
  end if;
  select store_id into strict tenant from public.subscription_payment_attempts where paymob_order_id=p_paymob_order_id;
  perform 1 from public.store_subscriptions where store_id=tenant for no key update;
  select * into strict a from public.subscription_payment_attempts where paymob_order_id=p_paymob_order_id for update;
  select * into strict i from public.subscription_invoices where id=a.invoice_id for update;
  if i.store_id is distinct from a.store_id or i.paymob_order_id is distinct from p_paymob_order_id
    or p_amount_cents is distinct from a.amount_cents or p_amount_cents is distinct from i.amount_egp::bigint*100
    or p_currency is distinct from i.currency then raise exception 'billing_payment_mismatch' using errcode='PT400'; end if;
  event := case when p_refunded then 'refunded' when p_voided then 'voided' when p_pending then 'pending'
    when p_success then 'paid' else 'failed' end;
  if a.status=event or a.status in ('refunded','voided')
    or (a.status='paid' and event in ('pending','failed')) or (a.status='failed' and event='pending')
  then return jsonb_build_object('invoice_id',i.id,'status',a.status); end if;
  if event='paid' then perform private.billing_activate(i); end if;
  update public.subscription_payment_attempts set status=event,raw_payload=p_payload,
    paymob_transaction_id=p_paymob_tx_id,checkout_url=null,updated_at=now() where id=a.id;
  update public.subscription_invoices set status=case when event='voided' then 'cancelled' else event end,
    paymob_transaction_id=p_paymob_tx_id,paid_at=case when event='paid' then now() else paid_at end,
    updated_at=now() where id=i.id;
  return jsonb_build_object('invoice_id',i.id,'status',event);
end $$;

revoke all on function private.require_store_billing(uuid),private.billing_subscription_edit(),
  private.billing_lock_subscription(uuid),private.billing_target(text,text),private.billing_price(public.saas_plans,text),
  private.billing_checkout_price(public.store_subscriptions,text,text),private.billing_activate(public.subscription_invoices)
  from public,anon,authenticated;
revoke all on function public.get_store_billing(uuid),public.get_platform_billing_options(uuid),
  public.billing_admin_secret_status(),public.billing_admin_payment_settings(integer,jsonb,jsonb),
  public.billing_start_trial(uuid,text,text),public.billing_schedule_plan_change(uuid,text,text),
  public.billing_cancel_scheduled_change(uuid),public.billing_submit_manual_upgrade(uuid,text,text,text,text,text,text,text,text,integer),
  public.billing_cancel_manual_upgrade(uuid,uuid),public.billing_review_manual_upgrade(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.get_store_billing(uuid),public.get_platform_billing_options(uuid),
  public.billing_admin_secret_status(),public.billing_admin_payment_settings(integer,jsonb,jsonb),
  public.billing_start_trial(uuid,text,text),public.billing_schedule_plan_change(uuid,text,text),
  public.billing_cancel_scheduled_change(uuid),public.billing_submit_manual_upgrade(uuid,text,text,text,text,text,text,text,text,integer),
  public.billing_cancel_manual_upgrade(uuid,uuid),public.billing_review_manual_upgrade(uuid,text,text)
  to authenticated;
revoke all on function public.reserve_subscription_paymob(uuid,uuid,text,text,text,text,integer),public.bind_subscription_paymob(uuid,text),
  public.billing_paymob_checkout_ready(uuid,text),public.fail_subscription_paymob(uuid),
  public.reconcile_subscription_paymob(text,text,integer,text,boolean,boolean,boolean,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_subscription_paymob(uuid,uuid,text,text,text,text,integer),public.bind_subscription_paymob(uuid,text),
  public.billing_paymob_checkout_ready(uuid,text),public.fail_subscription_paymob(uuid),
  public.reconcile_subscription_paymob(text,text,integer,text,boolean,boolean,boolean,boolean,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
