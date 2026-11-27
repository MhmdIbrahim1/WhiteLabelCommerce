-- Exercises the public contracts with fresh identities, including their actual database roles.
begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '8s';

do $contract$
declare
  tenant uuid := gen_random_uuid();
  merchant uuid := gen_random_uuid();
  reviewer uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  manual_key text := gen_random_uuid()::text;
  online_key text := gen_random_uuid()::text;
  invoice uuid;
  attempt uuid;
  result jsonb;
  sub_before jsonb;
  sub_after jsonb;
  cents integer;
  expected integer;
  change_at timestamptz;
  denied boolean;
  provider_order text := floor(random() * 1000000000000 + 1000000000000)::bigint::text;
  tx text := floor(random() * 1000000000000 + 2000000000000)::bigint::text;
begin
  insert into auth.users(id,email) select u, u::text || '@example.invalid' from unnest(array[merchant,reviewer,outsider]) u;
  insert into public.stores(id,slug,name_ar,owner_user_id) values(tenant,'billing-'||left(tenant::text,8),'QA',merchant);
  insert into public.store_members(store_id,user_id,role) values(tenant,merchant,'owner');
  insert into public.platform_admins(user_id) values(reviewer);
  update public.platform_billing_settings set manual_transfer_enabled=true, instapay_handle='billing-test@invalid',
    paymob_enabled=true,paymob_card_enabled=true where id=1;
  select annual_price_egp into strict expected from public.saas_plans where code='business';
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  set local role authenticated;
  perform public.billing_start_trial(tenant,'pro','monthly');
  result := public.get_store_billing(tenant);
  assert result->>'status'='trialing' and (result->>'trial_used_at')::timestamptz is not null;
  assert (result->>'can_start_trial')::boolean=false and result->'plan'->>'code'='pro';
  assert (result->>'trial_ends_at')::timestamptz - (result->>'trial_used_at')::timestamptz =
    (select make_interval(days=>trial_days) from public.saas_plans where code='pro');
  denied := false;
  begin perform public.billing_start_trial(tenant,'business','monthly'); exception when others then denied := true; end;
  assert denied, 'second trial accepted';
  perform public.billing_schedule_plan_change(tenant,'starter','monthly');
  select current_period_end into strict change_at from public.store_subscriptions where store_id=tenant;
  assert (select scheduled_plan_code='starter' and scheduled_billing_cycle='monthly' and scheduled_effective_at=change_at
          from public.store_subscriptions where store_id=tenant);
  perform public.billing_cancel_scheduled_change(tenant);
  assert (select scheduled_plan_code is null and scheduled_billing_cycle is null and scheduled_effective_at is null
          from public.store_subscriptions where store_id=tenant);

  begin
    perform public.billing_submit_manual_upgrade(tenant,'business','annual','instapay','stale-price',null,null,null,manual_key,expected-1);
    assert false, 'stale manual quote accepted';
  exception when sqlstate 'PT409' then assert sqlerrm='billing_price_changed'; end;
  invoice := public.billing_submit_manual_upgrade(tenant,'business','annual','instapay','contract-reference','sender',null,null,manual_key,expected);
  assert public.billing_submit_manual_upgrade(tenant,'business','annual','instapay','contract-reference','sender',null,null,manual_key)=invoice;
  assert (select amount_egp=expected and currency='EGP' and status='awaiting_review' from public.subscription_invoices where id=invoice);
  denied := false;
  begin perform public.billing_submit_manual_upgrade(tenant,'business','annual','instapay','second-ref',null,null,null,gen_random_uuid()::text);
  exception when others then denied := true; end;
  assert denied, 'duplicate open manual request accepted';
  begin perform public.billing_review_manual_upgrade(invoice,'approve',null); assert false, 'merchant reviewed own request';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  assert not exists(select from public.subscription_invoices where id=invoice);
  begin perform public.billing_cancel_manual_upgrade(tenant,invoice); assert false, 'other buyer cancelled request';
  exception when insufficient_privilege then null; end;
  begin perform public.billing_submit_manual_upgrade(tenant,'business','annual','instapay','wrong-tenant',null,null,null,gen_random_uuid()::text);
    assert false, 'other buyer submitted request'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  sub_before := to_jsonb(public.billing_admin_subscription(tenant));
  denied := false;
  begin perform public.billing_review_manual_upgrade(invoice,'reject','  '); exception when others then denied := true; end;
  assert denied, 'empty rejection reason accepted';
  perform public.billing_review_manual_upgrade(invoice,'reject','Unmatched reference');
  assert to_jsonb(public.billing_admin_subscription(tenant))=sub_before;
  assert (select status='rejected' and review_note='Unmatched reference' and reviewed_by=reviewer from public.subscription_invoices where id=invoice);
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  invoice := public.billing_submit_manual_upgrade(tenant,'business','annual','instapay','approved-reference',null,null,null,gen_random_uuid()::text);
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  perform public.billing_review_manual_upgrade(invoice,'approve',null);
  assert (select status='paid' and paid_at is not null and reviewed_by=reviewer from public.subscription_invoices where id=invoice);
  sub_after := to_jsonb(public.billing_admin_subscription(tenant));
  assert sub_after->>'status'='active' and sub_after->>'plan_code'='business' and sub_after->>'billing_cycle'='annual'
    and sub_after->>'trial_ends_at' is null and sub_after->>'trial_used_at' is not null
    and (sub_after->>'current_period_end')::timestamptz=(sub_after->>'current_period_start')::timestamptz+interval '1 year';

  -- Make the downgrade due, then verify a billing read actually applies it exactly once.
  perform set_config('request.jwt.claim.sub',merchant::text,true);
  perform public.billing_schedule_plan_change(tenant,'starter','monthly');
  reset role;
  update public.store_subscriptions set scheduled_effective_at=now()-interval '1 second' where store_id=tenant;
  set local role authenticated;
  result := public.get_store_billing(tenant);
  assert result->'plan'->>'code'='starter' and result->>'scheduled_plan_code' is null;
  assert (select plan_code='starter' and status='active' from public.store_subscriptions where store_id=tenant);
  begin perform public.reserve_subscription_paymob(tenant,merchant,'pro','monthly','paymob_card',online_key);
    assert false, 'service-role operation available to merchant'; exception when insufficient_privilege then null; end;
  select monthly_price_egp into strict expected from public.saas_plans where code='pro';
  reset role;
  set local role service_role;
  begin
    perform public.reserve_subscription_paymob(tenant,merchant,'pro','monthly','paymob_card',online_key,expected-1);
    assert false, 'stale card quote accepted';
  exception when sqlstate 'PT409' then assert sqlerrm='billing_price_changed'; end;
  result := public.reserve_subscription_paymob(tenant,merchant,'pro','monthly','paymob_card',online_key);
  attempt := (result->>'attempt_id')::uuid; invoice := (result->>'invoice_id')::uuid; cents := (result->>'amount_cents')::integer;
  assert attempt is not null and invoice is not null;
  assert cents=expected*100;
  result := public.reserve_subscription_paymob(tenant,merchant,'pro','monthly','paymob_card',online_key);
  assert (result->>'attempt_id')::uuid=attempt and (result->>'invoice_id')::uuid=invoice;
  perform public.bind_subscription_paymob(attempt,provider_order);
  assert (select paymob_order_id=provider_order from public.subscription_payment_attempts where id=attempt);
  assert (select paymob_order_id=provider_order from public.subscription_invoices where id=invoice);
  denied := false;
  begin perform public.reconcile_subscription_paymob(provider_order,tx,cents+1,'EGP',true,false,false,false,'{}');
  exception when others then denied := true; end;
  assert denied, 'wrong amount accepted';
  denied := false;
  begin perform public.reconcile_subscription_paymob(provider_order,tx,cents,'USD',true,false,false,false,'{}');
  exception when others then denied := true; end;
  assert denied, 'wrong currency accepted';
  perform public.reconcile_subscription_paymob(provider_order,tx,cents,'EGP',false,true,false,false,'{}');
  assert (select status='pending' from public.subscription_payment_attempts where id=attempt);
  perform public.reconcile_subscription_paymob(provider_order,tx,cents,'EGP',true,false,false,false,'{}');
  reset role;
  select to_jsonb(s) into strict sub_before from public.store_subscriptions s where store_id=tenant;
  assert sub_before->>'status'='active' and sub_before->>'plan_code'='pro' and sub_before->>'billing_cycle'='monthly';
  assert (select status='paid' and paymob_transaction_id=tx from public.subscription_invoices where id=invoice);
  set local role service_role;
  perform public.reconcile_subscription_paymob(provider_order,tx,cents,'EGP',true,false,false,false,'{}');
  reset role;
  assert (select to_jsonb(s)=sub_before from public.store_subscriptions s where store_id=tenant);
  set local role service_role;
  perform public.reconcile_subscription_paymob(provider_order,tx,cents,'EGP',true,false,true,false,'{}');
  assert (select status='refunded' from public.subscription_invoices where id=invoice);
  assert (select status='refunded' from public.subscription_payment_attempts where id=attempt);
  result := public.reserve_subscription_paymob(tenant,merchant,'business','monthly','paymob_card',gen_random_uuid()::text);
  provider_order := provider_order || '1';
  perform public.bind_subscription_paymob((result->>'attempt_id')::uuid,provider_order);
  perform public.reconcile_subscription_paymob(provider_order,tx||'1',(result->>'amount_cents')::integer,'EGP',false,false,false,false,'{}');
  assert (select status='failed' from public.subscription_invoices where id=(result->>'invoice_id')::uuid);
  assert (select status='failed' from public.subscription_payment_attempts where id=(result->>'attempt_id')::uuid);
  reset role;

  set local role authenticated;
  begin perform admin_notes from public.store_subscriptions; assert false; exception when insufficient_privilege then null; end;
  begin perform paymob_api_key,paymob_hmac_secret from public.platform_billing_secrets; assert false; exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform admin_notes from public.store_subscriptions; assert false; exception when insufficient_privilege then null; end;
  begin perform paymob_api_key,paymob_hmac_secret from public.platform_billing_secrets; assert false; exception when insufficient_privilege then null; end;
  reset role;
end $contract$;
rollback;
