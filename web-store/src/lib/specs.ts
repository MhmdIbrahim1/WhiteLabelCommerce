export type ProductSpec = {
  key_ar: string;
  key_en: string;
  value_ar: string;
  value_en: string;
};

export function normalizeSpecs(raw: unknown): ProductSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductSpec[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const key_ar = String(rec.key_ar ?? "").trim().slice(0, 120);
    const key_en = String(rec.key_en ?? "").trim().slice(0, 120);
    const value_ar = String(rec.value_ar ?? "").trim().slice(0, 240);
    const value_en = String(rec.value_en ?? "").trim().slice(0, 240);
    if (!key_ar && !key_en) continue;
    if (!value_ar && !value_en) continue;
    out.push({
      key_ar: key_ar || key_en,
      key_en: key_en || key_ar,
      value_ar: value_ar || value_en,
      value_en: value_en || value_ar,
    });
  }
  return out;
}

export type AdminCategoryPreset = {
  id: "shirts" | "pants" | "shoes" | "watches";
  label_ar: string;
  label_en: string;
  sizes: string[];
  colors: { label: string; label_en: string; hex: string }[];
  specs: ProductSpec[];
};

export const ADMIN_CATEGORY_PRESETS: AdminCategoryPreset[] = [
  {
    id: "shirts",
    label_ar: "تيشيرت / قميص",
    label_en: "Shirts & Tops",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: [
      { label: "أبيض", label_en: "White", hex: "#F8FAFC" },
      { label: "أسود", label_en: "Black", hex: "#111827" },
      { label: "كحلي", label_en: "Navy", hex: "#1E3A5F" },
      { label: "بيج", label_en: "Beige", hex: "#D6C5B3" },
      { label: "سماوي", label_en: "Sky Blue", hex: "#7DD3FC" },
    ],
    specs: [
      {
        key_ar: "الخامة",
        key_en: "Fabric",
        value_ar: "قطن مصري طبيعي 100٪",
        value_en: "100% Natural Egyptian Cotton",
      },
      {
        key_ar: "القَصّة",
        key_en: "Fit",
        value_ar: "مريحة عصرية (Regular Fit)",
        value_en: "Modern Regular Fit",
      },
      {
        key_ar: "العناية",
        key_en: "Care",
        value_ar: "غسيل بارد 30° مئوية",
        value_en: "Cold Machine Wash 30°C",
      },
      {
        key_ar: "المنشأ",
        key_en: "Origin",
        value_ar: "صناعة مصرية فاخرة",
        value_en: "Premium Egyptian Craftsmanship",
      },
    ],
  },
  {
    id: "pants",
    label_ar: "بناطيل",
    label_en: "Pants & Trousers",
    sizes: ["30", "32", "34", "36", "38"],
    colors: [
      { label: "كحلي", label_en: "Navy", hex: "#1E3A5F" },
      { label: "أسود", label_en: "Black", hex: "#111827" },
      { label: "بيج", label_en: "Beige", hex: "#D6C5B3" },
      { label: "رمادي", label_en: "Gray", hex: "#64748B" },
      { label: "زيتي", label_en: "Olive", hex: "#4D5D53" },
    ],
    specs: [
      {
        key_ar: "الخامة",
        key_en: "Material",
        value_ar: "قطن تويل مرن (98٪ قطن، 2٪ إيلاستين)",
        value_en: "Stretch Cotton Twill (98% Cotton, 2% Elastane)",
      },
      {
        key_ar: "القَصّة",
        key_en: "Fit",
        value_ar: "سليم فيت مريح (Slim Tapered)",
        value_en: "Comfortable Slim Tapered",
      },
      {
        key_ar: "الخصر",
        key_en: "Waist",
        value_ar: "متوسط الارتفاع مريح",
        value_en: "Mid-Rise Comfort Waist",
      },
      {
        key_ar: "الجيوب",
        key_en: "Pockets",
        value_ar: "4 جيوب عملية متينة",
        value_en: "4 Functional Reinforced Pockets",
      },
    ],
  },
  {
    id: "shoes",
    label_ar: "أحذية",
    label_en: "Shoes & Sneakers",
    sizes: ["40", "41", "42", "43", "44", "45"],
    colors: [
      { label: "أبيض", label_en: "White", hex: "#F8FAFC" },
      { label: "أسود", label_en: "Black", hex: "#111827" },
      { label: "رمادي", label_en: "Gray", hex: "#94A3B8" },
      { label: "بيج", label_en: "Beige", hex: "#D6C5B3" },
      { label: "بني", label_en: "Brown", hex: "#7C4A2D" },
    ],
    specs: [
      {
        key_ar: "الجزء العلوي",
        key_en: "Upper Material",
        value_ar: "نسيج شبكي مسامي مع جلد طبيعي",
        value_en: "Breathable Mesh & Genuine Leather",
      },
      {
        key_ar: "النعل الخارجي",
        key_en: "Outsole",
        value_ar: "مطاط مرن مقاوم للانزلاق",
        value_en: "Slip-Resistant Flexible Rubber",
      },
      {
        key_ar: "الفرش الداخلي",
        key_en: "Insole",
        value_ar: "ميموري فوم ممتص للصدمات",
        value_en: "Shock-Absorbing Memory Foam",
      },
      {
        key_ar: "الاستخدام",
        key_en: "Ideal For",
        value_ar: "الاستخدام اليومي والمشي والجري",
        value_en: "Daily Wear, Walking & Running",
      },
    ],
  },
  {
    id: "watches",
    label_ar: "ساعات وإكسسوارات",
    label_en: "Watches & Accessories",
    sizes: [],
    colors: [
      { label: "فضي / كحلي", label_en: "Silver / Navy", hex: "#94A3B8" },
      { label: "أسود مطفي", label_en: "Matte Black", hex: "#18181B" },
      { label: "بني / ذهبي", label_en: "Brown / Gold", hex: "#B45309" },
      { label: "ذهبي / أخضر", label_en: "Gold / Green", hex: "#166534" },
    ],
    specs: [
      {
        key_ar: "مقاومة الماء",
        key_en: "Water Resistance",
        value_ar: "حتى 50 متر (5 ATM)",
        value_en: "Up to 50m Waterproof (5 ATM)",
      },
      {
        key_ar: "قطر الهيكل",
        key_en: "Case Diameter",
        value_ar: "42 مم ستانلس ستيل 316L",
        value_en: "42mm 316L Stainless Steel",
      },
      {
        key_ar: "نوع الحركة",
        key_en: "Movement",
        value_ar: "كوارتز ياباني دقيق",
        value_en: "Precision Japanese Quartz",
      },
      {
        key_ar: "الضمان",
        key_en: "Warranty",
        value_ar: "ضمان سنتين ضد عيوب الصناعة",
        value_en: "2-Year Manufacturer Warranty",
      },
    ],
  },
];

export type SizeGuideTab = "apparel" | "pants" | "shoes";

export function detectSizeGuideTab(sizes: string[]): SizeGuideTab {
  const nums = sizes.map((s) => Number(s)).filter((n) => Number.isFinite(n));
  if (nums.some((n) => n >= 39 && n <= 48)) return "shoes";
  if (nums.some((n) => n >= 26 && n <= 38)) return "pants";
  return "apparel";
}
