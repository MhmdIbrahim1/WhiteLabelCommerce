import { androidAssetLinks } from "@/lib/android-asset-links";
import { adminDb } from "@/lib/supabase/admin";
import { PLATFORM_SURFACE_HEADER, STORE_ID_HEADER } from "@/lib/tenant-shared";

export async function GET(request: Request) {
  const surface = request.headers.get(PLATFORM_SURFACE_HEADER);
  const storeId = request.headers.get(STORE_ID_HEADER);
  if (surface !== "platform" && (surface !== "storefront" || !storeId)) {
    return new Response(null, { status: 404 });
  }

  // The proxy supplies the verified tenant binding. Build details and signing material stay server-side.
  const builds: { store_id: string; package_id: string }[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = adminDb().from("store_app_builds").select("store_id,package_id,stores!inner()")
      .eq("status", "succeeded").in("stores.status", ["active", "trial"]).not("apk_download_url", "is", null)
      .order("id").range(offset, offset + pageSize - 1);
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
    builds.push(...data);
    if (data.length < pageSize) break;
  }
  return Response.json(androidAssetLinks(storeId, builds), {
    headers: { "Cache-Control": "public, max-age=300", Vary: "Host" },
  });
}
