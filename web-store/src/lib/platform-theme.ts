import { accentContrast, isAccentColor } from "./theme-contrast.ts";

export const presets = ["commerce_crisp", "executive_dark", "warm_editorial"] as const;
export const radii = ["sharp", "balanced", "soft"] as const;
export const fontPairs = ["ibm_plex", "alexandria", "readex"] as const;
export type Preset = (typeof presets)[number];
type Radius = (typeof radii)[number];
type FontPair = (typeof fontPairs)[number];

export type PlatformTheme = {
  preset: Preset;
  accent_color: string;
  radius_scale: Radius;
  font_pair: FontPair;
  hero_title_ar: string;
  hero_title_en: string;
  hero_subtitle_ar: string;
  hero_subtitle_en: string;
  sticky_cta_enabled: boolean;
  motion_enabled: boolean;
  revision: number;
};

export const presetOptions = {
  commerce_crisp: {
    label: "Commerce Crisp", surface: "#FFFFFF", card: "#F4F4F5", ink: "#111315", muted: "#56595E", line: "#DADBDD",
    accent_color: "#0B0B0C", radius_scale: "balanced", font_pair: "ibm_plex",
  },
  executive_dark: {
    label: "Executive Dark", surface: "#161819", card: "#232627", ink: "#F8F9F7", muted: "#C0C5C4", line: "#424647",
    accent_color: "#D1E5AB", radius_scale: "sharp", font_pair: "readex",
  },
  warm_editorial: {
    label: "Warm Editorial", surface: "#FBF7F0", card: "#F0E8DB", ink: "#342920", muted: "#68594D", line: "#D7CBBA",
    accent_color: "#93472E", radius_scale: "soft", font_pair: "alexandria",
  },
} as const;

export const defaultTheme: PlatformTheme = {
  preset: "commerce_crisp", accent_color: "#0B0B0C", radius_scale: "balanced", font_pair: "ibm_plex",
  hero_title_ar: "متجرك،\nبتوقيعك.", hero_title_en: "Your brand.\nYour storefront.",
  hero_subtitle_ar: "بع على الويب وعبر تطبيق أندرويد يحمل اسمك، وأدِر كل طلباتك من مكان واحد.",
  hero_subtitle_en: "Put your name on a storefront and an Android app. Run every order from one place.",
  sticky_cta_enabled: true, motion_enabled: true, revision: 1,
};

export const copyLimits = { hero_title_ar: 100, hero_title_en: 100, hero_subtitle_ar: 280, hero_subtitle_en: 280 } as const;

function choice<T extends string>(value: unknown, values: readonly T[]): value is T {
  return values.some(option => option === value);
}

function copyText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && Array.from(text).length <= max && !text.includes("\0") ? text : null;
}

export function parsePlatformTheme(value: unknown): PlatformTheme | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const { preset, accent_color, radius_scale, font_pair, motion_enabled, sticky_cta_enabled, revision } = row;
  const hero_title_ar = copyText(row.hero_title_ar, copyLimits.hero_title_ar);
  const hero_title_en = copyText(row.hero_title_en, copyLimits.hero_title_en);
  const hero_subtitle_ar = copyText(row.hero_subtitle_ar, copyLimits.hero_subtitle_ar);
  const hero_subtitle_en = copyText(row.hero_subtitle_en, copyLimits.hero_subtitle_en);
  if (!choice(preset, presets) || !choice(radius_scale, radii) || !choice(font_pair, fontPairs)
    || !isAccentColor(accent_color) || typeof motion_enabled !== "boolean" || typeof sticky_cta_enabled !== "boolean"
    || typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || revision > 2147483647
    || !hero_title_ar || !hero_title_en || !hero_subtitle_ar || !hero_subtitle_en) return null;
  return { preset, accent_color: accent_color.toUpperCase(), radius_scale, font_pair, motion_enabled, sticky_cta_enabled,
    revision, hero_title_ar, hero_title_en, hero_subtitle_ar, hero_subtitle_en };
}

export function applyPreset(theme: PlatformTheme, preset: Preset): PlatformTheme {
  const { accent_color, radius_scale, font_pair } = presetOptions[preset];
  return { ...theme, preset, accent_color, radius_scale, font_pair };
}

const fonts = {
  ibm_plex: '"DM Sans Variable", "IBM Plex Sans Arabic", sans-serif',
  alexandria: '"Alexandria Variable", "IBM Plex Sans Arabic", sans-serif',
  readex: '"Readex Pro Variable", "IBM Plex Sans Arabic", sans-serif',
};
const radiusTokens = { sharp: ["6px", "12px"], balanced: ["12px", "24px"], soft: ["18px", "32px"] };

export function resolveTheme(theme: PlatformTheme) {
  const palette = presetOptions[theme.preset];
  const contrast = accentContrast(theme.accent_color);
  const [controlRadius, cardRadius] = radiusTokens[theme.radius_scale];
  return {
    "--pt-surface": palette.surface, "--pt-card": palette.card, "--pt-ink": palette.ink,
    "--pt-muted": palette.muted, "--pt-line": palette.line, "--pt-accent": contrast.accent,
    "--pt-fill": contrast.background, "--pt-on-fill": contrast.foreground,
    "--pt-radius": controlRadius, "--pt-card-radius": cardRadius, "--pt-font": fonts[theme.font_pair],
  };
}
