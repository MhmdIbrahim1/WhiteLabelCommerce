import test from "node:test";
import assert from "node:assert/strict";
import { CARD_RATIOS, resolveUiConfig, templates } from "../src/lib/ui-config.ts";
import { storefrontPresets } from "../src/lib/storefront-presets.ts";
import { resolveStorefrontTheme, storefrontDesign, storefrontSurfaceProps } from "../src/lib/storefront-theme.ts";
import { mergeStudioDraft, parseStudioDraft, prepareStudioPublish, presetDraft, sameStudioDraft, studioColors, studioPreviewBase } from "../src/lib/storefront-studio.ts";
import { isPreviewPeer, previewLanguage, previewMessage, previewMode, previewNavigate, previewPagePath, previewReady, readFrameMessage, readPreviewUpdate, studioFrameSrc } from "../src/lib/storefront-preview.ts";
import { contrastRatio } from "../src/lib/theme-contrast.ts";

const gates = { motion_enabled: true, sticky_cta_enabled: true };
const fallback = { template: "tech-grid", primary: "#47284E", accent: "#ACCAFE", surface: "#FAF9F4", radius: 17 };
const slug = "omar-a7a";
const origin = "https://shopstage.live";
const baseline = {
  defaultLanguage: "en", storefrontLogo: "/shop/logo.webp", campaignSettings: { audience: ["members"], active: true },
  global: { pageBg: "#DDCCBA", futureToken: { ids: [7, 8] } },
  homeSections: [{ type: "featured_products", id: "merchants-choice", title: "Our edit", visible: true, limit: 7 }],
  pages: {
    home: { hero_title_en: "A merchant title", hero_cta_link: "/products?flash=1", hero_image_url: "/hero.webp",
      promo_banners: [{ id: "kept", title_en: "Summer", futureFlag: true }], future: { source: "cms" } },
    products: { gridColumns: 3, cardHoverEffect: "glow", future: ["keep"] },
    product_details: { ctaButtonColor: "#325666", customLayout: 2 },
    cart_checkout: { checkoutButtonColor: "#123445" }, futurePage: { published: false },
  },
};
const config = resolveUiConfig(baseline, fallback);
const original = storefrontDesign(config);

test("legacy settings open with the actual Phase 3A palette, layout and merchant column fallbacks", () => {
  assert.equal(original.storefrontPreset, "tech_precision");
  assert.equal(original.primaryButtonBg, fallback.primary);
  assert.equal(original.borderRadius, fallback.radius);
  assert.equal(original.pageBg, "#DDCCBA");
  assert.equal(original.gridColumns, 3);
  assert.deepEqual(parseStudioDraft(original), original);
  for (const template of Object.keys(templates)) {
    const old = resolveUiConfig(null, { template });
    const design = storefrontDesign(old);
    const p = storefrontPresets[design.storefrontPreset];
    assert.equal(design.cardSurface, p.page);
    assert.equal(design.borderRadius, p.radius);
    assert.equal(design.gridColumns, p.columns);
  }
});

test("all five switches and resets restore the selected sector's resolved defaults without changing the saved draft", () => {
  for (const key of Object.keys(storefrontPresets)) {
    const switched = presetDraft(key, config.baseTemplate);
    const custom = { ...switched, primaryButtonBg: "#336699", fontPair: "readex", hero_visible: false };
    assert.equal(sameStudioDraft(custom, switched), false);
    const reset = presetDraft(custom.storefrontPreset, config.baseTemplate);
    assert.deepEqual(reset, switched);
    assert.deepEqual(storefrontDesign(resolveUiConfig(mergeStudioDraft(baseline, reset), fallback)), reset);
    const p = storefrontPresets[key];
    assert.deepEqual([reset.primaryButtonBg, reset.accentBadge, reset.pageBg, reset.heroBg, reset.gridColumns, reset.borderRadius],
      [p.action, p.accent, p.page, p.hero, p.columns, p.radius]);
    assert.equal(reset.fontPair, "preset");
    assert.equal(reset.cardAspectRatio, "preset");
    assert.equal(sameStudioDraft(original, storefrontDesign(config)), true);
  }
});

