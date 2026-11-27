begin;

alter table public.store_settings add column if not exists payment_reservation_minutes smallint
  not null default 45 check (payment_reservation_minutes between 30 and 60);
alter table public.orders
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists reserved_coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists checkout_base text,
  add column if not exists payment_review text;
alter table public.orders drop constraint if exists orders_payment_method_check,
  add constraint orders_payment_method_check check (payment_method in ('cod','paymob_card','paymob_wallet','wallet','coupon'));
alter table public.orders drop constraint if exists orders_payment_status_check,
  add constraint orders_payment_status_check check (payment_status in
    ('unpaid','pending','cod_pending','failed','paid','refund_pending','refunded','voided'));
grant select (reservation_expires_at, payment_review) on public.orders to authenticated;
create index if not exists orders_online_reservation_expiry on public.orders(reservation_expires_at, id)
  where reservation_expires_at is not null and status in ('pending','confirmed');

-- Historical rows retain their exact provider references. Only newly reserved attempts have a lease.
alter table public.payment_attempts alter column paymob_order_id drop not null,
  add column if not exists state text not null default 'legacy' check (state in
    ('legacy','reserved','ready','charging','prompt','failed','superseded','paid','refunded','voided')),
  add column if not exists expires_at timestamptz,
  add column if not exists checkout_base text,
  add column if not exists lease_id uuid,
  add column if not exists lease_until timestamptz,
  add column if not exists redirect_url text,
  add column if not exists settled_at timestamptz,
  add column if not exists reconciled_at timestamptz;
-- Old deployments sometimes updated only orders. Preserve that mapping before a retry can replace it.
do $$ begin
  if exists(select from public.orders o where nullif(trim(o.paymob_order_id),'') is not null
       group by o.paymob_order_id having count(*)>1) or
     exists(select from public.orders o join public.payment_attempts a using(paymob_order_id)
       where a.order_id<>o.id or a.store_id<>o.store_id) then raise exception 'conflicting historical Paymob mapping'; end if;
end $$;
insert into public.payment_attempts(store_id,order_id,paymob_order_id,payment_method,created_at)
  select o.store_id,o.id,o.paymob_order_id,case when o.payment_method='paymob_wallet' then o.payment_method else 'paymob_card' end,o.created_at
  from public.orders o where nullif(trim(o.paymob_order_id),'') is not null
  on conflict(paymob_order_id) do nothing;

create table if not exists public.paymob_transactions (
  store_id uuid not null references public.stores(id) on delete cascade,
  transaction_id text not null,
  attempt_id uuid not null references public.payment_attempts(id) on delete cascade,
  state text not null check (state in ('pending','failed','paid','refunded','voided')),
  updated_at timestamptz not null default now(),
  primary key (store_id,transaction_id)
);
alter table public.paymob_transactions enable row level security;
revoke all on public.paymob_transactions from public,anon,authenticated;
grant select,insert,update,delete on public.paymob_transactions to service_role;

create or replace function public.allowed_order_transitions(p_status text,p_method text,p_payment text,p_priced boolean)
returns text[] language sql immutable parallel safe set search_path='' as $$
  select case
    when p_status not in ('pending','confirmed','shipped') then '{}'::text[]
    when p_priced and (p_payment='paid' or (p_method='cod' and p_payment in ('unpaid','pending','cod_pending'))) then
      array[case p_status when 'pending' then 'confirmed' when 'confirmed' then 'shipped' else 'delivered' end,'cancelled']
    else array['cancelled'] end
$$;
revoke all on function public.allowed_order_transitions(text,text,text,boolean) from public,anon;
grant execute on function public.allowed_order_transitions(text,text,text,boolean) to authenticated,service_role;

