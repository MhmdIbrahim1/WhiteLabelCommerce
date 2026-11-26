begin;

create table if not exists public.platform_theme_settings (
  id integer primary key default 1 check (id = 1),
  preset text not null default 'commerce_crisp'
    check (preset in ('commerce_crisp', 'executive_dark', 'warm_editorial')),
  accent_color text not null default '#0B0B0C' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  radius_scale text not null default 'balanced' check (radius_scale in ('sharp', 'balanced', 'soft')),
  font_pair text not null default 'ibm_plex' check (font_pair in ('ibm_plex', 'alexandria', 'readex')),
  hero_title_ar text not null default E'متجرك،\nبتوقيعك.',
  hero_title_en text not null default E'Your brand.\nYour storefront.',
  hero_subtitle_ar text not null default 'بع على الويب وعبر تطبيق أندرويد يحمل اسمك، وأدِر كل طلباتك من مكان واحد.',
  hero_subtitle_en text not null default 'Put your name on a storefront and an Android app. Run every order from one place.',
  sticky_cta_enabled boolean not null default true,
  motion_enabled boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (char_length(hero_title_ar) between 1 and 100 and hero_title_ar ~ '[^[:space:]]'),
  check (char_length(hero_title_en) between 1 and 100 and hero_title_en ~ '[^[:space:]]'),
  check (char_length(hero_subtitle_ar) between 1 and 280 and hero_subtitle_ar ~ '[^[:space:]]'),
  check (char_length(hero_subtitle_en) between 1 and 280 and hero_subtitle_en ~ '[^[:space:]]')
);

insert into public.platform_theme_settings (id) values (1) on conflict (id) do nothing;
alter table public.platform_theme_settings enable row level security;
drop policy if exists platform_theme_read on public.platform_theme_settings;
create policy platform_theme_read on public.platform_theme_settings for select to anon, authenticated using (true);

revoke all on public.platform_theme_settings from public, anon, authenticated, service_role;
grant select (id, preset, accent_color, radius_scale, font_pair, hero_title_ar, hero_title_en,
  hero_subtitle_ar, hero_subtitle_en, sticky_cta_enabled, motion_enabled, revision, updated_at)
  on public.platform_theme_settings to anon, authenticated;
grant select on public.platform_theme_settings to service_role;

create or replace function public.save_platform_theme(
  p_expected_revision integer, p_preset text, p_accent_color text, p_radius_scale text, p_font_pair text,
  p_hero_title_ar text, p_hero_title_en text, p_hero_subtitle_ar text, p_hero_subtitle_en text,
  p_sticky_cta_enabled boolean, p_motion_enabled boolean
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  next_revision integer;
begin
  if (select auth.uid()) is null or not public.is_platform_super_admin() then
    raise exception using errcode = '42501', message = 'platform_admin_required';
  end if;

  update public.platform_theme_settings
  set preset = p_preset, accent_color = upper(p_accent_color), radius_scale = p_radius_scale,
      font_pair = p_font_pair, hero_title_ar = btrim(p_hero_title_ar), hero_title_en = btrim(p_hero_title_en),
      hero_subtitle_ar = btrim(p_hero_subtitle_ar), hero_subtitle_en = btrim(p_hero_subtitle_en),
      sticky_cta_enabled = p_sticky_cta_enabled, motion_enabled = p_motion_enabled,
      updated_by = (select auth.uid()), updated_at = clock_timestamp(), revision = revision + 1
  where id = 1 and revision = p_expected_revision
  returning revision into next_revision;

  if not found then
    raise exception using errcode = 'PT409', message = 'theme_revision_conflict';
  end if;
  return next_revision;
end;
$$;

revoke all on function public.save_platform_theme(integer,text,text,text,text,text,text,text,text,boolean,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.save_platform_theme(integer,text,text,text,text,text,text,text,text,boolean,boolean)
  to authenticated;
notify pgrst, 'reload schema';
commit;
