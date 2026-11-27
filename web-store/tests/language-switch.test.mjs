import assert from "node:assert/strict";
import test from "node:test";
import * as i18n from "../src/lib/i18n.ts";
import * as tenant from "../src/lib/tenant-shared.ts";
import { label, nodes, replaceGlobal, view } from "./helpers/auth-view.mjs";
import { loadSource } from "./helpers/load-source.mjs";

const login = "https://shopstage.live/login?next=%2Fcreate-store#form";

function browser(t, options = {}) {
  let cookie = options.cookie ?? "";
  let stored = options.stored ?? null;
  let pending = false;
  let value;
  const calls = [];
  const listeners = new Map();
  const documentElement = { lang: "ar-EG", dir: "rtl" };
  replaceGlobal(t, "document", {
    documentElement,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name) { listeners.delete(name); },
    get cookie() { return cookie; },
    set cookie(raw) {
      calls.push("cookie");
      if (!options.blockCookie) cookie = raw.split(";")[0];
    },
  });
  const location = { href: options.url ?? login, origin: new URL(login).origin,
    replace: url => calls.push(url), assign: url => calls.push(url) };
  replaceGlobal(t, "window", { location });
  replaceGlobal(t, "localStorage", {
    getItem: key => key === i18n.LANG_STORAGE_KEY ? stored : null,
    setItem(key, language) {
      assert.equal(key, i18n.LANG_STORAGE_KEY);
      if (options.blockStorage) throw new Error("Storage unavailable");
      stored = language;
    },
  });
  const router = { refresh: () => calls.push("refresh") };
  const transition = work => { pending = true; calls.push("transition"); work(); };
  const app = view("components/language-provider.tsx", {
    "next/navigation": { useRouter: () => router },
    "lucide-react": { Globe: "globe", LoaderCircle: "loader" },
    "@/components/use-hydrated": { useHydrated: () => options.interactive !== false },
    "@/lib/i18n": i18n,
  }, { useTransition: () => [pending, transition], useContext: () => value });
  return {
    calls, documentElement, listeners,
    get stored() { return stored; },
    get cookie() { return cookie; },
    draw(lang, preview = false) {
      value = app.render("LanguageProvider", { initialLang: lang, preview, children: null }).props.value;
      app.flush();
      return value;
    },
    toggle: () => app.render("LanguageToggle", {}),
    finish: () => { pending = false; },
  };
}

test("language and document direction follow only the server commit throughout a refresh in either direction", t => {
  const b = browser(t, { cookie: "nova_lang=ar" });
  for (const [from, to] of [["ar", "en"], ["en", "ar"]]) {
    const initial = b.draw(from);
    const idleToggle = b.toggle();
    assert.equal(idleToggle.props.disabled, false);
    assert.equal(idleToggle.props["aria-busy"], undefined);
    const start = b.calls.length;
    initial.setLang(from);
    idleToggle.props.onClick();
    initial.setLang(to);
    assert.equal(b.cookie, "nova_lang=" + to);
    assert.equal(b.stored, to);
    assert.deepEqual(b.calls.slice(start), ["cookie", "transition", "refresh"]);
    const waiting = b.draw(from);
    assert.equal(waiting.pending, true);
    assert.equal(waiting.lang, from);
    assert.equal(waiting.t("navOrders"), i18n.DICT[from].navOrders);
    assert.deepEqual(b.documentElement, { lang: i18n.langHtmlAttr(from), dir: i18n.langDir(from) });
    const busyToggle = b.toggle();
    assert.equal(busyToggle.props.disabled, true);
    assert.equal(busyToggle.props["aria-busy"], true);
    assert.equal(label(busyToggle), label(idleToggle));
    assert.equal(nodes(busyToggle).find(n => n.type === "loader").props.size, nodes(idleToggle).find(n => n.type === "globe").props.size);
    busyToggle.props.onClick();
    assert.deepEqual(b.calls.slice(start), ["cookie", "transition", "refresh"]);
    b.finish();
    const committed = b.draw(to);
    assert.equal(committed.lang, to);
    assert.equal(committed.pending, false);
    assert.equal(committed.t("navOrders"), i18n.DICT[to].navOrders);
    assert.deepEqual(b.documentElement, { lang: i18n.langHtmlAttr(to), dir: i18n.langDir(to) });
    assert.equal(b.toggle().props.disabled, false);
  }
  // A fresh server render can select another language without a local toggle.
  assert.equal(b.draw("en").lang, "en");
  assert.equal(b.documentElement.dir, "ltr");
});

test("first visit restores localStorage once through the same pending server refresh", t => {
  const b = browser(t, { stored: "en" });
  assert.equal(b.draw("ar").lang, "ar");
  assert.deepEqual(b.calls, ["cookie", "transition", "refresh"]);
  assert.equal(b.draw("ar").pending, true);
  assert.equal(b.documentElement.dir, "rtl");
  b.finish();
  assert.equal(b.draw("en").lang, "en");
  assert.equal(b.documentElement.dir, "ltr");
  assert.equal(b.calls.length, 3);
});

test("a present language cookie wins over localStorage and blocked localStorage does not prevent switching", t => {
  const b = browser(t, { cookie: "other=1; nova_lang=en", stored: "ar", blockStorage: true });
  const en = b.draw("en");
  assert.deepEqual(b.calls, []);
  en.toggleLang();
  assert.equal(b.cookie, "nova_lang=ar");
  assert.deepEqual(b.calls, ["cookie", "transition", "refresh"]);
});

