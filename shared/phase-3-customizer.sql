-- Phase 3: Visual Theme & Page Customizer (store_settings.ui_config JSONB)
-- Backward compatible with Phase 2 theme_template and border_radius columns.
begin;

alter table public.store_settings
  add column if not exists theme_template text not null default 'modern-minimal',
  add column if not exists border_radius integer not null default 12,
  add column if not exists ui_config jsonb not null default '{}'::jsonb;

alter table public.store_settings
  alter column theme_template set default 'modern-minimal',
  alter column border_radius set default 12,
  alter column ui_config set default '{}'::jsonb;

alter table public.store_settings
  drop constraint if exists store_settings_ui_config_is_object;
alter table public.store_settings
  add constraint store_settings_ui_config_is_object
  check (jsonb_typeof(ui_config) = 'object');

notify pgrst, 'reload schema';

commit;
