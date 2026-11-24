-- Android Multi-Tenant Sync Migration (Phases 3–8b)
-- Enforces explicit store_id isolation on mobile RPCs (mobile_checkout, mobile_track,
-- mobile_coupon, mobile_support) and adds store_id scoping to public.support_tickets.
-- Apply after phase-8-paymob.sql. Idempotent and safe to re-run.
begin;

create or replace function public.mobile_current_store() returns uuid
language sql stable security invoker set search_path = ''
as $$ select store_id from public.store_settings where id $$;

alter table public.support_tickets add column if not exists store_id uuid;
update public.support_tickets t set store_id = coalesce(
  (select o.store_id from public.orders o where o.id = t.order_id),
  public.mobile_current_store()
) where t.store_id is null;
alter table public.support_tickets alter column store_id set default public.mobile_current_store(),
  alter column store_id set not null;
create index if not exists support_tickets_store_customer_idx on public.support_tickets(store_id, customer_id);

create or replace function public.mobile_support(p_store uuid, p_subject text, p_message text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_store is distinct from public.mobile_current_store() then raise exception 'unknown_store'; end if;
  insert into public.support_tickets(subject,message) values(p_subject,p_message);
end $$;

create or replace function public.mobile_coupon(p_store uuid, p_code text, p_subtotal numeric)
returns table(valid boolean, discount_amount numeric)
language sql stable security invoker set search_path = '' as $$
  select c.valid,c.discount_amount from public.validate_coupon(p_code,p_subtotal) c
  where p_store = public.mobile_current_store()
$$;

create or replace function public.mobile_track(p_store uuid, order_number uuid, customer_phone text)
returns table(id uuid,status text,created_at timestamptz,shipping_carrier text,
  tracking_number text,payment_method text,payment_status text)
language sql stable security definer set search_path = '' as $$
  select o.id,o.status,o.created_at,o.shipping_carrier,o.tracking_number,o.payment_method,o.payment_status
  from public.orders o where o.id = order_number and o.store_id = p_store
  and o.guest_tracking and o.user_id is null and o.phone = customer_phone
$$;

create or replace function public.mobile_checkout(p_store uuid, request_key uuid, address text,
  customer_phone text, payment text, lines jsonb, p_coupon_code text default null, p_customer_name text default null)
returns table(order_number uuid,amount numeric,order_currency text)
language plpgsql security definer set search_path = '' as $$
declare item record;
begin
  perform 1 from public.store_settings s where s.id and s.store_id = p_store for share;
  if not found then raise exception 'unknown_store'; end if;
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) not between 1 and 100 then raise exception 'invalid_cart'; end if;
  for item in select distinct (entry->>'id')::uuid as id from jsonb_array_elements(lines) entry order by id loop
    perform 1 from public.products p where p.id = item.id and p.store_id = p_store for update;
    if not found then raise exception 'invalid_cart'; end if;
  end loop;
  return query select r.* from public.store_checkout(request_key,address,customer_phone,payment,lines,p_coupon_code,p_customer_name) r;
  if exists (select 1 from public.orders o where o.checkout_key = request_key and o.store_id <> p_store) then raise exception 'unknown_store'; end if;
end $$;

revoke all on function public.mobile_track(uuid,uuid,text), public.mobile_checkout(uuid,uuid,text,text,text,jsonb,text,text),
  public.mobile_coupon(uuid,text,numeric), public.mobile_support(uuid,text,text) from public;
grant execute on function public.mobile_track(uuid,uuid,text), public.mobile_checkout(uuid,uuid,text,text,text,jsonb,text,text),
  public.mobile_coupon(uuid,text,numeric), public.mobile_support(uuid,text,text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
