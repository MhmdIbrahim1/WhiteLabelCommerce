"""Run with Python Playwright, Chrome and a signed-in local admin QA profile."""
import argparse
from itertools import product
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
ROUTES = ("/", "/products", "/s/omar-a7a", "/cart", "/checkout", "/orders",
          "/admin", "/admin/abandoned-carts", "/admin/returns", "/admin/mobile-app", "/super-admin")


def check_routes(page, context):
    errors = []
    failures = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url.split('?')[0]}")
            if r.status >= 400 else None)
    for width, lang, path in product((1440, 390), ("ar", "en"), ROUTES):
        errors.clear()
        page.set_viewport_size({"width": width, "height": 900 if width == 1440 else 844})
        context.add_cookies([{"url": BASE, "name": "nova_lang", "value": lang}])
        try:
            page.goto(BASE + path, wait_until="load")
            page.wait_for_function("document.documentElement.dir === " + repr("rtl" if lang == "ar" else "ltr"))
            page.wait_for_timeout(650)
            assert page.evaluate("location.pathname") == path, "Unexpected redirect"
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Horizontal overflow"
            if "admin" in path:
                assert page.locator("h1").count() and not page.locator("input[type=password]").count(), "Admin session required"
            assert not errors, str(errors)
        except Exception as error:
            failures.append(f"{width} {lang} {path} {error}")
    total = len(ROUTES) * 4
    print(f"{total - len(failures)}/{total} route checks passed")
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", type=Path, default=Path.home() / ".codex-chrome-profile")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(str(args.profile), channel="chrome", headless=True)
        try:
            check_routes(context.new_page(), context)
        finally:
            context.close()
