begin;
alter table public.products add column if not exists image_paths text[];
-- The invoker-rights search RPC reads normalized public names, descriptions and variants.
grant select (search_text_norm, search_skeleton_norm, image_paths) on public.products to anon, authenticated;
notify pgrst, 'reload schema';
commit;
