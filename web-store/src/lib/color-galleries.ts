import type { Product } from "./shop";

type GalleryFields = Pick<Product, "image_path" | "image_paths" | "color_images" | "color_galleries">;

export function initialProductColor(product: Pick<Product, "colors" | "product_variants">) {
  const stocked = new Set(product.product_variants?.filter(v => v.stock > 0).map(v => v.color));
  return product.colors.find(color => stocked.has(color)) ?? product.colors[0] ?? "";
}

export function resolveColorGallery(product: GalleryFields, color: string) {
  const gallery = product.color_galleries?.[color]?.filter(url => url.trim());
  if (gallery?.length) return [...new Set(gallery)];
  const primary = product.color_images?.[color] || product.image_path;
  const paths = [primary, ...(product.image_paths ?? [])];
  return [...new Set(paths.filter((path): path is string => Boolean(path?.trim())))];
}

export function galleryLines(text: string) {
  return text.split(/\r?\n/).map(url => url.trim()).filter(Boolean);
}

export function isGalleryUrl(value: unknown): value is string {
  if (typeof value !== "string" || !/^https:\/\/[^\s\\]+$/.test(value) || !URL.canParse(value)) return false;
  const url = new URL(value);
  return Boolean(url.hostname) && !url.username && !url.password;
}

export function validGallery(urls: unknown): urls is string[] {
  return Array.isArray(urls) && urls.length > 0 && urls.length <= 8 && urls.every(isGalleryUrl);
}

export function galleryCovers(galleries: Record<string, string[]>) {
  return Object.fromEntries(Object.entries(galleries).map(([color, urls]) => [color, urls[0]]));
}

// Older forms send one URL per color. Omission of both fields preserves the stored galleries.
export function parseGalleryFields(form: FormData, colors: string[]) {
  const legacy = !form.has("color_galleries");
  const field = legacy ? "color_images" : "color_galleries";
  if (!form.has(field)) return {};
  try {
    const value: unknown = JSON.parse(String(form.get(field)));
    if (!value || Array.isArray(value) || typeof value !== "object") return null;
    const entries: [string, string[]][] = [];
    for (const [color, images] of Object.entries(value)) {
      const urls = legacy ? [images] : images;
      if (!colors.includes(color) || !validGallery(urls)) return null;
      entries.push([color, urls]);
    }
    const color_galleries = Object.fromEntries(entries);
    return { color_galleries, color_images: galleryCovers(color_galleries) };
  } catch {
    return null;
  }
}