test("publishing patches only owned leaves of the latest JSONB, including when another editor added content", () => {
  const latest = structuredClone(baseline);
  latest.pages.home.promo_banners.push({ id: "concurrent", cta_link: "/products", nested: { preserve: 0 } });
  const before = structuredClone(latest);
  const draft = { ...original, fontPair: "alexandria", cardAspectRatio: "1 / 1", sticky_cta_enabled: false };
  const published = mergeStudioDraft(latest, draft);
  assert.deepEqual(latest, before);
  for (const key of ["storefrontLogo", "campaignSettings", "defaultLanguage", "homeSections"]) assert.deepEqual(published[key], latest[key]);
  for (const key of ["product_details", "cart_checkout", "futurePage"]) assert.deepEqual(published.pages[key], latest.pages[key]);
  for (const key of Object.keys(latest.pages.home)) assert.deepEqual(published.pages.home[key], latest.pages.home[key]);
  assert.deepEqual(published.global.futureToken, latest.global.futureToken);
  assert.deepEqual(published.pages.products.future, latest.pages.products.future);
  assert.equal(published.pages.products.cardHoverEffect, "glow");
  assert.deepEqual(mergeStudioDraft(published, draft), published);
  assert.deepEqual(storefrontDesign(resolveUiConfig(published, fallback)), draft);
});

test("explicit choices equal to an old template sentinel still set the requested real storefront token", () => {
  const legacy = templates["modern-minimal"];
  const draft = { ...presetDraft("gourmet_craft", "modern-minimal"), pageBg: legacy.background,
    cardSurface: legacy.surface, primaryButtonBg: legacy.primary, accentBadge: legacy.accent,
    heroBg: legacy.primary, borderRadius: legacy.radius, gridColumns: 4 };
  const saved = resolveUiConfig(mergeStudioDraft({}, draft));
  const theme = resolveStorefrontTheme(saved, gates);
  assert.equal(theme.tokens["--primary"], legacy.primary);
  assert.equal(theme.tokens["--secondary"], legacy.accent);
  assert.equal(theme.tokens["--hero-bg"], legacy.primary);
  assert.equal(theme.tokens["--template-bg"], legacy.background);
  assert.equal(theme.tokens["--paper"], legacy.surface);
  assert.equal(theme.tokens["--radius"], "12px");
  assert.equal(theme.tokens["--products-cols"], "4");
  assert.deepEqual(storefrontDesign(saved), draft);
});

test("preset reset releases custom detail, checkout, price and ink colors while retaining page content", () => {
  const raw = { ...baseline, global: { primaryButtonText: "#FEF3EA" }, pages: { ...baseline.pages,
    home: { ...baseline.pages.home, heroText: "#ECEEEC" }, products: { priceBadgeColor: "#302A29" } } };
  for (const template of Object.keys(templates)) for (const key of Object.keys(storefrontPresets)) {
    const defaults = presetDraft(key, template);
    const actual = resolveUiConfig(mergeStudioDraft(raw, defaults), { template });
    const expected = resolveUiConfig({ storefrontPreset: key, baseTemplate: template });
    assert.deepEqual(resolveStorefrontTheme(actual, gates).tokens, resolveStorefrontTheme(expected, gates).tokens);
    assert.equal(actual.pages.home.hero_title_en, "A merchant title");
    assert.equal(actual.pages.home.promo_banners[0].id, "kept");
  }
});

test("publishing retries from the latest content, rejects stale styles, and recognizes an already committed draft", () => {
  const draft = { ...original, pageBg: "#ECEAEA" };
  const latest = { ...baseline, futureCampaign: { locale: "ar", id: 32 } };
  const next = prepareStudioPublish(latest, storefrontDesign(resolveUiConfig(latest, fallback)), original, draft);
  assert.equal(next.status, "write");
  assert.deepEqual(next.config.futureCampaign, latest.futureCampaign);
  const published = storefrontDesign(resolveUiConfig(next.config, fallback));
  assert.deepEqual(prepareStudioPublish(next.config, published, original, draft), { status: "published" });
  assert.deepEqual(prepareStudioPublish(next.config, published, original, { ...draft, borderRadius: 2 }), { status: "conflict" });
});

