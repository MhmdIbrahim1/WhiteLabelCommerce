import { uiConfigDataAttrs, uiConfigFromTemplate, uiConfigToCssVars, type StoreUiConfig } from "./ui-config.ts";
import { storefrontPresets, resolveStorefrontPreset } from "./storefront-presets.ts";
import { accentContrast, contrastRatio, isAccentColor } from "./theme-contrast.ts";

function colorOverride(value: string, templateValue: string, otherDefault = templateValue) {
  if (!isAccentColor(value)) return null;
  const selected = value.toUpperCase();
  return selected === templateValue.toUpperCase() || selected === otherDefault.toUpperCase() ? null : selected;
}

function readable(ink: string, surface: string) {
  if (contrastRatio(ink, surface) >= 4.5) return ink;
  const alternative = accentContrast(surface).foreground;
  return contrastRatio(alternative, surface) >= 4.5 ? alternative : "#000000";
}

export type StorefrontGates = { sticky_cta_enabled: boolean; motion_enabled: boolean };

export function storefrontDesign(config: StoreUiConfig) {
  const preset = resolveStorefrontPreset(config.storefrontPreset, config.baseTemplate);
  const p = storefrontPresets[preset];
  const legacy = uiConfigFromTemplate(config.baseTemplate);
  const { global, pages } = config;
  const explicit = config.storefrontStyleVersion === 1;
  function color(value: string, oldDefault: string, sectorDefault: string) {
    if (explicit && isAccentColor(value)) return value;
    return colorOverride(value, oldDefault) ?? sectorDefault;
  }
  return {
    storefrontPreset: preset,
    primaryButtonBg: color(global.primaryButtonBg, legacy.global.primaryButtonBg, p.action),
    accentBadge: color(global.accentBadge, legacy.global.accentBadge, p.accent),
    pageBg: color(global.pageBg, legacy.global.pageBg, p.page),
    cardSurface: color(global.cardSurface, legacy.global.cardSurface, p.page),
    heroBg: color(pages.home.heroBg, legacy.global.primaryButtonBg, p.hero),
    borderRadius: !explicit && global.borderRadius === legacy.global.borderRadius ? p.radius : global.borderRadius,
    gridColumns: !explicit && pages.products.gridColumns === legacy.pages.products.gridColumns ? p.columns : pages.products.gridColumns,
    fontPair: global.fontPair ?? "preset",
    cardAspectRatio: pages.products.cardAspectRatio ?? "preset",
    heroLayout: pages.home.heroLayout,
    hero_visible: pages.home.hero_visible,
    hero_cta_visible: pages.home.hero_cta_visible,
    sticky_cta_enabled: config.sticky_cta_enabled !== false,
    motion_enabled: config.motion_enabled !== false,
    motionIntensity: global.motionIntensity,
    // Keep page-specific merchant colors on ordinary edits. A preset reset releases
    // these overrides so that detail, checkout and text colors follow the sector again.
    primaryButtonText: colorOverride(global.primaryButtonText, legacy.global.primaryButtonText),
    heroText: colorOverride(pages.home.heroText, legacy.pages.home.heroText),
    priceBadgeColor: colorOverride(pages.products.priceBadgeColor, legacy.pages.products.priceBadgeColor, legacy.global.primaryButtonBg),
    ctaButtonColor: colorOverride(pages.product_details.ctaButtonColor, legacy.pages.product_details.ctaButtonColor, legacy.global.primaryButtonBg),
    checkoutButtonColor: colorOverride(pages.cart_checkout.checkoutButtonColor, legacy.global.primaryButtonBg),
    summaryCardBg: colorOverride(pages.cart_checkout.summaryCardBg, legacy.pages.cart_checkout.summaryCardBg, legacy.global.cardSurface),
    progressBarAccent: colorOverride(pages.cart_checkout.progressBarAccent, legacy.global.accentBadge),
  };
}

