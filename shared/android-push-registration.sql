create or replace function public.register_push_subscription(
  p_store_id uuid,
  p_platform text,
  p_token text,
  p_locale text default 'ar',
  p_guest_session_id text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_token text := left(trim(coalesce(p_token, '')), 512);
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_locale text := case when lower(trim(coalesce(p_locale, 'ar'))) = 'en' then 'en' else 'ar' end;
  v_guest text := nullif(left(trim(coalesce(p_guest_session_id, '')), 120), '');
  v_id uuid;
begin
  if p_store_id is null or length(v_token) < 16 or v_platform not in ('android', 'web') then
    raise exception 'invalid_push_subscription';
  end if;

  if not exists (select 1 from public.stores st where st.id = p_store_id and st.status <> 'suspended') then
    raise exception 'unknown_store';
  end if;

  -- Never trust unverified caller-supplied p_phone (prevents phone-based push interception)
  insert into public.push_subscriptions (
    store_id, user_id, guest_session_id, phone, platform, token, locale, is_active, last_seen_at
  )
  values (
    p_store_id, v_uid, v_guest, null, v_platform, v_token, v_locale, true, now()
  )
  on conflict (store_id, platform, token) do update
  set user_id = case when excluded.platform = 'android' then excluded.user_id
                     else coalesce(excluded.user_id, public.push_subscriptions.user_id) end,
      guest_session_id = coalesce(excluded.guest_session_id, public.push_subscriptions.guest_session_id),
      phone = null,
      locale = excluded.locale,
      is_active = true,
      last_seen_at = now()
  returning id into v_id;

  -- A legacy FCM token embeds the same installation ID before its colon.
  if v_platform = 'android' and v_guest is not null and v_token ~ '^[A-Za-z0-9_-]{22}$' then
    update public.push_subscriptions
       set is_active = false, user_id = null
     where store_id = p_store_id and platform = 'android' and guest_session_id = v_guest
       and position(':' in token) > 0 and split_part(token, ':', 1) = v_token;
  end if;
  return v_id;
end $$;

revoke all on function public.register_push_subscription(uuid, text, text, text, text, text) from public;
grant execute on function public.register_push_subscription(uuid, text, text, text, text, text) to anon, authenticated;
