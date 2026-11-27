import { exactKeys, parseStudioDraft, type StudioDraft } from "./storefront-studio.ts";
import type { Lang } from "./i18n";
import { isStudioPreviewPage, STUDIO_PREVIEW_QUERY } from "./tenant-shared.ts";
import { isStoreSlug } from "./host-routing.ts";

export const previewReady = "wlc.studio.ready";
export const previewUpdate = "wlc.studio.design";
export const previewNavigate = "wlc.studio.navigate";
export const previewLanguage = "wlc.studio.language";
export const previewMode = "wlc.studio.mode";
export type PreviewMode = "light" | "dark";
const catalogParams = new Set(["q", "exact", "category", "min", "max", "flash", "in_stock", "sort", "page"]);

// Navigation messages may only select public catalogue pages inside the current tenant.
export function previewPagePath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1500 || !value.startsWith("/") || /[\\#\s]/.test(value)) return null;
  const [path] = value.split("?");
  if (!isStudioPreviewPage(path)) return null;
  const url = new URL(value, "https://studio.invalid");
  url.searchParams.delete(STUDIO_PREVIEW_QUERY);
  for (const key of url.searchParams.keys()) {
    if (path !== "/products" || !catalogParams.has(key) || url.searchParams.getAll(key).length !== 1) return null;
  }
  return url.pathname + url.search;
}

export function studioFrameSrc(slug: string, path: string, lang: Lang) {
  const page = previewPagePath(path);
  if (!isStoreSlug(slug) || page === null || (lang !== "ar" && lang !== "en")) throw new TypeError("Invalid storefront preview");
  const url = new URL("/s/" + slug + (page === "/" ? "" : page), "https://studio.invalid");
  url.searchParams.set(STUDIO_PREVIEW_QUERY, lang);
  return url.pathname + url.search;
}

export function isPreviewPeer(event: Pick<MessageEvent, "origin" | "source">, origin: string, peer: MessageEventSource | null) {
  return peer !== null && event.source === peer && event.origin === origin && origin !== "null";
}

export function readPreviewUpdate(value: unknown, slug: string) {
  if (!exactKeys(value, ["type", "slug", "mode", "draft"]) || value.type !== previewUpdate || value.slug !== slug
    || (value.mode !== "light" && value.mode !== "dark")) return null;
  const draft = parseStudioDraft(value.draft);
  return draft ? { mode: value.mode as PreviewMode, draft } : null;
}

export function previewMessage(slug: string, mode: PreviewMode, draft: StudioDraft) {
  return { type: previewUpdate, slug, mode, draft };
}

export function readFrameMessage(value: unknown, slug: string) {
  if (exactKeys(value, ["type", "slug"]) && value.type === previewReady && value.slug === slug) return { type: previewReady } as const;
  if (exactKeys(value, ["type", "slug", "lang"]) && value.type === previewLanguage && value.slug === slug
    && (value.lang === "ar" || value.lang === "en")) return { type: previewLanguage, lang: value.lang } as const;
  if (exactKeys(value, ["type", "slug", "mode"]) && value.type === previewMode && value.slug === slug
    && (value.mode === "light" || value.mode === "dark")) return { type: previewMode, mode: value.mode } as const;
  if (exactKeys(value, ["type", "slug", "path"]) && value.type === previewNavigate && value.slug === slug) {
    const path = previewPagePath(value.path);
    if (path) return { type: previewNavigate, path } as const;
  }
  return null;
}
