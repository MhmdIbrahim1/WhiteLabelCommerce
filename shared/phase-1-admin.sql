-- Run after supabase-schema.sql on new and existing projects.
begin;
alter table public.products
  add column if not exists old_price numeric(12,2) check (old_price >= 0),
  add column if not exists sizes text[] not null default '{}',
  add column if not exists colors text[] not null default '{}',
  add column if not exists image_path text;
alter table public.store_settings add column if not exists banners text[] not null default '{}';
alter table public.support_tickets
  add column if not exists admin_reply text not null default '',
  add column if not exists order_id uuid references public.orders(id) on delete set null;
-- Scope the new staff-only fields on the pre-existing customer insert path.
drop policy if exists protect_ticket_staff_fields on public.support_tickets;
create policy protect_ticket_staff_fields on public.support_tickets as restrictive
  for insert to authenticated with check (
    (select public.is_admin()) or (admin_reply = '' and order_id is null)
  );
create or replace function public.admin_revenue(store_currency text)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(total), 0) from public.orders
  where (select public.is_admin()) and status = 'delivered' and currency = store_currency
$$;
revoke all on function public.admin_revenue(text) from public, anon;
grant execute on function public.admin_revenue(text) to authenticated;
notify pgrst, 'reload schema';
commit;

