import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { storefrontPresets, resolveStorefrontPreset } from "../src/lib/storefront-presets.ts";
import { resolveStorefrontTheme } from "../src/lib/storefront-theme.ts";
import { resolveUiConfig, uiConfigFromTemplate } from "../src/lib/ui-config.ts";
import { contrastRatio } from "../src/lib/theme-contrast.ts";
import { formatSavings, lineEffectivePrice, nextSaleBoundary, productPricePresentation } from "../src/lib/flash-sale.ts";
import { formatMoney } from "../src/lib/i18n.ts";
import { remainingQuantity } from "../src/lib/variant-stock.ts";
import { storefrontImageSrc, storefrontMediaPatterns } from "../src/lib/storefront-media.ts";

const enabled = { motion_enabled: true, sticky_cta_enabled: true };
const keys = ["fashion_editorial", "tech_precision", "beauty_maison", "gourmet_craft", "commerce_signature"];
const start = Date.parse("2026-09-02T10:00:00Z");
const end = start + 60_000;
const sale = { price: 120, old_price: 150, flash_sale_price: 90,
  flash_sale_starts_at: new Date(start).toISOString(), flash_sale_ends_at: new Date(end).toISOString() };

test("all five sectors resolve distinct palettes, media frames and merchandising rhythms in the initial HTML", () => {
  assert.deepEqual(Object.keys(storefrontPresets).sort(), [...keys].sort());
  const surfaces = new Set(), compositions = new Set();
  for (const key of keys) {
    const config = resolveUiConfig({ storefrontPreset: key });
    const theme = resolveStorefrontTheme(config, enabled);
    assert.equal(theme.preset, key);
    surfaces.add(theme.tokens["--template-bg"]);
    compositions.add([theme.tokens["--sf-ratio"], theme.tokens["--sf-gap"], theme.tokens["--products-cols"]].join());
    for (const lang of ["ar", "en"]) {
      const copy = storefrontPresets[key][lang];
      assert.ok(copy.title && copy.cta && copy.body);
      const html = renderToStaticMarkup(createElement("div", { lang, dir: lang === "ar" ? "rtl" : "ltr",
        "data-storefront-preset": theme.preset, style: theme.tokens }, copy.title));
      assert.ok(html.includes('--template-bg:' + theme.tokens["--template-bg"]));
      assert.ok(html.includes('data-storefront-preset="' + key + '"'));
    }
    for (const [ink, bg] of [["--sf-ink", "--template-bg"], ["--sf-muted", "--template-bg"], ["--hero-text", "--hero-bg"],
      ["--sf-on-badge", "--sf-badge"], ["--primary-ink", "--primary"], ["--sf-on-detail", "--detail-cta-bg"],
      ["--sf-on-checkout", "--checkout-btn-bg"], ["--sf-summary-ink", "--cart-summary-bg"]]) {
      assert.ok(contrastRatio(theme.tokens[ink], theme.tokens[bg]) >= 4.5, key + " " + ink);
    }
  }
  assert.equal(surfaces.size, 5);
  assert.equal(compositions.size, 5);
});

test("legacy templates and stores without a customizer document resolve without a data backfill", () => {
  for (const [template, expected] of Object.entries({
    "modern-minimal": "commerce_signature", "luxury-boutique": "fashion_editorial", "tech-grid": "tech_precision", "vibrant-pop": "beauty_maison",
  })) {
    assert.equal(resolveStorefrontTheme(resolveUiConfig(null, { template }), enabled).preset, expected);
    assert.equal(resolveStorefrontPreset("nonexistent", template), expected);
  }
  for (const invalid of [undefined, null, {}, [], false, 42, "", "toString", "__proto__", "constructor"]) {
    assert.equal(resolveStorefrontPreset(invalid, invalid), "commerce_signature");
  }
});

test("explicit sector overrides the legacy template, survives normalization and accepts existing text-column keys", () => {
  for (const key of keys) {
    const stored = resolveUiConfig({ storefrontPreset: key, baseTemplate: "tech-grid",
      motion_enabled: false, sticky_cta_enabled: false, storefrontLogo: "/brand.webp" });
    const roundTrip = resolveUiConfig(JSON.parse(JSON.stringify(stored)));
    assert.deepEqual(roundTrip, stored);
    assert.equal(resolveStorefrontTheme(roundTrip, enabled).preset, key);
    assert.equal(resolveUiConfig({}, { template: key }).storefrontPreset, key);
  }
});

test("CMS sections, language and merchant overrides take precedence on their respective surfaces", () => {
  const config = resolveUiConfig({ storefrontPreset: "fashion_editorial", defaultLanguage: "en",
    global: { primaryButtonBg: "#777777", cardSurface: "#202020", pageBg: "#F0EBEB", borderRadius: 9 },
    pages: { product_details: { ctaButtonColor: "#FFEE44" }, cart_checkout: { checkoutButtonColor: "#232345" },
      home: { hero_visible: false, hero_title_ar: "مختاراتنا" } }, homeSections: [{ id: "manual", type: "featured_products", visible: false }] });
  const before = JSON.stringify(config);
  const t = resolveStorefrontTheme(config, enabled).tokens;
  assert.equal(t["--primary"], "#767676");
  assert.equal(t["--paper"], "#202020");
  assert.equal(t["--template-bg"], "#F0EBEB");
  assert.equal(t["--sf-on-detail"], "#0B0B0C");
  assert.equal(t["--sf-on-checkout"], "#FFFFFF");
  assert.equal(t["--radius"], "9px");
  const branded = resolveUiConfig({ global: { primaryButtonBg: "#151520", primaryButtonText: "#EAD9B8" } });
  assert.equal(resolveStorefrontTheme(branded, enabled).tokens["--primary-ink"], "#EAD9B8");
  assert.ok(contrastRatio(t["--sf-surface-ink"], t["--paper"]) >= 4.5);
  assert.equal(JSON.stringify(config), before);
});

