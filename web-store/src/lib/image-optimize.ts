import { validateImageMagicBytes } from "./security";

const presets = {
  product: { edge: 1600, quality: 0.85 },
  aiVision: { edge: 1024, quality: 0.8 },
};

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

export async function optimizeProductImage(file: File, preset: keyof typeof presets = "product") {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!validateImageMagicBytes(header)) throw new Error("invalid_image");
  const { edge, quality } = presets[preset];
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const width = canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    const height = canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("invalid_image");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    // Unsupported encoders can return PNG instead of the requested format.
    let blob = await encode(canvas, "image/webp", quality).catch(() => null);
    if (blob?.type !== "image/webp") {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      blob = await encode(canvas, "image/jpeg", 0.86);
    }
    if (!blob?.size || !["image/webp", "image/jpeg"].includes(blob.type) || blob.size > 4 * 1024 * 1024) {
      throw new Error("invalid_image");
    }
    const stem = file.name.replace(/\.[^.]*$/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "").slice(0, 80) || "product";
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const optimized = new File([blob], stem + "." + extension, { type: blob.type });
    return { file: optimized, originalBytes: file.size, optimizedBytes: optimized.size, width, height };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
