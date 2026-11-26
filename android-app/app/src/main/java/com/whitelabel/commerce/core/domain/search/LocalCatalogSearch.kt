package com.whitelabel.commerce.core.domain.search

import com.whitelabel.commerce.core.domain.model.Category
import com.whitelabel.commerce.core.domain.model.Product
import com.whitelabel.commerce.core.domain.repository.CatalogSearchResult
import com.whitelabel.commerce.core.domain.repository.SearchCorrection
import kotlin.math.abs
import kotlin.math.ln

/** Instant results use only active products already available to this store's app. */
object LocalCatalogSearch {
    private val marks = Regex("[ؐ-ًؚ-ٰٟۖ-ۭـ]")
    private val separators = Regex("[^A-Za-z0-9ء-غف-يٱ٠-٩ً-ٰٟـؐ-ؚۖ-ۭ]+")
    private val tee = Regex("""(?i)\bt[-‐‑– ]shirts?\b""")
    private val sweatshirt = Regex("""سويت\s+شيرت""")
    private val priceIntent = Regex("""(?i)(?:^|\s)(?:under|تحت|[أا]قل\s+من)\s+([0-9]{1,12}(?:\.[0-9]{1,2})?)\s*$""")
    private val letters = "أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩".zip("ااااهيوي0123456789").toMap()
    private val inflections = mapOf(
        "watches" to "watch", "smartwatches" to "smartwatch", "shoes" to "shoe", "shirts" to "shirt",
        "tshirts" to "tshirt", "hoodies" to "hoodie", "glasses" to "glass", "sunglasses" to "sunglass",
        "bags" to "bag", "sneakers" to "sneaker", "trainers" to "trainer", "ساعات" to "ساعه",
        "سماعات" to "سماعه", "نظارات" to "نظاره", "تيشيرتات" to "تيشيرت", "حقايب" to "حقيبه",
        "حقائب" to "حقيبه", "محافظ" to "محفظه", "احذيه" to "حذاء", "بناطيل" to "بنطلون",
        "جلديه" to "جلد", "جلدي" to "جلد",
    )
    private val aliases = listOf(
        "ساعه watch smartwatch", "نضاره نظاره sunglass eyewear shades glass",
        "شنطه حقيبه bag handbag backpack briefcase satchel tote daypack", "محفظه wallet cardholder",
        "جزمه كوتشي شوز حذاء سنيكر سنيكرز shoe sneaker footwear trainer",
        "تيشيرت تشيرت tee tees tshirt", "بنطلون جينز جبردين pants trousers jeans chinos",
        "هودي هوديز سويتشيرت hoodie sweatshirt sweatshirts",
        "سماعه earbuds headphones earphones audio buds", "مكتب مكتبي desk desktop", "جلد leather",
    ).map { it.split(' ').toSet() }.flatMap { group -> group.map { it to group } }.toMap()

    private const val keys = "qwertyuiop[]asdfghjkl;'zxcvbnm,./"
    private const val arabicKeys = "ضصثقفغعهخحجدشسيبلاتنمكطئءؤر§ىةوزظ"
    private val franco = mapOf(
        "sa3a" to "ساعة", "nadara" to "نظارة", "naddara" to "نظارة", "shanta" to "حقيبة",
        "ma7faza" to "محفظة", "gazma" to "حذاء", "kotchy" to "حذاء", "bantalon" to "بنطلون",
        "tshirt" to "تيشيرت", "sama3a" to "سماعة", "samma3a" to "سماعة",
    )

    private fun translate(input: String, from: String, to: String) = buildString {
        for (ch in input) append(to.getOrNull(from.indexOf(ch)) ?: ch)
    }

    fun convertLayout(raw: String): String {
        val latin = raw.any { it.lowercaseChar() in 'a'..'z' }
        val arabic = raw.any { it in 'ء'..'ي' }
        return when {
            latin && !arabic -> translate(raw.lowercase(), keys, arabicKeys).replace("§", "لا")
            arabic && !latin -> translate(raw.replace("لا", "§"), arabicKeys, keys)
            else -> raw
        }
    }

    private fun francoWord(w: String): String {
        val lower = w.lowercase()
        franco[lower]?.let { return it }
        if (!w.any { it in "375269" } || !lower.any { it in 'a'..'z' }) return w
        return translate(lower.replace("sh", "ش").replace("kh", "خ").replace("gh", "غ").replace("th", "ث"),
            "375269abcdefghijklmnopqrstuvwxyz", "عحخاطصابكديفجهيجكلمنوبقرستوفوكسيز")
    }

