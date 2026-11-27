begin;

-- RLS decides which orders a shopper can see. Column grants decide which fields.
revoke select on public.orders, public.order_items from public, anon, authenticated;
revoke select (delivery_token) on public.orders from public, anon, authenticated;
revoke select (unit_cost) on public.order_items from public, anon, authenticated;
grant select (
  id, store_id, user_id, customer_id, status, created_at, recipient_name,
  shipping_address, lat, lng, phone, currency, subtotal, shipping_fee, total,
  coupon_code, discount_amount, wallet_discount, cashback_earned, guest_tracking,
  payment_method, payment_status, shipping_carrier, tracking_number, tracking_url,
  courier_note, shipped_at, delivered_at
) on public.orders to authenticated;
grant select (id, order_id, product_id, product_name, quantity, unit_price, size, color)
  on public.order_items to authenticated;

-- Used by the fulfillment screen. Issuing the same link twice preserves its token.
create or replace function public.merchant_order_delivery_token(
  p_store_id uuid, p_order_id uuid, p_issue boolean default false
) returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_store_permission(p_store_id, 'manage_orders') then
    raise insufficient_privilege;
  end if;
  if p_issue then
    update public.orders set delivery_token = encode(extensions.gen_random_bytes(24), 'hex')
    where store_id = p_store_id and id = p_order_id and delivery_token is null;
  end if;
  return (select o.delivery_token from public.orders o
          where o.store_id = p_store_id and o.id = p_order_id);
end $$;
revoke all on function public.merchant_order_delivery_token(uuid, uuid, boolean) from public, anon;
grant execute on function public.merchant_order_delivery_token(uuid, uuid, boolean) to authenticated;

-- Retire the unscoped overload in the same transaction as its replacement.
drop function if exists public.track_guest_order(uuid, text);
create or replace function public.track_guest_order(p_store_id uuid, order_number uuid, customer_phone text)
returns table (
  id uuid, status text, created_at timestamptz, shipping_carrier text, tracking_number text,
  tracking_url text, courier_note text, shipped_at timestamptz, delivered_at timestamptz,
  payment_method text, payment_status text
) language sql stable security definer set search_path = '' as $$
  select o.id, o.status, o.created_at, o.shipping_carrier, o.tracking_number,
         o.tracking_url, o.courier_note, o.shipped_at, o.delivered_at, o.payment_method, o.payment_status
  from public.orders o
  where o.store_id = p_store_id and o.id = order_number
    and o.guest_tracking and o.user_id is null and o.phone = customer_phone
$$;
revoke all on function public.track_guest_order(uuid, uuid, text) from public;
grant execute on function public.track_guest_order(uuid, uuid, text) to anon, authenticated;

-- Invoker permissions and product RLS also apply to reads through this projection.
-- The homepage adds its store predicate, expiry ordering and limit to the same query.
create or replace view public.storefront_flash_deals with (security_invoker = true) as
  select p.store_id, p.id, p.name, p.name_en, p.category_id, p.description, p.description_en,
         p.price, p.old_price, p.flash_sale_price, p.flash_sale_starts_at, p.flash_sale_ends_at,
         p.stock, p.max_order_qty, p.sizes, p.colors, p.image_path, p.specifications, p.avg_rating, p.review_count
  from public.products p
  where p.is_active and p.stock > 0 and p.flash_sale_price > 0 and p.flash_sale_price < p.price
    and (p.flash_sale_starts_at is null or p.flash_sale_starts_at <= statement_timestamp())
    and p.flash_sale_ends_at > statement_timestamp();
revoke all on public.storefront_flash_deals from public, anon, authenticated;
grant select on public.storefront_flash_deals to anon, authenticated;

notify pgrst, 'reload schema';
commit;
