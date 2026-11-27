import { catalogCategories } from "@/app/admin/products/catalog-data";
import { quotaFailure } from "@/lib/billing";
import { requireAdmin } from "@/lib/db";
import { generateProductDraft, generateStudioPhoto, isAiStudioEnabled, isStudioPreset } from "@/lib/openai-studio";
import { matchesRequestOrigin } from "@/lib/password-policy";
import { validateImageMagicBytes } from "@/lib/security";
import { adminDb } from "@/lib/supabase/admin";

type Resource = "ai_autofills" | "ai_studio_images";
const maxImageSize = 4 * 1024 * 1024;
const maxBodySize = maxImageSize + 16 * 1024;

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function fail(code: string, status: number) {
  return reply({ ok: false, code }, status);
}

async function readMultipart(request: Request) {
  if (!request.body || !request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;") ||
      Number(request.headers.get("content-length")) > maxBodySize) return null;
  let size = 0;
  const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBodySize) throw new Error("Upload too large");
      controller.enqueue(chunk);
    },
  }));
  return new Response(bounded, { headers: request.headers }).formData().catch(() => null);
}

async function settle(reservationId: string, outcome: "completed" | "refunded") {
  // An ambiguous transport failure may follow a commit. Replaying the same outcome is idempotent.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await adminDb().rpc("settle_ai_quota", {
        p_reservation_id: reservationId, p_outcome: outcome,
      }).abortSignal(AbortSignal.timeout(5_000));
      if (!error) return data?.status === outcome;
    } catch {
      // Retry an interrupted transport with the same reservation and outcome.
    }
  }
  console.error("AI quota settlement unavailable", reservationId, outcome);
  return false;
}

export async function studioRequest(request: Request, resource: Resource) {
  if (!request.headers.has("origin") || !matchesRequestOrigin(request)) return fail("origin", 403);
  const context = await requireAdmin("manage_products").catch(() => null);
  if (!context) return fail("forbidden", 403);
  if (!isAiStudioEnabled()) return fail("ai_unavailable", 503);

  const form = await readMultipart(request);
  if (!form) return fail("invalid_image", 400);
  if (form.get("storeId") !== context.storeId) return fail("store_changed", 409);
  const image = form.get("image");
  if (!(image instanceof File) || !image.size || image.size > maxImageSize) return fail("invalid_image", 400);
  const header = new Uint8Array(await image.slice(0, 12).arrayBuffer());
  if (validateImageMagicBytes(header)?.mime !== image.type) return fail("invalid_image", 400);

  let generate: () => Promise<object>;
  if (resource === "ai_autofills") {
    const raw = form.get("hint") ?? "";
    if (typeof raw !== "string" || raw.trim().length > 200) return fail("invalid_hint", 400);
    const categories = await catalogCategories(context).catch(() => null);
    if (!categories) return fail("ai_unavailable", 503);
    generate = async () => ({ draft: await generateProductDraft(image, raw.trim(), categories) });
  } else {
    const preset = form.get("preset");
    if (!isStudioPreset(preset)) return fail("invalid_preset", 400);
    generate = () => generateStudioPhoto(image, preset);
  }

  const { data, error } = await adminDb().rpc("reserve_ai_quota", {
    p_store: context.storeId, p_user: context.user.id, p_resource: resource,
  });
  if (error) {
    const quota = quotaFailure(error);
    if (error.code === "PT409" && quota?.code === "plan_limit_reached" && quota.resource === resource) {
      return reply({ ok: false, code: quota.code, used: quota.current, cap: quota.limit }, 409);
    }
    if (error.code === "PT429") return fail("rate_limited", 429);
    if (error.code === "42501") return fail("forbidden", 403);
    return fail("ai_unavailable", 503);
  }
  if (typeof data?.reservation_id !== "string") return fail("ai_unavailable", 503);
  let result;
  try {
    result = await generate();
  } catch {
    if (!await settle(data.reservation_id, "refunded")) return fail("ai_unavailable", 503);
    return fail("ai_failed", 502);
  }
  if (!await settle(data.reservation_id, "completed")) return fail("ai_unavailable", 503);
  return reply({ ok: true, ...result, quota: { used: data.used, cap: data.cap } });
}