    private fun words(raw: String) = separators.split(
        raw.replace(tee, "tshirt").replace(sweatshirt, "سويتشيرت"),
    ).filter { it.isNotEmpty() }

    private fun token(w: String): String {
        val folded = buildString { for (c in w.lowercase().replace(marks, "")) append(letters[c] ?: c) }
        val bare = if (folded.length > 3) folded.removePrefix("ال") else folded
        return inflections[bare] ?: bare
    }

    private fun tokens(raw: String) = words(raw).map(::token).filter(String::isNotEmpty).distinct()

    fun skeleton(word: String): String {
        val w = token(word)
        if (w.length <= 2 || w.any { it !in 'ء'..'ي' }) return w
        val stem = w.removeSuffix("ه")
        if (stem.length <= 2) return stem
        return stem.first() + stem.substring(1, stem.lastIndex).filterNot { it in "اوي" } + stem.last()
    }

    fun distance(a: String, b: String, bound: Int): Int {
        if (a == b) return 0
        if (abs(a.length - b.length) > bound || maxOf(a.length, b.length) > 64) return bound + 1
        val sentinel = a.length + b.length
        val d = Array(a.length + 2) { IntArray(b.length + 2) }
        for (i in 0..a.length) { d[i + 1][0] = sentinel; d[i + 1][1] = i }
        for (j in 0..b.length) { d[0][j + 1] = sentinel; d[1][j + 1] = j }
        d[0][0] = sentinel
        val last = mutableMapOf<Char, Int>()
        for (i in 1..a.length) {
            var previous = 0
            for (j in 1..b.length) {
                val row = last[b[j - 1]] ?: 0
                val col = previous
                val same = a[i - 1] == b[j - 1]
                if (same) previous = j
                val edit = minOf(d[i][j] + if (same) 0 else 1, d[i][j + 1] + 1, d[i + 1][j] + 1)
                d[i + 1][j + 1] = minOf(edit, d[row][col] + i - row + j - col - 1)
            }
            last[a[i - 1]] = i
        }
        return minOf(bound + 1, d[a.length + 1][b.length + 1])
    }

    private data class Field(val tier: Int, val display: String)
    private data class Doc(val product: Product, val fields: Map<String, Field>)
    private data class Term(val word: String, val field: Field, val frequency: Int)
    private data class Match(val product: Product, val tier: Int, val count: Int, val strong: Int, val quality: Double)

    private fun document(p: Product, category: Category?): Doc {
        val fields = mutableMapOf<String, Field>()
        fun add(level: Int, text: String) {
            for (display in words(text)) {
                val normalized = token(display)
                if (normalized.isNotEmpty()) fields.putIfAbsent(normalized, Field(level, display))
            }
        }
        add(1, listOfNotNull(p.name, p.nameEn).joinToString(" "))
        add(2, listOfNotNull(category?.name, category?.nameEn).joinToString(" "))
        add(3, (p.colors + p.sizes + p.slug).joinToString(" "))
        add(4, listOfNotNull(p.description, p.descriptionEn).joinToString(" "))
        p.specifications.forEach { add(4, listOf(it.keyAr, it.keyEn, it.valueAr, it.valueEn).joinToString(" ")) }
        return Doc(p, fields)
    }

    private fun near(w: String, vocabulary: List<Term>): List<Term> {
        if (w.length !in 3..32 || w.any(Char::isDigit)) return emptyList()
        val bound = if (w.length <= 4) 1 else 2
        val sk = skeleton(w)
        val grams = "  $w ".windowed(3).toSet()
        data class Candidate(val term: Term, val distance: Int, val skeleton: Boolean, val overlap: Double)
        return vocabulary.asSequence().filter { it.field.tier <= 2 && abs(w.length - it.word.length) <= bound }
            .mapNotNull { term ->
                val d = distance(w, term.word, bound)
                if (d > bound) return@mapNotNull null
                val sameSkeleton = w.first() in 'ء'..'ي' && sk == skeleton(term.word)
                val other = "  ${term.word} ".windowed(3).toSet()
                val overlap = grams.intersect(other).size.toDouble() / maxOf(grams.size, other.size)
                if (d > 1 && !sameSkeleton && overlap < 0.45) null else Candidate(term, d, sameSkeleton, overlap)
            }.sortedWith(compareBy<Candidate> { it.distance }.thenByDescending { it.skeleton }
                .thenBy { it.term.field.tier }.thenByDescending { it.overlap }
                .thenByDescending { it.term.frequency }.thenBy { it.term.word }).map { it.term }.toList()
    }

