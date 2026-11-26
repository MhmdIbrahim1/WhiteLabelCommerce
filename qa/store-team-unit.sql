-- Unit tests of the installed functions, constraints and privileges. All identities and rows roll back.
begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '5s';
do $unit$
declare
  tenant uuid := gen_random_uuid(); primary_owner uuid := gen_random_uuid();
  colleague uuid := gen_random_uuid(); other_user uuid := gen_random_uuid();
  mailbox text := colleague::text || '@example.invalid'; other_mail text := other_user::text || '@example.invalid';
  catalog jsonb := private.team_preset('catalog'); orders jsonb := private.team_preset('orders');
  full_access jsonb := private.team_preset('owner'); plan public.saas_plans;
  invite uuid; second_invite uuid; raw_token text; rotated text; detail text; value jsonb;
begin
  assert full_access ?& array['manage_products','manage_orders','manage_customers','manage_settings','manage_domains',
    'manage_billing','manage_staff','manage_mobile_app'];
  assert private.team_preset('manager') = full_access-'manage_billing';
  assert catalog='{"manage_products":true}' and orders='{"manage_orders":true}';
  assert private.valid_team_role('custom',catalog||orders) and not private.valid_team_role('orders',catalog||orders);
  assert not private.valid_team_role('custom','{"manage_staff":"true"}') and not private.valid_team_role('custom','{"unknown":true}');
  assert encode(private.invite_hash(repeat('a',64)),'hex')='ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
  assert private.invite_hash('') is null and private.invite_hash(repeat('A',64)) is null;
  plan.max_staff_members := 5;
  assert public.resolve_saas_entitlements(plan,'{}')->'max_staff_members'='5'::jsonb;
  foreach value in array array['0','1','null']::jsonb[] loop
    assert public.resolve_saas_entitlements(plan,jsonb_build_object('max_staff_members',value))->'max_staff_members'=value;
    assert public.valid_quota_overrides(jsonb_build_object('max_staff_members',value));
  end loop;
  foreach value in array array['-1','0.5','2147483648','"1"','false']::jsonb[] loop
    assert not public.valid_quota_overrides(jsonb_build_object('max_staff_members',value));
  end loop;
  assert not has_column_privilege('authenticated','public.products','cost_price','SELECT');
  assert not has_column_privilege('anon','public.products','cost_price','SELECT');
  assert not has_column_privilege('authenticated','public.store_subscriptions','admin_notes','SELECT');
  assert not has_table_privilege('authenticated','public.store_members','UPDATE');
  assert not has_table_privilege('authenticated','public.store_invitations','INSERT');
  assert not has_column_privilege('authenticated','public.store_invitations','token_hash','SELECT');
  assert not has_function_privilege('authenticated','private.invite_token(uuid,bigint)','EXECUTE');
  assert not has_function_privilege('anon','public.team_accept_invite(text)','EXECUTE');

  insert into auth.users(id,email) values(primary_owner,primary_owner::text||'@example.invalid'),(colleague,mailbox),(other_user,other_mail);
  insert into public.stores(id,slug,name_ar,owner_user_id) values(tenant,'team-unit-'||left(tenant::text,8),'Unit',primary_owner);
  update public.store_subscriptions set quota_overrides='{"max_staff_members":1}' where store_id=tenant;
  insert into public.store_members(store_id,user_id,role) values(tenant,primary_owner,'owner');
  assert (select permissions from public.store_members where store_id=tenant and user_id=primary_owner)=full_access;
  begin
    delete from public.store_members where store_id=tenant and user_id=primary_owner;
    raise exception 'last-owner delete succeeded';
  exception when sqlstate 'PT409' then assert sqlerrm='last_owner'; end;
  begin
    update public.store_members set role='catalog',permissions=catalog where store_id=tenant and user_id=primary_owner;
    raise exception 'last-owner demotion succeeded';
  exception when sqlstate 'PT409' then assert sqlerrm='last_owner'; end;

  perform set_config('request.jwt.claim.sub',primary_owner::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  set local role authenticated;
  invite := public.team_invite(tenant,'  '||upper(mailbox)||'  ','catalog',catalog);
  raw_token := public.team_invite_link(tenant,invite,'copy');
  assert public.team_invite_link(tenant,invite,'copy')=raw_token;
  assert (select email from public.store_invitations where id=invite)=mailbox;
  assert public.get_store_team(tenant)->'used'='1'::jsonb;
  assert public.get_store_billing(tenant)->'staff_members'='1'::jsonb;
  assert public.admin_dashboard_metrics(tenant,now()-interval '1 day',now(),now()-interval '2 days',now()-interval '1 day')->'order_count'='0'::jsonb;
  assert public.admin_abandoned_cart_summary(tenant)->'all'='0'::jsonb;
  begin
    perform public.team_invite(tenant,other_mail,'orders',orders);
    raise exception 'admitted an invite over the cap';
  exception when sqlstate 'PT409' then
    get stacked diagnostics detail=pg_exception_detail;
    assert detail::jsonb='{"code":"plan_limit_reached","resource":"staff_members","current":1,"limit":1}';
  end;
  rotated := public.team_invite_link(tenant,invite,'regenerate');
  assert rotated<>raw_token and public.team_invite_preview(raw_token) is null;
  assert public.team_invite_preview(encode(sha256(convert_to(rotated,'UTF8')),'hex')) is null;
  assert public.team_invite_preview(rotated)->>'role'='catalog';
  assert public.team_invite_preview(rotated)->>'account'='mismatch';
  assert not (public.team_invite_preview(rotated) ?| array['email','permissions','token_hash','invited_by']);
  begin
    perform public.team_accept_invite(rotated);
    raise exception 'accepted another account invitation';
  exception when sqlstate 'PT403' then assert sqlerrm='mailbox_required'; end;
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  assert public.team_invite_preview(rotated)->>'account'='verify';
  begin
    perform public.team_accept_invite(rotated);
    raise exception 'unverified mailbox accepted';
  exception when sqlstate 'PT403' then assert sqlerrm='mailbox_required'; end;
  reset role;
  insert into customer_auth.verified_mailboxes values(colleague,mailbox);
  update public.store_subscriptions set quota_overrides='{"max_staff_members":0}' where store_id=tenant;
  set local role authenticated;
  begin
    perform public.team_accept_invite(rotated);
    raise exception 'accepted after a plan downgrade below reserved usage';
  exception when sqlstate 'PT409' then
    get stacked diagnostics detail=pg_exception_detail;
    assert detail::jsonb='{"code":"plan_limit_reached","resource":"staff_members","current":1,"limit":0}';
  end;
  reset role;
  assert (select status from public.store_invitations where id=invite)='pending';
  update public.store_subscriptions set quota_overrides='{"max_staff_members":1}' where store_id=tenant;
  set local role authenticated;
  assert public.team_accept_invite(rotated)=tenant;
  assert public.team_invite_preview(rotated) is null;
  assert public.my_store_permissions(tenant)=catalog and public.is_admin();
  assert (select count(*) from public.get_my_managed_stores() where store_id=tenant)=1;
  assert public.get_resource_allowance(tenant,'products') ? 'cap';
  assert not public.has_store_permission(tenant,'manage_orders');
  assert not public.has_store_permission('00000000-0000-0000-0000-000000000001','manage_products');
  begin perform public.get_store_billing(tenant); raise exception 'catalog read billing';
  exception when insufficient_privilege then null; end;
  begin perform public.get_store_team(tenant); raise exception 'catalog read staff';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_dashboard_metrics(tenant,now(),now(),now(),now()); raise exception 'catalog read aggregate';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_abandoned_cart_summary(tenant); raise exception 'catalog read cart aggregate';
  exception when insufficient_privilege then null; end;
  begin perform public.team_accept_invite(rotated); raise exception 'accepted twice';
  exception when sqlstate 'PT409' then assert sqlerrm='invite_unavailable'; end;
  reset role;
  begin
    perform public.queue_store_apk(tenant,colleague,'Unit','unit','test.unit',null,null);
    raise exception 'queue accepted a requester without mobile app permission';
  exception when insufficient_privilege then null; end;
  assert (select token_hash from public.store_invitations where id=invite)=private.invite_hash(rotated);
  assert (select accepted_at is not null and status='accepted' from public.store_invitations where id=invite);
  assert private.staff_usage(tenant,clock_timestamp())=1;

  perform set_config('request.jwt.claim.sub',primary_owner::text,true);
  set local role authenticated;
  perform public.team_edit_member(tenant,colleague,'custom','{"manage_staff":true,"manage_orders":true}');
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  begin perform public.team_edit_member(tenant,colleague,'owner',full_access); raise exception 'self edit succeeded';
  exception when insufficient_privilege then null; end;
  begin perform public.team_edit_member(tenant,primary_owner,null,null); raise exception 'removed owner';
  exception when insufficient_privilege then null; end;
  begin perform public.team_invite(tenant,other_mail,'catalog',catalog); raise exception 'delegated missing permission';
  exception when insufficient_privilege then null; end;
  reset role;
  update public.store_subscriptions set quota_overrides='{"max_staff_members":null}' where store_id=tenant;
  set local role authenticated;
  second_invite := public.team_invite(tenant,other_mail,'orders',orders);
  raw_token := public.team_invite_link(tenant,second_invite,'copy');
  reset role;
  update public.store_invitations set expires_at=clock_timestamp()-interval '1 second' where id=second_invite;
  assert private.staff_usage(tenant,clock_timestamp())=1;
  set local role authenticated;
  assert public.team_invite_preview(raw_token) is null;
  begin perform public.team_accept_invite(raw_token); raise exception 'accepted expired invitation';
  exception when sqlstate 'PT409' then assert sqlerrm='invite_unavailable'; end;
  rotated := public.team_invite_link(tenant,second_invite,'regenerate');
  assert rotated<>raw_token and public.team_invite_preview(rotated) is not null;
  perform public.team_invite_link(tenant,second_invite,'revoke');
  assert public.team_invite_preview(rotated) is null;
  perform set_config('request.jwt.claim.sub',primary_owner::text,true);
  perform public.team_edit_member(tenant,colleague,'owner',full_access);
  perform set_config('request.jwt.claim.sub',colleague::text,true);
  perform public.team_edit_member(tenant,primary_owner,null,null);
  reset role;
  assert (select owner_user_id from public.stores where id=tenant)=colleague;
  assert private.staff_usage(tenant,clock_timestamp())=0;
end $unit$;
rollback;
