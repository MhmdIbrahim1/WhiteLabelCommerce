begin;
-- package_id is the factory's stored Android applicationId.
alter table public.store_app_builds add column if not exists sha256 text check(sha256 ~ '^[a-f0-9]{64}$');
create index if not exists store_app_builds_update_idx on public.store_app_builds(store_id,package_id,status,version_code desc);
create or replace function public.get_latest_mobile_app_build(p_store_id uuid,p_package_name text)
returns table(store_id uuid, package_name text, version_code integer,version_name text,apk_url text,sha256 text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select b.store_id,b.package_id,b.version_code,b.version_name,b.apk_download_url,b.sha256,b.created_at
  from public.store_app_builds b where b.store_id=p_store_id and b.package_id=p_package_name and b.status='succeeded'
  order by b.version_code desc,b.created_at desc,b.id desc limit 1
$$;
revoke all on function public.get_latest_mobile_app_build(uuid,text) from public;
grant execute on function public.get_latest_mobile_app_build(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
