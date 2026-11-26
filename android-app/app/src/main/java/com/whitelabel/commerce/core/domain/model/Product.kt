package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.core.designsystem.localized
import java.util.Calendar
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt

object FlashSalePricing {
    private val ISO_REGEX = Regex(
        """^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$""",
    )

    /**
     * API-24-safe ISO-8601 timestamp parser supporting PostgreSQL / Supabase timestamptz strings.
     */
    fun parseIsoTimestampMillis(raw: String?): Long? {
        val text = raw?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val match = ISO_REGEX.matchEntire(text) ?: return null
        val year = match.groupValues[1].toIntOrNull() ?: return null
        val month = match.groupValues[2].toIntOrNull() ?: return null
        val day = match.groupValues[3].toIntOrNull() ?: return null
        val hour = match.groupValues[4].toIntOrNull() ?: return null
        val minute = match.groupValues[5].toIntOrNull() ?: return null
        val second = match.groupValues[6].toIntOrNull() ?: return null
        val fracRaw = match.groupValues[7]
        val millis = if (fracRaw.isEmpty()) {
            0
        } else {
            fracRaw.padEnd(3, '0').take(3).toIntOrNull() ?: 0
        }
        val tzRaw = match.groupValues[8]
        val offsetMillis = when {
            tzRaw.isEmpty() || tzRaw.equals("Z", ignoreCase = true) -> 0L
            else -> {
                val sign = if (tzRaw.startsWith("-")) -1L else 1L
                val digits = tzRaw.substring(1).replace(":", "")
                val tzHour = digits.take(2).toIntOrNull() ?: return null
                val tzMin = if (digits.length >= 4) digits.substring(2, 4).toIntOrNull() ?: 0 else 0
                sign * ((tzHour * 60L) + tzMin) * 60_000L
            }
        }

        val cal = GregorianCalendar(TimeZone.getTimeZone("UTC"), Locale.US).apply {
            isLenient = false
            clear()
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, second)
            set(Calendar.MILLISECOND, millis)
        }
        return runCatching { cal.timeInMillis - offsetMillis }.getOrNull()
    }

    fun isActive(
        regularPrice: Double,
        flashSalePrice: Double?,
        flashSaleStartsAt: String?,
        flashSaleEndsAt: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): Boolean {
        val flash = flashSalePrice ?: return false
        if (!regularPrice.isFinite() || !flash.isFinite()) return false
        if (flash <= 0.0 || flash >= regularPrice) return false
        val endsMs = parseIsoTimestampMillis(flashSaleEndsAt) ?: return false
        if (endsMs <= nowMillis) return false
        val startsMs = parseIsoTimestampMillis(flashSaleStartsAt)
        if (startsMs != null && nowMillis < startsMs) return false
        return true
    }

    fun effectivePrice(
        regularPrice: Double,
        flashSalePrice: Double?,
        flashSaleStartsAt: String?,
        flashSaleEndsAt: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): Double = if (isActive(regularPrice, flashSalePrice, flashSaleStartsAt, flashSaleEndsAt, nowMillis)) {
        flashSalePrice!!
    } else {
        regularPrice
    }

    fun savingsPercent(
        regularPrice: Double,
        flashSalePrice: Double?,
        flashSaleStartsAt: String?,
        flashSaleEndsAt: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): Int? {
        if (!isActive(regularPrice, flashSalePrice, flashSaleStartsAt, flashSaleEndsAt, nowMillis)) return null
        val flash = flashSalePrice ?: return null
        if (regularPrice <= 0.0 || flash >= regularPrice) return null
        return (((regularPrice - flash) / regularPrice) * 100.0).roundToInt().coerceIn(1, 99)
    }

    fun remainingMillis(
        flashSaleEndsAt: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): Long {
        val endsMs = parseIsoTimestampMillis(flashSaleEndsAt) ?: return 0L
        return (endsMs - nowMillis).coerceAtLeast(0L)
    }

    fun formatCountdown(remainingMillis: Long, isRtl: Boolean): String {
        val totalSec = (remainingMillis.coerceAtLeast(0L)) / 1000L
        val days = totalSec / 86_400L
        val hours = (totalSec % 86_400L) / 3_600L
        val minutes = (totalSec % 3_600L) / 60L
        val seconds = totalSec % 60L
        val hms = String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
        return if (days > 0L) {
            if (isRtl) "${days}ي $hms" else "${days}d $hms"
        } else {
            hms
        }
    }
}

