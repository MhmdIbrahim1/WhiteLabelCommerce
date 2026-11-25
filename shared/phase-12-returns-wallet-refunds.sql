-- Phase 12: Self-Service Returns & Exchanges with Automated Store Wallet Refunds & Inventory Restock
-- Adds public.return_requests with strict multi-tenant RLS, widens public.wallet_transactions types
-- to support return refund credits seamlessly with Phase 10A Store Wallet, and implements atomic
-- SECURITY DEFINER RPCs: submit_return_request & admin_process_return_request.
-- Apply after phase-11b-mobile-app-factory.sql. Idempotent and safe to re-run.
begin;

-- ============================================================================
-- 1. WIDEN WALLET TRANSACTION TYPES FOR AUTOMATED RETURN CREDITS
-- ============================================================================
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions
  add constraint wallet_transactions_type_check
  check (
    type in (
      'cashback_earned',
      'order_redemption',
      'order_refund',
      'return_refund',
      'credit',
      'admin_credit',
      'admin_debit'
    )
  );

-- ============================================================================
-- 2. RETURN REQUESTS TABLE, INDEXES & STRICT MULTI-TENANT RLS
-- ============================================================================
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null default 'return',
  status text not null default 'pending',
  refund_method text not null default 'wallet',
  reason text not null,
  customer_notes text null,
  admin_notes text null,
  refund_amount numeric(12,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  restocked boolean not null default false,
  wallet_credited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.return_requests drop constraint if exists return_requests_type_check;
alter table public.return_requests add constraint return_requests_type_check
  check (request_type in ('return', 'exchange'));

alter table public.return_requests drop constraint if exists return_requests_status_check;
alter table public.return_requests add constraint return_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'received', 'refunded'));

alter table public.return_requests drop constraint if exists return_requests_refund_method_check;
alter table public.return_requests add constraint return_requests_refund_method_check
  check (refund_method in ('wallet', 'original_payment'));

alter table public.return_requests drop constraint if exists return_requests_refund_amount_check;
alter table public.return_requests add constraint return_requests_refund_amount_check
  check (refund_amount >= 0);

alter table public.return_requests drop constraint if exists return_requests_items_array_check;
alter table public.return_requests add constraint return_requests_items_array_check
  check (jsonb_typeof(items) = 'array');

create index if not exists idx_return_requests_store_created
  on public.return_requests (store_id, created_at desc);

create index if not exists idx_return_requests_order
  on public.return_requests (order_id);

create index if not exists idx_return_requests_store_status
  on public.return_requests (store_id, status, created_at desc);

-- Prevent duplicate active return requests for the same order even under concurrency
create unique index if not exists uidx_return_requests_active_order
  on public.return_requests (order_id)
  where status in ('pending', 'approved', 'received', 'refunded');

alter table public.return_requests enable row level security;

revoke all on public.return_requests from public, anon, authenticated;
grant select, update on public.return_requests to authenticated;
grant select, insert, update, delete on public.return_requests to service_role;

drop policy if exists customer_read_own_return_requests on public.return_requests;
create policy customer_read_own_return_requests
  on public.return_requests
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists admin_read_store_return_requests on public.return_requests;
create policy admin_read_store_return_requests
  on public.return_requests
  for select
  to authenticated
  using (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  );

drop policy if exists admin_update_store_return_requests on public.return_requests;
create policy admin_update_store_return_requests
  on public.return_requests
  for update
  to authenticated
  using (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  )
  with check (
    (select public.is_store_admin(store_id))
    or (select public.is_platform_super_admin())
  );

