export type VerifiedImageInfo = {
  mime: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
};

/**
 * Verifies actual PNG, JPEG, or WEBP magic bytes server-side so spoofed
 * Content-Type headers (e.g. HTML/SVG disguised as image/png) are rejected.
 */
export function validateImageMagicBytes(
  bytes: Uint8Array,
): VerifiedImageInfo | null {
  if (!bytes || bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

/**
 * Validates that a redirect/deep-link target is strictly a relative same-origin
 * path. Blocks protocol-relative (`//evil.com`), backslash (`/\evil.com`),
 * scheme injections, and control characters.
 */
export function safeRelativePath(
  raw: unknown,
  fallback = "",
): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return fallback;
  if (
    !s.startsWith("/") ||
    s.startsWith("//") ||
    s.startsWith("/\\") ||
    s.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(s)
  ) {
    return fallback;
  }
  try {
    const parsed = new URL(s, "https://internal.invalid");
    if (parsed.origin !== "https://internal.invalid" || parsed.pathname.includes("//") ||
        /%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
