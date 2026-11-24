-- Phase 9c: Notification Deletion RLS, read_at Timestamp & Realtime Delete Sync
-- Ensures public.notifications has read_at, REPLICA IDENTITY FULL for Realtime DELETE
-- payloads, and explicit DELETE & UPDATE RLS policies for store admins and customers.
-- Idempotent and safe to re-run.
begin;

-- 1. Add read_at timestamp column and backfill existing read rows
alter table public.notifications
  add column if not exists read_at timestamptz null;

update public.notifications
set read_at = coalesce(read_at, created_at)
where is_read = true and read_at is null;

-- Keep is_read and read_at synchronized on UPDATE
create or replace function public.sync_notification_read_fields()
returns trigger
language plpgsql
as $$
begin
  if new.read_at is not null and coalesce(new.is_read, false) = false then
    new.is_read := true;
  elsif new.is_read = true and new.read_at is null then
    new.read_at := now();
  elsif new.is_read = false then
    new.read_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_notification_read_fields on public.notifications;
create trigger trg_sync_notification_read_fields
  before insert or update on public.notifications
  for each row
  execute function public.sync_notification_read_fields();

-- 2. Ensure REPLICA IDENTITY FULL so Supabase Realtime broadcasts full OLD row on DELETE
alter table public.notifications replica identity full;

-- 3. Explicit UPDATE & DELETE RLS policies (strictly multi-tenant store_id scoped)
drop policy if exists admin_update_notifications on public.notifications;
create policy admin_update_notifications
  on public.notifications
  for update
  to authenticated
  using ((select public.is_store_admin(store_id)))
  with check ((select public.is_store_admin(store_id)));

drop policy if exists customer_mark_own_notifications_read on public.notifications;
create policy customer_mark_own_notifications_read
  on public.notifications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists admin_delete_notifications on public.notifications;
create policy admin_delete_notifications
  on public.notifications
  for delete
  to authenticated
  using ((select public.is_store_admin(store_id)));

drop policy if exists customer_delete_own_notifications on public.notifications;
create policy customer_delete_own_notifications
  on public.notifications
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- 4. Ensure Realtime publication includes public.notifications & reload PostgREST schema
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
