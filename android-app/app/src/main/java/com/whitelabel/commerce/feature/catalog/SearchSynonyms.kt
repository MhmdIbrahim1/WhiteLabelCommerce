package com.whitelabel.commerce.feature.catalog

import com.whitelabel.commerce.core.designsystem.localized
import kotlin.math.abs

data class InstantSearchHint(
    val tag: String,
    val labelAr: String,
    val labelEn: String,
    val queryAr: String,
    val queryEn: String,
) {
    val displayLabel: String
        get() = localized(labelAr, labelEn)

    val displayQuery: String
        get() = localized(queryAr, queryEn)
}

/**
 * 0ms client-side bilingual synonym & category hint resolver mirroring
 * `web-store/src/lib/searchSynonyms.ts` across 15 e-commerce categories.
 */
object SearchSynonyms {
    private data class Group(
        val tag: String,
        val labelAr: String,
        val labelEn: String,
        val queryAr: String,
        val queryEn: String,
        val terms: List<String>,
    )

    private val groups = listOf(
        Group(
            "footwear", "أحذية وسنيكرز", "Footwear & Sneakers", "كوتشي", "sneakers",
            listOf("حذاء", "احذيه", "كوتشي", "كوتشيات", "جزمه", "جزم", "سنيكرز", "شوز", "شبشب", "صندل", "بوت", "لوفر", "shoe", "shoes", "sneaker", "sneakers", "boots", "sandals", "loafers", "footwear"),
        ),
        Group(
            "tops_shirts", "تيشيرتات وقمصان", "Tops & Shirts", "قميص", "shirt",
            listOf("تيشيرت", "تيشرت", "تشرت", "قميص", "قمصان", "بلوزه", "بولو", "توب", "tshirt", "t-shirt", "shirt", "polo", "blouse", "top"),
        ),
        Group(
            "outerwear_winter", "جواكت وملابس شتوي", "Outerwear & Winter", "جاكيت", "jacket",
            listOf("جاكيت", "جواكت", "هودي", "سويت شيرت", "بلوفر", "كارديجان", "معطف", "بليزر", "فيست", "jacket", "hoodie", "sweatshirt", "pullover", "sweater", "coat", "blazer"),
        ),
        Group(
            "pants_sets", "بناطيل وأطقم", "Pants & Sets", "بنطلون", "pants",
            listOf("بنطلون", "بناطيل", "جينز", "جبردين", "شورت", "فستان", "عبايه", "طقم", "ترينج", "pants", "trousers", "jeans", "chinos", "joggers", "shorts", "dress", "tracksuit"),
        ),
        Group(
            "bags_wallets", "حقائب ومحافظ", "Bags & Wallets", "شنطة", "bag",
            listOf("شنطه", "شنط", "حقيبه", "حقائب", "باج", "باك باج", "كروس", "محفظه", "بوك", "bag", "backpack", "crossbody", "handbag", "wallet", "purse", "tote"),
        ),
        Group(
            "watches_accessories", "ساعات وإكسسوارات", "Watches & Accessories", "ساعة", "watch",
            listOf("ساعه", "ساعات", "سمارت واتش", "نظاره", "نضاره", "حزام", "كاب", "اسوره", "سلسله", "خاتم", "اكسسوار", "watch", "smartwatch", "sunglasses", "glasses", "belt", "cap", "accessories"),
        ),
        Group(
            "mobile_tablets", "موبايلات وتابلت", "Mobile & Tablets", "موبايل", "phone",
            listOf("موبايل", "تليفون", "هاتف", "ايفون", "سامسونج", "تابلت", "شاحن", "كابل", "باور بانك", "جراب", "phone", "mobile", "iphone", "tablet", "charger", "cable", "powerbank", "case"),
        ),
        Group(
            "audio", "سماعات وصوتيات", "Audio & Headphones", "سماعة", "headphones",
            listOf("سماعه", "سماعات", "ايربودز", "هيدفون", "بلوتوث", "سبيكر", "مايك", "headphone", "headphones", "earbuds", "airpods", "bluetooth", "speaker"),
        ),
        Group(
            "computers_gaming", "كمبيوتر وجيمنج", "Computers & Gaming", "لابتوب", "laptop",
            listOf("لابتوب", "كمبيوتر", "شاشه", "كيبورد", "ماوس", "هارد", "جيمنج", "laptop", "computer", "monitor", "keyboard", "mouse", "gaming"),
        ),
        Group(
            "home_kitchen", "أجهزة المنزل والمطبخ", "Home & Kitchen", "خلاط", "kitchen",
            listOf("خلاط", "كبه", "ميكروويف", "اير فراير", "كاتل", "قهوه", "اسبريسو", "مكنسه", "blender", "microwave", "air fryer", "kettle", "coffee", "vacuum"),
        ),
        Group(
            "home_decor_bedding", "ديكور ومفروشات", "Home Decor & Bedding", "ديكور", "decor",
            listOf("طقم سرير", "لحاف", "مخده", "فوطه", "ستاره", "سجاده", "اباجوره", "ديكور", "bedsheet", "blanket", "pillow", "towel", "rug", "lamp", "decor"),
        ),
        Group(
            "perfumes_care", "عطور وعناية شخصية", "Perfumes & Personal Care", "عطر", "perfume",
            listOf("برفان", "برفيوم", "عطر", "عطور", "كريم", "مرطب", "سيروم", "شامبو", "perfume", "fragrance", "cologne", "cream", "serum", "shampoo"),
        ),
        Group(
            "sports_fitness", "رياضة ولياقة", "Sports & Fitness", "رياضة", "fitness",
            listOf("جيم", "رياضه", "دمبل", "مشايه", "بروتين", "جوانتي", "gym", "fitness", "dumbbell", "yoga", "protein"),
        ),
        Group(
            "kids_baby", "أطفال وبيبي", "Kids & Baby", "أطفال", "kids",
            listOf("اطفال", "بيبي", "لعبه", "العاب", "kids", "baby", "toy", "toys"),
        ),
        Group(
            "automotive", "مستلزمات السيارات", "Automotive", "سيارة", "car",
            listOf("عربيه", "سياره", "سيارات", "هولدر", "منفاخ", "car", "auto", "automotive"),
        ),
    )

