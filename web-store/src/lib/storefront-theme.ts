import { uiConfigFromTemplate, type StoreUiConfig } from "./ui-config.ts";
import { storefrontPresets, resolveStorefrontPreset } from "./storefront-presets.ts";
import { accentContrast, contrastRatio, isAccentColor } from "./theme-contrast.ts";

function merchantColor(value: string, templateValue: string, presetValue: string, otherDefault = templateValue) {
  if (!isAccentColor(value)) return presetValue;
  const selected = value.toUpperCase();
  return selected === templateValue.toUpperCase() || selected === otherDefault.toUpperCase() ? presetValue : value;
}

function readable(ink: string, surface: string) {
  if (contrastRatio(ink, surface) >= 4.5) return ink;
  const alternative = accentContrast(surface).foreground;
  return contrastRatio(alternative, surface) >= 4.5 ? alternative : "#000000";
}

export function resolveStorefrontTheme(config: StoreUiConfig, platform: { sticky_cta_enabled: boolean; motion_enabled: boolean }) {
  const preset = resolveStorefrontPreset(config.storefrontPreset, config.baseTemplate);
  const p = storefrontPresets[preset];
  const legacy = uiConfigFromTemplate(config.baseTemplate);
  const { global, pages } = config;
  const page = merchantColor(global.pageBg, legacy.global.pageBg, p.page);
  const surface = merchantColor(global.cardSurface, legacy.global.cardSurface, p.page);
  const fill = accentContrast(merchantColor(global.primaryButtonBg, legacy.global.primaryButtonBg, p.action));
  const buttonText = merchantColor(global.primaryButtonText, legacy.global.primaryButtonText, fill.foreground);
  const badge = accentContrast(merchantColor(global.accentBadge, legacy.global.accentBadge, p.accent));
  const detail = accentContrast(merchantColor(pages.product_details.ctaButtonColor, legacy.pages.product_details.ctaButtonColor, fill.accent, legacy.global.primaryButtonBg));
  const checkout = accentContrast(merchantColor(pages.cart_checkout.checkoutButtonColor, legacy.global.primaryButtonBg, fill.accent));
  const hero = merchantColor(pages.home.heroBg, legacy.global.primaryButtonBg, p.hero);
  const summary = merchantColor(pages.cart_checkout.summaryCardBg, legacy.pages.cart_checkout.summaryCardBg, p.panel, legacy.global.cardSurface);
  const heroInk = merchantColor(pages.home.heroText, legacy.pages.home.heroText, p.ink);
  return {
    preset,
    motionEnabled: platform.motion_enabled && config.motion_enabled !== false && global.motionIntensity !== "none",
    stickyCtaEnabled: platform.sticky_cta_enabled && config.sticky_cta_enabled !== false,
    tokens: {
      "--template-bg": page, "--paper": surface, "--sf-panel": p.panel, "--template-line": p.line,
      "--sf-ink": readable(p.ink, page), "--sf-muted": readable(p.muted, page),
      "--sf-surface-ink": readable(p.ink, surface), "--sf-surface-muted": readable(p.muted, surface),
      "--primary": fill.background, "--primary-ink": readable(buttonText, fill.background), "--secondary": badge.accent,
      "--sf-badge": badge.background, "--sf-on-badge": badge.foreground,
      "--hero-bg": hero, "--hero-text": readable(heroInk, hero),
      "--detail-cta-bg": detail.background, "--sf-on-detail": detail.foreground,
      "--checkout-btn-bg": checkout.background, "--sf-on-checkout": checkout.foreground,
      "--cart-summary-bg": summary, "--sf-summary-ink": readable(p.ink, summary),
      "--sf-price": readable(merchantColor(pages.products.priceBadgeColor, legacy.pages.products.priceBadgeColor, p.ink, legacy.global.primaryButtonBg), surface),
      "--cart-progress-accent": merchantColor(pages.cart_checkout.progressBarAccent, legacy.global.accentBadge, badge.accent),
      "--radius": (global.borderRadius === legacy.global.borderRadius ? p.radius : global.borderRadius) + "px",
      "--products-cols": String(pages.products.gridColumns === legacy.pages.products.gridColumns ? p.columns : pages.products.gridColumns),
      "--sf-ratio": p.ratio, "--sf-gap": p.gap, "--sf-section-gap": p.sectionGap,
      "--shop-font": storefrontPresets.commerce_signature.display, "--sf-display": p.display, "--sf-display-weight": String(p.weight),
    },
  };
}
