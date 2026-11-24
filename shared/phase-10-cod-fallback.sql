-- Phase 10: Cash-on-Delivery (COD) Fallback on Failed/Pending Online Payments
-- Allows customers (both authenticated and matching guest phone) to switch a pending/failed
-- Paymob order to COD (`payment_method = 'cod'`, `payment_status = 'cod_pending'`, `status = 'confirmed'`).
-- Apply after phase-9-unified-auth.sql. Idempotent and backward compatible.
begin;

-- 1. Widen orders_payment_status_check to allow 'cod_pending'
alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'cod_pending', 'paid', 'failed', 'refunded'));

-- 2. Secure RPC to switch a failed/pending online order to Cash on Delivery (COD)
create or replace function public.switch_order_to_cod(
  p_store uuid,
  p_order_id uuid,
  p_phone text default ''
)
returns table(
  id uuid,
  status text,
  payment_method text,
  payment_status text
)
language plpgsql
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_settings public.store_settings%rowtype;
  v_order public.orders%rowtype;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_phone_variants text[] := array[]::text[];
  v_authorized boolean := false;
begin
  select * into strict v_settings
  from public.store_settings s
  where s.id and s.store_id = p_store;

  if not v_settings.cod_enabled then
    raise exception 'cod_disabled';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id
    and o.store_id = p_store
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  -- Build Egyptian phone variants for guest authorization
  if v_phone ~ '^2001[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 4);
  elsif v_phone ~ '^00201[0125][0-9]{8}$' then
    v_phone := '0' || substr(v_phone, 5);
  end if;

  if v_phone ~ '^01[0125][0-9]{8}$' then
    v_phone_variants := array[v_phone, '20' || substr(v_phone, 2)];
  elsif v_phone ~ '^201[0125][0-9]{8}$' then
    v_phone_variants := array['0' || substr(v_phone, 3), v_phone];
  elsif length(v_phone) >= 8 then
    v_phone_variants := array[v_phone];
  end if;

  if v_uid is not null and (v_order.user_id = v_uid or public.is_store_admin(p_store)) then
    v_authorized := true;
  elsif v_order.user_id is null and cardinality(v_phone_variants) > 0 and v_order.phone = any(v_phone_variants) then
    v_authorized := true;
  elsif v_uid is not null and v_order.user_id is null and cardinality(v_phone_variants) > 0 and v_order.phone = any(v_phone_variants) then
    v_authorized := true;
  end if;

  if not v_authorized then
    raise exception 'not_authorized';
  end if;

  if v_order.status in ('cancelled', 'delivered') then
    raise exception 'order_closed';
  end if;

  if v_order.payment_status = 'paid' then
    raise exception 'already_paid';
  end if;

  update public.orders o
  set payment_method = 'cod',
      payment_status = 'cod_pending',
      status = case when o.status = 'pending' then 'confirmed' else o.status end
  where o.id = v_order.id
  returning o.id, o.status, o.payment_method, o.payment_status
  into id, status, payment_method, payment_status;

  return next;
end $$;

revoke all on function public.switch_order_to_cod(uuid, uuid, text) from public;
grant execute on function public.switch_order_to_cod(uuid, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
