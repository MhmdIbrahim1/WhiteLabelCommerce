import { adminDb } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const store = params.get("store_id") ?? "";
  const version = params.get("version_code") ?? "";
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(store) || !/^[0-9]{1,10}$/.test(version) || Number(version) > 2147483647) {
    return Response.json({ error: "Invalid store or version" }, { status: 400 });
  }

  const { data, error } = await adminDb().from("store_app_builds")
    .select("version_code,version_name")
    .eq("store_id", store)
    .eq("status", "succeeded")
    .gt("version_code", Number(version))
    .order("version_code", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: "Update check unavailable" }, { status: 503 });
  return Response.json({ update: data });
}