test("both motion switches and legacy motion intensity constrain animation; sticky is independently gated", () => {
  for (const store of [true, false]) for (const platform of [true, false]) {
    const config = resolveUiConfig({ sticky_cta_enabled: store, motion_enabled: store });
    const resolved = resolveStorefrontTheme(config, { sticky_cta_enabled: platform, motion_enabled: platform });
    assert.equal(resolved.motionEnabled, store && platform);
    assert.equal(resolved.stickyCtaEnabled, store && platform);
  }
  const config = uiConfigFromTemplate("modern-minimal");
  config.global.motionIntensity = "none";
  assert.equal(resolveStorefrontTheme(config, enabled).motionEnabled, false);
  assert.equal(resolveStorefrontTheme(config, enabled).stickyCtaEnabled, true);
  const css = readFileSync(new URL("../src/app/(shop)/storefront.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("price, compare-at and savings agree before, during and at the exact end of a flash sale", () => {
  const normal = { current: 120, compareAt: 150, flash: false, savings: 20 };
  assert.deepEqual(productPricePresentation(sale, start - 1), normal);
  assert.deepEqual(productPricePresentation(sale, start), { current: 90, compareAt: 120, flash: true, savings: 25 });
  assert.deepEqual(productPricePresentation(sale, end), normal);
  assert.deepEqual(productPricePresentation({ ...sale, flash_sale_price: 0, old_price: 90 }, start),
    { current: 120, compareAt: null, flash: false, savings: null });
});

test("cart and checkout reprice stored sale lines and retain the recorded price on legacy lines", () => {
  const line = { ...sale, regular_price: 120, price: 90 };
  assert.equal(lineEffectivePrice(line, start), 90);
  assert.equal(lineEffectivePrice(line, end), 120);
  assert.equal(lineEffectivePrice({ price: 48 }, end), 48);
  assert.equal(nextSaleBoundary([line], start - 1), start);
  assert.equal(nextSaleBoundary([line], start), end);
  assert.equal(nextSaleBoundary([line, { flash_sale_ends_at: "invalid" }], end), Infinity);
});

test("localized money and savings retain fractions, currency and percent signs in both languages", () => {
  for (const [lang, locale] of [["ar", "ar-EG"], ["en", "en-US"]]) {
    assert.equal(formatMoney(1234.5, "EGP", lang), new Intl.NumberFormat(locale, { style: "currency", currency: "EGP" }).format(1234.5));
    assert.equal(formatSavings(25, lang), new Intl.NumberFormat(locale, { style: "percent" }).format(-.25));
  }
  assert.equal(formatMoney(null, "EGP", "en"), "Awaiting pricing");
  assert.equal(formatMoney(null, "EGP", "ar"), "بانتظار التسعير");
});

test("quantity steppers share pair stock and the cross-variant product or store order limit", () => {
  const selected = { id: "p", size: "M", color: "red", stock: 2, productStock: 9, variantStock: true };
  const lines = [{ ...selected, quantity: 1 }, { ...selected, size: "L", quantity: 2 }];
  assert.equal(remainingQuantity(lines, selected, 3), 0);
  assert.equal(remainingQuantity(lines, { ...selected, max_order_qty: 7 }, 3), 1);
  assert.equal(remainingQuantity(lines, { ...selected, stock: 0 }, null), -1);
  assert.equal(remainingQuantity(lines, { ...selected, variantStock: false, stock: 4 }, null), 1);
});

test("local art and approved merchant photography load through same-origin paths", () => {
  const raw = "https://images.unsplash.com/photo-123?w=800&fit=crop";
  const path = storefrontImageSrc(raw, 640);
  assert.ok(path.startsWith("/_next/image?"));
  assert.equal(new URL(path, "https://shop.example").searchParams.get("url"), raw);
  assert.equal(storefrontImageSrc("/_next/static/media/hero.webp", 1920), "/_next/static/media/hero.webp");
  for (const value of ["//example.org/a", "data:image/png,bad", "javascript:noop", "https://example.org/a", null]) {
    assert.equal(storefrontImageSrc(value, 128), null);
  }
  const patterns = storefrontMediaPatterns(
    "https://storage.example",
    "cdn.merchant.example, *.invalid, /path, http://evil.example, https://evil.example/a, -bad.example, bad-.example, metadata.google.internal, app.local, shop.localhost, , ",
  );
  assert.ok(patterns.some(p => p.hostname === "storage.example" && p.pathname === "/storage/v1/object/public/**"));
  assert.ok(patterns.some(p => p.hostname === "cdn.merchant.example"));
  assert.equal(patterns.length, 3);
  assert.equal(storefrontMediaPatterns("not-a-valid-url", "").length, 1);
  assert.equal(storefrontMediaPatterns("http://insecure.example", undefined).length, 1);
});
