import { CARD_RATIOS, GRID_COLUMNS, HERO_LAYOUTS, MOTION_INTENSITIES, STOREFRONT_FONTS, uiConfigFromTemplate, type StoreUiConfig, type TemplateId } from "./ui-config.ts";
import { isStorefrontPreset, type StorefrontPreset } from "./storefront-presets.ts";
import { storefrontDesign } from "./storefront-theme.ts";
import { isAccentColor } from "./theme-contrast.ts";

export type StudioDraft = ReturnType<typeof storefrontDesign>;
export const studioColors = ["primaryButtonBg", "accentBadge", "pageBg", "cardSurface", "heroBg"] as const;
export type StudioColor = (typeof studioColors)[number];
const switches = ["hero_visible", "hero_cta_visible", "sticky_cta_enabled", "motion_enabled"] as const;
const inheritedColors = ["primaryButtonText", "heroText", "priceBadgeColor", "ctaButtonColor", "checkoutButtonColor", "summaryCardBg", "progressBarAccent"] as const;
const draftKeys = ["storefrontPreset", ...studioColors, ...inheritedColors, "borderRadius", "gridColumns", "fontPair", "cardAspectRatio",
  "heroLayout", "motionIntensity", ...switches] as const satisfies readonly (keyof StudioDraft)[];

function plainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return plainRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function member<T>(value: unknown, options: readonly T[]): value is T {
  return options.some(option => option === value);
}

// Used at both trust boundaries. Only enumerated choices, booleans, bounded integers and RGB hex cross the bridge.
export function parseStudioDraft(input: unknown): StudioDraft | null {
  if (!exactKeys(input, draftKeys) || !isStorefrontPreset(input.storefrontPreset)
    || !studioColors.every(key => isAccentColor(input[key])) || !switches.every(key => typeof input[key] === "boolean")
    || !inheritedColors.every(key => input[key] === null || isAccentColor(input[key]))
    || typeof input.borderRadius !== "number" || !Number.isInteger(input.borderRadius) || input.borderRadius < 0 || input.borderRadius > 24
    || !member(input.gridColumns, GRID_COLUMNS) || !member(input.fontPair, STOREFRONT_FONTS) || !member(input.cardAspectRatio, CARD_RATIOS)
    || !member(input.heroLayout, HERO_LAYOUTS) || !member(input.motionIntensity, MOTION_INTENSITIES)) return null;
  const draft = { ...input } as StudioDraft;
  for (const key of studioColors) draft[key] = draft[key].toUpperCase();
  for (const key of inheritedColors) draft[key] = draft[key]?.toUpperCase() ?? null;
  return draft;
}

export function sameStudioDraft(a: StudioDraft, b: StudioDraft) {
  return draftKeys.every(key => a[key] === b[key]);
}

export function presetDraft(preset: StorefrontPreset, template: TemplateId): StudioDraft {
  return storefrontDesign({ ...uiConfigFromTemplate(template), storefrontPreset: preset });
}

function record(value: unknown) {
  return plainRecord(value) ? value : {};
}

export function studioPreviewBase(raw: unknown, config: StoreUiConfig) {
  // Legacy per-page colors inherit the merchant palette when the entire group is absent.
  // Preserve that distinction without serializing unrecognized merchant JSON into the iframe.
  const stored = record(record(raw).pages);
  const pages = Object.fromEntries(Object.entries(config.pages).filter(([key]) => plainRecord(stored[key])));
  return { ...config, pages };
}

// Work on the original JSONB: the normalized storefront reader intentionally drops unknown keys.
export function mergeStudioDraft(raw: unknown, draft: StudioDraft) {
  const input = record(raw);
  const pages = record(input.pages);
  function pageColors(rawGroup: unknown, keys: readonly (typeof inheritedColors)[number][]) {
    const group = { ...record(rawGroup) };
    for (const key of keys) {
      if (draft[key] === null) delete group[key];
      else group[key] = draft[key];
    }
    return group;
  }
  return {
    ...input, storefrontStyleVersion: 1, storefrontPreset: draft.storefrontPreset,
    sticky_cta_enabled: draft.sticky_cta_enabled, motion_enabled: draft.motion_enabled,
    global: {
      ...pageColors(input.global, ["primaryButtonText"]), primaryButtonBg: draft.primaryButtonBg, accentBadge: draft.accentBadge,
      pageBg: draft.pageBg, cardSurface: draft.cardSurface, borderRadius: draft.borderRadius,
      fontPair: draft.fontPair, motionIntensity: draft.motionIntensity,
    },
    pages: {
      ...pages,
      home: { ...pageColors(pages.home, ["heroText"]), heroBg: draft.heroBg, heroLayout: draft.heroLayout,
        hero_visible: draft.hero_visible, hero_cta_visible: draft.hero_cta_visible },
      products: { ...pageColors(pages.products, ["priceBadgeColor"]), gridColumns: draft.gridColumns, cardAspectRatio: draft.cardAspectRatio },
      product_details: pageColors(pages.product_details, ["ctaButtonColor"]),
      cart_checkout: pageColors(pages.cart_checkout, ["checkoutButtonColor", "summaryCardBg", "progressBarAccent"]),
    },
  };
}

export function prepareStudioPublish(raw: unknown, current: StudioDraft, before: StudioDraft, draft: StudioDraft) {
  if (sameStudioDraft(current, draft)) return { status: "published" } as const;
  if (!sameStudioDraft(current, before)) return { status: "conflict" } as const;
  return { status: "write", config: mergeStudioDraft(raw, draft) } as const;
}
