"""Check the Android storefront projections with the configured public Supabase key."""
import json
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT / "android-app/app/src/main/java/com/whitelabel/commerce/core/data/repository"
projections = dict(re.findall(r'const val (\w+) = "([^"]+)"', (REPOSITORY / "StorefrontColumns.kt").read_text()))
public = {}
for line in (ROOT / "web-store/.env.local").read_text(encoding="utf-8-sig").splitlines():
    name, _, value = line.partition("=")
    if name.strip() in {"NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"}:
        public[name.strip()] = value.strip().strip("'").strip('"')


def query(table, params):
    base = public["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = public["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    request = Request(f"{base}/rest/v1/{table}?{urlencode(params)}",
                      headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urlopen(request, timeout=20) as response:
        assert response.status == 200
        return json.load(response)


if __name__ == "__main__":
    omar, = query("stores", {"slug": "eq.omar-a7a", "select": "id"})
    for store in ("00000000-0000-0000-0000-000000000001", omar["id"]):
        for table, name in (("products", "PRODUCT"), ("store_settings", "SETTINGS"),
                            ("product_reviews", "REVIEW"), ("categories", "CATEGORY")):
            params = {"select": projections[name + "_COLUMNS"], "limit": "1"}
            if table == "categories":
                params.update({"products.store_id": "eq." + store, "products.is_active": "eq.true"})
            else:
                params["store_id"] = "eq." + store
            if table == "products":
                params["is_active"] = "eq.true"
            if table == "product_reviews":
                params["status"] = "eq.published"
            query(table, params)
            print(store, table, 200)