test("font pairing, image ratio, density, hero settings, contrast and platform gates reach the shared surface", () => {
  for (const font of ["ibm_plex", "alexandria", "readex"]) for (const ratio of CARD_RATIOS) {
    const draft = { ...original, fontPair: font, cardAspectRatio: ratio, gridColumns: 5, borderRadius: 0,
      primaryButtonBg: "#777777", accentBadge: "#EEEEEE", pageBg: "#151515", cardSurface: "#161616",
      heroLayout: "full-bleed", hero_visible: false, hero_cta_visible: false };
    const cfg = resolveUiConfig(mergeStudioDraft(baseline, draft), fallback);
    const theme = resolveStorefrontTheme(cfg, { motion_enabled: false, sticky_cta_enabled: false });
    const attrs = storefrontSurfaceProps(cfg, theme);
    assert.equal(attrs["data-storefront-preset"], "tech_precision");
    assert.equal(attrs["data-hero-layout"], "full-bleed");
    assert.equal(attrs["data-entrance"], "none");
    assert.equal(attrs["data-sticky-cta"], false);
    assert.equal(cfg.pages.home.hero_visible, false);
    assert.equal(cfg.pages.home.hero_cta_visible, false);
    assert.match(attrs.style["--shop-font"], { ibm_plex: /DM Sans/, alexandria: /Alexandria/, readex: /Readex/ }[font]);
    assert.equal(attrs.style["--sf-display"], attrs.style["--shop-font"]);
    assert.equal(attrs.style["--sf-ratio"], ratio === "preset" ? "1 / 1" : ratio);
    assert.equal(attrs.style["--products-cols"], "5");
    assert.equal(attrs.style["--radius"], "0px");
    assert.ok(contrastRatio(attrs.style["--primary-ink"], attrs.style["--primary"]) >= 4.5);
  }
});

test("the frame and a published reload produce identical theme variables for full and sparse legacy JSON", () => {
  for (const raw of [baseline, null, {}, { global: { primaryButtonBg: "#415134" } }, { pages: { products: {}, product_details: {} } }]) {
    const legacy = resolveUiConfig(raw, fallback);
    const base = studioPreviewBase(raw, legacy);
    assert.equal(Object.hasOwn(base, "campaignSettings"), false);
    assert.equal(Object.hasOwn(base.pages, "futurePage"), false);
    const draft = { ...presetDraft("fashion_editorial", legacy.baseTemplate), cardSurface: "#1B2932", primaryButtonBg: "#ABCDEF" };
    const frame = resolveUiConfig(mergeStudioDraft(base, draft));
    const saved = resolveUiConfig(mergeStudioDraft(raw, draft), fallback);
    assert.deepEqual(storefrontSurfaceProps(frame, resolveStorefrontTheme(frame, gates)), storefrontSurfaceProps(saved, resolveStorefrontTheme(saved, gates)));
  }
});

test("both schema boundaries reject malformed or unrecognized fields and canonicalize safe hex", () => {
  const rejects = [null, [], {}, Object.create(original), { ...original, store_id: "other" }, { ...original, css: {} },
    { ...original, hero_image_url: "javascript:invalid" }, { ...original, global: { primaryButtonBg: "#123456" } },
    ...["toString", "__proto__", "future", null, 3].map(value => ({ ...original, storefrontPreset: value })),
    ...studioColors.flatMap(key => ["#123", "#001122ff", " #001122", "#123456\n", "red", "url(example)", "#000000; color:red", null]
      .map(value => ({ ...original, [key]: value }))),
    ...[-1, 25, 0.5, "12", NaN, Infinity].map(value => ({ ...original, borderRadius: value })),
    ...[0, 1, 6, "3"].map(value => ({ ...original, gridColumns: value })),
    { ...original, cardAspectRatio: "1 / 1; display:none" }, { ...original, fontPair: "url(example)" },
    { ...original, checkoutButtonColor: "url(example)" }, { ...original, heroText: "transparent" },
    { ...original, heroLayout: "auto" }, { ...original, motionIntensity: "fast" }, { ...original, hero_visible: 1 },
    { ...original, sticky_cta_enabled: "true" }, { ...original, motion_enabled: null }];
  for (const key of Object.keys(original)) {
    const missing = { ...original }; delete missing[key]; rejects.push(missing);
  }
  for (const candidate of rejects) {
    assert.equal(parseStudioDraft(candidate), null);
    assert.equal(readPreviewUpdate(previewMessage(slug, "dark", candidate), slug), null);
  }
  assert.equal(parseStudioDraft({ ...original, accentBadge: "#aabbcc" }).accentBadge, "#AABBCC");
});

