-- Phase 9d: SECURITY DEFINER RPC for reliable read_at persistence across
-- personal notifications, broadcast promo campaigns (user_id IS NULL),
-- external Push clicks, Web Bell Drawer, and Android app.
-- Idempotent and safe to re-run.
begin;

create or replace function public.mark_notifications_read(
  p_store_id uuid,
  p_notification_ids uuid[] default null,
  p_mark_all boolean default false
)
returns integer
language plpgsql
security definer
set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_updated integer := 0;
begin
  if p_store_id is null then
    raise exception 'store_id_required';
  end if;

  if v_uid is not null then
    select public.is_store_admin(p_store_id) into v_is_admin;
  end if;

  if p_mark_all then
    if v_is_admin then
      update public.notifications
      set is_read = true,
          read_at = coalesce(read_at, now())
      where store_id = p_store_id
        and (is_read = false or read_at is null);
    elsif v_uid is not null then
      update public.notifications
      set is_read = true,
          read_at = coalesce(read_at, now())
      where store_id = p_store_id
        and target_role = 'customer'
        and (user_id = v_uid or user_id is null)
        and (is_read = false or read_at is null);
    else
      update public.notifications
      set is_read = true,
          read_at = coalesce(read_at, now())
      where store_id = p_store_id
        and target_role = 'customer'
        and user_id is null
        and category = 'promo_campaign'
        and (is_read = false or read_at is null);
    end if;

    get diagnostics v_updated = row_count;
    return v_updated;
  end if;

  if p_notification_ids is null or coalesce(array_length(p_notification_ids, 1), 0) = 0 then
    return 0;
  end if;

  if v_is_admin then
    update public.notifications
    set is_read = true,
        read_at = coalesce(read_at, now())
    where store_id = p_store_id
      and id = any(p_notification_ids);
  elsif v_uid is not null then
    update public.notifications
    set is_read = true,
        read_at = coalesce(read_at, now())
    where store_id = p_store_id
      and id = any(p_notification_ids)
      and target_role = 'customer'
      and (user_id = v_uid or user_id is null);
  else
    update public.notifications
    set is_read = true,
        read_at = coalesce(read_at, now())
    where store_id = p_store_id
      and id = any(p_notification_ids)
      and target_role = 'customer'
      and user_id is null
      and category = 'promo_campaign';
  end if;

  get diagnostics v_updated = row_count;
  return v_updated;
end $$;

revoke all on function public.mark_notifications_read(uuid, uuid[], boolean) from public;
grant execute on function public.mark_notifications_read(uuid, uuid[], boolean) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
