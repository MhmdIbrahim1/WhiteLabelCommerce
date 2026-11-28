import assert from "node:assert/strict";
import test from "node:test";
import { androidAssetLinks } from "../src/lib/android-asset-links.ts";
import { DEFAULT_STORE_ID } from "../src/lib/tenant-shared.ts";

const nova = "com.whitelabel.commerce";
const omar = nova + ".omara7a";
const builds = [
  { store_id: "omar", package_id: omar },
  { store_id: "omar", package_id: omar },
  { store_id: "omar", package_id: "com.example.unrelated" },
  { store_id: DEFAULT_STORE_ID, package_id: nova + ".novastore" },
];
const packages = scope => androidAssetLinks(scope, builds).map(link => link.target.package_name);

test("apex lists published Android apps once and storefronts delegate only their own packages", () => {
  assert.deepEqual(packages(null), [nova, nova + ".novastore", omar]);
  assert.deepEqual(packages(DEFAULT_STORE_ID), [nova, nova + ".novastore"]);
  assert.deepEqual(packages("omar"), [omar]);
  assert.deepEqual(packages("unpublished-store"), []);
});

test("App Links use the published APK signing certificate and expose only the Android statement", () => {
  assert.deepEqual(androidAssetLinks("omar", builds), [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: omar,
      sha256_cert_fingerprints: ["FB:2B:3A:CF:25:B6:A8:03:7C:07:30:56:E2:AF:7F:8D:98:2D:96:A0:35:88:0E:9B:B3:A0:AF:C3:32:F0:B1:2B"],
    },
  }]);
});
