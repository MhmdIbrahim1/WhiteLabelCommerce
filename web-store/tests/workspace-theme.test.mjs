import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { platformAuthScreen, storePath } from "../src/lib/host-routing.ts";
import { applyPreset, defaultTheme, fontPairs, presets, radii, resolveTheme } from "../src/lib/platform-theme.ts";
import { contrastRatio } from "../src/lib/theme-contrast.ts";
import { parseWorkspaceMode, resolveWorkspaceTokens, workspaceModeCookie, workspacePreferenceCookie } from "../src/lib/workspace-theme.ts";

const require = createRequire(import.meta.url);
const { RequestCookies, ResponseCookies } = require("next/dist/compiled/@edge-runtime/cookies");

test("SSR chooses light for a first visit or an unrecognized preference", () => {
  for (const value of [undefined, null, "", "LIGHT", "Dark", "dark ", "system", "executive_dark", false, {}]) {
    assert.equal(parseWorkspaceMode(value), "light");
  }
  assert.equal(parseWorkspaceMode("dark"), "dark");
  assert.equal(parseWorkspaceMode("light"), "light");
});

test("the preference round-trips in Next's cookie jar on HTTP and HTTPS", () => {
  for (const secure of [false, true]) for (const mode of ["light", "dark"]) {
    const headers = new Headers();
    new ResponseCookies(headers).set(workspacePreferenceCookie(mode, secure));
    const cookie = headers.get("set-cookie");
    assert.match(cookie, /Max-Age=31536000/i);
    assert.match(cookie, /Path=\/(?:;|$)/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.match(cookie, /HttpOnly/i);
    assert.equal(/; Secure(?:;|$)/i.test(cookie), secure);
    assert.doesNotMatch(cookie, /Domain=/i);
    const incoming = new RequestCookies(new Headers({ cookie: "lang=en; " + cookie.split(";")[0] }));
    assert.equal(parseWorkspaceMode(incoming.get(workspaceModeCookie)?.value), mode);
  }
});

test("unrelated cookies cannot select dark mode and unsupported preference writes fail", () => {
  const cookies = new RequestCookies(new Headers({ cookie: "tenant_mode=dark; wlc_workspace_mode=system" }));
  assert.equal(parseWorkspaceMode(cookies.get(workspaceModeCookie)?.value), "light");
  for (const value of ["system", null, false, {}, "dark; Path=/"]) {
    assert.throws(() => workspacePreferenceCookie(value, true), TypeError);
  }
});

test("workspace surfaces follow the personal mode across every published landing preset", () => {
  for (const preset of presets) {
    const theme = applyPreset(defaultTheme, preset);
    const light = resolveWorkspaceTokens(theme, parseWorkspaceMode(undefined));
    const dark = resolveWorkspaceTokens(theme, "dark");
    assert.deepEqual([light["--ws-canvas"], light["--pt-surface"], light["--pt-ink"]], ["#F6F6F7", "#FFFFFF", "#111315"]);
    assert.deepEqual([dark["--ws-canvas"], dark["--pt-surface"], dark["--pt-line"]], ["#0B0C0E", "#121418", "#23262D"]);
  }
  assert.equal(resolveWorkspaceTokens(defaultTheme, "light")["--pt-fill"], "#0B0B0C");
});

test("both modes retain the selected local type, radius and guarded brand fill", () => {
  for (const mode of ["light", "dark"]) for (const radius_scale of radii) for (const font_pair of fontPairs) {
    const theme = Object.freeze({ ...defaultTheme, font_pair, radius_scale, accent_color: "#777777", revision: 9 });
    const published = resolveTheme(theme);
    const workspace = resolveWorkspaceTokens(theme, mode);
    for (const role of ["--pt-font", "--pt-radius", "--pt-card-radius", "--pt-fill", "--pt-on-fill", "--pt-accent"]) {
      assert.equal(workspace[role], published[role]);
    }
    assert.equal(workspace["--pt-accent"], "#777777");
    assert.equal(workspace["--pt-fill"], "#767676");
  }
});

test("text, status, links and focus remain legible on each surface for extreme and midtone accents", () => {
  for (const mode of ["light", "dark"]) for (const accent_color of ["#000000", "#FFFFFF", "#777777", "#787878", "#FFDD00", "#064A56", "#D1E5AB"]) {
    const theme = resolveWorkspaceTokens({ ...defaultTheme, accent_color }, mode);
    const surfaces = ["--pt-surface", "--pt-card", "--ws-canvas"].map(key => theme[key]);
    const brandLinkPasses = surfaces.every(surface => contrastRatio(accent_color, surface) >= 4.5);
    assert.equal(theme["--ws-link"], brandLinkPasses ? accent_color : theme["--pt-ink"]);
    for (const surface of surfaces) {
      for (const key of ["--pt-ink", "--pt-muted", "--ws-good", "--ws-danger", "--ws-link"]) {
        assert.ok(contrastRatio(theme[key], surface) >= 4.5, mode + " " + key);
      }
      assert.ok(contrastRatio(theme["--ws-control-line"], surface) >= 3);
    }
    assert.ok(contrastRatio(theme["--pt-on-fill"], theme["--pt-fill"]) >= 4.5);
  }
});

test("only the three bare platform auth routes use platform chrome", () => {
  for (const [path, screen] of [["/login", "login"], ["/register", "register"], ["/auth/reset-password", "reset-password"]]) {
    assert.equal(platformAuthScreen(true, false, path), screen);
    assert.equal(platformAuthScreen(false, false, path), null);
    for (const prefix of ["/s/nova-store", "/store/omar-a7a"]) {
      const alias = storePath(prefix + path);
      assert.equal(alias.pathname, path);
      assert.equal(platformAuthScreen(true, Boolean(alias), alias.pathname), null);
    }
  }
  for (const path of ["/", "/admin", "/login/child", "/account", "/platform-access/login", "/auth/callback", "/api/auth/password-reset"]) {
    assert.equal(platformAuthScreen(true, false, path), null);
  }
});
