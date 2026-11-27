begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '5s';

do $order_directory$
declare
  tenant uuid := gen_random_uuid(); merchant uuid := gen_random_uuid(); buyer uuid := gen_random_uuid();
  customer uuid := gen_random_uuid(); another_customer uuid := gen_random_uuid();
  first_order uuid := gen_random_uuid(); last_order uuid := gen_random_uuid();
  result jsonb;
begin
  insert into auth.users(id,email) select id,id::text||'@example.invalid' from unnest(array[merchant,buyer]) id;
  insert into public.stores(id,slug,name_ar,owner_user_id) values(tenant,'ops-'||left(tenant::text,12),'Orders QA',merchant);
  insert into public.store_members(store_id,user_id,role) values(tenant,merchant,'owner');
  insert into public.store_customers(id,store_id,user_id,full_name) values(customer,tenant,buyer,'Local % Customer'),
    (another_customer,'00000000-0000-0000-0000-000000000001',buyer,'Off-tenant name');
  insert into public.orders(id,store_id,customer_id,user_id,recipient_name,phone,created_at,status,payment_status,payment_review,
    shipping_address,currency,subtotal,shipping_fee,discount_amount,coupon_code,wallet_discount)
  values (first_order,tenant,customer,buyer,null,null,'2024-02-29 00:00:00Z','confirmed','paid',null,
    'Test address','EGP',80,0,20,'B4SAVE',10),
    (last_order,tenant,null,buyer,'Named recipient','020240229','2024-02-29 23:59:59.999999Z','pending','unpaid','paid_cancellation',
    'Test address','EGP',null,10,0,null,0),
    (gen_random_uuid(),tenant,null,null,'Midnight',null,'2024-03-01 00:00:00Z','pending','unpaid',null,
    'Test address','EGP',0,0,100,'B4FREE',0);
  insert into public.order_items(order_id,product_name,unit_price,quantity) values(first_order,'Known price',50,2),
    (last_order,'Legacy price',3.25,2);
  if (select total from public.orders where id=first_order) is distinct from 70 or
     (select sum(unit_price*quantity) from public.order_items where order_id=last_order) is distinct from 6.50 or
     (select total from public.orders where store_id=tenant and coupon_code='B4FREE') is distinct from 0 then
    raise exception 'Recorded net subtotal, wallet, legacy lines or fully discounted total mismatch';
  end if;
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  set local role authenticated;
  result := public.merchant_order_directory(tenant,'local % customer',null,null,null,null,'2024-02-29','2024-02-29',1,24);
  if (result->>'total_count')::int <> 2 or result#>>'{rows,0,id}' <> last_order::text
    or result#>>'{rows,0,customer_name}' <> 'Named recipient' or result#>>'{rows,1,customer_name}' <> 'Local % Customer'
    or (result#>>'{rows,1,quantity}')::int <> 2 then raise exception 'Customer lookup, ordering, totals or UTC boundaries failed'; end if;
  result := public.merchant_order_directory(tenant,null,null,null,null,null,'2024-02-29','2024-02-29',1,24);
  if (result->>'total_count')::int <> 2 then raise exception 'Inclusive/exclusive calendar boundaries failed'; end if;
  result := public.merchant_order_directory(tenant,'off-tenant name',null,null,null,null,null,null,1,24);
  if (result->>'total_count')::int <> 0 then raise exception 'Off-tenant customer name matched'; end if;
  result := public.merchant_order_directory(tenant,'#id',first_order,first_order,'confirmed','paid',null,null,1,24);
  if (result->>'total_count')::int <> 1 or result#>>'{rows,0,id}' <> first_order::text then raise exception 'ID bounds/status/payment failed'; end if;
  result := public.merchant_order_directory(tenant,'0229',null,null,null,'review',null,null,1,24);
  if (result->>'total_count')::int <> 1 or result#>>'{rows,0,id}' <> last_order::text then raise exception 'Phone/payment review filter failed'; end if;
  result := public.merchant_order_directory(tenant,'Named recipient',null,null,null,'paid',null,null,1,24);
  if (result->>'total_count')::int <> 0 then raise exception 'Payment filter ignored'; end if;
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  begin
    perform public.merchant_order_directory(tenant,null,null,null,null,null,null,null,1,24);
    raise exception 'Order directory should require manage_orders';
  exception when insufficient_privilege then null;
  end;
  reset role;
end $order_directory$;

-- Isolate the 205 pagination fixtures with a unique search term. The comparison KPIs still cover the entire tenant.
reset role;
create temporary table batch4_reviews_case on commit drop as
select s.id as store_id, (select p.id from public.products p where p.store_id = s.id order by p.id limit 1) as product_id,
       gen_random_uuid() as merchant_id, 'ops04-' || gen_random_uuid()::text as marker,
       baseline.*
from public.stores s
cross join lateral (
  select count(*) as total, count(*) filter (where r.status = 'published') as published,
         coalesce(sum(r.rating) filter (where r.status = 'published'), 0) as rating_sum,
         count(*) filter (where r.status = 'hidden') as hidden,
         count(*) filter (where r.status = 'published' and (nullif(btrim(r.admin_reply), '') is null or
           (exists (select 1 from public.review_replies t where t.store_id = s.id and t.review_id = r.id and t.role = 'customer')
            and not exists (select 1 from public.review_replies t where t.store_id = s.id and t.review_id = r.id and t.role = 'merchant')))) as waiting
  from public.product_reviews r where r.store_id = s.id
) baseline
where s.slug = 'nova-store';
insert into auth.users (id, email, email_confirmed_at)
select merchant_id, merchant_id::text || '@example.invalid', now() from batch4_reviews_case;
insert into public.store_members (store_id, user_id, role, permissions)
select store_id, merchant_id, 'catalog', '{"manage_products":true}'::jsonb from batch4_reviews_case;
insert into public.product_reviews (store_id, product_id, user_id, author_name, rating, status, admin_reply, comment, created_at)
select c.store_id, c.product_id, gen_random_uuid(), 'Review ' || n, case when n % 5 = 0 then 1 else 4 end,
       case when n % 5 = 0 then 'hidden' else 'published' end, case when n % 2 = 0 then 'Thank you' end,
       c.marker, timestamptz '2000-01-01' + ((206 - n) * interval '1 second')
from batch4_reviews_case c cross join generate_series(1, 205) n;
grant select on batch4_reviews_case to authenticated;
set local role authenticated;
do $$
declare
  c record;
  d jsonb;
begin
  select * into strict c from batch4_reviews_case;
  perform set_config('request.jwt.claim.sub', c.merchant_id::text, true);
  d := public.merchant_review_directory(c.store_id, 'all', c.marker, null, 11, 20);
  if (d->>'total')::bigint <> c.total + 205 or (d->>'published_count')::bigint <> c.published + 164
    or (d->>'hidden_count')::bigint <> c.hidden + 41 or (d->>'needs_reply_count')::bigint <> c.waiting + 82
    or abs((d->>'avg_rating')::numeric - (c.rating_sum + 4 * 164)::numeric / (c.published + 164)) > 0.00000001
    then raise exception 'OPS-04 incorrect store-wide aggregates'; end if;
  if (d->>'page')::int <> 11 or (d->>'total_count')::int <> 205 or jsonb_array_length(d->'rows') <> 5
    or d#>>'{rows,0,author_name}' is distinct from 'Review 201' or d#>>'{rows,4,author_name}' is distinct from 'Review 205'
    or d#>>'{rows,4,product_id}' is distinct from c.product_id::text then raise exception 'OPS-04 page 11 missing expected reviews'; end if;
  d := public.merchant_review_directory(c.store_id, 'needs_reply', c.marker, 4, 1, 20);
  if (d->>'total_count')::int <> 82 or (d->>'total')::int <> c.total + 205 then raise exception 'OPS-04 reply filter'; end if;
  d := public.merchant_review_directory(c.store_id, 'hidden', c.marker, 1, 9999, 20);
  if (d->>'total_count')::int <> 41 or (d->>'page')::int <> 3 or jsonb_array_length(d->'rows') <> 1
    or d#>>'{rows,0,author_name}' is distinct from 'Review 205' then raise exception 'OPS-04 last hidden page'; end if;
  d := public.merchant_review_directory(c.store_id, 'hidden', c.marker, 5, 9999, 20);
  if (d->>'total_count')::int <> 0 or (d->>'page')::int <> 1 or jsonb_array_length(d->'rows') <> 0 then
    raise exception 'OPS-04 empty filtered directory'; end if;
  begin
    perform public.merchant_review_directory('b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c'::uuid);
    raise exception 'OPS-04 permitted cross-store access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;


-- Use disposable tenants so these rolled-back bursts do not depend on real customers' quota use.
reset role;
create temporary table b4_support_case as select gen_random_uuid() as tenant,gen_random_uuid() as other_tenant,
  gen_random_uuid() as shopper,gen_random_uuid() as merchant,gen_random_uuid() as outsider;
grant select on b4_support_case to anon,authenticated,service_role;
insert into public.stores(id,slug,name_ar) select u,'b4-support-'||left(u::text,8),'Support QA'
  from b4_support_case c cross join lateral (values(c.tenant),(c.other_tenant)) v(u);
insert into auth.users(id,email,email_confirmed_at) select u,u::text||'@example.invalid',now()
  from b4_support_case c cross join lateral (values(c.shopper),(c.merchant),(c.outsider)) v(u);
insert into public.store_members(store_id,user_id,role,permissions) select tenant,merchant,'custom','{"manage_customers":true}'::jsonb from b4_support_case;
insert into public.store_members(store_id,user_id,role,permissions) select other_tenant,outsider,'custom','{"manage_customers":true}'::jsonb from b4_support_case;

set local role anon;
do $guest$
declare
  c b4_support_case%rowtype;
  ip_no integer;
  n integer;
begin
  select * into strict c from b4_support_case;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  begin
    insert into public.support_tickets(store_id,subject,message) values(c.tenant,'Guest','Denied');
    raise exception 'direct anonymous insert unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mobile_support(c.tenant,repeat('s',161),'x');
    raise exception 'oversize subject accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_support_message' then raise; end if; end;
  begin
    perform public.mobile_support(c.tenant,'x',repeat('m',4001));
    raise exception 'oversize message accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_support_message' then raise; end if; end;
  begin
    perform public.mobile_support(c.tenant,E'\t\n',null);
    raise exception 'blank support accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_support_message' then raise; end if; end;

  for ip_no in 1..4 loop
    perform set_config('request.headers',jsonb_build_object('x-real-ip','192.0.2.'||ip_no)::text,true);
    for n in 1..5 loop perform public.mobile_support(c.tenant,'QA guest','Anonymous contract'); end loop;
    begin
      perform public.mobile_support(c.tenant,'QA quota','Sixth guest ticket');
      raise exception 'anonymous caller quota missing';
    exception when raise_exception then if sqlerrm <> 'rate_limit_exceeded' then raise; end if; end;
  end loop;
  perform set_config('request.headers','{"x-real-ip":"192.0.2.99"}',true);
  begin
    perform public.mobile_support(c.tenant,'QA quota','Twenty-first guest ticket');
    raise exception 'anonymous store quota missing';
  exception when raise_exception then if sqlerrm <> 'rate_limit_exceeded' then raise; end if; end;
  perform public.mobile_support(c.other_tenant,'Independent tenant','Separate quota');
  if has_schema_privilege('anon','support_internal','USAGE') or has_table_privilege('anon','public.support_ticket_messages','SELECT') then
    raise exception 'anonymous support privileges too broad';
  end if;
  if has_function_privilege('anon','public.web_anonymous_support(uuid,text,text,inet)','EXECUTE')
    or has_function_privilege('authenticated','public.web_anonymous_support(uuid,text,text,inet)','EXECUTE')
    then raise exception 'trusted support ingress exposed'; end if;
end
$guest$;

set local role service_role;
do $web$
declare c b4_support_case%rowtype; n integer;
begin
  select * into strict c from b4_support_case;
  perform set_config('request.headers','{"x-real-ip":"198.51.100.20"}',true);
  -- Previous mobile quota admission for 192.0.2.99 also counts on the Web.
  for n in 1..4 loop
    perform public.web_anonymous_support(c.other_tenant,'Trusted web','Shared IP quota','192.0.2.99');
  end loop;
  begin
    perform public.web_anonymous_support(c.other_tenant,'Trusted web','Shared limit','192.0.2.99');
    raise exception 'web and mobile limits diverged';
  exception when raise_exception then if sqlerrm <> 'rate_limit_exceeded' then raise; end if; end;
  perform public.web_anonymous_support(c.other_tenant,'Trusted web','Different browser','192.0.2.100');
end $web$;

set local role authenticated;
do $shopper$
declare c b4_support_case%rowtype; n integer;
begin
  select * into strict c from b4_support_case;
  perform set_config('request.jwt.claim.sub',c.shopper::text,true);
  begin
    insert into public.support_tickets(store_id,subject,message) values(c.tenant,'Member','Denied');
    raise exception 'direct authenticated insert unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  perform public.mobile_support(c.tenant,'QA thread','Original message');
  -- Both existing Android overloads draw from the same rolling user quota.
  for n in 1..4 loop perform public.mobile_support(c.tenant,'QA order support','Message',gen_random_uuid()); end loop;
  begin
    perform public.mobile_support(c.tenant,'QA quota','Sixth shopper ticket',gen_random_uuid());
    raise exception 'authenticated quota missing';
  exception when raise_exception then if sqlerrm <> 'rate_limit_exceeded' then raise; end if; end;
  if has_schema_privilege('authenticated','support_internal','USAGE') then raise exception 'private support schema exposed'; end if;
end
$shopper$;

reset role;
create temporary table b4_thread as select t.id from public.support_tickets t join b4_support_case c on t.store_id=c.tenant
  where t.customer_id=c.shopper and t.subject='QA thread';
grant select on b4_thread to authenticated;
do $stored$
declare c b4_support_case%rowtype; thread uuid; n integer;
begin
  select * into strict c from b4_support_case;
  select id into strict thread from b4_thread;
  if (select count(*) from support_internal.ticket_rate_limits where store_id=c.tenant) <> 25 then raise exception 'rate event count incorrect'; end if;
  select count(*) into n from public.support_tickets t join public.support_ticket_messages m on m.ticket_id=t.id
    where t.store_id=c.tenant and m.store_id=c.tenant and t.priority='normal' and not t.is_read and t.read_at is null
    and m.body=t.message and m.sender_role='customer' and t.last_message_at=m.created_at;
  if n <> 25 then raise exception 'initial threads or legacy metadata incorrect'; end if;
  begin
    update public.support_tickets set admin_reply=repeat('x',4001) where id=thread;
    raise exception 'oversize legacy admin reply accepted';
  exception when check_violation then null; end;
end
$stored$;

set local role authenticated;
do $actions$
declare c b4_support_case%rowtype; thread uuid; detail jsonb; inbox jsonb;
begin
  select * into strict c from b4_support_case;
  select id into strict thread from b4_thread;
  perform set_config('request.jwt.claim.sub',c.outsider::text,true);
  if exists(select from public.support_ticket_messages where ticket_id=thread) then raise exception 'foreign staff can see thread'; end if;
  begin
    perform public.admin_support_mark_read(c.tenant,thread,true);
    raise exception 'foreign staff changed ticket';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body) values(c.tenant,thread,'merchant','Denied');
    raise exception 'foreign merchant posted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_support_reply(c.other_tenant,thread,'Wrong pairing');
    raise exception 'foreign ticket accepted with own tenant';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_support_inbox(c.tenant);
    raise exception 'foreign inbox returned';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body) values(c.tenant,thread,'customer','Denied');
    raise exception 'foreign customer posted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',c.merchant::text,true);
  perform public.admin_support_mark_read(c.tenant,thread,true);
  detail := public.admin_support_detail(c.tenant,thread);
  if not (detail->>'is_read')::boolean or detail->>'read_at' is null or detail->>'customer_email' <> c.shopper::text||'@example.invalid'
    then raise exception 'read state/customer not projected'; end if;
  perform public.admin_support_mark_read(c.tenant,thread,false);
  perform public.admin_support_update(c.tenant,thread,'high');
  inbox := public.admin_support_inbox(c.tenant,'unread','high','Original message',1,1);
  if (inbox->>'total_count')::integer <> 1 or (inbox->>'unread_count')::integer <> 25
    or inbox#>>'{rows,0,id}' <> thread::text or inbox#>>'{rows,0,snippet}' <> 'Original message'
    then raise exception 'unread inbox filters incorrect'; end if;
  begin
    perform public.admin_support_update(c.tenant,thread,null,'closed');
    raise exception 'invalid open→closed transition accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_status_transition' then raise; end if; end;
  begin
    perform public.admin_support_update(c.tenant,thread,'invalid');
    raise exception 'invalid ticket priority accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_priority' then raise; end if; end;
  perform public.admin_support_reply(c.tenant,thread,'First merchant reply');
  if not exists(select from public.support_tickets where id=thread and is_read and status='in_progress' and admin_reply='First merchant reply') then
    raise exception 'merchant reply did not synchronize legacy summary'; end if;

  perform set_config('request.jwt.claim.sub',c.shopper::text,true);
  if (select count(*) from public.support_ticket_messages where ticket_id=thread) <> 2 then raise exception 'customer cannot see own open thread'; end if;
  insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body) values(c.tenant,thread,'customer','Follow-up');
  begin
    insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body) values(c.tenant,thread,'merchant','Denied');
    raise exception 'shopper could impersonate merchant';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub',c.merchant::text,true);
  detail := public.admin_support_detail(c.tenant,thread);
  if (detail->>'is_read')::boolean or detail->>'read_at' is not null or detail#>>'{messages,2,body}' <> 'Follow-up' then
    raise exception 'customer follow-up did not reopen unread state'; end if;
  perform public.admin_support_reply(c.tenant,thread,'Resolved','closed');
  detail := public.admin_support_detail(c.tenant,thread);
  if detail->>'status' <> 'closed' or jsonb_array_length(detail->'messages') <> 4 or detail#>>'{messages,3,sender_role}' <> 'merchant'
    or detail->>'last_message_at' <> detail#>>'{messages,3,created_at}' then raise exception 'closed thread incorrect'; end if;
  if not exists(select from public.support_tickets where id=thread and admin_reply='Resolved') then raise exception 'legacy latest reply incorrect'; end if;
  begin
    insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body) values(c.tenant,thread,'merchant','Denied');
    raise exception 'closed ticket accepted direct merchant reply';
  exception when insufficient_privilege then null; end;
  insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body)
    select c.tenant,t.id,'merchant','Direct staff reply' from public.support_tickets t
    where t.store_id=c.tenant and t.customer_id=c.shopper and t.subject='QA order support' order by t.id limit 1;
  if not exists(select from public.support_tickets where store_id=c.tenant and admin_reply='Direct staff reply' and is_read)
    then raise exception 'direct merchant thread insert did not synchronize legacy state'; end if;
  perform set_config('request.jwt.claim.sub',c.shopper::text,true);
  begin
    insert into public.support_ticket_messages(store_id,ticket_id,sender_role,body) values(c.tenant,thread,'customer','Denied');
    raise exception 'closed ticket accepted customer reply';
  exception when insufficient_privilege then null; end;
end
$actions$;
reset role;

do $expiry$
declare c b4_support_case%rowtype; thread uuid;
begin
  select * into strict c from b4_support_case;
  select id into strict thread from b4_thread;
  delete from public.support_tickets where store_id=c.tenant and id=thread;
  if exists(select from public.support_ticket_messages where ticket_id=thread) or not exists(
    select from support_internal.ticket_rate_limits where ticket_id=thread
  ) then raise exception 'ticket deletion must remove messages and retain active admission'; end if;
  update support_internal.ticket_rate_limits set created_at=clock_timestamp()-interval '25 hours' where ticket_id=thread;
  perform set_config('request.jwt.claim.sub',c.shopper::text,true);
  perform public.mobile_support(c.tenant,'After expiry','Quota recovered');
  if exists(select from support_internal.ticket_rate_limits where ticket_id=thread) then raise exception 'expired admission did not prune'; end if;
end $expiry$;

rollback;
