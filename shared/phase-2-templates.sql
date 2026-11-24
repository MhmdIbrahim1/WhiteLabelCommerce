begin;
alter table public.store_settings
  add column if not exists theme_template text not null default 'modern-minimal',
  add column if not exists border_radius integer not null default 12;
alter table public.store_settings
  alter column theme_template set default 'modern-minimal',
  alter column border_radius set default 12;
notify pgrst, 'reload schema';
commit;