create or replace function public.guard_order_status_transitions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status and not (new.status=any(public.allowed_order_transitions(
    old.status,new.payment_method,new.payment_status,new.subtotal is not null))) then
    raise exception 'invalid_fulfillment_transition';
  end if;
  if new.status='cancelled' and old.status<>'cancelled' then
    if old.payment_method in ('paymob_card','paymob_wallet') and old.payment_status='paid' then
      new.payment_status := 'refund_pending';
      new.payment_review := 'paid_cancellation';
    elsif old.reservation_expires_at is not null and old.payment_status in ('unpaid','pending','failed')
       and old.reserved_coupon_id is not null then
      update public.coupons set used_count=greatest(0,used_count-1)
        where id=old.reserved_coupon_id and store_id=old.store_id;
      new.reserved_coupon_id := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_order_status_transitions on public.orders;
create trigger trg_guard_order_status_transitions before update of status on public.orders
  for each row execute function public.guard_order_status_transitions();

-- Browser roles can still update fulfillment under RLS. Payment and reservation fields
-- are written by the definer checkout/COD routines or the service-role reconciler.
create or replace function public.protect_order_payment_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then raise insufficient_privilege; end if;
  return new;
end $$;
revoke all on function public.protect_order_payment_write() from public,anon,authenticated;
drop trigger if exists protect_order_payment_write on public.orders;
create trigger protect_order_payment_write before update of payment_method,payment_status,paymob_order_id,payment_transaction_id,
  payment_review,reservation_expires_at,reserved_coupon_id,checkout_key,checkout_base,stock_restored,
  coupon_code,discount_amount,wallet_discount on public.orders
  for each row execute function public.protect_order_payment_write();

-- Bind the coupon actually reserved by checkout and reject conversions after expiry.
create or replace function public.bind_order_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.payment_method in ('paymob_card','paymob_wallet') and new.payment_status in ('unpaid','pending','failed') then
      select now()+make_interval(mins=>s.payment_reservation_minutes) into new.reservation_expires_at
        from public.store_settings s where s.store_id=new.store_id;
    end if;
    return new;
  end if;
  -- A gateway registration or outstanding lease already quotes this monetary snapshot.
  if (old.subtotal,old.shipping_fee,old.wallet_discount,old.currency) is distinct from
     (new.subtotal,new.shipping_fee,new.wallet_discount,new.currency) and
     (old.paymob_order_id is not null or exists(select from public.payment_attempts a where a.order_id=old.id)) then
    raise exception 'payment_amount_locked';
  end if;
  if old.payment_method in ('paymob_card','paymob_wallet') and new.payment_method='cod'
     and (old.reservation_expires_at<=now() or old.payment_status not in ('unpaid','pending','failed')
       or old.status not in ('pending','confirmed')) then raise exception 'order_ineligible'; end if;
  if new.coupon_code is not null and new.coupon_code is distinct from old.coupon_code and new.reservation_expires_at is not null then
    select c.id into new.reserved_coupon_id from public.coupons c
      where c.store_id=new.store_id and upper(trim(c.code))=upper(trim(new.coupon_code));
  end if;
  if new.payment_method not in ('paymob_card','paymob_wallet') then new.reservation_expires_at := null; end if;
  return new;
end $$;
revoke all on function public.bind_order_reservation() from public,anon,authenticated;
drop trigger if exists bind_order_reservation on public.orders;
create trigger bind_order_reservation before insert or update of payment_method,subtotal,coupon_code,shipping_fee,wallet_discount,currency on public.orders
  for each row execute function public.bind_order_reservation();

-- Preserve installed cart limits, SKU locks, delivery prices and mobile signatures.
do $migration$
declare
  signature regprocedure := 'public.store_checkout(uuid,text,text,text,jsonb,text,text,boolean,uuid)'::regprocedure;
  body text := pg_get_functiondef(signature);
  changed text;