test("a rejected cookie write switches the same URL with a validated server-readable locale", t => {
  const b = browser(t, { cookie: "nova_lang=ar", blockCookie: true });
  const current = b.draw("ar");
  current.toggleLang();
  current.toggleLang();
  const url = new URL(b.calls.at(-1));
  assert.equal(url.origin + url.pathname, "https://shopstage.live/login");
  assert.equal(url.searchParams.get("next"), "/create-store");
  assert.equal(url.searchParams.get(i18n.LANG_COOKIE), "en");
  assert.equal(url.hash, "#form");
  assert.equal(b.calls.length, 3);
  assert.equal(b.cookie, "nova_lang=ar");
  assert.equal(b.documentElement.dir, "rtl");
});

test("an explicit URL locale survives restoration and is removed when cookies work again", t => {
  const b = browser(t, { url: login.replace("#", "&nova_lang=en#"), stored: "ar" });
  const en = b.draw("en");
  assert.deepEqual(b.calls, []);
  en.toggleLang();
  assert.equal(b.cookie, "nova_lang=ar");
  assert.equal(b.calls.at(-1), login);
});

test("cookie-free internal links retain the locale across shared layouts", t => {
  class Link {
    constructor(href) { this.href = href; this.hash = new URL(href).hash; }
    closest() { return this; }
    hasAttribute() { return false; }
  }
  replaceGlobal(t, "Element", Link);
  const b = browser(t, { url: login.replace("#", "&nova_lang=en#"), blockCookie: true });
  b.draw("en");
  const follow = b.listeners.get("click");
  function click(href, overrides = {}) {
    let prevented = false;
    follow({ button: 0, target: new Link(href), preventDefault() { prevented = true; }, ...overrides });
    return prevented;
  }
  const register = "https://shopstage.live/register?next=%2Fcreate-store#email";
  assert.equal(click(register), true);
  assert.equal(b.calls.at(-1), register.replace("#", "&nova_lang=en#"));
  assert.equal(click("https://shopstage.live/invite/sample?nova_lang=ar"), true);
  assert.equal(b.calls.at(-1), "https://shopstage.live/invite/sample?nova_lang=ar");
  assert.equal(click(register, { ctrlKey: true }), false);
  assert.equal(click("https://outside.example/register"), false);
  assert.equal(click("https://shopstage.live/api/download"), false);
  assert.equal(b.calls.length, 2);
});

test("studio preview ignores writes and document effects, and the toggle waits for hydration", t => {
  const b = browser(t, { stored: "ar", interactive: false });
  const en = b.draw("en", true);
  en.toggleLang();
  assert.equal(b.toggle().props.disabled, true);
  assert.equal(en.lang, "en");
  assert.equal(b.documentElement.lang, "ar-EG");
  assert.deepEqual(b.calls, []);
});

function serverRequest({ cookie, preview, page, store = false }) {
  const hdrs = new Headers();
  if (store) hdrs.set(tenant.STORE_ID_HEADER, tenant.DEFAULT_STORE_ID);
  if (preview) hdrs.set(tenant.STUDIO_LOCALE_HEADER, preview);
  if (page) hdrs.set(tenant.PAGE_LOCALE_HEADER, page);
  const request = {
    headers: async () => hdrs,
    cookies: async () => ({ get: key => key === i18n.LANG_COOKIE && cookie ? { value: cookie } : undefined }),
  };
  return { request, language: loadSource("lib/i18n-server.ts", {
    "next/headers": request, "./i18n": i18n, "./tenant-shared": tenant,
  }) };
}

test("RootLayout resolves preview, explicit URL locale and cookie before reading tenant settings", async () => {
  for (const [input, expected, reads] of [
    [{ store: true, preview: "ar", cookie: "en", page: "en" }, "ar", 0],
    [{ store: true, page: "en", cookie: "ar" }, "en", 0],
    [{ store: true, cookie: "ar" }, "ar", 0],
    [{ store: true, cookie: "fr" }, "en", 1],
    [{ store: true }, "en", 1],
    [{}, "ar", 0],
  ]) {
    const { request, language } = serverRequest(input);
    let lookups = 0;
    const { default: layout } = loadSource("app/layout.tsx", {
      "next/headers": request, "@/lib/brand": { storeName: "Store", colors: {} }, "@/lib/i18n": i18n,
      "@/lib/i18n-server": language, "@/lib/tenant-shared": tenant,
      "@/lib/shop": { settings: async () => { lookups++; return { uiConfig: { defaultLanguage: "en" } }; } },
      "@/lib/db": { requestUser: async () => null }, "@/components/language-provider": { LanguageProvider: "provider" },
      "@/components/auth-session": { AuthSessionProvider: "session" }, "@/components/floating-toast": { FloatingToastHost: "toast" },
      "./globals.css": {},
    });
    const root = await layout({ children: null });
    assert.equal(root.props.lang, i18n.langHtmlAttr(expected));
    assert.equal(root.props.dir, i18n.langDir(expected));
    assert.equal(nodes(root).find(n => n.type === "provider").props.initialLang, expected);
    assert.equal(lookups, reads);
  }
});

test("platform auth uses the platform language directly without loading store settings", async () => {
  const { language } = serverRequest({});
  const { default: access } = loadSource("app/platform-access/[screen]/page.tsx", {
    "next/link": "a", "next/navigation": {}, "@/components/workspace-surface": { WorkspaceSurface: "workspace" },
    "@/components/access-shell": { AccessShell: "shell" }, "@/components/shop/hybrid-auth-panel": { HybridAuthPanel: "form" },
    "@/components/shop/recovery-panel": { RecoveryPanel: "recovery" }, "@/lib/auth-destination": {},
    "@/lib/auth-flow": { safeAuthNext: () => "" }, "@/lib/i18n-server": language,
  });
  const tree = await access({ params: Promise.resolve({ screen: "register" }), searchParams: Promise.resolve({}) });
  assert.equal(nodes(tree).find(n => n.type === "shell").props.lang, "ar");
});
