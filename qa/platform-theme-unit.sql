-- Exercises the published projection, caller privileges and revision lock.
-- The existing admin identity stays inside this transaction. Only the theme row is written.
begin;
set local lock_timeout = '2s';
set local plpgsql.check_asserts = on;

do $unit$
declare
  original public.platform_theme_settings;
  actor uuid;
  ordinary uuid;
  next_revision integer;
  client_role text;
  write_privilege text;
  signature text := 'public.save_platform_theme(integer,text,text,text,text,text,text,text,text,boolean,boolean)';
begin
  select * into strict original from public.platform_theme_settings where id = 1 for update;
  select user_id into strict actor from public.platform_admins order by user_id limit 1;
  select coalesce((select m.user_id from public.store_members m
    where not exists (select 1 from public.platform_admins p where p.user_id = m.user_id) limit 1),
    gen_random_uuid()) into ordinary;

  assert (select relrowsecurity from pg_class where oid = 'public.platform_theme_settings'::regclass);
  assert not has_function_privilege('anon', signature, 'execute');
  assert has_function_privilege('authenticated', signature, 'execute');
  foreach client_role in array array['anon','authenticated'] loop
    foreach write_privilege in array array['insert','update','delete','truncate'] loop
      assert not has_table_privilege(client_role,'public.platform_theme_settings',write_privilege);
    end loop;
    assert not has_column_privilege(client_role,'public.platform_theme_settings','updated_by','select');
    assert not has_column_privilege(client_role,'public.products','cost_price','select');
    assert not has_column_privilege(client_role,'public.store_subscriptions','admin_notes','select');
    assert not has_column_privilege(client_role,'public.store_invitations','token_hash','select');
  end loop;

  begin
    insert into public.platform_theme_settings(id) values (2);
    raise exception 'Singleton accepted a second row';
  exception when check_violation then null;
  end;

  set local role anon;
  assert (select revision from public.platform_theme_settings where id = 1) = original.revision;
  reset role;

  perform set_config('request.jwt.claim.sub', ordinary::text, true);
  set local role authenticated;
  begin
    perform public.save_platform_theme(original.revision,'commerce_crisp','#101010','sharp','readex',
      'عنوان','Title','وصف','Subtitle',false,false);
    raise exception 'Non-platform administrator published a theme';
  exception when insufficient_privilege then assert sqlerrm = 'platform_admin_required';
  end;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  begin
    update public.platform_theme_settings set accent_color = '#CCCCCC' where id = 1;
    raise exception 'Direct update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_platform_theme(original.revision,'commerce_crisp','#12','sharp','readex',
      'عنوان','Title','وصف','Subtitle',true,true);
    raise exception 'Invalid accent accepted';
  exception when check_violation then null;
  end;

  next_revision := public.save_platform_theme(original.revision,'warm_editorial','#aa1188','soft','alexandria',
    'عنوان تجريبي','Trial title','وصف تجريبي','Trial description',false,false);
  assert next_revision = original.revision + 1;
  begin
    perform public.save_platform_theme(original.revision,'commerce_crisp','#101010','sharp','readex',
      'عنوان','Title','وصف','Subtitle',true,true);
    raise exception 'Stale revision accepted';
  exception when sqlstate 'PT409' then assert sqlerrm = 'theme_revision_conflict';
  end;
  reset role;
  assert (select updated_by = actor and updated_at >= original.updated_at and revision = next_revision
    and accent_color = '#AA1188' and hero_title_ar = 'عنوان تجريبي' and hero_title_en = 'Trial title'
    and hero_subtitle_ar = 'وصف تجريبي' and hero_subtitle_en = 'Trial description'
    and preset = 'warm_editorial' and radius_scale = 'soft' and font_pair = 'alexandria'
    and not sticky_cta_enabled and not motion_enabled from public.platform_theme_settings where id = 1);
end;
$unit$;
rollback;