test("frame updates, readiness and navigation require the expected peer, origin, envelope and tenant", () => {
  const frame = {}, sibling = {};
  assert.equal(isPreviewPeer({ origin, source: frame }, origin, frame), true);
  for (const [event, peer] of [[{ origin: "https://other.shopstage.live", source: frame }, frame],
    [{ origin, source: sibling }, frame], [{ origin, source: null }, null]]) assert.equal(isPreviewPeer(event, origin, peer), false);
  assert.equal(isPreviewPeer({ origin: "null", source: frame }, "null", frame), false);
  const good = previewMessage(slug, "dark", original);
  assert.deepEqual(readPreviewUpdate(good, slug), { mode: "dark", draft: original });
  for (const bad of [null, { ...good, slug: "nova-store" }, { ...good, mode: "system" }, { ...good, type: previewReady },
    { ...good, css: "red" }, { ...good, locale: "en" }]) assert.equal(readPreviewUpdate(bad, slug), null);
  assert.deepEqual(readFrameMessage({ type: previewReady, slug }, slug), { type: previewReady });
  assert.equal(readFrameMessage({ type: previewReady, slug, draft: original }, slug), null);
  assert.equal(readFrameMessage({ type: previewNavigate, slug: "another", path: "/" }, slug), null);
  assert.deepEqual(readFrameMessage({ type: previewNavigate, slug, path: "/products/abc" }, slug), { type: previewNavigate, path: "/products/abc" });
  assert.deepEqual(readFrameMessage({ type: previewLanguage, slug, lang: "ar" }, slug), { type: previewLanguage, lang: "ar" });
  assert.deepEqual(readFrameMessage({ type: previewMode, slug, mode: "dark" }, slug), { type: previewMode, mode: "dark" });
  assert.equal(readFrameMessage({ type: previewLanguage, slug, lang: "de" }, slug), null);
  assert.equal(readFrameMessage({ type: previewMode, slug, mode: "auto" }, slug), null);
});

test("frame URLs stay on the storefront alias and change locale without inheriting an external or administrative destination", () => {
  for (const path of ["/", "/products", "/products/abc-123", "/products?category=one&flash=1"]) {
    assert.equal(previewPagePath(path), path);
    const url = new URL(studioFrameSrc(slug, path, "ar"), origin);
    assert.equal(url.origin, origin);
    assert.equal(url.searchParams.get("studioPreview"), "ar");
    assert.ok(url.pathname.startsWith("/s/" + slug));
  }
  for (const bad of ["//other.example", "/admin", "/super-admin", "/products/../admin", "/products/%2Fadmin",
    "/products\\admin", "/s/other/products", "https://example.org", "javascript:invalid", "/checkout", "/products?return=https://example.org",
    "/products?flash=1&flash=0", {}, ""]) {
    assert.equal(previewPagePath(bad), null);
    assert.equal(readFrameMessage({ type: previewNavigate, slug, path: bad }, slug), null);
    assert.throws(() => studioFrameSrc(slug, bad, "ar"));
  }
  assert.throws(() => studioFrameSrc("../admin", "/", "ar"));
  assert.throws(() => studioFrameSrc(slug, "/", "de"));
  assert.equal(previewPagePath("/products?studioPreview=en&flash=1"), "/products?flash=1");
});
