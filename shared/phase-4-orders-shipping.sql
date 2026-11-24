-- Phase 4: Zero-Contract Shipping, Order Fulfillment, Stock Restoration & Driver Delivery Confirmation
-- Apply after phase-3-customizer.sql. Idempotent and backward compatible.
begin;

alter table public.orders
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists courier_note text,
  add column if not exists delivery_token text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

create unique index if not exists orders_delivery_token_uidx
  on public.orders (delivery_token)
  where delivery_token is not null;

-- Automatically restore product stock once when an order transitions into cancelled.
create or replace function public.restore_order_stock_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
declare
  item record;
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    for item in
      select oi.product_id, sum(oi.quantity)::integer as qty
      from public.order_items oi
      where oi.order_id = new.id and oi.product_id is not null
      group by oi.product_id
      order by oi.product_id
    loop
      update public.products
      set stock = stock + item.qty
      where id = item.product_id;
    end loop;
  end if;
  return new;
end $$;

revoke all on function public.restore_order_stock_on_cancel() from public, anon, authenticated;

drop trigger if exists nova_restore_order_stock_on_cancel on public.orders;
create trigger nova_restore_order_stock_on_cancel
  after update of status on public.orders
  for each row
  when (old.status is distinct from 'cancelled' and new.status = 'cancelled')
  execute function public.restore_order_stock_on_cancel();

-- Upgrade guest order tracking RPC to include shipping & delivery details.
drop function if exists public.track_guest_order(uuid, text);
create or replace function public.track_guest_order(
  order_number uuid,
  customer_phone text
)
returns table(
  id uuid,
  status text,
  created_at timestamptz,
  shipping_carrier text,
  tracking_number text,
  tracking_url text,
  courier_note text,
  shipped_at timestamptz,
  delivered_at timestamptz
)
language sql
stable
security definer
set search_path = '' as $$
  select
    o.id,
    o.status,
    o.created_at,
    o.shipping_carrier,
    o.tracking_number,
    o.tracking_url,
    o.courier_note,
    o.shipped_at,
    o.delivered_at
  from public.orders o
  where o.id = order_number
    and o.guest_tracking
    and o.user_id is null
    and o.phone = customer_phone
$$;

-- One-tap driver delivery lookup (narrowly scoped by unique high-entropy delivery_token).
create or replace function public.get_delivery_by_token(p_token text)
returns table(
  order_id uuid,
  status text,
  shipping_address text,
  phone text,
  shipping_carrier text,
  tracking_number text,
  courier_note text,
  total numeric,
  currency text,
  payment_method text,
  item_count bigint,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = '' as $$
  select
    o.id as order_id,
    o.status,
    o.shipping_address,
    o.phone,
    o.shipping_carrier,
    o.tracking_number,
    o.courier_note,
    o.total,
    o.currency,
    o.payment_method,
    coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id = o.id), 0) as item_count,
    o.shipped_at,
    o.delivered_at,
    o.created_at
  from public.orders o
  where p_token is not null
    and length(trim(p_token)) >= 24
    and o.delivery_token = trim(p_token)
$$;

-- One-tap driver delivery confirmation (marks shipped/confirmed order as delivered).
create or replace function public.confirm_delivery_by_token(p_token text)
returns table(
  outcome text,
  order_id uuid,
  delivered_at timestamptz
)
language plpgsql
security definer
set search_path = '' as $$
declare
  target public.orders%rowtype;
  ts timestamptz;
begin
  if p_token is null or length(trim(p_token)) < 24 then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  select * into target
  from public.orders
  where delivery_token = trim(p_token)
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  if target.status = 'delivered' then
    return query select 'already_delivered'::text, target.id, target.delivered_at;
    return;
  end if;

  if target.status not in ('confirmed', 'shipped') then
    return query select 'invalid_state'::text, target.id, target.delivered_at;
    return;
  end if;

  ts := coalesce(target.delivered_at, now());
  update public.orders
  set status = 'delivered',
      delivered_at = ts
  where id = target.id;

  return query select 'delivered'::text, target.id, ts;
end $$;

revoke all on function
  public.track_guest_order(uuid, text),
  public.get_delivery_by_token(text),
  public.confirm_delivery_by_token(text)
  from public;

grant execute on function
  public.track_guest_order(uuid, text),
  public.get_delivery_by_token(text),
  public.confirm_delivery_by_token(text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
