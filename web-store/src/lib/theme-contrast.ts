const white = "#FFFFFF";
const matte = "#0B0B0C";
export const isAccentColor = (value: unknown): value is string =>
  typeof value === "string" && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);

function rgb(hex: string) {
  return [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16));
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map(channel => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function accentContrast(value: string) {
  const accent = isAccentColor(value) ? value.toUpperCase() : matte;
  const foreground = contrastRatio(accent, white) >= contrastRatio(accent, matte) ? white : matte;
  let background = accent;
  // A narrow midtone band misses 4.5 with both specified foregrounds.
  // Shift only the filled control, one sRGB level at a time, until its text passes.
  const step = foreground === white ? -1 : 1;
  while (contrastRatio(background, foreground) < 4.5) {
    background = "#" + rgb(background).map(c =>
      Math.min(255, Math.max(0, c + step)).toString(16).padStart(2, "0"),
    ).join("").toUpperCase();
  }
  return { accent, background, foreground, ratio: contrastRatio(background, foreground) };
}