    fun search(products: List<Product>, categories: List<Category>, raw: String, exact: Boolean = false): CatalogSearchResult {
        val original = raw.trim().take(100)
        val price = if (exact) null else priceIntent.find(translate(original, "٠١٢٣٤٥٦٧٨٩", "0123456789"))
        val ceiling = price?.groupValues?.get(1)?.toDoubleOrNull()
        val keywords = if (price == null) original else original.take(price.range.first).trim()
        val cats = categories.associateBy { it.id }
        val eligible = products.filter { it.isActive && (ceiling == null || it.effectivePrice() < ceiling) }
        val docs = eligible.map { document(it, cats[it.categoryId]) }
        val direct = tokens(keywords)
        if (direct.isEmpty()) return CatalogSearchResult(if (ceiling != null) eligible else emptyList())
        val vocabulary = docs.flatMap { it.fields.entries }.filter { it.value.tier <= 3 }
            .groupBy { it.key }.map { (w, entries) -> Term(w, entries.minBy { it.value.tier }.value, entries.size) }
        val idf = vocabulary.associate { it.word to ln(1.0 + docs.size.toDouble() / it.frequency) }
        val nearCache = mutableMapOf<String, List<Term>>()
        fun candidates(w: String) = nearCache.getOrPut(w) { near(w, vocabulary) }
        fun matches(query: List<String>, fuzzy: Boolean = false): List<Match> {
            val approximations = if (!fuzzy || exact) emptyMap() else query.filter { w ->
                vocabulary.none { it.word.startsWith(w) || it.word in aliases[w].orEmpty() }
            }.associateWith { w -> candidates(w).map { it.word }.toSet() }
            return docs.mapNotNull { doc ->
                var tier = 1
                var count = 0
                var strong = 0
                var quality = 0.0
                for (w in query) {
                    var best = 5
                    var bestWeight = 0.0
                    for ((v, field) in doc.fields) {
                        val level = when {
                            field.tier == 1 && v.startsWith(w) -> 1
                            field.tier <= 3 && v.startsWith(w) -> 2
                            !exact && field.tier <= 2 && v in aliases[w].orEmpty() -> 2
                            field.tier <= 2 && v in approximations[w].orEmpty() -> 3
                            w == v -> 4
                            else -> continue
                        }
                        val weight = (1 + (idf[v] ?: 1.0)) / field.tier * if (v == w) 1.0 else 0.75
                        if (level < best || (level == best && weight > bestWeight)) { best = level; bestWeight = weight }
                    }
                    if (best > 4) continue
                    count++
                    if (best <= 2) strong++
                    tier = maxOf(tier, best)
                    quality += bestWeight
                }
                if (count == 0) null else Match(doc.product, tier, count, strong, quality / count)
            }
        }
        var query = direct
        var correction: SearchCorrection? = null
        val best = matches(direct).maxOfOrNull { it.strong } ?: 0
        if (!exact && best < direct.size) {
            val proposals = sequence {
                yield(convertLayout(keywords) to "layout")
                yield(words(keywords).joinToString(" ", transform = ::francoWord) to "franco")
                yield(words(keywords).joinToString(" ") { source ->
                    val w = token(source)
                    if (vocabulary.any { it.word.startsWith(w) || it.word in aliases[w].orEmpty() }) source
                    else candidates(w).firstOrNull()?.field?.display ?: source
                } to "spell")
            }
            for ((proposal, reason) in proposals) {
                val candidate = tokens(proposal)
                if (candidate == direct || candidate.isEmpty()) continue
                val covered = matches(candidate).maxOfOrNull { it.strong } ?: 0
                if (covered * direct.size > best * candidate.size && covered >= (candidate.size + 1) / 2) {
                    query = candidate
                    correction = SearchCorrection(proposal, original, reason)
                    break
                }
            }
        }
        val results = matches(query, fuzzy = true)
        val required = if (exact || results.any { it.strong == query.size }) query.size else (query.size + 1) / 2
        val ranked = results.filter { it.count >= required }.sortedWith(compareBy<Match> {
            if (correction?.reason == "franco") maxOf(2, it.tier) else it.tier
        }
            .thenByDescending { it.count }
            .thenByDescending { (if (it.product.isInStock) 0.16 else 0.0) + 0.23 * it.quality / (2 + it.quality) +
                0.03 * minOf(1.0, ln(1.0 + it.product.reviewCount.coerceAtLeast(0)) / 5) }
            .thenBy { it.product.id })
        return CatalogSearchResult(ranked.map { it.product }, !exact && ranked.firstOrNull()?.tier == 3, correction)
    }
}
