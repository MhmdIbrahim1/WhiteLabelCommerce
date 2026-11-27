begin;

set local lock_timeout = '8s';

-- Index text search independently from the tenant/date range so the planner can combine paths.
set local search_path = pg_catalog, public, extensions;
create index if not exists orders_directory_recipient_trgm on public.orders using gin (recipient_name gin_trgm_ops);
create index if not exists orders_directory_phone_trgm on public.orders using gin (phone gin_trgm_ops);
create index if not exists orders_directory_customer_trgm on public.store_customers using gin (full_name gin_trgm_ops);
create index if not exists orders_directory_payment on public.orders(store_id, payment_status, created_at desc, id desc);
create index if not exists orders_directory_review on public.orders(store_id, created_at desc, id desc) where payment_review is not null;
reset search_path;

create or replace function public.merchant_order_directory(
  p_store_id uuid, p_q text, p_id_min uuid, p_id_max uuid, p_status text, p_payment text,
  p_from date, p_to date, p_page integer, p_page_size integer
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  needle text := nullif(left(btrim(p_q),100),'');
  pattern text := '%' || replace(replace(replace(needle,E'\\',E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  size integer := greatest(1, least(coalesce(p_page_size,24),100));
begin
  if public.has_store_permission(p_store_id,'manage_orders') is not true then raise insufficient_privilege; end if;
  return (
    with name_matches as (
      select c.id, c.user_id from public.store_customers c
      where c.store_id = p_store_id and c.full_name ilike pattern
    ), search_hits as (
      select id from public.orders where store_id = p_store_id and recipient_name ilike pattern
      union all select id from public.orders where store_id = p_store_id and phone ilike pattern
      union all select id from public.orders where store_id = p_store_id and id between p_id_min and p_id_max
      union all select o.id from public.orders o join name_matches c on c.id = o.customer_id where o.store_id = p_store_id
      union all select o.id from public.orders o join name_matches c on c.user_id = o.user_id
        where o.store_id = p_store_id and o.customer_id is null
    ), matched as not materialized (
      select o.id, o.created_at, o.status, o.currency, o.total, o.recipient_name, o.customer_id, o.user_id,
             o.phone, o.payment_review, o.payment_status
      from public.orders o where o.store_id = p_store_id
        and (p_status is null or o.status = p_status)
        and (p_payment is null or o.payment_status = p_payment or (p_payment = 'review' and o.payment_review is not null))
        and (p_from is null or o.created_at >= (p_from::timestamp at time zone 'UTC'))
        and (p_to is null or o.created_at < ((p_to + 1)::timestamp at time zone 'UTC'))
        and (needle is null or o.id in (select id from search_hits))
    ), paged as (
      select * from matched order by created_at desc, id desc
      limit size offset ((greatest(1,coalesce(p_page,1))::bigint - 1) * size)
    ), rows as (
      select o.id, o.created_at, o.status, o.currency, o.total, o.phone, o.user_id, o.payment_status, o.payment_review,
        coalesce(nullif(btrim(o.recipient_name),''),nullif(btrim(c.full_name),'')) as customer_name,
        coalesce((select sum(i.quantity) from public.order_items i where i.order_id = o.id),0) as quantity
      from paged o left join public.store_customers c on c.store_id = p_store_id
        and (c.id = o.customer_id or (o.customer_id is null and c.user_id = o.user_id))
    )
    select jsonb_build_object('total_count', (select count(*) from matched),
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc) from rows r),'[]'::jsonb))
  );
end $$;
revoke all on function public.merchant_order_directory(uuid,text,uuid,uuid,text,text,date,date,integer,integer) from public, anon;
grant execute on function public.merchant_order_directory(uuid,text,uuid,uuid,text,text,date,date,integer,integer) to authenticated;

-- Product review moderation directory. All counts and page rows share a single snapshot.
create index if not exists product_reviews_store_chronology_idx
  on public.product_reviews (store_id, created_at desc, id desc);

create or replace function public.merchant_review_directory(
  p_store_id uuid, p_filter text default 'all', p_q text default '',
  p_rating integer default null, p_page integer default 1, p_page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_size integer := least(100, greatest(1, coalesce(p_page_size, 20)));
  v_query text := lower(left(btrim(coalesce(p_q, '')), 100));
begin
  if auth.uid() is null or public.has_store_permission(p_store_id, 'manage_products') is not true then
    raise exception 'manage_products_required' using errcode = '42501';
  end if;
  if coalesce(p_filter, '') not in ('all', 'needs_reply', 'hidden') or p_rating not between 1 and 5 then
    raise exception 'invalid_review_filter' using errcode = '22023';
  end if;
  return (
    with scoped as not materialized (
      select r.*, r.status = 'published' and (
        nullif(btrim(r.admin_reply), '') is null or (
          exists (select 1 from public.review_replies t
                  where t.store_id = r.store_id and t.review_id = r.id and t.role = 'customer')
          and not exists (select 1 from public.review_replies t
                          where t.store_id = r.store_id and t.review_id = r.id and t.role = 'merchant')
        )
      ) as needs_reply
      from public.product_reviews r where r.store_id = p_store_id
    ), classified as not materialized (
      select r.*, (p_filter = 'all' or (p_filter = 'hidden' and r.status = 'hidden')
                   or (p_filter = 'needs_reply' and r.needs_reply))
        and (p_rating is null or r.rating = p_rating)
        and (v_query = '' or strpos(lower(r.author_name), v_query) > 0
                          or strpos(lower(r.comment), v_query) > 0) as matches
      from scoped r
    ), counts as (
      select count(*) as total, count(*) filter (where status = 'published') as published_count,
        coalesce(avg(rating) filter (where status = 'published'), 0) as avg_rating,
        count(*) filter (where needs_reply) as needs_reply_count,
        count(*) filter (where status = 'hidden') as hidden_count,
        count(*) filter (where matches) as total_count
      from classified
    ), bounds as (
      select c.*, least(greatest(coalesce(p_page, 1), 1), greatest(1, (total_count + v_size - 1) / v_size)) as page,
        v_size as page_size from counts c
    ), slice as (
      select r.* from classified r where r.matches
      order by r.created_at desc, r.id desc limit v_size offset (select (page - 1) * v_size from bounds)
    ), enriched as (
      select r.id, r.product_id, r.author_name, r.rating, r.comment, r.is_verified_purchase,
        r.status, r.admin_reply, r.admin_replied_at, r.created_at, r.needs_reply,
        p.name as product_name_ar, p.name_en as product_name_en, p.image_path,
        coalesce((select jsonb_agg(jsonb_build_object('role', t.role, 'body', t.body, 'created_at', t.created_at)
                                  order by t.created_at, t.role)
                  from public.review_replies t where t.store_id = r.store_id and t.review_id = r.id), '[]'::jsonb) as review_replies
      from slice r left join public.products p on p.id = r.product_id and p.store_id = r.store_id
    )
    select to_jsonb(b) || jsonb_build_object('rows', coalesce(
      (select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id desc) from enriched e), '[]'::jsonb))
    from bounds b
  );
end $$;
revoke all on function public.merchant_review_directory(uuid,text,text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.merchant_review_directory(uuid,text,text,integer,integer,integer) to authenticated;


-- Threaded support keeps the legacy ticket summary readable by existing mobile clients.
create schema if not exists support_internal;
revoke all on schema support_internal from public, anon, authenticated;

alter table public.support_tickets
  add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamptz,
  add column if not exists last_message_at timestamptz;

update public.support_tickets
set subject = left(coalesce(nullif(btrim(subject,E' \t\n\r\f'),''),'[Legacy support ticket]'),160),
    message = left(coalesce(nullif(btrim(message,E' \t\n\r\f'),''),'[Legacy empty message]'),4000),
    admin_reply = left(admin_reply,4000)
where char_length(btrim(subject,E' \t\n\r\f')) not between 1 and 160
   or char_length(btrim(message,E' \t\n\r\f')) not between 1 and 4000
   or char_length(btrim(subject)) > 160 or char_length(btrim(message)) > 4000
   or char_length(admin_reply) > 4000;

alter table public.support_tickets drop constraint if exists support_tickets_text_limits;
alter table public.support_tickets add constraint support_tickets_text_limits check (
  char_length(btrim(subject)) between 1 and 160 and char_length(btrim(message)) between 1 and 4000
  and btrim(subject,E' \t\n\r\f') <> '' and btrim(message,E' \t\n\r\f') <> ''
  and char_length(coalesce(admin_reply,'')) <= 4000
);

create unique index if not exists support_ticket_store_key on public.support_tickets(id,store_id);
create index if not exists support_ticket_inbox_idx on public.support_tickets(store_id,is_read,status,last_message_at desc,id desc);
create index if not exists support_ticket_recent_idx on public.support_tickets(store_id,last_message_at desc,id desc);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','merchant','system')),
  sender_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000 and btrim(body,E' \t\n\r\f') <> ''),
  created_at timestamptz not null default now(),
  foreign key(ticket_id,store_id) references public.support_tickets(id,store_id) on delete cascade
);
create index if not exists support_thread_order_idx on public.support_ticket_messages(ticket_id,created_at,id);
create index if not exists support_message_store_idx on public.support_ticket_messages(store_id,created_at desc);