    private val arabicDiacritics = Regex("[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]+")
    private val arabicRegex = Regex("[\u0600-\u06FF]")
    private val englishRegex = Regex("[a-zA-Z0-9]")

    private fun normAr(text: String): String {
        val stripped = text.replace(arabicDiacritics, "")
        val sb = StringBuilder(stripped.length)
        for (ch in stripped) {
            sb.append(
                when (ch) {
                    'أ', 'إ', 'آ' -> 'ا'
                    'ة' -> 'ه'
                    'ى', 'ئ' -> 'ي'
                    'ؤ' -> 'و'
                    else -> ch
                },
            )
        }
        return sb.toString()
            .replace(Regex("[^\u0600-\u06FF0-9a-zA-Z\\s]+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun stripAl(token: String): String =
        if (token.length >= 5 && token.startsWith("ال")) token.substring(2) else token

    private fun arSkeleton(token: String): String =
        normAr(token).replace(Regex("[اوي]"), "")

    private fun normEn(text: String): String =
        text.lowercase()
            .replace(Regex("[-'’`]"), "")
            .replace(Regex("[^a-z0-9\\s]+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun enSkeleton(token: String): String {
        if (token.length <= 2) return token
        val collapsed = token
            .replace("ck", "k")
            .replace("ph", "f")
            .replace(Regex("ee|ea|ie"), "i")
            .replace(Regex("(.)\\1+"), "$1")
        return collapsed[0] + collapsed.substring(1).replace(Regex("[aeiouy]"), "")
    }

    fun getInstantHints(query: String, limit: Int = 3): List<InstantSearchHint> {
        val raw = query.trim()
        if (raw.length < 2) return emptyList()

        val hasAr = arabicRegex.containsMatchIn(raw)
        val hasEn = englishRegex.containsMatchIn(raw)
        val arQ = stripAl(normAr(raw))
        val enQ = normEn(raw)
        val arTokens = arQ.split(" ").map(::stripAl).filter { it.length >= 2 }
        val enTokens = enQ.split(" ").filter { it.length >= 2 }

        val exact = mutableListOf<InstantSearchHint>()
        val fuzzy = mutableListOf<InstantSearchHint>()

        for (group in groups) {
            val arTerms = group.terms
                .map { stripAl(normAr(it)) }
                .filter { arabicRegex.containsMatchIn(it) && it.length >= 2 }
            val enTerms = group.terms
                .map { normEn(it) }
                .filter { it.isNotEmpty() && !arabicRegex.containsMatchIn(it) && it.length >= 2 }

            val hint = InstantSearchHint(
                tag = group.tag,
                labelAr = group.labelAr,
                labelEn = group.labelEn,
                queryAr = group.queryAr,
                queryEn = group.queryEn,
            )

            val arDirect = hasAr && arTerms.any { term ->
                term == arQ || (arQ.length >= 2 && term.startsWith(arQ)) || term in arTokens
            }
            val enDirect = hasEn && enTerms.any { term ->
                term == enQ || (enQ.length >= 3 && term.startsWith(enQ)) || term in enTokens
            }
            if (arDirect || enDirect) {
                exact += hint
                continue
            }

            val arFuzzy = hasAr && arQ.length >= 4 && arTerms.any { term ->
                term.length >= 4 &&
                    arQ[0] == term[0] &&
                    abs(arQ.length - term.length) <= 2 &&
                    arSkeleton(arQ).length >= 3 &&
                    arSkeleton(arQ) == arSkeleton(term)
            }
            val enFuzzy = hasEn && enQ.length >= 4 && enTerms.any { term ->
                term.length >= 4 &&
                    !term.contains(" ") &&
                    abs(enQ.length - term.length) <= 2 &&
                    enSkeleton(enQ) == enSkeleton(term)
            }
            if (arFuzzy || enFuzzy) {
                fuzzy += hint
            }
        }

        return (if (exact.isNotEmpty()) exact else fuzzy).take(limit)
    }
}
