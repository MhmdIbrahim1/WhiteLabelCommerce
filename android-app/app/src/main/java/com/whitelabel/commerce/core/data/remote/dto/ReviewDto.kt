package com.whitelabel.commerce.core.data.remote.dto

import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.ReviewEligibility
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProductReviewDto(
    @SerialName("id") val id: String,
    @SerialName("store_id") val storeId: String = "",
    @SerialName("product_id") val productId: String,
    @SerialName("user_id") val userId: String = "",
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("author_name") val authorName: String = "",
    @SerialName("rating") val rating: Int = 5,
    @SerialName("comment") val comment: String = "",
    @SerialName("is_verified_purchase") val isVerifiedPurchase: Boolean = true,
    @SerialName("status") val status: String = "published",
    @SerialName("admin_reply") val adminReply: String? = null,
    @SerialName("admin_replied_at") val adminRepliedAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("updated_at") val updatedAt: String = "",
) {
    fun toDomain(): ProductReview = ProductReview(
        id = id,
        storeId = storeId,
        productId = productId,
        userId = userId,
        orderId = orderId,
        authorName = authorName.ifBlank { "Verified Buyer" },
        rating = rating.coerceIn(1, 5),
        comment = comment,
        isVerifiedPurchase = isVerifiedPurchase,
        status = status,
        adminReply = adminReply?.takeIf { it.isNotBlank() },
        adminRepliedAt = adminRepliedAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}

@Serializable
data class ReviewEligibilityDto(
    @SerialName("eligible") val eligible: Boolean = false,
    @SerialName("order_id") val orderId: String? = null,
    @SerialName("existing_review") val existingReview: ProductReviewDto? = null,
) {
    fun toDomain(): ReviewEligibility = ReviewEligibility(
        eligible = eligible,
        orderId = orderId,
        existingReview = existingReview?.toDomain(),
    )
}