-- Only the original importer populates last_message_at from null. Both legacy entries
-- are inserted together. With no historical reply time, preserve their known order.
insert into public.support_ticket_messages(ticket_id,store_id,sender_role,sender_user_id,body,created_at)
select t.id,t.store_id,m.role,m.sender_id,btrim(m.body,E' \t\n\r\f'),m.posted
from public.support_tickets t cross join lateral (values
  ('customer',t.customer_id,t.message,t.created_at),
  ('merchant',null::uuid,t.admin_reply,t.created_at + interval '1 microsecond')
) as m(role,sender_id,body,posted)
where t.last_message_at is null and btrim(m.body,E' \t\n\r\f') <> ''
  and not exists(select from public.support_ticket_messages x where x.ticket_id=t.id);

update public.support_tickets t
set last_message_at = coalesce((select max(m.created_at) from public.support_ticket_messages m where m.ticket_id=t.id),t.created_at),
    is_read = t.status='closed' or btrim(coalesce(t.admin_reply,''),E' \t\n\r\f') <> '',
    read_at = case when t.status='closed' or btrim(coalesce(t.admin_reply,''),E' \t\n\r\f') <> ''
                   then coalesce((select max(m.created_at) from public.support_ticket_messages m where m.ticket_id=t.id),t.created_at) end
