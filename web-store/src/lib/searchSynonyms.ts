import type { Lang } from "./i18n";

export type SynonymCategoryGroup = {
  tag: string;
  label_ar: string;
  label_en: string;
  query_ar: string;
  query_en: string;
  terms: string[];
};

export const SEARCH_SYNONYM_GROUPS: SynonymCategoryGroup[] = [
  {
    tag: "footwear",
    label_ar: "أحذية وسنيكرز",
    label_en: "Footwear & Sneakers",
    query_ar: "كوتشي",
    query_en: "sneakers",
    terms: [
      "حذاء", "احذيه", "كوتشي", "كوتشيات", "جزمه", "جزم", "سنيكرز", "شوز",
      "شبشب", "صندل", "بوت", "هاف بوت", "لوفر", "shoe", "shoes", "sneaker",
      "sneakers", "boots", "sandals", "slippers", "loafers", "footwear",
    ],
  },
  {
    tag: "tops_shirts",
    label_ar: "تيشيرتات وقمصان",
    label_en: "Tops & Shirts",
    query_ar: "قميص",
    query_en: "shirt",
    terms: [
      "تيشيرت", "تيشرت", "تشرت", "قميص", "قمصان", "بلوزه", "بولو", "توب",
      "تانك", "كت", "tshirt", "t-shirt", "shirt", "polo", "blouse", "top", "tank",
    ],
  },
  {
    tag: "outerwear_winter",
    label_ar: "جواكت وملابس شتوي",
    label_en: "Outerwear & Winter",
    query_ar: "جاكيت",
    query_en: "jacket",
    terms: [
      "جاكيت", "جواكت", "هودي", "سويت شيرت", "بلوفر", "كارديجان", "معطف",
      "بالطو", "بليزر", "فيست", "jacket", "hoodie", "sweatshirt", "pullover",
      "sweater", "cardigan", "coat", "blazer", "vest",
    ],
  },
  {
    tag: "pants_sets",
    label_ar: "بناطيل وأطقم",
    label_en: "Pants & Sets",
    query_ar: "بنطلون",
    query_en: "pants",
    terms: [
      "بنطلون", "بناطيل", "جينز", "جبردين", "سويت بانتس", "شورت", "برمودا",
      "ليجن", "جيبه", "تنوره", "فستان", "عبايه", "طقم", "ترينج", "pants",
      "trousers", "jeans", "chinos", "sweatpants", "joggers", "shorts",
      "skirt", "dress", "abaya", "tracksuit",
    ],
  },
  {
    tag: "bags_wallets",
    label_ar: "حقائب ومحافظ",
    label_en: "Bags & Wallets",
    query_ar: "شنطة",
    query_en: "bag",
    terms: [
      "شنطه", "شنط", "حقيبه", "حقائب", "باج", "باك باج", "ضهر", "كروس",
      "محفظه", "بوك", "كلاتش", "bag", "backpack", "crossbody", "handbag",
      "wallet", "purse", "clutch", "luggage", "tote",
    ],
  },
  {
    tag: "watches_accessories",
    label_ar: "ساعات وإكسسوارات",
    label_en: "Watches & Accessories",
    query_ar: "ساعة",
    query_en: "watch",
    terms: [
      "ساعه", "ساعات", "سمارت واتش", "نظاره", "نضاره", "حزام", "كاب", "طاقيه",
      "ايس كاب", "اسوره", "سلسله", "خاتم", "حلق", "اكسسوار", "watch",
      "smartwatch", "sunglasses", "glasses", "belt", "cap", "hat", "beanie",
      "bracelet", "necklace", "ring", "accessories",
    ],
  },
  {
    tag: "mobile_tablets",
    label_ar: "موبايلات وتابلت",
    label_en: "Mobile & Tablets",
    query_ar: "موبايل",
    query_en: "phone",
    terms: [
      "موبايل", "موبايلات", "تليفون", "هاتف", "جوال", "ايفون", "سامسونج",
      "شاومي", "تابلت", "ايباد", "شاحن", "كابل", "سلك", "باور بانك", "جراب",
      "كفر", "اسكرينه", "حامل", "phone", "mobile", "smartphone", "iphone",
      "tablet", "ipad", "charger", "cable", "powerbank", "case", "cover",
      "screen protector",
    ],
  },
  {
    tag: "audio",
    label_ar: "سماعات وصوتيات",
    label_en: "Audio & Headphones",
    query_ar: "سماعة",
    query_en: "headphones",
    terms: [
      "سماعه", "سماعات", "ايربودز", "هيدفون", "بلوتوث", "سبيكر", "مكبر صوت",
      "مايك", "ميكروفون", "headphone", "headphones", "earbuds", "airpods",
      "headset", "bluetooth", "speaker", "mic", "microphone",
    ],
  },
  {
    tag: "computers_gaming",
    label_ar: "كمبيوتر وجيمنج",
    label_en: "Computers & Gaming",
    query_ar: "لابتوب",
    query_en: "laptop",
    terms: [
      "لابتوب", "لاب", "كمبيوتر", "بي سي", "شاشه", "مونيتور", "كيبورد",
      "لوحه مفاتيح", "ماوس", "فاره", "هارد", "فلاشه", "راوتر", "دراع",
      "بلايستيشن", "اكس بوكس", "جيمنج", "laptop", "computer", "pc", "monitor",
      "keyboard", "mouse", "ssd", "flash", "router", "controller",
      "playstation", "gaming",
    ],
  },
  {
    tag: "home_kitchen",
    label_ar: "أجهزة المنزل والمطبخ",
    label_en: "Home & Kitchen",
    query_ar: "خلاط",
    query_en: "kitchen",
    terms: [
      "خلاط", "كبه", "محضر طعام", "ميكروويف", "فرن", "بوتاجاز", "اير فراير",
      "قلايه", "كاتل", "غلايه", "ماكينه قهوه", "اسبريسو", "مكنسه", "مكواه",
      "تكييف", "مروحه", "دفايه", "سخان", "غساله", "ثلاجه", "تلاجه", "blender",
      "mixer", "microwave", "oven", "stove", "air fryer", "kettle",
      "coffee maker", "espresso", "vacuum", "iron", "ac", "fan", "heater",
      "washer", "fridge",
    ],
  },
  {
    tag: "home_decor_bedding",
    label_ar: "ديكور ومفروشات",
    label_en: "Home Decor & Bedding",
    query_ar: "ديكور",
    query_en: "decor",
    terms: [
      "طقم سرير", "ملايه", "لحاف", "بطانيه", "مخده", "وساده", "فوطه", "بشكير",
      "ستاره", "ستاير", "سجاده", "مشايه", "لمبه", "اضاءه", "اباجوره", "نجفه",
      "ترابيزه", "طاوله", "كرسي", "كنبه", "ديكور", "فازه", "برواز", "bedsheet",
      "comforter", "blanket", "pillow", "towel", "curtain", "rug", "carpet",
      "lamp", "lighting", "table", "chair", "sofa", "decor",
    ],
  },
  {
    tag: "perfumes_care",
    label_ar: "عطور وعناية شخصية",
    label_en: "Perfumes & Personal Care",
    query_ar: "عطر",
    query_en: "perfume",
    terms: [
      "برفان", "برفيوم", "عطر", "عطور", "معطر", "مزيل عرق", "سبراي", "كريم",
      "مرطب", "غسول", "سيروم", "شامبو", "بلسم", "زيت شعر", "ماكينه حلاقه",
      "سشوار", "بيبي ليس", "مكواه شعر", "ميك اب", "روج", "مسكره", "perfume",
      "fragrance", "cologne", "deodorant", "spray", "cream", "moisturizer",
      "cleanser", "serum", "shampoo", "conditioner", "hair oil", "trimmer",
      "shaver", "hair dryer", "straightener", "makeup",
    ],
  },
  {
    tag: "sports_fitness",
    label_ar: "رياضة ولياقة",
    label_en: "Sports & Fitness",
    query_ar: "رياضة",
    query_en: "fitness",
    terms: [
      "جيم", "رياضه", "دمبل", "دامبلز", "عقله", "مشايه", "عجله", "مات",
      "سجاده يوجا", "حبل", "زجاجه مياه", "زمزميه", "شيكر", "بروتين",
      "كرياتين", "جوانتي", "gym", "fitness", "dumbbell", "treadmill",
      "yoga mat", "jump rope", "bottle", "shaker", "protein", "gloves",
    ],
  },
  {
    tag: "kids_baby",
    label_ar: "أطفال وبيبي",
    label_en: "Kids & Baby",
    query_ar: "أطفال",
    query_en: "kids",
    terms: [
      "اطفال", "بيبي", "لعبه", "العاب", "عروسه", "عربيه", "بازل", "مكعبات",
      "ليجو", "سترولر", "بامبرز", "حفاضات", "kids", "baby", "toy", "toys",
      "puzzle", "blocks", "lego", "stroller", "diapers",
    ],
  },
  {
    tag: "automotive",
    label_ar: "مستلزمات السيارات",
    label_en: "Automotive",
    query_ar: "سيارة",
    query_en: "car",
    terms: [
      "عربيه", "سياره", "سيارات", "كاوتش", "طاره", "دواسات", "فواحه",
      "شاحن عربيه", "هولدر", "منفاخ", "مكنسه عربيه", "غطاء عربيه", "لمبه ليد",
      "car", "auto", "automotive", "car charger", "car holder", "car vacuum",
      "car cover", "tire inflator", "led",
    ],
  },
];

