export type CarrierKey =
  | "bosta"
  | "aramex"
  | "mylerz"
  | "egypt-post"
  | "private-courier"
  | "custom";

export type CarrierPreset = {
  key: CarrierKey;
  label: string;
  label_en: string;
  supportsTrackingUrl: boolean;
  buildUrl: (trackingNumber: string) => string;
};

export const CARRIER_PRESETS: readonly CarrierPreset[] = [
  {
    key: "bosta",
    label: "بوسطة",
    label_en: "Bosta",
    supportsTrackingUrl: true,
    buildUrl: (num) =>
      `https://bosta.co/en-eg/tracking-shipments?shipment-number=${encodeURIComponent(num)}`,
  },
  {
    key: "aramex",
    label: "أرامكس",
    label_en: "Aramex",
    supportsTrackingUrl: true,
    buildUrl: (num) =>
      `https://www.aramex.com/eg/ar/track/results?ShipmentNumber=${encodeURIComponent(num)}`,
  },
  {
    key: "mylerz",
    label: "مايلرز",
    label_en: "Mylerz",
    supportsTrackingUrl: true,
    buildUrl: (num) => `https://mylerz.net/track/${encodeURIComponent(num)}`,
  },
  {
    key: "egypt-post",
    label: "البريد المصري",
    label_en: "Egypt Post",
    supportsTrackingUrl: true,
    buildUrl: (num) =>
      `https://egyptpost.gov.eg/ar-eg/home/eservices/track-and-trace/?id=${encodeURIComponent(num)}`,
  },
  {
    key: "private-courier",
    label: "مندوب خاص",
    label_en: "Private Courier",
    supportsTrackingUrl: false,
    buildUrl: () => "",
  },
  {
    key: "custom",
    label: "شركة شحن أخرى",
    label_en: "Other Carrier",
    supportsTrackingUrl: false,
    buildUrl: () => "",
  },
] as const;

export function findCarrierPreset(value: string): CarrierPreset | undefined {
  const clean = value.trim().toLowerCase();
  if (!clean) return undefined;
  return CARRIER_PRESETS.find(
    (p) =>
      p.key === clean ||
      p.label.toLowerCase() === clean ||
      p.label_en.toLowerCase() === clean ||
      clean.includes(p.key),
  );
}

export function resolveCarrierLabel(
  presetKey: string,
  customCarrier: string,
): string | null {
  const custom = customCarrier.trim();
  if (presetKey === "custom") return custom || null;
  const preset = findCarrierPreset(presetKey);
  if (preset) return preset.label;
  return custom || presetKey.trim() || null;
}

export function isSafeHttpUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function buildTrackingUrl(
  carrierKeyOrLabel: string,
  trackingNumber: string,
  customUrl?: string,
): string | null {
  const explicit = (customUrl ?? "").trim();
  if (explicit) {
    return isSafeHttpUrl(explicit) ? explicit : null;
  }
  const num = trackingNumber.trim();
  if (!num) return null;
  const preset = findCarrierPreset(carrierKeyOrLabel);
  if (preset && preset.supportsTrackingUrl) {
    const generated = preset.buildUrl(num);
    return isSafeHttpUrl(generated) ? generated : null;
  }
  return null;
}

export function summarizeAddress(address: string | null | undefined): string {
  const clean = (address ?? "").trim();
  if (!clean) return "—";
  const parts = clean
    .split(/[,،\-\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const joined = `${parts[0]} · ${parts[1]}`;
    return joined.length > 48 ? joined.slice(0, 46) + "…" : joined;
  }
  return clean.length > 48 ? clean.slice(0, 46) + "…" : clean;
}