where t.last_message_at is null;
alter table public.support_tickets alter column last_message_at set default now(), alter column last_message_at set not null;

-- Table grants and legacy column grants are independent in PostgreSQL.
revoke insert, update on public.support_tickets from public, anon, authenticated;
do $ticket_grants$
declare cols text;
begin
  select string_agg(quote_ident(attname),',') into cols from pg_attribute
    where attrelid='public.support_tickets'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke insert (%1$s), update (%1$s) on public.support_tickets from public, anon, authenticated',cols);
end
$ticket_grants$;

alter table public.support_ticket_messages enable row level security;
revoke all on public.support_ticket_messages from public, anon, authenticated;
grant select on public.support_ticket_messages to authenticated;
grant insert(ticket_id,store_id,sender_role,sender_user_id,body) on public.support_ticket_messages to authenticated;

drop policy if exists support_thread_read on public.support_ticket_messages;
create policy support_thread_read on public.support_ticket_messages for select to authenticated using (
  public.has_store_permission(store_id,'manage_customers') or exists (
    select from public.support_tickets t where t.id=support_ticket_messages.ticket_id
      and t.store_id=support_ticket_messages.store_id and t.customer_id=(select auth.uid()) and t.status <> 'closed'
  )
);
drop policy if exists support_thread_write on public.support_ticket_messages;
create policy support_thread_write on public.support_ticket_messages for insert to authenticated with check (
  sender_user_id=(select auth.uid()) and (
    (sender_role='merchant' and public.has_store_permission(store_id,'manage_customers')) or
    (sender_role='customer' and exists (
      select from public.support_tickets t where t.id=support_ticket_messages.ticket_id and t.store_id=support_ticket_messages.store_id
        and t.customer_id=(select auth.uid()) and t.status <> 'closed'
    ))
  )
);

-- Serialize each append with status changes. Use database time and keep the
-- Android summary synchronized even for an authenticated direct message insert.
create or replace function support_internal.sync_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets%rowtype;
begin
  select * into ticket from public.support_tickets where id=new.ticket_id and store_id=new.store_id for update;
  if not found or ticket.status='closed' then raise insufficient_privilege; end if;
  new.body := btrim(new.body,E' \t\n\r\f');
  new.created_at := greatest(clock_timestamp(),ticket.last_message_at + interval '1 microsecond');
  update public.support_tickets set last_message_at=new.created_at,
    is_read=(new.sender_role='merchant'),
    read_at=case when new.sender_role='merchant' then new.created_at end,
    admin_reply=case when new.sender_role='merchant' then new.body else admin_reply end
    where id=ticket.id and store_id=ticket.store_id;
  return new;
