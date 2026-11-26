import { PLATFORM_ORIGIN_HEADER } from "@/lib/tenant-shared";

function redirectToPlatform(request: Request) {
  const origin = request.headers.get(PLATFORM_ORIGIN_HEADER);
  const target = request.headers.get("x-wlc-platform-redirect");
  if (!origin || !target || !target.startsWith(origin + "/")) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: target, "Cache-Control": "private, no-store" },
  });
}

export const GET = redirectToPlatform;
export const HEAD = redirectToPlatform;