-- ============================================================================
-- 3. ATOMIC CUSTOMER RPC: public.submit_return_request
-- ============================================================================
create or replace function public.submit_return_request(
  p_store_id uuid,
  p_order_id uuid,
  p_request_type text,
  p_refund_method text,
  p_reason text,
  p_customer_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.return_requests
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_req_type text := lower(trim(coalesce(p_request_type, 'return')));
  v_refund_method text := lower(trim(coalesce(p_refund_method, 'wallet')));
  v_reason text := left(trim(coalesce(p_reason, '')), 300);
  v_notes text := nullif(left(trim(coalesce(p_customer_notes, '')), 1000), '');
  v_item_rec record;
  v_oi public.order_items%rowtype;
  v_normalized_items jsonb := '[]'::jsonb;
  v_gross_selected numeric(12,2) := 0;
  v_gross_order_items numeric(12,2) := 0;
  v_refund_amount numeric(12,2) := 0;
  v_line_total numeric(12,2) := 0;
  v_matched_count integer := 0;
  v_created public.return_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;

  if p_store_id is null or p_order_id is null then
    raise exception 'invalid_return_request';
  end if;

  if v_req_type not in ('return', 'exchange') then
    raise exception 'invalid_request_type';
  end if;

  if v_refund_method not in ('wallet', 'original_payment') then
    raise exception 'invalid_refund_method';
  end if;

  if length(v_reason) < 2 then
    raise exception 'reason_required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required';
  end if;

  -- Lock order row to serialize concurrent return submissions
  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
    and o.store_id = p_store_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.user_id is distinct from v_uid then
    raise exception 'not_authorized';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'order_not_delivered';
  end if;

  if exists (
    select 1
    from public.return_requests rr
    where rr.order_id = p_order_id
      and rr.status in ('pending', 'approved', 'received', 'refunded')
  ) then
    raise exception 'return_already_exists';
  end if;

  select coalesce(round(sum(oi.unit_price * oi.quantity), 2), 0)
  into v_gross_order_items
  from public.order_items oi
  where oi.order_id = p_order_id;

  -- Aggregate requested quantities per matched order_item to prevent duplicate-line inflation
  for v_item_rec in
    with raw_entries as (
      select
        nullif(trim(coalesce(e->>'order_item_id', '')), '')::uuid as req_order_item_id,
        nullif(trim(coalesce(e->>'product_id', '')), '')::uuid as req_product_id,
        nullif(trim(coalesce(e->>'variant_id', '')), '')::uuid as req_variant_id,
        nullif(trim(coalesce(e->>'size', '')), '') as req_size,
        nullif(trim(coalesce(e->>'color', '')), '') as req_color,
        case
          when (e->>'quantity') ~ '^[1-9][0-9]{0,4}$' then (e->>'quantity')::integer
          else 0
        end as req_qty
      from jsonb_array_elements(p_items) as e
    ),
    matched as (
      select
        oi.id as matched_oi_id,
        re.req_variant_id,
        sum(re.req_qty)::integer as total_qty
      from raw_entries re
      join public.order_items oi
        on oi.order_id = p_order_id
       and (
         (re.req_order_item_id is not null and oi.id = re.req_order_item_id)
         or (
           re.req_order_item_id is null
           and re.req_product_id is not null
           and oi.product_id = re.req_product_id
           and coalesce(oi.size, '') = coalesce(re.req_size, oi.size, '')
           and coalesce(oi.color, '') = coalesce(re.req_color, oi.color, '')
         )
       )
      where re.req_qty > 0
      group by oi.id, re.req_variant_id
      order by oi.id
    )
    select * from matched
  loop
    select *
    into v_oi
    from public.order_items oi
    where oi.id = v_item_rec.matched_oi_id
      and oi.order_id = p_order_id;

    if not found or v_item_rec.total_qty <= 0 or v_item_rec.total_qty > v_oi.quantity then
      raise exception 'invalid_return_quantity';
    end if;

    v_line_total := round(v_oi.unit_price * v_item_rec.total_qty, 2);
    v_gross_selected := round(v_gross_selected + v_line_total, 2);
    v_matched_count := v_matched_count + 1;

    v_normalized_items := v_normalized_items || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'order_item_id', v_oi.id,
          'product_id', v_oi.product_id,
          'variant_id', v_item_rec.req_variant_id,
          'product_name', v_oi.product_name,
          'quantity', v_item_rec.total_qty,
          'max_quantity', v_oi.quantity,
          'unit_price', v_oi.unit_price,
          'line_total', v_line_total,
          'size', v_oi.size,
          'color', v_oi.color
        )
      )
    );
  end loop;

  if v_matched_count = 0 then
    raise exception 'invalid_return_items';
  end if;

  -- Compute server-side refund amount (proportionally respects order coupon discounts if applied)
  if v_gross_order_items > 0
     and v_order.subtotal is not null
     and v_order.subtotal < v_gross_order_items then
    v_refund_amount := round(v_gross_selected * (v_order.subtotal / v_gross_order_items), 2);
  else
    v_refund_amount := v_gross_selected;
  end if;

  if v_order.subtotal is not null then
    v_refund_amount := least(v_refund_amount, greatest(0::numeric, v_order.subtotal));
  end if;

  insert into public.return_requests (
    store_id,
    order_id,
    user_id,
    request_type,
    status,
    refund_method,
    reason,
    customer_notes,
    refund_amount,
    items,
    restocked,
    wallet_credited
  )
  values (
    p_store_id,
    p_order_id,
    v_uid,
    v_req_type,
    'pending',
    v_refund_method,
    v_reason,
    v_notes,
    v_refund_amount,
    v_normalized_items,
    false,
    false
  )
  returning * into v_created;

  return v_created;