end $$;
revoke all on function support_internal.sync_message() from public,anon,authenticated;
drop trigger if exists support_sync_message on public.support_ticket_messages;
create trigger support_sync_message before insert on public.support_ticket_messages
for each row execute function support_internal.sync_message();

create table if not exists support_internal.ticket_rate_limits (
  -- Retain an admission until expiry even if its ticket is subsequently deleted.
  ticket_id uuid primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid, ip_hash bytea, created_at timestamptz not null,
  check ((user_id is null) = (ip_hash is not null))
);
revoke all on support_internal.ticket_rate_limits from public,anon,authenticated;
create index if not exists support_limit_user_idx on support_internal.ticket_rate_limits(store_id,user_id,created_at) where user_id is not null;
create index if not exists support_limit_anon_idx on support_internal.ticket_rate_limits(store_id,created_at,ip_hash) where user_id is null;
create index if not exists support_limit_expiry_idx on support_internal.ticket_rate_limits(created_at);

create or replace function support_internal.create_ticket(p_store uuid,p_subject text,p_message text,p_order uuid,p_client_ip inet)
returns void language plpgsql security definer set search_path='' as $$
declare
  shopper uuid := auth.uid();
  subject_text text := btrim(p_subject,E' \t\n\r\f');
  message_text text := btrim(p_message,E' \t\n\r\f');
  headers jsonb;
  client_ip text;
  fingerprint bytea;
  at_time timestamptz;
  recent integer;
  same_ip integer;
  ticket_id uuid;
begin
  if coalesce(char_length(subject_text),0) not between 1 and 160 or coalesce(char_length(message_text),0) not between 1 and 4000 then
    raise exception 'invalid_support_message';
  end if;
  if not exists(select from public.stores where id=p_store and status <> 'suspended') then raise exception 'unknown_store'; end if;

  -- Authenticate by the JWT subject only. Anonymous clients share a tenant lock
  -- so changing or omitting the proxy IP can never defeat the store-wide cap.
  perform pg_advisory_xact_lock(hashtextextended('support:' || p_store::text || ':' || coalesce(shopper::text,'anonymous'),0));
  at_time := clock_timestamp();
  delete from support_internal.ticket_rate_limits e using (
    select ev.ticket_id from support_internal.ticket_rate_limits ev
    where ev.created_at < at_time - interval '24 hours'
    order by ev.created_at limit 256 for update skip locked
  ) expired where e.ticket_id=expired.ticket_id;
  if shopper is null then
    if p_client_ip is not null then
      -- Only the service-role Web entry point can provide a verified ingress IP.
      client_ip := host(p_client_ip);
    else
      headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
      client_ip := coalesce(
        nullif(btrim(headers->>'cf-connecting-ip'),''),
        nullif(btrim(headers->>'x-real-ip'),''),
        nullif(btrim(split_part(headers->>'x-forwarded-for',',',1)),''));
      begin
        client_ip := host(client_ip::inet);
      exception when invalid_text_representation then client_ip := null;
      end;
    end if;
    fingerprint := sha256(convert_to(coalesce(client_ip,'unknown'),'UTF8'));
    select count(*),count(*) filter(where ip_hash=fingerprint) into recent,same_ip
      from support_internal.ticket_rate_limits where store_id=p_store and user_id is null and created_at > at_time - interval '15 minutes';
    if recent >= 20 or same_ip >= 5 then raise exception 'rate_limit_exceeded'; end if;
  else
    select count(*) into recent from support_internal.ticket_rate_limits where store_id=p_store
      and user_id=shopper and created_at > at_time - interval '15 minutes';
    if recent >= 5 then raise exception 'rate_limit_exceeded'; end if;
  end if;

  insert into public.support_tickets(store_id,customer_id,order_id,subject,message,priority,is_read,last_message_at)
  values(p_store,shopper,(select o.id from public.orders o where o.id=p_order and o.store_id=p_store and o.user_id=shopper),
    subject_text,message_text,'normal',false,at_time) returning id into ticket_id;
  insert into public.support_ticket_messages(ticket_id,store_id,sender_role,sender_user_id,body)
    values(ticket_id,p_store,'customer',shopper,message_text);
  insert into support_internal.ticket_rate_limits(ticket_id,store_id,user_id,ip_hash,created_at)
    values(ticket_id,p_store,shopper,fingerprint,at_time);
end $$;
revoke all on function support_internal.create_ticket(uuid,text,text,uuid,inet) from public,anon,authenticated;

