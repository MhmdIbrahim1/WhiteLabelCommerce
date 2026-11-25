package com.whitelabel.commerce.core.domain.model

import com.whitelabel.commerce.core.designsystem.localized
import java.util.Locale
import kotlin.math.roundToInt

data class ProductReview(
    val id: String,
    val storeId: String = "",
    val productId: String,
    val userId: String = "",
    val orderId: String? = null,
    val authorName: String,
    val rating: Int,
    val comment: String = "",
    val isVerifiedPurchase: Boolean = true,
    val status: String = "published",
    val adminReply: String? = null,
    val adminRepliedAt: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
) {
    val authorInitial: String
        get() = authorName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "★"
}

data class ReviewEligibility(
    val eligible: Boolean = false,
    val orderId: String? = null,
    val existingReview: ProductReview? = null,
)

data class RatingDistributionRow(
    val stars: Int,
    val count: Int,
    val fraction: Float,
)

data class RatingStats(
    val average: Double = 0.0,
    val total: Int = 0,
    val distribution: List<RatingDistributionRow> = (5 downTo 1).map {
        RatingDistributionRow(stars = it, count = 0, fraction = 0f)
    },
) {
    val formattedAverage: String
        get() = ReviewFormatting.formatScore(average)
}

object ReviewFormatting {
    fun formatScore(score: Double): String {
        if (!score.isFinite() || score <= 0.0) return "0.0"
        return String.format(Locale.US, "%.1f", score.coerceIn(0.0, 5.0))
    }

    fun ratingCaption(stars: Int, isRtl: Boolean): String = when (stars.coerceIn(1, 5)) {
        1 -> if (isRtl) "ضعيف" else "Poor"
        2 -> if (isRtl) "مقبول" else "Fair"
        3 -> if (isRtl) "جيد" else "Good"
        4 -> if (isRtl) "جيد جداً" else "Very Good"
        else -> if (isRtl) "ممتاز" else "Excellent"
    }

    fun localizedRatingCaption(stars: Int): String = when (stars.coerceIn(1, 5)) {
        1 -> localized("ضعيف", "Poor")
        2 -> localized("مقبول", "Fair")
        3 -> localized("جيد", "Good")
        4 -> localized("جيد جداً", "Very Good")
        else -> localized("ممتاز", "Excellent")
    }

    fun computeStats(reviews: List<ProductReview>): RatingStats {
        val published = reviews.filter { it.status == "published" }
        val total = published.size
        if (total == 0) return RatingStats()

        val counts = IntArray(6)
        var sum = 0
        for (r in published) {
            val clamped = r.rating.coerceIn(1, 5)
            counts[clamped]++
            sum += clamped
        }
        val avg = ((sum.toDouble() / total.toDouble()) * 100.0).roundToInt() / 100.0
        val dist = (5 downTo 1).map { star ->
            RatingDistributionRow(
                stars = star,
                count = counts[star],
                fraction = counts[star].toFloat() / total.toFloat(),
            )
        }
        return RatingStats(average = avg, total = total, distribution = dist)
    }
}