begin
  if body not like '%coupon_does_not_cover_order%' then
    changed := regexp_replace(body,'(v_payment\s+not\s+in\s*\([^)]*''wallet'')\s*\)', E'\\1, ''coupon'')','i');
    if changed=body then raise exception 'unrecognized checkout payment validation'; end if;
    body := changed;
    changed := regexp_replace(body,'if\s+v_remaining_total\s*=\s*0\s+and\s+v_wallet_discount\s*>\s*0\s+then',
      $funding$if v_remaining_total=0 and v_wallet_discount=0 and applied_coupon is not null and discount_val>0 then
        v_payment := 'coupon';
        v_pay_status := 'paid';
        v_order_status := 'confirmed';
      elsif v_payment='coupon' then
        raise exception 'coupon_does_not_cover_order' using detail=v_remaining_total::text;
      end if;
      if v_remaining_total = 0 and v_wallet_discount > 0 then$funding$,'i');
    if changed=body then raise exception 'unrecognized checkout settlement calculation'; end if;
    execute changed;
  end if;
end $migration$;

-- Include older unpaid online states in the existing tenant/phone/permission-checked COD RPC.
do $migration$
declare body text := pg_get_functiondef('public.switch_order_to_cod(uuid,uuid,text)'::regprocedure);
begin
  if body ~ 'v_order\.payment_status\s+not in\s*\(''pending'',\s*''failed''\)' then
    execute regexp_replace(body,'v_order\.payment_status\s+not in\s*\(''pending'',\s*''failed''\)',
      'v_order.payment_status not in (''pending'',''failed'',''unpaid'')');
  end if;
end $migration$;