create or replace function public.mobile_support(p_store uuid,p_subject text,p_message text)
returns void language sql security definer set search_path='' as $$
  select support_internal.create_ticket(p_store,p_subject,p_message,null,null)
$$;
create or replace function public.mobile_support(p_store uuid,p_subject text,p_message text,p_order uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or p_order is null then raise exception 'invalid_support_request'; end if;
  perform support_internal.create_ticket(p_store,p_subject,p_message,p_order,null);
end $$;
revoke all on function public.mobile_support(uuid,text,text),public.mobile_support(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.mobile_support(uuid,text,text) to anon,authenticated;
grant execute on function public.mobile_support(uuid,text,text,uuid) to authenticated;

create or replace function public.web_anonymous_support(p_store uuid,p_subject text,p_message text,p_client_ip inet)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then raise insufficient_privilege; end if;
  perform support_internal.create_ticket(p_store,p_subject,p_message,null,p_client_ip);
end $$;
revoke all on function public.web_anonymous_support(uuid,text,text,inet) from public,anon,authenticated,service_role;
grant execute on function public.web_anonymous_support(uuid,text,text,inet) to service_role;

create or replace function support_internal.lock_merchant_ticket(p_store_id uuid,p_ticket_id uuid)
returns public.support_tickets language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets%rowtype;
begin
  if public.has_store_permission(p_store_id,'manage_customers') is not true then raise insufficient_privilege; end if;
  select * into ticket from public.support_tickets where id=p_ticket_id and store_id=p_store_id for update;
  if not found then raise insufficient_privilege; end if;
  return ticket;
end $$;
revoke all on function support_internal.lock_merchant_ticket(uuid,uuid) from public,anon,authenticated;

create or replace function support_internal.valid_status(previous text,requested text)
returns boolean language sql immutable set search_path='' as $$
  select previous=requested or (previous='open' and requested='in_progress') or (previous='in_progress' and requested='closed')
$$;
revoke all on function support_internal.valid_status(text,text) from public,anon,authenticated;

create or replace function public.admin_support_mark_read(p_store_id uuid,p_ticket_id uuid,p_read boolean)
returns void language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets%rowtype;
begin
  ticket := support_internal.lock_merchant_ticket(p_store_id,p_ticket_id);
  if p_read is null then raise exception 'invalid_read_state'; end if;
  if ticket.is_read <> p_read then
    update public.support_tickets set is_read=p_read,read_at=case when p_read then clock_timestamp() end
    where store_id=p_store_id and id=p_ticket_id;
  end if;
end $$;

create or replace function public.admin_support_update(p_store_id uuid,p_ticket_id uuid,p_priority text default null,p_status text default null)
returns void language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets%rowtype;
begin
  ticket := support_internal.lock_merchant_ticket(p_store_id,p_ticket_id);
  if p_status is not null and not support_internal.valid_status(ticket.status,p_status) then raise exception 'invalid_status_transition'; end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then raise exception 'invalid_priority'; end if;
  update public.support_tickets set priority=coalesce(p_priority,priority),status=coalesce(p_status,status)
    where store_id=p_store_id and id=p_ticket_id;
end $$;

create or replace function public.admin_support_reply(p_store_id uuid,p_ticket_id uuid,p_body text,p_status text default null)
returns void language plpgsql security definer set search_path='' as $$
declare ticket public.support_tickets%rowtype; desired text;
begin
  ticket := support_internal.lock_merchant_ticket(p_store_id,p_ticket_id);
  if ticket.status='closed' then raise exception 'ticket_closed'; end if;
  if coalesce(char_length(btrim(p_body,E' \t\n\r\f')),0) not between 1 and 4000 then raise exception 'invalid_support_message'; end if;
  desired := coalesce(p_status,case when ticket.status='open' then 'in_progress' else ticket.status end);
  if not support_internal.valid_status(ticket.status,desired) then raise exception 'invalid_status_transition'; end if;
  insert into public.support_ticket_messages(ticket_id,store_id,sender_role,sender_user_id,body)
    values(p_ticket_id,p_store_id,'merchant',auth.uid(),p_body);
  update public.support_tickets set status=desired where id=p_ticket_id and store_id=p_store_id;
end $$;

create or replace function public.admin_support_inbox(
  p_store_id uuid,p_filter text default 'all',p_priority text default 'all',p_q text default '',p_page integer default 1,p_page_size integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  needle text := left(lower(btrim(coalesce(p_q,''))),160);
  page_size integer := greatest(1,least(coalesce(p_page_size,20),100));
  result jsonb;
begin
  if public.has_store_permission(p_store_id,'manage_customers') is not true then raise insufficient_privilege; end if;
  if p_filter is null or p_filter not in ('all','unread','open','in_progress','closed')
     or p_priority is null or p_priority not in ('all','low','normal','high','urgent') then raise exception 'invalid_inbox_filter'; end if;
  with filtered as not materialized (
    select t.id,t.subject,t.status,t.priority,t.is_read,t.order_id,t.created_at,t.last_message_at
    from public.support_tickets t where t.store_id=p_store_id
      and (p_filter='all' or (p_filter='unread' and not t.is_read) or t.status=p_filter)
      and (p_priority='all' or t.priority=p_priority)
      and (needle='' or strpos(lower(t.subject),needle)>0 or starts_with(t.order_id::text,needle)
        or exists(select from public.support_ticket_messages m where m.ticket_id=t.id and strpos(lower(m.body),needle)>0))
  ), totals as (
    select count(*) as total_count,least(greatest(1,coalesce(p_page,1)),greatest(1,ceil(count(*)::numeric/page_size))::bigint) as page from filtered
  ), slice as (
    select f.* from filtered f order by f.last_message_at desc,f.id desc limit page_size offset (select (page-1)*page_size from totals)
  )
  select jsonb_build_object('total_count',total_count,'page',page,'page_size',page_size,
    'unread_count',(select count(*) from public.support_tickets t where t.store_id=p_store_id and not t.is_read),
    'rows',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('snippet',(
      select left(m.body,160) from public.support_ticket_messages m where m.ticket_id=s.id order by m.created_at desc,m.id desc limit 1
    )) order by s.last_message_at desc,s.id desc) from slice s),'[]'::jsonb))
    into result from totals;
  return result;
