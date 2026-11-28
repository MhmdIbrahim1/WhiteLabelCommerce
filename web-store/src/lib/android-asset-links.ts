import { DEFAULT_STORE_ID } from "./tenant-shared.ts";

// Public release signing certificate verified against the v1.5.1 and store-omar-a7a-b107 GitHub APKs.
const releaseCertificate = "FB:2B:3A:CF:25:B6:A8:03:7C:07:30:56:E2:AF:7F:8D:98:2D:96:A0:35:88:0E:9B:B3:A0:AF:C3:32:F0:B1:2B";
const novaPackage = "com.whitelabel.commerce";
const factoryPackage = /^com\.whitelabel\.commerce(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function androidAssetLinks(storeId: string | null, builds: Iterable<{ store_id: string; package_id: string }>) {
  const packages = new Set<string>();
  if (storeId === null || storeId === DEFAULT_STORE_ID) packages.add(novaPackage);
  for (const build of builds) {
    if ((storeId === null || storeId === build.store_id) && factoryPackage.test(build.package_id)) {
      packages.add(build.package_id);
    }
  }
  return [...packages].sort().map(packageName => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [releaseCertificate] },
  }));
}
