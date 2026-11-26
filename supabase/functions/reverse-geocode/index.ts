import { createClient } from "npm:@supabase/supabase-js@2.81.1";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } });

// Share the web storefront's cache and global Nominatim request budget. The
// mobile client performs the approved lookup and caches its own response.
Deno.serve(async request => {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const body = await request.json().catch(() => null);
  if (!body || !Number.isFinite(body.lat) || !Number.isFinite(body.lng) ||
      body.lat < 21 || body.lat > 32 || body.lng < 24 || body.lng > 38) {
    return Response.json({ error: "outside_egypt" }, { status: 422 });
  }
  const lang = body.lang === "en" ? "en" : "ar";
  const lat = body.lat.toFixed(4), lon = body.lng.toFixed(4);
  const { data, error } = await db.rpc("reserve_reverse_geocode", { p_key: [lat, lon, lang].join("/") });
  if (error) return Response.json({ error: "unavailable" }, { status: 503 });
  if (data?.cached) return Response.json({ cached: data.cached });
  if (data !== "fetch") return Response.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "2" } });
  const url = new URL(Deno.env.get("NOMINATIM_REVERSE_URL") || "https://nominatim.openstreetmap.org/reverse");
  if (url.protocol !== "https:") return Response.json({ error: "unavailable" }, { status: 503 });
  url.search = new URLSearchParams({ lat, lon, format: "jsonv2", zoom: "17", layer: "address", "accept-language": lang }).toString();
  return Response.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
});
