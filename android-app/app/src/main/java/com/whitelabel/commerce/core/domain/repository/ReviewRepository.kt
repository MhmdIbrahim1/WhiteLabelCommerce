package com.whitelabel.commerce.core.domain.repository

import com.whitelabel.commerce.core.domain.model.ProductReview
import com.whitelabel.commerce.core.domain.model.ReviewEligibility

interface ReviewRepository {
    suspend fun getPublishedReviews(productId: String): Result<List<ProductReview>>
    suspend fun checkEligibility(productId: String): Result<ReviewEligibility>
    suspend fun submitReview(
        productId: String,
        rating: Int,
        comment: String,
    ): Result<ProductReview>
}
