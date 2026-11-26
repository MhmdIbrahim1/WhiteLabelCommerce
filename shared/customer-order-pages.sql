begin;
create index if not exists orders_store_customer_cursor on public.orders(store_id,customer_id,created_at desc,id desc);
create index if not exists orders_legacy_user_cursor on public.orders(store_id,user_id,created_at desc,id desc) where customer_id is null;
create or replace function public.order_status_group(p_status text) returns text
language sql immutable parallel safe set search_path='' as $$
  select case p_status when 'delivered' then 'completed' when 'cancelled' then 'cancelled' else 'active' end
$$;
create index if not exists orders_store_customer_status_cursor on public.orders
  (store_id,customer_id,public.order_status_group(status),created_at desc,id desc);

create index if not exists orders_legacy_user_status_cursor on public.orders
  (store_id,user_id,public.order_status_group(status),created_at desc,id desc) where customer_id is null;

create or replace function public.my_order_cards(p_store_id uuid,p_filter text default 'all',
  p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 13)
returns table(id uuid,status text,created_at timestamptz,total numeric,currency text,payment_status text,
  item_count integer,thumbnails text[]) language plpgsql stable security invoker set search_path='' as $$
declare
  shopper uuid := auth.uid();
  customer uuid;
  status_filter text := '';
begin
  if shopper is null or p_filter is null or p_filter not in ('all','active','completed','cancelled') then return; end if;
  select sc.id into customer from public.store_customers sc where sc.store_id=p_store_id and sc.user_id=shopper;
  if p_filter <> 'all' then status_filter := ' and public.order_status_group(o.status)=$7'; end if;
  -- Each branch seeks its own index. Merging the two bounded slices also covers pre-profile orders.
  return query execute format($query$
    with page as materialized (
      select candidate.* from (
        (select o.id,o.status,o.created_at,o.total,o.currency,o.payment_status from public.orders o
         where o.store_id=$1 and o.user_id=$2 and o.customer_id=$3 and (o.created_at,o.id)<($4,$5) %1$s
         order by o.created_at desc,o.id desc limit $6)
        union all
        (select o.id,o.status,o.created_at,o.total,o.currency,o.payment_status from public.orders o
         where o.store_id=$1 and o.user_id=$2 and o.customer_id is null and (o.created_at,o.id)<($4,$5) %1$s
         order by o.created_at desc,o.id desc limit $6)
      ) candidate order by candidate.created_at desc,candidate.id desc limit $6
    )
    select page.id,page.status,page.created_at,page.total,page.currency,page.payment_status,
      coalesce(items.count,0)::integer,coalesce(items.photos,'{}'::text[])
    from page left join lateral (
      select sum(oi.quantity) as count,
        (array_agg(coalesce(p.color_images->>oi.color,p.image_path) order by oi.id)
          filter(where coalesce(p.color_images->>oi.color,p.image_path) is not null))[1:3] as photos
      from public.order_items oi left join public.products p on p.store_id=$1 and p.id=oi.product_id
      where oi.order_id=page.id
    ) items on true order by page.created_at desc,page.id desc
  $query$,status_filter) using p_store_id,shopper,customer,coalesce(p_before,'infinity'::timestamptz),
      coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid),greatest(1,least(coalesce(p_limit,13),51)),p_filter;
end
$$;
revoke all on function public.my_order_cards(uuid,text,timestamptz,uuid,integer) from public,anon;
grant execute on function public.my_order_cards(uuid,text,timestamptz,uuid,integer) to authenticated;

create or replace function public.my_account_counts(p_store_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  perform set_config('app.address_store',p_store_id::text,true);
  return jsonb_build_object(
    'orders',(select count(*) from public.orders where store_id=p_store_id and user_id=(select auth.uid())),
    'addresses',(select count(*) from public.customer_addresses a join public.store_customers c on (c.store_id,c.id)=(a.store_id,a.customer_id)
                 where a.store_id=p_store_id and c.user_id=(select auth.uid())),
    'tickets',(select count(*) from public.support_tickets where store_id=p_store_id and customer_id=(select auth.uid())),
    'wishlist',(select count(*) from public.wishlists where store_id=p_store_id and user_id=(select auth.uid())));
end
$$;
revoke all on function public.my_account_counts(uuid) from public,anon;
grant execute on function public.my_account_counts(uuid) to authenticated;
-- Preserve the direct-insert staff-field policy. Only the authenticated order owner can attach a database reference.
create or replace function public.mobile_support(p_store uuid,p_subject text,p_message text,p_order uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  shopper uuid := auth.uid();
begin
  if shopper is null or p_order is null or not exists (select 1 from public.stores s where s.id=p_store and s.status <> 'suspended') then
    raise exception 'invalid_support_request';
  end if;
  if coalesce(length(trim(p_subject)),0) not between 1 and 160 or coalesce(length(trim(p_message)),0) not between 1 and 4000 then
    raise exception 'invalid_support_message';
  end if;
  insert into public.support_tickets(store_id,customer_id,order_id,subject,message)
  values(p_store,shopper,(select o.id from public.orders o where o.id=p_order and o.store_id=p_store and o.user_id=shopper),
    trim(p_subject),trim(p_message));
end
$$;
revoke all on function public.mobile_support(uuid,text,text,uuid) from public,anon;
grant execute on function public.mobile_support(uuid,text,text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