end $$;

revoke all on function public.submit_return_request(uuid, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.submit_return_request(uuid, uuid, text, text, text, text, jsonb) to authenticated, service_role;

-- ============================================================================
-- 4. ATOMIC MERCHANT ADMIN RPC: public.admin_process_return_request
-- ============================================================================
create or replace function public.admin_process_return_request(
  p_return_id uuid,
  p_action text,
  p_admin_notes text default null,
  p_restock boolean default true
)
returns public.return_requests
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_req public.return_requests%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_notes text := case
    when p_admin_notes is null then null
    else nullif(left(trim(p_admin_notes), 1000), '')
  end;
  v_should_restock boolean := coalesce(p_restock, true);
  v_restocked boolean;
  v_wallet_credited boolean;
  v_next_status text;
  v_item jsonb;
  v_prod_id uuid;
  v_variant_id uuid;
  v_qty integer;
  v_current_balance numeric(12,2) := 0;
  v_next_balance numeric(12,2) := 0;
  v_settings public.store_settings%rowtype;
  v_currency_ar text := 'ج.م';
  v_currency_en text := 'EGP';
  v_short_order text;
  v_short_return text;
  v_has_variants_table boolean := false;
begin
  if p_return_id is null then
    raise exception 'return_request_not_found';
  end if;

  if v_action not in ('approve', 'reject', 'mark_received', 'complete_refund') then
    raise exception 'invalid_return_action';
  end if;

  select *
  into v_req
  from public.return_requests rr
  where rr.id = p_return_id
  for update;

  if not found then
    raise exception 'return_request_not_found';
  end if;

  if current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.role(), '') <> 'service_role'
     and not (public.is_store_admin(v_req.store_id) or public.is_platform_super_admin()) then
    raise exception 'not_authorized';
  end if;

  v_restocked := v_req.restocked;
  v_wallet_credited := v_req.wallet_credited;
  v_short_order := left(v_req.order_id::text, 8);
  v_short_return := left(v_req.id::text, 8);

  if v_action = 'approve' then
    if v_req.status not in ('pending', 'approved') then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'approved';

  elsif v_action = 'reject' then
    if v_req.status not in ('pending', 'approved', 'rejected') then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'rejected';

  elsif v_action = 'mark_received' then
    if v_req.status not in ('pending', 'approved', 'received') then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'received';

  elsif v_action = 'complete_refund' then
    if v_req.status = 'rejected' then
      raise exception 'invalid_status_transition';
    end if;
    v_next_status := 'refunded';
  end if;

  -- Atomic Inventory Restock (idempotent via v_restocked guard)
  if v_action in ('mark_received', 'complete_refund')
     and v_should_restock
     and not v_restocked then
    v_has_variants_table := (to_regclass('public.product_variants') is not null);

    for v_item in
      select elem
      from jsonb_array_elements(coalesce(v_req.items, '[]'::jsonb)) as elem
    loop
      v_qty := case
        when (v_item->>'quantity') ~ '^[1-9][0-9]{0,4}$' then (v_item->>'quantity')::integer
        else 0
      end;
      if v_qty <= 0 then
        continue;
      end if;

      v_prod_id := nullif(trim(coalesce(v_item->>'product_id', '')), '')::uuid;
      if v_prod_id is null and nullif(trim(coalesce(v_item->>'order_item_id', '')), '') is not null then
        select oi.product_id
        into v_prod_id
        from public.order_items oi
        where oi.id = (v_item->>'order_item_id')::uuid
          and oi.order_id = v_req.order_id;
      end if;

      if v_prod_id is not null then
        update public.products p
        set stock = p.stock + v_qty
        where p.id = v_prod_id
          and p.store_id = v_req.store_id;
      end if;

      v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;
      if v_has_variants_table and v_variant_id is not null then
        execute 'update public.product_variants set stock_qty = stock_qty + $1 where id = $2'
        using v_qty, v_variant_id;
      end if;
    end loop;

    v_restocked := true;
  end if;

  -- Atomic Store Wallet Credit Refund (idempotent via v_wallet_credited + advisory lock)
  if v_action = 'complete_refund'
     and v_req.refund_method = 'wallet'
     and not v_wallet_credited
     and coalesce(v_req.refund_amount, 0) > 0 then
    perform pg_advisory_xact_lock(
      hashtextextended('wallet:' || v_req.store_id::text || ':' || v_req.user_id::text, 0)
    );

    select greatest(0::numeric, coalesce(round(sum(wt.amount), 2), 0::numeric))
    into v_current_balance
    from public.wallet_transactions wt
    where wt.store_id = v_req.store_id
      and wt.user_id = v_req.user_id;

    v_next_balance := round(v_current_balance + v_req.refund_amount, 2);

    insert into public.wallet_transactions (
      store_id,
      user_id,
      order_id,
      type,
      amount,
      balance_after,
      note_ar,
      note_en,
      created_by
    )
    values (
      v_req.store_id,
      v_req.user_id,
      v_req.order_id,
      'credit',
      v_req.refund_amount,
      v_next_balance,
      'استرداد طلب ' || (case when v_req.request_type = 'exchange' then 'الاستبدال' else 'الإرجاع' end)
        || ' #' || v_short_return || ' للطلب #' || v_short_order,
      (case when v_req.request_type = 'exchange' then 'Exchange' else 'Return' end)
        || ' refund #' || v_short_return || ' credited for order #' || v_short_order,
      auth.uid()
    );

    v_wallet_credited := true;

    -- Create customer in-app Realtime notification (idempotent via dedupe_key)
    select * into v_settings
    from public.store_settings ss
    where ss.store_id = v_req.store_id
    limit 1;

    if found then
      v_currency_en := coalesce(nullif(trim(v_settings.currency), ''), 'EGP');
      v_currency_ar := case when upper(v_currency_en) = 'EGP' then 'ج.م' else v_currency_en end;
    end if;

    insert into public.notifications (
      store_id,
      user_id,
      target_role,
      category,
      title_ar,
      title_en,
      body_ar,
      body_en,
      deep_link,
      data,
      dedupe_key
    )
    values (
      v_req.store_id,
      v_req.user_id,
      'customer',
      'order_update',
      'تم إيداع ' || to_char(v_req.refund_amount, 'FM999999990.##') || ' ' || v_currency_ar || ' في محفظة المتجر',
      to_char(v_req.refund_amount, 'FM999999990.##') || ' ' || v_currency_en || ' refunded to your Store Wallet',
      'تم إتمام طلب الإرجاع #' || v_short_return || ' للطلب #' || v_short_order || ' وإيداع المبلغ فوراً في رصيد محفظتك. رصيدك الحالي: ' || to_char(v_next_balance, 'FM999999990.##') || ' ' || v_currency_ar || '.',
      'Your return #' || v_short_return || ' for order #' || v_short_order || ' is complete and credited instantly to your wallet. Current balance: ' || to_char(v_next_balance, 'FM999999990.##') || ' ' || v_currency_en || '.',
      '/orders/' || v_req.order_id::text,
      jsonb_build_object(
        'order_id', v_req.order_id,
        'return_id', v_req.id,
        'refund_amount', v_req.refund_amount,
        'balance_after', v_next_balance
      ),
      'return_wallet_refund:' || v_req.id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  update public.return_requests
  set status = v_next_status,
      admin_notes = case
        when p_admin_notes is not null then v_notes
        else admin_notes
      end,
      restocked = v_restocked,
      wallet_credited = v_wallet_credited,
      updated_at = now()
  where id = v_req.id
  returning * into v_req;

  return v_req;
end $$;

revoke all on function public.admin_process_return_request(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_process_return_request(uuid, text, text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
