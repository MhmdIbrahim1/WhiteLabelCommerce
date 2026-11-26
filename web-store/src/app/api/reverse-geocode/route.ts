import { adminDb } from "@/lib/supabase/admin";
import { findEgyptGovernorate } from "@/lib/egypt-locations";

function busy() {
  return Response.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "2" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !Number.isFinite(body.lat) || !Number.isFinite(body.lng) ||
      body.lat < 21 || body.lat > 32 || body.lng < 24 || body.lng > 38) {
    return Response.json({ error: "outside_egypt" }, { status: 422 });
  }
  const lang = body.lang === "en" ? "en" : "ar";
  const lat = body.lat.toFixed(4), lon = body.lng.toFixed(4);
  const key = [lat, lon, lang].join("/");
  try {
    const db = adminDb();
    const { data, error } = await db.rpc("reserve_reverse_geocode", { p_key: key });
    if (error) throw new Error("reservation");
    if (data?.cached) return Response.json(data.cached);
    if (data !== "fetch") return busy();

    const url = new URL(process.env.NOMINATIM_REVERSE_URL || "https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({ lat, lon, format: "jsonv2", zoom: "17", layer: "address", "accept-language": lang }).toString();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6500),
      headers: { "User-Agent": "WhiteLabelCommerce/1.0 (Egypt storefront delivery address lookup)", Accept: "application/json" } });
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get("retry-after");
      const until = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry || "");
      await db.from("reverse_geocode_cache").upsert({ key: "upstream", result: {}, expires_at: new Date(Math.max(until || 0, Date.now() + 60000)).toISOString() });
      return busy();
    }
    if (!response.ok) throw new Error("provider");
    const a = (await response.json()).address;
    if (a?.country_code !== "eg") return Response.json({ error: "outside_egypt" }, { status: 422 });
    const governorate = findEgyptGovernorate(a["ISO3166-2-lvl4"]) ?? findEgyptGovernorate(a.state) ?? findEgyptGovernorate(a.province);
    const result = { governorate: governorate?.id || "", city: a.suburb || a.city_district || a.town || a.village || a.city || a.county || "", street: a.road || a.pedestrian || a.residential || "" };
    await db.from("reverse_geocode_cache").upsert({ key, result, expires_at: new Date(Date.now() + 86400000).toISOString() });
    return Response.json(result);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