end $$;

create or replace function public.admin_support_detail(p_store_id uuid,p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if public.has_store_permission(p_store_id,'manage_customers') is not true then raise insufficient_privilege; end if;
  return (select jsonb_build_object('id',t.id,'subject',t.subject,'status',t.status,'priority',t.priority,'is_read',t.is_read,
    'read_at',t.read_at,'last_message_at',t.last_message_at,'order_id',t.order_id,'created_at',t.created_at,
    'customer_name',coalesce(nullif(btrim(c.full_name),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),'')),
    'customer_email',coalesce(nullif(c.email,''),u.email),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_role',m.sender_role,'body',m.body,'created_at',m.created_at)
      order by m.created_at,m.id) from public.support_ticket_messages m where m.ticket_id=t.id),'[]'::jsonb))
    from public.support_tickets t left join public.store_customers c on c.store_id=t.store_id and c.user_id=t.customer_id
    left join auth.users u on u.id=t.customer_id where t.store_id=p_store_id and t.id=p_ticket_id);
end $$;

revoke all on function public.admin_support_mark_read(uuid,uuid,boolean),public.admin_support_update(uuid,uuid,text,text),
  public.admin_support_reply(uuid,uuid,text,text),public.admin_support_inbox(uuid,text,text,text,integer,integer),
  public.admin_support_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_support_mark_read(uuid,uuid,boolean),public.admin_support_update(uuid,uuid,text,text),
  public.admin_support_reply(uuid,uuid,text,text),public.admin_support_inbox(uuid,text,text,text,integer,integer),
  public.admin_support_detail(uuid,uuid) to authenticated;

-- Hide only the four live Phase 10C fixture rows. Keep their moderation history.
update public.product_reviews r set status='hidden'
from (values
  ('ad2c8db8-d194-417b-95dd-b1624fd4bbf9'::uuid,'10c00000-0000-4000-8000-000000000001'::uuid),
  ('d0bba946-41a1-4ffb-8852-dce5d6694cf4'::uuid,'10c00000-0000-4000-8000-000000000002'::uuid),
  ('5d4e78c4-32f3-4dba-8b95-88a82a60cd51'::uuid,'10c00000-0000-4000-8000-000000000003'::uuid),
  ('fb8afb21-abdf-4b09-b355-654b24d28801'::uuid,'10c00000-0000-4000-8000-000000000004'::uuid)
) seed(review_id,user_id)
where r.id=seed.review_id and r.user_id=seed.user_id
  and r.store_id='00000000-0000-0000-0000-000000000001' and r.order_id is null and r.status='published';

notify pgrst, 'reload schema';

commit;