export type InstantSearchHint = {
  tag: string;
  label: string;
  query: string;
};

const AR_DIACRITICS_RE =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+/g;
const AR_MAP: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ة: "ه",
  ى: "ي",
  ؤ: "و",
  ئ: "ي",
};

function normAr(text: string): string {
  let out = "";
  for (const ch of text.replace(AR_DIACRITICS_RE, "")) {
    out += AR_MAP[ch] ?? ch;
  }
  return out
    .replace(/[^\u0600-\u06FF0-9a-zA-Z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAl(tok: string): string {
  return tok.length >= 5 && tok.startsWith("ال") ? tok.slice(2) : tok;
}

function arSkel(tok: string): string {
  return normAr(tok).replace(/[اوي]/g, "");
}

function normEn(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-'’`]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function enSkel(tok: string): string {
  if (tok.length <= 2) return tok;
  const c = tok
    .replace(/ck/g, "k")
    .replace(/ph/g, "f")
    .replace(/ee|ea|ie/g, "i")
    .replace(/(.)\1+/g, "$1");
  return c[0] + c.slice(1).replace(/[aeiouy]/g, "");
}

type PreparedGroup = {
  group: SynonymCategoryGroup;
  arTerms: string[];
  enTerms: string[];
};

const PREPARED_GROUPS: PreparedGroup[] = SEARCH_SYNONYM_GROUPS.map((group) => ({
  group,
  arTerms: group.terms
    .map((t) => stripAl(normAr(t)))
    .filter((t) => /[\u0600-\u06FF]/.test(t) && t.length >= 2),
  enTerms: group.terms
    .map((t) => normEn(t))
    .filter((t) => /^[a-z0-9 ]+$/.test(t) && t.length >= 2),
}));

/**
 * 0ms instant local synonym/category hint resolver.
 * Never downloads catalog data; runs purely against the 15 compact synonym groups.
 */
export function getInstantSearchHints(
  query: string,
  lang: Lang,
  limit = 3,
): InstantSearchHint[] {
  const raw = query.trim();
  if (raw.length < 2) return [];

  const hasAr = /[\u0600-\u06FF]/.test(raw);
  const hasEn = /[a-zA-Z0-9]/.test(raw);
  const arQ = stripAl(normAr(raw));
  const enQ = normEn(raw);
  const arTokens = arQ
    .split(/\s+/)
    .map(stripAl)
    .filter((t) => t.length >= 2);
  const enTokens = enQ.split(/\s+/).filter((t) => t.length >= 2);

  const exactHints: InstantSearchHint[] = [];
  const fuzzyHints: InstantSearchHint[] = [];

  for (const { group, arTerms, enTerms } of PREPARED_GROUPS) {
    const arDirect =
      hasAr &&
      arTerms.some(
        (term) =>
          term === arQ ||
          (arQ.length >= 2 && term.startsWith(arQ)) ||
          arTokens.includes(term),
      );
    const enDirect =
      hasEn &&
      enTerms.some(
        (term) =>
          term === enQ ||
          (enQ.length >= 3 && term.startsWith(enQ)) ||
          enTokens.includes(term),
      );

    if (arDirect || enDirect) {
      exactHints.push({
        tag: group.tag,
        label: lang === "en" ? group.label_en : group.label_ar,
        query: lang === "en" ? group.query_en : group.query_ar,
      });
      continue;
    }

    const arFuzzy =
      hasAr &&
      arTerms.some(
        (term) =>
          arQ.length >= 4 &&
          term.length >= 4 &&
          arQ[0] === term[0] &&
          Math.abs(arQ.length - term.length) <= 2 &&
          arSkel(arQ).length >= 3 &&
          arSkel(arQ) === arSkel(term),
      );
    const enFuzzy =
      hasEn &&
      enTerms.some(
        (term) =>
          enQ.length >= 4 &&
          term.length >= 4 &&
          !term.includes(" ") &&
          Math.abs(enQ.length - term.length) <= 2 &&
          enSkel(enQ) === enSkel(term),
      );

    if (arFuzzy || enFuzzy) {
      fuzzyHints.push({
        tag: group.tag,
        label: lang === "en" ? group.label_en : group.label_ar,
        query: lang === "en" ? group.query_en : group.query_ar,
      });
    }
  }

  return (exactHints.length > 0 ? exactHints : fuzzyHints).slice(0, limit);
}