create or replace function public.release_expired_unpaid_orders(p_store uuid default null, p_limit integer default 100,p_order uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; released integer := 0;
begin
  for candidate in select o.id from public.orders o
    where o.reservation_expires_at<=now() and (p_store is null or o.store_id=p_store) and (p_order is null or o.id=p_order)
      and o.status in ('pending','confirmed') and o.payment_method in ('paymob_card','paymob_wallet')
      and o.payment_status in ('unpaid','pending','failed')
    order by o.reservation_expires_at,o.id limit greatest(1,least(coalesce(p_limit,100),500)) for update skip locked
  loop
    -- All reconciliation writers also lock the order first. The existing AFTER triggers
    -- restore the exact SKU and issue the unique wallet order_refund in this transaction.
    if not exists(select from public.payment_attempts a where a.order_id=candidate.id and a.settled_at is not null) then
      update public.orders set status='cancelled' where id=candidate.id;
      released := released+1;
    end if;
  end loop;
  return released;
end $$;
revoke all on function public.release_expired_unpaid_orders(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.release_expired_unpaid_orders(uuid,integer,uuid) to service_role;

create or replace function public.quote_checkout_coupon(p_store uuid,p_code text,p_lines jsonb)
returns table(valid boolean,reason text,code text,discount_amount numeric,min_order_amount numeric,subtotal numeric)
language plpgsql stable security definer set search_path='' as $$
declare gross numeric; found_lines integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'invalid_cart'; end if;
  select count(*),sum(x.quantity * public.get_effective_product_price(p.price,p.flash_sale_price,
      p.flash_sale_starts_at,p.flash_sale_ends_at,now())) into found_lines,gross
    from jsonb_to_recordset(p_lines) as x(id uuid,quantity integer) join public.products p on p.id=x.id
    where p.store_id=p_store and p.is_active and x.quantity between 1 and 999999;
  if found_lines<>jsonb_array_length(p_lines) then raise exception 'invalid_cart'; end if;
  return query select q.valid,q.reason,q.code,q.discount_amount,q.min_order_amount,gross
    from public.validate_coupon(p_code,gross,p_store) q;
end $$;
revoke all on function public.quote_checkout_coupon(uuid,text,jsonb) from public;
grant execute on function public.quote_checkout_coupon(uuid,text,jsonb) to anon,authenticated;

-- The amount the buyer reviewed is checked against the installed checkout transaction.
-- A quote race rolls back every deduction, including inventory, coupon use and store credit.
create or replace function public.checkout_reviewed(p_store_id uuid,request_key uuid,address text,customer_phone text,
  payment text,lines jsonb,p_delivery jsonb,p_expected_total numeric,p_coupon_code text default null,
  p_customer_name text default null,p_use_wallet boolean default false,p_checkout_base text default null)
returns table(order_number uuid,amount numeric,order_currency text,method text,pay_status text,fulfillment text,
  expires_at timestamptz,created boolean,guest boolean) language plpgsql security definer set search_path='' as $$
declare receipt record; existed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(request_key::text,0));
  existed := exists(select from public.orders o where o.checkout_key=request_key);
  select * into strict receipt from public.checkout_delivery(p_store_id,request_key,address,customer_phone,payment,
    lines,p_delivery,p_coupon_code,p_customer_name,p_use_wallet);
  if not existed and receipt.amount is distinct from p_expected_total then
    raise exception 'checkout_quote_changed' using detail=receipt.amount::text;
  end if;
  if not existed then update public.orders set checkout_base=left(p_checkout_base,512) where store_id=p_store_id and id=receipt.order_number; end if;
  return query select o.id,o.total,o.currency,o.payment_method,o.payment_status,o.status,o.reservation_expires_at,not existed,o.user_id is null and o.guest_tracking
    from public.orders o where o.store_id=p_store_id and o.id=receipt.order_number;
end $$;
revoke all on function public.checkout_reviewed(uuid,uuid,text,text,text,jsonb,jsonb,numeric,text,text,boolean,text) from public;
grant execute on function public.checkout_reviewed(uuid,uuid,text,text,text,jsonb,jsonb,numeric,text,text,boolean,text) to anon,authenticated;

-- The order is the first lock in every initiation, conversion, expiry and reconciliation path.
create or replace function public.reserve_paymob_attempt(p_store uuid,p_order uuid,p_method text,p_checkout_base text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; a public.payment_attempts%rowtype; lease uuid := gen_random_uuid();
begin
  select * into strict o from public.orders where store_id=p_store and id=p_order for update;
  if p_method not in ('paymob_card','paymob_wallet') or o.payment_method not in ('paymob_card','paymob_wallet')
    or o.status not in ('pending','confirmed') or o.payment_status not in ('unpaid','pending','failed')
    or o.reservation_expires_at<=now() or coalesce(o.total,0)<=0 then raise exception 'order_ineligible'; end if;
  -- Legacy orders acquire their first bounded window only when the buyer explicitly resumes payment.
  if o.reservation_expires_at is null then
    update public.orders set reservation_expires_at=now()+make_interval(mins=>(
      select s.payment_reservation_minutes from public.store_settings s where s.store_id=p_store))
      where id=p_order returning reservation_expires_at into o.reservation_expires_at;
  end if;
  -- A recent historical card registration can issue a new key against the same
  -- provider order. A historical wallet may already have sent its phone prompt.
  if o.payment_status in ('pending','unpaid') and o.paymob_order_id is not null and not exists(
    select from public.payment_attempts where order_id=p_order and state in ('reserved','ready','charging','prompt')
  ) then
    update public.payment_attempts set state=case when p_method='paymob_wallet' then 'prompt' else 'reserved' end,
      expires_at=least(created_at+interval '15 minutes',o.reservation_expires_at),
      checkout_base=coalesce(checkout_base,o.checkout_base,p_checkout_base)
      where order_id=p_order and store_id=p_store and paymob_order_id=o.paymob_order_id and state='legacy'
        and payment_method=p_method and created_at+interval '15 minutes'>now();
  end if;
  select * into a from public.payment_attempts where store_id=p_store and order_id=p_order
    and state in ('reserved','ready','charging','prompt') order by created_at desc,id desc limit 1 for update;
  if found then
    if a.state in ('charging','prompt') and a.payment_method=p_method then
      return jsonb_build_object('action','pending');
    end if;
    if a.expires_at>now() and a.payment_method=p_method and a.state='ready' then
      return jsonb_build_object('action','redirect','redirect_url',a.redirect_url);
    end if;
    if a.lease_until>now() then return jsonb_build_object('action','busy'); end if;
    if a.expires_at<=now() or a.payment_method<>p_method then
      update public.payment_attempts set state='superseded',redirect_url=null where id=a.id;
      a.id := null;
    end if;
  end if;
  if a.id is null then
    insert into public.payment_attempts(store_id,order_id,payment_method,state,expires_at,checkout_base)
      values(p_store,p_order,p_method,'reserved',least(now()+interval '15 minutes',o.reservation_expires_at),coalesce(o.checkout_base,p_checkout_base))
      returning * into strict a;
  end if;
  update public.payment_attempts set lease_id=lease,lease_until=now()+interval '50 seconds' where id=a.id;
  return jsonb_build_object('action','start','attempt',a.id,'lease',lease,'provider',a.paymob_order_id,
    'expires_at',a.expires_at,'amount_cents',round(o.total*100),'currency',upper(o.currency));
end $$;

create or replace function public.bind_paymob_attempt(p_store uuid,p_order uuid,p_attempt uuid,p_lease uuid,p_provider text)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts%rowtype; affected integer;
begin
  perform 1 from public.orders where id=p_order and store_id=p_store for update;
  if not found or p_provider is null or p_provider !~ '^[0-9]{1,30}$' then raise exception 'invalid_binding'; end if;
  update public.payment_attempts set paymob_order_id=p_provider where id=p_attempt and store_id=p_store and order_id=p_order
    and lease_id=p_lease and state='reserved' and expires_at>now()
    and (paymob_order_id is null or paymob_order_id=p_provider) returning * into a;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'attempt_binding_failed'; end if;
  update public.orders set paymob_order_id=p_provider,payment_method=a.payment_method,payment_status='pending'
    where id=p_order and store_id=p_store and status in ('pending','confirmed') and payment_status in ('unpaid','pending','failed')
      and payment_method in ('paymob_card','paymob_wallet') and (reservation_expires_at is null or reservation_expires_at>now());
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'order_binding_failed'; end if;
  return true;
end $$;

create or replace function public.advance_paymob_attempt(p_store uuid,p_order uuid,p_attempt uuid,p_lease uuid,
  p_step text,p_url text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; a public.payment_attempts%rowtype;
begin
  select * into strict o from public.orders where store_id=p_store and id=p_order for update;
  select * into strict a from public.payment_attempts where id=p_attempt and store_id=p_store and order_id=p_order for update;
  if a.lease_id is distinct from p_lease or p_lease is null then return false; end if;
  if p_step='release' and a.state='reserved' then
    update public.payment_attempts set lease_id=null,lease_until=null where id=a.id;
    return true;
  end if;
  if o.paymob_order_id is distinct from a.paymob_order_id or a.paymob_order_id is null
    or o.payment_method<>a.payment_method or o.status not in ('pending','confirmed')
    or o.payment_status not in ('unpaid','pending','failed') or o.reservation_expires_at<=now() then return false; end if;
  if p_step='charging' and a.state='reserved' and a.expires_at>now() and a.payment_method='paymob_wallet' then
    update public.payment_attempts set state='charging' where id=a.id;
  elsif p_step='ready' and a.state in ('reserved','charging') and p_url like 'https://%' then
    update public.payment_attempts set state='ready',redirect_url=p_url,lease_id=null,lease_until=null where id=a.id;
  elsif p_step in ('prompt','failed') and a.state='charging' then
    update public.payment_attempts set state=p_step,lease_id=null,lease_until=null where id=a.id;
    if p_step='failed' then update public.orders set payment_status='failed' where id=o.id; end if;
  else return false;
  end if;
  return true;
end $$;

create or replace function public.reconcile_paymob_transaction(p_store uuid,p_order uuid,p_provider text,p_tx text,
  p_cents bigint,p_currency text,p_event text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  o public.orders%rowtype; a public.payment_attempts%rowtype; tx public.paymob_transactions%rowtype;
  next_payment text; review text; changed boolean := false; notice text; primary_capture boolean; new_transaction boolean;
begin
  select * into strict o from public.orders where store_id=p_store and id=p_order for update;
  if p_event is null or p_event not in ('pending','failed','paid','refunded','voided') or p_tx is null
    or p_tx !~ '^[0-9]{1,30}$' or p_provider is null or p_provider !~ '^[0-9]{1,30}$'
    or o.total is null or p_cents is distinct from round(o.total*100)::bigint
    or p_currency is distinct from upper(o.currency) then raise exception 'invalid_payment_event'; end if;
  select * into a from public.payment_attempts where paymob_order_id=p_provider for update;
  if not found and o.paymob_order_id=p_provider then
    insert into public.payment_attempts(store_id,order_id,paymob_order_id,payment_method)
      values(p_store,p_order,p_provider,case when o.payment_method='paymob_wallet' then o.payment_method else 'paymob_card' end)
      returning * into strict a;
  end if;
  if a.order_id is distinct from p_order or a.store_id is distinct from p_store then raise exception 'invalid_mapping'; end if;
  if exists(select from public.orders where store_id=p_store and payment_transaction_id=p_tx and id<>p_order) then
    raise exception 'transaction_conflict';
  end if;
  -- Lock/claim even an intermediate transaction ID. A replay cannot move it to another attempt.
  insert into public.paymob_transactions(store_id,transaction_id,attempt_id,state) values(p_store,p_tx,a.id,'pending')
    on conflict (store_id,transaction_id) do nothing;
  new_transaction := found;
  select * into strict tx from public.paymob_transactions where store_id=p_store and transaction_id=p_tx for update;
  if tx.attempt_id<>a.id then raise exception 'transaction_conflict'; end if;
  next_payment := o.payment_status;
  review := o.payment_review;
  primary_capture := o.payment_transaction_id=p_tx or (o.payment_transaction_id is null and o.paymob_order_id=p_provider
    and o.payment_status in ('paid','refund_pending','refunded','voided'));
  if tx.state not in ('refunded','voided') and tx.state<>p_event
    and not (tx.state in ('failed','paid') and p_event='pending')
    and not (tx.state='paid' and p_event='failed') then
    update public.paymob_transactions set state=p_event,updated_at=now() where store_id=p_store and transaction_id=p_tx;
    if p_event in ('refunded','voided') then
      -- Some returns have their own transaction ID. Link a new reversal to the
      -- winning provider order only when its captured transaction is unambiguous.
      if new_transaction and o.paymob_order_id=p_provider and o.payment_status in ('paid','refund_pending')
         and o.payment_transaction_id is not null and not coalesce(primary_capture,false)
         and not exists(select from public.paymob_transactions where attempt_id=a.id and state='paid'
           and transaction_id<>o.payment_transaction_id) then
        update public.paymob_transactions set state=p_event,updated_at=now()
          where attempt_id=a.id and transaction_id=o.payment_transaction_id and state='paid';
        primary_capture := true;
      end if;
      -- Preserve a different successful charge on this attempt if its sibling was reversed.
      if not exists(select from public.paymob_transactions where attempt_id=a.id and state='paid') then
        update public.payment_attempts set state=p_event,redirect_url=null,reconciled_at=now(),
          settled_at=coalesce(settled_at,now()) where id=a.id;
      end if;
      if primary_capture or (o.payment_status not in ('paid','refund_pending','refunded','voided')
        and o.paymob_order_id=p_provider and o.payment_method<>'cod') then
        next_payment := p_event;
        if review in ('paid_cancellation','capture_after_cancellation') then review := null; end if;
        update public.orders set payment_transaction_id=case when primary_capture then coalesce(o.payment_transaction_id,p_tx) else p_tx end where id=o.id;
      end if;
    elsif p_event='paid' then
      update public.payment_attempts set state='paid',settled_at=coalesce(settled_at,now()),reconciled_at=now(),
        redirect_url=null,lease_id=null,lease_until=null where id=a.id;
      if o.payment_status in ('paid','refund_pending','refunded','voided') and not coalesce(primary_capture,false)
        and o.payment_method<>'cod' then
        review := 'additional_capture';
      elsif o.payment_status in ('refunded','voided') and primary_capture then
        -- A historical reversal may predate the transaction journal.
        update public.payment_attempts set state=o.payment_status where id=a.id;
        update public.paymob_transactions set state=o.payment_status where store_id=p_store and transaction_id=p_tx;
      else
        if o.payment_method='cod' then review := 'late_capture_after_cod'; end if;
        if o.status='cancelled' then review := 'capture_after_cancellation'; end if;
        next_payment := case when o.status='cancelled' then 'refund_pending' else 'paid' end;
        update public.orders set payment_method=a.payment_method,payment_transaction_id=p_tx,paymob_order_id=p_provider where id=o.id;
        if o.payment_status not in ('paid','refund_pending') then notice := 'paid'; end if;
      end if;
    elsif p_event='failed' and a.state not in ('paid','voided','refunded') then
      update public.payment_attempts set state='failed',redirect_url=null,reconciled_at=now(),lease_id=null,lease_until=null where id=a.id;
      if o.paymob_order_id=p_provider and o.payment_method<>'cod' and o.status<>'cancelled'
        and o.payment_status in ('pending','unpaid','failed') then
        next_payment := 'failed';
        if o.payment_status<>'failed' then notice := 'failed'; end if;
      end if;
    end if;
    changed := next_payment is distinct from o.payment_status or review is distinct from o.payment_review;
    if changed then update public.orders set payment_status=next_payment,payment_review=review where id=o.id; end if;
  end if;
  return jsonb_build_object('transitioned',changed,'notification',notice,'payment_status',next_payment,
    'checkout_base',a.checkout_base);
end $$;

revoke all on function public.reserve_paymob_attempt(uuid,uuid,text,text),
  public.bind_paymob_attempt(uuid,uuid,uuid,uuid,text),
  public.advance_paymob_attempt(uuid,uuid,uuid,uuid,text,text),
  public.reconcile_paymob_transaction(uuid,uuid,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.reserve_paymob_attempt(uuid,uuid,text,text),
  public.bind_paymob_attempt(uuid,uuid,uuid,uuid,text),
  public.advance_paymob_attempt(uuid,uuid,uuid,uuid,text,text),
  public.reconcile_paymob_transaction(uuid,uuid,text,text,bigint,text,text) to service_role;

-- Proven historical coupon checkouts and inventory-backed online reservations. Give
-- legacy reservations a full review window from rollout. Reapplication never extends it.
update public.orders o set payment_method='coupon',payment_status='paid',status='confirmed'
  where o.checkout_key is not null and o.status='pending' and o.payment_status in ('unpaid','pending','failed')
    and o.total=0 and o.subtotal=0 and o.shipping_fee=0 and o.wallet_discount=0
    and o.discount_amount>0 and o.coupon_code is not null and not o.stock_restored
    and not exists(select from public.payment_attempts a where a.order_id=o.id and a.settled_at is not null);
update public.orders o set reservation_expires_at=now()+make_interval(mins=>s.payment_reservation_minutes),
  reserved_coupon_id=(select c.id from public.coupons c where c.store_id=o.store_id
    and upper(trim(c.code))=upper(trim(o.coupon_code)) and c.created_at<=o.created_at)
  from public.store_settings s where s.store_id=o.store_id and o.reservation_expires_at is null
    and o.checkout_key is not null and not o.stock_restored and o.total>0
    and o.payment_method in ('paymob_card','paymob_wallet') and o.status in ('pending','confirmed')
    and o.payment_status in ('unpaid','pending','failed')
    and exists(select from public.order_items i where i.order_id=o.id)
    and not exists(select from public.payment_attempts a where a.order_id=o.id and a.settled_at is not null);

-- Also swept before web checkout. Where pg_cron is installed, release quiet stores without traffic.
do $$ begin
  if exists(select from pg_extension where extname='pg_cron') then
    perform cron.schedule('wlc-release-unpaid-orders','*/5 * * * *','select public.release_expired_unpaid_orders()');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
