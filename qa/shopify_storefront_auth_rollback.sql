begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '5s';

do $contracts$
declare
  nova constant uuid := '00000000-0000-0000-0000-000000000001';
  omar constant uuid := 'b3c5f5d9-1e15-40c8-9057-bcadbbbdfb1c';
  empty_membership constant jsonb := '{"enrolled":false,"full_name":"","phone":""}';
  shopper uuid := gen_random_uuid();
  other_buyer uuid := gen_random_uuid();
  unconfirmed uuid := gen_random_uuid();
  oauth_session uuid := gen_random_uuid();
  unverified_session uuid := gen_random_uuid();
  address text := shopper::text || '@example.invalid';
  guest_a uuid := gen_random_uuid();
  guest_b uuid := gen_random_uuid();
  order_a uuid := gen_random_uuid();
  order_b uuid := gen_random_uuid();
  ticket_a uuid := gen_random_uuid();
  ticket_b uuid := gen_random_uuid();
  review_order uuid := gen_random_uuid();
  reviewed_product uuid;
  local_phone text;
  first_enrollment timestamptz;
begin
  assert exists(select from public.stores where id = nova and slug = 'nova-store')
     and exists(select from public.stores where id = omar and slug = 'omar-a7a'), 'store mapping';
  assert not has_function_privilege('anon','public.store_customer_membership(uuid)','execute')
     and not has_function_privilege('anon','public.complete_store_customer_onboarding(uuid,text,text)','execute'), 'anon grants';

  insert into auth.users(id,email,email_confirmed_at)
    values (shopper,address,now()), (other_buyer,other_buyer::text||'@example.invalid',now()),
           (unconfirmed,unconfirmed::text||'@example.invalid',null);
  insert into auth.identities(provider_id,user_id,provider,identity_data)
    values (shopper::text,shopper,'google',jsonb_build_object('sub',shopper,'email',upper(address),'email_verified',true)),
           (other_buyer::text,other_buyer,'google',jsonb_build_object('sub',other_buyer,
              'email',other_buyer::text||'@example.invalid','email_verified',false));
  insert into auth.sessions(id,user_id,created_at,updated_at)
    values (oauth_session,shopper,now(),now()), (unverified_session,other_buyer,now(),now());
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at)
    values (gen_random_uuid(),oauth_session,'oauth',now(),now()), (gen_random_uuid(),unverified_session,'oauth',now(),now());
  assert customer_auth.mailbox_verified(shopper,address), 'verified matching Google mailbox';
  assert not customer_auth.mailbox_verified(other_buyer,other_buyer::text||'@example.invalid'), 'unverified Google mailbox';
  update auth.identities set identity_data = identity_data || jsonb_build_object('email_verified',true,'email',address)
    where user_id = other_buyer and provider = 'google';
  update auth.mfa_amr_claims set authentication_method = 'oauth' where session_id = unverified_session;
  assert not customer_auth.mailbox_verified(other_buyer,other_buyer::text||'@example.invalid'), 'mismatched Google address';

  -- Both guest orders have the same verified email. Only one store can be claimed per submission.
  insert into public.store_customers(id,store_id,email,full_name)
    values(guest_a,nova,upper(address),'Nova delivery'),(guest_b,omar,address,'Omar delivery');
  insert into public.orders(id,store_id,customer_id,status,shipping_address,currency,subtotal,shipping_fee)
    values(order_a,nova,guest_a,'pending','QA','EGP',1,0),(order_b,omar,guest_b,'pending','QA','EGP',1,0);

  -- Pick an unused number in both stores without relying on a reserved production number.
  loop
    local_phone := '010' || lpad(floor(random() * 100000000)::integer::text, 8, '0');
    exit when not exists(select from public.store_customers where store_id in (nova,omar)
      and phone in (local_phone, '20' || substr(local_phone,2)));
  end loop;
  perform set_config('request.jwt.claim.sub',shopper::text,true);
  set local role authenticated;
  assert public.store_customer_membership(nova) = empty_membership, 'first visit';
  assert public.complete_store_customer_onboarding(nova,'  Nova shopper  ','+20 '||substr(local_phone,2)) = 'ready', 'Nova signup';
  assert public.store_customer_membership(nova) = jsonb_build_object('enrolled',true,'full_name','Nova shopper','phone',local_phone), 'Nova profile';
  assert public.store_customer_membership(omar) = empty_membership, 'private storefront membership';
  reset role;
  assert exists(select from public.orders where id = order_a and user_id = shopper), 'claimed Nova guest order';
  assert exists(select from public.orders where id = order_b and user_id is null), 'Omar guest order untouched';
  select enrolled_at into strict first_enrollment from public.store_customers where store_id = nova and user_id = shopper;

  set local role authenticated;
  begin
    perform public.complete_store_customer_onboarding(omar,' ', '');
    raise exception 'empty name accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_name' then raise; end if; end;
  begin
    perform public.complete_store_customer_onboarding(omar,'Omar shopper','not a number');
    raise exception 'invalid phone accepted';
  exception when raise_exception then if sqlerrm <> 'invalid_phone' then raise; end if; end;
  assert public.complete_store_customer_onboarding(omar,'Omar shopper','') = 'ready', 'optional phone';
  assert public.store_customer_membership(omar) = '{"enrolled":true,"full_name":"Omar shopper","phone":""}'::jsonb, 'Omar profile';
  assert public.store_customer_membership(nova)->>'full_name' = 'Nova shopper', 'preserved Nova identity';
  perform public.complete_store_customer_onboarding(omar,'Omar shopper',local_phone);
  perform set_config('request.jwt.claim.sub',other_buyer::text,true);
  begin
    perform public.complete_store_customer_onboarding(omar,'Other buyer',local_phone);
    raise exception 'duplicate phone accepted';
  exception when raise_exception then if sqlerrm <> 'phone_already_in_use' then raise; end if; end;
  assert public.store_customer_membership(omar) = empty_membership, 'collision rolled back enrollment';
  perform set_config('request.jwt.claim.sub',unconfirmed::text,true);
  begin
    perform public.complete_store_customer_onboarding(omar,'Unconfirmed buyer','');
    raise exception 'unconfirmed mailbox accepted';
  exception when raise_exception then if sqlerrm <> 'unconfirmed' then raise; end if; end;
  reset role;
  assert exists(select from public.orders where id = order_b and user_id = shopper), 'claimed Omar guest order';
  assert exists(select from public.store_customers where store_id = nova and user_id = shopper and enrolled_at = first_enrollment), 'Nova timestamp preserved';

  insert into public.support_tickets(id,store_id,customer_id,subject,message)
    values(ticket_a,nova,shopper,'Delivery','Question'),(ticket_b,omar,other_buyer,'Delivery','Private');
  insert into public.support_ticket_messages(ticket_id,store_id,sender_role,sender_user_id,body)
    values(ticket_a,nova,'customer',shopper,'Question'),(ticket_a,nova,'merchant',null,'Received'),
          (ticket_b,omar,'customer',other_buyer,'Private');
  update public.support_tickets set status = 'closed' where id in (ticket_a,ticket_b);
  perform set_config('request.jwt.claim.sub',shopper::text,true);
  set local role authenticated;
  assert (select array_agg(body order by created_at,id) from public.support_ticket_messages where ticket_id = ticket_a)
    = array['Question','Received'], 'closed ticket history';
  assert not exists(select from public.support_ticket_messages where ticket_id = ticket_b), 'other tenant ticket hidden';
  begin
    insert into public.support_ticket_messages(ticket_id,store_id,sender_role,body) values(ticket_a,nova,'customer','Follow-up');
    raise exception 'closed ticket accepted customer message';
  exception when sqlstate '42501' then null; end;
  reset role;

  -- This shopper has a name from the signup store and no Omar CRM entry.
  -- Exercise both merchant-facing and public display names before and after enrollment.
  update auth.users set raw_user_meta_data = jsonb_build_object('full_name','Legacy Nova name','signup_store_id',nova)
    where id = other_buyer;
  insert into public.store_members(store_id,user_id,role,permissions)
    values(omar,unconfirmed,'custom','{"manage_customers":true}');
  select id into strict reviewed_product from public.products where store_id = omar order by id limit 1;
  insert into public.orders(id,store_id,user_id,status,shipping_address,currency,subtotal,shipping_fee)
    values(review_order,omar,other_buyer,'delivered','QA','EGP',1,0);
  insert into public.order_items(order_id,product_id,product_name,unit_price,quantity)
    values(review_order,reviewed_product,'QA review',1,1);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',unconfirmed::text,true);
  assert (public.admin_support_detail(omar,ticket_b)->>'customer_name') is null, 'support used a global signup name';
  perform set_config('request.jwt.claim.sub',other_buyer::text,true);
  assert public.submit_product_review(omar,reviewed_product,5::smallint,'First review')->>'author_name'
    = 'Verified Buyer', 'public review disclosed global identity';
  perform public.complete_store_customer_onboarding(omar,'Local Omar name','');
  assert public.submit_product_review(omar,reviewed_product,4::smallint,'Updated review')->>'author_name'
    = 'Local Omar name', 'public review lost local identity';
  perform set_config('request.jwt.claim.sub',unconfirmed::text,true);
  assert public.admin_support_detail(omar,ticket_b)->>'customer_name' = 'Local Omar name', 'support lost local identity';
  reset role;
end $contracts$;

rollback;
select 'Storefront authentication, enrollment and closed thread contracts rolled back' as verified;
