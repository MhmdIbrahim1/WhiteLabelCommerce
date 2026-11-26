import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { accentContrast, contrastRatio, isAccentColor } from "../src/lib/theme-contrast.ts";
import { applyPreset, defaultTheme, fontPairs, parsePlatformTheme, presets, radii, resolveTheme } from "../src/lib/platform-theme.ts";

test("sRGB luminance matches WCAG reference ratios, in either order", () => {
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
  assert.equal(contrastRatio("#071022", "#071022"), 1);
  assert.ok(Math.abs(contrastRatio("#ff0000", "#ffffff") - 3.9984767707539985) < 1e-10);
  assert.equal(contrastRatio("#123456", "#EFEFEF"), contrastRatio("#EFEFEF", "#123456"));
});

test("ordinary light and dark accents retain the exact selected fill", () => {
  for (const [accent, foreground] of [["#0b0b0c", "#FFFFFF"], ["#FFFFFF", "#0B0B0C"], ["#ffdb00", "#0B0B0C"]]) {
    const result = accentContrast(accent);
    assert.equal(result.foreground, foreground);
    assert.equal(result.background, accent.toUpperCase());
    assert.ok(result.ratio >= 4.5);
  }
});

test("the midtone gap is corrected on the control without changing the selected brand color", () => {
  for (const [accent, fill, foreground] of [["#777777", "#767676", "#FFFFFF"], ["#787878", "#797979", "#0B0B0C"]]) {
    assert.ok(contrastRatio(accent, "#FFFFFF") < 4.5 && contrastRatio(accent, "#0B0B0C") < 4.5);
    const result = accentContrast(accent);
    assert.equal(result.accent, accent);
    assert.equal(result.background, fill);
    assert.equal(result.foreground, foreground);
    assert.ok(result.ratio >= 4.5);
    assert.equal(result.ratio, contrastRatio(fill, foreground));
  }
});

test("all grayscale values and a 4,096-color RGB grid produce a passing deterministic pair", () => {
  const channel = n => n.toString(16).padStart(2, "0");
  const colors = Array.from({ length: 256 }, (_, n) => "#" + channel(n).repeat(3));
  for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
    colors.push("#" + [r, g, b].map(channel).join(""));
  }
  for (const color of colors) {
    const result = accentContrast(color);
    assert.ok(["#FFFFFF", "#0B0B0C"].includes(result.foreground));
    assert.ok(contrastRatio(result.background, result.foreground) >= 4.5, color);
    if (contrastRatio(color, result.foreground) >= 4.5) assert.equal(result.background, color.toUpperCase());
  }
});

test("the public fallback matches every default seeded in PostgreSQL", () => {
  const sql = readFileSync(new URL("../../shared/platform-theme.sql", import.meta.url), "utf8");
  for (const [field, value] of Object.entries(defaultTheme)) {
    const literal = typeof value === "string"
      ? (value.includes("\n") ? "E" : "") + "'" + value.replaceAll("\n", "\\n") + "'"
      : String(value);
    const column = sql.split("\n").find(line => line.trimStart().startsWith(field + " "));
    assert.ok(column?.includes("default " + literal), field);
  }
  assert.deepEqual(parsePlatformTheme(defaultTheme), defaultTheme);
  const tokens = resolveTheme(defaultTheme);
  assert.equal(tokens["--pt-surface"], "#FFFFFF");
  assert.equal(tokens["--pt-card"], "#F4F4F5");
  assert.equal(tokens["--pt-fill"], "#0B0B0C");
  assert.equal(tokens["--pt-ink"], "#111315");
  assert.equal(tokens["--pt-card-radius"], "24px");
  assert.match(tokens["--pt-font"], /IBM Plex Sans Arabic/);
});

test("all three presets supply readable surfaces and preserve copy, switches and revision", () => {
  const custom = { ...defaultTheme, hero_title_en: "A field guide", hero_title_ar: "دليل المتجر", revision: 8,
    sticky_cta_enabled: false, motion_enabled: false };
  const surfaces = new Set();
  for (const preset of presets) {
    const theme = applyPreset(custom, preset);
    const tokens = resolveTheme(theme);
    assert.deepEqual(parsePlatformTheme(theme), theme);
    surfaces.add(tokens["--pt-surface"]);
    for (const field of ["hero_title_en", "hero_title_ar", "revision", "sticky_cta_enabled", "motion_enabled"]) {
      assert.equal(theme[field], custom[field]);
    }
    for (const surface of ["--pt-surface", "--pt-card"]) for (const ink of ["--pt-ink", "--pt-muted"]) {
      assert.ok(contrastRatio(tokens[surface], tokens[ink]) >= 4.5);
    }
  }
  assert.equal(surfaces.size, 3);
  assert.equal(custom.preset, "commerce_crisp");
});

test("radius, type and accessible accent overrides are resolved independently of the preset", () => {
  const sizes = new Set(radii.map(radius_scale => resolveTheme({ ...defaultTheme, radius_scale })["--pt-card-radius"]));
  const families = new Set(fontPairs.map(font_pair => resolveTheme({ ...defaultTheme, font_pair })["--pt-font"]));
  assert.equal(sizes.size, radii.length);
  assert.equal(families.size, fontPairs.length);
  const tokens = resolveTheme({ ...defaultTheme, accent_color: "#777777" });
  assert.equal(tokens["--pt-accent"], "#777777");
  assert.equal(tokens["--pt-fill"], "#767676");
  assert.equal(tokens["--pt-on-fill"], "#FFFFFF");
});

test("the write parser rejects missing, invalid or unbounded fields", () => {
  for (const value of [null, {}, [], "red"]) assert.equal(parsePlatformTheme(value), null);
  for (const patch of [
    { preset: "toString" }, { radius_scale: "large" }, { font_pair: "url(foo)" },
    { accent_color: "#abc" }, { accent_color: "#FFFFFF\n" }, { motion_enabled: "false" }, { sticky_cta_enabled: null },
    { revision: 0 }, { revision: 1.5 }, { revision: "1" }, { revision: 2147483648 }, { hero_title_ar: " \n " },
    { hero_title_en: "x".repeat(101) }, { hero_subtitle_ar: "ع".repeat(281) }, { hero_subtitle_en: "bad\0text" },
  ]) assert.equal(parsePlatformTheme({ ...defaultTheme, ...patch }), null, Object.keys(patch)[0]);
  for (const bad of ["#fff", "#12345678", "red", " #ffeeaa", null]) {
    assert.equal(isAccentColor(bad), false);
    assert.equal(accentContrast(bad).accent, defaultTheme.accent_color);
  }
});

test("valid settings preserve intentional line breaks and false switches, and ignore audit attributes", () => {
  const draft = { ...defaultTheme, hero_title_ar: "  أهلاً\nبمتجرك  ", accent_color: "#aa22dd", motion_enabled: false,
    sticky_cta_enabled: false, revision: 42, updated_by: "ignored" };
  const normalized = parsePlatformTheme(draft);
  assert.equal(normalized.hero_title_ar, "أهلاً\nبمتجرك");
  assert.equal(normalized.accent_color, "#AA22DD");
  assert.equal(normalized.motion_enabled, false);
  assert.equal(normalized.sticky_cta_enabled, false);
  assert.equal(normalized.revision, 42);
  assert.equal("updated_by" in normalized, false);
});