export const storefrontFonts = {
  ibm_plex: storefrontPresets.commerce_signature.display,
  alexandria: '"Alexandria Variable", "IBM Plex Sans Arabic", sans-serif',
  readex: '"Readex Pro Variable", "IBM Plex Sans Arabic", sans-serif',
};

export function storefrontButton(design: Pick<ReturnType<typeof storefrontDesign>, "primaryButtonBg" | "primaryButtonText">) {
  const fill = accentContrast(design.primaryButtonBg);
  const foreground = readable(design.primaryButtonText ?? fill.foreground, fill.background);
  return { ...fill, foreground, ratio: contrastRatio(foreground, fill.background) };
}

export function resolveStorefrontTheme(config: StoreUiConfig, platform: StorefrontGates) {
  const design = storefrontDesign(config);
  const preset = design.storefrontPreset;
  const p = storefrontPresets[preset];
  const page = design.pageBg;
  const surface = design.cardSurface;
  const fill = storefrontButton(design);
  const badge = accentContrast(design.accentBadge);
  const detail = accentContrast(design.ctaButtonColor ?? fill.accent);
  const checkout = accentContrast(design.checkoutButtonColor ?? fill.accent);
  const hero = design.heroBg;
  const summary = design.summaryCardBg ?? p.panel;
  const heroInk = design.heroText ?? p.ink;
  return {
    preset,
    motionEnabled: platform.motion_enabled && design.motion_enabled && design.motionIntensity !== "none",
    stickyCtaEnabled: platform.sticky_cta_enabled && design.sticky_cta_enabled,
    tokens: {
      "--template-bg": page, "--paper": surface, "--sf-panel": p.panel, "--template-line": p.line,
      "--sf-ink": readable(p.ink, page), "--sf-muted": readable(p.muted, page),
      "--sf-surface-ink": readable(p.ink, surface), "--sf-surface-muted": readable(p.muted, surface),
      "--primary": fill.background, "--primary-ink": fill.foreground, "--secondary": badge.accent,
      "--sf-badge": badge.background, "--sf-on-badge": badge.foreground,
      "--hero-bg": hero, "--hero-text": readable(heroInk, hero),
      "--detail-cta-bg": detail.background, "--sf-on-detail": detail.foreground,
      "--checkout-btn-bg": checkout.background, "--sf-on-checkout": checkout.foreground,
      "--cart-summary-bg": summary, "--sf-summary-ink": readable(p.ink, summary),
      "--sf-price": readable(design.priceBadgeColor ?? p.ink, surface),
      "--cart-progress-accent": design.progressBarAccent ?? badge.accent,
      "--radius": design.borderRadius + "px", "--products-cols": String(design.gridColumns),
      "--sf-ratio": design.cardAspectRatio === "preset" ? p.ratio : design.cardAspectRatio, "--sf-gap": p.gap, "--sf-section-gap": p.sectionGap,
      "--shop-font": design.fontPair === "preset" ? storefrontFonts.ibm_plex : storefrontFonts[design.fontPair],
      "--sf-display": design.fontPair === "preset" ? p.display : storefrontFonts[design.fontPair], "--sf-display-weight": String(p.weight),
      "--sf-arabic-font": design.fontPair === "alexandria" || design.fontPair === "readex" ? storefrontFonts[design.fontPair] : '"IBM Plex Sans Arabic", "DM Sans Variable", sans-serif',
    },
  };
}

export function storefrontSurfaceProps(config: StoreUiConfig, theme: ReturnType<typeof resolveStorefrontTheme>) {
  const attrs = uiConfigDataAttrs(config);
  return {
    ...attrs,
    "data-storefront-preset": theme.preset,
    "data-motion-enabled": theme.motionEnabled,
    "data-entrance": theme.motionEnabled ? attrs["data-entrance"] : "none",
    "data-card-hover": theme.motionEnabled ? attrs["data-card-hover"] : "none",
    "data-sticky-cta": theme.stickyCtaEnabled,
    style: { ...uiConfigToCssVars(config), ...theme.tokens },
  };
}
