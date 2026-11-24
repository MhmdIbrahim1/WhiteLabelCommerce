-- Apply after phase-1-admin.sql. Existing order and catalog records are preserved.
begin;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.orders
  add column if not exists phone text,
  add column if not exists payment_method text check (payment_method in ('COD','CARD')),
  add column if not exists checkout_key uuid unique,
  add column if not exists checkout_fingerprint text,
  add column if not exists guest_tracking boolean not null default false;
alter table public.order_items add column if not exists size text, add column if not exists color text;

create or replace function public.store_checkout(
  request_key uuid, address text, customer_phone text, payment text, lines jsonb
) returns table(order_number uuid, amount numeric, order_currency text)
language plpgsql security definer set search_path = '' as $$
declare
  customer uuid := auth.uid();
  fingerprint text;
  prior public.orders%rowtype;
  settings public.store_settings%rowtype;
  product public.products%rowtype;
  entry jsonb;
  item_quantity integer;
  chosen_size text;
  chosen_color text;
  subtotal_value numeric := 0;
  new_id uuid;
begin
  if request_key is null or payment is distinct from 'COD'
    or address is null or length(trim(address)) not between 3 and 500
    or customer_phone is null or customer_phone !~ '^[0-9]{8,15}$'
    or jsonb_typeof(lines) is distinct from 'array' then raise exception 'invalid_checkout'; end if;
  if jsonb_array_length(lines) not between 1 and 100 then raise exception 'invalid_cart'; end if;

  fingerprint := md5(jsonb_build_array(trim(address), customer_phone, payment, lines)::text);
  perform pg_advisory_xact_lock(hashtextextended(request_key::text, 0));
  select * into prior from public.orders where checkout_key = request_key;
  if found then
    if prior.user_id is distinct from customer or prior.checkout_fingerprint is distinct from fingerprint
       or prior.guest_tracking is distinct from (customer is null) then raise exception 'checkout_key_conflict'; end if;
    return query select prior.id, prior.total, prior.currency;
    return;
  end if;

  select * into strict settings from public.store_settings where id;
  insert into public.orders(user_id, shipping_address, phone, payment_method, guest_tracking,
                            currency, shipping_fee, subtotal, checkout_key, checkout_fingerprint)
    values(customer, trim(address), customer_phone, payment, customer is null,
           settings.currency, settings.shipping_fee, 0, request_key, fingerprint)
    returning id into new_id;

  -- Lock in the same product order across carts. Later variants see earlier decrements.
  for entry in select value from jsonb_array_elements(lines) order by (value->>'id')::uuid loop
    if jsonb_typeof(entry->'quantity') is distinct from 'number'
       or (entry->>'quantity') !~ '^[1-9][0-9]{0,5}$' then raise exception 'invalid_quantity'; end if;
    item_quantity := (entry->>'quantity')::integer;
    chosen_size := coalesce(entry->>'size','');
    chosen_color := coalesce(entry->>'color','');
    select * into product from public.products where id=(entry->>'id')::uuid for update;
    if not found or not product.is_active or product.stock < item_quantity then raise exception 'stock_unavailable'; end if;
    if (cardinality(product.sizes)=0 and chosen_size<>'') or
       (cardinality(product.sizes)>0 and not coalesce(chosen_size=any(product.sizes),false)) or
       (cardinality(product.colors)=0 and chosen_color<>'') or
       (cardinality(product.colors)>0 and not coalesce(chosen_color=any(product.colors),false)) then raise exception 'invalid_variant'; end if;
    update public.products set stock=stock-item_quantity where id=product.id;
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,size,color)
      values(new_id,product.id,product.name,item_quantity,product.price,nullif(chosen_size,''),nullif(chosen_color,''));
    subtotal_value := subtotal_value + product.price*item_quantity;
  end loop;
  update public.orders set subtotal=subtotal_value where id=new_id;
  return query select o.id,o.total,o.currency from public.orders o where o.id=new_id;
end $$;

-- Only expose the guest timeline for the exact UUID and phone supplied at checkout.
create or replace function public.track_guest_order(order_number uuid, customer_phone text)
returns table(id uuid,status text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id,o.status,o.created_at from public.orders o
  where o.id=order_number and o.guest_tracking and o.user_id is null and o.phone=customer_phone
$$;
revoke all on function public.store_checkout(uuid,text,text,text,jsonb),public.track_guest_order(uuid,text) from public;
grant execute on function public.store_checkout(uuid,text,text,text,jsonb),public.track_guest_order(uuid,text) to anon, authenticated;
notify pgrst,'reload schema';
commit;