data class ProductSpecification(
    val keyAr: String = "",
    val keyEn: String = "",
    val valueAr: String = "",
    val valueEn: String = "",
) {
    val displayKey: String
        get() = localized(
            arabic = keyAr.ifBlank { keyEn },
            english = keyEn.ifBlank { keyAr },
        )

    val displayValue: String
        get() = localized(
            arabic = valueAr.ifBlank { valueEn },
            english = valueEn.ifBlank { valueAr },
        )

    val isValid: Boolean
        get() = (keyAr.isNotBlank() || keyEn.isNotBlank()) && (valueAr.isNotBlank() || valueEn.isNotBlank())
}

@androidx.compose.runtime.Immutable
data class ProductVariant(val color: String, val size: String, val stock: Int)

@androidx.compose.runtime.Immutable
class VariantInventory(variants: List<ProductVariant>) {
    private val pairs = variants.associate { (it.color to it.size) to it.stock }
    private val colorTotals = variants.groupingBy { it.color }.fold(0) { n, v -> n + v.stock }
    private val firstSizes = variants.filter { it.stock > 0 }.associate { it.color to it.size }
    val first = variants.firstOrNull { it.stock > 0 }
    val tracked = pairs.isNotEmpty()
    fun stock(color: String?, size: String?, fallback: Int) =
        if (tracked) pairs[color.orEmpty() to size.orEmpty()] ?: 0 else fallback
    fun colorStock(color: String, fallback: Int) = if (tracked) colorTotals[color] ?: 0 else fallback
    fun firstSize(color: String) = firstSizes[color]?.ifEmpty { null }
}

fun stockLabel(stock: Int): String = when {
    stock <= 0 -> localized("نفذت الكمية", "Out of Stock")
    stock <= 5 -> localized("على وشك النفاد", "Almost gone")
    else -> localized("متوفر", "In Stock")
}

data class Product(
    val id: String,
    val categoryId: String,
    val slug: String = "",
    val nameEn: String? = null,
    val name: String,
    val descriptionEn: String? = null,
    val description: String = "",
    val price: Double,
    val oldPrice: Double? = null,
    val flashSalePrice: Double? = null,
    val flashSaleStartsAt: String? = null,
    val flashSaleEndsAt: String? = null,
    val stock: Int = 0,
    val isActive: Boolean = true,
    val sizes: List<String> = emptyList(),
    val colors: List<String> = emptyList(),
    val imagePath: String? = null,
    val imageUrl: String? = null,
    val specifications: List<ProductSpecification> = emptyList(),
    val avgRating: Double = 0.0,
    val reviewCount: Int = 0,
    val matchType: String? = null,
    val createdAt: String? = null,
    val variants: List<ProductVariant> = emptyList(),
    val colorImages: Map<String, String> = emptyMap(),
    val galleryUrls: List<String> = emptyList(),
) {
    val inventory = VariantInventory(variants)
    fun imageFor(color: String?) = colorImages[color] ?: imageUrl ?: galleryUrls.firstOrNull()

    val hasReviews: Boolean
        get() = reviewCount > 0

    val formattedRating: String
        get() = ReviewFormatting.formatScore(avgRating)

    val displayDescription: String
        get() = localized(description, descriptionEn?.takeIf { it.isNotBlank() } ?: description)

    val displayName: String
        get() = localized(name, nameEn?.takeIf { it.isNotBlank() } ?: name)

    val isInStock: Boolean
        get() = stock > 0

    val isLowStock: Boolean
        get() = stock in 1..5

    fun isFlashSaleActive(nowMillis: Long = System.currentTimeMillis()): Boolean =
        FlashSalePricing.isActive(price, flashSalePrice, flashSaleStartsAt, flashSaleEndsAt, nowMillis)

    fun effectivePrice(nowMillis: Long = System.currentTimeMillis()): Double =
        FlashSalePricing.effectivePrice(price, flashSalePrice, flashSaleStartsAt, flashSaleEndsAt, nowMillis)

    fun flashSavingsPercent(nowMillis: Long = System.currentTimeMillis()): Int? =
        FlashSalePricing.savingsPercent(price, flashSalePrice, flashSaleStartsAt, flashSaleEndsAt, nowMillis)

    fun flashRemainingMillis(nowMillis: Long = System.currentTimeMillis()): Long =
        FlashSalePricing.remainingMillis(flashSaleEndsAt, nowMillis)

    fun displayStrikePrice(nowMillis: Long = System.currentTimeMillis()): Double? = when {
        isFlashSaleActive(nowMillis) -> price
        oldPrice != null && oldPrice > price -> oldPrice
        else -> null
    }

    val hasDiscount: Boolean
        get() = isFlashSaleActive() || (oldPrice != null && oldPrice > price)

    val discountPercent: Int?
        get() {
            flashSavingsPercent()?.let { return it }
            val previous = oldPrice ?: return null
            if (previous <= 0.0 || previous <= price) return null
            return (((previous - price) / previous) * 100.0).roundToInt().coerceIn(1, 99)
        }
}
